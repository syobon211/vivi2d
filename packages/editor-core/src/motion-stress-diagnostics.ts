import type { LayerSemanticRole } from "@vivi2d/core/types";
import { stableStringify } from "./safe-auto-setup-plan";
import { createStableSha256V1 } from "./stable-hash";
import type { MotionSemanticPolicy } from "./motion-template-policy";

export interface MotionStressImageView {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
  colorSpace: "srgb";
  alphaMode: "straight";
  normalizationVersion: 1;
}

export interface EditorOwnedMotionStressImageView extends MotionStressImageView {
  readonly editorOwned: true;
}

export interface MotionStressAlphaView {
  width: number;
  height: number;
  alpha: Uint8Array | Uint8ClampedArray;
  normalizationVersion: 1;
}

export interface EditorOwnedMotionStressAlphaView extends MotionStressAlphaView {
  alpha: Uint8ClampedArray;
  readonly editorOwned: true;
}

export interface MotionStressRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MotionStressProtectedCrop {
  id: string;
  bounds: MotionStressRect;
}

export interface MotionStressThresholdPolicy {
  policyId: "defaultMotionStressPolicy";
  policyVersion: 1;
  policyHash: `sha256:v1:${string}`;
  protectedCropMean: number;
  protectedCropP95: number;
  duplicateContourRatio: number;
  hiddenRevealRatio: number;
  edgeContamination: number;
  restRecompositionMean: number;
  restRecompositionP95: number;
}

export type MotionStressRoleBucket =
  | "protected"
  | "hair"
  | "tail"
  | "ribbon"
  | "accessory"
  | "body"
  | "generic";

export interface MotionStressRoleThresholds {
  roleBucket: MotionStressRoleBucket;
  duplicateContourWarning: number;
  duplicateContourFail: number;
  hiddenRevealWarning: number;
  hiddenRevealFail: number;
  protectedCropMeanWarning: number;
  protectedCropMeanFail: number;
  protectedCropP95Warning: number;
  protectedCropP95Fail: number;
}

export interface MotionStressThresholdPolicyV2 {
  policyId: "defaultMotionStressPolicy";
  policyVersion: 2;
  policyHash: `sha256:v1:${string}`;
  global: MotionStressThresholdPolicy;
  roleThresholds: readonly MotionStressRoleThresholds[];
}

export type AnyMotionStressThresholdPolicy =
  | MotionStressThresholdPolicy
  | MotionStressThresholdPolicyV2;

export type MotionStressCheckId =
  | "protectedCropDelta"
  | "duplicateContour"
  | "hiddenReveal"
  | "edgeContamination"
  | "restRecompositionDelta";

export type PublicMotionStressCheckId =
  | "motionStress.protectedArea"
  | "motionStress.duplicateOutline"
  | "motionStress.hiddenReveal"
  | "motionStress.restConsistency"
  | "motionStress.incompleteCheck";

export type MotionStressSeverityStatus = "pass" | "warning" | "fail" | "notRun";

export interface DuplicateContourInput {
  movingAlpha: MotionStressAlphaView | Uint8Array | Uint8ClampedArray;
  lowerAlpha: MotionStressAlphaView | Uint8Array | Uint8ClampedArray;
  sourceComposite: MotionStressImageView;
  previewComposite: MotionStressImageView;
  width: number;
  height: number;
  searchRadiusPx: 1 | 2 | 3;
  minEdgeAlphaDelta: number;
  minColorContrast?: number;
  acceptedUnderpaintAlpha?: MotionStressAlphaView | Uint8Array | Uint8ClampedArray;
}

export interface HiddenRevealInput {
  movingAlphaBefore: MotionStressAlphaView | Uint8Array | Uint8ClampedArray;
  movingAlphaAfter: MotionStressAlphaView | Uint8Array | Uint8ClampedArray;
  lowerAlpha: MotionStressAlphaView | Uint8Array | Uint8ClampedArray;
  acceptedUnderpaintAlpha?: MotionStressAlphaView | Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
  minRevealAlphaDrop: number;
}

export interface MotionStressPreviewInput {
  regionId: string;
  sourceComposite: MotionStressImageView;
  previewComposite: MotionStressImageView;
  protectedCrops?: readonly MotionStressProtectedCrop[];
  hiddenRevealMask?: Uint8ClampedArray;
  duplicateContourMask?: Uint8ClampedArray;
  duplicateContour?: DuplicateContourInput;
  hiddenReveal?: HiddenRevealInput;
  roleBucket?: MotionStressRoleBucket;
  thresholdPolicy?: AnyMotionStressThresholdPolicy;
}

export interface MotionStressScoreDetail {
  mean: number;
  p95: number;
  max: number;
  affectedPixelRatio: number;
  coverageReduced?: true;
}

export interface MotionStressDiagnosticScores {
  protectedCropDelta: number;
  duplicateContour: number;
  hiddenReveal: number;
  edgeContamination: number;
  restRecompositionDelta: number;
}

export interface MotionStressDiagnosticDetails {
  protectedCropDelta?: MotionStressScoreDetail;
  duplicateContour?: MotionStressScoreDetail;
  hiddenReveal?: MotionStressScoreDetail;
  edgeContamination?: MotionStressScoreDetail;
  restRecompositionDelta?: MotionStressScoreDetail;
}

export type MotionStressWarning = MotionStressCheckId;

export interface MotionStressPreviewResult {
  kind: "motionStressPreview";
  previewOnly: true;
  regionId: string;
  scores: MotionStressDiagnosticScores;
  details: MotionStressDiagnosticDetails;
  thresholdPolicyHash: AnyMotionStressThresholdPolicy["policyHash"];
  warnings: readonly MotionStressWarning[];
  severities: Readonly<Record<MotionStressCheckId, MotionStressSeverityStatus>>;
}

export type MotionCleanupRecommendationKind =
  | "reviewHoldout"
  | "reviewFeatherHoldout"
  | "reviewDuplicateContourSuppression"
  | "acceptUnderpaintReveal"
  | "splitMaskBeforeMotion"
  | "reduceMotionBudget";

export type MotionCleanupRecommendationReason =
  | "duplicateOutlineLikely"
  | "hiddenRevealLikely"
  | "protectedAreaNearby"
  | "acceptedUnderpaintAvailable"
  | "maskTooAmbiguous";

export type EditorSessionTargetToken = `motion-warning-target:${string}`;

export interface MotionCleanupRecommendation {
  kind: MotionCleanupRecommendationKind;
  severity: Extract<MotionStressSeverityStatus, "warning" | "fail">;
  policyHash: MotionStressThresholdPolicyV2["policyHash"];
  derivedFromPreviewGeneration: number;
  editorSessionTargetToken: EditorSessionTargetToken;
  reason: MotionCleanupRecommendationReason;
  regionRoleBucket: MotionStressRoleBucket;
}

export type MotionCleanupComparisonKind = "none" | MotionCleanupRecommendationKind;

export type MotionCleanupComparisonStatus =
  | "preferred"
  | "recommended"
  | "available"
  | "blocked";

