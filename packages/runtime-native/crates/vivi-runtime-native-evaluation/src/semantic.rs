use std::collections::{HashMap, HashSet};

use serde_json::{Map, Value};

use crate::{EvaluationPayloadError, RequiredTextureBindingV1, ValidatedEvaluationPayloadV1};

const MAX_LAYERS: usize = 4_096;
const MAX_MESHES: usize = 1_024;
const MAX_VERTICES_PER_MESH: usize = 65_536;
const MAX_INDICES_PER_MESH: usize = 196_608;
const MAX_BONES: usize = 1_024;
const MAX_BINDING_POINTS: usize = 8_192;
const MAX_MASK_DEPTH: usize = 8;
const MAX_TEXTURE_BYTES: u64 = 268_435_456;

pub(crate) fn validate_and_inventory(
    value: Value,
    request_generation: u64,
) -> Result<ValidatedEvaluationPayloadV1, EvaluationPayloadError> {
    let root = object(&value)?;
    let layers = collect_layers(array_property(root, "layers")?)?;
    validate_bone_graph(&layers)?;
    validate_mask_graph(&layers)?;

    let parameters = validate_parameters(array_property(root, "parameters")?)?;
    let controllers =
        validate_controllers(array_property(root, "ikControllers")?, &layers, &parameters)?;
    validate_parameter_bindings(
        array_property(root, "parameterBindings")?,
        &layers,
        &parameters,
        &controllers,
    )?;
    validate_skins(object_property(root, "skins")?, &layers)?;
    validate_physics(array_property(root, "physicsGroups")?, &layers, &parameters)?;
    validate_colliders(array_property(root, "colliders")?, &layers)?;
    validate_expressions(array_property(root, "expressionPresets")?, &parameters)?;
    let clips = array_property(root, "clips")?;
    let clip_ids = validate_clips(clips, &layers, &parameters, &controllers)?;
    let state_machines = array_property(root, "stateMachines")?;
    validate_state_machines(state_machines, &parameters, &clip_ids)?;
    let texture_bindings = validate_atlases(array_property(root, "atlases")?, &layers)?;

    // Runtime Spec v1.0 does not evaluate clips or state machines yet. Their
    // full Stage 1 and Stage 2 validation deliberately precedes this result.
    if !clips.is_empty() || !state_machines.is_empty() {
        return Err(EvaluationPayloadError::unsupported());
    }

    Ok(ValidatedEvaluationPayloadV1 {
        request_generation,
        value,
        texture_bindings,
    })
}

struct LayerState<'a> {
    by_id: HashMap<&'a str, &'a Map<String, Value>>,
    mesh_ids: HashSet<&'a str>,
    bone_ids: HashSet<&'a str>,
    mesh_vertex_counts: HashMap<&'a str, usize>,
}

fn collect_layers(layers: &[Value]) -> Result<LayerState<'_>, EvaluationPayloadError> {
    let mut state = LayerState {
        by_id: fallible_map(MAX_LAYERS)?,
        mesh_ids: fallible_set(MAX_MESHES)?,
        bone_ids: fallible_set(MAX_BONES)?,
        mesh_vertex_counts: fallible_map(MAX_MESHES)?,
    };
    visit_layers(layers, &mut state)?;
    Ok(state)
}

