import { DRAW_ORDER, VIEWPORT } from "@vivi2d/core/constants";
import { flattenLayers } from "@vivi2d/core/layer-utils";
import { MAX_PSD_PIXELS } from "@vivi2d/core/load-limits";
import type { ManualPngImportMetadata } from "@vivi2d/core/types";
import {
  assignSequentialDrawOrders,
  buildManualPngImportMetadata,
  buildManualPngImportOptionsFromMetadata,
  buildPreparedLayerEntry,
  computeLayerBounds,
  computeLayerPosition,
  createGroupNode,
  createProjectFromPreparedCanvas,
  createViviMeshFromPreparedCanvas,
  getImageBaseName,
  getNextImportedDrawOrder,
  hasLargeTransparentPadding,
  IMPORTED_IMAGES_GROUP_NAME,
  makeUniqueLayerName,
  type PreparedImageCanvas,
  type PreparedLayerEntry,
  shouldAutoCenterImportedImage,
} from "@vivi2d/editor-core/manual-png-import-command";
import {
  applyManualPngReimportToLayer,
  assertManualPngReimportMatchesLayer,
  getManualPngReimportTargetLayer,
} from "@vivi2d/editor-core/manual-png-reimport-command";
import { generateAutoMesh } from "@/lib/auto-mesh";
import { t as tGlobal } from "@/lib/i18n";
import { decodePngToCanvas, trimTransparentBounds } from "@/lib/image-loader";
import {
  DEFAULT_MANUAL_IMAGE_IMPORT_OPTIONS,
  type ManualImageImportOptions,
  normalizeManualImageImportOptions,
} from "@/lib/manual-image-import-options";
import type { ProjectSourceKind } from "@/lib/project-source-kind";
import { isProjectV11Publishing } from "@/lib/project-v11-publishing";
import {
  clearTextures,
  getAllTextures,
  getTexture,
  getTextureStoreRevision,
  hashTextureCanvas,
  prepareTextureHistoryEffects,
  setTexture,
  snapshotTextureCanvas,
  type TextureHistoryEffect,
} from "@/lib/texture-store";
import { useEditorStore } from "../editorStore";
import { prepareHistorySnapshot, useHistoryStore } from "../historyStore";
import { useNotificationStore } from "../notificationStore";
import {
  bumpProjectStructureVersion,
  mutateProject,
  runInHistoryTransaction,
} from "../projectMutator";
import { useSelectionStore } from "../selectionStore";
import { rejectV11LegacyAction } from "../v11LegacyGuard";
import { useViewportStore } from "../viewportStore";
import { applyLoadedProject, initParameterValues, resetRelatedStores } from "./reset";
import { importV11Images, replaceV11Image } from "./v11Images";

type NamedImageBuffer = {
  buffer: ArrayBuffer;
  fileName: string;
  sourcePath?: string;
};

type ManualPngReimportSource = {
  filePath?: string;
  buffer?: ArrayBuffer;
  fileName?: string;
};
const AUTO_MESH_PRESET = "standard";
const EMPTY_PNG_FOLDER_MESSAGE = "Selected folder does not contain any PNG files.";
const AUTO_CENTER_IMPORT_MESSAGE_KEY = "imageImportOptions.largeImageAutoCentered";
const TRANSPARENT_PADDING_WARNING_MESSAGE_KEY =
  "imageImportOptions.transparentPaddingWarning";
const FOCUSED_VIEWPORT_ON_IMPORT_MESSAGE_KEY =
  "imageImportOptions.focusedViewportOnImport";
const FOCUSED_VIEWPORT_ON_IMPORT_MULTIPLE_MESSAGE_KEY =
  "imageImportOptions.focusedViewportOnImportMultiple";

function generateImportedMesh(canvas: HTMLCanvasElement, width: number, height: number) {
  return generateAutoMesh(canvas, width, height, AUTO_MESH_PRESET);
}

