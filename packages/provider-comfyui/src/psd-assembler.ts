import { requireDefined } from "@vivi2d/core/type-guards";
import { writePsd } from "ag-psd";
import type { PositionedSeethroughLayer, SeethroughLayer } from "./types";

const SEETHROUGH_CATEGORY_MAP: Record<string, string> = {
  face: "face",
  iris_left: "eyeLeft",
  iris_right: "eyeRight",
  eye_white_left: "eyeLeft",
  eye_white_right: "eyeRight",
  eyelash_left: "eyeLeft",
  eyelash_right: "eyeRight",
  eyebrow_left: "eyebrowLeft",
  eyebrow_right: "eyebrowRight",
  eyewear: "accessory",
  nose: "nose",
  mouth: "mouth",
  ear_left: "ear",
  ear_right: "ear",
  ear_accessory_left: "accessory",
  ear_accessory_right: "accessory",

  hair_front: "hairFront",
  hair_back: "hairBack",

  neck: "body",
  torso_wear: "body",
  hand_accessory_left: "handLeft",
  hand_accessory_right: "handRight",
  leg_wear: "body",
  foot_wear: "body",

  headwear: "accessory",
  tail: "tail",
  wings: "accessory",
};

export function mapSeethroughCategory(seethroughName: string): string {
  return SEETHROUGH_CATEGORY_MAP[seethroughName] ?? "unknown";
}

export function toLayerName(seethroughName: string): string {
  return `st:${seethroughName}`;
}

export function toCompatPsdLayerName(
  psdLeafToken: string,
  seethroughName: string,
): string {
  return `v2d[${psdLeafToken}] ${seethroughName}`;
}

async function decodeRgbaImage(
  pngBuffer: ArrayBuffer,
): Promise<{ width: number; height: number; data: Uint8ClampedArray }> {
  if (typeof createImageBitmap !== "undefined") {
    const blob = new Blob([pngBuffer], { type: "image/png" });
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = requireDefined(
      canvas.getContext("2d"),
          "Failed to get an OffscreenCanvas 2D context",
    );
    ctx.drawImage(bitmap, 0, 0);
    const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    bitmap.close();
    return { width: imageData.width, height: imageData.height, data: imageData.data };
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = requireDefined(
        canvas.getContext("2d"),
        "Failed to get an HTMLCanvas 2D context",
      );
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, img.width, img.height);
      resolve({ width: imageData.width, height: imageData.height, data: imageData.data });
    };
    img.onerror = () => reject(new Error("Failed to decode image"));
    const blob = new Blob([pngBuffer], { type: "image/png" });
    img.src = URL.createObjectURL(blob);
  });
}

export async function assemblePsd(
  layers: SeethroughLayer[],
  canvasWidth: number,
  canvasHeight: number,
): Promise<ArrayBuffer> {
  const sorted = [...layers].sort((a, b) => a.order - b.order);

  const positionedLayers: PositionedSeethroughLayer[] = sorted.map((layer) => ({
    ...layer,
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
  }));

  return assemblePositionedPsd(positionedLayers, canvasWidth, canvasHeight);
}

export async function assemblePositionedPsd(
  layers: PositionedSeethroughLayer[],
  canvasWidth: number,
  canvasHeight: number,
): Promise<ArrayBuffer> {
  const sorted = [...layers].sort((a, b) => a.order - b.order);
  const psdLayers = [];

  for (const layer of sorted) {
    const decoded = await decodeRgbaImage(layer.imageData);
    const left = layer.left;
    const top = layer.top;
    const right = layer.right > left ? layer.right : left + decoded.width;
    const bottom = layer.bottom > top ? layer.bottom : top + decoded.height;

    psdLayers.push({
      name:
        layer.psdLeafToken && layer.psdLeafToken.length > 0
          ? toCompatPsdLayerName(layer.psdLeafToken, layer.name)
          : toLayerName(layer.name),
      left,
      top,
      right,
      bottom,
      imageData: {
        width: decoded.width,
        height: decoded.height,
        data: decoded.data,
      } as ImageData,
      opacity: 1,
      blendMode: "normal" as const,
    });
  }

  const psd = {
    width: canvasWidth,
    height: canvasHeight,
    children: psdLayers,
  };

  return writePsd(psd);
}
