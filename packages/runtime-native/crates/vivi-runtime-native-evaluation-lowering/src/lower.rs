use serde_json::{Map, Value};
use vivi_runtime_native_preactivation::{
    CorrelatedEvaluationActivationV1, EvaluationTexturePlanV1, ValidatedEvaluationPayloadV1,
    correlate_evaluation_activation_v1,
};

use crate::error::{EvaluationLoweringError, EvaluationLoweringErrorKind};
use crate::model::{DirectMeshProjectionV1, EvaluationLoweringFoundationV1, FoundationBlendModeV1};

type LoweringResult<T> = Result<T, EvaluationLoweringError>;

/// Correlates and preflights one Evaluation candidate through lowering
/// category 9 without host/store access.
///
/// The candidate and typed plan are consumed. Generation and tuple correlation
/// reuse the approved preactivation seam exactly once. Categories 1–8 are then
/// scanned allocation-free in their normative order; category 9 performs
/// checked arithmetic and fallible reservation before direct projection records
/// are filled. The returned foundation is not sealed, complete, model-ready, or
/// activation-ready because category-10 derived evaluation and category-11
/// topology/invariant construction remain deliberately unimplemented.
pub fn lower_evaluation_foundation_v1(
    caller_generation: u64,
    candidate: ValidatedEvaluationPayloadV1,
    texture_plan: EvaluationTexturePlanV1,
) -> LoweringResult<EvaluationLoweringFoundationV1> {
    let correlated = correlate_evaluation_activation_v1(caller_generation, candidate, texture_plan)
        .map_err(EvaluationLoweringError::from_correlation)?;
    lower_correlated_with_reservation(correlated, |_| true)
}

pub(crate) fn lower_correlated_with_reservation<F>(
    correlated: CorrelatedEvaluationActivationV1,
    mut reservation_allowed: F,
) -> LoweringResult<EvaluationLoweringFoundationV1>
where
    F: FnMut(usize) -> bool,
{
    let generation = correlated.request_generation();
    let (candidate, texture_plan) = correlated.into_parts();
    let root = object(candidate.value())?;
    let layers = array_property(root, "layers")?;

    reject_art_paths(layers)?;
    reject_non_mesh_mask_owners(layers)?;
    reject_unsupported_blends(layers)?;
    reject_ik_parameter_mappings(root)?;
    reject_duplicate_ik_bones(root)?;
    reject_multiple_ik_controllers(root)?;
    reject_multiple_enabled_physics_groups(root)?;
    validate_ik_ranges(root)?;
    validate_direct_projections(root, layers)?;

    let skins = object_property(root, "skins")?;
    let mut counts = FoundationCounts::default();
    count_foundation(layers, skins, &mut counts)?;

    let mut meshes = Vec::new();
    reserve_exact(&mut meshes, counts.mesh_count, &mut reservation_allowed)?;
    reserve_mesh_buffers(layers, skins, &mut meshes, &mut reservation_allowed)?;
    fill_direct_projection_records(layers, skins, &mut meshes, &mut 0)?;

    let canvas = object_property(root, "canvas")?;
    let canvas_width = u64_property(canvas, "width")?;
    let canvas_height = u64_property(canvas, "height")?;

    Ok(EvaluationLoweringFoundationV1 {
        generation,
        candidate,
        texture_plan,
        canvas_width,
        canvas_height,
        meshes,
        direct_projected_scalar_count: counts.direct_projected_scalar_count,
        derived_evaluation_mesh_count: counts.derived_evaluation_mesh_count,
        mask_edge_count: counts.mask_edge_count,
    })
}

#[derive(Default)]
struct FoundationCounts {
    mesh_count: usize,
    direct_projected_scalar_count: usize,
    derived_evaluation_mesh_count: usize,
    mask_edge_count: usize,
}

fn reject_art_paths(layers: &[Value]) -> LoweringResult<()> {
    for layer in layers {
        let layer = object(layer)?;
        if string_property(layer, "kind")? == "artPath" {
            return Err(error(EvaluationLoweringErrorKind::UnsupportedLayer));
        }
        reject_art_paths(array_property(layer, "children")?)?;
    }
    Ok(())
}

