import type {
  InterpolationType,
  SceneBlend,
  SceneBlendMode,
  SceneId,
} from "@vivi2d/core/types";
import {
  createSceneBlend,
  removeSceneBlend,
  updateSceneBlend,
} from "@vivi2d/editor-core/scene-blend-command";
import { create } from "zustand";
import { withStandardMiddleware } from "./_middleware";
import { useEditorStore } from "./editorStore";
import { mutateProject } from "./projectMutator";

interface SceneBlendActions {
  createSceneBlend: (
    sourceSceneId: SceneId,
    targetSceneId: SceneId,
    options?: {
      mode?: SceneBlendMode;
      transitionFrames?: number;
      easing?: InterpolationType;
    },
  ) => string;

  removeSceneBlend: (blendId: string) => void;

  updateSceneBlend: (
    blendId: string,
    updates: Partial<Pick<SceneBlend, "mode" | "transitionFrames" | "easing">>,
  ) => void;
}

function hasProject(): boolean {
  return Boolean(useEditorStore.getState().project);
}

export const useSceneBlendStore = create<SceneBlendActions>()(
  withStandardMiddleware<SceneBlendActions>(
    () => ({
      createSceneBlend: (sourceSceneId, targetSceneId, options = {}) => {
        if (!hasProject()) return "";
        const id = crypto.randomUUID();
        mutateProject((p) => {
          createSceneBlend(
            p,
            {
              sourceSceneId,
              targetSceneId,
              ...options,
            },
            () => id,
          );
        });
        return id;
      },

      removeSceneBlend: (blendId) => {
        if (!hasProject()) return;
        mutateProject((p) => {
          removeSceneBlend(p, blendId);
        });
      },

      updateSceneBlend: (blendId, updates) => {
        if (!hasProject()) return;
        mutateProject((p) => {
          updateSceneBlend(p, blendId, updates);
        });
      },
    }),
    { name: "SceneBlendStore", persistEnabled: false },
  ),
);
