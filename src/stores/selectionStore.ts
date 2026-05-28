import { flattenLayers } from "@vivi2d/core/layer-utils";
import type { LayerId, LayerSemanticRole } from "@vivi2d/core/types";
import { isViviMesh } from "@vivi2d/core/types";
import { create } from "zustand";
import { measureE2EPerfProbe } from "@/lib/e2e-perf-probe";
import { withStandardMiddleware } from "./_middleware";
import { useEditorStore } from "./editorStore";

interface SelectionState {
  selectedLayerId: LayerId | null;
  selectedLayerIds: LayerId[];
  selectedLayerLookup: Record<LayerId, true>;
  soloLayerIds: LayerId[];
}

interface SelectionActions {
  selectLayer: (id: LayerId | null) => void;

  toggleLayerSelection: (id: LayerId) => void;

  rangeSelectLayer: (id: LayerId) => void;

  selectAllLayers: () => void;

  selectLayersBySemanticRole: (
    role: LayerSemanticRole,
    preferredId?: LayerId | null,
  ) => void;

  clearSelection: () => void;

  toggleSolo: (id: LayerId) => void;

  addToSolo: (id: LayerId) => void;

  clearSolo: () => void;
}

export type SelectionStore = SelectionState & SelectionActions;

function buildSelectedLayerLookup(ids: readonly LayerId[]): Record<LayerId, true> {
  return Object.fromEntries(ids.map((id) => [id, true])) as Record<LayerId, true>;
}

export const useSelectionStore = create<SelectionStore>()(
  withStandardMiddleware<SelectionStore>(
    (set, get) => ({
      selectedLayerId: null,
      selectedLayerIds: [],
      selectedLayerLookup: {},
      soloLayerIds: [],

      selectLayer: (id) =>
        measureE2EPerfProbe(
          "selectionStore.selectLayer",
          () =>
            set({
              selectedLayerId: id,
              selectedLayerIds: id ? [id] : [],
              selectedLayerLookup: id ? buildSelectedLayerLookup([id]) : {},
            }),
          { hasSelection: id !== null },
        ),

      toggleLayerSelection: (id) =>
        measureE2EPerfProbe(
          "selectionStore.toggleLayerSelection",
          () =>
            set((s) => {
              const idx = s.selectedLayerIds.indexOf(id);
              if (idx === -1) {
                const selectedLayerIds = [...s.selectedLayerIds, id];
                return {
                  selectedLayerIds,
                  selectedLayerLookup: buildSelectedLayerLookup(selectedLayerIds),
                  selectedLayerId: id,
                };
              }
              const newIds = s.selectedLayerIds.filter((_, i) => i !== idx);
              return {
                selectedLayerIds: newIds,
                selectedLayerLookup: buildSelectedLayerLookup(newIds),
                selectedLayerId: newIds.at(-1) ?? null,
              };
            }),
          { layerId: id },
        ),

      rangeSelectLayer: (id) => {
        const project = useEditorStore.getState().project;
        if (!project) return;
        const flat = flattenLayers(project.layers);
        const { selectedLayerId } = get();
        const startIdx = selectedLayerId
          ? flat.findIndex((l) => l.id === selectedLayerId)
          : -1;
        const endIdx = flat.findIndex((l) => l.id === id);
        if (startIdx === -1 || endIdx === -1) {
          measureE2EPerfProbe(
            "selectionStore.rangeSelectLayer",
            () => set({ selectedLayerId: id, selectedLayerIds: [id] }),
            { mode: "fallback-single" },
          );
          return;
        }
        const lo = Math.min(startIdx, endIdx);
        const hi = Math.max(startIdx, endIdx);
        const selectedLayerIds = flat.slice(lo, hi + 1).map((l) => l.id);
        measureE2EPerfProbe(
          "selectionStore.rangeSelectLayer",
          () =>
            set({
              selectedLayerIds,
              selectedLayerLookup: buildSelectedLayerLookup(selectedLayerIds),
              selectedLayerId: id,
            }),
          { count: selectedLayerIds.length },
        );
      },

      selectAllLayers: () => {
        const project = useEditorStore.getState().project;
        if (!project) return;
        const flat = flattenLayers(project.layers);
        const selectedLayerIds = flat.map((l) => l.id);
        set({
          selectedLayerIds,
          selectedLayerLookup: buildSelectedLayerLookup(selectedLayerIds),
          selectedLayerId: flat[0]?.id ?? null,
        });
      },

      selectLayersBySemanticRole: (role, preferredId = null) => {
        const project = useEditorStore.getState().project;
        if (!project) return;
        const matches = flattenLayers(project.layers).filter(
          (layer) => isViviMesh(layer) && layer.semanticRole === role,
        );
        if (matches.length === 0) return;
        const selectedLayerIds = matches.map((layer) => layer.id);
        const selectedLayerId =
          preferredId && selectedLayerIds.includes(preferredId)
            ? preferredId
            : (selectedLayerIds[0] ?? null);
        set({
          selectedLayerId,
          selectedLayerIds,
          selectedLayerLookup: buildSelectedLayerLookup(selectedLayerIds),
        });
      },

      clearSelection: () =>
        set({ selectedLayerId: null, selectedLayerIds: [], selectedLayerLookup: {} }),

      toggleSolo: (id) =>
        set((s) => {
          if (s.soloLayerIds.length === 1 && s.soloLayerIds[0] === id) {
            return { soloLayerIds: [] };
          }
          return { soloLayerIds: [id] };
        }),

      addToSolo: (id) =>
        set((s) => {
          if (s.soloLayerIds.includes(id)) {
            const newIds = s.soloLayerIds.filter((i) => i !== id);
            return { soloLayerIds: newIds };
          }
          return { soloLayerIds: [...s.soloLayerIds, id] };
        }),

      clearSolo: () => set({ soloLayerIds: [] }),
    }),
    { name: "SelectionStore", persistEnabled: false },
  ),
);

useSelectionStore.subscribe(
  (state) => state.selectedLayerIds,
  (selectedLayerIds) => {
    const nextLookup = buildSelectedLayerLookup(selectedLayerIds);
    const currentLookup = useSelectionStore.getState().selectedLayerLookup;
    const currentKeys = Object.keys(currentLookup);
    if (
      currentKeys.length === selectedLayerIds.length &&
      selectedLayerIds.every((id) => currentLookup[id] === true)
    ) {
      return;
    }
    useSelectionStore.setState({ selectedLayerLookup: nextLookup });
  },
);
