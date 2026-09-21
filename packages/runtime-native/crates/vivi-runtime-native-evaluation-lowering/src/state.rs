//! Allocation-free transaction copies and commit for the private evaluator.
//!
//! All fallible checks precede mutation. Committing these mathematical buffers
//! does not seal a category-11 candidate or publish a runtime model.

use crate::error::{EvaluationLoweringError, EvaluationLoweringErrorKind};
use crate::model::Category9ReservationPlanV1;

// Frozen C9 encoding.mesh-state-flags / encoding.physics-validity. These name
// existing inline bits; they add no storage or reservation site.
pub(crate) const DERIVED_VALID_FLAG_V1: u32 = 1;
pub(crate) const DERIVED_CULLED_FLAG_V1: u32 = 2;
pub(crate) const DERIVED_VISIBLE_FLAG_V1: u32 = 4;
pub(crate) const PHYSICS_COMMITTED_VALID_FLAG_V1: u32 = 1;
pub(crate) const PHYSICS_UPDATE_VALID_FLAG_V1: u32 = 2;

fn internal() -> EvaluationLoweringError {
    EvaluationLoweringError::new(EvaluationLoweringErrorKind::Internal)
}

fn validate_storage(plan: &Category9ReservationPlanV1) -> Result<(), EvaluationLoweringError> {
    let parameters = plan.parameter_specs.len();
    let bones = plan.bone_specs.len();
    let pendulums = plan.physics_pendulum_configs.len();
    let coordinates = plan.skin_rest_coordinates.len();
    if plan.parameter_current.len() != parameters
        || plan.parameter_previous.len() != parameters
        || plan.parameter_update.len() != parameters
        || plan.bone_committed_overrides.len() != bones
        || plan.bone_update_overrides.len() != bones
        || plan.physics_committed_pendulums.len() != pendulums
        || plan.physics_update_pendulums.len() != pendulums
        || plan.derived_committed_coordinates.len() != coordinates
        || plan.derived_update_coordinates.len() != coordinates
        || plan.skin_skinned_scratch.len() != coordinates
    {
        return Err(internal());
    }
    let physics = &plan.inline_physics_group;
    let known_validity = PHYSICS_COMMITTED_VALID_FLAG_V1 | PHYSICS_UPDATE_VALID_FLAG_V1;
    if physics.present > 1
        || physics.validity & !known_validity != 0
        || (physics.present == 0 && physics.validity != 0)
    {
        return Err(internal());
    }
    Ok(())
}

pub(crate) fn begin_update(
    plan: &mut Category9ReservationPlanV1,
) -> Result<(), EvaluationLoweringError> {
    validate_storage(plan)?;

    // Length checks above make these fixed-buffer copies infallible. Previous
    // successful parameters are intentionally not the caller-current baseline.
    plan.parameter_update
        .copy_from_slice(&plan.parameter_current);
    plan.bone_update_overrides
        .copy_from_slice(&plan.bone_committed_overrides);
    plan.physics_update_pendulums
        .copy_from_slice(&plan.physics_committed_pendulums);
    plan.inline_physics_group.update_accumulator = plan.inline_physics_group.committed_accumulator;
    plan.inline_physics_group.validity &= PHYSICS_COMMITTED_VALID_FLAG_V1;
    for destination in &mut plan.parameter_staged_destinations {
        destination.valid = 0;
    }
    for destination in &mut plan.bone_staged_destinations {
        destination.valid = 0;
    }
    for mesh in &mut plan.mesh_evaluator_specs {
        mesh.update_flags = 0;
    }
    // Derived coordinates are scratch, not a retained baseline: successful
    // evaluation must overwrite them and mark every mesh valid before commit.
    Ok(())
}

pub(crate) fn commit_evaluation(
    plan: &mut Category9ReservationPlanV1,
) -> Result<(), EvaluationLoweringError> {
    validate_storage(plan)?;
    let known_mesh_flags = DERIVED_CULLED_FLAG_V1 | DERIVED_VISIBLE_FLAG_V1 | DERIVED_VALID_FLAG_V1;
    if plan.mesh_evaluator_specs.iter().any(|mesh| {
        mesh.update_flags & DERIVED_VALID_FLAG_V1 == 0 || mesh.update_flags & !known_mesh_flags != 0
    }) || (plan.inline_physics_group.present != 0
        && plan.inline_physics_group.validity & PHYSICS_UPDATE_VALID_FLAG_V1 == 0)
    {
        return Err(internal());
    }

    // There is no fallible work after this point. Exchange the already-owned
    // buffers themselves; never exchange or overwrite caller-current inputs.
    std::mem::swap(&mut plan.parameter_previous, &mut plan.parameter_update);
    std::mem::swap(
        &mut plan.bone_committed_overrides,
        &mut plan.bone_update_overrides,
    );
    std::mem::swap(
        &mut plan.physics_committed_pendulums,
        &mut plan.physics_update_pendulums,
    );
    std::mem::swap(
        &mut plan.derived_committed_coordinates,
        &mut plan.derived_update_coordinates,
    );
    for mesh in &mut plan.mesh_evaluator_specs {
        std::mem::swap(&mut mesh.committed_flags, &mut mesh.update_flags);
    }
    let physics = &mut plan.inline_physics_group;
    std::mem::swap(
        &mut physics.committed_accumulator,
        &mut physics.update_accumulator,
    );
    let committed_valid = physics.validity & PHYSICS_COMMITTED_VALID_FLAG_V1 != 0;
    let update_valid = physics.validity & PHYSICS_UPDATE_VALID_FLAG_V1 != 0;
    physics.validity = if update_valid {
        PHYSICS_COMMITTED_VALID_FLAG_V1
    } else {
        0
    } | if committed_valid {
        PHYSICS_UPDATE_VALID_FLAG_V1
    } else {
        0
    };
    Ok(())
}
