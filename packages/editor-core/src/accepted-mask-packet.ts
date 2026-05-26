import type { LayerRiggingHint, LayerSemanticRole } from "@vivi2d/core/types";
import { getMotionSemanticPolicy } from "./motion-template-policy";
import { createStableSha256HexFromBytes } from "./stable-hash";

export const ACCEPTED_MASK_PACKET_LIMITS = Object.freeze({
  maxPixels: 4096 * 4096,
  maxWidth: 4096,
  maxHeight: 4096,
  maxAcceptedMaskResidentBytes: 64 * 1024 * 1024,
  maxAcceptedMaskInflightCopyBytes: 16 * 1024 * 1024,
  maxSourceHashBytesPerPreview: 64 * 1024 * 1024,
  maxTotalAutoSetupPreviewBytes: 96 * 1024 * 1024,
});

export type ScopedSha256<Scope extends string> = `sha256:v1:${Scope}:${string}`;
export type AcceptedMaskAlphaHash = ScopedSha256<"maskAlphaCanonical.v2">;
export type AcceptedMaskPlacementHash = ScopedSha256<"maskPlacementCanonical.v2">;
export type SourceMaskBytesHash = ScopedSha256<"maskSourceCanonical">;
export type ProtectedRegionSetHash = ScopedSha256<"protectedRegionsCanonical">;

export interface CanonicalRational {
  numerator: bigint;
  denominator: bigint;
}

export interface AcceptedMaskRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AcceptedMaskPlacement {
  layerBounds: AcceptedMaskRect;
  maskToLayerTransform: {
    scaleX: CanonicalRational;
    scaleY: CanonicalRational;
    offsetX: CanonicalRational;
    offsetY: CanonicalRational;
  };
}

export interface AcceptedMaskPacket {
  layerId: string;
  manualSplitLayerId: string;
  manualSplitMaskId: string;
  semanticRole: LayerSemanticRole;
  riggingHint: LayerRiggingHint;
  width: number;
  height: number;
  alphaByteLength: number;
  acceptedMaskAlphaHash: AcceptedMaskAlphaHash;
  acceptedMaskPlacementHash: AcceptedMaskPlacementHash;
  sourceMaskBytesHash: SourceMaskBytesHash;
  protectedRegionSetHash: ProtectedRegionSetHash;
  protectedRegionSetRevision: string;
  sourceLayerId: string;
  sourceTextureId?: string;
  sourceLayerRevision: string;
  sourceTextureRevision: string;
  layerPath: readonly string[];
  layerBounds: AcceptedMaskRect;
  maskToLayerTransform: AcceptedMaskPlacement["maskToLayerTransform"];
}

interface RegistryOwnedPacket extends AcceptedMaskPacket {
}

const PACKET_ALPHA = new WeakMap<AcceptedMaskPacket, Uint8Array>();

export type AcceptedMaskPacketDiagnosticCode =
  | "invalidAlpha"
  | "invalidDimensions"
  | "invalidPlacement"
  | "invalidSource"
  | "budgetExceeded"
  | "duplicateLayerId"
  | "duplicateManualSplitMaskId"
  | "duplicateManualSplitLayerId";

export interface AcceptedMaskPacketDiagnostic {
  code: AcceptedMaskPacketDiagnosticCode;
  message: string;
  layerId?: string;
  manualSplitMaskId?: string;
  manualSplitLayerId?: string;
}

export interface AcceptedMaskPacketRegistry {
  byLayerId: ReadonlyMap<string, AcceptedMaskPacket>;
  byManualSplitMaskId: ReadonlyMap<string, AcceptedMaskPacket>;
  byManualSplitLayerId: ReadonlyMap<string, AcceptedMaskPacket>;
  diagnostics: readonly AcceptedMaskPacketDiagnostic[];
  rejected: readonly AcceptedMaskPacketDiagnostic[];
  hasConflicts: boolean;
}

