import { describe, expect, it, vi } from "vitest";
import type { ComfyUIClient } from "../client";
import {
  decomposeImageToImportBundleCompat,
  decomposeImageToManifest,
  decomposeImageToNativeImportBundleCompat,
  decomposeImageToPsdCompat,
  ensureViviCompatSupport,
  generateFromPromptToNativeImportBundleCompat,
} from "../orchestrator";
import { assemblePositionedPsd } from "../psd-assembler";
import {
  VIVI2D_COMPAT_CAPABILITY,
  VIVI2D_COMPAT_PLUGIN_VERSION,
  VIVI2D_MANIFEST_SCHEMA_VERSION,
} from "../vivi2d-compat";

vi.mock("../psd-assembler", () => ({
  assemblePsd: vi.fn(),
  assemblePositionedPsd: vi.fn(async () => new ArrayBuffer(24)),
}));

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

function makeCompatClientStub(overrides: Partial<ComfyUIClient> = {}): ComfyUIClient {
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
        onStep?.(10, 10);
        return {
          outputs: {},
          status: { completed: true },
        };
      },
    ),
    downloadOutput: vi.fn(async () => new ArrayBuffer(0)),
  };

  return { ...base, ...overrides } as unknown as ComfyUIClient;
}

describe("compat orchestrator", () => {
  it("ensureViviCompatSupport accepts the expected node contract", async () => {
    const client = makeCompatClientStub();
    await expect(ensureViviCompatSupport(client)).resolves.toBeUndefined();
  });

  it("ensureViviCompatSupport rejects when required nodes are missing", async () => {
    const client = makeCompatClientStub({
      getNodeInfo: vi.fn(async () => null) as unknown as ComfyUIClient["getNodeInfo"],
    });

    await expect(ensureViviCompatSupport(client)).rejects.toThrow(
      /Vivi2D compat plugin is unavailable/,
    );
  });

  it("decomposeImageToManifest downloads and parses the compat manifest", async () => {
    const manifest = {
      schema_version: VIVI2D_MANIFEST_SCHEMA_VERSION,
      generator: {
        plugin: "vivi2d-compat-comfyui",
        plugin_version: "0.1.0",
        model: "see-through",
        model_version: "test",
      },
      canvas: { width: 1280, height: 720 },
      layers: [],
    };

    const client = makeCompatClientStub({
      waitForCompletion: vi.fn(async () => ({
        outputs: {
          n1: { text: ["vivi2d/decompose/job-1/manifest.json"] },
        },
        status: { completed: true },
      })) as unknown as ComfyUIClient["waitForCompletion"],
      downloadOutput: vi.fn(async () =>
        encodeJson(manifest),
      ) as unknown as ComfyUIClient["downloadOutput"],
    });

    const result = await decomposeImageToManifest(client, new ArrayBuffer(8));

    expect(result.manifestPath).toBe("vivi2d/decompose/job-1/manifest.json");
    expect(result.manifest).toEqual(manifest);
    expect(client.downloadOutput).toHaveBeenCalledWith(
      "manifest.json",
      "vivi2d/decompose/job-1",
      "output",
    );
  });

  it("decomposeImageToPsdCompat runs the manifest workflow and the PSD export workflow", async () => {
    const manifest = {
      schema_version: VIVI2D_MANIFEST_SCHEMA_VERSION,
      generator: {
        plugin: "vivi2d-compat-comfyui",
        plugin_version: "0.1.0",
        model: "see-through",
        model_version: "test",
      },
      canvas: { width: 1280, height: 720 },
      layers: [],
    };
    const psdBuffer = new ArrayBuffer(32);

    const waitForCompletion = vi
      .fn<ComfyUIClient["waitForCompletion"]>()
      .mockResolvedValueOnce({
        outputs: {
          n1: { text: ["vivi2d/decompose/job-2/manifest.json"] },
        },
        status: { completed: true },
      } as any)
      .mockResolvedValueOnce({
        outputs: {
          n1: { text: ["vivi2d/psd/job-2/output.psd"] },
        },
        status: { completed: true },
      } as any);

    const downloadOutput = vi
      .fn<ComfyUIClient["downloadOutput"]>()
      .mockResolvedValueOnce(encodeJson(manifest))
      .mockResolvedValueOnce(psdBuffer);

    const client = makeCompatClientStub({
      waitForCompletion:
        waitForCompletion as unknown as ComfyUIClient["waitForCompletion"],
      downloadOutput: downloadOutput as unknown as ComfyUIClient["downloadOutput"],
    });

    const result = await decomposeImageToPsdCompat(client, new ArrayBuffer(8), {
      filenamePrefix: "compat_job",
    });

    expect(client.enqueue).toHaveBeenCalledTimes(2);
    expect(downloadOutput).toHaveBeenNthCalledWith(
      1,
      "manifest.json",
      "vivi2d/decompose/job-2",
      "output",
    );
    expect(downloadOutput).toHaveBeenNthCalledWith(
      2,
      "output.psd",
      "vivi2d/psd/job-2",
      "output",
    );
    expect(result).toBe(psdBuffer);
  });

  it("decomposeImageToPsdCompat falls back to local PSD assembly when export node is missing", async () => {
    const manifest = {
      schema_version: VIVI2D_MANIFEST_SCHEMA_VERSION,
      generator: {
        plugin: "vivi2d-compat-comfyui",
        plugin_version: "0.1.0",
        model: "see-through",
        model_version: "test",
      },
      canvas: { width: 512, height: 512 },
      layers: [
        {
          id: "layer_000",
          name: "hair_back",
          label: "hair_back",
          order: 3,
          psd_leaf_token: "layer_000",
          image_path: "layers/layer_000.png",
          bbox: [10, 20, 110, 220],
          confidence: 0.9,
          left_right_split: "center",
          front_back_split: "back",
          depth_stats: { min: 0.1, max: 0.5, mean: 0.3 },
        },
      ],
    };

    const downloadOutput = vi
      .fn<ComfyUIClient["downloadOutput"]>()
      .mockResolvedValueOnce(encodeJson(manifest))
      .mockResolvedValueOnce(new ArrayBuffer(12));

    const client = makeCompatClientStub({
      getNodeInfo: vi.fn(async (nodeType: string) => {
        if (nodeType === "ViviSeeThroughDecompose") return makeCompatNodeInfo();
        return null;
      }) as unknown as ComfyUIClient["getNodeInfo"],
      waitForCompletion: vi.fn(async () => ({
        outputs: {
          n1: { text: ["vivi2d/decompose/job-3/manifest.json"] },
        },
        status: { completed: true },
      })) as unknown as ComfyUIClient["waitForCompletion"],
      downloadOutput: downloadOutput as unknown as ComfyUIClient["downloadOutput"],
    });

    const result = await decomposeImageToPsdCompat(client, new ArrayBuffer(8));

    expect(client.enqueue).toHaveBeenCalledTimes(1);
    expect(downloadOutput).toHaveBeenNthCalledWith(
      1,
      "manifest.json",
      "vivi2d/decompose/job-3",
      "output",
    );
    expect(downloadOutput).toHaveBeenNthCalledWith(
      2,
      "layer_000.png",
      "vivi2d/decompose/job-3/layers",
      "output",
    );
    expect(assemblePositionedPsd).toHaveBeenCalledTimes(1);
    expect(result.byteLength).toBe(24);
  });

  it("decomposeImageToImportBundleCompat returns PSD plus manifest", async () => {
    const manifest = {
      schema_version: VIVI2D_MANIFEST_SCHEMA_VERSION,
      generator: {
        plugin: "vivi2d-compat-comfyui",
        plugin_version: "0.1.0",
        model: "see-through",
        model_version: "test",
      },
      canvas: { width: 1280, height: 720 },
      layers: [],
    };
    const psdBuffer = new ArrayBuffer(20);

    const waitForCompletion = vi
      .fn<ComfyUIClient["waitForCompletion"]>()
      .mockResolvedValueOnce({
        outputs: {
          n1: { text: ["vivi2d/decompose/job-4/manifest.json"] },
        },
        status: { completed: true },
      } as any)
      .mockResolvedValueOnce({
        outputs: {
          n1: { text: ["vivi2d/psd/job-4/output.psd"] },
        },
        status: { completed: true },
      } as any);

    const downloadOutput = vi
      .fn<ComfyUIClient["downloadOutput"]>()
      .mockResolvedValueOnce(encodeJson(manifest))
      .mockResolvedValueOnce(psdBuffer);

    const client = makeCompatClientStub({
      waitForCompletion:
        waitForCompletion as unknown as ComfyUIClient["waitForCompletion"],
      downloadOutput: downloadOutput as unknown as ComfyUIClient["downloadOutput"],
    });

    const result = await decomposeImageToImportBundleCompat(client, new ArrayBuffer(8));

    expect(result.manifest).toEqual(manifest);
    expect(result.psdBuffer).toBe(psdBuffer);
    expect(result.manifestPath).toBe("vivi2d/decompose/job-4/manifest.json");
  });

  it("decomposeImageToNativeImportBundleCompat returns manifest plus downloaded layer assets", async () => {
    const manifest = {
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
          image_path: "layers/layer_000.png",
          bbox: [0, 0, 128, 256],
          confidence: 0.9,
          left_right_split: "center",
          front_back_split: "front",
          depth_stats: { min: 0.1, max: 0.4, mean: 0.2 },
        },
      ],
    };

    const pngBuffer = new ArrayBuffer(18);
    const downloadOutput = vi
      .fn<ComfyUIClient["downloadOutput"]>()
      .mockResolvedValueOnce(encodeJson(manifest))
      .mockResolvedValueOnce(pngBuffer);

    const client = makeCompatClientStub({
      waitForCompletion: vi.fn(async () => ({
        outputs: {
          n1: { text: ["vivi2d/decompose/job-native/manifest.json"] },
        },
        status: { completed: true },
      })) as unknown as ComfyUIClient["waitForCompletion"],
      downloadOutput: downloadOutput as unknown as ComfyUIClient["downloadOutput"],
    });

    const result = await decomposeImageToNativeImportBundleCompat(
      client,
      new ArrayBuffer(8),
    );

    expect(result.manifestPath).toBe("vivi2d/decompose/job-native/manifest.json");
    expect(result.manifest).toEqual(manifest);
    expect(result.layerAssets).toEqual([
      {
        image_path: "layers/layer_000.png",
        imageData: pngBuffer,
      },
    ]);
    expect(downloadOutput).toHaveBeenNthCalledWith(
      2,
      "layer_000.png",
      "vivi2d/decompose/job-native/layers",
      "output",
    );
  });

  it("generateFromPromptToNativeImportBundleCompat uses the prompt workflow and downloads layer assets", async () => {
    const manifest = {
      schema_version: VIVI2D_MANIFEST_SCHEMA_VERSION,
      generator: {
        plugin: "vivi2d-compat-comfyui",
        plugin_version: "0.1.0",
        model: "see-through",
        model_version: "test",
      },
      canvas: { width: 1024, height: 1024 },
      layers: [
        {
          id: "layer_100",
          name: "mouth",
          label: "mouth",
          order: 0,
          psd_leaf_token: "layer_100",
          image_path: "layers/layer_100.png",
          bbox: [10, 20, 110, 120],
          confidence: 0.95,
          left_right_split: "center",
          front_back_split: "front",
          depth_stats: { min: 0.1, max: 0.4, mean: 0.2 },
        },
      ],
    };

    const client = makeCompatClientStub({
      waitForCompletion: vi.fn(async () => ({
        outputs: {
          n1: { text: ["vivi2d/decompose/job-prompt/manifest.json"] },
        },
        status: { completed: true },
      })) as unknown as ComfyUIClient["waitForCompletion"],
      downloadOutput: vi
        .fn<ComfyUIClient["downloadOutput"]>()
        .mockResolvedValueOnce(encodeJson(manifest))
        .mockResolvedValueOnce(
          new ArrayBuffer(7),
        ) as unknown as ComfyUIClient["downloadOutput"],
    });

    const result = await generateFromPromptToNativeImportBundleCompat(client, {
      prompt: "test",
      negativePrompt: "",
      seed: 1,
      resolution: 1024,
      numSteps: 20,
    });

    expect(result.manifestPath).toBe("vivi2d/decompose/job-prompt/manifest.json");
    expect(result.layerAssets).toHaveLength(1);
    expect(client.enqueue).toHaveBeenCalledOnce();
  });
});
