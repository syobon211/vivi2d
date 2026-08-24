use std::fmt;
use std::mem::{align_of, offset_of, size_of};

use vivi_runtime_native_preactivation::{EvaluationTexturePlanV1, ValidatedEvaluationPayloadV1};

pub(crate) const NONE_SLOT_V1: u32 = u32::MAX;

#[repr(transparent)]
#[derive(Clone, Copy, Default, Eq, PartialEq)]
pub(crate) struct SlotV1 {
    pub(crate) value: u32,
}

#[repr(transparent)]
#[derive(Clone, Copy, Default, Eq, PartialEq)]
pub(crate) struct D32BitsV1 {
    pub(crate) bits: u32,
}

impl D32BitsV1 {
    pub(crate) const POSITIVE_ZERO: Self = Self { bits: 0 };
    pub(crate) const ONE: Self = Self { bits: 0x3f80_0000 };

    pub(crate) const fn from_f32(value: f32) -> Self {
        Self {
            bits: value.to_bits(),
        }
    }
}

#[repr(transparent)]
#[derive(Clone, Copy, Default, Eq, PartialEq)]
pub(crate) struct CheckedIndexV1 {
    pub(crate) value: u32,
}

#[repr(transparent)]
#[derive(Clone, Copy, Default, Eq, PartialEq)]
pub(crate) struct D64BitsV1 {
    pub(crate) bits: u64,
}

impl D64BitsV1 {
    pub(crate) const POSITIVE_ZERO: Self = Self { bits: 0 };
    pub(crate) const ONE: Self = Self {
        bits: 0x3ff0_0000_0000_0000,
    };

    pub(crate) const fn from_f64(value: f64) -> Self {
        Self {
            bits: value.to_bits(),
        }
    }
}

#[repr(C)]
#[derive(Clone, Copy, Default, Eq, PartialEq)]
pub(crate) struct RangeV1 {
    pub(crate) start: u32,
    pub(crate) len: u32,
}

#[repr(C)]
#[derive(Clone, Copy, Default, Eq, PartialEq)]
pub(crate) struct DirectMeshRecordV1 {
    pub(crate) mesh_slot: u32,
    pub(crate) flags: u32,
    pub(crate) vertex_range: RangeV1,
    pub(crate) uv_range: RangeV1,
    pub(crate) index_range: RangeV1,
    pub(crate) x: D32BitsV1,
    pub(crate) y: D32BitsV1,
    pub(crate) opacity: D32BitsV1,
    pub(crate) multiply: [D32BitsV1; 3],
    pub(crate) screen: [D32BitsV1; 3],
    pub(crate) blend: u32,
    pub(crate) padding: [u32; 2],
}

#[repr(C)]
#[derive(Clone, Copy, Default, Eq, PartialEq)]
pub(crate) struct ParameterSpecV1 {
    pub(crate) symbol_range: RangeV1,
    pub(crate) min: D64BitsV1,
    pub(crate) max: D64BitsV1,
    pub(crate) default: D64BitsV1,
    pub(crate) paired_slot: u32,
    pub(crate) padding: u32,
}

#[repr(C)]
#[derive(Clone, Copy, Default, Eq, PartialEq)]
pub(crate) struct PresetSpecV1 {
    pub(crate) symbol_range: RangeV1,
    pub(crate) value_range: RangeV1,
}

#[repr(C)]
#[derive(Clone, Copy, Default, Eq, PartialEq)]
pub(crate) struct PresetValueV1 {
    pub(crate) parameter_slot: u32,
    pub(crate) padding: u32,
    pub(crate) value: D64BitsV1,
}

#[repr(C)]
#[derive(Clone, Copy, Default, Eq, PartialEq)]
pub(crate) struct BindingSpecV1 {
    pub(crate) parameter_slot: u32,
    pub(crate) target_slot: u32,
    pub(crate) point_range: RangeV1,
}

#[repr(C)]
#[derive(Clone, Copy, Default, Eq, PartialEq)]
pub(crate) struct BindingPointV1 {
    pub(crate) parameter: D64BitsV1,
    pub(crate) target: D64BitsV1,
}

