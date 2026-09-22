import type { ProjectData } from "@vivi2d/core/types";
import { applyPatches, type Patch } from "immer";
import { create } from "zustand";
import { t as tGlobal } from "@/lib/i18n";
import type {
  V11AtlasHistoryEffect,
  V11AtlasRevision,
} from "@/lib/project-v11-serializer";
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
let restoreV11History: ((direction: "undo" | "redo") => boolean) | undefined;
export function registerV11HistoryRestore(
  restore: (direction: "undo" | "redo") => boolean,
): void {
  restoreV11History = restore;
}

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

export type HistoryEffect = TextureHistoryEffect | V11AtlasHistoryEffect;

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

export interface PreparedHistoryChange {
  commit(): void;
  rollback(): void;
}

/** Fixed stack/timer participant for the v11 synchronous transaction. */
function prepareHistoryChange(
  undoStack: HistoryEntry[],
  redoStack: HistoryEntry[],
  pushTime: number,
  mergeKey: string | null,
): PreparedHistoryChange {
  const before = useHistoryStore.getState();
  const beforeTime = lastPushTime,
    beforeKey = lastMergeKey;
  let started = false;
  return {
    commit() {
      const current = useHistoryStore.getState();
      if (
        current.undoStack !== before.undoStack ||
        current.redoStack !== before.redoStack
      )
        throw new Error("PROJECT_HISTORY_CONFLICT");
      started = true;
      useHistoryStore.setState({ undoStack, redoStack });
      lastPushTime = pushTime;
      lastMergeKey = mergeKey;
    },
    rollback() {
      if (!started) return;
      try {
        useHistoryStore.setState({
          undoStack: before.undoStack,
          redoStack: before.redoStack,
        });
      } finally {
        lastPushTime = beforeTime;
        lastMergeKey = beforeKey;
        started = false;
      }
    },
  };
}

export function prepareHistoryClear(): PreparedHistoryChange {
  return prepareHistoryChange([], [], 0, null);
}

function boundedV11History(
  undo: HistoryEntry[],
  redo: HistoryEntry[],
  active: V11AtlasRevision,
): { undoStack: HistoryEntry[]; redoStack: HistoryEntry[] } {
  const activeBacking = new Set(active.atlases.map((atlas) => atlas.backing));
  let undoStack = [...undo],
    redoStack = [...redo];
  const exceeds = () => {
    if (undoStack.length + redoStack.length > MAX_HISTORY) return true;
    const retained = new Set(activeBacking);
    let png = 0,
      rgba = 0;
    for (const entry of [...undoStack, ...redoStack])
      for (const effect of entry.effects ?? []) {
        if (effect.kind !== "v11-atlas") continue;
        for (const revision of [effect.before, effect.after])
          for (const { backing } of revision.atlases) {
            if (retained.has(backing)) continue;
            retained.add(backing);
            png += backing.pngByteLength;
            rgba += backing.rgbaByteLength;
          }
      }
    return png > 67_108_864 || rgba > 268_435_456;
  };
  // Drop complete farthest entries, keeping both directions contiguous nearest
  // the active state. Count unique backing across BOTH stacks, never per stack.
  while ((undoStack.length || redoStack.length) && exceeds()) {
    if (undoStack.length >= redoStack.length) undoStack = undoStack.slice(1);
    else redoStack = redoStack.slice(1);
  }
  return { undoStack, redoStack };
}

export function prepareV11HistoryEdit(
  before: ProjectData,
  active: V11AtlasRevision,
  options: {
    patches?: Patch[];
    inversePatches?: Patch[];
    mergeKey?: string;
    effect?: V11AtlasHistoryEffect;
  },
): PreparedHistoryChange {
  const state = useHistoryStore.getState();
  const now = Date.now();
  const top = state.undoStack.at(-1);
  const canMerge =
    !options.effect &&
    options.patches &&
    top?.kind === "patch" &&
    !top.effects?.length &&
    options.mergeKey !== undefined &&
    options.mergeKey === lastMergeKey &&
    now - lastPushTime < MERGE_INTERVAL;
  const entry: HistoryEntry =
    canMerge && top.kind === "patch"
      ? {
          kind: "patch",
          patches: [...top.patches, ...(options.patches ?? [])],
          inversePatches: [...(options.inversePatches ?? []), ...top.inversePatches],
        }
      : options.patches && !options.effect
        ? {
            kind: "patch",
            patches: options.patches,
            inversePatches: options.inversePatches ?? [],
          }
        : {
            kind: "snapshot",
            snapshot: structuredClone(before),
            effects: options.effect ? [options.effect] : undefined,
          };
  const stack = [...(canMerge ? state.undoStack.slice(0, -1) : state.undoStack), entry];
  return prepareHistoryChange(
    boundedV11History(stack, [], active).undoStack,
    [],
    now,
    options.effect ? null : (options.mergeKey ?? null),
  );
}

export function prepareV11HistoryNavigation(
  direction: "undo" | "redo",
  reverse: HistoryEntry,
  active: V11AtlasRevision,
): PreparedHistoryChange {
  const { undoStack, redoStack } = useHistoryStore.getState();
  const bounded =
    direction === "undo"
      ? boundedV11History(undoStack.slice(0, -1), [...redoStack, reverse], active)
      : boundedV11History([...undoStack, reverse], redoStack.slice(0, -1), active);
  return prepareHistoryChange(bounded.undoStack, bounded.redoStack, 0, null);
}

function restoreHistory(direction: "undo" | "redo"): void {
  if (restoreV11History?.(direction)) return;
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
      textures = prepareTextureHistoryEffects(
        entry.effects.filter(
          (effect): effect is TextureHistoryEffect => effect.kind === "texture",
        ),
        direction,
      );
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
