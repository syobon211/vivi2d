use std::fmt;

/// Stable, redacted failure classes for Evaluation Payload v1 ingestion.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EvaluationPayloadErrorKind {
    /// The transport, Stage 1 schema, or Stage 2 semantics are invalid.
    EvaluationPayload,
    /// A transport or aggregate runtime resource ceiling was exceeded.
    LimitExceeded,
    /// The payload is valid but requires a runtime operation not implemented yet.
    UnsupportedOperation,
    /// A crate invariant or embedded contract artifact is invalid.
    Internal,
}

impl EvaluationPayloadErrorKind {
    /// Returns the frozen runtime status associated with this failure class.
    #[must_use]
    pub const fn status(self) -> i32 {
        match self {
            Self::EvaluationPayload => 14,
            Self::LimitExceeded => 6,
            Self::UnsupportedOperation => 2,
            Self::Internal => 10,
        }
    }
}

/// A sanitized Evaluation Payload failure.
///
/// Raw JSON, decoded strings, identifiers, JSON paths, and parser diagnostics
/// are deliberately neither retained nor printed.
#[derive(Clone, Copy, Eq, PartialEq)]
pub struct EvaluationPayloadError {
    kind: EvaluationPayloadErrorKind,
}

impl EvaluationPayloadError {
    pub(crate) const fn payload() -> Self {
        Self {
            kind: EvaluationPayloadErrorKind::EvaluationPayload,
        }
    }

    pub(crate) const fn limit() -> Self {
        Self {
            kind: EvaluationPayloadErrorKind::LimitExceeded,
        }
    }

    pub(crate) const fn unsupported() -> Self {
        Self {
            kind: EvaluationPayloadErrorKind::UnsupportedOperation,
        }
    }

    pub(crate) const fn internal() -> Self {
        Self {
            kind: EvaluationPayloadErrorKind::Internal,
        }
    }

    /// Returns the stable failure class.
    #[must_use]
    pub const fn kind(self) -> EvaluationPayloadErrorKind {
        self.kind
    }

    /// Returns the frozen runtime status without exposing a C ABI surface.
    #[must_use]
    pub const fn status(self) -> i32 {
        self.kind.status()
    }
}

impl fmt::Debug for EvaluationPayloadError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("EvaluationPayloadError")
            .field("kind", &self.kind)
            .field("status", &self.status())
            .finish()
    }
}

impl fmt::Display for EvaluationPayloadError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self.kind {
            EvaluationPayloadErrorKind::EvaluationPayload => "evaluation payload was rejected",
            EvaluationPayloadErrorKind::LimitExceeded => {
                "evaluation payload resource limit exceeded"
            }
            EvaluationPayloadErrorKind::UnsupportedOperation => {
                "evaluation payload requires an unsupported operation"
            }
            EvaluationPayloadErrorKind::Internal => {
                "evaluation payload validation failed internally"
            }
        })
    }
}

impl std::error::Error for EvaluationPayloadError {}
