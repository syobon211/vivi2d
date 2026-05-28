#![deny(missing_docs)]

//! Native WebAssembly binding over the shared Vivi2D runtime core.
//!
//! The exported ABI is intentionally small and copy-oriented: JavaScript writes
//! UTF-8 JSON into linear memory, receives opaque model handles, and reads
//! JSON snapshots copied out of a temporary runtime-owned output buffer.
//! Output pointers are valid only until the next output-producing export writes
//! a new output buffer; the TypeScript wrapper copies them immediately.

use std::alloc::{Layout, alloc, dealloc};
use std::cell::RefCell;
use std::panic::{AssertUnwindSafe, catch_unwind};
use std::slice;
use std::str;

use serde_json::{Map, Value, json};
use vivi_runtime_native_core::{
    BlendMode, RuntimeError, RuntimeLimits, RuntimeModel, parse_runtime_payload, status,
};

const OK_HANDLE_BASE: u32 = 1;

struct WasmModel {
    model: RuntimeModel,
    width: f64,
    height: f64,
}

thread_local! {
    static MODELS: RefCell<Vec<Option<WasmModel>>> = const { RefCell::new(Vec::new()) };
    static OUTPUT_BYTES: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
    static LAST_ERROR: RefCell<WasmLastError> = RefCell::new(WasmLastError::ok());
}

#[derive(Clone)]
struct WasmLastError {
    status: i32,
    message: String,
}

impl WasmLastError {
    fn ok() -> Self {
        Self {
            status: status::OK,
            message: String::new(),
        }
    }
}

/// Return the ABI version that the native WASM wrapper reports.
pub fn native_wasm_abi_version() -> u32 {
    vivi_runtime_native_core::ABI_VERSION
}

/// Return the ABI version from the raw WebAssembly export surface.
#[unsafe(no_mangle)]
pub extern "C" fn vivi_runtime_abi_version() -> u32 {
    native_wasm_abi_version()
}

/// Allocate a writable input buffer in WebAssembly linear memory.
#[unsafe(no_mangle)]
pub extern "C" fn vivi_wasm_alloc(byte_len: u32) -> u32 {
    catch_u32(|| {
        if byte_len == 0 {
            return 0;
        }
        let Ok(layout) = Layout::from_size_align(byte_len as usize, 1) else {
            set_last_error(status::LIMIT_EXCEEDED, "invalid WASM input buffer size");
            return 0;
        };
        let pointer = unsafe {
            // SAFETY: `layout` is non-zero and uses byte alignment. The pointer
            // is returned to JS and later released by `vivi_wasm_free` with the
            // same size/alignment pair.
            alloc(layout)
        };
        if pointer.is_null() {
            set_last_error(
                status::LIMIT_EXCEEDED,
                "failed to allocate WASM input buffer",
            );
            return 0;
        }
        pointer as u32
    })
}

/// Free an input buffer previously returned by `vivi_wasm_alloc`.
#[unsafe(no_mangle)]
pub extern "C" fn vivi_wasm_free(pointer: u32, byte_len: u32) {
    let _ = catch_unwind(AssertUnwindSafe(|| {
        if pointer == 0 || byte_len == 0 {
            return;
        }
        let Ok(layout) = Layout::from_size_align(byte_len as usize, 1) else {
            return;
        };
        unsafe {
            // SAFETY: Callers must pass a pointer and byte length previously
            // returned by `vivi_wasm_alloc`; allocation and deallocation use the
            // same `Layout`.
            dealloc(pointer as *mut u8, layout);
        }
    }));
}

/// Return the byte length of the current copied output buffer.
#[unsafe(no_mangle)]
pub extern "C" fn vivi_wasm_output_len() -> u32 {
    catch_u32(|| OUTPUT_BYTES.with(|bytes| bytes.borrow().len() as u32))
}

/// Return the last canonical status code observed by this WASM module.
#[unsafe(no_mangle)]
pub extern "C" fn vivi_wasm_last_error_code() -> i32 {
    catch_i32(|| LAST_ERROR.with(|error| error.borrow().status))
}

/// Copy the last error message into the output buffer and return its pointer.
#[unsafe(no_mangle)]
pub extern "C" fn vivi_wasm_last_error_message_ptr() -> u32 {
    catch_u32(|| {
        let message = LAST_ERROR.with(|error| error.borrow().message.clone());
        set_output(message.into_bytes())
    })
}

