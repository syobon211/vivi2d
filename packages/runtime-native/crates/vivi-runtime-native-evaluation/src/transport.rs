use serde_json::{Map, Number, Value};

use crate::EvaluationPayloadError;

pub(crate) const MAX_INPUT_BYTES: usize = 67_108_864;
pub(crate) const MAX_CONTAINER_DEPTH: usize = 64;
pub(crate) const MAX_TOKENS: usize = 8_000_000;
pub(crate) const MAX_STRING_BYTES: usize = 67_108_864;

#[derive(Clone, Copy)]
pub(crate) struct TransportLimits {
    pub(crate) input_bytes: usize,
    pub(crate) container_depth: usize,
    pub(crate) tokens: usize,
    pub(crate) string_bytes: usize,
}

impl TransportLimits {
    pub(crate) const PRODUCTION: Self = Self {
        input_bytes: MAX_INPUT_BYTES,
        container_depth: MAX_CONTAINER_DEPTH,
        tokens: MAX_TOKENS,
        string_bytes: MAX_STRING_BYTES,
    };
}

pub(crate) fn parse(raw: &[u8]) -> Result<Value, EvaluationPayloadError> {
    parse_with_limits(raw, TransportLimits::PRODUCTION)
}

pub(crate) fn parse_with_limits(
    raw: &[u8],
    limits: TransportLimits,
) -> Result<Value, EvaluationPayloadError> {
    if raw.len() > limits.input_bytes {
        return Err(EvaluationPayloadError::limit());
    }
    let text = std::str::from_utf8(raw).map_err(|_| EvaluationPayloadError::payload())?;
    if text.starts_with('\u{feff}') {
        return Err(EvaluationPayloadError::payload());
    }
    Parser {
        text,
        offset: 0,
        token_count: 0,
        limits,
    }
    .parse()
}

struct Parser<'a> {
    text: &'a str,
    offset: usize,
    token_count: usize,
    limits: TransportLimits,
}

