// Test-only typed state comparisons. Capture outside the measured candidate call.
// No JSON, float arithmetic, alternative evaluator, or inferred numeric oracle.
use crate::compare::{Check, Context};
use crate::expected_types::*;
use crate::literal_types;
use crate::model::*;
use crate::observation::Observer;

mod scopes { include!(concat!(env!("C10_GENERATED_DIR"), "/native-c10-literal-scopes-1.rs")); }

#[derive(Clone, Copy)]
pub(crate) struct IdentityView {
    pub bone_ids: &'static [&'static str],
    pub mesh_ids: &'static [&'static str],
}

pub(crate) struct CapturedState {
    pub plan: Category9ReservationPlanV1,
    pub generation: u64,
    pub candidate_generation: u64,
    pub dynamic_generation: Option<u64>,
    pub canvas: [u64; 2],
    pub metadata: [usize; 4],
}

impl CapturedState {
    pub(crate) fn capture(
        foundation: &EvaluationLoweringFoundationV1,
        dynamic_generation: Option<u64>,
    ) -> Self {
        let p = &foundation.reservation_plan;
        macro_rules! clone_plan { ($($field:ident),+ $(,)?) => { Category9ReservationPlanV1 {
            $($field:p.$field.clone(),)+
            inline_physics_group:p.inline_physics_group,inline_ik_controller:p.inline_ik_controller,
        } }; }
        Self {
            plan: clone_plan!(
                direct_mesh_records,
                direct_unskinned_vertices,
                direct_uvs,
                direct_indices,
                parameter_symbol_bytes,
                parameter_specs,
                parameter_preset_specs,
                parameter_preset_values,
                binding_specs,
                binding_points,
                binding_targets,
                bone_specs,
                bone_world_order_slots,
                mesh_evaluator_specs,
                skin_mesh_specs,
                physics_pendulum_configs,
                physics_inputs,
                physics_outputs,
                ik_constraints,
                skin_weight_rows,
                skin_weights,
                skin_bind_inverses,
                skin_rest_coordinates,
                parameter_current,
                parameter_previous,
                parameter_update,
                parameter_staged_destinations,
                binding_accumulators,
                bone_committed_overrides,
                bone_update_overrides,
                bone_staged_destinations,
                physics_committed_pendulums,
                physics_update_pendulums,
                world_pre,
                world_post,
                ik_scratch,
                skin_skinned_scratch,
                derived_committed_coordinates,
                derived_update_coordinates
            ),
            generation: foundation.generation,
            candidate_generation: foundation.candidate.request_generation(),
            dynamic_generation,
            canvas: [foundation.canvas_width, foundation.canvas_height],
            metadata: [
                foundation.texture_binding_count(),
                foundation.direct_projected_scalar_count,
                foundation.derived_evaluation_mesh_count,
                foundation.mask_edge_count,
            ],
        }
    }
}

