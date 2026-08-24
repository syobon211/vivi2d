use std::collections::{HashMap, HashSet};
use std::path::Path;

use vivi_asset_resolver::{
    AssetError, AssetErrorCode, AssetReadStore, AssetRef, Descriptor, Digest, EmbeddedBlobStore,
    ObjectRead, ObjectSnapshot, ObjectState, OperationError, ParsedManifest, PrincipalId,
    ResolvePng, StorageKind, materialize_prepared_png, parse_chunk_manifest, prepare_embedded_png,
    resolve_referenced_png as resolve_png_with_store, validate_exact_closure,
};
use vivi_asset_store_local::{LocalImmutableAssetStore, LocalStoreError, LocalStoreErrorKind};

use crate::error::LocalAssetHostError;
use crate::model::{
    EVALUATION_TEXTURE_PLAN_SCHEMA_V1, EvaluationTexturePlanV1, MissingActivationTexturesV1,
    PNG_MEDIA_TYPE, PNG_PROFILE_V1, PrepareActivationTextureSetV1, PreparedActivationTextureSetV1,
    PreparedActivationTextureV1, ReferencedAtlasResolutionV1, ReferencedPngManifestClosureV1,
    SRGB_COLOR_SPACE, STRAIGHT_ALPHA_MODE, VerifiedAtlasAssetV1, VerifiedPngV1,
};

const MAX_TEXTURES: usize = 32;
const MAX_TEXTURE_AXIS: u32 = 8_192;
const MAX_TEXTURE_PIXELS: u64 = 67_108_864;
const MAX_TOTAL_TEXTURE_PIXELS: u64 = 67_108_864;
const MAX_TEXTURE_RGBA_BYTES: u64 = 268_435_456;
const MAX_TOTAL_TEXTURE_RGBA_BYTES: u64 = 268_435_456;
const MAX_PNG_INPUT_BYTES: u64 = 67_108_864;
const MAX_BLOB_BYTES: u64 = 16_777_216;
const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;
const MAX_REFERENCED_PNG_CLOSURE_OBJECTS: usize = 9;

/// Principal-bound facade over one private immutable SQLite Asset store.
/// Neither its principal nor its path is observable through this API.
pub struct LocalAssetHost {
    store: LocalImmutableAssetStore,
    principal: PrincipalId,
}

impl LocalAssetHost {
    /// Opens or creates one store and permanently binds this host instance to
    /// the supplied opaque principal.
    pub fn open(
        trusted_db_path: impl AsRef<Path>,
        principal: PrincipalId,
    ) -> Result<Self, LocalAssetHostError> {
        let store = LocalImmutableAssetStore::open(trusted_db_path, principal.clone())
            .map_err(LocalAssetHostError::from_store)?;
        Ok(Self { store, principal })
    }

    /// Strictly decodes and content-addresses an embedded PNG before inserting
    /// its immutable blob and descriptor, then returns W7a's exact attestation.
    pub fn materialize_embedded_png(
        &mut self,
        bytes: &[u8],
        declared_width: u32,
        declared_height: u32,
    ) -> Result<VerifiedAtlasAssetV1, LocalAssetHostError> {
        let prepared = prepare_embedded_png(bytes, declared_width, declared_height)
            .map_err(LocalAssetHostError::from_asset)?;
        let info = prepared.decoded().info;
        let asset = materialize_prepared_png(&mut self.store, &self.principal, &prepared)
            .map_err(map_local_operation_error)?;
        Ok(verified_attestation(asset, info.width, info.height))
    }

    /// Validates an exact referenced-PNG manifest closure and fully decodes
    /// its logical PNG before performing any durable write. Publication is
    /// descriptor-last: unique chunks in first manifest-occurrence order,
    /// then the received manifest bytes, then the exact descriptor.
    pub fn ingest_referenced_png_manifest_closure(
        &mut self,
        reference: &AssetRef,
        closure: &ReferencedPngManifestClosureV1<'_>,
        declared_width: u32,
        declared_height: u32,
    ) -> Result<VerifiedAtlasAssetV1, LocalAssetHostError> {
        let classify = |error: LocalStoreError| Some(error.kind());
        ingest_referenced_png_manifest_closure_into_store(
            &mut self.store,
            &self.principal,
            reference,
            closure,
            declared_width,
            declared_height,
            &classify,
        )
    }

