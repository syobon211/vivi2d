import { computeBoneLocalTransform, transformPoint } from "@vivi2d/core/bone-utils";
import {
  BONE_OVERLAY,
  COLLIDER_OVERLAY,
  MESH_OVERLAY,
} from "@vivi2d/core/constants";
import { worldToScreen } from "@vivi2d/core/coord-utils";
import type {
  BoneNode,
  ColliderCircle,
  ColliderConfig,
  ColliderRect,
  IKController,
  LayerNode,
} from "@vivi2d/core/types";
import { isBone } from "@vivi2d/core/types";
import type { Graphics } from "pixi.js";

export type EditorOverlayGraphics = Graphics;

const IK_TARGET_RADIUS = 8;
const IK_TARGET_COLOR = 0xff6644;
const IK_POLE_COLOR = 0x44aaff;

export interface MeshOverlayLayerLike {
  x: number;
  y: number;
}

export interface MeshOverlayPinLike {
  vertexIndex: number;
  kind: "handle" | "anchor";
  radius: number;
}

export interface MeshHeatmapEdgeLike {
  a: number;
  b: number;
  intensity: number;
}

export interface MeshHeatmapVertexLike {
  vertexIndex: number;
  intensity: number;
}

export function drawBoneOverlayRecursive(
  g: Graphics,
  layers: LayerNode[],
  selectedId: string | null,
  zoom: number,
  panX: number,
  panY: number,
): void {
  for (const node of layers) {
    if (isBone(node)) {
      drawBoneOverlay(g, node, selectedId === node.id, zoom, panX, panY);
    }
    if (node.children.length > 0) {
      drawBoneOverlayRecursive(g, node.children, selectedId, zoom, panX, panY);
    }
  }
}

export function drawColliderOverlay(
  g: Graphics,
  collider: ColliderConfig,
  isSelected: boolean,
  zoom: number,
  panX: number,
  panY: number,
): void {
  const s = collider.shape;
  const strokeColor = isSelected
    ? COLLIDER_OVERLAY.SELECTED_COLOR
    : COLLIDER_OVERLAY.STROKE_COLOR;
  const alpha = collider.enabled ? 1 : COLLIDER_OVERLAY.DISABLED_ALPHA;

  if (s.type === "rectangle") {
    drawRectOverlay(g, s, strokeColor, alpha, zoom, panX, panY);
    if (isSelected && collider.enabled) {
      drawRectHandlesOverlay(g, s, zoom, panX, panY);
    }
  } else if (s.type === "circle") {
    drawCircleOverlay(g, s, strokeColor, alpha, zoom, panX, panY);
    if (isSelected && collider.enabled) {
      drawCircleHandleOverlay(g, s, zoom, panX, panY);
    }
  }
}

export function drawIKOverlay(
  g: Graphics,
  controllers: readonly IKController[],
  runtimeTargets: ReadonlyMap<string, { x: number; y: number }>,
  zoom: number,
  panX: number,
  panY: number,
): void {
  for (const ik of controllers) {
    const rt = runtimeTargets.get(ik.id);
    const tx = rt ? rt.x : ik.targetX;
    const ty = rt ? rt.y : ik.targetY;
    const sx = tx * zoom + panX;
    const sy = ty * zoom + panY;

    g.circle(sx, sy, IK_TARGET_RADIUS);
    g.fill({ color: IK_TARGET_COLOR, alpha: 0.6 });
    g.stroke({ color: IK_TARGET_COLOR, width: 2 });

    g.moveTo(sx - IK_TARGET_RADIUS, sy);
    g.lineTo(sx + IK_TARGET_RADIUS, sy);
    g.moveTo(sx, sy - IK_TARGET_RADIUS);
    g.lineTo(sx, sy + IK_TARGET_RADIUS);
    g.stroke({ color: IK_TARGET_COLOR, width: 1 });

    if (ik.poleTargetX !== undefined && ik.poleTargetY !== undefined) {
      const poleX = ik.poleTargetX * zoom + panX;
      const poleY = ik.poleTargetY * zoom + panY;
      g.circle(poleX, poleY, 5);
      g.fill({ color: IK_POLE_COLOR, alpha: 0.5 });
      g.stroke({ color: IK_POLE_COLOR, width: 1 });
    }
  }
}

export function drawMeshEdges(
  g: Graphics,
  vertices: number[],
  indices: number[],
  layer: MeshOverlayLayerLike,
  zoom: number,
  panX: number,
  panY: number,
): void {
  const drawnEdges = new Set<string>();
  for (let i = 0; i < indices.length; i += 3) {
    const triVerts = [indices[i], indices[i + 1], indices[i + 2]];
    for (let j = 0; j < 3; j++) {
      const a = triVerts[j];
      const b = triVerts[(j + 1) % 3];
      if (a === undefined || b === undefined) continue;
      const edgeKey = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (drawnEdges.has(edgeKey)) continue;
      drawnEdges.add(edgeKey);

      const vaX = vertices[a * 2];
      const vaY = vertices[a * 2 + 1];
      const vbX = vertices[b * 2];
      const vbY = vertices[b * 2 + 1];
      if (
        vaX === undefined ||
        vaY === undefined ||
        vbX === undefined ||
        vbY === undefined
      ) {
        continue;
      }

      const start = worldToScreen(vaX + layer.x, vaY + layer.y, zoom, panX, panY);
      const end = worldToScreen(vbX + layer.x, vbY + layer.y, zoom, panX, panY);

      g.moveTo(start.sx, start.sy);
      g.lineTo(end.sx, end.sy);
      g.stroke({
        width: 1,
        color: MESH_OVERLAY.EDGE_COLOR,
        alpha: MESH_OVERLAY.EDGE_ALPHA,
      });
    }
  }
}