fn visit_layers<'a>(
    layers: &'a [Value],
    state: &mut LayerState<'a>,
) -> Result<(), EvaluationPayloadError> {
    for layer in layers {
        if state.by_id.len() >= MAX_LAYERS {
            return Err(EvaluationPayloadError::limit());
        }
        let layer = object(layer)?;
        let id = string_property(layer, "id")?;
        if state.by_id.insert(id, layer).is_some() {
            return Err(EvaluationPayloadError::payload());
        }

        if let Some(masks) = layer.get("clipMasks") {
            enforce_unique_property(array(masks)?, "layerId")?;
        }

        match string_property(layer, "kind")? {
            "viviMesh" => {
                if state.mesh_ids.len() >= MAX_MESHES {
                    return Err(EvaluationPayloadError::limit());
                }
                state.mesh_ids.insert(id);
                let mesh = object_property(layer, "mesh")?;
                let vertices = array_property(mesh, "vertices")?;
                let uvs = array_property(mesh, "uvs")?;
                let indices = array_property(mesh, "indices")?;
                if vertices.is_empty()
                    || vertices.len() % 2 != 0
                    || uvs.len() != vertices.len()
                    || indices.is_empty()
                    || indices.len() % 3 != 0
                {
                    return Err(EvaluationPayloadError::payload());
                }
                let vertex_count = vertices.len() / 2;
                if vertex_count > MAX_VERTICES_PER_MESH || indices.len() > MAX_INDICES_PER_MESH {
                    return Err(EvaluationPayloadError::limit());
                }
                for index in indices {
                    let index = number(index)?;
                    if index.fract() != 0.0 {
                        return Err(EvaluationPayloadError::internal());
                    }
                    if index >= vertex_count as f64 {
                        return Err(EvaluationPayloadError::payload());
                    }
                }
                state.mesh_vertex_counts.insert(id, vertex_count);
            }
            "bone" => {
                if state.bone_ids.len() >= MAX_BONES {
                    return Err(EvaluationPayloadError::limit());
                }
                state.bone_ids.insert(id);
            }
            "group" | "artPath" => {}
            _ => return Err(EvaluationPayloadError::internal()),
        }
        visit_layers(array_property(layer, "children")?, state)?;
    }
    Ok(())
}

fn validate_bone_graph(layers: &LayerState<'_>) -> Result<(), EvaluationPayloadError> {
    for bone_id in &layers.bone_ids {
        let layer = layers
            .by_id
            .get(bone_id)
            .ok_or_else(EvaluationPayloadError::internal)?;
        if let Some(parent) = optional_string_property(layer, "parentBoneId")?
            && !layers.bone_ids.contains(parent)
        {
            return Err(EvaluationPayloadError::payload());
        }
    }

    let mut complete = fallible_set(layers.bone_ids.len())?;
    for start in &layers.bone_ids {
        if complete.contains(start) {
            continue;
        }
        let mut chain = Vec::new();
        chain
            .try_reserve(layers.bone_ids.len())
            .map_err(|_| EvaluationPayloadError::limit())?;
        let mut positions = fallible_map(layers.bone_ids.len())?;
        let mut current = Some(*start);
        while let Some(bone_id) = current {
            if complete.contains(bone_id) {
                break;
            }
            if positions.insert(bone_id, chain.len()).is_some() {
                return Err(EvaluationPayloadError::payload());
            }
            chain.push(bone_id);
            let layer = layers
                .by_id
                .get(bone_id)
                .ok_or_else(EvaluationPayloadError::internal)?;
            current = optional_string_property(layer, "parentBoneId")?;
        }
        for bone_id in chain {
            complete.insert(bone_id);
        }
    }
    Ok(())
}

fn validate_mask_graph(layers: &LayerState<'_>) -> Result<(), EvaluationPayloadError> {
    let mut stack = Vec::new();
    stack
        .try_reserve(MAX_MASK_DEPTH + 1)
        .map_err(|_| EvaluationPayloadError::limit())?;
    for layer_id in layers.by_id.keys() {
        visit_mask_layer(layer_id, layers, &mut stack, 0)?;
    }
    Ok(())
}

