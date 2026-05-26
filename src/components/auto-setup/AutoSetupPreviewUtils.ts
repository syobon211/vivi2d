import type { QualityGateId, QualityGateStatus } from "@vivi2d/editor-core/layer-graph";
import type { AutoSetupResult } from "@/lib/auto-setup";
import type { I18nKey } from "@/lib/i18n";
import type { LayerOcclusionCleanupOperation } from "@/lib/layer-occlusion-cleanup";

type Translate = (key: I18nKey) => string;

export interface PreviewBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export function percent(value: number): string {
  return `${(Math.max(0, Math.min(1, value)) * 100).toFixed(0)}%`;
}

export function shortHash(value: string): string {
  const [, hash = value] = value.split(":");
  return hash.length > 16 ? `${hash.slice(0, 12)}...${hash.slice(-6)}` : value;
}

export function createPreviewBounds(result: AutoSetupResult): PreviewBounds | null {
  const detectedPartPoints = result.detectedParts.flatMap((part) => [
    { x: part.bounds.x, y: part.bounds.y },
    {
      x: part.bounds.x + part.bounds.width,
      y: part.bounds.y + part.bounds.height,
    },
  ]);
  const bonePoints = (result.boneResult?.bones ?? []).map((bone) => ({
    x: bone.x,
    y: bone.y,
  }));
  const motionHandlePoints = (result.motionHandleDraft?.handles ?? []).flatMap(
    (handle) => (handle.tip ? [handle.anchor, handle.tip] : [handle.anchor]),
  );
  const allPoints = [...detectedPartPoints, ...bonePoints, ...motionHandlePoints];

  if (allPoints.length === 0) return null;

  const minX = Math.min(...allPoints.map((point) => point.x));
  const minY = Math.min(...allPoints.map((point) => point.y));
  const maxX = Math.max(...allPoints.map((point) => point.x));
  const maxY = Math.max(...allPoints.map((point) => point.y));
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const paddingX = width * 0.1;
  const paddingY = height * 0.1;

  return {
    minX: minX - paddingX,
    minY: minY - paddingY,
    maxX: maxX + paddingX,
    maxY: maxY + paddingY,
    width: width + paddingX * 2,
    height: height + paddingY * 2,
  };
}

export function toMapPercent(value: number, start: number, size: number): number {
  return ((value - start) / Math.max(1, size)) * 100;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function formatCleanupOperation(
  t: Translate,
  operation: LayerOcclusionCleanupOperation,
): string {
  switch (operation) {
    case "foreground-edge":
      return t("autoSetup.cleanupOperation.foreground-edge");
    case "lower-holdout":
      return t("autoSetup.cleanupOperation.lower-holdout");
    case "underpaint":
      return t("autoSetup.cleanupOperation.underpaint");
    case "motion-sweep":
      return t("autoSetup.cleanupOperation.motion-sweep");
    case "duplicate-contour":
      return t("autoSetup.cleanupOperation.duplicate-contour");
  }
}

export function formatGateId(t: Translate, id: QualityGateId): string {
  switch (id) {
    case "rest_recompose_delta":
      return t("autoSetup.qualityGate.restRecomposeDelta");
    case "protected_crop_delta":
      return t("autoSetup.qualityGate.protectedCropDelta");
    case "stress_pose_delta":
      return t("autoSetup.qualityGate.stressPoseDelta");
    case "duplicate_contour_score":
      return t("autoSetup.qualityGate.duplicateOutline");
    case "alpha_halo_score":
      return t("autoSetup.qualityGate.alphaHaloScore");
    case "hidden_reveal_score":
      return t("autoSetup.qualityGate.hiddenRevealScore");
    case "runtime_profile_scan":
      return t("autoSetup.qualityGate.runtimeProfileScan");
    case "provider_boundary_scan":
      return t("autoSetup.qualityGate.providerBoundaryScan");
    default:
      return id;
  }
}

export function formatGateStatus(t: Translate, status: QualityGateStatus): string {
  switch (status) {
    case "pass":
      return t("autoSetup.gateStatus.pass");
    case "warning":
      return t("autoSetup.gateStatus.warning");
    case "fail":
      return t("autoSetup.gateStatus.fail");
    case "notRun":
      return t("autoSetup.gateStatus.notRun");
  }
}