#[repr(C)]
#[derive(Clone, Copy, Default, Eq, PartialEq)]
pub(crate) struct BindingTargetV1 {
    pub(crate) kind: u32,
    pub(crate) property: u32,
    pub(crate) owner_slot: u32,
    pub(crate) padding: u32,
    pub(crate) default: D64BitsV1,
}

#[repr(C)]
#[derive(Clone, Copy, Default, Eq, PartialEq)]
pub(crate) struct BoneSpecV1 {
    pub(crate) parent_slot: u32,
    pub(crate) bone_slot: u32,
    pub(crate) x: D64BitsV1,
    pub(crate) y: D64BitsV1,
    pub(crate) angle: D64BitsV1,
    pub(crate) length: D64BitsV1,
    pub(crate) scale_x: D64BitsV1,
    pub(crate) scale_y: D64BitsV1,
    pub(crate) padding: [u32; 2],
}

#[repr(C)]
#[derive(Clone, Copy, Default, Eq, PartialEq)]
pub(crate) struct MeshEvaluatorSpecV1 {
    pub(crate) mesh_slot: u32,
    pub(crate) skin_slot: u32,
    pub(crate) derived_range: RangeV1,
    pub(crate) static_flags: u32,
    pub(crate) committed_flags: u32,
    pub(crate) update_flags: u32,
    pub(crate) padding: u32,
}

#[repr(C)]
#[derive(Clone, Copy, Default, Eq, PartialEq)]
pub(crate) struct SkinMeshSpecV1 {
    pub(crate) mesh_slot: u32,
    pub(crate) padding: u32,
    pub(crate) rest_range: RangeV1,
    pub(crate) weight_row_range: RangeV1,
    pub(crate) bind_inverse_range: RangeV1,
    pub(crate) derived_range: RangeV1,
}

#[repr(C)]
#[derive(Clone, Copy, Default, Eq, PartialEq)]
pub(crate) struct PendulumConfigV1 {
    pub(crate) length: D64BitsV1,
    pub(crate) mass: D64BitsV1,
    pub(crate) damping: D64BitsV1,
}

#[repr(C)]
#[derive(Clone, Copy, Default, Eq, PartialEq)]
pub(crate) struct PhysicsInputV1 {
    pub(crate) parameter_slot: u32,
    pub(crate) kind: u32,
    pub(crate) weight: D64BitsV1,
}

#[repr(C)]
#[derive(Clone, Copy, Default, Eq, PartialEq)]
pub(crate) struct PhysicsOutputV1 {
    pub(crate) destination_kind: u32,
    pub(crate) destination_slot: u32,
    pub(crate) pendulum_index: u32,
    pub(crate) stage_slot: u32,
    pub(crate) weight: D64BitsV1,
}

#[repr(C)]
#[derive(Clone, Copy, Default, Eq, PartialEq)]
pub(crate) struct IkConstraintV1 {
    pub(crate) bone_slot: u32,
    pub(crate) padding: u32,
    pub(crate) min: D64BitsV1,
    pub(crate) max: D64BitsV1,
}

#[repr(transparent)]
#[derive(Clone, Copy, Default, Eq, PartialEq)]
pub(crate) struct SkinWeightRowV1 {
    pub(crate) weights: RangeV1,
}

#[repr(C)]
#[derive(Clone, Copy, Default, Eq, PartialEq)]
pub(crate) struct SkinWeightV1 {
    pub(crate) bone_slot: u32,
    pub(crate) padding: u32,
    pub(crate) weight: D64BitsV1,
}

#[repr(C)]
#[derive(Clone, Copy, Default, Eq, PartialEq)]
pub(crate) struct BindInverseV1 {
    pub(crate) bone_slot: u32,
    pub(crate) padding: u32,
    pub(crate) matrix: [D64BitsV1; 6],
}

#[repr(C)]
#[derive(Clone, Copy, Default, Eq, PartialEq)]
pub(crate) struct StagedValueV1 {
    pub(crate) owner_slot: u32,
    pub(crate) valid: u32,
    pub(crate) value: D64BitsV1,
}

