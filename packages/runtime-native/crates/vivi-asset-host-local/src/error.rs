use std::fmt;

use vivi_asset_resolver::{AssetError, AssetErrorCode};
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
    store_kind: Option<LocalStoreErrorKind>,
}

impl LocalAssetHostError {
    pub(crate) const fn invalid_texture_plan() -> Self {
        Self {
            kind: LocalAssetHostErrorKind::InvalidTexturePlan,
            asset_code: None,
            store_kind: None,
        }
    }

    pub(crate) const fn resource_limit_exceeded() -> Self {
        Self {
            kind: LocalAssetHostErrorKind::ResourceLimitExceeded,
            asset_code: None,
            store_kind: None,
        }
    }

    pub(crate) const fn from_asset(error: AssetError) -> Self {
        Self {
            kind: LocalAssetHostErrorKind::Asset,
            asset_code: Some(error.code),
            store_kind: None,
        }
    }

    pub(crate) const fn from_store(error: LocalStoreError) -> Self {
        Self::from_store_kind(Some(error.kind()))
    }

    pub(crate) const fn from_store_kind(kind: Option<LocalStoreErrorKind>) -> Self {
        Self {
            kind: LocalAssetHostErrorKind::Store,
            asset_code: None,
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
