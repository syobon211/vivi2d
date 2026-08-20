import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const nativeManifestPath = "packages/runtime-native/Cargo.toml";
const hostRoot = "packages/runtime-native/crates/vivi-asset-host-local";
const hostManifestPath = `${hostRoot}/Cargo.toml`;
const hostTexturePlanSchemaRelativePath = "schema/evaluation-texture-plan-v1.schema.json";
const hostTexturePlanSchemaPath = `${hostRoot}/${hostTexturePlanSchemaRelativePath}`;
const modelTexturePlanSchemaPath =
  "packages/model/src/evaluation-payload-v1/evaluation-texture-plan-v1.schema.json";
const resolverRoot = "packages/runtime-native/crates/vivi-asset-resolver";
const storeRoot = "packages/runtime-native/crates/vivi-asset-store-local";
const approvedTexturePlanSchemaBytes = 4_155;
const approvedTexturePlanSchemaSha256 =
  "90e36afd066cc6f58eb134796779013caf13e9de184b1031b7d834b89fadf055";

const expectedHostFiles = [
  "Cargo.toml",
  hostTexturePlanSchemaRelativePath,
  "src/error.rs",
  "src/host.rs",
  "src/lib.rs",
  "src/model.rs",
  "src/tests.rs",
].sort();

const pinnedHostFiles = [
  ["Cargo.toml", 543, "3e84ee055ebd261e58e3cc973805d566a13c3b76d6014956836cbee7e6143b4b"],
  [
    hostTexturePlanSchemaRelativePath,
    approvedTexturePlanSchemaBytes,
    approvedTexturePlanSchemaSha256,
  ],
  [
    "src/error.rs",
    3_130,
    "6190f1903a8b61131022279711b739b2dd68904945f672387f1c83ccf83c24b3",
  ],
  [
    "src/host.rs",
    22_651,
    "ef259d5900310f4129944a604647a44b6f9f3e801c0b68e942fc1d9e89b73d7a",
  ],
  [
    "src/lib.rs",
    1_365,
    "b3ac5d3b8ca9ef899a408b660c2fb309de874413016b78baff1b7706e0266525",
  ],
  [
    "src/model.rs",
    7_148,
    "8bfaa759cd6f794697f4f66264c5f5bf13ebf1297c5c9894cd6d5d13006750a3",
  ],
  [
    "src/tests.rs",
    47_919,
    "ef29c7e8436dc07fbd1e8c6924aa02160bb0c1665334fd52c7bacf9481731ba4",
  ],
];

const requiredTestNames = [
  "activation_exact_contract_seams_are_accepted_and_id_overflow_is_pre_io",
  "activation_later_hard_error_wins_over_earlier_missing",
  "activation_missing_ids_are_deterministic_and_drop_partial_ready_values",
  "activation_plan_contract_and_aggregate_limits_are_fail_closed",
  "activation_preflight_rejects_everything_before_store_io",
  "activation_ready_set_is_ordered_owned_complete_and_generation_bound",
  "activation_texture_count_and_reference_size_limits_precede_store_io",
  "asset_reference_preflight_preserves_resolver_codes_before_store_io",
  "closure_cardinality_syntax_and_case_collisions_are_zero_write_refset_failures",
  "embedded_materialization_returns_exact_attestation_and_reopens_as_reference",
  "manifest_closure_dto_debug_never_exposes_addresses_or_payload",
  "manifest_physical_logical_media_dimension_and_decode_faults_are_zero_write",
  "manifest_reference_preflight_precedes_oversized_closure_without_writes",
  "open_preserves_only_the_redacted_store_kind",
  "referenced_manifest_ingestion_succeeds_reopens_and_is_idempotent",
  "referenced_missing_is_a_state_distinct_from_hard_errors",
  "repeated_digest_is_supplied_and_persisted_once_in_first_occurrence_order",
  "request_generation_safe_integer_boundaries_are_preserved_without_reads",
  "store_failures_remain_redacted_and_never_fabricate_asset_codes",
  "write_failures_are_redacted_ordered_and_descriptor_last",
];

const expectedPublicItemsByFile = {
  "src/error.rs": ["LocalAssetHostError", "LocalAssetHostErrorKind"],
  "src/host.rs": ["LocalAssetHost"],
  "src/lib.rs": [],
  "src/model.rs": [
    "EvaluationTextureBindingV1",
    "EvaluationTexturePlanV1",
    "MissingActivationTexturesV1",
    "PrepareActivationTextureSetV1",
    "PreparedActivationTextureSetV1",
    "PreparedActivationTextureV1",
    "ReferencedAtlasResolutionV1",
    "ReferencedPngClosureObjectV1",
    "ReferencedPngManifestClosureV1",
    "VerifiedAtlasAssetV1",
    "VerifiedPngV1",
  ],
};

const expectedPublicFunctionsByFile = {
  "src/error.rs": ["asset_code", "kind", "store_kind"],
  "src/host.rs": [
    "ingest_referenced_png_manifest_closure",
    "materialize_embedded_png",
    "open",
    "prepare_activation_texture_set",
    "resolve_referenced_png",
  ],
  "src/lib.rs": [],
  "src/model.rs": [
    "id",
    "into_parts",
    "into_parts",
    "into_parts",
    "new",
    "new",
    "ready_png",
    "request_generation",
    "request_generation",
    "texture_ids",
    "textures",
    "total_pixels",
    "total_rgba_bytes",
  ],
};

const expectedProductionClosurePin = {
  count: 39,
  sha256: "797aea733e06122a224baee434fdeaa086b0489c6748cea71c09fc38e08b3fa7",
};

