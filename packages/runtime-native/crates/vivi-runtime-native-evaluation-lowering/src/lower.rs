use serde_json::{Map, Value};
use vivi_runtime_native_preactivation::{
    CorrelatedEvaluationActivationV1, EvaluationTexturePlanV1, ValidatedEvaluationPayloadV1,
    correlate_evaluation_activation_v1,
};

use crate::error::{EvaluationLoweringError, EvaluationLoweringErrorKind};
use crate::model::*;
#[cfg(test)]
use crate::reservation::ReservationDenialKeyV1;
use crate::reservation::{Category9ReservationBuffersV1, Category9SiteCountsV1};

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
    lower_correlated(correlated)
}

fn lower_correlated(
    correlated: CorrelatedEvaluationActivationV1,
) -> LoweringResult<EvaluationLoweringFoundationV1> {
    #[cfg(not(test))]
    {
        lower_correlated_impl(correlated)
    }
    #[cfg(test)]
    {
        lower_correlated_impl(correlated, None)
    }
}

#[cfg(test)]
pub(crate) fn lower_correlated_with_test_denial(
    correlated: CorrelatedEvaluationActivationV1,
    denial: ReservationDenialKeyV1,
) -> LoweringResult<EvaluationLoweringFoundationV1> {
    lower_correlated_impl(correlated, Some(denial))
}

fn lower_correlated_impl(
    correlated: CorrelatedEvaluationActivationV1,
    #[cfg(test)] denial: Option<ReservationDenialKeyV1>,
) -> LoweringResult<EvaluationLoweringFoundationV1> {
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

    let mut census = census_category9(root, layers)?;
    let site_counts = Category9SiteCountsV1::try_from_ordered(census.site_counts())?;
    census.finish_incumbent_usize_defenses()?;
    #[cfg(not(test))]
    let mut buffers = Category9ReservationBuffersV1::reserve_all(&site_counts)?;
    #[cfg(test)]
    let mut buffers = match denial {
        Some(key) => {
            Category9ReservationBuffersV1::reserve_all_with_test_denial(&site_counts, key)?
        }
        None => Category9ReservationBuffersV1::reserve_all(&site_counts)?,
    };

    let (inline_physics_group, inline_ik_controller) =
        materialize_category9(root, layers, &census, &mut buffers)?;
    let (reservation_plan, reserved_capacities) =
        buffers.finish(inline_physics_group, inline_ik_controller);

    let canvas = object_property(root, "canvas")?;
    let canvas_width = replay_u64_property(canvas, "width")?;
    let canvas_height = replay_u64_property(canvas, "height")?;

    let foundation = EvaluationLoweringFoundationV1 {
        generation,
        canvas_width,
        canvas_height,
        direct_projected_scalar_count: census.direct_projected_scalar_count_usize,
        derived_evaluation_mesh_count: census.derived_evaluation_mesh_count_usize,
        mask_edge_count: census.mask_edge_count_usize,
        candidate,
        texture_plan,
        reservation_plan,
    };
    Category9ReservationBuffersV1::verify_plan(
        &foundation.reservation_plan,
        &site_counts,
        &reserved_capacities,
    )?;
    let retained_root = object(foundation.candidate.value())?;
    let retained_layers = array_property(retained_root, "layers")?;
    verify_materialized_category9(
        retained_root,
        retained_layers,
        &census,
        &foundation.reservation_plan,
    )?;
    Ok(foundation)
}

#[cfg(test)]
pub(crate) fn verify_category9_step40_for_test(
    foundation: &EvaluationLoweringFoundationV1,
) -> LoweringResult<()> {
    let root = object(foundation.candidate.value())?;
    let layers = array_property(root, "layers")?;
    let mut census = census_category9(root, layers)?;
    let site_counts = Category9SiteCountsV1::try_from_ordered(census.site_counts())?;
    census.finish_incumbent_usize_defenses()?;
    Category9ReservationBuffersV1::verify_plan_with_current_capacities_for_test(
        &foundation.reservation_plan,
        &site_counts,
    )?;
    verify_materialized_category9(root, layers, &census, &foundation.reservation_plan)
}

#[derive(Default)]
struct FoundationCounts {
    mesh_count: u32,
    direct_unskinned_vertex_components: u32,
    uv_component_count: u32,
    index_count: u32,
    symbol_byte_count: u32,
    parameter_count: u32,
    preset_count: u32,
    preset_value_count: u32,
    binding_count: u32,
    binding_point_count: u32,
    binding_target_count: u32,
    bone_count: u32,
    enabled_physics_group_count: u32,
    enabled_pendulum_count: u32,
    enabled_physics_input_count: u32,
    enabled_physics_output_count: u32,
    controller_count: u32,
    controller_constraint_count: u32,
    skinned_mesh_count: u32,
    skinned_vertex_count: u32,
    skin_weight_count: u32,
    usable_bind_inverse_count: u32,
    skinned_coordinate_count: u32,
    staged_parameter_destination_count: u32,
    staged_bone_destination_count: u32,
    pre_world_count: u32,
    post_world_count: u32,
    direct_projected_scalar_count: u32,
    derived_evaluation_mesh_count: u32,
    mask_edge_count: u32,
    direct_projected_scalar_count_usize: usize,
    derived_evaluation_mesh_count_usize: usize,
    mask_edge_count_usize: usize,
}

impl FoundationCounts {
    const fn site_counts(&self) -> [u32; 39] {
        [
            self.mesh_count,
            self.direct_unskinned_vertex_components,
            self.uv_component_count,
            self.index_count,
            self.symbol_byte_count,
            self.parameter_count,
            self.preset_count,
            self.preset_value_count,
            self.binding_count,
            self.binding_point_count,
            self.binding_target_count,
            self.bone_count,
            self.bone_count,
            self.mesh_count,
            self.skinned_mesh_count,
            self.enabled_pendulum_count,
            self.enabled_physics_input_count,
            self.enabled_physics_output_count,
            self.controller_constraint_count,
            self.skinned_vertex_count,
            self.skin_weight_count,
            self.usable_bind_inverse_count,
            self.skinned_coordinate_count,
            self.parameter_count,
            self.parameter_count,
            self.parameter_count,
            self.staged_parameter_destination_count,
            self.binding_target_count,
            self.bone_count,
            self.bone_count,
            self.staged_bone_destination_count,
            self.enabled_pendulum_count,
            self.enabled_pendulum_count,
            self.pre_world_count,
            self.post_world_count,
            self.controller_constraint_count,
            self.skinned_coordinate_count,
            self.skinned_coordinate_count,
            self.skinned_coordinate_count,
        ]
    }

