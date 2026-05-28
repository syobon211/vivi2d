import fs from "node:fs";
import path from "node:path";

const failures = [];

const CODE_CEILINGS = {
  localMotionPreviewV1: Object.freeze(
    JSON.parse(
      fs.readFileSync(
        path.join(
          process.cwd(),
          "packages/editor-core/src/local-motion-worker-ceilings.json",
        ),
        "utf8",
      ),
    ),
  ),
};

const VALID_HASH = `sha256:v1:${"a".repeat(64)}`;
const VALID_HMAC = `hmac-sha256:v1:${"1".repeat(64)}`;
const WORKER_INSTANCE_ID = "worker-1";
const ERROR_CODES = new Set([
  "timeout",
  "invalidRequest",
  "limitExceeded",
  "nonFiniteOutput",
  "internalPreviewFailure",
]);

const validRequest = Object.freeze({
  requestId: "request-1",
  operationId: "operation-1",
  draftId: "draft-1",
  baseDraftGeneration: 1,
  diagnosticVersion: "stress-diagnostic-v1",
  thresholdPolicyVersion: "threshold-policy-v1",
  thresholdPolicyHash: VALID_HASH,
  sourceBindingHash: VALID_HASH,
  meshTopologyHash: VALID_HASH,
  layerTextureHash: VALID_HASH,
  solverOptionsHash: VALID_HASH,
  solverKind: "guidedPreviewFit",
  handles: [
    {
      id: "handle-root",
      regionId: "region-hair",
      anchor: { x: 12, y: 24 },
      target: { x: 13, y: 25 },
      radiusPx: 8,
    },
  ],
  regions: [
    {
      id: "region-hair",
      bounds: { x: 0, y: 0, width: 64, height: 64 },
      protected: false,
    },
  ],
  options: {
    draftRequest: {
      maxIterations: 8,
      maxVertexCount: 256,
      maxHandleCount: 8,
      maxRegionCount: 2,
      maxScratchBytes: 1024 * 1024,
      maxSolveMs: 4,
      maxDisplacementPx: 24,
    },
    codeCeilingId: "localMotionPreviewV1",
    finiteOnly: true,
  },
});

const validResponse = Object.freeze({
  workerInstanceId: WORKER_INSTANCE_ID,
  requestId: "request-1",
  operationId: "operation-1",
  baseDraftGeneration: 1,
  responseKind: "previewResult",
  diagnosticVersion: "stress-diagnostic-v1",
  thresholdPolicyVersion: "threshold-policy-v1",
  thresholdPolicyHash: VALID_HASH,
  regionId: "region-hair",
  solverId: "preview-1",
  solverKind: "guidedPreviewFit",
  previewOnly: true,
  sourceBindingHash: VALID_HASH,
  meshTopologyHash: VALID_HASH,
  layerTextureHash: VALID_HASH,
  solverOptionsHash: VALID_HASH,
  baseRegionSha256s: { "region-hair": VALID_HASH },
  finiteRangeSummary: { min: -1, max: 1 },
  payloadHash: VALID_HASH,
  hmac: VALID_HMAC,
  maxDisplacementPx: 12,
  vertexCount: 3,
  byteLength: 24,
  bounds: { x: 0, y: 0, width: 64, height: 64 },
});

const validErrorResponse = Object.freeze({
  workerInstanceId: WORKER_INSTANCE_ID,
  requestId: "request-1",
  operationId: "operation-1",
  baseDraftGeneration: 1,
  responseKind: "previewError",
  diagnosticVersion: "stress-diagnostic-v1",
  thresholdPolicyVersion: "threshold-policy-v1",
  thresholdPolicyHash: VALID_HASH,
  solverOptionsHash: VALID_HASH,
  payloadHash: VALID_HASH,
  hmac: VALID_HMAC,
  error: {
    code: "timeout",
    message: "Worker timed out.",
  },
});

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function fail(message) {
  failures.push(message);
}

function isSha256V1(value) {
  return typeof value === "string" && /^sha256:v1:[a-f0-9]{64}$/i.test(value);
}

function isHmacSha256V1(value) {
  return typeof value === "string" && /^hmac-sha256:v1:[a-f0-9]{64}$/i.test(value);
}

