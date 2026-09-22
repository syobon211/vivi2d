use super::*;
use std::cell::Cell;
use tempfile::TempDir;

thread_local! { static PANIC_AFTER_CAPTURE: Cell<bool> = const { Cell::new(false) }; }
pub(super) fn panic_after_capture_if_requested() {
    assert!(
        !PANIC_AFTER_CAPTURE.with(|flag| flag.replace(false)),
        "fixed capture wrapper fault"
    );
}

// Existing strict host fixture; no substitute resolver or decoder.
const PNG: &[u8] = &[
    137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0,
    0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 120, 156, 99, 16, 50, 9, 99, 0, 0, 1, 149,
    0, 157, 77, 65, 8, 223, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
];

struct Endpoint {
    directory: TempDir,
    path: String,
}
impl Endpoint {
    fn new() -> Self {
        let mut builder = tempfile::Builder::new();
        builder.prefix("vivi-preview-capture-");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt as _;
            builder.permissions(std::fs::Permissions::from_mode(0o700));
        }
        let directory = builder.tempdir().unwrap();
        let path = directory
            .path()
            .join("assets.sqlite3")
            .to_str()
            .unwrap()
            .to_owned();
        Self { directory, path }
    }
    fn wire(&self) -> ViviLocalAssetEndpointV1 {
        ViviLocalAssetEndpointV1 {
            struct_size: 40,
            reserved: 0,
            path: ViviLocalAssetSliceV1 {
                data: self.path.as_ptr(),
                length: self.path.len() as u64,
            },
            principal: ViviLocalAssetSliceV1 {
                data: b"preview-owner".as_ptr(),
                length: 13,
            },
        }
    }
    fn seed(&self) -> ViviLocalAssetRefV1 {
        let mut host =
            LocalAssetHost::open(&self.path, PrincipalId::new(b"preview-owner".to_vec())).unwrap();
        let mut result = ViviLocalAssetResultV1::empty();
        result.ready(host.materialize_embedded_png(PNG, 1, 1).unwrap(), false);
        assert_eq!(result.outcome, READY);
        result.reference
    }
}
struct Cancel(*mut ViviLocalAssetCancelV1);
impl Cancel {
    fn new() -> Self {
        let mut value = ptr::null_mut();
        assert_eq!(unsafe { vivi_local_asset_cancel_create_v1(&mut value) }, 0);
        Self(value)
    }
}
impl Drop for Cancel {
    fn drop(&mut self) {
        unsafe {
            vivi_local_asset_cancel_release_v1(self.0);
        }
    }
}
struct Capture(*mut ViviLocalAssetCaptureV1);
impl Drop for Capture {
    fn drop(&mut self) {
        unsafe {
            vivi_local_asset_closure_destroy_v1(self.0);
        }
    }
}

fn info() -> ViviLocalAssetObjectInfoV1 {
    ViviLocalAssetObjectInfoV1 {
        struct_size: 48,
        reserved: 0,
        address: [77; 32],
        byte_length: 123,
    }
}
fn raw_result(value: &ViviLocalAssetResultV1) -> &[u8] {
    // The complete asserted layout contains no padding.
    unsafe { slice::from_raw_parts(ptr::from_ref(value).cast(), 264) }
}
fn capture(
    ep: &Endpoint,
    reference: &ViviLocalAssetRefV1,
    cancel: &Cancel,
) -> (Capture, ViviLocalAssetCaptureInfoV1) {
    let mut result = ViviLocalAssetResultV1::empty();
    let mut info = ViviLocalAssetCaptureInfoV1::empty();
    let mut handle = ptr::null_mut();
    assert_eq!(
        unsafe {
            vivi_local_asset_export_closure_v1(
                &ep.wire(),
                reference,
                1,
                1,
                cancel.0,
                &mut result,
                &mut info,
                &mut handle,
            )
        },
        0
    );
    assert_eq!(
        (
            result.outcome,
            result.stage,
            result.outcome_may_have_committed
        ),
        (READY, 3, 0)
    );
    assert!(!handle.is_null());
    (Capture(handle), info)
}

