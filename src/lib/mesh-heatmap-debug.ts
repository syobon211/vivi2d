const HEATMAP_EPSILON = 1e-6;

export interface MeshHeatmapVertexSample {
  vertexIndex: number;
  intensity: number;
  displacement: number;
}

export interface MeshHeatmapEdgeSample {
  a: number;
  b: number;
  intensity: number;
}

export interface MeshHeatmapData {
  vertices: MeshHeatmapVertexSample[];
  edges: MeshHeatmapEdgeSample[];
  translationX: number;
  translationY: number;
  maxDisplacement: number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clampIntensityScale(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(0.25, Math.min(4, value));
}

function lerpChannel(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  return (
    (lerpChannel(ar, br, t) << 16) |
    (lerpChannel(ag, bg, t) << 8) |
    lerpChannel(ab, bb, t)
  );
}

export function getMeshHeatmapColor(intensity: number): number {
  const t = clamp01(intensity);
  if (t <= 1 / 3) {
    return lerpColor(0x2563eb, 0x14b8a6, t * 3);
  }
  if (t <= 2 / 3) {
    return lerpColor(0x14b8a6, 0xf59e0b, (t - 1 / 3) * 3);
  }
  return lerpColor(0xf59e0b, 0xef4444, (t - 2 / 3) * 3);
}

export function createMeshHeatmapData(
  restVertices: number[],
  currentVertices: number[],
  indices: number[],
  intensityScale = 1,
): MeshHeatmapData | null {
  if (
    restVertices.length === 0 ||
    restVertices.length !== currentVertices.length ||
    restVertices.length % 2 !== 0
  ) {
    return null;
  }

  const vertexCount = restVertices.length / 2;
  let totalDx = 0;
  let totalDy = 0;
  const deltas = new Array(vertexCount) as Array<{ dx: number; dy: number }>;
  for (let i = 0; i < vertexCount; i += 1) {
    const base = i * 2;
    const dx = currentVertices[base]! - restVertices[base]!;
    const dy = currentVertices[base + 1]! - restVertices[base + 1]!;
    deltas[i] = { dx, dy };
    totalDx += dx;
    totalDy += dy;
  }

  const translationX = totalDx / vertexCount;
  const translationY = totalDy / vertexCount;
  const displacementByVertex = new Array(vertexCount).fill(0) as number[];
  let maxDisplacement = 0;
  for (let i = 0; i < vertexCount; i += 1) {
    const residualDx = deltas[i]!.dx - translationX;
    const residualDy = deltas[i]!.dy - translationY;
    const displacement = Math.hypot(residualDx, residualDy);
    displacementByVertex[i] = displacement;
    if (displacement > maxDisplacement) maxDisplacement = displacement;
  }

  if (maxDisplacement <= HEATMAP_EPSILON) {
    return {
      vertices: [],
      edges: [],
      translationX,
      translationY,
      maxDisplacement,
    };
  }

  const scale = clampIntensityScale(intensityScale);
  const vertices: MeshHeatmapVertexSample[] = displacementByVertex.map(
    (displacement, vertexIndex) => ({
      vertexIndex,
      displacement,
      intensity: clamp01((displacement / maxDisplacement) * scale),
    }),
  );

  const seenEdges = new Set<string>();
  const edges: MeshHeatmapEdgeSample[] = [];
  for (let i = 0; i < indices.length; i += 3) {
    const triangle = [indices[i], indices[i + 1], indices[i + 2]];
    for (let j = 0; j < 3; j += 1) {
      const a = triangle[j];
      const b = triangle[(j + 1) % 3];
      if (a === undefined || b === undefined) continue;
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (seenEdges.has(key)) continue;
      seenEdges.add(key);
      edges.push({
        a,
        b,
        intensity: (vertices[a]!.intensity + vertices[b]!.intensity) / 2,
      });
    }
  }

  return { vertices, edges, translationX, translationY, maxDisplacement };
}