const expectedDevClosurePin = {
  count: 9,
  sha256: "7fccfb2ae60dd614ace2aa241704e6dc086eaf3b81224695cfed53845c36c3ec",
};

const expectedRootReexports = [
  "AssetErrorCode",
  "AssetRef",
  "Digest",
  "EvaluationTextureBindingV1",
  "EvaluationTexturePlanV1",
  "LocalAssetHost",
  "LocalAssetHostError",
  "LocalAssetHostErrorKind",
  "LocalStoreErrorKind",
  "MissingActivationTexturesV1",
  "PrepareActivationTextureSetV1",
  "PreparedActivationTextureSetV1",
  "PreparedActivationTextureV1",
  "PrincipalId",
  "ReadyPng",
  "ReferencedAtlasResolutionV1",
  "ReferencedPngClosureObjectV1",
  "ReferencedPngManifestClosureV1",
  "StorageKind",
  "VerifiedAtlasAssetV1",
  "VerifiedPngV1",
].sort();

try {
  assertStoreFoundationStillGreen();
  assertSourceInventory();
  assertApprovedTexturePlanSchemaCopy();
  const metadata = assertCargoBoundary();
  assertDependencyPins(metadata);
  assertHostContract();
  assertManifestIngestionContract();
  assertNativeOnlyIsolation(metadata);
  assertToolchainGateAndDocs();
  console.log(
    "[runtime-asset-host-local] passed (exact manifest ingestion, bounded orchestration, native isolation)",
  );
} catch (error) {
  console.error("[runtime-asset-host-local] failed:");
  console.error(`- ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

function assertStoreFoundationStillGreen() {
  runCapture(process.execPath, [resolve("scripts/check-runtime-asset-store-local.mjs")]);
}

function assertSourceInventory() {
  const actual = walkInventoryFiles(resolve(hostRoot))
    .map(toRelative)
    .map((relativePath) => relativePath.slice(`${hostRoot}/`.length))
    .sort();
  if (JSON.stringify(actual) !== JSON.stringify(expectedHostFiles)) {
    throw new Error(
      `local Asset host inventory drifted\nexpected=${JSON.stringify(expectedHostFiles)}\nactual=${JSON.stringify(actual)}`,
    );
  }

  const pinnedPaths = pinnedHostFiles.map(([relativePath]) => relativePath).sort();
  if (JSON.stringify(pinnedPaths) !== JSON.stringify(expectedHostFiles)) {
    throw new Error("local Asset host source pins do not cover the exact inventory");
  }
  for (const [relativePath, bytes, expectedHash] of pinnedHostFiles) {
    const filePath = `${hostRoot}/${relativePath}`;
    const contents = readFileSync(resolve(filePath));
    const actualHash = sha256(contents);
    if (contents.byteLength !== bytes || actualHash !== expectedHash) {
      throw new Error(
        `${filePath} exact source pin drifted: ${contents.byteLength}/${actualHash}`,
      );
    }
  }

  const tests = readText(`${hostRoot}/src/tests.rs`);
  const actualTestNames = [...tests.matchAll(/#\[test\]\s*fn\s+([A-Za-z0-9_]+)\s*\(/g)]
    .map((match) => match[1])
    .sort();
  if (JSON.stringify(actualTestNames) !== JSON.stringify([...requiredTestNames].sort())) {
    throw new Error(
      `local Asset host exact Rust test inventory drifted\nexpected=${JSON.stringify([...requiredTestNames].sort())}\nactual=${JSON.stringify(actualTestNames)}`,
    );
  }

  for (const relativePath of Object.keys(expectedPublicItemsByFile).sort()) {
    const source = readText(`${hostRoot}/${relativePath}`);
    const actualItems = [
      ...source.matchAll(/^pub (?:struct|enum|type|const)\s+([A-Za-z0-9_]+)/gm),
    ]
      .map((match) => match[1])
      .sort();
    const expectedItems = [...expectedPublicItemsByFile[relativePath]].sort();
    if (JSON.stringify(actualItems) !== JSON.stringify(expectedItems)) {
      throw new Error(
        `${relativePath} public item inventory drifted\nexpected=${JSON.stringify(expectedItems)}\nactual=${JSON.stringify(actualItems)}`,
      );
    }
  }

  for (const relativePath of Object.keys(expectedPublicFunctionsByFile).sort()) {
    const source = readText(`${hostRoot}/${relativePath}`);
    const actualFunctions = [
      ...source.matchAll(/^\s*pub(?: const)? fn\s+([A-Za-z0-9_]+)\s*\(/gm),
    ]
      .map((match) => match[1])
      .sort();
    const expectedFunctions = [...expectedPublicFunctionsByFile[relativePath]].sort();
    if (JSON.stringify(actualFunctions) !== JSON.stringify(expectedFunctions)) {
      throw new Error(
        `${relativePath} public function inventory drifted\nexpected=${JSON.stringify(expectedFunctions)}\nactual=${JSON.stringify(actualFunctions)}`,
      );
    }
  }

  const libraryRoot = readText(`${hostRoot}/src/lib.rs`);
  const actualReexports = [...libraryRoot.matchAll(/^pub use ([\s\S]*?);/gm)]
    .flatMap((match) => {
      const declaration = match[1].trim();
      const braced = /\{([\s\S]*)\}/.exec(declaration)?.[1];
      if (braced !== undefined) {
        return braced
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);
      }
      return [declaration.split("::").at(-1)];
    })
    .sort();
  if (JSON.stringify(actualReexports) !== JSON.stringify(expectedRootReexports)) {
    throw new Error(
      `local Asset host root re-export inventory drifted\nexpected=${JSON.stringify(expectedRootReexports)}\nactual=${JSON.stringify(actualReexports)}`,
    );
  }

  const modelSource = readText(`${hostRoot}/src/model.rs`);
  assertExactEnumVariants(modelSource, "ReferencedAtlasResolutionV1", [
    "Missing",
    "Ready",
  ]);
  assertExactEnumVariants(modelSource, "PrepareActivationTextureSetV1", [
    "Missing",
    "Ready",
  ]);
}

function assertApprovedTexturePlanSchemaCopy() {
  const hostSchemaBytes = readFileSync(resolve(hostTexturePlanSchemaPath));
  const modelSchemaBytes = readFileSync(resolve(modelTexturePlanSchemaPath));
  for (const [label, bytes] of [
    ["local Asset host", hostSchemaBytes],
    ["model source", modelSchemaBytes],
  ]) {
    const actualHash = sha256(bytes);
    if (
      bytes.byteLength !== approvedTexturePlanSchemaBytes ||
      actualHash !== approvedTexturePlanSchemaSha256
    ) {
      throw new Error(
        `${label} texture-plan schema identity drifted: ${bytes.byteLength}/${actualHash}`,
      );
    }
  }
  if (!hostSchemaBytes.equals(modelSchemaBytes)) {
    throw new Error(
      "local Asset host texture-plan schema is not byte-identical to model",
    );
  }

  const schema = JSON.parse(hostSchemaBytes.toString("utf8"));
  const definitions = schema.$defs ?? {};
  const textures = schema.properties?.textures;
  const assetRef = definitions.PngAssetRefV1;
  const binding = definitions.EvaluationTextureBindingV1;
  if (
    schema.$schema !== "https://json-schema.org/draft/2020-12/schema" ||
    schema.$id !== "https://vivi2d.com/spec/evaluation-texture-plan-v1.schema.json" ||
    schema.title !== "Vivi2D Evaluation Texture Plan v1" ||
    schema["x-vivi-status"] !== "approved-amendment-1" ||
    schema.type !== "object" ||
    schema.additionalProperties !== false ||
    JSON.stringify(schema.required) !== JSON.stringify(["schema", "textures"]) ||
    schema.properties?.schema?.const !== "vivi2d.evaluationTexturePlan.v1"
  ) {
    throw new Error("approved texture-plan schema identity/status/root contract drifted");
  }
  if (
    textures?.type !== "array" ||
    textures.maxItems !== 32 ||
    textures.items?.$ref !== "#/$defs/EvaluationTextureBindingV1" ||
    textures["x-vivi-uniqueBy"] !== "id" ||
    !textures.$comment?.includes("ascending id order") ||
    !textures.$comment?.includes("67108864 pixels") ||
    !textures.$comment?.includes("268435456 bytes")
  ) {
    throw new Error("approved texture-plan array/aggregate contract drifted");
  }
  if (
    definitions.Sha256HexV1?.pattern !== "^[A-Fa-f0-9]{64}$" ||
    definitions.NonNegativeSafeIntegerV1?.minimum !== 0 ||
    definitions.NonNegativeSafeIntegerV1?.maximum !== 9_007_199_254_740_991 ||
    definitions.TextureDimensionV1?.minimum !== 1 ||
    definitions.TextureDimensionV1?.maximum !== 8_192 ||
    definitions.TextureBindingIdV1?.pattern !== "^atlas:[A-Za-z0-9_-]{1,120}$"
  ) {
    throw new Error("approved texture-plan scalar limits/patterns drifted");
  }
  if (
    assetRef?.additionalProperties !== false ||
    JSON.stringify(assetRef?.properties?.storageKind?.enum) !==
      JSON.stringify(["blob", "chunk_manifest"]) ||
    assetRef?.properties?.mediaType?.const !== "image/png" ||
    assetRef?.properties?.sizeBytes?.minimum !== 0 ||
    assetRef?.properties?.sizeBytes?.maximum !== 67_108_864 ||
    assetRef?.allOf?.[0]?.then?.properties?.sizeBytes?.maximum !== 16_777_216 ||
    assetRef?.allOf?.[0]?.else?.properties?.sizeBytes?.minimum !== 16_777_217 ||
    assetRef?.allOf?.[0]?.else?.properties?.sizeBytes?.maximum !== 67_108_864
  ) {
    throw new Error("approved texture-plan AssetRef limits drifted");
  }
  if (
    binding?.additionalProperties !== false ||
    JSON.stringify(binding?.required) !==
      JSON.stringify([
        "id",
        "asset",
        "width",
        "height",
        "mediaType",
        "colorSpace",
        "alphaMode",
      ]) ||
    binding?.properties?.mediaType?.const !== "image/png" ||
    binding?.properties?.colorSpace?.const !== "srgb" ||
    binding?.properties?.alphaMode?.const !== "straight"
  ) {
    throw new Error("approved texture-plan binding constants drifted");
  }
}

function assertCargoBoundary() {
  const workspaceManifest = readText(nativeManifestPath);
  if (!workspaceManifest.includes('"crates/vivi-asset-host-local"')) {
    throw new Error("runtime-native workspace omits vivi-asset-host-local");
  }
  if (
    !/^rust-version = "1\.89"$/m.test(workspaceManifest) ||
    !/^edition = "2024"$/m.test(workspaceManifest)
  ) {
    throw new Error("runtime-native workspace must pin Rust 1.89 / edition 2024");
  }

  const metadata = readCargoMetadata();
  const hostPackage = requirePackage(metadata, "vivi-asset-host-local");
  if (
    hostPackage.version !== "0.1.0" ||
    hostPackage.edition !== "2024" ||
    hostPackage.rust_version !== "1.89" ||
    hostPackage.license !== "Apache-2.0" ||
    JSON.stringify(hostPackage.publish) !== "[]" ||
    JSON.stringify(hostPackage.features) !== "{}" ||
    path.resolve(hostPackage.manifest_path) !== resolve(hostManifestPath)
  ) {
    throw new Error(
      "local Asset host identity, license, Rust version, feature surface, or publish=false drifted",
    );
  }

  const libraryTargets = hostPackage.targets.filter((target) =>
    target.kind.includes("lib"),
  );
  if (
    hostPackage.targets.length !== 1 ||
    libraryTargets.length !== 1 ||
    libraryTargets[0].name !== "vivi_asset_host_local" ||
    JSON.stringify(libraryTargets[0].crate_types) !== JSON.stringify(["lib"])
  ) {
    throw new Error("local Asset host must remain a Rust-only rlib");
  }

  const expectedDirect = [
    directDependency("base64", "^0.22", "dev", true, []),
    directDependency("sha2", "^0.10", "dev", false, []),
    directDependency("tempfile", "^3", "dev", true, []),
    directDependency("vivi-asset-resolver", "*", "normal", false, [], "path"),
    directDependency("vivi-asset-store-local", "*", "normal", false, [], "path"),
  ];
  const actualDirect = hostPackage.dependencies
    .map((dependency) => ({
      name: dependency.name,
      req: dependency.req,
      kind: dependency.kind ?? "normal",
      usesDefaultFeatures: dependency.uses_default_features,
      features: [...dependency.features].sort(),
      sourceKind: dependency.source === null ? "path" : "registry",
      target: dependency.target ?? null,
      optional: dependency.optional,
    }))
    .sort(compareDirectDependencies);
  if (
    JSON.stringify(actualDirect) !==
    JSON.stringify([...expectedDirect].sort(compareDirectDependencies))
  ) {
    throw new Error(
      `local Asset host direct dependency/default-feature isolation drifted\nactual=${JSON.stringify(actualDirect, null, 2)}`,
    );
  }

  const lockBlocks = readText("packages/runtime-native/Cargo.lock")
    .split(/^\[\[package\]\]\s*$/m)
    .slice(1);
  const hostLockBlocks = lockBlocks.filter((block) =>
    /^name = "vivi-asset-host-local"$/m.test(block),
  );
  if (hostLockBlocks.length !== 1) {
    throw new Error("Cargo.lock must contain exactly one local Asset host stanza");
  }
  const hostLockBlock = hostLockBlocks[0];
  if (
    !/^version = "0\.1\.0"$/m.test(hostLockBlock) ||
    /^source =|^checksum =/m.test(hostLockBlock)
  ) {
    throw new Error("local Asset host Cargo.lock identity drifted");
  }
  const lockDependenciesBody = /^dependencies = \[\r?\n([\s\S]*?)^\]$/m.exec(
    hostLockBlock,
  )?.[1];
  const actualLockDependencies = [
    ...(lockDependenciesBody ?? "").matchAll(/^\s*"([^"]+)",$/gm),
  ]
    .map((match) => match[1])
    .sort();
  const expectedLockDependencies = [
    "base64",
    "sha2",
    "tempfile",
    "vivi-asset-resolver",
    "vivi-asset-store-local",
  ].sort();
  if (
    JSON.stringify(actualLockDependencies) !== JSON.stringify(expectedLockDependencies)
  ) {
    throw new Error(
      `local Asset host Cargo.lock dependencies drifted: ${actualLockDependencies.join(", ")}`,
    );
  }

  const hostNode = metadata.resolve.nodes.find((node) => node.id === hostPackage.id);
  if (!hostNode || JSON.stringify(hostNode.features) !== "[]") {
    throw new Error("local Asset host resolved feature surface must remain empty");
  }
  return metadata;
}

function assertDependencyPins(metadata) {
  const packages = new Map(metadata.packages.map((pkg) => [pkg.id, pkg]));
  const lockPackages = readCargoLockPackages();
  const hostPackage = requirePackage(metadata, "vivi-asset-host-local");
  const productionClosure = closureFromRoot(
    metadata,
    hostPackage.id,
    new Set([null, "build"]),
  );
  const devClosure = closureFromRoot(metadata, hostPackage.id, new Set(["dev"]));
  for (const productionId of productionClosure) devClosure.delete(productionId);

  assertDependencyInventoryPin(
    dependencyInventory(productionClosure, packages, lockPackages),
    expectedProductionClosurePin,
    "local Asset host production/build",
  );
  assertDependencyInventoryPin(
    dependencyInventory(devClosure, packages, lockPackages),
    expectedDevClosurePin,
    "local Asset host dev-only",
  );
}

function assertHostContract() {
  const manifest = readText(hostManifestPath);
  if (/^build\s*=|^\[build-dependencies\]|crate-type/m.test(manifest)) {
    throw new Error("local Asset host must not add build.rs or native export types");
  }

  const productionSource = ["src/error.rs", "src/host.rs", "src/lib.rs", "src/model.rs"]
    .map((relativePath) => readText(`${hostRoot}/${relativePath}`))
    .join("\n");
  for (const evidence of [
    "LocalAssetHost",
    "ingest_referenced_png_manifest_closure",
    "materialize_embedded_png",
    "resolve_referenced_png",
    "prepare_activation_texture_set",
    "VerifiedAtlasAssetV1",
    "VerifiedPngV1",
    "ReferencedAtlasResolutionV1",
    "EvaluationTexturePlanV1",
    "EvaluationTextureBindingV1",
    "PrepareActivationTextureSetV1",
    "PreparedActivationTextureSetV1",
    "MissingActivationTexturesV1",
    "ReferencedPngClosureObjectV1",
    "ReferencedPngManifestClosureV1",
    "request_generation",
    "const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;",
    "vivi2d.evaluationTexturePlan.v1",
    "vivi2d.png.rgba8.v1",
    "image/png",
    "srgb",
    "straight",
    "const MAX_TEXTURES: usize = 32;",
    "const MAX_TEXTURE_AXIS: u32 = 8_192;",
    "const MAX_TEXTURE_PIXELS: u64 = 67_108_864;",
    "const MAX_TOTAL_TEXTURE_PIXELS: u64 = 67_108_864;",
    "const MAX_TEXTURE_RGBA_BYTES: u64 = 268_435_456;",
    "const MAX_TOTAL_TEXTURE_RGBA_BYTES: u64 = 268_435_456;",
    "const MAX_PNG_INPUT_BYTES: u64 = 67_108_864;",
    "const MAX_BLOB_BYTES: u64 = 16_777_216;",
    'strip_prefix(b"atlas:")',
    "(1..=120).contains(&suffix.len())",
    "byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-')",
    "InvalidTexturePlan",
    "ResourceLimitExceeded",
    "Asset",
    "Store",
    "AssetErrorCode::MediaTypeMismatch",
    "AssetErrorCode::LimitExceeded",
    "AssetErrorCode::HashMismatch",
    "AssetErrorCode::RefSetMismatch",
    "asset_code",
    "store_kind",
    "prepare_embedded_png",
    "materialize_prepared_png",
    "LocalImmutableAssetStore",
    "parse_chunk_manifest",
    "validate_exact_closure",
    "put_verified_chunk_if_absent",
    "put_chunk_manifest_if_absent",
    "put_descriptor_if_absent",
    "impl fmt::Debug for PreparedActivationTextureV1",
    'field("logical_bytes_len"',
    'field("rgba_bytes_len"',
    '"source_generation_count"',
  ]) {
    if (!productionSource.includes(evidence)) {
      throw new Error(`local Asset host contract evidence drifted: ${evidence}`);
    }
  }
  if (/\bAssetsMissing\b/.test(productionSource)) {
    throw new Error("missing assets must remain a result state, not a host error");
  }
  const modelSource = readText(`${hostRoot}/src/model.rs`);
  if (
    /#\[derive\([^\]]*Debug[^\]]*\)\]\s*pub struct PreparedActivationTextureV1/.test(
      modelSource,
    )
  ) {
    throw new Error("owned activation PNG bytes must remain absent from derived Debug");
  }

  const errorSource = readText(`${hostRoot}/src/error.rs`);
  const errorKindBody = /pub enum LocalAssetHostErrorKind\s*\{([\s\S]*?)\n\}/.exec(
    errorSource,
  )?.[1];
  if (!errorKindBody) {
    throw new Error("local Asset host error-kind enum is missing");
  }
  const actualErrorKinds = [...errorKindBody.matchAll(/^\s*([A-Z][A-Za-z0-9_]*)\s*,/gm)]
    .map((match) => match[1])
    .sort();
  const expectedErrorKinds = [
    "Asset",
    "InvalidTexturePlan",
    "ResourceLimitExceeded",
    "Store",
  ].sort();
  if (JSON.stringify(actualErrorKinds) !== JSON.stringify(expectedErrorKinds)) {
    throw new Error(
      `local Asset host error domains drifted: ${actualErrorKinds.join(", ")}`,
    );
  }

  const forbiddenPatterns = [
    [/\bextern\s+"C"/, "C ABI export"],
    [/\b(?:no_mangle|export_name)\b/, "native symbol attribute"],
    [/\bunsafe\s*(?:\{|fn|impl|trait)\b/, "unsafe Rust"],
    [/\bstd::(?:net|process)\b|\bCommand::new\b/, "network/subprocess adapter"],
    [/\b(?:libloading|dlopen|LoadLibrary)\b/i, "dynamic loading"],
    [/\b(?:wasm_bindgen|napi|neon|uniffi|cxx)\b/, "language bridge"],
    [/vivi\.cap\.|supported_capabilit/i, "capability advertisement"],
  ];
  for (const [pattern, label] of forbiddenPatterns) {
    if (pattern.test(productionSource)) {
      throw new Error(`local Asset host contains forbidden ${label}`);
    }
  }
}

function assertManifestIngestionContract() {
  const hostSource = readText(`${hostRoot}/src/host.rs`);
  const modelSource = readText(`${hostRoot}/src/model.rs`);

  for (const evidence of [
    "const MAX_REFERENCED_PNG_CLOSURE_OBJECTS: usize = 9;",
    "ReferencedPngClosureObjectV1",
    "ReferencedPngManifestClosureV1",
    "ingest_referenced_png_manifest_closure",
    "ingest_referenced_png_manifest_closure_into_store",
    "validate_referenced_png_manifest_closure",
    "ReferencedPngManifestWriteStore",
    "StagedReferencedPngClosure",
    "StagedReadError::Allocation",
    "map_publication_error",
    "OperationError::Asset(_) => LocalAssetHostError::from_store_kind(None)",
    "Every fallible caller/Asset check is complete before the first durable",
    "Digest::from_hex",
    "parse_chunk_manifest",
    "manifest.required_object_addresses()",
    "validate_exact_closure",
    "resolve_png_with_store",
    "put_verified_chunk_if_absent",
    "put_chunk_manifest_if_absent",
    "put_descriptor_if_absent",
    "Descriptor::from_reference(reference)",
    "AssetErrorCode::UnsupportedKind",
    "AssetErrorCode::RefSetMismatch",
    "AssetErrorCode::HashMismatch",
    "AssetErrorCode::LimitExceeded",
    "drop(ready);",
  ]) {
    if (!hostSource.includes(evidence) && !modelSource.includes(evidence)) {
      throw new Error(`manifest-ingestion contract evidence drifted: ${evidence}`);
    }
  }

  if (
    !/pub fn ingest_referenced_png_manifest_closure\([\s\S]*?reference: &AssetRef,[\s\S]*?closure: &ReferencedPngManifestClosureV1<'_>,[\s\S]*?declared_width: u32,[\s\S]*?declared_height: u32,[\s\S]*?\) -> Result<VerifiedAtlasAssetV1, LocalAssetHostError>/.test(
      hostSource,
    )
  ) {
    throw new Error(
      "manifest-ingestion public signature or attestation-only result drifted",
    );
  }

  const writeStart = hostSource.indexOf(
    "pub(crate) fn ingest_referenced_png_manifest_closure_into_store",
  );
  const writeEnd = hostSource.indexOf(
    "\nfn validate_referenced_png_manifest_closure",
    writeStart,
  );
  const writeSource = hostSource.slice(writeStart, writeEnd);
  const writeOrder = [
    "let validated = validate_referenced_png_manifest_closure",
    "let mut publication_chunks = Vec::new()",
    "let manifest_bytes = validated",
    "let descriptor = Descriptor::from_reference(reference)",
    "let attestation = verified_attestation(",
    "Every fallible caller/Asset check is complete before the first durable",
    ".put_verified_chunk_if_absent",
    ".put_chunk_manifest_if_absent",
    ".put_descriptor_if_absent",
    "Ok(attestation)",
  ].map((evidence) => writeSource.indexOf(evidence));
  if (
    writeStart < 0 ||
    writeEnd < 0 ||
    writeOrder.some((index) => index < 0) ||
    writeOrder.some(
      (index, position) => position > 0 && index <= writeOrder[position - 1],
    )
  ) {
    throw new Error(
      "manifest ingestion must finish its publication plan before writes and keep chunk/manifest/descriptor/attestation order",
    );
  }

  const validationStart = hostSource.indexOf(
    "fn validate_referenced_png_manifest_closure",
  );
  const validationEnd = hostSource.indexOf("\nfn verified_attestation", validationStart);
  const validationSource = hostSource.slice(validationStart, validationEnd);
  const validationOrder = [
    "reference.storage_kind != StorageKind::ChunkManifest",
    "validate_asset_shape(reference)?",
    "closure.objects.len() > MAX_REFERENCED_PNG_CLOSURE_OBJECTS",
    "let mut objects = HashMap::new()",
    "Digest::from_hex",
    "parse_chunk_manifest",
    "validate_exact_closure",
    "resolve_png_with_store",
    "drop(ready);",
  ].map((evidence) => validationSource.indexOf(evidence));
  if (
    validationStart < 0 ||
    validationEnd < 0 ||
    validationOrder.some((index) => index < 0) ||
    validationOrder.some(
      (index, position) => position > 0 && index <= validationOrder[position - 1],
    )
  ) {
    throw new Error(
      "manifest closure must bound cardinality before allocation and fully validate/decode before writes",
    );
  }

  for (const typeName of [
    "ReferencedPngClosureObjectV1",
    "ReferencedPngManifestClosureV1",
  ]) {
    if (
      new RegExp(`#\\[derive\\([^\\]]*Debug[^\\]]*\\)\\]\\s*pub struct ${typeName}`).test(
        modelSource,
      )
    ) {
      throw new Error(`${typeName} payload-bearing Debug must remain manually redacted`);
    }
    if (!modelSource.includes(`impl fmt::Debug for ${typeName}`)) {
      throw new Error(`${typeName} must retain its manual redacted Debug implementation`);
    }
  }
  if (
    /^\s*pub\s+(?:wire_object_address|payload|objects)\s*:/m.test(modelSource) ||
    /\.field\("(?:wire_object_address|payload|objects)"/.test(modelSource)
  ) {
    throw new Error("manifest request fields or Debug output expose raw closure data");
  }
  for (const evidence of [
    '.field("wire_object_address_len"',
    '.field("payload_bytes_len"',
    '.field("object_count"',
    '.field("total_payload_bytes"',
  ]) {
    if (!modelSource.includes(evidence)) {
      throw new Error(`manifest request Debug redaction evidence drifted: ${evidence}`);
    }
  }
}