fn visit_mask_layer<'a>(
    layer_id: &'a str,
    layers: &LayerState<'a>,
    stack: &mut Vec<&'a str>,
    active_depth: usize,
) -> Result<usize, EvaluationPayloadError> {
    if stack.contains(&layer_id) {
        return Err(EvaluationPayloadError::payload());
    }
    let layer = layers
        .by_id
        .get(layer_id)
        .ok_or_else(EvaluationPayloadError::internal)?;
    let mut depth = active_depth;
    for mask_id in mask_ids(layer)? {
        if depth >= MAX_MASK_DEPTH || stack.len() + 1 > MAX_MASK_DEPTH {
            return Err(EvaluationPayloadError::limit());
        }
        if !layers.mesh_ids.contains(mask_id) {
            return Err(EvaluationPayloadError::payload());
        }
        stack.push(layer_id);
        let nested = visit_mask_layer(mask_id, layers, stack, depth);
        stack.pop();
        depth = nested?
            .checked_add(1)
            .ok_or_else(EvaluationPayloadError::limit)?;
        if depth > MAX_MASK_DEPTH {
            return Err(EvaluationPayloadError::limit());
        }
    }
    Ok(depth)
}

fn mask_ids(layer: &Map<String, Value>) -> Result<Vec<&str>, EvaluationPayloadError> {
    let raw = match (layer.get("clipMaskIds"), layer.get("clipMasks")) {
        (Some(_), Some(_)) => return Err(EvaluationPayloadError::payload()),
        (Some(ids), None) => {
            let ids = array(ids)?;
            let mut result = Vec::new();
            result
                .try_reserve(ids.len())
                .map_err(|_| EvaluationPayloadError::limit())?;
            for id in ids {
                result.push(string(id)?);
            }
            result
        }
        (None, Some(edges)) => {
            let edges = array(edges)?;
            let mut result = Vec::new();
            result
                .try_reserve(edges.len())
                .map_err(|_| EvaluationPayloadError::limit())?;
            for edge in edges {
                result.push(string_property(object(edge)?, "layerId")?);
            }
            result
        }
        (None, None) => Vec::new(),
    };
    Ok(raw)
}

fn validate_parameters(parameters: &[Value]) -> Result<HashSet<&str>, EvaluationPayloadError> {
    let mut ids = fallible_set(parameters.len())?;
    for parameter in parameters {
        let parameter = object(parameter)?;
        let id = string_property(parameter, "id")?;
        if !ids.insert(id) {
            return Err(EvaluationPayloadError::payload());
        }
        let minimum = number_property(parameter, "minValue")?;
        let default = number_property(parameter, "defaultValue")?;
        let maximum = number_property(parameter, "maxValue")?;
        if minimum > default || default > maximum {
            return Err(EvaluationPayloadError::payload());
        }
    }
    for parameter in parameters {
        let parameter = object(parameter)?;
        if let Some(paired) = optional_string_property(parameter, "pairedParameterId")?
            && !ids.contains(paired)
        {
            return Err(EvaluationPayloadError::payload());
        }
    }
    Ok(ids)
}

fn validate_controllers<'a>(
    controllers: &'a [Value],
    layers: &LayerState<'_>,
    parameters: &HashSet<&str>,
) -> Result<HashSet<&'a str>, EvaluationPayloadError> {
    let mut ids = fallible_set(controllers.len())?;
    for controller in controllers {
        let controller = object(controller)?;
        let id = string_property(controller, "id")?;
        if !ids.insert(id) {
            return Err(EvaluationPayloadError::payload());
        }
        for constraint in array_property(controller, "boneChain")? {
            let bone_id = string_property(object(constraint)?, "boneId")?;
            if !layers.bone_ids.contains(bone_id) {
                return Err(EvaluationPayloadError::payload());
            }
        }
        for mapping in array_property(controller, "parameterMappings")? {
            let mapping = object(mapping)?;
            if !layers
                .bone_ids
                .contains(string_property(mapping, "boneId")?)
                || !parameters.contains(string_property(mapping, "parameterId")?)
            {
                return Err(EvaluationPayloadError::payload());
            }
        }
    }
    Ok(ids)
}