fn equal<T: PartialEq>(
    c: &Context,
    selector: u32,
    index: usize,
    expected: &T,
    actual: &T,
) -> Check {
    c.word(selector, index, 1, u64::from(expected == actual))
}
fn words32(c: &Context, selector: u32, e: &[u32], a: impl ExactSizeIterator<Item = u32>) -> Check {
    c.word(selector, u32::MAX as usize, e.len() as u64, a.len() as u64)?;
    for (i, (e, a)) in e.iter().zip(a).enumerate() {
        c.word(selector, i, u64::from(*e), u64::from(a))?;
    }
    Ok(())
}
fn strings(c: &Context, selector: u32, e: &[&str], a: &[&str]) -> Check {
    c.word(selector, u32::MAX as usize, e.len() as u64, a.len() as u64)?;
    for (i, (e, a)) in e.iter().zip(a).enumerate() {
        equal(c, selector, i, e, a)?;
    }
    Ok(())
}
fn parameter_id(p: &Category9ReservationPlanV1, index: usize) -> &str {
    let range = p.parameter_specs[index].symbol_range;
    let start = range.start as usize;
    let end = start
        .checked_add(range.len as usize)
        .expect("fixed symbol end");
    std::str::from_utf8(&p.parameter_symbol_bytes[start..end]).expect("C9 validated UTF8")
}
fn bone_index(locator: BoneLocator, p: &Category9ReservationPlanV1, ids: IdentityView) -> usize {
    match locator {
        BoneLocator::StorageIndex(i) => i as usize,
        BoneLocator::Slot(i) => p
            .bone_specs
            .iter()
            .position(|b| b.bone_slot == i)
            .expect("declared BoneSlot"),
        BoneLocator::Id(id) => ids
            .bone_ids
            .iter()
            .position(|x| *x == id)
            .expect("pinned input BoneID"),
    }
}
fn bones(
    c: &Context,
    selector: u32,
    e: &[BoneExpected],
    a: &[BoneOverrideV1],
    p: &Category9ReservationPlanV1,
    ids: IdentityView,
) -> Check {
    c.word(selector, u32::MAX as usize, e.len() as u64, a.len() as u64)?;
    for (expected_index, e) in e.iter().enumerate() {
        let index = bone_index(e.locator, p, ids);
        let a = &a[index];
        if let Some(mask) = e.presence_mask {
            c.word(
                selector,
                expected_index * 8,
                u64::from(mask),
                u64::from(a.presence_mask),
            )?;
        }
        if let Some(properties) = e.properties {
            let mut mask = 0u32;
            for property in properties {
                mask |= 1
                    << match property {
                        BoneProperty::X => 0,
                        BoneProperty::Y => 1,
                        BoneProperty::Angle => 2,
                        BoneProperty::ScaleX => 3,
                        BoneProperty::ScaleY => 4,
                    };
            }
            c.word(
                selector,
                expected_index * 8,
                u64::from(mask),
                u64::from(a.presence_mask),
            )?;
        }
        if let Some(v) = e.padding {
            c.word(
                selector,
                expected_index * 8 + 1,
                u64::from(v),
                u64::from(a.padding),
            )?;
        }
        for (j, (e, a)) in [
            (e.x, a.x.bits),
            (e.y, a.y.bits),
            (e.angle, a.angle.bits),
            (e.scale_x, a.scale_x.bits),
            (e.scale_y, a.scale_y.bits),
        ]
        .iter()
        .enumerate()
        {
            if let Some(e) = e {
                c.word(selector, expected_index * 8 + j + 2, *e, *a)?;
            }
        }
    }
    Ok(())
}
fn pendulums(c: &Context, selector: u32, e: &[PendulumExpected], a: &[PendulumStateV1]) -> Check {
    c.word(selector, u32::MAX as usize, e.len() as u64, a.len() as u64)?;
    for (i, (e, a)) in e.iter().zip(a).enumerate() {
        c.word(selector, 2 * i, e.angle, a.angle.bits)?;
        c.word(selector, 2 * i + 1, e.velocity, a.velocity.bits)?;
    }
    Ok(())
}
fn worlds(c: &Context, selector: u32, e: &[[u64; 6]], a: &[AffineV1]) -> Check {
    c.word(selector, u32::MAX as usize, e.len() as u64, a.len() as u64)?;
    for (i, (e, a)) in e.iter().zip(a).enumerate() {
        for (j, (e, a)) in e.iter().zip(&a.cells).enumerate() {
            c.word(selector, i * 6 + j, *e, a.bits)?;
        }
    }
    Ok(())
}
fn meshes(
    c: &Context,
    selector: u32,
    e: &[MeshExpected],
    p: &Category9ReservationPlanV1,
    update: bool,
) -> Check {
    c.word(
        selector,
        u32::MAX as usize,
        e.len() as u64,
        p.mesh_evaluator_specs.len() as u64,
    )?;
    for (i, e) in e.iter().enumerate() {
        let a = p
            .mesh_evaluator_specs
            .iter()
            .find(|a| a.mesh_slot == e.slot)
            .expect("declared MeshSlot");
        let direct = p
            .direct_mesh_records
            .iter()
            .find(|a| a.mesh_slot == e.slot)
            .expect("direct MeshSlot");
        let flags = if update {
            a.update_flags
        } else {
            a.committed_flags
        };
        for (j, (e, a)) in [
            (e.snapshot_valid, flags & 1 != 0),
            (e.visible, flags & 4 != 0),
            // Effective visibility in a retained snapshot flag record is not
            // available before that snapshot becomes valid (initial old C9
            // storage). Once valid, use static visibility, not culled visibility.
            (e.effective_visible, flags & 1 != 0 && a.static_flags & 4 != 0),
            (e.culled, flags & 2 != 0),
        ]
        .iter()
        .enumerate()
        {
            if let Some(e) = e {
                c.word(selector, i * 8 + j, u64::from(*e), u64::from(*a))?;
            }
        }
        if let Some(e) = e.x {
            c.word(selector, i * 8 + 4, u64::from(e), u64::from(direct.x.bits))?;
        }
        if let Some(e) = e.y {
            c.word(selector, i * 8 + 5, u64::from(e), u64::from(direct.y.bits))?;
        }
        if let Some(expected) = e.vertices {
            let (storage, range) = if a.skin_slot == u32::MAX {
                (&p.direct_unskinned_vertices, direct.vertex_range)
            } else {
                (
                    if update {
                        &p.derived_update_coordinates
                    } else {
                        &p.derived_committed_coordinates
                    },
                    a.derived_range,
                )
            };
            let start = range.start as usize;
            let end = start + range.len as usize;
            words32(
                c,
                selector + 1,
                expected,
                storage[start..end].iter().map(|v| v.bits),
            )?;
        }
    }
    Ok(())
}

