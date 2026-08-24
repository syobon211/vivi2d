import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const nativeManifestPath = "packages/runtime-native/Cargo.toml";
const preactivationRoot =
  "packages/runtime-native/crates/vivi-runtime-native-preactivation";
const preactivationManifestPath = `${preactivationRoot}/Cargo.toml`;
const loweringRoot =
  "packages/runtime-native/crates/vivi-runtime-native-evaluation-lowering";

const expectedPreactivationFiles = [
  "Cargo.toml",
  "src/coordinator.rs",
  "src/error.rs",
  "src/lib.rs",
  "src/model.rs",
  "src/tests.rs",
].sort();

const pinnedPreactivationFiles = [
  ["Cargo.toml", 612, "d203cbf4a16fd220da0e335d8e872cb02ca25649a0961b4ce22d1d283cbab543"],
  [
    "src/coordinator.rs",
    9_103,
    "dab960e170b24f39c7dbfaf14a2e9fa0a06610bcdcca0d436721b4181bd872f9",
  ],
  [
    "src/error.rs",
    4_725,
    "0eb67e4ce2d32b5f15129db7ab83872fd7c55e7059afbe4ba5910ffac46b62ad",
  ],
  [
    "src/lib.rs",
    1_946,
    "3e625af7d5c94f5f91789c3c15d44e711801bca4a73a27354812790f3ff39344",
  ],
  [
    "src/model.rs",
    7_229,
    "a4297f02adcc564b952f1a5d968c2ed70c8ca7039bce8cde36d0b9cad487901e",
  ],
  [
    "src/tests.rs",
    25_024,
    "b31a276ebc2416ed5279a563657f27aa8914819229cdc55ff4d3688c69d09268",
  ],
];

const requiredTestNames = [
  "equal_generation_limit_precedes_plan_correlation_and_is_pre_read",
  "generation_mismatch_precedes_limit_correlation_and_is_pre_read",
  "host_fixed_fields_and_asset_shape_errors_are_redacted_and_typed",
  "host_store_hard_error_never_becomes_a_partial_missing_result",
  "missing_owned_into_parts_and_wrapper_debug_are_redacted",
  "missing_postcondition_defense_rejects_generation_unknown_order_and_duplicates",
  "owned_into_parts_moves_without_clone_and_wrapper_debug_is_redacted",
  "ready_postcondition_defense_rejects_every_shape_contradiction",
  "real_sqlite_later_hard_error_wins_over_earlier_missing",
  "real_sqlite_missing_is_all_or_nothing_and_drops_partial_ready",
  "real_sqlite_ready_bundle_is_owned_correlated_and_postcondition_checked",
  "schema_count_case_order_and_dimension_correlation_fail_pre_read",
  "store_cause_mapping_is_typed_and_redacted",
  "pure_correlation_token_is_redacted_and_moves_inputs_without_clone",
  "zero_one_and_max_safe_generation_reach_the_host_unchanged",
];

