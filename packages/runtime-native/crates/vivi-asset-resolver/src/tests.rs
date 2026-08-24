use std::cell::{Cell, RefCell};
use std::collections::BTreeMap;

use base64::Engine as _;
use sha2::{Digest as _, Sha256};

use crate::manifest::{
    CHUNK_BYTES, MANIFEST_INPUT_MAX_BYTES, MAX_CHUNKS, MAX_LOGICAL_BYTES,
    validate_stage1_for_parity,
};
use crate::*;

const PRINCIPAL: &[u8] = b"principal-a";

fn digest(bytes: &[u8]) -> Digest {
    let hash = Sha256::digest(bytes);
    let mut value = [0_u8; Digest::LENGTH];
    value.copy_from_slice(&hash);
    Digest::from_bytes(value)
}

fn png_fixture() -> (Vec<u8>, Digest, u32, u32) {
    let fixture: serde_json::Value = serde_json::from_str(include_str!(
        "../tests/fixtures/asset-model-v1-resolver.json"
    ))
    .expect("fixture JSON");
    let png = &fixture["png"];
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(png["base64"].as_str().expect("base64"))
        .expect("fixture base64");
    let expected = Digest::from_hex(png["sha256"].as_str().expect("sha256")).expect("digest");
    assert_eq!(digest(&bytes), expected);
    (
        bytes,
        expected,
        u32::try_from(png["width"].as_u64().expect("width")).expect("u32"),
        u32::try_from(png["height"].as_u64().expect("height")).expect("u32"),
    )
}

fn blob_reference(bytes: &[u8]) -> AssetRef {
    let hash = digest(bytes);
    AssetRef {
        object_address: hash,
        storage_kind: StorageKind::Blob,
        content_sha256: hash,
        media_type: "image/png".to_owned(),
        size_bytes: bytes.len() as u64,
    }
}

fn snapshot(address: Digest, state: ObjectState, generation: u64, bytes: Vec<u8>) -> ObjectRead {
    ObjectRead::Snapshot(ObjectSnapshot {
        address,
        storage_generation: generation,
        state,
        bytes,
    })
}

#[derive(Default)]
struct TestReadStore {
    principal: Vec<u8>,
    descriptor: Option<Descriptor>,
    objects: BTreeMap<Digest, ObjectRead>,
    object_calls: RefCell<Vec<(Digest, u64)>>,
    descriptor_calls: RefCell<Vec<AssetRef>>,
    events: RefCell<Vec<&'static str>>,
    fail_objects: bool,
    fail_descriptors: bool,
    ignore_bounds: bool,
}

impl AssetReadStore for TestReadStore {
    type Error = &'static str;

    fn descriptor(
        &self,
        principal: &PrincipalId,
        expected: &AssetRef,
    ) -> Result<Option<Descriptor>, Self::Error> {
        self.events.borrow_mut().push("descriptor");
        self.descriptor_calls.borrow_mut().push(expected.clone());
        if self.fail_descriptors {
            return Err("descriptor backend failed");
        }
        if principal.as_bytes() != self.principal {
            return Ok(None);
        }
        Ok(self.descriptor.clone())
    }

    fn object(
        &self,
        principal: &PrincipalId,
        object_address: Digest,
        max_bytes: u64,
    ) -> Result<ObjectRead, Self::Error> {
        self.events.borrow_mut().push("object");
        self.object_calls
            .borrow_mut()
            .push((object_address, max_bytes));
        if self.fail_objects {
            return Err("object backend failed");
        }
        if principal.as_bytes() != self.principal {
            return Ok(ObjectRead::Missing);
        }
        let result = self
            .objects
            .get(&object_address)
            .cloned()
            .unwrap_or(ObjectRead::Missing);
        if !self.ignore_bounds
            && matches!(&result, ObjectRead::Snapshot(value) if value.bytes.len() as u64 > max_bytes)
        {
            return Ok(ObjectRead::TooLarge);
        }
        Ok(result)
    }
}

fn store_for_blob(bytes: &[u8]) -> (TestReadStore, AssetRef) {
    let reference = blob_reference(bytes);
    let mut store = TestReadStore {
        principal: PRINCIPAL.to_vec(),
        descriptor: Some(Descriptor::from_reference(&reference)),
        ..TestReadStore::default()
    };
    store.objects.insert(
        reference.object_address,
        snapshot(
            reference.object_address,
            ObjectState::Active,
            17,
            bytes.to_vec(),
        ),
    );
    (store, reference)
}

#[test]
fn approved_schema_copy_is_exactly_pinned() {
    assert_eq!(APPROVED_ASSET_SCHEMA_BYTES.len(), 6_114);
    assert_eq!(
        digest(APPROVED_ASSET_SCHEMA_BYTES).to_lower_hex(),
        APPROVED_ASSET_SCHEMA_SHA256
    );
    let schema: serde_json::Value =
        serde_json::from_slice(APPROVED_ASSET_SCHEMA_BYTES).expect("approved schema JSON");
    assert_eq!(
        schema["$id"],
        "https://vivi2d.com/spec/asset-model-v1.schema.json"
    );
    assert_eq!(schema["x-vivi-status"], "approved-amendment-1");
}

