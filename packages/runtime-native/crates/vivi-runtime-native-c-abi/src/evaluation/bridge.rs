//! Fixed Evaluation transport shared by the two thin, opt-in symbol adapters.
//!
//! Native callers own pointer validity/thread confinement; wasm32 additionally
//! checks every supplied range against current linear memory. This source is
//! included directly by the WASM crate, not reached through a native host edge.

use std::alloc::{Layout, alloc};
use std::mem::{align_of, size_of};
use std::panic::{AssertUnwindSafe, catch_unwind};
use std::{ptr, slice, str};
use vivi_runtime_native_core::{
    AssetRef, Digest, EvaluationActivationV1, EvaluationPhysicalObjectV1, EvaluationRuntimeV1,
    EvaluationTextureBindingV1, EvaluationTexturePlanV1, PrepareLoweredEvaluationV1,
    PreparedActivationTextureSetV1, SealedEvaluationCandidateV1, StorageKind,
    prepare_evaluation_bytes_v1, retry_evaluation_bytes_v1,
};

type Checked<T> = Result<T, i32>;
const ARG: i32 = 1;
const RESOURCE: i32 = 6;
const INTERNAL: i32 = 10;
const MAX_BYTES: u64 = 64 * 1024 * 1024;
const MAX_REQUEST: u64 = 9_007_199_254_740_991;

pub(super) struct Runtime {
    value: EvaluationRuntimeV1,
    _thread: std::marker::PhantomData<std::rc::Rc<()>>,
}
pub(super) struct Prepared {
    owner: *mut Runtime,
    value: Option<PrepareLoweredEvaluationV1>,
}

#[derive(Clone, Copy)]
struct Range {
    start: usize,
    end: usize,
}
impl Range {
    fn disjoint(self, other: Self) -> Checked<()> {
        if self.start < other.end && other.start < self.end {
            Err(ARG)
        } else {
            Ok(())
        }
    }
}

fn range(address: usize, bytes: u64) -> Checked<Range> {
    let length = usize::try_from(bytes).map_err(|_| ARG)?;
    if length > isize::MAX as usize || (length != 0 && address == 0) {
        return Err(ARG);
    }
    let end = address.checked_add(length).ok_or(ARG)?;
    #[cfg(target_arch = "wasm32")]
    if end
        > core::arch::wasm32::memory_size(0)
            .checked_mul(65536)
            .ok_or(ARG)?
    {
        return Err(ARG);
    }
    Ok(Range {
        start: address,
        end,
    })
}

unsafe fn read<T: Copy>(address: usize) -> Checked<T> {
    range(address, size_of::<T>() as u64)?;
    // SAFETY: range is checked; native allocation validity remains the caller's obligation.
    Ok(unsafe { ptr::read_unaligned(address as *const T) })
}
unsafe fn put<T>(address: usize, value: T) {
    // SAFETY: every caller preflights all destinations before its first write.
    unsafe { ptr::write_unaligned(address as *mut T, value) };
}
unsafe fn u32_at(p: usize, offset: usize) -> Checked<u32> {
    unsafe { read(p + offset) }
}
unsafe fn u64_at(p: usize, offset: usize) -> Checked<u64> {
    unsafe { read(p + offset) }
}
unsafe fn ptr_at(p: usize, offset: usize) -> Checked<usize> {
    unsafe { read(p + offset) }
}
unsafe fn header(p: usize, size: u32) -> Checked<Range> {
    let result = range(p, u64::from(size))?;
    if unsafe { u32_at(p, 0)? } != size || unsafe { u32_at(p, 4)? } != 0 {
        return Err(ARG);
    }
    Ok(result)
}
unsafe fn span(p: usize) -> Checked<Range> {
    unsafe { range(ptr_at(p, 0)?, u64_at(p, 8)?) }
}
unsafe fn bytes<'a>(r: Range) -> &'a [u8] {
    if r.start == r.end {
        &[]
    } else {
        // SAFETY: input memory remains immutable for this call.
        unsafe { slice::from_raw_parts(r.start as *const u8, r.end - r.start) }
    }
}
fn copy_bytes(source: &[u8]) -> Checked<Vec<u8>> {
    let mut owned = Vec::new();
    owned
        .try_reserve_exact(source.len())
        .map_err(|_| RESOURCE)?;
    owned.extend_from_slice(source);
    Ok(owned)
}
fn text(source: &[u8]) -> Checked<String> {
    str::from_utf8(source).map_err(|_| ARG)?;
    String::from_utf8(copy_bytes(source)?).map_err(|_| ARG)
}
fn fixed_text(source: &str) -> Checked<String> {
    text(source.as_bytes())
}
unsafe fn boxed<T>(value: T) -> Checked<*mut T> {
    // SAFETY: nonzero concrete owner layout, checked allocation result.
    let output = unsafe { alloc(Layout::new::<T>()) }.cast::<T>();
    if output.is_null() {
        return Err(RESOURCE);
    }
    unsafe { ptr::write(output, value) };
    Ok(output)
}
unsafe fn runtime<'a>(p: *mut Runtime) -> Checked<&'a mut Runtime> {
    range(p as usize, size_of::<Runtime>() as u64)?;
    if p as usize % align_of::<Runtime>() != 0 {
        return Err(ARG);
    }
    // SAFETY: opaque live, creating-thread-confined handle required by the adapter contract.
    Ok(unsafe { &mut *p })
}
unsafe fn prepared<'a>(p: *mut Prepared) -> Checked<&'a mut Prepared> {
    range(p as usize, size_of::<Prepared>() as u64)?;
    if p as usize % align_of::<Prepared>() != 0 {
        return Err(ARG);
    }
    Ok(unsafe { &mut *p })
}