// BeforeCommitScratch is checked through the exact swap destination. No value
// is discarded by commit: four Vecs, per-mesh flags and accumulator/valid bits
// exchange; world/skin/binding/IK scratch stays in place. Never read post-commit
// update storage as if it still held the newly computed result.
pub(crate) fn state(c: &Context, e: &StateExpected, a: &CapturedState, ids: IdentityView) -> Check {
    let p = &a.plan;
    let swapped = e.domain == Domain::BeforeCommitScratch;
    let update_parameters = if swapped {
        &p.parameter_previous
    } else {
        &p.parameter_update
    };
    let update_bones = if swapped {
        &p.bone_committed_overrides
    } else {
        &p.bone_update_overrides
    };
    let update_pendulums = if swapped {
        &p.physics_committed_pendulums
    } else {
        &p.physics_update_pendulums
    };
    let update_coordinates = if swapped {
        &p.derived_committed_coordinates
    } else {
        &p.derived_update_coordinates
    };
    let physics = &p.inline_physics_group;
    macro_rules! scalar {
        ($field:ident,$actual:expr,$selector:expr) => {
            if let Some(e) = e.$field {
                c.word($selector, 0, e as u64, $actual as u64)?;
            }
        };
    }
    scalar!(request_generation, a.generation, 100);
    if let Some(e) = e.dynamic_generation {
        c.word(
            101,
            0,
            e,
            a.dynamic_generation.expect("declared owned generation"),
        )?;
    }
    if let Some(e) = e.parameter_current {
        c.words(102, e, p.parameter_current.iter().map(|v| v.bits))?;
    }
    if let Some(e) = e.parameter_previous {
        c.words(103, e, p.parameter_previous.iter().map(|v| v.bits))?;
    }
    if let Some(e) = e.parameter_ids {
        c.word(
            104,
            u32::MAX as usize,
            e.len() as u64,
            p.parameter_specs.len() as u64,
        )?;
        for (i, e) in e.iter().enumerate() {
            equal(c, 104, i, e, &parameter_id(p, i))?;
        }
    }
    if let Some(e) = e.bone_overrides {
        bones(c, 105, e, &p.bone_committed_overrides, p, ids)?;
    }
    scalar!(physics_present, physics.present != 0, 106);
    scalar!(physics_snapshot_valid, physics.validity & 1 != 0, 107);
    scalar!(physics_original_group, physics.group_index, 108);
    if let Some(e) = e.physics_pendulums {
        pendulums(c, 109, e, &p.physics_committed_pendulums)?;
    }
    scalar!(physics_accumulator, physics.committed_accumulator.bits, 110);
    if let Some(e) = e.absent_physics_noop {
        c.word(
            111,
            0,
            u64::from(e),
            u64::from(
                *physics == InlinePhysicsGroupV1::ABSENT
                    && p.physics_committed_pendulums.is_empty()
                    && p.physics_update_pendulums.is_empty(),
            ),
        )?;
    }
    if let Some(e) = e.derived {
        words32(
            c,
            112,
            e,
            p.derived_committed_coordinates.iter().map(|v| v.bits),
        )?;
    }
    if let Some(e) = e.mesh_flags {
        words32(
            c,
            113,
            e,
            p.mesh_evaluator_specs.iter().map(|v| v.committed_flags),
        )?;
    }
    if let Some(e) = e.meshes {
        meshes(c, 114, e, p, false)?;
    }
    if let Some(e) = e.direct_vertices {
        words32(
            c,
            116,
            e,
            p.direct_unskinned_vertices.iter().map(|v| v.bits),
        )?;
    }
    if let Some(e) = e.direct_uv {
        words32(c, 117, e, p.direct_uvs.iter().map(|v| v.bits))?;
    }
    if let Some(e) = e.direct_indices {
        words32(c, 118, e, p.direct_indices.iter().map(|v| v.value))?;
    }
    if let Some(e) = e.direct_xy {
        c.word(
            119,
            u32::MAX as usize,
            e.len() as u64,
            (2 * p.direct_mesh_records.len()) as u64,
        )?;
        for (i, m) in p.direct_mesh_records.iter().enumerate() {
            c.word(119, 2 * i, u64::from(e[2 * i]), u64::from(m.x.bits))?;
            c.word(119, 2 * i + 1, u64::from(e[2 * i + 1]), u64::from(m.y.bits))?;
        }
    }
    if let Some(e) = e.parameter_update {
        c.words(120, e, update_parameters.iter().map(|v| v.bits))?;
    }
    if let Some(e) = e.bone_update {
        bones(c, 121, e, update_bones, p, ids)?;
    }
    if let Some(e) = e.physics_update_pendulums {
        pendulums(c, 122, e, update_pendulums)?;
    }
    scalar!(
        physics_update_accumulator,
        if swapped {
            physics.committed_accumulator.bits
        } else {
            physics.update_accumulator.bits
        },
        123
    );
    scalar!(
        physics_update_valid,
        physics.validity & (if swapped { 1 } else { 2 }) != 0,
        124
    );
    if let Some(e) = e.derived_update {
        words32(c, 125, e, update_coordinates.iter().map(|v| v.bits))?;
    }
    if let Some(e) = e.mesh_update {
        meshes(c, 126, e, p, !swapped)?;
    }
    if let Some(e) = e.world_pre {
        worlds(c, 128, e, &p.world_pre)?;
    }
    if let Some(e) = e.world_post {
        worlds(c, 129, e, &p.world_post)?;
    }
    if let Some(e) = e.skinned {
        c.words(130, e, p.skin_skinned_scratch.iter().map(|v| v.bits))?;
    }
    if let Some(e) = e.binding_accumulators {
        c.words(131, e, p.binding_accumulators.iter().map(|v| v.bits))?;
    }
    // Actual IK scratch captures the effective local angle before solving and
    // retains that angle while only solution/positions are changed afterwards.
    if let Some(e) = e.current_local_read {
        c.words(132, e, p.ik_scratch.iter().map(|v| v.angle.bits))?;
    }
    scalar!(ik_scratch_len, p.ik_scratch.len(), 133);
    if let Some(e) = e.projected_prefix {
        c.word(
            134,
            u32::MAX as usize,
            1,
            u64::from(e.len() <= update_coordinates.len()),
        )?;
        words32(
            c,
            134,
            e,
            update_coordinates[..e.len()].iter().map(|v| v.bits),
        )?;
    }
    if let Some(e) = e.correlation {
        if let Some(v) = e.caller_generation {
            c.word(135, 0, v, a.generation)?;
        }
        if let Some(v) = e.candidate_generation {
            c.word(135, 1, v, a.candidate_generation)?;
        }
    }
    Ok(())
}