export interface CreateAcceptedMaskPacketInput {
  layerId: string;
  manualSplitLayerId: string;
  manualSplitMaskId: string;
  semanticRole: LayerSemanticRole;
  riggingHint: LayerRiggingHint;
  width: number;
  height: number;
  alpha: Uint8Array | Uint8ClampedArray;
  sourceLayerId: string;
  sourceTextureId?: string;
  sourceLayerRevision?: string;
  sourceTextureRevision?: string;
  layerPath: readonly string[];
  layerBounds: AcceptedMaskRect;
  placement?: AcceptedMaskPlacement;
  sourceFingerprint?: string;
  sourceWidth?: number;
  sourceHeight?: number;
  sourceBytes?: Uint8Array | Uint8ClampedArray;
  protectedRegionSetHash?: ProtectedRegionSetHash;
  protectedRegionSetRevision?: string;
}

export type AcceptedMaskAnalysisKind = "alphaSummary";

export type AcceptedMaskAnalysisOptions<T extends AcceptedMaskAnalysisKind> = Record<string, never>;

export type AcceptedMaskAnalysisResult<T extends AcceptedMaskAnalysisKind> = {
  width: number;
  height: number;
  alphaByteLength: number;
  opaquePixels: number;
  alphaSum: number;
};

const MASK_ALPHA_SCHEMA_VERSION = 2;
const MASK_PLACEMENT_SCHEMA_VERSION = 2;
const MASK_SOURCE_SCHEMA_VERSION = 1;
const PROTECTED_REGION_SCHEMA_VERSION = 1;
const TEXT_ENCODER = new TextEncoder();
const HEX64 = /^[a-f0-9]{64}$/;

export function validateScopedSha256<Scope extends string>(
  value: unknown,
  scope: Scope,
): value is ScopedSha256<Scope> {
  if (typeof value !== "string") return false;
  const prefix = `sha256:v1:${scope}:`;
  if (!value.startsWith(prefix)) return false;
  const digest = value.slice(prefix.length);
  return HEX64.test(digest);
}

export function canonicalRational(
  numerator: number | bigint,
  denominator: number | bigint = 1n,
): CanonicalRational {
  const n = toI64BigInt(numerator, "numerator");
  const d = toU64BigInt(denominator, "denominator");
  if (d <= 0n) throw new Error("Canonical rational denominator must be positive.");
  const divisor = gcd(absBigInt(n), d);
  return Object.freeze({
    numerator: n / divisor,
    denominator: d / divisor,
  });
}

