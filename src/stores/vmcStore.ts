import { create } from "zustand";
import { withStandardMiddleware } from "./_middleware";

export interface VMCMapping {
  vmcName: string;

  parameterId: string;

  scale: number;

  offset: number;
}

interface VMCState {
  connected: boolean;

  receivePort: number;

  sendPort: number;

  sendHost: string;

  mappings: VMCMapping[];

  lastReceivedAt: number | null;

  faceChannelBuffer: Record<string, number>;
}

interface VMCActions {
  setConnected: (connected: boolean) => void;

  setReceivePort: (port: number) => void;

  setSendTarget: (host: string, port: number) => void;

  addMapping: (mapping: VMCMapping) => void;

  removeMapping: (index: number) => void;

  updateMapping: (index: number, mapping: Partial<VMCMapping>) => void;

  updateFaceChannelBuffer: (values: Record<string, number>) => void;

  markReceived: () => void;

  resetRuntime: () => void;

  resetSettings: () => void;

  reset: () => void;
}

const runtimeInitial = {
  connected: false,
  mappings: [] as VMCMapping[],
  lastReceivedAt: null as number | null,
  faceChannelBuffer: {} as Record<string, number>,
};

const settingsInitial = {
  receivePort: 39539,
  sendPort: 39540,
  sendHost: "127.0.0.1",
};

const initialState: VMCState = {
  ...settingsInitial,
  ...runtimeInitial,
};

export const useVMCStore = create<VMCState & VMCActions>()(
  withStandardMiddleware<VMCState & VMCActions>(
    (set) => ({
      ...initialState,

      setConnected: (connected) => set({ connected }),

      setReceivePort: (port) => set({ receivePort: port }),

      setSendTarget: (host, port) => set({ sendHost: host, sendPort: port }),

      addMapping: (mapping) =>
        set((state) => ({ mappings: [...state.mappings, mapping] })),

      removeMapping: (index) =>
        set((state) => ({
          mappings: state.mappings.filter((_, i) => i !== index),
        })),

      updateMapping: (index, updates) =>
        set((state) => ({
          mappings: state.mappings.map((m, i) =>
            i === index ? { ...m, ...updates } : m,
          ),
        })),

      updateFaceChannelBuffer: (values) =>
        set((state) => ({
          faceChannelBuffer: { ...state.faceChannelBuffer, ...values },
        })),

      markReceived: () => set({ lastReceivedAt: Date.now() }),

      resetRuntime: () => set({ ...runtimeInitial }),

      resetSettings: () => set({ ...settingsInitial }),

      reset: () => set(initialState),
    }),
    { name: "VMCStore", persistEnabled: false },
  ),
);
