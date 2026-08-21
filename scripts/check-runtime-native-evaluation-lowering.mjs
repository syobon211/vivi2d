import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const nativeManifestPath = "packages/runtime-native/Cargo.toml";
const nativeLockPath = "packages/runtime-native/Cargo.lock";
const loweringRoot =
  "packages/runtime-native/crates/vivi-runtime-native-evaluation-lowering";
const loweringManifestPath = `${loweringRoot}/Cargo.toml`;
const vectorPath = `${loweringRoot}/fixtures/evaluation-lowering-v1-vectors.json`;

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

const expectedLoweringFiles = [
  "Cargo.toml",
  "fixtures/evaluation-lowering-v1-vectors.json",
  "src/error.rs",
  "src/lib.rs",
  "src/lower.rs",
  "src/model.rs",
  "src/tests.rs",
].sort();

const pinnedLoweringFiles = [
  ["Cargo.toml", 715, "5f7fa0f5f3724fc64423ff42028afbeaf3775fbf5c61bfb44c9389ae136251b0"],
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
    2_718,
    "6b065e50e673de3f974af182ecfa11da7213b08b2034c39733a51e44eccd82df",
  ],
  [
    "src/lower.rs",
    20_989,
    "f83d010c066a5b680877e26eac57fbdfc1588c4471dc858630bd54a1c331d697",
  ],
  [
    "src/model.rs",
    3_665,
    "f9866d8e7eaa265afdc97609f0057a735ca5af712ec2a587296d7fec776c1fb9",
  ],
  [
    "src/tests.rs",
    40_477,
    "d2f760e464cf8e68d53c29c3c91278161603902d62517faee63a78d6024a038e",
  ],
];

const expectedTestNames = [
  "adjacent_lowering_categories_have_total_precedence",
  "all_thirteen_blends_cross_all_seven_recursive_contexts",
  "all_thirty_scalar_projection_vectors_are_bit_exact",
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
  assertSourceInventory();
  const vectors = assertApprovedReviewUnit();
  const metadata = assertCargoBoundary();
  assertDependencyPins(metadata);
  assertConsumerGraph(metadata);
  assertPublicSurface();
  assertFoundationContract(vectors);
  assertIsolation(metadata);
  assertGateAndDocumentationWiring();
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
    pkg.targets.some((target) =>
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

function assertFoundationContract(vectors) {
  const lib = readText(`${loweringRoot}/src/lib.rs`);
  const lower = readText(`${loweringRoot}/src/lower.rs`);
  const model = readText(`${loweringRoot}/src/model.rs`);
  const error = readText(`${loweringRoot}/src/error.rs`);
  const tests = readText(`${loweringRoot}/src/tests.rs`);
  const production = [lib, lower, model, error].join("\n");

  for (const evidence of [
    "41_556",
    approvedArtifacts[0].sha256,
    "90_906",
    approvedArtifacts[1].sha256,
    "20_624",
    approvedArtifacts[2].sha256,
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
  const entry = sliceBetween(
    lower,
    "pub(crate) fn lower_correlated_with_reservation",
    "#[derive(Default)]",
  );
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
      "count_foundation(layers, skins, &mut counts)?",
      "let mut meshes = Vec::new()",
      "reserve_exact(&mut meshes, counts.mesh_count",
      "reserve_mesh_buffers(layers, skins, &mut meshes",
      "fill_direct_projection_records(layers, skins, &mut meshes",
    ],
    "lowering phases 1-3/categories 1-9 order",
  );

  const categoryOneThroughEight = sliceBetween(
    lower,
    "fn reject_art_paths",
    "fn count_foundation",
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
  for (const evidence of ["checked_add", "try_reserve_exact", "reservation_allowed"])
    if (!lower.includes(evidence)) {
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
    "fn fill_direct_projection_records",
    "fn fill_projected_array",
  );
  assertOrderedEvidence(
    fill,
    [
      'array_property(mesh, "vertices")',
      "buffer.uvs",
      'f64_property(layer, "x")',
      'f64_property(layer, "y")',
      'f64_property(layer, "opacity")',
      'layer.get("multiplyColor")',
      'layer.get("screenColor")',
    ],
    "recursive mesh direct-projection field order",
  );
  if (
    !fill.includes("project_validated_binary64_to_binary32") ||
    fill.includes("project_binary64_to_binary32")
  ) {
    throw new Error(
      "post-reservation fill must use only the infallible private cast after category-8 validation",
    );
  }

  const blendParser = sliceBetween(lower, "fn parse_blend_mode", "fn reserve_exact");
  for (const evidence of [
    '"normal" => Ok(FoundationBlendModeV1::Normal)',
    '"multiply" => Ok(FoundationBlendModeV1::Multiply)',
    '"screen" => Ok(FoundationBlendModeV1::Screen)',
    '"add" => Ok(FoundationBlendModeV1::Add)',
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
    "lower_correlated_with_reservation(correlated, |_| false)",
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
    productionFunctionNames.some((name) =>
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
    throw new Error("native-only lowering must not add a wasm32 build gate");
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
    "external-review-required value is the frozen historical pre-review status",
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
    "scripts/check-runtime-native-evaluation-lowering.mjs scripts/check-runtime-native-evaluation.mjs",
  ]) {
    if (!workflow.includes(evidence)) {
      throw new Error(
        `runtime-native workflow is missing lowering evidence: ${evidence}`,
      );
    }
  }
  if (/evaluation-lowering[^\n]*wasm32|wasm32[^\n]*evaluation-lowering/i.test(workflow)) {
    throw new Error("native-only lowering must remain absent from wasm32 steps");
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
    "single direct-projection materialization",
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
    "docs/developer/contributing/package-boundaries.md",
    "docs/developer/quality/public-api-status.md",
    "package.json",
    "packages/runtime-native/Cargo.lock",
    "packages/runtime-native/Cargo.toml",
    "packages/runtime-native/package.json",
    "scripts/check-runtime-native-evaluation-lowering.mjs",
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