pub(super) fn status(action: impl FnOnce() -> Checked<()>) -> i32 {
    match catch_unwind(AssertUnwindSafe(action)) {
        Ok(Ok(())) => 0,
        Ok(Err(s)) => s,
        Err(_) => INTERNAL,
    }
}
pub(super) unsafe fn create(output: usize) -> Checked<()> {
    range(output, size_of::<usize>() as u64)?;
    unsafe { put(output, 0_usize) };
    let value = unsafe {
        boxed(Runtime {
            value: EvaluationRuntimeV1::new(),
            _thread: std::marker::PhantomData,
        })?
    };
    unsafe { put(output, value as usize) };
    Ok(())
}
pub(super) unsafe fn destroy(p: *mut Runtime) {
    if !p.is_null() && unsafe { runtime(p) }.is_ok() {
        unsafe { drop(Box::from_raw(p)) };
    }
}
pub(super) unsafe fn prepared_destroy(p: *mut Prepared) {
    if !p.is_null() && unsafe { prepared(p) }.is_ok() {
        unsafe { drop(Box::from_raw(p)) };
    }
}
pub(super) unsafe fn observe(p: *mut Runtime, state: usize) -> Checked<()> {
    range(state, 24)?;
    let size = unsafe { u32_at(state, 0)? };
    let exhausted = unsafe { u32_at(state, 4)? };
    let latest = unsafe { u64_at(state, 8)? };
    if size != 24 || exhausted > 1 || unsafe { u64_at(state, 16)? } != 0 {
        return Err(ARG);
    }
    unsafe { runtime(p)? }
        .value
        .observe_request_state(latest, exhausted == 1)
        .map_err(|e| e.status())
}

unsafe fn objects(p: usize, count: u64) -> Checked<Vec<EvaluationPhysicalObjectV1>> {
    if count > 288 {
        return Err(RESOURCE);
    }
    range(p, count.checked_mul(56).ok_or(ARG)?)?;
    let mut total = 0_u64;
    // Preflight all transport descriptors, ranges and aggregate limits before payload copies.
    for i in 0..count as usize {
        let item = p + i * 56;
        unsafe { header(item, 56)? };
        let content = unsafe { span(item + 40)? };
        total = total
            .checked_add((content.end - content.start) as u64)
            .ok_or(RESOURCE)?;
        if total > MAX_BYTES {
            return Err(RESOURCE);
        }
        let address: [u8; 32] = unsafe { read(item + 8)? };
        for j in 0..i {
            if address == unsafe { read::<[u8; 32]>(p + j * 56 + 8)? } {
                return Err(ARG);
            }
        }
    }
    let mut result = Vec::new();
    result
        .try_reserve_exact(count as usize)
        .map_err(|_| RESOURCE)?;
    for i in 0..count as usize {
        let item = p + i * 56;
        result.push(EvaluationPhysicalObjectV1 {
            object_address: Digest::from_bytes(unsafe { read(item + 8)? }),
            bytes: copy_bytes(unsafe { bytes(span(item + 40)?) })?,
        });
    }
    Ok(result)
}