function restorePreviousProjectState(
  previousState: {
    project: ReturnType<typeof useEditorStore.getState>["project"];
    projectVersion: number;
    projectStructureVersion: number;
    currentFilePath: string | null;
    projectSourceKind: ProjectSourceKind;
  },
  previousTextures: ReturnType<typeof getAllTextures>,
): void {
  clearTextures();
  for (const [layerId, canvas] of previousTextures.entries()) {
    setTexture(layerId, canvas);
  }
  useEditorStore.setState((state) => {
    state.project = previousState.project;
    state.projectVersion = previousState.projectVersion;
    state.projectStructureVersion = previousState.projectStructureVersion;
    state.currentFilePath = previousState.currentFilePath;
    state.projectSourceKind = previousState.projectSourceKind;
  });
  resetRelatedStores();
  if (previousState.project) {
    initParameterValues();
  }
}

function prepareImportedCanvas(
  canvas: HTMLCanvasElement,
  options: ManualImageImportOptions,
): PreparedImageCanvas {
  if (!options.trimTransparentBounds) {
    return {
      canvas,
      offsetX: 0,
      offsetY: 0,
      originalWidth: canvas.width,
      originalHeight: canvas.height,
      trimmed: false,
    };
  }
  return trimTransparentBounds(canvas);
}

async function decodePreparedPng(
  buffer: ArrayBuffer,
  options: ManualImageImportOptions,
): Promise<PreparedImageCanvas> {
  const canvas = await decodePngToCanvas(buffer);
  return prepareImportedCanvas(canvas, options);
}

type ImportRiskAnalysis = {
  effectiveOptions: ManualImageImportOptions;
  autoCentered: boolean;
  hasTransparentPadding: boolean;
};

function analyzeImportRisk(
  project: { width: number; height: number },
  prepared: PreparedImageCanvas,
  options: ManualImageImportOptions,
  hasTransparentPadding = hasLargeTransparentPadding(prepared),
): ImportRiskAnalysis {
  const autoCentered =
    !options.centerOnCanvas &&
    shouldAutoCenterImportedImage(project.width, project.height, prepared);
  return {
    effectiveOptions: autoCentered ? { ...options, centerOnCanvas: true } : options,
    autoCentered,
    hasTransparentPadding,
  };
}

function detectTransparentPadding(
  canvas: HTMLCanvasElement,
  options: ManualImageImportOptions,
  prepared: PreparedImageCanvas,
): boolean {
  if (options.trimTransparentBounds) {
    return hasLargeTransparentPadding(prepared);
  }
  return hasLargeTransparentPadding(trimTransparentBounds(canvas));
}

function notifyImportRisk(analysis: ImportRiskAnalysis): void {
  const notificationStore = useNotificationStore.getState();
  if (analysis.autoCentered) {
    notificationStore.addNotification("info", tGlobal(AUTO_CENTER_IMPORT_MESSAGE_KEY));
  }
  if (
    analysis.hasTransparentPadding &&
    !analysis.effectiveOptions.trimTransparentBounds
  ) {
    notificationStore.addNotification(
      "warning",
      tGlobal(TRANSPARENT_PADDING_WARNING_MESSAGE_KEY),
    );
  }
}

function focusViewportOnImportedBounds(bounds: {
  x: number;
  y: number;
  width: number;
  height: number;
}): boolean {
  if (bounds.width <= 0 || bounds.height <= 0) return false;
  const surface = document.querySelector<HTMLElement>(".canvas-surface");
  if (!surface) return false;
  const rect = surface.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;

  const scaleX = rect.width / bounds.width;
  const scaleY = rect.height / bounds.height;
  const fitScale = Math.min(scaleX, scaleY) * VIEWPORT.FIT_SCALE;
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  const panX = rect.width / 2 - centerX * fitScale;
  const panY = rect.height / 2 - centerY * fitScale;
  const viewport = useViewportStore.getState();
  viewport.setZoom(fitScale);
  viewport.setPan(panX, panY);
  return true;
}

