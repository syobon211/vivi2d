import {
  evaluationPayloadV1SchemaIdentity,
  evaluationTexturePlanV1SchemaIdentity,
  validateEvaluationPayloadV1 as payloadValidator,
  type StandaloneSchemaError,
  validateEvaluationTexturePlanV1 as texturePlanValidator,
} from "../internal/generated/evaluation-v1-validators.mjs";

export const EVALUATION_PAYLOAD_V1_SCHEMA_ID =
  "https://vivi2d.com/spec/evaluation-payload-v1.schema.json" as const;
export const EVALUATION_TEXTURE_PLAN_V1_SCHEMA_ID =
  "https://vivi2d.com/spec/evaluation-texture-plan-v1.schema.json" as const;

const EVALUATION_PAYLOAD_V1_APPROVED_SCHEMA_SHA256 =
  "8d65b5ddea137a71894e57ba6e14c94576aad63b2b7586728fa2bcca5bb125a3" as const;
const EVALUATION_TEXTURE_PLAN_V1_APPROVED_SCHEMA_SHA256 =
  "90e36afd066cc6f58eb134796779013caf13e9de184b1031b7d834b89fadf055" as const;

export interface EvaluationV1SchemaIssue {
  instancePath: string;
  schemaPath: string;
  keyword: string;
  message: string;
  params: Readonly<Record<string, unknown>>;
}

assertSchemaIdentity(
  evaluationPayloadV1SchemaIdentity,
  EVALUATION_PAYLOAD_V1_SCHEMA_ID,
  EVALUATION_PAYLOAD_V1_APPROVED_SCHEMA_SHA256,
  "Evaluation Payload v1",
);
assertSchemaIdentity(
  evaluationTexturePlanV1SchemaIdentity,
  EVALUATION_TEXTURE_PLAN_V1_SCHEMA_ID,
  EVALUATION_TEXTURE_PLAN_V1_APPROVED_SCHEMA_SHA256,
  "Evaluation Texture Plan v1",
);

export function validateEvaluationPayloadV1Schema(
  value: unknown,
): readonly EvaluationV1SchemaIssue[] {
  return validate(payloadValidator, value);
}

export function validateEvaluationTexturePlanV1Schema(
  value: unknown,
): readonly EvaluationV1SchemaIssue[] {
  return validate(texturePlanValidator, value);
}

function assertSchemaIdentity(
  identity: Readonly<{ id: string; sha256: string; status: string }>,
  expectedId: string,
  expectedSha256: string,
  label: string,
): void {
  if (identity.id !== expectedId) {
    throw new Error(`${label} schema ID mismatch: ${identity.id}`);
  }
  if (identity.status !== "approved-amendment-1") {
    throw new Error(`${label} schema status mismatch: ${identity.status}`);
  }
  if (identity.sha256 !== expectedSha256) {
    throw new Error(`${label} schema SHA-256 mismatch: ${identity.sha256}`);
  }
}

function validate(
  validator: typeof payloadValidator,
  value: unknown,
): readonly EvaluationV1SchemaIssue[] {
  if (validator(value)) return [];
  return (validator.errors ?? []).map(copyIssue);
}

function copyIssue(issue: StandaloneSchemaError): EvaluationV1SchemaIssue {
  return {
    instancePath: issue.instancePath,
    schemaPath: issue.schemaPath,
    keyword: issue.keyword,
    message: issue.message ?? "schema validation failed",
    params: { ...issue.params },
  };
}
