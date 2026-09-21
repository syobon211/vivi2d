//! Opt-in, synchronous local Asset calls. The caller owns all live pointer ranges;
//! only the cancellation Arc is retained across calls. No raw error strings escape.

#[cfg(test)]
mod tests;

mod preview;

use std::mem::{align_of, offset_of, size_of};
use std::panic::{AssertUnwindSafe, catch_unwind};
use std::path::Path;
use std::ptr;
use std::slice;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use vivi_asset_host_local::{
    AssetErrorCode, AssetRef, Digest, ExportPngClosureV1, LocalAssetHost, LocalAssetHostError,
    LocalAssetHostErrorKind, LocalStoreErrorKind, PngTransferError, PrincipalId,
    ReferencedAtlasResolutionV1, StorageKind, VerifiedAtlasAssetV1,
};

const INVALID: i32 = 1;
const RESOURCE: i32 = 2;
const PANIC: i32 = 3;
const READY: u32 = 1;
const MISSING: u32 = 2;
const CANCELLED: u32 = 3;
const HOST_ERROR: u32 = 4;
const INTERNAL: u32 = 5;

/// Exact borrowed bytes; callers retain initialized, immutable storage.
#[repr(C)]
#[derive(Clone, Copy)]
pub struct ViviLocalAssetSliceV1 {
    data: *const u8,
    length: u64,
}

/// Trusted native endpoint. Renderer code cannot supply this structure.
#[repr(C)]
#[derive(Clone, Copy)]
pub struct ViviLocalAssetEndpointV1 {
    struct_size: u32,
    reserved: u32,
    path: ViviLocalAssetSliceV1,
    principal: ViviLocalAssetSliceV1,
}

/// Framing for an Asset reference, not proof that its object is valid or present.
#[repr(C)]
#[derive(Clone, Copy)]
pub struct ViviLocalAssetRefV1 {
    struct_size: u32,
    storage_kind: u32,
    object_address: [u8; 32],
    content_sha256: [u8; 32],
    size_bytes: u64,
    media_length: u32,
    reserved: u32,
    media_utf8: [u8; 128],
}

/// Fixed tagged output. Non-Ready outcomes contain no reference or image data.
#[repr(C)]
#[derive(Clone, Copy)]
pub struct ViviLocalAssetResultV1 {
    struct_size: u32,
    outcome: u32,
    stage: u32,
    host_kind: u32,
    asset_code: u32,
    store_kind: u32,
    outcome_may_have_committed: u32,
    reserved0: u32,
    reference: ViviLocalAssetRefV1,
    width: u32,
    height: u32,
    png_profile: u32,
    reserved1: u32,
}

/// Opaque pointer to a reference-counted cancellation flag, never a host handle.
#[repr(C)]
pub struct ViviLocalAssetCancelV1 {
    private: [u8; 0],
}

