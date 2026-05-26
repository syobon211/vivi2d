import {
  VIVI2D_MANIFEST_SCHEMA_VERSION,
  type ViviCompatNativeImportBundle,
} from "@vivi2d/provider-comfyui";
import {
  DRAW_ORDER,
  LIPSYNC_DEFAULTS,
  MESH_DEFAULTS,
  type MeshDensityPreset,
} from "@vivi2d/core/constants";
import { flattenLayers } from "@vivi2d/core/layer-utils";
import { generateGridMesh } from "@vivi2d/core/mesh-utils";
import type { ViviMeshNode, LayerNode, ProjectData } from "@vivi2d/core/types";
import { mapSeeThroughLabelToRole } from "@vivi2d/editor-core/see-through-role-map";
import { applyProjectLayerOcclusionCleanupToTextures } from "@/lib/layer-occlusion-cleanup";
import { suggestSeeThroughMeshDensityPreset } from "@/lib/see-through-mesh-density";
import { buildSeeThroughTechnicalName } from "@vivi2d/editor-core/see-through-technical-name";
import {
  clearTextures,
  getAllTextures,
  setTexture,
  setTextureFromImageData,
} from "@/lib/texture-store";
import type { ParsedPsdResult } from "@/lib/workers/psd-parse-client";
import { useNotificationStore } from "../notificationStore";
import { applyLoadedProject } from "./reset";
import {
  applySeeThroughImportContext,
  SEE_THROUGH_ROLE_CONFIDENCE_THRESHOLD,
} from "./seeThroughImport";

interface NativeImportTexture {
  layerId: string;
  imageData: ImageData;
}

interface OrderedManifestLayer {
  layer: ViviCompatNativeImportBundle["manifest"]["layers"][number];
  index: number;
}

function createCanvasContext(width: number, height: number): CanvasRenderingContext2D {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D context is not available");
  }
  return ctx;
}

