import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const protectedBodyPaths = new Set([
  "src/lib/__tests__/see-through-auto-setup.test.ts",
  "src/lib/see-through-auto-setup.ts",
  "src/stores/projectIO/__tests__/seeThroughNativeImport.test.ts",
]);
const nativeManifestPath = "packages/runtime-native/Cargo.toml";
const nativeLockPath = "packages/runtime-native/Cargo.lock";
const loweringRoot =
  "packages/runtime-native/crates/vivi-runtime-native-evaluation-lowering";
const loweringManifestPath = `${loweringRoot}/Cargo.toml`;
const vectorPath = `${loweringRoot}/fixtures/evaluation-lowering-v1-vectors.json`;
const category9VectorPath = `${loweringRoot}/fixtures/evaluation-category9-reservation-v1-vectors.json`;

const approvedArtifacts = [
  {
    path: "docs/developer/api/spec/evaluation-lowering-v1.draft.md",
    bytes: 41_556,
    sha256: "2b8f731033b9eb579b33ff66da7efd0036f2b82b5326f74a0df5db8c2718bc20",
  },
  {
    path: "docs/developer/api/spec/evaluation-lowering-v1-vectors.json",
    bytes: 90_906,
    sha256: "eadd382db0f9c08b61b2f714cde7714d0706aaa5ed2c0edf99f7ad2fa27b5f9b",
  },
  {
    path: "docs/developer/api/spec/evaluation-lowering-v1-review-approved.md",
    bytes: 20_624,
    sha256: "76c17745960b824530b1d6b0252f47e013cbef850d5245419c58e56f3364526b",
  },
];

const approvedCategory9Artifacts = [
  {
    path: "docs/developer/api/spec/evaluation-category9-reservation-v1.draft.md",
    bytes: 41_002,
    sha256: "69a5c75855b43d18e030ebb02d29bdcd73ecc7e6a28c0ec0892191dedfc67ade",
  },
  {
    path: "docs/developer/api/spec/evaluation-category9-reservation-v1-vectors.json",
    bytes: 210_149,
    sha256: "06111e2868d6d007062dcf36dc8bffeaa8b45da5f6a0651a5a61492866b37ecc",
  },
  {
    path: "docs/developer/api/spec/evaluation-category9-reservation-v1-review-approved.md",
    bytes: 18_793,
    sha256: "8c039ba1a55920629b9855eecb6d312ad60326f7a696b074f1b4387997154272",
  },
];

const expectedLoweringFiles = [
  "Cargo.toml",
  "fixtures/evaluation-category9-reservation-v1-vectors.json",
  "fixtures/evaluation-lowering-v1-vectors.json",
  "src/error.rs",
  "src/lib.rs",
  "src/lower.rs",
  "src/model.rs",
  "src/reservation.rs",
  "src/tests.rs",
  "tests/no_allocation.rs",
  "tests/wasm_compile.rs",
].sort();

const pinnedLoweringFiles = [
  ["Cargo.toml", 715, "5f7fa0f5f3724fc64423ff42028afbeaf3775fbf5c61bfb44c9389ae136251b0"],
  [
    "fixtures/evaluation-category9-reservation-v1-vectors.json",
    210_149,
    "06111e2868d6d007062dcf36dc8bffeaa8b45da5f6a0651a5a61492866b37ecc",
  ],
  [
    "fixtures/evaluation-lowering-v1-vectors.json",
    90_906,
    "eadd382db0f9c08b61b2f714cde7714d0706aaa5ed2c0edf99f7ad2fa27b5f9b",
  ],
  [
    "src/error.rs",
    5_868,
    "3e5f2d3e76efa4c957f77d95060b8e041827e41bd815cf5a64333cb180d54b07",
  ],
  [
    "src/lib.rs",
    4_455,
    "694ca4b985355f50e897f2948439cb4bea07afaec3629c297fa35eadc1e6526f",
  ],
  [
    "src/lower.rs",
    101_620,
    "aaefd1b24b145048fb80e97e2a00af40cc954717c8249ea8156eff9bf0861cf4",
  ],
  [
    "src/model.rs",
    24_803,
    "90c007dabc9994f4c1fe7cd63f78b7c92b5f84119c4b896305d8d4e33a3283da",
  ],
  [
    "src/reservation.rs",
    36_783,
    "9312254fa5f547709291853cdf36a9ffafcca3c74e8b29f613921af88b6dc1be",
  ],
  [
    "src/tests.rs",
    68_955,
    "c4febd763028503aaaa31fefe757644eae818ae6fca40e9166e75d2f48d2d3fc",
  ],
  [
    "tests/no_allocation.rs",
    28_721,
    "332dec391b826c2b27ac1643ce85f285f9b8600b69527e4f806fe073f5ffe62b",
  ],
  [
    "tests/wasm_compile.rs",
    10_382,
    "5e34a72e859a9ae745b5eba4c893b9f9a0ea2df3a48f80af96bea131f92e7d4f",
  ],
];

const category9TopLevelKeys = [
  "schema",
  "status",
  "sourcePins",
  "executionPolicy",
  "inheritedInventoryRows",
  "existingDirectSites",
  "elementLayouts",
  "inlineLayouts",
  "layoutAssertions",
  "valueEncodings",
  "canonicalizationRules",
  "inlineCardinalities",
  "inlineAliasBindings",
  "crossRecordBindings",
  "arraySemantics",
  "formulaLanguage",
  "logicalBuckets",
  "countFormulas",
  "formulaPrograms",
  "allocationSites",
  "censusVectors",
  "orderingVectors",
  "materializationSteps",
  "controlStates",
  "lifecycleActionLanguage",
  "lifecycleBindings",
  "category11Boundary",
  "precedenceVectors",
  "failureVectors",
  "lifecycleVectors",
  "targetWidthFacts",
  "portabilityVectors",
  "requiredTests",
  "nonClaims",
  "openItems",
  "counts",
  "selfValidation",
];

const category9ArrayCounts = {
  sourcePins: 8,
  inheritedInventoryRows: 11,
  existingDirectSites: 4,
  elementLayouts: 28,
  inlineLayouts: 2,
  layoutAssertions: 30,
  valueEncodings: 22,
  canonicalizationRules: 17,
  inlineCardinalities: 2,
  inlineAliasBindings: 1,
  crossRecordBindings: 6,
  arraySemantics: 4,
  logicalBuckets: 11,
  countFormulas: 82,
  formulaPrograms: 82,
  allocationSites: 39,
  censusVectors: 8,
  orderingVectors: 10,
  materializationSteps: 40,
  controlStates: 7,
  lifecycleBindings: 7,
  category11Boundary: 10,
  precedenceVectors: 6,
  failureVectors: 39,
  lifecycleVectors: 9,
  targetWidthFacts: 2,
  portabilityVectors: 15,
  requiredTests: 37,
  nonClaims: 22,
  openItems: 7,
};

const category9AllocationSiteOrder = [
  "direct.mesh-records",
  "direct.unskinned-vertices",
  "direct.uvs",
  "direct.indices",
  "parameter.symbol-bytes",
  "parameter.specs",
  "parameter.preset-specs",
  "parameter.preset-values",
  "binding.specs",
  "binding.points",
  "binding.targets",
  "bone.specs",
  "bone.world-order-slots",
  "mesh.evaluator-specs",
  "skin.mesh-specs",
  "physics.pendulum-configs",
  "physics.inputs",
  "physics.outputs",
  "ik.constraints",
  "skin.weight-rows",
  "skin.weights",
  "skin.bind-inverses",
  "skin.rest-coordinates",
  "parameter.current",
  "parameter.previous",
  "parameter.update",
  "parameter.staged-destinations",
  "binding.accumulators",
  "bone.committed-overrides",
  "bone.update-overrides",
  "bone.staged-destinations",
  "physics.committed-pendulums",
  "physics.update-pendulums",
  "world.pre",
  "world.post",
  "ik.scratch",
  "skin.skinned-scratch",
  "derived.committed-coordinates",
  "derived.update-coordinates",
];

const category9InheritedInventory = [
  "typed-parameter-current-previous-update-scratch-and-staged-parameter-destination-tables",
  "typed-binding-table",
  "binding-target-accumulators",
  "bone-override-committed-update-scratch-and-staged-bone-destination-slots",
  "physics-state",
  "physics-accumulators",
  "pre-ik-world-transforms",
  "post-ik-world-transforms",
  "ik-angle-position-length-solution-scratch",
  "binary64-rest-and-skinned-vertex-scratch",
  "derived-binary32-output-buffers",
];

const category9RequiredTestRequirements = [
  "exact-artifact-pins-and-top-level-key-order",
  "all-ids-unique-and-all-crossrefs-resolve",
  "inherited-eleven-exact-set",
  "flat-direct-four-exact-order-range-bits-and-mesh-local-index-domain",
  "allocation-sites-exact39-order",
  "repr-size-align-field-offsets-and-explicit-padding-native-and-wasm",
  "all-formulas-ordered-and-checked",
  "all-range-prefix-start-len-cases",
  "existing-three-aggregate-getters-unchanged",
  "binding-target-first-occurrence-interleaving",
  "physics-destination-first-occurrence-last-wins",
  "enabled-disabled-physics-counts-and-original-group-index",
  "no-empty-two-bone-ccd-controller-counts-and-maxIterations-absent0-present1through1024-omitted10",
  "bone-slot-world-order-and-bone-dfs-owner-index",
  "skin-unskinned-sparse-bind-and-referenced-only-bind-counts",
  "zero-minimum-maximum-and-overflow-census",
  "failure-vector-per-site-bijection",
  "test-denial-before-allocator",
  "count-before-reserve-before-materialize-traces",
  "native-single-thread-post-reserve-allocation-trap",
  "wasm32-all-target-compile-instrumentation",
  "nonclone-redacted-private-api",
  "consumer-zero-and-no-math-dependency",
  "category11-exclusion-and-no-hidden-post-math-allocation",
  "value-encoding-and-reserved-bit-coverage",
  "formula-program-grammar-recomputation",
  "concrete-census-and-ordering-vectors",
  "materialization-steps-exact-order",
  "lifecycle-binding-reference-coverage",
  "production-allocator-error-mapping",
  "inline-exact-one-cardinality-and-absent-bytes",
  "index-domain-and-cross-record-binding-coverage",
  "array-field-semantics-and-ik-scratch-overwrite",
  "target-width-facts-and-common-cap-precedence",
  "binding-target-default-table-all-ten-kind-property-pairs-and-parameter-current-previous-update-default-bits",
  "immutable-request-generation-canvas-and-three-aggregate-fields-exactly-written-and-retained-on-all-outcomes;separate-future-dynamic-and-topology-generation-storage-remains-open",
  "absent-inline-physics-record-remains-byte-canonical-and-physics-lifecycle-binding-executes-zero-actions",
];

const category9ValueEncodingPins = [
  [
    "encoding.optional-slot",
    1,
    "sentinel-u32",
    "7647f59851bd3824bcbaf279838acba338cdc2f8a4816934fa43c959e901d6fb",
  ],
  [
    "encoding.bool-u32",
    2,
    "enum-u32",
    "60bfab79ec48afd599460fdbd2fed4e6921c4975e00e1f741d6fd6b21b2ee408",
  ],
  [
    "encoding.valid-u32",
    3,
    "enum-u32",
    "577e6f703a98299afc2fd08ee059e7f24cbab02f9bc69a6cf90b46544ecb85fb",
  ],
  [
    "encoding.direct-flags",
    4,
    "bitmask-u32",
    "94f03db9f87707f4a7bcf10998af22520150aea189b8c12c2edea59c32454b0a",
  ],
  [
    "encoding.blend",
    5,
    "enum-u32",
    "d7d5187c328e0595ab959078d5f6c19c8ee4909e83a2833fd60a8d49542b2e17",
  ],
  [
    "encoding.binding-target-kind",
    6,
    "enum-u32",
    "4e91e1a1d9e6d312c825919fd03e8caf92e9da0d1e7da61510ddc73e1c144e0f",
  ],
  [
    "encoding.binding-property",
    7,
    "enum-u32",
    "960605eebf9e0af48e1f4015b6bfc7d743e31be57f49306b90878ac9d08a697b",
  ],
  [
    "encoding.mesh-static-flags",
    8,
    "bitmask-u32",
    "970dfa000f65b312a38c35dcb7e716be36188e0693c7a46e6d0d19e5a229a4d5",
  ],
  [
    "encoding.mesh-state-flags",
    9,
    "bitmask-u32",
    "ec01107897c8aa8af32a67e4ab18d210835d97084f34fcb8ec6e83166a8a17b5",
  ],
  [
    "encoding.physics-input-kind",
    10,
    "enum-u32",
    "b8e99ca0612be4713b64c422b55f9b56a3368322e4cbee1580d82da99b65459f",
  ],
  [
    "encoding.physics-output-destination-kind",
    11,
    "enum-u32",
    "19e3875d7ec7f302d756538544bc8864865232f1b307372e70af9a9fd14bf72a",
  ],
  [
    "encoding.ik-solver",
    12,
    "enum-u32",
    "bf8b0da7ee167578370337e2d089b691974ae6c7c56c6a453b9590b86a000fce",
  ],
  [
    "encoding.controller-presence-flags",
    13,
    "bitmask-u32",
    "ca494ae1be483eb58df138b3713885b283323054ca0d7026a4a5b6686c87fa87",
  ],
  [
    "encoding.bone-override-mask",
    14,
    "bitmask-u32",
    "edf8e27a2a30457efb9aaf3e919b10303c287a347469247e69072bd2a3382064",
  ],
  [
    "encoding.physics-validity",
    15,
    "bitmask-u32",
    "338cd738f70634a2202909543f32e95192f8bddf4d9d379f5b8c848118ac7360",
  ],
  [
    "encoding.index-domains",
    16,
    "index-domain",
    "28947c16c0e3fe996220a19b972173394d89f3802c884af78d7c025b6c9c9807",
  ],
  [
    "encoding.world-order-slot",
    17,
    "derived-index-domain",
    "7a4cd96ff12b01b7991e1767ffc65efbbe7f209bd340062fd5755f1385427155",
  ],
  [
    "encoding.direct-index-values",
    18,
    "mesh-local-u32-index",
    "f0536a1170722f73362f050804400852773b2a7cbfc67bee2764aae0db33a41a",
  ],
  [
    "encoding.range",
    19,
    "checked-range-u32",
    "94afa05a63bd55ce268f54353897bbe9e508ef14804644dc28658f09573c6c63",
  ],
  [
    "encoding.raw-neutral",
    20,
    "raw-bits",
    "75f0be20e6101a185b8fc6d286a441e463893409f40cec28401f9258f47f7c0e",
  ],
  [
    "encoding.padding-zero",
    21,
    "zero-storage",
    "9719ad7f8060825794dfc41f293797834855cef242ba63222b5e8e3cc964d65e",
  ],
  [
    "encoding.ik-max-iterations",
    22,
    "conditional-bounded-u32",
    "0e73c67468d900e4666085f5b2b9f783ea504be70c9bf3ad73ee91cf57f32e33",
  ],
];

const category9NormativeSectionPins = {
  canonicalizationRules:
    "18b1316ce013f17dfe2fc23245fee5d93c7fea132148c4169dbd1d85dd6059f0",
  inlineCardinalities: "00699c7b186cdca89ff6fa28919160d8f405ae512f77ecf7e8af9a1f3f7cc0a8",
  inlineAliasBindings: "f0881dcd1b58bce502c17c699c706b1e29ce3cfba66fef8c6ebbf024b8749896",
  crossRecordBindings: "029d400196b159ea585b3681b856a54f6b8c20338272a9e0f5513dcfa3ba8030",
  arraySemantics: "fb8845e0b34649fd9cd9694ed9afc0dcd9df2ab8d8f13c7355ba5df559c9f07a",
  materializationSteps:
    "e09f06d9101c376f3d5644c58685c14e0e3324d1443ee8fa6599d6351bd7dd43",
  controlStates: "c2a4680517aa732d5fa0886f811c3ba9dc311d88995baac81b669f81a8aff85c",
  lifecycleActionLanguage:
    "ea2dc64b50c96edb5753bdf0dca2afce44b1a5e0bd512b9da58dae50f1e58986",
  lifecycleBindings: "fadb09557d60125873f53e8d1cce176ddf4605b36d985af258a4a2ce4b10055a",
  lifecycleVectors: "026807824596a4a1af3b0256e435c6efc390754d21b03fb622e5453255006b24",
  portabilityVectors: "28b33710113d1d3fed80eadbf2cf1795645bea3d47ba45c4e16e673847b9879f",
};

const expectedTestNames = [
  "adjacent_lowering_categories_have_total_precedence",
  "all_thirteen_blends_cross_all_seven_recursive_contexts",
  "all_thirty_scalar_projection_vectors_are_bit_exact",
  "category9_all_thirty_nine_test_denial_tuples_are_exact",
  "category9_all_ten_binding_target_defaults_are_exact",
  "category9_minimal_flat_ranges_neutrals_and_inline_absence_are_exact",
  "category9_rich_cross_records_first_occurrence_and_initial_state_are_exact",
  "category9_site_order_layout_widths_and_cap_neighbors_are_exact",
  "category9_step40_rejects_every_range_family_and_cross_link_corruption",
  "category_precedence_and_reservation_injection_match_the_foundation_scope",
  "color_presence_and_default_elision_precede_projection",
  "direct_projection_uses_recursive_mesh_dfs_and_fixed_field_order",
  "eligibility_records_are_preflighted_while_bound_clamp_remains_deferred",
  "fixed_source_manifest_has_no_accidental_direct_dependency_or_publication_edge",
  "foundation_owns_inputs_without_exposing_sensitive_debug_data",
  "frozen_vector_fixture_and_source_pins_are_exact",
  "future_inventory_obligations_are_not_misreported_as_executed_fixtures",
  "lowering_errors_are_stable_redacted_and_have_no_source_chain",
  "nonfinite_projection_inputs_are_typed_load_incompatibilities",
  "non_mesh_mask_field_presence_rejects_even_an_empty_legacy_array",
  "physics_cardinality_counts_only_enabled_groups",
  "plan_host_fields_and_category_ten_eleven_remain_outside_foundation",
  "root_helpers_are_not_dependent_on_json_object_member_order",
  "skinned_derived_values_are_retained_but_never_evaluated_or_sealed",
].sort();

const expectedIntegrationTestNames = [
  [
    "tests/no_allocation.rs",
    [
      "a_real_production_reserve_failure_maps_to_resource_status_six",
      "all_39_reservations_are_the_only_allocations_during_lowering",
      "an_intervening_zero_site_has_neither_hook_nor_allocator_ordinal",
      "every_exact_denial_tuple_stops_before_its_allocator_attempt",
      "public_entry_materialization_branch_matrix_has_no_post_reserve_allocation",
    ],
  ],
  [
    "tests/wasm_compile.rs",
    ["actual_lowering_sources_compile_for_wasm32_without_a_product_surface_claim"],
  ],
];

const expectedVectorKeys = [
  "contract",
  "draft",
  "status",
  "numericFieldInventorySummary",
  "numericFieldPathNotation",
  "numericFieldInventory",
  "numericOwnerDispositions",
  "integerUseDispositions",
  "numericCoverageProfiles",
  "numericCoverageBinding",
  "numericProjection",
  "blendModes",
  "blendScanContexts",
  "blendCoverageBinding",
  "derivedProjection",
  "eligibility",
  "maskCommandVectors",
  "precedence",
  "precedenceCases",
  "projectionRegistry",
  "geometryOrderVectors",
  "textureVectors",
  "ikVectors",
  "physicsVectors",
  "bindingAndSkinningVectors",
  "defaultValueVectors",
  "expressionPresetVectors",
  "preactivationCompositionVectors",
  "candidateBoundaryVectors",
  "deterministicMathPrerequisite",
  "operationVectors",
  "sealedLowering",
  "runtimeSemantics",
  "diagnosticOrder",
  "identity",
  "nonClaims",
];

const expectedArrayCounts = {
  numericFieldInventory: 100,
  numericOwnerDispositions: 11,
  integerUseDispositions: 16,
  numericProjection: 30,
  blendModes: 13,
  blendScanContexts: 7,
  derivedProjection: 3,
  eligibility: 17,
  maskCommandVectors: 9,
  precedence: 20,
  precedenceCases: 7,
  projectionRegistry: 9,
  geometryOrderVectors: 3,
  textureVectors: 10,
  ikVectors: 21,
  physicsVectors: 5,
  bindingAndSkinningVectors: 9,
  defaultValueVectors: 9,
  expressionPresetVectors: 3,
  preactivationCompositionVectors: 7,
  candidateBoundaryVectors: 5,
  operationVectors: 9,
  nonClaims: 8,
};

const expectedProductionClosurePin = {
  count: 42,
  sha256: "c96f8c93bf0563682cfdd399e78bff76696a5ee29fff1833506c742d07e4895e",
};
const expectedDevClosurePin = {
  count: 0,
  sha256: "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
};

