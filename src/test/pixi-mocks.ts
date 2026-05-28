import { vi } from "vitest";
import type { PixiAppRefs } from "@/hooks/usePixiApp";

export function createMockPixiRefs(): React.RefObject<PixiAppRefs> {
  const world = {
    label: "world",
    addChild: vi.fn(),
    removeChild: vi.fn(),
    destroy: vi.fn(),
    children: [],
  };
  const background = {
    label: "canvas-bg",
    clear: vi.fn(),
    rect: vi.fn(),
    fill: vi.fn(),
    destroy: vi.fn(),
  };
  const overlay = {
    label: "overlay",
    addChild: vi.fn(),
    removeChild: vi.fn(),
    destroy: vi.fn(),
    children: [],
  };
  return {
    current: {
      app: {
        stage: { addChild: vi.fn(), children: [] },
        canvas: document.createElement("canvas"),
        screen: { width: 1600, height: 900 },
        resize: vi.fn(),
        destroy: vi.fn(),
      },
      world,
      background,
      overlay,
    } as unknown as PixiAppRefs,
  } as React.RefObject<PixiAppRefs>;
}

export function createMinimalPixiRefs(): React.RefObject<PixiAppRefs> {
  return {
    current: {
      app: null,
      world: null,
      background: null,
      overlay: { addChild: vi.fn(), removeChild: vi.fn() },
    } as unknown as PixiAppRefs,
  } as React.RefObject<PixiAppRefs>;
}
