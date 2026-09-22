//! Shared exact texture-plan preflight and complete resolver/PNG assembly.

use crate::error::LocalAssetHostError;
use crate::model::{
    EVALUATION_TEXTURE_PLAN_SCHEMA_V1, EvaluationTexturePlanV1, MissingActivationTexturesV1,
    PNG_MEDIA_TYPE, PrepareActivationTextureSetV1, PreparedActivationTextureSetV1,
    PreparedActivationTextureV1, SRGB_COLOR_SPACE, STRAIGHT_ALPHA_MODE,
};
use vivi_asset_resolver::{
    AssetError, AssetErrorCode, AssetReadStore, AssetRef, OperationError, PrincipalId, ResolvePng,
    StorageKind, resolve_referenced_png as resolve_png_with_store,
};

const MAX_TEXTURES: usize = 32;
const MAX_TEXTURE_AXIS: u32 = 8_192;
const MAX_TEXTURE_PIXELS: u64 = 67_108_864;
const MAX_TOTAL_TEXTURE_PIXELS: u64 = 67_108_864;
const MAX_TEXTURE_RGBA_BYTES: u64 = 268_435_456;
const MAX_TOTAL_TEXTURE_RGBA_BYTES: u64 = 268_435_456;
const MAX_PNG_INPUT_BYTES: u64 = 67_108_864;
const MAX_BLOB_BYTES: u64 = 16_777_216;
const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;

pub(crate) fn prepare_activation_texture_set_from_store<S, F>(
    store: &S,
    principal: &PrincipalId,
    request_generation: u64,
    plan: &EvaluationTexturePlanV1,
    classify_store_error: &F,
) -> Result<PrepareActivationTextureSetV1, LocalAssetHostError>
where
    S: AssetReadStore,
    F: Fn(S::Error) -> LocalAssetHostError,
{
    let totals = preflight_plan(request_generation, plan)?;

    let mut ready = Vec::new();
    ready
        .try_reserve_exact(plan.textures.len())
        .map_err(|_| LocalAssetHostError::resource_limit_exceeded())?;
    let mut missing_ids = Vec::new();
    missing_ids
        .try_reserve_exact(plan.textures.len())
        .map_err(|_| LocalAssetHostError::resource_limit_exceeded())?;

    for binding in &plan.textures {
        match resolve_png_with_store(
            store,
            principal,
            &binding.asset,
            binding.width,
            binding.height,
        )
        .map_err(|error| match error {
            OperationError::Asset(error) => LocalAssetHostError::from_asset(error),
            OperationError::StoreUnavailable(error) => classify_store_error(error),
        })? {
            ResolvePng::Ready(ready_png) => ready.push(PreparedActivationTextureV1 {
                id: binding.id.clone(),
                ready: ready_png,
            }),
            ResolvePng::Missing => missing_ids.push(binding.id.clone()),
        }
    }

    if missing_ids.is_empty() {
        Ok(PrepareActivationTextureSetV1::Ready(
            PreparedActivationTextureSetV1 {
                request_generation,
                textures: ready,
                total_pixels: totals.pixels,
                total_rgba_bytes: totals.rgba_bytes,
            },
        ))
    } else {
        // `ready` is dropped here: a Missing state can never carry a partial
        // activation set.
        Ok(PrepareActivationTextureSetV1::Missing(
            MissingActivationTexturesV1 {
                request_generation,
                texture_ids: missing_ids,
            },
        ))
    }
}

#[derive(Clone, Copy)]
struct PlanTotals {
    pixels: u64,
    rgba_bytes: u64,
}

