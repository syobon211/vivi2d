import { describe, expect, it } from "vitest";
import { isProtectedLayerSemantic, normalizeProviderSemantic, toLayerGraphSemantic } from "@vivi2d/editor-core/layer-graph";
import {
  applyCircleBrush,
  applyPolygonMask,
  countMaskPixels,
  createMaskBuffer,
  featherMask,
  fillSmallHoles,
  growMask,
  regionGrowFromPoint,
  removeSmallIslands,
  resolveOverlapToActive,
  shrinkMask,
} from "../mask-ops";
import { validateManualLayerSplitDraft } from "../validation";
import type { ManualLayerMask } from "../types";

function mask(id: string, maskBufferId: string, role = "hair"): ManualLayerMask {
  return {
    id,
    name: id,
    semanticRole: role as ManualLayerMask["semanticRole"],
    maskBufferId,
    color: "#fff",
    locked: false,
    visible: true,
    provenance: "user",
    riggingHint: "rigid",
    edgeFeatherPx: 0,
  };
}

describe("manual layer split mask operations", () => {
  it("edits masks with brush, lasso, and overlap resolution", () => {
    const hair = createMaskBuffer("hair-buffer", 8, 8);
    const face = createMaskBuffer("face-buffer", 8, 8);

    applyCircleBrush(hair, 4, 4, 2, "add");
    applyPolygonMask(face, [
      { x: 3, y: 3 },
      { x: 7, y: 3 },
      { x: 7, y: 7 },
      { x: 3, y: 7 },
    ], "add");

    expect(countMaskPixels(hair)).toBeGreaterThan(0);
    expect(countMaskPixels(face)).toBeGreaterThan(0);

    resolveOverlapToActive([hair, face], hair.id);

    for (let index = 0; index < hair.alpha.length; index += 1) {
      expect(hair.alpha[index]! > 0 && face.alpha[index]! > 0).toBe(false);
    }
  });

  it("replace mode clears pixels outside the new shape", () => {
    const buffer = createMaskBuffer("mask", 8, 8, 255);
    applyCircleBrush(buffer, 4, 4, 1, "replace");
    expect(countMaskPixels(buffer)).toBeLessThan(64);
    expect(buffer.alpha[0]).toBe(0);

    applyPolygonMask(buffer, [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 0, y: 2 },
    ], "replace");
    expect(buffer.alpha[7 * buffer.width + 7]).toBe(0);
  });

  it("supports morphology and region grow helpers", () => {
    const buffer = createMaskBuffer("mask", 5, 5);
    buffer.alpha[2 * buffer.width + 2] = 255;
    growMask(buffer, 1);
    expect(countMaskPixels(buffer)).toBeGreaterThan(1);
    shrinkMask(buffer, 1);
    expect(countMaskPixels(buffer)).toBeGreaterThanOrEqual(1);

    const island = createMaskBuffer("island", 5, 5);
    island.alpha[0] = 255;
    island.alpha[2 * island.width + 2] = 255;
    removeSmallIslands(island, 2);
    expect(countMaskPixels(island)).toBe(0);

    const hole = createMaskBuffer("hole", 5, 5, 255);
    hole.alpha[2 * hole.width + 2] = 0;
    fillSmallHoles(hole, 1);
    expect(countMaskPixels(hole)).toBe(25);

    featherMask(buffer, 1);
    expect(Math.max(...buffer.alpha)).toBeGreaterThan(0);

    const source = new ImageData(
      new Uint8ClampedArray([
        10, 10, 10, 255, 10, 10, 10, 255,
        200, 200, 200, 255, 200, 200, 200, 255,
      ]),
      2,
      2,
    );
    const grown = createMaskBuffer("grown", 2, 2);
    regionGrowFromPoint(source, grown, 0, 0, 4);
    expect(countMaskPixels(grown)).toBe(2);
  });

  it("reports blockers and warnings for draft quality", () => {
    const hair = createMaskBuffer("hair-buffer", 4, 4);
    const face = createMaskBuffer("face-buffer", 4, 4);
    applyCircleBrush(hair, 1, 1, 1.5, "add");
    applyCircleBrush(face, 1, 1, 1.5, "add");
    const checks = validateManualLayerSplitDraft(
      [mask("hair", hair.id), mask("face", face.id, "face")],
      new Map([
        [hair.id, hair],
        [face.id, face],
      ]),
    );

    expect(checks.some((check) => check.id === "overlap")).toBe(true);
    expect(checks.some((check) => check.severity === "blocker")).toBe(false);
  });
});

describe("manual layer split semantic helpers", () => {
  it("keeps protected semantics and graph projections explicit", () => {
    expect(isProtectedLayerSemantic("eyeLeft")).toBe(true);
    expect(isProtectedLayerSemantic("hair")).toBe(false);
    expect(toLayerGraphSemantic("ear")).toBe("accessory");
    expect(normalizeProviderSemantic("eye")).toEqual({
      roles: ["eyeLeft", "eyeRight"],
      ambiguous: true,
    });
  });
});
