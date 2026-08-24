//! Frozen reference decoder for the `vivi2d.png.rgba8.v1` profile.
//!
//! This crate deliberately implements a small, immutable PNG profile rather
//! than exposing a configurable general-purpose decoder. Inspection performs
//! no heap allocation. Decoding validates the complete chunk stream before it
//! inflates any IDAT data and commits to caller memory only after the complete
//! RGBA8 image has been produced successfully in decoder-owned scratch space.

use std::fmt;

use miniz_oxide::inflate::stream::{InflateState, inflate};
use miniz_oxide::{DataFormat, MZFlush, MZStatus};
use sha2::{Digest, Sha256};

/// Immutable name of the frozen decoder profile.
pub const PROFILE: &str = "vivi2d.png.rgba8.v1";
/// Size of the raw SHA-256 digest accepted by [`decode`] and [`decode_into`].
pub const SHA256_BYTES: usize = 32;

pub const MAX_WIDTH: u32 = 8_192;
pub const MAX_HEIGHT: u32 = 8_192;
pub const MAX_PIXELS: u64 = 67_108_864;
pub const MAX_PNG_INPUT_BYTES: u64 = 67_108_864;
pub const MAX_TEXTURE_BYTES: u64 = 268_435_456;

/// Frozen resource limits for [`PROFILE`]. Callers cannot replace or relax
/// these limits.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Limits {
    pub max_width: u32,
    pub max_height: u32,
    pub max_pixels: u64,
    pub max_png_input_bytes: u64,
    pub max_texture_bytes: u64,
}

pub const LIMITS: Limits = Limits {
    max_width: MAX_WIDTH,
    max_height: MAX_HEIGHT,
    max_pixels: MAX_PIXELS,
    max_png_input_bytes: MAX_PNG_INPUT_BYTES,
    max_texture_bytes: MAX_TEXTURE_BYTES,
};

/// The five frozen PNG-content classifications. C API misuse is intentionally
/// outside this enum and belongs to the FFI wrapper.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(i32)]
pub enum Error {
    Unsupported = 2,
    Malformed = 3,
    Limit = 4,
    Dimension = 5,
    ContentHashMismatch = 6,
}

impl Error {
    #[must_use]
    pub const fn status_code(self) -> i32 {
        self as i32
    }

    #[must_use]
    pub const fn as_i32(self) -> i32 {
        self as i32
    }
}

impl fmt::Display for Error {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self {
            Self::Unsupported => "PNG is outside vivi2d.png.rgba8.v1",
            Self::Malformed => "PNG is malformed",
            Self::Limit => "PNG exceeds a frozen profile resource limit",
            Self::Dimension => "PNG dimensions do not match the declaration",
            Self::ContentHashMismatch => "PNG content SHA-256 does not match",
        })
    }
}

impl std::error::Error for Error {}

/// Allocation-planning result returned by [`inspect`] and successful decode.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Info {
    pub width: u32,
    pub height: u32,
    pub required_output_bytes: u64,
}

/// An owned, tightly packed RGBA8 straight-alpha image.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DecodedImage {
    pub info: Info,
    pub rgba: Vec<u8>,
}

const PNG_SIGNATURE: &[u8; 8] = b"\x89PNG\r\n\x1a\n";

#[derive(Clone, Copy)]
struct Parsed<'a> {
    info: Info,
    color_type: u8,
    channels: usize,
    palette: Option<&'a [u8]>,
    transparency: Option<&'a [u8]>,
    compressed_bytes: u64,
}

/// Validates the complete PNG structure without allocating heap memory.
///
/// This includes the signature, every chunk type and CRC, strict ordering,
/// accepted color profile, declared dimensions, and immutable profile limits.
pub fn inspect(bytes: &[u8], declared_width: u32, declared_height: u32) -> Result<Info, Error> {
    Ok(parse_png(bytes, declared_width, declared_height)?.info)
}

