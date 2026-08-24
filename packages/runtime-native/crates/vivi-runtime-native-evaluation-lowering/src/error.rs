use std::fmt;

use vivi_runtime_native_preactivation::{
    EvaluationPreactivationError, EvaluationPreactivationErrorKind,
};

/// Stable, redacted failure classes for the Evaluation Lowering v1 foundation.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EvaluationLoweringErrorKind {
    /// Caller generation or candidate/typed-plan tuple correlation failed.
    Correlation,
    /// An `artPath` layer is not eligible in Evaluation Lowering v1.
    UnsupportedLayer,
    /// A non-mesh layer owns a mask field.
    UnsupportedMaskPlacement,
    /// One of the nine extended blend modes is not eligible in v1.
    UnsupportedBlendMode,
    /// An IK controller contains non-empty parameter mappings.
    UnsupportedIkParameterMappings,
    /// One IK bone chain repeats a bone identifier.
    UnsupportedDuplicateIkBone,
    /// More than one IK controller is present.
    UnsupportedMultipleIkControllers,
    /// More than one physics group is enabled.
    UnsupportedMultipleEnabledPhysicsGroups,
    /// IK base influence or a constraint interval is outside the v1 domain.
    InvalidIkRange,
    /// A directly projected binary64 value was not finite.
    NumericNonFinite,
    /// A finite binary64 value rounded to binary32 infinity.
    NumericOverflow,
    /// A nonzero binary64 value rounded to binary32 zero.
    NumericUnderflow,
    /// A rounded binary32 value was a nonzero subnormal.
    NumericSubnormal,
    /// Checked count/size arithmetic or fallible reservation failed.
    ResourceLimitExceeded,
    /// A validated or correlated prerequisite contradicted its trusted shape.
    Internal,
}

impl EvaluationLoweringErrorKind {
    /// Returns the frozen outer load status for this private cause.
    #[must_use]
    pub const fn load_status(self) -> i32 {
        match self {
            Self::UnsupportedLayer
            | Self::UnsupportedMaskPlacement
            | Self::UnsupportedBlendMode
            | Self::UnsupportedIkParameterMappings
            | Self::UnsupportedDuplicateIkBone
            | Self::UnsupportedMultipleIkControllers
            | Self::UnsupportedMultipleEnabledPhysicsGroups => 2,
            Self::ResourceLimitExceeded => 6,
            Self::Internal => 10,
            Self::Correlation
            | Self::InvalidIkRange
            | Self::NumericNonFinite
            | Self::NumericOverflow
            | Self::NumericUnderflow
            | Self::NumericSubnormal => 14,
        }
    }
}

/// A sanitized Evaluation lowering-foundation failure.
///
/// Payload values, paths, identifiers, texture references, and native error
/// text are neither retained nor formatted.
#[derive(Clone, Copy, Eq, PartialEq)]
pub struct EvaluationLoweringError {
    kind: EvaluationLoweringErrorKind,
}

impl EvaluationLoweringError {
    pub(crate) const fn new(kind: EvaluationLoweringErrorKind) -> Self {
        Self { kind }
    }

    pub(crate) const fn from_correlation(error: EvaluationPreactivationError) -> Self {
        let kind = match error.kind() {
            EvaluationPreactivationErrorKind::Correlation => {
                EvaluationLoweringErrorKind::Correlation
            }
            EvaluationPreactivationErrorKind::ResourceLimitExceeded => {
                EvaluationLoweringErrorKind::ResourceLimitExceeded
            }
            EvaluationPreactivationErrorKind::InvalidTexturePlan
            | EvaluationPreactivationErrorKind::Asset
            | EvaluationPreactivationErrorKind::Store
            | EvaluationPreactivationErrorKind::Internal => EvaluationLoweringErrorKind::Internal,
        };
        Self { kind }
    }

    /// Returns the stable private failure class.
    #[must_use]
    pub const fn kind(self) -> EvaluationLoweringErrorKind {
        self.kind
    }

    /// Returns the frozen outer load status for this private failure.
    #[must_use]
    pub const fn load_status(self) -> i32 {
        self.kind.load_status()
    }
}

impl fmt::Debug for EvaluationLoweringError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("EvaluationLoweringError")
            .field("kind", &self.kind)
            .field("load_status", &self.load_status())
            .finish()
    }
}

impl fmt::Display for EvaluationLoweringError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self.kind {
            EvaluationLoweringErrorKind::Correlation => {
                "evaluation lowering inputs do not correlate"
            }
            EvaluationLoweringErrorKind::UnsupportedLayer
            | EvaluationLoweringErrorKind::UnsupportedMaskPlacement
            | EvaluationLoweringErrorKind::UnsupportedBlendMode
            | EvaluationLoweringErrorKind::UnsupportedIkParameterMappings
            | EvaluationLoweringErrorKind::UnsupportedDuplicateIkBone
            | EvaluationLoweringErrorKind::UnsupportedMultipleIkControllers
            | EvaluationLoweringErrorKind::UnsupportedMultipleEnabledPhysicsGroups => {
                "evaluation lowering feature is unsupported"
            }
            EvaluationLoweringErrorKind::InvalidIkRange
            | EvaluationLoweringErrorKind::NumericNonFinite
            | EvaluationLoweringErrorKind::NumericOverflow
            | EvaluationLoweringErrorKind::NumericUnderflow
            | EvaluationLoweringErrorKind::NumericSubnormal => {
                "evaluation lowering input is load-incompatible"
            }
            EvaluationLoweringErrorKind::ResourceLimitExceeded => {
                "evaluation lowering resource limit exceeded"
            }
            EvaluationLoweringErrorKind::Internal => {
                "evaluation lowering foundation failed internally"
            }
        })
    }
}

impl std::error::Error for EvaluationLoweringError {}
