import {
  evaluateImageSequenceAtFrame,
  evaluateImageSequenceTracksAtFrame,
} from "@vivi2d/core/image-sequence-utils";
import type { ImageSequenceTrack } from "@vivi2d/core/types";
import { describe, expect, it } from "vitest";

describe("evaluateImageSequenceAtFrame", () => {
  it("空のエントリで null を返す", () => {
    const track: ImageSequenceTrack = { targetMeshId: "m1", entries: [] };
    expect(evaluateImageSequenceAtFrame(track, 0)).toBeNull();
  });

  it("最初のエントリより前のフレームで null を返す", () => {
    const track: ImageSequenceTrack = {
      targetMeshId: "m1",
      entries: [{ startFrame: 10, imageId: "img1" }],
    };
    expect(evaluateImageSequenceAtFrame(track, 5)).toBeNull();
  });

  it("エントリの startFrame ちょうどで該当画像を返す", () => {
    const track: ImageSequenceTrack = {
      targetMeshId: "m1",
      entries: [{ startFrame: 10, imageId: "img1" }],
    };
    expect(evaluateImageSequenceAtFrame(track, 10)).toBe("img1");
  });

  it("2つ目のエントリに切り替わる", () => {
    const track: ImageSequenceTrack = {
      targetMeshId: "m1",
      entries: [
        { startFrame: 0, imageId: "img1" },
        { startFrame: 15, imageId: "img2" },
        { startFrame: 30, imageId: "img3" },
      ],
    };
    expect(evaluateImageSequenceAtFrame(track, 0)).toBe("img1");
    expect(evaluateImageSequenceAtFrame(track, 14)).toBe("img1");
    expect(evaluateImageSequenceAtFrame(track, 15)).toBe("img2");
    expect(evaluateImageSequenceAtFrame(track, 29)).toBe("img2");
    expect(evaluateImageSequenceAtFrame(track, 30)).toBe("img3");
    expect(evaluateImageSequenceAtFrame(track, 100)).toBe("img3");
  });

  it("単一エントリの場合、そのフレーム以降は常にその画像", () => {
    const track: ImageSequenceTrack = {
      targetMeshId: "m1",
      entries: [{ startFrame: 5, imageId: "only" }],
    };
    expect(evaluateImageSequenceAtFrame(track, 5)).toBe("only");
    expect(evaluateImageSequenceAtFrame(track, 1000)).toBe("only");
  });
});

describe("evaluateImageSequenceTracksAtFrame", () => {
  it("複数トラックを同時に評価する", () => {
    const tracks: ImageSequenceTrack[] = [
      {
        targetMeshId: "m1",
        entries: [
          { startFrame: 0, imageId: "a" },
          { startFrame: 10, imageId: "b" },
        ],
      },
      {
        targetMeshId: "m2",
        entries: [{ startFrame: 5, imageId: "c" }],
      },
    ];
    const result = evaluateImageSequenceTracksAtFrame(tracks, 7);
    expect(result).toEqual({ m1: "a", m2: "c" });
  });

  it("該当なしのトラックはマップに含まれない", () => {
    const tracks: ImageSequenceTrack[] = [
      {
        targetMeshId: "m1",
        entries: [{ startFrame: 20, imageId: "a" }],
      },
    ];
    const result = evaluateImageSequenceTracksAtFrame(tracks, 10);
    expect(result).toEqual({});
  });

  it("空トラック配列で空オブジェクトを返す", () => {
    expect(evaluateImageSequenceTracksAtFrame([], 0)).toEqual({});
  });
});
