//! Allocation-free category-10 evaluation over category-9 typed storage.
//! Arithmetic is delegated one node at a time to the reviewed raw-D64 facade.
//! This module writes scratch/update fields only; publication belongs to its caller.

use vivi_runtime_native_evaluation_math::raw::D64;

use crate::error::{EvaluationLoweringError, EvaluationLoweringErrorKind};
use crate::lower::project_binary64_to_binary32;
use crate::model::*;
use crate::observation::{Observer, Operation, OwnerTuple};
use crate::state::{
    DERIVED_CULLED_FLAG_V1, DERIVED_VALID_FLAG_V1, DERIVED_VISIBLE_FLAG_V1,
    PHYSICS_UPDATE_VALID_FLAG_V1,
};

type ResultV1<T> = Result<T, EvaluationLoweringError>;

const ZERO: D64 = D64::from_bits(0);
const ONE: D64 = D64::from_bits(0x3ff0_0000_0000_0000);
const TWO: D64 = D64::from_bits(0x4000_0000_0000_0000);
const HALF: D64 = D64::from_bits(0x3fe0_0000_0000_0000);
const PI: D64 = D64::from_bits(0x4009_21fb_5444_2d18);
const TWO_PI: D64 = D64::from_bits(0x4019_21fb_5444_2d18);
const EPSILON: D64 = D64::from_bits(0x3d71_9799_812d_ea11);

fn internal() -> EvaluationLoweringError {
    EvaluationLoweringError::new(EvaluationLoweringErrorKind::Internal)
}

fn d(value: D64BitsV1) -> D64 {
    D64::from_bits(value.bits)
}

fn bits(value: D64) -> D64BitsV1 {
    D64BitsV1 {
        bits: value.to_bits(),
    }
}

fn checked(value: D64) -> ResultV1<D64> {
    if value.is_finite() {
        Ok(value)
    } else {
        Err(EvaluationLoweringError::new(
            EvaluationLoweringErrorKind::NumericNonFinite,
        ))
    }
}

// Numeric operands are evaluated before the observer borrow, including nested nodes.
macro_rules! observed_binary {
    ($name:ident, $operation:ident) => {
        #[inline]
        fn $name(
            left: D64,
            right: D64,
            checkpoint: &'static str,
            owners: OwnerTuple,
            observer: &mut Observer<'_>,
        ) -> ResultV1<D64> {
            let result = left.$name(right);
            observer.record(
                checkpoint,
                Operation::$operation(left.to_bits(), right.to_bits()),
                result.to_bits(),
                owners,
            );
            checked(result)
        }
    };
}
macro_rules! observed_unary {
    ($name:ident, $operation:ident) => {
        #[inline]
        fn $name(
            value: D64,
            checkpoint: &'static str,
            owners: OwnerTuple,
            observer: &mut Observer<'_>,
        ) -> ResultV1<D64> {
            let result = value.$name();
            observer.record(
                checkpoint,
                Operation::$operation(value.to_bits()),
                result.to_bits(),
                owners,
            );
            checked(result)
        }
    };
}
observed_binary!(add, Add);
observed_binary!(sub, Sub);
observed_binary!(mul, Mul);
observed_binary!(div, Div);
observed_binary!(c_fmod, CFmod);
observed_binary!(atan2, Atan2);
observed_unary!(sin, Sin);
observed_unary!(cos, Cos);
observed_unary!(sqrt, Sqrt);
observed_unary!(acos, Acos);

const NORMALIZE_TWO_BONE: [&str; 3] = [
    "ik.normalize.two-bone-world-constraint.remainder",
    "ik.normalize.two-bone-world-constraint.subtract-two-pi",
    "ik.normalize.two-bone-world-constraint.add-two-pi",
];
const NORMALIZE_CCD_DELTA: [&str; 3] = [
    "ik.normalize.ccd-delta.remainder",
    "ik.normalize.ccd-delta.subtract-two-pi",
    "ik.normalize.ccd-delta.add-two-pi",
];
const NORMALIZE_CCD_CONSTRAINT: [&str; 3] = [
    "ik.normalize.ccd-candidate-constraint.remainder",
    "ik.normalize.ccd-candidate-constraint.subtract-two-pi",
    "ik.normalize.ccd-candidate-constraint.add-two-pi",
];
const NORMALIZE_COMMIT_WORLD: [&str; 3] = [
    "ik.normalize.commit-world-to-local.remainder",
    "ik.normalize.commit-world-to-local.subtract-two-pi",
    "ik.normalize.commit-world-to-local.add-two-pi",
];
const NORMALIZE_COMMIT_LOCAL: [&str; 3] = [
    "ik.normalize.commit-local-constraint.remainder",
    "ik.normalize.commit-local-constraint.subtract-two-pi",
    "ik.normalize.commit-local-constraint.add-two-pi",
];
const DISTANCE_TWO_BONE: [&str; 4] = [
    "ik.two-bone.dx-square",
    "ik.two-bone.dy-square",
    "ik.two-bone.distance-square",
    "ik.two-bone.distance",
];
const DISTANCE_CCD: [&str; 4] = [
    "ik.ccd.distance-x-square",
    "ik.ccd.distance-y-square",
    "ik.ccd.distance-square",
    "ik.ccd.distance",
];

#[derive(Clone, Copy)]
enum AffineContext {
    World([u64; 2]),
    Skin([u64; 3]),
}
impl AffineContext {
    fn checkpoints(self) -> [&'static str; 4] {
        match self {
            Self::World(_) => [
                "world.affine.left-product",
                "world.affine.right-product",
                "world.affine.pair-sum",
                "world.affine.translation-sum",
            ],
            Self::Skin(_) => [
                "skin.affine.left-product",
                "skin.affine.right-product",
                "skin.affine.pair-sum",
                "skin.affine.translation-sum",
            ],
        }
    }
    fn cell(self, cell: u64) -> OwnerTuple {
        match self {
            Self::World([world_pass, bone_dfs_index]) => {
                OwnerTuple::WorldCell([world_pass, bone_dfs_index, cell])
            }
            Self::Skin([mesh_slot, vertex_index, weight_index]) => {
                OwnerTuple::SkinCell([mesh_slot, vertex_index, weight_index, cell])
            }
        }
    }
}

fn clamp(value: D64, min: D64, max: D64) -> D64 {
    if value.lt(min) {
        min
    } else if value.gt(max) {
        max
    } else {
        value
    }
}