export type MotionCleanupComparisonReason =
  | MotionCleanupRecommendationReason
  | "baselineNoCleanup"
  | "noStressWarnings"
  | "requiresAcceptedUnderpaint";

export interface MotionCleanupComparisonOption {
  kind: MotionCleanupComparisonKind;
  status: MotionCleanupComparisonStatus;
  reason: MotionCleanupComparisonReason;
  severity?: Extract<MotionStressSeverityStatus, "warning" | "fail">;
  regionRoleBucket: MotionStressRoleBucket;
}

export interface CreateMotionCleanupRecommendationsInput {
  result: MotionStressPreviewResult;
  policy: MotionStressThresholdPolicyV2;
  roleBucket: MotionStressRoleBucket;
  derivedFromPreviewGeneration: number;
  editorSessionTargetToken: EditorSessionTargetToken;
  acceptedUnderpaintAvailable?: boolean;
  protectedAreaNearby?: boolean;
}

export interface PersistedMotionBudgetAdjustment {
  id: string;
  regionId: string;
  acceptedAt: string;
  budget: {
    maxRotationDeg: number;
    maxDisplacementPxRatio: number;
    physicsStrength: number;
  };
}

export interface CreateMotionBudgetAdjustmentInput {
  regionId: string;
  acceptedAt?: string;
  randomUUID?: () => string;
  budget: PersistedMotionBudgetAdjustment["budget"];
}

export interface SanitizedMotionStressError {
  name: string;
  message: string;
}

const stressPreviewRegistry = new WeakSet<object>();
const privateStressMarker = (...parts: string[]) => parts.join("");
const MOTION_STRESS_PREVIEW_KIND = privateStressMarker(
  "motion",
  "Stress",
  "Preview",
) as MotionStressPreviewResult["kind"];
const PREVIEW_ONLY_KEY = privateStressMarker("preview", "Only");
const DIAGNOSTIC_HASH_KEY = "diagnosticHash";
const MOTION_BUDGET_QUANTIZATION = Object.freeze({
  maxRotationDeg: 0.5,
  maxDisplacementPxRatio: 0.01,
  physicsStrength: 0.05,
});
const MAX_STRESS_PIXELS = 4096 * 4096;
const DEFAULT_MOTION_STRESS_THRESHOLDS = Object.freeze({
  policyId: "defaultMotionStressPolicy" as const,
  policyVersion: 1 as const,
  protectedCropMean: 0.025,
  protectedCropP95: 0.08,
  duplicateContourRatio: 0.015,
  hiddenRevealRatio: 0.01,
  edgeContamination: 0.002,
  restRecompositionMean: 0.03,
  restRecompositionP95: 0.12,
});
const ERROR_SANITIZER_MAX_DEPTH = 8;
const SAFE_ERROR_NAMES = new Set(["Error", "TypeError", "RangeError", "SyntaxError"]);
const ROLE_BUCKET_ORDER: readonly MotionStressRoleBucket[] = [
  "protected",
  "hair",
  "tail",
  "ribbon",
  "accessory",
  "body",
  "generic",
];
const PUBLIC_STRESS_CHECK_ID_BY_INTERNAL = Object.freeze({
  protectedCropDelta: "motionStress.protectedArea",
  edgeContamination: "motionStress.protectedArea",
  duplicateContour: "motionStress.duplicateOutline",
  hiddenReveal: "motionStress.hiddenReveal",
  restRecompositionDelta: "motionStress.restConsistency",
} satisfies Record<MotionStressCheckId, PublicMotionStressCheckId>);
const SEVERITY_ORDER: Record<MotionStressSeverityStatus, number> = {
  pass: 0,
  notRun: 1,
  warning: 2,
  fail: 3,
};

export const DEFAULT_MOTION_STRESS_THRESHOLD_POLICY: MotionStressThresholdPolicy =
  Object.freeze({
    ...DEFAULT_MOTION_STRESS_THRESHOLDS,
    policyHash: createMotionStressPolicyHash(DEFAULT_MOTION_STRESS_THRESHOLDS),
  });

export const DEFAULT_MOTION_STRESS_THRESHOLD_POLICY_V2: MotionStressThresholdPolicyV2 =
  Object.freeze({
    policyId: "defaultMotionStressPolicy",
    policyVersion: 2,
    global: DEFAULT_MOTION_STRESS_THRESHOLD_POLICY,
    roleThresholds: Object.freeze(
      ROLE_BUCKET_ORDER.map((roleBucket) => Object.freeze(defaultRoleThresholds(roleBucket))),
    ),
    policyHash: createMotionStressPolicyV2Hash({
      policyId: "defaultMotionStressPolicy",
      policyVersion: 2,
      global: DEFAULT_MOTION_STRESS_THRESHOLD_POLICY,
      roleThresholds: ROLE_BUCKET_ORDER.map((roleBucket) => defaultRoleThresholds(roleBucket)),
    }),
  });

export function createMotionStressPolicyHash(
  policy: Omit<MotionStressThresholdPolicy, "policyHash">,
): MotionStressThresholdPolicy["policyHash"] {
  return createStableSha256V1(stableStringify(policy));
}

export function createMotionStressPolicyV2Hash(
  policy: Omit<MotionStressThresholdPolicyV2, "policyHash">,
): MotionStressThresholdPolicyV2["policyHash"] {
  return createStableSha256V1(stableStringify(canonicalizePolicyV2(policy)));
}

export function validateThresholdPolicy(
  policy: AnyMotionStressThresholdPolicy,
): void {
  if (policy.policyVersion === 1) {
    validateThresholdPolicyV1(policy);
    return;
  }
  validateThresholdPolicyV2(policy);
}

export function validateMotionStressImageView(
  view: unknown,
  expectedWidth: number,
  expectedHeight: number,
  label: string,
): EditorOwnedMotionStressImageView {
  const record = assertPlainDataRecord(view, `${label}`);
  const width = readOwnDataProperty(record, "width", label);
  const height = readOwnDataProperty(record, "height", label);
  const rgba = readOwnDataProperty(record, "rgba", label);
  const colorSpace = readOwnDataProperty(record, "colorSpace", label);
  const alphaMode = readOwnDataProperty(record, "alphaMode", label);
  const normalizationVersion = readOwnDataProperty(record, "normalizationVersion", label);
  if (
    !isPositiveSafeInteger(width) ||
    !isPositiveSafeInteger(height) ||
    width !== expectedWidth ||
    height !== expectedHeight ||
    width * height > MAX_STRESS_PIXELS
  ) {
    throw new Error(`${label} dimensions are invalid or over budget.`);
  }
  if (
    colorSpace !== "srgb" ||
    alphaMode !== "straight" ||
    normalizationVersion !== 1
  ) {
    throw new Error(`${label} normalization metadata is unsupported.`);
  }
  if (!(rgba instanceof Uint8ClampedArray)) {
    throw new Error(`${label} must use Uint8ClampedArray RGBA bytes.`);
  }
  validateArrayBuffer(rgba.buffer, `${label}.rgba`);
  if (rgba.byteLength !== width * height * 4) {
    throw new Error(`${label} must contain width * height * 4 RGBA bytes.`);
  }
  return Object.freeze({
    width,
    height,
    rgba: new Uint8ClampedArray(rgba),
    colorSpace,
    alphaMode,
    normalizationVersion,
    editorOwned: true,
  });
}