    fn finish_incumbent_usize_defenses(&mut self) -> LoweringResult<()> {
        self.direct_projected_scalar_count_usize =
            usize::try_from(self.direct_projected_scalar_count).map_err(|_| resource())?;
        self.derived_evaluation_mesh_count_usize =
            usize::try_from(self.derived_evaluation_mesh_count).map_err(|_| resource())?;
        self.mask_edge_count_usize =
            usize::try_from(self.mask_edge_count).map_err(|_| resource())?;
        Ok(())
    }
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

#[derive(Clone, Copy)]
enum LayerFormulaV1 {
    MeshCount,
    DirectUnskinnedVertexComponents,
    UvComponentCount,
    IndexCount,
    BoneCount,
    SkinnedMeshCount,
    SkinnedVertexCount,
    DirectProjectedScalarCount,
    MaskEdgeCount,
}

fn census_category9(
    root: &Map<String, Value>,
    layers: &[Value],
) -> LoweringResult<FoundationCounts> {
    let skins = object_property(root, "skins")?;
    let parameters = array_property(root, "parameters")?;
    let presets = array_property(root, "expressionPresets")?;
    let bindings = array_property(root, "parameterBindings")?;
    let physics_groups = array_property(root, "physicsGroups")?;
    let controllers = array_property(root, "ikControllers")?;
    let mut counts = FoundationCounts {
        // Formula programs 1-4.
        mesh_count: count_layer_formula(layers, skins, LayerFormulaV1::MeshCount)?,
        direct_unskinned_vertex_components: count_layer_formula(
            layers,
            skins,
            LayerFormulaV1::DirectUnskinnedVertexComponents,
        )?,
        uv_component_count: count_layer_formula(layers, skins, LayerFormulaV1::UvComponentCount)?,
        index_count: count_layer_formula(layers, skins, LayerFormulaV1::IndexCount)?,
        ..FoundationCounts::default()
    };

    // Formula programs 5-12.
    let mut parameter_symbol_bytes = 0_u32;
    for parameter in parameters {
        parameter_symbol_bytes = checked_add_u32(
            parameter_symbol_bytes,
            checked_len(string_property(object(parameter)?, "id")?.as_bytes())?,
        )?;
    }
    let mut preset_symbol_bytes = 0_u32;
    for preset in presets {
        preset_symbol_bytes = checked_add_u32(
            preset_symbol_bytes,
            checked_len(string_property(object(preset)?, "id")?.as_bytes())?,
        )?;
    }
    counts.symbol_byte_count = checked_add_u32(parameter_symbol_bytes, preset_symbol_bytes)?;
    counts.parameter_count = checked_len(parameters)?;
    counts.preset_count = checked_len(presets)?;
    for preset in presets {
        counts.preset_value_count = checked_add_u32(
            counts.preset_value_count,
            checked_map_len(object_property(object(preset)?, "values")?)?,
        )?;
    }
    counts.binding_count = checked_len(bindings)?;
    for binding in bindings {
        counts.binding_point_count = checked_add_u32(
            counts.binding_point_count,
            checked_len(array_property(object(binding)?, "bindingPoints")?)?,
        )?;
    }
    counts.binding_target_count = count_unique_binding_targets(bindings)?;
    counts.bone_count = count_layer_formula(layers, skins, LayerFormulaV1::BoneCount)?;

    // Formula programs 13-18.
    let enabled_physics = enabled_physics_group(physics_groups)?;
    counts.enabled_physics_group_count = u32::from(enabled_physics.is_some());
    if let Some((_, group)) = enabled_physics {
        counts.enabled_pendulum_count = checked_len(array_property(group, "pendulums")?)?;
        counts.enabled_physics_input_count = checked_len(array_property(group, "inputs")?)?;
        counts.enabled_physics_output_count = checked_len(array_property(group, "outputs")?)?;
    }
    counts.controller_count = checked_len(controllers)?;
    if let Some(controller) = controllers.first() {
        counts.controller_constraint_count =
            checked_len(array_property(object(controller)?, "boneChain")?)?;
    }

    // Formula programs 19-30.
    counts.skinned_mesh_count =
        count_layer_formula(layers, skins, LayerFormulaV1::SkinnedMeshCount)?;
    counts.skinned_vertex_count =
        count_layer_formula(layers, skins, LayerFormulaV1::SkinnedVertexCount)?;
    counts.skin_weight_count = count_skin_weight_entries(layers, skins)?;
    counts.usable_bind_inverse_count = count_usable_bind_inverses(layers, skins)?;
    counts.skinned_coordinate_count = checked_mul_u32(counts.skinned_vertex_count, 2)?;
    if let Some((_, group)) = enabled_physics {
        let outputs = array_property(group, "outputs")?;
        counts.staged_parameter_destination_count =
            count_unique_physics_destinations(outputs, "angle")?;
        counts.staged_bone_destination_count =
            count_unique_physics_destinations(outputs, "boneAngle")?;
    }
    counts.pre_world_count = if counts.controller_count == 1 {
        counts.bone_count
    } else {
        0
    };
    counts.post_world_count = counts.bone_count;
    counts.direct_projected_scalar_count =
        count_layer_formula(layers, skins, LayerFormulaV1::DirectProjectedScalarCount)?;
    counts.derived_evaluation_mesh_count = counts.skinned_mesh_count;
    counts.mask_edge_count = count_layer_formula(layers, skins, LayerFormulaV1::MaskEdgeCount)?;

    // Formula programs 31-41 are checked prefix-range programs. Their values
    // are deliberately discarded here and reproduced infallibly during fill.
    validate_category9_prefix_ranges(root, layers, skins)?;

    Ok(counts)
}

fn count_layer_formula(
    layers: &[Value],
    skins: &Map<String, Value>,
    formula: LayerFormulaV1,
) -> LoweringResult<u32> {
    let mut count = 0_u32;
    visit_layers(layers, true, &mut |layer, _| {
        let kind = string_property(layer, "kind")?;
        if kind == "bone" && matches!(formula, LayerFormulaV1::BoneCount) {
            count = checked_add_u32(count, 1)?;
        }
        if kind != "viviMesh" {
            return Ok(());
        }
        let skinned = skins.contains_key(string_property(layer, "id")?);
        let mesh = object_property(layer, "mesh")?;
        let delta = match formula {
            LayerFormulaV1::MeshCount => 1,
            LayerFormulaV1::DirectUnskinnedVertexComponents if !skinned => {
                checked_len(array_property(mesh, "vertices")?)?
            }
            LayerFormulaV1::UvComponentCount => checked_len(array_property(mesh, "uvs")?)?,
            LayerFormulaV1::IndexCount => checked_len(array_property(mesh, "indices")?)?,
            LayerFormulaV1::SkinnedMeshCount if skinned => 1,
            LayerFormulaV1::SkinnedVertexCount if skinned => {
                let components = checked_len(array_property(mesh, "vertices")?)?;
                if components % 2 != 0 {
                    return Err(internal());
                }
                components / 2
            }
            LayerFormulaV1::DirectProjectedScalarCount => {
                let mut projected = 0_u32;
                if !skinned {
                    let vertex_and_xy =
                        checked_add_u32(checked_len(array_property(mesh, "vertices")?)?, 2)?;
                    projected = checked_add_u32(projected, vertex_and_xy)?;
                }
                projected = checked_add_u32(projected, checked_len(array_property(mesh, "uvs")?)?)?;
                projected = checked_add_u32(projected, 1)?;
                if layer.contains_key("multiplyColor") {
                    projected = checked_add_u32(projected, 3)?;
                }
                if let Some(screen) = layer.get("screenColor")
                    && !color_is_black(object(screen)?)?
                {
                    projected = checked_add_u32(projected, 3)?;
                }
                projected
            }
            LayerFormulaV1::MaskEdgeCount => {
                u32::try_from(normalized_mask_edge_count(layer)?).map_err(|_| resource())?
            }
            _ => 0,
        };
        count = checked_add_u32(count, delta)?;
        Ok(())
    })?;
    Ok(count)
}

fn count_unique_binding_targets(bindings: &[Value]) -> LoweringResult<u32> {
    let mut count = 0_u32;
    for (index, binding) in bindings.iter().enumerate() {
        let binding = object(binding)?;
        let target = object_property(binding, "target")?;
        let mut first = true;
        for prior in &bindings[..index] {
            if binding_targets_equal(target, object_property(object(prior)?, "target")?)? {
                first = false;
                break;
            }
        }
        if first {
            count = checked_add_u32(count, 1)?;
        }
    }
    Ok(count)
}

fn count_skin_weight_entries(layers: &[Value], skins: &Map<String, Value>) -> LoweringResult<u32> {
    let mut count = 0_u32;
    visit_layers(layers, true, &mut |layer, _| {
        if string_property(layer, "kind")? != "viviMesh" {
            return Ok(());
        }
        let Some(skin) = skins.get(string_property(layer, "id")?) else {
            return Ok(());
        };
        for row in array_property(object(skin)?, "weights")? {
            count = checked_add_u32(count, checked_len(array(row)?)?)?;
        }
        Ok(())
    })?;
    Ok(count)
}

fn count_usable_bind_inverses(layers: &[Value], skins: &Map<String, Value>) -> LoweringResult<u32> {
    let mut count = 0_u32;
    visit_layers(layers, true, &mut |layer, _| {
        if string_property(layer, "kind")? != "viviMesh" {
            return Ok(());
        }
        let Some(skin) = skins.get(string_property(layer, "id")?) else {
            return Ok(());
        };
        let skin = object(skin)?;
        let bind_inverse = object_property(skin, "bindPoseInverse")?;
        visit_layers(layers, true, &mut |bone, _| {
            if string_property(bone, "kind")? != "bone" {
                return Ok(());
            }
            let bone_id = string_property(bone, "id")?;
            if bind_inverse.contains_key(bone_id) && skin_references_bone(skin, bone_id)? {
                count = checked_add_u32(count, 1)?;
            }
            Ok(())
        })
    })?;
    Ok(count)
}

fn count_unique_physics_destinations(outputs: &[Value], output_type: &str) -> LoweringResult<u32> {
    let mut count = 0_u32;
    for (index, output) in outputs.iter().enumerate() {
        let output = object(output)?;
        if string_property(output, "type")? != output_type {
            continue;
        }
        let destination = physics_output_destination_id(output)?;
        let mut first = true;
        for prior in &outputs[..index] {
            let prior = object(prior)?;
            if string_property(prior, "type")? == output_type
                && physics_output_destination_id(prior)?.as_bytes() == destination.as_bytes()
            {
                first = false;
                break;
            }
        }
        if first {
            count = checked_add_u32(count, 1)?;
        }
    }
    Ok(count)
}

fn validate_category9_prefix_ranges(
    root: &Map<String, Value>,
    layers: &[Value],
    skins: &Map<String, Value>,
) -> LoweringResult<()> {
    // 31-33: direct vertex, UV, and index ranges.
    for mode in [0_u8, 1, 2] {
        let mut prefix = 0_u32;
        visit_layers(layers, true, &mut |layer, _| {
            if string_property(layer, "kind")? != "viviMesh" {
                return Ok(());
            }
            let mesh = object_property(layer, "mesh")?;
            let skinned = skins.contains_key(string_property(layer, "id")?);
            let len = match mode {
                0 if skinned => 0,
                0 => checked_len(array_property(mesh, "vertices")?)?,
                1 => checked_len(array_property(mesh, "uvs")?)?,
                _ => checked_len(array_property(mesh, "indices")?)?,
            };
            let _ = checked_range(&mut prefix, len)?;
            Ok(())
        })?;
    }

    // 34: symbol arena ranges, parameters then presets.
    let mut prefix = 0_u32;
    for collection in [
        array_property(root, "parameters")?,
        array_property(root, "expressionPresets")?,
    ] {
        for row in collection {
            let len = checked_len(string_property(object(row)?, "id")?.as_bytes())?;
            let _ = checked_range(&mut prefix, len)?;
        }
    }

    // 35-36: preset-value and binding-point ranges.
    let mut prefix = 0_u32;
    for preset in array_property(root, "expressionPresets")? {
        let len = checked_map_len(object_property(object(preset)?, "values")?)?;
        let _ = checked_range(&mut prefix, len)?;
    }
    let mut prefix = 0_u32;
    for binding in array_property(root, "parameterBindings")? {
        let len = checked_len(array_property(object(binding)?, "bindingPoints")?)?;
        let _ = checked_range(&mut prefix, len)?;
    }

    // 37: all skin rest ranges.
    let mut rest_prefix = 0_u32;
    visit_layers(layers, true, &mut |layer, _| {
        if string_property(layer, "kind")? != "viviMesh" {
            return Ok(());
        }
        let mesh_id = string_property(layer, "id")?;
        let Some(skin) = skins.get(mesh_id) else {
            return Ok(());
        };
        let skin = object(skin)?;
        let rows = array_property(skin, "weights")?;
        let row_count = checked_len(rows)?;
        let coordinate_count = checked_mul_u32(row_count, 2)?;
        let _ = checked_range(&mut rest_prefix, coordinate_count)?;
        Ok(())
    })?;

    // 38: all skin weight-row ranges.
    let mut row_prefix = 0_u32;
    visit_layers(layers, true, &mut |layer, _| {
        if string_property(layer, "kind")? != "viviMesh" {
            return Ok(());
        }
        let Some(skin) = skins.get(string_property(layer, "id")?) else {
            return Ok(());
        };
        let row_count = checked_len(array_property(object(skin)?, "weights")?)?;
        let _ = checked_range(&mut row_prefix, row_count)?;
        Ok(())
    })?;

    // 39: every weight-entry row range in mesh/vertex order.
    let mut weight_prefix = 0_u32;
    visit_layers(layers, true, &mut |layer, _| {
        if string_property(layer, "kind")? != "viviMesh" {
            return Ok(());
        }
        let Some(skin) = skins.get(string_property(layer, "id")?) else {
            return Ok(());
        };
        let rows = array_property(object(skin)?, "weights")?;
        for row in rows {
            let _ = checked_range(&mut weight_prefix, checked_len(array(row)?)?)?;
        }
        Ok(())
    })?;

    // 40: all sparse bind-inverse ranges.
    let mut bind_prefix = 0_u32;
    visit_layers(layers, true, &mut |layer, _| {
        if string_property(layer, "kind")? != "viviMesh" {
            return Ok(());
        }
        let Some(skin) = skins.get(string_property(layer, "id")?) else {
            return Ok(());
        };
        let skin = object(skin)?;
        let usable = usable_bind_inverse_count_for_skin(layers, skin)?;
        let _ = checked_range(&mut bind_prefix, usable)?;
        Ok(())
    })?;

    // 41: one derived range for every mesh, including canonical empty ranges.
    let mut derived_prefix = 0_u32;
    visit_layers(layers, true, &mut |layer, _| {
        if string_property(layer, "kind")? != "viviMesh" {
            return Ok(());
        }
        let len = if skins.contains_key(string_property(layer, "id")?) {
            checked_len(array_property(object_property(layer, "mesh")?, "vertices")?)?
        } else {
            0
        };
        let _ = checked_range(&mut derived_prefix, len)?;
        Ok(())
    })?;
    Ok(())
}

fn visit_layers<F>(layers: &[Value], ancestor_visible: bool, visitor: &mut F) -> LoweringResult<()>
where
    F: FnMut(&Map<String, Value>, bool) -> LoweringResult<()>,
{
    for layer in layers {
        let layer = object(layer)?;
        let effective_visible = ancestor_visible && bool_property(layer, "visible")?;
        visitor(layer, effective_visible)?;
        visit_layers(
            array_property(layer, "children")?,
            effective_visible,
            visitor,
        )?;
    }
    Ok(())
}

fn enabled_physics_group(groups: &[Value]) -> LoweringResult<Option<(u32, &Map<String, Value>)>> {
    let mut enabled = None;
    for (index, group) in groups.iter().enumerate() {
        let group = object(group)?;
        if bool_property(group, "enabled")? {
            if enabled.is_some() {
                return Err(internal());
            }
            enabled = Some((replay_u32(index), group));
        }
    }
    Ok(enabled)
}

fn binding_targets_equal(
    left: &Map<String, Value>,
    right: &Map<String, Value>,
) -> LoweringResult<bool> {
    let (left_kind, left_owner, left_property) = binding_target_key(left)?;
    let (right_kind, right_owner, right_property) = binding_target_key(right)?;
    Ok(left_kind.as_bytes() == right_kind.as_bytes()
        && left_owner.as_bytes() == right_owner.as_bytes()
        && left_property.as_bytes() == right_property.as_bytes())
}

fn binding_target_key(target: &Map<String, Value>) -> LoweringResult<(&str, &str, &str)> {
    let kind = string_property(target, "type")?;
    let owner = match kind {
        "bone" => string_property(target, "boneId")?,
        "ikController" => string_property(target, "controllerId")?,
        _ => return Err(internal()),
    };
    Ok((kind, owner, string_property(target, "property")?))
}

fn physics_output_destination_id(output: &Map<String, Value>) -> LoweringResult<&str> {
    match string_property(output, "type")? {
        "angle" => string_property(output, "parameterId"),
        "boneAngle" => string_property(output, "boneId"),
        _ => Err(internal()),
    }
}

fn skin_references_bone(skin: &Map<String, Value>, bone_id: &str) -> LoweringResult<bool> {
    for row in array_property(skin, "weights")? {
        for weight in array(row)? {
            if string_property(object(weight)?, "boneId")?.as_bytes() == bone_id.as_bytes() {
                return Ok(true);
            }
        }
    }
    Ok(false)
}

fn usable_bind_inverse_count_for_skin(
    layers: &[Value],
    skin: &Map<String, Value>,
) -> LoweringResult<u32> {
    let bind_inverse = object_property(skin, "bindPoseInverse")?;
    let mut count = 0_u32;
    visit_layers(layers, true, &mut |bone, _| {
        if string_property(bone, "kind")? != "bone" {
            return Ok(());
        }
        let bone_id = string_property(bone, "id")?;
        if bind_inverse.contains_key(bone_id) && skin_references_bone(skin, bone_id)? {
            count = checked_add_u32(count, 1)?;
        }
        Ok(())
    })?;
    Ok(count)
}

fn replay_usable_bind_inverse_count_for_skin(
    layers: &[Value],
    skin: &Map<String, Value>,
) -> LoweringResult<u32> {
    let bind_inverse = object_property(skin, "bindPoseInverse")?;
    let mut count = 0_u32;
    visit_layers(layers, true, &mut |bone, _| {
        if string_property(bone, "kind")? != "bone" {
            return Ok(());
        }
        let bone_id = string_property(bone, "id")?;
        if bind_inverse.contains_key(bone_id) && skin_references_bone(skin, bone_id)? {
            debug_assert!(count < u32::MAX);
            count = count.wrapping_add(1);
        }
        Ok(())
    })?;
    Ok(count)
}

fn checked_range(prefix: &mut u32, len: u32) -> LoweringResult<RangeV1> {
    let start = *prefix;
    *prefix = checked_add_u32(start, len)?;
    Ok(RangeV1 { start, len })
}

fn checked_len<T>(values: &[T]) -> LoweringResult<u32> {
    u32::try_from(values.len()).map_err(|_| resource())
}

fn checked_map_len(values: &Map<String, Value>) -> LoweringResult<u32> {
    u32::try_from(values.len()).map_err(|_| resource())
}

fn checked_add_u32(left: u32, right: u32) -> LoweringResult<u32> {
    left.checked_add(right).ok_or_else(resource)
}

fn checked_mul_u32(left: u32, right: u32) -> LoweringResult<u32> {
    left.checked_mul(right).ok_or_else(resource)
}

fn materialize_category9(
    root: &Map<String, Value>,
    layers: &[Value],
    counts: &FoundationCounts,
    buffers: &mut Category9ReservationBuffersV1,
) -> LoweringResult<(InlinePhysicsGroupV1, InlineIkControllerV1)> {
    let skins = object_property(root, "skins")?;

    // Step 1 spans the four existing direct sites in recursive mesh-major
    // field order. No typed-plan table is touched until this pass completes.
    materialize_direct_meshes(layers, skins, counts, buffers)?;

    // Steps 2-5: symbols, parameter specs, preset specs, and sorted values.
    materialize_parameter_tables(root, counts, buffers)?;

    // Steps 6-8: binding specs, points, and unique target defaults.
    materialize_binding_tables(root, layers, counts, buffers)?;

    // Steps 9-12: bone/world order and mesh/skin immutable specs.
    materialize_bone_tables(layers, counts, buffers)?;
    materialize_mesh_and_skin_specs(layers, skins, counts, buffers)?;

    // Steps 13-16: physics config/input/output and IK constraints.
    materialize_physics_and_ik(root, layers, counts, buffers)?;

    // Steps 17-20: skin row/weight/bind/rest immutable tables.
    materialize_skin_tables(layers, skins, counts, buffers)?;

    // Steps 21-36: retained state and scratch buffers.
    materialize_state_and_scratch(root, layers, counts, buffers)?;

    // Steps 37-38 are the two exactly-one inline records.
    let inline_physics_group = materialize_inline_physics(root, counts)?;
    let inline_ik_controller = materialize_inline_ik(root, counts)?;
    Ok((inline_physics_group, inline_ik_controller))
}

fn verify_materialized_category9(
    root: &Map<String, Value>,
    layers: &[Value],
    counts: &FoundationCounts,
    plan: &Category9ReservationPlanV1,
) -> LoweringResult<()> {
    let skins = object_property(root, "skins")?;
    verify_direct_ranges(layers, skins, counts, plan)?;
    verify_parameter_ranges(root, counts, plan)?;
    verify_binding_ranges(root, counts, plan)?;
    verify_skin_ranges(layers, skins, counts, plan)?;
    verify_skin_weight_ranges(layers, skins, counts, plan)?;
    verify_derived_ranges_and_mesh_links(layers, skins, counts, plan)?;
    verify_inline_ranges(root, counts, plan)?;
    verify_binding_target_links(root, layers, plan)?;
    verify_physics_stage_links(root, layers, plan)?;
    verify_world_order_links(plan)
}

fn verify_exact_range(actual: RangeV1, prefix: &mut u32, expected_len: u32) -> LoweringResult<()> {
    if actual.start != *prefix || actual.len != expected_len {
        return Err(internal());
    }
    *prefix = prefix.checked_add(expected_len).ok_or_else(internal)?;
    Ok(())
}

fn verify_range_total(prefix: u32, expected: u32, actual_len: usize) -> LoweringResult<()> {
    if prefix != expected || usize::try_from(prefix).map_err(|_| internal())? != actual_len {
        return Err(internal());
    }
    Ok(())
}

fn verify_u32_len<T>(values: &[T]) -> LoweringResult<u32> {
    u32::try_from(values.len()).map_err(|_| internal())
}

fn verify_u32_map_len(values: &Map<String, Value>) -> LoweringResult<u32> {
    u32::try_from(values.len()).map_err(|_| internal())
}

fn verify_direct_ranges(
    layers: &[Value],
    skins: &Map<String, Value>,
    counts: &FoundationCounts,
    plan: &Category9ReservationPlanV1,
) -> LoweringResult<()> {
    let mut mesh_index = 0_usize;
    let mut vertex_prefix = 0_u32;
    let mut uv_prefix = 0_u32;
    let mut index_prefix = 0_u32;
    visit_layers(layers, true, &mut |layer, _| {
        if string_property(layer, "kind")? != "viviMesh" {
            return Ok(());
        }
        let record = plan
            .direct_mesh_records
            .get(mesh_index)
            .ok_or_else(internal)?;
        let mesh = object_property(layer, "mesh")?;
        let vertices = array_property(mesh, "vertices")?;
        let uvs = array_property(mesh, "uvs")?;
        let indices = array_property(mesh, "indices")?;
        let skinned = skins.contains_key(string_property(layer, "id")?);
        let vertex_len = if skinned {
            0
        } else {
            verify_u32_len(vertices)?
        };
        verify_exact_range(record.vertex_range, &mut vertex_prefix, vertex_len)?;
        verify_exact_range(record.uv_range, &mut uv_prefix, verify_u32_len(uvs)?)?;
        verify_exact_range(
            record.index_range,
            &mut index_prefix,
            verify_u32_len(indices)?,
        )?;

        let first = usize::try_from(record.index_range.start).map_err(|_| internal())?;
        for (offset, source_index) in indices.iter().enumerate() {
            let actual = plan
                .direct_indices
                .get(first.checked_add(offset).ok_or_else(internal)?)
                .ok_or_else(internal)?;
            let expected =
                u32::try_from(replay_u64_value(source_index)?).map_err(|_| internal())?;
            let vertex_count = verify_u32_len(vertices)? / 2;
            if actual.value != expected || actual.value >= vertex_count {
                return Err(internal());
            }
        }
        mesh_index = mesh_index.checked_add(1).ok_or_else(internal)?;
        Ok(())
    })?;
    if mesh_index != plan.direct_mesh_records.len() {
        return Err(internal());
    }
    verify_range_total(
        vertex_prefix,
        counts.direct_unskinned_vertex_components,
        plan.direct_unskinned_vertices.len(),
    )?;
    verify_range_total(uv_prefix, counts.uv_component_count, plan.direct_uvs.len())?;
    verify_range_total(index_prefix, counts.index_count, plan.direct_indices.len())
}

fn verify_parameter_ranges(
    root: &Map<String, Value>,
    counts: &FoundationCounts,
    plan: &Category9ReservationPlanV1,
) -> LoweringResult<()> {
    let parameters = array_property(root, "parameters")?;
    let presets = array_property(root, "expressionPresets")?;
    let mut symbol_prefix = 0_u32;
    for (index, parameter) in parameters.iter().enumerate() {
        let expected_len = u32::try_from(string_property(object(parameter)?, "id")?.len())
            .map_err(|_| internal())?;
        let actual = plan.parameter_specs.get(index).ok_or_else(internal)?;
        verify_exact_range(actual.symbol_range, &mut symbol_prefix, expected_len)?;
    }

    let mut value_prefix = 0_u32;
    for (index, preset) in presets.iter().enumerate() {
        let preset = object(preset)?;
        let actual = plan
            .parameter_preset_specs
            .get(index)
            .ok_or_else(internal)?;
        let symbol_len =
            u32::try_from(string_property(preset, "id")?.len()).map_err(|_| internal())?;
        verify_exact_range(actual.symbol_range, &mut symbol_prefix, symbol_len)?;
        verify_exact_range(
            actual.value_range,
            &mut value_prefix,
            verify_u32_map_len(object_property(preset, "values")?)?,
        )?;
    }
    verify_range_total(
        symbol_prefix,
        counts.symbol_byte_count,
        plan.parameter_symbol_bytes.len(),
    )?;
    verify_range_total(
        value_prefix,
        counts.preset_value_count,
        plan.parameter_preset_values.len(),
    )
}

fn verify_binding_ranges(
    root: &Map<String, Value>,
    counts: &FoundationCounts,
    plan: &Category9ReservationPlanV1,
) -> LoweringResult<()> {
    let bindings = array_property(root, "parameterBindings")?;
    let mut point_prefix = 0_u32;
    for (index, binding) in bindings.iter().enumerate() {
        let expected_len = verify_u32_len(array_property(object(binding)?, "bindingPoints")?)?;
        let actual = plan.binding_specs.get(index).ok_or_else(internal)?;
        verify_exact_range(actual.point_range, &mut point_prefix, expected_len)?;
    }
    verify_range_total(
        point_prefix,
        counts.binding_point_count,
        plan.binding_points.len(),
    )
}

fn verify_skin_ranges(
    layers: &[Value],
    skins: &Map<String, Value>,
    counts: &FoundationCounts,
    plan: &Category9ReservationPlanV1,
) -> LoweringResult<()> {
    let mut mesh_slot_value = 0_u32;
    let mut skin_index = 0_usize;
    let mut rest_prefix = 0_u32;
    let mut row_prefix = 0_u32;
    let mut bind_prefix = 0_u32;
    visit_layers(layers, true, &mut |layer, _| {
        if string_property(layer, "kind")? != "viviMesh" {
            return Ok(());
        }
        let mesh_id = string_property(layer, "id")?;
        if let Some(skin) = skins.get(mesh_id) {
            let skin = object(skin)?;
            let actual = plan.skin_mesh_specs.get(skin_index).ok_or_else(internal)?;
            if actual.mesh_slot != mesh_slot_value {
                return Err(internal());
            }
            let vertices = array_property(object_property(layer, "mesh")?, "vertices")?;
            let rows = array_property(skin, "weights")?;
            verify_exact_range(
                actual.rest_range,
                &mut rest_prefix,
                verify_u32_len(vertices)?,
            )?;
            verify_exact_range(
                actual.weight_row_range,
                &mut row_prefix,
                verify_u32_len(rows)?,
            )?;
            verify_exact_range(
                actual.bind_inverse_range,
                &mut bind_prefix,
                verify_usable_bind_inverse_count(layers, skin)?,
            )?;
            skin_index = skin_index.checked_add(1).ok_or_else(internal)?;
        }
        mesh_slot_value = mesh_slot_value.checked_add(1).ok_or_else(internal)?;
        Ok(())
    })?;
    if skin_index != plan.skin_mesh_specs.len() {
        return Err(internal());
    }
    verify_range_total(
        rest_prefix,
        counts.skinned_coordinate_count,
        plan.skin_rest_coordinates.len(),
    )?;
    verify_range_total(
        row_prefix,
        counts.skinned_vertex_count,
        plan.skin_weight_rows.len(),
    )?;
    verify_range_total(
        bind_prefix,
        counts.usable_bind_inverse_count,
        plan.skin_bind_inverses.len(),
    )
}

fn verify_usable_bind_inverse_count(
    layers: &[Value],
    skin: &Map<String, Value>,
) -> LoweringResult<u32> {
    let bind_pose = object_property(skin, "bindPoseInverse")?;
    let mut count = 0_u32;
    visit_layers(layers, true, &mut |bone, _| {
        if string_property(bone, "kind")? == "bone" {
            let bone_id = string_property(bone, "id")?;
            if bind_pose.contains_key(bone_id) && skin_references_bone(skin, bone_id)? {
                count = count.checked_add(1).ok_or_else(internal)?;
            }
        }
        Ok(())
    })?;
    Ok(count)
}

fn verify_skin_weight_ranges(
    layers: &[Value],
    skins: &Map<String, Value>,
    counts: &FoundationCounts,
    plan: &Category9ReservationPlanV1,
) -> LoweringResult<()> {
    let mut row_index = 0_usize;
    let mut weight_prefix = 0_u32;
    visit_layers(layers, true, &mut |layer, _| {
        if string_property(layer, "kind")? != "viviMesh" {
            return Ok(());
        }
        let Some(skin) = skins.get(string_property(layer, "id")?) else {
            return Ok(());
        };
        for row in array_property(object(skin)?, "weights")? {
            let actual = plan.skin_weight_rows.get(row_index).ok_or_else(internal)?;
            verify_exact_range(
                actual.weights,
                &mut weight_prefix,
                verify_u32_len(array(row)?)?,
            )?;
            row_index = row_index.checked_add(1).ok_or_else(internal)?;
        }
        Ok(())
    })?;
    if row_index != plan.skin_weight_rows.len() {
        return Err(internal());
    }
    verify_range_total(
        weight_prefix,
        counts.skin_weight_count,
        plan.skin_weights.len(),
    )
}

fn verify_derived_ranges_and_mesh_links(
    layers: &[Value],
    skins: &Map<String, Value>,
    counts: &FoundationCounts,
    plan: &Category9ReservationPlanV1,
) -> LoweringResult<()> {
    let mut mesh_index = 0_usize;
    let mut skin_index = 0_usize;
    let mut derived_prefix = 0_u32;
    visit_layers(layers, true, &mut |layer, _| {
        if string_property(layer, "kind")? != "viviMesh" {
            return Ok(());
        }
        let direct = plan
            .direct_mesh_records
            .get(mesh_index)
            .ok_or_else(internal)?;
        let evaluator = plan
            .mesh_evaluator_specs
            .get(mesh_index)
            .ok_or_else(internal)?;
        let mesh_slot_value = u32::try_from(mesh_index).map_err(|_| internal())?;
        if direct.mesh_slot != mesh_slot_value || evaluator.mesh_slot != mesh_slot_value {
            return Err(internal());
        }
        let skinned = skins.contains_key(string_property(layer, "id")?);
        let derived_len = if skinned {
            verify_u32_len(array_property(object_property(layer, "mesh")?, "vertices")?)?
        } else {
            0
        };
        verify_exact_range(evaluator.derived_range, &mut derived_prefix, derived_len)?;
        if (direct.flags & 1 != 0) == skinned || (evaluator.static_flags & 1 != 0) != skinned {
            return Err(internal());
        }
        if skinned {
            let expected_skin_slot = u32::try_from(skin_index).map_err(|_| internal())?;
            let skin = plan.skin_mesh_specs.get(skin_index).ok_or_else(internal)?;
            if evaluator.skin_slot != expected_skin_slot
                || skin.mesh_slot != mesh_slot_value
                || skin.derived_range != evaluator.derived_range
                || skin.rest_range != evaluator.derived_range
            {
                return Err(internal());
            }
            skin_index = skin_index.checked_add(1).ok_or_else(internal)?;
        } else if evaluator.skin_slot != NONE_SLOT_V1 {
            return Err(internal());
        }
        mesh_index = mesh_index.checked_add(1).ok_or_else(internal)?;
        Ok(())
    })?;
    if mesh_index != plan.mesh_evaluator_specs.len() || skin_index != plan.skin_mesh_specs.len() {
        return Err(internal());
    }
    verify_range_total(
        derived_prefix,
        counts.skinned_coordinate_count,
        plan.derived_committed_coordinates.len(),
    )?;
    if plan.derived_update_coordinates.len() != plan.derived_committed_coordinates.len()
        || plan.skin_skinned_scratch.len() != plan.derived_committed_coordinates.len()
        || plan.skin_rest_coordinates.len() != plan.derived_committed_coordinates.len()
    {
        return Err(internal());
    }
    Ok(())
}

fn verify_inline_ranges(
    root: &Map<String, Value>,
    counts: &FoundationCounts,
    plan: &Category9ReservationPlanV1,
) -> LoweringResult<()> {
    match enabled_physics_group(array_property(root, "physicsGroups")?)? {
        None => {
            if plan.inline_physics_group != InlinePhysicsGroupV1::ABSENT {
                return Err(internal());
            }
        }
        Some((group_index, group)) => {
            let inline = plan.inline_physics_group;
            if inline.present != 1 || inline.group_index != group_index {
                return Err(internal());
            }
            let mut prefix = 0_u32;
            verify_exact_range(
                inline.pendulum_range,
                &mut prefix,
                verify_u32_len(array_property(group, "pendulums")?)?,
            )?;
            prefix = 0;
            verify_exact_range(
                inline.input_range,
                &mut prefix,
                verify_u32_len(array_property(group, "inputs")?)?,
            )?;
            prefix = 0;
            verify_exact_range(
                inline.output_range,
                &mut prefix,
                verify_u32_len(array_property(group, "outputs")?)?,
            )?;
            if inline.pendulum_range.len != counts.enabled_pendulum_count
                || inline.input_range.len != counts.enabled_physics_input_count
                || inline.output_range.len != counts.enabled_physics_output_count
            {
                return Err(internal());
            }
        }
    }

    let controllers = array_property(root, "ikControllers")?;
    match controllers.first() {
        None => {
            if plan.inline_ik_controller != InlineIkControllerV1::ABSENT {
                return Err(internal());
            }
        }
        Some(controller) => {
            let inline = plan.inline_ik_controller;
            if inline.present != 1 || inline.controller_index != 0 {
                return Err(internal());
            }
            let mut prefix = 0_u32;
            verify_exact_range(
                inline.constraint_range,
                &mut prefix,
                verify_u32_len(array_property(object(controller)?, "boneChain")?)?,
            )?;
            if inline.constraint_range.len != counts.controller_constraint_count {
                return Err(internal());
            }
        }
    }
    Ok(())
}

fn verify_binding_target_links(
    root: &Map<String, Value>,
    layers: &[Value],
    plan: &Category9ReservationPlanV1,
) -> LoweringResult<()> {
    let bindings = array_property(root, "parameterBindings")?;
    let parameters = array_property(root, "parameters")?;
    let controllers = array_property(root, "ikControllers")?;
    let mut next_first_occurrence = 0_u32;
    for (index, binding) in bindings.iter().enumerate() {
        let binding = object(binding)?;
        let spec = plan.binding_specs.get(index).ok_or_else(internal)?;
        let expected_parameter =
            parameter_slot(parameters, string_property(binding, "parameterId")?)?;
        let source_target = object_property(binding, "target")?;
        let expected_target = binding_target_slot(bindings, source_target)?;
        let (kind, owner_id, property) = binding_target_key(source_target)?;
        let (expected_kind, expected_owner) = match kind {
            "bone" => (0, bone_slot(layers, owner_id)?),
            "ikController" => (1, controller_slot(controllers, owner_id)?),
            _ => return Err(internal()),
        };
        let expected_property = binding_property_code(kind, property)?;
        let target = plan
            .binding_targets
            .get(usize::try_from(expected_target).map_err(|_| internal())?)
            .ok_or_else(internal)?;
        if spec.parameter_slot != expected_parameter
            || spec.target_slot != expected_target
            || (target.kind, target.property, target.owner_slot)
                != (expected_kind, expected_property, expected_owner)
            || usize::try_from(spec.target_slot).map_err(|_| internal())?
                >= plan.binding_targets.len()
        {
            return Err(internal());
        }
        if spec.target_slot == next_first_occurrence {
            next_first_occurrence = next_first_occurrence.checked_add(1).ok_or_else(internal)?;
        } else if spec.target_slot > next_first_occurrence {
            return Err(internal());
        }
    }
    if usize::try_from(next_first_occurrence).map_err(|_| internal())? != plan.binding_targets.len()
    {
        return Err(internal());
    }
    for (index, target) in plan.binding_targets.iter().enumerate() {
        if plan.binding_targets[..index].iter().any(|prior| {
            (prior.kind, prior.property, prior.owner_slot)
                == (target.kind, target.property, target.owner_slot)
        }) {
            return Err(internal());
        }
    }
    Ok(())
}

fn verify_physics_stage_links(
    root: &Map<String, Value>,
    layers: &[Value],
    plan: &Category9ReservationPlanV1,
) -> LoweringResult<()> {
    let parameters = array_property(root, "parameters")?;
    let Some((_, group)) = enabled_physics_group(array_property(root, "physicsGroups")?)? else {
        return if plan.physics_outputs.is_empty() {
            Ok(())
        } else {
            Err(internal())
        };
    };
    let outputs = array_property(group, "outputs")?;
    for (index, output) in outputs.iter().enumerate() {
        let output = object(output)?;
        let actual = plan.physics_outputs.get(index).ok_or_else(internal)?;
        let output_type = string_property(output, "type")?;
        let (expected_kind, expected_destination) = match output_type {
            "angle" => (
                0,
                parameter_slot(parameters, string_property(output, "parameterId")?)?,
            ),
            "boneAngle" => (1, bone_slot(layers, string_property(output, "boneId")?)?),
            _ => return Err(internal()),
        };
        let expected_stage = physics_stage_slot(outputs, output)?;
        let expected_pendulum =
            u32::try_from(replay_u64_property(output, "pendulumIndex")?).map_err(|_| internal())?;
        if actual.destination_kind != expected_kind
            || actual.destination_slot != expected_destination
            || actual.stage_slot != expected_stage
            || actual.pendulum_index != expected_pendulum
        {
            return Err(internal());
        }
        let staged_owner = match expected_kind {
            0 => plan
                .parameter_staged_destinations
                .get(usize::try_from(actual.stage_slot).map_err(|_| internal())?)
                .map(|value| value.owner_slot),
            1 => plan
                .bone_staged_destinations
                .get(usize::try_from(actual.stage_slot).map_err(|_| internal())?)
                .map(|value| value.owner_slot),
            _ => None,
        };
        if staged_owner != Some(actual.destination_slot) {
            return Err(internal());
        }
    }
    if outputs.len() != plan.physics_outputs.len() {
        return Err(internal());
    }
    Ok(())
}

fn verify_world_order_links(plan: &Category9ReservationPlanV1) -> LoweringResult<()> {
    if plan.bone_specs.len() != plan.bone_world_order_slots.len() {
        return Err(internal());
    }
    for (index, spec) in plan.bone_specs.iter().enumerate() {
        if spec.bone_slot != u32::try_from(index).map_err(|_| internal())?
            || (spec.parent_slot != NONE_SLOT_V1
                && usize::try_from(spec.parent_slot).map_err(|_| internal())?
                    >= plan.bone_specs.len())
        {
            return Err(internal());
        }
    }
    for position in 0..plan.bone_world_order_slots.len() {
        let mut selected = None;
        for spec in &plan.bone_specs {
            if plan.bone_world_order_slots[..position]
                .iter()
                .any(|slot| slot.value == spec.bone_slot)
            {
                continue;
            }
            let parent_ready = spec.parent_slot == NONE_SLOT_V1
                || plan.bone_world_order_slots[..position]
                    .iter()
                    .any(|slot| slot.value == spec.parent_slot);
            if parent_ready && selected.is_none_or(|slot| spec.bone_slot < slot) {
                selected = Some(spec.bone_slot);
            }
        }
        if Some(plan.bone_world_order_slots[position].value) != selected {
            return Err(internal());
        }
    }
    Ok(())
}

fn materialize_direct_meshes(
    layers: &[Value],
    skins: &Map<String, Value>,
    counts: &FoundationCounts,
    buffers: &mut Category9ReservationBuffersV1,
) -> LoweringResult<()> {
    let mut vertex_prefix = 0_u32;
    let mut uv_prefix = 0_u32;
    let mut index_prefix = 0_u32;
    visit_layers(layers, true, &mut |layer, _| {
        if string_property(layer, "kind")? != "viviMesh" {
            return Ok(());
        }
        let mesh_slot = replay_u32(buffers.direct_mesh_records.len());
        let mesh = object_property(layer, "mesh")?;
        let skinned = skins.contains_key(string_property(layer, "id")?);
        let vertex_values = array_property(mesh, "vertices")?;
        let uv_values = array_property(mesh, "uvs")?;
        let index_values = array_property(mesh, "indices")?;
        let vertex_len = if skinned {
            0
        } else {
            replay_u32(vertex_values.len())
        };
        let vertex_range = replay_range(&mut vertex_prefix, vertex_len);
        let uv_range = replay_range(&mut uv_prefix, replay_u32(uv_values.len()));
        let index_range = replay_range(&mut index_prefix, replay_u32(index_values.len()));

        // Existing direct order: vertices, UVs, x, y, opacity, multiply,
        // screen, blend, then indices. Category 8 already classified every
        // value that is cast here.
        if !skinned {
            for value in vertex_values {
                bounded_push(
                    &mut buffers.direct_unskinned_vertices,
                    projected_bits(f64_value(value)?),
                    counts.direct_unskinned_vertex_components,
                );
            }
        }
        for value in uv_values {
            bounded_push(
                &mut buffers.direct_uvs,
                projected_bits(f64_value(value)?),
                counts.uv_component_count,
            );
        }
        let (x, y) = if skinned {
            (D32BitsV1::POSITIVE_ZERO, D32BitsV1::POSITIVE_ZERO)
        } else {
            (
                projected_bits(f64_property(layer, "x")?),
                projected_bits(f64_property(layer, "y")?),
            )
        };
        let opacity = projected_bits(f64_property(layer, "opacity")?);
        let mut flags = u32::from(!skinned);
        let mut multiply = [D32BitsV1::POSITIVE_ZERO; 3];
        if let Some(value) = layer.get("multiplyColor") {
            multiply = projected_color(object(value)?)?;
            flags |= 2;
        }
        let mut screen = [D32BitsV1::POSITIVE_ZERO; 3];
        if let Some(value) = layer.get("screenColor")
            && !color_is_black(object(value)?)?
        {
            screen = projected_color(object(value)?)?;
            flags |= 4;
        }
        let blend = trusted_blend_code(string_property(layer, "blendMode")?)?;
        bounded_push(
            &mut buffers.direct_mesh_records,
            DirectMeshRecordV1 {
                mesh_slot,
                flags,
                vertex_range,
                uv_range,
                index_range,
                x,
                y,
                opacity,
                multiply,
                screen,
                blend,
                padding: [0; 2],
            },
            counts.mesh_count,
        );
        for value in index_values {
            bounded_push(
                &mut buffers.direct_indices,
                CheckedIndexV1 {
                    value: replay_u32_from_u64(replay_u64_value(value)?),
                },
                counts.index_count,
            );
        }
        Ok(())
    })
}

fn materialize_parameter_tables(
    root: &Map<String, Value>,
    counts: &FoundationCounts,
    buffers: &mut Category9ReservationBuffersV1,
) -> LoweringResult<()> {
    let parameters = array_property(root, "parameters")?;
    let presets = array_property(root, "expressionPresets")?;

    for collection in [parameters, presets] {
        for row in collection {
            for byte in string_property(object(row)?, "id")?.as_bytes() {
                bounded_push(
                    &mut buffers.parameter_symbol_bytes,
                    *byte,
                    counts.symbol_byte_count,
                );
            }
        }
    }

    let mut symbol_prefix = 0_u32;
    for parameter in parameters {
        let parameter = object(parameter)?;
        let id = string_property(parameter, "id")?;
        let symbol_range = replay_range(&mut symbol_prefix, replay_u32(id.len()));
        let paired_slot = match parameter.get("pairedParameterId") {
            Some(value) => parameter_slot(parameters, value.as_str().ok_or_else(internal)?)?,
            None => NONE_SLOT_V1,
        };
        bounded_push(
            &mut buffers.parameter_specs,
            ParameterSpecV1 {
                symbol_range,
                min: D64BitsV1::from_f64(f64_property(parameter, "minValue")?),
                max: D64BitsV1::from_f64(f64_property(parameter, "maxValue")?),
                default: D64BitsV1::from_f64(f64_property(parameter, "defaultValue")?),
                paired_slot,
                padding: 0,
            },
            counts.parameter_count,
        );
    }

    let mut value_prefix = 0_u32;
    for preset in presets {
        let preset = object(preset)?;
        let id = string_property(preset, "id")?;
        let symbol_range = replay_range(&mut symbol_prefix, replay_u32(id.len()));
        let values = object_property(preset, "values")?;
        let value_range = replay_range(&mut value_prefix, replay_u32(values.len()));
        bounded_push(
            &mut buffers.parameter_preset_specs,
            PresetSpecV1 {
                symbol_range,
                value_range,
            },
            counts.preset_count,
        );
    }

    for preset in presets {
        let values = object_property(object(preset)?, "values")?;
        for rank in 0..values.len() {
            let (parameter_id, value) = nth_utf8_map_member(values, rank)?;
            bounded_push(
                &mut buffers.parameter_preset_values,
                PresetValueV1 {
                    parameter_slot: parameter_slot(parameters, parameter_id)?,
                    padding: 0,
                    value: D64BitsV1::from_f64(f64_value(value)?),
                },
                counts.preset_value_count,
            );
        }
    }
    Ok(())
}

fn materialize_binding_tables(
    root: &Map<String, Value>,
    layers: &[Value],
    counts: &FoundationCounts,
    buffers: &mut Category9ReservationBuffersV1,
) -> LoweringResult<()> {
    let parameters = array_property(root, "parameters")?;
    let bindings = array_property(root, "parameterBindings")?;
    let controllers = array_property(root, "ikControllers")?;
    let mut point_prefix = 0_u32;
    for binding in bindings {
        let binding = object(binding)?;
        let points = array_property(binding, "bindingPoints")?;
        bounded_push(
            &mut buffers.binding_specs,
            BindingSpecV1 {
                parameter_slot: parameter_slot(
                    parameters,
                    string_property(binding, "parameterId")?,
                )?,
                target_slot: binding_target_slot(bindings, object_property(binding, "target")?)?,
                point_range: replay_range(&mut point_prefix, replay_u32(points.len())),
            },
            counts.binding_count,
        );
    }
    for binding in bindings {
        for point in array_property(object(binding)?, "bindingPoints")? {
            let point = object(point)?;
            bounded_push(
                &mut buffers.binding_points,
                BindingPointV1 {
                    parameter: D64BitsV1::from_f64(f64_property(point, "paramValue")?),
                    target: D64BitsV1::from_f64(f64_property(point, "targetValue")?),
                },
                counts.binding_point_count,
            );
        }
    }
    for (index, binding) in bindings.iter().enumerate() {
        let target = object_property(object(binding)?, "target")?;
        let mut first = true;
        for prior in &bindings[..index] {
            if binding_targets_equal(target, object_property(object(prior)?, "target")?)? {
                first = false;
                break;
            }
        }
        if !first {
            continue;
        }
        let (kind, owner_id, property) = binding_target_key(target)?;
        let (kind_code, owner_slot) = match kind {
            "bone" => (0, bone_slot(layers, owner_id)?),
            "ikController" => (1, controller_slot(controllers, owner_id)?),
            _ => return Err(internal()),
        };
        bounded_push(
            &mut buffers.binding_targets,
            BindingTargetV1 {
                kind: kind_code,
                property: binding_property_code(kind, property)?,
                owner_slot,
                padding: 0,
                default: binding_target_default(root, layers, kind, owner_id, property)?,
            },
            counts.binding_target_count,
        );
    }
    Ok(())
}

fn materialize_bone_tables(
    layers: &[Value],
    counts: &FoundationCounts,
    buffers: &mut Category9ReservationBuffersV1,
) -> LoweringResult<()> {
    visit_layers(layers, true, &mut |layer, _| {
        if string_property(layer, "kind")? != "bone" {
            return Ok(());
        }
        let bone_slot_value = replay_u32(buffers.bone_specs.len());
        let parent_slot = match layer.get("parentBoneId") {
            Some(value) => bone_slot(layers, value.as_str().ok_or_else(internal)?)?,
            None => NONE_SLOT_V1,
        };
        let bone = object_property(layer, "bone")?;
        bounded_push(
            &mut buffers.bone_specs,
            BoneSpecV1 {
                parent_slot,
                bone_slot: bone_slot_value,
                x: D64BitsV1::from_f64(f64_property(layer, "x")?),
                y: D64BitsV1::from_f64(f64_property(layer, "y")?),
                angle: D64BitsV1::from_f64(f64_property(bone, "angle")?),
                length: D64BitsV1::from_f64(f64_property(bone, "length")?),
                scale_x: D64BitsV1::from_f64(f64_property(bone, "scaleX")?),
                scale_y: D64BitsV1::from_f64(f64_property(bone, "scaleY")?),
                padding: [0; 2],
            },
            counts.bone_count,
        );
        Ok(())
    })?;

    while buffers.bone_world_order_slots.len() < counts.bone_count as usize {
        let mut selected = None;
        for spec in &buffers.bone_specs {
            if buffers
                .bone_world_order_slots
                .iter()
                .any(|slot| slot.value == spec.bone_slot)
            {
                continue;
            }
            let parent_ready = spec.parent_slot == NONE_SLOT_V1
                || buffers
                    .bone_world_order_slots
                    .iter()
                    .any(|slot| slot.value == spec.parent_slot);
            if parent_ready && selected.is_none_or(|slot| spec.bone_slot < slot) {
                selected = Some(spec.bone_slot);
            }
        }
        bounded_push(
            &mut buffers.bone_world_order_slots,
            SlotV1 {
                value: selected.ok_or_else(internal)?,
            },
            counts.bone_count,
        );
    }
    Ok(())
}

fn materialize_mesh_and_skin_specs(
    layers: &[Value],
    skins: &Map<String, Value>,
    counts: &FoundationCounts,
    buffers: &mut Category9ReservationBuffersV1,
) -> LoweringResult<()> {
    let mut derived_prefix = 0_u32;
    let mut next_skin_slot = 0_u32;
    visit_layers(layers, true, &mut |layer, effective_visible| {
        if string_property(layer, "kind")? != "viviMesh" {
            return Ok(());
        }
        let mesh_slot = replay_u32(buffers.mesh_evaluator_specs.len());
        let skinned = skins.contains_key(string_property(layer, "id")?);
        let derived_len = if skinned {
            replay_u32(array_property(object_property(layer, "mesh")?, "vertices")?.len())
        } else {
            0
        };
        let derived_range = replay_range(&mut derived_prefix, derived_len);
        let skin_slot_value = if skinned {
            replay_next_u32(&mut next_skin_slot)
        } else {
            NONE_SLOT_V1
        };
        let culling = optional_bool_property(layer, "culling")?.unwrap_or(false);
        let static_flags =
            u32::from(skinned) | (u32::from(culling) << 1) | (u32::from(effective_visible) << 2);
        bounded_push(
            &mut buffers.mesh_evaluator_specs,
            MeshEvaluatorSpecV1 {
                mesh_slot,
                skin_slot: skin_slot_value,
                derived_range,
                static_flags,
                committed_flags: 0,
                update_flags: 0,
                padding: 0,
            },
            counts.mesh_count,
        );
        Ok(())
    })?;

    let mut rest_prefix = 0_u32;
    let mut row_prefix = 0_u32;
    let mut bind_prefix = 0_u32;
    visit_layers(layers, true, &mut |layer, _| {
        if string_property(layer, "kind")? != "viviMesh" {
            return Ok(());
        }
        let mesh_id = string_property(layer, "id")?;
        let Some(skin) = skins.get(mesh_id) else {
            return Ok(());
        };
        let skin = object(skin)?;
        let mesh_slot = mesh_slot(layers, mesh_id)?;
        let evaluator = buffers
            .mesh_evaluator_specs
            .get(mesh_slot as usize)
            .ok_or_else(internal)?;
        let rows = array_property(skin, "weights")?;
        let row_count = replay_u32(rows.len());
        bounded_push(
            &mut buffers.skin_mesh_specs,
            SkinMeshSpecV1 {
                mesh_slot,
                padding: 0,
                rest_range: replay_range(&mut rest_prefix, replay_mul_u32(row_count, 2)),
                weight_row_range: replay_range(&mut row_prefix, row_count),
                bind_inverse_range: replay_range(
                    &mut bind_prefix,
                    replay_usable_bind_inverse_count_for_skin(layers, skin)?,
                ),
                derived_range: evaluator.derived_range,
            },
            counts.skinned_mesh_count,
        );
        Ok(())
    })
}

fn projected_bits(value: f64) -> D32BitsV1 {
    D32BitsV1::from_f32(project_validated_binary64_to_binary32(value))
}

fn projected_color(color: &Map<String, Value>) -> LoweringResult<[D32BitsV1; 3]> {
    Ok([
        projected_bits(f64_property(color, "r")?),
        projected_bits(f64_property(color, "g")?),
        projected_bits(f64_property(color, "b")?),
    ])
}

fn bounded_push<T>(values: &mut Vec<T>, value: T, logical_count: u32) {
    let logical_count = logical_count as usize;
    debug_assert!(values.len() < logical_count);
    debug_assert!(values.len() < values.capacity());
    values.push(value);
}

fn replay_range(prefix: &mut u32, len: u32) -> RangeV1 {
    let start = *prefix;
    debug_assert!(len <= u32::MAX - start);
    *prefix = start.wrapping_add(len);
    RangeV1 { start, len }
}

fn replay_u32(value: usize) -> u32 {
    debug_assert!(value <= u32::MAX as usize);
    value as u32
}

fn replay_u32_from_u64(value: u64) -> u32 {
    debug_assert!(value <= u64::from(u32::MAX));
    value as u32
}

fn replay_next_u32(value: &mut u32) -> u32 {
    let current = *value;
    debug_assert!(current < u32::MAX);
    *value = current.wrapping_add(1);
    current
}

fn replay_mul_u32(left: u32, right: u32) -> u32 {
    debug_assert!(right == 0 || left <= u32::MAX / right);
    left.wrapping_mul(right)
}

fn materialize_physics_and_ik(
    root: &Map<String, Value>,
    layers: &[Value],
    counts: &FoundationCounts,
    buffers: &mut Category9ReservationBuffersV1,
) -> LoweringResult<()> {
    let parameters = array_property(root, "parameters")?;
    let groups = array_property(root, "physicsGroups")?;
    if let Some((_, group)) = enabled_physics_group(groups)? {
        for pendulum in array_property(group, "pendulums")? {
            let pendulum = object(pendulum)?;
            bounded_push(
                &mut buffers.physics_pendulum_configs,
                PendulumConfigV1 {
                    length: D64BitsV1::from_f64(f64_property(pendulum, "length")?),
                    mass: D64BitsV1::from_f64(f64_property(pendulum, "mass")?),
                    damping: D64BitsV1::from_f64(f64_property(pendulum, "damping")?),
                },
                counts.enabled_pendulum_count,
            );
        }
        for input in array_property(group, "inputs")? {
            let input = object(input)?;
            bounded_push(
                &mut buffers.physics_inputs,
                PhysicsInputV1 {
                    parameter_slot: parameter_slot(
                        parameters,
                        string_property(input, "parameterId")?,
                    )?,
                    kind: physics_input_kind(string_property(input, "type")?)?,
                    weight: D64BitsV1::from_f64(f64_property(input, "weight")?),
                },
                counts.enabled_physics_input_count,
            );
        }
        let outputs = array_property(group, "outputs")?;
        for output in outputs {
            let output = object(output)?;
            let output_type = string_property(output, "type")?;
            let destination_id = physics_output_destination_id(output)?;
            let (destination_kind, destination_slot) = match output_type {
                "angle" => (0, parameter_slot(parameters, destination_id)?),
                "boneAngle" => (1, bone_slot(layers, destination_id)?),
                _ => return Err(internal()),
            };
            bounded_push(
                &mut buffers.physics_outputs,
                PhysicsOutputV1 {
                    destination_kind,
                    destination_slot,
                    pendulum_index: replay_u32_from_u64(replay_u64_property(
                        output,
                        "pendulumIndex",
                    )?),
                    stage_slot: physics_stage_slot(outputs, output)?,
                    weight: D64BitsV1::from_f64(f64_property(output, "weight")?),
                },
                counts.enabled_physics_output_count,
            );
        }
    }

    if let Some(controller) = array_property(root, "ikControllers")?.first() {
        for constraint in array_property(object(controller)?, "boneChain")? {
            let constraint = object(constraint)?;
            bounded_push(
                &mut buffers.ik_constraints,
                IkConstraintV1 {
                    bone_slot: bone_slot(layers, string_property(constraint, "boneId")?)?,
                    padding: 0,
                    min: D64BitsV1::from_f64(f64_property(constraint, "minAngle")?),
                    max: D64BitsV1::from_f64(f64_property(constraint, "maxAngle")?),
                },
                counts.controller_constraint_count,
            );
        }
    }
    Ok(())
}

fn materialize_skin_tables(
    layers: &[Value],
    skins: &Map<String, Value>,
    counts: &FoundationCounts,
    buffers: &mut Category9ReservationBuffersV1,
) -> LoweringResult<()> {
    let mut weight_prefix = 0_u32;
    visit_layers(layers, true, &mut |layer, _| {
        if string_property(layer, "kind")? != "viviMesh" {
            return Ok(());
        }
        let Some(skin) = skins.get(string_property(layer, "id")?) else {
            return Ok(());
        };
        for row in array_property(object(skin)?, "weights")? {
            let weights = array(row)?;
            bounded_push(
                &mut buffers.skin_weight_rows,
                SkinWeightRowV1 {
                    weights: replay_range(&mut weight_prefix, replay_u32(weights.len())),
                },
                counts.skinned_vertex_count,
            );
        }
        Ok(())
    })?;

    visit_layers(layers, true, &mut |layer, _| {
        if string_property(layer, "kind")? != "viviMesh" {
            return Ok(());
        }
        let Some(skin) = skins.get(string_property(layer, "id")?) else {
            return Ok(());
        };
        for row in array_property(object(skin)?, "weights")? {
            for weight in array(row)? {
                let weight = object(weight)?;
                bounded_push(
                    &mut buffers.skin_weights,
                    SkinWeightV1 {
                        bone_slot: bone_slot(layers, string_property(weight, "boneId")?)?,
                        padding: 0,
                        weight: D64BitsV1::from_f64(f64_property(weight, "weight")?),
                    },
                    counts.skin_weight_count,
                );
            }
        }
        Ok(())
    })?;

    visit_layers(layers, true, &mut |layer, _| {
        if string_property(layer, "kind")? != "viviMesh" {
            return Ok(());
        }
        let Some(skin) = skins.get(string_property(layer, "id")?) else {
            return Ok(());
        };
        let skin = object(skin)?;
        let bind_pose = object_property(skin, "bindPoseInverse")?;
        visit_layers(layers, true, &mut |bone, _| {
            if string_property(bone, "kind")? != "bone" {
                return Ok(());
            }
            let bone_id = string_property(bone, "id")?;
            if !skin_references_bone(skin, bone_id)? {
                return Ok(());
            }
            let Some(matrix) = bind_pose.get(bone_id) else {
                return Ok(());
            };
            let matrix = array(matrix)?;
            let [m0, m1, m2, m3, m4, m5] = matrix else {
                return Err(internal());
            };
            bounded_push(
                &mut buffers.skin_bind_inverses,
                BindInverseV1 {
                    bone_slot: bone_slot(layers, bone_id)?,
                    padding: 0,
                    matrix: [
                        D64BitsV1::from_f64(f64_value(m0)?),
                        D64BitsV1::from_f64(f64_value(m1)?),
                        D64BitsV1::from_f64(f64_value(m2)?),
                        D64BitsV1::from_f64(f64_value(m3)?),
                        D64BitsV1::from_f64(f64_value(m4)?),
                        D64BitsV1::from_f64(f64_value(m5)?),
                    ],
                },
                counts.usable_bind_inverse_count,
            );
            Ok(())
        })
    })?;

    visit_layers(layers, true, &mut |layer, _| {
        if string_property(layer, "kind")? != "viviMesh"
            || !skins.contains_key(string_property(layer, "id")?)
        {
            return Ok(());
        }
        for value in array_property(object_property(layer, "mesh")?, "vertices")? {
            bounded_push(
                &mut buffers.skin_rest_coordinates,
                D64BitsV1::from_f64(f64_value(value)?),
                counts.skinned_coordinate_count,
            );
        }
        Ok(())
    })
}

fn materialize_state_and_scratch(
    root: &Map<String, Value>,
    layers: &[Value],
    counts: &FoundationCounts,
    buffers: &mut Category9ReservationBuffersV1,
) -> LoweringResult<()> {
    let parameters = array_property(root, "parameters")?;
    for parameter in parameters {
        let default = D64BitsV1::from_f64(f64_property(object(parameter)?, "defaultValue")?);
        bounded_push(
            &mut buffers.parameter_current,
            default,
            counts.parameter_count,
        );
    }
    for parameter in parameters {
        bounded_push(
            &mut buffers.parameter_previous,
            D64BitsV1::from_f64(f64_property(object(parameter)?, "defaultValue")?),
            counts.parameter_count,
        );
    }
    for parameter in parameters {
        bounded_push(
            &mut buffers.parameter_update,
            D64BitsV1::from_f64(f64_property(object(parameter)?, "defaultValue")?),
            counts.parameter_count,
        );
    }

    if let Some((_, group)) = enabled_physics_group(array_property(root, "physicsGroups")?)? {
        let outputs = array_property(group, "outputs")?;
        materialize_staged_destinations(
            outputs,
            "angle",
            parameters,
            layers,
            &mut buffers.parameter_staged_destinations,
            counts.staged_parameter_destination_count,
        )?;
    }
    for _ in 0..counts.binding_target_count {
        bounded_push(
            &mut buffers.binding_accumulators,
            D64BitsV1::POSITIVE_ZERO,
            counts.binding_target_count,
        );
    }

    for _ in 0..counts.bone_count {
        bounded_push(
            &mut buffers.bone_committed_overrides,
            neutral_bone_override(),
            counts.bone_count,
        );
    }
    for _ in 0..counts.bone_count {
        bounded_push(
            &mut buffers.bone_update_overrides,
            neutral_bone_override(),
            counts.bone_count,
        );
    }
    if let Some((_, group)) = enabled_physics_group(array_property(root, "physicsGroups")?)? {
        materialize_staged_destinations(
            array_property(group, "outputs")?,
            "boneAngle",
            parameters,
            layers,
            &mut buffers.bone_staged_destinations,
            counts.staged_bone_destination_count,
        )?;
    }

    for _ in 0..counts.enabled_pendulum_count {
        bounded_push(
            &mut buffers.physics_committed_pendulums,
            PendulumStateV1 {
                angle: D64BitsV1::POSITIVE_ZERO,
                velocity: D64BitsV1::POSITIVE_ZERO,
            },
            counts.enabled_pendulum_count,
        );
    }
    for _ in 0..counts.enabled_pendulum_count {
        bounded_push(
            &mut buffers.physics_update_pendulums,
            PendulumStateV1 {
                angle: D64BitsV1::POSITIVE_ZERO,
                velocity: D64BitsV1::POSITIVE_ZERO,
            },
            counts.enabled_pendulum_count,
        );
    }
    for _ in 0..counts.pre_world_count {
        bounded_push(
            &mut buffers.world_pre,
            AffineV1 {
                cells: [D64BitsV1::POSITIVE_ZERO; 6],
            },
            counts.pre_world_count,
        );
    }
    for _ in 0..counts.post_world_count {
        bounded_push(
            &mut buffers.world_post,
            AffineV1 {
                cells: [D64BitsV1::POSITIVE_ZERO; 6],
            },
            counts.post_world_count,
        );
    }
    for _ in 0..counts.controller_constraint_count {
        bounded_push(
            &mut buffers.ik_scratch,
            IkScratchV1 {
                angle: D64BitsV1::POSITIVE_ZERO,
                x: D64BitsV1::POSITIVE_ZERO,
                y: D64BitsV1::POSITIVE_ZERO,
                length: D64BitsV1::POSITIVE_ZERO,
                solution: D64BitsV1::POSITIVE_ZERO,
            },
            counts.controller_constraint_count,
        );
    }
    for _ in 0..counts.skinned_coordinate_count {
        bounded_push(
            &mut buffers.skin_skinned_scratch,
            D64BitsV1::POSITIVE_ZERO,
            counts.skinned_coordinate_count,
        );
    }
    for _ in 0..counts.skinned_coordinate_count {
        bounded_push(
            &mut buffers.derived_committed_coordinates,
            D32BitsV1::POSITIVE_ZERO,
            counts.skinned_coordinate_count,
        );
    }
    for _ in 0..counts.skinned_coordinate_count {
        bounded_push(
            &mut buffers.derived_update_coordinates,
            D32BitsV1::POSITIVE_ZERO,
            counts.skinned_coordinate_count,
        );
    }
    Ok(())
}

fn materialize_inline_physics(
    root: &Map<String, Value>,
    counts: &FoundationCounts,
) -> LoweringResult<InlinePhysicsGroupV1> {
    let enabled = enabled_physics_group(array_property(root, "physicsGroups")?)?;
    let (group_index, group) = match (counts.enabled_physics_group_count, enabled) {
        (0, None) => return Ok(InlinePhysicsGroupV1::ABSENT),
        (1, Some(group)) => group,
        _ => return Err(internal()),
    };
    Ok(InlinePhysicsGroupV1 {
        present: 1,
        group_index,
        pendulum_range: RangeV1 {
            start: 0,
            len: counts.enabled_pendulum_count,
        },
        input_range: RangeV1 {
            start: 0,
            len: counts.enabled_physics_input_count,
        },
        output_range: RangeV1 {
            start: 0,
            len: counts.enabled_physics_output_count,
        },
        gravity_direction: D64BitsV1::from_f64(f64_property(group, "gravityDirection")?),
        gravity_strength: D64BitsV1::from_f64(f64_property(group, "gravityStrength")?),
        wind: D64BitsV1::from_f64(f64_property(group, "wind")?),
        committed_accumulator: D64BitsV1::POSITIVE_ZERO,
        update_accumulator: D64BitsV1::POSITIVE_ZERO,
        validity: 0,
        padding: 0,
    })
}

fn materialize_inline_ik(
    root: &Map<String, Value>,
    counts: &FoundationCounts,
) -> LoweringResult<InlineIkControllerV1> {
    let controllers = array_property(root, "ikControllers")?;
    let Some(controller) = controllers.first() else {
        return Ok(InlineIkControllerV1::ABSENT);
    };
    let controller = object(controller)?;
    let (pole_x, pole_x_present) = optional_f64_property(controller, "poleTargetX")?;
    let (pole_y, pole_y_present) = optional_f64_property(controller, "poleTargetY")?;
    let max_iterations = match controller.get("maxIterations") {
        Some(value) => replay_u32_from_u64(replay_u64_value(value)?),
        None => 10,
    };
    Ok(InlineIkControllerV1 {
        present: 1,
        controller_index: 0,
        solver: match string_property(controller, "solverType")? {
            "twoBone" => 0,
            "ccd" => 1,
            _ => return Err(internal()),
        },
        max_iterations,
        constraint_range: RangeV1 {
            start: 0,
            len: counts.controller_constraint_count,
        },
        target_x: D64BitsV1::from_f64(f64_property(controller, "targetX")?),
        target_y: D64BitsV1::from_f64(f64_property(controller, "targetY")?),
        pole_x: pole_x.map_or(D64BitsV1::POSITIVE_ZERO, D64BitsV1::from_f64),
        pole_y: pole_y.map_or(D64BitsV1::POSITIVE_ZERO, D64BitsV1::from_f64),
        influence: D64BitsV1::from_f64(f64_property(controller, "influence")?),
        presence_flags: u32::from(pole_x_present) | (u32::from(pole_y_present) << 1),
        padding: 0,
    })
}

fn neutral_bone_override() -> BoneOverrideV1 {
    BoneOverrideV1 {
        presence_mask: 0,
        padding: 0,
        x: D64BitsV1::POSITIVE_ZERO,
        y: D64BitsV1::POSITIVE_ZERO,
        angle: D64BitsV1::POSITIVE_ZERO,
        scale_x: D64BitsV1::POSITIVE_ZERO,
        scale_y: D64BitsV1::POSITIVE_ZERO,
    }
}

fn materialize_staged_destinations(
    outputs: &[Value],
    output_type: &str,
    parameters: &[Value],
    layers: &[Value],
    target: &mut Vec<StagedValueV1>,
    logical_count: u32,
) -> LoweringResult<()> {
    for (index, output) in outputs.iter().enumerate() {
        let output = object(output)?;
        if string_property(output, "type")? != output_type {
            continue;
        }
        let destination_id = physics_output_destination_id(output)?;
        let mut first = true;
        for prior in &outputs[..index] {
            let prior = object(prior)?;
            if string_property(prior, "type")? == output_type
                && physics_output_destination_id(prior)?.as_bytes() == destination_id.as_bytes()
            {
                first = false;
                break;
            }
        }
        if !first {
            continue;
        }
        let owner_slot = match output_type {
            "angle" => parameter_slot(parameters, destination_id)?,
            "boneAngle" => bone_slot(layers, destination_id)?,
            _ => return Err(internal()),
        };
        bounded_push(
            target,
            StagedValueV1 {
                owner_slot,
                valid: 0,
                value: D64BitsV1::POSITIVE_ZERO,
            },
            logical_count,
        );
    }
    Ok(())
}

fn parameter_slot(parameters: &[Value], parameter_id: &str) -> LoweringResult<u32> {
    for (index, parameter) in parameters.iter().enumerate() {
        if string_property(object(parameter)?, "id")?.as_bytes() == parameter_id.as_bytes() {
            return Ok(replay_u32(index));
        }
    }
    Err(internal())
}

fn controller_slot(controllers: &[Value], controller_id: &str) -> LoweringResult<u32> {
    for (index, controller) in controllers.iter().enumerate() {
        if string_property(object(controller)?, "id")?.as_bytes() == controller_id.as_bytes() {
            return Ok(replay_u32(index));
        }
    }
    Err(internal())
}

fn bone_slot(layers: &[Value], bone_id: &str) -> LoweringResult<u32> {
    layer_kind_slot(layers, "bone", bone_id)
}

fn mesh_slot(layers: &[Value], mesh_id: &str) -> LoweringResult<u32> {
    layer_kind_slot(layers, "viviMesh", mesh_id)
}

fn layer_kind_slot(layers: &[Value], kind: &str, id: &str) -> LoweringResult<u32> {
    fn scan(layers: &[Value], kind: &str, id: &str, next: &mut u32) -> LoweringResult<Option<u32>> {
        for layer in layers {
            let layer = object(layer)?;
            if string_property(layer, "kind")? == kind {
                let slot = replay_next_u32(next);
                if string_property(layer, "id")?.as_bytes() == id.as_bytes() {
                    return Ok(Some(slot));
                }
            }
            if let Some(slot) = scan(array_property(layer, "children")?, kind, id, next)? {
                return Ok(Some(slot));
            }
        }
        Ok(None)
    }
    scan(layers, kind, id, &mut 0)?.ok_or_else(internal)
}

fn find_layer<'a>(
    layers: &'a [Value],
    kind: &str,
    id: &str,
) -> LoweringResult<&'a Map<String, Value>> {
    for layer in layers {
        let layer = object(layer)?;
        if string_property(layer, "kind")? == kind
            && string_property(layer, "id")?.as_bytes() == id.as_bytes()
        {
            return Ok(layer);
        }
        if let Ok(found) = find_layer(array_property(layer, "children")?, kind, id) {
            return Ok(found);
        }
    }
    Err(internal())
}

