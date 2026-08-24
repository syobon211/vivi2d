#![cfg(not(target_arch = "wasm32"))]

// Native-only allocator-observation evidence. This makes no dependency-wide
// no-allocation, recoverable process-OOM, product-WASM, or host-run claim.

use std::alloc::{GlobalAlloc, Layout, System};
use std::cell::Cell;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};

use serde_json::{Map, Value, json};
use vivi_runtime_native_evaluation_lowering::lower_evaluation_foundation_v1;
use vivi_runtime_native_preactivation::{
    AssetRef, Digest, EvaluationTextureBindingV1, EvaluationTexturePlanV1, StorageKind,
    ValidatedEvaluationPayloadV1, parse_evaluation_payload_v1,
};

// Integration dependencies build the library without cfg(test). Compile the
// actual low-level sources once more in this test crate so the frozen exact
// denial tuple seam is enabled, while the public-entry observation below still
// calls the normally built library.
#[allow(dead_code)]
#[path = "../src/error.rs"]
mod error;
#[allow(dead_code)]
#[path = "../src/model.rs"]
mod model;
#[allow(dead_code)]
#[path = "../src/reservation.rs"]
mod reservation;

const GENERATION: u64 = 37;
const RESERVATION_SITE_COUNT: usize = 39;
const PAYLOAD_FIXTURE: &[u8] =
    include_bytes!("../../vivi-runtime-native-evaluation/fixtures/evaluation-payload-v1.json");

// These are the exact Layout::array byte requests for the rich payload below,
// in the frozen allocation-site order. Every logical count is nonzero.
const EXPECTED_RESERVATION_BYTES: [usize; RESERVATION_SITE_COUNT] = [
    160, 24, 48, 24, 29, 80, 16, 32, 32, 48, 48, 128, 8, 64, 40, 24, 48, 48, 48, 24, 96, 112, 48,
    16, 16, 16, 16, 16, 96, 96, 16, 16, 16, 96, 96, 80, 48, 24, 24,
];
const EXPECTED_RESERVATION_ALIGNS: [usize; RESERVATION_SITE_COUNT] = [
    4, 4, 4, 4, 1, 8, 4, 8, 4, 8, 8, 8, 4, 4, 4, 8, 8, 8, 8, 4, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8,
    8, 8, 8, 8, 8, 4, 4,
];
const NO_FAILURE_ORDINAL: usize = usize::MAX;

struct ObservedSystemAllocator;

#[global_allocator]
static GLOBAL_ALLOCATOR: ObservedSystemAllocator = ObservedSystemAllocator;

static TEST_GATE: Mutex<()> = Mutex::new(());
static OBSERVATION_ARMED: AtomicBool = AtomicBool::new(false);
static OBSERVED_ALLOCATIONS: AtomicUsize = AtomicUsize::new(0);
static OBSERVED_AFTER_LAST_RESERVE: AtomicUsize = AtomicUsize::new(0);
static EXPECTED_RESERVATION_ATTEMPTS: AtomicUsize = AtomicUsize::new(RESERVATION_SITE_COUNT);
static FAILURE_ORDINAL: AtomicUsize = AtomicUsize::new(NO_FAILURE_ORDINAL);
static OBSERVED_BYTES: [AtomicUsize; RESERVATION_SITE_COUNT] =
    [const { AtomicUsize::new(0) }; RESERVATION_SITE_COUNT];
static OBSERVED_ALIGNS: [AtomicUsize; RESERVATION_SITE_COUNT] =
    [const { AtomicUsize::new(0) }; RESERVATION_SITE_COUNT];
std::thread_local! {
    static OBSERVING_THREAD: Cell<bool> = const { Cell::new(false) };
}