function notifyAndFocusViewportOnImportedBounds(
  bounds: { x: number; y: number; width: number; height: number } | null,
  multiple: boolean,
): void {
  if (!bounds) return;
  const focused = focusViewportOnImportedBounds(bounds);
  if (!focused) return;
  useNotificationStore
    .getState()
    .addNotification(
      "info",
      tGlobal(
        multiple
          ? FOCUSED_VIEWPORT_ON_IMPORT_MULTIPLE_MESSAGE_KEY
          : FOCUSED_VIEWPORT_ON_IMPORT_MESSAGE_KEY,
      ),
    );
}

function importedBoundsNeedViewportFocus(
  project: { width: number; height: number },
  bounds: { width: number; height: number },
): boolean {
  return bounds.width > project.width || bounds.height > project.height;
}

async function resolveManualPngReimportSource(
  metadata: ManualPngImportMetadata,
  source?: ManualPngReimportSource,
): Promise<{ buffer: ArrayBuffer; fileName: string; sourcePath?: string }> {
  if (source?.buffer) {
    return {
      buffer: source.buffer,
      fileName: source.fileName ?? metadata.sourceFileName,
      sourcePath: source.filePath ?? metadata.sourcePath,
    };
  }

  const filePath = source?.filePath ?? metadata.sourcePath;
  if (!filePath) {
    throw new Error(tGlobal("imageImportOptions.reimportSourceMissing"));
  }

  const { buffer, filename } = await window.electronAPI.readImageFile({
    imagePath: filePath,
  });
  return {
    buffer,
    fileName: source?.fileName ?? filename,
    sourcePath: filePath,
  };
}

export async function loadImage(
  options?: Partial<ManualImageImportOptions>,
): Promise<boolean> {
  const normalizedOptions = normalizeManualImageImportOptions(options);
  try {
    const imagePath = await window.electronAPI.openPngFile();
    if (!imagePath) return false;
    const { buffer, filename } = await window.electronAPI.readImageFile({ imagePath });
    return await loadImageFromBufferAsync(buffer, filename, normalizedOptions, imagePath);
  } catch (e) {
    useNotificationStore
      .getState()
      .addNotification("error", e instanceof Error ? e.message : String(e));
    return false;
  }
}

export async function loadImageFromBufferAsync(
  buffer: ArrayBuffer,
  fileName: string,
  options?: Partial<ManualImageImportOptions>,
  sourcePath?: string,
): Promise<boolean> {
  if (rejectV11LegacyAction()) return false;
  const normalizedOptions = {
    ...normalizeManualImageImportOptions(options),
    createGroupForImportedLayers: false,
  };
  const editorState = useEditorStore.getState();
  const previousState = {
    project: editorState.project,
    projectVersion: editorState.projectVersion,
    projectStructureVersion: editorState.projectStructureVersion,
    currentFilePath: editorState.currentFilePath,
    projectSourceKind: editorState.projectSourceKind,
  };
  const previousTextures = new Map(getAllTextures());

  let prepared: PreparedImageCanvas;
  try {
    prepared = await decodePreparedPng(buffer, normalizedOptions);
  } catch (e) {
    useNotificationStore
      .getState()
      .addNotification("error", e instanceof Error ? e.message : String(e));
    return false;
  }

  if (
    rejectV11LegacyAction() ||
    useEditorStore.getState().project !== editorState.project ||
    useEditorStore.getState().projectVersion !== editorState.projectVersion
  )
    return false;
  const project = createProjectFromPreparedCanvas(
    fileName,
    prepared,
    normalizedOptions,
    sourcePath,
    generateImportedMesh,
  );
  const layer = project.layers[0];
  if (!layer || layer.kind !== "viviMesh") {
    useNotificationStore
      .getState()
      .addNotification("error", tGlobal("imageImportOptions.failedToBuildPngProject"));
    return false;
  }

  try {
    clearTextures();
    setTexture(layer.id, prepared.canvas);
    applyLoadedProject(project, null, "manualPng");
    return true;
  } catch (e) {
    restorePreviousProjectState(previousState, previousTextures);
    useNotificationStore
      .getState()
      .addNotification("error", e instanceof Error ? e.message : String(e));
    return false;
  }
}

