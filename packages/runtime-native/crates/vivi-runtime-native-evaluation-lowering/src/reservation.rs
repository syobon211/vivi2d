use std::alloc::Layout;

use crate::error::{EvaluationLoweringError, EvaluationLoweringErrorKind};
use crate::model::{
    AffineV1, BindInverseV1, BindingPointV1, BindingSpecV1, BindingTargetV1, BoneOverrideV1,
    BoneSpecV1, Category9ReservationPlanV1, CheckedIndexV1, D32BitsV1, D64BitsV1,
    DirectMeshRecordV1, IkConstraintV1, IkScratchV1, InlineIkControllerV1, InlinePhysicsGroupV1,
    MeshEvaluatorSpecV1, ParameterSpecV1, PendulumConfigV1, PendulumStateV1, PhysicsInputV1,
    PhysicsOutputV1, PresetSpecV1, PresetValueV1, SkinMeshSpecV1, SkinWeightRowV1, SkinWeightV1,
    SlotV1, StagedValueV1,
};

pub(crate) const CATEGORY9_ALLOCATION_SITE_COUNT: usize = 39;
const COMMON_LOGICAL_BYTE_CEILING: u64 = 0x7fff_ffff;

#[repr(u8)]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum ReservationSiteV1 {
    DirectMeshRecords,
    DirectUnskinnedVertices,
    DirectUvs,
    DirectIndices,
    ParameterSymbolBytes,
    ParameterSpecs,
    ParameterPresetSpecs,
    ParameterPresetValues,
    BindingSpecs,
    BindingPoints,
    BindingTargets,
    BoneSpecs,
    BoneWorldOrderSlots,
    MeshEvaluatorSpecs,
    SkinMeshSpecs,
    PhysicsPendulumConfigs,
    PhysicsInputs,
    PhysicsOutputs,
    IkConstraints,
    SkinWeightRows,
    SkinWeights,
    SkinBindInverses,
    SkinRestCoordinates,
    ParameterCurrent,
    ParameterPrevious,
    ParameterUpdate,
    ParameterStagedDestinations,
    BindingAccumulators,
    BoneCommittedOverrides,
    BoneUpdateOverrides,
    BoneStagedDestinations,
    PhysicsCommittedPendulums,
    PhysicsUpdatePendulums,
    WorldPre,
    WorldPost,
    IkScratch,
    SkinSkinnedScratch,
    DerivedCommittedCoordinates,
    DerivedUpdateCoordinates,
}

impl ReservationSiteV1 {
    pub(crate) const ALL: [Self; CATEGORY9_ALLOCATION_SITE_COUNT] = [
        Self::DirectMeshRecords,
        Self::DirectUnskinnedVertices,
        Self::DirectUvs,
        Self::DirectIndices,
        Self::ParameterSymbolBytes,
        Self::ParameterSpecs,
        Self::ParameterPresetSpecs,
        Self::ParameterPresetValues,
        Self::BindingSpecs,
        Self::BindingPoints,
        Self::BindingTargets,
        Self::BoneSpecs,
        Self::BoneWorldOrderSlots,
        Self::MeshEvaluatorSpecs,
        Self::SkinMeshSpecs,
        Self::PhysicsPendulumConfigs,
        Self::PhysicsInputs,
        Self::PhysicsOutputs,
        Self::IkConstraints,
        Self::SkinWeightRows,
        Self::SkinWeights,
        Self::SkinBindInverses,
        Self::SkinRestCoordinates,
        Self::ParameterCurrent,
        Self::ParameterPrevious,
        Self::ParameterUpdate,
        Self::ParameterStagedDestinations,
        Self::BindingAccumulators,
        Self::BoneCommittedOverrides,
        Self::BoneUpdateOverrides,
        Self::BoneStagedDestinations,
        Self::PhysicsCommittedPendulums,
        Self::PhysicsUpdatePendulums,
        Self::WorldPre,
        Self::WorldPost,
        Self::IkScratch,
        Self::SkinSkinnedScratch,
        Self::DerivedCommittedCoordinates,
        Self::DerivedUpdateCoordinates,
    ];

    pub(crate) const fn index(self) -> usize {
        self as usize
    }

