#![deny(missing_docs)]

//! Native C ABI skeleton for Vivi2D Runtime Spec v1.
//!
//! Phase N2 adds runtime creation and parser-backed model loading. Evaluator,
//! snapshot, and ownership-heavy APIs are intentionally left for later phases.

#[cfg(feature = "abi-v02")]
use std::cell::Cell;
use std::cell::RefCell;
use std::ffi::{CStr, CString, c_char};
#[cfg(feature = "png-v1")]
use std::mem::align_of;
use std::mem::{offset_of, size_of};
use std::panic::{AssertUnwindSafe, catch_unwind};
use std::ptr;
use std::slice;

#[cfg(not(feature = "abi-v02"))]
use vivi_runtime_native_core::ABI_VERSION;
#[cfg(all(feature = "abi-v02", test))]
use vivi_runtime_native_core::DrawCommandType as CoreDrawCommandType;
use vivi_runtime_native_core::{
    BlendMode as CoreBlendMode, MeshSnapshot as CoreMeshSnapshot, RUNTIME_VERSION, RuntimeError,
    RuntimeLimits as CoreRuntimeLimits, RuntimeModel as CoreRuntimeModel, RuntimePayload,
    SUPPORTED_SPEC_MAX_VERSION, SUPPORTED_SPEC_MIN_VERSION,
    SUPPORTED_SPEC_MIN_VERSION as RUNTIME_SPEC_VERSION, Version, parse_runtime_payload, status,
};
#[cfg(feature = "abi-v02")]
use vivi_runtime_native_core::{RENDER_FEATURE_DRAW_COMMANDS, render::validate_draw_commands};

#[cfg(feature = "abi-v02")]
const C_ABI_VERSION: u32 = 2;
#[cfg(not(feature = "abi-v02"))]
const C_ABI_VERSION: u32 = ABI_VERSION;

/// C ABI status code.
pub type ViviStatus = i32;

/// PNG profile C ABI status code.
#[cfg(feature = "png-v1")]
pub type ViviPngStatus = i32;

/// Allocation-free PNG inspection result.
#[cfg(feature = "png-v1")]
#[repr(C)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ViviPngInfo {
    /// Caller-provided struct size.
    pub struct_size: u32,
    /// Decoded image width.
    pub width: u32,
    /// Decoded image height.
    pub height: u32,
    /// Reserved output field. This is zero on success.
    pub _reserved0: u32,
    /// Required caller output capacity in bytes.
    pub required_output_bytes: u64,
}

/// Frozen resource limits for the `vivi2d.png.rgba8.v1` profile.
#[cfg(feature = "png-v1")]
#[repr(C)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ViviPngLimits {
    /// Structure size.
    pub struct_size: u32,
    /// Maximum accepted PNG width.
    pub max_width: u32,
    /// Maximum accepted PNG height.
    pub max_height: u32,
    /// Reserved field. This is always zero.
    pub _reserved0: u32,
    /// Maximum accepted pixel count.
    pub max_pixels: u64,
    /// Maximum accepted compressed input length.
    pub max_png_input_bytes: u64,
    /// Maximum decoded RGBA8 byte length.
    pub max_texture_bytes: u64,
}

#[cfg(feature = "png-v1")]
const _: () = {
    assert!(size_of::<ViviPngStatus>() == 4);
    assert!(size_of::<ViviPngInfo>() == 24);
    assert!(align_of::<ViviPngInfo>() == 8);
    assert!(offset_of!(ViviPngInfo, struct_size) == 0);
    assert!(offset_of!(ViviPngInfo, width) == 4);
    assert!(offset_of!(ViviPngInfo, height) == 8);
    assert!(offset_of!(ViviPngInfo, _reserved0) == 12);
    assert!(offset_of!(ViviPngInfo, required_output_bytes) == 16);
    assert!(size_of::<ViviPngLimits>() == 40);
    assert!(align_of::<ViviPngLimits>() == 8);
    assert!(offset_of!(ViviPngLimits, struct_size) == 0);
    assert!(offset_of!(ViviPngLimits, max_width) == 4);
    assert!(offset_of!(ViviPngLimits, max_height) == 8);
    assert!(offset_of!(ViviPngLimits, _reserved0) == 12);
    assert!(offset_of!(ViviPngLimits, max_pixels) == 16);
    assert!(offset_of!(ViviPngLimits, max_png_input_bytes) == 24);
    assert!(offset_of!(ViviPngLimits, max_texture_bytes) == 32);
};

/// C ABI blend mode enum storage.
pub type ViviBlendMode = i32;

/// C ABI pixel format enum storage.
pub type ViviPixelFormat = i32;

/// C ABI color-space enum storage.
pub type ViviColorSpace = i32;

/// C ABI version struct.
#[repr(C)]
#[derive(Clone, Copy, Debug)]
pub struct ViviVersion {
    /// Caller-provided struct size.
    pub struct_size: u32,
    /// Major version.
    pub major: u32,
    /// Minor version.
    pub minor: u32,
    /// Patch version.
    pub patch: u32,
}

/// C ABI runtime limit struct.
#[repr(C)]
#[derive(Clone, Copy, Debug)]
pub struct ViviRuntimeLimits {
    /// Caller-provided struct size.
    pub struct_size: u32,
    /// Reserved input field. Must be zero when covered by `struct_size`.
    pub _reserved0: u32,
    /// Maximum payload bytes.
    pub max_payload_bytes: u64,
    /// Maximum texture bytes.
    pub max_texture_bytes: u64,
    /// Maximum textures.
    pub max_textures: u32,
    /// Maximum layers.
    pub max_layers: u32,
    /// Maximum meshes.
    pub max_meshes: u32,
    /// Maximum vertices per mesh.
    pub max_vertices_per_mesh: u32,
    /// Maximum indices per mesh.
    pub max_indices_per_mesh: u32,
    /// Maximum bones.
    pub max_bones: u32,
    /// Maximum IK controllers.
    pub max_ik_controllers: u32,
    /// Maximum physics groups.
    pub max_physics_groups: u32,
    /// Maximum pendulums per physics group.
    pub max_pendulums_per_physics_group: u32,
    /// Maximum parameters.
    pub max_parameters: u32,
    /// Maximum binding points.
    pub max_binding_points: u32,
    /// Maximum colliders.
    pub max_colliders: u32,
    /// Maximum animation clips.
    pub max_animation_clips: u32,
    /// Maximum state machines.
    pub max_state_machines: u32,
    /// Maximum states per state machine.
    pub max_states_per_state_machine: u32,
    /// Maximum transitions per state machine.
    pub max_transitions_per_state_machine: u32,
}

/// Runtime creation diagnostic output.
#[repr(C)]
#[derive(Clone, Copy)]
pub struct ViviCreateError {
    /// Must be `sizeof(ViviCreateError)`.
    pub struct_size: u32,
    /// Canonical status code.
    pub status: ViviStatus,
    /// UTF-8 diagnostic buffer.
    pub message: [c_char; 256],
}

/// Texture snapshot view.
#[repr(C)]
#[derive(Clone, Copy, Debug)]
pub struct ViviTextureSnapshot {
    /// Caller-provided struct size.
    pub struct_size: u32,
    /// Reserved output field.
    pub _reserved0: u32,
    /// Texture ID.
    pub id: *const c_char,
    /// Texture width.
    pub width: u32,
    /// Texture height.
    pub height: u32,
    /// Pixel format.
    pub pixel_format: ViviPixelFormat,
    /// Color space.
    pub color_space: ViviColorSpace,
    /// Embedded pixel buffer.
    pub pixels: *const u8,
    /// Pixel byte length.
    pub pixel_byte_len: u64,
    /// Pixel row stride.
    pub row_stride: u64,
    /// Host image ID.
    pub host_image_id: *const c_char,
}

/// Parameter metadata view.
#[repr(C)]
#[derive(Clone, Copy, Debug)]
pub struct ViviParameterInfo {
    /// Caller-provided struct size.
    pub struct_size: u32,
    /// Reserved output field.
    pub _reserved0: u32,
    /// Parameter ID.
    pub id: *const c_char,
    /// Minimum value.
    pub min: f64,
    /// Maximum value.
    pub max: f64,
    /// Default value.
    pub default_value: f64,
    /// Current value.
    pub current_value: f64,
}

/// Hit-test result.
#[repr(C)]
#[derive(Clone, Copy, Debug)]
pub struct ViviHitResult {
    /// Caller-provided struct size.
    pub struct_size: u32,
    /// Reserved output field.
    pub _reserved0: u32,
    /// Collider ID.
    pub collider_id: *const c_char,
    /// Layer ID.
    pub layer_id: *const c_char,
    /// Mesh ID.
    pub mesh_id: *const c_char,
    /// Hit X coordinate.
    pub x: f64,
    /// Hit Y coordinate.
    pub y: f64,
}

/// Playback state.
#[repr(C)]
#[derive(Clone, Copy, Debug)]
pub struct ViviPlaybackState {
    /// Caller-provided struct size.
    pub struct_size: u32,
    /// Whether playback is active.
    pub playing: u8,
    /// Whether playback loops.
    pub loop_: u8,
    /// Reserved output bytes.
    pub _reserved0: [u8; 2],
    /// Current clip ID.
    pub clip_id: *const c_char,
    /// Current playback time in seconds.
    pub time_seconds: f64,
}

/// Expression preset metadata.
#[repr(C)]
#[derive(Clone, Copy, Debug)]
pub struct ViviExpressionPresetInfo {
    /// Caller-provided struct size.
    pub struct_size: u32,
    /// Reserved output field.
    pub _reserved0: u32,
    /// Preset ID.
    pub id: *const c_char,
    /// Preset name.
    pub name: *const c_char,
    /// Optional color string.
    pub color: *const c_char,
    /// Optional hotkey string.
    pub hotkey: *const c_char,
    /// Number of parameter values in this preset.
    pub parameter_value_count: u64,
}

/// Mesh snapshot view.
#[repr(C)]
#[derive(Clone, Copy, Debug)]
pub struct ViviMeshSnapshot {
    /// Caller-provided struct size.
    pub struct_size: u32,
    /// Reserved output field.
    pub _reserved0: u32,
    /// Mesh ID.
    pub id: *const c_char,
    /// Texture ID.
    pub texture_id: *const c_char,
    /// Vertex buffer.
    pub vertices: *const f32,
    /// Vertex float count.
    pub vertex_float_count: u64,
    /// UV buffer.
    pub uvs: *const f32,
    /// UV float count.
    pub uv_float_count: u64,
    /// Index buffer.
    pub indices: *const u32,
    /// Index count.
    pub index_count: u64,
    /// Mesh translation X in model coordinates.
    pub x: f32,
    /// Mesh translation Y in model coordinates.
    pub y: f32,
    /// Opacity.
    pub opacity: f32,
    /// Draw order.
    pub draw_order: i32,
    /// Blend mode.
    pub blend_mode: ViviBlendMode,
    /// Visibility flag.
    pub visible: u8,
    /// Culling flag.
    pub culled: u8,
    /// Multiply color presence flag.
    pub has_multiply_color: u8,
    /// Screen color presence flag.
    pub has_screen_color: u8,
    /// Multiply color.
    pub multiply_color: [f32; 4],
    /// Screen color.
    pub screen_color: [f32; 4],
}

/// One ABI 0.2 render command.
#[cfg(feature = "abi-v02")]
#[repr(C)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ViviDrawCommandV2 {
    /// Fixed command size. This is always 24 bytes.
    pub struct_size: u32,
    /// Numeric draw-command type.
    pub command_type: u32,
    /// Slot in the ABI 0.2 stable render-mesh table.
    pub mesh_index: u32,
    /// Mask nesting depth after this command executes.
    pub mask_depth: u32,
    /// Command flags. Only mask-invert bit 0 on `BEGIN_MASK` is defined.
    pub flags: u32,
    /// Reserved for future use and always zero.
    pub _reserved: u32,
}

/// ABI 0.2 model cache generations.
#[cfg(feature = "abi-v02")]
#[repr(C)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ViviGenerations {
    /// Runtime-local monotonically increasing public model instance number.
    pub model_generation: u64,
    /// Stable-table and draw-command topology generation.
    pub topology_generation: u64,
    /// Dynamic snapshot generation, incremented by each successful update.
    pub dynamic_generation: u64,
}

/// Opaque runtime factory handle.
pub struct ViviRuntime {
    limits: CoreRuntimeLimits,
    last_error: CString,
    #[cfg(feature = "abi-v02")]
    public_model_generation: u64,
}

/// Opaque loaded model handle.
pub struct ViviModel {
    runtime_model: RefCell<CoreRuntimeModel>,
    texture_strings: Vec<TextureStrings>,
    mesh_strings: Vec<MeshStrings>,
    expression_preset_strings: Vec<ExpressionPresetStrings>,
    parameter_strings: Vec<CString>,
    hit_string_pool: RefCell<Vec<Box<CStr>>>,
    spec_version: Version,
    last_error: RefCell<CString>,
    #[cfg(feature = "abi-v02")]
    draw_commands: Vec<ViviDrawCommandV2>,
    #[cfg(feature = "abi-v02")]
    render_mesh_strings_v2: Vec<MeshStrings>,
    #[cfg(feature = "abi-v02")]
    model_generation: u64,
    #[cfg(feature = "abi-v02")]
    dynamic_generation: Cell<u64>,
}

struct TextureStrings {
    id: CString,
    host_image_id: CString,
}

struct MeshStrings {
    id: CString,
    texture_id: CString,
}

struct ExpressionPresetStrings {
    id: CString,
    name: CString,
    color: Option<CString>,
    hotkey: Option<CString>,
    value_parameter_ids: Vec<CString>,
}

/// Return the packed Vivi2D runtime ABI version.
#[unsafe(no_mangle)]
pub extern "C" fn vivi_get_abi_version() -> u32 {
    C_ABI_VERSION
}

/// Inspect one PNG using the frozen `vivi2d.png.rgba8.v1` profile.
#[cfg(feature = "png-v1")]
#[unsafe(no_mangle)]
pub extern "C" fn vivi_png_inspect(
    bytes: *const u8,
    len: u64,
    declared_width: u32,
    declared_height: u32,
    out_info: *mut ViviPngInfo,
) -> ViviPngStatus {
    png_ffi_boundary(|| png_inspect_impl(bytes, len, declared_width, declared_height, out_info))
}

/// Decode one PNG into a caller-owned RGBA8 output buffer.
#[cfg(feature = "png-v1")]
#[unsafe(no_mangle)]
pub extern "C" fn vivi_png_decode(
    bytes: *const u8,
    len: u64,
    expected_content_sha256: *const u8,
    declared_width: u32,
    declared_height: u32,
    output_ptr: *mut u8,
    output_capacity: u64,
) -> ViviPngStatus {
    png_ffi_boundary(|| {
        png_decode_impl(
            bytes,
            len,
            expected_content_sha256,
            declared_width,
            declared_height,
            output_ptr,
            output_capacity,
        )
    })
}

/// Return the native runtime build/package version.
#[unsafe(no_mangle)]
pub extern "C" fn vivi_get_runtime_version(out_version: *mut ViviVersion) -> ViviStatus {
    ffi_boundary(|| write_version(out_version, RUNTIME_VERSION))
}

/// Return the Runtime Spec version range accepted by this runtime.
#[unsafe(no_mangle)]
pub extern "C" fn vivi_get_supported_spec_version_range(
    out_min_version: *mut ViviVersion,
    out_max_version: *mut ViviVersion,
) -> ViviStatus {
    ffi_boundary(|| {
        if !is_valid_output_struct::<ViviVersion>(out_min_version)
            || !is_valid_output_struct::<ViviVersion>(out_max_version)
        {
            return status::INVALID_ARGUMENT;
        }
        let min_status = write_version(out_min_version, SUPPORTED_SPEC_MIN_VERSION);
        if min_status != status::OK {
            return min_status;
        }
        write_version(out_max_version, SUPPORTED_SPEC_MAX_VERSION)
    })
}

/// Create a runtime factory.
#[unsafe(no_mangle)]
pub extern "C" fn vivi_runtime_create(
    limits: *const ViviRuntimeLimits,
    out_error: *mut ViviCreateError,
    out_runtime: *mut *mut ViviRuntime,
) -> ViviStatus {
    ffi_boundary(|| runtime_create_impl(limits, out_error, out_runtime))
}

/// Destroy a runtime factory.
#[unsafe(no_mangle)]
pub extern "C" fn vivi_runtime_destroy(runtime: *mut ViviRuntime) {
    let _ = catch_unwind(AssertUnwindSafe(|| runtime_destroy_impl(runtime)));
}

/// Return the last runtime diagnostic message.
#[unsafe(no_mangle)]
pub extern "C" fn vivi_runtime_last_error_message(runtime: *const ViviRuntime) -> *const c_char {
    match catch_unwind(AssertUnwindSafe(|| {
        runtime_last_error_message_impl(runtime)
    })) {
        Ok(message) => message,
        Err(_) => ptr::null(),
    }
}

