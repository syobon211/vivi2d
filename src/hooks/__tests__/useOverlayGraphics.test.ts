import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useOverlayGraphics } from "../useOverlayGraphics";
import type { PixiAppRefs } from "../usePixiApp";

function createPixiRefs(overlay?: {
  addChild: ReturnType<typeof vi.fn>;
  removeChild: ReturnType<typeof vi.fn>;
}) {
  return {
    current: {
      app: null,
      world: null,
      background: null,
      overlay: overlay ?? null,
    } as PixiAppRefs,
  } as React.RefObject<PixiAppRefs>;
}

function createMockOverlay() {
  return {
    addChild: vi.fn(),
    removeChild: vi.fn(),
    destroy: vi.fn(),
    children: [],
    label: "overlay",
  };
}

describe("useOverlayGraphics", () => {
  it("creates a Graphics instance and adds it to the overlay", () => {
    const overlay = createMockOverlay();
    const pixiRefs = createPixiRefs(overlay);

    const { result } = renderHook(() => useOverlayGraphics(pixiRefs, "test-graphics"));

    expect(result.current.current).not.toBeNull();
    expect(overlay.addChild).toHaveBeenCalledTimes(1);
    expect(overlay.addChild).toHaveBeenCalledWith(result.current.current);
  });

  it("applies the requested label to the created graphics", () => {
    const overlay = createMockOverlay();
    const pixiRefs = createPixiRefs(overlay);

    const { result } = renderHook(() => useOverlayGraphics(pixiRefs, "my-label"));

    expect(result.current.current).not.toBeNull();
    expect(result.current.current?.label).toBe("my-label");
  });

  it("destroys the graphics instance on unmount", () => {
    const overlay = createMockOverlay();
    const pixiRefs = createPixiRefs(overlay);

    const { result, unmount } = renderHook(() =>
      useOverlayGraphics(pixiRefs, "test-graphics"),
    );

    const graphicsInstance = result.current.current;
    expect(graphicsInstance).not.toBeNull();

    unmount();

    expect(graphicsInstance?.destroy).toHaveBeenCalledTimes(1);
    expect(result.current.current).toBeNull();
  });

  it("returns null when the Pixi overlay container is unavailable", () => {
    const pixiRefs = createPixiRefs(undefined);

    const { result } = renderHook(() => useOverlayGraphics(pixiRefs, "no-overlay"));

    expect(result.current.current).toBeNull();
  });

  it("recreates the graphics instance when the label changes", () => {
    const overlay = createMockOverlay();
    const pixiRefs = createPixiRefs(overlay);

    const { result, rerender } = renderHook(
      ({ label }) => useOverlayGraphics(pixiRefs, label),
      { initialProps: { label: "label-a" } },
    );

    const firstGraphics = result.current.current;
    expect(firstGraphics).not.toBeNull();
    expect(firstGraphics?.label).toBe("label-a");

    rerender({ label: "label-b" });

    expect(firstGraphics?.destroy).toHaveBeenCalledTimes(1);
    const secondGraphics = result.current.current;
    expect(secondGraphics).not.toBeNull();
    expect(secondGraphics?.label).toBe("label-b");
    expect(secondGraphics).not.toBe(firstGraphics);
  });

  it("keeps the same graphics instance when the label is stable", () => {
    const overlay = createMockOverlay();
    const pixiRefs = createPixiRefs(overlay);

    const { result, rerender } = renderHook(
      ({ label }) => useOverlayGraphics(pixiRefs, label),
      { initialProps: { label: "stable" } },
    );

    const firstGraphics = result.current.current;
    rerender({ label: "stable" });

    expect(result.current.current).toBe(firstGraphics);
    expect(firstGraphics?.destroy).not.toHaveBeenCalled();
  });

  it("does not create graphics while disabled", () => {
    const overlay = createMockOverlay();
    const pixiRefs = createPixiRefs(overlay);

    const { result } = renderHook(() => useOverlayGraphics(pixiRefs, "disabled", false));

    expect(result.current.current).toBeNull();
    expect(overlay.addChild).not.toHaveBeenCalled();
  });

  it("destroys the current graphics instance when disabled toggles off", () => {
    const overlay = createMockOverlay();
    const pixiRefs = createPixiRefs(overlay);

    const { result, rerender } = renderHook(
      ({ enabled }) => useOverlayGraphics(pixiRefs, "toggle", enabled),
      { initialProps: { enabled: true } },
    );

    const firstGraphics = result.current.current;
    expect(firstGraphics).not.toBeNull();

    rerender({ enabled: false });

    expect(firstGraphics?.destroy).toHaveBeenCalledTimes(1);
    expect(result.current.current).toBeNull();
  });

  it("returns a stable RefObject shape", () => {
    const overlay = createMockOverlay();
    const pixiRefs = createPixiRefs(overlay);

    const { result } = renderHook(() => useOverlayGraphics(pixiRefs, "type-check"));

    expect(result.current).toHaveProperty("current");
    expect(result.current.current).not.toBeNull();
  });
});