#[test]
fn stage1_parity_corpus_matches_compiled_equivalent() {
    let corpus: serde_json::Value =
        serde_json::from_str(include_str!("../tests/fixtures/schema-stage1-parity.json"))
            .expect("parity fixture JSON");
    for vector in corpus["vectors"].as_array().expect("vectors") {
        let raw = if let Some(raw) = vector.get("rawJson") {
            raw.as_str().expect("rawJson").as_bytes().to_vec()
        } else if vector.get("value").is_some() {
            serde_json::to_vec(&vector["value"]).expect("serialize parity value")
        } else {
            let mut value = corpus["baseValue"].clone();
            for mutation in vector["mutations"].as_array().expect("mutations") {
                apply_parity_mutation(&mut value, mutation);
            }
            serde_json::to_vec(&value).expect("serialize mutated parity value")
        };
        let stage1 = validate_stage1_for_parity(&raw).is_ok();
        assert_eq!(
            stage1,
            vector["stage1Accepted"].as_bool().expect("stage1Accepted"),
            "Stage1 parity vector {}",
            vector["id"]
        );
        let stage2 = parse_chunk_manifest(&raw).is_ok();
        assert_eq!(
            stage2,
            vector["stage2Accepted"].as_bool().expect("stage2Accepted"),
            "Stage2 parity vector {}",
            vector["id"]
        );
    }
    for vector in corpus["rawParserVectors"].as_array().expect("raw vectors") {
        let raw = vector["rawJson"].as_str().expect("rawJson");
        assert_eq!(
            parse_chunk_manifest(raw.as_bytes()).is_ok(),
            vector["parseAccepted"].as_bool().expect("parseAccepted"),
            "raw parser vector {}",
            vector["id"]
        );
    }
}

fn apply_parity_mutation(value: &mut serde_json::Value, mutation: &serde_json::Value) {
    let operation = mutation["op"].as_str().expect("mutation op");
    if operation == "resizeChunks" {
        let count = usize::try_from(mutation["count"].as_u64().expect("count")).expect("usize");
        let size_bytes = mutation["sizeBytes"].as_u64().expect("sizeBytes");
        let chunk = serde_json::json!({
            "sha256": "0000000000000000000000000000000000000000000000000000000000000000",
            "sizeBytes": size_bytes,
        });
        value["chunks"] = serde_json::Value::Array(vec![chunk; count]);
        return;
    }
    let pointer = mutation["pointer"].as_str().expect("pointer");
    let (parent_pointer, member) = pointer.rsplit_once('/').expect("non-root pointer");
    let parent = if parent_pointer.is_empty() {
        value
    } else {
        value.pointer_mut(parent_pointer).expect("pointer parent")
    };
    match (operation, parent) {
        ("set", serde_json::Value::Object(object)) => {
            object.insert(member.to_owned(), mutation["value"].clone());
        }
        ("set", serde_json::Value::Array(array)) => {
            let index = member.parse::<usize>().expect("array index");
            array[index] = mutation["value"].clone();
        }
        ("remove", serde_json::Value::Object(object)) => {
            object.remove(member).expect("member to remove");
        }
        ("remove", serde_json::Value::Array(array)) => {
            let index = member.parse::<usize>().expect("array index");
            array.remove(index);
        }
        _ => panic!("unsupported parity mutation {operation} at {pointer}"),
    }
}

#[test]
fn frozen_three_chunk_jcs_address_and_received_hex_case_are_exact() {
    let fixture: serde_json::Value = serde_json::from_str(include_str!(
        "../tests/fixtures/asset-model-v1-resolver.json"
    ))
    .expect("fixture JSON");
    let manifest = &fixture["chunkManifest"];
    let raw = serde_json::to_vec(&manifest["value"]).expect("manifest JSON");
    let parsed = parse_chunk_manifest(&raw).expect("frozen manifest");
    assert_eq!(
        parsed.jcs_bytes,
        manifest["expectedJcs"]
            .as_str()
            .expect("expectedJcs")
            .as_bytes()
    );
    assert_eq!(
        parsed.object_address,
        Digest::from_hex(
            manifest["expectedObjectAddress"]
                .as_str()
                .expect("expected address")
        )
        .expect("digest")
    );

    let mut uppercase = manifest["value"].clone();
    uppercase["contentSha256"] = serde_json::Value::String(
        uppercase["contentSha256"]
            .as_str()
            .expect("contentSha256")
            .to_ascii_uppercase(),
    );
    for chunk in uppercase["chunks"].as_array_mut().expect("chunks") {
        chunk["sha256"] = serde_json::Value::String(
            chunk["sha256"]
                .as_str()
                .expect("sha256")
                .to_ascii_uppercase(),
        );
    }
    let parsed_upper =
        parse_chunk_manifest(&serde_json::to_vec(&uppercase).expect("uppercase JSON"))
            .expect("uppercase manifest");
    assert_eq!(parsed_upper.content_sha256, parsed.content_sha256);
    assert_eq!(parsed_upper.chunks, parsed.chunks);
    assert_ne!(parsed_upper.jcs_bytes, parsed.jcs_bytes);
    assert_eq!(
        parsed_upper.object_address,
        Digest::from_hex(
            manifest["uppercaseExpectedObjectAddress"]
                .as_str()
                .expect("uppercase expected")
        )
        .expect("digest")
    );
}

#[test]
fn manifest_preparse_limits_utf8_and_duplicates_have_stable_codes() {
    let too_large = vec![0xff; MANIFEST_INPUT_MAX_BYTES + 1];
    assert_eq!(
        parse_chunk_manifest(&too_large)
            .expect_err("raw limit")
            .code,
        AssetErrorCode::LimitExceeded
    );
    assert_eq!(
        parse_chunk_manifest(b"{\"mediaType\":\"\xc3\x28\"}")
            .expect_err("invalid UTF-8")
            .code,
        AssetErrorCode::ManifestInvalid
    );
    let duplicate =
        br#"{"schema":"vivi2d.assetChunkManifest.v1","schema":"vivi2d.assetChunkManifest.v1"}"#;
    assert_eq!(
        parse_chunk_manifest(duplicate).expect_err("duplicate").code,
        AssetErrorCode::ManifestInvalid
    );
}