/// Decodes to one decoder-owned full-image allocation.
///
/// A failed operation exposes no partially decoded image.
pub fn decode(
    bytes: &[u8],
    expected_content_sha256: &[u8; SHA256_BYTES],
    declared_width: u32,
    declared_height: u32,
) -> Result<DecodedImage, Error> {
    let (info, rgba) = decode_to_scratch(
        bytes,
        expected_content_sha256,
        declared_width,
        declared_height,
        None,
        ScratchPolicy::Normal,
    )?;
    Ok(DecodedImage { info, rgba })
}

/// Failure-atomic decode into caller-owned storage.
///
/// On success only `output[..info.required_output_bytes]` is replaced. Any
/// capacity surplus is unchanged. On every error the entire `output` slice is
/// byte-for-byte unchanged.
pub fn decode_into(
    bytes: &[u8],
    expected_content_sha256: &[u8; SHA256_BYTES],
    declared_width: u32,
    declared_height: u32,
    output: &mut [u8],
) -> Result<Info, Error> {
    let output_capacity = u64::try_from(output.len()).map_err(|_| Error::Limit)?;
    let (info, scratch) = decode_to_scratch(
        bytes,
        expected_content_sha256,
        declared_width,
        declared_height,
        Some(output_capacity),
        ScratchPolicy::Normal,
    )?;
    output[..scratch.len()].copy_from_slice(&scratch);
    Ok(info)
}

#[derive(Clone, Copy)]
enum ScratchPolicy {
    Normal,
    #[cfg(test)]
    FailFullImage,
}

fn decode_to_scratch(
    bytes: &[u8],
    expected_content_sha256: &[u8; SHA256_BYTES],
    declared_width: u32,
    declared_height: u32,
    output_capacity: Option<u64>,
    scratch_policy: ScratchPolicy,
) -> Result<(Info, Vec<u8>), Error> {
    // Normative order 1: reject an oversized input before hashing it.
    let input_len = u64::try_from(bytes.len()).map_err(|_| Error::Limit)?;
    if input_len > MAX_PNG_INPUT_BYTES {
        return Err(Error::Limit);
    }

    // Normative order 2: bind the exact logical bytes before interpreting PNG.
    let actual_digest = Sha256::digest(bytes);
    if actual_digest.as_slice() != expected_content_sha256 {
        return Err(Error::ContentHashMismatch);
    }

    // Normative orders 3 and 4. parse_png performs a complete pass, including
    // all chunks after IDAT, so CRC/order failures cannot be hidden by inflate.
    let parsed = parse_png(bytes, declared_width, declared_height)?;
    if output_capacity.is_some_and(|capacity| capacity < parsed.info.required_output_bytes) {
        return Err(Error::Limit);
    }

    let required = usize::try_from(parsed.info.required_output_bytes).map_err(|_| Error::Limit)?;
    let mut rgba = allocate_zeroed(required, scratch_policy)?;

    let row_bytes = usize::try_from(parsed.info.width)
        .ok()
        .and_then(|width| width.checked_mul(parsed.channels))
        .ok_or(Error::Limit)?;
    let mut previous = allocate_zeroed(row_bytes, ScratchPolicy::Normal)?;
    let mut current = allocate_zeroed(row_bytes, ScratchPolicy::Normal)?;

    inflate_rows(bytes, parsed, &mut previous, &mut current, &mut rgba)?;
    Ok((parsed.info, rgba))
}

fn allocate_zeroed(length: usize, policy: ScratchPolicy) -> Result<Vec<u8>, Error> {
    #[cfg(test)]
    if matches!(policy, ScratchPolicy::FailFullImage) {
        return Err(Error::Limit);
    }
    let _ = policy;

    let mut allocation = Vec::new();
    allocation
        .try_reserve_exact(length)
        .map_err(|_| Error::Limit)?;
    allocation.resize(length, 0);
    Ok(allocation)
}

