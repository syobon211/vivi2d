import {
  PROVIDER_LOCAL_MOTION_FORBIDDEN_KEYS,
  PROVIDER_LOCAL_MOTION_FORBIDDEN_MARKERS,
} from "./generated/private-local-motion-markers.js";

export const VIVI_PROVIDER_SDK_VERSION = "0.1.0";

export const VIVI_PROVIDER_CAPABILITIES = {
  layerDecompose: "vivi2d.provider.layerDecompose.v1",
  promptToLayerManifest: "vivi2d.provider.promptToLayerManifest.v1",
  manifestToPsd: "vivi2d.provider.manifestToPsd.v1",
  maskProposal: "vivi2d.provider.maskProposal.v1",
  alphaMatte: "vivi2d.provider.alphaMatte.v1",
  amodalUnderpaint: "vivi2d.provider.amodalUnderpaint.v1",
} as const;

export type ViviProviderCapabilityId =
  (typeof VIVI_PROVIDER_CAPABILITIES)[keyof typeof VIVI_PROVIDER_CAPABILITIES];

export type ViviProviderArtifactKind =
  | "inputImage"
  | "layerImage"
  | "maskProposal"
  | "alphaMatte"
  | "underpaint"
  | "layerGraph"
  | "qualityReport"
  | "manifest"
  | "psd"
  | "metadata"
  | "binary";

export const VIVI_PROVIDER_ARTIFACT_KINDS = [
  "inputImage",
  "layerImage",
  "maskProposal",
  "alphaMatte",
  "underpaint",
  "layerGraph",
  "qualityReport",
  "manifest",
  "psd",
  "metadata",
  "binary",
] as const satisfies readonly ViviProviderArtifactKind[];

const PROTECTED_LAYER_PROPOSAL_SEMANTICS = new Set([
  "face",
  "eye",
  "eyes",
  "eyeleft",
  "lefteye",
  "eyeright",
  "righteye",
  "mouth",
]);

export type ViviProviderLayerArtifactProvenance =
  | "source"
  | "user"
  | "providerProposal"
  | "generatedHidden";

export interface ViviProviderMaskProposalMetadata {
  schema: "vivi2d.provider.maskProposalMetadata.v1";
  semantic?: string;
  confidence: number;
  provenance: ViviProviderLayerArtifactProvenance;
  sourceArtifactId?: string;
}

export interface ViviProviderAlphaMatteMetadata {
  schema: "vivi2d.provider.alphaMatteMetadata.v1";
  maskArtifactId: string;
  confidence: number;
  provenance: ViviProviderLayerArtifactProvenance;
}

export interface ViviProviderUnderpaintMetadata {
  schema: "vivi2d.provider.underpaintMetadata.v1";
  occludedByArtifactId?: string;
  confidence: number;
  provenance: "generatedHidden";
}

export const VIVI_PROVIDER_PROGRESS_PHASES = [
  "queued",
  "uploading",
  "processing",
  "downloading",
  "assembling",
  "complete",
] as const;

export type ViviProviderProgressPhase = (typeof VIVI_PROVIDER_PROGRESS_PHASES)[number];

export type ViviProviderDataClass =
  | "sourcePixels"
  | "currentMask"
  | "clickPrompts"
  | "generatedUnderpaintContext";

export const VIVI_PROVIDER_DATA_CLASSES = [
  "sourcePixels",
  "currentMask",
  "clickPrompts",
  "generatedUnderpaintContext",
] as const satisfies readonly ViviProviderDataClass[];

export type ViviProviderErrorCode =
  | "VIVI_PROVIDER_INVALID_REQUEST"
  | "VIVI_PROVIDER_CAPABILITY_UNAVAILABLE"
  | "VIVI_PROVIDER_TIMEOUT"
  | "VIVI_PROVIDER_LIMIT_EXCEEDED"
  | "VIVI_PROVIDER_BAD_ARTIFACT"
  | "VIVI_PROVIDER_CANCELLED"
  | "VIVI_PROVIDER_INTERNAL";

