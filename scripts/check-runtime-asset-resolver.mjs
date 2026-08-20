import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";

const root = process.cwd();
const nativeManifestPath = "packages/runtime-native/Cargo.toml";
const resolverRoot = "packages/runtime-native/crates/vivi-asset-resolver";
const resolverManifestPath = `${resolverRoot}/Cargo.toml`;
const schemaPath = `${resolverRoot}/schema/asset-model-v1.schema.json`;
const localNormativeSchemaPath = "docs/developer/api/spec/asset-model-v1.schema.json";
const manifestSourcePath = `${resolverRoot}/src/manifest.rs`;
const schemaEquivalentPath = `${resolverRoot}/src/manifest/schema_equivalent.rs`;
const parityFixturePath = `${resolverRoot}/tests/fixtures/schema-stage1-parity.json`;
const resolverFixturePath = `${resolverRoot}/tests/fixtures/asset-model-v1-resolver.json`;
const cAbiSourcePath =
  "packages/runtime-native/crates/vivi-runtime-native-c-abi/src/lib.rs";

const approvedSchema = {
  bytes: 6_114,
  sha256: "dfe762b5363fd2bf12ebf41fe7e81e8eb1d7cacfa9c5af1646004dfc49c52671",
  dialect: "https://json-schema.org/draft/2020-12/schema",
  id: "https://vivi2d.com/spec/asset-model-v1.schema.json",
  status: "approved-amendment-1",
};

const pinnedFiles = [
  [
    schemaEquivalentPath,
    6_644,
    "fb251fb24fc68ce8357b0b27f0ecb8f71a3c64ec52247d2c429f89085903d76f",
  ],
  [
    parityFixturePath,
    19_990,
    "f6566674cc1976672066eb5d63160178a16b14be05489ecb592d7ddf4bf43748",
  ],
  [
    resolverFixturePath,
    1_832,
    "d537baf7a4a88cbb4438fed1e68df6549d6c5bce3d4a030ad867fcde1ec1a3aa",
  ],
];

const expectedResolverFiles = [
  "Cargo.toml",
  "schema/asset-model-v1.schema.json",
  "src/digest.rs",
  "src/error.rs",
  "src/lib.rs",
  "src/manifest.rs",
  "src/manifest/schema_equivalent.rs",
  "src/model.rs",
  "src/resolver.rs",
  "src/store.rs",
  "src/tests.rs",
  "tests/fixtures/asset-model-v1-resolver.json",
  "tests/fixtures/schema-stage1-parity.json",
].sort();

const expectedStage1VectorIds = [
  "canonical-stage1-and-stage2-accept",
  "mathematical-integers-decimal-and-exponent",
  "codepoints-pass-utf8-bytes-fail-stage2",
  "uppercase-digests-accepted",
  "closed-top-level-rejects-unknown",
  "closed-nested-chunk-rejects-unknown",
  "required-member-missing",
  "member-type-mismatch",
  "required-root-schema-missing",
  "required-root-mediaType-missing",
  "required-root-contentSha256-missing",
  "required-root-sizeBytes-missing",
  "required-root-chunkSizeBytes-missing",
  "required-root-chunks-missing",
  "root-null-rejected",
  "root-array-rejected",
  "root-string-rejected",
  "schema-wrong-type",
  "schema-const-mismatch",
  "media-type-wrong-type",
  "media-empty",
  "media-255-codepoints",
  "media-256-codepoints",
  "digest-wrong-type",
  "digest-63-hex",
  "digest-65-hex",
  "digest-nonhex",
  "root-size-string",
  "root-size-fraction",
  "root-size-below-min",
  "root-size-at-max-stage2-sum-reject",
  "root-size-above-max",
  "chunk-size-const-wrong-type",
  "chunk-size-const-mismatch",
  "chunks-two-items",
  "chunks-8192-items-boundary",
  "chunks-8193-items-over",
  "child-nonobject",
  "child-sha-missing",
  "child-size-missing",
  "child-extra-member",
  "child-bad-digest",
  "child-size-zero",
  "child-size-over",
  "child-size-fraction",
  "repeated-digest-positive",
  "asset-ref-branch-is-not-a-manifest",
].sort();

const expectedRawParserVectorIds = [
  "escaped-nested-duplicate-rejected-before-stage1",
  "top-level-exact-duplicate-rejected-before-stage1",
  "top-level-escaped-equivalent-duplicate-rejected-before-stage1",
  "nested-exact-duplicate-rejected-before-stage1",
].sort();

