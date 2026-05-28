import type {
  AnimationClip,
  InterpolationType,
  ParameterDefinition,
  SceneBlend,
  SceneBlendMode,
} from "./types";

function applyEasing(t: number, easing: InterpolationType): number {
  switch (easing) {
    case "step":
      return t < 1 ? 0 : 1;
    case "bezier":
      return t * t * (3 - 2 * t);
    case "ellipse":
      return Math.sqrt(1 - (1 - t) * (1 - t));
    case "sns":
      return t * t * t * (t * (t * 6 - 15) + 10);
    default:
      return t;
  }
}

export function evaluateClipAtFrame(
  clip: AnimationClip,
  frame: number,
  parameterDefs: ParameterDefinition[],
): Record<string, number> {
  const values: Record<string, number> = {};

  for (const param of parameterDefs) {
    values[param.id] = param.defaultValue;
  }

  for (const track of clip.tracks) {
    const kfs = track.keyframes;
    if (kfs.length === 0) continue;

    if (frame <= kfs[0]!.frame) {
      values[track.parameterId] = kfs[0]!.value;
      continue;
    }
    if (frame >= kfs[kfs.length - 1]!.frame) {
      values[track.parameterId] = kfs[kfs.length - 1]!.value;
      continue;
    }

    for (let i = 0; i < kfs.length - 1; i++) {
      const a = kfs[i]!;
      const b = kfs[i + 1]!;
      if (frame >= a.frame && frame <= b.frame) {
        const t = b.frame === a.frame ? 0 : (frame - a.frame) / (b.frame - a.frame);
        values[track.parameterId] = a.value + (b.value - a.value) * t;
        break;
      }
    }
  }

  return values;
}

export function blendParameterValues(
  valuesA: Record<string, number>,
  valuesB: Record<string, number>,
  blendFactor: number,
  mode: SceneBlendMode,
  parameterDefs: ParameterDefinition[],
): Record<string, number> {
  const result: Record<string, number> = {};
  const paramMap = new Map(parameterDefs.map((p) => [p.id, p]));

  const allKeys = new Set([...Object.keys(valuesA), ...Object.keys(valuesB)]);

  for (const key of allKeys) {
    const a = valuesA[key] ?? 0;
    const b = valuesB[key] ?? 0;
    const def = paramMap.get(key);

    switch (mode) {
      case "crossfade":
        result[key] = a * (1 - blendFactor) + b * blendFactor;
        break;

      case "additive":
        {
          const raw = a + b * blendFactor;
          result[key] = def ? Math.max(def.minValue, Math.min(def.maxValue, raw)) : raw;
        }
        break;

      case "override":
        result[key] = blendFactor >= 0.5 ? b : a;
        break;
    }
  }

  return result;
}

export function computeBlendFactor(
  blend: SceneBlend,
  currentFrame: number,
  transitionStartFrame: number,
): number {
  if (blend.transitionFrames <= 0) return 1;

  const elapsed = currentFrame - transitionStartFrame;
  if (elapsed <= 0) return 0;
  if (elapsed >= blend.transitionFrames) return 1;

  const t = elapsed / blend.transitionFrames;
  return applyEasing(t, blend.easing);
}

export function evaluateSceneBlend(
  sourceClip: AnimationClip,
  targetClip: AnimationClip,
  blend: SceneBlend,
  currentFrame: number,
  transitionStartFrame: number,
  parameterDefs: ParameterDefinition[],
): Record<string, number> {
  const factor = computeBlendFactor(blend, currentFrame, transitionStartFrame);
  const valuesA = evaluateClipAtFrame(sourceClip, currentFrame, parameterDefs);
  const valuesB = evaluateClipAtFrame(targetClip, currentFrame, parameterDefs);
  return blendParameterValues(valuesA, valuesB, factor, blend.mode, parameterDefs);
}
