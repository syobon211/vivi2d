use std::collections::{HashMap, hash_map::Entry};

use sha2::{Digest as _, Sha256};
use vivi_png_ref::{DecodedImage, Error as PngError};

use crate::manifest::{CHUNK_BYTES, MANIFEST_INPUT_MAX_BYTES, parse_chunk_manifest};
use crate::model::{BLOB_MAX_BYTES, LOGICAL_ASSET_MAX_BYTES};
use crate::{
    AssetError, AssetErrorCode, AssetReadStore, AssetRef, Descriptor, Digest, EmbeddedBlobStore,
    ObjectRead, ObjectSnapshot, ObjectState, OperationError, PrincipalId, StorageKind,
};

const PNG_MEDIA_TYPE: &str = "image/png";

/// Fully attested embedded PNG, ready for durable blob/descriptor insertion.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PreparedEmbeddedPng {
    reference: AssetRef,
    descriptor: Descriptor,
    logical_bytes: Vec<u8>,
    decoded: DecodedImage,
}

impl PreparedEmbeddedPng {
    #[must_use]
    pub fn reference(&self) -> &AssetRef {
        &self.reference
    }

    #[must_use]
    pub fn descriptor(&self) -> &Descriptor {
        &self.descriptor
    }

    #[must_use]
    pub fn logical_bytes(&self) -> &[u8] {
        &self.logical_bytes
    }

    #[must_use]
    pub fn decoded(&self) -> &DecodedImage {
        &self.decoded
    }
}

/// Generation-pinned logical bytes and full strict decode for immediate
/// activation work. Keeping these bytes avoids re-reading a different store
/// generation during the same activation attempt.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReadyPng {
    reference: AssetRef,
    logical_bytes: Vec<u8>,
    decoded: DecodedImage,
    source_generations: Vec<(Digest, u64)>,
}

impl ReadyPng {
    #[must_use]
    pub fn reference(&self) -> &AssetRef {
        &self.reference
    }

    #[must_use]
    pub fn logical_bytes(&self) -> &[u8] {
        &self.logical_bytes
    }

    #[must_use]
    pub fn decoded(&self) -> &DecodedImage {
        &self.decoded
    }

    /// Exact-address generations captured with the owned snapshots. Entries
    /// are ordered as top object then first occurrence of each unique manifest
    /// chunk. Ordered repeated chunks reuse that same pinned owned snapshot.
    #[must_use]
    pub fn source_generations(&self) -> &[(Digest, u64)] {
        &self.source_generations
    }

