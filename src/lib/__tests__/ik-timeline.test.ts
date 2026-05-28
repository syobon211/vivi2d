import { evaluateIKControllerTracksAtFrame } from "@vivi2d/core/timeline-utils";
import type { IKControllerTrack } from "@vivi2d/core/types";
import { describe, expect, it } from "vitest";

describe("evaluateIKControllerTracksAtFrame", () => {
  it("キーフレームからターゲット位置を補間する", () => {
    const tracks: IKControllerTrack[] = [
      {
        controllerId: "ik-1",
        targetXKeyframes: [
          { frame: 0, value: 0, interpolation: "linear" },
          { frame: 10, value: 100, interpolation: "linear" },
        ],
        targetYKeyframes: [
          { frame: 0, value: 0, interpolation: "linear" },
          { frame: 10, value: 200, interpolation: "linear" },
        ],
      },
    ];

    const result = evaluateIKControllerTracksAtFrame(tracks, 5);
    expect(result["ik-1"]).toBeDefined();
    expect(result["ik-1"]!.targetX).toBeCloseTo(50, 3);
    expect(result["ik-1"]!.targetY).toBeCloseTo(100, 3);
  });

  it("フレーム0で開始値を返す", () => {
    const tracks: IKControllerTrack[] = [
      {
        controllerId: "ik-1",
        targetXKeyframes: [
          { frame: 0, value: 10, interpolation: "linear" },
          { frame: 10, value: 100, interpolation: "linear" },
        ],
        targetYKeyframes: [{ frame: 0, value: 20, interpolation: "linear" }],
      },
    ];

    const result = evaluateIKControllerTracksAtFrame(tracks, 0);
    expect(result["ik-1"]!.targetX).toBeCloseTo(10, 3);
    expect(result["ik-1"]!.targetY).toBeCloseTo(20, 3);
  });

  it("複数のコントローラトラックを評価する", () => {
    const tracks: IKControllerTrack[] = [
      {
        controllerId: "ik-1",
        targetXKeyframes: [{ frame: 0, value: 10, interpolation: "linear" }],
        targetYKeyframes: [{ frame: 0, value: 20, interpolation: "linear" }],
      },
      {
        controllerId: "ik-2",
        targetXKeyframes: [{ frame: 0, value: 30, interpolation: "linear" }],
        targetYKeyframes: [{ frame: 0, value: 40, interpolation: "linear" }],
      },
    ];

    const result = evaluateIKControllerTracksAtFrame(tracks, 0);
    expect(result["ik-1"]!.targetX).toBeCloseTo(10, 3);
    expect(result["ik-2"]!.targetX).toBeCloseTo(30, 3);
  });

  it("空のトラック配列で空オブジェクトを返す", () => {
    const result = evaluateIKControllerTracksAtFrame([], 0);
    expect(Object.keys(result)).toHaveLength(0);
  });

  it("キーフレームが空の場合はスキップされる", () => {
    const tracks: IKControllerTrack[] = [
      {
        controllerId: "ik-1",
        targetXKeyframes: [],
        targetYKeyframes: [],
      },
    ];

    const result = evaluateIKControllerTracksAtFrame(tracks, 5);
    expect(result["ik-1"]).toBeUndefined();
  });
});
