//! Thin opt-in Evaluation ABI symbols; all fixed admission/copy logic has one source owner.

#[path = "../../vivi-runtime-native-c-abi/src/evaluation/bridge.rs"]
mod bridge;

/// Separate internal Evaluation ABI; legacy ABI bytes and query remain unchanged.
#[unsafe(no_mangle)]
pub extern "C" fn vivi_wasm_evaluation_abi_version() -> u32 {
    2
}

/// Fixed create operation; caller owns live ranges and handle confinement.
///
/// # Safety
/// Native buffers/handles must be live, nonaliasing with runtime storage and confined to their creating thread.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_wasm_evaluation_create(output: u32) -> i32 {
    let output = output as usize;
    bridge::status(|| unsafe { bridge::create(output) })
}

/// Fixed destroy operation; caller owns live ranges and handle confinement.
///
/// # Safety
/// Native buffers/handles must be live, nonaliasing with runtime storage and confined to their creating thread.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_wasm_evaluation_destroy(runtime: u32) {
    let runtime = runtime as usize;
    unsafe {
        bridge::destroy(runtime as *mut bridge::Runtime);
    }
}

/// Fixed prepared destroy operation; caller owns live ranges and handle confinement.
///
/// # Safety
/// Native buffers/handles must be live, nonaliasing with runtime storage and confined to their creating thread.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_wasm_evaluation_prepared_destroy(prepared: u32) {
    let prepared = prepared as usize;
    unsafe {
        bridge::prepared_destroy(prepared as *mut bridge::Prepared);
    }
}

/// Fixed observe request state operation; caller owns live ranges and handle confinement.
///
/// # Safety
/// Native buffers/handles must be live, nonaliasing with runtime storage and confined to their creating thread.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_wasm_evaluation_observe_request_state(
    runtime: u32,
    state: u32,
) -> i32 {
    let runtime = runtime as usize;
    let state = state as usize;
    bridge::status(|| unsafe { bridge::observe(runtime as *mut bridge::Runtime, state) })
}

/// Fixed prepare operation; caller owns live ranges and handle confinement.
///
/// # Safety
/// Native buffers/handles must be live, nonaliasing with runtime storage and confined to their creating thread.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_wasm_evaluation_prepare(
    runtime: u32,
    descriptor: u32,
    output: u32,
    info: u32,
) -> i32 {
    let runtime = runtime as usize;
    let descriptor = descriptor as usize;
    let output = output as usize;
    let info = info as usize;
    bridge::status(|| unsafe {
        bridge::prepare(runtime as *mut bridge::Runtime, descriptor, output, info)
    })
}

/// Fixed retry missing operation; caller owns live ranges and handle confinement.
///
/// # Safety
/// Native buffers/handles must be live, nonaliasing with runtime storage and confined to their creating thread.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_wasm_evaluation_retry_missing(
    runtime: u32,
    inout: u32,
    objects: u32,
    count_lo: u32,
    count_hi: u32,
    info: u32,
) -> i32 {
    let runtime = runtime as usize;
    let inout = inout as usize;
    let objects = objects as usize;
    let count = u64::from(count_lo) | (u64::from(count_hi) << 32);
    let info = info as usize;
    bridge::status(|| unsafe {
        bridge::retry(runtime as *mut bridge::Runtime, inout, objects, count, info)
    })
}

/// Fixed commit operation; caller owns live ranges and handle confinement.
///
/// # Safety
/// Native buffers/handles must be live, nonaliasing with runtime storage and confined to their creating thread.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_wasm_evaluation_commit(
    runtime: u32,
    inout: u32,
    activated: u32,
) -> i32 {
    let runtime = runtime as usize;
    let inout = inout as usize;
    let activated = activated as usize;
    bridge::status(|| unsafe { bridge::commit(runtime as *mut bridge::Runtime, inout, activated) })
}

/// Fixed set input operation; caller owns live ranges and handle confinement.
///
/// # Safety
/// Native buffers/handles must be live, nonaliasing with runtime storage and confined to their creating thread.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_wasm_evaluation_set_input(
    runtime: u32,
    id: u32,
    length_lo: u32,
    length_hi: u32,
    value: f64,
) -> i32 {
    let runtime = runtime as usize;
    let id = id as usize;
    let length = u64::from(length_lo) | (u64::from(length_hi) << 32);
    bridge::status(|| unsafe {
        bridge::mutate(runtime as *mut bridge::Runtime, id, length, value, 0)
    })
}