const requiredRustTestNames = [
  "approved_schema_copy_is_exactly_pinned",
  "stage1_parity_corpus_matches_compiled_equivalent",
  "frozen_three_chunk_jcs_address_and_received_hex_case_are_exact",
  "referenced_manifest_reconstructs_closure_and_fully_decodes_large_png",
  "manifest_missing_and_nonactive_chunk_states_are_hard_errors",
  "chunk_bounded_read_and_malicious_oversized_snapshot_map_to_limit",
  "manifest_chunk_hash_size_order_and_logical_metadata_fail_closed",
  "exact_closure_supports_union_of_multiple_manifests_beyond_one_manifest_cap",
  "png_decoder_five_classifications_map_to_frozen_asset_codes",
  "full_decode_rejects_zlib_damage_that_structure_inspection_accepts",
  "repeated_chunk_uses_one_generation_pinned_read_even_if_store_would_flip",
];

const cAbiHeaderPins = [
  [
    "packages/runtime-c-abi/include/vivi_runtime.h",
    "dac8dfe8169d73553623eee6eac87cf47d43ec79fe4f0ff9eb2237b25ec737ac",
  ],
  [
    "packages/runtime-c-abi/include/vivi_runtime_v02.h",
    "226f3c7f8e73a3275998858854cc91cd0bd93460a9f5a1c88691b68665906961",
  ],
  [
    "packages/runtime-c-abi/include/vivi_png.h",
    "69f2e75c9386725223417f92c3987ee4a3c1af69ccb11b2e2e45cd98941ca958",
  ],
];

const expectedCAbiExports = [
  "vivi_get_abi_version",
  "vivi_get_runtime_version",
  "vivi_get_supported_spec_version_range",
  "vivi_model_apply_expression_preset",
  "vivi_model_destroy",
  "vivi_model_draw_command_count",
  "vivi_model_draw_commands",
  "vivi_model_expression_preset_count",
  "vivi_model_expression_preset_info",
  "vivi_model_expression_preset_value",
  "vivi_model_generations",
  "vivi_model_get_input",
  "vivi_model_get_playback_state",
  "vivi_model_get_spec_version",
  "vivi_model_get_state_machine_state",
  "vivi_model_hit_test",
  "vivi_model_last_error_message",
  "vivi_model_load",
  "vivi_model_mesh_count",
  "vivi_model_mesh_snapshot",
  "vivi_model_mesh_snapshot_by_id",
  "vivi_model_parameter_count",
  "vivi_model_parameter_info",
  "vivi_model_play_clip",
  "vivi_model_render_mesh_count_v2",
  "vivi_model_render_mesh_snapshot_v2",
  "vivi_model_required_render_features",
  "vivi_model_seek_clip",
  "vivi_model_set_input",
  "vivi_model_set_state_machine_state",
  "vivi_model_stop_clip",
  "vivi_model_texture_count",
  "vivi_model_texture_snapshot",
  "vivi_model_update",
  "vivi_png_decode",
  "vivi_png_inspect",
  "vivi_runtime_create",
  "vivi_runtime_destroy",
  "vivi_runtime_last_error_message",
].sort();