fn reject_non_mesh_mask_owners(layers: &[Value]) -> LoweringResult<()> {
    for layer in layers {
        let layer = object(layer)?;
        let kind = string_property(layer, "kind")?;
        if kind != "viviMesh"
            && (layer.contains_key("clipMaskIds") || layer.contains_key("clipMasks"))
        {
            return Err(error(EvaluationLoweringErrorKind::UnsupportedMaskPlacement));
        }
        reject_non_mesh_mask_owners(array_property(layer, "children")?)?;
    }
    Ok(())
}

fn reject_unsupported_blends(layers: &[Value]) -> LoweringResult<()> {
    for layer in layers {
        let layer = object(layer)?;
        parse_blend_mode(string_property(layer, "blendMode")?)?;
        reject_unsupported_blends(array_property(layer, "children")?)?;
    }
    Ok(())
}

fn reject_ik_parameter_mappings(root: &Map<String, Value>) -> LoweringResult<()> {
    for controller in array_property(root, "ikControllers")? {
        let controller = object(controller)?;
        if !array_property(controller, "parameterMappings")?.is_empty() {
            return Err(error(
                EvaluationLoweringErrorKind::UnsupportedIkParameterMappings,
            ));
        }
    }
    Ok(())
}

fn reject_duplicate_ik_bones(root: &Map<String, Value>) -> LoweringResult<()> {
    for controller in array_property(root, "ikControllers")? {
        let chain = array_property(object(controller)?, "boneChain")?;
        for (index, constraint) in chain.iter().enumerate() {
            let id = string_property(object(constraint)?, "boneId")?;
            for prior in &chain[..index] {
                if string_property(object(prior)?, "boneId")?.as_bytes() == id.as_bytes() {
                    return Err(error(
                        EvaluationLoweringErrorKind::UnsupportedDuplicateIkBone,
                    ));
                }
            }
        }
    }
    Ok(())
}

fn reject_multiple_ik_controllers(root: &Map<String, Value>) -> LoweringResult<()> {
    if array_property(root, "ikControllers")?.len() > 1 {
        return Err(error(
            EvaluationLoweringErrorKind::UnsupportedMultipleIkControllers,
        ));
    }
    Ok(())
}

fn reject_multiple_enabled_physics_groups(root: &Map<String, Value>) -> LoweringResult<()> {
    let mut enabled = 0_u8;
    for group in array_property(root, "physicsGroups")? {
        if bool_property(object(group)?, "enabled")? {
            enabled = enabled.saturating_add(1);
            if enabled > 1 {
                return Err(error(
                    EvaluationLoweringErrorKind::UnsupportedMultipleEnabledPhysicsGroups,
                ));
            }
        }
    }
    Ok(())
}

fn validate_ik_ranges(root: &Map<String, Value>) -> LoweringResult<()> {
    for controller in array_property(root, "ikControllers")? {
        let controller = object(controller)?;
        let influence = f64_property(controller, "influence")?;
        if !(0.0..=1.0).contains(&influence) {
            return Err(error(EvaluationLoweringErrorKind::InvalidIkRange));
        }
        for constraint in array_property(controller, "boneChain")? {
            let constraint = object(constraint)?;
            if f64_property(constraint, "minAngle")? > f64_property(constraint, "maxAngle")? {
                return Err(error(EvaluationLoweringErrorKind::InvalidIkRange));
            }
        }
    }
    Ok(())
}

fn validate_direct_projections(root: &Map<String, Value>, layers: &[Value]) -> LoweringResult<()> {
    let skins = object_property(root, "skins")?;
    validate_layer_direct_projections(layers, skins)
}

fn validate_layer_direct_projections(
    layers: &[Value],
    skins: &Map<String, Value>,
) -> LoweringResult<()> {
    for layer in layers {
        let layer = object(layer)?;
        if string_property(layer, "kind")? == "viviMesh" {
            let id = string_property(layer, "id")?;
            let skinned = skins.contains_key(id);
            let mesh = object_property(layer, "mesh")?;
            if !skinned {
                validate_projected_array(array_property(mesh, "vertices")?)?;
            }
            validate_projected_array(array_property(mesh, "uvs")?)?;
            if !skinned {
                validate_binary64_for_projection(f64_property(layer, "x")?)?;
                validate_binary64_for_projection(f64_property(layer, "y")?)?;
            }
            validate_binary64_for_projection(f64_property(layer, "opacity")?)?;
            validate_optional_colors(layer)?;
        }
        validate_layer_direct_projections(array_property(layer, "children")?, skins)?;
    }
    Ok(())
}

