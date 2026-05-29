import type {
  AnimationClip,
  AnimationTrack,
  BoneTrack,
  IKControllerTrack,
  TimelineKeyframe,
} from "./types";

function bezierComponent(t: number, p1: number, p2: number): number {
  const mt = 1 - t;
  return 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t;
}

function bezierDerivative(t: number, p1: number, p2: number): number {
  const mt = 1 - t;
  return 3 * mt * mt * p1 + 6 * mt * t * (p2 - p1) + 3 * t * t * (1 - p2);
}

export function solveCubicBezierT(
  x: number,
  p1x: number,
  p2x: number,
  epsilon = 1e-6,
): number {
  let t = x;
  for (let i = 0; i < 8; i += 1) {
    const bx = bezierComponent(t, p1x, p2x) - x;
    if (Math.abs(bx) < epsilon) return t;
    const dx = bezierDerivative(t, p1x, p2x);
    if (Math.abs(dx) < 1e-8) break;
    t -= bx / dx;
  }
  let lo = 0;
  let hi = 1;
  t = x;
  for (let i = 0; i < 20; i += 1) {
    const bx = bezierComponent(t, p1x, p2x);
    if (Math.abs(bx - x) < epsilon) return t;
    if (bx < x) lo = t;
    else hi = t;
    t = (lo + hi) / 2;
  }
  return t;
}

export function evaluateCubicBezier(t: number, p1y: number, p2y: number): number {
  return bezierComponent(t, p1y, p2y);
}

export function ellipseInterpolation(
  t: number,
  startVal: number,
  endVal: number,
  ratio = 0.5,
  direction: "cw" | "ccw" = "cw",
): number {
  if (ratio <= 0) return startVal + (endVal - startVal) * t;
  const theta = t * Math.PI;
  const ex = (1 - Math.cos(theta)) / 2;
  const ey = Math.sin(theta) * ratio;
  const mid = (startVal + endVal) / 2;
  const halfRange = (endVal - startVal) / 2;
  const bulge = direction === "cw" ? ey : -ey;
  return mid + halfRange * (2 * ex - 1) + halfRange * bulge;
}

export function snsInterpolation(
  t: number,
  startVal: number,
  endVal: number,
  oscillations = 1,
  damping = 0.5,
): number {
  const range = endVal - startVal;
  const base = t * t * (3 - 2 * t);
  const vibration =
    Math.sin(oscillations * Math.PI * 2 * t) * Math.exp(-damping * t * 5) * (1 - t);
  return startVal + range * (base + vibration * 0.3);
}

export function interpolateTrack(track: AnimationTrack, frame: number): number | null {
  return interpolateKeyframes(track.keyframes, frame);
}

export function evaluateClipAtFrame(
  clip: AnimationClip,
  frame: number,
): Record<string, number> {
  const values = Object.create(null) as Record<string, number>;
  for (const track of clip.tracks) {
    const value = interpolateTrack(track, frame);
    if (value !== null) values[track.parameterId] = value;
  }
  return values;
}

export function formatFrameTime(frame: number, fps: number): string {
  const totalSeconds = frame / fps;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const frames = Math.round(frame % fps);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}:${String(frames).padStart(2, "0")}`;
}

export function frameToSeconds(frame: number, fps: number): number {
  return frame / fps;
}

export interface BoneTrackValues {
  [boneId: string]: { angle?: number; scaleX?: number; scaleY?: number };
}

export function evaluateBoneTracksAtFrame(
  boneTracks: BoneTrack[],
  frame: number,
): BoneTrackValues {
  const values = Object.create(null) as BoneTrackValues;
  for (const track of boneTracks) {
    const value = interpolateKeyframes(track.keyframes, frame);
    if (value === null) continue;
    values[track.boneId] ??= {};
    values[track.boneId]![track.property] = value;
  }
  return values;
}

function interpolateSegment(
  a: TimelineKeyframe,
  b: TimelineKeyframe,
  frame: number,
): number {
  const range = b.frame - a.frame;
  if (range === 0) return a.value;
  const t = (frame - a.frame) / range;
  switch (a.interpolation) {
    case "step":
      return a.value;
    case "bezier": {
      const cp1x = a.cp1x ?? 0.25;
      const cp1y = a.cp1y ?? 0;
      const cp2x = a.cp2x ?? 0.75;
      const cp2y = a.cp2y ?? 1;
      const bezierT = solveCubicBezierT(t, cp1x, cp2x);
      const bezierY = evaluateCubicBezier(bezierT, cp1y, cp2y);
      return a.value + (b.value - a.value) * bezierY;
    }
    case "ellipse":
      return ellipseInterpolation(
        t,
        a.value,
        b.value,
        a.ellipseRatio ?? 0.5,
        a.ellipseDirection ?? "cw",
      );
    case "sns":
      return snsInterpolation(
        t,
        a.value,
        b.value,
        a.snsOscillations ?? 1,
        a.snsDamping ?? 0.5,
      );
    default:
      return a.value + (b.value - a.value) * t;
  }
}

function interpolateKeyframes(
  keyframes: TimelineKeyframe[],
  frame: number,
): number | null {
  if (keyframes.length === 0) return null;
  const first = keyframes[0];
  if (!first) return null;
  if (keyframes.length === 1) return first.value;

  const last = keyframes[keyframes.length - 1];
  if (!last) return null;
  if (frame <= first.frame) return first.value;
  if (frame >= last.frame) return last.value;

  for (let index = 0; index < keyframes.length - 1; index += 1) {
    const current = keyframes[index];
    const next = keyframes[index + 1];
    if (!current || !next) continue;
    if (frame >= current.frame && frame <= next.frame) {
      return interpolateSegment(current, next, frame);
    }
  }
  return last.value;
}

export interface IKControllerTrackValues {
  [controllerId: string]: { targetX: number; targetY: number };
}

export function evaluateIKControllerTracksAtFrame(
  ikTracks: IKControllerTrack[],
  frame: number,
): IKControllerTrackValues {
  const values = Object.create(null) as IKControllerTrackValues;
  for (const track of ikTracks) {
    const targetX = interpolateKeyframes(track.targetXKeyframes, frame);
    const targetY = interpolateKeyframes(track.targetYKeyframes, frame);
    if (targetX !== null || targetY !== null) {
      values[track.controllerId] = {
        targetX: targetX ?? 0,
        targetY: targetY ?? 0,
      };
    }
  }
  return values;
}