fn validate_parameter_bindings(
    bindings: &[Value],
    layers: &LayerState<'_>,
    parameters: &HashSet<&str>,
    controllers: &HashSet<&str>,
) -> Result<(), EvaluationPayloadError> {
    let mut ids = fallible_set(bindings.len())?;
    let mut binding_points = 0_usize;
    for binding in bindings {
        let binding = object(binding)?;
        if !ids.insert(string_property(binding, "id")?) {
            return Err(EvaluationPayloadError::payload());
        }
        if !parameters.contains(string_property(binding, "parameterId")?) {
            return Err(EvaluationPayloadError::payload());
        }
        let points = array_property(binding, "bindingPoints")?;
        binding_points = binding_points
            .checked_add(points.len())
            .ok_or_else(EvaluationPayloadError::limit)?;
        if binding_points > MAX_BINDING_POINTS {
            return Err(EvaluationPayloadError::limit());
        }
        let target = object_property(binding, "target")?;
        match string_property(target, "type")? {
            "bone" => {
                if !layers.bone_ids.contains(string_property(target, "boneId")?) {
                    return Err(EvaluationPayloadError::payload());
                }
            }
            "ikController" => {
                if !controllers.contains(string_property(target, "controllerId")?) {
                    return Err(EvaluationPayloadError::payload());
                }
            }
            _ => return Err(EvaluationPayloadError::internal()),
        }
    }
    Ok(())
}

fn validate_skins(
    skins: &Map<String, Value>,
    layers: &LayerState<'_>,
) -> Result<(), EvaluationPayloadError> {
    for (mesh_id, skin) in skins {
        let Some(vertex_count) = layers.mesh_vertex_counts.get(mesh_id.as_str()) else {
            return Err(EvaluationPayloadError::payload());
        };
        let skin = object(skin)?;
        let rows = array_property(skin, "weights")?;
        if rows.len() != *vertex_count {
            return Err(EvaluationPayloadError::payload());
        }
        for row in rows {
            let row = array(row)?;
            if row.is_empty() {
                return Err(EvaluationPayloadError::payload());
            }
            let mut total = 0.0_f64;
            for weight in row {
                let weight = object(weight)?;
                if !layers.bone_ids.contains(string_property(weight, "boneId")?) {
                    return Err(EvaluationPayloadError::payload());
                }
                let value = number_property(weight, "weight")?;
                if !(0.0..=1.0).contains(&value) {
                    return Err(EvaluationPayloadError::payload());
                }
                total += value;
            }
            if (total - 1.0).abs() > 0.000_001 {
                return Err(EvaluationPayloadError::payload());
            }
        }
        for bone_id in object_property(skin, "bindPoseInverse")?.keys() {
            if !layers.bone_ids.contains(bone_id.as_str()) {
                return Err(EvaluationPayloadError::payload());
            }
        }
    }
    Ok(())
}

fn validate_physics(
    groups: &[Value],
    layers: &LayerState<'_>,
    parameters: &HashSet<&str>,
) -> Result<(), EvaluationPayloadError> {
    let mut ids = fallible_set(groups.len())?;
    for group in groups {
        let group = object(group)?;
        if !ids.insert(string_property(group, "id")?) {
            return Err(EvaluationPayloadError::payload());
        }
        let pendulums = array_property(group, "pendulums")?;
        for input in array_property(group, "inputs")? {
            if !parameters.contains(string_property(object(input)?, "parameterId")?) {
                return Err(EvaluationPayloadError::payload());
            }
        }
        for output in array_property(group, "outputs")? {
            let output = object(output)?;
            let index = nonnegative_safe_u64(
                output
                    .get("pendulumIndex")
                    .ok_or_else(EvaluationPayloadError::internal)?,
            )?;
            if index >= pendulums.len() as u64 {
                return Err(EvaluationPayloadError::payload());
            }
            if let Some(parameter_id) = optional_string_property(output, "parameterId")?
                && !parameters.contains(parameter_id)
            {
                return Err(EvaluationPayloadError::payload());
            }
            if let Some(bone_id) = optional_string_property(output, "boneId")?
                && !layers.bone_ids.contains(bone_id)
            {
                return Err(EvaluationPayloadError::payload());
            }
        }
    }
    Ok(())
}