export function drawMeshVertices(
  g: Graphics,
  vertices: number[],
  layer: MeshOverlayLayerLike,
  zoom: number,
  panX: number,
  panY: number,
  selectedSet: ReadonlySet<number>,
  dragIdx: number,
  selectionOnly = false,
): void {
  for (let i = 0; i < vertices.length; i += 2) {
    const vx = vertices[i];
    const vy = vertices[i + 1];
    if (vx === undefined || vy === undefined) continue;
    const screen = worldToScreen(vx + layer.x, vy + layer.y, zoom, panX, panY);
    const vertexIndex = i / 2;
    const isActive = vertexIndex === dragIdx;
    const isSelected = selectedSet.has(vertexIndex);
    if (selectionOnly && !isActive && !isSelected) continue;

    g.circle(
      screen.sx,
      screen.sy,
      isSelected ? MESH_OVERLAY.VERTEX_RADIUS + 1 : MESH_OVERLAY.VERTEX_RADIUS,
    );
    g.fill({
      color:
        isActive || isSelected
          ? MESH_OVERLAY.VERTEX_SELECTED_COLOR
          : MESH_OVERLAY.VERTEX_COLOR,
    });
  }
}

export function drawMeshHeatmapEdges(
  g: Graphics,
  edges: readonly MeshHeatmapEdgeLike[],
  vertices: number[],
  layer: MeshOverlayLayerLike,
  zoom: number,
  panX: number,
  panY: number,
  resolveColor: (intensity: number) => number,
): void {
  for (const edge of edges) {
    if (edge.intensity <= 0) continue;
    const vaX = vertices[edge.a * 2];
    const vaY = vertices[edge.a * 2 + 1];
    const vbX = vertices[edge.b * 2];
    const vbY = vertices[edge.b * 2 + 1];
    if (
      vaX === undefined ||
      vaY === undefined ||
      vbX === undefined ||
      vbY === undefined
    ) {
      continue;
    }
    const start = worldToScreen(vaX + layer.x, vaY + layer.y, zoom, panX, panY);
    const end = worldToScreen(vbX + layer.x, vbY + layer.y, zoom, panX, panY);
    g.moveTo(start.sx, start.sy);
    g.lineTo(end.sx, end.sy);
    g.stroke({
      width: 2,
      color: resolveColor(edge.intensity),
      alpha: 0.75,
    });
  }
}

export function drawMeshHeatmapVertices(
  g: Graphics,
  samples: readonly MeshHeatmapVertexLike[],
  vertices: number[],
  layer: MeshOverlayLayerLike,
  zoom: number,
  panX: number,
  panY: number,
  resolveColor: (intensity: number) => number,
): void {
  for (const sample of samples) {
    if (sample.intensity <= 0) continue;
    const vx = vertices[sample.vertexIndex * 2];
    const vy = vertices[sample.vertexIndex * 2 + 1];
    if (vx === undefined || vy === undefined) continue;
    const screen = worldToScreen(vx + layer.x, vy + layer.y, zoom, panX, panY);
    g.circle(screen.sx, screen.sy, MESH_OVERLAY.VERTEX_RADIUS + 1);
    g.fill({
      color: resolveColor(sample.intensity),
      alpha: 0.8,
    });
  }
}

export function drawMeshPuppetFalloff(
  g: Graphics,
  layer: MeshOverlayLayerLike,
  vertices: number[],
  pins: readonly MeshOverlayPinLike[],
  selectedPinIndices: ReadonlySet<number>,
  zoom: number,
  panX: number,
  panY: number,
): void {
  for (const pin of pins) {
    if (!selectedPinIndices.has(pin.vertexIndex)) continue;
    const vx = vertices[pin.vertexIndex * 2];
    const vy = vertices[pin.vertexIndex * 2 + 1];
    if (vx === undefined || vy === undefined) continue;
    const screen = worldToScreen(vx + layer.x, vy + layer.y, zoom, panX, panY);
    g.circle(screen.sx, screen.sy, pin.radius * zoom);
    g.stroke({
      width: 1,
      color: pin.kind === "anchor" ? 0xc2410c : 0x0f766e,
      alpha: 0.35,
    });
  }
}

