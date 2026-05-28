import { describe, expect, it } from "vitest";
import {
  createProviderResult,
  defineViviProvider,
  DEFAULT_PROVIDER_LIMITS,
  MAX_PROVIDER_LIMITS,
  mergeProviderLimits,
  normalizeProviderArtifactPath,
  VIVI_PROVIDER_CAPABILITIES,
  VIVI_PROVIDER_SDK_VERSION,
  ViviProviderError,
  type ViviProviderManifest,
  type ViviProviderRequest,
  validateProviderManifest,
  validateProviderRequest,
  validateProviderResult,
} from "../index";

function createManifest(): ViviProviderManifest {
  return {
    id: "fake-provider",
    displayName: "Fake Provider",
    version: "0.1.0",
    sdkVersion: VIVI_PROVIDER_SDK_VERSION,
    capabilities: [
      {
        id: VIVI_PROVIDER_CAPABILITIES.layerDecompose,
        version: "1.0.0",
        inputKinds: ["inputImage"],
        outputKinds: ["manifest", "layerImage"],
        maxInputBytes: 1024,
        maxOutputBytes: 4096,
        timeoutMs: 1000,
      },
    ],
  };
}

function createRequest(): ViviProviderRequest {
  return {
    requestId: "request-1",
    capabilityId: VIVI_PROVIDER_CAPABILITIES.layerDecompose,
    inputArtifacts: [
      {
        id: "input",
        kind: "inputImage",
        mediaType: "image/png",
        byteLength: 4,
        path: "input/source.png",
        data: new Uint8Array([1, 2, 3, 4]).buffer,
      },
    ],
    parameters: { seed: 1 },
  };
}

