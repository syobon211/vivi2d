import type { IKSolution } from "@vivi2d/core/ik-solver";
import { create } from "zustand";
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

      setSolution: (controllerId, solution) =>
        set((state) => {
          const next = new Map(state.solutions);
          next.set(controllerId, solution);
          return { solutions: next };
        }),

      setRuntimeTarget: (controllerId, x, y) =>
        set((state) => {
          const next = new Map(state.runtimeTargets);
          next.set(controllerId, { x, y });
          return { runtimeTargets: next };
        }),

      clearRuntimeTarget: (controllerId) =>
        set((state) => {
          const next = new Map(state.runtimeTargets);
          next.delete(controllerId);
          return { runtimeTargets: next };
        }),

      clearAll: () => set({ solutions: new Map(), runtimeTargets: new Map() }),
    }),
    { name: "IKRuntimeStore", persistEnabled: false, immerEnabled: false },
  ),
);
