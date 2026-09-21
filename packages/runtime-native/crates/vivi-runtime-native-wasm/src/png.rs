//! Opt-in PNG transport, independent of runtime models and LAST_ERROR.

use std::ops::Range;
use std::panic::{AssertUnwindSafe, catch_unwind};
use std::slice;

use vivi_png_ref::{DecodedImage, SHA256_BYTES};

use super::OUTPUT_BYTES;

const PNG_OK: i32 = 0;
const PNG_INVALID_ARGUMENT: i32 = 1;
const PNG_LIMIT: i32 = 4;

/// Return internal PNG transport version 1, not the runtime ABI version.
#[unsafe(no_mangle)]
pub extern "C" fn vivi_wasm_png_abi_version() -> u32 {
    1
}

/// Decode exact uploaded PNG bytes into the shared, decoder-owned output slot.
///
/// The caller must own readable allocations for both input intervals, supplying
/// exactly 32 raw digest bytes. Range checks do not establish that provenance.
/// No runtime/model export may interleave with this private PNG instance's use.
/// The previous output must have been released, including its capacity. Returns
/// only PNG statuses 0..=6; runtime LAST_ERROR is not read or modified.
#[unsafe(no_mangle)]
pub extern "C" fn vivi_wasm_png_decode_rgba8(
    png_ptr: u32,
    png_len: u32,
    digest_ptr: u32,
    digest_len: u32,
    declared_width: u32,
    declared_height: u32,
) -> i32 {
    png_boundary(|| {
        decode_impl(
            png_ptr as usize,
            png_len as usize,
            digest_ptr as usize,
            digest_len as usize,
            declared_width,
            declared_height,
            current_memory_bytes(),
        )
    })
}

/// Return the borrowed PNG output address, or zero while output is empty.
///
/// Read it only after PNG success, and copy before release or any other
/// output-producing export. The private PNG port never calls model exports.
#[unsafe(no_mangle)]
pub extern "C" fn vivi_wasm_png_output_ptr() -> u32 {
    OUTPUT_BYTES.with(|output| {
        let output = output.borrow();
        if output.is_empty() {
            0
        } else {
            output.as_ptr() as u32
        }
    })
}

/// Drop the current output allocation, leaving both length and capacity zero.
///
/// This operation is idempotent; clearing only the length would retain a full
/// image allocation and is not sufficient before starting another decode.
#[unsafe(no_mangle)]
pub extern "C" fn vivi_wasm_png_release_output() {
    OUTPUT_BYTES.with(|output| {
        *output.borrow_mut() = Vec::new();
    });
}

#[cfg(target_arch = "wasm32")]
fn current_memory_bytes() -> u64 {
    (core::arch::wasm32::memory_size::<0>() as u64) * 65_536
}

#[cfg(not(target_arch = "wasm32"))]
fn current_memory_bytes() -> u64 {
    // Host tests use real usize pointers through decode_impl. Native arithmetic
    // checks cannot establish allocation provenance or OS address readability.
    usize::MAX as u64
}

fn checked_input_range(start: usize, len: usize, memory_bytes: u64) -> Option<Range<usize>> {
    if start == 0 || len > isize::MAX as usize {
        return None;
    }
    let end = start.checked_add(len)?;
    if end as u64 > memory_bytes {
        return None;
    }
    Some(start..end)
}

#[allow(clippy::too_many_arguments)]
fn decode_impl(
    png_ptr: usize,
    png_len: usize,
    digest_ptr: usize,
    digest_len: usize,
    declared_width: u32,
    declared_height: u32,
    memory_bytes: u64,
) -> i32 {
    OUTPUT_BYTES.with(|output| {
        let mut output = output.borrow_mut();
        if !output.is_empty() || output.capacity() != 0 || digest_len != SHA256_BYTES {
            return PNG_INVALID_ARGUMENT;
        }
        let Some(png_range) = checked_input_range(png_ptr, png_len, memory_bytes) else {
            return PNG_INVALID_ARGUMENT;
        };
        if checked_input_range(digest_ptr, digest_len, memory_bytes).is_none() {
            return PNG_INVALID_ARGUMENT;
        }
        // Preserve the decoder's limit-before-hash order, without constructing
        // an oversized borrowed slice or allocating another input Vec.
        if png_len as u64 > vivi_png_ref::MAX_PNG_INPUT_BYTES {
            return PNG_LIMIT;
        }
        let mut expected = [0_u8; SHA256_BYTES];
        unsafe {
            // SAFETY: Both complete ranges were checked before any read. On
            // WASM they lie inside current linear memory; the caller must also
            // own the declared readable allocations. The fixed destination is
            // local, and no input/digest borrow survives this synchronous call.
            std::ptr::copy_nonoverlapping(
                digest_ptr as *const u8,
                expected.as_mut_ptr(),
                SHA256_BYTES,
            );
        }
        let input = unsafe {
            // SAFETY: The non-null, non-wrapping, isize-bounded input interval
            // was checked above, including the current WASM memory boundary.
            // The raw allocator caller guarantees provenance and no mutation
            // during decode. A zero-length input still has a non-null block.
            slice::from_raw_parts(png_ptr as *const u8, png_range.len())
        };
        match vivi_png_ref::decode(input, &expected, declared_width, declared_height) {
            Ok(image) => commit_image(&mut output, image, declared_width, declared_height),
            Err(error) => error.status_code(),
        }
    })
}

