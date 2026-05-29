import { describe, expect, it } from "vitest";
import {
  ellipseInterpolation,
  evaluateBoneTracksAtFrame,
  evaluateClipAtFrame,
  evaluateCubicBezier,
  evaluateIKControllerTracksAtFrame,
  formatFrameTime,
  frameToSeconds,
  interpolateTrack,
  snsInterpolation,
  solveCubicBezierT,
} from "../timeline-utils";
import type {
  AnimationClip,
  AnimationTrack,
  BoneTrack,
  IKControllerTrack,
} from "../types";


describe("interpolateTrack", () => {
  it("キーフレームが空の場合 null を返す", () => {
    const track: AnimationTrack = { parameterId: "x", keyframes: [] };
    expect(interpolateTrack(track, 0)).toBeNull();
  });

  it("キーフレームが1つの場合その値を返す", () => {
    const track: AnimationTrack = {
      parameterId: "x",
      keyframes: [{ frame: 5, value: 42, interpolation: "linear" }],
    };
    expect(interpolateTrack(track, 0)).toBe(42);
    expect(interpolateTrack(track, 5)).toBe(42);
    expect(interpolateTrack(track, 100)).toBe(42);
  });

  it("フレームが先頭キーフレーム以前なら先頭の値を返す", () => {
    const track: AnimationTrack = {
      parameterId: "x",
      keyframes: [
        { frame: 10, value: 1, interpolation: "linear" },
        { frame: 20, value: 2, interpolation: "linear" },
      ],
    };
    expect(interpolateTrack(track, 0)).toBe(1);
    expect(interpolateTrack(track, 5)).toBe(1);
  });

  it("フレームが末尾キーフレーム以降なら末尾の値を返す", () => {
    const track: AnimationTrack = {
      parameterId: "x",
      keyframes: [
        { frame: 0, value: 10, interpolation: "linear" },
        { frame: 30, value: 50, interpolation: "linear" },
      ],
    };
    expect(interpolateTrack(track, 30)).toBe(50);
    expect(interpolateTrack(track, 100)).toBe(50);
  });

  it("線形補間が正しく動作する", () => {
    const track: AnimationTrack = {
      parameterId: "x",
      keyframes: [
        { frame: 0, value: 0, interpolation: "linear" },
        { frame: 10, value: 100, interpolation: "linear" },
      ],
    };
    expect(interpolateTrack(track, 5)).toBe(50);
    expect(interpolateTrack(track, 2)).toBeCloseTo(20, 5);
    expect(interpolateTrack(track, 8)).toBeCloseTo(80, 5);
  });

  it("step補間で前のキーフレームの値を返す", () => {
    const track: AnimationTrack = {
      parameterId: "x",
      keyframes: [
        { frame: 0, value: 10, interpolation: "step" },
        { frame: 10, value: 90, interpolation: "step" },
      ],
    };
    expect(interpolateTrack(track, 5)).toBe(10);
    expect(interpolateTrack(track, 9)).toBe(10);
  });

  it("ベジェ補間が動作する", () => {
    const track: AnimationTrack = {
      parameterId: "x",
      keyframes: [
        {
          frame: 0,
          value: 0,
          interpolation: "bezier",
          cp1x: 0.25,
          cp1y: 0,
          cp2x: 0.75,
          cp2y: 1,
        },
        { frame: 10, value: 100, interpolation: "linear" },
      ],
    };
    const mid = interpolateTrack(track, 5);
    expect(mid).not.toBeNull();
    expect(mid!).toBeGreaterThanOrEqual(0);
    expect(mid!).toBeLessThanOrEqual(100);
  });

  it("楕円補間が動作する", () => {
    const track: AnimationTrack = {
      parameterId: "x",
      keyframes: [
        {
          frame: 0,
          value: 0,
          interpolation: "ellipse",
          ellipseRatio: 0.5,
          ellipseDirection: "cw",
        },
        { frame: 10, value: 100, interpolation: "linear" },
      ],
    };
    const mid = interpolateTrack(track, 5);
    expect(mid).not.toBeNull();
  });

  it("SNS補間が動作する", () => {
    const track: AnimationTrack = {
      parameterId: "x",
      keyframes: [
        {
          frame: 0,
          value: 0,
          interpolation: "sns",
          snsOscillations: 1,
          snsDamping: 0.5,
        },
        { frame: 10, value: 100, interpolation: "linear" },
      ],
    };
    const mid = interpolateTrack(track, 5);
    expect(mid).not.toBeNull();
  });

  it("3つ以上のキーフレームで正しく区間を選択する", () => {
    const track: AnimationTrack = {
      parameterId: "x",
      keyframes: [
        { frame: 0, value: 0, interpolation: "linear" },
        { frame: 10, value: 50, interpolation: "linear" },
        { frame: 20, value: 100, interpolation: "linear" },
      ],
    };
    expect(interpolateTrack(track, 5)).toBeCloseTo(25, 5);
    expect(interpolateTrack(track, 15)).toBeCloseTo(75, 5);
  });
});


