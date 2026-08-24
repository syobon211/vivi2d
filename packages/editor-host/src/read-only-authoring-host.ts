import {
  buildEvaluationPayload,
  type EvaluationPayloadBuildResultV1,
  type ResolvedAuthoringProjectV1,
  type ResolvedEvaluationAtlasV1,
  VIVI_EVAL_V1_MAX_TOTAL_TEXTURE_BYTES,
  VIVI_EVALUATION_V1_TEXTURE_LIMITS,
  type ViviAssetRefV1,
} from "@vivi2d/model/internal/evaluation-payload-v1";
import {
  type ExtensionRegistryEntryV11,
  type ExtensionRegistryV11,
  type NormalizedViviFileDataV11,
  type ParsedProjectFormatV11,
  type ProjectAssetModeV11,
  type ProjectCompatibilityV11,
  parseProjectFormatV11Json,
  parseProjectFormatV11Utf8,
  type Sha256V11,
  serializeProjectFormatV11LocalDuplicate,
  type ViviRequiredCapabilityV11,
} from "@vivi2d/model/internal/project-format-v11";

const PNG_PROFILE_V1 = "vivi2d.png.rgba8.v1" as const;
const SHA256_PATTERN = /^[A-Fa-f0-9]{64}$/;
const CAPABILITY_ID_PATTERN = /^vivi\.cap\.[a-z][a-zA-Z0-9]*$/;
const MAX_EMBEDDED_BLOB_BYTES = 16 * 1024 * 1024;
const MAX_CHUNK_MANIFEST_BYTES = 64 * 1024 * 1024 * 1024;
const MAX_ATLASES = 32;
const KNOWN_CAUSE_CODES = new Set<string>([
  "unknownPublicField",
  "forbiddenPublicFeature",
  "invalidSemanticValue",
  "VIVI_FMT_JSON_TOO_LARGE",
  "VIVI_FMT_INVALID_JSON",
  "VIVI_FMT_DUPLICATE_MAP_KEY",
  "VIVI_FMT_DEPTH_EXCEEDED",
  "VIVI_FMT_TOKEN_LIMIT_EXCEEDED",
  "VIVI_FMT_STRING_TOO_LARGE",
  "VIVI_FMT_UNICODE_SCALAR_INVALID",
  "VIVI_FMT_INT_PRECISION_LOSS",
  "VIVI_FMT_EXTENSION_CANONICAL_SIZE_EXCEEDED",
  "VIVI_FMT_EXTENSION_WITHOUT_CAPABILITY",
  "VIVI_FMT_UNREGISTERED_EXTENSION",
  "VIVI_FMT_REQUIRES_MISMATCH",
  "VIVI_FMT_DANGLING_BLOB_REF",
  "VIVI_FMT_ORPHAN_EMBEDDED_ASSET",
  "VIVI_FMT_MIXED_ASSET_MODE",
  "VIVI_FMT_ASSET_HASH_MISMATCH",
  "VIVI_FMT_ATLAS_ID_INVALID",
  "VIVI_FMT_DUPLICATE_ATLAS_ID",
  "VIVI_FMT_DUPLICATE_REQUIRES_ID",
  "VIVI_FMT_ASSET_REF_INVALID",
  "VIVI_FMT_SERIALIZE_FORBIDDEN",
  "VIVI_FMT_SELF_CHECK_FAILED",
  "VIVI_ERR_EVALUATION_PAYLOAD",
  "VIVI_ERR_EVALUATION_FORBIDDEN",
  "VIVI_ERR_EVALUATION_FORBIDDEN_STATE",
  "VIVI_ERR_LIMIT_EXCEEDED",
  "VIVI_ASSET_CHUNK_MISSING",
  "VIVI_ASSET_CONTENT_HASH_MISMATCH",
  "VIVI_ASSET_DECODE_MALFORMED",
  "VIVI_ASSET_DECODING_PROFILE_UNSUPPORTED",
  "VIVI_ASSET_DELETED_OBJECT_REF",
  "VIVI_ASSET_DESCRIPTOR_MISMATCH",
  "VIVI_ASSET_DIMENSION_MISMATCH",
  "VIVI_ASSET_HASH_MISMATCH",
  "VIVI_ASSET_LIMIT_EXCEEDED",
  "VIVI_ASSET_MANIFEST_INVALID",
  "VIVI_ASSET_MEDIA_TYPE_MISMATCH",
  "VIVI_ASSET_REF_SET_MISMATCH",
  "VIVI_ASSET_SIZE_MISMATCH",
  "VIVI_ASSET_TOO_LARGE_FOR_EMBED",
  "VIVI_ASSET_UNSUPPORTED_KIND",
  "VIVI_ASSET_UPLOAD_EXPIRED",
  "VIVI_ASSET_WRITE_IN_PROGRESS",
  "VIVI_ASSET_WRITE_LEASE_LOST",
]);
const ASSET_REF_KEYS = [
  "objectAddress",
  "storageKind",
  "contentSha256",
  "mediaType",
  "sizeBytes",
] as const;

/** JSON-bridge-safe request. The host owns the object passed to the port. */
export interface EmbeddedAtlasMaterializationRequestV1 {
  kind: "embedded";
  atlasId: string;
  imageBase64: string;
  declaredWidth: number;
  declaredHeight: number;
}

/** JSON-bridge-safe request. The host owns the nested reference passed to the port. */
export interface ReferencedAtlasResolutionRequestV1 {
  kind: "referenced";
  atlasId: string;
  reference: ViviAssetRefV1;
  declaredWidth: number;
  declaredHeight: number;
}

/**
 * Port attestation for an atlas that is ready for Evaluation Payload v1.
 *
 * The port must inspect the actual logical PNG bytes, verify the frozen
 * `vivi2d.png.rgba8.v1` subset (including structure/CRC/zlib), verify the
 * content hash, and verify decoded dimensions. For referenced assets the
 * resolver additionally owns descriptor/manifest/chunk closure resolution.
 * The host independently rechecks this DTO, declared dimensions, reference
 * equality, and (for embedded input) decoded source length and SHA-256.
 */
export interface VerifiedAtlasAssetV1 {
  asset: ViviAssetRefV1;
  png: {
    profile: typeof PNG_PROFILE_V1;
    width: number;
    height: number;
  };
}