function assertFiniteNumber(value, path) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${path} must be finite`);
  }
}

function assertPositiveInteger(value, path) {
  if (!Number.isInteger(value) || value <= 0) {
    fail(`${path} must be a positive integer`);
  }
}

function assertNonNegativeInteger(value, path) {
  if (!Number.isInteger(value) || value < 0) {
    fail(`${path} must be a non-negative integer`);
  }
}

function assertNonNegativeFinite(value, path) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    fail(`${path} must be a non-negative finite number`);
  }
}

function assertPositiveFinite(value, path) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    fail(`${path} must be a positive finite number`);
  }
}

function assertNonEmptyString(value, path) {
  if (typeof value !== "string" || value.length === 0) {
    fail(`${path} must be a non-empty string`);
  }
}

function validateBounds(bounds, path) {
  if (!isRecord(bounds)) {
    fail(`${path} must be an object`);
    return;
  }
  for (const key of ["x", "y", "width", "height"]) {
    assertFiniteNumber(bounds[key], `${path}.${key}`);
  }
  if (bounds.width <= 0 || bounds.height <= 0) {
    fail(`${path} must have positive width and height`);
  }
}

function validateWorkerRequest(request) {
  if (!isRecord(request)) {
    fail("request must be an object");
    return;
  }
  for (const key of [
    "thresholdPolicyHash",
    "sourceBindingHash",
    "meshTopologyHash",
    "layerTextureHash",
    "solverOptionsHash",
  ]) {
  if (!isSha256V1(request[key])) fail(`request.${key} must be sha256:v1`);
  }
  if (typeof request.operationId !== "string" || request.operationId === "") {
    fail("request.operationId must be a non-empty string");
  }
  if (typeof request.requestId !== "string" || request.requestId === "") {
    fail("request.requestId must be a non-empty string");
  }
  if (typeof request.diagnosticVersion !== "string" || request.diagnosticVersion === "") {
    fail("request.diagnosticVersion must be a non-empty string");
  }
  if (
    typeof request.thresholdPolicyVersion !== "string" ||
    request.thresholdPolicyVersion === ""
  ) {
    fail("request.thresholdPolicyVersion must be a non-empty string");
  }
  if (typeof request.draftId !== "string" || request.draftId === "") {
    fail("request.draftId must be a non-empty string");
  }
  if (!["guidedPreviewFit", "mlsPreview", "arapPreview"].includes(request.solverKind)) {
    fail("request.solverKind is unsupported");
  }
  if (!Number.isInteger(request.baseDraftGeneration) || request.baseDraftGeneration < 0) {
    fail("request.baseDraftGeneration must be a non-negative integer");
  }
  if (!Array.isArray(request.handles) || request.handles.length === 0) {
    fail("request.handles must be a non-empty array");
  } else {
    if (request.handles.length > CODE_CEILINGS[request.options.codeCeilingId].maxHandleCount) {
      fail("request.handles exceeds code ceiling");
    }
    for (const [index, handle] of request.handles.entries()) {
      if (!isRecord(handle)) {
        fail(`request.handles[${index}] must be an object`);
        continue;
      }
      assertNonEmptyString(handle.id, `request.handles[${index}].id`);
      assertNonEmptyString(handle.regionId, `request.handles[${index}].regionId`);
      validatePoint(handle.anchor, `request.handles[${index}].anchor`);
      if (handle.target !== undefined) {
        validatePoint(handle.target, `request.handles[${index}].target`);
      }
      assertPositiveFinite(handle.radiusPx, `request.handles[${index}].radiusPx`);
    }
  }
  if (!Array.isArray(request.regions) || request.regions.length === 0) {
    fail("request.regions must be a non-empty array");
  } else if (
    request.regions.length > CODE_CEILINGS[request.options.codeCeilingId].maxRegionCount
  ) {
    fail("request.regions exceeds code ceiling");
  }
  for (const [index, region] of request.regions.entries()) {
    assertNonEmptyString(region?.id, `request.regions[${index}].id`);
    validateBounds(region?.bounds, `request.regions[${index}].bounds`);
    if (typeof region?.protected !== "boolean") {
      fail(`request.regions[${index}].protected must be boolean`);
    }
  }
  const options = request.options;
  if (!isRecord(options) || options.finiteOnly !== true) {
    fail("request.options.finiteOnly must be true");
    return;
  }
  const ceilings = CODE_CEILINGS[options.codeCeilingId];
  if (!ceilings) {
    fail("request.options.codeCeilingId is unsupported");
    return;
  }
  const draftRequest = options.draftRequest;
  if (!isRecord(draftRequest)) {
    fail("request.options.draftRequest must be an object");
    return;
  }
  for (const [key, ceiling] of Object.entries(ceilings)) {
    if (key === "maxResponseBytes") continue;
    assertNonNegativeFinite(draftRequest[key], `request.options.draftRequest.${key}`);
    if (draftRequest[key] > ceiling) {
      fail(`request.options.draftRequest.${key} exceeds code ceiling`);
    }
  }
}

function validatePoint(point, path) {
  if (!isRecord(point)) {
    fail(`${path} must be an object`);
    return;
  }
  assertFiniteNumber(point.x, `${path}.x`);
  assertFiniteNumber(point.y, `${path}.y`);
}

function validateWorkerResponse(response, request) {
  if (!isRecord(response)) {
    fail("response must be an object");
    return;
  }
  if (response.previewOnly !== true) fail("response.previewOnly must be true");
  if (typeof response.workerInstanceId !== "string" || response.workerInstanceId === "") {
    fail("response.workerInstanceId must be a non-empty string");
  } else if (response.workerInstanceId !== WORKER_INSTANCE_ID) {
    fail("response.workerInstanceId must match the pending worker");
  }
  if (response.responseKind !== "previewResult") {
    fail("response.responseKind must be previewResult");
  }
  if (response.requestId !== request.requestId) {
    fail("response.requestId must match request");
  }
  if (response.diagnosticVersion !== request.diagnosticVersion) {
    fail("response.diagnosticVersion must match request");
  }
  if (response.thresholdPolicyVersion !== request.thresholdPolicyVersion) {
    fail("response.thresholdPolicyVersion must match request");
  }
  if (response.thresholdPolicyHash !== request.thresholdPolicyHash) {
    fail("response.thresholdPolicyHash must match request");
  }
  if (!isSha256V1(response.payloadHash)) fail("response.payloadHash must be sha256:v1");
  if (!isHmacSha256V1(response.hmac)) {
    fail("response.hmac must be hmac-sha256:v1");
  }
  for (const key of [
    "sourceBindingHash",
    "meshTopologyHash",
    "layerTextureHash",
    "solverOptionsHash",
  ]) {
    if (response[key] !== request[key]) fail(`response.${key} must match request`);
  }
  if (response.operationId !== request.operationId) {
    fail("response.operationId must match request");
  }
  if (response.baseDraftGeneration !== request.baseDraftGeneration) {
    fail("response.baseDraftGeneration must match request");
  }
  if (response.solverKind !== request.solverKind) {
    fail("response.solverKind must match request");
  }
  if (!isRecord(response.baseRegionSha256s)) {
    fail("response.baseRegionSha256s must be an object");
  } else {
    for (const region of request.regions) {
      if (response.baseRegionSha256s[region.id] == null) {
        fail(`response.baseRegionSha256s is missing region ${region.id}`);
      }
    }
    for (const [regionId, hash] of Object.entries(response.baseRegionSha256s)) {
      if (!request.regions.some((region) => region.id === regionId)) {
        fail(`response.baseRegionSha256s contains unknown region ${regionId}`);
      }
      if (!isSha256V1(hash)) fail(`response.baseRegionSha256s.${regionId} invalid`);
    }
  }
  validateBounds(response.bounds, "response.bounds");
  assertNonNegativeInteger(response.vertexCount, "response.vertexCount");
  if (response.vertexCount > CODE_CEILINGS[request.options.codeCeilingId].maxVertexCount) {
    fail("response.vertexCount exceeds code ceiling");
  }
  assertNonNegativeInteger(response.byteLength, "response.byteLength");
  if (response.byteLength > CODE_CEILINGS[request.options.codeCeilingId].maxResponseBytes) {
    fail("response.byteLength exceeds code ceiling");
  }
  assertFiniteNumber(response.maxDisplacementPx, "response.maxDisplacementPx");
  if (response.maxDisplacementPx > request.options.draftRequest.maxDisplacementPx) {
    fail("response.maxDisplacementPx exceeds request limit");
  }
  if (!isRecord(response.finiteRangeSummary)) {
    fail("response.finiteRangeSummary must be an object");
  } else {
    assertFiniteNumber(response.finiteRangeSummary.min, "response.finiteRangeSummary.min");
    assertFiniteNumber(response.finiteRangeSummary.max, "response.finiteRangeSummary.max");
  }
}

function validateWorkerErrorResponse(response, request) {
  if (!isRecord(response)) {
    fail("error response must be an object");
    return;
  }
  if (response.workerInstanceId !== WORKER_INSTANCE_ID) {
    fail("error response.workerInstanceId must match the pending worker");
  }
  if (response.responseKind !== "previewError") {
    fail("error response.responseKind must be previewError");
  }
  if (response.requestId !== request.requestId) {
    fail("error response.requestId must match request");
  }
  if (response.diagnosticVersion !== request.diagnosticVersion) {
    fail("error response.diagnosticVersion must match request");
  }
  if (response.thresholdPolicyVersion !== request.thresholdPolicyVersion) {
    fail("error response.thresholdPolicyVersion must match request");
  }
  if (response.thresholdPolicyHash !== request.thresholdPolicyHash) {
    fail("error response.thresholdPolicyHash must match request");
  }
  if (response.operationId !== request.operationId) {
    fail("error response.operationId must match request");
  }
  if (response.baseDraftGeneration !== request.baseDraftGeneration) {
    fail("error response.baseDraftGeneration must match request");
  }
  if (response.solverOptionsHash !== request.solverOptionsHash) {
    fail("error response.solverOptionsHash must match request");
  }
  if (!isSha256V1(response.payloadHash)) {
    fail("error response.payloadHash must be sha256:v1");
  }
  if (!isHmacSha256V1(response.hmac)) {
    fail("error response.hmac must be hmac-sha256:v1");
  }
  if (!isRecord(response.error)) {
    fail("error response.error must be an object");
    return;
  }
  if (!ERROR_CODES.has(response.error.code)) {
    fail("error response.error.code must be public and bounded");
  }
  if (
    typeof response.error.message !== "string" ||
    response.error.message.length === 0 ||
    response.error.message.length > 240
  ) {
    fail("error response.error.message must be short and non-empty");
  } else if (
    /[A-Za-z]:\\|\/Users\/|\/home\/|LocalMotion|PreviewSolver|deformedVertices|solver/i.test(
      response.error.message,
    )
  ) {
    fail("error response.error.message must not leak paths or private preview markers");
  }
}

validateWorkerRequest(validRequest);
validateWorkerResponse(validResponse, validRequest);
validateWorkerErrorResponse(validErrorResponse, validRequest);

const invalidMissingPreviewOnly = { ...validResponse, previewOnly: false };
const beforeInvalidCount = failures.length;
validateWorkerResponse(invalidMissingPreviewOnly, validRequest);
const expectedNegativeFailures = failures.splice(beforeInvalidCount);
if (
  expectedNegativeFailures.length !== 1 ||
  !expectedNegativeFailures[0].includes("response.previewOnly")
) {
  fail("negative fixture did not reject previewOnly false");
}

const invalidErrorLeak = {
  ...validErrorResponse,
  error: {
    code: "internalPreviewFailure",
    message: "LocalMotion preview failed at C:\\Users\\secret\\debug.log",
  },
};
const beforeInvalidErrorCount = failures.length;
validateWorkerErrorResponse(invalidErrorLeak, validRequest);
const expectedNegativeErrorFailures = failures.splice(beforeInvalidErrorCount);
if (
  expectedNegativeErrorFailures.length !== 1 ||
  !expectedNegativeErrorFailures[0].includes("must not leak paths")
) {
  fail("negative fixture did not reject leaking worker error messages");
}

if (failures.length > 0) {
  console.error("[local-motion-worker-fixtures] failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("[local-motion-worker-fixtures] passed");