unsafe impl GlobalAlloc for ObservedSystemAllocator {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        if observe_allocation(layout.size(), layout.align()) {
            return std::ptr::null_mut();
        }
        // SAFETY: this wrapper forwards the unchanged allocation request to
        // the process system allocator.
        unsafe { System.alloc(layout) }
    }

    unsafe fn alloc_zeroed(&self, layout: Layout) -> *mut u8 {
        if observe_allocation(layout.size(), layout.align()) {
            return std::ptr::null_mut();
        }
        // SAFETY: this wrapper forwards the unchanged allocation request to
        // the process system allocator.
        unsafe { System.alloc_zeroed(layout) }
    }

    unsafe fn dealloc(&self, pointer: *mut u8, layout: Layout) {
        // SAFETY: the pointer and layout came from the same system allocator.
        unsafe { System.dealloc(pointer, layout) };
    }

    unsafe fn realloc(&self, pointer: *mut u8, layout: Layout, new_size: usize) -> *mut u8 {
        if observe_allocation(new_size, layout.align()) {
            return std::ptr::null_mut();
        }
        // SAFETY: the pointer and old layout came from the same system
        // allocator, and new_size is forwarded unchanged.
        unsafe { System.realloc(pointer, layout, new_size) }
    }
}

fn observe_allocation(bytes: usize, align: usize) -> bool {
    if !OBSERVATION_ARMED.load(Ordering::Acquire) || !OBSERVING_THREAD.get() {
        return false;
    }
    let ordinal = OBSERVED_ALLOCATIONS.fetch_add(1, Ordering::AcqRel);
    if ordinal < RESERVATION_SITE_COUNT {
        OBSERVED_BYTES[ordinal].store(bytes, Ordering::Release);
        OBSERVED_ALIGNS[ordinal].store(align, Ordering::Release);
    }
    if ordinal >= EXPECTED_RESERVATION_ATTEMPTS.load(Ordering::Acquire) {
        // Never panic or abort inside the allocator. The test reports the
        // post-final-reserve violation only after observation is disarmed.
        OBSERVED_AFTER_LAST_RESERVE.fetch_add(1, Ordering::AcqRel);
    }
    ordinal == FAILURE_ORDINAL.load(Ordering::Acquire)
}

struct ObservationGuard {
    armed: bool,
}

struct Observation {
    allocations: usize,
    after_last_reserve: usize,
    bytes: [usize; RESERVATION_SITE_COUNT],
    aligns: [usize; RESERVATION_SITE_COUNT],
}

impl ObservationGuard {
    fn arm(expected_reservation_attempts: usize) -> Self {
        Self::arm_with_failure(expected_reservation_attempts, NO_FAILURE_ORDINAL)
    }

    fn arm_with_failure(expected_reservation_attempts: usize, failure_ordinal: usize) -> Self {
        assert!(!OBSERVATION_ARMED.load(Ordering::Acquire));
        assert!(expected_reservation_attempts <= RESERVATION_SITE_COUNT);
        OBSERVED_ALLOCATIONS.store(0, Ordering::Release);
        OBSERVED_AFTER_LAST_RESERVE.store(0, Ordering::Release);
        for value in &OBSERVED_BYTES {
            value.store(0, Ordering::Release);
        }
        for value in &OBSERVED_ALIGNS {
            value.store(0, Ordering::Release);
        }
        EXPECTED_RESERVATION_ATTEMPTS.store(expected_reservation_attempts, Ordering::Release);
        FAILURE_ORDINAL.store(failure_ordinal, Ordering::Release);
        OBSERVING_THREAD.set(true);
        OBSERVATION_ARMED.store(true, Ordering::Release);
        Self { armed: true }
    }

    fn finish(mut self) -> Observation {
        OBSERVATION_ARMED.store(false, Ordering::Release);
        OBSERVING_THREAD.set(false);
        EXPECTED_RESERVATION_ATTEMPTS.store(RESERVATION_SITE_COUNT, Ordering::Release);
        FAILURE_ORDINAL.store(NO_FAILURE_ORDINAL, Ordering::Release);
        self.armed = false;
        Observation {
            allocations: OBSERVED_ALLOCATIONS.load(Ordering::Acquire),
            after_last_reserve: OBSERVED_AFTER_LAST_RESERVE.load(Ordering::Acquire),
            bytes: std::array::from_fn(|index| OBSERVED_BYTES[index].load(Ordering::Acquire)),
            aligns: std::array::from_fn(|index| OBSERVED_ALIGNS[index].load(Ordering::Acquire)),
        }
    }
}