impl Parser<'_> {
    fn parse(mut self) -> Result<Value, EvaluationPayloadError> {
        self.skip_whitespace();
        if self.offset == self.text.len() {
            return Err(EvaluationPayloadError::payload());
        }
        let value = self.parse_value(0)?;
        self.skip_whitespace();
        if self.offset != self.text.len() {
            return Err(EvaluationPayloadError::payload());
        }
        Ok(value)
    }

    fn parse_value(&mut self, container_depth: usize) -> Result<Value, EvaluationPayloadError> {
        match self.peek_byte() {
            Some(b'"') => self.parse_string().map(Value::String),
            Some(b'{') => self.parse_object(
                container_depth
                    .checked_add(1)
                    .ok_or_else(EvaluationPayloadError::limit)?,
            ),
            Some(b'[') => self.parse_array(
                container_depth
                    .checked_add(1)
                    .ok_or_else(EvaluationPayloadError::limit)?,
            ),
            Some(b't') => self.parse_keyword(b"true", Value::Bool(true)),
            Some(b'f') => self.parse_keyword(b"false", Value::Bool(false)),
            Some(b'n') => self.parse_keyword(b"null", Value::Null),
            Some(b'-' | b'0'..=b'9') => self.parse_number(),
            _ => Err(EvaluationPayloadError::payload()),
        }
    }

    fn parse_object(&mut self, depth: usize) -> Result<Value, EvaluationPayloadError> {
        self.assert_depth(depth)?;
        self.consume_punctuation(b'{')?;
        self.skip_whitespace();
        let mut object = Map::new();
        if self.peek_byte() == Some(b'}') {
            self.consume_punctuation(b'}')?;
            return Ok(Value::Object(object));
        }

        loop {
            if self.peek_byte() != Some(b'"') {
                return Err(EvaluationPayloadError::payload());
            }
            let key = self.parse_string()?;
            if object.contains_key(&key) {
                return Err(EvaluationPayloadError::payload());
            }
            self.skip_whitespace();
            self.consume_punctuation(b':')?;
            self.skip_whitespace();
            let value = self.parse_value(depth)?;
            object.insert(key, value);
            self.skip_whitespace();
            if self.peek_byte() == Some(b'}') {
                self.consume_punctuation(b'}')?;
                return Ok(Value::Object(object));
            }
            self.consume_punctuation(b',')?;
            self.skip_whitespace();
        }
    }

    fn parse_array(&mut self, depth: usize) -> Result<Value, EvaluationPayloadError> {
        self.assert_depth(depth)?;
        self.consume_punctuation(b'[')?;
        self.skip_whitespace();
        let mut values = Vec::new();
        if self.peek_byte() == Some(b']') {
            self.consume_punctuation(b']')?;
            return Ok(Value::Array(values));
        }

        loop {
            let value = self.parse_value(depth)?;
            values
                .try_reserve(1)
                .map_err(|_| EvaluationPayloadError::limit())?;
            values.push(value);
            self.skip_whitespace();
            if self.peek_byte() == Some(b']') {
                self.consume_punctuation(b']')?;
                return Ok(Value::Array(values));
            }
            self.consume_punctuation(b',')?;
            self.skip_whitespace();
        }
    }

    fn parse_string(&mut self) -> Result<String, EvaluationPayloadError> {
        self.bump_token()?;
        if self.peek_byte() != Some(b'"') {
            return Err(EvaluationPayloadError::payload());
        }
        self.offset += 1;
        let mut output = String::new();
        let mut decoded_bytes = 0_usize;
        let mut raw_start = self.offset;

        while let Some(byte) = self.peek_byte() {
            match byte {
                b'"' => {
                    self.push_raw_string_piece(
                        &mut output,
                        raw_start,
                        self.offset,
                        &mut decoded_bytes,
                    )?;
                    self.offset += 1;
                    return Ok(output);
                }
                0x00..=0x1f => return Err(EvaluationPayloadError::payload()),
                b'\\' => {
                    self.push_raw_string_piece(
                        &mut output,
                        raw_start,
                        self.offset,
                        &mut decoded_bytes,
                    )?;
                    self.offset += 1;
                    let escape = self
                        .peek_byte()
                        .ok_or_else(EvaluationPayloadError::payload)?;
                    self.offset += 1;
                    match escape {
                        b'"' => self.push_char(&mut output, '"', &mut decoded_bytes)?,
                        b'/' => self.push_char(&mut output, '/', &mut decoded_bytes)?,
                        b'\\' => self.push_char(&mut output, '\\', &mut decoded_bytes)?,
                        b'b' => self.push_char(&mut output, '\u{08}', &mut decoded_bytes)?,
                        b'f' => self.push_char(&mut output, '\u{0c}', &mut decoded_bytes)?,
                        b'n' => self.push_char(&mut output, '\n', &mut decoded_bytes)?,
                        b'r' => self.push_char(&mut output, '\r', &mut decoded_bytes)?,
                        b't' => self.push_char(&mut output, '\t', &mut decoded_bytes)?,
                        b'u' => {
                            let high = self.parse_hex_code_unit()?;
                            let scalar = if (0xd800..=0xdbff).contains(&high) {
                                if self.remaining_bytes().get(..2) != Some(b"\\u") {
                                    return Err(EvaluationPayloadError::payload());
                                }
                                self.offset += 2;
                                let low = self.parse_hex_code_unit()?;
                                if !(0xdc00..=0xdfff).contains(&low) {
                                    return Err(EvaluationPayloadError::payload());
                                }
                                0x1_0000 + (((high - 0xd800) as u32) << 10) + (low - 0xdc00) as u32
                            } else {
                                if (0xdc00..=0xdfff).contains(&high) {
                                    return Err(EvaluationPayloadError::payload());
                                }
                                high as u32
                            };
                            let character = char::from_u32(scalar)
                                .ok_or_else(EvaluationPayloadError::payload)?;
                            self.push_char(&mut output, character, &mut decoded_bytes)?;
                        }
                        _ => return Err(EvaluationPayloadError::payload()),
                    }
                    raw_start = self.offset;
                }
                _ => self.offset += 1,
            }
        }
        Err(EvaluationPayloadError::payload())
    }

    fn push_raw_string_piece(
        &self,
        output: &mut String,
        start: usize,
        end: usize,
        decoded_bytes: &mut usize,
    ) -> Result<(), EvaluationPayloadError> {
        let piece = self
            .text
            .get(start..end)
            .ok_or_else(EvaluationPayloadError::payload)?;
        self.account_string_bytes(decoded_bytes, piece.len())?;
        output
            .try_reserve(piece.len())
            .map_err(|_| EvaluationPayloadError::limit())?;
        output.push_str(piece);
        Ok(())
    }

    fn push_char(
        &self,
        output: &mut String,
        character: char,
        decoded_bytes: &mut usize,
    ) -> Result<(), EvaluationPayloadError> {
        let bytes = character.len_utf8();
        self.account_string_bytes(decoded_bytes, bytes)?;
        output
            .try_reserve(bytes)
            .map_err(|_| EvaluationPayloadError::limit())?;
        output.push(character);
        Ok(())
    }

    fn account_string_bytes(
        &self,
        decoded_bytes: &mut usize,
        additional: usize,
    ) -> Result<(), EvaluationPayloadError> {
        *decoded_bytes = decoded_bytes
            .checked_add(additional)
            .ok_or_else(EvaluationPayloadError::limit)?;
        if *decoded_bytes > self.limits.string_bytes {
            return Err(EvaluationPayloadError::limit());
        }
        Ok(())
    }

    fn parse_hex_code_unit(&mut self) -> Result<u16, EvaluationPayloadError> {
        let bytes = self
            .remaining_bytes()
            .get(..4)
            .ok_or_else(EvaluationPayloadError::payload)?;
        let mut result = 0_u16;
        for byte in bytes {
            let digit = match byte {
                b'0'..=b'9' => byte - b'0',
                b'a'..=b'f' => byte - b'a' + 10,
                b'A'..=b'F' => byte - b'A' + 10,
                _ => return Err(EvaluationPayloadError::payload()),
            };
            result = result * 16 + u16::from(digit);
        }
        self.offset += 4;
        Ok(result)
    }

    fn parse_number(&mut self) -> Result<Value, EvaluationPayloadError> {
        self.bump_token()?;
        let start = self.offset;
        if self.peek_byte() == Some(b'-') {
            self.offset += 1;
        }
        if self.peek_byte() == Some(b'0') {
            self.offset += 1;
        } else {
            match self.peek_byte() {
                Some(b'1'..=b'9') => self.offset += 1,
                _ => return Err(EvaluationPayloadError::payload()),
            }
            while matches!(self.peek_byte(), Some(b'0'..=b'9')) {
                self.offset += 1;
            }
        }
        if self.peek_byte() == Some(b'.') {
            self.offset += 1;
            if !matches!(self.peek_byte(), Some(b'0'..=b'9')) {
                return Err(EvaluationPayloadError::payload());
            }
            while matches!(self.peek_byte(), Some(b'0'..=b'9')) {
                self.offset += 1;
            }
        }
        if matches!(self.peek_byte(), Some(b'e' | b'E')) {
            self.offset += 1;
            if matches!(self.peek_byte(), Some(b'+' | b'-')) {
                self.offset += 1;
            }
            if !matches!(self.peek_byte(), Some(b'0'..=b'9')) {
                return Err(EvaluationPayloadError::payload());
            }
            while matches!(self.peek_byte(), Some(b'0'..=b'9')) {
                self.offset += 1;
            }
        }
        let spelling = self
            .text
            .get(start..self.offset)
            .ok_or_else(EvaluationPayloadError::payload)?;
        let mut number = spelling
            .parse::<f64>()
            .map_err(|_| EvaluationPayloadError::payload())?;
        if !number.is_finite() {
            return Err(EvaluationPayloadError::payload());
        }
        if number == 0.0 {
            number = 0.0;
        }
        Number::from_f64(number)
            .map(Value::Number)
            .ok_or_else(EvaluationPayloadError::payload)
    }

    fn parse_keyword(
        &mut self,
        spelling: &[u8],
        value: Value,
    ) -> Result<Value, EvaluationPayloadError> {
        self.bump_token()?;
        if !self.remaining_bytes().starts_with(spelling) {
            return Err(EvaluationPayloadError::payload());
        }
        self.offset += spelling.len();
        Ok(value)
    }

    fn consume_punctuation(&mut self, expected: u8) -> Result<(), EvaluationPayloadError> {
        if self.peek_byte() != Some(expected) {
            return Err(EvaluationPayloadError::payload());
        }
        self.bump_token()?;
        self.offset += 1;
        Ok(())
    }

    fn bump_token(&mut self) -> Result<(), EvaluationPayloadError> {
        self.token_count = self
            .token_count
            .checked_add(1)
            .ok_or_else(EvaluationPayloadError::limit)?;
        if self.token_count > self.limits.tokens {
            return Err(EvaluationPayloadError::limit());
        }
        Ok(())
    }

    fn assert_depth(&self, depth: usize) -> Result<(), EvaluationPayloadError> {
        if depth > self.limits.container_depth {
            return Err(EvaluationPayloadError::limit());
        }
        Ok(())
    }

    fn skip_whitespace(&mut self) {
        while matches!(self.peek_byte(), Some(b' ' | b'\t' | b'\n' | b'\r')) {
            self.offset += 1;
        }
    }

    fn peek_byte(&self) -> Option<u8> {
        self.text.as_bytes().get(self.offset).copied()
    }

    fn remaining_bytes(&self) -> &[u8] {
        &self.text.as_bytes()[self.offset..]
    }
}
