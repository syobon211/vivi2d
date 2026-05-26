import {
  DEFAULT_NAMES,
  DRAW_ORDER,
  LIPSYNC_DEFAULTS,
  MESH_DEFAULTS,
} from "@vivi2d/core/constants";
import { flattenLayers } from "@vivi2d/core/layer-utils";
import { generateGridMesh } from "@vivi2d/core/mesh-utils";
import type {
  ViviMeshNode,
  BlendMode,
  GroupNode,
  LayerNode,
  ProjectData,
} from "@vivi2d/core/types";
import type { Layer } from "ag-psd";
import { readPsd } from "ag-psd";
import { isValidBlendMode } from "./blend-modes";
import {
  assertPsdBufferWithinLimit,
  PSD_METADATA_READ_OPTIONS,
  validateParsedPsdDocument,
} from "./psd-security";
import { clearTextures, setTexture } from "./texture-store";

function toBlendMode(mode: string | undefined): BlendMode {
  if (!mode) return "normal";
  const normalized = mode.replace(/ /g, "-");
  if (isValidBlendMode(normalized)) return normalized;
  return "normal";
}

function convertLayer(layer: Layer): LayerNode {
  const children = layer.children?.map(convertLayer) ?? [];
  const isGroup = children.length > 0;
  const canvas = layer.canvas ?? null;

  const id = crypto.randomUUID();

  if (canvas) {
    setTexture(id, canvas);
  }

  const width = canvas?.width ?? (layer.right ?? 0) - (layer.left ?? 0);
  const height = canvas?.height ?? (layer.bottom ?? 0) - (layer.top ?? 0);

  const base = {
    id,
    name: layer.name ?? DEFAULT_NAMES.UNNAMED_LAYER,
    visible: !layer.hidden,
    opacity: layer.opacity ?? 1,
    x: layer.left ?? 0,
    y: layer.top ?? 0,
    width,
    height,
    blendMode: toBlendMode(layer.blendMode),
    expanded: true,
  };

  if (isGroup || (!canvas && width === 0 && height === 0)) {
    return {
      ...base,
      kind: "group",
      children,
    } satisfies GroupNode;
  }

  return {
    ...base,
    kind: "viviMesh",
    children: [],
    mesh:
      width > 0 && height > 0
        ? generateGridMesh(
            width,
            height,
            MESH_DEFAULTS.DIVISIONS_X,
            MESH_DEFAULTS.DIVISIONS_Y,
          )
        : { vertices: [], uvs: [], indices: [], divisionsX: 0, divisionsY: 0 },
  } satisfies ViviMeshNode;
}

function assignDrawOrders(layers: LayerNode[]): void {
  const flat = flattenLayers(layers).reverse();
  const count = flat.length;
  if (count === 0) return;
  for (let i = 0; i < count; i++) {
    flat[i]!.drawOrder = Math.round((i / Math.max(1, count - 1)) * DRAW_ORDER.MAX);
  }
}

export function parsePsd(buffer: ArrayBuffer, fileName: string): ProjectData {
  assertPsdBufferWithinLimit(buffer);
  let psd: ReturnType<typeof readPsd>;
  try {
    const metadata = readPsd(buffer, PSD_METADATA_READ_OPTIONS);
    validateParsedPsdDocument(metadata);
    psd = readPsd(buffer, { useImageData: false });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Failed to load PSD file: ${msg}`);
  }

  validateParsedPsdDocument(psd);
  clearTextures();

  const layers = psd.children?.map(convertLayer) ?? [];
  assignDrawOrders(layers);

  return {
    name: fileName.replace(/\.psd$/i, ""),
    width: psd.width,
    height: psd.height,
    layers,
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
    colliders: [],
    stateMachines: [],
  };
}
