import type { LocalMotionRect, LocalMotionVec2 } from "./local-motion";
import ceilingConfig from "./local-motion-worker-ceilings.json";
import { stableStringify } from "./safe-auto-setup-plan";
import { createStableSha256V1 } from "./stable-hash";

export type LocalMotionWorkerHash = `sha256:v1:${string}`;
export type LocalMotionWorkerHmac = `hmac-sha256:v1:${string}`;
export type LocalMotionWorkerSolverKind =
  | "guidedPreviewFit"
  | "mlsPreview"
  | "arapPreview";
export type LocalMotionWorkerResponseKind = "previewResult" | "previewError";

export interface LocalMotionWorkerDraftRequest {
  maxIterations: number;
  maxVertexCount: number;
  maxHandleCount: number;
  maxRegionCount: number;
  maxScratchBytes: number;
  maxSolveMs: number;
  maxDisplacementPx: number;
}

export interface LocalMotionWorkerHandleInput {
  id: string;
  regionId: string;
  anchor: LocalMotionVec2;
  target?: LocalMotionVec2;
  radiusPx: number;
}

export interface LocalMotionWorkerRegionInput {
  id: string;
  bounds: LocalMotionRect;
  protected: boolean;
}

export interface LocalMotionWorkerRequest {
  requestId: string;
  operationId: string;
  draftId: string;
  baseDraftGeneration: number;
  diagnosticVersion: string;
  thresholdPolicyVersion: string;
  thresholdPolicyHash: LocalMotionWorkerHash;
  sourceBindingHash: LocalMotionWorkerHash;
  meshTopologyHash: LocalMotionWorkerHash;
  layerTextureHash: LocalMotionWorkerHash;
  solverOptionsHash: LocalMotionWorkerHash;
  solverKind: LocalMotionWorkerSolverKind;
  handles: readonly LocalMotionWorkerHandleInput[];
  regions: readonly LocalMotionWorkerRegionInput[];
  options: {
    draftRequest: LocalMotionWorkerDraftRequest;
    codeCeilingId: "localMotionPreviewV1";
    finiteOnly: true;
  };
}

export interface LocalMotionWorkerResponse {
  workerInstanceId: string;
  requestId: string;
  operationId: string;
  baseDraftGeneration: number;
  responseKind: "previewResult";
  diagnosticVersion: string;
  thresholdPolicyVersion: string;
  thresholdPolicyHash: LocalMotionWorkerHash;
  regionId: string;
  solverId: string;
  solverKind: LocalMotionWorkerSolverKind;
  sourceBindingHash: LocalMotionWorkerHash;
  meshTopologyHash: LocalMotionWorkerHash;
  layerTextureHash: LocalMotionWorkerHash;
  solverOptionsHash: LocalMotionWorkerHash;
  baseRegionSha256s: Readonly<Record<string, LocalMotionWorkerHash>>;
  previewOnly: true;
  payloadHash: LocalMotionWorkerHash;
  hmac: LocalMotionWorkerHmac;
  bounds: LocalMotionRect;
  vertexCount: number;
  byteLength: number;
  maxDisplacementPx: number;
  finiteRangeSummary: {
    min: number;
    max: number;
  };
}

export type LocalMotionWorkerErrorCode =
  | "timeout"
  | "invalidRequest"
  | "limitExceeded"
  | "nonFiniteOutput"
  | "internalPreviewFailure";

export interface LocalMotionWorkerErrorResponse {
  workerInstanceId: string;
  requestId: string;
  operationId: string;
  baseDraftGeneration: number;
  responseKind: "previewError";
  diagnosticVersion: string;
  thresholdPolicyVersion: string;
  thresholdPolicyHash: LocalMotionWorkerHash;
  solverOptionsHash: LocalMotionWorkerHash;
  payloadHash: LocalMotionWorkerHash;
  hmac: LocalMotionWorkerHmac;
  error: {
    code: LocalMotionWorkerErrorCode;
    message: string;
  };
}

