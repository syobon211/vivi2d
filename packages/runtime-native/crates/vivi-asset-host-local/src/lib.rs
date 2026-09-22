//! Principal-bound orchestration for the private local Asset Model v1 store.
//!
//! This crate composes the approved immutable store, strict PNG resolver, and
//! frozen evaluation texture-plan contract. It has no language bridge, IPC,
//! C ABI, WASM surface, or capability advertisement. Embedded PNG blobs can be
//! materialized here. Complete referenced chunk-manifest PNG closures are
//! fully verified before descriptor-last publication.
//!
//! The crate-local approved texture-plan schema is identity evidence, not a
//! raw-JSON parsing surface. Stage-1 UTF-8/JSON limits, duplicate-key
//! rejection, schema validation, and conversion into the typed plan belong to
//! a later language-bridge slice.

mod activation;
mod byte_input;
mod error;
#[cfg(feature = "local-store")]
mod host;
mod model;

pub use byte_input::{EvaluationPhysicalObjectV1, prepare_activation_texture_set_from_bytes};
pub use error::{LocalAssetHostError, LocalAssetHostErrorKind};
#[cfg(feature = "local-store")]
pub use error::{PngTransferError, PngTransferErrorKind};
#[cfg(feature = "local-store")]
pub use host::LocalAssetHost;
pub use model::{
    EvaluationTextureBindingV1, EvaluationTexturePlanV1, ExportPngClosureV1,
    MissingActivationTexturesV1, PngClosureExportV1, PngClosureObjectV1,
    PrepareActivationTextureSetV1, PreparedActivationTextureSetV1, PreparedActivationTextureV1,
    ReferencedAtlasResolutionV1, ReferencedPngClosureObjectV1, ReferencedPngManifestClosureV1,
    VerifiedAtlasAssetV1, VerifiedPngV1,
};
pub use vivi_asset_resolver::{
    AssetErrorCode, AssetRef, Digest, PrincipalId, ReadyPng, StorageKind,
};
#[cfg(feature = "local-store")]
pub use vivi_asset_store_local::LocalStoreErrorKind;

#[cfg(all(test, feature = "local-store"))]
mod tests;