impl Drop for ObservationGuard {
    fn drop(&mut self) {
        if self.armed {
            OBSERVATION_ARMED.store(false, Ordering::Release);
            OBSERVING_THREAD.set(false);
            EXPECTED_RESERVATION_ATTEMPTS.store(RESERVATION_SITE_COUNT, Ordering::Release);
            FAILURE_ORDINAL.store(NO_FAILURE_ORDINAL, Ordering::Release);
        }
    }
}

fn rich_all_sites_payload() -> Value {
    let fixture: Value = serde_json::from_slice(PAYLOAD_FIXTURE).expect("fixture parses");
    let mut payload = fixture["valid"]["expectedPayload"].clone();

    let mut direct_mesh = payload["layers"][0].clone();
    direct_mesh["id"] = json!("mesh-direct");
    direct_mesh["blendMode"] = json!("screen");
    direct_mesh["clipMaskIds"] = json!(["mesh-skinned"]);
    direct_mesh["multiplyColor"] = json!({ "r": 0.5, "g": 0.75, "b": 1.0 });
    direct_mesh["screenColor"] = json!({ "r": 0.25, "g": 0.5, "b": 0.75 });
    direct_mesh["culling"] = json!(true);

    let mut skinned_mesh = payload["layers"][0].clone();
    skinned_mesh["id"] = json!("mesh-skinned");
    skinned_mesh["name"] = json!("Skinned");
    skinned_mesh["blendMode"] = json!("multiply");

    let mut group = payload["layers"][0].clone();
    group["id"] = json!("nested-group");
    group["name"] = json!("Nested");
    group["kind"] = json!("group");
    group["visible"] = json!(false);
    group.as_object_mut().expect("group object").remove("mesh");
    group["children"] = json!([direct_mesh]);

    let mut bone_tip = payload["layers"][0].clone();
    bone_tip["id"] = json!("bone-tip");
    bone_tip["name"] = json!("Bone Tip");
    bone_tip["kind"] = json!("bone");
    bone_tip["parentBoneId"] = json!("bone-root");
    bone_tip
        .as_object_mut()
        .expect("bone object")
        .remove("mesh");
    bone_tip["bone"] = json!({ "angle": 0.25, "length": 1.5, "scaleX": 1, "scaleY": 1 });

    let mut bone_root = payload["layers"][0].clone();
    bone_root["id"] = json!("bone-root");
    bone_root["name"] = json!("Bone Root");
    bone_root["kind"] = json!("bone");
    bone_root
        .as_object_mut()
        .expect("bone object")
        .remove("mesh");
    bone_root["bone"] = json!({ "angle": 0, "length": 2, "scaleX": 1, "scaleY": 1 });
    bone_root["children"] = json!([bone_tip]);

    payload["layers"] = json!([group, bone_root, skinned_mesh]);
    payload["atlases"][0]["entries"] = json!([
        { "layerId": "mesh-direct", "x": 0, "y": 0, "width": 1, "height": 1 },
        { "layerId": "mesh-skinned", "x": 0, "y": 0, "width": 1, "height": 1 }
    ]);

    payload["parameters"][0]["pairedParameterId"] = json!("param2");
    payload["parameters"]
        .as_array_mut()
        .expect("parameters")
        .push(json!({
            "id": "param2",
            "name": "Second",
            "minValue": -2,
            "maxValue": 2,
            "defaultValue": 0.5
        }));
    payload["expressionPresets"] = json!([{
        "id": "expression",
        "name": "Expression",
        "values": { "param2": -0.25, "vivi.head.yaw": 0.75 }
    }]);
    payload["ikControllers"] = json!([{
        "id": "controller",
        "name": "Controller",
        "solverType": "ccd",
        "boneChain": [
            { "boneId": "bone-root", "minAngle": -1, "maxAngle": 1 },
            { "boneId": "bone-tip", "minAngle": -0.5, "maxAngle": 0.5 }
        ],
        "targetX": 1,
        "targetY": 2,
        "poleTargetX": 3,
        "poleTargetY": 4,
        "maxIterations": 12,
        "influence": 0.75,
        "parameterMappings": []
    }]);
    payload["parameterBindings"] = json!([
        {
            "id": "binding-bone",
            "parameterId": "vivi.head.yaw",
            "target": { "type": "bone", "boneId": "bone-root", "property": "angle" },
            "bindingPoints": [
                { "paramValue": -1, "targetValue": -0.5 },
                { "paramValue": 1, "targetValue": 0.5 }
            ]
        },
        {
            "id": "binding-controller",
            "parameterId": "param2",
            "target": {
                "type": "ikController",
                "controllerId": "controller",
                "property": "poleTargetX"
            },
            "bindingPoints": [{ "paramValue": 0, "targetValue": 3 }]
        }
    ]);
    payload["skins"] = json!({
        "mesh-skinned": {
            "weights": [
                [
                    { "boneId": "bone-root", "weight": 0.5 },
                    { "boneId": "bone-tip", "weight": 0.5 }
                ],
                [
                    { "boneId": "bone-root", "weight": 0.5 },
                    { "boneId": "bone-tip", "weight": 0.5 }
                ],
                [
                    { "boneId": "bone-root", "weight": 0.5 },
                    { "boneId": "bone-tip", "weight": 0.5 }
                ]
            ],
            "bindPoseInverse": {
                "bone-root": [1, 0, 0, 1, 0, 0],
                "bone-tip": [1, 0, 0, 1, 0, 0]
            }
        }
    });
    payload["physicsGroups"] = json!([
        {
            "id": "physics-enabled",
            "name": "Physics",
            "enabled": true,
            "pendulums": [{ "length": 1, "mass": 1, "damping": 0.1 }],
            "inputs": [
                { "parameterId": "vivi.head.yaw", "weight": 1, "type": "x" },
                { "parameterId": "param2", "weight": 0.5, "type": "y" },
                { "parameterId": "vivi.head.yaw", "weight": 0.25, "type": "angle" }
            ],
            "outputs": [
                {
                    "parameterId": "param2",
                    "pendulumIndex": 0,
                    "weight": 1,
                    "type": "angle"
                },
                {
                    "boneId": "bone-tip",
                    "pendulumIndex": 0,
                    "weight": 0.5,
                    "type": "boneAngle"
                }
            ],
            "gravityDirection": 1.5,
            "gravityStrength": 9.8,
            "wind": 0.25
        },
        {
            "id": "physics-disabled",
            "name": "Disabled",
            "enabled": false,
            "pendulums": [],
            "inputs": [],
            "outputs": [],
            "gravityDirection": 0,
            "gravityStrength": 0,
            "wind": 0
        }
    ]);
    payload
}

