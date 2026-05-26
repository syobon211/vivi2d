import { describe, expect, it, vi } from "vitest";
import {
  cancelScript,
  parseScript,
  runScript,
  type ScriptModelAPI,
  type ScriptRunnerState,
} from "../script-runner";

function createMockAPI(): ScriptModelAPI {
  return {
    setParameter: vi.fn(),
    setParameters: vi.fn(),
    resetParameters: vi.fn(),
    applyExpressionPreset: vi.fn(),
    getPresetByName: vi.fn().mockReturnValue(null),
    getParameterId: vi.fn().mockReturnValue(null),
    update: vi.fn(),
  };
}

describe("parseScript", () => {
  it("プリセット名をpresetByNameコマンドにパースする", () => {
    const result = parseScript("smile");
    expect(result.commands).toHaveLength(1);
    expect(result.commands[0]).toEqual({ type: "presetByName", name: "smile" });
  });

  it("wait(500) をwaitコマンド(500ms)にパースする", () => {
    const result = parseScript("wait(500)");
    expect(result.commands).toHaveLength(1);
    expect(result.commands[0]).toEqual({ type: "wait", ms: 500 });
  });

  it("set(ParamX, 0.5) をsetParamコマンドにパースする", () => {
    const result = parseScript("set(ParamX, 0.5)");
    expect(result.commands).toHaveLength(1);
    expect(result.commands[0]).toEqual({
      type: "setParam",
      parameterId: "ParamX",
      value: 0.5,
    });
  });

  it("reset をresetコマンドにパースする", () => {
    const result = parseScript("reset");
    expect(result.commands).toHaveLength(1);
    expect(result.commands[0]).toEqual({ type: "reset" });
  });

  it("lerp(ParamX, 0, 1, 1000) をlerpコマンドにパースする", () => {
    const result = parseScript("lerp(ParamX, 0, 1, 1000)");
    expect(result.commands).toHaveLength(1);
    expect(result.commands[0]).toEqual({
      type: "lerp",
      parameterId: "ParamX",
      from: 0,
      to: 1,
      duration: 1000,
    });
  });

  it("loop(3) { smile → wait(100) } をネスト付きloopコマンドにパースする", () => {
    const result = parseScript("loop(3) { smile → wait(100) }");
    expect(result.commands).toHaveLength(1);

    const loop = result.commands[0]!;
    expect(loop).toMatchObject({ type: "loop", count: 3 });

    if (loop.type === "loop") {
      expect(loop.commands).toHaveLength(2);
      expect(loop.commands[0]).toEqual({ type: "presetByName", name: "smile" });
      expect(loop.commands[1]).toEqual({ type: "wait", ms: 100 });
    }
  });

  it("矢印の記法 →, ->, => すべて同等にパースする", () => {
    const resultUnicode = parseScript("smile → reset");
    const resultDash = parseScript("smile -> reset");
    const resultFat = parseScript("smile => reset");

    const expected = [{ type: "presetByName", name: "smile" }, { type: "reset" }];
    expect(resultUnicode.commands).toEqual(expected);
    expect(resultDash.commands).toEqual(expected);
    expect(resultFat.commands).toEqual(expected);
  });

  it("空文字列を渡すと空のコマンド配列を返す", () => {
    const result = parseScript("");
    expect(result.commands).toEqual([]);
  });

  it("文字列リテラル(ダブルクォート)をpresetByNameコマンドにパースする", () => {
    const result = parseScript('"smile preset" → wait(100)');
    expect(result.commands).toHaveLength(2);
    expect(result.commands[0]).toEqual({
      type: "presetByName",
      name: "smile preset",
    });
    expect(result.commands[1]).toEqual({ type: "wait", ms: 100 });
  });

  it("文字列リテラル(シングルクォート)をpresetByNameコマンドにパースする", () => {
    const result = parseScript("'happy face' → reset");
    expect(result.commands).toHaveLength(2);
    expect(result.commands[0]).toEqual({
      type: "presetByName",
      name: "happy face",
    });
    expect(result.commands[1]).toEqual({ type: "reset" });
  });

  it("負の数値をsetParamの値としてパースする", () => {
    const result = parseScript("set(ParamX, -0.5)");
    expect(result.commands).toHaveLength(1);
    expect(result.commands[0]).toEqual({
      type: "setParam",
      parameterId: "ParamX",
      value: -0.5,
    });
  });

  it("負の数値をlerpのfrom/toとしてパースする", () => {
    const result = parseScript("lerp(ParamY, -1.0, 1.0, 500)");
    expect(result.commands).toHaveLength(1);
    expect(result.commands[0]).toEqual({
      type: "lerp",
      parameterId: "ParamY",
      from: -1.0,
      to: 1.0,
      duration: 500,
    });
  });

  it("wait()を引数なしで呼ぶとデフォルト500msになる", () => {
    const result = parseScript("wait()");
    expect(result.commands).toHaveLength(1);
    expect(result.commands[0]).toEqual({ type: "wait", ms: 500 });
  });

  it("不明な文字(@#$)はスキップされコマンドに影響しない", () => {
    const result = parseScript("@ # $ smile");
    expect(result.commands).toHaveLength(1);
    expect(result.commands[0]).toEqual({
      type: "presetByName",
      name: "smile",
    });
  });

  it("不明な文字のみの入力は空のコマンド配列を返す", () => {
    const result = parseScript("@#$%^&");
    expect(result.commands).toEqual([]);
  });

  it("loop(3)の後にブレースが無い場合、空ボディのloopにならず次のトークンに進む", () => {
    const result = parseScript("loop(3) smile");
    expect(result.commands.length).toBeGreaterThanOrEqual(1);
    const presetCmd = result.commands.find(
      (c) => c.type === "presetByName" && c.name === "smile",
    );
    expect(presetCmd).toBeDefined();
  });

  it("深くネストしたloopを正しくパースする", () => {
    const result = parseScript("loop(2) { loop(3) { smile → wait(50) } }");
    expect(result.commands).toHaveLength(1);

    const outerLoop = result.commands[0]!;
    expect(outerLoop.type).toBe("loop");
    if (outerLoop.type === "loop") {
      expect(outerLoop.count).toBe(2);
      expect(outerLoop.commands).toHaveLength(1);

      const innerLoop = outerLoop.commands[0]!;
      expect(innerLoop.type).toBe("loop");
      if (innerLoop.type === "loop") {
        expect(innerLoop.count).toBe(3);
        expect(innerLoop.commands).toHaveLength(2);
        expect(innerLoop.commands[0]).toEqual({
          type: "presetByName",
          name: "smile",
        });
        expect(innerLoop.commands[1]).toEqual({ type: "wait", ms: 50 });
      }
    }
  });

  it("パーサーが数値トークン等の不明なトークンをスキップする", () => {
    const result = parseScript("42 → smile");
    expect(result.commands).toHaveLength(1);
    expect(result.commands[0]).toEqual({
      type: "presetByName",
      name: "smile",
    });
  });
});

