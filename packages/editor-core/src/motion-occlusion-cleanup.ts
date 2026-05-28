import type { ManualSplitOutputMetadata } from "@vivi2d/core/types";
import { stableStringify } from "./safe-auto-setup-plan";
import { createStableSha256Hex } from "./stable-hash";

export interface MotionCleanupRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type MotionOcclusionCleanupKind =
  | "holdout"
  | "featherHoldout"
  | "duplicateContourSuppression"
  | "acceptedUnderpaintReveal";

export type MotionCleanupHash = `sha256:v1:${string}`;
export type MotionCleanupPlanFingerprint = `cleanupPlan:v1:${string}`;
export type NonEmptyReadonlyArray<T> = readonly [T, ...T[]];
export type MotionUnderpaintReviewState = "preview" | "accepted" | "rejected";

export interface MotionUnderpaintSummary {
  id: string;
  reviewState: MotionUnderpaintReviewState;
  revision?: string;
  fingerprint?: MotionCleanupHash;
  bounds: MotionCleanupRect;
  sourceMaskId?: string;
  occludedByMaskId?: string;
}

export interface CleanupLayerPrecondition {
  layerId: string;
  layerRevision: string;
  textureId?: string;
  pixelFingerprint?: MotionCleanupHash;
}

export interface CleanupMaskPrecondition {
  maskId: string;
  maskRevision: string;
  maskFingerprint: MotionCleanupHash;
}

export interface MotionCleanupCommonPrecondition {
  sourceLayer: CleanupLayerPrecondition;
  movingRegionMask?: CleanupMaskPrecondition;
  occludingMask?: CleanupMaskPrecondition;
  targetLayers?: readonly CleanupLayerPrecondition[];
}

export interface ProtectedCleanupReviewProof {
  id: string;
  acceptedAt: string;
  reviewerInstanceId: string;
  boundPlanFingerprint: MotionCleanupPlanFingerprint;
  reviewedBounds: MotionCleanupRect;
  reviewedCleanupKind: MotionOcclusionCleanupKind;
  protectedRegionSetFingerprint: MotionCleanupHash;
  protectedPolicyId: string;
  protectedPolicyVersion: number;
  protectedCropGeneration: number;
}

export interface CurrentProtectedCleanupState {
  protectedRegionSetFingerprint: MotionCleanupHash;
  protectedPolicyId: string;
  protectedPolicyVersion: number;
  protectedCropGeneration: number;
}

export interface MotionOcclusionCleanupRequest {
  planId?: string;
  regionId: string;
  sourceLayerId: string;
  cleanupKind: MotionOcclusionCleanupKind;
  bounds: MotionCleanupRect;
  underpaintId?: string;
  underpaints?: readonly MotionUnderpaintSummary[];
  touchesProtectedRegion?: boolean;
  protectedReviewProof?: ProtectedCleanupReviewProof;
}

export interface MotionOcclusionCleanupPlan {
  id: string;
  regionId: string;
  sourceLayerId: string;
  cleanupKind: MotionOcclusionCleanupKind;
  bounds: MotionCleanupRect;
  reviewState: "accepted";
  touchesProtectedRegion: boolean;
  requiredUnderpaintId?: string;
  sourceMaskId?: string;
  occludedByMaskId?: string;
  protectedReviewProof?: ProtectedCleanupReviewProof;
}

export interface HoldoutCleanupPlan extends MotionOcclusionCleanupPlan {
  cleanupKind: "holdout" | "featherHoldout";
}

export interface DuplicateContourCleanupPlan extends MotionOcclusionCleanupPlan {
  cleanupKind: "duplicateContourSuppression";
}

export interface UnderpaintRevealCleanupPlan extends MotionOcclusionCleanupPlan {
  cleanupKind: "acceptedUnderpaintReveal";
  requiredUnderpaintId: string;
}

