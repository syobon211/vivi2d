use super::*;
use crate::lower::{EvaluationPreflightV1, preflight_correlated};
use crate::observation::{Observer, TraceRecord};
use crate::reservation::ReservationStateV1;
use crate::sealed_candidate::seal_preflighted;
use crate::topology_reservation::{SITE_IDS, TopologyCountsV1, leaf_counts};
use crate::{SealedEvaluationCandidateV1, lower_sealed_evaluation_v1};

fn mixed() -> Value {
    let mut value = base_payload();
    value["parameters"] = json!([]);
    value["layers"] = json!([
        mesh_layer("mA", "normal"),
        mesh_layer("s0", "normal"),
        mesh_layer("s1", "normal"),
        mesh_layer("s2", "normal")
    ]);
    value["layers"][0]["clipMasks"] = json!([
        {"layerId":"s0","invert":false}, {"layerId":"s1","invert":true}, {"layerId":"s2","invert":false}
    ]);
    for slot in 1..4 {
        value["layers"][slot]["visible"] = json!(false);
    }
    value["atlases"][0]["width"] = json!(4);
    value["atlases"][0]["entries"] = json!([
        {"layerId":"mA","x":0,"y":0,"width":1,"height":1},
        {"layerId":"s0","x":1,"y":0,"width":1,"height":1},
        {"layerId":"s1","x":2,"y":0,"width":1,"height":1},
        {"layerId":"s2","x":3,"y":0,"width":1,"height":1}
    ]);
    value
}

fn preflight(value: &Value) -> EvaluationPreflightV1 {
    let (candidate, plan) = candidate_and_plan(value, 5);
    preflight_correlated(correlate_evaluation_activation_v1(5, candidate, plan).unwrap()).unwrap()
}

fn sealed(value: &Value) -> SealedEvaluationCandidateV1 {
    let (candidate, plan) = candidate_and_plan(value, 5);
    lower_sealed_evaluation_v1(5, candidate, plan).unwrap()
}

#[test]
fn mixed_exact_public_census_and_complete_ordered_invert_commands() {
    let value = mixed();
    let p = preflight(&value);
    assert_eq!(p.site_counts.total_logical_bytes(), 688);
    let mut exact = [0; 39];
    for (slot, count) in [(0, 4), (1, 24), (2, 24), (3, 12), (13, 4)] {
        exact[slot] = count;
    }
    assert_eq!(*p.site_counts.ordered_counts(), exact);
    let counts = TopologyCountsV1::census(p.candidate.value(), &p.site_counts).unwrap();
    assert_eq!(counts.counts, [8, 4, 3, 4, 68]);
    assert_eq!(counts.combined_bytes, 2512);
    let mut storage = [TraceRecord::EMPTY; 1];
    let mut observer = Observer::recording(&mut storage);
    let model = seal_preflighted(p, &mut ReservationStateV1::production(), &mut observer).unwrap();
    assert!(
        observer.records().is_empty(),
        "direct-only construction needs no arithmetic"
    );
    assert_eq!(
        model.draw_commands().collect::<Vec<_>>(),
        [
            [24, 2, 1, 1, 0, 0],
            [24, 2, 2, 2, 1, 0],
            [24, 2, 3, 3, 0, 0],
            [24, 1, 0, 3, 0, 0],
            [24, 3, 0, 2, 0, 0],
            [24, 3, 0, 1, 0, 0],
            [24, 3, 0, 0, 0, 0],
        ]
    );
    assert_eq!(model.required_render_features(), 1);
    assert_eq!(model.mesh_snapshot(0).unwrap().unwrap().id(), "mA");
    let hidden = model.mesh_snapshot(1).unwrap().unwrap();
    assert_eq!(hidden.id(), "s0");
    assert!(!hidden.visible());
    assert!(model.mesh_snapshot(4).unwrap().is_none());
}

