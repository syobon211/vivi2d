import { removeKeyframeAtFrame, upsertKeyframe } from "@vivi2d/core/track-utils";
import type { TimelineKeyframe } from "@vivi2d/core/types";
import { describe, expect, it } from "vitest";

// --- upsertKeyframe ---

describe("upsertKeyframe", () => {
  it("空配列に新しいキーフレームを挿入する", () => {
    const keyframes: TimelineKeyframe[] = [];
    upsertKeyframe(keyframes, 10, 0.5);
    expect(keyframes).toEqual([{ frame: 10, value: 0.5, interpolation: "linear" }]);
  });


  it("指定した補間タイプが適用される", () => {
    const keyframes: TimelineKeyframe[] = [];
    upsertKeyframe(keyframes, 5, 0.8, "bezier");
    expect(keyframes[0]).toEqual({ frame: 5, value: 0.8, interpolation: "bezier" });
  });

  it("前中後への挿入と同フレームの値・補間更新を整列したまま保持する", () => {
    const keyframes: TimelineKeyframe[] = [];
    upsertKeyframe(keyframes, 20, 2);
    upsertKeyframe(keyframes, 0, 0);
    upsertKeyframe(keyframes, 30, 3);
    upsertKeyframe(keyframes, 10, 1);
    expect(keyframes).toEqual([
      { frame: 0, value: 0, interpolation: "linear" },
      { frame: 10, value: 1, interpolation: "linear" },
      { frame: 20, value: 2, interpolation: "linear" },
      { frame: 30, value: 3, interpolation: "linear" },
    ]);
    upsertKeyframe(keyframes, 10, 0.9, "step");
    expect(keyframes).toEqual([
      { frame: 0, value: 0, interpolation: "linear" },
      { frame: 10, value: 0.9, interpolation: "step" },
      { frame: 20, value: 2, interpolation: "linear" },
      { frame: 30, value: 3, interpolation: "linear" },
    ]);
    upsertKeyframe(keyframes, 10, 0.5, "bezier");
    expect(keyframes).toHaveLength(4);
    expect(keyframes.map(({ frame }) => frame)).toEqual([0, 10, 20, 30]);
    expect(keyframes[1]).toEqual({ frame: 10, value: 0.5, interpolation: "bezier" });
  });












});

// --- removeKeyframeAtFrame ---

describe("removeKeyframeAtFrame", () => {
  it("指定フレームのキーフレームを削除する", () => {
      const keyframes: TimelineKeyframe[] = [
        { frame: 0, value: 0, interpolation: "linear" },
        { frame: 10, value: 1, interpolation: "linear" },
        { frame: 20, value: 2, interpolation: "linear" },
      ];
      const result = removeKeyframeAtFrame(keyframes, 10);
      expect(result).not.toBe(keyframes);
      expect(keyframes.map((kf) => kf.frame)).toEqual([0, 10, 20]);
      expect(result).toHaveLength(2);
      expect(result.map((kf) => kf.frame)).toEqual([0, 20]);
    });

  it("存在しないフレームを指定した場合は元の内容がそのまま返る", () => {
    const keyframes: TimelineKeyframe[] = [
      { frame: 0, value: 0, interpolation: "linear" },
      { frame: 10, value: 1, interpolation: "linear" },
    ];
    const result = removeKeyframeAtFrame(keyframes, 99);
    expect(result).toHaveLength(2);
    expect(result.map((kf) => kf.frame)).toEqual([0, 10]);
  });

  it("空配列に対して実行しても空配列が返る", () => {
    const result = removeKeyframeAtFrame([], 5);
    expect(result).toEqual([]);
  });



  it("先頭のキーフレームを削除できる", () => {
    const keyframes: TimelineKeyframe[] = [
      { frame: 0, value: 0, interpolation: "linear" },
      { frame: 10, value: 1, interpolation: "linear" },
      { frame: 20, value: 2, interpolation: "linear" },
    ];
    const result = removeKeyframeAtFrame(keyframes, 0);
    expect(result.map((kf) => kf.frame)).toEqual([10, 20]);
  });

  it("末尾のキーフレームを削除できる", () => {
    const keyframes: TimelineKeyframe[] = [
      { frame: 0, value: 0, interpolation: "linear" },
      { frame: 10, value: 1, interpolation: "linear" },
      { frame: 20, value: 2, interpolation: "linear" },
    ];
    const result = removeKeyframeAtFrame(keyframes, 20);
    expect(result.map((kf) => kf.frame)).toEqual([0, 10]);
  });

  it("唯一のキーフレームを削除すると空配列になる", () => {
    const keyframes: TimelineKeyframe[] = [{ frame: 5, value: 1, interpolation: "step" }];
    const result = removeKeyframeAtFrame(keyframes, 5);
    expect(result).toEqual([]);
  });
});
