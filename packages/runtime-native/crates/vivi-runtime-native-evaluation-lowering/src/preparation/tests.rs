use super::*;
use crate::lower::preflight_correlated;
use crate::observation::{Observer, TraceRecord};
use crate::reservation::ReservationStateV1;
use crate::sealed_candidate::seal_preflighted;
use serde_json::json;
use tempfile::TempDir;
use vivi_runtime_native_preactivation::{
    AssetErrorCode, AssetRef, Digest, EvaluationPreactivationErrorKind, EvaluationTextureBindingV1,
    EvaluationTexturePlanV1, PrincipalId, StorageKind, correlate_evaluation_activation_v1,
    parse_evaluation_payload_v1,
};

// The existing preactivation suite's synthetic 1x1 PNG, not a product asset.
const PNG: &[u8] = &[
    137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0,
    0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 120, 156, 99, 16, 50, 9, 99, 0, 0, 1, 149,
    0, 157, 77, 65, 8, 223, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
];
const MARKER: &str = "postseal-canary";

fn host() -> (TempDir, LocalAssetHost) {
    let mut builder = tempfile::Builder::new();
    builder.prefix(MARKER);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt as _;
        builder.permissions(std::fs::Permissions::from_mode(0o700));
    }
    let directory = builder.tempdir().expect("temporary fixture directory");
    let host = LocalAssetHost::open(
        directory.path().join("postseal-canary.sqlite3"),
        PrincipalId::new(MARKER.as_bytes().to_vec()),
    )
    .expect("synthetic host opens");
    (directory, host)
}

fn missing() -> AssetRef {
    AssetRef {
        object_address: Digest::from_bytes([9; 32]),
        content_sha256: Digest::from_bytes([9; 32]),
        storage_kind: StorageKind::Blob,
        media_type: "image/png".to_owned(),
        size_bytes: 0,
    }
}

fn seal(assets: &[AssetRef], observer: &mut Observer<'_>) -> SealedEvaluationCandidateV1 {
    let layers = assets
        .iter()
        .enumerate()
        .map(|(slot, _)| {
            json!({
                "id": format!("mesh-{MARKER}-{slot}"), "name": MARKER, "kind": "viviMesh",
                "visible":true,"opacity":1,"x":0,"y":0,"width":1,"height":1,
                "blendMode":"normal","expanded":true,"children":[],
                "mesh":{"vertices":[0,0,1,0,0,1],"uvs":[0,0,1,0,0,1],
                    "indices":[0,1,2],"divisionsX":1,"divisionsY":1}
            })
        })
        .collect::<Vec<_>>();
    let atlases = assets
        .iter()
        .enumerate()
        .map(|(slot, _)| {
            json!({
                "id":format!("atlas-{MARKER}-{slot}"),"width":1,"height":1,
                "entries":[{"layerId":format!("mesh-{MARKER}-{slot}"),
                    "x":0,"y":0,"width":1,"height":1}]
            })
        })
        .collect::<Vec<_>>();
    let mut value = json!({
        "schema":"vivi2d.evaluationPayload.v1","canvas":{"width":32,"height":32},
        "layers":layers,"parameters":[],"parameterBindings":[],"skins":{},
        "ikControllers":[],"physicsGroups":[],"colliders":[],"expressionPresets":[],
        "clips":[],"stateMachines":[],"atlases":atlases
    });
    value["layers"].as_array_mut().unwrap().push(json!({
        "id":"bone-postseal-canary","name":MARKER,"kind":"bone","visible":true,
        "opacity":1,"x":0,"y":0,"width":1,"height":1,"blendMode":"normal",
        "expanded":true,"children":[],"bone":{"angle":0,"length":1,"scaleX":1,"scaleY":1}
    }));
    let plan = EvaluationTexturePlanV1 {
        schema: "vivi2d.evaluationTexturePlan.v1".to_owned(),
        textures: assets
            .iter()
            .enumerate()
            .map(|(slot, asset)| EvaluationTextureBindingV1 {
                id: format!("atlas:atlas-{MARKER}-{slot}"),
                asset: asset.clone(),
                width: 1,
                height: 1,
                media_type: "image/png".to_owned(),
                color_space: "srgb".to_owned(),
                alpha_mode: "straight".to_owned(),
            })
            .collect(),
    };
    let candidate = parse_evaluation_payload_v1(&serde_json::to_vec(&value).unwrap(), 17)
        .expect("synthetic public payload admitted");
    let preflight =
        preflight_correlated(correlate_evaluation_activation_v1(17, candidate, plan).unwrap())
            .unwrap();
    seal_preflighted(preflight, &mut ReservationStateV1::production(), observer).unwrap()
}

fn snapshot(value: &SealedEvaluationCandidateV1) -> Vec<u32> {
    let mut words = Vec::new();
    for slot in 0..value.mesh_count() {
        let mesh = value.mesh_snapshot(slot).unwrap().unwrap();
        words.extend([
            mesh.mesh_slot(),
            mesh.texture_slot(),
            mesh.opacity_bits(),
            mesh.blend(),
            u32::from(mesh.visible()),
            u32::from(mesh.culled()),
        ]);
        words.extend(mesh.translation_bits());
        words.extend(mesh.vertex_bits());
        words.extend(mesh.uv_bits());
        words.extend(mesh.indices());
    }
    words.extend(value.draw_commands().flatten());
    words
}

