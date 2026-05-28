use std::collections::HashSet;
use std::str;

use serde_json::Value;

use crate::errors::RuntimeError;
use crate::limits::RuntimeLimits;
use crate::status;

const PUBLIC_PROJECT_PROFILE: &str = "publicProfileV1";
const RUNTIME_PROJECT_FILE_VERSION: i64 = 10;

const FORBIDDEN_RAW_KEYS: &[&str] = &[
    "blendShapes",
    "correctiveDeformations",
    "meshLinks",
    "blendShapeWeights",
    "blendShapeTracks",
    "meshPoseTracks",
    "targetBlendShapeId",
];

const FORBIDDEN_KIND_OR_TYPE: &[&str] = &[
    "blendShape",
    "latticeDeformer",
    "morphTarget",
    "correctiveDeformation",
    "meshPose",
    "meshLink",
];

/// Allocation-light preflight summary.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PreflightSummary {
    /// Number of payload bytes inspected.
    pub byte_len: u64,
    /// Maximum JSON nesting depth observed.
    pub max_depth: usize,
}

/// Decoded native runtime payload.
#[derive(Clone, Debug, PartialEq)]
pub struct RuntimePayload {
    /// Strictly decoded JSON value.
    pub value: Value,
}

/// Run strict JSON transport checks without hydrating the payload tree.
pub fn preflight_runtime_payload(
    bytes: &[u8],
    limits: RuntimeLimits,
) -> Result<PreflightSummary, RuntimeError> {
    let limits = limits.hardened();
    if bytes.len() as u64 > limits.max_payload_bytes {
        return Err(RuntimeError::new(
            status::LIMIT_EXCEEDED,
            "runtime payload exceeds max_payload_bytes",
        ));
    }
    if bytes.starts_with(&[0xef, 0xbb, 0xbf]) {
        return Err(RuntimeError::new(
            status::PARSE,
            "runtime payload must not start with a UTF-8 BOM",
        ));
    }
    let text = str::from_utf8(bytes)
        .map_err(|_| RuntimeError::new(status::PARSE, "runtime payload must be valid UTF-8"))?;
    let mut scanner = JsonScanner::new(text, limits);
    scanner.scan()?;
    Ok(PreflightSummary {
        byte_len: bytes.len() as u64,
        max_depth: scanner.max_depth,
    })
}

/// Parse and validate a Runtime Spec v1 JSON payload.
pub fn parse_runtime_payload(
    bytes: &[u8],
    limits: RuntimeLimits,
) -> Result<RuntimePayload, RuntimeError> {
    let limits = limits.hardened();
    preflight_runtime_payload(bytes, limits)?;
    let value = serde_json::from_slice::<Value>(bytes)
        .map_err(|_| RuntimeError::new(status::PARSE, "failed to parse runtime payload JSON"))?;
    validate_runtime_payload(&value, limits)?;
    Ok(RuntimePayload { value })
}