fn inflate_rows<'scratch>(
    bytes: &[u8],
    parsed: Parsed<'_>,
    mut previous: &'scratch mut [u8],
    mut current: &'scratch mut [u8],
    rgba: &mut [u8],
) -> Result<(), Error> {
    // `InflateState::new` contains its 32 KiB history dictionary inline and,
    // with miniz_oxide's `with-alloc` feature disabled, performs no hidden heap
    // allocation. All heap scratch in this crate therefore goes through the
    // fallible allocation seam above.
    let mut state = InflateState::new(DataFormat::Zlib);
    let mut input = IdatCursor::new(bytes, parsed.compressed_bytes);
    let height = usize::try_from(parsed.info.height).map_err(|_| Error::Limit)?;
    let width = usize::try_from(parsed.info.width).map_err(|_| Error::Limit)?;
    let mut filter_byte = [0_u8; 1];
    let mut stream_ended = false;

    for row in 0..height {
        inflate_exact(&mut state, &mut input, &mut filter_byte, &mut stream_ended)?;
        inflate_exact(&mut state, &mut input, current, &mut stream_ended)?;
        unfilter_row(filter_byte[0], parsed.channels, previous, current)?;
        expand_row(
            parsed,
            current,
            &mut rgba[row * width * 4..(row + 1) * width * 4],
        )?;
        std::mem::swap(&mut previous, &mut current);
    }

    // Require the zlib stream to end at exactly the expected filtered length.
    // A second stream, extra decompressed byte, truncated checksum, or trailing
    // compressed byte in the IDAT sequence is malformed.
    finish_inflate_exact(&mut state, &mut input, stream_ended)
}

fn inflate_exact(
    state: &mut InflateState,
    input: &mut IdatCursor<'_>,
    mut output: &mut [u8],
    stream_ended: &mut bool,
) -> Result<(), Error> {
    while !output.is_empty() {
        if *stream_ended {
            return Err(Error::Malformed);
        }
        let range = input.current_range();
        let compressed = range.map_or(&[][..], |(start, end)| &input.bytes[start..end]);
        let result = inflate(state, compressed, output, MZFlush::None);
        if result.bytes_consumed == 0 && result.bytes_written == 0 {
            return Err(Error::Malformed);
        }
        input.consume(result.bytes_consumed)?;
        output = &mut output[result.bytes_written..];
        match result.status {
            Ok(MZStatus::StreamEnd) => *stream_ended = true,
            Ok(MZStatus::Ok) => {}
            Ok(_) | Err(_) => return Err(Error::Malformed),
        }
    }
    Ok(())
}

fn finish_inflate_exact(
    state: &mut InflateState,
    input: &mut IdatCursor<'_>,
    mut stream_ended: bool,
) -> Result<(), Error> {
    if stream_ended {
        return if input.remaining == 0 {
            Ok(())
        } else {
            Err(Error::Malformed)
        };
    }

    let mut extra = [0_u8; 1];
    loop {
        let range = input.current_range();
        let (compressed, flush) = match range {
            Some((start, end)) => (&input.bytes[start..end], MZFlush::None),
            None => (&[][..], MZFlush::Finish),
        };
        let result = inflate(state, compressed, &mut extra, flush);
        if result.bytes_written != 0 {
            return Err(Error::Malformed);
        }
        input.consume(result.bytes_consumed)?;
        match result.status {
            Ok(MZStatus::StreamEnd) => stream_ended = true,
            Ok(MZStatus::Ok) => {
                if result.bytes_consumed == 0 {
                    return Err(Error::Malformed);
                }
            }
            Ok(_) | Err(_) => return Err(Error::Malformed),
        }
        if stream_ended {
            return if input.remaining == 0 {
                Ok(())
            } else {
                Err(Error::Malformed)
            };
        }
    }
}

fn unfilter_row(
    filter: u8,
    bytes_per_pixel: usize,
    previous: &[u8],
    current: &mut [u8],
) -> Result<(), Error> {
    if filter > 4 {
        return Err(Error::Malformed);
    }
    for index in 0..current.len() {
        let encoded = current[index];
        let left = index
            .checked_sub(bytes_per_pixel)
            .map_or(0, |left_index| current[left_index]);
        let above = previous[index];
        let upper_left = index
            .checked_sub(bytes_per_pixel)
            .map_or(0, |left_index| previous[left_index]);
        let predictor = match filter {
            0 => 0,
            1 => left,
            2 => above,
            3 => ((u16::from(left) + u16::from(above)) / 2) as u8,
            4 => paeth(left, above, upper_left),
            _ => unreachable!(),
        };
        current[index] = encoded.wrapping_add(predictor);
    }
    Ok(())
}

