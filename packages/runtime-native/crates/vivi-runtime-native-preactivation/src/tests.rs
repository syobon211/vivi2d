use std::cell::Cell;

use base64::Engine as _;
use base64::engine::general_purpose::STANDARD;
use serde_json::json;
use tempfile::TempDir;
use vivi_asset_host_local::LocalAssetHostErrorKind;

use crate::coordinator::{prepare_with, validate_missing_shape, validate_ready_shape};
use crate::{
    AssetErrorCode, AssetRef, Digest, EvaluationPreactivationErrorKind, EvaluationTextureBindingV1,
    EvaluationTexturePlanV1, LocalAssetHost, LocalStoreErrorKind, PrepareEvaluationActivationV1,
    PrincipalId, StorageKind, ValidatedEvaluationPayloadV1, correlate_evaluation_activation_v1,
    parse_evaluation_payload_v1, prepare_evaluation_activation_v1,
};

const PNG_BASE64: &str = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGMQMgljAAABlQCdTUEI3wAAAABJRU5ErkJggg==";
const MAX_SAFE_GENERATION: u64 = 9_007_199_254_740_991;

fn principal() -> PrincipalId {
    PrincipalId::new(b"preactivation-test-principal".to_vec())
}

fn private_tempdir() -> TempDir {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt as _;

        tempfile::Builder::new()
            .permissions(std::fs::Permissions::from_mode(0o700))
            .tempdir()
            .expect("private temporary directory")
    }
    #[cfg(not(unix))]
    {
        TempDir::new().expect("temporary directory")
    }
}

fn open_host(temp: &TempDir) -> LocalAssetHost {
    LocalAssetHost::open(temp.path().join("assets.sqlite3"), principal()).expect("host opens")
}

fn digest(byte: u8) -> Digest {
    Digest::from_bytes([byte; Digest::LENGTH])
}

fn missing_blob(byte: u8) -> AssetRef {
    let digest = digest(byte);
    AssetRef {
        object_address: digest,
        storage_kind: StorageKind::Blob,
        content_sha256: digest,
        media_type: "image/png".to_owned(),
        size_bytes: 0,
    }
}

fn texture_binding(
    id: &str,
    asset: AssetRef,
    width: u32,
    height: u32,
) -> EvaluationTextureBindingV1 {
    EvaluationTextureBindingV1 {
        id: id.to_owned(),
        asset,
        width,
        height,
        media_type: "image/png".to_owned(),
        color_space: "srgb".to_owned(),
        alpha_mode: "straight".to_owned(),
    }
}

fn texture_plan(textures: Vec<EvaluationTextureBindingV1>) -> EvaluationTexturePlanV1 {
    EvaluationTexturePlanV1 {
        schema: "vivi2d.evaluationTexturePlan.v1".to_owned(),
        textures,
    }
}

fn candidate(
    request_generation: u64,
    atlases: &[(&str, u32, u32)],
) -> ValidatedEvaluationPayloadV1 {
    let layers = atlases
        .iter()
        .enumerate()
        .map(|(index, _)| {
            let layer_id = format!("mesh-{index}");
            json!({
                "id": layer_id,
                "name": format!("Mesh {index}"),
                "kind": "viviMesh",
                "visible": true,
                "opacity": 1,
                "x": 0,
                "y": 0,
                "width": 1,
                "height": 1,
                "blendMode": "normal",
                "expanded": true,
                "children": [],
                "mesh": {
                    "vertices": [0, 0, 1, 0, 0, 1],
                    "uvs": [0, 0, 1, 0, 0, 1],
                    "indices": [0, 1, 2],
                    "divisionsX": 1,
                    "divisionsY": 1
                }
            })
        })
        .collect::<Vec<_>>();
    let atlas_values = atlases
        .iter()
        .enumerate()
        .map(|(index, (id, width, height))| {
            json!({
                "id": id,
                "width": width,
                "height": height,
                "entries": [{
                    "layerId": format!("mesh-{index}"),
                    "x": 0,
                    "y": 0,
                    "width": width,
                    "height": height
                }]
            })
        })
        .collect::<Vec<_>>();
    let value = json!({
        "schema": "vivi2d.evaluationPayload.v1",
        "canvas": { "width": 32, "height": 32 },
        "layers": layers,
        "parameters": [],
        "parameterBindings": [],
        "skins": {},
        "ikControllers": [],
        "physicsGroups": [],
        "colliders": [],
        "expressionPresets": [],
        "clips": [],
        "stateMachines": [],
        "atlases": atlas_values
    });
    let raw = serde_json::to_vec(&value).expect("payload serializes");
    parse_evaluation_payload_v1(&raw, request_generation).expect("payload validates")
}

