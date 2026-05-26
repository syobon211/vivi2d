import { create } from "zustand";
import { withStandardMiddleware } from "./_middleware";

interface ProjectDialogsState {
  showValidationDialog: boolean;
  showDepthInspector: boolean;
  showManualPngSplit: boolean;
  openValidationDialog: () => void;
  closeValidationDialog: () => void;
  openDepthInspector: () => void;
  closeDepthInspector: () => void;
  openManualPngSplit: () => void;
  closeManualPngSplit: () => void;
}

export const useProjectDialogsStore = create<ProjectDialogsState>()(
  withStandardMiddleware<ProjectDialogsState>(
    (set) => ({
      showValidationDialog: false,
      showDepthInspector: false,
      showManualPngSplit: false,
      openValidationDialog: () => set({ showValidationDialog: true }),
      closeValidationDialog: () => set({ showValidationDialog: false }),
      openDepthInspector: () => set({ showDepthInspector: true }),
      closeDepthInspector: () => set({ showDepthInspector: false }),
      openManualPngSplit: () => set({ showManualPngSplit: true }),
      closeManualPngSplit: () => set({ showManualPngSplit: false }),
    }),
    { name: "ProjectDialogsStore", persistEnabled: false },
  ),
);
