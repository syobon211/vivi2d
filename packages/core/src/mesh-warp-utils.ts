import { GEOMETRY } from "./constants";

export type PuppetWarpFalloffCurve = "linear" | "smoothstep" | "gaussian";
export type PuppetWarpPinKind = "handle" | "anchor";

export interface PuppetWarpPinSample {
  vertexIndex: number;
  kind: PuppetWarpPinKind;
  dx: number;
  dy: number;
  radius: number;
  strength: number;
  curve: PuppetWarpFalloffCurve;
}

const GAUSSIAN_K = 4;
const CENTERLINE_EPSILON = 1e-6;

function falloffWeight(
  distance: number,
  radius: number,
  curve: PuppetWarpFalloffCurve,
): number {
  if (radius <= 0) return 0;
  const t = distance / radius;
  if (t >= 1) return 0;
  const u = 1 - t;
  switch (curve) {
    case "linear":
      return u;
    case "smoothstep":
      return u * u * (3 - 2 * u);
    case "gaussian":
      return Math.exp(-GAUSSIAN_K * t * t);
  }
}

export function findMirroredVertexIndex(
  vertices: ReadonlyArray<number>,
  vertexIndex: number,
  width: number,
  tolerance: number,
): number | null {
  const stride = GEOMETRY.COORD_STRIDE;
  const vertCount = vertices.length / stride;
  if (
    vertexIndex < 0 ||
    vertexIndex >= vertCount ||
    !Number.isFinite(width) ||
    !Number.isFinite(tolerance) ||
    tolerance < 0
  ) {
    return null;
  }

  const source = vertexIndex * stride;
  const sx = vertices[source]!;
  const sy = vertices[source + 1]!;
  const targetX = width - sx;
  if (Math.abs(targetX - sx) <= CENTERLINE_EPSILON) return null;

  let bestIndex: number | null = null;
  let bestYDiff = Infinity;
  let bestXDiff = Infinity;
  let ambiguous = false;

  for (let i = 0; i < vertCount; i++) {
    if (i === vertexIndex) continue;
    const base = i * stride;
    const x = vertices[base]!;
    const y = vertices[base + 1]!;
    const xDiff = Math.abs(x - targetX);
    const yDiff = Math.abs(y - sy);
    if (xDiff > tolerance || yDiff > tolerance) continue;

    if (yDiff < bestYDiff || (yDiff === bestYDiff && xDiff < bestXDiff)) {
      bestIndex = i;
      bestYDiff = yDiff;
      bestXDiff = xDiff;
      ambiguous = false;
      continue;
    }

    if (yDiff === bestYDiff && xDiff === bestXDiff) {
      ambiguous = true;
    }
  }

  if (ambiguous) return null;
  return bestIndex;
}

export function applyPuppetWarp(
  baseVertices: ReadonlyArray<number>,
  pins: ReadonlyArray<PuppetWarpPinSample>,
): number[] {
  const stride = GEOMETRY.COORD_STRIDE;
  const out = baseVertices.slice() as number[];
  if (pins.length === 0) return out;

  const pinCount = pins.length;
  const pinX = new Array<number>(pinCount);
  const pinY = new Array<number>(pinCount);
  const pinDragged = new Array<boolean>(pinCount);
  for (let p = 0; p < pinCount; p++) {
    const pin = pins[p]!;
    const base = pin.vertexIndex * stride;
    if (base < 0 || base + 1 >= baseVertices.length) {
      pinX[p] = Number.NaN;
      pinY[p] = Number.NaN;
      pinDragged[p] = false;
      continue;
    }
    pinX[p] = baseVertices[base]!;
    pinY[p] = baseVertices[base + 1]!;
    pinDragged[p] = pin.kind === "handle" && (pin.dx !== 0 || pin.dy !== 0);
  }

  const vertCount = baseVertices.length / stride;
  for (let vi = 0; vi < vertCount; vi++) {
    const i = vi * stride;
    const vx = baseVertices[i]!;
    const vy = baseVertices[i + 1]!;

    let exactPin = -1;
    for (let p = 0; p < pinCount; p++) {
      if (Number.isFinite(pinX[p]!) && pins[p]!.vertexIndex === vi && pinDragged[p]) {
        exactPin = p;
        break;
      }
    }
    if (exactPin !== -1) {
      const pin = pins[exactPin]!;
      out[i] = vx + pin.dx;
      out[i + 1] = vy + pin.dy;
      continue;
    }

    let sumWX = 0;
    let sumWY = 0;
    let sumW = 0;
    for (let p = 0; p < pinCount; p++) {
      const pin = pins[p]!;
      if (!Number.isFinite(pinX[p]!) || !Number.isFinite(pinY[p]!)) continue;
      const ddx = vx - pinX[p]!;
      const ddy = vy - pinY[p]!;
      const dist = Math.hypot(ddx, ddy);
      const w = falloffWeight(dist, pin.radius, pin.curve) * pin.strength;
      if (w <= 0) continue;

      if (pin.kind === "handle") {
        if (!pinDragged[p]) continue;
        sumWX += pin.dx * w;
        sumWY += pin.dy * w;
      }
      sumW += w;
    }

    if (sumW > 0) {
      out[i] = vx + sumWX / sumW;
      out[i + 1] = vy + sumWY / sumW;
    }
  }

  return out;
}
