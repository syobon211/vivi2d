import type { ProjectData } from "@vivi2d/core/types";
import { applyPatches, type Patch } from "immer";
import { create } from "zustand";
import { t as tGlobal } from "@/lib/i18n";
import {
  applyTextureHistoryEffect,
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

  pushState: (
    project: ProjectData,
    mergeKey?: string,
    effects?: HistoryEffect[],
  ) => void;

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

      undo: () => {
        const { undoStack } = get();
        if (undoStack.length === 0 || !callbacks) return;

        const current = callbacks.getCurrentProject();
        if (!current) return;

        const entry = undoStack[undoStack.length - 1]!;
        try {
          applyHistoryEffects(entry.effects, "undo");
          const prev =
            entry.kind === "snapshot"
              ? entry.snapshot
              : applyPatches(current, entry.inversePatches);
          callbacks.restoreProject(prev);
        } catch (e) {
          try {
            applyHistoryEffects(entry.effects, "redo");
          } catch {
            // Keep the original undo failure visible; the next command should not
            // silently overwrite partially restored external state.
          }
          const msg = e instanceof Error ? e.message : String(e);
          useNotificationStore
            .getState()
            .addNotification("error", `${tGlobal("notify.undoFailed")}: ${msg}`);
          return;
        }
        const redoEntry: HistoryEntry =
          entry.kind === "patch"
            ? entry
            : {
                kind: "snapshot",
                snapshot: structuredClone(current),
                effects: entry.effects,
              };
        set((s) => ({
          undoStack: s.undoStack.slice(0, -1),
          redoStack: [...s.redoStack, redoEntry],
        }));
        lastPushTime = 0;
        lastMergeKey = null;
      },

      redo: () => {
        const { redoStack } = get();
        if (redoStack.length === 0 || !callbacks) return;

        const current = callbacks.getCurrentProject();
        if (!current) return;

        const entry = redoStack[redoStack.length - 1]!;
        try {
          applyHistoryEffects(entry.effects, "redo");
          const next =
            entry.kind === "snapshot"
              ? entry.snapshot
              : applyPatches(current, entry.patches);
          callbacks.restoreProject(next);
        } catch (e) {
          try {
            applyHistoryEffects(entry.effects, "undo");
          } catch {
            // Keep the original redo failure visible.
          }
          const msg = e instanceof Error ? e.message : String(e);
          useNotificationStore
            .getState()
            .addNotification("error", `${tGlobal("notify.redoFailed")}: ${msg}`);
          return;
        }
        const undoEntry: HistoryEntry =
          entry.kind === "patch"
            ? entry
            : {
                kind: "snapshot",
                snapshot: structuredClone(current),
                effects: entry.effects,
              };
        set((s) => ({
          redoStack: s.redoStack.slice(0, -1),
          undoStack: [...s.undoStack, undoEntry],
        }));
        lastPushTime = 0;
        lastMergeKey = null;
      },

      clear: () => {
        set({ undoStack: [], redoStack: [] });
        lastPushTime = 0;
        lastMergeKey = null;
      },
    }),
    { name: "HistoryStore", persistEnabled: false },
  ),
);

function applyHistoryEffects(
  effects: HistoryEffect[] | undefined,
  direction: "undo" | "redo",
): void {
  const orderedEffects =
    direction === "undo" ? [...(effects ?? [])].reverse() : (effects ?? []);
  for (const effect of orderedEffects) {
    switch (effect.kind) {
      case "texture":
        applyTextureHistoryEffect(effect, direction);
        break;
    }
  }
}

export function _resetMergeTimer(): void {
  lastPushTime = 0;
  lastMergeKey = null;
}

export function _resetCallbacks(): void {
  callbacks = null;
}
