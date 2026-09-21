use std::cell::RefCell;
use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};

use vivi_asset_resolver::{
    AssetError, AssetErrorCode, AssetReadStore, AssetRef, Descriptor, Digest, EmbeddedBlobStore,
    ObjectRead, ObjectSnapshot, ObjectState, OperationError, ParsedManifest, PrincipalId,
    ResolvePng, StorageKind, materialize_prepared_png, parse_chunk_manifest, prepare_embedded_png,
    resolve_referenced_png as resolve_png_with_store, validate_exact_closure,
};
use vivi_asset_store_local::{LocalImmutableAssetStore, LocalStoreError, LocalStoreErrorKind};

use crate::activation::validate_asset_shape;
use crate::error::{LocalAssetHostError, PngTransferError};
use crate::model::{
    EvaluationTexturePlanV1, ExportPngClosureV1, PNG_PROFILE_V1, PngClosureExportV1,
    PngClosureObjectV1, PrepareActivationTextureSetV1, ReferencedAtlasResolutionV1,
    ReferencedPngClosureObjectV1, ReferencedPngManifestClosureV1, VerifiedAtlasAssetV1,
    VerifiedPngV1,
};

const MAX_REFERENCED_PNG_CLOSURE_OBJECTS: usize = 9;
// This bounds only retained transfer copies: PNG input plus one raw manifest.
// Resolver/store owners still enforce their own per-read/decode limits.
const MAX_CAPTURED_PNG_CLOSURE_BYTES: u64 = 68_157_440;

/// Principal-bound facade over one private immutable SQLite Asset store.
/// Neither its principal nor its path is observable through this API.
pub struct LocalAssetHost {
    store: LocalImmutableAssetStore,
    principal: PrincipalId,
}

impl LocalAssetHost {
    /// Exports one exact owned physical PNG closure through the existing
    /// resolver's validation/read ordering. No host reference preflight runs
    /// before it; Missing and descriptor failures retain resolver precedence.
    pub fn export_png_closure(
        &self,
        reference: &AssetRef,
        declared_width: u32,
        declared_height: u32,
        cancellation: &AtomicBool,
    ) -> Result<ExportPngClosureV1, PngTransferError> {
        export_png_closure_from_store(
            &self.store,
            &self.principal,
            reference,
            declared_width,
            declared_height,
            cancellation,
            &|e: LocalStoreError| Some(e.kind()),
        )
    }

    /// Revalidates untrusted transfer bytes before descriptor-last publication.
    /// Cancellation is checked before work and once after all validation. Once
    /// writing starts, completion or an outcome-ambiguous Store error wins.
    pub fn import_png_closure(
        &mut self,
        reference: &AssetRef,
        closure: &PngClosureExportV1,
        declared_width: u32,
        declared_height: u32,
        cancellation: &AtomicBool,
    ) -> Result<VerifiedAtlasAssetV1, PngTransferError> {
        import_png_closure_into_store(
            &mut self.store,
            &self.principal,
            reference,
            closure,
            declared_width,
            declared_height,
            cancellation,
            &|e: LocalStoreError| Some(e.kind()),
        )
    }

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

fn ensure_not_cancelled(cancellation: &AtomicBool) -> Result<(), PngTransferError> {
    if cancellation.load(Ordering::Acquire) {
        Err(PngTransferError::cancelled_before_publication())
    } else {
        Ok(())
    }
}

#[derive(Default)]
struct CapturedPngObjects {
    objects: Vec<PngClosureObjectV1>,
    total_bytes: u64,
}

enum RecordingReadError<E> {
    Store(E),
    ResourceLimit,
}

struct RecordingReadStore<'a, S> {
    store: &'a S,
    captured: RefCell<CapturedPngObjects>,
}

