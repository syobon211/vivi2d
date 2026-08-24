use std::cell::{Cell, RefCell};
use std::collections::{HashMap, HashSet};
use std::fmt;
use std::path::Path;

use base64::Engine as _;
use base64::engine::general_purpose::STANDARD;
use sha2::{Digest as _, Sha256};
use tempfile::TempDir;
use vivi_asset_resolver::{
    AssetError, AssetErrorCode, AssetReadStore, AssetRef, Descriptor, Digest, ObjectRead,
    ObjectSnapshot, ObjectState, OperationError, PrincipalId, StorageKind, parse_chunk_manifest,
    prepare_embedded_png,
};
use vivi_asset_store_local::LocalStoreErrorKind;

use crate::LocalAssetHost;
use crate::error::LocalAssetHostErrorKind;
use crate::host::{
    ReferencedPngManifestWriteStore, ingest_referenced_png_manifest_closure_into_store,
    prepare_activation_texture_set_from_store,
};
use crate::model::{
    EvaluationTextureBindingV1, EvaluationTexturePlanV1, PrepareActivationTextureSetV1,
    ReferencedAtlasResolutionV1, ReferencedPngClosureObjectV1, ReferencedPngManifestClosureV1,
};

const PNG_BASE64: &str = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGMQMgljAAABlQCdTUEI3wAAAABJRU5ErkJggg==";
const GENERATION: u64 = 41;

fn png_bytes() -> Vec<u8> {
    STANDARD.decode(PNG_BASE64).expect("fixture is base64")
}