#[repr(C)]
#[derive(Clone, Copy, Default, Eq, PartialEq)]
pub(crate) struct BoneOverrideV1 {
    pub(crate) presence_mask: u32,
    pub(crate) padding: u32,
    pub(crate) x: D64BitsV1,
    pub(crate) y: D64BitsV1,
    pub(crate) angle: D64BitsV1,
    pub(crate) scale_x: D64BitsV1,
    pub(crate) scale_y: D64BitsV1,
}

#[repr(C)]
#[derive(Clone, Copy, Default, Eq, PartialEq)]
pub(crate) struct PendulumStateV1 {
    pub(crate) angle: D64BitsV1,
    pub(crate) velocity: D64BitsV1,
}

#[repr(transparent)]
#[derive(Clone, Copy, Default, Eq, PartialEq)]
pub(crate) struct AffineV1 {
    pub(crate) cells: [D64BitsV1; 6],
}

#[repr(C)]
#[derive(Clone, Copy, Default, Eq, PartialEq)]
pub(crate) struct IkScratchV1 {
    pub(crate) angle: D64BitsV1,
    pub(crate) x: D64BitsV1,
    pub(crate) y: D64BitsV1,
    pub(crate) length: D64BitsV1,
    pub(crate) solution: D64BitsV1,
}

#[repr(C)]
#[derive(Clone, Copy, Eq, PartialEq)]
pub(crate) struct InlinePhysicsGroupV1 {
    pub(crate) present: u32,
    pub(crate) group_index: u32,
    pub(crate) pendulum_range: RangeV1,
    pub(crate) input_range: RangeV1,
    pub(crate) output_range: RangeV1,
    pub(crate) gravity_direction: D64BitsV1,
    pub(crate) gravity_strength: D64BitsV1,
    pub(crate) wind: D64BitsV1,
    pub(crate) committed_accumulator: D64BitsV1,
    pub(crate) update_accumulator: D64BitsV1,
    pub(crate) validity: u32,
    pub(crate) padding: u32,
}

impl InlinePhysicsGroupV1 {
    pub(crate) const ABSENT: Self = Self {
        present: 0,
        group_index: NONE_SLOT_V1,
        pendulum_range: RangeV1 { start: 0, len: 0 },
        input_range: RangeV1 { start: 0, len: 0 },
        output_range: RangeV1 { start: 0, len: 0 },
        gravity_direction: D64BitsV1::POSITIVE_ZERO,
        gravity_strength: D64BitsV1::POSITIVE_ZERO,
        wind: D64BitsV1::POSITIVE_ZERO,
        committed_accumulator: D64BitsV1::POSITIVE_ZERO,
        update_accumulator: D64BitsV1::POSITIVE_ZERO,
        validity: 0,
        padding: 0,
    };
}

impl Default for InlinePhysicsGroupV1 {
    fn default() -> Self {
        Self::ABSENT
    }
}

#[repr(C)]
#[derive(Clone, Copy, Eq, PartialEq)]
pub(crate) struct InlineIkControllerV1 {
    pub(crate) present: u32,
    pub(crate) controller_index: u32,
    pub(crate) solver: u32,
    pub(crate) max_iterations: u32,
    pub(crate) constraint_range: RangeV1,
    pub(crate) target_x: D64BitsV1,
    pub(crate) target_y: D64BitsV1,
    pub(crate) pole_x: D64BitsV1,
    pub(crate) pole_y: D64BitsV1,
    pub(crate) influence: D64BitsV1,
    pub(crate) presence_flags: u32,
    pub(crate) padding: u32,
}

impl InlineIkControllerV1 {
    pub(crate) const ABSENT: Self = Self {
        present: 0,
        controller_index: NONE_SLOT_V1,
        solver: 0,
        max_iterations: 0,
        constraint_range: RangeV1 { start: 0, len: 0 },
        target_x: D64BitsV1::POSITIVE_ZERO,
        target_y: D64BitsV1::POSITIVE_ZERO,
        pole_x: D64BitsV1::POSITIVE_ZERO,
        pole_y: D64BitsV1::POSITIVE_ZERO,
        influence: D64BitsV1::POSITIVE_ZERO,
        presence_flags: 0,
        padding: 0,
    };
}