export function createAcceptedMaskPacket(
  input: CreateAcceptedMaskPacketInput,
): { ok: true; packet: AcceptedMaskPacket } | { ok: false; diagnostic: AcceptedMaskPacketDiagnostic } {
  const dimensionDiagnostic = validateDimensions(input.width, input.height);
  if (dimensionDiagnostic) return { ok: false, diagnostic: dimensionDiagnostic };

  const alphaResult = cloneAcceptedMaskAlphaForRegistry(input.alpha, input.width, input.height);
  if (!alphaResult.ok) return { ok: false, diagnostic: alphaResult.diagnostic };

  let placement: AcceptedMaskPlacement;
  try {
    placement = input.placement ?? createDefaultAcceptedMaskPlacement({
      layerBounds: input.layerBounds,
      maskWidth: input.width,
      maskHeight: input.height,
    });
  } catch {
    return {
      ok: false,
      diagnostic: {
        code: "invalidPlacement",
        message: "Accepted mask placement must be axis-aligned rational scale and offset.",
        layerId: input.layerId,
        manualSplitLayerId: input.manualSplitLayerId,
        manualSplitMaskId: input.manualSplitMaskId,
      },
    };
  }
  if (!validateAcceptedMaskPlacement(placement)) {
    return {
      ok: false,
      diagnostic: {
        code: "invalidPlacement",
        message: "Accepted mask placement must be axis-aligned rational scale and offset.",
        layerId: input.layerId,
        manualSplitLayerId: input.manualSplitLayerId,
        manualSplitMaskId: input.manualSplitMaskId,
      },
    };
  }

  const semanticPolicy = getMotionSemanticPolicy(input.semanticRole);
  const protectedRegionSetHash =
    input.protectedRegionSetHash ??
    createProtectedRegionSetHash({
      semanticPolicyId: semanticPolicy.policyId,
      semanticPolicyVersion: semanticPolicy.policyVersion,
      protectedRegionSetRevision: input.protectedRegionSetRevision ?? "unversioned",
      regions: [],
    });
  if (!input.sourceBytes) {
    return {
      ok: false,
      diagnostic: {
        code: "invalidSource",
        message: "Accepted mask packet requires editor-owned source texture bytes.",
        layerId: input.layerId,
        manualSplitLayerId: input.manualSplitLayerId,
        manualSplitMaskId: input.manualSplitMaskId,
      },
    };
  }
  const sourceWidth = input.sourceWidth ?? input.width;
  const sourceHeight = input.sourceHeight ?? input.height;
  const sourceBytesResult = cloneSourceTextureBytesForRegistry(
    input.sourceBytes,
    sourceWidth,
    sourceHeight,
  );
  if (!sourceBytesResult.ok) {
    return { ok: false, diagnostic: sourceBytesResult.diagnostic };
  }
  const sourceBytes = sourceBytesResult.alpha;
  let sourceMaskBytesHash: SourceMaskBytesHash;
  try {
    sourceMaskBytesHash = createSourceMaskBytesHash({
      sourceLayerId: input.sourceLayerId,
      sourceTextureId: input.sourceTextureId,
      width: sourceWidth,
      height: sourceHeight,
      sourceFingerprint: input.sourceFingerprint,
      bytes: sourceBytes,
    });
  } catch {
    return {
      ok: false,
      diagnostic: {
        code: "invalidSource",
        message: "Accepted mask packet requires source bytes or a non-empty source fingerprint.",
        layerId: input.layerId,
        manualSplitLayerId: input.manualSplitLayerId,
        manualSplitMaskId: input.manualSplitMaskId,
      },
    };
  }

  const packetDescriptor: Omit<RegistryOwnedPacket, "alpha"> = {
    layerId: input.layerId,
    manualSplitLayerId: input.manualSplitLayerId,
    manualSplitMaskId: input.manualSplitMaskId,
    semanticRole: input.semanticRole,
    riggingHint: input.riggingHint,
    width: input.width,
    height: input.height,
    alphaByteLength: alphaResult.alpha.byteLength,
    acceptedMaskAlphaHash: createAcceptedMaskAlphaHash({
      width: input.width,
      height: input.height,
      semanticRole: input.semanticRole,
      manualSplitMaskId: input.manualSplitMaskId,
      sourceLayerId: input.sourceLayerId,
      sourceTextureId: input.sourceTextureId,
      layerPath: input.layerPath,
      alpha: alphaResult.alpha,
    }),
    acceptedMaskPlacementHash: createAcceptedMaskPlacementHash({
      manualSplitLayerId: input.manualSplitLayerId,
      sourceLayerId: input.sourceLayerId,
      layerPath: input.layerPath,
      placement,
    }),
    sourceMaskBytesHash,
    protectedRegionSetHash,
    protectedRegionSetRevision: input.protectedRegionSetRevision ?? "unversioned",
    sourceLayerId: input.sourceLayerId,
    sourceTextureId: input.sourceTextureId,
    sourceLayerRevision: input.sourceLayerRevision ?? "unversioned",
    sourceTextureRevision: input.sourceTextureRevision ?? "unversioned",
    layerPath: Object.freeze([...input.layerPath]),
    layerBounds: Object.freeze({ ...input.layerBounds }),
    maskToLayerTransform: Object.freeze({
      scaleX: placement.maskToLayerTransform.scaleX,
      scaleY: placement.maskToLayerTransform.scaleY,
      offsetX: placement.maskToLayerTransform.offsetX,
      offsetY: placement.maskToLayerTransform.offsetY,
    }),
  };
  Object.defineProperty(packetDescriptor, "toJSON", {
    value: () => ({
      kind: "acceptedMaskPacket",
      layerId: input.layerId,
      manualSplitLayerId: input.manualSplitLayerId,
      manualSplitMaskId: input.manualSplitMaskId,
      semanticRole: input.semanticRole,
      width: input.width,
      height: input.height,
      alphaByteLength: alphaResult.alpha.byteLength,
      redacted: true,
    }),
    enumerable: false,
    writable: false,
    configurable: false,
  });
  const packet = Object.freeze(packetDescriptor as RegistryOwnedPacket);
  PACKET_ALPHA.set(packet, alphaResult.alpha);
  return { ok: true, packet };
}