fn validate_colliders(
    colliders: &[Value],
    layers: &LayerState<'_>,
) -> Result<(), EvaluationPayloadError> {
    let mut ids = fallible_set(colliders.len())?;
    for collider in colliders {
        let collider = object(collider)?;
        if !ids.insert(string_property(collider, "id")?) {
            return Err(EvaluationPayloadError::payload());
        }
        let shape = object_property(collider, "shape")?;
        if string_property(shape, "type")? == "mesh"
            && !layers.mesh_ids.contains(string_property(shape, "meshId")?)
        {
            return Err(EvaluationPayloadError::payload());
        }
    }
    Ok(())
}

fn validate_expressions(
    presets: &[Value],
    parameters: &HashSet<&str>,
) -> Result<(), EvaluationPayloadError> {
    let mut ids = fallible_set(presets.len())?;
    for preset in presets {
        let preset = object(preset)?;
        if !ids.insert(string_property(preset, "id")?) {
            return Err(EvaluationPayloadError::payload());
        }
        for parameter_id in object_property(preset, "values")?.keys() {
            if !parameters.contains(parameter_id.as_str()) {
                return Err(EvaluationPayloadError::payload());
            }
        }
    }
    Ok(())
}

fn validate_clips<'a>(
    clips: &'a [Value],
    layers: &LayerState<'_>,
    parameters: &HashSet<&str>,
    controllers: &HashSet<&str>,
) -> Result<HashSet<&'a str>, EvaluationPayloadError> {
    let mut clip_ids = fallible_set(clips.len())?;
    for clip in clips {
        let clip = object(clip)?;
        if !clip_ids.insert(string_property(clip, "id")?) {
            return Err(EvaluationPayloadError::payload());
        }
    }

    for clip in clips {
        let clip = object(clip)?;
        if number_property(clip, "duration")? < 0.0 || number_property(clip, "fps")? <= 0.0 {
            return Err(EvaluationPayloadError::payload());
        }
        for track in array_property(clip, "tracks")? {
            let track = object(track)?;
            if !parameters.contains(string_property(track, "parameterId")?) {
                return Err(EvaluationPayloadError::payload());
            }
            validate_keyframes(array_property(track, "keyframes")?)?;
        }
        for track in optional_array_property(clip, "boneTracks")? {
            let track = object(track)?;
            if !layers.bone_ids.contains(string_property(track, "boneId")?) {
                return Err(EvaluationPayloadError::payload());
            }
            validate_keyframes(array_property(track, "keyframes")?)?;
        }
        for track in optional_array_property(clip, "imageSequenceTracks")? {
            let track = object(track)?;
            if !layers
                .mesh_ids
                .contains(string_property(track, "targetMeshId")?)
            {
                return Err(EvaluationPayloadError::payload());
            }
            for entry in array_property(track, "entries")? {
                if number_property(object(entry)?, "startFrame")? < 0.0 {
                    return Err(EvaluationPayloadError::payload());
                }
            }
        }

        let audio_tracks = optional_array_property(clip, "audioTracks")?;
        let mut audio_ids = fallible_set(audio_tracks.len())?;
        for track in audio_tracks {
            let track = object(track)?;
            if !audio_ids.insert(string_property(track, "id")?) {
                return Err(EvaluationPayloadError::payload());
            }
            if number_property(track, "startFrame")? < 0.0 {
                return Err(EvaluationPayloadError::payload());
            }
            validate_nullable_nonnegative(track.get("sourceDurationSeconds"))?;
        }
        for track in optional_array_property(clip, "lipSyncTracks")? {
            let track = object(track)?;
            if !audio_ids.contains(string_property(track, "sourceAudioTrackId")?) {
                return Err(EvaluationPayloadError::payload());
            }
            if let Some(parameter_id) = nullable_string_property(track, "targetParameterId")?
                && !parameters.contains(parameter_id)
            {
                return Err(EvaluationPayloadError::payload());
            }
            if number_property(track, "analysisFps")? <= 0.0 {
                return Err(EvaluationPayloadError::payload());
            }
            validate_nullable_nonnegative(track.get("sourceDurationSecondsAtBake"))?;
        }
        for track in optional_array_property(clip, "ikControllerTracks")? {
            let track = object(track)?;
            if !controllers.contains(string_property(track, "controllerId")?) {
                return Err(EvaluationPayloadError::payload());
            }
            validate_keyframes(array_property(track, "targetXKeyframes")?)?;
            validate_keyframes(array_property(track, "targetYKeyframes")?)?;
        }
    }
    Ok(clip_ids)
}

