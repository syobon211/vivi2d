import type { LayerNode } from "../types";

export interface StaticCaches {
  meshStaticCache: Map<string, { uvs: Float32Array; indices: Uint32Array }>;
  boneLengths: Map<string, number>;
  meshScratchVerts: Map<string, Float32Array>;
}

export function buildStaticCaches(allLayers: LayerNode[]): StaticCaches {
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
      meshScratchVerts.set(
        layer.id,
        new Float32Array(layer.mesh.vertices.length),
      );
    } else if (layer.kind === "bone") {
      boneLengths.set(layer.id, layer.bone.length);
    }
  }

  return {
    meshStaticCache,
    boneLengths,
    meshScratchVerts,
  };
}