fn nth_utf8_map_member(values: &Map<String, Value>, rank: usize) -> LoweringResult<(&str, &Value)> {
    for (candidate_id, candidate_value) in values {
        let mut less = 0_usize;
        for other_id in values.keys() {
            if other_id.as_bytes() < candidate_id.as_bytes() {
                debug_assert!(less < usize::MAX);
                less = less.wrapping_add(1);
            }
        }
        if less == rank {
            return Ok((candidate_id, candidate_value));
        }
    }
    Err(internal())
}

fn binding_target_slot(bindings: &[Value], target: &Map<String, Value>) -> LoweringResult<u32> {
    let mut slot = 0_u32;
    for (index, binding) in bindings.iter().enumerate() {
        let candidate = object_property(object(binding)?, "target")?;
        let mut first = true;
        for prior in &bindings[..index] {
            if binding_targets_equal(candidate, object_property(object(prior)?, "target")?)? {
                first = false;
                break;
            }
        }
        if !first {
            continue;
        }
        if binding_targets_equal(candidate, target)? {
            return Ok(slot);
        }
        let _ = replay_next_u32(&mut slot);
    }
    Err(internal())
}

fn binding_property_code(kind: &str, property: &str) -> LoweringResult<u32> {
    match (kind, property) {
        ("bone", "x") => Ok(0),
        ("bone", "y") => Ok(1),
        ("bone", "angle") => Ok(2),
        ("bone", "scaleX") => Ok(3),
        ("bone", "scaleY") => Ok(4),
        ("ikController", "targetX") => Ok(5),
        ("ikController", "targetY") => Ok(6),
        ("ikController", "poleTargetX") => Ok(7),
        ("ikController", "poleTargetY") => Ok(8),
        ("ikController", "influence") => Ok(9),
        _ => Err(internal()),
    }
}

