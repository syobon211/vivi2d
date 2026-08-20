use std::cell::{Cell, RefCell};
use std::collections::HashMap;
use std::fmt;
use std::path::Path;

use base64::Engine as _;
use base64::engine::general_purpose::STANDARD;
use tempfile::TempDir;
use vivi_asset_resolver::{
    AssetErrorCode, AssetReadStore, AssetRef, Descriptor, Digest, ObjectRead, ObjectSnapshot,
    ObjectState, PrincipalId, StorageKind, prepare_embedded_png,
};
use vivi_asset_store_local::LocalStoreErrorKind;

use crate::LocalAssetHost;
use crate::error::LocalAssetHostErrorKind;
use crate::host::prepare_activation_texture_set_from_store;
use crate::model::{
    EvaluationTextureBindingV1, EvaluationTexturePlanV1, PrepareActivationTextureSetV1,
    ReferencedAtlasResolutionV1,
};

const PNG_BASE64: &str = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGMQMgljAAABlQCdTUEI3wAAAABJRU5ErkJggg==";
const GENERATION: u64 = 41;

fn png_bytes() -> Vec<u8> {
    STANDARD.decode(PNG_BASE64).expect("fixture is base64")
}

fn principal() -> PrincipalId {
    PrincipalId::new(b"host-local-test-principal".to_vec())
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
    let temp = TempDir::new().expect("temp dir");
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
    let temp = TempDir::new().expect("temp dir");
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
    let temp = TempDir::new().expect("temp dir");
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
