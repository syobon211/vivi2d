import type { MeshData } from "@vivi2d/core";

export function meshDataToRuntimeTypedArrays(mesh: MeshData): {
  readonly vertices: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint32Array;
} {
  return {
    vertices: new Float32Array(mesh.vertices),
    uvs: new Float32Array(mesh.uvs),
    indices: new Uint32Array(mesh.indices),
  };
}
