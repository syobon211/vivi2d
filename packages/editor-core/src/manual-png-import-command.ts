import { DRAW_ORDER, LIPSYNC_DEFAULTS, MESH_DEFAULTS } from "@vivi2d/core/constants";
import { flattenLayers } from "@vivi2d/core/layer-utils";
import { generateGridMesh } from "@vivi2d/core/mesh-utils";
import type {
  GroupNode,
  LayerImportMetadata,
  ManualPngLayerImportMetadata,
  ManualPngImportMetadata,
  ManualPngPlacementMode,
  MeshData,
  ProjectData,
  ViviMeshNode,
} from "@vivi2d/core/types";

export interface PreparedImageCanvas {
  canvas: HTMLCanvasElement;
  offsetX: number;
  offsetY: number;
  originalWidth: number;
  originalHeight: number;
  trimmed: boolean;
}

export interface ManualImageImportOptions {
  centerOnCanvas: boolean;
  trimTransparentBounds: boolean;
  createGroupForImportedLayers: boolean;
  autoGenerateMesh: boolean;
}

export type ManualPngMeshFactory = (
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
) => MeshData | null | undefined;

export const IMPORTED_IMAGES_GROUP_NAME = "Imported Images";
const LARGE_IMAGE_FACTOR = 2;
const TRANSPARENT_PADDING_RATIO = 0.1;

export function getImageBaseName(fileName: string): string {
  const normalized = fileName.replace(/\\/g, "/").split("/").pop() ?? fileName;
  const stripped = normalized.replace(/\.png$/i, "").trim();
  return stripped.length > 0 ? stripped : "Imported Image";
}

function buildMeshForCanvas(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  options: ManualImageImportOptions,
  meshFactory?: ManualPngMeshFactory,
) {
  if (!options.autoGenerateMesh) {
    return generateGridMesh(
      width,
      height,
      MESH_DEFAULTS.DIVISIONS_X,
      MESH_DEFAULTS.DIVISIONS_Y,
    );
  }
  return (
    meshFactory?.(canvas, width, height) ??
    generateGridMesh(width, height, MESH_DEFAULTS.DIVISIONS_X, MESH_DEFAULTS.DIVISIONS_Y)
  );
}

export function computeLayerPosition(
  prepared: PreparedImageCanvas,
  projectWidth: number,
  projectHeight: number,
  options: ManualImageImportOptions,
): { x: number; y: number } {
  if (options.centerOnCanvas) {
    return {
      x: Math.round((projectWidth - prepared.canvas.width) / 2),
      y: Math.round((projectHeight - prepared.canvas.height) / 2),
    };
  }
  return {
    x: prepared.offsetX,
    y: prepared.offsetY,
  };
}

export function shouldAutoCenterImportedImage(
  projectWidth: number,
  projectHeight: number,
  prepared: PreparedImageCanvas,
): boolean {
  return (
    prepared.originalWidth > projectWidth * LARGE_IMAGE_FACTOR ||
    prepared.originalHeight > projectHeight * LARGE_IMAGE_FACTOR
  );
}

export function hasLargeTransparentPadding(prepared: PreparedImageCanvas): boolean {
  if (!prepared.trimmed) return false;
  const rightPadding =
    prepared.originalWidth - (prepared.offsetX + prepared.canvas.width);
  const bottomPadding =
    prepared.originalHeight - (prepared.offsetY + prepared.canvas.height);
  return (
    prepared.offsetX / prepared.originalWidth >= TRANSPARENT_PADDING_RATIO ||
    prepared.offsetY / prepared.originalHeight >= TRANSPARENT_PADDING_RATIO ||
    rightPadding / prepared.originalWidth >= TRANSPARENT_PADDING_RATIO ||
    bottomPadding / prepared.originalHeight >= TRANSPARENT_PADDING_RATIO
  );
}

