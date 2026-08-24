import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import Ajv2020, { type ValidateFunction } from "ajv/dist/2020.js";
import { build } from "vite";
import { describe, expect, it } from "vitest";
import evaluationPayloadV1Schema from "../evaluation-payload-v1/evaluation-payload-v1.schema.json";
import evaluationTexturePlanV1Schema from "../evaluation-payload-v1/evaluation-texture-plan-v1.schema.json";
import {
  evaluationPayloadV1SchemaIdentity,
  evaluationTexturePlanV1SchemaIdentity,
  type StandaloneSchemaValidator,
  validateEvaluationPayloadV1,
  validateEvaluationTexturePlanV1,
} from "../internal/generated/evaluation-v1-validators.mjs";
import {
  projectFormatV11SchemaIdentity,
  validateProjectFormatV11,
} from "../internal/generated/project-format-v11-validator.mjs";
import projectFormatV11Schema from "../project-format-v11/project-format-v11.schema.json";
import golden from "./fixtures/project-format-v11-golden.json";

const PROJECT_SCHEMA_ID = "https://vivi2d.com/spec/project-format-v11.schema.json";
const EVALUATION_PAYLOAD_SCHEMA_ID =
  "https://vivi2d.com/spec/evaluation-payload-v1.schema.json";
const EVALUATION_TEXTURE_PLAN_SCHEMA_ID =
  "https://vivi2d.com/spec/evaluation-texture-plan-v1.schema.json";
const APPROVED_STATUS = "approved-amendment-1";
const SHA256_HEX = "0".repeat(64);
const generatedDirectory = path.join(
  process.cwd(),
  "packages/model/src/internal/generated",
);

type JsonObject = Record<string, unknown>;

interface ValidationSnapshot {
  errors: unknown;
  valid: boolean;
}

