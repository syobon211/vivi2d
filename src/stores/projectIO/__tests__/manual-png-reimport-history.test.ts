import * as agPsd from "ag-psd";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { t, useI18nStore } from "@/lib/i18n";
import { decodePngToCanvas } from "@/lib/image-loader";
import { analyzePsdReimport, applyPsdReimport } from "@/lib/psd-reimport";
import {
  clearTextures,
  deleteTexture,
  getTexture,
  getTextureStoreRevision,
  setTexture,
} from "@/lib/texture-store";
import { useEditorStore } from "@/stores/editorStore";
import { useHistoryStore } from "@/stores/historyStore";
import { useNotificationStore } from "@/stores/notificationStore";
import { useSelectionStore } from "@/stores/selectionStore";
import {
  createAnimationClip,
  createBoneNode,
  createProject,
  createViviMeshWithSkin,
} from "@/test/fixtures";
import { installRasterCanvas } from "@/test/raster-canvas";
import { reimportManualPngLayer } from "../image";

vi.mock("ag-psd", () => ({ readPsd: vi.fn() }));
vi.mock("@/lib/image-loader", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/image-loader")>()),
  decodePngToCanvas: vi.fn(),
}));

let raster: ReturnType<typeof installRasterCanvas>;
beforeEach(() => {
  raster = installRasterCanvas();
  clearTextures();
  useHistoryStore.getState().clear();
  useEditorStore.setState({
    project: null,
    projectVersion: 5,
    projectStructureVersion: 7,
  });
  useSelectionStore.getState().clearSelection();
  useNotificationStore.setState({ notifications: [] });
  useI18nStore.getState().setLocale("en");
  vi.mocked(decodePngToCanvas).mockReset();
  vi.mocked(agPsd.readPsd).mockReset();
  vi.mocked(window.electronAPI.readImageFile).mockReset();
});
afterEach(() => {
  raster.restore();
  vi.restoreAllMocks();
});

