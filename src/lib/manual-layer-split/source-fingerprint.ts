import type { ViviMeshNode } from "@vivi2d/core/types";
import { hashTextureCanvas } from "@/lib/texture-store";

export interface ManualLayerSplitSourceFingerprint {
  profile: "manualLayerSplitSource:v1";
  sourceLayerId: string;
  sourceTextureHash: string;
  width: number;
  height: number;
}

export function createManualLayerSplitSourceFingerprint(
  sourceLayer: ViviMeshNode,
  sourceCanvas: HTMLCanvasElement,
): string {
  const fingerprint: ManualLayerSplitSourceFingerprint = {
    profile: "manualLayerSplitSource:v1",
    sourceLayerId: sourceLayer.id,
    sourceTextureHash: hashTextureCanvas(sourceCanvas),
    width: sourceCanvas.width,
    height: sourceCanvas.height,
  };
  return `manualLayerSplitSource:v1:${stableStringify(fingerprint)}`;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}