fn preflight_plan(
    request_generation: u64,
    plan: &EvaluationTexturePlanV1,
) -> Result<PlanTotals, LocalAssetHostError> {
    if request_generation > MAX_SAFE_INTEGER {
        return Err(LocalAssetHostError::resource_limit_exceeded());
    }
    if plan.schema != EVALUATION_TEXTURE_PLAN_SCHEMA_V1 {
        return Err(LocalAssetHostError::invalid_texture_plan());
    }
    if plan.textures.len() > MAX_TEXTURES {
        return Err(LocalAssetHostError::resource_limit_exceeded());
    }

    let mut previous_id: Option<&[u8]> = None;
    let mut total_pixels = 0_u64;
    let mut total_rgba_bytes = 0_u64;
    for binding in &plan.textures {
        if !valid_texture_id(&binding.id)
            || previous_id.is_some_and(|previous| previous >= binding.id.as_bytes())
            || binding.media_type != PNG_MEDIA_TYPE
            || binding.color_space != SRGB_COLOR_SPACE
            || binding.alpha_mode != STRAIGHT_ALPHA_MODE
        {
            return Err(LocalAssetHostError::invalid_texture_plan());
        }
        previous_id = Some(binding.id.as_bytes());

        if binding.width == 0 || binding.height == 0 {
            return Err(LocalAssetHostError::invalid_texture_plan());
        }
        if binding.width > MAX_TEXTURE_AXIS || binding.height > MAX_TEXTURE_AXIS {
            return Err(LocalAssetHostError::resource_limit_exceeded());
        }

        let pixels = u64::from(binding.width)
            .checked_mul(u64::from(binding.height))
            .ok_or_else(LocalAssetHostError::resource_limit_exceeded)?;
        if pixels > MAX_TEXTURE_PIXELS {
            return Err(LocalAssetHostError::resource_limit_exceeded());
        }
        let rgba_bytes = pixels
            .checked_mul(4)
            .ok_or_else(LocalAssetHostError::resource_limit_exceeded)?;
        if rgba_bytes > MAX_TEXTURE_RGBA_BYTES {
            return Err(LocalAssetHostError::resource_limit_exceeded());
        }

        validate_asset_shape(&binding.asset)?;

        total_pixels = total_pixels
            .checked_add(pixels)
            .ok_or_else(LocalAssetHostError::resource_limit_exceeded)?;
        total_rgba_bytes = total_rgba_bytes
            .checked_add(rgba_bytes)
            .ok_or_else(LocalAssetHostError::resource_limit_exceeded)?;
        if total_pixels > MAX_TOTAL_TEXTURE_PIXELS
            || total_rgba_bytes > MAX_TOTAL_TEXTURE_RGBA_BYTES
        {
            return Err(LocalAssetHostError::resource_limit_exceeded());
        }
    }

    Ok(PlanTotals {
        pixels: total_pixels,
        rgba_bytes: total_rgba_bytes,
    })
}

fn valid_texture_id(id: &str) -> bool {
    let Some(suffix) = id.as_bytes().strip_prefix(b"atlas:") else {
        return false;
    };
    (1..=120).contains(&suffix.len())
        && suffix
            .iter()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
}

pub(crate) fn validate_asset_shape(reference: &AssetRef) -> Result<(), LocalAssetHostError> {
    match reference.storage_kind {
        StorageKind::Blob => {
            if reference.size_bytes > MAX_BLOB_BYTES {
                return Err(asset_preflight_error(AssetErrorCode::LimitExceeded));
            }
            if reference.object_address != reference.content_sha256 {
                return Err(asset_preflight_error(AssetErrorCode::HashMismatch));
            }
        }
        StorageKind::ChunkManifest => {
            if reference.size_bytes <= MAX_BLOB_BYTES {
                return Err(asset_preflight_error(AssetErrorCode::LimitExceeded));
            }
        }
    }
    if reference.size_bytes > MAX_PNG_INPUT_BYTES {
        return Err(asset_preflight_error(AssetErrorCode::LimitExceeded));
    }
    if reference.media_type != PNG_MEDIA_TYPE {
        return Err(asset_preflight_error(AssetErrorCode::MediaTypeMismatch));
    }
    Ok(())
}

fn asset_preflight_error(code: AssetErrorCode) -> LocalAssetHostError {
    LocalAssetHostError::from_asset(AssetError::new(
        code,
        "evaluation texture AssetRef preflight failed",
    ))
}