export interface LocalMotionPendingWorkerOperation {
  workerInstanceId: string;
  requestId: string;
  operationId: string;
  baseDraftGeneration: number;
  diagnosticVersion: string;
  thresholdPolicyVersion: string;
  thresholdPolicyHash: LocalMotionWorkerHash;
  solverKind: LocalMotionWorkerSolverKind;
  sourceBindingHash: LocalMotionWorkerHash;
  meshTopologyHash: LocalMotionWorkerHash;
  layerTextureHash: LocalMotionWorkerHash;
  solverOptionsHash: LocalMotionWorkerHash;
  baseRegionSha256s: Readonly<Record<string, LocalMotionWorkerHash>>;
  requestedMaxDisplacementPx: number;
}

export interface LocalMotionWorkerValidationDiagnostic {
  code:
    | "invalidShape"
    | "invalidHash"
    | "invalidFiniteValue"
    | "unsupportedCeiling"
    | "limitExceeded"
    | "staleResponse"
    | "previewOnlyRequired"
    | "invalidHmac";
  path: string;
  message: string;
}

export interface LocalMotionWorkerValidationResult {
  ok: boolean;
  diagnostics: readonly LocalMotionWorkerValidationDiagnostic[];
}

export interface LocalMotionWorkerResponseValidationOptions {
  verifyHmac: (payload: string, hmac: LocalMotionWorkerHmac) => boolean;
}

export const LOCAL_MOTION_WORKER_CEILINGS = Object.freeze(ceilingConfig);

const HASH_PATTERN = /^sha256:v1:[0-9a-f]{64}$/i;
const HMAC_PATTERN = /^hmac-sha256:v1:[0-9a-f]{64}$/i;
const ERROR_MESSAGE_MAX_LENGTH = 240;
const ERROR_CODES = new Set<LocalMotionWorkerErrorCode>([
  "timeout",
  "invalidRequest",
  "limitExceeded",
  "nonFiniteOutput",
  "internalPreviewFailure",
]);
const SOLVERS = new Set<LocalMotionWorkerSolverKind>([
  "guidedPreviewFit",
  "mlsPreview",
  "arapPreview",
]);

