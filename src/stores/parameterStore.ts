import { create } from "zustand";
import { withStandardMiddleware } from "./_middleware";

interface ParameterState {
  parameterValues: Record<string, number>;
}

interface ParameterActions {
  setParameterValue: (parameterId: string, value: number) => void;

  setAllValues: (values: Record<string, number>) => void;

  clear: () => void;
}

export type ParameterStore = ParameterState & ParameterActions;

export const useParameterStore = create<ParameterStore>()(
  withStandardMiddleware<ParameterStore>(
    (set) => ({
      parameterValues: {},

      setParameterValue: (parameterId, value) =>
        set((s) => ({
          parameterValues: { ...s.parameterValues, [parameterId]: value },
        })),

      setAllValues: (values) => set({ parameterValues: values }),

      clear: () => set({ parameterValues: {} }),
    }),
    { name: "ParameterStore", persistEnabled: false },
  ),
);
