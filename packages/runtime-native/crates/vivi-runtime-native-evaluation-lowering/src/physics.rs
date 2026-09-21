//! Allocation-free physics update over an already reserved internal candidate.
//!
//! The caller has copied committed pendulums/accumulator into update scratch and
//! applied bindings. This stage never publishes or changes committed state.
//! On failure, the caller must discard the entire update scratch prefix.

use vivi_runtime_native_evaluation_math::raw::D64;

use crate::model::{
    Category9ReservationPlanV1, D64BitsV1, InlinePhysicsGroupV1, PendulumStateV1, RangeV1,
    StagedValueV1,
};
use crate::observation::{Observer, Operation, OwnerTuple};
use crate::state::{PHYSICS_COMMITTED_VALID_FLAG_V1, PHYSICS_UPDATE_VALID_FLAG_V1};
use crate::{EvaluationLoweringError, EvaluationLoweringErrorKind};

const ZERO: D64 = D64::from_bits(0);
const ONE: D64 = D64::from_bits(0x3ff0_0000_0000_0000);
const HALF: D64 = D64::from_bits(0x3fe0_0000_0000_0000);
const MAX_DELTA: D64 = D64::from_bits(0x3fd0_0000_0000_0000);
const STEP: D64 = D64::from_bits(0x3f81_1111_1111_1111);
const MAX_ACCUMULATOR: D64 = D64::from_bits(0x3fa1_1111_1111_1111);
const PI: D64 = D64::from_bits(0x4009_21fb_5444_2d18);
const TWO_PI: D64 = D64::from_bits(0x4019_21fb_5444_2d18);
const NEGATIVE_TWO_PI: D64 = D64::from_bits(0xc019_21fb_5444_2d18);
const DEGREES_180: D64 = D64::from_bits(0x4066_8000_0000_0000);
const ANGLE_PRESENT: u32 = 1 << 2;

type PhysicsResult<T> = Result<T, EvaluationLoweringError>;

fn internal() -> EvaluationLoweringError {
    EvaluationLoweringError::new(EvaluationLoweringErrorKind::Internal)
}

#[inline]
fn finite(value: D64) -> PhysicsResult<D64> {
    if value.is_finite() {
        Ok(value)
    } else {
        Err(EvaluationLoweringError::new(
            EvaluationLoweringErrorKind::NumericNonFinite,
        ))
    }
}

// Keep each existing raw operation single-shot, with its result observed before
// the same finite check. Input validation below is not an arithmetic node.
macro_rules! observed_binary {
    ($name:ident, $operation:ident) => {
        #[inline]
        fn $name(
            observer: &mut Observer<'_>,
            checkpoint: &'static str,
            owners: OwnerTuple,
            left: D64,
            right: D64,
        ) -> PhysicsResult<D64> {
            let result = left.$name(right);
            observer.record(
                checkpoint,
                Operation::$operation(left.to_bits(), right.to_bits()),
                result.to_bits(),
                owners,
            );
            finite(result)
        }
    };
}

macro_rules! observed_unary {
    ($name:ident, $operation:ident) => {
        #[inline]
        fn $name(
            observer: &mut Observer<'_>,
            checkpoint: &'static str,
            owners: OwnerTuple,
            value: D64,
        ) -> PhysicsResult<D64> {
            let result = value.$name();
            observer.record(
                checkpoint,
                Operation::$operation(value.to_bits()),
                result.to_bits(),
                owners,
            );
            finite(result)
        }
    };
}

observed_binary!(add, Add);
observed_binary!(sub, Sub);
observed_binary!(mul, Mul);
observed_binary!(div, Div);
observed_unary!(sin, Sin);
observed_unary!(cos, Cos);

#[inline]
fn read(value: D64BitsV1) -> PhysicsResult<D64> {
    finite(D64::from_bits(value.bits))
}

#[inline]
fn bits(value: D64) -> D64BitsV1 {
    D64BitsV1 {
        bits: value.to_bits(),
    }
}

fn index(value: u32) -> PhysicsResult<usize> {
    usize::try_from(value).map_err(|_| internal())
}