    #[cfg(test)]
    pub(crate) const fn id(self) -> &'static str {
        match self {
            Self::DirectMeshRecords => "direct.mesh-records",
            Self::DirectUnskinnedVertices => "direct.unskinned-vertices",
            Self::DirectUvs => "direct.uvs",
            Self::DirectIndices => "direct.indices",
            Self::ParameterSymbolBytes => "parameter.symbol-bytes",
            Self::ParameterSpecs => "parameter.specs",
            Self::ParameterPresetSpecs => "parameter.preset-specs",
            Self::ParameterPresetValues => "parameter.preset-values",
            Self::BindingSpecs => "binding.specs",
            Self::BindingPoints => "binding.points",
            Self::BindingTargets => "binding.targets",
            Self::BoneSpecs => "bone.specs",
            Self::BoneWorldOrderSlots => "bone.world-order-slots",
            Self::MeshEvaluatorSpecs => "mesh.evaluator-specs",
            Self::SkinMeshSpecs => "skin.mesh-specs",
            Self::PhysicsPendulumConfigs => "physics.pendulum-configs",
            Self::PhysicsInputs => "physics.inputs",
            Self::PhysicsOutputs => "physics.outputs",
            Self::IkConstraints => "ik.constraints",
            Self::SkinWeightRows => "skin.weight-rows",
            Self::SkinWeights => "skin.weights",
            Self::SkinBindInverses => "skin.bind-inverses",
            Self::SkinRestCoordinates => "skin.rest-coordinates",
            Self::ParameterCurrent => "parameter.current",
            Self::ParameterPrevious => "parameter.previous",
            Self::ParameterUpdate => "parameter.update",
            Self::ParameterStagedDestinations => "parameter.staged-destinations",
            Self::BindingAccumulators => "binding.accumulators",
            Self::BoneCommittedOverrides => "bone.committed-overrides",
            Self::BoneUpdateOverrides => "bone.update-overrides",
            Self::BoneStagedDestinations => "bone.staged-destinations",
            Self::PhysicsCommittedPendulums => "physics.committed-pendulums",
            Self::PhysicsUpdatePendulums => "physics.update-pendulums",
            Self::WorldPre => "world.pre",
            Self::WorldPost => "world.post",
            Self::IkScratch => "ik.scratch",
            Self::SkinSkinnedScratch => "skin.skinned-scratch",
            Self::DerivedCommittedCoordinates => "derived.committed-coordinates",
            Self::DerivedUpdateCoordinates => "derived.update-coordinates",
        }
    }

    pub(crate) const fn element_bytes(self) -> u64 {
        match self {
            Self::ParameterSymbolBytes => 1,
            Self::DirectUnskinnedVertices
            | Self::DirectUvs
            | Self::DirectIndices
            | Self::BoneWorldOrderSlots
            | Self::DerivedCommittedCoordinates
            | Self::DerivedUpdateCoordinates => 4,
            Self::SkinWeightRows
            | Self::SkinRestCoordinates
            | Self::ParameterCurrent
            | Self::ParameterPrevious
            | Self::ParameterUpdate
            | Self::BindingAccumulators
            | Self::SkinSkinnedScratch => 8,
            Self::ParameterPresetSpecs
            | Self::ParameterPresetValues
            | Self::BindingSpecs
            | Self::BindingPoints
            | Self::PhysicsInputs
            | Self::SkinWeights
            | Self::ParameterStagedDestinations
            | Self::BoneStagedDestinations
            | Self::PhysicsCommittedPendulums
            | Self::PhysicsUpdatePendulums => 16,
            Self::BindingTargets
            | Self::PhysicsPendulumConfigs
            | Self::PhysicsOutputs
            | Self::IkConstraints => 24,
            Self::MeshEvaluatorSpecs => 32,
            Self::ParameterSpecs | Self::SkinMeshSpecs | Self::IkScratch => 40,
            Self::BoneCommittedOverrides
            | Self::BoneUpdateOverrides
            | Self::WorldPre
            | Self::WorldPost => 48,
            Self::SkinBindInverses => 56,
            Self::BoneSpecs => 64,
            Self::DirectMeshRecords => 80,
        }
    }

    fn array_layout(self, count: usize) -> Result<Layout, std::alloc::LayoutError> {
        match self {
            Self::DirectMeshRecords => Layout::array::<DirectMeshRecordV1>(count),
            Self::DirectUnskinnedVertices => Layout::array::<D32BitsV1>(count),
            Self::DirectUvs => Layout::array::<D32BitsV1>(count),
            Self::DirectIndices => Layout::array::<CheckedIndexV1>(count),
            Self::ParameterSymbolBytes => Layout::array::<u8>(count),
            Self::ParameterSpecs => Layout::array::<ParameterSpecV1>(count),
            Self::ParameterPresetSpecs => Layout::array::<PresetSpecV1>(count),
            Self::ParameterPresetValues => Layout::array::<PresetValueV1>(count),
            Self::BindingSpecs => Layout::array::<BindingSpecV1>(count),
            Self::BindingPoints => Layout::array::<BindingPointV1>(count),
            Self::BindingTargets => Layout::array::<BindingTargetV1>(count),
            Self::BoneSpecs => Layout::array::<BoneSpecV1>(count),
            Self::BoneWorldOrderSlots => Layout::array::<SlotV1>(count),
            Self::MeshEvaluatorSpecs => Layout::array::<MeshEvaluatorSpecV1>(count),
            Self::SkinMeshSpecs => Layout::array::<SkinMeshSpecV1>(count),
            Self::PhysicsPendulumConfigs => Layout::array::<PendulumConfigV1>(count),
            Self::PhysicsInputs => Layout::array::<PhysicsInputV1>(count),
            Self::PhysicsOutputs => Layout::array::<PhysicsOutputV1>(count),
            Self::IkConstraints => Layout::array::<IkConstraintV1>(count),
            Self::SkinWeightRows => Layout::array::<SkinWeightRowV1>(count),
            Self::SkinWeights => Layout::array::<SkinWeightV1>(count),
            Self::SkinBindInverses => Layout::array::<BindInverseV1>(count),
            Self::SkinRestCoordinates => Layout::array::<D64BitsV1>(count),
            Self::ParameterCurrent => Layout::array::<D64BitsV1>(count),
            Self::ParameterPrevious => Layout::array::<D64BitsV1>(count),
            Self::ParameterUpdate => Layout::array::<D64BitsV1>(count),
            Self::ParameterStagedDestinations => Layout::array::<StagedValueV1>(count),
            Self::BindingAccumulators => Layout::array::<D64BitsV1>(count),
            Self::BoneCommittedOverrides => Layout::array::<BoneOverrideV1>(count),
            Self::BoneUpdateOverrides => Layout::array::<BoneOverrideV1>(count),
            Self::BoneStagedDestinations => Layout::array::<StagedValueV1>(count),
            Self::PhysicsCommittedPendulums => Layout::array::<PendulumStateV1>(count),
            Self::PhysicsUpdatePendulums => Layout::array::<PendulumStateV1>(count),
            Self::WorldPre => Layout::array::<AffineV1>(count),
            Self::WorldPost => Layout::array::<AffineV1>(count),
            Self::IkScratch => Layout::array::<IkScratchV1>(count),
            Self::SkinSkinnedScratch => Layout::array::<D64BitsV1>(count),
            Self::DerivedCommittedCoordinates => Layout::array::<D32BitsV1>(count),
            Self::DerivedUpdateCoordinates => Layout::array::<D32BitsV1>(count),
        }
    }
}

