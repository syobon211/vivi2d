use super::*;
use crate::host::{
    export_png_closure_from_store, import_png_closure_into_store, publish_transfer_blob,
};
use crate::{ExportPngClosureV1, PngClosureExportV1, PngClosureObjectV1, PngTransferErrorKind};
use std::sync::atomic::{AtomicBool, Ordering};
use vivi_asset_resolver::{EmbeddedBlobStore, ResolvePng, resolve_referenced_png};
use vivi_asset_store_local::{LocalImmutableAssetStore, LocalStoreError};

fn ready_export(host: &LocalAssetHost, reference: &AssetRef) -> PngClosureExportV1 {
    let ExportPngClosureV1::Ready(value) = host
        .export_png_closure(reference, 1, 1, &AtomicBool::new(false))
        .unwrap()
    else {
        panic!("actual source PNG must resolve");
    };
    value
}

fn copy_closure(value: &PngClosureExportV1) -> PngClosureExportV1 {
    PngClosureExportV1 {
        reference: value.reference.clone(),
        width: value.width,
        height: value.height,
        objects: value
            .objects
            .iter()
            .map(|o| PngClosureObjectV1 {
                address: o.address,
                bytes: o.bytes.clone(),
            })
            .collect(),
    }
}

fn actual_bytes(temp: &TempDir, owner: &PrincipalId, reference: &AssetRef) -> Vec<u8> {
    let store =
        LocalImmutableAssetStore::open(temp.path().join("assets.sqlite3"), owner.clone()).unwrap();
    let ResolvePng::Ready(ready) = resolve_referenced_png(&store, owner, reference, 1, 1).unwrap()
    else {
        panic!("actual reopened resolver must return Ready");
    };
    ready.logical_bytes().to_vec()
}

#[test]
fn blob_transfer_owns_source_bytes_and_resolves_in_two_reopened_principal_stores() {
    let source_temp = private_tempdir();
    let target_temp = private_tempdir();
    let receiver_principal = PrincipalId::new(b"different-receiver-principal".to_vec());
    let mut source = open_host(&source_temp);
    let png = png_bytes();
    let original = source.materialize_embedded_png(&png, 1, 1).unwrap();
    let transfer = ready_export(&source, &original.asset);
    assert_eq!(transfer.reference(), &original.asset);
    assert_eq!((transfer.width(), transfer.height()), (1, 1));
    assert_eq!(transfer.objects().len(), 1);
    assert_eq!(transfer.objects()[0].bytes(), png);
    assert_eq!(
        transfer.objects()[0].address(),
        original.asset.object_address
    );
    drop(source);
    let mut destination = LocalAssetHost::open(
        target_temp.path().join("assets.sqlite3"),
        receiver_principal.clone(),
    )
    .unwrap();
    assert_eq!(
        destination
            .import_png_closure(&original.asset, &transfer, 1, 1, &AtomicBool::new(false))
            .unwrap(),
        original
    );
    drop(destination);
    assert_eq!(
        actual_bytes(&source_temp, &principal(), &original.asset),
        png
    );
    assert_eq!(
        actual_bytes(&target_temp, &receiver_principal, &original.asset),
        png
    );
}