export type MotionOcclusionCleanupApplyEnvelope =
  | {
      kind: "holdout" | "featherHoldout";
      plan: HoldoutCleanupPlan;
      precondition: {
        common: MotionCleanupCommonPrecondition & {
          movingRegionMask: CleanupMaskPrecondition;
          targetLayers: NonEmptyReadonlyArray<CleanupLayerPrecondition>;
          layerGraphFingerprint: MotionCleanupHash;
        };
      };
    }
  | {
      kind: "duplicateContourSuppression";
      plan: DuplicateContourCleanupPlan;
      precondition: {
        common: MotionCleanupCommonPrecondition & {
          movingRegionMask: CleanupMaskPrecondition;
          targetLayers: NonEmptyReadonlyArray<CleanupLayerPrecondition>;
          layerGraphFingerprint: MotionCleanupHash;
          compositingStateFingerprint: MotionCleanupHash;
        };
      };
    }
  | {
      kind: "acceptedUnderpaintReveal";
      plan: UnderpaintRevealCleanupPlan;
      precondition: {
        common: MotionCleanupCommonPrecondition & {
          movingRegionMask: CleanupMaskPrecondition;
        };
        acceptedUnderpaintId: string;
        acceptedUnderpaintFingerprint: MotionCleanupHash;
        acceptedUnderpaintRevision: string;
      };
    };

export type MotionOcclusionCleanupDiagnosticCode =
  | "invalidId"
  | "invalidBounds"
  | "invalidFingerprint"
  | "invalidRevision"
  | "missingUnderpaint"
  | "underpaintNotAccepted"
  | "protectedRegionRequiresReview"
  | "protectedRegionReviewStale"
  | "kindMismatch"
  | "missingMovingRegionMask"
  | "missingTargetLayer"
  | "missingLayerGraph"
  | "missingCompositingState"
  | "missingAcceptedUnderpaintPrecondition"
  | "changedAcceptedUnderpaint"
  | "invalidPrecondition";

export interface MotionOcclusionCleanupDiagnostic {
  code: MotionOcclusionCleanupDiagnosticCode;
  severity: "blocker";
  path?: string;
  underpaintId?: string;
}

export interface MotionOcclusionCleanupResult {
  ok: boolean;
  plan?: MotionOcclusionCleanupPlan;
  diagnostics: readonly MotionOcclusionCleanupDiagnostic[];
}

export interface MotionOcclusionCleanupApplyValidationResult {
  ok: boolean;
  diagnostics: readonly MotionOcclusionCleanupDiagnostic[];
}

export interface MotionOcclusionCleanupPublicProjection {
  cleanupKind: MotionOcclusionCleanupKind;
  reviewState: "accepted";
  touchesProtectedRegion: boolean;
  underpaintState: "none" | "accepted";
}

export interface SanitizedMotionOcclusionCleanupError {
  name: "Error" | "TypeError" | "RangeError" | "InternalError";
  message: string;
}

const HASH_PATTERN = /^sha256:v1:[0-9a-f]{64}$/i;
const PLAN_FINGERPRINT_PATTERN = /^cleanupPlan:v1:[0-9a-f]{64}$/i;
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const SAFE_ERROR_NAMES = new Set(["Error", "TypeError", "RangeError"] as const);
const PRIVATE_FIELD_PATTERNS = [
  /boundPlanFingerprint/i,
  /reviewerInstanceId/i,
  /protectedRegionSetFingerprint/i,
  /sourceFingerprint/i,
  /acceptedUnderpaintFingerprint/i,
  /acceptedUnderpaintRevision/i,
  /pixelFingerprint/i,
  /maskFingerprint/i,
  /layerRevision/i,
  /maskRevision/i,
  /diagnosticHash/i,
  /solver/i,
  /previewOnly/i,
];
const PRIVATE_VALUE_PATTERNS = [
  /cleanupPlan:v1:[0-9a-f]{64}/i,
  /sha256:v1:[0-9a-f]{64}/i,
  /[A-Za-z]:[\\/][^\s]+/,
  /\/(?:Users|home|tmp|var|private)\//i,
  /solver|previewOnly|diagnosticHash/i,
];