const expectedResolvedClosure = [
  registryDependency(
    "adler2",
    "2.0.1",
    "0BSD OR MIT OR Apache-2.0",
    "320119579fcad9c21884f5c4861d16174d0e06250625266f50fe6898340abefa",
  ),
  registryDependency(
    "block-buffer",
    "0.10.4",
    "MIT OR Apache-2.0",
    "3078c7629b62d3f0439517fa394996acacc5cbc91c5a20d8c658e77abd503a71",
  ),
  registryDependency(
    "cfg-if",
    "1.0.4",
    "MIT OR Apache-2.0",
    "9330f8b2ff13f34540b44e946ef35111825727b38d33286ef986142615121801",
  ),
  registryDependency(
    "cpufeatures",
    "0.2.17",
    "MIT OR Apache-2.0",
    "59ed5838eebb26a2bb2e58f6d5b5316989ae9d08bab10e0e6d103e656d1b0280",
  ),
  registryDependency(
    "crypto-common",
    "0.1.7",
    "MIT OR Apache-2.0",
    "78c8292055d1c1df0cce5d180393dc8cce0abec0a7102adb6c7b1eef6016d60a",
  ),
  registryDependency(
    "digest",
    "0.10.7",
    "MIT OR Apache-2.0",
    "9ed9a281f7bc9b7576e61468ba615a66a5c8cfdff42420a70aa82701a3b1e292",
  ),
  registryDependency(
    "generic-array",
    "0.14.7",
    "MIT",
    "85649ca51fd72272d7821adaf274ad91c288277713d9c18820d8499a7ff69e9a",
  ),
  registryDependency(
    "itoa",
    "1.0.18",
    "MIT OR Apache-2.0",
    "8f42a60cbdf9a97f5d2305f08a87dc4e09308d1276d28c869c684d7777685682",
  ),
  registryDependency(
    "libc",
    "0.2.189",
    "MIT OR Apache-2.0",
    "3eaf3ede3fee6db1a4c2ee091bf8a8b4dccdc6d17f656fb07896ee72867612f2",
  ),
  registryDependency(
    "memchr",
    "2.8.0",
    "Unlicense OR MIT",
    "f8ca58f447f06ed17d5fc4043ce1b10dd205e060fb3ce5b979b8ed8e59ff3f79",
  ),
  registryDependency(
    "miniz_oxide",
    "0.8.9",
    "MIT OR Zlib OR Apache-2.0",
    "1fa76a2c86f704bdb222d66965fb3d63269ce38518b83cb0575fca855ebb6316",
  ),
  registryDependency(
    "proc-macro2",
    "1.0.106",
    "MIT OR Apache-2.0",
    "8fd00f0bb2e90d81d1044c2b32617f68fcb9fa3bb7640c23e9c748e53fb30934",
  ),
  registryDependency(
    "quote",
    "1.0.45",
    "MIT OR Apache-2.0",
    "41f2619966050689382d2b44f664f4bc593e129785a36d6ee376ddf37259b924",
  ),
  registryDependency(
    "serde",
    "1.0.228",
    "MIT OR Apache-2.0",
    "9a8e94ea7f378bd32cbbd37198a4a91436180c5bb472411e48b5ec2e2124ae9e",
  ),
  registryDependency(
    "serde_core",
    "1.0.228",
    "MIT OR Apache-2.0",
    "41d385c7d4ca58e59fc732af25c3983b67ac852c1a25000afe1175de458b67ad",
  ),
  registryDependency(
    "serde_derive",
    "1.0.228",
    "MIT OR Apache-2.0",
    "d540f220d3187173da220f885ab66608367b6574e925011a9353e4badda91d79",
  ),
  registryDependency(
    "serde_json",
    "1.0.149",
    "MIT OR Apache-2.0",
    "83fc039473c5595ace860d8c4fafa220ff474b3fc6bfdb4293327f1a37e94d86",
  ),
  registryDependency(
    "sha2",
    "0.10.9",
    "MIT OR Apache-2.0",
    "a7507d819769d01a365ab707794a4084392c824f54a7a6a7862f8c3d0892b283",
  ),
  registryDependency(
    "syn",
    "2.0.117",
    "MIT OR Apache-2.0",
    "e665b8803e7b1d2a727f4023456bbbbe74da67099c585258af0ad9c5013b9b99",
  ),
  registryDependency(
    "typenum",
    "1.20.1",
    "MIT OR Apache-2.0",
    "b6f5e870be6c3b371b77fe0ee0bafb859fa4964b4404c27de1d380043c4dda20",
  ),
  registryDependency(
    "unicode-ident",
    "1.0.24",
    "(MIT OR Apache-2.0) AND Unicode-3.0",
    "e6e4313cd5fcd3dad5cafa179702e2b244f760991f45397d14d4ebf38247da75",
  ),
  registryDependency(
    "version_check",
    "0.9.5",
    "MIT/Apache-2.0",
    "0b928f33d975fc6ad9f86c8f283853ad26bdd5b10b7f1542aa2fa15e2289105a",
  ),
  workspaceDependency("vivi-asset-resolver"),
  workspaceDependency("vivi-png-ref"),
  registryDependency(
    "zmij",
    "1.0.21",
    "MIT",
    "b8848ee67ecc8aedbaf3e4122217aff892639231befc6a1b58d29fff4c2cabaa",
  ),
];

const expectedDevClosure = [
  registryDependency(
    "base64",
    "0.22.1",
    "MIT OR Apache-2.0",
    "72b3254f16251a8381aa12e40e3c4d2f0199f8c6508fbecb9d91f575e0fbb8c6",
  ),
];