fn assert_pre_read_error(
    request_generation: u64,
    candidate: ValidatedEvaluationPayloadV1,
    plan: EvaluationTexturePlanV1,
    expected: EvaluationPreactivationErrorKind,
) {
    let calls = Cell::new(0_u32);
    let error = prepare_with(request_generation, candidate, plan, |_, _| {
        calls.set(calls.get() + 1);
        unreachable!("pre-read rejection must not invoke the host seam")
    })
    .expect_err("pre-read validation rejects the request");
    assert_eq!(error.kind(), expected);
    assert_eq!(calls.get(), 0);
}

#[test]
fn generation_mismatch_precedes_limit_correlation_and_is_pre_read() {
    let candidate = candidate(0, &[]);
    let invalid_plan = EvaluationTexturePlanV1 {
        schema: "wrong".to_owned(),
        textures: Vec::new(),
    };
    assert_pre_read_error(
        MAX_SAFE_GENERATION + 1,
        candidate,
        invalid_plan,
        EvaluationPreactivationErrorKind::Correlation,
    );
}

#[test]
fn equal_generation_limit_precedes_plan_correlation_and_is_pre_read() {
    for generation in [MAX_SAFE_GENERATION + 1, u64::MAX] {
        let invalid_plan = EvaluationTexturePlanV1 {
            schema: "wrong".to_owned(),
            textures: Vec::new(),
        };
        assert_pre_read_error(
            generation,
            candidate(generation, &[]),
            invalid_plan,
            EvaluationPreactivationErrorKind::ResourceLimitExceeded,
        );
    }
}

#[test]
fn zero_one_and_max_safe_generation_reach_the_host_unchanged() {
    let temp = private_tempdir();
    let host = open_host(&temp);
    for generation in [0, 1, MAX_SAFE_GENERATION] {
        let result = prepare_evaluation_activation_v1(
            &host,
            generation,
            candidate(generation, &[]),
            texture_plan(Vec::new()),
        )
        .expect("safe generation is accepted");
        let PrepareEvaluationActivationV1::Ready(ready) = result else {
            panic!("an empty valid plan is ready");
        };
        assert_eq!(ready.request_generation(), generation);
        assert_eq!(ready.prepared_textures().request_generation(), generation);
        assert!(ready.prepared_textures().textures().is_empty());
    }
}

#[test]
fn schema_count_case_order_and_dimension_correlation_fail_pre_read() {
    let base = missing_blob(1);

    let wrong_schema = EvaluationTexturePlanV1 {
        schema: "vivi2d.evaluationTexturePlan.v0".to_owned(),
        textures: vec![texture_binding("atlas:a", base.clone(), 1, 1)],
    };
    assert_pre_read_error(
        7,
        candidate(7, &[("a", 1, 1)]),
        wrong_schema,
        EvaluationPreactivationErrorKind::Correlation,
    );

    assert_pre_read_error(
        7,
        candidate(7, &[("a", 1, 1)]),
        texture_plan(Vec::new()),
        EvaluationPreactivationErrorKind::Correlation,
    );

    assert_pre_read_error(
        7,
        candidate(7, &[]),
        texture_plan(vec![texture_binding("atlas:extra", base.clone(), 1, 1)]),
        EvaluationPreactivationErrorKind::Correlation,
    );

    assert_pre_read_error(
        7,
        candidate(7, &[("a", 1, 1)]),
        texture_plan(vec![texture_binding("atlas:A", base.clone(), 1, 1)]),
        EvaluationPreactivationErrorKind::Correlation,
    );

    assert_pre_read_error(
        7,
        candidate(7, &[("a", 2, 1)]),
        texture_plan(vec![texture_binding("atlas:a", base.clone(), 1, 1)]),
        EvaluationPreactivationErrorKind::Correlation,
    );

    assert_pre_read_error(
        7,
        candidate(7, &[("a", 1, 2)]),
        texture_plan(vec![texture_binding("atlas:a", base.clone(), 1, 1)]),
        EvaluationPreactivationErrorKind::Correlation,
    );

    let sorted_candidate = candidate(7, &[("z", 1, 1), ("a", 1, 1)]);
    assert_eq!(sorted_candidate.texture_bindings()[0].id(), "atlas:a");
    assert_eq!(sorted_candidate.texture_bindings()[1].id(), "atlas:z");
    assert_pre_read_error(
        7,
        sorted_candidate,
        texture_plan(vec![
            texture_binding("atlas:z", base.clone(), 1, 1),
            texture_binding("atlas:a", base, 1, 1),
        ]),
        EvaluationPreactivationErrorKind::Correlation,
    );
}

