use std::fmt;
#[cfg(feature = "native-host")]
use vivi_asset_host_local::LocalStoreErrorKind;

use vivi_asset_host_local::{AssetErrorCode, LocalAssetHostError, LocalAssetHostErrorKind};

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
    #[cfg(feature = "native-host")]
    store_kind: Option<LocalStoreErrorKind>,
}

impl EvaluationPreactivationError {
    /// Frozen outer-load status, retaining this error's sanitized cause codes.
    /// This is not the legacy runtime ABI's smaller status catalog.
    #[must_use]
    pub const fn load_status(self) -> i32 {
        match self.kind {
            EvaluationPreactivationErrorKind::ResourceLimitExceeded => 6,
            EvaluationPreactivationErrorKind::Internal => 10,
            EvaluationPreactivationErrorKind::Correlation
            | EvaluationPreactivationErrorKind::InvalidTexturePlan
            | EvaluationPreactivationErrorKind::Asset
            | EvaluationPreactivationErrorKind::Store => 14,
        }
    }

    pub(crate) const fn correlation() -> Self {
        Self {
            kind: EvaluationPreactivationErrorKind::Correlation,
            asset_code: None,
            #[cfg(feature = "native-host")]
            store_kind: None,
        }
    }

    pub(crate) const fn internal() -> Self {
        Self {
            kind: EvaluationPreactivationErrorKind::Internal,
            asset_code: None,
            #[cfg(feature = "native-host")]
            store_kind: None,
        }
    }

    pub(crate) const fn resource_limit_exceeded() -> Self {
        Self {
            kind: EvaluationPreactivationErrorKind::ResourceLimitExceeded,
            asset_code: None,
            #[cfg(feature = "native-host")]
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
            #[cfg(feature = "native-host")]
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
    #[cfg(feature = "native-host")]
    pub const fn store_kind(self) -> Option<LocalStoreErrorKind> {
        self.store_kind
    }
}

impl fmt::Debug for EvaluationPreactivationError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let mut value = formatter.debug_struct("EvaluationPreactivationError");
        value
            .field("kind", &self.kind)
            .field("asset_code", &self.asset_code);
        #[cfg(feature = "native-host")]
        value.field("store_kind", &self.store_kind);
        value.finish()
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn all_error_kinds_preserve_the_frozen_outer_load_mapping() {
        use EvaluationPreactivationErrorKind::*;
        for (kind, status) in [
            (Correlation, 14),
            (InvalidTexturePlan, 14),
            (ResourceLimitExceeded, 6),
            (Asset, 14),
            (Store, 14),
            (Internal, 10),
        ] {
            let error = EvaluationPreactivationError {
                kind,
                asset_code: None,
                #[cfg(feature = "native-host")]
                store_kind: None,
            };
            assert_eq!(error.load_status(), status);
            assert_eq!(error.kind(), kind);
        }
    }
}