#[allow(dead_code)]
pub(crate) struct Category9SiteCountsV1 {
    counts: [u32; CATEGORY9_ALLOCATION_SITE_COUNT],
    usize_counts: [usize; CATEGORY9_ALLOCATION_SITE_COUNT],
    logical_bytes: [u64; CATEGORY9_ALLOCATION_SITE_COUNT],
    total_logical_bytes: u64,
}

impl Category9SiteCountsV1 {
    pub(crate) fn try_from_ordered(
        counts: [u32; CATEGORY9_ALLOCATION_SITE_COUNT],
    ) -> Result<Self, EvaluationLoweringError> {
        let mut usize_counts = [0; CATEGORY9_ALLOCATION_SITE_COUNT];
        let mut logical_bytes = [0; CATEGORY9_ALLOCATION_SITE_COUNT];
        let mut total_logical_bytes = 0_u64;

        // Programs 42-80: complete every checked site-byte product first.
        for site in ReservationSiteV1::ALL {
            let index = site.index();
            logical_bytes[index] = u64::from(counts[index])
                .checked_mul(site.element_bytes())
                .ok_or_else(resource)?;
        }
        // Program 81: fold the completed products in allocation-site order.
        for site in ReservationSiteV1::ALL {
            let index = site.index();
            total_logical_bytes = total_logical_bytes
                .checked_add(logical_bytes[index])
                .ok_or_else(resource)?;
        }
        if total_logical_bytes > COMMON_LOGICAL_BYTE_CEILING {
            return Err(resource());
        }

        // Program 82: target-width and exact typed-layout defenses.
        for site in ReservationSiteV1::ALL {
            let index = site.index();
            let count = usize::try_from(counts[index]).map_err(|_| resource())?;
            let layout = site.array_layout(count).map_err(|_| resource())?;
            let layout_bytes = u64::try_from(layout.size()).map_err(|_| resource())?;
            let target_isize_max = usize::try_from(isize::MAX).map_err(|_| resource())?;
            if layout_bytes != logical_bytes[index] || layout.size() > target_isize_max {
                return Err(resource());
            }
            usize_counts[index] = count;
        }

        Ok(Self {
            counts,
            usize_counts,
            logical_bytes,
            total_logical_bytes,
        })
    }