try {
  assertSchemaAndParityCorpus();
  assertManifestPipeline();
  const metadata = assertCargoBoundary();
  assertDependencyPins(metadata);
  assertCAbiUnchanged(metadata);
  assertNoProductionBridge();
  assertToolchainAndGateWiring();
  console.log(
    "[runtime-asset-resolver] passed (schema/AJV parity, Rust boundary, dependency metadata, exact C ABI non-expansion)",
  );
} catch (error) {
  console.error("[runtime-asset-resolver] failed:");
  console.error(`- ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

function assertSchemaAndParityCorpus() {
  const actualResolverFiles = walkInventoryFiles(resolve(resolverRoot))
    .map((filePath) =>
      path.relative(resolve(resolverRoot), filePath).replaceAll("\\", "/"),
    )
    .sort();
  if (JSON.stringify(actualResolverFiles) !== JSON.stringify(expectedResolverFiles)) {
    throw new Error(
      `resolver source/fixture inventory drifted\nexpected=${JSON.stringify(expectedResolverFiles)}\nactual=${JSON.stringify(actualResolverFiles)}`,
    );
  }

  const schemaBytes = assertFilePin(
    schemaPath,
    approvedSchema.bytes,
    approvedSchema.sha256,
  );
  const schema = JSON.parse(schemaBytes.toString("utf8"));
  if (
    schema.$schema !== approvedSchema.dialect ||
    schema.$id !== approvedSchema.id ||
    schema["x-vivi-status"] !== approvedSchema.status
  ) {
    throw new Error("approved Asset Model schema identity/status drifted");
  }
  if (!schema.$defs?.AssetChunkManifestV1) {
    throw new Error("approved Asset Model schema is missing AssetChunkManifestV1");
  }

  const localNormativePath = resolve(localNormativeSchemaPath);
  if (existsSync(localNormativePath)) {
    const localNormativeBytes = readFileSync(localNormativePath);
    if (!localNormativeBytes.equals(schemaBytes)) {
      throw new Error(
        "crate schema copy differs byte-for-byte from the local normative copy",
      );
    }
  }

  for (const [relativePath, bytes, sha256] of pinnedFiles) {
    assertFilePin(relativePath, bytes, sha256);
  }

  const fixture = readJson(parityFixturePath);
  if (fixture.schema !== "vivi2d.assetResolver.schemaStage1Parity.v1") {
    throw new Error("unexpected schema Stage 1 parity fixture identity");
  }
  if (!fixture.baseValue || typeof fixture.baseValue !== "object") {
    throw new Error("schema Stage 1 parity fixture is missing baseValue");
  }
  const actualVectorIds = fixture.vectors?.map((vector) => vector.id).sort();
  if (
    !Array.isArray(fixture.vectors) ||
    JSON.stringify(actualVectorIds) !== JSON.stringify(expectedStage1VectorIds)
  ) {
    throw new Error("schema Stage 1 parity exact vector ID set drifted");
  }

  const wrapper = {
    $schema: approvedSchema.dialect,
    $defs: schema.$defs,
    $ref: "#/$defs/AssetChunkManifestV1",
  };
  const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
  const validateStage1 = ajv.compile(wrapper);
  for (const vector of fixture.vectors) {
    if (typeof vector.stage1Accepted !== "boolean") {
      throw new Error(`${vector.id}: stage1Accepted must be boolean`);
    }
    if (typeof vector.stage2Accepted !== "boolean") {
      throw new Error(`${vector.id}: stage2Accepted must be boolean`);
    }
    const value = materializeParityVector(fixture.baseValue, vector);
    const accepted = validateStage1(value);
    if (accepted !== vector.stage1Accepted) {
      throw new Error(
        `${vector.id}: AJV 2020-12 Stage 1 parity drifted (${ajv.errorsText(validateStage1.errors)})`,
      );
    }
  }

  const rawVectors = fixture.rawParserVectors;
  if (!Array.isArray(rawVectors)) {
    throw new Error("raw duplicate parser vector list is missing");
  }
  const actualRawVectorIds = rawVectors.map((vector) => vector.id).sort();
  if (JSON.stringify(actualRawVectorIds) !== JSON.stringify(expectedRawParserVectorIds)) {
    throw new Error("raw duplicate parser exact vector ID set drifted");
  }
  const escapedNested = rawVectors.find(
    (vector) => vector.id === "escaped-nested-duplicate-rejected-before-stage1",
  );
  if (
    escapedNested?.parseAccepted !== false ||
    !escapedNested.rawJson?.includes("\\u0073ha256")
  ) {
    throw new Error("escaped duplicate-key raw parser evidence drifted");
  }
  for (const vector of rawVectors) {
    if (
      typeof vector.id !== "string" ||
      typeof vector.rawJson !== "string" ||
      vector.parseAccepted !== false
    ) {
      throw new Error("raw duplicate parser vectors must be named rejected JSON strings");
    }
    JSON.parse(vector.rawJson);
  }
}

function assertManifestPipeline() {
  const manifestSource = readText(manifestSourcePath);
  const pipelineStart = manifestSource.indexOf("pub fn parse_chunk_manifest");
  const pipelineEnd = manifestSource.indexOf(
    "pub fn validate_exact_closure",
    pipelineStart,
  );
  if (pipelineStart < 0 || pipelineEnd < 0) {
    throw new Error("parse_chunk_manifest pipeline boundaries are missing");
  }
  const pipeline = manifestSource.slice(pipelineStart, pipelineEnd);
  assertOrdered(pipeline, [
    "parse_duplicate_aware(text)?",
    "schema_equivalent::validate_asset_chunk_manifest_v1(raw_value)?",
    "validate_stage2(stage1)",
  ]);

  for (const evidence of [
    "DeserializeSeed",
    "MapAccess",
    "while let Some(key) = map.next_key::<String>()?",
    "values.contains_key(&key)",
    "duplicate JSON object member",
  ]) {
    if (!manifestSource.includes(evidence)) {
      throw new Error(`duplicate-aware raw parser evidence is missing: ${evidence}`);
    }
  }
  if (
    !manifestSource.includes('include_bytes!("../schema/asset-model-v1.schema.json")') ||
    !manifestSource.includes(approvedSchema.sha256)
  ) {
    throw new Error("Rust schema bytes/hash binding drifted");
  }

  const equivalentSource = readText(schemaEquivalentPath);
  for (const evidence of [
    approvedSchema.sha256,
    "validate_asset_chunk_manifest_v1",
    "expect_closed_object",
    "MAX_SAFE_INTEGER",
    "media_type.chars().count()",
    "not presented as generator output",
  ]) {
    if (!equivalentSource.includes(evidence)) {
      throw new Error(`Schema 2020-12 equivalent evidence is missing: ${evidence}`);
    }
  }
  if (existsSync(resolve(`${resolverRoot}/src/manifest/schema_generated.rs`))) {
    throw new Error("obsolete generated-validator claim/path must remain absent");
  }

  const testsPath = `${resolverRoot}/src/tests.rs`;
  if (!existsSync(resolve(testsPath))) {
    throw new Error("resolver Rust tests are missing");
  }
  const tests = readText(testsPath);
  const rustTestCount = [...tests.matchAll(/#\[test\]\s*fn\s+[A-Za-z0-9_]+\s*\(/g)]
    .length;
  if (rustTestCount < 26) {
    throw new Error(`resolver Rust test floor drifted: ${rustTestCount} < 26`);
  }
  for (const testName of requiredRustTestNames) {
    const declaration = new RegExp(`#\\[test\\]\\s*fn\\s+${testName}\\s*\\(`);
    if (!declaration.test(tests)) {
      throw new Error(`required resolver Rust test is missing: ${testName}`);
    }
  }
  for (const fixtureName of [
    "schema-stage1-parity.json",
    "asset-model-v1-resolver.json",
  ]) {
    if (!tests.includes(fixtureName)) {
      throw new Error(`Rust tests do not consume shared fixture ${fixtureName}`);
    }
  }
}

