export type LassoSmoothingStrength = "off" | "low" | "medium" | "high";

export type LassoSmoothingWarning =
  | "tooFewPoints"
  | "pointLimitReduced"
  | "detailReducedForSmoothing"
  | "areaDeltaTooLarge"
  | "boundsDriftTooLarge"
  | "selfIntersectionSuspected"
  | "smoothingFallbackToRaw"
  | "degenerateStroke"
  | "nonFinitePointDropped";

export interface LassoPoint {
  x: number;
  y: number;
  t: number;
}

export interface FloatRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface IntRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ManualSplitViewportTransform {
  cssToBackingScaleX: number;
  cssToBackingScaleY: number;
  panX: number;
  panY: number;
  zoom: number;
  sourceOffsetX: number;
  sourceOffsetY: number;
  sourceWidth: number;
  sourceHeight: number;
  version: number;
}

export interface LassoSmoothingOptions {
  strength: LassoSmoothingStrength;
  minSampleDistancePx: number;
  maxInputPointCount: number;
  maxOutputPointCount: number;
  iterations: number;
  cutRatio: number;
  maxAreaDeltaRatio: number;
  maxLocalDisplacementPx: number;
  minAbsoluteAreaPx: number;
  minRasterizedChangedPixels: number;
  clampMarginPx: number;
  selfIntersectionRatioThreshold: number;
  sourceWidth: number;
  sourceHeight: number;
}

export type SmoothedLassoPath =
  | {
      status: "accepted";
      rawPoints: readonly LassoPoint[];
      acceptedPoints: readonly LassoPoint[];
      previewPoints: readonly LassoPoint[];
      acceptedIterations: number;
      usedFallback: boolean;
      warnings: readonly LassoSmoothingWarning[];
    }
  | {
      status: "rejectedTooFewPoints" | "rejectedDegenerate";
      rawPoints: readonly LassoPoint[];
      previewPoints: readonly [];
      acceptedIterations: 0;
      usedFallback: true;
      warnings: readonly LassoSmoothingWarning[];
    }
  | {
      status: "ambiguousSelfIntersection";
      rawPoints: readonly LassoPoint[];
      previewPoints: readonly LassoPoint[];
      acceptedIterations: 0;
      usedFallback: true;
      warnings: readonly LassoSmoothingWarning[];
    };

const STRENGTHS: readonly LassoSmoothingStrength[] = [
  "off",
  "low",
  "medium",
  "high",
];

const DEFAULTS: Record<
  LassoSmoothingStrength,
  Omit<LassoSmoothingOptions, "sourceWidth" | "sourceHeight">
> = {
  off: {
    strength: "off",
    minSampleDistancePx: 0.5,
    maxInputPointCount: 4096,
    maxOutputPointCount: 8192,
    iterations: 0,
    cutRatio: 0,
    maxAreaDeltaRatio: 0,
    maxLocalDisplacementPx: Number.POSITIVE_INFINITY,
    minAbsoluteAreaPx: 4,
    minRasterizedChangedPixels: 1,
    clampMarginPx: 1,
    selfIntersectionRatioThreshold: 0.04,
  },
  low: {
    strength: "low",
    minSampleDistancePx: 1,
    maxInputPointCount: 4096,
    maxOutputPointCount: 8192,
    iterations: 1,
    cutRatio: 1 / 8,
    maxAreaDeltaRatio: 0.2,
    maxLocalDisplacementPx: 8,
    minAbsoluteAreaPx: 4,
    minRasterizedChangedPixels: 1,
    clampMarginPx: 1,
    selfIntersectionRatioThreshold: 0.04,
  },
  medium: {
    strength: "medium",
    minSampleDistancePx: 1.5,
    maxInputPointCount: 4096,
    maxOutputPointCount: 8192,
    iterations: 2,
    cutRatio: 1 / 6,
    maxAreaDeltaRatio: 0.3,
    maxLocalDisplacementPx: 12,
    minAbsoluteAreaPx: 4,
    minRasterizedChangedPixels: 1,
    clampMarginPx: 1,
    selfIntersectionRatioThreshold: 0.04,
  },
  high: {
    strength: "high",
    minSampleDistancePx: 2,
    maxInputPointCount: 4096,
    maxOutputPointCount: 8192,
    iterations: 3,
    cutRatio: 1 / 4,
    maxAreaDeltaRatio: 0.4,
    maxLocalDisplacementPx: 18,
    minAbsoluteAreaPx: 4,
    minRasterizedChangedPixels: 1,
    clampMarginPx: 1,
    selfIntersectionRatioThreshold: 0.04,
  },
};