export const VIVI_PROVIDER_ERROR_CODES = [
  "VIVI_PROVIDER_INVALID_REQUEST",
  "VIVI_PROVIDER_CAPABILITY_UNAVAILABLE",
  "VIVI_PROVIDER_TIMEOUT",
  "VIVI_PROVIDER_LIMIT_EXCEEDED",
  "VIVI_PROVIDER_BAD_ARTIFACT",
  "VIVI_PROVIDER_CANCELLED",
  "VIVI_PROVIDER_INTERNAL",
] as const satisfies readonly ViviProviderErrorCode[];

export interface ViviProviderCapability {
  id: ViviProviderCapabilityId | string;
  version: string;
  inputKinds: ViviProviderArtifactKind[];
  outputKinds: ViviProviderArtifactKind[];
  maxInputBytes: number;
  maxOutputBytes: number;
  timeoutMs: number;
}

export interface ViviProviderManifest {
  id: string;
  displayName: string;
  version: string;
  sdkVersion: typeof VIVI_PROVIDER_SDK_VERSION;
  capabilities: ViviProviderCapability[];
}

export interface ViviProviderLimits {
  maxInputBytes: number;
  maxOutputBytes: number;
  maxArtifacts: number;
  timeoutMs: number;
  maxMetadataBytes: number;
  maxWarnings: number;
}

export interface ViviProviderArtifact {
  id: string;
  kind: ViviProviderArtifactKind;
  mediaType: string;
  byteLength: number;
  path?: string;
  sha256?: string;
  data?: ArrayBuffer;
  metadata?: Record<string, unknown>;
}

export interface ViviProviderRequest {
  requestId: string;
  capabilityId: ViviProviderCapabilityId | string;
  requestToken?: string;
  dataClasses?: ViviProviderDataClass[];
  inputArtifacts: ViviProviderArtifact[];
  parameters?: Record<string, unknown>;
  limits?: Partial<ViviProviderLimits>;
}

export interface ViviProviderProgress {
  requestId: string;
  phase: ViviProviderProgressPhase;
  step: number;
  total: number;
  message?: string;
}

export interface ViviProviderContext {
  signal?: AbortSignal;
  onProgress?: (progress: ViviProviderProgress) => void;
}

export interface ViviProviderResult {
  requestId: string;
  capabilityId: ViviProviderCapabilityId | string;
  artifacts: ViviProviderArtifact[];
  warnings: string[];
  provenance: {
    providerId: string;
    providerVersion: string;
    capabilityId: ViviProviderCapabilityId | string;
    generatedAt: string;
  };
}

export interface ViviProvider {
  manifest: ViviProviderManifest;
  invoke(
    request: ViviProviderRequest,
    context?: ViviProviderContext,
  ): Promise<ViviProviderResult>;
}

export function defineViviProvider(provider: ViviProvider): ViviProvider {
  if (!provider || typeof provider !== "object" || typeof provider.invoke !== "function") {
    throw new ViviProviderError(
      "VIVI_PROVIDER_INVALID_REQUEST",
      "Provider must include an invoke function.",
    );
  }
  const manifest = cloneProviderManifest(validateProviderManifest(provider.manifest));
  const invoke = provider.invoke.bind(provider);
  return Object.freeze({
    manifest,
    async invoke(
      request: ViviProviderRequest,
      context?: ViviProviderContext,
    ): Promise<ViviProviderResult> {
      return invoke(request, context);
    },
  });
}

export class ViviProviderError extends Error {
  readonly code: ViviProviderErrorCode;
  readonly details: Record<string, unknown> | undefined;

  constructor(
    code: ViviProviderErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ViviProviderError";
    this.code = code;
    this.details = details;
  }
}