describe("evaluateClipAtFrame", () => {
  it("全トラックを評価してパラメータ値マップを返す", () => {
    const clip: AnimationClip = {
      id: "test",
      name: "テスト",
      duration: 30,
      fps: 30,
      tracks: [
        {
          parameterId: "x",
          keyframes: [
            { frame: 0, value: 0, interpolation: "linear" },
            { frame: 30, value: 1, interpolation: "linear" },
          ],
        },
        {
          parameterId: "y",
          keyframes: [
            { frame: 0, value: 10, interpolation: "linear" },
            { frame: 30, value: 20, interpolation: "linear" },
          ],
        },
      ],
    };

    const values = evaluateClipAtFrame(clip, 15);
    expect(values.x).toBeCloseTo(0.5, 5);
    expect(values.y).toBeCloseTo(15, 5);
  });

  it("空トラックのクリップは空オブジェクトを返す", () => {
    const clip: AnimationClip = {
      id: "empty",
      name: "空",
      duration: 10,
      fps: 10,
      tracks: [],
    };

    const values = evaluateClipAtFrame(clip, 5);
    expect(Object.keys(values)).toHaveLength(0);
  });

  it("キーフレームが空のトラックはスキップされる", () => {
    const clip: AnimationClip = {
      id: "partial",
      name: "部分",
      duration: 10,
      fps: 10,
      tracks: [
        { parameterId: "empty_track", keyframes: [] },
        {
          parameterId: "valid_track",
          keyframes: [{ frame: 0, value: 42, interpolation: "linear" }],
        },
      ],
    };

    const values = evaluateClipAtFrame(clip, 5);
    expect(values.empty_track).toBeUndefined();
    expect(values.valid_track).toBe(42);
  });
});


describe("evaluateBoneTracksAtFrame", () => {
  it("ボーンの角度トラックを評価する", () => {
    const boneTracks: BoneTrack[] = [
      {
        boneId: "bone1",
        property: "angle",
        keyframes: [
          { frame: 0, value: 0, interpolation: "linear" },
          { frame: 30, value: 90, interpolation: "linear" },
        ],
      },
    ];

    const values = evaluateBoneTracksAtFrame(boneTracks, 15);
    expect(values.bone1).toBeDefined();
    expect(values.bone1!.angle).toBeCloseTo(45, 5);
  });

  it("同一ボーンの複数プロパティを統合する", () => {
    const boneTracks: BoneTrack[] = [
      {
        boneId: "bone1",
        property: "angle",
        keyframes: [{ frame: 0, value: 30, interpolation: "linear" }],
      },
      {
        boneId: "bone1",
        property: "scaleX",
        keyframes: [{ frame: 0, value: 1.5, interpolation: "linear" }],
      },
      {
        boneId: "bone1",
        property: "scaleY",
        keyframes: [{ frame: 0, value: 0.8, interpolation: "linear" }],
      },
    ];

    const values = evaluateBoneTracksAtFrame(boneTracks, 0);
    expect(values.bone1!.angle).toBe(30);
    expect(values.bone1!.scaleX).toBe(1.5);
    expect(values.bone1!.scaleY).toBe(0.8);
  });

  it("空のキーフレームのトラックはスキップされる", () => {
    const boneTracks: BoneTrack[] = [
      { boneId: "bone1", property: "angle", keyframes: [] },
    ];

    const values = evaluateBoneTracksAtFrame(boneTracks, 0);
    expect(values.bone1).toBeUndefined();
  });

  it("does not mutate Object.prototype for hostile bone ids", () => {
    const boneTracks: BoneTrack[] = [
      {
        boneId: "__proto__",
        property: "angle",
        keyframes: [{ frame: 0, value: 30, interpolation: "linear" }],
      },
    ];

    const values = evaluateBoneTracksAtFrame(boneTracks, 0);
    expect(values.__proto__!.angle).toBe(30);
    expect(({} as Record<string, unknown>).angle).toBeUndefined();
  });
});


