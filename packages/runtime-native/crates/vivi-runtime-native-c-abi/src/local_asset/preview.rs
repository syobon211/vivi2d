//! Captured-data-only additive native preview bridge. The real host owns all
//! resolution and PNG validation; this module only admits/copies owned output.

use super::*;
use vivi_asset_host_local::{PngClosureExportV1, PngClosureObjectV1, VerifiedPngV1};

#[cfg(test)]
mod tests;

const MAX_OBJECTS: usize = 9;
const MAX_BYTES: u64 = 68_157_440;

/// Opaque owned captured data, never a host, principal, or store handle.
#[repr(C)]
pub struct ViviLocalAssetCaptureV1 {
    private: [u8; 0],
}

/// Fixed captured-object count and aggregate physical-byte length.
#[repr(C)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ViviLocalAssetCaptureInfoV1 {
    struct_size: u32,
    object_count: u32,
    total_bytes: u64,
}

/// Fixed physical-object address and full byte length; never a borrowed pointer.
#[repr(C)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ViviLocalAssetObjectInfoV1 {
    struct_size: u32,
    reserved: u32,
    address: [u8; 32],
    byte_length: u64,
}

const _: () = {
    assert!(size_of::<ViviLocalAssetCaptureInfoV1>() == 16);
    assert!(align_of::<ViviLocalAssetCaptureInfoV1>() == 8);
    assert!(offset_of!(ViviLocalAssetCaptureInfoV1, struct_size) == 0);
    assert!(offset_of!(ViviLocalAssetCaptureInfoV1, object_count) == 4);
    assert!(offset_of!(ViviLocalAssetCaptureInfoV1, total_bytes) == 8);
    assert!(size_of::<ViviLocalAssetObjectInfoV1>() == 48);
    assert!(align_of::<ViviLocalAssetObjectInfoV1>() == 8);
    assert!(offset_of!(ViviLocalAssetObjectInfoV1, struct_size) == 0);
    assert!(offset_of!(ViviLocalAssetObjectInfoV1, reserved) == 4);
    assert!(offset_of!(ViviLocalAssetObjectInfoV1, address) == 8);
    assert!(offset_of!(ViviLocalAssetObjectInfoV1, byte_length) == 40);
};

impl ViviLocalAssetCaptureInfoV1 {
    const fn empty() -> Self {
        Self {
            struct_size: 16,
            object_count: 0,
            total_bytes: 0,
        }
    }
}

#[derive(Clone, Copy)]
struct Range {
    start: usize,
    end: usize,
}

fn range(p: *const u8, length: u64) -> Result<Range, i32> {
    let length = usize::try_from(length).map_err(|_| INVALID)?;
    if p.is_null() || length > isize::MAX as usize {
        return Err(INVALID);
    }
    Ok(Range {
        start: p.addr(),
        end: p.addr().checked_add(length).ok_or(INVALID)?,
    })
}

fn typed_range<T>(p: *const T) -> Result<Range, i32> {
    if !aligned(p) {
        return Err(INVALID);
    }
    range(p.cast(), size_of::<T>() as u64)
}

fn disjoint(a: Range, b: Range) -> bool {
    a.end <= b.start || b.end <= a.start
}

fn separate(ranges: &[Range]) -> Result<(), i32> {
    for (index, &a) in ranges.iter().enumerate() {
        if ranges[..index].iter().any(|&b| !disjoint(a, b)) {
            return Err(INVALID);
        }
    }
    Ok(())
}