/// Load a Runtime Spec v1 JSON payload and return an opaque model handle.
#[unsafe(no_mangle)]
pub extern "C" fn vivi_wasm_model_load(
    json_ptr: u32,
    json_len: u32,
    options_ptr: u32,
    options_len: u32,
) -> u32 {
    catch_u32(
        || match load_model_impl(json_ptr, json_len, options_ptr, options_len) {
            Ok(handle) => {
                clear_last_error();
                handle
            }
            Err(error) => {
                set_error(error);
                0
            }
        },
    )
}

/// Destroy a loaded model handle.
#[unsafe(no_mangle)]
pub extern "C" fn vivi_wasm_model_destroy(handle: u32) {
    let _ = catch_unwind(AssertUnwindSafe(|| {
        if handle < OK_HANDLE_BASE {
            return;
        }
        MODELS.with(|models| {
            let mut models = models.borrow_mut();
            let index = (handle - OK_HANDLE_BASE) as usize;
            if let Some(slot) = models.get_mut(index) {
                *slot = None;
            }
        });
    }));
}

/// Set a scalar runtime input on a loaded model.
#[unsafe(no_mangle)]
pub extern "C" fn vivi_wasm_model_set_input(
    handle: u32,
    id_ptr: u32,
    id_len: u32,
    value: f64,
) -> i32 {
    catch_status(|| {
        let id = read_utf8(id_ptr, id_len, "input ID")?;
        with_model_mut(handle, |model| model.model.set_input(&id, value))
    })
}

/// Apply an expression preset on a loaded model.
#[unsafe(no_mangle)]
pub extern "C" fn vivi_wasm_model_apply_expression_preset(
    handle: u32,
    id_ptr: u32,
    id_len: u32,
) -> i32 {
    catch_status(|| {
        let id = read_utf8(id_ptr, id_len, "expression preset ID")?;
        with_model_mut(handle, |model| model.model.apply_expression_preset(&id))
    })
}

/// Advance runtime evaluation for a loaded model.
#[unsafe(no_mangle)]
pub extern "C" fn vivi_wasm_model_update(handle: u32, delta_seconds: f64) -> i32 {
    catch_status(|| with_model_mut(handle, |model| model.model.update(delta_seconds)))
}

/// Copy a JSON runtime snapshot into the output buffer and return its pointer.
#[unsafe(no_mangle)]
pub extern "C" fn vivi_wasm_model_snapshot_json(handle: u32) -> u32 {
    catch_u32(|| match snapshot_json_impl(handle) {
        Ok(pointer) => {
            clear_last_error();
            pointer
        }
        Err(error) => {
            set_error(error);
            0
        }
    })
}

/// Copy a JSON hit-test result into the output buffer and return its pointer.
#[unsafe(no_mangle)]
pub extern "C" fn vivi_wasm_model_hit_test_json(handle: u32, x: f64, y: f64) -> u32 {
    catch_u32(|| match hit_test_json_impl(handle, x, y) {
        Ok(pointer) => {
            clear_last_error();
            pointer
        }
        Err(error) => {
            set_error(error);
            0
        }
    })
}

fn load_model_impl(
    json_ptr: u32,
    json_len: u32,
    options_ptr: u32,
    options_len: u32,
) -> Result<u32, RuntimeError> {
    let options = read_options(options_ptr, options_len)?;
    let limits = limits_from_options(options.as_ref())?;
    let payload_bytes = read_bytes(json_ptr, json_len, "runtime JSON payload")?;
    let payload = parse_runtime_payload(&payload_bytes, limits)?;
    let (width, height) = project_dimensions(&payload.value);
    let mut model = RuntimeModel::from_payload_with_limits(&payload, limits)?;
    apply_initial_parameters(&mut model, options.as_ref())?;
    model.update(0.0)?;
    let wasm_model = WasmModel {
        model,
        width,
        height,
    };
    MODELS.with(|models| {
        let mut models = models.borrow_mut();
        if let Some(index) = models.iter().position(Option::is_none) {
            models[index] = Some(wasm_model);
            Ok(OK_HANDLE_BASE + index as u32)
        } else {
            models.push(Some(wasm_model));
            Ok(OK_HANDLE_BASE + (models.len() - 1) as u32)
        }
    })
}