fn validate_projected_array(values: &[Value]) -> LoweringResult<()> {
    for value in values {
        validate_binary64_for_projection(f64_value(value)?)?;
    }
    Ok(())
}

fn validate_optional_colors(layer: &Map<String, Value>) -> LoweringResult<()> {
    if let Some(value) = layer.get("multiplyColor") {
        validate_color(object(value)?)?;
    }
    if let Some(value) = layer.get("screenColor") {
        let color = object(value)?;
        if !color_is_black(color)? {
            validate_color(color)?;
        }
    }
    Ok(())
}

fn validate_color(color: &Map<String, Value>) -> LoweringResult<()> {
    for field in ["r", "g", "b"] {
        validate_binary64_for_projection(f64_property(color, field)?)?;
    }
    Ok(())
}

fn count_foundation(
    layers: &[Value],
    skins: &Map<String, Value>,
    counts: &mut FoundationCounts,
) -> LoweringResult<()> {
    for layer in layers {
        let layer = object(layer)?;
        if string_property(layer, "kind")? == "viviMesh" {
            counts.mesh_count = checked_add(counts.mesh_count, 1)?;
            let id = string_property(layer, "id")?;
            let skinned = skins.contains_key(id);
            let mesh = object_property(layer, "mesh")?;
            if skinned {
                counts.derived_evaluation_mesh_count =
                    checked_add(counts.derived_evaluation_mesh_count, 1)?;
            } else {
                counts.direct_projected_scalar_count = checked_add(
                    counts.direct_projected_scalar_count,
                    array_property(mesh, "vertices")?.len(),
                )?;
                counts.direct_projected_scalar_count =
                    checked_add(counts.direct_projected_scalar_count, 2)?;
            }
            counts.direct_projected_scalar_count = checked_add(
                counts.direct_projected_scalar_count,
                array_property(mesh, "uvs")?.len(),
            )?;
            counts.direct_projected_scalar_count =
                checked_add(counts.direct_projected_scalar_count, 1)?;
            if layer.contains_key("multiplyColor") {
                counts.direct_projected_scalar_count =
                    checked_add(counts.direct_projected_scalar_count, 3)?;
            }
            if let Some(screen) = layer.get("screenColor")
                && !color_is_black(object(screen)?)?
            {
                counts.direct_projected_scalar_count =
                    checked_add(counts.direct_projected_scalar_count, 3)?;
            }
            counts.mask_edge_count =
                checked_add(counts.mask_edge_count, normalized_mask_edge_count(layer)?)?;
        }
        count_foundation(array_property(layer, "children")?, skins, counts)?;
    }
    Ok(())
}

fn reserve_mesh_buffers<F>(
    layers: &[Value],
    skins: &Map<String, Value>,
    buffers: &mut Vec<DirectMeshProjectionV1>,
    reservation_allowed: &mut F,
) -> LoweringResult<()>
where
    F: FnMut(usize) -> bool,
{
    for layer in layers {
        let layer = object(layer)?;
        if string_property(layer, "kind")? == "viviMesh" {
            let skinned = skins.contains_key(string_property(layer, "id")?);
            let mesh = object_property(layer, "mesh")?;
            let mut vertices = if skinned { None } else { Some(Vec::new()) };
            if let Some(values) = &mut vertices {
                reserve_exact(
                    values,
                    array_property(mesh, "vertices")?.len(),
                    reservation_allowed,
                )?;
            }
            let mut uvs = Vec::new();
            reserve_exact(
                &mut uvs,
                array_property(mesh, "uvs")?.len(),
                reservation_allowed,
            )?;
            let mut indices = Vec::new();
            reserve_exact(
                &mut indices,
                array_property(mesh, "indices")?.len(),
                reservation_allowed,
            )?;
            buffers.push(DirectMeshProjectionV1 {
                vertices,
                uvs,
                indices,
                x: 0.0,
                y: 0.0,
                opacity: 0.0,
                multiply_color: None,
                screen_color: None,
                blend_mode: FoundationBlendModeV1::Normal,
            });
        }
        reserve_mesh_buffers(
            array_property(layer, "children")?,
            skins,
            buffers,
            reservation_allowed,
        )?;
    }
    Ok(())
}

