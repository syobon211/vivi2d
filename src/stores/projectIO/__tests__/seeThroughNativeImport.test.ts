import {
  VIVI2D_MANIFEST_SCHEMA_VERSION,
  type ViviCompatNativeImportBundle,
} from "@vivi2d/provider-comfyui";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearTextures, getTexture, setTexture } from "@/lib/texture-store";
import { useEditorStore } from "@/stores/editorStore";
import { resetAllStores } from "@/test/store-reset";
import {
  loadSeeThroughNativeImportBundleAsync,
  parseSeeThroughNativeImportBundleAsync,
} from "../seeThroughNativeImport";

function createBundle(
  overrides: Partial<ViviCompatNativeImportBundle> = {},
): ViviCompatNativeImportBundle {
  return {
    manifestPath: "vivi2d/decompose/job/manifest.json",
    manifest: {
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
          name: "Hair Front",
          label: "hair_front",
          order: 1,
          psd_leaf_token: "layer_000",
          image_path: "layers/layer_000.png",
          bbox: [10, 20, 110, 100],
          confidence: 0.95,
          left_right_split: "center",
          front_back_split: "front",
          depth_stats: { min: 0.1, max: 0.4, mean: 0.2 },
        },
      ],
    },
    layerAssets: [
      {
        image_path: "layers/layer_000.png",
        imageData: new ArrayBuffer(8),
      },
    ],
    ...overrides,
  };
}

describe("see-through native import", () => {
  const originalCreateElement = document.createElement.bind(document);

  beforeEach(() => {
    resetAllStores();
    clearTextures();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    clearTextures();
  });

  function stubImageDecode(sizes: Array<{ width: number; height: number }>) {
    let callIndex = 0;
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => {
        const size = sizes[Math.min(callIndex, sizes.length - 1)]!;
        callIndex += 1;
        return {
          width: size.width,
          height: size.height,
          close: vi.fn(),
        };
      }),
    );

    vi.spyOn(document, "createElement").mockImplementation(((tagName: string) => {
      if (tagName.toLowerCase() === "canvas") {
        const canvas = {
          width: 0,
          height: 0,
          getContext: vi.fn(() => ({
            drawImage: vi.fn(),
            getImageData: vi.fn(
              (_x: number, _y: number, width: number, height: number) => {
                return new ImageData(
                  new Uint8ClampedArray(width * height * 4),
                  width,
                  height,
                );
              },
            ),
            putImageData: vi.fn(),
          })),
        };
        return canvas as unknown as HTMLCanvasElement;
      }
      return originalCreateElement(tagName as keyof HTMLElementTagNameMap);
    }) as typeof document.createElement);
  }

  it("loads a native bundle into the editor and commits textures only after success", async () => {
    stubImageDecode([{ width: 100, height: 80 }]);

    const ok = await loadSeeThroughNativeImportBundleAsync(
      createBundle(),
      "see-through.psd",
    );

    expect(ok).toBe(true);
    const project = useEditorStore.getState().project;
    expect(project?.name).toBe("see-through");
    const layer = project?.layers[0];
    expect(layer?.name).toBe("Hair Front");
    expect(layer?.semanticRole).toBe("hairFront");
    expect(layer?.importMetadata?.seeThrough?.psdLeafToken).toBe("layer_000");
    expect(layer && getTexture(layer.id)).toBeTruthy();
  });

  it("keeps higher manifest order in front when assigning draw order", async () => {
    stubImageDecode([
      { width: 100, height: 80 },
      { width: 100, height: 80 },
    ]);

    const base = createBundle();
    const result = await parseSeeThroughNativeImportBundleAsync(
      createBundle({
        manifest: {
          ...base.manifest,
          layers: [
            {
              ...base.manifest.layers[0]!,
              id: "layer_back",
              name: "Back Hair",
              label: "hair_back",
              order: 0,
              psd_leaf_token: "layer_back",
              image_path: "layers/layer_back.png",
            },
            {
              ...base.manifest.layers[0]!,
              id: "layer_face",
              name: "Face",
              label: "face",
              order: 1,
              psd_leaf_token: "layer_face",
              image_path: "layers/layer_face.png",
            },
          ],
        },
        layerAssets: [
          { image_path: "layers/layer_back.png", imageData: new ArrayBuffer(8) },
          { image_path: "layers/layer_face.png", imageData: new ArrayBuffer(8) },
        ],
      }),
      "see-through.psd",
    );

    const back = result.project.layers.find((layer) => layer.name === "Back Hair");
    const face = result.project.layers.find((layer) => layer.name === "Face");

    expect(face?.drawOrder).toBeGreaterThan(back?.drawOrder ?? -1);
  });

  it("preserves existing texture-store contents when native import fails before commit", async () => {
    stubImageDecode([{ width: 10, height: 10 }]);
    setTexture("existing", {} as HTMLCanvasElement);

    const ok = await loadSeeThroughNativeImportBundleAsync(
      createBundle(),
      "see-through.psd",
      { notifyOnError: false },
    );

    expect(ok).toBe(false);
    expect(getTexture("existing")).toBeTruthy();
  });

  it("rejects duplicate psd leaf tokens", async () => {
    stubImageDecode([
      { width: 100, height: 80 },
      { width: 100, height: 80 },
    ]);

    const bundle = createBundle({
      manifest: {
        ...createBundle().manifest,
        layers: [
          createBundle().manifest.layers[0]!,
          {
            ...createBundle().manifest.layers[0]!,
            id: "layer_001",
            image_path: "layers/layer_001.png",
          },
        ],
      },
      layerAssets: [
        { image_path: "layers/layer_000.png", imageData: new ArrayBuffer(4) },
        { image_path: "layers/layer_001.png", imageData: new ArrayBuffer(4) },
      ],
    });

    await expect(
      parseSeeThroughNativeImportBundleAsync(bundle, "see-through.psd"),
    ).rejects.toThrow(/duplicate see-through psd_leaf_token/i);
  });
});
