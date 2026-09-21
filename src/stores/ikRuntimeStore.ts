import type { IKSolution } from "@vivi2d/core/ik-solver";
import { create } from "zustand";
import { isProjectV11Publishing } from "@/lib/project-v11-publishing";
import { withStandardMiddleware } from "./_middleware";

interface IKRuntimeState {
  solutions: Map<string, IKSolution>;

  runtimeTargets: Map<string, { x: number; y: number }>;
}

interface IKRuntimeActions {
  setSolution: (controllerId: string, solution: IKSolution) => void;

  setRuntimeTarget: (controllerId: string, x: number, y: number) => void;

  clearRuntimeTarget: (controllerId: string) => void;

  clearAll: () => void;
}

export const useIKRuntimeStore = create<IKRuntimeState & IKRuntimeActions>()(
  withStandardMiddleware<IKRuntimeState & IKRuntimeActions>(
    (set) => ({
      solutions: new Map(),
      runtimeTargets: new Map(),

      setSolution: (controllerId, solution) => {
        if (isProjectV11Publishing()) throw new Error("PROJECT_TRANSACTION_BUSY");
        set((state) => {
          const next = new Map(state.solutions);
          next.set(controllerId, solution);
          return { solutions: next };
        });
      },

      setRuntimeTarget: (controllerId, x, y) => {
        if (isProjectV11Publishing()) throw new Error("PROJECT_TRANSACTION_BUSY");
        set((state) => {
          const next = new Map(state.runtimeTargets);
          next.set(controllerId, { x, y });
          return { runtimeTargets: next };
        });
      },

      clearRuntimeTarget: (controllerId) => {
        if (isProjectV11Publishing()) throw new Error("PROJECT_TRANSACTION_BUSY");
        set((state) => {
          const next = new Map(state.runtimeTargets);
          next.delete(controllerId);
          return { runtimeTargets: next };
        });
      },

      clearAll: () => {
        if (isProjectV11Publishing()) throw new Error("PROJECT_TRANSACTION_BUSY");
        set({ solutions: new Map(), runtimeTargets: new Map() });
      },
    }),
    { name: "IKRuntimeStore", persistEnabled: false, immerEnabled: false },
  ),
);
