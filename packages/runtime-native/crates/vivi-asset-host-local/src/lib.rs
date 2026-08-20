//! Principal-bound orchestration for the private local Asset Model v1 store.
//!
//! This crate composes the approved immutable store, strict PNG resolver, and
//! frozen evaluation texture-plan contract. It has no language bridge, IPC,
//! C ABI, WASM surface, or capability advertisement. Embedded PNG blobs can be
//! materialized here; ingestion of a complete referenced chunk-manifest
//! closure remains an explicit non-goal for this slice.
//!
//! The crate-local approved texture-plan schema is identity evidence, not a
//! raw-JSON parsing surface. Stage-1 UTF-8/JSON limits, duplicate-key
//! rejection, schema validation, and conversion into the typed plan belong to
//! a later language-bridge slice.

mod error;
mod host;
mod model;

pub use error::{LocalAssetHostError, LocalAssetHostErrorKind};
pub use host::LocalAssetHost;
pub use model::{
    EvaluationTextureBindingV1, EvaluationTexturePlanV1, MissingActivationTexturesV1,
    PrepareActivationTextureSetV1, PreparedActivationTextureSetV1, PreparedActivationTextureV1,
    ReferencedAtlasResolutionV1, VerifiedAtlasAssetV1, VerifiedPngV1,
};
pub use vivi_asset_resolver::{
    AssetErrorCode, AssetRef, Digest, PrincipalId, ReadyPng, StorageKind,
};
pub use vivi_asset_store_local::LocalStoreErrorKind;

#[cfg(test)]
mod tests;