fn paeth(left: u8, above: u8, upper_left: u8) -> u8 {
    let left = i32::from(left);
    let above = i32::from(above);
    let upper_left = i32::from(upper_left);
    let prediction = left + above - upper_left;
    let left_distance = (prediction - left).abs();
    let above_distance = (prediction - above).abs();
    let upper_left_distance = (prediction - upper_left).abs();
    if left_distance <= above_distance && left_distance <= upper_left_distance {
        left as u8
    } else if above_distance <= upper_left_distance {
        above as u8
    } else {
        upper_left as u8
    }
}

fn expand_row(parsed: Parsed<'_>, raw: &[u8], rgba: &mut [u8]) -> Result<(), Error> {
    for (input, output) in raw
        .chunks_exact(parsed.channels)
        .zip(rgba.chunks_exact_mut(4))
    {
        match parsed.color_type {
            0 => {
                let gray = input[0];
                output.copy_from_slice(&[
                    gray,
                    gray,
                    gray,
                    if transparent_gray(parsed.transparency) == Some(gray) {
                        0
                    } else {
                        255
                    },
                ]);
            }
            2 => {
                let rgb = [input[0], input[1], input[2]];
                output.copy_from_slice(&[
                    rgb[0],
                    rgb[1],
                    rgb[2],
                    if transparent_rgb(parsed.transparency) == Some(rgb) {
                        0
                    } else {
                        255
                    },
                ]);
            }
            3 => {
                let index = usize::from(input[0]);
                let palette = parsed.palette.ok_or(Error::Malformed)?;
                let palette_offset = index.checked_mul(3).ok_or(Error::Malformed)?;
                let color = palette
                    .get(palette_offset..palette_offset + 3)
                    .ok_or(Error::Malformed)?;
                let alpha = parsed
                    .transparency
                    .and_then(|values| values.get(index))
                    .copied()
                    .unwrap_or(255);
                output.copy_from_slice(&[color[0], color[1], color[2], alpha]);
            }
            4 => {
                output.copy_from_slice(&[input[0], input[0], input[0], input[1]]);
            }
            6 => output.copy_from_slice(input),
            _ => return Err(Error::Unsupported),
        }
    }
    Ok(())
}

fn transparent_gray(transparency: Option<&[u8]>) -> Option<u8> {
    transparency.map(|value| value[1])
}

fn transparent_rgb(transparency: Option<&[u8]>) -> Option<[u8; 3]> {
    transparency.map(|value| [value[1], value[3], value[5]])
}

