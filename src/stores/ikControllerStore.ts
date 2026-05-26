import type { IKBoneConstraint, IKParameterMapping } from "@vivi2d/core/types";
import {
  addIKController,
  addIKParameterMapping,
  applyIKBendProfile,
  removeIKController,
  removeIKParameterMapping,
  setIKInfluence,
  setIKMaxIterations,
  setIKPoleTarget,
  setIKTarget,
  type LimbBendProfileId,
} from "@vivi2d/editor-core/ik-controller-command";
import { create } from "zustand";
import { withStandardMiddleware } from "./_middleware";
import { useEditorStore } from "./editorStore";
import { mutateProject } from "./projectMutator";

interface IKControllerActions {
  addIKController: (
    name: string,
    solverType: "twoBone" | "ccd",
    boneChain: IKBoneConstraint[],
  ) => string;

  removeIKController: (controllerId: string) => void;

  setTarget: (controllerId: string, x: number, y: number) => void;

  setPoleTarget: (controllerId: string, x: number, y: number) => void;

  setInfluence: (controllerId: string, influence: number) => void;

  setMaxIterations: (controllerId: string, maxIterations: number) => void;

  addParameterMapping: (controllerId: string, mapping: IKParameterMapping) => void;

  removeParameterMapping: (controllerId: string, index: number) => void;

  applyBendProfile: (controllerId: string, profileId: LimbBendProfileId) => void;
}

export const useIKControllerStore = create<IKControllerActions>()(
  withStandardMiddleware<IKControllerActions>(
    () => ({
      addIKController: (name, solverType, boneChain) => {
        if (!useEditorStore.getState().project) return "";
        const id = crypto.randomUUID();
        mutateProject((project) => {
          addIKController(project, { name, solverType, boneChain }, () => id);
        });
        return id;
      },

      removeIKController: (controllerId) =>
        mutateProject((project) => {
          removeIKController(project, controllerId);
        }),

      setTarget: (controllerId, x, y) =>
        mutateProject((project) => {
          setIKTarget(project, controllerId, x, y);
        }),

      setPoleTarget: (controllerId, x, y) =>
        mutateProject((project) => {
          setIKPoleTarget(project, controllerId, x, y);
        }),

      setInfluence: (controllerId, influence) =>
        mutateProject((project) => {
          setIKInfluence(project, controllerId, influence);
        }),

      setMaxIterations: (controllerId, maxIterations) =>
        mutateProject((project) => {
          setIKMaxIterations(project, controllerId, maxIterations);
        }),

      addParameterMapping: (controllerId, mapping) =>
        mutateProject((project) => {
          addIKParameterMapping(project, controllerId, mapping);
        }),

      removeParameterMapping: (controllerId, index) =>
        mutateProject((project) => {
          removeIKParameterMapping(project, controllerId, index);
        }),

      applyBendProfile: (controllerId, profileId) =>
        mutateProject((project) => {
          applyIKBendProfile(project, controllerId, profileId);
        }),
    }),
    { name: "IKControllerStore", persistEnabled: false },
  ),
);