fn principal() -> PrincipalId {
    PrincipalId::new(b"host-local-test-principal".to_vec())
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

fn blob_reference(byte: u8) -> AssetRef {
    let digest = digest(byte);
    AssetRef {
        object_address: digest,
        storage_kind: StorageKind::Blob,
        content_sha256: digest,
        media_type: "image/png".to_owned(),
        size_bytes: 0,
    }
}

fn binding(id: &str, asset: AssetRef, width: u32, height: u32) -> EvaluationTextureBindingV1 {
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

fn plan(textures: Vec<EvaluationTextureBindingV1>) -> EvaluationTexturePlanV1 {
    EvaluationTexturePlanV1 {
        schema: "vivi2d.evaluationTexturePlan.v1".to_owned(),
        textures,
    }
}

#[test]
fn embedded_materialization_returns_exact_attestation_and_reopens_as_reference() {
    let temp = private_tempdir();
    let mut host = open_host(&temp);
    let bytes = png_bytes();

    let verified = host
        .materialize_embedded_png(&bytes, 1, 1)
        .expect("materialization succeeds");
    assert_eq!(verified.png.profile, "vivi2d.png.rgba8.v1");
    assert_eq!((verified.png.width, verified.png.height), (1, 1));
    assert_eq!(verified.asset.media_type, "image/png");
    assert_eq!(verified.asset.size_bytes, bytes.len() as u64);
    assert_eq!(verified.asset.object_address, verified.asset.content_sha256);

    let resolved = host
        .resolve_referenced_png(&verified.asset, 1, 1)
        .expect("reference resolves");
    assert_eq!(resolved, ReferencedAtlasResolutionV1::Ready(verified));
}

#[test]
fn referenced_missing_is_a_state_distinct_from_hard_errors() {
    let temp = private_tempdir();
    let host = open_host(&temp);
    let reference = blob_reference(7);

    assert_eq!(
        host.resolve_referenced_png(&reference, 1, 1)
            .expect("absence is not an error"),
        ReferencedAtlasResolutionV1::Missing
    );

    let error = host
        .resolve_referenced_png(
            &AssetRef {
                object_address: digest(8),
                storage_kind: StorageKind::Blob,
                content_sha256: digest(9),
                media_type: "image/png".to_owned(),
                size_bytes: 0,
            },
            1,
            1,
        )
        .expect_err("invalid blob reference is hard");
    assert_eq!(error.kind(), LocalAssetHostErrorKind::Asset);
    assert_eq!(error.asset_code(), Some(AssetErrorCode::HashMismatch));
    assert_eq!(error.store_kind(), None);
}

#[test]
fn activation_ready_set_is_ordered_owned_complete_and_generation_bound() {
    let temp = private_tempdir();
    let mut host = open_host(&temp);
    let bytes = png_bytes();
    let verified = host
        .materialize_embedded_png(&bytes, 1, 1)
        .expect("materialization succeeds");
    let plan = plan(vec![
        binding("atlas:a", verified.asset.clone(), 1, 1),
        binding("atlas:b", verified.asset.clone(), 1, 1),
    ]);

    let PrepareActivationTextureSetV1::Ready(ready) = host
        .prepare_activation_texture_set(GENERATION, &plan)
        .expect("activation resolves")
    else {
        panic!("materialized references must be ready");
    };
    assert_eq!(ready.request_generation(), GENERATION);
    assert_eq!(ready.total_pixels(), 2);
    assert_eq!(ready.total_rgba_bytes(), 8);
    assert_eq!(ready.textures().len(), 2);
    assert_eq!(ready.textures()[0].id(), "atlas:a");
    assert_eq!(ready.textures()[1].id(), "atlas:b");
    for texture in ready.textures() {
        assert_eq!(texture.ready_png().reference(), &verified.asset);
        assert_eq!(texture.ready_png().logical_bytes(), bytes);
        assert_eq!(texture.ready_png().decoded().rgba.len(), 4);
        assert_eq!(texture.ready_png().source_generations().len(), 1);
    }
    let first = ready.textures()[0].ready_png();
    let second = ready.textures()[1].ready_png();
    assert!(!first.logical_bytes().is_empty());
    assert!(!first.decoded().rgba.is_empty());
    assert_ne!(
        first.logical_bytes().as_ptr(),
        second.logical_bytes().as_ptr()
    );
    assert_ne!(
        first.decoded().rgba.as_ptr(),
        second.decoded().rgba.as_ptr()
    );
    let logical_payload = format!("{:?}", first.logical_bytes());
    let rgba_payload = format!("{:?}", first.decoded().rgba);
    let debug = format!("{ready:?}");
    assert!(debug.contains("logical_bytes_len"));
    assert!(debug.contains("rgba_bytes_len"));
    assert!(!debug.contains(&logical_payload));
    assert!(!debug.contains(&rgba_payload));
}

#[test]
fn activation_preflight_rejects_everything_before_store_io() {
    let store = ScriptedStore::default();
    let invalid = EvaluationTexturePlanV1 {
        schema: "wrong".to_owned(),
        textures: vec![binding("atlas:a", blob_reference(1), 1, 1)],
    };
    let classify = |_: NeverStoreError| None;

    let error = prepare_activation_texture_set_from_store(
        &store,
        &principal(),
        GENERATION,
        &invalid,
        &classify,
    )
    .expect_err("schema mismatch is rejected");
    assert_eq!(error.kind(), LocalAssetHostErrorKind::InvalidTexturePlan);
    assert_eq!(store.calls.get(), 0);

    let error = prepare_activation_texture_set_from_store(
        &store,
        &principal(),
        9_007_199_254_740_992,
        &plan(vec![binding("atlas:a", blob_reference(1), 1, 1)]),
        &classify,
    )
    .expect_err("unsafe request generation is rejected");
    assert_eq!(error.kind(), LocalAssetHostErrorKind::ResourceLimitExceeded);
    assert_eq!(store.calls.get(), 0);
}

#[test]
fn request_generation_safe_integer_boundaries_are_preserved_without_reads() {
    let store = ScriptedStore::default();
    let classify = |_: NeverStoreError| None;
    let empty = plan(Vec::new());

    for generation in [0, 1, 9_007_199_254_740_991] {
        let PrepareActivationTextureSetV1::Ready(ready) =
            prepare_activation_texture_set_from_store(
                &store,
                &principal(),
                generation,
                &empty,
                &classify,
            )
            .expect("safe integer generation is accepted")
        else {
            panic!("an empty valid plan is ready");
        };
        assert_eq!(ready.request_generation(), generation);
    }

    let error = prepare_activation_texture_set_from_store(
        &store,
        &principal(),
        9_007_199_254_740_992,
        &empty,
        &classify,
    )
    .expect_err("generation above the safe integer ceiling is rejected");
    assert_eq!(error.kind(), LocalAssetHostErrorKind::ResourceLimitExceeded);
    assert_eq!(store.calls.get(), 0);
}

#[test]
fn activation_missing_ids_are_deterministic_and_drop_partial_ready_values() {
    let bytes = png_bytes();
    let prepared = prepare_embedded_png(&bytes, 1, 1).expect("fixture prepares");
    let ready_ref = prepared.reference().clone();
    let ready_address = ready_ref.object_address;
    let store = ScriptedStore::with_ready(ready_ref.clone(), bytes);
    let plan = plan(vec![
        binding("atlas:a", blob_reference(1), 1, 1),
        binding("atlas:b", ready_ref, 1, 1),
        binding("atlas:c", blob_reference(3), 1, 1),
    ]);
    let classify = |_: NeverStoreError| None;

    let PrepareActivationTextureSetV1::Missing(missing) =
        prepare_activation_texture_set_from_store(
            &store,
            &principal(),
            GENERATION,
            &plan,
            &classify,
        )
        .expect("missing is a state")
    else {
        panic!("two references are absent");
    };
    assert_eq!(missing.request_generation(), GENERATION);
    assert_eq!(
        missing.texture_ids(),
        &["atlas:a".to_owned(), "atlas:c".to_owned()]
    );
    assert_eq!(
        *store.object_calls.borrow(),
        vec![digest(1), ready_address, digest(3)]
    );
}

#[test]
fn activation_later_hard_error_wins_over_earlier_missing() {
    let hard_ref = blob_reference(2);
    let store = ScriptedStore::with_object_without_descriptor(hard_ref.clone());
    let plan = plan(vec![
        binding("atlas:a", blob_reference(1), 1, 1),
        binding("atlas:b", hard_ref, 1, 1),
    ]);
    let classify = |_: NeverStoreError| None;

    let error = prepare_activation_texture_set_from_store(
        &store,
        &principal(),
        GENERATION,
        &plan,
        &classify,
    )
    .expect_err("later descriptor failure wins");
    assert_eq!(error.kind(), LocalAssetHostErrorKind::Asset);
    assert_eq!(error.asset_code(), Some(AssetErrorCode::DescriptorMismatch));
    assert_eq!(error.store_kind(), None);
    assert_eq!(store.calls.get(), 3);
    assert_eq!(*store.object_calls.borrow(), vec![digest(1), digest(2)]);
}

#[test]
fn activation_plan_contract_and_aggregate_limits_are_fail_closed() {
    let store = ScriptedStore::default();
    let classify = |_: NeverStoreError| None;
    let base = blob_reference(1);
    let invalid_plans = [
        plan(vec![binding("atlas:", base.clone(), 1, 1)]),
        plan(vec![
            binding("atlas:b", base.clone(), 1, 1),
            binding("atlas:a", base.clone(), 1, 1),
        ]),
        plan(vec![
            binding("atlas:a", base.clone(), 1, 1),
            binding("atlas:a", base.clone(), 1, 1),
        ]),
        plan(vec![EvaluationTextureBindingV1 {
            media_type: "image/jpeg".to_owned(),
            ..binding("atlas:a", base.clone(), 1, 1)
        }]),
        plan(vec![EvaluationTextureBindingV1 {
            color_space: "linear".to_owned(),
            ..binding("atlas:a", base.clone(), 1, 1)
        }]),
        plan(vec![EvaluationTextureBindingV1 {
            alpha_mode: "premultiplied".to_owned(),
            ..binding("atlas:a", base.clone(), 1, 1)
        }]),
        plan(vec![binding("atlas:a", base.clone(), 0, 1)]),
    ];
    for invalid in invalid_plans {
        let error = prepare_activation_texture_set_from_store(
            &store,
            &principal(),
            GENERATION,
            &invalid,
            &classify,
        )
        .expect_err("malformed plan is rejected");
        assert_eq!(error.kind(), LocalAssetHostErrorKind::InvalidTexturePlan);
    }

    let aggregate = plan(vec![
        binding("atlas:a", base.clone(), 8_192, 4_097),
        binding("atlas:b", base, 8_192, 4_097),
    ]);
    let error = prepare_activation_texture_set_from_store(
        &store,
        &principal(),
        GENERATION,
        &aggregate,
        &classify,
    )
    .expect_err("aggregate pixels exceed the ceiling");
    assert_eq!(error.kind(), LocalAssetHostErrorKind::ResourceLimitExceeded);
    assert_eq!(store.calls.get(), 0);
}

#[test]
fn activation_texture_count_and_reference_size_limits_precede_store_io() {
    let store = ScriptedStore::default();
    let classify = |_: NeverStoreError| None;
    let too_many = plan(
        (0..33)
            .map(|index| {
                binding(
                    &format!("atlas:{index:03}"),
                    blob_reference(index as u8),
                    1,
                    1,
                )
            })
            .collect(),
    );
    let error = prepare_activation_texture_set_from_store(
        &store,
        &principal(),
        GENERATION,
        &too_many,
        &classify,
    )
    .expect_err("texture count is bounded");
    assert_eq!(error.kind(), LocalAssetHostErrorKind::ResourceLimitExceeded);

    let oversized = plan(vec![binding(
        "atlas:a",
        AssetRef {
            size_bytes: 67_108_865,
            ..blob_reference(1)
        },
        1,
        1,
    )]);
    let error = prepare_activation_texture_set_from_store(
        &store,
        &principal(),
        GENERATION,
        &oversized,
        &classify,
    )
    .expect_err("PNG input size is bounded");
    assert_eq!(error.kind(), LocalAssetHostErrorKind::Asset);
    assert_eq!(error.asset_code(), Some(AssetErrorCode::LimitExceeded));
    assert_eq!(store.calls.get(), 0);
}

#[test]
fn activation_exact_contract_seams_are_accepted_and_id_overflow_is_pre_io() {
    let thirty_two = plan(
        (0..32)
            .map(|index| {
                binding(
                    &format!("atlas:{index:03}"),
                    blob_reference(index as u8),
                    1,
                    1,
                )
            })
            .collect(),
    );
    let max_axis = plan(vec![binding("atlas:a", blob_reference(40), 8_192, 8_192)]);
    let max_blob = plan(vec![binding(
        "atlas:a",
        AssetRef {
            size_bytes: 16_777_216,
            ..blob_reference(41)
        },
        1,
        1,
    )]);
    let min_manifest = plan(vec![binding(
        "atlas:a",
        AssetRef {
            storage_kind: StorageKind::ChunkManifest,
            size_bytes: 16_777_217,
            ..blob_reference(42)
        },
        1,
        1,
    )]);
    let max_manifest = plan(vec![binding(
        "atlas:a",
        AssetRef {
            storage_kind: StorageKind::ChunkManifest,
            size_bytes: 67_108_864,
            ..blob_reference(43)
        },
        1,
        1,
    )]);
    let max_id = format!("atlas:{}", "a".repeat(120));
    let max_id_plan = plan(vec![binding(&max_id, blob_reference(44), 1, 1)]);
    let accepted = [
        thirty_two,
        max_axis,
        max_blob,
        min_manifest,
        max_manifest,
        max_id_plan,
    ];
    let classify = |_: NeverStoreError| None;

    for accepted_plan in accepted {
        let expected_ids: Vec<String> = accepted_plan
            .textures
            .iter()
            .map(|texture| texture.id.clone())
            .collect();
        let store = ScriptedStore::default();
        let PrepareActivationTextureSetV1::Missing(missing) =
            prepare_activation_texture_set_from_store(
                &store,
                &principal(),
                GENERATION,
                &accepted_plan,
                &classify,
            )
            .expect("exact contract seam is accepted")
        else {
            panic!("the scripted store contains no assets");
        };
        assert_eq!(missing.request_generation(), GENERATION);
        assert_eq!(missing.texture_ids(), expected_ids);
        assert_eq!(
            store.object_calls.borrow().len(),
            accepted_plan.textures.len()
        );
    }

    let store = ScriptedStore::default();
    let oversized_id = format!("atlas:{}", "a".repeat(121));
    let error = prepare_activation_texture_set_from_store(
        &store,
        &principal(),
        GENERATION,
        &plan(vec![binding(&oversized_id, blob_reference(45), 1, 1)]),
        &classify,
    )
    .expect_err("ID suffix above 120 bytes is rejected");
    assert_eq!(error.kind(), LocalAssetHostErrorKind::InvalidTexturePlan);
    assert_eq!(store.calls.get(), 0);
    assert!(store.object_calls.borrow().is_empty());

    let store = ScriptedStore::default();
    let error = prepare_activation_texture_set_from_store(
        &store,
        &principal(),
        GENERATION,
        &plan(vec![binding("atlas:a", blob_reference(46), 8_193, 1)]),
        &classify,
    )
    .expect_err("axis above 8192 is rejected");
    assert_eq!(error.kind(), LocalAssetHostErrorKind::ResourceLimitExceeded);
    assert_eq!(store.calls.get(), 0);
    assert!(store.object_calls.borrow().is_empty());
}

#[test]
fn asset_reference_preflight_preserves_resolver_codes_before_store_io() {
    let store = ScriptedStore::default();
    let classify = |_: NeverStoreError| None;
    let base = blob_reference(1);
    let cases = [
        (
            AssetRef {
                media_type: "image/jpeg".to_owned(),
                ..base.clone()
            },
            AssetErrorCode::MediaTypeMismatch,
        ),
        (
            AssetRef {
                size_bytes: 16_777_217,
                ..base.clone()
            },
            AssetErrorCode::LimitExceeded,
        ),
        (
            AssetRef {
                storage_kind: StorageKind::ChunkManifest,
                size_bytes: 16_777_216,
                ..base.clone()
            },
            AssetErrorCode::LimitExceeded,
        ),
        (
            AssetRef {
                storage_kind: StorageKind::ChunkManifest,
                size_bytes: 67_108_865,
                ..base.clone()
            },
            AssetErrorCode::LimitExceeded,
        ),
        (
            AssetRef {
                content_sha256: digest(2),
                media_type: "image/jpeg".to_owned(),
                ..base
            },
            AssetErrorCode::HashMismatch,
        ),
    ];

    for (asset, expected_code) in cases {
        let error = prepare_activation_texture_set_from_store(
            &store,
            &principal(),
            GENERATION,
            &plan(vec![binding("atlas:a", asset, 1, 1)]),
            &classify,
        )
        .expect_err("invalid AssetRef is rejected before reads");
        assert_eq!(error.kind(), LocalAssetHostErrorKind::Asset);
        assert_eq!(error.asset_code(), Some(expected_code));
        assert_eq!(error.store_kind(), None);
        assert_eq!(store.calls.get(), 0);
    }
}

#[test]
fn store_failures_remain_redacted_and_never_fabricate_asset_codes() {
    let store = FailingStore::default();
    let classify = |_: SecretStoreError| Some(LocalStoreErrorKind::StoreUnavailable);
    let plan = plan(vec![binding("atlas:a", blob_reference(1), 1, 1)]);

    let error = prepare_activation_texture_set_from_store(
        &store,
        &principal(),
        GENERATION,
        &plan,
        &classify,
    )
    .expect_err("store fails");
    assert_eq!(error.kind(), LocalAssetHostErrorKind::Store);
    assert_eq!(error.asset_code(), None);
    assert_eq!(
        error.store_kind(),
        Some(LocalStoreErrorKind::StoreUnavailable)
    );
    assert_eq!(error.to_string(), "local asset host store operation failed");
    assert!(!error.to_string().contains("secret-native-detail"));
    assert!(!format!("{error:?}").contains("secret-native-detail"));
}

#[test]
fn open_preserves_only_the_redacted_store_kind() {
    let error = LocalAssetHost::open(Path::new("relative-assets.sqlite3"), principal())
        .err()
        .expect("relative path is rejected");
    assert_eq!(error.kind(), LocalAssetHostErrorKind::Store);
    assert_eq!(error.asset_code(), None);
    assert_eq!(error.store_kind(), Some(LocalStoreErrorKind::PathRejected));
    assert!(!error.to_string().contains("relative-assets"));
    assert!(!format!("{error:?}").contains("relative-assets"));

    let temp = TempDir::new().expect("temp dir");
    let marker = "sensitive-principal-marker";
    let mut oversized_principal = marker.as_bytes().repeat(200);
    oversized_principal.resize(4_097, b'x');
    let error = LocalAssetHost::open(
        temp.path().join("assets.sqlite3"),
        PrincipalId::new(oversized_principal),
    )
    .err()
    .expect("oversized principal is rejected");
    assert_eq!(error.kind(), LocalAssetHostErrorKind::Store);
    assert_eq!(error.asset_code(), None);
    assert_eq!(error.store_kind(), Some(LocalStoreErrorKind::InvalidInput));
    assert!(!error.to_string().contains(marker));
    assert!(!format!("{error:?}").contains(marker));
}

const MANIFEST_CHUNK_BYTES: usize = 8_388_608;

struct ManifestChunkFixture {
    address: Digest,
    wire_address: String,
    bytes: Vec<u8>,
}

struct ManifestContractFixture {
    raw: Vec<u8>,
    wire_address: String,
    reference: AssetRef,
}

struct ManifestBundleFixture {
    contract: ManifestContractFixture,
    chunks: Vec<ManifestChunkFixture>,
}

fn sha256(bytes: &[u8]) -> Digest {
    let hash = Sha256::digest(bytes);
    let mut value = [0_u8; Digest::LENGTH];
    value.copy_from_slice(&hash);
    Digest::from_bytes(value)
}

fn crc32(bytes: &[u8]) -> u32 {
    let mut crc = 0xffff_ffff_u32;
    for byte in bytes {
        crc ^= u32::from(*byte);
        for _ in 0..8 {
            crc = if crc & 1 == 1 {
                (crc >> 1) ^ 0xedb8_8320
            } else {
                crc >> 1
            };
        }
    }
    !crc
}

fn large_valid_png() -> Vec<u8> {
    let base = png_bytes();
    let insertion = 8 + 12 + 13;
    let target = 16_777_217_usize;
    let padding_length = target
        .checked_sub(base.len() + 12)
        .expect("base PNG fits the manifest minimum");
    let mut result = Vec::with_capacity(target);
    result.extend_from_slice(&base[..insertion]);
    result.extend_from_slice(&(padding_length as u32).to_be_bytes());
    let crc_start = result.len();
    result.extend_from_slice(b"aaAa");
    result.resize(result.len() + padding_length, 0x5a);
    let crc = crc32(&result[crc_start..]);
    result.extend_from_slice(&crc.to_be_bytes());
    result.extend_from_slice(&base[insertion..]);
    assert_eq!(result.len(), target);
    result
}

fn large_valid_png_with_repeated_first_two_chunks() -> Vec<u8> {
    let base = png_bytes();
    let insertion = 8 + 12 + 13;
    let data_start = insertion + 8;
    let data_length = MANIFEST_CHUNK_BYTES * 2 - data_start;
    let mut first = Vec::with_capacity(MANIFEST_CHUNK_BYTES);
    first.extend_from_slice(&base[..insertion]);
    first.extend_from_slice(&(data_length as u32).to_be_bytes());
    first.extend_from_slice(b"aaAa");
    first.resize(MANIFEST_CHUNK_BYTES, 0x5a);

    let mut result = Vec::with_capacity(MANIFEST_CHUNK_BYTES * 2 + base.len());
    result.extend_from_slice(&first);
    result.extend_from_slice(&first);
    let crc = crc32(&result[insertion + 4..]);
    result.extend_from_slice(&crc.to_be_bytes());
    result.extend_from_slice(&base[insertion..]);
    assert_eq!(
        result[..MANIFEST_CHUNK_BYTES],
        result[MANIFEST_CHUNK_BYTES..][..MANIFEST_CHUNK_BYTES]
    );
    result
}

fn chunks_for_png(png: &[u8]) -> Vec<ManifestChunkFixture> {
    png.chunks(MANIFEST_CHUNK_BYTES)
        .map(|bytes| {
            let address = sha256(bytes);
            ManifestChunkFixture {
                address,
                wire_address: address.to_lower_hex(),
                bytes: bytes.to_vec(),
            }
        })
        .collect()
}

fn manifest_contract(
    chunks: &[ManifestChunkFixture],
    declared_sizes: &[u64],
    manifest_content: Digest,
    manifest_media_type: &str,
    reference_content: Digest,
    reference_media_type: &str,
) -> ManifestContractFixture {
    assert_eq!(chunks.len(), declared_sizes.len());
    let chunk_values = chunks
        .iter()
        .zip(declared_sizes)
        .map(|(chunk, size)| {
            format!(
                "{{\"sha256\":\"{}\",\"sizeBytes\":{size}}}",
                chunk.wire_address
            )
        })
        .collect::<Vec<_>>()
        .join(",");
    let size_bytes = declared_sizes.iter().sum::<u64>();
    let raw = format!(
        "{{\"schema\":\"vivi2d.assetChunkManifest.v1\",\"mediaType\":\"{manifest_media_type}\",\"contentSha256\":\"{}\",\"sizeBytes\":{size_bytes},\"chunkSizeBytes\":8388608,\"chunks\":[{chunk_values}]}}",
        manifest_content.to_lower_hex()
    )
    .into_bytes();
    let parsed = parse_chunk_manifest(&raw).expect("test manifest is valid");
    ManifestContractFixture {
        wire_address: parsed.object_address.to_lower_hex(),
        reference: AssetRef {
            object_address: parsed.object_address,
            storage_kind: StorageKind::ChunkManifest,
            content_sha256: reference_content,
            media_type: reference_media_type.to_owned(),
            size_bytes,
        },
        raw,
    }
}

fn manifest_bundle(png: Vec<u8>) -> ManifestBundleFixture {
    let content = sha256(&png);
    let chunks = chunks_for_png(&png);
    let declared_sizes = chunks
        .iter()
        .map(|chunk| chunk.bytes.len() as u64)
        .collect::<Vec<_>>();
    let contract = manifest_contract(
        &chunks,
        &declared_sizes,
        content,
        "image/png",
        content,
        "image/png",
    );
    ManifestBundleFixture { contract, chunks }
}

fn closure_objects<'a>(
    contract: &'a ManifestContractFixture,
    chunks: &'a [ManifestChunkFixture],
) -> Vec<ReferencedPngClosureObjectV1<'a>> {
    let mut seen = HashSet::new();
    seen.insert(contract.reference.object_address);
    let mut objects = vec![ReferencedPngClosureObjectV1::new(
        &contract.wire_address,
        &contract.raw,
    )];
    for chunk in chunks {
        if seen.insert(chunk.address) {
            objects.push(ReferencedPngClosureObjectV1::new(
                &chunk.wire_address,
                &chunk.bytes,
            ));
        }
    }
    objects
}