describe("evaluateIKControllerTracksAtFrame", () => {
  it("IKコントローラのターゲット位置を評価する", () => {
    const tracks: IKControllerTrack[] = [
      {
        controllerId: "ik1",
        targetXKeyframes: [
          { frame: 0, value: 0, interpolation: "linear" },
          { frame: 10, value: 100, interpolation: "linear" },
        ],
        targetYKeyframes: [
          { frame: 0, value: 0, interpolation: "linear" },
          { frame: 10, value: 50, interpolation: "linear" },
        ],
      },
    ];

    const values = evaluateIKControllerTracksAtFrame(tracks, 5);
    expect(values.ik1).toBeDefined();
    expect(values.ik1!.targetX).toBeCloseTo(50, 5);
    expect(values.ik1!.targetY).toBeCloseTo(25, 5);
  });

  it("片方のキーフレームのみの場合、もう片方は0になる", () => {
    const tracks: IKControllerTrack[] = [
      {
        controllerId: "ik1",
        targetXKeyframes: [{ frame: 0, value: 100, interpolation: "linear" }],
        targetYKeyframes: [],
      },
    ];

    const values = evaluateIKControllerTracksAtFrame(tracks, 0);
    expect(values.ik1).toBeDefined();
    expect(values.ik1!.targetX).toBe(100);
    expect(values.ik1!.targetY).toBe(0);
  });

  it("両方のキーフレームが空の場合スキップされる", () => {
    const tracks: IKControllerTrack[] = [
      {
        controllerId: "ik1",
        targetXKeyframes: [],
        targetYKeyframes: [],
      },
    ];

    const values = evaluateIKControllerTracksAtFrame(tracks, 0);
    expect(values.ik1).toBeUndefined();
  });
});


describe("formatFrameTime", () => {
  it("0フレームは 00:00:00 を返す", () => {
    expect(formatFrameTime(0, 30)).toBe("00:00:00");
  });

  it("30フレーム(fps=30)は 00:01:00 を返す", () => {
    expect(formatFrameTime(30, 30)).toBe("00:01:00");
  });

  it("フレームが1分を超える場合", () => {
    expect(formatFrameTime(1800, 30)).toBe("01:00:00");
  });
});


describe("frameToSeconds", () => {
  it("フレーム番号を秒に変換する", () => {
    expect(frameToSeconds(30, 30)).toBe(1);
    expect(frameToSeconds(15, 30)).toBe(0.5);
    expect(frameToSeconds(0, 30)).toBe(0);
  });
});

describe("ellipseInterpolation — ブランチカバレッジ", () => {
  it("ratio=0 の場合、線形補間にフォールバックする", () => {
    const result = ellipseInterpolation(0.5, 0, 100, 0, "cw");
    expect(result).toBe(50);
  });

  it("direction='ccw' の場合、逆方向の膨らみになる", () => {
    const cw = ellipseInterpolation(0.5, 0, 100, 0.5, "cw");
    const ccw = ellipseInterpolation(0.5, 0, 100, 0.5, "ccw");
    expect(cw).not.toBe(ccw);
  });

  it("ratio が負の場合も線形補間にフォールバックする", () => {
    const result = ellipseInterpolation(0.5, 10, 20, -1, "cw");
    expect(result).toBe(15);
  });
});

describe("snsInterpolation — 直接呼び出し", () => {
  it("t=0 で startVal を返す", () => {
    expect(snsInterpolation(0, 0, 100)).toBe(0);
  });

  it("t=1 で endVal を返す", () => {
    expect(snsInterpolation(1, 0, 100)).toBe(100);
  });

  it("カスタム振動回数と減衰で動作する", () => {
    const result = snsInterpolation(0.5, 0, 100, 2, 1.0);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(100);
  });
});