/// Return the last model diagnostic message.
#[unsafe(no_mangle)]
pub extern "C" fn vivi_model_last_error_message(model: *const ViviModel) -> *const c_char {
    match catch_unwind(AssertUnwindSafe(|| model_last_error_message_impl(model))) {
        Ok(message) => message,
        Err(_) => ptr::null(),
    }
}

/// Load a model from Runtime Spec v1 JSON bytes.
#[unsafe(no_mangle)]
pub extern "C" fn vivi_model_load(
    runtime: *mut ViviRuntime,
    data: *const u8,
    data_len: u64,
    out_model: *mut *mut ViviModel,
) -> ViviStatus {
    ffi_boundary(|| model_load_impl(runtime, data, data_len, out_model))
}

/// Destroy a loaded model.
#[unsafe(no_mangle)]
pub extern "C" fn vivi_model_destroy(model: *mut ViviModel) {
    let _ = catch_unwind(AssertUnwindSafe(|| model_destroy_impl(model)));
}

/// Return the Runtime Spec version used by a loaded model.
#[unsafe(no_mangle)]
pub extern "C" fn vivi_model_get_spec_version(
    model: *const ViviModel,
    out_version: *mut ViviVersion,
) -> ViviStatus {
    ffi_boundary(|| model_get_spec_version_impl(model, out_version))
}

/// Set a scalar runtime input.
#[unsafe(no_mangle)]
pub extern "C" fn vivi_model_set_input(
    model: *mut ViviModel,
    id: *const c_char,
    value: f64,
) -> ViviStatus {
    ffi_boundary(|| model_set_input_impl(model, id, value))
}

/// Get a scalar runtime input.
#[unsafe(no_mangle)]
pub extern "C" fn vivi_model_get_input(
    model: *const ViviModel,
    id: *const c_char,
    out_value: *mut f64,
) -> ViviStatus {
    ffi_boundary(|| model_get_input_impl(model, id, out_value))
}

/// Advance runtime evaluation.
#[unsafe(no_mangle)]
pub extern "C" fn vivi_model_update(model: *mut ViviModel, delta_seconds: f64) -> ViviStatus {
    ffi_boundary(|| model_update_impl(model, delta_seconds))
}

/// Start an animation clip.
#[unsafe(no_mangle)]
pub extern "C" fn vivi_model_play_clip(
    model: *mut ViviModel,
    clip_id: *const c_char,
    loop_: u8,
    _start_time_seconds: f64,
) -> ViviStatus {
    ffi_boundary(|| {
        if model.is_null() {
            return status::INVALID_ARGUMENT;
        }
        if clip_id.is_null() || loop_ > 1 {
            set_model_error(
                model,
                status::INVALID_ARGUMENT,
                "invalid play_clip argument",
            );
            return status::INVALID_ARGUMENT;
        }
        unsupported_model_operation(model, "clip playback")
    })
}

/// Stop the active animation clip.
#[unsafe(no_mangle)]
pub extern "C" fn vivi_model_stop_clip(model: *mut ViviModel) -> ViviStatus {
    ffi_boundary(|| {
        if model.is_null() {
            return status::INVALID_ARGUMENT;
        }
        unsupported_model_operation(model, "clip playback")
    })
}

/// Seek the active animation clip.
#[unsafe(no_mangle)]
pub extern "C" fn vivi_model_seek_clip(model: *mut ViviModel, _seconds: f64) -> ViviStatus {
    ffi_boundary(|| {
        if model.is_null() {
            return status::INVALID_ARGUMENT;
        }
        unsupported_model_operation(model, "clip playback")
    })
}

/// Set a state-machine state.
#[unsafe(no_mangle)]
pub extern "C" fn vivi_model_set_state_machine_state(
    model: *mut ViviModel,
    machine_id: *const c_char,
    state_id: *const c_char,
) -> ViviStatus {
    ffi_boundary(|| {
        if model.is_null() {
            return status::INVALID_ARGUMENT;
        }
        if machine_id.is_null() || state_id.is_null() {
            set_model_error(
                model,
                status::INVALID_ARGUMENT,
                "invalid state-machine mutation argument",
            );
            return status::INVALID_ARGUMENT;
        }
        unsupported_model_operation(model, "state machine")
    })
}

/// Return the active state-machine state.
#[unsafe(no_mangle)]
pub extern "C" fn vivi_model_get_state_machine_state(
    model: *const ViviModel,
    machine_id: *const c_char,
    out_state_id: *mut *const c_char,
    out_transitioning: *mut u8,
) -> ViviStatus {
    ffi_boundary(|| {
        if model.is_null() {
            return status::INVALID_ARGUMENT;
        }
        if machine_id.is_null() || out_state_id.is_null() || out_transitioning.is_null() {
            set_model_error(
                model,
                status::INVALID_ARGUMENT,
                "invalid state-machine query argument",
            );
            return status::INVALID_ARGUMENT;
        }
        unsupported_model_operation(model, "state machine")
    })
}

/// Return the number of scalar runtime parameters.
#[unsafe(no_mangle)]
pub extern "C" fn vivi_model_parameter_count(
    model: *const ViviModel,
    out_count: *mut u64,
) -> ViviStatus {
    ffi_boundary(|| model_parameter_count_impl(model, out_count))
}

/// Return scalar runtime parameter metadata.
#[unsafe(no_mangle)]
pub extern "C" fn vivi_model_parameter_info(
    model: *const ViviModel,
    parameter_index: u64,
    out_info: *mut ViviParameterInfo,
) -> ViviStatus {
    ffi_boundary(|| model_parameter_info_impl(model, parameter_index, out_info))
}

/// Return the number of runtime textures.
#[unsafe(no_mangle)]
pub extern "C" fn vivi_model_texture_count(
    model: *const ViviModel,
    out_count: *mut u64,
) -> ViviStatus {
    ffi_boundary(|| model_texture_count_impl(model, out_count))
}

/// Return a runtime texture snapshot by index.
#[unsafe(no_mangle)]
pub extern "C" fn vivi_model_texture_snapshot(
    model: *const ViviModel,
    texture_index: u64,
    out_snapshot: *mut ViviTextureSnapshot,
) -> ViviStatus {
    ffi_boundary(|| model_texture_snapshot_impl(model, texture_index, out_snapshot))
}

/// Return the number of expression presets.
#[unsafe(no_mangle)]
pub extern "C" fn vivi_model_expression_preset_count(
    model: *const ViviModel,
    out_count: *mut u64,
) -> ViviStatus {
    ffi_boundary(|| model_expression_preset_count_impl(model, out_count))
}

/// Return expression preset metadata.
#[unsafe(no_mangle)]
pub extern "C" fn vivi_model_expression_preset_info(
    model: *const ViviModel,
    preset_index: u64,
    out_info: *mut ViviExpressionPresetInfo,
) -> ViviStatus {
    ffi_boundary(|| model_expression_preset_info_impl(model, preset_index, out_info))
}

/// Return an expression preset parameter value.
#[unsafe(no_mangle)]
pub extern "C" fn vivi_model_expression_preset_value(
    model: *const ViviModel,
    preset_index: u64,
    value_index: u64,
    out_parameter_id: *mut *const c_char,
    out_value: *mut f64,
) -> ViviStatus {
    ffi_boundary(|| {
        model_expression_preset_value_impl(
            model,
            preset_index,
            value_index,
            out_parameter_id,
            out_value,
        )
    })
}

/// Apply an expression preset.
#[unsafe(no_mangle)]
pub extern "C" fn vivi_model_apply_expression_preset(
    model: *mut ViviModel,
    preset_id: *const c_char,
) -> ViviStatus {
    ffi_boundary(|| model_apply_expression_preset_impl(model, preset_id))
}

/// Return the number of ABI 0.2 draw commands.
#[cfg(feature = "abi-v02")]
#[unsafe(no_mangle)]
pub extern "C" fn vivi_model_draw_command_count(
    model: *const ViviModel,
    out_count: *mut u64,
) -> ViviStatus {
    ffi_boundary(|| model_draw_command_count_impl(model, out_count))
}

/// Return a borrowed model-owned ABI 0.2 draw-command array.
#[cfg(feature = "abi-v02")]
#[unsafe(no_mangle)]
pub extern "C" fn vivi_model_draw_commands(
    model: *const ViviModel,
    out_ptr: *mut *const ViviDrawCommandV2,
) -> ViviStatus {
    ffi_boundary(|| model_draw_commands_impl(model, out_ptr))
}

/// Return the ABI 0.2 cache generations for a model.
#[cfg(feature = "abi-v02")]
#[unsafe(no_mangle)]
pub extern "C" fn vivi_model_generations(
    model: *const ViviModel,
    out_generations: *mut ViviGenerations,
) -> ViviStatus {
    ffi_boundary(|| model_generations_impl(model, out_generations))
}

/// Return the number of slots in the ABI 0.2 stable render-mesh table.
#[cfg(feature = "abi-v02")]
#[unsafe(no_mangle)]
pub extern "C" fn vivi_model_render_mesh_count_v2(
    model: *const ViviModel,
    out_count: *mut u64,
) -> ViviStatus {
    ffi_boundary(|| model_render_mesh_count_v2_impl(model, out_count))
}

/// Return a mesh snapshot from an ABI 0.2 stable render-mesh slot.
#[cfg(feature = "abi-v02")]
#[unsafe(no_mangle)]
pub extern "C" fn vivi_model_render_mesh_snapshot_v2(
    model: *const ViviModel,
    mesh_slot: u32,
    out_snapshot: *mut ViviMeshSnapshot,
) -> ViviStatus {
    ffi_boundary(|| model_render_mesh_snapshot_v2_impl(model, mesh_slot, out_snapshot))
}

/// Return the render features required to display a model correctly.
#[cfg(feature = "abi-v02")]
#[unsafe(no_mangle)]
pub extern "C" fn vivi_model_required_render_features(
    model: *const ViviModel,
    out_flags: *mut u64,
) -> ViviStatus {
    ffi_boundary(|| model_required_render_features_impl(model, out_flags))
}

/// Return the number of renderable meshes.
#[unsafe(no_mangle)]
pub extern "C" fn vivi_model_mesh_count(
    model: *const ViviModel,
    out_count: *mut u64,
) -> ViviStatus {
    ffi_boundary(|| model_mesh_count_impl(model, out_count))
}

/// Return a mesh snapshot by render-list index.
#[unsafe(no_mangle)]
pub extern "C" fn vivi_model_mesh_snapshot(
    model: *const ViviModel,
    render_index: u64,
    out_snapshot: *mut ViviMeshSnapshot,
) -> ViviStatus {
    ffi_boundary(|| model_mesh_snapshot_impl(model, render_index, out_snapshot))
}

/// Return a mesh snapshot by mesh ID.
#[unsafe(no_mangle)]
pub extern "C" fn vivi_model_mesh_snapshot_by_id(
    model: *const ViviModel,
    mesh_id: *const c_char,
    out_snapshot: *mut ViviMeshSnapshot,
) -> ViviStatus {
    ffi_boundary(|| model_mesh_snapshot_by_id_impl(model, mesh_id, out_snapshot))
}

/// Run collider hit testing.
#[unsafe(no_mangle)]
pub extern "C" fn vivi_model_hit_test(
    model: *const ViviModel,
    x: f64,
    y: f64,
    out_hit: *mut ViviHitResult,
    out_has_hit: *mut u8,
) -> ViviStatus {
    ffi_boundary(|| model_hit_test_impl(model, x, y, out_hit, out_has_hit))
}

/// Return current playback state.
#[unsafe(no_mangle)]
pub extern "C" fn vivi_model_get_playback_state(
    model: *const ViviModel,
    out_state: *mut ViviPlaybackState,
) -> ViviStatus {
    ffi_boundary(|| model_get_playback_state_impl(model, out_state))
}

fn runtime_create_impl(
    limits: *const ViviRuntimeLimits,
    out_error: *mut ViviCreateError,
    out_runtime: *mut *mut ViviRuntime,
) -> ViviStatus {
    if !validate_create_error_output(out_error) {
        if !out_runtime.is_null() {
            unsafe {
                *out_runtime = ptr::null_mut();
            }
        }
        return status::INVALID_ARGUMENT;
    }
    if out_runtime.is_null() {
        write_create_error(
            out_error,
            status::INVALID_ARGUMENT,
            "out_runtime must not be null",
        );
        return status::INVALID_ARGUMENT;
    }
    unsafe {
        *out_runtime = ptr::null_mut();
    }

    let limits = match read_runtime_limits(limits) {
        Ok(limits) => limits,
        Err(error) => {
            write_create_error(out_error, error.status(), error.message());
            return error.status();
        }
    };

    let runtime = Box::new(ViviRuntime {
        limits,
        last_error: empty_cstring(),
        #[cfg(feature = "abi-v02")]
        public_model_generation: 0,
    });
    unsafe {
        *out_runtime = Box::into_raw(runtime);
    }
    write_create_error(out_error, status::OK, "");
    status::OK
}

fn runtime_destroy_impl(runtime: *mut ViviRuntime) {
    if !runtime.is_null() {
        unsafe {
            drop(Box::from_raw(runtime));
        }
    }
}

fn runtime_last_error_message_impl(runtime: *const ViviRuntime) -> *const c_char {
    if runtime.is_null() {
        return ptr::null();
    }
    unsafe { (*runtime).last_error.as_ptr() }
}

fn model_last_error_message_impl(model: *const ViviModel) -> *const c_char {
    if model.is_null() {
        return ptr::null();
    }
    unsafe { (*model).last_error.borrow().as_ptr() }
}

fn model_load_impl(
    runtime: *mut ViviRuntime,
    data: *const u8,
    data_len: u64,
    out_model: *mut *mut ViviModel,
) -> ViviStatus {
    if runtime.is_null() || out_model.is_null() {
        return status::INVALID_ARGUMENT;
    }
    unsafe {
        *out_model = ptr::null_mut();
    }
    if data.is_null() || data_len > isize::MAX as u64 {
        set_runtime_error(
            runtime,
            status::INVALID_ARGUMENT,
            "invalid model payload pointer",
        );
        return status::INVALID_ARGUMENT;
    }

    let bytes = unsafe { slice::from_raw_parts(data, data_len as usize) };
    let payload = match parse_runtime_payload(bytes, unsafe { (*runtime).limits }) {
        Ok(payload) => payload,
        Err(error) => {
            set_runtime_error(runtime, error.status(), error.message());
            return error.status();
        }
    };
    let runtime_limits = unsafe { (*runtime).limits };
    #[cfg(feature = "abi-v02")]
    let runtime_model = CoreRuntimeModel::from_payload_with_limits_v02(&payload, runtime_limits);
    #[cfg(not(feature = "abi-v02"))]
    let runtime_model = CoreRuntimeModel::from_payload_with_limits(&payload, runtime_limits);
    let runtime_model = match runtime_model {
        Ok(runtime_model) => runtime_model,
        Err(error) => {
            set_runtime_error(runtime, error.status(), error.message());
            return error.status();
        }
    };
    // The core accepts JSON's complete Unicode string domain. C ABI metadata
    // and identifier inputs use NUL-terminated strings, so reject values that
    // cannot round-trip through that representation before publishing a handle.
    if has_unrepresentable_model_strings(&runtime_model, &payload) {
        set_runtime_error(
            runtime,
            status::VALIDATION,
            "C ABI model strings must not contain NUL",
        );
        return status::VALIDATION;
    }
    let parameter_strings = runtime_model
        .parameters()
        .iter()
        .map(|parameter| cstring_lossy(&parameter.id))
        .collect();
    let texture_strings = runtime_model
        .textures()
        .iter()
        .map(|texture| TextureStrings {
            id: cstring_lossy(&texture.id),
            host_image_id: cstring_lossy(&texture.host_image_id),
        })
        .collect();
    let mesh_strings = runtime_model
        .meshes()
        .iter()
        .map(|mesh| MeshStrings {
            id: cstring_lossy(&mesh.id),
            texture_id: cstring_lossy(&mesh.texture_id),
        })
        .collect();
    let expression_preset_strings = runtime_model
        .expression_presets()
        .iter()
        .map(|preset| ExpressionPresetStrings {
            id: cstring_lossy(&preset.id),
            name: cstring_lossy(&preset.name),
            color: preset.color.as_deref().map(cstring_lossy),
            hotkey: preset.hotkey.as_deref().map(cstring_lossy),
            value_parameter_ids: preset
                .values
                .iter()
                .map(|value| cstring_lossy(&value.parameter_id))
                .collect(),
        })
        .collect();
    #[cfg(feature = "abi-v02")]
    let render_mesh_strings_v2 = runtime_model
        .render_meshes()
        .iter()
        .map(|mesh| MeshStrings {
            id: cstring_lossy(&mesh.id),
            texture_id: cstring_lossy(&mesh.texture_id),
        })
        .collect::<Vec<_>>();
    #[cfg(feature = "abi-v02")]
    {
        if runtime_model.required_render_features() & !RENDER_FEATURE_DRAW_COMMANDS != 0 {
            set_runtime_error(
                runtime,
                status::DRAW_COMMANDS_INVALID,
                "runtime model requires an unknown ABI 0.2 render feature",
            );
            return status::DRAW_COMMANDS_INVALID;
        }
        if let Err(error) = validate_draw_commands(
            runtime_model.draw_commands(),
            runtime_model.render_mesh_count(),
        ) {
            set_runtime_error(runtime, status::DRAW_COMMANDS_INVALID, error.message());
            return status::DRAW_COMMANDS_INVALID;
        }
    }
    #[cfg(feature = "abi-v02")]
    let draw_commands = runtime_model
        .draw_commands()
        .iter()
        .map(|command| ViviDrawCommandV2 {
            struct_size: command.struct_size,
            command_type: command.command_type,
            mesh_index: command.mesh_index,
            mask_depth: command.mask_depth,
            flags: command.flags,
            _reserved: command.reserved,
        })
        .collect::<Vec<_>>();
    #[cfg(feature = "abi-v02")]
    let model_generation = match unsafe { (*runtime).public_model_generation.checked_add(1) } {
        Some(generation) => generation,
        None => {
            set_runtime_error(
                runtime,
                status::INTERNAL,
                "public model generation overflow",
            );
            return status::INTERNAL;
        }
    };
    let model = Box::new(ViviModel {
        runtime_model: RefCell::new(runtime_model),
        texture_strings,
        mesh_strings,
        expression_preset_strings,
        parameter_strings,
        hit_string_pool: RefCell::new(Vec::new()),
        spec_version: RUNTIME_SPEC_VERSION,
        last_error: RefCell::new(empty_cstring()),
        #[cfg(feature = "abi-v02")]
        draw_commands,
        #[cfg(feature = "abi-v02")]
        render_mesh_strings_v2,
        #[cfg(feature = "abi-v02")]
        model_generation,
        #[cfg(feature = "abi-v02")]
        dynamic_generation: Cell::new(0),
    });
    unsafe {
        #[cfg(feature = "abi-v02")]
        {
            (*runtime).public_model_generation = model_generation;
        }
        *out_model = Box::into_raw(model);
    }
    status::OK
}