function assertNativeOnlyIsolation(metadata) {
  const resolverConsumers = consumersOf(metadata, "vivi-asset-resolver");
  if (
    JSON.stringify(resolverConsumers) !==
    JSON.stringify(["vivi-asset-host-local", "vivi-asset-store-local"])
  ) {
    throw new Error(
      `resolver production consumer isolation drifted: ${resolverConsumers.join(", ")}`,
    );
  }
  const storeConsumers = consumersOf(metadata, "vivi-asset-store-local");
  if (JSON.stringify(storeConsumers) !== JSON.stringify(["vivi-asset-host-local"])) {
    throw new Error(
      `local Asset store consumer isolation drifted: ${storeConsumers.join(", ")}`,
    );
  }
  const hostConsumers = consumersOf(metadata, "vivi-asset-host-local");
  if (hostConsumers.length !== 0) {
    throw new Error(
      `local Asset host must remain consumer-zero: ${hostConsumers.join(", ")}`,
    );
  }

  for (const packageName of [
    "vivi-runtime-native-c-abi",
    "vivi-runtime-native-core",
    "vivi-runtime-native-wasm",
  ]) {
    const pkg = requirePackage(metadata, packageName);
    if (
      pkg.dependencies.some((dependency) =>
        ["vivi-asset-host-local", "vivi-asset-store-local"].includes(dependency.name),
      )
    ) {
      throw new Error(
        `${packageName} must remain disconnected from local Asset host/store`,
      );
    }
  }

  for (const boundaryRoot of ["packages/editor-host", "electron", "src"]) {
    for (const filePath of walkFiles(resolve(boundaryRoot))) {
      if (!/\.(?:[cm]?[jt]sx?|json)$/i.test(filePath)) continue;
      if (/vivi[-_]asset[-_]host[-_]local/i.test(readFileSync(filePath, "utf8"))) {
        throw new Error(
          `${toRelative(filePath)} wires the local Asset host before its bridge slice`,
        );
      }
    }
  }

  for (const isolatedRoot of [
    "packages/runtime-c-abi",
    "packages/runtime-native/crates/vivi-runtime-native-c-abi",
    "packages/runtime-native/crates/vivi-runtime-native-core",
    "packages/runtime-native/crates/vivi-runtime-native-wasm",
  ]) {
    if (
      walkFiles(resolve(isolatedRoot)).some((filePath) =>
        /vivi[-_]asset[-_]host[-_]local/i.test(readFileSync(filePath, "utf8")),
      )
    ) {
      throw new Error(`${isolatedRoot} source must remain disconnected from the host`);
    }
  }

  for (const foundationRoot of [resolverRoot, storeRoot]) {
    if (
      walkFiles(resolve(`${foundationRoot}/src`)).some((filePath) =>
        /vivi[-_]asset[-_]host[-_]local/i.test(readFileSync(filePath, "utf8")),
      )
    ) {
      throw new Error(
        `${foundationRoot} source must not depend back on its host adapter`,
      );
    }
  }
}

