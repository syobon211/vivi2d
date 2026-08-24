import {
  projectFormatV11SchemaIdentity,
  type StandaloneSchemaError,
  validateProjectFormatV11 as validator,
} from "../internal/generated/project-format-v11-validator.mjs";

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

assertProjectFormatV11SchemaIdentity();

export function validateProjectFormatV11Schema(
  value: unknown,
): readonly ProjectFormatV11SchemaIssue[] {
  if (validator(value)) return [];
  return (validator.errors ?? []).map(copyIssue);
}

export function assertProjectFormatV11SchemaIdentity(): void {
  if (projectFormatV11SchemaIdentity.id !== PROJECT_FORMAT_V11_SCHEMA_ID) {
    throw new Error(
      `Project Format v11 schema ID mismatch: ${projectFormatV11SchemaIdentity.id}`,
    );
  }
  if (projectFormatV11SchemaIdentity.status !== "approved-amendment-1") {
    throw new Error(
      `Project Format v11 schema status mismatch: ${projectFormatV11SchemaIdentity.status}`,
    );
  }
  if (
    projectFormatV11SchemaIdentity.sha256 !== PROJECT_FORMAT_V11_APPROVED_SCHEMA_SHA256
  ) {
    throw new Error(
      `Project Format v11 schema SHA-256 mismatch: ${projectFormatV11SchemaIdentity.sha256}`,
    );
  }
}

function copyIssue(issue: StandaloneSchemaError): ProjectFormatV11SchemaIssue {
  return {
    instancePath: issue.instancePath,
    schemaPath: issue.schemaPath,
    keyword: issue.keyword,
    message: issue.message ?? "schema validation failed",
    params: { ...issue.params },
  };
}