#[derive(Clone, Debug, Eq, PartialEq)]
enum ManifestWriteEvent {
    Chunk(Digest),
    Manifest,
    Descriptor,
}

#[derive(Default)]
struct RecordingManifestStore {
    events: Vec<ManifestWriteEvent>,
    fail_at_call: Option<usize>,
    asset_divergence_at_call: Option<usize>,
}

#[derive(Debug)]
struct SecretManifestStoreError;

impl RecordingManifestStore {
    fn fail_if_injected(&self) -> Result<(), OperationError<SecretManifestStoreError>> {
        if self.fail_at_call == Some(self.events.len()) {
            Err(OperationError::StoreUnavailable(SecretManifestStoreError))
        } else {
            Ok(())
        }
    }

    fn diverge_if_injected(&self) -> Result<(), OperationError<SecretManifestStoreError>> {
        if self.asset_divergence_at_call == Some(self.events.len()) {
            Err(OperationError::Asset(AssetError::new(
                AssetErrorCode::ManifestInvalid,
                "injected impossible publication-adapter divergence",
            )))
        } else {
            Ok(())
        }
    }
}

impl ReferencedPngManifestWriteStore for RecordingManifestStore {
    type Error = SecretManifestStoreError;

    fn put_verified_chunk_if_absent(
        &mut self,
        _principal: &PrincipalId,
        address: Digest,
        _bytes: &[u8],
    ) -> Result<(), OperationError<Self::Error>> {
        self.events.push(ManifestWriteEvent::Chunk(address));
        self.fail_if_injected()?;
        self.diverge_if_injected()
    }

