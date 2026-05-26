import { describe, expect, it } from "vitest";
import {
  createLocalMotionWorkerHmacPayload,
  createLocalMotionWorkerResponsePayloadHash,
  validateLocalMotionWorkerErrorResponse,
  validateLocalMotionWorkerRequest,
  validateLocalMotionWorkerResponse,
  type LocalMotionPendingWorkerOperation,
  type LocalMotionWorkerErrorResponse,
  type LocalMotionWorkerRequest,
  type LocalMotionWorkerResponse,
} from "../local-motion-worker";

const hash = (seed: string) =>
  `sha256:v1:${seed.repeat(64).slice(0, 64)}` as const;

const acceptWorkerHmac = Object.freeze({ verifyHmac: () => true });

function withPayloadHash<T extends Record<string, unknown>>(value: T): T {
  return {
    ...value,
    payloadHash: createLocalMotionWorkerResponsePayloadHash(value),
  };
}

function createRequest(): LocalMotionWorkerRequest {
  return {
    requestId: "req-1",
    operationId: "op-1",
    draftId: "draft-1",
    baseDraftGeneration: 2,
    diagnosticVersion: "stress-v1",
    thresholdPolicyVersion: "policy-v1",
    thresholdPolicyHash: hash("9"),
    sourceBindingHash: hash("a"),
    meshTopologyHash: hash("b"),
    layerTextureHash: hash("c"),
    solverOptionsHash: hash("d"),
    solverKind: "guidedPreviewFit",
    handles: [
      {
        id: "h-root",
        regionId: "r-1",
        anchor: { x: 10, y: 20 },
        target: { x: 12, y: 24 },
        radiusPx: 12,
      },
    ],
    regions: [
      {
        id: "r-1",
        protected: false,
        bounds: { x: 0, y: 0, width: 100, height: 120 },
      },
    ],
    options: {
      codeCeilingId: "localMotionPreviewV1",
      finiteOnly: true,
      draftRequest: {
        maxIterations: 8,
        maxVertexCount: 512,
        maxHandleCount: 4,
        maxRegionCount: 1,
        maxScratchBytes: 1024 * 1024,
        maxSolveMs: 4,
        maxDisplacementPx: 16,
      },
    },
  };
}

function createPending(request = createRequest()): LocalMotionPendingWorkerOperation {
  return {
    workerInstanceId: "worker-1",
    requestId: request.requestId,
    operationId: request.operationId,
    baseDraftGeneration: request.baseDraftGeneration,
    diagnosticVersion: request.diagnosticVersion,
    thresholdPolicyVersion: request.thresholdPolicyVersion,
    thresholdPolicyHash: request.thresholdPolicyHash,
    solverKind: request.solverKind,
    sourceBindingHash: request.sourceBindingHash,
    meshTopologyHash: request.meshTopologyHash,
    layerTextureHash: request.layerTextureHash,
    solverOptionsHash: request.solverOptionsHash,
    baseRegionSha256s: { "r-1": hash("e") },
    requestedMaxDisplacementPx: request.options.draftRequest.maxDisplacementPx,
  };
}

function createResponse(request = createRequest()): LocalMotionWorkerResponse {
  const response = {
    workerInstanceId: "worker-1",
    requestId: request.requestId,
    operationId: request.operationId,
    baseDraftGeneration: request.baseDraftGeneration,
    responseKind: "previewResult" as const,
    diagnosticVersion: request.diagnosticVersion,
    thresholdPolicyVersion: request.thresholdPolicyVersion,
    thresholdPolicyHash: request.thresholdPolicyHash,
    regionId: "r-1",
    solverId: "diagnostic-run-1",
    solverKind: request.solverKind,
    sourceBindingHash: request.sourceBindingHash,
    meshTopologyHash: request.meshTopologyHash,
    layerTextureHash: request.layerTextureHash,
    solverOptionsHash: request.solverOptionsHash,
    baseRegionSha256s: { "r-1": hash("e") },
    previewOnly: true as const,
    payloadHash: hash("f"),
    hmac: `hmac-sha256:v1:${"1".repeat(64)}` as const,
    bounds: { x: 0, y: 0, width: 100, height: 120 },
    vertexCount: 128,
    byteLength: 128 * 8,
    maxDisplacementPx: 12,
    finiteRangeSummary: { min: -12, max: 12 },
  };
  return withPayloadHash(response);
}

