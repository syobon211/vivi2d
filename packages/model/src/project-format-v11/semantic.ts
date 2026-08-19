import {
  VIVI_RUNTIME_FORBIDDEN_KIND_OR_TYPE,
  VIVI_RUNTIME_FORBIDDEN_RAW_KEYS,
  VIVI_RUNTIME_LIMITS,
} from "../runtime-spec";
import { semanticError } from "./errors";
import { canonicalizeJsonV11 } from "./json-contract";
import type {
  CapabilityPurposeV11,
  ClassifiedExtensionRecordV11,
  ExtensionRegistryEntryV11,
  ExtensionRegistryV11,
  NormalizedProjectDataV11,
  NormalizedProjectDataWireV1To10,
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
  ViviEmbeddedAssetV11,
  ViviExtensionEnvelopeV11,
  ViviFileDataWireThroughV11,
  ViviFileDataWireV11,
  ViviRequiredCapabilityV11,
} from "./types";

const MAX_EMBEDDED_BLOB_BYTES = 16 * 1024 * 1024;
const MAX_EXTENSION_CANONICAL_BYTES = 16 * 1024 * 1024;
const MAX_CHUNK_MANIFEST_BYTES = 64 * 1024 * 1024 * 1024;
const SHA256_PATTERN = /^[A-Fa-f0-9]{64}$/u;
const ATLAS_ID_PATTERN = /^[A-Za-z0-9_-]{1,120}$/u;
const CORE_BLEND_MODES = new Set(["normal", "add", "multiply", "screen"]);
const PURPOSE_ORDER = ["render", "edit"] as const;
const FORBIDDEN_RAW_KEYS = new Set<string>(VIVI_RUNTIME_FORBIDDEN_RAW_KEYS);
const FORBIDDEN_KIND_OR_TYPE = new Set<string>(VIVI_RUNTIME_FORBIDDEN_KIND_OR_TYPE);

interface RequirementAnalysis {
  inputById: Map<string, ViviRequiredCapabilityV11>;
  derived: ViviRequiredCapabilityV11[];
  classified: ClassifiedExtensionRecordV11[];
  opaqueRequirements: Array<{
    extensionId: string;
    envelope: ViviExtensionEnvelopeV11;
    requirement: ViviRequiredCapabilityV11;
  }>;
}

interface LayerState {
  layersById: Map<string, ProjectLayerV11>;
  pathsById: Map<string, string>;
  meshIds: Set<string>;
  boneIds: Set<string>;
}

export async function validateProjectFormatV11Semantics(
  wire: ViviFileDataWireThroughV11,
  options: ProjectFormatV11SemanticOptions,
): Promise<SemanticValidationResult> {
  scanForbiddenCore(wire);
  validateInMemoryJsonNumbers(wire);

  // v1..10 retain their frozen accepted set. Applying v11 graph/reference
  // invariants retroactively would turn historically loadable files into
  // errors instead of merely supplying the deterministic normalized view.
  if (!isV11Wire(wire)) {
    return {
      normalized: normalizeLoadedWire(wire),
      derivedRequirements: [],
      compatibility: "full",
      classifiedExtensions: [],
      opaqueExtensions: [],
    };
  }

  const project = wire.project;
  const layerState = validateProjectGraph(project);
  validateProjectReferences(project, layerState);
  validateAtlasCoverage(wire, layerState);

  const sha256 = options.sha256 ?? defaultSha256;
  await validateV11Assets(wire, sha256);
  validateExtensionCanonicalSize(wire.extensions);

  const requirements = analyzeRequirements(wire, options.registry);
  assertWireRequirementsMatch(wire, requirements.derived);

  const opaqueExtensions = await buildOpaqueRecords(
    requirements.opaqueRequirements,
    sha256,
  );
  const compatibility = resolveCompatibility(
    requirements.derived,
    opaqueExtensions.length,
    options.supportedCapabilities,
  );

  return {
    normalized: normalizeLoadedWire(wire),
    derivedRequirements: requirements.derived,
    compatibility,
    classifiedExtensions: requirements.classified,
    opaqueExtensions,
  };
}

export function deriveProjectFormatV11Requirements(
  wire: ViviFileDataWireThroughV11,
  options: Pick<ProjectFormatV11SemanticOptions, "registry">,
): ViviRequiredCapabilityV11[] {
  if (!isV11Wire(wire)) return [];
  return analyzeRequirements(wire, options.registry).derived;
}

function analyzeRequirements(
  wire: ViviFileDataWireThroughV11,
  registry: ExtensionRegistryV11,
): RequirementAnalysis {
  const inputRequirements = wire.version === 11 ? (wire.requires ?? []) : [];
  const inputById = new Map<string, ViviRequiredCapabilityV11>();
  for (const [index, requirement] of inputRequirements.entries()) {
    if (inputById.has(requirement.id)) {
      semanticError(
        "VIVI_FMT_DUPLICATE_REQUIRES_ID",
        `/requires/${index}/id`,
        `duplicate requires id ${requirement.id}`,
      );
    }
    inputById.set(requirement.id, requirement);
  }

  const sources: ViviRequiredCapabilityV11[] = deriveCoreRequirements(wire.project, wire);
  const classified: ClassifiedExtensionRecordV11[] = [];
  const opaqueRequirements: RequirementAnalysis["opaqueRequirements"] = [];

  if (wire.version === 11) {
    for (const [extensionId, envelope] of Object.entries(wire.extensions ?? {})) {
      const path = `/extensions/${escapePointer(extensionId)}`;
      const preserved = inputById.get(envelope.requiredCapabilityId);
      if (!preserved) {
        semanticError(
          "VIVI_FMT_EXTENSION_WITHOUT_CAPABILITY",
          `${path}/requiredCapabilityId`,
          `extension ${extensionId} has no matching requires entry`,
        );
      }

      const entry = registry.get(extensionId);
      if (entry && entry.id !== extensionId) {
        semanticError(
          "invalidSemanticValue",
          path,
          `registry entry id ${entry.id} does not match extension map key ${extensionId}`,
        );
      }
      if (entry && envelope.requiredCapabilityId !== entry.requiredCapability.id) {
        classified.push({
          extensionId,
          envelope: cloneJsonSafe(envelope),
          classification: "invalid",
        });
        semanticError(
          "VIVI_FMT_REQUIRES_MISMATCH",
          `${path}/requiredCapabilityId`,
          `extension ${extensionId} disagrees with its registry capability`,
        );
      }

      if (entry?.supportedSchemaVersions.includes(envelope.schemaVersion)) {
        validateKnownExtension(entry, envelope, path);
        const minVersion =
          entry.requiredCapability.minVersionForSchema[envelope.schemaVersion];
        if (
          minVersion === undefined ||
          !Number.isSafeInteger(minVersion) ||
          minVersion <= 0
        ) {
          semanticError(
            "invalidSemanticValue",
            path,
            `registry has no positive minVersion for schema ${envelope.schemaVersion}`,
          );
        }
        const requirement: ViviRequiredCapabilityV11 = {
          id: entry.requiredCapability.id,
          minVersion,
          requiredFor: [...entry.affects],
        };
        sources.push(requirement);
        classified.push({
          extensionId,
          envelope: cloneJsonSafe(envelope),
          classification: "knownSupported",
        });
        continue;
      }

      if (!hasOnlyEditPurpose(preserved)) {
        classified.push({
          extensionId,
          envelope: cloneJsonSafe(envelope),
          classification: "invalid",
        });
        semanticError(
          "VIVI_FMT_REQUIRES_MISMATCH",
          `/requires/${inputRequirements.indexOf(preserved)}/requiredFor`,
          `opaque extension ${extensionId} must be edit-only`,
        );
      }
      sources.push(preserved);
      opaqueRequirements.push({
        extensionId,
        envelope: cloneJsonSafe(envelope),
        requirement: cloneJsonSafe(preserved),
      });
      classified.push({
        extensionId,
        envelope: cloneJsonSafe(envelope),
        classification: "opaque",
      });
    }
  }

  const derived = aggregateRequirements(sources);
  for (const opaque of opaqueRequirements) {
    const aggregated = derived.find(({ id }) => id === opaque.requirement.id);
    if (!aggregated || !requirementsEqual(aggregated, opaque.requirement)) {
      semanticError(
        "VIVI_FMT_REQUIRES_MISMATCH",
        `/extensions/${escapePointer(opaque.extensionId)}`,
        `aggregation would change opaque requirement ${opaque.requirement.id}`,
      );
    }
  }

  return { inputById, derived, classified, opaqueRequirements };
}

