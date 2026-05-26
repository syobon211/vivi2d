import type { DecomposeOptions } from "./types";

export const VIVI2D_COMPAT_CAPABILITY = "vivi2d.seethrough.v1";
export const VIVI2D_COMPAT_PLUGIN_NAME = "vivi2d-compat-comfyui";
export const VIVI2D_COMPAT_PLUGIN_VERSION = "0.1.0";
export const VIVI2D_MANIFEST_SCHEMA_VERSION = "1.0.0";

export const VIVI2D_COMPAT_NODE_TYPES = {
  decompose: "ViviSeeThroughDecompose",
  exportPsd: "ViviSeeThroughExportPSD",
} as const;

export interface ViviSeeThroughManifestDepthStats {
  min: number;
  max: number;
  mean: number;
}

export type ViviSeeThroughLrSplit = "left" | "right" | "center" | "unknown";
export type ViviSeeThroughFbSplit = "front" | "back" | "middle" | "unknown";

export interface ViviSeeThroughManifestLayer {
  id: string;
  name: string;
  label: string;
  order: number;
  psd_leaf_token: string;
  image_path: string;
  bbox: [number, number, number, number];
  confidence: number;
  left_right_split: ViviSeeThroughLrSplit;
  front_back_split: ViviSeeThroughFbSplit;
  depth_stats: ViviSeeThroughManifestDepthStats;
}

export interface ViviSeeThroughManifest {
  schema_version: typeof VIVI2D_MANIFEST_SCHEMA_VERSION;
  generator: {
    plugin: typeof VIVI2D_COMPAT_PLUGIN_NAME;
    plugin_version: string;
    model: string;
    model_version: string;
  };
  canvas: {
    width: number;
    height: number;
  };
  layers: ViviSeeThroughManifestLayer[];
}

export interface ViviCompatDecomposeOptions extends DecomposeOptions {
  filenamePrefix?: string;
}

export interface ViviCompatExportOptions {
  filenamePrefix?: string;
}

export interface ViviCompatManifestResult {
  manifestPath: string;
  manifest: ViviSeeThroughManifest;
}

export interface ViviSeeThroughLayerAsset {
  image_path: string;
  imageData: ArrayBuffer;
}

export interface ViviCompatImportBundle extends ViviCompatManifestResult {
  psdBuffer: ArrayBuffer;
}

export interface ViviCompatNativeImportBundle extends ViviCompatManifestResult {
  layerAssets: ViviSeeThroughLayerAsset[];
}

export interface ViviCompatNodeInfoReader {
  getNodeInfo(nodeType: string): Promise<Record<string, unknown> | null>;
}

export interface ViviCompatSupportReport {
  supported: boolean;
  hasDecomposeNode: boolean;
  hasExportNode: boolean;
  capability: string | null;
  pluginVersion: string | null;
  manifestSchema: string | null;
  issues: string[];
}

export interface ViviCompatOutputLocation {
  filename: string;
  subfolder: string;
  type: "output";
}

function readNodeInputDefault(
  nodeInfo: Record<string, unknown>,
  scope: "required" | "optional",
  inputName: string,
): unknown {
  const input = nodeInfo.input;
  if (!input || typeof input !== "object") return undefined;

  const scopeRecord = (input as Record<string, unknown>)[scope];
  if (!scopeRecord || typeof scopeRecord !== "object") return undefined;

  const inputRecord = (scopeRecord as Record<string, unknown>)[inputName];
  if (!Array.isArray(inputRecord) || inputRecord.length < 2) return undefined;

  const options = inputRecord[1];
  if (!options || typeof options !== "object") return undefined;

  return (options as Record<string, unknown>).default;
}

export async function inspectViviCompatSupport(
  reader: ViviCompatNodeInfoReader,
): Promise<ViviCompatSupportReport> {
  const [decomposeInfo, exportInfo] = await Promise.all([
    reader.getNodeInfo(VIVI2D_COMPAT_NODE_TYPES.decompose),
    reader.getNodeInfo(VIVI2D_COMPAT_NODE_TYPES.exportPsd),
  ]);

  const issues: string[] = [];

  if (!decomposeInfo) {
    issues.push(`Missing node: ${VIVI2D_COMPAT_NODE_TYPES.decompose}`);
  }

  if (!exportInfo) {
    issues.push(`Missing node: ${VIVI2D_COMPAT_NODE_TYPES.exportPsd}`);
  }

  let manifestSchema: string | null = null;
  let capability: string | null = null;
  let pluginVersion: string | null = null;

  if (decomposeInfo) {
    const detectedSchema =
      readNodeInputDefault(decomposeInfo, "required", "schema_version") ??
      readNodeInputDefault(decomposeInfo, "optional", "schema_version");
    const detectedCapability =
      readNodeInputDefault(decomposeInfo, "required", "capability") ??
      readNodeInputDefault(decomposeInfo, "optional", "capability");
    const detectedPluginVersion =
      readNodeInputDefault(decomposeInfo, "required", "plugin_version") ??
      readNodeInputDefault(decomposeInfo, "optional", "plugin_version");

    if (typeof detectedSchema === "string") {
      manifestSchema = detectedSchema;
      if (detectedSchema !== VIVI2D_MANIFEST_SCHEMA_VERSION) {
        issues.push(
          `Manifest schema mismatch: expected ${VIVI2D_MANIFEST_SCHEMA_VERSION}, got ${detectedSchema}`,
        );
      }
    } else {
      issues.push("Missing schema_version default on compat decompose node");
    }

    if (typeof detectedCapability === "string") {
      capability = detectedCapability;
      if (detectedCapability !== VIVI2D_COMPAT_CAPABILITY) {
        issues.push(
          `Capability mismatch: expected ${VIVI2D_COMPAT_CAPABILITY}, got ${detectedCapability}`,
        );
      }
    } else {
      issues.push("Missing capability default on compat decompose node");
    }

    if (typeof detectedPluginVersion === "string") {
      pluginVersion = detectedPluginVersion;
      if (detectedPluginVersion !== VIVI2D_COMPAT_PLUGIN_VERSION) {
        issues.push(
          `Plugin version mismatch: expected ${VIVI2D_COMPAT_PLUGIN_VERSION}, got ${detectedPluginVersion}`,
        );
      }
    } else {
      issues.push("Missing plugin_version default on compat decompose node");
    }
  }

  return {
    supported: issues.length === 0,
    hasDecomposeNode: Boolean(decomposeInfo),
    hasExportNode: Boolean(exportInfo),
    capability,
    pluginVersion,
    manifestSchema,
    issues,
  };
}

export function parseViviCompatOutputRef(outputRef: string): ViviCompatOutputLocation {
  const normalized = outputRef.replace(/\\/g, "/");
  const outputMarker = "/output/";

  let relative = normalized;
  const markerIndex = normalized.lastIndexOf(outputMarker);
  if (markerIndex >= 0) {
    relative = normalized.slice(markerIndex + outputMarker.length);
  } else if (normalized.startsWith("output/")) {
    relative = normalized.slice("output/".length);
  }

  const parts = relative.split("/").filter(Boolean);
  if (parts.length === 0) {
    throw new Error(`Invalid Vivi2D compat output ref: ${outputRef}`);
  }

  const filename = parts[parts.length - 1]!;
  const subfolder = parts.slice(0, -1).join("/");

  return {
    filename,
    subfolder,
    type: "output",
  };
}