    /// Re-resolves and strictly decodes a referenced PNG for W7a readiness.
    /// The top-level missing state remains distinct from all hard failures.
    pub fn resolve_referenced_png(
        &self,
        reference: &AssetRef,
        declared_width: u32,
        declared_height: u32,
    ) -> Result<ReferencedAtlasResolutionV1, LocalAssetHostError> {
        let classify = |error: LocalStoreError| Some(error.kind());
        resolve_referenced_png_from_store(
            &self.store,
            &self.principal,
            reference,
            declared_width,
            declared_height,
            &classify,
        )
    }

    /// Preflights the entire frozen plan before the first store read, then
    /// re-resolves every reference in plan order. A later hard error wins over
    /// earlier Missing entries, and no partial Ready set can escape.
    pub fn prepare_activation_texture_set(
        &self,
        request_generation: u64,
        plan: &EvaluationTexturePlanV1,
    ) -> Result<PrepareActivationTextureSetV1, LocalAssetHostError> {
        let classify = |error: LocalStoreError| Some(error.kind());
        prepare_activation_texture_set_from_store(
            &self.store,
            &self.principal,
            request_generation,
            plan,
            &classify,
        )
    }
}

pub(crate) trait ReferencedPngManifestWriteStore {
    type Error;

    fn put_verified_chunk_if_absent(
        &mut self,
        principal: &PrincipalId,
        address: Digest,
        bytes: &[u8],
    ) -> Result<(), OperationError<Self::Error>>;

    fn put_chunk_manifest_if_absent(
        &mut self,
        principal: &PrincipalId,
        raw: &[u8],
    ) -> Result<(), OperationError<Self::Error>>;

    fn put_descriptor_if_absent(
        &mut self,
        principal: &PrincipalId,
        reference: &AssetRef,
        descriptor: &Descriptor,
    ) -> Result<(), OperationError<Self::Error>>;
}

impl ReferencedPngManifestWriteStore for LocalImmutableAssetStore {
    type Error = LocalStoreError;

    fn put_verified_chunk_if_absent(
        &mut self,
        principal: &PrincipalId,
        address: Digest,
        bytes: &[u8],
    ) -> Result<(), OperationError<Self::Error>> {
        LocalImmutableAssetStore::put_verified_chunk_if_absent(self, principal, address, bytes)
            .map_err(OperationError::StoreUnavailable)
    }

    fn put_chunk_manifest_if_absent(
        &mut self,
        principal: &PrincipalId,
        raw: &[u8],
    ) -> Result<(), OperationError<Self::Error>> {
        LocalImmutableAssetStore::put_chunk_manifest_if_absent(self, principal, raw).map(|_| ())
    }

    fn put_descriptor_if_absent(
        &mut self,
        principal: &PrincipalId,
        reference: &AssetRef,
        descriptor: &Descriptor,
    ) -> Result<(), OperationError<Self::Error>> {
        EmbeddedBlobStore::put_descriptor_if_absent(self, principal, reference, descriptor)
            .map_err(OperationError::StoreUnavailable)
    }
}

struct ValidatedReferencedPngClosure<'a> {
    manifest: ParsedManifest,
    objects: HashMap<Digest, &'a [u8]>,
    width: u32,
    height: u32,
}

struct StagedReferencedPngClosure<'a> {
    principal: PrincipalId,
    reference: AssetRef,
    descriptor: Descriptor,
    objects: &'a HashMap<Digest, &'a [u8]>,
}

enum StagedReadError {
    Allocation,
}

