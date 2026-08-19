export type ProjectAssetModeV11 = "embedded" | "referenced";
export type ProjectCompatibilityV11 = "full" | "readOnly" | "invalid";

export interface ViviRequiredCapabilityV11 {
  id: string;
  minVersion: number;
  requiredFor: Array<"render" | "edit">;
}

export interface ExtensionRegistryEntryV11 {
  id: string;
  supportedSchemaVersions: readonly number[];
  requiredCapability: {
    id: string;
    minVersionForSchema: Readonly<Record<number, number>>;
  };
  affects: readonly "edit"[];
  validateEnvelope: (envelope: unknown) => boolean;
}

export type ExtensionRegistryV11 = ReadonlyMap<string, ExtensionRegistryEntryV11>;
export type Sha256V11 = (bytes: Uint8Array) => Promise<string> | string;

export interface ProjectFormatV11CodecOptions {
  registry: ExtensionRegistryV11;
  supportedCapabilities: ReadonlyMap<string, number>;
  sha256: Sha256V11;
  testLimits?: Readonly<Record<string, number>>;
}

export interface NormalizedViviFileDataV11 {
  version: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;
  profile?: "publicProfileV1";
  project: unknown;
  atlases: Array<{
    id: string;
    image:
      | string
      | {
          objectAddress: string;
          storageKind: "blob" | "chunk_manifest";
          contentSha256: string;
          mediaType: string;
          sizeBytes: number;
        };
    width: number;
    height: number;
    entries: unknown[];
  }>;
  assetMode: ProjectAssetModeV11;
  documentId?: string;
  extensions?: Record<string, unknown>;
}

export interface ParsedProjectFormatV11 {
  readonly wire: unknown;
  normalized: NormalizedViviFileDataV11;
  derivedRequirements: ViviRequiredCapabilityV11[];
  compatibility: ProjectCompatibilityV11;
  opaqueExtensions: Array<{ extensionId: string }>;
}

export function parseProjectFormatV11Json(
  source: string,
  options: ProjectFormatV11CodecOptions,
): Promise<ParsedProjectFormatV11>;
export function parseProjectFormatV11Utf8(
  bytes: Uint8Array,
  options: ProjectFormatV11CodecOptions,
): Promise<ParsedProjectFormatV11>;
export function serializeProjectFormatV11LocalDuplicate(
  document: ParsedProjectFormatV11,
): string;
