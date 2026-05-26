import { findLayerById } from "@vivi2d/core/layer-utils";
import type { SoftRegionPresetId } from "@vivi2d/editor-core/soft-region-helper";
import { create } from "zustand";
import { withStandardMiddleware } from "./_middleware";
import { useEditorStore } from "./editorStore";
import {
  addPinToState,
  applySoftRegionHelperToState,
  beginDragState,
  cancelDragState,
  clearPinsForMeshInState,
  commitDragState,
  createGroupInState,
  INITIAL_PUPPET_WARP_STATE,
  linkMirrorPinsInState,
  type MeshEditTarget,
  normalizeSymmetryTolerance,
  type PuppetWarpDragState,
  type PuppetWarpMode,
  type PuppetWarpPin,
  type PuppetWarpPinKind,
  type PuppetWarpState,
  removeGroupFromState,
  removePinsFromState,
  replacePinAtVertexInState,
  type SoftRegionHelperApplyResult,
  setPinFalloffInState,
  setSelectedPinsInState,
  togglePinSelectionInState,
  updateDragState,
} from "@vivi2d/editor-core/puppet-warp-model";

export type {
  MeshEditTarget,
  PuppetWarpDragState,
  PuppetWarpFalloffCurve,
  PuppetWarpGroup,
  PuppetWarpMode,
  PuppetWarpPin,
  PuppetWarpPinKind,
  SoftRegionHelperApplyResult,
} from "@vivi2d/editor-core/puppet-warp-model";

interface PuppetWarpActions {
  setMode: (mode: PuppetWarpMode) => void;
  setEditTarget: (target: MeshEditTarget) => void;
  addPin: (
    meshId: string,
    vertexIndex: number,
    kind: PuppetWarpPinKind,
    partial?: Partial<
      Pick<PuppetWarpPin, "radius" | "strength" | "curve" | "groupId" | "mirrorPinId">
    >,
  ) => string | null;
  replacePinAtVertex: (
    meshId: string,
    vertexIndex: number,
    kind: PuppetWarpPinKind,
    partial?: Partial<
      Pick<PuppetWarpPin, "radius" | "strength" | "curve" | "groupId" | "mirrorPinId">
    >,
  ) => string;
  removePins: (pinIds: string[]) => PuppetWarpDragState | null;
  clearPinsForMesh: (meshId: string) => void;
  createGroup: (meshId: string, pinIds: string[], name: string) => string | null;
  applySoftRegionHelper: (
    meshId: string,
    selectedVertexIndices: number[],
    presetId: SoftRegionPresetId,
  ) => SoftRegionHelperApplyResult;
  removeGroup: (groupId: string) => void;
  setSelectedPins: (pinIds: string[]) => void;
  togglePinSelection: (pinId: string) => void;
  setPinFalloff: (
    pinIds: string[],
    patch: Partial<Pick<PuppetWarpPin, "radius" | "strength" | "curve">>,
  ) => void;
  setSymmetryEnabled: (enabled: boolean) => void;
  setSymmetryTolerance: (value: number) => void;
  linkMirrorPins: (pinId: string, mirrorPinId: string) => void;
  beginDrag: (
    meshId: string,
    baseVertices: number[],
    draggedPinIds: string[],
    startWorldX: number,
    startWorldY: number,
    options?: Partial<
      Pick<
        PuppetWarpDragState,
        "editTarget" | "clipId" | "frame" | "restoreVertices" | "restoreInterpolation"
      >
    >,
  ) => void;
  updateDrag: (lastAppliedVertices: number[]) => void;
  cancelDrag: () => PuppetWarpDragState | null;
  commitDrag: () => void;
  invalidateMesh: (meshId: string) => void;
}

export type PuppetWarpStore = PuppetWarpState & PuppetWarpActions;

export const usePuppetWarpStore = create<PuppetWarpStore>()(
  withStandardMiddleware<PuppetWarpStore>(
    (set, get) => ({
      ...INITIAL_PUPPET_WARP_STATE,

      setMode: (mode) => set({ mode }),

      setEditTarget: (editTarget) => set({ editTarget }),

      addPin: (meshId, vertexIndex, kind, partial) => {
        const { state, pinId } = addPinToState(get(), meshId, vertexIndex, kind, partial);
        if (state !== get()) set(state);
        return pinId;
      },

      replacePinAtVertex: (meshId, vertexIndex, kind, partial) => {
        const { state, pinId } = replacePinAtVertexInState(
          get(),
          meshId,
          vertexIndex,
          kind,
          partial,
        );
        set(state);
        return pinId;
      },

      removePins: (pinIds) => {
        const { state, cancelledDrag } = removePinsFromState(get(), pinIds);
        set(state);
        return cancelledDrag;
      },

      clearPinsForMesh: (meshId) =>
        set((state) => clearPinsForMeshInState(state, meshId)),

      createGroup: (meshId, pinIds, name) => {
        const { state, groupId } = createGroupInState(get(), meshId, pinIds, name);
        if (state !== get()) set(state);
        return groupId;
      },

      applySoftRegionHelper: (meshId, selectedVertexIndices, presetId) => {
        const project = useEditorStore.getState().project;
        const mesh = project ? findLayerById(project.layers, meshId) : null;
        if (!mesh || mesh.kind !== "viviMesh") {
          return { status: "rejected", reason: "invalidVertexSelection" };
        }
        let nextResult: SoftRegionHelperApplyResult = {
          status: "rejected",
          reason: "tooFewVertices",
        };
        set((state) => {
          const { state: nextState, result } = applySoftRegionHelperToState(state, {
            meshId,
            meshVertices: mesh.mesh.vertices,
            selectedVertexIndices,
            presetId,
          });
          nextResult = result;
          return nextState;
        });
        return nextResult;
      },

      removeGroup: (groupId) => set((state) => removeGroupFromState(state, groupId)),

      setSelectedPins: (pinIds) => set((state) => setSelectedPinsInState(state, pinIds)),

      togglePinSelection: (pinId) =>
        set((state) => togglePinSelectionInState(state, pinId)),

      setPinFalloff: (pinIds, patch) =>
        set((state) => setPinFalloffInState(state, pinIds, patch)),

      setSymmetryEnabled: (enabled) => set({ symmetryEnabled: enabled }),

      setSymmetryTolerance: (value) =>
        set({
          symmetryTolerance: normalizeSymmetryTolerance(value),
        }),

      linkMirrorPins: (pinId, mirrorPinId) =>
        set((state) => linkMirrorPinsInState(state, pinId, mirrorPinId)),

      beginDrag: (
        meshId,
        baseVertices,
        draggedPinIds,
        startWorldX,
        startWorldY,
        options,
      ) =>
        set((state) =>
          beginDragState(
            state,
            meshId,
            baseVertices,
            draggedPinIds,
            startWorldX,
            startWorldY,
            options,
          ),
        ),

      updateDrag: (lastAppliedVertices) =>
        set((state) => updateDragState(state, lastAppliedVertices)),

      cancelDrag: () => {
        const { state, dragState } = cancelDragState(get());
        set(state);
        return dragState;
      },

      commitDrag: () => set((state) => commitDragState(state)),

      invalidateMesh: (meshId) => {
        get().clearPinsForMesh(meshId);
      },
    }),
    { name: "PuppetWarpStore", persistEnabled: false },
  ),
);