export function isViviProviderError(error: unknown): error is ViviProviderError {
  if (error instanceof ViviProviderError) return true;
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    code?: unknown;
    message?: unknown;
    name?: unknown;
  };
  return (
    candidate.name === "ViviProviderError" &&
    typeof candidate.message === "string" &&
    typeof candidate.code === "string" &&
    VIVI_PROVIDER_ERROR_CODES.includes(candidate.code as ViviProviderErrorCode)
  );
}

export const DEFAULT_PROVIDER_LIMITS: ViviProviderLimits = {
  maxInputBytes: 50 * 1024 * 1024,
  maxOutputBytes: 200 * 1024 * 1024,
  maxArtifacts: 128,
  timeoutMs: 120_000,
  maxMetadataBytes: 256 * 1024,
  maxWarnings: 64,
};

export const MAX_PROVIDER_LIMITS: ViviProviderLimits = {
  maxInputBytes: 512 * 1024 * 1024,
  maxOutputBytes: 1024 * 1024 * 1024,
  maxArtifacts: 512,
  timeoutMs: 10 * 60_000,
  maxMetadataBytes: 1024 * 1024,
  maxWarnings: 256,
};

export function mergeProviderLimits(
  overrides: Partial<ViviProviderLimits> | undefined,
): ViviProviderLimits {
  const merged = { ...DEFAULT_PROVIDER_LIMITS };
  for (const key of Object.keys(merged) as Array<keyof ViviProviderLimits>) {
    const value = overrides?.[key];
    if (value === undefined) continue;
    merged[key] = assertProviderLimitCeiling(value, `limits.${key}`, key);
  }
  return merged;
}

export function validateProviderManifest(
  manifest: ViviProviderManifest,
): ViviProviderManifest {
  assertSafeIdentifier(manifest.id, "manifest.id");
  assertNonEmptyString(manifest.displayName, "manifest.displayName");
  assertNonEmptyString(manifest.version, "manifest.version");
  if (manifest.sdkVersion !== VIVI_PROVIDER_SDK_VERSION) {
    throw new ViviProviderError(
      "VIVI_PROVIDER_INVALID_REQUEST",
      `Unsupported provider SDK version: ${manifest.sdkVersion}`,
    );
  }
  if (!Array.isArray(manifest.capabilities) || manifest.capabilities.length === 0) {
    throw new ViviProviderError(
      "VIVI_PROVIDER_INVALID_REQUEST",
      "Provider manifest must declare at least one capability.",
    );
  }
  for (const capability of manifest.capabilities) {
    validateCapability(capability);
  }
  return manifest;
}

export function validateProviderRequest(
  request: ViviProviderRequest,
  limits = DEFAULT_PROVIDER_LIMITS,
): ViviProviderRequest {
  assertSafeIdentifier(request.requestId, "request.requestId");
  assertNonEmptyString(request.capabilityId, "request.capabilityId");
  if (request.requestToken !== undefined) {
    assertOpaqueProviderRequestToken(request.requestToken, "request.requestToken");
  }
  if (request.dataClasses !== undefined) {
    assertProviderDataClasses(request.dataClasses, "request.dataClasses");
  }
  if (request.limits !== undefined) {
    mergeProviderLimits(request.limits);
  }
  validateArtifactList(request.inputArtifacts, limits, "inputArtifacts");
  if (request.parameters !== undefined) {
    assertJsonObject(request.parameters, "request.parameters");
    assertMetadataSize(request.parameters, limits.maxMetadataBytes, "request.parameters");
  }
  return request;
}

