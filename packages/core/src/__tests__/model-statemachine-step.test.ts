import { describe, expect, it, vi } from "vitest";
import {
  computeStateMachineUpdates,
  createParamDefaultResolver,
} from "../model-statemachine-step";
import { createStateMachineRuntime, type StateMachineRuntime } from "../state-machine";
import type { AnimationClip, AnimationStateMachine, ParameterDefinition } from "../types";


function constantClip(id: string, parameterId: string, value: number): AnimationClip {
  return {
    id,
    name: id,
    duration: 30,
    fps: 30,
    tracks: [
      {
        parameterId,
        keyframes: [
          { frame: 0, value, interpolation: "linear" },
          { frame: 30, value, interpolation: "linear" },
        ],
      },
    ],
  };
}

function simpleMachine(
  id: string,
  clipId: string,
  opts: Partial<AnimationStateMachine> = {},
): AnimationStateMachine {
  return {
    id,
    name: id,
    states: [{ id: "s0", name: "s0", clipId, loop: true }],
    transitions: [],
    initialStateId: "s0",
    enabled: true,
    ...opts,
  };
}

function param(id: string, defaultValue: number): ParameterDefinition {
  return {
    id,
    name: id,
    minValue: -1,
    maxValue: 1,
    defaultValue,
  };
}

// ============================================================
// createParamDefaultResolver
// ============================================================

describe("createParamDefaultResolver", () => {
  it("定義済みパラメータのデフォルト値を返す", () => {
    const resolve = createParamDefaultResolver([param("p1", 0.7), param("p2", -0.2)]);
    expect(resolve("p1")).toBe(0.7);
    expect(resolve("p2")).toBe(-0.2);
  });

  it("未知の ID は 0 を返す", () => {
    const resolve = createParamDefaultResolver([param("p1", 0.5)]);
    expect(resolve("unknown")).toBe(0);
  });

  it("空配列ではすべて 0 を返す", () => {
    const resolve = createParamDefaultResolver([]);
    expect(resolve("anything")).toBe(0);
  });
});

// ============================================================
// computeStateMachineUpdates
// ============================================================

