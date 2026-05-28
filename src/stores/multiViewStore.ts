import type { ParameterId } from "@vivi2d/core/types";
import { create } from "zustand";
import { withStandardMiddleware } from "./_middleware";

export interface ViewConfig {
  id: string;

  parameterOverrides: Record<ParameterId, number>;
  zoom: number;
  panX: number;
  panY: number;
}

export type ViewLayout = "horizontal" | "vertical" | "quad";

interface MultiViewState {
  enabled: boolean;
  views: ViewConfig[];
  layout: ViewLayout;
  activeViewId: string | null;
}

interface MultiViewActions {
  enableMultiView: (layout: ViewLayout) => void;
  disableMultiView: () => void;
  setLayout: (layout: ViewLayout) => void;
  setActiveView: (viewId: string) => void;
  setViewParamOverride: (viewId: string, paramId: string, value: number) => void;
  removeViewParamOverride: (viewId: string, paramId: string) => void;
  setViewZoom: (viewId: string, zoom: number) => void;
  setViewPan: (viewId: string, x: number, y: number) => void;
}

function createViews(layout: ViewLayout): ViewConfig[] {
  const count = layout === "quad" ? 4 : 2;
  return Array.from({ length: count }, (_, i) => ({
    id: `view-${i}`,
    parameterOverrides: {},
    zoom: 1,
    panX: 0,
    panY: 0,
  }));
}

export const useMultiViewStore = create<MultiViewState & MultiViewActions>()(
  withStandardMiddleware<MultiViewState & MultiViewActions>(
    (set) => ({
      enabled: false,
      views: [],
      layout: "horizontal",
      activeViewId: null,

      enableMultiView: (layout) =>
        set({
          enabled: true,
          layout,
          views: createViews(layout),
          activeViewId: "view-0",
        }),

      disableMultiView: () => set({ enabled: false, views: [], activeViewId: null }),

      setLayout: (layout) =>
        set((s) => {
          if (!s.enabled) return s;
          const views = createViews(layout);
          return { layout, views, activeViewId: views[0]?.id ?? null };
        }),

      setActiveView: (viewId) => set({ activeViewId: viewId }),

      setViewParamOverride: (viewId, paramId, value) =>
        set((s) => ({
          views: s.views.map((v) =>
            v.id === viewId
              ? {
                  ...v,
                  parameterOverrides: { ...v.parameterOverrides, [paramId]: value },
                }
              : v,
          ),
        })),

      removeViewParamOverride: (viewId, paramId) =>
        set((s) => ({
          views: s.views.map((v) => {
            if (v.id !== viewId) return v;
            const { [paramId]: _, ...rest } = v.parameterOverrides;
            return { ...v, parameterOverrides: rest };
          }),
        })),

      setViewZoom: (viewId, zoom) =>
        set((s) => ({
          views: s.views.map((v) => (v.id === viewId ? { ...v, zoom } : v)),
        })),

      setViewPan: (viewId, x, y) =>
        set((s) => ({
          views: s.views.map((v) => (v.id === viewId ? { ...v, panX: x, panY: y } : v)),
        })),
    }),
    { name: "MultiViewStore", persistEnabled: false },
  ),
);