#[test]
fn pure_correlation_token_is_redacted_and_moves_inputs_without_clone() {
    let generation = 9;
    let sensitive_id = "private_correlation_marker_81f2";
    let candidate = candidate(generation, &[(sensitive_id, 2, 3)]);
    let plan = texture_plan(vec![texture_binding(
        &format!("atlas:{sensitive_id}"),
        missing_blob(4),
        2,
        3,
    )]);
    let candidate_schema_pointer = candidate.value()["schema"]
        .as_str()
        .expect("schema is a string")
        .as_ptr();
    let plan_id_pointer = plan.textures[0].id.as_ptr();

    let correlated = correlate_evaluation_activation_v1(generation, candidate, plan)
        .expect("exact tuple correlates");
    assert_eq!(correlated.request_generation(), generation);
    let debug = format!("{correlated:?}");
    assert!(!debug.contains(sensitive_id));

    let (candidate, plan) = correlated.into_parts();
    assert_eq!(
        candidate.value()["schema"]
            .as_str()
            .expect("schema is a string")
            .as_ptr(),
        candidate_schema_pointer
    );
    assert_eq!(plan.textures[0].id.as_ptr(), plan_id_pointer);
}

#[test]
fn host_fixed_fields_and_asset_shape_errors_are_redacted_and_typed() {
    let temp = private_tempdir();
    let host = open_host(&temp);
    let generation = 11;
    for wrong_profile in [
        EvaluationTextureBindingV1 {
            media_type: "image/jpeg".to_owned(),
            ..texture_binding("atlas:a", missing_blob(1), 1, 1)
        },
        EvaluationTextureBindingV1 {
            color_space: "linear".to_owned(),
            ..texture_binding("atlas:a", missing_blob(1), 1, 1)
        },
        EvaluationTextureBindingV1 {
            alpha_mode: "premultiplied".to_owned(),
            ..texture_binding("atlas:a", missing_blob(1), 1, 1)
        },
    ] {
        let error = prepare_evaluation_activation_v1(
            &host,
            generation,
            candidate(generation, &[("a", 1, 1)]),
            texture_plan(vec![wrong_profile]),
        )
        .expect_err("fixed host profile preflight rejects drift");
        assert_eq!(
            error.kind(),
            EvaluationPreactivationErrorKind::InvalidTexturePlan
        );
        assert_eq!(error.asset_code(), None);
        assert_eq!(error.store_kind(), None);
    }

    let invalid_asset = AssetRef {
        object_address: digest(2),
        storage_kind: StorageKind::Blob,
        content_sha256: digest(3),
        media_type: "image/png".to_owned(),
        size_bytes: 0,
    };
    let error = prepare_evaluation_activation_v1(
        &host,
        generation,
        candidate(generation, &[("a", 1, 1)]),
        texture_plan(vec![texture_binding("atlas:a", invalid_asset, 1, 1)]),
    )
    .expect_err("asset shape preflight rejects hash mismatch");
    assert_eq!(error.kind(), EvaluationPreactivationErrorKind::Asset);
    assert_eq!(error.asset_code(), Some(AssetErrorCode::HashMismatch));
    assert_eq!(error.store_kind(), None);
    let debug = format!("{error:?}");
    assert!(!debug.contains("image/png"));
    assert!(!debug.contains("atlas:a"));
}

#[test]
fn store_cause_mapping_is_typed_and_redacted() {
    let temp = private_tempdir();
    let missing_parent = temp
        .path()
        .join("private-path-marker")
        .join("assets.sqlite3");
    let host_error = match LocalAssetHost::open(&missing_parent, principal()) {
        Ok(_) => panic!("missing trusted parent must be rejected"),
        Err(error) => error,
    };
    assert_eq!(host_error.kind(), LocalAssetHostErrorKind::Store);
    assert_eq!(
        host_error.store_kind(),
        Some(LocalStoreErrorKind::PathRejected)
    );

    let error = prepare_with(
        3,
        candidate(3, &[]),
        texture_plan(Vec::new()),
        move |_, _| Err(host_error),
    )
    .expect_err("host store error propagates in redacted form");
    assert_eq!(error.kind(), EvaluationPreactivationErrorKind::Store);
    assert_eq!(error.asset_code(), None);
    assert_eq!(error.store_kind(), Some(LocalStoreErrorKind::PathRejected));
    let debug = format!("{error:?}");
    let display = error.to_string();
    assert!(!debug.contains("private-path-marker"));
    assert!(!display.contains("private-path-marker"));
}

