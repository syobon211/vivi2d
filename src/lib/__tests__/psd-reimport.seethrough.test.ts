import type { ViviMeshNode } from "@vivi2d/core/types";
import * as agPsd from "ag-psd";
import { describe, expect, it, vi } from "vitest";
import { analyzePsdReimport, applyPsdReimport } from "@/lib/psd-reimport";
import { createViviMesh, createProject } from "@/test/fixtures";

vi.mock("ag-psd", () => ({
  readPsd: vi.fn(),
}));

function createMockCanvas(w = 100, h = 100): HTMLCanvasElement {
  return { width: w, height: h } as unknown as HTMLCanvasElement;
}

function mockPsdResult(
  layers: {
    name: string;
    left?: number;
    top?: number;
    canvas?: HTMLCanvasElement | null;
    children?: unknown[];
    hidden?: boolean;
    opacity?: number;
  }[],
) {
  vi.mocked(agPsd.readPsd).mockReturnValue({
    width: 512,
    height: 512,
    children: layers,
  } as ReturnType<typeof agPsd.readPsd>);
}

describe("See-through PSD reimport", () => {
  it("matches imported layers by psdLeafToken even when visible names differ", () => {
    const mesh = createViviMesh({
      id: "mesh-1",
      name: "Face Clean",
      semanticRole: "face",
      semanticRoleSource: "assistant",
      importMetadata: {
        source: "seeThrough",
        seeThrough: {
          label: "face",
          order: 1,
          psdLeafToken: "layer_000",
          confidence: 0.9,
          leftRightSplit: "center",
          frontBackSplit: "front",
          bbox: [0, 0, 10, 10],
          depthStats: { min: 0, max: 1, mean: 0.5 },
        },
      },
    });
    const project = createProject({ layers: [mesh] });

    mockPsdResult([
      {
        name: "v2d[layer_000] Face Updated",
        left: 10,
        top: 20,
        canvas: createMockCanvas(120, 140),
      },
    ]);

    const { diff } = analyzePsdReimport(new ArrayBuffer(0), project);
    expect(diff.updated).toEqual([{ nodeId: "mesh-1", nodeName: "Face Clean" }]);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);

    const { project: updated } = applyPsdReimport(new ArrayBuffer(0), project);
    const updatedMesh = updated.layers[0] as ViviMeshNode;
    expect(updatedMesh.name).toBe("Face Clean");
    expect(updatedMesh.semanticRole).toBe("face");
    expect(updatedMesh.semanticRoleSource).toBe("assistant");
    expect(updatedMesh.importMetadata?.seeThrough?.psdLeafToken).toBe("layer_000");
    expect(updatedMesh.x).toBe(10);
    expect(updatedMesh.y).toBe(20);
    expect(updatedMesh.width).toBe(120);
    expect(updatedMesh.height).toBe(140);
  });

  it("backfills psdLeafToken on name fallback when the incoming PSD leaf carries one", () => {
    const mesh = createViviMesh({
      id: "mesh-1",
      name: "Face Clean",
      importMetadata: {
        source: "seeThrough",
        seeThrough: {
          label: "face",
          order: 1,
          confidence: 0.9,
          leftRightSplit: "center",
          frontBackSplit: "front",
          bbox: [0, 0, 10, 10],
          depthStats: { min: 0, max: 1, mean: 0.5 },
        },
      },
    });
    const project = createProject({ layers: [mesh] });

    mockPsdResult([
      {
        name: "v2d[layer_001] Face Clean",
        left: 0,
        top: 0,
        canvas: createMockCanvas(),
      },
    ]);

    const { project: updated } = applyPsdReimport(new ArrayBuffer(0), project);
    const updatedMesh = updated.layers[0] as ViviMeshNode;
    expect(updatedMesh.importMetadata?.seeThrough?.psdLeafToken).toBe("layer_001");
  });

  it("strips technical prefixes when reporting and creating added layers", () => {
    const project = createProject({ layers: [] });

    mockPsdResult([
      {
        name: "v2d[layer_777] New Hat",
        left: 5,
        top: 6,
        canvas: createMockCanvas(80, 90),
      },
    ]);

    const { diff } = analyzePsdReimport(new ArrayBuffer(0), project);
    expect(diff.added).toEqual([{ nodeName: "New Hat" }]);

    const { project: updated } = applyPsdReimport(new ArrayBuffer(0), project);
    expect(updated.layers[0]?.name).toBe("New Hat");
  });

  it("skips token backfill when another imported layer already owns that token", () => {
    const owner = createViviMesh({
      id: "owner",
      name: "Owner",
      importMetadata: {
        source: "seeThrough",
        seeThrough: {
          label: "face",
          order: 0,
          psdLeafToken: "layer_001",
          confidence: 0.9,
          leftRightSplit: "center",
          frontBackSplit: "front",
          bbox: [0, 0, 10, 10],
          depthStats: { min: 0, max: 1, mean: 0.5 },
        },
      },
    });
    const target = createViviMesh({
      id: "target",
      name: "Face Clean",
      importMetadata: {
        source: "seeThrough",
        seeThrough: {
          label: "face",
          order: 1,
          confidence: 0.9,
          leftRightSplit: "center",
          frontBackSplit: "front",
          bbox: [0, 0, 10, 10],
          depthStats: { min: 0, max: 1, mean: 0.5 },
        },
      },
    });
    const project = createProject({ layers: [owner, target] });

    mockPsdResult([
      {
        name: "v2d[layer_001] Face Clean",
        left: 0,
        top: 0,
        canvas: createMockCanvas(),
      },
    ]);

    const { project: updated } = applyPsdReimport(new ArrayBuffer(0), project);
    const updatedTarget = updated.layers[1] as ViviMeshNode;
    expect(updatedTarget.importMetadata?.seeThrough?.psdLeafToken).toBeUndefined();
  });
});
