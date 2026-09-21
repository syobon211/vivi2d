// External test-only literal interface. No evaluator, parser, or production API.
// All floats are immutable raw words. Unspecified is not zero/false/empty.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SourceRef { pub file: &'static str, pub pointer: &'static str }
pub const NO_SOURCE: SourceRef = SourceRef { file: "", pointer: "" };
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Presence<T> { Unspecified, Absent, Value(T) }
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CaseClass { PublicInputOrRawApi, TypedOrTrustedInjection, PublicControlBranchInapplicable, NativeReservationDenial, TestOnlyHelper, RawPrimitiveWitness, AllocationReuse, NativePrerequisiteOnly }
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ActionExpected {
    Construct { request_generation: Option<u64> },
    SetInput { id: &'static str, bits: u64 },
    Update { delta_bits: u64 },
    ApplyPreset { id: &'static str },
    NativeValidatePayloadBeforeC9,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct TraceExpected { pub checkpoint: &'static str, pub opcode: u32, pub owners: &'static [u64], pub operands: &'static [u64], pub result: u64 }
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ProjectionErrorExpected { NumericNonFinite, NumericOverflow, NumericUnderflow, NumericSubnormal }
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ProjectionResultExpected { Ok(u32), Err(ProjectionErrorExpected) }
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ProjectionExpected { pub source: SourceRef, pub mesh_slot: u32, pub vertex_index: u32, pub axis: u32, pub source_bits: u64, pub result: ProjectionResultExpected }
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ProjectionDiagnostic { pub source: SourceRef, pub attempt: u32, pub rounded_or_rejected_bits: u32 }
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Domain { Committed, CallerCurrent, CommonImmutable, PreActionInjected, AfterSuccessScratch, BeforeCommitScratch, ReusableNonSwappedScratch, RetainedSwappedStorage, FailedScratch, StagedOnly }
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BoneLocator { StorageIndex(u32), Slot(u32), Id(&'static str) }
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BoneProperty { X, Y, Angle, ScaleX, ScaleY }
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct BoneExpected {
    pub locator: BoneLocator, pub presence_mask: Option<u32>, pub properties: Option<&'static [BoneProperty]>,
    pub padding: Option<u32>, pub x: Option<u64>, pub y: Option<u64>, pub angle: Option<u64>, pub scale_x: Option<u64>, pub scale_y: Option<u64>,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PendulumExpected { pub angle: u64, pub velocity: u64 }
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct MeshExpected {
    pub slot: u32, pub snapshot_valid: Option<bool>, pub visible: Option<bool>, pub effective_visible: Option<bool>, pub culled: Option<bool>,
    pub x: Option<u32>, pub y: Option<u32>, pub vertices: Option<&'static [u32]>,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct CorrelationExpected { pub caller_generation: Option<u64>, pub candidate_generation: Option<u64> }
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct StateExpected {
    pub source: SourceRef, pub domain: Domain,
    pub request_generation: Option<u64>, pub dynamic_generation: Option<u64>,
    pub parameter_current: Option<&'static [u64]>, pub parameter_previous: Option<&'static [u64]>, pub parameter_ids: Option<&'static [&'static str]>,
    pub bone_overrides: Option<&'static [BoneExpected]>, pub physics_present: Option<bool>, pub physics_snapshot_valid: Option<bool>,
    pub physics_original_group: Option<u32>, pub physics_pendulums: Option<&'static [PendulumExpected]>, pub physics_accumulator: Option<u64>,
    pub absent_physics_noop: Option<bool>, pub derived: Option<&'static [u32]>, pub mesh_flags: Option<&'static [u32]>, pub meshes: Option<&'static [MeshExpected]>,
    pub direct_vertices: Option<&'static [u32]>, pub direct_uv: Option<&'static [u32]>, pub direct_indices: Option<&'static [u32]>, pub direct_xy: Option<&'static [u32]>,
    pub parameter_update: Option<&'static [u64]>, pub bone_update: Option<&'static [BoneExpected]>,
    pub physics_update_pendulums: Option<&'static [PendulumExpected]>, pub physics_update_accumulator: Option<u64>, pub physics_update_valid: Option<bool>,
    pub derived_update: Option<&'static [u32]>, pub mesh_update: Option<&'static [MeshExpected]>,
    pub world_pre: Option<&'static [[u64; 6]]>, pub world_post: Option<&'static [[u64; 6]]>, pub skinned: Option<&'static [u64]>,
    pub binding_accumulators: Option<&'static [u64]>, pub current_local_read: Option<&'static [u64]>, pub ik_scratch_len: Option<u32>,
    pub projected_prefix: Option<&'static [u32]>, pub correlation: Option<CorrelationExpected>,
}
pub const EMPTY_STATE: StateExpected = StateExpected {
    source: NO_SOURCE, domain: Domain::Committed, request_generation: None, dynamic_generation: None,
    parameter_current: None, parameter_previous: None, parameter_ids: None, bone_overrides: None,
    physics_present: None, physics_snapshot_valid: None, physics_original_group: None, physics_pendulums: None, physics_accumulator: None, absent_physics_noop: None,
    derived: None, mesh_flags: None, meshes: None, direct_vertices: None, direct_uv: None, direct_indices: None, direct_xy: None,
    parameter_update: None, bone_update: None, physics_update_pendulums: None, physics_update_accumulator: None, physics_update_valid: None, derived_update: None, mesh_update: None,
    world_pre: None, world_post: None, skinned: None, binding_accumulators: None, current_local_read: None, ik_scratch_len: None, projected_prefix: None, correlation: None,
};
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct StateReference { pub source: SourceRef, pub domain: Domain, pub earlier_step: u32 }
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ControllerExpected { pub target_x: Option<u64>, pub target_y: Option<u64>, pub pole_x: Option<u64>, pub pole_y: Option<u64>, pub influence: Option<u64>, pub pole_presence: Option<u32> }
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct FailureExpected {
    pub source: SourceRef, pub checkpoint: Option<&'static str>, pub owners: Option<&'static [u64]>, pub arithmetic_row: Option<u32>,
    pub reason: Option<&'static str>, pub result_bits: Option<u64>, pub mesh_slot: Option<u32>, pub vertex_index: Option<u32>, pub axis: Option<u32>,
    pub projection_attempt: Option<u32>, pub source_bits: Option<u64>, pub status: Option<u32>, pub after_primitive_rows: Option<u32>,
}
pub const EMPTY_FAILURE: FailureExpected = FailureExpected { source: NO_SOURCE, checkpoint: None, owners: None, arithmetic_row: None, reason: None, result_bits: None, mesh_slot: None, vertex_index: None, axis: None, projection_attempt: None, source_bits: None, status: None, after_primitive_rows: None };
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ProjectionPositionExpected { pub after_checkpoint_count: u32, pub before_checkpoint_ordinal: u32 }
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct CullingExpected { pub mesh_slot: u32, pub final_accumulator: u64 }
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct StepExpected {
    pub source: SourceRef, pub action_index: u32, pub action: Option<ActionExpected>, pub status: u32,
    pub dynamic_generation: Presence<u64>, pub request_generation: Option<u64>, pub derived_token: Option<bool>, pub no_committed_snapshot: Option<bool>,
    pub trace: &'static [TraceExpected], pub projections: &'static [ProjectionExpected], pub projection_diagnostics: &'static [ProjectionDiagnostic],
    pub states: &'static [StateExpected], pub committed_absent: bool, pub state_references: &'static [StateReference],
    pub controller: Presence<ControllerExpected>, pub first_failure: Presence<FailureExpected>,
    pub projection_position: Presence<ProjectionPositionExpected>, pub culling: Presence<CullingExpected>,
    pub helper_result: Option<&'static [u64]>, pub traversal_storage_slots: Option<&'static [u32]>,
    pub accumulator_before_branch: Option<u64>,
    pub parameter_destination_ids: Option<&'static [&'static str]>, pub bone_destination_ids: Option<&'static [&'static str]>,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum InjectionPhase { BeforeInitialC10, BeforeAction(u32), NativeC9Reservation }
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum InjectionValue {
    DynamicGeneration(u64), PresetParameterSlot { index: u32, value: u32 }, PresetValue { index: u32, bits: u64 },
    ControllerInfluence(u64), ControllerTargetY(u64), BindingPointTarget { index: u32, bits: u64 }, BindingAccumulator { index: u32, bits: u64 }, BindingTargetSlot { index: u32, value: u32 },
    PendulumAngle { index: u32, bits: u64 }, PendulumVelocity { index: u32, bits: u64 }, PhysicsAccumulator(u64),
    ParameterCurrent { index: u32, bits: u64 }, ParameterPrevious { index: u32, bits: u64 }, BonePresence { index: u32, value: u32 }, BoneAngle { index: u32, bits: u64 }, BoneY { index: u32, bits: u64 },
    SkinBoneSlot { index: u32, value: u32 }, WorldPostLogicalLength(u32), BoneSpecAngle { index: u32, bits: u64 },
    ReservationDenial { site: &'static str, owner: Option<u32>, ordinal: u32, additional: u32 },
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct InjectionExpected { pub source: SourceRef, pub phase: InjectionPhase, pub value: InjectionValue }
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct CaseExpected {
    pub index: u32, pub scenario: &'static str, pub variant: &'static str, pub class: CaseClass, pub wasm_eligible: bool,
    pub source: SourceRef, pub input_source: SourceRef, pub action_source: SourceRef,
    pub actions: &'static [ActionExpected], pub injections: &'static [InjectionExpected], pub steps: &'static [StepExpected],
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct RawPrimitiveExpected { pub source: SourceRef, pub opcode: u32, pub operands: &'static [u64], pub result: u64 }
