import { create } from "zustand";
import { isProjectV11Publishing } from "@/lib/project-v11-publishing";
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

      setParameterValue: (parameterId, value) => {
        if (isProjectV11Publishing()) throw new Error("PROJECT_TRANSACTION_BUSY");
        set((s) => ({
          parameterValues: { ...s.parameterValues, [parameterId]: value },
        }));
      },

      setAllValues: (values) => {
        if (isProjectV11Publishing()) throw new Error("PROJECT_TRANSACTION_BUSY");
        set({ parameterValues: values });
      },

      clear: () => {
        if (isProjectV11Publishing()) throw new Error("PROJECT_TRANSACTION_BUSY");
        set({ parameterValues: {} });
      },
    }),
    { name: "ParameterStore", persistEnabled: false },
  ),
);
