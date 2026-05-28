import type { VisemeType } from "@vivi2d/core/types";
import { create } from "zustand";
import { withStandardMiddleware } from "./_middleware";

interface LipSyncState {
  currentVolume: number;

  isConnected: boolean;

  error: string | null;

  currentViseme: VisemeType;

  visemeConfidence: number;
}

interface LipSyncActions {
  setVolume: (volume: number) => void;
  setConnected: (connected: boolean) => void;
  setError: (error: string | null) => void;
  setViseme: (viseme: VisemeType, confidence: number) => void;
  reset: () => void;
}

export type LipSyncStore = LipSyncState & LipSyncActions;

export const useLipSyncStore = create<LipSyncStore>()(
  withStandardMiddleware<LipSyncStore>(
    (set) => ({
      currentVolume: 0,
      isConnected: false,
      error: null,
      currentViseme: "sil",
      visemeConfidence: 0,

      setVolume: (volume) => set({ currentVolume: volume }),
      setConnected: (connected) => set({ isConnected: connected }),
      setError: (error) => set({ error }),
      setViseme: (viseme, confidence) =>
        set({ currentViseme: viseme, visemeConfidence: confidence }),
      reset: () =>
        set({
          currentVolume: 0,
          isConnected: false,
          error: null,
          currentViseme: "sil",
          visemeConfidence: 0,
        }),
    }),
    { name: "LipSyncStore", persistEnabled: false },
  ),
);
