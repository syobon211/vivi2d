import type { AtlasData, AtlasEntry, LayerNode, ProjectData } from "../types";
import type { ViviJsonValueV11 } from "./json-contract";

export type ViviFileVersionV1To10 = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export type ProjectAssetModeV11 = "embedded" | "referenced";
export type CapabilityPurposeV11 = "render" | "edit";
export type ExtensionClassificationV11 = "knownSupported" | "opaque" | "invalid";
export type ProjectCompatibilityV11 = "full" | "readOnly" | "invalid";

export interface ViviClipMaskEdgeV1 {
  layerId: string;
  invert: boolean;
}

/**
 * Local adaptation of the legacy authoring layer. The public LayerNode type is
 * intentionally unchanged until the v11 format is published.
 */
export type ProjectLayerV11 = LayerNode & {
  children: ProjectLayerV11[];
  clipMasks?: ViviClipMaskEdgeV1[];
};

export type ProjectDataV11 = Omit<ProjectData, "layers"> & {
  layers: ProjectLayerV11[];
};

export type ProjectDataWireV1To10 = Pick<ProjectDataV11, "layers" | "parameters"> &
  Partial<Omit<ProjectDataV11, "layers" | "parameters">>;

export interface ViviAssetRefV11 {
  objectAddress: string;
  storageKind: "blob" | "chunk_manifest";
  contentSha256: string;
  mediaType: string;
  sizeBytes: number;
}

export interface ViviRequiredCapabilityV11 {
  id: string;
  minVersion: number;
  requiredFor: CapabilityPurposeV11[];
}

export interface ViviExtensionEnvelopeV11 {
  schemaVersion: number;
  requiredCapabilityId: string;
  data: ViviJsonValueV11;
  blobRefs?: ViviAssetRefV11[];
}

export interface ViviEmbeddedAssetV11 {
  contentSha256: string;
  sizeBytes: number;
  encoding: "base64";
  data: string;
}

export interface ViviAtlasDataEmbeddedV11 {
  id: string;
  image: string;
  width: number;
  height: number;
  entries: AtlasEntry[];
}

export interface ViviAtlasDataReferencedV11 {
  id: string;
  image: ViviAssetRefV11;
  width: number;
  height: number;
  entries: AtlasEntry[];
}

export type ViviAtlasDataV11 = ViviAtlasDataEmbeddedV11 | ViviAtlasDataReferencedV11;

export interface ViviFileDataWireV1To10 {
  version: ViviFileVersionV1To10;
  profile?: "publicProfileV1";
  project: ProjectDataWireV1To10;
  atlases: AtlasData[];
}

export type ViviFileDataWireV10 = Omit<ViviFileDataWireV1To10, "version"> & {
  version: 10;
};

interface ViviFileDataWireV11Base {
  version: 11;
  project: ProjectDataV11;
  documentId?: string;
  requires?: ViviRequiredCapabilityV11[];
  extensions?: Record<string, ViviExtensionEnvelopeV11>;
}

export interface ViviFileDataWireV11Embedded extends ViviFileDataWireV11Base {
  assetMode: "embedded";
  atlases: ViviAtlasDataEmbeddedV11[];
  embeddedAssets?: Record<string, ViviEmbeddedAssetV11>;
}

export interface ViviFileDataWireV11Referenced extends ViviFileDataWireV11Base {
  assetMode: "referenced";
  atlases: ViviAtlasDataReferencedV11[];
  /** The approved schema permits this property only when it is an empty map. */
  embeddedAssets?: Record<string, never>;
}

export type ViviFileDataWireV11 =
  | ViviFileDataWireV11Embedded
  | ViviFileDataWireV11Referenced;

export type ViviFileDataWireThroughV11 = ViviFileDataWireV1To10 | ViviFileDataWireV11;

export interface NormalizedViviAtlasV11 {
  id: string;
  image: string | ViviAssetRefV11;
  width: number;
  height: number;
  entries: AtlasEntry[];
}

/** Internal layer form: legacy mask ids are always expanded into edge objects. */
export type NormalizedProjectLayerV11 = LayerNode & {
  children: NormalizedProjectLayerV11[];
  clipMaskIds?: never;
  clipMasks?: ViviClipMaskEdgeV1[];
};

export type NormalizedProjectDataV11 = Omit<ProjectDataV11, "layers"> & {
  layers: NormalizedProjectLayerV11[];
};

export type NormalizedProjectDataWireV1To10 = Pick<
  NormalizedProjectDataV11,
  "layers" | "parameters"
> &
  Partial<Omit<NormalizedProjectDataV11, "layers" | "parameters">>;

export interface NormalizedViviFileDataV11 {
  version: ViviFileVersionV1To10 | 11;
  profile?: "publicProfileV1";
  project: NormalizedProjectDataWireV1To10 | NormalizedProjectDataV11;
  atlases: NormalizedViviAtlasV11[];
  assetMode: ProjectAssetModeV11;
  documentId?: string;
  requires?: ViviRequiredCapabilityV11[];
  extensions?: Record<string, ViviExtensionEnvelopeV11>;
  embeddedAssets?: Record<string, ViviEmbeddedAssetV11>;
}

export interface ExtensionRegistryEntryV11 {
  id: string;
  supportedSchemaVersions: readonly number[];
  requiredCapability: {
    id: string;
    minVersionForSchema: Readonly<Record<number, number>>;
  };
  /** Project Format v11 permits edit-only extension registries. */
  affects: readonly "edit"[];
  validateEnvelope: (envelope: ViviExtensionEnvelopeV11) => boolean;
}

export type ExtensionRegistryV11 = ReadonlyMap<string, ExtensionRegistryEntryV11>;

export interface ClassifiedExtensionRecordV11 {
  readonly extensionId: string;
  readonly envelope: ViviExtensionEnvelopeV11;
  readonly classification: ExtensionClassificationV11;
}

export interface OpaqueExtensionRecordV11 {
  readonly extensionId: string;
  readonly envelope: ViviExtensionEnvelopeV11;
  readonly preservedRequirement: ViviRequiredCapabilityV11;
  readonly loadedCanonicalHash: string;
}

export type Sha256V11 = (bytes: Uint8Array) => Promise<string> | string;

export interface ProjectFormatV11SemanticOptions {
  registry: ExtensionRegistryV11;
  supportedCapabilities: ReadonlyMap<string, number>;
  /** Host-supplied SHA-256 keeps the codec independent of ambient WebCrypto. */
  sha256: Sha256V11;
}

export interface SemanticValidationResult {
  normalized: NormalizedViviFileDataV11;
  derivedRequirements: ViviRequiredCapabilityV11[];
  compatibility: ProjectCompatibilityV11;
  classifiedExtensions: ClassifiedExtensionRecordV11[];
  opaqueExtensions: OpaqueExtensionRecordV11[];
}