describe("provider-sdk", () => {
  it("validates provider manifests and creates provenance-stamped results", () => {
    const manifest = validateProviderManifest(createManifest());
    const request = validateProviderRequest(createRequest());

    const result = createProviderResult(manifest, request, [
      {
        id: "manifest",
        kind: "manifest",
        mediaType: "application/json",
        byteLength: 2,
        path: "outputs/manifest.json",
        data: new Uint8Array([123, 125]).buffer,
      },
    ]);

    expect(result.provenance).toMatchObject({
      providerId: "fake-provider",
      providerVersion: "0.1.0",
      capabilityId: VIVI_PROVIDER_CAPABILITIES.layerDecompose,
    });
    expect(Date.parse(result.provenance.generatedAt)).not.toBeNaN();
    expect(validateProviderResult(result)).toBe(result);
  });

  it("defineViviProvider validates and snapshots provider manifests", () => {
    const manifest = createManifest();
    const provider = defineViviProvider({
      manifest,
      async invoke(request) {
        return createProviderResult(manifest, request, []);
      },
    });

    manifest.id = "mutated-provider";
    manifest.capabilities[0]!.outputKinds.push("binary");

    expect(provider.manifest.id).toBe("fake-provider");
    expect(provider.manifest.capabilities[0]!.outputKinds).toEqual([
      "manifest",
      "layerImage",
    ]);
    expect(Object.isFrozen(provider)).toBe(true);
    expect(Object.isFrozen(provider.manifest)).toBe(true);
  });

  it("defineViviProvider snapshots the invoke function", async () => {
    const manifest = createManifest();
    const mutableProvider = {
      manifest,
      async invoke(request: ViviProviderRequest) {
        return createProviderResult(manifest, request, [
          {
            id: "first",
            kind: "metadata" as const,
            mediaType: "application/json",
            byteLength: 2,
            data: new Uint8Array([123, 125]).buffer,
          },
        ]);
      },
    };
    const provider = defineViviProvider(mutableProvider);
    mutableProvider.invoke = async (request: ViviProviderRequest) =>
      createProviderResult(manifest, request, [
        {
          id: "second",
          kind: "metadata" as const,
          mediaType: "application/json",
          byteLength: 2,
          data: new Uint8Array([123, 125]).buffer,
        },
      ]);

    await expect(provider.invoke(createRequest())).resolves.toMatchObject({
      artifacts: [{ id: "first" }],
    });
  });

  it("normalizes relative artifact paths and rejects traversal or absolute paths", () => {
    expect(normalizeProviderArtifactPath("nested\\artifact.png")).toBe(
      "nested/artifact.png",
    );
    for (const path of [
      "../secret.txt",
      "safe/../secret.txt",
      "/tmp/out.png",
      "C:/tmp/out.png",
    ]) {
      expect(() => normalizeProviderArtifactPath(path)).toThrow(ViviProviderError);
    }
  });

  it("enforces finite positive limit overrides", () => {
    expect(mergeProviderLimits({ timeoutMs: 5_000 })).toEqual({
      ...DEFAULT_PROVIDER_LIMITS,
      timeoutMs: 5_000,
    });
    expect(() => mergeProviderLimits({ maxArtifacts: 0 })).toThrow(ViviProviderError);
    expect(() => mergeProviderLimits({ timeoutMs: Number.POSITIVE_INFINITY })).toThrow(
      ViviProviderError,
    );
    expect(() =>
      mergeProviderLimits({ maxInputBytes: MAX_PROVIDER_LIMITS.maxInputBytes + 1 }),
    ).toThrow(ViviProviderError);
  });

  it("rejects unsupported provider artifact kinds in manifests", () => {
    const manifest = createManifest();
    manifest.capabilities[0]!.outputKinds = ["unsafeKind" as never];

    expect(() => validateProviderManifest(manifest)).toThrow(ViviProviderError);
  });

  it("rejects oversized hostile request payloads", () => {
    const request = createRequest();
    request.inputArtifacts[0]!.byteLength = 10;
    request.inputArtifacts[0]!.data = new Uint8Array(10).buffer;

    expect(() =>
      validateProviderRequest(request, {
        ...DEFAULT_PROVIDER_LIMITS,
        maxInputBytes: 4,
      }),
    ).toThrow(ViviProviderError);
  });

  it("validates provider proposal request tokens and consent data classes", () => {
    const request = createRequest();
    request.requestToken = "opaqueProposalToken_123456789";
    request.dataClasses = ["sourcePixels", "currentMask"];

    expect(validateProviderRequest(request)).toBe(request);

    request.requestToken = "sha256:source-fingerprint";
    expect(() => validateProviderRequest(request)).toThrow(ViviProviderError);

    request.requestToken = "opaqueProposalToken_123456789";
    request.dataClasses = ["sourcePixels", "sourcePixels"];
    expect(() => validateProviderRequest(request)).toThrow(ViviProviderError);

    request.dataClasses = ["unknown" as never];
    expect(() => validateProviderRequest(request)).toThrow(ViviProviderError);
  });

  it("does not let embedded request limits bypass the active validator limits", () => {
    const request = createRequest();
    request.inputArtifacts[0]!.byteLength = DEFAULT_PROVIDER_LIMITS.maxInputBytes + 1;
    request.inputArtifacts[0]!.data = undefined;
    request.limits = {
      maxInputBytes: DEFAULT_PROVIDER_LIMITS.maxInputBytes + 2,
    };

    expect(() => validateProviderRequest(request)).toThrow(ViviProviderError);
    expect(() =>
      validateProviderRequest(request, mergeProviderLimits(request.limits)),
    ).not.toThrow();
  });

  it("rejects bad artifact metadata and length mismatches", () => {
    const request = createRequest();
    request.inputArtifacts[0]!.byteLength = 10;

    expect(() => validateProviderRequest(request)).toThrow(ViviProviderError);

    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    request.inputArtifacts[0]!.byteLength = 4;
    request.inputArtifacts[0]!.metadata = cyclic;
    expect(() => validateProviderRequest(request)).toThrow(ViviProviderError);
  });

  it("rejects invalid result provenance timestamps", () => {
    const manifest = createManifest();
    const request = createRequest();
    const result = createProviderResult(manifest, request, []);
    result.provenance.generatedAt = "not-a-date";

    expect(() => validateProviderResult(result)).toThrow(ViviProviderError);

    result.provenance.generatedAt = "2026/05/13";
    expect(() => validateProviderResult(result)).toThrow(ViviProviderError);
  });

  it("accepts IP-safe layer proposal capabilities and validates provenance", () => {
    const manifest = createManifest();
    manifest.capabilities.push({
      id: VIVI_PROVIDER_CAPABILITIES.maskProposal,
      version: "1.0.0",
      inputKinds: ["inputImage"],
      outputKinds: ["maskProposal"],
      maxInputBytes: 1024,
      maxOutputBytes: 4096,
      timeoutMs: 1000,
    });
    const request = {
      ...createRequest(),
      capabilityId: VIVI_PROVIDER_CAPABILITIES.maskProposal,
    };

    const result = createProviderResult(manifest, request, [
      {
        id: "mask",
        kind: "maskProposal",
        mediaType: "image/png",
        byteLength: 4,
        data: new Uint8Array([1, 2, 3, 4]).buffer,
        metadata: {
          schema: "vivi2d.provider.maskProposalMetadata.v1",
          semantic: "hair",
          confidence: 0.8,
          provenance: "providerProposal",
        },
      },
    ]);

    expect(validateProviderResult(result)).toBe(result);
  });

  it("rejects provider-owned unclassified mask proposals", () => {
    const manifest = createManifest();
    const request = createRequest();

    expect(() =>
      createProviderResult(manifest, request, [
        {
          id: "unclassified-mask",
          kind: "maskProposal",
          mediaType: "image/png",
          byteLength: 4,
          data: new Uint8Array([1, 2, 3, 4]).buffer,
          metadata: {
            schema: "vivi2d.provider.maskProposalMetadata.v1",
            confidence: 0.8,
            provenance: "providerProposal",
          },
        },
      ]),
    ).toThrow(ViviProviderError);
  });

  it("requires metadata for IP-safe layer proposal artifacts", () => {
    const manifest = createManifest();
    const request = createRequest();

    for (const kind of ["maskProposal", "alphaMatte", "underpaint"] as const) {
      expect(() =>
        createProviderResult(manifest, request, [
          {
            id: `${kind}-without-metadata`,
            kind,
            mediaType: "image/png",
            byteLength: 4,
            data: new Uint8Array([1, 2, 3, 4]).buffer,
          },
        ]),
      ).toThrow(ViviProviderError);
    }
  });

  it("requires alpha matte metadata to reference a mask artifact", () => {
    const manifest = createManifest();
    const request = createRequest();

    expect(() =>
      createProviderResult(manifest, request, [
        {
          id: "matte",
          kind: "alphaMatte",
          mediaType: "image/png",
          byteLength: 4,
          data: new Uint8Array([1, 2, 3, 4]).buffer,
          metadata: {
            schema: "vivi2d.provider.alphaMatteMetadata.v1",
            confidence: 0.8,
            provenance: "providerProposal",
          },
        },
      ]),
    ).toThrow(ViviProviderError);
  });

  it("rejects alpha matte metadata without maskArtifactId", () => {
    const manifest = createManifest();
    const request = createRequest();

    expect(() =>
      createProviderResult(manifest, request, [
        {
          id: "matte-without-mask-id",
          kind: "alphaMatte",
          mediaType: "image/png",
          byteLength: 4,
          data: new Uint8Array([1, 2, 3, 4]).buffer,
          metadata: {
            schema: "vivi2d.provider.alphaMatteMetadata.v1",
            confidence: 0.8,
            provenance: "providerProposal",
          },
        },
      ]),
    ).toThrow(ViviProviderError);
  });

  it("rejects dangling alpha matte mask artifact references", () => {
    const manifest = createManifest();
    const request = createRequest();

    expect(() =>
      createProviderResult(manifest, request, [
        {
          id: "matte",
          kind: "alphaMatte",
          mediaType: "image/png",
          byteLength: 4,
          data: new Uint8Array([1, 2, 3, 4]).buffer,
          metadata: {
            schema: "vivi2d.provider.alphaMatteMetadata.v1",
            maskArtifactId: "missing-mask",
            confidence: 0.8,
            provenance: "providerProposal",
          },
        },
      ]),
    ).toThrow(ViviProviderError);
  });

  it("rejects alpha matte mask artifact references with the wrong kind", () => {
    const manifest = createManifest();
    const request = createRequest();

    expect(() =>
      createProviderResult(manifest, request, [
        {
          id: "layer",
          kind: "layerImage",
          mediaType: "image/png",
          byteLength: 4,
          data: new Uint8Array([1, 2, 3, 4]).buffer,
        },
        {
          id: "matte",
          kind: "alphaMatte",
          mediaType: "image/png",
          byteLength: 4,
          data: new Uint8Array([1, 2, 3, 4]).buffer,
          metadata: {
            schema: "vivi2d.provider.alphaMatteMetadata.v1",
            maskArtifactId: "layer",
            confidence: 0.8,
            provenance: "providerProposal",
          },
        },
      ]),
    ).toThrow(ViviProviderError);
  });

  it("accepts alpha matte artifacts that reference a mask proposal", () => {
    const manifest = createManifest();
    const request = createRequest();

    const result = createProviderResult(manifest, request, [
      {
        id: "mask",
        kind: "maskProposal",
        mediaType: "image/png",
        byteLength: 4,
        data: new Uint8Array([1, 2, 3, 4]).buffer,
        metadata: {
          schema: "vivi2d.provider.maskProposalMetadata.v1",
          semantic: "hair",
          confidence: 0.8,
          provenance: "providerProposal",
        },
      },
      {
        id: "matte",
        kind: "alphaMatte",
        mediaType: "image/png",
        byteLength: 4,
        data: new Uint8Array([1, 2, 3, 4]).buffer,
        metadata: {
          schema: "vivi2d.provider.alphaMatteMetadata.v1",
          maskArtifactId: "mask",
          confidence: 0.8,
          provenance: "providerProposal",
        },
      },
    ]);

    expect(validateProviderResult(result)).toBe(result);
  });

  it("accepts alpha matte artifacts that reference request input masks", () => {
    const manifest = createManifest();
    manifest.capabilities.push({
      id: VIVI_PROVIDER_CAPABILITIES.alphaMatte,
      version: "1.0.0",
      inputKinds: ["inputImage", "maskProposal"],
      outputKinds: ["alphaMatte"],
      maxInputBytes: 1024,
      maxOutputBytes: 4096,
      timeoutMs: 1000,
    });
    const request: ViviProviderRequest = {
      ...createRequest(),
      capabilityId: VIVI_PROVIDER_CAPABILITIES.alphaMatte,
      inputArtifacts: [
        ...createRequest().inputArtifacts,
        {
          id: "reviewed-hair-mask",
          kind: "maskProposal",
          mediaType: "image/png",
          byteLength: 4,
          data: new Uint8Array([1, 2, 3, 4]).buffer,
          metadata: {
            schema: "vivi2d.provider.maskProposalMetadata.v1",
            semantic: "hair",
            confidence: 0.9,
            provenance: "user",
          },
        },
      ],
    };

    const result = createProviderResult(manifest, request, [
      {
        id: "matte",
        kind: "alphaMatte",
        mediaType: "image/png",
        byteLength: 4,
        data: new Uint8Array([1, 2, 3, 4]).buffer,
        metadata: {
          schema: "vivi2d.provider.alphaMatteMetadata.v1",
          maskArtifactId: "reviewed-hair-mask",
          confidence: 0.8,
          provenance: "providerProposal",
        },
      },
    ]);

    expect(validateProviderResult(result, DEFAULT_PROVIDER_LIMITS, request.inputArtifacts)).toBe(
      result,
    );
  });

  it("rejects result artifacts that shadow input artifact ids", () => {
    const manifest = createManifest();
    manifest.capabilities.push({
      id: VIVI_PROVIDER_CAPABILITIES.alphaMatte,
      version: "1.0.0",
      inputKinds: ["inputImage", "maskProposal"],
      outputKinds: ["maskProposal", "alphaMatte"],
      maxInputBytes: 1024,
      maxOutputBytes: 4096,
      timeoutMs: 1000,
    });
    const request: ViviProviderRequest = {
      ...createRequest(),
      capabilityId: VIVI_PROVIDER_CAPABILITIES.alphaMatte,
      inputArtifacts: [
        ...createRequest().inputArtifacts,
        {
          id: "protected-mask",
          kind: "maskProposal",
          mediaType: "image/png",
          byteLength: 4,
          data: new Uint8Array([1, 2, 3, 4]).buffer,
          metadata: {
            schema: "vivi2d.provider.maskProposalMetadata.v1",
            semantic: "face",
            confidence: 0.9,
            provenance: "user",
          },
        },
      ],
    };

    expect(() =>
      createProviderResult(manifest, request, [
        {
          id: "protected-mask",
          kind: "maskProposal",
          mediaType: "image/png",
          byteLength: 4,
          data: new Uint8Array([1, 2, 3, 4]).buffer,
          metadata: {
            schema: "vivi2d.provider.maskProposalMetadata.v1",
            semantic: "hair",
            confidence: 0.8,
            provenance: "providerProposal",
          },
        },
        {
          id: "shadow-matte",
          kind: "alphaMatte",
          mediaType: "image/png",
          byteLength: 4,
          data: new Uint8Array([1, 2, 3, 4]).buffer,
          metadata: {
            schema: "vivi2d.provider.alphaMatteMetadata.v1",
            maskArtifactId: "protected-mask",
            confidence: 0.8,
            provenance: "providerProposal",
          },
        },
      ]),
    ).toThrow(ViviProviderError);
  });

  it("rejects provider-owned alpha mattes for unclassified mask semantics", () => {
    const manifest = createManifest();
    const request = createRequest();

    expect(() =>
      createProviderResult(manifest, request, [
        {
          id: "source-mask",
          kind: "maskProposal",
          mediaType: "image/png",
          byteLength: 4,
          data: new Uint8Array([1, 2, 3, 4]).buffer,
          metadata: {
            schema: "vivi2d.provider.maskProposalMetadata.v1",
            confidence: 0.8,
            provenance: "source",
          },
        },
        {
          id: "matte",
          kind: "alphaMatte",
          mediaType: "image/png",
          byteLength: 4,
          data: new Uint8Array([1, 2, 3, 4]).buffer,
          metadata: {
            schema: "vivi2d.provider.alphaMatteMetadata.v1",
            maskArtifactId: "source-mask",
            confidence: 0.8,
            provenance: "providerProposal",
          },
        },
      ]),
    ).toThrow(ViviProviderError);
  });

  it("rejects provider-owned alpha mattes for protected mask semantics", () => {
    const manifest = createManifest();
    const request = createRequest();

    expect(() =>
      createProviderResult(manifest, request, [
        {
          id: "face-mask",
          kind: "maskProposal",
          mediaType: "image/png",
          byteLength: 4,
          data: new Uint8Array([1, 2, 3, 4]).buffer,
          metadata: {
            schema: "vivi2d.provider.maskProposalMetadata.v1",
            semantic: "face",
            confidence: 0.8,
            provenance: "source",
          },
        },
        {
          id: "face-matte",
          kind: "alphaMatte",
          mediaType: "image/png",
          byteLength: 4,
          data: new Uint8Array([1, 2, 3, 4]).buffer,
          metadata: {
            schema: "vivi2d.provider.alphaMatteMetadata.v1",
            maskArtifactId: "face-mask",
            confidence: 0.8,
            provenance: "providerProposal",
          },
        },
      ]),
    ).toThrow(ViviProviderError);
  });

  it("validates IP-safe layer proposal metadata schemas", () => {
    const manifest = createManifest();
    const request = createRequest();

    expect(() =>
      createProviderResult(manifest, request, [
        {
          id: "mask",
          kind: "maskProposal",
          mediaType: "image/png",
          byteLength: 4,
          data: new Uint8Array([1, 2, 3, 4]).buffer,
          metadata: {
            schema: "vivi2d.provider.alphaMatteMetadata.v1",
            confidence: 0.8,
            provenance: "providerProposal",
          },
        },
      ]),
    ).toThrow(ViviProviderError);
  });

  it("requires underpaint artifacts to stay generated hidden", () => {
    const manifest = createManifest();
    const request = createRequest();
    expect(() =>
      createProviderResult(manifest, request, [
        {
          id: "underpaint",
          kind: "underpaint",
          mediaType: "image/png",
          byteLength: 4,
          data: new Uint8Array([1, 2, 3, 4]).buffer,
          metadata: {
            schema: "vivi2d.provider.underpaintMetadata.v1",
            confidence: 0.7,
            provenance: "providerProposal",
          },
        },
      ]),
    ).toThrow(ViviProviderError);
  });

  it("accepts generated hidden underpaint artifacts with optional occlusion refs", () => {
    const manifest = createManifest();
    const request = createRequest();

    const result = createProviderResult(manifest, request, [
      {
        id: "underpaint-free",
        kind: "underpaint",
        mediaType: "image/png",
        byteLength: 4,
        data: new Uint8Array([1, 2, 3, 4]).buffer,
        metadata: {
          schema: "vivi2d.provider.underpaintMetadata.v1",
          confidence: 0.7,
          provenance: "generatedHidden",
        },
      },
      {
        id: "underpaint-ref",
        kind: "underpaint",
        mediaType: "image/png",
        byteLength: 4,
        data: new Uint8Array([1, 2, 3, 4]).buffer,
        metadata: {
          schema: "vivi2d.provider.underpaintMetadata.v1",
          occludedByArtifactId: "input",
          confidence: 0.75,
          provenance: "generatedHidden",
        },
      },
    ]);

    expect(validateProviderResult(result)).toBe(result);
  });

  it("rejects unsafe underpaint occlusion references", () => {
    const manifest = createManifest();
    const request = createRequest();

    expect(() =>
      createProviderResult(manifest, request, [
        {
          id: "underpaint",
          kind: "underpaint",
          mediaType: "image/png",
          byteLength: 4,
          data: new Uint8Array([1, 2, 3, 4]).buffer,
          metadata: {
            schema: "vivi2d.provider.underpaintMetadata.v1",
            occludedByArtifactId: "../mask",
            confidence: 0.7,
            provenance: "generatedHidden",
          },
        },
      ]),
    ).toThrow(ViviProviderError);
  });

  it("rejects local-motion preview data in provider artifacts", () => {
    const manifest = createManifest();
    const request = createRequest();

    expect(() =>
      createProviderResult(manifest, request, [
        {
          id: "metadata",
          kind: "metadata",
          mediaType: "application/json",
          byteLength: 2,
          data: new Uint8Array([123, 125]).buffer,
          metadata: {
            schema: "provider.test",
            weights: [1, 0],
          },
        },
      ]),
    ).toThrow(ViviProviderError);

    expect(() =>
      createProviderResult(manifest, request, [
        {
          id: "metadata",
          kind: "metadata",
          mediaType: "application/json",
          byteLength: 2,
          data: new Uint8Array([123, 125]).buffer,
          metadata: {
            schema: "provider.test",
            note: "LocalMotionDraft",
          },
        },
      ]),
    ).toThrow(ViviProviderError);
  });

  it("rejects solver tokens in provider artifact metadata", () => {
    const manifest = createManifest();
    const request = createRequest();

    expect(() =>
      createProviderResult(manifest, request, [
        {
          id: "metadata",
          kind: "metadata",
          mediaType: "application/json",
          byteLength: 2,
          data: new Uint8Array([123, 125]).buffer,
          metadata: {
            schema: "provider.test",
            note: "local-solver",
          },
        },
      ]),
    ).toThrow(ViviProviderError);
  });

  it("rejects provider-owned protected layer proposal semantics", () => {
    const manifest = createManifest();
    const request = createRequest();

    expect(() =>
      createProviderResult(manifest, request, [
        {
          id: "face-mask",
          kind: "maskProposal",
          mediaType: "image/png",
          byteLength: 4,
          data: new Uint8Array([1, 2, 3, 4]).buffer,
          metadata: {
            schema: "vivi2d.provider.maskProposalMetadata.v1",
            semantic: "Face",
            confidence: 0.7,
            provenance: "providerProposal",
          },
        },
      ]),
    ).toThrow(ViviProviderError);
  });

  it("rejects oversized artifact metadata and warning floods", () => {
    const manifest = createManifest();
    const request = createRequest();

    expect(() =>
      createProviderResult(manifest, request, [
        {
          id: "metadata",
          kind: "metadata",
          mediaType: "application/json",
          byteLength: 2,
          data: new Uint8Array([123, 125]).buffer,
          metadata: { blob: "x".repeat(DEFAULT_PROVIDER_LIMITS.maxMetadataBytes) },
        },
      ]),
    ).toThrow(ViviProviderError);

    const warningFlood = createProviderResult(manifest, request, []);
    warningFlood.warnings = Array.from(
      { length: DEFAULT_PROVIDER_LIMITS.maxWarnings + 1 },
      (_, index) => `warning-${index}`,
    );
    expect(() => validateProviderResult(warningFlood)).toThrow(ViviProviderError);
  });
});