export function drawMeshPuppetPins(
  g: Graphics,
  layer: MeshOverlayLayerLike,
  vertices: number[],
  pins: readonly MeshOverlayPinLike[],
  selectedPinIndices: ReadonlySet<number>,
  zoom: number,
  panX: number,
  panY: number,
): void {
  for (const pin of pins) {
    const vx = vertices[pin.vertexIndex * 2];
    const vy = vertices[pin.vertexIndex * 2 + 1];
    if (vx === undefined || vy === undefined) continue;
    const screen = worldToScreen(vx + layer.x, vy + layer.y, zoom, panX, panY);
    const isSelected = selectedPinIndices.has(pin.vertexIndex);
    g.circle(screen.sx, screen.sy, isSelected ? 7 : 5);
    g.fill({
      color:
        pin.kind === "anchor"
          ? isSelected
            ? 0xc2410c
            : 0xf59e0b
          : isSelected
            ? 0x0f766e
            : 0x14b8a6,
    });
  }
}

export function drawOverlayLasso(g: Graphics, lassoPoints: number[]): void {
  g.moveTo(lassoPoints[0]!, lassoPoints[1]!);
  for (let i = 2; i < lassoPoints.length; i += 2) {
    g.lineTo(lassoPoints[i]!, lassoPoints[i + 1]!);
  }
  g.lineTo(lassoPoints[0]!, lassoPoints[1]!);
  g.stroke({
    width: 1,
    color: MESH_OVERLAY.LASSO_COLOR,
    alpha: MESH_OVERLAY.LASSO_ALPHA,
  });
  g.fill({
    color: MESH_OVERLAY.LASSO_COLOR,
    alpha: MESH_OVERLAY.LASSO_ALPHA * MESH_OVERLAY.LASSO_FILL_RATIO,
  });
}

function getBoneTip(bone: BoneNode): [number, number] {
  const local = computeBoneLocalTransform(bone);
  return transformPoint(local, bone.bone.length, 0);
}

function drawBoneOverlay(
  g: Graphics,
  bone: BoneNode,
  isSelected: boolean,
  zoom: number,
  panX: number,
  panY: number,
): void {
  const color = isSelected ? BONE_OVERLAY.SELECTED_COLOR : BONE_OVERLAY.ARM_COLOR;
  const pivot = worldToScreen(bone.x, bone.y, zoom, panX, panY);
  const tipWorld = getBoneTip(bone);
  const tip = worldToScreen(tipWorld[0], tipWorld[1], zoom, panX, panY);

  g.moveTo(pivot.sx, pivot.sy);
  g.lineTo(tip.sx, tip.sy);
  g.stroke({ width: BONE_OVERLAY.ARM_WIDTH, color });

  g.circle(pivot.sx, pivot.sy, BONE_OVERLAY.PIVOT_RADIUS);
  g.fill({ color });

  g.circle(tip.sx, tip.sy, BONE_OVERLAY.TIP_RADIUS);
  g.fill({ color });
}

function drawRectOverlay(
  g: Graphics,
  s: ColliderRect,
  color: number,
  alpha: number,
  zoom: number,
  panX: number,
  panY: number,
): void {
  const tl = worldToScreen(s.x, s.y, zoom, panX, panY);
  const br = worldToScreen(s.x + s.width, s.y + s.height, zoom, panX, panY);
  const w = br.sx - tl.sx;
  const h = br.sy - tl.sy;

  g.rect(tl.sx, tl.sy, w, h);
  g.fill({ color, alpha: COLLIDER_OVERLAY.FILL_ALPHA * alpha });
  g.rect(tl.sx, tl.sy, w, h);
  g.stroke({ width: COLLIDER_OVERLAY.STROKE_WIDTH, color, alpha });
}

function drawRectHandlesOverlay(
  g: Graphics,
  s: ColliderRect,
  zoom: number,
  panX: number,
  panY: number,
): void {
  const corners = [
    [s.x, s.y],
    [s.x + s.width, s.y],
    [s.x, s.y + s.height],
    [s.x + s.width, s.y + s.height],
  ] as const;

  for (const [wx, wy] of corners) {
    const p = worldToScreen(wx, wy, zoom, panX, panY);
    g.circle(p.sx, p.sy, COLLIDER_OVERLAY.HANDLE_RADIUS);
    g.fill({ color: COLLIDER_OVERLAY.HANDLE_COLOR });
  }
}

function drawCircleOverlay(
  g: Graphics,
  s: ColliderCircle,
  color: number,
  alpha: number,
  zoom: number,
  panX: number,
  panY: number,
): void {
  const center = worldToScreen(s.x, s.y, zoom, panX, panY);
  const r = s.radius * zoom;

  g.circle(center.sx, center.sy, r);
  g.fill({ color, alpha: COLLIDER_OVERLAY.FILL_ALPHA * alpha });
  g.circle(center.sx, center.sy, r);
  g.stroke({ width: COLLIDER_OVERLAY.STROKE_WIDTH, color, alpha });
}

function drawCircleHandleOverlay(
  g: Graphics,
  s: ColliderCircle,
  zoom: number,
  panX: number,
  panY: number,
): void {
  const p = worldToScreen(s.x + s.radius, s.y, zoom, panX, panY);
  g.circle(p.sx, p.sy, COLLIDER_OVERLAY.HANDLE_RADIUS);
  g.fill({ color: COLLIDER_OVERLAY.HANDLE_COLOR });
}
