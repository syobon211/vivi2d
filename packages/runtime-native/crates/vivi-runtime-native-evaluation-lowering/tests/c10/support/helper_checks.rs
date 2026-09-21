// One fixed helper-only case. The actual affine implementation is called once.
// Input authority: native-c10-concrete-inputs-world-ik-policy-1.json
// /scenarios/1/variants/1/directHelper
// SHA256 0327cd2b75f437a4934306e2ad8875ba45ac1b806ea3dae0f04a2ef2953f0211
// No claim that these parent cells arise from public JSON bone inputs.
use crate::allocation_guard::Guard;
use crate::compare::{self, Check, Context};
use crate::literal_types::{CaseClass, Presence};
use crate::observation::{Observer, ProjectionRecord, TraceRecord};

const PARENT: [u64; 6] = [
    0x3ff0_0000_0000_0000,
    0,
    0x3ff0_0000_0000_0000,
    0x3ff0_0000_0000_0000,
    0xc340_0000_0000_0000,
    0,
];
const CHILD: [u64; 6] = [
    0x3ff0_0000_0000_0000,
    0,
    0,
    0x3ff0_0000_0000_0000,
    0x4340_0000_0000_0000,
    0x3ff0_0000_0000_0000,
];
const WORLD_OWNER: [u64; 2] = [1, 1];

pub(crate) fn run() -> Check {
    let case = &crate::literal_cases::CASES[39];
    assert_eq!(case.index, 39);
    assert_eq!(case.class, CaseClass::TestOnlyHelper);
    assert_eq!(case.steps.len(), 1);
    assert!(case.actions.is_empty() && case.injections.is_empty());
    let expected = &case.steps[0];
    assert_eq!(expected.trace.len(), 20);
    assert_eq!(expected.dynamic_generation, Presence::Absent);
    assert!(expected.action.is_none());
    assert!(expected.states.is_empty() && expected.state_references.is_empty());
    assert!(expected.projections.is_empty() && expected.projection_diagnostics.is_empty());
    assert_eq!(expected.controller, Presence::Unspecified);
    assert_eq!(expected.first_failure, Presence::Unspecified);
    assert_eq!(expected.projection_position, Presence::Unspecified);
    assert_eq!(expected.culling, Presence::Unspecified);
    assert!(expected.request_generation.is_none() && expected.derived_token.is_none());
    assert!(expected.no_committed_snapshot.is_none() && !expected.committed_absent);
    assert!(
        expected.traversal_storage_slots.is_none() && expected.accumulator_before_branch.is_none()
    );
    assert!(
        expected.parameter_destination_ids.is_none() && expected.bone_destination_ids.is_none()
    );

    let context = Context { case: 39, step: 0 };
    // Exact finite helper ceiling: 20 rows. All allocation/capacity setup ends
    // before arming; output is six raw words, with no owned candidate/commit.
    let mut trace = [TraceRecord::EMPTY; 20];
    let mut projection = [ProjectionRecord::EMPTY; 6];
    let mut observer = Observer::recording_with_projections(&mut trace, &mut projection);
    let guard = Guard::arm();
    let result = crate::derived::test_world_affine(PARENT, CHILD, WORLD_OWNER, &mut observer);
    let allocation = guard.finish();
    context.word(220, 0, 0, allocation.count as u64)?;
    context.word(
        220,
        1,
        allocation.pages_before as u64,
        allocation.pages_after as u64,
    )?;
    let status = result
        .as_ref()
        .map_or_else(|e| e.load_status() as u32, |_| 0);
    context.word(221, 0, u64::from(expected.status), u64::from(status))?;
    compare::trace(&context, expected.trace, observer.records())?;
    compare::projections(&context, expected.projections, observer.projections())?;
    context.word(222, 0, 0, u64::from(observer.controller().is_some()))?;
    let actual = result.expect("frozen successful affine helper");
    crate::state_checks::check_helper_result(&context, expected, &actual)
}

#[test]
fn fixed_affine_helper_case_39() {
    run().unwrap();
}