/**
 * `missing` is reserved for an absent top-level object or a temporarily
 * materializing/restoring object. Deleted/tombstoned objects and missing
 * manifest chunks are hard port errors (`VIVI_ASSET_DELETED_OBJECT_REF` and
 * `VIVI_ASSET_CHUNK_MISSING`), never readiness-missing results.
 */
export type ReferencedAtlasResolutionV1 =
  | { status: "ready"; verified: VerifiedAtlasAssetV1 }
  | { status: "missing" };

export type EmbeddedAtlasMaterializerV1 = (
  request: EmbeddedAtlasMaterializationRequestV1,
) => Promise<VerifiedAtlasAssetV1> | VerifiedAtlasAssetV1;

export type ReferencedAtlasResolverV1 = (
  request: ReferencedAtlasResolutionRequestV1,
) => Promise<ReferencedAtlasResolutionV1> | ReferencedAtlasResolutionV1;

export interface ReadOnlyAuthoringHostOptions {
  registry: ExtensionRegistryV11;
  /**
   * End-to-end capabilities, not merely installed ports. In particular,
   * `vivi.cap.referencedAssets@1` may be advertised only when resolution,
   * manifest/chunk closure, strict PNG verification, and the downstream
   * texture upload/runtime path are all implemented for this host principal.
   */
  supportedCapabilities: ReadonlyMap<string, number>;
  sha256: Sha256V11;
  materializeEmbeddedAtlas: EmbeddedAtlasMaterializerV1;
  resolveReferencedAtlas: ReferencedAtlasResolverV1;
}

export type AssetReadinessStateV1 = "ready" | "missing" | "notChecked";

export interface AssetReadinessV1 {
  /**
   * Immutable init-time runtime-atlas attestation only. Extension blobRefs are
   * edit-only and excluded. This is not a storage lease/pin; a missing session
   * never refreshes in place, and callers must re-init after assets arrive.
   * A later texture consumer must re-resolve/hash or use a resolver-layer pin.
   */
  state: AssetReadinessStateV1;
  missingAtlasIds: string[];
}

export interface MissingAuthoringRequirementV1 {
  id: string;
  minVersion: number;
  supportedVersion: number | null;
  requiredFor: Array<"render" | "edit">;
}

export interface ReadOnlyAuthoringGuardsV1 {
  canRuntime: boolean;
  canLocalDuplicate: boolean;
  canEdit: false;
  canUndo: false;
  canRedo: false;
  canOrdinarySave: false;
  canPublicExport: false;
}

interface AuthoringSnapshotMetadataV1 {
  /**
   * Allocated when initJson/initUtf8 is invoked, before asynchronous work.
   * Failed requests consume a value so an older completion can never sort
   * after a later request.
   */
  requestGeneration: number;
  sourceVersion: NormalizedViviFileDataV11["version"];
  profile?: "publicProfileV1";
  compatibility: ProjectCompatibilityV11;
  assetMode: ProjectAssetModeV11;
  assetReadiness: AssetReadinessV1;
  derivedRequirements: ViviRequiredCapabilityV11[];
  missingRequirements: MissingAuthoringRequirementV1[];
  opaqueExtensionIds: string[];
  runtimeState: "ready" | "failed" | "blockedAssets" | "unsupported" | "forbidden";
  runtimeFailure: {
    causeCode: string | null;
    causePath: string | null;
    causeStage: string | null;
    causeOffset: number | null;
  } | null;
  guards: ReadOnlyAuthoringGuardsV1;
}

export interface RenderCapableAuthoringSnapshotV1 extends AuthoringSnapshotMetadataV1 {
  compatibility: "full" | "readOnly";
  assetReadiness: AssetReadinessV1;
}

export interface InvalidAuthoringSnapshotV1 extends AuthoringSnapshotMetadataV1 {
  compatibility: "invalid";
  assetReadiness: AssetReadinessV1 & { state: "notChecked" };
}

export type ReadOnlyAuthoringSnapshotV1 =
  | RenderCapableAuthoringSnapshotV1
  | InvalidAuthoringSnapshotV1;

export interface ReadOnlyAuthoringHostInitResultV1 {
  sessionId: string;
  snapshot: ReadOnlyAuthoringSnapshotV1;
}

export type ReadOnlyAuthoringHostErrorCode =
  | "VIVI_EDITOR_HOST_CONFIGURATION_INVALID"
  | "VIVI_EDITOR_HOST_INIT_FAILED"
  | "VIVI_EDITOR_HOST_ASSET_MATERIALIZATION_FAILED"
  | "VIVI_EDITOR_HOST_ASSET_RESOLUTION_FAILED"
  | "VIVI_EDITOR_HOST_ASSET_RESULT_INVALID"
  | "VIVI_EDITOR_HOST_SESSION_UNKNOWN"
  | "VIVI_EDITOR_HOST_SESSION_DISPOSED"
  | "VIVI_EDITOR_HOST_LEGACY_RUNTIME_UNSUPPORTED"
  | "VIVI_EDITOR_HOST_LOCAL_DUPLICATE_FORBIDDEN"
  | "VIVI_EDITOR_HOST_ASSETS_NOT_READY"
  | "VIVI_EDITOR_HOST_RUNTIME_PAYLOAD_FAILED"
  | "VIVI_EDITOR_HOST_LOCAL_DUPLICATE_FAILED";

interface HostErrorOptions {
  cause?: unknown;
  path?: string;
  causeCode?: string;
  causeStage?: string;
  causeOffset?: number;
  atlasId?: string;
}

export class ReadOnlyAuthoringHostError extends Error {
  readonly code: ReadOnlyAuthoringHostErrorCode;
  readonly path: string | null;
  readonly causePath: string | null;
  readonly causeCode: string | null;
  readonly causeStage: string | null;
  readonly causeOffset: number | null;
  readonly atlasId: string | null;