impl AssetReadStore for StagedReferencedPngClosure<'_> {
    type Error = StagedReadError;

    fn descriptor(
        &self,
        principal: &PrincipalId,
        expected: &AssetRef,
    ) -> Result<Option<Descriptor>, Self::Error> {
        Ok(
            (principal == &self.principal && expected == &self.reference)
                .then(|| self.descriptor.clone()),
        )
    }

    fn object(
        &self,
        principal: &PrincipalId,
        object_address: Digest,
        max_bytes: u64,
    ) -> Result<ObjectRead, Self::Error> {
        if principal != &self.principal {
            return Ok(ObjectRead::Missing);
        }
        let Some(bytes) = self.objects.get(&object_address) else {
            return Ok(ObjectRead::Missing);
        };
        let Ok(length) = u64::try_from(bytes.len()) else {
            return Ok(ObjectRead::TooLarge);
        };
        if length > max_bytes {
            return Ok(ObjectRead::TooLarge);
        }
        let mut owned = Vec::new();
        owned
            .try_reserve_exact(bytes.len())
            .map_err(|_| StagedReadError::Allocation)?;
        owned.extend_from_slice(bytes);
        Ok(ObjectRead::Snapshot(ObjectSnapshot {
            address: object_address,
            storage_generation: 0,
            state: ObjectState::Active,
            bytes: owned,
        }))
    }
}

pub(crate) fn ingest_referenced_png_manifest_closure_into_store<S, F>(
    store: &mut S,
    principal: &PrincipalId,
    reference: &AssetRef,
    closure: &ReferencedPngManifestClosureV1<'_>,
    declared_width: u32,
    declared_height: u32,
    classify_store_error: &F,
) -> Result<VerifiedAtlasAssetV1, LocalAssetHostError>
where
    S: ReferencedPngManifestWriteStore,
    F: Fn(S::Error) -> Option<LocalStoreErrorKind>,
{
    let validated = validate_referenced_png_manifest_closure(
        principal,
        reference,
        closure,
        declared_width,
        declared_height,
    )?;

    let mut written_chunks = HashSet::new();
    written_chunks
        .try_reserve(validated.manifest.chunks.len())
        .map_err(|_| asset_ingestion_error(AssetErrorCode::LimitExceeded))?;
    let mut publication_chunks = Vec::new();
    publication_chunks
        .try_reserve_exact(validated.manifest.chunks.len())
        .map_err(|_| asset_ingestion_error(AssetErrorCode::LimitExceeded))?;
    for chunk in &validated.manifest.chunks {
        if written_chunks.insert(chunk.sha256) {
            let bytes = validated
                .objects
                .get(&chunk.sha256)
                .ok_or_else(|| asset_ingestion_error(AssetErrorCode::RefSetMismatch))?;
            publication_chunks.push((chunk.sha256, *bytes));
        }
    }
    let manifest_bytes = validated
        .objects
        .get(&validated.manifest.object_address)
        .ok_or_else(|| asset_ingestion_error(AssetErrorCode::RefSetMismatch))?;
    let descriptor = Descriptor::from_reference(reference);
    let attestation = verified_attestation(reference.clone(), validated.width, validated.height);

    // Every fallible caller/Asset check is complete before the first durable
    // write. From this point onward, failures belong only to publication.
    for (address, bytes) in publication_chunks {
        store
            .put_verified_chunk_if_absent(principal, address, bytes)
            .map_err(|error| map_publication_error(error, classify_store_error))?;
    }
    store
        .put_chunk_manifest_if_absent(principal, manifest_bytes)
        .map_err(|error| map_publication_error(error, classify_store_error))?;

    store
        .put_descriptor_if_absent(principal, reference, &descriptor)
        .map_err(|error| map_publication_error(error, classify_store_error))?;

    Ok(attestation)
}

