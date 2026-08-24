use crate::Digest;

pub const BLOB_MAX_BYTES: u64 = 16_777_216;
pub const LOGICAL_ASSET_MAX_BYTES: u64 = 68_719_476_736;

/// Opaque principal scope supplied to every store operation.
#[derive(Clone, Debug, Eq, Hash, PartialEq)]
pub struct PrincipalId(Vec<u8>);

impl PrincipalId {
    #[must_use]
    pub fn new(value: impl Into<Vec<u8>>) -> Self {
        Self(value.into())
    }

    #[must_use]
    pub fn as_bytes(&self) -> &[u8] {
        &self.0
    }
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub enum StorageKind {
    Blob,
    ChunkManifest,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AssetRef {
    pub object_address: Digest,
    pub storage_kind: StorageKind,
    pub content_sha256: Digest,
    pub media_type: String,
    pub size_bytes: u64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Descriptor {
    pub storage_kind: StorageKind,
    pub content_sha256: Digest,
    pub media_type: String,
    pub size_bytes: u64,
}

impl Descriptor {
    #[must_use]
    pub fn from_reference(reference: &AssetRef) -> Self {
        Self {
            storage_kind: reference.storage_kind,
            content_sha256: reference.content_sha256,
            media_type: reference.media_type.clone(),
            size_bytes: reference.size_bytes,
        }
    }
}

/// Server-backed stores expose the frozen state machine. A local immutable CAS
/// reports `Active`; it must not synthesize transient server states.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ObjectState {
    Active,
    Materializing,
    Restoring,
    Tombstoned,
    Deleting,
    Deleted,
}

/// Atomically captured, generation-pinned owned bytes. The resolver never
/// lists prefixes or tries to infer a newer generation.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ObjectSnapshot {
    pub address: Digest,
    pub storage_generation: u64,
    pub state: ObjectState,
    pub bytes: Vec<u8>,
}

/// Bounded object read result. `TooLarge` is a resolver-owned limit/size
/// condition, not an injected store failure.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ObjectRead {
    Missing,
    TooLarge,
    Snapshot(ObjectSnapshot),
}
