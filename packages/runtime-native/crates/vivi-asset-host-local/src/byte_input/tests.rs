use super::*;
use crate::{EvaluationTextureBindingV1, LocalAssetHostErrorKind, StorageKind};
use base64::{Engine as _, engine::general_purpose::STANDARD};
use sha2::{Digest as _, Sha256};

fn png() -> Vec<u8> {
    // Same synthetic one-pixel fixture as the existing native host suite.
    STANDARD.decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGMQMgljAAABlQCdTUEI3wAAAABJRU5ErkJggg==").unwrap()
}
fn reference(bytes: &[u8]) -> AssetRef {
    let digest = Digest::from_bytes(Sha256::digest(bytes).into());
    AssetRef {
        object_address: digest,
        content_sha256: digest,
        storage_kind: StorageKind::Blob,
        media_type: "image/png".into(),
        size_bytes: bytes.len() as u64,
    }
}
fn plan(assets: &[AssetRef]) -> EvaluationTexturePlanV1 {
    EvaluationTexturePlanV1 {
        schema: "vivi2d.evaluationTexturePlan.v1".into(),
        textures: assets
            .iter()
            .enumerate()
            .map(|(index, asset)| EvaluationTextureBindingV1 {
                id: format!("atlas:a{index}"),
                asset: asset.clone(),
                width: 1,
                height: 1,
                media_type: "image/png".into(),
                color_space: "srgb".into(),
                alpha_mode: "straight".into(),
            })
            .collect(),
    }
}
fn object(bytes: Vec<u8>) -> EvaluationPhysicalObjectV1 {
    EvaluationPhysicalObjectV1 {
        object_address: reference(&bytes).object_address,
        bytes,
    }
}

#[test]
fn pure_bytes_really_decode_and_missing_has_no_partial_ready() {
    let bytes = png();
    let asset = reference(&bytes);
    let PrepareActivationTextureSetV1::Ready(ready) = prepare_activation_texture_set_from_bytes(
        7,
        &plan(std::slice::from_ref(&asset)),
        vec![object(bytes.clone())],
    )
    .unwrap() else {
        panic!("real PNG must be ready")
    };
    assert_eq!(ready.request_generation(), 7);
    assert_eq!(ready.textures()[0].ready_png().logical_bytes(), bytes);
    assert_eq!(
        ready.textures()[0].ready_png().decoded().rgba,
        [0x12, 0x34, 0x56, 0]
    );
    let absent = reference(b"absent");
    let PrepareActivationTextureSetV1::Missing(missing) =
        prepare_activation_texture_set_from_bytes(7, &plan(&[asset, absent]), vec![object(bytes)])
            .unwrap()
    else {
        panic!("missing cannot expose earlier Ready")
    };
    assert_eq!(missing.texture_ids(), ["atlas:a1"]);
}

#[test]
fn exact_input_set_and_later_resolver_error_do_not_mask_each_other() {
    let bytes = png();
    let asset = reference(&bytes);
    let extra = object(b"extra".to_vec());
    let error = prepare_activation_texture_set_from_bytes(
        7,
        &plan(std::slice::from_ref(&asset)),
        vec![object(bytes.clone()), extra],
    )
    .unwrap_err();
    assert_eq!(error.asset_code(), Some(AssetErrorCode::RefSetMismatch));
    let error = prepare_activation_texture_set_from_bytes(
        7,
        &plan(std::slice::from_ref(&asset)),
        vec![object(bytes.clone()), object(bytes.clone())],
    )
    .unwrap_err();
    assert_eq!(error.asset_code(), Some(AssetErrorCode::RefSetMismatch));
    let mut corrupted = bytes;
    corrupted[0] ^= 1;
    let error = prepare_activation_texture_set_from_bytes(
        7,
        &plan(&[reference(b"absent"), asset.clone()]),
        vec![
            EvaluationPhysicalObjectV1 {
                object_address: asset.object_address,
                bytes: corrupted,
            },
            object(b"extra".to_vec()),
        ],
    )
    .unwrap_err();
    assert_eq!(error.asset_code(), Some(AssetErrorCode::HashMismatch));
}

#[test]
fn typed_batch_caps_precede_resolution_and_owned_snapshot_respects_read_limit() {
    let inputs = (0..=MAX_OBJECTS).map(|_| object(Vec::new())).collect();
    assert_eq!(
        prepare_activation_texture_set_from_bytes(7, &plan(&[]), inputs)
            .unwrap_err()
            .kind(),
        LocalAssetHostErrorKind::ResourceLimitExceeded
    );
    let oversized = EvaluationPhysicalObjectV1 {
        object_address: Digest::from_bytes([0; 32]),
        bytes: vec![0; MAX_BYTES + 1],
    };
    assert_eq!(
        prepare_activation_texture_set_from_bytes(7, &plan(&[]), vec![oversized])
            .unwrap_err()
            .kind(),
        LocalAssetHostErrorKind::ResourceLimitExceeded
    );
    let bytes = png();
    let asset = reference(&bytes);
    let plan = plan(std::slice::from_ref(&asset));
    let principal = PrincipalId::new(Vec::new());
    let store = PhysicalInputs {
        plan: &plan,
        objects: vec![object(bytes.clone())],
        used: Cell::new([0; 5]),
        principal: &principal,
    };
    assert_eq!(
        store.object(&principal, asset.object_address, 0).unwrap(),
        ObjectRead::TooLarge
    );
    let ObjectRead::Snapshot(mut snapshot) = store
        .object(&principal, asset.object_address, bytes.len() as u64)
        .unwrap()
    else {
        panic!("captured object")
    };
    assert_eq!(snapshot.storage_generation, 1);
    snapshot.bytes[0] ^= 1;
    assert_eq!(store.objects[0].bytes, bytes);
}
