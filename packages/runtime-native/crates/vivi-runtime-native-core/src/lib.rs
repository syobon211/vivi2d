#![forbid(unsafe_code)]
#![deny(missing_docs)]

//! Shared native runtime core constants, parser, and skeleton types.
//!
//! Phase N2 starts with strict Runtime Spec v1 JSON transport checks before the
//! evaluator is introduced.

/// Error types and canonical status mapping.
pub mod errors;
/// Parser and evaluator resource limits.
pub mod limits;
/// Runtime Spec v1 model evaluator.
pub mod model;
/// Scalar runtime parameter state.
pub mod parameters;
/// Strict Runtime Spec v1 JSON parser.
pub mod parser;
/// Static Runtime Spec v1 model snapshots.
pub mod static_model;

pub use errors::RuntimeError;
pub use limits::RuntimeLimits;
pub use model::{HitResult, RuntimeModel};
pub use parameters::{ParameterInfo, ParameterState};
pub use parser::{
    PreflightSummary, RuntimePayload, parse_runtime_payload, preflight_runtime_payload,
};
pub use static_model::{BlendMode, MeshSnapshot, StaticModel, TextureSnapshot};

/// Runtime ABI major version for the pre-release native C ABI candidate.
pub const ABI_VERSION_MAJOR: u16 = 0;

/// Runtime ABI minor version for the pre-release native C ABI candidate.
pub const ABI_VERSION_MINOR: u16 = 1;

/// Packed runtime ABI version using `(major << 16) | minor`.
pub const ABI_VERSION: u32 = ((ABI_VERSION_MAJOR as u32) << 16) | ABI_VERSION_MINOR as u32;

/// Simple semantic version used by runtime and spec version APIs.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Version {
    /// Major version.
    pub major: u32,
    /// Minor version.
    pub minor: u32,
    /// Patch version.
    pub patch: u32,
}

/// Native runtime package version.
pub const RUNTIME_VERSION: Version = Version {
    major: 0,
    minor: 1,
    patch: 0,
};

/// Minimum Runtime Spec version accepted by the native runtime.
pub const SUPPORTED_SPEC_MIN_VERSION: Version = Version {
    major: 1,
    minor: 0,
    patch: 0,
};

/// Maximum Runtime Spec version accepted by the native runtime.
pub const SUPPORTED_SPEC_MAX_VERSION: Version = Version {
    major: 1,
    minor: 0,
    patch: 0,
};

/// Canonical status codes shared with `vivi_runtime.h`.
pub mod status {
    /// Operation succeeded.
    pub const OK: i32 = 0;
    /// Caller passed an invalid handle, null output, invalid ID, or invalid option.
    pub const INVALID_ARGUMENT: i32 = 1;
    /// Caller requested a reserved operation not implemented by this runtime.
    pub const UNSUPPORTED_OPERATION: i32 = 2;
    /// Payload could not be decoded as a supported Vivi2D runtime payload.
    pub const PARSE: i32 = 3;
    /// Payload spec version is outside the supported range.
    pub const UNSUPPORTED_SPEC_VERSION: i32 = 4;
    /// Payload contains a forbidden public-profile marker.
    pub const PRIVATE_PROFILE: i32 = 5;
    /// Payload or runtime allocation exceeds configured limits.
    pub const LIMIT_EXCEEDED: i32 = 6;
    /// Payload shape is decoded but semantically invalid.
    pub const VALIDATION: i32 = 7;
    /// Texture metadata or pixel format is invalid or unsupported.
    pub const TEXTURE: i32 = 8;
    /// Update, animation, IK, physics, or hit testing failed after load.
    pub const EVALUATION: i32 = 9;
    /// Unexpected runtime failure.
    pub const INTERNAL: i32 = 10;

    /// Return whether a raw status code belongs to the canonical C ABI catalog.
    pub const fn is_canonical(status: i32) -> bool {
        status >= OK && status <= INTERNAL
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn versions_match_runtime_spec_v1_contract() {
        assert_eq!(ABI_VERSION, 0x0000_0001);
        assert_eq!(
            RUNTIME_VERSION,
            Version {
                major: 0,
                minor: 1,
                patch: 0
            }
        );
        assert_eq!(
            SUPPORTED_SPEC_MIN_VERSION,
            Version {
                major: 1,
                minor: 0,
                patch: 0
            }
        );
        assert_eq!(SUPPORTED_SPEC_MIN_VERSION, SUPPORTED_SPEC_MAX_VERSION);
    }

    #[test]
    fn status_codes_match_c_header_catalog() {
        assert_eq!(status::OK, 0);
        assert_eq!(status::INVALID_ARGUMENT, 1);
        assert_eq!(status::UNSUPPORTED_OPERATION, 2);
        assert_eq!(status::PARSE, 3);
        assert_eq!(status::UNSUPPORTED_SPEC_VERSION, 4);
        assert_eq!(status::PRIVATE_PROFILE, 5);
        assert_eq!(status::LIMIT_EXCEEDED, 6);
        assert_eq!(status::VALIDATION, 7);
        assert_eq!(status::TEXTURE, 8);
        assert_eq!(status::EVALUATION, 9);
        assert_eq!(status::INTERNAL, 10);
        assert!(status::is_canonical(status::OK));
        assert!(status::is_canonical(status::INTERNAL));
        assert!(!status::is_canonical(status::INTERNAL + 1));
    }
}