impl Default for InlineIkControllerV1 {
    fn default() -> Self {
        Self::ABSENT
    }
}

#[allow(dead_code)]
pub(crate) struct Category9ReservationPlanV1 {
    pub(crate) direct_mesh_records: Vec<DirectMeshRecordV1>,
    pub(crate) direct_unskinned_vertices: Vec<D32BitsV1>,
    pub(crate) direct_uvs: Vec<D32BitsV1>,
    pub(crate) direct_indices: Vec<CheckedIndexV1>,
    pub(crate) parameter_symbol_bytes: Vec<u8>,
    pub(crate) parameter_specs: Vec<ParameterSpecV1>,
    pub(crate) parameter_preset_specs: Vec<PresetSpecV1>,
    pub(crate) parameter_preset_values: Vec<PresetValueV1>,
    pub(crate) binding_specs: Vec<BindingSpecV1>,
    pub(crate) binding_points: Vec<BindingPointV1>,
    pub(crate) binding_targets: Vec<BindingTargetV1>,
    pub(crate) bone_specs: Vec<BoneSpecV1>,
    pub(crate) bone_world_order_slots: Vec<SlotV1>,
    pub(crate) mesh_evaluator_specs: Vec<MeshEvaluatorSpecV1>,
    pub(crate) skin_mesh_specs: Vec<SkinMeshSpecV1>,
    pub(crate) physics_pendulum_configs: Vec<PendulumConfigV1>,
    pub(crate) physics_inputs: Vec<PhysicsInputV1>,
    pub(crate) physics_outputs: Vec<PhysicsOutputV1>,
    pub(crate) ik_constraints: Vec<IkConstraintV1>,
    pub(crate) skin_weight_rows: Vec<SkinWeightRowV1>,
    pub(crate) skin_weights: Vec<SkinWeightV1>,
    pub(crate) skin_bind_inverses: Vec<BindInverseV1>,
    pub(crate) skin_rest_coordinates: Vec<D64BitsV1>,
    pub(crate) parameter_current: Vec<D64BitsV1>,
    pub(crate) parameter_previous: Vec<D64BitsV1>,
    pub(crate) parameter_update: Vec<D64BitsV1>,
    pub(crate) parameter_staged_destinations: Vec<StagedValueV1>,
    pub(crate) binding_accumulators: Vec<D64BitsV1>,
    pub(crate) bone_committed_overrides: Vec<BoneOverrideV1>,
    pub(crate) bone_update_overrides: Vec<BoneOverrideV1>,
    pub(crate) bone_staged_destinations: Vec<StagedValueV1>,
    pub(crate) physics_committed_pendulums: Vec<PendulumStateV1>,
    pub(crate) physics_update_pendulums: Vec<PendulumStateV1>,
    pub(crate) world_pre: Vec<AffineV1>,
    pub(crate) world_post: Vec<AffineV1>,
    pub(crate) ik_scratch: Vec<IkScratchV1>,
    pub(crate) skin_skinned_scratch: Vec<D64BitsV1>,
    pub(crate) derived_committed_coordinates: Vec<D32BitsV1>,
    pub(crate) derived_update_coordinates: Vec<D32BitsV1>,
    pub(crate) inline_physics_group: InlinePhysicsGroupV1,
    pub(crate) inline_ik_controller: InlineIkControllerV1,
}