    pub(crate) const fn count(&self, site: ReservationSiteV1) -> u32 {
        self.counts[site.index()]
    }

    pub(crate) const fn count_usize(&self, site: ReservationSiteV1) -> usize {
        self.usize_counts[site.index()]
    }

    #[allow(dead_code)]
    pub(crate) const fn logical_bytes(&self, site: ReservationSiteV1) -> u64 {
        self.logical_bytes[site.index()]
    }

    #[allow(dead_code)]
    pub(crate) const fn total_logical_bytes(&self) -> u64 {
        self.total_logical_bytes
    }

    #[allow(dead_code)]
    pub(crate) const fn ordered_counts(&self) -> &[u32; CATEGORY9_ALLOCATION_SITE_COUNT] {
        &self.counts
    }
}

#[cfg(test)]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct ReservationDenialKeyV1 {
    pub(crate) site_template_id: &'static str,
    pub(crate) owner_slot: Option<u32>,
    pub(crate) attempt_ordinal: u32,
    pub(crate) additional_count: u32,
}

struct ReservationStateV1 {
    attempt_ordinal: u32,
    #[cfg(test)]
    denial: Option<ReservationDenialKeyV1>,
}

impl ReservationStateV1 {
    const fn production() -> Self {
        Self {
            attempt_ordinal: 0,
            #[cfg(test)]
            denial: None,
        }
    }

    #[cfg(test)]
    const fn with_denial(denial: ReservationDenialKeyV1) -> Self {
        Self {
            attempt_ordinal: 0,
            denial: Some(denial),
        }
    }

    fn begin_nonzero_attempt(
        &mut self,
        site: ReservationSiteV1,
        additional_count: u32,
    ) -> Result<(), EvaluationLoweringError> {
        let attempt_ordinal = self.attempt_ordinal;
        self.attempt_ordinal = self.attempt_ordinal.checked_add(1).ok_or_else(resource)?;

        #[cfg(test)]
        if self.denial
            == Some(ReservationDenialKeyV1 {
                site_template_id: site.id(),
                owner_slot: None,
                attempt_ordinal,
                additional_count,
            })
        {
            return Err(resource());
        }

        #[cfg(not(test))]
        let _ = (site, attempt_ordinal, additional_count);
        Ok(())
    }
}

#[allow(dead_code)]
pub(crate) struct Category9ReservationBuffersV1 {
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
    reserved_capacities: [usize; CATEGORY9_ALLOCATION_SITE_COUNT],
}

impl Category9ReservationBuffersV1 {
    pub(crate) fn reserve_all(
        counts: &Category9SiteCountsV1,
    ) -> Result<Self, EvaluationLoweringError> {
        let mut state = ReservationStateV1::production();
        Self::reserve_all_with_state(counts, &mut state)
    }

    #[cfg(test)]
    pub(crate) fn reserve_all_with_test_denial(
        counts: &Category9SiteCountsV1,
        denial: ReservationDenialKeyV1,
    ) -> Result<Self, EvaluationLoweringError> {
        let mut state = ReservationStateV1::with_denial(denial);
        Self::reserve_all_with_state(counts, &mut state)
    }