export function validateMotionStressAlphaView(
  view: unknown,
  expectedWidth: number,
  expectedHeight: number,
  label: string,
): EditorOwnedMotionStressAlphaView {
  const alphaView = normalizeAlphaInput(view, expectedWidth, expectedHeight, label);
  const { width, height, alpha, normalizationVersion } = alphaView;
  if (
    !isPositiveSafeInteger(width) ||
    !isPositiveSafeInteger(height) ||
    width !== expectedWidth ||
    height !== expectedHeight ||
    width * height > MAX_STRESS_PIXELS
  ) {
    throw new Error(`${label} dimensions are invalid or over budget.`);
  }
  if (normalizationVersion !== 1) {
    throw new Error(`${label} normalization metadata is unsupported.`);
  }
  if (!(alpha instanceof Uint8Array || alpha instanceof Uint8ClampedArray)) {
    throw new Error(`${label} must use Uint8 alpha bytes.`);
  }
  validateArrayBuffer(alpha.buffer, `${label}.alpha`);
  if (alpha.byteLength !== width * height) {
    throw new Error(`${label} must contain width * height alpha bytes.`);
  }
  return Object.freeze({
    width,
    height,
    alpha: new Uint8ClampedArray(alpha),
    normalizationVersion,
    editorOwned: true,
  });
}

export function computeDuplicateContourSummary(
  input: DuplicateContourInput,
): MotionStressScoreDetail {
  validateSearchRadius(input.searchRadiusPx);
  const moving = validateMotionStressAlphaView(
    input.movingAlpha,
    input.width,
    input.height,
    "movingAlpha",
  );
  const lower = validateMotionStressAlphaView(input.lowerAlpha, input.width, input.height, "lowerAlpha");
  const underpaint = input.acceptedUnderpaintAlpha
    ? validateMotionStressAlphaView(
        input.acceptedUnderpaintAlpha,
        input.width,
        input.height,
        "acceptedUnderpaintAlpha",
      )
    : undefined;
  validateMotionStressImageView(input.sourceComposite, input.width, input.height, "sourceComposite");
  validateMotionStressImageView(input.previewComposite, input.width, input.height, "previewComposite");
  const movingEdges = alphaEdges(moving.alpha, input.width, input.height, input.minEdgeAlphaDelta);
  const lowerEdges = alphaEdges(lower.alpha, input.width, input.height, input.minEdgeAlphaDelta);
  const values: number[] = [];
  let total = 0;
  let max = 0;
  let affected = 0;
  for (let index = 0; index < movingEdges.length; index += 1) {
    if (movingEdges[index] === 0) continue;
    const x = index % input.width;
    const y = Math.floor(index / input.width);
    const confidence = nearbyEdgeConfidence(
      lowerEdges,
      underpaint?.alpha,
      input.width,
      input.height,
      x,
      y,
      input.searchRadiusPx,
    );
    if (confidence <= 0) continue;
    values.push(confidence);
    total += confidence;
    max = Math.max(max, confidence);
    affected += 1;
  }
  if (values.length === 0) return zeroDetail();
  return {
    mean: total / values.length,
    p95: percentile(values, 0.95),
    max,
    affectedPixelRatio: affected / movingEdges.length,
  };
}

export function computeHiddenRevealSummary(
  input: HiddenRevealInput,
): MotionStressScoreDetail {
  const before = validateMotionStressAlphaView(
    input.movingAlphaBefore,
    input.width,
    input.height,
    "movingAlphaBefore",
  );
  const after = validateMotionStressAlphaView(
    input.movingAlphaAfter,
    input.width,
    input.height,
    "movingAlphaAfter",
  );
  const lower = validateMotionStressAlphaView(input.lowerAlpha, input.width, input.height, "lowerAlpha");
  const underpaint = input.acceptedUnderpaintAlpha
    ? validateMotionStressAlphaView(
        input.acceptedUnderpaintAlpha,
        input.width,
        input.height,
        "acceptedUnderpaintAlpha",
      )
    : undefined;
  const values: number[] = [];
  let total = 0;
  let max = 0;
  let affected = 0;
  for (let index = 0; index < before.alpha.length; index += 1) {
    const reveal = before.alpha[index]! - after.alpha[index]!;
    if (reveal < input.minRevealAlphaDrop) continue;
    const lowerCoverage = lower.alpha[index]! / 255;
    const underpaintCoverage = (underpaint?.alpha[index] ?? 0) / 255;
    const risk = (reveal / 255) * Math.max(0, 1 - Math.max(lowerCoverage, underpaintCoverage));
    if (risk <= 0) continue;
    values.push(risk);
    total += risk;
    max = Math.max(max, risk);
    affected += 1;
  }
  if (values.length === 0) return zeroDetail();
  return {
    mean: total / values.length,
    p95: percentile(values, 0.95),
    max,
    affectedPixelRatio: affected / before.alpha.length,
  };
}

export function deriveMotionStressRoleBucket(input: {
  role?: LayerSemanticRole;
  policy: MotionSemanticPolicy;
}): MotionStressRoleBucket {
  if (input.policy.protected) return "protected";
  if (
    input.policy.physicsPreset === "softHair" ||
    input.role === "hair" ||
    input.role === "hairFront" ||
    input.role === "hairBack" ||
    input.role === "hairSide"
  ) {
    return "hair";
  }
  if (input.policy.physicsPreset === "tail" || input.role === "tail") return "tail";
  if (input.policy.physicsPreset === "ribbon") return "ribbon";
  if (input.policy.physicsPreset === "accessory" || input.role === "accessory") return "accessory";
  if (
    input.policy.defaultMotionKind === "skinned" ||
    input.role === "body" ||
    input.role === "armLeft" ||
    input.role === "armRight" ||
    input.role === "handLeft" ||
    input.role === "handRight" ||
    input.role === "legLeft" ||
    input.role === "legRight"
  ) {
    return "body";
  }
  return "generic";
}

