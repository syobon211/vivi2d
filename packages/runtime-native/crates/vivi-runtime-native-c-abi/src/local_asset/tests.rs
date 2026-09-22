use super::*;
use tempfile::TempDir;

// The existing public host-local 1x1 fixture, decoded once from its fixed base64.
const PNG: &[u8] = &[
    137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0,
    0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 120, 156, 99, 16, 50, 9, 99, 0, 0, 1, 149,
    0, 157, 77, 65, 8, 223, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
];

struct Endpoint {
    directory: TempDir,
    path: String,
    principal: Vec<u8>,
}

impl Endpoint {
    fn new(principal: &[u8]) -> Self {
        let mut builder = tempfile::Builder::new();
        builder.prefix("vivi-local-asset-abi-");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt as _;
            builder.permissions(std::fs::Permissions::from_mode(0o700));
        }
        let directory = builder.tempdir().expect("owned private test directory");
        let path = directory
            .path()
            .join("store.sqlite3")
            .to_str()
            .unwrap()
            .to_owned();
        Self {
            directory,
            path,
            principal: principal.to_vec(),
        }
    }

    fn wire(&self) -> ViviLocalAssetEndpointV1 {
        assert!(Path::new(&self.path).parent().unwrap() == self.directory.path());
        ViviLocalAssetEndpointV1 {
            struct_size: 40,
            reserved: 0,
            path: ViviLocalAssetSliceV1 {
                data: self.path.as_ptr(),
                length: self.path.len() as u64,
            },
            principal: ViviLocalAssetSliceV1 {
                data: self.principal.as_ptr(),
                length: self.principal.len() as u64,
            },
        }
    }
}

struct Cancel(*mut ViviLocalAssetCancelV1);
impl Cancel {
    fn new() -> Self {
        let mut pointer = ptr::null_mut();
        assert_eq!(
            unsafe { vivi_local_asset_cancel_create_v1(&mut pointer) },
            0
        );
        assert!(!pointer.is_null());
        Self(pointer)
    }
}
impl Drop for Cancel {
    fn drop(&mut self) {
        unsafe {
            vivi_local_asset_cancel_release_v1(self.0);
        }
    }
}

fn output_bytes(value: &ViviLocalAssetResultV1) -> &[u8] {
    // All fields are initialized and the asserted C layout contains no padding.
    unsafe {
        slice::from_raw_parts(
            ptr::from_ref(value).cast(),
            size_of::<ViviLocalAssetResultV1>(),
        )
    }
}

fn assert_no_asset(value: &ViviLocalAssetResultV1) {
    assert_eq!(value.struct_size, 264);
    assert!(output_bytes(value)[32..].iter().all(|v| *v == 0));
    assert_eq!(value.reserved0, 0);
    assert!(value.outcome_may_have_committed <= 1);
}

fn materialize(endpoint: &Endpoint, cancel: &Cancel) -> ViviLocalAssetResultV1 {
    let mut result = ViviLocalAssetResultV1::empty();
    assert_eq!(
        unsafe {
            vivi_local_asset_materialize_v1(
                &endpoint.wire(),
                PNG.as_ptr(),
                PNG.len() as u64,
                1,
                1,
                cancel.0,
                &mut result,
            )
        },
        0
    );
    assert_eq!(
        (
            result.outcome,
            result.stage,
            result.width,
            result.height,
            result.png_profile
        ),
        (READY, 8, 1, 1, 1)
    );
    assert_eq!(
        (
            result.host_kind,
            result.asset_code,
            result.store_kind,
            result.outcome_may_have_committed
        ),
        (0, 0, 0, 0)
    );
    assert_eq!(result.reference.struct_size, 216);
    assert_eq!(result.reference.media_length, 9);
    assert_eq!(&result.reference.media_utf8[..9], b"image/png");
    result
}

