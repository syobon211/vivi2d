use std::collections::BTreeSet;

use serde_json::{Value, json};
use sha2::{Digest as _, Sha256};

use crate::transport::{TransportLimits, parse_with_limits};
use crate::{
    APPROVED_EVALUATION_PAYLOAD_V1_SCHEMA_BYTES, APPROVED_EVALUATION_PAYLOAD_V1_SCHEMA_SHA256,
    EvaluationPayloadErrorKind, parse_evaluation_payload_v1,
};

const FIXTURE_BYTES: &[u8] = include_bytes!("../fixtures/evaluation-payload-v1.json");
const FIXTURE_SHA256: &str = "18e20e6ea57d92779dbce35b0be29b6902ec31ee4c659b4c7e0794c45cbe4a53";
const STAGE1_PARITY_BYTES: &[u8] = include_bytes!("../fixtures/schema-stage1-parity.json");
const STAGE1_PARITY_SHA256: &str =
    "c2fbfe959b7d7a814409e33f7257bc458303d6d80ea8226605fae3f958d4f92c";

fn fixture() -> Value {
    serde_json::from_slice(FIXTURE_BYTES).expect("tracked fixture is JSON")
}

fn valid_payload() -> Value {
    fixture()["valid"]["expectedPayload"].clone()
}

fn encoded(value: &Value) -> Vec<u8> {
    serde_json::to_vec(value).expect("test value serializes")
}

fn stage1(value: &Value) -> Result<(), crate::EvaluationPayloadError> {
    let value = crate::transport::parse(&encoded(value))?;
    crate::schema_equivalent::validate(&value)
}

fn full(
    value: &Value,
) -> Result<crate::ValidatedEvaluationPayloadV1, crate::EvaluationPayloadError> {
    parse_evaluation_payload_v1(&encoded(value), 7)
}

fn assert_payload_error(value: &Value) {
    assert_eq!(
        full(value).expect_err("payload must be rejected").kind(),
        EvaluationPayloadErrorKind::EvaluationPayload
    );
}

#[test]
fn approved_schema_and_fixture_bytes_are_exact_tracked_copies() {
    assert_eq!(APPROVED_EVALUATION_PAYLOAD_V1_SCHEMA_BYTES.len(), 33_961);
    assert_eq!(
        hex_sha256(APPROVED_EVALUATION_PAYLOAD_V1_SCHEMA_BYTES),
        APPROVED_EVALUATION_PAYLOAD_V1_SCHEMA_SHA256
    );
    assert_eq!(FIXTURE_BYTES.len(), 9_313);
    assert_eq!(hex_sha256(FIXTURE_BYTES), FIXTURE_SHA256);
    assert_eq!(STAGE1_PARITY_BYTES.len(), 13_097);
    assert_eq!(hex_sha256(STAGE1_PARITY_BYTES), STAGE1_PARITY_SHA256);
}

#[test]
fn transport_order_utf8_bom_duplicates_and_strict_json_are_fixed() {
    let tiny = TransportLimits {
        input_bytes: 3,
        container_depth: 64,
        tokens: 100,
        string_bytes: 100,
    };
    assert_eq!(
        parse_with_limits(&[0xff, 0xff, 0xff, 0xff], tiny)
            .expect_err("raw ceiling precedes UTF-8")
            .kind(),
        EvaluationPayloadErrorKind::LimitExceeded
    );
    parse_with_limits(
        b"null",
        TransportLimits {
            input_bytes: 4,
            ..tiny
        },
    )
    .expect("raw byte ceiling is inclusive");
    assert_eq!(
        parse_with_limits(b"null", tiny)
            .expect_err("one byte over the raw ceiling is rejected")
            .kind(),
        EvaluationPayloadErrorKind::LimitExceeded
    );
    for raw in [
        b"\xef\xbb\xbfnull".as_slice(),
        b"{".as_slice(),
        b"true false".as_slice(),
        b"{\"a\":1,\"a\":2}".as_slice(),
        b"{\"a\":1,\"\\u0061\":2}".as_slice(),
        &[0xff],
    ] {
        assert_eq!(
            crate::transport::parse(raw)
                .expect_err("strict transport rejects vector")
                .kind(),
            EvaluationPayloadErrorKind::EvaluationPayload
        );
    }
}

#[test]
fn transport_strict_json_malformed_lexeme_table_is_rejected() {
    let raw_control = [b'"', b'\n', b'"'];
    for raw in [
        b"01".as_slice(),
        b"-".as_slice(),
        b"1.".as_slice(),
        b"1e".as_slice(),
        b"1e+".as_slice(),
        br#""\x""#.as_slice(),
        raw_control.as_slice(),
        br#""\u00xz""#.as_slice(),
        b"[0,]".as_slice(),
        b"{\"a\":0,}".as_slice(),
    ] {
        assert_eq!(
            crate::transport::parse(raw)
                .expect_err("malformed RFC 8259 vector")
                .kind(),
            EvaluationPayloadErrorKind::EvaluationPayload
        );
    }
}

#[test]
fn transport_exact_punctuation_key_and_scalar_token_table_is_fixed() {
    const CASES: [(&[u8], usize); 6] = [
        (b"{}", 2),
        (b"[]", 2),
        (b"[0]", 3),
        (b"{\"a\":0}", 5),
        (b"{\"a\":0,\"b\":1}", 9),
        (b" \n { \"a\" : 0 } \r\n", 5),
    ];
    for (raw, tokens) in CASES {
        let limits = TransportLimits {
            input_bytes: 100,
            container_depth: 64,
            tokens,
            string_bytes: 100,
        };
        parse_with_limits(raw, limits).expect("exact token boundary accepts");
        assert_eq!(
            parse_with_limits(
                raw,
                TransportLimits {
                    tokens: tokens - 1,
                    ..limits
                },
            )
            .expect_err("one fewer token rejects")
            .kind(),
            EvaluationPayloadErrorKind::LimitExceeded
        );
    }
}

