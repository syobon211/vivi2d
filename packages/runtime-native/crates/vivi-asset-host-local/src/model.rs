use std::fmt;

use vivi_asset_resolver::{AssetRef, ReadyPng};

pub(crate) const EVALUATION_TEXTURE_PLAN_SCHEMA_V1: &str = "vivi2d.evaluationTexturePlan.v1";
pub(crate) const PNG_PROFILE_V1: &str = "vivi2d.png.rgba8.v1";
pub(crate) const PNG_MEDIA_TYPE: &str = "image/png";
pub(crate) const SRGB_COLOR_SPACE: &str = "srgb";
pub(crate) const STRAIGHT_ALPHA_MODE: &str = "straight";

/// Exact strict-PNG attestation nested by [`VerifiedAtlasAssetV1`].
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct VerifiedPngV1 {
    pub profile: &'static str,
    pub width: u32,
    pub height: u32,
}

/// The Rust equivalent of W7a's exact `VerifiedAtlasAssetV1` DTO.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VerifiedAtlasAssetV1 {
    pub asset: AssetRef,
    pub png: VerifiedPngV1,
}

/// Readiness attestation for one referenced atlas during read-only authoring
/// initialization. Activation uses [`PrepareActivationTextureSetV1`] instead
/// and retains the complete owned resolver output.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ReferencedAtlasResolutionV1 {
    Ready(VerifiedAtlasAssetV1),
    Missing,
}

/// Typed form of the frozen `evaluation-texture-plan-v1` root object.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EvaluationTexturePlanV1 {
    pub schema: String,
    pub textures: Vec<EvaluationTextureBindingV1>,
}

/// Typed form of one exact frozen evaluation texture binding.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EvaluationTextureBindingV1 {
    pub id: String,
    pub asset: AssetRef,
    pub width: u32,
    pub height: u32,
    pub media_type: String,
    pub color_space: String,
    pub alpha_mode: String,
}

/// One activation binding and its generation-pinned, owned PNG bytes and RGBA
/// decode. Fields remain private so incomplete values cannot be assembled.
#[derive(Eq, PartialEq)]
pub struct PreparedActivationTextureV1 {
    pub(crate) id: String,
    pub(crate) ready: ReadyPng,
}

impl fmt::Debug for PreparedActivationTextureV1 {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("PreparedActivationTextureV1")
            .field("id", &self.id)
            .field("asset", self.ready.reference())
            .field("logical_bytes_len", &self.ready.logical_bytes().len())
            .field("width", &self.ready.decoded().info.width)
            .field("height", &self.ready.decoded().info.height)
            .field("rgba_bytes_len", &self.ready.decoded().rgba.len())
            .field(
                "source_generation_count",
                &self.ready.source_generations().len(),
            )
            .finish()
    }
}

impl PreparedActivationTextureV1 {
    #[must_use]
    pub fn id(&self) -> &str {
        &self.id
    }

    #[must_use]
    pub const fn ready_png(&self) -> &ReadyPng {
        &self.ready
    }

    #[must_use]
    pub fn into_parts(self) -> (String, ReadyPng) {
        (self.id, self.ready)
    }
}

/// Complete, failure-atomic texture set for one W7a request generation.
#[derive(Debug, Eq, PartialEq)]
pub struct PreparedActivationTextureSetV1 {
    pub(crate) request_generation: u64,
    pub(crate) textures: Vec<PreparedActivationTextureV1>,
    pub(crate) total_pixels: u64,
    pub(crate) total_rgba_bytes: u64,
}

impl PreparedActivationTextureSetV1 {
    #[must_use]
    pub const fn request_generation(&self) -> u64 {
        self.request_generation
    }

    #[must_use]
    pub fn textures(&self) -> &[PreparedActivationTextureV1] {
        &self.textures
    }

    #[must_use]
    pub const fn total_pixels(&self) -> u64 {
        self.total_pixels
    }

    #[must_use]
    pub const fn total_rgba_bytes(&self) -> u64 {
        self.total_rgba_bytes
    }

    #[must_use]
    pub fn into_parts(self) -> (u64, Vec<PreparedActivationTextureV1>) {
        (self.request_generation, self.textures)
    }
}

/// Deterministic absent-binding state for one W7a request generation. Any
/// ready values from the same attempt have already been dropped.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MissingActivationTexturesV1 {
    pub(crate) request_generation: u64,
    pub(crate) texture_ids: Vec<String>,
}

impl MissingActivationTexturesV1 {
    #[must_use]
    pub const fn request_generation(&self) -> u64 {
        self.request_generation
    }

    #[must_use]
    pub fn texture_ids(&self) -> &[String] {
        &self.texture_ids
    }

    #[must_use]
    pub fn into_parts(self) -> (u64, Vec<String>) {
        (self.request_generation, self.texture_ids)
    }
}

/// Activation preparation is either one complete owned set or an ordered
/// missing-ID state. Missing is deliberately not an Asset/store error.
#[derive(Debug, Eq, PartialEq)]
pub enum PrepareActivationTextureSetV1 {
    Ready(PreparedActivationTextureSetV1),
    Missing(MissingActivationTexturesV1),
}