fn candidate_and_plan(payload: &Value) -> (ValidatedEvaluationPayloadV1, EvaluationTexturePlanV1) {
    let raw = serde_json::to_vec(payload).expect("payload serializes");
    let candidate = parse_evaluation_payload_v1(&raw, GENERATION).expect("rich payload validates");
    let digest = Digest::from_bytes([0x5a; Digest::LENGTH]);
    let textures = candidate
        .texture_bindings()
        .iter()
        .map(|required| EvaluationTextureBindingV1 {
            id: required.id().to_owned(),
            asset: AssetRef {
                object_address: digest,
                storage_kind: StorageKind::Blob,
                content_sha256: digest,
                media_type: "image/png".to_owned(),
                size_bytes: 0,
            },
            width: required.width(),
            height: required.height(),
            media_type: "image/png".to_owned(),
            color_space: "srgb".to_owned(),
            alpha_mode: "straight".to_owned(),
        })
        .collect();
    (
        candidate,
        EvaluationTexturePlanV1 {
            schema: "vivi2d.evaluationTexturePlan.v1".to_owned(),
            textures,
        },
    )
}

fn direct_mesh_mut(payload: &mut Value) -> &mut Map<String, Value> {
    payload["layers"][0]["children"][0]
        .as_object_mut()
        .expect("nested direct mesh")
}