export function resolveEffectiveLassoStrength(
  base: LassoSmoothingStrength,
  precision: boolean,
): LassoSmoothingStrength {
  if (!precision) return base;
  return base === "off" ? "off" : "low";
}

export function createLassoSmoothingOptions(
  strength: LassoSmoothingStrength,
  sourceWidth: number,
  sourceHeight: number,
  precision = false,
): LassoSmoothingOptions {
  const effective = resolveEffectiveLassoStrength(strength, precision);
  return {
    ...DEFAULTS[effective],
    sourceWidth,
    sourceHeight,
  };
}

export function pointerEventToSourcePoint(
  event: Pick<PointerEvent, "clientX" | "clientY" | "timeStamp">,
  canvasRect: Pick<DOMRectReadOnly, "left" | "top">,
  transform: ManualSplitViewportTransform,
): LassoPoint | null {
  if (
    !Number.isFinite(event.clientX) ||
    !Number.isFinite(event.clientY) ||
    !Number.isFinite(event.timeStamp) ||
    !Number.isFinite(transform.cssToBackingScaleX) ||
    !Number.isFinite(transform.cssToBackingScaleY) ||
    !Number.isFinite(transform.panX) ||
    !Number.isFinite(transform.panY) ||
    !Number.isFinite(transform.sourceOffsetX) ||
    !Number.isFinite(transform.sourceOffsetY) ||
    transform.cssToBackingScaleX <= 0 ||
    transform.cssToBackingScaleY <= 0 ||
    transform.zoom <= 0
  ) {
    return null;
  }

  const backingX = (event.clientX - canvasRect.left) * transform.cssToBackingScaleX;
  const backingY = (event.clientY - canvasRect.top) * transform.cssToBackingScaleY;
  const stageX = (backingX - transform.panX) / transform.zoom;
  const stageY = (backingY - transform.panY) / transform.zoom;
  return {
    x: stageX - transform.sourceOffsetX,
    y: stageY - transform.sourceOffsetY,
    t: event.timeStamp,
  };
}

export function shouldAcceptLassoPoint(
  previous: LassoPoint | null,
  next: LassoPoint,
  minSampleDistancePx: number,
): boolean {
  if (!previous) return true;
  const dx = next.x - previous.x;
  const dy = next.y - previous.y;
  if (dx * dx + dy * dy >= minSampleDistancePx * minSampleDistancePx) {
    return true;
  }
  return next.t - previous.t >= 32;
}

export function smoothLassoPath(
  inputPoints: readonly LassoPoint[],
  options: LassoSmoothingOptions,
): SmoothedLassoPath {
  const baseWarnings = new Set<LassoSmoothingWarning>();
  const rawPoints = normalizeInputPoints(inputPoints, options, baseWarnings);
  if (rawPoints.length < 3) {
    return rejectTooFew(rawPoints, baseWarnings);
  }

  const requestedIndex = STRENGTHS.indexOf(options.strength);
  if (requestedIndex <= 0) return evaluateRaw(rawPoints, options, baseWarnings, false);

  for (let index = requestedIndex; index >= 1; index -= 1) {
    const strength = STRENGTHS[index]!;
    const attemptWarnings = new Set(baseWarnings);
    const attemptOptions = {
      ...options,
      ...DEFAULTS[strength],
      sourceWidth: options.sourceWidth,
      sourceHeight: options.sourceHeight,
    };
    const attempted = attemptSmoothed(rawPoints, attemptOptions, attemptWarnings);
    if (!attempted) continue;
    if (attempted.status === "accepted") {
      return {
        ...attempted,
        usedFallback: strength !== options.strength,
      };
    }
    if (attempted.status === "ambiguousSelfIntersection") return attempted;
  }

  return evaluateRaw(rawPoints, options, new Set(baseWarnings), true);
}

