import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";

const root = process.cwd();
const nativeManifestPath = "packages/runtime-native/Cargo.toml";
const evaluationRoot = "packages/runtime-native/crates/vivi-runtime-native-evaluation";
const evaluationManifestPath = `${evaluationRoot}/Cargo.toml`;
const evaluationSchemaPath = `${evaluationRoot}/schema/evaluation-payload-v1.schema.json`;
const modelSchemaPath =
  "packages/model/src/evaluation-payload-v1/evaluation-payload-v1.schema.json";
const generatedValidatorPath =
  "packages/model/src/internal/generated/evaluation-v1-validators.mjs";
const evaluationFixturePath = `${evaluationRoot}/fixtures/evaluation-payload-v1.json`;
const stage1ParityPath = `${evaluationRoot}/fixtures/schema-stage1-parity.json`;

const approvedSchema = {
  bytes: 33_961,
  sha256: "8d65b5ddea137a71894e57ba6e14c94576aad63b2b7586728fa2bcca5bb125a3",
  dialect: "https://json-schema.org/draft/2020-12/schema",
  id: "https://vivi2d.com/spec/evaluation-payload-v1.schema.json",
  status: "approved-amendment-1",
  title: "Vivi2D Evaluation Payload v1",
};

const approvedFixture = {
  bytes: 9_313,
  sha256: "18e20e6ea57d92779dbce35b0be29b6902ec31ee4c659b4c7e0794c45cbe4a53",
};

const approvedStage1Parity = {
  bytes: 13_097,
  sha256: "c2fbfe959b7d7a814409e33f7257bc458303d6d80ea8226605fae3f958d4f92c",
  schema: "vivi2d.nativeEvaluationStage1Parity.v1",
  base: "evaluation-payload-v1.json#/valid/expectedPayload",
};

const stage1ParityVectorIds = [
  "baseline-valid",
  "required-root-reject",
  "required-nested-reject",
  "closed-root-reject",
  "closed-nested-reject",
  "type-reject",
  "type-union-null-accept",
  "any-of-null-accept",
  "any-of-neither-reject",
  "const-reject",
  "enum-reject",
  "pattern-simple-accept",
  "pattern-simple-reject",
  "pattern-simple-empty-reject",
  "pattern-source-120-accept",
  "pattern-source-121-reject",
  "pattern-parameter-dot-accept",
  "pattern-parameter-reject",
  "pattern-simple-128-accept",
  "pattern-simple-129-reject",
  "pattern-parameter-128-accept",
  "pattern-parameter-129-reject",
  "minimum-boundary-accept",
  "minimum-reject",
  "maximum-boundary-accept",
  "maximum-reject",
  "exclusive-minimum-accept",
  "exclusive-minimum-reject",
  "integer-dot-zero-accept",
  "integer-fraction-reject",
  "min-items-reject",
  "items-type-reject",
  "prefix-items-accept",
  "prefix-items-type-reject",
  "max-items-items-false-reject",
  "max-items-atlases-33-reject",
  "one-of-not-any-of-reject",
  "not-mask-exclusive-reject",
  "unique-items-reject",
  "contains-min-accept",
  "contains-min-reject",
  "pattern-properties-accept",
  "pattern-properties-additional-reject",
  "recursive-ref-accept",
  "recursive-ref-reject",
  "duplicate-layer-id",
  "duplicate-parameter-id",
  "duplicate-binding-id",
  "duplicate-ik-controller-id",
  "duplicate-physics-group-id",
  "duplicate-collider-id",
  "duplicate-expression-preset-id",
  "duplicate-clip-id",
  "duplicate-state-machine-id",
  "duplicate-clip-mask-layer-id",
  "duplicate-state-id",
  "duplicate-transition-id",
  "duplicate-atlas-id",
  "duplicate-atlas-entry-layer-id",
];

const stage1RawVectorIds = [
  "raw-integer-dot-zero-accept",
  "raw-unconstrained-safe-boundary-rounding-accept",
  "raw-safe-integer-boundary-rounding-reject",
  "raw-safe-integer-maximum-accept",
];

const stage1UniqueByVectorIds = [
  "duplicate-atlas-entry-layer-id",
  "duplicate-atlas-id",
  "duplicate-binding-id",
  "duplicate-clip-id",
  "duplicate-clip-mask-layer-id",
  "duplicate-collider-id",
  "duplicate-expression-preset-id",
  "duplicate-ik-controller-id",
  "duplicate-layer-id",
  "duplicate-parameter-id",
  "duplicate-physics-group-id",
  "duplicate-state-id",
  "duplicate-state-machine-id",
  "duplicate-transition-id",
].sort();

const stage1MutationVectorIds = [
  "any-of-neither-reject",
  "any-of-null-accept",
  "max-items-atlases-33-reject",
  "pattern-parameter-128-accept",
  "pattern-parameter-129-reject",
  "pattern-simple-128-accept",
  "pattern-simple-129-reject",
  ...stage1UniqueByVectorIds,
].sort();

const expectedStage1KeywordInventory = [
  "$ref",
  "additionalProperties",
  "anyOf",
  "const",
  "contains",
  "enum",
  "exclusiveMinimum",
  "items",
  "maxItems",
  "maximum",
  "minContains",
  "minItems",
  "minimum",
  "not",
  "oneOf",
  "pattern",
  "patternProperties",
  "prefixItems",
  "properties",
  "required",
  "type",
  "uniqueItems",
].sort();

const expectedStage1CoverageByKeyword = {
  $ref: ["recursive-ref-accept", "recursive-ref-reject"],
  additionalProperties: [
    "closed-root-reject",
    "closed-nested-reject",
    "pattern-properties-accept",
    "pattern-properties-additional-reject",
  ],
  anyOf: ["any-of-null-accept", "any-of-neither-reject", "one-of-not-any-of-reject"],
  const: ["const-reject", "contains-min-accept", "contains-min-reject"],
  contains: ["contains-min-accept", "contains-min-reject"],
  enum: ["enum-reject"],
  exclusiveMinimum: ["exclusive-minimum-accept", "exclusive-minimum-reject"],
  items: [
    "items-type-reject",
    "prefix-items-type-reject",
    "max-items-items-false-reject",
  ],
  maxItems: [
    "prefix-items-accept",
    "max-items-items-false-reject",
    "max-items-atlases-33-reject",
  ],
  maximum: ["maximum-boundary-accept", "maximum-reject"],
  minContains: ["contains-min-accept", "contains-min-reject"],
  minItems: ["baseline-valid", "min-items-reject", "prefix-items-accept"],
  minimum: ["minimum-boundary-accept", "minimum-reject"],
  not: ["one-of-not-any-of-reject", "not-mask-exclusive-reject"],
  oneOf: ["one-of-not-any-of-reject"],
  pattern: [
    "pattern-simple-accept",
    "pattern-simple-reject",
    "pattern-simple-empty-reject",
    "pattern-simple-128-accept",
    "pattern-simple-129-reject",
    "pattern-source-120-accept",
    "pattern-source-121-reject",
    "pattern-parameter-dot-accept",
    "pattern-parameter-reject",
    "pattern-parameter-128-accept",
    "pattern-parameter-129-reject",
  ],
  patternProperties: [
    "pattern-properties-accept",
    "pattern-properties-additional-reject",
  ],
  prefixItems: [
    "prefix-items-accept",
    "prefix-items-type-reject",
    "max-items-items-false-reject",
  ],
  properties: ["baseline-valid", "closed-root-reject", "closed-nested-reject"],
  required: ["required-root-reject", "required-nested-reject", "recursive-ref-reject"],
  type: [
    "type-reject",
    "type-union-null-accept",
    "any-of-neither-reject",
    "integer-dot-zero-accept",
    "integer-fraction-reject",
  ],
  uniqueItems: ["unique-items-reject"],
};