#[test]
fn storage_leaf_policy_and_combined_resource_boundary_do_not_validate_schema() {
    // Unicode is deliberately a census leaf only, not public schema admission.
    let layer = json!({"id":"m漢","clipMaskIds":[null,7],"clipMasks":[false]});
    assert_eq!(leaf_counts(layer.as_object().unwrap()).unwrap(), (4, 3));
    let c = TopologyCountsV1::checked(5, 2, 3, 344).unwrap();
    assert_eq!(c.combined_bytes, 1269);
    for layer in [
        json!({}),
        json!({"id":7,"clipMaskIds":false}),
        json!({"id":null,"clipMasks":null}),
    ] {
        assert_eq!(leaf_counts(layer.as_object().unwrap()).unwrap(), (0, 0));
    }
    assert_eq!(
        TopologyCountsV1::checked(0, 0, 0, 0x7fff_ffff)
            .unwrap()
            .combined_bytes,
        0x7fff_ffff
    );
    for result in [
        TopologyCountsV1::checked(1, 0, 0, 0x7fff_ffff),
        TopologyCountsV1::checked(0, u32::MAX, 0, 0),
        TopologyCountsV1::checked(0, 0, u32::MAX, 0),
        TopologyCountsV1::checked(0, 0, 0, u64::MAX),
    ] {
        assert_eq!(result.err().unwrap().load_status(), 6);
    }
}

#[test]
fn every_new_denial_precedes_math_and_exact_count_controls_matching() {
    for (index, count) in [8, 4, 3, 4, 68].into_iter().enumerate() {
        let p = preflight(&mixed());
        let mut storage = [TraceRecord::EMPTY; 1];
        let mut observer = Observer::recording(&mut storage);
        let mut state = ReservationStateV1::with_denial(ReservationDenialKeyV1 {
            site_template_id: SITE_IDS[index],
            owner_slot: None,
            attempt_ordinal: 5 + index as u32,
            additional_count: count,
        });
        assert_eq!(
            seal_preflighted(p, &mut state, &mut observer)
                .unwrap_err()
                .load_status(),
            6
        );
        assert!(observer.records().is_empty());
    }
    let mut state = ReservationStateV1::with_denial(ReservationDenialKeyV1 {
        site_template_id: SITE_IDS[2],
        owner_slot: None,
        attempt_ordinal: 7,
        additional_count: 2,
    });
    assert!(seal_preflighted(preflight(&mixed()), &mut state, &mut Observer::silent()).is_ok());
    let mut empty = mixed();
    empty["layers"] = json!([]);
    empty["atlases"] = json!([]);
    let mut state = ReservationStateV1::with_denial(ReservationDenialKeyV1 {
        site_template_id: SITE_IDS[0],
        owner_slot: None,
        attempt_ordinal: 0,
        additional_count: 0,
    });
    let m = seal_preflighted(preflight(&empty), &mut state, &mut Observer::silent()).unwrap();
    assert_eq!(m.mesh_count(), 0);
    assert_eq!(m.draw_commands().len(), 0);
}

#[test]
fn payload_slots_and_draw_ties_are_independent_of_texture_order() {
    let mut value = mixed();
    value["layers"].as_array_mut().unwrap().truncate(2);
    value["atlases"][0]["entries"]
        .as_array_mut()
        .unwrap()
        .truncate(2);
    value["layers"][0]
        .as_object_mut()
        .unwrap()
        .remove("clipMasks");
    value["layers"][1]["visible"] = json!(true);
    value["layers"][0]["drawOrder"] = json!(700);
    value["layers"][1]["drawOrder"] = json!(-2);
    let mut group = group_layer("group", "normal");
    group["children"] = json!([value["layers"][1].clone()]);
    value["layers"] = json!([value["layers"][0].clone(), group]);
    let mut lower_atlas = value["atlases"][0].clone();
    lower_atlas["id"] = json!("A");
    lower_atlas["entries"] = json!([value["atlases"][0]["entries"][1].clone()]);
    value["atlases"][0]["id"] = json!("a");
    value["atlases"][0]["entries"] = json!([value["atlases"][0]["entries"][0].clone()]);
    value["atlases"].as_array_mut().unwrap().push(lower_atlas);
    let m = sealed(&value);
    assert_eq!(m.mesh_snapshot(0).unwrap().unwrap().id(), "mA");
    assert_eq!(m.mesh_snapshot(0).unwrap().unwrap().texture_slot(), 1);
    assert_eq!(m.mesh_snapshot(1).unwrap().unwrap().texture_slot(), 0);
    assert_eq!(
        m.draw_commands().collect::<Vec<_>>(),
        [[24, 1, 1, 0, 0, 0], [24, 1, 0, 0, 0, 0]]
    );
    value["layers"][0]["drawOrder"] = json!(-2);
    assert_eq!(
        sealed(&value)
            .draw_commands()
            .map(|r| r[2])
            .collect::<Vec<_>>(),
        [0, 1]
    );
}

