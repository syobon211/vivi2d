import { create } from "zustand";
import { withStandardMiddleware } from "./_middleware";

export type ShortcutAction =
  | "undo"
  | "redo"
  | "save"
  | "saveAs"
  | "moveLayerUp"
  | "moveLayerDown"
  | "selectAll"
  | "toolSelect"
  | "toolPan"
  | "toolMeshEdit"
  | "tempPan";

export interface ShortcutBinding {
  key: string;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
}

export type ShortcutMap = Record<ShortcutAction, ShortcutBinding>;

export const SHORTCUT_ACTIONS: ShortcutAction[] = [
  "undo",
  "redo",
  "save",
  "saveAs",
  "selectAll",
  "moveLayerUp",
  "moveLayerDown",
  "toolSelect",
  "toolPan",
  "toolMeshEdit",
  "tempPan",
];

export const DEFAULT_KEYMAP: ShortcutMap = {
  undo: { key: "z", ctrl: true, shift: false, alt: false },
  redo: { key: "z", ctrl: true, shift: true, alt: false },
  save: { key: "s", ctrl: true, shift: false, alt: false },
  saveAs: { key: "s", ctrl: true, shift: true, alt: false },
  moveLayerUp: { key: "ArrowUp", ctrl: true, shift: false, alt: false },
  moveLayerDown: { key: "ArrowDown", ctrl: true, shift: false, alt: false },
  selectAll: { key: "a", ctrl: true, shift: false, alt: false },
  toolSelect: { key: "v", ctrl: false, shift: false, alt: false },
  toolPan: { key: "h", ctrl: false, shift: false, alt: false },
  toolMeshEdit: { key: "m", ctrl: false, shift: false, alt: false },
  tempPan: { key: "Space", ctrl: false, shift: false, alt: false },
};

function formatKey(key: string): string {
  if (key === "ArrowUp") return "↑";
  if (key === "ArrowDown") return "↓";
  if (key === "ArrowLeft") return "←";
  if (key === "ArrowRight") return "→";
  if (key === "Space") return "Space";
  if (key === " ") return "Space";
  if (key.length === 1) return key.toUpperCase();
  return key;
}

export function bindingToString(binding: ShortcutBinding): string {
  const parts: string[] = [];
  if (binding.ctrl) parts.push("Ctrl");
  if (binding.shift) parts.push("Shift");
  if (binding.alt) parts.push("Alt");
  parts.push(formatKey(binding.key));
  return parts.join("+");
}

export function eventToBinding(e: KeyboardEvent): ShortcutBinding {
  let key = e.key;
  if (e.code === "Space") key = "Space";
  else if (key.length === 1) key = key.toLowerCase();

  return {
    key,
    ctrl: e.ctrlKey || e.metaKey,
    shift: e.shiftKey,
    alt: e.altKey,
  };
}

export function matchesBinding(e: KeyboardEvent, binding: ShortcutBinding): boolean {
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl !== binding.ctrl) return false;
  if (e.shiftKey !== binding.shift) return false;
  if (e.altKey !== binding.alt) return false;

  if (binding.key === "Space") return e.code === "Space";
  if (binding.key.startsWith("Arrow")) return e.key === binding.key;
  if (binding.key.length === 1) return e.key.toLowerCase() === binding.key.toLowerCase();

  return e.key === binding.key;
}

export function bindingsEqual(a: ShortcutBinding, b: ShortcutBinding): boolean {
  return (
    a.key.toLowerCase() === b.key.toLowerCase() &&
    a.ctrl === b.ctrl &&
    a.shift === b.shift &&
    a.alt === b.alt
  );
}

export function findConflicts(
  keymap: ShortcutMap,
  action: ShortcutAction,
  binding: ShortcutBinding,
): ShortcutAction[] {
  const conflicts: ShortcutAction[] = [];
  for (const [act, b] of Object.entries(keymap)) {
    if (act === action) continue;
    if (bindingsEqual(b, binding)) conflicts.push(act as ShortcutAction);
  }
  return conflicts;
}

interface ShortcutStoreState {
  keymap: ShortcutMap;
}

interface ShortcutStoreActions {
  setShortcut: (action: ShortcutAction, binding: ShortcutBinding) => void;

  resetShortcut: (action: ShortcutAction) => void;

  resetAll: () => void;

  importKeymap: (keymap: Partial<ShortcutMap>) => void;
}

export type ShortcutStore = ShortcutStoreState & ShortcutStoreActions;

export function migrateShortcut(
  persistedState: unknown,
  _version: number,
): ShortcutStore {
  if (persistedState && typeof persistedState === "object") {
    const maybeMap = persistedState as Partial<ShortcutMap>;
    return { keymap: { ...DEFAULT_KEYMAP, ...maybeMap } } as ShortcutStore;
  }
  return { keymap: { ...DEFAULT_KEYMAP } } as ShortcutStore;
}

export const useShortcutStore = create<ShortcutStore>()(
  withStandardMiddleware<ShortcutStore>(
    (set) => ({
      keymap: { ...DEFAULT_KEYMAP },

      setShortcut: (action, binding) =>
        set((s) => {
          s.keymap[action] = binding;
        }),

      resetShortcut: (action) =>
        set((s) => {
          s.keymap[action] = { ...DEFAULT_KEYMAP[action] };
        }),

      resetAll: () =>
        set((s) => {
          s.keymap = { ...DEFAULT_KEYMAP };
        }),

      importKeymap: (partial) =>
        set((s) => {
          s.keymap = { ...DEFAULT_KEYMAP, ...partial };
        }),
    }),
    {
      name: "ShortcutStore",
      persistKey: "vivi2d-shortcuts",
      persistVersion: 1,
      partialize: (s) => ({ keymap: s.keymap }),
      migrate: migrateShortcut,
    },
  ),
);