/// Fixed apply expression preset operation; caller owns live ranges and handle confinement.
///
/// # Safety
/// Native buffers/handles must be live, nonaliasing with runtime storage and confined to their creating thread.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_wasm_evaluation_apply_expression_preset(
    runtime: u32,
    id: u32,
    length_lo: u32,
    length_hi: u32,
) -> i32 {
    let runtime = runtime as usize;
    let id = id as usize;
    let length = u64::from(length_lo) | (u64::from(length_hi) << 32);
    bridge::status(|| unsafe {
        bridge::mutate(runtime as *mut bridge::Runtime, id, length, 0.0, 1)
    })
}

/// Fixed update operation; caller owns live ranges and handle confinement.
///
/// # Safety
/// Native buffers/handles must be live, nonaliasing with runtime storage and confined to their creating thread.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_wasm_evaluation_update(runtime: u32, delta: f64) -> i32 {
    let runtime = runtime as usize;
    bridge::status(|| unsafe { bridge::mutate(runtime as *mut bridge::Runtime, 0, 0, delta, 2) })
}

/// Fixed get generations operation; caller owns live ranges and handle confinement.
///
/// # Safety
/// Native buffers/handles must be live, nonaliasing with runtime storage and confined to their creating thread.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_wasm_evaluation_get_generations(runtime: u32, output: u32) -> i32 {
    let runtime = runtime as usize;
    let output = output as usize;
    bridge::status(|| unsafe { bridge::generations(runtime as *mut bridge::Runtime, output) })
}

/// Fixed get render mesh count operation; caller owns live ranges and handle confinement.
///
/// # Safety
/// Native buffers/handles must be live, nonaliasing with runtime storage and confined to their creating thread.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_wasm_evaluation_get_render_mesh_count(
    handle: u32,
    output: u32,
) -> i32 {
    let handle = handle as usize;
    let output = output as usize;
    bridge::status(|| unsafe { bridge::count(handle, false, 0, output) })
}

/// Fixed get texture count operation; caller owns live ranges and handle confinement.
///
/// # Safety
/// Native buffers/handles must be live, nonaliasing with runtime storage and confined to their creating thread.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_wasm_evaluation_get_texture_count(handle: u32, output: u32) -> i32 {
    let handle = handle as usize;
    let output = output as usize;
    bridge::status(|| unsafe { bridge::count(handle, false, 1, output) })
}

/// Fixed get draw command count operation; caller owns live ranges and handle confinement.
///
/// # Safety
/// Native buffers/handles must be live, nonaliasing with runtime storage and confined to their creating thread.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_wasm_evaluation_get_draw_command_count(
    handle: u32,
    output: u32,
) -> i32 {
    let handle = handle as usize;
    let output = output as usize;
    bridge::status(|| unsafe { bridge::count(handle, false, 2, output) })
}

/// Fixed get parameter count operation; caller owns live ranges and handle confinement.
///
/// # Safety
/// Native buffers/handles must be live, nonaliasing with runtime storage and confined to their creating thread.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_wasm_evaluation_get_parameter_count(handle: u32, output: u32) -> i32 {
    let handle = handle as usize;
    let output = output as usize;
    bridge::status(|| unsafe { bridge::count(handle, false, 3, output) })
}

/// Fixed get expression preset count operation; caller owns live ranges and handle confinement.
///
/// # Safety
/// Native buffers/handles must be live, nonaliasing with runtime storage and confined to their creating thread.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_wasm_evaluation_get_expression_preset_count(
    handle: u32,
    output: u32,
) -> i32 {
    let handle = handle as usize;
    let output = output as usize;
    bridge::status(|| unsafe { bridge::count(handle, false, 4, output) })
}

/// Fixed get required render features operation; caller owns live ranges and handle confinement.
///
/// # Safety
/// Native buffers/handles must be live, nonaliasing with runtime storage and confined to their creating thread.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_wasm_evaluation_get_required_render_features(
    handle: u32,
    output: u32,
) -> i32 {
    let handle = handle as usize;
    let output = output as usize;
    bridge::status(|| unsafe { bridge::features(handle, false, output) })
}

/// Fixed get render mesh snapshot operation; caller owns live ranges and handle confinement.
///
/// # Safety
/// Native buffers/handles must be live, nonaliasing with runtime storage and confined to their creating thread.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_wasm_evaluation_get_render_mesh_snapshot(
    handle: u32,
    slot_lo: u32,
    slot_hi: u32,
    buffers: u32,
    info: u32,
) -> i32 {
    let handle = handle as usize;
    let slot = u64::from(slot_lo) | (u64::from(slot_hi) << 32);
    let buffers = buffers as usize;
    let info = info as usize;
    bridge::status(|| unsafe { bridge::mesh(handle, false, slot, buffers, info) })
}