  constructor(
    code: ReadOnlyAuthoringHostErrorCode,
    message: string,
    options: HostErrorOptions = {},
  ) {
    super(message);
    this.name = "ReadOnlyAuthoringHostError";
    this.code = code;
    const cause = readCauseMetadata(options.cause);
    this.path = options.path ?? cause.path;
    this.causePath = this.path;
    this.causeCode = options.causeCode ?? cause.code;
    this.causeStage = options.causeStage ?? cause.stage;
    this.causeOffset = options.causeOffset ?? cause.offset;
    this.atlasId = options.atlasId ?? null;
  }
}

export interface ReadOnlyAuthoringHost {
  initJson(source: string): Promise<ReadOnlyAuthoringHostInitResultV1>;
  initUtf8(bytes: Uint8Array): Promise<ReadOnlyAuthoringHostInitResultV1>;
  getSnapshot(sessionId: string): ReadOnlyAuthoringSnapshotV1;
  serializeLocalDuplicate(sessionId: string): string;
  buildRuntimePayload(sessionId: string): ReadOnlyRuntimePayloadV1;
  dispose(sessionId: string): void;
}

export interface ReadOnlyRuntimePayloadV1 extends EvaluationPayloadBuildResultV1 {
  requestGeneration: number;
}

interface SessionRecord {
  /** Exact object returned by the approved codec; never crosses the host boundary. */
  document: ParsedProjectFormatV11;
  snapshot: ReadOnlyAuthoringSnapshotV1;
  resolvedAtlases: Array<ResolvedEvaluationAtlasV1 | null> | null;
  cachedRuntime: EvaluationPayloadBuildResultV1 | null;
  cachedRuntimeFailure: SanitizedCauseMetadata | null;
}

interface StoredHostOptions {
  registry: ExtensionRegistryV11;
  supportedCapabilities: ReadonlyMap<string, number>;
  sha256: Sha256V11;
  materializeEmbeddedAtlas: EmbeddedAtlasMaterializerV1;
  resolveReferencedAtlas: ReferencedAtlasResolverV1;
}

interface SanitizedCauseMetadata {
  code: string | null;
  path: string | null;
  stage: string | null;
  offset: number | null;
}

let nextHostOrdinal = 1;

/**
 * Create one host per trust principal. Session IDs are opaque routing handles,
 * not authorization tokens, and this W7a host must not be shared directly as
 * a multi-tenant/renderer IPC service.
 */
