import {
  capturePointer,
  releasePointer,
  screenToWorld,
  worldToScreen,
} from "@vivi2d/core/coord-utils";
import { describe, expect, it, vi } from "vitest";

describe("worldToScreen", () => {
  it("ワールド座標をスクリーン座標に変換する", () => {
    const result = worldToScreen(100, 50, 2, 10, 20);
    // sx = 100 * 2 + 10 = 210
    // sy = 50 * 2 + 20 = 120
    expect(result.sx).toBe(210);
    expect(result.sy).toBe(120);
  });

  it("zoom=1, pan=(0,0) で入力がそのまま返る", () => {
    const result = worldToScreen(42, 73, 1, 0, 0);
    expect(result.sx).toBe(42);
    expect(result.sy).toBe(73);
  });

  it("zoom のみ適用される場合", () => {
    const result = worldToScreen(50, 25, 3, 0, 0);
    expect(result.sx).toBe(150);
    expect(result.sy).toBe(75);
  });

  it("pan のみ適用される場合（zoom=1）", () => {
    const result = worldToScreen(50, 25, 1, 100, -50);
    expect(result.sx).toBe(150);
    expect(result.sy).toBe(-25);
  });

  it("原点 (0,0) はパンオフセット分だけずれる", () => {
    const result = worldToScreen(0, 0, 5, 30, 40);
    expect(result.sx).toBe(30);
    expect(result.sy).toBe(40);
  });

  it("負のワールド座標を正しく変換する", () => {
    const result = worldToScreen(-100, -200, 2, 50, 60);
    expect(result.sx).toBe(-150); // -100 * 2 + 50
    expect(result.sy).toBe(-340); // -200 * 2 + 60
  });

  it("非常に小さいズーム値（極小スケール）", () => {
    const result = worldToScreen(1000, 2000, 0.05, 0, 0);
    expect(result.sx).toBeCloseTo(50);
    expect(result.sy).toBeCloseTo(100);
  });

  it("非常に大きいズーム値（高倍率）", () => {
    const result = worldToScreen(1, 1, 32, 0, 0);
    expect(result.sx).toBe(32);
    expect(result.sy).toBe(32);
  });

  it("負のパン値を正しく処理する", () => {
    const result = worldToScreen(100, 100, 1, -200, -300);
    expect(result.sx).toBe(-100);
    expect(result.sy).toBe(-200);
  });

  it("小数のワールド座標を正しく変換する", () => {
    const result = worldToScreen(0.5, 0.25, 4, 10, 10);
    expect(result.sx).toBeCloseTo(12);
    expect(result.sy).toBeCloseTo(11);
  });
});

describe("screenToWorld", () => {
  it("スクリーン座標をワールド座標に変換する", () => {
    const result = screenToWorld(210, 120, 2, 10, 20);
    // wx = (210 - 10) / 2 = 100
    // wy = (120 - 20) / 2 = 50
    expect(result.wx).toBe(100);
    expect(result.wy).toBe(50);
  });

  it("zoom=1, pan=(0,0) で入力がそのまま返る", () => {
    const result = screenToWorld(42, 73, 1, 0, 0);
    expect(result.wx).toBe(42);
    expect(result.wy).toBe(73);
  });

  it("パンオフセットを考慮する", () => {
    const result = screenToWorld(150, 100, 1, 50, 25);
    expect(result.wx).toBe(100);
    expect(result.wy).toBe(75);
  });

  it("ズーム倍率を考慮する", () => {
    const result = screenToWorld(300, 200, 4, 0, 0);
    expect(result.wx).toBe(75);
    expect(result.wy).toBe(50);
  });

  it("負のスクリーン座標を正しく変換する", () => {
    const result = screenToWorld(-100, -200, 2, 0, 0);
    expect(result.wx).toBe(-50);
    expect(result.wy).toBe(-100);
  });

  it("小数のズーム値で精度が保たれる", () => {
    const result = screenToWorld(100, 100, 0.5, 0, 0);
    expect(result.wx).toBeCloseTo(200);
    expect(result.wy).toBeCloseTo(200);
  });
});

describe("worldToScreen ↔ screenToWorld 往復変換", () => {
  const testCases = [
    { wx: 0, wy: 0, zoom: 1, panX: 0, panY: 0 },
    { wx: 100, wy: 200, zoom: 2, panX: 50, panY: -30 },
    { wx: -50, wy: -75, zoom: 0.5, panX: 100, panY: 200 },
    { wx: 999.5, wy: 0.001, zoom: 3.7, panX: -500, panY: 0 },
    { wx: 0, wy: 0, zoom: 32, panX: 1000, panY: 1000 },
    { wx: 0, wy: 0, zoom: 0.05, panX: -1000, panY: -1000 },
    { wx: 1234.5678, wy: -9876.5432, zoom: 1.5, panX: 42, panY: -42 },
  ];

  it.each(
    testCases,
  )("worldToScreen → screenToWorld で元に戻る (wx=$wx, wy=$wy, zoom=$zoom)", ({
    wx,
    wy,
    zoom,
    panX,
    panY,
  }) => {
    const screen = worldToScreen(wx, wy, zoom, panX, panY);
    const world = screenToWorld(screen.sx, screen.sy, zoom, panX, panY);
    expect(world.wx).toBeCloseTo(wx, 10);
    expect(world.wy).toBeCloseTo(wy, 10);
  });

  it.each(
    testCases,
  )("screenToWorld → worldToScreen で元に戻る (wx=$wx, wy=$wy, zoom=$zoom)", ({
    wx: sx,
    wy: sy,
    zoom,
    panX,
    panY,
  }) => {
    const world = screenToWorld(sx, sy, zoom, panX, panY);
    const screen = worldToScreen(world.wx, world.wy, zoom, panX, panY);
    expect(screen.sx).toBeCloseTo(sx, 10);
    expect(screen.sy).toBeCloseTo(sy, 10);
  });
});

describe("capturePointer", () => {
  it("HTMLElement ターゲットで setPointerCapture を呼ぶ", () => {
    const el = document.createElement("div");
    vi.spyOn(el, "setPointerCapture").mockImplementation(() => {});
    const event = { target: el, pointerId: 42 } as unknown as React.PointerEvent;

    capturePointer(event);
    expect(el.setPointerCapture).toHaveBeenCalledWith(42);
  });

  it("非 HTMLElement ターゲットでは何もしない", () => {
    const event = {
      target: { notAnElement: true },
      pointerId: 1,
    } as unknown as React.PointerEvent;

    expect(() => capturePointer(event)).not.toThrow();
  });

  it("SVGElement ターゲットでは呼ばれない", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const event = { target: svg, pointerId: 1 } as unknown as React.PointerEvent;
    expect(() => capturePointer(event)).not.toThrow();
  });
});

describe("releasePointer", () => {
  it("HTMLElement ターゲットで releasePointerCapture を呼ぶ", () => {
    const el = document.createElement("div");
    vi.spyOn(el, "releasePointerCapture").mockImplementation(() => {});
    const event = { target: el, pointerId: 7 } as unknown as React.PointerEvent;

    releasePointer(event);
    expect(el.releasePointerCapture).toHaveBeenCalledWith(7);
  });

  it("非 HTMLElement ターゲットでは何もしない", () => {
    const event = {
      target: null,
      pointerId: 1,
    } as unknown as React.PointerEvent;

    expect(() => releasePointer(event)).not.toThrow();
  });
});
