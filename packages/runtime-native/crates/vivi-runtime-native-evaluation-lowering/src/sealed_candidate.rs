//! Pure C11 ownership: reserve all storage, evaluate once, then seal topology.

use std::fmt;

use vivi_runtime_native_preactivation::{
    EvaluationTexturePlanV1, ValidatedEvaluationPayloadV1, correlate_evaluation_activation_v1,
};

use crate::derived_candidate::evaluate_reserved_foundation_observed;
use crate::lower::{materialize_preflighted, preflight_correlated};
use crate::observation::Observer;
use crate::reservation::{Category9ReservationBuffersV1, ReservationStateV1};
use crate::topology::TopologyV1;
use crate::topology_reservation::TopologyCountsV1;
use crate::{
    EvaluationDerivedCandidateV1, EvaluationLoweringError, EvaluationMeshSnapshotV1,
    EvaluationMutationError, EvaluationParameterSnapshotV1,
};

/// Move-owned, initially evaluated and sealed internal candidate.
///
/// It contains no decoded textures and is not an active model. Private fields
/// prevent incomplete construction. Its borrowed views do not allocate or run
/// mathematics; a live view prevents mutable update through Rust's ownership.
///
/// ```compile_fail
/// use vivi_runtime_native_evaluation_lowering::SealedEvaluationCandidateV1;
/// fn duplicate(value: &SealedEvaluationCandidateV1) {
///     fn requires_clone<T: Clone>(_: &T) {}
///     requires_clone(value);
/// }
/// ```
/// ```compile_fail
/// use vivi_runtime_native_evaluation_lowering::SealedEvaluationCandidateV1;
/// fn fabricate(value: SealedEvaluationCandidateV1) {
///     let _ = SealedEvaluationCandidateV1 { derived: value.derived, topology: value.topology };
/// }
/// ```
/// ```compile_fail
/// use vivi_runtime_native_evaluation_lowering::SealedEvaluationCandidateV1;
/// fn update_during_borrow(value: &mut SealedEvaluationCandidateV1) {
///     let view = value.mesh_snapshot(0).unwrap().unwrap();
///     value.update(0).unwrap();
///     assert_eq!(view.mesh_slot(), 0);
/// }
/// ```
pub struct SealedEvaluationCandidateV1 {
    pub(crate) derived: EvaluationDerivedCandidateV1,
    pub(crate) topology: TopologyV1,
}

impl SealedEvaluationCandidateV1 {
    pub(crate) fn texture_plan(&self) -> &EvaluationTexturePlanV1 {
        &self.derived.foundation.texture_plan
    }

    /// Generation checked once by correlation.
    pub fn request_generation(&self) -> u64 {
        self.derived.request_generation()
    }
    /// Successful derived-update count; starts at zero.
    pub fn dynamic_generation(&self) -> u64 {
        self.derived.dynamic_generation()
    }
    /// Immutable topology generation, independent of updates and request IDs.
    pub const fn topology_generation(&self) -> u64 {
        1
    }
    /// Stable payload-DFS mesh count, including invisible mask sources.
    pub fn mesh_count(&self) -> usize {
        self.topology.meshes.len()
    }
    /// Number of exact correlated texture bindings; no bytes are read here.
    pub fn texture_count(&self) -> usize {
        self.derived.foundation.texture_plan.textures.len()
    }
    /// Required render features; bit zero denotes the mask-command protocol.
    pub fn required_render_features(&self) -> u32 {
        u32::from(!self.topology.edges.is_empty())
    }
    /// Fixed command words borrowed from sealed topology, in target draw order.
    pub fn draw_commands(&self) -> impl ExactSizeIterator<Item = [u32; 6]> + '_ {
        self.topology.commands.iter().map(|v| v.words)
    }
    /// Checked borrowed mesh view, or None for an ordinary out-of-range slot.
    pub fn mesh_snapshot(
        &self,
        slot: usize,
    ) -> Result<Option<EvaluationMeshSnapshotV1<'_>>, EvaluationLoweringError> {
        crate::snapshot::mesh(self, slot)
    }
    /// Declared parameter count.
    pub fn parameter_count(&self) -> usize {
        self.derived
            .foundation
            .reservation_plan
            .parameter_specs
            .len()
    }
    /// Checked borrowed input and last-successful evaluated parameter values.
    pub fn parameter_snapshot(
        &self,
        slot: usize,
    ) -> Result<Option<EvaluationParameterSnapshotV1<'_>>, EvaluationLoweringError> {
        crate::snapshot::parameter(self, slot)
    }
    /// Declared preset count; applying a preset remains caller-input-only.
    pub fn preset_count(&self) -> usize {
        self.derived
            .foundation
            .reservation_plan
            .parameter_preset_specs
            .len()
    }
    /// Borrowed preset identity, not sanitized diagnostic data.
    pub fn preset_id(&self, slot: usize) -> Result<Option<&str>, EvaluationLoweringError> {
        let plan = &self.derived.foundation.reservation_plan;
        let Some(preset) = plan.parameter_preset_specs.get(slot) else {
            return Ok(None);
        };
        crate::topology::slice(&plan.parameter_preset_values, preset.value_range)?;
        let id = std::str::from_utf8(crate::topology::slice(
            &plan.parameter_symbol_bytes,
            preset.symbol_range,
        )?)
        .map_err(|_| crate::topology::internal())?;
        Ok(Some(id))
    }
    /// Delegates to the same C10 caller-input mutation without evaluating.
    pub fn set_input(&mut self, id: &str, bits: u64) -> Result<(), EvaluationMutationError> {
        self.derived.set_input(id, bits)
    }
    /// Delegates to the same atomic C10 preset mutation without evaluating.
    pub fn apply_preset(&mut self, id: &str) -> Result<(), EvaluationMutationError> {
        self.derived.apply_preset(id)
    }
    /// Runs exactly the existing transactional C10 update; topology is retained.
    pub fn update(&mut self, delta_bits: u64) -> Result<(), EvaluationMutationError> {
        self.derived.update(delta_bits)
    }
}