fn validate_keyframes(keyframes: &[Value]) -> Result<(), EvaluationPayloadError> {
    for keyframe in keyframes {
        if number_property(object(keyframe)?, "frame")? < 0.0 {
            return Err(EvaluationPayloadError::payload());
        }
    }
    Ok(())
}

fn validate_nullable_nonnegative(value: Option<&Value>) -> Result<(), EvaluationPayloadError> {
    let value = value.ok_or_else(EvaluationPayloadError::internal)?;
    if !value.is_null() && number(value)? < 0.0 {
        return Err(EvaluationPayloadError::payload());
    }
    Ok(())
}

fn validate_state_machines(
    machines: &[Value],
    parameters: &HashSet<&str>,
    clips: &HashSet<&str>,
) -> Result<(), EvaluationPayloadError> {
    let mut machine_ids = fallible_set(machines.len())?;
    for machine in machines {
        let machine = object(machine)?;
        if !machine_ids.insert(string_property(machine, "id")?) {
            return Err(EvaluationPayloadError::payload());
        }
        let states = array_property(machine, "states")?;
        let mut state_ids = fallible_set(states.len())?;
        for state in states {
            let state = object(state)?;
            if !state_ids.insert(string_property(state, "id")?) {
                return Err(EvaluationPayloadError::payload());
            }
        }
        if !state_ids.contains(string_property(machine, "initialStateId")?) {
            return Err(EvaluationPayloadError::payload());
        }
        for state in states {
            let state = object(state)?;
            if let Some(clip_id) = optional_string_property(state, "clipId")?
                && !clips.contains(clip_id)
            {
                return Err(EvaluationPayloadError::payload());
            }
            if let Some(tree) = optional_object_property(state, "blendTree")? {
                if !parameters.contains(string_property(tree, "parameterId")?) {
                    return Err(EvaluationPayloadError::payload());
                }
                for entry in array_property(tree, "entries")? {
                    if !clips.contains(string_property(object(entry)?, "clipId")?) {
                        return Err(EvaluationPayloadError::payload());
                    }
                }
            }
        }
        let transitions = array_property(machine, "transitions")?;
        let mut transition_ids = fallible_set(transitions.len())?;
        for transition in transitions {
            let transition = object(transition)?;
            if !transition_ids.insert(string_property(transition, "id")?) {
                return Err(EvaluationPayloadError::payload());
            }
            if !state_ids.contains(string_property(transition, "fromStateId")?)
                || !state_ids.contains(string_property(transition, "toStateId")?)
                || number_property(transition, "transitionDuration")? < 0.0
            {
                return Err(EvaluationPayloadError::payload());
            }
            for condition in array_property(transition, "conditions")? {
                if !parameters.contains(string_property(object(condition)?, "parameterId")?) {
                    return Err(EvaluationPayloadError::payload());
                }
            }
        }
    }
    Ok(())
}

