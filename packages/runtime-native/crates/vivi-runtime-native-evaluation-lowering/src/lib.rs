#![forbid(unsafe_code)]
#![deny(missing_docs)]

//! Internal, consumer-zero Evaluation Lowering v1 foundation and sealed candidate.
//!
//! The approved local-only review units are pinned exactly below. The parent
//! vectors' `external-review-required` field is frozen historical pre-review
//! state; that approval is `APPROVE`, P3 × 2, with no required edits. The
//! Category 9 vector's review-required state is likewise historical; its
//! approval is `APPROVE`, P0–P3 none, with no required edits.
//!
//! This crate reuses preactivation's pure correlation token, performs the
//! contract's allocation-free category 1–8 feature/direct-projection preflight,
//! performs checked/fallible category-9 reservation, and retains direct
//! projection records. Its internal C10 candidate uses the adopted deterministic
//! primitive/transcendental evaluator with transactional updates. The C11 entry
//! reserves all storage before retained fill, evaluates once, and seals topology
//! with borrowed snapshot views. A separate consuming post-seal entry borrows
//! the exact retained plan through preactivation and moves real host Ready or
//! Missing data with the sealed owner, without evaluating again. Pure lowering
//! remains host-free. This crate does not connect runtime core/TypeScript/C ABI/
//! WASM/GPU, publish state, establish freshness, or activate a model.

mod derived;
mod derived_candidate;
mod error;
mod lower;
mod model;
mod observation;
mod physics;
mod preparation;
mod reservation;
mod sealed_candidate;
mod snapshot;
mod state;
mod topology;
mod topology_reservation;

pub use derived_candidate::{
    EvaluationDerivedCandidateV1, EvaluationMutationError, lower_derived_evaluation_v1,
};
pub use error::{EvaluationLoweringError, EvaluationLoweringErrorKind};
pub use lower::lower_evaluation_foundation_v1;
pub use model::EvaluationLoweringFoundationV1;
#[cfg(feature = "native-host")]
pub use preparation::prepare_lowered_evaluation_v1;
pub use preparation::{
    MissingLoweredEvaluationV1, PrepareLoweredEvaluationV1, PreparedLoweredEvaluationV1,
    prepare_lowered_evaluation_from_bytes_v1,
};
pub use sealed_candidate::{SealedEvaluationCandidateV1, lower_sealed_evaluation_v1};
pub use snapshot::{EvaluationMeshSnapshotV1, EvaluationParameterSnapshotV1};
#[cfg(feature = "native-host")]
pub use vivi_runtime_native_preactivation::LocalAssetHost;
pub use vivi_runtime_native_preactivation::{
    AssetRef, Digest, EvaluationPayloadError, EvaluationPhysicalObjectV1,
    EvaluationPreactivationError, EvaluationTextureBindingV1, EvaluationTexturePlanV1,
    MissingActivationTexturesV1, PreparedActivationTextureSetV1, StorageKind,
    parse_evaluation_payload_v1,
};

/// Exact UTF-8 byte length of the approved local-only contract draft.
pub(crate) const APPROVED_EVALUATION_LOWERING_CONTRACT_DRAFT_BYTES: usize = 41_556;
/// SHA-256 of the approved local-only contract draft.
pub(crate) const APPROVED_EVALUATION_LOWERING_CONTRACT_DRAFT_SHA256: &str =
    "2b8f731033b9eb579b33ff66da7efd0036f2b82b5326f74a0df5db8c2718bc20";
/// Exact UTF-8 byte length of the frozen machine-readable vectors.
pub(crate) const APPROVED_EVALUATION_LOWERING_VECTORS_BYTES: usize = 90_906;
/// SHA-256 of the frozen machine-readable vectors.
pub(crate) const APPROVED_EVALUATION_LOWERING_VECTORS_SHA256: &str =
    "eadd382db0f9c08b61b2f714cde7714d0706aaa5ed2c0edf99f7ad2fa27b5f9b";
/// Exact UTF-8 byte length of the external-review approval record.
pub(crate) const APPROVED_EVALUATION_LOWERING_REVIEW_BYTES: usize = 20_624;
/// SHA-256 of the external-review approval record.
pub(crate) const APPROVED_EVALUATION_LOWERING_REVIEW_SHA256: &str =
    "76c17745960b824530b1d6b0252f47e013cbef850d5245419c58e56f3364526b";
/// Exact UTF-8 byte length of the approved Category 9 reservation contract.
pub(crate) const APPROVED_EVALUATION_CATEGORY9_RESERVATION_CONTRACT_BYTES: usize = 41_002;
/// SHA-256 of the approved Category 9 reservation contract.
pub(crate) const APPROVED_EVALUATION_CATEGORY9_RESERVATION_CONTRACT_SHA256: &str =
    "69a5c75855b43d18e030ebb02d29bdcd73ecc7e6a28c0ec0892191dedfc67ade";
/// Exact UTF-8 byte length of the approved Category 9 reservation vectors.
pub(crate) const APPROVED_EVALUATION_CATEGORY9_RESERVATION_VECTORS_BYTES: usize = 210_149;
/// SHA-256 of the approved Category 9 reservation vectors.
pub(crate) const APPROVED_EVALUATION_CATEGORY9_RESERVATION_VECTORS_SHA256: &str =
    "06111e2868d6d007062dcf36dc8bffeaa8b45da5f6a0651a5a61492866b37ecc";
/// Exact UTF-8 byte length of the approved Category 9 external-review record.
pub(crate) const APPROVED_EVALUATION_CATEGORY9_RESERVATION_REVIEW_BYTES: usize = 18_793;
/// SHA-256 of the approved Category 9 external-review record.
pub(crate) const APPROVED_EVALUATION_CATEGORY9_RESERVATION_REVIEW_SHA256: &str =
    "8c039ba1a55920629b9855eecb6d312ad60326f7a696b074f1b4387997154272";

// Keep the private evidence pins live in non-test builds without adding a
// public API or runtime work. Repository checkers independently verify them.
const _: (usize, &str, usize, &str, usize, &str) = (
    APPROVED_EVALUATION_LOWERING_CONTRACT_DRAFT_BYTES,
    APPROVED_EVALUATION_LOWERING_CONTRACT_DRAFT_SHA256,
    APPROVED_EVALUATION_LOWERING_VECTORS_BYTES,
    APPROVED_EVALUATION_LOWERING_VECTORS_SHA256,
    APPROVED_EVALUATION_LOWERING_REVIEW_BYTES,
    APPROVED_EVALUATION_LOWERING_REVIEW_SHA256,
);
const _: (usize, &str, usize, &str, usize, &str) = (
    APPROVED_EVALUATION_CATEGORY9_RESERVATION_CONTRACT_BYTES,
    APPROVED_EVALUATION_CATEGORY9_RESERVATION_CONTRACT_SHA256,
    APPROVED_EVALUATION_CATEGORY9_RESERVATION_VECTORS_BYTES,
    APPROVED_EVALUATION_CATEGORY9_RESERVATION_VECTORS_SHA256,
    APPROVED_EVALUATION_CATEGORY9_RESERVATION_REVIEW_BYTES,
    APPROVED_EVALUATION_CATEGORY9_RESERVATION_REVIEW_SHA256,
);

#[cfg(test)]
mod tests;
