use std::collections::{HashMap, HashSet};

use serde_json::{Map, Value};

use crate::errors::RuntimeError;
use crate::limits::RuntimeLimits;
use crate::parser::RuntimePayload;
use crate::status;

const DEFAULT_DRAW_ORDER: i32 = 500;
const MAX_LAYER_TREE_DEPTH: usize = 256;

/// Static texture metadata.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TextureSnapshot {
    /// Runtime texture ID.
    pub id: String,
    /// Texture width.
    pub width: u32,
    /// Texture height.
    pub height: u32,
    /// Host image ID.
    pub host_image_id: String,
}

/// Runtime blend mode.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum BlendMode {
    /// Normal alpha blending.
    Normal,
    /// Multiply blending.
    Multiply,
    /// Screen blending.
    Screen,
    /// Additive blending.
    Add,
}

/// Static mesh render snapshot.
#[derive(Clone, Debug, PartialEq)]
pub struct MeshSnapshot {
    /// Mesh/layer ID.
    pub id: String,
    /// Texture ID.
    pub texture_id: String,
    /// Vertex positions.
    pub vertices: Vec<f32>,
    /// UV coordinates.
    pub uvs: Vec<f32>,
    /// Triangle indices.
    pub indices: Vec<u32>,
    /// Mesh translation in model coordinates.
    pub x: f32,
    /// Mesh translation in model coordinates.
    pub y: f32,
    /// Layer opacity.
    pub opacity: f32,
    /// Layer visibility.
    pub visible: bool,
    /// Back-face culling flag.
    pub culled: bool,
    /// Blend mode.
    pub blend_mode: BlendMode,
    /// Draw order.
    pub draw_order: i32,
    /// Multiply tint color.
    pub multiply_color: Option<[f32; 4]>,
    /// Screen tint color.
    pub screen_color: Option<[f32; 4]>,
}

/// Static model data extracted after parser validation.
#[derive(Clone, Debug, PartialEq)]
pub struct StaticModel {
    textures: Vec<TextureSnapshot>,
    meshes: Vec<MeshSnapshot>,
}

impl StaticModel {
    /// Build static render data from a parsed Runtime Spec v1 payload.
    pub fn from_payload(payload: &RuntimePayload) -> Result<Self, RuntimeError> {
        Self::from_payload_with_limits(payload, RuntimeLimits::default())
    }

