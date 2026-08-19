import Ajv2020, { type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import projectFormatV11Schema from "./project-format-v11.schema.json";

export const PROJECT_FORMAT_V11_SCHEMA_ID =
  "https://vivi2d.com/spec/project-format-v11.schema.json" as const;
export const PROJECT_FORMAT_V11_APPROVED_SCHEMA_SHA256 =
  "a6aa7d36ca39505e69fa8ae5a1283cd949104703db92e671c435bbfa03e203bc" as const;

export interface ProjectFormatV11SchemaIssue {
  instancePath: string;
  schemaPath: string;
  keyword: string;
  message: string;
  params: Readonly<Record<string, unknown>>;
}

const validator = compileProjectFormatV11Schema();

export function validateProjectFormatV11Schema(
  value: unknown,
): readonly ProjectFormatV11SchemaIssue[] {
  if (validator(value)) return [];
  return (validator.errors ?? []).map(copyIssue);
}

export function assertProjectFormatV11SchemaIdentity(): void {
  if (projectFormatV11Schema.$id !== PROJECT_FORMAT_V11_SCHEMA_ID) {
    throw new Error(
      `Project Format v11 schema ID mismatch: ${String(projectFormatV11Schema.$id)}`,
    );
  }
  if (projectFormatV11Schema["x-vivi-status"] !== "approved-amendment-1") {
    throw new Error(
      `Project Format v11 schema status mismatch: ${String(
        projectFormatV11Schema["x-vivi-status"],
      )}`,
    );
  }
}

function compileProjectFormatV11Schema(): ValidateFunction<unknown> {
  assertProjectFormatV11SchemaIdentity();
  const ajv = new Ajv2020({
    allErrors: false,
    allowUnionTypes: true,
    strict: false,
    validateFormats: false,
  });

  // Amendment A-08 assigns this annotation to Stage 2. Generic JSON Schema
  // evaluation must not silently turn it into a different structural rule.
  ajv.addKeyword({
    keyword: "x-vivi-uniqueBy",
    schemaType: "string",
    valid: true,
  });

  return ajv.compile(projectFormatV11Schema);
}

function copyIssue(issue: ErrorObject): ProjectFormatV11SchemaIssue {
  return {
    instancePath: issue.instancePath,
    schemaPath: issue.schemaPath,
    keyword: issue.keyword,
    message: issue.message ?? "schema validation failed",
    params: { ...issue.params },
  };
}
