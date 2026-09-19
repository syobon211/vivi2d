import type { ProjectData } from "@vivi2d/core/types";
import { applyPatches, type Patch } from "immer";
import { create } from "zustand";
import { t as tGlobal } from "@/lib/i18n";
import {
  type PreparedTextureHistoryEffects,
  prepareTextureHistoryEffects,
  type TextureHistoryEffect,
} from "@/lib/texture-store";
import { withStandardMiddleware } from "./_middleware";
import { useNotificationStore } from "./notificationStore";

const MAX_HISTORY = 50;

const MERGE_INTERVAL = 500;

let lastPushTime = 0;
let lastMergeKey: string | null = null;

interface HistoryCallbacks {
  getCurrentProject: () => ProjectData | null;
  restoreProject: (snapshot: ProjectData) => void;
  prepareRestoreProject?: (snapshot: ProjectData) => {
    commit: () => void;
    rollback: () => void;
  };
}

let callbacks: HistoryCallbacks | null = null;

export function registerHistoryCallbacks(cb: HistoryCallbacks): void {
  callbacks = cb;
}

export type HistoryEntry =
  | {
      kind: "snapshot";
      snapshot: ProjectData;
      effects?: HistoryEffect[];
    }
  | {
      kind: "patch";
      patches: Patch[];
      inversePatches: Patch[];
      effects?: HistoryEffect[];
    };

export type HistoryEffect = TextureHistoryEffect;

interface HistoryStore {
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];

  pushState: (project: ProjectData, mergeKey?: string, effects?: HistoryEffect[]) => void;

  pushPatches: (
    patches: Patch[],
    inversePatches: Patch[],
    mergeKey?: string,
    effects?: HistoryEffect[],
  ) => void;
  undo: () => void;
  redo: () => void;

  clear: () => void;
}

export const useHistoryStore = create<HistoryStore>()(
  withStandardMiddleware<HistoryStore>(
    (set, get) => ({
      undoStack: [],
      redoStack: [],

      pushState: (project, mergeKey, effects) => {
        const now = Date.now();
        const hasEffects = effects !== undefined && effects.length > 0;
        const canMerge =
          !hasEffects &&
          mergeKey !== undefined &&
          mergeKey === lastMergeKey &&
          now - lastPushTime < MERGE_INTERVAL &&
          get().undoStack.length > 0;

        if (canMerge) {
          set({ redoStack: [] });
          lastPushTime = now;
          return;
        }

        const entry: HistoryEntry = {
          kind: "snapshot",
          snapshot: structuredClone(project),
          effects,
        };
        set((s) => ({
          undoStack:
            s.undoStack.length >= MAX_HISTORY
              ? [...s.undoStack.slice(1), entry]
              : [...s.undoStack, entry],
          redoStack: [],
        }));
        lastPushTime = now;
        lastMergeKey = mergeKey ?? null;
      },

      pushPatches: (patches, inversePatches, mergeKey, effects) => {
        if (patches.length === 0 && (!effects || effects.length === 0)) return;
        const now = Date.now();
        const state = get();
        const top = state.undoStack[state.undoStack.length - 1];
        const canMerge =
          mergeKey !== undefined &&
          mergeKey === lastMergeKey &&
          now - lastPushTime < MERGE_INTERVAL &&
          top !== undefined &&
          top.kind === "patch";

        if (canMerge) {
          const merged: HistoryEntry = {
            kind: "patch",
            patches: [...top.patches, ...patches],
            inversePatches: [...inversePatches, ...top.inversePatches],
            effects: [...(top.effects ?? []), ...(effects ?? [])],
          };
          set({
            undoStack: [...state.undoStack.slice(0, -1), merged],
            redoStack: [],
          });
          lastPushTime = now;
          return;
        }

        const entry: HistoryEntry = { kind: "patch", patches, inversePatches, effects };
        set((s) => ({
          undoStack:
            s.undoStack.length >= MAX_HISTORY
              ? [...s.undoStack.slice(1), entry]
              : [...s.undoStack, entry],
          redoStack: [],
        }));
        lastPushTime = now;
        lastMergeKey = mergeKey ?? null;
      },

      undo: () => restoreHistory("undo"),

      redo: () => restoreHistory("redo"),

      clear: () => {
        set({ undoStack: [], redoStack: [] });
        lastPushTime = 0;
        lastMergeKey = null;
      },
    }),
    { name: "HistoryStore", persistEnabled: false },
  ),
);

