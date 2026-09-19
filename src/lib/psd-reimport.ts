import { DEFAULT_NAMES } from "@vivi2d/core/constants";
import {
  MAX_PSD_LAYER_PIXELS,
  MAX_PSD_TOTAL_LAYER_PIXELS,
} from "@vivi2d/core/load-limits";
import type { ProjectData } from "@vivi2d/core/types";
import {
  applyPsdReimportLeaves,
  type PsdReimportLeafInput,
  type PsdReimportPlan,
  type PsdReimportPlanEntry,
  planPsdReimport,
} from "@vivi2d/editor-core/psd-reimport-command";
import {
  parseSeeThroughLeafToken,
  stripSeeThroughTechnicalName,
} from "@vivi2d/editor-core/see-through-technical-name";
import type { Layer } from "ag-psd";
import { useEditorStore } from "@/stores/editorStore";
import { prepareHistorySnapshot, useHistoryStore } from "@/stores/historyStore";
import {
  assertPsdBufferWithinLimit,
  PSD_METADATA_READ_OPTIONS,
  PSD_PARSE_ERROR_MESSAGE,
  readPsdSafely,
  validateParsedPsdDocument,
} from "./psd-security";
import {
  getAllTextures,
  getTexture,
  getTextureStoreRevision,
  hashTextureCanvas,
  prepareTextureHistoryEffects,
  snapshotTextureCanvas,
  type TextureHistoryEffect,
  type TextureSnapshotEntry,
} from "./texture-store";

export type PsdReimportPreviewEntry = Omit<
  PsdReimportPlanEntry,
  "matchedBy" | "nextToken"
>;
export interface PsdReimportPreview {
  readonly documentWidth: number;
  readonly documentHeight: number;
  readonly entries: readonly Readonly<PsdReimportPreviewEntry>[];
  readonly removed: readonly Readonly<{ nodeId: string; nodeName: string }>[];
}
export interface PsdReimportSelection {
  selectedLeafIndices: readonly number[];
  confirmedResolutionLeafIndices: readonly number[];
}
interface SourceTexture {
  canvas: HTMLCanvasElement;
  snapshot: TextureSnapshotEntry;
}
interface PendingReimport {
  project: ProjectData;
  undoStack: ReturnType<typeof useHistoryStore.getState>["undoStack"];
  redoStack: ReturnType<typeof useHistoryStore.getState>["redoStack"];
  revision: string;
  leaves: PsdReimportLeafInput[];
  canvases: (HTMLCanvasElement | undefined)[];
  sources: Map<string, SourceTexture>;
  plan: PsdReimportPlan;
}
// Only metadata reaches the UI. Decoded images and old pixels remain private.
const pendingReimports = new WeakMap<PsdReimportPreview, PendingReimport>();
const APPLY_ERROR = "Failed to reimport PSD. Reanalyze the file and try again.";

function flattenRasterLeaves(layers: Layer[] | undefined): Layer[] {
  const leaves: Layer[] = [];
  for (const layer of layers ?? []) {
    if (layer.children) leaves.push(...flattenRasterLeaves(layer.children));
    else leaves.push(layer);
  }
  return leaves;
}
function validRasterSize(width: number, height: number): boolean {
  return (
    Number.isSafeInteger(width) &&
    Number.isSafeInteger(height) &&
    width > 0 &&
    height > 0 &&
    width <= MAX_PSD_LAYER_PIXELS &&
    height <= MAX_PSD_LAYER_PIXELS &&
    width * height <= MAX_PSD_LAYER_PIXELS
  );
}
function assertFresh(
  operation: PendingReimport,
  verifyPixels = true,
  prevalidatedTextureIds?: ReadonlySet<string>,
): void {
  const history = useHistoryStore.getState();
  if (
    useEditorStore.getState().project !== operation.project ||
    history.undoStack !== operation.undoStack ||
    history.redoStack !== operation.redoStack ||
    getTextureStoreRevision() !== operation.revision
  )
    throw new Error(APPLY_ERROR);
  for (const [id, { canvas, snapshot }] of operation.sources) {
    const current = getTexture(id);
    if (
      current !== canvas ||
      current.width !== snapshot.width ||
      current.height !== snapshot.height ||
      (verifyPixels &&
        !prevalidatedTextureIds?.has(id) &&
        hashTextureCanvas(current) !== snapshot.hash)
    ) {
      throw new Error(APPLY_ERROR);
    }
  }
}