export function createMotionOcclusionCleanupPlan(
  request: MotionOcclusionCleanupRequest,
): MotionOcclusionCleanupResult {
  const diagnostics: MotionOcclusionCleanupDiagnostic[] = [];
  const planId = request.planId ?? createUuidV4();
  if (!isUuidV4(planId)) {
    diagnostics.push({ code: "invalidId", severity: "blocker", path: "planId" });
  }
  if (!isNonEmptyString(request.regionId)) {
    diagnostics.push({ code: "invalidId", severity: "blocker", path: "regionId" });
  }
  if (!isNonEmptyString(request.sourceLayerId)) {
    diagnostics.push({ code: "invalidId", severity: "blocker", path: "sourceLayerId" });
  }
  if (!isValidRect(request.bounds)) {
    diagnostics.push({ code: "invalidBounds", severity: "blocker", path: "bounds" });
  }

  const underpaint =
    request.cleanupKind === "acceptedUnderpaintReveal"
      ? findRequiredUnderpaint(request, diagnostics)
      : undefined;

  const plan = Object.freeze({
    id: planId,
    regionId: request.regionId,
    sourceLayerId: request.sourceLayerId,
    cleanupKind: request.cleanupKind,
    bounds: normalizeRect(request.bounds),
    reviewState: "accepted" as const,
    touchesProtectedRegion: request.touchesProtectedRegion === true,
    requiredUnderpaintId: underpaint?.id,
    sourceMaskId: underpaint?.sourceMaskId,
    occludedByMaskId: underpaint?.occludedByMaskId,
    protectedReviewProof: request.protectedReviewProof,
  });

  if (request.touchesProtectedRegion) {
    validateProtectedReviewProof(plan, request.protectedReviewProof, diagnostics);
  }

  if (diagnostics.length > 0) {
    return { ok: false, diagnostics: Object.freeze(diagnostics) };
  }

  return {
    ok: true,
    diagnostics: Object.freeze([]),
    plan,
  };
}

export function createMotionCleanupPlanFingerprint(
  plan: Pick<
    MotionOcclusionCleanupPlan,
    | "id"
    | "regionId"
    | "sourceLayerId"
    | "cleanupKind"
    | "bounds"
    | "requiredUnderpaintId"
    | "sourceMaskId"
    | "occludedByMaskId"
  >,
): MotionCleanupPlanFingerprint {
  const canonical = {
    id: plan.id,
    regionId: plan.regionId,
    sourceLayerId: plan.sourceLayerId,
    cleanupKind: plan.cleanupKind,
    bounds: normalizeRect(plan.bounds),
    requiredUnderpaintId: plan.requiredUnderpaintId ?? null,
    sourceMaskId: plan.sourceMaskId ?? null,
    occludedByMaskId: plan.occludedByMaskId ?? null,
  };
  return `cleanupPlan:v1:${createStableSha256Hex(stableStringify(canonical))}`;
}

export function createProtectedCleanupReviewProof(input: {
  plan: MotionOcclusionCleanupPlan;
  protectedState: CurrentProtectedCleanupState;
  reviewerInstanceId: string;
  acceptedAt: string;
  proofId?: string;
}): ProtectedCleanupReviewProof {
  const proofId = input.proofId ?? createUuidV4();
  return Object.freeze({
    id: proofId,
    acceptedAt: input.acceptedAt,
    reviewerInstanceId: input.reviewerInstanceId,
    boundPlanFingerprint: createMotionCleanupPlanFingerprint(input.plan),
    reviewedBounds: normalizeRect(input.plan.bounds),
    reviewedCleanupKind: input.plan.cleanupKind,
    protectedRegionSetFingerprint: input.protectedState.protectedRegionSetFingerprint,
    protectedPolicyId: input.protectedState.protectedPolicyId,
    protectedPolicyVersion: input.protectedState.protectedPolicyVersion,
    protectedCropGeneration: input.protectedState.protectedCropGeneration,
  });
}