#[test]
fn eight_nested_masks_validate_invisible_dependencies_and_full_command_balance() {
    let mut value = base_payload();
    value["parameters"] = json!([]);
    for index in 0..8 {
        add_mesh(&mut value, &format!("m{index}"), "normal");
    }
    for index in 0..8 {
        value["layers"][index]["clipMaskIds"] = json!([format!("m{index}")]);
        if index != 0 {
            value["layers"][index]["visible"] = json!(false);
        }
    }
    value["layers"][8]["visible"] = json!(false);
    let model = sealed(&value);
    let commands: Vec<_> = model.draw_commands().collect();
    assert_eq!(commands.len(), 17);
    for (i, row) in commands[..8].iter().enumerate() {
        assert_eq!(*row, [24, 2, 8 - i as u32, i as u32 + 1, 0, 0]);
    }
    assert_eq!(commands[8], [24, 1, 0, 8, 0, 0]);
    for (i, row) in commands[9..].iter().enumerate() {
        assert_eq!(*row, [24, 3, 0, 7 - i as u32, 0, 0]);
    }
}

fn case139() -> Value {
    serde_json::from_slice(include_bytes!("../../fixtures/c11-case139-topology.json")).unwrap()
}
fn hex64(v: &Value) -> u64 {
    u64::from_str_radix(v.as_str().unwrap(), 16).unwrap()
}

#[test]
fn all_six_deferred_case139_topology_selectors_and_real_rollback_are_bound() {
    let fixture = case139();
    assert_eq!(
        fixture["sourcePins"][1]["sha256"],
        "fff9407640e4f345e4a1b7c793cf74729ea5a285fb62f48188f0a2d2e5b97d77"
    );
    let raw = fixture["payloadUtf8"].as_str().unwrap();
    assert_eq!(
        format!("{:x}", Sha256::digest(raw.as_bytes())),
        fixture["payloadSha256"].as_str().unwrap()
    );
    let value: Value = serde_json::from_str(raw).unwrap();
    let mut rows = [TraceRecord::EMPTY; 160];
    let mut observer = Observer::recording(&mut rows);
    let mut model = seal_preflighted(
        preflight(&value),
        &mut ReservationStateV1::production(),
        &mut observer,
    )
    .unwrap();
    assert_eq!(
        observer.records().len(),
        114,
        "one actual initial evaluation, not update(0)"
    );
    let original_commands = model.draw_commands().collect::<Vec<_>>();
    for step in fixture["steps"].as_array().unwrap() {
        let mut trace = [TraceRecord::EMPTY; 160];
        let mut observer = Observer::recording(&mut trace);
        let status = match step["operation"].as_str().unwrap() {
            "construct-initial" => 0,
            "set_input" => model
                .set_input(
                    step["parameterId"].as_str().unwrap(),
                    hex64(&step["valueD64Bits"]),
                )
                .map_or_else(|e| e.status(), |()| 0),
            "update" => model
                .derived
                .update_observed(hex64(&step["deltaD64Bits"]), &mut observer)
                .map_or_else(|e| e.status(), |()| 0),
            _ => panic!("unhandled frozen action"),
        };
        assert_eq!(
            status,
            i32::try_from(step["status"].as_i64().unwrap()).unwrap()
        );
        if step["operation"] != "construct-initial" {
            assert_eq!(
                observer.records().len(),
                step["primitiveRowCount"].as_u64().unwrap() as usize
            );
        }
        assert_eq!(
            model.topology_generation().to_string(),
            step["topologyGenerationU64"].as_str().unwrap()
        );
        assert_eq!(
            model.dynamic_generation().to_string(),
            step["dynamicGenerationU64"].as_str().unwrap()
        );
        for slot in 0..2 {
            let p = model.parameter_snapshot(slot).unwrap().unwrap();
            assert_eq!(p.current_bits(), hex64(&step["callerCurrentD64Bits"][slot]));
            assert_eq!(
                p.evaluated_bits(),
                hex64(&step["parameterPreviousD64Bits"][slot])
            );
        }
        assert_eq!(
            model
                .mesh_snapshot(0)
                .unwrap()
                .unwrap()
                .vertex_bits()
                .collect::<Vec<_>>(),
            step["vertexD32Bits"]
                .as_array()
                .unwrap()
                .iter()
                .map(|v| u32::from_str_radix(v.as_str().unwrap(), 16).unwrap())
                .collect::<Vec<_>>()
        );
        assert_eq!(
            model.mesh_snapshot(0).unwrap().unwrap().translation_bits(),
            [0, 0]
        );
        assert_eq!(model.draw_commands().collect::<Vec<_>>(), original_commands);
    }
}