const expectedStage1BoundaryCoverage = {
  "approved-reachable-anyOf/oneOf/not": [
    "any-of-null-accept",
    "any-of-neither-reject",
    "one-of-not-any-of-reject",
    "not-mask-exclusive-reject",
  ],
  "closed-additional-nested": ["closed-nested-reject"],
  "closed-additional-root": ["closed-root-reject"],
  "contains/minContains": ["contains-min-accept", "contains-min-reject"],
  "integer-fraction": ["integer-fraction-reject"],
  "integer-mathematical-dot-zero": [
    "integer-dot-zero-accept",
    "raw-integer-dot-zero-accept",
  ],
  "items-schema": ["items-type-reject"],
  "items-false-redundant-with-AffineMatrix-maxItems": ["max-items-items-false-reject"],
  "maximum-boundary": ["maximum-boundary-accept", "maximum-reject"],
  "maxItems-boundary": [
    "prefix-items-accept",
    "max-items-items-false-reject",
    "max-items-atlases-33-reject",
  ],
  "minimum-boundary": ["minimum-boundary-accept", "minimum-reject"],
  "minItems-boundary": ["baseline-valid", "min-items-reject"],
  "pattern-parameter-id": [
    "pattern-parameter-dot-accept",
    "pattern-parameter-reject",
    "pattern-parameter-128-accept",
    "pattern-parameter-129-reject",
  ],
  "pattern-shared-minimum-length": ["pattern-simple-empty-reject"],
  "pattern-simple-id": [
    "pattern-simple-accept",
    "pattern-simple-reject",
    "pattern-simple-128-accept",
    "pattern-simple-129-reject",
  ],
  "pattern-source-atlas-id": ["pattern-source-120-accept", "pattern-source-121-reject"],
  "patternProperties-value-schema/closed-additional": [
    "pattern-properties-accept",
    "pattern-properties-additional-reject",
  ],
  "prefixItems-boundary": ["prefix-items-accept", "prefix-items-type-reject"],
  "recursive-$ref": ["recursive-ref-accept", "recursive-ref-reject"],
  "required-nested": ["required-nested-reject"],
  "required-root": ["required-root-reject"],
  "safe-boundary-binary64-rounding": [
    "raw-unconstrained-safe-boundary-rounding-accept",
    "raw-safe-integer-boundary-rounding-reject",
    "raw-safe-integer-maximum-accept",
  ],
  "type/const/enum": ["type-reject", "const-reject", "enum-reject"],
  uniqueItems: ["unique-items-reject"],
  "x-vivi-uniqueBy-annotation": stage1UniqueByVectorIds,
};

const expectedEvaluationFiles = [
  "Cargo.toml",
  "fixtures/evaluation-payload-v1.json",
  "fixtures/schema-stage1-parity.json",
  "schema/evaluation-payload-v1.schema.json",
  "src/error.rs",
  "src/lib.rs",
  "src/schema_equivalent.rs",
  "src/semantic.rs",
  "src/tests.rs",
  "src/transport.rs",
].sort();

const pinnedEvaluationFiles = [
  ["Cargo.toml", 435, "ebca7136f1e4926797c46c376ce90e9ce1e7cd91135314be4e42217c8914d23e"],
  ["fixtures/evaluation-payload-v1.json", approvedFixture.bytes, approvedFixture.sha256],
  [
    "fixtures/schema-stage1-parity.json",
    approvedStage1Parity.bytes,
    approvedStage1Parity.sha256,
  ],
  [
    "schema/evaluation-payload-v1.schema.json",
    approvedSchema.bytes,
    approvedSchema.sha256,
  ],
  [
    "src/error.rs",
    3_163,
    "c31c5e7ca87a9681720cd994543c3697b6fe59085392055cc534b1965d9ff4d1",
  ],
  [
    "src/lib.rs",
    5_362,
    "be45456abab790291b8e72c5b5ddb1d8c15c5c77d19efc8f0676a3f1649ab21e",
  ],
  [
    "src/schema_equivalent.rs",
    14_429,
    "e41b2be269274c0c3b98efee6d5d05752fd87ae28f40d059d50ec0f592fdddab",
  ],
  [
    "src/semantic.rs",
    32_502,
    "9473f3a0510a610050e915e8cdb13bc106a0daafe0120547de4cd1fa3c00cc3d",
  ],
  [
    "src/tests.rs",
    55_080,
    "c23e82227d127eeb6287271f7e61434833097c6b6991e31b158b7f92dc3863b9",
  ],
  [
    "src/transport.rs",
    14_253,
    "c4b84f27fecc615f3b525c56f697a996c36581c2b375a873c2fa71423b8576b1",
  ],
];

const requiredRustTestNames = [
  "approved_schema_and_fixture_bytes_are_exact_tracked_copies",
  "errors_are_fixed_status_mapped_and_redacted",
  "json_schema_unique_equality_hashes_negative_and_positive_zero_identically",
  "schema_keyword_inventory_and_closed_stage1_are_pinned",
  "stage1_accepts_all_14_x_vivi_unique_by_duplicates_then_stage2_rejects",
  "stage2_all_reference_families_are_checked_before_unsupported_classification",
  "stage2_atlas_mesh_exact_coverage_bounds_aggregate_and_binding_order_are_fixed",
  "stage2_binding_points_and_recursive_layer_global_boundaries_are_fixed",
  "stage2_bone_parent_missing_cycle_and_global_1024_boundary_are_fixed",
  "stage2_mask_cycle_depth_eight_nine_shared_dag_and_invert_are_fixed",
  "stage2_mesh_global_1024_1025_boundary_is_fixed",
  "stage2_mesh_shape_indices_and_wasm_large_index_class_are_fixed",
  "stage2_nonempty_clip_and_state_machine_unsupported_order_is_fixed",
  "stage2_opaque_domain_map_keys_remain_identifiers_not_structural_markers",
  "stage2_parameter_range_self_pair_and_physics_pendulum_index_are_fixed",
  "stage2_preserves_all_finite_binary64_and_all_13_blend_modes_without_lowering",
  "stage2_rejects_all_eight_tracked_incomplete_payload_vectors",
  "stage2_single_mesh_max_vertices_and_indices_shape_is_accepted",
  "stage2_skin_parity_sparse_bind_pose_weights_and_duplicate_lipsync_ids_are_fixed",
  "tracked_raw_number_lexemes_match_binary64_stage1_semantics",
  "tracked_stage1_keyword_boundary_parity_corpus_matches_rust_validator",
  "transport_depth_token_and_decoded_string_boundaries_match_ts_codec",
  "transport_exact_punctuation_key_and_scalar_token_table_is_fixed",
  "transport_numbers_are_finite_binary64_and_negative_zero_is_canonical",
  "transport_order_utf8_bom_duplicates_and_strict_json_are_fixed",
  "transport_strict_json_malformed_lexeme_table_is_rejected",
  "transport_unicode_surrogate_pair_is_accepted_and_lone_surrogates_are_rejected",
  "valid_fixture_candidate_preserves_generation_inventory_and_redacts_debug",
].sort();

const expectedRegistryClosure = [
  registryDependency(
    "itoa",
    "1.0.18",
    "MIT OR Apache-2.0",
    "8f42a60cbdf9a97f5d2305f08a87dc4e09308d1276d28c869c684d7777685682",
  ),
  registryDependency(
    "memchr",
    "2.8.0",
    "Unlicense OR MIT",
    "f8ca58f447f06ed17d5fc4043ce1b10dd205e060fb3ce5b979b8ed8e59ff3f79",
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
    "syn",
    "2.0.117",
    "MIT OR Apache-2.0",
    "e665b8803e7b1d2a727f4023456bbbbe74da67099c585258af0ad9c5013b9b99",
  ),
  registryDependency(
    "unicode-ident",
    "1.0.24",
    "(MIT OR Apache-2.0) AND Unicode-3.0",
    "e6e4313cd5fcd3dad5cafa179702e2b244f760991f45397d14d4ebf38247da75",
  ),
  registryDependency(
    "zmij",
    "1.0.21",
    "MIT",
    "b8848ee67ecc8aedbaf3e4122217aff892639231befc6a1b58d29fff4c2cabaa",
  ),
].sort(compareDependencies);

const expectedDevRegistryClosure = [
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
    "libc",
    "0.2.189",
    "MIT OR Apache-2.0",
    "3eaf3ede3fee6db1a4c2ee091bf8a8b4dccdc6d17f656fb07896ee72867612f2",
  ),
  registryDependency(
    "sha2",
    "0.10.9",
    "MIT OR Apache-2.0",
    "a7507d819769d01a365ab707794a4084392c824f54a7a6a7862f8c3d0892b283",
  ),
  registryDependency(
    "typenum",
    "1.20.1",
    "MIT OR Apache-2.0",
    "b6f5e870be6c3b371b77fe0ee0bafb859fa4964b4404c27de1d380043c4dda20",
  ),
  registryDependency(
    "version_check",
    "0.9.5",
    "MIT/Apache-2.0",
    "0b928f33d975fc6ad9f86c8f283853ad26bdd5b10b7f1542aa2fa15e2289105a",
  ),
].sort(compareDependencies);