/** Preallocate a non-merged snapshot entry for a synchronous project/texture commit. */
export function prepareHistorySnapshot(
  project: ProjectData,
  effects: HistoryEffect[],
): { commit: () => void; rollback: () => void } {
  const { undoStack, redoStack } = useHistoryStore.getState();
  const pushTimeBefore = lastPushTime;
  const mergeKeyBefore = lastMergeKey;
  const entry: HistoryEntry = {
    kind: "snapshot",
    snapshot: structuredClone(project),
    effects,
  };
  const nextStacks = {
    undoStack: [
      ...(undoStack.length >= MAX_HISTORY ? undoStack.slice(1) : undoStack),
      entry,
    ],
    redoStack: [] as HistoryEntry[],
  };
  const pushTime = Date.now();
  let started = false;
  return {
    commit: () => {
      if (started) return;
      const current = useHistoryStore.getState();
      if (current.undoStack !== undoStack || current.redoStack !== redoStack) {
        throw new Error("History changed after preparation");
      }
      started = true;
      useHistoryStore.setState(nextStacks);
      lastPushTime = pushTime;
      lastMergeKey = null;
    },
    rollback: () => {
      if (!started) return;
      try {
        useHistoryStore.setState({ undoStack, redoStack });
      } finally {
        lastPushTime = pushTimeBefore;
        lastMergeKey = mergeKeyBefore;
        started = false;
      }
    },
  };
}

function restoreHistory(direction: "undo" | "redo"): void {
  const { undoStack, redoStack } = useHistoryStore.getState();
  const source = direction === "undo" ? undoStack : redoStack;
  const cb = callbacks;
  if (!cb || source.length === 0) return;

  let textures: PreparedTextureHistoryEffects | undefined;
  let projectRestore: { commit: () => void; rollback: () => void } | undefined;
  let projectStarted = false;
  let historyStarted = false;
  try {
    const current = cb.getCurrentProject();
    if (!current) return;
    const entry = source[source.length - 1]!;
    const nextProject =
      entry.kind === "snapshot"
        ? entry.snapshot
        : applyPatches(
            current,
            direction === "undo" ? entry.inversePatches : entry.patches,
          );
    const reverseEntry: HistoryEntry =
      entry.kind === "patch"
        ? entry
        : {
            kind: "snapshot",
            snapshot: structuredClone(current),
            effects: entry.effects,
          };
    const nextStacks =
      direction === "undo"
        ? { undoStack: undoStack.slice(0, -1), redoStack: [...redoStack, reverseEntry] }
        : { undoStack: [...undoStack, reverseEntry], redoStack: redoStack.slice(0, -1) };
    if (cb.prepareRestoreProject) {
      projectRestore = cb.prepareRestoreProject(nextProject);
    } else {
      const preparedProject = structuredClone(nextProject);
      projectRestore = {
        commit: () => cb.restoreProject(preparedProject),
        rollback: () => cb.restoreProject(current),
      };
    }
    if (entry.effects && entry.effects.length > 0) {
      textures = prepareTextureHistoryEffects(entry.effects, direction);
      textures.commit();
    }
    projectStarted = true;
    projectRestore.commit();
    historyStarted = true;
    useHistoryStore.setState(nextStacks);
    lastPushTime = 0;
    lastMergeKey = null;
  } catch {
    if (historyStarted) {
      try {
        useHistoryStore.setState({ undoStack, redoStack });
      } catch {
        // A failing subscriber must not prevent the remaining rollback steps.
      }
    }
    try {
      textures?.rollback();
    } catch {
      // Continue restoring the project even if an external texture write fails.
    }
    if (projectStarted) {
      try {
        projectRestore?.rollback();
      } catch {
        // Legacy callbacks may themselves fail; retain the fixed failure message.
      }
    }
    useNotificationStore
      .getState()
      .addNotification(
        "error",
        tGlobal(direction === "undo" ? "notify.undoFailed" : "notify.redoFailed"),
      );
  }
}

export function _resetMergeTimer(): void {
  lastPushTime = 0;
  lastMergeKey = null;
}

export function _resetCallbacks(): void {
  callbacks = null;
}
