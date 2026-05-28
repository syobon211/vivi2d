import { beforeEach, describe, expect, it, vi } from "vitest";
import { t, useI18nStore } from "@/lib/i18n";
import {
  deserializeProject,
  parseViviFile,
  serializeProject,
} from "@/lib/project-serializer";
import { useEditorStore } from "@/stores/editorStore";
import { useHistoryStore } from "@/stores/historyStore";
import { useNotificationStore } from "@/stores/notificationStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { useViewportStore } from "@/stores/viewportStore";
import { createProject } from "@/test/fixtures";
import {
  TEST_ASSET_BACK_PNG_PATH,
  TEST_ASSET_FACE_PNG_PATH,
  TEST_ASSET_FRONT_PNG_PATH,
  TEST_ASSET_TRIMMED_PNG_PATH,
  TEST_BASE_VIVI_PATH,
  TEST_EXISTING_VIVI_PATH,
  TEST_MANUAL_PNG_VIVI_PATH,
  TEST_ROLLBACK_VIVI_PATH,
  TEST_TMP_HERO_PNG_PATH,
  TEST_TMP_PARTS_A_PNG_PATH,
  TEST_TMP_PARTS_ARM_PNG_PATH,
  TEST_TMP_PARTS_B_PNG_PATH,
} from "@/test/path-fixtures";
import { resetAllStores } from "@/test/store-reset";

vi.mock("@/lib/image-loader", () => ({
  decodePngToCanvas: vi.fn(),
  trimTransparentBounds: vi.fn(),
}));

vi.mock("@/lib/auto-mesh", () => ({
  generateAutoMesh: vi.fn(),
}));

vi.mock("@/lib/texture-store", () => ({
  clearTextures: vi.fn(),
  getAllTextures: vi.fn().mockReturnValue(new Map()),
  setTexture: vi.fn(),
}));

const { decodePngToCanvas, trimTransparentBounds } = await import("@/lib/image-loader");
const { generateAutoMesh } = await import("@/lib/auto-mesh");
const { clearTextures, getAllTextures, setTexture } = await import("@/lib/texture-store");
const {
  EMPTY_PNG_FOLDER_MESSAGE,
  importImageAsLayer,
  importImageAsLayerFromBufferAsync,
  importImagesAsLayers,
  importImagesAsLayersFromBuffersAsync,
  importPngFolderAsLayers,
  loadImage,
  loadImageFromBufferAsync,
  reimportManualPngLayer,
} = await import("../image");

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function mountCanvasSurface(width = 1000, height = 800): void {
  const surface = document.createElement("div");
  surface.className = "canvas-surface";
  surface.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: width,
      bottom: height,
      width,
      height,
      toJSON: () => ({}),
    }) as DOMRect;
  document.body.appendChild(surface);
}