fn read_options(options_ptr: u32, options_len: u32) -> Result<Option<Value>, RuntimeError> {
    if options_len == 0 {
        return Ok(None);
    }
    let bytes = read_bytes(options_ptr, options_len, "runtime options")?;
    let text = str::from_utf8(&bytes)
        .map_err(|_| RuntimeError::new(status::INVALID_ARGUMENT, "options must be UTF-8"))?;
    serde_json::from_str(text)
        .map(Some)
        .map_err(|_| RuntimeError::new(status::INVALID_ARGUMENT, "options must be JSON"))
}

fn limits_from_options(options: Option<&Value>) -> Result<RuntimeLimits, RuntimeError> {
    let mut limits = RuntimeLimits::default();
    let Some(options) = options.and_then(Value::as_object) else {
        return Ok(limits);
    };
    if let Some(value) = options.get("maxPayloadBytes") {
        limits.max_payload_bytes = u64_option(value, "maxPayloadBytes")?;
    }
    if let Some(value) = options.get("maxTextureBytes") {
        limits.max_texture_bytes = u64_option(value, "maxTextureBytes")?;
    }
    let Some(limit_options) = options.get("limits") else {
        return Ok(limits);
    };
    let limit_options = limit_options
        .as_object()
        .ok_or_else(|| invalid_argument("limits must be an object"))?;
    assign_limit_usize(limit_options, "maxTextures", &mut limits.max_textures)?;
    assign_limit_usize(limit_options, "maxLayers", &mut limits.max_layers)?;
    assign_limit_usize(limit_options, "maxMeshes", &mut limits.max_meshes)?;
    assign_limit_usize(
        limit_options,
        "maxVerticesPerMesh",
        &mut limits.max_vertices_per_mesh,
    )?;
    assign_limit_usize(
        limit_options,
        "maxIndicesPerMesh",
        &mut limits.max_indices_per_mesh,
    )?;
    assign_limit_usize(limit_options, "maxBones", &mut limits.max_bones)?;
    assign_limit_usize(
        limit_options,
        "maxIkControllers",
        &mut limits.max_ik_controllers,
    )?;
    assign_limit_usize(
        limit_options,
        "maxPhysicsGroups",
        &mut limits.max_physics_groups,
    )?;
    assign_limit_usize(
        limit_options,
        "maxPendulumsPerPhysicsGroup",
        &mut limits.max_pendulums_per_physics_group,
    )?;
    assign_limit_usize(limit_options, "maxParameters", &mut limits.max_parameters)?;
    assign_limit_usize(
        limit_options,
        "maxBindingPoints",
        &mut limits.max_binding_points,
    )?;
    assign_limit_usize(limit_options, "maxColliders", &mut limits.max_colliders)?;
    assign_limit_usize(
        limit_options,
        "maxAnimationClips",
        &mut limits.max_animation_clips,
    )?;
    assign_limit_usize(
        limit_options,
        "maxStateMachines",
        &mut limits.max_state_machines,
    )?;
    assign_limit_usize(
        limit_options,
        "maxStatesPerStateMachine",
        &mut limits.max_states_per_state_machine,
    )?;
    assign_limit_usize(
        limit_options,
        "maxTransitionsPerStateMachine",
        &mut limits.max_transitions_per_state_machine,
    )?;
    Ok(limits)
}

fn assign_limit_usize(
    options: &Map<String, Value>,
    key: &str,
    target: &mut usize,
) -> Result<(), RuntimeError> {
    if let Some(value) = options.get(key) {
        *target = usize::try_from(u64_option(value, key)?)
            .map_err(|_| invalid_argument(format!("{key} is too large")))?;
    }
    Ok(())
}

fn u64_option(value: &Value, key: &str) -> Result<u64, RuntimeError> {
    value
        .as_u64()
        .ok_or_else(|| invalid_argument(format!("{key} must be a non-negative integer")))
}