    #[must_use]
    pub fn into_parts(self) -> (AssetRef, Vec<u8>, DecodedImage, Vec<(Digest, u64)>) {
        (
            self.reference,
            self.logical_bytes,
            self.decoded,
            self.source_generations,
        )
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ResolvePng {
    Ready(ReadyPng),
    /// Only an absent top-level physical object or a top-level transient
    /// materializing/restoring state maps here. An active object without an
    /// exact descriptor is a hard descriptor mismatch.
    Missing,
}

/// Hashes and fully decodes an embedded PNG before exposing materialization
/// work. Base64 syntax belongs to the model/host adapter and is intentionally
/// outside this byte-oriented seam.
pub fn prepare_embedded_png(
    bytes: &[u8],
    declared_width: u32,
    declared_height: u32,
) -> Result<PreparedEmbeddedPng, AssetError> {
    let size_bytes = u64::try_from(bytes.len()).map_err(|_| {
        asset_error(
            AssetErrorCode::TooLargeForEmbed,
            "embedded byte length is not representable",
        )
    })?;
    if size_bytes > BLOB_MAX_BYTES {
        return Err(asset_error(
            AssetErrorCode::TooLargeForEmbed,
            "embedded assets are limited to 16 MiB blobs",
        ));
    }
    let content_sha256 = sha256(bytes);
    let decoded = vivi_png_ref::decode(
        bytes,
        content_sha256.as_bytes(),
        declared_width,
        declared_height,
    )
    .map_err(map_png_error)?;
    let logical_bytes = try_copy(bytes)?;
    let reference = AssetRef {
        object_address: content_sha256,
        storage_kind: StorageKind::Blob,
        content_sha256,
        media_type: PNG_MEDIA_TYPE.to_owned(),
        size_bytes,
    };
    let descriptor = Descriptor::from_reference(&reference);
    Ok(PreparedEmbeddedPng {
        reference,
        descriptor,
        logical_bytes,
        decoded,
    })
}

/// Writes an already attested embedded PNG through the minimal durable seam.
/// Blob insertion precedes descriptor insertion; an unreferenced blob left by
/// descriptor failure is explicitly permitted for later owner-ref GC.
pub fn materialize_prepared_png<S: EmbeddedBlobStore>(
    store: &mut S,
    principal: &PrincipalId,
    prepared: &PreparedEmbeddedPng,
) -> Result<AssetRef, OperationError<S::Error>> {
    store
        .put_verified_blob_if_absent(
            principal,
            prepared.reference.object_address,
            &prepared.logical_bytes,
        )
        .map_err(OperationError::StoreUnavailable)?;
    store
        .put_descriptor_if_absent(principal, &prepared.reference, &prepared.descriptor)
        .map_err(OperationError::StoreUnavailable)?;
    Ok(prepared.reference.clone())
}

/// Resolves one referenced PNG with frozen ordering, closure, hash, descriptor,
/// and full decoder checks. No store access occurs when reference-level PNG
/// limits already make the operation impossible.
pub fn resolve_referenced_png<S: AssetReadStore>(
    store: &S,
    principal: &PrincipalId,
    reference: &AssetRef,
    declared_width: u32,
    declared_height: u32,
) -> Result<ResolvePng, OperationError<S::Error>> {
    validate_png_reference(reference)?;

    // Frozen server ordering: top object/state first. The bounded read is an
    // exact-address read, never a prefix listing or "latest" generation guess.
    let top_max_bytes = match reference.storage_kind {
        StorageKind::Blob => BLOB_MAX_BYTES,
        StorageKind::ChunkManifest => MANIFEST_INPUT_MAX_BYTES as u64,
    };
    let top = store
        .object(principal, reference.object_address, top_max_bytes)
        .map_err(OperationError::StoreUnavailable)?;
    let top = match top {
        ObjectRead::Missing => return Ok(ResolvePng::Missing),
        ObjectRead::TooLarge => {
            return Err(asset_error(
                AssetErrorCode::LimitExceeded,
                "top-level physical object exceeds its bounded read ceiling",
            )
            .into());
        }
        ObjectRead::Snapshot(snapshot) => match classify_top_state(snapshot)? {
            Some(snapshot) => snapshot,
            None => return Ok(ResolvePng::Missing),
        },
    };
    enforce_top_snapshot_bound(&top, reference.storage_kind)?;

    let descriptor = store
        .descriptor(principal, reference)
        .map_err(OperationError::StoreUnavailable)?;
    let Some(descriptor) = descriptor else {
        return Err(asset_error(
            AssetErrorCode::DescriptorMismatch,
            "active physical object has no exact descriptor",
        )
        .into());
    };
    validate_descriptor_kind(reference, &descriptor)?;

    if top.address != reference.object_address {
        return Err(asset_error(
            AssetErrorCode::HashMismatch,
            "store snapshot address differs from the exact lookup key",
        )
        .into());
    }

    let resolved = match reference.storage_kind {
        StorageKind::Blob => resolve_blob(top, reference, &descriptor)?,
        StorageKind::ChunkManifest => {
            resolve_manifest(store, principal, top, reference, &descriptor)?
        }
    };

    let decoded = vivi_png_ref::decode(
        &resolved.bytes,
        reference.content_sha256.as_bytes(),
        declared_width,
        declared_height,
    )
    .map_err(|error| OperationError::Asset(map_png_error(error)))?;
    Ok(ResolvePng::Ready(ReadyPng {
        reference: reference.clone(),
        logical_bytes: resolved.bytes,
        decoded,
        source_generations: resolved.generations,
    }))
}

fn validate_png_reference(reference: &AssetRef) -> Result<(), AssetError> {
    match reference.storage_kind {
        StorageKind::Blob => {
            if reference.size_bytes > BLOB_MAX_BYTES {
                return Err(asset_error(
                    AssetErrorCode::LimitExceeded,
                    "blob reference exceeds 16 MiB",
                ));
            }
            if reference.object_address != reference.content_sha256 {
                return Err(asset_error(
                    AssetErrorCode::HashMismatch,
                    "blob objectAddress differs from contentSha256",
                ));
            }
        }
        StorageKind::ChunkManifest => {
            if reference.size_bytes <= BLOB_MAX_BYTES {
                return Err(asset_error(
                    AssetErrorCode::LimitExceeded,
                    "chunk_manifest reference is not larger than 16 MiB",
                ));
            }
            if reference.size_bytes > LOGICAL_ASSET_MAX_BYTES {
                return Err(asset_error(
                    AssetErrorCode::LimitExceeded,
                    "logical reference exceeds 64 GiB",
                ));
            }
        }
    }
    if reference.size_bytes > vivi_png_ref::MAX_PNG_INPUT_BYTES {
        return Err(asset_error(
            AssetErrorCode::LimitExceeded,
            "PNG input exceeds the frozen 64 MiB limit",
        ));
    }
    Ok(())
}

fn validate_descriptor_kind(
    reference: &AssetRef,
    descriptor: &Descriptor,
) -> Result<(), AssetError> {
    if descriptor.storage_kind != reference.storage_kind {
        return Err(asset_error(
            AssetErrorCode::DescriptorMismatch,
            "descriptor storageKind differs from the expected AssetRef",
        ));
    }
    Ok(())
}

fn classify_top_state(snapshot: ObjectSnapshot) -> Result<Option<ObjectSnapshot>, AssetError> {
    match snapshot.state {
        ObjectState::Active => Ok(Some(snapshot)),
        ObjectState::Materializing | ObjectState::Restoring => Ok(None),
        ObjectState::Tombstoned | ObjectState::Deleting | ObjectState::Deleted => Err(asset_error(
            AssetErrorCode::DeletedObjectRef,
            "top-level object is tombstoned or deleted",
        )),
    }
}

fn enforce_top_snapshot_bound(
    snapshot: &ObjectSnapshot,
    storage_kind: StorageKind,
) -> Result<(), AssetError> {
    let max = match storage_kind {
        StorageKind::Blob => BLOB_MAX_BYTES,
        StorageKind::ChunkManifest => MANIFEST_INPUT_MAX_BYTES as u64,
    };
    let actual = u64::try_from(snapshot.bytes.len()).map_err(|_| {
        asset_error(
            AssetErrorCode::LimitExceeded,
            "top-level snapshot length is not representable",
        )
    })?;
    if actual > max {
        return Err(asset_error(
            AssetErrorCode::LimitExceeded,
            "store violated the bounded top-level object read",
        ));
    }
    Ok(())
}

struct ResolvedLogical {
    bytes: Vec<u8>,
    generations: Vec<(Digest, u64)>,
}

fn resolve_blob(
    snapshot: ObjectSnapshot,
    reference: &AssetRef,
    descriptor: &Descriptor,
) -> Result<ResolvedLogical, AssetError> {
    if sha256(&snapshot.bytes) != reference.object_address {
        return Err(asset_error(
            AssetErrorCode::HashMismatch,
            "blob physical bytes do not match objectAddress",
        ));
    }
    verify_logical(&snapshot.bytes, reference, descriptor)?;
    Ok(ResolvedLogical {
        generations: vec![(snapshot.address, snapshot.storage_generation)],
        bytes: snapshot.bytes,
    })
}

fn resolve_manifest<S: AssetReadStore>(
    store: &S,
    principal: &PrincipalId,
    snapshot: ObjectSnapshot,
    reference: &AssetRef,
    descriptor: &Descriptor,
) -> Result<ResolvedLogical, OperationError<S::Error>> {
    let top_generation = (snapshot.address, snapshot.storage_generation);
    let manifest = parse_chunk_manifest(&snapshot.bytes)?;
    if manifest.object_address != reference.object_address {
        return Err(asset_error(
            AssetErrorCode::HashMismatch,
            "manifest received-value JCS hash differs from objectAddress",
        )
        .into());
    }
    // PNG-specific reference preflight ensures this conversion/allocation can
    // never approach the general 64 GiB Asset Model ceiling.
    let capacity = usize::try_from(reference.size_bytes).map_err(|_| {
        OperationError::Asset(asset_error(
            AssetErrorCode::LimitExceeded,
            "logical PNG length is not addressable",
        ))
    })?;
    let mut logical = Vec::new();
    logical.try_reserve_exact(capacity).map_err(|_| {
        OperationError::Asset(asset_error(
            AssetErrorCode::LimitExceeded,
            "logical PNG allocation failed",
        ))
    })?;
    let mut generations = Vec::new();
    generations
        .try_reserve_exact(manifest.chunks.len().saturating_add(1))
        .map_err(|_| {
            OperationError::Asset(asset_error(
                AssetErrorCode::LimitExceeded,
                "snapshot-generation allocation failed",
            ))
        })?;
    generations.push(top_generation);
    let mut chunk_cache = HashMap::<Digest, ObjectSnapshot>::new();
    chunk_cache
        .try_reserve(manifest.chunks.len())
        .map_err(|_| {
            OperationError::Asset(asset_error(
                AssetErrorCode::LimitExceeded,
                "chunk snapshot-cache allocation failed",
            ))
        })?;

    for chunk in &manifest.chunks {
        let chunk_snapshot = match chunk_cache.entry(chunk.sha256) {
            Entry::Occupied(entry) => entry.into_mut(),
            Entry::Vacant(entry) => {
                let read = store
                    .object(principal, chunk.sha256, CHUNK_BYTES)
                    .map_err(OperationError::StoreUnavailable)?;
                let chunk_snapshot = match read {
                    ObjectRead::Missing => {
                        return Err(asset_error(
                            AssetErrorCode::ChunkMissing,
                            "manifest chunk is absent",
                        )
                        .into());
                    }
                    ObjectRead::TooLarge => {
                        return Err(asset_error(
                            AssetErrorCode::LimitExceeded,
                            "manifest chunk exceeds the 8 MiB physical ceiling",
                        )
                        .into());
                    }
                    ObjectRead::Snapshot(snapshot) => snapshot,
                };
                match chunk_snapshot.state {
                    ObjectState::Active => {}
                    ObjectState::Materializing | ObjectState::Restoring => {
                        return Err(asset_error(
                            AssetErrorCode::ChunkMissing,
                            "manifest chunk is temporarily unavailable",
                        )
                        .into());
                    }
                    ObjectState::Tombstoned | ObjectState::Deleting | ObjectState::Deleted => {
                        return Err(asset_error(
                            AssetErrorCode::DeletedObjectRef,
                            "manifest chunk is tombstoned or deleted",
                        )
                        .into());
                    }
                }
                let actual_size = u64::try_from(chunk_snapshot.bytes.len()).map_err(|_| {
                    OperationError::Asset(asset_error(
                        AssetErrorCode::LimitExceeded,
                        "chunk length is not representable",
                    ))
                })?;
                if actual_size > CHUNK_BYTES {
                    return Err(asset_error(
                        AssetErrorCode::LimitExceeded,
                        "store violated the bounded chunk read",
                    )
                    .into());
                }
                if chunk_snapshot.address != chunk.sha256
                    || sha256(&chunk_snapshot.bytes) != chunk.sha256
                {
                    return Err(asset_error(
                        AssetErrorCode::HashMismatch,
                        "chunk physical bytes do not match sha256",
                    )
                    .into());
                }
                generations.push((chunk_snapshot.address, chunk_snapshot.storage_generation));
                entry.insert(chunk_snapshot)
            }
        };
        let actual_size = u64::try_from(chunk_snapshot.bytes.len()).map_err(|_| {
            OperationError::Asset(asset_error(
                AssetErrorCode::LimitExceeded,
                "chunk length is not representable",
            ))
        })?;
        if actual_size != chunk.size_bytes {
            return Err(asset_error(
                AssetErrorCode::SizeMismatch,
                "chunk physical length differs from manifest sizeBytes",
            )
            .into());
        }
        let prospective = logical
            .len()
            .checked_add(chunk_snapshot.bytes.len())
            .ok_or_else(|| {
                OperationError::Asset(asset_error(
                    AssetErrorCode::LimitExceeded,
                    "logical reconstruction length overflowed",
                ))
            })?;
        if prospective > capacity {
            return Err(asset_error(
                AssetErrorCode::SizeMismatch,
                "chunk reconstruction exceeds declared logical size",
            )
            .into());
        }
        // Ordered repeats append the same generation-pinned cached bytes again.
        logical.extend_from_slice(&chunk_snapshot.bytes);
    }
    let actual_digest = sha256(&logical);
    if actual_digest != manifest.content_sha256
        || actual_digest != reference.content_sha256
        || actual_digest != descriptor.content_sha256
    {
        return Err(asset_error(
            AssetErrorCode::ContentHashMismatch,
            "reconstructed bytes differ from manifest or AssetRef contentSha256",
        )
        .into());
    }
    let actual_size = u64::try_from(logical.len()).map_err(|_| {
        OperationError::Asset(asset_error(
            AssetErrorCode::LimitExceeded,
            "reconstructed length is not representable",
        ))
    })?;
    if actual_size != manifest.size_bytes
        || actual_size != reference.size_bytes
        || actual_size != descriptor.size_bytes
    {
        return Err(asset_error(
            AssetErrorCode::SizeMismatch,
            "reconstructed length differs from manifest or AssetRef sizeBytes",
        )
        .into());
    }
    if manifest.media_type != reference.media_type
        || descriptor.media_type != reference.media_type
        || reference.media_type != PNG_MEDIA_TYPE
    {
        return Err(asset_error(
            AssetErrorCode::MediaTypeMismatch,
            "manifest mediaType differs from the AssetRef",
        )
        .into());
    }
    Ok(ResolvedLogical {
        bytes: logical,
        generations,
    })
}

fn verify_logical(
    bytes: &[u8],
    reference: &AssetRef,
    descriptor: &Descriptor,
) -> Result<(), AssetError> {
    let size = u64::try_from(bytes.len()).map_err(|_| {
        asset_error(
            AssetErrorCode::LimitExceeded,
            "logical content length is not representable",
        )
    })?;
    let actual_digest = sha256(bytes);
    if actual_digest != reference.content_sha256 || actual_digest != descriptor.content_sha256 {
        return Err(asset_error(
            AssetErrorCode::ContentHashMismatch,
            "logical bytes do not match contentSha256",
        ));
    }
    if size != reference.size_bytes || size != descriptor.size_bytes {
        return Err(asset_error(
            AssetErrorCode::SizeMismatch,
            "logical content length differs from the AssetRef",
        ));
    }
    if descriptor.media_type != reference.media_type || reference.media_type != PNG_MEDIA_TYPE {
        return Err(asset_error(
            AssetErrorCode::MediaTypeMismatch,
            "descriptor/ref mediaType does not match image/png",
        ));
    }
    Ok(())
}

fn try_copy(bytes: &[u8]) -> Result<Vec<u8>, AssetError> {
    let mut result = Vec::new();
    result.try_reserve_exact(bytes.len()).map_err(|_| {
        asset_error(
            AssetErrorCode::LimitExceeded,
            "owned logical-byte allocation failed",
        )
    })?;
    result.extend_from_slice(bytes);
    Ok(result)
}

fn sha256(bytes: &[u8]) -> Digest {
    let hash = Sha256::digest(bytes);
    let mut result = [0_u8; Digest::LENGTH];
    result.copy_from_slice(&hash);
    Digest::from_bytes(result)
}

pub(crate) fn map_png_error(error: PngError) -> AssetError {
    let code = match error {
        PngError::Unsupported => AssetErrorCode::DecodingProfileUnsupported,
        PngError::Malformed => AssetErrorCode::DecodeMalformed,
        PngError::Limit => AssetErrorCode::LimitExceeded,
        PngError::Dimension => AssetErrorCode::DimensionMismatch,
        PngError::ContentHashMismatch => AssetErrorCode::ContentHashMismatch,
    };
    asset_error(code, "strict vivi2d.png.rgba8.v1 attestation failed")
}

fn asset_error(code: AssetErrorCode, detail: &'static str) -> AssetError {
    AssetError::new(code, detail)
}
