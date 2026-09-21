// Fixed trusted-fault setup only. Never derives an expected result.
use crate::derived_candidate::EvaluationDerivedCandidateV1;
use crate::expected_types::{InjectionExpected, InjectionPhase, InjectionValue};
use crate::model::Category9ReservationPlanV1;

pub(crate) fn plan(plan: &mut Category9ReservationPlanV1, value: InjectionValue) {
    use InjectionValue::*;
    match value {
        PresetParameterSlot { index, value } => {
            plan.parameter_preset_values[index as usize].parameter_slot = value
        }
        PresetValue { index, bits } => {
            plan.parameter_preset_values[index as usize].value.bits = bits
        }
        ControllerInfluence(bits) => plan.inline_ik_controller.influence.bits = bits,
        ControllerTargetY(bits) => plan.inline_ik_controller.target_y.bits = bits,
        BindingPointTarget { index, bits } => {
            plan.binding_points[index as usize].target.bits = bits
        }
        BindingAccumulator { index, bits } => plan.binding_accumulators[index as usize].bits = bits,
        BindingTargetSlot { index, value } => {
            plan.binding_specs[index as usize].target_slot = value
        }
        PendulumAngle { index, bits } => {
            plan.physics_committed_pendulums[index as usize].angle.bits = bits
        }
        PendulumVelocity { index, bits } => {
            plan.physics_committed_pendulums[index as usize]
                .velocity
                .bits = bits
        }
        PhysicsAccumulator(bits) => plan.inline_physics_group.committed_accumulator.bits = bits,
        ParameterCurrent { index, bits } => plan.parameter_current[index as usize].bits = bits,
        ParameterPrevious { index, bits } => plan.parameter_previous[index as usize].bits = bits,
        BonePresence { index, value } => {
            plan.bone_committed_overrides[index as usize].presence_mask = value
        }
        BoneAngle { index, bits } => {
            plan.bone_committed_overrides[index as usize].angle.bits = bits
        }
        BoneY { index, bits } => plan.bone_committed_overrides[index as usize].y.bits = bits,
        SkinBoneSlot { index, value } => plan.skin_weights[index as usize].bone_slot = value,
        WorldPostLogicalLength(length) => {
            assert!(
                length as usize <= plan.world_post.len(),
                "fixed fault only truncates"
            );
            plan.world_post.truncate(length as usize);
        }
        BoneSpecAngle { index, bits } => plan.bone_specs[index as usize].angle.bits = bits,
        DynamicGeneration(_) => panic!("generation fault requires owned candidate"),
        ReservationDenial { .. } => {
            panic!("C9 reservation denial is a separate native prerequisite")
        }
    }
}

pub(crate) fn before_initial(
    plan_value: &mut Category9ReservationPlanV1,
    injections: &[InjectionExpected],
) {
    for injection in injections {
        if injection.phase == InjectionPhase::BeforeInitialC10 {
            plan(plan_value, injection.value);
        }
    }
}

pub(crate) fn before_action(
    candidate: &mut EvaluationDerivedCandidateV1,
    action: u32,
    injections: &[InjectionExpected],
) {
    for injection in injections {
        if injection.phase != InjectionPhase::BeforeAction(action) {
            continue;
        }
        if let InjectionValue::DynamicGeneration(value) = injection.value {
            candidate.test_set_dynamic_generation(value);
        } else {
            plan(&mut candidate.foundation.reservation_plan, injection.value);
        }
    }
}
