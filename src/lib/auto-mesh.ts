import { AUTO_MESH, type MeshDensityPreset } from "@vivi2d/core/constants";
import { generateGridMesh } from "@vivi2d/core/mesh-utils";
import type { MeshData } from "@vivi2d/core/types";
import Delaunay from "delaunator";

// Builds a lightweight triangle mesh from the opaque region of a texture.
// The pipeline thresholds alpha, extracts an ordered outline, simplifies it,
// seeds interior points, and triangulates the result.
const S = 2;
const MIN_ALPHA_COVERAGE = 0.985;
const MAX_FALLBACK_DIVISIONS = 16;

function buildAlphaMask(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  threshold: number,
): Uint8Array {
  const mask = new Uint8Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const alpha = data[(y * w + x) * 4 + 3]!;
      if (alpha >= threshold) {
        // Mark the four grid corners around each opaque pixel so the outline can
        // be reconstructed from grid vertices instead of raw pixel centers.
        mask[y * (w + 1) + x] = 1;
        mask[y * (w + 1) + (x + 1)] = 1;
        mask[(y + 1) * (w + 1) + x] = 1;
        mask[(y + 1) * (w + 1) + (x + 1)] = 1;
      }
    }
  }
  return mask;
}

export function extractContour(
  imageData: ImageData,
  threshold = AUTO_MESH.ALPHA_THRESHOLD,
): number[] {
  const { width: w, height: h, data } = imageData;
  const mask = buildAlphaMask(data, w, h, threshold);
  const mw = w + 1;
  const mh = h + 1;

  const isBorder = (x: number, y: number): boolean => {
    if (mask[y * mw + x] === 0) return false;
    if (x === 0 || mask[y * mw + (x - 1)] === 0) return true;
    if (x >= mw - 1 || mask[y * mw + (x + 1)] === 0) return true;
    if (y === 0 || mask[(y - 1) * mw + x] === 0) return true;
    if (y >= mh - 1 || mask[(y + 1) * mw + x] === 0) return true;
    return false;
  };

  const borderSet = new Set<number>();
  const key = (x: number, y: number) => y * mw + x;
  let firstX = -1;
  let firstY = -1;

  for (let y = 0; y < mh; y++) {
    for (let x = 0; x < mw; x++) {
      if (isBorder(x, y)) {
        borderSet.add(key(x, y));
        if (firstX < 0) {
          firstX = x;
          firstY = y;
        }
      }
    }
  }

  if (borderSet.size < 3) {
    const result: number[] = [];
    for (const k of borderSet) {
      result.push(k % mw, Math.floor(k / mw));
    }
    return result;
  }

  // Walk the border through 8-neighbor adjacency so the contour stays ordered
  // even for concave silhouettes.
  const dx = [1, 1, 0, -1, -1, -1, 0, 1];
  const dy = [0, 1, 1, 1, 0, -1, -1, -1];

  const contour: number[] = [];
  const visited = new Set<number>();

  let cx = firstX;
  let cy = firstY;

  for (let step = 0; step < borderSet.size + 1; step++) {
    const k = key(cx, cy);
    if (visited.has(k)) break;
    contour.push(cx, cy);
    visited.add(k);

    let found = false;
    for (let i = 0; i < 8; i++) {
      const nx = cx + dx[i]!;
      const ny = cy + dy[i]!;
      if (nx < 0 || nx >= mw || ny < 0 || ny >= mh) continue;
      const nk = key(nx, ny);
      if (borderSet.has(nk) && !visited.has(nk)) {
        cx = nx;
        cy = ny;
        found = true;
        break;
      }
    }

    if (!found) break;
  }

  if (contour.length < 6) return contour;
  return contour;
}