fn controller_mut(payload: &mut Value) -> &mut Map<String, Value> {
    payload["ikControllers"][0]
        .as_object_mut()
        .expect("controller")
}

fn add_third_bone_and_constraint(payload: &mut Value) {
    let mut third_bone = payload["layers"][1]["children"][0].clone();
    third_bone["id"] = json!("bone-third");
    third_bone["name"] = json!("Bone Third");
    third_bone["parentBoneId"] = json!("bone-tip");
    third_bone["children"] = json!([]);
    payload["layers"]
        .as_array_mut()
        .expect("root layers")
        .push(third_bone);
    payload["ikControllers"][0]["boneChain"]
        .as_array_mut()
        .expect("controller chain")
        .push(json!({
            "boneId": "bone-third",
            "minAngle": -0.25,
            "maxAngle": 0.25
        }));
}

fn observe_public_branch_case(
    label: &str,
    payload: &Value,
    expected_site_bytes: &[usize; RESERVATION_SITE_COUNT],
) {
    let mut expected_bytes = [0; RESERVATION_SITE_COUNT];
    let mut expected_aligns = [0; RESERVATION_SITE_COUNT];
    let mut expected_reservations = 0;
    for (site, bytes) in expected_site_bytes.iter().copied().enumerate() {
        if bytes != 0 {
            expected_bytes[expected_reservations] = bytes;
            expected_aligns[expected_reservations] = EXPECTED_RESERVATION_ALIGNS[site];
            expected_reservations += 1;
        }
    }
    let (candidate, plan) = candidate_and_plan(payload);
    let observation = ObservationGuard::arm(expected_reservations);
    let result = lower_evaluation_foundation_v1(GENERATION, candidate, plan);
    let observation = observation.finish();

    assert_eq!(
        observation.allocations, expected_reservations,
        "{label}: exact nonzero reservation-attempt count"
    );
    assert_eq!(
        observation.after_last_reserve, 0,
        "{label}: no allocation after the final successful reserve"
    );
    assert_eq!(
        &observation.bytes[..expected_reservations],
        &expected_bytes[..expected_reservations],
        "{label}: exact reservation byte-request subsequence"
    );
    assert_eq!(
        &observation.aligns[..expected_reservations],
        &expected_aligns[..expected_reservations],
        "{label}: exact reservation alignment subsequence"
    );
    let foundation = result.unwrap_or_else(|error| panic!("{label}: lowering failed: {error:?}"));
    assert_eq!(foundation.request_generation(), GENERATION, "{label}");
    assert_eq!(foundation.texture_binding_count(), 1, "{label}");
    assert_eq!(foundation.mesh_count(), 2, "{label}");
    assert!(foundation.direct_projected_scalar_count() > 0, "{label}");
    assert_eq!(foundation.derived_evaluation_mesh_count(), 1, "{label}");
    assert_eq!(foundation.mask_edge_count(), 1, "{label}");
}