fn validate_atlases(
    atlases: &[Value],
    layers: &LayerState<'_>,
) -> Result<Vec<RequiredTextureBindingV1>, EvaluationPayloadError> {
    let mut atlas_ids = fallible_set(atlases.len())?;
    let mut covered_meshes = fallible_set(layers.mesh_ids.len())?;
    let mut total_texture_bytes = 0_u64;
    let mut bindings = Vec::new();
    bindings
        .try_reserve_exact(atlases.len())
        .map_err(|_| EvaluationPayloadError::limit())?;

    for atlas in atlases {
        let atlas = object(atlas)?;
        let source_id = string_property(atlas, "id")?;
        if !atlas_ids.insert(source_id) {
            return Err(EvaluationPayloadError::payload());
        }
        let width = positive_u32_property(atlas, "width")?;
        let height = positive_u32_property(atlas, "height")?;
        let pixels = u64::from(width)
            .checked_mul(u64::from(height))
            .ok_or_else(EvaluationPayloadError::limit)?;
        if pixels > 67_108_864 {
            return Err(EvaluationPayloadError::limit());
        }
        let texture_bytes = pixels
            .checked_mul(4)
            .ok_or_else(EvaluationPayloadError::limit)?;
        total_texture_bytes = total_texture_bytes
            .checked_add(texture_bytes)
            .ok_or_else(EvaluationPayloadError::limit)?;
        if total_texture_bytes > MAX_TEXTURE_BYTES {
            return Err(EvaluationPayloadError::limit());
        }

        let entries = array_property(atlas, "entries")?;
        if entries.len() > layers.mesh_ids.len() {
            return Err(EvaluationPayloadError::payload());
        }
        enforce_unique_property(entries, "layerId")?;
        covered_meshes
            .try_reserve(entries.len())
            .map_err(|_| EvaluationPayloadError::limit())?;
        for entry in entries {
            let entry = object(entry)?;
            let layer_id = string_property(entry, "layerId")?;
            if !layers.mesh_ids.contains(layer_id) || !covered_meshes.insert(layer_id) {
                return Err(EvaluationPayloadError::payload());
            }
            let x = nonnegative_u64_property(entry, "x")?;
            let y = nonnegative_u64_property(entry, "y")?;
            let entry_width = nonnegative_u64_property(entry, "width")?;
            let entry_height = nonnegative_u64_property(entry, "height")?;
            if x.checked_add(entry_width)
                .is_none_or(|right| right > u64::from(width))
                || y.checked_add(entry_height)
                    .is_none_or(|bottom| bottom > u64::from(height))
            {
                return Err(EvaluationPayloadError::payload());
            }
        }

        let id_length = "atlas:"
            .len()
            .checked_add(source_id.len())
            .ok_or_else(EvaluationPayloadError::limit)?;
        let mut binding_id = String::new();
        binding_id
            .try_reserve_exact(id_length)
            .map_err(|_| EvaluationPayloadError::limit())?;
        binding_id.push_str("atlas:");
        binding_id.push_str(source_id);
        bindings.push(RequiredTextureBindingV1 {
            id: binding_id,
            width,
            height,
        });
    }
    if covered_meshes.len() != layers.mesh_ids.len()
        || layers
            .mesh_ids
            .iter()
            .any(|mesh_id| !covered_meshes.contains(mesh_id))
    {
        return Err(EvaluationPayloadError::payload());
    }
    bindings.sort_unstable_by(|left, right| left.id.as_bytes().cmp(right.id.as_bytes()));
    Ok(bindings)
}

fn enforce_unique_property(values: &[Value], property: &str) -> Result<(), EvaluationPayloadError> {
    let mut ids = fallible_set(values.len())?;
    for value in values {
        let id = string_property(object(value)?, property)?;
        if !ids.insert(id) {
            return Err(EvaluationPayloadError::payload());
        }
    }
    Ok(())
}

fn object(value: &Value) -> Result<&Map<String, Value>, EvaluationPayloadError> {
    value
        .as_object()
        .ok_or_else(EvaluationPayloadError::internal)
}

fn array(value: &Value) -> Result<&[Value], EvaluationPayloadError> {
    value
        .as_array()
        .map(Vec::as_slice)
        .ok_or_else(EvaluationPayloadError::internal)
}

fn string(value: &Value) -> Result<&str, EvaluationPayloadError> {
    value.as_str().ok_or_else(EvaluationPayloadError::internal)
}