fn whole_range(range: RangeV1, length: usize) -> PhysicsResult<()> {
    if range.start != 0 || index(range.len)? != length {
        return Err(internal());
    }
    Ok(())
}

// Validate only the physics snapshot and its resolved references. This also
// runs for a zero delta, without evaluating any arithmetic node or output.
fn validate_snapshot(plan: &Category9ReservationPlanV1) -> PhysicsResult<()> {
    let group = plan.inline_physics_group;
    whole_range(group.pendulum_range, plan.physics_pendulum_configs.len())?;
    whole_range(group.input_range, plan.physics_inputs.len())?;
    whole_range(group.output_range, plan.physics_outputs.len())?;
    if plan.physics_update_pendulums.len() != plan.physics_pendulum_configs.len()
        || plan.physics_committed_pendulums.len() != plan.physics_pendulum_configs.len()
        || plan.parameter_update.len() != plan.parameter_specs.len()
        || plan.parameter_previous.len() != plan.parameter_specs.len()
        || plan.bone_update_overrides.len() != plan.bone_specs.len()
    {
        return Err(internal());
    }
    read(group.gravity_direction)?;
    read(group.gravity_strength)?;
    read(group.wind)?;
    if read(group.update_accumulator)?.lt(ZERO) {
        return Err(internal());
    }
    for (config, state) in plan
        .physics_pendulum_configs
        .iter()
        .zip(&plan.physics_update_pendulums)
    {
        read(config.length)?;
        read(config.mass)?;
        read(config.damping)?;
        read(state.angle)?;
        read(state.velocity)?;
    }
    for input in &plan.physics_inputs {
        if input.kind > 2 {
            return Err(internal());
        }
        let slot = index(input.parameter_slot)?;
        read(*plan.parameter_update.get(slot).ok_or_else(internal)?)?;
        read(*plan.parameter_previous.get(slot).ok_or_else(internal)?)?;
        read(input.weight)?;
    }
    for output in &plan.physics_outputs {
        if index(output.pendulum_index)? >= plan.physics_update_pendulums.len() {
            return Err(internal());
        }
        read(output.weight)?;
        let destination = index(output.destination_slot)?;
        let staged = match output.destination_kind {
            0 => {
                let parameter = plan.parameter_specs.get(destination).ok_or_else(internal)?;
                read(parameter.default)?;
                let min = read(parameter.min)?;
                let max = read(parameter.max)?;
                if min.gt(max) {
                    return Err(internal());
                }
                &plan.parameter_staged_destinations
            }
            1 => {
                let bone = plan
                    .bone_update_overrides
                    .get(destination)
                    .ok_or_else(internal)?;
                if bone.presence_mask & ANGLE_PRESENT != 0 {
                    read(bone.angle)?;
                }
                &plan.bone_staged_destinations
            }
            _ => return Err(internal()),
        };
        if staged
            .get(index(output.stage_slot)?)
            .map(|slot| slot.owner_slot)
            != Some(output.destination_slot)
        {
            return Err(internal());
        }
    }
    Ok(())
}

// stage_slot and owner_slot were resolved by category 9 in first-seen order.
// Keep this order and reject missing, reordered or mismatched private links.
fn stage(
    destinations: &mut [StagedValueV1],
    stage_slot: u32,
    owner_slot: u32,
    value: D64,
    seen: &mut usize,
) -> PhysicsResult<()> {
    let slot = index(stage_slot)?;
    let destination = destinations.get_mut(slot).ok_or_else(internal)?;
    if destination.owner_slot != owner_slot {
        return Err(internal());
    }
    match destination.valid {
        0 => {
            if slot != *seen {
                return Err(internal());
            }
            *seen = seen.checked_add(1).ok_or_else(internal)?;
        }
        1 => {}
        _ => return Err(internal()),
    }
    destination.value = bits(value);
    destination.valid = 1;
    Ok(())
}

