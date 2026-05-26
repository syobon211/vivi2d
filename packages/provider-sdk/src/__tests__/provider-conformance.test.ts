import { describe, expect, it } from "vitest";
import {
  createProviderResult,
  DEFAULT_PROVIDER_LIMITS,
  MAX_PROVIDER_LIMITS,
  VIVI_PROVIDER_CAPABILITIES,
  ViviProviderError,
  type ViviProviderResult,
} from "../index";
import { invokeProvider } from "../invocation";
import {
  createFakeProvider,
  createFakeProviderManifest,
  runViviProviderConformance,
} from "../testing";

function createRequest() {
  return {
    requestId: "request-1",
    capabilityId: VIVI_PROVIDER_CAPABILITIES.layerDecompose,
    inputArtifacts: [
      {
        id: "input",
        kind: "inputImage" as const,
        mediaType: "image/png",
        byteLength: 4,
        data: new Uint8Array([1, 2, 3, 4]).buffer,
      },
    ],
  };
}

describe("provider conformance", () => {
  it("invokes a fake provider and validates progress before forwarding it", async () => {
    const provider = createFakeProvider({
      invoke(request, context) {
        context.onProgress?.({
          requestId: request.requestId,
          phase: "processing",
          step: 1,
          total: 2,
          message: "working",
        });
        return createProviderResult(createFakeProviderManifest(), request, []);
      },
    });
    const progressMessages: string[] = [];

    const result = await invokeProvider(provider, createRequest(), {
      onProgress(progress) {
        progressMessages.push(progress.message ?? "");
      },
    });

    expect(result.provenance.providerId).toBe("fake-provider");
    expect(progressMessages).toEqual(["working"]);
  });

  it("runs reusable conformance cases for provider samples", async () => {
    const report = await runViviProviderConformance(createFakeProvider(), [
      {
        name: "empty-layer-decompose",
        request: createRequest(),
        expectArtifactKinds: [],
      },
    ]);

    expect(report).toEqual({
      providerId: "fake-provider",
      cases: [
        {
          name: "empty-layer-decompose",
          artifactCount: 0,
          warningCount: 0,
        },
      ],
    });
  });

  it("reports conformance artifact mismatches as provider errors", async () => {
    await expect(
      runViviProviderConformance(createFakeProvider(), [
        {
          name: "wrong-kind",
          request: createRequest(),
          expectArtifactKinds: ["maskProposal"],
        },
      ]),
    ).rejects.toMatchObject({
      code: "VIVI_PROVIDER_BAD_ARTIFACT",
      details: {
        name: "wrong-kind",
        actualKinds: [],
        expectedKinds: ["maskProposal"],
      },
    });
  });

  it("rejects unsupported capabilities before invoking providers", async () => {
    const provider = createFakeProvider({
      invoke() {
        throw new Error("should not be called");
      },
    });
    const request = {
      ...createRequest(),
      capabilityId: "vivi2d.provider.unknown.v1",
    };

    await expect(invokeProvider(provider, request)).rejects.toMatchObject({
      code: "VIVI_PROVIDER_CAPABILITY_UNAVAILABLE",
    });
  });

  it("normalizes raw provider failures and cancelled requests", async () => {
    const failingProvider = createFakeProvider({
      invoke() {
        throw new Error("boom");
      },
    });
    await expect(invokeProvider(failingProvider, createRequest())).rejects.toMatchObject({
      code: "VIVI_PROVIDER_INTERNAL",
    });

    const controller = new AbortController();
    controller.abort();
    await expect(
      invokeProvider(createFakeProvider(), createRequest(), {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: "VIVI_PROVIDER_CANCELLED" });
  });

  it("enforces limit ceilings for invocation options", async () => {
    await expect(
      invokeProvider(createFakeProvider(), createRequest(), {
        limits: {
          ...DEFAULT_PROVIDER_LIMITS,
          maxOutputBytes: MAX_PROVIDER_LIMITS.maxOutputBytes + 1,
        },
      }),
    ).rejects.toMatchObject({ code: "VIVI_PROVIDER_LIMIT_EXCEEDED" });
  });

  it("rejects malicious output paths from providers", async () => {
    const provider = createFakeProvider({
      invoke(request) {
        return createRawResult(request.requestId, request.capabilityId, [
          {
            id: "manifest",
            kind: "manifest" as const,
            mediaType: "application/json",
            byteLength: 2,
            path: "../secret.json",
            data: new Uint8Array([123, 125]).buffer,
          },
        ]);
      },
    });

    await expect(invokeProvider(provider, createRequest())).rejects.toMatchObject({
      code: "VIVI_PROVIDER_BAD_ARTIFACT",
    });
  });

  it("rejects oversized provider outputs and malformed artifact metadata", async () => {
    const oversizedProvider = createFakeProvider({
      invoke(request) {
        return createRawResult(request.requestId, request.capabilityId, [
          {
            id: "huge",
            kind: "binary" as const,
            mediaType: "application/octet-stream",
            byteLength: DEFAULT_PROVIDER_LIMITS.maxOutputBytes + 1,
          },
        ]);
      },
    });
    await expect(
      invokeProvider(oversizedProvider, createRequest()),
    ).rejects.toMatchObject({
      code: "VIVI_PROVIDER_LIMIT_EXCEEDED",
    });

    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const malformedMetadataProvider = createFakeProvider({
      invoke(request) {
        return createRawResult(request.requestId, request.capabilityId, [
          {
            id: "metadata",
            kind: "metadata" as const,
            mediaType: "application/json",
            byteLength: 2,
            data: new Uint8Array([123, 125]).buffer,
            metadata: cyclic,
          },
        ]);
      },
    });
    await expect(
      invokeProvider(malformedMetadataProvider, createRequest()),
    ).rejects.toBeInstanceOf(ViviProviderError);
  });

  it("rejects mismatched provenance and invalid progress from providers", async () => {
    const mismatchedProvider = createFakeProvider({
      invoke(request) {
        const result = createRawResult(request.requestId, request.capabilityId, []);
        result.provenance.providerId = "other-provider";
        return result;
      },
    });
    await expect(
      invokeProvider(mismatchedProvider, createRequest()),
    ).rejects.toMatchObject({
      code: "VIVI_PROVIDER_INVALID_REQUEST",
    });

    const invalidProgressProvider = createFakeProvider({
      invoke(request, context) {
        context.onProgress?.({
          requestId: "other-request",
          phase: "processing",
          step: 1,
          total: 1,
        });
        return createProviderResult(createFakeProviderManifest(), request, []);
      },
    });
    await expect(
      invokeProvider(invalidProgressProvider, createRequest(), {
        onProgress() {
          throw new Error("invalid progress must not be forwarded");
        },
      }),
    ).rejects.toMatchObject({ code: "VIVI_PROVIDER_INVALID_REQUEST" });

    await expect(
      invokeProvider(invalidProgressProvider, createRequest()),
    ).rejects.toMatchObject({
      code: "VIVI_PROVIDER_INVALID_REQUEST",
    });
  });
});

function createRawResult(
  requestId: string,
  capabilityId: string,
  artifacts: ViviProviderResult["artifacts"],
): ViviProviderResult {
  return {
    requestId,
    capabilityId,
    artifacts,
    warnings: [],
    provenance: {
      providerId: "fake-provider",
      providerVersion: "0.1.0",
      capabilityId,
      generatedAt: new Date().toISOString(),
    },
  };
}
