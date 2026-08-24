import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import Ajv2020, { type ValidateFunction } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import {
  assertProjectFormatV11SchemaIdentity,
  PROJECT_FORMAT_V11_APPROVED_SCHEMA_SHA256,
  PROJECT_FORMAT_V11_SCHEMA_ID,
  validateProjectFormatV11Schema,
} from "../project-format-v11/schema";
import golden from "./fixtures/project-format-v11-golden.json";

type JsonObject = Record<string, unknown>;
type JsonSchema = Record<string, any>;

const APPROVED_SCHEMA_SHA256 =
  "a6aa7d36ca39505e69fa8ae5a1283cd949104703db92e671c435bbfa03e203bc";
const SCHEMA_STATUS = "approved-amendment-1";
const UNKNOWN_KEY = "__unexpected_v11";
const SHA256_HEX = "0".repeat(64);

const schemaPath = path.join(
  process.cwd(),
  "packages/model/src/project-format-v11/project-format-v11.schema.json",
);
const schemaBytes = readFileSync(schemaPath);
const schemaSource = schemaBytes.toString("utf8");
const schema = JSON.parse(schemaSource) as JsonSchema;

const v10Fixture = structuredClone(golden.v10RoundTrip.input) as JsonObject;

function createEmbeddedV11(): JsonObject {
  const sourceAtlases = structuredClone(v10Fixture.atlases) as JsonObject[];
  return {
    version: 11,
    assetMode: "embedded",
    documentId: "00000000-0000-4000-8000-000000000000",
    requires: [],
    project: structuredClone(v10Fixture.project),
    atlases: sourceAtlases.map((atlas, index) => ({
      id: `atlas-${index}`,
      ...atlas,
    })),
    extensions: {},
    embeddedAssets: {},
  };
}