    fn reserve_all_with_state(
        counts: &Category9SiteCountsV1,
        state: &mut ReservationStateV1,
    ) -> Result<Self, EvaluationLoweringError> {
        let mut buffers = Self::empty();
        reserve_one(
            &mut buffers.direct_mesh_records,
            ReservationSiteV1::DirectMeshRecords,
            counts,
            state,
        )?;
        reserve_one(
            &mut buffers.direct_unskinned_vertices,
            ReservationSiteV1::DirectUnskinnedVertices,
            counts,
            state,
        )?;
        reserve_one(
            &mut buffers.direct_uvs,
            ReservationSiteV1::DirectUvs,
            counts,
            state,
        )?;
        reserve_one(
            &mut buffers.direct_indices,
            ReservationSiteV1::DirectIndices,
            counts,
            state,
        )?;
        reserve_one(
            &mut buffers.parameter_symbol_bytes,
            ReservationSiteV1::ParameterSymbolBytes,
            counts,
            state,
        )?;
        reserve_one(
            &mut buffers.parameter_specs,
            ReservationSiteV1::ParameterSpecs,
            counts,
            state,
        )?;
        reserve_one(
            &mut buffers.parameter_preset_specs,
            ReservationSiteV1::ParameterPresetSpecs,
            counts,
            state,
        )?;
        reserve_one(
            &mut buffers.parameter_preset_values,
            ReservationSiteV1::ParameterPresetValues,
            counts,
            state,
        )?;
        reserve_one(
            &mut buffers.binding_specs,
            ReservationSiteV1::BindingSpecs,
            counts,
            state,
        )?;
        reserve_one(
            &mut buffers.binding_points,
            ReservationSiteV1::BindingPoints,
            counts,
            state,
        )?;
        reserve_one(
            &mut buffers.binding_targets,
            ReservationSiteV1::BindingTargets,
            counts,
            state,
        )?;
        reserve_one(
            &mut buffers.bone_specs,
            ReservationSiteV1::BoneSpecs,
            counts,
            state,
        )?;
        reserve_one(
            &mut buffers.bone_world_order_slots,
            ReservationSiteV1::BoneWorldOrderSlots,
            counts,
            state,
        )?;
        reserve_one(
            &mut buffers.mesh_evaluator_specs,
            ReservationSiteV1::MeshEvaluatorSpecs,
            counts,
            state,
        )?;
        reserve_one(
            &mut buffers.skin_mesh_specs,
            ReservationSiteV1::SkinMeshSpecs,
            counts,
            state,
        )?;
        reserve_one(
            &mut buffers.physics_pendulum_configs,
            ReservationSiteV1::PhysicsPendulumConfigs,
            counts,
            state,
        )?;
        reserve_one(
            &mut buffers.physics_inputs,
            ReservationSiteV1::PhysicsInputs,
            counts,
            state,
        )?;
        reserve_one(
            &mut buffers.physics_outputs,
            ReservationSiteV1::PhysicsOutputs,
            counts,
            state,
        )?;
        reserve_one(
            &mut buffers.ik_constraints,
            ReservationSiteV1::IkConstraints,
            counts,
            state,
        )?;
        reserve_one(
            &mut buffers.skin_weight_rows,
            ReservationSiteV1::SkinWeightRows,
            counts,
            state,
        )?;
        reserve_one(
            &mut buffers.skin_weights,
            ReservationSiteV1::SkinWeights,
            counts,
            state,
        )?;
        reserve_one(
            &mut buffers.skin_bind_inverses,
            ReservationSiteV1::SkinBindInverses,
            counts,
            state,
        )?;
        reserve_one(
            &mut buffers.skin_rest_coordinates,
            ReservationSiteV1::SkinRestCoordinates,
            counts,
            state,
        )?;
        reserve_one(
            &mut buffers.parameter_current,
            ReservationSiteV1::ParameterCurrent,
            counts,
            state,
        )?;
        reserve_one(
            &mut buffers.parameter_previous,
            ReservationSiteV1::ParameterPrevious,
            counts,
            state,
        )?;
        reserve_one(
            &mut buffers.parameter_update,
            ReservationSiteV1::ParameterUpdate,
            counts,
            state,
        )?;
        reserve_one(
            &mut buffers.parameter_staged_destinations,
            ReservationSiteV1::ParameterStagedDestinations,
            counts,
            state,
        )?;
        reserve_one(
            &mut buffers.binding_accumulators,
            ReservationSiteV1::BindingAccumulators,
            counts,
            state,
        )?;
        reserve_one(
            &mut buffers.bone_committed_overrides,
            ReservationSiteV1::BoneCommittedOverrides,
            counts,
            state,
        )?;
        reserve_one(
            &mut buffers.bone_update_overrides,
            ReservationSiteV1::BoneUpdateOverrides,
            counts,
            state,
        )?;
        reserve_one(
            &mut buffers.bone_staged_destinations,
            ReservationSiteV1::BoneStagedDestinations,
            counts,
            state,
        )?;
        reserve_one(
            &mut buffers.physics_committed_pendulums,
            ReservationSiteV1::PhysicsCommittedPendulums,
            counts,
            state,
        )?;
        reserve_one(
            &mut buffers.physics_update_pendulums,
            ReservationSiteV1::PhysicsUpdatePendulums,
            counts,
            state,
        )?;
        reserve_one(
            &mut buffers.world_pre,
            ReservationSiteV1::WorldPre,
            counts,
            state,
        )?;
        reserve_one(
            &mut buffers.world_post,
            ReservationSiteV1::WorldPost,
            counts,
            state,
        )?;
        reserve_one(
            &mut buffers.ik_scratch,
            ReservationSiteV1::IkScratch,
            counts,
            state,
        )?;
        reserve_one(
            &mut buffers.skin_skinned_scratch,
            ReservationSiteV1::SkinSkinnedScratch,
            counts,
            state,
        )?;
        reserve_one(
            &mut buffers.derived_committed_coordinates,
            ReservationSiteV1::DerivedCommittedCoordinates,
            counts,
            state,
        )?;
        reserve_one(
            &mut buffers.derived_update_coordinates,
            ReservationSiteV1::DerivedUpdateCoordinates,
            counts,
            state,
        )?;
        buffers.reserved_capacities = buffers.capacities();
        Ok(buffers)
    }

