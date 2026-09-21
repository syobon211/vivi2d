// These six cases are native prerequisite evidence, never WASM numerical passes.
#[test]
fn actual_native_payload_denials_and_c9_denial_precede_all_c10(){
    use crate::{allocation_guard::Guard,compare::Context,literal_types::InjectionValue,observation::{Observer,TraceRecord,ProjectionRecord}};
    let all:serde_json::Value=serde_json::from_slice(include_bytes!(concat!(env!("C10_GENERATED_DIR"), "/resolved-case-inputs.json"))).unwrap();
    for index in [91,92,93,94,95]{
        let case=&crate::literal_cases::CASES[index];
        let expected=&case.steps[0];
        let input=&all[index];
        let generation=input["callerGenerationU64"].as_str().unwrap().parse().unwrap();
        let result=vivi_runtime_native_preactivation::parse_evaluation_payload_v1(input["payloadUtf8"].as_str().unwrap().as_bytes(),generation);
        let error=result.expect_err("frozen invalid payload must not enter C9");
        Context{case:index as u32,step:0}.word(20,0,expected.status as u64,error.status()as u64).unwrap();
        assert_eq!(expected.derived_token,Some(false));assert_eq!(expected.no_committed_snapshot,Some(true));
    }
    let case=&crate::literal_cases::CASES[35];
    let(generation,candidate,plan)=crate::route_setup::prepare_inputs(35,None);
    let InjectionValue::ReservationDenial{site,owner,ordinal,additional}=case.injections[0].value else{panic!("fixed denial")};
    crate::C9_DENIAL.with(|d|d.set(Some(crate::reservation::ReservationDenialKeyV1{site_template_id:site,owner_slot:owner,attempt_ordinal:ordinal,additional_count:additional})));
    let mut trace=[TraceRecord::EMPTY;1];let mut projections=[ProjectionRecord::EMPTY;1];
    let mut observer=Observer::recording_with_projections(&mut trace,&mut projections);
    let guard=Guard::arm();
    let result=crate::derived_candidate::lower_derived_evaluation_observed(generation,candidate,plan,&mut observer);
    let allocations=guard.finish();
    let error=result.expect_err("first frozen reservation denied");
    assert_eq!(error.load_status(),case.steps[0].status as i32);
    assert_eq!(allocations.count,0);assert!(observer.records().is_empty());assert!(observer.projections().is_empty());
    assert!(crate::C9_DENIAL.with(|d|d.get()).is_none());
}