function validateKnownExtension(
  entry: ExtensionRegistryEntryV11,
  envelope: ViviExtensionEnvelopeV11,
  path: string,
): void {
  if (entry.affects.length === 0 || entry.affects.some((purpose) => purpose !== "edit")) {
    semanticError(
      "invalidSemanticValue",
      path,
      `v11 registry entry ${entry.id} must be edit-only`,
    );
  }
  if (typeof entry.validateEnvelope !== "function") {
    semanticError(
      "invalidSemanticValue",
      path,
      `extension ${entry.id} has no registered schema validator`,
    );
  }
  let valid = false;
  try {
    const validateEnvelope = entry.validateEnvelope;
    valid = validateEnvelope(cloneJsonSafe(envelope)) === true;
  } catch {
    valid = false;
  }
  if (!valid) {
    semanticError(
      "invalidSemanticValue",
      path,
      `extension ${entry.id} failed its registered schema`,
    );
  }
}

function deriveCoreRequirements(
  project: ProjectDataWireV1To10 | ProjectDataV11,
  wire: ViviFileDataWireThroughV11,
): ViviRequiredCapabilityV11[] {
  const requirements: ViviRequiredCapabilityV11[] = [];
  if ((project.clips?.length ?? 0) > 0) {
    requirements.push(coreRequirement("vivi.cap.clipPlayback"));
  }
  if ((project.stateMachines?.length ?? 0) > 0) {
    requirements.push(coreRequirement("vivi.cap.stateMachinePlayback"));
  }
  if (projectUsesExtendedBlendMode(project.layers)) {
    requirements.push(coreRequirement("vivi.cap.extendedBlendModes"));
  }
  if (projectHasInvertedMask(project.layers)) {
    requirements.push(coreRequirement("vivi.cap.maskInvert"));
  }
  if (wire.version === 11 && wire.assetMode === "referenced") {
    requirements.push(coreRequirement("vivi.cap.referencedAssets"));
  }
  return requirements;
}

function coreRequirement(id: string): ViviRequiredCapabilityV11 {
  return { id, minVersion: 1, requiredFor: ["render"] };
}

function aggregateRequirements(
  requirements: readonly ViviRequiredCapabilityV11[],
): ViviRequiredCapabilityV11[] {
  const grouped = new Map<
    string,
    { minVersion: number; requiredFor: Set<CapabilityPurposeV11> }
  >();
  for (const requirement of requirements) {
    const current = grouped.get(requirement.id) ?? {
      minVersion: 0,
      requiredFor: new Set<CapabilityPurposeV11>(),
    };
    current.minVersion = Math.max(current.minVersion, requirement.minVersion);
    for (const purpose of requirement.requiredFor) current.requiredFor.add(purpose);
    grouped.set(requirement.id, current);
  }
  return [...grouped.entries()]
    .map(([id, value]) => ({
      id,
      minVersion: value.minVersion,
      requiredFor: PURPOSE_ORDER.filter((purpose) => value.requiredFor.has(purpose)),
    }))
    .sort((left, right) => utf8Compare(left.id, right.id));
}

function assertWireRequirementsMatch(
  wire: ViviFileDataWireV11,
  expected: readonly ViviRequiredCapabilityV11[],
): void {
  const actual = wire.requires ?? [];
  if (actual.length !== expected.length) {
    semanticError(
      "VIVI_FMT_REQUIRES_MISMATCH",
      "/requires",
      "wire requires entries do not match requirements derived from content",
    );
  }
  const expectedById = new Map(
    expected.map((requirement) => [requirement.id, requirement]),
  );
  for (const [index, requirement] of actual.entries()) {
    const derived = expectedById.get(requirement.id);
    if (!derived || !requirementsEqual(derived, requirement)) {
      semanticError(
        "VIVI_FMT_REQUIRES_MISMATCH",
        `/requires/${index}`,
        `requires entry ${requirement.id} does not match derived content`,
      );
    }
  }
}

function requirementsEqual(
  left: ViviRequiredCapabilityV11,
  right: ViviRequiredCapabilityV11,
): boolean {
  if (left.id !== right.id || left.minVersion !== right.minVersion) return false;
  const leftPurposes = new Set(left.requiredFor);
  const rightPurposes = new Set(right.requiredFor);
  return (
    leftPurposes.size === rightPurposes.size &&
    [...leftPurposes].every((purpose) => rightPurposes.has(purpose))
  );
}

function hasOnlyEditPurpose(requirement: ViviRequiredCapabilityV11): boolean {
  return requirement.requiredFor.length === 1 && requirement.requiredFor[0] === "edit";
}