#[test]
fn repeated_manifest_transfer_preserves_received_raw_bytes_and_unique_physical_objects() {
    let source_temp = private_tempdir();
    let target_temp = private_tempdir();
    let png = large_valid_png_with_repeated_first_two_chunks();
    let mut bundle = manifest_bundle(png.clone());
    // A semantically equivalent, noncanonical received body must be kept exact.
    bundle.contract.raw.extend_from_slice(b" \n");
    let mut source = open_host(&source_temp);
    let closure =
        ReferencedPngManifestClosureV1::new(closure_objects(&bundle.contract, &bundle.chunks));
    source
        .ingest_referenced_png_manifest_closure(&bundle.contract.reference, &closure, 1, 1)
        .unwrap();
    let transfer = ready_export(&source, &bundle.contract.reference);
    assert_eq!(transfer.objects.len(), 3); // manifest + two unique physical chunks
    assert_eq!(
        transfer.objects[0].address,
        bundle.contract.reference.object_address
    );
    assert_eq!(transfer.objects[0].bytes, bundle.contract.raw);
    assert_eq!(transfer.objects[1].bytes, bundle.chunks[0].bytes);
    assert_eq!(transfer.objects[2].bytes, bundle.chunks[2].bytes);
    drop(source);
    let mut destination = open_host(&target_temp);
    let attestation = destination
        .import_png_closure(
            &bundle.contract.reference,
            &transfer,
            1,
            1,
            &AtomicBool::new(false),
        )
        .unwrap();
    assert_eq!(attestation.asset, bundle.contract.reference);
    // Exact immutable replay is idempotent.
    assert_eq!(
        destination
            .import_png_closure(
                &bundle.contract.reference,
                &transfer,
                1,
                1,
                &AtomicBool::new(false)
            )
            .unwrap(),
        attestation
    );
    let mut different_raw = copy_closure(&transfer);
    different_raw.objects[0].bytes.extend_from_slice(b" ");
    let conflict = destination
        .import_png_closure(
            &bundle.contract.reference,
            &different_raw,
            1,
            1,
            &AtomicBool::new(false),
        )
        .unwrap_err();
    assert_eq!(
        conflict.store_kind(),
        Some(LocalStoreErrorKind::ImmutableConflict)
    );
    assert!(conflict.outcome_may_have_committed());
    drop(destination);
    assert_eq!(
        actual_bytes(&source_temp, &principal(), &bundle.contract.reference),
        png
    );
    assert_eq!(
        actual_bytes(&target_temp, &principal(), &bundle.contract.reference),
        png
    );
    let store =
        LocalImmutableAssetStore::open(target_temp.path().join("assets.sqlite3"), principal())
            .unwrap();
    let ObjectRead::Snapshot(raw) = store
        .object(
            &principal(),
            bundle.contract.reference.object_address,
            1_048_576,
        )
        .unwrap()
    else {
        panic!("manifest persisted");
    };
    assert_eq!(raw.bytes, bundle.contract.raw);
}

#[derive(Clone, Copy)]
enum Fault {
    None,
    Before(usize),
    AfterDescriptor,
}

#[derive(Debug)]
enum TransferStoreError {
    Injected,
    Store(LocalStoreError),
}

struct PersistentWrites<'a> {
    store: LocalImmutableAssetStore,
    calls: usize,
    fault: Fault,
    cancel_after_first: Option<&'a AtomicBool>,
}

impl PersistentWrites<'_> {
    fn new(temp: &TempDir, fault: Fault) -> Self {
        Self {
            store: LocalImmutableAssetStore::open(temp.path().join("assets.sqlite3"), principal())
                .unwrap(),
            calls: 0,
            fault,
            cancel_after_first: None,
        }
    }
    fn before(&mut self) -> Result<(), TransferStoreError> {
        self.calls += 1;
        if matches!(self.fault,Fault::Before(n) if n==self.calls) {
            Err(TransferStoreError::Injected)
        } else {
            Ok(())
        }
    }
    fn after(&self, descriptor: bool) -> Result<(), TransferStoreError> {
        if self.calls == 1
            && let Some(flag) = self.cancel_after_first
        {
            flag.store(true, Ordering::Release);
        }
        if descriptor && matches!(self.fault, Fault::AfterDescriptor) {
            Err(TransferStoreError::Injected)
        } else {
            Ok(())
        }
    }
}

fn classify(error: TransferStoreError) -> Option<LocalStoreErrorKind> {
    match error {
        TransferStoreError::Store(e) => Some(e.kind()),
        TransferStoreError::Injected => None,
    }
}