export function createMotionStressPreviewResult(
  input: MotionStressPreviewInput,
): MotionStressPreviewResult {
  const sourceSize = readImageViewDimensions(input.sourceComposite, "sourceComposite");
  const sourceComposite = validateMotionStressImageView(
    input.sourceComposite,
    sourceSize.width,
    sourceSize.height,
    "sourceComposite",
  );
  const previewComposite = validateMotionStressImageView(
    input.previewComposite,
    sourceComposite.width,
    sourceComposite.height,
    "previewComposite",
  );
  const thresholdPolicy = input.thresholdPolicy ?? DEFAULT_MOTION_STRESS_THRESHOLD_POLICY_V2;
  validateThresholdPolicy(thresholdPolicy);
  const roleBucket = input.roleBucket ?? "generic";
  const { scores, details } = computeScores({
    ...input,
    sourceComposite,
    previewComposite,
  });
  const severities = deriveMotionStressCheckSeveritiesFromScores(
    scores,
    details,
    thresholdPolicy,
    roleBucket,
  );
  const result: MotionStressPreviewResult = Object.freeze({
    kind: MOTION_STRESS_PREVIEW_KIND,
    previewOnly: true,
    regionId: input.regionId,
    scores: Object.freeze(scores),
    details: Object.freeze(details),
    thresholdPolicyHash: thresholdPolicy.policyHash,
    warnings: Object.freeze(
      Object.entries(severities)
        .filter(([, severity]) => severity === "warning" || severity === "fail")
        .map(([id]) => id as MotionStressWarning),
    ),
    severities: Object.freeze(severities),
  });
  stressPreviewRegistry.add(result);
  return result;
}

export function deriveMotionStressCheckSeverities(
  result: MotionStressPreviewResult | null,
  policy: MotionStressThresholdPolicyV2 = DEFAULT_MOTION_STRESS_THRESHOLD_POLICY_V2,
  roleBucket: MotionStressRoleBucket = "generic",
): Record<MotionStressCheckId, MotionStressSeverityStatus> {
  validateThresholdPolicyV2(policy);
  if (!result || result.thresholdPolicyHash !== policy.policyHash) {
    return allSeverities("notRun");
  }
  return deriveMotionStressCheckSeveritiesFromScores(
    result.scores,
    result.details,
    policy,
    roleBucket,
  );
}

export function projectMotionStressCheckId(
  id: MotionStressCheckId,
): PublicMotionStressCheckId {
  return PUBLIC_STRESS_CHECK_ID_BY_INTERNAL[id];
}

export function projectMotionStressChecksForPublicSurface(
  severities: Readonly<Record<MotionStressCheckId, MotionStressSeverityStatus>>,
  details: MotionStressDiagnosticDetails = {},
): Readonly<Record<PublicMotionStressCheckId, MotionStressSeverityStatus>> {
  const projected: Record<PublicMotionStressCheckId, MotionStressSeverityStatus> = {
    "motionStress.protectedArea": "pass",
    "motionStress.duplicateOutline": "pass",
    "motionStress.hiddenReveal": "pass",
    "motionStress.restConsistency": "pass",
    "motionStress.incompleteCheck": "pass",
  };
  for (const id of Object.keys(PUBLIC_STRESS_CHECK_ID_BY_INTERNAL) as MotionStressCheckId[]) {
    const publicId = projectMotionStressCheckId(id);
    projected[publicId] = maxSeverity(projected[publicId], severities[id]);
    if (details[id]?.coverageReduced) {
      projected["motionStress.incompleteCheck"] = maxSeverity(
        projected["motionStress.incompleteCheck"],
        "warning",
      );
    }
  }
  return Object.freeze(projected);
}

export function createEditorSessionTargetToken(
  randomUUID: () => string = globalThis.crypto?.randomUUID?.bind(globalThis.crypto),
): EditorSessionTargetToken {
  if (!randomUUID) {
    throw new Error("A CSPRNG UUID source is required for warning target tokens.");
  }
  const id = randomUUID();
  if (!isUuidV4(id)) {
    throw new Error("Warning target token must use a UUIDv4 suffix.");
  }
  return `motion-warning-target:${id}`;
}

export function createMotionCleanupRecommendations(
  input: CreateMotionCleanupRecommendationsInput,
): readonly MotionCleanupRecommendation[] {
  validateThresholdPolicyV2(input.policy);
  if (
    input.result.thresholdPolicyHash !== input.policy.policyHash ||
    input.derivedFromPreviewGeneration < 0 ||
    !Number.isSafeInteger(input.derivedFromPreviewGeneration)
  ) {
    return Object.freeze([]);
  }
  if (!/^motion-warning-target:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.editorSessionTargetToken)) {
    throw new Error("Warning target token must use a UUIDv4 suffix.");
  }
  const severities = deriveMotionStressCheckSeverities(input.result, input.policy, input.roleBucket);
  const recommendations: MotionCleanupRecommendation[] = [];
  const pushRecommendation = (
    kind: MotionCleanupRecommendationKind,
    severity: Extract<MotionStressSeverityStatus, "warning" | "fail">,
    reason: MotionCleanupRecommendationReason,
  ) => {
    recommendations.push(
      Object.freeze({
        kind,
        severity,
        policyHash: input.policy.policyHash,
        derivedFromPreviewGeneration: input.derivedFromPreviewGeneration,
        editorSessionTargetToken: input.editorSessionTargetToken,
        reason,
        regionRoleBucket: input.roleBucket,
      }),
    );
  };
  if (input.result.details.duplicateContour?.coverageReduced !== true) {
    const severity = severities.duplicateContour;
    if (severity === "warning") {
      pushRecommendation("reviewDuplicateContourSuppression", severity, "duplicateOutlineLikely");
    } else if (severity === "fail") {
      pushRecommendation(
        input.protectedAreaNearby ? "reduceMotionBudget" : "reviewDuplicateContourSuppression",
        severity,
        input.protectedAreaNearby ? "protectedAreaNearby" : "duplicateOutlineLikely",
      );
      if (input.protectedAreaNearby) {
        pushRecommendation("reviewHoldout", severity, "protectedAreaNearby");
      }
    }
  }
  if (input.result.details.hiddenReveal?.coverageReduced !== true) {
    const severity = severities.hiddenReveal;
    if (severity === "warning" || severity === "fail") {
      pushRecommendation(
        input.acceptedUnderpaintAvailable ? "acceptUnderpaintReveal" : "reviewFeatherHoldout",
        severity,
        input.acceptedUnderpaintAvailable ? "acceptedUnderpaintAvailable" : "hiddenRevealLikely",
      );
    }
  }
  if (
    input.result.details.protectedCropDelta?.coverageReduced !== true &&
    (severities.protectedCropDelta === "warning" || severities.protectedCropDelta === "fail")
  ) {
    pushRecommendation("reduceMotionBudget", severities.protectedCropDelta, "protectedAreaNearby");
  }
  return Object.freeze(recommendations);
}

