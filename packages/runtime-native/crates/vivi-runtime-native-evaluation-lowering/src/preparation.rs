//! Consuming post-seal texture preparation; no correlation or evaluation replay.

use std::fmt;

use vivi_runtime_native_preactivation::{
    EvaluationPhysicalObjectV1, EvaluationPreactivationError, MissingActivationTexturesV1,
    PrepareActivationTextureSetV1, PreparedActivationTextureSetV1,
    prepare_evaluation_texture_plan_from_bytes_v1,
};
#[cfg(feature = "native-host")]
use vivi_runtime_native_preactivation::{LocalAssetHost, prepare_evaluation_texture_plan_v1};

use crate::SealedEvaluationCandidateV1;

/// Complete CPU textures or ordered Missing data, retaining the sealed owner.
/// This is neither activation nor generation-freshness authority.
#[derive(Debug)]
pub enum PrepareLoweredEvaluationV1 {
    /// Every exact sealed-plan texture is prepared and owned.
    Ready(PreparedLoweredEvaluationV1),
    /// The same sealed owner can be recovered for an explicit later retry.
    Missing(MissingLoweredEvaluationV1),
}

/// Move-only sealed candidate plus the actual complete host texture set.
///
/// ```compile_fail
/// use vivi_runtime_native_evaluation_lowering::PreparedLoweredEvaluationV1;
/// fn duplicate(value: &PreparedLoweredEvaluationV1) {
///     fn requires_clone<T: Clone>(_: &T) {}
///     requires_clone(value);
/// }
/// ```
/// ```compile_fail
/// use vivi_runtime_native_evaluation_lowering::PreparedLoweredEvaluationV1;
/// fn fabricate(value: PreparedLoweredEvaluationV1) {
///     let _ = PreparedLoweredEvaluationV1 {
///         candidate: value.candidate, prepared_textures: value.prepared_textures,
///     };
/// }
/// ```
pub struct PreparedLoweredEvaluationV1 {
    candidate: SealedEvaluationCandidateV1,
    prepared_textures: PreparedActivationTextureSetV1,
}

impl PreparedLoweredEvaluationV1 {
    /// Request generation retained unchanged from the sealed candidate.
    pub fn request_generation(&self) -> u64 {
        self.candidate.request_generation()
    }
    /// Authorized immutable model-data access, not sanitized logging data.
    pub fn candidate(&self) -> &SealedEvaluationCandidateV1 {
        &self.candidate
    }
    /// Authorized host-data access; the host value's Debug is not log-safe.
    pub fn prepared_textures(&self) -> &PreparedActivationTextureSetV1 {
        &self.prepared_textures
    }
    /// Moves the two complete owned values without evaluating or activating.
    pub fn into_parts(self) -> (SealedEvaluationCandidateV1, PreparedActivationTextureSetV1) {
        (self.candidate, self.prepared_textures)
    }
}

impl fmt::Debug for PreparedLoweredEvaluationV1 {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("PreparedLoweredEvaluationV1")
            .field("request_generation", &self.request_generation())
            .field("mesh_count", &self.candidate.mesh_count())
            .field("texture_count", &self.prepared_textures.textures().len())
            .finish()
    }
}

/// Move-only sealed candidate plus ordered Missing identities, no partial Ready.
///
/// ```compile_fail
/// use vivi_runtime_native_evaluation_lowering::MissingLoweredEvaluationV1;
/// fn duplicate(value: &MissingLoweredEvaluationV1) {
///     fn requires_clone<T: Clone>(_: &T) {}
///     requires_clone(value);
/// }
/// ```
/// ```compile_fail
/// use vivi_runtime_native_evaluation_lowering::MissingLoweredEvaluationV1;
/// fn fabricate(value: MissingLoweredEvaluationV1) {
///     let _ = MissingLoweredEvaluationV1 {
///         candidate: value.candidate, missing_textures: value.missing_textures,
///     };
/// }
/// ```
pub struct MissingLoweredEvaluationV1 {
    candidate: SealedEvaluationCandidateV1,
    missing_textures: MissingActivationTexturesV1,
}

impl MissingLoweredEvaluationV1 {
    /// Request generation retained unchanged from the sealed candidate.
    pub fn request_generation(&self) -> u64 {
        self.candidate.request_generation()
    }
    /// Authorized immutable model-data access, not sanitized logging data.
    pub fn candidate(&self) -> &SealedEvaluationCandidateV1 {
        &self.candidate
    }
    /// Authorized ordered Missing data; its Debug is not log-safe.
    pub fn missing_textures(&self) -> &MissingActivationTexturesV1 {
        &self.missing_textures
    }
    /// Recovers the same sealed owner for explicit retry without resealing.
    pub fn into_parts(self) -> (SealedEvaluationCandidateV1, MissingActivationTexturesV1) {
        (self.candidate, self.missing_textures)
    }
}

impl fmt::Debug for MissingLoweredEvaluationV1 {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("MissingLoweredEvaluationV1")
            .field("request_generation", &self.request_generation())
            .field("mesh_count", &self.candidate.mesh_count())
            .field("missing_count", &self.missing_textures.texture_ids().len())
            .finish()
    }
}

/// Resolves the sealed owner's exact borrowed plan once, then moves ownership.
///
/// No parse, correlation, census/reservation, C10 initialization/update, topology
/// rebuild or logical PNG/RGBA clone occurs here. The real host still performs
/// its own complete preflight, reads and decoding; those may allocate. Earlier
/// Missing never masks a later hard host error. An error drops this invocation's
/// sealed owner. Missing retains it for explicit retry; no active state exists.
#[cfg(feature = "native-host")]
pub fn prepare_lowered_evaluation_v1(
    host: &LocalAssetHost,
    candidate: SealedEvaluationCandidateV1,
) -> Result<PrepareLoweredEvaluationV1, EvaluationPreactivationError> {
    let outcome = prepare_evaluation_texture_plan_v1(
        host,
        candidate.request_generation(),
        candidate.texture_plan(),
    )?;
    Ok(own_outcome(candidate, outcome))
}

/// Consumes the same seal with an untrusted physical batch; no initialization replay.
pub fn prepare_lowered_evaluation_from_bytes_v1(
    objects: Vec<EvaluationPhysicalObjectV1>,
    candidate: SealedEvaluationCandidateV1,
) -> Result<PrepareLoweredEvaluationV1, EvaluationPreactivationError> {
    let outcome = prepare_evaluation_texture_plan_from_bytes_v1(
        candidate.request_generation(),
        candidate.texture_plan(),
        objects,
    )?;
    Ok(own_outcome(candidate, outcome))
}

fn own_outcome(
    candidate: SealedEvaluationCandidateV1,
    outcome: PrepareActivationTextureSetV1,
) -> PrepareLoweredEvaluationV1 {
    match outcome {
        PrepareActivationTextureSetV1::Ready(prepared_textures) => {
            PrepareLoweredEvaluationV1::Ready(PreparedLoweredEvaluationV1 {
                candidate,
                prepared_textures,
            })
        }
        PrepareActivationTextureSetV1::Missing(missing_textures) => {
            PrepareLoweredEvaluationV1::Missing(MissingLoweredEvaluationV1 {
                candidate,
                missing_textures,
            })
        }
    }
}

#[cfg(all(test, feature = "native-host"))]
mod tests;
