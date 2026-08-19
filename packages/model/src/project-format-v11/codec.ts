import {
  ProjectFormatV11SemanticError,
  type ProjectFormatV11SemanticErrorCode,
} from "./errors";
import {
  canonicalizeJsonV11,
  PROJECT_FORMAT_V11_JSON_LIMITS,
  ProjectFormatV11JsonError,
  type ProjectFormatV11JsonLimits,
  parseJsonV11,
  type ViviJsonValueV11,
} from "./json-contract";
import {
  type ProjectFormatV11SchemaIssue,
  validateProjectFormatV11Schema,
} from "./schema";
import {
  deriveProjectFormatV11Requirements,
  validateProjectFormatV11Semantics,
} from "./semantic";
import type {
  ExtensionRegistryEntryV11,
  ExtensionRegistryV11,
  NormalizedProjectLayerV11,
  NormalizedViviFileDataV11,
  OpaqueExtensionRecordV11,
  ProjectCompatibilityV11,
  ProjectDataV11,
  ProjectDataWireV1To10,
  ProjectFormatV11SemanticOptions,
  ProjectLayerV11,
  SemanticValidationResult,
  Sha256V11,
  ViviAssetRefV11,
  ViviAtlasDataEmbeddedV11,
  ViviAtlasDataReferencedV11,
  ViviEmbeddedAssetV11,
  ViviExtensionEnvelopeV11,
  ViviFileDataWireThroughV11,
  ViviFileDataWireV1To10,
  ViviFileDataWireV11,
  ViviFileDataWireV11Embedded,
  ViviFileDataWireV11Referenced,
  ViviRequiredCapabilityV11,
} from "./types";

const V11_ONLY_ROOT_FIELDS = [
  "assetMode",
  "documentId",
  "requires",
  "extensions",
  "embeddedAssets",
] as const;
const KNOWN_ROOT_FIELDS = new Set<string>([
  "version",
  "profile",
  "project",
  "atlases",
  ...V11_ONLY_ROOT_FIELDS,
]);
const SHA256_PATTERN = /^[A-Fa-f0-9]{64}$/u;
const ATLAS_ID_PATTERN = /^[A-Za-z0-9_-]{1,120}$/u;
const RAW_BASE64_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
const MAX_EMBEDDED_BLOB_BYTES = 16 * 1024 * 1024;
const MAX_CHUNK_MANIFEST_BYTES = 64 * 1024 * 1024 * 1024;
const MAX_EMBEDDED_BASE64_CHARS = 22_369_624;

export interface ProjectFormatV11CodecOptions extends ProjectFormatV11SemanticOptions {
  /** Tests may lower JSON ceilings, but may never raise production limits. */
  testLimits?: Partial<ProjectFormatV11JsonLimits>;
}

export interface ParsedProjectFormatV11 extends SemanticValidationResult {
  /** Raw decoded wire value. Ordinary serialization does not mutate this object. */
  readonly wire: ViviFileDataWireThroughV11;
}

export class ProjectFormatV11SchemaError extends Error {
  readonly stage = "schema" as const;
  readonly code: ProjectFormatV11SemanticErrorCode;
  readonly path: string;
  readonly issues: readonly ProjectFormatV11SchemaIssue[];

  constructor(
    code: ProjectFormatV11SemanticErrorCode,
    path: string,
    message: string,
    issues: readonly ProjectFormatV11SchemaIssue[],
  ) {
    super(`${message} (${path})`);
    this.name = "ProjectFormatV11SchemaError";
    this.code = code;
    this.path = path;
    this.issues = issues;
  }
}

export type ProjectFormatV11SerializationErrorCode =
  | "VIVI_FMT_SERIALIZE_FORBIDDEN"
  | "VIVI_FMT_SELF_CHECK_FAILED";

export class ProjectFormatV11SerializationError extends Error {
  readonly stage = "serialize" as const;
  readonly code: ProjectFormatV11SerializationErrorCode;

  constructor(code: ProjectFormatV11SerializationErrorCode, message: string) {
    super(message);
    this.name = "ProjectFormatV11SerializationError";
    this.code = code;
  }
}

interface StoredCodecOptions extends ProjectFormatV11CodecOptions {
  registry: ExtensionRegistryV11;
  supportedCapabilities: ReadonlyMap<string, number>;
}

interface StoredOpaqueRecord {
  extensionId: string;
  capabilityId: string;
  loadedCanonicalHash: string;
  normalizedCanonicalHash: string;
}

interface ParsedDocumentState {
  sourceCanonical: string;
  compatibility: ProjectCompatibilityV11;
  options: StoredCodecOptions;
  opaqueRecords: StoredOpaqueRecord[];
}

const parsedDocumentStates = new WeakMap<ParsedProjectFormatV11, ParsedDocumentState>();

export async function parseProjectFormatV11Json(
  source: string,
  options: ProjectFormatV11CodecOptions,
): Promise<ParsedProjectFormatV11> {
  const value = parseJsonV11(source, { testLimits: options.testLimits });
  return validateDecodedProjectFormat(value, options);
}