export function createAcceptedMaskPacketRegistry(
  inputs: readonly CreateAcceptedMaskPacketInput[],
): AcceptedMaskPacketRegistry {
  const diagnostics: AcceptedMaskPacketDiagnostic[] = [];
  const packetResults = inputs.map((input) => {
    const result = createAcceptedMaskPacket(input);
    if (!result.ok) diagnostics.push(result.diagnostic);
    return result;
  });
  const packets = packetResults.flatMap((result) => (result.ok ? [result.packet] : []));
  const rejected = [...diagnostics];
  const duplicateLayerIds = findDuplicateValues(packets, (packet) => packet.layerId);
  const duplicateMaskIds = findDuplicateValues(packets, (packet) => packet.manualSplitMaskId);
  const duplicateSplitLayerIds = findDuplicateValues(
    packets,
    (packet) => packet.manualSplitLayerId,
  );
  const rejectedPackets = new Set<AcceptedMaskPacket>();
  for (const packet of packets) {
    if (duplicateLayerIds.has(packet.layerId)) {
      rejectedPackets.add(packet);
      rejected.push(duplicateDiagnostic("duplicateLayerId", packet));
    }
    if (duplicateMaskIds.has(packet.manualSplitMaskId)) {
      rejectedPackets.add(packet);
      rejected.push(duplicateDiagnostic("duplicateManualSplitMaskId", packet));
    }
    if (duplicateSplitLayerIds.has(packet.manualSplitLayerId)) {
      rejectedPackets.add(packet);
      rejected.push(duplicateDiagnostic("duplicateManualSplitLayerId", packet));
    }
  }

  const acceptedPackets = packets.filter((packet) => !rejectedPackets.has(packet));
  return Object.freeze({
    byLayerId: Object.freeze(new Map(acceptedPackets.map((packet) => [packet.layerId, packet]))),
    byManualSplitMaskId: Object.freeze(
      new Map(acceptedPackets.map((packet) => [packet.manualSplitMaskId, packet])),
    ),
    byManualSplitLayerId: Object.freeze(
      new Map(acceptedPackets.map((packet) => [packet.manualSplitLayerId, packet])),
    ),
    diagnostics: Object.freeze(diagnostics),
    rejected: Object.freeze(rejected),
    hasConflicts: duplicateLayerIds.size > 0 || duplicateMaskIds.size > 0 || duplicateSplitLayerIds.size > 0,
  });
}

export function createAcceptedMaskAlphaHash(input: {
  width: number;
  height: number;
  semanticRole: LayerSemanticRole;
  manualSplitMaskId: string;
  sourceLayerId: string;
  sourceTextureId?: string;
  layerPath: readonly string[];
  alpha: Uint8Array;
}): AcceptedMaskAlphaHash {
  return scopedSha256("maskAlphaCanonical.v2", encodeTlv(MASK_ALPHA_SCHEMA_VERSION, [
    stringField(1, "maskAlphaCanonical.v2"),
    uint32Field(2, input.width),
    uint32Field(3, input.height),
    stringField(4, input.semanticRole),
    stringField(5, input.manualSplitMaskId),
    stringField(6, input.sourceLayerId),
    stringField(7, input.sourceTextureId ?? ""),
    stringArrayField(8, input.layerPath),
    bytesField(9, input.alpha),
  ]));
}