export function createMotionCleanupComparisonOptions(
  input: CreateMotionCleanupRecommendationsInput,
): readonly MotionCleanupComparisonOption[] {
  const recommendations = createMotionCleanupRecommendations(input);
  const options: MotionCleanupComparisonOption[] = [
    freezeComparisonOption({
      kind: "none",
      status: recommendations.length === 0 ? "preferred" : "blocked",
      reason: recommendations.length === 0 ? "noStressWarnings" : "baselineNoCleanup",
      severity: maxRecommendationSeverity(recommendations),
      regionRoleBucket: input.roleBucket,
    }),
  ];
  const pushOption = (
    kind: MotionCleanupRecommendationKind,
    status: MotionCleanupComparisonStatus,
    reason: MotionCleanupComparisonReason,
    severity?: Extract<MotionStressSeverityStatus, "warning" | "fail">,
  ) => {
    if (options.some((option) => option.kind === kind)) return;
    options.push(
      freezeComparisonOption({
        kind,
        status,
        reason,
        severity,
        regionRoleBucket: input.roleBucket,
      }),
    );
  };

  for (const recommendation of recommendations) {
    pushOption(
      recommendation.kind,
      recommendation.severity === "fail" ? "preferred" : "recommended",
      recommendation.reason,
      recommendation.severity,
    );
    if (
      recommendation.kind === "acceptUnderpaintReveal" &&
      input.acceptedUnderpaintAvailable
    ) {
      pushOption(
        "reviewFeatherHoldout",
        "available",
        "hiddenRevealLikely",
        recommendation.severity,
      );
    }
    if (
      recommendation.kind === "reviewFeatherHoldout" &&
      !input.acceptedUnderpaintAvailable
    ) {
      pushOption(
        "acceptUnderpaintReveal",
        "blocked",
        "requiresAcceptedUnderpaint",
        recommendation.severity,
      );
    }
    if (recommendation.kind === "reviewDuplicateContourSuppression") {
      pushOption(
        "reviewHoldout",
        "available",
        "duplicateOutlineLikely",
        recommendation.severity,
      );
    }
  }

  return Object.freeze(sortCleanupComparisonOptions(options));
}

export function isMotionStressPreviewResult(value: unknown): boolean {
  return typeof value === "object" && value !== null && stressPreviewRegistry.has(value);
}

export function assertNoMotionStressPreviewResult(value: unknown, path = "$"): void {
  assertNoMotionStressPreviewResultInner(value, path, new WeakSet<object>(), 0);
}

export function sanitizeMotionStressErrorForPublicSurface(
  value: unknown,
): SanitizedMotionStressError {
  return sanitizeErrorLike(value, new WeakSet<object>(), 0);
}

export function createPersistedMotionBudgetAdjustment(
  input: CreateMotionBudgetAdjustmentInput,
): PersistedMotionBudgetAdjustment {
  const randomUUID = input.randomUUID ?? globalThis.crypto?.randomUUID?.bind(globalThis.crypto);
  if (!randomUUID) {
    throw new Error("A CSPRNG UUID source is required for motion budget adjustments.");
  }
  const id = randomUUID();
  if (!isUuidV4(id)) {
    throw new Error("Motion budget adjustment id must be a UUIDv4 value.");
  }
  if (typeof input.regionId !== "string" || input.regionId.length === 0) {
    throw new Error("Motion budget adjustment regionId must be a non-empty region identifier.");
  }
  validateFiniteBudget(input.budget);
  const budget = quantizeMotionBudget(input.budget);
  const acceptedAt = input.acceptedAt ?? new Date().toISOString();
  const acceptedDate = new Date(acceptedAt);
  if (
    Number.isNaN(acceptedDate.getTime()) ||
    acceptedDate.toISOString() !== acceptedAt
  ) {
    throw new Error("acceptedAt must be a normalized UTC ISO timestamp.");
  }
  return Object.freeze({
    id,
    regionId: input.regionId,
    acceptedAt,
    budget: Object.freeze(budget),
  });
}

function assertNoMotionStressPreviewResultInner(
  value: unknown,
  path: string,
  seen: WeakSet<object>,
  depth: number,
): void {
  if (depth > ERROR_SANITIZER_MAX_DEPTH) return;
  if (typeof value === "string") {
    if (normalize(value).includes(normalize(MOTION_STRESS_PREVIEW_KIND))) {
      throw new Error(`${path} contains preview-only motion stress data.`);
    }
    return;
  }
  if (!value || typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);
  if (stressPreviewRegistry.has(value)) {
    throw new Error(`${path} contains registered preview-only motion stress data.`);
  }
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      assertNoMotionStressPreviewResultInner(entry, `${path}[${index}]`, seen, depth + 1),
    );
    return;
  }
  if (isErrorLike(value)) {
    for (const key of ["name", "message", "stack", "fileName", "lineNumber", "columnNumber"] as const) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor && "value" in descriptor) {
        assertNoMotionStressPreviewResultInner(descriptor.value, `${path}.${key}`, seen, depth + 1);
      }
    }
    const causeDescriptor = Object.getOwnPropertyDescriptor(value, "cause");
    if (causeDescriptor && "value" in causeDescriptor) {
      assertNoMotionStressPreviewResultInner(causeDescriptor.value, `${path}.cause`, seen, depth + 1);
    }
    const errorsDescriptor = Object.getOwnPropertyDescriptor(value, "errors");
    if (errorsDescriptor && "value" in errorsDescriptor) {
      assertNoMotionStressPreviewResultInner(errorsDescriptor.value, `${path}.errors`, seen, depth + 1);
    }
  }
  const record = value as Record<string, unknown>;
  for (const [key, child] of Object.entries(record)) {
    if (
      normalize(key) === normalize(PREVIEW_ONLY_KEY) ||
      normalize(key) === normalize(DIAGNOSTIC_HASH_KEY) ||
      (key === "kind" &&
        typeof child === "string" &&
        normalize(child) === normalize(MOTION_STRESS_PREVIEW_KIND))
    ) {
      throw new Error(`${path}.${key} contains preview-only motion stress data.`);
    }
    assertNoMotionStressPreviewResultInner(child, `${path}.${key}`, seen, depth + 1);
  }
}

function computeScores(input: MotionStressPreviewInput): {
  scores: MotionStressDiagnosticScores;
  details: MotionStressDiagnosticDetails;
} {
  const restDetail = deltaDetail(input.sourceComposite, input.previewComposite);
  const protectedDetail =
    input.protectedCrops?.length && input.protectedCrops.length > 0
      ? maxDetail(
          input.protectedCrops.map((crop) =>
            deltaDetail(input.sourceComposite, input.previewComposite, crop.bounds),
          ),
        )
      : zeroDetail();
  const duplicateContourDetail = input.duplicateContour
    ? computeDuplicateContourSummary(input.duplicateContour)
    : maskDetail(input.duplicateContourMask);
  const hiddenRevealDetail = input.hiddenReveal
    ? computeHiddenRevealSummary(input.hiddenReveal)
    : maskDetail(input.hiddenRevealMask);
  const scores = {
    protectedCropDelta: protectedDetail.mean,
    duplicateContour: duplicateContourDetail.affectedPixelRatio,
    hiddenReveal: hiddenRevealDetail.affectedPixelRatio,
    edgeContamination:
      protectedDetail.mean * duplicateContourDetail.affectedPixelRatio,
    restRecompositionDelta: restDetail.mean,
  };
  return {
    scores,
    details: {
      protectedCropDelta: protectedDetail,
      duplicateContour: duplicateContourDetail,
      hiddenReveal: hiddenRevealDetail,
      restRecompositionDelta: restDetail,
    },
  };
}