#[test]
fn actual_ready_handoff_and_parts_move_exact_owned_buffers_with_redacted_debug() {
    let (_directory, mut host) = host();
    let asset = host.materialize_embedded_png(PNG, 1, 1).unwrap().asset;
    let mut records = [TraceRecord::EMPTY; 512];
    let mut observer = Observer::recording(&mut records);
    let candidate = seal(&[asset], &mut observer);
    assert!(
        !observer.records().is_empty(),
        "fixture actually runs initial math"
    );
    let before = snapshot(&candidate);
    let plan_id = candidate.texture_plan().textures[0].id.as_ptr();
    let outcome = prepare_evaluation_texture_plan_v1(&host, 17, candidate.texture_plan()).unwrap();
    let PrepareActivationTextureSetV1::Ready(textures) = &outcome else {
        panic!("real Ready")
    };
    let texture_table = textures.textures().as_ptr();
    let png = textures.textures()[0].ready_png();
    let logical = (png.logical_bytes().as_ptr(), png.logical_bytes().len());
    let rgba = (png.decoded().rgba.as_ptr(), png.decoded().rgba.len());
    let result = own_outcome(candidate, outcome);
    assert!(!format!("{result:?}").contains(MARKER));
    let PrepareLoweredEvaluationV1::Ready(ready) = result else {
        panic!("real Ready")
    };
    assert_eq!(ready.request_generation(), 17);
    assert_eq!(ready.candidate().dynamic_generation(), 0);
    assert_eq!(ready.candidate().topology_generation(), 1);
    assert_eq!(snapshot(ready.candidate()), before);
    assert!(ready.candidate().texture_plan().textures[0].id.as_ptr() == plan_id);
    assert!(ready.prepared_textures().textures().as_ptr() == texture_table);
    assert_eq!(ready.prepared_textures().total_pixels(), 1);
    assert_eq!(ready.prepared_textures().total_rgba_bytes(), 4);
    let (candidate, prepared) = ready.into_parts();
    let png = prepared.textures()[0].ready_png();
    assert!((png.logical_bytes().as_ptr(), png.logical_bytes().len()) == logical);
    assert!((png.decoded().rgba.as_ptr(), png.decoded().rgba.len()) == rgba);
    assert_eq!(png.logical_bytes(), PNG);
    assert_eq!(png.decoded().rgba, [0x12, 0x34, 0x56, 0]);
    assert_eq!(snapshot(&candidate), before);
}

#[test]
fn actual_missing_retains_same_seal_and_retry_prepares_without_reinitializing() {
    let (_donor_dir, mut donor) = host();
    let asset = donor.materialize_embedded_png(PNG, 1, 1).unwrap().asset;
    let (_receiver_dir, mut receiver) = host();
    let mut records = [TraceRecord::EMPTY; 512];
    let mut observer = Observer::recording(&mut records);
    let candidate = seal(&[asset.clone(), asset.clone()], &mut observer);
    let initial_trace = observer.records().to_vec();
    assert!(!initial_trace.is_empty());
    let before = snapshot(&candidate);
    let plan_id = candidate.texture_plan().textures[0].id.as_ptr();
    let result = prepare_lowered_evaluation_v1(&receiver, candidate).unwrap();
    assert!(!format!("{result:?}").contains(MARKER));
    let PrepareLoweredEvaluationV1::Missing(missing) = result else {
        panic!("real Missing")
    };
    assert_eq!(missing.request_generation(), 17);
    assert_eq!(
        missing.missing_textures().texture_ids(),
        &[
            "atlas:atlas-postseal-canary-0",
            "atlas:atlas-postseal-canary-1"
        ]
    );
    assert_eq!(snapshot(missing.candidate()), before);
    let missing_ids = missing.missing_textures().texture_ids().as_ptr();
    let (candidate, data) = missing.into_parts();
    assert!(data.texture_ids().as_ptr() == missing_ids);
    assert!(candidate.texture_plan().textures[0].id.as_ptr() == plan_id);
    assert_eq!(
        receiver.materialize_embedded_png(PNG, 1, 1).unwrap().asset,
        asset
    );
    let PrepareLoweredEvaluationV1::Ready(ready) =
        prepare_lowered_evaluation_v1(&receiver, candidate).unwrap()
    else {
        panic!("same sealed candidate becomes Ready")
    };
    assert_eq!(ready.prepared_textures().textures().len(), 2);
    assert_eq!(ready.candidate().dynamic_generation(), 0);
    assert_eq!(ready.candidate().topology_generation(), 1);
    assert_eq!(snapshot(ready.candidate()), before);
    assert!(ready.candidate().texture_plan().textures[0].id.as_ptr() == plan_id);
    // The original seal observer remains unchanged; the preparation call graph
    // has no evaluator/constructor access, rather than a second silent oracle.
    assert_eq!(observer.records(), initial_trace);
}

#[test]
fn real_later_descriptor_error_wins_over_earlier_missing_without_leaking_data() {
    let (_directory, mut host) = host();
    let mut descriptor_mismatch = host.materialize_embedded_png(PNG, 1, 1).unwrap().asset;
    descriptor_mismatch.size_bytes += 1;
    let candidate = seal(&[missing(), descriptor_mismatch], &mut Observer::silent());
    let error = prepare_lowered_evaluation_v1(&host, candidate).unwrap_err();
    assert_eq!(error.kind(), EvaluationPreactivationErrorKind::Asset);
    assert_eq!(error.asset_code(), Some(AssetErrorCode::DescriptorMismatch));
    assert_eq!(error.load_status(), 14);
    assert_eq!(error.store_kind(), None);
    assert!(!format!("{error:?} {error}").contains(MARKER));
}