export function validateProviderResult(
  result: ViviProviderResult,
  limits: ViviProviderLimits = DEFAULT_PROVIDER_LIMITS,
  referenceArtifacts: readonly ViviProviderArtifact[] = [],
): ViviProviderResult {
  assertSafeIdentifier(result.requestId, "result.requestId");
  assertNonEmptyString(result.capabilityId, "result.capabilityId");
  validateArtifactList(result.artifacts, limits, "artifacts", referenceArtifacts);
  if (!Array.isArray(result.warnings)) {
    throw new ViviProviderError(
      "VIVI_PROVIDER_INVALID_REQUEST",
      "Provider result warnings must be an array.",
    );
  }
  if (result.warnings.length > limits.maxWarnings) {
    throw new ViviProviderError(
      "VIVI_PROVIDER_LIMIT_EXCEEDED",
      `Provider result warnings exceed maxWarnings (${limits.maxWarnings}).`,
    );
  }
  for (const warning of result.warnings) {
    assertNonEmptyString(warning, "result.warnings[]");
  }
  assertSafeIdentifier(result.provenance.providerId, "result.provenance.providerId");
  assertNonEmptyString(
    result.provenance.providerVersion,
    "result.provenance.providerVersion",
  );
  assertNonEmptyString(result.provenance.capabilityId, "result.provenance.capabilityId");
  const generatedAtDate = new Date(result.provenance.generatedAt);
  if (
    Number.isNaN(generatedAtDate.getTime()) ||
    generatedAtDate.toISOString() !== result.provenance.generatedAt
  ) {
    throw new ViviProviderError(
      "VIVI_PROVIDER_INVALID_REQUEST",
      "Provider provenance generatedAt must be a normalized UTC ISO timestamp.",
    );
  }
  return result;
}

export function normalizeProviderArtifactPath(pathValue: string): string {
  assertNonEmptyString(pathValue, "artifact.path");
  const normalized = pathValue.replace(/\\/g, "/");
  if (normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) {
    throw new ViviProviderError(
      "VIVI_PROVIDER_BAD_ARTIFACT",
      `Provider artifact path must be relative: ${pathValue}`,
    );
  }
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length === 0 || parts.some((part) => part === "." || part === "..")) {
    throw new ViviProviderError(
      "VIVI_PROVIDER_BAD_ARTIFACT",
      `Provider artifact path contains an unsafe segment: ${pathValue}`,
    );
  }
  return parts.join("/");
}

export function createProviderResult(
  manifest: ViviProviderManifest,
  request: ViviProviderRequest,
  artifacts: ViviProviderArtifact[],
  warnings: string[] = [],
): ViviProviderResult {
  validateProviderManifest(manifest);
  const limits = mergeProviderLimits(request.limits);
  validateProviderRequest(request, limits);
  return validateProviderResult(
    {
      requestId: request.requestId,
      capabilityId: request.capabilityId,
      artifacts,
      warnings,
      provenance: {
        providerId: manifest.id,
        providerVersion: manifest.version,
        capabilityId: request.capabilityId,
        generatedAt: new Date().toISOString(),
      },
    },
    limits,
    request.inputArtifacts,
  );
}

function cloneProviderManifest(manifest: ViviProviderManifest): ViviProviderManifest {
  return Object.freeze({
    ...manifest,
    capabilities: Object.freeze(
      manifest.capabilities.map((capability) =>
        Object.freeze({
          ...capability,
          inputKinds: Object.freeze([...capability.inputKinds]) as ViviProviderArtifactKind[],
          outputKinds: Object.freeze([...capability.outputKinds]) as ViviProviderArtifactKind[],
        }),
      ),
    ) as unknown as ViviProviderCapability[],
  });
}

function validateCapability(capability: ViviProviderCapability): void {
  assertNonEmptyString(capability.id, "capability.id");
  assertNonEmptyString(capability.version, "capability.version");
  assertArtifactKindArray(capability.inputKinds, "capability.inputKinds");
  assertArtifactKindArray(capability.outputKinds, "capability.outputKinds");
  assertProviderLimitCeiling(
    capability.maxInputBytes,
    "capability.maxInputBytes",
    "maxInputBytes",
  );
  assertProviderLimitCeiling(
    capability.maxOutputBytes,
    "capability.maxOutputBytes",
    "maxOutputBytes",
  );
  assertProviderLimitCeiling(capability.timeoutMs, "capability.timeoutMs", "timeoutMs");
}