export function validateMotionOcclusionCleanupApplyEnvelope(
  envelope: MotionOcclusionCleanupApplyEnvelope,
  options: { currentProtectedState?: CurrentProtectedCleanupState } = {},
): MotionOcclusionCleanupApplyValidationResult {
  const diagnostics: MotionOcclusionCleanupDiagnostic[] = [];
  if (envelope.kind !== envelope.plan.cleanupKind) {
    diagnostics.push({ code: "kindMismatch", severity: "blocker", path: "kind" });
  }
  validatePlanShape(envelope.plan, diagnostics);
  validateLayerPrecondition(envelope.precondition.common.sourceLayer, "precondition.common.sourceLayer", diagnostics);
  validateProtectedReviewProof(
    envelope.plan,
    envelope.plan.protectedReviewProof,
    diagnostics,
    options.currentProtectedState,
  );

  if (envelope.kind === "acceptedUnderpaintReveal") {
    validateMaskPrecondition(
      envelope.precondition.common.movingRegionMask,
      "precondition.common.movingRegionMask",
      diagnostics,
    );
    if (envelope.precondition.acceptedUnderpaintId !== envelope.plan.requiredUnderpaintId) {
      diagnostics.push({
        code: "changedAcceptedUnderpaint",
        severity: "blocker",
        path: "precondition.acceptedUnderpaintId",
      });
    }
    if (!isHash(envelope.precondition.acceptedUnderpaintFingerprint)) {
      diagnostics.push({
        code: "invalidFingerprint",
        severity: "blocker",
        path: "precondition.acceptedUnderpaintFingerprint",
      });
    }
    if (!isNonEmptyString(envelope.precondition.acceptedUnderpaintRevision)) {
      diagnostics.push({
        code: "invalidRevision",
        severity: "blocker",
        path: "precondition.acceptedUnderpaintRevision",
      });
    }
  } else {
    validateMaskPrecondition(
      envelope.precondition.common.movingRegionMask,
      "precondition.common.movingRegionMask",
      diagnostics,
    );
    validateTargetLayers(envelope.precondition.common.targetLayers, diagnostics);
    if (!isHash(envelope.precondition.common.layerGraphFingerprint)) {
      diagnostics.push({ code: "missingLayerGraph", severity: "blocker", path: "precondition.common.layerGraphFingerprint" });
    }
    if (envelope.kind === "duplicateContourSuppression") {
      if (!isHash(envelope.precondition.common.compositingStateFingerprint)) {
        diagnostics.push({
          code: "missingCompositingState",
          severity: "blocker",
          path: "precondition.common.compositingStateFingerprint",
        });
      }
    }
  }

  return {
    ok: diagnostics.length === 0,
    diagnostics: Object.freeze(diagnostics),
  };
}

export function projectMotionOcclusionCleanupForPublicSurface(
  plan: MotionOcclusionCleanupPlan,
): MotionOcclusionCleanupPublicProjection {
  return Object.freeze({
    cleanupKind: plan.cleanupKind,
    reviewState: plan.reviewState,
    touchesProtectedRegion: plan.touchesProtectedRegion,
    underpaintState: plan.requiredUnderpaintId ? "accepted" : "none",
  });
}

export function assertNoMotionOcclusionCleanupPrivateFields(value: unknown): void {
  const finding = findPrivateField(value, new WeakSet<object>(), 0);
  if (finding) {
    throw new Error(`Motion occlusion cleanup private field is not publishable: ${finding}`);
  }
}

export function sanitizeMotionOcclusionCleanupErrorForPublicSurface(
  value: unknown,
): SanitizedMotionOcclusionCleanupError {
  if (!value || typeof value !== "object") {
    return { name: "InternalError", message: "Internal cleanup error." };
  }
  const rawName = readDataProperty(value, "name");
  const rawMessage = readDataProperty(value, "message");
  const name =
    typeof rawName === "string" &&
    SAFE_ERROR_NAMES.has(rawName as never) &&
    !containsPrivateMarker(rawName)
      ? (rawName as SanitizedMotionOcclusionCleanupError["name"])
      : "InternalError";
  const message =
    typeof rawMessage === "string" && !containsPrivateMarker(rawMessage)
      ? redactPublicErrorMessage(rawMessage).slice(0, 200)
      : "Internal cleanup error.";
  return { name, message };
}

export function isManualSplitLayerEligibleForMotionAutoSetup(
  metadata: ManualSplitOutputMetadata | undefined,
): boolean {
  return metadata?.kind !== "generatedUnderpaintLayer";
}