function deriveMotionStressCheckSeveritiesFromScores(
  scores: MotionStressDiagnosticScores,
  details: MotionStressDiagnosticDetails,
  policy: AnyMotionStressThresholdPolicy,
  roleBucket: MotionStressRoleBucket,
): Record<MotionStressCheckId, MotionStressSeverityStatus> {
  if (policy.policyVersion === 1) {
    return clampReducedCoverage(
      {
        protectedCropDelta:
          scores.protectedCropDelta > policy.protectedCropMean ||
          (details.protectedCropDelta?.p95 ?? 0) > policy.protectedCropP95
            ? "warning"
            : "pass",
        duplicateContour:
          scores.duplicateContour > policy.duplicateContourRatio ? "warning" : "pass",
        hiddenReveal:
          scores.hiddenReveal > policy.hiddenRevealRatio ? "warning" : "pass",
        edgeContamination:
          scores.edgeContamination > policy.edgeContamination ? "warning" : "pass",
        restRecompositionDelta:
          scores.restRecompositionDelta > policy.restRecompositionMean ||
          (details.restRecompositionDelta?.p95 ?? 0) > policy.restRecompositionP95
            ? "warning"
            : "pass",
      },
      details,
    );
  }
  const thresholds = getRoleThresholds(policy, roleBucket);
  const severities: Record<MotionStressCheckId, MotionStressSeverityStatus> = {
    protectedCropDelta: maxSeverity(
      severityFromThreshold(
        scores.protectedCropDelta,
        thresholds.protectedCropMeanWarning,
        thresholds.protectedCropMeanFail,
      ),
      severityFromThreshold(
        details.protectedCropDelta?.p95 ?? 0,
        thresholds.protectedCropP95Warning,
        thresholds.protectedCropP95Fail,
      ),
    ),
    duplicateContour: severityFromThreshold(
      scores.duplicateContour,
      thresholds.duplicateContourWarning,
      thresholds.duplicateContourFail,
    ),
    hiddenReveal: severityFromThreshold(
      scores.hiddenReveal,
      thresholds.hiddenRevealWarning,
      thresholds.hiddenRevealFail,
    ),
    edgeContamination:
      scores.edgeContamination > policy.global.edgeContamination ? "warning" : "pass",
    restRecompositionDelta: maxSeverity(
      severityFromThreshold(
        scores.restRecompositionDelta,
        policy.global.restRecompositionMean,
        policy.global.restRecompositionMean * 2,
      ),
      severityFromThreshold(
        details.restRecompositionDelta?.p95 ?? 0,
        policy.global.restRecompositionP95,
        policy.global.restRecompositionP95 * 2,
      ),
    ),
  };
  return clampReducedCoverage(severities, details);
}

function clampReducedCoverage(
  severities: Record<MotionStressCheckId, MotionStressSeverityStatus>,
  details: MotionStressDiagnosticDetails,
): Record<MotionStressCheckId, MotionStressSeverityStatus> {
  const next = { ...severities };
  for (const id of Object.keys(next) as MotionStressCheckId[]) {
    if (details[id]?.coverageReduced && next[id] === "fail") next[id] = "warning";
  }
  return next;
}

function allSeverities(
  severity: MotionStressSeverityStatus,
): Record<MotionStressCheckId, MotionStressSeverityStatus> {
  return {
    protectedCropDelta: severity,
    duplicateContour: severity,
    hiddenReveal: severity,
    edgeContamination: severity,
    restRecompositionDelta: severity,
  };
}

function severityFromThreshold(
  value: number,
  warning: number,
  fail: number,
): MotionStressSeverityStatus {
  if (warning === fail && value >= fail) return "fail";
  if (value >= fail) return "fail";
  if (value >= warning) return "warning";
  return "pass";
}

function maxSeverity<T extends MotionStressSeverityStatus>(a: T, b: T): T;
function maxSeverity(
  a: MotionStressSeverityStatus,
  b: MotionStressSeverityStatus,
): MotionStressSeverityStatus {
  return SEVERITY_ORDER[b] > SEVERITY_ORDER[a] ? b : a;
}

function maskDetail(mask: Uint8ClampedArray | undefined): MotionStressScoreDetail {
  if (!mask || mask.length === 0) return zeroDetail();
  let count = 0;
  let total = 0;
  let max = 0;
  const values: number[] = [];
  for (const value of mask) {
    if (value > 0) count += 1;
    const normalized = value / 255;
    values.push(normalized);
    total += normalized;
    max = Math.max(max, normalized);
  }
  return {
    mean: total / mask.length,
    p95: percentile(values, 0.95),
    max,
    affectedPixelRatio: count / mask.length,
  };
}

function deltaDetail(
  source: MotionStressImageView,
  preview: MotionStressImageView,
  bounds?: MotionStressRect,
): MotionStressScoreDetail {
  const rect = bounds
    ? {
        x: Math.max(0, Math.floor(bounds.x)),
        y: Math.max(0, Math.floor(bounds.y)),
        width: Math.max(0, Math.ceil(bounds.width)),
        height: Math.max(0, Math.ceil(bounds.height)),
      }
    : { x: 0, y: 0, width: source.width, height: source.height };
  let total = 0;
  let max = 0;
  let affected = 0;
  const values: number[] = [];
  for (let y = rect.y; y < Math.min(source.height, rect.y + rect.height); y += 1) {
    for (let x = rect.x; x < Math.min(source.width, rect.x + rect.width); x += 1) {
      const index = (y * source.width + x) * 4;
      const value =
        (Math.abs(source.rgba[index]! - preview.rgba[index]!) +
          Math.abs(source.rgba[index + 1]! - preview.rgba[index + 1]!) +
          Math.abs(source.rgba[index + 2]! - preview.rgba[index + 2]!) +
          Math.abs(source.rgba[index + 3]! - preview.rgba[index + 3]!)) /
        (4 * 255);
      values.push(value);
      total += value;
      max = Math.max(max, value);
      if (value > 0.004) affected += 1;
    }
  }
  if (values.length === 0) return zeroDetail();
  return {
    mean: total / values.length,
    p95: percentile(values, 0.95),
    max,
    affectedPixelRatio: affected / values.length,
  };
}

function alphaEdges(
  alpha: Uint8ClampedArray,
  width: number,
  height: number,
  minDelta: number,
): Uint8Array {
  const edges = new Uint8Array(alpha.length);
  const threshold = Math.max(1, Math.min(255, minDelta));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const value = alpha[index]!;
      const right = x + 1 < width ? alpha[index + 1]! : value;
      const down = y + 1 < height ? alpha[index + width]! : value;
      if (Math.abs(value - right) >= threshold || Math.abs(value - down) >= threshold) {
        edges[index] = 1;
      }
    }
  }
  return edges;
}

function nearbyEdgeConfidence(
  lowerEdges: Uint8Array,
  underpaint: Uint8ClampedArray | undefined,
  width: number,
  height: number,
  x: number,
  y: number,
  radius: 1 | 2 | 3,
): number {
  let best = 0;
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const index = ny * width + nx;
      if (lowerEdges[index] === 0) continue;
      const distance = Math.max(Math.abs(dx), Math.abs(dy));
      const proximity = 1 - distance / (radius + 1);
      const underpaintPenalty = (underpaint?.[index] ?? 0) / 255;
      best = Math.max(best, proximity * (1 - underpaintPenalty));
    }
  }
  return best;
}