function createErrorResponse(request = createRequest()): LocalMotionWorkerErrorResponse {
  const response = {
    workerInstanceId: "worker-1",
    requestId: request.requestId,
    operationId: request.operationId,
    baseDraftGeneration: request.baseDraftGeneration,
    responseKind: "previewError" as const,
    diagnosticVersion: request.diagnosticVersion,
    thresholdPolicyVersion: request.thresholdPolicyVersion,
    thresholdPolicyHash: request.thresholdPolicyHash,
    solverOptionsHash: request.solverOptionsHash,
    payloadHash: hash("f"),
    hmac: `hmac-sha256:v1:${"2".repeat(64)}` as const,
    error: {
      code: "timeout" as const,
      message: "Worker timed out.",
    },
  };
  return withPayloadHash(response);
}

describe("local motion worker boundary", () => {
  it("accepts bounded finite worker requests", () => {
    expect(validateLocalMotionWorkerRequest(createRequest()).ok).toBe(true);
  });

  it("rejects draft-requested caps above code ceilings", () => {
    const request = createRequest();
    request.options.draftRequest.maxVertexCount = 999999;

    const result = validateLocalMotionWorkerRequest(request);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "limitExceeded" })]),
    );
  });

  it("rejects empty worker handle and region identifiers", () => {
    const request = createRequest();
    request.handles = [{ ...request.handles[0]!, id: "", regionId: "" }];
    request.regions = [{ ...request.regions[0]!, id: "" }];

    const result = validateLocalMotionWorkerRequest(request);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "handles[0].id" }),
        expect.objectContaining({ path: "handles[0].regionId" }),
        expect.objectContaining({ path: "regions[0].id" }),
      ]),
    );
  });

  it("accepts matching preview-only responses", () => {
    expect(
      validateLocalMotionWorkerResponse(
        createResponse(),
        createPending(),
        acceptWorkerHmac,
      ).ok,
    ).toBe(true);
  });

  it("verifies response HMACs over canonical payload fields when a verifier is provided", () => {
    const response = createResponse();
    const pending = createPending();
    const expectedPayload = createLocalMotionWorkerHmacPayload({
      workerInstanceId: response.workerInstanceId,
      requestId: response.requestId,
      operationId: response.operationId,
      requestGeneration: response.baseDraftGeneration,
      responseKind: response.responseKind,
      diagnosticVersion: response.diagnosticVersion,
      thresholdPolicyVersion: response.thresholdPolicyVersion,
      thresholdPolicyHash: response.thresholdPolicyHash,
      solverOptionsHash: response.solverOptionsHash,
      payloadHash: response.payloadHash,
    });

    const accepted = validateLocalMotionWorkerResponse(response, pending, {
      verifyHmac: (payload, hmac) => payload === expectedPayload && hmac === response.hmac,
    });
    const rejected = validateLocalMotionWorkerResponse(response, pending, {
      verifyHmac: () => false,
    });

    expect(accepted.ok).toBe(true);
    expect(rejected.ok).toBe(false);
    expect(rejected.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "invalidHmac", path: "hmac" }),
      ]),
    );
  });

  it("rejects response field substitution through payload hash validation", () => {
    const response = createResponse();
    const result = validateLocalMotionWorkerResponse(
      { ...response, thresholdPolicyVersion: "policy-v2" },
      createPending(),
      acceptWorkerHmac,
    );

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "staleResponse", path: "thresholdPolicyVersion" }),
        expect.objectContaining({ code: "staleResponse", path: "payloadHash" }),
      ]),
    );
  });

  it("rejects stale or authoritative-looking worker responses", () => {
    const response = {
      ...createResponse(),
      operationId: "old-op",
      previewOnly: false,
    };

    const result = validateLocalMotionWorkerResponse(
      response,
      createPending(),
      acceptWorkerHmac,
    );

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "staleResponse" }),
        expect.objectContaining({ code: "previewOnlyRequired" }),
      ]),
    );
  });

  it("rejects worker responses from another worker instance", () => {
    const result = validateLocalMotionWorkerResponse(
      {
        ...createResponse(),
        workerInstanceId: "worker-2",
      },
      createPending(),
      acceptWorkerHmac,
    );

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "staleResponse", path: "workerInstanceId" }),
      ]),
    );
  });

  it("rejects malformed worker response HMAC fields", () => {
    const result = validateLocalMotionWorkerResponse(
      {
        ...createResponse(),
        hmac: "not-an-hmac",
      },
      createPending(),
      acceptWorkerHmac,
    );

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "invalidHmac", path: "hmac" }),
      ]),
    );
  });

  it("rejects response displacement beyond the requested cap", () => {
    const response = {
      ...createResponse(),
      maxDisplacementPx: 20,
    };

    const result = validateLocalMotionWorkerResponse(
      response,
      {
        ...createPending(),
        requestedMaxDisplacementPx: 12,
      },
      acceptWorkerHmac,
    );

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "limitExceeded" })]),
    );
  });

  it("rejects responses for regions outside the pending operation", () => {
    const result = validateLocalMotionWorkerResponse(
      {
        ...createResponse(),
        regionId: "r-extra",
      },
      createPending(),
      acceptWorkerHmac,
    );

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "staleResponse", path: "regionId" }),
      ]),
    );
  });

  it("rejects unexpected response region hashes", () => {
    const response = {
      ...createResponse(),
      baseRegionSha256s: { "r-1": hash("e"), "r-extra": hash("f") },
    };

    const result = validateLocalMotionWorkerResponse(
      response,
      createPending(),
      acceptWorkerHmac,
    );

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "staleResponse" })]),
    );
  });

  it("accepts bounded signed worker error responses", () => {
    const response = createErrorResponse();
    const expectedPayload = createLocalMotionWorkerHmacPayload({
      workerInstanceId: response.workerInstanceId,
      requestId: response.requestId,
      operationId: response.operationId,
      requestGeneration: response.baseDraftGeneration,
      responseKind: response.responseKind,
      diagnosticVersion: response.diagnosticVersion,
      thresholdPolicyVersion: response.thresholdPolicyVersion,
      thresholdPolicyHash: response.thresholdPolicyHash,
      solverOptionsHash: response.solverOptionsHash,
      payloadHash: response.payloadHash,
    });

    const result = validateLocalMotionWorkerErrorResponse(response, createPending(), {
      verifyHmac: (payload, hmac) => payload === expectedPayload && hmac === response.hmac,
    });

    expect(result.ok).toBe(true);
  });

  it("rejects worker error responses with invalid HMACs", () => {
    const result = validateLocalMotionWorkerErrorResponse(
      createErrorResponse(),
      createPending(),
      { verifyHmac: () => false },
    );

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "invalidHmac", path: "hmac" }),
      ]),
    );
  });

  it("rejects worker error responses with private marker or path leaks", () => {
    const result = validateLocalMotionWorkerErrorResponse(
      withPayloadHash({
        ...createErrorResponse(),
        error: {
          code: "internalPreviewFailure" as const,
          message: "LocalMotion preview failed at C:\\Users\\secret\\debug.log",
        },
      }),
      createPending(),
      acceptWorkerHmac,
    );

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "invalidShape", path: "error.message" }),
      ]),
    );
  });

  it("rejects worker error responses with unsupported codes or long messages", () => {
    const result = validateLocalMotionWorkerErrorResponse(
      withPayloadHash({
        ...createErrorResponse(),
        error: {
          code: "rawStackTrace",
          message: "x".repeat(241),
        },
      }),
      createPending(),
      acceptWorkerHmac,
    );

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "invalidShape", path: "error.code" }),
        expect.objectContaining({ code: "limitExceeded", path: "error.message" }),
      ]),
    );
  });

  it("rejects worker responses when no HMAC verifier is provided at runtime", () => {
    const missingVerifier = undefined as unknown as typeof acceptWorkerHmac;

    const result = validateLocalMotionWorkerResponse(
      createResponse(),
      createPending(),
      missingVerifier,
    );
    const errorResult = validateLocalMotionWorkerErrorResponse(
      createErrorResponse(),
      createPending(),
      missingVerifier,
    );

    expect(result.ok).toBe(false);
    expect(errorResult.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "invalidHmac", path: "hmac" }),
      ]),
    );
    expect(errorResult.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "invalidHmac", path: "hmac" }),
      ]),
    );
  });
});