#[test]
fn all_39_reservations_are_the_only_allocations_during_lowering() {
    // Every observer in this integration binary takes the same gate; TLS also
    // excludes allocations made by test-harness threads waiting on that gate.
    let _single_thread = TEST_GATE.lock().unwrap_or_else(|error| error.into_inner());
    let payload = rich_all_sites_payload();
    let (candidate, plan) = candidate_and_plan(&payload);

    let observation = ObservationGuard::arm(RESERVATION_SITE_COUNT);
    let result = lower_evaluation_foundation_v1(GENERATION, candidate, plan);
    let observation = observation.finish();

    assert_eq!(observation.allocations, RESERVATION_SITE_COUNT);
    assert_eq!(observation.after_last_reserve, 0);
    assert_eq!(observation.bytes, EXPECTED_RESERVATION_BYTES);
    assert_eq!(observation.aligns, EXPECTED_RESERVATION_ALIGNS);

    let foundation = result.expect("rich all-site payload lowers");
    assert_eq!(foundation.request_generation(), GENERATION);
    assert_eq!(foundation.texture_binding_count(), 1);
    assert_eq!(foundation.mesh_count(), 2);
    assert_eq!(foundation.derived_evaluation_mesh_count(), 1);
    assert_eq!(foundation.mask_edge_count(), 1);
}

#[test]
fn public_entry_materialization_branch_matrix_has_no_post_reserve_allocation() {
    let _single_thread = TEST_GATE.lock().unwrap_or_else(|error| error.into_inner());

    // No enabled physics, no controller, absent colors, and no usable bind
    // inverse make eleven sites zero. The unskinned and skinned mesh paths,
    // skin weights, bone path, and the remaining parameter/binding paths stay
    // live, so the final successful reserve is attempt 28 exactly.
    let mut none = rich_all_sites_payload();
    for group in none["physicsGroups"]
        .as_array_mut()
        .expect("physics groups")
    {
        group["enabled"] = json!(false);
    }
    none["ikControllers"] = json!([]);
    none["parameterBindings"]
        .as_array_mut()
        .expect("bindings")
        .truncate(1);
    direct_mesh_mut(&mut none).remove("multiplyColor");
    direct_mesh_mut(&mut none).remove("screenColor");
    direct_mesh_mut(&mut none)["blendMode"] = json!("normal");
    none["layers"][2]["blendMode"] = json!("add");
    none["skins"]["mesh-skinned"]["bindPoseInverse"] = json!({});
    let mut none_bytes = EXPECTED_RESERVATION_BYTES;
    for zero_site in [15, 16, 17, 18, 21, 26, 30, 31, 32, 33, 35] {
        none_bytes[zero_site] = 0;
    }
    none_bytes[8] = 16;
    none_bytes[9] = 32;
    none_bytes[10] = 24;
    none_bytes[27] = 8;
    observe_public_branch_case(
        "none/absent-colors/normal+add/no-bind-inverse",
        &none,
        &none_bytes,
    );

    // A present empty CCD controller retains pre-world storage, but has no
    // constraint or IK-scratch sites. Omitted maxIterations and poles take
    // their canonical defaults; black screen is the present-but-elided path.
    let mut empty = rich_all_sites_payload();
    {
        let controller = controller_mut(&mut empty);
        controller["boneChain"] = json!([]);
        controller["solverType"] = json!("ccd");
        controller["influence"] = json!(1.0);
        controller.remove("maxIterations");
        controller.remove("poleTargetX");
        controller.remove("poleTargetY");
    }
    direct_mesh_mut(&mut empty)["screenColor"] = json!({ "r": 0, "g": 0, "b": 0 });
    let mut empty_bytes = EXPECTED_RESERVATION_BYTES;
    empty_bytes[18] = 0;
    empty_bytes[35] = 0;
    observe_public_branch_case(
        "empty-ccd/default-max/no-pole/black-screen",
        &empty,
        &empty_bytes,
    );

    // Nonempty twoBone takes solver code zero, nonzero effective influence,
    // omitted-max default 10, and the absent-pole path.
    let mut two_bone = rich_all_sites_payload();
    {
        let controller = controller_mut(&mut two_bone);
        controller["solverType"] = json!("twoBone");
        controller["influence"] = json!(1.0);
        controller.remove("maxIterations");
        controller.remove("poleTargetX");
        controller.remove("poleTargetY");
    }
    observe_public_branch_case(
        "twoBone/nonzero/default-max/no-pole",
        &two_bone,
        &EXPECTED_RESERVATION_BYTES,
    );

    // CCD minimum has a three-entry chain, positive zero effective influence,
    // maxIterations=1, and a sparse bind map: one referenced bone is present
    // and another referenced bone is omitted while the site remains nonzero.
    let mut ccd_min = rich_all_sites_payload();
    add_third_bone_and_constraint(&mut ccd_min);
    {
        let controller = controller_mut(&mut ccd_min);
        controller["solverType"] = json!("ccd");
        controller["influence"] = json!(0.0);
        controller["maxIterations"] = json!(1);
        controller.remove("poleTargetX");
        controller.remove("poleTargetY");
    }
    ccd_min["skins"]["mesh-skinned"]["bindPoseInverse"] =
        json!({ "bone-root": [1, 0, 0, 1, 0, 0] });
    let mut ccd_min_bytes = EXPECTED_RESERVATION_BYTES;
    ccd_min_bytes[11] = 192;
    ccd_min_bytes[12] = 12;
    ccd_min_bytes[18] = 72;
    ccd_min_bytes[21] = 56;
    ccd_min_bytes[28] = 144;
    ccd_min_bytes[29] = 144;
    ccd_min_bytes[33] = 144;
    ccd_min_bytes[34] = 144;
    ccd_min_bytes[35] = 120;
    observe_public_branch_case(
        "ccd-min/positive-zero/max-1/sparse-bind",
        &ccd_min,
        &ccd_min_bytes,
    );

    // CCD maximum takes the nonzero-influence, maxIterations=1024, present
    // poles, nonblack screen, multiply-present, and usable-bind paths.
    let mut ccd_max = rich_all_sites_payload();
    add_third_bone_and_constraint(&mut ccd_max);
    {
        let controller = controller_mut(&mut ccd_max);
        controller["solverType"] = json!("ccd");
        controller["influence"] = json!(1.0);
        controller["maxIterations"] = json!(1024);
    }
    ccd_max["skins"]["mesh-skinned"]["bindPoseInverse"]["bone-third"] = json!([1, 0, 0, 1, 0, 0]);
    let mut ccd_max_bytes = EXPECTED_RESERVATION_BYTES;
    ccd_max_bytes[11] = 192;
    ccd_max_bytes[12] = 12;
    ccd_max_bytes[18] = 72;
    ccd_max_bytes[28] = 144;
    ccd_max_bytes[29] = 144;
    ccd_max_bytes[33] = 144;
    ccd_max_bytes[34] = 144;
    ccd_max_bytes[35] = 120;
    observe_public_branch_case(
        "ccd-max/nonzero/max-1024/poles/colors/unreferenced-bind",
        &ccd_max,
        &ccd_max_bytes,
    );
}

