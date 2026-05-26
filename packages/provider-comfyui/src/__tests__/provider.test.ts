import { VIVI_PROVIDER_CAPABILITIES } from "@vivi2d/provider-sdk";
import { invokeProvider } from "@vivi2d/provider-sdk/invocation";
import { describe, expect, it, vi } from "vitest";
import type { ComfyUIClient } from "../client";
import {
  COMFYUI_PROVIDER_ID,
  COMFYUI_PROVIDER_MANIFEST,
  createComfyUIProvider,
} from "../provider";
import {
  VIVI2D_COMPAT_CAPABILITY,
  VIVI2D_COMPAT_PLUGIN_VERSION,
  VIVI2D_MANIFEST_SCHEMA_VERSION,
} from "../vivi2d-compat";

function encodeJson(value: unknown): ArrayBuffer {
  return new TextEncoder().encode(JSON.stringify(value)).buffer;
}

function makeCompatNodeInfo() {
  return {
    input: {
      required: {
        schema_version: ["STRING", { default: VIVI2D_MANIFEST_SCHEMA_VERSION }],
        plugin_version: ["STRING", { default: VIVI2D_COMPAT_PLUGIN_VERSION }],
        capability: ["STRING", { default: VIVI2D_COMPAT_CAPABILITY }],
      },
    },
  };
}

function makeManifest(imagePath = "layers/layer_000.png") {
  return {
    schema_version: VIVI2D_MANIFEST_SCHEMA_VERSION,
    generator: {
      plugin: "vivi2d-compat-comfyui",
      plugin_version: "0.1.0",
      model: "see-through",
      model_version: "test",
    },
    canvas: { width: 1280, height: 720 },
    layers: [
      {
        id: "layer_000",
        name: "hair_front",
        label: "hair_front",
        order: 2,
        psd_leaf_token: "layer_000",
        image_path: imagePath,
        bbox: [0, 0, 128, 256],
        confidence: 0.9,
        left_right_split: "center",
        front_back_split: "front",
        depth_stats: { min: 0.1, max: 0.4, mean: 0.2 },
      },
    ],
  };
}

function makeCompatClientStub(overrides: Partial<ComfyUIClient> = {}): ComfyUIClient {
  const manifest = makeManifest();
  const base = {
    getNodeInfo: vi.fn(async (nodeType: string) => {
      if (nodeType === "ViviSeeThroughDecompose") return makeCompatNodeInfo();
      if (nodeType === "ViviSeeThroughExportPSD") return { input: {} };
      return null;
    }),
    uploadImage: vi.fn(async (_buffer: ArrayBuffer, filename: string) => filename),
    enqueue: vi.fn(async () => ({ prompt_id: "compat-prompt", number: 1 })),
    waitForCompletion: vi.fn(
      async (_id: string, onStep?: (step: number, total: number) => void) => {
        onStep?.(5, 10);
        return {
          outputs: {
            n1: { text: ["vivi2d/decompose/job-provider/manifest.json"] },
          },
          status: { completed: true },
        };
      },
    ),
    downloadOutput: vi
      .fn<ComfyUIClient["downloadOutput"]>()
      .mockResolvedValueOnce(encodeJson(manifest))
      .mockResolvedValueOnce(new ArrayBuffer(18)),
  };

  return { ...base, ...overrides } as unknown as ComfyUIClient;
}