const _: () = {
    assert!(size_of::<ViviLocalAssetSliceV1>() == 16);
    assert!(align_of::<ViviLocalAssetSliceV1>() == 8);
    assert!(offset_of!(ViviLocalAssetSliceV1, data) == 0);
    assert!(offset_of!(ViviLocalAssetSliceV1, length) == 8);
    assert!(size_of::<ViviLocalAssetEndpointV1>() == 40);
    assert!(align_of::<ViviLocalAssetEndpointV1>() == 8);
    assert!(offset_of!(ViviLocalAssetEndpointV1, struct_size) == 0);
    assert!(offset_of!(ViviLocalAssetEndpointV1, reserved) == 4);
    assert!(offset_of!(ViviLocalAssetEndpointV1, path) == 8);
    assert!(offset_of!(ViviLocalAssetEndpointV1, principal) == 24);
    assert!(size_of::<ViviLocalAssetRefV1>() == 216);
    assert!(align_of::<ViviLocalAssetRefV1>() == 8);
    assert!(offset_of!(ViviLocalAssetRefV1, struct_size) == 0);
    assert!(offset_of!(ViviLocalAssetRefV1, storage_kind) == 4);
    assert!(offset_of!(ViviLocalAssetRefV1, object_address) == 8);
    assert!(offset_of!(ViviLocalAssetRefV1, content_sha256) == 40);
    assert!(offset_of!(ViviLocalAssetRefV1, size_bytes) == 72);
    assert!(offset_of!(ViviLocalAssetRefV1, media_length) == 80);
    assert!(offset_of!(ViviLocalAssetRefV1, reserved) == 84);
    assert!(offset_of!(ViviLocalAssetRefV1, media_utf8) == 88);
    assert!(size_of::<ViviLocalAssetResultV1>() == 264);
    assert!(align_of::<ViviLocalAssetResultV1>() == 8);
    assert!(offset_of!(ViviLocalAssetResultV1, struct_size) == 0);
    assert!(offset_of!(ViviLocalAssetResultV1, outcome) == 4);
    assert!(offset_of!(ViviLocalAssetResultV1, stage) == 8);
    assert!(offset_of!(ViviLocalAssetResultV1, host_kind) == 12);
    assert!(offset_of!(ViviLocalAssetResultV1, asset_code) == 16);
    assert!(offset_of!(ViviLocalAssetResultV1, store_kind) == 20);
    assert!(offset_of!(ViviLocalAssetResultV1, outcome_may_have_committed) == 24);
    assert!(offset_of!(ViviLocalAssetResultV1, reserved0) == 28);
    assert!(offset_of!(ViviLocalAssetResultV1, reference) == 32);
    assert!(offset_of!(ViviLocalAssetResultV1, width) == 248);
    assert!(offset_of!(ViviLocalAssetResultV1, height) == 252);
    assert!(offset_of!(ViviLocalAssetResultV1, png_profile) == 256);
    assert!(offset_of!(ViviLocalAssetResultV1, reserved1) == 260);
};

impl ViviLocalAssetRefV1 {
    const fn empty() -> Self {
        Self {
            struct_size: 0,
            storage_kind: 0,
            object_address: [0; 32],
            content_sha256: [0; 32],
            size_bytes: 0,
            media_length: 0,
            reserved: 0,
            media_utf8: [0; 128],
        }
    }
}

impl ViviLocalAssetResultV1 {
    const fn empty() -> Self {
        Self {
            struct_size: 264,
            outcome: 0,
            stage: 0,
            host_kind: 0,
            asset_code: 0,
            store_kind: 0,
            outcome_may_have_committed: 0,
            reserved0: 0,
            reference: ViviLocalAssetRefV1::empty(),
            width: 0,
            height: 0,
            png_profile: 0,
            reserved1: 0,
        }
    }
    fn ready(&mut self, verified: VerifiedAtlasAssetV1, mutating: bool) {
        if verified.png.profile != "vivi2d.png.rgba8.v1" || verified.asset.media_type != "image/png"
        {
            self.outcome = INTERNAL;
            self.outcome_may_have_committed = u32::from(mutating);
            return;
        }
        let asset = verified.asset;
        let mut media_utf8 = [0; 128];
        media_utf8[..9].copy_from_slice(b"image/png");
        self.reference = ViviLocalAssetRefV1 {
            struct_size: 216,
            storage_kind: match asset.storage_kind {
                StorageKind::Blob => 1,
                StorageKind::ChunkManifest => 2,
            },
            object_address: *asset.object_address.as_bytes(),
            content_sha256: *asset.content_sha256.as_bytes(),
            size_bytes: asset.size_bytes,
            media_length: 9,
            reserved: 0,
            media_utf8,
        };
        self.outcome = READY;
        self.width = verified.png.width;
        self.height = verified.png.height;
        self.png_profile = 1;
    }
    fn host_error(&mut self, error: LocalAssetHostError, ambiguous: bool) {
        self.outcome = HOST_ERROR;
        self.host_kind = match error.kind() {
            LocalAssetHostErrorKind::InvalidTexturePlan => 1,
            LocalAssetHostErrorKind::ResourceLimitExceeded => 2,
            LocalAssetHostErrorKind::Asset => 3,
            LocalAssetHostErrorKind::Store => 4,
        };
        self.asset_code = error.asset_code().map(asset_code).unwrap_or(0);
        self.store_kind = error.store_kind().map(store_kind).unwrap_or(0);
        self.outcome_may_have_committed = u32::from(ambiguous);
    }
    fn transfer_error(&mut self, error: PngTransferError) {
        if let Some(cause) = error.host_error() {
            self.host_error(cause, error.outcome_may_have_committed());
        } else {
            self.outcome = CANCELLED;
        }
    }
}