unsafe fn admit_export(
    ep: *const ViviLocalAssetEndpointV1,
    input: *const ViviLocalAssetRefV1,
    cancel: *mut ViviLocalAssetCancelV1,
    out: *mut ViviLocalAssetResultV1,
    info: *mut ViviLocalAssetCaptureInfoV1,
    capture: *mut *mut ViviLocalAssetCaptureV1,
) -> Result<(), i32> {
    let fixed = [
        typed_range(out)?,
        typed_range(info)?,
        typed_range(capture)?,
        typed_range(ep)?,
        typed_range(input)?,
        typed_range(cancel.cast::<AtomicBool>())?,
    ];
    separate(&fixed)?;
    if unsafe { (*out).struct_size } != 264 || unsafe { (*info).struct_size } != 16 {
        return Err(INVALID);
    }
    let e = unsafe { *ep };
    if !(1..=131_068).contains(&e.path.length) || !(1..=4096).contains(&e.principal.length) {
        return Err(INVALID);
    }
    let path = range(e.path.data, e.path.length)?;
    let principal = range(e.principal.data, e.principal.length)?;
    separate(&[
        fixed[0], fixed[1], fixed[2], fixed[3], fixed[4], fixed[5], path, principal,
    ])
}

/// Exports through the real host and returns only an owned physical capture.
/// # Safety
/// All ranges obey the live/aligned/nonoverlapping header contract, and the
/// caller holds its own cancellation reference until synchronous return.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_local_asset_export_closure_v1(
    ep: *const ViviLocalAssetEndpointV1,
    input: *const ViviLocalAssetRefV1,
    width: u32,
    height: u32,
    cancel: *mut ViviLocalAssetCancelV1,
    out: *mut ViviLocalAssetResultV1,
    info: *mut ViviLocalAssetCaptureInfoV1,
    out_capture: *mut *mut ViviLocalAssetCaptureV1,
) -> i32 {
    if let Err(code) = unsafe { admit_export(ep, input, cancel, out, info, out_capture) } {
        return code;
    }
    unsafe {
        info.write(ViviLocalAssetCaptureInfoV1::empty());
        out_capture.write(ptr::null_mut());
    }
    let mut captured = None;
    let mut candidate_info = ViviLocalAssetCaptureInfoV1::empty();
    let code = unsafe {
        operation(out, cancel, |flag, result, _| {
            let (path, principal) = endpoint(ep)?;
            let reference = reference(input)?;
            result.stage = 1;
            if flag.load(Ordering::Acquire) {
                result.outcome = CANCELLED;
                return Ok(());
            }
            result.stage = 2;
            let closure = {
                let host = match LocalAssetHost::open(path, principal) {
                    Ok(host) => host,
                    Err(error) => {
                        result.host_error(error, false);
                        return Ok(());
                    }
                };
                result.stage = 3;
                match host.export_png_closure(&reference, width, height, flag) {
                    Ok(ExportPngClosureV1::Ready(closure)) => closure,
                    Ok(ExportPngClosureV1::Missing) => {
                        result.outcome = MISSING;
                        return Ok(());
                    }
                    Err(error) => {
                        result.transfer_error(error);
                        return Ok(());
                    }
                }
            }; // No connection or principal is retained by the owned capture.
            if closure.objects().is_empty() || closure.objects().len() > MAX_OBJECTS {
                return Err(RESOURCE);
            }
            let total_bytes = closure.objects().iter().try_fold(0_u64, |n, object| {
                n.checked_add(object.bytes().len() as u64)
                    .filter(|n| *n <= MAX_BYTES)
                    .ok_or(RESOURCE)
            })?;
            result.ready(
                VerifiedAtlasAssetV1 {
                    asset: closure.reference().clone(),
                    png: VerifiedPngV1 {
                        profile: "vivi2d.png.rgba8.v1",
                        width: closure.width(),
                        height: closure.height(),
                    },
                },
                false,
            );
            if result.outcome == READY {
                candidate_info = ViviLocalAssetCaptureInfoV1 {
                    struct_size: 16,
                    object_count: closure.objects().len() as u32,
                    total_bytes,
                };
                captured = Some(Box::new(closure));
                #[cfg(test)]
                tests::panic_after_capture_if_requested();
            }
            Ok(())
        })
    };
    // Publication is infallible and follows all host work/allocation. Any caught
    // panic/error instead drops the still-owned candidate with empty outputs.
    if let (0, READY, Some(closure)) = (code, unsafe { (*out).outcome }, captured) {
        unsafe {
            info.write(candidate_info);
            out_capture.write(Box::into_raw(closure).cast());
        }
    }
    code
}

