//! Internal C10 candidate using the independently frozen compound expectations
//! and machine DAG; not a sealed candidate or a product activation path.

use std::fmt;

use vivi_runtime_native_evaluation_math::raw::D64;
use vivi_runtime_native_preactivation::{EvaluationTexturePlanV1, ValidatedEvaluationPayloadV1};

use crate::model::{D64BitsV1, ParameterSpecV1, RangeV1};
use crate::observation::Observer;
use crate::{
    EvaluationLoweringError, EvaluationLoweringErrorKind, EvaluationLoweringFoundationV1,
    lower_evaluation_foundation_v1,
};

/// A redacted failure from an internal input mutation or derived update.
///
/// The error retains no input identifiers, values, paths or dependency text.
#[derive(Clone, Copy, Eq, PartialEq)]
pub struct EvaluationMutationError {
    status: i32,
    cause: Option<EvaluationLoweringErrorKind>,
}

impl EvaluationMutationError {
    const INVALID_ARGUMENT: Self = Self {
        status: 1,
        cause: None,
    };
    const INTERNAL: Self = Self {
        status: 10,
        cause: Some(EvaluationLoweringErrorKind::Internal),
    };

    /// Returns the existing invalid-argument, evaluation or internal status.
    #[must_use]
    pub const fn status(self) -> i32 {
        self.status
    }

    #[cfg(test)]
    #[allow(
        dead_code,
        reason = "Called by the separate same-source C10 conformance harness"
    )]
    pub(crate) const fn test_cause(self) -> Option<EvaluationLoweringErrorKind> {
        self.cause
    }

    fn from_evaluation(error: EvaluationLoweringError) -> Self {
        match error.kind() {
            EvaluationLoweringErrorKind::NumericNonFinite
            | EvaluationLoweringErrorKind::NumericOverflow
            | EvaluationLoweringErrorKind::NumericUnderflow
            | EvaluationLoweringErrorKind::NumericSubnormal => Self {
                status: 9,
                cause: Some(error.kind()),
            },
            _ => Self::INTERNAL,
        }
    }
}

impl fmt::Debug for EvaluationMutationError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("EvaluationMutationError")
            .field("status", &self.status)
            .field("cause", &self.cause)
            .finish()
    }
}

impl fmt::Display for EvaluationMutationError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self.status {
            1 => "evaluation mutation argument is invalid",
            9 => "derived evaluation failed",
            _ => "evaluation mutation failed internally",
        })
    }
}

impl std::error::Error for EvaluationMutationError {}

fn checked_range(
    range: RangeV1,
    length: usize,
) -> Result<std::ops::Range<usize>, EvaluationMutationError> {
    let start = usize::try_from(range.start).map_err(|_| EvaluationMutationError::INTERNAL)?;
    let count = usize::try_from(range.len).map_err(|_| EvaluationMutationError::INTERNAL)?;
    let end = start
        .checked_add(count)
        .ok_or(EvaluationMutationError::INTERNAL)?;
    if end > length {
        return Err(EvaluationMutationError::INTERNAL);
    }
    Ok(start..end)
}

fn validate_parameter(spec: ParameterSpecV1) -> Result<(), EvaluationMutationError> {
    let min = D64::from_bits(spec.min.bits);
    let max = D64::from_bits(spec.max.bits);
    if !min.is_finite() || !max.is_finite() || max.lt(min) {
        return Err(EvaluationMutationError::INTERNAL);
    }
    Ok(())
}

// Called only after the input and both endpoints have been validated. Selection
// performs no arithmetic and preserves an in-range negative zero verbatim.
fn clamp_parameter(spec: ParameterSpecV1, value: D64BitsV1) -> D64BitsV1 {
    let number = D64::from_bits(value.bits);
    if number.lt(D64::from_bits(spec.min.bits)) {
        spec.min
    } else if number.gt(D64::from_bits(spec.max.bits)) {
        spec.max
    } else {
        value
    }
}