#[test]
fn real_materialize_transfer_and_reopen_keep_exact_reference_and_principal_boundary() {
    // Opaque principal bytes intentionally include the domain-separator NUL.
    let source = Endpoint::new(b"source\0principal");
    let receiver = Endpoint::new(b"receiver\0principal");
    let cancel = Cancel::new();
    let initial = materialize(&source, &cancel);
    let mut transferred = ViviLocalAssetResultV1::empty();
    assert_eq!(
        unsafe {
            vivi_local_asset_transfer_v1(
                &source.wire(),
                &receiver.wire(),
                &initial.reference,
                1,
                1,
                cancel.0,
                &mut transferred,
            )
        },
        0
    );
    assert_eq!((transferred.outcome, transferred.stage), (READY, 5));
    assert_eq!(
        &output_bytes(&transferred)[32..],
        &output_bytes(&initial)[32..]
    );
    let mut resolved = ViviLocalAssetResultV1::empty();
    assert_eq!(
        unsafe {
            vivi_local_asset_resolve_v1(
                &receiver.wire(),
                &initial.reference,
                1,
                1,
                cancel.0,
                &mut resolved,
            )
        },
        0
    );
    assert_eq!((resolved.outcome, resolved.stage), (READY, 7));
    assert_eq!(
        &output_bytes(&resolved)[32..],
        &output_bytes(&initial)[32..]
    );

    let mut wrong_owner = receiver.wire();
    wrong_owner.principal = source.wire().principal;
    assert_eq!(
        unsafe {
            vivi_local_asset_resolve_v1(
                &wrong_owner,
                &initial.reference,
                1,
                1,
                cancel.0,
                &mut resolved,
            )
        },
        0
    );
    assert_eq!(
        (
            resolved.outcome,
            resolved.stage,
            resolved.host_kind,
            resolved.store_kind
        ),
        (HOST_ERROR, 6, 4, 4)
    );
    assert_eq!(
        (resolved.asset_code, resolved.outcome_may_have_committed),
        (0, 0)
    );
    assert_no_asset(&resolved);
}

#[test]
fn reference_limit_then_missing_non_png_source_precede_receiver_open() {
    let source = Endpoint::new(b"source");
    let receiver = Endpoint::new(b"receiver");
    let cancel = Cancel::new();
    let mut missing = materialize(&source, &cancel).reference;
    missing.object_address = [99; 32];
    missing.content_sha256 = [99; 32];
    missing.size_bytes = u64::MAX;
    missing.media_utf8 = [0; 128];
    let media = b"application/octet-stream";
    missing.media_length = media.len() as u32;
    missing.media_utf8[..media.len()].copy_from_slice(media);
    let mut result = ViviLocalAssetResultV1::empty();
    assert_eq!(
        unsafe {
            vivi_local_asset_transfer_v1(
                &source.wire(),
                &receiver.wire(),
                &missing,
                1,
                1,
                cancel.0,
                &mut result,
            )
        },
        0
    );
    // The resolver's frozen reference-level limit precedes even a missing object.
    assert_eq!(
        (result.outcome, result.stage, result.asset_code),
        (HOST_ERROR, 3, 16)
    );
    assert_no_asset(&result);
    assert!(!Path::new(&receiver.path).exists());
    missing.size_bytes = 1;
    assert_eq!(
        unsafe {
            vivi_local_asset_transfer_v1(
                &source.wire(),
                &receiver.wire(),
                &missing,
                1,
                1,
                cancel.0,
                &mut result,
            )
        },
        0
    );
    // Within reference limits, top Missing still precedes non-PNG media validation.
    assert_eq!((result.outcome, result.stage), (MISSING, 3));
    assert_no_asset(&result);
    assert!(
        !Path::new(&receiver.path).exists(),
        "receiver was never opened"
    );
}

#[test]
fn cancelled_before_open_and_worker_reference_survives_token_release() {
    let endpoint = Endpoint::new(b"cancel");
    let token = Cancel::new();
    // The worker owns its own reference before the UI token's final release.
    unsafe {
        vivi_local_asset_cancel_retain_v1(token.0);
    }
    let worker_address = token.0 as usize;
    drop(token);
    let path = endpoint.path.clone();
    let principal = endpoint.principal.clone();
    std::thread::spawn(move || {
        let worker = Cancel(worker_address as *mut ViviLocalAssetCancelV1);
        unsafe {
            vivi_local_asset_cancel_request_v1(worker.0);
        }
        let ep = ViviLocalAssetEndpointV1 {
            struct_size: 40,
            reserved: 0,
            path: ViviLocalAssetSliceV1 {
                data: path.as_ptr(),
                length: path.len() as u64,
            },
            principal: ViviLocalAssetSliceV1 {
                data: principal.as_ptr(),
                length: principal.len() as u64,
            },
        };
        let mut result = ViviLocalAssetResultV1::empty();
        assert_eq!(
            unsafe {
                vivi_local_asset_materialize_v1(
                    &ep,
                    PNG.as_ptr(),
                    PNG.len() as u64,
                    1,
                    1,
                    worker.0,
                    &mut result,
                )
            },
            0
        );
        assert_eq!((result.outcome, result.stage), (CANCELLED, 1));
        assert_no_asset(&result);
    })
    .join()
    .unwrap();
    assert!(!Path::new(&endpoint.path).exists());
}