describe("ComfyUI provider adapter", () => {
  it("declares the SDK capabilities exposed by the adapter", () => {
    expect(COMFYUI_PROVIDER_MANIFEST.id).toBe(COMFYUI_PROVIDER_ID);
    expect(
      COMFYUI_PROVIDER_MANIFEST.capabilities.map((capability) => capability.id),
    ).toEqual([
      VIVI_PROVIDER_CAPABILITIES.layerDecompose,
      VIVI_PROVIDER_CAPABILITIES.promptToLayerManifest,
      VIVI_PROVIDER_CAPABILITIES.manifestToPsd,
    ]);
  });

  it("decomposes an input image into manifest and layer artifacts", async () => {
    const client = makeCompatClientStub();
    const provider = createComfyUIProvider(client);
    const progressMessages: string[] = [];

    const result = await invokeProvider(
      provider,
      {
        requestId: "request-1",
        capabilityId: VIVI_PROVIDER_CAPABILITIES.layerDecompose,
        inputArtifacts: [
          {
            id: "input",
            kind: "inputImage",
            mediaType: "image/png",
            byteLength: 4,
            data: new Uint8Array([1, 2, 3, 4]).buffer,
          },
        ],
        parameters: { seed: 1, resolution: 1024 },
      },
      {
        onProgress(progress) {
          progressMessages.push(progress.phase);
        },
      },
    );

    expect(result.provenance.providerId).toBe(COMFYUI_PROVIDER_ID);
    expect(result.artifacts.map((artifact) => artifact.kind)).toEqual([
      "manifest",
      "layerImage",
    ]);
    expect(result.artifacts[0]?.path).toBe("vivi2d/decompose/job-provider/manifest.json");
    expect(result.artifacts[1]?.path).toBe("layers/layer_000.png");
    expect(progressMessages).toContain("processing");
  });

  it("rejects unsafe layer paths returned by ComfyUI", async () => {
    const manifest = makeManifest("../secret.png");
    const client = makeCompatClientStub({
      downloadOutput: vi
        .fn<ComfyUIClient["downloadOutput"]>()
        .mockResolvedValueOnce(encodeJson(manifest))
        .mockResolvedValueOnce(new ArrayBuffer(18)),
    });
    const provider = createComfyUIProvider(client);

    await expect(
      invokeProvider(provider, {
        requestId: "request-2",
        capabilityId: VIVI_PROVIDER_CAPABILITIES.layerDecompose,
        inputArtifacts: [
          {
            id: "input",
            kind: "inputImage",
            mediaType: "image/png",
            byteLength: 4,
            data: new Uint8Array([1, 2, 3, 4]).buffer,
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "VIVI_PROVIDER_BAD_ARTIFACT" });
  });

  it("exports manifest paths to PSD artifacts through the SDK boundary", async () => {
    const psdBuffer = new ArrayBuffer(32);
    const client = makeCompatClientStub({
      waitForCompletion: vi.fn(async () => ({
        outputs: {
          n1: { text: ["vivi2d/psd/job-provider/output.psd"] },
        },
        status: { completed: true },
      })) as unknown as ComfyUIClient["waitForCompletion"],
      downloadOutput: vi.fn(
        async () => psdBuffer,
      ) as unknown as ComfyUIClient["downloadOutput"],
    });

    const result = await invokeProvider(createComfyUIProvider(client), {
      requestId: "request-3",
      capabilityId: VIVI_PROVIDER_CAPABILITIES.manifestToPsd,
      inputArtifacts: [],
      parameters: { manifestPath: "vivi2d\\decompose\\job-provider\\manifest.json" },
    });

    expect(client.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        "1": expect.objectContaining({
          inputs: expect.objectContaining({
            manifest_path: "vivi2d/decompose/job-provider/manifest.json",
          }),
        }),
      }),
    );
    expect(result.artifacts).toMatchObject([
      {
        kind: "psd",
        mediaType: "image/vnd.adobe.photoshop",
        byteLength: psdBuffer.byteLength,
      },
    ]);
  });

  it("rejects unsafe manifest paths before invoking the PSD export workflow", async () => {
    const client = makeCompatClientStub();
    await expect(
      invokeProvider(createComfyUIProvider(client), {
        requestId: "request-4",
        capabilityId: VIVI_PROVIDER_CAPABILITIES.manifestToPsd,
        inputArtifacts: [],
        parameters: { manifestPath: "../evil/manifest.json" },
      }),
    ).rejects.toMatchObject({ code: "VIVI_PROVIDER_BAD_ARTIFACT" });
    expect(client.enqueue).not.toHaveBeenCalled();
  });

  it("generates prompt layer manifests through the SDK capability", async () => {
    const client = makeCompatClientStub();
    const result = await invokeProvider(createComfyUIProvider(client), {
      requestId: "request-5",
      capabilityId: VIVI_PROVIDER_CAPABILITIES.promptToLayerManifest,
      inputArtifacts: [],
      parameters: {
        prompt: "green mascot",
        negativePrompt: "",
        seed: 1,
      },
    });

    expect(result.artifacts.map((artifact) => artifact.kind)).toEqual([
      "manifest",
      "layerImage",
    ]);
    expect(client.uploadImage).not.toHaveBeenCalled();
    expect(client.enqueue).toHaveBeenCalledOnce();
  });

  it("normalizes raw ComfyUI failures and cancellation to provider errors", async () => {
    const failingClient = makeCompatClientStub({
      getNodeInfo: vi.fn(async () => {
        throw new Error("network unavailable");
      }) as unknown as ComfyUIClient["getNodeInfo"],
    });

    await expect(
      createComfyUIProvider(failingClient).invoke({
        requestId: "request-6",
        capabilityId: VIVI_PROVIDER_CAPABILITIES.layerDecompose,
        inputArtifacts: [
          {
            id: "input",
            kind: "inputImage",
            mediaType: "image/png",
            byteLength: 4,
            data: new Uint8Array([1, 2, 3, 4]).buffer,
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "VIVI_PROVIDER_INTERNAL" });

    const controller = new AbortController();
    controller.abort();
    await expect(
      invokeProvider(
        createComfyUIProvider(makeCompatClientStub()),
        {
          requestId: "request-7",
          capabilityId: VIVI_PROVIDER_CAPABILITIES.layerDecompose,
          inputArtifacts: [
            {
              id: "input",
              kind: "inputImage",
              mediaType: "image/png",
              byteLength: 4,
              data: new Uint8Array([1, 2, 3, 4]).buffer,
            },
          ],
        },
        {
          signal: controller.signal,
        },
      ),
    ).rejects.toMatchObject({ code: "VIVI_PROVIDER_CANCELLED" });
  });

  it("fails closed for unsupported capabilities and malformed request payloads", async () => {
    const provider = createComfyUIProvider(makeCompatClientStub());

    await expect(
      provider.invoke({
        requestId: "unsupported",
        capabilityId: "vivi2d.provider.unknown.v1",
        inputArtifacts: [],
      }),
    ).rejects.toMatchObject({ code: "VIVI_PROVIDER_CAPABILITY_UNAVAILABLE" });

    await expect(
      provider.invoke({
        requestId: "missing-input",
        capabilityId: VIVI_PROVIDER_CAPABILITIES.layerDecompose,
        inputArtifacts: [],
      }),
    ).rejects.toMatchObject({ code: "VIVI_PROVIDER_INVALID_REQUEST" });

    await expect(
      provider.invoke({
        requestId: "missing-data",
        capabilityId: VIVI_PROVIDER_CAPABILITIES.layerDecompose,
        inputArtifacts: [
          {
            id: "input",
            kind: "inputImage",
            mediaType: "image/png",
            byteLength: 4,
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "VIVI_PROVIDER_INVALID_REQUEST" });
  });

  it("validates provider parameters before running workflows", async () => {
    const provider = createComfyUIProvider(makeCompatClientStub());

    await expect(
      provider.invoke({
        requestId: "bad-seed",
        capabilityId: VIVI_PROVIDER_CAPABILITIES.layerDecompose,
        inputArtifacts: [
          {
            id: "input",
            kind: "inputImage",
            mediaType: "image/png",
            byteLength: 4,
            data: new Uint8Array([1, 2, 3, 4]).buffer,
          },
        ],
        parameters: { seed: "1" },
      }),
    ).rejects.toMatchObject({ code: "VIVI_PROVIDER_INVALID_REQUEST" });

    await expect(
      provider.invoke({
        requestId: "bad-quant",
        capabilityId: VIVI_PROVIDER_CAPABILITIES.layerDecompose,
        inputArtifacts: [
          {
            id: "input",
            kind: "inputImage",
            mediaType: "image/png",
            byteLength: 4,
            data: new Uint8Array([1, 2, 3, 4]).buffer,
          },
        ],
        parameters: { quantMode: "int8" },
      }),
    ).rejects.toMatchObject({ code: "VIVI_PROVIDER_INVALID_REQUEST" });

    await expect(
      provider.invoke({
        requestId: "missing-prompt",
        capabilityId: VIVI_PROVIDER_CAPABILITIES.promptToLayerManifest,
        inputArtifacts: [],
        parameters: { negativePrompt: "" },
      }),
    ).rejects.toMatchObject({ code: "VIVI_PROVIDER_INVALID_REQUEST" });

    await expect(
      provider.invoke({
        requestId: "bad-filename-prefix",
        capabilityId: VIVI_PROVIDER_CAPABILITIES.manifestToPsd,
        inputArtifacts: [],
        parameters: {
          manifestPath: "vivi2d/decompose/job-provider/manifest.json",
          filenamePrefix: 123,
        },
      }),
    ).rejects.toMatchObject({ code: "VIVI_PROVIDER_INVALID_REQUEST" });
  });

  it("clamps malformed progress totals before exposing progress events", async () => {
    const client = makeCompatClientStub({
      waitForCompletion: vi.fn(
        async (_id: string, onStep?: (step: number, total: number) => void) => {
          onStep?.(Number.NaN, 0);
          return {
            outputs: {
              n1: { text: ["vivi2d/decompose/job-provider/manifest.json"] },
            },
            status: { completed: true },
          };
        },
      ) as unknown as ComfyUIClient["waitForCompletion"],
    });
    const progress: Array<{ step: number; total: number }> = [];

    await invokeProvider(
      createComfyUIProvider(client),
      {
        requestId: "progress",
        capabilityId: VIVI_PROVIDER_CAPABILITIES.layerDecompose,
        inputArtifacts: [
          {
            id: "input",
            kind: "inputImage",
            mediaType: "image/png",
            byteLength: 4,
            data: new Uint8Array([1, 2, 3, 4]).buffer,
          },
        ],
      },
      {
        onProgress(event) {
          progress.push({ step: event.step, total: event.total });
        },
      },
    );

    expect(progress).toContainEqual({ step: 0, total: 100 });
  });
});