function assertArtifactKindArray(
  value: unknown,
  label: string,
): asserts value is ViviProviderArtifactKind[] {
  assertStringArray(value, label);
  for (const kind of value) {
    if (!VIVI_PROVIDER_ARTIFACT_KINDS.includes(kind as ViviProviderArtifactKind)) {
      throw new ViviProviderError(
        "VIVI_PROVIDER_INVALID_REQUEST",
        `${label} contains an unsupported artifact kind: ${kind}`,
      );
    }
  }
}

function validateArtifactList(
  artifacts: ViviProviderArtifact[],
  limits: ViviProviderLimits,
  label: string,
  referenceArtifacts: readonly ViviProviderArtifact[] = [],
): void {
  if (!Array.isArray(artifacts)) {
    throw new ViviProviderError(
      "VIVI_PROVIDER_INVALID_REQUEST",
      `${label} must be an array.`,
    );
  }
  if (artifacts.length > limits.maxArtifacts) {
    throw new ViviProviderError(
      "VIVI_PROVIDER_LIMIT_EXCEEDED",
      `${label} exceeds maxArtifacts (${limits.maxArtifacts}).`,
    );
  }
  let totalBytes = 0;
  const artifactById = new Map<string, ViviProviderArtifact>();
  const referenceArtifactIds = new Set<string>();
  const resultArtifactIds = new Set<string>();
  for (const artifact of referenceArtifacts) {
    validateArtifact(artifact, limits);
    referenceArtifactIds.add(artifact.id);
    if (!artifactById.has(artifact.id)) {
      artifactById.set(artifact.id, artifact);
    }
  }
  for (const artifact of artifacts) {
    validateArtifact(artifact, limits);
    if (resultArtifactIds.has(artifact.id)) {
      throw new ViviProviderError(
        "VIVI_PROVIDER_BAD_ARTIFACT",
        `Duplicate provider artifact id: ${artifact.id}`,
      );
    }
    if (referenceArtifactIds.has(artifact.id)) {
      throw new ViviProviderError(
        "VIVI_PROVIDER_BAD_ARTIFACT",
        `Provider result artifact ${artifact.id} shadows an input artifact id.`,
      );
    }
    resultArtifactIds.add(artifact.id);
    artifactById.set(artifact.id, artifact);
    totalBytes += artifact.byteLength;
  }
  for (const artifact of artifacts) {
    if (artifact.kind !== "alphaMatte") continue;
    const maskArtifactId = artifact.metadata?.maskArtifactId;
    const maskArtifact =
      typeof maskArtifactId === "string" ? artifactById.get(maskArtifactId) : undefined;
    if (!maskArtifact) {
      throw new ViviProviderError(
        "VIVI_PROVIDER_BAD_ARTIFACT",
        `alphaMatte artifact ${artifact.id} references a missing maskProposal artifact.`,
      );
    }
    if (maskArtifact.kind !== "maskProposal") {
      throw new ViviProviderError(
        "VIVI_PROVIDER_BAD_ARTIFACT",
        `alphaMatte artifact ${artifact.id} references ${maskArtifact.id}, but it is not a maskProposal artifact.`,
      );
    }
    const maskSemantic = normalizeLayerProposalSemantic(
      maskArtifact.metadata?.semantic,
      "maskProposal.metadata",
    );
    const matteProvenance = artifact.metadata?.provenance;
    if (
      !isTrustedLayerProposalProvenance(matteProvenance) &&
      (!maskSemantic || PROTECTED_LAYER_PROPOSAL_SEMANTICS.has(maskSemantic))
    ) {
      throw new ViviProviderError(
        "VIVI_PROVIDER_BAD_ARTIFACT",
        maskSemantic
          ? `alphaMatte artifacts cannot own protected ${maskSemantic} semantics.`
          : "alphaMatte artifacts cannot own unclassified mask semantics.",
      );
    }
  }
  const maxBytes =
    label === "inputArtifacts" ? limits.maxInputBytes : limits.maxOutputBytes;
  if (totalBytes > maxBytes) {
    throw new ViviProviderError(
      "VIVI_PROVIDER_LIMIT_EXCEEDED",
      `${label} exceeds byte limit (${maxBytes}).`,
    );
  }
}