#[test]
fn real_blob_capture_survives_source_close_and_cancel_release_with_exact_owned_copy() {
    let source = Endpoint::new();
    let reference = source.seed();
    let cancel = Cancel::new();
    let (capture, captured) = capture(&source, &reference, &cancel);
    assert_eq!(
        (
            captured.struct_size,
            captured.object_count,
            captured.total_bytes
        ),
        (16, 1, PNG.len() as u64)
    );
    drop(cancel);
    // Explicit close reports a Windows open-file leak rather than silently
    // discarding a TempDir destructor failure.
    source.directory.close().unwrap();
    let mut metadata = info();
    assert_eq!(
        unsafe {
            vivi_local_asset_closure_object_v1(capture.0, 0, &mut metadata, ptr::null_mut(), 0)
        },
        0
    );
    assert_eq!(metadata.address, reference.object_address);
    assert_eq!(metadata.byte_length, PNG.len() as u64);
    let mut output = vec![0xa5; PNG.len() + 7];
    assert_eq!(
        unsafe {
            vivi_local_asset_closure_object_v1(
                capture.0,
                0,
                &mut metadata,
                output.as_mut_ptr(),
                output.len() as u64,
            )
        },
        0
    );
    assert_eq!(&output[..PNG.len()], PNG);
    assert_eq!(&output[PNG.len()..], &[0xa5; 7]);
    drop(capture);
    unsafe {
        vivi_local_asset_closure_destroy_v1(ptr::null_mut());
    }
}

#[test]
fn object_query_and_copy_reject_bad_framing_without_partial_payload_or_metadata() {
    let ep = Endpoint::new();
    let reference = ep.seed();
    let cancel = Cancel::new();
    let (capture, _) = capture(&ep, &reference, &cancel);
    for case in 0..8 {
        let mut metadata = info();
        let mut output = vec![0xa5; PNG.len()];
        let mut index = 0;
        let mut pointer = output.as_mut_ptr();
        let mut capacity = output.len() as u64;
        match case {
            0 => metadata.struct_size = 47,
            1 => metadata.reserved = 1,
            2 => index = 1,
            3 => index = u32::MAX,
            4 => capacity -= 1,
            5 => pointer = ptr::null_mut(),
            6 => capacity = u64::MAX,
            7 => capacity = 0,
            _ => unreachable!(),
        }
        let before = metadata;
        assert_eq!(
            unsafe {
                vivi_local_asset_closure_object_v1(
                    capture.0,
                    index,
                    &mut metadata,
                    pointer,
                    capacity,
                )
            },
            INVALID
        );
        assert_eq!(metadata, before);
        assert!(output.iter().all(|byte| *byte == 0xa5));
    }
    let mut metadata = info();
    let before = metadata;
    assert_eq!(
        unsafe {
            vivi_local_asset_closure_object_v1(ptr::null(), 0, &mut metadata, ptr::null_mut(), 0)
        },
        INVALID
    );
    assert_eq!(metadata, before);
    #[repr(align(8))]
    struct Aligned([u8; 384]);
    let mut storage = Aligned([0xa5; 384]);
    let p = storage.0.as_mut_ptr();
    unsafe {
        p.cast::<ViviLocalAssetObjectInfoV1>().write(info());
    }
    let before = storage.0;
    // Misalignment and metadata/payload overlap are rejected before writing.
    for metadata in [p.wrapping_add(1).cast(), p.cast()] {
        assert_eq!(
            unsafe {
                vivi_local_asset_closure_object_v1(capture.0, 0, metadata, p, PNG.len() as u64)
            },
            INVALID
        );
        assert_eq!(storage.0, before);
    }
    assert!(range(ptr::without_provenance(usize::MAX - 3), 8).is_err());
}