    fn put_chunk_manifest_if_absent(
        &mut self,
        _principal: &PrincipalId,
        raw: &[u8],
    ) -> Result<(), OperationError<Self::Error>> {
        self.events.push(ManifestWriteEvent::Manifest);
        self.fail_if_injected()?;
        self.diverge_if_injected()?;
        parse_chunk_manifest(raw)
            .map(|_| ())
            .map_err(OperationError::Asset)
    }

    fn put_descriptor_if_absent(
        &mut self,
        _principal: &PrincipalId,
        _reference: &AssetRef,
        _descriptor: &Descriptor,
    ) -> Result<(), OperationError<Self::Error>> {
        self.events.push(ManifestWriteEvent::Descriptor);
        self.fail_if_injected()?;
        self.diverge_if_injected()
    }
}

fn ingest_with_recording_store(
    store: &mut RecordingManifestStore,
    reference: &AssetRef,
    closure: &ReferencedPngManifestClosureV1<'_>,
    width: u32,
    height: u32,
) -> Result<crate::VerifiedAtlasAssetV1, crate::LocalAssetHostError> {
    let classify = |_: SecretManifestStoreError| Some(LocalStoreErrorKind::StoreUnavailable);
    ingest_referenced_png_manifest_closure_into_store(
        store,
        &principal(),
        reference,
        closure,
        width,
        height,
        &classify,
    )
}