export async function importImageAsLayer(
  options?: Partial<ManualImageImportOptions>,
): Promise<boolean> {
  const project = useEditorStore.getState().project;
  if (!project) return false;
  const normalizedOptions = {
    ...normalizeManualImageImportOptions(options),
    createGroupForImportedLayers: false,
  };
  try {
    const imagePath = await window.electronAPI.openPngFile();
    if (!imagePath) return false;
    const { buffer, filename } = await window.electronAPI.readImageFile({ imagePath });
    return await importImageAsLayerFromBufferAsync(
      buffer,
      filename,
      normalizedOptions,
      imagePath,
    );
  } catch (e) {
    useNotificationStore
      .getState()
      .addNotification("error", e instanceof Error ? e.message : String(e));
    return false;
  }
}

export async function importImagesAsLayers(
  options?: Partial<ManualImageImportOptions>,
): Promise<boolean> {
  const project = useEditorStore.getState().project;
  if (!project) return false;
  const normalizedOptions = normalizeManualImageImportOptions(options);
  try {
    const imagePaths = await window.electronAPI.openPngFiles();
    if (!imagePaths || imagePaths.length === 0) return false;
    const files = await Promise.all(
      imagePaths.map(async (imagePath) => {
        const { buffer, filename } = await window.electronAPI.readImageFile({
          imagePath,
        });
        return { buffer, fileName: filename, sourcePath: imagePath };
      }),
    );
    return await importImagesAsLayersFromBuffersAsync(files, normalizedOptions);
  } catch (e) {
    useNotificationStore
      .getState()
      .addNotification("error", e instanceof Error ? e.message : String(e));
    return false;
  }
}

export async function importPngFolderAsLayers(
  options?: Partial<ManualImageImportOptions>,
): Promise<boolean> {
  const project = useEditorStore.getState().project;
  if (!project) return false;
  const normalizedOptions = normalizeManualImageImportOptions(options);
  try {
    const imagePaths = await window.electronAPI.openPngFolder();
    if (!imagePaths) return false;
    if (imagePaths.length === 0) {
      useNotificationStore
        .getState()
        .addNotification("warning", tGlobal("imageImportOptions.emptyPngFolder"));
      return false;
    }
    const files = await Promise.all(
      imagePaths.map(async (imagePath) => {
        const { buffer, filename } = await window.electronAPI.readImageFile({
          imagePath,
        });
        return { buffer, fileName: filename, sourcePath: imagePath };
      }),
    );
    return await importImagesAsLayersFromBuffersAsync(files, normalizedOptions);
  } catch (e) {
    useNotificationStore
      .getState()
      .addNotification("error", e instanceof Error ? e.message : String(e));
    return false;
  }
}