impl EmbeddedBlobStore for PersistentWrites<'_> {
    type Error = TransferStoreError;
    fn put_verified_blob_if_absent(
        &mut self,
        p: &PrincipalId,
        a: Digest,
        b: &[u8],
    ) -> Result<(), Self::Error> {
        self.before()?;
        EmbeddedBlobStore::put_verified_blob_if_absent(&mut self.store, p, a, b)
            .map_err(TransferStoreError::Store)?;
        self.after(false)
    }
    fn put_descriptor_if_absent(
        &mut self,
        p: &PrincipalId,
        r: &AssetRef,
        d: &Descriptor,
    ) -> Result<(), Self::Error> {
        self.before()?;
        EmbeddedBlobStore::put_descriptor_if_absent(&mut self.store, p, r, d)
            .map_err(TransferStoreError::Store)?;
        self.after(true)
    }
}

impl ReferencedPngManifestWriteStore for PersistentWrites<'_> {
    type Error = TransferStoreError;
    fn put_verified_chunk_if_absent(
        &mut self,
        p: &PrincipalId,
        a: Digest,
        b: &[u8],
    ) -> Result<(), OperationError<Self::Error>> {
        self.before().map_err(OperationError::StoreUnavailable)?;
        self.store
            .put_verified_chunk_if_absent(p, a, b)
            .map_err(|e| OperationError::StoreUnavailable(TransferStoreError::Store(e)))?;
        self.after(false).map_err(OperationError::StoreUnavailable)
    }
    fn put_chunk_manifest_if_absent(
        &mut self,
        p: &PrincipalId,
        b: &[u8],
    ) -> Result<(), OperationError<Self::Error>> {
        self.before().map_err(OperationError::StoreUnavailable)?;
        self.store
            .put_chunk_manifest_if_absent(p, b)
            .map_err(|e| match e {
                OperationError::Asset(e) => OperationError::Asset(e),
                OperationError::StoreUnavailable(e) => {
                    OperationError::StoreUnavailable(TransferStoreError::Store(e))
                }
            })?;
        self.after(false).map_err(OperationError::StoreUnavailable)
    }
    fn put_descriptor_if_absent(
        &mut self,
        p: &PrincipalId,
        r: &AssetRef,
        d: &Descriptor,
    ) -> Result<(), OperationError<Self::Error>> {
        EmbeddedBlobStore::put_descriptor_if_absent(self, p, r, d)
            .map_err(OperationError::StoreUnavailable)
    }
}

fn assert_unwritten(store: &PersistentWrites<'_>, closure: &PngClosureExportV1) {
    assert_eq!(store.calls, 0);
    assert!(
        store
            .store
            .descriptor(&principal(), &closure.reference)
            .unwrap()
            .is_none()
    );
    for object in &closure.objects {
        assert!(matches!(
            store
                .store
                .object(&principal(), object.address, 68_157_440)
                .unwrap(),
            ObjectRead::Missing
        ));
    }
}