async function waitForAnimationFrame(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

describe("projectIO/image", () => {
  beforeEach(() => {
    resetAllStores();
    vi.clearAllMocks();
    useI18nStore.getState().setLocale("en");
    document.body.innerHTML = "";
    vi.mocked(decodePngToCanvas).mockReset();
    vi.mocked(trimTransparentBounds).mockReset();
    vi.mocked(generateAutoMesh).mockReset();
    vi.mocked(clearTextures).mockReset();
    vi.mocked(getAllTextures).mockReset();
    vi.mocked(setTexture).mockReset();
    vi.mocked(window.electronAPI.openPngFile).mockReset();
    vi.mocked(window.electronAPI.openPngFiles).mockReset();
    vi.mocked(window.electronAPI.openPngFolder).mockReset();
    vi.mocked(window.electronAPI.readImageFile).mockReset();
    vi.mocked(getAllTextures).mockReturnValue(new Map());
    vi.mocked(trimTransparentBounds).mockImplementation((canvas) => ({
      canvas,
      offsetX: 0,
      offsetY: 0,
      originalWidth: canvas.width,
      originalHeight: canvas.height,
      trimmed: false,
    }));
  });

  it("creates a single-viviMesh project from a PNG buffer", async () => {
    const canvas = createCanvas(640, 480);
    vi.mocked(decodePngToCanvas).mockResolvedValue(canvas);

    const result = await loadImageFromBufferAsync(new ArrayBuffer(8), "Character.PNG");

    expect(result).toBe(true);
    const project = useEditorStore.getState().project;
    expect(project?.name).toBe("Character");
    expect(project?.width).toBe(640);
    expect(project?.height).toBe(480);
    expect(project?.layers).toHaveLength(1);
    expect(project?.layers[0]).toMatchObject({
      kind: "viviMesh",
      name: "Character",
      width: 640,
      height: 480,
      x: 0,
      y: 0,
      blendMode: "normal",
      opacity: 1,
      visible: true,
      importMetadata: {
        source: "manualPng",
        manualPng: {
          sourceFileName: "Character.PNG",
          originalWidth: 640,
          originalHeight: 480,
          trimmedBounds: [0, 0, 640, 480],
          finalOrigin: [0, 0],
          placementMode: "preserveImageOffset",
          trimTransparentBoundsApplied: false,
          autoGenerateMeshApplied: false,
        },
      },
    });
    expect(setTexture).toHaveBeenCalledWith(project?.layers[0]?.id, canvas);
    expect(useEditorStore.getState().currentFilePath).toBeNull();
  });

  it("reads a PNG through the dedicated picker path", async () => {
    const canvas = createCanvas(320, 200);
    vi.mocked(window.electronAPI.openPngFile).mockResolvedValue(TEST_TMP_HERO_PNG_PATH);
    vi.mocked(window.electronAPI.readImageFile).mockResolvedValue({
      buffer: new ArrayBuffer(16),
      filename: "hero.png",
    });
    vi.mocked(decodePngToCanvas).mockResolvedValue(canvas);

    const result = await loadImage();

    expect(result).toBe(true);
    expect(window.electronAPI.openPngFile).toHaveBeenCalledOnce();
    expect(window.electronAPI.readImageFile).toHaveBeenCalledWith({
      imagePath: TEST_TMP_HERO_PNG_PATH,
    });
    expect(useEditorStore.getState().project?.name).toBe("hero");
    expect(useEditorStore.getState().project?.layers[0]?.importMetadata).toMatchObject({
      source: "manualPng",
      manualPng: {
        sourcePath: TEST_TMP_HERO_PNG_PATH,
      },
    });
  });

  it("keeps the current project when PNG decode fails", async () => {
    const previousProject = createProject({ name: "Existing Project" });
    useEditorStore.setState((state) => {
      state.project = previousProject;
      state.projectVersion = 1;
      state.currentFilePath = TEST_EXISTING_VIVI_PATH;
    });
    vi.mocked(decodePngToCanvas).mockRejectedValue(new Error("Invalid PNG"));

    const result = await loadImageFromBufferAsync(new ArrayBuffer(8), "broken.png");

    expect(result).toBe(false);
    expect(clearTextures).not.toHaveBeenCalled();
    expect(useEditorStore.getState().project?.name).toBe("Existing Project");
    expect(useNotificationStore.getState().notifications[0]?.message).toBe("Invalid PNG");
  });

  it("clears old textures before registering the imported image", async () => {
    const oldCanvas = createCanvas(32, 32);
    vi.mocked(getAllTextures).mockReturnValue(new Map([["old-layer", oldCanvas]]));
    vi.mocked(decodePngToCanvas).mockResolvedValue(createCanvas(128, 128));

    const result = await loadImageFromBufferAsync(new ArrayBuffer(8), "fresh.png");

    expect(result).toBe(true);
    expect(clearTextures).toHaveBeenCalledTimes(1);
    expect(vi.mocked(clearTextures).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(setTexture).mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
  });

  it("restores the previous project if texture registration fails after cleanup", async () => {
    const previousProject = createProject({ name: "Rollback Target" });
    const previousCanvas = createCanvas(16, 16);
    useEditorStore.setState((state) => {
      state.project = previousProject;
      state.projectVersion = 2;
      state.currentFilePath = TEST_ROLLBACK_VIVI_PATH;
    });
    vi.mocked(getAllTextures).mockReturnValue(new Map([["old-layer", previousCanvas]]));
    vi.mocked(decodePngToCanvas).mockResolvedValue(createCanvas(256, 256));
    vi.mocked(setTexture).mockImplementationOnce(() => {
      throw new Error("Texture registration failed");
    });

    const result = await loadImageFromBufferAsync(new ArrayBuffer(8), "fresh.png");

    expect(result).toBe(false);
    expect(useEditorStore.getState().project?.name).toBe("Rollback Target");
    expect(clearTextures).toHaveBeenCalledTimes(2);
    expect(useNotificationStore.getState().notifications[0]?.message).toBe(
      "Texture registration failed",
    );
  });

  it("imports a PNG as a new top-level layer into the current project", async () => {
    const project = createProject({ name: "Base Project", width: 1920, height: 1080 });
    useEditorStore.setState((state) => {
      state.project = project;
      state.projectVersion = 5;
      state.projectStructureVersion = 7;
      state.currentFilePath = TEST_BASE_VIVI_PATH;
    });
    vi.mocked(decodePngToCanvas).mockResolvedValue(createCanvas(128, 256));

    const result = await importImageAsLayerFromBufferAsync(
      new ArrayBuffer(8),
      "hair.png",
    );

    expect(result).toBe(true);
    const nextProject = useEditorStore.getState().project;
    expect(nextProject?.name).toBe("Base Project");
    expect(nextProject?.width).toBe(1920);
    expect(nextProject?.height).toBe(1080);
    expect(nextProject?.layers.at(-1)).toMatchObject({
      kind: "viviMesh",
      name: "hair",
      width: 128,
      height: 256,
      x: 0,
      y: 0,
      blendMode: "normal",
    });
    expect(nextProject?.layers).toHaveLength(project.layers.length + 1);
    expect(nextProject?.layers.at(-1)?.drawOrder).toBeGreaterThanOrEqual(
      project.layers.reduce((max, layer) => Math.max(max, layer.drawOrder ?? 0), 0),
    );
    expect(useEditorStore.getState().currentFilePath).toBe(TEST_BASE_VIVI_PATH);
    expect(useEditorStore.getState().projectStructureVersion).toBe(8);
    expect(useSelectionStore.getState().selectedLayerId).toBe(
      nextProject?.layers.at(-1)?.id ?? null,
    );
  });

  it("auto-centers very large imports, warns about transparent padding, and focuses the viewport", async () => {
    const project = createProject({ width: 64, height: 64 });
    useEditorStore.setState((state) => {
      state.project = project;
    });
    mountCanvasSurface();
    vi.mocked(decodePngToCanvas).mockResolvedValue(createCanvas(4063, 7192));
    vi.mocked(trimTransparentBounds).mockReturnValue({
      canvas: createCanvas(1800, 3200),
      offsetX: 700,
      offsetY: 900,
      originalWidth: 4063,
      originalHeight: 7192,
      trimmed: true,
    });

    const result = await importImageAsLayerFromBufferAsync(
      new ArrayBuffer(8),
      "large-character.png",
      {
        centerOnCanvas: false,
        trimTransparentBounds: false,
      },
    );

    expect(result).toBe(true);
    await waitForAnimationFrame();
    expect(useEditorStore.getState().project?.layers.at(-1)).toMatchObject({
      x: Math.round((64 - 4063) / 2),
      y: Math.round((64 - 7192) / 2),
      importMetadata: {
        source: "manualPng",
        manualPng: {
          placementMode: "centerOnCanvas",
        },
      },
    });
    expect(
      useNotificationStore.getState().notifications.map((entry) => entry.message),
    ).toEqual(
      expect.arrayContaining([
        t("imageImportOptions.largeImageAutoCentered"),
        t("imageImportOptions.transparentPaddingWarning"),
        t("imageImportOptions.focusedViewportOnImport"),
      ]),
    );
    expect(useViewportStore.getState().zoom).not.toBe(1);
    expect(useViewportStore.getState().panY).not.toBe(0);
  });

  it("uses the dedicated picker path when importing a PNG as a layer", async () => {
    useEditorStore.setState((state) => {
      state.project = createProject();
    });
    vi.mocked(window.electronAPI.openPngFile).mockResolvedValue(
      TEST_TMP_PARTS_ARM_PNG_PATH,
    );
    vi.mocked(window.electronAPI.readImageFile).mockResolvedValue({
      buffer: new ArrayBuffer(32),
      filename: "arm.png",
    });
    vi.mocked(decodePngToCanvas).mockResolvedValue(createCanvas(64, 64));

    const result = await importImageAsLayer();

    expect(result).toBe(true);
    expect(window.electronAPI.openPngFile).toHaveBeenCalledOnce();
    expect(window.electronAPI.readImageFile).toHaveBeenCalledWith({
      imagePath: TEST_TMP_PARTS_ARM_PNG_PATH,
    });
  });

  it("requires an open project before importing an image layer", async () => {
    const result = await importImageAsLayerFromBufferAsync(new ArrayBuffer(8), "arm.png");

    expect(result).toBe(false);
    expect(useNotificationStore.getState().notifications[0]?.type).toBe("warning");
  });

  it("makes imported layer names unique with numeric suffixes", async () => {
    const project = createProject();
    useEditorStore.setState((state) => {
      state.project = project;
    });
    vi.mocked(decodePngToCanvas).mockResolvedValue(createCanvas(40, 40));

    const first = await importImageAsLayerFromBufferAsync(new ArrayBuffer(8), "part.png");
    const second = await importImageAsLayerFromBufferAsync(
      new ArrayBuffer(8),
      "part.png",
    );

    expect(first).toBe(true);
    expect(second).toBe(true);
    const names =
      useEditorStore.getState().project?.layers.map((layer) => layer.name) ?? [];
    expect(names).toContain("part");
    expect(names).toContain("part (2)");
  });

  it("imports multiple PNG layers in deterministic order", async () => {
    const project = createProject({ name: "Base Project" });
    const originalLayerCount = project.layers.length;
    useEditorStore.setState((state) => {
      state.project = project;
      state.projectStructureVersion = 11;
    });
    vi.mocked(decodePngToCanvas)
      .mockResolvedValueOnce(createCanvas(32, 32))
      .mockResolvedValueOnce(createCanvas(64, 48))
      .mockResolvedValueOnce(createCanvas(96, 24));

    const result = await importImagesAsLayersFromBuffersAsync([
      { buffer: new ArrayBuffer(8), fileName: "front.png" },
      { buffer: new ArrayBuffer(8), fileName: "front.png" },
      { buffer: new ArrayBuffer(8), fileName: "back.png" },
    ]);

    expect(result).toBe(true);
    const importedNames =
      useEditorStore
        .getState()
        .project?.layers.slice(originalLayerCount)
        .map((layer) => layer.name) ?? [];
    expect(importedNames).toEqual(["front", "front (2)", "back"]);
    expect(useEditorStore.getState().projectStructureVersion).toBe(12);
    expect(useSelectionStore.getState().selectedLayerId).toBe(
      useEditorStore.getState().project?.layers.at(-1)?.id ?? null,
    );
  });

  it("focuses the viewport on imported batches that exceed the current canvas", async () => {
    const project = createProject({ width: 64, height: 64 });
    useEditorStore.setState((state) => {
      state.project = project;
    });
    mountCanvasSurface();
    vi.mocked(decodePngToCanvas)
      .mockResolvedValueOnce(createCanvas(4063, 7192))
      .mockResolvedValueOnce(createCanvas(3000, 5000));
    vi.mocked(trimTransparentBounds)
      .mockReturnValueOnce({
        canvas: createCanvas(1800, 3200),
        offsetX: 700,
        offsetY: 900,
        originalWidth: 4063,
        originalHeight: 7192,
        trimmed: true,
      })
      .mockReturnValueOnce({
        canvas: createCanvas(1100, 2400),
        offsetX: 500,
        offsetY: 600,
        originalWidth: 3000,
        originalHeight: 5000,
        trimmed: true,
      });

    const result = await importImagesAsLayersFromBuffersAsync([
      { buffer: new ArrayBuffer(8), fileName: "large-character-a.png" },
      { buffer: new ArrayBuffer(8), fileName: "large-character-b.png" },
    ]);

    expect(result).toBe(true);
    await waitForAnimationFrame();
    expect(
      useNotificationStore.getState().notifications.map((entry) => entry.message),
    ).toEqual(
      expect.arrayContaining([
        t("imageImportOptions.largeImageAutoCentered"),
        t("imageImportOptions.transparentPaddingWarning"),
        t("imageImportOptions.focusedViewportOnImportMultiple"),
      ]),
    );
    expect(useViewportStore.getState().zoom).not.toBe(1);
    expect(useViewportStore.getState().panX).not.toBe(0);
    expect(useViewportStore.getState().panY).not.toBe(0);
  });

  it("centers a single imported image layer when requested", async () => {
    const project = createProject({ width: 1000, height: 800 });
    useEditorStore.setState((state) => {
      state.project = project;
    });
    vi.mocked(decodePngToCanvas).mockResolvedValue(createCanvas(200, 100));

    const result = await importImageAsLayerFromBufferAsync(
      new ArrayBuffer(8),
      "centered.png",
      {
        centerOnCanvas: true,
      },
    );

    expect(result).toBe(true);
    expect(useEditorStore.getState().project?.layers.at(-1)).toMatchObject({
      x: 400,
      y: 350,
    });
  });

  it("uses trim offsets when importing a trimmed image layer", async () => {
    const project = createProject({ width: 1000, height: 800 });
    useEditorStore.setState((state) => {
      state.project = project;
    });
    const decodedCanvas = createCanvas(300, 240);
    const trimmedCanvas = createCanvas(120, 80);
    vi.mocked(decodePngToCanvas).mockResolvedValue(decodedCanvas);
    vi.mocked(trimTransparentBounds).mockReturnValue({
      canvas: trimmedCanvas,
      offsetX: 24,
      offsetY: 36,
      originalWidth: 300,
      originalHeight: 240,
      trimmed: true,
    });

    const result = await importImageAsLayerFromBufferAsync(
      new ArrayBuffer(8),
      "trimmed.png",
      {
        trimTransparentBounds: true,
      },
    );

    expect(result).toBe(true);
    expect(trimTransparentBounds).toHaveBeenCalledWith(decodedCanvas);
    expect(useEditorStore.getState().project?.layers.at(-1)).toMatchObject({
      width: 120,
      height: 80,
      x: 24,
      y: 36,
      importMetadata: {
        source: "manualPng",
        manualPng: {
          trimmedBounds: [24, 36, 120, 80],
          finalOrigin: [24, 36],
          trimTransparentBoundsApplied: true,
        },
      },
    });
  });

  it("wraps multi-image imports in a group when requested", async () => {
    const project = createProject({ name: "Base Project" });
    useEditorStore.setState((state) => {
      state.project = project;
    });
    vi.mocked(decodePngToCanvas)
      .mockResolvedValueOnce(createCanvas(32, 32))
      .mockResolvedValueOnce(createCanvas(48, 24));

    const result = await importImagesAsLayersFromBuffersAsync(
      [
        { buffer: new ArrayBuffer(8), fileName: "front.png" },
        { buffer: new ArrayBuffer(8), fileName: "back.png" },
      ],
      { createGroupForImportedLayers: true },
    );

    expect(result).toBe(true);
    const group = useEditorStore.getState().project?.layers.at(-1);
    expect(group).toMatchObject({
      kind: "group",
      name: "Imported Images",
    });
    expect(group?.children.map((layer) => layer.name)).toEqual(["front", "back"]);
  });

  it("auto-generates meshes when requested and falls back to grid mesh", async () => {
    const project = createProject();
    useEditorStore.setState((state) => {
      state.project = project;
    });
    const canvas = createCanvas(80, 60);
    vi.mocked(decodePngToCanvas).mockResolvedValue(canvas);
    vi.mocked(generateAutoMesh).mockReturnValueOnce({
      vertices: [0, 0, 80, 0, 0, 60],
      uvs: [0, 0, 1, 0, 0, 1],
      indices: [0, 1, 2],
      divisionsX: 0,
      divisionsY: 0,
    });

    const result = await importImageAsLayerFromBufferAsync(
      new ArrayBuffer(8),
      "mesh.png",
      {
        autoGenerateMesh: true,
      },
    );

    expect(result).toBe(true);
    expect(generateAutoMesh).toHaveBeenCalledWith(canvas, 80, 60, "standard");
    expect(useEditorStore.getState().project?.layers.at(-1)).toMatchObject({
      mesh: expect.objectContaining({
        indices: [0, 1, 2],
        divisionsX: 0,
        divisionsY: 0,
      }),
    });
  });

  it("uses the dedicated multi-picker path for batch layer import", async () => {
    useEditorStore.setState((state) => {
      state.project = createProject();
    });
    vi.mocked(window.electronAPI.openPngFiles).mockResolvedValue([
      TEST_TMP_PARTS_A_PNG_PATH,
      TEST_TMP_PARTS_B_PNG_PATH,
    ]);
    vi.mocked(window.electronAPI.readImageFile)
      .mockResolvedValueOnce({
        buffer: new ArrayBuffer(32),
        filename: "a.png",
      })
      .mockResolvedValueOnce({
        buffer: new ArrayBuffer(64),
        filename: "b.png",
      });
    vi.mocked(decodePngToCanvas)
      .mockResolvedValueOnce(createCanvas(64, 64))
      .mockResolvedValueOnce(createCanvas(128, 128));

    const result = await importImagesAsLayers();

    expect(result).toBe(true);
    expect(window.electronAPI.openPngFiles).toHaveBeenCalledOnce();
    expect(window.electronAPI.readImageFile).toHaveBeenNthCalledWith(1, {
      imagePath: TEST_TMP_PARTS_A_PNG_PATH,
    });
    expect(window.electronAPI.readImageFile).toHaveBeenNthCalledWith(2, {
      imagePath: TEST_TMP_PARTS_B_PNG_PATH,
    });
    const importedLayers = useEditorStore.getState().project?.layers.slice(-2) ?? [];
    expect(importedLayers[0]?.importMetadata).toMatchObject({
      source: "manualPng",
      manualPng: {
        sourcePath: TEST_TMP_PARTS_A_PNG_PATH,
      },
    });
    expect(importedLayers[1]?.importMetadata).toMatchObject({
      source: "manualPng",
      manualPng: {
        sourcePath: TEST_TMP_PARTS_B_PNG_PATH,
      },
    });
  });

  it("uses the dedicated folder picker path for batch layer import", async () => {
    useEditorStore.setState((state) => {
      state.project = createProject();
    });
    vi.mocked(window.electronAPI.openPngFolder).mockResolvedValue([
      TEST_TMP_PARTS_A_PNG_PATH,
      TEST_TMP_PARTS_B_PNG_PATH,
    ]);
    vi.mocked(window.electronAPI.readImageFile)
      .mockResolvedValueOnce({
        buffer: new ArrayBuffer(32),
        filename: "a.png",
      })
      .mockResolvedValueOnce({
        buffer: new ArrayBuffer(64),
        filename: "b.png",
      });
    vi.mocked(decodePngToCanvas)
      .mockResolvedValueOnce(createCanvas(64, 64))
      .mockResolvedValueOnce(createCanvas(128, 128));

    const result = await importPngFolderAsLayers();

    expect(result).toBe(true);
    expect(window.electronAPI.openPngFolder).toHaveBeenCalledOnce();
    expect(window.electronAPI.readImageFile).toHaveBeenNthCalledWith(1, {
      imagePath: TEST_TMP_PARTS_A_PNG_PATH,
    });
    expect(window.electronAPI.readImageFile).toHaveBeenNthCalledWith(2, {
      imagePath: TEST_TMP_PARTS_B_PNG_PATH,
    });
  });

  it("rejects empty PNG folders with a warning", async () => {
    useEditorStore.setState((state) => {
      state.project = createProject();
    });
    vi.mocked(window.electronAPI.openPngFolder).mockResolvedValue([]);

    const result = await importPngFolderAsLayers();

    expect(result).toBe(false);
    expect(useNotificationStore.getState().notifications.at(-1)?.message).toBe(
      EMPTY_PNG_FOLDER_MESSAGE,
    );
    expect(window.electronAPI.readImageFile).not.toHaveBeenCalled();
  });

  it("rolls back a batch import if texture registration fails mid-import", async () => {
    const project = createProject({ name: "Rollback Project" });
    const previousCanvas = createCanvas(16, 16);
    useEditorStore.setState((state) => {
      state.project = project;
    });
    vi.mocked(getAllTextures).mockReturnValue(new Map([["old-layer", previousCanvas]]));
    vi.mocked(decodePngToCanvas)
      .mockResolvedValueOnce(createCanvas(64, 64))
      .mockResolvedValueOnce(createCanvas(32, 32));
    vi.mocked(setTexture)
      .mockImplementationOnce(() => {})
      .mockImplementationOnce(() => {
        throw new Error("Texture registration failed");
      });

    const result = await importImagesAsLayersFromBuffersAsync([
      { buffer: new ArrayBuffer(8), fileName: "a.png" },
      { buffer: new ArrayBuffer(8), fileName: "b.png" },
    ]);

    expect(result).toBe(false);
    expect(useEditorStore.getState().project?.layers).toHaveLength(project.layers.length);
    expect(clearTextures).toHaveBeenCalledTimes(1);
    expect(useNotificationStore.getState().notifications.at(-1)?.message).toBe(
      "Texture registration failed",
    );
  });

  it("reimports a manual PNG layer using its stored source path", async () => {
    const project = createProject({ width: 640, height: 480 });
    useEditorStore.setState((state) => {
      state.project = project;
      state.projectStructureVersion = 3;
    });
    vi.mocked(decodePngToCanvas).mockResolvedValueOnce(createCanvas(128, 96));

    await importImageAsLayerFromBufferAsync(
      new ArrayBuffer(8),
      "face.png",
      undefined,
      TEST_ASSET_FACE_PNG_PATH,
    );

    const importedLayer = useEditorStore.getState().project?.layers.at(-1);
    expect(importedLayer?.kind).toBe("viviMesh");
    const previousMesh = importedLayer?.kind === "viviMesh" ? importedLayer.mesh : null;

    vi.clearAllMocks();
    vi.mocked(getAllTextures).mockReturnValue(new Map());
    vi.mocked(window.electronAPI.readImageFile).mockResolvedValue({
      buffer: new ArrayBuffer(16),
      filename: "face.png",
    });
    const replacementCanvas = createCanvas(128, 96);
    vi.mocked(decodePngToCanvas).mockResolvedValue(replacementCanvas);

    const result = await reimportManualPngLayer(importedLayer!.id);

    expect(result).toBe(true);
    expect(window.electronAPI.readImageFile).toHaveBeenCalledWith({
      imagePath: TEST_ASSET_FACE_PNG_PATH,
    });
    expect(setTexture).toHaveBeenCalledWith(importedLayer!.id, replacementCanvas);
    const reimportedLayer = useEditorStore.getState().project?.layers.at(-1);
    expect(reimportedLayer).toMatchObject({
      id: importedLayer!.id,
      width: 128,
      height: 96,
      x: 0,
      y: 0,
      importMetadata: {
        source: "manualPng",
        manualPng: {
          sourcePath: TEST_ASSET_FACE_PNG_PATH,
          trimTransparentBoundsApplied: false,
        },
      },
    });
    expect(reimportedLayer?.kind === "viviMesh" ? reimportedLayer.mesh : null).toEqual(
      previousMesh,
    );
    expect(useEditorStore.getState().projectStructureVersion).toBe(5);
    expect(useNotificationStore.getState().notifications.at(-1)?.message).toBe(
      `Reimported ${importedLayer!.name}.`,
    );
  });

  it("reimports a grouped manual PNG child layer without breaking the group structure", async () => {
    const project = createProject({ width: 640, height: 480 });
    useEditorStore.setState((state) => {
      state.project = project;
      state.projectStructureVersion = 9;
    });
    vi.mocked(decodePngToCanvas)
      .mockResolvedValueOnce(createCanvas(32, 32))
      .mockResolvedValueOnce(createCanvas(48, 24));

    await importImagesAsLayersFromBuffersAsync(
      [
        {
          buffer: new ArrayBuffer(8),
          fileName: "front.png",
          sourcePath: TEST_ASSET_FRONT_PNG_PATH,
        },
        {
          buffer: new ArrayBuffer(8),
          fileName: "back.png",
          sourcePath: TEST_ASSET_BACK_PNG_PATH,
        },
      ],
      { createGroupForImportedLayers: true },
    );

    const group = useEditorStore.getState().project?.layers.at(-1);
    expect(group?.kind).toBe("group");
    const childLayer = group?.children[0];
    expect(childLayer?.kind).toBe("viviMesh");

    vi.clearAllMocks();
    vi.mocked(getAllTextures).mockReturnValue(new Map());
    vi.mocked(window.electronAPI.readImageFile).mockResolvedValue({
      buffer: new ArrayBuffer(16),
      filename: "front.png",
    });
    vi.mocked(decodePngToCanvas).mockResolvedValue(createCanvas(32, 32));

    const result = await reimportManualPngLayer(childLayer!.id);

    expect(result).toBe(true);
    const updatedGroup = useEditorStore.getState().project?.layers.at(-1);
    expect(updatedGroup?.kind).toBe("group");
    expect(updatedGroup?.children).toHaveLength(2);
    expect(updatedGroup?.children[0]?.id).toBe(childLayer!.id);
    expect(useEditorStore.getState().projectStructureVersion).toBe(11);
  });

  it("preserves manual PNG edits across save/reopen and supports reimport undo/redo", async () => {
    const project = createProject({ width: 640, height: 480 });
    useEditorStore.setState((state) => {
      state.project = project;
      state.projectStructureVersion = 12;
      state.currentFilePath = TEST_MANUAL_PNG_VIVI_PATH;
    });
    vi.mocked(decodePngToCanvas).mockResolvedValueOnce(createCanvas(128, 96));

    await importImageAsLayerFromBufferAsync(
      new ArrayBuffer(8),
      "face.png",
      undefined,
      TEST_ASSET_FACE_PNG_PATH,
    );

    const importedLayer = useEditorStore.getState().project?.layers.at(-1);
    expect(importedLayer?.kind).toBe("viviMesh");
    const originalMesh =
      importedLayer?.kind === "viviMesh" ? structuredClone(importedLayer.mesh) : null;
    expect(originalMesh).not.toBeNull();

    const editedVertices = [...originalMesh!.vertices];
    editedVertices[0] = (editedVertices[0] ?? 0) + 12;
    useEditorStore
      .getState()
      .setMeshVertices(importedLayer!.id, editedVertices, "mesh-edit:test");

    const editedProject = useEditorStore.getState().project!;
    const serialized = serializeProject(editedProject, new Map());
    const reopenedProject = await deserializeProject(
      parseViviFile(JSON.stringify(serialized)),
    );
    useEditorStore.setState((state) => {
      state.project = reopenedProject;
      state.projectStructureVersion = 13;
      state.currentFilePath = TEST_MANUAL_PNG_VIVI_PATH;
    });
    useHistoryStore.getState().clear();

    const reopenedLayer = useEditorStore.getState().project?.layers.at(-1);
    expect(reopenedLayer?.kind).toBe("viviMesh");
    if (!reopenedLayer || reopenedLayer.kind !== "viviMesh") {
      throw new Error("Expected reopened manual PNG layer");
    }
    expect(reopenedLayer.mesh.vertices).toEqual(editedVertices);
    expect(reopenedLayer.importMetadata).toMatchObject({
      source: "manualPng",
      manualPng: {
        sourceFileName: "face.png",
        sourcePath: TEST_ASSET_FACE_PNG_PATH,
      },
    });

    vi.clearAllMocks();
    vi.mocked(getAllTextures).mockReturnValue(new Map());
    const replacementCanvas = createCanvas(128, 96);
    vi.mocked(decodePngToCanvas).mockResolvedValue(replacementCanvas);

    const result = await reimportManualPngLayer(reopenedLayer!.id, {
      buffer: new ArrayBuffer(16),
      fileName: "face-v2.png",
    });

    expect(result).toBe(true);
    const reimportedLayer = useEditorStore.getState().project?.layers.at(-1);
    expect(reimportedLayer?.kind).toBe("viviMesh");
    if (!reimportedLayer || reimportedLayer.kind !== "viviMesh") {
      throw new Error("Expected reimported manual PNG layer");
    }
    expect(reimportedLayer.mesh.vertices).toEqual(editedVertices);
    expect(reimportedLayer.importMetadata).toMatchObject({
      source: "manualPng",
      manualPng: {
        sourceFileName: "face-v2.png",
        sourcePath: TEST_ASSET_FACE_PNG_PATH,
      },
    });

    useHistoryStore.getState().undo();
    const undoneLayer = useEditorStore.getState().project?.layers.at(-1);
    expect(undoneLayer?.kind).toBe("viviMesh");
    if (!undoneLayer || undoneLayer.kind !== "viviMesh") {
      throw new Error("Expected undone manual PNG layer");
    }
    expect(undoneLayer.mesh.vertices).toEqual(editedVertices);
    expect(undoneLayer.importMetadata).toMatchObject({
      source: "manualPng",
      manualPng: {
        sourceFileName: "face.png",
        sourcePath: TEST_ASSET_FACE_PNG_PATH,
      },
    });

    useHistoryStore.getState().redo();
    const redoneLayer = useEditorStore.getState().project?.layers.at(-1);
    expect(redoneLayer?.kind).toBe("viviMesh");
    if (!redoneLayer || redoneLayer.kind !== "viviMesh") {
      throw new Error("Expected redone manual PNG layer");
    }
    expect(redoneLayer.mesh.vertices).toEqual(editedVertices);
    expect(redoneLayer.importMetadata).toMatchObject({
      source: "manualPng",
      manualPng: {
        sourceFileName: "face-v2.png",
        sourcePath: TEST_ASSET_FACE_PNG_PATH,
      },
    });
  });

  it("rejects manual PNG reimport when the updated bounds no longer match the current layer", async () => {
    const project = createProject({ width: 640, height: 480 });
    useEditorStore.setState((state) => {
      state.project = project;
    });
    vi.mocked(decodePngToCanvas).mockResolvedValueOnce(createCanvas(120, 80));

    await importImageAsLayerFromBufferAsync(
      new ArrayBuffer(8),
      "trimmed.png",
      undefined,
      TEST_ASSET_TRIMMED_PNG_PATH,
    );

    const importedLayer = useEditorStore.getState().project?.layers.at(-1);

    vi.clearAllMocks();
    vi.mocked(getAllTextures).mockReturnValue(new Map());
    vi.mocked(window.electronAPI.readImageFile).mockResolvedValue({
      buffer: new ArrayBuffer(32),
      filename: "trimmed.png",
    });
    vi.mocked(decodePngToCanvas).mockResolvedValue(createCanvas(140, 90));

    const result = await reimportManualPngLayer(importedLayer!.id);

    expect(result).toBe(false);
    expect(setTexture).not.toHaveBeenCalled();
    expect(useEditorStore.getState().project?.layers.at(-1)).toMatchObject({
      id: importedLayer!.id,
      width: 120,
      height: 80,
      x: 0,
      y: 0,
    });
    expect(useNotificationStore.getState().notifications.at(-1)?.message).toBe(
      "The reimported PNG no longer matches the current layer bounds. Import it as a new layer instead.",
    );
  });

  it("fails manual PNG reimport when the layer has no stored source path", async () => {
    const project = createProject({ width: 640, height: 480 });
    useEditorStore.setState((state) => {
      state.project = project;
    });
    vi.mocked(decodePngToCanvas).mockResolvedValueOnce(createCanvas(64, 64));

    await importImageAsLayerFromBufferAsync(new ArrayBuffer(8), "orphan.png");

    const importedLayer = useEditorStore.getState().project?.layers.at(-1);
    const result = await reimportManualPngLayer(importedLayer!.id);

    expect(result).toBe(false);
    expect(useNotificationStore.getState().notifications.at(-1)?.message).toBe(
      "The selected imported PNG layer does not have a source path to reimport.",
    );
  });
});