export function analyzePsdReimport(
  buffer: ArrayBuffer,
  project: ProjectData,
): PsdReimportPreview {
  try {
    if (useEditorStore.getState().project !== project) throw new Error(APPLY_ERROR);
    const history = useHistoryStore.getState();
    const revision = getTextureStoreRevision();
    assertPsdBufferWithinLimit(buffer);
    const metadata = readPsdSafely(buffer, PSD_METADATA_READ_OPTIONS);
    validateParsedPsdDocument(metadata);
    const psd = readPsdSafely(buffer, {
      useImageData: false,
      skipCompositeImageData: true,
      skipLinkedFilesData: true,
    });
    validateParsedPsdDocument(psd);
    const rasterLeaves = flattenRasterLeaves(psd.children);
    const canvases = rasterLeaves.map((layer) => layer.canvas ?? undefined);
    const leaves: PsdReimportLeafInput[] = rasterLeaves.map((layer, index) => {
      const name = layer.name ?? DEFAULT_NAMES.UNNAMED_LAYER;
      return {
        token: parseSeeThroughLeafToken(name),
        displayName: stripSeeThroughTechnicalName(name),
        left: layer.left ?? 0,
        top: layer.top ?? 0,
        width: canvases[index]?.width ?? (layer.right ?? 0) - (layer.left ?? 0),
        height: canvases[index]?.height ?? (layer.bottom ?? 0) - (layer.top ?? 0),
        hasPixels: !!canvases[index],
      };
    });
    const sizes = new Map(
      [...getAllTextures()].map(
        ([id, canvas]) => [id, { width: canvas.width, height: canvas.height }] as const,
      ),
    );
    const plan = planPsdReimport(project, leaves, sizes);
    const sources = new Map<string, SourceTexture>();
    let sourcePixels = 0;
    for (const entry of plan.entries) {
      if (!entry.nodeId || sources.has(entry.nodeId)) continue;
      const canvas = getTexture(entry.nodeId);
      if (!canvas || !validRasterSize(canvas.width, canvas.height)) continue;
      sourcePixels += canvas.width * canvas.height;
      if (sourcePixels > MAX_PSD_TOTAL_LAYER_PIXELS) throw new Error(APPLY_ERROR);
      sources.set(entry.nodeId, {
        canvas,
        snapshot: snapshotTextureCanvas(entry.nodeId, canvas),
      });
    }
    const operation: PendingReimport = {
      project,
      undoStack: history.undoStack,
      redoStack: history.redoStack,
      revision,
      leaves,
      canvases,
      sources,
      plan,
    };
    // Reject a stale project from an asynchronous file picker.
    assertFresh(operation, false);
    const preview: PsdReimportPreview = Object.freeze({
      documentWidth: psd.width,
      documentHeight: psd.height,
      entries: Object.freeze(
        plan.entries.map(({ matchedBy: _matchedBy, nextToken: _nextToken, ...entry }) =>
          Object.freeze(entry),
        ),
      ),
      removed: Object.freeze(plan.removed.map((entry) => Object.freeze({ ...entry }))),
    });
    pendingReimports.set(preview, operation);
    return preview;
  } catch {
    // Never inspect/stringify/log untrusted parser or canvas exceptions.
    throw new Error(PSD_PARSE_ERROR_MESSAGE);
  }
}
export function disposePsdReimport(preview: PsdReimportPreview): void {
  pendingReimports.delete(preview);
}

export function applyPsdReimport(
  preview: PsdReimportPreview,
  selection: PsdReimportSelection,
): { updatedCount: number } {
  try {
    const operation = pendingReimports.get(preview);
    if (!operation) throw new Error(APPLY_ERROR);
    assertFresh(operation, false);
    const next = structuredClone(operation.project);
    const selected = applyPsdReimportLeaves(
      next,
      operation.leaves,
      operation.plan,
      selection.selectedLeafIndices,
      selection.confirmedResolutionLeafIndices,
    );
    const changedIds = new Set(selected.metadataChangedLayerIds);
    const before: TextureSnapshotEntry[] = [];
    const after: TextureSnapshotEntry[] = [];
    const changedTextureIds = new Set<string>();
    for (const target of selected.updatedTextureTargets) {
      const source = operation.sources.get(target.layerId);
      const canvas = operation.canvases[target.leafIndex];
      if (!source || !canvas) throw new Error(APPLY_ERROR);
      const snapshot = snapshotTextureCanvas(target.layerId, canvas);
      const old = source.snapshot;
      if (
        snapshot.width === old.width &&
        snapshot.height === old.height &&
        snapshot.hash === old.hash
      )
        continue;
      changedIds.add(target.layerId);
      before.push(old);
      after.push(snapshot);
      changedTextureIds.add(target.layerId);
    }
    if (changedIds.size === 0) {
      assertFresh(operation);
      disposePsdReimport(preview);
      return { updatedCount: 0 };
    }
    const effects: TextureHistoryEffect[] =
      after.length === 0
        ? []
        : [
            {
              kind: "texture",
              undo: {
                createdTextureIds: [],
                restoredTextures: before,
                expectedCurrentHash: Object.fromEntries(
                  after.map((s) => [s.textureId, s.hash]),
                ),
                expectedCurrentDimensions: Object.fromEntries(
                  after.map((s) => [s.textureId, { width: s.width, height: s.height }]),
                ),
              },
              redo: {
                promotedTextures: after.map((snapshot) => ({
                  textureId: snapshot.textureId,
                  hash: snapshot.hash,
                  snapshot,
                })),
                expectedCurrentHash: Object.fromEntries(
                  before.map((s) => [s.textureId, s.hash]),
                ),
                expectedCurrentDimensions: Object.fromEntries(
                  before.map((s) => [s.textureId, { width: s.width, height: s.height }]),
                ),
              },
              rendererInvalidation: "projectStructureVersion",
            },
          ];
    const history = prepareHistorySnapshot(operation.project, effects);
    const textures = prepareTextureHistoryEffects(effects, "redo");
    const editorBefore = useEditorStore.getState();
    const editorRollback = {
      project: editorBefore.project,
      projectVersion: editorBefore.projectVersion,
      projectStructureVersion: editorBefore.projectStructureVersion,
    };
    const editorNext = {
      project: next,
      projectStructureVersion: editorBefore.projectStructureVersion + 1,
    };
    // The synchronous texture preflight just validated changed inputs. Check
    // all other matched pixels here, without reading the changed inputs twice.
    assertFresh(operation, true, changedTextureIds);
    try {
      textures.commit();
      useEditorStore.setState(editorNext);
      history.commit();
    } catch {
      // Reverse state and resources already exist. Always restore all surfaces,
      // even if an application subscriber throws while being notified.
      try {
        textures.rollback();
      } finally {
        try {
          useEditorStore.setState(editorRollback);
        } finally {
          history.rollback();
        }
      }
      throw new Error(APPLY_ERROR);
    }
    disposePsdReimport(preview);
    return { updatedCount: changedIds.size };
  } catch {
    disposePsdReimport(preview);
    throw new Error(APPLY_ERROR);
  }
}
