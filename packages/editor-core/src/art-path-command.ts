import { findLayerById, removeFromTree } from "@vivi2d/core/layer-utils";
import type {
  ArtPathControlPoint,
  ArtPathNode,
  ArtPathStyle,
  LayerId,
  ProjectData,
} from "@vivi2d/core/types";
import { isArtPath } from "@vivi2d/core/types";

const defaultCreateId = () => crypto.randomUUID();

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function getArtPath(project: ProjectData, artPathId: LayerId): ArtPathNode | null {
  const layer = findLayerById(project.layers, artPathId);
  return layer && isArtPath(layer) ? layer : null;
}

function cloneControlPoint(point: ArtPathControlPoint): ArtPathControlPoint {
  return {
    x: finiteOr(point.x, 0),
    y: finiteOr(point.y, 0),
    handleInX: finiteOr(point.handleInX, 0),
    handleInY: finiteOr(point.handleInY, 0),
    handleOutX: finiteOr(point.handleOutX, 0),
    handleOutY: finiteOr(point.handleOutY, 0),
    width: finiteOr(point.width, 1),
    opacity: finiteOr(point.opacity, 1),
  };
}

function mergeControlPoint(
  current: ArtPathControlPoint,
  updates: Partial<ArtPathControlPoint>,
): ArtPathControlPoint {
  return {
    x: "x" in updates && updates.x !== undefined ? finiteOr(updates.x, current.x) : current.x,
    y: "y" in updates && updates.y !== undefined ? finiteOr(updates.y, current.y) : current.y,
    handleInX:
      "handleInX" in updates && updates.handleInX !== undefined
        ? finiteOr(updates.handleInX, current.handleInX)
        : current.handleInX,
    handleInY:
      "handleInY" in updates && updates.handleInY !== undefined
        ? finiteOr(updates.handleInY, current.handleInY)
        : current.handleInY,
    handleOutX:
      "handleOutX" in updates && updates.handleOutX !== undefined
        ? finiteOr(updates.handleOutX, current.handleOutX)
        : current.handleOutX,
    handleOutY:
      "handleOutY" in updates && updates.handleOutY !== undefined
        ? finiteOr(updates.handleOutY, current.handleOutY)
        : current.handleOutY,
    width:
      "width" in updates && updates.width !== undefined
        ? finiteOr(updates.width, current.width)
        : current.width,
    opacity:
      "opacity" in updates && updates.opacity !== undefined
        ? finiteOr(updates.opacity, current.opacity)
        : current.opacity,
  };
}

function mergeStyle(
  current: ArtPathStyle,
  updates: Partial<ArtPathStyle>,
): ArtPathStyle {
  return {
    color:
      "color" in updates && updates.color !== undefined
        ? finiteOr(updates.color, current.color)
        : current.color,
    baseWidth:
      "baseWidth" in updates && updates.baseWidth !== undefined
        ? finiteOr(updates.baseWidth, current.baseWidth)
        : current.baseWidth,
    lineCap: updates.lineCap ?? current.lineCap,
    lineJoin: updates.lineJoin ?? current.lineJoin,
  };
}

export function addArtPath(
  project: ProjectData,
  name: string,
  x: number,
  y: number,
  createId: () => string = defaultCreateId,
): string {
  const id = createId();
  project.layers.push({
    id,
    name,
    kind: "artPath",
    visible: true,
    opacity: 1,
    x: finiteOr(x, 0),
    y: finiteOr(y, 0),
    width: 0,
    height: 0,
    blendMode: "normal",
    expanded: false,
    children: [],
    controlPoints: [],
    closed: false,
    style: {
      color: 0x000000,
      baseWidth: 3,
      lineCap: "round",
      lineJoin: "round",
    },
  });
  return id;
}

export function removeArtPath(project: ProjectData, artPathId: LayerId): boolean {
  const layer = findLayerById(project.layers, artPathId);
  if (!layer || !isArtPath(layer)) return false;
  return removeFromTree(project.layers, artPathId) !== null;
}

export function addControlPoint(
  project: ProjectData,
  artPathId: LayerId,
  point: ArtPathControlPoint,
  index?: number,
): boolean {
  const artPath = getArtPath(project, artPathId);
  if (!artPath) return false;
  const nextPoint = cloneControlPoint(point);
  if (index === undefined) {
    artPath.controlPoints.push(nextPoint);
    return true;
  }
  if (index >= 0 && index <= artPath.controlPoints.length) {
    artPath.controlPoints.splice(index, 0, nextPoint);
    return true;
  }
  return false;
}

export function updateControlPoint(
  project: ProjectData,
  artPathId: LayerId,
  index: number,
  point: Partial<ArtPathControlPoint>,
): boolean {
  const artPath = getArtPath(project, artPathId);
  if (!artPath || index < 0 || index >= artPath.controlPoints.length) {
    return false;
  }
  artPath.controlPoints[index] = mergeControlPoint(
    artPath.controlPoints[index]!,
    point,
  );
  return true;
}

export function removeControlPoint(
  project: ProjectData,
  artPathId: LayerId,
  index: number,
): boolean {
  const artPath = getArtPath(project, artPathId);
  if (!artPath || index < 0 || index >= artPath.controlPoints.length) {
    return false;
  }
  artPath.controlPoints.splice(index, 1);
  return true;
}

export function setArtPathStyle(
  project: ProjectData,
  artPathId: LayerId,
  style: Partial<ArtPathStyle>,
): boolean {
  const artPath = getArtPath(project, artPathId);
  if (!artPath) return false;
  artPath.style = mergeStyle(artPath.style, style);
  return true;
}

export function setArtPathClosed(
  project: ProjectData,
  artPathId: LayerId,
  closed: boolean,
): boolean {
  const artPath = getArtPath(project, artPathId);
  if (!artPath) return false;
  artPath.closed = closed;
  return true;
}