fn number(value: &Value) -> Result<f64, EvaluationPayloadError> {
    let value = value
        .as_f64()
        .ok_or_else(EvaluationPayloadError::internal)?;
    if !value.is_finite() {
        return Err(EvaluationPayloadError::payload());
    }
    Ok(value)
}

fn object_property<'a>(
    object: &'a Map<String, Value>,
    property: &str,
) -> Result<&'a Map<String, Value>, EvaluationPayloadError> {
    object
        .get(property)
        .ok_or_else(EvaluationPayloadError::internal)
        .and_then(self::object)
}

fn optional_object_property<'a>(
    object: &'a Map<String, Value>,
    property: &str,
) -> Result<Option<&'a Map<String, Value>>, EvaluationPayloadError> {
    object.get(property).map(self::object).transpose()
}

fn array_property<'a>(
    object: &'a Map<String, Value>,
    property: &str,
) -> Result<&'a [Value], EvaluationPayloadError> {
    object
        .get(property)
        .ok_or_else(EvaluationPayloadError::internal)
        .and_then(self::array)
}

fn optional_array_property<'a>(
    object: &'a Map<String, Value>,
    property: &str,
) -> Result<&'a [Value], EvaluationPayloadError> {
    object.get(property).map_or(Ok(&[]), self::array)
}

fn string_property<'a>(
    object: &'a Map<String, Value>,
    property: &str,
) -> Result<&'a str, EvaluationPayloadError> {
    object
        .get(property)
        .ok_or_else(EvaluationPayloadError::internal)
        .and_then(self::string)
}

fn optional_string_property<'a>(
    object: &'a Map<String, Value>,
    property: &str,
) -> Result<Option<&'a str>, EvaluationPayloadError> {
    object.get(property).map(self::string).transpose()
}

fn nullable_string_property<'a>(
    object: &'a Map<String, Value>,
    property: &str,
) -> Result<Option<&'a str>, EvaluationPayloadError> {
    match object
        .get(property)
        .ok_or_else(EvaluationPayloadError::internal)?
    {
        Value::Null => Ok(None),
        value => string(value).map(Some),
    }
}

fn number_property(
    object: &Map<String, Value>,
    property: &str,
) -> Result<f64, EvaluationPayloadError> {
    object
        .get(property)
        .ok_or_else(EvaluationPayloadError::internal)
        .and_then(self::number)
}

fn nonnegative_safe_u64(value: &Value) -> Result<u64, EvaluationPayloadError> {
    let value = number(value)?;
    if value < 0.0 || value.fract() != 0.0 || value > 9_007_199_254_740_991.0 {
        return Err(EvaluationPayloadError::internal());
    }
    Ok(value as u64)
}

fn nonnegative_u64_property(
    object: &Map<String, Value>,
    property: &str,
) -> Result<u64, EvaluationPayloadError> {
    let value = object
        .get(property)
        .ok_or_else(EvaluationPayloadError::internal)?;
    nonnegative_safe_u64(value)
}

fn positive_u32_property(
    object: &Map<String, Value>,
    property: &str,
) -> Result<u32, EvaluationPayloadError> {
    let value = nonnegative_u64_property(object, property)?;
    if value == 0 || value > u64::from(u32::MAX) {
        return Err(EvaluationPayloadError::internal());
    }
    u32::try_from(value).map_err(|_| EvaluationPayloadError::internal())
}

fn fallible_set<T>(capacity: usize) -> Result<HashSet<T>, EvaluationPayloadError>
where
    T: Eq + std::hash::Hash,
{
    let mut values = HashSet::new();
    values
        .try_reserve(capacity)
        .map_err(|_| EvaluationPayloadError::limit())?;
    Ok(values)
}

fn fallible_map<K, V>(capacity: usize) -> Result<HashMap<K, V>, EvaluationPayloadError>
where
    K: Eq + std::hash::Hash,
{
    let mut values = HashMap::new();
    values
        .try_reserve(capacity)
        .map_err(|_| EvaluationPayloadError::limit())?;
    Ok(values)
}