function createReferencedV11(): JsonObject {
  const embedded = createEmbeddedV11();
  const atlases = (embedded.atlases as JsonObject[]).map((atlas) => ({
    ...atlas,
    image: {
      objectAddress: SHA256_HEX,
      storageKind: "blob",
      contentSha256: SHA256_HEX,
      mediaType: "image/png",
      sizeBytes: 1,
    },
  }));
  return {
    ...embedded,
    assetMode: "referenced",
    atlases,
  };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function expectSchemaIssue(
  value: unknown,
  expected: {
    instancePath: string;
    keyword: string;
    params?: Record<string, unknown>;
  },
): void {
  const issues = validateProjectFormatV11Schema(value);
  expect(issues).toContainEqual(
    expect.objectContaining({
      instancePath: expected.instancePath,
      keyword: expected.keyword,
      ...(expected.params === undefined ? {} : { params: expected.params }),
    }),
  );
}

function withOwnEntry(value: JsonObject, key: string, entry: unknown): JsonObject {
  Object.defineProperty(value, key, {
    configurable: true,
    enumerable: true,
    value: entry,
    writable: true,
  });
  return value;
}

function resolveLocalRef(ref: string): JsonSchema {
  const prefix = "#/$defs/";
  if (!ref.startsWith(prefix)) {
    throw new Error(`Unsupported schema reference in T-STRICT synthesizer: ${ref}`);
  }
  const definitionName = ref.slice(prefix.length);
  const definition = schema.$defs?.[definitionName] as JsonSchema | undefined;
  if (definition === undefined) {
    throw new Error(`Unknown schema definition: ${definitionName}`);
  }
  return definition;
}

function selectedBranch(node: JsonSchema, branchIndex?: number): JsonSchema | undefined {
  if (!Array.isArray(node.oneOf)) return undefined;
  return node.oneOf[branchIndex ?? 0] as JsonSchema | undefined;
}

function schemasContributingToObject(
  node: JsonSchema,
  branchIndex?: number,
): JsonSchema[] {
  const contributors: JsonSchema[] = [node];
  if (typeof node.$ref === "string") {
    contributors.push(...schemasContributingToObject(resolveLocalRef(node.$ref)));
  }
  if (Array.isArray(node.allOf)) {
    for (const member of node.allOf as JsonSchema[]) {
      if (member.if !== undefined) continue;
      contributors.push(...schemasContributingToObject(member));
    }
  }
  const branch = selectedBranch(node, branchIndex);
  if (branch !== undefined) {
    contributors.push(...schemasContributingToObject(branch));
  }
  return contributors;
}

function propertySchema(
  node: JsonSchema,
  propertyName: string,
  branchIndex?: number,
): JsonSchema | undefined {
  const contributors = schemasContributingToObject(node, branchIndex);
  for (let index = contributors.length - 1; index >= 0; index -= 1) {
    const contributor = contributors[index]!;
    const candidate = contributor.properties?.[propertyName] as JsonSchema | undefined;
    if (candidate !== undefined) return candidate;
  }
  return undefined;
}

function requiredProperties(node: JsonSchema, branchIndex?: number): string[] {
  const names = new Set<string>();
  for (const contributor of schemasContributingToObject(node, branchIndex)) {
    if (!Array.isArray(contributor.required)) continue;
    for (const propertyName of contributor.required as string[]) names.add(propertyName);
  }
  return [...names];
}

function inferType(node: JsonSchema, branchIndex?: number): string | undefined {
  if (typeof node.type === "string") return node.type;
  if (node.const !== undefined) {
    if (node.const === null) return "null";
    if (Array.isArray(node.const)) return "array";
    return typeof node.const;
  }
  if (Array.isArray(node.enum) && node.enum.length > 0) {
    const first = node.enum[0];
    if (first === null) return "null";
    if (Array.isArray(first)) return "array";
    return typeof first;
  }
  if (typeof node.$ref === "string") {
    return inferType(resolveLocalRef(node.$ref));
  }
  if (Array.isArray(node.allOf)) {
    for (const member of node.allOf as JsonSchema[]) {
      const memberType = inferType(member);
      if (memberType !== undefined) return memberType;
    }
  }
  const branch = selectedBranch(node, branchIndex);
  if (branch !== undefined) return inferType(branch);
  if (node.properties !== undefined || node.required !== undefined) return "object";
  if (node.items !== undefined) return "array";
  return undefined;
}

function mergeInstances(left: unknown, right: unknown): unknown {
  if (
    typeof left === "object" &&
    left !== null &&
    !Array.isArray(left) &&
    typeof right === "object" &&
    right !== null &&
    !Array.isArray(right)
  ) {
    return { ...(left as JsonObject), ...(right as JsonObject) };
  }
  return right;
}

function stringForPattern(pattern: string | undefined, minimumLength: number): string {
  const candidates = [
    "a",
    "id",
    "atlas-a",
    "vivi.cap.test",
    "AA==",
    SHA256_HEX,
    "00000000-0000-4000-8000-000000000000",
  ];
  if (pattern !== undefined) {
    const expression = new RegExp(pattern, "u");
    const matching = candidates.find(
      (candidate) => candidate.length >= minimumLength && expression.test(candidate),
    );
    if (matching !== undefined) return matching;
  }
  return "a".repeat(Math.max(1, minimumLength));
}

function synthesize(node: JsonSchema, branchIndex?: number): unknown {
  if (node.const !== undefined) return clone(node.const);
  if (Array.isArray(node.enum) && node.enum.length > 0) return clone(node.enum[0]);

  let result: unknown;
  if (typeof node.$ref === "string") {
    result = synthesize(resolveLocalRef(node.$ref));
  }

  const branch = selectedBranch(node, branchIndex);
  if (branch !== undefined && inferType(branch) !== "object") {
    result = mergeInstances(result, synthesize(branch));
  }

  const type = inferType(node, branchIndex);
  if (result === undefined) {
    switch (type) {
      case "null":
        result = null;
        break;
      case "boolean":
        result = false;
        break;
      case "integer":
      case "number": {
        const minimum =
          typeof node.minimum === "number"
            ? node.minimum
            : typeof node.exclusiveMinimum === "number"
              ? node.exclusiveMinimum + 1
              : 0;
        result = minimum;
        break;
      }
      case "string":
        result = stringForPattern(
          typeof node.pattern === "string" ? node.pattern : undefined,
          typeof node.minLength === "number" ? node.minLength : 0,
        );
        break;
      case "array": {
        const count = typeof node.minItems === "number" ? node.minItems : 0;
        const prefixItems = Array.isArray(node.prefixItems)
          ? (node.prefixItems as JsonSchema[])
          : [];
        const itemSchema = node.items as JsonSchema | undefined;
        result = Array.from({ length: count }, (_unused, index) => {
          const schemaForIndex = prefixItems[index] ?? itemSchema;
          return schemaForIndex === undefined ? null : synthesize(schemaForIndex);
        });
        break;
      }
      case "object":
        result = {};
        break;
      default:
        result = null;
    }
  }

  if (Array.isArray(node.allOf)) {
    for (const member of node.allOf as JsonSchema[]) {
      if (member.if !== undefined) continue;
      if (type === "object") continue;
      if (inferType(member) === undefined) continue;
      result = mergeInstances(result, synthesize(member));
    }
  }

  if (type === "object") {
    const object =
      typeof result === "object" && result !== null && !Array.isArray(result)
        ? (result as JsonObject)
        : {};
    for (const propertyName of requiredProperties(node, branchIndex)) {
      if (Object.hasOwn(object, propertyName)) continue;
      const childSchema = propertySchema(node, propertyName, branchIndex);
      if (childSchema === undefined) {
        throw new Error(`No schema found for required property ${propertyName}`);
      }
      object[propertyName] = synthesize(childSchema);
    }
    result = object;
  }

  return result;
}

function isClosedObjectAtRoot(node: JsonSchema, branchIndex?: number): boolean {
  if (node.additionalProperties === false && node.patternProperties === undefined) {
    return true;
  }
  if (typeof node.$ref === "string" && isClosedObjectAtRoot(resolveLocalRef(node.$ref))) {
    return true;
  }
  const branch = selectedBranch(node, branchIndex);
  return branch !== undefined && isClosedObjectAtRoot(branch);
}

interface StrictTarget {
  branchIndex?: number;
  definitionName: string;
  label: string;
}

function strictTargets(): StrictTarget[] {
  const targets: StrictTarget[] = [];
  for (const [definitionName, definition] of Object.entries(
    schema.$defs as Record<string, JsonSchema>,
  )) {
    if (definitionName === "ViviJsonValueV11") continue;
    const branchCount = Array.isArray(definition.oneOf) ? definition.oneOf.length : 0;
    if (branchCount > 0) {
      for (let branchIndex = 0; branchIndex < branchCount; branchIndex += 1) {
        if (!isClosedObjectAtRoot(definition, branchIndex)) continue;
        targets.push({
          branchIndex,
          definitionName,
          label: `${definitionName}#oneOf/${branchIndex}`,
        });
      }
      continue;
    }
    if (isClosedObjectAtRoot(definition)) {
      targets.push({ definitionName, label: definitionName });
    }
  }
  return targets;
}

function inlineClosedFixedObjectPointers(): string[] {
  const pointers: string[] = [];
  const visit = (node: unknown, pointer: string): void => {
    if (typeof node !== "object" || node === null || Array.isArray(node)) return;
    const object = node as JsonSchema;
    const isDefinitionRoot = /^\/\$defs\/[^/]+$/u.test(pointer);
    const isDefinitionBranch = /^\/\$defs\/[^/]+\/oneOf\/\d+$/u.test(pointer);
    if (
      pointer !== "" &&
      !isDefinitionRoot &&
      !isDefinitionBranch &&
      object.additionalProperties === false &&
      object.patternProperties === undefined
    ) {
      pointers.push(pointer);
    }
    for (const [key, value] of Object.entries(object)) {
      if (key === "$ref") continue;
      if (Array.isArray(value)) {
        value.forEach((entry, index) => {
          visit(entry, `${pointer}/${key}/${index}`);
        });
      } else {
        visit(value, `${pointer}/${key}`);
      }
    }
  };
  visit(schema, "");
  return pointers;
}

function schemaAtPointer(pointer: string): JsonSchema {
  return pointer
    .slice(1)
    .split("/")
    .reduce<unknown>((current, segment) => {
      if (typeof current !== "object" || current === null) {
        throw new Error(`Invalid schema pointer ${pointer}`);
      }
      return (current as Record<string, unknown>)[segment];
    }, schema) as JsonSchema;
}

function createSchemaPointerValidator(pointer: string): ValidateFunction<unknown> {
  const ajv = new Ajv2020({
    allErrors: true,
    allowUnionTypes: true,
    strict: false,
    validateFormats: false,
  });
  ajv.addKeyword({ keyword: "x-vivi-uniqueBy", schemaType: "string", valid: true });
  ajv.addSchema(schema);
  return ajv.compile({
    $ref: `${PROJECT_FORMAT_V11_SCHEMA_ID}#${pointer}`,
  });
}

function createDefinitionValidator(definitionName: string): ValidateFunction<unknown> {
  return createSchemaPointerValidator(`/$defs/${definitionName}`);
}

describe("Project Format v11 production Stage 1 schema", () => {
  it("pins the approved schema bytes, identity, and status", () => {
    expect(schemaBytes).toHaveLength(56_486);
    expect(schemaBytes.at(-1)).toBe(0x0a);
    const actualSha256 = createHash("sha256").update(schemaBytes).digest("hex");

    expect(actualSha256).toBe(APPROVED_SCHEMA_SHA256);
    expect(PROJECT_FORMAT_V11_APPROVED_SCHEMA_SHA256).toBe(APPROVED_SCHEMA_SHA256);
    expect(schema.$id).toBe(PROJECT_FORMAT_V11_SCHEMA_ID);
    expect(schema["x-vivi-status"]).toBe(SCHEMA_STATUS);
    expect(() => assertProjectFormatV11SchemaIdentity()).not.toThrow();
  });

  it.each([
    ["frozen v10", v10Fixture],
    ["canonical v11 embedded", createEmbeddedV11()],
    ["canonical v11 referenced", createReferencedV11()],
  ])("accepts %s", (_label, value) => {
    expect(validateProjectFormatV11Schema(value)).toEqual([]);
  });

  it("reports the exact root and nested containers for unknown keys", () => {
    for (const value of [v10Fixture, createEmbeddedV11(), createReferencedV11()]) {
      const rootUnknown = { ...clone(value), [UNKNOWN_KEY]: true };
      expectSchemaIssue(rootUnknown, {
        instancePath: "",
        keyword: "additionalProperties",
        params: { additionalProperty: UNKNOWN_KEY },
      });
    }

    const nestedUnknown = createEmbeddedV11();
    (nestedUnknown.project as JsonObject)[UNKNOWN_KEY] = true;
    expectSchemaIssue(nestedUnknown, {
      instancePath: "/project",
      keyword: "additionalProperties",
      params: { additionalProperty: UNKNOWN_KEY },
    });
  });

  it("bounds diagnostics for adversarial objects instead of collecting every issue", () => {
    const value = createEmbeddedV11();
    const project = value.project as JsonObject;
    for (let index = 0; index < 10_000; index += 1) {
      project[`unexpected_${index}`] = true;
    }

    const issues = validateProjectFormatV11Schema(value);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.length).toBeLessThan(10);
    expect(issues).toContainEqual(
      expect.objectContaining({
        instancePath: "/project",
        keyword: "additionalProperties",
      }),
    );
  });

  it("rejects a missing canonical v11 project field", () => {
    const value = createEmbeddedV11();
    delete (value.project as JsonObject).name;
    expectSchemaIssue(value, {
      instancePath: "/project",
      keyword: "required",
      params: { missingProperty: "name" },
    });
  });

  it("rejects profile on both v11 carrier branches", () => {
    for (const value of [createEmbeddedV11(), createReferencedV11()]) {
      value.profile = "publicProfileV1";
      expectSchemaIssue(value, { instancePath: "", keyword: "not", params: {} });
    }
  });

  it.each([
    ["referenced image in embedded mode", createEmbeddedV11(), createReferencedV11()],
    ["base64 image in referenced mode", createReferencedV11(), createEmbeddedV11()],
  ])("rejects a mixed carrier: %s", (_label, target, source) => {
    const value = clone(target);
    const replacement = (source.atlases as JsonObject[])[0]?.image;
    (value.atlases as JsonObject[])[0]!.image = clone(replacement);
    expectSchemaIssue(value, { instancePath: "/atlases/0/image", keyword: "type" });
  });

  it.each([
    "__proto__",
    "constructor",
    "prototype",
  ])("rejects the pollution key %s in dynamic maps", (pollutionKey) => {
    const extensionMap = createEmbeddedV11();
    extensionMap.extensions = withOwnEntry({}, pollutionKey, {
      schemaVersion: 1,
      requiredCapabilityId: "vivi.cap.test",
      data: null,
    });
    expectSchemaIssue(extensionMap, {
      instancePath: "/extensions",
      keyword: "additionalProperties",
      params: { additionalProperty: pollutionKey },
    });

    const embeddedAssetMap = createEmbeddedV11();
    embeddedAssetMap.embeddedAssets = withOwnEntry({}, pollutionKey, {
      contentSha256: SHA256_HEX,
      sizeBytes: 1,
      encoding: "base64",
      data: "AA==",
    });
    expectSchemaIssue(embeddedAssetMap, {
      instancePath: "/embeddedAssets",
      keyword: "additionalProperties",
      params: { additionalProperty: pollutionKey },
    });

    const skinMap = createEmbeddedV11();
    (skinMap.project as JsonObject).skins = withOwnEntry({}, pollutionKey, {});
    expectSchemaIssue(skinMap, {
      instancePath: "/project/skins",
      keyword: "additionalProperties",
      params: { additionalProperty: pollutionKey },
    });

    const extensionData = createEmbeddedV11();
    extensionData.extensions = {
      "vivi.extension.test": {
        schemaVersion: 1,
        requiredCapabilityId: "vivi.cap.test",
        data: withOwnEntry({}, pollutionKey, null),
      },
    };
    expectSchemaIssue(extensionData, {
      instancePath: "/extensions/vivi.extension.test/data",
      keyword: "propertyNames",
      params: { propertyName: pollutionKey },
    });
  });

  it("rejects an injected unknown key for every fixed-key $defs object and oneOf branch", () => {
    const targets = strictTargets();
    expect(
      Object.values(schema.$defs as Record<string, JsonSchema>).filter(
        (definition) => definition.additionalProperties === false,
      ),
    ).toHaveLength(62);
    expect(targets).toHaveLength(75);

    const validators = new Map<string, ValidateFunction<unknown>>();
    for (const target of targets) {
      const validator =
        validators.get(target.definitionName) ??
        createDefinitionValidator(target.definitionName);
      validators.set(target.definitionName, validator);

      const definition = schema.$defs[target.definitionName] as JsonSchema;
      const instance = synthesize(definition, target.branchIndex);
      expect(
        validator(instance),
        `${target.label} synthesizer baseline: ${JSON.stringify({ instance, errors: validator.errors })}`,
      ).toBe(true);

      const injected = { ...(instance as JsonObject), [UNKNOWN_KEY]: null };
      expect(validator(injected), `${target.label} accepted an unknown key`).toBe(false);
      expect(
        validator.errors,
        `${target.label} did not report the injected key`,
      ).toContainEqual(
        expect.objectContaining({
          instancePath: "",
          keyword: "additionalProperties",
          params: { additionalProperty: UNKNOWN_KEY },
        }),
      );
    }
  });

  it("rejects an injected unknown key for every inline fixed-key object", () => {
    const pointers = inlineClosedFixedObjectPointers();
    expect(pointers).toEqual(["/$defs/VisemeMappingV11/properties/target"]);

    for (const pointer of pointers) {
      const target = schemaAtPointer(pointer);
      const validator = createSchemaPointerValidator(pointer);
      const instance = synthesize(target);
      expect(
        validator(instance),
        `${pointer} synthesizer baseline: ${JSON.stringify({ instance, errors: validator.errors })}`,
      ).toBe(true);

      const injected = { ...(instance as JsonObject), [UNKNOWN_KEY]: null };
      expect(validator(injected), `${pointer} accepted an unknown key`).toBe(false);
      expect(validator.errors).toContainEqual(
        expect.objectContaining({
          instancePath: "",
          keyword: "additionalProperties",
          params: { additionalProperty: UNKNOWN_KEY },
        }),
      );
    }
  });
});