export function computeMaskDirtyRect(
  pathBounds: FloatRect,
  maskWidth: number,
  maskHeight: number,
  options: { aaPaddingPx: number; extraPaddingPx: number },
): IntRect | null {
  if (
    pathBounds.width < 0 ||
    pathBounds.height < 0 ||
    maskWidth <= 0 ||
    maskHeight <= 0
  ) {
    return null;
  }
  const pad = options.aaPaddingPx + options.extraPaddingPx;
  const left = Math.floor(pathBounds.x - pad);
  const top = Math.floor(pathBounds.y - pad);
  const right = Math.ceil(pathBounds.x + pathBounds.width + pad);
  const bottom = Math.ceil(pathBounds.y + pathBounds.height + pad);
  const x0 = Math.max(0, left);
  const y0 = Math.max(0, top);
  const x1 = Math.min(maskWidth, right);
  const y1 = Math.min(maskHeight, bottom);
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

export function getLassoPathBounds(
  points: readonly Pick<LassoPoint, "x" | "y">[],
): FloatRect | null {
  if (points.length === 0) return null;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function normalizeInputPoints(
  points: readonly LassoPoint[],
  options: LassoSmoothingOptions,
  warnings: Set<LassoSmoothingWarning>,
): LassoPoint[] {
  const normalized: LassoPoint[] = [];
  for (const point of points) {
    if (
      !Number.isFinite(point.x) ||
      !Number.isFinite(point.y) ||
      !Number.isFinite(point.t)
    ) {
      warnings.add("nonFinitePointDropped");
      continue;
    }
    const clamped = {
      x: clamp(point.x, -options.clampMarginPx, options.sourceWidth + options.clampMarginPx),
      y: clamp(point.y, -options.clampMarginPx, options.sourceHeight + options.clampMarginPx),
      t: point.t,
    };
    const previous = normalized[normalized.length - 1] ?? null;
    if (shouldAcceptLassoPoint(previous, clamped, options.minSampleDistancePx)) {
      normalized.push(clamped);
    }
  }
  const distinct = removeNearDuplicateClosingPoint(normalized);
  if (distinct.length <= options.maxInputPointCount) return distinct;
  warnings.add("pointLimitReduced");
  return sampleByArcLength(distinct, options.maxInputPointCount);
}

function attemptSmoothed(
  rawPoints: readonly LassoPoint[],
  options: LassoSmoothingOptions,
  warnings: Set<LassoSmoothingWarning>,
): SmoothedLassoPath | null {
  let basePoints = rawPoints;
  const maxBeforeSmoothing = Math.max(
    3,
    Math.floor(options.maxOutputPointCount / 2 ** options.iterations),
  );
  if (basePoints.length > maxBeforeSmoothing) {
    warnings.add("detailReducedForSmoothing");
    basePoints = sampleByArcLength(basePoints, maxBeforeSmoothing);
  }
  let smoothed = basePoints;
  for (let iteration = 0; iteration < options.iterations; iteration += 1) {
    smoothed = chaikinClosed(smoothed, options.cutRatio);
  }

  const guard = validateCandidate(rawPoints, smoothed, options, warnings);
  if (guard === "failed") return null;
  if (guard !== "accepted") return guard;
  return {
    status: "accepted",
    rawPoints,
    acceptedPoints: smoothed,
    previewPoints: smoothed,
    acceptedIterations: options.iterations,
    usedFallback: false,
    warnings: [...warnings],
  };
}

function evaluateRaw(
  rawPoints: readonly LassoPoint[],
  options: LassoSmoothingOptions,
  warnings: Set<LassoSmoothingWarning>,
  usedFallback: boolean,
): SmoothedLassoPath {
  if (rawPoints.length < 3) return rejectTooFew(rawPoints, warnings);
  if (Math.abs(polygonArea(rawPoints)) < options.minAbsoluteAreaPx) {
    warnings.add("degenerateStroke");
    return {
      status: "rejectedDegenerate",
      rawPoints,
      previewPoints: [],
      acceptedIterations: 0,
      usedFallback: true,
      warnings: [...warnings],
    };
  }
  const intersection = getSelfIntersectionStatus(rawPoints, options);
  if (intersection !== "clear") {
    warnings.add("selfIntersectionSuspected");
    return {
      status: "ambiguousSelfIntersection",
      rawPoints,
      previewPoints: rawPoints,
      acceptedIterations: 0,
      usedFallback: true,
      warnings: [...warnings],
    };
  }
  const acceptedWarnings = new Set(warnings);
  if (usedFallback) {
    acceptedWarnings.add("smoothingFallbackToRaw");
  }
  return {
    status: "accepted",
    rawPoints,
    acceptedPoints: rawPoints,
    previewPoints: rawPoints,
    acceptedIterations: 0,
    usedFallback,
    warnings: [...acceptedWarnings],
  };
}

function validateCandidate(
  rawPoints: readonly LassoPoint[],
  candidate: readonly LassoPoint[],
  options: LassoSmoothingOptions,
  warnings: Set<LassoSmoothingWarning>,
): "accepted" | "failed" | SmoothedLassoPath {
  if (candidate.length > options.maxOutputPointCount) {
    warnings.add("pointLimitReduced");
    return "failed";
  }
  const rawSignedArea = polygonArea(rawPoints);
  const candidateSignedArea = polygonArea(candidate);
  const rawArea = Math.abs(rawSignedArea);
  const candidateArea = Math.abs(candidateSignedArea);
  if (candidateArea < options.minAbsoluteAreaPx || rawArea === 0) {
    warnings.add("degenerateStroke");
    return "failed";
  }
  if (Math.sign(rawSignedArea) !== Math.sign(candidateSignedArea)) {
    warnings.add("selfIntersectionSuspected");
    return "failed";
  }
  if (rawArea > 0) {
    const areaDelta = Math.abs(candidateArea - rawArea) / rawArea;
    if (areaDelta > options.maxAreaDeltaRatio) {
      warnings.add("areaDeltaTooLarge");
      return "failed";
    }
  }
  if (!isWithinBounds(candidate, rawPoints)) {
    warnings.add("boundsDriftTooLarge");
    return "failed";
  }
  if (getMaxSampledDistanceToPolygon(candidate, rawPoints) > options.maxLocalDisplacementPx) {
    warnings.add("boundsDriftTooLarge");
    return "failed";
  }
  const intersection = getSelfIntersectionStatus(candidate, options);
  if (intersection !== "clear") {
    return "failed";
  }
  return "accepted";
}

function rejectTooFew(
  rawPoints: readonly LassoPoint[],
  warnings: Set<LassoSmoothingWarning>,
): SmoothedLassoPath {
  warnings.add("tooFewPoints");
  return {
    status: "rejectedTooFewPoints",
    rawPoints,
    previewPoints: [],
    acceptedIterations: 0,
    usedFallback: true,
    warnings: [...warnings],
  };
}

function chaikinClosed(
  points: readonly LassoPoint[],
  cutRatio: number,
): LassoPoint[] {
  if (points.length < 3 || cutRatio <= 0) return [...points];
  const next: LassoPoint[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const following = points[(index + 1) % points.length]!;
    next.push(interpolatePoint(current, following, cutRatio));
    next.push(interpolatePoint(current, following, 1 - cutRatio));
  }
  return next;
}

function sampleByArcLength(
  points: readonly LassoPoint[],
  targetCount: number,
): LassoPoint[] {
  if (points.length <= targetCount || targetCount < 3) return [...points];
  const distances = [0];
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += distance(points[index - 1]!, points[index]!);
    distances.push(total);
  }
  total += distance(points[points.length - 1]!, points[0]!);
  const sampled: LassoPoint[] = [];
  for (let sampleIndex = 0; sampleIndex < targetCount; sampleIndex += 1) {
    const target = (total * sampleIndex) / targetCount;
    let segment = 1;
    while (segment < distances.length && distances[segment]! < target) {
      segment += 1;
    }
    const previousIndex = segment - 1;
    const nextIndex = segment % points.length;
    const segmentStart = distances[previousIndex] ?? 0;
    const segmentEnd =
      segment < distances.length ? distances[segment]! : total;
    const ratio = segmentEnd === segmentStart
      ? 0
      : (target - segmentStart) / (segmentEnd - segmentStart);
    sampled.push(interpolatePoint(points[previousIndex]!, points[nextIndex]!, ratio));
  }
  return sampled;
}

function getSelfIntersectionStatus(
  points: readonly LassoPoint[],
  options: LassoSmoothingOptions,
): "clear" | "ambiguous" {
  if (points.length < 4) return "clear";
  const segments = points.map((point, index) => ({
    a: point,
    b: points[(index + 1) % points.length]!,
    index,
  }));
  let candidates = 0;
  let intersections = 0;
  const sorted = [...segments].sort(
    (left, right) => Math.min(left.a.x, left.b.x) - Math.min(right.a.x, right.b.x),
  );
  for (let firstIndex = 0; firstIndex < sorted.length; firstIndex += 1) {
    const first = sorted[firstIndex]!;
    const firstMaxX = Math.max(first.a.x, first.b.x);
    for (let secondIndex = firstIndex + 1; secondIndex < sorted.length; secondIndex += 1) {
      const second = sorted[secondIndex]!;
      if (Math.min(second.a.x, second.b.x) > firstMaxX) break;
      if (areAdjacentSegments(first.index, second.index, points.length)) continue;
      if (!segmentBoundsOverlap(first.a, first.b, second.a, second.b)) continue;
      candidates += 1;
      if (candidates > 16_384) return "ambiguous";
      if (segmentsIntersect(first.a, first.b, second.a, second.b)) {
        intersections += 1;
        if (points.length < 8) return "ambiguous";
      }
    }
  }
  if (points.length < 8) return "clear";
  return intersections / points.length > options.selfIntersectionRatioThreshold
    ? "ambiguous"
    : "clear";
}

function removeNearDuplicateClosingPoint(points: readonly LassoPoint[]): LassoPoint[] {
  if (points.length < 2) return [...points];
  const next = [...points];
  const first = next[0]!;
  const last = next[next.length - 1]!;
  if (distance(first, last) < 0.001) next.pop();
  return next;
}

function polygonArea(points: readonly Pick<LassoPoint, "x" | "y">[]): number {
  if (points.length < 3) return 0;
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    area += current.x * next.y - next.x * current.y;
  }
  return area / 2;
}