#[test]
fn transport_depth_token_and_decoded_string_boundaries_match_ts_codec() {
    let base = TransportLimits {
        input_bytes: 1_000,
        container_depth: 2,
        tokens: 10,
        string_bytes: 2,
    };
    parse_with_limits(br#"[[0]]"#, base).expect("depth two is accepted");
    assert_eq!(
        parse_with_limits(br#"[[[0]]]"#, base)
            .expect_err("depth three is rejected")
            .kind(),
        EvaluationPayloadErrorKind::LimitExceeded
    );

    let production_depth = |depth: usize| {
        let mut raw = "[".repeat(depth);
        raw.push('0');
        raw.push_str(&"]".repeat(depth));
        raw
    };
    crate::transport::parse(production_depth(64).as_bytes())
        .expect("production container depth 64 is accepted");
    assert_eq!(
        crate::transport::parse(production_depth(65).as_bytes())
            .expect_err("production container depth 65 is rejected")
            .kind(),
        EvaluationPayloadErrorKind::LimitExceeded
    );

    // { key : [ true , null ] } = nine punctuation/key/scalar tokens.
    parse_with_limits(
        br#"{"a":[true,null]}"#,
        TransportLimits { tokens: 9, ..base },
    )
    .expect("nine tokens are accepted");
    assert_eq!(
        parse_with_limits(
            br#"{"a":[true,null]}"#,
            TransportLimits { tokens: 8, ..base },
        )
        .expect_err("the ninth-token boundary is exact")
        .kind(),
        EvaluationPayloadErrorKind::LimitExceeded
    );
    parse_with_limits(br#""\u00e9""#, base).expect("two decoded UTF-8 bytes fit");
    assert_eq!(
        parse_with_limits(
            br#""\u00e9""#,
            TransportLimits {
                string_bytes: 1,
                ..base
            },
        )
        .expect_err("decoded string byte ceiling is enforced")
        .kind(),
        EvaluationPayloadErrorKind::LimitExceeded
    );
}

#[test]
fn transport_unicode_surrogate_pair_is_accepted_and_lone_surrogates_are_rejected() {
    let pair = crate::transport::parse(br#""\ud83d\ude00""#).expect("pair is valid");
    assert_eq!(pair, Value::String("\u{1f600}".to_owned()));
    for raw in [br#""\ud800""#.as_slice(), br#""\udc00""#.as_slice()] {
        assert_eq!(
            crate::transport::parse(raw)
                .expect_err("lone surrogate is invalid")
                .kind(),
            EvaluationPayloadErrorKind::EvaluationPayload
        );
    }
}

#[test]
fn transport_numbers_are_finite_binary64_and_negative_zero_is_canonical() {
    let value = crate::transport::parse(
        br#"{"rounded":9007199254740993,"large":1e300,"subnormal":5e-324,"zero":-0}"#,
    )
    .expect("finite binary64 values parse");
    assert_eq!(value["rounded"].as_f64(), Some(9_007_199_254_740_992.0));
    assert_eq!(value["large"].as_f64(), Some(1e300));
    assert!(value["subnormal"].as_f64().is_some_and(|value| value > 0.0));
    assert!(value["zero"].as_f64().is_some_and(f64::is_sign_positive));
    assert_eq!(
        crate::transport::parse(b"1e400")
            .expect_err("non-finite spelling is rejected")
            .kind(),
        EvaluationPayloadErrorKind::EvaluationPayload
    );
}

#[test]
fn schema_keyword_inventory_and_closed_stage1_are_pinned() {
    let schema: Value =
        serde_json::from_slice(APPROVED_EVALUATION_PAYLOAD_V1_SCHEMA_BYTES).expect("schema parses");
    let expected = BTreeSet::from([
        "$ref",
        "additionalProperties",
        "anyOf",
        "const",
        "contains",
        "enum",
        "exclusiveMinimum",
        "items",
        "maxItems",
        "maximum",
        "minContains",
        "minItems",
        "minimum",
        "not",
        "oneOf",
        "pattern",
        "patternProperties",
        "prefixItems",
        "properties",
        "required",
        "type",
        "uniqueItems",
    ]);
    let mut found = BTreeSet::new();
    collect_schema_keywords(&schema, &expected, &mut found);
    assert_eq!(found, expected);
    stage1(&valid_payload()).expect("approved fixture passes Stage 1");

    let mut unknown = valid_payload();
    unknown
        .as_object_mut()
        .expect("root object")
        .insert("solver".to_owned(), Value::Bool(true));
    assert_eq!(
        stage1(&unknown)
            .expect_err("closed root rejects unknown structural member")
            .kind(),
        EvaluationPayloadErrorKind::EvaluationPayload
    );
}

#[test]
fn tracked_stage1_keyword_boundary_parity_corpus_matches_rust_validator() {
    let corpus: Value = serde_json::from_slice(STAGE1_PARITY_BYTES).expect("parity fixture JSON");
    assert_eq!(corpus["schema"], "vivi2d.nativeEvaluationStage1Parity.v1");
    let vectors = corpus["vectors"].as_array().expect("vectors array");
    assert_eq!(vectors.len(), 59);
    for vector in vectors {
        let id = vector["id"].as_str().expect("vector id");
        let mut payload = vector["mutation"]
            .as_str()
            .map_or_else(valid_payload, stage1_mutation_vector);
        for patch in vector["patches"].as_array().expect("patches") {
            apply_patch(&mut payload, patch);
        }
        let accepted = stage1(&payload).is_ok();
        assert_eq!(
            accepted,
            vector["expectedStage1"].as_bool().expect("expectedStage1"),
            "Stage 1 parity vector {id}"
        );
        if vector["expectedStage2"] == "evaluation-payload" {
            assert_payload_error(&payload);
        }
    }
}

#[test]
fn tracked_raw_number_lexemes_match_binary64_stage1_semantics() {
    const SENTINEL: &str = "__VIVI_RAW_NUMBER_SENTINEL__";
    let corpus: Value = serde_json::from_slice(STAGE1_PARITY_BYTES).expect("parity fixture JSON");
    let vectors = corpus["rawVectors"].as_array().expect("rawVectors array");
    assert_eq!(vectors.len(), 4);
    for vector in vectors {
        let id = vector["id"].as_str().expect("raw vector id");
        let path = vector["path"].as_str().expect("raw vector path");
        let mut payload = valid_payload();
        *payload.pointer_mut(path).expect("raw vector path exists") = json!(SENTINEL);
        let template = serde_json::to_string(&payload).expect("raw template serializes");
        let quoted = format!("\"{SENTINEL}\"");
        assert_eq!(template.matches(&quoted).count(), 1);
        let raw = template.replace(
            &quoted,
            vector["rawNumber"].as_str().expect("raw number spelling"),
        );
        let normalized = crate::transport::parse(raw.as_bytes())
            .unwrap_or_else(|error| panic!("{id} transport failed: {error:?}"));
        assert_eq!(
            normalized.pointer(path).and_then(Value::as_f64),
            vector["expectedNormalized"].as_f64(),
            "normalized value for {id}"
        );
        let accepted = crate::schema_equivalent::validate(&normalized).is_ok();
        assert_eq!(
            accepted,
            vector["expectedStage1"].as_bool().expect("expectedStage1"),
            "Stage 1 raw vector {id}"
        );
    }
}

#[test]
fn stage1_accepts_all_14_x_vivi_unique_by_duplicates_then_stage2_rejects() {
    const CASES: [&str; 14] = [
        "duplicate-layer-id",
        "duplicate-parameter-id",
        "duplicate-binding-id",
        "duplicate-ik-controller-id",
        "duplicate-physics-group-id",
        "duplicate-collider-id",
        "duplicate-expression-preset-id",
        "duplicate-clip-id",
        "duplicate-state-machine-id",
        "duplicate-clip-mask-layer-id",
        "duplicate-state-id",
        "duplicate-transition-id",
        "duplicate-atlas-id",
        "duplicate-atlas-entry-layer-id",
    ];
    for id in CASES {
        let value = duplicate_unique_by_vector(id);
        stage1(&value).unwrap_or_else(|error| panic!("{id} must pass Stage 1: {error:?}"));
        assert_payload_error(&value);
    }
}

#[test]
fn valid_fixture_candidate_preserves_generation_inventory_and_redacts_debug() {
    for generation in [0, 1, 9_007_199_254_740_991, 9_007_199_254_740_992, u64::MAX] {
        let candidate = parse_evaluation_payload_v1(&encoded(&valid_payload()), generation)
            .expect("valid fixture loads");
        assert_eq!(candidate.request_generation(), generation);
        assert_eq!(candidate.value()["schema"], "vivi2d.evaluationPayload.v1");
        assert_eq!(candidate.texture_bindings().len(), 1);
        let binding = &candidate.texture_bindings()[0];
        assert_eq!(binding.id(), "atlas:body_atlas");
        assert_eq!((binding.width(), binding.height()), (1, 1));
        let debug = format!("{candidate:?} {binding:?}");
        assert!(!debug.contains("body_atlas"));
        assert!(!debug.contains("mesh-body"));
    }
}

#[test]
fn errors_are_fixed_status_mapped_and_redacted() {
    let raw = br#"{"secret-identifier":1,"secret-identifier":2}"#;
    let error = parse_evaluation_payload_v1(raw, 0).expect_err("duplicate rejected");
    assert_eq!(error.kind(), EvaluationPayloadErrorKind::EvaluationPayload);
    assert_eq!(error.status(), 14);
    let rendered = format!("{error} {error:?}");
    assert!(!rendered.contains("secret-identifier"));
    assert!(std::error::Error::source(&error).is_none());
    assert_eq!(EvaluationPayloadErrorKind::LimitExceeded.status(), 6);
    assert_eq!(EvaluationPayloadErrorKind::UnsupportedOperation.status(), 2);
    assert_eq!(EvaluationPayloadErrorKind::Internal.status(), 10);
}

#[test]
fn stage2_rejects_all_eight_tracked_incomplete_payload_vectors() {
    let data = fixture();
    let incomplete = data["incomplete"].as_array().expect("incomplete vectors");
    assert_eq!(incomplete.len(), 8);
    for vector in incomplete {
        let id = vector["id"].as_str().expect("incomplete id");
        let mut payload = data["valid"]["expectedPayload"].clone();
        for patch in vector["patch"].as_array().expect("fixture patches") {
            apply_patch(&mut payload, patch);
        }
        assert_eq!(
            full(&payload)
                .expect_err("incomplete vector is rejected")
                .kind(),
            EvaluationPayloadErrorKind::EvaluationPayload,
            "incomplete vector {id}"
        );
    }
}

#[test]
fn stage2_atlas_mesh_exact_coverage_bounds_aggregate_and_binding_order_are_fixed() {
    let mut ordered = valid_payload();
    let second = mesh_layer("mesh-z");
    ordered["layers"]
        .as_array_mut()
        .expect("layers")
        .push(second);
    ordered["atlases"] = json!([atlas("z", "mesh-z", 2, 3), atlas("a", "mesh-body", 4, 5)]);
    let candidate = full(&ordered).expect("two-atlas payload is valid");
    let bindings = candidate.texture_bindings();
    assert_eq!(bindings.len(), 2);
    assert_eq!(bindings[0].id(), "atlas:a");
    assert_eq!((bindings[0].width(), bindings[0].height()), (4, 5));
    assert_eq!(bindings[1].id(), "atlas:z");
    assert_eq!((bindings[1].width(), bindings[1].height()), (2, 3));

    let mut empty_and_case = valid_payload();
    empty_and_case["atlases"]
        .as_array_mut()
        .expect("atlases")
        .extend([
            json!({ "id": "A", "width": 1, "height": 1, "entries": [] }),
            json!({ "id": "a", "width": 1, "height": 1, "entries": [] }),
        ]);
    let candidate = full(&empty_and_case).expect("extra empty and case-distinct atlases pass");
    assert_eq!(
        candidate
            .texture_bindings()
            .iter()
            .map(|binding| binding.id())
            .collect::<Vec<_>>(),
        ["atlas:A", "atlas:a", "atlas:body_atlas"]
    );

    let mut zero_entry = valid_payload();
    zero_entry["atlases"][0]["entries"][0]["width"] = json!(0);
    zero_entry["atlases"][0]["entries"][0]["height"] = json!(0);
    full(&zero_entry).expect("zero-sized atlas entries are accepted");

    let mut missing = valid_payload();
    missing["atlases"][0]["entries"] = json!([]);
    assert_payload_error(&missing);

    let mut unknown = valid_payload();
    unknown["atlases"][0]["entries"][0]["layerId"] = json!("missing-mesh");
    assert_payload_error(&unknown);

    let mut bounds = valid_payload();
    bounds["atlases"][0]["entries"][0]["x"] = json!(1);
    assert_payload_error(&bounds);

    let mut vertical_bounds = valid_payload();
    vertical_bounds["atlases"][0]["entries"][0]["y"] = json!(1);
    assert_payload_error(&vertical_bounds);

    let mut non_mesh = valid_payload();
    non_mesh["layers"]
        .as_array_mut()
        .expect("layers")
        .push(group_layer("group"));
    non_mesh["atlases"][0]["entries"][0]["layerId"] = json!("group");
    assert_payload_error(&non_mesh);

    let mut duplicate_across_atlases = ordered.clone();
    duplicate_across_atlases["atlases"][0]["entries"][0]["layerId"] = json!("mesh-body");
    assert_payload_error(&duplicate_across_atlases);

    let mut maximum = valid_payload();
    maximum["atlases"] = json!([atlas("full", "mesh-body", 8192, 8192)]);
    full(&maximum).expect("one 256 MiB declared atlas is the inclusive boundary");

    let mut aggregate = maximum;
    aggregate["layers"]
        .as_array_mut()
        .expect("layers")
        .push(mesh_layer("mesh-second"));
    aggregate["atlases"]
        .as_array_mut()
        .expect("atlases")
        .push(atlas("second", "mesh-second", 8192, 8192));
    assert_eq!(
        full(&aggregate)
            .expect_err("aggregate RGBA ceiling is enforced")
            .kind(),
        EvaluationPayloadErrorKind::LimitExceeded
    );
}

#[test]
fn stage2_mesh_shape_indices_and_wasm_large_index_class_are_fixed() {
    let mut huge_index = valid_payload();
    huge_index["layers"][0]["mesh"]["indices"] = json!([0, 1, 4_294_967_296_u64]);
    assert_payload_error(&huge_index);

    let mut safe_max_index = valid_payload();
    safe_max_index["layers"][0]["mesh"]["indices"] = json!([0, 1, 9_007_199_254_740_991_u64]);
    assert_payload_error(&safe_max_index);

    let mut above_safe_index = valid_payload();
    above_safe_index["layers"][0]["mesh"]["indices"] = json!([0, 1, 9_007_199_254_740_992_f64]);
    assert_payload_error(&above_safe_index);

    let mut enormous_index = valid_payload();
    enormous_index["layers"][0]["mesh"]["indices"] = json!([0, 1, 1e300]);
    assert_payload_error(&enormous_index);
}

#[test]
fn stage2_mesh_global_1024_1025_boundary_is_fixed() {
    let mut payload = valid_payload();
    let mut layers = Vec::new();
    let mut entries = Vec::new();
    layers.try_reserve(1_025).expect("mesh boundary layers");
    entries.try_reserve(1_025).expect("mesh boundary entries");
    for index in 0..1_024 {
        let id = format!("mesh-{index}");
        layers.push(mesh_layer(&id));
        entries.push(atlas_entry(&id));
    }
    payload["layers"] = Value::Array(layers);
    payload["atlases"] = json!([{
        "id": "all-meshes",
        "width": 1,
        "height": 1,
        "entries": entries
    }]);
    full(&payload).expect("1024 meshes is the inclusive boundary");
    payload["layers"]
        .as_array_mut()
        .expect("layers")
        .push(mesh_layer("mesh-over"));
    assert_eq!(
        full(&payload)
            .expect_err("1025 meshes exceeds the global ceiling")
            .kind(),
        EvaluationPayloadErrorKind::LimitExceeded
    );
}

#[test]
fn stage2_single_mesh_max_vertices_and_indices_shape_is_accepted() {
    let mut payload = valid_payload();
    payload["layers"][0]["mesh"]["vertices"] = Value::Array(vec![json!(0); 65_536 * 2]);
    payload["layers"][0]["mesh"]["uvs"] = Value::Array(vec![json!(0); 65_536 * 2]);
    payload["layers"][0]["mesh"]["indices"] = Value::Array(vec![json!(0); 196_608]);
    full(&payload).expect("maximum vertex and index shape is accepted");
}

#[test]
fn stage2_mask_cycle_depth_eight_nine_shared_dag_and_invert_are_fixed() {
    full(&mask_chain(8)).expect("active mask depth eight is accepted");
    assert_eq!(
        full(&mask_chain(9))
            .expect_err("active mask depth nine is rejected")
            .kind(),
        EvaluationPayloadErrorKind::LimitExceeded
    );

    let mut cycle = mask_chain(2);
    cycle["layers"][2]["clipMaskIds"] = json!(["mask-0"]);
    for layer in cycle["layers"].as_array_mut().expect("layers") {
        layer["visible"] = json!(false);
    }
    assert_payload_error(&cycle);

    let mut self_cycle = valid_payload();
    self_cycle["layers"][0]["clipMaskIds"] = json!(["mesh-body"]);
    assert_payload_error(&self_cycle);

    let mut missing_target = valid_payload();
    missing_target["layers"][0]["clipMaskIds"] = json!(["missing"]);
    assert_payload_error(&missing_target);

    let mut non_mesh_target = valid_payload();
    non_mesh_target["layers"]
        .as_array_mut()
        .expect("layers")
        .push(group_layer("group-mask"));
    non_mesh_target["layers"][0]["clipMaskIds"] = json!(["group-mask"]);
    assert_payload_error(&non_mesh_target);

    let mut shared = valid_payload();
    let mut left = mesh_layer("left");
    left["clipMaskIds"] = json!(["mesh-body"]);
    let mut right = mesh_layer("right");
    right["clipMaskIds"] = json!(["mesh-body"]);
    shared["layers"]
        .as_array_mut()
        .expect("layers")
        .extend([left, right]);
    shared["atlases"][0]["entries"] = json!([
        atlas_entry("mesh-body"),
        atlas_entry("left"),
        atlas_entry("right")
    ]);
    full(&shared).expect("a shared acyclic mask DAG is accepted");

    let mut inverted = valid_payload();
    let mut consumer = group_layer("consumer");
    consumer["clipMasks"] = json!([{ "layerId": "mesh-body", "invert": true }]);
    inverted["layers"]
        .as_array_mut()
        .expect("layers")
        .push(consumer);
    let candidate = full(&inverted).expect("inverted mask edge is preserved by preflight");
    assert_eq!(
        candidate.value()["layers"][1]["clipMasks"][0]["invert"],
        true
    );
}

#[test]
fn stage2_bone_parent_missing_cycle_and_global_1024_boundary_are_fixed() {
    let mut valid = valid_payload();
    let root = bone_layer("bone-root", None);
    let child = bone_layer("bone-child", Some("bone-root"));
    valid["layers"]
        .as_array_mut()
        .expect("layers")
        .extend([root, child]);
    full(&valid).expect("valid bone parent chain is accepted");

    let mut missing = valid.clone();
    missing["layers"][2]["parentBoneId"] = json!("missing-bone");
    assert_payload_error(&missing);

    let mut cycle = valid;
    cycle["layers"][1]["parentBoneId"] = json!("bone-child");
    assert_payload_error(&cycle);

    let mut boundary = valid_payload();
    let bones = boundary["layers"].as_array_mut().expect("layers");
    bones
        .try_reserve(1_025)
        .expect("test allocation for bone boundary");
    for index in 0..1_024 {
        let parent = (index > 0).then(|| format!("bone-{}", index - 1));
        bones.push(bone_layer(&format!("bone-{index}"), parent.as_deref()));
    }
    full(&boundary).expect("1024 bones is the inclusive boundary");
    boundary["layers"]
        .as_array_mut()
        .expect("layers")
        .push(bone_layer("bone-over", None));
    assert_eq!(
        full(&boundary)
            .expect_err("1025 bones exceeds the global ceiling")
            .kind(),
        EvaluationPayloadErrorKind::LimitExceeded
    );
}

#[test]
fn stage2_all_reference_families_are_checked_before_unsupported_classification() {
    assert_eq!(
        full(&rich_payload())
            .expect_err("valid clips/state machines are not implemented")
            .kind(),
        EvaluationPayloadErrorKind::UnsupportedOperation
    );
    const CASES: [&str; 29] = [
        "paired-parameter",
        "ik-bone-chain",
        "ik-mapping-bone",
        "ik-mapping-parameter",
        "binding-parameter",
        "binding-bone",
        "binding-controller",
        "skin-mesh",
        "skin-weight-bone",
        "skin-bind-pose-bone",
        "physics-input-parameter",
        "physics-output-parameter",
        "physics-output-bone",
        "collider-mesh",
        "expression-parameter",
        "clip-track-parameter",
        "clip-bone-track-bone",
        "clip-image-track-mesh",
        "clip-lipsync-audio",
        "clip-lipsync-parameter",
        "clip-ik-controller",
        "machine-initial-state",
        "state-clip",
        "blend-tree-parameter",
        "blend-tree-clip",
        "transition-from-state",
        "transition-to-state",
        "transition-condition-parameter",
        "atlas-entry-mesh",
    ];
    for id in CASES {
        let mut payload = rich_payload();
        mutate_missing_reference(&mut payload, id);
        assert_eq!(
            full(&payload)
                .expect_err("missing reference must precede unsupported")
                .kind(),
            EvaluationPayloadErrorKind::EvaluationPayload,
            "reference vector {id}"
        );
    }
}

#[test]
fn stage2_skin_parity_sparse_bind_pose_weights_and_duplicate_lipsync_ids_are_fixed() {
    let mut valid = rich_payload();
    valid["clips"] = json!([]);
    valid["stateMachines"] = json!([]);
    full(&valid).expect("complete skin is accepted");

    let mut sparse = valid.clone();
    sparse["skins"]["mesh-body"]["bindPoseInverse"] = json!({});
    full(&sparse).expect("sparse bind poses are accepted");

    let mut duplicate_bone_weights = valid.clone();
    duplicate_bone_weights["skins"]["mesh-body"]["weights"][0] = json!([
        { "boneId": "bone-root", "weight": 0.5 },
        { "boneId": "bone-root", "weight": 0.5 }
    ]);
    full(&duplicate_bone_weights).expect("duplicate bone IDs in one normalized row are accepted");

    let mut within_tolerance = valid.clone();
    within_tolerance["skins"]["mesh-body"]["weights"][0][0]["weight"] = json!(0.999_999_5);
    full(&within_tolerance).expect("weight sum error of 0.0000005 is accepted");

    let mut outside_tolerance = valid.clone();
    outside_tolerance["skins"]["mesh-body"]["weights"][0][0]["weight"] = json!(0.999_998);
    assert_payload_error(&outside_tolerance);

    let mut row_count = valid.clone();
    row_count["skins"]["mesh-body"]["weights"] = json!([]);
    assert_payload_error(&row_count);

    let mut empty_row = valid.clone();
    empty_row["skins"]["mesh-body"]["weights"][0] = json!([]);
    assert_payload_error(&empty_row);

    let mut bad_sum = valid.clone();
    bad_sum["skins"]["mesh-body"]["weights"][0][0]["weight"] = json!(0.5);
    assert_payload_error(&bad_sum);

    let mut out_of_range = valid;
    out_of_range["skins"]["mesh-body"]["weights"][0][0]["weight"] = json!(1.5);
    assert_payload_error(&out_of_range);

    let mut duplicate_lipsync = rich_payload();
    let track = duplicate_lipsync["clips"][0]["lipSyncTracks"][0].clone();
    duplicate_lipsync["clips"][0]["lipSyncTracks"] = json!([track.clone(), track]);
    assert_eq!(
        full(&duplicate_lipsync)
            .expect_err("runtime clip execution is unsupported")
            .kind(),
        EvaluationPayloadErrorKind::UnsupportedOperation
    );

    let mut duplicate_audio = rich_payload();
    let audio = duplicate_audio["clips"][0]["audioTracks"][0].clone();
    duplicate_audio["clips"][0]["audioTracks"] = json!([audio.clone(), audio]);
    assert_payload_error(&duplicate_audio);
}

#[test]
fn stage2_parameter_range_self_pair_and_physics_pendulum_index_are_fixed() {
    let mut parameters = valid_payload();
    parameters["parameters"][0]["minValue"] = json!(1);
    parameters["parameters"][0]["defaultValue"] = json!(1);
    parameters["parameters"][0]["maxValue"] = json!(1);
    parameters["parameters"][0]["pairedParameterId"] = json!("vivi.head.yaw");
    full(&parameters).expect("equal range and self pairing are accepted");
    parameters["parameters"][0]["defaultValue"] = json!(2);
    assert_payload_error(&parameters);

    let mut physics = rich_payload();
    physics["clips"] = json!([]);
    physics["stateMachines"] = json!([]);
    physics["physicsGroups"][0]["outputs"][0]["pendulumIndex"] = json!(1);
    assert_payload_error(&physics);
    physics["physicsGroups"][0]["outputs"][0]["pendulumIndex"] = json!(9_007_199_254_740_991_u64);
    assert_payload_error(&physics);
}

#[test]
fn stage2_binding_points_and_recursive_layer_global_boundaries_are_fixed() {
    let mut payload = rich_payload();
    payload["clips"] = json!([]);
    payload["stateMachines"] = json!([]);
    let point = json!({ "paramValue": 0, "targetValue": 0 });
    payload["parameterBindings"][0]["bindingPoints"] = Value::Array(vec![point.clone(); 4_096]);
    let mut second_binding = payload["parameterBindings"][0].clone();
    second_binding["id"] = json!("binding-second");
    second_binding["bindingPoints"] = Value::Array(vec![point.clone(); 4_096]);
    payload["parameterBindings"]
        .as_array_mut()
        .expect("bindings")
        .push(second_binding);
    full(&payload).expect("8192 aggregate binding points is accepted");
    payload["parameterBindings"][1]["bindingPoints"]
        .as_array_mut()
        .expect("binding points")
        .push(point);
    assert_eq!(
        full(&payload)
            .expect_err("8193 aggregate binding points is rejected")
            .kind(),
        EvaluationPayloadErrorKind::LimitExceeded
    );

    let mut recursive = valid_payload();
    let mut root_group = group_layer("root-group");
    let mut children = Vec::new();
    children
        .try_reserve(4_095)
        .expect("test recursive layer allocation");
    for index in 0..4_094 {
        children.push(group_layer(&format!("group-{index}")));
    }
    root_group["children"] = Value::Array(children);
    recursive["layers"]
        .as_array_mut()
        .expect("layers")
        .push(root_group);
    full(&recursive).expect("4096 recursive layers is accepted");
    recursive["layers"][1]["children"]
        .as_array_mut()
        .expect("children")
        .push(group_layer("group-over"));
    assert_eq!(
        full(&recursive)
            .expect_err("4097 recursive layers exceeds the global ceiling")
            .kind(),
        EvaluationPayloadErrorKind::LimitExceeded
    );
}

#[test]
fn stage2_preserves_all_finite_binary64_and_all_13_blend_modes_without_lowering() {
    const MODES: [&str; 13] = [
        "normal",
        "add",
        "multiply",
        "screen",
        "overlay",
        "darken",
        "lighten",
        "color-dodge",
        "color-burn",
        "hard-light",
        "soft-light",
        "difference",
        "exclusion",
    ];
    for mode in MODES {
        let mut payload = valid_payload();
        payload["layers"][0]["blendMode"] = json!(mode);
        payload["layers"][0]["opacity"] = json!(1e300);
        payload["layers"][0]["height"] = json!(f64::MAX);
        payload["layers"][0]["x"] = json!(-0.0);
        let candidate = full(&payload).expect("finite binary64 and approved blend pass preflight");
        assert_eq!(candidate.value()["layers"][0]["blendMode"], mode);
        assert_eq!(
            candidate.value()["layers"][0]["opacity"].as_f64(),
            Some(1e300)
        );
        assert_eq!(
            candidate.value()["layers"][0]["height"].as_f64(),
            Some(f64::MAX)
        );
        assert!(
            candidate.value()["layers"][0]["x"]
                .as_f64()
                .is_some_and(f64::is_sign_positive)
        );
    }
}

#[test]
fn stage2_nonempty_clip_and_state_machine_unsupported_order_is_fixed() {
    let mut clip = valid_payload();
    clip["clips"] = json!([minimal_clip("clip")]);
    assert_eq!(
        full(&clip).expect_err("valid clip is unsupported").kind(),
        EvaluationPayloadErrorKind::UnsupportedOperation
    );
    clip["clips"][0]["tracks"] = json!([{
        "parameterId": "missing",
        "keyframes": []
    }]);
    assert_payload_error(&clip);

    let mut machine = valid_payload();
    machine["stateMachines"] = json!([minimal_machine("machine")]);
    assert_eq!(
        full(&machine)
            .expect_err("valid state machine is unsupported")
            .kind(),
        EvaluationPayloadErrorKind::UnsupportedOperation
    );
    machine["stateMachines"][0]["initialStateId"] = json!("missing");
    assert_payload_error(&machine);
}

#[test]
fn stage2_opaque_domain_map_keys_remain_identifiers_not_structural_markers() {
    let mut payload = valid_payload();
    payload["layers"] = json!([mesh_layer("solver"), bone_layer("previewOnly", None)]);
    payload["parameters"] = json!([{
        "id": "blendShapes",
        "name": "Opaque",
        "minValue": 0,
        "maxValue": 1,
        "defaultValue": 0
    }]);
    payload["skins"] = json!({
        "solver": {
            "weights": [
                [{ "boneId": "previewOnly", "weight": 1 }],
                [{ "boneId": "previewOnly", "weight": 1 }],
                [{ "boneId": "previewOnly", "weight": 1 }]
            ],
            "bindPoseInverse": { "previewOnly": [1, 0, 0, 1, 0, 0] }
        }
    });
    payload["expressionPresets"] = json!([{
        "id": "expression",
        "name": "Opaque",
        "values": { "blendShapes": 1 }
    }]);
    payload["atlases"] = json!([atlas("opaque", "solver", 1, 1)]);
    full(&payload).expect("opaque forbidden-looking identifier spellings are valid data");
}

fn hex_sha256(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn collect_schema_keywords<'a>(
    value: &'a Value,
    inventory: &BTreeSet<&'a str>,
    found: &mut BTreeSet<&'a str>,
) {
    match value {
        Value::Array(values) => {
            for value in values {
                collect_schema_keywords(value, inventory, found);
            }
        }
        Value::Object(values) => {
            for (key, value) in values {
                if inventory.contains(key.as_str()) {
                    found.insert(key);
                }
                collect_schema_keywords(value, inventory, found);
            }
        }
        _ => {}
    }
}

fn duplicate_unique_by_vector(id: &str) -> Value {
    let mut value = valid_payload();
    match id {
        "duplicate-layer-id" => duplicate_first(&mut value, "layers"),
        "duplicate-parameter-id" => duplicate_first(&mut value, "parameters"),
        "duplicate-binding-id" => {
            value["ikControllers"] = json!([minimal_controller("controller")]);
            let binding = json!({
                "id": "binding",
                "parameterId": "vivi.head.yaw",
                "target": {
                    "type": "ikController",
                    "controllerId": "controller",
                    "property": "targetX"
                },
                "bindingPoints": []
            });
            value["parameterBindings"] = json!([binding.clone(), binding]);
        }
        "duplicate-ik-controller-id" => {
            let controller = minimal_controller("controller");
            value["ikControllers"] = json!([controller.clone(), controller]);
        }
        "duplicate-physics-group-id" => {
            let group = json!({
                "id": "physics",
                "name": "Physics",
                "enabled": true,
                "pendulums": [],
                "inputs": [],
                "outputs": [],
                "gravityDirection": 0,
                "gravityStrength": 0,
                "wind": 0
            });
            value["physicsGroups"] = json!([group.clone(), group]);
        }
        "duplicate-collider-id" => {
            let collider = json!({
                "id": "collider",
                "name": "Collider",
                "shape": { "type": "circle", "x": 0, "y": 0, "radius": 1 },
                "enabled": true
            });
            value["colliders"] = json!([collider.clone(), collider]);
        }
        "duplicate-expression-preset-id" => {
            let preset = json!({ "id": "expression", "name": "Expression", "values": {} });
            value["expressionPresets"] = json!([preset.clone(), preset]);
        }
        "duplicate-clip-id" => {
            let clip = minimal_clip("clip");
            value["clips"] = json!([clip.clone(), clip]);
        }
        "duplicate-state-machine-id" => {
            let machine = minimal_machine("machine");
            value["stateMachines"] = json!([machine.clone(), machine]);
        }
        "duplicate-clip-mask-layer-id" => {
            value["layers"][0]["clipMasks"] = json!([
                { "layerId": "mesh-body", "invert": true },
                { "layerId": "mesh-body", "invert": false }
            ]);
        }
        "duplicate-state-id" => {
            let mut machine = minimal_machine("machine");
            let state = machine["states"][0].clone();
            machine["states"] = json!([state.clone(), state]);
            value["stateMachines"] = json!([machine]);
        }
        "duplicate-transition-id" => {
            let mut machine = minimal_machine("machine");
            let transition = json!({
                "id": "transition",
                "fromStateId": "state",
                "toStateId": "state",
                "conditions": [],
                "transitionDuration": 0,
                "priority": 0
            });
            machine["transitions"] = json!([transition.clone(), transition]);
            value["stateMachines"] = json!([machine]);
        }
        "duplicate-atlas-id" => duplicate_first(&mut value, "atlases"),
        "duplicate-atlas-entry-layer-id" => {
            let mut second_mesh = value["layers"][0].clone();
            second_mesh["id"] = json!("mesh-other");
            value["layers"]
                .as_array_mut()
                .expect("layers")
                .push(second_mesh);
            let entry = value["atlases"][0]["entries"][0].clone();
            value["atlases"][0]["entries"] = json!([entry.clone(), entry]);
        }
        _ => panic!("unknown duplicate vector {id}"),
    }
    value
}

fn stage1_mutation_vector(id: &str) -> Value {
    match id {
        "any-of-null-accept" | "any-of-neither-reject" => {
            let mut payload = valid_payload();
            let target = if id == "any-of-null-accept" {
                Value::Null
            } else {
                Value::Bool(false)
            };
            payload["clips"] = json!([{
                "id": "clip",
                "name": "Clip",
                "duration": 0,
                "fps": 1,
                "tracks": [],
                "audioTracks": [{
                    "id": "audio",
                    "name": "Audio",
                    "sourcePath": "",
                    "startFrame": 0,
                    "sourceDurationSeconds": null,
                    "gain": 1,
                    "muted": false
                }],
                "lipSyncTracks": [{
                    "id": "lipsync",
                    "name": "Lip Sync",
                    "sourceAudioTrackId": "audio",
                    "analysisType": "rms",
                    "analysisFps": 1,
                    "samples": [],
                    "targetParameterId": target,
                    "sourcePathAtBake": "",
                    "sourceDurationSecondsAtBake": null,
                    "gain": 1,
                    "muted": false
                }]
            }]);
            payload
        }
        "pattern-simple-128-accept" | "pattern-simple-129-reject" => {
            let mut payload = valid_payload();
            let length = if id.ends_with("128-accept") { 128 } else { 129 };
            payload["layers"][0]["id"] = json!("a".repeat(length));
            payload
        }
        "pattern-parameter-128-accept" | "pattern-parameter-129-reject" => {
            let mut payload = valid_payload();
            let length = if id.ends_with("128-accept") { 128 } else { 129 };
            payload["parameters"][0]["id"] = json!(format!("p.{}", "a".repeat(length - 2)));
            payload
        }
        "max-items-atlases-33-reject" => {
            let mut payload = valid_payload();
            let atlases = (0..33)
                .map(|index| {
                    json!({
                        "id": format!("atlas-{index}"),
                        "width": 1,
                        "height": 1,
                        "entries": []
                    })
                })
                .collect();
            payload["atlases"] = Value::Array(atlases);
            payload
        }
        _ => duplicate_unique_by_vector(id),
    }
}

fn duplicate_first(value: &mut Value, property: &str) {
    let values = value[property].as_array_mut().expect("array property");
    let first = values.first().expect("nonempty vector").clone();
    values.push(first);
}

fn minimal_controller(id: &str) -> Value {
    json!({
        "id": id,
        "name": "Controller",
        "solverType": "ccd",
        "boneChain": [],
        "targetX": 0,
        "targetY": 0,
        "influence": 1,
        "parameterMappings": []
    })
}

fn minimal_clip(id: &str) -> Value {
    json!({ "id": id, "name": "Clip", "duration": 0, "fps": 1, "tracks": [] })
}

fn minimal_machine(id: &str) -> Value {
    json!({
        "id": id,
        "name": "Machine",
        "states": [{ "id": "state", "name": "State", "loop": true }],
        "transitions": [],
        "initialStateId": "state",
        "enabled": true
    })
}

fn mesh_layer(id: &str) -> Value {
    let mut layer = valid_payload()["layers"][0].clone();
    layer["id"] = json!(id);
    layer
}

fn atlas(id: &str, mesh_id: &str, width: u32, height: u32) -> Value {
    json!({
        "id": id,
        "width": width,
        "height": height,
        "entries": [{
            "layerId": mesh_id,
            "x": 0,
            "y": 0,
            "width": width,
            "height": height
        }]
    })
}

fn atlas_entry(mesh_id: &str) -> Value {
    json!({ "layerId": mesh_id, "x": 0, "y": 0, "width": 1, "height": 1 })
}

fn group_layer(id: &str) -> Value {
    let mut layer = mesh_layer(id);
    layer["kind"] = json!("group");
    layer.as_object_mut().expect("layer").remove("mesh");
    layer
}

fn bone_layer(id: &str, parent: Option<&str>) -> Value {
    let mut layer = mesh_layer(id);
    layer["kind"] = json!("bone");
    let object = layer.as_object_mut().expect("layer");
    object.remove("mesh");
    object.insert(
        "bone".to_owned(),
        json!({ "angle": 0, "length": 1, "scaleX": 1, "scaleY": 1 }),
    );
    if let Some(parent) = parent {
        object.insert("parentBoneId".to_owned(), json!(parent));
    }
    layer
}

fn mask_chain(edges: usize) -> Value {
    let mut payload = valid_payload();
    let mut layers = Vec::new();
    layers.try_reserve(edges + 1).expect("mask test layers");
    let mut entries = Vec::new();
    entries.try_reserve(edges + 1).expect("mask test entries");
    for index in 0..=edges {
        let id = format!("mask-{index}");
        let mut layer = mesh_layer(&id);
        if index < edges {
            layer["clipMaskIds"] = json!([format!("mask-{}", index + 1)]);
        }
        entries.push(atlas_entry(&id));
        layers.push(layer);
    }
    payload["layers"] = Value::Array(layers);
    payload["atlases"] = json!([{
        "id": "masks",
        "width": 1,
        "height": 1,
        "entries": entries
    }]);
    payload
}

fn rich_payload() -> Value {
    let mut payload = valid_payload();
    payload["layers"]
        .as_array_mut()
        .expect("layers")
        .push(bone_layer("bone-root", None));
    payload["parameters"]
        .as_array_mut()
        .expect("parameters")
        .push(json!({
            "id": "param2",
            "name": "Second",
            "minValue": -1,
            "maxValue": 1,
            "defaultValue": 0
        }));
    payload["ikControllers"] = json!([{
        "id": "controller",
        "name": "Controller",
        "solverType": "ccd",
        "boneChain": [{ "boneId": "bone-root", "minAngle": -1, "maxAngle": 1 }],
        "targetX": 0,
        "targetY": 0,
        "influence": 1,
        "parameterMappings": [{
            "boneId": "bone-root",
            "parameterId": "vivi.head.yaw",
            "angleMin": -1,
            "angleMax": 1,
            "paramMin": -1,
            "paramMax": 1
        }]
    }]);
    payload["parameterBindings"] = json!([{
        "id": "binding",
        "parameterId": "vivi.head.yaw",
        "target": { "type": "bone", "boneId": "bone-root", "property": "angle" },
        "bindingPoints": []
    }]);
    payload["skins"] = json!({
        "mesh-body": {
            "weights": [
                [{ "boneId": "bone-root", "weight": 1 }],
                [{ "boneId": "bone-root", "weight": 1 }],
                [{ "boneId": "bone-root", "weight": 1 }]
            ],
            "bindPoseInverse": { "bone-root": [1, 0, 0, 1, 0, 0] }
        }
    });
    payload["physicsGroups"] = json!([{
        "id": "physics",
        "name": "Physics",
        "enabled": true,
        "pendulums": [{ "length": 1, "mass": 1, "damping": 0 }],
        "inputs": [{ "parameterId": "vivi.head.yaw", "weight": 1, "type": "x" }],
        "outputs": [{
            "parameterId": "param2",
            "boneId": "bone-root",
            "pendulumIndex": 0,
            "weight": 1,
            "type": "boneAngle"
        }],
        "gravityDirection": 0,
        "gravityStrength": 0,
        "wind": 0
    }]);
    payload["colliders"] = json!([{
        "id": "collider",
        "name": "Collider",
        "shape": { "type": "mesh", "meshId": "mesh-body" },
        "enabled": true
    }]);
    payload["expressionPresets"] = json!([{
        "id": "expression",
        "name": "Expression",
        "values": { "vivi.head.yaw": 0 }
    }]);
    let keyframe = json!({ "frame": 0, "value": 0, "interpolation": "linear" });
    payload["clips"] = json!([{
        "id": "clip",
        "name": "Clip",
        "duration": 1,
        "fps": 60,
        "tracks": [{
            "parameterId": "vivi.head.yaw",
            "keyframes": [keyframe.clone()]
        }],
        "boneTracks": [{
            "boneId": "bone-root",
            "property": "angle",
            "keyframes": [keyframe.clone()]
        }],
        "imageSequenceTracks": [{
            "targetMeshId": "mesh-body",
            "entries": [{ "startFrame": 0, "imageId": "image" }]
        }],
        "audioTracks": [{
            "id": "audio",
            "name": "Audio",
            "sourcePath": "",
            "startFrame": 0,
            "sourceDurationSeconds": null,
            "gain": 1,
            "muted": false
        }],
        "lipSyncTracks": [{
            "id": "lipsync",
            "name": "Lip Sync",
            "sourceAudioTrackId": "audio",
            "analysisType": "rms",
            "analysisFps": 60,
            "samples": [0],
            "targetParameterId": "vivi.head.yaw",
            "sourcePathAtBake": "",
            "sourceDurationSecondsAtBake": null,
            "gain": 1,
            "muted": false
        }],
        "ikControllerTracks": [{
            "controllerId": "controller",
            "targetXKeyframes": [keyframe.clone()],
            "targetYKeyframes": [keyframe]
        }]
    }]);
    payload["stateMachines"] = json!([{
        "id": "machine",
        "name": "Machine",
        "states": [
            { "id": "state-a", "name": "A", "clipId": "clip", "loop": true },
            {
                "id": "state-b",
                "name": "B",
                "blendTree": {
                    "parameterId": "param2",
                    "entries": [{ "threshold": 0, "clipId": "clip" }]
                },
                "loop": true
            }
        ],
        "transitions": [{
            "id": "transition",
            "fromStateId": "state-a",
            "toStateId": "state-b",
            "conditions": [{
                "parameterId": "vivi.head.yaw",
                "operator": ">",
                "threshold": 0
            }],
            "transitionDuration": 0,
            "priority": 0
        }],
        "initialStateId": "state-a",
        "enabled": true
    }]);
    payload
}

fn mutate_missing_reference(payload: &mut Value, id: &str) {
    match id {
        "paired-parameter" => {
            payload["parameters"][0]["pairedParameterId"] = json!("missing");
        }
        "ik-bone-chain" => payload["ikControllers"][0]["boneChain"][0]["boneId"] = json!("missing"),
        "ik-mapping-bone" => {
            payload["ikControllers"][0]["parameterMappings"][0]["boneId"] = json!("missing");
        }
        "ik-mapping-parameter" => {
            payload["ikControllers"][0]["parameterMappings"][0]["parameterId"] = json!("missing");
        }
        "binding-parameter" => payload["parameterBindings"][0]["parameterId"] = json!("missing"),
        "binding-bone" => payload["parameterBindings"][0]["target"]["boneId"] = json!("missing"),
        "binding-controller" => {
            payload["parameterBindings"][0]["target"] = json!({
                "type": "ikController",
                "controllerId": "missing",
                "property": "targetX"
            });
        }
        "skin-mesh" => rename_object_key(&mut payload["skins"], "mesh-body", "missing"),
        "skin-weight-bone" => {
            payload["skins"]["mesh-body"]["weights"][0][0]["boneId"] = json!("missing")
        }
        "skin-bind-pose-bone" => rename_object_key(
            &mut payload["skins"]["mesh-body"]["bindPoseInverse"],
            "bone-root",
            "missing",
        ),
        "physics-input-parameter" => {
            payload["physicsGroups"][0]["inputs"][0]["parameterId"] = json!("missing")
        }
        "physics-output-parameter" => {
            payload["physicsGroups"][0]["outputs"][0]["parameterId"] = json!("missing")
        }
        "physics-output-bone" => {
            payload["physicsGroups"][0]["outputs"][0]["boneId"] = json!("missing")
        }
        "collider-mesh" => payload["colliders"][0]["shape"]["meshId"] = json!("missing"),
        "expression-parameter" => rename_object_key(
            &mut payload["expressionPresets"][0]["values"],
            "vivi.head.yaw",
            "missing",
        ),
        "clip-track-parameter" => {
            payload["clips"][0]["tracks"][0]["parameterId"] = json!("missing")
        }
        "clip-bone-track-bone" => payload["clips"][0]["boneTracks"][0]["boneId"] = json!("missing"),
        "clip-image-track-mesh" => {
            payload["clips"][0]["imageSequenceTracks"][0]["targetMeshId"] = json!("missing")
        }
        "clip-lipsync-audio" => {
            payload["clips"][0]["lipSyncTracks"][0]["sourceAudioTrackId"] = json!("missing")
        }
        "clip-lipsync-parameter" => {
            payload["clips"][0]["lipSyncTracks"][0]["targetParameterId"] = json!("missing")
        }
        "clip-ik-controller" => {
            payload["clips"][0]["ikControllerTracks"][0]["controllerId"] = json!("missing")
        }
        "machine-initial-state" => payload["stateMachines"][0]["initialStateId"] = json!("missing"),
        "state-clip" => payload["stateMachines"][0]["states"][0]["clipId"] = json!("missing"),
        "blend-tree-parameter" => {
            payload["stateMachines"][0]["states"][1]["blendTree"]["parameterId"] = json!("missing")
        }
        "blend-tree-clip" => {
            payload["stateMachines"][0]["states"][1]["blendTree"]["entries"][0]["clipId"] =
                json!("missing")
        }
        "transition-from-state" => {
            payload["stateMachines"][0]["transitions"][0]["fromStateId"] = json!("missing")
        }
        "transition-to-state" => {
            payload["stateMachines"][0]["transitions"][0]["toStateId"] = json!("missing")
        }
        "transition-condition-parameter" => {
            payload["stateMachines"][0]["transitions"][0]["conditions"][0]["parameterId"] =
                json!("missing")
        }
        "atlas-entry-mesh" => payload["atlases"][0]["entries"][0]["layerId"] = json!("missing"),
        _ => panic!("unknown reference vector {id}"),
    }
}

fn rename_object_key(value: &mut Value, old: &str, new: &str) {
    let object = value.as_object_mut().expect("map object");
    let child = object.remove(old).expect("old key exists");
    assert!(object.insert(new.to_owned(), child).is_none());
}

fn apply_patch(target: &mut Value, patch: &Value) {
    let operation = patch["op"].as_str().expect("patch op");
    let path = patch["path"].as_str().expect("patch path");
    let (parent_path, raw_key) = path.rsplit_once('/').expect("absolute JSON pointer");
    let key = raw_key.replace("~1", "/").replace("~0", "~");
    let parent = if parent_path.is_empty() {
        target
    } else {
        target
            .pointer_mut(parent_path)
            .expect("patch parent exists")
    };
    match parent {
        Value::Object(object) => match operation {
            "add" => {
                assert!(
                    object.insert(key, patch["value"].clone()).is_none(),
                    "add target is absent"
                );
            }
            "replace" => {
                let slot = object.get_mut(&key).expect("replace target exists");
                *slot = patch["value"].clone();
            }
            "remove" => {
                object.remove(&key).expect("remove target exists");
            }
            _ => panic!("unsupported patch operation {operation}"),
        },
        Value::Array(array) => {
            let index = key.parse::<usize>().expect("array index");
            match operation {
                "replace" => array[index] = patch["value"].clone(),
                "remove" => {
                    array.remove(index);
                }
                "add" if index <= array.len() => array.insert(index, patch["value"].clone()),
                _ => panic!("unsupported array patch operation {operation}"),
            }
        }
        _ => panic!("patch parent is not a container"),
    }
}
