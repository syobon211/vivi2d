#![forbid(unsafe_code)]
#![deny(missing_docs)]

//! Private, platform-neutral Evaluation Payload v1 validation foundation.
//!
//! This crate stops at an owned, binary64-normalized validated candidate and a stable
//! required-texture inventory. It does not lower binary64 values into the
//! current `f32` runtime model, expose a C ABI, load assets, upload GPU data,
//! establish generation freshness, or activate a model.
//!
//! Explicit large vectors, sets, maps, and derived strings use checked
//! arithmetic and fallible reservation. This is not an exact peak-memory or
//! recoverable-OOM claim: `serde_json`'s internal map/schema allocations retain
//! their normal process-allocation behavior.

mod error;
mod schema_equivalent;
mod semantic;
mod transport;

use std::fmt;

pub use error::{EvaluationPayloadError, EvaluationPayloadErrorKind};
use serde_json::Value;

/// Exact approved Evaluation Payload v1 Schema 2020-12 artifact.
pub const APPROVED_EVALUATION_PAYLOAD_V1_SCHEMA_BYTES: &[u8] =
    include_bytes!("../schema/evaluation-payload-v1.schema.json");

/// SHA-256 of [`APPROVED_EVALUATION_PAYLOAD_V1_SCHEMA_BYTES`].
pub const APPROVED_EVALUATION_PAYLOAD_V1_SCHEMA_SHA256: &str =
    "8d65b5ddea137a71894e57ba6e14c94576aad63b2b7586728fa2bcca5bb125a3";

/// Raw Evaluation Payload v1 UTF-8 byte ceiling.
pub const EVALUATION_PAYLOAD_V1_MAX_INPUT_BYTES: usize = transport::MAX_INPUT_BYTES;
/// Evaluation Payload v1 container-depth ceiling.
pub const EVALUATION_PAYLOAD_V1_MAX_CONTAINER_DEPTH: usize = transport::MAX_CONTAINER_DEPTH;
/// Evaluation Payload v1 JSON token ceiling.
pub const EVALUATION_PAYLOAD_V1_MAX_TOKENS: usize = transport::MAX_TOKENS;
/// Evaluation Payload v1 single decoded-string UTF-8 byte ceiling.
pub const EVALUATION_PAYLOAD_V1_MAX_STRING_BYTES: usize = transport::MAX_STRING_BYTES;

/// One required texture binding derived deterministically from a payload atlas.
pub struct RequiredTextureBindingV1 {
    id: String,
    width: u32,
    height: u32,
}

impl RequiredTextureBindingV1 {
    /// Returns the stable `atlas:<sourceAtlasId>` binding identifier.
    #[must_use]
    pub fn id(&self) -> &str {
        &self.id
    }

    /// Returns the declared atlas width.
    #[must_use]
    pub const fn width(&self) -> u32 {
        self.width
    }

    /// Returns the declared atlas height.
    #[must_use]
    pub const fn height(&self) -> u32 {
        self.height
    }
}

impl fmt::Debug for RequiredTextureBindingV1 {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("RequiredTextureBindingV1")
            .field("id_utf8_bytes", &self.id.len())
            .field("width", &self.width)
            .field("height", &self.height)
            .finish()
    }
}

/// Owned Runtime Spec v1.0 loader-preflight Evaluation Payload v1 candidate.
///
/// Stage 1 and Stage 2 have succeeded and currently unsupported non-empty
/// clips/state machines have been excluded. Fields are private so a caller
/// cannot fabricate a validated value. Preserved JSON numbers use finite
/// binary64 semantics and are never cast to the current runtime core's `f32`
/// representation. Future lowering or activation remains subject to the A-09
/// numeric-domain and evaluator blend-mode audits and is outside this crate.
pub struct ValidatedEvaluationPayloadV1 {
    request_generation: u64,
    value: Value,
    texture_bindings: Vec<RequiredTextureBindingV1>,
}

impl ValidatedEvaluationPayloadV1 {
    /// Returns the caller-assigned generation exactly, including the full `u64` range.
    #[must_use]
    pub const fn request_generation(&self) -> u64 {
        self.request_generation
    }

    /// Borrows the complete owned, binary64-normalized validated JSON value.
    #[must_use]
    pub const fn value(&self) -> &Value {
        &self.value
    }

    /// Consumes the candidate and returns the complete binary64-normalized JSON value.
    #[must_use]
    pub fn into_value(self) -> Value {
        self.value
    }

    /// Returns the exact required binding inventory in UTF-8 byte order.
    #[must_use]
    pub fn texture_bindings(&self) -> &[RequiredTextureBindingV1] {
        &self.texture_bindings
    }
}

impl fmt::Debug for ValidatedEvaluationPayloadV1 {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("ValidatedEvaluationPayloadV1")
            .field("request_generation", &self.request_generation)
            .field("texture_binding_count", &self.texture_bindings.len())
            .finish()
    }
}

/// Parses and validates one Evaluation Payload v1 without activation or lowering.
///
/// Validation order is raw byte ceiling, UTF-8/BOM/strict duplicate-aware JSON
/// transport, approved Schema 2020-12 Stage 1, then versioned semantic Stage 2.
/// A candidate is returned only after every stage and inventory construction
/// succeeds. `request_generation` is data and is echoed without ordering or
/// JavaScript-safe-integer policy.
pub fn parse_evaluation_payload_v1(
    raw: &[u8],
    request_generation: u64,
) -> Result<ValidatedEvaluationPayloadV1, EvaluationPayloadError> {
    let value = transport::parse(raw)?;
    schema_equivalent::validate(&value)?;
    semantic::validate_and_inventory(value, request_generation)
}

#[cfg(test)]
mod tests;
