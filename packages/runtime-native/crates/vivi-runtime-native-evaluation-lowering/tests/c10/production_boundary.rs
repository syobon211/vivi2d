// Intentionally fails against the ordinary library. Run by --execute-c10,
// not as a Cargo test. Test observation and mutation must stay inaccessible.
use vivi_runtime_native_evaluation_lowering::{
    EvaluationDerivedCandidateV1, lower_derived_evaluation_observed,
};
use vivi_runtime_native_evaluation_lowering::observation::Observer;

fn forbidden(candidate: &mut EvaluationDerivedCandidateV1) {
    candidate.test_set_dynamic_generation(0);
}

fn main() {}
