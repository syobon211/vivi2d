//! Concrete byte preparation over the same parser, sealed evaluator and resolver.
use std::fmt;
use vivi_runtime_native_evaluation_lowering::{
    EvaluationLoweringError, EvaluationPayloadError, EvaluationPhysicalObjectV1,
    EvaluationPreactivationError, EvaluationTexturePlanV1, MissingLoweredEvaluationV1,
    PrepareLoweredEvaluationV1, lower_sealed_evaluation_v1, parse_evaluation_payload_v1,
    prepare_lowered_evaluation_from_bytes_v1,
};

/// Redacted, status-preserving preparation failures, not legacy runtime errors.
#[derive(Clone, Copy, Eq, PartialEq)]
pub enum EvaluationPreparationError {
    /// Existing strict raw-payload admission failure.
    Payload(EvaluationPayloadError),
    /// Existing correlation/C1–11 failure, including numeric load status14.
    Lowering(EvaluationLoweringError),
    /// Existing Asset/PNG preparation failure.
    Preparation(EvaluationPreactivationError),
}

impl EvaluationPreparationError {
    /// Delegates the owning phase's unchanged load status.
    pub const fn status(self) -> i32 {
        match self {
            Self::Payload(error) => error.status(),
            Self::Lowering(error) => error.load_status(),
            Self::Preparation(error) => error.load_status(),
        }
    }
}
impl fmt::Display for EvaluationPreparationError {
    fn fmt(&self, output: &mut fmt::Formatter<'_>) -> fmt::Result {
        output.write_str(match self {
            Self::Payload(_) => "evaluation payload rejected",
            Self::Lowering(_) => "evaluation lowering rejected",
            Self::Preparation(_) => "evaluation texture preparation rejected",
        })
    }
}
impl fmt::Debug for EvaluationPreparationError {
    fn fmt(&self, output: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(self, output)
    }
}
impl std::error::Error for EvaluationPreparationError {}

/// Parses once, evaluates/seals once, then resolves actual owned physical bytes.
/// No legacy constructor, update-zero, activation or GPU publication occurs here.
pub fn prepare_evaluation_bytes_v1(
    request_generation: u64,
    payload_utf8: &[u8],
    plan: EvaluationTexturePlanV1,
    objects: Vec<EvaluationPhysicalObjectV1>,
) -> Result<PrepareLoweredEvaluationV1, EvaluationPreparationError> {
    let candidate = parse_evaluation_payload_v1(payload_utf8, request_generation)
        .map_err(EvaluationPreparationError::Payload)?;
    let sealed = lower_sealed_evaluation_v1(request_generation, candidate, plan)
        .map_err(EvaluationPreparationError::Lowering)?;
    prepare_lowered_evaluation_from_bytes_v1(objects, sealed)
        .map_err(EvaluationPreparationError::Preparation)
}

/// Retries only the same retained seal with a complete replacement physical batch.
/// A hard error drops that invocation's seal; no hidden object cache is retained.
pub fn retry_evaluation_bytes_v1(
    missing: MissingLoweredEvaluationV1,
    objects: Vec<EvaluationPhysicalObjectV1>,
) -> Result<PrepareLoweredEvaluationV1, EvaluationPreparationError> {
    let (sealed, _missing) = missing.into_parts();
    prepare_lowered_evaluation_from_bytes_v1(objects, sealed)
        .map_err(EvaluationPreparationError::Preparation)
}

#[cfg(test)]
mod tests;
