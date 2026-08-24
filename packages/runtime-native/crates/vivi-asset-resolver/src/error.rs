use std::fmt;

/// Complete frozen Asset Model v1 error-code vocabulary.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AssetErrorCode {
    HashMismatch,
    SizeMismatch,
    TooLargeForEmbed,
    ChunkMissing,
    ManifestInvalid,
    RefSetMismatch,
    UploadExpired,
    UnsupportedKind,
    DeletedObjectRef,
    DescriptorMismatch,
    MediaTypeMismatch,
    ContentHashMismatch,
    DecodingProfileUnsupported,
    DimensionMismatch,
    DecodeMalformed,
    LimitExceeded,
    WriteInProgress,
    WriteLeaseLost,
}

impl AssetErrorCode {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::HashMismatch => "VIVI_ASSET_HASH_MISMATCH",
            Self::SizeMismatch => "VIVI_ASSET_SIZE_MISMATCH",
            Self::TooLargeForEmbed => "VIVI_ASSET_TOO_LARGE_FOR_EMBED",
            Self::ChunkMissing => "VIVI_ASSET_CHUNK_MISSING",
            Self::ManifestInvalid => "VIVI_ASSET_MANIFEST_INVALID",
            Self::RefSetMismatch => "VIVI_ASSET_REF_SET_MISMATCH",
            Self::UploadExpired => "VIVI_ASSET_UPLOAD_EXPIRED",
            Self::UnsupportedKind => "VIVI_ASSET_UNSUPPORTED_KIND",
            Self::DeletedObjectRef => "VIVI_ASSET_DELETED_OBJECT_REF",
            Self::DescriptorMismatch => "VIVI_ASSET_DESCRIPTOR_MISMATCH",
            Self::MediaTypeMismatch => "VIVI_ASSET_MEDIA_TYPE_MISMATCH",
            Self::ContentHashMismatch => "VIVI_ASSET_CONTENT_HASH_MISMATCH",
            Self::DecodingProfileUnsupported => "VIVI_ASSET_DECODING_PROFILE_UNSUPPORTED",
            Self::DimensionMismatch => "VIVI_ASSET_DIMENSION_MISMATCH",
            Self::DecodeMalformed => "VIVI_ASSET_DECODE_MALFORMED",
            Self::LimitExceeded => "VIVI_ASSET_LIMIT_EXCEEDED",
            Self::WriteInProgress => "VIVI_ASSET_WRITE_IN_PROGRESS",
            Self::WriteLeaseLost => "VIVI_ASSET_WRITE_LEASE_LOST",
        }
    }
}

impl fmt::Display for AssetErrorCode {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.as_str())
    }
}

/// Resolver-owned contract failure. `detail` is diagnostic-only and is not a
/// stable protocol surface.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AssetError {
    pub code: AssetErrorCode,
    pub detail: &'static str,
}

impl AssetError {
    #[must_use]
    pub const fn new(code: AssetErrorCode, detail: &'static str) -> Self {
        Self { code, detail }
    }

    #[must_use]
    pub const fn stable_code(&self) -> Option<AssetErrorCode> {
        Some(self.code)
    }
}

impl fmt::Display for AssetError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}: {}", self.code, self.detail)
    }
}

impl std::error::Error for AssetError {}

/// Storage failures are deliberately distinct from frozen Asset errors. An
/// adapter must sanitize them and must not fabricate a stable Asset code.
#[derive(Debug)]
pub enum OperationError<StoreError> {
    Asset(AssetError),
    StoreUnavailable(StoreError),
}

impl<StoreError> OperationError<StoreError> {
    #[must_use]
    pub const fn stable_code(&self) -> Option<AssetErrorCode> {
        match self {
            Self::Asset(error) => error.stable_code(),
            Self::StoreUnavailable(_) => None,
        }
    }
}

impl<StoreError> From<AssetError> for OperationError<StoreError> {
    fn from(value: AssetError) -> Self {
        Self::Asset(value)
    }
}

impl<StoreError: fmt::Display> fmt::Display for OperationError<StoreError> {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Asset(error) => error.fmt(formatter),
            Self::StoreUnavailable(error) => write!(formatter, "asset store unavailable: {error}"),
        }
    }
}

impl<StoreError: std::error::Error + 'static> std::error::Error for OperationError<StoreError> {}