export function createReadOnlyAuthoringHost(
  options: ReadOnlyAuthoringHostOptions,
): ReadOnlyAuthoringHost {
  let stored: StoredHostOptions;
  try {
    stored = snapshotHostOptions(options);
  } catch (cause) {
    throw new ReadOnlyAuthoringHostError(
      "VIVI_EDITOR_HOST_CONFIGURATION_INVALID",
      "Authoring host configuration is invalid",
      { cause },
    );
  }
  if (!Number.isSafeInteger(nextHostOrdinal)) {
    throw new ReadOnlyAuthoringHostError(
      "VIVI_EDITOR_HOST_CONFIGURATION_INVALID",
      "Authoring host identifier space is exhausted",
      { causeCode: "VIVI_ERR_LIMIT_EXCEEDED" },
    );
  }
  const hostOrdinal = nextHostOrdinal;
  nextHostOrdinal += 1;
  let nextSessionOrdinal = 1;
  let nextRequestGeneration = 1;
  const sessions = new Map<string, SessionRecord>();
  const sessionIdPrefix = `read-only-authoring-host-${hostOrdinal}-session-`;

  const requireSession = (sessionId: string): SessionRecord => {
    if (typeof sessionId !== "string") {
      throw new ReadOnlyAuthoringHostError(
        "VIVI_EDITOR_HOST_SESSION_UNKNOWN",
        "Authoring session does not belong to this host",
      );
    }
    const record = sessions.get(sessionId);
    if (record !== undefined) return record;
    if (wasIssuedSessionId(sessionId, sessionIdPrefix, nextSessionOrdinal)) {
      throw new ReadOnlyAuthoringHostError(
        "VIVI_EDITOR_HOST_SESSION_DISPOSED",
        `Authoring session is disposed: ${sessionId}`,
      );
    }
    throw new ReadOnlyAuthoringHostError(
      "VIVI_EDITOR_HOST_SESSION_UNKNOWN",
      "Authoring session does not belong to this host",
    );
  };

  const publish = async (
    parse: () => Promise<ParsedProjectFormatV11>,
  ): Promise<ReadOnlyAuthoringHostInitResultV1> => {
    if (!Number.isSafeInteger(nextRequestGeneration)) {
      throw new ReadOnlyAuthoringHostError(
        "VIVI_EDITOR_HOST_INIT_FAILED",
        "Authoring request generation space is exhausted",
        { causeCode: "VIVI_ERR_LIMIT_EXCEEDED" },
      );
    }
    // Allocate before the first await. A later, faster init must retain the
    // larger generation so consumers can discard an older completion.
    const requestGeneration = nextRequestGeneration;
    nextRequestGeneration += 1;

    let document: ParsedProjectFormatV11;
    try {
      document = await parse();
    } catch (cause) {
      throw new ReadOnlyAuthoringHostError(
        "VIVI_EDITOR_HOST_INIT_FAILED",
        "Project Format initialization failed",
        { cause },
      );
    }

    let resolvedAtlases: Array<ResolvedEvaluationAtlasV1 | null> | null = null;
    let cachedRuntime: EvaluationPayloadBuildResultV1 | null = null;
    let cachedRuntimeFailure: SanitizedCauseMetadata | null = null;
    let readiness: AssetReadinessStateV1 = "notChecked";
    let missingAtlasIds: string[] = [];
    if (document.compatibility !== "invalid" && document.normalized.version === 11) {
      try {
        preflightAtlasPlan(document);
      } catch (cause) {
        cachedRuntimeFailure = readCauseMetadata(cause);
      }
      if (cachedRuntimeFailure === null) {
        const prepared = await prepareAtlases(document, stored);
        resolvedAtlases = prepared.atlases;
        missingAtlasIds = prepared.missingAtlasIds;
        readiness = missingAtlasIds.length === 0 ? "ready" : "missing";
        if (readiness === "ready") {
          try {
            cachedRuntime = buildPayload(document, resolvedAtlases);
          } catch (cause) {
            // Preserve the load/duplicate session while caching only sanitized
            // diagnostics. No raw cause crosses or remains behind the host seam.
            cachedRuntimeFailure = readCauseMetadata(cause);
          }
        }
      }
    }

    if (!Number.isSafeInteger(nextSessionOrdinal)) {
      throw new ReadOnlyAuthoringHostError(
        "VIVI_EDITOR_HOST_INIT_FAILED",
        "Authoring session identifier space is exhausted",
        { causeCode: "VIVI_ERR_LIMIT_EXCEEDED" },
      );
    }
    const snapshot = makeSnapshot(
      document,
      readiness,
      missingAtlasIds,
      stored.supportedCapabilities,
      requestGeneration,
      cachedRuntime !== null,
      cachedRuntimeFailure,
    );
    const sessionId = `${sessionIdPrefix}${nextSessionOrdinal}`;
    nextSessionOrdinal += 1;
    sessions.set(sessionId, {
      document,
      snapshot,
      resolvedAtlases,
      cachedRuntime,
      cachedRuntimeFailure,
    });
    return { sessionId, snapshot: cloneJsonValue(snapshot) };
  };

  return Object.freeze({
    initJson(source: string): Promise<ReadOnlyAuthoringHostInitResultV1> {
      return publish(() => parseProjectFormatV11Json(source, stored));
    },

    initUtf8(bytes: Uint8Array): Promise<ReadOnlyAuthoringHostInitResultV1> {
      return publish(() => parseProjectFormatV11Utf8(new Uint8Array(bytes), stored));
    },

    getSnapshot(sessionId: string): ReadOnlyAuthoringSnapshotV1 {
      return cloneJsonValue(requireSession(sessionId).snapshot);
    },

    serializeLocalDuplicate(sessionId: string): string {
      const record = requireSession(sessionId);
      if (record.document.compatibility === "invalid") {
        throw new ReadOnlyAuthoringHostError(
          "VIVI_EDITOR_HOST_LOCAL_DUPLICATE_FORBIDDEN",
          "Local duplicate requires full or readOnly compatibility",
        );
      }
      try {
        return serializeProjectFormatV11LocalDuplicate(record.document);
      } catch (cause) {
        throw new ReadOnlyAuthoringHostError(
          "VIVI_EDITOR_HOST_LOCAL_DUPLICATE_FAILED",
          "Local duplicate serialization failed",
          { cause },
        );
      }
    },

    buildRuntimePayload(sessionId: string): ReadOnlyRuntimePayloadV1 {
      const record = requireSession(sessionId);
      if (record.document.normalized.version !== 11) {
        throw new ReadOnlyAuthoringHostError(
          "VIVI_EDITOR_HOST_LEGACY_RUNTIME_UNSUPPORTED",
          "Legacy Project Format requires a reviewed migration adapter before runtime payload construction",
        );
      }
      if (record.document.compatibility === "invalid") {
        throw new ReadOnlyAuthoringHostError(
          "VIVI_EDITOR_HOST_RUNTIME_PAYLOAD_FAILED",
          "Runtime payload requires full or readOnly compatibility",
          { causeCode: "VIVI_ERR_EVALUATION_FORBIDDEN_STATE" },
        );
      }
      if (record.cachedRuntimeFailure !== null) {
        const failure = record.cachedRuntimeFailure;
        throw new ReadOnlyAuthoringHostError(
          "VIVI_EDITOR_HOST_RUNTIME_PAYLOAD_FAILED",
          "Runtime payload preflight failed",
          {
            causeCode: failure.code ?? undefined,
            path: failure.path ?? undefined,
            causeStage: failure.stage ?? undefined,
            causeOffset: failure.offset ?? undefined,
          },
        );
      }
      const missingAtlasIds = record.snapshot.assetReadiness.missingAtlasIds;
      if (
        record.snapshot.assetReadiness.state !== "ready" ||
        record.resolvedAtlases === null
      ) {
        throw new ReadOnlyAuthoringHostError(
          "VIVI_EDITOR_HOST_ASSETS_NOT_READY",
          `Runtime payload assets are not ready: ${missingAtlasIds.join(", ")}`,
        );
      }
      if (record.cachedRuntime === null) {
        throw new ReadOnlyAuthoringHostError(
          "VIVI_EDITOR_HOST_RUNTIME_PAYLOAD_FAILED",
          "Runtime payload cache is unavailable",
        );
      }
      const cached = cloneJsonValue(record.cachedRuntime);
      return {
        requestGeneration: record.snapshot.requestGeneration,
        payload: cached.payload,
        texturePlan: cached.texturePlan,
      };
    },

    dispose(sessionId: string): void {
      requireSession(sessionId);
      sessions.delete(sessionId);
    },
  });
}

function snapshotHostOptions(options: ReadOnlyAuthoringHostOptions): StoredHostOptions {
  if (
    typeof options?.sha256 !== "function" ||
    typeof options.materializeEmbeddedAtlas !== "function" ||
    typeof options.resolveReferencedAtlas !== "function"
  ) {
    throw new ReadOnlyAuthoringHostError(
      "VIVI_EDITOR_HOST_CONFIGURATION_INVALID",
      "Authoring host requires SHA-256, embedded materialization, and referenced resolution ports",
    );
  }

  const registry = new Map<string, ExtensionRegistryEntryV11>();
  for (const [extensionId, entry] of options.registry) {
    validateRegistryEntry(extensionId, entry);
    registry.set(extensionId, {
      id: entry.id,
      supportedSchemaVersions: [...entry.supportedSchemaVersions],
      requiredCapability: {
        id: entry.requiredCapability.id,
        minVersionForSchema: { ...entry.requiredCapability.minVersionForSchema },
      },
      affects: [...entry.affects],
      validateEnvelope: entry.validateEnvelope,
    });
  }
  const supportedCapabilities = new Map<string, number>();
  for (const [capabilityId, version] of options.supportedCapabilities) {
    if (
      typeof capabilityId !== "string" ||
      !CAPABILITY_ID_PATTERN.test(capabilityId) ||
      !Number.isSafeInteger(version) ||
      version <= 0
    ) {
      throw new TypeError("supportedCapabilities must contain valid positive versions");
    }
    supportedCapabilities.set(capabilityId, version);
  }
  const stored: StoredHostOptions = {
    registry,
    supportedCapabilities,
    sha256: options.sha256,
    materializeEmbeddedAtlas: options.materializeEmbeddedAtlas,
    resolveReferencedAtlas: options.resolveReferencedAtlas,
  };
  return stored;
}