export type LayerBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function computeLayerBounds(layers: LayerBounds[]): LayerBounds | null {
  if (layers.length === 0) return null;
  const minX = Math.min(...layers.map((layer) => layer.x));
  const minY = Math.min(...layers.map((layer) => layer.y));
  const maxX = Math.max(...layers.map((layer) => layer.x + layer.width));
  const maxY = Math.max(...layers.map((layer) => layer.y + layer.height));
  return {
    x: minX,
    y: minY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
  };
}

function computePlacementMode(options: ManualImageImportOptions): ManualPngPlacementMode {
  return options.centerOnCanvas ? "centerOnCanvas" : "preserveImageOffset";
}

function wasManualPngImportedWithTrim(metadata: ManualPngImportMetadata): boolean {
  if (typeof metadata.trimTransparentBoundsApplied === "boolean") {
    return metadata.trimTransparentBoundsApplied;
  }
  const [offsetX, offsetY, trimmedWidth, trimmedHeight] = metadata.trimmedBounds;
  return (
    offsetX !== 0 ||
    offsetY !== 0 ||
    trimmedWidth !== metadata.originalWidth ||
    trimmedHeight !== metadata.originalHeight
  );
}

export function buildManualPngImportOptionsFromMetadata(
  metadata: ManualPngImportMetadata,
): ManualImageImportOptions {
  return {
    centerOnCanvas: metadata.placementMode === "centerOnCanvas",
    trimTransparentBounds: wasManualPngImportedWithTrim(metadata),
    createGroupForImportedLayers: false,
    autoGenerateMesh: metadata.autoGenerateMeshApplied,
  };
}

export function buildManualPngImportMetadata(
  fileName: string,
  prepared: PreparedImageCanvas,
  position: { x: number; y: number },
  options: ManualImageImportOptions,
  sourcePath?: string,
): ManualPngLayerImportMetadata {
  return {
    source: "manualPng",
    manualPng: {
      sourceFileName: fileName,
      sourcePath,
      originalWidth: prepared.originalWidth,
      originalHeight: prepared.originalHeight,
      trimmedBounds: [
        prepared.offsetX,
        prepared.offsetY,
        prepared.canvas.width,
        prepared.canvas.height,
      ],
      finalOrigin: [position.x, position.y],
      placementMode: computePlacementMode(options),
      trimTransparentBoundsApplied: options.trimTransparentBounds,
      autoGenerateMeshApplied: options.autoGenerateMesh,
    },
  };
}

export function createViviMeshFromPreparedCanvas(
  layerId: string,
  name: string,
  prepared: PreparedImageCanvas,
  drawOrder: number,
  position: { x: number; y: number },
  options: ManualImageImportOptions,
  importMetadata?: LayerImportMetadata,
  meshFactory?: ManualPngMeshFactory,
): ViviMeshNode {
  return {
    id: layerId,
    name,
    visible: true,
    opacity: 1,
    x: position.x,
    y: position.y,
    width: prepared.canvas.width,
    height: prepared.canvas.height,
    children: [],
    blendMode: "normal",
    expanded: true,
    drawOrder,
    kind: "viviMesh",
    mesh: buildMeshForCanvas(
      prepared.canvas,
      prepared.canvas.width,
      prepared.canvas.height,
      options,
      meshFactory,
    ),
    importMetadata,
  };
}

export function createGroupNode(
  groupId: string,
  name: string,
  children: ViviMeshNode[],
  drawOrder: number,
): GroupNode {
  const minX = children.reduce((min, child) => Math.min(min, child.x), 0);
  const minY = children.reduce((min, child) => Math.min(min, child.y), 0);
  const maxX = children.reduce((max, child) => Math.max(max, child.x + child.width), 0);
  const maxY = children.reduce((max, child) => Math.max(max, child.y + child.height), 0);

  return {
    id: groupId,
    name,
    visible: true,
    opacity: 1,
    x: 0,
    y: 0,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
    children,
    blendMode: "normal",
    expanded: true,
    drawOrder,
    kind: "group",
  };
}

