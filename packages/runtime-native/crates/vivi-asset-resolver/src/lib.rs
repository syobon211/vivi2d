//! Frozen Asset Model v1 resolver foundation.
//!
//! The crate owns content verification and strict PNG attestation. Storage is
//! injected through principal-scoped traits; no network, upload, lease, GC,
//! capability-advertisement, or language-bridge policy lives here.

mod digest;
mod error;
mod manifest;
mod model;
mod resolver;
mod store;

pub use digest::{Digest, DigestParseError};
pub use error::{AssetError, AssetErrorCode, OperationError};
pub use manifest::{
    APPROVED_ASSET_SCHEMA_BYTES, APPROVED_ASSET_SCHEMA_SHA256, Chunk, ParsedManifest,
    parse_chunk_manifest, validate_exact_closure,
};
pub use model::{
    AssetRef, Descriptor, ObjectRead, ObjectSnapshot, ObjectState, PrincipalId, StorageKind,
};
pub use resolver::{
    PreparedEmbeddedPng, ReadyPng, ResolvePng, materialize_prepared_png, prepare_embedded_png,
    resolve_referenced_png,
};
pub use store::{AssetReadStore, EmbeddedBlobStore};

#[cfg(test)]
mod tests;
