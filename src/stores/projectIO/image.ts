import { DRAW_ORDER, VIEWPORT } from "@vivi2d/core/constants";
import { flattenLayers } from "@vivi2d/core/layer-utils";
import type { ManualPngImportMetadata } from "@vivi2d/core/types";
import {
  applyManualPngReimportToLayer,
  assertManualPngReimportMatchesLayer,
  getManualPngReimportTargetLayer,
} from "@vivi2d/editor-core/manual-png-reimport-command";
import { t as tGlobal } from "@/lib/i18n";
import { decodePngToCanvas, trimTransparentBounds } from "@/lib/image-loader";
import {
  DEFAULT_MANUAL_IMAGE_IMPORT_OPTIONS,
  type ManualImageImportOptions,
  normalizeManualImageImportOptions,
} from "@/lib/manual-image-import-options";
import { generateAutoMesh } from "@/lib/auto-mesh";
import type { ProjectSourceKind } from "@/lib/project-source-kind";
import { clearTextures, getAllTextures, setTexture } from "@/lib/texture-store";
import { useEditorStore } from "../editorStore";
import { useNotificationStore } from "../notificationStore";
import {
  bumpProjectStructureVersion,
  mutateProject,
  runInHistoryTransaction,
} from "../projectMutator";
import { useSelectionStore } from "../selectionStore";
import { useViewportStore } from "../viewportStore";
import {
  assignSequentialDrawOrders,
  buildManualPngImportMetadata,
  buildManualPngImportOptionsFromMetadata,
  buildPreparedLayerEntry,
  computeLayerBounds,
  computeLayerPosition,
  createViviMeshFromPreparedCanvas,
  createGroupNode,
  createProjectFromPreparedCanvas,
  getImageBaseName,
  getNextImportedDrawOrder,
  hasLargeTransparentPadding,
  IMPORTED_IMAGES_GROUP_NAME,
  makeUniqueLayerName,
  type PreparedImageCanvas,
  type PreparedLayerEntry,
  shouldAutoCenterImportedImage,
} from "@vivi2d/editor-core/manual-png-import-command";
import { applyLoadedProject, initParameterValues, resetRelatedStores } from "./reset";

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
const MANUAL_PNG_REIMPORT_PROJECT_WARNING =
  "A project must be open before reimporting an image layer.";
const MANUAL_PNG_REIMPORT_ELIGIBILITY_WARNING =
  "Select a manual PNG-imported ViviMesh before reimporting.";
const MANUAL_PNG_REIMPORT_SOURCE_WARNING =
  "The selected imported PNG layer does not have a source path to reimport.";
const MANUAL_PNG_REIMPORT_MISMATCH_ERROR =
  "The reimported PNG no longer matches the current layer bounds. Import it as a new layer instead.";
const AUTO_CENTER_IMPORT_MESSAGE_KEY = "imageImportOptions.largeImageAutoCentered";
const TRANSPARENT_PADDING_WARNING_MESSAGE_KEY =
  "imageImportOptions.transparentPaddingWarning";
const FOCUSED_VIEWPORT_ON_IMPORT_MESSAGE_KEY =
  "imageImportOptions.focusedViewportOnImport";
const FOCUSED_VIEWPORT_ON_IMPORT_MULTIPLE_MESSAGE_KEY =
  "imageImportOptions.focusedViewportOnImportMultiple";

function generateImportedMesh(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
) {
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
  const currentProject = useEditorStore.getState().project;
  if (!currentProject) {
    useNotificationStore
      .getState()
      .addNotification(
        "warning",
        tGlobal("imageImportOptions.projectRequiredForLayer"),
      );
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
  const currentProject = useEditorStore.getState().project;
  if (!currentProject) {
    useNotificationStore
      .getState()
      .addNotification(
        "warning",
        tGlobal("imageImportOptions.projectRequiredForLayers"),
      );
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
  const project = useEditorStore.getState().project;
  if (!project) {
    useNotificationStore
      .getState()
      .addNotification(
        "warning",
        tGlobal("imageImportOptions.reimportProjectRequired"),
      );
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

  let resolvedSource: { buffer: ArrayBuffer; fileName: string; sourcePath?: string };
  let prepared: PreparedImageCanvas;
  let nextPosition: { x: number; y: number };
  let nextImportMetadata: ReturnType<typeof buildManualPngImportMetadata>;
  const importOptions = buildManualPngImportOptionsFromMetadata(metadata);

  try {
    resolvedSource = await resolveManualPngReimportSource(metadata, source);
    prepared = await decodePreparedPng(resolvedSource.buffer, importOptions);
    nextPosition = computeLayerPosition(
      prepared,
      project.width,
      project.height,
      importOptions,
    );
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
      tGlobal("imageImportOptions.reimportMismatch"),
    );
    nextImportMetadata = buildManualPngImportMetadata(
      resolvedSource.fileName,
      prepared,
      nextPosition,
      importOptions,
      resolvedSource.sourcePath,
    );
  } catch (e) {
    useNotificationStore
      .getState()
      .addNotification("error", e instanceof Error ? e.message : String(e));
    return false;
  }

  const previousTextures = new Map(getAllTextures());

  try {
    setTexture(layerId, prepared.canvas);

    runInHistoryTransaction(() => {
      mutateProject((draft) => {
        const applied = applyManualPngReimportToLayer(draft, {
          layerId,
          geometry: {
            x: nextPosition.x,
            y: nextPosition.y,
            width: prepared.canvas.width,
            height: prepared.canvas.height,
          },
          importMetadata: nextImportMetadata,
        });
        if (!applied) {
          throw new Error(tGlobal("imageImportOptions.reimportEligibility"));
        }
      });
      bumpProjectStructureVersion();
      useSelectionStore.getState().selectLayer(layerId);
    });

    useNotificationStore
      .getState()
      .addNotification(
        "info",
        `${tGlobal("imageImportOptions.reimportedPrefix")} ${existingLayer.name}.`,
      );
    return true;
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
}

export type { ManualImageImportOptions };
export {
  DEFAULT_MANUAL_IMAGE_IMPORT_OPTIONS,
  EMPTY_PNG_FOLDER_MESSAGE,
  normalizeManualImageImportOptions,
};
