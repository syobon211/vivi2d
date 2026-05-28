import { act, renderHook } from "@testing-library/react";
import type { ViviModel } from "@vivi2d/core/model";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useScriptRunner } from "../hooks/useScriptRunner";

// ============================================================
// useScriptRunner integration test (P7-17)
// ============================================================

function createDummyModel(): ViviModel {
  const model = {
    setParameter: vi.fn(),
    setParameters: vi.fn(),
    resetParameters: vi.fn(),
    applyExpressionPreset: vi.fn(),
    update: vi.fn(),
    project: {
      parameters: [
        { id: "p1", name: "param1" },
        { id: "p2", name: "param2" },
      ],
      expressionPresets: [{ id: "preset-smile", name: "smile" }],
    },
  };
  return model as unknown as ViviModel;
}

function renderUseScriptRunner(initialModel: ViviModel | null = null) {
  return renderHook(() => {
    const modelRef = useRef<ViviModel | null>(initialModel);
    return { ...useScriptRunner(modelRef), modelRef };
  });
}

describe("useScriptRunner integration: sandbox escape (P7-17)", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("任意のJavaScript構文 (window.location, fetch) は preset 名 lookup に落ち副作用ゼロ", async () => {
    const model = createDummyModel();
    const { result } = renderUseScriptRunner(model);
    act(() => {
      result.current.setScriptInput("window.location='evil.com' fetch('//attacker')");
    });
    await act(async () => {
      await result.current.runScript();
    });
    expect(model.applyExpressionPreset).not.toHaveBeenCalled();
    expect(model.setParameter).not.toHaveBeenCalled();
    expect(model.resetParameters).not.toHaveBeenCalled();
    expect(result.current.scriptRunning).toBe(false);
  });

  it("__proto__ pollution 試行は ident 扱いで Object.prototype に副作用なし", async () => {
    const model = createDummyModel();
    const beforeKeys = Object.getOwnPropertyNames(Object.prototype).slice();
    const { result } = renderUseScriptRunner(model);
    act(() => {
      result.current.setScriptInput("__proto__ polluted constructor");
    });
    await act(async () => {
      await result.current.runScript();
    });
    const afterKeys = Object.getOwnPropertyNames(Object.prototype);
    expect(afterKeys).toEqual(beforeKeys);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(model.applyExpressionPreset).not.toHaveBeenCalled();
  });

  it("HTML/script タグはトークナイザが記号をスキップし副作用なし", async () => {
    const model = createDummyModel();
    const { result } = renderUseScriptRunner(model);
    act(() => {
      result.current.setScriptInput("<script>alert(1)</script>");
    });
    await act(async () => {
      await result.current.runScript();
    });
    expect(model.applyExpressionPreset).not.toHaveBeenCalled();
    expect(model.setParameter).not.toHaveBeenCalled();
  });

  it("loop(0) sync body でも cancel callback で1イテレーション後に停止 (DoS 耐性)", async () => {
    const model = createDummyModel();
    let count = 0;
    const { result } = renderUseScriptRunner(model);
    (model.resetParameters as ReturnType<typeof vi.fn>).mockImplementation(() => {
      count++;
      if (count === 1) {
        throw new Error("stop-after-one");
      }
    });
    act(() => {
      result.current.setScriptInput("loop(0) { reset }");
    });
    await act(async () => {
      await expect(result.current.runScript()).rejects.toThrow("stop-after-one");
    });
    expect(count).toBe(1);
    expect(result.current.scriptRunning).toBe(false);
  });

  it("深くネスト (50階層) した brace が stack-safe にパースされ実行できる", async () => {
    const model = createDummyModel();
    const depth = 50;
    const open = "loop(1) {".repeat(depth);
    const close = "}".repeat(depth);
    const inner = "smile";
    const { result } = renderUseScriptRunner(model);
    act(() => {
      result.current.setScriptInput(`${open} ${inner} ${close}`);
    });
    await act(async () => {
      await result.current.runScript();
    });
    expect(model.applyExpressionPreset).toHaveBeenCalledWith("preset-smile");
    expect(result.current.scriptRunning).toBe(false);
  });

  it("wait の極大値でも 2回目の runScript (cancel) で確実に解除される", async () => {
    const model = createDummyModel();
    const { result } = renderUseScriptRunner(model);
    act(() => {
      result.current.setScriptInput("wait(9999999999)");
    });
    let firstRunPromise!: Promise<void>;
    act(() => {
      firstRunPromise = result.current.runScript();
    });
    expect(result.current.scriptRunning).toBe(true);

    await act(async () => {
      await result.current.runScript();
    });
    expect(result.current.scriptRunning).toBe(false);

    await act(async () => {
      await firstRunPromise;
    });
    expect(model.setParameter).not.toHaveBeenCalled();
    expect(model.applyExpressionPreset).not.toHaveBeenCalled();
  }, 10000);
});