try {
  const category9Vectors = assertCategory9ReviewUnit();
  assertSourceInventory();
  const vectors = assertApprovedReviewUnit();
  const metadata = assertCargoBoundary();
  assertDependencyPins(metadata);
  assertConsumerGraph(metadata);
  assertPublicSurface();
  assertFoundationContract(vectors, category9Vectors);
  assertIsolation(metadata);
  assertGateAndDocumentationWiring();
  runCategory9AllocatorGate();
  runRustdocGate();
  console.log(
    "[runtime-native-evaluation-lowering] passed (approved phases 1-3/categories 1-9 foundation, consumer-zero native isolation)",
  );
} catch (error) {
  console.error("[runtime-native-evaluation-lowering] failed:");
  console.error(`- ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

function assertSourceInventory() {
  if (!existsSync(resolve(loweringRoot))) {
    throw new Error("Evaluation lowering crate directory is missing");
  }
  const actualFiles = walkFiles(resolve(loweringRoot))
    .map((filePath) => toRelativeFrom(loweringRoot, filePath))
    .sort();
  assertExactJson(actualFiles, expectedLoweringFiles, "lowering crate file inventory");
  assertExactJson(
    pinnedLoweringFiles.map(([relativePath]) => relativePath),
    expectedLoweringFiles,
    "lowering source pin inventory",
  );
  for (const [relativePath, expectedBytes, expectedHash] of pinnedLoweringFiles) {
    const contents = readBuffer(`${loweringRoot}/${relativePath}`);
    const actualHash = sha256(contents);
    if (contents.byteLength !== expectedBytes || actualHash !== expectedHash) {
      throw new Error(
        `${relativePath} drifted (expected ${expectedBytes}/${expectedHash}, got ${contents.byteLength}/${actualHash})`,
      );
    }
  }

  const tests = readText(`${loweringRoot}/src/tests.rs`);
  const actualTestNames = [...tests.matchAll(/#\[test\]\s*fn\s+([A-Za-z0-9_]+)/g)]
    .map((match) => match[1])
    .sort();
  assertExactJson(actualTestNames, expectedTestNames, "lowering Rust test inventory");
  for (const [relativePath, expectedNames] of expectedIntegrationTestNames) {
    const integrationTest = readText(`${loweringRoot}/${relativePath}`);
    const actualNames = [...integrationTest.matchAll(/#\[test\]\s*fn\s+([A-Za-z0-9_]+)/g)]
      .map((match) => match[1])
      .sort();
    assertExactJson(
      actualNames,
      [...expectedNames].sort(),
      `${relativePath} Rust test inventory`,
    );
  }
}

function assertApprovedReviewUnit() {
  const fixture = readBuffer(vectorPath);
  if (fixture.byteLength !== 90_906 || sha256(fixture) !== approvedArtifacts[1].sha256) {
    throw new Error("tracked lowering vector fixture identity drifted");
  }
  const vectors = JSON.parse(fixture.toString("utf8"));
  assertExactJson(
    Object.keys(vectors),
    expectedVectorKeys,
    "vector top-level key inventory",
  );

  const typeCounts = { scalar: 0, object: 0, array: 0 };
  for (const value of Object.values(vectors)) {
    if (Array.isArray(value)) typeCounts.array += 1;
    else if (value !== null && typeof value === "object") typeCounts.object += 1;
    else typeCounts.scalar += 1;
  }
  assertExactJson(typeCounts, { scalar: 3, object: 10, array: 23 }, "vector shape");
  for (const [key, expectedCount] of Object.entries(expectedArrayCounts)) {
    if (!Array.isArray(vectors[key]) || vectors[key].length !== expectedCount) {
      throw new Error(
        `vector array ${key} must contain exactly ${expectedCount} records`,
      );
    }
  }
  if (
    vectors.contract !== "evaluation-lowering-v1" ||
    vectors.draft !== 1 ||
    vectors.status !== "external-review-required"
  ) {
    throw new Error("vector contract/draft/frozen historical status drifted");
  }

  assertExactJson(
    vectors.numericFieldInventorySummary,
    {
      schemaSha256: "8d65b5ddea137a71894e57ba6e14c94576aad63b2b7586728fa2bcca5bb125a3",
      total: 100,
      domainCounts: { f64: 84, integer: 16 },
      candidateReachableCounts: { true: 76, false: 24 },
      loweringClassCounts: {
        "exact-int": 15,
        "direct-f32": 5,
        "transitive-f32": 35,
        "binary64-only": 21,
        unreachable: 24,
      },
    },
    "numeric inventory summary",
  );
  const expectedInventoryIds = Array.from(
    { length: 100 },
    (_, index) => `nf${String(index + 1).padStart(3, "0")}`,
  );
  assertExactJson(
    vectors.numericFieldInventory.map((row) => row.id),
    expectedInventoryIds,
    "numeric inventory IDs",
  );
  if (
    vectors.numericFieldInventory.some((row) => row.coverageProfile !== row.loweringClass)
  ) {
    throw new Error("numeric inventory coverageProfile must equal loweringClass 100/100");
  }
  const reachableCounts = vectors.numericFieldInventory.reduce(
    (counts, row) => {
      counts[String(row.candidateReachable)] += 1;
      return counts;
    },
    { true: 0, false: 0 },
  );
  assertExactJson(reachableCounts, { true: 76, false: 24 }, "candidate reachability");

  const rowObligations = new Set(
    vectors.numericFieldInventory.flatMap((row) => row.requiredVectorIds),
  );
  const ownerObligations = new Set(
    vectors.numericCoverageBinding.ownerContextOverrides.flatMap(
      (owner) => owner.requiredOwnerContextVectorIds,
    ),
  );
  if (rowObligations.size !== 191 || ownerObligations.size !== 23) {
    throw new Error(
      "future numeric obligation inventory must remain 191 row + 23 owner-context IDs",
    );
  }
  if ([...rowObligations].some((id) => ownerObligations.has(id))) {
    throw new Error("row and owner-context obligation IDs must remain disjoint");
  }
  const concreteIds = [];
  collectObjectIds(vectors, concreteIds);
  if (concreteIds.length !== 264 || new Set(concreteIds).size !== 264) {
    throw new Error("vector concrete record IDs must remain exactly 264 and unique");
  }
  if (
    vectors.blendCoverageBinding.requiredCases !== 91 ||
    vectors.deterministicMathPrerequisite.status !== "required-not-yet-adopted" ||
    vectors.deterministicMathPrerequisite.threeOsCorpusAloneIsSufficient !== false ||
    vectors.deterministicMathPrerequisite.allowedBeforeClosure !==
      "consumer-zero lowering foundation without core/native/TypeScript evaluator connection or cross-implementation status claim"
  ) {
    throw new Error(
      "blend Cartesian obligation or deterministic-math nonclosure drifted",
    );
  }

  const trackedArtifacts = runCapture("git", [
    "ls-files",
    "--",
    ...approvedArtifacts.map((artifact) => artifact.path),
  ])
    .split(/\r?\n/)
    .filter(Boolean);
  if (trackedArtifacts.length !== 0) {
    throw new Error(
      "approved draft/vector/review artifacts must remain local-only and untracked",
    );
  }
  const presentArtifacts = approvedArtifacts.filter((artifact) =>
    existsSync(resolve(artifact.path)),
  );
  if (
    presentArtifacts.length !== 0 &&
    presentArtifacts.length !== approvedArtifacts.length
  ) {
    throw new Error(
      "local-only approved review unit must be wholly present or wholly absent",
    );
  }
  for (const artifact of presentArtifacts) {
    const contents = readBuffer(artifact.path);
    if (contents.byteLength !== artifact.bytes || sha256(contents) !== artifact.sha256) {
      throw new Error(`local-only approved artifact drifted: ${artifact.path}`);
    }
  }
  if (
    presentArtifacts.length === approvedArtifacts.length &&
    !fixture.equals(readBuffer(approvedArtifacts[1].path))
  ) {
    throw new Error(
      "tracked vector fixture is not byte-identical to the approved local vector",
    );
  }
  if (presentArtifacts.length === approvedArtifacts.length) {
    const approval = readText(approvedArtifacts[2].path);
    for (const evidence of [
      "Verdict: `APPROVE`",
      "P0:",
      "P1:",
      "P2:",
      "P3: 2",
      "Required edits:",
    ]) {
      if (!approval.includes(evidence)) {
        throw new Error(`approved review record omits ${evidence}`);
      }
    }
  }
  return vectors;
}

function assertCategory9ReviewUnit() {
  const fixture = readBuffer(category9VectorPath);
  if (
    fixture.byteLength !== approvedCategory9Artifacts[1].bytes ||
    sha256(fixture) !== approvedCategory9Artifacts[1].sha256
  ) {
    throw new Error("tracked Category 9 vector fixture identity drifted");
  }
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(fixture);
  } catch {
    throw new Error("Category 9 vector fixture is not strict UTF-8");
  }
  if (!text.endsWith("\n") || text.endsWith("\n\n") || text.includes("\r")) {
    throw new Error("Category 9 vector fixture must use LF and exactly one final LF");
  }
  if (
    sha256(fixture.subarray(0, -1)) !==
    "dd5f4b336e369496bf1e22263fb1b16d8827210a63024b947a14b9129df0b1b6"
  ) {
    throw new Error("Category 9 preserved-order compact semantic-byte pin drifted");
  }
  assertNoDuplicateJsonKeys(text, "Category 9 vector fixture");
  const vectors = JSON.parse(text);
  if (`${JSON.stringify(vectors)}\n` !== text) {
    throw new Error(
      "Category 9 vector fixture must be preserved-order compact JSON plus one LF",
    );
  }
  if (
    vectors.schema !== "vivi2d.evaluationCategory9ReservationVectors.v1" ||
    vectors.status !== "draft-exact-byte-review-required"
  ) {
    throw new Error("Category 9 schema or frozen historical status drifted");
  }
  assertExactJson(
    Object.keys(vectors),
    category9TopLevelKeys,
    "Category 9 top-level key order",
  );
  assertExactJson(
    vectors.selfValidation?.requiredTopLevelKeyOrder,
    category9TopLevelKeys,
    "Category 9 published top-level key order",
  );

  for (const [key, expectedCount] of Object.entries(category9ArrayCounts)) {
    if (!Array.isArray(vectors[key]) || vectors[key].length !== expectedCount) {
      throw new Error(`Category 9 ${key} must contain exactly ${expectedCount} rows`);
    }
    if (vectors[key].every((row) => row && Number.isInteger(row.order))) {
      assertContiguousOrders(vectors[key], `Category 9 ${key}`);
    }
  }
  const ids = [];
  collectObjectIds(vectors, ids);
  if (ids.length !== 568 || new Set(ids).size !== 568) {
    throw new Error(
      `Category 9 ID inventory must be 568 unique IDs, got ${ids.length}/${new Set(ids).size}`,
    );
  }
  const derivedCounts = { ...category9ArrayCounts, uniqueIds: ids.length };
  assertExactJson(vectors.counts, derivedCounts, "Category 9 derived counts");
  assertExactJson(
    vectors.selfValidation?.expectedCounts,
    derivedCounts,
    "Category 9 published expected counts",
  );
  assertExactJson(
    Object.fromEntries(
      Object.keys(category9NormativeSectionPins).map((key) => [
        key,
        sha256(JSON.stringify(vectors[key])),
      ]),
    ),
    category9NormativeSectionPins,
    "Category 9 normative encoding/materializer/lifecycle section identities",
  );
  const proofFlags = Object.entries(vectors.selfValidation).filter(
    ([, value]) => typeof value === "boolean",
  );
  if (proofFlags.length !== 48 || proofFlags.some(([, value]) => value !== true)) {
    throw new Error("Category 9 published self-validation flags drifted");
  }
  assertExactJson(
    {
      duplicateJsonKeys: vectors.selfValidation.duplicateJsonKeys,
      duplicateIds: vectors.selfValidation.duplicateIds,
      category11AllocationSiteIntersection:
        vectors.selfValidation.category11AllocationSiteIntersection,
    },
    {
      duplicateJsonKeys: [],
      duplicateIds: [],
      category11AllocationSiteIntersection: [],
    },
    "Category 9 published empty-set proofs",
  );

  const expectedSourcePins = [
    [
      "pin-lowering-draft",
      "docs/developer/api/spec/evaluation-lowering-v1.draft.md",
      41_556,
      "2b8f731033b9eb579b33ff66da7efd0036f2b82b5326f74a0df5db8c2718bc20",
      "adopted-parent-full-text",
    ],
    [
      "pin-lowering-vectors",
      "docs/developer/api/spec/evaluation-lowering-v1-vectors.json",
      90_906,
      "eadd382db0f9c08b61b2f714cde7714d0706aaa5ed2c0edf99f7ad2fa27b5f9b",
      "adopted-parent-full-text",
    ],
    [
      "pin-lowering-approval",
      "docs/developer/api/spec/evaluation-lowering-v1-review-approved.md",
      20_624,
      "76c17745960b824530b1d6b0252f47e013cbef850d5245419c58e56f3364526b",
      "adopted-parent-full-text",
    ],
    [
      "pin-math-draft",
      "docs/developer/api/spec/evaluation-deterministic-math-v1.draft.md",
      38_965,
      "d39ed92629b89a3bf2e4c4cb37657e7407ede750896caf619cd121fa3ab9b75a",
      "adopted-parent-full-text",
    ],
    [
      "pin-math-vectors",
      "docs/developer/api/spec/evaluation-deterministic-math-v1-vectors.json",
      79_921,
      "0a467b96d93ea0b7b8d12f8b8229d050b50945c40fff29c8ace0469b76cdec00",
      "adopted-parent-full-text",
    ],
    [
      "pin-math-approval",
      "docs/developer/api/spec/evaluation-deterministic-math-v1-review-approved.md",
      24_456,
      "ae47988b58c56b32ec4a6c06809c61d5112ab1a68c8e5534e94c4a7c0b508cd7",
      "adopted-parent-full-text",
    ],
    [
      "pin-lowering-implementation-approval",
      "docs/developer/api/spec/runtime-native-evaluation-lowering-review-approved.md",
      23_254,
      "3053ae032473f33e61f6b70a156cdb7ff881ac80738a03550e53228f82eb49bd",
      "carry-forward-evidence",
    ],
    [
      "pin-math-implementation-approval",
      "docs/developer/api/spec/runtime-native-evaluation-math-review-approved.md",
      28_503,
      "63a7f770cdc878608a51396e5d86ff12ad637cf8b5bb09fc04edfd2ee06caa74",
      "carry-forward-evidence",
    ],
  ];
  assertExactJson(
    vectors.sourcePins.map(({ id, path: sourcePath, bytes, sha256: hash, role }) => [
      id,
      sourcePath,
      bytes,
      hash,
      role,
    ]),
    expectedSourcePins,
    "Category 9 source pins",
  );
  const presentSourcePins = vectors.sourcePins.filter((pin) =>
    existsSync(resolve(pin.path)),
  );
  if (presentSourcePins.length !== 0 && presentSourcePins.length !== 8) {
    throw new Error("Category 9 source-pin set must be wholly present or wholly absent");
  }
  for (const pin of presentSourcePins) {
    const contents = readBuffer(pin.path);
    if (contents.byteLength !== pin.bytes || sha256(contents) !== pin.sha256) {
      throw new Error(`Category 9 source pin drifted: ${pin.path}`);
    }
  }

  const trackedArtifacts = runCapture("git", [
    "ls-files",
    "--",
    ...approvedCategory9Artifacts.map((artifact) => artifact.path),
  ])
    .split(/\r?\n/)
    .filter(Boolean);
  if (trackedArtifacts.length !== 0) {
    throw new Error("Category 9 draft/vector/approval must remain local-only");
  }
  const presentArtifacts = approvedCategory9Artifacts.filter((artifact) =>
    existsSync(resolve(artifact.path)),
  );
  if (presentArtifacts.length !== 0 && presentArtifacts.length !== 3) {
    throw new Error("Category 9 local review unit must be wholly present or absent");
  }
  for (const artifact of presentArtifacts) {
    const contents = readBuffer(artifact.path);
    if (contents.byteLength !== artifact.bytes || sha256(contents) !== artifact.sha256) {
      throw new Error(`Category 9 approved artifact drifted: ${artifact.path}`);
    }
  }
  if (
    presentArtifacts.length === 3 &&
    !fixture.equals(readBuffer(approvedCategory9Artifacts[1].path))
  ) {
    throw new Error(
      "tracked Category 9 vector is not byte-identical to local frozen vector",
    );
  }

  assertCategory9Relationships(vectors);
  assertCategory9Layouts(vectors);
  assertCategory9FormulaPrograms(vectors);
  assertCategory9ConcreteCensus(vectors);
  assertCategory9OrderingVectors(vectors);
  assertCategory9Portability(vectors);
  return vectors;
}

function assertCategory9Relationships(vectors) {
  const ids = [];
  collectObjectIds(vectors, ids);
  const idSet = new Set(ids);
  const referenceKeys = new Set([
    "absentCanonicalizationId",
    "allocationSiteId",
    "allocationSiteIds",
    "bindingId",
    "bindingIds",
    "canonicalizationId",
    "controlStateId",
    "failAtFormulaId",
    "fixtureId",
    "formulaId",
    "inlineLayoutId",
    "layoutId",
    "logicalBucketIds",
    "refId",
    "siteId",
    "siteIds",
    "siteTemplateId",
    "sourceFormulaId",
  ]);
  visitObjects(vectors, (object, objectPath) => {
    for (const [key, value] of Object.entries(object)) {
      if (!referenceKeys.has(key)) continue;
      const references = Array.isArray(value) ? value : [value];
      for (const reference of references) {
        if (typeof reference !== "string" || !idSet.has(reference)) {
          throw new Error(
            `Category 9 unresolved ${key} at ${objectPath}: ${String(reference)}`,
          );
        }
      }
    }
  });

  assertExactJson(
    vectors.inheritedInventoryRows.map((row) => row.id),
    category9InheritedInventory,
    "Category 9 inherited eleven-row inventory",
  );
  if (vectors.inheritedInventoryRows.some((row) => row.id !== row.adoptedExactString)) {
    throw new Error("Category 9 inherited rows must preserve their adopted exact text");
  }
  assertExactJson(
    vectors.existingDirectSites.map((row) => row.allocationSiteId),
    category9AllocationSiteOrder.slice(0, 4),
    "Category 9 existing direct-site order",
  );
  assertExactJson(
    vectors.existingDirectSites.map((row) => row.representation),
    ["flat-fixed-records", "flat-d32-bits", "flat-d32-bits", "flat-u32-indices"],
    "Category 9 flat direct-site representations",
  );
  assertExactJson(
    vectors.allocationSites.map((site) => site.id),
    category9AllocationSiteOrder,
    "Category 9 allocation-site order",
  );
  assertExactJson(
    vectors.selfValidation.allocationSiteIdOrder,
    category9AllocationSiteOrder,
    "Category 9 published allocation-site order",
  );
  assertExactJson(
    vectors.selfValidation.failureDenySiteOrder,
    category9AllocationSiteOrder,
    "Category 9 published failure-site order",
  );
  const nonDirectSiteOrder = category9AllocationSiteOrder.slice(4);
  assertExactJson(
    vectors.logicalBuckets.flatMap((bucket) => bucket.allocationSiteIds).sort(),
    [...nonDirectSiteOrder].sort(),
    "Category 9 logical-bucket allocation-site partition",
  );
  if (
    vectors.logicalBuckets.some(
      (bucket, index) =>
        bucket.id !== `bucket.${index + 1}` ||
        bucket.inheritedInventoryRow !== category9InheritedInventory[index],
    )
  ) {
    throw new Error("Category 9 logical buckets do not biject to inherited rows");
  }
  if (
    vectors.allocationSites.some(
      (site) =>
        site.ownerSlot !== null ||
        site.instances !== "exactly-one" ||
        site.zeroBehavior !== "reserve-skip-zero-no-hook-no-allocator" ||
        site.aliasPolicy !== "no-simultaneous-alias;ownership-swap-is-not-alias" ||
        site.simultaneousLiveGroup !== "foundation-v1",
    )
  ) {
    throw new Error("Category 9 site owner/instance/zero/alias policy drifted");
  }

  const formulaIds = new Set(vectors.countFormulas.map((formula) => formula.id));
  const siteIds = new Set(category9AllocationSiteOrder);
  const layouts = new Map(
    [...vectors.elementLayouts, ...vectors.inlineLayouts].map((layout) => [
      layout.id,
      layout,
    ]),
  );
  for (const site of vectors.allocationSites) {
    if (
      !formulaIds.has(site.countFormula) ||
      !formulaIds.has(site.byteFormula) ||
      !layouts.has(site.elementLayout) ||
      site.byteFormula !== `bytes.${site.id}`
    ) {
      throw new Error(`Category 9 site formula/layout binding drifted: ${site.id}`);
    }
  }
  const directFormulaOrder = [
    "meshCount",
    "directUnskinnedVertexComponents",
    "uvComponentCount",
    "indexCount",
  ];
  assertExactJson(
    vectors.existingDirectSites.map((row) => row.countFormula),
    directFormulaOrder,
    "Category 9 direct-site count formulas",
  );

  const layoutFieldSets = new Map(
    [...vectors.elementLayouts, ...vectors.inlineLayouts].map((layout) => [
      layout.id,
      new Set(layout.fields.map((field) => field.slice(0, field.indexOf(":")))),
    ]),
  );
  const specialFieldRefs = new Set([
    "all-RangeV1-fields",
    "all-D64BitsV1-fields",
    "all-D32BitsV1-fields",
    "all-fields-named-padding",
    "all-reserved-flag-bits",
    "all-reserved-bits",
  ]);
  const assertFieldRef = (fieldRef, label) => {
    if (specialFieldRefs.has(fieldRef)) return;
    const candidates = [...layouts.keys()]
      .filter((layoutId) => fieldRef.startsWith(`${layoutId}.`))
      .sort((left, right) => right.length - left.length);
    const layoutId = candidates[0];
    const field = layoutId ? fieldRef.slice(layoutId.length + 1) : "";
    if (!layoutId || !layoutFieldSets.get(layoutId)?.has(field)) {
      throw new Error(`${label} has unresolved layout field ${fieldRef}`);
    }
  };
  assertExactJson(
    vectors.valueEncodings.map((encoding) => [
      encoding.id,
      encoding.order,
      encoding.kind,
      sha256(JSON.stringify(encoding)),
    ]),
    category9ValueEncodingPins,
    "Category 9 exact value-encoding row identities",
  );
  for (const encoding of vectors.valueEncodings) {
    for (const fieldRef of encoding.fieldRefs) {
      assertFieldRef(fieldRef, encoding.id);
    }
    const numericAssignments = Object.values(encoding.assignments).filter((value) =>
      Number.isInteger(value),
    );
    if (
      (encoding.kind === "enum-u32" || encoding.kind === "bitmask-u32") &&
      new Set(numericAssignments).size !== numericAssignments.length
    ) {
      throw new Error(`Category 9 encoding has duplicate numeric codes: ${encoding.id}`);
    }
    if (encoding.kind === "bitmask-u32") {
      if (
        numericAssignments.some((value) => value <= 0 || (value & (value - 1)) !== 0) ||
        numericAssignments.reduce((mask, value) => mask | value, 0) !==
          encoding.allowedMask
      ) {
        throw new Error(`Category 9 bitmask encoding drifted: ${encoding.id}`);
      }
    }
  }
  for (const rule of vectors.canonicalizationRules) {
    const references = [
      ...(rule.fieldRefs ?? []),
      ...(rule.fieldRef ? [rule.fieldRef] : []),
    ];
    for (const fieldRef of references) {
      if (!siteIds.has(fieldRef)) assertFieldRef(fieldRef, rule.id);
    }
  }
  for (const cardinality of vectors.inlineCardinalities) {
    if (
      cardinality.physicalInstances !== 1 ||
      cardinality.includedInAllocationSiteTotal !== false ||
      cardinality.optionOrNicheRepresentationAllowed !== false ||
      cardinality.semanticPresenceField !== "present"
    ) {
      throw new Error(`Category 9 inline cardinality drifted: ${cardinality.id}`);
    }
  }

  const materializedSites = [
    ...vectors.materializationSteps[0].siteIds,
    ...vectors.materializationSteps.slice(1, 36).map((step) => step.siteId),
  ];
  assertExactJson(
    materializedSites,
    category9AllocationSiteOrder,
    "Category 9 materialization site order",
  );
  for (const step of vectors.materializationSteps) {
    if (step.allocations !== 0 || step.category10Calls > 0 || step.category11Calls > 0) {
      throw new Error(
        `Category 9 materializer adds allocation/category10/11 work: ${step.id}`,
      );
    }
    if (step.siteId) {
      const site = vectors.allocationSites.find(
        (candidate) => candidate.id === step.siteId,
      );
      if (!site || step.sourceFormulaId !== site.countFormula) {
        throw new Error(`Category 9 materializer count binding drifted: ${step.id}`);
      }
    }
  }
  assertExactJson(
    vectors.materializationSteps.slice(36, 38).map((step) => step.inlineLayoutId),
    ["inline.physics-group", "inline.ik-controller"],
    "Category 9 inline materialization order",
  );

  const mixed = vectors.censusVectors.find((vector) => vector.id === "census.mixed-full");
  if (mixed?.expected.siteCounts.length !== 39) {
    throw new Error("Category 9 mixed census must publish all 39 site counts");
  }
  for (const [index, failure] of vectors.failureVectors.entries()) {
    const siteId = category9AllocationSiteOrder[index];
    assertExactJson(
      {
        id: failure.id,
        order: failure.order,
        fixtureId: failure.fixtureId,
        hookTuple: failure.hookTuple,
        ordinalSemantics: failure.ordinalSemantics,
        expectedTrace: failure.expectedTrace,
        allocatorCallsAtDeniedSite: failure.allocatorCallsAtDeniedSite,
        expectedStatus: failure.expectedStatus,
      },
      {
        id: `failure.${siteId}`,
        order: index + 1,
        fixtureId: "census.mixed-full",
        hookTuple: {
          siteTemplateId: siteId,
          ownerSlot: null,
          attemptOrdinal: index,
          additionalCount: mixed.expected.siteCounts[index],
        },
        ordinalSemantics: "zero-based-global-nonzero-reserve-attempt-order",
        expectedTrace: {
          priorSiteOrderPrefixLength: index,
          priorSiteOrderSource: "allocationSites",
          priorSiteEvents: ["reserve-attempt", "reserve-success"],
          deniedSiteEvents: ["reserve-attempt", "test-denial", "resource-failure"],
          laterReservationAttempts: 0,
          materializationEvents: 0,
          mathCalls: 0,
          committedMutations: 0,
        },
        allocatorCallsAtDeniedSite: 0,
        expectedStatus: 6,
      },
      `Category 9 failure tuple ${siteId}`,
    );
  }

  const foundationFields = new Set([
    "generation",
    "canvas_width",
    "canvas_height",
    "direct_projected_scalar_count",
    "derived_evaluation_mesh_count",
    "mask_edge_count",
  ]);
  const retainedPrerequisites = new Set([
    "validated-candidate",
    "correlated-texture-plan",
  ]);
  const lifecycleActionOps = [
    "copyExact",
    "resetPositiveZero",
    "clearFlag",
    "setFlag",
    "overwriteAll",
    "setControlState",
    "swapAllocation",
    "swapField",
    "swapFlag",
    "resetZero",
  ];
  const lifecycleConditionVariants = [
    "inline-field-equals",
    "site-length-greater-than-zero",
    "effective-d64-strictly-greater-than-positive-zero",
    "all",
  ];
  assertExactJson(
    vectors.lifecycleActionLanguage.actionOps,
    lifecycleActionOps,
    "Category 9 lifecycle action-op language",
  );
  assertExactJson(
    vectors.lifecycleActionLanguage.conditionVariants,
    lifecycleConditionVariants,
    "Category 9 lifecycle condition language",
  );
  const lifecycleActionOpSet = new Set(lifecycleActionOps);
  const lifecycleConditionSet = new Set(lifecycleConditionVariants);
  const controlStateIds = new Set(vectors.controlStates.map((state) => state.id));
  if (vectors.controlStates.some((state) => state.storage !== "control-flow-only")) {
    throw new Error("Category 9 control states must have no layout storage");
  }
  visitObjects(vectors.lifecycleBindings, (object, objectPath) => {
    if (object.op && !lifecycleActionOpSet.has(object.op)) {
      throw new Error(`unrecognized lifecycle action op at ${objectPath}`);
    }
    if (
      object.kind &&
      (objectPath.includes(".when") || objectPath.includes(".conditions[")) &&
      !lifecycleConditionSet.has(object.kind)
    ) {
      throw new Error(`unrecognized lifecycle condition kind at ${objectPath}`);
    }
    if (object.controlStateId && !controlStateIds.has(object.controlStateId)) {
      throw new Error(`unresolved lifecycle control state at ${objectPath}`);
    }
    if (object.foundationField && !foundationFields.has(object.foundationField)) {
      throw new Error(`unresolved lifecycle foundation field at ${objectPath}`);
    }
    if (
      object.retainedPrerequisite &&
      !retainedPrerequisites.has(object.retainedPrerequisite)
    ) {
      throw new Error(`unresolved retained prerequisite at ${objectPath}`);
    }
    if (object.siteId && object.field) {
      const site = vectors.allocationSites.find(
        (candidate) => candidate.id === object.siteId,
      );
      if (!site || !layoutFieldSets.get(site.elementLayout)?.has(object.field)) {
        throw new Error(`unresolved lifecycle site field at ${objectPath}`);
      }
    }
    if (object.inlineLayoutId && object.field) {
      if (!layoutFieldSets.get(object.inlineLayoutId)?.has(object.field)) {
        throw new Error(`unresolved lifecycle inline field at ${objectPath}`);
      }
    }
  });
  if (
    vectors.lifecycleBindings.some(
      (binding) => !Array.isArray(binding.failure) || binding.failure.length !== 0,
    )
  ) {
    throw new Error("Category 9 lifecycle failures must commit zero actions");
  }
  const physicsBinding = vectors.lifecycleBindings.find(
    (binding) => binding.id === "lifecycle-binding.physics",
  );
  if (
    physicsBinding?.when?.kind !== "inline-field-equals" ||
    physicsBinding.when.inlineLayoutId !== "inline.physics-group" ||
    physicsBinding.when.field !== "present" ||
    physicsBinding.when.value !== 1 ||
    physicsBinding.whenFalse !==
      "no-op-and-preserve-canonical.absent-physics-byte-for-byte"
  ) {
    throw new Error("Category 9 absent-physics lifecycle guard drifted");
  }

  if (
    vectors.category11Boundary.some(
      (row) =>
        (row.status ?? row.decision) !== "excluded" ||
        (row.allocationSiteIds ?? row.allocationSites).length !== 0,
    )
  ) {
    throw new Error("Category 11 must remain excluded with zero allocation sites");
  }
  assertExactJson(
    vectors.requiredTests.map((test) => test.requirement),
    category9RequiredTestRequirements,
    "Category 9 required-test corpus",
  );
}

function assertCategory9Layouts(vectors) {
  const layouts = [...vectors.elementLayouts, ...vectors.inlineLayouts];
  const byRustType = new Map();
  const primitiveTypes = new Map([
    ["u8", { size: 1, align: 1 }],
    ["u32", { size: 4, align: 4 }],
    ["u64", { size: 8, align: 8 }],
  ]);
  const resolveType = (typeName) => {
    const array = /^\[([^;]+);([0-9]+)\]$/.exec(typeName);
    if (array) {
      const element = resolveType(array[1]);
      return { size: element.size * Number(array[2]), align: element.align };
    }
    const resolved = primitiveTypes.get(typeName) ?? byRustType.get(typeName);
    if (!resolved) throw new Error(`Category 9 layout uses unknown type ${typeName}`);
    return resolved;
  };
  const computed = new Map();
  for (const layout of layouts) {
    if (
      /\b(?:usize|isize|String|Vec|Box|Option|NonNull|\*)\b/.test(layout.fields.join(";"))
    ) {
      throw new Error(`Category 9 layout is not target-fixed: ${layout.id}`);
    }
    let offset = 0;
    let maxAlign = 1;
    const fieldOffsets = {};
    for (const fieldDeclaration of layout.fields) {
      const separator = fieldDeclaration.indexOf(":");
      if (separator <= 0) {
        throw new Error(`Category 9 malformed layout field: ${fieldDeclaration}`);
      }
      const name = fieldDeclaration.slice(0, separator);
      const fieldType = resolveType(fieldDeclaration.slice(separator + 1));
      offset = alignUp(offset, fieldType.align);
      fieldOffsets[name] = offset;
      offset += fieldType.size;
      maxAlign = Math.max(maxAlign, fieldType.align);
    }
    const size = alignUp(offset, maxAlign);
    if (size !== layout.elementBytes || maxAlign !== layout.alignBytes) {
      throw new Error(
        `Category 9 independently computed layout drifted: ${layout.id} => ${size}/${maxAlign}`,
      );
    }
    const result = { size, align: maxAlign, fieldOffsets, computedEnd: offset };
    computed.set(layout.id, result);
    byRustType.set(layout.rustType, { size, align: maxAlign });
  }

  assertExactJson(
    vectors.layoutAssertions.map((assertion) => assertion.layoutId),
    layouts.map((layout) => layout.id),
    "Category 9 layout assertion order",
  );
  for (const [index, assertion] of vectors.layoutAssertions.entries()) {
    const layout = layouts[index];
    const actual = computed.get(layout.id);
    const expectedRepresentation =
      layout.fields.length === 1 ? "repr(transparent)" : "repr(C)";
    if (
      assertion.id !== `assert-${layout.id}` ||
      assertion.representation !== expectedRepresentation ||
      assertion.expectedBytes !== actual.size ||
      assertion.expectedAlign !== actual.align ||
      assertion.computedEnd !== actual.computedEnd ||
      assertion.computedEnd !== actual.size ||
      assertion.explicitPaddingZero !== true ||
      assertion.fixedWidthNoPointer !== true
    ) {
      throw new Error(`Category 9 layout assertion drifted: ${layout.id}`);
    }
    assertExactJson(
      assertion.fieldOffsets,
      actual.fieldOffsets,
      `Category 9 field offsets ${layout.id}`,
    );
  }

  const layoutIds = new Set(vectors.elementLayouts.map((layout) => layout.id));
  for (const site of vectors.allocationSites) {
    if (!layoutIds.has(site.elementLayout)) {
      throw new Error(`Category 9 site uses non-element or missing layout: ${site.id}`);
    }
    const byteFormula = vectors.countFormulas.find(
      (formula) => formula.id === site.byteFormula,
    );
    if (
      byteFormula?.siteId !== site.id ||
      byteFormula.elementBytes !== computed.get(site.elementLayout).size ||
      byteFormula.requiresAtMost !== 2_147_483_647
    ) {
      throw new Error(`Category 9 site byte/layout declaration drifted: ${site.id}`);
    }
  }
}

function assertCategory9FormulaPrograms(vectors) {
  const first41 = [
    "meshCount",
    "directUnskinnedVertexComponents",
    "uvComponentCount",
    "indexCount",
    "symbolByteCount",
    "parameterCount",
    "presetCount",
    "presetValueCount",
    "bindingCount",
    "bindingPointCount",
    "bindingTargetCount",
    "boneCount",
    "enabledPhysicsGroupCount",
    "enabledPendulumCount",
    "enabledPhysicsInputCount",
    "enabledPhysicsOutputCount",
    "controllerCount",
    "controllerConstraintCount",
    "skinnedMeshCount",
    "skinnedVertexCount",
    "skinWeightCount",
    "usableBindInverseCount",
    "skinnedCoordinateCount",
    "stagedParameterDestinationCount",
    "stagedBoneDestinationCount",
    "preWorldCount",
    "postWorldCount",
    "directProjectedScalarCount",
    "derivedEvaluationMeshCount",
    "maskEdgeCount",
    "range.directVertices",
    "range.uvs",
    "range.indices",
    "range.symbols",
    "range.presetValues",
    "range.bindingPoints",
    "range.skinRest",
    "range.skinWeightRows",
    "range.skinWeights",
    "range.bindInverses",
    "range.derived",
  ];
  const expectedFormulaOrder = [
    ...first41,
    ...category9AllocationSiteOrder.map((siteId) => `bytes.${siteId}`),
    "totalLogicalBytes",
    "layoutAndUsizeChecks",
  ];
  assertExactJson(
    vectors.countFormulas.map((formula) => formula.id),
    expectedFormulaOrder,
    "Category 9 82-formula order",
  );
  assertExactJson(
    vectors.formulaPrograms.map((program) => program.formulaId),
    expectedFormulaOrder,
    "Category 9 82-program formula order",
  );
  assertExactJson(
    vectors.selfValidation.formulaProgramOrder,
    expectedFormulaOrder,
    "Category 9 published 82-program order",
  );
  if (
    vectors.formulaPrograms.some(
      (program) => program.id !== `program.${program.formulaId}`,
    )
  ) {
    throw new Error("Category 9 formula-program IDs drifted");
  }
  assertExactJson(
    vectors.countFormulas.map((formula) => formula.domain),
    [...Array(41).fill("checked-u32"), ...Array(40).fill("checked-u64"), "target-layout"],
    "Category 9 formula declared domains",
  );
  assertExactJson(
    vectors.formulaPrograms.map((program) => program.resultDomain),
    [...Array(41).fill("u32"), ...Array(40).fill("u64"), "proof-bool"],
    "Category 9 formula result domains",
  );

  const language = vectors.formulaLanguage;
  const expectedOps = [
    "const",
    "ref",
    "field",
    "len",
    "utf8HexByteLength",
    "add",
    "mul",
    "divExact",
    "if",
    "eq",
    "sumRows",
    "countRows",
    "uniqueRows",
    "intersectionCount",
    "prefixRanges",
    "siteBytes",
    "siteByteSum",
    "layoutGate",
  ];
  assertExactJson(language.ops, expectedOps, "Category 9 formula op inventory");
  assertExactJson(
    Object.keys(language.opSchemas),
    expectedOps,
    "Category 9 op-schema inventory",
  );
  const rootPaths = new Set(language.pathGrammar.rootArrays);
  const virtualPaths = new Set(Object.keys(language.pathGrammar.virtualPaths));
  const fieldPaths = new Set(language.pathGrammar.allowedFieldPaths);
  const uniqueKeyPaths = new Set(language.pathGrammar.uniqueKeyPaths.allowed);
  const formulaOrder = new Map(
    vectors.formulaPrograms.map((program) => [program.formulaId, program.order]),
  );
  const siteIds = new Set(category9AllocationSiteOrder);
  let astNodeCount = 0;

  const validatePath = (programPath, aliases, label) => {
    if (rootPaths.has(programPath) || virtualPaths.has(programPath)) return;
    if (!fieldPaths.has(programPath)) {
      throw new Error(`${label} uses path outside the closed grammar: ${programPath}`);
    }
    const alias = programPath.split(".")[0];
    if (!aliases.has(alias)) {
      throw new Error(`${label} uses unbound formula alias ${alias}`);
    }
  };
  const validateNode = (node, currentOrder, aliases, label) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) {
      throw new Error(`${label} contains a non-object AST node`);
    }
    astNodeCount += 1;
    const schema = language.opSchemas[node.op];
    if (!schema) throw new Error(`${label} uses unknown op ${String(node.op)}`);
    const allowedKeys = new Set([...schema.requiredKeys, ...schema.optionalKeys]);
    const extraKeys = Object.keys(node).filter((key) => !allowedKeys.has(key));
    if (extraKeys.length !== 0) {
      throw new Error(`${label} ${node.op} has extra keys: ${extraKeys.join(",")}`);
    }
    for (const requiredKey of schema.requiredKeys) {
      if (!Object.hasOwn(node, requiredKey)) {
        throw new Error(`${label} ${node.op} omits ${requiredKey}`);
      }
    }
    for (const [key, constraint] of Object.entries(schema.literalConstraints ?? {})) {
      if (constraint === "nonempty-adopted-invariant-id") {
        if (typeof node[key] !== "string" || node[key].length === 0) {
          throw new Error(`${label} ${node.op}.${key} must be a nonempty invariant ID`);
        }
      } else {
        assertExactJson(node[key], constraint, `${label} ${node.op}.${key}`);
      }
    }
    switch (node.op) {
      case "const":
        if (!["u32", "u64"].includes(node.domain) || !/^\d+$/.test(String(node.value))) {
          throw new Error(`${label} has invalid const domain/value`);
        }
        break;
      case "ref": {
        const referencedOrder = formulaOrder.get(node.formulaId);
        if (!referencedOrder || referencedOrder >= currentOrder) {
          throw new Error(
            `${label} formula ref is not strictly earlier: ${node.formulaId}`,
          );
        }
        break;
      }
      case "field":
        validatePath(node.path, aliases, label);
        break;
      case "len":
        validatePath(node.path, aliases, label);
        break;
      case "utf8HexByteLength":
        validateNode(node.value, currentOrder, aliases, `${label}.value`);
        break;
      case "add":
      case "mul":
        if (!["u32", "u64"].includes(node.domain) || !Array.isArray(node.args)) {
          throw new Error(`${label} has invalid ${node.op} domain/args`);
        }
        node.args.forEach((child, index) => {
          validateNode(child, currentOrder, aliases, `${label}.args[${index}]`);
        });
        break;
      case "divExact":
        if (!/^\d+$/.test(String(node.divisor)) || BigInt(node.divisor) === 0n) {
          throw new Error(`${label} has invalid exact divisor`);
        }
        validateNode(node.value, currentOrder, aliases, `${label}.value`);
        break;
      case "if":
        validateNode(node.when, currentOrder, aliases, `${label}.when`);
        validateNode(node.then, currentOrder, aliases, `${label}.then`);
        validateNode(node.else, currentOrder, aliases, `${label}.else`);
        break;
      case "eq":
        for (const side of ["left", "right"]) {
          if (node[side] && typeof node[side] === "object") {
            validateNode(node[side], currentOrder, aliases, `${label}.${side}`);
          } else if (!["string", "boolean"].includes(typeof node[side])) {
            throw new Error(`${label}.${side} has an invalid equality literal`);
          }
        }
        break;
      case "sumRows":
      case "countRows": {
        validatePath(node.path, aliases, label);
        if (!["row", "mesh"].includes(node.as)) {
          throw new Error(`${label} binds an unapproved alias ${node.as}`);
        }
        const rowAliases = new Set([...aliases, node.as]);
        if (node.where) {
          validateNode(node.where, currentOrder, rowAliases, `${label}.where`);
        }
        if (node.value) {
          validateNode(node.value, currentOrder, rowAliases, `${label}.value`);
        }
        break;
      }
      case "uniqueRows": {
        validatePath(node.path, aliases, label);
        if (
          !Array.isArray(node.keyPaths) ||
          node.keyPaths.some((keyPath) => !uniqueKeyPaths.has(keyPath))
        ) {
          throw new Error(`${label} uses an invalid uniqueRows key path`);
        }
        if (node.where) {
          validateNode(
            node.where,
            currentOrder,
            new Set([...aliases, "row"]),
            `${label}.where`,
          );
        }
        break;
      }
      case "intersectionCount":
        validatePath(node.leftPath, aliases, label);
        validatePath(node.rightPath, aliases, label);
        break;
      case "prefixRanges": {
        validatePath(node.path, aliases, label);
        const rowAliases = new Set([...aliases, node.as]);
        validateNode(node.length, currentOrder, rowAliases, `${label}.length`);
        break;
      }
      case "siteBytes":
        if (!siteIds.has(node.siteId)) {
          throw new Error(`${label} references an unknown allocation site`);
        }
        break;
      case "siteByteSum":
      case "layoutGate":
        break;
      default:
        throw new Error(`${label} validator omitted op ${node.op}`);
    }
  };
  for (const program of vectors.formulaPrograms) {
    validateNode(program.program, program.order, new Set(), program.id);
  }
  if (astNodeCount !== 169) {
    throw new Error(`Category 9 formula AST must contain 169 nodes, got ${astNodeCount}`);
  }
}

function assertCategory9ConcreteCensus(vectors) {
  const normalized = vectors.censusVectors.filter(
    (vector) => vector.mode === "normalized-input",
  );
  assertExactJson(
    normalized.map((vector) => vector.id),
    ["census.zero", "census.minimal-unskinned", "census.mixed-full"],
    "Category 9 concrete census corpus",
  );
  for (const vector of normalized) {
    const results = evaluateCategory9Programs(vectors, vector.input);
    const actualBaseCounts = Object.fromEntries(
      vectors.formulaPrograms
        .slice(0, 30)
        .map((program) => [program.formulaId, Number(results.get(program.formulaId))]),
    );
    assertExactJson(
      actualBaseCounts,
      vector.expected.baseCounts,
      `${vector.id} base-count recomputation`,
    );
    const actualRanges = Object.fromEntries(
      vectors.formulaPrograms
        .slice(30, 41)
        .map((program) => [
          program.formulaId,
          results
            .get(program.formulaId)
            .map(([start, length]) => [Number(start), Number(length)]),
        ]),
    );
    assertExactJson(
      actualRanges,
      vector.expected.ranges,
      `${vector.id} range recomputation`,
    );
    const actualSiteCounts = vectors.allocationSites.map((site) =>
      Number(results.get(site.countFormula)),
    );
    assertExactJson(
      actualSiteCounts,
      vector.expected.siteCounts,
      `${vector.id} 39-site count recomputation`,
    );
    if (
      results.get("totalLogicalBytes").toString() !== vector.expected.totalLogicalBytes ||
      results.get("layoutAndUsizeChecks") !== true
    ) {
      throw new Error(`${vector.id} byte total or layout gate did not recompute`);
    }
  }

  const layoutBytes = new Map(
    vectors.elementLayouts.map((layout) => [layout.id, BigInt(layout.elementBytes)]),
  );
  const injectedSiteCounts = (injected) => {
    const counts = new Map(
      vectors.countFormulas
        .slice(0, 30)
        .map((formula) => [
          formula.id,
          BigInt(injected[formula.id] ?? injected.allOtherCounts ?? "0"),
        ]),
    );
    counts.set("skinnedCoordinateCount", counts.get("skinnedVertexCount") * 2n);
    counts.set(
      "preWorldCount",
      counts.get("controllerCount") === 1n ? counts.get("boneCount") : 0n,
    );
    counts.set("postWorldCount", counts.get("boneCount"));
    counts.set("derivedEvaluationMeshCount", counts.get("skinnedMeshCount"));
    return vectors.allocationSites.map((site) => counts.get(site.countFormula) ?? 0n);
  };
  const siteTotal = (counts) =>
    counts.reduce(
      (total, count, index) =>
        total + count * layoutBytes.get(vectors.allocationSites[index].elementLayout),
      0n,
    );
  const maximum = vectors.censusVectors.find(
    (vector) => vector.id === "census.abstract-schema-cardinality-max-unskinned",
  );
  const maximumCounts = injectedSiteCounts(maximum.injectedCounts);
  assertExactJson(
    maximumCounts.map(Number),
    maximum.expected.siteCounts,
    "Category 9 abstract maximum site counts",
  );
  if (
    siteTotal(maximumCounts).toString() !== maximum.expected.totalLogicalBytes ||
    siteTotal(maximumCounts) > 2_147_483_647n
  ) {
    throw new Error("Category 9 abstract maximum byte total drifted");
  }
  for (const [id, accepted] of [
    ["census.total-cap-neighbor-accepted", true],
    ["census.total-cap-neighbor-rejected", false],
  ]) {
    const vector = vectors.censusVectors.find((candidate) => candidate.id === id);
    const counts = injectedSiteCounts(vector.injectedCounts);
    const total = siteTotal(counts);
    if (accepted) {
      if (
        total !== 2_147_483_647n ||
        total.toString() !== vector.expected.totalLogicalBytes
      ) {
        throw new Error("Category 9 accepted common-cap neighbor drifted");
      }
    } else if (
      total !== 2_147_483_648n ||
      total.toString() !== vector.expected.totalAttempt ||
      vector.expected.status !== 6 ||
      vector.expected.reservationEvents !== 0
    ) {
      throw new Error("Category 9 rejected common-cap neighbor drifted");
    }
  }
  const sourceNeighbor = vectors.censusVectors.find(
    (vector) => vector.id === "census.source-u32-neighbor-rejected",
  );
  if (
    BigInt(sourceNeighbor.input.rawSourceCount) !== 0x1_0000_0000n ||
    sourceNeighbor.expected.status !== 6 ||
    sourceNeighbor.expected.laterFormulaEvents !== 0 ||
    sourceNeighbor.expected.reservationEvents !== 0
  ) {
    throw new Error("Category 9 source-u32 failure neighbor drifted");
  }
  const rangeNeighbor = vectors.censusVectors.find(
    (vector) => vector.id === "census.range-neighbor-rejected",
  );
  if (
    BigInt(rangeNeighbor.input.start) + BigInt(rangeNeighbor.input.len) !==
      0x1_0000_0000n ||
    rangeNeighbor.expected.status !== 6 ||
    rangeNeighbor.expected.siteByteEvents !== 0 ||
    rangeNeighbor.expected.reservationEvents !== 0
  ) {
    throw new Error("Category 9 range-u32 failure neighbor drifted");
  }
}

function assertCategory9OrderingVectors(vectors) {
  const expectedIds = [
    "ordering.direct-prefix",
    "ordering.symbol-arena",
    "ordering.preset-values-utf8",
    "ordering.binding-target-first-occurrence",
    "ordering.physics-destinations-separated-last-wins",
    "ordering.bone-world-order",
    "ordering.skin-and-bind-inverse",
    "ordering.phase-trace",
    "ordering.direct-encoding-cases",
    "ordering.controller-and-physics-branches",
  ];
  assertExactJson(
    vectors.orderingVectors.map((vector) => vector.id),
    expectedIds,
    "Category 9 ordering-vector inventory",
  );
  const byId = new Map(vectors.orderingVectors.map((vector) => [vector.id, vector]));
  const prefixRanges = (rows, lengthOf, label) => {
    let prefix = 0;
    return rows.map((row, index) => {
      const length = lengthOf(row, index);
      if (!Number.isSafeInteger(length) || length < 0) {
        throw new Error(`${label}[${index}] is not an exact nonnegative integer`);
      }
      const range = [prefix, length];
      prefix += length;
      if (!Number.isSafeInteger(prefix) || prefix > 0xffff_ffff) {
        throw new Error(`${label} prefix overflowed u32`);
      }
      return range;
    });
  };

  const direct = byId.get("ordering.direct-prefix");
  assertExactJson(
    direct.input.map((row) => row.meshSlot),
    direct.input.map((_, index) => index),
    "Category 9 direct ordering mesh slots",
  );
  assertExactJson(
    direct.expected,
    {
      directVertices: prefixRanges(
        direct.input,
        (row) => (row.skinned ? 0 : row.vertexComponents),
        "Category 9 direct vertex ranges",
      ),
      uvs: prefixRanges(
        direct.input,
        (row) => row.uvComponents,
        "Category 9 direct UV ranges",
      ),
      indices: prefixRanges(
        direct.input,
        (row) => row.indexCount,
        "Category 9 direct index ranges",
      ),
      derived: prefixRanges(
        direct.input,
        (row) => (row.skinned ? row.vertexComponents : 0),
        "Category 9 derived ranges",
      ),
      fillTraversal: "meshSlot-then-component-or-index",
    },
    "Category 9 direct prefix ordering",
  );

  const symbols = byId.get("ordering.symbol-arena");
  const allSymbols = [...symbols.input.parameters, ...symbols.input.presets];
  for (const [index, row] of symbols.input.parameters.entries()) {
    if (row.slot !== index) throw new Error("Category 9 parameter symbol slots drifted");
  }
  for (const [index, row] of symbols.input.presets.entries()) {
    if (row.slot !== index) throw new Error("Category 9 preset symbol slots drifted");
  }
  for (const row of allSymbols) {
    if (!/^(?:[0-9a-f]{2})+$/.test(row.idUtf8Hex)) {
      throw new Error("Category 9 symbol arena contains noncanonical UTF-8 hex");
    }
  }
  const symbolRanges = prefixRanges(
    allSymbols,
    (row) => row.idUtf8Hex.length / 2,
    "Category 9 symbol arena ranges",
  );
  assertExactJson(
    symbols.expected,
    {
      arenaHex: allSymbols.map((row) => row.idUtf8Hex).join(""),
      parameterRanges: symbolRanges.slice(0, symbols.input.parameters.length),
      presetRanges: symbolRanges.slice(symbols.input.parameters.length),
      terminators: 0,
      deduplication: false,
    },
    "Category 9 symbol arena ordering",
  );

  const presets = byId.get("ordering.preset-values-utf8");
  const slotByHex = new Map();
  for (const row of presets.input.parameterSlots) {
    if (!/^(?:[0-9a-f]{2})+$/.test(row.idUtf8Hex) || slotByHex.has(row.idUtf8Hex)) {
      throw new Error("Category 9 preset ordering input is not unique UTF-8 hex");
    }
    slotByHex.set(row.idUtf8Hex, row.slot);
  }
  const byteOrder = [...presets.input.insertionOrder].sort((left, right) =>
    Buffer.from(left, "hex").compare(Buffer.from(right, "hex")),
  );
  assertExactJson(
    presets.expected,
    {
      utf8ByteOrder: byteOrder,
      parameterSlots: byteOrder.map((hex) => slotByHex.get(hex)),
      valueRange: [0, byteOrder.length],
    },
    "Category 9 preset UTF-8 byte ordering",
  );

  const binding = byId.get("ordering.binding-target-first-occurrence");
  const targetSlots = new Map();
  const firstInputIndices = [];
  const perBindingTargetSlots = binding.input.map((key, inputIndex) => {
    if (!targetSlots.has(key)) {
      targetSlots.set(key, targetSlots.size);
      firstInputIndices.push(inputIndex);
    }
    return targetSlots.get(key);
  });
  assertExactJson(
    binding.expected,
    {
      bindingTargetCount: targetSlots.size,
      firstInputIndices,
      perBindingTargetSlots,
      accumulatorCount: targetSlots.size,
    },
    "Category 9 binding-target first-occurrence ordering",
  );

  const physics = byId.get("ordering.physics-destinations-separated-last-wins");
  const enabledGroups = physics.input.groups.filter((group) => group.enabled === true);
  if (enabledGroups.length !== 1) {
    throw new Error("Category 9 physics ordering must select exactly one enabled group");
  }
  const outputs = enabledGroups[0].outputs;
  const destinations = { parameter: new Map(), bone: new Map() };
  const perOutputStageSlots = [];
  outputs.forEach(([kind, slot], outputIndex) => {
    const map = destinations[kind];
    if (!map) throw new Error(`Category 9 unknown physics destination kind ${kind}`);
    if (!map.has(slot)) map.set(slot, { stageSlot: map.size, last: outputIndex });
    else map.get(slot).last = outputIndex;
    perOutputStageSlots.push([kind, map.get(slot).stageSlot]);
  });
  assertExactJson(
    physics.expected,
    {
      retainedGroupIndex: enabledGroups[0].groupIndex,
      parameterFirstOccurrenceSlots: [...destinations.parameter.keys()],
      boneFirstOccurrenceSlots: [...destinations.bone.keys()],
      perOutputStageSlots,
      parameterLastWriterOutputIndices: [...destinations.parameter.values()].map(
        (entry) => entry.last,
      ),
      boneLastWriterOutputIndices: [...destinations.bone.values()].map(
        (entry) => entry.last,
      ),
      stagedParameterCount: destinations.parameter.size,
      stagedBoneCount: destinations.bone.size,
    },
    "Category 9 physics first-occurrence/last-writer ordering",
  );

  const bones = byId.get("ordering.bone-world-order");
  const remaining = new Map(bones.input.map((row) => [row.boneSlot, row]));
  const worldOrderBoneSlots = [];
  const selected = new Set();
  while (remaining.size > 0) {
    const next = bones.input.find(
      (row) =>
        remaining.has(row.boneSlot) &&
        (row.parentSlot === null || selected.has(row.parentSlot)),
    );
    if (!next) throw new Error("Category 9 bone world-order input contains a cycle");
    remaining.delete(next.boneSlot);
    selected.add(next.boneSlot);
    worldOrderBoneSlots.push(next.boneSlot);
  }
  const highestBoneSlot = Math.max(...bones.input.map((row) => row.boneSlot));
  const boneDfsIndexByBoneSlot = Array.from({ length: highestBoneSlot + 1 });
  worldOrderBoneSlots.forEach((slot, dfsIndex) => {
    boneDfsIndexByBoneSlot[slot] = dfsIndex;
  });
  assertExactJson(
    bones.expected,
    {
      worldOrderBoneSlots,
      boneDfsIndexByBoneSlot,
      bufferIndexDomain: "BoneSlot",
      traversalIndexDomain: "boneDfsIndex",
    },
    "Category 9 bone world-order projection",
  );

  const skin = byId.get("ordering.skin-and-bind-inverse");
  const weightTraversal = [];
  const usableBindInverseOrder = [];
  const omittedPresentPairs = [];
  const usableCounts = [];
  for (const mesh of skin.input) {
    const referenced = new Set();
    mesh.vertexRows.forEach((row, vertexIndex) => {
      row.forEach((boneSlot) => {
        referenced.add(boneSlot);
        weightTraversal.push([mesh.meshSlot, vertexIndex, boneSlot]);
      });
    });
    let usable = 0;
    for (const boneSlot of mesh.presentBindInverseBoneSlots) {
      if (referenced.has(boneSlot)) {
        usableBindInverseOrder.push([mesh.meshSlot, boneSlot]);
        usable += 1;
      } else {
        omittedPresentPairs.push([mesh.meshSlot, boneSlot]);
      }
    }
    usableCounts.push(usable);
  }
  assertExactJson(
    skin.expected,
    {
      weightTraversal,
      usableBindInverseOrder,
      bindInverseRanges: prefixRanges(
        usableCounts,
        (count) => count,
        "Category 9 bind-inverse ranges",
      ),
      omittedPresentPairs,
    },
    "Category 9 skin/bind-inverse ordering",
  );

  const phase = byId.get("ordering.phase-trace");
  assertExactJson(
    phase.expected,
    {
      censusFormulaOrders: `1-through-${vectors.formulaPrograms.length}`,
      reserveSiteOrders: `1-through-${vectors.allocationSites.length}`,
      perReserveEvents: ["reserve-attempt", "reserve-success"],
      materializationStepOrders: `1-through-${vectors.materializationSteps.length}`,
      terminal: "return-foundation",
      forbiddenBeforeTerminal: [
        "category10",
        "math-call",
        "checkpoint",
        "derived-cast",
        "committed-mutation",
      ],
    },
    "Category 9 phase trace ordering",
  );

  const encodings = byId.get("ordering.direct-encoding-cases");
  const blendCodes = { normal: 0, multiply: 1, screen: 2, add: 3 };
  assertExactJson(
    encodings.expected,
    {
      directFlags: encodings.input.map(
        (row) =>
          (row.skinned ? 0 : 1) |
          (row.multiply === null ? 0 : 2) |
          (Array.isArray(row.screen) ? 4 : 0),
      ),
      blendCodes: encodings.input.map((row) => blendCodes[row.blend]),
      skinnedDirectVertexRanges: "empty-current-prefix",
      skinnedXY: ["00000000", "00000000"],
      blackScreenCanonical: "three-zero-words-and-screen-flag-clear",
      meshStaticFlags: encodings.input.map(
        (row) =>
          (row.skinned ? 1 : 0) |
          (row.cullingEnabled ? 2 : 0) |
          (row.effectiveVisible ? 4 : 0),
      ),
    },
    "Category 9 direct value encodings",
  );

  const branches = byId.get("ordering.controller-and-physics-branches");
  const controllerCases = branches.input.controllerCases.map((row) => {
    const controllerCount = row.controllers.length;
    const constraintCount = row.controllers.reduce(
      (total, controller) => total + controller.boneChain.length,
      0,
    );
    const expected = {
      case: row.case,
      controllerCount,
      constraintCount,
      preWorldCount: controllerCount === 1 ? row.boneCount : 0,
      inlinePresent: controllerCount,
    };
    if (controllerCount === 0) {
      expected.canonicalizationId = "canonical.absent-controller";
      expected.ikScratchControlStateOnSuccess = "invalid";
    } else {
      const controller = row.controllers[0];
      expected.controllerIndex = controller.controllerIndex;
      expected.solverCode = controller.solver === "twoBone" ? 0 : 1;
      expected.maxIterations = controller.maxIterations ?? 10;
      expected.ikScratchControlStateOnSuccess =
        constraintCount > 0 && controller.effectiveInfluenceBits !== "0000000000000000"
          ? "fully-overwritten"
          : "invalid";
    }
    return expected;
  });
  const physicsCases = branches.input.physicsCases.map((row) => {
    const enabled = row.physicsGroups.filter((group) => group.enabled === true);
    const expected = {
      case: row.case,
      enabledGroupCount: enabled.length,
      pendulumCount: enabled.reduce(
        (total, group) => total + (group.pendulumCount ?? 0),
        0,
      ),
      inputCount: enabled.reduce((total, group) => total + (group.inputCount ?? 0), 0),
      outputCount: enabled.reduce((total, group) => total + (group.outputCount ?? 0), 0),
      inlinePresent: enabled.length,
    };
    if (enabled.length === 0) {
      expected.canonicalizationId = "canonical.absent-physics";
    } else if (enabled.length === 1) {
      expected.groupIndex = enabled[0].groupIndex;
    } else {
      throw new Error("Category 9 branch vector has multiple enabled physics groups");
    }
    return expected;
  });
  assertExactJson(
    branches.expected,
    { controllerCases, physicsCases },
    "Category 9 controller/physics branch ordering",
  );
}

function evaluateCategory9Programs(vectors, input) {
  const results = new Map();
  const programsById = new Map(
    vectors.formulaPrograms.map((program) => [program.formulaId, program]),
  );
  const sites = new Map(vectors.allocationSites.map((site) => [site.id, site]));
  const layoutBytes = new Map(
    vectors.elementLayouts.map((layout) => [layout.id, BigInt(layout.elementBytes)]),
  );
  const checkDomain = (value, domain, label) => {
    const integer = toCategory9BigInt(value, label);
    const maximum = domain === "u32" ? 0xffff_ffffn : 0xffff_ffff_ffff_ffffn;
    if (integer < 0n || integer > maximum) {
      throw new Error(`${label} overflowed ${domain}`);
    }
    return integer;
  };
  const resolvePath = (programPath, aliases) => {
    if (programPath === "concat(parameters,presets)") {
      return [...input.parameters, ...input.presets];
    }
    if (programPath === "skins[].vertexRows") {
      return input.skins.flatMap((skin) => skin.vertexRows);
    }
    if (programPath === "physicsGroups[enabled=true].outputs") {
      return input.physicsGroups
        .filter((group) => group.enabled === true)
        .flatMap((group) => group.outputs);
    }
    const parts = programPath.split(".");
    let values;
    const first = parts.shift();
    const firstArray = first.endsWith("[]");
    const firstName = firstArray ? first.slice(0, -2) : first;
    if (aliases.has(firstName)) values = [aliases.get(firstName)];
    else if (Object.hasOwn(input, firstName)) values = [input[firstName]];
    else throw new Error(`Category 9 evaluator cannot resolve ${programPath}`);
    if (firstArray) values = values.flat();
    for (const part of parts) {
      const flatten = part.endsWith("[]");
      const name = flatten ? part.slice(0, -2) : part;
      values = values.map((value) => value[name]);
      if (flatten) values = values.flat();
    }
    if (programPath.endsWith("[].weightBoneSlots")) values = values.flat();
    return values.length === 1 ? values[0] : values;
  };
  const equal = (left, right) => {
    if (
      typeof left === "bigint" ||
      typeof right === "bigint" ||
      (typeof left === "number" && Number.isInteger(left)) ||
      (typeof right === "number" && Number.isInteger(right))
    ) {
      if (
        [left, right].every(
          (value) => typeof value === "bigint" || typeof value === "number",
        )
      ) {
        return BigInt(left) === BigInt(right);
      }
    }
    return left === right;
  };
  const evaluate = (node, aliases, label) => {
    switch (node.op) {
      case "const":
        return checkDomain(node.value, node.domain, label);
      case "ref":
        if (!results.has(node.formulaId)) {
          throw new Error(`${label} references unavailable formula ${node.formulaId}`);
        }
        return results.get(node.formulaId);
      case "field":
        return resolvePath(node.path, aliases);
      case "len": {
        const value = resolvePath(node.path, aliases);
        if (!Array.isArray(value)) throw new Error(`${label} len path is not an array`);
        return checkDomain(value.length, "u32", label);
      }
      case "utf8HexByteLength": {
        const value = evaluate(node.value, aliases, `${label}.value`);
        if (typeof value !== "string" || !/^(?:[0-9a-f]{2})+$/.test(value)) {
          throw new Error(`${label} is not nonempty lowercase even UTF-8 hex`);
        }
        return checkDomain(value.length / 2, "u32", label);
      }
      case "add": {
        let total = 0n;
        node.args.forEach((child, index) => {
          const value = evaluate(child, aliases, `${label}.args[${index}]`);
          total = checkDomain(
            total + toCategory9BigInt(value, label),
            node.domain,
            label,
          );
        });
        return total;
      }
      case "mul": {
        let total = 1n;
        node.args.forEach((child, index) => {
          const value = evaluate(child, aliases, `${label}.args[${index}]`);
          total = checkDomain(
            total * toCategory9BigInt(value, label),
            node.domain,
            label,
          );
        });
        return total;
      }
      case "divExact": {
        const value = toCategory9BigInt(evaluate(node.value, aliases, label), label);
        const divisor = BigInt(node.divisor);
        if (value % divisor !== 0n) throw new Error(`${label} exact division failed`);
        return checkDomain(value / divisor, node.domain, label);
      }
      case "if":
        return evaluate(node.when, aliases, `${label}.when`)
          ? evaluate(node.then, aliases, `${label}.then`)
          : evaluate(node.else, aliases, `${label}.else`);
      case "eq": {
        const side = (name) =>
          node[name] && typeof node[name] === "object"
            ? evaluate(node[name], aliases, `${label}.${name}`)
            : node[name];
        return equal(side("left"), side("right"));
      }
      case "sumRows": {
        const rows = resolvePath(node.path, aliases);
        let total = 0n;
        for (const [index, row] of rows.entries()) {
          const rowAliases = new Map(aliases).set(node.as, row);
          if (
            node.where &&
            !evaluate(node.where, rowAliases, `${label}.where[${index}]`)
          ) {
            continue;
          }
          total = checkDomain(
            total + toCategory9BigInt(evaluate(node.value, rowAliases, label), label),
            node.domain,
            label,
          );
        }
        return total;
      }
      case "countRows": {
        const rows = resolvePath(node.path, aliases);
        let total = 0n;
        for (const [index, row] of rows.entries()) {
          const rowAliases = new Map(aliases).set(node.as, row);
          if (evaluate(node.where, rowAliases, `${label}.where[${index}]`)) {
            total = checkDomain(total + 1n, "u32", label);
          }
        }
        return total;
      }
      case "uniqueRows": {
        const rows = resolvePath(node.path, aliases);
        const seen = new Set();
        let count = 0n;
        for (const [index, row] of rows.entries()) {
          const rowAliases = new Map(aliases).set("row", row);
          if (
            node.where &&
            !evaluate(node.where, rowAliases, `${label}.where[${index}]`)
          ) {
            continue;
          }
          const key = JSON.stringify(
            node.keyPaths.map((keyPath) =>
              keyPath.split(".").reduce((value, field) => value[field], row),
            ),
          );
          if (!seen.has(key)) {
            seen.add(key);
            count = checkDomain(count + 1n, "u32", label);
          }
        }
        return count;
      }
      case "intersectionCount": {
        const left = [...new Set(resolvePath(node.leftPath, aliases))].sort(
          (a, b) => a - b,
        );
        const right = new Set(resolvePath(node.rightPath, aliases));
        return checkDomain(left.filter((value) => right.has(value)).length, "u32", label);
      }
      case "prefixRanges": {
        const rows = resolvePath(node.path, aliases);
        const ranges = [];
        let start = 0n;
        for (const [index, row] of rows.entries()) {
          const rowAliases = new Map(aliases).set(node.as, row);
          const length = checkDomain(
            evaluate(node.length, rowAliases, `${label}.length[${index}]`),
            "u32",
            label,
          );
          ranges.push([start, length]);
          start = checkDomain(start + length, "u32", label);
        }
        return ranges;
      }
      case "siteBytes": {
        const site = sites.get(node.siteId);
        const count = toCategory9BigInt(results.get(site.countFormula), label);
        return checkDomain(count * layoutBytes.get(site.elementLayout), "u64", label);
      }
      case "siteByteSum": {
        let total = 0n;
        for (const site of vectors.allocationSites) {
          total = checkDomain(total + results.get(site.byteFormula), "u64", label);
          if (total > 2_147_483_647n) throw new Error(`${label} exceeded common cap`);
        }
        return total;
      }
      case "layoutGate": {
        for (const site of vectors.allocationSites) {
          const count = toCategory9BigInt(results.get(site.countFormula), label);
          const bytes = toCategory9BigInt(results.get(site.byteFormula), label);
          if (count > 0xffff_ffffn || bytes > 2_147_483_647n) return false;
        }
        return true;
      }
      default:
        throw new Error(`${label} evaluator omitted op ${node.op}`);
    }
  };
  for (const program of vectors.formulaPrograms) {
    const value = evaluate(program.program, new Map(), program.formulaId);
    results.set(program.formulaId, value);
    if (!programsById.has(program.formulaId)) {
      throw new Error(`Category 9 evaluator lost program ${program.formulaId}`);
    }
  }
  return results;
}

function assertCategory9Portability(vectors) {
  const widths = [1, 4, 8, 16, 24, 32, 40, 48, 56, 64, 80];
  assertExactJson(
    [...new Set(vectors.elementLayouts.map((layout) => layout.elementBytes))].sort(
      (left, right) => left - right,
    ),
    widths,
    "Category 9 independently derived portable layout widths",
  );
  assertExactJson(
    vectors.portabilityVectors.slice(0, 11).map((vector) => vector.elementBytes),
    widths,
    "Category 9 portability width order",
  );
  assertExactJson(
    vectors.selfValidation.portabilityWidths,
    widths,
    "Category 9 published portability widths",
  );
  const cap = 2_147_483_647n;
  for (const [index, widthNumber] of widths.entries()) {
    const vector = vectors.portabilityVectors[index];
    const width = BigInt(widthNumber);
    const acceptedCount = cap / width;
    const rejectedCount = acceptedCount + 1n;
    assertExactJson(
      {
        id: vector.id,
        commonCap: vector.commonCap,
        accepted: vector.accepted,
        rejected: vector.rejected,
        reachableInCensus: vector.reachableInCensus,
        targetWidthFailureReachable: vector.targetWidthFailureReachable,
      },
      {
        id: `portable.element-width-${widthNumber}`,
        commonCap: cap.toString(),
        accepted: {
          count: acceptedCount.toString(),
          bytes: (acceptedCount * width).toString(),
          native: "Layout-array-defense-success",
          wasm32: "Layout-array-defense-success",
          firstFailureCheck: null,
        },
        rejected: {
          count: rejectedCount.toString(),
          bytes: (rejectedCount * width).toString(),
          firstFailureCheck: "common-0x7fffffff-cap",
          outcome: "status6-before-reserve",
        },
        reachableInCensus: true,
        targetWidthFailureReachable: false,
      },
      `Category 9 width-${widthNumber} portability neighbor`,
    );
  }
  assertExactJson(
    vectors.targetWidthFacts,
    [
      {
        id: "target-width.x86_64-pc-windows-msvc",
        order: 1,
        target: "x86_64-pc-windows-msvc",
        usizeMax: "18446744073709551615",
        isizeMax: "9223372036854775807",
        layoutArrayMaxBytes: "9223372036854775807",
        runtimeReachableAfterCommonCap: false,
      },
      {
        id: "target-width.wasm32-unknown-unknown",
        order: 2,
        target: "wasm32-unknown-unknown",
        usizeMax: "4294967295",
        isizeMax: "2147483647",
        layoutArrayMaxBytes: "2147483647",
        runtimeReachableAfterCommonCap: false,
      },
    ],
    "Category 9 target-width facts",
  );
  if (
    vectors.executionPolicy.commonLogicalByteCeiling !== 2_147_483_647 ||
    vectors.executionPolicy.logicalCountDomain !== "u32" ||
    vectors.executionPolicy.logicalByteDomain !== "checked-u64" ||
    vectors.executionPolicy.pinnedRust !== "1.89.0" ||
    vectors.executionPolicy.productionReservation !==
      "try_reserve_exact-once-per-nonzero-site" ||
    vectors.executionPolicy.testDenial !== "after-reserve-attempt-before-allocator" ||
    vectors.executionPolicy.zeroSite !== "logical-skip-no-hook-no-allocator" ||
    vectors.executionPolicy.category10Calls !== 0 ||
    vectors.executionPolicy.category11AllocationSites !== 0
  ) {
    throw new Error("Category 9 execution/portability policy drifted");
  }
}

function assertCargoBoundary() {
  const workspaceManifest = readText(nativeManifestPath);
  for (const evidence of [
    '"crates/vivi-runtime-native-evaluation-lowering"',
    'rust-version = "1.89"',
    'edition = "2024"',
    'license = "Apache-2.0"',
  ]) {
    if (!workspaceManifest.includes(evidence)) {
      throw new Error(`runtime-native workspace metadata omits ${evidence}`);
    }
  }

  const manifest = readText(loweringManifestPath);
  if (
    /^\s*(?:build|workspace)\s*=/m.test(manifest) ||
    /^\s*\[workspace\]/m.test(manifest)
  ) {
    throw new Error("lowering must not run a build script or define a nested workspace");
  }
  const metadata = readCargoMetadata();
  const pkg = requirePackage(metadata, "vivi-runtime-native-evaluation-lowering");
  if (
    pkg.version !== "0.1.0" ||
    pkg.edition !== "2024" ||
    pkg.rust_version !== "1.89" ||
    pkg.license !== "Apache-2.0" ||
    JSON.stringify(pkg.publish) !== "[]" ||
    JSON.stringify(pkg.features) !== "{}" ||
    path.resolve(pkg.manifest_path) !== resolve(loweringManifestPath)
  ) {
    throw new Error(
      "lowering identity, license, Rust version, features, or publish=false drifted",
    );
  }
  const libraryTargets = pkg.targets.filter((target) => target.kind.includes("lib"));
  if (
    libraryTargets.length !== 1 ||
    libraryTargets[0].name !== "vivi_runtime_native_evaluation_lowering" ||
    JSON.stringify(libraryTargets[0].crate_types) !== JSON.stringify(["lib"])
  ) {
    throw new Error("lowering must expose exactly one Rust-only rlib");
  }
  if (
    pkg.targets.some(
      (target) =>
        !target.kind.includes("test") &&
        target.crate_types.some((crateType) =>
          ["bin", "cdylib", "dylib", "staticlib"].includes(crateType),
        ),
    )
  ) {
    throw new Error("lowering must not add a binary or language ABI");
  }

  const actualDirect = pkg.dependencies
    .map((dependency) => ({
      name: dependency.name,
      req: dependency.req,
      kind: dependency.kind ?? "normal",
      optional: dependency.optional,
      target: dependency.target,
      usesDefaultFeatures: dependency.uses_default_features,
      features: [...dependency.features].sort(),
      sourceKind: dependency.source?.startsWith("registry+") ? "registry" : "path",
    }))
    .sort(compareDirectDependencies);
  const expectedDirect = [
    directDependency("serde_json", "^1.0", "normal", ["std"], "registry", false),
    directDependency(
      "vivi-runtime-native-preactivation",
      "*",
      "normal",
      [],
      "path",
      false,
    ),
    directDependency("sha2", "^0.10", "dev", [], "registry", false),
  ].sort(compareDirectDependencies);
  assertExactJson(actualDirect, expectedDirect, "lowering direct dependency inventory");

  const lockBlocks = readText(nativeLockPath)
    .split(/^\[\[package\]\]\s*$/m)
    .slice(1);
  const loweringLockBlocks = lockBlocks.filter((block) =>
    /^name = "vivi-runtime-native-evaluation-lowering"$/m.test(block),
  );
  if (loweringLockBlocks.length !== 1) {
    throw new Error("Cargo.lock must contain exactly one lowering stanza");
  }
  const lockBlock = loweringLockBlocks[0];
  if (
    !/^version = "0\.1\.0"$/m.test(lockBlock) ||
    /^source =|^checksum =/m.test(lockBlock)
  ) {
    throw new Error("lowering Cargo.lock identity drifted");
  }
  const lockDependenciesBody = /^dependencies = \[\r?\n([\s\S]*?)^\]$/m.exec(
    lockBlock,
  )?.[1];
  const actualLockDependencies = [
    ...(lockDependenciesBody ?? "").matchAll(/^\s*"([^"]+)",$/gm),
  ]
    .map((match) => match[1])
    .sort();
  assertExactJson(
    actualLockDependencies,
    ["serde_json", "sha2", "vivi-runtime-native-preactivation"].sort(),
    "lowering Cargo.lock dependency inventory",
  );
  return metadata;
}

function assertDependencyPins(metadata) {
  const packages = new Map(metadata.packages.map((pkg) => [pkg.id, pkg]));
  const lockPackages = readCargoLockPackages();
  const loweringPackage = requirePackage(
    metadata,
    "vivi-runtime-native-evaluation-lowering",
  );
  const productionClosure = closureFromRoot(
    metadata,
    loweringPackage.id,
    new Set([null, "build"]),
  );
  const devClosure = closureFromRoot(metadata, loweringPackage.id, new Set(["dev"]));
  for (const productionId of productionClosure) devClosure.delete(productionId);
  assertDependencyInventoryPin(
    dependencyInventory(productionClosure, packages, lockPackages),
    expectedProductionClosurePin,
    "lowering production/build",
  );
  assertDependencyInventoryPin(
    dependencyInventory(devClosure, packages, lockPackages),
    expectedDevClosurePin,
    "lowering dev-only",
  );
}

function assertConsumerGraph(metadata) {
  assertExactJson(
    consumersOf(metadata, "vivi-runtime-native-evaluation"),
    ["vivi-runtime-native-preactivation"],
    "Evaluation production consumer graph",
  );
  assertExactJson(
    consumersOf(metadata, "vivi-asset-host-local"),
    ["vivi-runtime-native-preactivation"],
    "local Asset host production consumer graph",
  );
  assertExactJson(
    consumersOf(metadata, "vivi-runtime-native-preactivation"),
    ["vivi-runtime-native-evaluation-lowering"],
    "preactivation production consumer graph",
  );
  assertExactJson(
    consumersOf(metadata, "vivi-runtime-native-evaluation-lowering"),
    [],
    "lowering consumer-zero production graph",
  );

  const loweringPackage = requirePackage(
    metadata,
    "vivi-runtime-native-evaluation-lowering",
  );
  const productionDependencies = loweringPackage.dependencies
    .filter((dependency) => (dependency.kind ?? "normal") === "normal")
    .map((dependency) => dependency.name)
    .sort();
  assertExactJson(
    productionDependencies,
    ["serde_json", "vivi-runtime-native-preactivation"],
    "lowering production dependency graph",
  );
  for (const packageName of [
    "vivi-runtime-native-core",
    "vivi-runtime-native-c-abi",
    "vivi-runtime-native-wasm",
    "vivi-asset-host-local",
    "vivi-asset-resolver",
    "vivi-asset-store-local",
  ]) {
    const boundaryPackage = requirePackage(metadata, packageName);
    if (
      boundaryPackage.dependencies.some(
        (dependency) => dependency.name === "vivi-runtime-native-evaluation-lowering",
      )
    ) {
      throw new Error(`${packageName} must remain disconnected from lowering`);
    }
  }
}

function assertPublicSurface() {
  const expectedPublicItemsByFile = {
    "src/error.rs": ["EvaluationLoweringError", "EvaluationLoweringErrorKind"],
    "src/lib.rs": [],
    "src/lower.rs": [],
    "src/model.rs": ["EvaluationLoweringFoundationV1"],
    "src/reservation.rs": [],
  };
  const expectedPublicFunctionsByFile = {
    "src/error.rs": ["kind", "load_status", "load_status"],
    "src/lib.rs": [],
    "src/lower.rs": ["lower_evaluation_foundation_v1"],
    "src/model.rs": [
      "derived_evaluation_mesh_count",
      "direct_projected_scalar_count",
      "mask_edge_count",
      "mesh_count",
      "request_generation",
      "texture_binding_count",
    ],
    "src/reservation.rs": [],
  };
  for (const relativePath of Object.keys(expectedPublicItemsByFile).sort()) {
    const source = readText(`${loweringRoot}/${relativePath}`);
    const actualItems = [
      ...source.matchAll(
        /^pub\s+(?:struct|enum|trait|type|const|static)\s+([A-Za-z0-9_]+)/gm,
      ),
    ]
      .map((match) => match[1])
      .sort();
    assertExactJson(
      actualItems,
      [...expectedPublicItemsByFile[relativePath]].sort(),
      `${relativePath} public item inventory`,
    );
  }
  for (const relativePath of Object.keys(expectedPublicFunctionsByFile).sort()) {
    const source = readText(`${loweringRoot}/${relativePath}`);
    const actualFunctions = [
      ...source.matchAll(/\bpub\s+(?:const\s+)?fn\s+([A-Za-z0-9_]+)/g),
    ]
      .map((match) => match[1])
      .sort();
    assertExactJson(
      actualFunctions,
      [...expectedPublicFunctionsByFile[relativePath]].sort(),
      `${relativePath} public function inventory`,
    );
  }

  const lib = readText(`${loweringRoot}/src/lib.rs`);
  assertExactJson(
    collectRootReexports(lib).sort(),
    [
      "EvaluationLoweringError",
      "EvaluationLoweringErrorKind",
      "EvaluationLoweringFoundationV1",
      "lower_evaluation_foundation_v1",
    ].sort(),
    "lowering root re-export inventory",
  );
  for (const evidence of [
    "#![forbid(unsafe_code)]",
    "#![deny(missing_docs)]",
    "pub(crate) const APPROVED_EVALUATION_LOWERING_CONTRACT_DRAFT_BYTES",
    "pub(crate) const APPROVED_EVALUATION_LOWERING_VECTORS_BYTES",
    "pub(crate) const APPROVED_EVALUATION_LOWERING_REVIEW_BYTES",
  ]) {
    if (!lib.includes(evidence)) {
      throw new Error(`lowering root lint/provenance surface omits ${evidence}`);
    }
  }

  const model = readText(`${loweringRoot}/src/model.rs`);
  const error = readText(`${loweringRoot}/src/error.rs`);
  assertPrivateStructFields(model, "EvaluationLoweringFoundationV1");
  assertPrivateStructFields(error, "EvaluationLoweringError");
  assertExactEnumVariants(error, "EvaluationLoweringErrorKind", [
    "Correlation",
    "UnsupportedLayer",
    "UnsupportedMaskPlacement",
    "UnsupportedBlendMode",
    "UnsupportedIkParameterMappings",
    "UnsupportedDuplicateIkBone",
    "UnsupportedMultipleIkControllers",
    "UnsupportedMultipleEnabledPhysicsGroups",
    "InvalidIkRange",
    "NumericNonFinite",
    "NumericOverflow",
    "NumericUnderflow",
    "NumericSubnormal",
    "ResourceLimitExceeded",
    "Internal",
  ]);
  if (
    /#\[derive\([^\]]*Clone[^\]]*\)\]\s*pub struct EvaluationLoweringFoundationV1/s.test(
      model,
    ) ||
    /impl\s+Clone\s+for\s+EvaluationLoweringFoundationV1/.test(model)
  ) {
    throw new Error("lowering Foundation must remain non-Clone");
  }
  for (const forbidden of [
    "candidate",
    "value",
    "texture_plan",
    "plan",
    "asset_ref",
    "asset",
    "id",
    "into_parts",
  ]) {
    if (expectedPublicFunctionsByFile["src/model.rs"].includes(forbidden)) continue;
    if (
      new RegExp(`\\bpub\\s+(?:const\\s+)?fn\\s+${escapeRegExp(forbidden)}\\b`).test(
        model,
      )
    ) {
      throw new Error(`Foundation exposes forbidden public accessor ${forbidden}`);
    }
  }
}

function assertFoundationContract(vectors, category9Vectors) {
  const lib = readText(`${loweringRoot}/src/lib.rs`);
  const lower = readText(`${loweringRoot}/src/lower.rs`);
  const model = readText(`${loweringRoot}/src/model.rs`);
  const reservation = readText(`${loweringRoot}/src/reservation.rs`);
  const error = readText(`${loweringRoot}/src/error.rs`);
  const tests = readText(`${loweringRoot}/src/tests.rs`);
  const production = [lib, lower, model, reservation, error].join("\n");

  for (const evidence of [
    "41_556",
    approvedArtifacts[0].sha256,
    "90_906",
    approvedArtifacts[1].sha256,
    "20_624",
    approvedArtifacts[2].sha256,
    "41_002",
    approvedCategory9Artifacts[0].sha256,
    "210_149",
    approvedCategory9Artifacts[1].sha256,
    "18_793",
    approvedCategory9Artifacts[2].sha256,
  ]) {
    if (!lib.includes(evidence)) {
      throw new Error(`lowering provenance constants omit ${evidence}`);
    }
  }
  if (
    (lower.match(/correlate_evaluation_activation_v1\s*\(/g) ?? []).length !== 1 ||
    (lower.match(/correlated\.into_parts\s*\(/g) ?? []).length !== 1
  ) {
    throw new Error(
      "lowering must reuse the pure correlation seam and token exactly once",
    );
  }
  const entry = sliceBetween(lower, "fn lower_correlated_impl", "#[derive(Default)]");
  assertOrderedEvidence(
    entry,
    [
      "correlated.request_generation()",
      "correlated.into_parts()",
      "reject_art_paths(layers)?",
      "reject_non_mesh_mask_owners(layers)?",
      "reject_unsupported_blends(layers)?",
      "reject_ik_parameter_mappings(root)?",
      "reject_duplicate_ik_bones(root)?",
      "reject_multiple_ik_controllers(root)?",
      "reject_multiple_enabled_physics_groups(root)?",
      "validate_ik_ranges(root)?",
      "validate_direct_projections(root, layers)?",
      "census_category9(root, layers)?",
      "Category9SiteCountsV1::try_from_ordered",
      "census.finish_incumbent_usize_defenses()?",
      "Category9ReservationBuffersV1::reserve_all",
      "materialize_category9(root, layers, &census, &mut buffers)?",
      "buffers.finish(",
      "let canvas =",
      "let foundation =",
      "Category9ReservationBuffersV1::verify_plan(",
      "Ok(foundation)",
    ],
    "lowering phases 1-3/categories 1-9 order",
  );

  const categoryOneThroughEight = sliceBetween(
    lower,
    "fn reject_art_paths",
    "fn census_category9",
  );
  const classifier = sliceBetween(
    lower,
    "fn validate_binary64_for_projection",
    "fn normalized_mask_edge_count",
  );
  const borrowedHelpers = sliceBetween(lower, "fn object(value", "fn error(");
  const allocationPattern =
    /\bVec::new\s*\(|\.collect\s*(?:::|\()|\.to_owned\s*\(|\.to_string\s*\(|\bformat!\s*\(|\bBox::new\s*\(|\bString::(?:new|from)\s*\(|try_reserve/;
  if (
    allocationPattern.test(categoryOneThroughEight) ||
    allocationPattern.test(classifier) ||
    allocationPattern.test(borrowedHelpers)
  ) {
    throw new Error(
      "lowering categories 1-8 must remain an allocation-free borrowed scan",
    );
  }
  for (const evidence of [
    "checked_add",
    "try_reserve_exact",
    "reserve_all_with_test_denial",
  ])
    if (!`${lower}\n${reservation}`.includes(evidence)) {
      throw new Error(`category-9 reservation omits ${evidence}`);
    }

  const casts = production.match(/\bas\s+f32\b/g) ?? [];
  if (casts.length !== 1 || classifier.includes("as f32")) {
    throw new Error(
      "category 8 must classify without casting and category-9 materialization must contain the only f64-to-f32 cast",
    );
  }
  for (const evidence of [
    "0x3690_0000_0000_0000",
    "0x380f_ffff_e000_0000",
    "0x47ef_ffff_f000_0000",
    "NumericNonFinite",
    "NumericOverflow",
    "NumericUnderflow",
    "NumericSubnormal",
  ]) {
    if (!classifier.includes(evidence)) {
      throw new Error(`direct projection classifier omits ${evidence}`);
    }
  }
  const projector = sliceBetween(
    lower,
    "pub(crate) fn project_binary64_to_binary32",
    "// Category 8",
  );
  assertOrderedEvidence(
    projector,
    [
      "validate_binary64_for_projection(value)?",
      "if value == 0.0",
      "0.0_f32",
      "value as f32",
    ],
    "single-cast direct projection",
  );
  const fill = sliceBetween(
    lower,
    "fn materialize_direct_meshes",
    "fn materialize_parameter_tables",
  );
  assertOrderedEvidence(
    fill,
    [
      'let vertex_values = array_property(mesh, "vertices")?',
      'let uv_values = array_property(mesh, "uvs")?',
      'let index_values = array_property(mesh, "indices")?',
      "&mut buffers.direct_unskinned_vertices",
      "&mut buffers.direct_uvs",
      'projected_bits(f64_property(layer, "x")?)',
      'projected_bits(f64_property(layer, "y")?)',
      'projected_bits(f64_property(layer, "opacity")?)',
      'layer.get("multiplyColor")',
      'layer.get("screenColor")',
      "trusted_blend_code",
      "&mut buffers.direct_mesh_records",
      "&mut buffers.direct_indices",
    ],
    "recursive mesh direct-projection field order",
  );
  const projectedBits = sliceBetween(lower, "fn projected_bits", "fn projected_color");
  if (
    !fill.includes("projected_bits") ||
    !projectedBits.includes("project_validated_binary64_to_binary32") ||
    fill.includes("project_binary64_to_binary32(")
  ) {
    throw new Error(
      "post-reservation fill must use only the infallible private cast after category-8 validation",
    );
  }

  const blendParser = sliceBetween(lower, "fn parse_blend_mode", "fn trusted_blend_code");
  for (const evidence of [
    '"normal" => Ok(0)',
    '"multiply" => Ok(1)',
    '"screen" => Ok(2)',
    '"add" => Ok(3)',
    '"overlay" | "darken" | "lighten" | "color-dodge" | "color-burn" | "hard-light"',
    '| "soft-light" | "difference" | "exclusion"',
    "UnsupportedBlendMode",
  ]) {
    if (!blendParser.includes(evidence)) {
      throw new Error(`blend disposition omits ${evidence}`);
    }
  }
  assertExactJson(
    [...model.matchAll(/\.field\(\s*"([A-Za-z0-9_]+)"/g)].map((match) => match[1]),
    [
      "request_generation",
      "texture_binding_count",
      "mesh_count",
      "direct_projected_scalar_count",
      "derived_evaluation_mesh_count",
      "mask_edge_count",
    ],
    "Foundation redacted Debug field inventory",
  );
  if (
    /\.field\("(?:candidate|value|texture_plan|asset|id|path|message|detail)"/i.test(
      `${model}\n${error}`,
    ) ||
    /\b(?:String|str|Path|PathBuf)\b/.test(structBody(error, "EvaluationLoweringError"))
  ) {
    throw new Error("lowering Foundation/error Debug retains caller-controlled detail");
  }

  const scalarTest = testSlice(
    tests,
    "all_thirty_scalar_projection_vectors_are_bit_exact",
  );
  for (const evidence of [
    'vectors["numericProjection"]',
    "assert_eq!(cases.len(), 30)",
    "for case in cases",
    'case["inputBinary64Bits"]',
    'case["outputBinary32Bits"]',
    'case["privateKind"]',
    "project_binary64_to_binary32",
    "to_bits()",
  ]) {
    if (!scalarTest.includes(evidence)) {
      throw new Error(`30-record scalar vector test omits ${evidence}`);
    }
  }
  const nonfiniteTest = testSlice(
    tests,
    "nonfinite_projection_inputs_are_typed_load_incompatibilities",
  );
  for (const evidence of [
    "f64::NAN",
    "f64::INFINITY",
    "f64::NEG_INFINITY",
    "NumericNonFinite",
    "14",
  ]) {
    if (!nonfiniteTest.includes(evidence)) {
      throw new Error(`non-finite projection test omits ${evidence}`);
    }
  }
  const blendTest = testSlice(
    tests,
    "all_thirteen_blends_cross_all_seven_recursive_contexts",
  );
  for (const evidence of [
    'vectors["blendModes"]',
    'vectors["blendScanContexts"]',
    "assert_eq!(modes.len(), 13)",
    "assert_eq!(contexts.len(), 7)",
    "assert_eq!(modes.len() * contexts.len(), 91)",
    "for mode in modes",
    "for context in contexts",
  ]) {
    if (!blendTest.includes(evidence)) {
      throw new Error(`13-by-7 blend scan test omits ${evidence}`);
    }
  }

  const eligibilityTest = testSlice(
    tests,
    "eligibility_records_are_preflighted_while_bound_clamp_remains_deferred",
  );
  for (const { id } of vectors.eligibility) {
    if (!eligibilityTest.includes(`"${id}"`)) {
      throw new Error(`eligibility test does not represent vector ID ${id}`);
    }
  }
  for (const evidence of [
    'approved_vectors["eligibility"]',
    "union(&deferred_category_ten)",
    "assert_eq!(represented, fixture_ids)",
  ]) {
    if (!eligibilityTest.includes(evidence)) {
      throw new Error(`eligibility vector binding omits ${evidence}`);
    }
  }
  if (
    !eligibilityTest.includes(
      'assert_eq!(deferred_category_ten, ["ik-bound-influence-clamps"].into())',
    )
  ) {
    throw new Error("eligibility test must explicitly defer the category-10 bound clamp");
  }

  const precedenceTest = testSlice(
    tests,
    "category_precedence_and_reservation_injection_match_the_foundation_scope",
  );
  const executedPrecedence = [
    ...precedenceTest.matchAll(/executed\.insert\("([^"]+)"\)/g),
  ]
    .map((match) => match[1])
    .sort();
  assertExactJson(
    executedPrecedence,
    vectors.precedenceCases
      .slice(0, 6)
      .map((record) => record.id)
      .sort(),
    "applicable precedence vector IDs",
  );
  for (const evidence of [
    "lower_correlated_with_test_denial(",
    "ReservationDenialKeyV1",
    'site_template_id: "direct.mesh-records"',
    "owner_slot: None",
    "attempt_ordinal: 0",
    "additional_count: 1",
    "direct projection wins before reservation",
    "category-9 reservation precedes deferred derived evaluation",
    'precedence[6]["id"]',
    '"derived-projection-beats-host-plan-fault"',
  ]) {
    if (!precedenceTest.includes(evidence)) {
      throw new Error(`precedence/reservation test omits ${evidence}`);
    }
  }

  const nonclaimTest = testSlice(
    tests,
    "future_inventory_obligations_are_not_misreported_as_executed_fixtures",
  );
  for (const evidence of [
    "assert_eq!(inventory.len(), 100)",
    "assert_eq!(row_obligations.len(), 191)",
    "assert_eq!(owner_obligations.len(), 23)",
    "remain future connection obligations",
    "not 214 executable bodies",
    'assert_eq!(vectors["blendCoverageBinding"]["requiredCases"], 91)',
  ]) {
    if (!nonclaimTest.includes(evidence)) {
      throw new Error(`future-obligation nonclaim test omits ${evidence}`);
    }
  }

  const productionFunctionNames = [
    ...production.matchAll(/^(?:pub(?:\(crate\))?\s+)?fn\s+([A-Za-z0-9_]+)/gm),
  ].map((match) => match[1]);
  const uncommentedProduction = production.replace(/^\s*\/\/.*$/gm, "");
  if (
    productionFunctionNames.some(
      (name) =>
        name !== "verify_derived_ranges_and_mesh_links" &&
        /(?:apply_parameter_binding|solve_ik|apply_skin|derive|evaluate|topology|command|seal|snapshot|model_ready|activate)/i.test(
          name,
        ),
    ) ||
    /\b(?:LoweredEvaluationCandidateV1|CoreRuntimeModel|DrawCommand|MaskCommand)\b/.test(
      uncommentedProduction,
    )
  ) {
    throw new Error(
      "category 10/11 evaluator, topology, command, sealing, or model-ready code appeared",
    );
  }
  const executableMath = /\.(?:sin|cos|atan2|acos|sqrt|mul_add)\s*\(/;
  if (executableMath.test(production)) {
    throw new Error("deterministic derived-math connection must remain closed");
  }
  assertCategory9ImplementationContract(category9Vectors, {
    lib,
    lower,
    model,
    reservation,
    error,
    tests,
    production,
  });
}

function assertCategory9ImplementationContract(vectors, sources) {
  const { lib, lower, model, reservation, tests, production } = sources;
  for (const evidence of [
    "APPROVED_EVALUATION_CATEGORY9_RESERVATION_CONTRACT_BYTES",
    "APPROVED_EVALUATION_CATEGORY9_RESERVATION_CONTRACT_SHA256",
    "APPROVED_EVALUATION_CATEGORY9_RESERVATION_VECTORS_BYTES",
    "APPROVED_EVALUATION_CATEGORY9_RESERVATION_VECTORS_SHA256",
    "APPROVED_EVALUATION_CATEGORY9_RESERVATION_REVIEW_BYTES",
    "APPROVED_EVALUATION_CATEGORY9_RESERVATION_REVIEW_SHA256",
  ]) {
    if (!lib.includes(evidence)) {
      throw new Error(`lowering root omits Category 9 provenance constant ${evidence}`);
    }
  }
  if (
    /\b(?:dyn|impl)\s+Fn(?:Mut|Once)?\b|\bFn(?:Mut|Once)?\s*\(/.test(reservation) ||
    production.includes("lower_correlated_with_reservation")
  ) {
    throw new Error(
      "Category 9 production reservation must not accept a generic closure",
    );
  }
  for (const evidence of [
    "try_reserve_exact",
    "usize::try_from",
    "Layout::array",
    "isize::MAX",
    "#[cfg(test)]",
    "ReservationDenialKeyV1",
    "ReservationSiteV1::ALL",
    "reserve_all_with_test_denial",
    "finish",
    "verify_plan",
  ]) {
    if (!`${lower}\n${reservation}`.includes(evidence)) {
      throw new Error(`Category 9 reservation implementation omits ${evidence}`);
    }
  }
  if (
    !/2_147_483_647|0x7fff_ffff/i.test(reservation) ||
    !/additional_count/.test(reservation) ||
    !/attempt_ordinal/.test(reservation) ||
    !/owner_slot/.test(reservation)
  ) {
    throw new Error("Category 9 cap or exact test-hook tuple is missing");
  }

  const layoutById = new Map(
    [...vectors.elementLayouts, ...vectors.inlineLayouts].map((layout) => [
      layout.id,
      layout,
    ]),
  );
  const layoutAssertionById = new Map(
    vectors.layoutAssertions.map((assertion) => [assertion.layoutId, assertion]),
  );
  const expectedSiteRows = vectors.allocationSites.map((site) => {
    const layout = layoutById.get(site.elementLayout);
    const assertion = layoutAssertionById.get(site.elementLayout);
    if (!layout || !assertion) {
      throw new Error(`Category 9 implementation site has no frozen layout: ${site.id}`);
    }
    return {
      id: site.id,
      variant: toRustVariant(site.id),
      field: toRustSnake(site.id),
      rustType: layout.rustType,
      elementBytes: assertion.expectedBytes,
    };
  });
  if (!reservation.includes("CATEGORY9_ALLOCATION_SITE_COUNT: usize = 39")) {
    throw new Error("Category 9 Rust reservation-site count is not exactly 39");
  }
  const siteCountProjection = sliceBetween(
    lower,
    "const fn site_counts(&self)",
    "fn finish_incumbent_usize_defenses",
  );
  assertExactJson(
    [...siteCountProjection.matchAll(/self\.([a-z0-9_]+),/g)].map((match) => match[1]),
    vectors.allocationSites.map((site) => toRustSnake(site.countFormula)),
    "Category 9 Rust 39-site count-formula projection",
  );

  const checkedBytePrograms = sliceBetween(
    reservation,
    "pub(crate) fn try_from_ordered",
    "pub(crate) const fn count(&self",
  );
  assertOrderedEvidence(
    checkedBytePrograms,
    [
      "for site in ReservationSiteV1::ALL",
      ".checked_mul(site.element_bytes())",
      "for site in ReservationSiteV1::ALL",
      ".checked_add(logical_bytes[index])",
      "if total_logical_bytes > COMMON_LOGICAL_BYTE_CEILING",
      "for site in ReservationSiteV1::ALL",
      "usize::try_from(counts[index])",
      "site.array_layout(count)",
      "u64::try_from(layout.size())",
      "usize::try_from(isize::MAX)",
      "layout_bytes != logical_bytes[index]",
      "usize_counts[index] = count",
    ],
    "Category 9 Rust formula programs 42-82 and cap precedence",
  );

  const siteEnum = sliceBetween(
    reservation,
    "pub(crate) enum ReservationSiteV1 {",
    "\n}\n\nimpl ReservationSiteV1",
  );
  assertExactJson(
    [...siteEnum.matchAll(/^\s{4}([A-Z][A-Za-z0-9_]+),$/gm)].map((match) => match[1]),
    expectedSiteRows.map((row) => row.variant),
    "Category 9 Rust reservation-site enum order",
  );
  const allSites = sliceBetween(
    reservation,
    "pub(crate) const ALL: [Self; CATEGORY9_ALLOCATION_SITE_COUNT] = [",
    "];",
  );
  assertExactJson(
    [...allSites.matchAll(/Self::([A-Za-z0-9_]+)/g)].map((match) => match[1]),
    expectedSiteRows.map((row) => row.variant),
    "Category 9 Rust reservation-site ALL order",
  );
  const siteIds = sliceBetween(
    reservation,
    "pub(crate) const fn id(self)",
    "pub(crate) const fn element_bytes(self)",
  );
  assertExactJson(
    [...siteIds.matchAll(/Self::([A-Za-z0-9_]+)\s*=>\s*"([^"]+)"/g)].map((match) => [
      match[1],
      match[2],
    ]),
    expectedSiteRows.map((row) => [row.variant, row.id]),
    "Category 9 Rust reservation-site ID mapping",
  );

  const elementBytesBody = sliceBetween(
    reservation,
    "pub(crate) const fn element_bytes(self)",
    "fn array_layout",
  );
  const actualElementBytes = new Map();
  for (const match of elementBytesBody.matchAll(
    /((?:Self::[A-Za-z0-9_]+\s*(?:\|\s*)?)+)=>\s*([0-9_]+),/g,
  )) {
    const bytes = Number(match[2].replaceAll("_", ""));
    for (const variant of match[1].matchAll(/Self::([A-Za-z0-9_]+)/g)) {
      if (actualElementBytes.has(variant[1])) {
        throw new Error(`Category 9 duplicate Rust element-byte arm: ${variant[1]}`);
      }
      actualElementBytes.set(variant[1], bytes);
    }
  }
  assertExactJson(
    expectedSiteRows.map((row) => [row.variant, actualElementBytes.get(row.variant)]),
    expectedSiteRows.map((row) => [row.variant, row.elementBytes]),
    "Category 9 Rust element-byte mapping",
  );

  const arrayLayouts = sliceBetween(
    reservation,
    "fn array_layout",
    "\n}\n\n#[allow(dead_code)]",
  );
  assertExactJson(
    [
      ...arrayLayouts.matchAll(
        /Self::([A-Za-z0-9_]+)\s*=>\s*Layout::array::<([^>]+)>\(count\)/g,
      ),
    ].map((match) => [match[1], match[2]]),
    expectedSiteRows.map((row) => [row.variant, row.rustType]),
    "Category 9 typed Layout::array mapping",
  );

  const reserveAll = sliceBetween(
    reservation,
    "fn reserve_all_with_state",
    "pub(crate) fn finish",
  );
  assertExactJson(
    [
      ...reserveAll.matchAll(
        /&mut buffers\.([a-z0-9_]+),\s*ReservationSiteV1::([A-Za-z0-9_]+),/g,
      ),
    ].map((match) => [match[1], match[2]]),
    expectedSiteRows.map((row) => [row.field, row.variant]),
    "Category 9 Rust reserve order and field mapping",
  );
  const reserveOne = sliceBetween(reservation, "fn reserve_one<T>", "const fn resource");
  assertOrderedEvidence(
    reserveOne,
    [
      "let additional_count = counts.count(site)",
      "if additional_count == 0",
      "return Ok(())",
      "state.begin_nonzero_attempt(site, additional_count)?",
      ".try_reserve_exact(counts.count_usize(site))",
      ".map_err(|_| resource())?",
    ],
    "Category 9 zero-skip, denial-hook, allocator order",
  );
  assertCategory9Step40Verifier(lower);

  const expectedVectorFields = expectedSiteRows.map((row) => [
    row.field,
    `Vec<${row.rustType}>`,
  ]);
  assertExactJson(
    rustStructFields(reservation, "Category9ReservationBuffersV1"),
    [
      ...expectedVectorFields,
      ["reserved_capacities", "[usize;CATEGORY9_ALLOCATION_SITE_COUNT]"],
    ],
    "Category 9 reservation buffer field inventory",
  );
  assertExactJson(
    rustStructFields(model, "Category9ReservationPlanV1"),
    [
      ...expectedVectorFields,
      ["inline_physics_group", "InlinePhysicsGroupV1"],
      ["inline_ik_controller", "InlineIkControllerV1"],
    ],
    "Category 9 retained plan field inventory",
  );

  const layouts = [...vectors.elementLayouts, ...vectors.inlineLayouts];
  for (const layout of layouts) {
    const assertion = layoutAssertionById.get(layout.id);
    if (!assertion) {
      throw new Error(`Category 9 layout assertion is missing: ${layout.id}`);
    }
    for (const evidence of [
      `size_of::<${layout.rustType}>() == ${assertion.expectedBytes}`,
      `align_of::<${layout.rustType}>() == ${assertion.expectedAlign}`,
    ]) {
      if (!model.includes(evidence)) {
        throw new Error(
          `Category 9 Rust compile-time layout assertion omits ${evidence}`,
        );
      }
    }
    if (layout.rustType !== "u8") {
      const representation = layout.fields.length === 1 ? "transparent" : "C";
      const declarationPattern = new RegExp(
        `#\\[repr\\(${escapeRegExp(representation)}\\)\\][\\s\\S]{0,300}\\bstruct\\s+${escapeRegExp(layout.rustType)}\\b`,
      );
      if (!declarationPattern.test(model)) {
        throw new Error(`Category 9 Rust repr drifted: ${layout.rustType}`);
      }
      assertExactJson(
        rustStructFields(model, layout.rustType),
        layout.fields.map((field) => {
          const separator = field.indexOf(":");
          return [
            toRustSnake(field.slice(0, separator)),
            field.slice(separator + 1).replaceAll(" ", ""),
          ];
        }),
        `Category 9 Rust layout fields ${layout.rustType}`,
      );
      for (const [field, offset] of Object.entries(assertion.fieldOffsets)) {
        const evidence = `offset_of!(${layout.rustType}, ${toRustSnake(field)}) == ${offset}`;
        if (!model.includes(evidence)) {
          throw new Error(`Category 9 Rust compile-time field offset omits ${evidence}`);
        }
      }
    }
  }
  if (
    /#\[derive\([^\]]*Clone[^\]]*\)\][\s\S]{0,200}ReservationPlan/.test(model) ||
    /impl\s+Clone\s+for\s+[A-Za-z0-9_]*ReservationPlan/.test(model) ||
    /pub\s+(?:struct|fn)\s+[A-Za-z0-9_]*ReservationPlan/.test(model)
  ) {
    throw new Error("Category 9 reservation plan must remain private and non-Clone");
  }
  for (const evidence of [
    "evaluation-category9-reservation-v1-vectors.json",
    "CATEGORY9_VECTORS",
    "category9_vectors()",
  ]) {
    if (!tests.includes(evidence)) {
      throw new Error(`Category 9 Rust unit-test binding omits ${evidence}`);
    }
  }
  const frozenPinTest = testSlice(
    tests,
    "frozen_vector_fixture_and_source_pins_are_exact",
  );
  if (!/category9\["requiredTests"\][\s\S]{0,160}\.len\(\),\s*37/.test(frozenPinTest)) {
    throw new Error("Category 9 Rust unit test does not bind the 37-test corpus");
  }
  const step40Test = testSlice(
    tests,
    "category9_step40_rejects_every_range_family_and_cross_link_corruption",
  );
  const expectedStep40Corruptions = [
    "DirectVertexStart",
    "DirectUvLen",
    "DirectIndexFinal",
    "ParameterSymbolLen",
    "PresetSymbolStart",
    "PresetValueLen",
    "BindingPointStart",
    "SkinRestLen",
    "SkinWeightRowLen",
    "SkinWeightLen",
    "BindInverseStart",
    "EvaluatorDerivedLen",
    "SkinDerivedEquality",
    "CompensatingUvLengths",
    "InlinePhysicsPendulum",
    "InlinePhysicsInput",
    "InlinePhysicsOutput",
    "InlineIkConstraint",
    "AbsentInlinePhysics",
    "AbsentInlineIk",
    "MeshSelfIndex",
    "MeshFlagLink",
    "DirectIndexValue",
    "MeshSkinLink",
    "BindingTargetLink",
    "BindingTargetTuple",
    "PhysicsStageLink",
    "WorldOrderLink",
  ];
  const corruptionEnum = sliceBetween(
    step40Test,
    "enum Corruption {",
    "\n    }\n\n    let cases = [",
  );
  assertExactJson(
    [...corruptionEnum.matchAll(/^\s{8}([A-Z][A-Za-z0-9]+),$/gm)].map(
      (match) => match[1],
    ),
    expectedStep40Corruptions,
    "Category 9 step-40 corruption enum",
  );
  const corruptionCases = sliceBetween(
    step40Test,
    "let cases = [",
    "\n    ];\n\n    for (name, corruption, rich) in cases {",
  );
  assertExactJson(
    [...corruptionCases.matchAll(/Corruption::([A-Z][A-Za-z0-9]+)/g)].map(
      (match) => match[1],
    ),
    expectedStep40Corruptions,
    "Category 9 step-40 corruption cases",
  );
  for (const evidence of [
    "verify_category9_step40_for_test(&foundation)",
    '.expect_err("every post-materialization contradiction must reject")',
    "EvaluationLoweringErrorKind::Internal",
    'assert_eq!(error.load_status(), 10, "{name}")',
  ]) {
    if (!step40Test.includes(evidence)) {
      throw new Error(`Category 9 step-40 corruption test omits ${evidence}`);
    }
  }

  const allocatorTest = readText(`${loweringRoot}/tests/no_allocation.rs`);
  for (const evidence of [
    "#[global_allocator]",
    "GlobalAlloc, Layout, System",
    "all_39_reservations_are_the_only_allocations_during_lowering",
    "public_entry_materialization_branch_matrix_has_no_post_reserve_allocation",
    "EXPECTED_RESERVATION_BYTES",
    "EXPECTED_RESERVATION_ALIGNS",
    "OBSERVED_AFTER_LAST_RESERVE",
  ]) {
    if (!allocatorTest.includes(evidence)) {
      throw new Error(`Category 9 native allocator trap omits ${evidence}`);
    }
  }
  const wasmCompileTest = readText(`${loweringRoot}/tests/wasm_compile.rs`);
  for (const evidence of [
    "rustc",
    "1.89.0",
    "wasm32-unknown-unknown",
    'sources.join("error.rs")',
    'sources.join("model.rs")',
    'sources.join("reservation.rs")',
    'sources.join("lower.rs")',
    "probe_actual_public_surface",
    "lower::lower_evaluation_foundation_v1",
    "probe_actual_reservation_surface",
    "Category9SiteCountsV1::try_from_ordered",
    "Category9ReservationBuffersV1::reserve_all",
    "Category9ReservationBuffersV1::verify_plan",
    "ACTUAL_PUBLIC_ENTRY_CODEGEN_ROOT",
    "ACTUAL_PUBLIC_SURFACE_CODEGEN_ROOT",
    "ACTUAL_RESERVATION_CODEGEN_ROOT",
    "#[used]",
    "--target",
    "-Dwarnings",
  ]) {
    if (!wasmCompileTest.includes(evidence)) {
      throw new Error(`Category 9 host wasm compile test omits ${evidence}`);
    }
  }
  if (
    /wasmtime|wasmer|wasm-bindgen|wasm_bindgen|node\s+.*\.wasm/i.test(wasmCompileTest)
  ) {
    throw new Error("Category 9 wasm evidence must remain compile/instrumentation-only");
  }
}