export async function importImageAsLayerFromBufferAsync(
  buffer: ArrayBuffer,
  fileName: string,
  options?: Partial<ManualImageImportOptions>,
  sourcePath?: string,
): Promise<boolean> {
  if (isProjectV11Publishing()) throw new Error("PROJECT_TRANSACTION_BUSY");
  if (useEditorStore.getState().projectV11)
    return importV11Images([{ buffer, fileName }]);
  const currentProject = useEditorStore.getState().project;
  if (!currentProject) {
    useNotificationStore
      .getState()
      .addNotification("warning", tGlobal("imageImportOptions.projectRequiredForLayer"));
    return false;
  }
  const normalizedOptions = {
    ...normalizeManualImageImportOptions(options),
    createGroupForImportedLayers: false,
  };

  let prepared: PreparedImageCanvas;
  let decodedCanvas: HTMLCanvasElement;
  try {
    decodedCanvas = await decodePngToCanvas(buffer);
    prepared = prepareImportedCanvas(decodedCanvas, normalizedOptions);
  } catch (e) {
    useNotificationStore
      .getState()
      .addNotification("error", e instanceof Error ? e.message : String(e));
    return false;
  }
  const analysis = analyzeImportRisk(
    currentProject,
    prepared,
    normalizedOptions,
    detectTransparentPadding(decodedCanvas, normalizedOptions, prepared),
  );
  if (rejectV11LegacyAction() || useEditorStore.getState().project !== currentProject)
    return false;
  notifyImportRisk(analysis);

  const previousTextures = new Map(getAllTextures());
  const nextDrawOrder = getNextImportedDrawOrder(currentProject);
  const preparedEntry = buildPreparedLayerEntry(
    currentProject,
    fileName,
    prepared,
    nextDrawOrder,
    analysis.effectiveOptions,
    sourcePath,
    generateImportedMesh,
  );
  if (rejectV11LegacyAction() || useEditorStore.getState().project !== currentProject)
    return false;

  try {
    setTexture(preparedEntry.layer.id, preparedEntry.canvas);
  } catch (e) {
    clearTextures();
    for (const [restoredLayerId, restoredCanvas] of previousTextures.entries()) {
      setTexture(restoredLayerId, restoredCanvas);
    }
    useNotificationStore
      .getState()
      .addNotification("error", e instanceof Error ? e.message : String(e));
    return false;
  }

  runInHistoryTransaction(() => {
    mutateProject((project) => {
      project.layers.push(preparedEntry.layer);
      if (nextDrawOrder >= DRAW_ORDER.MAX) {
        assignSequentialDrawOrders(project);
      }
    });
    bumpProjectStructureVersion();
    useSelectionStore.getState().selectLayer(preparedEntry.layer.id);
  });
  requestAnimationFrame(() => {
    const importedBounds = {
      x: preparedEntry.layer.x,
      y: preparedEntry.layer.y,
      width: preparedEntry.layer.width,
      height: preparedEntry.layer.height,
    };
    if (
      analysis.autoCentered ||
      (analysis.hasTransparentPadding &&
        !analysis.effectiveOptions.trimTransparentBounds) ||
      importedBoundsNeedViewportFocus(currentProject, importedBounds)
    ) {
      notifyAndFocusViewportOnImportedBounds(importedBounds, false);
    }
  });
  return true;
}