interface ValidatorLike {
  (value: unknown): boolean;
  errors?: readonly unknown[] | null;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function compileReference(schema: object): ValidateFunction<unknown> {
  const ajv = new Ajv2020({
    allErrors: false,
    allowUnionTypes: true,
    strict: false,
    validateFormats: false,
  });
  ajv.addKeyword({
    keyword: "x-vivi-uniqueBy",
    schemaType: "string",
    valid: true,
  });
  return ajv.compile(schema);
}

function snapshotValidation(
  validator: ValidatorLike,
  value: unknown,
): ValidationSnapshot {
  const valid = validator(value);
  return {
    valid,
    errors: clone(validator.errors),
  };
}

function createEmbeddedProjectV11(): JsonObject {
  const value = clone(golden.v10RoundTrip.input) as JsonObject;
  value.version = 11;
  value.assetMode = "embedded";
  delete value.profile;
  value.atlases = (value.atlases as JsonObject[]).map((atlas, index) => ({
    id: `atlas-${index}`,
    ...atlas,
  }));
  value.extensions = {};
  value.embeddedAssets = {};
  value.requires = [];
  return value;
}

function createReferencedProjectV11(): JsonObject {
  const value = createEmbeddedProjectV11();
  value.assetMode = "referenced";
  value.atlases = (value.atlases as JsonObject[]).map((atlas) => ({
    ...atlas,
    image: {
      objectAddress: SHA256_HEX,
      storageKind: "blob",
      contentSha256: SHA256_HEX,
      mediaType: "image/png",
      sizeBytes: 1,
    },
  }));
  return value;
}

function createEvaluationPayload(): JsonObject {
  return {
    schema: "vivi2d.evaluationPayload.v1",
    canvas: { width: 1, height: 1 },
    layers: [],
    parameters: [],
    parameterBindings: [],
    skins: {},
    ikControllers: [],
    physicsGroups: [],
    colliders: [],
    expressionPresets: [],
    clips: [],
    stateMachines: [],
    atlases: [],
  };
}

function createEvaluationTexturePlan(): JsonObject {
  return {
    schema: "vivi2d.evaluationTexturePlan.v1",
    textures: [],
  };
}

function rawBase64ForDecodedByteLength(byteLength: number): string {
  const encodedLength = Math.ceil(byteLength / 3) * 4;
  const remainder = byteLength % 3;
  const padding = remainder === 1 ? "==" : remainder === 2 ? "=" : "";
  return `${"A".repeat(encodedLength - padding.length)}${padding}`;
}

function projectCorpus(): unknown[] {
  const embedded = createEmbeddedProjectV11();
  const referenced = createReferencedProjectV11();
  const missingVersion = clone(golden.v10RoundTrip.input) as JsonObject;
  delete missingVersion.version;
  const unknownRoot = clone(golden.v10RoundTrip.input) as JsonObject;
  unknownRoot.unexpected = true;
  const invalidBase64 = clone(embedded);
  (invalidBase64.atlases as JsonObject[])[0]!.image = "data:image/png;base64,AA==";
  const invalidStorageKind = clone(referenced);
  const invalidStorageImage = (invalidStorageKind.atlases as JsonObject[])[0]!
    .image as JsonObject;
  invalidStorageImage.storageKind = "filesystem";
  const astralMediaTypeBoundary = clone(referenced);
  const boundaryImage = (astralMediaTypeBoundary.atlases as JsonObject[])[0]!
    .image as JsonObject;
  boundaryImage.mediaType = "😀".repeat(255);
  const astralMediaTypeOverflow = clone(referenced);
  const overflowImage = (astralMediaTypeOverflow.atlases as JsonObject[])[0]!
    .image as JsonObject;
  overflowImage.mediaType = "😀".repeat(256);
  return [
    clone(golden.v10RoundTrip.input),
    embedded,
    referenced,
    astralMediaTypeBoundary,
    missingVersion,
    unknownRoot,
    invalidBase64,
    invalidStorageKind,
    astralMediaTypeOverflow,
    null,
    [],
  ];
}

function evaluationPayloadCorpus(): unknown[] {
  const minimal = createEvaluationPayload();
  const withLayer = clone(minimal);
  withLayer.layers = [
    {
      id: "group-a",
      name: "Group",
      visible: true,
      opacity: 1,
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      blendMode: "normal",
      expanded: true,
      children: [],
      kind: "group",
      clipMaskIds: ["mask-a"],
    },
  ];
  const duplicateUniqueItems = clone(withLayer);
  ((duplicateUniqueItems.layers as JsonObject[])[0]!.clipMaskIds as string[]).push(
    "mask-a",
  );
  const missingCanvas = clone(minimal);
  delete missingCanvas.canvas;
  const unknownRoot = clone(minimal);
  unknownRoot.unexpected = true;
  const invalidSchema = clone(minimal);
  invalidSchema.schema = "vivi2d.evaluationPayload.v2";
  const invalidLayer = clone(withLayer);
  delete (invalidLayer.layers as JsonObject[])[0]!.kind;
  return [
    minimal,
    withLayer,
    missingCanvas,
    unknownRoot,
    invalidSchema,
    invalidLayer,
    duplicateUniqueItems,
    null,
    [],
  ];
}

function evaluationTexturePlanCorpus(): unknown[] {
  const minimal = createEvaluationTexturePlan();
  const populated = clone(minimal);
  populated.textures = [
    {
      id: "atlas:main",
      asset: {
        objectAddress: SHA256_HEX,
        storageKind: "blob",
        contentSha256: SHA256_HEX,
        mediaType: "image/png",
        sizeBytes: 1,
      },
      width: 1,
      height: 1,
      mediaType: "image/png",
      colorSpace: "srgb",
      alphaMode: "straight",
    },
  ];
  const missingTextures = clone(minimal);
  delete missingTextures.textures;
  const invalidId = clone(populated);
  (invalidId.textures as JsonObject[])[0]!.id = "main";
  const unknownBindingKey = clone(populated);
  (unknownBindingKey.textures as JsonObject[])[0]!.unexpected = true;
  const invalidBlobSize = clone(populated);
  const invalidBlobAsset = (invalidBlobSize.textures as JsonObject[])[0]!
    .asset as JsonObject;
  invalidBlobAsset.sizeBytes = 16_777_217;
  return [
    minimal,
    populated,
    missingTextures,
    invalidId,
    unknownBindingKey,
    invalidBlobSize,
    null,
    [],
  ];
}

function expectParity(
  standaloneValidator: StandaloneSchemaValidator,
  referenceValidator: ValidateFunction<unknown>,
  corpus: readonly unknown[],
): void {
  for (const value of corpus) {
    const expected = snapshotValidation(referenceValidator, clone(value));
    const actual = snapshotValidation(standaloneValidator, clone(value));
    expect(actual).toEqual(expected);
  }
}

describe("precompiled approved schema validators", () => {
  it("locks generated bytes to the three approved schema identities", () => {
    expect(projectFormatV11SchemaIdentity).toEqual({
      id: PROJECT_SCHEMA_ID,
      status: APPROVED_STATUS,
      sha256: "a6aa7d36ca39505e69fa8ae5a1283cd949104703db92e671c435bbfa03e203bc",
    });
    expect(evaluationPayloadV1SchemaIdentity).toEqual({
      id: EVALUATION_PAYLOAD_SCHEMA_ID,
      status: APPROVED_STATUS,
      sha256: "8d65b5ddea137a71894e57ba6e14c94576aad63b2b7586728fa2bcca5bb125a3",
    });
    expect(evaluationTexturePlanV1SchemaIdentity).toEqual({
      id: EVALUATION_TEXTURE_PLAN_SCHEMA_ID,
      status: APPROVED_STATUS,
      sha256: "90e36afd066cc6f58eb134796779013caf13e9de184b1031b7d834b89fadf055",
    });

    const result = spawnSync(
      process.execPath,
      ["scripts/generate-schema-validators.mjs", "--check"],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    expect(result.status, result.stderr || result.stdout).toBe(0);
  });

  it("preserves compiled Ajv validity and exact error objects for existing corpus families", () => {
    expectParity(
      validateProjectFormatV11,
      compileReference(projectFormatV11Schema),
      projectCorpus(),
    );
    expectParity(
      validateEvaluationPayloadV1,
      compileReference(evaluationPayloadV1Schema),
      evaluationPayloadCorpus(),
    );
    expectParity(
      validateEvaluationTexturePlanV1,
      compileReference(evaluationTexturePlanV1Schema),
      evaluationTexturePlanCorpus(),
    );
  });

  it("preserves the RawBase64 language at representative padding boundaries", () => {
    const reference = compileReference(projectFormatV11Schema);
    for (const image of [
      "AAAA",
      "AA==",
      "AAA=",
      "A===",
      "AA=A",
      "AAAA=",
      "AAAA!AAA",
      "data:image/png;base64,AA==",
    ]) {
      const value = createEmbeddedProjectV11();
      (value.atlases as JsonObject[])[0]!.image = image;
      expect(snapshotValidation(validateProjectFormatV11, value)).toEqual(
        snapshotValidation(reference, clone(value)),
      );
    }
  });

  it.each([
    4 * 1024 * 1024,
    16 * 1024 * 1024,
  ])("validates a %i-byte RawBase64 value linearly for v1, v10, and v11 atlases", (decodedByteLength) => {
    const image = rawBase64ForDecodedByteLength(decodedByteLength);
    const legacyV1 = clone(golden.v10RoundTrip.input) as JsonObject;
    legacyV1.version = 1;
    (legacyV1.atlases as JsonObject[])[0]!.image = image;
    const legacyV10 = clone(golden.v10RoundTrip.input) as JsonObject;
    (legacyV10.atlases as JsonObject[])[0]!.image = image;
    const v11 = createEmbeddedProjectV11();
    (v11.atlases as JsonObject[])[0]!.image = image;

    expect(validateProjectFormatV11(legacyV1)).toBe(true);
    expect(validateProjectFormatV11.errors).toBeNull();
    expect(validateProjectFormatV11(legacyV10)).toBe(true);
    expect(validateProjectFormatV11.errors).toBeNull();
    expect(validateProjectFormatV11(v11)).toBe(true);
    expect(validateProjectFormatV11.errors).toBeNull();
  }, 30_000);

  it("executes source modules and ESM bundles with string code generation disabled", async () => {
    const cases = [
      {
        entry: path.join(generatedDirectory, "project-format-v11-validator.mjs"),
        exportName: "validateProjectFormatV11",
      },
      {
        entry: path.join(generatedDirectory, "evaluation-v1-validators.mjs"),
        exportName: "validateEvaluationPayloadV1",
      },
    ];
    const temporaryDirectory = fs.mkdtempSync(
      path.join(tmpdir(), "vivi2d-schema-validator-"),
    );
    try {
      for (const [index, testCase] of cases.entries()) {
        const buildResult = await build({
          configFile: false,
          logLevel: "silent",
          build: {
            minify: false,
            write: false,
            lib: {
              entry: testCase.entry,
              formats: ["es"],
            },
          },
        });
        const outputs = Array.isArray(buildResult) ? buildResult : [buildResult];
        const chunks = outputs.flatMap((output) => {
          if (!("output" in output)) {
            throw new Error("unexpected Vite watcher result");
          }
          return output.output.filter((entry) => entry.type === "chunk");
        });
        expect(chunks).toHaveLength(1);
        const code = chunks[0]!.code;
        expect(code).not.toMatch(/\brequire\s*\(/u);
        expect(code).not.toMatch(/\beval\s*\(/u);
        expect(code).not.toMatch(/\b(?:new\s+)?Function\s*\(/u);

        const bundlePath = path.join(temporaryDirectory, `validator-${index}.mjs`);
        fs.writeFileSync(bundlePath, code, "utf8");
        for (const modulePath of [testCase.entry, bundlePath]) {
          const smokeSource = [
            `const module = await import(${JSON.stringify(pathToFileURL(modulePath).href)});`,
            `const validator = module[${JSON.stringify(testCase.exportName)}];`,
            "if (typeof validator !== 'function') throw new Error('validator export missing');",
            "if (validator({}) !== false) throw new Error('invalid smoke value accepted');",
            "if (!Array.isArray(validator.errors)) throw new Error('errors missing');",
          ].join("\n");
          const smokeResult = spawnSync(
            process.execPath,
            [
              "--disallow-code-generation-from-strings",
              "--input-type=module",
              "--eval",
              smokeSource,
            ],
            { encoding: "utf8" },
          );
          expect(smokeResult.status, smokeResult.stderr || smokeResult.stdout).toBe(0);
        }
      }
    } finally {
      fs.rmSync(temporaryDirectory, { force: true, recursive: true });
    }
  }, 30_000);
});