fn validate_referenced_png_manifest_closure<'payload>(
    principal: &PrincipalId,
    reference: &AssetRef,
    closure: &ReferencedPngManifestClosureV1<'payload>,
    declared_width: u32,
    declared_height: u32,
) -> Result<ValidatedReferencedPngClosure<'payload>, LocalAssetHostError> {
    if reference.storage_kind != StorageKind::ChunkManifest {
        return Err(asset_ingestion_error(AssetErrorCode::UnsupportedKind));
    }
    validate_asset_shape(reference)?;
    if closure.objects.len() > MAX_REFERENCED_PNG_CLOSURE_OBJECTS {
        return Err(asset_ingestion_error(AssetErrorCode::RefSetMismatch));
    }

    let mut objects = HashMap::new();
    objects
        .try_reserve(closure.objects.len())
        .map_err(|_| asset_ingestion_error(AssetErrorCode::LimitExceeded))?;
    let mut supplied_wire = Vec::new();
    supplied_wire
        .try_reserve_exact(closure.objects.len())
        .map_err(|_| asset_ingestion_error(AssetErrorCode::LimitExceeded))?;
    for object in &closure.objects {
        let address = Digest::from_hex(object.wire_object_address)
            .map_err(|_| asset_ingestion_error(AssetErrorCode::RefSetMismatch))?;
        if objects.insert(address, object.payload).is_some() {
            return Err(asset_ingestion_error(AssetErrorCode::RefSetMismatch));
        }
        supplied_wire.push(object.wire_object_address);
    }

    let manifest_bytes = objects
        .get(&reference.object_address)
        .ok_or_else(|| asset_ingestion_error(AssetErrorCode::RefSetMismatch))?;
    let manifest = parse_chunk_manifest(manifest_bytes).map_err(LocalAssetHostError::from_asset)?;
    if manifest.object_address != reference.object_address {
        return Err(asset_ingestion_error(AssetErrorCode::HashMismatch));
    }
    validate_exact_closure(&manifest.required_object_addresses(), &supplied_wire)
        .map_err(LocalAssetHostError::from_asset)?;

    let staged = StagedReferencedPngClosure {
        principal: principal.clone(),
        reference: reference.clone(),
        descriptor: Descriptor::from_reference(reference),
        objects: &objects,
    };
    let ready = resolve_png_with_store(
        &staged,
        principal,
        reference,
        declared_width,
        declared_height,
    )
    .map_err(|error| match error {
        OperationError::Asset(error) => LocalAssetHostError::from_asset(error),
        OperationError::StoreUnavailable(StagedReadError::Allocation) => {
            asset_ingestion_error(AssetErrorCode::LimitExceeded)
        }
    })?;
    let ResolvePng::Ready(ready) = ready else {
        return Err(asset_ingestion_error(AssetErrorCode::RefSetMismatch));
    };
    let width = ready.decoded().info.width;
    let height = ready.decoded().info.height;
    drop(ready);

    Ok(ValidatedReferencedPngClosure {
        manifest,
        objects,
        width,
        height,
    })
}

fn verified_attestation(reference: AssetRef, width: u32, height: u32) -> VerifiedAtlasAssetV1 {
    VerifiedAtlasAssetV1 {
        asset: reference,
        png: VerifiedPngV1 {
            profile: PNG_PROFILE_V1,
            width,
            height,
        },
    }
}

fn resolve_referenced_png_from_store<S, F>(
    store: &S,
    principal: &PrincipalId,
    reference: &AssetRef,
    declared_width: u32,
    declared_height: u32,
    classify_store_error: &F,
) -> Result<ReferencedAtlasResolutionV1, LocalAssetHostError>
where
    S: AssetReadStore,
    F: Fn(S::Error) -> Option<LocalStoreErrorKind>,
{
    match resolve_png_with_store(store, principal, reference, declared_width, declared_height)
        .map_err(|error| map_operation_error(error, classify_store_error))?
    {
        ResolvePng::Ready(ready) => {
            let info = ready.decoded().info;
            Ok(ReferencedAtlasResolutionV1::Ready(verified_attestation(
                ready.reference().clone(),
                info.width,
                info.height,
            )))
        }
        ResolvePng::Missing => Ok(ReferencedAtlasResolutionV1::Missing),
    }
}