async function buildOpaqueRecords(
  records: RequirementAnalysis["opaqueRequirements"],
  sha256: Sha256V11,
): Promise<OpaqueExtensionRecordV11[]> {
  return Promise.all(
    records.map(async ({ extensionId, envelope, requirement }) => ({
      extensionId,
      envelope,
      preservedRequirement: requirement,
      loadedCanonicalHash: await hashCanonicalValue(
        { extensionId, envelope, preservedRequirement: requirement },
        sha256,
      ),
    })),
  );
}

function resolveCompatibility(
  requirements: readonly ViviRequiredCapabilityV11[],
  opaqueCount: number,
  supported: ReadonlyMap<string, number>,
): ProjectCompatibilityV11 {
  let missingEdit = false;
  for (const requirement of requirements) {
    const version = supported.get(requirement.id) ?? 0;
    if (version >= requirement.minVersion) continue;
    if (requirement.requiredFor.includes("render")) return "invalid";
    if (requirement.requiredFor.includes("edit")) missingEdit = true;
  }
  return missingEdit || opaqueCount > 0 ? "readOnly" : "full";
}

async function validateV11Assets(
  wire: ViviFileDataWireV11,
  sha256: Sha256V11,
): Promise<void> {
  if (wire.assetMode === "referenced") {
    if (Object.keys(wire.embeddedAssets ?? {}).length > 0) {
      semanticError(
        "VIVI_FMT_MIXED_ASSET_MODE",
        "/embeddedAssets",
        "referenced mode cannot contain embedded assets",
      );
    }
    for (const [index, atlas] of wire.atlases.entries()) {
      validateAssetRef(atlas.image, `/atlases/${index}/image`, false);
      if (atlas.image.mediaType !== "image/png") {
        semanticError(
          "VIVI_FMT_ASSET_REF_INVALID",
          `/atlases/${index}/image/mediaType`,
          "referenced atlas mediaType must be image/png",
        );
      }
    }
    forEachBlobRef(wire, (ref, path) => validateAssetRef(ref, path, false));
    return;
  }

  const reachable = new Map<string, Array<{ ref: ViviAssetRefV11; path: string }>>();
  forEachBlobRef(wire, (ref, path) => {
    validateAssetRef(ref, path, true);
    const digest = normalizeSha256(ref.contentSha256, `${path}/contentSha256`);
    const matches = reachable.get(digest) ?? [];
    matches.push({ ref, path });
    reachable.set(digest, matches);
  });

  const entries = new Map<
    string,
    { key: string; entry: ViviEmbeddedAssetV11; path: string }
  >();
  for (const [key, entry] of Object.entries(wire.embeddedAssets ?? {})) {
    const path = `/embeddedAssets/${escapePointer(key)}`;
    const match = /^sha256:([A-Fa-f0-9]{64})$/u.exec(key);
    if (!match?.[1]) {
      semanticError(
        "VIVI_FMT_ASSET_HASH_MISMATCH",
        path,
        "embedded asset key is not a sha256 address",
      );
    }
    const keyDigest = match[1].toLowerCase();
    if (entries.has(keyDigest)) {
      semanticError(
        "VIVI_FMT_DUPLICATE_MAP_KEY",
        path,
        "embedded asset keys collide after lowercase normalization",
      );
    }
    const entryDigest = normalizeSha256(entry.contentSha256, `${path}/contentSha256`);
    if (keyDigest !== entryDigest) {
      semanticError(
        "VIVI_FMT_ASSET_HASH_MISMATCH",
        `${path}/contentSha256`,
        "embedded asset key and contentSha256 differ",
      );
    }
    const bytes = decodeBase64(entry.data, `${path}/data`);
    const actualDigest = await checkedSha256(bytes, sha256, `${path}/data`);
    if (bytes.byteLength !== entry.sizeBytes || actualDigest !== entryDigest) {
      semanticError(
        "VIVI_FMT_ASSET_HASH_MISMATCH",
        path,
        "embedded asset bytes do not match declared hash and size",
      );
    }
    entries.set(keyDigest, { key, entry, path });
  }

  for (const [digest, references] of reachable) {
    const stored = entries.get(digest);
    if (!stored) {
      const first = references[0];
      semanticError(
        "VIVI_FMT_DANGLING_BLOB_REF",
        first?.path ?? "/extensions",
        `embedded blob ${digest} is missing`,
      );
    }
    for (const { ref, path } of references) {
      if (
        normalizeSha256(ref.contentSha256, `${path}/contentSha256`) !==
          normalizeSha256(stored.entry.contentSha256, `${stored.path}/contentSha256`) ||
        ref.sizeBytes !== stored.entry.sizeBytes
      ) {
        semanticError(
          "VIVI_FMT_ASSET_HASH_MISMATCH",
          path,
          "embedded blob reference does not match its entry",
        );
      }
    }
  }
  for (const [digest, stored] of entries) {
    if (!reachable.has(digest)) {
      semanticError(
        "VIVI_FMT_ORPHAN_EMBEDDED_ASSET",
        stored.path,
        `embedded asset ${stored.key} is unreachable from extension blobRefs`,
      );
    }
  }
}

function forEachBlobRef(
  wire: ViviFileDataWireV11,
  callback: (ref: ViviAssetRefV11, path: string) => void,
): void {
  for (const [extensionId, envelope] of Object.entries(wire.extensions ?? {})) {
    for (const [index, ref] of (envelope.blobRefs ?? []).entries()) {
      callback(ref, `/extensions/${escapePointer(extensionId)}/blobRefs/${index}`);
    }
  }
}

function validateAssetRef(ref: ViviAssetRefV11, path: string, embedded: boolean): void {
  const address = normalizeSha256(ref.objectAddress, `${path}/objectAddress`);
  const content = normalizeSha256(ref.contentSha256, `${path}/contentSha256`);
  validateMediaType(ref.mediaType, `${path}/mediaType`);
  if (!Number.isSafeInteger(ref.sizeBytes) || ref.sizeBytes < 0) {
    semanticError(
      "VIVI_FMT_ASSET_REF_INVALID",
      `${path}/sizeBytes`,
      "asset sizeBytes must be a non-negative safe integer",
    );
  }
  if (
    embedded &&
    (ref.storageKind !== "blob" || ref.sizeBytes > MAX_EMBEDDED_BLOB_BYTES)
  ) {
    semanticError(
      "VIVI_ASSET_TOO_LARGE_FOR_EMBED",
      path,
      "embedded references must be directly embeddable blobs no larger than 16 MiB",
    );
  }
  if (ref.storageKind === "blob") {
    if (ref.sizeBytes > MAX_EMBEDDED_BLOB_BYTES) {
      semanticError(
        "VIVI_ASSET_TOO_LARGE_FOR_EMBED",
        `${path}/sizeBytes`,
        "blob exceeds the Project Format v11 blob ceiling",
      );
    }
    if (address !== content) {
      semanticError(
        "VIVI_FMT_ASSET_REF_INVALID",
        `${path}/objectAddress`,
        "blob objectAddress must equal contentSha256",
      );
    }
  } else if (ref.storageKind === "chunk_manifest") {
    if (
      embedded ||
      ref.sizeBytes <= MAX_EMBEDDED_BLOB_BYTES ||
      ref.sizeBytes > MAX_CHUNK_MANIFEST_BYTES
    ) {
      semanticError(
        embedded ? "VIVI_ASSET_TOO_LARGE_FOR_EMBED" : "VIVI_FMT_ASSET_REF_INVALID",
        path,
        "chunk manifest logical size is outside the accepted range",
      );
    }
  } else {
    semanticError(
      "VIVI_FMT_ASSET_REF_INVALID",
      `${path}/storageKind`,
      "unknown asset storageKind",
    );
  }
}

