use vivi_asset_host_local::{
    AssetRef, EvaluationTexturePlanV1, LocalAssetHost, LocalAssetHostError,
    PrepareActivationTextureSetV1,
};
use vivi_runtime_native_evaluation::ValidatedEvaluationPayloadV1;

use crate::{
    EvaluationPreactivationError, MissingEvaluationActivationV1, PrepareEvaluationActivationV1,
    PreparedEvaluationActivationV1,
};

const EVALUATION_TEXTURE_PLAN_SCHEMA_V1: &str = "vivi2d.evaluationTexturePlan.v1";
const MAX_JAVASCRIPT_SAFE_INTEGER: u64 = 9_007_199_254_740_991;

/// Correlates and resolves one Evaluation Payload v1 activation candidate.
///
/// The explicit `request_generation` must first equal the candidate's full-`u64`
/// generation and must then be at most `9_007_199_254_740_991`. Therefore a
/// mismatched generation is a correlation failure even when the explicit value
/// is above that ceiling; an equal above-ceiling value is a resource-limit
/// failure before texture correlation or host invocation.
///
/// Exact schema, count, UTF-8 binding-ID order, case-sensitive identifiers, and
/// dimensions are compared before the Asset host is invoked. The host then
/// performs its complete plan preflight before the first store read, including
/// the frozen `image/png`, `srgb`, and `straight` fields and every `AssetRef`,
/// and resolves every texture without exposing a partial ready set.
///
/// This function moves the candidate, plan, and host output into the result; it
/// does not clone logical PNG or decoded RGBA buffers. It does not establish
/// freshness or reject a result that became stale after the call began.
pub fn prepare_evaluation_activation_v1(
    host: &LocalAssetHost,
    request_generation: u64,
    candidate: ValidatedEvaluationPayloadV1,
    plan: EvaluationTexturePlanV1,
) -> Result<PrepareEvaluationActivationV1, EvaluationPreactivationError> {
    prepare_with(request_generation, candidate, plan, |generation, plan| {
        host.prepare_activation_texture_set(generation, plan)
    })
}

pub(crate) fn prepare_with<F>(
    request_generation: u64,
    candidate: ValidatedEvaluationPayloadV1,
    plan: EvaluationTexturePlanV1,
    prepare: F,
) -> Result<PrepareEvaluationActivationV1, EvaluationPreactivationError>
where
    F: FnOnce(
        u64,
        &EvaluationTexturePlanV1,
    ) -> Result<PrepareActivationTextureSetV1, LocalAssetHostError>,
{
    if request_generation != candidate.request_generation() {
        return Err(EvaluationPreactivationError::correlation());
    }
    if request_generation > MAX_JAVASCRIPT_SAFE_INTEGER {
        return Err(EvaluationPreactivationError::resource_limit_exceeded());
    }
    correlate(&candidate, &plan)?;
    let outcome =
        prepare(request_generation, &plan).map_err(EvaluationPreactivationError::from_host)?;

    match outcome {
        PrepareActivationTextureSetV1::Ready(prepared_textures) => {
            validate_ready_output(request_generation, &plan, &prepared_textures)?;
            Ok(PrepareEvaluationActivationV1::Ready(
                PreparedEvaluationActivationV1 {
                    candidate,
                    texture_plan: plan,
                    prepared_textures,
                },
            ))
        }
        PrepareActivationTextureSetV1::Missing(missing_textures) => {
            validate_missing_output(request_generation, &plan, &missing_textures)?;
            Ok(PrepareEvaluationActivationV1::Missing(
                MissingEvaluationActivationV1 {
                    candidate,
                    texture_plan: plan,
                    missing_textures,
                },
            ))
        }
    }
}

