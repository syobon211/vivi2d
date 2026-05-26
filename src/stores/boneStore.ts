import type { BoneNode } from "@vivi2d/core/types";
import {
  addBone as addBoneCommand,
  addRootBone as addRootBoneCommand,
  removeBone as removeBoneCommand,
  reparentBone as reparentBoneCommand,
  setBoneAngle as setBoneAngleCommand,
  setBoneLength as setBoneLengthCommand,
  setBonePosition as setBonePositionCommand,
  setBoneScale as setBoneScaleCommand,
} from "@vivi2d/editor-core/bone-command";
import { create } from "zustand";
import { withStandardMiddleware } from "./_middleware";
import { mutateProject } from "./projectMutator";
import { useSelectionStore } from "./selectionStore";

interface BoneActions {
  addBone: (parentId: string, name: string, x: number, y: number) => void;

  addRootBone: (
    name: string,
    x: number,
    y: number,
    metadata?: Pick<
      BoneNode,
      "managedTag" | "managedSignature" | "managedSourceFingerprint"
    >,
  ) => string;

  setBonePosition: (boneId: string, x: number, y: number, mergeKey?: string) => void;

  setBoneAngle: (boneId: string, angle: number, mergeKey?: string) => void;

  setBoneScale: (
    boneId: string,
    scaleX: number,
    scaleY: number,
    mergeKey?: string,
  ) => void;

  setBoneLength: (boneId: string, length: number, mergeKey?: string) => void;

  reparentBone: (boneId: string, newParentBoneId: string | null) => void;

  removeBone: (boneId: string) => void;
}

export const useBoneStore = create<BoneActions>()(
  withStandardMiddleware<BoneActions>(
    () => ({
      addBone: (parentId, name, x, y) =>
        mutateProject((project) => {
          addBoneCommand(project, parentId, name, x, y);
        }),

      addRootBone: (name, x, y, metadata) => {
        const boneId = crypto.randomUUID();
        mutateProject((project) => {
          addRootBoneCommand(project, name, x, y, metadata, () => boneId);
        });
        return boneId;
      },

      setBonePosition: (boneId, x, y, mergeKey) =>
        mutateProject((project) => {
          setBonePositionCommand(project, boneId, x, y);
        }, mergeKey),

      setBoneAngle: (boneId, angle, mergeKey) =>
        mutateProject((project) => {
          setBoneAngleCommand(project, boneId, angle);
        }, mergeKey),

      setBoneScale: (boneId, scaleX, scaleY, mergeKey) =>
        mutateProject((project) => {
          setBoneScaleCommand(project, boneId, scaleX, scaleY);
        }, mergeKey),

      setBoneLength: (boneId, length, mergeKey) =>
        mutateProject((project) => {
          setBoneLengthCommand(project, boneId, length);
        }, mergeKey),

      reparentBone: (boneId, newParentBoneId) =>
        mutateProject((project) => {
          reparentBoneCommand(project, boneId, newParentBoneId);
        }),

      removeBone: (boneId) => {
        const shouldClearSelection =
          useSelectionStore.getState().selectedLayerId === boneId;
        let removed = false;
        mutateProject((project) => {
          removed = removeBoneCommand(project, boneId);
        });
        if (removed && shouldClearSelection) {
          useSelectionStore.getState().selectLayer(null);
        }
      },
    }),
    { name: "BoneStore", persistEnabled: false },
  ),
);
