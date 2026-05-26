
import type { ViviMeshNode } from "@vivi2d/core/types";
import * as agPsd from "ag-psd";
import { describe, expect, it, vi } from "vitest";
import { createViviMesh, createGroup, createProject } from "../../test/fixtures";
import { analyzePsdReimport, applyPsdReimport } from "../psd-reimport";

vi.mock("ag-psd", () => ({
  readPsd: vi.fn(),
}));

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
    width: 1920,
    height: 1080,
    children: layers,
  } as ReturnType<typeof agPsd.readPsd>);
}

function createMockCanvas(w = 100, h = 100): HTMLCanvasElement {
  return { width: w, height: h } as unknown as HTMLCanvasElement;
}

describe("applyPsdReimport", () => {
  it("名前一致のレイヤーテクスチャ/座標を更新する", () => {
    const mesh = createViviMesh({
      name: "体",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
    const project = createProject({ layers: [mesh] });

    const newCanvas = createMockCanvas(120, 130);
    mockPsdResult([
      {
        name: "体",
        left: 10,
        top: 20,
        canvas: newCanvas,
      },
    ]);

    const { project: updated, diff } = applyPsdReimport(new ArrayBuffer(0), project);

    expect(diff.updated).toHaveLength(1);
    expect(diff.updated[0]!.nodeId).toBe(mesh.id);
    expect(diff.added).toHaveLength(0);
    expect(diff.removed).toHaveLength(0);

    const updatedMesh = updated.layers[0] as ViviMeshNode;
    expect(updatedMesh.x).toBe(10);
    expect(updatedMesh.y).toBe(20);
    expect(updatedMesh.width).toBe(120);
    expect(updatedMesh.height).toBe(130);
  });

  it("PSDに新規レイヤーがある場合は追加する", () => {
    const existing = createViviMesh({ name: "体" });
    const project = createProject({ layers: [existing] });

    mockPsdResult([
      { name: "体", left: 0, top: 0, canvas: createMockCanvas() },
      { name: "髪", left: 50, top: 50, canvas: createMockCanvas(200, 200) },
    ]);

    const { project: updated, diff } = applyPsdReimport(new ArrayBuffer(0), project);

    expect(diff.updated).toHaveLength(1);
    expect(diff.added).toHaveLength(1);
    expect(diff.added[0]!.nodeName).toBe("髪");
    expect(updated.layers).toHaveLength(2);
  });

  it("PSDから消えたレイヤーを検出する", () => {
    const body = createViviMesh({ name: "体" });
    const hair = createViviMesh({ name: "髪" });
    const project = createProject({ layers: [body, hair] });

    mockPsdResult([{ name: "体", left: 0, top: 0, canvas: createMockCanvas() }]);

    const { diff } = applyPsdReimport(new ArrayBuffer(0), project);

    expect(diff.updated).toHaveLength(1);
    expect(diff.removed).toHaveLength(1);
    expect(diff.removed[0]!.nodeName).toBe("髪");
  });

  it("グループレイヤーはスキップする", () => {
    const group = createGroup({ name: "グループ" });
    const project = createProject({ layers: [group] });

    mockPsdResult([
      {
        name: "グループ",
        children: [{ name: "子レイヤー", left: 0, top: 0, canvas: createMockCanvas() }],
      },
    ]);

    const { diff } = applyPsdReimport(new ArrayBuffer(0), project);

    expect(diff.added).toHaveLength(1);
    expect(diff.added[0]!.nodeName).toBe("子レイヤー");
  });
});


describe("applyPsdReimport — エッジケース", () => {
  it("空のPSDを再インポートすると全レイヤーがremoved報告される", () => {
    const body = createViviMesh({ name: "体" });
    const hair = createViviMesh({ name: "髪" });
    const project = createProject({ layers: [body, hair] });

    mockPsdResult([]);

    const { diff } = applyPsdReimport(new ArrayBuffer(0), project);

    expect(diff.updated).toHaveLength(0);
    expect(diff.added).toHaveLength(0);
    expect(diff.removed).toHaveLength(2);
    expect(diff.removed.map((r) => r.nodeName).sort()).toEqual(["体", "髪"]);
  });

  it("同名レイヤーが複数ある場合は順番にマッチする", () => {
    const eye1 = createViviMesh({ name: "目" });
    const eye2 = createViviMesh({ name: "目" });
    const project = createProject({ layers: [eye1, eye2] });

    mockPsdResult([
      { name: "目", left: 10, top: 20, canvas: createMockCanvas() },
      { name: "目", left: 30, top: 40, canvas: createMockCanvas() },
    ]);

    const { diff } = applyPsdReimport(new ArrayBuffer(0), project);

    expect(diff.updated).toHaveLength(2);
    expect(diff.removed).toHaveLength(0);
    expect(diff.added).toHaveLength(0);

    const updatedIds = diff.updated.map((u) => u.nodeId);
    expect(updatedIds[0]).not.toBe(updatedIds[1]);
  });

  it("メッシュサイズが変わった場合はリジェネされる", () => {
    const mesh = createViviMesh({
      name: "体",
      width: 100,
      height: 100,
    });
    const originalVertexCount = mesh.mesh.vertices.length;
    const project = createProject({ layers: [mesh] });

    mockPsdResult([{ name: "体", left: 0, top: 0, canvas: createMockCanvas(200, 300) }]);

    const { project: updated, diff } = applyPsdReimport(new ArrayBuffer(0), project);

    expect(diff.updated).toHaveLength(1);
    const updatedMesh = updated.layers[0] as ViviMeshNode;
    expect(updatedMesh.width).toBe(200);
    expect(updatedMesh.height).toBe(300);

    expect(updatedMesh.mesh.vertices.length).toBe(originalVertexCount);
  });

  it("頂点数が変わった場合はメッシュがリジェネされる", () => {
    const mesh = createViviMesh({
      name: "体",
      width: 100,
      height: 100,
    });
    mesh.mesh.vertices.push(50, 50);
    const customVertexCount = mesh.mesh.vertices.length;
    const project = createProject({ layers: [mesh] });

    mockPsdResult([{ name: "体", left: 0, top: 0, canvas: createMockCanvas(100, 100) }]);

    const { project: updated } = applyPsdReimport(new ArrayBuffer(0), project);

    const updatedMesh = updated.layers[0] as ViviMeshNode;
    expect(updatedMesh.mesh.vertices.length).not.toBe(customVertexCount);
  });

  it("canvasがない新規レイヤーはgroupとして追加される", () => {
    const project = createProject({ layers: [] });

    mockPsdResult([{ name: "空レイヤー", left: 0, top: 0, canvas: null }]);

    const { project: updated, diff } = applyPsdReimport(new ArrayBuffer(0), project);

    expect(diff.added).toHaveLength(1);
    expect(diff.added[0]!.nodeName).toBe("空レイヤー");
    const addedLayer = updated.layers[0]!;
    expect(addedLayer.kind).toBe("group");
  });

  it("非表示/半透明/ブレンドモード付きの新規レイヤーを正しく作成する", () => {
    const project = createProject({ layers: [] });

    mockPsdResult([
      {
        name: "半透明レイヤー",
        left: 10,
        top: 20,
        canvas: createMockCanvas(50, 60),
        hidden: true,
        opacity: 128,
      },
    ]);

    const { project: updated } = applyPsdReimport(new ArrayBuffer(0), project);

    const addedLayer = updated.layers[0]!;
    expect(addedLayer.kind).toBe("viviMesh");
    expect(addedLayer.visible).toBe(false);
    expect(addedLayer.opacity).toBeCloseTo(128 / 255);
    expect(addedLayer.x).toBe(10);
    expect(addedLayer.y).toBe(20);
  });
});

// ============================================================
// analyzePsdReimport
// ============================================================

describe("analyzePsdReimport", () => {
  it("名前一致のレイヤーが updated に含まれる", () => {
    const mesh = createViviMesh({ name: "体" });
    const project = createProject({ layers: [mesh] });

    mockPsdResult([{ name: "体", left: 0, top: 0, canvas: createMockCanvas() }]);

    const { diff } = analyzePsdReimport(new ArrayBuffer(0), project);

    expect(diff.updated).toHaveLength(1);
    expect(diff.updated[0]!.nodeId).toBe(mesh.id);
    expect(diff.added).toHaveLength(0);
    expect(diff.removed).toHaveLength(0);
  });

  it("PSDに新規レイヤーがある場合は added に含まれる", () => {
    const project = createProject({ layers: [] });

    mockPsdResult([{ name: "新規", left: 0, top: 0, canvas: createMockCanvas() }]);

    const { diff } = analyzePsdReimport(new ArrayBuffer(0), project);

    expect(diff.updated).toHaveLength(0);
    expect(diff.added).toHaveLength(1);
    expect(diff.added[0]!.nodeName).toBe("新規");
  });

  it("PSDから消えたレイヤーが removed に含まれる", () => {
    const mesh = createViviMesh({ name: "体" });
    const project = createProject({ layers: [mesh] });

    mockPsdResult([]);

    const { diff } = analyzePsdReimport(new ArrayBuffer(0), project);

    expect(diff.updated).toHaveLength(0);
    expect(diff.removed).toHaveLength(1);
    expect(diff.removed[0]!.nodeId).toBe(mesh.id);
  });

  it("グループレイヤーはマッチング対象外", () => {
    const group = createGroup({ name: "グループ" });
    const project = createProject({ layers: [group] });

    mockPsdResult([
      {
        name: "グループ",
        children: [{ name: "子", left: 0, top: 0, canvas: createMockCanvas() }],
      },
    ]);

    const { diff } = analyzePsdReimport(new ArrayBuffer(0), project);

    expect(diff.removed).toHaveLength(0);
    expect(diff.added).toHaveLength(1);
    expect(diff.added[0]!.nodeName).toBe("子");
  });

  it("psdLayers にフラット化されたPSDレイヤー情報が返る", () => {
    const project = createProject({ layers: [] });

    mockPsdResult([
      {
        name: "親",
        children: [{ name: "子A", left: 10, top: 20, canvas: createMockCanvas() }],
      },
      { name: "B", left: 30, top: 40, canvas: createMockCanvas() },
    ]);

    const { psdLayers } = analyzePsdReimport(new ArrayBuffer(0), project);

    const names = psdLayers.map((l) => l.name);
    expect(names).toContain("親");
    expect(names).toContain("子A");
    expect(names).toContain("B");
  });

  it("同名レイヤーが複数ある場合は順番にマッチする", () => {
    const eye1 = createViviMesh({ name: "目" });
    const eye2 = createViviMesh({ name: "目" });
    const project = createProject({ layers: [eye1, eye2] });

    mockPsdResult([
      { name: "目", left: 0, top: 0, canvas: createMockCanvas() },
      { name: "目", left: 10, top: 10, canvas: createMockCanvas() },
    ]);

    const { diff } = analyzePsdReimport(new ArrayBuffer(0), project);

    expect(diff.updated).toHaveLength(2);
    expect(diff.removed).toHaveLength(0);
    const ids = diff.updated.map((u) => u.nodeId);
    expect(ids[0]).not.toBe(ids[1]);
  });
});