#[test]
fn object_outputs_cannot_alias_capture_owned_storage() {
    let ep = Endpoint::new();
    let reference = ep.seed();
    let cancel = Cancel::new();
    let (capture, _) = capture(&ep, &reference, &cancel);
    let closure = unsafe { &*capture.0.cast::<PngClosureExportV1>() };
    let bytes = closure.objects()[0].bytes();
    let mut metadata = info();
    let before = metadata;
    assert_eq!(
        unsafe {
            vivi_local_asset_closure_object_v1(
                capture.0,
                0,
                &mut metadata,
                bytes.as_ptr().cast_mut(),
                bytes.len() as u64,
            )
        },
        INVALID
    );
    assert_eq!(metadata, before);
    assert_eq!(bytes, PNG);
    assert_eq!(
        unsafe {
            vivi_local_asset_closure_object_v1(capture.0, 0, capture.0.cast(), ptr::null_mut(), 0)
        },
        INVALID
    );
    assert_eq!(closure.objects()[0].bytes(), PNG);
}

#[test]
fn export_admission_rejects_wrong_sizes_and_overlapping_outputs_without_writes() {
    let ep = Endpoint::new();
    let reference = ep.seed();
    let cancel = Cancel::new();
    for case in 0..4 {
        let mut result = ViviLocalAssetResultV1::empty();
        result.outcome = 99;
        let mut metadata = ViviLocalAssetCaptureInfoV1 {
            struct_size: 16,
            object_count: 99,
            total_bytes: 99,
        };
        let mut handle = ptr::null_mut();
        if case == 0 {
            result.struct_size = 263;
        }
        if case == 1 {
            metadata.struct_size = 15;
        }
        let result_pointer = ptr::from_mut(&mut result);
        let metadata_pointer = if case == 2 {
            result_pointer.cast()
        } else {
            &mut metadata
        };
        let handle_pointer = if case == 3 {
            result_pointer.cast()
        } else {
            &mut handle
        };
        let result_before = raw_result(&result).to_vec();
        let metadata_before = metadata;
        assert_eq!(
            unsafe {
                vivi_local_asset_export_closure_v1(
                    &ep.wire(),
                    &reference,
                    1,
                    1,
                    cancel.0,
                    result_pointer,
                    metadata_pointer,
                    handle_pointer,
                )
            },
            INVALID
        );
        assert_eq!(raw_result(&result), result_before);
        assert_eq!(metadata, metadata_before);
        assert!(handle.is_null());
    }
}

#[test]
fn export_rejects_fixed_and_dynamic_input_overlap_before_zeroing_outputs() {
    let ep = Endpoint::new();
    let reference = ep.seed();
    let cancel = Cancel::new();
    for case in 0..4 {
        let mut endpoint = ep.wire();
        let mut result = ViviLocalAssetResultV1::empty();
        result.outcome = 99;
        let mut metadata = ViviLocalAssetCaptureInfoV1 {
            struct_size: 16,
            object_count: 99,
            total_bytes: 99,
        };
        let mut handle = ptr::null_mut();
        let mut input = ptr::from_ref(&reference);
        let mut token = cancel.0;
        match case {
            0 => input = ptr::from_ref(&result.reference),
            1 => token = ptr::from_mut(&mut result).cast(),
            2 => {
                endpoint.path.data = ptr::from_ref(&result).cast();
                endpoint.path.length = 1;
            }
            3 => {
                endpoint.principal.data = ptr::from_ref(&metadata).cast();
                endpoint.principal.length = 1;
            }
            _ => unreachable!(),
        }
        let result_before = raw_result(&result).to_vec();
        let metadata_before = metadata;
        assert_eq!(
            unsafe {
                vivi_local_asset_export_closure_v1(
                    &endpoint,
                    input,
                    1,
                    1,
                    token,
                    &mut result,
                    &mut metadata,
                    &mut handle,
                )
            },
            INVALID
        );
        assert_eq!(raw_result(&result), result_before);
        assert_eq!(metadata, metadata_before);
        assert!(handle.is_null());
    }
}

