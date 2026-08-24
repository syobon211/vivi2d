import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const root = process.cwd();
const nativeManifestPath = "packages/runtime-native/Cargo.toml";
const nativeLockPath = "packages/runtime-native/Cargo.lock";
const oracleRoot = "packages/runtime-native/crates/vivi-runtime-native-evaluation-math";
const oracleManifestPath = `${oracleRoot}/Cargo.toml`;
const vectorFixturePath = `${oracleRoot}/fixtures/evaluation-deterministic-math-v1-vectors.json`;
const protectedBodyPaths = new Set([
  "src/lib/__tests__/see-through-auto-setup.test.ts",
  "src/lib/see-through-auto-setup.ts",
  "src/stores/projectIO/__tests__/seeThroughNativeImport.test.ts",
]);

const approvedArtifacts = [
  {
    path: "docs/developer/api/spec/evaluation-deterministic-math-v1.draft.md",
    bytes: 38_965,
    sha256: "d39ed92629b89a3bf2e4c4cb37657e7407ede750896caf619cd121fa3ab9b75a",
  },
  {
    path: "docs/developer/api/spec/evaluation-deterministic-math-v1-vectors.json",
    bytes: 79_921,
    sha256: "0a467b96d93ea0b7b8d12f8b8229d050b50945c40fff29c8ace0469b76cdec00",
  },
  {
    path: "docs/developer/api/spec/evaluation-deterministic-math-v1-review-approved.md",
    bytes: 24_456,
    sha256: "ae47988b58c56b32ec4a6c06809c61d5112ab1a68c8e5534e94c4a7c0b508cd7",
  },
];

const sourcePins = [
  {
    package: "bitflags",
    version: "2.13.1",
    archive: "bitflags-2.13.1.crate",
    bytes: 51_395,
    sha256: "b588b76d00fde79687d7646a9b5bdf3cc0f655e0bbd080335a95d7e96f3587da",
    license: "MIT OR Apache-2.0",
    buildScript: false,
  },
  {
    package: "fpmath",
    version: "0.1.1",
    archive: "fpmath-0.1.1.crate",
    bytes: 59_159,
    sha256: "f617488244e3bd5aa86da93efaf4072579a301832ca5a9c7e3493563b509a43d",
    license: "MIT OR Apache-2.0",
    buildScript: false,
  },
  {
    package: "rustc_apfloat",
    version: "0.2.3+llvm-462a31f5a5ab",
    archive: "rustc_apfloat-0.2.3+llvm-462a31f5a5ab.crate",
    bytes: 86_154,
    sha256: "486c2179b4796f65bfe2ee33679acf0927ac83ecf583ad6c91c3b4570911b9ad",
    license: "Apache-2.0 WITH LLVM-exception",
    buildScript: true,
  },
  {
    package: "smallvec",
    version: "1.15.2",
    archive: "smallvec-1.15.2.crate",
    bytes: 34_899,
    sha256: "8ed6a63f02c8539c91a8685a86f4099661ba3da017932f6ebbea6de3f0fa7c90",
    license: "MIT OR Apache-2.0",
    buildScript: false,
  },
];

// This is the exact source-member projection selected for the oracle's
// fixed-precision call paths. The complete crate archives are pinned above;
// these member pins make the reviewed path through SoftF64 and APFloat
// independently visible without claiming a formal whole-program/cfg proof.
const dependencySourceProjection = [
  [
    "bitflags",
    "src/lib.rs",
    35_195,
    "41e4e87cc47b9e54bdea72a8692f3923c8ec03caa942c6327e7e9fce8c660c7f",
  ],
  [
    "bitflags",
    "src/public.rs",
    21_007,
    "0af218c84f4597e803f69c62c89d51e834c6880369266d7af12855226af2655f",
  ],
  [
    "bitflags",
    "src/internal.rs",
    4_779,
    "645b13af0c7302258df61239073a4b8203d09f27b6c17f8a6f1f8c3e427f5334",
  ],
  [
    "bitflags",
    "src/traits.rs",
    12_951,
    "154244d22577c4825ab573e9b251084555d6b4f45d7660d6967559c0dc6798e2",
  ],
  [
    "fpmath",
    "src/lib.rs",
    29_532,
    "a5e4deee25937410c5db1b59d670a8879a53be7eb741cb4ac0b818bb41b09735",
  ],
  [
    "fpmath",
    "src/soft_f64.rs",
    11_362,
    "30da222738b4d068b23f6bad90248a59a094b79c13fca45f2a20e02f00a13a76",
  ],
  [
    "fpmath",
    "src/traits.rs",
    6_507,
    "f369128f888834aef1995367702827829c99dbba71b4c4ba30709d94b2bb153d",
  ],
  [
    "fpmath",
    "src/int.rs",
    1_244,
    "6bf81855c3e8b10788d25e03a810d289aaca56c0672a0d7675417a5ddae133b1",
  ],
  [
    "fpmath",
    "src/double.rs",
    14_345,
    "250178221b9bc9be81e075ef121555ac9cb85bb89eecf0178c35a1dcbf6292b6",
  ],
  [
    "fpmath",
    "src/f64/mod.rs",
    1_071,
    "a34c84f152754c3d56e5b43bb67ec4e1d1994d51fe921ddb0b39ebebf4c66e5e",
  ],
  [
    "fpmath",
    "src/f64/asin_acos.rs",
    2_146,
    "d376835b7196a229ebf1b1ee034d91409fc30961e70d81986d53dd1c06d05d96",
  ],
  [
    "fpmath",
    "src/f64/atan.rs",
    3_153,
    "61cc6977df833f1e794bcc7489833de67deba21ffdd1cefc0af61036fb4e8147",
  ],
  [
    "fpmath",
    "src/f64/reduce_pi_2.rs",
    2_734,
    "2aa331a20d99a547a2eaa9f10d67bb5dbb180c323b8b69ccf116ee65961cf352",
  ],
  [
    "fpmath",
    "src/f64/sin_cos.rs",
    2_901,
    "19ec6d4a61d5629f87d6e50761e8d00802dacee8b74126f81c82766c76794483",
  ],
  [
    "fpmath",
    "src/generic/mod.rs",
    3_380,
    "dc9a6936949cf6bd78a35d6d1be076742e8c045c493b0d36ecb281e301f95aca",
  ],
  [
    "fpmath",
    "src/generic/asin_acos.rs",
    5_147,
    "6fbc1f04e6b2e78689589f01b7d96cf5df757280474a45362cf007daa80e9e6a",
  ],
  [
    "fpmath",
    "src/generic/atan.rs",
    7_572,
    "ce5d10e6162a0db326ca8dde73158c11dbdbcb32f56a703c979874f019966863",
  ],
  [
    "fpmath",
    "src/generic/reduce_pi_2.rs",
    3_956,
    "722be389ab710f9acc59af227e1ef5d6d247be94616e09100500ef1b1e6d695a",
  ],
  [
    "fpmath",
    "src/generic/reduce_pi_2_large.rs",
    6_769,
    "16b70b51f32978ec235e383a099edb78bcbc4af63b9f4cf7ea22bd9044794944",
  ],
  [
    "fpmath",
    "src/generic/scalbn.rs",
    6_103,
    "9aa078049dce05271213efac7cdafc29d1a95a85580c0dfee6a31290bb592f59",
  ],
  [
    "fpmath",
    "src/generic/sin_cos.rs",
    6_464,
    "232424e5434a9861389c460d4845d3a59de23c05fcbd9747cd9d8515d6fd3e5e",
  ],
  [
    "fpmath",
    "src/generic/sqrt.rs",
    4_483,
    "18afd36432b20e6e6fe69cf3c8d7589f2d9e85d8b6346693ba9256466678d118",
  ],
  [
    "rustc_apfloat",
    "src/lib.rs",
    25_858,
    "8ba58c2b08daf59b74686f55f0fad0615cb6019ad1605cf809f50291d82d4101",
  ],
  [
    "rustc_apfloat",
    "src/ieee.rs",
    129_142,
    "768bc8deabfa7be03826593fcab8a4e56deb96d20ffaa1ca0fc1f6a974846ef3",
  ],
];