describe("computeStateMachineUpdates", () => {
  function prepare(
    machines: AnimationStateMachine[],
    clips: AnimationClip[],
    initialParams: Record<string, number>,
    defaults: Record<string, number> = {},
  ) {
    const runtimes = new Map<string, StateMachineRuntime>();
    for (const m of machines) runtimes.set(m.id, createStateMachineRuntime(m));
    const clipMap = new Map(clips.map((c) => [c.id, c]));
    const params = { ...initialParams };
    const getCurrentParams = () => ({ ...params });
    const applyUpdates = vi.fn((updates: Map<string, number>) => {
      for (const [k, v] of updates) params[k] = v;
    });
    const getParamDefault = (id: string) => defaults[id] ?? 0;
    return {
      runtimes,
      clipMap,
      getCurrentParams,
      applyUpdates,
      getParamDefault,
      getParams: () => params,
    };
  }

  it("machines 空配列は何もしない (no-op)", () => {
    const ctx = prepare([], [], {});
    computeStateMachineUpdates(
      [],
      ctx.runtimes,
      ctx.clipMap,
      1 / 60,
      ctx.getCurrentParams,
      ctx.getParamDefault,
      ctx.applyUpdates,
    );
    expect(ctx.applyUpdates).not.toHaveBeenCalled();
  });

  it("Override + weight=1 は値を上書きする", () => {
    const machine = simpleMachine("m1", "clip-a");
    const ctx = prepare([machine], [constantClip("clip-a", "p1", 0.8)], { p1: 0 });
    computeStateMachineUpdates(
      [machine],
      ctx.runtimes,
      ctx.clipMap,
      1 / 60,
      ctx.getCurrentParams,
      ctx.getParamDefault,
      ctx.applyUpdates,
    );
    expect(ctx.applyUpdates).toHaveBeenCalledOnce();
    expect(ctx.getParams().p1).toBeCloseTo(0.8);
  });

  it("Override + weight=0.5 は現在値とブレンドする", () => {
    const machine = simpleMachine("m1", "clip-a", { weight: 0.5 });
    const ctx = prepare([machine], [constantClip("clip-a", "p1", 0.8)], { p1: 0 });
    computeStateMachineUpdates(
      [machine],
      ctx.runtimes,
      ctx.clipMap,
      1 / 60,
      ctx.getCurrentParams,
      ctx.getParamDefault,
      ctx.applyUpdates,
    );
    expect(ctx.getParams().p1).toBeCloseTo(0.4);
  });

  it("Additive は (value - default) * weight を現在値に加算する", () => {
    const machine = simpleMachine("m1", "clip-a", {
      blendMode: "additive",
      weight: 1,
    });
    const ctx = prepare(
      [machine],
      [constantClip("clip-a", "p1", 0.8)],
      { p1: 0.2 },
      { p1: 0.3 },
    );
    computeStateMachineUpdates(
      [machine],
      ctx.runtimes,
      ctx.clipMap,
      1 / 60,
      ctx.getCurrentParams,
      ctx.getParamDefault,
      ctx.applyUpdates,
    );
    // 0.2 + (0.8 - 0.3) * 1 = 0.7
    expect(ctx.getParams().p1).toBeCloseTo(0.7);
  });

  it("Additive + weight=0.5 は差分を半分加算する", () => {
    const machine = simpleMachine("m1", "clip-a", {
      blendMode: "additive",
      weight: 0.5,
    });
    const ctx = prepare(
      [machine],
      [constantClip("clip-a", "p1", 0.8)],
      { p1: 0 },
      { p1: 0.4 },
    );
    computeStateMachineUpdates(
      [machine],
      ctx.runtimes,
      ctx.clipMap,
      1 / 60,
      ctx.getCurrentParams,
      ctx.getParamDefault,
      ctx.applyUpdates,
    );
    // 0 + (0.8 - 0.4) * 0.5 = 0.2
    expect(ctx.getParams().p1).toBeCloseTo(0.2);
  });

  it("enabled=false は評価をスキップする", () => {
    const machine = simpleMachine("m1", "clip-a", { enabled: false });
    const ctx = prepare([machine], [constantClip("clip-a", "p1", 0.8)], { p1: 0.1 });
    computeStateMachineUpdates(
      [machine],
      ctx.runtimes,
      ctx.clipMap,
      1 / 60,
      ctx.getCurrentParams,
      ctx.getParamDefault,
      ctx.applyUpdates,
    );
    expect(ctx.applyUpdates).not.toHaveBeenCalled();
    expect(ctx.getParams().p1).toBe(0.1);
  });

  it("runtime 未登録の machine は無視される", () => {
    const machine = simpleMachine("m1", "clip-a");
    const ctx = prepare([], [constantClip("clip-a", "p1", 0.8)], { p1: 0 });
    computeStateMachineUpdates(
      [machine],
      ctx.runtimes,
      ctx.clipMap,
      1 / 60,
      ctx.getCurrentParams,
      ctx.getParamDefault,
      ctx.applyUpdates,
    );
    expect(ctx.applyUpdates).not.toHaveBeenCalled();
  });

  it("Override → Additive の順に評価し Additive は Override 後の値に加算する", () => {
    const override = simpleMachine("ov", "clip-override");
    const additive = simpleMachine("ad", "clip-additive", {
      blendMode: "additive",
    });
    const ctx = prepare(
      [override, additive],
      [
        constantClip("clip-override", "p1", 0.5),
        constantClip("clip-additive", "p1", 0.8),
      ],
      { p1: 0 },
      { p1: 0.3 },
    );
    computeStateMachineUpdates(
      [override, additive],
      ctx.runtimes,
      ctx.clipMap,
      1 / 60,
      ctx.getCurrentParams,
      ctx.getParamDefault,
      ctx.applyUpdates,
    );
    // Additive: 0.5 + (0.8 - 0.3) * 1 = 1.0
    expect(ctx.getParams().p1).toBeCloseTo(1.0);
    expect(ctx.applyUpdates).toHaveBeenCalledTimes(2);
  });

  it("配列順序が逆 (Additive が先) でも Override → Additive の順で評価する", () => {
    const additive = simpleMachine("ad", "clip-additive", {
      blendMode: "additive",
    });
    const override = simpleMachine("ov", "clip-override");
    const ctx = prepare(
      [additive, override],
      [
        constantClip("clip-override", "p1", 0.5),
        constantClip("clip-additive", "p1", 0.8),
      ],
      { p1: 0 },
      { p1: 0.3 },
    );
    computeStateMachineUpdates(
      [additive, override],
      ctx.runtimes,
      ctx.clipMap,
      1 / 60,
      ctx.getCurrentParams,
      ctx.getParamDefault,
      ctx.applyUpdates,
    );
    expect(ctx.getParams().p1).toBeCloseTo(1.0);
  });
});
