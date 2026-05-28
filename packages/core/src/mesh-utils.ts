import { GEOMETRY } from "./constants";
import type { MeshData } from "./types";

export function generateGridMesh(
  width: number,
  height: number,
  divisionsX: number,
  divisionsY: number,
): MeshData {
  const cols = Math.max(1, Math.round(divisionsX));
  const rows = Math.max(1, Math.round(divisionsY));
  const vertCount = (cols + 1) * (rows + 1);

  const vertices: number[] = new Array(vertCount * GEOMETRY.COORD_STRIDE);
  const uvs: number[] = new Array(vertCount * GEOMETRY.COORD_STRIDE);
  const indices: number[] = new Array(cols * rows * 6);

  let vi = 0;
  for (let r = 0; r <= rows; r++) {
    const ty = r / rows;
    for (let c = 0; c <= cols; c++) {
      const tx = c / cols;
      vertices[vi] = tx * width;
      vertices[vi + 1] = ty * height;
      uvs[vi] = tx;
      uvs[vi + 1] = ty;
      vi += 2;
    }
  }

  let ii = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const tl = r * (cols + 1) + c;
      const tr = tl + 1;
      const bl = tl + (cols + 1);
      const br = bl + 1;
      indices[ii++] = tl;
      indices[ii++] = bl;
      indices[ii++] = tr;
      indices[ii++] = tr;
      indices[ii++] = bl;
      indices[ii++] = br;
    }
  }

  return { vertices, uvs, indices, divisionsX: cols, divisionsY: rows };
}

export function meshDataToTypedArrays(mesh: MeshData): {
  vertices: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
} {
  return {
    vertices: new Float32Array(mesh.vertices),
    uvs: new Float32Array(mesh.uvs),
    indices: new Uint32Array(mesh.indices),
  };
}