#[test]
fn manifest_all_maxima_validate_without_allocating_logical_asset() {
    let chunk = serde_json::json!({
        "sha256": "0000000000000000000000000000000000000000000000000000000000000000",
        "sizeBytes": CHUNK_BYTES,
    });
    let chunks = vec![chunk; MAX_CHUNKS];
    let value = serde_json::json!({
        "schema": "vivi2d.assetChunkManifest.v1",
        "mediaType": "a".repeat(255),
        "contentSha256": "0000000000000000000000000000000000000000000000000000000000000000",
        "sizeBytes": MAX_LOGICAL_BYTES,
        "chunkSizeBytes": CHUNK_BYTES,
        "chunks": chunks,
    });
    let parsed = parse_chunk_manifest(&serde_json::to_vec(&value).expect("max JSON"))
        .expect("all frozen maxima");
    assert_eq!(parsed.chunks.len(), MAX_CHUNKS);
    assert_eq!(parsed.size_bytes, MAX_LOGICAL_BYTES);
    assert_eq!(parsed.jcs_bytes.len(), 803_270);
}

#[test]
fn chunk_layout_and_range_failures_are_distinct() {
    let hash = "00".repeat(32);
    let base = |sizes: [u64; 3], chunk_size: u64, declared: u64| {
        serde_json::json!({
            "schema": "vivi2d.assetChunkManifest.v1",
            "mediaType": "image/png",
            "contentSha256": hash,
            "sizeBytes": declared,
            "chunkSizeBytes": chunk_size,
            "chunks": sizes.map(|size| serde_json::json!({"sha256": hash, "sizeBytes": size})),
        })
    };
    let short = base([4_194_304, CHUNK_BYTES, 1], CHUNK_BYTES, 12_582_913);
    assert_eq!(
        parse_chunk_manifest(&serde_json::to_vec(&short).unwrap())
            .expect_err("non-final short")
            .code,
        AssetErrorCode::ManifestInvalid
    );
    let wrong_const = base([CHUNK_BYTES, CHUNK_BYTES, 1], 4_194_304, 16_777_217);
    assert_eq!(
        parse_chunk_manifest(&serde_json::to_vec(&wrong_const).unwrap())
            .expect_err("wrong const")
            .code,
        AssetErrorCode::ManifestInvalid
    );
    let over = serde_json::json!({
        "schema": "vivi2d.assetChunkManifest.v1",
        "mediaType": "image/png",
        "contentSha256": hash,
        "sizeBytes": MAX_LOGICAL_BYTES + 1,
        "chunkSizeBytes": CHUNK_BYTES,
        "chunks": [
            {"sha256": hash, "sizeBytes": CHUNK_BYTES},
            {"sha256": hash, "sizeBytes": CHUNK_BYTES},
            {"sha256": hash, "sizeBytes": 1}
        ]
    });
    assert_eq!(
        parse_chunk_manifest(&serde_json::to_vec(&over).unwrap())
            .expect_err("logical over")
            .code,
        AssetErrorCode::LimitExceeded
    );
}

#[test]
fn exact_closure_normalizes_case_rejects_collisions_and_deduplicates_expected_repeats() {
    let a = Digest::from_bytes([0xaa; 32]);
    let b = Digest::from_bytes([0xbb; 32]);
    let expected = [a, b, b].into_iter().collect();
    validate_exact_closure(
        &expected,
        &[&a.to_lower_hex().to_ascii_uppercase(), &b.to_lower_hex()],
    )
    .expect("uppercase exact closure");
    assert_eq!(
        validate_exact_closure(
            &[a].into_iter().collect(),
            &[&a.to_lower_hex(), &a.to_lower_hex().to_ascii_uppercase()]
        )
        .expect_err("case collision")
        .code,
        AssetErrorCode::RefSetMismatch
    );
    assert_eq!(
        validate_exact_closure(
            &[a].into_iter().collect(),
            &[&a.to_lower_hex(), &b.to_lower_hex()]
        )
        .expect_err("extra")
        .code,
        AssetErrorCode::RefSetMismatch
    );
}

#[test]
fn exact_closure_supports_union_of_multiple_manifests_beyond_one_manifest_cap() {
    let expected = (0_u64..8_194)
        .map(|index| {
            let mut bytes = [0_u8; 32];
            bytes[..8].copy_from_slice(&index.to_be_bytes());
            Digest::from_bytes(bytes)
        })
        .collect::<std::collections::BTreeSet<_>>();
    let supplied = expected
        .iter()
        .map(|digest| digest.to_lower_hex())
        .collect::<Vec<_>>();
    let supplied = supplied.iter().map(String::as_str).collect::<Vec<_>>();
    validate_exact_closure(&expected, &supplied).expect("multi-manifest union closure");
}

#[test]
fn embedded_png_preparation_is_full_decode_and_sealed() {
    let (bytes, hash, width, height) = png_fixture();
    let prepared = prepare_embedded_png(&bytes, width, height).expect("prepare PNG");
    assert_eq!(prepared.reference().object_address, hash);
    assert_eq!(prepared.reference().content_sha256, hash);
    assert_eq!(prepared.reference().storage_kind, StorageKind::Blob);
    assert_eq!(prepared.reference().media_type, "image/png");
    assert_eq!(prepared.logical_bytes(), bytes);
    assert_eq!(prepared.decoded().info.width, width);
    assert_eq!(prepared.decoded().info.height, height);

    assert_eq!(
        prepare_embedded_png(&bytes, width + 1, height)
            .expect_err("dimension")
            .code,
        AssetErrorCode::DimensionMismatch
    );
    let mut crc_corrupt = bytes.clone();
    let last = crc_corrupt.len() - 1;
    crc_corrupt[last] ^= 1;
    assert_eq!(
        prepare_embedded_png(&crc_corrupt, width, height)
            .expect_err("CRC")
            .code,
        AssetErrorCode::DecodeMalformed
    );
}