function assertCargoBoundary() {
  const workspaceManifest = readText(nativeManifestPath);
  if (!workspaceManifest.includes('"crates/vivi-asset-resolver"')) {
    throw new Error("runtime-native workspace omits vivi-asset-resolver");
  }
  if (
    !/^rust-version = "1\.89"$/m.test(workspaceManifest) ||
    !/^edition = "2024"$/m.test(workspaceManifest)
  ) {
    throw new Error("runtime-native workspace must pin Rust 1.89 / edition 2024");
  }

  const metadata = readCargoMetadata();
  const resolverPackage = metadata.packages.find(
    (pkg) => pkg.name === "vivi-asset-resolver",
  );
  if (!resolverPackage) throw new Error("cargo metadata omitted vivi-asset-resolver");
  if (
    resolverPackage.version !== "0.1.0" ||
    resolverPackage.edition !== "2024" ||
    resolverPackage.rust_version !== "1.89" ||
    resolverPackage.license !== "Apache-2.0" ||
    JSON.stringify(resolverPackage.publish) !== "[]" ||
    JSON.stringify(resolverPackage.features) !== "{}" ||
    path.resolve(resolverPackage.manifest_path) !== resolve(resolverManifestPath)
  ) {
    throw new Error(
      "resolver identity, license, Rust version, feature surface, or publish=false drifted",
    );
  }
  const libraryTargets = resolverPackage.targets.filter((target) =>
    target.kind.includes("lib"),
  );
  if (
    libraryTargets.length !== 1 ||
    libraryTargets[0].name !== "vivi_asset_resolver" ||
    JSON.stringify(libraryTargets[0].crate_types) !== JSON.stringify(["lib"])
  ) {
    throw new Error(
      "resolver must remain a Rust-only rlib with no native export artifact",
    );
  }

  const expectedDirect = [
    directDependency("base64", "^0.22", "dev", true, []),
    directDependency("serde", "^1.0", "normal", false, []),
    directDependency("serde_json", "^1.0", "normal", false, ["std"]),
    directDependency("sha2", "^0.10", "normal", false, []),
    directDependency("vivi-png-ref", "*", "normal", true, [], "path"),
  ];
  const actualDirect = resolverPackage.dependencies
    .map((dependency) => ({
      name: dependency.name,
      req: dependency.req,
      kind: dependency.kind ?? "normal",
      usesDefaultFeatures: dependency.uses_default_features,
      features: [...dependency.features].sort(),
      sourceKind: dependency.source === null ? "path" : "registry",
      optional: dependency.optional,
    }))
    .sort(compareDirectDependencies);
  if (
    JSON.stringify(actualDirect) !==
    JSON.stringify([...expectedDirect].sort(compareDirectDependencies))
  ) {
    throw new Error(
      `resolver direct dependency/default-feature isolation drifted\nactual=${JSON.stringify(actualDirect, null, 2)}`,
    );
  }

  const resolverNode = metadata.resolve.nodes.find(
    (node) => node.id === resolverPackage.id,
  );
  if (!resolverNode || JSON.stringify(resolverNode.features) !== "[]") {
    throw new Error("resolver resolved feature surface must remain empty");
  }

  const resolverConsumers = metadata.packages
    .filter((pkg) =>
      pkg.dependencies.some((dependency) => dependency.name === "vivi-asset-resolver"),
    )
    .map((pkg) => pkg.name)
    .sort();
  if (
    JSON.stringify(resolverConsumers) !==
    JSON.stringify(["vivi-asset-host-local", "vivi-asset-store-local"])
  ) {
    throw new Error(
      `resolver production consumer isolation drifted: ${resolverConsumers.join(", ")}`,
    );
  }
  const pngConsumers = metadata.packages
    .filter((pkg) =>
      pkg.dependencies.some((dependency) => dependency.name === "vivi-png-ref"),
    )
    .map((pkg) => pkg.name)
    .sort();
  if (
    JSON.stringify(pngConsumers) !==
    JSON.stringify(["vivi-asset-resolver", "vivi-runtime-native-c-abi"])
  ) {
    throw new Error(
      `vivi-png-ref consumer isolation drifted: ${pngConsumers.join(", ")}`,
    );
  }
  return metadata;
}