fn outside_capture(closure: &PngClosureExportV1, output: Range) -> Result<(), i32> {
    if !disjoint(typed_range(ptr::from_ref(closure))?, output)
        || !disjoint(
            range(
                closure.objects().as_ptr().cast(),
                std::mem::size_of_val(closure.objects()) as u64,
            )?,
            output,
        )
    {
        return Err(INVALID);
    }
    for object in closure.objects() {
        if !disjoint(
            range(object.bytes().as_ptr(), object.bytes().len() as u64)?,
            output,
        ) {
            return Err(INVALID);
        }
    }
    // The retained reference owns only a media-type string in addition to the
    // inline fields covered above; it must not alias caller output either.
    let media = &closure.reference().media_type;
    if !disjoint(range(media.as_ptr(), media.len() as u64)?, output) {
        return Err(INVALID);
    }
    Ok(())
}

unsafe fn copy_object(
    capture: *const ViviLocalAssetCaptureV1,
    index: u32,
    info: *mut ViviLocalAssetObjectInfoV1,
    output: *mut u8,
    capacity: u64,
) -> Result<(), i32> {
    let capture_range = typed_range(capture.cast::<PngClosureExportV1>())?;
    let info_range = typed_range(info)?;
    if !disjoint(capture_range, info_range) {
        return Err(INVALID);
    }
    if unsafe { (*info).struct_size } != 48 || unsafe { (*info).reserved } != 0 {
        return Err(INVALID);
    }
    let closure = unsafe { &*capture.cast::<PngClosureExportV1>() };
    let object: &PngClosureObjectV1 = closure.objects().get(index as usize).ok_or(INVALID)?;
    outside_capture(closure, info_range)?;
    let query = output.is_null() && capacity == 0;
    if !query {
        let output_range = range(output, capacity)?;
        if capacity < object.bytes().len() as u64 || !disjoint(info_range, output_range) {
            return Err(INVALID);
        }
        outside_capture(closure, output_range)?;
    }
    let candidate = ViviLocalAssetObjectInfoV1 {
        struct_size: 48,
        reserved: 0,
        address: *object.address().as_bytes(),
        byte_length: object.bytes().len() as u64,
    };
    if !query {
        unsafe {
            ptr::copy_nonoverlapping(object.bytes().as_ptr(), output, object.bytes().len());
        }
    }
    unsafe {
        info.write(candidate);
    } // Metadata commits only after the complete copy.
    Ok(())
}

/// Queries or copies one already-captured object; does not access a store.
/// # Safety
/// The caller owns a live capture and the header's admitted writable ranges.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_local_asset_closure_object_v1(
    capture: *const ViviLocalAssetCaptureV1,
    index: u32,
    info: *mut ViviLocalAssetObjectInfoV1,
    output: *mut u8,
    capacity: u64,
) -> i32 {
    match catch_unwind(AssertUnwindSafe(|| unsafe {
        copy_object(capture, index, info, output, capacity)
    })) {
        Ok(Ok(())) => 0,
        Ok(Err(code)) => code,
        Err(_) => PANIC,
    }
}

/// Consumes one owned capture; null is a no-op. No connection/store cleanup.
/// # Safety
/// A nonnull capture is valid, exclusively owned and has never been destroyed.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_local_asset_closure_destroy_v1(
    capture: *mut ViviLocalAssetCaptureV1,
) {
    if !capture.is_null() {
        let _ = catch_unwind(AssertUnwindSafe(|| unsafe {
            drop(Box::from_raw(capture.cast::<PngClosureExportV1>()));
        }));
    }
}
