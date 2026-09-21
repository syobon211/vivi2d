// Shared native/WASM compound route; all materialization/snapshots outside guard.
use crate::compare::{self,Check,Context};
use crate::derived_candidate::{lower_derived_evaluation_observed,EvaluationDerivedCandidateV1};
use crate::literal_types::{ActionExpected,CaseExpected,CaseClass};
use crate::observation::{Observer,ProjectionRecord,TraceRecord};
use crate::state_checks::{self,CapturedState};
pub(crate) fn eligible(c:&CaseExpected)->bool{
    matches!(c.class,CaseClass::PublicInputOrRawApi|CaseClass::PublicControlBranchInapplicable|CaseClass::TypedOrTrustedInjection)
}
pub(crate) fn run(case:&CaseExpected)->Check{
    run_inner(case,Negative::None,false,false)
}
#[derive(Clone,Copy,PartialEq)]
enum Negative { None, TraceWord, InitialUv }
pub(crate) fn negative_comparison()->Check{
    let case=&crate::literal_cases::CASES[19];
    let words=run_inner(case,Negative::TraceWord,false,false).expect_err("changed comparison word must fail actual compound route");
    let actual=case.steps[0].trace[0].result;
    let expected=actual^1;
    assert_eq!(words,[19,0,6,0,expected as u32,(expected>>32)as u32,actual as u32,(actual>>32)as u32]);
    let words=run_inner(&crate::literal_cases::CASES[139],Negative::InitialUv,false,false)
        .expect_err("changed post-initial UV snapshot must fail fixed C9 baseline comparison");
    assert_eq!(&words[..3],&[139,0,151]);
    assert_eq!(&words[4..],&[1,0,0,0]);
    Ok(())
}
pub(crate) fn reuse_checks()->Check{
    let descriptor=&crate::literal_cases::CASES[43];
    assert_eq!(descriptor.class,CaseClass::AllocationReuse);
    assert!(descriptor.steps.is_empty());
    assert_eq!(crate::literal_controls::F43_REUSED_CASE_INDICES.len(),8);
    for index in crate::literal_controls::F43_REUSED_CASE_INDICES{
        let case=&crate::literal_cases::CASES[*index as usize];
        assert!(!case.steps.is_empty(),"F43 reuses real initial/update cases, not an empty descriptor");
        run(case)?;
    }
    Ok(())
}
pub(crate) fn exhaustion_control(projection:bool){
    let case=&crate::literal_cases::CASES[if projection{142}else{19}];
    // Returning (even with a comparison failure) must make the caller's
    // expected-trap assertion fail. Only the observer may trigger this trap.
    let _=run_inner(case,Negative::None,!projection,projection);
}
fn run_inner(case:&CaseExpected,negative:Negative,empty_trace:bool,empty_projection:bool)->Check{
    assert!(eligible(case),"compound route only");
    let ids=crate::identity_setup::IDENTITIES[case.index as usize];
    let mut current:Option<EvaluationDerivedCandidateV1>=None;
    let mut history=Vec::with_capacity(case.steps.len());
    let mut trace=vec![TraceRecord::EMPTY;if empty_trace{0}else{28691}];
    let mut projections=[ProjectionRecord::EMPTY;6];
    for(step_index,step)in case.steps.iter().enumerate(){
        let mut observer=Observer::recording_with_projections(&mut trace,if empty_projection{&mut projections[..0]}else{&mut projections});
        let c=Context{case:case.index,step:step_index as u32};
        let action=step.action.unwrap_or_else(||case.actions[step.action_index as usize]);
        let mut before=None;
        let mut initial_baseline=None;
        let(status,error,observed,prefix)=match action{
            ActionExpected::Construct{request_generation}=>{
                assert!(current.is_none());
                let(generation,candidate,plan,prefix,baseline)=crate::route_setup::prepare(case.index,request_generation);
                initial_baseline=Some(baseline);
                let guard=crate::allocation_guard::Guard::arm();
                let result=lower_derived_evaluation_observed(generation,candidate,plan,&mut observer);
                let observed=guard.finish();
                let(status,error)=match result{Ok(v)=>{current=Some(v);(0,None)},Err(e)=>(e.load_status()as u32,Some(e.kind()))};
                (status,error,observed,prefix)
            },
            _=>{
                let owner=current.as_mut().expect("existing owner");
                crate::injections::before_action(owner,step.action_index,case.injections);
                let snapshot=CapturedState::capture(&owner.foundation,Some(owner.dynamic_generation()));
                state_checks::before_action(&c,case.index,step.action_index,&snapshot,ids)?;
                before=Some(snapshot);
                let guard=crate::allocation_guard::Guard::arm();
                let result=match action{
                    ActionExpected::SetInput{id,bits}=>owner.set_input(id,bits),
                    ActionExpected::Update{delta_bits}=>owner.update_observed(delta_bits,&mut observer),
                    ActionExpected::ApplyPreset{id}=>owner.apply_preset(id),
                    _=>unreachable!("compound action"),
                };
                let observed=guard.finish();
                let(status,error)=result.map_or_else(|e|(e.status()as u32,e.test_cause()),|()|(0,None));
                (status,error,observed,Vec::new())
            }
        };
        c.word(70,0,prefix.len()as u64,observed.count as u64)?;
        for(i,(bytes,align))in prefix.iter().enumerate(){
            c.word(71,i,*bytes as u64,observed.sizes[i]as u64)?;
            c.word(72,i,*align as u64,observed.aligns[i]as u64)?;
        }
        #[cfg(target_arch="wasm32")]
        c.word(73,0,observed.pages_before as u64,observed.pages_after as u64)?;
        c.word(20,0,step.status as u64,status as u64)?;
        if negative==Negative::TraceWord&&step_index==0{
            // Deliberately change one COPIED expectation only. Original immutable
            // words and actual source/results remain untouched. Outside guard.
            let mut changed=step.trace.to_vec();
            changed[0].result^=1;
            compare::trace(&c,&changed,observer.records())?;
        }else{compare::trace(&c,step.trace,observer.records())?;}
        if crate::projection_scope::declared(case.index,step_index as u32){compare::projections(&c,step.projections,observer.projections())?;}
        let mut post=current.as_ref().map(|v|CapturedState::capture(&v.foundation,Some(v.dynamic_generation())));
        if let(Some(b),Some(a))=(&initial_baseline,&mut post){
            if negative==Negative::InitialUv{
                // Deliberately corrupt only a detached actual snapshot. The
                // frozen baseline and real candidate remain untouched.
                a.plan.direct_uvs[0].bits^=1;
            }
            state_checks::immutable(&c,b,a)?;
        }
        if let(Some(b),Some(a))=(&before,&post){state_checks::transition(&c,b,a,action,status)?;}
        if matches!(action,ActionExpected::Construct{..}){if let Some(a)=&post{state_checks::case_scope(&c,case.index,a,ids)?;}}
        // Primary constructor consumes its state on failure. The separate witness
        // invokes actual evaluate_initial once on the same admitted/injected input;
        // it is never reported as a returned candidate or a committed snapshot.
        let failed_scratch=if post.is_none()&&(!step.states.is_empty()||step.request_generation.is_some()){
            let ActionExpected::Construct{request_generation}=action else{panic!("initial scratch")};
            let mut foundation=crate::route_setup::companion(case.index,request_generation);
            let mut rows=vec![TraceRecord::EMPTY;28691];
            let mut projections=[ProjectionRecord::EMPTY;6];
            let mut witness=Observer::recording_with_projections(&mut rows,&mut projections);
            let guard=crate::allocation_guard::Guard::arm();
            let result=crate::derived::evaluate_initial(&mut foundation.reservation_plan,&mut witness);
            let allocation=guard.finish();
            c.word(74,0,0,allocation.count as u64)?;
            c.word(74,1,allocation.pages_before as u64,allocation.pages_after as u64)?;
            c.word(75,0,status as u64,result.as_ref().map_or_else(|e|e.load_status()as u64,|_|0))?;
            c.word(75,1,1,u64::from(result.err().map(|e|e.kind())==error))?;
            compare::trace(&c,step.trace,witness.records())?;
            if crate::projection_scope::declared(case.index,step_index as u32){compare::projections(&c,step.projections,witness.projections())?;}
            Some(CapturedState::capture(&foundation,None))
        }else{None};
        state_checks::step(&c,step,action,status,post.as_ref(),before.as_ref(),&history,failed_scratch.as_ref(),ids,&observer,error)?;
        history.push(post);
    }
    Ok(())
}

#[test]
fn explicit_reuse_and_actual_compound_negative_controls(){
    reuse_checks().unwrap();
    negative_comparison().unwrap();
}

#[test]
fn observer_capacity_exhaustion_is_not_a_silent_pass(){
    for projection in [false,true]{
        let error=std::panic::catch_unwind(||exhaustion_control(projection)).unwrap_err();
        let message=error.downcast_ref::<&str>().copied().or_else(||error.downcast_ref::<String>().map(String::as_str)).expect("fixed panic text");
        assert_eq!(message,if projection{"C10 test projection capacity exhausted"}else{"C10 test trace capacity exhausted"});
    }
}