function validateRegistryEntry(
  extensionId: string,
  entry: ExtensionRegistryEntryV11,
): void {
  if (
    typeof extensionId !== "string" ||
    extensionId.length === 0 ||
    extensionId === "__proto__" ||
    extensionId === "constructor" ||
    extensionId === "prototype" ||
    entry.id !== extensionId ||
    typeof entry.validateEnvelope !== "function" ||
    entry.affects.length !== 1 ||
    entry.affects[0] !== "edit"
  ) {
    throw new TypeError("registry contains an invalid extension entry");
  }
  const schemaVersions = new Set<number>();
  for (const version of entry.supportedSchemaVersions) {
    if (!Number.isSafeInteger(version) || version <= 0 || schemaVersions.has(version)) {
      throw new TypeError("registry contains invalid supported schema versions");
    }
    schemaVersions.add(version);
  }
  if (
    typeof entry.requiredCapability.id !== "string" ||
    !CAPABILITY_ID_PATTERN.test(entry.requiredCapability.id) ||
    schemaVersions.size === 0
  ) {
    throw new TypeError("registry contains an invalid required capability");
  }
  const minimumEntries = Object.entries(entry.requiredCapability.minVersionForSchema);
  if (minimumEntries.length !== schemaVersions.size) {
    throw new TypeError("registry capability versions must match supported schemas");
  }
  for (const [schemaVersionText, minimumVersion] of minimumEntries) {
    const schemaVersion = Number(schemaVersionText);
    if (
      schemaVersionText !== String(schemaVersion) ||
      !schemaVersions.has(schemaVersion) ||
      !Number.isSafeInteger(minimumVersion) ||
      minimumVersion <= 0
    ) {
      throw new TypeError("registry capability versions are invalid");
    }
  }
}

async function prepareAtlases(
  document: ParsedProjectFormatV11,
  options: StoredHostOptions,
): Promise<{
  atlases: Array<ResolvedEvaluationAtlasV1 | null>;
  missingAtlasIds: string[];
}> {
  const atlases: Array<ResolvedEvaluationAtlasV1 | null> = [];
  const missingAtlasIds: string[] = [];
  for (const [atlasIndex, atlas] of document.normalized.atlases.entries()) {
    if (document.normalized.assetMode === "embedded") {
      if (typeof atlas.image !== "string") {
        throw assetResultError(`Embedded atlas ${atlas.id} does not contain base64 data`);
      }
      let bytes: Uint8Array;
      let expectedDigest: string;
      try {
        const decodedLength = decodedBase64Length(atlas.image);
        if (decodedLength > MAX_EMBEDDED_BLOB_BYTES) {
          throw codedCause(
            "VIVI_ASSET_TOO_LARGE_FOR_EMBED",
            `Embedded atlas ${atlas.id} exceeds ${MAX_EMBEDDED_BLOB_BYTES} bytes`,
            `/atlases/${atlasIndex}/image`,
          );
        }
        bytes = decodeBase64(atlas.image);
        const digest = await options.sha256(bytes);
        if (typeof digest !== "string" || !SHA256_PATTERN.test(digest)) {
          throw new TypeError("SHA-256 provider returned an invalid digest");
        }
        expectedDigest = digest.toLowerCase();
      } catch (cause) {
        throw new ReadOnlyAuthoringHostError(
          "VIVI_EDITOR_HOST_ASSET_MATERIALIZATION_FAILED",
          `Embedded atlas preflight failed: ${atlas.id}`,
          { cause, atlasId: atlas.id },
        );
      }

      let verified: VerifiedAtlasAssetV1;
      try {
        verified = await options.materializeEmbeddedAtlas({
          kind: "embedded",
          atlasId: atlas.id,
          imageBase64: atlas.image,
          declaredWidth: atlas.width,
          declaredHeight: atlas.height,
        });
      } catch (cause) {
        throw new ReadOnlyAuthoringHostError(
          "VIVI_EDITOR_HOST_ASSET_MATERIALIZATION_FAILED",
          `Embedded atlas materialization failed: ${atlas.id}`,
          { cause, atlasId: atlas.id },
        );
      }
      let validated: VerifiedAtlasAssetV1;
      try {
        validated = validateVerifiedAtlas(verified, atlas.width, atlas.height);
        if (
          validated.asset.storageKind !== "blob" ||
          validated.asset.sizeBytes !== bytes.byteLength
        ) {
          throw codedCause(
            "VIVI_ASSET_SIZE_MISMATCH",
            "Embedded atlas materialization size does not match source bytes",
          );
        }
        if (validated.asset.contentSha256 !== expectedDigest) {
          throw codedCause(
            "VIVI_ASSET_CONTENT_HASH_MISMATCH",
            "Embedded atlas content hash does not match source bytes",
          );
        }
        if (validated.asset.objectAddress !== expectedDigest) {
          throw codedCause(
            "VIVI_ASSET_HASH_MISMATCH",
            "Embedded atlas object address does not match source bytes",
          );
        }
      } catch (cause) {
        throw new ReadOnlyAuthoringHostError(
          "VIVI_EDITOR_HOST_ASSET_RESULT_INVALID",
          `Embedded atlas materialization returned an invalid result: ${atlas.id}`,
          { cause, atlasId: atlas.id },
        );
      }
      atlases.push(toResolvedAtlas(atlas, validated.asset));
      continue;
    }

    if (typeof atlas.image === "string") {
      throw assetResultError(`Referenced atlas ${atlas.id} does not contain an AssetRef`);
    }
    const expected = validateAssetRef(atlas.image);
    let resolution: ReferencedAtlasResolutionV1;
    try {
      resolution = await options.resolveReferencedAtlas({
        kind: "referenced",
        atlasId: atlas.id,
        reference: copyAssetRef(expected),
        declaredWidth: atlas.width,
        declaredHeight: atlas.height,
      });
    } catch (cause) {
      throw new ReadOnlyAuthoringHostError(
        "VIVI_EDITOR_HOST_ASSET_RESOLUTION_FAILED",
        `Referenced atlas resolution failed: ${atlas.id}`,
        { cause, atlasId: atlas.id },
      );
    }
    try {
      const resolutionRecord = exactRecord(resolution, ["status"], ["verified"]);
      if (resolutionRecord.status === "missing") {
        if (Object.hasOwn(resolutionRecord, "verified")) {
          throw assetResultError("Missing resolution must not contain verified data");
        }
        atlases.push(null);
        missingAtlasIds.push(atlas.id);
        continue;
      }
      if (resolutionRecord.status !== "ready") {
        throw assetResultError("Referenced atlas resolution has an invalid status");
      }
      if (!Object.hasOwn(resolutionRecord, "verified")) {
        throw assetResultError("Ready resolution is missing verified data");
      }
      const verified = validateVerifiedAtlas(
        resolutionRecord.verified,
        atlas.width,
        atlas.height,
      );
      if (!sameAssetRef(verified.asset, expected)) {
        throw codedCause(
          "VIVI_ASSET_DESCRIPTOR_MISMATCH",
          "Referenced atlas resolution changed the approved AssetRef",
        );
      }
      atlases.push(toResolvedAtlas(atlas, verified.asset));
    } catch (cause) {
      throw new ReadOnlyAuthoringHostError(
        "VIVI_EDITOR_HOST_ASSET_RESULT_INVALID",
        `Referenced atlas resolution returned an invalid result: ${atlas.id}`,
        { cause, atlasId: atlas.id },
      );
    }
  }
  return { atlases, missingAtlasIds };
}

