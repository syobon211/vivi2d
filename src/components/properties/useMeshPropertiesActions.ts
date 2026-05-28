import {
  mergeVertices,
  mirrorMesh,
  retriangulateMesh,
} from "@vivi2d/core/mesh-operations";
import { findMirroredVertexIndex } from "@vivi2d/core/mesh-warp-utils";
import type { LayerNode } from "@vivi2d/core/types";
import { useCallback, useState } from "react";
import type { AccessoryFollowRigApplyResult } from "@vivi2d/editor-core/accessory-follow-rig";
import type { SoftRegionPresetId } from "@vivi2d/editor-core/soft-region-helper";
import { useEditorStore } from "@/stores/editorStore";
import type {
  PuppetWarpPin,
  SoftRegionHelperApplyResult,
} from "@/stores/puppetWarpStore";
import { usePuppetWarpStore } from "@/stores/puppetWarpStore";

type SetMeshData = ReturnType<typeof useEditorStore.getState>["setMeshData"];

export function useMeshPropertiesActions({
  layer,
  selectedVertices,
  clearSelection,
  setMeshData,
  applyAccessoryFollow,
  effectiveAccessoryFollowBoneId,
  applySoftRegionHelper,
  softRegionPreset,
  groupsLength,
  selectedPinIds,
}: {
  layer: LayerNode;
  selectedVertices: number[];
  clearSelection: () => void;
  setMeshData: SetMeshData;
  applyAccessoryFollow: (
    meshId: string,
    boneId: string,
  ) => AccessoryFollowRigApplyResult | { status: "rejected"; reason: "noProject" };
  effectiveAccessoryFollowBoneId: string;
  applySoftRegionHelper: (
    meshId: string,
    selectedVertexIndices: number[],
    presetId: SoftRegionPresetId,
  ) => SoftRegionHelperApplyResult;
  softRegionPreset: SoftRegionPresetId;
  groupsLength: number;
  selectedPinIds: string[];
}) {
  const [accessoryFollowMessage, setAccessoryFollowMessage] = useState<string | null>(
    null,
  );
  const [softRegionMessage, setSoftRegionMessage] = useState<string | null>(null);

  const handleMerge = useCallback(() => {
    if (layer.kind !== "viviMesh") return;
    const result = mergeVertices(layer.mesh, selectedVertices);
    if (result) {
      setMeshData(layer.id, result);
      clearSelection();
    }
  }, [clearSelection, layer, selectedVertices, setMeshData]);

  const handleMirrorX = useCallback(() => {
    if (layer.kind !== "viviMesh") return;
    setMeshData(layer.id, mirrorMesh(layer.mesh, "x", layer.width, layer.height));
  }, [layer, setMeshData]);

  const handleMirrorY = useCallback(() => {
    if (layer.kind !== "viviMesh") return;
    setMeshData(layer.id, mirrorMesh(layer.mesh, "y", layer.width, layer.height));
  }, [layer, setMeshData]);

  const handleRetriangulate = useCallback(() => {
    if (layer.kind !== "viviMesh") return;
    setMeshData(layer.id, retriangulateMesh(layer.mesh, layer.width, layer.height));
  }, [layer, setMeshData]);

  const formatAccessoryFollowMessage = useCallback(
    (
      result: AccessoryFollowRigApplyResult | { status: "rejected"; reason: "noProject" },
    ) => {
      if (result.status === "created") return "Created a managed accessory follow rig.";
      if (result.status === "updated") return "Updated the managed accessory follow rig.";
      if (result.status === "replaced") {
        return "Replaced the managed accessory follow rig for the selected bone.";
      }
      switch (result.reason) {
        case "noProject":
          return "No project is loaded.";
        case "meshNotFound":
          return "Select a valid ViviMesh before creating accessory follow.";
        case "meshHasNoVertices":
          return "The selected mesh has no vertices to bind.";
        case "boneNotFound":
          return "Choose a valid target bone.";
        case "unmanagedSkinExists":
          return "This mesh already has a skin. Use Skin Properties to unbind it before creating accessory follow.";
        case "skinOwnedByOtherSystem":
          return "This mesh is owned by another managed skin helper.";
        default:
          return "Accessory follow rig could not be created.";
      }
    },
    [],
  );

  const handleApplyAccessoryFollow = useCallback(() => {
    if (!effectiveAccessoryFollowBoneId) return;
    const result = applyAccessoryFollow(layer.id, effectiveAccessoryFollowBoneId);
    setAccessoryFollowMessage(formatAccessoryFollowMessage(result));
  }, [
    applyAccessoryFollow,
    effectiveAccessoryFollowBoneId,
    formatAccessoryFollowMessage,
    layer.id,
  ]);

  const formatSoftRegionMessage = useCallback((result: SoftRegionHelperApplyResult) => {
    if (result.status === "created") return "Created a managed soft region helper.";
    if (result.status === "updated") return "Updated the managed soft region helper.";
    if (result.status !== "rejected") {
      return "Soft region helper could not be created.";
    }
    switch (result.reason) {
      case "tooFewVertices":
        return "Select at least three vertices before creating a soft region.";
      case "invalidVertexSelection":
        return "The selected vertices are not valid for this mesh.";
      case "selectionTooDegenerate":
        return "The selected region is too small or degenerate for a soft region helper.";
      case "occupiedByOtherPin":
        return "The planned soft region vertices already contain other pins. Clear or regroup them first.";
      default:
        return "Soft region helper could not be created.";
    }
  }, []);

  const handleApplySoftRegion = useCallback(() => {
    const result = applySoftRegionHelper(layer.id, selectedVertices, softRegionPreset);
    setSoftRegionMessage(formatSoftRegionMessage(result));
  }, [
    applySoftRegionHelper,
    formatSoftRegionMessage,
    layer.id,
    selectedVertices,
    softRegionPreset,
  ]);

  const createPinsFromSelectedVertices = useCallback(
    (kind: PuppetWarpPin["kind"]) => {
      if (layer.kind !== "viviMesh" || selectedVertices.length === 0) return;
      const store = usePuppetWarpStore.getState();
      const createdIds: string[] = [];
      for (const vertexIndex of selectedVertices) {
        const pinId = store.addPin(layer.id, vertexIndex, kind);
        if (!pinId) continue;
        createdIds.push(pinId);
        if (!store.symmetryEnabled) continue;
        const mirrorIndex = findMirroredVertexIndex(
          layer.mesh.vertices,
          vertexIndex,
          layer.width,
          store.symmetryTolerance,
        );
        if (mirrorIndex === null) continue;
        const mirrorId = store.addPin(layer.id, mirrorIndex, kind);
        if (!mirrorId) continue;
        store.linkMirrorPins(pinId, mirrorId);
        createdIds.push(mirrorId);
      }
      if (createdIds.length > 0) {
        store.setSelectedPins(createdIds);
      }
    },
    [layer, selectedVertices],
  );

  const handleCreateHandlePins = useCallback(() => {
    createPinsFromSelectedVertices("handle");
  }, [createPinsFromSelectedVertices]);

  const handleCreateAnchorPins = useCallback(() => {
    createPinsFromSelectedVertices("anchor");
  }, [createPinsFromSelectedVertices]);

  const handleCreateGroup = useCallback(() => {
    if (selectedPinIds.length === 0) return;
    const nextGroupNumber = groupsLength + 1;
    usePuppetWarpStore
      .getState()
      .createGroup(layer.id, selectedPinIds, `Warp Group ${nextGroupNumber}`);
  }, [groupsLength, layer.id, selectedPinIds]);

  const handleDeleteSelectedPins = useCallback(() => {
    if (selectedPinIds.length === 0) return;
    const cancelled = usePuppetWarpStore.getState().removePins(selectedPinIds);
    if (cancelled) {
      useEditorStore
        .getState()
        .setMeshVertices(
          cancelled.meshId,
          [...cancelled.baseVertices],
          `puppet-warp:${cancelled.meshId}`,
        );
    }
  }, [selectedPinIds]);

  const handleUpdateSelectedPins = useCallback(
    (patch: Partial<Pick<PuppetWarpPin, "radius" | "strength" | "curve">>) => {
      if (selectedPinIds.length === 0) return;
      usePuppetWarpStore.getState().setPinFalloff(selectedPinIds, patch);
    },
    [selectedPinIds],
  );

  return {
    accessoryFollowMessage,
    softRegionMessage,
    handleMerge,
    handleMirrorX,
    handleMirrorY,
    handleRetriangulate,
    handleApplyAccessoryFollow,
    handleApplySoftRegion,
    handleCreateHandlePins,
    handleCreateAnchorPins,
    handleCreateGroup,
    handleDeleteSelectedPins,
    handleUpdateSelectedPins,
  };
}