#[test]
fn transfer_substitutions_are_rejected_before_any_destination_put() {
    let source_temp = private_tempdir();
    let mut source = open_host(&source_temp);
    let asset = source
        .materialize_embedded_png(&png_bytes(), 1, 1)
        .unwrap()
        .asset;
    let blob = ready_export(&source, &asset);
    let target_temp = private_tempdir();
    let mut target = PersistentWrites::new(&target_temp, Fault::None);
    let mut wrong = copy_closure(&blob);
    wrong.reference.object_address = digest(61);
    wrong.reference.content_sha256 = digest(61);
    wrong.objects[0].address = digest(61);
    let error = import_png_closure_into_store(
        &mut target,
        &principal(),
        &wrong.reference,
        &wrong,
        1,
        1,
        &AtomicBool::new(false),
        &classify,
    )
    .unwrap_err();
    assert_eq!(error.asset_code(), Some(AssetErrorCode::HashMismatch));
    assert!(!error.outcome_may_have_committed());
    assert_unwritten(&target, &wrong);
    let error = import_png_closure_into_store(
        &mut target,
        &principal(),
        &asset,
        &blob,
        2,
        1,
        &AtomicBool::new(false),
        &classify,
    )
    .unwrap_err();
    assert_eq!(error.asset_code(), Some(AssetErrorCode::DimensionMismatch));
    assert_unwritten(&target, &blob);

    let bundle = manifest_bundle(large_valid_png_with_repeated_first_two_chunks());
    source
        .ingest_referenced_png_manifest_closure(
            &bundle.contract.reference,
            &ReferencedPngManifestClosureV1::new(closure_objects(&bundle.contract, &bundle.chunks)),
            1,
            1,
        )
        .unwrap();
    let original = ready_export(&source, &bundle.contract.reference);
    for mutation in 0..3 {
        let mut tampered = copy_closure(&original);
        match mutation {
            0 => tampered.objects[0].bytes[0] = b'!',
            1 => tampered.objects[1].bytes[0] ^= 1,
            _ => tampered.objects.push(PngClosureObjectV1 {
                address: digest(62),
                bytes: vec![1],
            }),
        }
        let error = import_png_closure_into_store(
            &mut target,
            &principal(),
            &tampered.reference,
            &tampered,
            1,
            1,
            &AtomicBool::new(false),
            &classify,
        )
        .unwrap_err();
        assert_eq!(
            error.kind(),
            PngTransferErrorKind::Host(LocalAssetHostErrorKind::Asset)
        );
        assert!(!error.outcome_may_have_committed());
        assert_unwritten(&target, &tampered);
    }
}

#[test]
fn cancelled_transfer_performs_no_source_reads_or_destination_puts_and_late_cancel_completes() {
    let cancel = AtomicBool::new(true);
    let source = ScriptedStore::default();
    let error = export_png_closure_from_store(
        &source,
        &principal(),
        &blob_reference(7),
        1,
        1,
        &cancel,
        &|never| match never {},
    )
    .unwrap_err();
    assert_eq!(
        error.kind(),
        PngTransferErrorKind::CancelledBeforePublication
    );
    assert_eq!(source.calls.get(), 0);
    let source_temp = private_tempdir();
    let mut source = open_host(&source_temp);
    let asset = source
        .materialize_embedded_png(&png_bytes(), 1, 1)
        .unwrap()
        .asset;
    let closure = ready_export(&source, &asset);
    let target_temp = private_tempdir();
    let mut target = PersistentWrites::new(&target_temp, Fault::None);
    let error = import_png_closure_into_store(
        &mut target,
        &principal(),
        &asset,
        &closure,
        1,
        1,
        &cancel,
        &classify,
    )
    .unwrap_err();
    assert_eq!(
        error.kind(),
        PngTransferErrorKind::CancelledBeforePublication
    );
    assert_unwritten(&target, &closure);
    // Independently perform the real full decode, then exercise the exact
    // shared post-validation/pre-first-write function used by Blob import.
    let prepared = prepare_embedded_png(&png_bytes(), 1, 1).unwrap();
    let error = publish_transfer_blob(&mut target, &principal(), &prepared, &cancel, &classify)
        .unwrap_err();
    assert_eq!(
        error.kind(),
        PngTransferErrorKind::CancelledBeforePublication
    );
    assert_unwritten(&target, &closure);
    cancel.store(false, Ordering::Release);
    target.cancel_after_first = Some(&cancel);
    let result = import_png_closure_into_store(
        &mut target,
        &principal(),
        &asset,
        &closure,
        1,
        1,
        &cancel,
        &classify,
    )
    .unwrap();
    assert_eq!(result.asset, asset);
    assert!(cancel.load(Ordering::Acquire));
    assert_eq!(target.calls, 2);
    drop(target);
    assert_eq!(
        actual_bytes(&target_temp, &principal(), &asset),
        png_bytes()
    );
}