impl fmt::Debug for SealedEvaluationCandidateV1 {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("SealedEvaluationCandidateV1")
            .field("request_generation", &self.request_generation())
            .field("dynamic_generation", &self.dynamic_generation())
            .field("mesh_count", &self.mesh_count())
            .field("texture_count", &self.texture_count())
            .finish()
    }
}

/// Consumes one candidate and exact plan: correlation, C1–9, C10 once, then C11.
///
/// All 44 possible reservations precede retained fill. No host/store/texture
/// access, incomplete result, activation or large-buffer clone is possible.
pub fn lower_sealed_evaluation_v1(
    generation: u64,
    candidate: ValidatedEvaluationPayloadV1,
    texture_plan: EvaluationTexturePlanV1,
) -> Result<SealedEvaluationCandidateV1, EvaluationLoweringError> {
    let correlated = correlate_evaluation_activation_v1(generation, candidate, texture_plan)
        .map_err(EvaluationLoweringError::from_correlation)?;
    let preflight = preflight_correlated(correlated)?;
    seal_preflighted(
        preflight,
        &mut ReservationStateV1::production(),
        &mut Observer::silent(),
    )
}

pub(crate) fn seal_preflighted(
    preflight: crate::lower::EvaluationPreflightV1,
    state: &mut ReservationStateV1,
    observer: &mut Observer<'_>,
) -> Result<SealedEvaluationCandidateV1, EvaluationLoweringError> {
    #[cfg(not(test))]
    {
        seal_impl(preflight, state, observer)
    }
    #[cfg(test)]
    {
        seal_impl(preflight, state, observer, None)
    }
}

#[cfg(test)]
pub(crate) fn seal_with_topology_input_for_test(
    preflight: crate::lower::EvaluationPreflightV1,
    state: &mut ReservationStateV1,
    observer: &mut Observer<'_>,
    input: &serde_json::Value,
) -> Result<SealedEvaluationCandidateV1, EvaluationLoweringError> {
    seal_impl(preflight, state, observer, Some(input))
}

fn seal_impl(
    preflight: crate::lower::EvaluationPreflightV1,
    state: &mut ReservationStateV1,
    observer: &mut Observer<'_>,
    #[cfg(test)] input: Option<&serde_json::Value>,
) -> Result<SealedEvaluationCandidateV1, EvaluationLoweringError> {
    let counts = TopologyCountsV1::census(preflight.candidate.value(), &preflight.site_counts)?;
    let buffers =
        Category9ReservationBuffersV1::reserve_all_with_state(&preflight.site_counts, state)?;
    let topology = counts.reserve(state)?;
    let foundation = materialize_preflighted(preflight, buffers)?;
    let derived = evaluate_reserved_foundation_observed(foundation, observer)?;
    #[cfg(not(test))]
    let topology = topology.fill(&derived.foundation)?;
    #[cfg(test)]
    let topology = match input {
        None => topology.fill(&derived.foundation)?,
        Some(input) => topology.fill_from_value(&derived.foundation, input)?,
    };
    let sealed = SealedEvaluationCandidateV1 { derived, topology };
    for slot in 0..sealed.mesh_count() {
        sealed
            .mesh_snapshot(slot)?
            .ok_or_else(crate::topology::internal)?;
    }
    for slot in 0..sealed.parameter_count() {
        sealed
            .parameter_snapshot(slot)?
            .ok_or_else(crate::topology::internal)?;
    }
    for slot in 0..sealed.preset_count() {
        sealed
            .preset_id(slot)?
            .ok_or_else(crate::topology::internal)?;
    }
    Ok(sealed)
}