function assertCategory9Step40Verifier(lower) {
  const retainedReplay = sliceBetween(
    lower,
    "let foundation = EvaluationLoweringFoundationV1 {",
    "\n}\n\n#[cfg(test)]",
  );
  assertOrderedEvidence(
    retainedReplay,
    [
      "let foundation = EvaluationLoweringFoundationV1 {",
      "Category9ReservationBuffersV1::verify_plan(",
      "let retained_root = object(foundation.candidate.value())?",
      'let retained_layers = array_property(retained_root, "layers")?',
      "verify_materialized_category9(",
      "retained_root",
      "retained_layers",
      "&census",
      "&foundation.reservation_plan",
      "Ok(foundation)",
    ],
    "Category 9 retained-candidate step-40 replay order",
  );
  const coordinator = sliceBetween(
    lower,
    "fn verify_materialized_category9(",
    "fn verify_exact_range",
  );
  assertOrderedEvidence(
    coordinator,
    [
      'object_property(root, "skins")?',
      "verify_direct_ranges(layers, skins, counts, plan)?",
      "verify_parameter_ranges(root, counts, plan)?",
      "verify_binding_ranges(root, counts, plan)?",
      "verify_skin_ranges(layers, skins, counts, plan)?",
      "verify_skin_weight_ranges(layers, skins, counts, plan)?",
      "verify_derived_ranges_and_mesh_links(layers, skins, counts, plan)?",
      "verify_inline_ranges(root, counts, plan)?",
      "verify_binding_target_links(root, layers, plan)?",
      "verify_physics_stage_links(root, layers, plan)?",
      "verify_world_order_links(plan)",
    ],
    "Category 9 step-40 range/cross-link verifier order",
  );
  const verifier = sliceBetween(
    lower,
    "fn verify_exact_range",
    "fn materialize_direct_meshes",
  );
  if (
    /\b(?:Vec|String|Box)::(?:new|with_capacity|from)\b|\.try_reserve|\.reserve|\.push\(|\.collect\b|\.to_vec\(|\.to_owned\(|\.clone\(/.test(
      verifier,
    )
  ) {
    throw new Error("Category 9 step-40 verifier must remain allocation-free");
  }
  if (/\bresource\(\)|EvaluationLoweringErrorKind::/.test(verifier)) {
    throw new Error(
      "Category 9 step-40 contradictions must remain Internal, not status 6",
    );
  }
  for (const evidence of [
    "return Err(internal())",
    "ok_or_else(internal)?",
    "map_err(|_| internal())?",
  ]) {
    if (!verifier.includes(evidence)) {
      throw new Error(`Category 9 step-40 Internal mapping omits ${evidence}`);
    }
  }
  const helper = (start, end, label, evidence) => {
    const body = sliceBetween(lower, `fn ${start}`, `fn ${end}`);
    for (const item of evidence) {
      if (!body.includes(item)) {
        throw new Error(`Category 9 step-40 ${label} omits ${item}`);
      }
    }
  };
  helper("verify_exact_range", "verify_range_total", "exact-range primitive", [
    "actual.start != *prefix",
    "actual.len != expected_len",
    "prefix.checked_add(expected_len).ok_or_else(internal)?",
  ]);
  helper("verify_range_total", "verify_u32_len", "range-total primitive", [
    "prefix != expected",
    "usize::try_from(prefix).map_err(|_| internal())? != actual_len",
  ]);
  helper("verify_direct_ranges", "verify_parameter_ranges", "direct ranges", [
    "record.vertex_range",
    "record.uv_range",
    "record.index_range",
    "actual.value != expected",
    "actual.value >= vertex_count",
    "mesh_index != plan.direct_mesh_records.len()",
    "counts.direct_unskinned_vertex_components",
    "plan.direct_unskinned_vertices.len()",
    "counts.uv_component_count",
    "plan.direct_uvs.len()",
    "counts.index_count",
    "plan.direct_indices.len()",
  ]);
  helper("verify_parameter_ranges", "verify_binding_ranges", "parameter ranges", [
    "plan.parameter_specs",
    "actual.symbol_range",
    "parameter_preset_specs",
    "actual.value_range",
    "counts.symbol_byte_count",
    "plan.parameter_symbol_bytes.len()",
    "counts.preset_value_count",
    "plan.parameter_preset_values.len()",
  ]);
  helper("verify_binding_ranges", "verify_skin_ranges", "binding ranges", [
    "plan.binding_specs",
    "actual.point_range",
    "counts.binding_point_count",
    "plan.binding_points.len()",
  ]);
  helper("verify_skin_ranges", "verify_skin_weight_ranges", "skin ranges", [
    "actual.mesh_slot != mesh_slot_value",
    "actual.rest_range",
    "actual.weight_row_range",
    "actual.bind_inverse_range",
    "verify_usable_bind_inverse_count(layers, skin)?",
    "skin_index != plan.skin_mesh_specs.len()",
    "counts.skinned_coordinate_count",
    "plan.skin_rest_coordinates.len()",
    "counts.skinned_vertex_count",
    "plan.skin_weight_rows.len()",
    "counts.usable_bind_inverse_count",
    "plan.skin_bind_inverses.len()",
  ]);
  helper(
    "verify_skin_weight_ranges",
    "verify_derived_ranges_and_mesh_links",
    "skin-weight ranges",
    [
      "actual.weights",
      "row_index != plan.skin_weight_rows.len()",
      "counts.skin_weight_count",
      "plan.skin_weights.len()",
    ],
  );
  helper(
    "verify_derived_ranges_and_mesh_links",
    "verify_inline_ranges",
    "derived ranges and mesh/skin links",
    [
      "direct.mesh_slot != mesh_slot_value",
      "evaluator.mesh_slot != mesh_slot_value",
      "evaluator.derived_range",
      "direct.flags & 1",
      "evaluator.static_flags & 1",
      "evaluator.skin_slot != expected_skin_slot",
      "skin.mesh_slot != mesh_slot_value",
      "skin.derived_range != evaluator.derived_range",
      "skin.rest_range != evaluator.derived_range",
      "evaluator.skin_slot != NONE_SLOT_V1",
      "counts.skinned_coordinate_count",
      "plan.derived_committed_coordinates.len()",
      "plan.derived_update_coordinates.len()",
      "plan.skin_skinned_scratch.len()",
      "plan.skin_rest_coordinates.len()",
    ],
  );
  helper("verify_inline_ranges", "verify_binding_target_links", "inline ranges", [
    "InlinePhysicsGroupV1::ABSENT",
    "inline.pendulum_range",
    "inline.input_range",
    "inline.output_range",
    "counts.enabled_pendulum_count",
    "counts.enabled_physics_input_count",
    "counts.enabled_physics_output_count",
    "InlineIkControllerV1::ABSENT",
    "inline.constraint_range",
    "counts.controller_constraint_count",
  ]);
  helper(
    "verify_binding_target_links",
    "verify_physics_stage_links",
    "binding-target links",
    [
      "binding_target_slot(bindings, source_target)?",
      "binding_target_key(source_target)?",
      "bone_slot(layers, owner_id)?",
      "controller_slot(controllers, owner_id)?",
      "binding_property_code(kind, property)?",
      "spec.target_slot != expected_target",
      "(target.kind, target.property, target.owner_slot)",
      "(expected_kind, expected_property, expected_owner)",
      "spec.target_slot == next_first_occurrence",
      "plan.binding_targets[..index]",
    ],
  );
  helper("verify_physics_stage_links", "verify_world_order_links", "physics links", [
    "physics_stage_slot(outputs, output)?",
    '"angle" =>',
    '"boneAngle" =>',
    "actual.destination_kind != expected_kind",
    "actual.destination_slot != expected_destination",
    "actual.stage_slot != expected_stage",
    "actual.pendulum_index != expected_pendulum",
    "parameter_staged_destinations",
    "bone_staged_destinations",
    "staged_owner != Some(actual.destination_slot)",
    "outputs.len() != plan.physics_outputs.len()",
  ]);
  helper("verify_world_order_links", "materialize_direct_meshes", "world-order links", [
    "plan.bone_specs.len() != plan.bone_world_order_slots.len()",
    "spec.bone_slot != u32::try_from(index)",
    "spec.parent_slot != NONE_SLOT_V1",
    "any(|slot| slot.value == spec.bone_slot)",
    "any(|slot| slot.value == spec.parent_slot)",
    "selected = Some(spec.bone_slot)",
    "Some(plan.bone_world_order_slots[position].value) != selected",
  ]);
}

function assertIsolation(metadata) {
  const productionFiles = walkFiles(resolve(`${loweringRoot}/src`)).filter(
    (filePath) => filePath.endsWith(".rs") && !filePath.endsWith("tests.rs"),
  );
  const forbiddenPatterns = [
    [/\bunsafe\s+(?:fn|trait|impl)\b|\bunsafe\s*\{/m, "unsafe code"],
    [/\bextern\s+"C"\b|no_mangle|export_name|link_name/m, "language ABI/export"],
    [
      /\bvivi_runtime_native_core\b|\bCoreRuntimeModel\b|\bDrawCommand\b/m,
      "runtime-native core/model construction",
    ],
    [
      /\bvivi_asset_host_local\b|\bLocalAssetHost\b|\bAssetRef\b/m,
      "direct Asset-host use",
    ],
    [/\b(?:wasm_bindgen|napi|neon|pyo3|jni|uniffi|cxx)\b/m, "language/WASM bridge"],
    [/\b(?:wgpu|glow|vulkano|ash)\b/m, "GPU integration"],
    [/\bvivi_model_load_evaluation\b/m, "editor-only C ABI symbol"],
    [/vivi\.cap\.|supported_capabilit/i, "capability advertisement"],
    [
      /\b(?:std::fs|std::net|tokio|reqwest|rusqlite|SqliteConnection)\b/m,
      "direct filesystem/network/store I/O",
    ],
  ];
  for (const filePath of productionFiles) {
    const source = readFileSync(filePath, "utf8");
    for (const [pattern, label] of forbiddenPatterns) {
      if (pattern.test(source)) {
        throw new Error(`${toRelative(filePath)} adds forbidden ${label}`);
      }
    }
  }
  assertReferenceAllowlist();
  const wasmPackage = requirePackage(metadata, "vivi-runtime-native-wasm");
  if (
    wasmPackage.dependencies.some(
      (dependency) => dependency.name === "vivi-runtime-native-evaluation-lowering",
    )
  ) {
    throw new Error("runtime-native WASM must not depend on lowering");
  }
}

function assertGateAndDocumentationWiring() {
  const runtimePackage = readJson("packages/runtime-native/package.json");
  const expectedNativeScript =
    "cargo test --locked --manifest-path Cargo.toml -p vivi-runtime-native-evaluation-lowering --all-targets && cargo clippy --locked --manifest-path Cargo.toml -p vivi-runtime-native-evaluation-lowering --all-targets -- -D warnings";
  if (runtimePackage.scripts?.["check:evaluation-lowering"] !== expectedNativeScript) {
    throw new Error("lowering native test/Clippy script drifted");
  }
  if (
    Object.entries(runtimePackage.scripts ?? {}).some(
      ([name, command]) =>
        /evaluation-lowering/i.test(`${name} ${command}`) && /wasm32/i.test(command),
    )
  ) {
    throw new Error("lowering must not add a full-package wasm32 target gate");
  }

  const rootPackage = readJson("package.json");
  const expectedRootScript =
    "node scripts/check-runtime-native-evaluation-lowering.mjs && npm run check:evaluation-lowering --workspace @vivi2d/runtime-native";
  if (
    rootPackage.scripts?.["check:runtime-native-evaluation-lowering"] !==
    expectedRootScript
  ) {
    throw new Error("root lowering gate drifted");
  }
  if (
    !readText("scripts/run-quality-gates.mjs").includes(
      '"check:runtime-native-evaluation-lowering"',
    )
  ) {
    throw new Error("root quality runner omits the lowering gate");
  }

  const gateManifest = readJson("scripts/quality-gate-manifest.json");
  const gate = gateManifest.gates?.find(
    (candidate) => candidate.npmScript === "check:runtime-native-evaluation-lowering",
  );
  if (
    gate?.command !== "npm run check:runtime-native-evaluation-lowering" ||
    JSON.stringify(gate.requiredWorkflows) !==
      JSON.stringify([".github/workflows/runtime-native.yml"]) ||
    gate.intentionallySplit !== true ||
    gate.escalatable !== true
  ) {
    throw new Error("lowering quality-gate manifest entry drifted");
  }
  for (const evidence of [
    "native-only",
    "consumer-zero",
    "exact direct production dependencies",
    "vivi-runtime-native-preactivation and serde_json",
    "move-only pure correlated-input token",
    "execute exactly once",
    "outer phases 1-3",
    "lowering categories 1-9",
    "direct-projection classification precedes",
    "only after reservation does single-cast materialization fill retained records",
    "category 10 derived evaluation",
    "category 11 topology/identity/sealing",
    "41,556 bytes",
    approvedArtifacts[0].sha256,
    "90,906 bytes",
    approvedArtifacts[1].sha256,
    "20,624 bytes",
    approvedArtifacts[2].sha256,
    "P0/P1/P2 none, P3 two, and no required edits",
    "parent vectors' external-review-required value is the frozen historical pre-review status",
    "41,002 bytes",
    approvedCategory9Artifacts[0].sha256,
    "210,149 bytes",
    approvedCategory9Artifacts[1].sha256,
    "18,793 bytes",
    approvedCategory9Artifacts[2].sha256,
    "37-key / 568-ID inventory",
    "11 logical buckets",
    "82 formula/AST programs",
    "39 ordered allocation sites and denial tuples",
    "30 target-fixed layout assertions",
    "37-test requirement corpus",
    "rather than trusting selfValidation booleans",
    "all 30 scalar projection records",
    "13 blend modes across all 7 recursive scan contexts",
    "applicable eligibility and precedence cases",
    "191 row-level plus 23 owner-context future obligations",
    "not claimed as executable fixture bodies",
    "one IEEE-754 binary32 round-to-nearest-ties-to-even cast",
    "non-finite, overflow, nonzero-to-zero underflow",
    "normal=0, multiply=1, screen=2, and add=3",
    "nine extended modes",
    "non-Clone private Foundation/Preflight state",
    "only generation and aggregate-count accessors",
    "no candidate, JSON value, texture plan, AssetRef, identifier, or into_parts accessor",
    "no direct Asset-host dependency, host/store argument, or host call",
    "mask-command construction",
    "sealing as LoweredEvaluationCandidateV1",
    "Exact primitive operation graph/parenthesization",
    "FMA policy",
    "non-finite checkpoint schedule",
    "deterministic transcendental kernel",
    "before category 10 or any core/native/TypeScript evaluator connection",
    "production source performs no filesystem/network I/O and has no host/store call or argument",
    "Rust 1.89",
    "host `wasm_compile` integration test",
    "exact production `error.rs`, `model.rs`, `reservation.rs`, and `lower.rs`",
    "actual `lower_evaluation_foundation_v1` probe",
    "census, reserve, and materialize call graph compile/codegen-visible",
    "native `no_allocation` allocator trap",
    "`--test-threads=1`",
    "existing package command and three-OS native workflow wiring remain byte-identical",
    "no full-package wasm target command or workflow step",
    "not wasm execution, cross-target parity, product/dependency WASM support",
    "rustdoc with warnings denied",
    "three-OS native workflow wiring",
    "without claiming hosted CI green, production reachability, public support, or EDH-01 closure",
  ]) {
    if (!gate.notes?.includes(evidence)) {
      throw new Error(`lowering gate note is missing ${evidence}`);
    }
  }
  for (const stale of [
    "direct candidate-to-snapshot projection precede",
    "no Asset-host edge",
    "disconnected from runtime-native core, C ABI/editor headers or exports, runtime-native WASM dependencies or exports, TypeScript/language/IPC bridges, filesystem/network I/O",
  ]) {
    if (gate.notes?.includes(stale)) {
      throw new Error(`lowering gate note retains overbroad/stale wording: ${stale}`);
    }
  }

  const workflow = readText(".github/workflows/runtime-native.yml");
  for (const evidence of [
    "RUSTUP_TOOLCHAIN: 1.89.0",
    "matrix:\n        os: [ubuntu-latest, windows-latest, macos-latest]",
    '"scripts/check-runtime-native-evaluation-lowering.mjs"',
    "npm run check:runtime-native-evaluation-lowering",
    "$" + "{{ runner.temp }}/vivi-runtime-native-evaluation-lowering-native",
    "scripts/check-runtime-native-evaluation-lowering.mjs scripts/check-runtime-native-evaluation-math.mjs scripts/check-runtime-native-evaluation.mjs",
  ]) {
    if (!workflow.includes(evidence)) {
      throw new Error(
        `runtime-native workflow is missing lowering evidence: ${evidence}`,
      );
    }
  }
  if (
    /check:evaluation-lowering:wasm32|evaluation-lowering[^\n]*(?:--target|target:)\s*wasm32/i.test(
      workflow,
    )
  ) {
    throw new Error("lowering must not add a full-package wasm32 workflow step");
  }
  if (
    !readText(".github/ISSUE_TEMPLATE/gate_failure.yml").includes(
      "check:runtime-native-evaluation-lowering",
    )
  ) {
    throw new Error("gate failure template omits the lowering gate");
  }

  const documentationPaths = [
    "docs/developer/architecture/overview.md",
    "docs/developer/architecture/package-graph.md",
    "docs/developer/contributing/package-boundaries.md",
    "docs/developer/quality/public-api-status.md",
  ];
  const normalizedDocumentation = documentationPaths.map((documentationPath) => [
    documentationPath,
    readText(documentationPath).replace(/\s+/g, " "),
  ]);
  for (const [documentationPath, contents] of normalizedDocumentation) {
    for (const evidence of [
      "vivi-runtime-native-evaluation-lowering",
      "native-only",
      "consumer-zero",
      "Evaluation Lowering Contract v1",
      "categories 1–9",
      "category 10",
      "category 11",
      "no direct Asset-host dependency",
      "deterministic",
      "41,002 bytes",
      "210,149 bytes",
      "18,793 bytes",
      "39",
      "82",
      "30",
      "37-test requirement",
      "`wasm_compile`",
      "exact production `error.rs`, `model.rs`, `reservation.rs`, and `lower.rs`",
      "actual `lower_evaluation_foundation_v1` probe",
      "compile/codegen-visible",
      "no full-package wasm target",
      "wasm execution",
      "dependency WASM support",
      "lowering implementation candidate",
      "EDH-01",
    ]) {
      if (!contents.toLowerCase().includes(evidence.toLowerCase())) {
        throw new Error(`${documentationPath} is missing lowering scope: ${evidence}`);
      }
    }
  }
  const documentation = normalizedDocumentation
    .map(([, contents]) => contents)
    .join("\n");
  for (const evidence of [
    "overall phases 1–3",
    "categories 1–8",
    "checked/fallible reservation",
    "single typed-plan/direct-projection materialization",
    "normal=0",
    "multiply=1",
    "screen=2",
    "add=3",
    "nine extended modes",
    "round-to-nearest-ties-to-even",
    "positive zero",
    "nonzero-to-zero underflow",
    "nonzero binary32 subnormal",
    "Foundation",
    "aggregate counts",
    "candidate/value/plan/`AssetRef`/ID accessor",
    "consuming `into_parts`",
    "mask-command construction",
    "invariant sealing",
    "model-ready",
    "host/store argument",
    "host call",
    "runtime-native core",
    "C ABI/editor",
    "WASM",
    "TypeScript",
    "GPU",
    "primitive operation graph",
    "FMA policy",
    "non-finite checkpoint",
    "transcendental",
  ]) {
    if (!documentation.toLowerCase().includes(evidence.toLowerCase())) {
      throw new Error(`lowering documentation is missing ${evidence}`);
    }
  }
  for (const stale of ["no Asset-host edge", "no Asset host edge"]) {
    if (documentation.includes(stale)) {
      throw new Error(
        `lowering documentation contains overbroad transitive claim: ${stale}`,
      );
    }
  }
}

function runCategory9AllocatorGate() {
  runCapture("cargo", [
    "+1.89.0",
    "test",
    "--locked",
    "--manifest-path",
    nativeManifestPath,
    "-p",
    "vivi-runtime-native-evaluation-lowering",
    "--test",
    "no_allocation",
    "--",
    "--test-threads=1",
  ]);
}

function runRustdocGate() {
  runCapture(
    "cargo",
    [
      "+1.89.0",
      "doc",
      "--locked",
      "--manifest-path",
      nativeManifestPath,
      "-p",
      "vivi-runtime-native-evaluation-lowering",
      "--no-deps",
    ],
    { RUSTDOCFLAGS: "-D warnings" },
  );
}

function readCargoMetadata() {
  return JSON.parse(
    runCapture("cargo", [
      "+1.89.0",
      "metadata",
      "--locked",
      "--format-version",
      "1",
      "--manifest-path",
      nativeManifestPath,
    ]),
  );
}

function requirePackage(metadata, packageName) {
  const pkg = metadata.packages.find((candidate) => candidate.name === packageName);
  if (!pkg) throw new Error(`cargo metadata omitted ${packageName}`);
  return pkg;
}

function consumersOf(metadata, dependencyName) {
  return metadata.packages
    .filter((pkg) =>
      pkg.dependencies.some(
        (dependency) =>
          dependency.name === dependencyName &&
          (dependency.kind ?? "normal") === "normal",
      ),
    )
    .map((pkg) => pkg.name)
    .sort();
}

function directDependency(name, req, kind, features, sourceKind, usesDefaultFeatures) {
  return {
    name,
    req,
    kind,
    optional: false,
    target: null,
    usesDefaultFeatures,
    features: [...features].sort(),
    sourceKind,
  };
}

function closureFromRoot(metadata, packageId, rootKinds) {
  const nodes = new Map(metadata.resolve.nodes.map((node) => [node.id, node]));
  const closure = new Set();
  for (const dependencyEdge of nodes.get(packageId)?.deps ?? []) {
    if (dependencyEdge.dep_kinds.some((kind) => rootKinds.has(kind.kind ?? null))) {
      visitDependency(dependencyEdge.pkg, nodes, closure);
    }
  }
  return closure;
}

function visitDependency(id, nodes, closure) {
  if (closure.has(id)) return;
  closure.add(id);
  for (const dependencyEdge of nodes.get(id)?.deps ?? []) {
    if (
      dependencyEdge.dep_kinds.some((kind) => kind.kind === null || kind.kind === "build")
    ) {
      visitDependency(dependencyEdge.pkg, nodes, closure);
    }
  }
}

function dependencyInventory(closure, packages, lockPackages) {
  return [...closure]
    .map((id) => {
      const pkg = packages.get(id);
      if (!pkg) throw new Error("cargo metadata omitted a closure package");
      return {
        name: pkg.name,
        version: pkg.version,
        license: pkg.license,
        source: pkg.source,
        checksum: lockPackages.get(`${pkg.name}@${pkg.version}`)?.checksum ?? null,
      };
    })
    .sort(compareDependencies);
}

function assertDependencyInventoryPin(actual, expectedPin, label) {
  for (const dependency of actual) {
    if (!dependency.license) {
      throw new Error(`${label} dependency omits license metadata: ${dependency.name}`);
    }
    if (dependency.source !== null && dependency.checksum === null) {
      throw new Error(
        `${label} registry dependency omits lock checksum: ${dependency.name}`,
      );
    }
  }
  const actualHash = sha256(Buffer.from(JSON.stringify(actual), "utf8"));
  if (actual.length !== expectedPin.count || actualHash !== expectedPin.sha256) {
    throw new Error(
      `${label} dependency/license/checksum closure drifted: ${actual.length}/${actualHash}\nactual=${JSON.stringify(actual, null, 2)}`,
    );
  }
}

function compareDependencies(left, right) {
  return (
    left.name.localeCompare(right.name) ||
    left.version.localeCompare(right.version) ||
    String(left.source).localeCompare(String(right.source))
  );
}

function readCargoLockPackages() {
  const packages = new Map();
  for (const block of readText(nativeLockPath)
    .split(/^\[\[package\]\]\s*$/m)
    .slice(1)) {
    const name = /^name = "([^"]+)"$/m.exec(block)?.[1];
    const version = /^version = "([^"]+)"$/m.exec(block)?.[1];
    const checksum = /^checksum = "([^"]+)"$/m.exec(block)?.[1] ?? null;
    if (name && version) packages.set(`${name}@${version}`, { checksum });
  }
  return packages;
}