impl<S: AssetReadStore> RecordingReadStore<'_, S> {
    fn record(&self, snapshot: &ObjectSnapshot) -> Result<(), RecordingReadError<S::Error>> {
        let mut captured = self.captured.borrow_mut();
        if captured
            .objects
            .iter()
            .any(|o| o.address == snapshot.address)
        {
            return Ok(());
        }
        if captured.objects.len() >= MAX_REFERENCED_PNG_CLOSURE_OBJECTS {
            return Err(RecordingReadError::ResourceLimit);
        }
        let length =
            u64::try_from(snapshot.bytes.len()).map_err(|_| RecordingReadError::ResourceLimit)?;
        let total = captured
            .total_bytes
            .checked_add(length)
            .filter(|n| *n <= MAX_CAPTURED_PNG_CLOSURE_BYTES)
            .ok_or(RecordingReadError::ResourceLimit)?;
        let mut bytes = Vec::new();
        bytes
            .try_reserve_exact(snapshot.bytes.len())
            .map_err(|_| RecordingReadError::ResourceLimit)?;
        bytes.extend_from_slice(&snapshot.bytes);
        captured
            .objects
            .try_reserve_exact(1)
            .map_err(|_| RecordingReadError::ResourceLimit)?;
        captured.objects.push(PngClosureObjectV1 {
            address: snapshot.address,
            bytes,
        });
        captured.total_bytes = total;
        Ok(())
    }
}

impl<S: AssetReadStore> AssetReadStore for RecordingReadStore<'_, S> {
    type Error = RecordingReadError<S::Error>;

    fn descriptor(
        &self,
        principal: &PrincipalId,
        expected: &AssetRef,
    ) -> Result<Option<Descriptor>, Self::Error> {
        self.store
            .descriptor(principal, expected)
            .map_err(RecordingReadError::Store)
    }

    fn object(
        &self,
        principal: &PrincipalId,
        address: Digest,
        max_bytes: u64,
    ) -> Result<ObjectRead, Self::Error> {
        let result = self
            .store
            .object(principal, address, max_bytes)
            .map_err(RecordingReadError::Store)?;
        if let ObjectRead::Snapshot(snapshot) = &result {
            // Leave invalid/transient snapshots to the resolver's existing
            // classification; a recorder must not turn them into success.
            if snapshot.state == ObjectState::Active && (snapshot.bytes.len() as u64) <= max_bytes {
                self.record(snapshot)?;
            }
        }
        Ok(result)
    }
}

pub(crate) fn export_png_closure_from_store<S, F>(
    store: &S,
    principal: &PrincipalId,
    reference: &AssetRef,
    declared_width: u32,
    declared_height: u32,
    cancellation: &AtomicBool,
    classify_store_error: &F,
) -> Result<ExportPngClosureV1, PngTransferError>
where
    S: AssetReadStore,
    F: Fn(S::Error) -> Option<LocalStoreErrorKind>,
{
    ensure_not_cancelled(cancellation)?;
    let recording = RecordingReadStore {
        store,
        captured: RefCell::new(CapturedPngObjects::default()),
    };
    // Deliberately no validate_asset_shape: resolver top/descriptor/media
    // ordering is authoritative for export, including Missing precedence.
    let resolved = resolve_png_with_store(
        &recording,
        principal,
        reference,
        declared_width,
        declared_height,
    )
    .map_err(|error| match error {
        OperationError::Asset(error) => LocalAssetHostError::from_asset(error),
        OperationError::StoreUnavailable(RecordingReadError::Store(error)) => {
            LocalAssetHostError::from_store_kind(classify_store_error(error))
        }
        OperationError::StoreUnavailable(RecordingReadError::ResourceLimit) => {
            LocalAssetHostError::resource_limit_exceeded()
        }
    })?;
    ensure_not_cancelled(cancellation)?;
    let ResolvePng::Ready(ready) = resolved else {
        return Ok(ExportPngClosureV1::Missing);
    };
    let reference = ready.reference().clone();
    let info = ready.decoded().info;
    drop(ready);
    Ok(ExportPngClosureV1::Ready(PngClosureExportV1 {
        reference,
        width: info.width,
        height: info.height,
        objects: recording.captured.into_inner().objects,
    }))
}

