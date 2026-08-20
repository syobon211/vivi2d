use std::fmt;

/// A normalized SHA-256 value. Wire hex casing never survives this boundary.
#[derive(Clone, Copy, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct Digest([u8; Self::LENGTH]);

impl Digest {
    pub const LENGTH: usize = 32;
    pub const HEX_LENGTH: usize = 64;

    #[must_use]
    pub const fn from_bytes(bytes: [u8; Self::LENGTH]) -> Self {
        Self(bytes)
    }

    #[must_use]
    pub const fn as_bytes(&self) -> &[u8; Self::LENGTH] {
        &self.0
    }

    pub fn from_hex(value: &str) -> Result<Self, DigestParseError> {
        if value.len() != Self::HEX_LENGTH {
            return Err(DigestParseError);
        }
        let input = value.as_bytes();
        let mut bytes = [0_u8; Self::LENGTH];
        for (index, output) in bytes.iter_mut().enumerate() {
            let high = decode_nibble(input[index * 2]).ok_or(DigestParseError)?;
            let low = decode_nibble(input[index * 2 + 1]).ok_or(DigestParseError)?;
            *output = (high << 4) | low;
        }
        Ok(Self(bytes))
    }

    #[must_use]
    pub fn to_lower_hex(self) -> String {
        const HEX: &[u8; 16] = b"0123456789abcdef";
        let mut output = String::with_capacity(Self::HEX_LENGTH);
        for byte in self.0 {
            output.push(char::from(HEX[usize::from(byte >> 4)]));
            output.push(char::from(HEX[usize::from(byte & 0x0f)]));
        }
        output
    }
}

fn decode_nibble(value: u8) -> Option<u8> {
    match value {
        b'0'..=b'9' => Some(value - b'0'),
        b'a'..=b'f' => Some(value - b'a' + 10),
        b'A'..=b'F' => Some(value - b'A' + 10),
        _ => None,
    }
}

impl fmt::Debug for Digest {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_tuple("Digest")
            .field(&self.to_lower_hex())
            .finish()
    }
}

impl fmt::Display for Digest {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.to_lower_hex())
    }
}

/// Wire digest syntax failure. Callers map it to the contract layer that owns
/// the input (manifest, model payload, or API argument).
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct DigestParseError;

impl fmt::Display for DigestParseError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("expected exactly 64 ASCII hexadecimal characters")
    }
}

impl std::error::Error for DigestParseError {}