    /// Build static render data from a parsed Runtime Spec v1 payload with limits.
    pub fn from_payload_with_limits(
        payload: &RuntimePayload,
        limits: RuntimeLimits,
    ) -> Result<Self, RuntimeError> {
        let limits = limits.hardened();
        let root = object(&payload.value, "runtime payload")?;
        let atlases = array_field(root, "atlases", "atlases")?;
        assert_limit("textures", atlases.len(), limits.max_textures)?;
        let project = object_field(root, "project", "project")?;
        let layers = array_field(project, "layers", "project.layers")?;

        let mut textures = Vec::with_capacity(atlases.len());
        let mut atlas_by_layer = HashMap::new();
        let mut atlas_entry_count = 0usize;
        let mut texture_byte_count = 0u64;
        for (atlas_index, atlas) in atlases.iter().enumerate() {
            let atlas_path = format!("atlases[{atlas_index}]");
            let atlas_object = object(atlas, &atlas_path)?;
            let texture_id = format!("atlas:{atlas_index}");
            let width = u32_field(atlas_object, "width", &format!("{atlas_path}.width"))?;
            let height = u32_field(atlas_object, "height", &format!("{atlas_path}.height"))?;
            let texture_bytes = u64::from(width)
                .checked_mul(u64::from(height))
                .and_then(|pixels| pixels.checked_mul(4))
                .ok_or_else(|| {
                    RuntimeError::new(status::LIMIT_EXCEEDED, "texture byte count overflow")
                })?;
            texture_byte_count =
                texture_byte_count
                    .checked_add(texture_bytes)
                    .ok_or_else(|| {
                        RuntimeError::new(status::LIMIT_EXCEEDED, "texture byte count overflow")
                    })?;
            if texture_byte_count > limits.max_texture_bytes {
                return Err(RuntimeError::new(
                    status::LIMIT_EXCEEDED,
                    format!(
                        "textureBytes exceeds runtime limit: {texture_byte_count} > {}",
                        limits.max_texture_bytes
                    ),
                ));
            }
            textures.push(TextureSnapshot {
                id: texture_id.clone(),
                width,
                height,
                host_image_id: string_field(atlas_object, "image", &format!("{atlas_path}.image"))?
                    .to_owned(),
            });
            let entries = array_field(atlas_object, "entries", &format!("{atlas_path}.entries"))?;
            atlas_entry_count += entries.len();
            assert_limit("atlas entries", atlas_entry_count, limits.max_layers)?;
            for (entry_index, entry) in entries.iter().enumerate() {
                let entry_path = format!("{atlas_path}.entries[{entry_index}]");
                let entry_object = object(entry, &entry_path)?;
                let layer_id =
                    string_field(entry_object, "layerId", &format!("{entry_path}.layerId"))?;
                if atlas_by_layer
                    .insert(layer_id.to_owned(), texture_id.clone())
                    .is_some()
                {
                    return Err(RuntimeError::new(
                        status::TEXTURE,
                        format!("mesh layer has duplicate runtime atlas entries: {layer_id}"),
                    ));
                }
            }
        }

        let mut meshes = Vec::new();
        let mut layer_count = 0usize;
        collect_meshes(
            layers,
            &atlas_by_layer,
            &mut meshes,
            &mut layer_count,
            limits,
            0,
        )?;
        assert_limit("meshes", meshes.len(), limits.max_meshes)?;
        let mesh_ids = meshes
            .iter()
            .map(|mesh| mesh.id.as_str())
            .collect::<HashSet<_>>();
        for layer_id in atlas_by_layer.keys() {
            if !mesh_ids.contains(layer_id.as_str()) {
                return Err(RuntimeError::new(
                    status::TEXTURE,
                    format!("runtime atlas references an unknown mesh layer: {layer_id}"),
                ));
            }
        }
        meshes.sort_by_key(|mesh| mesh.draw_order);

        Ok(Self { textures, meshes })
    }

    /// Return texture snapshots.
    pub fn textures(&self) -> &[TextureSnapshot] {
        &self.textures
    }

    /// Return mesh snapshots in render order.
    pub fn meshes(&self) -> &[MeshSnapshot] {
        &self.meshes
    }
}

fn collect_meshes(
    layers: &[Value],
    atlas_by_layer: &HashMap<String, String>,
    meshes: &mut Vec<MeshSnapshot>,
    layer_count: &mut usize,
    limits: RuntimeLimits,
    depth: usize,
) -> Result<(), RuntimeError> {
    assert_limit("layer tree depth", depth, MAX_LAYER_TREE_DEPTH)?;
    for (index, layer) in layers.iter().enumerate() {
        *layer_count += 1;
        assert_limit("layers", *layer_count, limits.max_layers)?;
        let path = format!("layers[{index}]");
        let layer_object = object(layer, &path)?;
        if string_field(layer_object, "kind", &format!("{path}.kind"))? == "viviMesh" {
            assert_limit("meshes", meshes.len() + 1, limits.max_meshes)?;
            meshes.push(read_mesh(layer_object, atlas_by_layer, &path, limits)?);
        }
        if let Some(children) = layer_object.get("children") {
            collect_meshes(
                array(children, &format!("{path}.children"))?,
                atlas_by_layer,
                meshes,
                layer_count,
                limits,
                depth + 1,
            )?;
        }
    }
    Ok(())
}

