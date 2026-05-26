import { DRAW_ORDER } from "@vivi2d/core/constants";
import { flattenLayers } from "@vivi2d/core/layer-utils";
import type {
  LayerRiggingHint,
  LayerSemanticRole,
  ManualPngImportMetadata,
  ProjectData,
  ViviMeshNode,
} from "@vivi2d/core/types";
import { getManualPngImportMetadata, isViviMesh } from "@vivi2d/core/types";
import { trimTransparentBounds } from "@/lib/image-loader";
import { generateAutoMesh } from "@/lib/auto-mesh";
import {
  buildManualPngImportMetadata,
  createGroupNode,
  createViviMeshFromPreparedCanvas,
  type PreparedLayerEntry,
} from "@vivi2d/editor-core/manual-png-import-command";
import { applyLayerOcclusionCleanupToCanvases } from "./layer-occlusion-cleanup";

export type ManualPngSplitPartId =
  | "hair"
  | "face"
  | "body"
  | "armLeft"
  | "armRight"
  | "tail"
  | "accessory";

export interface ManualPngSplitPartDefinition {
  id: ManualPngSplitPartId;
  role: LayerSemanticRole;
  color: string;
}

export interface ManualPngSplitMask {
  maskId?: string;
  partId: ManualPngSplitPartId;
  name: string;
  role: LayerSemanticRole;
  maskCanvas: HTMLCanvasElement;
  edgeFeatherPx?: number;
  customLabel?: string;
}

export interface ManualPngSplitLayerBuildResult {
  entries: PreparedLayerEntry[];
  group: ReturnType<typeof createGroupNode> | null;
}

export interface ManualPngSplitBuildOptions {
  sourceFingerprint?: string;
}

export const MANUAL_PNG_SPLIT_PARTS: ManualPngSplitPartDefinition[] = [
  { id: "hair", role: "hair", color: "#75ff62" },
  { id: "face", role: "face", color: "#ffc857" },
  { id: "body", role: "body", color: "#bdf66d" },
  { id: "armLeft", role: "armLeft", color: "#ff9b54" },
  { id: "armRight", role: "armRight", color: "#ffcf5d" },
  { id: "tail", role: "tail", color: "#51d94f" },
  { id: "accessory", role: "accessory", color: "#75d6ff" },
];

function generateSplitMesh(canvas: HTMLCanvasElement, width: number, height: number) {
  return generateAutoMesh(canvas, width, height, "standard");
}

export function canSplitManualPngLayer(layer: unknown): layer is ViviMeshNode {
  return (
    typeof layer === "object" &&
    layer !== null &&
    isViviMesh(layer as ViviMeshNode) &&
    Boolean(getManualPngImportMetadata((layer as ViviMeshNode).importMetadata))
  );
}

export function listManualPngSplitCandidates(
  project: ProjectData,
): ViviMeshNode[] {
  return flattenLayers(project.layers).filter(canSplitManualPngLayer);
}

export function hasKnownManualPngRole(layer: ViviMeshNode): boolean {
  return (
    Boolean(getManualPngImportMetadata(layer.importMetadata)) &&
    layer.semanticRole != null &&
    layer.semanticRole !== "unknown"
  );
}

export function countManualPngKnownRoleLayers(project: ProjectData): number {
  return listManualPngSplitCandidates(project).filter(hasKnownManualPngRole)
    .length;
}

export function countMaskPixels(maskCanvas: HTMLCanvasElement): number {
  const context = maskCanvas.getContext("2d");
  if (!context) return 0;
  const imageData = context.getImageData(
    0,
    0,
    maskCanvas.width,
    maskCanvas.height,
  );
  let count = 0;
  for (let index = 3; index < imageData.data.length; index += 4) {
    if (imageData.data[index]! > 0) count += 1;
  }
  return count;
}

export function createCanvasLike(
  sourceCanvas: HTMLCanvasElement,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = sourceCanvas.width;
  canvas.height = sourceCanvas.height;
  return canvas;
}

export function createMaskedCanvas(
  sourceCanvas: HTMLCanvasElement,
  maskCanvas: HTMLCanvasElement,
): HTMLCanvasElement | null {
  if (
    sourceCanvas.width !== maskCanvas.width ||
    sourceCanvas.height !== maskCanvas.height ||
    countMaskPixels(maskCanvas) === 0
  ) {
    return null;
  }

  const sourceContext = sourceCanvas.getContext("2d");
  const maskContext = maskCanvas.getContext("2d");
  if (!sourceContext || !maskContext) return null;

  const output = createCanvasLike(sourceCanvas);
  const outputContext = output.getContext("2d");
  if (!outputContext) return null;

  const source = sourceContext.getImageData(
    0,
    0,
    sourceCanvas.width,
    sourceCanvas.height,
  );
  const mask = maskContext.getImageData(
    0,
    0,
    maskCanvas.width,
    maskCanvas.height,
  );
  const data = source.data;
  for (let index = 0; index < data.length; index += 4) {
    data[index + 3] = Math.round(
      (data[index + 3]! * mask.data[index + 3]!) / 255,
    );
  }
  outputContext.putImageData(source, 0, 0);
  return output;
}

