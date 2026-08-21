#![forbid(unsafe_code)]
#![deny(missing_docs)]

//! Private, native-only Evaluation Payload preactivation foundation.
//!
//! This crate consumes one validated Evaluation Payload v1 candidate, its
//! typed Evaluation Texture Plan v1, and the principal-bound local Asset host.
//! It proves their exact binding correlation before any Asset-store read and
//! then retains the host's generation-pinned, owned PNG/RGBA results together
//! with the candidate and plan.
//!
//! The coordinator itself moves ownership without cloning PNG or RGBA buffers.
//! Its wrapper and error `Debug` implementations are redacted; deliberately
//! exposed host values such as [`ReadyPng`] retain their own API contracts and
//! must be treated as a future bridge/logging carry-forward boundary.
//!
//! The resulting bundle is still preactivation data. This crate does not lower
//! binary64 values, normalize blend modes, construct a runtime-core model,
//! upload GPU resources, establish generation freshness, expose C ABI or WASM
//! symbols, or advertise a capability.

mod coordinator;
mod error;
mod model;

pub use coordinator::{correlate_evaluation_activation_v1, prepare_evaluation_activation_v1};
pub use error::{EvaluationPreactivationError, EvaluationPreactivationErrorKind};
pub use model::{
    CorrelatedEvaluationActivationV1, MissingEvaluationActivationV1, PrepareEvaluationActivationV1,
    PreparedEvaluationActivationV1,
};
pub use vivi_asset_host_local::{
    AssetErrorCode, AssetRef, Digest, EvaluationTextureBindingV1, EvaluationTexturePlanV1,
    LocalAssetHost, LocalStoreErrorKind, MissingActivationTexturesV1,
    PreparedActivationTextureSetV1, PreparedActivationTextureV1, PrincipalId, ReadyPng,
    StorageKind,
};
pub use vivi_runtime_native_evaluation::{
    EvaluationPayloadError, EvaluationPayloadErrorKind, RequiredTextureBindingV1,
    ValidatedEvaluationPayloadV1, parse_evaluation_payload_v1,
};

#[cfg(test)]
mod tests;
