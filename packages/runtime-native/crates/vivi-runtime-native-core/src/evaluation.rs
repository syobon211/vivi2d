//! Opt-in trusted CPU ownership; no language bridge or renderer publication.

use std::fmt;
pub(crate) mod preparation;
use vivi_runtime_native_evaluation_lowering::{
    EvaluationMutationError, PreparedActivationTextureSetV1, PreparedLoweredEvaluationV1,
    SealedEvaluationCandidateV1,
};

const MAX_SAFE_REQUEST: u64 = 9_007_199_254_740_991;

/// Redacted owner failures; delegated mutation statuses are not coerced through
/// the separate legacy RuntimeError catalog.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EvaluationOwnerError {
    /// No active model, invalid request range or regressing observation.
    InvalidArgument,
    /// The success-only model-generation space is exhausted.
    Internal,
    /// The same sealed evaluator rejected an input, preset or update.
    Mutation(EvaluationMutationError),
}

impl EvaluationOwnerError {
    /// Existing argument/internal or unchanged delegated mutation status.
    pub const fn status(self) -> i32 {
        match self {
            Self::InvalidArgument => 1,
            Self::Internal => 10,
            Self::Mutation(error) => error.status(),
        }
    }
}

impl fmt::Display for EvaluationOwnerError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::InvalidArgument => "evaluation owner argument is invalid",
            Self::Internal => "evaluation owner generation is exhausted",
            Self::Mutation(_) => "evaluation owner mutation failed",
        })
    }
}
impl std::error::Error for EvaluationOwnerError {}

/// One consuming activation outcome, not a new ABI status.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EvaluationActivationV1 {
    /// A complete owned candidate replaced the incumbent.
    Activated {
        /// Runtime-local success-only replacement identity.
        model_generation: u64,
    },
    /// Stale, never-issued, duplicate or exhausted request; incumbent retained.
    Superseded,
}

/// Separate request identity and model/topology/dynamic cache generations.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct EvaluationGenerationsV1 {
    /// EDH issuance order, not a principal or model identity.
    pub request: u64,
    /// Success-only replacement count of this runtime instance.
    pub model: u64,
    /// The same sealed C11 candidate's topology generation.
    pub topology: u64,
    /// The same C10 candidate's successful update count.
    pub dynamic: u64,
}

/// One complete active CPU owner. Authorized accessors are not sanitized logs.
///
/// ```compile_fail
/// use vivi_runtime_native_core::EvaluationRuntimeV1;
/// fn invalid_borrow(runtime: &mut EvaluationRuntimeV1) {
///     let view = runtime.active().unwrap().candidate().mesh_snapshot(0).unwrap();
///     runtime.update(0).unwrap();
///     assert!(view.is_some());
/// }
/// ```
pub struct ActiveEvaluationV1 {
    candidate: SealedEvaluationCandidateV1,
    textures: PreparedActivationTextureSetV1,
    model_generation: u64,
}

impl ActiveEvaluationV1 {
    /// Borrow checked C11 views without another model or evaluation.
    pub fn candidate(&self) -> &SealedEvaluationCandidateV1 {
        &self.candidate
    }
    /// Borrow actual complete PNG/RGBA owners; their Debug is not log-safe.
    pub fn prepared_textures(&self) -> &PreparedActivationTextureSetV1 {
        &self.textures
    }
    /// Read counters from their respective owners, without updating.
    pub fn generations(&self) -> EvaluationGenerationsV1 {
        EvaluationGenerationsV1 {
            request: self.candidate.request_generation(),
            model: self.model_generation,
            topology: self.candidate.topology_generation(),
            dynamic: self.candidate.dynamic_generation(),
        }
    }
}

impl fmt::Debug for ActiveEvaluationV1 {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("ActiveEvaluationV1")
            .field("generations", &self.generations())
            .field("mesh_count", &self.candidate.mesh_count())
            .field("texture_count", &self.textures.textures().len())
            .finish()
    }
}

/// Trusted instance-local CPU owner, bound by its eventual adapter to one EDH
/// host/principal. Numeric generation equality does not authenticate callers.
#[derive(Debug, Default)]
pub struct EvaluationRuntimeV1 {
    latest_observed: u64,
    exhausted: bool,
    last_model_generation: u64,
    active: Option<ActiveEvaluationV1>,
}

impl EvaluationRuntimeV1 {
    /// No issued request, no active model and no assigned model generation.
    pub fn new() -> Self {
        Self::default()
    }

    /// Observe the real bound EDH's monotonic request state. Equal observations
    /// still incorporate exhaustion; invalid observations change nothing.
    pub fn observe_request_state(
        &mut self,
        latest_issued: u64,
        exhausted: bool,
    ) -> Result<(), EvaluationOwnerError> {
        if latest_issued > MAX_SAFE_REQUEST || latest_issued < self.latest_observed {
            return Err(EvaluationOwnerError::InvalidArgument);
        }
        self.latest_observed = latest_issued;
        self.exhausted |= exhausted;
        Ok(())
    }

    /// Consume one Ready without reinitialization. Freshness precedes the
    /// checked model counter; all fallible work precedes complete publication.
    pub fn try_activate(
        &mut self,
        ready: PreparedLoweredEvaluationV1,
    ) -> Result<EvaluationActivationV1, EvaluationOwnerError> {
        let request = ready.request_generation();
        if self.latest_observed == 0
            || self.exhausted
            || request != self.latest_observed
            || self
                .active
                .as_ref()
                .is_some_and(|active| active.candidate.request_generation() == request)
        {
            return Ok(EvaluationActivationV1::Superseded);
        }
        let model_generation = self
            .last_model_generation
            .checked_add(1)
            .ok_or(EvaluationOwnerError::Internal)?;
        let (candidate, textures) = ready.into_parts();
        let next = ActiveEvaluationV1 {
            candidate,
            textures,
            model_generation,
        };
        let retired = self.active.replace(next);
        self.last_model_generation = model_generation;
        drop(retired);
        Ok(EvaluationActivationV1::Activated { model_generation })
    }

    /// Borrow the incumbent, if one was successfully activated.
    pub fn active(&self) -> Option<&ActiveEvaluationV1> {
        self.active.as_ref()
    }

    /// Change caller-current input only; no evaluation or counter increment.
    pub fn set_input(&mut self, id: &str, bits: u64) -> Result<(), EvaluationOwnerError> {
        self.active_candidate()?
            .set_input(id, bits)
            .map_err(EvaluationOwnerError::Mutation)
    }

    /// Apply the same atomic caller-input preset without evaluating.
    pub fn apply_preset(&mut self, id: &str) -> Result<(), EvaluationOwnerError> {
        self.active_candidate()?
            .apply_preset(id)
            .map_err(EvaluationOwnerError::Mutation)
    }

    /// Delegate once to the same transactional C10 evaluator and counter.
    pub fn update(&mut self, delta_bits: u64) -> Result<(), EvaluationOwnerError> {
        self.active_candidate()?
            .update(delta_bits)
            .map_err(EvaluationOwnerError::Mutation)
    }

    fn active_candidate(
        &mut self,
    ) -> Result<&mut SealedEvaluationCandidateV1, EvaluationOwnerError> {
        self.active
            .as_mut()
            .map(|active| &mut active.candidate)
            .ok_or(EvaluationOwnerError::InvalidArgument)
    }
}

#[cfg(test)]
mod tests;
