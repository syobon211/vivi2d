import { create } from "zustand";
import { withStandardMiddleware } from "./_middleware";

export type WorkspaceMode = "default" | "rigging" | "animation";

interface WorkspaceModeState {
  mode: WorkspaceMode;
}

interface WorkspaceModeActions {
  setMode: (mode: WorkspaceMode) => void;
  toggleRiggingMode: () => void;
}

export type WorkspaceModeStore = WorkspaceModeState & WorkspaceModeActions;

function isWorkspaceMode(value: unknown): value is WorkspaceMode {
  return value === "default" || value === "rigging" || value === "animation";
}

export function migrateWorkspaceMode(
  persistedState: unknown,
  _version: number,
): WorkspaceModeStore {
  const mode =
    typeof persistedState === "object" &&
    persistedState !== null &&
    "mode" in persistedState &&
    isWorkspaceMode((persistedState as { mode?: unknown }).mode)
      ? (persistedState as { mode: WorkspaceMode }).mode
      : "default";
  return {
    mode,
  } as WorkspaceModeStore;
}

export const useWorkspaceModeStore = create<WorkspaceModeStore>()(
  withStandardMiddleware<WorkspaceModeStore>(
    (set) => ({
      mode: "default",
      setMode: (mode) =>
        set((state) => {
          state.mode = mode;
        }),
      toggleRiggingMode: () =>
        set((state) => {
          state.mode = state.mode === "rigging" ? "default" : "rigging";
        }),
    }),
    {
      name: "WorkspaceModeStore",
      persistKey: "vivi2d-workspace-mode",
      persistVersion: 1,
      partialize: (state) => ({ mode: state.mode }),
      migrate: migrateWorkspaceMode,
    },
  ),
);