/// Owned consumer-zero result after Evaluation Lowering v1 categories 1–9.
///
/// This value is deliberately non-`Clone`, has private fields, and exposes only
/// aggregate metadata. It retains the correlated candidate and typed plan by
/// move together with the private Category 9 reservation plan. It is **not**
/// the contract's sealed/complete lowered candidate: category-10 deterministic
/// derived evaluation, category-11 topology/invariant construction, texture
/// host work, activation, and publication remain absent.
pub struct EvaluationLoweringFoundationV1 {
    pub(crate) generation: u64,
    #[allow(dead_code)]
    pub(crate) candidate: ValidatedEvaluationPayloadV1,
    pub(crate) texture_plan: EvaluationTexturePlanV1,
    #[allow(dead_code)]
    pub(crate) canvas_width: u64,
    #[allow(dead_code)]
    pub(crate) canvas_height: u64,
    pub(crate) reservation_plan: Category9ReservationPlanV1,
    pub(crate) direct_projected_scalar_count: usize,
    pub(crate) derived_evaluation_mesh_count: usize,
    pub(crate) mask_edge_count: usize,
}

impl EvaluationLoweringFoundationV1 {
    /// Returns the exactly correlated caller generation.
    #[must_use]
    pub const fn request_generation(&self) -> u64 {
        self.generation
    }

    /// Returns the number of exactly correlated texture-plan bindings.
    #[must_use]
    pub fn texture_binding_count(&self) -> usize {
        self.texture_plan.textures.len()
    }

    /// Returns the recursive payload-DFS count of mesh projection records.
    #[must_use]
    pub fn mesh_count(&self) -> usize {
        self.reservation_plan.direct_mesh_records.len()
    }

    /// Returns the number of candidate binary64 scalars projected directly.
    #[must_use]
    pub const fn direct_projected_scalar_count(&self) -> usize {
        self.direct_projected_scalar_count
    }

    /// Returns the number of skinned meshes deferred to category 10.
    #[must_use]
    pub const fn derived_evaluation_mesh_count(&self) -> usize {
        self.derived_evaluation_mesh_count
    }

    /// Returns the aggregate count of normalized mask edges discovered during
    /// feature preflight. No mask commands or topology are built in this slice.
    #[must_use]
    pub const fn mask_edge_count(&self) -> usize {
        self.mask_edge_count
    }
}

impl fmt::Debug for EvaluationLoweringFoundationV1 {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("EvaluationLoweringFoundationV1")
            .field("request_generation", &self.generation)
            .field("texture_binding_count", &self.texture_plan.textures.len())
            .field(
                "mesh_count",
                &self.reservation_plan.direct_mesh_records.len(),
            )
            .field(
                "direct_projected_scalar_count",
                &self.direct_projected_scalar_count,
            )
            .field(
                "derived_evaluation_mesh_count",
                &self.derived_evaluation_mesh_count,
            )
            .field("mask_edge_count", &self.mask_edge_count)
            .finish()
    }
}