fn read_mesh(
    layer: &Map<String, Value>,
    atlas_by_layer: &HashMap<String, String>,
    path: &str,
    limits: RuntimeLimits,
) -> Result<MeshSnapshot, RuntimeError> {
    let id = string_field(layer, "id", &format!("{path}.id"))?;
    let texture_id = atlas_by_layer.get(id).ok_or_else(|| {
        RuntimeError::new(
            status::TEXTURE,
            format!("mesh layer has no runtime atlas entry: {id}"),
        )
    })?;
    let mesh = object_field(layer, "mesh", &format!("{path}.mesh"))?;
    let vertices = f32_array_field(mesh, "vertices", &format!("{path}.mesh.vertices"))?;
    let uvs = f32_array_field(mesh, "uvs", &format!("{path}.mesh.uvs"))?;
    let indices = u32_array_field(mesh, "indices", &format!("{path}.mesh.indices"))?;
    validate_mesh_geometry(&vertices, &uvs, &indices, path)?;
    let vertex_count = vertices.len() / 2;
    assert_limit("vertices", vertex_count, limits.max_vertices_per_mesh)?;
    assert_limit("indices", indices.len(), limits.max_indices_per_mesh)?;
    let x = optional_f32_field(layer, "x", &format!("{path}.x"))?.unwrap_or(0.0);
    let y = optional_f32_field(layer, "y", &format!("{path}.y"))?.unwrap_or(0.0);
    let opacity = f32_field(layer, "opacity", &format!("{path}.opacity"))?;
    let blend_mode = blend_mode(string_field(
        layer,
        "blendMode",
        &format!("{path}.blendMode"),
    )?)?;

    let culling =
        optional_bool_field(layer, "culling", &format!("{path}.culling"))?.unwrap_or(false);
    let visible = bool_field(layer, "visible", &format!("{path}.visible"))?;
    let culled = culling && visible && is_polygon_flipped(&vertices);

    Ok(MeshSnapshot {
        id: id.to_owned(),
        texture_id: texture_id.clone(),
        vertices,
        uvs,
        indices,
        x,
        y,
        opacity,
        visible: visible && !culled,
        culled,
        blend_mode,
        draw_order: optional_i32_field(layer, "drawOrder", &format!("{path}.drawOrder"))?
            .unwrap_or(DEFAULT_DRAW_ORDER),
        multiply_color: color_field(layer, "multiplyColor", &format!("{path}.multiplyColor"))?,
        screen_color: color_field(layer, "screenColor", &format!("{path}.screenColor"))?
            .filter(|color| color[0] != 0.0 || color[1] != 0.0 || color[2] != 0.0),
    })
}

fn is_polygon_flipped(vertices: &[f32]) -> bool {
    if vertices.len() < 6 {
        return false;
    }
    let mut signed_area = 0.0_f32;
    for index in (0..vertices.len()).step_by(2) {
        let next = (index + 2) % vertices.len();
        signed_area += vertices[index] * vertices[next + 1] - vertices[next] * vertices[index + 1];
    }
    signed_area < 0.0
}

fn validate_mesh_geometry(
    vertices: &[f32],
    uvs: &[f32],
    indices: &[u32],
    path: &str,
) -> Result<(), RuntimeError> {
    if !vertices.len().is_multiple_of(2) {
        return Err(validation_error(format!(
            "{path}.mesh.vertices must contain x/y pairs"
        )));
    }
    if !uvs.len().is_multiple_of(2) {
        return Err(validation_error(format!(
            "{path}.mesh.uvs must contain u/v pairs"
        )));
    }
    if uvs.len() != vertices.len() {
        return Err(validation_error(format!(
            "{path}.mesh.uvs must match vertex coordinate count"
        )));
    }
    if !indices.len().is_multiple_of(3) {
        return Err(validation_error(format!(
            "{path}.mesh.indices must contain triangle triplets"
        )));
    }
    let vertex_count = vertices.len() / 2;
    for (index, vertex_index) in indices.iter().enumerate() {
        if *vertex_index as usize >= vertex_count {
            return Err(validation_error(format!(
                "{path}.mesh.indices[{index}] references missing vertex {vertex_index}"
            )));
        }
    }
    Ok(())
}

