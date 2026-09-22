use super::*;
use serde_json::json;
use tempfile::TempDir;
use vivi_runtime_native_evaluation_lowering::{
    LocalAssetHost, PrepareLoweredEvaluationV1, lower_sealed_evaluation_v1,
    prepare_lowered_evaluation_v1,
};
use vivi_runtime_native_preactivation::{
    AssetRef, Digest, EvaluationTextureBindingV1, EvaluationTexturePlanV1, PrincipalId,
    parse_evaluation_payload_v1,
};

// Existing preactivation/post-seal synthetic PNG, never product imagery.
pub(super) const PNG: &[u8] = &[
    137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0,
    0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 120, 156, 99, 16, 50, 9, 99, 0, 0, 1, 149,
    0, 157, 77, 65, 8, 223, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
];
const CANARY: &str = "owner-canary";

pub(super) fn fixture() -> (TempDir, LocalAssetHost, AssetRef) {
    let mut builder = tempfile::Builder::new();
    builder.prefix(CANARY);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt as _;
        builder.permissions(std::fs::Permissions::from_mode(0o700));
    }
    let directory = builder.tempdir().unwrap();
    let mut host = LocalAssetHost::open(
        directory.path().join("owner-canary.sqlite3"),
        PrincipalId::new(CANARY.as_bytes().to_vec()),
    )
    .unwrap();
    let asset = host.materialize_embedded_png(PNG, 1, 1).unwrap().asset;
    (directory, host, asset)
}

fn sealed(generation: u64, asset: &AssetRef) -> SealedEvaluationCandidateV1 {
    let value = json!({
        "schema":"vivi2d.evaluationPayload.v1", "canvas":{"width":32,"height":32},
        "layers":[{
            "id":CANARY,"name":CANARY,"kind":"viviMesh","visible":true,"opacity":1,
            "x":0,"y":0,"width":1,"height":1,"blendMode":"normal","expanded":true,"children":[],
            "mesh":{"vertices":[0,0,1,0,0,1],"uvs":[0,0,1,0,0,1],"indices":[0,1,2],"divisionsX":1,"divisionsY":1}
        },{
            "id":"parent","name":CANARY,"kind":"bone","visible":true,"opacity":1,
            "x":0,"y":0,"width":1,"height":1,"blendMode":"normal","expanded":true,
            "bone":{"angle":0,"length":1,"scaleX":1,"scaleY":1},
            "children":[{
                "id":"child","parentBoneId":"parent","name":CANARY,"kind":"bone","visible":true,"opacity":1,
                "x":0,"y":0,"width":1,"height":1,"blendMode":"normal","expanded":true,"children":[],
                "bone":{"angle":0,"length":1,"scaleX":2,"scaleY":1}
            }]
        }],
        "parameters":[{"id":"drive","name":CANARY,"minValue":0,"maxValue":1,"defaultValue":0}],
        "parameterBindings":[{"id":"scale","parameterId":"drive",
            "target":{"type":"bone","boneId":"parent","property":"scaleX"},
            "bindingPoints":[{"paramValue":0,"targetValue":1},{"paramValue":1,"targetValue":f64::MAX}]}],
        "skins":{},"ikControllers":[],"physicsGroups":[],"colliders":[],
        "expressionPresets":[{"id":"repair","name":"Repair","values":{"drive":0}}],"clips":[],"stateMachines":[],
        "atlases":[{"id":"owner-canary","width":1,"height":1,
            "entries":[{"layerId":CANARY,"x":0,"y":0,"width":1,"height":1}]}]
    });
    let plan = EvaluationTexturePlanV1 {
        schema: "vivi2d.evaluationTexturePlan.v1".to_owned(),
        textures: vec![EvaluationTextureBindingV1 {
            id: "atlas:owner-canary".to_owned(),
            asset: asset.clone(),
            width: 1,
            height: 1,
            media_type: "image/png".to_owned(),
            color_space: "srgb".to_owned(),
            alpha_mode: "straight".to_owned(),
        }],
    };
    let candidate =
        parse_evaluation_payload_v1(&serde_json::to_vec(&value).unwrap(), generation).unwrap();
    lower_sealed_evaluation_v1(generation, candidate, plan).unwrap()
}