fn asset_code(code: AssetErrorCode) -> u32 {
    match code {
        AssetErrorCode::HashMismatch => 1,
        AssetErrorCode::SizeMismatch => 2,
        AssetErrorCode::TooLargeForEmbed => 3,
        AssetErrorCode::ChunkMissing => 4,
        AssetErrorCode::ManifestInvalid => 5,
        AssetErrorCode::RefSetMismatch => 6,
        AssetErrorCode::UploadExpired => 7,
        AssetErrorCode::UnsupportedKind => 8,
        AssetErrorCode::DeletedObjectRef => 9,
        AssetErrorCode::DescriptorMismatch => 10,
        AssetErrorCode::MediaTypeMismatch => 11,
        AssetErrorCode::ContentHashMismatch => 12,
        AssetErrorCode::DecodingProfileUnsupported => 13,
        AssetErrorCode::DimensionMismatch => 14,
        AssetErrorCode::DecodeMalformed => 15,
        AssetErrorCode::LimitExceeded => 16,
        AssetErrorCode::WriteInProgress => 17,
        AssetErrorCode::WriteLeaseLost => 18,
    }
}
fn store_kind(kind: LocalStoreErrorKind) -> u32 {
    match kind {
        LocalStoreErrorKind::PathRejected => 1,
        LocalStoreErrorKind::StoreUnavailable => 2,
        LocalStoreErrorKind::IntegrityViolation => 3,
        LocalStoreErrorKind::PrincipalMismatch => 4,
        LocalStoreErrorKind::InvalidInput => 5,
        LocalStoreErrorKind::ImmutableConflict => 6,
        _ => 255,
    }
}

fn aligned<T>(p: *const T) -> bool {
    !p.is_null() && p.is_aligned()
}

// These helpers check representable framing, not arbitrary C address validity.
unsafe fn bytes<'a>(p: *const u8, length: u64) -> Result<&'a [u8], i32> {
    let len = usize::try_from(length).map_err(|_| INVALID)?;
    if len == 0 {
        return Ok(&[]);
    }
    if p.is_null() || len > isize::MAX as usize || p.addr().checked_add(len).is_none() {
        return Err(INVALID);
    }
    Ok(unsafe { slice::from_raw_parts(p, len) })
}
unsafe fn endpoint<'a>(p: *const ViviLocalAssetEndpointV1) -> Result<(&'a Path, PrincipalId), i32> {
    if !aligned(p) {
        return Err(INVALID);
    }
    let e = unsafe { *p };
    if e.struct_size != 40
        || e.reserved != 0
        || !(1..=131_068).contains(&e.path.length)
        || !(1..=4096).contains(&e.principal.length)
    {
        return Err(INVALID);
    }
    let name =
        std::str::from_utf8(unsafe { bytes(e.path.data, e.path.length)? }).map_err(|_| INVALID)?;
    let path = Path::new(name);
    if name.contains('\0') || !path.is_absolute() {
        return Err(INVALID);
    }
    #[cfg(windows)]
    if !matches!(path.components().next(), Some(std::path::Component::Prefix(prefix))
        if matches!(prefix.kind(), std::path::Prefix::Disk(_) | std::path::Prefix::VerbatimDisk(_)))
    {
        return Err(INVALID);
    }
    let supplied = unsafe { bytes(e.principal.data, e.principal.length)? };
    let mut principal = Vec::new();
    principal
        .try_reserve_exact(supplied.len())
        .map_err(|_| RESOURCE)?;
    principal.extend_from_slice(supplied);
    Ok((path, PrincipalId::new(principal)))
}
unsafe fn reference(p: *const ViviLocalAssetRefV1) -> Result<AssetRef, i32> {
    if !aligned(p) {
        return Err(INVALID);
    }
    let r = unsafe { *p };
    if r.struct_size != 216 || r.reserved != 0 || !(1..=127).contains(&r.media_length) {
        return Err(INVALID);
    }
    let n = r.media_length as usize;
    if r.media_utf8[..n].contains(&0) || r.media_utf8[n..].iter().any(|b| *b != 0) {
        return Err(INVALID);
    }
    let media = std::str::from_utf8(&r.media_utf8[..n]).map_err(|_| INVALID)?;
    let mut media_type = String::new();
    media_type.try_reserve_exact(n).map_err(|_| RESOURCE)?;
    media_type.push_str(media);
    Ok(AssetRef {
        object_address: Digest::from_bytes(r.object_address),
        content_sha256: Digest::from_bytes(r.content_sha256),
        storage_kind: match r.storage_kind {
            1 => StorageKind::Blob,
            2 => StorageKind::ChunkManifest,
            _ => return Err(INVALID),
        },
        size_bytes: r.size_bytes,
        media_type,
    })
}

