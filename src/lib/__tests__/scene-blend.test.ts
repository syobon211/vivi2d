import {
  blendParameterValues,
  computeBlendFactor,
  evaluateClipAtFrame,
  evaluateSceneBlend,
} from "@vivi2d/core/scene-blend";
import type { AnimationClip, ParameterDefinition, SceneBlend } from "@vivi2d/core/types";
import { describe, expect, it } from "vitest";


function makeDef(
  id: string,
  defaultValue = 0,
  minValue = -100,
  maxValue = 100,
): ParameterDefinition {
  return { id, name: id, minValue, maxValue, defaultValue };
}

function makeClip(tracks: AnimationClip["tracks"] = []): AnimationClip {
  return {
    id: "clip-1",
    name: "テスト",
    duration: 60,
    fps: 30,
    tracks,
  };
}

// ============================================================
// evaluateClipAtFrame
// ============================================================

describe("evaluateClipAtFrame", () => {
  it("キーフレーム間を線形補間する", () => {
    const clip = makeClip([
      {
        parameterId: "p1",
        keyframes: [
          { frame: 0, value: 0, interpolation: "linear" },
          { frame: 10, value: 100, interpolation: "linear" },
        ],
      },
    ]);
    const defs = [makeDef("p1")];
    const result = evaluateClipAtFrame(clip, 5, defs);

    expect(result.p1).toBeCloseTo(50);
  });

  it("フレーム0でキーフレームの最初の値を返す", () => {
    const clip = makeClip([
      {
        parameterId: "p1",
        keyframes: [
          { frame: 0, value: 10, interpolation: "linear" },
          { frame: 30, value: 90, interpolation: "linear" },
        ],
      },
    ]);
    const defs = [makeDef("p1")];
    const result = evaluateClipAtFrame(clip, 0, defs);

    expect(result.p1).toBeCloseTo(10);
  });

  it("範囲外のフレームはクランプされる", () => {
    const clip = makeClip([
      {
        parameterId: "p1",
        keyframes: [
          { frame: 5, value: 20, interpolation: "linear" },
          { frame: 15, value: 80, interpolation: "linear" },
        ],
      },
    ]);
    const defs = [makeDef("p1")];

    expect(evaluateClipAtFrame(clip, 0, defs).p1).toBeCloseTo(20);
    expect(evaluateClipAtFrame(clip, 100, defs).p1).toBeCloseTo(80);
  });

  it("トラック無しパラメータはデフォルト値を返す", () => {
    const clip = makeClip([]);
    const defs = [makeDef("p1", 42)];
    const result = evaluateClipAtFrame(clip, 10, defs);

    expect(result.p1).toBe(42);
  });

  it("キーフレームが空のトラックはデフォルト値を返す", () => {
    const clip = makeClip([{ parameterId: "p1", keyframes: [] }]);
    const defs = [makeDef("p1", 99)];
    const result = evaluateClipAtFrame(clip, 10, defs);

    expect(result.p1).toBe(99);
  });
});

// ============================================================
// blendParameterValues
// ============================================================

describe("blendParameterValues", () => {
  const defs = [makeDef("p1", 0, -100, 100), makeDef("p2", 0, 0, 50)];

  describe("crossfade", () => {
    it("factor=0でA側の値を返す", () => {
      const a = { p1: 10, p2: 20 };
      const b = { p1: 90, p2: 40 };
      const result = blendParameterValues(a, b, 0, "crossfade", defs);

      expect(result.p1).toBeCloseTo(10);
      expect(result.p2).toBeCloseTo(20);
    });

    it("factor=1でB側の値を返す", () => {
      const a = { p1: 10, p2: 20 };
      const b = { p1: 90, p2: 40 };
      const result = blendParameterValues(a, b, 1, "crossfade", defs);

      expect(result.p1).toBeCloseTo(90);
      expect(result.p2).toBeCloseTo(40);
    });

    it("factor=0.5で中間値を返す", () => {
      const a = { p1: 0, p2: 10 };
      const b = { p1: 100, p2: 30 };
      const result = blendParameterValues(a, b, 0.5, "crossfade", defs);

      expect(result.p1).toBeCloseTo(50);
      expect(result.p2).toBeCloseTo(20);
    });
  });

  describe("additive", () => {
    it("A + B*factor でパラメータ範囲でクランプされる", () => {
      const a = { p1: 80 };
      const b = { p1: 50 };
      const result = blendParameterValues(a, b, 1, "additive", defs);

      expect(result.p1).toBe(100);
    });

    it("factor=0ではA値のみ", () => {
      const a = { p1: 30 };
      const b = { p1: 70 };
      const result = blendParameterValues(a, b, 0, "additive", defs);

      expect(result.p1).toBeCloseTo(30);
    });

    it("下限でもクランプされる", () => {
      const a = { p1: -80 };
      const b = { p1: -50 };
      const result = blendParameterValues(a, b, 1, "additive", defs);

      expect(result.p1).toBe(-100);
    });
  });

  describe("override", () => {
    it("factor<0.5でA側の値を返す", () => {
      const a = { p1: 10 };
      const b = { p1: 90 };
      const result = blendParameterValues(a, b, 0.3, "override", defs);

      expect(result.p1).toBe(10);
    });

    it("factor>=0.5でB側の値を返す", () => {
      const a = { p1: 10 };
      const b = { p1: 90 };

      expect(blendParameterValues(a, b, 0.5, "override", defs).p1).toBe(90);
      expect(blendParameterValues(a, b, 0.8, "override", defs).p1).toBe(90);
    });
  });
});