/// An owned, initially evaluated internal candidate, not a sealed runtime model.
///
/// Initial derived values are committed inside this privately owned token only
/// after all arithmetic succeeds. It performs no texture reads, topology construction,
/// activation or category-11 invariant sealing. Dropping a failed construction
/// releases its privately owned foundation without exposing partial results.
pub struct EvaluationDerivedCandidateV1 {
    pub(crate) foundation: EvaluationLoweringFoundationV1,
    dynamic_generation: u64,
}

impl EvaluationDerivedCandidateV1 {
    /// Returns the generation checked by the single correlation operation.
    #[must_use]
    pub const fn request_generation(&self) -> u64 {
        self.foundation.request_generation()
    }

    /// Returns the number of successful updates, independent of request identity.
    #[must_use]
    pub const fn dynamic_generation(&self) -> u64 {
        self.dynamic_generation
    }

    // The fixed overflow cases set only this private scalar after real initial
    // construction. No production mutation surface or second counter is added.
    #[cfg(test)]
    #[allow(
        dead_code,
        reason = "Called by the separate same-source C10 conformance harness"
    )]
    pub(crate) fn test_set_dynamic_generation(&mut self, generation: u64) {
        self.dynamic_generation = generation;
    }

    /// Returns the number of meshes in recursive payload order.
    #[must_use]
    pub fn mesh_count(&self) -> usize {
        self.foundation.mesh_count()
    }

    /// Changes one caller-current scalar by exact UTF-8 identity.
    ///
    /// Unknown identities and nonfinite values fail before mutation. Finite
    /// values are branch-clamped to the declared range without evaluation.
    pub fn set_input(&mut self, id: &str, value_bits: u64) -> Result<(), EvaluationMutationError> {
        if !D64::from_bits(value_bits).is_finite() {
            return Err(EvaluationMutationError::INVALID_ARGUMENT);
        }
        let plan = &mut self.foundation.reservation_plan;
        if plan.parameter_current.len() != plan.parameter_specs.len() {
            return Err(EvaluationMutationError::INTERNAL);
        }
        for (slot, spec) in plan.parameter_specs.iter().copied().enumerate() {
            let range = checked_range(spec.symbol_range, plan.parameter_symbol_bytes.len())?;
            if &plan.parameter_symbol_bytes[range] == id.as_bytes() {
                validate_parameter(spec)?;
                plan.parameter_current[slot] =
                    clamp_parameter(spec, D64BitsV1 { bits: value_bits });
                return Ok(());
            }
        }
        Err(EvaluationMutationError::INVALID_ARGUMENT)
    }

    /// Applies one preset atomically to caller-current inputs in its typed order.
    ///
    /// Every range, destination and value is checked before the first write;
    /// the subsequent fixed-buffer assignments cannot fail or allocate.
    pub fn apply_preset(&mut self, id: &str) -> Result<(), EvaluationMutationError> {
        let plan = &mut self.foundation.reservation_plan;
        if plan.parameter_current.len() != plan.parameter_specs.len() {
            return Err(EvaluationMutationError::INTERNAL);
        }
        let mut values = None;
        for spec in &plan.parameter_preset_specs {
            let range = checked_range(spec.symbol_range, plan.parameter_symbol_bytes.len())?;
            if &plan.parameter_symbol_bytes[range] == id.as_bytes() {
                values = Some(checked_range(
                    spec.value_range,
                    plan.parameter_preset_values.len(),
                )?);
                break;
            }
        }
        let values = values.ok_or(EvaluationMutationError::INVALID_ARGUMENT)?;
        for value in &plan.parameter_preset_values[values.start..values.end] {
            let slot = usize::try_from(value.parameter_slot)
                .map_err(|_| EvaluationMutationError::INTERNAL)?;
            let spec = plan
                .parameter_specs
                .get(slot)
                .copied()
                .ok_or(EvaluationMutationError::INTERNAL)?;
            validate_parameter(spec)?;
            if !D64::from_bits(value.value.bits).is_finite() {
                return Err(EvaluationMutationError::INTERNAL);
            }
        }
        for value in &plan.parameter_preset_values[values] {
            let slot = value.parameter_slot as usize;
            plan.parameter_current[slot] = clamp_parameter(plan.parameter_specs[slot], value.value);
        }
        Ok(())
    }

    /// Evaluates a finite, nonnegative binary64 delta without changing identity.
    ///
    /// Only complete success commits scratch results. Failure preserves all
    /// committed snapshots and the caller-current inputs, allowing a later retry.
    /// Physics caps a positive delta to one quarter second internally.
    /// Generation exhaustion fails before argument validation or scratch writes.
    /// Even a zero-delta or visibly unchanged successful update increments it.
    pub fn update(&mut self, delta_bits: u64) -> Result<(), EvaluationMutationError> {
        self.update_observed(delta_bits, &mut Observer::silent())
    }

    // Production and fixed-buffer evidence use the same numerical path. Only
    // cfg(test) can construct an observer that retains checkpoint records.
    pub(crate) fn update_observed(
        &mut self,
        delta_bits: u64,
        observer: &mut Observer<'_>,
    ) -> Result<(), EvaluationMutationError> {
        let next_generation = self
            .dynamic_generation
            .checked_add(1)
            .ok_or(EvaluationMutationError::INTERNAL)?;
        let delta = D64::from_bits(delta_bits);
        if !delta.is_finite() || delta.lt(D64::from_bits(0)) {
            return Err(EvaluationMutationError::INVALID_ARGUMENT);
        }
        let plan = &mut self.foundation.reservation_plan;
        crate::state::begin_update(plan).map_err(EvaluationMutationError::from_evaluation)?;
        crate::derived::evaluate_update(plan, delta_bits, observer)
            .map_err(EvaluationMutationError::from_evaluation)?;
        crate::state::commit_evaluation(plan).map_err(EvaluationMutationError::from_evaluation)?;
        // Only infallible scalar publication follows the complete buffer commit.
        self.dynamic_generation = next_generation;
        Ok(())
    }
}

