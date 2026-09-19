import type { ViviMeshNode } from "@vivi2d/core/types";
import * as agPsd from "ag-psd";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodePngToCanvas } from "@/lib/image-loader";
import { analyzePsdReimport, applyPsdReimport } from "@/lib/psd-reimport";
import { clearTextures, getTexture, setTexture } from "@/lib/texture-store";
import { useEditorStore } from "@/stores/editorStore";
import { useHistoryStore } from "@/stores/historyStore";
import { useNotificationStore } from "@/stores/notificationStore";
import { reimportManualPngLayer } from "@/stores/projectIO/image";
import {
  createAnimationClip,
  createBoneNode,
  createPhysicsGroup,
  createProject,
  createViviMesh,
  createViviMeshWithSkin,
} from "@/test/fixtures";
import { installRasterCanvas } from "@/test/raster-canvas";

vi.mock("ag-psd", () => ({ readPsd: vi.fn() }));
vi.mock("@/lib/image-loader", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/image-loader")>()),
  decodePngToCanvas: vi.fn(),
}));

function createSeeThroughMesh(
  id = "face",
  name = "Face Clean",
  token: string | undefined = "layer_000",
): ViviMeshNode {
  return createViviMesh({
    id,
    name,
    x: 13,
    y: 17,
    width: 2,
    height: 2,
    semanticRole: "face",
    semanticRoleSource: "assistant",
    importMetadata: {
      source: "seeThrough",
      seeThrough: {
        label: "face",
        order: 1,
        confidence: 0.9,
        leftRightSplit: "center",
        frontBackSplit: "front",
        bbox: [3, 4, 10, 10],
        depthStats: { min: 0, max: 1, mean: 0.5 },
        ...(token ? { psdLeafToken: token } : {}),
      },
    },
  });
}

function mockPsdResult(
  layers: { name: string; left?: number; top?: number; canvas: HTMLCanvasElement }[],
) {
  vi.mocked(agPsd.readPsd).mockReturnValue({
    width: 512,
    height: 256,
    children: layers,
  } as ReturnType<typeof agPsd.readPsd>);
}

let raster: ReturnType<typeof installRasterCanvas>;
beforeEach(() => {
  raster = installRasterCanvas();
  clearTextures();
  useEditorStore.setState({
    project: null,
    projectVersion: 0,
    projectStructureVersion: 0,
    currentFilePath: null,
    projectSourceKind: "none",
  });
  useHistoryStore.getState().clear();
  useNotificationStore.setState({ notifications: [] });
  vi.mocked(agPsd.readPsd).mockReset();
  vi.mocked(decodePngToCanvas).mockReset();
});
afterEach(() => {
  clearTextures();
  raster.restore();
});