function compareDirectDependencies(left, right) {
  return (
    left.name.localeCompare(right.name) ||
    left.kind.localeCompare(right.kind) ||
    JSON.stringify(left).localeCompare(JSON.stringify(right))
  );
}

function assertPrivateStructFields(source, structName) {
  const body = structBody(source, structName);
  if (/^\s*pub\s+[A-Za-z0-9_]+\s*:/m.test(body)) {
    throw new Error(`${structName} must keep all fields externally private`);
  }
}

function assertNoDuplicateJsonKeys(source, label) {
  let cursor = 0;
  const fail = (message) => {
    throw new Error(`${label} ${message} at byte/character ${cursor}`);
  };
  const whitespace = () => {
    while (/\s/.test(source[cursor] ?? "")) cursor += 1;
  };
  const parseString = () => {
    if (source[cursor] !== '"') fail("expected a JSON string");
    const start = cursor;
    cursor += 1;
    while (cursor < source.length) {
      const character = source[cursor];
      if (character === '"') {
        cursor += 1;
        return JSON.parse(source.slice(start, cursor));
      }
      if (character === "\\") {
        cursor += 2;
      } else {
        if (character.charCodeAt(0) < 0x20) fail("contains a raw control character");
        cursor += 1;
      }
    }
    fail("has an unterminated JSON string");
  };
  const parseValue = () => {
    whitespace();
    const character = source[cursor];
    if (character === "{") {
      cursor += 1;
      whitespace();
      const keys = new Set();
      if (source[cursor] === "}") {
        cursor += 1;
        return;
      }
      while (cursor < source.length) {
        whitespace();
        const key = parseString();
        if (keys.has(key)) fail(`contains duplicate object key ${JSON.stringify(key)}`);
        keys.add(key);
        whitespace();
        if (source[cursor] !== ":") fail("expected ':' after object key");
        cursor += 1;
        parseValue();
        whitespace();
        if (source[cursor] === "}") {
          cursor += 1;
          return;
        }
        if (source[cursor] !== ",") fail("expected ',' between object members");
        cursor += 1;
      }
      fail("has an unterminated object");
    }
    if (character === "[") {
      cursor += 1;
      whitespace();
      if (source[cursor] === "]") {
        cursor += 1;
        return;
      }
      while (cursor < source.length) {
        parseValue();
        whitespace();
        if (source[cursor] === "]") {
          cursor += 1;
          return;
        }
        if (source[cursor] !== ",") fail("expected ',' between array elements");
        cursor += 1;
      }
      fail("has an unterminated array");
    }
    if (character === '"') {
      parseString();
      return;
    }
    for (const literal of ["true", "false", "null"]) {
      if (source.startsWith(literal, cursor)) {
        cursor += literal.length;
        return;
      }
    }
    const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(
      source.slice(cursor),
    )?.[0];
    if (!number) fail("contains invalid JSON value syntax");
    cursor += number.length;
  };
  parseValue();
  whitespace();
  if (cursor !== source.length) fail("contains trailing non-whitespace data");
}