function isWithinBounds(
  candidate: readonly LassoPoint[],
  raw: readonly LassoPoint[],
): boolean {
  const rawBounds = getLassoPathBounds(raw);
  const candidateBounds = getLassoPathBounds(candidate);
  if (!rawBounds || !candidateBounds) return false;
  const epsilon = 1e-6;
  return (
    candidateBounds.x >= rawBounds.x - epsilon &&
    candidateBounds.y >= rawBounds.y - epsilon &&
    candidateBounds.x + candidateBounds.width <= rawBounds.x + rawBounds.width + epsilon &&
    candidateBounds.y + candidateBounds.height <= rawBounds.y + rawBounds.height + epsilon
  );
}

function getMaxSampledDistanceToPolygon(
  points: readonly LassoPoint[],
  polygon: readonly LassoPoint[],
): number {
  if (points.length === 0 || polygon.length < 2) return 0;
  const step = Math.max(1, Math.ceil(points.length / 512));
  let maxDistance = 0;
  for (let index = 0; index < points.length; index += step) {
    maxDistance = Math.max(maxDistance, distanceToPolygon(points[index]!, polygon));
  }
  return maxDistance;
}

function distanceToPolygon(point: LassoPoint, polygon: readonly LassoPoint[]): number {
  let minDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < polygon.length; index += 1) {
    minDistance = Math.min(
      minDistance,
      distanceToSegment(point, polygon[index]!, polygon[(index + 1) % polygon.length]!),
    );
  }
  return minDistance;
}