export function createAcceptedMaskPlacementHash(input: {
  manualSplitLayerId: string;
  sourceLayerId: string;
  layerPath: readonly string[];
  placement: AcceptedMaskPlacement;
}): AcceptedMaskPlacementHash {
  return scopedSha256("maskPlacementCanonical.v2", encodeTlv(MASK_PLACEMENT_SCHEMA_VERSION, [
    stringField(1, "maskPlacementCanonical.v2"),
    stringField(2, input.manualSplitLayerId),
    stringField(3, input.sourceLayerId),
    stringArrayField(4, input.layerPath),
    int32Field(5, input.placement.layerBounds.x),
    int32Field(6, input.placement.layerBounds.y),
    int32Field(7, input.placement.layerBounds.width),
    int32Field(8, input.placement.layerBounds.height),
    rationalField(9, input.placement.maskToLayerTransform.scaleX),
    rationalField(10, input.placement.maskToLayerTransform.scaleY),
    rationalField(11, input.placement.maskToLayerTransform.offsetX),
    rationalField(12, input.placement.maskToLayerTransform.offsetY),
  ]));
}

export function createSourceMaskBytesHash(input: {
  sourceLayerId: string;
  sourceTextureId?: string;
  width: number;
  height: number;
  sourceFingerprint?: string;
  bytes?: Uint8Array;
}): SourceMaskBytesHash {
  if (!input.bytes && (!input.sourceFingerprint || input.sourceFingerprint.trim() === "")) {
    throw new Error("Source mask hash requires source bytes or a source fingerprint.");
  }
  if (input.bytes && input.bytes.byteLength !== input.width * input.height * 4) {
    throw new Error("Source mask hash bytes must be RGBA texture bytes.");
  }
  // Packet construction passes source-canvas RGBA bytes. Legacy review-path
  // fallback callers may pass only a source fingerprint; those hashes are
  // accepted as review/compat hints but are not registry-owned source bytes.
  return scopedSha256("maskSourceCanonical", encodeTlv(MASK_SOURCE_SCHEMA_VERSION, [
    stringField(1, "maskSourceCanonical"),
    stringField(2, input.sourceLayerId),
    stringField(3, input.sourceTextureId ?? ""),
    uint32Field(4, input.width),
    uint32Field(5, input.height),
    stringField(6, input.sourceFingerprint ?? ""),
    bytesField(7, input.bytes ?? new Uint8Array()),
  ]));
}

export function createProtectedRegionSetHash(input: {
  semanticPolicyId: string;
  semanticPolicyVersion: number;
  protectedRegionSetRevision: string;
  regions: readonly {
    id: string;
    role: LayerSemanticRole;
    bounds: AcceptedMaskRect;
    cropGeneration?: number;
  }[];
}): ProtectedRegionSetHash {
  const sorted = [...input.regions].sort((a, b) => a.id.localeCompare(b.id));
  return scopedSha256("protectedRegionsCanonical", encodeTlv(PROTECTED_REGION_SCHEMA_VERSION, [
    stringField(1, "protectedRegionsCanonical"),
    stringField(2, input.semanticPolicyId),
    uint32Field(3, input.semanticPolicyVersion),
    stringField(4, input.protectedRegionSetRevision),
    uint32Field(5, sorted.length),
    ...sorted.flatMap((region, index) => [
      uint32Field(10, index),
      stringField(11, region.id),
      stringField(12, region.role),
      int32Field(13, region.bounds.x),
      int32Field(14, region.bounds.y),
      int32Field(15, region.bounds.width),
      int32Field(16, region.bounds.height),
      uint32Field(17, region.cropGeneration ?? 0),
    ]),
  ]));
}

