import type { LayerNode } from "@vivi2d/core";

export interface RuntimeStaticCaches {
  readonly meshStaticCache: Map<string, { uvs: Float32Array; indices: Uint32Array }>;
  readonly boneLengths: Map<string, number>;
  readonly meshScratchVerts: Map<string, Float32Array>;
}

export function buildRuntimeStaticCaches(
  allLayers: readonly LayerNode[],
): RuntimeStaticCaches {
  const meshStaticCache = new Map<
    string,
    { uvs: Float32Array; indices: Uint32Array }
  >();
  const boneLengths = new Map<string, number>();
  const meshScratchVerts = new Map<string, Float32Array>();

  for (const layer of allLayers) {
    if (layer.kind === "viviMesh") {
      meshStaticCache.set(layer.id, {
        uvs: new Float32Array(layer.mesh.uvs),
        indices: new Uint32Array(layer.mesh.indices),
      });
      meshScratchVerts.set(layer.id, new Float32Array(layer.mesh.vertices.length));
    } else if (layer.kind === "bone") {
      boneLengths.set(layer.id, layer.bone.length);
    }
  }

  return { meshStaticCache, boneLengths, meshScratchVerts };
}
