import type { MeshDensityPreset } from "@vivi2d/core/constants";
import { flattenLayers } from "@vivi2d/core/layer-utils";
import type { LayerSemanticRole, ProjectData } from "@vivi2d/core/types";
import { getSeeThroughImportMetadata, isViviMesh } from "@vivi2d/core/types";

export interface SeeThroughMeshDensitySummary {
  isSeeThroughProject: boolean;
  importedViviMeshCount: number;
  presetByLayerId: Record<string, MeshDensityPreset>;
  counts: Record<MeshDensityPreset, number>;
}

const FINE_ROLES = new Set<LayerSemanticRole>([
  "eyeLeft",
  "eyeRight",
  "eyebrowLeft",
  "eyebrowRight",
  "mouth",
  "hairFront",
  "hairSide",
]);

const COARSE_ROLES = new Set<LayerSemanticRole>(["hairBack"]);

export interface SeeThroughMeshDensityInput {
  semanticRole?: LayerSemanticRole;
  confidence: number;
  frontBackSplit: "front" | "back" | "middle" | "unknown";
}

function buildEmptySummary(): SeeThroughMeshDensitySummary {
  return {
    isSeeThroughProject: false,
    importedViviMeshCount: 0,
    presetByLayerId: {},
    counts: { coarse: 0, standard: 0, fine: 0 },
  };
}

export function buildSeeThroughMeshDensitySummary(
  project: ProjectData,
): SeeThroughMeshDensitySummary {
  const importedViviMeshes = flattenLayers(project.layers).filter(
    (layer) => isViviMesh(layer) && layer.importMetadata?.source === "seeThrough",
  );
  if (importedViviMeshes.length === 0) return buildEmptySummary();

  const presetByLayerId: Record<string, MeshDensityPreset> = {};
  const counts: Record<MeshDensityPreset, number> = {
    coarse: 0,
    standard: 0,
    fine: 0,
  };

  for (const layer of importedViviMeshes) {
    const metadata = getSeeThroughImportMetadata(layer.importMetadata);
    if (!metadata) continue;
    const preset = suggestSeeThroughMeshDensityPreset({
      semanticRole: layer.semanticRole,
      confidence: metadata.confidence,
      frontBackSplit: metadata.frontBackSplit,
    });

    presetByLayerId[layer.id] = preset;
    counts[preset] += 1;
  }

  return {
    isSeeThroughProject: true,
    importedViviMeshCount: importedViviMeshes.length,
    presetByLayerId,
    counts,
  };
}

export function suggestSeeThroughMeshDensityPreset({
  semanticRole,
  confidence,
  frontBackSplit,
}: SeeThroughMeshDensityInput): MeshDensityPreset {
  if (confidence < 0.5) {
    return "standard";
  }

  if (semanticRole === "accessory") {
    if (frontBackSplit === "front") return "fine";
    if (frontBackSplit === "back") return "coarse";
    return "standard";
  }

  if (semanticRole && FINE_ROLES.has(semanticRole)) {
    return "fine";
  }

  if (semanticRole && COARSE_ROLES.has(semanticRole)) {
    return "coarse";
  }

  return "standard";
}