fn parse_png(bytes: &[u8], declared_width: u32, declared_height: u32) -> Result<Parsed<'_>, Error> {
    let input_len = u64::try_from(bytes.len()).map_err(|_| Error::Limit)?;
    if input_len > MAX_PNG_INPUT_BYTES {
        return Err(Error::Limit);
    }
    if !bytes.starts_with(PNG_SIGNATURE) {
        return Err(Error::Malformed);
    }

    let mut offset = PNG_SIGNATURE.len();
    let mut ihdr: Option<(u32, u32, u8, u8, u8, u8, u8)> = None;
    let mut palette = None;
    let mut transparency = None;
    let mut saw_idat = false;
    let mut idat_ended = false;
    let mut saw_iend = false;
    let mut compressed_bytes = 0_u64;
    let mut chunk_count = 0_usize;

    while offset < bytes.len() {
        let header_end = offset.checked_add(8).ok_or(Error::Malformed)?;
        if header_end > bytes.len() {
            return Err(Error::Malformed);
        }
        let length = usize::try_from(read_be_u32(&bytes[offset..offset + 4]))
            .map_err(|_| Error::Malformed)?;
        let chunk_type = &bytes[offset + 4..offset + 8];
        if !chunk_type.iter().all(u8::is_ascii_alphabetic) {
            return Err(Error::Malformed);
        }
        if chunk_type[2].is_ascii_lowercase() {
            return Err(Error::Malformed);
        }
        let data_start = header_end;
        let data_end = data_start.checked_add(length).ok_or(Error::Malformed)?;
        let chunk_end = data_end.checked_add(4).ok_or(Error::Malformed)?;
        if chunk_end > bytes.len() {
            return Err(Error::Malformed);
        }
        if crc32(&bytes[offset + 4..data_end]) != read_be_u32(&bytes[data_end..chunk_end]) {
            return Err(Error::Malformed);
        }
        let data = &bytes[data_start..data_end];

        if chunk_count == 0 && chunk_type != b"IHDR" {
            return Err(Error::Malformed);
        }
        if saw_iend {
            return Err(Error::Malformed);
        }
        if saw_idat && chunk_type != b"IDAT" && chunk_type != b"IEND" {
            idat_ended = true;
        }
        if idat_ended && chunk_type == b"IDAT" {
            return Err(Error::Malformed);
        }
        chunk_count = chunk_count.checked_add(1).ok_or(Error::Malformed)?;

        match chunk_type {
            b"IHDR" => {
                if ihdr.is_some() || data.len() != 13 {
                    return Err(Error::Malformed);
                }
                ihdr = Some((
                    read_be_u32(&data[0..4]),
                    read_be_u32(&data[4..8]),
                    data[8],
                    data[9],
                    data[10],
                    data[11],
                    data[12],
                ));
            }
            b"PLTE" => {
                if saw_idat
                    || palette.is_some()
                    || data.is_empty()
                    || data.len() > 768
                    || !data.len().is_multiple_of(3)
                {
                    return Err(Error::Malformed);
                }
                let color_type = ihdr.ok_or(Error::Malformed)?.3;
                if matches!(color_type, 0 | 4) {
                    return Err(Error::Malformed);
                }
                palette = Some(data);
            }
            b"tRNS" => {
                if saw_idat || transparency.is_some() {
                    return Err(Error::Malformed);
                }
                let color_type = ihdr.ok_or(Error::Malformed)?.3;
                let valid = match color_type {
                    0 => data.len() == 2 && read_be_u16(data) <= 0xff,
                    2 => {
                        data.len() == 6
                            && read_be_u16(&data[0..2]) <= 0xff
                            && read_be_u16(&data[2..4]) <= 0xff
                            && read_be_u16(&data[4..6]) <= 0xff
                    }
                    3 => palette.is_some_and(|value| data.len() <= value.len() / 3),
                    _ => false,
                };
                if !valid {
                    return Err(Error::Malformed);
                }
                transparency = Some(data);
            }
            b"acTL" | b"fcTL" | b"fdAT" => return Err(Error::Unsupported),
            b"IDAT" => {
                saw_idat = true;
                compressed_bytes = compressed_bytes
                    .checked_add(u64::try_from(data.len()).map_err(|_| Error::Limit)?)
                    .ok_or(Error::Limit)?;
            }
            b"IEND" => {
                if !data.is_empty() {
                    return Err(Error::Malformed);
                }
                saw_iend = true;
                offset = chunk_end;
                if offset != bytes.len() {
                    return Err(Error::Malformed);
                }
                break;
            }
            _ if chunk_type[0].is_ascii_uppercase() => return Err(Error::Unsupported),
            _ => {}
        }
        offset = chunk_end;
    }

    let (width, height, bit_depth, color_type, compression, filter, interlace) =
        ihdr.ok_or(Error::Malformed)?;
    if !saw_idat || !saw_iend {
        return Err(Error::Malformed);
    }
    if width == 0 || height == 0 {
        return Err(Error::Malformed);
    }
    if compression != 0 || filter != 0 {
        return Err(Error::Unsupported);
    }
    if bit_depth != 8 {
        return Err(Error::Unsupported);
    }
    let channels = match color_type {
        0 | 3 => 1,
        2 => 3,
        4 => 2,
        6 => 4,
        _ => return Err(Error::Unsupported),
    };
    if interlace != 0 {
        return Err(Error::Unsupported);
    }
    if width != declared_width || height != declared_height {
        return Err(Error::Dimension);
    }

    // The dimension classification deliberately precedes these limits.
    if width > MAX_WIDTH || height > MAX_HEIGHT {
        return Err(Error::Limit);
    }
    let pixels = u64::from(width)
        .checked_mul(u64::from(height))
        .ok_or(Error::Limit)?;
    if pixels > MAX_PIXELS {
        return Err(Error::Limit);
    }
    let required_output_bytes = pixels.checked_mul(4).ok_or(Error::Limit)?;
    if required_output_bytes > MAX_TEXTURE_BYTES {
        return Err(Error::Limit);
    }
    if color_type == 3 && palette.is_none() {
        return Err(Error::Malformed);
    }

    Ok(Parsed {
        info: Info {
            width,
            height,
            required_output_bytes,
        },
        color_type,
        channels,
        palette,
        transparency,
        compressed_bytes,
    })
}