#[test]
fn export_keeps_resolver_missing_descriptor_and_store_error_precedence() {
    let source_temp = private_tempdir();
    let source = open_host(&source_temp);
    let mut jpeg = blob_reference(7);
    jpeg.size_bytes = 1;
    jpeg.media_type = "image/jpeg".to_owned();
    assert!(matches!(
        source
            .export_png_closure(&jpeg, 1, 1, &AtomicBool::new(false))
            .unwrap(),
        ExportPngClosureV1::Missing
    ));
    drop(source);
    let png = png_bytes();
    let prepared = prepare_embedded_png(&png, 1, 1).unwrap();
    let mut store =
        LocalImmutableAssetStore::open(source_temp.path().join("assets.sqlite3"), principal())
            .unwrap();
    EmbeddedBlobStore::put_verified_blob_if_absent(
        &mut store,
        &principal(),
        prepared.reference().object_address,
        &png,
    )
    .unwrap();
    drop(store);
    let source = open_host(&source_temp);
    let mut without_descriptor = prepared.reference().clone();
    without_descriptor.media_type = "image/jpeg".to_owned();
    let error = source
        .export_png_closure(&without_descriptor, 1, 1, &AtomicBool::new(false))
        .unwrap_err();
    assert_eq!(error.asset_code(), Some(AssetErrorCode::DescriptorMismatch));
    drop(source);
    let store =
        LocalImmutableAssetStore::open(source_temp.path().join("assets.sqlite3"), principal())
            .unwrap();
    let absent = export_png_closure_from_store(
        &store,
        &PrincipalId::new(b"wrong-principal".to_vec()),
        prepared.reference(),
        1,
        1,
        &AtomicBool::new(false),
        &|e: LocalStoreError| Some(e.kind()),
    )
    .unwrap();
    // Existing read-store policy hides another principal's objects as Missing;
    // export must preserve it rather than revealing a different error class.
    assert!(matches!(absent, ExportPngClosureV1::Missing));
    let failure = FailingStore::default();
    let error = export_png_closure_from_store(
        &failure,
        &principal(),
        prepared.reference(),
        1,
        1,
        &AtomicBool::new(false),
        &|_| None,
    )
    .unwrap_err();
    assert_eq!(
        error.kind(),
        PngTransferErrorKind::Host(LocalAssetHostErrorKind::Store)
    );
    assert!(!format!("{error:?} {error}").contains("secret-native-detail"));
}

#[test]
fn export_bounds_corrupt_bytes_and_dto_debug_are_fail_closed_and_redacted() {
    let prepared = prepare_embedded_png(&png_bytes(), 1, 1).unwrap();
    let mut oversized = prepared.reference().clone();
    oversized.size_bytes = 16_777_217;
    let store = ScriptedStore::default();
    let error = export_png_closure_from_store(
        &store,
        &principal(),
        &oversized,
        1,
        1,
        &AtomicBool::new(false),
        &|never| match never {},
    )
    .unwrap_err();
    assert_eq!(error.asset_code(), Some(AssetErrorCode::LimitExceeded));
    assert_eq!(store.calls.get(), 0);
    let mut corrupt = png_bytes();
    corrupt[10] ^= 1;
    let store = ScriptedStore::with_ready(prepared.reference().clone(), corrupt);
    let error = export_png_closure_from_store(
        &store,
        &principal(),
        prepared.reference(),
        1,
        1,
        &AtomicBool::new(false),
        &|never| match never {},
    )
    .unwrap_err();
    assert_eq!(
        error.kind(),
        PngTransferErrorKind::Host(LocalAssetHostErrorKind::Asset)
    );
    let mut reference = prepared.reference().clone();
    reference.media_type = "sensitive-media-marker".to_owned();
    let dto = PngClosureExportV1 {
        reference,
        width: 1,
        height: 1,
        objects: vec![PngClosureObjectV1 {
            address: digest(7),
            bytes: b"sensitive-payload-marker".to_vec(),
        }],
    };
    let debug = format!("{dto:?} {:?}", dto.objects[0]);
    for marker in [
        "sensitive-media-marker",
        "sensitive-payload-marker",
        &digest(7).to_lower_hex(),
    ] {
        assert!(!debug.contains(marker));
    }
    assert!(debug.contains("object_count"));
    assert!(debug.contains("bytes_len"));
}

