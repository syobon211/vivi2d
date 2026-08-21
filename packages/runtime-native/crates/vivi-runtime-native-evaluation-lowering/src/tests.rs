use std::collections::BTreeSet;

use serde_json::{Map, Value, json};
use sha2::{Digest as _, Sha256};
use vivi_runtime_native_preactivation::{
    AssetRef, Digest, EvaluationTextureBindingV1, EvaluationTexturePlanV1, StorageKind,
    ValidatedEvaluationPayloadV1, correlate_evaluation_activation_v1, parse_evaluation_payload_v1,
};

use crate::error::EvaluationLoweringErrorKind;
use crate::lower::{lower_correlated_with_reservation, project_binary64_to_binary32};
use crate::model::FoundationBlendModeV1;
use crate::{
    APPROVED_EVALUATION_LOWERING_CONTRACT_DRAFT_BYTES,
    APPROVED_EVALUATION_LOWERING_CONTRACT_DRAFT_SHA256, APPROVED_EVALUATION_LOWERING_REVIEW_BYTES,
    APPROVED_EVALUATION_LOWERING_REVIEW_SHA256, APPROVED_EVALUATION_LOWERING_VECTORS_BYTES,
    APPROVED_EVALUATION_LOWERING_VECTORS_SHA256, lower_evaluation_foundation_v1,
};

const VECTORS: &[u8] = include_bytes!("../fixtures/evaluation-lowering-v1-vectors.json");
const MAX_SAFE_GENERATION: u64 = 9_007_199_254_740_991;

fn vectors() -> Value {
    serde_json::from_slice(VECTORS).expect("approved vectors parse")
}