fn ready(host: &LocalAssetHost, generation: u64, asset: &AssetRef) -> PreparedLoweredEvaluationV1 {
    let PrepareLoweredEvaluationV1::Ready(ready) =
        prepare_lowered_evaluation_v1(host, sealed(generation, asset)).unwrap()
    else {
        panic!("actual complete Ready")
    };
    ready
}

fn mesh_words(active: &ActiveEvaluationV1) -> Vec<u32> {
    let mesh = active.candidate().mesh_snapshot(0).unwrap().unwrap();
    mesh.vertex_bits()
        .chain(mesh.uv_bits())
        .chain(mesh.indices())
        .collect()
}

#[test]
fn actual_ready_moves_once_and_delegated_failure_preserves_committed_state() {
    let (_directory, host, asset) = fixture();
    let prepared = ready(&host, 1, &asset);
    let png = prepared.prepared_textures().textures()[0].ready_png();
    let logical = (png.logical_bytes().as_ptr(), png.logical_bytes().len());
    let rgba = (png.decoded().rgba.as_ptr(), png.decoded().rgba.len());
    let vertices = prepared
        .candidate()
        .mesh_snapshot(0)
        .unwrap()
        .unwrap()
        .vertex_bits()
        .collect::<Vec<_>>();
    let mut owner = EvaluationRuntimeV1::new();
    assert_eq!(owner.update(0).unwrap_err().status(), 1);
    owner.observe_request_state(1, false).unwrap();
    assert_eq!(
        owner.try_activate(prepared).unwrap(),
        EvaluationActivationV1::Activated {
            model_generation: 1
        }
    );
    let active = owner.active().unwrap();
    assert_eq!(
        active.generations(),
        EvaluationGenerationsV1 {
            request: 1,
            model: 1,
            topology: 1,
            dynamic: 0
        }
    );
    assert_eq!(
        active
            .candidate()
            .mesh_snapshot(0)
            .unwrap()
            .unwrap()
            .vertex_bits()
            .collect::<Vec<_>>(),
        vertices
    );
    let before = mesh_words(active);
    let png = active.prepared_textures().textures()[0].ready_png();
    assert!((png.logical_bytes().as_ptr(), png.logical_bytes().len()) == logical);
    assert!((png.decoded().rgba.as_ptr(), png.decoded().rgba.len()) == rgba);
    assert_eq!(png.decoded().rgba, [0x12, 0x34, 0x56, 0]);
    assert!(!format!("{owner:?}").contains(CANARY));

    owner.set_input("drive", 1.0_f64.to_bits()).unwrap();
    let error = owner.update(0).unwrap_err();
    assert_eq!(error.status(), 9);
    assert!(!format!("{error:?} {error}").contains(CANARY));
    let active = owner.active().unwrap();
    assert_eq!(active.generations().dynamic, 0);
    assert_eq!(mesh_words(active), before);
    let parameter = active.candidate().parameter_snapshot(0).unwrap().unwrap();
    assert_eq!(parameter.current_bits(), 1.0_f64.to_bits());
    assert_eq!(parameter.evaluated_bits(), 0);
    owner.apply_preset("repair").unwrap();
    owner.update(0).unwrap();
    assert_eq!(owner.active().unwrap().generations().dynamic, 1);
    assert_eq!(owner.apply_preset(CANARY).unwrap_err().status(), 1);
    let png = owner.active().unwrap().prepared_textures().textures()[0].ready_png();
    assert!((png.decoded().rgba.as_ptr(), png.decoded().rgba.len()) == rgba);
    owner.observe_request_state(2, false).unwrap();
    owner.try_activate(ready(&host, 2, &asset)).unwrap();
    assert_eq!(
        owner.active().unwrap().generations(),
        EvaluationGenerationsV1 {
            request: 2,
            model: 2,
            topology: 1,
            dynamic: 0
        }
    );
}