function preflightAtlasPlan(document: ParsedProjectFormatV11): void {
  const atlases = document.normalized.atlases;
  if (atlases.length > MAX_ATLASES) {
    throw codedCause(
      "VIVI_ERR_LIMIT_EXCEEDED",
      "Atlas count exceeds the runtime texture limit",
    );
  }
  let totalTextureBytes = 0;
  for (const atlas of atlases) {
    if (
      !Number.isSafeInteger(atlas.width) ||
      !Number.isSafeInteger(atlas.height) ||
      atlas.width < 1 ||
      atlas.height < 1
    ) {
      throw codedCause(
        "VIVI_ERR_EVALUATION_PAYLOAD",
        `Atlas dimensions are invalid: ${atlas.id}`,
      );
    }
    if (
      atlas.width > VIVI_EVALUATION_V1_TEXTURE_LIMITS.maxWidth ||
      atlas.height > VIVI_EVALUATION_V1_TEXTURE_LIMITS.maxHeight
    ) {
      throw codedCause(
        "VIVI_ERR_LIMIT_EXCEEDED",
        `Atlas dimensions are outside the runtime limit: ${atlas.id}`,
      );
    }
    if (
      typeof atlas.image !== "string" &&
      atlas.image.sizeBytes > VIVI_EVALUATION_V1_TEXTURE_LIMITS.maxPngInputBytes
    ) {
      throw codedCause(
        "VIVI_ASSET_LIMIT_EXCEEDED",
        `Referenced atlas exceeds the PNG input limit: ${atlas.id}`,
      );
    }
    totalTextureBytes += atlas.width * atlas.height * 4;
    if (totalTextureBytes > VIVI_EVAL_V1_MAX_TOTAL_TEXTURE_BYTES) {
      throw codedCause(
        "VIVI_ERR_LIMIT_EXCEEDED",
        "Aggregate atlas texture bytes exceed the runtime limit",
      );
    }
  }
}

function makeSnapshot(
  document: ParsedProjectFormatV11,
  assetReadiness: AssetReadinessStateV1,
  missingAtlasIds: readonly string[],
  supportedCapabilities: ReadonlyMap<string, number>,
  requestGeneration: number,
  runtimeAvailable: boolean,
  runtimeFailure: SanitizedCauseMetadata | null,
): ReadOnlyAuthoringSnapshotV1 {
  const derivedRequirements = cloneJsonValue(document.derivedRequirements);
  const missingRequirements = derivedRequirements
    .filter(({ id, minVersion }) => (supportedCapabilities.get(id) ?? 0) < minVersion)
    .map(({ id, minVersion, requiredFor }) => ({
      id,
      minVersion,
      supportedVersion: supportedCapabilities.get(id) ?? null,
      requiredFor: [...requiredFor],
    }));
  const metadata: AuthoringSnapshotMetadataV1 = {
    requestGeneration,
    sourceVersion: document.normalized.version,
    compatibility: document.compatibility,
    assetMode: document.normalized.assetMode,
    assetReadiness: {
      state: assetReadiness,
      missingAtlasIds: [...missingAtlasIds],
    },
    derivedRequirements,
    missingRequirements,
    opaqueExtensionIds: document.opaqueExtensions.map(({ extensionId }) => extensionId),
    runtimeState:
      document.compatibility === "invalid"
        ? "forbidden"
        : document.normalized.version !== 11
          ? "unsupported"
          : runtimeAvailable
            ? "ready"
            : runtimeFailure !== null
              ? "failed"
              : assetReadiness === "missing"
                ? "blockedAssets"
                : "failed",
    runtimeFailure:
      runtimeFailure === null
        ? null
        : {
            causeCode: runtimeFailure.code,
            causePath: runtimeFailure.path,
            causeStage: runtimeFailure.stage,
            causeOffset: runtimeFailure.offset,
          },
    guards: {
      canRuntime: runtimeAvailable,
      canLocalDuplicate: document.compatibility !== "invalid",
      canEdit: false,
      canUndo: false,
      canRedo: false,
      canOrdinarySave: false,
      canPublicExport: false,
    },
  };
  if (document.normalized.profile !== undefined) {
    metadata.profile = document.normalized.profile;
  }
  if (document.compatibility === "invalid") {
    return {
      ...metadata,
      compatibility: "invalid",
      assetReadiness: { state: "notChecked", missingAtlasIds: [] },
    };
  }
  return {
    ...metadata,
    compatibility: document.compatibility,
    assetReadiness: {
      state: assetReadiness,
      missingAtlasIds: [...missingAtlasIds],
    },
  };
}

