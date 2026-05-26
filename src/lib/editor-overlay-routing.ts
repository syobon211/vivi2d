import type { Tool } from "@vivi2d/core/types";

export type SelectedOverlayKind = "bone" | null;
export type ActiveOverlayInteraction =
  | "mesh"
  | "collider"
  | "ik"
  | "bone"
  | "viewport"
  | null;

export interface PointerDownOverlayTargets {
  mesh: boolean;
  collider: boolean;
  ik: boolean;
  bone: boolean;
  viewport: boolean;
}

export function shouldEnableSelectionOverlay(activeTool: Tool): boolean {
  return activeTool === "select";
}

export function resolvePointerDownOverlayTargets(
  activeTool: Tool,
  selectedOverlayKind: SelectedOverlayKind,
): PointerDownOverlayTargets {
  if (activeTool === "meshEdit") {
    return {
      mesh: true,
      collider: false,
      ik: false,
      bone: false,
      viewport: true,
    };
  }

  if (activeTool === "select") {
    return {
      mesh: false,
      collider: true,
      ik: true,
      bone: selectedOverlayKind === "bone",
      viewport: true,
    };
  }

  return {
    mesh: false,
    collider: false,
    ik: false,
    bone: false,
    viewport: true,
  };
}

export function resolvePointerMoveOverlayTarget(
  activeInteraction: ActiveOverlayInteraction,
): Exclude<ActiveOverlayInteraction, null> {
  return activeInteraction ?? "viewport";
}
