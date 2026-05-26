import { create } from "zustand";
import { withStandardMiddleware } from "./_middleware";

export type AutoSetupQuickCommandKind =
  | "readyToRig"
  | "meshRefine"
  | "eyeClipping"
  | "eyeRig"
  | "leftRightRepair"
  | "mouthRig";

export interface AutoSetupQuickCommand {
  kind: AutoSetupQuickCommandKind;
  projectKey: string;
  projectStructureVersion: number;
  requestedAt: number;
}

interface AutoSetupCommandStoreState {
  pendingCommand: AutoSetupQuickCommand | null;
  commandInFlight: boolean;
  requestCommand: (command: AutoSetupQuickCommand) => void;
  clearCommand: () => void;
  clearCommandIfProjectChanged: (
    projectKey: string | null,
    projectStructureVersion: number,
  ) => void;
  consumeCompatibleCommand: (
    projectKey: string,
    projectStructureVersion: number,
  ) => AutoSetupQuickCommand | null;
  setCommandInFlight: (next: boolean) => void;
}

export const useAutoSetupCommandStore = create<AutoSetupCommandStoreState>()(
  withStandardMiddleware<AutoSetupCommandStoreState>(
    (set, get) => ({
      pendingCommand: null,
      commandInFlight: false,
      requestCommand: (command) =>
        set((state) => {
          state.pendingCommand = command;
        }),
      clearCommand: () =>
        set((state) => {
          state.pendingCommand = null;
        }),
      clearCommandIfProjectChanged: (projectKey, projectStructureVersion) => {
        const pendingCommand = get().pendingCommand;
        if (!pendingCommand) return;
        if (
          projectKey === null ||
          pendingCommand.projectKey !== projectKey ||
          pendingCommand.projectStructureVersion !== projectStructureVersion
        ) {
          set((state) => {
            state.pendingCommand = null;
          });
        }
      },
      consumeCompatibleCommand: (projectKey, projectStructureVersion) => {
        const pendingCommand = get().pendingCommand;
        if (!pendingCommand) return null;
        set((state) => {
          state.pendingCommand = null;
        });
        if (
          pendingCommand.projectKey !== projectKey ||
          pendingCommand.projectStructureVersion !== projectStructureVersion
        ) {
          return null;
        }
        return pendingCommand;
      },
      setCommandInFlight: (next) =>
        set((state) => {
          state.commandInFlight = next;
        }),
    }),
    { name: "AutoSetupCommandStore", persistEnabled: false },
  ),
);
