import type { SkinWeight } from "@vivi2d/core/types";
import { create } from "zustand";
import {
  type AccessoryFollowRigApplyResult,
  applyAccessoryFollowRig,
} from "@vivi2d/editor-core/accessory-follow-rig";
import {
  autoComputeSkinWeights,
  bindSkinToBones,
  normalizeSkinWeights,
  paintSkinWeight,
  paintSkinWeightBrush,
  setSkinVertexWeights,
  unbindSkin,
} from "@vivi2d/editor-core/skin-command";
import { withStandardMiddleware } from "./_middleware";
import { useEditorStore } from "./editorStore";
import { mutateProject } from "./projectMutator";

interface SkinActions {
  bindSkin: (meshId: string, boneIds: string[]) => void;

  unbindSkin: (meshId: string) => void;

  setVertexWeights: (meshId: string, vertexIndex: number, weights: SkinWeight[]) => void;

  paintWeight: (
    meshId: string,
    vertexIndex: number,
    boneId: string,
    weight: number,
  ) => void;

  normalizeAllWeights: (meshId: string) => void;

  autoWeights: (meshId: string) => void;

  paintWeightBrush: (
    meshId: string,
    cx: number,
    cy: number,
    radius: number,
    boneId: string,
    strength: number,
    mode: "add" | "subtract" | "smooth",
  ) => void;
  applyAccessoryFollowRig: (
    meshId: string,
    boneId: string,
  ) => AccessoryFollowRigApplyResult | { status: "rejected"; reason: "noProject" };
}

export const useSkinStore = create<SkinActions>()(
  withStandardMiddleware<SkinActions>(
    () => ({
      bindSkin: (meshId, boneIds) =>
        mutateProject((project) => {
          bindSkinToBones(project, meshId, boneIds);
        }),

      unbindSkin: (meshId) =>
        mutateProject((project) => {
          unbindSkin(project, meshId);
        }),

      setVertexWeights: (meshId, vertexIndex, weights) =>
        mutateProject((project) => {
          setSkinVertexWeights(project, meshId, vertexIndex, weights);
        }),

      paintWeight: (meshId, vertexIndex, boneId, weight) =>
        mutateProject((project) => {
          paintSkinWeight(project, meshId, vertexIndex, boneId, weight);
        }),

      normalizeAllWeights: (meshId) =>
        mutateProject((project) => {
          normalizeSkinWeights(project, meshId);
        }),

      autoWeights: (meshId) =>
        mutateProject((project) => {
          autoComputeSkinWeights(project, meshId);
        }),

      paintWeightBrush: (meshId, cx, cy, radius, boneId, strength, mode) =>
        mutateProject((project) => {
          paintSkinWeightBrush(project, meshId, cx, cy, radius, boneId, strength, mode);
        }),

      applyAccessoryFollowRig: (meshId, boneId) => {
        const project = useEditorStore.getState().project;
        if (!project) {
          return { status: "rejected" as const, reason: "noProject" as const };
        }

        let result: AccessoryFollowRigApplyResult = {
          status: "rejected",
          reason: "meshNotFound",
        };

        mutateProject((draft) => {
          result = applyAccessoryFollowRig(draft, meshId, boneId);
        }, `skin:accessory-follow:${meshId}`);

        return result;
      },
    }),
    { name: "SkinStore", persistEnabled: false },
  ),
);
