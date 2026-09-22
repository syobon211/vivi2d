//! Checked borrowed views; no projection, evaluation or buffer duplication.

use std::fmt;

use crate::model::{CheckedIndexV1, D32BitsV1, DirectMeshRecordV1, NONE_SLOT_V1};
use crate::topology::{internal, slice};
use crate::{EvaluationLoweringError, SealedEvaluationCandidateV1};

/// Borrowed, checked mesh data. Identity/value access is authorized model data,
/// not sanitized logging; Debug deliberately omits those values.
pub struct EvaluationMeshSnapshotV1<'a> {
    id: &'a str,
    mesh_slot: u32,
    texture_slot: u32,
    vertices: &'a [D32BitsV1],
    uvs: &'a [D32BitsV1],
    indices: &'a [CheckedIndexV1],
    direct: &'a DirectMeshRecordV1,
    visible: bool,
    culled: bool,
}

impl EvaluationMeshSnapshotV1<'_> {
    /// Exact payload identity, without normalization.
    pub const fn id(&self) -> &str {
        self.id
    }
    /// Stable recursive payload slot.
    pub const fn mesh_slot(&self) -> u32 {
        self.mesh_slot
    }
    /// Exact correlated texture-plan slot.
    pub const fn texture_slot(&self) -> u32 {
        self.texture_slot
    }
    /// Borrowed projected x/y components as their binary32 bit patterns.
    pub fn vertex_bits(&self) -> impl ExactSizeIterator<Item = u32> + '_ {
        self.vertices.iter().map(|v| v.bits)
    }
    /// Borrowed UV components as their binary32 bit patterns.
    pub fn uv_bits(&self) -> impl ExactSizeIterator<Item = u32> + '_ {
        self.uvs.iter().map(|v| v.bits)
    }
    /// Borrowed checked triangle indices.
    pub fn indices(&self) -> impl ExactSizeIterator<Item = u32> + '_ {
        self.indices.iter().map(|v| v.value)
    }
    /// Binary32 translation; skinned geometry uses positive zero.
    pub fn translation_bits(&self) -> [u32; 2] {
        [self.direct.x.bits, self.direct.y.bits]
    }
    /// Binary32 opacity.
    pub const fn opacity_bits(&self) -> u32 {
        self.direct.opacity.bits
    }
    /// Optional binary32 multiply-color components.
    pub fn multiply_bits(&self) -> Option<[u32; 3]> {
        (self.direct.flags & 2 != 0).then(|| self.direct.multiply.map(|v| v.bits))
    }
    /// Optional binary32 screen-color components.
    pub fn screen_bits(&self) -> Option<[u32; 3]> {
        (self.direct.flags & 4 != 0).then(|| self.direct.screen.map(|v| v.bits))
    }
    /// Frozen blend code in the supported range zero through three.
    pub const fn blend(&self) -> u32 {
        self.direct.blend
    }
    /// Committed draw visibility, including the evaluation's culling result.
    pub const fn visible(&self) -> bool {
        self.visible
    }
    /// Current committed evaluation culling result, independent of topology.
    pub const fn culled(&self) -> bool {
        self.culled
    }
}

impl fmt::Debug for EvaluationMeshSnapshotV1<'_> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("EvaluationMeshSnapshotV1")
            .field("vertex_components", &self.vertices.len())
            .field("index_count", &self.indices.len())
            .finish()
    }
}

/// Borrowed parameter identity and exact binary64 input/evaluated values.
pub struct EvaluationParameterSnapshotV1<'a> {
    id: &'a str,
    min: u64,
    max: u64,
    default: u64,
    current: u64,
    evaluated: u64,
}
impl EvaluationParameterSnapshotV1<'_> {
    /// Exact identity; not a redacted diagnostic.
    pub const fn id(&self) -> &str {
        self.id
    }
    /// Declared minimum raw bits.
    pub const fn min_bits(&self) -> u64 {
        self.min
    }
    /// Declared maximum raw bits.
    pub const fn max_bits(&self) -> u64 {
        self.max
    }
    /// Declared default raw bits.
    pub const fn default_bits(&self) -> u64 {
        self.default
    }
    /// Caller-current input, including a setter before a failed update.
    pub const fn current_bits(&self) -> u64 {
        self.current
    }
    /// Last successfully evaluated output, not caller-current scratch.
    pub const fn evaluated_bits(&self) -> u64 {
        self.evaluated
    }
}
impl fmt::Debug for EvaluationParameterSnapshotV1<'_> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("EvaluationParameterSnapshotV1")
    }
}

