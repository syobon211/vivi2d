import type { InterpolationType, TimelineKeyframe } from "./types";

export function upsertKeyframe(
  keyframes: TimelineKeyframe[],
  frame: number,
  value: number,
  interpolation: InterpolationType = "linear",
): void {
  const idx = keyframes.findIndex((kf) => kf.frame === frame);
  const kf: TimelineKeyframe = { frame, value, interpolation };
  if (idx >= 0) {
    keyframes[idx] = kf;
  } else {
    keyframes.push(kf);
    keyframes.sort((a, b) => a.frame - b.frame);
  }
}

export function removeKeyframeAtFrame(
  keyframes: TimelineKeyframe[],
  frame: number,
): TimelineKeyframe[] {
  return keyframes.filter((kf) => kf.frame !== frame);
}