function validateMediaType(mediaType: string, path: string): void {
  if (!isWellFormedUnicode(mediaType)) {
    semanticError(
      "VIVI_FMT_ASSET_REF_INVALID",
      path,
      "mediaType is not a well-formed Unicode scalar string",
    );
  }
  const byteLength = new TextEncoder().encode(mediaType).byteLength;
  if (byteLength < 1 || byteLength > 255 || hasAsciiControl(mediaType)) {
    semanticError(
      "VIVI_FMT_ASSET_REF_INVALID",
      path,
      "mediaType must be 1..255 UTF-8 bytes without ASCII controls",
    );
  }
}

function validateExtensionCanonicalSize(
  extensions: Record<string, ViviExtensionEnvelopeV11> | undefined,
): void {
  const canonical = canonicalizeJsonV11(extensions ?? {});
  if (new TextEncoder().encode(canonical).byteLength > MAX_EXTENSION_CANONICAL_BYTES) {
    semanticError(
      "VIVI_FMT_EXTENSION_CANONICAL_SIZE_EXCEEDED",
      "/extensions",
      "canonical extensions exceed 16 MiB",
    );
  }
}

function validateProjectGraph(
  project: ProjectDataWireV1To10 | ProjectDataV11,
): LayerState {
  const state: LayerState = {
    layersById: new Map(),
    pathsById: new Map(),
    meshIds: new Set(),
    boneIds: new Set(),
  };
  const visited = new WeakSet<object>();

  const visit = (layers: readonly ProjectLayerV11[], basePath: string): void => {
    for (const [index, layer] of layers.entries()) {
      const path = `${basePath}/${index}`;
      if (visited.has(layer)) {
        semanticError(
          "invalidSemanticValue",
          path,
          "layer tree contains a cycle or alias",
        );
      }
      visited.add(layer);
      if (state.layersById.has(layer.id)) {
        semanticError(
          "invalidSemanticValue",
          `${path}/id`,
          `duplicate layer id ${layer.id}`,
        );
      }
      state.layersById.set(layer.id, layer);
      state.pathsById.set(layer.id, path);
      validateMaskEdgeUniqueness(layer, path);
      if (layer.kind === "viviMesh") {
        state.meshIds.add(layer.id);
        validateMesh(layer, path);
      } else if (layer.kind === "bone") {
        state.boneIds.add(layer.id);
      }
      visit(layer.children, `${path}/children`);
    }
  };
  visit(project.layers as ProjectLayerV11[], "/project/layers");

  validateBoneReferences(state);
  validateMaskGraph(state);
  return state;
}

function validateMesh(layer: ProjectLayerV11, path: string): void {
  if (layer.kind !== "viviMesh") return;
  const { vertices, uvs, indices } = layer.mesh;
  if (
    vertices.length === 0 ||
    vertices.length % 2 !== 0 ||
    uvs.length !== vertices.length
  ) {
    semanticError(
      "invalidSemanticValue",
      `${path}/mesh`,
      "mesh has incomplete vertex or UV data",
    );
  }
  if (indices.length === 0 || indices.length % 3 !== 0) {
    semanticError(
      "invalidSemanticValue",
      `${path}/mesh/indices`,
      "mesh indices must contain complete triangles",
    );
  }
  const vertexCount = vertices.length / 2;
  for (const [indexPosition, index] of indices.entries()) {
    if (!Number.isInteger(index) || index < 0 || index >= vertexCount) {
      semanticError(
        "invalidSemanticValue",
        `${path}/mesh/indices/${indexPosition}`,
        "mesh index is outside the vertex array",
      );
    }
  }
}

function validateMaskEdgeUniqueness(layer: ProjectLayerV11, path: string): void {
  if (layer.clipMaskIds && layer.clipMasks) {
    semanticError(
      "invalidSemanticValue",
      path,
      "clipMaskIds and clipMasks are mutually exclusive",
    );
  }
  const ids = layer.clipMasks?.map(({ layerId }) => layerId) ?? layer.clipMaskIds ?? [];
  const seen = new Set<string>();
  for (const [index, id] of ids.entries()) {
    if (seen.has(id)) {
      semanticError(
        "invalidSemanticValue",
        layer.clipMasks
          ? `${path}/clipMasks/${index}/layerId`
          : `${path}/clipMaskIds/${index}`,
        `duplicate clip mask edge ${id}`,
      );
    }
    seen.add(id);
  }
}

function validateBoneReferences(state: LayerState): void {
  for (const [id, layer] of state.layersById) {
    if (layer.kind !== "bone" || layer.parentBoneId === undefined) continue;
    if (!state.boneIds.has(layer.parentBoneId)) {
      semanticError(
        "invalidSemanticValue",
        `${state.pathsById.get(id)}/parentBoneId`,
        `bone ${id} references missing parent ${layer.parentBoneId}`,
      );
    }
  }

  const visit = (boneId: string, stack: readonly string[]): void => {
    if (stack.includes(boneId)) {
      semanticError(
        "invalidSemanticValue",
        `${state.pathsById.get(boneId)}/parentBoneId`,
        `bone parent cycle: ${[...stack, boneId].join(" -> ")}`,
      );
    }
    const layer = state.layersById.get(boneId);
    if (layer?.kind === "bone" && layer.parentBoneId) {
      visit(layer.parentBoneId, [...stack, boneId]);
    }
  };
  for (const boneId of state.boneIds) visit(boneId, []);
}