unsafe fn load(
    p: usize,
) -> Checked<(
    u64,
    Vec<u8>,
    EvaluationTexturePlanV1,
    Vec<EvaluationPhysicalObjectV1>,
)> {
    unsafe { header(p, 64)? };
    let generation = unsafe { u64_at(p, 8)? };
    if generation > MAX_REQUEST {
        return Err(ARG);
    }
    let payload = unsafe { span(p + 16)? };
    if (payload.end - payload.start) as u64 > MAX_BYTES {
        return Err(RESOURCE);
    }
    let textures = unsafe { ptr_at(p, 32)? };
    let count = unsafe { u64_at(p, 40)? };
    if count > 32 {
        return Err(RESOURCE);
    }
    range(textures, count.checked_mul(112).ok_or(ARG)?)?;
    for i in 0..count as usize {
        let t = textures + i * 112;
        range(t, 112)?;
        let kind = unsafe { u32_at(t, 4)? };
        if unsafe { u32_at(t, 0)? } != 112
            || !(1..=2).contains(&kind)
            || unsafe { u32_at(t, 104)? } != 0
            || unsafe { u32_at(t, 108)? } != 0
        {
            return Err(ARG);
        }
        let id = unsafe { span(t + 16)? };
        if id.start == id.end || id.end - id.start > 126 {
            return Err(ARG);
        }
        str::from_utf8(unsafe { bytes(id) }).map_err(|_| ARG)?;
    }
    let physical = unsafe { objects(ptr_at(p, 48)?, u64_at(p, 56)?)? };
    let mut bindings = Vec::new();
    bindings
        .try_reserve_exact(count as usize)
        .map_err(|_| RESOURCE)?;
    for i in 0..count as usize {
        let t = textures + i * 112;
        bindings.push(EvaluationTextureBindingV1 {
            id: text(unsafe { bytes(span(t + 16)?) })?,
            asset: AssetRef {
                object_address: Digest::from_bytes(unsafe { read(t + 40)? }),
                storage_kind: if unsafe { u32_at(t, 4)? } == 1 {
                    StorageKind::Blob
                } else {
                    StorageKind::ChunkManifest
                },
                content_sha256: Digest::from_bytes(unsafe { read(t + 72)? }),
                media_type: fixed_text("image/png")?,
                size_bytes: unsafe { u64_at(t, 32)? },
            },
            width: unsafe { u32_at(t, 8)? },
            height: unsafe { u32_at(t, 12)? },
            media_type: fixed_text("image/png")?,
            color_space: fixed_text("srgb")?,
            alpha_mode: fixed_text("straight")?,
        });
    }
    Ok((
        generation,
        copy_bytes(unsafe { bytes(payload) })?,
        EvaluationTexturePlanV1 {
            schema: fixed_text("vivi2d.evaluationTexturePlan.v1")?,
            textures: bindings,
        },
        physical,
    ))
}
fn info(value: &PrepareLoweredEvaluationV1) -> [u32; 4] {
    match value {
        PrepareLoweredEvaluationV1::Ready(_) => [16, 1, 0, 0],
        PrepareLoweredEvaluationV1::Missing(missing) => [
            16,
            2,
            missing.missing_textures().texture_ids().len() as u32,
            0,
        ],
    }
}
unsafe fn prepare_outputs(output: usize, information: usize) -> Checked<()> {
    let a = range(output, size_of::<usize>() as u64)?;
    let b = range(information, 16)?;
    if unsafe { u32_at(information, 0)? } != 16 || unsafe { u32_at(information, 12)? } != 0 {
        return Err(ARG);
    }
    a.disjoint(b)
}
pub(super) unsafe fn prepare(
    p: *mut Runtime,
    descriptor: usize,
    output: usize,
    information: usize,
) -> Checked<()> {
    unsafe {
        runtime(p)?;
        prepare_outputs(output, information)?;
    }
    let copied = unsafe { load(descriptor) };
    unsafe { put(output, 0_usize) };
    let (generation, payload, plan, objects) = copied?;
    let outcome =
        prepare_evaluation_bytes_v1(generation, &payload, plan, objects).map_err(|e| e.status())?;
    let details = info(&outcome);
    let handle = unsafe {
        boxed(Prepared {
            owner: p,
            value: Some(outcome),
        })?
    };
    unsafe {
        put(output, handle as usize);
        put(information, details);
    }
    Ok(())
}
pub(super) unsafe fn retry(
    p: *mut Runtime,
    inout: usize,
    input: usize,
    count: u64,
    information: usize,
) -> Checked<()> {
    unsafe {
        runtime(p)?;
        prepare_outputs(inout, information)?;
    }
    let child = unsafe { read::<usize>(inout)? } as *mut Prepared;
    let pending = unsafe { prepared(child)? };
    if pending.owner != p || !matches!(pending.value, Some(PrepareLoweredEvaluationV1::Missing(_)))
    {
        return Err(ARG);
    }
    let copied = unsafe { objects(input, count)? };
    let Some(PrepareLoweredEvaluationV1::Missing(missing)) = pending.value.take() else {
        return Err(INTERNAL);
    };
    let result = retry_evaluation_bytes_v1(missing, copied).map_err(|e| e.status());
    match result {
        Ok(value) => {
            let details = info(&value);
            pending.value = Some(value);
            unsafe {
                put(information, details);
            }
            Ok(())
        }
        Err(error) => {
            unsafe {
                put(inout, 0_usize);
                drop(Box::from_raw(child));
            }
            Err(error)
        }
    }
}
pub(super) unsafe fn commit(p: *mut Runtime, inout: usize, activated: usize) -> Checked<()> {
    range(inout, size_of::<usize>() as u64)?.disjoint(range(activated, 4)?)?;
    let owner = unsafe { runtime(p)? };
    let child = unsafe { read::<usize>(inout)? } as *mut Prepared;
    let pending = unsafe { prepared(child)? };
    if pending.owner != p || !matches!(pending.value, Some(PrepareLoweredEvaluationV1::Ready(_))) {
        return Err(ARG);
    }
    let Some(PrepareLoweredEvaluationV1::Ready(ready)) = pending.value.take() else {
        return Err(INTERNAL);
    };
    // No allocation, callback, message formatting or view reacquisition in this publication interval.
    unsafe {
        put(inout, 0_usize);
    }
    let result = owner.value.try_activate(ready).map_err(|e| e.status());
    unsafe {
        drop(Box::from_raw(child));
    }
    let flag = match result? {
        EvaluationActivationV1::Activated { .. } => 1_u32,
        EvaluationActivationV1::Superseded => 0,
    };
    unsafe {
        put(activated, flag);
    }
    Ok(())
}
pub(super) unsafe fn mutate(
    p: *mut Runtime,
    id: usize,
    length: u64,
    value: f64,
    kind: u32,
) -> Checked<()> {
    let owner = unsafe { runtime(p)? };
    if kind == 2 {
        return owner.value.update(value.to_bits()).map_err(|e| e.status());
    }
    if length == 0 || length > 126 {
        return Err(ARG);
    }
    let name = str::from_utf8(unsafe { bytes(range(id, length)?) }).map_err(|_| ARG)?;
    match kind {
        0 => owner.value.set_input(name, value.to_bits()),
        1 => owner.value.apply_preset(name),
        _ => return Err(ARG),
    }
    .map_err(|e| e.status())
}
pub(super) unsafe fn generations(p: *mut Runtime, output: usize) -> Checked<()> {
    range(output, 24)?;
    let generation = unsafe { runtime(p)? }
        .value
        .active()
        .ok_or(ARG)?
        .generations();
    unsafe {
        put(
            output,
            [generation.model, generation.topology, generation.dynamic],
        );
    }
    Ok(())
}