pub(crate) fn immutable(c: &Context, b: &CapturedState, a: &CapturedState) -> Check {
    equal(c, 150, 0, &b.generation, &a.generation)?;
    equal(c, 150, 1, &b.candidate_generation, &a.candidate_generation)?;
    equal(c, 150, 2, &b.canvas, &a.canvas)?;
    equal(c, 150, 3, &b.metadata, &a.metadata)?;
    let b = &b.plan;
    let a = &a.plan;
    macro_rules! unchanged{($($f:ident),+)=>{ $(equal(c,151,line!() as usize,&b.$f,&a.$f)?;)+ };}
    unchanged!(
        direct_mesh_records,
        direct_unskinned_vertices,
        direct_uvs,
        direct_indices,
        parameter_symbol_bytes,
        parameter_specs,
        parameter_preset_specs,
        parameter_preset_values,
        binding_specs,
        binding_points,
        binding_targets,
        bone_specs,
        bone_world_order_slots,
        skin_mesh_specs,
        physics_pendulum_configs,
        physics_inputs,
        physics_outputs,
        ik_constraints,
        skin_weight_rows,
        skin_weights,
        skin_bind_inverses,
        skin_rest_coordinates,
        inline_ik_controller
    );
    equal(
        c,
        152,
        0,
        &b.mesh_evaluator_specs.len(),
        &a.mesh_evaluator_specs.len(),
    )?;
    for (i, (b, a)) in b
        .mesh_evaluator_specs
        .iter()
        .zip(&a.mesh_evaluator_specs)
        .enumerate()
    {
        equal(
            c,
            152,
            i,
            &[
                b.mesh_slot,
                b.skin_slot,
                b.derived_range.start,
                b.derived_range.len,
                b.static_flags,
                b.padding,
            ],
            &[
                a.mesh_slot,
                a.skin_slot,
                a.derived_range.start,
                a.derived_range.len,
                a.static_flags,
                a.padding,
            ],
        )?;
    }
    let mut b = b.inline_physics_group;
    let mut a = a.inline_physics_group;
    b.committed_accumulator = D64BitsV1::POSITIVE_ZERO;
    b.update_accumulator = D64BitsV1::POSITIVE_ZERO;
    b.validity = 0;
    a.committed_accumulator = D64BitsV1::POSITIVE_ZERO;
    a.update_accumulator = D64BitsV1::POSITIVE_ZERO;
    a.validity = 0;
    equal(c, 153, 0, &b, &a)
}
pub(crate) fn committed(c: &Context, b: &CapturedState, a: &CapturedState) -> Check {
    equal(c, 154, 0, &b.dynamic_generation, &a.dynamic_generation)?;
    let b = &b.plan;
    let a = &a.plan;
    macro_rules! same {($($f:ident),+)=>{$(equal(c,155,line!() as usize,&b.$f,&a.$f)?;)+};}
    same!(
        parameter_previous,
        bone_committed_overrides,
        physics_committed_pendulums,
        derived_committed_coordinates
    );
    equal(
        c,
        156,
        0,
        &b.inline_physics_group.committed_accumulator,
        &a.inline_physics_group.committed_accumulator,
    )?;
    equal(
        c,
        156,
        1,
        &(b.inline_physics_group.validity & 1),
        &(a.inline_physics_group.validity & 1),
    )?;
    equal(
        c,
        156,
        2,
        &b.mesh_evaluator_specs.len(),
        &a.mesh_evaluator_specs.len(),
    )?;
    for (i, (b, a)) in b
        .mesh_evaluator_specs
        .iter()
        .zip(&a.mesh_evaluator_specs)
        .enumerate()
    {
        equal(c, 157, i, &b.committed_flags, &a.committed_flags)?;
    }
    Ok(())
}
fn scratch(c: &Context, b: &CapturedState, a: &CapturedState) -> Check {
    let b = &b.plan;
    let a = &a.plan;
    macro_rules! same {($($f:ident),+)=>{$(equal(c,158,line!() as usize,&b.$f,&a.$f)?;)+};}
    same!(
        parameter_update,
        parameter_staged_destinations,
        binding_accumulators,
        bone_update_overrides,
        bone_staged_destinations,
        physics_update_pendulums,
        world_pre,
        world_post,
        ik_scratch,
        skin_skinned_scratch,
        derived_update_coordinates
    );
    equal(
        c,
        159,
        0,
        &b.inline_physics_group.update_accumulator,
        &a.inline_physics_group.update_accumulator,
    )?;
    equal(
        c,
        159,
        1,
        &(b.inline_physics_group.validity & 2),
        &(a.inline_physics_group.validity & 2),
    )?;
    for (i, (b, a)) in b
        .mesh_evaluator_specs
        .iter()
        .zip(&a.mesh_evaluator_specs)
        .enumerate()
    {
        equal(c, 159, i + 2, &b.update_flags, &a.update_flags)?;
    }
    Ok(())
}