function assertContiguousOrders(rows, label) {
  for (const [index, row] of rows.entries()) {
    if (row.order !== index + 1) {
      throw new Error(`${label} order drifted at row ${index + 1}`);
    }
  }
}

function visitObjects(value, visitor, objectPath = "$") {
  if (Array.isArray(value)) {
    for (const [index, child] of value.entries()) {
      visitObjects(child, visitor, `${objectPath}[${index}]`);
    }
    return;
  }
  if (value === null || typeof value !== "object") return;
  visitor(value, objectPath);
  for (const [key, child] of Object.entries(value)) {
    visitObjects(child, visitor, `${objectPath}.${key}`);
  }
}

function alignUp(value, alignment) {
  return Math.ceil(value / alignment) * alignment;
}

function toCategory9BigInt(value, label) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  throw new Error(`${label} is not an exact unsigned integer`);
}

function collectRootReexports(source) {
  const names = [];
  for (const match of source.matchAll(/\bpub\s+use\s+([\s\S]*?);/g)) {
    const specifier = match[1].trim();
    const openBrace = specifier.indexOf("{");
    if (openBrace >= 0) {
      const closeBrace = specifier.lastIndexOf("}");
      if (closeBrace <= openBrace) {
        throw new Error(`malformed root re-export: ${specifier}`);
      }
      for (const rawName of specifier.slice(openBrace + 1, closeBrace).split(",")) {
        const name = rawName.trim();
        if (!name) continue;
        if (name.includes("::") || name === "*" || /\bas\b/.test(name)) {
          throw new Error(`unsupported root re-export shape: ${name}`);
        }
        names.push(name);
      }
    } else {
      const name = specifier.split("::").at(-1)?.trim();
      if (!name || name === "*" || /\bas\b/.test(name)) {
        throw new Error(`unsupported root re-export shape: ${specifier}`);
      }
      names.push(name);
    }
  }
  return names;
}