// Retain the existing store/principal/reference/dimensions/classifier seam;
// the transfer adds only its owned closure and one cancellation checkpoint.
#[allow(clippy::too_many_arguments)]
pub(crate) fn import_png_closure_into_store<S, F>(
    store: &mut S,
    principal: &PrincipalId,
    reference: &AssetRef,
    closure: &PngClosureExportV1,
    declared_width: u32,
    declared_height: u32,
    cancellation: &AtomicBool,
    classify_store_error: &F,
) -> Result<VerifiedAtlasAssetV1, PngTransferError>
where
    S: EmbeddedBlobStore + ReferencedPngManifestWriteStore<Error = <S as EmbeddedBlobStore>::Error>,
    F: Fn(<S as EmbeddedBlobStore>::Error) -> Option<LocalStoreErrorKind>,
{
    ensure_not_cancelled(cancellation)?;
    validate_asset_shape(reference)?;
    if closure.reference != *reference {
        return Err(asset_ingestion_error(AssetErrorCode::DescriptorMismatch).into());
    }
    if (closure.width, closure.height) != (declared_width, declared_height) {
        return Err(asset_ingestion_error(AssetErrorCode::DimensionMismatch).into());
    }
    match reference.storage_kind {
        StorageKind::Blob => {
            if closure.objects.len() != 1 || closure.objects[0].address != reference.object_address
            {
                return Err(asset_ingestion_error(AssetErrorCode::RefSetMismatch).into());
            }
            let prepared =
                prepare_embedded_png(&closure.objects[0].bytes, declared_width, declared_height)
                    .map_err(LocalAssetHostError::from_asset)?;
            // Compare the entire independently generated reference BEFORE any put.
            if prepared.reference() != reference {
                return Err(asset_ingestion_error(AssetErrorCode::HashMismatch).into());
            }
            publish_transfer_blob(
                store,
                principal,
                &prepared,
                cancellation,
                classify_store_error,
            )
        }
        StorageKind::ChunkManifest => {
            if closure.objects.len() > MAX_REFERENCED_PNG_CLOSURE_OBJECTS {
                return Err(asset_ingestion_error(AssetErrorCode::RefSetMismatch).into());
            }
            let mut wire = Vec::new();
            wire.try_reserve_exact(closure.objects.len())
                .map_err(|_| LocalAssetHostError::resource_limit_exceeded())?;
            for object in &closure.objects {
                wire.push(object.address.to_lower_hex());
            }
            let mut objects = Vec::new();
            objects
                .try_reserve_exact(closure.objects.len())
                .map_err(|_| LocalAssetHostError::resource_limit_exceeded())?;
            for (address, object) in wire.iter().zip(&closure.objects) {
                objects.push(ReferencedPngClosureObjectV1::new(address, &object.bytes));
            }
            ingest_manifest_with_cancellation(
                store,
                principal,
                reference,
                &ReferencedPngManifestClosureV1::new(objects),
                declared_width,
                declared_height,
                Some(cancellation),
                classify_store_error,
            )
            .map_err(PngTransferError::publication_failure)
        }
    }
}

pub(crate) fn publish_transfer_blob<S, F>(
    store: &mut S,
    principal: &PrincipalId,
    prepared: &vivi_asset_resolver::PreparedEmbeddedPng,
    cancellation: &AtomicBool,
    classify_store_error: &F,
) -> Result<VerifiedAtlasAssetV1, PngTransferError>
where
    S: EmbeddedBlobStore,
    F: Fn(S::Error) -> Option<LocalStoreErrorKind>,
{
    let info = prepared.decoded().info;
    ensure_not_cancelled(cancellation)?;
    // No cancellation callback between these immutable writes. A Store error
    // can follow the descriptor commit and is conservatively ambiguous.
    let reference = materialize_prepared_png(store, principal, prepared).map_err(|error| {
        PngTransferError::from(map_publication_error(error, classify_store_error))
            .publication_failure()
    })?;
    Ok(verified_attestation(reference, info.width, info.height))
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
    ingest_manifest_with_cancellation(
        store,
        principal,
        reference,
        closure,
        declared_width,
        declared_height,
        None,
        classify_store_error,
    )
    .map_err(|error| {
        error
            .host_error()
            .expect("non-cancellable ingestion has a host cause")
    })
}