function assertToolchainGateAndDocs() {
  const runtimePackage = readJson("packages/runtime-native/package.json");
  const expectedRuntimeScript =
    "cargo test --locked --manifest-path Cargo.toml -p vivi-asset-host-local --all-targets && cargo clippy --locked --manifest-path Cargo.toml -p vivi-asset-host-local --all-targets -- -D warnings";
  if (runtimePackage.scripts?.["check:asset-host-local"] !== expectedRuntimeScript) {
    throw new Error("local Asset host focused test/Clippy script drifted");
  }
  if (/wasm32/.test(expectedRuntimeScript)) {
    throw new Error("local Asset host script must remain native-only");
  }

  const rootPackage = readJson("package.json");
  const expectedRootScript =
    "node scripts/check-runtime-asset-host-local.mjs && npm run check:asset-host-local --workspace @vivi2d/runtime-native";
  if (rootPackage.scripts?.["check:runtime-asset-host-local"] !== expectedRootScript) {
    throw new Error("root local Asset host gate drifted");
  }

  const qualityRunner = readText("scripts/run-quality-gates.mjs");
  if (!qualityRunner.includes('"check:runtime-asset-host-local"')) {
    throw new Error("root quality runner omits the local Asset host gate");
  }
  const gateManifest = readJson("scripts/quality-gate-manifest.json");
  const gate = gateManifest.gates?.find(
    (candidate) => candidate.npmScript === "check:runtime-asset-host-local",
  );
  if (
    gate?.command !== "npm run check:runtime-asset-host-local" ||
    JSON.stringify(gate.requiredWorkflows) !==
      JSON.stringify([".github/workflows/runtime-native.yml"]) ||
    gate.intentionallySplit !== true ||
    gate.escalatable !== true
  ) {
    throw new Error("local Asset host quality-gate manifest entry drifted");
  }
  for (const evidence of [
    "byte-identical approved texture-plan schema copy",
    "exact normalized manifest-closure ingestion",
    "at most nine supplied objects",
    "descriptor-last logical commit",
    "Expected-reference kind/size/media preflight precedes closure inspection",
    "Validation and caller-derived Asset failures occur before writes",
    "chunk or manifest write failures never attempt the descriptor",
    "outcome-ambiguous",
    "immutable operation is retryable",
    "durable-parser divergence during publication",
    "without a stable Asset code",
    "per-call validation bounds",
    "not a caller quota",
    "exact total peak-memory guarantee",
    "Raw-JSON parsing",
    "duplicate-key rejection",
    "typed texture plans remain bridge-owned",
    "manifest ingestion reuses the resolver's approved bounded duplicate-aware Stage 1/Stage 2 parser",
  ]) {
    if (!gate.notes?.includes(evidence)) {
      throw new Error(`local Asset host gate note is missing ${evidence}`);
    }
  }

  const workflow = readText(".github/workflows/runtime-native.yml");
  for (const evidence of [
    "RUSTUP_TOOLCHAIN: 1.89.0",
    "matrix:\n        os: [ubuntu-latest, windows-latest, macos-latest]",
    '"scripts/check-runtime-asset-host-local.mjs"',
    `"${modelTexturePlanSchemaPath}"`,
    "npm run check:runtime-asset-host-local",
    "$" + "{{ runner.temp }}/vivi-asset-host-local-native",
    "biome check scripts/check-runtime-asset-host-local.mjs",
  ]) {
    if (!workflow.includes(evidence)) {
      throw new Error(`runtime-native workflow is missing host evidence: ${evidence}`);
    }
  }
  if (
    /vivi-asset-host-local[^\n]*wasm32|wasm32[^\n]*vivi-asset-host-local/.test(workflow)
  ) {
    throw new Error("local Asset host must not be compiled for wasm32");
  }

  const documentation = [
    "docs/developer/architecture/package-graph.md",
    "docs/developer/contributing/package-boundaries.md",
    "docs/developer/quality/public-api-status.md",
  ]
    .map(readText)
    .join("\n")
    .replace(/\s+/g, " ");
  for (const evidence of [
    "vivi-asset-host-local",
    "vivi2d.evaluationTexturePlan.v1",
    "^atlas:[A-Za-z0-9_-]{1,120}$",
    "9,007,199,254,740,991",
    "language bridge",
    "Electron IPC",
    "C ABI",
    "WASM",
    "capability advertisement",
    "manifest-closure ingestion",
    "at most nine",
    "RefSetMismatch",
    "received-value JCS",
    "first manifest occurrence order",
    "sole logical publication point",
    "outcome-ambiguous",
    "idempotent retry",
    "unreferenced GC candidates",
    "durable-parser divergence",
    "without a stable Asset code",
    "approximately 451 MiB",
    "bounded per-call class",
    "not an exact total peak-memory guarantee",
    "path/principal derivation or ACLs",
    "quotas",
    "cancellation",
    "GC",
    "server lifecycle",
    "evaluation loading",
    "GPU activation",
    "raw-JSON parsing",
    "duplicate-key rejection",
    "Stage 1 validation",
    "does not establish generation monotonicity or freshness",
    "latest-generation comparison",
    "stale-result rejection",
    "texture-upload transaction",
    "atomic publication",
  ]) {
    if (!documentation.includes(evidence)) {
      throw new Error(`local Asset host documentation is missing ${evidence}`);
    }
  }
  for (const staleNonGoal of [
    "does not own manifest-closure ingestion",
    "implement full manifest-closure ingestion",
  ]) {
    if (documentation.includes(staleNonGoal)) {
      throw new Error(
        `local Asset host documentation retains stale non-goal: ${staleNonGoal}`,
      );
    }
  }
}