#[test]
fn embedded_limit_precedes_png_decode() {
    let bytes = vec![0_u8; 16_777_217];
    assert_eq!(
        prepare_embedded_png(&bytes, 1, 1)
            .expect_err("embed limit")
            .code,
        AssetErrorCode::TooLargeForEmbed
    );
}

#[derive(Default)]
struct TestWriteStore {
    calls: Vec<&'static str>,
    principal: Vec<u8>,
    fail_descriptor: bool,
}

impl EmbeddedBlobStore for TestWriteStore {
    type Error = &'static str;

    fn put_verified_blob_if_absent(
        &mut self,
        principal: &PrincipalId,
        _address: Digest,
        _bytes: &[u8],
    ) -> Result<(), Self::Error> {
        self.principal = principal.as_bytes().to_vec();
        self.calls.push("blob");
        Ok(())
    }

    fn put_descriptor_if_absent(
        &mut self,
        _principal: &PrincipalId,
        _reference: &AssetRef,
        _descriptor: &Descriptor,
    ) -> Result<(), Self::Error> {
        self.calls.push("descriptor");
        if self.fail_descriptor {
            Err("descriptor write failed")
        } else {
            Ok(())
        }
    }
}

#[test]
fn materialization_is_blob_then_descriptor_and_store_failure_has_no_stable_code() {
    let (bytes, _, width, height) = png_fixture();
    let prepared = prepare_embedded_png(&bytes, width, height).expect("prepare");
    let principal = PrincipalId::new(PRINCIPAL);
    let mut store = TestWriteStore::default();
    let result = materialize_prepared_png(&mut store, &principal, &prepared).expect("materialize");
    assert_eq!(&result, prepared.reference());
    assert_eq!(store.calls, ["blob", "descriptor"]);
    assert_eq!(store.principal, PRINCIPAL);

    let mut failing = TestWriteStore {
        fail_descriptor: true,
        ..TestWriteStore::default()
    };
    let error = materialize_prepared_png(&mut failing, &principal, &prepared)
        .expect_err("injected store failure");
    assert_eq!(error.stable_code(), None);
    assert_eq!(failing.calls, ["blob", "descriptor"]);
}

#[test]
fn referenced_blob_resolves_full_decode_with_owned_generation_snapshot() {
    let (bytes, _, width, height) = png_fixture();
    let (store, reference) = store_for_blob(&bytes);
    let principal = PrincipalId::new(PRINCIPAL);
    let ResolvePng::Ready(ready) =
        resolve_referenced_png(&store, &principal, &reference, width, height).expect("resolve")
    else {
        panic!("expected Ready");
    };
    assert_eq!(ready.reference(), &reference);
    assert_eq!(ready.logical_bytes(), bytes);
    assert_eq!(ready.decoded().rgba.len(), 4);
    assert_eq!(
        ready.source_generations(),
        &[(reference.object_address, 17)]
    );
    assert_eq!(
        store.object_calls.borrow().as_slice(),
        &[(reference.object_address, 16_777_216)]
    );
    assert_eq!(store.descriptor_calls.borrow().as_slice(), &[reference]);
}

#[test]
fn top_state_and_descriptor_absence_mapping_is_exact() {
    let (bytes, _, width, height) = png_fixture();
    let principal = PrincipalId::new(PRINCIPAL);
    for state in [ObjectState::Materializing, ObjectState::Restoring] {
        let (mut store, reference) = store_for_blob(&bytes);
        store.objects.insert(
            reference.object_address,
            snapshot(reference.object_address, state, 1, bytes.clone()),
        );
        assert_eq!(
            resolve_referenced_png(&store, &principal, &reference, width, height).unwrap(),
            ResolvePng::Missing
        );
        assert!(store.descriptor_calls.borrow().is_empty());
    }
    for state in [
        ObjectState::Tombstoned,
        ObjectState::Deleting,
        ObjectState::Deleted,
    ] {
        let (mut store, reference) = store_for_blob(&bytes);
        store.objects.insert(
            reference.object_address,
            snapshot(reference.object_address, state, 1, bytes.clone()),
        );
        assert_eq!(
            resolve_referenced_png(&store, &principal, &reference, width, height)
                .expect_err("deleted")
                .stable_code(),
            Some(AssetErrorCode::DeletedObjectRef)
        );
    }
    let (mut store, reference) = store_for_blob(&bytes);
    store.descriptor = None;
    assert_eq!(
        resolve_referenced_png(&store, &principal, &reference, width, height)
            .expect_err("missing descriptor is hard")
            .stable_code(),
        Some(AssetErrorCode::DescriptorMismatch)
    );
}

