use super::*;
use crate::{EvaluationActivationV1, EvaluationRuntimeV1};
use serde_json::json;
use vivi_runtime_native_evaluation_lowering::{AssetRef, EvaluationTextureBindingV1};

fn inputs(asset: AssetRef) -> (Vec<u8>, EvaluationTexturePlanV1) {
    let payload = json!({
        "schema":"vivi2d.evaluationPayload.v1", "canvas":{"width":32,"height":32},
        "layers":[{"id":"mesh","name":"Synthetic","kind":"viviMesh","visible":true,"opacity":1,
            "x":0,"y":0,"width":1,"height":1,"blendMode":"normal","expanded":true,"children":[],
            "mesh":{"vertices":[0,0,1,0,0,1],"uvs":[0,0,1,0,0,1],"indices":[0,1,2],"divisionsX":1,"divisionsY":1}}],
        "parameters":[],"parameterBindings":[],"skins":{},"ikControllers":[],"physicsGroups":[],"colliders":[],
        "expressionPresets":[],"clips":[],"stateMachines":[],
        "atlases":[{"id":"synthetic","width":1,"height":1,"entries":[{"layerId":"mesh","x":0,"y":0,"width":1,"height":1}]}]
    });
    (
        serde_json::to_vec(&payload).unwrap(),
        EvaluationTexturePlanV1 {
            schema: "vivi2d.evaluationTexturePlan.v1".into(),
            textures: vec![EvaluationTextureBindingV1 {
                id: "atlas:synthetic".into(),
                asset,
                width: 1,
                height: 1,
                media_type: "image/png".into(),
                color_space: "srgb".into(),
                alpha_mode: "straight".into(),
            }],
        },
    )
}

#[test]
fn actual_byte_entry_and_same_seal_retry_activate_without_update_zero() {
    let (_directory, _host, asset) = crate::evaluation::tests::fixture();
    let (payload, plan) = inputs(asset.clone());
    let PrepareLoweredEvaluationV1::Missing(missing) =
        prepare_evaluation_bytes_v1(1, &payload, plan, vec![]).unwrap()
    else {
        panic!("absent input")
    };
    let before_vertices = missing
        .candidate()
        .mesh_snapshot(0)
        .unwrap()
        .unwrap()
        .vertex_bits()
        .collect::<Vec<_>>();
    assert_eq!(missing.candidate().dynamic_generation(), 0);
    assert_eq!(missing.candidate().topology_generation(), 1);
    let PrepareLoweredEvaluationV1::Ready(ready) = retry_evaluation_bytes_v1(
        missing,
        vec![EvaluationPhysicalObjectV1 {
            object_address: asset.object_address,
            bytes: crate::evaluation::tests::PNG.to_vec(),
        }],
    )
    .unwrap() else {
        panic!("real replacement bytes")
    };
    assert_eq!(ready.candidate().dynamic_generation(), 0);
    assert_eq!(
        ready
            .candidate()
            .mesh_snapshot(0)
            .unwrap()
            .unwrap()
            .vertex_bits()
            .collect::<Vec<_>>(),
        before_vertices
    );
    let mut runtime = EvaluationRuntimeV1::new();
    runtime.observe_request_state(1, false).unwrap();
    assert_eq!(
        runtime.try_activate(ready).unwrap(),
        EvaluationActivationV1::Activated {
            model_generation: 1
        }
    );
    let active = runtime.active().unwrap();
    assert_eq!(active.generations().dynamic, 0);
    assert_eq!(
        active.prepared_textures().textures()[0]
            .ready_png()
            .decoded()
            .rgba,
        [0x12, 0x34, 0x56, 0]
    );
    runtime.update(0f64.to_bits()).unwrap();
    assert_eq!(runtime.active().unwrap().generations().dynamic, 1);
}

#[test]
fn parser_error_precedes_later_bad_texture_inputs() {
    let (_directory, _host, asset) = crate::evaluation::tests::fixture();
    let (_, plan) = inputs(asset);
    let error = prepare_evaluation_bytes_v1(1, b"not-json", plan, vec![]).unwrap_err();
    assert!(matches!(error, EvaluationPreparationError::Payload(_)));
    assert!(!format!("{error:?}").contains("not-json"));
}
