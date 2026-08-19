import Ajv2020, { type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import evaluationPayloadV1Schema from "./evaluation-payload-v1.schema.json";
import evaluationTexturePlanV1Schema from "./evaluation-texture-plan-v1.schema.json";

export const EVALUATION_PAYLOAD_V1_SCHEMA_ID =
  "https://vivi2d.com/spec/evaluation-payload-v1.schema.json" as const;
export const EVALUATION_TEXTURE_PLAN_V1_SCHEMA_ID =
  "https://vivi2d.com/spec/evaluation-texture-plan-v1.schema.json" as const;

export interface EvaluationV1SchemaIssue {
  instancePath: string;
  schemaPath: string;
  keyword: string;
  message: string;
  params: Readonly<Record<string, unknown>>;
}

const payloadValidator = compileSchema(
  evaluationPayloadV1Schema,
  EVALUATION_PAYLOAD_V1_SCHEMA_ID,
  "Evaluation Payload v1",
);
const texturePlanValidator = compileSchema(
  evaluationTexturePlanV1Schema,
  EVALUATION_TEXTURE_PLAN_V1_SCHEMA_ID,
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

function compileSchema(
  schema: Record<string, unknown>,
  expectedId: string,
  label: string,
): ValidateFunction<unknown> {
  if (schema.$id !== expectedId) {
    throw new Error(`${label} schema ID mismatch: ${String(schema.$id)}`);
  }
  if (schema["x-vivi-status"] !== "approved-amendment-1") {
    throw new Error(
      `${label} schema status mismatch: ${String(schema["x-vivi-status"])}`,
    );
  }

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

function validate(
  validator: ValidateFunction<unknown>,
  value: unknown,
): readonly EvaluationV1SchemaIssue[] {
  if (validator(value)) return [];
  return (validator.errors ?? []).map(copyIssue);
}

function copyIssue(issue: ErrorObject): EvaluationV1SchemaIssue {
  return {
    instancePath: issue.instancePath,
    schemaPath: issue.schemaPath,
    keyword: issue.keyword,
    message: issue.message ?? "schema validation failed",
    params: { ...issue.params },
  };
}
