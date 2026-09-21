//! Thin opt-in Evaluation ABI symbols; all fixed admission/copy logic has one source owner.

mod bridge;

/// Length-delimited native input; this new ABI does not require a NUL terminator.
#[repr(C)]
pub struct ViviEvaluationBytesV2 {
    /// Immutable caller-owned bytes for the duration of this call.
    pub data: *const u8,
    /// Exact length, checked before conversion to the target address size.
    pub len: u64,
}

/// Separate internal Evaluation ABI; legacy ABI bytes and query remain unchanged.
#[unsafe(no_mangle)]
pub extern "C" fn vivi_evaluation_abi_version() -> u32 {
    2
}

/// Fixed create operation; caller owns live ranges and handle confinement.
///
/// # Safety
/// Native buffers/handles must be live, nonaliasing with runtime storage and confined to their creating thread.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_evaluation_create(output: usize) -> i32 {
    bridge::status(|| unsafe { bridge::create(output) })
}

/// Fixed destroy operation; caller owns live ranges and handle confinement.
///
/// # Safety
/// Native buffers/handles must be live, nonaliasing with runtime storage and confined to their creating thread.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_evaluation_destroy(runtime: usize) {
    unsafe {
        bridge::destroy(runtime as *mut bridge::Runtime);
    }
}

/// Fixed prepared destroy operation; caller owns live ranges and handle confinement.
///
/// # Safety
/// Native buffers/handles must be live, nonaliasing with runtime storage and confined to their creating thread.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_evaluation_prepared_destroy(prepared: usize) {
    unsafe {
        bridge::prepared_destroy(prepared as *mut bridge::Prepared);
    }
}

/// Fixed observe request state operation; caller owns live ranges and handle confinement.
///
/// # Safety
/// Native buffers/handles must be live, nonaliasing with runtime storage and confined to their creating thread.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_evaluation_observe_request_state(
    runtime: usize,
    state: usize,
) -> i32 {
    bridge::status(|| unsafe { bridge::observe(runtime as *mut bridge::Runtime, state) })
}

/// Fixed prepare operation; caller owns live ranges and handle confinement.
///
/// # Safety
/// Native buffers/handles must be live, nonaliasing with runtime storage and confined to their creating thread.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_evaluation_prepare(
    runtime: usize,
    descriptor: usize,
    output: usize,
    info: usize,
) -> i32 {
    bridge::status(|| unsafe {
        bridge::prepare(runtime as *mut bridge::Runtime, descriptor, output, info)
    })
}

/// Fixed retry missing operation; caller owns live ranges and handle confinement.
///
/// # Safety
/// Native buffers/handles must be live, nonaliasing with runtime storage and confined to their creating thread.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_evaluation_retry_missing(
    runtime: usize,
    inout: usize,
    objects: usize,
    count: u64,
    info: usize,
) -> i32 {
    bridge::status(|| unsafe {
        bridge::retry(runtime as *mut bridge::Runtime, inout, objects, count, info)
    })
}

/// Fixed commit operation; caller owns live ranges and handle confinement.
///
/// # Safety
/// Native buffers/handles must be live, nonaliasing with runtime storage and confined to their creating thread.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_evaluation_commit(
    runtime: usize,
    inout: usize,
    activated: usize,
) -> i32 {
    bridge::status(|| unsafe { bridge::commit(runtime as *mut bridge::Runtime, inout, activated) })
}

/// Fixed set input operation; caller owns live ranges and handle confinement.
///
/// # Safety
/// Native buffers/handles must be live, nonaliasing with runtime storage and confined to their creating thread.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_evaluation_set_input(
    runtime: usize,
    id: ViviEvaluationBytesV2,
    value: f64,
) -> i32 {
    bridge::status(|| unsafe {
        bridge::mutate(
            runtime as *mut bridge::Runtime,
            id.data as usize,
            id.len,
            value,
            0,
        )
    })
}

/// Fixed apply expression preset operation; caller owns live ranges and handle confinement.
///
/// # Safety
/// Native buffers/handles must be live, nonaliasing with runtime storage and confined to their creating thread.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_evaluation_apply_expression_preset(
    runtime: usize,
    id: ViviEvaluationBytesV2,
) -> i32 {
    bridge::status(|| unsafe {
        bridge::mutate(
            runtime as *mut bridge::Runtime,
            id.data as usize,
            id.len,
            0.0,
            1,
        )
    })
}

/// Fixed update operation; caller owns live ranges and handle confinement.
///
/// # Safety
/// Native buffers/handles must be live, nonaliasing with runtime storage and confined to their creating thread.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_evaluation_update(runtime: usize, delta: f64) -> i32 {
    bridge::status(|| unsafe { bridge::mutate(runtime as *mut bridge::Runtime, 0, 0, delta, 2) })
}