function readCauseMetadata(cause: unknown): SanitizedCauseMetadata {
  if (typeof cause !== "object" || cause === null) {
    return {
      code: null,
      path: null,
      stage: null,
      offset: null,
    };
  }
  try {
    const codeDescriptor = Object.getOwnPropertyDescriptor(cause, "code");
    const pathDescriptor = Object.getOwnPropertyDescriptor(cause, "path");
    const stageDescriptor = Object.getOwnPropertyDescriptor(cause, "stage");
    const offsetDescriptor = Object.getOwnPropertyDescriptor(cause, "offset");
    const rawCode =
      codeDescriptor !== undefined &&
      "value" in codeDescriptor &&
      typeof codeDescriptor.value === "string"
        ? codeDescriptor.value
        : null;
    const code = sanitizeCauseCode(rawCode);
    if (code === null) {
      return { code: null, path: null, stage: null, offset: null };
    }
    return {
      code,
      path: sanitizeCausePath(
        pathDescriptor !== undefined &&
          "value" in pathDescriptor &&
          typeof pathDescriptor.value === "string"
          ? pathDescriptor.value
          : null,
      ),
      stage: sanitizeCauseStage(
        stageDescriptor !== undefined &&
          "value" in stageDescriptor &&
          typeof stageDescriptor.value === "string"
          ? stageDescriptor.value
          : null,
      ),
      offset:
        offsetDescriptor !== undefined &&
        "value" in offsetDescriptor &&
        typeof offsetDescriptor.value === "number" &&
        Number.isSafeInteger(offsetDescriptor.value) &&
        offsetDescriptor.value >= 0
          ? offsetDescriptor.value
          : null,
    };
  } catch {
    return { code: null, path: null, stage: null, offset: null };
  }
}

function sanitizeCauseCode(code: string | null): string | null {
  return code !== null && KNOWN_CAUSE_CODES.has(code) ? code : null;
}

function sanitizeCausePath(path: string | null): string | null {
  if (
    path === null ||
    path.length > 4096 ||
    (path !== "" && !path.startsWith("/")) ||
    [...path].some((character) => {
      const codePoint = character.codePointAt(0) ?? -1;
      return codePoint <= 0x1f || codePoint === 0x7f;
    })
  ) {
    return null;
  }
  return path;
}

function sanitizeCauseStage(stage: string | null): string | null {
  return stage === "schema" || stage === "semantic" || stage === "serialize"
    ? stage
    : null;
}

function buildPayload(
  document: ParsedProjectFormatV11,
  atlases: readonly (ResolvedEvaluationAtlasV1 | null)[],
): EvaluationPayloadBuildResultV1 {
  if (document.compatibility === "invalid" || atlases.some((atlas) => atlas === null)) {
    throw new ReadOnlyAuthoringHostError(
      "VIVI_EDITOR_HOST_ASSETS_NOT_READY",
      "Runtime payload input is not render-ready",
    );
  }
  const resolved: ResolvedAuthoringProjectV1 & { extensions?: unknown } = {
    project: materializeEvaluationProject(document.normalized.project),
    atlases: atlases as ResolvedEvaluationAtlasV1[],
    compatibility: document.compatibility,
  };
  if (document.normalized.extensions !== undefined) {
    // Deliberately enumerable: the shared builder scans this trusted JSON graph
    // for forbidden runtime markers before it projects the three v1 fields.
    resolved.extensions = cloneJsonValue(document.normalized.extensions);
  }
  return buildEvaluationPayload(resolved);
}

function materializeEvaluationProject(
  project: NormalizedViviFileDataV11["project"],
): ResolvedAuthoringProjectV1["project"] {
  // W7a only calls this adapter for v11, whose schema requires the complete
  // project shape. Legacy v1-10 deliberately remain metadata/duplicate-only
  // until a separately reviewed migration adapter exists.
  return cloneJsonValue(project) as unknown as ResolvedAuthoringProjectV1["project"];
}

function toResolvedAtlas(
  atlas: NormalizedViviFileDataV11["atlases"][number],
  asset: ViviAssetRefV1,
): ResolvedEvaluationAtlasV1 {
  return {
    id: atlas.id,
    image: copyAssetRef(asset),
    width: atlas.width,
    height: atlas.height,
    entries: cloneJsonValue(atlas.entries),
  };
}

function validateVerifiedAtlas(
  value: unknown,
  expectedWidth: number,
  expectedHeight: number,
): VerifiedAtlasAssetV1 {
  const verified = exactRecord(value, ["asset", "png"]);
  const png = exactRecord(verified.png, ["profile", "width", "height"]);
  if (png.profile !== PNG_PROFILE_V1) {
    throw codedCause(
      "VIVI_ASSET_DECODING_PROFILE_UNSUPPORTED",
      "Verified PNG profile does not match the frozen profile",
    );
  }
  if (
    !Number.isSafeInteger(png.width) ||
    !Number.isSafeInteger(png.height) ||
    (png.width as number) <= 0 ||
    (png.height as number) <= 0
  ) {
    throw codedCause(
      "VIVI_ASSET_DIMENSION_MISMATCH",
      "Verified PNG dimensions are invalid",
    );
  }
  if (png.width !== expectedWidth || png.height !== expectedHeight) {
    throw codedCause(
      "VIVI_ASSET_DIMENSION_MISMATCH",
      "Verified PNG dimensions do not match the atlas",
    );
  }
  return {
    asset: validateAssetRef(verified.asset),
    png: {
      profile: PNG_PROFILE_V1,
      width: png.width as number,
      height: png.height as number,
    },
  };
}

