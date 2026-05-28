import type { BoneNode, ColliderConfig, IKController, LayerNode } from "@vivi2d/core/types";
import { describe, expect, it } from "vitest";
import {
  drawBoneOverlayRecursive,
  drawColliderOverlay,
  drawIKOverlay,
  drawMeshEdges,
  drawMeshHeatmapEdges,
  drawMeshHeatmapVertices,
  drawMeshPuppetFalloff,
  drawMeshPuppetPins,
  drawMeshVertices,
  drawOverlayLasso,
  type EditorOverlayGraphics,
} from "../editor-overlay-draw";

type DrawCall = { method: string; args: unknown[] };

function makeGraphics() {
  const calls: DrawCall[] = [];
  const graphics = {
    calls,
    circle: (...args: unknown[]) => {
      calls.push({ method: "circle", args });
      return graphics;
    },
    fill: (...args: unknown[]) => {
      calls.push({ method: "fill", args });
      return graphics;
    },
    lineTo: (...args: unknown[]) => {
      calls.push({ method: "lineTo", args });
      return graphics;
    },
    moveTo: (...args: unknown[]) => {
      calls.push({ method: "moveTo", args });
      return graphics;
    },
    rect: (...args: unknown[]) => {
      calls.push({ method: "rect", args });
      return graphics;
    },
    stroke: (...args: unknown[]) => {
      calls.push({ method: "stroke", args });
      return graphics;
    },
  };
  return graphics as unknown as EditorOverlayGraphics & { calls: DrawCall[] };
}

function methods(g: { calls: DrawCall[] }, method: string) {
  return g.calls.filter((call) => call.method === method);
}

function makeBone(overrides: Partial<BoneNode> = {}): BoneNode {
  return {
    id: "bone",
    name: "Bone",
    kind: "bone",
    visible: true,
    opacity: 1,
    x: 10,
    y: 20,
    width: 0,
    height: 0,
    blendMode: "normal",
    expanded: true,
    children: [],
    bone: { angle: 0, length: 30, scaleX: 1, scaleY: 1 },
    ...overrides,
  };
}