fn validate_runtime_payload(value: &Value, limits: RuntimeLimits) -> Result<(), RuntimeError> {
    // Defense-in-depth: the streaming scanner catches decoded forbidden markers
    // before hydration, and this pass proves the hydrated tree still matches
    // the same public-profile policy.
    scan_decoded_public_profile(value, 0, limits.max_json_depth)?;
    let object = value.as_object().ok_or_else(|| {
        RuntimeError::new(status::VALIDATION, "runtime payload must be an object")
    })?;

    let profile = object
        .get("profile")
        .ok_or_else(|| RuntimeError::new(status::VALIDATION, "runtime profile is required"))?
        .as_str()
        .ok_or_else(|| RuntimeError::new(status::VALIDATION, "runtime profile must be a string"))?;
    match profile {
        PUBLIC_PROJECT_PROFILE => {}
        profile if profile.starts_with("publicProfile") => {
            return Err(RuntimeError::new(
                status::UNSUPPORTED_SPEC_VERSION,
                "unsupported runtime public profile",
            ));
        }
        _profile => {
            return Err(RuntimeError::new(
                status::PRIVATE_PROFILE,
                "runtime payload must use the public profile",
            ));
        }
    }

    let version = object
        .get("version")
        .ok_or_else(|| RuntimeError::new(status::VALIDATION, "runtime version is required"))?
        .as_i64()
        .ok_or_else(|| RuntimeError::new(status::VALIDATION, "runtime version must be an int64"))?;
    if version != RUNTIME_PROJECT_FILE_VERSION {
        return Err(RuntimeError::new(
            status::UNSUPPORTED_SPEC_VERSION,
            "unsupported runtime project version",
        ));
    }
    if !object.get("project").is_some_and(Value::is_object) {
        return Err(RuntimeError::new(
            status::VALIDATION,
            "runtime payload must include a project object",
        ));
    }
    if !object.get("atlases").is_some_and(Value::is_array) {
        return Err(RuntimeError::new(
            status::VALIDATION,
            "runtime payload must include an atlases array",
        ));
    }
    Ok(())
}

fn scan_decoded_public_profile(
    value: &Value,
    depth: usize,
    max_depth: usize,
) -> Result<(), RuntimeError> {
    if depth > max_depth {
        return Err(parse_error("runtime payload exceeds maximum JSON depth"));
    }
    match value {
        Value::Array(items) => {
            for item in items {
                scan_decoded_public_profile(item, depth + 1, max_depth)?;
            }
        }
        Value::Object(object) => {
            for (key, child) in object {
                if is_forbidden_raw_key(key) {
                    return Err(private_profile_error());
                }
                if (key == "kind" || key == "type")
                    && child.as_str().is_some_and(is_forbidden_kind_or_type)
                {
                    return Err(private_profile_error());
                }
                scan_decoded_public_profile(child, depth + 1, max_depth)?;
            }
        }
        _ => {}
    }
    Ok(())
}

fn private_profile_error() -> RuntimeError {
    RuntimeError::new(
        status::PRIVATE_PROFILE,
        "runtime payload contains a forbidden public-profile marker",
    )
}

fn is_forbidden_raw_key(value: &str) -> bool {
    FORBIDDEN_RAW_KEYS.contains(&value)
}

fn is_forbidden_kind_or_type(value: &str) -> bool {
    FORBIDDEN_KIND_OR_TYPE.contains(&value)
}

struct JsonScanner<'a> {
    text: &'a str,
    bytes: &'a [u8],
    pos: usize,
    limits: RuntimeLimits,
    max_depth: usize,
}

impl<'a> JsonScanner<'a> {
    fn new(text: &'a str, limits: RuntimeLimits) -> Self {
        Self {
            text,
            bytes: text.as_bytes(),
            pos: 0,
            limits,
            max_depth: 0,
        }
    }

    fn scan(&mut self) -> Result<(), RuntimeError> {
        self.skip_ws();
        if self.is_eof() {
            return Err(parse_error("runtime payload must not be empty"));
        }
        self.parse_value(0, false)?;
        self.skip_ws();
        if !self.is_eof() {
            return Err(parse_error("runtime payload has trailing JSON content"));
        }
        Ok(())
    }

    fn parse_value(
        &mut self,
        depth: usize,
        expects_kind_or_type: bool,
    ) -> Result<Option<String>, RuntimeError> {
        self.max_depth = self.max_depth.max(depth);
        if depth > self.limits.max_json_depth {
            return Err(parse_error("runtime payload exceeds maximum JSON depth"));
        }
        self.skip_ws();
        match self.peek() {
            Some(b'{') => {
                self.parse_object(depth + 1)?;
                Ok(None)
            }
            Some(b'[') => {
                self.parse_array(depth + 1)?;
                Ok(None)
            }
            Some(b'"') => {
                let value = self.parse_string()?;
                if expects_kind_or_type && is_forbidden_kind_or_type(&value) {
                    return Err(private_profile_error());
                }
                Ok(Some(value))
            }
            Some(b't') => {
                self.expect_literal(b"true")?;
                Ok(None)
            }
            Some(b'f') => {
                self.expect_literal(b"false")?;
                Ok(None)
            }
            Some(b'n') => {
                self.expect_literal(b"null")?;
                Ok(None)
            }
            Some(b'-' | b'0'..=b'9') => {
                self.parse_number()?;
                Ok(None)
            }
            _ => Err(parse_error("runtime payload contains invalid JSON token")),
        }
    }

