//! Self-contained compiled-equivalent Stage 1 validator for the
//! `AssetChunkManifestV1` branch of the approved Asset Model Schema 2020-12.
//!
//! Source schema SHA-256:
//! `dfe762b5363fd2bf12ebf41fe7e81e8eb1d7cacfa9c5af1646004dfc49c52671`.
//! The branch contains only closed objects, required/properties, const, type,
//! string pattern/length, integer min/max, and array min/max/items keywords;
//! every one is implemented below. This file is maintained with a live
//! AJV-2020 parity corpus; it is not presented as generator output.
//! Cross-field rules remain Stage 2.

use std::collections::BTreeMap;

use crate::{AssetError, AssetErrorCode, Digest};

use super::{
    MAX_CHUNKS, MAX_LOGICAL_BYTES, RawJson, RawNumber, Stage1Chunk, Stage1Manifest, asset_error,
};

const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;
const MAX_CHUNK_BYTES: u64 = 8_388_608;

pub(crate) fn validate_asset_chunk_manifest_v1(
    value: RawJson,
) -> Result<Stage1Manifest, AssetError> {
    let mut object = expect_closed_object(
        value,
        &[
            "schema",
            "mediaType",
            "contentSha256",
            "sizeBytes",
            "chunkSizeBytes",
            "chunks",
        ],
    )?;
    let schema = expect_string(take(&mut object, "schema")?)?;
    if schema != "vivi2d.assetChunkManifest.v1" {
        return Err(invalid("schema const does not match"));
    }
    let media_type = expect_string(take(&mut object, "mediaType")?)?;
    let code_points = media_type.chars().count();
    if code_points == 0 {
        return Err(invalid("mediaType is empty"));
    }
    if code_points > 255 {
        return Err(limit("mediaType exceeds the schema maxLength"));
    }

    let received_content_sha256 = expect_sha_string(take(&mut object, "contentSha256")?)?;
    let content_sha256 = Digest::from_hex(&received_content_sha256)
        .map_err(|_| invalid("contentSha256 does not match Sha256HexV1"))?;
    let size_bytes = expect_integer(take(&mut object, "sizeBytes")?)?;
    if size_bytes < 16_777_217 {
        return Err(invalid("chunk manifest sizeBytes is below 16 MiB + 1"));
    }
    if size_bytes > MAX_LOGICAL_BYTES {
        return Err(limit("chunk manifest sizeBytes exceeds 64 GiB"));
    }
    let chunk_size_bytes = expect_integer(take(&mut object, "chunkSizeBytes")?)?;
    if chunk_size_bytes != MAX_CHUNK_BYTES {
        return Err(invalid("chunkSizeBytes const does not match 8 MiB"));
    }
    let raw_chunks = match take(&mut object, "chunks")? {
        RawJson::Array(values) => values,
        _ => return Err(invalid("chunks is not an array")),
    };
    if raw_chunks.len() < 3 {
        return Err(invalid("chunks has fewer than three items"));
    }
    if raw_chunks.len() > MAX_CHUNKS {
        return Err(limit("chunks exceeds maxItems"));
    }
    let mut chunks = Vec::new();
    chunks
        .try_reserve_exact(raw_chunks.len())
        .map_err(|_| limit("chunk validator allocation failed"))?;
    for value in raw_chunks {
        chunks.push(validate_chunk(value)?);
    }

    Ok(Stage1Manifest {
        schema,
        media_type,
        received_content_sha256,
        content_sha256,
        size_bytes,
        chunk_size_bytes,
        chunks,
    })
}

fn validate_chunk(value: RawJson) -> Result<Stage1Chunk, AssetError> {
    let mut object = expect_closed_object(value, &["sha256", "sizeBytes"])?;
    let received_sha256 = expect_sha_string(take(&mut object, "sha256")?)?;
    let sha256 = Digest::from_hex(&received_sha256)
        .map_err(|_| invalid("chunk sha256 does not match Sha256HexV1"))?;
    let size_bytes = expect_integer(take(&mut object, "sizeBytes")?)?;
    if size_bytes == 0 {
        return Err(invalid("chunk sizeBytes is below one"));
    }
    if size_bytes > MAX_CHUNK_BYTES {
        return Err(limit("chunk sizeBytes exceeds 8 MiB"));
    }
    Ok(Stage1Chunk {
        received_sha256,
        sha256,
        size_bytes,
    })
}

fn expect_closed_object(
    value: RawJson,
    allowed: &[&str],
) -> Result<BTreeMap<String, RawJson>, AssetError> {
    let RawJson::Object(object) = value else {
        return Err(invalid("schema value is not an object"));
    };
    if object.keys().any(|key| !allowed.contains(&key.as_str())) {
        return Err(invalid("closed schema object has an unknown member"));
    }
    if allowed.iter().any(|key| !object.contains_key(*key)) {
        return Err(invalid("schema object is missing a required member"));
    }
    Ok(object)
}

fn take(object: &mut BTreeMap<String, RawJson>, key: &'static str) -> Result<RawJson, AssetError> {
    object
        .remove(key)
        .ok_or_else(|| invalid("required member is absent"))
}

fn expect_string(value: RawJson) -> Result<String, AssetError> {
    match value {
        RawJson::String(value) => Ok(value),
        _ => Err(invalid("schema member is not a string")),
    }
}

fn expect_sha_string(value: RawJson) -> Result<String, AssetError> {
    let value = expect_string(value)?;
    if value.len() != Digest::HEX_LENGTH || !value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(invalid("digest does not match ^[A-Fa-f0-9]{64}$"));
    }
    Ok(value)
}

fn expect_integer(value: RawJson) -> Result<u64, AssetError> {
    let integer = match value {
        RawJson::Number(RawNumber::Unsigned(value)) => value,
        RawJson::Number(RawNumber::Signed(value)) => {
            u64::try_from(value).map_err(|_| invalid("integer is negative"))?
        }
        RawJson::Number(RawNumber::Float(value))
            if value.is_finite() && value >= 0.0 && value.fract() == 0.0 =>
        {
            if value > MAX_SAFE_INTEGER as f64 {
                return Err(limit("integer exceeds the JSON safe-integer ceiling"));
            }
            value as u64
        }
        _ => return Err(invalid("schema member is not an integer")),
    };
    if integer > MAX_SAFE_INTEGER {
        return Err(limit("integer exceeds the JSON safe-integer ceiling"));
    }
    Ok(integer)
}

fn invalid(detail: &'static str) -> AssetError {
    asset_error(AssetErrorCode::ManifestInvalid, detail)
}

fn limit(detail: &'static str) -> AssetError {
    asset_error(AssetErrorCode::LimitExceeded, detail)
}

// Keep all raw variants intentional: the equivalent schema validator must reject
// rather than erase JSON values of the wrong type.
#[allow(dead_code)]
fn raw_variant_evidence(value: &RawJson) -> bool {
    match value {
        RawJson::Null => false,
        RawJson::Bool(value) => *value,
        RawJson::Number(_) | RawJson::String(_) | RawJson::Array(_) | RawJson::Object(_) => true,
    }
}