export function analyzeAcceptedMaskPacket<T extends AcceptedMaskAnalysisKind>(
  packet: AcceptedMaskPacket,
  kind: T,
  options: AcceptedMaskAnalysisOptions<T>,
): AcceptedMaskAnalysisResult<T> {
  const alpha = PACKET_ALPHA.get(packet);
  if (!alpha) throw new Error("Accepted mask packet alpha storage is unavailable.");
  void kind;
  void options;
  let opaquePixels = 0;
  let alphaSum = 0;
  for (const value of alpha) {
    alphaSum += value;
    if (value > 0) opaquePixels += 1;
  }
  return {
    width: packet.width,
    height: packet.height,
    alphaByteLength: alpha.byteLength,
    opaquePixels,
    alphaSum,
  } as AcceptedMaskAnalysisResult<T>;
}

export function createDefaultAcceptedMaskPlacement(input: {
  layerBounds: AcceptedMaskRect;
  maskWidth: number;
  maskHeight: number;
}): AcceptedMaskPlacement {
  return Object.freeze({
    layerBounds: Object.freeze({ ...input.layerBounds }),
    maskToLayerTransform: Object.freeze({
      scaleX: canonicalRational(input.layerBounds.width, input.maskWidth),
      scaleY: canonicalRational(input.layerBounds.height, input.maskHeight),
      offsetX: canonicalRational(input.layerBounds.x),
      offsetY: canonicalRational(input.layerBounds.y),
    }),
  });
}

function cloneAcceptedMaskAlphaForRegistry(
  alpha: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
):
  | { ok: true; alpha: Uint8Array }
  | { ok: false; diagnostic: AcceptedMaskPacketDiagnostic } {
  const invalid = (message: string): { ok: false; diagnostic: AcceptedMaskPacketDiagnostic } => ({
    ok: false,
    diagnostic: { code: "invalidAlpha", message },
  });
  if (!(alpha instanceof Uint8Array) && !(alpha instanceof Uint8ClampedArray)) {
    return invalid("Accepted mask alpha must be a single-channel Uint8 view.");
  }
  try {
    const buffer = alpha.buffer;
    if (typeof SharedArrayBuffer !== "undefined" && buffer instanceof SharedArrayBuffer) {
      return invalid("SharedArrayBuffer-backed alpha is not accepted.");
    }
    if (isResizableOrGrowableArrayBuffer(buffer)) {
      return invalid("Resizable ArrayBuffer-backed alpha is not accepted.");
    }
    const pixels = width * height;
    if (alpha.byteLength !== pixels) {
      return invalid("Accepted mask alpha byte length must equal width * height.");
    }
    if (pixels > ACCEPTED_MASK_PACKET_LIMITS.maxAcceptedMaskInflightCopyBytes) {
      return {
        ok: false,
        diagnostic: {
          code: "budgetExceeded",
          message: "Accepted mask alpha exceeds the in-flight copy budget.",
        },
      };
    }
    const owned = new Uint8Array(pixels);
    owned.set(alpha);
    return { ok: true, alpha: owned };
  } catch {
    return invalid("Accepted mask alpha buffer could not be read.");
  }
}

function cloneSourceTextureBytesForRegistry(
  bytes: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
):
  | { ok: true; alpha: Uint8Array }
  | { ok: false; diagnostic: AcceptedMaskPacketDiagnostic } {
  const invalid = (message: string): { ok: false; diagnostic: AcceptedMaskPacketDiagnostic } => ({
    ok: false,
    diagnostic: { code: "invalidSource", message },
  });
  if (!(bytes instanceof Uint8Array) && !(bytes instanceof Uint8ClampedArray)) {
    return invalid("Source texture bytes must be a Uint8 RGBA view.");
  }
  try {
    const buffer = bytes.buffer;
    if (typeof SharedArrayBuffer !== "undefined" && buffer instanceof SharedArrayBuffer) {
      return invalid("SharedArrayBuffer-backed source texture bytes are not accepted.");
    }
    if (isResizableOrGrowableArrayBuffer(buffer)) {
      return invalid("Resizable ArrayBuffer-backed source texture bytes are not accepted.");
    }
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
      return invalid("Source texture dimensions must be positive safe integers.");
    }
    if (
      width > ACCEPTED_MASK_PACKET_LIMITS.maxWidth ||
      height > ACCEPTED_MASK_PACKET_LIMITS.maxHeight ||
      width * height > ACCEPTED_MASK_PACKET_LIMITS.maxPixels ||
      bytes.byteLength !== width * height * 4
    ) {
      return invalid("Source texture bytes exceed limits or do not match RGBA dimensions.");
    }
    if (bytes.byteLength > ACCEPTED_MASK_PACKET_LIMITS.maxSourceHashBytesPerPreview) {
      return {
        ok: false,
        diagnostic: {
          code: "budgetExceeded",
          message: "Source texture bytes exceed the source hash budget.",
        },
      };
    }
    const owned = new Uint8Array(bytes.byteLength);
    owned.set(bytes);
    return { ok: true, alpha: owned };
  } catch {
    return invalid("Source texture bytes could not be read.");
  }
}