function pointToSegmentDist(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function simplifyContour(contour: number[], tolerance: number): number[] {
  const n = contour.length / S;
  if (n <= 3) return contour.slice();

  function rdp(start: number, end: number, out: boolean[]): void {
    let maxDist = 0;
    let maxIdx = start;
    const ax = contour[start * S]!;
    const ay = contour[start * S + 1]!;
    const bx = contour[end * S]!;
    const by = contour[end * S + 1]!;

    for (let i = start + 1; i < end; i++) {
      const d = pointToSegmentDist(contour[i * S]!, contour[i * S + 1]!, ax, ay, bx, by);
      if (d > maxDist) {
        maxDist = d;
        maxIdx = i;
      }
    }

    if (maxDist > tolerance) {
      out[maxIdx] = true;
      rdp(start, maxIdx, out);
      rdp(maxIdx, end, out);
    }
  }

  const keep = new Array<boolean>(n).fill(false);
  keep[0] = true;
  keep[n - 1] = true;
  rdp(0, n - 1, keep);

  const result: number[] = [];
  for (let i = 0; i < n; i++) {
    if (keep[i]) {
      result.push(contour[i * S]!, contour[i * S + 1]!);
    }
  }
  return result;
}

export function pointInPolygon(px: number, py: number, poly: number[]): boolean {
  const n = poly.length / S;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[i * S]!;
    const yi = poly[i * S + 1]!;
    const xj = poly[j * S]!;
    const yj = poly[j * S + 1]!;
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export function generateInteriorPoints(
  contour: number[],
  spacing: number,
  bounds: { x: number; y: number; w: number; h: number },
): number[] {
  const points: number[] = [];
  const { x: bx, y: by, w: bw, h: bh } = bounds;

  for (let y = by + spacing; y < by + bh - spacing * 0.5; y += spacing) {
    for (let x = bx + spacing; x < bx + bw - spacing * 0.5; x += spacing) {
      if (pointInPolygon(x, y, contour)) {
        let tooClose = false;
        const n = contour.length / S;
        for (let i = 0; i < n; i++) {
          const dx = x - contour[i * S]!;
          const dy = y - contour[i * S + 1]!;
          if (dx * dx + dy * dy < (spacing * 0.5) ** 2) {
            tooClose = true;
            break;
          }
        }
        if (!tooClose) {
          points.push(x, y);
        }
      }
    }
  }
  return points;
}

export function triangulate(points: number[], contour: number[]): number[] {
  const n = points.length / S;
  if (n < 3) return [];

  const d = new Delaunay(points);
  const triangles = d.triangles;
  const filtered: number[] = [];

  for (let i = 0; i < triangles.length; i += 3) {
    const a = triangles[i]!;
    const b = triangles[i + 1]!;
    const c = triangles[i + 2]!;
    // Unconstrained Delaunay is good enough here as long as we discard
    // triangles whose centroid falls outside the simplified contour.
    const cx = (points[a * S]! + points[b * S]! + points[c * S]!) / 3;
    const cy = (points[a * S + 1]! + points[b * S + 1]! + points[c * S + 1]!) / 3;
    if (pointInPolygon(cx, cy, contour)) {
      filtered.push(a, b, c);
    }
  }

  return filtered;
}

function countOpaqueComponents(imageData: ImageData, threshold: number): number {
  const { width: w, height: h, data } = imageData;
  const visited = new Uint8Array(w * h);
  const stack: number[] = [];
  let components = 0;

  for (let index = 0; index < w * h; index++) {
    if (visited[index] === 1 || data[index * 4 + 3]! < threshold) continue;
    components += 1;
    if (components > 1) return components;

    visited[index] = 1;
    stack.push(index);

    while (stack.length > 0) {
      const current = stack.pop()!;
      const cx = current % w;
      const cy = Math.floor(current / w);

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;

          const next = ny * w + nx;
          if (visited[next] === 1 || data[next * 4 + 3]! < threshold) continue;
          visited[next] = 1;
          stack.push(next);
        }
      }
    }
  }

  return components;
}

function isPointInTriangle(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): boolean {
  const s1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const s2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const s3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const hasNegative = s1 < -1e-6 || s2 < -1e-6 || s3 < -1e-6;
  const hasPositive = s1 > 1e-6 || s2 > 1e-6 || s3 > 1e-6;
  return !(hasNegative && hasPositive);
}

function rasterizeTriangleCoverage(
  coverage: Uint8Array,
  texW: number,
  texH: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): void {
  const area = Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay));
  if (area < 1e-6) return;

  const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
  const maxX = Math.min(texW - 1, Math.ceil(Math.max(ax, bx, cx)));
  const minY = Math.max(0, Math.floor(Math.min(ay, by, cy)));
  const maxY = Math.min(texH - 1, Math.ceil(Math.max(ay, by, cy)));

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (isPointInTriangle(x + 0.5, y + 0.5, ax, ay, bx, by, cx, cy)) {
        coverage[y * texW + x] = 1;
      }
    }
  }
}