export const LOCAL_MOTION_WORKER_ERROR_FORBIDDEN_PATTERNS = Object.freeze([
  /[A-Za-z]:\\/,
  /\/Users\//,
  /\/home\//,
  /LocalMotion/,
  /PreviewSolver/,
  /deformedVertices/,
  /\bsolver\b/i,
  /motionStressPreview/,
  /previewOnly/,
  /diagnosticHash/,
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function push(
  diagnostics: LocalMotionWorkerValidationDiagnostic[],
  code: LocalMotionWorkerValidationDiagnostic["code"],
  path: string,
  message: string,
): void {
  diagnostics.push({ code, path, message });
}

function validateHash(
  value: unknown,
  path: string,
  diagnostics: LocalMotionWorkerValidationDiagnostic[],
): value is LocalMotionWorkerHash {
  if (typeof value === "string" && HASH_PATTERN.test(value)) return true;
  push(diagnostics, "invalidHash", path, "Expected a sha256:v1 hash.");
  return false;
}

function validateHmac(
  value: unknown,
  path: string,
  diagnostics: LocalMotionWorkerValidationDiagnostic[],
): value is LocalMotionWorkerHmac {
  if (typeof value === "string" && HMAC_PATTERN.test(value)) return true;
  push(diagnostics, "invalidHmac", path, "Expected an hmac-sha256:v1 value.");
  return false;
}

function validateNonEmptyString(
  value: unknown,
  path: string,
  diagnostics: LocalMotionWorkerValidationDiagnostic[],
): value is string {
  if (typeof value === "string" && value.length > 0) return true;
  push(diagnostics, "invalidShape", path, "Expected non-empty string.");
  return false;
}

function validateRect(
  value: unknown,
  path: string,
  diagnostics: LocalMotionWorkerValidationDiagnostic[],
): void {
  if (!isRecord(value)) {
    push(diagnostics, "invalidShape", path, "Expected bounds object.");
    return;
  }
  for (const key of ["x", "y", "width", "height"] as const) {
    if (!isFiniteNumber(value[key])) {
      push(diagnostics, "invalidFiniteValue", `${path}.${key}`, "Expected finite number.");
    }
  }
  if ((value.width as number) <= 0 || (value.height as number) <= 0) {
    push(diagnostics, "invalidShape", path, "Bounds must have positive size.");
  }
}

function validateVec2(
  value: unknown,
  path: string,
  diagnostics: LocalMotionWorkerValidationDiagnostic[],
): void {
  if (!isRecord(value)) {
    push(diagnostics, "invalidShape", path, "Expected point object.");
    return;
  }
  if (!isFiniteNumber(value.x)) {
    push(diagnostics, "invalidFiniteValue", `${path}.x`, "Expected finite number.");
  }
  if (!isFiniteNumber(value.y)) {
    push(diagnostics, "invalidFiniteValue", `${path}.y`, "Expected finite number.");
  }
}

function validateCeilingValue(
  request: Record<string, unknown>,
  key: keyof typeof LOCAL_MOTION_WORKER_CEILINGS,
  diagnostics: LocalMotionWorkerValidationDiagnostic[],
): void {
  const value = request[key];
  if (!isFiniteNumber(value) || value < 0) {
    push(diagnostics, "invalidFiniteValue", `options.draftRequest.${key}`, "Expected non-negative finite number.");
    return;
  }
  if (value > LOCAL_MOTION_WORKER_CEILINGS[key]) {
    push(diagnostics, "limitExceeded", `options.draftRequest.${key}`, "Requested worker limit exceeds the code ceiling.");
  }
}

export function validateLocalMotionWorkerRequest(
  value: unknown,
): LocalMotionWorkerValidationResult {
  const diagnostics: LocalMotionWorkerValidationDiagnostic[] = [];
  if (!isRecord(value)) {
    return {
      ok: false,
      diagnostics: [
        {
          code: "invalidShape",
          path: "$",
          message: "Expected worker request object.",
        },
      ],
    };
  }

  for (const key of [
    "thresholdPolicyHash",
    "sourceBindingHash",
    "meshTopologyHash",
    "layerTextureHash",
    "solverOptionsHash",
  ] as const) {
    validateHash(value[key], key, diagnostics);
  }
  if (typeof value.requestId !== "string" || value.requestId === "") {
    push(diagnostics, "invalidShape", "requestId", "requestId is required.");
  }
  if (typeof value.operationId !== "string" || value.operationId === "") {
    push(diagnostics, "invalidShape", "operationId", "operationId is required.");
  }
  if (typeof value.diagnosticVersion !== "string" || value.diagnosticVersion === "") {
    push(diagnostics, "invalidShape", "diagnosticVersion", "diagnosticVersion is required.");
  }
  if (typeof value.thresholdPolicyVersion !== "string" || value.thresholdPolicyVersion === "") {
    push(diagnostics, "invalidShape", "thresholdPolicyVersion", "thresholdPolicyVersion is required.");
  }
  if (typeof value.draftId !== "string" || value.draftId === "") {
    push(diagnostics, "invalidShape", "draftId", "draftId is required.");
  }
  const baseDraftGeneration = value.baseDraftGeneration;
  if (
    !Number.isInteger(baseDraftGeneration) ||
    (baseDraftGeneration as number) < 0
  ) {
    push(diagnostics, "invalidFiniteValue", "baseDraftGeneration", "Generation must be a non-negative integer.");
  }
  if (typeof value.solverKind !== "string" || !SOLVERS.has(value.solverKind as never)) {
    push(diagnostics, "invalidShape", "solverKind", "Unsupported preview solver kind.");
  }
  if (!Array.isArray(value.handles)) {
    push(diagnostics, "invalidShape", "handles", "handles must be an array.");
  } else {
    if (value.handles.length > LOCAL_MOTION_WORKER_CEILINGS.maxHandleCount) {
      push(diagnostics, "limitExceeded", "handles", "Too many handles.");
    }
    value.handles.forEach((handle, index) => {
      if (!isRecord(handle)) {
        push(diagnostics, "invalidShape", `handles[${index}]`, "Expected handle object.");
        return;
      }
      validateNonEmptyString(handle.id, `handles[${index}].id`, diagnostics);
      validateNonEmptyString(handle.regionId, `handles[${index}].regionId`, diagnostics);
      validateVec2(handle.anchor, `handles[${index}].anchor`, diagnostics);
      if (handle.target !== undefined) {
        validateVec2(handle.target, `handles[${index}].target`, diagnostics);
      }
      if (!isFiniteNumber(handle.radiusPx) || handle.radiusPx <= 0) {
        push(diagnostics, "invalidFiniteValue", `handles[${index}].radiusPx`, "Handle radius must be positive.");
      }
    });
  }
  if (!Array.isArray(value.regions)) {
    push(diagnostics, "invalidShape", "regions", "regions must be an array.");
  } else {
    if (value.regions.length > LOCAL_MOTION_WORKER_CEILINGS.maxRegionCount) {
      push(diagnostics, "limitExceeded", "regions", "Too many regions.");
    }
    value.regions.forEach((region, index) => {
      if (!isRecord(region)) {
        push(diagnostics, "invalidShape", `regions[${index}]`, "Expected region object.");
        return;
      }
      validateNonEmptyString(region.id, `regions[${index}].id`, diagnostics);
      validateRect(region.bounds, `regions[${index}].bounds`, diagnostics);
      if (typeof region.protected !== "boolean") {
        push(diagnostics, "invalidShape", `regions[${index}].protected`, "Protected flag must be boolean.");
      }
    });
  }

  if (!isRecord(value.options)) {
    push(diagnostics, "invalidShape", "options", "options object is required.");
  } else {
    if (value.options.codeCeilingId !== "localMotionPreviewV1") {
      push(diagnostics, "unsupportedCeiling", "options.codeCeilingId", "Unsupported local motion worker ceiling.");
    }
    if (value.options.finiteOnly !== true) {
      push(diagnostics, "invalidShape", "options.finiteOnly", "finiteOnly must be true.");
    }
    if (!isRecord(value.options.draftRequest)) {
      push(diagnostics, "invalidShape", "options.draftRequest", "draftRequest object is required.");
    } else {
      for (const key of Object.keys(LOCAL_MOTION_WORKER_CEILINGS) as Array<keyof typeof LOCAL_MOTION_WORKER_CEILINGS>) {
        if (key === "maxResponseBytes") continue;
        validateCeilingValue(value.options.draftRequest, key, diagnostics);
      }
    }
  }

  return {
    ok: diagnostics.length === 0,
    diagnostics,
  };
}

export function validateLocalMotionWorkerResponse(
  value: unknown,
  pending: LocalMotionPendingWorkerOperation,
  options: LocalMotionWorkerResponseValidationOptions,
): LocalMotionWorkerValidationResult {
  const diagnostics: LocalMotionWorkerValidationDiagnostic[] = [];
  if (!isRecord(value)) {
    return {
      ok: false,
      diagnostics: [
        {
          code: "invalidShape",
          path: "$",
          message: "Expected worker response object.",
        },
      ],
    };
  }

  if (value.previewOnly !== true) {
    push(diagnostics, "previewOnlyRequired", "previewOnly", "Worker response must be preview-only.");
  }
  if (value.workerInstanceId !== pending.workerInstanceId) {
    push(diagnostics, "staleResponse", "workerInstanceId", "Worker response does not match the pending worker instance.");
  }
  if (value.responseKind !== "previewResult") {
    push(diagnostics, "invalidShape", "responseKind", "Worker response kind must be previewResult.");
  }
  for (const key of [
    "requestId",
    "operationId",
    "baseDraftGeneration",
    "diagnosticVersion",
    "thresholdPolicyVersion",
    "thresholdPolicyHash",
    "solverKind",
    "sourceBindingHash",
    "meshTopologyHash",
    "layerTextureHash",
    "solverOptionsHash",
  ] as const) {
    if (value[key] !== pending[key]) {
      push(diagnostics, "staleResponse", key, "Worker response does not match the pending operation.");
    }
  }
  validateHash(value.payloadHash, "payloadHash", diagnostics);
  const expectedPayloadHash = isRecord(value)
    ? createLocalMotionWorkerResponsePayloadHash(value)
    : undefined;
  if (expectedPayloadHash && value.payloadHash !== expectedPayloadHash) {
    push(diagnostics, "staleResponse", "payloadHash", "Worker response payload hash does not match response fields.");
  }
  const hmacIsValidShape = validateHmac(value.hmac, "hmac", diagnostics);
  const verifyHmac =
    typeof options?.verifyHmac === "function" ? options.verifyHmac : undefined;
  if (!verifyHmac) {
    push(diagnostics, "invalidHmac", "hmac", "Worker response HMAC verification is required.");
  } else if (
    hmacIsValidShape &&
    typeof value.workerInstanceId === "string" &&
    typeof value.operationId === "string" &&
    Number.isInteger(value.baseDraftGeneration) &&
    value.responseKind === "previewResult" &&
    typeof value.requestId === "string" &&
    typeof value.diagnosticVersion === "string" &&
    typeof value.thresholdPolicyVersion === "string" &&
    typeof value.thresholdPolicyHash === "string" &&
    typeof value.payloadHash === "string" &&
    typeof value.solverOptionsHash === "string" &&
    verifyHmac(
      createLocalMotionWorkerHmacPayload({
        workerInstanceId: value.workerInstanceId,
        requestId: value.requestId,
        operationId: value.operationId,
        requestGeneration: value.baseDraftGeneration as number,
        responseKind: value.responseKind,
        diagnosticVersion: value.diagnosticVersion,
        thresholdPolicyVersion: value.thresholdPolicyVersion,
        thresholdPolicyHash: value.thresholdPolicyHash as LocalMotionWorkerHash,
        solverOptionsHash: value.solverOptionsHash as LocalMotionWorkerHash,
        payloadHash: value.payloadHash as LocalMotionWorkerHash,
      }),
      value.hmac as LocalMotionWorkerHmac,
    ) === false
  ) {
    push(diagnostics, "invalidHmac", "hmac", "Worker response HMAC verification failed.");
  }
  if (typeof value.regionId !== "string" || value.regionId === "") {
    push(diagnostics, "invalidShape", "regionId", "regionId is required.");
  } else if (!(value.regionId in pending.baseRegionSha256s)) {
    push(diagnostics, "staleResponse", "regionId", "Response region is not part of the pending operation.");
  }
  if (typeof value.solverId !== "string" || value.solverId === "") {
    push(diagnostics, "invalidShape", "solverId", "solverId is required.");
  }
  validateRect(value.bounds, "bounds", diagnostics);
  const vertexCount = value.vertexCount;
  if (!Number.isInteger(vertexCount) || (vertexCount as number) < 0) {
    push(diagnostics, "invalidFiniteValue", "vertexCount", "vertexCount must be non-negative integer.");
  } else if ((vertexCount as number) > LOCAL_MOTION_WORKER_CEILINGS.maxVertexCount) {
    push(diagnostics, "limitExceeded", "vertexCount", "Response vertex count exceeds the code ceiling.");
  }
  const byteLength = value.byteLength;
  if (!Number.isInteger(byteLength) || (byteLength as number) < 0) {
    push(diagnostics, "invalidFiniteValue", "byteLength", "byteLength must be non-negative integer.");
  } else if ((byteLength as number) > LOCAL_MOTION_WORKER_CEILINGS.maxResponseBytes) {
    push(diagnostics, "limitExceeded", "byteLength", "Response payload exceeds the code ceiling.");
  }
  if (
    !isFiniteNumber(value.maxDisplacementPx) ||
    value.maxDisplacementPx < 0 ||
    value.maxDisplacementPx >
      Math.min(
        LOCAL_MOTION_WORKER_CEILINGS.maxDisplacementPx,
        pending.requestedMaxDisplacementPx,
      )
  ) {
    push(diagnostics, "limitExceeded", "maxDisplacementPx", "Response displacement is outside the allowed range.");
  }
  if (!isRecord(value.finiteRangeSummary)) {
    push(diagnostics, "invalidShape", "finiteRangeSummary", "finite range summary is required.");
  } else {
    if (!isFiniteNumber(value.finiteRangeSummary.min)) {
      push(diagnostics, "invalidFiniteValue", "finiteRangeSummary.min", "Expected finite number.");
    }
    if (!isFiniteNumber(value.finiteRangeSummary.max)) {
      push(diagnostics, "invalidFiniteValue", "finiteRangeSummary.max", "Expected finite number.");
    }
  }
  if (!isRecord(value.baseRegionSha256s)) {
    push(diagnostics, "invalidShape", "baseRegionSha256s", "base region hashes are required.");
  } else {
    for (const regionId of Object.keys(value.baseRegionSha256s)) {
      if (!(regionId in pending.baseRegionSha256s)) {
        push(diagnostics, "staleResponse", `baseRegionSha256s.${regionId}`, "Unexpected region hash.");
      }
    }
    for (const [regionId, hash] of Object.entries(pending.baseRegionSha256s)) {
      if (value.baseRegionSha256s[regionId] !== hash) {
        push(diagnostics, "staleResponse", `baseRegionSha256s.${regionId}`, "Region hash drifted.");
      }
      validateHash(value.baseRegionSha256s[regionId], `baseRegionSha256s.${regionId}`, diagnostics);
    }
  }

  return {
    ok: diagnostics.length === 0,
    diagnostics,
  };
}

export function validateLocalMotionWorkerErrorResponse(
  value: unknown,
  pending: LocalMotionPendingWorkerOperation,
  options: LocalMotionWorkerResponseValidationOptions,
): LocalMotionWorkerValidationResult {
  const diagnostics: LocalMotionWorkerValidationDiagnostic[] = [];
  if (!isRecord(value)) {
    return {
      ok: false,
      diagnostics: [
        {
          code: "invalidShape",
          path: "$",
          message: "Expected worker error response object.",
        },
      ],
    };
  }

  if (value.workerInstanceId !== pending.workerInstanceId) {
    push(diagnostics, "staleResponse", "workerInstanceId", "Worker error response does not match the pending worker instance.");
  }
  if (value.requestId !== pending.requestId) {
    push(diagnostics, "staleResponse", "requestId", "Worker error response request id is stale.");
  }
  if (value.operationId !== pending.operationId) {
    push(diagnostics, "staleResponse", "operationId", "Worker error response does not match the pending operation.");
  }
  if (value.baseDraftGeneration !== pending.baseDraftGeneration) {
    push(diagnostics, "staleResponse", "baseDraftGeneration", "Worker error response generation is stale.");
  }
  if (value.responseKind !== "previewError") {
    push(diagnostics, "invalidShape", "responseKind", "Worker error response kind must be previewError.");
  }
  if (value.diagnosticVersion !== pending.diagnosticVersion) {
    push(diagnostics, "staleResponse", "diagnosticVersion", "Worker error response diagnostic version is stale.");
  }
  if (value.thresholdPolicyVersion !== pending.thresholdPolicyVersion) {
    push(diagnostics, "staleResponse", "thresholdPolicyVersion", "Worker error response threshold policy version is stale.");
  }
  if (value.thresholdPolicyHash !== pending.thresholdPolicyHash) {
    push(diagnostics, "staleResponse", "thresholdPolicyHash", "Worker error response threshold policy hash is stale.");
  }
  if (value.solverOptionsHash !== pending.solverOptionsHash) {
    push(diagnostics, "staleResponse", "solverOptionsHash", "Worker error response solver options hash is stale.");
  }
  validateHash(value.payloadHash, "payloadHash", diagnostics);
  const expectedPayloadHash = isRecord(value)
    ? createLocalMotionWorkerResponsePayloadHash(value)
    : undefined;
  if (expectedPayloadHash && value.payloadHash !== expectedPayloadHash) {
    push(diagnostics, "staleResponse", "payloadHash", "Worker error response payload hash does not match response fields.");
  }
  const hmacIsValidShape = validateHmac(value.hmac, "hmac", diagnostics);
  const verifyHmac =
    typeof options?.verifyHmac === "function" ? options.verifyHmac : undefined;
  if (!verifyHmac) {
    push(diagnostics, "invalidHmac", "hmac", "Worker error response HMAC verification is required.");
  } else if (
    hmacIsValidShape &&
    typeof value.workerInstanceId === "string" &&
    typeof value.operationId === "string" &&
    Number.isInteger(value.baseDraftGeneration) &&
    value.responseKind === "previewError" &&
    typeof value.requestId === "string" &&
    typeof value.diagnosticVersion === "string" &&
    typeof value.thresholdPolicyVersion === "string" &&
    typeof value.thresholdPolicyHash === "string" &&
    typeof value.payloadHash === "string" &&
    typeof value.solverOptionsHash === "string" &&
    verifyHmac(
      createLocalMotionWorkerHmacPayload({
        workerInstanceId: value.workerInstanceId,
        requestId: value.requestId,
        operationId: value.operationId,
        requestGeneration: value.baseDraftGeneration as number,
        responseKind: value.responseKind,
        diagnosticVersion: value.diagnosticVersion,
        thresholdPolicyVersion: value.thresholdPolicyVersion,
        thresholdPolicyHash: value.thresholdPolicyHash as LocalMotionWorkerHash,
        solverOptionsHash: value.solverOptionsHash as LocalMotionWorkerHash,
        payloadHash: value.payloadHash as LocalMotionWorkerHash,
      }),
      value.hmac as LocalMotionWorkerHmac,
    ) === false
  ) {
    push(diagnostics, "invalidHmac", "hmac", "Worker error response HMAC verification failed.");
  }

  if (!isRecord(value.error)) {
    push(diagnostics, "invalidShape", "error", "Worker error response must contain a bounded error object.");
  } else {
    const error = value.error;
    if (typeof error.code !== "string" || !ERROR_CODES.has(error.code as never)) {
      push(diagnostics, "invalidShape", "error.code", "Worker error code is not in the public catalog.");
    }
    const message = error.message;
    if (
      typeof message !== "string" ||
      message.length === 0 ||
      message.length > ERROR_MESSAGE_MAX_LENGTH
    ) {
      push(diagnostics, "limitExceeded", "error.message", "Worker error message must be short and non-empty.");
    } else if (
      LOCAL_MOTION_WORKER_ERROR_FORBIDDEN_PATTERNS.some((pattern) =>
        pattern.test(message),
      )
    ) {
      push(diagnostics, "invalidShape", "error.message", "Worker error message leaks paths or private preview markers.");
    }
  }

  return {
    ok: diagnostics.length === 0,
    diagnostics,
  };
}

export function createLocalMotionWorkerHmacPayload(input: {
  workerInstanceId: string;
  requestId: string;
  operationId: string;
  requestGeneration: number;
  responseKind: LocalMotionWorkerResponseKind;
  diagnosticVersion: string;
  thresholdPolicyVersion: string;
  thresholdPolicyHash: LocalMotionWorkerHash;
  solverOptionsHash: LocalMotionWorkerHash;
  payloadHash: LocalMotionWorkerHash;
}): string {
  return stableStringify({
    protocol: "vivi2d-local-motion-worker-v1",
    diagnosticVersion: input.diagnosticVersion,
    operationId: input.operationId,
    payloadHash: input.payloadHash,
    requestGeneration: input.requestGeneration,
    requestId: input.requestId,
    responseKind: input.responseKind,
    solverOptionsHash: input.solverOptionsHash,
    thresholdPolicyHash: input.thresholdPolicyHash,
    thresholdPolicyVersion: input.thresholdPolicyVersion,
    workerInstanceId: input.workerInstanceId,
  });
}

export function createLocalMotionWorkerResponsePayloadHash(
  response: Record<string, unknown>,
): LocalMotionWorkerHash {
  const { hmac: _hmac, payloadHash: _payloadHash, ...payload } = response;
  return createStableSha256V1(stableStringify(payload));
}
