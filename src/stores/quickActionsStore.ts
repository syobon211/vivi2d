import { create } from "zustand";
import { withStandardMiddleware } from "./_middleware";

interface QuickActionsState {
  open: boolean;
  openPalette: () => void;
  closePalette: () => void;
  togglePalette: () => void;
}

export const useQuickActionsStore = create<QuickActionsState>()(
  withStandardMiddleware<QuickActionsState>(
    (set) => ({
      open: false,
      openPalette: () =>
        set((state) => {
          state.open = true;
        }),
      closePalette: () =>
        set((state) => {
          state.open = false;
        }),
      togglePalette: () =>
        set((state) => {
          state.open = !state.open;
        }),
    }),
    { name: "QuickActionsStore", persistEnabled: false },
  ),
);