unsafe fn operation(
    out: *mut ViviLocalAssetResultV1,
    cancel: *mut ViviLocalAssetCancelV1,
    run: impl FnOnce(&AtomicBool, &mut ViviLocalAssetResultV1, &mut bool) -> Result<(), i32>,
) -> i32 {
    if !aligned(out) || unsafe { (*out).struct_size } != 264 {
        return INVALID;
    }
    unsafe {
        out.write(ViviLocalAssetResultV1::empty());
    }
    if !aligned(cancel.cast::<AtomicBool>()) {
        return INVALID;
    }
    let mut result = ViviLocalAssetResultV1::empty();
    let mut mutating_entered = false;
    let attempted = catch_unwind(AssertUnwindSafe(|| {
        run(
            unsafe { &*cancel.cast::<AtomicBool>() },
            &mut result,
            &mut mutating_entered,
        )
    }));
    match attempted {
        Ok(Ok(())) => {
            unsafe {
                out.write(result);
            }
            0
        }
        Ok(Err(code)) => code,
        Err(_) => {
            let stage = result.stage;
            result = ViviLocalAssetResultV1::empty();
            result.stage = stage;
            result.outcome = INTERNAL;
            result.outcome_may_have_committed = u32::from(mutating_entered);
            unsafe {
                out.write(result);
            }
            0
        }
    }
}

/// Returns this opt-in local bridge's version; independent of the runtime ABI.
#[unsafe(no_mangle)]
pub extern "C" fn vivi_local_asset_get_abi_version_v1() -> u32 {
    1
}

/// Creates one owned strong cancellation reference.
/// # Safety
/// `out` must be aligned, live writable pointer storage.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_local_asset_cancel_create_v1(
    out: *mut *mut ViviLocalAssetCancelV1,
) -> i32 {
    if !aligned(out) {
        return INVALID;
    }
    unsafe {
        out.write(ptr::null_mut());
    }
    match catch_unwind(|| Arc::into_raw(Arc::new(AtomicBool::new(false)))) {
        Ok(p) => {
            unsafe {
                out.write(p.cast_mut().cast());
            }
            0
        }
        Err(_) => PANIC,
    }
}
/// Adds a separately owned strong reference; no allocation or host access.
/// # Safety
/// Caller must already own a live reference and retain it through this operation.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_local_asset_cancel_retain_v1(p: *mut ViviLocalAssetCancelV1) {
    if !p.is_null() {
        unsafe {
            Arc::increment_strong_count(p.cast::<AtomicBool>());
        }
    }
}
/// Requests cancellation, without promising rollback or work completion.
/// # Safety
/// A nonnull pointer must have a live independently owned strong reference.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_local_asset_cancel_request_v1(p: *mut ViviLocalAssetCancelV1) {
    if !p.is_null() {
        unsafe { &*p.cast::<AtomicBool>() }.store(true, Ordering::Release);
    }
}
/// Consumes exactly one owned strong reference. Null is a no-op.
/// # Safety
/// Every nonnull release must correspond to one unreleased create/retain reference.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_local_asset_cancel_release_v1(p: *mut ViviLocalAssetCancelV1) {
    if !p.is_null() {
        unsafe {
            Arc::decrement_strong_count(p.cast::<AtomicBool>());
        }
    }
}