/// Fixed get texture snapshot operation; caller owns live ranges and handle confinement.
///
/// # Safety
/// Native buffers/handles must be live, nonaliasing with runtime storage and confined to their creating thread.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_wasm_evaluation_get_texture_snapshot(
    handle: u32,
    slot_lo: u32,
    slot_hi: u32,
    buffers: u32,
    info: u32,
) -> i32 {
    let handle = handle as usize;
    let slot = u64::from(slot_lo) | (u64::from(slot_hi) << 32);
    let buffers = buffers as usize;
    let info = info as usize;
    bridge::status(|| unsafe { bridge::texture(handle, false, slot, buffers, info) })
}

/// Fixed get parameter snapshot operation; caller owns live ranges and handle confinement.
///
/// # Safety
/// Native buffers/handles must be live, nonaliasing with runtime storage and confined to their creating thread.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_wasm_evaluation_get_parameter_snapshot(
    handle: u32,
    slot_lo: u32,
    slot_hi: u32,
    id_buffer: u32,
    info: u32,
) -> i32 {
    let handle = handle as usize;
    let slot = u64::from(slot_lo) | (u64::from(slot_hi) << 32);
    let id_buffer = id_buffer as usize;
    let info = info as usize;
    bridge::status(|| unsafe { bridge::parameter(handle, false, slot, id_buffer, info) })
}

/// Fixed get expression preset operation; caller owns live ranges and handle confinement.
///
/// # Safety
/// Native buffers/handles must be live, nonaliasing with runtime storage and confined to their creating thread.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_wasm_evaluation_get_expression_preset(
    handle: u32,
    slot_lo: u32,
    slot_hi: u32,
    id_buffer: u32,
    info: u32,
) -> i32 {
    let handle = handle as usize;
    let slot = u64::from(slot_lo) | (u64::from(slot_hi) << 32);
    let id_buffer = id_buffer as usize;
    let info = info as usize;
    bridge::status(|| unsafe { bridge::preset(handle, false, slot, id_buffer, info) })
}

/// Fixed get draw command snapshot operation; caller owns live ranges and handle confinement.
///
/// # Safety
/// Native buffers/handles must be live, nonaliasing with runtime storage and confined to their creating thread.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_wasm_evaluation_get_draw_command_snapshot(
    handle: u32,
    slot_lo: u32,
    slot_hi: u32,
    output: u32,
) -> i32 {
    let handle = handle as usize;
    let slot = u64::from(slot_lo) | (u64::from(slot_hi) << 32);
    let output = output as usize;
    bridge::status(|| unsafe { bridge::command(handle, false, slot, output) })
}

/// Fixed prepared get render mesh count operation; caller owns live ranges and handle confinement.
///
/// # Safety
/// Native buffers/handles must be live, nonaliasing with runtime storage and confined to their creating thread.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_wasm_evaluation_prepared_get_render_mesh_count(
    handle: u32,
    output: u32,
) -> i32 {
    let handle = handle as usize;
    let output = output as usize;
    bridge::status(|| unsafe { bridge::count(handle, true, 0, output) })
}

/// Fixed prepared get texture count operation; caller owns live ranges and handle confinement.
///
/// # Safety
/// Native buffers/handles must be live, nonaliasing with runtime storage and confined to their creating thread.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_wasm_evaluation_prepared_get_texture_count(
    handle: u32,
    output: u32,
) -> i32 {
    let handle = handle as usize;
    let output = output as usize;
    bridge::status(|| unsafe { bridge::count(handle, true, 1, output) })
}

/// Fixed prepared get draw command count operation; caller owns live ranges and handle confinement.
///
/// # Safety
/// Native buffers/handles must be live, nonaliasing with runtime storage and confined to their creating thread.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_wasm_evaluation_prepared_get_draw_command_count(
    handle: u32,
    output: u32,
) -> i32 {
    let handle = handle as usize;
    let output = output as usize;
    bridge::status(|| unsafe { bridge::count(handle, true, 2, output) })
}

/// Fixed prepared get parameter count operation; caller owns live ranges and handle confinement.
///
/// # Safety
/// Native buffers/handles must be live, nonaliasing with runtime storage and confined to their creating thread.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_wasm_evaluation_prepared_get_parameter_count(
    handle: u32,
    output: u32,
) -> i32 {
    let handle = handle as usize;
    let output = output as usize;
    bridge::status(|| unsafe { bridge::count(handle, true, 3, output) })
}