function validateDimensions(
  width: number,
  height: number,
): AcceptedMaskPacketDiagnostic | undefined {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return {
      code: "invalidDimensions",
      message: "Accepted mask dimensions must be positive safe integers.",
    };
  }
  if (
    width > ACCEPTED_MASK_PACKET_LIMITS.maxWidth ||
    height > ACCEPTED_MASK_PACKET_LIMITS.maxHeight ||
    width * height > ACCEPTED_MASK_PACKET_LIMITS.maxPixels ||
    width * height > ACCEPTED_MASK_PACKET_LIMITS.maxAcceptedMaskResidentBytes
  ) {
    return {
      code: "budgetExceeded",
      message: "Accepted mask dimensions exceed the registry budget.",
    };
  }
  return undefined;
}

function validateAcceptedMaskPlacement(placement: AcceptedMaskPlacement): boolean {
  const { layerBounds, maskToLayerTransform } = placement;
  return (
    isIntegerRect(layerBounds) &&
    isCanonicalRational(maskToLayerTransform.scaleX) &&
    isCanonicalRational(maskToLayerTransform.scaleY) &&
    isCanonicalRational(maskToLayerTransform.offsetX) &&
    isCanonicalRational(maskToLayerTransform.offsetY) &&
    maskToLayerTransform.scaleX.numerator > 0n &&
    maskToLayerTransform.scaleY.numerator > 0n
  );
}

function isIntegerRect(rect: AcceptedMaskRect): boolean {
  return (
    Number.isSafeInteger(rect.x) &&
    Number.isSafeInteger(rect.y) &&
    Number.isSafeInteger(rect.width) &&
    Number.isSafeInteger(rect.height) &&
    rect.width > 0 &&
    rect.height > 0
  );
}

function isCanonicalRational(value: CanonicalRational): boolean {
  return (
    typeof value.numerator === "bigint" &&
    typeof value.denominator === "bigint" &&
    value.denominator > 0n &&
    gcd(absBigInt(value.numerator), value.denominator) === 1n &&
    value.numerator >= -(2n ** 63n) &&
    value.numerator <= 2n ** 63n - 1n &&
    value.denominator <= 2n ** 64n - 1n
  );
}

function scopedSha256<Scope extends string>(scope: Scope, bytes: Uint8Array): ScopedSha256<Scope> {
  return `sha256:v1:${scope}:${createStableSha256HexFromBytes(bytes)}`;
}

interface TlvField {
  tag: number;
  bytes: Uint8Array;
}

function encodeTlv(schemaVersion: number, fields: readonly TlvField[]): Uint8Array {
  const header = new Uint8Array(8);
  writeUint32(header, 0, schemaVersion);
  writeUint32(header, 4, fields.length);
  const totalLength =
    header.byteLength +
    fields.reduce((sum, field) => sum + 1 + 4 + field.bytes.byteLength, 0);
  const output = new Uint8Array(totalLength);
  output.set(header);
  let offset = header.byteLength;
  for (const field of fields) {
    output[offset] = field.tag;
    writeUint32(output, offset + 1, field.bytes.byteLength);
    output.set(field.bytes, offset + 5);
    offset += 5 + field.bytes.byteLength;
  }
  return output;
}