unsafe fn view<'a>(
    handle: usize,
    pending: bool,
) -> Checked<(
    &'a SealedEvaluationCandidateV1,
    &'a PreparedActivationTextureSetV1,
)> {
    if pending {
        let handle = unsafe { prepared(handle as *mut Prepared)? };
        let Some(PrepareLoweredEvaluationV1::Ready(ready)) = handle.value.as_ref() else {
            return Err(ARG);
        };
        Ok((ready.candidate(), ready.prepared_textures()))
    } else {
        let active = unsafe { runtime(handle as *mut Runtime)? }
            .value
            .active()
            .ok_or(ARG)?;
        Ok((active.candidate(), active.prepared_textures()))
    }
}
pub(super) unsafe fn count(handle: usize, pending: bool, kind: u32, output: usize) -> Checked<()> {
    range(output, 8)?;
    let (candidate, textures) = unsafe { view(handle, pending)? };
    let count = match kind {
        0 => candidate.mesh_count(),
        1 => textures.textures().len(),
        2 => candidate.draw_commands().len(),
        3 => candidate.parameter_count(),
        4 => candidate.preset_count(),
        _ => return Err(ARG),
    };
    unsafe {
        put(output, count as u64);
    }
    Ok(())
}
pub(super) unsafe fn features(handle: usize, pending: bool, output: usize) -> Checked<()> {
    range(output, 4)?;
    let value = unsafe { view(handle, pending)? }
        .0
        .required_render_features();
    unsafe {
        put(output, value);
    }
    Ok(())
}
pub(super) unsafe fn command(
    handle: usize,
    pending: bool,
    slot: u64,
    output: usize,
) -> Checked<()> {
    range(output, 24)?;
    if unsafe { u32_at(output, 0)? } != 24 || unsafe { u32_at(output, 20)? } != 0 {
        return Err(ARG);
    }
    let candidate = unsafe { view(handle, pending)? }.0;
    let slot = usize::try_from(slot).map_err(|_| ARG)?;
    let value = candidate.draw_commands().nth(slot).ok_or(ARG)?;
    unsafe {
        put(output, value);
    }
    Ok(())
}