fn commit_image(output: &mut Vec<u8>, image: DecodedImage, width: u32, height: u32) -> i32 {
    let required = u64::from(width)
        .checked_mul(u64::from(height))
        .and_then(|pixels| pixels.checked_mul(4));
    if image.info.width != width
        || image.info.height != height
        || required == Some(0)
        || required != Some(image.info.required_output_bytes)
        || required != Some(image.rgba.len() as u64)
        || u32::try_from(image.rgba.len()).is_err()
    {
        // An unexpected decoder invariant failure has no PNG INTERNAL code.
        // Fail closed in the same domain as the caught-unwind boundary.
        return PNG_LIMIT;
    }
    *output = image.rgba;
    PNG_OK
}

fn png_boundary(callback: impl FnOnce() -> i32) -> i32 {
    // A caught Rust unwind is PNG4. WASM traps/aborts are not promised to be
    // catchable; the private JS owner discards such an instance.
    catch_unwind(AssertUnwindSafe(callback)).unwrap_or(PNG_LIMIT)
}

#[cfg(test)]
mod tests {
    use super::*;

    // Existing project-embedded-round-trip-v11 manifest, srgb-intent-zero.
    // Exact PNG SHA-256: 0dc262f77871df41d0513b016dc81d3b287aee077370a430c7b64b71f1f9b86e.
    const PNG: &[u8] = &[
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
        0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f,
        0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x01, 0x73, 0x52, 0x47, 0x42, 0x00, 0xae, 0xce, 0x1c,
        0xe9, 0x00, 0x00, 0x00, 0x10, 0x49, 0x44, 0x41, 0x54, 0x78, 0x01, 0x01, 0x05, 0x00, 0xfa,
        0xff, 0x00, 0x12, 0x34, 0x56, 0x00, 0x01, 0x95, 0x00, 0x9d, 0x60, 0x0b, 0xc9, 0x3f, 0x00,
        0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ];
    const DIGEST: [u8; SHA256_BYTES] = [
        0x0d, 0xc2, 0x62, 0xf7, 0x78, 0x71, 0xdf, 0x41, 0xd0, 0x51, 0x3b, 0x01, 0x6d, 0xc8, 0x1d,
        0x3b, 0x28, 0x7a, 0xee, 0x07, 0x73, 0x70, 0xa4, 0x30, 0xc7, 0xb6, 0x4b, 0x71, 0xf1, 0xf9,
        0xb8, 0x6e,
    ];
    const EMPTY_DIGEST: [u8; SHA256_BYTES] = [
        0xe3, 0xb0, 0xc4, 0x42, 0x98, 0xfc, 0x1c, 0x14, 0x9a, 0xfb, 0xf4, 0xc8, 0x99, 0x6f, 0xb9,
        0x24, 0x27, 0xae, 0x41, 0xe4, 0x64, 0x9b, 0x93, 0x4c, 0xa4, 0x95, 0x99, 0x1b, 0x78, 0x52,
        0xb8, 0x55,
    ];

    fn decode_host(bytes: &[u8], digest: &[u8], width: u32, height: u32) -> i32 {
        png_boundary(|| {
            decode_impl(
                bytes.as_ptr() as usize,
                bytes.len(),
                digest.as_ptr() as usize,
                digest.len(),
                width,
                height,
                usize::MAX as u64,
            )
        })
    }

    fn assert_released() {
        OUTPUT_BYTES.with(|output| {
            let output = output.borrow();
            assert_eq!((output.len(), output.capacity()), (0, 0));
        });
        assert_eq!(vivi_wasm_png_output_ptr(), 0);
        assert_eq!(super::super::vivi_wasm_output_len(), 0);
    }

    #[test]
    fn reports_independent_png_transport_and_status_domain() {
        assert_eq!(vivi_wasm_png_abi_version(), 1);
        assert_eq!(vivi_png_ref::Error::Unsupported.status_code(), 2);
        assert_eq!(vivi_png_ref::Error::Malformed.status_code(), 3);
        assert_eq!(vivi_png_ref::Error::Limit.status_code(), 4);
        assert_eq!(vivi_png_ref::Error::Dimension.status_code(), 5);
        assert_eq!(vivi_png_ref::Error::ContentHashMismatch.status_code(), 6);
        assert_eq!(png_boundary(|| panic!("test PNG boundary")), 4);
    }