export function createProjectFromPreparedCanvas(
  fileName: string,
  prepared: PreparedImageCanvas,
  options: ManualImageImportOptions,
  sourcePath?: string,
  meshFactory?: ManualPngMeshFactory,
): ProjectData {
  const name = getImageBaseName(fileName);
  const layerId = crypto.randomUUID();
  const projectWidth = prepared.originalWidth;
  const projectHeight = prepared.originalHeight;
  const position = computeLayerPosition(prepared, projectWidth, projectHeight, options);
  const importMetadata = buildManualPngImportMetadata(
    fileName,
    prepared,
    position,
    options,
    sourcePath,
  );

  return {
    name,
    width: projectWidth,
    height: projectHeight,
    layers: [
      createViviMeshFromPreparedCanvas(
        layerId,
        name,
        prepared,
        DRAW_ORDER.DEFAULT,
        position,
        options,
        importMetadata,
        meshFactory,
      ),
    ],
    parameters: [],
    clips: [],
    scenes: [],
    physicsGroups: [],
    lipsyncConfig: {
      enabled: false,
      targetParameterId: null,
      source: "microphone",
      threshold: LIPSYNC_DEFAULTS.THRESHOLD,
      smoothing: LIPSYNC_DEFAULTS.SMOOTHING,
      gain: LIPSYNC_DEFAULTS.GAIN,
    },
    skins: {},
    parameterBindings: [],
    sceneBlends: [],
    ikControllers: [],
    offscreenTargets: [],
    expressionPresets: [],
    colliders: [],
    stateMachines: [],
  };
}

export function makeUniqueLayerName(project: ProjectData, baseName: string): string {
  const existingNames = new Set(flattenLayers(project.layers).map((layer) => layer.name));
  if (!existingNames.has(baseName)) return baseName;
  let suffix = 2;
  while (existingNames.has(`${baseName} (${suffix})`)) {
    suffix += 1;
  }
  return `${baseName} (${suffix})`;
}

export function assignSequentialDrawOrders(project: ProjectData): void {
  const flat = flattenLayers(project.layers);
  const count = flat.length;
  if (count === 0) return;
  for (let i = 0; i < count; i += 1) {
    flat[i]!.drawOrder = Math.round((i / Math.max(1, count - 1)) * DRAW_ORDER.MAX);
  }
}

export function getNextImportedDrawOrder(project: ProjectData): number {
  const maxDrawOrder = flattenLayers(project.layers).reduce((max, layer) => {
    return Math.max(max, layer.drawOrder ?? DRAW_ORDER.DEFAULT);
  }, DRAW_ORDER.MIN - 1);
  return Math.min(maxDrawOrder + 1, DRAW_ORDER.MAX);
}

export type PreparedLayerEntry = {
  layer: ViviMeshNode;
  canvas: HTMLCanvasElement;
};

export function buildPreparedLayerEntry(
  project: ProjectData,
  fileName: string,
  prepared: PreparedImageCanvas,
  drawOrder: number,
  options: ManualImageImportOptions,
  sourcePath?: string,
  meshFactory?: ManualPngMeshFactory,
): PreparedLayerEntry {
  const baseName = getImageBaseName(fileName);
  const uniqueName = makeUniqueLayerName(project, baseName);
  const layerId = crypto.randomUUID();
  const position = computeLayerPosition(prepared, project.width, project.height, options);
  const importMetadata = buildManualPngImportMetadata(
    fileName,
    prepared,
    position,
    options,
    sourcePath,
  );
  return {
    layer: createViviMeshFromPreparedCanvas(
      layerId,
      uniqueName,
      prepared,
      drawOrder,
      position,
      options,
      importMetadata,
      meshFactory,
    ),
    canvas: prepared.canvas,
  };
}