/// Resolves through the real host; once entered, its actual outcome wins over cancellation.
/// # Safety
/// All C ranges/handles must be live, aligned and immutable, and disjoint from writable `out`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_local_asset_resolve_v1(
    ep: *const ViviLocalAssetEndpointV1,
    input: *const ViviLocalAssetRefV1,
    width: u32,
    height: u32,
    cancel: *mut ViviLocalAssetCancelV1,
    out: *mut ViviLocalAssetResultV1,
) -> i32 {
    unsafe {
        operation(out, cancel, |flag, result, _| {
            let (path, principal) = endpoint(ep)?;
            let reference = reference(input)?;
            result.stage = 1;
            if flag.load(Ordering::Acquire) {
                result.outcome = CANCELLED;
                return Ok(());
            }
            result.stage = 6;
            let host = match LocalAssetHost::open(path, principal) {
                Ok(v) => v,
                Err(e) => {
                    result.host_error(e, false);
                    return Ok(());
                }
            };
            result.stage = 7;
            match host.resolve_referenced_png(&reference, width, height) {
                Ok(ReferencedAtlasResolutionV1::Ready(v)) => result.ready(v, false),
                Ok(ReferencedAtlasResolutionV1::Missing) => result.outcome = MISSING,
                Err(e) => result.host_error(e, false),
            }
            Ok(())
        })
    }
}

/// Materializes with the unchanged real decoder/store; no invented in-call cancel checkpoint.
/// # Safety
/// All ranges/handles obey the same live, aligned, disjoint caller obligations as resolve.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_local_asset_materialize_v1(
    ep: *const ViviLocalAssetEndpointV1,
    png: *const u8,
    png_len: u64,
    width: u32,
    height: u32,
    cancel: *mut ViviLocalAssetCancelV1,
    out: *mut ViviLocalAssetResultV1,
) -> i32 {
    unsafe {
        operation(out, cancel, |flag, result, entered| {
            let (path, principal) = endpoint(ep)?;
            let png = bytes(png, png_len)?;
            result.stage = 1;
            if flag.load(Ordering::Acquire) {
                result.outcome = CANCELLED;
                return Ok(());
            }
            result.stage = 6;
            let mut host = match LocalAssetHost::open(path, principal) {
                Ok(v) => v,
                Err(e) => {
                    result.host_error(e, false);
                    return Ok(());
                }
            };
            result.stage = 8;
            *entered = true;
            match host.materialize_embedded_png(png, width, height) {
                Ok(v) => result.ready(v, true),
                Err(e) => result.host_error(e, e.kind() == LocalAssetHostErrorKind::Store),
            }
            Ok(())
        })
    }
}

/// Transfers one owned exact closure, dropping its source connection before receiver open.
/// # Safety
/// All input ranges and cancellation references remain live/disjoint until return.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vivi_local_asset_transfer_v1(
    source: *const ViviLocalAssetEndpointV1,
    receiver: *const ViviLocalAssetEndpointV1,
    input: *const ViviLocalAssetRefV1,
    width: u32,
    height: u32,
    cancel: *mut ViviLocalAssetCancelV1,
    out: *mut ViviLocalAssetResultV1,
) -> i32 {
    unsafe {
        operation(out, cancel, |flag, result, entered| {
            let (source_path, source_principal) = endpoint(source)?;
            let (receiver_path, receiver_principal) = endpoint(receiver)?;
            let reference = reference(input)?;
            result.stage = 1;
            if flag.load(Ordering::Acquire) {
                result.outcome = CANCELLED;
                return Ok(());
            }
            result.stage = 2;
            let closure = {
                let host = match LocalAssetHost::open(source_path, source_principal) {
                    Ok(v) => v,
                    Err(e) => {
                        result.host_error(e, false);
                        return Ok(());
                    }
                };
                result.stage = 3;
                // Framing admits representable non-PNG references: preserve E-01 Missing precedence.
                match host.export_png_closure(&reference, width, height, flag) {
                    Ok(ExportPngClosureV1::Ready(v)) => v,
                    Ok(ExportPngClosureV1::Missing) => {
                        result.outcome = MISSING;
                        return Ok(());
                    }
                    Err(e) => {
                        result.transfer_error(e);
                        return Ok(());
                    }
                }
            };
            result.stage = 4;
            let mut host = match LocalAssetHost::open(receiver_path, receiver_principal) {
                Ok(v) => v,
                Err(e) => {
                    result.host_error(e, false);
                    return Ok(());
                }
            };
            result.stage = 5;
            *entered = true;
            match host.import_png_closure(&reference, &closure, width, height, flag) {
                Ok(v) => result.ready(v, true),
                Err(e) => result.transfer_error(e),
            }
            Ok(())
        })
    }
}