function validateArtifact(
  artifact: ViviProviderArtifact,
  limits: ViviProviderLimits,
): void {
  assertSafeIdentifier(artifact.id, "artifact.id");
  assertNoProviderLocalMotionArtifactFields(
    artifact as unknown as Record<string, unknown>,
    "artifact",
  );
  assertNonEmptyString(artifact.kind, "artifact.kind");
  if (!VIVI_PROVIDER_ARTIFACT_KINDS.includes(artifact.kind as ViviProviderArtifactKind)) {
    throw new ViviProviderError(
      "VIVI_PROVIDER_BAD_ARTIFACT",
      `Unsupported provider artifact kind: ${artifact.kind}`,
    );
  }
  assertNonEmptyString(artifact.mediaType, "artifact.mediaType");
  assertPositiveFiniteInteger(artifact.byteLength, "artifact.byteLength");
  if (artifact.path !== undefined) {
    normalizeProviderArtifactPath(artifact.path);
  }
  if (artifact.sha256 !== undefined && !/^[a-f0-9]{64}$/i.test(artifact.sha256)) {
    throw new ViviProviderError(
      "VIVI_PROVIDER_BAD_ARTIFACT",
      `Invalid artifact sha256 for ${artifact.id}.`,
    );
  }
  if (artifact.data !== undefined && artifact.data.byteLength !== artifact.byteLength) {
    throw new ViviProviderError(
      "VIVI_PROVIDER_BAD_ARTIFACT",
      `Artifact ${artifact.id} byteLength does not match data.byteLength.`,
    );
  }
  if (artifact.metadata !== undefined) {
    assertJsonObject(artifact.metadata, "artifact.metadata");
    assertMetadataSize(artifact.metadata, limits.maxMetadataBytes, "artifact.metadata");
  }
  validateLayerProposalMetadata(artifact);
}

function normalizeProviderMarkerText(value: string): string {
  return value.toLowerCase().replace(/[-_.:/\s]+/g, "");
}

function containsProviderSolverToken(value: string): boolean {
  return (value.match(/[A-Za-z]+/g) ?? []).some(
    (token) => token.toLowerCase() === "solver",
  );
}

function assertNoProviderLocalMotionArtifactFields(
  value: unknown,
  label: string,
  seen = new WeakSet<object>(),
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertNoProviderLocalMotionArtifactFields(item, `${label}[${index}]`, seen),
    );
    return;
  }
  if (typeof value === "string") {
    const normalized = normalizeProviderMarkerText(value);
    for (const marker of PROVIDER_LOCAL_MOTION_FORBIDDEN_MARKERS) {
      if (normalized.includes(normalizeProviderMarkerText(marker))) {
        throw new ViviProviderError(
          "VIVI_PROVIDER_BAD_ARTIFACT",
          `${label} contains local motion preview marker ${marker}.`,
        );
      }
    }
    if (containsProviderSolverToken(value)) {
      throw new ViviProviderError(
        "VIVI_PROVIDER_BAD_ARTIFACT",
        `${label} contains a provider-disallowed solver token.`,
      );
    }
    return;
  }
  if (!value || typeof value !== "object") return;
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return;
  if (seen.has(value)) {
    throw new ViviProviderError(
      "VIVI_PROVIDER_INVALID_REQUEST",
      `${label} must be JSON serializable.`,
    );
  }
  seen.add(value);

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key === "data") continue;
    if (PROVIDER_LOCAL_MOTION_FORBIDDEN_KEYS.has(key)) {
      throw new ViviProviderError(
        "VIVI_PROVIDER_BAD_ARTIFACT",
        `${label}.${key} is not allowed in provider artifacts.`,
      );
    }
    assertNoProviderLocalMotionArtifactFields(child, `${label}.${key}`, seen);
  }
}