/// The before snapshot is taken AFTER explicit trusted injections. An update
/// may overwrite scratch on error, never committed/current/immutable storage.
/// SetInput/ApplyPreset may only alter caller-current; failures alter nothing.
pub(crate) fn transition(
    c: &Context,
    b: &CapturedState,
    a: &CapturedState,
    action: ActionExpected,
    status: u32,
) -> Check {
    immutable(c, b, a)?;
    match action {
        ActionExpected::SetInput { .. } | ActionExpected::ApplyPreset { .. } => {
            committed(c, b, a)?;
            scratch(c, b, a)?;
            if status != 0 {
                equal(
                    c,
                    160,
                    0,
                    &b.plan.parameter_current,
                    &a.plan.parameter_current,
                )?;
            }
        }
        ActionExpected::Update { .. } => {
            equal(
                c,
                160,
                1,
                &b.plan.parameter_current,
                &a.plan.parameter_current,
            )?;
            if status != 0 {
                committed(c, b, a)?;
            }
            // Both exits precede begin_update; unlike a C10 arithmetic failure,
            // invalid arguments and exhausted generation leave scratch intact.
            if status == 1 || b.dynamic_generation == Some(u64::MAX) {
                scratch(c, b, a)?;
            }
        }
        ActionExpected::Construct { .. } | ActionExpected::NativeValidatePayloadBeforeC9 => {
            panic!("transition is for owned mutations")
        }
    }
    Ok(())
}