function validatePlanShape(
  plan: MotionOcclusionCleanupPlan,
  diagnostics: MotionOcclusionCleanupDiagnostic[],
): void {
  if (!isUuidV4(plan.id)) diagnostics.push({ code: "invalidId", severity: "blocker", path: "plan.id" });
  if (!isNonEmptyString(plan.regionId)) diagnostics.push({ code: "invalidId", severity: "blocker", path: "plan.regionId" });
  if (!isNonEmptyString(plan.sourceLayerId)) diagnostics.push({ code: "invalidId", severity: "blocker", path: "plan.sourceLayerId" });
  if (!isValidRect(plan.bounds)) diagnostics.push({ code: "invalidBounds", severity: "blocker", path: "plan.bounds" });
  if (plan.cleanupKind === "acceptedUnderpaintReveal" && !isNonEmptyString(plan.requiredUnderpaintId)) {
    diagnostics.push({
      code: "missingAcceptedUnderpaintPrecondition",
      severity: "blocker",
      path: "plan.requiredUnderpaintId",
    });
  }
}

function validateProtectedReviewProof(
  plan: MotionOcclusionCleanupPlan,
  proof: ProtectedCleanupReviewProof | undefined,
  diagnostics: MotionOcclusionCleanupDiagnostic[],
  currentProtectedState?: CurrentProtectedCleanupState,
): void {
  if (!plan.touchesProtectedRegion) return;
  if (!proof) {
    diagnostics.push({ code: "protectedRegionRequiresReview", severity: "blocker" });
    return;
  }
  const expectedPlanFingerprint = createMotionCleanupPlanFingerprint(plan);
  if (
    !isUuidV4(proof.id) ||
    !isNonEmptyString(proof.reviewerInstanceId) ||
    !ISO_TIME_PATTERN.test(proof.acceptedAt) ||
    proof.boundPlanFingerprint !== expectedPlanFingerprint ||
    !rectEquals(proof.reviewedBounds, plan.bounds) ||
    proof.reviewedCleanupKind !== plan.cleanupKind ||
    !isHash(proof.protectedRegionSetFingerprint) ||
    !isNonEmptyString(proof.protectedPolicyId) ||
    !isPositiveSafeInteger(proof.protectedPolicyVersion) ||
    !Number.isSafeInteger(proof.protectedCropGeneration) ||
    proof.protectedCropGeneration < 0
  ) {
    diagnostics.push({ code: "protectedRegionReviewStale", severity: "blocker", path: "protectedReviewProof" });
    return;
  }
  if (
    currentProtectedState &&
    (proof.protectedRegionSetFingerprint !== currentProtectedState.protectedRegionSetFingerprint ||
      proof.protectedPolicyId !== currentProtectedState.protectedPolicyId ||
      proof.protectedPolicyVersion !== currentProtectedState.protectedPolicyVersion ||
      proof.protectedCropGeneration !== currentProtectedState.protectedCropGeneration)
  ) {
    diagnostics.push({ code: "protectedRegionReviewStale", severity: "blocker", path: "currentProtectedState" });
  }
}

function findRequiredUnderpaint(
  request: MotionOcclusionCleanupRequest,
  diagnostics: MotionOcclusionCleanupDiagnostic[],
): MotionUnderpaintSummary | undefined {
  if (!request.underpaintId) {
    diagnostics.push({ code: "missingUnderpaint", severity: "blocker" });
    return undefined;
  }
  const underpaint = request.underpaints?.find(
    (entry) => entry.id === request.underpaintId,
  );
  if (!underpaint) {
    diagnostics.push({
      code: "missingUnderpaint",
      severity: "blocker",
      underpaintId: request.underpaintId,
    });
    return undefined;
  }
  if (underpaint.reviewState !== "accepted") {
    diagnostics.push({
      code: "underpaintNotAccepted",
      severity: "blocker",
      underpaintId: underpaint.id,
    });
    return undefined;
  }
  if (!isValidRect(underpaint.bounds)) {
    diagnostics.push({
      code: "invalidBounds",
      severity: "blocker",
      underpaintId: underpaint.id,
    });
    return undefined;
  }
  return underpaint;
}

function validateMaskPrecondition(
  mask: CleanupMaskPrecondition | undefined,
  path: string,
  diagnostics: MotionOcclusionCleanupDiagnostic[],
): void {
  if (!mask) {
    diagnostics.push({ code: "missingMovingRegionMask", severity: "blocker", path });
    return;
  }
  if (!isNonEmptyString(mask.maskId)) diagnostics.push({ code: "invalidId", severity: "blocker", path: `${path}.maskId` });
  if (!isNonEmptyString(mask.maskRevision)) diagnostics.push({ code: "invalidRevision", severity: "blocker", path: `${path}.maskRevision` });
  if (!isHash(mask.maskFingerprint)) diagnostics.push({ code: "invalidFingerprint", severity: "blocker", path: `${path}.maskFingerprint` });
}