#[test]
fn queries_fail_closed_on_trusted_ranges_and_redact_values() {
    let mut model = sealed(&mixed());
    let debug = format!("{model:?} {:?}", model.mesh_snapshot(0).unwrap().unwrap());
    for marker in ["mA", "atlas:", "070707", "vertex_bits", "srgb"] {
        assert!(!debug.contains(marker));
    }
    model.topology.meshes[0].id.len = u32::MAX;
    let e = model.mesh_snapshot(0).unwrap_err();
    assert_eq!(e.load_status(), 10);
    assert!(!format!("{e:?} {e}").contains("mA"));
    let mut model = sealed(&mixed());
    model.derived.foundation.reservation_plan.direct_indices[0].value = u32::MAX;
    assert_eq!(model.mesh_snapshot(0).unwrap_err().load_status(), 10);
}

#[test]
fn same_count_trusted_mask_leaf_runs_after_actual_initial_numeric_failure() {
    use crate::sealed_candidate::seal_with_topology_input_for_test;
    for numeric_fault in [false, true] {
        let fixture = case139();
        let mut value: Value =
            serde_json::from_str(fixture["payloadUtf8"].as_str().unwrap()).unwrap();
        for id in ["s0", "s1", "s2"] {
            add_mesh(&mut value, id, "normal");
        }
        value["layers"][0]["clipMasks"] = json!([
            {"layerId":"s0","invert":false},{"layerId":"s1","invert":true},{"layerId":"s2","invert":false}
        ]);
        if numeric_fault {
            value["parameters"][1]["defaultValue"] = json!(1);
        }
        let p = preflight(&value);
        let mut injected = p.candidate.value().clone();
        let original = injected["layers"][0]["clipMasks"][1].clone();
        injected["layers"][0]["clipMasks"][1] = json!(false);
        assert_eq!(
            TopologyCountsV1::census(&injected, &p.site_counts)
                .unwrap()
                .counts,
            TopologyCountsV1::census(p.candidate.value(), &p.site_counts)
                .unwrap()
                .counts
        );
        let mut restored = injected.clone();
        restored["layers"][0]["clipMasks"][1] = original;
        assert_eq!(
            &restored,
            p.candidate.value(),
            "only one topology leaf differs; real admitted C9 input/counts are unchanged"
        );
        let mut trace = [TraceRecord::EMPTY; 160];
        let mut observer = Observer::recording(&mut trace);
        let error = seal_with_topology_input_for_test(
            p,
            &mut ReservationStateV1::production(),
            &mut observer,
            &injected,
        )
        .unwrap_err();
        assert!(
            !observer.records().is_empty(),
            "actual C10 runs, never a mock error"
        );
        assert_eq!(error.load_status(), if numeric_fault { 14 } else { 10 });
        if numeric_fault {
            assert_eq!(error.kind(), EvaluationLoweringErrorKind::NumericOverflow);
        } else {
            assert_eq!(observer.records().len(), 114);
        }
    }
}