#[test]
fn referenced_manifest_ingestion_succeeds_reopens_and_is_idempotent() {
    let bundle = manifest_bundle(large_valid_png());
    assert_eq!(bundle.chunks.len(), 3);
    let lower_objects = closure_objects(&bundle.contract, &bundle.chunks);
    let uppercase_wires = lower_objects
        .iter()
        .map(|object| object.wire_object_address.to_ascii_uppercase())
        .collect::<Vec<_>>();
    let uppercase_closure = ReferencedPngManifestClosureV1::new(
        lower_objects
            .iter()
            .zip(&uppercase_wires)
            .map(|(object, wire)| ReferencedPngClosureObjectV1::new(wire, object.payload))
            .collect(),
    );
    let temp = private_tempdir();
    let mut host = open_host(&temp);
    let verified = host
        .ingest_referenced_png_manifest_closure(
            &bundle.contract.reference,
            &uppercase_closure,
            1,
            1,
        )
        .expect("uppercase exact closure ingests");
    assert_eq!(verified.asset, bundle.contract.reference);
    assert_eq!(verified.png.profile, "vivi2d.png.rgba8.v1");
    assert_eq!((verified.png.width, verified.png.height), (1, 1));
    assert_eq!(
        host.resolve_referenced_png(&verified.asset, 1, 1)
            .expect("immediate resolve"),
        ReferencedAtlasResolutionV1::Ready(verified.clone())
    );
    drop(host);

    let mut reopened = open_host(&temp);
    assert_eq!(
        reopened
            .resolve_referenced_png(&verified.asset, 1, 1)
            .expect("reopen resolve"),
        ReferencedAtlasResolutionV1::Ready(verified.clone())
    );
    let lower_closure =
        ReferencedPngManifestClosureV1::new(closure_objects(&bundle.contract, &bundle.chunks));
    assert_eq!(
        reopened
            .ingest_referenced_png_manifest_closure(
                &bundle.contract.reference,
                &lower_closure,
                1,
                1,
            )
            .expect("idempotent retry"),
        verified
    );
}