#[test]
fn host_store_hard_error_never_becomes_a_partial_missing_result() {
    let temp = private_tempdir();
    let missing_parent = temp
        .path()
        .join("private-store-marker")
        .join("assets.sqlite3");
    let host_error = match LocalAssetHost::open(missing_parent, principal()) {
        Ok(_) => panic!("missing trusted parent must be rejected"),
        Err(error) => error,
    };
    let plan = texture_plan(vec![
        texture_binding("atlas:a", missing_blob(1), 1, 1),
        texture_binding("atlas:b", missing_blob(2), 1, 1),
    ]);
    let error = prepare_with(
        13,
        candidate(13, &[("a", 1, 1), ("b", 1, 1)]),
        plan,
        move |_, received_plan| {
            let mut accumulated_missing = Vec::new();
            for binding in &received_plan.textures {
                if binding.id == "atlas:a" {
                    accumulated_missing.push(binding.id.as_str());
                    continue;
                }
                assert_eq!(binding.id, "atlas:b");
                assert_eq!(accumulated_missing, ["atlas:a"]);
                return Err(host_error);
            }
            unreachable!("the second binding simulates a later Store hard error")
        },
    )
    .expect_err("a host hard error cannot be converted to Missing");
    assert_eq!(error.kind(), EvaluationPreactivationErrorKind::Store);
    assert_eq!(error.store_kind(), Some(LocalStoreErrorKind::PathRejected));
}

#[test]
fn real_sqlite_ready_bundle_is_owned_correlated_and_postcondition_checked() {
    let temp = private_tempdir();
    let mut host = open_host(&temp);
    let png = STANDARD.decode(PNG_BASE64).expect("fixture is base64");
    let verified = host
        .materialize_embedded_png(&png, 1, 1)
        .expect("PNG materializes");
    let generation = 17;
    let result = prepare_evaluation_activation_v1(
        &host,
        generation,
        candidate(generation, &[("ready", 1, 1)]),
        texture_plan(vec![texture_binding(
            "atlas:ready",
            verified.asset.clone(),
            1,
            1,
        )]),
    )
    .expect("materialized texture resolves");
    let PrepareEvaluationActivationV1::Ready(ready) = result else {
        panic!("materialized texture must be ready");
    };
    assert_eq!(ready.request_generation(), generation);
    assert_eq!(ready.candidate().texture_bindings()[0].id(), "atlas:ready");
    assert_eq!(ready.texture_plan().textures[0].asset, verified.asset);
    let prepared = ready.prepared_textures();
    assert_eq!(prepared.total_pixels(), 1);
    assert_eq!(prepared.total_rgba_bytes(), 4);
    assert_eq!(prepared.textures()[0].id(), "atlas:ready");
    let ready_png = prepared.textures()[0].ready_png();
    assert_eq!(ready_png.logical_bytes(), png);
    assert_eq!(ready_png.decoded().info.width, 1);
    assert_eq!(ready_png.decoded().info.height, 1);
    assert_eq!(ready_png.decoded().rgba.len(), 4);
    assert!(!ready_png.source_generations().is_empty());
}

#[test]
fn real_sqlite_missing_is_all_or_nothing_and_drops_partial_ready() {
    let temp = private_tempdir();
    let mut host = open_host(&temp);
    let png = STANDARD.decode(PNG_BASE64).expect("fixture is base64");
    let verified = host
        .materialize_embedded_png(&png, 1, 1)
        .expect("PNG materializes");
    let generation = 19;
    let result = prepare_evaluation_activation_v1(
        &host,
        generation,
        candidate(generation, &[("a", 1, 1), ("b", 1, 1)]),
        texture_plan(vec![
            texture_binding("atlas:a", verified.asset, 1, 1),
            texture_binding("atlas:b", missing_blob(9), 1, 1),
        ]),
    )
    .expect("absence is a state");
    let PrepareEvaluationActivationV1::Missing(missing) = result else {
        panic!("one absent texture prevents readiness");
    };
    assert_eq!(missing.request_generation(), generation);
    assert_eq!(missing.missing_textures().texture_ids(), &["atlas:b"]);
    assert_eq!(missing.texture_plan().textures.len(), 2);
    assert_eq!(missing.candidate().texture_bindings().len(), 2);
}

