import { describe, expect, it } from "vitest";
import {
  resolvePointerDownOverlayTargets,
  resolvePointerMoveOverlayTarget,
  shouldEnableSelectionOverlay,
} from "../editor-overlay-routing";

describe("editor overlay routing", () => {
  it("enables selection overlays only for the select tool", () => {
    expect(shouldEnableSelectionOverlay("select")).toBe(true);
    expect(shouldEnableSelectionOverlay("pan")).toBe(false);
    expect(shouldEnableSelectionOverlay("meshEdit")).toBe(false);
  });

  it("routes mesh-edit pointer down to mesh and viewport only", () => {
    expect(resolvePointerDownOverlayTargets("meshEdit", null)).toEqual({
      mesh: true,
      collider: false,
      ik: false,
      bone: false,
      viewport: true,
    });
  });

  it("routes select pointer down to collider, ik, and the selected structural overlay", () => {
    expect(resolvePointerDownOverlayTargets("select", "bone")).toEqual({
      mesh: false,
      collider: true,
      ik: true,
      bone: true,
      viewport: true,
    });
    expect(resolvePointerDownOverlayTargets("select", null)).toEqual({
      mesh: false,
      collider: true,
      ik: true,
      bone: false,
      viewport: true,
    });
  });

  it("routes pan pointer down to viewport only", () => {
    expect(resolvePointerDownOverlayTargets("pan", "bone")).toEqual({
      mesh: false,
      collider: false,
      ik: false,
      bone: false,
      viewport: true,
    });
  });

  it("falls back to viewport move routing when no overlay is active", () => {
    expect(resolvePointerMoveOverlayTarget("mesh")).toBe("mesh");
    expect(resolvePointerMoveOverlayTarget(null)).toBe("viewport");
  });
});
