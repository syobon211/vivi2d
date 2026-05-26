import { act, renderHook } from "@testing-library/react";
import type { ViviModel } from "@vivi2d/core/model";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useScriptRunner } from "../hooks/useScriptRunner";


const mockParseScript = vi.fn();
const mockRunScript = vi.fn();
const mockCancelScript = vi.fn();

vi.mock("@vivi2d/core/script-runner", () => ({
  parseScript: (src: string) => mockParseScript(src),
  runScript: (script: unknown, api: unknown, state: unknown) =>
    mockRunScript(script, api, state),
  cancelScript: (state: unknown) => mockCancelScript(state),
}));

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
      expressionPresets: [
        { id: "preset-smile", name: "smile" },
        { id: "preset-angry", name: "angry" },
      ],
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

describe("useScriptRunner", () => {
  beforeEach(() => {
    mockParseScript.mockReset().mockReturnValue({ commands: [] });
    mockRunScript.mockReset().mockResolvedValue(undefined);
    mockCancelScript.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("初期 scriptInput は空文字", () => {
    const { result } = renderUseScriptRunner();
    expect(result.current.scriptInput).toBe("");
  });

  it("初期 scriptRunning は false", () => {
    const { result } = renderUseScriptRunner();
    expect(result.current.scriptRunning).toBe(false);
  });

  it("setScriptInput で scriptInput が更新される", () => {
    const { result } = renderUseScriptRunner();
    act(() => {
      result.current.setScriptInput("smile → wait(500)");
    });
    expect(result.current.scriptInput).toBe("smile → wait(500)");
  });

  it("scriptInput が空のとき runScript は no-op（parseScript 呼ばれず）", async () => {
    const { result } = renderUseScriptRunner(createDummyModel());
    await act(async () => {
      await result.current.runScript();
    });
    expect(mockParseScript).not.toHaveBeenCalled();
    expect(mockRunScript).not.toHaveBeenCalled();
    expect(result.current.scriptRunning).toBe(false);
  });

  it("scriptInput が whitespace のみのとき runScript は no-op", async () => {
    const { result } = renderUseScriptRunner(createDummyModel());
    act(() => {
      result.current.setScriptInput("   \n\t  ");
    });
    await act(async () => {
      await result.current.runScript();
    });
    expect(mockParseScript).not.toHaveBeenCalled();
    expect(mockRunScript).not.toHaveBeenCalled();
  });

  it("modelRef.current が null のとき runScript は no-op", async () => {
    const { result } = renderUseScriptRunner(null);
    act(() => {
      result.current.setScriptInput("smile");
    });
    await act(async () => {
      await result.current.runScript();
    });
    expect(mockParseScript).not.toHaveBeenCalled();
    expect(mockRunScript).not.toHaveBeenCalled();
  });

  it("有効な入力 + model 設定で parseScript と runScript が呼ばれる", async () => {
    const model = createDummyModel();
    const { result } = renderUseScriptRunner(model);
    act(() => {
      result.current.setScriptInput("smile → wait(500)");
    });
    await act(async () => {
      await result.current.runScript();
    });
    expect(mockParseScript).toHaveBeenCalledWith("smile → wait(500)");
    expect(mockRunScript).toHaveBeenCalledTimes(1);
  });

  it("実行完了後 scriptRunning は false に戻る", async () => {
    const model = createDummyModel();
    const { result } = renderUseScriptRunner(model);
    act(() => {
      result.current.setScriptInput("smile");
    });
    await act(async () => {
      await result.current.runScript();
    });
    expect(result.current.scriptRunning).toBe(false);
  });

  it("実行中の再呼出しで cancelScript が呼ばれる", async () => {
    const model = createDummyModel();
    let resolveScript!: () => void;
    mockRunScript.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveScript = resolve;
        }),
    );
    const { result } = renderUseScriptRunner(model);
    act(() => {
      result.current.setScriptInput("smile");
    });
    let firstRunPromise!: Promise<void>;
    act(() => {
      firstRunPromise = result.current.runScript();
    });
    expect(result.current.scriptRunning).toBe(true);

    await act(async () => {
      await result.current.runScript();
    });
    expect(mockCancelScript).toHaveBeenCalledTimes(1);
    expect(result.current.scriptRunning).toBe(false);

    await act(async () => {
      resolveScript();
      await firstRunPromise;
    });
  });

  it("ScriptModelAPI: setParameter が ViviModel に委譲される", async () => {
    const model = createDummyModel();
    let capturedApi: {
      setParameter: (id: string, v: number) => void;
      setParameters: (v: Record<string, number>) => void;
      resetParameters: () => void;
      applyExpressionPreset: (id: string) => void;
      getPresetByName: (n: string) => string | null;
      getParameterId: (n: string) => string | null;
      update: () => void;
    } | null = null;
    mockRunScript.mockImplementation(async (_s, api) => {
      capturedApi = api;
    });
    const { result } = renderUseScriptRunner(model);
    act(() => {
      result.current.setScriptInput("smile");
    });
    await act(async () => {
      await result.current.runScript();
    });
    expect(capturedApi).not.toBeNull();
    capturedApi!.setParameter("p1", 0.5);
    expect(model.setParameter).toHaveBeenCalledWith("p1", 0.5);
  });

  it("ScriptModelAPI: setParameters が委譲される", async () => {
    const model = createDummyModel();
    let capturedApi: { setParameters: (v: Record<string, number>) => void } | null = null;
    mockRunScript.mockImplementation(async (_s, api) => {
      capturedApi = api;
    });
    const { result } = renderUseScriptRunner(model);
    act(() => {
      result.current.setScriptInput("smile");
    });
    await act(async () => {
      await result.current.runScript();
    });
    capturedApi!.setParameters({ p1: 0.1, p2: 0.2 });
    expect(model.setParameters).toHaveBeenCalledWith({ p1: 0.1, p2: 0.2 });
  });

  it("ScriptModelAPI: resetParameters / applyExpressionPreset / update が委譲される", async () => {
    const model = createDummyModel();
    let capturedApi: {
      resetParameters: () => void;
      applyExpressionPreset: (id: string) => void;
      update: () => void;
    } | null = null;
    mockRunScript.mockImplementation(async (_s, api) => {
      capturedApi = api;
    });
    const { result } = renderUseScriptRunner(model);
    act(() => {
      result.current.setScriptInput("smile");
    });
    await act(async () => {
      await result.current.runScript();
    });
    capturedApi!.resetParameters();
    capturedApi!.applyExpressionPreset("preset-smile");
    capturedApi!.update();
    expect(model.resetParameters).toHaveBeenCalled();
    expect(model.applyExpressionPreset).toHaveBeenCalledWith("preset-smile");
    expect(model.update).toHaveBeenCalled();
  });

  it("ScriptModelAPI: getPresetByName が name から id を返す", async () => {
    const model = createDummyModel();
    let capturedApi: { getPresetByName: (n: string) => string | null } | null = null;
    mockRunScript.mockImplementation(async (_s, api) => {
      capturedApi = api;
    });
    const { result } = renderUseScriptRunner(model);
    act(() => {
      result.current.setScriptInput("smile");
    });
    await act(async () => {
      await result.current.runScript();
    });
    expect(capturedApi!.getPresetByName("smile")).toBe("preset-smile");
    expect(capturedApi!.getPresetByName("unknown")).toBeNull();
  });

  it("ScriptModelAPI: getParameterId が name または id から id を返す", async () => {
    const model = createDummyModel();
    let capturedApi: { getParameterId: (n: string) => string | null } | null = null;
    mockRunScript.mockImplementation(async (_s, api) => {
      capturedApi = api;
    });
    const { result } = renderUseScriptRunner(model);
    act(() => {
      result.current.setScriptInput("smile");
    });
    await act(async () => {
      await result.current.runScript();
    });
    expect(capturedApi!.getParameterId("param1")).toBe("p1");
    expect(capturedApi!.getParameterId("p2")).toBe("p2");
    expect(capturedApi!.getParameterId("missing")).toBeNull();
  });

  it("runScript が throw しても scriptRunning は false に戻る（finally 動作）", async () => {
    const model = createDummyModel();
    mockRunScript.mockRejectedValueOnce(new Error("boom"));
    const { result } = renderUseScriptRunner(model);
    act(() => {
      result.current.setScriptInput("smile");
    });
    await act(async () => {
      await expect(result.current.runScript()).rejects.toThrow("boom");
    });
    expect(result.current.scriptRunning).toBe(false);
  });
});