fn normalize(
    value: D64,
    checkpoints: [&'static str; 3],
    owners: OwnerTuple,
    observer: &mut Observer<'_>,
) -> ResultV1<D64> {
    let mut q = c_fmod(value, TWO_PI, checkpoints[0], owners, observer)?;
    if q.ge(PI) {
        q = sub(q, TWO_PI, checkpoints[1], owners, observer)?;
    }
    if q.lt(PI.neg()) {
        q = add(q, TWO_PI, checkpoints[2], owners, observer)?;
    }
    Ok(q)
}

fn constraint(
    value: D64,
    spec: IkConstraintV1,
    checkpoints: [&'static str; 3],
    owners: OwnerTuple,
    observer: &mut Observer<'_>,
) -> ResultV1<D64> {
    Ok(clamp(
        normalize(value, checkpoints, owners, observer)?,
        d(spec.min),
        d(spec.max),
    ))
}

fn at<T>(values: &[T], index: usize) -> ResultV1<&T> {
    values.get(index).ok_or_else(internal)
}

fn at_mut<T>(values: &mut [T], index: usize) -> ResultV1<&mut T> {
    values.get_mut(index).ok_or_else(internal)
}

fn slot(value: u32) -> ResultV1<usize> {
    usize::try_from(value).map_err(|_| internal())
}

fn range<T>(values: &[T], value: RangeV1) -> ResultV1<&[T]> {
    let start = slot(value.start)?;
    let end = start.checked_add(slot(value.len)?).ok_or_else(internal)?;
    values.get(start..end).ok_or_else(internal)
}

fn finite(values: &[D64BitsV1]) -> ResultV1<()> {
    if values.iter().all(|value| d(*value).is_finite()) {
        Ok(())
    } else {
        Err(internal())
    }
}

fn same_len(left: usize, right: usize) -> ResultV1<()> {
    if left == right {
        Ok(())
    } else {
        Err(internal())
    }
}

// Only accepted category-8/10 D32 values enter this exact widening operation.
// This is representation conversion, with no host arithmetic or new rounding.
fn widen(value: D32BitsV1) -> ResultV1<D64> {
    if value.bits == 0 {
        return Ok(ZERO);
    }
    let exponent = (value.bits >> 23) & 0xff;
    if exponent == 0 || exponent == 0xff {
        return Err(internal());
    }
    let sign = u64::from(value.bits & 0x8000_0000) << 32;
    let exponent64 = u64::from(exponent) + (1023 - 127);
    let fraction = u64::from(value.bits & 0x007f_ffff) << 29;
    Ok(D64::from_bits(sign | (exponent64 << 52) | fraction))
}

// Category 9 already verifies typed domains and exact capacity/count formulas.
// These allocation-free checks defend every reference before numeric work,
// including rows that would otherwise be skipped for a missing bind inverse.
fn preflight(plan: &Category9ReservationPlanV1) -> ResultV1<()> {
    let bones = plan.bone_specs.len();
    same_len(plan.parameter_specs.len(), plan.parameter_current.len())?;
    same_len(plan.parameter_specs.len(), plan.parameter_update.len())?;
    same_len(plan.parameter_specs.len(), plan.parameter_previous.len())?;
    same_len(plan.binding_targets.len(), plan.binding_accumulators.len())?;
    same_len(bones, plan.bone_update_overrides.len())?;
    same_len(bones, plan.bone_committed_overrides.len())?;
    same_len(bones, plan.bone_world_order_slots.len())?;
    same_len(bones, plan.world_post.len())?;
    same_len(
        plan.direct_mesh_records.len(),
        plan.mesh_evaluator_specs.len(),
    )?;
    same_len(
        plan.skin_rest_coordinates.len(),
        plan.skin_skinned_scratch.len(),
    )?;
    same_len(
        plan.skin_rest_coordinates.len(),
        plan.derived_update_coordinates.len(),
    )?;
    same_len(
        plan.skin_rest_coordinates.len(),
        plan.derived_committed_coordinates.len(),
    )?;
    finite(&plan.parameter_current)?;
    for spec in &plan.parameter_specs {
        finite(&[spec.min, spec.max, spec.default])?;
    }
    for (index, spec) in plan.bone_specs.iter().enumerate() {
        if slot(spec.bone_slot)? != index {
            return Err(internal());
        }
        finite(&[
            spec.x,
            spec.y,
            spec.angle,
            spec.length,
            spec.scale_x,
            spec.scale_y,
        ])?;
        if spec.parent_slot != NONE_SLOT_V1 {
            at(&plan.bone_specs, slot(spec.parent_slot)?)?;
        }
    }
    for (ordinal, entry) in plan.bone_world_order_slots.iter().enumerate() {
        let spec = at(&plan.bone_specs, slot(entry.value)?)?;
        if plan
            .bone_world_order_slots
            .iter()
            .take(ordinal)
            .any(|prior| prior.value == entry.value)
        {
            return Err(internal());
        }
        if spec.parent_slot != NONE_SLOT_V1
            && !plan
                .bone_world_order_slots
                .iter()
                .take(ordinal)
                .any(|prior| prior.value == spec.parent_slot)
        {
            return Err(internal());
        }
    }
    for target in &plan.binding_targets {
        finite(&[target.default])?;
        match (target.kind, target.property) {
            (0, 0..=4) => {
                at(&plan.bone_specs, slot(target.owner_slot)?)?;
            }
            (1, 5..=9)
                if plan.inline_ik_controller.present == 1
                    && target.owner_slot == plan.inline_ik_controller.controller_index => {}
            _ => return Err(internal()),
        }
    }
    for binding in &plan.binding_specs {
        at(&plan.parameter_current, slot(binding.parameter_slot)?)?;
        at(&plan.binding_targets, slot(binding.target_slot)?)?;
        for point in range(&plan.binding_points, binding.point_range)? {
            finite(&[point.parameter, point.target])?;
        }
    }
    let controller = plan.inline_ik_controller;
    if controller.present > 1 || controller.presence_flags & !3 != 0 {
        return Err(internal());
    }
    same_len(
        plan.world_pre.len(),
        if controller.present == 1 { bones } else { 0 },
    )?;
    same_len(plan.ik_scratch.len(), plan.ik_constraints.len())?;
    if controller.present == 1 {
        if controller.solver > 1
            || !(1..=1024).contains(&controller.max_iterations)
            || controller.constraint_range.start != 0
            || slot(controller.constraint_range.len)? != plan.ik_constraints.len()
        {
            return Err(internal());
        }
        finite(&[
            controller.target_x,
            controller.target_y,
            controller.pole_x,
            controller.pole_y,
            controller.influence,
        ])?;
    } else if !plan.ik_constraints.is_empty() {
        return Err(internal());
    }
    for (index, spec) in plan.ik_constraints.iter().enumerate() {
        at(&plan.bone_specs, slot(spec.bone_slot)?)?;
        finite(&[spec.min, spec.max])?;
        if plan
            .ik_constraints
            .iter()
            .take(index)
            .any(|prior| prior.bone_slot == spec.bone_slot)
        {
            return Err(internal());
        }
    }
    let group = plan.inline_physics_group;
    if group.present > 1 {
        return Err(internal());
    }
    same_len(
        plan.physics_pendulum_configs.len(),
        plan.physics_update_pendulums.len(),
    )?;
    same_len(
        plan.physics_pendulum_configs.len(),
        plan.physics_committed_pendulums.len(),
    )?;
    range(&plan.physics_pendulum_configs, group.pendulum_range)?;
    range(&plan.physics_inputs, group.input_range)?;
    range(&plan.physics_outputs, group.output_range)?;
    finite(&[group.gravity_direction, group.gravity_strength, group.wind])?;
    for config in &plan.physics_pendulum_configs {
        finite(&[config.length, config.mass, config.damping])?;
    }
    for input in &plan.physics_inputs {
        at(&plan.parameter_current, slot(input.parameter_slot)?)?;
        finite(&[input.weight])?;
        if input.kind > 2 {
            return Err(internal());
        }
    }
    for output in &plan.physics_outputs {
        at(&plan.physics_pendulum_configs, slot(output.pendulum_index)?)?;
        finite(&[output.weight])?;
        let staged = match output.destination_kind {
            0 => {
                at(&plan.parameter_specs, slot(output.destination_slot)?)?;
                at(
                    &plan.parameter_staged_destinations,
                    slot(output.stage_slot)?,
                )?
            }
            1 => {
                at(&plan.bone_specs, slot(output.destination_slot)?)?;
                at(&plan.bone_staged_destinations, slot(output.stage_slot)?)?
            }
            _ => return Err(internal()),
        };
        if staged.owner_slot != output.destination_slot {
            return Err(internal());
        }
    }
    for (index, mesh) in plan.mesh_evaluator_specs.iter().enumerate() {
        if slot(mesh.mesh_slot)? != index || mesh.static_flags & !7 != 0 {
            return Err(internal());
        }
        let direct = at(&plan.direct_mesh_records, index)?;
        if direct.mesh_slot != mesh.mesh_slot {
            return Err(internal());
        }
        if mesh.static_flags & 1 == 0 {
            if mesh.skin_slot != NONE_SLOT_V1 || mesh.derived_range.len != 0 {
                return Err(internal());
            }
            let vertices = range(&plan.direct_unskinned_vertices, direct.vertex_range)?;
            if vertices.len() % 2 != 0 {
                return Err(internal());
            }
            for value in vertices {
                widen(*value)?;
            }
            widen(direct.x)?;
            widen(direct.y)?;
        } else {
            let skin = at(&plan.skin_mesh_specs, slot(mesh.skin_slot)?)?;
            if skin.mesh_slot != mesh.mesh_slot || skin.derived_range != mesh.derived_range {
                return Err(internal());
            }
        }
    }
    for skin in &plan.skin_mesh_specs {
        at(&plan.mesh_evaluator_specs, slot(skin.mesh_slot)?)?;
        let rest = range(&plan.skin_rest_coordinates, skin.rest_range)?;
        let rows = range(&plan.skin_weight_rows, skin.weight_row_range)?;
        let matrices = range(&plan.skin_bind_inverses, skin.bind_inverse_range)?;
        let output = range(&plan.derived_update_coordinates, skin.derived_range)?;
        range(&plan.skin_skinned_scratch, skin.derived_range)?;
        if rows.len().checked_mul(2) != Some(rest.len()) || output.len() != rest.len() {
            return Err(internal());
        }
        finite(rest)?;
        for matrix in matrices {
            at(&plan.bone_specs, slot(matrix.bone_slot)?)?;
            finite(&matrix.matrix)?;
        }
        for row in rows {
            let weights = range(&plan.skin_weights, row.weights)?;
            if weights.is_empty() {
                return Err(internal());
            }
            for weight in weights {
                at(&plan.bone_specs, slot(weight.bone_slot)?)?;
                finite(&[weight.weight])?;
                let magnitude = weight.weight.bits & 0x7fff_ffff_ffff_ffff;
                if magnitude > ONE.to_bits() || (weight.weight.bits >> 63 != 0 && magnitude != 0) {
                    return Err(internal());
                }
            }
        }
    }
    Ok(())
}

fn assign_bone(row: &mut BoneOverrideV1, property: u32, value: D64) -> ResultV1<()> {
    let value = bits(value);
    match property {
        0 => row.x = value,
        1 => row.y = value,
        2 => row.angle = value,
        3 => row.scale_x = value,
        4 => row.scale_y = value,
        _ => return Err(internal()),
    }
    row.presence_mask |= 1 << property;
    Ok(())
}

fn effective(spec: BoneSpecV1, row: BoneOverrideV1, property: u32) -> ResultV1<D64> {
    let present = row.presence_mask & (1 << property) != 0;
    Ok(d(match property {
        0 => {
            if present {
                row.x
            } else {
                spec.x
            }
        }
        1 => {
            if present {
                row.y
            } else {
                spec.y
            }
        }
        2 => {
            if present {
                row.angle
            } else {
                spec.angle
            }
        }
        3 => {
            if present {
                row.scale_x
            } else {
                spec.scale_x
            }
        }
        4 => {
            if present {
                row.scale_y
            } else {
                spec.scale_y
            }
        }
        _ => return Err(internal()),
    }))
}

fn select_binding(
    p: D64,
    points: &[BindingPointV1],
    default: D64,
    binding_index: u64,
    observer: &mut Observer<'_>,
) -> ResultV1<D64> {
    let Some(first) = points.first() else {
        return Ok(default);
    };
    if points.len() == 1 || p.le(d(first.parameter)) {
        return Ok(d(first.target));
    }
    let last = points.last().ok_or_else(internal)?;
    if p.ge(d(last.parameter)) {
        return Ok(d(last.target));
    }
    for (point_index, pair) in points.windows(2).enumerate() {
        let a = at(pair, 0)?;
        let b = at(pair, 1)?;
        if p.ge(d(a.parameter)) && p.le(d(b.parameter)) {
            let owners = OwnerTuple::BindingPoint([binding_index, point_index as u64]);
            let num = sub(p, d(a.parameter), "bind.interp.num", owners, observer)?;
            let den = sub(
                d(b.parameter),
                d(a.parameter),
                "bind.interp.den",
                owners,
                observer,
            )?;
            let t = div(num, den, "bind.interp.t", owners, observer)?;
            let span = sub(
                d(b.target),
                d(a.target),
                "bind.interp.span",
                owners,
                observer,
            )?;
            let scaled = mul(span, t, "bind.interp.scaled", owners, observer)?;
            return add(d(a.target), scaled, "bind.interp.value", owners, observer);
        }
    }
    Ok(default)
}

fn bindings(
    plan: &mut Category9ReservationPlanV1,
    controller: &mut InlineIkControllerV1,
    observer: &mut Observer<'_>,
) -> ResultV1<()> {
    plan.binding_accumulators.fill(D64BitsV1::POSITIVE_ZERO);
    for (binding_index, binding) in plan.binding_specs.iter().enumerate() {
        let owners =
            OwnerTuple::BindingTarget([binding_index as u64, u64::from(binding.target_slot)]);
        let target = at(&plan.binding_targets, slot(binding.target_slot)?)?;
        let p = d(*at(&plan.parameter_current, slot(binding.parameter_slot)?)?);
        let value = select_binding(
            p,
            range(&plan.binding_points, binding.point_range)?,
            d(target.default),
            binding_index as u64,
            observer,
        )?;
        let delta = sub(value, d(target.default), "bind.delta", owners, observer)?;
        let accumulator = at_mut(&mut plan.binding_accumulators, slot(binding.target_slot)?)?;
        *accumulator = bits(add(d(*accumulator), delta, "bind.accum", owners, observer)?);
    }
    for (index, target) in plan.binding_targets.iter().enumerate() {
        let value = add(
            d(target.default),
            d(*at(&plan.binding_accumulators, index)?),
            "bind.final",
            OwnerTuple::Target(index as u64),
            observer,
        )?;
        match target.kind {
            0 => assign_bone(
                at_mut(&mut plan.bone_update_overrides, slot(target.owner_slot)?)?,
                target.property,
                value,
            )?,
            1 => match target.property {
                5 => controller.target_x = bits(value),
                6 => controller.target_y = bits(value),
                7 => {
                    controller.pole_x = bits(value);
                    controller.presence_flags |= 1;
                }
                8 => {
                    controller.pole_y = bits(value);
                    controller.presence_flags |= 2;
                }
                9 => controller.influence = bits(value),
                _ => return Err(internal()),
            },
            _ => return Err(internal()),
        }
    }
    if controller.present == 1 {
        controller.influence = bits(clamp(d(controller.influence), ZERO, ONE));
    }
    Ok(())
}

fn affine(
    parent: AffineV1,
    child: AffineV1,
    context: AffineContext,
    observer: &mut Observer<'_>,
) -> ResultV1<AffineV1> {
    let checkpoints = context.checkpoints();
    let [p0, p1, p2, p3, p4, p5] = parent.cells.map(d);
    let [c0, c1, c2, c3, c4, c5] = child.cells.map(d);
    let l0 = mul(p0, c0, checkpoints[0], context.cell(0), observer)?;
    let r0 = mul(p2, c1, checkpoints[1], context.cell(0), observer)?;
    let o0 = add(l0, r0, checkpoints[2], context.cell(0), observer)?;
    let l1 = mul(p1, c0, checkpoints[0], context.cell(1), observer)?;
    let r1 = mul(p3, c1, checkpoints[1], context.cell(1), observer)?;
    let o1 = add(l1, r1, checkpoints[2], context.cell(1), observer)?;
    let l2 = mul(p0, c2, checkpoints[0], context.cell(2), observer)?;
    let r2 = mul(p2, c3, checkpoints[1], context.cell(2), observer)?;
    let o2 = add(l2, r2, checkpoints[2], context.cell(2), observer)?;
    let l3 = mul(p1, c2, checkpoints[0], context.cell(3), observer)?;
    let r3 = mul(p3, c3, checkpoints[1], context.cell(3), observer)?;
    let o3 = add(l3, r3, checkpoints[2], context.cell(3), observer)?;
    let l4 = mul(p0, c4, checkpoints[0], context.cell(4), observer)?;
    let r4 = mul(p2, c5, checkpoints[1], context.cell(4), observer)?;
    let pair4 = add(l4, r4, checkpoints[2], context.cell(4), observer)?;
    let o4 = add(pair4, p4, checkpoints[3], context.cell(4), observer)?;
    let l5 = mul(p1, c4, checkpoints[0], context.cell(5), observer)?;
    let r5 = mul(p3, c5, checkpoints[1], context.cell(5), observer)?;
    let pair5 = add(l5, r5, checkpoints[2], context.cell(5), observer)?;
    let o5 = add(pair5, p5, checkpoints[3], context.cell(5), observer)?;
    Ok(AffineV1 {
        cells: [o0, o1, o2, o3, o4, o5].map(bits),
    })
}

// The frozen affine-association witness is deliberately a helper-only context,
// not a claim that these cells are reachable from a public bone payload.
#[cfg(test)]
#[allow(
    dead_code,
    reason = "Called by the separate same-source C10 conformance harness"
)]
pub(crate) fn test_world_affine(
    parent: [u64; 6],
    child: [u64; 6],
    owners: [u64; 2],
    observer: &mut Observer<'_>,
) -> ResultV1<[u64; 6]> {
    affine(
        AffineV1 {
            cells: parent.map(|bits| D64BitsV1 { bits }),
        },
        AffineV1 {
            cells: child.map(|bits| D64BitsV1 { bits }),
        },
        AffineContext::World(owners),
        observer,
    )
    .map(|value| value.cells.map(|cell| cell.bits))
}

