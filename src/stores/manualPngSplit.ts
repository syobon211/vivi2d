import { flattenLayers, findLayerById } from "@vivi2d/core/layer-utils";
import type { ProjectData } from "@vivi2d/core/types";
import { applyManualPngSplitPlan } from "@vivi2d/editor-core/manual-png-split-command";
import {
  buildManualPngSplitLayerEntries,
  canSplitManualPngLayer,
  type ManualPngSplitMask,
} from "@/lib/manual-png-layer-split";
import { t as tGlobal, type I18nKey } from "@/lib/i18n";
import { createManualLayerSplitSourceFingerprint } from "@/lib/manual-layer-split/source-fingerprint";
import {
  getTexture,
  hashTextureCanvas,
  promoteDraftTextures,
  deleteTextures,
  type TextureHistoryEffect,
} from "@/lib/texture-store";
import { useEditorStore } from "@/stores/editorStore";
import { _resetMergeTimer, useHistoryStore } from "@/stores/historyStore";
import { useNotificationStore } from "@/stores/notificationStore";
import { useSelectionStore } from "@/stores/selectionStore";

export interface ManualPngSplitRequest {
  sourceLayerId: string;
  masks: ManualPngSplitMask[];
}

function notifyWarning(messageKey: I18nKey): void {
  useNotificationStore
    .getState()
    .addNotification("warning", tGlobal(messageKey));
}

function collectManualSplitBackReferenceRevisions(
  project: ProjectData,
  sourceLayerId: string,
): Record<string, string> {
  const revisions: Record<string, string> = {};
  for (const layer of flattenLayers(project.layers)) {
    if (layer.manualSplitSourceLayerId !== sourceLayerId) continue;
    revisions[`node:${layer.id}`] = [
      layer.manualSplitSourceFingerprint ?? "",
      layer.manualSplitLayerId ?? "",
      layer.managedSignature ?? "",
      layer.managedSourceFingerprint ?? "",
    ].join("|");
  }
  for (const [layerId, skin] of Object.entries(project.skins ?? {})) {
    if (skin.manualSplitSourceLayerId !== sourceLayerId) continue;
    revisions[`skin:${layerId}`] = [
      skin.manualSplitSourceFingerprint ?? "",
      skin.manualSplitLayerId ?? "",
      skin.managedSignature ?? "",
      skin.managedSourceFingerprint ?? "",
    ].join("|");
  }
  for (const controller of project.ikControllers ?? []) {
    if (controller.manualSplitSourceLayerId !== sourceLayerId) continue;
    revisions[`ik:${controller.id}`] = [
      controller.manualSplitSourceFingerprint ?? "",
      controller.manualSplitLayerId ?? "",
      controller.managedSignature ?? "",
      controller.managedSourceFingerprint ?? "",
    ].join("|");
  }
  for (const group of project.physicsGroups ?? []) {
    if (group.manualSplitSourceLayerId !== sourceLayerId) continue;
    revisions[`physics:${group.id}`] = [
      group.manualSplitSourceFingerprint ?? "",
      group.manualSplitLayerId ?? "",
      group.managedSignature ?? "",
      group.managedSourceFingerprint ?? "",
    ].join("|");
  }
  return revisions;
}

function recordsEqual(left: Record<string, string>, right: Record<string, string>): boolean {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key, index) => key === rightKeys[index] && left[key] === right[key]);
}

export function splitManualPngLayer(request: ManualPngSplitRequest): boolean {
  const project = useEditorStore.getState().project;
  if (!project) return false;

  if (request.masks.length < 2) {
    notifyWarning("manualPngSplit.needAtLeastTwoMasks");
    return false;
  }

  const sourceLayer = findLayerById(project.layers, request.sourceLayerId);
  if (!canSplitManualPngLayer(sourceLayer)) {
    notifyWarning("manualPngSplit.noUsableMasks");
    return false;
  }

  const sourceCanvas = getTexture(sourceLayer.id);
  if (!sourceCanvas) {
    notifyWarning("manualPngSplit.noUsableMasks");
    return false;
  }
  const baseManagedRevisions = collectManualSplitBackReferenceRevisions(
    project,
    sourceLayer.id,
  );
  const sourceFingerprint = createManualLayerSplitSourceFingerprint(
    sourceLayer,
    sourceCanvas,
  );

  const { entries, group } = buildManualPngSplitLayerEntries(
    project,
    sourceLayer,
    sourceCanvas,
    request.masks,
    { sourceFingerprint },
  );
  if (!group || entries.length < 2) {
    notifyWarning("manualPngSplit.noUsableMasks");
    return false;
  }

  const currentSourceCanvas = getTexture(sourceLayer.id);
  const currentProject = useEditorStore.getState().project;
  if (
    !currentProject ||
    !currentSourceCanvas ||
    createManualLayerSplitSourceFingerprint(sourceLayer, currentSourceCanvas) !==
      sourceFingerprint ||
    !recordsEqual(
      baseManagedRevisions,
      collectManualSplitBackReferenceRevisions(currentProject, sourceLayer.id),
    )
  ) {
    notifyWarning("manualPngSplit.noUsableMasks");
    return false;
  }

  const selectedLayerId = entries[0]!.layer.id;
  const promotedTextures = entries.map((entry) => ({
    textureId: entry.layer.id,
    canvas: entry.canvas,
    hash: hashTextureCanvas(entry.canvas),
  }));
  const textureEffect: TextureHistoryEffect = {
    kind: "texture",
    rendererInvalidation: "projectStructureVersion",
    undo: {
      createdTextureIds: promotedTextures.map((entry) => entry.textureId),
      restoredTextures: [],
      expectedCurrentHash: Object.fromEntries(
        promotedTextures.map((entry) => [entry.textureId, entry.hash]),
      ),
    },
    redo: {
      promotedTextures,
      expectedCurrentHash: Object.fromEntries(
        promotedTextures.map((entry) => [entry.textureId, null]),
      ),
    },
  };

  const nextProject = structuredClone(project);
  applyManualPngSplitPlan(nextProject, {
    sourceLayerId: sourceLayer.id,
    group,
    selectedLayerId,
  });

  const editorBefore = useEditorStore.getState();
  const historyBefore = useHistoryStore.getState();
  try {
    promoteDraftTextures(promotedTextures);
    useHistoryStore.getState().pushState(project, undefined, [textureEffect]);
    useEditorStore.setState((state) => {
      state.project = nextProject;
      state.projectStructureVersion += 1;
    });
    useSelectionStore.getState().selectLayer(selectedLayerId);
  } catch (error) {
    deleteTextures(promotedTextures.map((entry) => entry.textureId));
    useEditorStore.setState({
      project: editorBefore.project,
      projectVersion: editorBefore.projectVersion,
      projectStructureVersion: editorBefore.projectStructureVersion,
    });
    useHistoryStore.setState({
      undoStack: historyBefore.undoStack,
      redoStack: historyBefore.redoStack,
    });
    _resetMergeTimer();
    const message = error instanceof Error ? error.message : String(error);
    useNotificationStore
      .getState()
      .addNotification("error", `${tGlobal("notify.actionFailed")}: ${message}`);
    return false;
  }

  useNotificationStore
    .getState()
    .addNotification("info", tGlobal("manualPngSplit.created"));
  return true;
}