const expectedPublicItemsByFile = {
  "src/coordinator.rs": [],
  "src/error.rs": ["EvaluationPreactivationError", "EvaluationPreactivationErrorKind"],
  "src/lib.rs": [],
  "src/model.rs": [
    "CorrelatedEvaluationActivationV1",
    "MissingEvaluationActivationV1",
    "PrepareEvaluationActivationV1",
    "PreparedEvaluationActivationV1",
  ],
};
const expectedPublicFunctionsByFile = {
  "src/coordinator.rs": [
    "correlate_evaluation_activation_v1",
    "prepare_evaluation_activation_v1",
  ],
  "src/error.rs": ["asset_code", "kind", "store_kind"],
  "src/lib.rs": [],
  "src/model.rs": [
    "candidate",
    "candidate",
    "into_parts",
    "into_parts",
    "into_parts",
    "missing_textures",
    "prepared_textures",
    "request_generation",
    "request_generation",
    "request_generation",
    "request_generation",
    "texture_plan",
    "texture_plan",
  ],
};
const expectedRootReexports = [
  "AssetErrorCode",
  "AssetRef",
  "CorrelatedEvaluationActivationV1",
  "Digest",
  "EvaluationPayloadError",
  "EvaluationPayloadErrorKind",
  "EvaluationPreactivationError",
  "EvaluationPreactivationErrorKind",
  "EvaluationTextureBindingV1",
  "EvaluationTexturePlanV1",
  "LocalAssetHost",
  "LocalStoreErrorKind",
  "MissingActivationTexturesV1",
  "MissingEvaluationActivationV1",
  "PrepareEvaluationActivationV1",
  "PreparedActivationTextureSetV1",
  "PreparedActivationTextureV1",
  "PreparedEvaluationActivationV1",
  "PrincipalId",
  "ReadyPng",
  "RequiredTextureBindingV1",
  "StorageKind",
  "ValidatedEvaluationPayloadV1",
  "correlate_evaluation_activation_v1",
  "parse_evaluation_payload_v1",
  "prepare_evaluation_activation_v1",
].sort();

const expectedProductionClosurePin = {
  count: 41,
  sha256: "1e0204bd667ed87c6616130b4e0bf39a0b30f0645404b919fffd71924d434141",
};
const expectedDevClosurePin = {
  count: 9,
  sha256: "7fccfb2ae60dd614ace2aa241704e6dc086eaf3b81224695cfed53845c36c3ec",
};