#[test]
fn every_exact_denial_tuple_stops_before_its_allocator_attempt() {
    use reservation::{
        Category9ReservationBuffersV1, Category9SiteCountsV1, ReservationDenialKeyV1,
        ReservationSiteV1,
    };

    let _single_thread = TEST_GATE.lock().unwrap_or_else(|error| error.into_inner());
    let counts = Category9SiteCountsV1::try_from_ordered([1; RESERVATION_SITE_COUNT])
        .expect("all-one site counts are valid");

    for (ordinal, site) in ReservationSiteV1::ALL.into_iter().enumerate() {
        let observation = ObservationGuard::arm(ordinal);
        let result = Category9ReservationBuffersV1::reserve_all_with_test_denial(
            &counts,
            ReservationDenialKeyV1 {
                site_template_id: site.id(),
                owner_slot: None,
                attempt_ordinal: u32::try_from(ordinal).expect("39 ordinals fit u32"),
                additional_count: 1,
            },
        );
        let observation = observation.finish();

        let failure = match result {
            Ok(_) => panic!("exact denial tuple must reject site {}", site.id()),
            Err(error) => error,
        };
        assert_eq!(
            failure.kind(),
            error::EvaluationLoweringErrorKind::ResourceLimitExceeded
        );
        assert_eq!(failure.load_status(), 6);
        assert_eq!(
            observation.allocations,
            ordinal,
            "the denied site itself must contribute no allocator attempt: {}",
            site.id()
        );
        assert_eq!(observation.after_last_reserve, 0);
    }
}

