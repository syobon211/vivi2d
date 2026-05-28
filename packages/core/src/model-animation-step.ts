import { evaluateClipAtFrame, interpolateTrack } from "./timeline-utils";
import type { AnimationClip } from "./types";

export interface AnimationStepResult {
  newFrame: number;

  playing: boolean;

  paramValues: Record<string, number>;

  boneAngles: Record<string, number>;

  boneScaleX: Record<string, number>;

  boneScaleY: Record<string, number>;
}

export function advanceAnimationStep(
  clip: AnimationClip,
  currentFrame: number,
  deltaTime: number,
  loop: boolean,
): AnimationStepResult {
  const frameDelta = deltaTime * clip.fps;
  let newFrame = currentFrame + frameDelta;
  let playing = true;

  if (newFrame >= clip.duration) {
    if (loop) {
      newFrame = newFrame % clip.duration;
    } else {
      newFrame = clip.duration;
      playing = false;
    }
  }

  const paramValues = evaluateClipAtFrame(clip, newFrame);

  const boneAngles: Record<string, number> = {};
  const boneScaleX: Record<string, number> = {};
  const boneScaleY: Record<string, number> = {};
  if (clip.boneTracks) {
    for (const track of clip.boneTracks) {
      const val = interpolateTrack(
        { parameterId: "", keyframes: track.keyframes },
        newFrame,
      );
      if (val === null) continue;
      if (track.property === "angle") {
        boneAngles[track.boneId] = val;
      } else if (track.property === "scaleX") {
        boneScaleX[track.boneId] = val;
      } else {
        boneScaleY[track.boneId] = val;
      }
    }
  }

  return {
    newFrame,
    playing,
    paramValues,
    boneAngles,
    boneScaleX,
    boneScaleY,
  };
}
