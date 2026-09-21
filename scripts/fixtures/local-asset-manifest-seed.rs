//! Test-only fixed source-store fixture. No production bridge export or decoder.
use sha2::{Digest as _, Sha256};
use std::{env, sync::atomic::AtomicBool};
use vivi_asset_host_local::{
    AssetRef, Digest, ExportPngClosureV1, LocalAssetHost, PrincipalId,
    ReferencedPngClosureObjectV1, ReferencedPngManifestClosureV1, StorageKind,
};
use vivi_asset_resolver::parse_chunk_manifest;

const PNG: &[u8] = &[
    137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0,
    0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 120, 156, 99, 16, 50, 9, 99, 0, 0, 1, 149,
    0, 157, 77, 65, 8, 223, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
];
// Existing frozen two-pixel red/green witness. Only the two explicit C2 hex
// modes select it; the original seed/verify fixture remains byte-for-byte.
const PREVIEW_PNG: &[u8] = &[
    137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 2, 0, 0, 0, 1, 8, 3, 0,
    0, 0, 195, 252, 143, 184, 0, 0, 0, 6, 80, 76, 84, 69, 255, 0, 0, 0, 255, 0, 210, 135, 239, 113,
    0, 0, 0, 11, 73, 68, 65, 84, 120, 156, 99, 96, 96, 4, 0, 0, 4, 0, 2, 191, 122, 63, 74, 0, 0, 0,
    0, 73, 69, 78, 68, 174, 66, 96, 130,
];
fn digest(bytes: &[u8]) -> Digest {
    Digest::from_bytes(Sha256::digest(bytes).into())
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
fn large_png(png: &[u8]) -> Vec<u8> {
    // Same approved host-local fixture construction: an ancillary padding
    // chunk, with first two 8 MiB physical chunks deliberately identical.
    let insertion = 33;
    let chunk_bytes = 8_388_608_usize;
    let mut first = Vec::with_capacity(chunk_bytes);
    first.extend_from_slice(&png[..insertion]);
    first.extend_from_slice(&((chunk_bytes * 2 - insertion - 8) as u32).to_be_bytes());
    first.extend_from_slice(b"aaAa");
    first.resize(chunk_bytes, 0x5a);
    let mut result = Vec::with_capacity(chunk_bytes * 2 + png.len());
    result.extend_from_slice(&first);
    result.extend_from_slice(&first);
    result.extend_from_slice(&crc32(&result[insertion + 4..]).to_be_bytes());
    result.extend_from_slice(&png[insertion..]);
    assert_eq!(
        &result[..chunk_bytes],
        &result[chunk_bytes..chunk_bytes * 2]
    );
    result
}
// Deliberately noncanonical key order and whitespace. The true parser supplies
// its address; the receiver must retain these exact raw bytes, not reserialize.
fn main() {
    let args: Vec<String> = env::args().collect();
    assert_eq!(args.len(), 4, "fixed mode, database and principal required");
    let hex_mode = matches!(
        args[1].as_str(),
        "seed-principal-hex" | "verify-principal-hex"
    );
    assert!(hex_mode || matches!(args[1].as_str(), "seed" | "verify"));
    let principal = if hex_mode {
        let encoded = args[3].as_bytes();
        assert!(!encoded.is_empty() && encoded.len() <= 8192 && encoded.len() % 2 == 0);
        assert!(
            encoded
                .iter()
                .all(|v| v.is_ascii_digit() || (b'a'..=b'f').contains(v))
        );
        encoded
            .chunks_exact(2)
            .map(|pair| {
                let nibble = |v: u8| if v <= b'9' { v - b'0' } else { v - b'a' + 10 };
                (nibble(pair[0]) << 4) | nibble(pair[1])
            })
            .collect()
    } else {
        args[3].as_bytes().to_vec()
    };
    let width = if hex_mode { 2 } else { 1 };
    let png = large_png(if hex_mode { PREVIEW_PNG } else { PNG });
    let content = digest(&png);
    let size = png.len();
    let chunks: Vec<_> = png.chunks(8_388_608).collect();
    let addresses: Vec<_> = chunks
        .iter()
        .map(|chunk| digest(chunk).to_lower_hex())
        .collect();
    let chunk_json = chunks
        .iter()
        .zip(&addresses)
        .map(|(chunk, address)| {
            format!("{{\"sizeBytes\":{},\"sha256\":\"{address}\"}}", chunk.len())
        })
        .collect::<Vec<_>>()
        .join(",");
    let raw = format!("{{\n  \"sizeBytes\":{size}, \"chunks\":[{chunk_json}],\n  \"mediaType\":\"image/png\", \"schema\":\"vivi2d.assetChunkManifest.v1\",\n  \"chunkSizeBytes\":8388608, \"contentSha256\":\"{content}\"\n}}\n").into_bytes();
    let parsed = parse_chunk_manifest(&raw).expect("fixed manifest accepted by real parser");
    let reference = AssetRef {
        object_address: parsed.object_address,
        storage_kind: StorageKind::ChunkManifest,
        content_sha256: content,
        media_type: "image/png".to_owned(),
        size_bytes: size as u64,
    };
    let address = reference.object_address.to_lower_hex();
    let mut host =
        LocalAssetHost::open(&args[2], PrincipalId::new(principal)).expect("real store opens");
    if matches!(args[1].as_str(), "seed" | "seed-principal-hex") {
        let closure = ReferencedPngManifestClosureV1::new(vec![
            ReferencedPngClosureObjectV1::new(&address, &raw),
            ReferencedPngClosureObjectV1::new(&addresses[0], chunks[0]),
            ReferencedPngClosureObjectV1::new(&addresses[2], chunks[2]),
        ]);
        let verified = host
            .ingest_referenced_png_manifest_closure(&reference, &closure, width, 1)
            .expect("real source ingestion");
        assert_eq!(verified.asset, reference);
    } else {
        assert!(matches!(
            args[1].as_str(),
            "verify" | "verify-principal-hex"
        ));
    }
    let ExportPngClosureV1::Ready(closure) = host
        .export_png_closure(&reference, width, 1, &AtomicBool::new(false))
        .expect("real receiver export")
    else {
        panic!("fixture missing")
    };
    assert_eq!(closure.objects().len(), 3);
    assert_eq!(
        closure
            .objects()
            .iter()
            .find(|v| v.address() == reference.object_address)
            .unwrap()
            .bytes(),
        raw
    );
    for (chunk, address) in chunks.iter().zip(&addresses) {
        assert_eq!(
            closure
                .objects()
                .iter()
                .find(|v| v.address().to_lower_hex() == *address)
                .unwrap()
                .bytes(),
            *chunk
        );
    }
    drop(host);
    println!(
        "{{\"objectAddress\":\"{address}\",\"storageKind\":\"chunk_manifest\",\"contentSha256\":\"{content}\",\"mediaType\":\"image/png\",\"sizeBytes\":{size}}}"
    );
}
