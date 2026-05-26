import type { MeshDensityPreset } from "@vivi2d/core/constants";
import type { MeshData } from "@vivi2d/core/types";
import { generateAutoMesh } from "@/lib/auto-mesh";
import { runWorker } from "@/lib/workers/worker-runner";
import type { AutoMeshRequest } from "@/workers/auto-mesh.worker";
import AutoMeshWorker from "@/workers/auto-mesh.worker?worker";

export interface GenerateAutoMeshOptions {
  presetOverride?: MeshDensityPreset;
  signal?: AbortSignal;
}

function isWorkerSupported(): boolean {
  return typeof Worker !== "undefined";
}

export function generateAutoMeshAsync(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  preset: MeshDensityPreset,
  options?: GenerateAutoMeshOptions,
): Promise<MeshData | null> {
  const effectivePreset = options?.presetOverride ?? preset;
  if (!isWorkerSupported()) {
    return Promise.resolve(generateAutoMesh(canvas, width, height, effectivePreset));
  }

  const ctx = canvas.getContext("2d");
  if (!ctx || canvas.width === 0 || canvas.height === 0) {
    return Promise.resolve(null);
  }
  let imageData: ImageData;
  try {
    imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  } catch {
    return Promise.resolve(null);
  }

  const buffer = imageData.data.buffer.slice(0);

  const request: AutoMeshRequest = {
    buffer,
    texWidth: canvas.width,
    texHeight: canvas.height,
    layerWidth: width,
    layerHeight: height,
    preset: effectivePreset,
  };

  return runWorker<AutoMeshRequest, MeshData | null>({
    createWorker: () => new AutoMeshWorker(),
    request,
    transfer: [buffer],
    signal: options?.signal,
    errorLabel: "AutoMesh worker error",
  });
}
