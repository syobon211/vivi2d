import { GEOMETRY } from "@vivi2d/core";

export function isRuntimePolygonFlipped(vertices: ArrayLike<number>): boolean {
  const minVertices = 3 * GEOMETRY.COORD_STRIDE;
  if (vertices.length < minVertices) return false;

  let signedArea = 0;
  const length = vertices.length;
  for (let index = 0; index < length; index += GEOMETRY.COORD_STRIDE) {
    const nextIndex = (index + GEOMETRY.COORD_STRIDE) % length;
    const x0 = vertices[index]!;
    const y0 = vertices[index + 1]!;
    const x1 = vertices[nextIndex]!;
    const y1 = vertices[nextIndex + 1]!;
    signedArea += x0 * y1 - x1 * y0;
  }

  return signedArea < 0;
}