function isTrustedLayerProposalProvenance(provenance: unknown): boolean {
  return provenance === "source" || provenance === "user";
}

function normalizeLayerProposalSemantic(
  semantic: unknown,
  label: string,
): string | undefined {
  if (semantic === undefined) return undefined;
  if (typeof semantic !== "string" || semantic.trim().length === 0) {
    throw new ViviProviderError(
      "VIVI_PROVIDER_BAD_ARTIFACT",
      `${label} semantic must be a non-empty string when provided.`,
    );
  }
  return semantic.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function validateLayerProposalMetadata(artifact: ViviProviderArtifact): void {
  if (
    artifact.kind !== "maskProposal" &&
    artifact.kind !== "alphaMatte" &&
    artifact.kind !== "underpaint"
  ) {
    return;
  }
  const metadata = artifact.metadata;
  if (!metadata) {
    throw new ViviProviderError(
      "VIVI_PROVIDER_BAD_ARTIFACT",
      `${artifact.kind} artifacts must include metadata.`,
    );
  }
  const expectedSchema =
    artifact.kind === "maskProposal"
      ? "vivi2d.provider.maskProposalMetadata.v1"
      : artifact.kind === "alphaMatte"
        ? "vivi2d.provider.alphaMatteMetadata.v1"
        : "vivi2d.provider.underpaintMetadata.v1";
  if (metadata.schema !== expectedSchema) {
    throw new ViviProviderError(
      "VIVI_PROVIDER_BAD_ARTIFACT",
      `${artifact.kind} metadata schema must be ${expectedSchema}.`,
    );
  }
  const confidence = metadata.confidence;
  if (
    typeof confidence !== "number" ||
    !Number.isFinite(confidence) ||
    confidence < 0 ||
    confidence > 1
  ) {
    throw new ViviProviderError(
      "VIVI_PROVIDER_BAD_ARTIFACT",
      `${artifact.kind} metadata confidence must be in [0, 1].`,
    );
  }
  const provenance = metadata.provenance;
  if (
    provenance !== "source" &&
    provenance !== "user" &&
    provenance !== "providerProposal" &&
    provenance !== "generatedHidden"
  ) {
    throw new ViviProviderError(
      "VIVI_PROVIDER_BAD_ARTIFACT",
      `${artifact.kind} metadata provenance is unsupported.`,
    );
  }
  if (artifact.kind === "underpaint" && provenance !== "generatedHidden") {
    throw new ViviProviderError(
      "VIVI_PROVIDER_BAD_ARTIFACT",
      "Underpaint artifacts must use generatedHidden provenance.",
    );
  }
  if (artifact.kind === "underpaint" && metadata.occludedByArtifactId !== undefined) {
    // Underpaint may refer to an input, output, or host-managed source artifact;
    // validate only the portable identifier format at this SDK boundary.
    assertSafeIdentifier(
      metadata.occludedByArtifactId,
      "underpaint.metadata.occludedByArtifactId",
    );
  }
  if (artifact.kind === "alphaMatte") {
    assertSafeIdentifier(metadata.maskArtifactId, "alphaMatte.metadata.maskArtifactId");
  }
  if (artifact.kind === "maskProposal") {
    const semantic = normalizeLayerProposalSemantic(
      metadata.semantic,
      "maskProposal.metadata",
    );
    if (!isTrustedLayerProposalProvenance(provenance) && !semantic) {
      throw new ViviProviderError(
        "VIVI_PROVIDER_BAD_ARTIFACT",
        "Provider-owned maskProposal artifacts must declare a semantic.",
      );
    }
    if (
      semantic &&
      PROTECTED_LAYER_PROPOSAL_SEMANTICS.has(semantic) &&
      !isTrustedLayerProposalProvenance(provenance)
    ) {
      throw new ViviProviderError(
        "VIVI_PROVIDER_BAD_ARTIFACT",
        `${artifact.kind} artifacts cannot own protected ${semantic} semantics.`,
      );
    }
  }
}

function assertSafeIdentifier(value: unknown, label: string): void {
  assertNonEmptyString(value, label);
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(value)) {
    throw new ViviProviderError(
      "VIVI_PROVIDER_INVALID_REQUEST",
      `${label} must be a safe identifier.`,
    );
  }
}