struct IdatCursor<'a> {
    bytes: &'a [u8],
    scan_offset: usize,
    data_offset: usize,
    data_end: usize,
    finished: bool,
    remaining: u64,
}

impl<'a> IdatCursor<'a> {
    fn new(bytes: &'a [u8], remaining: u64) -> Self {
        Self {
            bytes,
            scan_offset: PNG_SIGNATURE.len(),
            data_offset: 0,
            data_end: 0,
            finished: false,
            remaining,
        }
    }

    fn advance(&mut self) {
        while !self.finished && self.data_offset == self.data_end {
            let length = read_be_u32(&self.bytes[self.scan_offset..self.scan_offset + 4]) as usize;
            let chunk_type = &self.bytes[self.scan_offset + 4..self.scan_offset + 8];
            let data_start = self.scan_offset + 8;
            let data_end = data_start + length;
            self.scan_offset = data_end + 4;
            if chunk_type == b"IDAT" && length != 0 {
                self.data_offset = data_start;
                self.data_end = data_end;
            } else if chunk_type == b"IEND" {
                self.finished = true;
            }
        }
    }

    fn current_range(&mut self) -> Option<(usize, usize)> {
        self.advance();
        if self.finished {
            None
        } else {
            Some((self.data_offset, self.data_end))
        }
    }

    fn consume(&mut self, count: usize) -> Result<(), Error> {
        if count > self.data_end.saturating_sub(self.data_offset) {
            return Err(Error::Malformed);
        }
        self.data_offset += count;
        self.remaining = self
            .remaining
            .checked_sub(u64::try_from(count).map_err(|_| Error::Malformed)?)
            .ok_or(Error::Malformed)?;
        Ok(())
    }
}

fn read_be_u16(bytes: &[u8]) -> u16 {
    u16::from_be_bytes([bytes[0], bytes[1]])
}

fn read_be_u32(bytes: &[u8]) -> u32 {
    u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]])
}

const CRC_TABLE: [u32; 256] = build_crc_table();

const fn build_crc_table() -> [u32; 256] {
    let mut table = [0_u32; 256];
    let mut index = 0;
    while index < table.len() {
        let mut value = index as u32;
        let mut bit = 0;
        while bit < 8 {
            value = if value & 1 == 1 {
                0xedb8_8320 ^ (value >> 1)
            } else {
                value >> 1
            };
            bit += 1;
        }
        table[index] = value;
        index += 1;
    }
    table
}

fn crc32(bytes: &[u8]) -> u32 {
    let mut crc = 0xffff_ffff_u32;
    for &byte in bytes {
        crc = CRC_TABLE[((crc ^ u32::from(byte)) & 0xff) as usize] ^ (crc >> 8);
    }
    crc ^ 0xffff_ffff
}

#[cfg(test)]
mod tests;