function assertDependencyPins(metadata) {
  const packages = new Map(metadata.packages.map((pkg) => [pkg.id, pkg]));
  const nodes = new Map(metadata.resolve.nodes.map((node) => [node.id, node]));
  const resolverPackage = metadata.packages.find(
    (pkg) => pkg.name === "vivi-asset-resolver",
  );
  const productionClosure = new Set();
  visitDependency(resolverPackage.id, nodes, productionClosure, new Set([null, "build"]));
  const devClosure = new Set();
  for (const dependencyEdge of nodes.get(resolverPackage.id)?.deps ?? []) {
    if (dependencyEdge.dep_kinds.some((kind) => kind.kind === "dev")) {
      visitDependency(dependencyEdge.pkg, nodes, devClosure, new Set([null, "build"]));
    }
  }
  for (const productionId of productionClosure) devClosure.delete(productionId);

  const lockPackages = readCargoLockPackages();
  const actualProduction = dependencyInventory(productionClosure, packages, lockPackages);
  const actualDev = dependencyInventory(devClosure, packages, lockPackages);
  assertDependencyInventory(
    actualProduction,
    expectedResolvedClosure,
    "resolver workspace-resolved production/build",
  );
  assertDependencyInventory(actualDev, expectedDevClosure, "resolver dev-only");
}