fn blend_mode(value: &str) -> Result<BlendMode, RuntimeError> {
    match value {
        "normal" => Ok(BlendMode::Normal),
        "multiply" => Ok(BlendMode::Multiply),
        "screen" => Ok(BlendMode::Screen),
        "add" => Ok(BlendMode::Add),
        _ => Err(validation_error(format!(
            "unsupported blend mode for static mesh: {value}"
        ))),
    }
}

fn object<'a>(value: &'a Value, path: &str) -> Result<&'a Map<String, Value>, RuntimeError> {
    value
        .as_object()
        .ok_or_else(|| validation_error(format!("{path} must be an object")))
}

fn object_field<'a>(
    object: &'a Map<String, Value>,
    key: &str,
    path: &str,
) -> Result<&'a Map<String, Value>, RuntimeError> {
    object
        .get(key)
        .ok_or_else(|| validation_error(format!("{path} is required")))
        .and_then(|value| self::object(value, path))
}

fn array_field<'a>(
    object: &'a Map<String, Value>,
    key: &str,
    path: &str,
) -> Result<&'a [Value], RuntimeError> {
    object
        .get(key)
        .ok_or_else(|| validation_error(format!("{path} is required")))
        .and_then(|value| array(value, path))
}

fn array<'a>(value: &'a Value, path: &str) -> Result<&'a [Value], RuntimeError> {
    value
        .as_array()
        .map(Vec::as_slice)
        .ok_or_else(|| validation_error(format!("{path} must be an array")))
}

fn string_field<'a>(
    object: &'a Map<String, Value>,
    key: &str,
    path: &str,
) -> Result<&'a str, RuntimeError> {
    object
        .get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| validation_error(format!("{path} must be a string")))
}

fn bool_field(object: &Map<String, Value>, key: &str, path: &str) -> Result<bool, RuntimeError> {
    object
        .get(key)
        .and_then(Value::as_bool)
        .ok_or_else(|| validation_error(format!("{path} must be a boolean")))
}

fn optional_bool_field(
    object: &Map<String, Value>,
    key: &str,
    path: &str,
) -> Result<Option<bool>, RuntimeError> {
    let Some(value) = object.get(key) else {
        return Ok(None);
    };
    value
        .as_bool()
        .map(Some)
        .ok_or_else(|| validation_error(format!("{path} must be a boolean")))
}

fn u32_field(object: &Map<String, Value>, key: &str, path: &str) -> Result<u32, RuntimeError> {
    let value = object
        .get(key)
        .and_then(Value::as_u64)
        .and_then(|value| u32::try_from(value).ok())
        .ok_or_else(|| validation_error(format!("{path} must be a uint32")))?;
    Ok(value)
}

fn optional_i32_field(
    object: &Map<String, Value>,
    key: &str,
    path: &str,
) -> Result<Option<i32>, RuntimeError> {
    let Some(value) = object.get(key) else {
        return Ok(None);
    };
    value
        .as_i64()
        .and_then(|value| i32::try_from(value).ok())
        .map(Some)
        .ok_or_else(|| validation_error(format!("{path} must be an int32")))
}

fn f32_field(object: &Map<String, Value>, key: &str, path: &str) -> Result<f32, RuntimeError> {
    object
        .get(key)
        .and_then(Value::as_f64)
        .filter(|value| value.is_finite())
        .map(|value| value as f32)
        .ok_or_else(|| validation_error(format!("{path} must be finite")))
}

fn f32_array_field(
    object: &Map<String, Value>,
    key: &str,
    path: &str,
) -> Result<Vec<f32>, RuntimeError> {
    array_field(object, key, path)?
        .iter()
        .enumerate()
        .map(|(index, value)| {
            value
                .as_f64()
                .filter(|number| number.is_finite())
                .map(|number| number as f32)
                .ok_or_else(|| validation_error(format!("{path}[{index}] must be finite")))
        })
        .collect()
}