function assertReferenceAllowlist() {
  const allowed = new Set([
    ".github/ISSUE_TEMPLATE/gate_failure.yml",
    ".github/workflows/runtime-native.yml",
    "docs/developer/architecture/overview.md",
    "docs/developer/architecture/package-graph.md",
    "docs/developer/api/spec/runtime-native-evaluation-category9-reservation-review-approved.md",
    "docs/developer/api/spec/runtime-native-evaluation-category9-reservation-review-packet-manifest.md",
    "docs/developer/api/spec/runtime-native-evaluation-category9-reservation-review-packet.ps1",
    "docs/developer/api/spec/runtime-native-evaluation-category9-reservation-review-request.md",
    "docs/developer/contributing/package-boundaries.md",
    "docs/developer/quality/public-api-status.md",
    "package.json",
    "packages/runtime-native/Cargo.lock",
    "packages/runtime-native/Cargo.toml",
    "packages/runtime-native/package.json",
    "packages/runtime-native/crates/vivi-runtime-native-evaluation-math/fixtures/evaluation-deterministic-math-v1-vectors.json",
    "packages/runtime-native/crates/vivi-runtime-native-evaluation-math/src/tests.rs",
    "scripts/check-runtime-native-evaluation-lowering.mjs",
    "scripts/check-runtime-native-evaluation-math.mjs",
    "scripts/check-runtime-native-evaluation.mjs",
    "scripts/check-runtime-native-preactivation.mjs",
    "scripts/quality-gate-manifest.json",
    "scripts/run-quality-gates.mjs",
  ]);
  const referencePattern =
    /vivi[-_]runtime[-_]native[-_]evaluation[-_]lowering|lower_evaluation_foundation_v1|EvaluationLowering(?:FoundationV1|ErrorKind|Error)/;
  const files = runCapture("git", [
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
  ])
    .split(/\r?\n/)
    .filter(Boolean);
  for (const relativePath of files) {
    // These user-owned paths are status/path metadata only. This exact skip
    // must precede resolve/exists/stat/read so the checker cannot inspect a
    // protected body while scanning repository references.
    if (protectedBodyPaths.has(relativePath)) continue;
    if (allowed.has(relativePath) || relativePath.startsWith(`${loweringRoot}/`)) {
      continue;
    }
    const filePath = resolve(relativePath);
    if (!existsSync(filePath) || statSync(filePath).size > 8 * 1024 * 1024) continue;
    if (referencePattern.test(readFileSync(filePath, "utf8"))) {
      throw new Error(`${relativePath} references lowering outside the exact allowlist`);
    }
  }
}

