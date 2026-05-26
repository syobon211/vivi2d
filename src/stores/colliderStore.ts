import type { ColliderShape, LayerId } from "@vivi2d/core/types";
import {
  addCircleCollider as addCircleColliderCommand,
  addMeshCollider as addMeshColliderCommand,
  addMeshCollidersFromSelection as addMeshCollidersFromSelectionCommand,
  addRectCollider as addRectColliderCommand,
  removeCollider as removeColliderCommand,
  renameCollider as renameColliderCommand,
  setColliderTag,
  toggleCollider as toggleColliderCommand,
  updateColliderShape,
} from "@vivi2d/editor-core/collider-command";
import { create } from "zustand";
import { withStandardMiddleware } from "./_middleware";
import { useEditorStore } from "./editorStore";
import { mutateProject } from "./projectMutator";

interface ColliderState {
  selectedColliderId: string | null;
}

interface ColliderActions {
  selectCollider: (id: string | null) => void;

  addRectCollider: (
    name: string,
    x: number,
    y: number,
    width: number,
    height: number,
  ) => string;

  addCircleCollider: (name: string, x: number, y: number, radius: number) => string;

  addMeshCollider: (name: string, meshId: LayerId) => string;

  removeCollider: (colliderId: string) => void;

  toggleCollider: (colliderId: string) => void;

  renameCollider: (colliderId: string, name: string) => void;

  setTag: (colliderId: string, tag: string | undefined) => void;

  updateShape: (colliderId: string, shape: Partial<ColliderShape>) => void;

  addMeshCollidersFromSelection: (meshIds: LayerId[]) => number;
}

function hasProject(): boolean {
  return Boolean(useEditorStore.getState().project);
}

export const useColliderStore = create<ColliderState & ColliderActions>()(
  withStandardMiddleware<ColliderState & ColliderActions>(
    (set) => ({
      selectedColliderId: null,

      selectCollider: (id) => set({ selectedColliderId: id }),

      addRectCollider: (name, x, y, width, height) => {
        if (!hasProject()) return "";
        const id = crypto.randomUUID();
        mutateProject((p) => {
          addRectColliderCommand(p, { name, x, y, width, height }, () => id);
        });
        return id;
      },

      addCircleCollider: (name, x, y, radius) => {
        if (!hasProject()) return "";
        const id = crypto.randomUUID();
        mutateProject((p) => {
          addCircleColliderCommand(p, { name, x, y, radius }, () => id);
        });
        return id;
      },

      addMeshCollider: (name, meshId) => {
        if (!hasProject()) return "";
        const id = crypto.randomUUID();
        mutateProject((p) => {
          addMeshColliderCommand(p, { name, meshId }, () => id);
        });
        return id;
      },

      removeCollider: (colliderId) => {
        if (!hasProject()) return;
        let removed = false;
        mutateProject((p) => {
          removed = removeColliderCommand(p, colliderId);
        });
        if (removed && useColliderStore.getState().selectedColliderId === colliderId) {
          set({ selectedColliderId: null });
        }
      },

      toggleCollider: (colliderId) => {
        if (!hasProject()) return;
        mutateProject((p) => {
          toggleColliderCommand(p, colliderId);
        });
      },

      renameCollider: (colliderId, name) => {
        if (!hasProject()) return;
        mutateProject((p) => {
          renameColliderCommand(p, colliderId, name);
        });
      },

      setTag: (colliderId, tag) => {
        if (!hasProject()) return;
        mutateProject((p) => {
          setColliderTag(p, colliderId, tag);
        });
      },

      updateShape: (colliderId, shapeUpdates) => {
        if (!hasProject()) return;
        mutateProject((p) => {
          updateColliderShape(p, colliderId, shapeUpdates);
        });
      },

      addMeshCollidersFromSelection: (meshIds) => {
        if (!hasProject()) return 0;
        let count = 0;

        mutateProject((p) => {
          count = addMeshCollidersFromSelectionCommand(
            p,
            meshIds,
            () => crypto.randomUUID(),
          );
        });
        return count;
      },
    }),
    { name: "ColliderStore", persistEnabled: false },
  ),
);