function createSplitLayerName(
  sourceLayer: ViviMeshNode,
  mask: ManualPngSplitMask,
): string {
  const suffix = mask.name.trim() || mask.role;
  return `${sourceLayer.name} - ${suffix}`;
}

function inferRiggingHint(role: LayerSemanticRole): LayerRiggingHint {
  switch (role) {
    case "face":
    case "eyeLeft":
    case "eyeRight":
    case "mouth":
    case "nose":
      return "rigid";
    case "hair":
    case "hairFront":
    case "hairBack":
    case "hairSide":
    case "tail":
    case "accessory":
      return "localBones";
    case "body":
    case "armLeft":
    case "armRight":
    case "handLeft":
    case "handRight":
    case "legLeft":
    case "legRight":
      return "skinned";
    default:
      return "rigid";
  }
}

function createSplitImportMetadata(
  sourceMetadata: ManualPngImportMetadata,
  prepared: ReturnType<typeof trimTransparentBounds>,
  position: { x: number; y: number },
) {
  return buildManualPngImportMetadata(
    sourceMetadata.sourceFileName,
    prepared,
    position,
    {
      centerOnCanvas: false,
      trimTransparentBounds: true,
      createGroupForImportedLayers: true,
      autoGenerateMesh: true,
    },
    sourceMetadata.sourcePath,
  );
}

export function buildManualPngSplitLayerEntries(
  project: ProjectData,
  sourceLayer: ViviMeshNode,
  sourceCanvas: HTMLCanvasElement,
  masks: ManualPngSplitMask[],
  options: ManualPngSplitBuildOptions = {},
): ManualPngSplitLayerBuildResult {
  const sourceMetadata = getManualPngImportMetadata(sourceLayer.importMetadata);
  if (!sourceMetadata) {
    return { entries: [], group: null };
  }

  const entries: PreparedLayerEntry[] = [];
  const baseDrawOrder = sourceLayer.drawOrder ?? DRAW_ORDER.DEFAULT;
  for (const mask of masks) {
    const maskedCanvas = createMaskedCanvas(sourceCanvas, mask.maskCanvas);
    if (!maskedCanvas) continue;

    const prepared = trimTransparentBounds(maskedCanvas);
    if (prepared.canvas.width === 0 || prepared.canvas.height === 0) continue;

    const position = {
      x: sourceLayer.x + prepared.offsetX,
      y: sourceLayer.y + prepared.offsetY,
    };
    const layerId = crypto.randomUUID();
    const layer = createViviMeshFromPreparedCanvas(
      layerId,
      createSplitLayerName(sourceLayer, mask),
      prepared,
      Math.min(baseDrawOrder + entries.length + 1, DRAW_ORDER.MAX),
      position,
      {
        centerOnCanvas: false,
        trimTransparentBounds: true,
        createGroupForImportedLayers: true,
        autoGenerateMesh: true,
      },
      createSplitImportMetadata(sourceMetadata, prepared, position),
      generateSplitMesh,
    );
    layer.semanticRole = mask.role;
    layer.semanticRoleSource = "manual";
    layer.riggingHint = inferRiggingHint(mask.role);
    if (options.sourceFingerprint) {
      layer.manualSplitSourceLayerId = sourceLayer.id;
      layer.manualSplitSourceFingerprint = options.sourceFingerprint;
      layer.manualSplitLayerId = layer.id;
      layer.manualSplitOutputMetadata = {
        kind: "maskExtractedLayer",
        ownership: "userAccepted",
        origin: "manualMask",
        manualSplitLayerId: layer.id,
        manualSplitSourceLayerId: sourceLayer.id,
        manualSplitSourceFingerprint: options.sourceFingerprint,
        manualSplitMaskId: mask.maskId ?? `${sourceLayer.id}:${mask.partId}`,
        maskCoverage:
          sourceCanvas.width * sourceCanvas.height > 0
            ? countMaskPixels(mask.maskCanvas) /
              (sourceCanvas.width * sourceCanvas.height)
            : 0,
        edgeFeatherPx: mask.edgeFeatherPx ?? 0,
        customLabel: mask.customLabel,
      };
    }
    entries.push({ layer, canvas: prepared.canvas });
  }

  const group =
    entries.length > 0
      ? createGroupNode(
          crypto.randomUUID(),
          `${sourceLayer.name} split`,
          entries.map((entry) => entry.layer),
          Math.min(baseDrawOrder + 1, DRAW_ORDER.MAX),
        )
      : null;

  applyLayerOcclusionCleanupToCanvases(
    entries.map((entry) => entry.layer),
    entries.map((entry) => ({ layerId: entry.layer.id, canvas: entry.canvas })),
  );

  if (project.layers.length > 0 && group) {
    group.expanded = true;
  }

  return { entries, group };
}