pub(crate) fn mesh(
    candidate: &SealedEvaluationCandidateV1,
    slot: usize,
) -> Result<Option<EvaluationMeshSnapshotV1<'_>>, EvaluationLoweringError> {
    let Some(topology) = candidate.topology.meshes.get(slot) else {
        return Ok(None);
    };
    let plan = &candidate.derived.foundation.reservation_plan;
    let direct = plan.direct_mesh_records.get(slot).ok_or_else(internal)?;
    let evaluator = plan.mesh_evaluator_specs.get(slot).ok_or_else(internal)?;
    if topology.mesh_slot as usize != slot
        || direct.mesh_slot as usize != slot
        || evaluator.mesh_slot as usize != slot
        || topology.visible > 1
        || topology.mask_source > 1
        || direct.flags & !7 != 0
        || direct.blend > 3
        || direct.padding != [0; 2]
        || evaluator.padding != 0
        || evaluator.static_flags & !7 != 0
        || evaluator.committed_flags & !7 != 0
        || evaluator.committed_flags & 1 == 0
        || (evaluator.static_flags & 4 != 0) != (topology.visible != 0)
        || topology.texture_slot as usize
            >= candidate.derived.foundation.texture_plan.textures.len()
    {
        return Err(internal());
    }
    let skinned = evaluator.static_flags & 1 != 0;
    if (direct.flags & 1 != 0) == skinned {
        return Err(internal());
    }
    let vertices = if skinned {
        let skin = plan
            .skin_mesh_specs
            .get(evaluator.skin_slot as usize)
            .ok_or_else(internal)?;
        if skin.mesh_slot as usize != slot
            || skin.padding != 0
            || skin.derived_range != evaluator.derived_range
            || skin.rest_range.len != skin.derived_range.len
            || skin.weight_row_range.len.checked_mul(2) != Some(skin.derived_range.len)
            || direct.vertex_range.len != 0
            || direct.x.bits != 0
            || direct.y.bits != 0
        {
            return Err(internal());
        }
        slice(&plan.skin_rest_coordinates, skin.rest_range)?;
        slice(&plan.skin_weight_rows, skin.weight_row_range)?;
        slice(&plan.skin_bind_inverses, skin.bind_inverse_range)?;
        slice(&plan.derived_committed_coordinates, evaluator.derived_range)?
    } else {
        if evaluator.skin_slot != NONE_SLOT_V1 || evaluator.derived_range.len != 0 {
            return Err(internal());
        }
        slice(&plan.direct_unskinned_vertices, direct.vertex_range)?
    };
    let uvs = slice(&plan.direct_uvs, direct.uv_range)?;
    let indices = slice(&plan.direct_indices, direct.index_range)?;
    if vertices.len() % 2 != 0
        || uvs.len() != vertices.len()
        || indices.len() % 3 != 0
        || indices
            .iter()
            .any(|index| index.value as usize >= vertices.len() / 2)
    {
        return Err(internal());
    }
    if vertices.iter().chain(uvs).any(|v| !valid_d32(v.bits))
        || [direct.x, direct.y, direct.opacity]
            .iter()
            .chain(direct.multiply.iter())
            .chain(direct.screen.iter())
            .any(|v| !valid_d32(v.bits))
    {
        return Err(internal());
    }
    Ok(Some(EvaluationMeshSnapshotV1 {
        id: candidate.topology.id(slot)?,
        mesh_slot: topology.mesh_slot,
        texture_slot: topology.texture_slot,
        vertices,
        uvs,
        indices,
        direct,
        visible: evaluator.committed_flags & 4 != 0,
        culled: evaluator.committed_flags & 2 != 0,
    }))
}

pub(crate) fn parameter(
    candidate: &SealedEvaluationCandidateV1,
    slot: usize,
) -> Result<Option<EvaluationParameterSnapshotV1<'_>>, EvaluationLoweringError> {
    let plan = &candidate.derived.foundation.reservation_plan;
    let Some(spec) = plan.parameter_specs.get(slot) else {
        return Ok(None);
    };
    let id = std::str::from_utf8(slice(&plan.parameter_symbol_bytes, spec.symbol_range)?)
        .map_err(|_| internal())?;
    let current = plan.parameter_current.get(slot).ok_or_else(internal)?.bits;
    let evaluated = plan.parameter_previous.get(slot).ok_or_else(internal)?.bits;
    if spec.padding != 0
        || id.is_empty()
        || [
            spec.min.bits,
            spec.max.bits,
            spec.default.bits,
            current,
            evaluated,
        ]
        .iter()
        .any(|v| (v >> 52) & 0x7ff == 0x7ff)
    {
        return Err(internal());
    }
    Ok(Some(EvaluationParameterSnapshotV1 {
        id,
        min: spec.min.bits,
        max: spec.max.bits,
        default: spec.default.bits,
        current,
        evaluated,
    }))
}

fn valid_d32(bits: u32) -> bool {
    let magnitude = bits & 0x7fff_ffff;
    bits == 0 || (0x0080_0000..0x7f80_0000).contains(&magnitude)
}
