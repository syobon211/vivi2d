import {
  addOffscreenSourceLayer,
  addOffscreenTarget,
  removeOffscreenSourceLayer,
  removeOffscreenTarget,
  setOffscreenBufferSize,
} from "@vivi2d/editor-core/offscreen-command";
import { create } from "zustand";
import { withStandardMiddleware } from "./_middleware";
import { useEditorStore } from "./editorStore";
import { mutateProject } from "./projectMutator";

interface OffscreenActions {
  addOffscreenTarget: (width: number, height: number) => string;

  removeOffscreenTarget: (targetId: string) => void;

  addSourceLayer: (targetId: string, layerId: string) => void;

  removeSourceLayer: (targetId: string, layerId: string) => void;

  setBufferSize: (targetId: string, width: number, height: number) => void;
}

function hasProject(): boolean {
  return Boolean(useEditorStore.getState().project);
}

export const useOffscreenStore = create<OffscreenActions>()(
  withStandardMiddleware<OffscreenActions>(
    () => ({
      addOffscreenTarget: (width, height) => {
        if (!hasProject()) return "";
        const id = crypto.randomUUID();
        mutateProject((project) => {
          addOffscreenTarget(project, { width, height }, () => id);
        });
        return id;
      },

      removeOffscreenTarget: (targetId) => {
        if (!hasProject()) return;
        mutateProject((project) => {
          removeOffscreenTarget(project, targetId);
        });
      },

      addSourceLayer: (targetId, layerId) => {
        if (!hasProject()) return;
        mutateProject((project) => {
          addOffscreenSourceLayer(project, targetId, layerId);
        });
      },

      removeSourceLayer: (targetId, layerId) => {
        if (!hasProject()) return;
        mutateProject((project) => {
          removeOffscreenSourceLayer(project, targetId, layerId);
        });
      },

      setBufferSize: (targetId, width, height) => {
        if (!hasProject()) return;
        mutateProject((project) => {
          setOffscreenBufferSize(project, targetId, width, height);
        });
      },
    }),
    { name: "OffscreenStore", persistEnabled: false },
  ),
);
