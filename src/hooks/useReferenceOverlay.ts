import { findLayerById } from "@vivi2d/core/layer-utils";
import { isViviMesh } from "@vivi2d/core/types";
import {
  createOverlayContainer,
  createRectOverlaySprite,
  createTexturedOverlaySprite,
  destroyOverlayContainer,
  type EditorOverlayContainer,
} from "@vivi2d/renderer-pixi/editor-overlays";
import { useEffect, useRef } from "react";
import {
  getCurrentReferenceBounds,
  getImportedReferenceBounds,
  getReferenceOverlayDifferenceRects,
  type ReferenceOverlayBounds,
  type ReferenceOverlayBoundsMode,
  resolveReferenceOverlayBounds,
} from "@/lib/reference-overlay-utils";
import { getTexture } from "@/lib/texture-store";
import { useEditorStore } from "@/stores/editorStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { useViewportStore } from "@/stores/viewportStore";
import type { PixiAppRefs } from "./usePixiApp";

const REFERENCE_OVERLAY_ZINDEX = 1_000_000;
const SOURCE_TINT = 0x8dd96f;
const CURRENT_BOUNDS_TINT = 0x4dc0ff;
const IMPORTED_BOUNDS_TINT = 0xffb54d;

function getReferenceOverlayTint(mode: ReferenceOverlayBoundsMode): number {
  switch (mode) {
    case "source":
      return SOURCE_TINT;
    case "currentBounds":
      return CURRENT_BOUNDS_TINT;
    case "importedBounds":
      return IMPORTED_BOUNDS_TINT;
  }
}

function addBoundsOverlay(
  container: EditorOverlayContainer,
  label: string,
  bounds: ReferenceOverlayBounds,
  opacity: number,
  tint: number,
) {
  const sprite = createRectOverlaySprite({
    label,
    bounds,
    alpha: opacity,
    tint,
  });
  container.addChild(sprite);
}

function addDifferenceOverlays(
  container: EditorOverlayContainer,
  layerId: string,
  primaryMode: ReferenceOverlayBoundsMode,
  secondaryMode: ReferenceOverlayBoundsMode,
  primaryBounds: ReferenceOverlayBounds,
  secondaryBounds: ReferenceOverlayBounds,
  opacity: number,
) {
  const differenceRects = getReferenceOverlayDifferenceRects(
    primaryBounds,
    secondaryBounds,
  );
  const primaryTint = getReferenceOverlayTint(primaryMode);
  const secondaryTint = getReferenceOverlayTint(secondaryMode);
  differenceRects.primaryOnly.forEach((rect, index) => {
    addBoundsOverlay(
      container,
      `reference-overlay:difference:${primaryMode}:${secondaryMode}:primary:${layerId}:${index}`,
      rect,
      Math.min(1, opacity * 0.75),
      primaryTint,
    );
  });
  differenceRects.secondaryOnly.forEach((rect, index) => {
    addBoundsOverlay(
      container,
      `reference-overlay:difference:${primaryMode}:${secondaryMode}:secondary:${layerId}:${index}`,
      rect,
      Math.min(1, opacity * 0.75),
      secondaryTint,
    );
  });
}

export function useReferenceOverlay(pixiRefs: React.RefObject<PixiAppRefs>) {
  const containerRef = useRef<EditorOverlayContainer | null>(null);

  const project = useEditorStore((s) => s.project);
  const selectedLayerId = useSelectionStore((s) => s.selectedLayerId);
  const referenceOverlay = useViewportStore((s) => s.referenceOverlay);

  useEffect(() => {
    const world = pixiRefs.current.world;
    if (!world) return;

    if (containerRef.current) {
      destroyOverlayContainer(containerRef.current);
      containerRef.current = null;
    }

    if (!referenceOverlay.enabled || !project || !selectedLayerId) return;

    const selectedLayer = findLayerById(project.layers, selectedLayerId);
    if (!selectedLayer || !isViviMesh(selectedLayer)) return;

    const container = createOverlayContainer(
      world,
      "reference-overlay",
      REFERENCE_OVERLAY_ZINDEX,
    );
    containerRef.current = container;

    try {
      if (referenceOverlay.mode === "source") {
        const canvas = getTexture(selectedLayer.id);
        if (!canvas || canvas.width === 0 || canvas.height === 0) {
          destroyOverlayContainer(container);
          containerRef.current = null;
          return;
        }
        const sprite = createTexturedOverlaySprite({
          textureSource: canvas,
          label: `reference-overlay:source:${selectedLayer.id}`,
          bounds: {
            x: selectedLayer.x,
            y: selectedLayer.y,
            width: selectedLayer.width,
            height: selectedLayer.height,
          },
          alpha: referenceOverlay.opacity,
        });
        container.addChild(sprite);
      } else if (referenceOverlay.mode === "compareBounds") {
        const primaryMode = referenceOverlay.comparePrimary ?? "currentBounds";
        const secondaryMode = referenceOverlay.compareSecondary ?? "importedBounds";
        const primaryBounds = resolveReferenceOverlayBounds(selectedLayer, primaryMode);
        const secondaryBounds = resolveReferenceOverlayBounds(
          selectedLayer,
          secondaryMode,
        );
        if (
          !primaryBounds ||
          !secondaryBounds ||
          primaryBounds.width === 0 ||
          primaryBounds.height === 0 ||
          secondaryBounds.width === 0 ||
          secondaryBounds.height === 0
        ) {
          destroyOverlayContainer(container);
          containerRef.current = null;
          return;
        }
        addBoundsOverlay(
          container,
          `reference-overlay:comparePrimary:${primaryMode}:${selectedLayer.id}`,
          primaryBounds,
          Math.min(1, referenceOverlay.opacity * 0.45),
          getReferenceOverlayTint(primaryMode),
        );
        addBoundsOverlay(
          container,
          `reference-overlay:compareSecondary:${secondaryMode}:${selectedLayer.id}`,
          secondaryBounds,
          Math.min(1, referenceOverlay.opacity * 0.5),
          getReferenceOverlayTint(secondaryMode),
        );
        if (referenceOverlay.highlightDifferences !== false) {
          addDifferenceOverlays(
            container,
            selectedLayer.id,
            primaryMode,
            secondaryMode,
            primaryBounds,
            secondaryBounds,
            referenceOverlay.opacity,
          );
        }
      } else {
        const bounds =
          referenceOverlay.mode === "currentBounds"
            ? getCurrentReferenceBounds(selectedLayer)
            : referenceOverlay.mode === "importedBounds"
              ? getImportedReferenceBounds(selectedLayer)
              : resolveReferenceOverlayBounds(selectedLayer, referenceOverlay.mode);
        if (!bounds || bounds.width === 0 || bounds.height === 0) {
          destroyOverlayContainer(container);
          containerRef.current = null;
          return;
        }
        addBoundsOverlay(
          container,
          `reference-overlay:${referenceOverlay.mode}:${selectedLayer.id}`,
          bounds,
          Math.min(1, referenceOverlay.opacity * 0.5),
          getReferenceOverlayTint(referenceOverlay.mode),
        );
      }
    } catch {
      destroyOverlayContainer(container);
      containerRef.current = null;
    }

    return () => {
      if (containerRef.current) {
        destroyOverlayContainer(containerRef.current);
        containerRef.current = null;
      }
    };
  }, [
    pixiRefs,
    project,
    referenceOverlay.enabled,
    referenceOverlay.mode,
    referenceOverlay.opacity,
    referenceOverlay.comparePrimary,
    referenceOverlay.compareSecondary,
    referenceOverlay.highlightDifferences,
    selectedLayerId,
  ]);
}
