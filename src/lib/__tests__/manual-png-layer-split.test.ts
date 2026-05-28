import { afterEach, describe, expect, it, vi } from "vitest";
import type { LayerImportMetadata } from "@vivi2d/core/types";
import {
  countManualPngKnownRoleLayers,
  countMaskPixels,
  createMaskedCanvas,
  hasKnownManualPngRole,
  listManualPngSplitCandidates,
} from "@/lib/manual-png-layer-split";
import { createEmptyProject, createGroup, createViviMesh } from "@/test/fixtures";

function manualPngMetadata(): LayerImportMetadata {
  return {
    source: "manualPng",
    manualPng: {
      sourceFileName: "source.png",
      originalWidth: 2,
      originalHeight: 2,
      trimmedBounds: [0, 0, 2, 2],
      finalOrigin: [0, 0],
      placementMode: "preserveImageOffset",
      autoGenerateMeshApplied: true,
    },
  };
}

function makeCanvas(
  width: number,
  height: number,
  pixels: Array<[number, number, number, number]>,
) {
  const data = new Uint8ClampedArray(width * height * 4);
  pixels.forEach((pixel, pixelIndex) => {
    const index = pixelIndex * 4;
    data[index] = pixel[0];
    data[index + 1] = pixel[1];
    data[index + 2] = pixel[2];
    data[index + 3] = pixel[3];
  });
  const state = {
    imageData: new ImageData(data, width, height),
    written: null as ImageData | null,
  };
  const canvas = {
    width,
    height,
    getContext: vi.fn(() => ({
      getImageData: vi.fn(() => state.imageData),
      putImageData: vi.fn((imageData: ImageData) => {
        state.written = imageData;
      }),
    })),
    __state: state,
  };
  return canvas as unknown as HTMLCanvasElement & { __state: typeof state };
}

describe("manual PNG layer split helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists only manual PNG ViviMesh candidates and counts known semantic roles", () => {
    const manualHair = createViviMesh({
      id: "manual-hair",
      name: "Hair",
      importMetadata: manualPngMetadata(),
      semanticRole: "hair",
    });
    const manualUnknown = createViviMesh({
      id: "manual-unknown",
      name: "Unknown",
      importMetadata: manualPngMetadata(),
      semanticRole: "unknown",
    });
    const psdLayer = createViviMesh({ id: "psd-layer", name: "PSD" });
    const project = createEmptyProject();
    project.layers = [
      createGroup({
        id: "group",
        name: "Group",
        children: [manualHair, psdLayer, manualUnknown],
      }),
    ];

    expect(listManualPngSplitCandidates(project).map((layer) => layer.id)).toEqual([
      "manual-hair",
      "manual-unknown",
    ]);
    expect(hasKnownManualPngRole(manualHair)).toBe(true);
    expect(hasKnownManualPngRole(manualUnknown)).toBe(false);
    expect(hasKnownManualPngRole(psdLayer)).toBe(false);
    expect(countManualPngKnownRoleLayers(project)).toBe(1);
  });

  it("counts mask alpha pixels and applies mask alpha to source canvas", () => {
    const source = makeCanvas(2, 2, [
      [10, 20, 30, 255],
      [40, 50, 60, 128],
      [70, 80, 90, 255],
      [100, 110, 120, 0],
    ]);
    const mask = makeCanvas(2, 2, [
      [0, 0, 0, 255],
      [0, 0, 0, 128],
      [0, 0, 0, 0],
      [0, 0, 0, 255],
    ]);
    const output = makeCanvas(0, 0, []);
    vi.spyOn(document, "createElement").mockReturnValue(output);

    const masked = createMaskedCanvas(source, mask) as typeof output;

    expect(countMaskPixels(mask)).toBe(3);
    expect(masked).toBe(output);
    expect(output.__state.written?.width).toBe(2);
    expect(Array.from(output.__state.written!.data)).toEqual([
      10, 20, 30, 255,
      40, 50, 60, 64,
      70, 80, 90, 0,
      100, 110, 120, 0,
    ]);
  });

  it("rejects empty or mismatched masks", () => {
    const source = makeCanvas(2, 2, [
      [1, 1, 1, 255],
      [1, 1, 1, 255],
      [1, 1, 1, 255],
      [1, 1, 1, 255],
    ]);
    const emptyMask = makeCanvas(2, 2, [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const mismatchedMask = makeCanvas(1, 1, [[0, 0, 0, 255]]);

    expect(createMaskedCanvas(source, emptyMask)).toBeNull();
    expect(createMaskedCanvas(source, mismatchedMask)).toBeNull();
  });
});