export async function parseProjectFormatV11Utf8(
  bytes: Uint8Array,
  options: ProjectFormatV11CodecOptions,
): Promise<ParsedProjectFormatV11> {
  const maxInputUtf8Bytes = resolveInputByteLimit(options.testLimits);
  if (bytes.byteLength > maxInputUtf8Bytes) {
    throw new ProjectFormatV11JsonError(
      "VIVI_FMT_JSON_TOO_LARGE",
      `JSON input exceeds ${maxInputUtf8Bytes} UTF-8 bytes`,
      0,
    );
  }
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    throw new ProjectFormatV11JsonError(
      "VIVI_FMT_INVALID_JSON",
      "UTF-8 BOM is not accepted by the Project Format v11 codec",
      0,
    );
  }

  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new ProjectFormatV11JsonError(
      "VIVI_FMT_UNICODE_SCALAR_INVALID",
      "Project Format input is not well-formed UTF-8",
      0,
    );
  }
  return parseProjectFormatV11Json(source, options);
}

export function determineProjectFormatV11OutputVersion(
  normalized: NormalizedViviFileDataV11,
  derivedRequirements: readonly ViviRequiredCapabilityV11[],
): 10 | 11 {
  return normalized.assetMode === "referenced" ||
    normalized.documentId !== undefined ||
    derivedRequirements.length > 0 ||
    normalized.extensions !== undefined ||
    normalized.embeddedAssets !== undefined
    ? 11
    : 10;
}

export async function serializeProjectFormatV11Ordinary(
  document: ParsedProjectFormatV11,
): Promise<string> {
  const state = requireDocumentState(document);
  await assertOpaqueExtensionsUnchanged(document, state);
  if (state.compatibility !== "full") {
    throw new ProjectFormatV11SerializationError(
      "VIVI_FMT_SERIALIZE_FORBIDDEN",
      "Ordinary Project Format serialization requires full compatibility",
    );
  }

  const normalized = document.normalized;
  const requirements = deriveCurrentRequirements(normalized, state.options);
  const version = determineProjectFormatV11OutputVersion(normalized, requirements);
  if (version === 11 && normalized.profile === "publicProfileV1") {
    throw new ProjectFormatV11SemanticError(
      "forbiddenPublicFeature",
      "/profile",
      "A publicProfileV1 document cannot be serialized as Project Format v11",
    );
  }
  const wire =
    version === 10
      ? projectOrdinaryV10(normalized)
      : projectOrdinaryV11(normalized, requirements);
  const serialized = canonicalizeJsonV11(wire);

  const reparsed = await parseProjectFormatV11Json(serialized, state.options);
  if (
    reparsed.compatibility !== "full" ||
    canonicalizeJsonV11(reparsed.wire) !== serialized
  ) {
    throw new ProjectFormatV11SerializationError(
      "VIVI_FMT_SELF_CHECK_FAILED",
      "Ordinary Project Format serialization failed its parse self-check",
    );
  }
  return serialized;
}

export function serializeProjectFormatV11LocalDuplicate(
  document: ParsedProjectFormatV11,
): string {
  const state = requireDocumentState(document);
  if (state.compatibility !== "full" && state.compatibility !== "readOnly") {
    throw new ProjectFormatV11SerializationError(
      "VIVI_FMT_SERIALIZE_FORBIDDEN",
      "Local duplicate serialization requires full or readOnly compatibility",
    );
  }
  return state.sourceCanonical;
}

async function validateDecodedProjectFormat(
  value: ViviJsonValueV11,
  options: ProjectFormatV11CodecOptions,
): Promise<ParsedProjectFormatV11> {
  const issues = validateProjectFormatV11Schema(value);
  if (issues.length > 0) throw mapSchemaFailure(value, issues);

  // Preserve the accepted wire before registry or semantic callbacks run. The
  // duplicate path must never inherit mutations performed by validation code.
  const sourceCanonical = canonicalizeJsonV11(value);
  const storedOptions = snapshotOptions(options);
  const wire = value as unknown as ViviFileDataWireThroughV11;
  const semantic = await validateProjectFormatV11Semantics(wire, storedOptions);
  const document: ParsedProjectFormatV11 = { wire, ...semantic };
  const opaqueRecords = await Promise.all(
    semantic.opaqueExtensions.map((record) =>
      snapshotOpaqueRecord(record, semantic.normalized, storedOptions.sha256),
    ),
  );
  parsedDocumentStates.set(document, {
    sourceCanonical,
    compatibility: semantic.compatibility,
    options: storedOptions,
    opaqueRecords,
  });
  return document;
}

