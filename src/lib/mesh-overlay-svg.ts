import { MESH_OVERLAY } from "@vivi2d/core/constants";
import { worldToScreen } from "@vivi2d/core/coord-utils";

export interface MeshOverlaySvgLine {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: string;
  strokeWidth: number;
  strokeOpacity?: number;
}

export interface MeshOverlaySvgCircle {
  id: string;
  cx: number;
  cy: number;
  radius: number;
  fill: string;
  fillOpacity?: number;
  stroke?: string;
  strokeWidth?: number;
  strokeOpacity?: number;
}

export interface MeshOverlaySvgPath {
  d: string;
  fill: string;
  fillOpacity: number;
  stroke: string;
  strokeWidth: number;
  strokeOpacity: number;
}

export interface MeshOverlaySvgModel {
  layerId: string;
  mode: "vertex" | "puppet";
  edges: MeshOverlaySvgLine[];
  vertices: MeshOverlaySvgCircle[];
  heatmapEdges: MeshOverlaySvgLine[];
  heatmapVertices: MeshOverlaySvgCircle[];
  puppetFalloff: MeshOverlaySvgCircle[];
  puppetPins: MeshOverlaySvgCircle[];
  lassoPath: MeshOverlaySvgPath | null;
}

export interface MeshOverlayLayerLike {
  id: string;
  x: number;
  y: number;
}

export interface MeshOverlayPinLike {
  id: string;
  vertexIndex: number;
  kind: "handle" | "anchor";
  radius: number;
}