fn trusted_topology(
    base: &Value,
    override_value: &Value,
) -> Result<crate::topology::TopologyV1, crate::EvaluationLoweringError> {
    // Only topology is under test: original public C9/C10 admission is separate.
    // The override is never parsed as an allegedly valid public payload.
    let p = preflight(base);
    let counts = TopologyCountsV1::census(override_value, &p.site_counts)?;
    let (candidate, plan) = candidate_and_plan(base, 5);
    let derived = crate::lower_derived_evaluation_v1(5, candidate, plan)?;
    counts
        .reserve(&mut ReservationStateV1::production())?
        .fill_from_value(&derived.foundation, override_value)
}

#[test]
fn duplicate_edges_are_a_trusted_topology_witness_not_public_admission() {
    let mut base = base_payload();
    base["parameters"] = json!([]);
    base["layers"][0]["id"] = json!("mA");
    base["atlases"][0]["entries"][0]["layerId"] = json!("mA");
    add_mesh(&mut base, "s", "normal");
    base["layers"][1]["visible"] = json!(false);
    base["layers"][0]["clipMasks"] = json!([{"layerId":"s","invert":true}]);
    let mut injected = base.clone();
    injected["layers"][0]["clipMasks"] = json!([
        {"layerId":"s","invert":false},{"layerId":"s","invert":true},{"layerId":"s","invert":false}
    ]);
    assert!(parse_evaluation_payload_v1(&serde_json::to_vec(&injected).unwrap(), 5).is_err());
    let p = preflight(&base);
    assert_eq!(p.site_counts.total_logical_bytes(), 344);
    let counts = TopologyCountsV1::census(&injected, &p.site_counts).unwrap();
    assert_eq!(counts.counts, [3, 2, 3, 2, 34]);
    assert_eq!(counts.combined_bytes, 1267);
    let topology = trusted_topology(&base, &injected).unwrap();
    assert_eq!(
        topology
            .commands
            .iter()
            .map(|v| v.words)
            .collect::<Vec<_>>(),
        [
            [24, 2, 1, 1, 0, 0],
            [24, 2, 1, 2, 1, 0],
            [24, 2, 1, 3, 0, 0],
            [24, 1, 0, 3, 0, 0],
            [24, 3, 0, 2, 0, 0],
            [24, 3, 0, 1, 0, 0],
            [24, 3, 0, 0, 0, 0],
        ]
    );
}

#[test]
fn trusted_cycle_chain9_and_sibling9_fail_without_conflating_duplicates() {
    let mut base = base_payload();
    base["parameters"] = json!([]);
    for index in 0..9 {
        add_mesh(&mut base, &format!("m{index}"), "normal");
    }
    for shape in [0, 1, 2] {
        let mut injected = base.clone();
        match shape {
            0 => {
                injected["layers"][0]["clipMaskIds"] = json!(["m0"]);
                injected["layers"][1]["clipMaskIds"] = json!(["mesh"]);
            }
            1 => {
                for index in 0..9 {
                    injected["layers"][index]["clipMaskIds"] = json!([format!("m{index}")]);
                }
            }
            _ => {
                injected["layers"][0]["clipMaskIds"] =
                    json!((0..9).map(|i| format!("m{i}")).collect::<Vec<_>>());
            }
        }
        injected["layers"][0]["visible"] = json!(false);
        assert_eq!(
            trusted_topology(&base, &injected)
                .err()
                .unwrap()
                .load_status(),
            10
        );
    }
}