fn has_unrepresentable_model_strings(model: &CoreRuntimeModel, payload: &RuntimePayload) -> bool {
    let has_nul = |value: &str| value.as_bytes().contains(&0);
    if model.parameters().iter().any(|value| has_nul(&value.id))
        || model
            .textures()
            .iter()
            .any(|value| has_nul(&value.id) || has_nul(&value.host_image_id))
        || model
            .meshes()
            .iter()
            .any(|value| has_nul(&value.id) || has_nul(&value.texture_id))
        || model.expression_presets().iter().any(|value| {
            has_nul(&value.id)
                || has_nul(&value.name)
                || value.color.as_deref().is_some_and(has_nul)
                || value.hotkey.as_deref().is_some_and(has_nul)
                || value
                    .values
                    .iter()
                    .any(|value| has_nul(&value.parameter_id))
        })
    {
        return true;
    }
    #[cfg(feature = "abi-v02")]
    if model
        .render_meshes()
        .iter()
        .any(|value| has_nul(&value.id) || has_nul(&value.texture_id))
    {
        return true;
    }

    // Collider IDs are exposed lazily by hit_test rather than by a metadata
    // accessor. Inspect only these already core-validated fields; unrelated
    // authoring text and opaque JSON keys retain the core's string domain.
    payload
        .value
        .pointer("/project/colliders")
        .and_then(|value| value.as_array())
        .is_some_and(|colliders| {
            colliders.iter().any(|collider| {
                collider
                    .get("id")
                    .and_then(|value| value.as_str())
                    .is_some_and(has_nul)
                    || (collider
                        .pointer("/shape/type")
                        .and_then(|value| value.as_str())
                        == Some("mesh")
                        && collider
                            .pointer("/shape/meshId")
                            .and_then(|value| value.as_str())
                            .is_some_and(has_nul))
            })
        })
}

fn model_destroy_impl(model: *mut ViviModel) {
    if !model.is_null() {
        unsafe {
            drop(Box::from_raw(model));
        }
    }
}

fn model_get_spec_version_impl(
    model: *const ViviModel,
    out_version: *mut ViviVersion,
) -> ViviStatus {
    if model.is_null() {
        return status::INVALID_ARGUMENT;
    }
    let version = unsafe { (*model).spec_version };
    let write_status = write_version(out_version, version);
    if write_status != status::OK {
        set_model_error(
            model,
            write_status,
            "invalid ViviVersion output for model spec version",
        );
    }
    write_status
}

fn model_set_input_impl(model: *mut ViviModel, id: *const c_char, value: f64) -> ViviStatus {
    if model.is_null() || id.is_null() {
        if !model.is_null() {
            set_model_error(
                model,
                status::INVALID_ARGUMENT,
                "invalid set_input argument",
            );
        }
        return status::INVALID_ARGUMENT;
    }
    let id = unsafe { CStr::from_ptr(id) }.to_string_lossy();
    let model_ref = unsafe { &*model };
    let result = model_ref.runtime_model.borrow_mut().set_input(&id, value);
    match result {
        Ok(()) => status::OK,
        Err(error) => {
            set_model_error(model, error.status(), error.message());
            error.status()
        }
    }
}

fn model_get_input_impl(
    model: *const ViviModel,
    id: *const c_char,
    out_value: *mut f64,
) -> ViviStatus {
    if model.is_null() || id.is_null() || out_value.is_null() {
        if !model.is_null() {
            set_model_error(
                model,
                status::INVALID_ARGUMENT,
                "invalid get_input argument",
            );
        }
        return status::INVALID_ARGUMENT;
    }
    let id = unsafe { CStr::from_ptr(id) }.to_string_lossy();
    let model_ref = unsafe { &*model };
    match model_ref.runtime_model.borrow().get_input(&id) {
        Ok(value) => {
            unsafe {
                *out_value = value;
            }
            status::OK
        }
        Err(error) => {
            set_model_error(model, error.status(), error.message());
            error.status()
        }
    }
}

fn model_update_impl(model: *mut ViviModel, delta_seconds: f64) -> ViviStatus {
    if model.is_null() {
        return status::INVALID_ARGUMENT;
    }
    let model_ref = unsafe { &*model };
    #[cfg(feature = "abi-v02")]
    let next_dynamic_generation = match model_ref.dynamic_generation.get().checked_add(1) {
        Some(generation) => generation,
        None => {
            set_model_error(model, status::INTERNAL, "dynamic generation overflow");
            return status::INTERNAL;
        }
    };
    match model_ref.runtime_model.borrow_mut().update(delta_seconds) {
        Ok(()) => {
            #[cfg(feature = "abi-v02")]
            model_ref.dynamic_generation.set(next_dynamic_generation);
            status::OK
        }
        Err(error) => {
            set_model_error(model, error.status(), error.message());
            error.status()
        }
    }
}

fn model_parameter_count_impl(model: *const ViviModel, out_count: *mut u64) -> ViviStatus {
    if model.is_null() {
        return status::INVALID_ARGUMENT;
    }
    if out_count.is_null() {
        set_model_error(
            model,
            status::INVALID_ARGUMENT,
            "out_count must not be null",
        );
        return status::INVALID_ARGUMENT;
    }
    unsafe {
        *out_count = (*model).runtime_model.borrow().parameters().len() as u64;
    }
    status::OK
}

fn model_parameter_info_impl(
    model: *const ViviModel,
    parameter_index: u64,
    out_info: *mut ViviParameterInfo,
) -> ViviStatus {
    if model.is_null() {
        return status::INVALID_ARGUMENT;
    }
    let Some(index) = usize::try_from(parameter_index).ok() else {
        set_model_error(
            model,
            status::INVALID_ARGUMENT,
            "parameter index is out of range",
        );
        return status::INVALID_ARGUMENT;
    };
    let model_ref = unsafe { &*model };
    let runtime_model = model_ref.runtime_model.borrow();
    let Some(parameter) = runtime_model.parameters().get(index) else {
        set_model_error(
            model,
            status::INVALID_ARGUMENT,
            "parameter index is out of range",
        );
        return status::INVALID_ARGUMENT;
    };
    let Some(id) = model_ref.parameter_strings.get(index) else {
        set_model_error(
            model,
            status::INTERNAL,
            "parameter string cache is inconsistent",
        );
        return status::INTERNAL;
    };
    let Some(out) = validate_output_struct::<ViviParameterInfo>(out_info) else {
        set_model_error(
            model,
            status::INVALID_ARGUMENT,
            "invalid ViviParameterInfo output",
        );
        return status::INVALID_ARGUMENT;
    };
    let out = unsafe { &mut *out };
    out._reserved0 = 0;
    out.id = id.as_ptr();
    out.min = parameter.min;
    out.max = parameter.max;
    out.default_value = parameter.default_value;
    out.current_value = parameter.current_value;
    status::OK
}

fn model_texture_count_impl(model: *const ViviModel, out_count: *mut u64) -> ViviStatus {
    if model.is_null() {
        return status::INVALID_ARGUMENT;
    }
    if out_count.is_null() {
        set_model_error(
            model,
            status::INVALID_ARGUMENT,
            "out_count must not be null",
        );
        return status::INVALID_ARGUMENT;
    }
    unsafe {
        *out_count = (*model).runtime_model.borrow().textures().len() as u64;
    }
    status::OK
}

fn model_texture_snapshot_impl(
    model: *const ViviModel,
    texture_index: u64,
    out_snapshot: *mut ViviTextureSnapshot,
) -> ViviStatus {
    if model.is_null() {
        return status::INVALID_ARGUMENT;
    }
    let Some(index) = usize::try_from(texture_index).ok() else {
        set_model_error(
            model,
            status::INVALID_ARGUMENT,
            "texture index is out of range",
        );
        return status::INVALID_ARGUMENT;
    };
    let model_ref = unsafe { &*model };
    let runtime_model = model_ref.runtime_model.borrow();
    let Some(texture) = runtime_model.textures().get(index) else {
        set_model_error(
            model,
            status::INVALID_ARGUMENT,
            "texture index is out of range",
        );
        return status::INVALID_ARGUMENT;
    };
    let Some(strings) = model_ref.texture_strings.get(index) else {
        set_model_error(
            model,
            status::INTERNAL,
            "texture string cache is inconsistent",
        );
        return status::INTERNAL;
    };
    let Some(out) = validate_output_struct::<ViviTextureSnapshot>(out_snapshot) else {
        set_model_error(
            model,
            status::INVALID_ARGUMENT,
            "invalid ViviTextureSnapshot output",
        );
        return status::INVALID_ARGUMENT;
    };
    let out = unsafe { &mut *out };

    out._reserved0 = 0;
    out.id = strings.id.as_ptr();
    out.width = texture.width;
    out.height = texture.height;
    out.pixel_format = 0;
    out.color_space = 0;
    out.pixels = ptr::null();
    out.pixel_byte_len = 0;
    out.row_stride = 0;
    out.host_image_id = strings.host_image_id.as_ptr();
    status::OK
}

fn model_expression_preset_count_impl(model: *const ViviModel, out_count: *mut u64) -> ViviStatus {
    if model.is_null() {
        return status::INVALID_ARGUMENT;
    }
    if out_count.is_null() {
        set_model_error(
            model,
            status::INVALID_ARGUMENT,
            "out_count must not be null",
        );
        return status::INVALID_ARGUMENT;
    }
    unsafe {
        *out_count = (*model).runtime_model.borrow().expression_presets().len() as u64;
    }
    status::OK
}

fn model_expression_preset_info_impl(
    model: *const ViviModel,
    preset_index: u64,
    out_info: *mut ViviExpressionPresetInfo,
) -> ViviStatus {
    if model.is_null() {
        return status::INVALID_ARGUMENT;
    }
    let Some(index) = usize::try_from(preset_index).ok() else {
        set_model_error(
            model,
            status::INVALID_ARGUMENT,
            "expression preset index is out of range",
        );
        return status::INVALID_ARGUMENT;
    };
    let model_ref = unsafe { &*model };
    let runtime_model = model_ref.runtime_model.borrow();
    let Some(preset) = runtime_model.expression_presets().get(index) else {
        set_model_error(
            model,
            status::INVALID_ARGUMENT,
            "expression preset index is out of range",
        );
        return status::INVALID_ARGUMENT;
    };
    let Some(strings) = model_ref.expression_preset_strings.get(index) else {
        set_model_error(
            model,
            status::INTERNAL,
            "expression preset string cache is inconsistent",
        );
        return status::INTERNAL;
    };
    let Some(out) = validate_output_struct::<ViviExpressionPresetInfo>(out_info) else {
        set_model_error(
            model,
            status::INVALID_ARGUMENT,
            "invalid ViviExpressionPresetInfo output",
        );
        return status::INVALID_ARGUMENT;
    };
    let out = unsafe { &mut *out };
    out._reserved0 = 0;
    out.id = strings.id.as_ptr();
    out.name = strings.name.as_ptr();
    out.color = strings
        .color
        .as_ref()
        .map_or(ptr::null(), |value| value.as_ptr());
    out.hotkey = strings
        .hotkey
        .as_ref()
        .map_or(ptr::null(), |value| value.as_ptr());
    out.parameter_value_count = preset.values.len() as u64;
    status::OK
}

fn model_expression_preset_value_impl(
    model: *const ViviModel,
    preset_index: u64,
    value_index: u64,
    out_parameter_id: *mut *const c_char,
    out_value: *mut f64,
) -> ViviStatus {
    if model.is_null() {
        return status::INVALID_ARGUMENT;
    }
    if out_parameter_id.is_null() || out_value.is_null() {
        set_model_error(
            model,
            status::INVALID_ARGUMENT,
            "invalid expression preset value argument",
        );
        return status::INVALID_ARGUMENT;
    }
    let Some(preset_index) = usize::try_from(preset_index).ok() else {
        set_model_error(
            model,
            status::INVALID_ARGUMENT,
            "expression preset index is out of range",
        );
        return status::INVALID_ARGUMENT;
    };
    let Some(value_index) = usize::try_from(value_index).ok() else {
        set_model_error(
            model,
            status::INVALID_ARGUMENT,
            "expression preset value index is out of range",
        );
        return status::INVALID_ARGUMENT;
    };
    let model_ref = unsafe { &*model };
    let runtime_model = model_ref.runtime_model.borrow();
    let Some(preset) = runtime_model.expression_presets().get(preset_index) else {
        set_model_error(
            model,
            status::INVALID_ARGUMENT,
            "expression preset index is out of range",
        );
        return status::INVALID_ARGUMENT;
    };
    let Some(value) = preset.values.get(value_index) else {
        set_model_error(
            model,
            status::INVALID_ARGUMENT,
            "expression preset value index is out of range",
        );
        return status::INVALID_ARGUMENT;
    };
    let Some(strings) = model_ref.expression_preset_strings.get(preset_index) else {
        set_model_error(
            model,
            status::INTERNAL,
            "expression preset string cache is inconsistent",
        );
        return status::INTERNAL;
    };
    let Some(parameter_id) = strings.value_parameter_ids.get(value_index) else {
        set_model_error(
            model,
            status::INTERNAL,
            "expression preset value string cache is inconsistent",
        );
        return status::INTERNAL;
    };
    unsafe {
        *out_parameter_id = parameter_id.as_ptr();
        *out_value = value.value;
    }
    status::OK
}

fn model_apply_expression_preset_impl(
    model: *mut ViviModel,
    preset_id: *const c_char,
) -> ViviStatus {
    if model.is_null() {
        return status::INVALID_ARGUMENT;
    }
    if preset_id.is_null() {
        set_model_error(
            model,
            status::INVALID_ARGUMENT,
            "invalid expression preset apply argument",
        );
        return status::INVALID_ARGUMENT;
    }
    let preset_id = unsafe { CStr::from_ptr(preset_id) }.to_string_lossy();
    let model_ref = unsafe { &*model };
    match model_ref
        .runtime_model
        .borrow_mut()
        .apply_expression_preset(&preset_id)
    {
        Ok(()) => status::OK,
        Err(error) => {
            set_model_error(model, error.status(), error.message());
            error.status()
        }
    }
}

#[cfg(feature = "abi-v02")]
fn model_draw_command_count_impl(model: *const ViviModel, out_count: *mut u64) -> ViviStatus {
    if model.is_null() {
        return status::INVALID_ARGUMENT;
    }
    if out_count.is_null() {
        set_model_error(
            model,
            status::INVALID_ARGUMENT,
            "draw-command out_count must not be null",
        );
        return status::INVALID_ARGUMENT;
    }
    unsafe {
        *out_count = (*model).draw_commands.len() as u64;
    }
    status::OK
}

#[cfg(feature = "abi-v02")]
fn model_draw_commands_impl(
    model: *const ViviModel,
    out_ptr: *mut *const ViviDrawCommandV2,
) -> ViviStatus {
    if model.is_null() {
        return status::INVALID_ARGUMENT;
    }
    if out_ptr.is_null() {
        set_model_error(
            model,
            status::INVALID_ARGUMENT,
            "draw-command out_ptr must not be null",
        );
        return status::INVALID_ARGUMENT;
    }
    let commands = unsafe { &(*model).draw_commands };
    unsafe {
        *out_ptr = if commands.is_empty() {
            ptr::null()
        } else {
            commands.as_ptr()
        };
    }
    status::OK
}

