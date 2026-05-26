import { describe, expect, it } from "vitest";
import { advanceAnimationStep } from "../model-animation-step";
import type { AnimationClip } from "../types";

function minimalClip(overrides: Partial<AnimationClip> = {}): AnimationClip {
  return {
    id: "c",
    name: "c",
    duration: 60,
    fps: 30,
    tracks: [],
    ...overrides,
  };
}

describe("advanceAnimationStep", () => {
  it("advances the current frame by deltaTime * fps", () => {
    const clip = minimalClip();
    const result = advanceAnimationStep(clip, 0, 0.5, true);
    expect(result.newFrame).toBeCloseTo(15);
    expect(result.playing).toBe(true);
  });

  it("wraps when looping past the clip duration", () => {
    const clip = minimalClip({ duration: 60, fps: 30 });
    const result = advanceAnimationStep(clip, 55, 0.5, true);
    expect(result.newFrame).toBeCloseTo(10);
    expect(result.playing).toBe(true);
  });

  it("clamps to duration and stops when loop is disabled", () => {
    const clip = minimalClip({ duration: 60, fps: 30 });
    const result = advanceAnimationStep(clip, 55, 0.5, false);
    expect(result.newFrame).toBe(60);
    expect(result.playing).toBe(false);
  });

  it("keeps playing before the clip duration when loop is disabled", () => {
    const clip = minimalClip({ duration: 60, fps: 30 });
    const result = advanceAnimationStep(clip, 0, 1, false);
    expect(result.newFrame).toBe(30);
    expect(result.playing).toBe(true);
  });

  it("evaluates parameter tracks", () => {
    const clip = minimalClip({
      tracks: [
        {
          parameterId: "p1",
          keyframes: [
            { frame: 0, value: 0, interpolation: "linear" },
            { frame: 30, value: 1, interpolation: "linear" },
          ],
        },
      ],
    });
    const result = advanceAnimationStep(clip, 0, 0.5, true);
    expect(result.paramValues.p1).toBeCloseTo(0.5);
  });

  it("splits bone track outputs by property", () => {
    const clip = minimalClip({
      boneTracks: [
        {
          boneId: "b1",
          property: "angle",
          keyframes: [{ frame: 0, value: 1.5, interpolation: "linear" }],
        },
        {
          boneId: "b1",
          property: "scaleX",
          keyframes: [{ frame: 0, value: 2, interpolation: "linear" }],
        },
        {
          boneId: "b2",
          property: "scaleY",
          keyframes: [{ frame: 0, value: 0.5, interpolation: "linear" }],
        },
      ],
    });
    const result = advanceAnimationStep(clip, 0, 0, true);
    expect(result.boneAngles.b1).toBe(1.5);
    expect(result.boneScaleX.b1).toBe(2);
    expect(result.boneScaleY.b2).toBe(0.5);
  });

  it("skips empty bone tracks", () => {
    const clip = minimalClip({
      boneTracks: [{ boneId: "b1", property: "angle", keyframes: [] }],
    });
    const result = advanceAnimationStep(clip, 0, 0, true);
    expect(result.boneAngles.b1).toBeUndefined();
  });

  it("returns empty maps for optional track families when they are absent", () => {
    const clip = minimalClip();
    const result = advanceAnimationStep(clip, 0, 0, true);
    expect(result.boneAngles).toEqual({});
    expect(result.boneScaleX).toEqual({});
    expect(result.boneScaleY).toEqual({});
  });
});