function validateSearchRadius(value: number): asserts value is 1 | 2 | 3 {
  if (value !== 1 && value !== 2 && value !== 3) {
    throw new Error("searchRadiusPx must be 1, 2, or 3.");
  }
}

function validateThresholdPolicyV1(policy: MotionStressThresholdPolicy): void {
  const { policyHash, ...hashInput } = policy;
  if (policy.policyId !== "defaultMotionStressPolicy") {
    throw new Error("Motion stress threshold policy id is unsupported.");
  }
  if (policy.policyVersion !== 1) {
    throw new Error("Motion stress threshold policy version is unsupported.");
  }
  if (policyHash !== createMotionStressPolicyHash(hashInput)) {
    throw new Error("Motion stress threshold policy hash does not match policy values.");
  }
  for (const [key, value] of Object.entries(hashInput)) {
    if (key === "policyId" || key === "policyVersion") continue;
    assertFiniteNonNegative(value, `Motion stress threshold ${key}`);
  }
}

function validateThresholdPolicyV2(policy: MotionStressThresholdPolicyV2): void {
  const { policyHash, ...hashInput } = policy;
  if (policy.policyId !== "defaultMotionStressPolicy" || policy.policyVersion !== 2) {
    throw new Error("Motion stress threshold V2 policy is unsupported.");
  }
  validateThresholdPolicyV1(policy.global);
  const canonical = canonicalizePolicyV2(hashInput);
  if (policyHash !== createMotionStressPolicyV2Hash(canonical)) {
    throw new Error("Motion stress threshold V2 policy hash does not match policy values.");
  }
  const seen = new Set<MotionStressRoleBucket>();
  for (const threshold of policy.roleThresholds) {
    if (seen.has(threshold.roleBucket)) {
      throw new Error("Motion stress threshold V2 has duplicate role buckets.");
    }
    seen.add(threshold.roleBucket);
    validateRoleThresholds(threshold);
  }
  if (ROLE_BUCKET_ORDER.some((roleBucket) => !seen.has(roleBucket))) {
    throw new Error("Motion stress threshold V2 is missing role buckets.");
  }
}

function validateRoleThresholds(threshold: MotionStressRoleThresholds): void {
  if (!ROLE_BUCKET_ORDER.includes(threshold.roleBucket)) {
    throw new Error("Motion stress threshold role bucket is unsupported.");
  }
  const pairs = [
    ["duplicateContour", threshold.duplicateContourWarning, threshold.duplicateContourFail],
    ["hiddenReveal", threshold.hiddenRevealWarning, threshold.hiddenRevealFail],
    ["protectedCropMean", threshold.protectedCropMeanWarning, threshold.protectedCropMeanFail],
    ["protectedCropP95", threshold.protectedCropP95Warning, threshold.protectedCropP95Fail],
  ] as const;
  for (const [label, warning, fail] of pairs) {
    assertFiniteNonNegative(warning, `${label} warning`);
    assertFiniteNonNegative(fail, `${label} fail`);
    if (warning > fail) {
      throw new Error(`${label} fail threshold must be >= warning threshold.`);
    }
  }
}

function getRoleThresholds(
  policy: MotionStressThresholdPolicyV2,
  roleBucket: MotionStressRoleBucket,
): MotionStressRoleThresholds {
  return (
    policy.roleThresholds.find((threshold) => threshold.roleBucket === roleBucket) ??
    policy.roleThresholds.find((threshold) => threshold.roleBucket === "generic")!
  );
}

function canonicalizePolicyV2(
  policy: Omit<MotionStressThresholdPolicyV2, "policyHash">,
): Omit<MotionStressThresholdPolicyV2, "policyHash"> {
  return {
    ...policy,
    roleThresholds: [...policy.roleThresholds].sort(
      (a, b) => ROLE_BUCKET_ORDER.indexOf(a.roleBucket) - ROLE_BUCKET_ORDER.indexOf(b.roleBucket),
    ),
  };
}

function defaultRoleThresholds(roleBucket: MotionStressRoleBucket): MotionStressRoleThresholds {
  const base = {
    roleBucket,
    duplicateContourWarning: DEFAULT_MOTION_STRESS_THRESHOLDS.duplicateContourRatio,
    duplicateContourFail: DEFAULT_MOTION_STRESS_THRESHOLDS.duplicateContourRatio * 2,
    hiddenRevealWarning: DEFAULT_MOTION_STRESS_THRESHOLDS.hiddenRevealRatio,
    hiddenRevealFail: DEFAULT_MOTION_STRESS_THRESHOLDS.hiddenRevealRatio * 2,
    protectedCropMeanWarning: DEFAULT_MOTION_STRESS_THRESHOLDS.protectedCropMean,
    protectedCropMeanFail: DEFAULT_MOTION_STRESS_THRESHOLDS.protectedCropMean * 2,
    protectedCropP95Warning: DEFAULT_MOTION_STRESS_THRESHOLDS.protectedCropP95,
    protectedCropP95Fail: DEFAULT_MOTION_STRESS_THRESHOLDS.protectedCropP95 * 2,
  };
  switch (roleBucket) {
    case "protected":
      return {
        ...base,
        duplicateContourWarning: 0.012,
        duplicateContourFail: 0.024,
        protectedCropMeanWarning: 0.018,
        protectedCropMeanFail: 0.04,
        protectedCropP95Warning: 0.06,
        protectedCropP95Fail: 0.1,
      };
    case "hair":
      return {
        ...base,
        duplicateContourWarning: 0.012,
        duplicateContourFail: 0.028,
        hiddenRevealWarning: 0.009,
        hiddenRevealFail: 0.022,
      };
    case "tail":
    case "ribbon":
      return {
        ...base,
        duplicateContourWarning: 0.014,
        duplicateContourFail: 0.032,
        hiddenRevealWarning: 0.008,
        hiddenRevealFail: 0.018,
      };
    case "accessory":
      return {
        ...base,
        duplicateContourWarning: 0.012,
        duplicateContourFail: 0.026,
        protectedCropMeanWarning: 0.02,
        protectedCropMeanFail: 0.045,
        protectedCropP95Warning: 0.065,
        protectedCropP95Fail: 0.13,
      };
    case "body":
      return {
        ...base,
        duplicateContourWarning: 0.02,
        duplicateContourFail: 0.045,
        hiddenRevealWarning: 0.014,
        hiddenRevealFail: 0.03,
      };
    case "generic":
      return base;
  }
}

function freezeComparisonOption(
  option: MotionCleanupComparisonOption,
): MotionCleanupComparisonOption {
  return Object.freeze(option);
}