// The existing ingestion seam plus an optional final cancellation checkpoint.
#[allow(clippy::too_many_arguments)]
pub(crate) fn ingest_manifest_with_cancellation<S, F>(
    store: &mut S,
    principal: &PrincipalId,
    reference: &AssetRef,
    closure: &ReferencedPngManifestClosureV1<'_>,
    declared_width: u32,
    declared_height: u32,
    cancellation: Option<&AtomicBool>,
    classify_store_error: &F,
) -> Result<VerifiedAtlasAssetV1, PngTransferError>
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
    if let Some(cancellation) = cancellation {
        ensure_not_cancelled(cancellation)?;
    }
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
    crate::activation::prepare_activation_texture_set_from_store(
        store,
        principal,
        request_generation,
        plan,
        &|error| LocalAssetHostError::from_store_kind(classify_store_error(error)),
    )
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

fn asset_ingestion_error(code: AssetErrorCode) -> LocalAssetHostError {
    LocalAssetHostError::from_asset(AssetError::new(
        code,
        "referenced PNG manifest closure ingestion failed",
    ))
}

#[cfg(test)]
mod recording_tests {
    use super::*;

    struct NoReads;
    impl AssetReadStore for NoReads {
        type Error = ();
        fn descriptor(&self, _: &PrincipalId, _: &AssetRef) -> Result<Option<Descriptor>, ()> {
            panic!("recording-bound unit test does not assert resolver readiness")
        }
        fn object(&self, _: &PrincipalId, _: Digest, _: u64) -> Result<ObjectRead, ()> {
            panic!("recording-bound unit test does not assert resolver readiness")
        }
    }
    fn snapshot(byte: u8) -> ObjectSnapshot {
        ObjectSnapshot {
            address: Digest::from_bytes([byte; Digest::LENGTH]),
            storage_generation: 0,
            state: ObjectState::Active,
            bytes: vec![byte],
        }
    }

    #[test]
    fn recorder_caps_unique_objects_before_copy_and_deduplicates() {
        let recording = RecordingReadStore {
            store: &NoReads,
            captured: RefCell::new(CapturedPngObjects::default()),
        };
        for byte in 0..9 {
            assert!(recording.record(&snapshot(byte)).is_ok());
        }
        assert!(recording.record(&snapshot(0)).is_ok());
        assert_eq!(recording.captured.borrow().objects.len(), 9);
        assert!(matches!(
            recording.record(&snapshot(9)),
            Err(RecordingReadError::ResourceLimit)
        ));
        assert_eq!(recording.captured.borrow().objects.len(), 9);
    }

    #[test]
    fn recorder_caps_retained_bytes_with_checked_arithmetic() {
        let recording = RecordingReadStore {
            store: &NoReads,
            captured: RefCell::new(CapturedPngObjects {
                objects: Vec::new(),
                total_bytes: MAX_CAPTURED_PNG_CLOSURE_BYTES - 1,
            }),
        };
        assert!(recording.record(&snapshot(0)).is_ok());
        assert_eq!(
            recording.captured.borrow().total_bytes,
            MAX_CAPTURED_PNG_CLOSURE_BYTES
        );
        assert!(matches!(
            recording.record(&snapshot(1)),
            Err(RecordingReadError::ResourceLimit)
        ));
        recording.captured.borrow_mut().total_bytes = u64::MAX;
        assert!(matches!(
            recording.record(&snapshot(1)),
            Err(RecordingReadError::ResourceLimit)
        ));
        assert_eq!(recording.captured.borrow().objects.len(), 1);
    }
}