// ============================================================
// computeBlendFactor
// ============================================================

describe("computeBlendFactor", () => {
  function makeBlend(
    transitionFrames: number,
    easing: SceneBlend["easing"] = "linear",
  ): SceneBlend {
    return {
      id: "blend-1",
      sourceSceneId: "s1",
      targetSceneId: "s2",
      mode: "crossfade",
      transitionFrames,
      easing,
    };
  }

  it("遷移開始前は0を返す", () => {
    const blend = makeBlend(30);
    expect(computeBlendFactor(blend, 5, 10)).toBe(0);
  });

  it("遷移完了後は1を返す", () => {
    const blend = makeBlend(30);
    expect(computeBlendFactor(blend, 50, 0)).toBe(1);
  });

  it("遷移中は0-1の範囲を返す", () => {
    const blend = makeBlend(20, "linear");
    const factor = computeBlendFactor(blend, 10, 0);
    expect(factor).toBeGreaterThan(0);
    expect(factor).toBeLessThan(1);
    expect(factor).toBeCloseTo(0.5);
  });

  it("transitionFrames=0 なら即座に1を返す", () => {
    const blend = makeBlend(0);
    expect(computeBlendFactor(blend, 0, 0)).toBe(1);
    expect(computeBlendFactor(blend, 100, 50)).toBe(1);
  });

  it("遷移開始フレームちょうどでは0を返す", () => {
    const blend = makeBlend(30);
    expect(computeBlendFactor(blend, 10, 10)).toBe(0);
  });

  it("遷移完了フレームちょうどでは1を返す", () => {
    const blend = makeBlend(30);
    expect(computeBlendFactor(blend, 30, 0)).toBe(1);
  });

  describe("イージングの種類", () => {
    it("step: 完了前は0、完了で1", () => {
      const blend = makeBlend(10, "step");
      expect(computeBlendFactor(blend, 5, 0)).toBe(0);
      expect(computeBlendFactor(blend, 10, 0)).toBe(1); // elapsed >= transitionFrames
    });

    it("bezier: smooth hermite 近似（中間で0.5付近）", () => {
      const blend = makeBlend(10, "bezier");
      const factor = computeBlendFactor(blend, 5, 0); // t=0.5
      // hermite(0.5) = 0.5*0.5*(3-2*0.5) = 0.5
      expect(factor).toBeCloseTo(0.5);
    });

    it("ellipse: 四分楕円近似（中間で0.5以上）", () => {
      const blend = makeBlend(10, "ellipse");
      const factor = computeBlendFactor(blend, 5, 0); // t=0.5
      expect(factor).toBeGreaterThan(0.5);
      expect(factor).toBeLessThanOrEqual(1);
    });

    it("sns: スムーズステップ6次（中間で0.5付近）", () => {
      const blend = makeBlend(10, "sns");
      const factor = computeBlendFactor(blend, 5, 0); // t=0.5
      expect(factor).toBeCloseTo(0.5);
    });
  });
});

// ============================================================
// evaluateSceneBlend
// ============================================================

