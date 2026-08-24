use std::fmt;

/// Stable, redacted categories for local-store failures.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[non_exhaustive]
pub enum LocalStoreErrorKind {
    PathRejected,
    StoreUnavailable,
    IntegrityViolation,
    PrincipalMismatch,
    InvalidInput,
    ImmutableConflict,
}

/// A deliberately source-free error. Paths, principals, media types, SQL,
/// and SQLite diagnostics never cross this boundary.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct LocalStoreError {
    kind: LocalStoreErrorKind,
}

impl LocalStoreError {
    pub(crate) const fn new(kind: LocalStoreErrorKind) -> Self {
        Self { kind }
    }

    #[must_use]
    pub const fn kind(self) -> LocalStoreErrorKind {
        self.kind
    }
}

impl fmt::Display for LocalStoreError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self.kind {
            LocalStoreErrorKind::PathRejected => "local asset store path rejected",
            LocalStoreErrorKind::StoreUnavailable => "local asset store unavailable",
            LocalStoreErrorKind::IntegrityViolation => "local asset store integrity violation",
            LocalStoreErrorKind::PrincipalMismatch => "local asset store principal mismatch",
            LocalStoreErrorKind::InvalidInput => "local asset store input rejected",
            LocalStoreErrorKind::ImmutableConflict => "local asset store immutable conflict",
        })
    }
}

impl std::error::Error for LocalStoreError {}

pub(crate) const fn path_rejected() -> LocalStoreError {
    LocalStoreError::new(LocalStoreErrorKind::PathRejected)
}

pub(crate) const fn unavailable() -> LocalStoreError {
    LocalStoreError::new(LocalStoreErrorKind::StoreUnavailable)
}

pub(crate) const fn integrity() -> LocalStoreError {
    LocalStoreError::new(LocalStoreErrorKind::IntegrityViolation)
}

pub(crate) const fn principal_mismatch() -> LocalStoreError {
    LocalStoreError::new(LocalStoreErrorKind::PrincipalMismatch)
}

pub(crate) const fn invalid_input() -> LocalStoreError {
    LocalStoreError::new(LocalStoreErrorKind::InvalidInput)
}

pub(crate) const fn immutable_conflict() -> LocalStoreError {
    LocalStoreError::new(LocalStoreErrorKind::ImmutableConflict)
}