#[test]
fn an_intervening_zero_site_has_neither_hook_nor_allocator_ordinal() {
    use reservation::{
        Category9ReservationBuffersV1, Category9SiteCountsV1, ReservationDenialKeyV1,
        ReservationSiteV1,
    };

    let _single_thread = TEST_GATE.lock().unwrap_or_else(|error| error.into_inner());
    let mut ordered = [1; RESERVATION_SITE_COUNT];
    let zero_site = ReservationSiteV1::DirectUnskinnedVertices;
    let next_nonzero_site = ReservationSiteV1::DirectUvs;
    ordered[zero_site.index()] = 0;
    let counts = Category9SiteCountsV1::try_from_ordered(ordered)
        .expect("one intervening zero site is valid");

    // A tuple naming the zero site can never fire: zero bypasses both the
    // denial hook and allocator, and all other 38 sites reserve successfully.
    let observation = ObservationGuard::arm(RESERVATION_SITE_COUNT - 1);
    let zero_result = Category9ReservationBuffersV1::reserve_all_with_test_denial(
        &counts,
        ReservationDenialKeyV1 {
            site_template_id: zero_site.id(),
            owner_slot: None,
            attempt_ordinal: 1,
            additional_count: 0,
        },
    );
    let observation = observation.finish();
    assert!(
        zero_result.is_ok(),
        "zero-site denial tuple is not observed"
    );
    assert_eq!(observation.allocations, RESERVATION_SITE_COUNT - 1);
    assert_eq!(observation.after_last_reserve, 0);
    drop(zero_result);

    // The following site keeps ordinal 1 (only site 0 attempted allocation).
    let observation = ObservationGuard::arm(1);
    let next_result = Category9ReservationBuffersV1::reserve_all_with_test_denial(
        &counts,
        ReservationDenialKeyV1 {
            site_template_id: next_nonzero_site.id(),
            owner_slot: None,
            attempt_ordinal: 1,
            additional_count: 1,
        },
    );
    let observation = observation.finish();
    let failure = match next_result {
        Ok(_) => panic!("next nonzero site's compacted ordinal must match"),
        Err(error) => error,
    };
    assert_eq!(
        failure.kind(),
        error::EvaluationLoweringErrorKind::ResourceLimitExceeded
    );
    assert_eq!(observation.allocations, 1);
    assert_eq!(observation.after_last_reserve, 0);
}

#[test]
fn a_real_production_reserve_failure_maps_to_resource_status_six() {
    use reservation::{Category9ReservationBuffersV1, Category9SiteCountsV1};

    let _single_thread = TEST_GATE.lock().unwrap_or_else(|error| error.into_inner());
    let counts = Category9SiteCountsV1::try_from_ordered([1; RESERVATION_SITE_COUNT])
        .expect("all-one site counts are valid");
    const FAIL_AT: usize = 7;

    let observation = ObservationGuard::arm_with_failure(FAIL_AT + 1, FAIL_AT);
    let result = Category9ReservationBuffersV1::reserve_all(&counts);
    let observation = observation.finish();

    let failure = match result {
        Ok(_) => panic!("the injected allocator null must fail try_reserve_exact"),
        Err(error) => error,
    };
    assert_eq!(
        failure.kind(),
        error::EvaluationLoweringErrorKind::ResourceLimitExceeded
    );
    assert_eq!(failure.load_status(), 6);
    assert_eq!(observation.allocations, FAIL_AT + 1);
    assert_eq!(observation.after_last_reserve, 0);
}