function assertCAbiUnchanged(metadata) {
  for (const [relativePath, expectedHash] of cAbiHeaderPins) {
    const bytes = readFileSync(resolve(relativePath));
    if (sha256(bytes) !== expectedHash) {
      throw new Error(`${relativePath}: frozen C ABI header hash drifted`);
    }
  }
  const source = readText(cAbiSourcePath);
  const exports = [
    ...source.matchAll(/pub\s+extern\s+"C"\s+fn\s+(vivi_[A-Za-z0-9_]+)\s*\(/g),
  ].map((match) => match[1]);
  if (new Set(exports).size !== exports.length) {
    throw new Error("C ABI source contains duplicate exported function definitions");
  }
  if (JSON.stringify([...exports].sort()) !== JSON.stringify(expectedCAbiExports)) {
    throw new Error(
      `C ABI source export set drifted: ${JSON.stringify([...exports].sort())}`,
    );
  }
  if (source.includes("vivi_model_load_evaluation")) {
    throw new Error(
      "editor-only model loader must remain outside the C ABI implementation",
    );
  }

  const cAbiPackage = metadata.packages.find(
    (pkg) => pkg.name === "vivi-runtime-native-c-abi",
  );
  if (
    !cAbiPackage ||
    cAbiPackage.dependencies.some(
      (dependency) => dependency.name === "vivi-asset-resolver",
    )
  ) {
    throw new Error("C ABI crate must not depend on the asset resolver foundation");
  }
}

function assertNoProductionBridge() {
  const manifest = readText(resolverManifestPath);
  if (/^build\s*=|^\[build-dependencies\]|crate-type/m.test(manifest)) {
    throw new Error(
      "resolver must not add build scripts, build dependencies, or native crate types",
    );
  }
  const rustSources = walkFiles(resolve(`${resolverRoot}/src`)).filter((filePath) =>
    filePath.endsWith(".rs"),
  );
  const productionSource = rustSources
    .map((filePath) => readFileSync(filePath, "utf8"))
    .join("\n");
  const forbiddenPatterns = [
    [/\bextern\s+"C"/, "C ABI export"],
    [/\b(?:no_mangle|export_name)\b/, "native symbol attribute"],
    [/\bunsafe\s*(?:\{|fn|impl|trait)\b/, "unsafe Rust"],
    [/\bstd::process\b|\bCommand::new\b/, "subprocess/dynamic tool invocation"],
    [/\b(?:libloading|dlopen|LoadLibrary)\b/, "dynamic library loading"],
    [/\bOUT_DIR\b|\binclude!\s*\(/, "build-time generated source inclusion"],
    [/\bstd::(?:fs|net)\b/, "filesystem/network adapter"],
    [/vivi\.cap\.referencedAssets/, "capability advertisement"],
  ];
  for (const [pattern, label] of forbiddenPatterns) {
    if (pattern.test(productionSource)) {
      throw new Error(`resolver foundation contains forbidden ${label}`);
    }
  }
  if (existsSync(resolve(`${resolverRoot}/build.rs`))) {
    throw new Error("resolver foundation must not use a build.rs code generator");
  }

  for (const boundaryRoot of ["packages/editor-host", "electron", "src"]) {
    for (const filePath of walkFiles(resolve(boundaryRoot))) {
      if (!/\.(?:[cm]?[jt]sx?|json)$/i.test(filePath)) continue;
      const text = readFileSync(filePath, "utf8");
      if (/vivi[-_]asset[-_]resolver/i.test(text)) {
        throw new Error(
          `${toRelative(filePath)} wires the resolver before its bridge slice`,
        );
      }
    }
  }
}

function assertToolchainAndGateWiring() {
  const runtimePackage = readJson("packages/runtime-native/package.json");
  const defaultScript = runtimePackage.scripts?.["check:asset-resolver"] ?? "";
  const wasmScript = runtimePackage.scripts?.["check:asset-resolver:wasm32"] ?? "";
  for (const [script, evidence] of [
    [defaultScript, "cargo test"],
    [defaultScript, "--locked"],
    [defaultScript, "cargo clippy"],
    [wasmScript, "cargo test"],
    [wasmScript, "--locked"],
    [wasmScript, "--target wasm32-unknown-unknown"],
    [wasmScript, "--no-run"],
    [wasmScript, "cargo clippy"],
  ]) {
    if (!script.includes(evidence)) {
      throw new Error(`resolver test/Clippy script is missing ${evidence}`);
    }
  }

  const workflow = readText(".github/workflows/runtime-native.yml");
  for (const evidence of [
    "RUSTUP_TOOLCHAIN: 1.89.0",
    "rustup toolchain install 1.89.0",
    "npm run check:runtime-asset-resolver",
    "npm run check:asset-resolver:wasm32 --workspace @vivi2d/runtime-native",
  ]) {
    if (!workflow.includes(evidence)) {
      throw new Error(`runtime-native workflow is missing ${evidence}`);
    }
  }
  for (const [label, pattern] of [
    [
      "clean native target",
      /CARGO_TARGET_DIR:\s+\$\{\{\s*runner\.temp\s*\}\}\/vivi-asset-resolver-native/,
    ],
    [
      "clean wasm32 target",
      /CARGO_TARGET_DIR:\s+\$\{\{\s*runner\.temp\s*\}\}\/vivi-asset-resolver-wasm32/,
    ],
  ]) {
    if (!pattern.test(workflow)) {
      throw new Error(`runtime-native workflow is missing ${label}`);
    }
  }
}

function materializeParityVector(baseValue, vector) {
  const hasValue = Object.hasOwn(vector, "value");
  const hasRawJson = typeof vector.rawJson === "string";
  const hasMutations = Array.isArray(vector.mutations);
  if (Number(hasValue) + Number(hasRawJson) + Number(hasMutations) !== 1) {
    throw new Error(`${vector.id}: define exactly one of value, rawJson, or mutations`);
  }
  if (hasRawJson) return JSON.parse(vector.rawJson);
  if (hasValue) return vector.value;

  const value = JSON.parse(JSON.stringify(baseValue));
  for (const mutation of vector.mutations) {
    applyParityMutation(value, mutation, vector.id);
  }
  return value;
}

function applyParityMutation(value, mutation, vectorId) {
  if (mutation?.op === "resizeChunks") {
    const count = mutation.count;
    const sizeBytes = mutation.sizeBytes;
    if (!Number.isSafeInteger(count) || count < 0 || !Number.isSafeInteger(sizeBytes)) {
      throw new Error(`${vectorId}: invalid resizeChunks mutation`);
    }
    value.chunks = Array.from({ length: count }, () => ({
      sha256: "0".repeat(64),
      sizeBytes,
    }));
    return;
  }
  if (!/^(?:set|remove)$/.test(mutation?.op) || typeof mutation.pointer !== "string") {
    throw new Error(`${vectorId}: unsupported parity mutation`);
  }
  const segments = mutation.pointer
    .split("/")
    .slice(1)
    .map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"));
  if (
    !mutation.pointer.startsWith("/") ||
    segments.length === 0 ||
    segments.some((segment) =>
      ["__proto__", "constructor", "prototype"].includes(segment),
    )
  ) {
    throw new Error(`${vectorId}: unsafe or invalid JSON pointer mutation`);
  }
  let parent = value;
  for (const segment of segments.slice(0, -1)) {
    const key = Array.isArray(parent)
      ? parseArrayIndex(segment, parent.length, vectorId)
      : segment;
    if (parent === null || typeof parent !== "object" || !Object.hasOwn(parent, key)) {
      throw new Error(`${vectorId}: mutation parent does not exist`);
    }
    parent = parent[key];
  }
  const finalSegment = segments.at(-1);
  const key = Array.isArray(parent)
    ? parseArrayIndex(finalSegment, parent.length, vectorId)
    : finalSegment;
  if (parent === null || typeof parent !== "object") {
    throw new Error(`${vectorId}: mutation parent is not a container`);
  }
  if (mutation.op === "set") {
    if (!Object.hasOwn(mutation, "value")) {
      throw new Error(`${vectorId}: set mutation is missing value`);
    }
    parent[key] = mutation.value;
  } else {
    if (!Object.hasOwn(parent, key)) {
      throw new Error(`${vectorId}: remove mutation target does not exist`);
    }
    if (Array.isArray(parent)) parent.splice(key, 1);
    else delete parent[key];
  }
}

function parseArrayIndex(segment, length, vectorId) {
  if (!/^(?:0|[1-9][0-9]*)$/.test(segment)) {
    throw new Error(`${vectorId}: invalid array index in JSON pointer`);
  }
  const index = Number(segment);
  if (!Number.isSafeInteger(index) || index >= length) {
    throw new Error(`${vectorId}: array index is outside the mutation target`);
  }
  return index;
}

function registryDependency(name, version, license, checksum) {
  return {
    name,
    version,
    license,
    source: "registry+https://github.com/rust-lang/crates.io-index",
    checksum,
  };
}

function workspaceDependency(name) {
  return {
    name,
    version: "0.1.0",
    license: "Apache-2.0",
    source: null,
    checksum: null,
  };
}

function directDependency(
  name,
  req,
  kind,
  usesDefaultFeatures,
  features,
  sourceKind = "registry",
) {
  return {
    name,
    req,
    kind,
    usesDefaultFeatures,
    features,
    sourceKind,
    optional: false,
  };
}

function readCargoMetadata() {
  return JSON.parse(
    runCapture("cargo", [
      "metadata",
      "--locked",
      "--format-version=1",
      "--manifest-path",
      resolve(nativeManifestPath),
      "--no-default-features",
    ]),
  );
}

function visitDependency(id, nodes, closure, followedKinds) {
  if (closure.has(id)) return;
  closure.add(id);
  for (const dependencyEdge of nodes.get(id)?.deps ?? []) {
    if (dependencyEdge.dep_kinds.some((kind) => followedKinds.has(kind.kind))) {
      visitDependency(dependencyEdge.pkg, nodes, closure, followedKinds);
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

function assertDependencyInventory(actual, expectedInventory, label) {
  const expected = [...expectedInventory].sort(compareDependencies);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${label} dependency/license/checksum closure drifted\nexpected=${JSON.stringify(expected, null, 2)}\nactual=${JSON.stringify(actual, null, 2)}`,
    );
  }
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

function assertFilePin(relativePath, expectedBytes, expectedSha256) {
  const bytes = readFileSync(resolve(relativePath));
  const actualSha256 = sha256(bytes);
  if (bytes.length !== expectedBytes || actualSha256 !== expectedSha256) {
    throw new Error(
      `${relativePath}: expected ${expectedBytes} bytes/${expectedSha256}, found ${bytes.length}/${actualSha256}`,
    );
  }
  return bytes;
}

function assertOrdered(text, needles) {
  let previous = -1;
  for (const needle of needles) {
    const index = text.indexOf(needle);
    if (index <= previous) {
      throw new Error(`required ordered pipeline evidence is missing: ${needle}`);
    }
    previous = index;
  }
}

function walkFiles(directory) {
  if (!existsSync(directory)) return [];
  const result = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...walkFiles(filePath));
    else if (entry.isFile() && statSync(filePath).size <= 8 * 1024 * 1024)
      result.push(filePath);
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

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function compareDependencies(left, right) {
  return left.name.localeCompare(right.name) || left.version.localeCompare(right.version);
}

function compareDirectDependencies(left, right) {
  return left.name.localeCompare(right.name) || left.kind.localeCompare(right.kind);
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
