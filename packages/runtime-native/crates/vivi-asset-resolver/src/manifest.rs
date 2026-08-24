use std::collections::{BTreeMap, BTreeSet, HashSet};
use std::fmt::Write as _;

use serde::de::{self, DeserializeSeed, Error as _, MapAccess, SeqAccess, Visitor};
use sha2::{Digest as _, Sha256};

use crate::{AssetError, AssetErrorCode, Digest};

mod schema_equivalent;

pub const MANIFEST_INPUT_MAX_BYTES: usize = 1_048_576;
pub const MANIFEST_JCS_MAX_BYTES: usize = 1_048_576;
pub const CHUNK_BYTES: u64 = 8_388_608;
pub const MAX_CHUNKS: usize = 8_192;
pub const MAX_LOGICAL_BYTES: u64 = 68_719_476_736;

/// Exact approved Schema 2020-12 artifact carried with the validator.
pub const APPROVED_ASSET_SCHEMA_BYTES: &[u8] =
    include_bytes!("../schema/asset-model-v1.schema.json");
pub const APPROVED_ASSET_SCHEMA_SHA256: &str =
    "dfe762b5363fd2bf12ebf41fe7e81e8eb1d7cacfa9c5af1646004dfc49c52671";

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Chunk {
    pub sha256: Digest,
    pub size_bytes: u64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ParsedManifest {
    pub media_type: String,
    pub content_sha256: Digest,
    pub size_bytes: u64,
    pub chunks: Vec<Chunk>,
    pub object_address: Digest,
    pub jcs_bytes: Vec<u8>,
}

impl ParsedManifest {
    /// Manifest object plus the unique transitive chunks. Ordered duplicate
    /// chunks remain valid in `chunks` but collapse in a closure set.
    #[must_use]
    pub fn required_object_addresses(&self) -> BTreeSet<Digest> {
        let mut result = BTreeSet::new();
        result.insert(self.object_address);
        result.extend(self.chunks.iter().map(|chunk| chunk.sha256));
        result
    }
}

/// Parses and validates a fetched chunk manifest in the frozen order:
/// raw ceiling, UTF-8, duplicate-aware JSON, approved Schema Stage 1, then
/// semantic/JCS Stage 2. Internal digest strings retain received casing until
/// after JCS hashing.
pub fn parse_chunk_manifest(raw: &[u8]) -> Result<ParsedManifest, AssetError> {
    if raw.len() > MANIFEST_INPUT_MAX_BYTES {
        return Err(asset_error(
            AssetErrorCode::LimitExceeded,
            "raw manifest exceeds 1 MiB",
        ));
    }
    let text = std::str::from_utf8(raw).map_err(|_| {
        asset_error(
            AssetErrorCode::ManifestInvalid,
            "manifest is not valid UTF-8",
        )
    })?;

    // Duplicate rejection is deliberately before Stage 1. `serde_json::Value`
    // would silently replace an earlier member and is therefore not used.
    let raw_value = parse_duplicate_aware(text)?;
    let stage1 = schema_equivalent::validate_asset_chunk_manifest_v1(raw_value)?;
    validate_stage2(stage1)
}

/// Validates an externally supplied closure after case-insensitive digest
/// normalization. Missing, extra, invalid, or colliding entries share the
/// frozen REF_SET_MISMATCH code.
pub fn validate_exact_closure(
    expected: &BTreeSet<Digest>,
    supplied_wire_hex: &[&str],
) -> Result<(), AssetError> {
    if supplied_wire_hex.len() != expected.len() {
        return Err(asset_error(
            AssetErrorCode::RefSetMismatch,
            "closure cardinality differs before normalization",
        ));
    }
    let mut supplied = HashSet::new();
    supplied.try_reserve(expected.len()).map_err(|_| {
        asset_error(
            AssetErrorCode::LimitExceeded,
            "closure normalization allocation failed",
        )
    })?;
    for value in supplied_wire_hex {
        let digest = Digest::from_hex(value).map_err(|_| {
            asset_error(
                AssetErrorCode::RefSetMismatch,
                "closure contains an invalid digest",
            )
        })?;
        if !supplied.insert(digest) {
            return Err(asset_error(
                AssetErrorCode::RefSetMismatch,
                "closure collides after digest-case normalization",
            ));
        }
    }
    if !expected.iter().all(|digest| supplied.contains(digest)) {
        return Err(asset_error(
            AssetErrorCode::RefSetMismatch,
            "closure has missing or unreachable objects",
        ));
    }
    Ok(())
}

#[derive(Clone, Debug)]
pub(crate) enum RawJson {
    Null,
    Bool(bool),
    Number(RawNumber),
    String(String),
    Array(Vec<RawJson>),
    Object(BTreeMap<String, RawJson>),
}

#[derive(Clone, Copy, Debug)]
pub(crate) enum RawNumber {
    Signed(i64),
    Unsigned(u64),
    Float(f64),
}

#[derive(Clone, Debug)]
pub(crate) struct Stage1Chunk {
    pub received_sha256: String,
    pub sha256: Digest,
    pub size_bytes: u64,
}

#[derive(Clone, Debug)]
pub(crate) struct Stage1Manifest {
    pub schema: String,
    pub media_type: String,
    pub received_content_sha256: String,
    pub content_sha256: Digest,
    pub size_bytes: u64,
    pub chunk_size_bytes: u64,
    pub chunks: Vec<Stage1Chunk>,
}

fn validate_stage2(value: Stage1Manifest) -> Result<ParsedManifest, AssetError> {
    if value.media_type.is_empty() || value.media_type.len() > 255 {
        return Err(asset_error(
            AssetErrorCode::LimitExceeded,
            "mediaType is outside the 1..255 UTF-8 byte bound",
        ));
    }
    if value
        .media_type
        .chars()
        .any(|character| character <= '\u{1f}' || character == '\u{7f}')
    {
        return Err(asset_error(
            AssetErrorCode::ManifestInvalid,
            "mediaType contains an ASCII control character",
        ));
    }
    if value.schema != "vivi2d.assetChunkManifest.v1" || value.chunk_size_bytes != CHUNK_BYTES {
        return Err(asset_error(
            AssetErrorCode::ManifestInvalid,
            "manifest constants do not match v1",
        ));
    }

    let mut sum = 0_u64;
    let final_index = value.chunks.len().checked_sub(1).ok_or_else(|| {
        asset_error(
            AssetErrorCode::ManifestInvalid,
            "manifest has no final chunk",
        )
    })?;
    for (index, chunk) in value.chunks.iter().enumerate() {
        if index != final_index && chunk.size_bytes != CHUNK_BYTES {
            return Err(asset_error(
                AssetErrorCode::ManifestInvalid,
                "a non-final chunk is not exactly 8 MiB",
            ));
        }
        sum = sum.checked_add(chunk.size_bytes).ok_or_else(|| {
            asset_error(AssetErrorCode::LimitExceeded, "chunk-size sum overflowed")
        })?;
        if sum > MAX_LOGICAL_BYTES {
            return Err(asset_error(
                AssetErrorCode::LimitExceeded,
                "chunk-size sum exceeds 64 GiB",
            ));
        }
    }
    if sum != value.size_bytes {
        return Err(asset_error(
            AssetErrorCode::ManifestInvalid,
            "chunk-size sum differs from sizeBytes",
        ));
    }

    let jcs_bytes = build_jcs(&value)?;
    if jcs_bytes.len() > MANIFEST_JCS_MAX_BYTES {
        return Err(asset_error(
            AssetErrorCode::LimitExceeded,
            "canonical manifest exceeds 1 MiB",
        ));
    }
    // This is intentionally after the canonical-byte ceiling.
    let object_address = sha256(&jcs_bytes);
    let chunks = value
        .chunks
        .into_iter()
        .map(|chunk| Chunk {
            sha256: chunk.sha256,
            size_bytes: chunk.size_bytes,
        })
        .collect();
    Ok(ParsedManifest {
        media_type: value.media_type,
        content_sha256: value.content_sha256,
        size_bytes: value.size_bytes,
        chunks,
        object_address,
        jcs_bytes,
    })
}

fn build_jcs(value: &Stage1Manifest) -> Result<Vec<u8>, AssetError> {
    let mut text = String::new();
    try_push(&mut text, "{\"chunkSizeBytes\":")?;
    write_number(&mut text, value.chunk_size_bytes)?;
    try_push(&mut text, ",\"chunks\":[")?;
    for (index, chunk) in value.chunks.iter().enumerate() {
        if index != 0 {
            try_push(&mut text, ",")?;
        }
        try_push(&mut text, "{\"sha256\":")?;
        push_json_string(&mut text, &chunk.received_sha256)?;
        try_push(&mut text, ",\"sizeBytes\":")?;
        write_number(&mut text, chunk.size_bytes)?;
        try_push(&mut text, "}")?;
    }
    try_push(&mut text, "],\"contentSha256\":")?;
    push_json_string(&mut text, &value.received_content_sha256)?;
    try_push(&mut text, ",\"mediaType\":")?;
    push_json_string(&mut text, &value.media_type)?;
    try_push(&mut text, ",\"schema\":")?;
    push_json_string(&mut text, &value.schema)?;
    try_push(&mut text, ",\"sizeBytes\":")?;
    write_number(&mut text, value.size_bytes)?;
    try_push(&mut text, "}")?;
    Ok(text.into_bytes())
}

fn try_push(output: &mut String, value: &str) -> Result<(), AssetError> {
    let prospective = output
        .len()
        .checked_add(value.len())
        .ok_or_else(|| asset_error(AssetErrorCode::LimitExceeded, "JCS length overflowed"))?;
    if prospective > MANIFEST_JCS_MAX_BYTES {
        return Err(asset_error(
            AssetErrorCode::LimitExceeded,
            "canonical manifest exceeds 1 MiB",
        ));
    }
    output.try_reserve(value.len()).map_err(|_| {
        asset_error(
            AssetErrorCode::LimitExceeded,
            "canonical manifest allocation failed",
        )
    })?;
    output.push_str(value);
    Ok(())
}

fn write_number(output: &mut String, value: u64) -> Result<(), AssetError> {
    let mut scratch = String::new();
    write!(&mut scratch, "{value}").map_err(|_| {
        asset_error(
            AssetErrorCode::LimitExceeded,
            "canonical number formatting failed",
        )
    })?;
    try_push(output, &scratch)
}

fn push_json_string(output: &mut String, value: &str) -> Result<(), AssetError> {
    try_push(output, "\"")?;
    let mut plain_start = 0;
    for (index, character) in value.char_indices() {
        let escaped = match character {
            '"' => Some("\\\""),
            '\\' => Some("\\\\"),
            '\u{08}' => Some("\\b"),
            '\u{0c}' => Some("\\f"),
            '\n' => Some("\\n"),
            '\r' => Some("\\r"),
            '\t' => Some("\\t"),
            _ if character <= '\u{1f}' => None,
            _ => continue,
        };
        try_push(output, &value[plain_start..index])?;
        if let Some(escaped) = escaped {
            try_push(output, escaped)?;
        } else {
            let mut escape = [0_u8; 6];
            escape[..2].copy_from_slice(b"\\u");
            let code = character as u32;
            const HEX: &[u8; 16] = b"0123456789abcdef";
            for offset in 0..4 {
                escape[2 + offset] = HEX[((code >> (12 - offset * 4)) & 0xf) as usize];
            }
            let escape = std::str::from_utf8(&escape).map_err(|_| {
                asset_error(
                    AssetErrorCode::ManifestInvalid,
                    "canonical escape construction failed",
                )
            })?;
            try_push(output, escape)?;
        }
        plain_start = index + character.len_utf8();
    }
    try_push(output, &value[plain_start..])?;
    try_push(output, "\"")
}

fn sha256(bytes: &[u8]) -> Digest {
    let hash = Sha256::digest(bytes);
    let mut result = [0_u8; Digest::LENGTH];
    result.copy_from_slice(&hash);
    Digest::from_bytes(result)
}

fn parse_duplicate_aware(text: &str) -> Result<RawJson, AssetError> {
    let mut deserializer = serde_json::Deserializer::from_str(text);
    let value = RawJsonSeed.deserialize(&mut deserializer).map_err(|_| {
        asset_error(
            AssetErrorCode::ManifestInvalid,
            "manifest JSON is malformed or contains a duplicate member",
        )
    })?;
    deserializer.end().map_err(|_| {
        asset_error(
            AssetErrorCode::ManifestInvalid,
            "manifest JSON has trailing data",
        )
    })?;
    Ok(value)
}

#[cfg(test)]
pub(crate) fn validate_stage1_for_parity(raw: &[u8]) -> Result<(), AssetError> {
    if raw.len() > MANIFEST_INPUT_MAX_BYTES {
        return Err(asset_error(
            AssetErrorCode::LimitExceeded,
            "raw manifest exceeds 1 MiB",
        ));
    }
    let text = std::str::from_utf8(raw).map_err(|_| {
        asset_error(
            AssetErrorCode::ManifestInvalid,
            "manifest is not valid UTF-8",
        )
    })?;
    let raw_value = parse_duplicate_aware(text)?;
    schema_equivalent::validate_asset_chunk_manifest_v1(raw_value).map(|_| ())
}

struct RawJsonSeed;

impl<'de> DeserializeSeed<'de> for RawJsonSeed {
    type Value = RawJson;

    fn deserialize<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        deserializer.deserialize_any(RawJsonVisitor)
    }
}