#[test]
fn blob_interruption_and_ambiguous_descriptor_commit_reopen_and_replay() {
    let source_temp = private_tempdir();
    let mut source = open_host(&source_temp);
    let asset = source
        .materialize_embedded_png(&png_bytes(), 1, 1)
        .unwrap()
        .asset;
    let closure = ready_export(&source, &asset);
    drop(source);
    for fault in [Fault::Before(2), Fault::AfterDescriptor] {
        let target_temp = private_tempdir();
        let mut target = PersistentWrites::new(&target_temp, fault);
        let error = import_png_closure_into_store(
            &mut target,
            &principal(),
            &asset,
            &closure,
            1,
            1,
            &AtomicBool::new(false),
            &classify,
        )
        .unwrap_err();
        assert_eq!(
            error.kind(),
            PngTransferErrorKind::Host(LocalAssetHostErrorKind::Store)
        );
        assert!(error.outcome_may_have_committed());
        assert!(error.asset_code().is_none());
        drop(target);
        let mut reopened = open_host(&target_temp);
        match fault {
            Fault::Before(2) => assert_eq!(
                reopened
                    .resolve_referenced_png(&asset, 1, 1)
                    .unwrap_err()
                    .asset_code(),
                Some(AssetErrorCode::DescriptorMismatch)
            ),
            Fault::AfterDescriptor => assert!(matches!(
                reopened.resolve_referenced_png(&asset, 1, 1).unwrap(),
                ReferencedAtlasResolutionV1::Ready(_)
            )),
            _ => unreachable!(),
        }
        reopened
            .import_png_closure(&asset, &closure, 1, 1, &AtomicBool::new(false))
            .unwrap();
        drop(reopened);
        assert_eq!(
            actual_bytes(&target_temp, &principal(), &asset),
            png_bytes()
        );
    }
}

#[test]
fn manifest_interruption_never_partial_ready_and_exact_replay_preserves_existing_bytes() {
    let source_temp = private_tempdir();
    let mut source = open_host(&source_temp);
    let png = large_valid_png_with_repeated_first_two_chunks();
    let bundle = manifest_bundle(png.clone());
    source
        .ingest_referenced_png_manifest_closure(
            &bundle.contract.reference,
            &ReferencedPngManifestClosureV1::new(closure_objects(&bundle.contract, &bundle.chunks)),
            1,
            1,
        )
        .unwrap();
    let closure = ready_export(&source, &bundle.contract.reference);
    drop(source);
    for fault in [Fault::Before(2), Fault::Before(4), Fault::AfterDescriptor] {
        let target_temp = private_tempdir();
        let mut target = PersistentWrites::new(&target_temp, fault);
        let error = import_png_closure_into_store(
            &mut target,
            &principal(),
            &closure.reference,
            &closure,
            1,
            1,
            &AtomicBool::new(false),
            &classify,
        )
        .unwrap_err();
        assert_eq!(
            error.kind(),
            PngTransferErrorKind::Host(LocalAssetHostErrorKind::Store)
        );
        assert!(error.outcome_may_have_committed());
        drop(target);
        let mut reopened = open_host(&target_temp);
        let result = reopened.resolve_referenced_png(&closure.reference, 1, 1);
        match fault {
            Fault::Before(2) => assert_eq!(result.unwrap(), ReferencedAtlasResolutionV1::Missing),
            Fault::Before(4) => assert_eq!(
                result.unwrap_err().asset_code(),
                Some(AssetErrorCode::DescriptorMismatch)
            ),
            Fault::AfterDescriptor => assert!(matches!(
                result.unwrap(),
                ReferencedAtlasResolutionV1::Ready(_)
            )),
            _ => unreachable!(),
        }
        reopened
            .import_png_closure(&closure.reference, &closure, 1, 1, &AtomicBool::new(false))
            .unwrap();
        drop(reopened);
        assert_eq!(
            actual_bytes(&target_temp, &principal(), &closure.reference),
            png
        );
        let store =
            LocalImmutableAssetStore::open(target_temp.path().join("assets.sqlite3"), principal())
                .unwrap();
        for object in &closure.objects {
            let ObjectRead::Snapshot(actual) = store
                .object(&principal(), object.address, 68_157_440)
                .unwrap()
            else {
                panic!("immutable object");
            };
            assert_eq!(actual.bytes, object.bytes);
        }
    }
}