fn u32_array_field(
    object: &Map<String, Value>,
    key: &str,
    path: &str,
) -> Result<Vec<u32>, RuntimeError> {
    array_field(object, key, path)?
        .iter()
        .enumerate()
        .map(|(index, value)| {
            value
                .as_u64()
                .and_then(|number| u32::try_from(number).ok())
                .ok_or_else(|| validation_error(format!("{path}[{index}] must be a uint32")))
        })
        .collect()
}

fn color_field(
    object: &Map<String, Value>,
    key: &str,
    path: &str,
) -> Result<Option<[f32; 4]>, RuntimeError> {
    let Some(value) = object.get(key) else {
        return Ok(None);
    };
    let color = value
        .as_object()
        .ok_or_else(|| validation_error(format!("{path} must be an object")))?;
    Ok(Some([
        f32_field(color, "r", &format!("{path}.r"))?,
        f32_field(color, "g", &format!("{path}.g"))?,
        f32_field(color, "b", &format!("{path}.b"))?,
        optional_f32_field(color, "a", &format!("{path}.a"))?.unwrap_or(1.0),
    ]))
}

fn optional_f32_field(
    object: &Map<String, Value>,
    key: &str,
    path: &str,
) -> Result<Option<f32>, RuntimeError> {
    let Some(value) = object.get(key) else {
        return Ok(None);
    };
    value
        .as_f64()
        .filter(|number| number.is_finite())
        .map(|number| Some(number as f32))
        .ok_or_else(|| validation_error(format!("{path} must be finite")))
}

fn validation_error(message: String) -> RuntimeError {
    RuntimeError::new(status::VALIDATION, message)
}