fn apply_initial_parameters(
    model: &mut RuntimeModel,
    options: Option<&Value>,
) -> Result<(), RuntimeError> {
    let Some(initial_parameters) = options
        .and_then(|value| value.get("initialParameters"))
        .and_then(Value::as_object)
    else {
        return Ok(());
    };
    for (id, value) in initial_parameters {
        let value = value
            .as_f64()
            .filter(|value| value.is_finite())
            .ok_or_else(|| invalid_argument("initial parameter values must be finite"))?;
        model.set_input(id, value)?;
    }
    Ok(())
}

fn project_dimensions(value: &Value) -> (f64, f64) {
    let Some(project) = value.get("project").and_then(Value::as_object) else {
        return (0.0, 0.0);
    };
    let width = project.get("width").and_then(Value::as_f64).unwrap_or(0.0);
    let height = project.get("height").and_then(Value::as_f64).unwrap_or(0.0);
    (width, height)
}

fn snapshot_json_impl(handle: u32) -> Result<u32, RuntimeError> {
    with_model(handle, |model| {
        let snapshot = json!({
            "width": model.width,
            "height": model.height,
            "parameters": model.model.parameters().iter().map(|parameter| json!({
                "id": parameter.id,
                "min": parameter.min,
                "max": parameter.max,
                "defaultValue": parameter.default_value,
                "currentValue": parameter.current_value,
            })).collect::<Vec<_>>(),
            "textures": model.model.textures().iter().map(|texture| json!({
                "id": texture.id,
                "width": texture.width,
                "height": texture.height,
                "format": "rgba8-straight",
                "colorSpace": "srgb",
                "source": "hostImage",
                "hostImageId": texture.host_image_id,
            })).collect::<Vec<_>>(),
            "expressionPresets": model.model.expression_presets().iter().map(|preset| {
                let mut values = Map::new();
                for value in &preset.values {
                    values.insert(value.parameter_id.clone(), json!(value.value));
                }
                json!({
                    "id": preset.id,
                    "name": preset.name,
                    "parameterValues": values,
                    "color": preset.color,
                    "hotkey": preset.hotkey,
                })
            }).collect::<Vec<_>>(),
            "renderList": model.model.meshes().iter().map(|mesh| json!({
                "id": mesh.id,
                "textureId": mesh.texture_id,
                "vertices": mesh.vertices,
                "uvs": mesh.uvs,
                "indices": mesh.indices,
                "x": mesh.x,
                "y": mesh.y,
                "opacity": mesh.opacity,
                "visible": mesh.visible,
                "culled": mesh.culled,
                "blendMode": blend_mode_name(mesh.blend_mode),
                "multiplyColor": mesh.multiply_color,
                "screenColor": mesh.screen_color,
                "drawOrder": mesh.draw_order,
            })).collect::<Vec<_>>(),
        });
        write_json_output(&snapshot)
    })
}

fn hit_test_json_impl(handle: u32, x: f64, y: f64) -> Result<u32, RuntimeError> {
    with_model(handle, |model| {
        let value = match model.model.hit_test(x, y)? {
            Some(hit) => json!({
                "colliderId": hit.collider_id,
                "layerId": hit.layer_id,
                "meshId": hit.mesh_id,
                "x": hit.x,
                "y": hit.y,
            }),
            None => Value::Null,
        };
        write_json_output(&value)
    })
}

fn write_json_output(value: &Value) -> Result<u32, RuntimeError> {
    let bytes = serde_json::to_vec(value)
        .map_err(|_| RuntimeError::new(status::INTERNAL, "failed to encode WASM JSON output"))?;
    Ok(set_output(bytes))
}

fn blend_mode_name(blend_mode: BlendMode) -> &'static str {
    match blend_mode {
        BlendMode::Normal => "normal",
        BlendMode::Multiply => "multiply",
        BlendMode::Screen => "screen",
        BlendMode::Add => "add",
    }
}

fn with_model<T>(
    handle: u32,
    callback: impl FnOnce(&WasmModel) -> Result<T, RuntimeError>,
) -> Result<T, RuntimeError> {
    if handle < OK_HANDLE_BASE {
        return Err(invalid_argument("invalid model handle"));
    }
    MODELS.with(|models| {
        let models = models.borrow();
        let index = (handle - OK_HANDLE_BASE) as usize;
        let Some(Some(model)) = models.get(index) else {
            return Err(invalid_argument("invalid model handle"));
        };
        callback(model)
    })
}