#[test]
fn resolver_multifault_precedence_is_kind_physical_content_size_media_decode() {
    let (bytes, _, width, height) = png_fixture();
    let principal = PrincipalId::new(PRINCIPAL);

    let (mut kind_store, reference) = store_for_blob(&bytes);
    kind_store.descriptor.as_mut().unwrap().storage_kind = StorageKind::ChunkManifest;
    if let ObjectRead::Snapshot(value) = kind_store
        .objects
        .get_mut(&reference.object_address)
        .unwrap()
    {
        value.bytes[0] ^= 1;
    }
    assert_eq!(
        resolve_referenced_png(&kind_store, &principal, &reference, width, height)
            .expect_err("kind first")
            .stable_code(),
        Some(AssetErrorCode::DescriptorMismatch)
    );

    let (mut hash_store, reference) = store_for_blob(&bytes);
    if let ObjectRead::Snapshot(value) = hash_store
        .objects
        .get_mut(&reference.object_address)
        .unwrap()
    {
        value.bytes[0] ^= 1;
    }
    hash_store.descriptor.as_mut().unwrap().content_sha256 = Digest::from_bytes([9; 32]);
    assert_eq!(
        resolve_referenced_png(&hash_store, &principal, &reference, width, height)
            .expect_err("physical hash first")
            .stable_code(),
        Some(AssetErrorCode::HashMismatch)
    );

    let (mut content_store, content_ref) = store_for_blob(&bytes);
    let descriptor = content_store.descriptor.as_mut().unwrap();
    descriptor.content_sha256 = Digest::from_bytes([7; 32]);
    descriptor.size_bytes += 1;
    descriptor.media_type = "application/octet-stream".to_owned();
    assert_eq!(
        resolve_referenced_png(&content_store, &principal, &content_ref, width, height)
            .expect_err("content first")
            .stable_code(),
        Some(AssetErrorCode::ContentHashMismatch)
    );

    let (mut size_store, size_ref) = store_for_blob(&bytes);
    let descriptor = size_store.descriptor.as_mut().unwrap();
    descriptor.size_bytes += 1;
    descriptor.media_type = "application/octet-stream".to_owned();
    assert_eq!(
        resolve_referenced_png(&size_store, &principal, &size_ref, width, height)
            .expect_err("size before media")
            .stable_code(),
        Some(AssetErrorCode::SizeMismatch)
    );

    let (mut media_store, media_ref) = store_for_blob(&bytes);
    media_store.descriptor.as_mut().unwrap().media_type = "application/octet-stream".to_owned();
    assert_eq!(
        resolve_referenced_png(&media_store, &principal, &media_ref, width, height)
            .expect_err("media")
            .stable_code(),
        Some(AssetErrorCode::MediaTypeMismatch)
    );
}

#[test]
fn malicious_store_cannot_force_hashing_past_declared_physical_bound() {
    let (bytes, _, width, height) = png_fixture();
    let (mut store, reference) = store_for_blob(&bytes);
    store.ignore_bounds = true;
    store.objects.insert(
        reference.object_address,
        snapshot(
            reference.object_address,
            ObjectState::Active,
            1,
            vec![0_u8; 16_777_217],
        ),
    );
    assert_eq!(
        resolve_referenced_png(
            &store,
            &PrincipalId::new(PRINCIPAL),
            &reference,
            width,
            height,
        )
        .expect_err("malicious oversized snapshot")
        .stable_code(),
        Some(AssetErrorCode::LimitExceeded)
    );
}

#[test]
fn injected_read_failure_has_no_stable_code_and_wrong_principal_is_missing() {
    let (bytes, _, width, height) = png_fixture();
    let (mut store, reference) = store_for_blob(&bytes);
    store.fail_objects = true;
    let error = resolve_referenced_png(
        &store,
        &PrincipalId::new(PRINCIPAL),
        &reference,
        width,
        height,
    )
    .expect_err("store error");
    assert_eq!(error.stable_code(), None);

    store.fail_objects = false;
    assert_eq!(
        resolve_referenced_png(
            &store,
            &PrincipalId::new(b"other-principal"),
            &reference,
            width,
            height,
        )
        .unwrap(),
        ResolvePng::Missing
    );
}

#[test]
fn chunk_manifest_reference_range_is_limit_before_store_io() {
    let reference = AssetRef {
        object_address: Digest::from_bytes([1; 32]),
        storage_kind: StorageKind::ChunkManifest,
        content_sha256: Digest::from_bytes([2; 32]),
        media_type: "image/png".to_owned(),
        size_bytes: 16_777_216,
    };
    let store = TestReadStore::default();
    assert_eq!(
        resolve_referenced_png(&store, &PrincipalId::new(PRINCIPAL), &reference, 1, 1)
            .expect_err("invalid manifest range")
            .stable_code(),
        Some(AssetErrorCode::LimitExceeded)
    );
    assert!(store.object_calls.borrow().is_empty());
}

#[test]
fn malformed_blob_address_is_hash_mismatch_before_store_io() {
    let reference = AssetRef {
        object_address: Digest::from_bytes([1; 32]),
        storage_kind: StorageKind::Blob,
        content_sha256: Digest::from_bytes([2; 32]),
        media_type: "image/png".to_owned(),
        size_bytes: 1,
    };
    let store = TestReadStore::default();
    assert_eq!(
        resolve_referenced_png(&store, &PrincipalId::new(PRINCIPAL), &reference, 1, 1)
            .expect_err("invalid blob address")
            .stable_code(),
        Some(AssetErrorCode::HashMismatch)
    );
    assert!(store.object_calls.borrow().is_empty());
}

#[test]
fn stable_error_vocabulary_is_complete_and_exact() {
    let codes = [
        AssetErrorCode::HashMismatch,
        AssetErrorCode::SizeMismatch,
        AssetErrorCode::TooLargeForEmbed,
        AssetErrorCode::ChunkMissing,
        AssetErrorCode::ManifestInvalid,
        AssetErrorCode::RefSetMismatch,
        AssetErrorCode::UploadExpired,
        AssetErrorCode::UnsupportedKind,
        AssetErrorCode::DeletedObjectRef,
        AssetErrorCode::DescriptorMismatch,
        AssetErrorCode::MediaTypeMismatch,
        AssetErrorCode::ContentHashMismatch,
        AssetErrorCode::DecodingProfileUnsupported,
        AssetErrorCode::DimensionMismatch,
        AssetErrorCode::DecodeMalformed,
        AssetErrorCode::LimitExceeded,
        AssetErrorCode::WriteInProgress,
        AssetErrorCode::WriteLeaseLost,
    ];
    let strings = codes.map(AssetErrorCode::as_str);
    assert_eq!(strings.len(), 18);
    assert!(strings.iter().all(|value| value.starts_with("VIVI_ASSET_")));
    let unique = strings
        .into_iter()
        .collect::<std::collections::BTreeSet<_>>();
    assert_eq!(unique.len(), 18);
}

struct ManifestBundle {
    png: Vec<u8>,
    manifest_bytes: Vec<u8>,
    reference: AssetRef,
    descriptor: Descriptor,
    chunks: Vec<(Digest, Vec<u8>)>,
}