    fn parse_object(&mut self, depth: usize) -> Result<(), RuntimeError> {
        self.expect_byte(b'{')?;
        self.skip_ws();
        if self.consume_if(b'}') {
            return Ok(());
        }

        let mut keys = HashSet::new();
        loop {
            self.skip_ws();
            if self.peek() != Some(b'"') {
                return Err(parse_error("runtime object key must be a string"));
            }
            let key = self.parse_string()?;
            if keys.contains(&key) {
                return Err(parse_error("runtime object contains a duplicate key"));
            }
            if is_forbidden_raw_key(&key) {
                return Err(private_profile_error());
            }
            let expects_kind_or_type = key == "kind" || key == "type";
            keys.insert(key);
            self.skip_ws();
            self.expect_byte(b':')?;
            self.parse_value(depth, expects_kind_or_type)?;
            self.skip_ws();
            if self.consume_if(b'}') {
                return Ok(());
            }
            self.expect_byte(b',')?;
        }
    }

    fn parse_array(&mut self, depth: usize) -> Result<(), RuntimeError> {
        self.expect_byte(b'[')?;
        self.skip_ws();
        if self.consume_if(b']') {
            return Ok(());
        }
        loop {
            self.parse_value(depth, false)?;
            self.skip_ws();
            if self.consume_if(b']') {
                return Ok(());
            }
            self.expect_byte(b',')?;
        }
    }

    fn parse_string(&mut self) -> Result<String, RuntimeError> {
        self.expect_byte(b'"')?;
        let mut output = String::new();
        while let Some(byte) = self.peek() {
            match byte {
                b'"' => {
                    self.pos += 1;
                    return Ok(output);
                }
                b'\\' => {
                    self.pos += 1;
                    let escaped = self
                        .next_byte()
                        .ok_or_else(|| parse_error("unterminated JSON escape"))?;
                    match escaped {
                        b'"' => self.push_string_char(&mut output, '"')?,
                        b'\\' => self.push_string_char(&mut output, '\\')?,
                        b'/' => self.push_string_char(&mut output, '/')?,
                        b'b' => self.push_string_char(&mut output, '\u{0008}')?,
                        b'f' => self.push_string_char(&mut output, '\u{000c}')?,
                        b'n' => self.push_string_char(&mut output, '\n')?,
                        b'r' => self.push_string_char(&mut output, '\r')?,
                        b't' => self.push_string_char(&mut output, '\t')?,
                        b'u' => {
                            let code = self.parse_hex4()?;
                            if (0xd800..=0xdbff).contains(&code) {
                                self.expect_byte(b'\\')?;
                                self.expect_byte(b'u')?;
                                let low = self.parse_hex4()?;
                                if !(0xdc00..=0xdfff).contains(&low) {
                                    return Err(parse_error("invalid JSON surrogate pair"));
                                }
                                let scalar = 0x10000
                                    + (((code - 0xd800) as u32) << 10)
                                    + (low - 0xdc00) as u32;
                                let Some(character) = char::from_u32(scalar) else {
                                    return Err(parse_error("invalid JSON unicode scalar"));
                                };
                                self.push_string_char(&mut output, character)?;
                            } else if (0xdc00..=0xdfff).contains(&code) {
                                return Err(parse_error("invalid JSON surrogate pair"));
                            } else {
                                let Some(character) = char::from_u32(code as u32) else {
                                    return Err(parse_error("invalid JSON unicode scalar"));
                                };
                                self.push_string_char(&mut output, character)?;
                            }
                        }
                        _ => return Err(parse_error("invalid JSON escape")),
                    }
                }
                0x00..=0x1f => return Err(parse_error("JSON string contains a control character")),
                _ => {
                    let next = self.text[self.pos..]
                        .chars()
                        .next()
                        .ok_or_else(|| parse_error("unterminated JSON string"))?;
                    self.push_string_char(&mut output, next)?;
                    self.pos += next.len_utf8();
                }
            }
        }
        Err(parse_error("unterminated JSON string"))
    }

