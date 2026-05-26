import { describe, expect, it } from "vitest";
import { createMaskBuffer } from "../mask-ops";
import {
  acceptUnderpaintBuffer,
  createBoundaryTrimap,
  createLocalUnderpaintPreview,
} from "../underpaint";

function makeSource(width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    data[index * 4] = index;
    data[index * 4 + 1] = 20;
    data[index * 4 + 2] = 30;
    data[index * 4 + 3] = 255;
  }
  return new ImageData(data, width, height);
}

describe("manual layer split underpaint", () => {
  it("creates a trimap with unknown boundary pixels", () => {
    const mask = createMaskBuffer("hair", 5, 5);
    mask.alpha[12] = 255;
    const trimap = createBoundaryTrimap(mask, 1);
    expect(trimap.values[12]).toBe(128);
    expect(trimap.values[0]).toBe(0);
  });

  it("creates preview-only local underpaint cropped to the occlusion", () => {
    const mask = createMaskBuffer("hair", 5, 5);
    mask.alpha[12] = 255;
    const underpaint = createLocalUnderpaintPreview(makeSource(5, 5), mask, {
      underpaintId: "underpaint-1",
      occludedByMaskId: "hair",
      radius: 1,
    });
    expect(underpaint).toMatchObject({
      id: "underpaint-1",
      reviewState: "preview",
      generatorProvenance: "local",
      occludedByMaskId: "hair",
    });
    expect(underpaint?.width).toBe(3);
    expect(underpaint?.height).toBe(3);
    expect(underpaint?.rgba.byteLength).toBe(3 * 3 * 4);
  });

  it("accepts underpaint by cloning content and advancing generation", () => {
    const mask = createMaskBuffer("hair", 3, 3, 255);
    const underpaint = createLocalUnderpaintPreview(makeSource(3, 3), mask, {
      underpaintId: "underpaint-1",
      radius: 1,
    });
    expect(underpaint).not.toBeNull();
    const accepted = acceptUnderpaintBuffer(underpaint!);
    expect(accepted.reviewState).toBe("accepted");
    expect(accepted.generation).toBe(underpaint!.generation + 1);
    expect(accepted.rgba).not.toBe(underpaint!.rgba);
  });
});