pub(crate) fn prepare_activation_texture_set_from_store<S, F>(
    store: &S,
    principal: &PrincipalId,
    request_generation: u64,
    plan: &EvaluationTexturePlanV1,
    classify_store_error: &F,
) -> Result<PrepareActivationTextureSetV1, LocalAssetHostError>
where
    S: AssetReadStore,
    F: Fn(S::Error) -> Option<LocalStoreErrorKind>,
{
    let totals = preflight_plan(request_generation, plan)?;

    let mut ready = Vec::new();
    ready
        .try_reserve_exact(plan.textures.len())
        .map_err(|_| LocalAssetHostError::resource_limit_exceeded())?;
    let mut missing_ids = Vec::new();
    missing_ids
        .try_reserve_exact(plan.textures.len())
        .map_err(|_| LocalAssetHostError::resource_limit_exceeded())?;

    for binding in &plan.textures {
        match resolve_png_with_store(
            store,
            principal,
            &binding.asset,
            binding.width,
            binding.height,
        )
        .map_err(|error| map_operation_error(error, classify_store_error))?
        {
            ResolvePng::Ready(ready_png) => ready.push(PreparedActivationTextureV1 {
                id: binding.id.clone(),
                ready: ready_png,
            }),
            ResolvePng::Missing => missing_ids.push(binding.id.clone()),
        }
    }

    if missing_ids.is_empty() {
        Ok(PrepareActivationTextureSetV1::Ready(
            PreparedActivationTextureSetV1 {
                request_generation,
                textures: ready,
                total_pixels: totals.pixels,
                total_rgba_bytes: totals.rgba_bytes,
            },
        ))
    } else {
        // `ready` is dropped here: a Missing state can never carry a partial
        // activation set.
        Ok(PrepareActivationTextureSetV1::Missing(
            MissingActivationTexturesV1 {
                request_generation,
                texture_ids: missing_ids,
            },
        ))
    }
}

fn map_local_operation_error(error: OperationError<LocalStoreError>) -> LocalAssetHostError {
    let classify = |store_error: LocalStoreError| Some(store_error.kind());
    map_operation_error(error, &classify)
}

fn map_publication_error<E, F>(
    error: OperationError<E>,
    classify_store_error: &F,
) -> LocalAssetHostError
where
    F: Fn(E) -> Option<LocalStoreErrorKind>,
{
    match error {
        // All caller-owned Asset validation finished before publication. An
        // adapter that contradicts that attestation while writing is an
        // integrity/storage failure, never a new caller Asset failure after
        // orphan candidates may have been written.
        OperationError::Asset(_) => LocalAssetHostError::from_store_kind(None),
        OperationError::StoreUnavailable(error) => {
            LocalAssetHostError::from_store_kind(classify_store_error(error))
        }
    }
}

fn map_operation_error<E, F>(
    error: OperationError<E>,
    classify_store_error: &F,
) -> LocalAssetHostError
where
    F: Fn(E) -> Option<LocalStoreErrorKind>,
{
    match error {
        OperationError::Asset(error) => LocalAssetHostError::from_asset(error),
        OperationError::StoreUnavailable(error) => {
            LocalAssetHostError::from_store_kind(classify_store_error(error))
        }
    }
}

#[derive(Clone, Copy)]
struct PlanTotals {
    pixels: u64,
    rgba_bytes: u64,
}