function structBody(source, structName) {
  const match = new RegExp(
    `pub\\s+struct\\s+${escapeRegExp(structName)}\\s*\\{([\\s\\S]*?)\\n\\}`,
  ).exec(source);
  if (!match) throw new Error(`public struct ${structName} is missing`);
  return match[1];
}

function assertExactEnumVariants(source, enumName, expectedVariants) {
  const match = new RegExp(
    `pub\\s+enum\\s+${escapeRegExp(enumName)}\\s*\\{([\\s\\S]*?)\\n\\}`,
  ).exec(source);
  if (!match) throw new Error(`public enum ${enumName} is missing`);
  const actual = match[1]
    .split("\n")
    .map((line) => /^\s*([A-Z][A-Za-z0-9_]*)\b/.exec(line)?.[1])
    .filter(Boolean)
    .sort();
  assertExactJson(actual, [...expectedVariants].sort(), `${enumName} variant inventory`);
}

function rustStructFields(source, structName) {
  const declaration = new RegExp(
    `(?:pub(?:\\(crate\\))?\\s+)?struct\\s+${escapeRegExp(structName)}\\s*\\{`,
  ).exec(source);
  if (!declaration) throw new Error(`Rust struct ${structName} is missing`);
  const bodyStart = declaration.index + declaration[0].length;
  const bodyEnd = source.indexOf("\n}", bodyStart);
  if (bodyEnd < bodyStart) throw new Error(`Rust struct ${structName} is unterminated`);
  return [
    ...source
      .slice(bodyStart, bodyEnd)
      .matchAll(/^\s*(?:pub\(crate\)\s+)?([a-z][a-z0-9_]*):\s*([^,\n]+),\s*$/gm),
  ].map((match) => [match[1], match[2].replace(/\s+/g, "")]);
}