fn fill_direct_projection_records(
    layers: &[Value],
    skins: &Map<String, Value>,
    buffers: &mut [DirectMeshProjectionV1],
    next_mesh: &mut usize,
) -> LoweringResult<()> {
    for layer in layers {
        let layer = object(layer)?;
        if string_property(layer, "kind")? == "viviMesh" {
            let skinned = skins.contains_key(string_property(layer, "id")?);
            let mesh = object_property(layer, "mesh")?;
            let buffer = buffers.get_mut(*next_mesh).ok_or_else(internal)?;
            *next_mesh = next_mesh.checked_add(1).ok_or_else(resource)?;

            if !skinned {
                let vertices = buffer.vertices.as_mut().ok_or_else(internal)?;
                fill_projected_array(vertices, array_property(mesh, "vertices")?)?;
            }
            fill_projected_array(&mut buffer.uvs, array_property(mesh, "uvs")?)?;
            if !skinned {
                buffer.x = project_validated_binary64_to_binary32(f64_property(layer, "x")?);
                buffer.y = project_validated_binary64_to_binary32(f64_property(layer, "y")?);
            }
            buffer.opacity =
                project_validated_binary64_to_binary32(f64_property(layer, "opacity")?);
            buffer.multiply_color = project_optional_color(layer.get("multiplyColor"))?;
            buffer.screen_color = match layer.get("screenColor") {
                Some(value) if !color_is_black(object(value)?)? => {
                    project_optional_color(Some(value))?
                }
                _ => None,
            };
            buffer.blend_mode = parse_blend_mode(string_property(layer, "blendMode")?)?;
            for value in array_property(mesh, "indices")? {
                let value = u64_value(value)?;
                buffer
                    .indices
                    .push(u32::try_from(value).map_err(|_| internal())?);
            }
        }
        fill_direct_projection_records(
            array_property(layer, "children")?,
            skins,
            buffers,
            next_mesh,
        )?;
    }
    Ok(())
}

fn fill_projected_array(target: &mut Vec<f32>, values: &[Value]) -> LoweringResult<()> {
    for value in values {
        target.push(project_validated_binary64_to_binary32(f64_value(value)?));
    }
    Ok(())
}

fn project_optional_color(value: Option<&Value>) -> LoweringResult<Option<[f32; 3]>> {
    let Some(value) = value else {
        return Ok(None);
    };
    let color = object(value)?;
    Ok(Some([
        project_validated_binary64_to_binary32(f64_property(color, "r")?),
        project_validated_binary64_to_binary32(f64_property(color, "g")?),
        project_validated_binary64_to_binary32(f64_property(color, "b")?),
    ]))
}

#[cfg(test)]
pub(crate) fn project_binary64_to_binary32(value: f64) -> LoweringResult<f32> {
    validate_binary64_for_projection(value)?;
    Ok(project_validated_binary64_to_binary32(value))
}

fn project_validated_binary64_to_binary32(value: f64) -> f32 {
    debug_assert!(validate_binary64_for_projection(value).is_ok());
    if value == 0.0 {
        return 0.0_f32;
    }
    value as f32
}

// Category 8 must classify before any category-9 reservation, while each
// materialized publication is allowed exactly one f64-to-f32 cast after those
// reservations. Positive finite binary64 bit patterns preserve numeric order,
// so the approved L/U oracle and half-minimum-subnormal tie classify the exact
// rounded outcome here without performing a preliminary cast.
fn validate_binary64_for_projection(value: f64) -> LoweringResult<()> {
    if !value.is_finite() {
        return Err(error(EvaluationLoweringErrorKind::NumericNonFinite));
    }
    if value == 0.0 {
        return Ok(());
    }
    const HALF_MINIMUM_SUBNORMAL_BITS: u64 = 0x3690_0000_0000_0000;
    const MINIMUM_ACCEPTED_MAGNITUDE_BITS: u64 = 0x380f_ffff_e000_0000;
    const MAXIMUM_EXCLUSIVE_MAGNITUDE_BITS: u64 = 0x47ef_ffff_f000_0000;
    let magnitude_bits = value.to_bits() & 0x7fff_ffff_ffff_ffff;
    if magnitude_bits >= MAXIMUM_EXCLUSIVE_MAGNITUDE_BITS {
        return Err(error(EvaluationLoweringErrorKind::NumericOverflow));
    }
    if magnitude_bits < MINIMUM_ACCEPTED_MAGNITUDE_BITS {
        if magnitude_bits <= HALF_MINIMUM_SUBNORMAL_BITS {
            return Err(error(EvaluationLoweringErrorKind::NumericUnderflow));
        }
        return Err(error(EvaluationLoweringErrorKind::NumericSubnormal));
    }
    Ok(())
}