function numberToCssHex(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

export function buildMeshEdgeLines(
  vertices: number[],
  indices: number[],
  layer: MeshOverlayLayerLike,
  zoom: number,
  panX: number,
  panY: number,
): MeshOverlaySvgLine[] {
  const lines: MeshOverlaySvgLine[] = [];
  const drawnEdges = new Set<string>();
  for (let i = 0; i < indices.length; i += 3) {
    const triangle = [indices[i], indices[i + 1], indices[i + 2]];
    for (let j = 0; j < 3; j += 1) {
      const a = triangle[j];
      const b = triangle[(j + 1) % 3];
      if (a === undefined || b === undefined) continue;
      const edgeKey = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (drawnEdges.has(edgeKey)) continue;
      drawnEdges.add(edgeKey);
      const ax = vertices[a * 2];
      const ay = vertices[a * 2 + 1];
      const bx = vertices[b * 2];
      const by = vertices[b * 2 + 1];
      if (ax === undefined || ay === undefined || bx === undefined || by === undefined) {
        continue;
      }
      const start = worldToScreen(ax + layer.x, ay + layer.y, zoom, panX, panY);
      const end = worldToScreen(bx + layer.x, by + layer.y, zoom, panX, panY);
      lines.push({
        id: `${layer.id}:edge:${edgeKey}`,
        x1: start.sx,
        y1: start.sy,
        x2: end.sx,
        y2: end.sy,
        stroke: numberToCssHex(MESH_OVERLAY.EDGE_COLOR),
        strokeWidth: 1,
        strokeOpacity: MESH_OVERLAY.EDGE_ALPHA,
      });
    }
  }
  return lines;
}

export function buildMeshVertexCircles(
  vertices: number[],
  layer: MeshOverlayLayerLike,
  zoom: number,
  panX: number,
  panY: number,
  selectedSet: ReadonlySet<number>,
  dragIdx: number,
  selectionOnly = false,
): MeshOverlaySvgCircle[] {
  const circles: MeshOverlaySvgCircle[] = [];
  for (let i = 0; i < vertices.length; i += 2) {
    const vx = vertices[i];
    const vy = vertices[i + 1];
    if (vx === undefined || vy === undefined) continue;
    const vertexIndex = i / 2;
    const isActive = vertexIndex === dragIdx;
    const isSelected = selectedSet.has(vertexIndex);
    if (selectionOnly && !isActive && !isSelected) continue;
    const screen = worldToScreen(vx + layer.x, vy + layer.y, zoom, panX, panY);
    circles.push({
      id: `${layer.id}:vertex:${vertexIndex}`,
      cx: screen.sx,
      cy: screen.sy,
      radius: isSelected ? MESH_OVERLAY.VERTEX_RADIUS + 1 : MESH_OVERLAY.VERTEX_RADIUS,
      fill: numberToCssHex(
        isActive || isSelected
          ? MESH_OVERLAY.VERTEX_SELECTED_COLOR
          : MESH_OVERLAY.VERTEX_COLOR,
      ),
    });
  }
  return circles;
}

export function buildMeshHeatmapEdgeLines(
  edges: ReadonlyArray<{ a: number; b: number; intensity: number }>,
  vertices: number[],
  layer: MeshOverlayLayerLike,
  zoom: number,
  panX: number,
  panY: number,
  resolveColor: (intensity: number) => number,
): MeshOverlaySvgLine[] {
  const lines: MeshOverlaySvgLine[] = [];
  for (const edge of edges) {
    if (edge.intensity <= 0) continue;
    const ax = vertices[edge.a * 2];
    const ay = vertices[edge.a * 2 + 1];
    const bx = vertices[edge.b * 2];
    const by = vertices[edge.b * 2 + 1];
    if (ax === undefined || ay === undefined || bx === undefined || by === undefined) {
      continue;
    }
    const start = worldToScreen(ax + layer.x, ay + layer.y, zoom, panX, panY);
    const end = worldToScreen(bx + layer.x, by + layer.y, zoom, panX, panY);
    lines.push({
      id: `${layer.id}:heat-edge:${edge.a}-${edge.b}`,
      x1: start.sx,
      y1: start.sy,
      x2: end.sx,
      y2: end.sy,
      stroke: numberToCssHex(resolveColor(edge.intensity)),
      strokeWidth: 2,
      strokeOpacity: 0.75,
    });
  }
  return lines;
}

export function buildMeshHeatmapVertexCircles(
  samples: ReadonlyArray<{ vertexIndex: number; intensity: number }>,
  vertices: number[],
  layer: MeshOverlayLayerLike,
  zoom: number,
  panX: number,
  panY: number,
  resolveColor: (intensity: number) => number,
): MeshOverlaySvgCircle[] {
  const circles: MeshOverlaySvgCircle[] = [];
  for (const sample of samples) {
    if (sample.intensity <= 0) continue;
    const vx = vertices[sample.vertexIndex * 2];
    const vy = vertices[sample.vertexIndex * 2 + 1];
    if (vx === undefined || vy === undefined) continue;
    const screen = worldToScreen(vx + layer.x, vy + layer.y, zoom, panX, panY);
    circles.push({
      id: `${layer.id}:heat-vertex:${sample.vertexIndex}`,
      cx: screen.sx,
      cy: screen.sy,
      radius: MESH_OVERLAY.VERTEX_RADIUS + 1,
      fill: numberToCssHex(resolveColor(sample.intensity)),
      fillOpacity: 0.8,
    });
  }
  return circles;
}

export function buildMeshPuppetFalloffCircles(
  layer: MeshOverlayLayerLike,
  vertices: number[],
  pins: ReadonlyArray<MeshOverlayPinLike>,
  selectedPinIndices: ReadonlySet<number>,
  zoom: number,
  panX: number,
  panY: number,
): MeshOverlaySvgCircle[] {
  const circles: MeshOverlaySvgCircle[] = [];
  for (const pin of pins) {
    if (!selectedPinIndices.has(pin.vertexIndex)) continue;
    const vx = vertices[pin.vertexIndex * 2];
    const vy = vertices[pin.vertexIndex * 2 + 1];
    if (vx === undefined || vy === undefined) continue;
    const screen = worldToScreen(vx + layer.x, vy + layer.y, zoom, panX, panY);
    circles.push({
      id: `${layer.id}:pin-falloff:${pin.id}`,
      cx: screen.sx,
      cy: screen.sy,
      radius: pin.radius * zoom,
      fill: "transparent",
      stroke: numberToCssHex(pin.kind === "anchor" ? 0xc2410c : 0x0f766e),
      strokeWidth: 1,
      strokeOpacity: 0.35,
    });
  }
  return circles;
}

export function buildMeshPuppetPinCircles(
  layer: MeshOverlayLayerLike,
  vertices: number[],
  pins: ReadonlyArray<MeshOverlayPinLike>,
  selectedPinIndices: ReadonlySet<number>,
  zoom: number,
  panX: number,
  panY: number,
): MeshOverlaySvgCircle[] {
  const circles: MeshOverlaySvgCircle[] = [];
  for (const pin of pins) {
    const vx = vertices[pin.vertexIndex * 2];
    const vy = vertices[pin.vertexIndex * 2 + 1];
    if (vx === undefined || vy === undefined) continue;
    const screen = worldToScreen(vx + layer.x, vy + layer.y, zoom, panX, panY);
    const isSelected = selectedPinIndices.has(pin.vertexIndex);
    circles.push({
      id: `${layer.id}:pin:${pin.id}`,
      cx: screen.sx,
      cy: screen.sy,
      radius: isSelected ? 7 : 5,
      fill: numberToCssHex(
        pin.kind === "anchor"
          ? isSelected
            ? 0xc2410c
            : 0xf59e0b
          : isSelected
            ? 0x0f766e
            : 0x14b8a6,
      ),
    });
  }
  return circles;
}

export function buildOverlayLassoPath(lassoPoints: number[]): MeshOverlaySvgPath | null {
  if (lassoPoints.length < 4) return null;
  const commands = [`M ${lassoPoints[0]} ${lassoPoints[1]}`];
  for (let i = 2; i < lassoPoints.length; i += 2) {
    commands.push(`L ${lassoPoints[i]} ${lassoPoints[i + 1]}`);
  }
  commands.push(`L ${lassoPoints[0]} ${lassoPoints[1]} Z`);
  return {
    d: commands.join(" "),
    fill: numberToCssHex(MESH_OVERLAY.LASSO_COLOR),
    fillOpacity: MESH_OVERLAY.LASSO_ALPHA * MESH_OVERLAY.LASSO_FILL_RATIO,
    stroke: numberToCssHex(MESH_OVERLAY.LASSO_COLOR),
    strokeWidth: 1,
    strokeOpacity: MESH_OVERLAY.LASSO_ALPHA,
  };
}
