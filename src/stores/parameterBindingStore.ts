import type {
  BindingTarget,
  ParameterBindingPoint,
} from "@vivi2d/core/types";
import {
  addParameterBinding,
  blendParameterBindingPoints,
  canCreateParameterBindingTarget,
  getParameterBindingPoints,
  removeParameterBinding,
  removeParameterBindingPoint,
  removeParameterBindingsByParameter,
  replaceParameterBindingPoints,
  replaceParameterBindingPointsMirrored,
  setParameterBindingPoint,
} from "@vivi2d/editor-core/parameter-binding-command";
import { create } from "zustand";
import { withStandardMiddleware } from "./_middleware";
import { useEditorStore } from "./editorStore";
import { mutateProject } from "./projectMutator";

export {
  evaluateBindingsAdditive,
  interpolateBindingPoints,
} from "@vivi2d/core/parameter-binding-eval";

interface ParameterBindingActions {
  addBinding: (parameterId: string, target: BindingTarget) => string;

  removeBinding: (bindingId: string) => void;

  removeBindingsByParameter: (parameterId: string) => void;

  setBindingPoint: (bindingId: string, paramValue: number, targetValue: number) => void;

  removeBindingPoint: (bindingId: string, paramValue: number) => void;

  copyBindingPoints: (bindingId: string) => void;

  pasteBindingPoints: (bindingId: string) => void;

  pasteBindingPointsMirrored: (bindingId: string) => void;

  blendBindingPoints: (bindingId: string, factor: number) => void;
}

let bindingPointClipboard: ParameterBindingPoint[] | null = null;

export function getBindingPointClipboard(): ParameterBindingPoint[] | null {
  return bindingPointClipboard;
}

export function clearBindingPointClipboard(): void {
  bindingPointClipboard = null;
}

export const useParameterBindingStore = create<ParameterBindingActions>()(
  withStandardMiddleware<ParameterBindingActions>(
    () => ({
      addBinding: (parameterId, target) => {
        if (!canCreateParameterBindingTarget(target)) return "";
        if (!useEditorStore.getState().project) return "";
        const id = crypto.randomUUID();
        mutateProject((project) => {
          addParameterBinding(project, parameterId, target, () => id);
        });
        return id;
      },

      removeBinding: (bindingId) =>
        mutateProject((project) => {
          removeParameterBinding(project, bindingId);
        }),

      removeBindingsByParameter: (parameterId) =>
        mutateProject((project) => {
          removeParameterBindingsByParameter(project, parameterId);
        }),

      setBindingPoint: (bindingId, paramValue, targetValue) =>
        mutateProject((project) => {
          setParameterBindingPoint(project, bindingId, paramValue, targetValue);
        }),

      removeBindingPoint: (bindingId, paramValue) =>
        mutateProject((project) => {
          removeParameterBindingPoint(project, bindingId, paramValue);
        }),

      copyBindingPoints: (bindingId) => {
        const project = useEditorStore.getState().project;
        if (!project) return;
        const bindingPoints = getParameterBindingPoints(project, bindingId);
        if (!bindingPoints) return;
        bindingPointClipboard = bindingPoints;
      },

      pasteBindingPoints: (bindingId) =>
        mutateProject((project) => {
          if (!bindingPointClipboard) return;
          replaceParameterBindingPoints(project, bindingId, bindingPointClipboard);
        }),

      pasteBindingPointsMirrored: (bindingId) =>
        mutateProject((project) => {
          if (!bindingPointClipboard) return;
          replaceParameterBindingPointsMirrored(
            project,
            bindingId,
            bindingPointClipboard,
          );
        }),

      blendBindingPoints: (bindingId, factor) =>
        mutateProject((project) => {
          if (!bindingPointClipboard) return;
          blendParameterBindingPoints(
            project,
            bindingId,
            bindingPointClipboard,
            factor,
          );
        }),
    }),
    { name: "ParameterBindingStore", persistEnabled: false },
  ),
);