struct RawJsonVisitor;

impl<'de> Visitor<'de> for RawJsonVisitor {
    type Value = RawJson;

    fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("a JSON value")
    }

    fn visit_bool<E>(self, value: bool) -> Result<Self::Value, E> {
        Ok(RawJson::Bool(value))
    }

    fn visit_i64<E>(self, value: i64) -> Result<Self::Value, E> {
        Ok(RawJson::Number(RawNumber::Signed(value)))
    }

    fn visit_u64<E>(self, value: u64) -> Result<Self::Value, E> {
        Ok(RawJson::Number(RawNumber::Unsigned(value)))
    }

    fn visit_f64<E>(self, value: f64) -> Result<Self::Value, E> {
        Ok(RawJson::Number(RawNumber::Float(value)))
    }

    fn visit_str<E>(self, value: &str) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        Ok(RawJson::String(value.to_owned()))
    }

    fn visit_string<E>(self, value: String) -> Result<Self::Value, E> {
        Ok(RawJson::String(value))
    }

    fn visit_none<E>(self) -> Result<Self::Value, E> {
        Ok(RawJson::Null)
    }

    fn visit_unit<E>(self) -> Result<Self::Value, E> {
        Ok(RawJson::Null)
    }

    fn visit_seq<A>(self, mut sequence: A) -> Result<Self::Value, A::Error>
    where
        A: SeqAccess<'de>,
    {
        let mut values = Vec::new();
        while let Some(value) = sequence.next_element_seed(RawJsonSeed)? {
            values.push(value);
        }
        Ok(RawJson::Array(values))
    }

    fn visit_map<A>(self, mut map: A) -> Result<Self::Value, A::Error>
    where
        A: MapAccess<'de>,
    {
        let mut values = BTreeMap::new();
        while let Some(key) = map.next_key::<String>()? {
            if values.contains_key(&key) {
                return Err(A::Error::custom("duplicate JSON object member"));
            }
            let value = map.next_value_seed(RawJsonSeed)?;
            values.insert(key, value);
        }
        Ok(RawJson::Object(values))
    }
}

pub(crate) fn asset_error(code: AssetErrorCode, detail: &'static str) -> AssetError {
    AssetError::new(code, detail)
}