fn worlds(
    specs: &[BoneSpecV1],
    overrides: &[BoneOverrideV1],
    order: &[SlotV1],
    output: &mut [AffineV1],
    world_pass: u64,
    observer: &mut Observer<'_>,
) -> ResultV1<()> {
    for (bone_dfs_index, entry) in order.iter().enumerate() {
        let owners = OwnerTuple::WorldBone([world_pass, bone_dfs_index as u64]);
        let index = slot(entry.value)?;
        let spec = *at(specs, index)?;
        let row = *at(overrides, index)?;
        let angle = effective(spec, row, 2)?;
        let scale_x = effective(spec, row, 3)?;
        let scale_y = effective(spec, row, 4)?;
        let c = cos(angle, "world.local.cos", owners, observer)?;
        let s = sin(angle, "world.local.sin", owners, observer)?;
        let m0 = mul(c, scale_x, "world.local.m0", owners, observer)?;
        let m1 = mul(s, scale_x, "world.local.m1", owners, observer)?;
        let negative_s = s.neg();
        let m2 = mul(negative_s, scale_y, "world.local.m2", owners, observer)?;
        let m3 = mul(c, scale_y, "world.local.m3", owners, observer)?;
        let local = AffineV1 {
            cells: [
                m0,
                m1,
                m2,
                m3,
                effective(spec, row, 0)?,
                effective(spec, row, 1)?,
            ]
            .map(bits),
        };
        let world = if spec.parent_slot == NONE_SLOT_V1 {
            local
        } else {
            affine(
                *at(output, slot(spec.parent_slot)?)?,
                local,
                AffineContext::World([world_pass, bone_dfs_index as u64]),
                observer,
            )?
        };
        *at_mut(output, index)? = world;
    }
    Ok(())
}

