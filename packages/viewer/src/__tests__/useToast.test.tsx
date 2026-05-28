import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UI_TIMING } from "../constants";
import { useToast } from "../hooks/useToast";

describe("useToast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("初期値は toast=null", () => {
    const { result } = renderHook(() => useToast());
    expect(result.current.toast).toBeNull();
  });

  it("showToast 呼び出しで toast がセットされる", () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.showToast("Saved!");
    });
    expect(result.current.toast).toBe("Saved!");
  });

  it("TOAST_DISPLAY_MS 経過後に toast が null に戻る", () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.showToast("Saved!");
    });
    expect(result.current.toast).toBe("Saved!");

    act(() => {
      vi.advanceTimersByTime(UI_TIMING.TOAST_DISPLAY_MS);
    });
    expect(result.current.toast).toBeNull();
  });

  it("TOAST_DISPLAY_MS 経過前は toast が保持される", () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.showToast("Saved!");
    });
    act(() => {
      vi.advanceTimersByTime(UI_TIMING.TOAST_DISPLAY_MS - 100);
    });
    expect(result.current.toast).toBe("Saved!");
  });

  it("連続 showToast で上書きされ timer がリセットされる", () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.showToast("First");
    });
    act(() => {
      vi.advanceTimersByTime(UI_TIMING.TOAST_DISPLAY_MS - 100);
    });
    act(() => {
      result.current.showToast("Second");
    });
    expect(result.current.toast).toBe("Second");

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current.toast).toBe("Second");

    act(() => {
      vi.advanceTimersByTime(UI_TIMING.TOAST_DISPLAY_MS);
    });
    expect(result.current.toast).toBeNull();
  });

  it("連続 showToast で pending timer は 1 本のみ保持される", () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.showToast("A");
    });
    expect(vi.getTimerCount()).toBe(1);
    act(() => {
      result.current.showToast("B");
    });
    expect(vi.getTimerCount()).toBe(1);
  });

  it("unmount 時に pending timeout が実際にキャンセルされる（副作用抑止）", () => {
    const { result, unmount } = renderHook(() => useToast());
    act(() => {
      result.current.showToast("Pending");
    });
    expect(vi.getTimerCount()).toBe(1);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
    expect(() => {
      vi.advanceTimersByTime(UI_TIMING.TOAST_DISPLAY_MS * 2);
    }).not.toThrow();
  });

  it("pending timer がない状態で unmount しても例外を起こさない", () => {
    const { unmount } = renderHook(() => useToast());
    expect(() => unmount()).not.toThrow();
  });

  it("showToast の関数参照はレンダ間で安定", () => {
    const { result, rerender } = renderHook(() => useToast());
    const first = result.current.showToast;
    rerender();
    expect(result.current.showToast).toBe(first);
  });
});