function validateMaskGraph(state: LayerState): void {
  const expansionCounts = new Map<string, number>();
  const visit = (layer: ProjectLayerV11, stack: readonly string[]): number => {
    if (stack.includes(layer.id)) {
      semanticError(
        "invalidSemanticValue",
        state.pathsById.get(layer.id) ?? "/project/layers",
        `clip mask cycle: ${[...stack, layer.id].join(" -> ")}`,
      );
    }
    const cached = expansionCounts.get(layer.id);
    if (cached !== undefined) return cached;

    let depth = 0;
    const maskIds =
      layer.clipMasks?.map(({ layerId }) => layerId) ?? layer.clipMaskIds ?? [];
    for (const maskId of maskIds) {
      const mask = state.layersById.get(maskId);
      if (mask?.kind !== "viviMesh") {
        semanticError(
          "invalidSemanticValue",
          state.pathsById.get(layer.id) ?? "/project/layers",
          `layer ${layer.id} references missing mask mesh ${maskId}`,
        );
      }
      depth += visit(mask, [...stack, layer.id]) + 1;
      if (depth > VIVI_RUNTIME_LIMITS.maxMaskDepth) {
        semanticError(
          "invalidSemanticValue",
          state.pathsById.get(layer.id) ?? "/project/layers",
          `mask depth exceeds ${VIVI_RUNTIME_LIMITS.maxMaskDepth}`,
        );
      }
    }
    expansionCounts.set(layer.id, depth);
    return depth;
  };
  for (const layer of state.layersById.values()) visit(layer, []);
}

function validateProjectReferences(
  project: ProjectDataWireV1To10 | ProjectDataV11,
  layers: LayerState,
): void {
  const parameterIds = collectUniqueIds(
    project.parameters,
    "/project/parameters",
    "parameter",
  );
  for (const [index, parameter] of project.parameters.entries()) {
    if (
      parameter.minValue > parameter.defaultValue ||
      parameter.defaultValue > parameter.maxValue
    ) {
      semanticError(
        "invalidSemanticValue",
        `/project/parameters/${index}`,
        "parameter range must satisfy minValue <= defaultValue <= maxValue",
      );
    }
    if (
      parameter.pairedParameterId !== undefined &&
      !parameterIds.has(parameter.pairedParameterId)
    ) {
      missingReference(
        `/project/parameters/${index}/pairedParameterId`,
        "parameter",
        parameter.pairedParameterId,
      );
    }
  }

  const controllers = project.ikControllers ?? [];
  const controllerIds = collectUniqueIds(
    controllers,
    "/project/ikControllers",
    "IK controller",
  );
  for (const [index, controller] of controllers.entries()) {
    for (const [boneIndex, constraint] of controller.boneChain.entries()) {
      assertReference(
        layers.boneIds,
        constraint.boneId,
        `/project/ikControllers/${index}/boneChain/${boneIndex}/boneId`,
        "bone",
      );
    }
    for (const [mappingIndex, mapping] of controller.parameterMappings.entries()) {
      assertReference(
        layers.boneIds,
        mapping.boneId,
        `/project/ikControllers/${index}/parameterMappings/${mappingIndex}/boneId`,
        "bone",
      );
      assertReference(
        parameterIds,
        mapping.parameterId,
        `/project/ikControllers/${index}/parameterMappings/${mappingIndex}/parameterId`,
        "parameter",
      );
    }
  }

  const bindingIds = new Set<string>();
  for (const [index, binding] of (project.parameterBindings ?? []).entries()) {
    assertUniqueId(
      bindingIds,
      binding.id,
      `/project/parameterBindings/${index}/id`,
      "binding",
    );
    assertReference(
      parameterIds,
      binding.parameterId,
      `/project/parameterBindings/${index}/parameterId`,
      "parameter",
    );
    if (binding.target.type === "bone") {
      assertReference(
        layers.boneIds,
        binding.target.boneId,
        `/project/parameterBindings/${index}/target/boneId`,
        "bone",
      );
    } else {
      assertReference(
        controllerIds,
        binding.target.controllerId,
        `/project/parameterBindings/${index}/target/controllerId`,
        "IK controller",
      );
    }
  }

  validateSkins(project, layers);
  validatePhysics(project, layers, parameterIds);

  const clips = project.clips ?? [];
  const clipIds = collectUniqueIds(clips, "/project/clips", "clip");
  for (const [index, clip] of clips.entries()) {
    validateClipReferences(
      clip,
      `/project/clips/${index}`,
      layers,
      parameterIds,
      controllerIds,
    );
  }

  const scenes = project.scenes ?? [];
  const sceneIds = collectUniqueIds(scenes, "/project/scenes", "scene");
  for (const [sceneIndex, scene] of scenes.entries()) {
    collectUniqueIds(scene.clips, `/project/scenes/${sceneIndex}/clips`, "scene clip");
    for (const [clipIndex, clip] of scene.clips.entries()) {
      validateClipReferences(
        clip,
        `/project/scenes/${sceneIndex}/clips/${clipIndex}`,
        layers,
        parameterIds,
        controllerIds,
      );
    }
  }
  for (const [index, blend] of (project.sceneBlends ?? []).entries()) {
    assertReference(
      sceneIds,
      blend.sourceSceneId,
      `/project/sceneBlends/${index}/sourceSceneId`,
      "scene",
    );
    assertReference(
      sceneIds,
      blend.targetSceneId,
      `/project/sceneBlends/${index}/targetSceneId`,
      "scene",
    );
  }

  validateStateMachines(project, clipIds, parameterIds);
  validateOtherReferences(project, layers, parameterIds);
}

function validateSkins(
  project: ProjectDataWireV1To10 | ProjectDataV11,
  layers: LayerState,
): void {
  for (const [meshId, skin] of Object.entries(project.skins ?? {})) {
    const path = `/project/skins/${escapePointer(meshId)}`;
    assertReference(layers.meshIds, meshId, path, "mesh");
    const layer = layers.layersById.get(meshId);
    const vertexCount = layer?.kind === "viviMesh" ? layer.mesh.vertices.length / 2 : 0;
    if (skin.weights.length !== vertexCount) {
      semanticError(
        "invalidSemanticValue",
        `${path}/weights`,
        "skin weight row count must equal mesh vertex count",
      );
    }
    for (const [rowIndex, row] of skin.weights.entries()) {
      if (row.length === 0) {
        semanticError(
          "invalidSemanticValue",
          `${path}/weights/${rowIndex}`,
          "skin weight row must not be empty",
        );
      }
      let totalWeight = 0;
      for (const [weightIndex, weight] of row.entries()) {
        assertReference(
          layers.boneIds,
          weight.boneId,
          `${path}/weights/${rowIndex}/${weightIndex}/boneId`,
          "bone",
        );
        if (!Number.isFinite(weight.weight) || weight.weight < 0 || weight.weight > 1) {
          semanticError(
            "invalidSemanticValue",
            `${path}/weights/${rowIndex}/${weightIndex}/weight`,
            "skin weight must be finite and within 0..1",
          );
        }
        totalWeight += weight.weight;
      }
      if (Math.abs(totalWeight - 1) > 0.000_001) {
        semanticError(
          "invalidSemanticValue",
          `${path}/weights/${rowIndex}`,
          "skin weight row must sum to 1 within 0.000001",
        );
      }
    }
    for (const boneId of Object.keys(skin.bindPoseInverse)) {
      assertReference(
        layers.boneIds,
        boneId,
        `${path}/bindPoseInverse/${escapePointer(boneId)}`,
        "bone",
      );
    }
  }
}