function toRustSnake(value) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[.-]/g, "_")
    .toLowerCase();
}

function toRustVariant(value) {
  return value
    .split(/[.-]/)
    .map((part) => `${part[0].toUpperCase()}${part.slice(1)}`)
    .join("");
}

function collectObjectIds(value, ids) {
  if (Array.isArray(value)) {
    for (const item of value) collectObjectIds(item, ids);
    return;
  }
  if (value === null || typeof value !== "object") return;
  if (typeof value.id === "string") ids.push(value.id);
  for (const child of Object.values(value)) collectObjectIds(child, ids);
}

function testSlice(source, testName) {
  const startNeedle = `fn ${testName}()`;
  const start = source.indexOf(startNeedle);
  if (start < 0) throw new Error(`Rust test is missing: ${testName}`);
  const nextTest = source.indexOf("\n#[test]", start + startNeedle.length);
  return source.slice(start, nextTest < 0 ? source.length : nextTest);
}

function sliceBetween(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  if (start < 0 || end <= start) {
    throw new Error(`source slice is missing: ${startNeedle} -> ${endNeedle}`);
  }
  return source.slice(start, end);
}

function walkFiles(directory) {
  if (!existsSync(directory)) return [];
  const result = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "target") result.push(...walkFiles(entryPath));
    } else {
      result.push(entryPath);
    }
  }
  return result;
}

function readText(relativePath) {
  return readFileSync(resolve(relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function readBuffer(relativePath) {
  return readFileSync(resolve(relativePath));
}

function resolve(relativePath) {
  return path.resolve(root, relativePath);
}

function toRelative(filePath) {
  return path.relative(root, filePath).split(path.sep).join("/");
}

function toRelativeFrom(relativeRoot, filePath) {
  return path.relative(resolve(relativeRoot), filePath).split(path.sep).join("/");
}

function runCapture(command, args, extraEnv = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...extraEnv },
  });
  if (result.status !== 0) {
    throw new Error(
      [`${command} ${args.join(" ")} failed`, result.stdout, result.stderr]
        .filter(Boolean)
        .join("\n")
        .trim(),
    );
  }
  return result.stdout;
}

function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

function assertExactJson(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${label} drifted\nexpected=${JSON.stringify(expected, null, 2)}\nactual=${JSON.stringify(actual, null, 2)}`,
    );
  }
}

function assertOrderedEvidence(source, evidence, label) {
  let offset = -1;
  for (const item of evidence) {
    const nextOffset = source.indexOf(item, offset + 1);
    if (nextOffset <= offset) {
      throw new Error(`${label} is missing ordered evidence: ${item}`);
    }
    offset = nextOffset;
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