#[test]
fn closure_cardinality_syntax_and_case_collisions_are_zero_write_refset_failures() {
    let bundle = manifest_bundle(large_valid_png());

    let mut cases = Vec::new();
    let mut missing = closure_objects(&bundle.contract, &bundle.chunks);
    missing.pop();
    cases.push(ReferencedPngManifestClosureV1::new(missing));

    let extra_wire = sha256(b"extra closure object").to_lower_hex();
    let mut extra = closure_objects(&bundle.contract, &bundle.chunks);
    extra.push(ReferencedPngClosureObjectV1::new(
        &extra_wire,
        b"extra closure object",
    ));
    cases.push(ReferencedPngManifestClosureV1::new(extra));

    let uppercase_top = bundle.contract.wire_address.to_ascii_uppercase();
    let mut collision = closure_objects(&bundle.contract, &bundle.chunks);
    collision.push(ReferencedPngClosureObjectV1::new(
        &uppercase_top,
        &bundle.contract.raw,
    ));
    cases.push(ReferencedPngManifestClosureV1::new(collision));

    let mut invalid = closure_objects(&bundle.contract, &bundle.chunks);
    invalid[0] = ReferencedPngClosureObjectV1::new("not-a-digest", &bundle.contract.raw);
    cases.push(ReferencedPngManifestClosureV1::new(invalid));

    let oversized = (0..10)
        .map(|_| {
            ReferencedPngClosureObjectV1::new(&bundle.contract.wire_address, &bundle.contract.raw)
        })
        .collect();
    cases.push(ReferencedPngManifestClosureV1::new(oversized));

    for closure in cases {
        let mut store = RecordingManifestStore::default();
        let error =
            ingest_with_recording_store(&mut store, &bundle.contract.reference, &closure, 1, 1)
                .expect_err("inexact closure is rejected");
        assert_eq!(error.kind(), LocalAssetHostErrorKind::Asset);
        assert_eq!(error.asset_code(), Some(AssetErrorCode::RefSetMismatch));
        assert!(store.events.is_empty());
    }
}

#[test]
fn manifest_reference_preflight_precedes_oversized_closure_without_writes() {
    let payload = b"must never be inspected";
    let closure = ReferencedPngManifestClosureV1::new(
        (0..10)
            .map(|_| ReferencedPngClosureObjectV1::new("not-a-digest", payload))
            .collect(),
    );
    let base = AssetRef {
        object_address: digest(1),
        storage_kind: StorageKind::ChunkManifest,
        content_sha256: digest(2),
        media_type: "image/png".to_owned(),
        size_bytes: 16_777_217,
    };
    let cases = [
        (
            AssetRef {
                storage_kind: StorageKind::Blob,
                ..base.clone()
            },
            AssetErrorCode::UnsupportedKind,
        ),
        (
            AssetRef {
                size_bytes: 16_777_216,
                ..base.clone()
            },
            AssetErrorCode::LimitExceeded,
        ),
        (
            AssetRef {
                size_bytes: 67_108_865,
                ..base.clone()
            },
            AssetErrorCode::LimitExceeded,
        ),
        (
            AssetRef {
                media_type: "image/jpeg".to_owned(),
                ..base
            },
            AssetErrorCode::MediaTypeMismatch,
        ),
    ];

    for (reference, expected) in cases {
        let mut store = RecordingManifestStore::default();
        let error = ingest_with_recording_store(&mut store, &reference, &closure, 1, 1)
            .expect_err("reference preflight rejects before closure inspection");
        assert_eq!(error.kind(), LocalAssetHostErrorKind::Asset);
        assert_eq!(error.asset_code(), Some(expected));
        assert!(store.events.is_empty());
    }
}

