/// <reference lib="webworker" />
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
import { initializeCanvas, readPsd } from "ag-psd";
import { isValidBlendMode } from "@/lib/blend-modes";
import {
  assertPsdBufferWithinLimit,
  PSD_METADATA_READ_OPTIONS,
  validateParsedPsdDocument,
} from "@/lib/psd-security";
import { normalizeToRgba8 } from "./psd-parse-utils";
import type { WorkerMessage } from "./worker-protocol";

initializeCanvas(
  (width: number, height: number) =>
    new OffscreenCanvas(width, height) as unknown as HTMLCanvasElement,
  (width: number, height: number) => new ImageData(width, height),
);

// PSD Parse Worker

export interface PsdParseRequest {
  buffer: ArrayBuffer;
  fileName: string;
}

export interface PsdTextureData {
  layerId: string;
  width: number;
  height: number;

  buffer: ArrayBuffer;
}

export interface PsdParseResult {
  project: ProjectData;
  textures: PsdTextureData[];
}

export type PsdParseResponse = WorkerMessage<PsdParseResult>;

function post(message: PsdParseResponse, transfer?: Transferable[]): void {
  const target = self as unknown as DedicatedWorkerGlobalScope;
  if (transfer && transfer.length > 0) {
    target.postMessage(message, transfer);
  } else {
    target.postMessage(message);
  }
}

function toBlendMode(mode: string | undefined): BlendMode {
  if (!mode) return "normal";
  const normalized = mode.replace(/ /g, "-");
  if (isValidBlendMode(normalized)) return normalized;
  return "normal";
}

function convertLayer(layer: Layer, textures: PsdTextureData[]): LayerNode {
  const children = layer.children?.map((c) => convertLayer(c, textures)) ?? [];
  const isGroup = children.length > 0;
  const imageData = layer.imageData ?? null;

  const id = crypto.randomUUID();

  if (imageData) {
    const normalized = normalizeToRgba8(
      imageData.data as unknown as
        | Uint8ClampedArray
        | Uint8Array
        | Uint16Array
        | Float32Array,
    );
    textures.push({
      layerId: id,
      width: imageData.width,
      height: imageData.height,
      buffer: normalized.buffer as ArrayBuffer,
    });
  }

  const width = imageData?.width ?? (layer.right ?? 0) - (layer.left ?? 0);
  const height = imageData?.height ?? (layer.bottom ?? 0) - (layer.top ?? 0);

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

  if (isGroup || (!imageData && width === 0 && height === 0)) {
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

export function handlePsdParseRequest(request: PsdParseRequest): {
  response: PsdParseResponse;
  transfer: Transferable[];
} {
  const { buffer, fileName } = request;
  try {
    assertPsdBufferWithinLimit(buffer);
    const metadata = readPsd(buffer, PSD_METADATA_READ_OPTIONS);
    validateParsedPsdDocument(metadata);
    const psd = readPsd(buffer, { useImageData: true });
    validateParsedPsdDocument(psd);
    const textures: PsdTextureData[] = [];
    const layers = psd.children?.map((c) => convertLayer(c, textures)) ?? [];
    assignDrawOrders(layers);

    const project: ProjectData = {
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

    const transfer = textures.map((t) => t.buffer);
    return {
      response: { type: "result", result: { project, textures } },
      transfer,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      response: {
        type: "error",
        message: `Failed to load PSD file: ${msg}`,
      },
      transfer: [],
    };
  }
}

self.addEventListener("message", (event: MessageEvent<PsdParseRequest>) => {
  const { response, transfer } = handlePsdParseRequest(event.data);
  post(response, transfer);
});
