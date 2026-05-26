import { create } from "zustand";
import { withStandardMiddleware } from "./_middleware";

export type QuickActionSection = "project" | "timeline" | "view" | "workspace";

export interface QuickActionAvailability {
  enabled: boolean;
  reason?: string;
}

export interface QuickActionRegistration {
  id: string;
  section: QuickActionSection;
  title: string;
  description?: string;
  keywords: string[];
  order: number;
  run: () => void;
  getAvailability: () => QuickActionAvailability;
}

interface QuickActionRegistryState {
  actions: Record<string, QuickActionRegistration>;
  registerAction: (action: QuickActionRegistration) => void;
  unregisterAction: (id: string) => void;
}

export const useQuickActionRegistryStore = create<QuickActionRegistryState>()(
  withStandardMiddleware<QuickActionRegistryState>(
    (set) => ({
      actions: {},
      registerAction: (action) =>
        set((state) => {
          state.actions[action.id] = action;
        }),
      unregisterAction: (id) =>
        set((state) => {
          delete state.actions[id];
        }),
    }),
    { name: "QuickActionRegistryStore", persistEnabled: false },
  ),
);