#[test]
fn manifest_postvalidation_cancellation_has_zero_puts_and_late_cancellation_completes() {
    let bundle = manifest_bundle(large_valid_png_with_repeated_first_two_chunks());
    let closure =
        ReferencedPngManifestClosureV1::new(closure_objects(&bundle.contract, &bundle.chunks));
    let target_temp = private_tempdir();
    let mut target = PersistentWrites::new(&target_temp, Fault::None);
    let cancel = AtomicBool::new(true);
    // Call the same validating/private publication seam used by import, so
    // this reaches its final checkpoint instead of import's initial check.
    let error = crate::host::ingest_manifest_with_cancellation(
        &mut target,
        &principal(),
        &bundle.contract.reference,
        &closure,
        1,
        1,
        Some(&cancel),
        &classify,
    )
    .unwrap_err();
    assert_eq!(
        error.kind(),
        PngTransferErrorKind::CancelledBeforePublication
    );
    assert_eq!(target.calls, 0);
    assert!(!error.outcome_may_have_committed());
    assert!(
        target
            .store
            .descriptor(&principal(), &bundle.contract.reference)
            .unwrap()
            .is_none()
    );
    for object in &closure.objects {
        let address = Digest::from_hex(object.wire_object_address).unwrap();
        assert!(matches!(
            target
                .store
                .object(&principal(), address, 68_157_440)
                .unwrap(),
            ObjectRead::Missing
        ));
    }
    cancel.store(false, Ordering::Release);
    target.cancel_after_first = Some(&cancel);
    let value = crate::host::ingest_manifest_with_cancellation(
        &mut target,
        &principal(),
        &bundle.contract.reference,
        &closure,
        1,
        1,
        Some(&cancel),
        &classify,
    )
    .unwrap();
    assert_eq!(value.asset, bundle.contract.reference);
    assert_eq!(target.calls, 4);
    assert!(cancel.load(Ordering::Acquire));
}

#[test]
fn cancellation_after_actual_source_resolution_discards_the_owned_export() {
    struct CancellingReads<'a> {
        store: &'a LocalImmutableAssetStore,
        flag: &'a AtomicBool,
    }
    impl AssetReadStore for CancellingReads<'_> {
        type Error = LocalStoreError;
        fn descriptor(
            &self,
            p: &PrincipalId,
            r: &AssetRef,
        ) -> Result<Option<Descriptor>, Self::Error> {
            let value = self.store.descriptor(p, r)?;
            self.flag.store(true, Ordering::Release);
            Ok(value)
        }
        fn object(&self, p: &PrincipalId, a: Digest, n: u64) -> Result<ObjectRead, Self::Error> {
            self.store.object(p, a, n)
        }
    }
    let temp = private_tempdir();
    let mut host = open_host(&temp);
    let reference = host
        .materialize_embedded_png(&png_bytes(), 1, 1)
        .unwrap()
        .asset;
    drop(host);
    let store =
        LocalImmutableAssetStore::open(temp.path().join("assets.sqlite3"), principal()).unwrap();
    let flag = AtomicBool::new(false);
    let source = CancellingReads {
        store: &store,
        flag: &flag,
    };
    let error = export_png_closure_from_store(
        &source,
        &principal(),
        &reference,
        1,
        1,
        &flag,
        &|e: LocalStoreError| Some(e.kind()),
    )
    .unwrap_err();
    assert_eq!(
        error.kind(),
        PngTransferErrorKind::CancelledBeforePublication
    );
    assert!(!error.outcome_may_have_committed());
    assert_eq!(actual_bytes(&temp, &principal(), &reference), png_bytes());
}