fn correlate(
    candidate: &ValidatedEvaluationPayloadV1,
    plan: &EvaluationTexturePlanV1,
) -> Result<(), EvaluationPreactivationError> {
    if plan.schema != EVALUATION_TEXTURE_PLAN_SCHEMA_V1 {
        return Err(EvaluationPreactivationError::correlation());
    }
    let required = candidate.texture_bindings();
    if required.len() != plan.textures.len() {
        return Err(EvaluationPreactivationError::correlation());
    }
    for (required, supplied) in required.iter().zip(&plan.textures) {
        if required.id().as_bytes() != supplied.id.as_bytes()
            || required.width() != supplied.width
            || required.height() != supplied.height
        {
            return Err(EvaluationPreactivationError::correlation());
        }
    }
    Ok(())
}

fn validate_ready_output(
    generation: u64,
    plan: &EvaluationTexturePlanV1,
    actual: &vivi_asset_host_local::PreparedActivationTextureSetV1,
) -> Result<(), EvaluationPreactivationError> {
    validate_ready_shape(
        generation,
        plan,
        actual.request_generation(),
        actual.textures().len(),
        actual.total_pixels(),
        actual.total_rgba_bytes(),
        |index| {
            let texture = actual.textures().get(index)?;
            let decoded = texture.ready_png().decoded();
            Some((
                texture.id(),
                decoded.info.width,
                decoded.info.height,
                texture.ready_png().reference(),
            ))
        },
    )
}

pub(crate) fn validate_ready_shape<'plan, 'actual, F>(
    generation: u64,
    plan: &'plan EvaluationTexturePlanV1,
    actual_generation: u64,
    actual_count: usize,
    actual_pixels: u64,
    actual_rgba_bytes: u64,
    mut actual_at: F,
) -> Result<(), EvaluationPreactivationError>
where
    F: FnMut(usize) -> Option<(&'actual str, u32, u32, &'actual AssetRef)>,
{
    let (expected_pixels, expected_rgba_bytes) = expected_totals(plan)?;
    if actual_generation != generation
        || actual_count != plan.textures.len()
        || actual_pixels != expected_pixels
        || actual_rgba_bytes != expected_rgba_bytes
    {
        return Err(EvaluationPreactivationError::internal());
    }
    for (index, expected) in plan.textures.iter().enumerate() {
        let Some((id, width, height, asset)) = actual_at(index) else {
            return Err(EvaluationPreactivationError::internal());
        };
        if id.as_bytes() != expected.id.as_bytes()
            || width != expected.width
            || height != expected.height
            || asset != &expected.asset
        {
            return Err(EvaluationPreactivationError::internal());
        }
    }
    Ok(())
}

fn validate_missing_output(
    generation: u64,
    plan: &EvaluationTexturePlanV1,
    actual: &vivi_asset_host_local::MissingActivationTexturesV1,
) -> Result<(), EvaluationPreactivationError> {
    validate_missing_shape(
        generation,
        plan,
        actual.request_generation(),
        actual.texture_ids(),
    )
}

pub(crate) fn validate_missing_shape(
    generation: u64,
    plan: &EvaluationTexturePlanV1,
    actual_generation: u64,
    missing_ids: &[String],
) -> Result<(), EvaluationPreactivationError> {
    if actual_generation != generation || missing_ids.is_empty() {
        return Err(EvaluationPreactivationError::internal());
    }
    let mut next_expected = 0usize;
    for missing in missing_ids {
        let Some(relative_index) = plan.textures[next_expected..]
            .iter()
            .position(|binding| binding.id.as_bytes() == missing.as_bytes())
        else {
            return Err(EvaluationPreactivationError::internal());
        };
        next_expected += relative_index + 1;
    }
    Ok(())
}

fn expected_totals(
    plan: &EvaluationTexturePlanV1,
) -> Result<(u64, u64), EvaluationPreactivationError> {
    let mut pixels = 0_u64;
    for binding in &plan.textures {
        let binding_pixels = u64::from(binding.width)
            .checked_mul(u64::from(binding.height))
            .ok_or_else(EvaluationPreactivationError::internal)?;
        pixels = pixels
            .checked_add(binding_pixels)
            .ok_or_else(EvaluationPreactivationError::internal)?;
    }
    let rgba_bytes = pixels
        .checked_mul(4)
        .ok_or_else(EvaluationPreactivationError::internal)?;
    Ok((pixels, rgba_bytes))
}