function snapshotOptions(options: ProjectFormatV11CodecOptions): StoredCodecOptions {
  const registry = new Map<string, ExtensionRegistryEntryV11>();
  for (const [extensionId, entry] of options.registry) {
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
  const stored: StoredCodecOptions = {
    registry,
    supportedCapabilities: new Map(options.supportedCapabilities),
  };
  if (options.sha256 !== undefined) stored.sha256 = options.sha256;
  if (options.testLimits !== undefined) stored.testLimits = { ...options.testLimits };
  return stored;
}

async function snapshotOpaqueRecord(
  record: OpaqueExtensionRecordV11,
  normalized: NormalizedViviFileDataV11,
  sha256: Sha256V11 | undefined,
): Promise<StoredOpaqueRecord> {
  const normalizedEnvelope = normalized.extensions?.[record.extensionId];
  const normalizedRequirement = (normalized.requires ?? []).find(
    ({ id }) => id === record.preservedRequirement.id,
  );
  if (!normalizedEnvelope || !normalizedRequirement) {
    throw new ProjectFormatV11SemanticError(
      "VIVI_FMT_REQUIRES_MISMATCH",
      `/extensions/${escapePointer(record.extensionId)}`,
      "Normalized opaque extension lost its preserved requirement",
    );
  }
  return {
    extensionId: record.extensionId,
    capabilityId: record.preservedRequirement.id,
    loadedCanonicalHash: record.loadedCanonicalHash,
    normalizedCanonicalHash: await hashCanonicalValue(
      {
        extensionId: record.extensionId,
        envelope: normalizedEnvelope,
        preservedRequirement: normalizedRequirement,
      },
      sha256,
    ),
  };
}

function requireDocumentState(document: ParsedProjectFormatV11): ParsedDocumentState {
  const state = parsedDocumentStates.get(document);
  if (!state) {
    throw new ProjectFormatV11SerializationError(
      "VIVI_FMT_SERIALIZE_FORBIDDEN",
      "Project Format serialization requires a document returned by this codec",
    );
  }
  return state;
}

function resolveInputByteLimit(
  overrides: Partial<ProjectFormatV11JsonLimits> | undefined,
): number {
  const override = overrides?.maxInputUtf8Bytes;
  if (override === undefined) return PROJECT_FORMAT_V11_JSON_LIMITS.maxInputUtf8Bytes;
  if (
    !Number.isSafeInteger(override) ||
    override < 0 ||
    override > PROJECT_FORMAT_V11_JSON_LIMITS.maxInputUtf8Bytes
  ) {
    throw new RangeError(
      `testLimits.maxInputUtf8Bytes must be a safe integer from 0 through ${PROJECT_FORMAT_V11_JSON_LIMITS.maxInputUtf8Bytes}`,
    );
  }
  return override;
}

interface StableSchemaFailure {
  code: ProjectFormatV11SemanticErrorCode;
  path: string;
  message: string;
}

function mapSchemaFailure(
  value: ViviJsonValueV11,
  issues: readonly ProjectFormatV11SchemaIssue[],
): ProjectFormatV11SchemaError {
  const failure = classifySchemaFailure(value, issues);
  return new ProjectFormatV11SchemaError(
    failure.code,
    failure.path,
    failure.message,
    issues,
  );
}

function classifySchemaFailure(
  value: ViviJsonValueV11,
  issues: readonly ProjectFormatV11SchemaIssue[],
): StableSchemaFailure {
  const root = asRecord(value);
  if (root) {
    const hasProfile = Object.hasOwn(root, "profile");
    const v11Field = V11_ONLY_ROOT_FIELDS.find((key) => Object.hasOwn(root, key));
    if (hasProfile && (root.version === 11 || v11Field !== undefined)) {
      return stableFailure(
        "forbiddenPublicFeature",
        "/profile",
        "profile cannot be combined with Project Format v11 fields",
      );
    }
    if (isLegacyVersion(root.version) && v11Field !== undefined) {
      return stableFailure(
        "unknownPublicField",
        `/${v11Field}`,
        `Project Format v${root.version} cannot contain ${v11Field}`,
      );
    }
    const unknownRootField = Object.keys(root).find((key) => !KNOWN_ROOT_FIELDS.has(key));
    if (unknownRootField !== undefined) {
      return stableFailure(
        "unknownPublicField",
        `/${escapePointer(unknownRootField)}`,
        `Unknown Project Format root field ${unknownRootField}`,
      );
    }
    if (root.version === 11) {
      const v11Failure = classifyV11SchemaFailure(root);
      if (v11Failure) return v11Failure;
    }
  }

  const unknownField = findUnknownAdditionalProperty(value, issues);
  if (unknownField) {
    return stableFailure(
      "unknownPublicField",
      unknownField,
      "Project Format object contains an unknown field",
    );
  }

  const issue = chooseSpecificSchemaIssue(issues);
  return stableFailure(
    "invalidSemanticValue",
    schemaIssuePath(issue),
    "Project Format structure is invalid",
  );
}

function classifyV11SchemaFailure(
  root: Record<string, unknown>,
): StableSchemaFailure | null {
  const atlases = Array.isArray(root.atlases) ? root.atlases : [];
  if (root.assetMode === "embedded") {
    for (const [index, value] of atlases.entries()) {
      const atlas = asRecord(value);
      if (atlas && asRecord(atlas.image)) {
        return stableFailure(
          "VIVI_FMT_MIXED_ASSET_MODE",
          `/atlases/${index}/image`,
          "Embedded mode requires inline atlas bytes",
        );
      }
    }
  } else if (root.assetMode === "referenced") {
    for (const [index, value] of atlases.entries()) {
      const atlas = asRecord(value);
      if (atlas && typeof atlas.image === "string") {
        return stableFailure(
          "VIVI_FMT_MIXED_ASSET_MODE",
          `/atlases/${index}/image`,
          "Referenced mode requires atlas asset references",
        );
      }
    }
    const embeddedAssets = asRecord(root.embeddedAssets);
    if (embeddedAssets && Object.keys(embeddedAssets).length > 0) {
      return stableFailure(
        "VIVI_FMT_MIXED_ASSET_MODE",
        "/embeddedAssets",
        "Referenced mode cannot contain embedded assets",
      );
    }
  }

  for (const [index, value] of atlases.entries()) {
    const atlas = asRecord(value);
    if (atlas && (typeof atlas.id !== "string" || !ATLAS_ID_PATTERN.test(atlas.id))) {
      return stableFailure(
        "VIVI_FMT_ATLAS_ID_INVALID",
        `/atlases/${index}/id`,
        "Atlas id is invalid",
      );
    }
  }

  const embeddedAssets = asRecord(root.embeddedAssets);
  if (embeddedAssets) {
    for (const [key, value] of Object.entries(embeddedAssets)) {
      const assetPath = `/embeddedAssets/${escapePointer(key)}`;
      if (!/^sha256:[A-Fa-f0-9]{64}$/u.test(key)) {
        return stableFailure(
          "VIVI_FMT_ASSET_HASH_MISMATCH",
          assetPath,
          "Embedded asset key is not a SHA-256 address",
        );
      }
      const entry = asRecord(value);
      if (!entry) {
        return stableFailure(
          "VIVI_FMT_ASSET_HASH_MISMATCH",
          assetPath,
          "Embedded asset entry is invalid",
        );
      }
      if (
        typeof entry.contentSha256 !== "string" ||
        !SHA256_PATTERN.test(entry.contentSha256)
      ) {
        return stableFailure(
          "VIVI_FMT_ASSET_HASH_MISMATCH",
          `${assetPath}/contentSha256`,
          "Embedded asset contentSha256 is invalid",
        );
      }
      if (
        (typeof entry.sizeBytes === "number" &&
          entry.sizeBytes > MAX_EMBEDDED_BLOB_BYTES) ||
        (typeof entry.data === "string" && entry.data.length > MAX_EMBEDDED_BASE64_CHARS)
      ) {
        return stableFailure(
          "VIVI_ASSET_TOO_LARGE_FOR_EMBED",
          `${assetPath}/${
            typeof entry.sizeBytes === "number" &&
            entry.sizeBytes > MAX_EMBEDDED_BLOB_BYTES
              ? "sizeBytes"
              : "data"
          }`,
          "Embedded asset exceeds the blob ceiling",
        );
      }
      if (typeof entry.data !== "string" || !RAW_BASE64_PATTERN.test(entry.data)) {
        return stableFailure(
          "VIVI_FMT_ASSET_HASH_MISMATCH",
          `${assetPath}/data`,
          "Embedded asset data is not raw base64",
        );
      }
      if (
        typeof entry.sizeBytes !== "number" ||
        !Number.isSafeInteger(entry.sizeBytes) ||
        entry.sizeBytes < 0 ||
        entry.encoding !== "base64"
      ) {
        return stableFailure(
          "VIVI_FMT_ASSET_HASH_MISMATCH",
          `${assetPath}/${entry.encoding !== "base64" ? "encoding" : "sizeBytes"}`,
          "Embedded asset metadata is invalid",
        );
      }
    }
  }

  const malformedExtensionRef = classifyMalformedExtensionAssetRef(root);
  if (malformedExtensionRef) return malformedExtensionRef;

  const refs = collectAssetRefs(root);
  if (root.assetMode === "embedded") {
    for (const located of refs.filter(({ embeddedExtension }) => embeddedExtension)) {
      const storageKind = located.value.storageKind;
      if (storageKind !== "blob") {
        return stableFailure(
          "VIVI_ASSET_TOO_LARGE_FOR_EMBED",
          `${located.path}/storageKind`,
          "Embedded extension assets must be direct blobs",
        );
      }
      const sizeBytes = located.value.sizeBytes;
      if (
        !Number.isSafeInteger(sizeBytes) ||
        typeof sizeBytes !== "number" ||
        sizeBytes < 0 ||
        sizeBytes > MAX_EMBEDDED_BLOB_BYTES
      ) {
        return stableFailure(
          "VIVI_ASSET_TOO_LARGE_FOR_EMBED",
          `${located.path}/sizeBytes`,
          "Embedded extension asset exceeds the blob ceiling",
        );
      }
    }
  }

  for (const { value: ref, path } of refs) {
    if (
      typeof ref.objectAddress !== "string" ||
      !SHA256_PATTERN.test(ref.objectAddress)
    ) {
      return stableFailure(
        "VIVI_FMT_ASSET_REF_INVALID",
        `${path}/objectAddress`,
        "Asset objectAddress is not a SHA-256 digest",
      );
    }
    if (
      typeof ref.contentSha256 !== "string" ||
      !SHA256_PATTERN.test(ref.contentSha256)
    ) {
      return stableFailure(
        "VIVI_FMT_ASSET_REF_INVALID",
        `${path}/contentSha256`,
        "Asset contentSha256 is not a SHA-256 digest",
      );
    }
    if (
      ref.storageKind === "blob" &&
      ref.objectAddress.toLowerCase() !== ref.contentSha256.toLowerCase()
    ) {
      return stableFailure(
        "VIVI_FMT_ASSET_REF_INVALID",
        `${path}/objectAddress`,
        "Blob objectAddress must equal contentSha256",
      );
    }
    if (ref.storageKind !== "blob" && ref.storageKind !== "chunk_manifest") {
      return stableFailure(
        "VIVI_FMT_ASSET_REF_INVALID",
        `${path}/storageKind`,
        "Asset storageKind is invalid",
      );
    }
    if (
      typeof ref.sizeBytes !== "number" ||
      !Number.isSafeInteger(ref.sizeBytes) ||
      ref.sizeBytes < 0
    ) {
      return stableFailure(
        "VIVI_FMT_ASSET_REF_INVALID",
        `${path}/sizeBytes`,
        "Asset sizeBytes is invalid",
      );
    }
    if (ref.storageKind === "blob" && ref.sizeBytes > MAX_EMBEDDED_BLOB_BYTES) {
      return stableFailure(
        "VIVI_ASSET_TOO_LARGE_FOR_EMBED",
        `${path}/sizeBytes`,
        "Blob exceeds the Project Format v11 blob ceiling",
      );
    }
    if (
      ref.storageKind === "chunk_manifest" &&
      (ref.sizeBytes <= MAX_EMBEDDED_BLOB_BYTES ||
        ref.sizeBytes > MAX_CHUNK_MANIFEST_BYTES)
    ) {
      return stableFailure(
        "VIVI_FMT_ASSET_REF_INVALID",
        path,
        "Chunk manifest logical size is outside the accepted range",
      );
    }
    if (invalidAssetMediaType(ref.mediaType)) {
      return stableFailure(
        "VIVI_FMT_ASSET_REF_INVALID",
        `${path}/mediaType`,
        "Asset mediaType is invalid",
      );
    }
    if (path.startsWith("/atlases/") && ref.mediaType !== "image/png") {
      return stableFailure(
        "VIVI_FMT_ASSET_REF_INVALID",
        `${path}/mediaType`,
        "Referenced atlas mediaType must be image/png",
      );
    }
  }
  return null;
}

function classifyMalformedExtensionAssetRef(
  root: Record<string, unknown>,
): StableSchemaFailure | null {
  const extensions = asRecord(root.extensions);
  if (!extensions) return null;
  const requiredFields = [
    "objectAddress",
    "storageKind",
    "contentSha256",
    "mediaType",
    "sizeBytes",
  ] as const;
  for (const [extensionId, value] of Object.entries(extensions)) {
    const envelope = asRecord(value);
    if (!envelope || !Object.hasOwn(envelope, "blobRefs")) continue;
    const refs = envelope.blobRefs;
    const refsPath = `/extensions/${escapePointer(extensionId)}/blobRefs`;
    if (!Array.isArray(refs)) {
      return stableFailure(
        "VIVI_FMT_ASSET_REF_INVALID",
        refsPath,
        "Extension blobRefs must be an array",
      );
    }
    for (const [index, refValue] of refs.entries()) {
      const path = `${refsPath}/${index}`;
      const ref = asRecord(refValue);
      if (!ref) {
        return stableFailure(
          "VIVI_FMT_ASSET_REF_INVALID",
          path,
          "Asset reference must be an object",
        );
      }
      const missing = requiredFields.find((field) => !Object.hasOwn(ref, field));
      if (missing !== undefined) {
        return stableFailure(
          "VIVI_FMT_ASSET_REF_INVALID",
          `${path}/${missing}`,
          `Asset reference is missing ${missing}`,
        );
      }
    }
  }
  return null;
}

function invalidAssetMediaType(value: unknown): boolean {
  if (typeof value !== "string") return true;
  const byteLength = new TextEncoder().encode(value).byteLength;
  return (
    byteLength < 1 ||
    byteLength > 255 ||
    [...value].some((character) => {
      const codePoint = character.codePointAt(0) ?? -1;
      return codePoint <= 0x1f || codePoint === 0x7f;
    })
  );
}

interface LocatedAssetRef {
  value: Record<string, unknown>;
  path: string;
  embeddedExtension: boolean;
}

function collectAssetRefs(root: Record<string, unknown>): LocatedAssetRef[] {
  const result: LocatedAssetRef[] = [];
  if (root.assetMode === "referenced" && Array.isArray(root.atlases)) {
    for (const [index, value] of root.atlases.entries()) {
      const image = asRecord(asRecord(value)?.image);
      if (image) {
        result.push({
          value: image,
          path: `/atlases/${index}/image`,
          embeddedExtension: false,
        });
      }
    }
  }

  const extensions = asRecord(root.extensions);
  if (!extensions) return result;
  for (const [extensionId, value] of Object.entries(extensions)) {
    const refs = asRecord(value)?.blobRefs;
    if (!Array.isArray(refs)) continue;
    for (const [index, refValue] of refs.entries()) {
      const ref = asRecord(refValue);
      if (!ref) continue;
      result.push({
        value: ref,
        path: `/extensions/${escapePointer(extensionId)}/blobRefs/${index}`,
        embeddedExtension: root.assetMode === "embedded",
      });
    }
  }
  return result;
}

function stableFailure(
  code: ProjectFormatV11SemanticErrorCode,
  path: string,
  message: string,
): StableSchemaFailure {
  return { code, path, message };
}

function chooseSpecificSchemaIssue(
  issues: readonly ProjectFormatV11SchemaIssue[],
): ProjectFormatV11SchemaIssue {
  return (
    [...issues]
      .filter(
        ({ keyword }) => !["oneOf", "anyOf", "allOf", "not", "if"].includes(keyword),
      )
      .sort((left, right) => right.instancePath.length - left.instancePath.length)[0] ??
    issues[0] ?? {
      instancePath: "",
      schemaPath: "",
      keyword: "schema",
      message: "schema validation failed",
      params: {},
    }
  );
}

function schemaIssuePath(issue: ProjectFormatV11SchemaIssue): string {
  let path = issue.instancePath || "/";
  const property =
    issue.keyword === "additionalProperties"
      ? issue.params.additionalProperty
      : issue.keyword === "required"
        ? issue.params.missingProperty
        : undefined;
  if (typeof property === "string") {
    path = `${issue.instancePath}/${escapePointer(property)}`;
  }
  return path || "/";
}

function findUnknownAdditionalProperty(
  value: ViviJsonValueV11,
  issues: readonly ProjectFormatV11SchemaIssue[],
): string | null {
  for (const issue of issues) {
    if (issue.keyword !== "additionalProperties") continue;
    const property = issue.params.additionalProperty;
    if (typeof property !== "string") continue;
    if (issue.instancePath === "" && KNOWN_ROOT_FIELDS.has(property)) continue;
    if (
      /^\/atlases\/\d+$/u.test(issue.instancePath) &&
      ["id", "image", "width", "height", "entries"].includes(property)
    ) {
      continue;
    }
    const target = resolvePointer(value, issue.instancePath);
    if (asRecord(target) && Object.hasOwn(target as object, property)) {
      return `${issue.instancePath}/${escapePointer(property)}`;
    }
  }
  return null;
}

function resolvePointer(value: ViviJsonValueV11, pointer: string): unknown {
  if (pointer === "") return value;
  let current: unknown = value;
  for (const encoded of pointer.slice(1).split("/")) {
    const segment = encoded.replaceAll("~1", "/").replaceAll("~0", "~");
    if (Array.isArray(current)) {
      current = current[Number(segment)];
    } else {
      current = asRecord(current)?.[segment];
    }
  }
  return current;
}

function isLegacyVersion(value: unknown): boolean {
  return (
    Number.isInteger(value) && typeof value === "number" && value >= 1 && value <= 10
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

async function assertOpaqueExtensionsUnchanged(
  document: ParsedProjectFormatV11,
  state: ParsedDocumentState,
): Promise<void> {
  const rawWire = document.wire as unknown as Record<string, unknown>;
  const rawExtensions = asRecord(rawWire.extensions) ?? {};
  const rawRequirements = Array.isArray(rawWire.requires) ? rawWire.requires : [];
  const currentExtensions = document.normalized.extensions ?? {};
  const loadedOpaqueIds = new Set(
    state.opaqueRecords.map(({ extensionId }) => extensionId),
  );
  for (const [extensionId, envelope] of Object.entries(currentExtensions)) {
    const entry = state.options.registry.get(extensionId);
    const supported =
      entry?.supportedSchemaVersions.includes(envelope.schemaVersion) ?? false;
    if (!supported && !loadedOpaqueIds.has(extensionId)) {
      throw unregisteredExtension(extensionId, "Unregistered extension was added");
    }
  }

  for (const record of state.opaqueRecords) {
    const rawEnvelope = rawExtensions[record.extensionId];
    const rawRequirement = rawRequirements
      .map(asRecord)
      .find((requirement) => requirement?.id === record.capabilityId);
    if (!rawEnvelope || !rawRequirement) {
      throw unregisteredExtension(
        record.extensionId,
        "Loaded opaque extension snapshot is incomplete",
      );
    }
    const loadedHash = await hashCanonicalValue(
      {
        extensionId: record.extensionId,
        envelope: rawEnvelope,
        preservedRequirement: rawRequirement,
      },
      state.options.sha256,
    );
    if (loadedHash !== record.loadedCanonicalHash) {
      throw unregisteredExtension(
        record.extensionId,
        "Loaded opaque extension snapshot no longer matches its load hash",
      );
    }

    const envelope = currentExtensions[record.extensionId];
    const requirements = (document.normalized.requires ?? []).filter(
      ({ id }) => id === record.capabilityId,
    );
    if (!envelope || requirements.length !== 1) {
      throw unregisteredExtension(
        record.extensionId,
        "Opaque extension or its preserved requirement was changed",
      );
    }
    const currentHash = await hashCanonicalValue(
      {
        extensionId: record.extensionId,
        envelope,
        preservedRequirement: requirements[0],
      },
      state.options.sha256,
    );
    if (currentHash !== record.normalizedCanonicalHash) {
      throw unregisteredExtension(record.extensionId, "Opaque extension was changed");
    }
  }
}

function unregisteredExtension(
  extensionId: string,
  message: string,
): ProjectFormatV11SemanticError {
  return new ProjectFormatV11SemanticError(
    "VIVI_FMT_UNREGISTERED_EXTENSION",
    `/extensions/${escapePointer(extensionId)}`,
    message,
  );
}

function deriveCurrentRequirements(
  normalized: NormalizedViviFileDataV11,
  options: StoredCodecOptions,
): ViviRequiredCapabilityV11[] {
  const candidate = normalizedAsV11Wire(normalized);
  const provisional = seedKnownExtensionRequirements(candidate, options.registry);
  if (provisional.length > 0) candidate.requires = provisional;
  return deriveProjectFormatV11Requirements(candidate, {
    registry: options.registry,
  });
}

function seedKnownExtensionRequirements(
  wire: ViviFileDataWireV11,
  registry: ExtensionRegistryV11,
): ViviRequiredCapabilityV11[] {
  const requirements = cloneJsonValue(wire.requires ?? []);
  const ids = new Set(requirements.map(({ id }) => id));
  for (const [extensionId, envelope] of Object.entries(wire.extensions ?? {})) {
    const entry = registry.get(extensionId);
    if (!entry?.supportedSchemaVersions.includes(envelope.schemaVersion)) continue;
    const capabilityId = entry.requiredCapability.id;
    if (ids.has(capabilityId)) continue;
    const minVersion =
      entry.requiredCapability.minVersionForSchema[envelope.schemaVersion];
    if (
      minVersion === undefined ||
      !Number.isSafeInteger(minVersion) ||
      minVersion <= 0
    ) {
      continue;
    }
    requirements.push({
      id: capabilityId,
      minVersion,
      requiredFor: [...entry.affects],
    });
    ids.add(capabilityId);
  }
  return requirements;
}

function normalizedAsV11Wire(normalized: NormalizedViviFileDataV11): ViviFileDataWireV11 {
  const wire = {
    version: 11,
    assetMode: normalized.assetMode,
    project: materializeCanonicalV11Project(projectOrdinaryMasks(normalized.project)),
    atlases: normalized.atlases,
  } as unknown as ViviFileDataWireV11;
  if (normalized.documentId !== undefined) wire.documentId = normalized.documentId;
  if (normalized.requires !== undefined) wire.requires = normalized.requires;
  if (normalized.extensions !== undefined) wire.extensions = normalized.extensions;
  if (normalized.embeddedAssets !== undefined) {
    (wire as ViviFileDataWireV11Embedded).embeddedAssets = normalized.embeddedAssets;
  }
  return wire;
}

function projectOrdinaryV10(
  normalized: NormalizedViviFileDataV11,
): ViviFileDataWireV1To10 {
  const project = projectOrdinaryMasks(normalized.project) as ProjectDataWireV1To10;
  const atlases = normalized.atlases.map((atlas) => {
    if (typeof atlas.image !== "string") {
      throw new ProjectFormatV11SerializationError(
        "VIVI_FMT_SELF_CHECK_FAILED",
        "Version 10 projection cannot contain referenced atlas assets",
      );
    }
    return {
      image: atlas.image,
      width: atlas.width,
      height: atlas.height,
      entries: cloneJsonValue(atlas.entries),
    };
  });
  const wire: ViviFileDataWireV1To10 = { version: 10, project, atlases };
  if (normalized.profile !== undefined) wire.profile = normalized.profile;
  return wire;
}

function projectOrdinaryV11(
  normalized: NormalizedViviFileDataV11,
  requirements: readonly ViviRequiredCapabilityV11[],
): ViviFileDataWireV11 {
  const project = materializeCanonicalV11Project(
    projectOrdinaryMasks(normalized.project),
  );
  const wire =
    normalized.assetMode === "embedded"
      ? projectEmbeddedV11(normalized, project)
      : projectReferencedV11(normalized, project);

  if (normalized.documentId !== undefined) wire.documentId = normalized.documentId;
  if (requirements.length > 0) wire.requires = cloneJsonValue([...requirements]);
  if (normalized.extensions !== undefined) {
    wire.extensions = normalizeExtensionDigests(normalized.extensions);
  }
  if (normalized.embeddedAssets !== undefined) {
    (wire as ViviFileDataWireV11Embedded).embeddedAssets = normalizeEmbeddedAssets(
      normalized.embeddedAssets,
    );
  }
  return wire;
}

function projectEmbeddedV11(
  normalized: NormalizedViviFileDataV11,
  project: ProjectDataV11,
): ViviFileDataWireV11Embedded {
  const atlases: ViviAtlasDataEmbeddedV11[] = normalized.atlases.map((atlas) => {
    if (typeof atlas.image !== "string") {
      throw new ProjectFormatV11SerializationError(
        "VIVI_FMT_SELF_CHECK_FAILED",
        "Embedded projection cannot contain referenced atlas assets",
      );
    }
    return {
      id: atlas.id,
      image: atlas.image,
      width: atlas.width,
      height: atlas.height,
      entries: cloneJsonValue(atlas.entries),
    };
  });
  return { version: 11, assetMode: "embedded", project, atlases };
}

function projectReferencedV11(
  normalized: NormalizedViviFileDataV11,
  project: ProjectDataV11,
): ViviFileDataWireV11Referenced {
  const atlases: ViviAtlasDataReferencedV11[] = normalized.atlases.map((atlas) => {
    if (typeof atlas.image === "string") {
      throw new ProjectFormatV11SerializationError(
        "VIVI_FMT_SELF_CHECK_FAILED",
        "Referenced projection cannot contain inline atlas bytes",
      );
    }
    return {
      id: atlas.id,
      image: normalizeAssetRef(atlas.image),
      width: atlas.width,
      height: atlas.height,
      entries: cloneJsonValue(atlas.entries),
    };
  });
  return { version: 11, assetMode: "referenced", project, atlases };
}

function projectOrdinaryMasks(
  project: NormalizedViviFileDataV11["project"],
): NormalizedViviFileDataV11["project"] | ProjectDataV11 | ProjectDataWireV1To10 {
  const output = cloneJsonValue(project) as NormalizedViviFileDataV11["project"];
  output.layers = project.layers.map(projectOrdinaryMaskLayer) as typeof output.layers;
  return output;
}

function materializeCanonicalV11Project(
  project: NormalizedViviFileDataV11["project"] | ProjectDataV11 | ProjectDataWireV1To10,
): ProjectDataV11 {
  const output = cloneJsonValue(project) as Record<string, unknown>;
  output.name ??= "Untitled";
  output.width ??= 1;
  output.height ??= 1;
  output.clips ??= [];
  output.scenes ??= [];
  output.physicsGroups ??= [];
  output.lipsyncConfig ??= {
    enabled: false,
    targetParameterId: null,
    source: "microphone",
    threshold: 0.02,
    smoothing: 0.7,
    gain: 2,
  };
  output.skins ??= {};
  output.parameterBindings ??= [];
  output.sceneBlends ??= [];
  output.ikControllers ??= [];
  output.offscreenTargets ??= [];
  output.expressionPresets ??= [];
  output.colliders ??= [];
  output.stateMachines ??= [];
  return output as unknown as ProjectDataV11;
}

function projectOrdinaryMaskLayer(layer: NormalizedProjectLayerV11): ProjectLayerV11 {
  const output = cloneJsonValue(layer) as unknown as ProjectLayerV11;
  output.children = layer.children.map(projectOrdinaryMaskLayer);
  delete output.clipMaskIds;
  const edges = layer.clipMasks;
  if (edges === undefined) {
    delete output.clipMasks;
  } else if (edges.some(({ invert }) => invert)) {
    output.clipMasks = edges.map(({ layerId, invert }) => ({ layerId, invert }));
  } else {
    output.clipMaskIds = edges.map(({ layerId }) => layerId);
    delete output.clipMasks;
  }
  return output;
}

function normalizeExtensionDigests(
  extensions: Record<string, ViviExtensionEnvelopeV11>,
): Record<string, ViviExtensionEnvelopeV11> {
  const output: Record<string, ViviExtensionEnvelopeV11> = Object.create(null);
  for (const [extensionId, envelope] of Object.entries(extensions)) {
    const normalized: ViviExtensionEnvelopeV11 = {
      schemaVersion: envelope.schemaVersion,
      requiredCapabilityId: envelope.requiredCapabilityId,
      data: cloneJsonValue(envelope.data),
    };
    if (envelope.blobRefs !== undefined) {
      normalized.blobRefs = envelope.blobRefs.map(normalizeAssetRef);
    }
    output[extensionId] = normalized;
  }
  return output;
}

function normalizeEmbeddedAssets(
  assets: Record<string, ViviEmbeddedAssetV11>,
): Record<string, ViviEmbeddedAssetV11> {
  const output: Record<string, ViviEmbeddedAssetV11> = Object.create(null);
  for (const [key, entry] of Object.entries(assets)) {
    const match = /^sha256:([A-Fa-f0-9]{64})$/u.exec(key);
    if (!match?.[1]) {
      throw new ProjectFormatV11SerializationError(
        "VIVI_FMT_SELF_CHECK_FAILED",
        `Invalid embedded asset address ${key}`,
      );
    }
    const normalizedKey = `sha256:${match[1].toLowerCase()}`;
    if (Object.hasOwn(output, normalizedKey)) {
      throw new ProjectFormatV11SemanticError(
        "VIVI_FMT_DUPLICATE_MAP_KEY",
        `/embeddedAssets/${escapePointer(key)}`,
        "Embedded asset keys collide after lowercase normalization",
      );
    }
    output[normalizedKey] = {
      contentSha256: normalizeSha256(
        entry.contentSha256,
        `${normalizedKey}/contentSha256`,
      ),
      sizeBytes: entry.sizeBytes,
      encoding: entry.encoding,
      data: entry.data,
    };
  }
  return output;
}

function normalizeAssetRef(ref: ViviAssetRefV11): ViviAssetRefV11 {
  return {
    objectAddress: normalizeSha256(ref.objectAddress, "objectAddress"),
    storageKind: ref.storageKind,
    contentSha256: normalizeSha256(ref.contentSha256, "contentSha256"),
    mediaType: ref.mediaType,
    sizeBytes: ref.sizeBytes,
  };
}

function normalizeSha256(value: string, label: string): string {
  if (!SHA256_PATTERN.test(value)) {
    throw new ProjectFormatV11SerializationError(
      "VIVI_FMT_SELF_CHECK_FAILED",
      `${label} is not a SHA-256 digest`,
    );
  }
  return value.toLowerCase();
}

function cloneJsonValue<T>(value: T): T {
  return parseJsonV11(canonicalizeJsonV11(value)) as T;
}

async function hashCanonicalValue(value: unknown, sha256?: Sha256V11): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalizeJsonV11(value));
  const digest = sha256 ? await sha256(bytes) : await defaultSha256(bytes);
  if (!SHA256_PATTERN.test(digest)) {
    throw new ProjectFormatV11SemanticError(
      "VIVI_FMT_ASSET_HASH_MISMATCH",
      "/extensions",
      "SHA-256 implementation returned an invalid digest",
    );
  }
  return digest.toLowerCase();
}

async function defaultSha256(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("WebCrypto SHA-256 is unavailable");
  const ownedBytes = new Uint8Array(bytes.byteLength);
  ownedBytes.set(bytes);
  const digest = await subtle.digest("SHA-256", ownedBytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function escapePointer(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}
