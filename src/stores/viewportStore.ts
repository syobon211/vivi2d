import { VIEWPORT } from "@vivi2d/core/constants";
import type { Tool } from "@vivi2d/core/types";
import { create } from "zustand";
import { measureE2EPerfProbe } from "@/lib/e2e-perf-probe";
import type { ReferenceOverlayBoundsMode } from "@/lib/reference-overlay-utils";
import { withStandardMiddleware } from "./_middleware";

function clampZoom(z: number): number {
  return Math.max(VIEWPORT.ZOOM_MIN, Math.min(VIEWPORT.ZOOM_MAX, z));
}

export interface OnionSkinSettings {
  enabled: boolean;

  framesBefore: number;

  framesAfter: number;

  opacity: number;
}

export interface MeshHeatmapSettings {
  enabled: boolean;
  intensity: number;
}

export interface ReferenceOverlaySettings {
  enabled: boolean;
  opacity: number;
  mode: ReferenceOverlayBoundsMode | "compareBounds";
  comparePrimary?: ReferenceOverlayBoundsMode;
  compareSecondary?: ReferenceOverlayBoundsMode;
  highlightDifferences?: boolean;
  pinCompareSummary?: boolean;
}

interface ViewportState {
  zoom: number;
  panX: number;
  panY: number;
  activeTool: Tool;

  defaultFormLocked: boolean;

  onionSkin: OnionSkinSettings;
  meshHeatmap: MeshHeatmapSettings;
  referenceOverlay: ReferenceOverlaySettings;
}

interface ViewportActions {
  setZoom: (zoom: number) => void;
  setPan: (x: number, y: number) => void;
  adjustZoom: (delta: number, centerX: number, centerY: number) => void;
  setTool: (tool: Tool) => void;
  resetView: () => void;
  toggleDefaultFormLock: () => void;
  toggleOnionSkin: () => void;
  setOnionSkinSettings: (settings: Partial<OnionSkinSettings>) => void;
  toggleMeshHeatmap: () => void;
  setMeshHeatmapSettings: (settings: Partial<MeshHeatmapSettings>) => void;
  toggleReferenceOverlay: () => void;
  setReferenceOverlaySettings: (settings: Partial<ReferenceOverlaySettings>) => void;
}

export type ViewportStore = ViewportState & ViewportActions;

export const useViewportStore = create<ViewportStore>()(
  withStandardMiddleware<ViewportStore>(
    (set) => ({
      zoom: 1,
      panX: 0,
      panY: 0,
      activeTool: "select",
      defaultFormLocked: false,
      onionSkin: { enabled: false, framesBefore: 3, framesAfter: 3, opacity: 0.25 },
      meshHeatmap: { enabled: false, intensity: 1 },
      referenceOverlay: {
        enabled: false,
        opacity: 0.35,
        mode: "source",
        comparePrimary: "currentBounds",
        compareSecondary: "importedBounds",
        highlightDifferences: true,
        pinCompareSummary: false,
      },

      setZoom: (zoom) => set({ zoom: clampZoom(zoom) }),

      setPan: (x, y) => set({ panX: x, panY: y }),

      adjustZoom: (delta, centerX, centerY) =>
        set((s) => {
          const factor = delta > 0 ? VIEWPORT.ZOOM_FACTOR : 1 / VIEWPORT.ZOOM_FACTOR;
          const newZoom = clampZoom(s.zoom * factor);
          const scale = newZoom / s.zoom;
          return {
            zoom: newZoom,
            panX: centerX - (centerX - s.panX) * scale,
            panY: centerY - (centerY - s.panY) * scale,
          };
        }),

      setTool: (tool) =>
        measureE2EPerfProbe("viewportStore.setTool", () => set({ activeTool: tool }), {
          tool,
        }),

      resetView: () => set({ zoom: 1, panX: 0, panY: 0 }),

      toggleDefaultFormLock: () =>
        set((s) => ({ defaultFormLocked: !s.defaultFormLocked })),

      toggleOnionSkin: () =>
        set((s) => ({
          onionSkin: { ...s.onionSkin, enabled: !s.onionSkin.enabled },
        })),

      setOnionSkinSettings: (settings) =>
        set((s) => ({
          onionSkin: { ...s.onionSkin, ...settings },
        })),

      toggleMeshHeatmap: () =>
        set((s) => ({
          meshHeatmap: { ...s.meshHeatmap, enabled: !s.meshHeatmap.enabled },
        })),

      setMeshHeatmapSettings: (settings) =>
        set((s) => ({
          meshHeatmap: { ...s.meshHeatmap, ...settings },
        })),

      toggleReferenceOverlay: () =>
        set((s) => ({
          referenceOverlay: {
            ...s.referenceOverlay,
            enabled: !s.referenceOverlay.enabled,
          },
        })),

      setReferenceOverlaySettings: (settings) =>
        set((s) => ({
          referenceOverlay: { ...s.referenceOverlay, ...settings },
        })),
    }),
    { name: "ViewportStore", persistEnabled: false },
  ),
);