export async function importImagesAsLayersFromBuffersAsync(
  files: NamedImageBuffer[],
  options?: Partial<ManualImageImportOptions>,
): Promise<boolean> {
  if (isProjectV11Publishing()) throw new Error("PROJECT_TRANSACTION_BUSY");
  if (useEditorStore.getState().projectV11) return importV11Images(files);
  const currentProject = useEditorStore.getState().project;
  if (!currentProject) {
    useNotificationStore
      .getState()
      .addNotification("warning", tGlobal("imageImportOptions.projectRequiredForLayers"));
    return false;
  }
  if (files.length === 0) return false;

  const normalizedOptions = normalizeManualImageImportOptions(options);
  const preparedEntries: PreparedLayerEntry[] = [];
  const reservedNames = new Set(
    flattenLayers(currentProject.layers).map((layer) => layer.name),
  );
  let nextDrawOrder = getNextImportedDrawOrder(currentProject);
  let autoCenteredImportCount = 0;
  let hasTransparentPaddingImport = false;

  try {
    for (const file of files) {
      const decodedCanvas = await decodePngToCanvas(file.buffer);
      const prepared = prepareImportedCanvas(decodedCanvas, normalizedOptions);
      const analysis = analyzeImportRisk(
        currentProject,
        prepared,
        normalizedOptions,
        detectTransparentPadding(decodedCanvas, normalizedOptions, prepared),
      );
      autoCenteredImportCount += analysis.autoCentered ? 1 : 0;
      hasTransparentPaddingImport ||=
        analysis.hasTransparentPadding &&
        !analysis.effectiveOptions.trimTransparentBounds;
      const baseName = getImageBaseName(file.fileName);
      let uniqueName = baseName;
      if (reservedNames.has(uniqueName)) {
        let suffix = 2;
        while (reservedNames.has(`${baseName} (${suffix})`)) {
          suffix += 1;
        }
        uniqueName = `${baseName} (${suffix})`;
      }
      reservedNames.add(uniqueName);
      const position = computeLayerPosition(
        prepared,
        currentProject.width,
        currentProject.height,
        analysis.effectiveOptions,
      );
      const layer = createViviMeshFromPreparedCanvas(
        crypto.randomUUID(),
        uniqueName,
        prepared,
        Math.min(nextDrawOrder, DRAW_ORDER.MAX),
        position,
        analysis.effectiveOptions,
        buildManualPngImportMetadata(
          file.fileName,
          prepared,
          position,
          analysis.effectiveOptions,
          file.sourcePath,
        ),
        generateImportedMesh,
      );
      nextDrawOrder += 1;
      preparedEntries.push({ layer, canvas: prepared.canvas });
    }
  } catch (e) {
    useNotificationStore
      .getState()
      .addNotification("error", e instanceof Error ? e.message : String(e));
    return false;
  }
  if (rejectV11LegacyAction() || useEditorStore.getState().project !== currentProject)
    return false;
  if (autoCenteredImportCount > 0) {
    useNotificationStore
      .getState()
      .addNotification("info", tGlobal(AUTO_CENTER_IMPORT_MESSAGE_KEY));
  }
  if (hasTransparentPaddingImport) {
    useNotificationStore
      .getState()
      .addNotification("warning", tGlobal(TRANSPARENT_PADDING_WARNING_MESSAGE_KEY));
  }

  if (rejectV11LegacyAction() || useEditorStore.getState().project !== currentProject)
    return false;
  const previousTextures = new Map(getAllTextures());

  try {
    for (const entry of preparedEntries) {
      setTexture(entry.layer.id, entry.canvas);
    }
  } catch (e) {
    clearTextures();
    for (const [restoredLayerId, restoredCanvas] of previousTextures.entries()) {
      setTexture(restoredLayerId, restoredCanvas);
    }
    useNotificationStore
      .getState()
      .addNotification("error", e instanceof Error ? e.message : String(e));
    return false;
  }

  const selectLayerId = preparedEntries[preparedEntries.length - 1]?.layer.id ?? null;

  runInHistoryTransaction(() => {
    mutateProject((project) => {
      if (normalizedOptions.createGroupForImportedLayers) {
        const groupName = makeUniqueLayerName(project, IMPORTED_IMAGES_GROUP_NAME);
        const groupDrawOrder = preparedEntries[0]?.layer.drawOrder ?? nextDrawOrder;
        project.layers.push(
          createGroupNode(
            crypto.randomUUID(),
            groupName,
            preparedEntries.map((entry) => entry.layer),
            groupDrawOrder,
          ),
        );
      } else {
        for (const entry of preparedEntries) {
          project.layers.push(entry.layer);
        }
      }
      if (
        preparedEntries.some(
          (entry) => (entry.layer.drawOrder ?? DRAW_ORDER.DEFAULT) >= DRAW_ORDER.MAX,
        )
      ) {
        assignSequentialDrawOrders(project);
      }
    });
    bumpProjectStructureVersion();
    useSelectionStore.getState().selectLayer(selectLayerId);
  });
  requestAnimationFrame(() => {
    const mergedBounds = computeLayerBounds(
      preparedEntries.map((entry) => ({
        x: entry.layer.x,
        y: entry.layer.y,
        width: entry.layer.width,
        height: entry.layer.height,
      })),
    );
    if (
      mergedBounds &&
      (autoCenteredImportCount > 0 ||
        hasTransparentPaddingImport ||
        importedBoundsNeedViewportFocus(currentProject, mergedBounds))
    ) {
      notifyAndFocusViewportOnImportedBounds(mergedBounds, true);
    }
  });
  return true;
}