async function decodePngToImageData(buffer: ArrayBuffer): Promise<ImageData> {
  const blob = new Blob([buffer], { type: "image/png" });

  if (typeof createImageBitmap !== "undefined") {
    const bitmap = await createImageBitmap(blob);
    try {
      const ctx = createCanvasContext(bitmap.width, bitmap.height);
      ctx.drawImage(bitmap, 0, 0);
      return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    } finally {
      bitmap.close();
    }
  }

  return await new Promise<ImageData>((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(blob);
    img.onload = () => {
      try {
        const ctx = createCanvasContext(img.width, img.height);
        ctx.drawImage(img, 0, 0);
        resolve(ctx.getImageData(0, 0, img.width, img.height));
      } catch (error) {
        reject(error);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to decode imported See-through layer image"));
    };
    img.src = objectUrl;
  });
}

function sortManifestLayers(
  manifest: ViviCompatNativeImportBundle["manifest"],
): OrderedManifestLayer[] {
  return manifest.layers
    .map((layer, index) => ({ layer, index }))
    .sort((a, b) => a.layer.order - b.layer.order || a.index - b.index);
}

function assignDrawOrders(layers: LayerNode[]): void {
  const flat = flattenLayers(layers);
  const count = flat.length;
  if (count === 0) return;
  for (let i = 0; i < count; i += 1) {
    flat[i]!.drawOrder = Math.round((i / Math.max(1, count - 1)) * DRAW_ORDER.MAX);
  }
}

function meshDensityPresetToGridDivisions(preset: MeshDensityPreset): {
  divisionsX: number;
  divisionsY: number;
} {
  switch (preset) {
    case "coarse":
      return { divisionsX: 2, divisionsY: 2 };
    case "fine":
      return { divisionsX: 4, divisionsY: 4 };
    default:
      return {
        divisionsX: MESH_DEFAULTS.DIVISIONS_X,
        divisionsY: MESH_DEFAULTS.DIVISIONS_Y,
      };
  }
}

function validateManifestBundle(bundle: ViviCompatNativeImportBundle): void {
  const { manifest, layerAssets } = bundle;

  if (manifest.schema_version !== VIVI2D_MANIFEST_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported See-through manifest schema: ${manifest.schema_version}`,
    );
  }
  if (manifest.canvas.width <= 0 || manifest.canvas.height <= 0) {
    throw new Error("Invalid See-through manifest canvas size");
  }

  const tokenSet = new Set<string>();
  const assetPaths = new Set(layerAssets.map((asset) => asset.image_path));

  for (const layer of manifest.layers) {
    if (!layer.psd_leaf_token || layer.psd_leaf_token.trim().length === 0) {
      throw new Error("See-through manifest layer is missing psd_leaf_token");
    }
    if (tokenSet.has(layer.psd_leaf_token)) {
      throw new Error(`Duplicate See-through psd_leaf_token: ${layer.psd_leaf_token}`);
    }
    tokenSet.add(layer.psd_leaf_token);

    if (!layer.image_path || layer.image_path.trim().length === 0) {
      throw new Error(`See-through manifest layer ${layer.name} is missing image_path`);
    }
    const [left, top, right, bottom] = layer.bbox;
    if (right <= left || bottom <= top) {
      throw new Error(`Invalid bbox for See-through layer ${layer.name}`);
    }

    if (!assetPaths.has(layer.image_path)) {
      throw new Error(`Missing See-through layer asset: ${layer.image_path}`);
    }
  }
}

function createBaseProject(
  name: string,
  width: number,
  height: number,
  layers: ViviMeshNode[],
): ProjectData {
  return {
    name,
    width,
    height,
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

export async function parseSeeThroughNativeImportBundleAsync(
  bundle: ViviCompatNativeImportBundle,
  fileName: string,
): Promise<ParsedPsdResult> {
  validateManifestBundle(bundle);

  const assetByPath = new Map(
    bundle.layerAssets.map((asset) => [asset.image_path, asset.imageData] as const),
  );
  const orderedLayers = sortManifestLayers(bundle.manifest);
  const textures: NativeImportTexture[] = [];
  const layers: ViviMeshNode[] = [];

  for (const { layer } of orderedLayers) {
    const assetBuffer = assetByPath.get(layer.image_path);
    if (!assetBuffer) {
      throw new Error(`Missing See-through layer asset: ${layer.image_path}`);
    }

    const imageData = await decodePngToImageData(assetBuffer);
    const [left, top, right, bottom] = layer.bbox;
    const width = right - left;
    const height = bottom - top;

    if (imageData.width !== width || imageData.height !== height) {
      throw new Error(
        `See-through layer ${layer.name} image size does not match bbox (${imageData.width}x${imageData.height} vs ${width}x${height})`,
      );
    }

    const semanticRole =
      layer.confidence >= SEE_THROUGH_ROLE_CONFIDENCE_THRESHOLD
        ? mapSeeThroughLabelToRole(layer.label)
        : "unknown";
    const meshPreset = suggestSeeThroughMeshDensityPreset({
      semanticRole,
      confidence: layer.confidence,
      frontBackSplit: layer.front_back_split,
    });
    const { divisionsX, divisionsY } = meshDensityPresetToGridDivisions(meshPreset);
    const id = crypto.randomUUID();

    layers.push({
      id,
      kind: "viviMesh",
      name: buildSeeThroughTechnicalName(layer.psd_leaf_token, layer.name),
      visible: true,
      opacity: 1,
      x: left,
      y: top,
      width,
      height,
      blendMode: "normal",
      expanded: true,
      children: [],
      mesh: generateGridMesh(width, height, divisionsX, divisionsY),
    });

    textures.push({
      layerId: id,
      imageData,
    });
  }

  assignDrawOrders(layers);

  const project = createBaseProject(
    fileName.replace(/\.(psd|png|json)$/i, ""),
    bundle.manifest.canvas.width,
    bundle.manifest.canvas.height,
    layers,
  );
  const annotated = applySeeThroughImportContext(project, bundle.manifest);
  if (!annotated.applied) {
    throw new Error(
      annotated.warning ?? "Failed to apply See-through import metadata to native bundle",
    );
  }
  applyProjectLayerOcclusionCleanupToTextures(annotated.project, textures);

  return {
    project: annotated.project,
    commitTextures: () => {
      clearTextures();
      for (const texture of textures) {
        setTextureFromImageData(texture.layerId, texture.imageData);
      }
    },
  };
}

export async function loadSeeThroughNativeImportBundleAsync(
  bundle: ViviCompatNativeImportBundle,
  fileName: string,
  options?: { notifyOnError?: boolean },
): Promise<boolean> {
  const previousTextures = new Map(getAllTextures());
  try {
    const parsed = await parseSeeThroughNativeImportBundleAsync(bundle, fileName);
    try {
      parsed.commitTextures();
      applyLoadedProject(parsed.project, null, "seeThrough");
    } catch (error) {
      clearTextures();
      for (const [layerId, canvas] of previousTextures) {
        setTexture(layerId, canvas);
      }
      throw error;
    }
    return true;
  } catch (error) {
    if (options?.notifyOnError !== false) {
      useNotificationStore
        .getState()
        .addNotification("error", error instanceof Error ? error.message : String(error));
    }
    return false;
  }
}