// These exact members are deliberately outside the selected runtime semantic
// projection. They are pinned here to make the type/region boundary explicit,
// not to imply that the omitted dependency source has been semantically audited.
const excludedDependencySourceBoundary = [
  [
    "fpmath",
    "src/host_f64.rs",
    7_004,
    "78656b31c46b60fc840bbb5b3eaefaad82a46321094a6352e57365fa5073355a",
  ],
  [
    "smallvec",
    "src/lib.rs",
    84_885,
    "a779bc485235ccb746b680be71d57b707865341209a585b53e63a91c4bda6cae",
  ],
];

const expectedOracleFiles = [
  "Cargo.toml",
  "fixtures/evaluation-deterministic-math-v1-vectors.json",
  "src/binary64.rs",
  "src/lib.rs",
  "src/tests.rs",
  "src/transcendental.rs",
  "tests/no_allocation.rs",
  "tests/wasm_compile.rs",
].sort();

const pinnedOracleFiles = [
  ["Cargo.toml", 522, "53ee392000cd8d815ea56f39454d7900dbe348066d250a5ee35d465ebe5e1707"],
  [
    "fixtures/evaluation-deterministic-math-v1-vectors.json",
    79_921,
    "0a467b96d93ea0b7b8d12f8b8229d050b50945c40fff29c8ace0469b76cdec00",
  ],
  [
    "src/binary64.rs",
    5_368,
    "63abecda2a7a29efa2b3ddd3c6b325360de9c1a93195911c194301c124ca5739",
  ],
  [
    "src/lib.rs",
    3_127,
    "960ae032d5981e13f1bc43acec34e5a23f7f5f4b7e5f0b10f6d9b4cae0941f5c",
  ],
  [
    "src/tests.rs",
    17_256,
    "40cdc388d494759a0998aa704000dccbc6b6f614285d8aa447f5bd61e2823e14",
  ],
  [
    "src/transcendental.rs",
    1_329,
    "1e637341e566b516dec855572ca3585bf4afc0b9ac58ec1384aa4cf615d2d52d",
  ],
  [
    "tests/no_allocation.rs",
    5_041,
    "0d121ed3aaf7c36a1b619d9aee961f5f5f0c93ad0de562766ace344fe9e19b47",
  ],
  [
    "tests/wasm_compile.rs",
    3_076,
    "d95da086ca4069a635a0d5a0865f3af6587f6c19bc2d0982f4b7ae95f582d401",
  ],
];

const expectedVectorKeys = [
  "schemaVersion",
  "artifact",
  "machineReadableScope",
  "rawBinary64",
  "sourcePins",
  "dependencyPolicy",
  "futureOracleBoundary",
  "constants",
  "statusPolicy",
  "kernelPolicy",
  "operationOrder",
  "boneOverrideLifecycle",
  "ikPolicy",
  "skinningAndCullingPolicy",
  "inputMutationLifecycle",
  "checkpointIdentity",
  "ownerIndexDomains",
  "checkpointTemplates",
  "curatedKernelVectors",
  "curatedKernelExecution",
  "preAdoptionProbeEvidence",
  "comparisonVectors",
  "wrapperUtilityVectors",
  "privateCallableCoverage",
  "compoundScenarioVectors",
  "futureObligations",
  "category9ReservationInventory",
  "nonClaims",
  "gateClassification",
  "openItems",
  "artifactValidation",
  "counts",
];

const expectedVectorCounts = {
  sourcePins: 4,
  constants: 18,
  checkpointTemplates: 160,
  curatedKernelVectors: 85,
  curatedKernelVectorsExecuted: 0,
  comparisonVectors: 12,
  wrapperUtilityVectors: 11,
  compoundScenarioVectors: 82,
  futureObligations: 16,
  category9ReservationItems: 11,
  nonClaims: 17,
  openItems: 7,
};

const expectedWrapperCallables = [
  "abs",
  "acos",
  "add",
  "atan2",
  "c_fmod",
  "classify",
  "cos",
  "div",
  "eq",
  "from_bits",
  "ge",
  "gt",
  "is_finite",
  "le",
  "lt",
  "mul",
  "neg",
  "sin",
  "sqrt",
  "sub",
  "to_bits",
].sort();

const expectedUnitTests = [
  "all_eighteen_frozen_constants_round_trip_as_raw_bits",
  "all_eighty_five_curated_kernel_vectors_are_bit_exact",
  "all_eleven_wrapper_utility_vectors_are_exact",
  "all_twelve_comparison_vectors_are_exact",
  "approved_fixture_is_exact_utf8_without_bom",
  "every_nan_boundary_is_positive_canonical_quiet_nan",
  "manifest_and_production_sources_keep_the_consumer_zero_boundary",
  "signed_zero_and_subnormal_semantics_are_preserved",
].sort();

