use std::fmt;

use vivi_asset_host_local::{
    EvaluationTexturePlanV1, MissingActivationTexturesV1, PreparedActivationTextureSetV1,
};
use vivi_runtime_native_evaluation::ValidatedEvaluationPayloadV1;

/// A complete preactivation result or a deterministic missing-texture state.
pub enum PrepareEvaluationActivationV1 {
    /// Every correlated texture was resolved and retained as owned data.
    Ready(PreparedEvaluationActivationV1),
    /// At least one correlated texture is absent; no partial ready set escaped.
    Missing(MissingEvaluationActivationV1),
}

impl PrepareEvaluationActivationV1 {
    /// Returns the caller-assigned request generation unchanged.
    #[must_use]
    pub const fn request_generation(&self) -> u64 {
        match self {
            Self::Ready(value) => value.request_generation(),
            Self::Missing(value) => value.request_generation(),
        }
    }
}

impl fmt::Debug for PrepareEvaluationActivationV1 {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Ready(value) => formatter.debug_tuple("Ready").field(value).finish(),
            Self::Missing(value) => formatter.debug_tuple("Missing").field(value).finish(),
        }
    }
}

/// Owned, exactly correlated payload, texture plan, and resolved texture set.
///
/// Fields are private so callers cannot fabricate an activation-ready value by
/// combining outputs from different requests. This wrapper's `Debug` output is
/// redacted. The explicit accessors expose host-owned texture data for a future
/// uploader; those transitive values retain the host/resolver `Debug` and
/// ownership contracts and must not be logged by an eventual bridge.
pub struct PreparedEvaluationActivationV1 {
    pub(crate) candidate: ValidatedEvaluationPayloadV1,
    pub(crate) texture_plan: EvaluationTexturePlanV1,
    pub(crate) prepared_textures: PreparedActivationTextureSetV1,
}

impl PreparedEvaluationActivationV1 {
    /// Returns the caller-assigned request generation unchanged.
    #[must_use]
    pub const fn request_generation(&self) -> u64 {
        self.candidate.request_generation()
    }

    /// Borrows the validated binary64-normalized Evaluation Payload candidate.
    #[must_use]
    pub const fn candidate(&self) -> &ValidatedEvaluationPayloadV1 {
        &self.candidate
    }

    /// Borrows the exact typed texture plan correlated with the candidate.
    #[must_use]
    pub const fn texture_plan(&self) -> &EvaluationTexturePlanV1 {
        &self.texture_plan
    }

    /// Borrows the complete generation-pinned, owned PNG/RGBA texture set.
    #[must_use]
    pub const fn prepared_textures(&self) -> &PreparedActivationTextureSetV1 {
        &self.prepared_textures
    }

    /// Consumes the bundle without weakening its previously established correlation.
    #[must_use]
    pub fn into_parts(
        self,
    ) -> (
        ValidatedEvaluationPayloadV1,
        EvaluationTexturePlanV1,
        PreparedActivationTextureSetV1,
    ) {
        (self.candidate, self.texture_plan, self.prepared_textures)
    }
}

impl fmt::Debug for PreparedEvaluationActivationV1 {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("PreparedEvaluationActivationV1")
            .field("request_generation", &self.request_generation())
            .field("texture_binding_count", &self.texture_plan.textures.len())
            .field("total_pixels", &self.prepared_textures.total_pixels())
            .field(
                "total_rgba_bytes",
                &self.prepared_textures.total_rgba_bytes(),
            )
            .finish()
    }
}

/// Owned, exactly correlated request whose absent textures prevented readiness.
///
/// Any textures resolved earlier in the same host attempt were dropped before
/// this value was constructed. This wrapper's `Debug` output reports counts,
/// never the missing binding identifiers.
pub struct MissingEvaluationActivationV1 {
    pub(crate) candidate: ValidatedEvaluationPayloadV1,
    pub(crate) texture_plan: EvaluationTexturePlanV1,
    pub(crate) missing_textures: MissingActivationTexturesV1,
}

impl MissingEvaluationActivationV1 {
    /// Returns the caller-assigned request generation unchanged.
    #[must_use]
    pub const fn request_generation(&self) -> u64 {
        self.candidate.request_generation()
    }

    /// Borrows the validated binary64-normalized Evaluation Payload candidate.
    #[must_use]
    pub const fn candidate(&self) -> &ValidatedEvaluationPayloadV1 {
        &self.candidate
    }

    /// Borrows the exact typed texture plan correlated with the candidate.
    #[must_use]
    pub const fn texture_plan(&self) -> &EvaluationTexturePlanV1 {
        &self.texture_plan
    }

    /// Borrows the deterministic plan-order missing-texture state.
    #[must_use]
    pub const fn missing_textures(&self) -> &MissingActivationTexturesV1 {
        &self.missing_textures
    }

    /// Consumes the missing state and returns its correlated owned inputs.
    #[must_use]
    pub fn into_parts(
        self,
    ) -> (
        ValidatedEvaluationPayloadV1,
        EvaluationTexturePlanV1,
        MissingActivationTexturesV1,
    ) {
        (self.candidate, self.texture_plan, self.missing_textures)
    }
}

impl fmt::Debug for MissingEvaluationActivationV1 {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("MissingEvaluationActivationV1")
            .field("request_generation", &self.request_generation())
            .field("texture_binding_count", &self.texture_plan.textures.len())
            .field(
                "missing_texture_count",
                &self.missing_textures.texture_ids().len(),
            )
            .finish()
    }
}