pub(crate) fn before_action(
    c: &Context,
    case_index: u32,
    action_index: u32,
    a: &CapturedState,
    ids: IdentityView,
) -> Check {
    for expected in scopes::BEFORE_ACTION_STATES
        .iter()
        .filter(|s| s.case_index == case_index && s.action_index == action_index)
    {
        state(c, &expected.state, a, ids)?;
    }
    Ok(())
}
pub(crate) fn case_scope(
    c: &Context,
    case_index: u32,
    a: &CapturedState,
    ids: IdentityView,
) -> Check {
    if let Some(e) = scopes::CASE_SCOPES
        .iter()
        .find(|s| s.case_index == case_index)
    {
        c.word(161, 0, e.request_generation, a.generation)?;
        c.word(
            161,
            1,
            e.source_dynamic_generation,
            a.dynamic_generation.expect("scope initial token"),
        )?;
        strings(c, 162, e.bone_dfs_ids, ids.bone_ids)?;
        strings(c, 163, e.mesh_dfs_ids, ids.mesh_ids)?;
        c.word(
            164,
            0,
            ids.bone_ids.len() as u64,
            a.plan.bone_specs.len() as u64,
        )?;
        c.word(
            164,
            1,
            ids.mesh_ids.len() as u64,
            a.plan.direct_mesh_records.len() as u64,
        )?;
        for (i, b) in a.plan.bone_specs.iter().enumerate() {
            c.word(164, i + 2, i as u64, u64::from(b.bone_slot))?;
        }
        for (i, m) in a.plan.direct_mesh_records.iter().enumerate() {
            c.word(165, i, i as u64, u64::from(m.mesh_slot))?;
        }
    }
    if let Some(e) = scopes::PRESET_STORAGE
        .iter()
        .find(|s| s.case_index == case_index)
    {
        words32(
            c,
            166,
            e.parameter_slots,
            a.plan
                .parameter_preset_values
                .iter()
                .map(|v| v.parameter_slot),
        )?;
        c.words(
            167,
            e.value_bits,
            a.plan.parameter_preset_values.iter().map(|v| v.value.bits),
        )?;
    }
    Ok(())
}

fn controller(c: &Context, e: ControllerExpected, a: InlineIkControllerV1) -> Check {
    for (i, (e, a)) in [
        (e.target_x, a.target_x.bits),
        (e.target_y, a.target_y.bits),
        (e.pole_x, a.pole_x.bits),
        (e.pole_y, a.pole_y.bits),
        (e.influence, a.influence.bits),
    ]
    .iter()
    .enumerate()
    {
        if let Some(e) = e {
            c.word(170, i, *e, *a)?;
        }
    }
    if let Some(e) = e.pole_presence {
        c.word(170, 5, u64::from(e), u64::from(a.presence_flags))?;
    }
    Ok(())
}