function stringField(tag: number, value: string): TlvField {
  return { tag, bytes: TEXT_ENCODER.encode(value.normalize("NFC")) };
}

function stringArrayField(tag: number, values: readonly string[]): TlvField {
  return {
    tag,
    bytes: encodeTlv(1, values.map((value) => stringField(1, value))),
  };
}

function bytesField(tag: number, bytes: Uint8Array): TlvField {
  return { tag, bytes };
}

function uint32Field(tag: number, value: number): TlvField {
  const bytes = new Uint8Array(4);
  writeUint32(bytes, 0, value);
  return { tag, bytes };
}

function int32Field(tag: number, value: number): TlvField {
  const bytes = new Uint8Array(4);
  writeUint32(bytes, 0, value >>> 0);
  return { tag, bytes };
}

function rationalField(tag: number, value: CanonicalRational): TlvField {
  const bytes = new Uint8Array(16);
  writeInt64(bytes, 0, value.numerator);
  writeUint64(bytes, 8, value.denominator);
  return { tag, bytes };
}

function writeUint32(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

function writeInt64(bytes: Uint8Array, offset: number, value: bigint): void {
  writeUint64(bytes, offset, BigInt.asUintN(64, value));
}

function writeUint64(bytes: Uint8Array, offset: number, value: bigint): void {
  for (let i = 7; i >= 0; i -= 1) {
    bytes[offset + i] = Number(value & 0xffn);
    value >>= 8n;
  }
}

function isResizableOrGrowableArrayBuffer(buffer: ArrayBufferLike): boolean {
  const candidate = buffer as ArrayBuffer & {
    readonly resizable?: boolean;
    readonly growable?: boolean;
    readonly maxByteLength?: number;
  };
  return (
    candidate.resizable === true ||
    candidate.growable === true ||
    (typeof candidate.maxByteLength === "number" && candidate.maxByteLength !== candidate.byteLength)
  );
}

function duplicateDiagnostic(
  code: Extract<
    AcceptedMaskPacketDiagnosticCode,
    "duplicateLayerId" | "duplicateManualSplitMaskId" | "duplicateManualSplitLayerId"
  >,
  packet: AcceptedMaskPacket,
): AcceptedMaskPacketDiagnostic {
  return {
    code,
    message: "Accepted mask packet identity collision rejected.",
    layerId: packet.layerId,
    manualSplitLayerId: packet.manualSplitLayerId,
    manualSplitMaskId: packet.manualSplitMaskId,
  };
}

function findDuplicateValues(
  packets: readonly AcceptedMaskPacket[],
  getValue: (packet: AcceptedMaskPacket) => string,
): Set<string> {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const packet of packets) {
    const value = getValue(packet);
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return duplicates;
}

function toI64BigInt(value: number | bigint, label: string): bigint {
  const bigintValue = typeof value === "bigint" ? value : numberToBigInt(value, label);
  if (bigintValue < -(2n ** 63n) || bigintValue > 2n ** 63n - 1n) {
    throw new Error(`Canonical rational ${label} is outside i64 range.`);
  }
  return bigintValue;
}

function toU64BigInt(value: number | bigint, label: string): bigint {
  const bigintValue = typeof value === "bigint" ? value : numberToBigInt(value, label);
  if (bigintValue < 0n || bigintValue > 2n ** 64n - 1n) {
    throw new Error(`Canonical rational ${label} is outside u64 range.`);
  }
  return bigintValue;
}

function numberToBigInt(value: number, label: string): bigint {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`Canonical rational ${label} must be a safe integer.`);
  }
  return BigInt(value);
}

function gcd(a: bigint, b: bigint): bigint {
  while (b !== 0n) {
    const next = a % b;
    a = b;
    b = next;
  }
  return a === 0n ? 1n : a;
}

function absBigInt(value: bigint): bigint {
  return value < 0n ? -value : value;
}
