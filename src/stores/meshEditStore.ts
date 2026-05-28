import { create } from "zustand";
import { withStandardMiddleware } from "./_middleware";

interface MeshEditState {
  selectedVertices: number[];

  lassoActive: boolean;

  lassoPoints: number[];
}

interface MeshEditActions {
  selectVertex: (index: number) => void;

  toggleVertex: (index: number) => void;

  selectVertices: (indices: number[]) => void;

  clearSelection: () => void;

  startLasso: () => void;

  addLassoPoint: (x: number, y: number) => void;

  endLasso: () => void;
}

export const useMeshEditStore = create<MeshEditState & MeshEditActions>()(
  withStandardMiddleware<MeshEditState & MeshEditActions>(
    (set) => ({
      selectedVertices: [],
      lassoActive: false,
      lassoPoints: [],

      selectVertex: (index) => set({ selectedVertices: [index] }),

      toggleVertex: (index) =>
        set((s) => {
          const exists = s.selectedVertices.includes(index);
          return {
            selectedVertices: exists
              ? s.selectedVertices.filter((i) => i !== index)
              : [...s.selectedVertices, index],
          };
        }),

      selectVertices: (indices) => set({ selectedVertices: indices }),

      clearSelection: () => set({ selectedVertices: [] }),

      startLasso: () => set({ lassoActive: true, lassoPoints: [] }),

      addLassoPoint: (x, y) =>
        set((s) => ({
          lassoPoints: [...s.lassoPoints, x, y],
        })),

      endLasso: () => set({ lassoActive: false, lassoPoints: [] }),
    }),
    { name: "MeshEditStore", persistEnabled: false },
  ),
);