function validatePhysics(
  project: ProjectDataWireV1To10 | ProjectDataV11,
  layers: LayerState,
  parameterIds: ReadonlySet<string>,
): void {
  const groupIds = new Set<string>();
  for (const [groupIndex, group] of (project.physicsGroups ?? []).entries()) {
    const path = `/project/physicsGroups/${groupIndex}`;
    assertUniqueId(groupIds, group.id, `${path}/id`, "physics group");
    for (const [inputIndex, input] of group.inputs.entries()) {
      assertReference(
        parameterIds,
        input.parameterId,
        `${path}/inputs/${inputIndex}/parameterId`,
        "parameter",
      );
    }
    for (const [outputIndex, output] of group.outputs.entries()) {
      const outputPath = `${path}/outputs/${outputIndex}`;
      if (
        !Number.isInteger(output.pendulumIndex) ||
        output.pendulumIndex < 0 ||
        output.pendulumIndex >= group.pendulums.length
      ) {
        semanticError(
          "invalidSemanticValue",
          `${outputPath}/pendulumIndex`,
          "physics output pendulumIndex is out of range",
        );
      }
      if (output.parameterId !== undefined) {
        assertReference(
          parameterIds,
          output.parameterId,
          `${outputPath}/parameterId`,
          "parameter",
        );
      }
      if (output.boneId !== undefined) {
        assertReference(layers.boneIds, output.boneId, `${outputPath}/boneId`, "bone");
      }
    }
  }
}

function validateClipReferences(
  clip: ProjectDataV11["clips"][number],
  path: string,
  layers: LayerState,
  parameterIds: ReadonlySet<string>,
  controllerIds: ReadonlySet<string>,
): void {
  for (const [index, track] of clip.tracks.entries()) {
    assertReference(
      parameterIds,
      track.parameterId,
      `${path}/tracks/${index}/parameterId`,
      "parameter",
    );
  }
  for (const [index, track] of (clip.boneTracks ?? []).entries()) {
    assertReference(
      layers.boneIds,
      track.boneId,
      `${path}/boneTracks/${index}/boneId`,
      "bone",
    );
  }
  for (const [index, track] of (clip.imageSequenceTracks ?? []).entries()) {
    assertReference(
      layers.meshIds,
      track.targetMeshId,
      `${path}/imageSequenceTracks/${index}/targetMeshId`,
      "mesh",
    );
  }
  const audioIds = collectUniqueIds(
    clip.audioTracks ?? [],
    `${path}/audioTracks`,
    "audio track",
  );
  for (const [index, track] of (clip.lipSyncTracks ?? []).entries()) {
    assertReference(
      audioIds,
      track.sourceAudioTrackId,
      `${path}/lipSyncTracks/${index}/sourceAudioTrackId`,
      "audio track",
    );
    if (track.targetParameterId !== null) {
      assertReference(
        parameterIds,
        track.targetParameterId,
        `${path}/lipSyncTracks/${index}/targetParameterId`,
        "parameter",
      );
    }
  }
  for (const [index, track] of (clip.ikControllerTracks ?? []).entries()) {
    assertReference(
      controllerIds,
      track.controllerId,
      `${path}/ikControllerTracks/${index}/controllerId`,
      "IK controller",
    );
  }
}

function validateStateMachines(
  project: ProjectDataWireV1To10 | ProjectDataV11,
  clipIds: ReadonlySet<string>,
  parameterIds: ReadonlySet<string>,
): void {
  const machineIds = new Set<string>();
  for (const [machineIndex, machine] of (project.stateMachines ?? []).entries()) {
    const path = `/project/stateMachines/${machineIndex}`;
    assertUniqueId(machineIds, machine.id, `${path}/id`, "state machine");
    const stateIds = collectUniqueIds(machine.states, `${path}/states`, "state");
    assertReference(stateIds, machine.initialStateId, `${path}/initialStateId`, "state");
    for (const [stateIndex, state] of machine.states.entries()) {
      if (state.clipId !== undefined) {
        assertReference(
          clipIds,
          state.clipId,
          `${path}/states/${stateIndex}/clipId`,
          "clip",
        );
      }
      if (state.blendTree) {
        assertReference(
          parameterIds,
          state.blendTree.parameterId,
          `${path}/states/${stateIndex}/blendTree/parameterId`,
          "parameter",
        );
        for (const [entryIndex, entry] of state.blendTree.entries.entries()) {
          assertReference(
            clipIds,
            entry.clipId,
            `${path}/states/${stateIndex}/blendTree/entries/${entryIndex}/clipId`,
            "clip",
          );
        }
      }
    }
    const transitionIds = new Set<string>();
    for (const [transitionIndex, transition] of machine.transitions.entries()) {
      const transitionPath = `${path}/transitions/${transitionIndex}`;
      assertUniqueId(transitionIds, transition.id, `${transitionPath}/id`, "transition");
      assertReference(
        stateIds,
        transition.fromStateId,
        `${transitionPath}/fromStateId`,
        "state",
      );
      assertReference(
        stateIds,
        transition.toStateId,
        `${transitionPath}/toStateId`,
        "state",
      );
      for (const [conditionIndex, condition] of transition.conditions.entries()) {
        assertReference(
          parameterIds,
          condition.parameterId,
          `${transitionPath}/conditions/${conditionIndex}/parameterId`,
          "parameter",
        );
      }
    }
  }
}