function maxRecommendationSeverity(
  recommendations: readonly MotionCleanupRecommendation[],
): Extract<MotionStressSeverityStatus, "warning" | "fail"> | undefined {
  if (recommendations.some((recommendation) => recommendation.severity === "fail")) {
    return "fail";
  }
  if (recommendations.some((recommendation) => recommendation.severity === "warning")) {
    return "warning";
  }
  return undefined;
}

function sortCleanupComparisonOptions(
  options: readonly MotionCleanupComparisonOption[],
): MotionCleanupComparisonOption[] {
  const rank: Record<MotionCleanupComparisonKind, number> = {
    none: 0,
    reviewDuplicateContourSuppression: 1,
    reviewHoldout: 2,
    reviewFeatherHoldout: 3,
    acceptUnderpaintReveal: 4,
    reduceMotionBudget: 5,
    splitMaskBeforeMotion: 6,
  };
  return [...options].sort((a, b) => rank[a.kind] - rank[b.kind]);
}

function normalizeAlphaInput(
  view: unknown,
  expectedWidth: number,
  expectedHeight: number,
  label: string,
): MotionStressAlphaView {
  if (view instanceof Uint8Array || view instanceof Uint8ClampedArray) {
    return { width: expectedWidth, height: expectedHeight, alpha: view, normalizationVersion: 1 };
  }
  const record = assertPlainDataRecord(view, label);
  return {
    width: readOwnDataProperty(record, "width", label) as number,
    height: readOwnDataProperty(record, "height", label) as number,
    alpha: readOwnDataProperty(record, "alpha", label) as Uint8Array | Uint8ClampedArray,
    normalizationVersion: readOwnDataProperty(record, "normalizationVersion", label) as 1,
  };
}

function validateArrayBuffer(buffer: ArrayBufferLike, label: string): void {
  if (typeof SharedArrayBuffer !== "undefined" && buffer instanceof SharedArrayBuffer) {
    throw new Error(`${label} must not use SharedArrayBuffer.`);
  }
  const maybeResizable = buffer as ArrayBuffer & { resizable?: boolean; growable?: boolean };
  if (maybeResizable.resizable === true || maybeResizable.growable === true) {
    throw new Error(`${label} must not use resizable or growable buffers.`);
  }
  try {
    void buffer.byteLength;
  } catch {
    throw new Error(`${label} buffer is detached.`);
  }
}

function assertFiniteNonNegative(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be non-negative finite.`);
  }
}

function validateFiniteBudget(
  budget: PersistedMotionBudgetAdjustment["budget"],
): void {
  for (const [key, value] of Object.entries(budget)) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new Error(`Motion budget ${key} must be a non-negative finite number.`);
    }
  }
}

function quantizeMotionBudget(
  budget: PersistedMotionBudgetAdjustment["budget"],
): PersistedMotionBudgetAdjustment["budget"] {
  return {
    maxRotationDeg: quantize(budget.maxRotationDeg, MOTION_BUDGET_QUANTIZATION.maxRotationDeg),
    maxDisplacementPxRatio: quantize(
      budget.maxDisplacementPxRatio,
      MOTION_BUDGET_QUANTIZATION.maxDisplacementPxRatio,
    ),
    physicsStrength: quantize(budget.physicsStrength, MOTION_BUDGET_QUANTIZATION.physicsStrength),
  };
}

function quantize(value: number, step: number): number {
  const decimals = Math.max(0, (String(step).split(".")[1] ?? "").length);
  return Number((Math.round(value / step) * step).toFixed(decimals));
}

function isUuidV4(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertPlainDataRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${label} must be a plain data object.`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${label} must be a plain data object.`);
  }
  return value;
}

function readOwnDataProperty(
  record: Record<string, unknown>,
  key: string,
  label: string,
): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (!descriptor || !("value" in descriptor)) {
    throw new Error(`${label}.${key} must be a data property.`);
  }
  return descriptor.value;
}

function readImageViewDimensions(
  view: unknown,
  label: string,
): { width: number; height: number } {
  const record = assertPlainDataRecord(view, label);
  return {
    width: readOwnDataProperty(record, "width", label) as number,
    height: readOwnDataProperty(record, "height", label) as number,
  };
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[-_.:/\s]+/g, "");
}

function percentile(values: number[], ratio: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * ratio) - 1),
  );
  return sorted[index] ?? 0;
}

function zeroDetail(): MotionStressScoreDetail {
  return {
    mean: 0,
    p95: 0,
    max: 0,
    affectedPixelRatio: 0,
  };
}

function maxDetail(details: MotionStressScoreDetail[]): MotionStressScoreDetail {
  return details.reduce<MotionStressScoreDetail>(
    (best, detail) => (detail.mean > best.mean ? detail : best),
    zeroDetail(),
  );
}

function isErrorLike(value: object): boolean {
  return value instanceof Error || "message" in value || "stack" in value;
}

function sanitizeErrorLike(
  value: unknown,
  seen: WeakSet<object>,
  depth: number,
): SanitizedMotionStressError {
  if (!value || typeof value !== "object" || depth > ERROR_SANITIZER_MAX_DEPTH) {
    return { name: "InternalError", message: "Internal motion stress error." };
  }
  if (seen.has(value)) {
    return { name: "InternalError", message: "Internal motion stress error." };
  }
  seen.add(value);
  const rawName = readDataProperty(value, "name");
  const rawMessage = readDataProperty(value, "message");
  const name =
    typeof rawName === "string" &&
    SAFE_ERROR_NAMES.has(rawName) &&
    !containsPrivateMarker(rawName)
      ? rawName
      : "InternalError";
  const message =
    typeof rawMessage === "string" && !containsPrivateMarker(rawMessage)
      ? redactPaths(rawMessage).slice(0, 200)
      : "Internal motion stress error.";
  const cause = readDataProperty(value, "cause");
  if (cause && typeof cause === "object") sanitizeErrorLike(cause, seen, depth + 1);
  const errors = readDataProperty(value, "errors");
  if (Array.isArray(errors)) {
    errors.forEach((entry) => sanitizeErrorLike(entry, seen, depth + 1));
  }
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
    if (!("value" in descriptor)) continue;
    const child = descriptor.value;
    if (child && typeof child === "object") sanitizeErrorLike(child, seen, depth + 1);
  }
  return { name, message };
}

function readDataProperty(value: object, key: string): unknown {
  let current: object | null = value;
  let depth = 0;
  while (current && depth < 4) {
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(current, key);
    } catch {
      return undefined;
    }
    if (descriptor) return "value" in descriptor ? descriptor.value : undefined;
    try {
      current = Object.getPrototypeOf(current);
    } catch {
      return undefined;
    }
    depth += 1;
  }
  return undefined;
}

function containsPrivateMarker(value: string): boolean {
  return /motionStressPreview|previewOnly|diagnosticHash|PreviewSolver|deformedVertices|solver/i.test(
    value,
  );
}

function redactPaths(value: string): string {
  return value
    .replace(/[A-Za-z]:\\[^\s)]+/g, "<path-redacted>")
    .replace(/\/(?:Users|home)\/[^\s)]+/g, "<path-redacted>");
}