#[cfg(feature = "abi-v02")]
fn model_generations_impl(
    model: *const ViviModel,
    out_generations: *mut ViviGenerations,
) -> ViviStatus {
    if model.is_null() {
        return status::INVALID_ARGUMENT;
    }
    if out_generations.is_null() {
        set_model_error(
            model,
            status::INVALID_ARGUMENT,
            "out_generations must not be null",
        );
        return status::INVALID_ARGUMENT;
    }
    let model_ref = unsafe { &*model };
    unsafe {
        *out_generations = ViviGenerations {
            model_generation: model_ref.model_generation,
            topology_generation: 1,
            dynamic_generation: model_ref.dynamic_generation.get(),
        };
    }
    status::OK
}

#[cfg(feature = "abi-v02")]
fn model_render_mesh_count_v2_impl(model: *const ViviModel, out_count: *mut u64) -> ViviStatus {
    if model.is_null() {
        return status::INVALID_ARGUMENT;
    }
    if out_count.is_null() {
        set_model_error(
            model,
            status::INVALID_ARGUMENT,
            "V2 render-mesh out_count must not be null",
        );
        return status::INVALID_ARGUMENT;
    }
    unsafe {
        *out_count = (*model).runtime_model.borrow().render_mesh_count() as u64;
    }
    status::OK
}

#[cfg(feature = "abi-v02")]
fn model_render_mesh_snapshot_v2_impl(
    model: *const ViviModel,
    mesh_slot: u32,
    out_snapshot: *mut ViviMeshSnapshot,
) -> ViviStatus {
    if model.is_null() {
        return status::INVALID_ARGUMENT;
    }
    if !is_valid_output_struct::<ViviMeshSnapshot>(out_snapshot) {
        set_model_error(
            model,
            status::INVALID_ARGUMENT,
            "invalid ABI 0.2 ViviMeshSnapshot output",
        );
        return status::INVALID_ARGUMENT;
    }
    let model_ref = unsafe { &*model };
    let runtime_model = model_ref.runtime_model.borrow();
    let index = mesh_slot as usize;
    let Some(mesh) = runtime_model.render_mesh(index) else {
        set_model_error(
            model,
            status::INVALID_ARGUMENT,
            "V2 render mesh slot is out of range",
        );
        return status::INVALID_ARGUMENT;
    };
    let Some(strings) = model_ref.render_mesh_strings_v2.get(index) else {
        set_model_error(
            model,
            status::INTERNAL,
            "V2 render-mesh string cache is inconsistent",
        );
        return status::INTERNAL;
    };
    write_mesh_snapshot(model, mesh, strings, out_snapshot)
}

#[cfg(feature = "abi-v02")]
fn model_required_render_features_impl(model: *const ViviModel, out_flags: *mut u64) -> ViviStatus {
    if model.is_null() {
        return status::INVALID_ARGUMENT;
    }
    if out_flags.is_null() {
        set_model_error(
            model,
            status::INVALID_ARGUMENT,
            "out_flags must not be null",
        );
        return status::INVALID_ARGUMENT;
    }
    let required = unsafe { (*model).runtime_model.borrow().required_render_features() };
    if required & !RENDER_FEATURE_DRAW_COMMANDS != 0 {
        set_model_error(
            model,
            status::DRAW_COMMANDS_INVALID,
            "runtime model requires an unknown ABI 0.2 render feature",
        );
        return status::DRAW_COMMANDS_INVALID;
    }
    unsafe {
        *out_flags = required;
    }
    status::OK
}

#[cfg(feature = "abi-v02")]
fn reject_legacy_render_api_for_required_features(model: *const ViviModel) -> Option<ViviStatus> {
    let required = unsafe { (*model).runtime_model.borrow().required_render_features() };
    if required == 0 {
        return None;
    }
    set_model_error(
        model,
        status::RENDER_FEATURE_REQUIRED,
        "model requires ABI 0.2 draw commands; legacy render API is unavailable",
    );
    Some(status::RENDER_FEATURE_REQUIRED)
}

fn model_mesh_count_impl(model: *const ViviModel, out_count: *mut u64) -> ViviStatus {
    if model.is_null() {
        return status::INVALID_ARGUMENT;
    }
    if out_count.is_null() {
        set_model_error(
            model,
            status::INVALID_ARGUMENT,
            "out_count must not be null",
        );
        return status::INVALID_ARGUMENT;
    }
    #[cfg(feature = "abi-v02")]
    if let Some(error_status) = reject_legacy_render_api_for_required_features(model) {
        return error_status;
    }
    unsafe {
        *out_count = (*model).runtime_model.borrow().meshes().len() as u64;
    }
    status::OK
}

fn model_mesh_snapshot_impl(
    model: *const ViviModel,
    render_index: u64,
    out_snapshot: *mut ViviMeshSnapshot,
) -> ViviStatus {
    if model.is_null() {
        return status::INVALID_ARGUMENT;
    }
    let Some(index) = usize::try_from(render_index).ok() else {
        set_model_error(
            model,
            status::INVALID_ARGUMENT,
            "mesh index is out of range",
        );
        return status::INVALID_ARGUMENT;
    };
    #[cfg(feature = "abi-v02")]
    if !is_valid_output_struct::<ViviMeshSnapshot>(out_snapshot) {
        set_model_error(
            model,
            status::INVALID_ARGUMENT,
            "invalid ViviMeshSnapshot output",
        );
        return status::INVALID_ARGUMENT;
    }
    #[cfg(feature = "abi-v02")]
    if let Some(error_status) = reject_legacy_render_api_for_required_features(model) {
        return error_status;
    }
    write_mesh_snapshot_by_index(model, index, out_snapshot)
}

fn model_mesh_snapshot_by_id_impl(
    model: *const ViviModel,
    mesh_id: *const c_char,
    out_snapshot: *mut ViviMeshSnapshot,
) -> ViviStatus {
    if model.is_null() {
        return status::INVALID_ARGUMENT;
    }
    if mesh_id.is_null() {
        set_model_error(model, status::INVALID_ARGUMENT, "mesh_id must not be null");
        return status::INVALID_ARGUMENT;
    }
    #[cfg(feature = "abi-v02")]
    if !is_valid_output_struct::<ViviMeshSnapshot>(out_snapshot) {
        set_model_error(
            model,
            status::INVALID_ARGUMENT,
            "invalid ViviMeshSnapshot output",
        );
        return status::INVALID_ARGUMENT;
    }
    #[cfg(feature = "abi-v02")]
    if let Some(error_status) = reject_legacy_render_api_for_required_features(model) {
        return error_status;
    }
    let mesh_id = unsafe { CStr::from_ptr(mesh_id) }.to_string_lossy();
    let model_ref = unsafe { &*model };
    let runtime_model = model_ref.runtime_model.borrow();
    let Some(index) = runtime_model
        .meshes()
        .iter()
        .position(|mesh| mesh.id == mesh_id)
    else {
        set_model_error(model, status::INVALID_ARGUMENT, "mesh ID was not found");
        return status::INVALID_ARGUMENT;
    };
    write_mesh_snapshot_by_index(model, index, out_snapshot)
}

fn model_hit_test_impl(
    model: *const ViviModel,
    x: f64,
    y: f64,
    out_hit: *mut ViviHitResult,
    out_has_hit: *mut u8,
) -> ViviStatus {
    if model.is_null() {
        return status::INVALID_ARGUMENT;
    }
    if !is_valid_output_struct::<ViviHitResult>(out_hit) || out_has_hit.is_null() {
        set_model_error(model, status::INVALID_ARGUMENT, "invalid hit-test argument");
        return status::INVALID_ARGUMENT;
    }
    let model_ref = unsafe { &*model };
    let hit = match model_ref.runtime_model.borrow().hit_test(x, y) {
        Ok(hit) => hit,
        Err(error) => {
            set_model_error(model, error.status(), error.message());
            return error.status();
        }
    };
    unsafe {
        *out_has_hit = u8::from(hit.is_some());
    }
    let out = unsafe { &mut *out_hit };
    out._reserved0 = 0;
    out.collider_id = ptr::null();
    out.layer_id = ptr::null();
    out.mesh_id = ptr::null();
    out.x = x;
    out.y = y;
    if let Some(hit) = hit {
        out.collider_id = intern_model_hit_string(model_ref, &hit.collider_id);
        out.layer_id = if hit.layer_id.is_some() {
            intern_model_hit_string(model_ref, hit.layer_id.as_deref().unwrap_or(""))
        } else {
            ptr::null()
        };
        out.mesh_id = if hit.mesh_id.is_some() {
            intern_model_hit_string(model_ref, hit.mesh_id.as_deref().unwrap_or(""))
        } else {
            ptr::null()
        };
    }
    status::OK
}

fn intern_model_hit_string(model: &ViviModel, value: &str) -> *const c_char {
    let mut pool = model.hit_string_pool.borrow_mut();
    if let Some(existing) = pool
        .iter()
        .find(|existing| existing.to_bytes() == value.as_bytes())
    {
        return existing.as_ptr();
    }
    pool.push(cstring_lossy(value).into_boxed_c_str());
    pool.last()
        .map_or(ptr::null(), |inserted| inserted.as_ptr())
}

fn model_get_playback_state_impl(
    model: *const ViviModel,
    out_state: *mut ViviPlaybackState,
) -> ViviStatus {
    if model.is_null() {
        return status::INVALID_ARGUMENT;
    }
    if !is_valid_output_struct::<ViviPlaybackState>(out_state) {
        set_model_error(
            model,
            status::INVALID_ARGUMENT,
            "invalid playback state output",
        );
        return status::INVALID_ARGUMENT;
    }
    let out = unsafe { &mut *out_state };
    out.playing = 0;
    out.loop_ = 0;
    out._reserved0 = [0; 2];
    out.clip_id = ptr::null();
    out.time_seconds = 0.0;
    status::OK
}

fn write_mesh_snapshot_by_index(
    model: *const ViviModel,
    index: usize,
    out_snapshot: *mut ViviMeshSnapshot,
) -> ViviStatus {
    let model_ref = unsafe { &*model };
    let runtime_model = model_ref.runtime_model.borrow();
    let Some(mesh) = runtime_model.meshes().get(index) else {
        set_model_error(
            model,
            status::INVALID_ARGUMENT,
            "mesh index is out of range",
        );
        return status::INVALID_ARGUMENT;
    };
    let Some(strings) = model_ref.mesh_strings.get(index) else {
        set_model_error(model, status::INTERNAL, "mesh string cache is inconsistent");
        return status::INTERNAL;
    };
    write_mesh_snapshot(model, mesh, strings, out_snapshot)
}

fn write_mesh_snapshot(
    model: *const ViviModel,
    mesh: &CoreMeshSnapshot,
    strings: &MeshStrings,
    out_snapshot: *mut ViviMeshSnapshot,
) -> ViviStatus {
    let Some(out) = validate_output_struct::<ViviMeshSnapshot>(out_snapshot) else {
        set_model_error(
            model,
            status::INVALID_ARGUMENT,
            "invalid ViviMeshSnapshot output",
        );
        return status::INVALID_ARGUMENT;
    };
    let out = unsafe { &mut *out };

    out._reserved0 = 0;
    out.id = strings.id.as_ptr();
    out.texture_id = strings.texture_id.as_ptr();
    out.vertices = mesh.vertices.as_ptr();
    out.vertex_float_count = mesh.vertices.len() as u64;
    out.uvs = mesh.uvs.as_ptr();
    out.uv_float_count = mesh.uvs.len() as u64;
    out.indices = mesh.indices.as_ptr();
    out.index_count = mesh.indices.len() as u64;
    out.x = mesh.x;
    out.y = mesh.y;
    out.opacity = mesh.opacity;
    out.draw_order = mesh.draw_order;
    out.blend_mode = match mesh.blend_mode {
        CoreBlendMode::Normal => 0,
        CoreBlendMode::Multiply => 1,
        CoreBlendMode::Screen => 2,
        CoreBlendMode::Add => 3,
    };
    out.visible = u8::from(mesh.visible);
    out.culled = u8::from(mesh.culled);
    out.has_multiply_color = u8::from(mesh.multiply_color.is_some());
    out.has_screen_color = u8::from(mesh.screen_color.is_some());
    out.multiply_color = mesh.multiply_color.unwrap_or([0.0; 4]);
    out.screen_color = mesh.screen_color.unwrap_or([0.0; 4]);
    status::OK
}

fn unsupported_model_operation(model: *const ViviModel, operation: &str) -> ViviStatus {
    if model.is_null() {
        return status::INVALID_ARGUMENT;
    }
    set_model_error(
        model,
        status::UNSUPPORTED_OPERATION,
        &format!("{operation} is not implemented by the native runtime yet"),
    );
    status::UNSUPPORTED_OPERATION
}

#[cfg(feature = "png-v1")]
const PNG_OK: ViviPngStatus = 0;
#[cfg(feature = "png-v1")]
const PNG_INVALID_ARGUMENT: ViviPngStatus = 1;
#[cfg(feature = "png-v1")]
const PNG_LIMIT: ViviPngStatus = 4;

#[cfg(feature = "png-v1")]
fn png_inspect_impl(
    bytes: *const u8,
    len: u64,
    declared_width: u32,
    declared_height: u32,
    out_info: *mut ViviPngInfo,
) -> ViviPngStatus {
    let Some(input_range) = checked_const_u8_range(bytes, len) else {
        return PNG_INVALID_ARGUMENT;
    };
    let Some(info_range) = checked_mut_range(out_info, size_of::<ViviPngInfo>()) else {
        return PNG_INVALID_ARGUMENT;
    };
    if ranges_overlap(&input_range, &info_range) {
        return PNG_INVALID_ARGUMENT;
    }

    // SAFETY: The output pointer has a non-wrapping, properly aligned range
    // large enough for the known prefix. The caller initializes this leading
    // field before calling, as with the other sized C ABI output structs.
    let caller_struct_size = unsafe { out_info.cast::<u32>().read() } as usize;
    if !(size_of::<ViviPngInfo>()..=16 * 1024).contains(&caller_struct_size) {
        return PNG_INVALID_ARGUMENT;
    }

    // SAFETY: The complete input range was validated above and does not
    // overlap the output structure.
    let input = unsafe { slice::from_raw_parts(bytes, input_range.len()) };
    match vivi_png_ref::inspect(input, declared_width, declared_height) {
        Ok(info) => {
            // Commit output fields only after inspection has fully succeeded.
            // SAFETY: The known output prefix was validated above.
            unsafe {
                ptr::addr_of_mut!((*out_info).width).write(info.width);
                ptr::addr_of_mut!((*out_info).height).write(info.height);
                ptr::addr_of_mut!((*out_info)._reserved0).write(0);
                ptr::addr_of_mut!((*out_info).required_output_bytes)
                    .write(info.required_output_bytes);
            }
            PNG_OK
        }
        Err(error) => png_error_status(error),
    }
}

#[cfg(feature = "png-v1")]
#[allow(clippy::too_many_arguments)]
fn png_decode_impl(
    bytes: *const u8,
    len: u64,
    expected_content_sha256: *const u8,
    declared_width: u32,
    declared_height: u32,
    output_ptr: *mut u8,
    output_capacity: u64,
) -> ViviPngStatus {
    let Some(input_range) = checked_const_u8_range(bytes, len) else {
        return PNG_INVALID_ARGUMENT;
    };
    if checked_const_u8_range(expected_content_sha256, vivi_png_ref::SHA256_BYTES as u64).is_none()
    {
        return PNG_INVALID_ARGUMENT;
    }
    let Some(output_range) = checked_mut_u8_range(output_ptr, output_capacity) else {
        return PNG_INVALID_ARGUMENT;
    };
    if ranges_overlap(&input_range, &output_range) {
        return PNG_INVALID_ARGUMENT;
    }

    let mut expected = [0_u8; vivi_png_ref::SHA256_BYTES];
    // SAFETY: The fixed digest input range was validated above. Copying it to
    // owned storage avoids retaining an alias while the output is mutable.
    unsafe {
        ptr::copy_nonoverlapping(
            expected_content_sha256,
            expected.as_mut_ptr(),
            vivi_png_ref::SHA256_BYTES,
        );
    }

    // SAFETY: Both complete ranges were validated above and proven disjoint.
    let input = unsafe { slice::from_raw_parts(bytes, input_range.len()) };
    // SAFETY: The output range is non-null, non-wrapping, at most isize::MAX,
    // and disjoint from every live immutable input range.
    let output = unsafe { slice::from_raw_parts_mut(output_ptr, output_range.len()) };
    match vivi_png_ref::decode_into(input, &expected, declared_width, declared_height, output) {
        Ok(_) => PNG_OK,
        Err(error) => png_error_status(error),
    }
}

#[cfg(feature = "png-v1")]
fn png_error_status(error: vivi_png_ref::Error) -> ViviPngStatus {
    error.as_i32()
}