    fn push_string_char(&self, output: &mut String, character: char) -> Result<(), RuntimeError> {
        if output.len().saturating_add(character.len_utf8()) > self.limits.max_json_string_bytes {
            return Err(parse_error(
                "runtime JSON string token exceeds maximum size",
            ));
        }
        output.push(character);
        Ok(())
    }

    fn parse_hex4(&mut self) -> Result<u16, RuntimeError> {
        let mut value = 0u16;
        for _ in 0..4 {
            let byte = self
                .next_byte()
                .ok_or_else(|| parse_error("short JSON unicode escape"))?;
            let digit = match byte {
                b'0'..=b'9' => byte - b'0',
                b'a'..=b'f' => byte - b'a' + 10,
                b'A'..=b'F' => byte - b'A' + 10,
                _ => return Err(parse_error("invalid JSON unicode escape")),
            };
            value = (value << 4) | digit as u16;
        }
        Ok(value)
    }

    fn parse_number(&mut self) -> Result<(), RuntimeError> {
        self.consume_if(b'-');
        match self.peek() {
            Some(b'0') => {
                self.pos += 1;
            }
            Some(b'1'..=b'9') => {
                self.pos += 1;
                while matches!(self.peek(), Some(b'0'..=b'9')) {
                    self.pos += 1;
                }
            }
            _ => return Err(parse_error("invalid JSON number")),
        }
        if self.consume_if(b'.') {
            if !matches!(self.peek(), Some(b'0'..=b'9')) {
                return Err(parse_error("invalid JSON number fraction"));
            }
            while matches!(self.peek(), Some(b'0'..=b'9')) {
                self.pos += 1;
            }
        }
        if matches!(self.peek(), Some(b'e' | b'E')) {
            self.pos += 1;
            if !self.consume_if(b'+') {
                self.consume_if(b'-');
            }
            if !matches!(self.peek(), Some(b'0'..=b'9')) {
                return Err(parse_error("invalid JSON number exponent"));
            }
            while matches!(self.peek(), Some(b'0'..=b'9')) {
                self.pos += 1;
            }
        }
        Ok(())
    }

    fn expect_literal(&mut self, literal: &[u8]) -> Result<(), RuntimeError> {
        if self.bytes.get(self.pos..self.pos + literal.len()) == Some(literal) {
            self.pos += literal.len();
            Ok(())
        } else {
            Err(parse_error("invalid JSON literal"))
        }
    }

    fn expect_byte(&mut self, expected: u8) -> Result<(), RuntimeError> {
        if self.consume_if(expected) {
            Ok(())
        } else {
            Err(parse_error("runtime payload contains malformed JSON"))
        }
    }

    fn consume_if(&mut self, byte: u8) -> bool {
        if self.peek() == Some(byte) {
            self.pos += 1;
            true
        } else {
            false
        }
    }

    fn skip_ws(&mut self) {
        while matches!(self.peek(), Some(b' ' | b'\n' | b'\r' | b'\t')) {
            self.pos += 1;
        }
    }

    fn next_byte(&mut self) -> Option<u8> {
        let byte = self.peek()?;
        self.pos += 1;
        Some(byte)
    }

    fn peek(&self) -> Option<u8> {
        self.bytes.get(self.pos).copied()
    }

    fn is_eof(&self) -> bool {
        self.pos >= self.bytes.len()
    }
}