#[test]
fn manifest_physical_logical_media_dimension_and_decode_faults_are_zero_write() {
    let bundle = manifest_bundle(large_valid_png());

    let mut corrupt_chunk = bundle.chunks[0].bytes.clone();
    corrupt_chunk[0] ^= 1;
    let mut hash_objects = closure_objects(&bundle.contract, &bundle.chunks);
    hash_objects[1] =
        ReferencedPngClosureObjectV1::new(&bundle.chunks[0].wire_address, &corrupt_chunk);
    let hash_closure = ReferencedPngManifestClosureV1::new(hash_objects);
    let mut store = RecordingManifestStore::default();
    let error =
        ingest_with_recording_store(&mut store, &bundle.contract.reference, &hash_closure, 1, 1)
            .expect_err("chunk hash mismatch");
    assert_eq!(error.asset_code(), Some(AssetErrorCode::HashMismatch));
    assert!(store.events.is_empty());

    let actual_content = bundle.contract.reference.content_sha256;
    let size_contract = manifest_contract(
        &bundle.chunks,
        &[8_388_608, 8_388_608, 2],
        actual_content,
        "image/png",
        actual_content,
        "image/png",
    );
    let size_closure =
        ReferencedPngManifestClosureV1::new(closure_objects(&size_contract, &bundle.chunks));
    let mut store = RecordingManifestStore::default();
    let error =
        ingest_with_recording_store(&mut store, &size_contract.reference, &size_closure, 1, 1)
            .expect_err("chunk declared size mismatch");
    assert_eq!(error.asset_code(), Some(AssetErrorCode::SizeMismatch));
    assert!(store.events.is_empty());

    let lower_content = actual_content.to_lower_hex();
    let upper_content = lower_content.to_ascii_uppercase();
    assert_ne!(lower_content, upper_content);
    let jcs_raw = String::from_utf8(bundle.contract.raw.clone())
        .expect("manifest UTF-8")
        .replacen(&lower_content, &upper_content, 1)
        .into_bytes();
    assert_ne!(
        parse_chunk_manifest(&jcs_raw)
            .expect("uppercase manifest parses")
            .object_address,
        bundle.contract.reference.object_address
    );
    let mut jcs_objects = closure_objects(&bundle.contract, &bundle.chunks);
    jcs_objects[0] = ReferencedPngClosureObjectV1::new(&bundle.contract.wire_address, &jcs_raw);
    let jcs_closure = ReferencedPngManifestClosureV1::new(jcs_objects);
    let mut store = RecordingManifestStore::default();
    let error =
        ingest_with_recording_store(&mut store, &bundle.contract.reference, &jcs_closure, 1, 1)
            .expect_err("received-value JCS address mismatch");
    assert_eq!(error.asset_code(), Some(AssetErrorCode::HashMismatch));
    assert!(store.events.is_empty());

    let wrong_content = Digest::from_bytes([0x33; Digest::LENGTH]);
    let logical_contract = manifest_contract(
        &bundle.chunks,
        &[8_388_608, 8_388_608, 1],
        wrong_content,
        "image/png",
        wrong_content,
        "image/png",
    );
    let logical_closure =
        ReferencedPngManifestClosureV1::new(closure_objects(&logical_contract, &bundle.chunks));
    let mut store = RecordingManifestStore::default();
    let error = ingest_with_recording_store(
        &mut store,
        &logical_contract.reference,
        &logical_closure,
        1,
        1,
    )
    .expect_err("logical content mismatch");
    assert_eq!(
        error.asset_code(),
        Some(AssetErrorCode::ContentHashMismatch)
    );
    assert!(store.events.is_empty());

    let media_contract = manifest_contract(
        &bundle.chunks,
        &[8_388_608, 8_388_608, 1],
        actual_content,
        "image/jpeg",
        actual_content,
        "image/png",
    );
    let media_closure =
        ReferencedPngManifestClosureV1::new(closure_objects(&media_contract, &bundle.chunks));
    let mut store = RecordingManifestStore::default();
    let error =
        ingest_with_recording_store(&mut store, &media_contract.reference, &media_closure, 1, 1)
            .expect_err("manifest media mismatch");
    assert_eq!(error.asset_code(), Some(AssetErrorCode::MediaTypeMismatch));
    assert!(store.events.is_empty());

    let valid_closure =
        ReferencedPngManifestClosureV1::new(closure_objects(&bundle.contract, &bundle.chunks));
    let mut store = RecordingManifestStore::default();
    let error =
        ingest_with_recording_store(&mut store, &bundle.contract.reference, &valid_closure, 2, 1)
            .expect_err("declared dimensions mismatch");
    assert_eq!(error.asset_code(), Some(AssetErrorCode::DimensionMismatch));
    assert!(store.events.is_empty());

    let mut damaged_png = large_valid_png();
    let mut offset = 8_usize;
    let (type_start, data_start, data_end) = loop {
        let length = u32::from_be_bytes(damaged_png[offset..offset + 4].try_into().expect("length"))
            as usize;
        let type_start = offset + 4;
        let data_start = offset + 8;
        let data_end = data_start + length;
        if &damaged_png[type_start..type_start + 4] == b"IDAT" {
            break (type_start, data_start, data_end);
        }
        offset = data_end + 4;
    };
    damaged_png[data_start] ^= 0x20;
    let crc = crc32(&damaged_png[type_start..data_end]);
    damaged_png[data_end..data_end + 4].copy_from_slice(&crc.to_be_bytes());
    let damaged = manifest_bundle(damaged_png);
    let decode_closure =
        ReferencedPngManifestClosureV1::new(closure_objects(&damaged.contract, &damaged.chunks));
    let mut store = RecordingManifestStore::default();
    let error = ingest_with_recording_store(
        &mut store,
        &damaged.contract.reference,
        &decode_closure,
        1,
        1,
    )
    .expect_err("full zlib decode fails");
    assert_eq!(error.asset_code(), Some(AssetErrorCode::DecodeMalformed));
    assert!(store.events.is_empty());
}

#[test]
fn repeated_digest_is_supplied_and_persisted_once_in_first_occurrence_order() {
    let bundle = manifest_bundle(large_valid_png_with_repeated_first_two_chunks());
    assert_eq!(bundle.chunks.len(), 3);
    assert_eq!(bundle.chunks[0].address, bundle.chunks[1].address);
    assert_ne!(bundle.chunks[1].address, bundle.chunks[2].address);
    let objects = closure_objects(&bundle.contract, &bundle.chunks);
    assert_eq!(objects.len(), 3, "manifest plus two unique chunks");
    let closure = ReferencedPngManifestClosureV1::new(objects);
    let mut store = RecordingManifestStore::default();
    ingest_with_recording_store(&mut store, &bundle.contract.reference, &closure, 1, 1)
        .expect("valid repeated-digest PNG ingests");
    assert_eq!(
        store.events,
        [
            ManifestWriteEvent::Chunk(bundle.chunks[0].address),
            ManifestWriteEvent::Chunk(bundle.chunks[2].address),
            ManifestWriteEvent::Manifest,
            ManifestWriteEvent::Descriptor,
        ]
    );
}