function meshCoversOpaquePixels(
  imageData: ImageData,
  mesh: MeshData,
  threshold: number,
): boolean {
  const { width: texW, height: texH, data } = imageData;
  const vertexCount = mesh.uvs.length / S;
  if (
    texW === 0 ||
    texH === 0 ||
    mesh.vertices.length !== mesh.uvs.length ||
    mesh.indices.length < 3 ||
    mesh.indices.length % 3 !== 0
  ) {
    return false;
  }

  const coverage = new Uint8Array(texW * texH);
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = mesh.indices[i]!;
    const b = mesh.indices[i + 1]!;
    const c = mesh.indices[i + 2]!;
    if (
      a < 0 ||
      b < 0 ||
      c < 0 ||
      a >= vertexCount ||
      b >= vertexCount ||
      c >= vertexCount
    ) {
      return false;
    }

    const ax = mesh.uvs[a * S]! * texW;
    const ay = mesh.uvs[a * S + 1]! * texH;
    const bx = mesh.uvs[b * S]! * texW;
    const by = mesh.uvs[b * S + 1]! * texH;
    const cx = mesh.uvs[c * S]! * texW;
    const cy = mesh.uvs[c * S + 1]! * texH;
    if (
      !Number.isFinite(ax) ||
      !Number.isFinite(ay) ||
      !Number.isFinite(bx) ||
      !Number.isFinite(by) ||
      !Number.isFinite(cx) ||
      !Number.isFinite(cy)
    ) {
      return false;
    }

    rasterizeTriangleCoverage(coverage, texW, texH, ax, ay, bx, by, cx, cy);
  }

  let opaque = 0;
  let covered = 0;
  for (let i = 0; i < texW * texH; i++) {
    if (data[i * 4 + 3]! < threshold) continue;
    opaque += 1;
    if (coverage[i] === 1) covered += 1;
  }

  return opaque > 0 && covered / opaque >= MIN_ALPHA_COVERAGE;
}

function createVisualPreservingFallbackMesh(
  width: number,
  height: number,
  preset: MeshDensityPreset,
): MeshData {
  const spacing = AUTO_MESH.PRESETS[preset].interiorSpacing;
  const divisionsX = Math.max(
    1,
    Math.min(MAX_FALLBACK_DIVISIONS, Math.ceil(width / spacing)),
  );
  const divisionsY = Math.max(
    1,
    Math.min(MAX_FALLBACK_DIVISIONS, Math.ceil(height / spacing)),
  );
  return generateGridMesh(width, height, divisionsX, divisionsY);
}

export function generateAutoMesh(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  preset: MeshDensityPreset,
): MeshData | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  if (canvas.width === 0 || canvas.height === 0) return null;

  let imageData: ImageData;
  try {
    imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  } catch {
    // Cross-origin canvases cannot always be read back. Failing soft keeps the
    // auto-mesh feature safe for unsupported textures.
    return null;
  }
  return generateAutoMeshFromImageData(
    imageData,
    canvas.width,
    canvas.height,
    width,
    height,
    preset,
  );
}

export function generateAutoMeshFromImageData(
  imageData: ImageData,
  texW: number,
  texH: number,
  width: number,
  height: number,
  preset: MeshDensityPreset,
): MeshData | null {
  if (texW === 0 || texH === 0) return null;
  const config = AUTO_MESH.PRESETS[preset];
  const safeFallback = () => createVisualPreservingFallbackMesh(width, height, preset);

  // Convert texture pixels back into layer-local coordinates before storing the
  // generated mesh.
  const scaleX = width / texW;
  const scaleY = height / texH;

  const opaqueComponents = countOpaqueComponents(imageData, AUTO_MESH.ALPHA_THRESHOLD);
  if (opaqueComponents === 0) return null;
  if (opaqueComponents > 1) {
    return safeFallback();
  }

  const rawContour = extractContour(imageData);
  if (rawContour.length < 6) return safeFallback();

  const simplified = simplifyContour(rawContour, config.contourSimplify);
  if (simplified.length < 6) return safeFallback();

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < simplified.length; i += S) {
    const x = simplified[i]!;
    const y = simplified[i + 1]!;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }

  const interior = generateInteriorPoints(simplified, config.interiorSpacing, {
    x: minX,
    y: minY,
    w: maxX - minX,
    h: maxY - minY,
  });

  const allPoints = [...simplified, ...interior];
  const indices = triangulate(allPoints, simplified);
  if (indices.length === 0) return safeFallback();

  const numPts = allPoints.length / S;
  const vertices = new Array(numPts * S);
  const uvs = new Array(numPts * S);
  for (let i = 0; i < numPts; i++) {
    const px = allPoints[i * S]! * scaleX;
    const py = allPoints[i * S + 1]! * scaleY;
    vertices[i * S] = px;
    vertices[i * S + 1] = py;
    uvs[i * S] = px / width;
    uvs[i * S + 1] = py / height;
  }

  const mesh = {
    vertices,
    uvs,
    indices,
    divisionsX: 0,
    divisionsY: 0,
  };

  if (!meshCoversOpaquePixels(imageData, mesh, AUTO_MESH.ALPHA_THRESHOLD)) {
    return safeFallback();
  }

  return mesh;
}