fn large_valid_png() -> Vec<u8> {
    let (base, _, width, height) = png_fixture();
    let insertion = 8 + 12 + 13; // signature plus complete IHDR chunk
    let target = 16_777_217_usize;
    let padding_length = target
        .checked_sub(base.len() + 12)
        .expect("base PNG fits target");
    let mut result = Vec::with_capacity(target);
    result.extend_from_slice(&base[..insertion]);
    result.extend_from_slice(&(padding_length as u32).to_be_bytes());
    let crc_start = result.len();
    result.extend_from_slice(b"aaAa"); // ancillary, private, reserved bit valid
    result.resize(result.len() + padding_length, 0x5a);
    let crc = crc32(&result[crc_start..]);
    result.extend_from_slice(&crc.to_be_bytes());
    result.extend_from_slice(&base[insertion..]);
    assert_eq!(result.len(), target);
    vivi_png_ref::inspect(&result, width, height).expect("large ancillary PNG structure");
    result
}

fn crc32(bytes: &[u8]) -> u32 {
    let mut crc = 0xffff_ffff_u32;
    for byte in bytes {
        crc ^= u32::from(*byte);
        for _ in 0..8 {
            crc = if crc & 1 == 1 {
                (crc >> 1) ^ 0xedb8_8320
            } else {
                crc >> 1
            };
        }
    }
    !crc
}

fn manifest_bundle() -> ManifestBundle {
    let png = large_valid_png();
    let content_sha256 = digest(&png);
    let chunks = png
        .chunks(CHUNK_BYTES as usize)
        .map(|bytes| (digest(bytes), bytes.to_vec()))
        .collect::<Vec<_>>();
    assert_eq!(chunks.len(), 3);
    let chunk_values = chunks
        .iter()
        .map(|(sha256, bytes)| {
            serde_json::json!({
                "sha256": sha256.to_lower_hex(),
                "sizeBytes": bytes.len(),
            })
        })
        .collect::<Vec<_>>();
    let value = serde_json::json!({
        "schema": "vivi2d.assetChunkManifest.v1",
        "mediaType": "image/png",
        "contentSha256": content_sha256.to_lower_hex(),
        "sizeBytes": png.len(),
        "chunkSizeBytes": CHUNK_BYTES,
        "chunks": chunk_values,
    });
    let manifest_bytes = serde_json::to_vec(&value).expect("manifest JSON");
    let parsed = parse_chunk_manifest(&manifest_bytes).expect("generated manifest");
    let reference = AssetRef {
        object_address: parsed.object_address,
        storage_kind: StorageKind::ChunkManifest,
        content_sha256,
        media_type: "image/png".to_owned(),
        size_bytes: png.len() as u64,
    };
    let descriptor = Descriptor::from_reference(&reference);
    ManifestBundle {
        png,
        manifest_bytes,
        reference,
        descriptor,
        chunks,
    }
}

fn store_for_manifest(bundle: &ManifestBundle) -> TestReadStore {
    let mut store = TestReadStore {
        principal: PRINCIPAL.to_vec(),
        descriptor: Some(bundle.descriptor.clone()),
        ..TestReadStore::default()
    };
    store.objects.insert(
        bundle.reference.object_address,
        snapshot(
            bundle.reference.object_address,
            ObjectState::Active,
            100,
            bundle.manifest_bytes.clone(),
        ),
    );
    for (index, (address, bytes)) in bundle.chunks.iter().enumerate() {
        store.objects.insert(
            *address,
            snapshot(
                *address,
                ObjectState::Active,
                200 + index as u64,
                bytes.clone(),
            ),
        );
    }
    store
}

#[test]
fn referenced_manifest_reconstructs_closure_and_fully_decodes_large_png() {
    let bundle = manifest_bundle();
    let store = store_for_manifest(&bundle);
    let ResolvePng::Ready(ready) = resolve_referenced_png(
        &store,
        &PrincipalId::new(PRINCIPAL),
        &bundle.reference,
        1,
        1,
    )
    .expect("resolve chunk manifest") else {
        panic!("expected Ready");
    };
    assert_eq!(ready.logical_bytes(), bundle.png);
    assert_eq!(ready.decoded().rgba.len(), 4);
    assert_eq!(
        ready.source_generations(),
        &[
            (bundle.reference.object_address, 100),
            (bundle.chunks[0].0, 200),
            (bundle.chunks[1].0, 201),
            (bundle.chunks[2].0, 202),
        ]
    );
    assert_eq!(
        store.events.borrow().as_slice(),
        &["object", "descriptor", "object", "object", "object"]
    );
    assert_eq!(
        store.object_calls.borrow()[0].1,
        MANIFEST_INPUT_MAX_BYTES as u64
    );
    assert!(
        store.object_calls.borrow()[1..]
            .iter()
            .all(|(_, bound)| *bound == CHUNK_BYTES)
    );
}

#[test]
fn manifest_missing_and_nonactive_chunk_states_are_hard_errors() {
    let bundle = manifest_bundle();
    for index in 0..3 {
        let mut store = store_for_manifest(&bundle);
        store.objects.remove(&bundle.chunks[index].0);
        assert_eq!(
            resolve_referenced_png(
                &store,
                &PrincipalId::new(PRINCIPAL),
                &bundle.reference,
                1,
                1,
            )
            .expect_err("missing chunk")
            .stable_code(),
            Some(AssetErrorCode::ChunkMissing),
            "missing chunk index {index}"
        );
    }
    for (state, expected) in [
        (ObjectState::Materializing, AssetErrorCode::ChunkMissing),
        (ObjectState::Restoring, AssetErrorCode::ChunkMissing),
        (ObjectState::Tombstoned, AssetErrorCode::DeletedObjectRef),
        (ObjectState::Deleting, AssetErrorCode::DeletedObjectRef),
        (ObjectState::Deleted, AssetErrorCode::DeletedObjectRef),
    ] {
        let mut store = store_for_manifest(&bundle);
        let ObjectRead::Snapshot(chunk) = store.objects.get_mut(&bundle.chunks[1].0).unwrap()
        else {
            panic!("chunk snapshot");
        };
        chunk.state = state;
        assert_eq!(
            resolve_referenced_png(
                &store,
                &PrincipalId::new(PRINCIPAL),
                &bundle.reference,
                1,
                1,
            )
            .expect_err("non-active chunk")
            .stable_code(),
            Some(expected),
            "state {state:?}"
        );
    }
}