    #[test]
    fn validates_complete_ranges_before_slice_construction() {
        assert_eq!(checked_input_range(1, 7, 8), Some(1..8));
        assert_eq!(checked_input_range(8, 0, 8), Some(8..8));
        assert_eq!(checked_input_range(0, 0, 8), None);
        assert_eq!(checked_input_range(7, 2, 8), None);
        assert_eq!(checked_input_range(9, 0, 8), None);
        assert_eq!(checked_input_range(usize::MAX - 1, 2, u64::MAX), None);
        assert_eq!(
            checked_input_range(1, isize::MAX as usize + 1, u64::MAX),
            None
        );
        vivi_wasm_png_release_output();
        assert_eq!(decode_impl(0, 0, 1, 32, 1, 1, 64), 1);
        assert_eq!(decode_impl(1, 1, 63, 32, 1, 1, 64), 1);
        assert_eq!(decode_impl(1, 65, 2, 32, 1, 1, 64), 1);
        assert_released();
    }

    #[test]
    fn preserves_content_order_and_never_updates_runtime_error() {
        vivi_wasm_png_release_output();
        super::super::set_last_error(7, "runtime sentinel");
        assert_eq!(decode_host(PNG, &[0; 32], 0, 0), 6);
        assert_eq!(decode_host(PNG, &DIGEST, 0, 0), 5);
        assert_eq!(decode_host(PNG, &[0; 64], 1, 1), 1);
        // The backing block is non-null even though the logical PNG is empty.
        assert_eq!(decode_host(&PNG[..0], &EMPTY_DIGEST, 1, 1), 3);
        // This limit path returns before accessing the numeric input interval.
        assert_eq!(
            decode_impl(
                1,
                vivi_png_ref::MAX_PNG_INPUT_BYTES as usize + 1,
                1,
                32,
                1,
                1,
                u64::MAX,
            ),
            4
        );
        assert_released();
        assert_eq!(decode_host(PNG, &DIGEST, 1, 1), 0);
        super::super::LAST_ERROR.with(|error| {
            let error = error.borrow();
            assert_eq!(error.status, 7);
            assert_eq!(error.message, "runtime sentinel");
        });
        vivi_wasm_png_release_output();
        assert_released();
        super::super::clear_last_error();
    }

    #[test]
    fn decodes_owned_pixels_and_requires_full_release_between_calls() {
        vivi_wasm_png_release_output();
        let png_before = PNG.to_vec();
        let digest_before = DIGEST;
        for _ in 0..2 {
            assert_eq!(decode_host(PNG, &DIGEST, 1, 1), 0);
            OUTPUT_BYTES.with(|output| assert_eq!(&**output.borrow(), &[0x12, 0x34, 0x56, 0]));
            assert_eq!(super::super::vivi_wasm_output_len(), 4);
            assert_eq!(decode_host(PNG, &DIGEST, 1, 1), 1);
            OUTPUT_BYTES.with(|output| assert_eq!(&**output.borrow(), &[0x12, 0x34, 0x56, 0]));
            assert_eq!(PNG, png_before.as_slice());
            assert_eq!(DIGEST, digest_before);
            vivi_wasm_png_release_output();
            vivi_wasm_png_release_output();
            assert_released();
        }
    }

    #[test]
    fn rejects_empty_output_with_retained_capacity_without_changing_it() {
        vivi_wasm_png_release_output();
        OUTPUT_BYTES.with(|output| *output.borrow_mut() = Vec::with_capacity(16));
        let before = OUTPUT_BYTES.with(|output| {
            let output = output.borrow();
            (output.as_ptr(), output.capacity())
        });
        assert_eq!(decode_host(PNG, &DIGEST, 1, 1), 1);
        OUTPUT_BYTES.with(|output| {
            let output = output.borrow();
            assert!(output.is_empty());
            assert_eq!((output.as_ptr(), output.capacity()), before);
        });
        vivi_wasm_png_release_output();
        assert_released();
    }

    #[test]
    fn output_commit_moves_the_vec_and_rejects_inconsistent_metadata() {
        let mut output = Vec::new();
        let image = vivi_png_ref::decode(PNG, &DIGEST, 1, 1).unwrap();
        let allocation = image.rgba.as_ptr();
        assert_eq!(commit_image(&mut output, image, 1, 1), 0);
        assert_eq!(output.as_ptr(), allocation);
        let mut image = vivi_png_ref::decode(PNG, &DIGEST, 1, 1).unwrap();
        image.info.required_output_bytes = 8;
        assert_eq!(commit_image(&mut output, image, 1, 1), 4);
        assert_eq!(output.as_ptr(), allocation);
        assert_eq!(output, [0x12, 0x34, 0x56, 0]);
    }
}