#[cfg(feature = "png-v1")]
fn png_ffi_boundary(callback: impl FnOnce() -> ViviPngStatus) -> ViviPngStatus {
    // The PNG namespace has no INTERNAL status. A caught implementation panic
    // is failed closed as LIMIT, which is also the specified scratch-allocation
    // failure class, and no caller output has been committed at that point.
    match catch_unwind(AssertUnwindSafe(callback)) {
        Ok(status) => status,
        Err(_) => PNG_LIMIT,
    }
}

#[cfg(feature = "png-v1")]
fn checked_const_u8_range(pointer: *const u8, len: u64) -> Option<std::ops::Range<usize>> {
    checked_address_range(pointer.cast_mut(), len)
}

#[cfg(feature = "png-v1")]
fn checked_mut_u8_range(pointer: *mut u8, len: u64) -> Option<std::ops::Range<usize>> {
    checked_address_range(pointer, len)
}

#[cfg(feature = "png-v1")]
fn checked_mut_range<T>(pointer: *mut T, len: usize) -> Option<std::ops::Range<usize>> {
    if pointer.is_null() || !(pointer as usize).is_multiple_of(align_of::<T>()) {
        return None;
    }
    checked_address_range(pointer.cast::<u8>(), len as u64)
}

#[cfg(feature = "png-v1")]
fn checked_address_range(pointer: *mut u8, len: u64) -> Option<std::ops::Range<usize>> {
    if pointer.is_null() {
        return None;
    }
    let len = usize::try_from(len).ok()?;
    if len > isize::MAX as usize {
        return None;
    }
    let start = pointer as usize;
    let end = start.checked_add(len)?;
    Some(start..end)
}

#[cfg(feature = "png-v1")]
fn ranges_overlap(left: &std::ops::Range<usize>, right: &std::ops::Range<usize>) -> bool {
    !left.is_empty() && !right.is_empty() && left.start < right.end && right.start < left.end
}

fn ffi_boundary(callback: impl FnOnce() -> ViviStatus) -> ViviStatus {
    match catch_unwind(AssertUnwindSafe(callback)) {
        Ok(status) => status,
        Err(_) => status::INTERNAL,
    }
}

fn write_version(out_version: *mut ViviVersion, version: Version) -> ViviStatus {
    if out_version.is_null() {
        return status::INVALID_ARGUMENT;
    }

    // SAFETY: The pointer was checked for null. Only the leading `struct_size`
    // field may be read before validating the caller's advertised buffer size.
    let struct_size = unsafe { (*out_version).struct_size as usize };
    if !(size_of::<ViviVersion>()..=16 * 1024).contains(&struct_size) {
        return status::INVALID_ARGUMENT;
    }

    // SAFETY: The caller-provided buffer is non-null and large enough for the
    // v0.1 `ViviVersion` layout validated above.
    let out = unsafe { &mut *out_version };
    out.major = version.major;
    out.minor = version.minor;
    out.patch = version.patch;
    status::OK
}

fn validate_output_struct<T>(out: *mut T) -> Option<*mut T> {
    if !is_valid_output_struct::<T>(out) {
        return None;
    }
    Some(out)
}

fn is_valid_output_struct<T>(out: *const T) -> bool {
    if out.is_null() {
        return false;
    }
    let struct_size = unsafe { *(out.cast::<u32>()) as usize };
    (size_of::<T>()..=16 * 1024).contains(&struct_size)
}

fn read_runtime_limits(
    limits: *const ViviRuntimeLimits,
) -> Result<CoreRuntimeLimits, RuntimeError> {
    if limits.is_null() {
        return Ok(CoreRuntimeLimits::default());
    }

    let struct_size = unsafe { (*limits).struct_size as usize };
    if !(size_of::<u32>()..=16 * 1024).contains(&struct_size) {
        return Err(RuntimeError::new(
            status::INVALID_ARGUMENT,
            "invalid ViviRuntimeLimits.struct_size",
        ));
    }

    if covers_field::<u32>(struct_size, offset_of!(ViviRuntimeLimits, _reserved0)) {
        let reserved0 = unsafe { ptr::addr_of!((*limits)._reserved0).read() };
        if reserved0 != 0 {
            return Err(RuntimeError::new(
                status::INVALID_ARGUMENT,
                "ViviRuntimeLimits reserved fields must be zero",
            ));
        }
    }

    let mut core_limits = CoreRuntimeLimits::default();
    if covers_field::<u64>(
        struct_size,
        offset_of!(ViviRuntimeLimits, max_payload_bytes),
    ) {
        core_limits.max_payload_bytes =
            unsafe { ptr::addr_of!((*limits).max_payload_bytes).read() };
    }
    if covers_field::<u64>(
        struct_size,
        offset_of!(ViviRuntimeLimits, max_texture_bytes),
    ) {
        core_limits.max_texture_bytes =
            unsafe { ptr::addr_of!((*limits).max_texture_bytes).read() };
    }
    if covers_field::<u32>(struct_size, offset_of!(ViviRuntimeLimits, max_textures)) {
        core_limits.max_textures = unsafe { ptr::addr_of!((*limits).max_textures).read() as usize };
    }
    if covers_field::<u32>(struct_size, offset_of!(ViviRuntimeLimits, max_layers)) {
        core_limits.max_layers = unsafe { ptr::addr_of!((*limits).max_layers).read() as usize };
    }
    if covers_field::<u32>(struct_size, offset_of!(ViviRuntimeLimits, max_meshes)) {
        core_limits.max_meshes = unsafe { ptr::addr_of!((*limits).max_meshes).read() as usize };
    }
    if covers_field::<u32>(
        struct_size,
        offset_of!(ViviRuntimeLimits, max_vertices_per_mesh),
    ) {
        core_limits.max_vertices_per_mesh =
            unsafe { ptr::addr_of!((*limits).max_vertices_per_mesh).read() as usize };
    }
    if covers_field::<u32>(
        struct_size,
        offset_of!(ViviRuntimeLimits, max_indices_per_mesh),
    ) {
        core_limits.max_indices_per_mesh =
            unsafe { ptr::addr_of!((*limits).max_indices_per_mesh).read() as usize };
    }
    if covers_field::<u32>(struct_size, offset_of!(ViviRuntimeLimits, max_bones)) {
        core_limits.max_bones = unsafe { ptr::addr_of!((*limits).max_bones).read() as usize };
    }
    if covers_field::<u32>(
        struct_size,
        offset_of!(ViviRuntimeLimits, max_ik_controllers),
    ) {
        core_limits.max_ik_controllers =
            unsafe { ptr::addr_of!((*limits).max_ik_controllers).read() as usize };
    }
    if covers_field::<u32>(
        struct_size,
        offset_of!(ViviRuntimeLimits, max_physics_groups),
    ) {
        core_limits.max_physics_groups =
            unsafe { ptr::addr_of!((*limits).max_physics_groups).read() as usize };
    }
    if covers_field::<u32>(
        struct_size,
        offset_of!(ViviRuntimeLimits, max_pendulums_per_physics_group),
    ) {
        core_limits.max_pendulums_per_physics_group =
            unsafe { ptr::addr_of!((*limits).max_pendulums_per_physics_group).read() as usize };
    }
    if covers_field::<u32>(struct_size, offset_of!(ViviRuntimeLimits, max_parameters)) {
        core_limits.max_parameters =
            unsafe { ptr::addr_of!((*limits).max_parameters).read() as usize };
    }
    if covers_field::<u32>(
        struct_size,
        offset_of!(ViviRuntimeLimits, max_binding_points),
    ) {
        core_limits.max_binding_points =
            unsafe { ptr::addr_of!((*limits).max_binding_points).read() as usize };
    }
    if covers_field::<u32>(struct_size, offset_of!(ViviRuntimeLimits, max_colliders)) {
        core_limits.max_colliders =
            unsafe { ptr::addr_of!((*limits).max_colliders).read() as usize };
    }
    if covers_field::<u32>(
        struct_size,
        offset_of!(ViviRuntimeLimits, max_animation_clips),
    ) {
        core_limits.max_animation_clips =
            unsafe { ptr::addr_of!((*limits).max_animation_clips).read() as usize };
    }
    if covers_field::<u32>(
        struct_size,
        offset_of!(ViviRuntimeLimits, max_state_machines),
    ) {
        core_limits.max_state_machines =
            unsafe { ptr::addr_of!((*limits).max_state_machines).read() as usize };
    }
    if covers_field::<u32>(
        struct_size,
        offset_of!(ViviRuntimeLimits, max_states_per_state_machine),
    ) {
        core_limits.max_states_per_state_machine =
            unsafe { ptr::addr_of!((*limits).max_states_per_state_machine).read() as usize };
    }
    if covers_field::<u32>(
        struct_size,
        offset_of!(ViviRuntimeLimits, max_transitions_per_state_machine),
    ) {
        core_limits.max_transitions_per_state_machine =
            unsafe { ptr::addr_of!((*limits).max_transitions_per_state_machine).read() as usize };
    }
    Ok(core_limits.hardened())
}

fn covers_field<Field>(struct_size: usize, offset: usize) -> bool {
    offset.saturating_add(size_of::<Field>()) <= struct_size
}

fn write_create_error(
    out_error: *mut ViviCreateError,
    write_status: ViviStatus,
    message: &str,
) -> ViviStatus {
    if out_error.is_null() {
        return status::OK;
    }

    let struct_size = unsafe { (*out_error).struct_size as usize };
    if !(size_of::<ViviCreateError>()..=16 * 1024).contains(&struct_size) {
        return status::INVALID_ARGUMENT;
    }
    let out = unsafe { &mut *out_error };
    out.status = write_status;
    out.message.fill(0);

    let sanitized = message.replace('\0', "\u{fffd}");
    let bytes = sanitized.as_bytes();
    let mut byte_len = bytes.len().min(out.message.len().saturating_sub(1));
    while !sanitized.is_char_boundary(byte_len) {
        byte_len -= 1;
    }
    for (index, byte) in bytes[..byte_len].iter().enumerate() {
        out.message[index] = *byte as c_char;
    }
    status::OK
}

fn validate_create_error_output(out_error: *mut ViviCreateError) -> bool {
    if out_error.is_null() {
        return true;
    }
    let struct_size = unsafe { (*out_error).struct_size as usize };
    (size_of::<ViviCreateError>()..=16 * 1024).contains(&struct_size)
}

fn set_runtime_error(runtime: *mut ViviRuntime, _error_status: ViviStatus, message: &str) {
    if runtime.is_null() {
        return;
    }
    unsafe {
        (*runtime).last_error = cstring_lossy(message);
    }
}

fn set_model_error(model: *const ViviModel, _error_status: ViviStatus, message: &str) {
    if model.is_null() {
        return;
    }
    unsafe {
        (*model).last_error.replace(cstring_lossy(message));
    }
}

fn cstring_lossy(message: &str) -> CString {
    CString::new(message.replace('\0', "\u{fffd}")).expect("interior NUL replaced above")
}