#[test]
fn chunk_bounded_read_and_malicious_oversized_snapshot_map_to_limit() {
    let bundle = manifest_bundle();
    let principal = PrincipalId::new(PRINCIPAL);

    let mut bounded = store_for_manifest(&bundle);
    bounded
        .objects
        .insert(bundle.chunks[0].0, ObjectRead::TooLarge);
    assert_eq!(
        resolve_referenced_png(&bounded, &principal, &bundle.reference, 1, 1)
            .expect_err("bounded store reports too large")
            .stable_code(),
        Some(AssetErrorCode::LimitExceeded)
    );

    let mut malicious = store_for_manifest(&bundle);
    malicious.ignore_bounds = true;
    malicious.objects.insert(
        bundle.chunks[0].0,
        snapshot(
            bundle.chunks[0].0,
            ObjectState::Active,
            999,
            vec![0_u8; CHUNK_BYTES as usize + 1],
        ),
    );
    assert_eq!(
        resolve_referenced_png(&malicious, &principal, &bundle.reference, 1, 1)
            .expect_err("malicious oversized chunk snapshot")
            .stable_code(),
        Some(AssetErrorCode::LimitExceeded)
    );
}

#[test]
fn manifest_chunk_hash_size_order_and_logical_metadata_fail_closed() {
    let bundle = manifest_bundle();
    let principal = PrincipalId::new(PRINCIPAL);

    let mut hash_store = store_for_manifest(&bundle);
    let ObjectRead::Snapshot(chunk) = hash_store.objects.get_mut(&bundle.chunks[1].0).unwrap()
    else {
        panic!("chunk snapshot");
    };
    chunk.bytes[0] ^= 1;
    assert_eq!(
        resolve_referenced_png(&hash_store, &principal, &bundle.reference, 1, 1)
            .expect_err("chunk hash")
            .stable_code(),
        Some(AssetErrorCode::HashMismatch)
    );

    let mut wrong_size_value: serde_json::Value =
        serde_json::from_slice(&bundle.manifest_bytes).expect("manifest value");
    wrong_size_value["chunks"][2]["sizeBytes"] = serde_json::json!(2);
    wrong_size_value["sizeBytes"] = serde_json::json!(bundle.png.len() as u64 + 1);
    let wrong_size_bytes = serde_json::to_vec(&wrong_size_value).unwrap();
    let wrong_size_manifest = parse_chunk_manifest(&wrong_size_bytes).expect("wrong-size schema");
    let mut wrong_size_ref = bundle.reference.clone();
    wrong_size_ref.object_address = wrong_size_manifest.object_address;
    wrong_size_ref.size_bytes += 1;
    let mut size_store = store_for_manifest(&bundle);
    size_store.descriptor = Some(Descriptor::from_reference(&wrong_size_ref));
    size_store.objects.remove(&bundle.reference.object_address);
    size_store.objects.insert(
        wrong_size_ref.object_address,
        snapshot(
            wrong_size_ref.object_address,
            ObjectState::Active,
            101,
            wrong_size_bytes,
        ),
    );
    assert_eq!(
        resolve_referenced_png(&size_store, &principal, &wrong_size_ref, 1, 1)
            .expect_err("chunk size")
            .stable_code(),
        Some(AssetErrorCode::SizeMismatch)
    );

    let mut reordered_value: serde_json::Value =
        serde_json::from_slice(&bundle.manifest_bytes).expect("manifest value");
    reordered_value["chunks"].as_array_mut().unwrap().swap(0, 1);
    let reordered_bytes = serde_json::to_vec(&reordered_value).unwrap();
    let reordered_manifest = parse_chunk_manifest(&reordered_bytes).expect("reordered manifest");
    let mut reordered_ref = bundle.reference.clone();
    reordered_ref.object_address = reordered_manifest.object_address;
    let mut reordered_store = store_for_manifest(&bundle);
    reordered_store
        .objects
        .remove(&bundle.reference.object_address);
    reordered_store.objects.insert(
        reordered_ref.object_address,
        snapshot(
            reordered_ref.object_address,
            ObjectState::Active,
            102,
            reordered_bytes,
        ),
    );
    assert_eq!(
        resolve_referenced_png(&reordered_store, &principal, &reordered_ref, 1, 1)
            .expect_err("ordered reconstruction")
            .stable_code(),
        Some(AssetErrorCode::ContentHashMismatch)
    );

    let mut content_ref = bundle.reference.clone();
    content_ref.content_sha256 = Digest::from_bytes([0x33; 32]);
    let mut content_store = store_for_manifest(&bundle);
    content_store.descriptor = Some(Descriptor::from_reference(&content_ref));
    assert_eq!(
        resolve_referenced_png(&content_store, &principal, &content_ref, 1, 1)
            .expect_err("logical content")
            .stable_code(),
        Some(AssetErrorCode::ContentHashMismatch)
    );

    let mut logical_size_ref = bundle.reference.clone();
    logical_size_ref.size_bytes += 1;
    let mut logical_size_store = store_for_manifest(&bundle);
    logical_size_store.descriptor = Some(Descriptor::from_reference(&logical_size_ref));
    assert_eq!(
        resolve_referenced_png(&logical_size_store, &principal, &logical_size_ref, 1, 1)
            .expect_err("logical size")
            .stable_code(),
        Some(AssetErrorCode::SizeMismatch)
    );

    let mut media_ref = bundle.reference.clone();
    media_ref.media_type = "application/octet-stream".to_owned();
    let mut media_store = store_for_manifest(&bundle);
    media_store.descriptor = Some(Descriptor::from_reference(&media_ref));
    assert_eq!(
        resolve_referenced_png(&media_store, &principal, &media_ref, 1, 1)
            .expect_err("logical media")
            .stable_code(),
        Some(AssetErrorCode::MediaTypeMismatch)
    );
}