/// `post` is Some only for an actually retained/returned candidate. A failed
/// constructor's separate scratch companion is NOT a returned token.
pub(crate) fn step(
    c: &Context,
    e: &StepExpected,
    action: ActionExpected,
    status: u32,
    post: Option<&CapturedState>,
    before: Option<&CapturedState>,
    history: &[Option<CapturedState>],
    failed_initial_companion: Option<&CapturedState>,
    ids: IdentityView,
    observer: &Observer<'_>,
    error: Option<crate::EvaluationLoweringErrorKind>,
) -> Check {
    c.word(180, 0, u64::from(e.status), u64::from(status))?;
    let failed_constructor = matches!(action, ActionExpected::Construct { .. })
        && status != 0
        && post.is_none();
    if let Some(companion) = failed_initial_companion {
        assert!(failed_constructor, "scratch companion belongs only to failed construction");
        assert!(companion.dynamic_generation.is_none(), "companion is not an owned derived token");
    }
    match e.dynamic_generation {
        Presence::Unspecified => {}
        Presence::Absent => c.word(181, 0, 0, u64::from(post.is_some()))?,
        Presence::Value(v) => c.word(
            181,
            0,
            v,
            post.expect("expected owned token")
                .dynamic_generation
                .expect("owned generation"),
        )?,
    }
    if let Some(v) = e.request_generation {
        c.word(
            182,
            0,
            v,
            post.or(if failed_constructor { failed_initial_companion } else { None })
                .expect("actual returned candidate or separate failed-initial request identity")
                .generation,
        )?;
    }
    if let Some(v) = e.derived_token {
        let actual = match action {
            ActionExpected::Construct { .. } => post.is_some(),
            ActionExpected::Update { .. } => status == 0,
            _ => panic!("undefined token outcome action"),
        };
        c.word(183, 0, u64::from(v), u64::from(actual))?;
    }
    if let Some(v) = e.no_committed_snapshot {
        c.word(184, 0, u64::from(v), u64::from(post.is_none()))?;
    }
    if e.committed_absent {
        c.word(184, 1, 0, u64::from(post.is_some()))?;
    }
    for expected in e.states {
        let actual = if expected.domain == Domain::PreActionInjected {
            before.expect("explicit before-action snapshot")
        } else if failed_constructor
            && matches!(expected.domain, Domain::CallerCurrent | Domain::ReusableNonSwappedScratch | Domain::FailedScratch)
        {
            failed_initial_companion.expect("separate failed initial scratch witness")
        } else {
            post.unwrap_or_else(||panic!("declared owned typed state case {} step {} domain {:?}",c.case,c.step,expected.domain))
        };
        if expected.domain == Domain::BeforeCommitScratch {
            c.word(185, 0, 0, u64::from(status))?;
        }
        state(c, expected, actual, ids)?;
    }
    for reference in e.state_references {
        let earlier = history[reference.earlier_step as usize]
            .as_ref()
            .expect("referenced owned snapshot");
        let actual = post.expect("current owned snapshot");
        match reference.domain {
            Domain::Committed => committed(c, earlier, actual)?,
            Domain::CallerCurrent => equal(
                c,
                186,
                0,
                &earlier.plan.parameter_current,
                &actual.plan.parameter_current,
            )?,
            _ => panic!("unhandled frozen reference domain"),
        }
    }
    match e.controller {
        Presence::Unspecified => {}
        Presence::Absent => c.word(
            187,
            0,
            0,
            u64::from(observer.controller().is_some_and(|v| v.present != 0)),
        )?,
        Presence::Value(v) => controller(
            c,
            v,
            observer
                .controller()
                .expect("actual controller observation"),
        )?,
    }
    failure(c, e, status, observer, error)?;
    if let Presence::Value(position) = e.projection_position {
        let first = observer
            .projections()
            .first()
            .expect("actual projection position");
        c.word(
            188,
            0,
            u64::from(position.after_checkpoint_count),
            first.after_arithmetic_count as u64,
        )?;
        c.word(
            188,
            1,
            u64::from(position.before_checkpoint_ordinal),
            first.after_arithmetic_count as u64,
        )?;
    } else if e.projection_position == Presence::Absent {
        c.word(188, 0, 0, observer.projections().len() as u64)?;
    }
    if let Presence::Value(culling) = e.culling {
        let row = observer
            .records()
            .iter()
            .rev()
            .find(|r| r.checkpoint == "culling.edge.accumulator")
            .expect("actual final culling row");
        c.word(189, 0, culling.final_accumulator, row.result)?;
        let (values, count) = crate::compare::owners(row.owners);
        c.word(189, 1, 2, count as u64)?;
        c.word(189, 2, u64::from(culling.mesh_slot), values[0])?;
    } else if e.culling == Presence::Absent {
        c.word(
            189,
            0,
            0,
            observer
                .records()
                .iter()
                .filter(|r| r.checkpoint.starts_with("culling."))
                .count() as u64,
        )?;
    }
    if let Some(e) = e.traversal_storage_slots {
        words32(
            c,
            190,
            e,
            post.expect("traversal token")
                .plan
                .bone_world_order_slots
                .iter()
                .map(|v| v.value),
        )?;
    }
    if let Some(e) = e.accumulator_before_branch {
        let row = observer
            .records()
            .iter()
            .rev()
            .find(|r| {
                matches!(
                    r.checkpoint,
                    "physics.accumulator.add-delta" | "physics.accumulator.subtract-step"
                )
            })
            .expect("actual accumulator branch row");
        c.word(191, 0, e, row.result)?;
    }
    if let Some(e) = e.parameter_destination_ids {
        let p = &post.expect("destination token").plan;
        c.word(
            192,
            0,
            e.len() as u64,
            p.parameter_staged_destinations.len() as u64,
        )?;
        for (i, (e, d)) in e.iter().zip(&p.parameter_staged_destinations).enumerate() {
            equal(c, 192, i + 1, e, &parameter_id(p, d.owner_slot as usize))?;
        }
    }
    if let Some(e) = e.bone_destination_ids {
        let p = &post.expect("destination token").plan;
        c.word(
            193,
            0,
            e.len() as u64,
            p.bone_staged_destinations.len() as u64,
        )?;
        for (i, (e, d)) in e.iter().zip(&p.bone_staged_destinations).enumerate() {
            equal(c, 193, i + 1, e, &ids.bone_ids[d.owner_slot as usize])?;
        }
    }
    // Helper results have their own actual helper runner; never infer them from
    // the expectation. That caller must invoke check_helper_result explicitly.
    Ok(())
}