fn with_model_mut<T>(
    handle: u32,
    callback: impl FnOnce(&mut WasmModel) -> Result<T, RuntimeError>,
) -> Result<T, RuntimeError> {
    if handle < OK_HANDLE_BASE {
        return Err(invalid_argument("invalid model handle"));
    }
    MODELS.with(|models| {
        let mut models = models.borrow_mut();
        let index = (handle - OK_HANDLE_BASE) as usize;
        let Some(Some(model)) = models.get_mut(index) else {
            return Err(invalid_argument("invalid model handle"));
        };
        callback(model)
    })
}

fn read_utf8(pointer: u32, byte_len: u32, label: &str) -> Result<String, RuntimeError> {
    let bytes = read_bytes(pointer, byte_len, label)?;
    str::from_utf8(&bytes)
        .map(str::to_owned)
        .map_err(|_| invalid_argument(format!("{label} must be UTF-8")))
}

fn read_bytes(pointer: u32, byte_len: u32, label: &str) -> Result<Vec<u8>, RuntimeError> {
    if byte_len == 0 {
        return Ok(Vec::new());
    }
    if pointer == 0 {
        return Err(invalid_argument(format!(
            "{label} pointer must not be null"
        )));
    }
    let len = byte_len as usize;
    unsafe {
        // SAFETY: JavaScript obtains writable input pointers from
        // `vivi_wasm_alloc` and passes explicit byte lengths. The WebAssembly
        // engine enforces linear-memory bounds for the resulting slice. We copy
        // immediately so no borrowed host memory outlives this ABI call.
        Ok(slice::from_raw_parts(pointer as *const u8, len).to_vec())
    }
}

fn set_output(bytes: Vec<u8>) -> u32 {
    // The returned pointer aliases OUTPUT_BYTES. Callers must copy it before
    // invoking another output-producing export, which may replace the Vec.
    OUTPUT_BYTES.with(|output| {
        let mut output = output.borrow_mut();
        *output = bytes;
        output.as_ptr() as u32
    })
}

fn catch_status(callback: impl FnOnce() -> Result<(), RuntimeError>) -> i32 {
    match catch_unwind(AssertUnwindSafe(callback)) {
        Ok(Ok(())) => {
            clear_last_error();
            status::OK
        }
        Ok(Err(error)) => {
            let status = error.status();
            set_error(error);
            status
        }
        Err(_) => {
            set_last_error(
                status::INTERNAL,
                "native WASM runtime trapped at FFI boundary",
            );
            status::INTERNAL
        }
    }
}

fn catch_u32(callback: impl FnOnce() -> u32) -> u32 {
    match catch_unwind(AssertUnwindSafe(callback)) {
        Ok(value) => value,
        Err(_) => {
            set_last_error(
                status::INTERNAL,
                "native WASM runtime trapped at FFI boundary",
            );
            0
        }
    }
}

fn catch_i32(callback: impl FnOnce() -> i32) -> i32 {
    match catch_unwind(AssertUnwindSafe(callback)) {
        Ok(value) => value,
        Err(_) => status::INTERNAL,
    }
}

fn set_error(error: RuntimeError) {
    set_last_error(error.status(), error.message());
}

fn clear_last_error() {
    LAST_ERROR.with(|last_error| {
        *last_error.borrow_mut() = WasmLastError::ok();
    });
}

fn set_last_error(status: i32, message: impl Into<String>) {
    LAST_ERROR.with(|last_error| {
        *last_error.borrow_mut() = WasmLastError {
            status,
            message: message.into(),
        };
    });
}

