import type { ProjectData } from "@vivi2d/core/types";
import * as agPsd from "ag-psd";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "@/stores/editorStore";
import { useHistoryStore } from "@/stores/historyStore";
import { createProject, createViviMesh } from "@/test/fixtures";
import { installRasterCanvas } from "@/test/raster-canvas";
import {
  analyzePsdReimport,
  applyPsdReimport,
  disposePsdReimport,
} from "../psd-reimport";
import {
  clearTextures,
  getTexture,
  getTextureStoreRevision,
  setTexture,
} from "../texture-store";

vi.mock("ag-psd", () => ({ readPsd: vi.fn() }));

let raster: ReturnType<typeof installRasterCanvas>;
beforeEach(() => {
  raster = installRasterCanvas();
  clearTextures();
  useHistoryStore.getState().clear();
  useEditorStore.setState({
    project: null,
    projectVersion: 0,
    projectStructureVersion: 0,
  });
  vi.mocked(agPsd.readPsd).mockReset();
});
afterEach(() => {
  raster.restore();
  vi.restoreAllMocks();
});

function activate(project: ProjectData, value = 1) {
  for (const layer of project.layers)
    setTexture(layer.id, raster.create(layer.width, layer.height, value));
  useEditorStore.setState({ project });
  return useEditorStore.getState().project!;
}
function source(
  layers: { name: string; canvas?: HTMLCanvasElement; left?: number; top?: number }[],
) {
  vi.mocked(agPsd.readPsd).mockReturnValue({
    width: 128,
    height: 64,
    children: layers,
  } as ReturnType<typeof agPsd.readPsd>);
}
function preview(project: ProjectData, width = 4, height = 4, value = 2) {
  source([
    { name: "Body", canvas: raster.create(width, height, value), left: 20, top: 30 },
  ]);
  return analyzePsdReimport(new ArrayBuffer(8), project);
}
function base() {
  return createProject({
    layers: [
      createViviMesh({ id: "body", name: "Body", width: 2, height: 2, x: 5, y: 6 }),
    ],
  });
}
const confirmed = { selectedLeafIndices: [0], confirmedResolutionLeafIndices: [0] };
const sameSize = { selectedLeafIndices: [0], confirmedResolutionLeafIndices: [] };