fn preflight_plan(
    request_generation: u64,
    plan: &EvaluationTexturePlanV1,
) -> Result<PlanTotals, LocalAssetHostError> {
    if request_generation > MAX_SAFE_INTEGER {
        return Err(LocalAssetHostError::resource_limit_exceeded());
    }
    if plan.schema != EVALUATION_TEXTURE_PLAN_SCHEMA_V1 {
        return Err(LocalAssetHostError::invalid_texture_plan());
    }
    if plan.textures.len() > MAX_TEXTURES {
        return Err(LocalAssetHostError::resource_limit_exceeded());
    }

    let mut previous_id: Option<&[u8]> = None;
    let mut total_pixels = 0_u64;
    let mut total_rgba_bytes = 0_u64;
    for binding in &plan.textures {
        if !valid_texture_id(&binding.id)
            || previous_id.is_some_and(|previous| previous >= binding.id.as_bytes())
            || binding.media_type != PNG_MEDIA_TYPE
            || binding.color_space != SRGB_COLOR_SPACE
            || binding.alpha_mode != STRAIGHT_ALPHA_MODE
        {
            return Err(LocalAssetHostError::invalid_texture_plan());
        }
        previous_id = Some(binding.id.as_bytes());

        if binding.width == 0 || binding.height == 0 {
            return Err(LocalAssetHostError::invalid_texture_plan());
        }
        if binding.width > MAX_TEXTURE_AXIS || binding.height > MAX_TEXTURE_AXIS {
            return Err(LocalAssetHostError::resource_limit_exceeded());
        }

        let pixels = u64::from(binding.width)
            .checked_mul(u64::from(binding.height))
            .ok_or_else(LocalAssetHostError::resource_limit_exceeded)?;
        if pixels > MAX_TEXTURE_PIXELS {
            return Err(LocalAssetHostError::resource_limit_exceeded());
        }
        let rgba_bytes = pixels
            .checked_mul(4)
            .ok_or_else(LocalAssetHostError::resource_limit_exceeded)?;
        if rgba_bytes > MAX_TEXTURE_RGBA_BYTES {
            return Err(LocalAssetHostError::resource_limit_exceeded());
        }

        validate_asset_shape(&binding.asset)?;

        total_pixels = total_pixels
            .checked_add(pixels)
            .ok_or_else(LocalAssetHostError::resource_limit_exceeded)?;
        total_rgba_bytes = total_rgba_bytes
            .checked_add(rgba_bytes)
            .ok_or_else(LocalAssetHostError::resource_limit_exceeded)?;
        if total_pixels > MAX_TOTAL_TEXTURE_PIXELS
            || total_rgba_bytes > MAX_TOTAL_TEXTURE_RGBA_BYTES
        {
            return Err(LocalAssetHostError::resource_limit_exceeded());
        }
    }

    Ok(PlanTotals {
        pixels: total_pixels,
        rgba_bytes: total_rgba_bytes,
    })
}

fn valid_texture_id(id: &str) -> bool {
    let Some(suffix) = id.as_bytes().strip_prefix(b"atlas:") else {
        return false;
    };
    (1..=120).contains(&suffix.len())
        && suffix
            .iter()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
}

fn validate_asset_shape(reference: &AssetRef) -> Result<(), LocalAssetHostError> {
    match reference.storage_kind {
        StorageKind::Blob => {
            if reference.size_bytes > MAX_BLOB_BYTES {
                return Err(asset_preflight_error(AssetErrorCode::LimitExceeded));
            }
            if reference.object_address != reference.content_sha256 {
                return Err(asset_preflight_error(AssetErrorCode::HashMismatch));
            }
        }
        StorageKind::ChunkManifest => {
            if reference.size_bytes <= MAX_BLOB_BYTES {
                return Err(asset_preflight_error(AssetErrorCode::LimitExceeded));
            }
        }
    }
    if reference.size_bytes > MAX_PNG_INPUT_BYTES {
        return Err(asset_preflight_error(AssetErrorCode::LimitExceeded));
    }
    if reference.media_type != PNG_MEDIA_TYPE {
        return Err(asset_preflight_error(AssetErrorCode::MediaTypeMismatch));
    }
    Ok(())
}

fn asset_preflight_error(code: AssetErrorCode) -> LocalAssetHostError {
    LocalAssetHostError::from_asset(AssetError::new(
        code,
        "evaluation texture AssetRef preflight failed",
    ))
}

fn asset_ingestion_error(code: AssetErrorCode) -> LocalAssetHostError {
    LocalAssetHostError::from_asset(AssetError::new(
        code,
        "referenced PNG manifest closure ingestion failed",
    ))
}
