use base64::Engine as _;
use serde::Deserialize;
use sha2::{Digest, Sha256};

use super::*;

const FIXTURE_BYTES: &[u8] = include_bytes!("../tests/fixtures/png-rgba8-v1.json");
const FIXTURE_SHA256: &str = "ce24e9fc5daef4aa5584ec5bb54892ba87c16b368001da8453a65f836cbc5956";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Fixture {
    schema: String,
    accept: Vec<AcceptVector>,
    reject: Vec<RejectVector>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AcceptVector {
    id: String,
    base64: String,
    expected_sha256: String,
    expected: ExpectedImage,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExpectedImage {
    width: u32,
    height: u32,
    stride_bytes: usize,
    rgba_hex: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RejectVector {
    id: String,
    base64: String,
    expected_sha256: Option<String>,
    declared_sha256: Option<String>,
    declared_width: Option<u32>,
    declared_height: Option<u32>,
    expected_error: String,
}

fn fixture() -> Fixture {
    serde_json::from_slice(FIXTURE_BYTES).expect("canonical fixture must parse")
}

fn decode_base64(value: &str) -> Vec<u8> {
    base64::engine::general_purpose::STANDARD
        .decode(value)
        .expect("fixture base64 must decode")
}

fn decode_hex<const N: usize>(value: &str) -> [u8; N] {
    assert_eq!(value.len(), N * 2);
    let mut output = [0_u8; N];
    for (index, byte) in output.iter_mut().enumerate() {
        *byte = u8::from_str_radix(&value[index * 2..index * 2 + 2], 16)
            .expect("fixture hex must decode");
    }
    output
}

fn error_named(name: &str) -> Error {
    match name {
        "unsupported" => Error::Unsupported,
        "malformed" => Error::Malformed,
        "limit" => Error::Limit,
        "dimension" => Error::Dimension,
        "content_hash_mismatch" => Error::ContentHashMismatch,
        _ => panic!("unknown fixture error {name}"),
    }
}

fn ihdr_dimensions(bytes: &[u8]) -> (u32, u32) {
    (read_be_u32(&bytes[16..20]), read_be_u32(&bytes[20..24]))
}

#[test]
fn package_local_fixture_is_the_exact_frozen_artifact() {
    assert_eq!(FIXTURE_BYTES.len(), 8_547);
    assert_eq!(
        format!("{:x}", Sha256::digest(FIXTURE_BYTES)),
        FIXTURE_SHA256
    );
    assert_eq!(
        fixture().schema,
        "vivi2d.contractFreeze.pngRgba8Fixtures.v1"
    );
}

#[test]
fn all_frozen_accept_vectors_match_byte_for_byte() {
    for vector in fixture().accept {
        let bytes = decode_base64(&vector.base64);
        let expected_hash = decode_hex::<32>(&vector.expected_sha256);
        assert_eq!(
            Sha256::digest(&bytes).as_slice(),
            expected_hash,
            "{}",
            vector.id
        );

        let info = inspect(&bytes, vector.expected.width, vector.expected.height)
            .unwrap_or_else(|error| panic!("{} inspect: {error:?}", vector.id));
        assert_eq!(info.width, vector.expected.width, "{}", vector.id);
        assert_eq!(info.height, vector.expected.height, "{}", vector.id);
        assert_eq!(
            info.required_output_bytes,
            u64::try_from(vector.expected.stride_bytes).unwrap() * u64::from(info.height),
            "{}",
            vector.id
        );

        let decoded = decode(
            &bytes,
            &expected_hash,
            vector.expected.width,
            vector.expected.height,
        )
        .unwrap_or_else(|error| panic!("{} decode: {error:?}", vector.id));
        assert_eq!(decoded.info, info, "{}", vector.id);
        assert_eq!(
            decoded.rgba,
            decode_hex_vec(&vector.expected.rgba_hex),
            "{}",
            vector.id
        );
    }
}

#[test]
fn all_frozen_reject_vectors_have_stable_classification_and_are_atomic() {
    for vector in fixture().reject {
        let bytes = decode_base64(&vector.base64);
        let (actual_width, actual_height) = ihdr_dimensions(&bytes);
        let width = vector.declared_width.unwrap_or(actual_width);
        let height = vector.declared_height.unwrap_or(actual_height);
        let expected_hash = vector
            .declared_sha256
            .as_deref()
            .or(vector.expected_sha256.as_deref())
            .map(decode_hex::<32>)
            .unwrap_or_else(|| Sha256::digest(&bytes).into());
        let expected_error = error_named(&vector.expected_error);
        let before = vec![0xa5; 32];
        let mut output = before.clone();
        assert_eq!(
            decode_into(&bytes, &expected_hash, width, height, &mut output),
            Err(expected_error),
            "{}",
            vector.id
        );
        assert_eq!(output, before, "{} mutated caller output", vector.id);
    }
}

#[test]
fn successful_decode_commits_only_the_required_prefix() {
    let vector = fixture()
        .accept
        .into_iter()
        .find(|vector| vector.id == "rgba-alpha-zero-preserves-rgb")
        .unwrap();
    let bytes = decode_base64(&vector.base64);
    let expected_hash = decode_hex::<32>(&vector.expected_sha256);
    let mut output = [0xa5; 12];
    let info = decode_into(&bytes, &expected_hash, 1, 1, &mut output).unwrap();
    assert_eq!(info.required_output_bytes, 4);
    assert_eq!(&output[..4], &[0x12, 0x34, 0x56, 0x00]);
    assert_eq!(&output[4..], &[0xa5; 8]);
}

#[test]
fn insufficient_capacity_and_simulated_scratch_failure_are_atomic_limits() {
    let vector = fixture()
        .accept
        .into_iter()
        .find(|vector| vector.id == "rgba-alpha-zero-preserves-rgb")
        .unwrap();
    let bytes = decode_base64(&vector.base64);
    let expected_hash = decode_hex::<32>(&vector.expected_sha256);

    let mut short = [0xa5; 3];
    assert_eq!(
        decode_into(&bytes, &expected_hash, 1, 1, &mut short),
        Err(Error::Limit)
    );
    assert_eq!(short, [0xa5; 3]);

    let caller_output = [0xa5; 12];
    assert_eq!(
        decode_to_scratch(
            &bytes,
            &expected_hash,
            1,
            1,
            Some(caller_output.len() as u64),
            ScratchPolicy::FailFullImage,
        ),
        Err(Error::Limit)
    );
    assert_eq!(caller_output, [0xa5; 12]);
}

#[test]
fn oversized_input_is_limit_before_hash_or_png_interpretation() {
    let bytes = vec![0_u8; usize::try_from(MAX_PNG_INPUT_BYTES).unwrap() + 1];
    let wrong_hash = [0xff; 32];
    assert_eq!(inspect(&bytes, 1, 1), Err(Error::Limit));
    assert_eq!(decode(&bytes, &wrong_hash, 1, 1), Err(Error::Limit));
}

#[test]
fn dimensions_are_compared_before_profile_limits() {
    let overwide = png_with_idat(8_193, 1, 8, 6, 0, &[]);
    assert_eq!(inspect(&overwide, 1, 1), Err(Error::Dimension));
    assert_eq!(inspect(&overwide, 8_193, 1), Err(Error::Limit));

    let overhigh = png_with_idat(1, 8_193, 8, 6, 0, &[]);
    assert_eq!(inspect(&overhigh, 1, 8_193), Err(Error::Limit));
}

#[test]
fn exact_maximum_dimensions_and_checked_output_size_can_be_inspected_without_decode() {
    let maximum = png_with_idat(MAX_WIDTH, MAX_HEIGHT, 8, 6, 0, &[]);
    assert_eq!(
        inspect(&maximum, MAX_WIDTH, MAX_HEIGHT),
        Ok(Info {
            width: MAX_WIDTH,
            height: MAX_HEIGHT,
            required_output_bytes: MAX_TEXTURE_BYTES,
        })
    );
}

#[test]
fn every_png_filter_is_reconstructed_across_one_byte_idat_chunks() {
    let width = 3_usize;
    let rows = [
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
        [13, 14, 15, 0, 17, 18, 19, 20, 21, 22, 23, 24],
        [25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36],
        [37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48],
        [49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60],
    ];
    let mut filtered = Vec::new();
    let mut previous = [0_u8; 12];
    for (filter, row) in (0_u8..=4).zip(rows.iter()) {
        filtered.push(filter);
        filtered.extend(encode_filtered_row(filter, 4, &previous, row));
        previous = *row;
    }
    let compressed = zlib(&filtered);
    let png = png_with_split_idat(width as u32, rows.len() as u32, 8, 6, 0, &compressed, 1);
    let hash: [u8; 32] = Sha256::digest(&png).into();
    let decoded = decode(&png, &hash, width as u32, rows.len() as u32).unwrap();
    assert_eq!(decoded.rgba, rows.into_iter().flatten().collect::<Vec<_>>());
}

#[test]
fn zlib_output_must_be_exact_and_consume_the_entire_idat_sequence() {
    let exact_filtered = [0, 0x12, 0x34, 0x56, 0x00];

    let mut too_long = exact_filtered.to_vec();
    too_long.push(0xff);
    assert_generated_decode_error(&zlib(&too_long), Error::Malformed);

    assert_generated_decode_error(&zlib(&exact_filtered[..4]), Error::Malformed);

    let mut trailing_bytes = zlib(&exact_filtered);
    trailing_bytes.extend([0xde, 0xad, 0xbe, 0xef]);
    assert_generated_decode_error(&trailing_bytes, Error::Malformed);

    let mut second_stream = zlib(&exact_filtered);
    second_stream.extend(zlib(&exact_filtered));
    assert_generated_decode_error(&second_stream, Error::Malformed);
}

#[test]
fn complete_chunk_validation_precedes_inflate() {
    let exact_filtered = [0, 0x12, 0x34, 0x56, 0x00];
    let compressed = zlib(&exact_filtered);
    let mut png = png_with_split_idat(1, 1, 8, 6, 0, &compressed, compressed.len());
    // Corrupt the IEND CRC after a valid complete zlib stream. The structural
    // pass must still win before the decoder enters inflate.
    let last = png.len() - 1;
    png[last] ^= 1;
    let hash: [u8; 32] = Sha256::digest(&png).into();
    assert_eq!(decode(&png, &hash, 1, 1), Err(Error::Malformed));
}

#[test]
fn status_values_and_frozen_profile_constants_are_exact() {
    assert_eq!(PROFILE, "vivi2d.png.rgba8.v1");
    assert_eq!(Error::Unsupported.as_i32(), 2);
    assert_eq!(Error::Malformed.as_i32(), 3);
    assert_eq!(Error::Limit.as_i32(), 4);
    assert_eq!(Error::Dimension.as_i32(), 5);
    assert_eq!(Error::ContentHashMismatch.as_i32(), 6);
    assert_eq!(
        LIMITS,
        Limits {
            max_width: 8_192,
            max_height: 8_192,
            max_pixels: 67_108_864,
            max_png_input_bytes: 67_108_864,
            max_texture_bytes: 268_435_456,
        }
    );
}

fn decode_hex_vec(value: &str) -> Vec<u8> {
    assert_eq!(value.len() % 2, 0);
    value
        .as_bytes()
        .chunks_exact(2)
        .map(|pair| {
            u8::from_str_radix(std::str::from_utf8(pair).unwrap(), 16)
                .expect("fixture hex must decode")
        })
        .collect()
}

fn zlib(bytes: &[u8]) -> Vec<u8> {
    // A deterministic zlib stream containing uncompressed DEFLATE blocks.
    let mut output = vec![0x78, 0x01];
    if bytes.is_empty() {
        output.extend([1, 0, 0, 0xff, 0xff]);
    } else {
        let block_count = bytes.len().div_ceil(u16::MAX as usize);
        for (index, block) in bytes.chunks(u16::MAX as usize).enumerate() {
            output.push(u8::from(index + 1 == block_count));
            let length = u16::try_from(block.len()).unwrap();
            output.extend(length.to_le_bytes());
            output.extend((!length).to_le_bytes());
            output.extend(block);
        }
    }
    output.extend(adler32(bytes).to_be_bytes());
    output
}

fn adler32(bytes: &[u8]) -> u32 {
    const MODULUS: u32 = 65_521;
    let mut a = 1_u32;
    let mut b = 0_u32;
    for &byte in bytes {
        a = (a + u32::from(byte)) % MODULUS;
        b = (b + a) % MODULUS;
    }
    (b << 16) | a
}

fn encode_filtered_row(filter: u8, bpp: usize, previous: &[u8], current: &[u8]) -> Vec<u8> {
    current
        .iter()
        .enumerate()
        .map(|(index, &value)| {
            let left = index.checked_sub(bpp).map_or(0, |left| current[left]);
            let above = previous[index];
            let upper_left = index.checked_sub(bpp).map_or(0, |left| previous[left]);
            let predictor = match filter {
                0 => 0,
                1 => left,
                2 => above,
                3 => ((u16::from(left) + u16::from(above)) / 2) as u8,
                4 => paeth(left, above, upper_left),
                _ => unreachable!(),
            };
            value.wrapping_sub(predictor)
        })
        .collect()
}

fn assert_generated_decode_error(compressed: &[u8], error: Error) {
    let png = png_with_split_idat(1, 1, 8, 6, 0, compressed, compressed.len().max(1));
    let hash: [u8; 32] = Sha256::digest(&png).into();
    let mut output = [0xa5; 4];
    assert_eq!(decode_into(&png, &hash, 1, 1, &mut output), Err(error));
    assert_eq!(output, [0xa5; 4]);
}

fn png_with_idat(
    width: u32,
    height: u32,
    bit_depth: u8,
    color_type: u8,
    interlace: u8,
    compressed: &[u8],
) -> Vec<u8> {
    png_with_split_idat(
        width,
        height,
        bit_depth,
        color_type,
        interlace,
        compressed,
        compressed.len().max(1),
    )
}

fn png_with_split_idat(
    width: u32,
    height: u32,
    bit_depth: u8,
    color_type: u8,
    interlace: u8,
    compressed: &[u8],
    split: usize,
) -> Vec<u8> {
    let mut png = PNG_SIGNATURE.to_vec();
    let mut ihdr = Vec::with_capacity(13);
    ihdr.extend(width.to_be_bytes());
    ihdr.extend(height.to_be_bytes());
    ihdr.extend([bit_depth, color_type, 0, 0, interlace]);
    append_chunk(&mut png, b"IHDR", &ihdr);
    if compressed.is_empty() {
        append_chunk(&mut png, b"IDAT", &[]);
    } else {
        for part in compressed.chunks(split) {
            append_chunk(&mut png, b"IDAT", part);
        }
    }
    append_chunk(&mut png, b"IEND", &[]);
    png
}

fn append_chunk(png: &mut Vec<u8>, chunk_type: &[u8; 4], data: &[u8]) {
    png.extend(u32::try_from(data.len()).unwrap().to_be_bytes());
    let crc_start = png.len();
    png.extend(chunk_type);
    png.extend(data);
    png.extend(crc32(&png[crc_start..]).to_be_bytes());
}