describe("evaluateSceneBlend", () => {
  const defs = [makeDef("p1"), makeDef("p2", 50)];

  function makeBlendConfig(
    transitionFrames: number,
    mode: SceneBlend["mode"] = "crossfade",
    easing: SceneBlend["easing"] = "linear",
  ): SceneBlend {
    return {
      id: "blend-1",
      sourceSceneId: "s1",
      targetSceneId: "s2",
      mode,
      transitionFrames,
      easing,
    };
  }

  it("遷移前はソースクリップの値を返す", () => {
    const sourceClip = makeClip([
      {
        parameterId: "p1",
        keyframes: [{ frame: 0, value: 10, interpolation: "linear" }],
      },
    ]);
    const targetClip = makeClip([
      {
        parameterId: "p1",
        keyframes: [{ frame: 0, value: 90, interpolation: "linear" }],
      },
    ]);
    const blend = makeBlendConfig(30);

    const result = evaluateSceneBlend(sourceClip, targetClip, blend, 0, 10, defs);
    expect(result.p1).toBeCloseTo(10);
  });

  it("遷移後はターゲットクリップの値を返す", () => {
    const sourceClip = makeClip([
      {
        parameterId: "p1",
        keyframes: [{ frame: 0, value: 10, interpolation: "linear" }],
      },
    ]);
    const targetClip = makeClip([
      {
        parameterId: "p1",
        keyframes: [{ frame: 0, value: 90, interpolation: "linear" }],
      },
    ]);
    const blend = makeBlendConfig(10);

    const result = evaluateSceneBlend(sourceClip, targetClip, blend, 20, 0, defs);
    expect(result.p1).toBeCloseTo(90);
  });

  it("遷移中はブレンドされた値を返す", () => {
    const sourceClip = makeClip([
      {
        parameterId: "p1",
        keyframes: [{ frame: 0, value: 0, interpolation: "linear" }],
      },
    ]);
    const targetClip = makeClip([
      {
        parameterId: "p1",
        keyframes: [{ frame: 0, value: 100, interpolation: "linear" }],
      },
    ]);
    const blend = makeBlendConfig(20, "crossfade", "linear");

    const result = evaluateSceneBlend(sourceClip, targetClip, blend, 10, 0, defs);
    expect(result.p1).toBeCloseTo(50);
  });

  it("トラック無しパラメータはデフォルト値でブレンドされる", () => {
    const sourceClip = makeClip([]);
    const targetClip = makeClip([]);
    const blend = makeBlendConfig(10);

    const result = evaluateSceneBlend(sourceClip, targetClip, blend, 5, 0, defs);
    expect(result.p1).toBeCloseTo(0);
    expect(result.p2).toBeCloseTo(50);
  });

  it("additive モードで正しくブレンドされる", () => {
    const sourceClip = makeClip([
      {
        parameterId: "p1",
        keyframes: [{ frame: 0, value: 30, interpolation: "linear" }],
      },
    ]);
    const targetClip = makeClip([
      {
        parameterId: "p1",
        keyframes: [{ frame: 0, value: 50, interpolation: "linear" }],
      },
    ]);
    const blend = makeBlendConfig(10, "additive", "linear");

    const result = evaluateSceneBlend(sourceClip, targetClip, blend, 20, 0, defs);
    expect(result.p1).toBeCloseTo(80);
  });
});


describe("blendParameterValues（片側キー）", () => {
  const defs = [makeDef("p1"), makeDef("p2")];

  it("A にしかないキーはデフォルト0でブレンドされる", () => {
    const a = { p1: 50 };
    const b = {};
    const result = blendParameterValues(a, b, 0.5, "crossfade", defs);
    // crossfade: 50*(1-0.5) + 0*0.5 = 25
    expect(result.p1).toBeCloseTo(25);
  });

  it("B にしかないキーはデフォルト0でブレンドされる", () => {
    const a = {};
    const b = { p2: 80 };
    const result = blendParameterValues(a, b, 0.5, "crossfade", defs);
    // crossfade: 0*(1-0.5) + 80*0.5 = 40
    expect(result.p2).toBeCloseTo(40);
  });

  it("additive で定義にないパラメータはクランプなし", () => {
    const a = { unknown: 50 };
    const b = { unknown: 200 };
    const result = blendParameterValues(a, b, 1, "additive", defs);
    expect(result.unknown).toBe(250);
  });
});


describe("evaluateClipAtFrame 同一フレームキーフレーム", () => {
  it("同一フレームの2つのキーフレームで t=0 として前方の値を返す", () => {
    const clip = makeClip([
      {
        parameterId: "p1",
        keyframes: [
          { frame: 5, value: 10, interpolation: "linear" },
          { frame: 5, value: 90, interpolation: "linear" },
        ],
      },
    ]);
    const defs = [makeDef("p1")];
    const result = evaluateClipAtFrame(clip, 5, defs);
    expect(result.p1).toBeCloseTo(10);
  });

  it("フレーム0より前のフレームは最初のキーフレーム値を返す", () => {
    const clip = makeClip([
      {
        parameterId: "p1",
        keyframes: [
          { frame: 10, value: 50, interpolation: "linear" },
          { frame: 20, value: 100, interpolation: "linear" },
        ],
      },
    ]);
    const defs = [makeDef("p1")];
    const result = evaluateClipAtFrame(clip, 0, defs);
    expect(result.p1).toBeCloseTo(50);
  });
});
