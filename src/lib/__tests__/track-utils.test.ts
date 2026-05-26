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

  it("デフォルトの補間タイプは linear", () => {
    const keyframes: TimelineKeyframe[] = [];
    upsertKeyframe(keyframes, 0, 1.0);
    expect(keyframes[0]!.interpolation).toBe("linear");
  });

  it("指定した補間タイプが適用される", () => {
    const keyframes: TimelineKeyframe[] = [];
    upsertKeyframe(keyframes, 5, 0.8, "bezier");
    expect(keyframes[0]).toEqual({ frame: 5, value: 0.8, interpolation: "bezier" });
  });

  it("同一フレームが存在する場合は上書きする", () => {
    const keyframes: TimelineKeyframe[] = [
      { frame: 10, value: 0.5, interpolation: "linear" },
    ];
    upsertKeyframe(keyframes, 10, 0.9, "step");
    expect(keyframes).toHaveLength(1);
    expect(keyframes[0]).toEqual({ frame: 10, value: 0.9, interpolation: "step" });
  });

  it("上書き時に配列長が変わらない", () => {
    const keyframes: TimelineKeyframe[] = [
      { frame: 0, value: 0, interpolation: "linear" },
      { frame: 10, value: 1, interpolation: "linear" },
      { frame: 20, value: 0, interpolation: "linear" },
    ];
    upsertKeyframe(keyframes, 10, 0.5, "bezier");
    expect(keyframes).toHaveLength(3);
    expect(keyframes[1]).toEqual({ frame: 10, value: 0.5, interpolation: "bezier" });
  });

  it("挿入後にフレーム順でソートされる", () => {
    const keyframes: TimelineKeyframe[] = [
      { frame: 0, value: 0, interpolation: "linear" },
      { frame: 20, value: 1, interpolation: "linear" },
    ];
    upsertKeyframe(keyframes, 10, 0.5);
    expect(keyframes.map((kf) => kf.frame)).toEqual([0, 10, 20]);
  });

  it("先頭に挿入してもソート順が維持される", () => {
    const keyframes: TimelineKeyframe[] = [
      { frame: 10, value: 1, interpolation: "linear" },
      { frame: 20, value: 2, interpolation: "linear" },
    ];
    upsertKeyframe(keyframes, 0, 0);
    expect(keyframes.map((kf) => kf.frame)).toEqual([0, 10, 20]);
  });

  it("末尾に挿入してもソート順が維持される", () => {
    const keyframes: TimelineKeyframe[] = [
      { frame: 0, value: 0, interpolation: "linear" },
      { frame: 10, value: 1, interpolation: "linear" },
    ];
    upsertKeyframe(keyframes, 30, 3);
    expect(keyframes.map((kf) => kf.frame)).toEqual([0, 10, 30]);
  });

  it("複数回の挿入でソート順が維持される", () => {
    const keyframes: TimelineKeyframe[] = [];
    upsertKeyframe(keyframes, 30, 3);
    upsertKeyframe(keyframes, 10, 1);
    upsertKeyframe(keyframes, 20, 2);
    upsertKeyframe(keyframes, 0, 0);
    expect(keyframes.map((kf) => kf.frame)).toEqual([0, 10, 20, 30]);
    expect(keyframes.map((kf) => kf.value)).toEqual([0, 1, 2, 3]);
  });

  it("上書き時にソート順が崩れない", () => {
    const keyframes: TimelineKeyframe[] = [
      { frame: 0, value: 0, interpolation: "linear" },
      { frame: 10, value: 1, interpolation: "linear" },
      { frame: 20, value: 2, interpolation: "linear" },
    ];
    upsertKeyframe(keyframes, 10, 99);
    expect(keyframes.map((kf) => kf.frame)).toEqual([0, 10, 20]);
    expect(keyframes[1]!.value).toBe(99);
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

  it("元の配列を変更しない（新しい配列を返す）", () => {
    const keyframes: TimelineKeyframe[] = [
      { frame: 0, value: 0, interpolation: "linear" },
      { frame: 10, value: 1, interpolation: "linear" },
    ];
    const result = removeKeyframeAtFrame(keyframes, 10);
    expect(keyframes).toHaveLength(2);
    expect(result).not.toBe(keyframes);
    expect(result).toHaveLength(1);
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
