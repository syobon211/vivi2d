use std::fmt;

use vivi_asset_host_local::{
    AssetErrorCode, LocalAssetHostError, LocalAssetHostErrorKind, LocalStoreErrorKind,
};

/// Stable, redacted failure classes for Evaluation preactivation.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EvaluationPreactivationErrorKind {
    /// The explicit generation, validated payload, or typed plan do not correlate exactly.
    Correlation,
    /// The typed texture plan failed the local Asset host's contract preflight.
    InvalidTexturePlan,
    /// A frozen payload, texture, or generation resource ceiling was exceeded.
    ResourceLimitExceeded,
    /// The Asset resolver rejected a reference, immutable object, or PNG.
    Asset,
    /// The private local Asset store was unavailable or failed an integrity check.
    Store,
    /// A trusted component contradicted its validated output contract.
    Internal,
}

/// A sanitized Evaluation preactivation failure.
///
/// Payload bytes, identifiers, Asset addresses, principals, paths, SQLite
/// diagnostics, and native error text are neither retained nor printed.
#[derive(Clone, Copy, Eq, PartialEq)]
pub struct EvaluationPreactivationError {
    kind: EvaluationPreactivationErrorKind,
    asset_code: Option<AssetErrorCode>,
    store_kind: Option<LocalStoreErrorKind>,
}

impl EvaluationPreactivationError {
    pub(crate) const fn correlation() -> Self {
        Self {
            kind: EvaluationPreactivationErrorKind::Correlation,
            asset_code: None,
            store_kind: None,
        }
    }

    pub(crate) const fn internal() -> Self {
        Self {
            kind: EvaluationPreactivationErrorKind::Internal,
            asset_code: None,
            store_kind: None,
        }
    }

    pub(crate) const fn resource_limit_exceeded() -> Self {
        Self {
            kind: EvaluationPreactivationErrorKind::ResourceLimitExceeded,
            asset_code: None,
            store_kind: None,
        }
    }

    pub(crate) const fn from_host(error: LocalAssetHostError) -> Self {
        let kind = match error.kind() {
            LocalAssetHostErrorKind::InvalidTexturePlan => {
                EvaluationPreactivationErrorKind::InvalidTexturePlan
            }
            LocalAssetHostErrorKind::ResourceLimitExceeded => {
                EvaluationPreactivationErrorKind::ResourceLimitExceeded
            }
            LocalAssetHostErrorKind::Asset => EvaluationPreactivationErrorKind::Asset,
            LocalAssetHostErrorKind::Store => EvaluationPreactivationErrorKind::Store,
        };
        Self {
            kind,
            asset_code: error.asset_code(),
            store_kind: error.store_kind(),
        }
    }

    /// Returns the stable redacted failure class.
    #[must_use]
    pub const fn kind(self) -> EvaluationPreactivationErrorKind {
        self.kind
    }

    /// Returns the frozen Asset Model cause code only for Asset failures.
    #[must_use]
    pub const fn asset_code(self) -> Option<AssetErrorCode> {
        self.asset_code
    }

    /// Returns the sanitized local-store cause only for store failures.
    #[must_use]
    pub const fn store_kind(self) -> Option<LocalStoreErrorKind> {
        self.store_kind
    }
}

impl fmt::Debug for EvaluationPreactivationError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("EvaluationPreactivationError")
            .field("kind", &self.kind)
            .field("asset_code", &self.asset_code)
            .field("store_kind", &self.store_kind)
            .finish()
    }
}

impl fmt::Display for EvaluationPreactivationError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self.kind {
            EvaluationPreactivationErrorKind::Correlation => {
                "evaluation request generation, payload, and texture plan do not correlate"
            }
            EvaluationPreactivationErrorKind::InvalidTexturePlan => {
                "evaluation texture plan was rejected"
            }
            EvaluationPreactivationErrorKind::ResourceLimitExceeded => {
                "evaluation preactivation resource limit exceeded"
            }
            EvaluationPreactivationErrorKind::Asset => {
                "evaluation preactivation asset operation was rejected"
            }
            EvaluationPreactivationErrorKind::Store => {
                "evaluation preactivation asset store operation failed"
            }
            EvaluationPreactivationErrorKind::Internal => {
                "evaluation preactivation failed internally"
            }
        })
    }
}

impl std::error::Error for EvaluationPreactivationError {}