try {
  assertSourceInventory();
  const metadata = assertCargoBoundary();
  assertDependencyPins(metadata);
  assertConsumerGraph(metadata);
  assertPublicSurface();
  assertPreactivationContract();
  assertIsolation(metadata);
  assertGateAndDocumentationWiring();
  runRustdocGate();
  console.log(
    "[runtime-native-preactivation] passed (pre-read exact correlation, owned all-or-nothing output, native isolation)",
  );
} catch (error) {
  console.error("[runtime-native-preactivation] failed:");
  console.error(`- ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

function assertSourceInventory() {
  if (!existsSync(resolve(preactivationRoot))) {
    throw new Error("preactivation crate directory is missing");
  }
  const actualFiles = walkFiles(resolve(preactivationRoot))
    .map((filePath) => toRelativeFrom(preactivationRoot, filePath))
    .sort();
  assertExactJson(
    actualFiles,
    expectedPreactivationFiles,
    "preactivation crate file inventory",
  );

  const pinnedPaths = pinnedPreactivationFiles.map(([relativePath]) => relativePath);
  assertExactJson(
    pinnedPaths,
    expectedPreactivationFiles,
    "preactivation source pin inventory",
  );
  for (const [relativePath, expectedBytes, expectedHash] of pinnedPreactivationFiles) {
    const contents = readBuffer(`${preactivationRoot}/${relativePath}`);
    const actualHash = createHash("sha256").update(contents).digest("hex");
    if (contents.byteLength !== expectedBytes || actualHash !== expectedHash) {
      throw new Error(
        `${relativePath} drifted (expected ${expectedBytes}/${expectedHash}, got ${contents.byteLength}/${actualHash})`,
      );
    }
  }

  const actualTestNames = expectedPreactivationFiles
    .filter((relativePath) => relativePath.endsWith(".rs"))
    .flatMap((relativePath) => {
      const source = readText(`${preactivationRoot}/${relativePath}`);
      return [...source.matchAll(/#\[test\]\s*fn\s+([A-Za-z0-9_]+)/g)].map(
        (match) => match[1],
      );
    })
    .sort();
  assertExactJson(
    actualTestNames,
    [...requiredTestNames].sort(),
    "preactivation Rust test inventory",
  );
}

function assertCargoBoundary() {
  const workspaceManifest = readText(nativeManifestPath);
  if (!workspaceManifest.includes('"crates/vivi-runtime-native-preactivation"')) {
    throw new Error("runtime-native workspace omits the preactivation crate");
  }
  for (const evidence of [
    'rust-version = "1.89"',
    'edition = "2024"',
    'license = "Apache-2.0"',
  ]) {
    if (!workspaceManifest.includes(evidence)) {
      throw new Error(`runtime-native workspace metadata omits ${evidence}`);
    }
  }

  const metadata = readCargoMetadata();
  const pkg = requirePackage(metadata, "vivi-runtime-native-preactivation");
  if (
    pkg.version !== "0.1.0" ||
    pkg.edition !== "2024" ||
    pkg.rust_version !== "1.89" ||
    pkg.license !== "Apache-2.0" ||
    JSON.stringify(pkg.publish) !== "[]" ||
    JSON.stringify(pkg.features) !== "{}" ||
    path.resolve(pkg.manifest_path) !== resolve(preactivationManifestPath)
  ) {
    throw new Error(
      "preactivation identity, license, Rust version, features, or publish=false drifted",
    );
  }

  const libraryTargets = pkg.targets.filter((target) => target.kind.includes("lib"));
  if (
    libraryTargets.length !== 1 ||
    libraryTargets[0].name !== "vivi_runtime_native_preactivation" ||
    JSON.stringify(libraryTargets[0].crate_types) !== JSON.stringify(["lib"])
  ) {
    throw new Error("preactivation must expose one Rust-only rlib");
  }
  if (
    pkg.targets.some((target) =>
      target.crate_types.some((crateType) =>
        ["bin", "cdylib", "dylib", "staticlib"].includes(crateType),
      ),
    )
  ) {
    throw new Error("preactivation must not add a binary or language ABI");
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
    directDependency("vivi-asset-host-local", "*", "normal", [], "path", false),
    directDependency("vivi-runtime-native-evaluation", "*", "normal", [], "path", false),
    directDependency("base64", "^0.22", "dev", [], "registry", true),
    directDependency("serde_json", "^1.0", "dev", ["std"], "registry", false),
    directDependency("tempfile", "^3", "dev", [], "registry", true),
  ].sort(compareDirectDependencies);
  assertExactJson(
    actualDirect,
    expectedDirect,
    "preactivation direct dependency inventory",
  );

  const lockBlocks = readText("packages/runtime-native/Cargo.lock")
    .split(/^\[\[package\]\]\s*$/m)
    .slice(1);
  const preactivationLockBlocks = lockBlocks.filter((block) =>
    /^name = "vivi-runtime-native-preactivation"$/m.test(block),
  );
  if (preactivationLockBlocks.length !== 1) {
    throw new Error("Cargo.lock must contain exactly one preactivation stanza");
  }
  const lockBlock = preactivationLockBlocks[0];
  if (
    !/^version = "0\.1\.0"$/m.test(lockBlock) ||
    /^source =|^checksum =/m.test(lockBlock)
  ) {
    throw new Error("preactivation Cargo.lock identity drifted");
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
    [
      "base64",
      "serde_json",
      "tempfile",
      "vivi-asset-host-local",
      "vivi-runtime-native-evaluation",
    ].sort(),
    "preactivation Cargo.lock dependency inventory",
  );

  return metadata;
}

function assertDependencyPins(metadata) {
  const packages = new Map(metadata.packages.map((pkg) => [pkg.id, pkg]));
  const lockPackages = readCargoLockPackages();
  const preactivationPackage = requirePackage(
    metadata,
    "vivi-runtime-native-preactivation",
  );
  const productionClosure = closureFromRoot(
    metadata,
    preactivationPackage.id,
    new Set([null, "build"]),
  );
  const devClosure = closureFromRoot(metadata, preactivationPackage.id, new Set(["dev"]));
  for (const productionId of productionClosure) devClosure.delete(productionId);

  assertDependencyInventoryPin(
    dependencyInventory(productionClosure, packages, lockPackages),
    expectedProductionClosurePin,
    "preactivation production/build",
  );
  assertDependencyInventoryPin(
    dependencyInventory(devClosure, packages, lockPackages),
    expectedDevClosurePin,
    "preactivation dev-only",
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

  const pkg = requirePackage(metadata, "vivi-runtime-native-preactivation");
  const normalDependencies = pkg.dependencies
    .filter((dependency) => (dependency.kind ?? "normal") === "normal")
    .map((dependency) => dependency.name)
    .sort();
  assertExactJson(
    normalDependencies,
    ["vivi-asset-host-local", "vivi-runtime-native-evaluation"],
    "preactivation production dependency graph",
  );

  for (const packageName of [
    "vivi-runtime-native-core",
    "vivi-runtime-native-c-abi",
    "vivi-runtime-native-wasm",
    "vivi-asset-resolver",
    "vivi-asset-store-local",
  ]) {
    const boundaryPackage = requirePackage(metadata, packageName);
    if (
      boundaryPackage.dependencies.some(
        (dependency) => dependency.name === "vivi-runtime-native-preactivation",
      )
    ) {
      throw new Error(`${packageName} must remain disconnected from preactivation`);
    }
  }
}

function assertPublicSurface() {
  for (const relativePath of Object.keys(expectedPublicItemsByFile).sort()) {
    const source = readText(`${preactivationRoot}/${relativePath}`);
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
    const source = readText(`${preactivationRoot}/${relativePath}`);
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

  const libSource = readText(`${preactivationRoot}/src/lib.rs`);
  const actualReexports = collectRootReexports(libSource).sort();
  assertExactJson(
    actualReexports,
    [...expectedRootReexports].sort(),
    "preactivation root re-export inventory",
  );

  const normalizedLib = libSource.replace(/\s+/g, " ");
  if (
    !normalizedLib.includes("correlate_evaluation_activation_v1") ||
    !normalizedLib.includes("prepare_evaluation_activation_v1") ||
    !normalizedLib.includes("#![forbid(unsafe_code)]") ||
    !normalizedLib.includes("#![deny(missing_docs)]")
  ) {
    throw new Error("preactivation root export or lint contract drifted");
  }
}

function assertPreactivationContract() {
  const manifest = readText(preactivationManifestPath);
  if (/^\s*build\s*=/m.test(manifest)) {
    throw new Error("preactivation must not run a Cargo build script");
  }

  const coordinator = readText(`${preactivationRoot}/src/coordinator.rs`);
  const model = readText(`${preactivationRoot}/src/model.rs`);
  const error = readText(`${preactivationRoot}/src/error.rs`);
  const tests = readText(`${preactivationRoot}/src/tests.rs`);
  const allProductionSource = [
    readText(`${preactivationRoot}/src/lib.rs`),
    coordinator,
    model,
    error,
  ].join("\n");

  const normalizedCoordinator = coordinator.replace(/\s+/g, " ");
  for (const evidence of [
    "pub fn correlate_evaluation_activation_v1(",
    "pub fn prepare_evaluation_activation_v1(",
    "host: &LocalAssetHost",
    "request_generation: u64",
    "candidate: ValidatedEvaluationPayloadV1",
    "plan: EvaluationTexturePlanV1",
    "candidate.request_generation()",
    "CorrelatedEvaluationActivationV1",
    "correlated.into_parts()",
    "host.prepare_activation_texture_set(generation, plan)",
  ]) {
    if (!normalizedCoordinator.includes(evidence)) {
      throw new Error(`preactivation coordinator is missing contract seam: ${evidence}`);
    }
  }

  if (!allProductionSource.includes("vivi2d.evaluationTexturePlan.v1")) {
    throw new Error("preactivation correlation omits the exact plan schema identity");
  }
  const hostModel = readText(
    "packages/runtime-native/crates/vivi-asset-host-local/src/model.rs",
  );
  const hostCoordinator = readText(
    "packages/runtime-native/crates/vivi-asset-host-local/src/host.rs",
  );
  for (const evidence of ["image/png", "srgb", "straight"]) {
    if (!(hostModel + hostCoordinator).includes(evidence)) {
      throw new Error(`host-owned fixed plan preflight omits ${evidence}`);
    }
  }

  const correlationBody = /pub fn correlate_evaluation_activation_v1\([\s\S]*?\n\}/m.exec(
    coordinator,
  )?.[0];
  if (!correlationBody) {
    throw new Error("preactivation pure correlation entry point is missing");
  }
  const mismatchIndex = correlationBody.indexOf(
    "if request_generation != candidate.request_generation()",
  );
  const safeIntegerIndex = correlationBody.indexOf(
    "if request_generation > MAX_JAVASCRIPT_SAFE_INTEGER",
  );
  const correlateIndex = correlationBody.indexOf("correlate(&candidate, &plan)?");
  if (
    mismatchIndex < 0 ||
    safeIntegerIndex <= mismatchIndex ||
    correlateIndex <= safeIntegerIndex
  ) {
    throw new Error(
      "preactivation pure seam precedence must be generation mismatch, safe ceiling, then tuple correlation",
    );
  }
  const prepareWithBody = /pub\(crate\) fn prepare_with<[\s\S]*?\n\}/m.exec(
    coordinator,
  )?.[0];
  if (!prepareWithBody) throw new Error("preactivation host composition seam is missing");
  assertOrderedEvidence(
    prepareWithBody,
    [
      "correlate_evaluation_activation_v1(",
      "prepare(request_generation, &correlated.texture_plan)",
      "correlated.into_parts()",
      "match outcome",
    ],
    "preactivation pure-correlation/host composition order",
  );

  for (const evidence of [
    "pre_read",
    "generation",
    "correlation",
    "missing",
    "hard_error",
    "postcondition",
    "owned",
    "redact",
    "without_clone",
  ]) {
    if (!tests.toLowerCase().includes(evidence)) {
      throw new Error(`preactivation tests omit contract evidence: ${evidence}`);
    }
  }

  for (const structName of [
    "CorrelatedEvaluationActivationV1",
    "PreparedEvaluationActivationV1",
    "MissingEvaluationActivationV1",
    "EvaluationPreactivationError",
  ]) {
    assertPrivateStructFields(`${model}\n${error}`, structName);
  }

  assertExactEnumVariants(error, "EvaluationPreactivationErrorKind", [
    "Asset",
    "Correlation",
    "Internal",
    "InvalidTexturePlan",
    "ResourceLimitExceeded",
    "Store",
  ]);
  assertExactEnumVariants(model, "PrepareEvaluationActivationV1", ["Missing", "Ready"]);

  if (
    /\b(?:String|str|Path|PathBuf)\b/.test(
      structBody(error, "EvaluationPreactivationError"),
    ) ||
    /\.field\("(?:id|path|detail|message|payload|plan|candidate)"/i.test(error)
  ) {
    throw new Error("preactivation error retains or debugs caller-controlled detail");
  }
  for (const evidence of ["kind", "asset_code", "store_kind"]) {
    if (!error.includes(evidence)) {
      throw new Error(`preactivation redacted error omits ${evidence}`);
    }
  }

  if (/\.clone\s*\(\s*\)/.test(coordinator)) {
    throw new Error(
      "preactivation coordinator must not clone candidate/PNG/RGBA ownership",
    );
  }
  if (
    /\bVec::|\.collect\s*(?:::|\()|\.to_owned\s*\(|\.to_string\s*\(|\bformat!\s*\(|\bBox::new\s*\(|\bString::(?:new|from)\s*\(/.test(
      coordinator,
    )
  ) {
    throw new Error(
      "preactivation correlation/postcondition code must add no collection allocation",
    );
  }
  for (const evidence of ["checked_mul", "checked_add"]) {
    if (!coordinator.includes(evidence)) {
      throw new Error(`preactivation aggregate postcondition omits ${evidence}`);
    }
  }
  if (!/into_parts\s*\(\s*self\s*,?\s*\)/.test(model)) {
    throw new Error("preactivation owned outputs must expose consuming into_parts");
  }
}

function assertIsolation(metadata) {
  const productionFiles = walkFiles(resolve(`${preactivationRoot}/src`)).filter(
    (filePath) => filePath.endsWith(".rs") && !filePath.endsWith("tests.rs"),
  );
  const forbiddenPatterns = [
    [/\bunsafe\s+(?:fn|trait|impl)\b|\bunsafe\s*\{/m, "unsafe code"],
    [/\bextern\s+"C"\b|no_mangle|export_name|link_name/m, "language ABI/export"],
    [
      /\bvivi_runtime_native_core\b|\bCoreRuntimeModel\b|\bfrom_payload_with_limits\b|\bDrawCommand\b/m,
      "runtime-native core/lowering",
    ],
    [/\bas\s+f32\b|:\s*f32\b|->\s*f32\b|\bf32::/m, "f32 lowering/storage"],
    [/\b(?:wasm_bindgen|napi|neon|pyo3|jni|uniffi|cxx)\b/m, "language/WASM bridge"],
    [/\b(?:wgpu|glow|vulkano|ash)\b/m, "GPU integration"],
    [/\bvivi_model_load_evaluation\b/m, "editor-only C ABI symbol"],
    [/vivi\.cap\.|supported_capabilit/i, "capability advertisement"],
    [/\b(?:std::fs|rusqlite|SqliteConnection)\b/m, "direct filesystem/SQLite I/O"],
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
      (dependency) => dependency.name === "vivi-runtime-native-preactivation",
    )
  ) {
    throw new Error("runtime-native WASM must not depend on preactivation");
  }
}

function assertGateAndDocumentationWiring() {
  const runtimePackage = readJson("packages/runtime-native/package.json");
  const expectedNativeScript =
    "cargo test --locked --manifest-path Cargo.toml -p vivi-runtime-native-preactivation --all-targets && cargo clippy --locked --manifest-path Cargo.toml -p vivi-runtime-native-preactivation --all-targets -- -D warnings";
  if (runtimePackage.scripts?.["check:preactivation"] !== expectedNativeScript) {
    throw new Error("preactivation native test/Clippy script drifted");
  }
  if (
    Object.entries(runtimePackage.scripts ?? {}).some(
      ([name, command]) =>
        /preactivation/i.test(`${name} ${command}`) && /wasm32/i.test(command),
    )
  ) {
    throw new Error("native-only preactivation must not add a wasm32 build gate");
  }

  const rootPackage = readJson("package.json");
  const expectedRootScript =
    "node scripts/check-runtime-native-preactivation.mjs && npm run check:preactivation --workspace @vivi2d/runtime-native";
  if (
    rootPackage.scripts?.["check:runtime-native-preactivation"] !== expectedRootScript
  ) {
    throw new Error("root preactivation gate drifted");
  }
  if (
    !readText("scripts/run-quality-gates.mjs").includes(
      '"check:runtime-native-preactivation"',
    )
  ) {
    throw new Error("root quality runner omits the preactivation gate");
  }

  const gateManifest = readJson("scripts/quality-gate-manifest.json");
  const gate = gateManifest.gates?.find(
    (candidate) => candidate.npmScript === "check:runtime-native-preactivation",
  );
  if (
    gate?.command !== "npm run check:runtime-native-preactivation" ||
    JSON.stringify(gate.requiredWorkflows) !==
      JSON.stringify([".github/workflows/runtime-native.yml"]) ||
    gate.intentionallySplit !== true ||
    gate.escalatable !== true
  ) {
    throw new Error("preactivation quality-gate manifest entry drifted");
  }
  for (const evidence of [
    "native-only",
    "exact two direct production dependencies",
    "sole production consumer of both foundations",
    "exact sole production consumer, vivi-runtime-native-evaluation-lowering",
    "pure seam",
    "move-only correlated-input token",
    "reuse that same seam exactly once",
    "explicit out-of-band request_generation",
    "candidate generation",
    "same generation to the host",
    "9,007,199,254,740,991",
    "full-u64 parser contract",
    "Before any Asset/store read",
    "strict UTF-8 byte-sorted inventory",
    "case-sensitive positional id/width/height tuples",
    "Missing accumulation continues",
    "later Asset or Store hard error wins",
    "never expose partial Ready values",
    "postcondition checks",
    "owned, all-or-nothing",
    "does not clone logical PNG or RGBA buffers",
    "preactivation wrapper/error Debug output is redacted",
    "authorized accessors expose the host set and ReadyPng metadata",
    "future bridge/logging carry-forward boundary",
    "Correlation and postcondition checks add no collection allocation",
    "dependency allocations retain their own reviewed bounds",
    "not a global recoverable-OOM claim",
    "future coordinator collection allocation must use fallible reservation",
    "lock, license/checksum closure",
    "Rust 1.89",
    "rustdoc with warnings denied",
    "three-OS native workflow",
    "runtime-native core",
    "C ABI/editor",
    "runtime-native WASM",
    "f32 lowering",
    "GPU upload",
    "language/IPC bridges",
    "capability advertisement",
    "Adopted Amendment 1 A-09 remains normative",
    "Evaluation Lowering Contract v1 is adopted",
    "deterministic primitive-operation/FMA/checkpoint and transcendental-math connection prerequisite remains open",
    "EDH-01 remains open",
  ]) {
    if (!gate.notes?.includes(evidence)) {
      throw new Error(`preactivation gate note is missing ${evidence}`);
    }
  }
  for (const stale of [
    "A-09 contract amendment is resolved",
    "A-09 contract amendment remains a blocker",
    "A-09 and EDH-01 remain open",
    "The A-09 contract amendment and EDH-01 remain open",
    "only after A-09 is resolved",
    "blocked on the A-09 contract amendment",
    "The follow-on lowering contract remains open",
    "Core lowering remains blocked until a separately reviewed follow-on contract",
  ]) {
    if (gate.notes?.includes(stale)) {
      throw new Error(`preactivation gate note retains stale A-09 wording: ${stale}`);
    }
  }

  const workflow = readText(".github/workflows/runtime-native.yml");
  for (const evidence of [
    "RUSTUP_TOOLCHAIN: 1.89.0",
    "matrix:\n        os: [ubuntu-latest, windows-latest, macos-latest]",
    '"scripts/check-runtime-native-preactivation.mjs"',
    "npm run check:runtime-native-preactivation",
    "$" + "{{ runner.temp }}/vivi-runtime-native-preactivation-native",
    "scripts/check-runtime-native-preactivation.mjs scripts/check-runtime-png.mjs",
  ]) {
    if (!workflow.includes(evidence)) {
      throw new Error(
        `runtime-native workflow is missing preactivation evidence: ${evidence}`,
      );
    }
  }
  if (/preactivation[^\n]*wasm32|wasm32[^\n]*preactivation/i.test(workflow)) {
    throw new Error("native-only preactivation must remain absent from wasm32 steps");
  }
  if (/consumer-zero Evaluation Payload foundation/i.test(workflow)) {
    throw new Error(
      "workflow must not describe the consumed Evaluation crate as consumer-zero",
    );
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
      "vivi-runtime-native-preactivation",
      "native-only",
      "Adopted Amendment 1 A-09 remains normative",
      "Evaluation Lowering Contract v1",
      "deterministic",
      "EDH-01",
    ]) {
      if (!contents.includes(evidence)) {
        throw new Error(
          `${documentationPath} is missing preactivation scope: ${evidence}`,
        );
      }
    }
  }
  const documentation = normalizedDocumentation
    .map(([, contents]) => contents)
    .join("\n");
  for (const stale of [
    "A-09 contract amendment is resolved",
    "A-09 contract amendment remains a blocker",
    "A-09 and EDH-01 remain open",
    "The A-09 contract amendment and EDH-01 remain open",
    "only after A-09 is resolved",
    "blocked on the A-09 contract amendment",
    "The follow-on lowering contract remains open",
    "Core lowering remains blocked until a separately reviewed follow-on contract",
  ]) {
    if (documentation.includes(stale)) {
      throw new Error(`preactivation documentation retains stale A-09 wording: ${stale}`);
    }
  }
  for (const evidence of [
    "sole production consumer",
    "vivi-runtime-native-evaluation-lowering",
    "move-only",
    "correlated-input token",
    "exactly once",
    "validated candidate",
    "typed texture plan",
    "explicit out-of-band",
    "candidate generation",
    "same value to the host",
    "Before any Asset/store read",
    "strict UTF-8 byte-sorted inventory",
    "case-sensitive",
    "id",
    "width",
    "height",
    "Missing",
    "later Asset or Store hard error wins",
    "partial Ready",
    "postcondition",
    "owned",
    "does not clone",
    "wrapper/error",
    "authorized accessors",
    "ReadyPng",
    "future bridge/logging carry-forward",
    "add no collection allocation",
    "dependency allocations",
    "global recoverable-OOM",
    "fallible reservation",
    "generation freshness",
    "stale",
    "runtime-native core",
    "f32",
    "C ABI/editor",
    "WASM",
    "language/IPC bridge",
    "GPU",
    "atomic",
    "capability",
  ]) {
    if (!documentation.includes(evidence)) {
      throw new Error(`preactivation documentation is missing ${evidence}`);
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
      "vivi-runtime-native-preactivation",
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
  const actualHash = createHash("sha256")
    .update(Buffer.from(JSON.stringify(actual), "utf8"))
    .digest("hex");
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
  for (const block of readText("packages/runtime-native/Cargo.lock")
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
    ".github/workflows/runtime-native.yml",
    "docs/developer/architecture/overview.md",
    "docs/developer/architecture/package-graph.md",
    "docs/developer/contributing/package-boundaries.md",
    "docs/developer/quality/dco-cumulative-pr-exception-2026-08-24.md",
    "docs/developer/quality/public-api-status.md",
    "package.json",
    "packages/runtime-native/Cargo.lock",
    "packages/runtime-native/Cargo.toml",
    "packages/runtime-native/package.json",
    "scripts/check-runtime-asset-host-local.mjs",
    "scripts/check-runtime-native-evaluation.mjs",
    "scripts/check-runtime-native-evaluation-lowering.mjs",
    "scripts/check-runtime-native-evaluation-math.mjs",
    "scripts/check-runtime-native-preactivation.mjs",
    "scripts/quality-gate-manifest.json",
    "scripts/run-quality-gates.mjs",
  ]);
  const referencePattern =
    /vivi[-_]runtime[-_]native[-_]preactivation|(?:prepare|correlate)_evaluation_activation_v1|(?:Correlated|Prepare|Prepared|Missing)EvaluationActivationV1/;
  const files = runCapture("git", [
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
  ])
    .split(/\r?\n/)
    .filter(Boolean);
  for (const relativePath of files) {
    if (
      allowed.has(relativePath) ||
      relativePath.startsWith(`${preactivationRoot}/`) ||
      relativePath.startsWith(`${loweringRoot}/`)
    ) {
      continue;
    }
    const filePath = resolve(relativePath);
    if (!existsSync(filePath) || statSync(filePath).size > 8 * 1024 * 1024) continue;
    if (referencePattern.test(readFileSync(filePath, "utf8"))) {
      throw new Error(
        `${relativePath} references preactivation outside the exact allowlist`,
      );
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