#[test]
fn admitted_invalid_reference_missing_dimension_error_and_cancellation_return_no_capture() {
    let ep = Endpoint::new();
    let reference = ep.seed();
    let cancel = Cancel::new();
    for case in 0..4 {
        let mut input = reference;
        let mut width = 1;
        match case {
            0 => input.reserved = 1,
            1 => {
                input.object_address = [99; 32];
                input.content_sha256 = [99; 32];
            }
            2 => width = 2,
            3 => unsafe {
                vivi_local_asset_cancel_request_v1(cancel.0);
            },
            _ => unreachable!(),
        }
        let mut result = ViviLocalAssetResultV1::empty();
        let mut metadata = ViviLocalAssetCaptureInfoV1 {
            struct_size: 16,
            object_count: 99,
            total_bytes: 99,
        };
        // Writable output storage may contain an old non-handle sentinel. The
        // operation must replace it with null before any recoverable failure.
        let mut handle = ptr::without_provenance_mut(1);
        let code = unsafe {
            vivi_local_asset_export_closure_v1(
                &ep.wire(),
                &input,
                width,
                1,
                cancel.0,
                &mut result,
                &mut metadata,
                &mut handle,
            )
        };
        assert_eq!(code, if case == 0 { INVALID } else { 0 });
        assert_eq!(metadata, ViviLocalAssetCaptureInfoV1::empty());
        assert!(handle.is_null());
        assert_eq!(result.outcome, [0, MISSING, HOST_ERROR, CANCELLED][case]);
        assert_eq!(result.stage, [0, 3, 3, 1][case]);
        assert_eq!(result.outcome_may_have_committed, 0);
        assert!(raw_result(&result)[32..].iter().all(|byte| *byte == 0));
        if case == 2 {
            assert_eq!(result.asset_code, 14);
        }
    }
    let unopened = Endpoint::new();
    let mut result = ViviLocalAssetResultV1::empty();
    let mut metadata = ViviLocalAssetCaptureInfoV1::empty();
    let mut handle = ptr::null_mut();
    assert_eq!(
        unsafe {
            vivi_local_asset_export_closure_v1(
                &unopened.wire(),
                &reference,
                1,
                1,
                cancel.0,
                &mut result,
                &mut metadata,
                &mut handle,
            )
        },
        0
    );
    assert_eq!((result.outcome, result.stage), (CANCELLED, 1));
    assert!(!Path::new(&unopened.path).exists());
    assert!(handle.is_null());
}

#[test]
fn panic_after_real_capture_allocation_is_contained_without_publishing_partial_handle() {
    let ep = Endpoint::new();
    let reference = ep.seed();
    let cancel = Cancel::new();
    PANIC_AFTER_CAPTURE.with(|flag| flag.set(true));
    let mut result = ViviLocalAssetResultV1::empty();
    let mut metadata = ViviLocalAssetCaptureInfoV1::empty();
    let mut handle = ptr::null_mut();
    assert_eq!(
        unsafe {
            vivi_local_asset_export_closure_v1(
                &ep.wire(),
                &reference,
                1,
                1,
                cancel.0,
                &mut result,
                &mut metadata,
                &mut handle,
            )
        },
        0
    );
    assert_eq!(
        (
            result.outcome,
            result.stage,
            result.outcome_may_have_committed
        ),
        (INTERNAL, 3, 0)
    );
    assert!(handle.is_null());
    assert_eq!(metadata, ViviLocalAssetCaptureInfoV1::empty());
    assert!(raw_result(&result)[32..].iter().all(|byte| *byte == 0));
    let (next, _) = capture(&ep, &reference, &cancel);
    drop(next);
}