fn normalized_mask_edge_count(layer: &Map<String, Value>) -> LoweringResult<usize> {
    match (layer.get("clipMaskIds"), layer.get("clipMasks")) {
        (Some(ids), None) => Ok(array(ids)?.len()),
        (None, Some(edges)) => Ok(array(edges)?.len()),
        (None, None) => Ok(0),
        (Some(_), Some(_)) => Err(internal()),
    }
}

fn color_is_black(color: &Map<String, Value>) -> LoweringResult<bool> {
    Ok(f64_property(color, "r")? == 0.0
        && f64_property(color, "g")? == 0.0
        && f64_property(color, "b")? == 0.0)
}

fn parse_blend_mode(value: &str) -> LoweringResult<FoundationBlendModeV1> {
    match value {
        "normal" => Ok(FoundationBlendModeV1::Normal),
        "multiply" => Ok(FoundationBlendModeV1::Multiply),
        "screen" => Ok(FoundationBlendModeV1::Screen),
        "add" => Ok(FoundationBlendModeV1::Add),
        "overlay" | "darken" | "lighten" | "color-dodge" | "color-burn" | "hard-light"
        | "soft-light" | "difference" | "exclusion" => {
            Err(error(EvaluationLoweringErrorKind::UnsupportedBlendMode))
        }
        _ => Err(internal()),
    }
}

fn reserve_exact<T, F>(
    values: &mut Vec<T>,
    additional: usize,
    reservation_allowed: &mut F,
) -> LoweringResult<()>
where
    F: FnMut(usize) -> bool,
{
    if additional == 0 {
        return Ok(());
    }
    if !reservation_allowed(additional) || values.try_reserve_exact(additional).is_err() {
        return Err(resource());
    }
    Ok(())
}

fn checked_add(left: usize, right: usize) -> LoweringResult<usize> {
    left.checked_add(right).ok_or_else(resource)
}

fn object(value: &Value) -> LoweringResult<&Map<String, Value>> {
    value.as_object().ok_or_else(internal)
}

fn array(value: &Value) -> LoweringResult<&[Value]> {
    value.as_array().map(Vec::as_slice).ok_or_else(internal)
}

fn object_property<'a>(
    value: &'a Map<String, Value>,
    name: &str,
) -> LoweringResult<&'a Map<String, Value>> {
    object(value.get(name).ok_or_else(internal)?)
}

fn array_property<'a>(value: &'a Map<String, Value>, name: &str) -> LoweringResult<&'a [Value]> {
    array(value.get(name).ok_or_else(internal)?)
}

fn string_property<'a>(value: &'a Map<String, Value>, name: &str) -> LoweringResult<&'a str> {
    value.get(name).and_then(Value::as_str).ok_or_else(internal)
}

fn bool_property(value: &Map<String, Value>, name: &str) -> LoweringResult<bool> {
    value
        .get(name)
        .and_then(Value::as_bool)
        .ok_or_else(internal)
}

fn f64_property(value: &Map<String, Value>, name: &str) -> LoweringResult<f64> {
    f64_value(value.get(name).ok_or_else(internal)?)
}

fn f64_value(value: &Value) -> LoweringResult<f64> {
    value.as_f64().ok_or_else(internal)
}

fn u64_property(value: &Map<String, Value>, name: &str) -> LoweringResult<u64> {
    u64_value(value.get(name).ok_or_else(internal)?)
}

fn u64_value(value: &Value) -> LoweringResult<u64> {
    if let Some(value) = value.as_u64() {
        return Ok(value);
    }
    let value = value.as_f64().ok_or_else(internal)?;
    if value.is_finite() && (0.0..=9_007_199_254_740_991.0).contains(&value) && value.fract() == 0.0
    {
        return Ok(value as u64);
    }
    Err(internal())
}

const fn error(kind: EvaluationLoweringErrorKind) -> EvaluationLoweringError {
    EvaluationLoweringError::new(kind)
}

const fn internal() -> EvaluationLoweringError {
    error(EvaluationLoweringErrorKind::Internal)
}

const fn resource() -> EvaluationLoweringError {
    error(EvaluationLoweringErrorKind::ResourceLimitExceeded)
}