impl fmt::Debug for EvaluationDerivedCandidateV1 {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("EvaluationDerivedCandidateV1")
            .field("request_generation", &self.request_generation())
            .field("dynamic_generation", &self.dynamic_generation())
            .field("mesh_count", &self.mesh_count())
            .finish()
    }
}

/// Builds the existing category-9 foundation, then evaluates its initial state.
///
/// All correlation, feature checks, direct projection and fallible reservations
/// run before derived arithmetic. The existing foundation entry remains usable
/// independently. An error consumes this invocation's state and returns only its
/// redacted cause; no partially evaluated candidate is returned.
pub fn lower_derived_evaluation_v1(
    caller_generation: u64,
    candidate: ValidatedEvaluationPayloadV1,
    texture_plan: EvaluationTexturePlanV1,
) -> Result<EvaluationDerivedCandidateV1, EvaluationLoweringError> {
    lower_derived_evaluation_observed(
        caller_generation,
        candidate,
        texture_plan,
        &mut Observer::silent(),
    )
}

pub(crate) fn lower_derived_evaluation_observed(
    caller_generation: u64,
    candidate: ValidatedEvaluationPayloadV1,
    texture_plan: EvaluationTexturePlanV1,
    observer: &mut Observer<'_>,
) -> Result<EvaluationDerivedCandidateV1, EvaluationLoweringError> {
    let foundation = lower_evaluation_foundation_v1(caller_generation, candidate, texture_plan)?;
    evaluate_reserved_foundation_observed(foundation, observer)
}

// Both C10-only and C11 construction enter this exact initial evaluator once.
pub(crate) fn evaluate_reserved_foundation_observed(
    mut foundation: EvaluationLoweringFoundationV1,
    observer: &mut Observer<'_>,
) -> Result<EvaluationDerivedCandidateV1, EvaluationLoweringError> {
    crate::derived::evaluate_initial(&mut foundation.reservation_plan, observer)?;
    crate::state::commit_evaluation(&mut foundation.reservation_plan)?;
    Ok(EvaluationDerivedCandidateV1 {
        foundation,
        dynamic_generation: 0,
    })
}