#[test]
fn write_failures_are_redacted_ordered_and_descriptor_last() {
    let bundle = manifest_bundle(large_valid_png());
    let closure =
        ReferencedPngManifestClosureV1::new(closure_objects(&bundle.contract, &bundle.chunks));
    let classify = |_: SecretManifestStoreError| Some(LocalStoreErrorKind::StoreUnavailable);
    let expected = [
        ManifestWriteEvent::Chunk(bundle.chunks[0].address),
        ManifestWriteEvent::Chunk(bundle.chunks[1].address),
        ManifestWriteEvent::Chunk(bundle.chunks[2].address),
        ManifestWriteEvent::Manifest,
        ManifestWriteEvent::Descriptor,
    ];

    for (fail_at_call, expected_prefix) in [(2, 2), (4, 4), (5, 5)] {
        let mut store = RecordingManifestStore {
            fail_at_call: Some(fail_at_call),
            ..RecordingManifestStore::default()
        };
        let error = ingest_referenced_png_manifest_closure_into_store(
            &mut store,
            &principal(),
            &bundle.contract.reference,
            &closure,
            1,
            1,
            &classify,
        )
        .expect_err("injected store failure");
        assert_eq!(store.events, expected[..expected_prefix]);
        assert_eq!(error.kind(), LocalAssetHostErrorKind::Store);
        assert_eq!(error.asset_code(), None);
        assert_eq!(
            error.store_kind(),
            Some(LocalStoreErrorKind::StoreUnavailable)
        );
        assert!(!error.to_string().contains("SecretManifestStoreError"));
        assert!(!format!("{error:?}").contains("SecretManifestStoreError"));
    }

    for (asset_divergence_at_call, expected_prefix) in [(2, 2), (4, 4), (5, 5)] {
        let mut divergent = RecordingManifestStore {
            asset_divergence_at_call: Some(asset_divergence_at_call),
            ..RecordingManifestStore::default()
        };
        let error =
            ingest_with_recording_store(&mut divergent, &bundle.contract.reference, &closure, 1, 1)
                .expect_err("publication adapter divergence is a storage-integrity failure");
        assert_eq!(divergent.events, expected[..expected_prefix]);
        assert_eq!(error.kind(), LocalAssetHostErrorKind::Store);
        assert_eq!(error.asset_code(), None);
        assert_eq!(error.store_kind(), None);
    }

    let mut retry = RecordingManifestStore::default();
    ingest_with_recording_store(&mut retry, &bundle.contract.reference, &closure, 1, 1)
        .expect("idempotent retry reaches descriptor last");
    assert_eq!(retry.events, expected);
}

#[test]
fn manifest_closure_dto_debug_never_exposes_addresses_or_payload() {
    let address_marker = "sensitive-wire-address-marker";
    let payload_marker = b"sensitive-payload-marker";
    let object = ReferencedPngClosureObjectV1::new(address_marker, payload_marker);
    let object_debug = format!("{object:?}");
    assert!(object_debug.contains("payload_bytes_len"));
    assert!(!object_debug.contains(address_marker));
    assert!(!object_debug.contains("sensitive-payload-marker"));

    let closure = ReferencedPngManifestClosureV1::new(vec![ReferencedPngClosureObjectV1::new(
        address_marker,
        payload_marker,
    )]);
    let closure_debug = format!("{closure:?}");
    assert!(closure_debug.contains("object_count"));
    assert!(!closure_debug.contains(address_marker));
    assert!(!closure_debug.contains("sensitive-payload-marker"));
}

#[derive(Default)]
struct ScriptedStore {
    calls: Cell<usize>,
    object_calls: RefCell<Vec<Digest>>,
    objects: HashMap<Digest, ObjectSnapshot>,
    descriptors: HashMap<Digest, Descriptor>,
}

impl ScriptedStore {
    fn with_ready(reference: AssetRef, bytes: Vec<u8>) -> Self {
        let mut store = Self::default();
        store.objects.insert(
            reference.object_address,
            ObjectSnapshot {
                address: reference.object_address,
                storage_generation: 17,
                state: ObjectState::Active,
                bytes,
            },
        );
        store.descriptors.insert(
            reference.object_address,
            Descriptor::from_reference(&reference),
        );
        store
    }

    fn with_object_without_descriptor(reference: AssetRef) -> Self {
        let mut store = Self::default();
        store.objects.insert(
            reference.object_address,
            ObjectSnapshot {
                address: reference.object_address,
                storage_generation: 9,
                state: ObjectState::Active,
                bytes: Vec::new(),
            },
        );
        store
    }
}

#[derive(Debug)]
enum NeverStoreError {}

impl AssetReadStore for ScriptedStore {
    type Error = NeverStoreError;

    fn descriptor(
        &self,
        _principal: &PrincipalId,
        expected: &AssetRef,
    ) -> Result<Option<Descriptor>, Self::Error> {
        self.calls.set(self.calls.get() + 1);
        Ok(self.descriptors.get(&expected.object_address).cloned())
    }

    fn object(
        &self,
        _principal: &PrincipalId,
        object_address: Digest,
        _max_bytes: u64,
    ) -> Result<ObjectRead, Self::Error> {
        self.calls.set(self.calls.get() + 1);
        self.object_calls.borrow_mut().push(object_address);
        Ok(self
            .objects
            .get(&object_address)
            .cloned()
            .map_or(ObjectRead::Missing, ObjectRead::Snapshot))
    }
}

#[derive(Default)]
struct FailingStore {
    calls: RefCell<Vec<Digest>>,
}

#[derive(Debug)]
struct SecretStoreError;

impl fmt::Display for SecretStoreError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("secret-native-detail")
    }
}

impl std::error::Error for SecretStoreError {}

impl AssetReadStore for FailingStore {
    type Error = SecretStoreError;

    fn descriptor(
        &self,
        _principal: &PrincipalId,
        _expected: &AssetRef,
    ) -> Result<Option<Descriptor>, Self::Error> {
        Err(SecretStoreError)
    }

    fn object(
        &self,
        _principal: &PrincipalId,
        object_address: Digest,
        _max_bytes: u64,
    ) -> Result<ObjectRead, Self::Error> {
        self.calls.borrow_mut().push(object_address);
        Err(SecretStoreError)
    }
}