#[test]
fn real_sqlite_later_hard_error_wins_over_earlier_missing() {
    let temp = private_tempdir();
    let mut host = open_host(&temp);
    let png = STANDARD.decode(PNG_BASE64).expect("fixture is base64");
    let verified = host
        .materialize_embedded_png(&png, 1, 1)
        .expect("PNG materializes");
    let mut descriptor_mismatch = verified.asset;
    descriptor_mismatch.size_bytes += 1;
    let generation = 23;
    let error = prepare_evaluation_activation_v1(
        &host,
        generation,
        candidate(generation, &[("a", 1, 1), ("b", 1, 1)]),
        texture_plan(vec![
            texture_binding("atlas:a", missing_blob(7), 1, 1),
            texture_binding("atlas:b", descriptor_mismatch, 1, 1),
        ]),
    )
    .expect_err("later descriptor error wins over accumulated Missing");
    assert_eq!(error.kind(), EvaluationPreactivationErrorKind::Asset);
    assert_eq!(error.asset_code(), Some(AssetErrorCode::DescriptorMismatch));
}

#[test]
fn ready_postcondition_defense_rejects_every_shape_contradiction() {
    let expected_asset = missing_blob(1);
    let other_asset = missing_blob(2);
    let plan = texture_plan(vec![texture_binding(
        "atlas:a",
        expected_asset.clone(),
        2,
        3,
    )]);
    let valid = || Some(("atlas:a", 2, 3, &expected_asset));
    assert!(validate_ready_shape(5, &plan, 5, 1, 6, 24, |_| valid()).is_ok());

    for result in [
        validate_ready_shape(5, &plan, 6, 1, 6, 24, |_| valid()),
        validate_ready_shape(5, &plan, 5, 0, 6, 24, |_| valid()),
        validate_ready_shape(5, &plan, 5, 1, 7, 24, |_| valid()),
        validate_ready_shape(5, &plan, 5, 1, 6, 25, |_| valid()),
        validate_ready_shape(5, &plan, 5, 1, 6, 24, |_| None),
        validate_ready_shape(5, &plan, 5, 1, 6, 24, |_| {
            Some(("atlas:b", 2, 3, &expected_asset))
        }),
        validate_ready_shape(5, &plan, 5, 1, 6, 24, |_| {
            Some(("atlas:a", 3, 3, &expected_asset))
        }),
        validate_ready_shape(5, &plan, 5, 1, 6, 24, |_| {
            Some(("atlas:a", 2, 4, &expected_asset))
        }),
        validate_ready_shape(5, &plan, 5, 1, 6, 24, |_| {
            Some(("atlas:a", 2, 3, &other_asset))
        }),
    ] {
        assert_eq!(
            result
                .expect_err("contradictory host Ready is rejected")
                .kind(),
            EvaluationPreactivationErrorKind::Internal
        );
    }

    let two_item_plan = texture_plan(vec![
        texture_binding("atlas:a", expected_asset.clone(), 1, 1),
        texture_binding("atlas:b", other_asset.clone(), 1, 1),
    ]);
    for result in [
        validate_ready_shape(5, &two_item_plan, 5, 2, 2, 8, |index| match index {
            0 => Some(("atlas:b", 1, 1, &other_asset)),
            1 => Some(("atlas:a", 1, 1, &expected_asset)),
            _ => None,
        }),
        validate_ready_shape(5, &two_item_plan, 5, 2, 2, 8, |index| match index {
            0 => Some(("atlas:A", 1, 1, &expected_asset)),
            1 => Some(("atlas:b", 1, 1, &other_asset)),
            _ => None,
        }),
    ] {
        assert_eq!(
            result
                .expect_err("order and case contradictions are rejected")
                .kind(),
            EvaluationPreactivationErrorKind::Internal
        );
    }
}