function validateOtherReferences(
  project: ProjectDataWireV1To10 | ProjectDataV11,
  layers: LayerState,
  parameterIds: ReadonlySet<string>,
): void {
  for (const [index, collider] of (project.colliders ?? []).entries()) {
    if (collider.shape.type === "mesh") {
      assertReference(
        layers.meshIds,
        collider.shape.meshId,
        `/project/colliders/${index}/shape/meshId`,
        "mesh",
      );
    }
  }
  for (const [index, target] of (project.offscreenTargets ?? []).entries()) {
    for (const [sourceIndex, layerId] of target.sourceLayerIds.entries()) {
      assertReference(
        layers.layersById,
        layerId,
        `/project/offscreenTargets/${index}/sourceLayerIds/${sourceIndex}`,
        "layer",
      );
    }
  }
  const targetParameterId = project.lipsyncConfig?.targetParameterId;
  if (targetParameterId !== undefined && targetParameterId !== null) {
    assertReference(
      parameterIds,
      targetParameterId,
      "/project/lipsyncConfig/targetParameterId",
      "parameter",
    );
  }
  for (const [index, mapping] of (
    project.lipsyncConfig?.visemeMappings ?? []
  ).entries()) {
    assertReference(
      parameterIds,
      mapping.target.parameterId,
      `/project/lipsyncConfig/visemeMappings/${index}/target/parameterId`,
      "parameter",
    );
  }
  for (const [presetIndex, preset] of (project.expressionPresets ?? []).entries()) {
    for (const parameterId of Object.keys(preset.values)) {
      assertReference(
        parameterIds,
        parameterId,
        `/project/expressionPresets/${presetIndex}/values/${escapePointer(parameterId)}`,
        "parameter",
      );
    }
  }
}

function validateAtlasCoverage(
  wire: ViviFileDataWireThroughV11,
  layers: LayerState,
): void {
  const atlasIds = new Set<string>();
  const coveredMeshes = new Set<string>();
  if (isV11Wire(wire)) {
    for (const [atlasIndex, atlas] of wire.atlases.entries()) {
      const path = `/atlases/${atlasIndex}`;
      if (!ATLAS_ID_PATTERN.test(atlas.id)) {
        semanticError(
          "VIVI_FMT_ATLAS_ID_INVALID",
          `${path}/id`,
          `invalid atlas id ${atlas.id}`,
        );
      }
      if (atlasIds.has(atlas.id)) {
        semanticError(
          "VIVI_FMT_DUPLICATE_ATLAS_ID",
          `${path}/id`,
          `duplicate atlas id ${atlas.id}`,
        );
      }
      atlasIds.add(atlas.id);
    }
  }
  for (const [atlasIndex, atlas] of wire.atlases.entries()) {
    const path = `/atlases/${atlasIndex}`;
    if (
      !Number.isFinite(atlas.width) ||
      !Number.isFinite(atlas.height) ||
      atlas.width <= 0 ||
      atlas.height <= 0
    ) {
      semanticError(
        "invalidSemanticValue",
        path,
        "atlas dimensions must be finite and positive",
      );
    }
    for (const [entryIndex, entry] of atlas.entries.entries()) {
      const entryPath = `${path}/entries/${entryIndex}`;
      assertReference(layers.meshIds, entry.layerId, `${entryPath}/layerId`, "mesh");
      if (coveredMeshes.has(entry.layerId)) {
        semanticError(
          "invalidSemanticValue",
          `${entryPath}/layerId`,
          `mesh ${entry.layerId} has more than one atlas entry`,
        );
      }
      coveredMeshes.add(entry.layerId);
      if (
        ![entry.x, entry.y, entry.width, entry.height].every(Number.isFinite) ||
        entry.x < 0 ||
        entry.y < 0 ||
        entry.width < 0 ||
        entry.height < 0 ||
        entry.x + entry.width > atlas.width ||
        entry.y + entry.height > atlas.height
      ) {
        semanticError(
          "invalidSemanticValue",
          entryPath,
          `atlas entry ${entry.layerId} is outside atlas bounds`,
        );
      }
    }
  }
  for (const meshId of layers.meshIds) {
    if (!coveredMeshes.has(meshId)) {
      semanticError(
        "invalidSemanticValue",
        layers.pathsById.get(meshId) ?? "/project/layers",
        `mesh ${meshId} has no atlas entry`,
      );
    }
  }
}

function scanForbiddenCore(wire: ViviFileDataWireThroughV11): void {
  const seen = new WeakSet<object>();
  const scan = (value: unknown, path: string, opaqueKeys: boolean): void => {
    if (typeof value !== "object" || value === null) return;
    if (seen.has(value)) {
      semanticError("invalidSemanticValue", path || "/", "object graph contains a cycle");
    }
    seen.add(value);
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        scan(item, `${path}/${index}`, false);
      });
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (path === "" && key === "extensions") continue;
      const childPath = `${path}/${escapePointer(key)}`;
      if (!opaqueKeys && FORBIDDEN_RAW_KEYS.has(key)) {
        semanticError(
          "forbiddenPublicFeature",
          childPath,
          `forbidden raw project marker ${key}`,
        );
      }
      if (
        !opaqueKeys &&
        (key === "kind" || key === "type") &&
        typeof child === "string" &&
        FORBIDDEN_KIND_OR_TYPE.has(child)
      ) {
        semanticError(
          "forbiddenPublicFeature",
          childPath,
          `forbidden project ${key} value ${child}`,
        );
      }
      scan(child, childPath, opaqueChildKeys(path, key));
    }
  };
  scan(wire, "", false);
}

function validateInMemoryJsonNumbers(wire: ViviFileDataWireThroughV11): void {
  const seen = new WeakSet<object>();
  const scan = (value: unknown, path: string): void => {
    if (typeof value === "number") {
      if (
        !Number.isFinite(value) ||
        (Number.isInteger(value) && !Number.isSafeInteger(value))
      ) {
        semanticError(
          "invalidSemanticValue",
          path || "/",
          "JSON numbers must be finite and integers must be safe",
        );
      }
      return;
    }
    if (typeof value !== "object" || value === null || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        scan(item, `${path}/${index}`);
      });
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      scan(child, `${path}/${escapePointer(key)}`);
    }
  };
  scan(wire, "");
}

function opaqueChildKeys(parentPath: string, key: string): boolean {
  if (parentPath === "/project" && key === "skins") return true;
  if (/^\/project\/skins\/[^/]+$/u.test(parentPath) && key === "bindPoseInverse") {
    return true;
  }
  return /^\/project\/expressionPresets\/\d+$/u.test(parentPath) && key === "values";
}

function normalizeLoadedWire(
  wire: ViviFileDataWireThroughV11,
): NormalizedViviFileDataV11 {
  const snapshot = cloneJsonSafe(wire);
  normalizeNegativeZero(snapshot);
  if (!isV11Wire(snapshot)) {
    const normalized: NormalizedViviFileDataV11 = {
      version: snapshot.version,
      project: normalizeProject(snapshot.project),
      atlases: snapshot.atlases.map((atlas, index) => ({
        ...atlas,
        id: `atlas-${index}`,
      })),
      assetMode: "embedded",
    };
    if (snapshot.profile !== undefined) normalized.profile = snapshot.profile;
    return normalized;
  }
  normalizeV11AssetHashes(snapshot);
  const normalized: NormalizedViviFileDataV11 = {
    version: 11,
    project: normalizeProject(snapshot.project),
    atlases: snapshot.atlases,
    assetMode: snapshot.assetMode,
  };
  if (snapshot.documentId !== undefined) normalized.documentId = snapshot.documentId;
  if (snapshot.requires !== undefined) normalized.requires = snapshot.requires;
  if (snapshot.extensions !== undefined) normalized.extensions = snapshot.extensions;
  if (snapshot.embeddedAssets !== undefined) {
    normalized.embeddedAssets = snapshot.embeddedAssets as Record<
      string,
      ViviEmbeddedAssetV11
    >;
  }
  return normalized;
}

