import { DEFAULT_NAMES } from "@vivi2d/core/constants";
import type { BlendMode, ProjectData } from "@vivi2d/core/types";
import type { Layer } from "ag-psd";
import { readPsd } from "ag-psd";
import { isValidBlendMode } from "./blend-modes";
import {
  applyPsdReimportLeaves,
  planPsdReimport,
  type PsdReimportDiff,
  type PsdReimportLeafInput,
  type PsdReimportTextureTarget,
} from "@vivi2d/editor-core/psd-reimport-command";
import {
  parseSeeThroughLeafToken,
  stripSeeThroughTechnicalName,
} from "@vivi2d/editor-core/see-through-technical-name";
import {
  assertPsdBufferWithinLimit,
  PSD_METADATA_READ_OPTIONS,
  validateParsedPsdDocument,
} from "./psd-security";
import { setTexture } from "./texture-store";

export type { PsdReimportDiff } from "@vivi2d/editor-core/psd-reimport-command";

interface PsdLayerInfo {
  name: string;
  parentName: string | null;
  canvas: HTMLCanvasElement | null;
  left: number;
  top: number;
  width: number;
  height: number;
  isGroup: boolean;
  children: PsdLayerInfo[];
  visible: boolean;
  opacity: number;
  blendMode: BlendMode;
}

interface PreparedPsdLeaf {
  layer: PsdLayerInfo;
  token: string | null;
  displayName: string;
}

function flattenPsdLayers(
  layers: PsdLayerInfo[],
  parentName: string | null = null,
): PsdLayerInfo[] {
  const result: PsdLayerInfo[] = [];
  for (const layer of layers) {
    layer.parentName = parentName;
    result.push(layer);
    if (layer.children.length > 0) {
      result.push(...flattenPsdLayers(layer.children, layer.name));
    }
  }
  return result;
}

function toBlendMode(mode: string | undefined): BlendMode {
  if (!mode) return "normal";
  const normalized = mode.replace(/ /g, "-");
  if (isValidBlendMode(normalized)) return normalized;
  return "normal";
}

function parsePsdLayer(layer: Layer): PsdLayerInfo {
  const children = layer.children?.map(parsePsdLayer) ?? [];
  const canvas = layer.canvas ?? null;
  const width = canvas?.width ?? (layer.right ?? 0) - (layer.left ?? 0);
  const height = canvas?.height ?? (layer.bottom ?? 0) - (layer.top ?? 0);

  return {
    name: layer.name ?? DEFAULT_NAMES.UNNAMED_LAYER,
    parentName: null,
    canvas,
    left: layer.left ?? 0,
    top: layer.top ?? 0,
    width,
    height,
    isGroup: children.length > 0,
    children,
    visible: !layer.hidden,
    opacity: (layer.opacity ?? 255) / 255,
    blendMode: toBlendMode(layer.blendMode),
  };
}

function preparePsdLeaves(psdFlat: PsdLayerInfo[]): PreparedPsdLeaf[] {
  return psdFlat
    .filter((layer) => !layer.isGroup)
    .map((layer) => ({
      layer,
      token: parseSeeThroughLeafToken(layer.name),
      displayName: stripSeeThroughTechnicalName(layer.name),
    }));
}

function parsePreparedPsd(buffer: ArrayBuffer): {
  psdFlat: PsdLayerInfo[];
  psdLeaves: PreparedPsdLeaf[];
} {
  assertPsdBufferWithinLimit(buffer);
  const metadata = readPsd(buffer, PSD_METADATA_READ_OPTIONS);
  validateParsedPsdDocument(metadata);
  const psd = readPsd(buffer, { useImageData: false });
  validateParsedPsdDocument(psd);
  const psdTree = psd.children?.map(parsePsdLayer) ?? [];
  const psdFlat = flattenPsdLayers(psdTree);
  return {
    psdFlat,
    psdLeaves: preparePsdLeaves(psdFlat),
  };
}

function toPsdReimportLeafInputs(psdLeaves: PreparedPsdLeaf[]): PsdReimportLeafInput[] {
  return psdLeaves.map((leaf) => ({
    token: leaf.token,
    displayName: leaf.displayName,
    left: leaf.layer.left,
    top: leaf.layer.top,
    width: leaf.layer.width,
    height: leaf.layer.height,
    visible: leaf.layer.visible,
    opacity: leaf.layer.opacity,
    blendMode: leaf.layer.blendMode,
    hasPixels: leaf.layer.canvas != null,
  }));
}

function setTextureTargets(
  psdLeaves: PreparedPsdLeaf[],
  targets: PsdReimportTextureTarget[],
): void {
  for (const target of targets) {
    const canvas = psdLeaves[target.leafIndex]?.layer.canvas;
    if (canvas) {
      setTexture(target.layerId, canvas);
    }
  }
}

export function analyzePsdReimport(
  buffer: ArrayBuffer,
  project: ProjectData,
): { diff: PsdReimportDiff; psdLayers: PsdLayerInfo[] } {
  const { psdFlat, psdLeaves } = parsePreparedPsd(buffer);
  const plan = planPsdReimport(project, toPsdReimportLeafInputs(psdLeaves));
  return { diff: plan.diff, psdLayers: psdFlat };
}

export function applyPsdReimport(
  buffer: ArrayBuffer,
  project: ProjectData,
): { project: ProjectData; diff: PsdReimportDiff } {
  const { psdLeaves } = parsePreparedPsd(buffer);
  const leaves = toPsdReimportLeafInputs(psdLeaves);
  const nextProject = structuredClone(project) as ProjectData;
  const result = applyPsdReimportLeaves(nextProject, leaves, {
    createLayerId: () => crypto.randomUUID(),
  });

  setTextureTargets(psdLeaves, result.updatedTextureTargets);
  setTextureTargets(psdLeaves, result.addedTextureTargets);

  return { project: nextProject, diff: result.diff };
}