/// Fixed prepared get expression preset count operation; caller owns live ranges and handle confinement.
///
/// # Safety
/// Native buffers/handles must be live, nonaliasing with runtime storage and confined to their creating thread.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_wasm_evaluation_prepared_get_expression_preset_count(
    handle: u32,
    output: u32,
) -> i32 {
    let handle = handle as usize;
    let output = output as usize;
    bridge::status(|| unsafe { bridge::count(handle, true, 4, output) })
}

/// Fixed prepared get required render features operation; caller owns live ranges and handle confinement.
///
/// # Safety
/// Native buffers/handles must be live, nonaliasing with runtime storage and confined to their creating thread.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_wasm_evaluation_prepared_get_required_render_features(
    handle: u32,
    output: u32,
) -> i32 {
    let handle = handle as usize;
    let output = output as usize;
    bridge::status(|| unsafe { bridge::features(handle, true, output) })
}

/// Fixed prepared get render mesh snapshot operation; caller owns live ranges and handle confinement.
///
/// # Safety
/// Native buffers/handles must be live, nonaliasing with runtime storage and confined to their creating thread.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_wasm_evaluation_prepared_get_render_mesh_snapshot(
    handle: u32,
    slot_lo: u32,
    slot_hi: u32,
    buffers: u32,
    info: u32,
) -> i32 {
    let handle = handle as usize;
    let slot = u64::from(slot_lo) | (u64::from(slot_hi) << 32);
    let buffers = buffers as usize;
    let info = info as usize;
    bridge::status(|| unsafe { bridge::mesh(handle, true, slot, buffers, info) })
}

/// Fixed prepared get texture snapshot operation; caller owns live ranges and handle confinement.
///
/// # Safety
/// Native buffers/handles must be live, nonaliasing with runtime storage and confined to their creating thread.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_wasm_evaluation_prepared_get_texture_snapshot(
    handle: u32,
    slot_lo: u32,
    slot_hi: u32,
    buffers: u32,
    info: u32,
) -> i32 {
    let handle = handle as usize;
    let slot = u64::from(slot_lo) | (u64::from(slot_hi) << 32);
    let buffers = buffers as usize;
    let info = info as usize;
    bridge::status(|| unsafe { bridge::texture(handle, true, slot, buffers, info) })
}

/// Fixed prepared get parameter snapshot operation; caller owns live ranges and handle confinement.
///
/// # Safety
/// Native buffers/handles must be live, nonaliasing with runtime storage and confined to their creating thread.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_wasm_evaluation_prepared_get_parameter_snapshot(
    handle: u32,
    slot_lo: u32,
    slot_hi: u32,
    id_buffer: u32,
    info: u32,
) -> i32 {
    let handle = handle as usize;
    let slot = u64::from(slot_lo) | (u64::from(slot_hi) << 32);
    let id_buffer = id_buffer as usize;
    let info = info as usize;
    bridge::status(|| unsafe { bridge::parameter(handle, true, slot, id_buffer, info) })
}

/// Fixed prepared get expression preset operation; caller owns live ranges and handle confinement.
///
/// # Safety
/// Native buffers/handles must be live, nonaliasing with runtime storage and confined to their creating thread.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_wasm_evaluation_prepared_get_expression_preset(
    handle: u32,
    slot_lo: u32,
    slot_hi: u32,
    id_buffer: u32,
    info: u32,
) -> i32 {
    let handle = handle as usize;
    let slot = u64::from(slot_lo) | (u64::from(slot_hi) << 32);
    let id_buffer = id_buffer as usize;
    let info = info as usize;
    bridge::status(|| unsafe { bridge::preset(handle, true, slot, id_buffer, info) })
}

/// Fixed prepared get draw command snapshot operation; caller owns live ranges and handle confinement.
///
/// # Safety
/// Native buffers/handles must be live, nonaliasing with runtime storage and confined to their creating thread.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_wasm_evaluation_prepared_get_draw_command_snapshot(
    handle: u32,
    slot_lo: u32,
    slot_hi: u32,
    output: u32,
) -> i32 {
    let handle = handle as usize;
    let slot = u64::from(slot_lo) | (u64::from(slot_hi) << 32);
    let output = output as usize;
    bridge::status(|| unsafe { bridge::command(handle, true, slot, output) })
}