describe("solveCubicBezierT — エッジケース", () => {
  it("標準的な制御点で正しい t を返す", () => {
    const t = solveCubicBezierT(0.5, 0.25, 0.75);
    expect(t).toBeCloseTo(0.5, 2);
  });

  it("極端な制御点で二分探索にフォールバックしても正しく動く", () => {
    const t = solveCubicBezierT(0.5, 0, 1);
    expect(t).toBeGreaterThan(0);
    expect(t).toBeLessThan(1);
  });

  it("導関数がゼロ付近になる制御点で二分探索にフォールバック", () => {
    const t = solveCubicBezierT(0.5, 1, 0);
    expect(t).toBeGreaterThanOrEqual(0);
    expect(t).toBeLessThanOrEqual(1);
  });

  it("ニュートン法が発散する制御点で二分探索にフォールバック", () => {
    // bezierDerivative(t,0,0) = 3t^2(1-0) = 3t^2
    const t = solveCubicBezierT(0.001, 0, 0);
    expect(t).toBeGreaterThanOrEqual(0);
    expect(t).toBeLessThanOrEqual(1);
    expect(t).toBeCloseTo(0.1, 2);
  });

  it("x=0 で t=0 を返す", () => {
    expect(solveCubicBezierT(0, 0.25, 0.75)).toBeCloseTo(0, 4);
  });

  it("x=1 で t=1 に近い値を返す", () => {
    expect(solveCubicBezierT(1, 0.25, 0.75)).toBeCloseTo(1, 4);
  });
});

describe("evaluateCubicBezier", () => {
  it("t=0 で 0 を返す", () => {
    expect(evaluateCubicBezier(0, 0, 1)).toBe(0);
  });

  it("t=1 で 1 を返す", () => {
    expect(evaluateCubicBezier(1, 0, 1)).toBe(1);
  });
});

describe("interpolateTrack — 追加ブランチ", () => {
  it("同一フレームの2キーフレーム（range=0）で前の値を返す", () => {
    const track: AnimationTrack = {
      parameterId: "x",
      keyframes: [
        { frame: 5, value: 10, interpolation: "linear" },
        { frame: 5, value: 20, interpolation: "linear" },
      ],
    };
    expect(interpolateTrack(track, 5)).toBe(10);
  });

  it("ベジェ補間で制御点が未指定（デフォルト値使用）", () => {
    const track: AnimationTrack = {
      parameterId: "x",
      keyframes: [
        { frame: 0, value: 0, interpolation: "bezier" },
        { frame: 10, value: 100, interpolation: "linear" },
      ],
    };
    const result = interpolateTrack(track, 5);
    expect(result).not.toBeNull();
    expect(result!).toBeGreaterThanOrEqual(0);
    expect(result!).toBeLessThanOrEqual(100);
  });

  it("楕円補間で ccw 方向", () => {
    const track: AnimationTrack = {
      parameterId: "x",
      keyframes: [
        {
          frame: 0,
          value: 0,
          interpolation: "ellipse",
          ellipseRatio: 0.5,
          ellipseDirection: "ccw",
        },
        { frame: 10, value: 100, interpolation: "linear" },
      ],
    };
    const result = interpolateTrack(track, 5);
    expect(result).not.toBeNull();
  });

  it("楕円補間でパラメータ未指定（デフォルト値使用）", () => {
    const track: AnimationTrack = {
      parameterId: "x",
      keyframes: [
        { frame: 0, value: 0, interpolation: "ellipse" },
        { frame: 10, value: 100, interpolation: "linear" },
      ],
    };
    const result = interpolateTrack(track, 5);
    expect(result).not.toBeNull();
  });

  it("SNS補間でパラメータ未指定（デフォルト値使用）", () => {
    const track: AnimationTrack = {
      parameterId: "x",
      keyframes: [
        { frame: 0, value: 0, interpolation: "sns" },
        { frame: 10, value: 100, interpolation: "linear" },
      ],
    };
    const result = interpolateTrack(track, 5);
    expect(result).not.toBeNull();
  });
});
