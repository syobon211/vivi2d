use std::fmt;

use vivi_runtime_native_preactivation::{EvaluationTexturePlanV1, ValidatedEvaluationPayloadV1};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum FoundationBlendModeV1 {
    Normal,
    Multiply,
    Screen,
    Add,
}

#[allow(dead_code)]
pub(crate) struct DirectMeshProjectionV1 {
    pub(crate) vertices: Option<Vec<f32>>,
    pub(crate) uvs: Vec<f32>,
    pub(crate) indices: Vec<u32>,
    pub(crate) x: f32,
    pub(crate) y: f32,
    pub(crate) opacity: f32,
    pub(crate) multiply_color: Option<[f32; 3]>,
    pub(crate) screen_color: Option<[f32; 3]>,
    pub(crate) blend_mode: FoundationBlendModeV1,
}

/// Owned consumer-zero result after Evaluation Lowering v1 categories 1–9.
///
/// This value is deliberately non-`Clone`, has private fields, and exposes only
/// aggregate metadata. It retains the correlated candidate and typed plan by
/// move together with direct projection records. It is **not** the contract's
/// sealed/complete lowered candidate: category-10 deterministic derived
/// evaluation, category-11 topology/invariant construction, texture host work,
/// activation, and publication remain absent.
pub struct EvaluationLoweringFoundationV1 {
    pub(crate) generation: u64,
    #[allow(dead_code)]
    pub(crate) candidate: ValidatedEvaluationPayloadV1,
    pub(crate) texture_plan: EvaluationTexturePlanV1,
    #[allow(dead_code)]
    pub(crate) canvas_width: u64,
    #[allow(dead_code)]
    pub(crate) canvas_height: u64,
    pub(crate) meshes: Vec<DirectMeshProjectionV1>,
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
        self.meshes.len()
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
            .field("mesh_count", &self.meshes.len())
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
