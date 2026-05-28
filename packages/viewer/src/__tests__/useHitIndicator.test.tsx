import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UI_TIMING } from "../constants";
import { useHitIndicator } from "../hooks/useHitIndicator";

describe("useHitIndicator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("初期値は lastHit=null", () => {
    const { result } = renderHook(() => useHitIndicator());
    expect(result.current.lastHit).toBeNull();
  });

  it("showHit 呼び出しで lastHit がセットされる", () => {
    const { result } = renderHook(() => useHitIndicator());
    act(() => {
      result.current.showHit("head [face]");
    });
    expect(result.current.lastHit).toBe("head [face]");
  });

  it("HIT_DISPLAY_MS 経過後に lastHit が null に戻る", () => {
    const { result } = renderHook(() => useHitIndicator());
    act(() => {
      result.current.showHit("chest");
    });
    expect(result.current.lastHit).toBe("chest");

    act(() => {
      vi.advanceTimersByTime(UI_TIMING.HIT_DISPLAY_MS);
    });
    expect(result.current.lastHit).toBeNull();
  });

  it("HIT_DISPLAY_MS 経過前は lastHit が保持される", () => {
    const { result } = renderHook(() => useHitIndicator());
    act(() => {
      result.current.showHit("chest");
    });
    act(() => {
      vi.advanceTimersByTime(UI_TIMING.HIT_DISPLAY_MS - 100);
    });
    expect(result.current.lastHit).toBe("chest");
  });

  it("連続 showHit で上書きされ timer がリセットされる", () => {
    const { result } = renderHook(() => useHitIndicator());
    act(() => {
      result.current.showHit("A");
    });
    act(() => {
      vi.advanceTimersByTime(UI_TIMING.HIT_DISPLAY_MS - 100);
    });
    act(() => {
      result.current.showHit("B");
    });
    expect(result.current.lastHit).toBe("B");

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current.lastHit).toBe("B");

    act(() => {
      vi.advanceTimersByTime(UI_TIMING.HIT_DISPLAY_MS);
    });
    expect(result.current.lastHit).toBeNull();
  });

  it("連続 showHit で pending timer は 1 本のみ保持される", () => {
    const { result } = renderHook(() => useHitIndicator());
    act(() => {
      result.current.showHit("A");
    });
    expect(vi.getTimerCount()).toBe(1);
    act(() => {
      result.current.showHit("B");
    });
    expect(vi.getTimerCount()).toBe(1);
  });

  it("unmount 時に pending timeout が実際にキャンセルされる（副作用抑止）", () => {
    const { result, unmount } = renderHook(() => useHitIndicator());
    act(() => {
      result.current.showHit("Pending");
    });
    expect(vi.getTimerCount()).toBe(1);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
    expect(() => {
      vi.advanceTimersByTime(UI_TIMING.HIT_DISPLAY_MS * 2);
    }).not.toThrow();
  });

  it("pending timer がない状態で unmount しても例外を起こさない", () => {
    const { unmount } = renderHook(() => useHitIndicator());
    expect(() => unmount()).not.toThrow();
  });

  it("showHit の関数参照はレンダ間で安定", () => {
    const { result, rerender } = renderHook(() => useHitIndicator());
    const first = result.current.showHit;
    rerender();
    expect(result.current.showHit).toBe(first);
  });
});