#[test]
fn png_decoder_five_classifications_map_to_frozen_asset_codes() {
    use vivi_png_ref::Error as Png;

    let cases = [
        (Png::Unsupported, AssetErrorCode::DecodingProfileUnsupported),
        (Png::Dimension, AssetErrorCode::DimensionMismatch),
        (Png::Malformed, AssetErrorCode::DecodeMalformed),
        (Png::Limit, AssetErrorCode::LimitExceeded),
        (
            Png::ContentHashMismatch,
            AssetErrorCode::ContentHashMismatch,
        ),
    ];
    for (input, expected) in cases {
        assert_eq!(crate::resolver::map_png_error(input).code, expected);
    }
}

#[test]
fn full_decode_rejects_zlib_damage_that_structure_inspection_accepts() {
    let (mut bytes, _, width, height) = png_fixture();
    let mut offset = 8_usize;
    let (type_start, data_start, data_end, crc_start) = loop {
        let length = u32::from_be_bytes(bytes[offset..offset + 4].try_into().unwrap()) as usize;
        let type_start = offset + 4;
        let data_start = offset + 8;
        let data_end = data_start + length;
        if &bytes[type_start..type_start + 4] == b"IDAT" {
            break (type_start, data_start, data_end, data_end);
        }
        offset = data_end + 4;
    };
    bytes[data_start] ^= 0x20;
    let crc = crc32(&bytes[type_start..data_end]);
    bytes[crc_start..crc_start + 4].copy_from_slice(&crc.to_be_bytes());
    vivi_png_ref::inspect(&bytes, width, height).expect("structure and CRC still valid");
    assert_eq!(
        prepare_embedded_png(&bytes, width, height)
            .expect_err("full zlib decode must fail")
            .code,
        AssetErrorCode::DecodeMalformed
    );
}

struct FlippingRepeatStore {
    reference: AssetRef,
    descriptor: Descriptor,
    manifest_bytes: Vec<u8>,
    chunk_address: Digest,
    chunk_bytes: Vec<u8>,
    chunk_reads: Cell<u32>,
}

impl AssetReadStore for FlippingRepeatStore {
    type Error = &'static str;

    fn descriptor(
        &self,
        _principal: &PrincipalId,
        _expected: &AssetRef,
    ) -> Result<Option<Descriptor>, Self::Error> {
        Ok(Some(self.descriptor.clone()))
    }

    fn object(
        &self,
        _principal: &PrincipalId,
        object_address: Digest,
        _max_bytes: u64,
    ) -> Result<ObjectRead, Self::Error> {
        if object_address == self.reference.object_address {
            return Ok(snapshot(
                object_address,
                ObjectState::Active,
                4,
                self.manifest_bytes.clone(),
            ));
        }
        if object_address == self.chunk_address {
            let read = self.chunk_reads.get() + 1;
            self.chunk_reads.set(read);
            return Ok(snapshot(
                object_address,
                if read == 1 {
                    ObjectState::Active
                } else {
                    ObjectState::Deleted
                },
                if read == 1 { 9 } else { 10 },
                self.chunk_bytes.clone(),
            ));
        }
        Ok(ObjectRead::Missing)
    }
}

#[test]
fn repeated_chunk_uses_one_generation_pinned_read_even_if_store_would_flip() {
    let chunk_bytes = vec![0_u8; CHUNK_BYTES as usize];
    let chunk_address = digest(&chunk_bytes);
    let logical = vec![0_u8; (CHUNK_BYTES * 3) as usize];
    let content_sha256 = digest(&logical);
    let chunk = serde_json::json!({
        "sha256": chunk_address.to_lower_hex(),
        "sizeBytes": CHUNK_BYTES,
    });
    let manifest_value = serde_json::json!({
        "schema": "vivi2d.assetChunkManifest.v1",
        "mediaType": "image/png",
        "contentSha256": content_sha256.to_lower_hex(),
        "sizeBytes": CHUNK_BYTES * 3,
        "chunkSizeBytes": CHUNK_BYTES,
        "chunks": [chunk.clone(), chunk.clone(), chunk],
    });
    let manifest_bytes = serde_json::to_vec(&manifest_value).unwrap();
    let parsed = parse_chunk_manifest(&manifest_bytes).expect("repeated chunk manifest");
    assert_eq!(parsed.required_object_addresses().len(), 2);
    let reference = AssetRef {
        object_address: parsed.object_address,
        storage_kind: StorageKind::ChunkManifest,
        content_sha256,
        media_type: "image/png".to_owned(),
        size_bytes: CHUNK_BYTES * 3,
    };
    let store = FlippingRepeatStore {
        descriptor: Descriptor::from_reference(&reference),
        reference: reference.clone(),
        manifest_bytes,
        chunk_address,
        chunk_bytes,
        chunk_reads: Cell::new(0),
    };
    assert_eq!(
        resolve_referenced_png(&store, &PrincipalId::new(PRINCIPAL), &reference, 1, 1)
            .expect_err("zero bytes are not PNG")
            .stable_code(),
        Some(AssetErrorCode::DecodeMalformed)
    );
    assert_eq!(store.chunk_reads.get(), 1);
}