function distanceToSegment(point: LassoPoint, a: LassoPoint, b: LassoPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return distance(point, a);
  const ratio = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq, 0, 1);
  return distance(point, {
    x: a.x + dx * ratio,
    y: a.y + dy * ratio,
  });
}

function segmentBoundsOverlap(
  a: LassoPoint,
  b: LassoPoint,
  c: LassoPoint,
  d: LassoPoint,
): boolean {
  return (
    Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)) <=
      Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) &&
    Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)) <=
      Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y))
  );
}

function segmentsIntersect(
  a: LassoPoint,
  b: LassoPoint,
  c: LassoPoint,
  d: LassoPoint,
): boolean {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

function orientation(a: LassoPoint, b: LassoPoint, c: LassoPoint): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function areAdjacentSegments(first: number, second: number, count: number): boolean {
  const diff = Math.abs(first - second);
  return diff === 0 || diff === 1 || diff === count - 1;
}

function interpolatePoint(a: LassoPoint, b: LassoPoint, ratio: number): LassoPoint {
  return {
    x: a.x + (b.x - a.x) * ratio,
    y: a.y + (b.y - a.y) * ratio,
    t: a.t + (b.t - a.t) * ratio,
  };
}

function distance(a: Pick<LassoPoint, "x" | "y">, b: Pick<LassoPoint, "x" | "y">): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
