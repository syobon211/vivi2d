import { flattenLayers } from "@vivi2d/core/layer-utils";
import type {
  LayerImportFbSplit,
  LayerImportLrSplit,
  LayerNode,
  LayerSemanticRole,
  ProjectData,
} from "@vivi2d/core/types";
import { isViviMesh } from "@vivi2d/core/types";
import {
  parseSeeThroughLeafToken,
  stripSeeThroughTechnicalName,
} from "./see-through-technical-name";
import { mapSeeThroughLabelToRole } from "./see-through-role-map";

export const SEE_THROUGH_IMPORT_SCHEMA_VERSION = "1.0.0";
export const SEE_THROUGH_ROLE_CONFIDENCE_THRESHOLD = 0.5;

export interface SeeThroughImportManifestLayer {
  name: string;
  label: string;
  order: number;
  leafToken: string;
  bbox: [number, number, number, number];
  confidence: number;
  leftRightSplit: LayerImportLrSplit;
  frontBackSplit: LayerImportFbSplit;
  depthStats: {
    min: number;
    max: number;
    mean: number;
  };
}

export interface SeeThroughImportManifest {
  schemaVersion: number | string;
  layers: readonly SeeThroughImportManifestLayer[];
}

export interface ApplySeeThroughImportContextOptions {
  expectedSchemaVersion: number | string;
}

export interface SeeThroughImportAnnotationResult {
  applied: boolean;
  warning: string | null;
  project: ProjectData;
}

function listImportedViviMeshes(project: ProjectData): LayerNode[] {
  return flattenLayers(project.layers).filter(isViviMesh);
}

function buildTokenToManifestLayerMap(manifest: SeeThroughImportManifest) {
  return new Map(manifest.layers.map((layer) => [layer.leafToken, layer] as const));
}

function getSideRoleFamily(role: LayerSemanticRole | undefined): string | null {
  switch (role) {
    case "eyeLeft":
    case "eyeRight":
      return "eye";
    case "eyebrowLeft":
    case "eyebrowRight":
      return "eyebrow";
    case "armLeft":
    case "armRight":
      return "arm";
    case "handLeft":
    case "handRight":
      return "hand";
    case "legLeft":
    case "legRight":
      return "leg";
    default:
      return null;
  }
}

function shouldPreserveAssistantRoleSource(
  originalState: Pick<LayerNode, "semanticRole" | "semanticRoleSource"> | undefined,
  nextRole: LayerSemanticRole,
): boolean {
  if (originalState?.semanticRoleSource !== "assistant") return false;
  const originalFamily = getSideRoleFamily(originalState.semanticRole);
  const nextFamily = getSideRoleFamily(nextRole);
  return originalFamily != null && originalFamily === nextFamily;
}

function restoreImportedLayers(
  project: ProjectData,
  importedViviMeshes: LayerNode[],
  originalState: Map<
    string,
    Pick<LayerNode, "name" | "semanticRole" | "semanticRoleSource" | "importMetadata">
  >,
  warning: string,
): SeeThroughImportAnnotationResult {
  for (const layer of importedViviMeshes) {
    const original = originalState.get(layer.id);
    if (!original) continue;
    layer.name = original.name;
    layer.semanticRole = original.semanticRole;
    layer.semanticRoleSource = original.semanticRoleSource;
    layer.importMetadata = original.importMetadata;
  }
  for (const layer of importedViviMeshes) {
    layer.name = stripSeeThroughTechnicalName(layer.name);
  }
  return {
    applied: false,
    warning,
    project,
  };
}

export function applySeeThroughImportContext(
  project: ProjectData,
  manifest: SeeThroughImportManifest,
  options: ApplySeeThroughImportContextOptions,
): SeeThroughImportAnnotationResult {
  const importedViviMeshes = listImportedViviMeshes(project);
  if (manifest.schemaVersion !== options.expectedSchemaVersion) {
    for (const layer of importedViviMeshes) {
      layer.name = stripSeeThroughTechnicalName(layer.name);
    }
    return {
      applied: false,
      warning: `See-through metadata was ignored because manifest schema ${manifest.schemaVersion} is unsupported.`,
      project,
    };
  }

  const originalState = new Map(
    importedViviMeshes.map((layer) => [
      layer.id,
      {
        name: layer.name,
        semanticRole: layer.semanticRole,
        semanticRoleSource: layer.semanticRoleSource,
        importMetadata: layer.importMetadata,
      },
    ]),
  );
  const tokenToManifestLayer = buildTokenToManifestLayerMap(manifest);
  const matchedTokens = new Set<string>();

  for (const layer of importedViviMeshes) {
    const token = parseSeeThroughLeafToken(layer.name);
    if (!token) {
      return restoreImportedLayers(
        project,
        importedViviMeshes,
        originalState,
        "See-through metadata was ignored because imported PSD layers are missing Vivi2D leaf tokens.",
      );
    }
    if (matchedTokens.has(token)) {
      return restoreImportedLayers(
        project,
        importedViviMeshes,
        originalState,
        "See-through metadata was ignored because duplicate Vivi2D leaf tokens were found in the imported PSD.",
      );
    }

    const manifestLayer = tokenToManifestLayer.get(token);
    if (!manifestLayer) {
      return restoreImportedLayers(
        project,
        importedViviMeshes,
        originalState,
        "See-through metadata was ignored because the imported PSD does not match the generated manifest.",
      );
    }

    matchedTokens.add(token);

    layer.name = manifestLayer.name;
    const nextSemanticRole =
      manifestLayer.confidence >= SEE_THROUGH_ROLE_CONFIDENCE_THRESHOLD
        ? mapSeeThroughLabelToRole(manifestLayer.label)
        : "unknown";
    layer.semanticRole = nextSemanticRole;
    layer.semanticRoleSource = shouldPreserveAssistantRoleSource(
      originalState.get(layer.id),
      nextSemanticRole,
    )
      ? "assistant"
      : "seeThroughImport";
    layer.importMetadata = {
      source: "seeThrough",
      seeThrough: {
        label: manifestLayer.label,
        order: manifestLayer.order,
        psdLeafToken: token,
        confidence: manifestLayer.confidence,
        leftRightSplit: manifestLayer.leftRightSplit,
        frontBackSplit: manifestLayer.frontBackSplit,
        bbox: manifestLayer.bbox,
        depthStats: {
          min: manifestLayer.depthStats.min,
          max: manifestLayer.depthStats.max,
          mean: manifestLayer.depthStats.mean,
        },
      },
    };
  }

  if (matchedTokens.size !== manifest.layers.length) {
    return restoreImportedLayers(
      project,
      importedViviMeshes,
      originalState,
      "See-through metadata was ignored because the manifest contains layers that were not found in the imported PSD.",
    );
  }

  return {
    applied: true,
    warning: null,
    project,
  };
}