export async function reimportManualPngLayer(
  layerId: string,
  source?: ManualPngReimportSource,
): Promise<boolean> {
  if (isProjectV11Publishing()) throw new Error("PROJECT_TRANSACTION_BUSY");
  if (useEditorStore.getState().projectV11)
    return replaceV11Image(layerId, source?.buffer);
  const project = useEditorStore.getState().project;
  if (!project) {
    useNotificationStore
      .getState()
      .addNotification("warning", tGlobal("imageImportOptions.reimportProjectRequired"));
    return false;
  }

  const target = getManualPngReimportTargetLayer(project, layerId);
  if (!target) {
    useNotificationStore
      .getState()
      .addNotification("warning", tGlobal("imageImportOptions.reimportEligibility"));
    return false;
  }
  const { layer: existingLayer, metadata } = target;

  let failureKey: Parameters<typeof tGlobal>[0] = "imageImportOptions.reimportFailed";
  const fail = (key: Parameters<typeof tGlobal>[0]): never => {
    failureKey = key;
    throw new Error("PNG reimport failed");
  };
  try {
    const historyBefore = useHistoryStore.getState();
    const revision = getTextureStoreRevision();
    const oldCanvas = getTexture(layerId);
    if (
      !oldCanvas ||
      !Number.isSafeInteger(oldCanvas.width) ||
      !Number.isSafeInteger(oldCanvas.height) ||
      oldCanvas.width <= 0 ||
      oldCanvas.height <= 0 ||
      oldCanvas.width > MAX_PSD_PIXELS ||
      oldCanvas.height > MAX_PSD_PIXELS ||
      oldCanvas.width * oldCanvas.height > MAX_PSD_PIXELS
    ) {
      return fail("imageImportOptions.reimportFailed");
    }
    const before = snapshotTextureCanvas(layerId, oldCanvas);
    const assertFresh = (verifyPixels: boolean) => {
      const history = useHistoryStore.getState();
      if (
        useEditorStore.getState().project !== project ||
        history.undoStack !== historyBefore.undoStack ||
        history.redoStack !== historyBefore.redoStack ||
        getTextureStoreRevision() !== revision ||
        getTexture(layerId) !== oldCanvas ||
        oldCanvas.width !== before.width ||
        oldCanvas.height !== before.height ||
        (verifyPixels && hashTextureCanvas(oldCanvas) !== before.hash)
      ) {
        fail("imageImportOptions.reimportStale");
      }
    };
    if (!source?.buffer && !(source?.filePath ?? metadata.sourcePath)) {
      return fail("imageImportOptions.reimportSourceMissing");
    }
    const importOptions = buildManualPngImportOptionsFromMetadata(metadata);
    const resolvedSource = await resolveManualPngReimportSource(metadata, source);
    const prepared = await decodePreparedPng(resolvedSource.buffer, importOptions);
    assertFresh(false);
    const nextPosition = computeLayerPosition(
      prepared,
      project.width,
      project.height,
      importOptions,
    );
    try {
      assertManualPngReimportMatchesLayer(
        existingLayer,
        {
          offsetX: prepared.offsetX,
          offsetY: prepared.offsetY,
          width: prepared.canvas.width,
          height: prepared.canvas.height,
        },
        nextPosition,
        metadata,
        "PNG reimport bounds mismatch",
      );
    } catch {
      return fail("imageImportOptions.reimportMismatch");
    }
    const nextImportMetadata = buildManualPngImportMetadata(
      resolvedSource.fileName,
      prepared,
      nextPosition,
      importOptions,
      resolvedSource.sourcePath,
    );
    const after = snapshotTextureCanvas(layerId, prepared.canvas);
    const pixelsChanged =
      before.width !== after.width ||
      before.height !== after.height ||
      before.hash !== after.hash;
    const nextMetadata = nextImportMetadata.manualPng;
    const metadataChanged =
      metadata.sourceFileName !== nextMetadata.sourceFileName ||
      metadata.sourcePath !== nextMetadata.sourcePath ||
      metadata.originalWidth !== nextMetadata.originalWidth ||
      metadata.originalHeight !== nextMetadata.originalHeight ||
      metadata.trimmedBounds.some(
        (value, index) => value !== nextMetadata.trimmedBounds[index],
      ) ||
      metadata.finalOrigin.some(
        (value, index) => value !== nextMetadata.finalOrigin[index],
      ) ||
      metadata.placementMode !== nextMetadata.placementMode ||
      metadata.trimTransparentBoundsApplied !==
        nextMetadata.trimTransparentBoundsApplied ||
      metadata.autoGenerateMeshApplied !== nextMetadata.autoGenerateMeshApplied;
    if (pixelsChanged || metadataChanged) {
      const next = structuredClone(project);
      if (
        !applyManualPngReimportToLayer(next, {
          layerId,
          geometry: {
            x: nextPosition.x,
            y: nextPosition.y,
            width: prepared.canvas.width,
            height: prepared.canvas.height,
          },
          importMetadata: nextImportMetadata,
        })
      ) {
        return fail("imageImportOptions.reimportEligibility");
      }
      const effects: TextureHistoryEffect[] = pixelsChanged
        ? [
            {
              kind: "texture",
              undo: {
                createdTextureIds: [],
                restoredTextures: [before],
                expectedCurrentHash: { [layerId]: after.hash },
                expectedCurrentDimensions: {
                  [layerId]: { width: after.width, height: after.height },
                },
              },
              redo: {
                promotedTextures: [{ textureId: layerId, snapshot: after }],
                expectedCurrentHash: { [layerId]: before.hash },
                expectedCurrentDimensions: {
                  [layerId]: { width: before.width, height: before.height },
                },
              },
              rendererInvalidation: "projectStructureVersion",
            },
          ]
        : [];
      const history = prepareHistorySnapshot(project, effects);
      const textures = prepareTextureHistoryEffects(effects, "redo");
      const editorBefore = useEditorStore.getState();
      const rollback = {
        project: editorBefore.project,
        projectVersion: editorBefore.projectVersion,
        projectStructureVersion: editorBefore.projectStructureVersion,
      };
      // The texture preparer validated changed pixels synchronously; the other
      // path still needs a hash check. Nothing may yield before the commit.
      assertFresh(!pixelsChanged);
      try {
        textures.commit();
        useEditorStore.setState({
          project: next,
          projectStructureVersion: editorBefore.projectStructureVersion + 1,
        });
        history.commit();
      } catch {
        try {
          textures.rollback();
        } finally {
          try {
            useEditorStore.setState(rollback);
          } finally {
            history.rollback();
          }
        }
        return fail("imageImportOptions.reimportFailed");
      }
    } else {
      assertFresh(true);
    }
  } catch {
    // Never read/stringify exceptions from IO, decoders, canvases or subscribers.
    useNotificationStore.getState().addNotification("error", tGlobal(failureKey));
    return false;
  }

  // UI observers cannot turn a committed import into a reported core failure.
  try {
    useSelectionStore.getState().selectLayer(layerId);
  } catch {
    // The core operation has already succeeded.
  }
  try {
    useNotificationStore
      .getState()
      .addNotification(
        "info",
        `${tGlobal("imageImportOptions.reimportedPrefix")} ${existingLayer.name}.`,
      );
  } catch {
    // Do not expose subscriber errors or undo the successful import.
  }
  return true;
}

export type { ManualImageImportOptions };
export {
  DEFAULT_MANUAL_IMAGE_IMPORT_OPTIONS,
  EMPTY_PNG_FOLDER_MESSAGE,
  normalizeManualImageImportOptions,
};