fn mesh_layer(id: &str, blend_mode: &str) -> Value {
    json!({
        "id": id,
        "name": "Mesh",
        "kind": "viviMesh",
        "visible": true,
        "opacity": 1,
        "x": 0,
        "y": 0,
        "width": 1,
        "height": 1,
        "blendMode": blend_mode,
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
}

fn bone_layer(id: &str, blend_mode: &str) -> Value {
    json!({
        "id": id,
        "name": "Bone",
        "kind": "bone",
        "visible": true,
        "opacity": 1,
        "x": 0,
        "y": 0,
        "width": 1,
        "height": 1,
        "blendMode": blend_mode,
        "expanded": true,
        "children": [],
        "bone": { "angle": 0, "length": 1, "scaleX": 1, "scaleY": 1 }
    })
}

fn group_layer(id: &str, blend_mode: &str) -> Value {
    json!({
        "id": id,
        "name": "Group",
        "kind": "group",
        "visible": true,
        "opacity": 1,
        "x": 0,
        "y": 0,
        "width": 1,
        "height": 1,
        "blendMode": blend_mode,
        "expanded": true,
        "children": []
    })
}

fn art_path_layer(id: &str) -> Value {
    json!({
        "id": id,
        "name": "Path",
        "kind": "artPath",
        "visible": false,
        "opacity": 1,
        "x": 0,
        "y": 0,
        "width": 1,
        "height": 1,
        "blendMode": "normal",
        "expanded": true,
        "children": [],
        "controlPoints": [],
        "closed": false,
        "style": {
            "color": 0,
            "baseWidth": 1,
            "lineCap": "butt",
            "lineJoin": "miter"
        }
    })
}

fn base_payload() -> Value {
    json!({
        "schema": "vivi2d.evaluationPayload.v1",
        "canvas": { "width": 32, "height": 64 },
        "layers": [mesh_layer("mesh", "normal")],
        "parameters": [{
            "id": "parameter",
            "name": "Parameter",
            "minValue": -2,
            "maxValue": 2,
            "defaultValue": 0
        }],
        "parameterBindings": [],
        "skins": {},
        "ikControllers": [],
        "physicsGroups": [],
        "colliders": [],
        "expressionPresets": [],
        "clips": [],
        "stateMachines": [],
        "atlases": [{
            "id": "atlas",
            "width": 1,
            "height": 1,
            "entries": [{
                "layerId": "mesh",
                "x": 0,
                "y": 0,
                "width": 1,
                "height": 1
            }]
        }]
    })
}

fn root(value: &Value) -> &Map<String, Value> {
    value.as_object().expect("test payload root")
}

fn root_mut(value: &mut Value) -> &mut Map<String, Value> {
    value.as_object_mut().expect("test payload root")
}

fn layers_mut(value: &mut Value) -> &mut Vec<Value> {
    root_mut(value)
        .get_mut("layers")
        .and_then(Value::as_array_mut)
        .expect("test layers")
}

fn mesh_mut(value: &mut Value, index: usize) -> &mut Map<String, Value> {
    layers_mut(value)[index]
        .as_object_mut()
        .expect("test mesh layer")
}

fn add_mesh(value: &mut Value, id: &str, blend_mode: &str) {
    layers_mut(value).push(mesh_layer(id, blend_mode));
    root_mut(value)["atlases"][0]["entries"]
        .as_array_mut()
        .expect("atlas entries")
        .push(json!({
            "layerId": id,
            "x": 0,
            "y": 0,
            "width": 1,
            "height": 1
        }));
}

fn ik_controller(id: &str, influence: f64, min_angle: f64, max_angle: f64) -> Value {
    json!({
        "id": id,
        "name": "IK",
        "solverType": "ccd",
        "boneChain": [{
            "boneId": "bone",
            "minAngle": min_angle,
            "maxAngle": max_angle
        }],
        "targetX": 0,
        "targetY": 0,
        "influence": influence,
        "parameterMappings": []
    })
}

fn with_bone(mut value: Value) -> Value {
    layers_mut(&mut value).push(bone_layer("bone", "normal"));
    value
}

fn physics_group(id: &str, enabled: bool) -> Value {
    json!({
        "id": id,
        "name": "Physics",
        "enabled": enabled,
        "pendulums": [],
        "inputs": [],
        "outputs": [],
        "gravityDirection": 0,
        "gravityStrength": 0,
        "wind": 0
    })
}

fn candidate_and_plan(
    value: &Value,
    generation: u64,
) -> (ValidatedEvaluationPayloadV1, EvaluationTexturePlanV1) {
    let raw = serde_json::to_vec(value).expect("test payload serializes");
    let candidate = parse_evaluation_payload_v1(&raw, generation).expect("test payload validates");
    let digest = Digest::from_bytes([7; Digest::LENGTH]);
    let textures = candidate
        .texture_bindings()
        .iter()
        .map(|required| EvaluationTextureBindingV1 {
            id: required.id().to_owned(),
            asset: AssetRef {
                object_address: digest,
                storage_kind: StorageKind::Blob,
                content_sha256: digest,
                media_type: "image/png".to_owned(),
                size_bytes: 0,
            },
            width: required.width(),
            height: required.height(),
            media_type: "image/png".to_owned(),
            color_space: "srgb".to_owned(),
            alpha_mode: "straight".to_owned(),
        })
        .collect();
    (
        candidate,
        EvaluationTexturePlanV1 {
            schema: "vivi2d.evaluationTexturePlan.v1".to_owned(),
            textures,
        },
    )
}

fn lower_value(
    value: &Value,
) -> Result<crate::EvaluationLoweringFoundationV1, crate::EvaluationLoweringError> {
    let (candidate, plan) = candidate_and_plan(value, 5);
    lower_evaluation_foundation_v1(5, candidate, plan)
}

fn assert_kind(value: &Value, expected: EvaluationLoweringErrorKind) {
    let error = lower_value(value).expect_err("foundation rejects test payload");
    assert_eq!(error.kind(), expected);
    assert_eq!(error.load_status(), expected.load_status());
}

#[test]
fn frozen_vector_fixture_and_source_pins_are_exact() {
    assert_eq!(VECTORS.len(), APPROVED_EVALUATION_LOWERING_VECTORS_BYTES);
    assert_eq!(
        format!("{:x}", Sha256::digest(VECTORS)),
        APPROVED_EVALUATION_LOWERING_VECTORS_SHA256
    );
    assert_eq!(APPROVED_EVALUATION_LOWERING_CONTRACT_DRAFT_BYTES, 41_556);
    assert_eq!(
        APPROVED_EVALUATION_LOWERING_CONTRACT_DRAFT_SHA256,
        "2b8f731033b9eb579b33ff66da7efd0036f2b82b5326f74a0df5db8c2718bc20"
    );
    assert_eq!(APPROVED_EVALUATION_LOWERING_REVIEW_BYTES, 20_624);
    assert_eq!(
        APPROVED_EVALUATION_LOWERING_REVIEW_SHA256,
        "76c17745960b824530b1d6b0252f47e013cbef850d5245419c58e56f3364526b"
    );
    let vectors = vectors();
    assert_eq!(vectors["contract"], "evaluation-lowering-v1");
    assert_eq!(vectors["draft"], 1);
    assert_eq!(vectors["status"], "external-review-required");
    assert_eq!(
        vectors["deterministicMathPrerequisite"]["status"],
        "required-not-yet-adopted"
    );
}

#[test]
fn all_thirty_scalar_projection_vectors_are_bit_exact() {
    let vectors = vectors();
    let cases = vectors["numericProjection"]
        .as_array()
        .expect("numeric projection vectors");
    assert_eq!(cases.len(), 30);
    for case in cases {
        let id = case["id"].as_str().expect("case id");
        let input_bits =
            u64::from_str_radix(case["inputBinary64Bits"].as_str().expect("input bits"), 16)
                .expect("binary64 bits parse");
        let result = project_binary64_to_binary32(f64::from_bits(input_bits));
        match case["expected"].as_str().expect("expected outcome") {
            "accept" => {
                let expected = u32::from_str_radix(
                    case["outputBinary32Bits"].as_str().expect("output bits"),
                    16,
                )
                .expect("binary32 bits parse");
                assert_eq!(result.expect(id).to_bits(), expected, "{id}");
            }
            "reject" => {
                let expected = match case["privateKind"].as_str().expect("private kind") {
                    "NumericOverflow" => EvaluationLoweringErrorKind::NumericOverflow,
                    "NumericUnderflow" => EvaluationLoweringErrorKind::NumericUnderflow,
                    "NumericSubnormal" => EvaluationLoweringErrorKind::NumericSubnormal,
                    other => panic!("unexpected numeric kind in {id}: {other}"),
                };
                assert_eq!(result.expect_err(id).kind(), expected, "{id}");
            }
            other => panic!("unexpected outcome in {id}: {other}"),
        }
    }
}

#[test]
fn nonfinite_projection_inputs_are_typed_load_incompatibilities() {
    for value in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
        let error =
            project_binary64_to_binary32(value).expect_err("nonfinite binary64 cannot project");
        assert_eq!(error.kind(), EvaluationLoweringErrorKind::NumericNonFinite);
        assert_eq!(error.load_status(), 14);
    }
}

fn blend_context_payload(mode: &str, context: &str) -> Value {
    let mut value = base_payload();
    match context {
        "viviMesh-visible" => {
            mesh_mut(&mut value, 0).insert("blendMode".to_owned(), json!(mode));
        }
        "viviMesh-invisible" => {
            let mesh = mesh_mut(&mut value, 0);
            mesh.insert("blendMode".to_owned(), json!(mode));
            mesh.insert("visible".to_owned(), json!(false));
        }
        "viviMesh-mask-only" => {
            mesh_mut(&mut value, 0).insert("blendMode".to_owned(), json!(mode));
            mesh_mut(&mut value, 0).insert("visible".to_owned(), json!(false));
            add_mesh(&mut value, "target", "normal");
            mesh_mut(&mut value, 1).insert("clipMaskIds".to_owned(), json!(["mesh"]));
        }
        "group-visible" | "group-invisible" => {
            let mut group = group_layer("group", mode);
            if context.ends_with("invisible") {
                group["visible"] = json!(false);
            }
            layers_mut(&mut value).insert(0, group);
        }
        "bone-visible" | "bone-invisible" => {
            let mut bone = bone_layer("bone", mode);
            if context.ends_with("invisible") {
                bone["visible"] = json!(false);
            }
            layers_mut(&mut value).insert(0, bone);
        }
        other => panic!("unknown blend context: {other}"),
    }
    value
}

#[test]
fn all_thirteen_blends_cross_all_seven_recursive_contexts() {
    let vectors = vectors();
    let modes = vectors["blendModes"].as_array().expect("blend modes");
    let contexts = vectors["blendScanContexts"]
        .as_array()
        .expect("blend contexts");
    assert_eq!(modes.len(), 13);
    assert_eq!(contexts.len(), 7);
    assert_eq!(modes.len() * contexts.len(), 91);

    for mode in modes {
        let spelling = mode["input"].as_str().expect("blend spelling");
        let accepted = mode["expected"] == "accept";
        for context in contexts {
            let context = context.as_str().expect("context spelling");
            let result = lower_value(&blend_context_payload(spelling, context));
            if accepted {
                let foundation = result.unwrap_or_else(|error| {
                    panic!("{spelling}/{context} unexpectedly failed: {error:?}")
                });
                if context.starts_with("viviMesh") {
                    let expected = match mode["runtimeValue"].as_u64().expect("runtime value") {
                        0 => FoundationBlendModeV1::Normal,
                        1 => FoundationBlendModeV1::Multiply,
                        2 => FoundationBlendModeV1::Screen,
                        3 => FoundationBlendModeV1::Add,
                        other => panic!("unexpected runtime value: {other}"),
                    };
                    assert_eq!(foundation.meshes[0].blend_mode, expected);
                }
            } else {
                assert_eq!(
                    result.expect_err("extended blend rejects").kind(),
                    EvaluationLoweringErrorKind::UnsupportedBlendMode,
                    "{spelling}/{context}"
                );
            }
        }
    }
}

#[test]
fn eligibility_records_are_preflighted_while_bound_clamp_remains_deferred() {
    let mut preflighted = BTreeSet::new();
    let mut deferred_category_ten = BTreeSet::new();

    let mut value = base_payload();
    layers_mut(&mut value).insert(0, art_path_layer("path"));
    assert_kind(&value, EvaluationLoweringErrorKind::UnsupportedLayer);
    preflighted.insert("art-path-even-when-invisible");

    for (id, mut owner) in [
        ("mask-on-group", group_layer("owner", "normal")),
        ("mask-on-bone", bone_layer("owner", "normal")),
    ] {
        owner["clipMaskIds"] = json!(["mesh"]);
        let mut value = base_payload();
        layers_mut(&mut value).insert(0, owner);
        assert_kind(
            &value,
            EvaluationLoweringErrorKind::UnsupportedMaskPlacement,
        );
        preflighted.insert(id);
    }

    let mut value = with_bone(base_payload());
    let mut controller = ik_controller("ik", 0.5, -1.0, 1.0);
    controller["parameterMappings"] = json!([{
        "boneId": "bone",
        "parameterId": "parameter",
        "angleMin": -1,
        "angleMax": 1,
        "paramMin": -1,
        "paramMax": 1
    }]);
    root_mut(&mut value)["ikControllers"] = json!([controller]);
    assert_kind(
        &value,
        EvaluationLoweringErrorKind::UnsupportedIkParameterMappings,
    );
    preflighted.insert("non-empty-ik-parameter-mappings");

    let mut value = with_bone(base_payload());
    let mut controller = ik_controller("ik", 0.5, -1.0, 1.0);
    controller["boneChain"] = json!([
        { "boneId": "bone", "minAngle": -1, "maxAngle": 1 },
        { "boneId": "bone", "minAngle": 2, "maxAngle": 1 }
    ]);
    root_mut(&mut value)["ikControllers"] = json!([controller]);
    assert_kind(
        &value,
        EvaluationLoweringErrorKind::UnsupportedDuplicateIkBone,
    );
    preflighted.insert("duplicate-ik-bone-id");

    let mut value = with_bone(base_payload());
    root_mut(&mut value)["ikControllers"] = json!([
        ik_controller("ik-a", 0.5, -1.0, 1.0),
        ik_controller("ik-b", 0.5, -1.0, 1.0)
    ]);
    assert_kind(
        &value,
        EvaluationLoweringErrorKind::UnsupportedMultipleIkControllers,
    );
    preflighted.insert("multiple-ik-controllers");

    let mut value = base_payload();
    root_mut(&mut value)["physicsGroups"] = json!([
        physics_group("physics-a", true),
        physics_group("physics-b", true)
    ]);
    assert_kind(
        &value,
        EvaluationLoweringErrorKind::UnsupportedMultipleEnabledPhysicsGroups,
    );
    preflighted.insert("multiple-enabled-physics-groups");

    for (id, influence) in [
        ("ik-base-influence-below-zero", -0.000_1),
        ("ik-base-influence-above-one", 1.000_1),
    ] {
        let mut value = with_bone(base_payload());
        root_mut(&mut value)["ikControllers"] = json!([ik_controller("ik", influence, -1.0, 1.0)]);
        assert_kind(&value, EvaluationLoweringErrorKind::InvalidIkRange);
        preflighted.insert(id);
    }

    let mut value = with_bone(base_payload());
    root_mut(&mut value)["ikControllers"] = json!([ik_controller("ik", 0.5, 1.0, -1.0)]);
    assert_kind(&value, EvaluationLoweringErrorKind::InvalidIkRange);
    preflighted.insert("ik-reversed-angle-range");

    let value = base_payload();
    lower_value(&value).expect("zero IK controllers are eligible");
    preflighted.insert("zero-ik-controllers");

    for influence in [0.0, 1.0] {
        let mut value = with_bone(base_payload());
        root_mut(&mut value)["ikControllers"] = json!([ik_controller("ik", influence, -1.0, 1.0)]);
        lower_value(&value).expect("closed IK influence boundary is eligible");
    }
    preflighted.insert("ik-base-influence-closed-boundaries");

    let mut value = with_bone(base_payload());
    root_mut(&mut value)["ikControllers"] = json!([ik_controller("ik", 0.5, 1.0, 1.0)]);
    lower_value(&value).expect("equal IK constraint boundary is eligible");
    preflighted.insert("ik-equal-angle-range");

    for (id, inverted) in [("ordinary-mask-edges", false), ("invert-mask-edges", true)] {
        let mut value = base_payload();
        add_mesh(&mut value, "mask", "normal");
        if inverted {
            mesh_mut(&mut value, 0).insert(
                "clipMasks".to_owned(),
                json!([{ "layerId": "mask", "invert": true }]),
            );
        } else {
            mesh_mut(&mut value, 0).insert("clipMaskIds".to_owned(), json!(["mask"]));
        }
        let foundation = lower_value(&value).expect("mesh-owned mask is eligible");
        assert_eq!(foundation.mask_edge_count(), 1);
        preflighted.insert(id);
    }

    let mut value = with_bone(base_payload());
    root_mut(&mut value)["ikControllers"] = json!([ik_controller("ik", 0.5, -1.0, 1.0)]);
    lower_value(&value).expect("empty IK parameter mappings are eligible");
    preflighted.insert("supported-ik-without-parameter-mappings");

    // The binding-derived clamp itself belongs to category 10. This slice only
    // proves the valid binding is retained and does not pretend to execute it.
    let mut value = with_bone(base_payload());
    root_mut(&mut value)["ikControllers"] = json!([ik_controller("ik", 0.5, -1.0, 1.0)]);
    root_mut(&mut value)["parameterBindings"] = json!([{
        "id": "binding",
        "parameterId": "parameter",
        "target": {
            "type": "ikController",
            "controllerId": "ik",
            "property": "influence"
        },
        "bindingPoints": [
            { "paramValue": -2, "targetValue": -1 },
            { "paramValue": 2, "targetValue": 2 }
        ]
    }]);
    lower_value(&value).expect("bound influence input is retained for category 10");
    deferred_category_ten.insert("ik-bound-influence-clamps");

    let approved_vectors = vectors();
    let fixture_ids = approved_vectors["eligibility"]
        .as_array()
        .expect("eligibility vectors")
        .iter()
        .map(|case| case["id"].as_str().expect("eligibility id"))
        .collect::<BTreeSet<_>>();
    assert!(preflighted.is_disjoint(&deferred_category_ten));
    let represented = preflighted
        .union(&deferred_category_ten)
        .copied()
        .collect::<BTreeSet<_>>();
    assert_eq!(represented, fixture_ids);
    assert_eq!(deferred_category_ten, ["ik-bound-influence-clamps"].into());
}

#[test]
fn direct_projection_uses_recursive_mesh_dfs_and_fixed_field_order() {
    let underflow = f64::from_bits(0x3690_0000_0000_0000);
    let subnormal = f64::from_bits(0x36a0_0000_0000_0000);

    let mut first = mesh_layer("first", "normal");
    first["mesh"]["uvs"][0] = json!(underflow);
    let mut second = mesh_layer("second", "normal");
    second["mesh"]["vertices"][0] = json!(f64::MAX);
    let mut group = group_layer("group", "normal");
    group["children"] = json!([first, second]);
    let mut value = base_payload();
    root_mut(&mut value)["layers"] = json!([group]);
    root_mut(&mut value)["atlases"][0]["entries"] = json!([
        { "layerId": "first", "x": 0, "y": 0, "width": 1, "height": 1 },
        { "layerId": "second", "x": 0, "y": 0, "width": 1, "height": 1 }
    ]);
    assert_kind(&value, EvaluationLoweringErrorKind::NumericUnderflow);

    let mut value = base_payload();
    mesh_mut(&mut value, 0)["mesh"]["vertices"][0] = json!(f64::MAX);
    mesh_mut(&mut value, 0)["mesh"]["uvs"][0] = json!(subnormal);
    assert_kind(&value, EvaluationLoweringErrorKind::NumericOverflow);

    let mut value = base_payload();
    mesh_mut(&mut value, 0)["opacity"] = json!(f64::MAX);
    mesh_mut(&mut value, 0).insert(
        "multiplyColor".to_owned(),
        json!({ "r": subnormal, "g": 1, "b": 1 }),
    );
    assert_kind(&value, EvaluationLoweringErrorKind::NumericOverflow);

    let mut value = base_payload();
    mesh_mut(&mut value, 0)["x"] = json!(f64::MAX);
    mesh_mut(&mut value, 0)["y"] = json!(underflow);
    assert_kind(&value, EvaluationLoweringErrorKind::NumericOverflow);

    let mut value = base_payload();
    mesh_mut(&mut value, 0).insert(
        "multiplyColor".to_owned(),
        json!({ "r": subnormal, "g": f64::MAX, "b": 1 }),
    );
    assert_kind(&value, EvaluationLoweringErrorKind::NumericSubnormal);

    let mut value = base_payload();
    mesh_mut(&mut value, 0).insert(
        "multiplyColor".to_owned(),
        json!({ "r": 1, "g": 1, "b": underflow }),
    );
    mesh_mut(&mut value, 0).insert(
        "screenColor".to_owned(),
        json!({ "r": f64::MAX, "g": 0, "b": 0 }),
    );
    assert_kind(&value, EvaluationLoweringErrorKind::NumericUnderflow);
}

#[test]
fn adjacent_lowering_categories_have_total_precedence() {
    let mut value = base_payload();
    let mut path = art_path_layer("path");
    path.as_object_mut()
        .expect("path object")
        .insert("clipMaskIds".to_owned(), json!(["mesh"]));
    layers_mut(&mut value).insert(0, path);
    assert_kind(&value, EvaluationLoweringErrorKind::UnsupportedLayer);

    let mut value = base_payload();
    let mut group = group_layer("group", "overlay");
    group
        .as_object_mut()
        .expect("group object")
        .insert("clipMaskIds".to_owned(), json!(["mesh"]));
    layers_mut(&mut value).insert(0, group);
    assert_kind(
        &value,
        EvaluationLoweringErrorKind::UnsupportedMaskPlacement,
    );

    let mut value = with_bone(base_payload());
    mesh_mut(&mut value, 0)["blendMode"] = json!("overlay");
    let mut controller = ik_controller("ik", 0.5, -1.0, 1.0);
    controller["parameterMappings"] = json!([{
        "boneId": "bone", "parameterId": "parameter",
        "angleMin": -1, "angleMax": 1, "paramMin": -1, "paramMax": 1
    }]);
    root_mut(&mut value)["ikControllers"] = json!([controller]);
    assert_kind(&value, EvaluationLoweringErrorKind::UnsupportedBlendMode);

    let mut value = with_bone(base_payload());
    let mut controller = ik_controller("ik", 0.5, 2.0, 1.0);
    controller["boneChain"] = json!([
        { "boneId": "bone", "minAngle": 2, "maxAngle": 1 },
        { "boneId": "bone", "minAngle": 2, "maxAngle": 1 }
    ]);
    controller["parameterMappings"] = json!([{
        "boneId": "bone", "parameterId": "parameter",
        "angleMin": -1, "angleMax": 1, "paramMin": -1, "paramMax": 1
    }]);
    root_mut(&mut value)["ikControllers"] = json!([controller]);
    assert_kind(
        &value,
        EvaluationLoweringErrorKind::UnsupportedIkParameterMappings,
    );

    let mut value = with_bone(base_payload());
    let mut duplicate = ik_controller("ik-a", 0.5, -1.0, 1.0);
    duplicate["boneChain"] = json!([
        { "boneId": "bone", "minAngle": -1, "maxAngle": 1 },
        { "boneId": "bone", "minAngle": -1, "maxAngle": 1 }
    ]);
    root_mut(&mut value)["ikControllers"] =
        json!([duplicate, ik_controller("ik-b", 0.5, -1.0, 1.0)]);
    assert_kind(
        &value,
        EvaluationLoweringErrorKind::UnsupportedDuplicateIkBone,
    );

    let mut value = with_bone(base_payload());
    root_mut(&mut value)["ikControllers"] = json!([
        ik_controller("ik-a", 0.5, -1.0, 1.0),
        ik_controller("ik-b", 0.5, -1.0, 1.0)
    ]);
    root_mut(&mut value)["physicsGroups"] = json!([
        physics_group("physics-a", true),
        physics_group("physics-b", true)
    ]);
    assert_kind(
        &value,
        EvaluationLoweringErrorKind::UnsupportedMultipleIkControllers,
    );

    let mut value = with_bone(base_payload());
    root_mut(&mut value)["ikControllers"] = json!([ik_controller("ik", 2.0, -1.0, 1.0)]);
    root_mut(&mut value)["physicsGroups"] = json!([
        physics_group("physics-a", true),
        physics_group("physics-b", true)
    ]);
    assert_kind(
        &value,
        EvaluationLoweringErrorKind::UnsupportedMultipleEnabledPhysicsGroups,
    );

    let mut value = with_bone(base_payload());
    root_mut(&mut value)["ikControllers"] = json!([ik_controller("ik", 2.0, -1.0, 1.0)]);
    mesh_mut(&mut value, 0)["mesh"]["vertices"][0] = json!(f64::MAX);
    assert_kind(&value, EvaluationLoweringErrorKind::InvalidIkRange);
}

#[test]
fn physics_cardinality_counts_only_enabled_groups() {
    let mut none_enabled = base_payload();
    root_mut(&mut none_enabled)["physicsGroups"] = json!([
        physics_group("physics-a", false),
        physics_group("physics-b", false),
        physics_group("physics-c", false)
    ]);
    lower_value(&none_enabled).expect("multiple disabled physics groups are inert");

    let mut one_enabled = base_payload();
    root_mut(&mut one_enabled)["physicsGroups"] = json!([
        physics_group("physics-a", false),
        physics_group("physics-b", true),
        physics_group("physics-c", false)
    ]);
    lower_value(&one_enabled).expect("one enabled group plus disabled extras is eligible");
}

#[test]
fn non_mesh_mask_field_presence_rejects_even_an_empty_legacy_array() {
    for mut owner in [group_layer("group", "normal"), bone_layer("bone", "normal")] {
        owner
            .as_object_mut()
            .expect("owner object")
            .insert("clipMaskIds".to_owned(), json!([]));
        let mut value = base_payload();
        layers_mut(&mut value).insert(0, owner);
        assert_kind(
            &value,
            EvaluationLoweringErrorKind::UnsupportedMaskPlacement,
        );
    }

    // The approved schema requires clipMasks to contain an invert=true edge,
    // so an empty editor-form array is rejected upstream and cannot fabricate a
    // validated candidate for this category-2 test.
    let mut invalid_editor_form = base_payload();
    let mut group = group_layer("group", "normal");
    group
        .as_object_mut()
        .expect("group object")
        .insert("clipMasks".to_owned(), json!([]));
    layers_mut(&mut invalid_editor_form).insert(0, group);
    let raw = serde_json::to_vec(&invalid_editor_form).expect("test payload serializes");
    assert!(parse_evaluation_payload_v1(&raw, 5).is_err());
}

#[test]
fn color_presence_and_default_elision_precede_projection() {
    let absent = lower_value(&base_payload()).expect("absent colors are eligible");
    assert_eq!(absent.direct_projected_scalar_count(), 15);
    assert!(absent.meshes[0].multiply_color.is_none());
    assert!(absent.meshes[0].screen_color.is_none());

    let mut black_screen = base_payload();
    mesh_mut(&mut black_screen, 0).insert(
        "screenColor".to_owned(),
        json!({ "r": -0.0, "g": 0.0, "b": -0.0 }),
    );
    let black_screen = lower_value(&black_screen).expect("black screen color is elided");
    assert_eq!(black_screen.direct_projected_scalar_count(), 15);
    assert!(black_screen.meshes[0].screen_color.is_none());

    let mut multiply = base_payload();
    mesh_mut(&mut multiply, 0).insert(
        "multiplyColor".to_owned(),
        json!({ "r": 0.25, "g": 0.5, "b": 1.0 }),
    );
    let multiply = lower_value(&multiply).expect("present multiply color projects");
    assert_eq!(multiply.direct_projected_scalar_count(), 18);
    assert_eq!(
        multiply.meshes[0]
            .multiply_color
            .expect("present multiply")
            .map(f32::to_bits),
        [0x3e80_0000, 0x3f00_0000, 0x3f80_0000]
    );

    let mut screen = base_payload();
    mesh_mut(&mut screen, 0).insert(
        "screenColor".to_owned(),
        json!({ "r": 0.0, "g": 0.5, "b": 1.0 }),
    );
    let screen = lower_value(&screen).expect("nonblack screen color projects");
    assert_eq!(screen.direct_projected_scalar_count(), 18);
    assert_eq!(
        screen.meshes[0]
            .screen_color
            .expect("present screen")
            .map(f32::to_bits),
        [0, 0x3f00_0000, 0x3f80_0000]
    );
}

#[test]
fn category_precedence_and_reservation_injection_match_the_foundation_scope() {
    let mut executed = BTreeSet::new();
    let mut unsupported = base_payload();
    mesh_mut(&mut unsupported, 0)["blendMode"] = json!("overlay");
    mesh_mut(&mut unsupported, 0)["mesh"]["vertices"][0] = json!(f64::MAX);

    let (candidate, mut plan) = candidate_and_plan(&unsupported, 0);
    plan.schema = "wrong".to_owned();
    let error = lower_evaluation_foundation_v1(u64::MAX, candidate, plan)
        .expect_err("generation mismatch wins");
    assert_eq!(error.kind(), EvaluationLoweringErrorKind::Correlation);
    executed.insert("generation-mismatch-beats-everything");

    let (candidate, mut plan) = candidate_and_plan(&unsupported, MAX_SAFE_GENERATION + 1);
    plan.schema = "wrong".to_owned();
    let error = lower_evaluation_foundation_v1(MAX_SAFE_GENERATION + 1, candidate, plan)
        .expect_err("equal unsafe generation wins");
    assert_eq!(
        error.kind(),
        EvaluationLoweringErrorKind::ResourceLimitExceeded
    );
    executed.insert("unsafe-equal-generation-beats-correlation");

    let (candidate, mut plan) = candidate_and_plan(&unsupported, 5);
    plan.schema = "wrong".to_owned();
    let error =
        lower_evaluation_foundation_v1(5, candidate, plan).expect_err("tuple correlation wins");
    assert_eq!(error.kind(), EvaluationLoweringErrorKind::Correlation);
    executed.insert("tuple-correlation-beats-feature-and-number");

    assert_kind(
        &unsupported,
        EvaluationLoweringErrorKind::UnsupportedBlendMode,
    );
    executed.insert("unsupported-feature-beats-direct-projection");

    let mut direct_fault = base_payload();
    mesh_mut(&mut direct_fault, 0)["mesh"]["vertices"][0] = json!(f64::MAX);
    let (candidate, plan) = candidate_and_plan(&direct_fault, 5);
    let correlated =
        correlate_evaluation_activation_v1(5, candidate, plan).expect("inputs correlate");
    let error = lower_correlated_with_reservation(correlated, |_| false)
        .expect_err("direct projection wins before reservation");
    assert_eq!(error.kind(), EvaluationLoweringErrorKind::NumericOverflow);
    executed.insert("direct-projection-beats-resource-reservation");

    let mut derived_deferred = with_bone(base_payload());
    mesh_mut(&mut derived_deferred, 0)["mesh"]["vertices"][0] = json!(f64::MAX);
    root_mut(&mut derived_deferred)["skins"] = json!({
        "mesh": {
            "weights": [
                [{ "boneId": "bone", "weight": 1 }],
                [{ "boneId": "bone", "weight": 1 }],
                [{ "boneId": "bone", "weight": 1 }]
            ],
            "bindPoseInverse": { "bone": [1, 0, 0, 1, 0, 0] }
        }
    });
    let (candidate, plan) = candidate_and_plan(&derived_deferred, 5);
    let correlated =
        correlate_evaluation_activation_v1(5, candidate, plan).expect("inputs correlate");
    let error = lower_correlated_with_reservation(correlated, |_| false)
        .expect_err("category-9 reservation precedes deferred derived evaluation");
    assert_eq!(
        error.kind(),
        EvaluationLoweringErrorKind::ResourceLimitExceeded
    );
    executed.insert("resource-reservation-beats-derived-projection");

    let approved_vectors = vectors();
    let precedence = approved_vectors["precedenceCases"]
        .as_array()
        .expect("precedence cases");
    let applicable = precedence[..6]
        .iter()
        .map(|case| case["id"].as_str().expect("precedence id"))
        .collect::<BTreeSet<_>>();
    assert_eq!(executed, applicable);
    assert_eq!(
        precedence[6]["id"],
        "derived-projection-beats-host-plan-fault"
    );
    assert!(!executed.contains("derived-projection-beats-host-plan-fault"));
}

#[test]
fn skinned_derived_values_are_retained_but_never_evaluated_or_sealed() {
    let mut value = with_bone(base_payload());
    mesh_mut(&mut value, 0)["mesh"]["vertices"][0] = json!(f64::MAX);
    mesh_mut(&mut value, 0)["x"] = json!(f64::MAX);
    mesh_mut(&mut value, 0)["y"] = json!(-f64::MAX);
    root_mut(&mut value)["skins"] = json!({
        "mesh": {
            "weights": [
                [{ "boneId": "bone", "weight": 1 }],
                [{ "boneId": "bone", "weight": 1 }],
                [{ "boneId": "bone", "weight": 1 }]
            ],
            "bindPoseInverse": {
                "bone": [1, 0, 0, 1, 0, 0]
            }
        }
    });

    let foundation =
        lower_value(&value).expect("category-10 skinned values remain deferred by this foundation");
    assert_eq!(foundation.derived_evaluation_mesh_count(), 1);
    assert!(foundation.meshes[0].vertices.is_none());
    assert_eq!(foundation.meshes[0].x.to_bits(), 0);
    assert_eq!(foundation.meshes[0].y.to_bits(), 0);
}

#[test]
fn foundation_owns_inputs_without_exposing_sensitive_debug_data() {
    let sensitive = "private_foundation_marker_d7b4";
    let mut value = base_payload();
    mesh_mut(&mut value, 0)["id"] = json!(sensitive);
    root_mut(&mut value)["atlases"][0]["entries"][0]["layerId"] = json!(sensitive);
    let (candidate, plan) = candidate_and_plan(&value, 5);
    let candidate_schema_pointer = candidate.value()["schema"]
        .as_str()
        .expect("schema string")
        .as_ptr();
    let plan_id_pointer = plan.textures[0].id.as_ptr();
    let foundation =
        lower_evaluation_foundation_v1(5, candidate, plan).expect("foundation succeeds");
    let debug = format!("{foundation:?}");
    assert!(!debug.contains(sensitive));
    assert!(!debug.contains("image/png"));
    assert_eq!(foundation.request_generation(), 5);
    assert_eq!(foundation.texture_binding_count(), 1);
    assert_eq!(foundation.mesh_count(), 1);
    assert_eq!(foundation.canvas_width, 32);
    assert_eq!(foundation.canvas_height, 64);
    assert_eq!(
        foundation.candidate.value()["schema"]
            .as_str()
            .expect("schema string")
            .as_ptr(),
        candidate_schema_pointer
    );
    assert_eq!(
        foundation.texture_plan.textures[0].id.as_ptr(),
        plan_id_pointer
    );
}

#[test]
fn lowering_errors_are_stable_redacted_and_have_no_source_chain() {
    let sensitive = "private_error_marker_9a61";
    let mut value = base_payload();
    mesh_mut(&mut value, 0)["id"] = json!(sensitive);
    mesh_mut(&mut value, 0)["blendMode"] = json!("overlay");
    root_mut(&mut value)["atlases"][0]["entries"][0]["layerId"] = json!(sensitive);
    let error = lower_value(&value).expect_err("extended blend rejects");
    assert_eq!(
        error.kind(),
        EvaluationLoweringErrorKind::UnsupportedBlendMode
    );
    assert_eq!(error.load_status(), 2);
    let debug = format!("{error:?}");
    let display = error.to_string();
    for output in [&debug, &display] {
        assert!(!output.contains(sensitive));
        assert!(!output.contains("atlas:"));
        assert!(!output.contains("image/png"));
        assert!(!output.contains("1.797693"));
    }
    assert!(std::error::Error::source(&error).is_none());
}

#[test]
fn future_inventory_obligations_are_not_misreported_as_executed_fixtures() {
    let vectors = vectors();
    let inventory = vectors["numericFieldInventory"]
        .as_array()
        .expect("numeric inventory");
    let row_obligations = inventory
        .iter()
        .flat_map(|row| {
            row["requiredVectorIds"]
                .as_array()
                .expect("row vector ids")
                .iter()
                .map(|id| id.as_str().expect("row vector id"))
        })
        .collect::<BTreeSet<_>>();
    let owner_obligations = vectors["numericCoverageBinding"]["ownerContextOverrides"]
        .as_array()
        .expect("owner overrides")
        .iter()
        .flat_map(|owner| {
            owner["requiredOwnerContextVectorIds"]
                .as_array()
                .expect("owner vector ids")
                .iter()
                .map(|id| id.as_str().expect("owner vector id"))
        })
        .collect::<BTreeSet<_>>();
    assert_eq!(inventory.len(), 100);
    assert_eq!(row_obligations.len(), 191);
    assert_eq!(owner_obligations.len(), 23);
    assert!(row_obligations.is_disjoint(&owner_obligations));

    // This slice executes the 30 concrete scalar records and the 91 concrete
    // blend/context cases. The 191+23 IDs remain future connection obligations,
    // not 214 executable bodies bundled in this JSON.
    assert_eq!(
        vectors["numericProjection"]
            .as_array()
            .expect("numeric cases")
            .len(),
        30
    );
    assert_eq!(vectors["blendCoverageBinding"]["requiredCases"], 91);
}

#[test]
fn plan_host_fields_and_category_ten_eleven_remain_outside_foundation() {
    let value = base_payload();
    let (candidate, mut plan) = candidate_and_plan(&value, 5);
    plan.textures[0].media_type = "image/jpeg".to_owned();
    plan.textures[0].color_space = "linear".to_owned();
    plan.textures[0].alpha_mode = "premultiplied".to_owned();
    let foundation = lower_evaluation_foundation_v1(5, candidate, plan)
        .expect("host-owned fixed-plan preflight is intentionally later");
    assert_eq!(foundation.texture_binding_count(), 1);
    assert_eq!(foundation.mask_edge_count(), 0);

    let prerequisite = &vectors()["deterministicMathPrerequisite"];
    assert_eq!(prerequisite["threeOsCorpusAloneIsSufficient"], false);
    assert_eq!(
        prerequisite["allowedBeforeClosure"],
        "consumer-zero lowering foundation without core/native/TypeScript evaluator connection or cross-implementation status claim"
    );
}

#[test]
fn fixed_source_manifest_has_no_accidental_direct_dependency_or_publication_edge() {
    let manifest = include_str!("../Cargo.toml");
    assert!(manifest.contains("vivi-runtime-native-preactivation"));
    assert!(manifest.contains("serde_json"));
    assert!(!manifest.contains("vivi-runtime-native-core"));
    assert!(!manifest.contains("vivi-runtime-native-c-abi"));
    assert!(!manifest.contains("vivi-runtime-native-wasm"));
    assert!(!manifest.contains("vivi-runtime-native-evaluation ="));
    assert!(manifest.contains("publish = false"));
    assert!(!manifest.contains("[workspace]"));

    let lowering_source = include_str!("lower.rs");
    assert_eq!(lowering_source.matches("value as f32").count(), 1);
    assert!(lowering_source.contains("validate_binary64_for_projection"));
    assert!(lowering_source.contains("magnitude_bits"));

    let approved_vectors = vectors();
    let non_claims = approved_vectors["nonClaims"]
        .as_array()
        .expect("non-claims")
        .iter()
        .map(|value| value.as_str().expect("non-claim"))
        .collect::<Vec<_>>();
    assert!(non_claims.contains(&"no WASM Evaluation surface"));
    assert!(non_claims.contains(&"no GPU upload or active-model swap"));
}

#[test]
fn root_helpers_are_not_dependent_on_json_object_member_order() {
    let value = base_payload();
    assert_eq!(root(&value)["schema"], "vivi2d.evaluationPayload.v1");
    let foundation = lower_value(&value).expect("canonical base payload lowers");
    assert_eq!(foundation.direct_projected_scalar_count(), 15);
}