function normalizeV11AssetHashes(wire: ViviFileDataWireV11): void {
  const normalizeRef = (ref: ViviAssetRefV11): void => {
    ref.objectAddress = ref.objectAddress.toLowerCase();
    ref.contentSha256 = ref.contentSha256.toLowerCase();
  };

  if (wire.assetMode === "referenced") {
    for (const atlas of wire.atlases) normalizeRef(atlas.image);
  }
  for (const envelope of Object.values(wire.extensions ?? {})) {
    for (const ref of envelope.blobRefs ?? []) normalizeRef(ref);
  }
  if (wire.embeddedAssets !== undefined) {
    const normalizedAssets: Record<string, ViviEmbeddedAssetV11> = {};
    for (const [key, entry] of Object.entries(wire.embeddedAssets)) {
      const separator = key.indexOf(":");
      const normalizedKey =
        separator < 0
          ? key.toLowerCase()
          : `${key.slice(0, separator + 1)}${key.slice(separator + 1).toLowerCase()}`;
      normalizedAssets[normalizedKey] = {
        ...entry,
        contentSha256: entry.contentSha256.toLowerCase(),
      };
    }
    (
      wire as ViviFileDataWireV11 & {
        embeddedAssets: Record<string, ViviEmbeddedAssetV11>;
      }
    ).embeddedAssets = normalizedAssets;
  }
}

function normalizeProject(
  value: ProjectDataWireV1To10 | ProjectDataV11,
): NormalizedProjectDataWireV1To10 | NormalizedProjectDataV11 {
  const normalizeLayer = (layer: ProjectLayerV11): NormalizedProjectLayerV11 => {
    const { children, clipMaskIds, ...rest } = layer;
    const normalized = {
      ...rest,
      children: children.map(normalizeLayer),
    } as NormalizedProjectLayerV11;
    if (clipMaskIds !== undefined) {
      normalized.clipMasks = clipMaskIds.map((layerId) => ({
        layerId,
        invert: false,
      }));
    }
    return normalized;
  };

  return {
    ...value,
    layers: (value.layers as ProjectLayerV11[]).map(normalizeLayer),
  } as NormalizedProjectDataWireV1To10 | NormalizedProjectDataV11;
}

function projectUsesExtendedBlendMode(layers: readonly ProjectLayerV11[]): boolean {
  return layers.some(
    (layer) =>
      !CORE_BLEND_MODES.has(layer.blendMode) ||
      projectUsesExtendedBlendMode(layer.children),
  );
}

function projectHasInvertedMask(layers: readonly ProjectLayerV11[]): boolean {
  return layers.some(
    (layer) =>
      (layer.clipMasks?.some(({ invert }) => invert) ?? false) ||
      projectHasInvertedMask(layer.children),
  );
}

function collectUniqueIds<T extends { id: string }>(
  values: readonly T[],
  path: string,
  label: string,
): Set<string> {
  const result = new Set<string>();
  for (const [index, value] of values.entries()) {
    assertUniqueId(result, value.id, `${path}/${index}/id`, label);
  }
  return result;
}

function assertUniqueId(
  values: Set<string>,
  value: string,
  path: string,
  label: string,
): void {
  if (values.has(value)) {
    semanticError("invalidSemanticValue", path, `duplicate ${label} id ${value}`);
  }
  values.add(value);
}

function assertReference(
  values: ReadonlySet<string> | ReadonlyMap<string, unknown>,
  value: string,
  path: string,
  label: string,
): void {
  if (!values.has(value)) missingReference(path, label, value);
}

function missingReference(path: string, label: string, value: string): never {
  return semanticError(
    "invalidSemanticValue",
    path,
    `reference to unknown ${label} ${value}`,
  );
}

function normalizeSha256(value: string, path: string): string {
  if (!SHA256_PATTERN.test(value)) {
    semanticError("VIVI_FMT_ASSET_REF_INVALID", path, "invalid SHA-256 hex digest");
  }
  return value.toLowerCase();
}

function decodeBase64(value: string, path: string): Uint8Array {
  try {
    const binary = globalThis.atob(value);
    const result = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      result[index] = binary.charCodeAt(index);
    }
    return result;
  } catch {
    semanticError("VIVI_FMT_ASSET_HASH_MISMATCH", path, "invalid base64 data");
  }
}

async function hashCanonicalValue(value: unknown, sha256: Sha256V11): Promise<string> {
  const canonical = canonicalizeJsonV11(value);
  return checkedSha256(new TextEncoder().encode(canonical), sha256, "/extensions");
}

async function checkedSha256(
  bytes: Uint8Array,
  sha256: Sha256V11,
  path: string,
): Promise<string> {
  const digest = await sha256(bytes);
  if (!SHA256_PATTERN.test(digest)) {
    semanticError(
      "VIVI_FMT_ASSET_HASH_MISMATCH",
      path,
      "SHA-256 implementation returned an invalid digest",
    );
  }
  return digest.toLowerCase();
}

async function defaultSha256(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("WebCrypto SHA-256 is unavailable");
  }
  const input = new Uint8Array(bytes.byteLength);
  input.set(bytes);
  const digest = await subtle.digest("SHA-256", input.buffer);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function utf8Compare(left: string, right: string): number {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const length = Math.min(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (leftBytes[index] ?? 0) - (rightBytes[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return leftBytes.length - rightBytes.length;
}

function isWellFormedUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function hasAsciiControl(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function escapePointer(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function cloneJsonSafe<T>(value: T): T {
  return structuredClone(value);
}

function normalizeNegativeZero(value: unknown, seen = new WeakSet<object>()): void {
  if (typeof value !== "object" || value === null || seen.has(value)) return;
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (typeof child === "number" && Object.is(child, -0)) {
      (value as Record<string, unknown>)[key] = 0;
    } else {
      normalizeNegativeZero(child, seen);
    }
  }
}

function isV11Wire(wire: ViviFileDataWireThroughV11): wire is ViviFileDataWireV11 {
  return wire.version === 11;
}