unsafe fn destination(p: usize, required: usize) -> Checked<Range> {
    let capacity = unsafe { u64_at(p, 8)? };
    if capacity < required as u64 {
        return Err(RESOURCE);
    }
    // Check the declared range too, not just the prefix that will be written.
    let address = unsafe { ptr_at(p, 0)? };
    range(address, capacity)?;
    range(address, required as u64)
}
unsafe fn write_bytes(destination: Range, source: &[u8]) {
    if !source.is_empty() {
        unsafe {
            ptr::copy_nonoverlapping(source.as_ptr(), destination.start as *mut u8, source.len());
        }
    }
}
unsafe fn write_words(destination: Range, source: impl Iterator<Item = u32>) {
    for (i, word) in source.enumerate() {
        unsafe {
            put(destination.start + i * 4, word.to_le());
        }
    }
}
fn independent(ranges: &[Range]) -> Checked<()> {
    for i in 0..ranges.len() {
        for j in 0..i {
            ranges[i].disjoint(ranges[j])?;
        }
    }
    Ok(())
}
pub(super) unsafe fn mesh(
    handle: usize,
    pending: bool,
    slot: u64,
    buffers: usize,
    information: usize,
) -> Checked<()> {
    let metadata = range(information, 96)?;
    if unsafe { u32_at(information, 0)? } != 96
        || unsafe { u32_at(information, 88)? } != 0
        || unsafe { u32_at(information, 92)? } != 0
    {
        return Err(ARG);
    }
    let candidate = unsafe { view(handle, pending)? }.0;
    let snapshot = candidate
        .mesh_snapshot(usize::try_from(slot).map_err(|_| ARG)?)
        .map_err(|e| e.load_status())?
        .ok_or(ARG)?;
    let id = snapshot.id().as_bytes();
    let vertices = snapshot.vertex_bits().len();
    let uvs = snapshot.uv_bits().len();
    let indices = snapshot.indices().len();
    let mut destinations = None;
    if buffers != 0 {
        let descriptor = unsafe { header(buffers, 72)? };
        let a = unsafe { destination(buffers + 8, id.len())? };
        let b = unsafe { destination(buffers + 24, vertices.checked_mul(4).ok_or(INTERNAL)?)? };
        let c = unsafe { destination(buffers + 40, uvs.checked_mul(4).ok_or(INTERNAL)?)? };
        let d = unsafe { destination(buffers + 56, indices.checked_mul(4).ok_or(INTERNAL)?)? };
        independent(&[metadata, descriptor, a, b, c, d])?;
        destinations = Some([a, b, c, d]);
    }
    let flags = u32::from(snapshot.visible())
        | (u32::from(snapshot.culled()) << 1)
        | (u32::from(snapshot.multiply_bits().is_some()) << 2)
        | (u32::from(snapshot.screen_bits().is_some()) << 3);
    let translation = snapshot.translation_bits();
    let multiply = snapshot.multiply_bits().unwrap_or([0; 3]);
    let screen = snapshot.screen_bits().unwrap_or([0; 3]);
    if let Some([a, b, c, d]) = destinations {
        unsafe {
            write_bytes(a, id);
            write_words(b, snapshot.vertex_bits());
            write_words(c, snapshot.uv_bits());
            write_words(d, snapshot.indices());
        }
    }
    unsafe {
        put(
            information,
            [96, snapshot.mesh_slot(), snapshot.texture_slot(), flags],
        );
        put(
            information + 16,
            [id.len() as u64, vertices as u64, uvs as u64, indices as u64],
        );
        put(
            information + 48,
            [
                translation[0],
                translation[1],
                snapshot.opacity_bits(),
                snapshot.blend(),
                multiply[0],
                multiply[1],
                multiply[2],
                screen[0],
                screen[1],
                screen[2],
                0,
                0,
            ],
        );
    }
    Ok(())
}
pub(super) unsafe fn texture(
    handle: usize,
    pending: bool,
    slot: u64,
    buffers: usize,
    information: usize,
) -> Checked<()> {
    let metadata = range(information, 48)?;
    if unsafe { u32_at(information, 0)? } != 48 {
        return Err(ARG);
    }
    let textures = unsafe { view(handle, pending)? }.1;
    let texture = textures
        .textures()
        .get(usize::try_from(slot).map_err(|_| ARG)?)
        .ok_or(ARG)?;
    let id = texture.id().as_bytes();
    let decoded = texture.ready_png().decoded();
    let mut destinations = None;
    if buffers != 0 {
        let descriptor = unsafe { header(buffers, 40)? };
        let a = unsafe { destination(buffers + 8, id.len())? };
        let b = unsafe { destination(buffers + 24, decoded.rgba.len())? };
        independent(&[metadata, descriptor, a, b])?;
        destinations = Some([a, b]);
    }
    if let Some([a, b]) = destinations {
        unsafe {
            write_bytes(a, id);
            write_bytes(b, &decoded.rgba);
        }
    }
    unsafe {
        put(
            information,
            [
                48,
                slot as u32,
                decoded.info.width,
                decoded.info.height,
                1,
                1,
            ],
        );
        put(
            information + 24,
            [
                id.len() as u64,
                decoded.rgba.len() as u64,
                u64::from(decoded.info.width) * 4,
            ],
        );
    }
    Ok(())
}
pub(super) unsafe fn parameter(
    handle: usize,
    pending: bool,
    slot: u64,
    id_buffer: usize,
    information: usize,
) -> Checked<()> {
    let metadata = unsafe { header(information, 56)? };
    let candidate = unsafe { view(handle, pending)? }.0;
    let value = candidate
        .parameter_snapshot(usize::try_from(slot).map_err(|_| ARG)?)
        .map_err(|e| e.load_status())?
        .ok_or(ARG)?;
    let id = value.id().as_bytes();
    if id_buffer != 0 {
        let descriptor = range(id_buffer, 16)?;
        let target = unsafe { destination(id_buffer, id.len())? };
        independent(&[metadata, descriptor, target])?;
        unsafe {
            write_bytes(target, id);
        }
    }
    unsafe {
        put(information, [56_u32, 0]);
        put(
            information + 8,
            [
                id.len() as u64,
                value.min_bits(),
                value.max_bits(),
                value.default_bits(),
                value.current_bits(),
                value.evaluated_bits(),
            ],
        );
    }
    Ok(())
}
pub(super) unsafe fn preset(
    handle: usize,
    pending: bool,
    slot: u64,
    id_buffer: usize,
    output: usize,
) -> Checked<()> {
    let metadata = range(output, 8)?;
    let candidate = unsafe { view(handle, pending)? }.0;
    let id = candidate
        .preset_id(usize::try_from(slot).map_err(|_| ARG)?)
        .map_err(|e| e.load_status())?
        .ok_or(ARG)?
        .as_bytes();
    if id_buffer != 0 {
        let descriptor = range(id_buffer, 16)?;
        let target = unsafe { destination(id_buffer, id.len())? };
        independent(&[metadata, descriptor, target])?;
        unsafe {
            write_bytes(target, id);
        }
    }
    unsafe {
        put(output, id.len() as u64);
    }
    Ok(())
}

#[cfg(test)]
#[path = "bridge/tests.rs"]
mod tests;