#[test]
fn stale_duplicate_zero_and_sticky_exhaustion_precede_checked_model_counter() {
    let (_directory, host, asset) = fixture();
    let mut owner = EvaluationRuntimeV1::new();
    assert_eq!(
        owner.try_activate(ready(&host, 0, &asset)).unwrap(),
        EvaluationActivationV1::Superseded
    );
    assert!(owner.active().is_none());
    owner.observe_request_state(1, false).unwrap();
    owner.try_activate(ready(&host, 1, &asset)).unwrap();
    let before = owner.active().unwrap().generations();
    owner.observe_request_state(2, false).unwrap(); // Newer failure/Missing never rolls this back.
    assert_eq!(
        owner.try_activate(ready(&host, 1, &asset)).unwrap(),
        EvaluationActivationV1::Superseded
    );
    assert_eq!(owner.active().unwrap().generations(), before);
    assert_eq!(
        owner.observe_request_state(1, true).unwrap_err().status(),
        1
    );
    assert_eq!(
        owner
            .observe_request_state(MAX_SAFE_REQUEST + 1, true)
            .unwrap_err()
            .status(),
        1
    );
    assert_eq!((owner.latest_observed, owner.exhausted), (2, false));
    owner.try_activate(ready(&host, 2, &asset)).unwrap();
    let before = owner.active().unwrap().generations();
    owner.last_model_generation = u64::MAX; // Private unit-only boundary setup.
    assert_eq!(
        owner.try_activate(ready(&host, 2, &asset)).unwrap(),
        EvaluationActivationV1::Superseded
    );
    owner.observe_request_state(3, false).unwrap();
    assert_eq!(
        owner
            .try_activate(ready(&host, 3, &asset))
            .unwrap_err()
            .status(),
        10
    );
    assert_eq!(owner.active().unwrap().generations(), before);
    assert_eq!(owner.last_model_generation, u64::MAX);
    owner.observe_request_state(3, true).unwrap();
    assert_eq!(
        owner.try_activate(ready(&host, 3, &asset)).unwrap(),
        EvaluationActivationV1::Superseded
    );
    owner.observe_request_state(4, false).unwrap();
    assert!(owner.exhausted);
    assert_eq!(
        owner.try_activate(ready(&host, 4, &asset)).unwrap(),
        EvaluationActivationV1::Superseded
    );
    assert_eq!(owner.active().unwrap().generations(), before);
    owner.update(0).unwrap(); // Request exhaustion does not disable the incumbent.
}

#[test]
fn real_missing_and_hard_preparation_failure_do_not_publish_or_revert_latest() {
    let (_directory, host, asset) = fixture();
    let mut owner = EvaluationRuntimeV1::new();
    owner.observe_request_state(1, false).unwrap();
    owner.try_activate(ready(&host, 1, &asset)).unwrap();
    let before = owner.active().unwrap().generations();
    owner.observe_request_state(2, false).unwrap();
    let mut absent = asset.clone();
    absent.object_address = Digest::from_bytes([9; 32]);
    absent.content_sha256 = absent.object_address;
    assert!(matches!(
        prepare_lowered_evaluation_v1(&host, sealed(2, &absent)).unwrap(),
        PrepareLoweredEvaluationV1::Missing(_)
    ));
    let mut invalid = asset.clone();
    invalid.size_bytes += 1;
    assert_eq!(
        prepare_lowered_evaluation_v1(&host, sealed(2, &invalid))
            .unwrap_err()
            .load_status(),
        14
    );
    assert_eq!(owner.active().unwrap().generations(), before);
    assert_eq!(owner.latest_observed, 2);
    assert_eq!(
        owner.try_activate(ready(&host, 1, &asset)).unwrap(),
        EvaluationActivationV1::Superseded
    );
}