fn binding_target_default(
    root: &Map<String, Value>,
    layers: &[Value],
    kind: &str,
    owner_id: &str,
    property: &str,
) -> LoweringResult<D64BitsV1> {
    match (kind, property) {
        ("bone", "x") => Ok(D64BitsV1::from_f64(f64_property(
            find_layer(layers, "bone", owner_id)?,
            "x",
        )?)),
        ("bone", "y") => Ok(D64BitsV1::from_f64(f64_property(
            find_layer(layers, "bone", owner_id)?,
            "y",
        )?)),
        ("bone", "angle") => Ok(D64BitsV1::POSITIVE_ZERO),
        ("bone", "scaleX" | "scaleY") => Ok(D64BitsV1::ONE),
        ("ikController", _) => {
            let controllers = array_property(root, "ikControllers")?;
            let controller = controllers
                .iter()
                .map(object)
                .find_map(|entry| match entry {
                    Ok(value)
                        if string_property(value, "id")
                            .is_ok_and(|id| id.as_bytes() == owner_id.as_bytes()) =>
                    {
                        Some(Ok(value))
                    }
                    Ok(_) => None,
                    Err(error) => Some(Err(error)),
                })
                .transpose()?
                .ok_or_else(internal)?;
            match property {
                "targetX" => Ok(D64BitsV1::from_f64(f64_property(controller, "targetX")?)),
                "targetY" => Ok(D64BitsV1::from_f64(f64_property(controller, "targetY")?)),
                "poleTargetX" => Ok(D64BitsV1::from_f64(
                    optional_f64_property(controller, "poleTargetX")?
                        .0
                        .unwrap_or(0.0),
                )),
                "poleTargetY" => Ok(D64BitsV1::from_f64(
                    optional_f64_property(controller, "poleTargetY")?
                        .0
                        .unwrap_or(0.0),
                )),
                "influence" => Ok(D64BitsV1::from_f64(f64_property(controller, "influence")?)),
                _ => Err(internal()),
            }
        }
        _ => Err(internal()),
    }
}