describe("editor overlay drawing helpers", () => {
  it("draws bone overlays recursively and marks selected bones", () => {
    const g = makeGraphics();
    const child = makeBone({ id: "child", x: 15, y: 25 });
    const root = makeBone({ id: "root", children: [child] });

    drawBoneOverlayRecursive(g, [root], "child", 2, 5, 7);

    expect(methods(g, "moveTo")).toHaveLength(2);
    expect(methods(g, "lineTo")).toHaveLength(2);
    expect(methods(g, "circle")).toHaveLength(4);
    expect(methods(g, "stroke").map((call) => call.args[0])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ color: expect.any(Number) }),
      ]),
    );
  });

  it("draws collider rectangles, circles, handles, and disabled alpha", () => {
    const rectGraphics = makeGraphics();
    const rect: ColliderConfig = {
      id: "rect",
      name: "Rect",
      enabled: true,
      shape: { type: "rectangle", x: 1, y: 2, width: 3, height: 4 },
    };
    drawColliderOverlay(rectGraphics, rect, true, 2, 10, 20);

    expect(methods(rectGraphics, "rect")).toHaveLength(2);
    expect(methods(rectGraphics, "circle")).toHaveLength(4);

    const circleGraphics = makeGraphics();
    const circle: ColliderConfig = {
      id: "circle",
      name: "Circle",
      enabled: false,
      shape: { type: "circle", x: 8, y: 9, radius: 5 },
    };
    drawColliderOverlay(circleGraphics, circle, true, 3, 0, 0);

    expect(methods(circleGraphics, "circle")).toHaveLength(2);
    expect(methods(circleGraphics, "fill")[0]?.args[0]).toEqual(
      expect.objectContaining({ alpha: expect.any(Number) }),
    );
  });

  it("uses runtime IK targets and optional pole targets", () => {
    const g = makeGraphics();
    const ik: IKController = {
      id: "ik",
      name: "IK",
      enabled: true,
      targetBoneId: "bone",
      chainLength: 2,
      iterations: 8,
      targetX: 1,
      targetY: 2,
      poleTargetX: 3,
      poleTargetY: 4,
    };

    drawIKOverlay(g, [ik], new Map([["ik", { x: 10, y: 20 }]]), 2, 1, 1);

    expect(methods(g, "circle")[0]?.args.slice(0, 2)).toEqual([21, 41]);
    expect(methods(g, "circle")).toHaveLength(2);
    expect(methods(g, "lineTo")).toHaveLength(2);
  });

  it("deduplicates mesh edges and skips incomplete vertices", () => {
    const g = makeGraphics();

    drawMeshEdges(
      g,
      [0, 0, 10, 0, 0, 10, 10, 10],
      [0, 1, 2, 2, 1, 3, 3, 9, 0],
      { x: 1, y: 2 },
      2,
      5,
      7,
    );

    expect(methods(g, "lineTo")).toHaveLength(6);
    expect(methods(g, "stroke")).toHaveLength(6);
  });

  it("draws selected mesh vertices and heatmap samples only when valid", () => {
    const vertices = [0, 0, 10, 0, 0, 10];
    const selected = new Set([1]);
    const vertexGraphics = makeGraphics();

    drawMeshVertices(vertexGraphics, vertices, { x: 0, y: 0 }, 1, 0, 0, selected, -1, true);

    expect(methods(vertexGraphics, "circle")).toHaveLength(1);
    expect(methods(vertexGraphics, "circle")[0]?.args.slice(0, 2)).toEqual([10, 0]);

    const heatmapGraphics = makeGraphics();
    drawMeshHeatmapEdges(
      heatmapGraphics,
      [
        { a: 0, b: 1, intensity: 0.5 },
        { a: 1, b: 2, intensity: 0 },
        { a: 1, b: 9, intensity: 1 },
      ],
      vertices,
      { x: 0, y: 0 },
      1,
      0,
      0,
      (value) => Math.round(value * 10),
    );
    drawMeshHeatmapVertices(
      heatmapGraphics,
      [
        { vertexIndex: 2, intensity: 0.4 },
        { vertexIndex: 1, intensity: 0 },
        { vertexIndex: 8, intensity: 1 },
      ],
      vertices,
      { x: 0, y: 0 },
      1,
      0,
      0,
      (value) => Math.round(value * 10),
    );

    expect(methods(heatmapGraphics, "lineTo")).toHaveLength(1);
    expect(methods(heatmapGraphics, "circle")).toHaveLength(1);
    expect(methods(heatmapGraphics, "fill")[0]?.args[0]).toEqual(
      expect.objectContaining({ color: 4 }),
    );
  });

  it("draws puppet pins, selected falloff rings, and overlay lasso paths", () => {
    const g = makeGraphics();
    const vertices = [0, 0, 10, 0, 20, 0];
    const pins = [
      { vertexIndex: 0, kind: "anchor" as const, radius: 4 },
      { vertexIndex: 1, kind: "handle" as const, radius: 6 },
      { vertexIndex: 7, kind: "handle" as const, radius: 6 },
    ];

    drawMeshPuppetPins(g, { x: 1, y: 1 }, vertices, pins, new Set([1]), 2, 0, 0);
    drawMeshPuppetFalloff(g, { x: 1, y: 1 }, vertices, pins, new Set([1]), 2, 0, 0);
    drawOverlayLasso(g, [0, 0, 10, 0, 10, 10]);

    expect(methods(g, "circle")).toHaveLength(3);
    expect(methods(g, "moveTo").at(-1)?.args).toEqual([0, 0]);
    expect(methods(g, "lineTo").map((call) => call.args)).toEqual(
      expect.arrayContaining([[10, 0], [10, 10], [0, 0]]),
    );
  });
});