/// Fixed get generations operation; caller owns live ranges and handle confinement.
///
/// # Safety
/// Native buffers/handles must be live, nonaliasing with runtime storage and confined to their creating thread.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_evaluation_get_generations(runtime: usize, output: usize) -> i32 {
    bridge::status(|| unsafe { bridge::generations(runtime as *mut bridge::Runtime, output) })
}

/// Fixed get render mesh count operation; caller owns live ranges and handle confinement.
///
/// # Safety
/// Native buffers/handles must be live, nonaliasing with runtime storage and confined to their creating thread.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_evaluation_get_render_mesh_count(
    handle: usize,
    output: usize,
) -> i32 {
    bridge::status(|| unsafe { bridge::count(handle, false, 0, output) })
}

/// Fixed get texture count operation; caller owns live ranges and handle confinement.
///
/// # Safety
/// Native buffers/handles must be live, nonaliasing with runtime storage and confined to their creating thread.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_evaluation_get_texture_count(handle: usize, output: usize) -> i32 {
    bridge::status(|| unsafe { bridge::count(handle, false, 1, output) })
}

/// Fixed get draw command count operation; caller owns live ranges and handle confinement.
///
/// # Safety
/// Native buffers/handles must be live, nonaliasing with runtime storage and confined to their creating thread.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_evaluation_get_draw_command_count(
    handle: usize,
    output: usize,
) -> i32 {
    bridge::status(|| unsafe { bridge::count(handle, false, 2, output) })
}

/// Fixed get parameter count operation; caller owns live ranges and handle confinement.
///
/// # Safety
/// Native buffers/handles must be live, nonaliasing with runtime storage and confined to their creating thread.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_evaluation_get_parameter_count(handle: usize, output: usize) -> i32 {
    bridge::status(|| unsafe { bridge::count(handle, false, 3, output) })
}

/// Fixed get expression preset count operation; caller owns live ranges and handle confinement.
///
/// # Safety
/// Native buffers/handles must be live, nonaliasing with runtime storage and confined to their creating thread.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_evaluation_get_expression_preset_count(
    handle: usize,
    output: usize,
) -> i32 {
    bridge::status(|| unsafe { bridge::count(handle, false, 4, output) })
}

/// Fixed get required render features operation; caller owns live ranges and handle confinement.
///
/// # Safety
/// Native buffers/handles must be live, nonaliasing with runtime storage and confined to their creating thread.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_evaluation_get_required_render_features(
    handle: usize,
    output: usize,
) -> i32 {
    bridge::status(|| unsafe { bridge::features(handle, false, output) })
}

/// Fixed get render mesh snapshot operation; caller owns live ranges and handle confinement.
///
/// # Safety
/// Native buffers/handles must be live, nonaliasing with runtime storage and confined to their creating thread.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_evaluation_get_render_mesh_snapshot(
    handle: usize,
    slot: u64,
    buffers: usize,
    info: usize,
) -> i32 {
    bridge::status(|| unsafe { bridge::mesh(handle, false, slot, buffers, info) })
}

/// Fixed get texture snapshot operation; caller owns live ranges and handle confinement.
///
/// # Safety
/// Native buffers/handles must be live, nonaliasing with runtime storage and confined to their creating thread.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_evaluation_get_texture_snapshot(
    handle: usize,
    slot: u64,
    buffers: usize,
    info: usize,
) -> i32 {
    bridge::status(|| unsafe { bridge::texture(handle, false, slot, buffers, info) })
}

/// Fixed get parameter snapshot operation; caller owns live ranges and handle confinement.
///
/// # Safety
/// Native buffers/handles must be live, nonaliasing with runtime storage and confined to their creating thread.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_evaluation_get_parameter_snapshot(
    handle: usize,
    slot: u64,
    id_buffer: usize,
    info: usize,
) -> i32 {
    bridge::status(|| unsafe { bridge::parameter(handle, false, slot, id_buffer, info) })
}

/// Fixed get expression preset operation; caller owns live ranges and handle confinement.
///
/// # Safety
/// Native buffers/handles must be live, nonaliasing with runtime storage and confined to their creating thread.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_evaluation_get_expression_preset(
    handle: usize,
    slot: u64,
    id_buffer: usize,
    info: usize,
) -> i32 {
    bridge::status(|| unsafe { bridge::preset(handle, false, slot, id_buffer, info) })
}

/// Fixed get draw command snapshot operation; caller owns live ranges and handle confinement.
///
/// # Safety
/// Native buffers/handles must be live, nonaliasing with runtime storage and confined to their creating thread.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_evaluation_get_draw_command_snapshot(
    handle: usize,
    slot: u64,
    output: usize,
) -> i32 {
    bridge::status(|| unsafe { bridge::command(handle, false, slot, output) })
}