fn physics_input_kind(kind: &str) -> LoweringResult<u32> {
    match kind {
        "x" => Ok(0),
        "y" => Ok(1),
        "angle" => Ok(2),
        _ => Err(internal()),
    }
}

fn physics_stage_slot(outputs: &[Value], target: &Map<String, Value>) -> LoweringResult<u32> {
    let target_type = string_property(target, "type")?;
    let target_id = physics_output_destination_id(target)?;
    let mut slot = 0_u32;
    for (index, output) in outputs.iter().enumerate() {
        let output = object(output)?;
        if string_property(output, "type")? != target_type {
            continue;
        }
        let id = physics_output_destination_id(output)?;
        let mut first = true;
        for prior in &outputs[..index] {
            let prior = object(prior)?;
            if string_property(prior, "type")? == target_type
                && physics_output_destination_id(prior)?.as_bytes() == id.as_bytes()
            {
                first = false;
                break;
            }
        }
        if !first {
            continue;
        }
        if id.as_bytes() == target_id.as_bytes() {
            return Ok(slot);
        }
        let _ = replay_next_u32(&mut slot);
    }
    Err(internal())
}

fn optional_bool_property(value: &Map<String, Value>, name: &str) -> LoweringResult<Option<bool>> {
    match value.get(name) {
        Some(value) => value.as_bool().map(Some).ok_or_else(internal),
        None => Ok(None),
    }
}

