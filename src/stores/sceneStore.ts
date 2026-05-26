import {
  createScene as createSceneCommand,
  deleteScene as deleteSceneCommand,
  duplicateScene as duplicateSceneCommand,
  renameScene as renameSceneCommand,
} from "@vivi2d/editor-core/scene-command";
import { create } from "zustand";
import { useI18nStore } from "@/lib/i18n";
import { withStandardMiddleware } from "./_middleware";
import { useEditorStore } from "./editorStore";
import { mutateProject } from "./projectMutator";

interface SceneActions {
  createScene: (name: string) => string;

  deleteScene: (sceneId: string) => void;

  duplicateScene: (sceneId: string) => string;

  renameScene: (sceneId: string, name: string) => void;
}

function hasProject(): boolean {
  return Boolean(useEditorStore.getState().project);
}

export const useSceneStore = create<SceneActions>()(
  withStandardMiddleware<SceneActions>(
    () => ({
      createScene: (name) => {
        if (!hasProject()) return "";
        const id = crypto.randomUUID();
        mutateProject((project) => {
          createSceneCommand(project, name, () => id);
        });
        return id;
      },

      deleteScene: (sceneId) => {
        if (!hasProject()) return;
        mutateProject((project) => {
          deleteSceneCommand(project, sceneId);
        });
      },

      duplicateScene: (sceneId) => {
        if (!hasProject()) return "";
        let newId = "";
        const copySuffix =
          useI18nStore.getState().locale === "ja" ? "コピー" : "copy";
        mutateProject((project) => {
          newId = duplicateSceneCommand(
            project,
            sceneId,
            copySuffix,
            () => crypto.randomUUID(),
          );
        });
        return newId;
      },

      renameScene: (sceneId, name) => {
        if (!hasProject()) return;
        mutateProject((project) => {
          renameSceneCommand(project, sceneId, name);
        });
      },
    }),
    { name: "SceneStore", persistEnabled: false },
  ),
);