function validateLayerPrecondition(
  layer: CleanupLayerPrecondition | undefined,
  path: string,
  diagnostics: MotionOcclusionCleanupDiagnostic[],
): void {
  if (!layer) {
    diagnostics.push({ code: "invalidPrecondition", severity: "blocker", path });
    return;
  }
  if (!isNonEmptyString(layer.layerId)) diagnostics.push({ code: "invalidId", severity: "blocker", path: `${path}.layerId` });
  if (!isNonEmptyString(layer.layerRevision)) diagnostics.push({ code: "invalidRevision", severity: "blocker", path: `${path}.layerRevision` });
  if (layer.pixelFingerprint !== undefined && !isHash(layer.pixelFingerprint)) {
    diagnostics.push({ code: "invalidFingerprint", severity: "blocker", path: `${path}.pixelFingerprint` });
  }
}

function validateTargetLayers(
  targetLayers: readonly CleanupLayerPrecondition[] | undefined,
  diagnostics: MotionOcclusionCleanupDiagnostic[],
): void {
  if (!targetLayers || targetLayers.length === 0) {
    diagnostics.push({ code: "missingTargetLayer", severity: "blocker", path: "precondition.common.targetLayers" });
    return;
  }
  targetLayers.forEach((layer, index) =>
    validateLayerPrecondition(layer, `precondition.common.targetLayers.${index}`, diagnostics),
  );
}

function findPrivateField(value: unknown, seen: WeakSet<object>, depth: number): string | null {
  if (!value || typeof value !== "object" || depth > 16) return null;
  if (seen.has(value)) return null;
  seen.add(value);
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (PRIVATE_FIELD_PATTERNS.some((pattern) => pattern.test(key))) return key;
    if (!("value" in descriptor)) continue;
    const child = descriptor.value;
    if (typeof child === "string" && containsPrivateValue(child)) return key;
    const nested = findPrivateField(child, seen, depth + 1);
    if (nested) return nested;
  }
  return null;
}

function isValidRect(rect: MotionCleanupRect): boolean {
  return (
    rect !== null &&
    typeof rect === "object" &&
    Number.isFinite(rect.x) &&
    Number.isFinite(rect.y) &&
    Number.isFinite(rect.width) &&
    Number.isFinite(rect.height) &&
    rect.width > 0 &&
    rect.height > 0
  );
}

function normalizeRect(rect: MotionCleanupRect): MotionCleanupRect {
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  };
}

function rectEquals(a: MotionCleanupRect, b: MotionCleanupRect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function isHash(value: unknown): value is MotionCleanupHash {
  return typeof value === "string" && HASH_PATTERN.test(value);
}

function isUuidV4(value: unknown): value is string {
  return typeof value === "string" && UUID_V4_PATTERN.test(value);
}

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function createUuidV4(): string {
  const randomUUID = globalThis.crypto?.randomUUID?.bind(globalThis.crypto);
  if (!randomUUID) {
    throw new Error("A CSPRNG UUID source is required for motion cleanup plans.");
  }
  return randomUUID();
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

function containsPrivateValue(value: string): boolean {
  return PRIVATE_VALUE_PATTERNS.some((pattern) => pattern.test(value));
}

function containsPrivateMarker(value: string): boolean {
  return /solver|previewOnly|diagnosticHash/i.test(value);
}

function redactPublicErrorMessage(value: string): string {
  return redactPaths(value)
    .replace(/cleanupPlan:v1:[0-9a-f]{64}/gi, "<plan-redacted>")
    .replace(/sha256:v1:[0-9a-f]{64}/gi, "<hash-redacted>");
}

function redactPaths(value: string): string {
  return value
    .replace(/[A-Za-z]:[\\/][^\s]+/g, "<path-redacted>")
    .replace(/\/(?:Users|home|tmp|var|private)\/[^\s]+/gi, "<path-redacted>");
}