function assertExactEnumVariants(source, enumName, expectedVariants) {
  const body = new RegExp(`pub enum ${enumName}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(
    source,
  )?.[1];
  if (!body) throw new Error(`${enumName} is missing`);
  const actualVariants = [...body.matchAll(/^\s*([A-Z][A-Za-z0-9_]*)\b/gm)]
    .map((match) => match[1])
    .sort();
  const expected = [...expectedVariants].sort();
  if (JSON.stringify(actualVariants) !== JSON.stringify(expected)) {
    throw new Error(
      `${enumName} variant inventory drifted: ${actualVariants.join(", ")}`,
    );
  }
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

function consumersOf(metadata, dependencyName) {
  return metadata.packages
    .filter((pkg) =>
      pkg.dependencies.some((dependency) => dependency.name === dependencyName),
    )
    .map((pkg) => pkg.name)
    .sort();
}

function requirePackage(metadata, packageName) {
  const pkg = metadata.packages.find((candidate) => candidate.name === packageName);
  if (!pkg) throw new Error(`cargo metadata omitted ${packageName}`);
  return pkg;
}

function directDependency(
  name,
  req,
  kind,
  usesDefaultFeatures,
  features,
  sourceKind = "registry",
  target = null,
) {
  return {
    name,
    req,
    kind,
    usesDefaultFeatures,
    features,
    sourceKind,
    target,
    optional: false,
  };
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

function readCargoLockPackages() {
  const lock = readText("packages/runtime-native/Cargo.lock");
  const packages = new Map();
  for (const block of lock.split(/^\[\[package\]\]\s*$/m).slice(1)) {
    const name = /^name = "([^"]+)"$/m.exec(block)?.[1];
    const version = /^version = "([^"]+)"$/m.exec(block)?.[1];
    const checksum = /^checksum = "([^"]+)"$/m.exec(block)?.[1] ?? null;
    if (name && version) packages.set(`${name}@${version}`, { checksum });
  }
  return packages;
}

function walkFiles(directory) {
  if (!existsSync(directory)) return [];
  const result = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...walkFiles(filePath));
    else if (entry.isFile() && statSync(filePath).size <= 8 * 1024 * 1024) {
      result.push(filePath);
    }
  }
  return result;
}

function walkInventoryFiles(directory) {
  if (!existsSync(directory)) return [];
  const result = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...walkInventoryFiles(filePath));
    else if (entry.isFile()) result.push(filePath);
  }
  return result;
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function readText(relativePath) {
  return readFileSync(resolve(relativePath), "utf8");
}

function resolve(relativePath) {
  return path.join(root, relativePath);
}

function toRelative(filePath) {
  return path.relative(root, filePath).replaceAll("\\", "/");
}

function compareDependencies(left, right) {
  return left.name.localeCompare(right.name) || left.version.localeCompare(right.version);
}

function compareDirectDependencies(left, right) {
  return left.name.localeCompare(right.name) || left.kind.localeCompare(right.kind);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function runCapture(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} failed with exit code ${result.status ?? "unknown"}: ${result.stderr ?? result.error?.message ?? ""}`,
    );
  }
  return result.stdout ?? "";
}
