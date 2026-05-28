import { clamp01 } from "./math";
import type { LayerOcclusionCleanupOptions, ResolvedOptions } from "./types";

export const DEFAULT_OPTIONS: ResolvedOptions = {
  alphaThreshold: 12,
  expandRadius: 2,
  featherRadius: 4,
  underpaintRadius: 6,
  holdoutStrength: 0.62,
  underpaintStrength: 0.72,
  motionSweepRadiusX: 0,
  motionSweepRadiusY: 0,
  motionSweepStrength: 0.42,
  edgeDecontaminationRadius: 4,
  edgeDecontaminationStrength: 0.38,
  edgeAlphaTrimStrength: 0.1,
  contextUnderpaintPasses: 12,
  contextUnderpaintStrength: 0.68,
  duplicateContourRadius: 3,
  duplicateContourStrength: 0.72,
};

export function resolveOptions(
  options: LayerOcclusionCleanupOptions | undefined,
): ResolvedOptions {
  return {
    alphaThreshold: options?.alphaThreshold ?? DEFAULT_OPTIONS.alphaThreshold,
    expandRadius: Math.max(0, Math.round(options?.expandRadius ?? DEFAULT_OPTIONS.expandRadius)),
    featherRadius: Math.max(
      0,
      Math.round(options?.featherRadius ?? DEFAULT_OPTIONS.featherRadius),
    ),
    underpaintRadius: Math.max(
      1,
      Math.round(options?.underpaintRadius ?? DEFAULT_OPTIONS.underpaintRadius),
    ),
    holdoutStrength: clamp01(options?.holdoutStrength ?? DEFAULT_OPTIONS.holdoutStrength),
    underpaintStrength: clamp01(
      options?.underpaintStrength ?? DEFAULT_OPTIONS.underpaintStrength,
    ),
    motionSweepRadiusX: Math.max(
      0,
      Math.round(options?.motionSweepRadiusX ?? DEFAULT_OPTIONS.motionSweepRadiusX),
    ),
    motionSweepRadiusY: Math.max(
      0,
      Math.round(options?.motionSweepRadiusY ?? DEFAULT_OPTIONS.motionSweepRadiusY),
    ),
    motionSweepStrength: clamp01(
      options?.motionSweepStrength ?? DEFAULT_OPTIONS.motionSweepStrength,
    ),
    edgeDecontaminationRadius: Math.max(
      1,
      Math.round(
        options?.edgeDecontaminationRadius ?? DEFAULT_OPTIONS.edgeDecontaminationRadius,
      ),
    ),
    edgeDecontaminationStrength: clamp01(
      options?.edgeDecontaminationStrength ??
        DEFAULT_OPTIONS.edgeDecontaminationStrength,
    ),
    edgeAlphaTrimStrength: clamp01(
      options?.edgeAlphaTrimStrength ?? DEFAULT_OPTIONS.edgeAlphaTrimStrength,
    ),
    contextUnderpaintPasses: Math.max(
      0,
      Math.round(
        options?.contextUnderpaintPasses ?? DEFAULT_OPTIONS.contextUnderpaintPasses,
      ),
    ),
    contextUnderpaintStrength: clamp01(
      options?.contextUnderpaintStrength ?? DEFAULT_OPTIONS.contextUnderpaintStrength,
    ),
    duplicateContourRadius: Math.max(
      0,
      Math.round(options?.duplicateContourRadius ?? DEFAULT_OPTIONS.duplicateContourRadius),
    ),
    duplicateContourStrength: clamp01(
      options?.duplicateContourStrength ?? DEFAULT_OPTIONS.duplicateContourStrength,
    ),
  };
}