describe("runScript", () => {
  it("presetByName実行時にgetPresetByName→applyExpressionPresetを呼ぶ", async () => {
    const api = createMockAPI();
    (api.getPresetByName as ReturnType<typeof vi.fn>).mockReturnValue("preset-001");

    const script = parseScript("smile");
    await runScript(script, api);

    expect(api.getPresetByName).toHaveBeenCalledWith("smile");
    expect(api.applyExpressionPreset).toHaveBeenCalledWith("preset-001");
    expect(api.update).toHaveBeenCalled();
  });

  it("waitコマンドが指定ミリ秒だけ遅延する", async () => {
    vi.useFakeTimers();

    const api = createMockAPI();
    const script = parseScript("wait(300)");

    let resolved = false;
    const promise = runScript(script, api).then(() => {
      resolved = true;
    });

    await vi.advanceTimersByTimeAsync(200);
    expect(resolved).toBe(false);

    await vi.advanceTimersByTimeAsync(200);
    expect(resolved).toBe(true);

    await promise;
    vi.useRealTimers();
  });

  it("setParamコマンドがsetParameter + updateを呼ぶ", async () => {
    const api = createMockAPI();
    const script = parseScript("set(vivi_head_yaw, 0.8)");
    await runScript(script, api);

    expect(api.setParameter).toHaveBeenCalledWith("vivi_head_yaw", 0.8);
    expect(api.update).toHaveBeenCalled();
  });

  it("resetコマンドがresetParameters + updateを呼ぶ", async () => {
    const api = createMockAPI();
    const script = parseScript("reset");
    await runScript(script, api);

    expect(api.resetParameters).toHaveBeenCalledTimes(1);
    expect(api.update).toHaveBeenCalledTimes(1);
  });

  it("lerpコマンドがsetParameterを補間値で複数回呼ぶ", async () => {
    vi.useFakeTimers();

    const api = createMockAPI();
    const script = parseScript("lerp(ParamX, 0, 1, 16)");

    const promise = runScript(script, api);

    await vi.advanceTimersByTimeAsync(500);
    await promise;

    expect(api.setParameter).toHaveBeenCalled();
    expect(api.setParameter).toHaveBeenCalledWith("ParamX", 0);
    expect(api.setParameter).toHaveBeenCalledWith("ParamX", 1);
    expect(api.update).toHaveBeenCalled();

    vi.useRealTimers();
  });

  it("lerpコマンドがdurationに応じたステップ数で補間する", async () => {
    vi.useFakeTimers();

    const api = createMockAPI();
    const script = parseScript("lerp(ParamY, 0, 3, 48)");

    const promise = runScript(script, api);
    await vi.advanceTimersByTimeAsync(500);
    await promise;

    expect(api.setParameter).toHaveBeenCalledTimes(4);
    expect(api.setParameter).toHaveBeenNthCalledWith(1, "ParamY", 0); // t=0/3
    expect(api.setParameter).toHaveBeenNthCalledWith(2, "ParamY", 1); // t=1/3
    expect(api.setParameter).toHaveBeenNthCalledWith(3, "ParamY", 2); // t=2/3
    expect(api.setParameter).toHaveBeenNthCalledWith(4, "ParamY", 3); // t=3/3

    vi.useRealTimers();
  });

  it("loop(2)がボディを2回実行する", async () => {
    vi.useFakeTimers();

    const api = createMockAPI();
    (api.getPresetByName as ReturnType<typeof vi.fn>).mockReturnValue("preset-smile");

    const script = parseScript("loop(2) { smile }");
    const promise = runScript(script, api);
    await vi.advanceTimersByTimeAsync(100);
    await promise;

    expect(api.getPresetByName).toHaveBeenCalledTimes(2);
    expect(api.applyExpressionPreset).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it("loop(0)は無限ループになるがキャンセルで停止する", async () => {
    vi.useFakeTimers();

    const api = createMockAPI();
    (api.getPresetByName as ReturnType<typeof vi.fn>).mockReturnValue("preset-neutral");

    const script = parseScript("loop(0) { neutral → wait(50) }");
    const state: ScriptRunnerState = { running: false, cancelled: false };

    const promise = runScript(script, api, state);

    await vi.advanceTimersByTimeAsync(200);
    expect(state.running).toBe(true);

    cancelScript(state);
    await vi.advanceTimersByTimeAsync(200);
    await promise;

    expect(state.cancelled).toBe(true);
    expect(state.running).toBe(false);
    expect(api.applyExpressionPreset).toHaveBeenCalled();

    vi.useRealTimers();
  });

  it("presetByNameで名前が見つからない場合applyExpressionPresetを呼ばない", async () => {
    const api = createMockAPI();
    const script = parseScript("nonexistent_preset");
    await runScript(script, api);

    expect(api.getPresetByName).toHaveBeenCalledWith("nonexistent_preset");
    expect(api.applyExpressionPreset).not.toHaveBeenCalled();
    expect(api.update).not.toHaveBeenCalled();
  });

  it("stateを渡さなくても正常に実行される", async () => {
    const api = createMockAPI();
    const script = parseScript("reset");
    await runScript(script, api);

    expect(api.resetParameters).toHaveBeenCalledTimes(1);
    expect(api.update).toHaveBeenCalledTimes(1);
  });

  it("presetコマンドがapplyExpressionPreset + updateを直接呼ぶ", async () => {
    const api = createMockAPI();
    const script = {
      commands: [{ type: "preset" as const, presetId: "preset-1" }],
    };
    await runScript(script, api);

    expect(api.getPresetByName).not.toHaveBeenCalled();
    expect(api.applyExpressionPreset).toHaveBeenCalledWith("preset-1");
    expect(api.update).toHaveBeenCalledTimes(1);
  });
});

describe("cancelScript", () => {
  it("実行中のスクリプトをキャンセルして途中停止させる", async () => {
    vi.useFakeTimers();

    const api = createMockAPI();
    (api.getPresetByName as ReturnType<typeof vi.fn>).mockReturnValue("preset-001");

    const script = parseScript("wait(1000) → smile");
    const state: ScriptRunnerState = { running: false, cancelled: false };

    const promise = runScript(script, api, state);

    await vi.advanceTimersByTimeAsync(100);
    cancelScript(state);

    await vi.advanceTimersByTimeAsync(100);
    await promise;

    expect(state.cancelled).toBe(true);
    expect(state.running).toBe(false);
    expect(api.applyExpressionPreset).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it("lerpの途中でキャンセルすると残りのステップをスキップする", async () => {
    vi.useFakeTimers();

    const api = createMockAPI();
    const script = parseScript("lerp(ParamX, 0, 1, 1000)");
    const state: ScriptRunnerState = { running: false, cancelled: false };

    const promise = runScript(script, api, state);

    await vi.advanceTimersByTimeAsync(100);
    cancelScript(state);
    await vi.advanceTimersByTimeAsync(200);
    await promise;

    expect((api.setParameter as ReturnType<typeof vi.fn>).mock.calls.length).toBeLessThan(
      63,
    );
    expect(state.cancelled).toBe(true);
    expect(state.running).toBe(false);

    vi.useRealTimers();
  });
});

describe("sandbox escape 試行 (P7-17)", () => {
  it("任意のJavaScript構文は preset 名 lookup に落ち、副作用ゼロ", async () => {
    const api = createMockAPI();
    await runScript(parseScript("window.location='evil.com' fetch('//attacker')"), api);

    expect(api.applyExpressionPreset).not.toHaveBeenCalled();
    expect(api.setParameter).not.toHaveBeenCalled();
    expect(api.resetParameters).not.toHaveBeenCalled();
    expect(api.update).not.toHaveBeenCalled();
    expect(api.getPresetByName).toHaveBeenCalled();
  });

  it("__proto__ pollution 試行は ident 扱いで Object.prototype に副作用なし", async () => {
    const api = createMockAPI();
    const beforeKeys = Object.getOwnPropertyNames(Object.prototype).slice();

    await runScript(parseScript("__proto__ polluted constructor"), api);

    const afterKeys = Object.getOwnPropertyNames(Object.prototype);
    expect(afterKeys).toEqual(beforeKeys);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(api.getPresetByName).toHaveBeenCalledWith("__proto__");
    expect(api.applyExpressionPreset).not.toHaveBeenCalled();
  });

  it("HTML/script タグはトークナイザが記号をスキップし副作用なし", async () => {
    const api = createMockAPI();
    await runScript(parseScript("<script>alert(1)</script>"), api);

    expect(api.applyExpressionPreset).not.toHaveBeenCalled();
    expect(api.getPresetByName).toHaveBeenCalledWith("script");
    expect(api.getPresetByName).toHaveBeenCalledWith("alert");
  });

  it("loop(0) { reset } sync body でも cancel callback で1イテレーション後に停止する (DoS 耐性)", async () => {
    const api = createMockAPI();
    const state: ScriptRunnerState = { running: false, cancelled: false };
    let count = 0;
    (api.resetParameters as ReturnType<typeof vi.fn>).mockImplementation(() => {
      count++;
      state.cancelled = true;
    });

    await runScript(parseScript("loop(0) { reset }"), api, state);

    expect(count).toBe(1);
    expect(state.cancelled).toBe(true);
    expect(state.running).toBe(false);
  });

  it("深くネストしたブレースを findMatchingBrace が stack-safe にパースする", () => {
    const depth = 50;
    const open = "loop(1) {".repeat(depth);
    const close = "}".repeat(depth);
    const inner = "smile";

    expect(() => parseScript(`${open} ${inner} ${close}`)).not.toThrow();

    const result = parseScript(`${open} ${inner} ${close}`);
    expect(result.commands).toHaveLength(1);

    let current: { commands: import("../script-runner").ScriptCommand[] } = result;
    for (let i = 0; i < depth; i++) {
      const cmd = current.commands[0];
      expect(cmd?.type).toBe("loop");
      if (cmd?.type === "loop") {
        current = { commands: cmd.commands };
      }
    }
    expect(current.commands[0]).toEqual({ type: "presetByName", name: "smile" });
  });

  it("wait の極大値でも cancel path が setInterval(50ms) で確実に拾う", async () => {
    vi.useFakeTimers();

    const api = createMockAPI();
    const state: ScriptRunnerState = { running: false, cancelled: false };

    const script = parseScript("wait(9999999999)");
    const promise = runScript(script, api, state);

    cancelScript(state);
    await vi.advanceTimersByTimeAsync(60);
    await promise;

    expect(state.cancelled).toBe(true);
    expect(state.running).toBe(false);

    vi.useRealTimers();
  });
});