fn distance(
    dx: D64,
    dy: D64,
    checkpoints: [&'static str; 4],
    owners: OwnerTuple,
    observer: &mut Observer<'_>,
) -> ResultV1<D64> {
    let dx2 = mul(dx, dx, checkpoints[0], owners, observer)?;
    let dy2 = mul(dy, dy, checkpoints[1], owners, observer)?;
    sqrt(
        add(dx2, dy2, checkpoints[2], owners, observer)?,
        checkpoints[3],
        owners,
        observer,
    )
}

fn two_bone(
    plan: &mut Category9ReservationPlanV1,
    controller: InlineIkControllerV1,
    observer: &mut Observer<'_>,
) -> ResultV1<()> {
    let controller_index = u64::from(controller.controller_index);
    let owners = OwnerTuple::Controller(controller_index);
    let first = *at(&plan.ik_scratch, 0)?;
    let second = *at(&plan.ik_scratch, 1)?;
    let root_x = d(first.x);
    let root_y = d(first.y);
    let len1 = d(first.length);
    let len2 = d(second.length);
    let dx = sub(
        d(controller.target_x),
        root_x,
        "ik.two-bone.dx",
        owners,
        observer,
    )?;
    let dy = sub(
        d(controller.target_y),
        root_y,
        "ik.two-bone.dy",
        owners,
        observer,
    )?;
    let dist = distance(dx, dy, DISTANCE_TWO_BONE, owners, observer)?;
    let aim = atan2(dy, dx, "ik.two-bone.aim", owners, observer)?;
    let max_reach = add(len1, len2, "ik.two-bone.max-reach", owners, observer)?;
    let (angle1, angle2) = if dist.ge(max_reach) {
        (aim, aim)
    } else {
        let diff = sub(
            len1,
            len2,
            "ik.two-bone.length-difference",
            owners,
            observer,
        )?;
        let min_reach = diff.abs();
        if dist.le(min_reach) {
            (
                aim,
                add(aim, PI, "ik.two-bone.near-angle-two", owners, observer)?,
            )
        } else {
            let l1q = mul(
                len1,
                len1,
                "ik.two-bone.length-one-square",
                owners,
                observer,
            )?;
            let dq = mul(
                dist,
                dist,
                "ik.two-bone.distance-square-repeat",
                owners,
                observer,
            )?;
            let n0 = add(l1q, dq, "ik.two-bone.numerator-sum", owners, observer)?;
            let l2q = mul(
                len2,
                len2,
                "ik.two-bone.length-two-square",
                owners,
                observer,
            )?;
            let num = sub(n0, l2q, "ik.two-bone.numerator", owners, observer)?;
            let d0 = mul(TWO, len1, "ik.two-bone.denominator-left", owners, observer)?;
            let den = mul(d0, dist, "ik.two-bone.denominator", owners, observer)?;
            let ratio = div(num, den, "ik.two-bone.ratio", owners, observer)?;
            let mut inner = acos(
                clamp(ratio, ONE.neg(), ONE),
                "ik.two-bone.inner-angle",
                owners,
                observer,
            )?;
            if controller.presence_flags & 3 == 3 {
                let pdx = sub(
                    d(controller.pole_x),
                    root_x,
                    "ik.two-bone.pole-dx",
                    owners,
                    observer,
                )?;
                let pdy = sub(
                    d(controller.pole_y),
                    root_y,
                    "ik.two-bone.pole-dy",
                    owners,
                    observer,
                )?;
                let u = mul(dx, pdy, "ik.two-bone.cross-left", owners, observer)?;
                let v = mul(dy, pdx, "ik.two-bone.cross-right", owners, observer)?;
                let cross = sub(u, v, "ik.two-bone.cross", owners, observer)?;
                if cross.lt(ZERO) {
                    inner = inner.neg();
                }
            }
            let a1 = add(aim, inner, "ik.two-bone.angle-one", owners, observer)?;
            let ca = cos(a1, "ik.two-bone.angle-one-cos", owners, observer)?;
            let xo = mul(len1, ca, "ik.two-bone.joint-x-offset", owners, observer)?;
            let joint_x = add(root_x, xo, "ik.two-bone.joint-x", owners, observer)?;
            let sa = sin(a1, "ik.two-bone.angle-one-sin", owners, observer)?;
            let yo = mul(len1, sa, "ik.two-bone.joint-y-offset", owners, observer)?;
            let joint_y = add(root_y, yo, "ik.two-bone.joint-y", owners, observer)?;
            let ey = sub(
                d(controller.target_y),
                joint_y,
                "ik.two-bone.end-y",
                owners,
                observer,
            )?;
            let ex = sub(
                d(controller.target_x),
                joint_x,
                "ik.two-bone.end-x",
                owners,
                observer,
            )?;
            (
                a1,
                atan2(ey, ex, "ik.two-bone.angle-two", owners, observer)?,
            )
        }
    };
    let constrained1 = constraint(
        angle1,
        *at(&plan.ik_constraints, 0)?,
        NORMALIZE_TWO_BONE,
        OwnerTuple::ControllerChain([controller_index, 0]),
        observer,
    )?;
    let constrained2 = constraint(
        angle2,
        *at(&plan.ik_constraints, 1)?,
        NORMALIZE_TWO_BONE,
        OwnerTuple::ControllerChain([controller_index, 1]),
        observer,
    )?;
    at_mut(&mut plan.ik_scratch, 0)?.solution = bits(constrained1);
    at_mut(&mut plan.ik_scratch, 1)?.solution = bits(constrained2);
    Ok(())
}

fn end_effector(
    last: IkScratchV1,
    owners: OwnerTuple,
    observer: &mut Observer<'_>,
) -> ResultV1<(D64, D64)> {
    let c = cos(d(last.solution), "ik.ccd.end-cos", owners, observer)?;
    let xo = mul(d(last.length), c, "ik.ccd.end-x-offset", owners, observer)?;
    let x = add(d(last.x), xo, "ik.ccd.end-x", owners, observer)?;
    let s = sin(d(last.solution), "ik.ccd.end-sin", owners, observer)?;
    let yo = mul(d(last.length), s, "ik.ccd.end-y-offset", owners, observer)?;
    let y = add(d(last.y), yo, "ik.ccd.end-y", owners, observer)?;
    Ok((x, y))
}

fn ccd(
    plan: &mut Category9ReservationPlanV1,
    controller: InlineIkControllerV1,
    observer: &mut Observer<'_>,
) -> ResultV1<()> {
    let controller_index = u64::from(controller.controller_index);
    for (index, spec) in plan.ik_constraints.iter().enumerate() {
        let [m0, m1, _, _, _, _] = at(&plan.world_pre, slot(spec.bone_slot)?)?.cells.map(d);
        at_mut(&mut plan.ik_scratch, index)?.solution = bits(atan2(
            m1,
            m0,
            "ik.ccd.initial-angle",
            OwnerTuple::ControllerChain([controller_index, index as u64]),
            observer,
        )?);
    }
    let count = plan.ik_scratch.len();
    for _iteration in 0..controller.max_iterations {
        for i in (0..count).rev() {
            let sweep_owner =
                OwnerTuple::ControllerSweep([controller_index, u64::from(_iteration), i as u64]);
            let last = *plan.ik_scratch.last().ok_or_else(internal)?;
            let (end_x, end_y) = end_effector(
                last,
                OwnerTuple::ControllerEnd([controller_index, u64::from(_iteration), i as u64, 0]),
                observer,
            )?;
            let current = *at(&plan.ik_scratch, i)?;
            let end_y_delta = sub(
                end_y,
                d(current.y),
                "ik.ccd.to-end-y",
                sweep_owner,
                observer,
            )?;
            let end_x_delta = sub(
                end_x,
                d(current.x),
                "ik.ccd.to-end-x",
                sweep_owner,
                observer,
            )?;
            let to_end = atan2(
                end_y_delta,
                end_x_delta,
                "ik.ccd.to-end",
                sweep_owner,
                observer,
            )?;
            let target_y_delta = sub(
                d(controller.target_y),
                d(current.y),
                "ik.ccd.to-target-y",
                sweep_owner,
                observer,
            )?;
            let target_x_delta = sub(
                d(controller.target_x),
                d(current.x),
                "ik.ccd.to-target-x",
                sweep_owner,
                observer,
            )?;
            let to_target = atan2(
                target_y_delta,
                target_x_delta,
                "ik.ccd.to-target",
                sweep_owner,
                observer,
            )?;
            let raw_delta = sub(to_target, to_end, "ik.ccd.raw-delta", sweep_owner, observer)?;
            let delta = normalize(raw_delta, NORMALIZE_CCD_DELTA, sweep_owner, observer)?;
            let candidate = add(
                d(current.solution),
                delta,
                "ik.ccd.candidate-angle",
                sweep_owner,
                observer,
            )?;
            let constrained = constraint(
                candidate,
                *at(&plan.ik_constraints, i)?,
                NORMALIZE_CCD_CONSTRAINT,
                sweep_owner,
                observer,
            )?;
            at_mut(&mut plan.ik_scratch, i)?.solution = bits(constrained);
            for j in 1..count {
                let position_owner = OwnerTuple::ControllerPosition([
                    controller_index,
                    u64::from(_iteration),
                    i as u64,
                    j as u64,
                ]);
                let previous = *at(&plan.ik_scratch, j - 1)?;
                let c = cos(
                    d(previous.solution),
                    "ik.ccd.position-cos",
                    position_owner,
                    observer,
                )?;
                let xo = mul(
                    d(previous.length),
                    c,
                    "ik.ccd.position-x-offset",
                    position_owner,
                    observer,
                )?;
                let x = add(
                    d(previous.x),
                    xo,
                    "ik.ccd.position-x",
                    position_owner,
                    observer,
                )?;
                let next = at_mut(&mut plan.ik_scratch, j)?;
                next.x = bits(x);
                let s = sin(
                    d(previous.solution),
                    "ik.ccd.position-sin",
                    position_owner,
                    observer,
                )?;
                let yo = mul(
                    d(previous.length),
                    s,
                    "ik.ccd.position-y-offset",
                    position_owner,
                    observer,
                )?;
                let y = add(
                    d(previous.y),
                    yo,
                    "ik.ccd.position-y",
                    position_owner,
                    observer,
                )?;
                next.y = bits(y);
            }
        }
        let iteration_owner =
            OwnerTuple::ControllerIteration([controller_index, u64::from(_iteration)]);
        let (end_x, end_y) = end_effector(
            *plan.ik_scratch.last().ok_or_else(internal)?,
            OwnerTuple::ControllerEnd([controller_index, u64::from(_iteration), count as u64, 1]),
            observer,
        )?;
        let dx = sub(
            end_x,
            d(controller.target_x),
            "ik.ccd.distance-x",
            iteration_owner,
            observer,
        )?;
        let dy = sub(
            end_y,
            d(controller.target_y),
            "ik.ccd.distance-y",
            iteration_owner,
            observer,
        )?;
        if distance(dx, dy, DISTANCE_CCD, iteration_owner, observer)?.lt(HALF) {
            break;
        }
    }
    Ok(())
}

fn ik(
    plan: &mut Category9ReservationPlanV1,
    controller: InlineIkControllerV1,
    observer: &mut Observer<'_>,
) -> ResultV1<()> {
    if controller.present == 0 || d(controller.influence).le(ZERO) || plan.ik_constraints.is_empty()
    {
        return Ok(());
    }
    let controller_index = u64::from(controller.controller_index);
    for (index, constraint) in plan.ik_constraints.iter().enumerate() {
        let global = slot(constraint.bone_slot)?;
        let bone = *at(&plan.bone_specs, global)?;
        let row = *at(&plan.bone_update_overrides, global)?;
        let [_, _, _, _, x, y] = at(&plan.world_pre, global)?.cells;
        *at_mut(&mut plan.ik_scratch, index)? = IkScratchV1 {
            angle: bits(effective(bone, row, 2)?),
            x,
            y,
            length: bone.length,
            solution: D64BitsV1::POSITIVE_ZERO,
        };
    }
    if controller.solver == 0 && plan.ik_constraints.len() == 2 {
        two_bone(plan, controller, observer)?;
    } else {
        ccd(plan, controller, observer)?;
    }
    // Every world solution is complete before the first local blend. Keep
    // solution fields intact so a later chain entry reads its solved parent.
    for (index, spec) in plan.ik_constraints.iter().enumerate() {
        let owners = OwnerTuple::ControllerChain([controller_index, index as u64]);
        let global = slot(spec.bone_slot)?;
        let bone = *at(&plan.bone_specs, global)?;
        let solved = d(at(&plan.ik_scratch, index)?.solution);
        let preliminary = if bone.parent_slot == NONE_SLOT_V1 {
            solved
        } else {
            let parent = match plan
                .ik_constraints
                .iter()
                .position(|entry| entry.bone_slot == bone.parent_slot)
            {
                Some(parent_index) => d(at(&plan.ik_scratch, parent_index)?.solution),
                None => {
                    let [m0, m1, _, _, _, _] =
                        at(&plan.world_pre, slot(bone.parent_slot)?)?.cells.map(d);
                    atan2(m1, m0, "ik.commit.parent-world-angle", owners, observer)?
                }
            };
            sub(solved, parent, "ik.commit.world-to-local", owners, observer)?
        };
        let local = normalize(preliminary, NORMALIZE_COMMIT_WORLD, owners, observer)?;
        let constrained = constraint(local, *spec, NORMALIZE_COMMIT_LOCAL, owners, observer)?;
        let one_minus = sub(
            ONE,
            d(controller.influence),
            "ik.commit.one-minus-influence",
            owners,
            observer,
        )?;
        let a = mul(
            d(at(&plan.ik_scratch, index)?.angle),
            one_minus,
            "ik.commit.current-weighted",
            owners,
            observer,
        )?;
        let b = mul(
            constrained,
            d(controller.influence),
            "ik.commit.solved-weighted",
            owners,
            observer,
        )?;
        let out = add(a, b, "ik.commit.blended", owners, observer)?;
        assign_bone(at_mut(&mut plan.bone_update_overrides, global)?, 2, out)?;
    }
    Ok(())
}

fn skinning(plan: &mut Category9ReservationPlanV1, observer: &mut Observer<'_>) -> ResultV1<()> {
    for skin in &plan.skin_mesh_specs {
        let mesh_slot = u64::from(skin.mesh_slot);
        let rest = range(&plan.skin_rest_coordinates, skin.rest_range)?;
        let rows = range(&plan.skin_weight_rows, skin.weight_row_range)?;
        let matrices = range(&plan.skin_bind_inverses, skin.bind_inverse_range)?;
        for (vertex, row) in rows.iter().enumerate() {
            let vertex_owner = OwnerTuple::MeshVertex([mesh_slot, vertex as u64]);
            let offset = vertex.checked_mul(2).ok_or_else(internal)?;
            let rest_x = d(*at(rest, offset)?);
            let rest_y = d(*at(rest, offset.checked_add(1).ok_or_else(internal)?)?);
            let mut sum_x = ZERO;
            let mut sum_y = ZERO;
            let mut applied = ZERO;
            for (weight_index, weight) in range(&plan.skin_weights, row.weights)?.iter().enumerate()
            {
                let weight_owner =
                    OwnerTuple::SkinWeight([mesh_slot, vertex as u64, weight_index as u64]);
                let world = *at(&plan.world_post, slot(weight.bone_slot)?)?;
                let Some(inverse) = matrices
                    .iter()
                    .find(|entry| entry.bone_slot == weight.bone_slot)
                else {
                    continue;
                };
                let sm = affine(
                    world,
                    AffineV1 {
                        cells: inverse.matrix,
                    },
                    AffineContext::Skin([mesh_slot, vertex as u64, weight_index as u64]),
                    observer,
                )?;
                let [m0, m1, m2, m3, m4, m5] = sm.cells.map(d);
                let x0 = mul(m0, rest_x, "skin.transform.x-left", weight_owner, observer)?;
                let x1 = mul(m2, rest_y, "skin.transform.x-right", weight_owner, observer)?;
                let x2 = add(x0, x1, "skin.transform.x-pair", weight_owner, observer)?;
                let tx = add(
                    x2,
                    m4,
                    "skin.transform.x-translation",
                    weight_owner,
                    observer,
                )?;
                let wx = mul(
                    tx,
                    d(weight.weight),
                    "skin.weighted-x",
                    weight_owner,
                    observer,
                )?;
                sum_x = add(sum_x, wx, "skin.sum-x", weight_owner, observer)?;
                let y0 = mul(m1, rest_x, "skin.transform.y-left", weight_owner, observer)?;
                let y1 = mul(m3, rest_y, "skin.transform.y-right", weight_owner, observer)?;
                let y2 = add(y0, y1, "skin.transform.y-pair", weight_owner, observer)?;
                let ty = add(
                    y2,
                    m5,
                    "skin.transform.y-translation",
                    weight_owner,
                    observer,
                )?;
                let wy = mul(
                    ty,
                    d(weight.weight),
                    "skin.weighted-y",
                    weight_owner,
                    observer,
                )?;
                sum_y = add(sum_y, wy, "skin.sum-y", weight_owner, observer)?;
                applied = add(
                    applied,
                    d(weight.weight),
                    "skin.applied-weight",
                    weight_owner,
                    observer,
                )?;
            }
            let (x, y) = if applied.le(EPSILON) {
                (rest_x, rest_y)
            } else if applied.lt(ONE) {
                let rw = sub(ONE, applied, "skin.rest-weight", vertex_owner, observer)?;
                let rx = mul(rest_x, rw, "skin.rest-x-weighted", vertex_owner, observer)?;
                let x = add(sum_x, rx, "skin.rest-x-sum", vertex_owner, observer)?;
                let ry = mul(rest_y, rw, "skin.rest-y-weighted", vertex_owner, observer)?;
                let y = add(sum_y, ry, "skin.rest-y-sum", vertex_owner, observer)?;
                (x, y)
            } else {
                (sum_x, sum_y)
            };
            let destination = slot(skin.derived_range.start)?
                .checked_add(offset)
                .ok_or_else(internal)?;
            *at_mut(&mut plan.skin_skinned_scratch, destination)? = bits(x);
            *at_mut(
                &mut plan.skin_skinned_scratch,
                destination.checked_add(1).ok_or_else(internal)?,
            )? = bits(y);
        }
    }
    Ok(())
}

fn project(plan: &mut Category9ReservationPlanV1, _observer: &mut Observer<'_>) -> ResultV1<()> {
    for skin in &plan.skin_mesh_specs {
        let start = slot(skin.derived_range.start)?;
        let len = slot(skin.derived_range.len)?;
        for offset in 0..len {
            let index = start.checked_add(offset).ok_or_else(internal)?;
            let raw = at(&plan.skin_skinned_scratch, index)?.bits;
            // The sole host-float surface: reinterpret the final raw result,
            // then reuse the adopted single-narrowing projection/classifier.
            let projected = project_binary64_to_binary32(f64::from_bits(raw));
            #[cfg(test)]
            _observer.record_projection(crate::observation::ProjectionRecord {
                mesh_slot: skin.mesh_slot,
                vertex_index: offset / 2,
                axis: offset % 2,
                source: raw,
                result: projected
                    .as_ref()
                    .map(|value| value.to_bits())
                    .map_err(|error| error.kind()),
                after_arithmetic_count: 0,
            });
            let projected = projected?;
            *at_mut(&mut plan.derived_update_coordinates, index)? = D32BitsV1 {
                bits: projected.to_bits(),
            };
        }
    }
    Ok(())
}

fn culling(plan: &mut Category9ReservationPlanV1, observer: &mut Observer<'_>) -> ResultV1<()> {
    for index in 0..plan.mesh_evaluator_specs.len() {
        let mesh = *at(&plan.mesh_evaluator_specs, index)?;
        let vertices = if mesh.static_flags & 1 != 0 {
            range(&plan.derived_update_coordinates, mesh.derived_range)?
        } else {
            let direct = at(&plan.direct_mesh_records, index)?;
            range(&plan.direct_unskinned_vertices, direct.vertex_range)?
        };
        let visible = mesh.static_flags & 4 != 0;
        let mut culled = false;
        let count = vertices.len() / 2;
        if mesh.static_flags & 2 != 0 && visible && count >= 3 {
            let mut sum = ZERO;
            for edge in 0..count {
                let owners = OwnerTuple::MeshEdge([u64::from(mesh.mesh_slot), edge as u64]);
                let next = if edge + 1 == count { 0 } else { edge + 1 };
                let i = edge.checked_mul(2).ok_or_else(internal)?;
                let j = next.checked_mul(2).ok_or_else(internal)?;
                let x_i = widen(*at(vertices, i)?)?;
                let y_i = widen(*at(vertices, i.checked_add(1).ok_or_else(internal)?)?)?;
                let x_next = widen(*at(vertices, j)?)?;
                let y_next = widen(*at(vertices, j.checked_add(1).ok_or_else(internal)?)?)?;
                let a = mul(x_i, y_next, "culling.edge.left-product", owners, observer)?;
                let b = mul(x_next, y_i, "culling.edge.right-product", owners, observer)?;
                let term = sub(a, b, "culling.edge.term", owners, observer)?;
                sum = add(sum, term, "culling.edge.accumulator", owners, observer)?;
            }
            culled = sum.lt(ZERO);
        }
        at_mut(&mut plan.mesh_evaluator_specs, index)?.update_flags =
            if culled { DERIVED_CULLED_FLAG_V1 } else { 0 }
                | if visible && !culled {
                    DERIVED_VISIBLE_FLAG_V1
                } else {
                    0
                };
    }
    Ok(())
}

/// Evaluate initial category 10 without changing committed state or reserving
/// memory. A caller may use the update buffers only after this returns success.
pub(crate) fn evaluate_initial(
    plan: &mut Category9ReservationPlanV1,
    observer: &mut Observer<'_>,
) -> ResultV1<()> {
    for mesh in &mut plan.mesh_evaluator_specs {
        mesh.update_flags = 0;
    }
    plan.inline_physics_group.validity &= !PHYSICS_UPDATE_VALID_FLAG_V1;
    preflight(plan)?;
    for (update, current) in plan
        .parameter_update
        .iter_mut()
        .zip(&plan.parameter_current)
    {
        *update = *current;
    }
    plan.bone_update_overrides.fill(BoneOverrideV1::default());
    for staged in &mut plan.parameter_staged_destinations {
        staged.valid = 0;
        staged.value = D64BitsV1::POSITIVE_ZERO;
    }
    for staged in &mut plan.bone_staged_destinations {
        staged.valid = 0;
        staged.value = D64BitsV1::POSITIVE_ZERO;
    }
    let mut controller = plan.inline_ik_controller;
    bindings(plan, &mut controller, observer)?;
    // Initial zero-step creates +0 physics only. No force, gravity, substep
    // or output arithmetic runs, even when configured outputs are present.
    plan.physics_update_pendulums
        .fill(PendulumStateV1::default());
    plan.inline_physics_group.update_accumulator = D64BitsV1::POSITIVE_ZERO;
    if plan.inline_physics_group.present == 1 {
        plan.inline_physics_group.validity |= PHYSICS_UPDATE_VALID_FLAG_V1;
    }
    finish(plan, controller, observer)
}

/// Evaluate an update whose scratch state has been prepared by `begin_update`.
/// Binding targets overwrite only their own properties, while all untargeted
/// committed overrides copied by the caller remain intact. Commit is separate.
pub(crate) fn evaluate_update(
    plan: &mut Category9ReservationPlanV1,
    delta_bits: u64,
    observer: &mut Observer<'_>,
) -> ResultV1<()> {
    for mesh in &mut plan.mesh_evaluator_specs {
        mesh.update_flags = 0;
    }
    plan.inline_physics_group.validity &= !PHYSICS_UPDATE_VALID_FLAG_V1;
    preflight(plan)?;
    let mut controller = plan.inline_ik_controller;
    bindings(plan, &mut controller, observer)?;
    crate::physics::step_physics(plan, delta_bits, observer)?;
    finish(plan, controller, observer)
}

fn finish(
    plan: &mut Category9ReservationPlanV1,
    controller: InlineIkControllerV1,
    observer: &mut Observer<'_>,
) -> ResultV1<()> {
    #[cfg(test)]
    observer.record_controller(controller);
    if controller.present == 1 {
        worlds(
            &plan.bone_specs,
            &plan.bone_update_overrides,
            &plan.bone_world_order_slots,
            &mut plan.world_pre,
            0,
            observer,
        )?;
        ik(plan, controller, observer)?;
    }
    worlds(
        &plan.bone_specs,
        &plan.bone_update_overrides,
        &plan.bone_world_order_slots,
        &mut plan.world_post,
        1,
        observer,
    )?;
    skinning(plan, observer)?;
    project(plan, observer)?;
    culling(plan, observer)?;
    // No partially completed mesh is a valid candidate if a later stage fails.
    for mesh in &mut plan.mesh_evaluator_specs {
        mesh.update_flags |= DERIVED_VALID_FLAG_V1;
    }
    Ok(())
}