#[test]
fn missing_postcondition_defense_rejects_generation_unknown_order_and_duplicates() {
    let plan = texture_plan(vec![
        texture_binding("atlas:a", missing_blob(1), 1, 1),
        texture_binding("atlas:b", missing_blob(2), 1, 1),
        texture_binding("atlas:c", missing_blob(3), 1, 1),
    ]);
    assert!(
        validate_missing_shape(5, &plan, 5, &["atlas:a".to_owned(), "atlas:c".to_owned()]).is_ok()
    );
    for ids in [
        Vec::new(),
        vec!["atlas:unknown".to_owned()],
        vec!["atlas:c".to_owned(), "atlas:a".to_owned()],
        vec!["atlas:a".to_owned(), "atlas:a".to_owned()],
    ] {
        assert_eq!(
            validate_missing_shape(5, &plan, 5, &ids)
                .expect_err("contradictory host Missing is rejected")
                .kind(),
            EvaluationPreactivationErrorKind::Internal
        );
    }
    assert_eq!(
        validate_missing_shape(5, &plan, 6, &["atlas:a".to_owned()])
            .expect_err("wrong output generation is rejected")
            .kind(),
        EvaluationPreactivationErrorKind::Internal
    );
}

#[test]
fn owned_into_parts_moves_without_clone_and_wrapper_debug_is_redacted() {
    let temp = private_tempdir();
    let mut host = open_host(&temp);
    let png = STANDARD.decode(PNG_BASE64).expect("fixture is base64");
    let verified = host
        .materialize_embedded_png(&png, 1, 1)
        .expect("PNG materializes");
    let generation = 29;
    let sensitive_id = "private_payload_marker_7f3a";
    let result = prepare_evaluation_activation_v1(
        &host,
        generation,
        candidate(generation, &[(sensitive_id, 1, 1)]),
        texture_plan(vec![texture_binding(
            &format!("atlas:{sensitive_id}"),
            verified.asset,
            1,
            1,
        )]),
    )
    .expect("materialized texture resolves");
    let debug = format!("{result:?}");
    assert!(!debug.contains(sensitive_id));
    assert!(!debug.contains(PNG_BASE64));
    let PrepareEvaluationActivationV1::Ready(ready) = result else {
        panic!("materialized texture must be ready");
    };

    let candidate_schema_pointer = ready.candidate().value()["schema"]
        .as_str()
        .expect("schema is a string")
        .as_ptr();
    let plan_id_pointer = ready.texture_plan().textures[0].id.as_ptr();
    let logical_pointer = ready.prepared_textures().textures()[0]
        .ready_png()
        .logical_bytes()
        .as_ptr();
    let rgba_pointer = ready.prepared_textures().textures()[0]
        .ready_png()
        .decoded()
        .rgba
        .as_ptr();
    let logical_marker = format!(
        "{:?}",
        ready.prepared_textures().textures()[0]
            .ready_png()
            .logical_bytes()
    );
    let rgba_marker = format!(
        "{:?}",
        ready.prepared_textures().textures()[0]
            .ready_png()
            .decoded()
            .rgba
    );
    assert!(!debug.contains(&logical_marker));
    assert!(!debug.contains(&rgba_marker));
    let (candidate, plan, prepared) = ready.into_parts();
    assert_eq!(
        candidate.value()["schema"]
            .as_str()
            .expect("schema is a string")
            .as_ptr(),
        candidate_schema_pointer
    );
    assert_eq!(plan.textures[0].id.as_ptr(), plan_id_pointer);
    assert_eq!(
        prepared.textures()[0].ready_png().logical_bytes().as_ptr(),
        logical_pointer
    );
    assert_eq!(
        prepared.textures()[0].ready_png().decoded().rgba.as_ptr(),
        rgba_pointer
    );
}

#[test]
fn missing_owned_into_parts_and_wrapper_debug_are_redacted() {
    let temp = private_tempdir();
    let host = open_host(&temp);
    let generation = 31;
    let sensitive_id = "private_missing_marker_4c9e";
    let result = prepare_evaluation_activation_v1(
        &host,
        generation,
        candidate(generation, &[(sensitive_id, 1, 1)]),
        texture_plan(vec![texture_binding(
            &format!("atlas:{sensitive_id}"),
            missing_blob(9),
            1,
            1,
        )]),
    )
    .expect("absence is a state");
    let debug = format!("{result:?}");
    assert!(!debug.contains(sensitive_id));
    let PrepareEvaluationActivationV1::Missing(missing) = result else {
        panic!("unmaterialized texture must be missing");
    };
    let (candidate, plan, missing_textures) = missing.into_parts();
    assert_eq!(candidate.request_generation(), generation);
    assert_eq!(plan.textures.len(), 1);
    assert_eq!(
        missing_textures.texture_ids(),
        &[format!("atlas:{sensitive_id}")]
    );
}