#[test]
fn framing_failure_clears_valid_output_but_preserves_wrong_sized_output() {
    let endpoint = Endpoint::new(b"framing");
    let cancel = Cancel::new();
    let initial = materialize(&endpoint, &cancel);
    let mut result = initial;
    let mut invalid = initial.reference;
    invalid.media_utf8[127] = 1;
    unsafe {
        vivi_local_asset_cancel_request_v1(cancel.0);
    }
    assert_eq!(
        unsafe {
            vivi_local_asset_resolve_v1(&endpoint.wire(), &invalid, 1, 1, cancel.0, &mut result)
        },
        INVALID
    );
    assert_eq!(
        output_bytes(&result),
        output_bytes(&ViviLocalAssetResultV1::empty())
    );
    result = initial;
    result.struct_size = 263;
    let before = output_bytes(&result).to_vec();
    assert_eq!(
        unsafe {
            vivi_local_asset_resolve_v1(ptr::null(), ptr::null(), 1, 1, cancel.0, &mut result)
        },
        INVALID
    );
    assert_eq!(output_bytes(&result), before);
    result = initial;
    assert_eq!(
        unsafe {
            vivi_local_asset_resolve_v1(
                ptr::null(),
                &initial.reference,
                1,
                1,
                cancel.0,
                &mut result,
            )
        },
        INVALID
    );
    assert_eq!(
        output_bytes(&result),
        output_bytes(&ViviLocalAssetResultV1::empty())
    );
    result = initial;
    assert_eq!(
        unsafe {
            vivi_local_asset_materialize_v1(
                &endpoint.wire(),
                ptr::null(),
                1,
                1,
                1,
                cancel.0,
                &mut result,
            )
        },
        INVALID
    );
    assert_eq!(
        output_bytes(&result),
        output_bytes(&ViviLocalAssetResultV1::empty())
    );
}

#[test]
fn real_decoder_failure_and_dimension_mismatch_are_redacted_non_ready() {
    let endpoint = Endpoint::new(b"errors");
    let cancel = Cancel::new();
    let mut result = ViviLocalAssetResultV1::empty();
    assert_eq!(
        unsafe {
            vivi_local_asset_materialize_v1(
                &endpoint.wire(),
                ptr::null(),
                0,
                1,
                1,
                cancel.0,
                &mut result,
            )
        },
        0
    );
    assert_eq!(
        (
            result.outcome,
            result.stage,
            result.host_kind,
            result.asset_code
        ),
        (HOST_ERROR, 8, 3, 15)
    );
    assert_eq!(result.outcome_may_have_committed, 0);
    assert_no_asset(&result);
    let initial = materialize(&endpoint, &cancel);
    assert_eq!(
        unsafe {
            vivi_local_asset_resolve_v1(
                &endpoint.wire(),
                &initial.reference,
                2,
                1,
                cancel.0,
                &mut result,
            )
        },
        0
    );
    assert_eq!(
        (
            result.outcome,
            result.stage,
            result.host_kind,
            result.asset_code
        ),
        (HOST_ERROR, 7, 3, 14)
    );
    assert_no_asset(&result);
}

#[test]
fn caught_operation_panic_does_not_expose_partial_ready_data() {
    // Wrapper fault injection only; not evidence of a real mid-write host failure.
    let cancel = Cancel::new();
    for mutating in [false, true] {
        let mut output = ViviLocalAssetResultV1::empty();
        assert_eq!(
            unsafe {
                operation(&mut output, cancel.0, |_, candidate, entered| {
                    candidate.stage = 5;
                    candidate.reference.struct_size = 216;
                    candidate.reference.object_address = [99; 32];
                    *entered = mutating;
                    panic!("fixed synthetic wrapper fault")
                })
            },
            0
        );
        assert_eq!(
            (
                output.outcome,
                output.stage,
                output.outcome_may_have_committed
            ),
            (INTERNAL, 5, u32::from(mutating))
        );
        assert_no_asset(&output);
    }
}