fn assert_limit(label: &str, actual: usize, limit: usize) -> Result<(), RuntimeError> {
    if actual > limit {
        return Err(RuntimeError::new(
            status::LIMIT_EXCEEDED,
            format!("{label} exceeds runtime limit: {actual} > {limit}"),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use serde_json::{Value, json};

    use super::*;
    use crate::{RuntimeLimits, RuntimePayload, parse_runtime_payload};

    #[test]
    fn extracts_basic_conformance_mesh_snapshot() {
        let fixture = serde_json::from_str::<Value>(include_str!(
            "../../../../../tests/conformance/runtime-v1/basic-mesh.fixture.json"
        ))
        .unwrap();
        let file_data = fixture.get("fileData").unwrap().to_string();
        let payload =
            parse_runtime_payload(file_data.as_bytes(), RuntimeLimits::default()).unwrap();
        let model = StaticModel::from_payload(&payload).unwrap();

        assert_eq!(
            model.textures(),
            &[TextureSnapshot {
                id: "atlas:0".to_owned(),
                width: 16,
                height: 16,
                host_image_id: "host-atlas-0".to_owned(),
            }]
        );
        assert_eq!(model.meshes().len(), 1);
        let mesh = &model.meshes()[0];
        assert_eq!(mesh.id, "mesh-body");
        assert_eq!(mesh.texture_id, "atlas:0");
        assert_eq!(mesh.draw_order, 10);
        assert_eq!(mesh.blend_mode, BlendMode::Normal);
        assert_eq!(mesh.vertices, vec![0.0, 0.0, 10.0, 0.0, 0.0, 10.0]);
        assert_eq!(mesh.uvs, vec![0.0, 0.0, 1.0, 0.0, 0.0, 1.0]);
        assert_eq!(mesh.indices, vec![0, 1, 2]);
    }

    #[test]
    fn rejects_texture_binding_errors() {
        let duplicate = serde_json::from_str::<Value>(include_str!(
            "../../../../../tests/conformance/runtime-v1/texture-duplicate-atlas-entry.fixture.json"
        ))
        .unwrap();
        let file_data = duplicate.get("fileData").unwrap().to_string();
        let payload =
            parse_runtime_payload(file_data.as_bytes(), RuntimeLimits::default()).unwrap();
        let error = StaticModel::from_payload(&payload).unwrap_err();
        assert_eq!(error.status(), status::TEXTURE);

        let missing = serde_json::from_str::<Value>(include_str!(
            "../../../../../tests/conformance/runtime-v1/texture-missing-atlas-entry.fixture.json"
        ))
        .unwrap();
        let file_data = missing.get("fileData").unwrap().to_string();
        let payload =
            parse_runtime_payload(file_data.as_bytes(), RuntimeLimits::default()).unwrap();
        let error = StaticModel::from_payload(&payload).unwrap_err();
        assert_eq!(error.status(), status::TEXTURE);
    }

    #[test]
    fn uses_runtime_default_draw_order_and_static_culled_state() {
        let payload = br#"{
          "profile":"publicProfileV1",
          "version":10,
          "atlases":[{"image":"atlas","width":1,"height":1,"entries":[{"layerId":"a","x":0,"y":0,"width":1,"height":1}]}],
          "project":{"layers":[{"id":"a","name":"A","visible":true,"opacity":1,"x":0,"y":0,"width":1,"height":1,"blendMode":"normal","expanded":true,"kind":"viviMesh","children":[],"culling":true,"mesh":{"vertices":[0,0,1,0,0,1],"uvs":[0,0,1,0,0,1],"indices":[0,1,2],"divisionsX":1,"divisionsY":1}}]}
        }"#;
        let payload = parse_runtime_payload(payload, RuntimeLimits::default()).unwrap();
        let model = StaticModel::from_payload(&payload).unwrap();
        assert_eq!(model.meshes()[0].draw_order, 500);
        assert!(!model.meshes()[0].culled);
    }

    #[test]
    fn defaults_missing_static_layer_translation_to_zero() {
        let mut layer = base_layer();
        let object = layer.as_object_mut().unwrap();
        object.remove("x");
        object.remove("y");
        let payload = runtime_payload(runtime_payload_value(layer));
        let model = StaticModel::from_payload(&payload).unwrap();

        assert_eq!(model.meshes()[0].x, 0.0);
        assert_eq!(model.meshes()[0].y, 0.0);
    }

    #[test]
    fn rejects_malformed_mesh_geometry() {
        for mesh in [
            json!({"vertices":[0,0,1,0,0],"uvs":[0,0,1,0,0,1],"indices":[0,1,2],"divisionsX":1,"divisionsY":1}),
            json!({"vertices":[0,0,1,0,0,1],"uvs":[0,0,1,0],"indices":[0,1,2],"divisionsX":1,"divisionsY":1}),
            json!({"vertices":[0,0,1,0,0,1],"uvs":[0,0,1,0,0,1],"indices":[0,1],"divisionsX":1,"divisionsY":1}),
            json!({"vertices":[0,0,1,0,0,1],"uvs":[0,0,1,0,0,1],"indices":[0,1,3],"divisionsX":1,"divisionsY":1}),
        ] {
            let payload = runtime_payload(static_payload_with_mesh(mesh));
            let error = StaticModel::from_payload(&payload).unwrap_err();
            assert_eq!(error.status(), status::VALIDATION);
        }
    }

    #[test]
    fn rejects_strict_static_layer_metadata_errors() {
        let payload = runtime_payload(static_payload_with_layer(json!({"blendMode":"overlay"})));
        let error = StaticModel::from_payload(&payload).unwrap_err();
        assert_eq!(error.status(), status::VALIDATION);

        let payload = runtime_payload(static_payload_with_layer(json!({"drawOrder":"front"})));
        let error = StaticModel::from_payload(&payload).unwrap_err();
        assert_eq!(error.status(), status::VALIDATION);

        let payload = runtime_payload(static_payload_with_layer(json!({"x":"left"})));
        let error = StaticModel::from_payload(&payload).unwrap_err();
        assert_eq!(error.status(), status::VALIDATION);
    }

    #[test]
    fn bounds_atlas_entries_and_layer_tree_depth() {
        let payload = runtime_payload(static_payload());
        let error = StaticModel::from_payload_with_limits(
            &payload,
            RuntimeLimits {
                max_layers: 0,
                ..RuntimeLimits::default()
            },
        )
        .unwrap_err();
        assert_eq!(error.status(), status::LIMIT_EXCEEDED);

        let mut layer = base_layer();
        for _ in 0..=MAX_LAYER_TREE_DEPTH {
            layer = json!({
                "id":"group",
                "name":"Group",
                "visible":true,
                "opacity":1,
                "x":0,
                "y":0,
                "width":1,
                "height":1,
                "blendMode":"normal",
                "expanded":true,
                "kind":"group",
                "children":[layer]
            });
        }
        let payload = RuntimePayload {
            value: json!({
                "profile":"publicProfileV1",
                "version":10,
                "atlases":[],
                "project":{"layers":[layer]}
            }),
        };
        let error = StaticModel::from_payload(&payload).unwrap_err();
        assert_eq!(error.status(), status::LIMIT_EXCEEDED);
    }

    #[test]
    fn enforces_static_model_limits() {
        let fixture = serde_json::from_str::<Value>(include_str!(
            "../../../../../tests/conformance/runtime-v1/basic-mesh.fixture.json"
        ))
        .unwrap();
        let file_data = fixture.get("fileData").unwrap().to_string();
        let payload =
            parse_runtime_payload(file_data.as_bytes(), RuntimeLimits::default()).unwrap();
        let error = StaticModel::from_payload_with_limits(
            &payload,
            RuntimeLimits {
                max_meshes: 0,
                ..RuntimeLimits::default()
            },
        )
        .unwrap_err();
        assert_eq!(error.status(), status::LIMIT_EXCEEDED);

        let error = StaticModel::from_payload_with_limits(
            &payload,
            RuntimeLimits {
                max_texture_bytes: 1,
                ..RuntimeLimits::default()
            },
        )
        .unwrap_err();
        assert_eq!(error.status(), status::LIMIT_EXCEEDED);
    }

    fn runtime_payload(value: Value) -> RuntimePayload {
        parse_runtime_payload(value.to_string().as_bytes(), RuntimeLimits::default()).unwrap()
    }

    fn static_payload() -> Value {
        static_payload_with_layer(json!({}))
    }

    fn static_payload_with_mesh(mesh: Value) -> Value {
        let mut layer = base_layer();
        layer
            .as_object_mut()
            .unwrap()
            .insert("mesh".to_owned(), mesh);
        runtime_payload_value(layer)
    }

    fn static_payload_with_layer(layer_fields: Value) -> Value {
        let mut layer = base_layer();
        let Value::Object(fields) = layer_fields else {
            panic!("layer_fields must be an object");
        };
        layer.as_object_mut().unwrap().extend(fields);
        runtime_payload_value(layer)
    }

    fn runtime_payload_value(layer: Value) -> Value {
        json!({
          "profile":"publicProfileV1",
          "version":10,
          "atlases":[{"image":"atlas","width":1,"height":1,"entries":[{"layerId":"a","x":0,"y":0,"width":1,"height":1}]}],
          "project":{"layers":[layer]}
        })
    }

    fn base_layer() -> Value {
        json!({
          "id":"a",
          "name":"A",
          "visible":true,
          "opacity":1,
          "x":0,
          "y":0,
          "width":1,
          "height":1,
          "blendMode":"normal",
          "expanded":true,
          "kind":"viviMesh",
          "children":[],
          "drawOrder":10,
          "mesh":{"vertices":[0,0,1,0,0,1],"uvs":[0,0,1,0,0,1],"indices":[0,1,2],"divisionsX":1,"divisionsY":1}
        })
    }
}