function validateAssetRef(value: unknown): ViviAssetRefV1 {
  const record = exactRecord(value, [...ASSET_REF_KEYS]);
  if (
    typeof record.objectAddress !== "string" ||
    !SHA256_PATTERN.test(record.objectAddress) ||
    typeof record.contentSha256 !== "string" ||
    !SHA256_PATTERN.test(record.contentSha256)
  ) {
    throw codedCause(
      "VIVI_ASSET_HASH_MISMATCH",
      "AssetRef hashes must be 64 hexadecimal characters",
    );
  }
  if (record.storageKind !== "blob" && record.storageKind !== "chunk_manifest") {
    throw codedCause("VIVI_ASSET_UNSUPPORTED_KIND", "AssetRef storageKind is invalid");
  }
  if (record.mediaType !== "image/png") {
    throw codedCause(
      "VIVI_ASSET_MEDIA_TYPE_MISMATCH",
      "Atlas AssetRef mediaType must be image/png",
    );
  }
  if (
    typeof record.sizeBytes !== "number" ||
    !Number.isSafeInteger(record.sizeBytes) ||
    record.sizeBytes < 0
  ) {
    throw codedCause(
      "VIVI_ASSET_SIZE_MISMATCH",
      "AssetRef sizeBytes must be a non-negative safe integer",
    );
  }
  const objectAddress = record.objectAddress.toLowerCase();
  const contentSha256 = record.contentSha256.toLowerCase();
  if (record.storageKind === "blob") {
    if (objectAddress !== contentSha256) {
      throw codedCause(
        "VIVI_ASSET_HASH_MISMATCH",
        "Blob AssetRef address and content hash differ",
      );
    }
    if (record.sizeBytes > MAX_EMBEDDED_BLOB_BYTES) {
      throw codedCause("VIVI_ASSET_LIMIT_EXCEEDED", "Blob AssetRef exceeds its limit");
    }
  } else if (
    record.sizeBytes <= MAX_EMBEDDED_BLOB_BYTES ||
    record.sizeBytes > MAX_CHUNK_MANIFEST_BYTES
  ) {
    throw codedCause(
      "VIVI_ASSET_LIMIT_EXCEEDED",
      "Chunk-manifest AssetRef size is invalid",
    );
  }
  return {
    objectAddress,
    storageKind: record.storageKind,
    contentSha256,
    mediaType: "image/png",
    sizeBytes: record.sizeBytes,
  };
}

function exactRecord(
  value: unknown,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[] = [],
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw assetResultError("Asset port result must be a plain object");
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw assetResultError("Asset port result must have a plain object prototype");
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw assetResultError("Asset port result must not contain symbol properties");
  }
  const allowed = new Set([...requiredKeys, ...optionalKeys]);
  const names = Object.getOwnPropertyNames(value);
  if (names.some((name) => !allowed.has(name))) {
    throw assetResultError("Asset port result contains unexpected properties");
  }
  const output: Record<string, unknown> = {};
  for (const key of requiredKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined ||
      descriptor.enumerable !== true ||
      !("value" in descriptor)
    ) {
      throw assetResultError(`Asset port result is missing data property ${key}`);
    }
    defineDataProperty(output, key, descriptor.value);
  }
  for (const key of optionalKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined) continue;
    if (descriptor.enumerable !== true || !("value" in descriptor)) {
      throw assetResultError(`Asset port result property ${key} must be enumerable data`);
    }
    defineDataProperty(output, key, descriptor.value);
  }
  return output;
}

function defineDataProperty(
  target: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    writable: true,
    value,
  });
}

function assetResultError(message: string): ReadOnlyAuthoringHostError {
  return new ReadOnlyAuthoringHostError("VIVI_EDITOR_HOST_ASSET_RESULT_INVALID", message);
}

function copyAssetRef(value: ViviAssetRefV1): ViviAssetRefV1 {
  return {
    objectAddress: value.objectAddress,
    storageKind: value.storageKind,
    contentSha256: value.contentSha256,
    mediaType: value.mediaType,
    sizeBytes: value.sizeBytes,
  };
}

function sameAssetRef(left: ViviAssetRefV1, right: ViviAssetRefV1): boolean {
  return (
    left.objectAddress === right.objectAddress &&
    left.storageKind === right.storageKind &&
    left.contentSha256 === right.contentSha256 &&
    left.mediaType === right.mediaType &&
    left.sizeBytes === right.sizeBytes
  );
}

function wasIssuedSessionId(
  sessionId: string,
  prefix: string,
  nextSessionOrdinal: number,
): boolean {
  if (!sessionId.startsWith(prefix)) return false;
  if (sessionId.length <= prefix.length || sessionId.length > prefix.length + 16) {
    return false;
  }
  const suffix = sessionId.slice(prefix.length);
  if (!/^[1-9][0-9]{0,15}$/.test(suffix)) return false;
  const ordinal = Number(suffix);
  return Number.isSafeInteger(ordinal) && ordinal < nextSessionOrdinal;
}

function decodeBase64(value: string): Uint8Array {
  const output = new Uint8Array(decodedBase64Length(value));
  let outputIndex = 0;
  for (let index = 0; index < value.length; index += 4) {
    const a = base64Value(value.charCodeAt(index));
    const b = base64Value(value.charCodeAt(index + 1));
    const c = value[index + 2] === "=" ? 0 : base64Value(value.charCodeAt(index + 2));
    const d = value[index + 3] === "=" ? 0 : base64Value(value.charCodeAt(index + 3));
    const packed = (a << 18) | (b << 12) | (c << 6) | d;
    if (outputIndex < output.length) output[outputIndex++] = (packed >>> 16) & 0xff;
    if (outputIndex < output.length) output[outputIndex++] = (packed >>> 8) & 0xff;
    if (outputIndex < output.length) output[outputIndex++] = packed & 0xff;
  }
  return output;
}

function decodedBase64Length(value: string): number {
  if (value.length % 4 !== 0) throw new TypeError("Invalid base64 length");
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return (value.length / 4) * 3 - padding;
}

function codedCause(
  code: string,
  message: string,
  path?: string,
): Readonly<{ code: string; message: string; path?: string }> {
  return Object.freeze(path === undefined ? { code, message } : { code, message, path });
}

function base64Value(code: number): number {
  if (code >= 0x41 && code <= 0x5a) return code - 0x41;
  if (code >= 0x61 && code <= 0x7a) return code - 0x61 + 26;
  if (code >= 0x30 && code <= 0x39) return code - 0x30 + 52;
  if (code === 0x2b) return 62;
  if (code === 0x2f) return 63;
  throw new TypeError("Invalid base64 character");
}

function cloneJsonValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => cloneJsonValue(entry)) as T;
  }
  if (typeof value !== "object" || value === null) return value;
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    defineDataProperty(output, key, cloneJsonValue(child));
  }
  return output as T;
}