try {
  assertFoundationFilesExist();
  assertApprovedSchemaCopy();
  assertLiveAjvStage1Parity();
  const metadata = assertCargoBoundary();
  assertDependencyClosure(metadata);
  assertConsumerZeroAndBridgeIsolation(metadata);
  assertFoundationSourcePolicy();
  assertGateAndDocumentationWiring();
  runRustdocGate();
  console.log(
    "[runtime-native-evaluation] passed (approved-schema reachable accepted-set parity, sole-preactivation-consumer native+wasm isolation)",
  );
} catch (error) {
  console.error("[runtime-native-evaluation] failed:");
  console.error(`- ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

function assertFoundationFilesExist() {
  for (const requiredPath of [
    evaluationManifestPath,
    evaluationSchemaPath,
    evaluationFixturePath,
    stage1ParityPath,
    `${evaluationRoot}/src/lib.rs`,
  ]) {
    if (!existsSync(resolve(requiredPath))) {
      throw new Error(`Evaluation foundation is missing ${requiredPath}`);
    }
  }

  const inventory = walkInventoryFiles(resolve(evaluationRoot))
    .map(toRelative)
    .map((filePath) => filePath.slice(`${evaluationRoot}/`.length))
    .sort();
  assertExactJson(
    inventory,
    expectedEvaluationFiles,
    "Evaluation foundation exact file inventory",
  );
  const pinnedPaths = pinnedEvaluationFiles.map(([relativePath]) => relativePath).sort();
  assertExactJson(
    pinnedPaths,
    expectedEvaluationFiles,
    "Evaluation foundation exact source-pin coverage",
  );
  for (const [relativePath, bytes, expectedHash] of pinnedEvaluationFiles) {
    const contents = readFileSync(resolve(`${evaluationRoot}/${relativePath}`));
    const actualHash = sha256(contents);
    if (contents.byteLength !== bytes || actualHash !== expectedHash) {
      throw new Error(
        `${evaluationRoot}/${relativePath} exact source pin drifted: ${contents.byteLength}/${actualHash}`,
      );
    }
  }

  const actualTestNames = expectedEvaluationFiles
    .filter((relativePath) => /^src\/.+\.rs$/.test(relativePath))
    .flatMap((relativePath) => [
      ...readText(`${evaluationRoot}/${relativePath}`).matchAll(
        /#\[test\]\s*fn\s+([A-Za-z0-9_]+)\s*\(/g,
      ),
    ])
    .map((match) => match[1])
    .sort();
  assertExactJson(
    actualTestNames,
    requiredRustTestNames,
    "Evaluation foundation exact Rust test inventory",
  );

  const fixtureBytes = readFileSync(resolve(evaluationFixturePath));
  const fixtureHash = sha256(fixtureBytes);
  if (
    fixtureBytes.byteLength !== approvedFixture.bytes ||
    fixtureHash !== approvedFixture.sha256
  ) {
    throw new Error(
      `Evaluation fixture identity drifted: ${fixtureBytes.byteLength}/${fixtureHash}`,
    );
  }

  const parityBytes = readFileSync(resolve(stage1ParityPath));
  const parityHash = sha256(parityBytes);
  if (
    parityBytes.byteLength !== approvedStage1Parity.bytes ||
    parityHash !== approvedStage1Parity.sha256
  ) {
    throw new Error(
      `Evaluation Stage 1 parity identity drifted: ${parityBytes.byteLength}/${parityHash}`,
    );
  }
}

function assertApprovedSchemaCopy() {
  const modelBytes = readFileSync(resolve(modelSchemaPath));
  const evaluationBytes = readFileSync(resolve(evaluationSchemaPath));
  for (const [label, bytes] of [
    ["model", modelBytes],
    ["Evaluation foundation", evaluationBytes],
  ]) {
    const actualHash = sha256(bytes);
    if (
      bytes.byteLength !== approvedSchema.bytes ||
      actualHash !== approvedSchema.sha256
    ) {
      throw new Error(
        label +
          " Evaluation Payload schema identity drifted: " +
          bytes.byteLength +
          "/" +
          actualHash,
      );
    }
  }
  if (!modelBytes.equals(evaluationBytes)) {
    throw new Error(
      "Evaluation foundation schema must remain byte-identical to the approved model schema",
    );
  }

  const schema = JSON.parse(evaluationBytes.toString("utf8"));
  if (
    schema.$schema !== approvedSchema.dialect ||
    schema.$id !== approvedSchema.id ||
    schema.title !== approvedSchema.title ||
    schema["x-vivi-status"] !== approvedSchema.status ||
    schema.type !== "object" ||
    schema.additionalProperties !== false ||
    schema.properties?.schema?.const !== "vivi2d.evaluationPayload.v1"
  ) {
    throw new Error("approved Evaluation Payload schema root identity/status drifted");
  }
  const actualKeywords = collectKeywordInventory(
    schema,
    new Set(expectedStage1KeywordInventory),
  ).sort();
  assertExactJson(
    actualKeywords,
    expectedStage1KeywordInventory,
    "approved Evaluation Payload Stage 1 keyword inventory",
  );
  const actualPatterns = collectKeywordValues(schema, "pattern").sort();
  assertExactJson(
    actualPatterns,
    [
      "^[A-Za-z0-9_.-]{1,128}$",
      "^[A-Za-z0-9_-]{1,120}$",
      "^[A-Za-z0-9_-]{1,128}$",
    ].sort(),
    "approved Evaluation Payload pattern inventory",
  );
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    validateFormats: false,
  });
  ajv.compile(schema);

  const generatedValidator = readText(generatedValidatorPath);
  const expectedIdentity =
    '{"id":"' +
    approvedSchema.id +
    '","status":"' +
    approvedSchema.status +
    '","sha256":"' +
    approvedSchema.sha256 +
    '"}';
  if (!generatedValidator.includes(expectedIdentity)) {
    throw new Error(
      "model standalone Evaluation Payload validator identity is not synchronized",
    );
  }
}

function assertLiveAjvStage1Parity() {
  const schema = readJson(evaluationSchemaPath);
  const actualUniqueByLocations = collectUniqueByLocations(schema).sort();
  const expectedUniqueByLocations = [
    "$/$defs/EvaluationAnimationStateMachineV1/properties/states:id",
    "$/$defs/EvaluationAnimationStateMachineV1/properties/transitions:id",
    "$/$defs/EvaluationAtlasRefV1/properties/entries:layerId",
    "$/$defs/EvaluationLayerNodeV1/properties/clipMasks:layerId",
    "$/properties/atlases:id",
    "$/properties/clips:id",
    "$/properties/colliders:id",
    "$/properties/expressionPresets:id",
    "$/properties/ikControllers:id",
    "$/properties/layers:id",
    "$/properties/parameterBindings:id",
    "$/properties/parameters:id",
    "$/properties/physicsGroups:id",
    "$/properties/stateMachines:id",
  ].sort();
  assertExactJson(
    actualUniqueByLocations,
    expectedUniqueByLocations,
    "Evaluation schema x-vivi-uniqueBy inventory",
  );

  const fixture = readJson(evaluationFixturePath);
  const base = fixture.valid?.expectedPayload;
  if (!base || typeof base !== "object" || Array.isArray(base)) {
    throw new Error("Evaluation fixture omits valid.expectedPayload");
  }

  const corpus = readJson(stage1ParityPath);
  if (
    corpus.schema !== approvedStage1Parity.schema ||
    corpus.base !== approvedStage1Parity.base ||
    !Array.isArray(corpus.vectors) ||
    !Array.isArray(corpus.rawVectors)
  ) {
    throw new Error("Evaluation Stage 1 parity corpus identity/shape drifted");
  }
  assertExactJson(
    corpus.vectors.map((vector) => vector.id),
    stage1ParityVectorIds,
    "Evaluation Stage 1 parity vector inventory",
  );
  assertExactJson(
    corpus.rawVectors.map((vector) => vector.id),
    stage1RawVectorIds,
    "Evaluation Stage 1 raw-number vector inventory",
  );
  const allVectorIds = new Set([...stage1ParityVectorIds, ...stage1RawVectorIds]);
  assertExactJson(
    Object.keys(expectedStage1CoverageByKeyword).sort(),
    expectedStage1KeywordInventory,
    "Evaluation Stage 1 used-keyword coverage inventory",
  );
  for (const [keyword, vectorIds] of Object.entries(expectedStage1CoverageByKeyword)) {
    assertCoverageVectorIds(keyword, vectorIds, allVectorIds);
  }
  for (const [family, vectorIds] of Object.entries(expectedStage1BoundaryCoverage)) {
    assertCoverageVectorIds(family, vectorIds, allVectorIds);
  }

  const mutationVectors = new Map(
    buildStage1MutationVectors(base).map((vector) => [vector.id, vector.value]),
  );
  assertExactJson(
    [...mutationVectors.keys()].sort(),
    stage1MutationVectorIds,
    "live AJV Stage 1 named mutation inventory",
  );
  assertExactJson(
    corpus.vectors
      .filter((vector) => Object.hasOwn(vector, "mutation"))
      .map((vector) => vector.id)
      .sort(),
    stage1MutationVectorIds,
    "shared AJV/Rust Stage 1 named mutation inventory",
  );
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    validateFormats: false,
  });
  const validateStage1 = ajv.compile(schema);
  const corpusUniqueByIds = [];
  for (const vector of corpus.vectors) {
    assertStage1VectorShape(vector);
    const mutation = vector.mutation;
    let value;
    if (mutation === undefined) {
      value = structuredClone(base);
    } else {
      const mutated = mutationVectors.get(mutation);
      if (!mutated || mutation !== vector.id) {
        throw new Error(`${vector.id}: unknown or mismatched parity mutation`);
      }
      value = structuredClone(mutated);
      if (stage1UniqueByVectorIds.includes(vector.id)) {
        corpusUniqueByIds.push(vector.id);
        if (
          vector.expectedStage1 !== true ||
          vector.expectedStage2 !== "evaluation-payload"
        ) {
          throw new Error(
            `${vector.id}: x-vivi-uniqueBy annotation vector must pass Stage 1 and fail Stage 2`,
          );
        }
      }
    }
    for (const operation of vector.patches) applyJsonPatch(value, operation);
    const accepted = validateStage1(value);
    if (accepted !== vector.expectedStage1) {
      throw new Error(
        `${vector.id}: live AJV Stage 1 expected ${vector.expectedStage1}, got ${accepted}: ${ajv.errorsText(validateStage1.errors)}`,
      );
    }
  }
  assertExactJson(
    corpusUniqueByIds.sort(),
    stage1UniqueByVectorIds,
    "shared AJV/Rust x-vivi-uniqueBy annotation vector inventory",
  );

  const rawSentinel = "__VIVI_RAW_NUMBER_SENTINEL__";
  for (const vector of corpus.rawVectors) {
    assertRawStage1VectorShape(vector);
    const templateValue = structuredClone(base);
    replaceJsonPointer(templateValue, vector.path, rawSentinel);
    const template = JSON.stringify(templateValue);
    const quotedSentinel = JSON.stringify(rawSentinel);
    if (template.split(quotedSentinel).length !== 2) {
      throw new Error(`${vector.id}: raw-number sentinel is not unique`);
    }
    const raw = template.replace(quotedSentinel, vector.rawNumber);
    const normalized = JSON.parse(raw);
    const normalizedValue = readJsonPointer(normalized, vector.path);
    if (!Object.is(normalizedValue, vector.expectedNormalized)) {
      throw new Error(
        `${vector.id}: JavaScript binary64 normalization drifted (${String(normalizedValue)})`,
      );
    }
    const accepted = validateStage1(normalized);
    if (accepted !== vector.expectedStage1) {
      throw new Error(
        `${vector.id}: live AJV raw-number Stage 1 expected ${vector.expectedStage1}, got ${accepted}: ${ajv.errorsText(validateStage1.errors)}`,
      );
    }
  }
}

function buildStage1UniqueByVectors(base) {
  const vector = (id, mutate) => {
    const value = structuredClone(base);
    mutate(value);
    return { id, value };
  };
  const duplicate = (value) => [structuredClone(value), structuredClone(value)];
  const controller = {
    id: "controller",
    name: "Controller",
    solverType: "ccd",
    boneChain: [],
    targetX: 0,
    targetY: 0,
    influence: 1,
    parameterMappings: [],
  };
  const binding = {
    id: "binding",
    parameterId: "vivi.head.yaw",
    target: {
      type: "ikController",
      controllerId: "controller",
      property: "targetX",
    },
    bindingPoints: [],
  };
  const physicsGroup = {
    id: "physics",
    name: "Physics",
    enabled: true,
    pendulums: [],
    inputs: [],
    outputs: [],
    gravityDirection: 0,
    gravityStrength: 0,
    wind: 0,
  };
  const collider = {
    id: "collider",
    name: "Collider",
    shape: { type: "circle", x: 0, y: 0, radius: 1 },
    enabled: true,
  };
  const expressionPreset = { id: "expression", name: "Expression", values: {} };
  const clip = { id: "clip", name: "Clip", duration: 0, fps: 1, tracks: [] };
  const state = { id: "state", name: "State", loop: true };
  const stateMachine = {
    id: "machine",
    name: "Machine",
    states: [state],
    transitions: [],
    initialStateId: "state",
    enabled: true,
  };
  const transition = {
    id: "transition",
    fromStateId: "state",
    toStateId: "state",
    conditions: [],
    transitionDuration: 0,
    priority: 0,
  };

  return [
    vector("duplicate-layer-id", (value) => {
      value.layers = duplicate(value.layers[0]);
    }),
    vector("duplicate-parameter-id", (value) => {
      value.parameters = duplicate(value.parameters[0]);
    }),
    vector("duplicate-binding-id", (value) => {
      value.ikControllers = [structuredClone(controller)];
      value.parameterBindings = duplicate(binding);
    }),
    vector("duplicate-ik-controller-id", (value) => {
      value.ikControllers = duplicate(controller);
    }),
    vector("duplicate-physics-group-id", (value) => {
      value.physicsGroups = duplicate(physicsGroup);
    }),
    vector("duplicate-collider-id", (value) => {
      value.colliders = duplicate(collider);
    }),
    vector("duplicate-expression-preset-id", (value) => {
      value.expressionPresets = duplicate(expressionPreset);
    }),
    vector("duplicate-clip-id", (value) => {
      value.clips = duplicate(clip);
    }),
    vector("duplicate-state-machine-id", (value) => {
      value.stateMachines = duplicate(stateMachine);
    }),
    vector("duplicate-atlas-id", (value) => {
      value.atlases = duplicate(value.atlases[0]);
    }),
    vector("duplicate-clip-mask-layer-id", (value) => {
      value.layers[0].clipMasks = [
        { layerId: "mesh-body", invert: true },
        { layerId: "mesh-body", invert: false },
      ];
    }),
    vector("duplicate-state-id", (value) => {
      value.stateMachines = [{ ...stateMachine, states: duplicate(state) }];
    }),
    vector("duplicate-transition-id", (value) => {
      value.stateMachines = [
        {
          ...stateMachine,
          transitions: duplicate(transition),
        },
      ];
    }),
    vector("duplicate-atlas-entry-layer-id", (value) => {
      const secondMesh = structuredClone(value.layers[0]);
      secondMesh.id = "mesh-other";
      value.layers.push(secondMesh);
      value.atlases[0].entries = duplicate(value.atlases[0].entries[0]);
    }),
  ];
}

function buildStage1MutationVectors(base) {
  const vector = (id, mutate) => {
    const value = structuredClone(base);
    mutate(value);
    return { id, value };
  };
  const lipSyncClip = (targetParameterId) => ({
    id: "clip",
    name: "Clip",
    duration: 0,
    fps: 1,
    tracks: [],
    audioTracks: [
      {
        id: "audio",
        name: "Audio",
        sourcePath: "",
        startFrame: 0,
        sourceDurationSeconds: null,
        gain: 1,
        muted: false,
      },
    ],
    lipSyncTracks: [
      {
        id: "lipsync",
        name: "Lip Sync",
        sourceAudioTrackId: "audio",
        analysisType: "rms",
        analysisFps: 1,
        samples: [],
        targetParameterId,
        sourcePathAtBake: "",
        sourceDurationSecondsAtBake: null,
        gain: 1,
        muted: false,
      },
    ],
  });
  return [
    vector("any-of-null-accept", (value) => {
      value.clips = [lipSyncClip(null)];
    }),
    vector("any-of-neither-reject", (value) => {
      value.clips = [lipSyncClip(false)];
    }),
    vector("pattern-simple-128-accept", (value) => {
      value.layers[0].id = "a".repeat(128);
    }),
    vector("pattern-simple-129-reject", (value) => {
      value.layers[0].id = "a".repeat(129);
    }),
    vector("pattern-parameter-128-accept", (value) => {
      value.parameters[0].id = `p.${"a".repeat(126)}`;
    }),
    vector("pattern-parameter-129-reject", (value) => {
      value.parameters[0].id = `p.${"a".repeat(127)}`;
    }),
    vector("max-items-atlases-33-reject", (value) => {
      value.atlases = Array.from({ length: 33 }, (_, index) => ({
        id: `atlas-${index}`,
        width: 1,
        height: 1,
        entries: [],
      }));
    }),
    ...buildStage1UniqueByVectors(base),
  ];
}

function assertCoverageVectorIds(label, vectorIds, allVectorIds) {
  if (!Array.isArray(vectorIds) || vectorIds.length === 0) {
    throw new Error(`Evaluation Stage 1 coverage ${label} is empty`);
  }
  if (new Set(vectorIds).size !== vectorIds.length) {
    throw new Error(`Evaluation Stage 1 coverage ${label} repeats a vector ID`);
  }
  for (const vectorId of vectorIds) {
    if (!allVectorIds.has(vectorId)) {
      throw new Error(
        `Evaluation Stage 1 coverage ${label} references unknown vector ${vectorId}`,
      );
    }
  }
}

function assertStage1VectorShape(vector) {
  if (!vector || typeof vector !== "object" || Array.isArray(vector)) {
    throw new Error("Evaluation Stage 1 corpus contains a non-object vector");
  }
  const hasMutation = Object.hasOwn(vector, "mutation");
  const hasExpectedStage2 = Object.hasOwn(vector, "expectedStage2");
  const expectedKeys = ["expectedStage1", "id", "patches"];
  if (hasMutation) expectedKeys.push("mutation");
  if (hasExpectedStage2) expectedKeys.push("expectedStage2");
  expectedKeys.sort();
  assertExactJson(
    Object.keys(vector).sort(),
    expectedKeys,
    `${String(vector.id)} Stage 1 vector fields`,
  );
  if (
    typeof vector.id !== "string" ||
    vector.id.length === 0 ||
    (hasMutation && typeof vector.mutation !== "string") ||
    (hasExpectedStage2 &&
      (!hasMutation || vector.expectedStage2 !== "evaluation-payload")) ||
    typeof vector.expectedStage1 !== "boolean" ||
    !Array.isArray(vector.patches)
  ) {
    throw new Error(`${String(vector.id)}: invalid Stage 1 vector shape`);
  }
}

function assertRawStage1VectorShape(vector) {
  if (!vector || typeof vector !== "object" || Array.isArray(vector)) {
    throw new Error("Evaluation Stage 1 corpus contains a non-object raw vector");
  }
  assertExactJson(
    Object.keys(vector).sort(),
    ["expectedNormalized", "expectedStage1", "id", "path", "rawNumber"],
    `${String(vector.id)} raw Stage 1 vector fields`,
  );
  if (
    typeof vector.id !== "string" ||
    typeof vector.path !== "string" ||
    !vector.path.startsWith("/") ||
    typeof vector.rawNumber !== "string" ||
    !/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/.test(vector.rawNumber) ||
    typeof vector.expectedStage1 !== "boolean" ||
    typeof vector.expectedNormalized !== "number" ||
    !Number.isFinite(vector.expectedNormalized)
  ) {
    throw new Error(`${String(vector.id)}: invalid raw Stage 1 vector shape`);
  }
}

function applyJsonPatch(target, operation) {
  if (!operation || typeof operation !== "object" || Array.isArray(operation)) {
    throw new Error("Evaluation Stage 1 corpus contains a non-object patch");
  }
  const hasValue = Object.hasOwn(operation, "value");
  const expectedKeys =
    operation.op === "remove" ? ["op", "path"] : ["op", "path", "value"];
  assertExactJson(
    Object.keys(operation).sort(),
    expectedKeys,
    `Stage 1 ${String(operation.op)} patch fields`,
  );
  if (
    !["add", "remove", "replace"].includes(operation.op) ||
    typeof operation.path !== "string" ||
    !operation.path.startsWith("/") ||
    (operation.op === "remove" ? hasValue : !hasValue)
  ) {
    throw new Error("Evaluation Stage 1 corpus contains an invalid patch");
  }

  const { parent, key } = resolveJsonPointerParent(target, operation.path);
  if (Array.isArray(parent)) {
    if (operation.op === "add" && key === "-") {
      parent.push(structuredClone(operation.value));
      return;
    }
    const index = parseArrayIndex(key, parent.length, operation.op === "add");
    if (operation.op === "add") parent.splice(index, 0, structuredClone(operation.value));
    else if (operation.op === "replace") {
      parent[index] = structuredClone(operation.value);
    } else parent.splice(index, 1);
    return;
  }
  if (!parent || typeof parent !== "object") {
    throw new Error(`Stage 1 patch parent is not a container: ${operation.path}`);
  }
  const exists = Object.hasOwn(parent, key);
  if (operation.op === "add") {
    if (exists) throw new Error(`Stage 1 add target already exists: ${operation.path}`);
    parent[key] = structuredClone(operation.value);
  } else if (operation.op === "replace") {
    if (!exists) throw new Error(`Stage 1 replace target is absent: ${operation.path}`);
    parent[key] = structuredClone(operation.value);
  } else {
    if (!exists) throw new Error(`Stage 1 remove target is absent: ${operation.path}`);
    delete parent[key];
  }
}

function replaceJsonPointer(target, pointer, value) {
  const { parent, key } = resolveJsonPointerParent(target, pointer);
  if (Array.isArray(parent)) {
    const index = parseArrayIndex(key, parent.length, false);
    parent[index] = value;
    return;
  }
  if (!parent || typeof parent !== "object" || !Object.hasOwn(parent, key)) {
    throw new Error(`raw Stage 1 vector path is absent: ${pointer}`);
  }
  parent[key] = value;
}

function readJsonPointer(target, pointer) {
  let current = target;
  for (const segment of decodeJsonPointer(pointer)) {
    if (!current || typeof current !== "object" || !Object.hasOwn(current, segment)) {
      throw new Error(`raw Stage 1 vector path is absent after parse: ${pointer}`);
    }
    current = current[segment];
  }
  return current;
}

function resolveJsonPointerParent(target, pointer) {
  const segments = decodeJsonPointer(pointer);
  if (segments.length === 0) {
    throw new Error("Stage 1 corpus may not replace the payload root");
  }
  const key = segments.pop();
  let parent = target;
  for (const segment of segments) {
    if (!parent || typeof parent !== "object" || !Object.hasOwn(parent, segment)) {
      throw new Error(`Stage 1 patch parent is absent: ${pointer}`);
    }
    parent = parent[segment];
  }
  return { parent, key };
}

function decodeJsonPointer(pointer) {
  if (pointer === "") return [];
  if (!pointer.startsWith("/")) throw new Error(`invalid JSON pointer: ${pointer}`);
  return pointer
    .slice(1)
    .split("/")
    .map((segment) => {
      if (/~(?:[^01]|$)/.test(segment)) {
        throw new Error(`invalid JSON pointer escape: ${pointer}`);
      }
      return segment.replaceAll("~1", "/").replaceAll("~0", "~");
    });
}

function parseArrayIndex(segment, length, allowEnd) {
  if (!/^(?:0|[1-9][0-9]*)$/.test(segment)) {
    throw new Error(`invalid JSON pointer array index: ${segment}`);
  }
  const index = Number(segment);
  if (!Number.isSafeInteger(index) || index < 0 || index >= length + Number(allowEnd)) {
    throw new Error(`JSON pointer array index is out of bounds: ${segment}`);
  }
  return index;
}

function collectUniqueByLocations(value, location = "$") {
  if (!value || typeof value !== "object") return [];
  const result = [];
  if (!Array.isArray(value) && typeof value["x-vivi-uniqueBy"] === "string") {
    result.push(`${location}:${value["x-vivi-uniqueBy"]}`);
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === "x-vivi-uniqueBy") continue;
    result.push(...collectUniqueByLocations(child, `${location}/${key}`));
  }
  return result;
}

function collectKeywordInventory(value, inventory) {
  if (!value || typeof value !== "object") return [];
  const found = new Set();
  for (const [key, child] of Object.entries(value)) {
    if (inventory.has(key)) found.add(key);
    for (const nested of collectKeywordInventory(child, inventory)) {
      found.add(nested);
    }
  }
  return [...found];
}

function collectKeywordValues(value, keyword) {
  if (!value || typeof value !== "object") return [];
  const found = [];
  for (const [key, child] of Object.entries(value)) {
    if (key === keyword) found.push(child);
    found.push(...collectKeywordValues(child, keyword));
  }
  return found;
}

function assertCargoBoundary() {
  const workspaceManifest = readText(nativeManifestPath);
  if (!workspaceManifest.includes('"crates/vivi-runtime-native-evaluation"')) {
    throw new Error("runtime-native workspace omits the Evaluation foundation");
  }
  if (
    !/^rust-version = "1\.89"$/m.test(workspaceManifest) ||
    !/^edition = "2024"$/m.test(workspaceManifest) ||
    !/^license = "Apache-2\.0"$/m.test(workspaceManifest)
  ) {
    throw new Error(
      "runtime-native workspace must pin Rust 1.89, edition 2024, and Apache-2.0",
    );
  }

  const metadata = readCargoMetadata();
  const evaluationPackage = requirePackage(metadata, "vivi-runtime-native-evaluation");
  if (
    evaluationPackage.version !== "0.1.0" ||
    evaluationPackage.edition !== "2024" ||
    evaluationPackage.rust_version !== "1.89" ||
    evaluationPackage.license !== "Apache-2.0" ||
    JSON.stringify(evaluationPackage.publish) !== "[]" ||
    JSON.stringify(evaluationPackage.features) !== "{}" ||
    path.resolve(evaluationPackage.manifest_path) !== resolve(evaluationManifestPath)
  ) {
    throw new Error(
      "Evaluation foundation identity, license, Rust version, features, or publish=false drifted",
    );
  }

  const libraryTargets = evaluationPackage.targets.filter((target) =>
    target.kind.includes("lib"),
  );
  if (
    libraryTargets.length !== 1 ||
    libraryTargets[0].name !== "vivi_runtime_native_evaluation" ||
    JSON.stringify(libraryTargets[0].crate_types) !== JSON.stringify(["lib"])
  ) {
    throw new Error(
      "Evaluation foundation must expose one Rust-only rlib and no language ABI",
    );
  }
  if (
    evaluationPackage.targets.some((target) =>
      target.crate_types.some((crateType) =>
        ["bin", "cdylib", "dylib", "staticlib"].includes(crateType),
      ),
    )
  ) {
    throw new Error(
      "Evaluation foundation must not add a binary, dynamic library, or static C ABI",
    );
  }

  const actualDirect = evaluationPackage.dependencies
    .map((dependency) => ({
      name: dependency.name,
      kind: dependency.kind ?? "normal",
      optional: dependency.optional,
      target: dependency.target,
      usesDefaultFeatures: dependency.uses_default_features,
      features: [...dependency.features].sort(),
      sourceKind: dependency.source?.startsWith("registry+") ? "registry" : "path",
    }))
    .sort(compareDirectDependencies);
  const expectedDirect = [
    directDependency("serde_json", "normal", ["std"]),
    directDependency("sha2", "dev", []),
  ].sort(compareDirectDependencies);
  assertExactJson(
    actualDirect,
    expectedDirect,
    "Evaluation foundation direct dependency inventory",
  );

  return metadata;
}

function assertDependencyClosure(metadata) {
  const evaluationPackage = requirePackage(metadata, "vivi-runtime-native-evaluation");
  const packages = new Map(metadata.packages.map((pkg) => [pkg.id, pkg]));
  const lockPackages = readCargoLockPackages();
  const actual = resolvedClosureInventory(
    metadata,
    evaluationPackage.id,
    new Set([null]),
    packages,
    lockPackages,
  );
  assertExactJson(
    actual,
    expectedRegistryClosure,
    "Evaluation foundation dependency/license/checksum closure",
  );
  const actualDev = resolvedClosureInventory(
    metadata,
    evaluationPackage.id,
    new Set(["dev"]),
    packages,
    lockPackages,
  );
  assertExactJson(
    actualDev,
    expectedDevRegistryClosure,
    "Evaluation foundation dev dependency/license/checksum closure",
  );
}

function assertConsumerZeroAndBridgeIsolation(metadata) {
  const consumers = consumersOf(metadata, "vivi-runtime-native-evaluation");
  assertExactJson(
    consumers,
    ["vivi-runtime-native-preactivation"],
    "Evaluation foundation Cargo consumers",
  );

  for (const packageName of [
    "vivi-runtime-native-core",
    "vivi-runtime-native-c-abi",
    "vivi-runtime-native-wasm",
    "vivi-asset-resolver",
    "vivi-asset-store-local",
    "vivi-asset-host-local",
  ]) {
    const pkg = requirePackage(metadata, packageName);
    if (
      pkg.dependencies.some(
        (dependency) => dependency.name === "vivi-runtime-native-evaluation",
      )
    ) {
      throw new Error(`${packageName} must remain disconnected from Evaluation`);
    }
  }

  const cAbiPackage = requirePackage(metadata, "vivi-runtime-native-c-abi");
  if (
    Object.keys(cAbiPackage.features).some((feature) =>
      /editor|evaluation/i.test(feature),
    )
  ) {
    throw new Error(
      "C ABI must not gain an editor/evaluation feature in this foundation slice",
    );
  }

  const trackedBoundaryFiles = gitTrackedFiles([
    "packages/runtime-c-abi",
    "packages/runtime-native/crates/vivi-runtime-native-c-abi",
    "packages/runtime-native/crates/vivi-runtime-native-core",
    "packages/runtime-native/crates/vivi-runtime-native-wasm",
  ]);
  if (
    trackedBoundaryFiles.includes("packages/runtime-c-abi/include/vivi_runtime_editor.h")
  ) {
    throw new Error("the local editor-only C header must remain untracked");
  }
  for (const filePath of trackedBoundaryFiles) {
    if (
      !existsSync(resolve(filePath)) ||
      statSync(resolve(filePath)).size > 8 * 1024 * 1024
    ) {
      continue;
    }
    const source = readText(filePath);
    if (/\bvivi_model_load_evaluation\b/.test(source)) {
      throw new Error(`${filePath} tracks the editor-only C ABI symbol`);
    }
    if (
      /vivi[-_]runtime[-_]native[-_]evaluation/i.test(source) ||
      /\bload_evaluation_payload\b/.test(source)
    ) {
      throw new Error(`${filePath} wires the Evaluation crate outside preactivation`);
    }
  }

  for (const [checkerPath, evidence] of [
    ["scripts/check-runtime-c-abi.mjs", "vivi_model_load_evaluation"],
    ["scripts/check-runtime-asset-resolver.mjs", "vivi_model_load_evaluation"],
    [
      "scripts/check-runtime-c-abi-v02-host-smoke.mjs",
      'const editorOnlyExports = ["vivi_model_load_evaluation"]',
    ],
    [
      "scripts/check-runtime-png.mjs",
      'const editorOnlyExports = ["vivi_model_load_evaluation"]',
    ],
  ]) {
    if (!readText(checkerPath).includes(evidence)) {
      throw new Error(`${checkerPath} lost the editor-only negative symbol gate`);
    }
  }

  const npmIgnore = readText("packages/runtime-c-abi/.npmignore");
  if (!npmIgnore.includes("include/vivi_runtime_editor.h")) {
    throw new Error("runtime-c-abi npm ignore must retain editor-header isolation");
  }
  const packOutput = runNpmCapture([
    "pack",
    "--workspace",
    "@vivi2d/runtime-c-abi",
    "--json",
    "--dry-run",
  ]);
  const pack = JSON.parse(packOutput);
  const actualPackFiles = (pack[0]?.files ?? []).map((file) => file.path).sort();
  const expectedPackFiles = [
    "include/vivi_runtime.h",
    "package.json",
    "samples/minimal-host.c",
    "tests/header-layout.c",
  ].sort();
  assertExactJson(
    actualPackFiles,
    expectedPackFiles,
    "@vivi2d/runtime-c-abi dry-run pack inventory",
  );
}

function assertFoundationSourcePolicy() {
  const manifest = readText(evaluationManifestPath);
  if (/^\s*build\s*=/m.test(manifest)) {
    throw new Error("Evaluation foundation must not run a Cargo build script");
  }
  const rustFiles = walkFiles(resolve(`${evaluationRoot}/src`)).filter((filePath) =>
    filePath.endsWith(".rs"),
  );
  if (rustFiles.length === 0) {
    throw new Error("Evaluation foundation has no Rust source");
  }
  const libraryRoot = readText(`${evaluationRoot}/src/lib.rs`);
  if (!libraryRoot.includes("#![forbid(unsafe_code)]")) {
    throw new Error("Evaluation foundation must forbid unsafe code at crate scope");
  }

  const forbiddenPatterns = [
    [/\bunsafe\s+(?:fn|trait|impl)\b|\bunsafe\s*\{/m, "unsafe code"],
    [/\bextern\s+"C"\b|no_mangle|export_name|link_name/m, "language ABI/export"],
    [
      /\bvivi_runtime_native_core\b|\bCoreRuntimeModel\b|\bfrom_payload_with_limits\b|\bDrawCommand\b/m,
      "runtime-native core/lowering",
    ],
    [
      /\bas\s+f32\b|:\s*f32\b|->\s*f32\b|(?:<|,)\s*f32\b|\bf32::/m,
      "f32 conversion or storage",
    ],
    [
      /\bstd::(?:fs|net|process|env)::|\b(?:File|OpenOptions)::|\bstd::io::(?:Read|Write)\b/m,
      "filesystem, network, process, environment, or stream I/O",
    ],
    [/\b(?:wasm_bindgen|napi|pyo3|jni)\b/m, "language/WASM bridge"],
    [/\bvivi_model_load_evaluation\b/m, "editor-only C ABI symbol"],
    [
      /\bvivi_asset_(?:resolver|store|host)\b|\bReadyPng\b|\bwgpu\b/m,
      "Asset activation or GPU integration",
    ],
    [/\b(?:loadable|activatable|lossless)\b/im, "imprecise candidate/value terminology"],
  ];
  for (const filePath of rustFiles) {
    const source = readFileSync(filePath, "utf8");
    for (const [pattern, label] of forbiddenPatterns) {
      if (pattern.test(source)) {
        throw new Error(`${toRelative(filePath)} crosses the ${label} boundary`);
      }
    }
  }
  assertPublicApiAndSemanticShape();
}

function assertPublicApiAndSemanticShape() {
  const expectedPublicItemsByFile = {
    "src/error.rs": ["EvaluationPayloadError", "EvaluationPayloadErrorKind"],
    "src/lib.rs": [
      "APPROVED_EVALUATION_PAYLOAD_V1_SCHEMA_BYTES",
      "APPROVED_EVALUATION_PAYLOAD_V1_SCHEMA_SHA256",
      "EVALUATION_PAYLOAD_V1_MAX_CONTAINER_DEPTH",
      "EVALUATION_PAYLOAD_V1_MAX_INPUT_BYTES",
      "EVALUATION_PAYLOAD_V1_MAX_STRING_BYTES",
      "EVALUATION_PAYLOAD_V1_MAX_TOKENS",
      "RequiredTextureBindingV1",
      "ValidatedEvaluationPayloadV1",
    ],
    "src/schema_equivalent.rs": [],
    "src/semantic.rs": [],
    "src/transport.rs": [],
  };
  const expectedPublicFunctionsByFile = {
    "src/error.rs": ["kind", "status", "status"],
    "src/lib.rs": [
      "height",
      "id",
      "into_value",
      "parse_evaluation_payload_v1",
      "request_generation",
      "texture_bindings",
      "value",
      "width",
    ],
    "src/schema_equivalent.rs": [],
    "src/semantic.rs": [],
    "src/transport.rs": [],
  };
  for (const relativePath of Object.keys(expectedPublicItemsByFile).sort()) {
    const source = readText(`${evaluationRoot}/${relativePath}`);
    const actualItems = [
      ...source.matchAll(/^pub (?:struct|enum|type|const)\s+([A-Za-z0-9_]+)/gm),
    ]
      .map((match) => match[1])
      .sort();
    assertExactJson(
      actualItems,
      [...expectedPublicItemsByFile[relativePath]].sort(),
      `${relativePath} public item inventory`,
    );

    const actualFunctions = [
      ...source.matchAll(/^\s*pub(?: const)? fn\s+([A-Za-z0-9_]+)\s*\(/gm),
    ]
      .map((match) => match[1])
      .sort();
    assertExactJson(
      actualFunctions,
      [...expectedPublicFunctionsByFile[relativePath]].sort(),
      `${relativePath} public function inventory`,
    );
  }

  const libraryRoot = readText(`${evaluationRoot}/src/lib.rs`);
  if (
    !libraryRoot.includes(
      "pub use error::{EvaluationPayloadError, EvaluationPayloadErrorKind};",
    ) ||
    /^pub mod\s/m.test(libraryRoot)
  ) {
    throw new Error("Evaluation crate root re-export/module boundary drifted");
  }
  for (const evidence of [
    "binary64-normalized validated candidate",
    "Runtime Spec v1.0 loader-preflight Evaluation Payload v1 candidate",
    "Future lowering or activation remains subject to the A-09",
  ]) {
    if (!libraryRoot.includes(evidence)) {
      throw new Error(`Evaluation crate docs are missing precise scope: ${evidence}`);
    }
  }
  assertPrivateStructFields(libraryRoot, "RequiredTextureBindingV1", [
    "height",
    "id",
    "width",
  ]);
  assertPrivateStructFields(libraryRoot, "ValidatedEvaluationPayloadV1", [
    "request_generation",
    "texture_bindings",
    "value",
  ]);

  const errorSource = readText(`${evaluationRoot}/src/error.rs`);
  assertPrivateStructFields(errorSource, "EvaluationPayloadError", ["kind"]);
  assertExactEnumVariants(errorSource, "EvaluationPayloadErrorKind", [
    "EvaluationPayload",
    "Internal",
    "LimitExceeded",
    "UnsupportedOperation",
  ]);
  if (
    !/impl\s+std::error::Error\s+for\s+EvaluationPayloadError\s*\{\s*\}/m.test(
      errorSource,
    )
  ) {
    throw new Error(
      "EvaluationPayloadError must retain the default source() == None contract",
    );
  }
  for (const typeName of [
    "EvaluationPayloadError",
    "RequiredTextureBindingV1",
    "ValidatedEvaluationPayloadV1",
  ]) {
    const combinedSource = `${errorSource}\n${libraryRoot}`;
    if (!combinedSource.includes(`impl fmt::Debug for ${typeName}`)) {
      throw new Error(`${typeName} must retain its manual redacted Debug implementation`);
    }
    const declarationOffset = combinedSource.indexOf(`pub struct ${typeName}`);
    const declarationPrefix = combinedSource.slice(
      Math.max(0, declarationOffset - 160),
      declarationOffset,
    );
    if (/derive\([^)]*Debug/.test(declarationPrefix)) {
      throw new Error(`${typeName} must not derive Debug`);
    }
  }
  if (
    !libraryRoot.includes('.field("id_utf8_bytes", &self.id.len())') ||
    libraryRoot.includes('.field("id", &self.id)') ||
    !libraryRoot.includes(
      '.field("texture_binding_count", &self.texture_bindings.len())',
    ) ||
    libraryRoot.includes('.field("value", &self.value)')
  ) {
    throw new Error("validated values and texture bindings must retain redacted Debug");
  }

  const transport = readText(`${evaluationRoot}/src/transport.rs`);
  for (const evidence of [
    "MAX_INPUT_BYTES: usize = 67_108_864",
    "MAX_CONTAINER_DEPTH: usize = 64",
    "MAX_TOKENS: usize = 8_000_000",
    "MAX_STRING_BYTES: usize = 67_108_864",
    ".parse::<f64>()",
    "number.is_finite()",
    "Number::from_f64(number)",
  ]) {
    if (!transport.includes(evidence)) {
      throw new Error(`Evaluation transport is missing semantic pin: ${evidence}`);
    }
  }

  const schemaEquivalent = readText(`${evaluationRoot}/src/schema_equivalent.rs`);
  if (
    [...schemaEquivalent.matchAll(/x-vivi-uniqueBy/g)].length !== 1 ||
    !schemaEquivalent.includes(
      "`x-vivi-uniqueBy` is an annotation, not a Schema 2020-12 keyword.",
    )
  ) {
    throw new Error(
      "Evaluation Stage 1 must ignore the x-vivi-uniqueBy annotation exactly",
    );
  }

  const executableSource = [
    libraryRoot,
    errorSource,
    schemaEquivalent,
    readText(`${evaluationRoot}/src/semantic.rs`),
    transport,
  ].join("\n");
  if (
    /["'](?:semanticRole|riggingHint|manualSplit(?:SourceIds|Rule|Revision)?|importMetadata|managed(?:By|Revision)?)["']/m.test(
      executableSource,
    )
  ) {
    throw new Error(
      "producer-side forbidden-field scanning must remain outside Evaluation",
    );
  }

  const tests = readText(`${evaluationRoot}/src/tests.rs`);
  for (const evidence of [
    'include_bytes!("../fixtures/schema-stage1-parity.json")',
    "tracked_stage1_keyword_boundary_parity_corpus_matches_rust_validator",
    'corpus["vectors"]',
    ".map_or_else(valid_payload, stage1_mutation_vector)",
    'vector["expectedStage1"]',
    'vector["expectedStage2"] == "evaluation-payload"',
    "tracked_raw_number_lexemes_match_binary64_stage1_semantics",
    'corpus["rawVectors"]',
    "transport::parse(raw.as_bytes())",
    "schema_equivalent::validate(&normalized)",
    "u64::MAX",
  ]) {
    if (!tests.includes(evidence)) {
      throw new Error(`Evaluation Rust parity tests are missing evidence: ${evidence}`);
    }
  }

  const parseBody = /pub fn parse_evaluation_payload_v1\([\s\S]*?\n\}/m.exec(
    libraryRoot,
  )?.[0];
  if (!parseBody) throw new Error("Evaluation parse entry point is missing");
  assertOrderedEvidence(
    parseBody,
    [
      "request_generation: u64",
      "transport::parse(raw)?",
      "schema_equivalent::validate(&value)?",
      "semantic::validate_and_inventory(value, request_generation)",
    ],
    "Evaluation transport/Stage 1/Stage 2 order",
  );

  const semantic = readText(`${evaluationRoot}/src/semantic.rs`);
  for (const evidence of [
    "const MAX_TEXTURE_BYTES: u64 = 268_435_456",
    'binding_id.push_str("atlas:")',
    "left.id.as_bytes().cmp(right.id.as_bytes())",
    "request_generation: u64",
    "request_generation,",
  ]) {
    if (!semantic.includes(evidence)) {
      throw new Error(`Evaluation semantics are missing pin: ${evidence}`);
    }
  }
  assertOrderedEvidence(
    semantic,
    [
      "validate_clips(clips",
      "validate_state_machines(state_machines",
      'validate_atlases(array_property(root, "atlases")?',
      "if !clips.is_empty() || !state_machines.is_empty()",
      "EvaluationPayloadError::unsupported()",
    ],
    "Runtime Spec v1.0 post-Stage-2 unsupported preflight",
  );
}

function assertGateAndDocumentationWiring() {
  const runtimePackage = readJson("packages/runtime-native/package.json");
  const expectedNativeScript =
    "cargo test --locked --manifest-path Cargo.toml -p vivi-runtime-native-evaluation --all-targets && cargo clippy --locked --manifest-path Cargo.toml -p vivi-runtime-native-evaluation --all-targets -- -D warnings";
  const expectedWasmScript =
    "cargo test --locked --manifest-path Cargo.toml -p vivi-runtime-native-evaluation --target wasm32-unknown-unknown --all-targets --no-run && cargo clippy --locked --manifest-path Cargo.toml -p vivi-runtime-native-evaluation --target wasm32-unknown-unknown --all-targets -- -D warnings";
  if (runtimePackage.scripts?.["check:evaluation"] !== expectedNativeScript) {
    throw new Error("Evaluation focused native test/Clippy script drifted");
  }
  if (runtimePackage.scripts?.["check:evaluation:wasm32"] !== expectedWasmScript) {
    throw new Error("Evaluation wasm32 compile/Clippy script drifted");
  }

  const rootPackage = readJson("package.json");
  const expectedRootScript =
    "node scripts/check-runtime-native-evaluation.mjs && npm run check:evaluation --workspace @vivi2d/runtime-native";
  if (rootPackage.scripts?.["check:runtime-native-evaluation"] !== expectedRootScript) {
    throw new Error("root Evaluation foundation gate drifted");
  }
  if (
    !readText("scripts/run-quality-gates.mjs").includes(
      '"check:runtime-native-evaluation"',
    )
  ) {
    throw new Error("root quality runner omits the Evaluation foundation gate");
  }

  const gateManifest = readJson("scripts/quality-gate-manifest.json");
  const gate = gateManifest.gates?.find(
    (candidate) => candidate.npmScript === "check:runtime-native-evaluation",
  );
  if (
    gate?.command !== "npm run check:runtime-native-evaluation" ||
    JSON.stringify(gate.requiredWorkflows) !==
      JSON.stringify([".github/workflows/runtime-native.yml"]) ||
    gate.intentionallySplit !== true ||
    gate.escalatable !== true
  ) {
    throw new Error("Evaluation quality-gate manifest entry drifted");
  }
  for (const evidence of [
    "exact sole production consumer, vivi-runtime-native-preactivation",
    "byte-identical approved model schema copy",
    "approved-schema reachable accepted-set parity",
    "without claiming generic JSON Schema branch coverage beyond that artifact",
    "Stage 1",
    "Stage 2",
    "stable texture-binding inventory",
    "67,108,864 raw bytes",
    "depth 64",
    "8,000,000 JSON tokens",
    "Stage 1 rejects unknown structural fields before Stage 2 semantics",
    "producer-side forbidden scanning is outside this crate",
    "opaque skins, bindPoseInverse, and expression-values keys remain data",
    "binary64-normalized numeric values",
    "without source-number-lexeme or negative-zero preservation",
    "full opaque u64 request-generation range",
    "atlas:<sourceAtlasId>",
    "UTF-8 byte order",
    "Runtime Spec v1.0 loader-preflight policy",
    "nonempty clips or stateMachines",
    "after both validation stages",
    "generic schema-valid payload parser",
    "loader-preflight candidate",
    "Adopted Amendment 1 A-09 remains normative",
    "Evaluation Lowering Contract v1 is adopted",
    "all 13 Evaluation blend-mode dispositions",
    "deterministic primitive-operation/FMA/checkpoint and transcendental-math connection prerequisite remains open",
    "hidden serde_json::Map or serializer allocation failure",
    "dependency license/checksum closure",
    "rustdoc with warnings denied",
    "wasm32",
    "C ABI/editor symbols and headers",
    "unsafe code",
    "f32 lowering or evaluation",
    "EDH-01",
  ]) {
    if (!gate.notes?.includes(evidence)) {
      throw new Error(`Evaluation gate note is missing ${evidence}`);
    }
  }
  for (const stale of [
    "A-09 contract amendment is resolved",
    "A-09 contract amendment remains a blocker",
    "A-09 and EDH-01 remain open",
    "The A-09 contract amendment and EDH-01 remain open",
    "only after A-09 is resolved",
    "blocked on the A-09 contract amendment",
  ]) {
    if (gate.notes?.includes(stale)) {
      throw new Error(`Evaluation gate note retains stale A-09 wording: ${stale}`);
    }
  }

  const workflow = readText(".github/workflows/runtime-native.yml");
  for (const evidence of [
    "RUSTUP_TOOLCHAIN: 1.89.0",
    "matrix:\n        os: [ubuntu-latest, windows-latest, macos-latest]",
    `"${modelSchemaPath}"`,
    `"${generatedValidatorPath}"`,
    '"scripts/check-runtime-native-evaluation.mjs"',
    "npm run check:runtime-native-evaluation",
    "npm run check:evaluation:wasm32 --workspace @vivi2d/runtime-native",
    "$" + "{{ runner.temp }}/vivi-runtime-native-evaluation-native",
    "$" + "{{ runner.temp }}/vivi-runtime-native-evaluation-wasm32",
    "biome check scripts/check-runtime-asset-host-local.mjs",
    "scripts/check-runtime-native-evaluation.mjs",
  ]) {
    if (!workflow.includes(evidence)) {
      throw new Error(
        `runtime-native workflow is missing Evaluation evidence: ${evidence}`,
      );
    }
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
      "Stage 1 rejects unknown structural fields before Stage 2 semantics",
      "producer-side forbidden scanning is outside this crate",
    ]) {
      if (!contents.includes(evidence)) {
        throw new Error(`${documentationPath} is missing exact scope text: ${evidence}`);
      }
    }
  }
  const documentation = normalizedDocumentation
    .map(([, contents]) => contents)
    .join("\n");
  if (/\b(?:loadable|activatable|lossless)\b/i.test(documentation)) {
    throw new Error(
      "Evaluation documentation must use loader-preflight/binary64-normalized terminology",
    );
  }
  for (const evidence of [
    "vivi-runtime-native-evaluation",
    "sole production consumer",
    "vivi-runtime-native-preactivation",
    "Evaluation Payload v1",
    "duplicate-aware",
    "approved-schema reachable accepted-set parity",
    "does not claim generic JSON Schema branch coverage beyond that artifact",
    "Stage 1",
    "Stage 2",
    "producer-side forbidden scanning is outside this crate",
    "opaque keys",
    "stable texture-binding inventory",
    "wasm32-unknown-unknown",
    "CoreRuntimeModel",
    "binary64-normalized",
    "source number lexemes and negative zero are not preserved",
    "full `u64` range",
    "atlas:<sourceAtlasId>",
    "UTF-8 byte order",
    "Runtime Spec v1.0",
    "nonempty `clips` or `stateMachines`",
    "not a generic parser",
    "Runtime Spec v1.0 loader-preflight candidate",
    "Adopted Amendment 1 A-09 remains normative",
    "Evaluation Lowering Contract v1",
    "all 13",
    "deterministic",
    "hidden `serde_json::Map`",
    "f32",
    "C ABI/editor",
    "WASM",
    "filesystem/network I/O",
    "unsafe code",
    "EDH-01",
  ]) {
    if (!documentation.includes(evidence)) {
      throw new Error(`Evaluation documentation is missing ${evidence}`);
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
    if (documentation.includes(stale)) {
      throw new Error(`Evaluation documentation retains stale A-09 wording: ${stale}`);
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
      "vivi-runtime-native-evaluation",
    ],
    { RUSTDOCFLAGS: "-D warnings" },
  );
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

function resolvedClosureInventory(
  metadata,
  rootPackageId,
  rootKinds,
  packages,
  lockPackages,
) {
  return [...dependencyClosure(metadata, rootPackageId, rootKinds)]
    .map((id) => {
      const pkg = packages.get(id);
      if (!pkg) {
        throw new Error("cargo metadata omitted a resolved dependency package");
      }
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

function directDependency(name, kind, features) {
  return {
    name,
    kind,
    optional: false,
    target: null,
    usesDefaultFeatures: false,
    features,
    sourceKind: "registry",
  };
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

function gitTrackedFiles(pathspecs) {
  return runCapture("git", ["ls-files", "-z", "--", ...pathspecs])
    .split("\0")
    .filter(Boolean)
    .map((filePath) => filePath.replaceAll("\\", "/"))
    .sort();
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

function assertPrivateStructFields(source, structName, expectedFields) {
  const body = new RegExp(`pub struct ${structName}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(
    source,
  )?.[1];
  if (!body) throw new Error(`${structName} declaration is missing`);
  if (/^\s*pub(?:\([^)]*\))?\s+/m.test(body)) {
    throw new Error(`${structName} fields must remain private`);
  }
  const actualFields = [...body.matchAll(/^\s*([A-Za-z0-9_]+)\s*:/gm)]
    .map((match) => match[1])
    .sort();
  assertExactJson(
    actualFields,
    [...expectedFields].sort(),
    `${structName} private field inventory`,
  );
}

