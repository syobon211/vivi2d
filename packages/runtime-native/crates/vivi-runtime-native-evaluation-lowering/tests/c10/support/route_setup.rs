use vivi_runtime_native_preactivation::{AssetRef,Digest,EvaluationTextureBindingV1,EvaluationTexturePlanV1,StorageKind,ValidatedEvaluationPayloadV1,parse_evaluation_payload_v1};
pub(crate) fn prepare(index:u32,generation:Option<u64>)->(u64,ValidatedEvaluationPayloadV1,EvaluationTexturePlanV1,Vec<(usize,usize)>,crate::state_checks::CapturedState){
    let(generation,candidate,plan)=prepare_inputs(index,generation);
    let prefix=expected_prefix(index);
    let(_,baseline_candidate,baseline_plan)=prepare_inputs(index,Some(generation));
    let mut foundation=crate::frozen_c9::materialize_case_foundation(index,baseline_candidate,baseline_plan).expect("frozen initial identity baseline");
    crate::injections::before_initial(&mut foundation.reservation_plan,crate::literal_cases::CASES[index as usize].injections);
    let baseline=crate::state_checks::CapturedState::capture(&foundation,None);
    crate::C10_CASE.with(|c|{assert!(c.get().is_none());c.set(Some(index));});
    (generation,candidate,plan,prefix,baseline)
}
pub(crate) fn prepare_inputs(index:u32,generation:Option<u64>)->(u64,ValidatedEvaluationPayloadV1,EvaluationTexturePlanV1){
    let all:serde_json::Value=serde_json::from_slice(include_bytes!(concat!(env!("C10_GENERATED_DIR"), "/resolved-case-inputs.json"))).unwrap();
    let input=&all[index as usize];
    let generation=generation.unwrap_or_else(||input["callerGenerationU64"].as_str().unwrap().parse().unwrap());
    let candidate=parse_evaluation_payload_v1(input["payloadUtf8"].as_str().unwrap().as_bytes(),generation).unwrap();
    let digest=Digest::from_bytes([7;Digest::LENGTH]);
    let plan=EvaluationTexturePlanV1{schema:"vivi2d.evaluationTexturePlan.v1".to_owned(),textures:candidate.texture_bindings().iter().map(|b|EvaluationTextureBindingV1{id:b.id().to_owned(),asset:AssetRef{object_address:digest,storage_kind:StorageKind::Blob,content_sha256:digest,media_type:"image/png".to_owned(),size_bytes:0},width:b.width(),height:b.height(),media_type:"image/png".to_owned(),color_space:"srgb".to_owned(),alpha_mode:"straight".to_owned()}).collect()};
    (generation,candidate,plan)
}
pub(crate) fn companion(index:u32,requested:Option<u64>)->crate::EvaluationLoweringFoundationV1{
    let(generation,candidate,plan)=prepare_inputs(index,requested);
    let mut foundation=crate::lower::lower_evaluation_foundation_v1(generation,candidate,plan).expect("admitted companion C9");
    crate::injections::before_initial(&mut foundation.reservation_plan,crate::literal_cases::CASES[index as usize].injections);
    foundation
}
fn expected_prefix(index:u32)->Vec<(usize,usize)>{
    let setup=crate::frozen_c9::materialize_case_plan(index).expect("frozen admitted C9");
    let mut prefix=Vec::with_capacity(39);
    fn push<T>(out:&mut Vec<(usize,usize)>,v:&[T]){if !v.is_empty(){let layout=std::alloc::Layout::array::<T>(v.len()).unwrap();out.push((layout.size(),layout.align()));}}
    macro_rules! fields{($($f:ident),+)=>{$(push(&mut prefix,&setup.$f);)+}}
    // Exact 39-site order from the pinned C9 reserve_all_with_state function.
    // Counts are setup INPUT lengths, not observed candidate allocations.
    fields!(direct_mesh_records,direct_unskinned_vertices,direct_uvs,direct_indices,parameter_symbol_bytes,parameter_specs,parameter_preset_specs,parameter_preset_values,binding_specs,binding_points,binding_targets,bone_specs,bone_world_order_slots,mesh_evaluator_specs,skin_mesh_specs,physics_pendulum_configs,physics_inputs,physics_outputs,ik_constraints,skin_weight_rows,skin_weights,skin_bind_inverses,skin_rest_coordinates,parameter_current,parameter_previous,parameter_update,parameter_staged_destinations,binding_accumulators,bone_committed_overrides,bone_update_overrides,bone_staged_destinations,physics_committed_pendulums,physics_update_pendulums,world_pre,world_post,ik_scratch,skin_skinned_scratch,derived_committed_coordinates,derived_update_coordinates);
    prefix
}

#[test]
fn shared_full_native_route_includes_exact_c9_prefix_state_and_zero_update_allocations(){
    let cases:Vec<_>=crate::literal_cases::CASES.iter().filter(|c|crate::shared_route::eligible(c)).collect();
    assert_eq!(cases.len(),137);
    for case in cases{crate::shared_route::run(case).unwrap();}
}
