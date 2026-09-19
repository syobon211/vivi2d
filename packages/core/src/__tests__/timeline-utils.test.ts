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

  it("nonlinear interpolation dispatch preserves custom parameters and defaults", () => {
    const rows: Array<{
      name: string;
      keyframe: AnimationTrack["keyframes"][number];
      frame: number;
      expected: number;
    }> = [
      // x(t)=t, y(t)=t^3: the midpoint must differ from linear interpolation.
      {
        name: "custom bezier",
        keyframe: {
          frame: 0,
          value: 0,
          interpolation: "bezier",
          cp1x: 1 / 3,
          cp2x: 2 / 3,
          cp1y: 0,
          cp2y: 0,
        },
        frame: 5,
        expected: 12.5,
      },
      // Default Bezier at parameter 1/4 has x=29/128, y=5/32.
      {
        name: "default bezier",
        keyframe: { frame: 0, value: 0, interpolation: "bezier" },
        frame: 2.265625,
        expected: 15.625,
      },
      {
        name: "custom clockwise ellipse",
        keyframe: {
          frame: 0,
          value: 0,
          interpolation: "ellipse",
          ellipseRatio: 0.25,
          ellipseDirection: "cw",
        },
        frame: 5,
        expected: 62.5,
      },
      {
        name: "counterclockwise ellipse",
        keyframe: {
          frame: 0,
          value: 0,
          interpolation: "ellipse",
          ellipseRatio: 0.5,
          ellipseDirection: "ccw",
        },
        frame: 5,
        expected: 25,
      },
      {
        name: "default ellipse",
        keyframe: { frame: 0, value: 0, interpolation: "ellipse" },
        frame: 5,
        expected: 75,
      },
      {
        name: "undamped sns",
        keyframe: {
          frame: 0,
          value: 0,
          interpolation: "sns",
          snsOscillations: 1,
          snsDamping: 0,
        },
        frame: 2.5,
        expected: 38.125,
      },
      // Quarter-cycle sine is 1; the default damping contributes exp(-5/8).
      {
        name: "default sns",
        keyframe: { frame: 0, value: 0, interpolation: "sns" },
        frame: 2.5,
        expected: 15.625 + 22.5 * Math.exp(-0.625),
      },
    ];
    for (const { name, keyframe, frame, expected } of rows) {
      const track: AnimationTrack = {
        parameterId: "x",
        keyframes: [keyframe, { frame: 10, value: 100, interpolation: "linear" }],
      };
      expect(interpolateTrack(track, frame), name).toBeCloseTo(expected, 3);
    }
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

describe("ellipseInterpolation", () => {
  it("non-positive ratio uses linear values at asymmetric endpoints and interior frames", () => {
    for (const ratio of [0, -1]) {
      for (const [t, expected] of [
        [0, 10],
        [0.25, 30],
        [0.5, 50],
        [0.75, 70],
        [1, 90],
      ]) {
        expect(ellipseInterpolation(t!, 10, 90, ratio, "cw")).toBeCloseTo(expected!, 8);
      }
    }
  });

  it("preserves endpoints, direction, ellipse strength, and equal-value tracks", () => {
    const cases = [
      [0, 0.5, "cw", 10],
      [1, 0.5, "cw", 90],
      [0.25, 0.5, "cw", 35.8578643763],
      [0.25, 0.5, "ccw", 7.5735931288],
      [0.5, 0.5, "cw", 70],
      [0.5, 0.5, "ccw", 30],
      [0.5, 1, "cw", 90],
    ] as const;
    for (const [t, ratio, direction, expected] of cases) {
      expect(ellipseInterpolation(t, 10, 90, ratio, direction)).toBeCloseTo(expected, 8);
    }
    expect(ellipseInterpolation(0.25, 42, 42)).toBe(42);
  });
});

describe("snsInterpolation", () => {
  it("preserves endpoints with default and high oscillation settings", () => {
    expect(snsInterpolation(0, 10, 90)).toBe(10);
    expect(snsInterpolation(1, 10, 90)).toBe(90);
    expect(snsInterpolation(0, 10, 90, 5, 5)).toBe(10);
    expect(snsInterpolation(1, 10, 90, 5, 5)).toBe(90);
  });

  it("distinguishes smoothstep, positive and negative vibration, and damping away from zero crossings", () => {
    // At quarter-periods the oscillation is +1 or -1, not its midpoint zero.
    expect(snsInterpolation(0.25, 10, 90, 0, 0.5)).toBeCloseTo(22.5, 8);
    expect(snsInterpolation(0.75, 10, 90, 0, 0.5)).toBeCloseTo(77.5, 8);
    expect(snsInterpolation(0.25, 0, 100, 1, 0)).toBeCloseTo(38.125, 8);
    expect(snsInterpolation(0.25, 0, 100, 3, 0)).toBeCloseTo(-6.875, 8);
    const damped = snsInterpolation(0.25, 0, 100, 1, 5);
    expect(damped).toBeGreaterThan(15.625);
    expect(damped).toBeLessThan(15.675);
  });

  it("keeps high-damping interior values bounded across an entire interval", () => {
    for (let sample = 0; sample <= 100; sample++) {
      const value = snsInterpolation(sample / 100, 0, 100, 1, 10);
      expect(value).toBeGreaterThan(-20);
      expect(value).toBeLessThan(120);
    }
  });
});

describe("solveCubicBezierT — エッジケース", () => {
  it("標準的な制御点で正しい t を返す", () => {
    const t = solveCubicBezierT(0.5, 0.25, 0.75);
    expect(t).toBeCloseTo(0.5, 2);
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
});