function assertExactEnumVariants(source, enumName, expectedVariants) {
  const body = new RegExp(`pub enum ${enumName}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(
    source,
  )?.[1];
  if (!body) throw new Error(`${enumName} declaration is missing`);
  const actualVariants = [...body.matchAll(/^\s*([A-Z][A-Za-z0-9_]*)\b/gm)]
    .map((match) => match[1])
    .sort();
  assertExactJson(
    actualVariants,
    [...expectedVariants].sort(),
    `${enumName} variant inventory`,
  );
}

function assertOrderedEvidence(source, evidence, label) {
  let offset = -1;
  for (const item of evidence) {
    const nextOffset = source.indexOf(item, offset + 1);
    if (nextOffset < 0) {
      throw new Error(`${label} is missing or reordered at ${item}`);
    }
    offset = nextOffset;
  }
}

function assertExactJson(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      label +
        " drifted\nexpected=" +
        JSON.stringify(expected, null, 2) +
        "\nactual=" +
        JSON.stringify(actual, null, 2),
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
      command +
        " failed with exit code " +
        (result.status ?? "unknown") +
        ": " +
        (result.stderr ?? result.error?.message ?? ""),
    );
  }
  return result.stdout ?? "";
}

function runNpmCapture(args) {
  const bundledNpmCli = path.join(
    path.dirname(process.execPath),
    "node_modules/npm/bin/npm-cli.js",
  );
  const npmCli = process.env.npm_execpath || bundledNpmCli;
  if (existsSync(npmCli)) {
    return runCapture(process.execPath, [npmCli, ...args]);
  }
  return runCapture("npm", args);
}
