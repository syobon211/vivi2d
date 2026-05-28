import { act, renderHook } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useExpressionPresetHotkeys } from "../hooks/useExpressionPresetHotkeys";

type Preset = { id: string; name: string; hotkey: number };
type MockPresetModel = {
  project: { expressionPresets: Preset[] };
  applyExpressionPreset: ReturnType<typeof vi.fn>;
};

function makeModel(presets: Preset[]): MockPresetModel {
  return {
    project: { expressionPresets: presets },
    applyExpressionPreset: vi.fn(),
  };
}

describe("useExpressionPresetHotkeys", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("enabled=false のときは keydown listener を登録しない", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const ref = createRef<ReturnType<typeof makeModel>>();
    renderHook(() => useExpressionPresetHotkeys(false, ref as never));
    expect(addSpy.mock.calls.some(([event]) => event === "keydown")).toBe(false);
    addSpy.mockRestore();
  });

  it("enabled=true のとき keydown listener が登録される", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const ref = createRef<ReturnType<typeof makeModel>>();
    renderHook(() => useExpressionPresetHotkeys(true, ref as never));
    expect(addSpy.mock.calls.some(([event]) => event === "keydown")).toBe(true);
    addSpy.mockRestore();
  });

  it("該当 hotkey の preset があれば applyExpressionPreset が呼ばれ activePreset が返る", () => {
    const model = makeModel([
      { id: "smile", name: "笑顔", hotkey: 1 },
      { id: "angry", name: "怒り", hotkey: 2 },
    ]);
    const ref = { current: model };
    const { result } = renderHook(() => useExpressionPresetHotkeys(true, ref as never));

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "1" }));
    });

    expect(model.applyExpressionPreset).toHaveBeenCalledWith("smile");
    expect(result.current).toBe("1: 笑顔");
  });

  it("PRESET_DISPLAY_MS 経過後に activePreset が null に戻る", () => {
    const model = makeModel([{ id: "smile", name: "笑顔", hotkey: 1 }]);
    const ref = { current: model };
    const { result } = renderHook(() => useExpressionPresetHotkeys(true, ref as never));

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "1" }));
    });
    expect(result.current).toBe("1: 笑顔");

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current).toBeNull();
  });

  it("該当 hotkey の preset がない場合は何もしない", () => {
    const model = makeModel([{ id: "smile", name: "笑顔", hotkey: 1 }]);
    const ref = { current: model };
    const { result } = renderHook(() => useExpressionPresetHotkeys(true, ref as never));

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "5" }));
    });

    expect(model.applyExpressionPreset).not.toHaveBeenCalled();
    expect(result.current).toBeNull();
  });

  it("修飾キー押下中は発火しない", () => {
    const model = makeModel([{ id: "smile", name: "笑顔", hotkey: 1 }]);
    const ref = { current: model };
    const { result } = renderHook(() => useExpressionPresetHotkeys(true, ref as never));

    for (const mod of ["ctrlKey", "metaKey", "altKey", "shiftKey"] as const) {
      act(() => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "1", [mod]: true }));
      });
    }

    expect(model.applyExpressionPreset).not.toHaveBeenCalled();
    expect(result.current).toBeNull();
  });

  it("INPUT/TEXTAREA/SELECT でのイベントは発火しない", () => {
    const model = makeModel([{ id: "smile", name: "笑顔", hotkey: 1 }]);
    const ref = { current: model };
    const { result } = renderHook(() => useExpressionPresetHotkeys(true, ref as never));

    for (const tag of ["input", "textarea", "select"]) {
      const el = document.createElement(tag);
      document.body.appendChild(el);
      act(() => {
        el.dispatchEvent(new KeyboardEvent("keydown", { key: "1", bubbles: true }));
      });
      document.body.removeChild(el);
    }

    expect(model.applyExpressionPreset).not.toHaveBeenCalled();
    expect(result.current).toBeNull();
  });

  it("modelRef.current=null のときは何もしない", () => {
    const ref = { current: null };
    const { result } = renderHook(() => useExpressionPresetHotkeys(true, ref as never));

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "1" }));
    });

    expect(result.current).toBeNull();
  });

  it("unmount で keydown listener が解除される", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const ref = createRef<ReturnType<typeof makeModel>>();
    const { unmount } = renderHook(() =>
      useExpressionPresetHotkeys(true, ref as never),
    );

    unmount();

    expect(removeSpy.mock.calls.some(([event]) => event === "keydown")).toBe(true);
    removeSpy.mockRestore();
  });
});