/// Fixed prepared get render mesh count operation; caller owns live ranges and handle confinement.
///
/// # Safety
/// Native buffers/handles must be live, nonaliasing with runtime storage and confined to their creating thread.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_evaluation_prepared_get_render_mesh_count(
    handle: usize,
    output: usize,
) -> i32 {
    bridge::status(|| unsafe { bridge::count(handle, true, 0, output) })
}

/// Fixed prepared get texture count operation; caller owns live ranges and handle confinement.
///
/// # Safety
/// Native buffers/handles must be live, nonaliasing with runtime storage and confined to their creating thread.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_evaluation_prepared_get_texture_count(
    handle: usize,
    output: usize,
) -> i32 {
    bridge::status(|| unsafe { bridge::count(handle, true, 1, output) })
}

/// Fixed prepared get draw command count operation; caller owns live ranges and handle confinement.
///
/// # Safety
/// Native buffers/handles must be live, nonaliasing with runtime storage and confined to their creating thread.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_evaluation_prepared_get_draw_command_count(
    handle: usize,
    output: usize,
) -> i32 {
    bridge::status(|| unsafe { bridge::count(handle, true, 2, output) })
}

/// Fixed prepared get parameter count operation; caller owns live ranges and handle confinement.
///
/// # Safety
/// Native buffers/handles must be live, nonaliasing with runtime storage and confined to their creating thread.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_evaluation_prepared_get_parameter_count(
    handle: usize,
    output: usize,
) -> i32 {
    bridge::status(|| unsafe { bridge::count(handle, true, 3, output) })
}

/// Fixed prepared get expression preset count operation; caller owns live ranges and handle confinement.
///
/// # Safety
/// Native buffers/handles must be live, nonaliasing with runtime storage and confined to their creating thread.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_evaluation_prepared_get_expression_preset_count(
    handle: usize,
    output: usize,
) -> i32 {
    bridge::status(|| unsafe { bridge::count(handle, true, 4, output) })
}

/// Fixed prepared get required render features operation; caller owns live ranges and handle confinement.
///
/// # Safety
/// Native buffers/handles must be live, nonaliasing with runtime storage and confined to their creating thread.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_evaluation_prepared_get_required_render_features(
    handle: usize,
    output: usize,
) -> i32 {
    bridge::status(|| unsafe { bridge::features(handle, true, output) })
}

/// Fixed prepared get render mesh snapshot operation; caller owns live ranges and handle confinement.
///
/// # Safety
/// Native buffers/handles must be live, nonaliasing with runtime storage and confined to their creating thread.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_evaluation_prepared_get_render_mesh_snapshot(
    handle: usize,
    slot: u64,
    buffers: usize,
    info: usize,
) -> i32 {
    bridge::status(|| unsafe { bridge::mesh(handle, true, slot, buffers, info) })
}

/// Fixed prepared get texture snapshot operation; caller owns live ranges and handle confinement.
///
/// # Safety
/// Native buffers/handles must be live, nonaliasing with runtime storage and confined to their creating thread.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_evaluation_prepared_get_texture_snapshot(
    handle: usize,
    slot: u64,
    buffers: usize,
    info: usize,
) -> i32 {
    bridge::status(|| unsafe { bridge::texture(handle, true, slot, buffers, info) })
}

/// Fixed prepared get parameter snapshot operation; caller owns live ranges and handle confinement.
///
/// # Safety
/// Native buffers/handles must be live, nonaliasing with runtime storage and confined to their creating thread.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_evaluation_prepared_get_parameter_snapshot(
    handle: usize,
    slot: u64,
    id_buffer: usize,
    info: usize,
) -> i32 {
    bridge::status(|| unsafe { bridge::parameter(handle, true, slot, id_buffer, info) })
}

/// Fixed prepared get expression preset operation; caller owns live ranges and handle confinement.
///
/// # Safety
/// Native buffers/handles must be live, nonaliasing with runtime storage and confined to their creating thread.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_evaluation_prepared_get_expression_preset(
    handle: usize,
    slot: u64,
    id_buffer: usize,
    info: usize,
) -> i32 {
    bridge::status(|| unsafe { bridge::preset(handle, true, slot, id_buffer, info) })
}

/// Fixed prepared get draw command snapshot operation; caller owns live ranges and handle confinement.
///
/// # Safety
/// Native buffers/handles must be live, nonaliasing with runtime storage and confined to their creating thread.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_evaluation_prepared_get_draw_command_snapshot(
    handle: usize,
    slot: u64,
    output: usize,
) -> i32 {
    bridge::status(|| unsafe { bridge::command(handle, true, slot, output) })
}