fn parse_error(message: &str) -> RuntimeError {
    RuntimeError::new(status::PARSE, message)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_payload() -> &'static [u8] {
        br#"{"profile":"publicProfileV1","version":10,"project":{},"atlases":[]}"#
    }

    #[test]
    fn parses_minimal_public_payload() {
        let payload = parse_runtime_payload(valid_payload(), RuntimeLimits::default()).unwrap();
        assert!(payload.value.is_object());
    }

    #[test]
    fn rejects_duplicate_keys_before_hydration() {
        let error = parse_runtime_payload(
            br#"{"profile":"publicProfileV1","profile":"publicProfileV1","version":10,"project":{},"atlases":[]}"#,
            RuntimeLimits::default(),
        )
        .unwrap_err();
        assert_eq!(error.status(), status::PARSE);
    }

    #[test]
    fn rejects_escaped_forbidden_raw_keys_before_hydration() {
        let error = parse_runtime_payload(
            br#"{"profile":"publicProfileV1","version":10,"project":{"blend\u0053hapes":[]},"atlases":[]}"#,
            RuntimeLimits::default(),
        )
        .unwrap_err();
        assert_eq!(error.status(), status::PRIVATE_PROFILE);
    }

    #[test]
    fn rejects_private_marker_before_allocation_heavy_hydration() {
        let mut payload =
            br#"{"profile":"publicProfileV1","version":10,"project":{"blendShapes":[]},"huge":""#
                .to_vec();
        payload.extend(std::iter::repeat_n(b'x', 2 * 1024 * 1024));

        let error = parse_runtime_payload(&payload, RuntimeLimits::default()).unwrap_err();
        assert_eq!(error.status(), status::PRIVATE_PROFILE);
    }

    #[test]
    fn rejects_escaped_forbidden_kind_values_before_hydration() {
        let error = parse_runtime_payload(
            br#"{"profile":"publicProfileV1","version":10,"project":{"layers":[{"kind":"mesh\u0050ose"}]},"atlases":[]}"#,
            RuntimeLimits::default(),
        )
        .unwrap_err();
        assert_eq!(error.status(), status::PRIVATE_PROFILE);
    }

    #[test]
    fn allows_managed_provenance_metadata() {
        parse_runtime_payload(
            br#"{"profile":"publicProfileV1","version":10,"project":{"managedTag":"x","managedSignature":"y","managedSourceFingerprint":"z"},"atlases":[]}"#,
            RuntimeLimits::default(),
        )
        .unwrap();
    }

    #[test]
    fn rejects_transport_extensions() {
        for payload in [
            br#"{"profile":"publicProfileV1",/*x*/"version":10,"project":{},"atlases":[]}"#
                .as_slice(),
            br#"{"profile":"publicProfileV1","version":10,"project":{},"atlases":[],"x":NaN}"#,
            br#"{"profile":"publicProfileV1","version":10,"project":{},"atlases":[],"x":Infinity}"#,
            br#"{"profile":"publicProfileV1","version":10,"project":{},"atlases":[],"x":1,}"#,
        ] {
            let error = parse_runtime_payload(payload, RuntimeLimits::default()).unwrap_err();
            assert_eq!(error.status(), status::PARSE);
        }
    }

    #[test]
    fn rejects_invalid_utf8_and_bom() {
        let invalid_utf8 = parse_runtime_payload(&[0xff], RuntimeLimits::default()).unwrap_err();
        assert_eq!(invalid_utf8.status(), status::PARSE);

        let bom = parse_runtime_payload(
            b"\xef\xbb\xbf{\"profile\":\"publicProfileV1\"}",
            RuntimeLimits::default(),
        )
        .unwrap_err();
        assert_eq!(bom.status(), status::PARSE);
    }

    #[test]
    fn enforces_payload_depth_and_string_limits() {
        let depth_error = parse_runtime_payload(
            br#"{"profile":"publicProfileV1","version":10,"project":{"a":[[[]]]},"atlases":[]}"#,
            RuntimeLimits {
                max_json_depth: 3,
                ..RuntimeLimits::default()
            },
        )
        .unwrap_err();
        assert_eq!(depth_error.status(), status::PARSE);

        let string_error = parse_runtime_payload(
            br#"{"profile":"publicProfileV1","version":10,"project":{"name":"abcd"},"atlases":[]}"#,
            RuntimeLimits {
                max_json_string_bytes: 3,
                ..RuntimeLimits::default()
            },
        )
        .unwrap_err();
        assert_eq!(string_error.status(), status::PARSE);
    }

    #[test]
    fn hardens_caller_limits_to_runtime_spec_ceilings() {
        let mut deep = String::from(r#"{"profile":"publicProfileV1","version":10,"project":{"a":"#);
        for _ in 0..130 {
            deep.push('[');
        }
        deep.push_str("null");
        for _ in 0..130 {
            deep.push(']');
        }
        deep.push_str(r#"},"atlases":[]}"#);

        let error = parse_runtime_payload(
            deep.as_bytes(),
            RuntimeLimits {
                max_json_depth: 512,
                ..RuntimeLimits::default()
            },
        )
        .unwrap_err();
        assert_eq!(error.status(), status::PARSE);
    }

    #[test]
    fn enforces_payload_byte_limit() {
        let error = parse_runtime_payload(
            valid_payload(),
            RuntimeLimits {
                max_payload_bytes: 8,
                ..RuntimeLimits::default()
            },
        )
        .unwrap_err();
        assert_eq!(error.status(), status::LIMIT_EXCEEDED);
    }

    #[test]
    fn maps_profile_and_version_to_canonical_statuses() {
        let private = parse_runtime_payload(
            br#"{"profile":"privateAuthoringProfile","version":10,"project":{},"atlases":[]}"#,
            RuntimeLimits::default(),
        )
        .unwrap_err();
        assert_eq!(private.status(), status::PRIVATE_PROFILE);

        let unsupported_profile = parse_runtime_payload(
            br#"{"profile":"publicProfileV2","version":10,"project":{},"atlases":[]}"#,
            RuntimeLimits::default(),
        )
        .unwrap_err();
        assert_eq!(
            unsupported_profile.status(),
            status::UNSUPPORTED_SPEC_VERSION
        );

        let unsupported_version = parse_runtime_payload(
            br#"{"profile":"publicProfileV1","version":99,"project":{},"atlases":[]}"#,
            RuntimeLimits::default(),
        )
        .unwrap_err();
        assert_eq!(
            unsupported_version.status(),
            status::UNSUPPORTED_SPEC_VERSION
        );

        for malformed in [
            br#"{"version":10,"project":{},"atlases":[]}"#.as_slice(),
            br#"{"profile":42,"version":10,"project":{},"atlases":[]}"#,
            br#"{"profile":"publicProfileV1","project":{},"atlases":[]}"#,
            br#"{"profile":"publicProfileV1","version":"10","project":{},"atlases":[]}"#,
        ] {
            let error = parse_runtime_payload(malformed, RuntimeLimits::default()).unwrap_err();
            assert_eq!(error.status(), status::VALIDATION);
        }
    }

    #[test]
    fn deterministic_parser_fuzz_smoke_does_not_panic() {
        let mut state = 0x7654_3210_u64;
        for _ in 0..1000 {
            state = state.wrapping_mul(6364136223846793005).wrapping_add(1);
            let len = (state as usize % 512) + 1;
            let mut bytes = Vec::with_capacity(len);
            for index in 0..len {
                state = state
                    .wrapping_mul(2862933555777941757)
                    .wrapping_add(3037000493);
                bytes.push((state >> ((index % 8) * 8)) as u8);
            }
            let _ = preflight_runtime_payload(
                &bytes,
                RuntimeLimits {
                    max_payload_bytes: 1024,
                    ..RuntimeLimits::default()
                },
            );
        }
    }
}