function activate() {
  const bone = createBoneNode({ id: "bone" });
  const { mesh, skin } = createViviMeshWithSkin([bone.id], {
    id: "body",
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
  const project = createProject({
    layers: [bone, mesh],
    skins: { [mesh.id]: skin },
    clips: [createAnimationClip({ duration: 41, fps: 24 })],
  });
  useEditorStore.setState({ project });
  setTexture("body", raster.create(2, 2, 1));
  return useEditorStore.getState().project!;
}
const source = { buffer: new ArrayBuffer(8), fileName: "Body.png" };
function state() {
  const editor = useEditorStore.getState();
  const history = useHistoryStore.getState();
  return {
    project: editor.project,
    version: editor.projectVersion,
    structure: editor.projectStructureVersion,
    texture: getTexture("body"),
    revision: getTextureStoreRevision(),
    undo: history.undoStack,
    redo: history.redoStack,
  };
}
function expectUnchanged(before: ReturnType<typeof state>) {
  const after = state();
  for (const key of Object.keys(before) as (keyof typeof before)[])
    expect(after[key]).toBe(before[key]);
}
function expectImage(size: number, value: number) {
  const canvas = getTexture("body")!;
  expect([canvas.width, canvas.height]).toEqual([size, size]);
  expect(raster.read(canvas)).toEqual(Array(size * size * 4).fill(value));
}
function pendingCanvas() {
  let resolve!: (canvas: HTMLCanvasElement) => void;
  const promise = new Promise<HTMLCanvasElement>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("manual PNG image-inclusive history", () => {
  it("crosses PSD and PNG resolution changes with exact pixels, stable authored state, and no redecode", async () => {
    const project = activate();
    const authored = structuredClone(project);
    vi.mocked(agPsd.readPsd).mockReturnValue({
      width: 4,
      height: 4,
      children: [{ name: "Body", canvas: raster.create(4, 4, 2) }],
    });
    applyPsdReimport(analyzePsdReimport(new ArrayBuffer(8), project), {
      selectedLeafIndices: [0],
      confirmedResolutionLeafIndices: [0],
    });
    const png = raster.create(2, 2, 3);
    vi.mocked(decodePngToCanvas).mockResolvedValueOnce(png);
    expect(await reimportManualPngLayer("body", source)).toBe(true);
    expectImage(2, 3);
    expect(useHistoryStore.getState().undoStack).toHaveLength(2);
    useHistoryStore.getState().undo();
    expectImage(4, 2);
    useHistoryStore.getState().undo();
    expectImage(2, 1);
    png
      .getContext("2d")!
      .putImageData(new ImageData(new Uint8ClampedArray(16).fill(9), 2, 2), 0, 0);
    useHistoryStore.getState().redo();
    expectImage(4, 2);
    useHistoryStore.getState().redo();
    expectImage(2, 3);
    expect(useEditorStore.getState().project).toEqual(authored);
    expect(decodePngToCanvas).toHaveBeenCalledTimes(1);
    expect(window.electronAPI.readImageFile).not.toHaveBeenCalled();
    expect(agPsd.readPsd).toHaveBeenCalledTimes(2);
    const retained = state();
    vi.mocked(decodePngToCanvas).mockResolvedValueOnce(raster.create(4, 4, 4));
    expect(await reimportManualPngLayer("body", source)).toBe(false);
    expectUnchanged(retained);
    expect(useNotificationStore.getState().notifications.at(-1)?.message).toBe(
      t("imageImportOptions.reimportMismatch"),
    );
  });

  it("preserves redo and references for no-op, but records and reverses metadata-only updates", async () => {
    const project = activate();
    useHistoryStore.getState().pushState(project);
    useHistoryStore.getState().undo();
    const before = state();
    vi.mocked(decodePngToCanvas).mockResolvedValue(raster.create(2, 2, 1));
    expect(await reimportManualPngLayer("body", source)).toBe(true);
    expectUnchanged(before);
    expect(
      await reimportManualPngLayer("body", { ...source, fileName: "Body-v2.png" }),
    ).toBe(true);
    expect(getTexture("body")).toBe(before.texture);
    expect(getTextureStoreRevision()).toBe(before.revision);
    expect(useHistoryStore.getState().undoStack).toHaveLength(1);
    expect(useHistoryStore.getState().redoStack).toHaveLength(0);
    const changed = structuredClone(useEditorStore.getState().project);
    expect(changed?.layers[1]?.importMetadata?.manualPng?.sourceFileName).toBe(
      "Body-v2.png",
    );
    useHistoryStore.getState().undo();
    expect(useEditorStore.getState().project).toEqual(before.project);
    useHistoryStore.getState().redo();
    expect(useEditorStore.getState().project).toEqual(changed);
    expect(getTexture("body")).toBe(before.texture);

    const legacy = structuredClone(project);
    delete legacy.layers[1]!.importMetadata!.manualPng!.trimTransparentBoundsApplied;
    useEditorStore.setState({ project: legacy });
    useHistoryStore.getState().clear();
    expect(await reimportManualPngLayer("body", source)).toBe(true);
    expect(useHistoryStore.getState().undoStack).toHaveLength(1);
    expect(
      useEditorStore.getState().project?.layers[1]?.importMetadata?.manualPng
        ?.trimTransparentBoundsApplied,
    ).toBe(false);
    useHistoryStore.getState().undo();
    expect(useEditorStore.getState().project).toEqual(legacy);
  });

  it("also validates in-place pixels for no-op and metadata-only prepared results", async () => {
    for (const fileName of ["Body.png", "Body-v2.png"]) {
      activate();
      const pending = pendingCanvas();
      vi.mocked(decodePngToCanvas).mockReset().mockReturnValueOnce(pending.promise);
      const result = reimportManualPngLayer("body", { ...source, fileName });
      await vi.waitFor(() => expect(decodePngToCanvas).toHaveBeenCalledOnce());
      getTexture("body")!
        .getContext("2d")!
        .putImageData(new ImageData(new Uint8ClampedArray(16).fill(8), 2, 2), 0, 0);
      const newer = state();
      pending.resolve(raster.create(2, 2, 1));
      expect(await result).toBe(false);
      expectUnchanged(newer);
      expect(useNotificationStore.getState().notifications.at(-1)?.message).toBe(
        t("imageImportOptions.reimportStale"),
      );
    }
  });

  it("keeps newer state when a decode overlaps project, history, or image changes", async () => {
    const changes = [
      () =>
        useEditorStore.setState({
          project: structuredClone(useEditorStore.getState().project),
        }),
      () =>
        useHistoryStore.getState().pushState(useEditorStore.getState().project!, "merge"),
      () => setTexture("body", raster.create(2, 2, 7)),
      () =>
        getTexture("body")!
          .getContext("2d")!
          .putImageData(new ImageData(new Uint8ClampedArray(16).fill(8), 2, 2), 0, 0),
      () => {
        const canvas = getTexture("body")!;
        canvas.width = 1;
        canvas.height = 4;
      },
    ];
    for (const change of changes) {
      useHistoryStore.getState().clear();
      const project = activate();
      useHistoryStore.getState().pushState(project, "merge");
      const pending = pendingCanvas();
      vi.mocked(decodePngToCanvas).mockReset().mockReturnValueOnce(pending.promise);
      const result = reimportManualPngLayer("body", source);
      await vi.waitFor(() => expect(decodePngToCanvas).toHaveBeenCalledOnce());
      change();
      const newer = state();
      pending.resolve(raster.create(2, 2, 3));
      expect(await result).toBe(false);
      expectUnchanged(newer);
    }
  });

  it("allows the first completed overlapping import only", async () => {
    activate();
    const first = pendingCanvas();
    const second = pendingCanvas();
    vi.mocked(decodePngToCanvas)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const firstResult = reimportManualPngLayer("body", source);
    const secondResult = reimportManualPngLayer("body", source);
    await vi.waitFor(() => expect(decodePngToCanvas).toHaveBeenCalledTimes(2));
    second.resolve(raster.create(2, 2, 3));
    expect(await secondResult).toBe(true);
    const committed = state();
    first.resolve(raster.create(2, 2, 2));
    expect(await firstResult).toBe(false);
    expectUnchanged(committed);
    expectImage(2, 3);
  });

  it("prepares pixels before mutation and restores the core when commit observers throw", async () => {
    for (const boundary of ["snapshot", "prepare", "project", "history"] as const) {
      useHistoryStore.getState().clear();
      activate();
      const before = state();
      const png = raster.create(2, 2, 3);
      let unsubscribe = () => {};
      let cleanup = () => {};
      if (boundary === "snapshot") {
        Object.defineProperty(png, "getContext", {
          value: () => {
            throw new Error("private image location");
          },
        });
      } else if (boundary === "prepare") {
        const create = document.createElement.bind(document);
        const allocation = vi.spyOn(document, "createElement").mockImplementation(((
          tag: string,
        ) => {
          const element = create(tag);
          if (tag === "canvas")
            Object.defineProperty(element, "getContext", {
              value: () => {
                throw new Error("private allocation detail");
              },
            });
          return element;
        }) as typeof document.createElement);
        cleanup = () => allocation.mockRestore();
      } else {
        let once = true;
        const throwOnce = () => {
          if (once) {
            once = false;
            throw new Error("private observer detail");
          }
        };
        unsubscribe =
          boundary === "project"
            ? useEditorStore.subscribe(throwOnce)
            : useHistoryStore.subscribe(throwOnce);
      }
      vi.mocked(decodePngToCanvas).mockResolvedValueOnce(png);
      try {
        expect(await reimportManualPngLayer("body", source)).toBe(false);
        expectUnchanged(before);
        expect(useNotificationStore.getState().notifications.at(-1)?.message).toBe(
          t("imageImportOptions.reimportFailed"),
        );
      } finally {
        unsubscribe();
        cleanup();
      }
    }
  });

  it("fails closed before IO for missing or excessive old rasters and keeps known source errors", async () => {
    activate();
    deleteTexture("body");
    let before = state();
    expect(await reimportManualPngLayer("body", source)).toBe(false);
    expectUnchanged(before);
    const oversized = document.createElement("canvas");
    oversized.width = 100_000;
    oversized.height = 100_000;
    setTexture("body", oversized);
    const readPixels = vi.fn(oversized.getContext.bind(oversized));
    Object.defineProperty(oversized, "getContext", { value: readPixels });
    before = state();
    expect(await reimportManualPngLayer("body", source)).toBe(false);
    expectUnchanged(before);
    expect(readPixels).not.toHaveBeenCalled();
    activate();
    before = state();
    expect(await reimportManualPngLayer("body")).toBe(false);
    expectUnchanged(before);
    expect(useNotificationStore.getState().notifications.at(-1)?.message).toBe(
      t("imageImportOptions.reimportSourceMissing"),
    );
    expect(decodePngToCanvas).not.toHaveBeenCalled();
    expect(window.electronAPI.readImageFile).not.toHaveBeenCalled();
  });

  it("never reads thrown error details from IO, decoder, or old canvas", async () => {
    const inspect = vi.fn(() => {
      throw new Error("secret getter");
    });
    const secret = new Error();
    Object.defineProperty(secret, "message", { get: inspect });
    for (const boundary of ["io", "decoder", "canvas"] as const) {
      activate();
      const before = state();
      vi.mocked(window.electronAPI.readImageFile)
        .mockReset()
        .mockRejectedValueOnce(secret);
      vi.mocked(decodePngToCanvas).mockReset().mockRejectedValueOnce(secret);
      if (boundary === "canvas")
        Object.defineProperty(getTexture("body")!, "getContext", {
          value: () => {
            throw secret;
          },
        });
      expect(
        await reimportManualPngLayer(
          "body",
          boundary === "io" ? { filePath: "C:/synthetic-private/source.png" } : source,
        ),
      ).toBe(false);
      expectUnchanged(before);
      expect(useNotificationStore.getState().notifications.at(-1)?.message).toBe(
        t("imageImportOptions.reimportFailed"),
      );
    }
    expect(inspect).not.toHaveBeenCalled();
  });

  it("does not undo or report failure for a committed import when UI observers fail", async () => {
    activate();
    vi.mocked(decodePngToCanvas).mockResolvedValueOnce(raster.create(2, 2, 3));
    const fail = () => {
      throw new Error("UI subscriber secret");
    };
    const selection = useSelectionStore.subscribe(fail);
    const notification = useNotificationStore.subscribe(fail);
    try {
      expect(await reimportManualPngLayer("body", source)).toBe(true);
      expectImage(2, 3);
      expect(useHistoryStore.getState().undoStack).toHaveLength(1);
    } finally {
      selection();
      notification();
    }
  });
});