try {
  assertSourceInventory();
  const vectors = assertApprovedReviewUnit();
  const metadata = readCargoMetadata();
  assertCargoBoundary(metadata);
  assertDependencyClosure(metadata, vectors);
  assertPinnedArchives();
  assertDependencySourceProjection(metadata);
  assertPrivateKernelSource(vectors);
  assertTestEvidence();
  assertConsumerIsolation(metadata);
  assertGateAndDocumentationWiring();
  runRustdocGate();
  console.log(
    "[runtime-native-evaluation-math] passed (consumer-zero raw-D64 oracle candidate against the adopted contract, native allocator trap, wasm32 compile-only isolation)",
  );
} catch (error) {
  console.error("[runtime-native-evaluation-math] failed:");
  console.error(`- ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

function assertSourceInventory() {
  if (!existsSync(resolve(oracleRoot))) {
    throw new Error("deterministic-math oracle crate directory is missing");
  }
  const actualFiles = walkFiles(resolve(oracleRoot))
    .map((filePath) => toRelativeFrom(oracleRoot, filePath))
    .sort();
  assertExactJson(actualFiles, expectedOracleFiles, "oracle crate file inventory");
  assertExactJson(
    pinnedOracleFiles.map(([relativePath]) => relativePath).sort(),
    expectedOracleFiles,
    "oracle exact source pin inventory",
  );
  for (const [relativePath, expectedBytes, expectedHash] of pinnedOracleFiles) {
    const contents = readBuffer(`${oracleRoot}/${relativePath}`);
    if (contents.byteLength !== expectedBytes || sha256(contents) !== expectedHash) {
      throw new Error(`${relativePath} drifted from ${expectedBytes}/${expectedHash}`);
    }
  }
}

function assertApprovedReviewUnit() {
  const fixture = readBuffer(vectorFixturePath);
  if (
    fixture.byteLength !== approvedArtifacts[1].bytes ||
    sha256(fixture) !== approvedArtifacts[1].sha256
  ) {
    throw new Error("tracked deterministic-math fixture identity drifted");
  }
  const trackedArtifacts = runCapture("git", [
    "ls-files",
    "--",
    ...approvedArtifacts.map((artifact) => artifact.path),
  ])
    .split(/\r?\n/)
    .filter(Boolean);
  if (trackedArtifacts.length !== 0) {
    throw new Error("approved deterministic-math artifacts must remain untracked");
  }
  const presentArtifacts = approvedArtifacts.filter((artifact) =>
    existsSync(resolve(artifact.path)),
  );
  if (
    presentArtifacts.length !== 0 &&
    presentArtifacts.length !== approvedArtifacts.length
  ) {
    throw new Error("local-only approved review unit must be all present or all absent");
  }
  for (const artifact of presentArtifacts) {
    const contents = readBuffer(artifact.path);
    if (contents.byteLength !== artifact.bytes || sha256(contents) !== artifact.sha256) {
      throw new Error(`local-only approved artifact drifted: ${artifact.path}`);
    }
    if (
      contents.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])) ||
      contents.includes(0x0d) ||
      contents.at(-1) !== 0x0a
    ) {
      throw new Error(`${artifact.path} must remain BOM-free LF UTF-8 with final LF`);
    }
    const ignored = spawnSync("git", ["check-ignore", "-q", "--", artifact.path], {
      cwd: root,
      windowsHide: true,
    });
    if (ignored.status !== 0) {
      throw new Error(`${artifact.path} must remain locally excluded`);
    }
  }
  if (
    presentArtifacts.length === approvedArtifacts.length &&
    !fixture.equals(readBuffer(approvedArtifacts[1].path))
  ) {
    throw new Error("tracked fixture differs from the present approved vectors");
  }
  const vectors = JSON.parse(fixture.toString("utf8"));
  assertExactJson(Object.keys(vectors), expectedVectorKeys, "vector top-level keys");
  assertExactJson(vectors.counts, expectedVectorCounts, "vector count object");
  if (
    vectors.schemaVersion !== "vivi2d-evaluation-deterministic-math-v1-draft-1" ||
    vectors.artifact?.status !==
      "local-only-draft-external-review-required-not-frozen-not-adopted" ||
    vectors.artifact?.kernelConnected !== false ||
    vectors.artifact?.category10Authorized !== false
  ) {
    throw new Error("frozen vector historical status drifted");
  }
  for (const [key, expectedCount] of Object.entries({
    sourcePins: 4,
    constants: 18,
    checkpointTemplates: 160,
    curatedKernelVectors: 85,
    comparisonVectors: 12,
    wrapperUtilityVectors: 11,
    compoundScenarioVectors: 82,
    futureObligations: 16,
    category9ReservationInventory: 11,
    nonClaims: 17,
    openItems: 7,
  })) {
    if (!Array.isArray(vectors[key]) || vectors[key].length !== expectedCount) {
      throw new Error(`${key} count drifted from ${expectedCount}`);
    }
  }
  const ids = [];
  collectObjectIds(vectors, ids);
  if (ids.length !== 396 || new Set(ids).size !== 396) {
    throw new Error("vector recursive ID inventory is not 396 unique IDs");
  }
  const bitValues = [];
  collectRawBitStrings(vectors, bitValues);
  if (bitValues.length !== 275) {
    throw new Error(`raw binary64 value inventory drifted: ${bitValues.length}`);
  }
  const projection = Buffer.from(
    JSON.stringify({
      constants: vectors.constants,
      curatedKernelVectors: vectors.curatedKernelVectors,
      comparisonVectors: vectors.comparisonVectors,
      wrapperUtilityVectors: vectors.wrapperUtilityVectors,
    }),
    "utf8",
  );
  if (
    projection.byteLength !== 18_168 ||
    sha256(projection) !==
      "77e18a11cecad8db10541520a3896b64bda05788fc1e1f2351cafdbce687f8ff"
  ) {
    throw new Error("canonical probe projection drifted");
  }
  assertExactJson(
    [...vectors.privateCallableCoverage.required].sort(),
    expectedWrapperCallables,
    "private callable vector coverage",
  );
  assertExactJson(
    vectors.openItems.map((item) => item.id),
    [
      "open-independent-review",
      "open-curated-kernel-execution",
      "open-nonspecial-transcendental-expected-bits",
      "open-compound-node-traces",
      "open-machine-readable-operation-dag",
      "open-category9-reservation-foundation",
      "open-oracle-implementation-review",
    ],
    "historical open-item inventory",
  );
  if (
    vectors.curatedKernelExecution?.executedVectorIds?.length !== 0 ||
    vectors.curatedKernelExecution?.wasm32Executed !== false ||
    vectors.machineReadableScope?.operationGraphTemplatesPresent !== false ||
    vectors.machineReadableScope?.topologicalOperandReferencesPresent !== false
  ) {
    throw new Error("vectors must retain pre-implementation and category-10 gates");
  }
  if (presentArtifacts.length === approvedArtifacts.length) {
    const approval = readText(approvedArtifacts[2].path);
    for (const evidence of [
      "- Verdict: `APPROVE`",
      "- P0: なし",
      "- P1: なし",
      "- P2: なし",
      "- Required edits: なし",
      "private consumer-zero oracleは別implementation review後だけ追加でき",
      "single-thread native allocator trap",
      "wasm32 compile/instrumentation",
      "category 9 full evaluator reservation",
      "category 11 topology",
    ]) {
      if (!approval.includes(evidence)) {
        throw new Error(`approval record is missing ${evidence}`);
      }
    }
  }
  return vectors;
}

function assertCargoBoundary(metadata) {
  const workspaceManifest = readText(nativeManifestPath);
  for (const evidence of [
    '"crates/vivi-runtime-native-evaluation-math"',
    'rust-version = "1.89"',
    'edition = "2024"',
    'license = "Apache-2.0"',
  ]) {
    if (!workspaceManifest.includes(evidence)) {
      throw new Error(`workspace metadata omits ${evidence}`);
    }
  }
  if (/^\s*\[(?:patch|replace|source)\b/m.test(workspaceManifest)) {
    throw new Error("workspace must not replace the pinned registry source");
  }

  const manifest = readText(oracleManifestPath);
  for (const evidence of [
    'name = "vivi-runtime-native-evaluation-math"',
    "version.workspace = true",
    "edition.workspace = true",
    "rust-version.workspace = true",
    "license.workspace = true",
    "repository.workspace = true",
    "publish = false",
    "autobins = false",
    "autoexamples = false",
    "autobenches = false",
    'name = "vivi_runtime_native_evaluation_math"',
    'path = "src/lib.rs"',
    'crate-type = ["rlib"]',
    'fpmath = { version = "=0.1.1", default-features = false, features = ["soft-float"] }',
    'rustc_apfloat = { version = "=0.2.3", default-features = false }',
  ]) {
    if (!manifest.includes(evidence)) {
      throw new Error(`oracle manifest omits exact declaration: ${evidence}`);
    }
  }
  if (
    /^\s*(?:build|workspace)\s*=/m.test(manifest) ||
    /^\s*\[(?:dev-dependencies|build-dependencies|features|workspace)\]/m.test(
      manifest,
    ) ||
    /\bserde\b/i.test(manifest)
  ) {
    throw new Error("oracle manifest added a forbidden target/dependency surface");
  }

  const pkg = requirePackage(metadata, "vivi-runtime-native-evaluation-math");
  if (
    pkg.version !== "0.1.0" ||
    pkg.edition !== "2024" ||
    pkg.rust_version !== "1.89" ||
    pkg.license !== "Apache-2.0" ||
    pkg.repository !== "https://github.com/syobon211/vivi2d" ||
    JSON.stringify(pkg.publish) !== "[]" ||
    path.resolve(pkg.manifest_path) !== resolve(oracleManifestPath) ||
    Object.keys(pkg.features).length !== 0
  ) {
    throw new Error("oracle package identity or no-feature policy drifted");
  }
  const productionTargets = pkg.targets.filter((target) =>
    target.kind.some((kind) => !["test", "bench", "example"].includes(kind)),
  );
  if (
    productionTargets.length !== 1 ||
    productionTargets[0].name !== "vivi_runtime_native_evaluation_math" ||
    JSON.stringify(productionTargets[0].kind) !== JSON.stringify(["rlib"]) ||
    JSON.stringify(productionTargets[0].crate_types) !== JSON.stringify(["rlib"]) ||
    path.resolve(productionTargets[0].src_path) !== resolve(`${oracleRoot}/src/lib.rs`)
  ) {
    throw new Error("oracle must retain exactly one rlib production target");
  }
  assertExactJson(
    pkg.targets
      .filter((target) => target.kind.includes("test"))
      .map((target) => target.name)
      .sort(),
    ["no_allocation", "wasm_compile"],
    "test-only target inventory",
  );
  const directDependencies = pkg.dependencies
    .map((dependency) => ({
      name: dependency.name,
      req: dependency.req,
      kind: dependency.kind,
      optional: dependency.optional,
      usesDefaultFeatures: dependency.uses_default_features,
      features: [...dependency.features].sort(),
      source: dependency.source,
    }))
    .sort(compareDirectDependencies);
  assertExactJson(
    directDependencies,
    [
      directRegistryDependency("fpmath", "=0.1.1", ["soft-float"]),
      directRegistryDependency("rustc_apfloat", "=0.2.3", []),
    ],
    "oracle exact direct dependency inventory",
  );
}

function assertDependencyClosure(metadata, vectors) {
  const oracle = requirePackage(metadata, "vivi-runtime-native-evaluation-math");
  const packages = new Map(metadata.packages.map((pkg) => [pkg.id, pkg]));
  const lockPackages = readCargoLockPackages();
  const closure = dependencyClosure(metadata, oracle.id, new Set([null, "build"]));
  const inventory = [...closure]
    .map((id) => {
      const pkg = packages.get(id);
      if (!pkg?.source) {
        throw new Error(`production closure contains non-registry package ${id}`);
      }
      return {
        name: pkg.name,
        version: pkg.version,
        source: pkg.source,
        license: pkg.license,
        checksum: lockPackages.get(`${pkg.name}@${pkg.version}`)?.checksum ?? null,
        buildScript: pkg.targets.some((target) => target.kind.includes("custom-build")),
      };
    })
    .sort(compareDependencies);
  assertExactJson(
    inventory,
    sourcePins.map((pin) => ({
      name: pin.package,
      version: pin.version,
      source: "registry+https://github.com/rust-lang/crates.io-index",
      license: pin.license,
      checksum: pin.sha256,
      buildScript: pin.buildScript,
    })),
    "complete oracle production/build closure",
  );
  const devClosure = dependencyClosure(metadata, oracle.id, new Set(["dev"]));
  if (devClosure.size !== 0) {
    throw new Error("oracle added a dev dependency closure");
  }

  const expectedPins = sourcePins
    .map((pin) => ({
      package: pin.package,
      version: pin.version,
      archiveBytes: pin.bytes,
      archiveSha256: pin.sha256,
      license: pin.license,
      buildScript: pin.buildScript,
    }))
    .sort((left, right) => left.package.localeCompare(right.package));
  const actualPins = vectors.sourcePins
    .map((pin) => ({
      package: pin.package,
      version: pin.version,
      archiveBytes: pin.archiveBytes,
      archiveSha256: pin.archiveSha256,
      license: pin.license,
      buildScript: pin.buildScript,
    }))
    .sort((left, right) => left.package.localeCompare(right.package));
  assertExactJson(actualPins, expectedPins, "vector/lock source pin agreement");

  const featureTree = runCapture("cargo", [
    "+1.89.0",
    "tree",
    "--locked",
    "--manifest-path",
    resolve(nativeManifestPath),
    "-p",
    "vivi-runtime-native-evaluation-math",
    "-e",
    "features",
    "--prefix",
    "none",
  ]).replace(
    /^vivi-runtime-native-evaluation-math v0\.1\.0 \([^\r\n]+\)/m,
    "vivi-runtime-native-evaluation-math v0.1.0 (<workspace>)",
  );
  const expectedFeatureTree = [
    "vivi-runtime-native-evaluation-math v0.1.0 (<workspace>)",
    "rustc_apfloat v0.2.3+llvm-462a31f5a5ab",
    'bitflags feature "default"',
    "bitflags v2.13.1",
    'smallvec feature "const_generics"',
    "smallvec v1.15.2",
    'smallvec feature "default"',
    "smallvec v1.15.2",
    'smallvec feature "union"',
    "smallvec v1.15.2",
    'fpmath feature "soft-float"',
    "fpmath v0.1.1",
    'rustc_apfloat feature "default"',
    "rustc_apfloat v0.2.3+llvm-462a31f5a5ab (*)",
    "",
  ].join("\n");
  if (normalizeNewlines(featureTree) !== expectedFeatureTree) {
    throw new Error(`cargo tree -e features drifted\n${featureTree}`);
  }
  assertLockStanzas();

  const apfloat = requirePackage(metadata, "rustc_apfloat");
  const buildTarget = apfloat.targets.find((target) =>
    target.kind.includes("custom-build"),
  );
  if (!buildTarget) throw new Error("rustc_apfloat build script disappeared");
  const buildScript = readFileSync(buildTarget.src_path);
  if (
    buildScript.byteLength !== 2_058 ||
    sha256(buildScript) !==
      "c6f165c151091168e13af707ead36e3bd22f33e5849e3f4d55ea32dc4a94a73c"
  ) {
    throw new Error("rustc_apfloat build.rs identity drifted");
  }
  const buildText = buildScript.toString("utf8");
  for (const evidence of [
    'include_str!("src/lib.rs")',
    "EXPECTED_SRC_LIB_RS_PREFIX",
    'std::env::var("CARGO_PKG_VERSION")',
    'format!("+llvm-{}", &llvm_commit_hash[..12])',
  ]) {
    if (!buildText.includes(evidence)) {
      throw new Error(`rustc_apfloat build-script scope omits ${evidence}`);
    }
  }
  const buildCode = stripRustNonCode(buildText);
  if (/Command::|TcpStream|UdpSocket|std::fs::|File::/m.test(buildCode)) {
    throw new Error("pinned rustc_apfloat build script gained I/O or network code");
  }
}

function assertPinnedArchives() {
  for (const pin of sourcePins) {
    const candidates = findCargoArchiveCandidates(pin.archive);
    if (candidates.length === 0) {
      throw new Error(`Cargo cache is missing pinned archive ${pin.archive}`);
    }
    for (const archivePath of candidates) {
      const contents = readFileSync(archivePath);
      if (contents.byteLength !== pin.bytes || sha256(contents) !== pin.sha256) {
        throw new Error(`${archivePath} does not match the pinned archive identity`);
      }
    }
  }
}

function assertDependencySourceProjection(metadata) {
  const packageRoots = new Map(
    ["bitflags", "fpmath", "rustc_apfloat", "smallvec"].map((packageName) => {
      const pkg = requirePackage(metadata, packageName);
      const packageRoot = path.dirname(pkg.manifest_path);
      if (!normalizeSlashes(packageRoot).includes("/registry/src/")) {
        throw new Error(`${packageName} did not resolve from Cargo registry source`);
      }
      return [packageName, packageRoot];
    }),
  );

  for (const [
    packageName,
    relativePath,
    expectedBytes,
    expectedHash,
  ] of dependencySourceProjection) {
    const contents = readFileSync(
      path.join(packageRoots.get(packageName), ...relativePath.split("/")),
    );
    if (contents.byteLength !== expectedBytes || sha256(contents) !== expectedHash) {
      throw new Error(
        `${packageName}/${relativePath} drifted from the selected dependency source projection`,
      );
    }
  }
  for (const [
    packageName,
    relativePath,
    expectedBytes,
    expectedHash,
  ] of excludedDependencySourceBoundary) {
    const contents = readFileSync(
      path.join(packageRoots.get(packageName), ...relativePath.split("/")),
    );
    if (contents.byteLength !== expectedBytes || sha256(contents) !== expectedHash) {
      throw new Error(
        `${packageName}/${relativePath} drifted from the explicit excluded-source boundary`,
      );
    }
  }

  const fpmath = (relativePath) =>
    readFileSync(
      path.join(packageRoots.get("fpmath"), ...relativePath.split("/")),
      "utf8",
    );
  const bitflags = (relativePath) =>
    readFileSync(
      path.join(packageRoots.get("bitflags"), ...relativePath.split("/")),
      "utf8",
    );
  const apfloat = (relativePath) =>
    readFileSync(
      path.join(packageRoots.get("rustc_apfloat"), ...relativePath.split("/")),
      "utf8",
    );
  const requiredAnchors = [
    [
      "bitflags/src/lib.rs",
      bitflags("src/lib.rs"),
      ["macro_rules! bitflags", "__impl_internal_bitflags!", "__impl_public_bitflags!"],
    ],
    [
      "bitflags/src/public.rs",
      bitflags("src/public.rs"),
      [
        "macro_rules! __impl_public_bitflags",
        "fn intersects(&self, other)",
        "impl $crate::__private::core::ops::BitOr",
      ],
    ],
    [
      "bitflags/src/internal.rs",
      bitflags("src/internal.rs"),
      ["macro_rules! __impl_internal_bitflags"],
    ],
    [
      "fpmath/src/lib.rs",
      fpmath("src/lib.rs"),
      [
        '#[cfg(feature = "soft-float")]\nmod soft_f64;',
        '#[cfg(feature = "soft-float")]\npub use soft_f64::SoftF64;',
        "pub fn sqrt<F: FloatMath>(x: F) -> F {\n    F::sqrt(x)",
        "pub fn sin<F: FloatMath>(x: F) -> F {\n    F::sin(x)",
        "pub fn cos<F: FloatMath>(x: F) -> F {\n    F::cos(x)",
        "pub fn acos<F: FloatMath>(x: F) -> F {\n    F::acos(x)",
        "pub fn atan2<F: FloatMath>(y: F, x: F) -> F {\n    F::atan2(y, x)",
      ],
    ],
    [
      "fpmath/src/soft_f64.rs",
      fpmath("src/soft_f64.rs"),
      [
        "pub struct SoftF64(rustc_apfloat::ieee::Double);",
        "pub fn to_bits(self) -> u64",
        "pub fn from_bits(bits: u64) -> Self",
        "impl core::ops::Add for SoftF64",
        "impl core::ops::Sub for SoftF64",
        "impl core::ops::Mul for SoftF64",
        "impl core::ops::Div for SoftF64",
        "impl crate::FloatMath for SoftF64",
        "crate::generic::sqrt(x)",
        "crate::generic::sin(x)",
        "crate::generic::cos(x)",
        "crate::generic::acos(x)",
        "crate::generic::atan2(y, x)",
      ],
    ],
    [
      "fpmath/src/traits.rs",
      fpmath("src/traits.rs"),
      ["pub(crate) trait Float:", "type Raw:", "fn to_raw(self) -> Self::Raw"],
    ],
    [
      "fpmath/src/double.rs",
      fpmath("src/double.rs"),
      [
        "pub(crate) struct DenormDouble<F: Float>",
        "pub(crate) struct NormDouble<F: Float>",
        "pub(crate) struct SemiDouble<F: Float>",
      ],
    ],
    [
      "fpmath/src/generic/mod.rs",
      fpmath("src/generic/mod.rs"),
      [
        "pub(crate) use asin_acos::{acos, asin, AsinAcos};",
        "pub(crate) use atan::{atan, atan2, Atan};",
        "pub(crate) use reduce_pi_2::{reduce_pi_2, ReducePi2};",
        "pub(crate) use sin_cos::{cos, sin, sin_cos, SinCos};",
        "pub(crate) use sqrt::sqrt;",
      ],
    ],
    [
      "fpmath/src/generic/sin_cos.rs",
      fpmath("src/generic/sin_cos.rs"),
      [
        "pub(crate) fn sin<F: SinCos + ReducePi2>(x: F) -> F",
        "pub(crate) fn cos<F: SinCos + ReducePi2>(x: F) -> F",
        "let (n, y_hi, y_lo) = reduce_pi_2(x);",
      ],
    ],
    [
      "fpmath/src/generic/atan.rs",
      fpmath("src/generic/atan.rs"),
      [
        "pub(crate) fn atan2<F: Atan>(y: F, x: F) -> F",
        "pub(super) fn atan2_inner<F: Atan>",
        "pub(super) fn atan_inner_common<F: Atan>",
      ],
    ],
    [
      "fpmath/src/generic/asin_acos.rs",
      fpmath("src/generic/asin_acos.rs"),
      [
        "pub(super) fn acos_inner<F: AsinAcos>(x: F)",
        "pub(crate) fn acos<F: AsinAcos>(x: F) -> F",
        "two_hi_lo_sqrt_inner(y2)",
      ],
    ],
    [
      "fpmath/src/generic/sqrt.rs",
      fpmath("src/generic/sqrt.rs"),
      [
        "pub(crate) fn sqrt<F: Float>(x: F) -> F",
        "fn sqrt_inner<F: Float>",
        "fn sqrt_split<F: Float>",
        "pub(super) fn two_hi_lo_sqrt_inner<F: Float>",
      ],
    ],
    [
      "fpmath/src/generic/reduce_pi_2.rs",
      fpmath("src/generic/reduce_pi_2.rs"),
      [
        "pub(crate) fn reduce_pi_2<F: ReducePi2>(x: F) -> (u8, F, F)",
        "reduce_pi_2_large(x_chunks.as_ref(), e0, jk, &mut qp)",
      ],
    ],
    [
      "fpmath/src/generic/reduce_pi_2_large.rs",
      fpmath("src/generic/reduce_pi_2_large.rs"),
      [
        "pub(crate) fn reduce_pi_2_large(",
        "qp: &mut [u64; 20]",
        "let mut q: [u64; 20] = [0; 20];",
        "let mut iq: [u32; 20] = [0; 20];",
      ],
    ],
    [
      "fpmath/src/f64/reduce_pi_2.rs",
      fpmath("src/f64/reduce_pi_2.rs"),
      [
        "fn reduce_pi_2_prepare(x: Self) -> ([u32; 3], i16, usize)",
        "fn reduce_pi_2_compress(qp: &[u64; 20]",
        "y0 = scalbn_medium(y0, scale);",
        "y1 = scalbn_medium(y1, scale);",
      ],
    ],
    [
      "fpmath/src/generic/scalbn.rs",
      fpmath("src/generic/scalbn.rs"),
      ["pub(crate) fn scalbn_medium<F: Float>(x: F, y: i32) -> F"],
    ],
    [
      "rustc_apfloat/src/lib.rs",
      apfloat("src/lib.rs"),
      [
        "#![no_std]",
        "#![forbid(unsafe_code)]",
        "pub struct StatusAnd<T>",
        "bitflags! {",
        "fn add_r(self, rhs: Self, round: Round) -> StatusAnd<Self>;",
        "fn sub_r(self, rhs: Self, round: Round) -> StatusAnd<Self>",
        "fn mul_r(self, rhs: Self, round: Round) -> StatusAnd<Self>;",
        "fn div_r(self, rhs: Self, round: Round) -> StatusAnd<Self>;",
        "fn c_fmod(self, rhs: Self) -> StatusAnd<Self>;",
        "fn mul_add_r(self, multiplicand: Self, addend: Self, round: Round)",
        "fn ieee_rem(self, rhs: Self) -> StatusAnd<Self>;",
        "fn from_str_r(s: &str, round: Round)",
        "fn from_bits(input: u128) -> Self;",
        "fn to_bits(self) -> u128;",
        "macro_rules! float_common_impls",
        "self.add_r(rhs, Round::NearestTiesToEven)",
        "self.sub_r(rhs, Round::NearestTiesToEven)",
        "self.mul_r(rhs, Round::NearestTiesToEven)",
        "self.div_r(rhs, Round::NearestTiesToEven)",
      ],
    ],
    [
      "rustc_apfloat/src/ieee.rs",
      apfloat("src/ieee.rs"),
      [
        "pub struct IeeeFloat<S>",
        "sig: [Limb; 1]",
        "Double = DoubleS(64:11)",
        "impl<S: Semantics> PartialEq for IeeeFloat<S>",
        "impl<S: Semantics> PartialOrd for IeeeFloat<S>",
        "impl<S: Semantics> Float for IeeeFloat<S>",
        "fn add_r(mut self, rhs: Self, round: Round) -> StatusAnd<Self>",
        "fn sub_r(self, rhs: Self, round: Round) -> StatusAnd<Self>",
        "fn mul_r(mut self, rhs: Self, round: Round) -> StatusAnd<Self>",
        "fn div_r(mut self, rhs: Self, round: Round) -> StatusAnd<Self>",
        "fn c_fmod(mut self, rhs: Self) -> StatusAnd<Self>",
        "fn mul_add_r(mut self, multiplicand: Self, addend: Self, round: Round)",
        "fn ieee_rem(self, rhs: Self) -> StatusAnd<Self>",
        "impl<S: Semantics> fmt::Display for IeeeFloat<S>",
        "fn from_str_r(s: &str, mut round: Round)",
        "fn from_bits(input: u128) -> Self",
        "fn to_bits(self) -> u128",
        "fn cmp_abs_normal(self, rhs: Self) -> Ordering",
        "fn is_negative(self) -> bool",
        "fn is_denormal(self) -> bool",
        "fn category(self) -> Category",
        "fn ilogb(mut self) -> ExpInt",
        "fn scalbn_r(mut self, exp: ExpInt, round: Round) -> Self",
        "fn normalize(mut self, round: Round, mut loss: Loss) -> StatusAnd<Self>",
        "fn round_away_from_zero(&self, round: Round, loss: Loss, bit: usize) -> bool",
        "used only by algorithms that may require dynamically arbitrary precision",
        "type DynPrecisionLimbVec = smallvec::SmallVec<[Limb; 2]>;",
        "fn from_decimal_string(s: &str, round: Round)",
        "pub(super) fn is_all_zeros(limbs: &[Limb]) -> bool",
        "pub(super) fn olsb(limbs: &[Limb]) -> usize",
        "pub(super) fn omsb(limbs: &[Limb]) -> usize",
        "pub(super) fn cmp(a: &[Limb], b: &[Limb]) -> Ordering",
        "pub(super) fn get_bit(limbs: &[Limb], bit: usize) -> bool",
        "pub(super) fn set_bit(limbs: &mut [Limb], bit: usize)",
        "pub(super) fn shift_left(dst: &mut [Limb]",
        "pub(super) fn shift_right(dst: &mut [Limb]",
        "pub(super) fn increment(dst: &mut [Limb]) -> Limb",
        "pub(super) fn widening_mul(a: Limb, b: Limb) -> [Limb; 2]",
      ],
    ],
  ];
  for (const [label, source, anchors] of requiredAnchors) {
    for (const anchor of anchors) {
      if (!source.includes(anchor)) {
        throw new Error(`${label} omits selected call-projection anchor ${anchor}`);
      }
    }
  }
}

function assertPrivateKernelSource(vectors) {
  const manifest = readText(oracleManifestPath);
  const lib = readText(`${oracleRoot}/src/lib.rs`);
  const binary64 = readText(`${oracleRoot}/src/binary64.rs`);
  const transcendental = readText(`${oracleRoot}/src/transcendental.rs`);
  for (const evidence of [
    "#![no_std]",
    "#![forbid(unsafe_code)]",
    "#![deny(missing_docs)]",
    "exact 21-callable",
    "does not implement checkpoints",
    "mod binary64;",
    "mod transcendental;",
  ]) {
    if (!lib.includes(evidence)) {
      throw new Error(`oracle root omits ${evidence}`);
    }
  }
  const libCode = stripRustNonCode(lib).replace(
    /#\[cfg\(test\)\]\s*extern\s+crate\s+std\s*;/g,
    "",
  );
  if (/\bpub\s+(?!\(crate\))/.test(libCode) || /\bpub\s+use\b/.test(libCode)) {
    throw new Error("oracle root gained a product-public Rust item");
  }
  const wrapperCallables = [binary64, transcendental]
    .flatMap((source) => [
      ...source.matchAll(/pub\(crate\)\s+(?:const\s+)?fn\s+([A-Za-z0-9_]+)/g),
    ])
    .map((match) => match[1])
    .sort();
  assertExactJson(
    wrapperCallables,
    expectedWrapperCallables,
    "crate-private raw-D64 wrapper surface",
  );
  const publicTypes = [binary64]
    .flatMap((source) => [
      ...source.matchAll(/pub\(crate\)\s+(?:struct|enum)\s+([A-Za-z0-9_]+)/g),
    ])
    .map((match) => match[1])
    .sort();
  assertExactJson(publicTypes, ["DetF64", "DetF64Class"], "crate-private type surface");

  for (const operation of ["add_r", "sub_r", "mul_r", "div_r"]) {
    if (
      countMatches(binary64, new RegExp(`rustc_apfloat::Float::${operation}\\(`, "g")) !==
      1
    ) {
      throw new Error(`${operation} source-call count drifted`);
    }
  }
  if (
    countMatches(binary64, /Round::NearestTiesToEven/g) !== 4 ||
    countMatches(binary64, /rustc_apfloat::Float::c_fmod\(/g) !== 1 ||
    countMatches(binary64, /rustc_apfloat::Float::from_bits\(/g) !== 1 ||
    countMatches(binary64, /rustc_apfloat::Float::to_bits\(value\) as u64/g) !== 1
  ) {
    throw new Error("APFloat primitive/raw-bit source-call allowlist drifted");
  }
  const actualFpmathCalls = [...transcendental.matchAll(/fpmath::([A-Za-z0-9_]+)\(/g)]
    .map((match) => match[1])
    .sort();
  assertExactJson(
    actualFpmathCalls,
    ["acos", "atan2", "cos", "sin", "sqrt"],
    "SoftF64 source-call allowlist",
  );
  if (
    countMatches(transcendental, /SoftF64::from_bits\(/g) !== 6 ||
    countMatches(transcendental, /\.to_bits\(\)/g) !== 11
  ) {
    throw new Error("SoftF64 raw-bit bridge count drifted");
  }
  const production = [lib, binary64, transcendental].join("\n");
  const productionCode = stripRustNonCode(production).replace(
    /#\[cfg\(test\)\]\s*extern\s+crate\s+std\s*;/g,
    "",
  );
  for (const [label, pattern] of [
    ["host floating type", /\bf(?:32|64)\b/],
    ["host std/alloc path", /\b(?:std|alloc)::/],
    ["allocating collection", /\b(?:Vec|SmallVec|String|Box|HashMap|BTreeMap)\b/],
    [
      "forbidden math",
      /\b(?:mul_add|ieee_rem|pow|powi|SoftF32|host_f64|to_host|from_host)\b/,
    ],
    [
      "decimal conversion",
      /\b(?:decimal|from_str|to_string|FromStr|parse|format_args|format)\b/,
    ],
    ["I/O or network", /\b(?:fs|io|net)::|\b(?:File|TcpStream|UdpSocket)\b/],
    ["FFI/export", /extern\s+"C"|#\[(?:unsafe\([^\]]*\)|no_mangle|export_name)/],
    ["unsafe production code", /\bunsafe\b/],
    ["host-float cast", /\bas\s+f(?:32|64)\b/],
    ["serde", /\bserde\b/],
  ]) {
    if (pattern.test(productionCode)) {
      throw new Error(`oracle production source contains ${label}`);
    }
  }
  if (/\b(?:FastMath|fast_math|contract|reassociate)\b/.test(productionCode)) {
    throw new Error("oracle production source opts into contraction/reassociation");
  }
  if (/\b(?:build\.rs|crate-type\s*=\s*\[\s*"cdylib")\b/.test(manifest)) {
    throw new Error("oracle manifest gained a build script or production ABI");
  }
  assertExactJson(
    vectors.privateCallableCoverage.required.slice().sort(),
    wrapperCallables,
    "source/vector callable bijection",
  );
}

function assertTestEvidence() {
  const tests = readText(`${oracleRoot}/src/tests.rs`);
  const allocator = readText(`${oracleRoot}/tests/no_allocation.rs`);
  const wasm = readText(`${oracleRoot}/tests/wasm_compile.rs`);
  assertExactJson(
    [...tests.matchAll(/#\[test\]\s*fn\s+([A-Za-z0-9_]+)/g)]
      .map((match) => match[1])
      .sort(),
    expectedUnitTests,
    "oracle unit-test inventory",
  );
  for (const evidence of [
    'include_bytes!("../fixtures/evaluation-deterministic-math-v1-vectors.json")',
    'include_str!("../fixtures/evaluation-deterministic-math-v1-vectors.json")',
    "assert_eq!(constants.len(), 18)",
    "assert_eq!(cases.len(), 85)",
    "assert_eq!(cases.len(), 12)",
    "assert_eq!(cases.len(), 11)",
    approvedArtifacts[0].sha256,
    approvedArtifacts[1].sha256,
    approvedArtifacts[2].sha256,
    'library.contains("exact 21-callable")',
    'library.contains("does not implement checkpoints")',
  ]) {
    if (!tests.includes(evidence)) {
      throw new Error(`oracle unit tests omit ${evidence}`);
    }
  }

  assertExactJson(
    [...allocator.matchAll(/#\[test\]\s*fn\s+([A-Za-z0-9_]+)/g)].map((match) => match[1]),
    ["selected_raw_bit_wrapper_closure_allocates_nothing"],
    "native allocator-trap test inventory",
  );
  for (const evidence of [
    '#![cfg(not(target_family = "wasm"))]',
    '#[path = "../src/binary64.rs"]',
    '#[path = "../src/transcendental.rs"]',
    "#[global_allocator]",
    "AtomicBool",
    "AtomicUsize",
    "ObservationWindow::begin()",
    "ALLOCATIONS.load(Ordering::SeqCst), 0",
    "0x43e0_0000_0000_0000",
  ]) {
    if (!allocator.includes(evidence)) {
      throw new Error(`native allocator trap omits ${evidence}`);
    }
  }
  for (const callable of expectedWrapperCallables) {
    const marker = callable === "from_bits" ? "DetF64::from_bits(" : `${callable}(`;
    if (!allocator.includes(marker)) {
      throw new Error(`allocator trap does not reach ${callable}`);
    }
  }
  if (/checkpoint/i.test(allocator)) {
    throw new Error("allocator trap must stay limited to the exact 21-callable surface");
  }

  for (const evidence of [
    '#![cfg(target_family = "wasm")]',
    '#[path = "../src/binary64.rs"]',
    '#[path = "../src/transcendental.rs"]',
    "compile_all_selected_raw_bit_wrapper_paths",
    "0x43e0_0000_0000_0000",
  ]) {
    if (!wasm.includes(evidence)) {
      throw new Error(`wasm compile instrumentation omits ${evidence}`);
    }
  }
  for (const callable of expectedWrapperCallables) {
    const marker = callable === "from_bits" ? "DetF64::from_bits(" : `${callable}(`;
    if (!wasm.includes(marker)) {
      throw new Error(`wasm compile instrumentation does not reach ${callable}`);
    }
  }
  if (/checkpoint/i.test(wasm)) {
    throw new Error(
      "wasm compile instrumentation must stay limited to the exact 21-callable surface",
    );
  }
  if (/no_mangle|export_name|extern\s+"C"/.test(wasm)) {
    throw new Error("wasm compile instrumentation added a fixed/public ABI");
  }
}

function assertConsumerIsolation(metadata) {
  assertExactJson(
    consumersOf(metadata, "vivi-runtime-native-evaluation-math"),
    [],
    "oracle production consumer graph",
  );
  for (const packageName of [
    "vivi-runtime-native-evaluation",
    "vivi-runtime-native-preactivation",
    "vivi-runtime-native-evaluation-lowering",
    "vivi-runtime-native-core",
    "vivi-runtime-native-c-abi",
    "vivi-runtime-native-wasm",
  ]) {
    const pkg = requirePackage(metadata, packageName);
    if (
      pkg.dependencies.some(
        (dependency) => dependency.name === "vivi-runtime-native-evaluation-math",
      )
    ) {
      throw new Error(`${packageName} must remain disconnected from the oracle`);
    }
  }
  assertReferenceAllowlist();
}

function assertGateAndDocumentationWiring() {
  const runtimePackage = readJson("packages/runtime-native/package.json");
  const expectedNativeScript =
    "cargo +1.89.0 fmt --manifest-path Cargo.toml -p vivi-runtime-native-evaluation-math -- --check && cargo +1.89.0 test --locked --manifest-path Cargo.toml -p vivi-runtime-native-evaluation-math --lib && cargo +1.89.0 test --locked --manifest-path Cargo.toml -p vivi-runtime-native-evaluation-math --test no_allocation -- --test-threads=1 && cargo +1.89.0 clippy --locked --manifest-path Cargo.toml -p vivi-runtime-native-evaluation-math --all-targets -- -D warnings";
  const expectedWasmScript =
    "cargo +1.89.0 test --locked --manifest-path Cargo.toml -p vivi-runtime-native-evaluation-math --target wasm32-unknown-unknown --all-targets --no-run && cargo +1.89.0 clippy --locked --manifest-path Cargo.toml -p vivi-runtime-native-evaluation-math --target wasm32-unknown-unknown --all-targets -- -D warnings";
  if (
    runtimePackage.scripts?.["check:evaluation-math"] !== expectedNativeScript ||
    runtimePackage.scripts?.["check:evaluation-math:wasm32"] !== expectedWasmScript
  ) {
    throw new Error("deterministic-math native/wasm package scripts drifted");
  }
  const rootPackage = readJson("package.json");
  const expectedRootScript =
    "node scripts/check-runtime-native-evaluation-math.mjs && npm run check:evaluation-math --workspace @vivi2d/runtime-native";
  if (
    rootPackage.scripts?.["check:runtime-native-evaluation-math"] !== expectedRootScript
  ) {
    throw new Error("root deterministic-math gate drifted");
  }
  if (
    countMatches(
      readText("scripts/run-quality-gates.mjs"),
      /"check:runtime-native-evaluation-math"/g,
    ) !== 1
  ) {
    throw new Error("quality runner must invoke the oracle gate exactly once");
  }
  const manifest = readJson("scripts/quality-gate-manifest.json");
  const gates = manifest.gates.filter(
    (gate) => gate.npmScript === "check:runtime-native-evaluation-math",
  );
  if (
    gates.length !== 1 ||
    gates[0].command !== "npm run check:runtime-native-evaluation-math" ||
    JSON.stringify(gates[0].requiredWorkflows) !==
      JSON.stringify([".github/workflows/runtime-native.yml"]) ||
    gates[0].intentionallySplit !== true ||
    gates[0].escalatable !== true
  ) {
    throw new Error("deterministic-math quality-manifest entry drifted");
  }
  for (const evidence of [
    "consumer-zero",
    "exact approved Evaluation Deterministic Math Contract v1",
    "fpmath =0.1.1",
    "rustc_apfloat 0.2.3+llvm-462a31f5a5ab",
    "bitflags 2.13.1",
    "smallvec 1.15.2",
    "single-thread native allocator trap",
    "wasm32-unknown-unknown compile/Clippy source instrumentation only",
    "exactly the 21 raw-bit callables",
    "does not implement checkpoints",
    "must never open, hash, or scan",
    "protected user-owned dirty bodies",
    "Category 9 full evaluator reservation remains open",
    "category 10 remains disconnected",
    "category 11 topology/sealing/model-ready output",
    "separate implementation review",
    "EDH-01 remain open",
  ]) {
    if (!gates[0].notes.includes(evidence)) {
      throw new Error(`oracle gate note omits ${evidence}`);
    }
  }

  const workflow = readText(".github/workflows/runtime-native.yml");
  for (const evidence of [
    '"scripts/check-runtime-native-evaluation-math.mjs"',
    "npm run check:runtime-native-evaluation-math",
    "npm run check:evaluation-math:wasm32 --workspace @vivi2d/runtime-native",
    "$" + "{{ runner.temp }}/vivi-runtime-native-evaluation-math-native",
    "$" + "{{ runner.temp }}/vivi-runtime-native-evaluation-math-wasm32",
    "scripts/check-runtime-native-evaluation-math.mjs scripts/check-runtime-native-evaluation.mjs",
  ]) {
    if (!workflow.includes(evidence)) {
      throw new Error(`runtime-native workflow omits ${evidence}`);
    }
  }
  if (/run:.*(?:wasmtime|wasmer|node).*evaluation-math.*wasm/i.test(workflow)) {
    throw new Error("workflow must not claim or perform wasm oracle execution");
  }
  if (
    !readText(".github/ISSUE_TEMPLATE/gate_failure.yml").includes(
      "- check:runtime-native-evaluation-math",
    )
  ) {
    throw new Error("gate-failure escalation template omits the oracle gate");
  }
  for (const checker of [
    "scripts/check-runtime-native-evaluation-lowering.mjs",
    "scripts/check-runtime-native-preactivation.mjs",
  ]) {
    if (
      !readText(checker).includes('"scripts/check-runtime-native-evaluation-math.mjs"')
    ) {
      throw new Error(`${checker} omits the reviewed checker-reference edge`);
    }
  }

  const documentationPaths = [
    "docs/developer/architecture/overview.md",
    "docs/developer/architecture/package-graph.md",
    "docs/developer/contributing/package-boundaries.md",
    "docs/developer/quality/public-api-status.md",
  ];
  const normalizedDocs = documentationPaths.map((documentationPath) => [
    documentationPath,
    readText(documentationPath).replace(/\s+/g, " "),
  ]);
  for (const [documentationPath, contents] of normalizedDocs) {
    for (const evidence of [
      "vivi-runtime-native-evaluation-math",
      "consumer-zero",
      "no_std",
      "fpmath",
      "rustc_apfloat",
      "wasm32-unknown-unknown",
      "compile",
      "category 9",
      "category 10",
      "category 11",
      "EDH-01",
    ]) {
      if (!contents.toLowerCase().includes(evidence.toLowerCase())) {
        throw new Error(`${documentationPath} omits oracle scope: ${evidence}`);
      }
    }
  }
  const documentation = normalizedDocs.map(([, contents]) => contents).join("\n");
  for (const evidence of [
    "no incoming Cargo edge",
    "crate-private",
    "canonicalizes NaN",
    "signed zero",
    "subnormal",
    "c_fmod",
    "SoftF64",
    "FMA/`mul_add`",
    "IEEE remainder",
    "no product-public API",
    "compile-only",
    "not raw-bit execution",
    "separate implementation review",
    "machine DAG/checkpoint bijection",
    "complete compound traces",
    "does not implement checkpoints",
    "must never open, hash, or scan",
    "protected user-owned dirty bodies",
  ]) {
    if (!documentation.toLowerCase().includes(evidence.toLowerCase())) {
      throw new Error(`oracle documentation omits ${evidence}`);
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
      resolve(nativeManifestPath),
      "--no-deps",
      "-p",
      "vivi-runtime-native-evaluation-math",
    ],
    { RUSTDOCFLAGS: "-D warnings" },
  );
}

function assertLockStanzas() {
  const blocks = parseCargoLockBlocks();
  const expected = [
    {
      name: "bitflags",
      version: "2.13.1",
      source: "registry+https://github.com/rust-lang/crates.io-index",
      checksum: sourcePins[0].sha256,
      dependencies: [],
    },
    {
      name: "fpmath",
      version: "0.1.1",
      source: "registry+https://github.com/rust-lang/crates.io-index",
      checksum: sourcePins[1].sha256,
      dependencies: ["rustc_apfloat"],
    },
    {
      name: "rustc_apfloat",
      version: "0.2.3+llvm-462a31f5a5ab",
      source: "registry+https://github.com/rust-lang/crates.io-index",
      checksum: sourcePins[2].sha256,
      dependencies: ["bitflags", "smallvec"],
    },
    {
      name: "smallvec",
      version: "1.15.2",
      source: "registry+https://github.com/rust-lang/crates.io-index",
      checksum: sourcePins[3].sha256,
      dependencies: [],
    },
    {
      name: "vivi-runtime-native-evaluation-math",
      version: "0.1.0",
      source: null,
      checksum: null,
      dependencies: ["fpmath", "rustc_apfloat"],
    },
  ];
  for (const pin of expected) {
    const matches = blocks.filter((block) => block.name === pin.name);
    if (matches.length !== 1) {
      throw new Error(`Cargo.lock must contain exactly one ${pin.name} stanza`);
    }
    assertExactJson(matches[0], pin, `${pin.name} Cargo.lock stanza`);
  }
}

function dependencyClosure(metadata, rootPackageId, rootKinds) {
  const nodes = new Map(metadata.resolve.nodes.map((node) => [node.id, node]));
  const closure = new Set();
  const visit = (packageId) => {
    if (closure.has(packageId)) return;
    closure.add(packageId);
    for (const dependency of nodes.get(packageId)?.deps ?? []) {
      if (
        dependency.dep_kinds.some((kind) => kind.kind === null || kind.kind === "build")
      ) {
        visit(dependency.pkg);
      }
    }
  };
  for (const dependency of nodes.get(rootPackageId)?.deps ?? []) {
    if (dependency.dep_kinds.some((kind) => rootKinds.has(kind.kind))) {
      visit(dependency.pkg);
    }
  }
  return closure;
}

function consumersOf(metadata, dependencyName) {
  return metadata.packages
    .filter((pkg) =>
      pkg.dependencies.some((dependency) => dependency.name === dependencyName),
    )
    .map((pkg) => pkg.name)
    .sort();
}

function assertReferenceAllowlist() {
  assertExactJson(
    [...protectedBodyPaths].sort(),
    [
      "src/lib/__tests__/see-through-auto-setup.test.ts",
      "src/lib/see-through-auto-setup.ts",
      "src/stores/projectIO/__tests__/seeThroughNativeImport.test.ts",
    ].sort(),
    "protected body skip set",
  );
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
    "scripts/check-runtime-native-evaluation-math.mjs",
    "scripts/check-runtime-native-preactivation.mjs",
    "scripts/quality-gate-manifest.json",
    "scripts/run-quality-gates.mjs",
  ]);
  const pattern =
    /vivi[-_]runtime[-_]native[-_]evaluation[-_]math|\bDetF64(?:Class)?\b|selected_raw_bit_wrapper_closure_allocates_nothing/;
  const files = runCapture("git", [
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
  ])
    .split(/\r?\n/)
    .filter(Boolean);
  for (const relativePath of files) {
    // The integration review may observe these exact paths in Git inventory,
    // but must never open, hash, or scan their user-owned dirty bodies.
    if (protectedBodyPaths.has(relativePath)) continue;
    if (allowed.has(relativePath) || relativePath.startsWith(`${oracleRoot}/`)) {
      continue;
    }
    const filePath = resolve(relativePath);
    if (!existsSync(filePath) || statSync(filePath).size > 8 * 1024 * 1024) continue;
    if (pattern.test(readFileSync(filePath, "utf8"))) {
      throw new Error(`${relativePath} references the oracle outside its allowlist`);
    }
  }
}

function findCargoArchiveCandidates(filename) {
  const cargoHomes = new Set([
    process.env.CARGO_HOME
      ? path.resolve(process.env.CARGO_HOME)
      : path.join(homedir(), ".cargo"),
    path.join(homedir(), ".cargo"),
  ]);
  const results = [];
  for (const cargoHome of cargoHomes) {
    const cacheRoot = path.join(cargoHome, "registry", "cache");
    if (!existsSync(cacheRoot)) continue;
    for (const entry of readdirSync(cacheRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const candidate = path.join(cacheRoot, entry.name, filename);
      if (existsSync(candidate)) results.push(candidate);
    }
  }
  return [...new Set(results.map((candidate) => path.resolve(candidate)))].sort();
}

function parseCargoLockBlocks() {
  return readText(nativeLockPath)
    .split(/^\[\[package\]\]\s*$/m)
    .slice(1)
    .map((block) => ({
      name: /^name = "([^"]+)"$/m.exec(block)?.[1] ?? null,
      version: /^version = "([^"]+)"$/m.exec(block)?.[1] ?? null,
      source: /^source = "([^"]+)"$/m.exec(block)?.[1] ?? null,
      checksum: /^checksum = "([^"]+)"$/m.exec(block)?.[1] ?? null,
      dependencies: parseLockDependencies(block),
    }));
}

function parseLockDependencies(block) {
  const body = /^dependencies = \[([\s\S]*?)^\]$/m.exec(block)?.[1];
  if (!body) return [];
  return [...body.matchAll(/^\s*"([^"]+)",?$/gm)].map((match) => match[1]).sort();
}

function readCargoLockPackages() {
  const packages = new Map();
  for (const block of parseCargoLockBlocks()) {
    if (block.name && block.version) {
      packages.set(`${block.name}@${block.version}`, {
        checksum: block.checksum,
      });
    }
  }
  return packages;
}

function readCargoMetadata() {
  return JSON.parse(
    runCapture("cargo", [
      "+1.89.0",
      "metadata",
      "--locked",
      "--format-version=1",
      "--manifest-path",
      resolve(nativeManifestPath),
      "--no-default-features",
    ]),
  );
}

function requirePackage(metadata, packageName) {
  const pkg = metadata.packages.find((candidate) => candidate.name === packageName);
  if (!pkg) throw new Error(`cargo metadata omitted ${packageName}`);
  return pkg;
}

function directRegistryDependency(name, req, features) {
  return {
    name,
    req,
    kind: null,
    optional: false,
    usesDefaultFeatures: false,
    features,
    source: "registry+https://github.com/rust-lang/crates.io-index",
  };
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

function collectRawBitStrings(value, values) {
  if (Array.isArray(value)) {
    for (const item of value) collectRawBitStrings(item, values);
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) collectRawBitStrings(child, values);
    return;
  }
  if (typeof value === "string" && /^[0-9a-f]{16}$/.test(value)) values.push(value);
}

function stripRustNonCode(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/.*$/gm, " ")
    .replace(/r(#+)?"[\s\S]*?"\1/g, '""')
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])'/g, "''");
}

function walkFiles(directory) {
  if (!existsSync(directory)) return [];
  const result = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "target") result.push(...walkFiles(entryPath));
    } else if (entry.isFile()) {
      result.push(entryPath);
    }
  }
  return result;
}

function countMatches(value, pattern) {
  return value.match(pattern)?.length ?? 0;
}

function compareDependencies(left, right) {
  return left.name.localeCompare(right.name) || left.version.localeCompare(right.version);
}

function compareDirectDependencies(left, right) {
  return (
    left.name.localeCompare(right.name) ||
    String(left.kind).localeCompare(String(right.kind))
  );
}

function normalizeNewlines(value) {
  return value.replace(/\r\n/g, "\n");
}

function normalizeSlashes(value) {
  return value.split(path.sep).join("/");
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function readText(relativePath) {
  return readFileSync(resolve(relativePath), "utf8");
}

function readBuffer(relativePath) {
  return readFileSync(resolve(relativePath));
}

function resolve(relativePath) {
  return path.resolve(root, relativePath);
}

function toRelativeFrom(relativeRoot, filePath) {
  return path.relative(resolve(relativeRoot), filePath).split(path.sep).join("/");
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

function runCapture(command, args, extraEnv = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
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
  return result.stdout ?? "";
}
