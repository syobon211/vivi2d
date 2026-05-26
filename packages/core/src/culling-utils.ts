import { GEOMETRY } from "./constants";

export function isPolygonFlipped(vertices: ArrayLike<number>): boolean {
  const minVerts = 3 * GEOMETRY.COORD_STRIDE;
  if (vertices.length < minVerts) return false;

  let signedArea = 0;
  const n = vertices.length;
  for (let i = 0; i < n; i += GEOMETRY.COORD_STRIDE) {
    const nextI = (i + GEOMETRY.COORD_STRIDE) % n;
    const x0 = vertices[i]!;
    const y0 = vertices[i + 1]!;
    const x1 = vertices[nextI]!;
    const y1 = vertices[nextI + 1]!;
    signedArea += x0 * y1 - x1 * y0;
  }

  return signedArea < 0;
}