fn empty_cstring() -> CString {
    CString::new("").expect("empty string does not contain NUL")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::ffi::CStr;
    use std::mem::{align_of, offset_of};

    macro_rules! assert_layout {
        ($type:ty, $size:expr, $align:expr) => {
            assert_eq!(
                size_of::<$type>(),
                $size,
                concat!(stringify!($type), " size")
            );
            assert_eq!(
                align_of::<$type>(),
                $align,
                concat!(stringify!($type), " align")
            );
        };
    }

    macro_rules! assert_offset {
        ($type:ty, $field:ident, $offset:expr) => {
            assert_eq!(
                offset_of!($type, $field),
                $offset,
                concat!(stringify!($type), ".", stringify!($field))
            );
        };
    }

    #[test]
    fn exports_version_functions() {
        assert_eq!(vivi_get_abi_version(), C_ABI_VERSION);

        let mut runtime_version = ViviVersion {
            struct_size: size_of::<ViviVersion>() as u32,
            major: 0,
            minor: 0,
            patch: 0,
        };
        assert_eq!(vivi_get_runtime_version(&mut runtime_version), status::OK);
        assert_eq!(runtime_version.major, RUNTIME_VERSION.major);
        assert_eq!(runtime_version.minor, RUNTIME_VERSION.minor);
        assert_eq!(runtime_version.patch, RUNTIME_VERSION.patch);

        let mut min_version = ViviVersion {
            struct_size: size_of::<ViviVersion>() as u32,
            major: 0,
            minor: 0,
            patch: 0,
        };
        let mut max_version = min_version;
        assert_eq!(
            vivi_get_supported_spec_version_range(&mut min_version, &mut max_version),
            status::OK
        );
        assert_eq!(min_version.major, 1);
        assert_eq!(max_version.major, 1);
    }

    #[test]
    fn version_outputs_validate_null_and_struct_size() {
        assert_eq!(
            vivi_get_runtime_version(std::ptr::null_mut()),
            status::INVALID_ARGUMENT
        );

        let mut version = ViviVersion {
            struct_size: 4,
            major: 99,
            minor: 99,
            patch: 99,
        };
        assert_eq!(
            vivi_get_runtime_version(&mut version),
            status::INVALID_ARGUMENT
        );
        assert_eq!(version.major, 99);
    }

    #[test]
    fn panic_boundary_maps_to_internal() {
        assert_eq!(
            ffi_boundary(|| panic!("panic must not cross the C ABI")),
            status::INTERNAL
        );
    }

    #[cfg(feature = "png-v1")]
    #[test]
    fn png_status_layout_and_profile_constants_match_the_frozen_header() {
        assert_eq!(PNG_OK, 0);
        assert_eq!(PNG_INVALID_ARGUMENT, 1);
        assert_eq!(vivi_png_ref::Error::Unsupported.as_i32(), 2);
        assert_eq!(vivi_png_ref::Error::Malformed.as_i32(), 3);
        assert_eq!(vivi_png_ref::Error::Limit.as_i32(), 4);
        assert_eq!(vivi_png_ref::Error::Dimension.as_i32(), 5);
        assert_eq!(vivi_png_ref::Error::ContentHashMismatch.as_i32(), 6);
        assert_layout!(ViviPngInfo, 24, 8);
        assert_offset!(ViviPngInfo, struct_size, 0);
        assert_offset!(ViviPngInfo, width, 4);
        assert_offset!(ViviPngInfo, height, 8);
        assert_offset!(ViviPngInfo, _reserved0, 12);
        assert_offset!(ViviPngInfo, required_output_bytes, 16);
        assert_layout!(ViviPngLimits, 40, 8);
        assert_offset!(ViviPngLimits, struct_size, 0);
        assert_offset!(ViviPngLimits, max_width, 4);
        assert_offset!(ViviPngLimits, max_height, 8);
        assert_offset!(ViviPngLimits, _reserved0, 12);
        assert_offset!(ViviPngLimits, max_pixels, 16);
        assert_offset!(ViviPngLimits, max_png_input_bytes, 24);
        assert_offset!(ViviPngLimits, max_texture_bytes, 32);
        assert_eq!(vivi_png_ref::PROFILE, "vivi2d.png.rgba8.v1");
        assert_eq!(vivi_png_ref::SHA256_BYTES, 32);
        assert_eq!(vivi_png_ref::MAX_WIDTH, 8_192);
        assert_eq!(vivi_png_ref::MAX_HEIGHT, 8_192);
        assert_eq!(vivi_png_ref::MAX_PIXELS, 67_108_864);
        assert_eq!(vivi_png_ref::MAX_PNG_INPUT_BYTES, 67_108_864);
        assert_eq!(vivi_png_ref::MAX_TEXTURE_BYTES, 268_435_456);
    }

    #[cfg(feature = "png-v1")]
    #[test]
    fn png_pointer_preflight_rejects_invalid_ranges_without_writing() {
        let input = [0_u8; 8];
        let mut info = ViviPngInfo {
            struct_size: size_of::<ViviPngInfo>() as u32,
            width: 11,
            height: 12,
            _reserved0: 13,
            required_output_bytes: 14,
        };
        assert_eq!(
            vivi_png_inspect(ptr::null(), 0, 1, 1, &mut info),
            PNG_INVALID_ARGUMENT
        );
        assert_eq!((info.width, info.height, info._reserved0), (11, 12, 13));

        assert_eq!(
            vivi_png_inspect(usize::MAX.wrapping_sub(1) as *const u8, 8, 1, 1, &mut info,),
            PNG_INVALID_ARGUMENT
        );
        assert_eq!(info.required_output_bytes, 14);

        info.struct_size = (size_of::<ViviPngInfo>() - 1) as u32;
        assert_eq!(
            vivi_png_inspect(input.as_ptr(), input.len() as u64, 1, 1, &mut info),
            PNG_INVALID_ARGUMENT
        );
        assert_eq!((info.width, info.height, info._reserved0), (11, 12, 13));

        let mut output = [0xA5_u8; 32];
        assert_eq!(
            vivi_png_decode(
                input.as_ptr(),
                input.len() as u64,
                ptr::null(),
                1,
                1,
                output.as_mut_ptr(),
                output.len() as u64,
            ),
            PNG_INVALID_ARGUMENT
        );
        assert_eq!(output, [0xA5; 32]);
        assert_eq!(png_ffi_boundary(|| panic!("contained")), PNG_LIMIT);
    }

    #[test]
    fn creates_runtime_and_loads_model_without_runtime_lifetime_coupling() {
        let mut create_error = create_error_output();
        let mut runtime: *mut ViviRuntime = ptr::null_mut();
        assert_eq!(
            vivi_runtime_create(ptr::null(), &mut create_error, &mut runtime),
            status::OK
        );
        assert!(!runtime.is_null());
        assert_eq!(create_error.status, status::OK);

        let payload = minimal_static_payload();
        let mut model: *mut ViviModel = ptr::null_mut();
        assert_eq!(
            vivi_model_load(runtime, payload.as_ptr(), payload.len() as u64, &mut model),
            status::OK
        );
        assert!(!model.is_null());

        vivi_runtime_destroy(runtime);

        let mut version = version_output();
        assert_eq!(vivi_model_get_spec_version(model, &mut version), status::OK);
        assert_eq!(version.major, 1);
        assert_eq!(version.minor, 0);
        assert_eq!(version.patch, 0);

        vivi_model_destroy(model);
    }

    #[test]
    fn exposes_static_texture_and_mesh_snapshots() {
        let mut runtime: *mut ViviRuntime = ptr::null_mut();
        assert_eq!(
            vivi_runtime_create(ptr::null(), ptr::null_mut(), &mut runtime),
            status::OK
        );
        let payload = basic_mesh_payload();
        let mut model: *mut ViviModel = ptr::null_mut();
        assert_eq!(
            vivi_model_load(runtime, payload.as_ptr(), payload.len() as u64, &mut model),
            status::OK
        );

        let mut texture_count = 0_u64;
        assert_eq!(
            vivi_model_texture_count(model, &mut texture_count),
            status::OK
        );
        assert_eq!(texture_count, 1);

        let mut texture = texture_snapshot_output();
        assert_eq!(
            vivi_model_texture_snapshot(model, 0, &mut texture),
            status::OK
        );
        assert_eq!(
            unsafe { CStr::from_ptr(texture.id) }.to_str().unwrap(),
            "atlas:0"
        );
        assert_eq!(texture.width, 16);
        assert_eq!(texture.height, 16);
        assert_eq!(
            unsafe { CStr::from_ptr(texture.host_image_id) }
                .to_str()
                .unwrap(),
            "host-atlas-0"
        );

        let mut mesh_count = 0_u64;
        assert_eq!(vivi_model_mesh_count(model, &mut mesh_count), status::OK);
        assert_eq!(mesh_count, 1);

        let mut parameter_count = 0_u64;
        assert_eq!(
            vivi_model_parameter_count(model, &mut parameter_count),
            status::OK
        );
        assert_eq!(parameter_count, 1);
        let mut parameter = parameter_info_output();
        assert_eq!(
            vivi_model_parameter_info(model, 0, &mut parameter),
            status::OK
        );
        assert_eq!(
            unsafe { CStr::from_ptr(parameter.id) }.to_str().unwrap(),
            "vivi.head.yaw"
        );
        assert_eq!(parameter.current_value, 0.0);
        let parameter_id = CString::new("vivi.head.yaw").unwrap();
        assert_eq!(
            vivi_model_set_input(model, parameter_id.as_ptr(), 2.0),
            status::OK
        );
        let mut current_value = 0.0;
        assert_eq!(
            vivi_model_get_input(model, parameter_id.as_ptr(), &mut current_value),
            status::OK
        );
        assert_eq!(current_value, 1.0);
        assert_eq!(
            vivi_model_set_input(model, ptr::null(), 0.0),
            status::INVALID_ARGUMENT
        );
        let parameter_error =
            unsafe { CStr::from_ptr(vivi_model_last_error_message(model)) }.to_string_lossy();
        assert!(parameter_error.contains("set_input"));

        let mut mesh = mesh_snapshot_output();
        assert_eq!(vivi_model_mesh_snapshot(model, 0, &mut mesh), status::OK);
        assert_eq!(
            unsafe { CStr::from_ptr(mesh.id) }.to_str().unwrap(),
            "mesh-body"
        );
        assert_eq!(
            unsafe { CStr::from_ptr(mesh.texture_id) }.to_str().unwrap(),
            "atlas:0"
        );
        assert_eq!(mesh.draw_order, 10);
        assert_eq!(mesh.x, 0.0);
        assert_eq!(mesh.y, 0.0);
        assert_eq!(mesh.blend_mode, 0);
        assert_eq!(mesh.has_multiply_color, 1);
        assert_eq!(mesh.multiply_color, [1.0, 0.5, 0.25, 1.0]);
        assert_eq!(mesh.vertex_float_count, 6);
        assert_eq!(
            unsafe { std::slice::from_raw_parts(mesh.vertices, mesh.vertex_float_count as usize) },
            &[0.0, 0.0, 10.0, 0.0, 0.0, 10.0]
        );
        assert_eq!(mesh.index_count, 3);
        assert_eq!(
            unsafe { std::slice::from_raw_parts(mesh.indices, mesh.index_count as usize) },
            &[0, 1, 2]
        );

        let mut mesh_by_id = mesh_snapshot_output();
        let mesh_id = CString::new("mesh-body").unwrap();
        assert_eq!(
            vivi_model_mesh_snapshot_by_id(model, mesh_id.as_ptr(), &mut mesh_by_id),
            status::OK
        );
        assert_eq!(
            unsafe { CStr::from_ptr(mesh_by_id.texture_id) }
                .to_str()
                .unwrap(),
            "atlas:0"
        );

        vivi_model_destroy(model);
        vivi_runtime_destroy(runtime);
    }

    #[test]
    fn c_abi_exposes_nonzero_mesh_translation() {
        let mut runtime: *mut ViviRuntime = ptr::null_mut();
        assert_eq!(
            vivi_runtime_create(ptr::null(), ptr::null_mut(), &mut runtime),
            status::OK
        );
        let payload = translated_mesh_payload();
        let mut model: *mut ViviModel = ptr::null_mut();
        assert_eq!(
            vivi_model_load(runtime, payload.as_ptr(), payload.len() as u64, &mut model),
            status::OK
        );

        let mut mesh = mesh_snapshot_output();
        assert_eq!(vivi_model_mesh_snapshot(model, 0, &mut mesh), status::OK);
        assert_eq!(
            unsafe { CStr::from_ptr(mesh.id) }.to_str().unwrap(),
            "mesh-translated"
        );
        assert_eq!(mesh.x, 3.0);
        assert_eq!(mesh.y, 4.0);

        vivi_model_destroy(model);
        vivi_runtime_destroy(runtime);
    }

    #[cfg(not(feature = "abi-v02"))]
    #[test]
    fn abi_v01_ignores_mask_metadata_and_keeps_legacy_mesh_api_available() {
        assert_eq!(vivi_get_abi_version(), 1);
        let (runtime, model) = load_test_model(masked_mesh_payload());

        let mut mesh_count = 0_u64;
        assert_eq!(vivi_model_mesh_count(model, &mut mesh_count), status::OK);
        assert_eq!(mesh_count, 2);
        let mut snapshot = mesh_snapshot_output();
        assert_eq!(
            vivi_model_mesh_snapshot(model, 0, &mut snapshot),
            status::OK
        );
        assert_eq!(
            unsafe { CStr::from_ptr(snapshot.id) }.to_str().unwrap(),
            "target"
        );

        vivi_model_destroy(model);
        vivi_runtime_destroy(runtime);
    }

    #[cfg(feature = "abi-v02")]
    #[test]
    fn abi_v02_version_and_layout_are_frozen() {
        assert_eq!(vivi_get_abi_version(), 2);
        assert_eq!(status::ABI_VERSION, 11);
        assert_eq!(status::DRAW_COMMANDS_INVALID, 12);
        assert_eq!(status::RENDER_FEATURE_REQUIRED, 13);

        assert_layout!(ViviDrawCommandV2, 24, 4);
        assert_offset!(ViviDrawCommandV2, struct_size, 0);
        assert_offset!(ViviDrawCommandV2, command_type, 4);
        assert_offset!(ViviDrawCommandV2, mesh_index, 8);
        assert_offset!(ViviDrawCommandV2, mask_depth, 12);
        assert_offset!(ViviDrawCommandV2, flags, 16);
        assert_offset!(ViviDrawCommandV2, _reserved, 20);

        assert_layout!(ViviGenerations, 24, 8);
        assert_offset!(ViviGenerations, model_generation, 0);
        assert_offset!(ViviGenerations, topology_generation, 8);
        assert_offset!(ViviGenerations, dynamic_generation, 16);
    }

    #[cfg(feature = "abi-v02")]
    #[test]
    fn abi_v02_masked_model_exposes_commands_table_and_fail_closed_legacy_apis() {
        let (runtime, model) = load_test_model(masked_mesh_payload());

        let mut required = u64::MAX;
        assert_eq!(
            vivi_model_required_render_features(model, &mut required),
            status::OK
        );
        assert_eq!(required, RENDER_FEATURE_DRAW_COMMANDS);

        let mut command_count = 0_u64;
        assert_eq!(
            vivi_model_draw_command_count(model, &mut command_count),
            status::OK
        );
        assert_eq!(command_count, 3);
        let mut command_ptr = ptr::null();
        assert_eq!(
            vivi_model_draw_commands(model, &mut command_ptr),
            status::OK
        );
        assert!(!command_ptr.is_null());
        let commands = unsafe { slice::from_raw_parts(command_ptr, command_count as usize) };
        assert_eq!(
            commands,
            &[
                ViviDrawCommandV2 {
                    struct_size: 24,
                    command_type: CoreDrawCommandType::BeginMask as u32,
                    mesh_index: 0,
                    mask_depth: 1,
                    flags: 0,
                    _reserved: 0,
                },
                ViviDrawCommandV2 {
                    struct_size: 24,
                    command_type: CoreDrawCommandType::DrawMesh as u32,
                    mesh_index: 1,
                    mask_depth: 1,
                    flags: 0,
                    _reserved: 0,
                },
                ViviDrawCommandV2 {
                    struct_size: 24,
                    command_type: CoreDrawCommandType::EndMask as u32,
                    mesh_index: 0,
                    mask_depth: 0,
                    flags: 0,
                    _reserved: 0,
                },
            ]
        );

        let mut render_mesh_count = 0_u64;
        assert_eq!(
            vivi_model_render_mesh_count_v2(model, &mut render_mesh_count),
            status::OK
        );
        assert_eq!(render_mesh_count, 2);
        let mut mask_snapshot = mesh_snapshot_output();
        assert_eq!(
            vivi_model_render_mesh_snapshot_v2(model, 0, &mut mask_snapshot),
            status::OK
        );
        assert_eq!(
            unsafe { CStr::from_ptr(mask_snapshot.id) }
                .to_str()
                .unwrap(),
            "mask"
        );
        assert_eq!(mask_snapshot.visible, 0);
        let mut target_snapshot = mesh_snapshot_output();
        assert_eq!(
            vivi_model_render_mesh_snapshot_v2(model, 1, &mut target_snapshot),
            status::OK
        );
        assert_eq!(
            unsafe { CStr::from_ptr(target_snapshot.id) }
                .to_str()
                .unwrap(),
            "target"
        );

        let mut generations = ViviGenerations {
            model_generation: 0,
            topology_generation: 0,
            dynamic_generation: u64::MAX,
        };
        assert_eq!(vivi_model_generations(model, &mut generations), status::OK);
        assert_eq!(
            generations,
            ViviGenerations {
                model_generation: 1,
                topology_generation: 1,
                dynamic_generation: 0,
            }
        );

        let mut legacy_count = 99_u64;
        assert_eq!(
            vivi_model_mesh_count(model, &mut legacy_count),
            status::RENDER_FEATURE_REQUIRED
        );
        assert_eq!(legacy_count, 99);
        let mut legacy_snapshot = mesh_snapshot_output();
        assert_eq!(
            vivi_model_mesh_snapshot(model, 0, &mut legacy_snapshot),
            status::RENDER_FEATURE_REQUIRED
        );
        let target_id = CString::new("target").unwrap();
        assert_eq!(
            vivi_model_mesh_snapshot_by_id(model, target_id.as_ptr(), &mut legacy_snapshot),
            status::RENDER_FEATURE_REQUIRED
        );
        let message =
            unsafe { CStr::from_ptr(vivi_model_last_error_message(model)) }.to_string_lossy();
        assert!(message.contains("draw commands"));

        vivi_model_destroy(model);
        vivi_runtime_destroy(runtime);
    }

    #[cfg(feature = "abi-v02")]
    #[test]
    fn abi_v02_public_loader_rejects_editor_only_clip_masks_wire_shape() {
        let mut runtime: *mut ViviRuntime = ptr::null_mut();
        assert_eq!(
            vivi_runtime_create(ptr::null(), ptr::null_mut(), &mut runtime),
            status::OK
        );
        let payload = editor_clip_masks_payload();
        let mut model: *mut ViviModel = ptr::null_mut();
        assert_eq!(
            vivi_model_load(runtime, payload.as_ptr(), payload.len() as u64, &mut model),
            status::DRAW_COMMANDS_INVALID
        );
        assert!(model.is_null());
        let message =
            unsafe { CStr::from_ptr(vivi_runtime_last_error_message(runtime)) }.to_string_lossy();
        assert!(message.contains("clipMasks"));

        vivi_runtime_destroy(runtime);
    }

    #[cfg(feature = "abi-v02")]
    #[test]
    fn abi_v02_generations_change_only_after_successful_operations() {
        let (runtime, model) = load_test_model(basic_mesh_payload());
        let mut generations = ViviGenerations {
            model_generation: 0,
            topology_generation: 0,
            dynamic_generation: 0,
        };
        assert_eq!(vivi_model_generations(model, &mut generations), status::OK);
        assert_eq!(generations.dynamic_generation, 0);

        assert_eq!(vivi_model_update(model, f64::NAN), status::INVALID_ARGUMENT);
        assert_eq!(vivi_model_generations(model, &mut generations), status::OK);
        assert_eq!(generations.dynamic_generation, 0);

        assert_eq!(vivi_model_update(model, 1.0 / 60.0), status::OK);
        assert_eq!(vivi_model_generations(model, &mut generations), status::OK);
        assert_eq!(generations.dynamic_generation, 1);
        assert_eq!(generations.topology_generation, 1);

        vivi_model_destroy(model);
        vivi_runtime_destroy(runtime);
    }

    #[cfg(feature = "abi-v02")]
    #[test]
    fn abi_v02_public_model_generation_is_runtime_local_and_success_only() {
        let mut runtime: *mut ViviRuntime = ptr::null_mut();
        assert_eq!(
            vivi_runtime_create(ptr::null(), ptr::null_mut(), &mut runtime),
            status::OK
        );
        let invalid_payload = b"{";
        let mut failed_model: *mut ViviModel = ptr::null_mut();
        assert_ne!(
            vivi_model_load(
                runtime,
                invalid_payload.as_ptr(),
                invalid_payload.len() as u64,
                &mut failed_model,
            ),
            status::OK
        );
        assert!(failed_model.is_null());

        let payload = minimal_static_payload();
        let mut first_model: *mut ViviModel = ptr::null_mut();
        let mut second_model: *mut ViviModel = ptr::null_mut();
        assert_eq!(
            vivi_model_load(
                runtime,
                payload.as_ptr(),
                payload.len() as u64,
                &mut first_model
            ),
            status::OK
        );
        assert_eq!(
            vivi_model_load(
                runtime,
                payload.as_ptr(),
                payload.len() as u64,
                &mut second_model,
            ),
            status::OK
        );
        let mut first = ViviGenerations {
            model_generation: 0,
            topology_generation: 0,
            dynamic_generation: 0,
        };
        let mut second = first;
        assert_eq!(vivi_model_generations(first_model, &mut first), status::OK);
        assert_eq!(
            vivi_model_generations(second_model, &mut second),
            status::OK
        );
        assert_eq!(first.model_generation, 1);
        assert_eq!(second.model_generation, 2);

        let mut other_runtime: *mut ViviRuntime = ptr::null_mut();
        assert_eq!(
            vivi_runtime_create(ptr::null(), ptr::null_mut(), &mut other_runtime),
            status::OK
        );
        let mut other_model: *mut ViviModel = ptr::null_mut();
        assert_eq!(
            vivi_model_load(
                other_runtime,
                payload.as_ptr(),
                payload.len() as u64,
                &mut other_model,
            ),
            status::OK
        );
        let mut other = first;
        assert_eq!(vivi_model_generations(other_model, &mut other), status::OK);
        assert_eq!(other.model_generation, 1);

        vivi_model_destroy(first_model);
        vivi_model_destroy(second_model);
        vivi_model_destroy(other_model);
        vivi_runtime_destroy(runtime);
        vivi_runtime_destroy(other_runtime);
    }

    #[cfg(feature = "abi-v02")]
    #[test]
    fn abi_v02_model_generation_overflow_fails_without_publishing_a_model() {
        let mut runtime: *mut ViviRuntime = ptr::null_mut();
        assert_eq!(
            vivi_runtime_create(ptr::null(), ptr::null_mut(), &mut runtime),
            status::OK
        );
        unsafe {
            (*runtime).public_model_generation = u64::MAX;
        }
        let payload = minimal_static_payload();
        let mut model: *mut ViviModel = ptr::NonNull::dangling().as_ptr();
        assert_eq!(
            vivi_model_load(runtime, payload.as_ptr(), payload.len() as u64, &mut model),
            status::INTERNAL
        );
        assert!(model.is_null());
        assert_eq!(unsafe { (*runtime).public_model_generation }, u64::MAX);
        let message =
            unsafe { CStr::from_ptr(vivi_runtime_last_error_message(runtime)) }.to_string_lossy();
        assert!(message.contains("generation overflow"));
        vivi_runtime_destroy(runtime);
    }

    #[cfg(feature = "abi-v02")]
    #[test]
    fn abi_v02_validates_new_api_outputs_and_keeps_unmasked_legacy_behavior() {
        let (runtime, model) = load_test_model(basic_mesh_payload());

        let mut required = u64::MAX;
        assert_eq!(
            vivi_model_required_render_features(model, &mut required),
            status::OK
        );
        assert_eq!(required, 0);
        let mut legacy_count = 0_u64;
        assert_eq!(vivi_model_mesh_count(model, &mut legacy_count), status::OK);
        assert_eq!(legacy_count, 1);
        let mut legacy_snapshot = mesh_snapshot_output();
        assert_eq!(
            vivi_model_mesh_snapshot(model, 0, &mut legacy_snapshot),
            status::OK
        );

        assert_eq!(
            vivi_model_draw_command_count(ptr::null(), &mut legacy_count),
            status::INVALID_ARGUMENT
        );
        assert_eq!(
            vivi_model_draw_command_count(model, ptr::null_mut()),
            status::INVALID_ARGUMENT
        );
        assert_eq!(
            vivi_model_draw_commands(model, ptr::null_mut()),
            status::INVALID_ARGUMENT
        );
        assert_eq!(
            vivi_model_generations(model, ptr::null_mut()),
            status::INVALID_ARGUMENT
        );
        assert_eq!(
            vivi_model_render_mesh_count_v2(model, ptr::null_mut()),
            status::INVALID_ARGUMENT
        );
        assert_eq!(
            vivi_model_required_render_features(model, ptr::null_mut()),
            status::INVALID_ARGUMENT
        );
        let mut undersized_snapshot = mesh_snapshot_output();
        undersized_snapshot.struct_size -= 1;
        assert_eq!(
            vivi_model_render_mesh_snapshot_v2(model, 0, &mut undersized_snapshot),
            status::INVALID_ARGUMENT
        );
        let mut valid_snapshot = mesh_snapshot_output();
        assert_eq!(
            vivi_model_render_mesh_snapshot_v2(model, u32::MAX, &mut valid_snapshot),
            status::INVALID_ARGUMENT
        );

        vivi_model_destroy(model);
        vivi_runtime_destroy(runtime);
    }

    #[test]
    fn runtime_header_functions_are_exported_safely() {
        let mut runtime: *mut ViviRuntime = ptr::null_mut();
        assert_eq!(
            vivi_runtime_create(ptr::null(), ptr::null_mut(), &mut runtime),
            status::OK
        );
        let payload = basic_mesh_payload();
        let mut model: *mut ViviModel = ptr::null_mut();
        assert_eq!(
            vivi_model_load(runtime, payload.as_ptr(), payload.len() as u64, &mut model),
            status::OK
        );

        assert_eq!(vivi_model_update(model, 1.0 / 60.0), status::OK);
        let clip_id = CString::new("idle").unwrap();
        assert_eq!(
            vivi_model_play_clip(model, clip_id.as_ptr(), 1, 0.0),
            status::UNSUPPORTED_OPERATION
        );
        assert_eq!(
            vivi_model_play_clip(model, clip_id.as_ptr(), 2, 0.0),
            status::INVALID_ARGUMENT
        );
        assert_eq!(vivi_model_stop_clip(model), status::UNSUPPORTED_OPERATION);
        assert_eq!(
            vivi_model_seek_clip(model, 0.5),
            status::UNSUPPORTED_OPERATION
        );

        let machine_id = CString::new("main").unwrap();
        let state_id = CString::new("idle").unwrap();
        assert_eq!(
            vivi_model_set_state_machine_state(model, machine_id.as_ptr(), state_id.as_ptr()),
            status::UNSUPPORTED_OPERATION
        );
        let mut active_state: *const c_char = ptr::null();
        let mut transitioning = 255_u8;
        assert_eq!(
            vivi_model_get_state_machine_state(
                model,
                machine_id.as_ptr(),
                &mut active_state,
                &mut transitioning,
            ),
            status::UNSUPPORTED_OPERATION
        );
        assert!(active_state.is_null());
        assert_eq!(transitioning, 255);
        let unsupported_message =
            unsafe { CStr::from_ptr(vivi_model_last_error_message(model)) }.to_string_lossy();
        assert!(unsupported_message.contains("not implemented"));

        let mut preset_count = 99_u64;
        assert_eq!(
            vivi_model_expression_preset_count(model, &mut preset_count),
            status::OK
        );
        assert_eq!(preset_count, 1);
        let mut preset_info = expression_preset_info_output();
        assert_eq!(
            vivi_model_expression_preset_info(model, 0, &mut preset_info),
            status::OK
        );
        assert_eq!(
            unsafe { CStr::from_ptr(preset_info.id) }.to_str().unwrap(),
            "happy"
        );
        assert_eq!(
            unsafe { CStr::from_ptr(preset_info.name) }
                .to_str()
                .unwrap(),
            "Happy"
        );
        assert_eq!(
            unsafe { CStr::from_ptr(preset_info.color) }
                .to_str()
                .unwrap(),
            "#ffeeaa"
        );
        assert_eq!(
            unsafe { CStr::from_ptr(preset_info.hotkey) }
                .to_str()
                .unwrap(),
            "1"
        );
        assert_eq!(preset_info.parameter_value_count, 2);
        let mut preset_parameter_id: *const c_char = ptr::null();
        let mut preset_value = 1.0;
        assert_eq!(
            vivi_model_expression_preset_value(
                model,
                0,
                0,
                &mut preset_parameter_id,
                &mut preset_value,
            ),
            status::OK
        );
        assert_eq!(
            unsafe { CStr::from_ptr(preset_parameter_id) }
                .to_str()
                .unwrap(),
            "missing.parameter"
        );
        assert_eq!(preset_value, 1.0);
        let preset_id = CString::new("happy").unwrap();
        assert_eq!(
            vivi_model_apply_expression_preset(model, preset_id.as_ptr()),
            status::OK
        );
        let input_id = CString::new("vivi.head.yaw").unwrap();
        let mut input_value = 0.0;
        assert_eq!(
            vivi_model_get_input(model, input_id.as_ptr(), &mut input_value),
            status::OK
        );
        assert_eq!(input_value, 0.75);
        let unknown_preset_id = CString::new("missing").unwrap();
        assert_eq!(
            vivi_model_apply_expression_preset(model, unknown_preset_id.as_ptr()),
            status::INVALID_ARGUMENT
        );

        let mut hit = hit_result_output();
        let mut has_hit = 255_u8;
        assert_eq!(
            vivi_model_hit_test(model, 0.0, 0.0, &mut hit, &mut has_hit),
            status::OK
        );
        assert_eq!(has_hit, 0);
        let mut playback = playback_state_output();
        assert_eq!(
            vivi_model_get_playback_state(model, &mut playback),
            status::OK
        );
        assert_eq!(playback.playing, 0);
        assert_eq!(playback.loop_, 0);
        assert!(playback.clip_id.is_null());

        vivi_model_destroy(model);
        vivi_runtime_destroy(runtime);
    }

    #[test]
    fn hit_result_strings_remain_valid_after_later_hit_tests() {
        let mut runtime: *mut ViviRuntime = ptr::null_mut();
        assert_eq!(
            vivi_runtime_create(ptr::null(), ptr::null_mut(), &mut runtime),
            status::OK
        );
        let payload = hit_test_payload();
        let mut model: *mut ViviModel = ptr::null_mut();
        assert_eq!(
            vivi_model_load(runtime, payload.as_ptr(), payload.len() as u64, &mut model),
            status::OK
        );

        let mut first_hit = hit_result_output();
        let mut first_has_hit = 0_u8;
        assert_eq!(
            vivi_model_hit_test(model, 2.0, 2.0, &mut first_hit, &mut first_has_hit),
            status::OK
        );
        assert_eq!(first_has_hit, 1);
        let first_collider = first_hit.collider_id;
        assert_eq!(
            unsafe { CStr::from_ptr(first_collider) }.to_str().unwrap(),
            "rect-a"
        );

        let mut second_hit = hit_result_output();
        let mut second_has_hit = 0_u8;
        assert_eq!(
            vivi_model_hit_test(model, 22.0, 2.0, &mut second_hit, &mut second_has_hit),
            status::OK
        );
        assert_eq!(second_has_hit, 1);
        assert_eq!(
            unsafe { CStr::from_ptr(second_hit.collider_id) }
                .to_str()
                .unwrap(),
            "rect-b"
        );
        assert_eq!(
            unsafe { CStr::from_ptr(first_collider) }.to_str().unwrap(),
            "rect-a"
        );

        vivi_model_destroy(model);
        vivi_runtime_destroy(runtime);
    }

    #[test]
    fn load_failure_sets_runtime_error_and_null_model() {
        let mut runtime: *mut ViviRuntime = ptr::null_mut();
        assert_eq!(
            vivi_runtime_create(ptr::null(), ptr::null_mut(), &mut runtime),
            status::OK
        );

        let payload = br#"{"profile":"publicProfileV1","version":10,"project":{"blendShapes":[]},"atlases":[]}"#;
        let mut model: *mut ViviModel = ptr::null_mut();
        assert_eq!(
            vivi_model_load(runtime, payload.as_ptr(), payload.len() as u64, &mut model),
            status::PRIVATE_PROFILE
        );
        assert!(model.is_null());
        let message =
            unsafe { CStr::from_ptr(vivi_runtime_last_error_message(runtime)) }.to_string_lossy();
        assert!(message.contains("forbidden public-profile marker"));

        vivi_runtime_destroy(runtime);
    }

    #[test]
    fn c_abi_rejects_nul_id_collisions_without_affecting_an_existing_model() {
        let valid = br#"{"profile":"publicProfileV1","version":10,"project":{"layers":[],"parameters":[{"id":"a\ufffdb","minValue":0,"maxValue":1,"defaultValue":0}]},"atlases":[]}"#;
        let (runtime, previous_model) = load_test_model(valid);
        let payload = br#"{"profile":"publicProfileV1","version":10,"project":{"layers":[],"parameters":[{"id":"a\u0000b","minValue":0,"maxValue":1,"defaultValue":0},{"id":"a\ufffdb","minValue":0,"maxValue":1,"defaultValue":0}]},"atlases":[]}"#;
        // The restriction belongs only to the C string transport, not the core
        // JSON parser, native evaluator, or its sibling WASM binding.
        let parsed = parse_runtime_payload(payload, CoreRuntimeLimits::default()).unwrap();
        let core =
            CoreRuntimeModel::from_payload_with_limits(&parsed, CoreRuntimeLimits::default())
                .unwrap();
        assert_eq!(core.parameters()[0].id, "a\0b");
        assert_eq!(core.parameters()[1].id, "a\u{fffd}b");

        let mut rejected_model = previous_model;
        assert_eq!(
            vivi_model_load(
                runtime,
                payload.as_ptr(),
                payload.len() as u64,
                &mut rejected_model
            ),
            status::VALIDATION
        );
        assert!(rejected_model.is_null());
        let message = unsafe { CStr::from_ptr(vivi_runtime_last_error_message(runtime)) };
        assert_eq!(
            message.to_str().unwrap(),
            "C ABI model strings must not contain NUL"
        );
        let id = CString::new("a\u{fffd}b").unwrap();
        assert_eq!(
            vivi_model_set_input(previous_model, id.as_ptr(), 0.75),
            status::OK
        );
        let mut value = 0.0;
        assert_eq!(
            vivi_model_get_input(previous_model, id.as_ptr(), &mut value),
            status::OK
        );
        assert_eq!(value, 0.75);
        #[cfg(feature = "abi-v02")]
        assert_eq!(unsafe { (*runtime).public_model_generation }, 1);
        vivi_model_destroy(previous_model);
        vivi_runtime_destroy(runtime);
    }

    #[test]
    fn c_abi_rejects_nul_in_mesh_texture_and_hit_strings() {
        let mesh = std::str::from_utf8(basic_mesh_payload()).unwrap();
        let hit = std::str::from_utf8(hit_test_payload()).unwrap();
        for payload in [
            mesh.replace("mesh-body", r"mesh\u0000body"),
            mesh.replace("host-atlas-0", r"host\u0000atlas"),
            hit.replace("rect-a", r"rect\u0000a"),
            r#"{"profile":"publicProfileV1","version":10,"project":{"layers":[],"colliders":[{"id":"hit","enabled":true,"shape":{"type":"mesh","meshId":"mesh\u0000id"}}]},"atlases":[]}"#.to_owned(),
        ] {
            assert_c_abi_string_rejected(payload.as_bytes());
        }
    }

    #[test]
    fn c_abi_rejects_nul_in_preset_metadata_and_value_ids() {
        let preset = r##"{"profile":"publicProfileV1","version":10,"project":{"layers":[],"expressionPresets":[{"id":"preset-id","name":"preset-name","color":"#123456","hotkey":1,"values":{"value-id":0.5}}]},"atlases":[]}"##;
        for field in ["preset-id", "preset-name", "#123456", "value-id"] {
            assert_c_abi_string_rejected(preset.replace(field, r"bad\u0000value").as_bytes());
        }
    }

    #[test]
    fn c_abi_preserves_unicode_strings_without_rejecting_unexposed_json_text() {
        let payload = r##"{"profile":"publicProfileV1","version":10,"project":{"name":"unexposed\u0000name","layers":[],"parameters":[{"id":"入力�😀","minValue":0,"maxValue":1,"defaultValue":0}],"expressionPresets":[{"id":"表情�","name":"笑顔😀","color":"色�","hotkey":1,"values":{"入力�😀":0.5}}]},"atlases":[],"ignored\u0000key":"unexposed\u0000value"}"##;
        let (runtime, model) = load_test_model(payload.as_bytes());
        let mut parameter = parameter_info_output();
        assert_eq!(
            vivi_model_parameter_info(model, 0, &mut parameter),
            status::OK
        );
        let id = unsafe { CStr::from_ptr(parameter.id) };
        assert_eq!(id.to_str().unwrap(), "入力�😀");
        assert_eq!(vivi_model_set_input(model, id.as_ptr(), 0.25), status::OK);
        let mut preset = expression_preset_info_output();
        assert_eq!(
            vivi_model_expression_preset_info(model, 0, &mut preset),
            status::OK
        );
        assert_eq!(
            unsafe { CStr::from_ptr(preset.id) }.to_str().unwrap(),
            "表情�"
        );
        assert_eq!(
            unsafe { CStr::from_ptr(preset.name) }.to_str().unwrap(),
            "笑顔😀"
        );
        assert_eq!(
            unsafe { CStr::from_ptr(preset.color) }.to_str().unwrap(),
            "色�"
        );
        assert_eq!(
            vivi_model_apply_expression_preset(model, preset.id),
            status::OK
        );
        let mut value = 0.0;
        assert_eq!(
            vivi_model_get_input(model, id.as_ptr(), &mut value),
            status::OK
        );
        assert_eq!(value, 0.5);
        vivi_model_destroy(model);
        vivi_runtime_destroy(runtime);
    }

    fn assert_c_abi_string_rejected(payload: &[u8]) {
        let parsed = parse_runtime_payload(payload, CoreRuntimeLimits::default()).unwrap();
        CoreRuntimeModel::from_payload_with_limits(&parsed, CoreRuntimeLimits::default()).unwrap();
        let (runtime, previous_model) = load_test_model(minimal_static_payload());
        let mut model = previous_model;
        assert_eq!(
            vivi_model_load(runtime, payload.as_ptr(), payload.len() as u64, &mut model),
            status::VALIDATION
        );
        assert!(model.is_null());
        let mut version = version_output();
        assert_eq!(
            vivi_model_get_spec_version(previous_model, &mut version),
            status::OK
        );
        vivi_model_destroy(previous_model);
        vivi_runtime_destroy(runtime);
    }

    #[test]
    fn successful_load_does_not_clear_previous_runtime_error() {
        let mut runtime: *mut ViviRuntime = ptr::null_mut();
        assert_eq!(
            vivi_runtime_create(ptr::null(), ptr::null_mut(), &mut runtime),
            status::OK
        );

        let invalid_payload = br#"{"profile":"publicProfileV1","version":10,"project":{"blendShapes":[]},"atlases":[]}"#;
        let mut model: *mut ViviModel = ptr::null_mut();
        assert_eq!(
            vivi_model_load(
                runtime,
                invalid_payload.as_ptr(),
                invalid_payload.len() as u64,
                &mut model
            ),
            status::PRIVATE_PROFILE
        );

        let valid_payload = minimal_static_payload();
        assert_eq!(
            vivi_model_load(
                runtime,
                valid_payload.as_ptr(),
                valid_payload.len() as u64,
                &mut model
            ),
            status::OK
        );
        let message =
            unsafe { CStr::from_ptr(vivi_runtime_last_error_message(runtime)) }.to_string_lossy();
        assert!(message.contains("forbidden public-profile marker"));

        vivi_model_destroy(model);
        vivi_runtime_destroy(runtime);
    }

    #[test]
    fn model_get_spec_version_failure_sets_model_error() {
        let mut runtime: *mut ViviRuntime = ptr::null_mut();
        assert_eq!(
            vivi_runtime_create(ptr::null(), ptr::null_mut(), &mut runtime),
            status::OK
        );
        let payload = minimal_static_payload();
        let mut model: *mut ViviModel = ptr::null_mut();
        assert_eq!(
            vivi_model_load(runtime, payload.as_ptr(), payload.len() as u64, &mut model),
            status::OK
        );

        let mut invalid_version = ViviVersion {
            struct_size: size_of::<u32>() as u32,
            major: 0,
            minor: 0,
            patch: 0,
        };
        assert_eq!(
            vivi_model_get_spec_version(model, &mut invalid_version),
            status::INVALID_ARGUMENT
        );
        let message =
            unsafe { CStr::from_ptr(vivi_model_last_error_message(model)) }.to_string_lossy();
        assert!(message.contains("model spec version"));

        vivi_model_destroy(model);
        vivi_runtime_destroy(runtime);
    }

    #[test]
    fn runtime_limits_are_applied_during_model_load() {
        let mut limits = zero_limits();
        limits.struct_size = size_of::<ViviRuntimeLimits>() as u32;
        limits.max_payload_bytes = 0;
        let mut runtime: *mut ViviRuntime = ptr::null_mut();
        assert_eq!(
            vivi_runtime_create(&limits, ptr::null_mut(), &mut runtime),
            status::OK
        );

        let payload = minimal_static_payload();
        let mut model: *mut ViviModel = ptr::null_mut();
        assert_eq!(
            vivi_model_load(runtime, payload.as_ptr(), payload.len() as u64, &mut model),
            status::LIMIT_EXCEEDED
        );
        assert!(model.is_null());
        vivi_runtime_destroy(runtime);
    }

    #[test]
    fn model_load_rejects_lengths_that_cannot_form_a_rust_slice() {
        let mut runtime: *mut ViviRuntime = ptr::null_mut();
        assert_eq!(
            vivi_runtime_create(ptr::null(), ptr::null_mut(), &mut runtime),
            status::OK
        );

        let mut model: *mut ViviModel = ptr::null_mut();
        assert_eq!(
            vivi_model_load(
                runtime,
                ptr::NonNull::<u8>::dangling().as_ptr(),
                isize::MAX as u64 + 1,
                &mut model,
            ),
            status::INVALID_ARGUMENT
        );
        assert!(model.is_null());
        vivi_runtime_destroy(runtime);
    }

    #[test]
    fn create_rejects_invalid_reserved_limit_fields() {
        let mut limits = zero_limits();
        limits.struct_size = (offset_of!(ViviRuntimeLimits, _reserved0) + size_of::<u32>()) as u32;
        limits._reserved0 = 1;

        let mut runtime: *mut ViviRuntime = ptr::null_mut();
        let mut create_error = create_error_output();
        assert_eq!(
            vivi_runtime_create(&limits, &mut create_error, &mut runtime),
            status::INVALID_ARGUMENT
        );
        assert!(runtime.is_null());
        assert_eq!(create_error.status, status::INVALID_ARGUMENT);
    }

    #[test]
    fn ffi_layout_matches_vivi_runtime_header() {
        assert_layout!(ViviVersion, 16, 4);
        assert_offset!(ViviVersion, struct_size, 0);
        assert_offset!(ViviVersion, major, 4);
        assert_offset!(ViviVersion, minor, 8);
        assert_offset!(ViviVersion, patch, 12);

        assert_layout!(ViviRuntimeLimits, 88, 8);
        assert_offset!(ViviRuntimeLimits, struct_size, 0);
        assert_offset!(ViviRuntimeLimits, _reserved0, 4);
        assert_offset!(ViviRuntimeLimits, max_payload_bytes, 8);
        assert_offset!(ViviRuntimeLimits, max_texture_bytes, 16);
        assert_offset!(ViviRuntimeLimits, max_transitions_per_state_machine, 84);

        assert_layout!(ViviCreateError, 264, 4);
        assert_offset!(ViviCreateError, struct_size, 0);
        assert_offset!(ViviCreateError, status, 4);
        assert_offset!(ViviCreateError, message, 8);

        assert_layout!(ViviTextureSnapshot, 64, 8);
        assert_offset!(ViviTextureSnapshot, id, 8);
        assert_offset!(ViviTextureSnapshot, pixels, 32);
        assert_offset!(ViviTextureSnapshot, host_image_id, 56);

        assert_layout!(ViviParameterInfo, 48, 8);
        assert_offset!(ViviParameterInfo, current_value, 40);

        assert_layout!(ViviHitResult, 48, 8);
        assert_offset!(ViviHitResult, collider_id, 8);
        assert_offset!(ViviHitResult, x, 32);

        assert_layout!(ViviPlaybackState, 24, 8);
        assert_offset!(ViviPlaybackState, loop_, 5);
        assert_offset!(ViviPlaybackState, clip_id, 8);

        assert_layout!(ViviExpressionPresetInfo, 48, 8);
        assert_offset!(ViviExpressionPresetInfo, parameter_value_count, 40);

        assert_layout!(ViviMeshSnapshot, 128, 8);
        assert_offset!(ViviMeshSnapshot, vertices, 24);
        assert_offset!(ViviMeshSnapshot, indices, 56);
        assert_offset!(ViviMeshSnapshot, x, 72);
        assert_offset!(ViviMeshSnapshot, y, 76);
        assert_offset!(ViviMeshSnapshot, opacity, 80);
        assert_offset!(ViviMeshSnapshot, screen_color, 112);
    }

    fn version_output() -> ViviVersion {
        ViviVersion {
            struct_size: size_of::<ViviVersion>() as u32,
            major: 0,
            minor: 0,
            patch: 0,
        }
    }

    fn create_error_output() -> ViviCreateError {
        ViviCreateError {
            struct_size: size_of::<ViviCreateError>() as u32,
            status: status::OK,
            message: [0 as c_char; 256],
        }
    }

    fn zero_limits() -> ViviRuntimeLimits {
        ViviRuntimeLimits {
            struct_size: size_of::<ViviRuntimeLimits>() as u32,
            _reserved0: 0,
            max_payload_bytes: 0,
            max_texture_bytes: 0,
            max_textures: 0,
            max_layers: 0,
            max_meshes: 0,
            max_vertices_per_mesh: 0,
            max_indices_per_mesh: 0,
            max_bones: 0,
            max_ik_controllers: 0,
            max_physics_groups: 0,
            max_pendulums_per_physics_group: 0,
            max_parameters: 0,
            max_binding_points: 0,
            max_colliders: 0,
            max_animation_clips: 0,
            max_state_machines: 0,
            max_states_per_state_machine: 0,
            max_transitions_per_state_machine: 0,
        }
    }

    fn texture_snapshot_output() -> ViviTextureSnapshot {
        ViviTextureSnapshot {
            struct_size: size_of::<ViviTextureSnapshot>() as u32,
            _reserved0: 0,
            id: ptr::null(),
            width: 0,
            height: 0,
            pixel_format: 0,
            color_space: 0,
            pixels: ptr::null(),
            pixel_byte_len: 0,
            row_stride: 0,
            host_image_id: ptr::null(),
        }
    }

    fn parameter_info_output() -> ViviParameterInfo {
        ViviParameterInfo {
            struct_size: size_of::<ViviParameterInfo>() as u32,
            _reserved0: 0,
            id: ptr::null(),
            min: 0.0,
            max: 0.0,
            default_value: 0.0,
            current_value: 0.0,
        }
    }

    fn mesh_snapshot_output() -> ViviMeshSnapshot {
        ViviMeshSnapshot {
            struct_size: size_of::<ViviMeshSnapshot>() as u32,
            _reserved0: 0,
            id: ptr::null(),
            texture_id: ptr::null(),
            vertices: ptr::null(),
            vertex_float_count: 0,
            uvs: ptr::null(),
            uv_float_count: 0,
            indices: ptr::null(),
            index_count: 0,
            x: 0.0,
            y: 0.0,
            opacity: 0.0,
            draw_order: 0,
            blend_mode: 0,
            visible: 0,
            culled: 0,
            has_multiply_color: 0,
            has_screen_color: 0,
            multiply_color: [0.0; 4],
            screen_color: [0.0; 4],
        }
    }

    fn hit_result_output() -> ViviHitResult {
        ViviHitResult {
            struct_size: size_of::<ViviHitResult>() as u32,
            _reserved0: 0,
            collider_id: ptr::null(),
            layer_id: ptr::null(),
            mesh_id: ptr::null(),
            x: 0.0,
            y: 0.0,
        }
    }

    fn playback_state_output() -> ViviPlaybackState {
        ViviPlaybackState {
            struct_size: size_of::<ViviPlaybackState>() as u32,
            playing: 0,
            loop_: 0,
            _reserved0: [0; 2],
            clip_id: ptr::null(),
            time_seconds: 0.0,
        }
    }

    fn expression_preset_info_output() -> ViviExpressionPresetInfo {
        ViviExpressionPresetInfo {
            struct_size: size_of::<ViviExpressionPresetInfo>() as u32,
            _reserved0: 0,
            id: ptr::null(),
            name: ptr::null(),
            color: ptr::null(),
            hotkey: ptr::null(),
            parameter_value_count: 0,
        }
    }

    fn load_test_model(payload: &[u8]) -> (*mut ViviRuntime, *mut ViviModel) {
        let mut runtime: *mut ViviRuntime = ptr::null_mut();
        assert_eq!(
            vivi_runtime_create(ptr::null(), ptr::null_mut(), &mut runtime),
            status::OK
        );
        let mut model: *mut ViviModel = ptr::null_mut();
        assert_eq!(
            vivi_model_load(runtime, payload.as_ptr(), payload.len() as u64, &mut model),
            status::OK
        );
        assert!(!model.is_null());
        (runtime, model)
    }

    fn minimal_static_payload() -> &'static [u8] {
        br#"{"profile":"publicProfileV1","version":10,"project":{"layers":[]},"atlases":[]}"#
    }

    fn masked_mesh_payload() -> &'static [u8] {
        br##"{
          "version":10,
          "profile":"publicProfileV1",
          "atlases":[{
            "image":"host-atlas-0",
            "width":16,
            "height":16,
            "entries":[
              {"layerId":"mask","x":0,"y":0,"width":10,"height":10},
              {"layerId":"target","x":0,"y":0,"width":10,"height":10}
            ]
          }],
          "project":{
            "name":"runtime-mask-fixture",
            "width":64,
            "height":64,
            "layers":[
              {
                "id":"mask",
                "name":"Mask",
                "visible":false,
                "opacity":0.25,
                "x":0,
                "y":0,
                "width":10,
                "height":10,
                "blendMode":"normal",
                "expanded":true,
                "kind":"viviMesh",
                "children":[],
                "drawOrder":20,
                "mesh":{"vertices":[0,0,10,0,0,10],"uvs":[0,0,1,0,0,1],"indices":[0,1,2],"divisionsX":1,"divisionsY":1}
              },
              {
                "id":"target",
                "name":"Target",
                "visible":true,
                "opacity":1,
                "x":0,
                "y":0,
                "width":10,
                "height":10,
                "blendMode":"normal",
                "expanded":true,
                "kind":"viviMesh",
                "children":[],
                "drawOrder":10,
                "clipMaskIds":["mask"],
                "mesh":{"vertices":[0,0,10,0,0,10],"uvs":[0,0,1,0,0,1],"indices":[0,1,2],"divisionsX":1,"divisionsY":1}
              }
            ],
            "parameters":[],
            "clips":[],
            "scenes":[],
            "physicsGroups":[],
            "lipsyncConfig":{"enabled":false,"targetParameterId":null,"source":"microphone","threshold":0.02,"smoothing":0.7,"gain":2},
            "skins":{},
            "colliders":[],
            "stateMachines":[],
            "expressionPresets":[]
          }
        }"##
    }

    #[cfg(feature = "abi-v02")]
    fn editor_clip_masks_payload() -> Vec<u8> {
        std::str::from_utf8(masked_mesh_payload())
            .unwrap()
            .replace(
                "\"clipMaskIds\":[\"mask\"]",
                "\"clipMasks\":[{\"layerId\":\"mask\",\"invert\":true}]",
            )
            .into_bytes()
    }

    fn basic_mesh_payload() -> &'static [u8] {
        br##"{
          "version":10,
          "profile":"publicProfileV1",
          "atlases":[{"image":"host-atlas-0","width":16,"height":16,"entries":[{"layerId":"mesh-body","x":0,"y":0,"width":10,"height":10}]}],
          "project":{
            "name":"runtime-fixture",
            "width":64,
            "height":64,
            "layers":[{
              "id":"mesh-body",
              "name":"Body",
              "visible":true,
              "opacity":1,
              "x":0,
              "y":0,
              "width":10,
              "height":10,
              "blendMode":"normal",
              "multiplyColor":{"r":1,"g":0.5,"b":0.25},
              "expanded":true,
              "kind":"viviMesh",
              "children":[],
              "drawOrder":10,
              "mesh":{"vertices":[0,0,10,0,0,10],"uvs":[0,0,1,0,0,1],"indices":[0,1,2],"divisionsX":1,"divisionsY":1}
            }],
            "parameters":[{"id":"vivi.head.yaw","name":"Head Yaw","minValue":-1,"maxValue":1,"defaultValue":0}],
            "clips":[],
            "scenes":[],
            "physicsGroups":[],
            "lipsyncConfig":{"enabled":false,"targetParameterId":null,"source":"microphone","threshold":0.02,"smoothing":0.7,"gain":2},
            "skins":{},
            "colliders":[],
            "stateMachines":[],
            "expressionPresets":[{"id":"happy","name":"Happy","color":"#ffeeaa","hotkey":1,"values":{"vivi.head.yaw":0.75,"missing.parameter":1}}]
          }
        }"##
    }

    fn translated_mesh_payload() -> &'static [u8] {
        br##"{
          "version":10,
          "profile":"publicProfileV1",
          "atlases":[{"image":"host-atlas-0","width":16,"height":16,"entries":[{"layerId":"mesh-translated","x":0,"y":0,"width":10,"height":10}]}],
          "project":{
            "name":"translated-runtime-fixture",
            "width":64,
            "height":64,
            "layers":[{
              "id":"mesh-translated",
              "name":"Translated Mesh",
              "visible":true,
              "opacity":1,
              "x":3,
              "y":4,
              "width":10,
              "height":10,
              "blendMode":"normal",
              "expanded":true,
              "kind":"viviMesh",
              "children":[],
              "drawOrder":5,
              "mesh":{"vertices":[0,0,10,0,0,10],"uvs":[0,0,1,0,0,1],"indices":[0,1,2],"divisionsX":1,"divisionsY":1}
            }],
            "parameters":[],
            "clips":[],
            "scenes":[],
            "physicsGroups":[],
            "lipsyncConfig":{"enabled":false,"targetParameterId":null,"source":"microphone","threshold":0.02,"smoothing":0.7,"gain":2},
            "skins":{},
            "colliders":[],
            "stateMachines":[],
            "expressionPresets":[]
          }
        }"##
    }

    fn hit_test_payload() -> &'static [u8] {
        br##"{
          "version":10,
          "profile":"publicProfileV1",
          "atlases":[{"image":"host-atlas-0","width":16,"height":16,"entries":[{"layerId":"mesh-body","x":0,"y":0,"width":10,"height":10}]}],
          "project":{
            "name":"runtime-hit-fixture",
            "width":64,
            "height":64,
            "layers":[{
              "id":"mesh-body",
              "name":"Body",
              "visible":true,
              "opacity":1,
              "x":0,
              "y":0,
              "width":10,
              "height":10,
              "blendMode":"normal",
              "expanded":true,
              "kind":"viviMesh",
              "children":[],
              "drawOrder":10,
              "mesh":{"vertices":[0,0,10,0,0,10],"uvs":[0,0,1,0,0,1],"indices":[0,1,2],"divisionsX":1,"divisionsY":1}
            }],
            "parameters":[],
            "clips":[],
            "scenes":[],
            "physicsGroups":[],
            "lipsyncConfig":{"enabled":false,"targetParameterId":null,"source":"microphone","threshold":0.02,"smoothing":0.7,"gain":2},
            "skins":{},
            "colliders":[
              {"id":"rect-a","name":"Rect A","enabled":true,"shape":{"type":"rectangle","x":0,"y":0,"width":10,"height":10}},
              {"id":"rect-b","name":"Rect B","enabled":true,"shape":{"type":"rectangle","x":20,"y":0,"width":10,"height":10}}
            ],
            "stateMachines":[]
          }
        }"##
    }
}