/// Advances the one enabled physics group in update scratch only.
///
/// Public argument/status handling belongs to the caller. This private boundary
/// still rejects nonfinite/negative deltas and caps a positive delta to a quarter.
/// Both signs of zero validate the snapshot and mark it update-valid without
/// advancing state or evaluating physics inputs, substeps, or outputs.
pub(crate) fn step_physics(
    plan: &mut Category9ReservationPlanV1,
    delta_bits: u64,
    observer: &mut Observer<'_>,
) -> PhysicsResult<()> {
    let delta = finite(D64::from_bits(delta_bits))?;
    if delta.lt(ZERO) {
        return Err(internal());
    }
    let effective_delta = if delta.gt(MAX_DELTA) {
        MAX_DELTA
    } else {
        delta
    };

    let group = plan.inline_physics_group;
    match group.present {
        0 => {
            if group != InlinePhysicsGroupV1::ABSENT
                || !plan.physics_pendulum_configs.is_empty()
                || !plan.physics_update_pendulums.is_empty()
                || !plan.physics_committed_pendulums.is_empty()
                || !plan.physics_inputs.is_empty()
                || !plan.physics_outputs.is_empty()
                || !plan.parameter_staged_destinations.is_empty()
                || !plan.bone_staged_destinations.is_empty()
            {
                return Err(internal());
            }
            return Ok(());
        }
        1 => {}
        _ => return Err(internal()),
    }
    if group.validity & !(PHYSICS_COMMITTED_VALID_FLAG_V1 | PHYSICS_UPDATE_VALID_FLAG_V1) != 0 {
        return Err(internal());
    }
    plan.inline_physics_group.validity &= !PHYSICS_UPDATE_VALID_FLAG_V1;
    validate_snapshot(plan)?;
    if !delta.gt(ZERO) {
        plan.inline_physics_group.validity |= PHYSICS_UPDATE_VALID_FLAG_V1;
        return Ok(());
    }
    let mut accumulator = read(group.update_accumulator)?;
    let group_index = u64::from(group.group_index);
    // All input reads precede every output write, preserving the update-start
    // current/previous parameter pair even for an input/output destination.
    let mut force = [ZERO; 2];
    for (input_index, input) in plan.physics_inputs.iter().enumerate() {
        let input_owner = OwnerTuple::PhysicsInput([group_index, input_index as u64]);
        let parameter = index(input.parameter_slot)?;
        let current = read(*plan.parameter_update.get(parameter).ok_or_else(internal)?)?;
        let previous = read(
            *plan
                .parameter_previous
                .get(parameter)
                .ok_or_else(internal)?,
        )?;
        let weight = read(input.weight)?;
        let axis = match input.kind {
            0 | 2 => 0,
            1 => 1,
            _ => return Err(internal()),
        };
        let delta = sub(
            observer,
            "physics.input.delta",
            input_owner,
            current,
            previous,
        )?;
        let weighted = mul(
            observer,
            "physics.input.weighted",
            input_owner,
            delta,
            weight,
        )?;
        force[axis] = add(
            observer,
            "physics.input.accum",
            OwnerTuple::PhysicsInputAxis([group_index, input_index as u64, axis as u64]),
            force[axis],
            weighted,
        )?;
    }
    accumulator = add(
        observer,
        "physics.accumulator.add-delta",
        OwnerTuple::PhysicsGroup(group_index),
        accumulator,
        effective_delta,
    )?;

    let mut substeps = 0;
    // The integer bound is checked first: there is no fifth readiness test.
    while substeps < 4 {
        if !accumulator.ge(STEP) {
            break;
        }
        let substep_owner = OwnerTuple::PhysicsSubstep([group_index, substeps as u64]);
        let direction = read(group.gravity_direction)?;
        let strength = read(group.gravity_strength)?;
        let g0 = mul(
            observer,
            "physics.gravity.direction-times-pi",
            substep_owner,
            direction,
            PI,
        )?;
        let radians = div(
            observer,
            "physics.gravity.to-radians",
            substep_owner,
            g0,
            DEGREES_180,
        )?;
        let sine = sin(observer, "physics.gravity.sin", substep_owner, radians)?;
        let cosine = cos(observer, "physics.gravity.cos", substep_owner, radians)?;
        let gravity_x = mul(observer, "physics.gravity.x", substep_owner, sine, strength)?;
        let gravity_y = mul(
            observer,
            "physics.gravity.y",
            substep_owner,
            cosine,
            strength,
        )?;

        for pendulum_index in 0..plan.physics_pendulum_configs.len() {
            let pendulum_owner =
                OwnerTuple::PhysicsPendulum([group_index, substeps as u64, pendulum_index as u64]);
            let definition = plan.physics_pendulum_configs[pendulum_index];
            let old = plan.physics_update_pendulums[pendulum_index];
            let old_angle = read(old.angle)?;
            let old_velocity = read(old.velocity)?;
            let length = read(definition.length)?;
            let mass = read(definition.mass)?;
            let damping = read(definition.damping)?;

            let arm_x = sin(
                observer,
                "physics.pendulum.arm-x",
                pendulum_owner,
                old_angle,
            )?;
            let arm_y = cos(
                observer,
                "physics.pendulum.arm-y",
                pendulum_owner,
                old_angle,
            )?;
            let mut force_x = add(
                observer,
                "physics.pendulum.wind",
                pendulum_owner,
                gravity_x,
                read(group.wind)?,
            )?;
            let mut force_y = gravity_y;
            if pendulum_index == 0 {
                force_x = add(
                    observer,
                    "physics.pendulum.input-x",
                    pendulum_owner,
                    force_x,
                    force[0],
                )?;
                force_y = add(
                    observer,
                    "physics.pendulum.input-y",
                    pendulum_owner,
                    force_y,
                    force[1],
                )?;
            } else {
                // The previous row has already been integrated and clamped.
                let parent_velocity =
                    read(plan.physics_update_pendulums[pendulum_index - 1].velocity)?;
                let p0 = mul(
                    observer,
                    "physics.pendulum.parent-length",
                    pendulum_owner,
                    parent_velocity,
                    length,
                )?;
                let propagation = mul(
                    observer,
                    "physics.pendulum.parent-propagation",
                    pendulum_owner,
                    p0,
                    HALF,
                )?;
                force_x = add(
                    observer,
                    "physics.pendulum.parent-force",
                    pendulum_owner,
                    force_x,
                    propagation,
                )?;
            }
            let t0 = mul(
                observer,
                "physics.pendulum.torque-x",
                pendulum_owner,
                force_x,
                arm_y,
            )?;
            let t1 = mul(
                observer,
                "physics.pendulum.torque-y",
                pendulum_owner,
                force_y,
                arm_x,
            )?;
            let torque = sub(observer, "physics.pendulum.torque", pendulum_owner, t0, t1)?;
            // Check this product before selecting the division/fallback branch.
            let mass_length = mul(
                observer,
                "physics.pendulum.mass-length",
                pendulum_owner,
                mass,
                length,
            )?;
            let acceleration = if mass_length.gt(ZERO) {
                div(
                    observer,
                    "physics.pendulum.acceleration",
                    pendulum_owner,
                    torque,
                    mass_length,
                )?
            } else {
                ZERO
            };
            let delta_velocity = mul(
                observer,
                "physics.pendulum.delta-velocity",
                pendulum_owner,
                acceleration,
                STEP,
            )?;
            let before_damping = add(
                observer,
                "physics.pendulum.velocity-before-damping",
                pendulum_owner,
                old_velocity,
                delta_velocity,
            )?;
            let retention = sub(
                observer,
                "physics.pendulum.retention",
                pendulum_owner,
                ONE,
                damping,
            )?;
            let mut velocity = mul(
                observer,
                "physics.pendulum.velocity",
                pendulum_owner,
                before_damping,
                retention,
            )?;
            let delta_angle = mul(
                observer,
                "physics.pendulum.delta-angle",
                pendulum_owner,
                velocity,
                STEP,
            )?;
            let mut angle = add(
                observer,
                "physics.pendulum.angle",
                pendulum_owner,
                old_angle,
                delta_angle,
            )?;
            if angle.lt(NEGATIVE_TWO_PI) {
                angle = NEGATIVE_TWO_PI;
                velocity = ZERO;
            } else if angle.gt(TWO_PI) {
                angle = TWO_PI;
                velocity = ZERO;
            }
            plan.physics_update_pendulums[pendulum_index] = PendulumStateV1 {
                angle: bits(angle),
                velocity: bits(velocity),
            };
        }
        accumulator = sub(
            observer,
            "physics.accumulator.subtract-step",
            substep_owner,
            accumulator,
            STEP,
        )?;
        substeps += 1;
    }
    if accumulator.gt(MAX_ACCUMULATOR) {
        accumulator = ZERO;
    }
    plan.inline_physics_group.update_accumulator = bits(accumulator);

    for destination in &mut plan.parameter_staged_destinations {
        destination.valid = 0;
        destination.value = D64BitsV1::POSITIVE_ZERO;
    }
    for destination in &mut plan.bone_staged_destinations {
        destination.valid = 0;
        destination.value = D64BitsV1::POSITIVE_ZERO;
    }
    let mut parameter_seen = 0;
    let mut bone_seen = 0;
    for (output_index, output) in plan.physics_outputs.iter().enumerate() {
        let output_owner = OwnerTuple::PhysicsOutput([group_index, output_index as u64]);
        let pendulum = plan
            .physics_update_pendulums
            .get(index(output.pendulum_index)?)
            .ok_or_else(internal)?;
        let raw = mul(
            observer,
            "physics.output.raw",
            output_owner,
            read(pendulum.angle)?,
            read(output.weight)?,
        )?;
        match output.destination_kind {
            0 => {
                let parameter = plan
                    .parameter_specs
                    .get(index(output.destination_slot)?)
                    .ok_or_else(internal)?;
                let default = read(parameter.default)?;
                let min = read(parameter.min)?;
                let max = read(parameter.max)?;
                if min.gt(max) {
                    return Err(internal());
                }
                let with_default = add(
                    observer,
                    "physics.output.default",
                    output_owner,
                    raw,
                    default,
                )?;
                let value = if with_default.lt(min) {
                    min
                } else if with_default.gt(max) {
                    max
                } else {
                    with_default
                };
                stage(
                    &mut plan.parameter_staged_destinations,
                    output.stage_slot,
                    output.destination_slot,
                    value,
                    &mut parameter_seen,
                )?;
            }
            1 => {
                if index(output.destination_slot)? >= plan.bone_update_overrides.len() {
                    return Err(internal());
                }
                stage(
                    &mut plan.bone_staged_destinations,
                    output.stage_slot,
                    output.destination_slot,
                    raw,
                    &mut bone_seen,
                )?;
            }
            _ => return Err(internal()),
        }
    }
    if parameter_seen != plan.parameter_staged_destinations.len()
        || bone_seen != plan.bone_staged_destinations.len()
    {
        return Err(internal());
    }

    // Every output's raw/default arithmetic, even overwritten outputs, has
    // succeeded before either destination phase. These are scratch writes.
    for destination in &plan.parameter_staged_destinations {
        if destination.valid != 1 {
            return Err(internal());
        }
        *plan
            .parameter_update
            .get_mut(index(destination.owner_slot)?)
            .ok_or_else(internal)? = destination.value;
    }
    for (destination_slot, destination) in plan.bone_staged_destinations.iter().enumerate() {
        if destination.valid != 1 {
            return Err(internal());
        }
        let bone = plan
            .bone_update_overrides
            .get_mut(index(destination.owner_slot)?)
            .ok_or_else(internal)?;
        let current = if bone.presence_mask & ANGLE_PRESENT != 0 {
            read(bone.angle)?
        } else {
            ZERO
        };
        let angle = add(
            observer,
            "physics.output.bone-commit",
            OwnerTuple::PhysicsDestination([group_index, destination_slot as u64]),
            current,
            read(destination.value)?,
        )?;
        bone.angle = bits(angle);
        bone.presence_mask |= ANGLE_PRESENT;
    }
    plan.inline_physics_group.validity |= PHYSICS_UPDATE_VALID_FLAG_V1;
    Ok(())
}