    pub(crate) fn finish(
        self,
        inline_physics_group: InlinePhysicsGroupV1,
        inline_ik_controller: InlineIkControllerV1,
    ) -> (
        Category9ReservationPlanV1,
        [usize; CATEGORY9_ALLOCATION_SITE_COUNT],
    ) {
        let reserved_capacities = self.reserved_capacities;
        let plan = Category9ReservationPlanV1 {
            direct_mesh_records: self.direct_mesh_records,
            direct_unskinned_vertices: self.direct_unskinned_vertices,
            direct_uvs: self.direct_uvs,
            direct_indices: self.direct_indices,
            parameter_symbol_bytes: self.parameter_symbol_bytes,
            parameter_specs: self.parameter_specs,
            parameter_preset_specs: self.parameter_preset_specs,
            parameter_preset_values: self.parameter_preset_values,
            binding_specs: self.binding_specs,
            binding_points: self.binding_points,
            binding_targets: self.binding_targets,
            bone_specs: self.bone_specs,
            bone_world_order_slots: self.bone_world_order_slots,
            mesh_evaluator_specs: self.mesh_evaluator_specs,
            skin_mesh_specs: self.skin_mesh_specs,
            physics_pendulum_configs: self.physics_pendulum_configs,
            physics_inputs: self.physics_inputs,
            physics_outputs: self.physics_outputs,
            ik_constraints: self.ik_constraints,
            skin_weight_rows: self.skin_weight_rows,
            skin_weights: self.skin_weights,
            skin_bind_inverses: self.skin_bind_inverses,
            skin_rest_coordinates: self.skin_rest_coordinates,
            parameter_current: self.parameter_current,
            parameter_previous: self.parameter_previous,
            parameter_update: self.parameter_update,
            parameter_staged_destinations: self.parameter_staged_destinations,
            binding_accumulators: self.binding_accumulators,
            bone_committed_overrides: self.bone_committed_overrides,
            bone_update_overrides: self.bone_update_overrides,
            bone_staged_destinations: self.bone_staged_destinations,
            physics_committed_pendulums: self.physics_committed_pendulums,
            physics_update_pendulums: self.physics_update_pendulums,
            world_pre: self.world_pre,
            world_post: self.world_post,
            ik_scratch: self.ik_scratch,
            skin_skinned_scratch: self.skin_skinned_scratch,
            derived_committed_coordinates: self.derived_committed_coordinates,
            derived_update_coordinates: self.derived_update_coordinates,
            inline_physics_group,
            inline_ik_controller,
        };
        (plan, reserved_capacities)
    }

    pub(crate) fn verify_plan(
        plan: &Category9ReservationPlanV1,
        counts: &Category9SiteCountsV1,
        reserved_capacities: &[usize; CATEGORY9_ALLOCATION_SITE_COUNT],
    ) -> Result<(), EvaluationLoweringError> {
        let actual_lengths = plan.lengths();
        let actual_capacities = plan.capacities();
        for site in ReservationSiteV1::ALL {
            let index = site.index();
            if actual_lengths[index] != counts.count_usize(site)
                || actual_capacities[index] != reserved_capacities[index]
                || actual_capacities[index] < actual_lengths[index]
            {
                return Err(internal());
            }
        }
        Ok(())
    }

