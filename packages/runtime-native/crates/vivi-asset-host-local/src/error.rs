use std::fmt;

use vivi_asset_resolver::{AssetError, AssetErrorCode};
#[cfg(feature = "local-store")]
use vivi_asset_store_local::{LocalStoreError, LocalStoreErrorKind};

/// Stable host-side failure classes. Resolver Asset errors and local-store
/// failures remain disjoint so callers never have to infer their origin.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum LocalAssetHostErrorKind {
    InvalidTexturePlan,
    ResourceLimitExceeded,
    Asset,
    Store,
}

/// Sanitized orchestration failure.
///
/// Diagnostic strings, paths, principals, binding IDs, and native database
/// details are intentionally not retained. Stable Asset and store categories
/// are available only through their dedicated accessors.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct LocalAssetHostError {
    kind: LocalAssetHostErrorKind,
    asset_code: Option<AssetErrorCode>,
    #[cfg(feature = "local-store")]
    store_kind: Option<LocalStoreErrorKind>,
}

impl LocalAssetHostError {
    pub(crate) const fn invalid_texture_plan() -> Self {
        Self {
            kind: LocalAssetHostErrorKind::InvalidTexturePlan,
            asset_code: None,
            #[cfg(feature = "local-store")]
            store_kind: None,
        }
    }

    pub(crate) const fn resource_limit_exceeded() -> Self {
        Self {
            kind: LocalAssetHostErrorKind::ResourceLimitExceeded,
            asset_code: None,
            #[cfg(feature = "local-store")]
            store_kind: None,
        }
    }

    pub(crate) const fn from_asset(error: AssetError) -> Self {
        Self {
            kind: LocalAssetHostErrorKind::Asset,
            asset_code: Some(error.code),
            #[cfg(feature = "local-store")]
            store_kind: None,
        }
    }

    #[cfg(feature = "local-store")]
    pub(crate) const fn from_store(error: LocalStoreError) -> Self {
        Self::from_store_kind(Some(error.kind()))
    }

    #[cfg(feature = "local-store")]
    pub(crate) const fn from_store_kind(kind: Option<LocalStoreErrorKind>) -> Self {
        Self {
            kind: LocalAssetHostErrorKind::Store,
            asset_code: None,
            #[cfg(feature = "local-store")]
            store_kind: kind,
        }
    }

    #[must_use]
    pub const fn kind(self) -> LocalAssetHostErrorKind {
        self.kind
    }

    /// The frozen Asset Model code, present only for resolver-owned failures.
    #[must_use]
    pub const fn asset_code(self) -> Option<AssetErrorCode> {
        self.asset_code
    }

    /// The redacted local-store class, present only for concrete store
    /// failures. No path, principal, SQLite text, or native source is exposed.
    #[must_use]
    #[cfg(feature = "local-store")]
    pub const fn store_kind(self) -> Option<LocalStoreErrorKind> {
        self.store_kind
    }
}

impl fmt::Display for LocalAssetHostError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self.kind {
            LocalAssetHostErrorKind::InvalidTexturePlan => "local asset host texture plan rejected",
            LocalAssetHostErrorKind::ResourceLimitExceeded => {
                "local asset host resource limit exceeded"
            }
            LocalAssetHostErrorKind::Asset => "local asset host asset operation rejected",
            LocalAssetHostErrorKind::Store => "local asset host store operation failed",
        })
    }
}

impl std::error::Error for LocalAssetHostError {}

/// Transfer-only outcomes do not extend the existing activation host's error
/// vocabulary or require unrelated exhaustive-match consumers to change.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[cfg(feature = "local-store")]
pub enum PngTransferErrorKind {
    CancelledBeforePublication,
    Host(LocalAssetHostErrorKind),
}

/// Redacted one-PNG transfer failure. A publication Store error may follow an
/// actual descriptor commit; callers reconcile with immutable replay, not deletion.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[cfg(feature = "local-store")]
pub struct PngTransferError {
    cause: Option<LocalAssetHostError>,
    outcome_may_have_committed: bool,
}

#[cfg(feature = "local-store")]
impl From<LocalAssetHostError> for PngTransferError {
    fn from(cause: LocalAssetHostError) -> Self {
        Self {
            cause: Some(cause),
            outcome_may_have_committed: false,
        }
    }
}

#[cfg(feature = "local-store")]
impl PngTransferError {
    pub(crate) const fn cancelled_before_publication() -> Self {
        Self {
            cause: None,
            outcome_may_have_committed: false,
        }
    }

    pub(crate) fn publication_failure(mut self) -> Self {
        if self
            .cause
            .is_some_and(|e| e.kind() == LocalAssetHostErrorKind::Store)
        {
            self.outcome_may_have_committed = true;
        }
        self
    }

    #[must_use]
    pub const fn kind(self) -> PngTransferErrorKind {
        match self.cause {
            Some(error) => PngTransferErrorKind::Host(error.kind()),
            None => PngTransferErrorKind::CancelledBeforePublication,
        }
    }

    #[must_use]
    pub const fn host_error(self) -> Option<LocalAssetHostError> {
        self.cause
    }

    #[must_use]
    pub const fn asset_code(self) -> Option<AssetErrorCode> {
        match self.cause {
            Some(error) => error.asset_code(),
            None => None,
        }
    }

    #[must_use]
    #[cfg(feature = "local-store")]
    pub const fn store_kind(self) -> Option<LocalStoreErrorKind> {
        match self.cause {
            Some(error) => error.store_kind(),
            None => None,
        }
    }

    /// A transfer write began, so immutable objects or the descriptor may have
    /// committed despite the returned error. False is not a general store probe.
    #[must_use]
    pub const fn outcome_may_have_committed(self) -> bool {
        self.outcome_may_have_committed
    }
}

#[cfg(feature = "local-store")]
impl fmt::Display for PngTransferError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self.cause {
            Some(error) => error.fmt(formatter),
            None => formatter.write_str("local asset host transfer cancelled before publication"),
        }
    }
}

#[cfg(feature = "local-store")]
impl std::error::Error for PngTransferError {}