const _: () = {
    assert!(size_of::<u8>() == 1);
    assert!(align_of::<u8>() == 1);

    assert!(size_of::<SlotV1>() == 4);
    assert!(align_of::<SlotV1>() == 4);
    assert!(offset_of!(SlotV1, value) == 0);
    assert!(size_of::<D32BitsV1>() == 4);
    assert!(align_of::<D32BitsV1>() == 4);
    assert!(offset_of!(D32BitsV1, bits) == 0);
    assert!(D32BitsV1::POSITIVE_ZERO.bits == 0x0000_0000);
    assert!(D32BitsV1::ONE.bits == 0x3f80_0000);
    assert!(size_of::<CheckedIndexV1>() == 4);
    assert!(align_of::<CheckedIndexV1>() == 4);
    assert!(offset_of!(CheckedIndexV1, value) == 0);
    assert!(size_of::<D64BitsV1>() == 8);
    assert!(align_of::<D64BitsV1>() == 8);
    assert!(offset_of!(D64BitsV1, bits) == 0);
    assert!(D64BitsV1::POSITIVE_ZERO.bits == 0x0000_0000_0000_0000);
    assert!(D64BitsV1::ONE.bits == 0x3ff0_0000_0000_0000);
    assert!(size_of::<RangeV1>() == 8);
    assert!(align_of::<RangeV1>() == 4);
    assert!(offset_of!(RangeV1, start) == 0);
    assert!(offset_of!(RangeV1, len) == 4);

    assert!(size_of::<DirectMeshRecordV1>() == 80);
    assert!(align_of::<DirectMeshRecordV1>() == 4);
    assert!(offset_of!(DirectMeshRecordV1, mesh_slot) == 0);
    assert!(offset_of!(DirectMeshRecordV1, flags) == 4);
    assert!(offset_of!(DirectMeshRecordV1, vertex_range) == 8);
    assert!(offset_of!(DirectMeshRecordV1, uv_range) == 16);
    assert!(offset_of!(DirectMeshRecordV1, index_range) == 24);
    assert!(offset_of!(DirectMeshRecordV1, x) == 32);
    assert!(offset_of!(DirectMeshRecordV1, y) == 36);
    assert!(offset_of!(DirectMeshRecordV1, opacity) == 40);
    assert!(offset_of!(DirectMeshRecordV1, multiply) == 44);
    assert!(offset_of!(DirectMeshRecordV1, screen) == 56);
    assert!(offset_of!(DirectMeshRecordV1, blend) == 68);
    assert!(offset_of!(DirectMeshRecordV1, padding) == 72);

    assert!(size_of::<ParameterSpecV1>() == 40);
    assert!(align_of::<ParameterSpecV1>() == 8);
    assert!(offset_of!(ParameterSpecV1, symbol_range) == 0);
    assert!(offset_of!(ParameterSpecV1, min) == 8);
    assert!(offset_of!(ParameterSpecV1, max) == 16);
    assert!(offset_of!(ParameterSpecV1, default) == 24);
    assert!(offset_of!(ParameterSpecV1, paired_slot) == 32);
    assert!(offset_of!(ParameterSpecV1, padding) == 36);

    assert!(size_of::<PresetSpecV1>() == 16);
    assert!(align_of::<PresetSpecV1>() == 4);
    assert!(offset_of!(PresetSpecV1, symbol_range) == 0);
    assert!(offset_of!(PresetSpecV1, value_range) == 8);
    assert!(size_of::<PresetValueV1>() == 16);
    assert!(align_of::<PresetValueV1>() == 8);
    assert!(offset_of!(PresetValueV1, parameter_slot) == 0);
    assert!(offset_of!(PresetValueV1, padding) == 4);
    assert!(offset_of!(PresetValueV1, value) == 8);
    assert!(size_of::<BindingSpecV1>() == 16);
    assert!(align_of::<BindingSpecV1>() == 4);
    assert!(offset_of!(BindingSpecV1, parameter_slot) == 0);
    assert!(offset_of!(BindingSpecV1, target_slot) == 4);
    assert!(offset_of!(BindingSpecV1, point_range) == 8);
    assert!(size_of::<BindingPointV1>() == 16);
    assert!(align_of::<BindingPointV1>() == 8);
    assert!(offset_of!(BindingPointV1, parameter) == 0);
    assert!(offset_of!(BindingPointV1, target) == 8);
    assert!(size_of::<BindingTargetV1>() == 24);
    assert!(align_of::<BindingTargetV1>() == 8);
    assert!(offset_of!(BindingTargetV1, kind) == 0);
    assert!(offset_of!(BindingTargetV1, property) == 4);
    assert!(offset_of!(BindingTargetV1, owner_slot) == 8);
    assert!(offset_of!(BindingTargetV1, padding) == 12);
    assert!(offset_of!(BindingTargetV1, default) == 16);

    assert!(size_of::<BoneSpecV1>() == 64);
    assert!(align_of::<BoneSpecV1>() == 8);
    assert!(offset_of!(BoneSpecV1, parent_slot) == 0);
    assert!(offset_of!(BoneSpecV1, bone_slot) == 4);
    assert!(offset_of!(BoneSpecV1, x) == 8);
    assert!(offset_of!(BoneSpecV1, y) == 16);
    assert!(offset_of!(BoneSpecV1, angle) == 24);
    assert!(offset_of!(BoneSpecV1, length) == 32);
    assert!(offset_of!(BoneSpecV1, scale_x) == 40);
    assert!(offset_of!(BoneSpecV1, scale_y) == 48);
    assert!(offset_of!(BoneSpecV1, padding) == 56);

    assert!(size_of::<MeshEvaluatorSpecV1>() == 32);
    assert!(align_of::<MeshEvaluatorSpecV1>() == 4);
    assert!(offset_of!(MeshEvaluatorSpecV1, mesh_slot) == 0);
    assert!(offset_of!(MeshEvaluatorSpecV1, skin_slot) == 4);
    assert!(offset_of!(MeshEvaluatorSpecV1, derived_range) == 8);
    assert!(offset_of!(MeshEvaluatorSpecV1, static_flags) == 16);
    assert!(offset_of!(MeshEvaluatorSpecV1, committed_flags) == 20);
    assert!(offset_of!(MeshEvaluatorSpecV1, update_flags) == 24);
    assert!(offset_of!(MeshEvaluatorSpecV1, padding) == 28);
    assert!(size_of::<SkinMeshSpecV1>() == 40);
    assert!(align_of::<SkinMeshSpecV1>() == 4);
    assert!(offset_of!(SkinMeshSpecV1, mesh_slot) == 0);
    assert!(offset_of!(SkinMeshSpecV1, padding) == 4);
    assert!(offset_of!(SkinMeshSpecV1, rest_range) == 8);
    assert!(offset_of!(SkinMeshSpecV1, weight_row_range) == 16);
    assert!(offset_of!(SkinMeshSpecV1, bind_inverse_range) == 24);
    assert!(offset_of!(SkinMeshSpecV1, derived_range) == 32);

    assert!(size_of::<PendulumConfigV1>() == 24);
    assert!(align_of::<PendulumConfigV1>() == 8);
    assert!(offset_of!(PendulumConfigV1, length) == 0);
    assert!(offset_of!(PendulumConfigV1, mass) == 8);
    assert!(offset_of!(PendulumConfigV1, damping) == 16);
    assert!(size_of::<PhysicsInputV1>() == 16);
    assert!(align_of::<PhysicsInputV1>() == 8);
    assert!(offset_of!(PhysicsInputV1, parameter_slot) == 0);
    assert!(offset_of!(PhysicsInputV1, kind) == 4);
    assert!(offset_of!(PhysicsInputV1, weight) == 8);
    assert!(size_of::<PhysicsOutputV1>() == 24);
    assert!(align_of::<PhysicsOutputV1>() == 8);
    assert!(offset_of!(PhysicsOutputV1, destination_kind) == 0);
    assert!(offset_of!(PhysicsOutputV1, destination_slot) == 4);
    assert!(offset_of!(PhysicsOutputV1, pendulum_index) == 8);
    assert!(offset_of!(PhysicsOutputV1, stage_slot) == 12);
    assert!(offset_of!(PhysicsOutputV1, weight) == 16);
    assert!(size_of::<IkConstraintV1>() == 24);
    assert!(align_of::<IkConstraintV1>() == 8);
    assert!(offset_of!(IkConstraintV1, bone_slot) == 0);
    assert!(offset_of!(IkConstraintV1, padding) == 4);
    assert!(offset_of!(IkConstraintV1, min) == 8);
    assert!(offset_of!(IkConstraintV1, max) == 16);

    assert!(size_of::<SkinWeightRowV1>() == 8);
    assert!(align_of::<SkinWeightRowV1>() == 4);
    assert!(offset_of!(SkinWeightRowV1, weights) == 0);
    assert!(size_of::<SkinWeightV1>() == 16);
    assert!(align_of::<SkinWeightV1>() == 8);
    assert!(offset_of!(SkinWeightV1, bone_slot) == 0);
    assert!(offset_of!(SkinWeightV1, padding) == 4);
    assert!(offset_of!(SkinWeightV1, weight) == 8);
    assert!(size_of::<BindInverseV1>() == 56);
    assert!(align_of::<BindInverseV1>() == 8);
    assert!(offset_of!(BindInverseV1, bone_slot) == 0);
    assert!(offset_of!(BindInverseV1, padding) == 4);
    assert!(offset_of!(BindInverseV1, matrix) == 8);
    assert!(size_of::<StagedValueV1>() == 16);
    assert!(align_of::<StagedValueV1>() == 8);
    assert!(offset_of!(StagedValueV1, owner_slot) == 0);
    assert!(offset_of!(StagedValueV1, valid) == 4);
    assert!(offset_of!(StagedValueV1, value) == 8);

    assert!(size_of::<BoneOverrideV1>() == 48);
    assert!(align_of::<BoneOverrideV1>() == 8);
    assert!(offset_of!(BoneOverrideV1, presence_mask) == 0);
    assert!(offset_of!(BoneOverrideV1, padding) == 4);
    assert!(offset_of!(BoneOverrideV1, x) == 8);
    assert!(offset_of!(BoneOverrideV1, y) == 16);
    assert!(offset_of!(BoneOverrideV1, angle) == 24);
    assert!(offset_of!(BoneOverrideV1, scale_x) == 32);
    assert!(offset_of!(BoneOverrideV1, scale_y) == 40);
    assert!(size_of::<PendulumStateV1>() == 16);
    assert!(align_of::<PendulumStateV1>() == 8);
    assert!(offset_of!(PendulumStateV1, angle) == 0);
    assert!(offset_of!(PendulumStateV1, velocity) == 8);
    assert!(size_of::<AffineV1>() == 48);
    assert!(align_of::<AffineV1>() == 8);
    assert!(offset_of!(AffineV1, cells) == 0);
    assert!(size_of::<IkScratchV1>() == 40);
    assert!(align_of::<IkScratchV1>() == 8);
    assert!(offset_of!(IkScratchV1, angle) == 0);
    assert!(offset_of!(IkScratchV1, x) == 8);
    assert!(offset_of!(IkScratchV1, y) == 16);
    assert!(offset_of!(IkScratchV1, length) == 24);
    assert!(offset_of!(IkScratchV1, solution) == 32);

    assert!(size_of::<InlinePhysicsGroupV1>() == 80);
    assert!(align_of::<InlinePhysicsGroupV1>() == 8);
    assert!(offset_of!(InlinePhysicsGroupV1, present) == 0);
    assert!(offset_of!(InlinePhysicsGroupV1, group_index) == 4);
    assert!(offset_of!(InlinePhysicsGroupV1, pendulum_range) == 8);
    assert!(offset_of!(InlinePhysicsGroupV1, input_range) == 16);
    assert!(offset_of!(InlinePhysicsGroupV1, output_range) == 24);
    assert!(offset_of!(InlinePhysicsGroupV1, gravity_direction) == 32);
    assert!(offset_of!(InlinePhysicsGroupV1, gravity_strength) == 40);
    assert!(offset_of!(InlinePhysicsGroupV1, wind) == 48);
    assert!(offset_of!(InlinePhysicsGroupV1, committed_accumulator) == 56);
    assert!(offset_of!(InlinePhysicsGroupV1, update_accumulator) == 64);
    assert!(offset_of!(InlinePhysicsGroupV1, validity) == 72);
    assert!(offset_of!(InlinePhysicsGroupV1, padding) == 76);
    assert!(size_of::<InlineIkControllerV1>() == 72);
    assert!(align_of::<InlineIkControllerV1>() == 8);
    assert!(offset_of!(InlineIkControllerV1, present) == 0);
    assert!(offset_of!(InlineIkControllerV1, controller_index) == 4);
    assert!(offset_of!(InlineIkControllerV1, solver) == 8);
    assert!(offset_of!(InlineIkControllerV1, max_iterations) == 12);
    assert!(offset_of!(InlineIkControllerV1, constraint_range) == 16);
    assert!(offset_of!(InlineIkControllerV1, target_x) == 24);
    assert!(offset_of!(InlineIkControllerV1, target_y) == 32);
    assert!(offset_of!(InlineIkControllerV1, pole_x) == 40);
    assert!(offset_of!(InlineIkControllerV1, pole_y) == 48);
    assert!(offset_of!(InlineIkControllerV1, influence) == 56);
    assert!(offset_of!(InlineIkControllerV1, presence_flags) == 64);
    assert!(offset_of!(InlineIkControllerV1, padding) == 68);
};