describe("PSD reimport contract integration", () => {
  it("replaces resolution once, preserves authored state, and restores exact pixels through Undo/Redo", () => {
    const project = base();
    const mesh = project.layers[0]!;
    if (mesh.kind === "viviMesh") {
      mesh.mesh.vertices[0] = 1.25;
      mesh.mesh.vertices.push(0.3, 0.7);
    }
    const current = activate(project);
    const before = structuredClone(current);
    const view = preview(current);
    expect(view.documentWidth).toBe(128);
    expect(view.entries[0]).toMatchObject({
      oldWidth: 2,
      oldHeight: 2,
      newWidth: 4,
      newHeight: 4,
      sourceLeft: 20,
      sourceTop: 30,
      status: "needs-confirmation",
    });
    const parses = vi.mocked(agPsd.readPsd).mock.calls.length;
    expect(agPsd.readPsd).toHaveBeenLastCalledWith(
      expect.any(ArrayBuffer),
      expect.objectContaining({
        skipCompositeImageData: true,
        skipLinkedFilesData: true,
        skipThumbnail: true,
      }),
    );
    expect(applyPsdReimport(view, confirmed)).toEqual({ updatedCount: 1 });
    expect(useEditorStore.getState().project).toEqual(before);
    expect(getTexture("body")?.width).toBe(4);
    expect(raster.read(getTexture("body")!)).toEqual(new Array(64).fill(2));
    expect(useHistoryStore.getState().undoStack).toHaveLength(1);

    useHistoryStore.getState().undo();
    expect(useEditorStore.getState().project).toEqual(before);
    expect(getTexture("body")?.width).toBe(2);
    expect(raster.read(getTexture("body")!)).toEqual(new Array(16).fill(1));
    useHistoryStore.getState().redo();
    expect(getTexture("body")?.width).toBe(4);
    expect(raster.read(getTexture("body")!)).toEqual(new Array(64).fill(2));
    expect(agPsd.readPsd).toHaveBeenCalledTimes(parses);

    const second = preview(useEditorStore.getState().project!, 4, 4, 3);
    expect(second.entries[0]?.status).toBe("eligible");
    applyPsdReimport(second, sameSize);
    expect(useEditorStore.getState().project).toEqual(before);
    expect(raster.read(getTexture("body")!)).toEqual(new Array(64).fill(3));
  });

  it("holds unsafe sizes and unconfirmed selections, and updates only selected existing layers", () => {
    const project = activate(
      createProject({
        layers: [
          createViviMesh({ id: "a", name: "A", width: 2, height: 2 }),
          createViviMesh({ id: "b", name: "B", width: 2, height: 2 }),
        ],
      }),
    );
    const oldB = getTexture("b");
    source([
      { name: "A", canvas: raster.create(4, 4, 2) },
      { name: "B", canvas: raster.create(3, 2, 3) },
      { name: "New", canvas: raster.create(2, 2, 4) },
    ]);
    let view = analyzePsdReimport(new ArrayBuffer(8), project);
    expect(view.entries.map((entry) => entry.status)).toEqual([
      "needs-confirmation",
      "held",
      "unmatched",
    ]);
    expect(() => applyPsdReimport(view, sameSize)).toThrow("Failed to reimport PSD.");
    expect(useHistoryStore.getState().undoStack).toHaveLength(0);
    view = analyzePsdReimport(new ArrayBuffer(8), project);
    applyPsdReimport(view, confirmed);
    expect(getTexture("a")?.width).toBe(4);
    expect(getTexture("b")).toBe(oldB);
    expect(useEditorStore.getState().project?.layers).toEqual(project.layers);
    expect(useEditorStore.getState().project?.layers).toHaveLength(2);
  });

  it("does not create empty history or change live references for identical pixels", () => {
    const project = activate(base());
    const canvas = getTexture("body");
    const revision = getTextureStoreRevision();
    const view = preview(project, 2, 2, 1);
    expect(applyPsdReimport(view, sameSize)).toEqual({ updatedCount: 0 });
    expect(useEditorStore.getState().project).toBe(project);
    expect(getTexture("body")).toBe(canvas);
    expect(getTextureStoreRevision()).toBe(revision);
    expect(useHistoryStore.getState().undoStack).toHaveLength(0);
    expect(() => applyPsdReimport(view, sameSize)).toThrow();
  });

  it("rejects stale project, merged history, and in-place pixel or dimension changes", () => {
    const mutations = [
      () =>
        useEditorStore.setState({
          project: structuredClone(useEditorStore.getState().project),
        }),
      () =>
        useHistoryStore.getState().pushState(useEditorStore.getState().project!, "merge"),
      () =>
        getTexture("body")!
          .getContext("2d")!
          .putImageData(new ImageData(new Uint8ClampedArray(16).fill(9), 2, 2), 0, 0),
      () => {
        const canvas = getTexture("body")!;
        canvas.width = 1;
        canvas.height = 4;
      },
    ];
    for (const mutate of mutations) {
      clearTextures();
      useHistoryStore.getState().clear();
      const project = activate(base(), 0);
      useHistoryStore.getState().pushState(project, "merge");
      const view = preview(project);
      mutate();
      const current = useEditorStore.getState().project;
      const canvas = getTexture("body");
      const history = useHistoryStore.getState().undoStack;
      expect(() => applyPsdReimport(view, confirmed)).toThrow("Failed to reimport PSD.");
      expect(useEditorStore.getState().project).toBe(current);
      expect(getTexture("body")).toBe(canvas);
      expect(useHistoryStore.getState().undoStack).toBe(history);
    }
  });

  it("prepares every selected image before mutation and rolls back an ordinary commit failure", () => {
    const project = activate(base());
    const old = getTexture("body");
    const revision = getTextureStoreRevision();
    const view = preview(project);
    const state = useEditorStore.getState();
    let failOnce = true;
    const unsubscribe = useEditorStore.subscribe((next) => {
      if (next.project !== project && failOnce) {
        failOnce = false;
        throw new Error("synthetic sensitive subscriber failure");
      }
    });
    try {
      expect(() => applyPsdReimport(view, confirmed)).toThrow("Failed to reimport PSD.");
      expect(getTexture("body")).toBe(old);
      expect(getTextureStoreRevision()).toBe(revision);
      expect(useEditorStore.getState().project).toBe(project);
      expect(useEditorStore.getState().projectStructureVersion).toBe(
        state.projectStructureVersion,
      );
      expect(useHistoryStore.getState().undoStack).toHaveLength(0);
    } finally {
      unsubscribe();
    }
  });

  it("aborts the whole batch if a later prepared image cannot be snapshotted", () => {
    const project = activate(
      createProject({
        layers: [
          createViviMesh({ id: "a", name: "A", width: 2, height: 2 }),
          createViviMesh({ id: "b", name: "B", width: 2, height: 2 }),
        ],
      }),
    );
    const first = getTexture("a");
    const second = getTexture("b");
    const incomingB = raster.create(2, 2, 3);
    source([
      { name: "A", canvas: raster.create(2, 2, 2) },
      { name: "B", canvas: incomingB },
    ]);
    const view = analyzePsdReimport(new ArrayBuffer(8), project);
    vi.spyOn(incomingB, "getContext").mockImplementation(() => {
      throw new Error("private decoder detail");
    });
    expect(() =>
      applyPsdReimport(view, {
        selectedLeafIndices: [0, 1],
        confirmedResolutionLeafIndices: [],
      }),
    ).toThrow("Failed to reimport PSD.");
    expect(getTexture("a")).toBe(first);
    expect(getTexture("b")).toBe(second);
    expect(useEditorStore.getState().project).toBe(project);
    expect(useHistoryStore.getState().undoStack).toHaveLength(0);
  });

  it("retains fixed errors in both decode passes and rejects oversized metadata before decoding pixels", () => {
    const project = activate(base());
    const inspect = vi.fn(() => {
      throw new Error("must not inspect");
    });
    const secret = new Error();
    Object.defineProperty(secret, "message", { get: inspect });
    for (const pass of [0, 1]) {
      vi.mocked(agPsd.readPsd).mockReset();
      if (pass === 1)
        vi.mocked(agPsd.readPsd).mockReturnValueOnce({
          width: 2,
          height: 2,
          children: [],
        });
      vi.mocked(agPsd.readPsd).mockImplementationOnce(() => {
        throw secret;
      });
      expect(() => analyzePsdReimport(new ArrayBuffer(8), project)).toThrow(
        "Failed to load PSD file.",
      );
      expect(agPsd.readPsd).toHaveBeenCalledTimes(pass + 1);
    }
    expect(inspect).not.toHaveBeenCalled();
    vi.mocked(agPsd.readPsd)
      .mockReset()
      .mockReturnValueOnce({ width: 100_000, height: 100_000, children: [] });
    expect(() => analyzePsdReimport(new ArrayBuffer(8), project)).toThrow(
      "Failed to load PSD file.",
    );
    expect(agPsd.readPsd).toHaveBeenCalledTimes(1);
    expect(useHistoryStore.getState().undoStack).toHaveLength(0);
  });

  it("disposes cancelled previews without live changes and never exposes image data", () => {
    const project = activate(base());
    const view = preview(project);
    expect(Object.keys(view).sort()).toEqual([
      "documentHeight",
      "documentWidth",
      "entries",
      "removed",
    ]);
    expect(JSON.stringify(view)).not.toMatch(/rgba|canvas|nextToken|matchedBy/);
    disposePsdReimport(view);
    expect(() => applyPsdReimport(view, confirmed)).toThrow();
    expect(useEditorStore.getState().project).toBe(project);
    expect(useHistoryStore.getState().undoStack).toHaveLength(0);
  });
});