    #[cfg(test)]
    pub(crate) fn verify_plan_with_current_capacities_for_test(
        plan: &Category9ReservationPlanV1,
        counts: &Category9SiteCountsV1,
    ) -> Result<(), EvaluationLoweringError> {
        let reserved_capacities = plan.capacities();
        Self::verify_plan(plan, counts, &reserved_capacities)
    }

    fn empty() -> Self {
        Self {
            direct_mesh_records: Vec::new(),
            direct_unskinned_vertices: Vec::new(),
            direct_uvs: Vec::new(),
            direct_indices: Vec::new(),
            parameter_symbol_bytes: Vec::new(),
            parameter_specs: Vec::new(),
            parameter_preset_specs: Vec::new(),
            parameter_preset_values: Vec::new(),
            binding_specs: Vec::new(),
            binding_points: Vec::new(),
            binding_targets: Vec::new(),
            bone_specs: Vec::new(),
            bone_world_order_slots: Vec::new(),
            mesh_evaluator_specs: Vec::new(),
            skin_mesh_specs: Vec::new(),
            physics_pendulum_configs: Vec::new(),
            physics_inputs: Vec::new(),
            physics_outputs: Vec::new(),
            ik_constraints: Vec::new(),
            skin_weight_rows: Vec::new(),
            skin_weights: Vec::new(),
            skin_bind_inverses: Vec::new(),
            skin_rest_coordinates: Vec::new(),
            parameter_current: Vec::new(),
            parameter_previous: Vec::new(),
            parameter_update: Vec::new(),
            parameter_staged_destinations: Vec::new(),
            binding_accumulators: Vec::new(),
            bone_committed_overrides: Vec::new(),
            bone_update_overrides: Vec::new(),
            bone_staged_destinations: Vec::new(),
            physics_committed_pendulums: Vec::new(),
            physics_update_pendulums: Vec::new(),
            world_pre: Vec::new(),
            world_post: Vec::new(),
            ik_scratch: Vec::new(),
            skin_skinned_scratch: Vec::new(),
            derived_committed_coordinates: Vec::new(),
            derived_update_coordinates: Vec::new(),
            reserved_capacities: [0; CATEGORY9_ALLOCATION_SITE_COUNT],
        }
    }

    fn capacities(&self) -> [usize; CATEGORY9_ALLOCATION_SITE_COUNT] {
        [
            self.direct_mesh_records.capacity(),
            self.direct_unskinned_vertices.capacity(),
            self.direct_uvs.capacity(),
            self.direct_indices.capacity(),
            self.parameter_symbol_bytes.capacity(),
            self.parameter_specs.capacity(),
            self.parameter_preset_specs.capacity(),
            self.parameter_preset_values.capacity(),
            self.binding_specs.capacity(),
            self.binding_points.capacity(),
            self.binding_targets.capacity(),
            self.bone_specs.capacity(),
            self.bone_world_order_slots.capacity(),
            self.mesh_evaluator_specs.capacity(),
            self.skin_mesh_specs.capacity(),
            self.physics_pendulum_configs.capacity(),
            self.physics_inputs.capacity(),
            self.physics_outputs.capacity(),
            self.ik_constraints.capacity(),
            self.skin_weight_rows.capacity(),
            self.skin_weights.capacity(),
            self.skin_bind_inverses.capacity(),
            self.skin_rest_coordinates.capacity(),
            self.parameter_current.capacity(),
            self.parameter_previous.capacity(),
            self.parameter_update.capacity(),
            self.parameter_staged_destinations.capacity(),
            self.binding_accumulators.capacity(),
            self.bone_committed_overrides.capacity(),
            self.bone_update_overrides.capacity(),
            self.bone_staged_destinations.capacity(),
            self.physics_committed_pendulums.capacity(),
            self.physics_update_pendulums.capacity(),
            self.world_pre.capacity(),
            self.world_post.capacity(),
            self.ik_scratch.capacity(),
            self.skin_skinned_scratch.capacity(),
            self.derived_committed_coordinates.capacity(),
            self.derived_update_coordinates.capacity(),
        ]
    }
}