describe("SeeThrough PSD texture-only reimport", () => {
  it("matches a renamed token and retains authored model/rig data across resize, Undo, and Redo", () => {
    const bone = createBoneNode({
      id: "bone",
      bone: { angle: 23, length: 42, scaleX: 1, scaleY: 0.8 },
    });
    const { mesh, skin } = createViviMeshWithSkin([bone.id], {
      ...createSeeThroughMesh(),
      mesh: {
        vertices: [0.2, 0.1, 1.8, 0.3, 1.3, 1.9],
        uvs: [0, 0.1, 1, 0.2, 0.6, 1],
        indices: [2, 0, 1],
        divisionsX: 8,
        divisionsY: 7,
      },
      visible: false,
      opacity: 0.43,
      blendMode: "multiply",
      drawOrder: 19,
    });
    const project = createProject({
      width: 20,
      height: 30,
      layers: [bone, mesh],
      skins: { [mesh.id]: skin },
      clips: [createAnimationClip({ duration: 41, fps: 24 })],
      physicsGroups: [createPhysicsGroup({ wind: 0.17, gravityStrength: 5.4 })],
    });
    const before = structuredClone(project);
    useEditorStore.setState({ project });
    setTexture(mesh.id, raster.create(2, 2, 11));
    mockPsdResult([
      {
        name: "v2d[layer_000] Face Updated",
        left: 101,
        top: 102,
        canvas: raster.create(4, 4, 22),
      },
    ]);

    const preview = analyzePsdReimport(new ArrayBuffer(8), project);
    expect(preview.entries[0]).toMatchObject({
      nodeId: mesh.id,
      nodeName: "Face Clean",
      status: "needs-confirmation",
      oldWidth: 2,
      oldHeight: 2,
      newWidth: 4,
      newHeight: 4,
      sourceLeft: 101,
      sourceTop: 102,
    });
    expect(preview.documentWidth).toBe(512);
    expect(
      applyPsdReimport(preview, {
        selectedLeafIndices: [0],
        confirmedResolutionLeafIndices: [0],
      }),
    ).toEqual({ updatedCount: 1 });
    expect(useEditorStore.getState().project).toEqual(before);
    expect(getTexture(mesh.id)).toMatchObject({ width: 4, height: 4 });
    expect(raster.read(getTexture(mesh.id)!)).toEqual(Array(64).fill(22));
    expect(useHistoryStore.getState().undoStack).toHaveLength(1);

    useHistoryStore.getState().undo();
    expect(useEditorStore.getState().project).toEqual(before);
    expect(getTexture(mesh.id)).toMatchObject({ width: 2, height: 2 });
    expect(raster.read(getTexture(mesh.id)!)).toEqual(Array(16).fill(11));

    useHistoryStore.getState().redo();
    expect(useEditorStore.getState().project).toEqual(before);
    expect(getTexture(mesh.id)).toMatchObject({ width: 4, height: 4 });
    expect(raster.read(getTexture(mesh.id)!)).toEqual(Array(64).fill(22));
    expect(agPsd.readPsd).toHaveBeenCalledTimes(2);
  });

  it.each([
    undefined,
    "previous-token",
  ])("records token-only backfill/rebinding with identical pixels (%s)", (oldToken) => {
    const mesh = createSeeThroughMesh();
    if (mesh.importMetadata?.source === "seeThrough") {
      if (oldToken) mesh.importMetadata.seeThrough.psdLeafToken = oldToken;
      else delete mesh.importMetadata.seeThrough.psdLeafToken;
    }
    const project = createProject({ layers: [mesh] });
    const before = structuredClone(project);
    const expected = structuredClone(project);
    expected.layers[0]!.importMetadata!.seeThrough!.psdLeafToken = "replacement-token";
    useEditorStore.setState({ project });
    const oldTexture = raster.create(2, 2, 11);
    setTexture(mesh.id, oldTexture);
    mockPsdResult([
      { name: "v2d[replacement-token] Face Clean", canvas: raster.create(2, 2, 11) },
    ]);

    const preview = analyzePsdReimport(new ArrayBuffer(8), project);
    expect(
      applyPsdReimport(preview, {
        selectedLeafIndices: [0],
        confirmedResolutionLeafIndices: [],
      }),
    ).toEqual({ updatedCount: 1 });
    expect(useEditorStore.getState().project).toEqual(expected);
    expect(getTexture(mesh.id)).toBe(oldTexture);
    expect(useHistoryStore.getState().undoStack).toHaveLength(1);

    useHistoryStore.getState().undo();
    expect(useEditorStore.getState().project).toEqual(before);
    expect(getTexture(mesh.id)).toBe(oldTexture);
    useHistoryStore.getState().redo();
    expect(useEditorStore.getState().project).toEqual(expected);
    expect(getTexture(mesh.id)).toBe(oldTexture);
  });

  it("keeps collision targets and excluded metadata untouched while applying only the safe selection", () => {
    const conflict = createSeeThroughMesh("conflict", "Face", "owner-token");
    const excluded = createSeeThroughMesh("excluded", "Hair", "keep-token");
    const selected = createSeeThroughMesh("selected", "Body", "old-body");
    const project = createProject({ layers: [conflict, excluded, selected] });
    const before = structuredClone(project);
    useEditorStore.setState({ project });
    const oldConflict = raster.create(2, 2, 1);
    const oldExcluded = raster.create(2, 2, 2);
    setTexture(conflict.id, oldConflict);
    setTexture(excluded.id, oldExcluded);
    setTexture(selected.id, raster.create(2, 2, 3));
    mockPsdResult([
      { name: "v2d[owner-token] Renamed Face", canvas: raster.create(2, 2, 4) },
      { name: "Face", canvas: raster.create(2, 2, 5) },
      { name: "v2d[new-hair] Hair", canvas: raster.create(2, 2, 6) },
      { name: "v2d[new-body] Body", canvas: raster.create(2, 2, 7) },
      { name: "v2d[new-hat] New Hat", canvas: raster.create(2, 2, 8) },
    ]);
    const preview = analyzePsdReimport(new ArrayBuffer(8), project);
    expect(preview.entries.map((entry) => entry.status)).toEqual([
      "held",
      "held",
      "eligible",
      "eligible",
      "unmatched",
    ]);
    expect(preview.entries[0]?.reason).toBe("target-conflict");
    expect(preview.entries[1]?.reason).toBe("target-conflict");
    expect(preview.entries[4]?.nodeName).toBe("New Hat");

    expect(
      applyPsdReimport(preview, {
        selectedLeafIndices: [3],
        confirmedResolutionLeafIndices: [],
      }),
    ).toEqual({ updatedCount: 1 });
    const after = useEditorStore.getState().project!;
    expect(after.layers).toHaveLength(3);
    expect(after.layers.slice(0, 2)).toEqual(before.layers.slice(0, 2));
    expect(getTexture(conflict.id)).toBe(oldConflict);
    expect(getTexture(excluded.id)).toBe(oldExcluded);
    expect(after.layers[2]?.importMetadata?.seeThrough?.psdLeafToken).toBe("new-body");
    expect(raster.read(getTexture(selected.id)!)).toEqual(Array(16).fill(7));

    useHistoryStore.getState().undo();
    expect(useEditorStore.getState().project).toEqual(before);
    expect(raster.read(getTexture(selected.id)!)).toEqual(Array(16).fill(3));
  });
});