function assertOpaqueProviderRequestToken(value: unknown, label: string): void {
  assertNonEmptyString(value, label);
  if (!/^[A-Za-z0-9_-]{24,160}$/.test(value)) {
    throw new ViviProviderError(
      "VIVI_PROVIDER_INVALID_REQUEST",
      `${label} must be an opaque random token.`,
    );
  }
  if (/sha256|fingerprint|project|layer|source/i.test(value)) {
    throw new ViviProviderError(
      "VIVI_PROVIDER_INVALID_REQUEST",
      `${label} must not expose source or project identifiers.`,
    );
  }
}

function assertProviderDataClasses(value: unknown, label: string): void {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ViviProviderError(
      "VIVI_PROVIDER_INVALID_REQUEST",
      `${label} must be a non-empty array.`,
    );
  }
  const seen = new Set<string>();
  for (const entry of value) {
    if (
      typeof entry !== "string" ||
      !VIVI_PROVIDER_DATA_CLASSES.includes(entry as ViviProviderDataClass)
    ) {
      throw new ViviProviderError(
        "VIVI_PROVIDER_INVALID_REQUEST",
        `${label} contains an unsupported data class: ${String(entry)}`,
      );
    }
    if (seen.has(entry)) {
      throw new ViviProviderError(
        "VIVI_PROVIDER_INVALID_REQUEST",
        `${label} contains duplicate data class: ${entry}`,
      );
    }
    seen.add(entry);
  }
}

function assertNonEmptyString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ViviProviderError(
      "VIVI_PROVIDER_INVALID_REQUEST",
      `${label} must be a non-empty string.`,
    );
  }
}

function assertPositiveFiniteInteger(value: unknown, label: string): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    !Number.isFinite(value) ||
    value <= 0
  ) {
    throw new ViviProviderError(
      "VIVI_PROVIDER_INVALID_REQUEST",
      `${label} must be a positive finite integer.`,
    );
  }
  return value;
}

function assertProviderLimitCeiling(
  value: unknown,
  label: string,
  key: keyof ViviProviderLimits,
): number {
  const numericValue = assertPositiveFiniteInteger(value, label);
  if (numericValue > MAX_PROVIDER_LIMITS[key]) {
    throw new ViviProviderError(
      "VIVI_PROVIDER_LIMIT_EXCEEDED",
      `${label} exceeds maximum allowed value (${MAX_PROVIDER_LIMITS[key]}).`,
    );
  }
  return numericValue;
}

function assertStringArray(value: unknown, label: string): asserts value is string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new ViviProviderError(
      "VIVI_PROVIDER_INVALID_REQUEST",
      `${label} must be an array of strings.`,
    );
  }
}

function assertJsonObject(
  value: unknown,
  label: string,
): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ViviProviderError(
      "VIVI_PROVIDER_INVALID_REQUEST",
      `${label} must be a JSON object.`,
    );
  }
  try {
    JSON.stringify(value);
  } catch {
    throw new ViviProviderError(
      "VIVI_PROVIDER_INVALID_REQUEST",
      `${label} must be JSON serializable.`,
    );
  }
}

function assertMetadataSize(
  value: Record<string, unknown>,
  maxBytes: number,
  label: string,
): void {
  const bytes = new TextEncoder().encode(JSON.stringify(value)).byteLength;
  if (bytes > maxBytes) {
    throw new ViviProviderError(
      "VIVI_PROVIDER_LIMIT_EXCEEDED",
      `${label} exceeds metadata byte limit (${maxBytes}).`,
    );
  }
}
