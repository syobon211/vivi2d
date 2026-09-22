use vivi_asset_host_local::{
    AssetRef, EvaluationPhysicalObjectV1, EvaluationTexturePlanV1, PrepareActivationTextureSetV1,
    prepare_activation_texture_set_from_bytes,
};
#[cfg(feature = "native-host")]
use vivi_asset_host_local::{LocalAssetHost, LocalAssetHostError};
use vivi_runtime_native_evaluation::ValidatedEvaluationPayloadV1;

use crate::{CorrelatedEvaluationActivationV1, EvaluationPreactivationError};
#[cfg(feature = "native-host")]
use crate::{
    MissingEvaluationActivationV1, PrepareEvaluationActivationV1, PreparedEvaluationActivationV1,
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
#[cfg(feature = "native-host")]
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

/// Prepares a borrowed texture plan using the real principal-bound host once.
///
/// This preserves the host's complete preflight and the existing Ready/Missing
/// output checks. It does not prove prior payload correlation: the consuming
/// lowerer supplies that separate proof through its sealed owner. Returned host
/// data is authorized model data, not sanitized diagnostic material.
#[cfg(feature = "native-host")]
pub fn prepare_evaluation_texture_plan_v1(
    host: &LocalAssetHost,
    request_generation: u64,
    plan: &EvaluationTexturePlanV1,
) -> Result<PrepareActivationTextureSetV1, EvaluationPreactivationError> {
    let outcome = host
        .prepare_activation_texture_set(request_generation, plan)
        .map_err(EvaluationPreactivationError::from_host)?;
    validate_host_outcome(request_generation, plan, outcome)
}

/// Purely correlates one request generation, validated candidate, and typed
/// Evaluation texture plan before any host/store access.
///
/// Precedence is exact: a generation mismatch wins first, an equal generation
/// above the JavaScript-safe ceiling wins second, and exact schema/count/
/// positional case-sensitive ID/dimension tuple correlation follows. Success
/// returns a private move-only proof token; it does not validate host-owned
/// fixed fields or `AssetRef` values, lower the candidate, read assets, or make
/// activation state.
pub fn correlate_evaluation_activation_v1(
    request_generation: u64,
    candidate: ValidatedEvaluationPayloadV1,
    plan: EvaluationTexturePlanV1,
) -> Result<CorrelatedEvaluationActivationV1, EvaluationPreactivationError> {
    if request_generation != candidate.request_generation() {
        return Err(EvaluationPreactivationError::correlation());
    }
    if request_generation > MAX_JAVASCRIPT_SAFE_INTEGER {
        return Err(EvaluationPreactivationError::resource_limit_exceeded());
    }
    correlate(&candidate, &plan)?;
    Ok(CorrelatedEvaluationActivationV1 {
        candidate,
        texture_plan: plan,
    })
}

#[cfg(feature = "native-host")]
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
    let correlated = correlate_evaluation_activation_v1(request_generation, candidate, plan)?;
    let outcome = prepare(request_generation, &correlated.texture_plan)
        .map_err(EvaluationPreactivationError::from_host)?;
    let outcome = validate_host_outcome(request_generation, &correlated.texture_plan, outcome)?;
    let (candidate, plan) = correlated.into_parts();

    match outcome {
        PrepareActivationTextureSetV1::Ready(prepared_textures) => Ok(
            PrepareEvaluationActivationV1::Ready(PreparedEvaluationActivationV1 {
                candidate,
                texture_plan: plan,
                prepared_textures,
            }),
        ),
        PrepareActivationTextureSetV1::Missing(missing_textures) => Ok(
            PrepareEvaluationActivationV1::Missing(MissingEvaluationActivationV1 {
                candidate,
                texture_plan: plan,
                missing_textures,
            }),
        ),
    }
}

/// Prepares captured untrusted bytes through the same resolver and output checks.
pub fn prepare_evaluation_texture_plan_from_bytes_v1(
    request_generation: u64,
    plan: &EvaluationTexturePlanV1,
    objects: Vec<EvaluationPhysicalObjectV1>,
) -> Result<PrepareActivationTextureSetV1, EvaluationPreactivationError> {
    let outcome = prepare_activation_texture_set_from_bytes(request_generation, plan, objects)
        .map_err(EvaluationPreactivationError::from_host)?;
    validate_host_outcome(request_generation, plan, outcome)
}

fn validate_host_outcome(
    generation: u64,
    plan: &EvaluationTexturePlanV1,
    outcome: PrepareActivationTextureSetV1,
) -> Result<PrepareActivationTextureSetV1, EvaluationPreactivationError> {
    match &outcome {
        PrepareActivationTextureSetV1::Ready(ready) => {
            validate_ready_output(generation, plan, ready)?;
        }
        PrepareActivationTextureSetV1::Missing(missing) => {
            validate_missing_output(generation, plan, missing)?;
        }
    }
    Ok(outcome)
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