describe("PSD replacement followed by ordinary manual PNG reimport", () => {
  it("keeps the original prepared-bounds contract independent of current texture dimensions", async () => {
    const mesh = createViviMesh({
      id: "manual",
      name: "Body",
      width: 2,
      height: 2,
      mesh: {
        vertices: [0.2, 0.1, 1.8, 0.3, 1.3, 1.9],
        uvs: [0, 0.1, 1, 0.2, 0.6, 1],
        indices: [2, 0, 1],
        divisionsX: 8,
        divisionsY: 7,
      },
      importMetadata: {
        source: "manualPng",
        manualPng: {
          sourceFileName: "Body.png",
          originalWidth: 2,
          originalHeight: 2,
          trimmedBounds: [0, 0, 2, 2],
          finalOrigin: [0, 0],
          placementMode: "preserveImageOffset",
          trimTransparentBoundsApplied: false,
          autoGenerateMeshApplied: false,
        },
      },
    });
    const project = createProject({ layers: [mesh] });
    const before = structuredClone(project);
    useEditorStore.setState({ project });
    setTexture(mesh.id, raster.create(2, 2, 1));
    mockPsdResult([
      { name: "Body", left: 200, top: 200, canvas: raster.create(4, 4, 2) },
    ]);
    const preview = analyzePsdReimport(new ArrayBuffer(8), project);
    applyPsdReimport(preview, {
      selectedLeafIndices: [0],
      confirmedResolutionLeafIndices: [0],
    });
    expect(getTexture(mesh.id)).toMatchObject({ width: 4, height: 4 });
    expect(useEditorStore.getState().project).toEqual(before);

    const originalConditionPng = raster.create(2, 2, 3);
    vi.mocked(decodePngToCanvas).mockResolvedValueOnce(originalConditionPng);
    expect(
      await reimportManualPngLayer(mesh.id, {
        buffer: new ArrayBuffer(8),
        fileName: "Body.png",
      }),
    ).toBe(true);
    const retainedTexture = getTexture(mesh.id)!;
    expect(retainedTexture).toMatchObject({ width: 2, height: 2 });
    expect(raster.read(getTexture(mesh.id)!)).toEqual(Array(16).fill(3));
    expect(useEditorStore.getState().project).toEqual(before);

    const retainedProject = useEditorStore.getState().project;
    const retainedHistory = useHistoryStore.getState().undoStack;
    vi.mocked(decodePngToCanvas).mockResolvedValueOnce(raster.create(4, 4, 4));
    expect(
      await reimportManualPngLayer(mesh.id, {
        buffer: new ArrayBuffer(8),
        fileName: "Body.png",
      }),
    ).toBe(false);
    expect(getTexture(mesh.id)).toBe(retainedTexture);
    expect(useEditorStore.getState().project).toBe(retainedProject);
    expect(useHistoryStore.getState().undoStack).toBe(retainedHistory);
    expect(useEditorStore.getState().project).toEqual(before);
  });
});