fn invalid_argument(message: impl Into<String>) -> RuntimeError {
    RuntimeError::new(status::INVALID_ARGUMENT, message.into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reports_core_abi_version() {
        assert_eq!(
            native_wasm_abi_version(),
            vivi_runtime_native_core::ABI_VERSION
        );
        assert_eq!(
            vivi_runtime_abi_version(),
            vivi_runtime_native_core::ABI_VERSION
        );
    }

    #[test]
    fn status_codes_match_typescript_mapping_contract() {
        assert_eq!(status::OK, 0);
        assert_eq!(status::INVALID_ARGUMENT, 1);
        assert_eq!(status::UNSUPPORTED_OPERATION, 2);
        assert_eq!(status::PARSE, 3);
        assert_eq!(status::UNSUPPORTED_SPEC_VERSION, 4);
        assert_eq!(status::PRIVATE_PROFILE, 5);
        assert_eq!(status::LIMIT_EXCEEDED, 6);
        assert_eq!(status::VALIDATION, 7);
        assert_eq!(status::TEXTURE, 8);
        assert_eq!(status::EVALUATION, 9);
        assert_eq!(status::INTERNAL, 10);
    }

    #[test]
    fn snapshot_json_matches_typescript_bridge_shape() {
        MODELS.with(|models| models.borrow_mut().clear());
        let fixture: Value = serde_json::from_str(include_str!(
            "../../../../../tests/conformance/runtime-v1/basic-mesh.fixture.json"
        ))
        .expect("fixture should parse");
        let file_data = fixture
            .get("fileData")
            .expect("fixture should contain fileData")
            .to_string();
        let payload =
            parse_runtime_payload(file_data.as_bytes(), RuntimeLimits::default()).unwrap();
        let (width, height) = project_dimensions(&payload.value);
        let mut model =
            RuntimeModel::from_payload_with_limits(&payload, RuntimeLimits::default()).unwrap();
        model.update(0.0).unwrap();
        let handle = MODELS.with(|models| {
            let mut models = models.borrow_mut();
            models.push(Some(WasmModel {
                model,
                width,
                height,
            }));
            OK_HANDLE_BASE
        });

        snapshot_json_impl(handle).unwrap();
        let output = OUTPUT_BYTES.with(|bytes| bytes.borrow().clone());
        let snapshot: Value = serde_json::from_slice(&output).unwrap();
        let mesh = &snapshot["renderList"][0];
        let texture = &snapshot["textures"][0];
        let parameter = &snapshot["parameters"][0];
        let preset = &snapshot["expressionPresets"][0];

        assert_eq!(snapshot["width"], 64.0);
        assert_eq!(snapshot["height"], 64.0);
        assert_eq!(mesh["id"], "mesh-body");
        assert_eq!(mesh["textureId"], "atlas:0");
        assert_eq!(mesh["blendMode"], "normal");
        assert_eq!(mesh["drawOrder"], 10);
        assert_eq!(mesh["x"], 0.0);
        assert_eq!(mesh["y"], 0.0);
        assert!(mesh["vertices"].is_array());
        assert!(mesh["uvs"].is_array());
        assert!(mesh["indices"].is_array());
        assert_eq!(texture["hostImageId"], "host-atlas-0");
        assert_eq!(texture["format"], "rgba8-straight");
        assert_eq!(texture["colorSpace"], "srgb");
        assert_eq!(parameter["id"], "vivi.head.yaw");
        assert!(parameter.get("currentValue").is_some());
        assert_eq!(preset["id"], "neutral");
        assert!(preset["parameterValues"].is_object());
    }

    #[test]
    fn snapshot_json_exposes_nonzero_mesh_translation() {
        MODELS.with(|models| models.borrow_mut().clear());
        let fixture: Value = serde_json::from_str(include_str!(
            "../../../../../tests/conformance/runtime-v1/draw-hit-culling.fixture.json"
        ))
        .expect("fixture should parse");
        let file_data = fixture
            .get("fileData")
            .expect("fixture should contain fileData")
            .to_string();
        let payload =
            parse_runtime_payload(file_data.as_bytes(), RuntimeLimits::default()).unwrap();
        let (width, height) = project_dimensions(&payload.value);
        let mut model =
            RuntimeModel::from_payload_with_limits(&payload, RuntimeLimits::default()).unwrap();
        model.update(0.0).unwrap();
        let handle = MODELS.with(|models| {
            let mut models = models.borrow_mut();
            models.push(Some(WasmModel {
                model,
                width,
                height,
            }));
            OK_HANDLE_BASE
        });

        snapshot_json_impl(handle).unwrap();
        let output = OUTPUT_BYTES.with(|bytes| bytes.borrow().clone());
        let snapshot: Value = serde_json::from_slice(&output).unwrap();
        let mesh = snapshot["renderList"]
            .as_array()
            .unwrap()
            .iter()
            .find(|mesh| mesh["id"] == "mesh-back")
            .unwrap();

        assert_eq!(mesh["x"], 3.0);
        assert_eq!(mesh["y"], 4.0);
    }
}