pub(crate) fn check_helper_result(c: &Context, e: &StepExpected, actual: &[u64]) -> Check {
    c.words(
        194,
        e.helper_result.expect("fixed helper expected"),
        actual.iter().copied(),
    )
}

fn failure(
    c: &Context,
    step: &StepExpected,
    status: u32,
    observer: &Observer<'_>,
    error: Option<crate::EvaluationLoweringErrorKind>,
) -> Check {
    let e = match step.first_failure {
        Presence::Unspecified => return Ok(()),
        Presence::Absent => {
            // Frozen reservation-denial case has status 6 but no C10 failure:
            // null names the numerical first-failure observation, not success.
            if status != 0 {
                c.word(200, 0, 6, u64::from(status))?;
                c.word(200, 2, 0, observer.records().len() as u64)?;
                c.word(200, 3, 0, observer.projections().len() as u64)?;
            }
            return Ok(());
        }
        Presence::Value(v) => v,
    };
    c.word(200, 1, 1, u64::from(status != 0))?;
    if let Some(e) = e.status {
        c.word(201, 0, u64::from(e), u64::from(status))?;
    }
    if let Some(reason) = e.reason {
        use crate::EvaluationLoweringErrorKind as K;
        let expected = match reason {
            "NumericNonFinite" => K::NumericNonFinite,
            "finite-binary32-overflow" | "NumericOverflow" => K::NumericOverflow,
            "NumericUnderflow" => K::NumericUnderflow,
            "NumericSubnormal" => K::NumericSubnormal,
            "Internal" => K::Internal,
            "invalid-weight-domain" => panic!("native payload prerequisite must use its own actual validation error"),
            _ => panic!("unhandled frozen error kind"),
        };
        equal(c, 202, 0, &Some(expected), &error)?;
    }
    if let Some(checkpoint) = e.checkpoint {
        let row = observer
            .records()
            .last()
            .expect("actual failure arithmetic row");
        equal(c, 203, 0, &checkpoint, &row.checkpoint)?;
        if let Some(bits) = e.result_bits {
            c.word(204, 0, bits, row.result)?;
        }
        if let Some(expected) = e.owners {
            let (actual, n) = crate::compare::owners(row.owners);
            c.words(205, expected, actual[..n].iter().copied())?;
        }
    } else {
        assert!(
            e.owners.is_none() && e.result_bits.is_none(),
            "unbound failure arithmetic fields"
        );
    }
    if let Some(row) = e.arithmetic_row {
        c.word(
            206,
            0,
            u64::from(row),
            observer
                .records()
                .len()
                .checked_sub(1)
                .expect("actual failing row") as u64,
        )?;
    }
    if let Some(rows) = e.after_primitive_rows {
        c.word(207, 0, u64::from(rows), observer.records().len() as u64)?;
    }
    if e.mesh_slot.is_some()
        || e.vertex_index.is_some()
        || e.axis.is_some()
        || e.source_bits.is_some()
        || e.projection_attempt.is_some()
    {
        let p = observer
            .projections()
            .last()
            .expect("actual failed projection");
        c.word(208, 0, 1, u64::from(p.result.is_err()))?;
        if let Some(v) = e.mesh_slot {
            c.word(209, 0, u64::from(v), u64::from(p.mesh_slot))?;
        }
        if let Some(v) = e.vertex_index {
            c.word(209, 1, u64::from(v), p.vertex_index as u64)?;
        }
        if let Some(v) = e.axis {
            c.word(209, 2, u64::from(v), p.axis as u64)?;
        }
        if let Some(v) = e.source_bits {
            c.word(209, 3, v, p.source)?;
        }
        if let Some(v) = e.projection_attempt {
            c.word(
                209,
                4,
                u64::from(v),
                observer
                    .projections()
                    .len()
                    .checked_sub(1)
                    .expect("actual failing projection") as u64,
            )?;
        }
    }
    Ok(())
}