fn optional_f64_property(
    value: &Map<String, Value>,
    name: &str,
) -> LoweringResult<(Option<f64>, bool)> {
    match value.get(name) {
        Some(value) => Ok((Some(f64_value(value)?), true)),
        None => Ok((None, false)),
    }
}

#[cfg(test)]
pub(crate) fn project_binary64_to_binary32(value: f64) -> LoweringResult<f32> {
    validate_binary64_for_projection(value)?;
    Ok(project_validated_binary64_to_binary32(value))
}

fn project_validated_binary64_to_binary32(value: f64) -> f32 {
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

fn parse_blend_mode(value: &str) -> LoweringResult<u32> {
    match value {
        "normal" => Ok(0),
        "multiply" => Ok(1),
        "screen" => Ok(2),
        "add" => Ok(3),
        "overlay" | "darken" | "lighten" | "color-dodge" | "color-burn" | "hard-light"
        | "soft-light" | "difference" | "exclusion" => {
            Err(error(EvaluationLoweringErrorKind::UnsupportedBlendMode))
        }
        _ => Err(internal()),
    }
}

fn trusted_blend_code(value: &str) -> LoweringResult<u32> {
    match value {
        "normal" => Ok(0),
        "multiply" => Ok(1),
        "screen" => Ok(2),
        "add" => Ok(3),
        _ => Err(internal()),
    }
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

fn replay_u64_property(value: &Map<String, Value>, name: &str) -> LoweringResult<u64> {
    replay_u64_value(value.get(name).ok_or_else(internal)?)
}

fn replay_u64_value(value: &Value) -> LoweringResult<u64> {
    if let Some(value) = value.as_u64() {
        return Ok(value);
    }
    value
        .as_f64()
        .map(|trusted_integer| trusted_integer as u64)
        .ok_or_else(internal)
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