impl Category9ReservationPlanV1 {
    fn lengths(&self) -> [usize; CATEGORY9_ALLOCATION_SITE_COUNT] {
        [
            self.direct_mesh_records.len(),
            self.direct_unskinned_vertices.len(),
            self.direct_uvs.len(),
            self.direct_indices.len(),
            self.parameter_symbol_bytes.len(),
            self.parameter_specs.len(),
            self.parameter_preset_specs.len(),
            self.parameter_preset_values.len(),
            self.binding_specs.len(),
            self.binding_points.len(),
            self.binding_targets.len(),
            self.bone_specs.len(),
            self.bone_world_order_slots.len(),
            self.mesh_evaluator_specs.len(),
            self.skin_mesh_specs.len(),
            self.physics_pendulum_configs.len(),
            self.physics_inputs.len(),
            self.physics_outputs.len(),
            self.ik_constraints.len(),
            self.skin_weight_rows.len(),
            self.skin_weights.len(),
            self.skin_bind_inverses.len(),
            self.skin_rest_coordinates.len(),
            self.parameter_current.len(),
            self.parameter_previous.len(),
            self.parameter_update.len(),
            self.parameter_staged_destinations.len(),
            self.binding_accumulators.len(),
            self.bone_committed_overrides.len(),
            self.bone_update_overrides.len(),
            self.bone_staged_destinations.len(),
            self.physics_committed_pendulums.len(),
            self.physics_update_pendulums.len(),
            self.world_pre.len(),
            self.world_post.len(),
            self.ik_scratch.len(),
            self.skin_skinned_scratch.len(),
            self.derived_committed_coordinates.len(),
            self.derived_update_coordinates.len(),
        ]
    }

    fn capacities(&self) -> [usize; CATEGORY9_ALLOCATION_SITE_COUNT] {
        [
            self.direct_mesh_records.capacity(),
            self.direct_unskinned_vertices.capacity(),
            self.direct_uvs.capacity(),
            self.direct_indices.capacity(),
            self.parameter_symbol_bytes.capacity(),
            self.parameter_specs.capacity(),
            self.parameter_preset_specs.capacity(),
            self.parameter_preset_values.capacity(),
            self.binding_specs.capacity(),
            self.binding_points.capacity(),
            self.binding_targets.capacity(),
            self.bone_specs.capacity(),
            self.bone_world_order_slots.capacity(),
            self.mesh_evaluator_specs.capacity(),
            self.skin_mesh_specs.capacity(),
            self.physics_pendulum_configs.capacity(),
            self.physics_inputs.capacity(),
            self.physics_outputs.capacity(),
            self.ik_constraints.capacity(),
            self.skin_weight_rows.capacity(),
            self.skin_weights.capacity(),
            self.skin_bind_inverses.capacity(),
            self.skin_rest_coordinates.capacity(),
            self.parameter_current.capacity(),
            self.parameter_previous.capacity(),
            self.parameter_update.capacity(),
            self.parameter_staged_destinations.capacity(),
            self.binding_accumulators.capacity(),
            self.bone_committed_overrides.capacity(),
            self.bone_update_overrides.capacity(),
            self.bone_staged_destinations.capacity(),
            self.physics_committed_pendulums.capacity(),
            self.physics_update_pendulums.capacity(),
            self.world_pre.capacity(),
            self.world_post.capacity(),
            self.ik_scratch.capacity(),
            self.skin_skinned_scratch.capacity(),
            self.derived_committed_coordinates.capacity(),
            self.derived_update_coordinates.capacity(),
        ]
    }
}

fn reserve_one<T>(
    values: &mut Vec<T>,
    site: ReservationSiteV1,
    counts: &Category9SiteCountsV1,
    state: &mut ReservationStateV1,
) -> Result<(), EvaluationLoweringError> {
    let additional_count = counts.count(site);
    if additional_count == 0 {
        return Ok(());
    }
    state.begin_nonzero_attempt(site, additional_count)?;
    values
        .try_reserve_exact(counts.count_usize(site))
        .map_err(|_| resource())?;
    Ok(())
}

const fn resource() -> EvaluationLoweringError {
    EvaluationLoweringError::new(EvaluationLoweringErrorKind::ResourceLimitExceeded)
}

const fn internal() -> EvaluationLoweringError {
    EvaluationLoweringError::new(EvaluationLoweringErrorKind::Internal)
}

const _: () = {
    assert!(ReservationSiteV1::ALL.len() == CATEGORY9_ALLOCATION_SITE_COUNT);
    let mut index = 0;
    while index < CATEGORY9_ALLOCATION_SITE_COUNT {
        assert!(ReservationSiteV1::ALL[index].index() == index);
        index += 1;
    }
};
