/// <reference lib="webworker" />
import type { MeshDensityPreset } from "@vivi2d/core/constants";
import type { MeshData } from "@vivi2d/core/types";
import { generateAutoMeshFromImageData } from "@/lib/auto-mesh";
import type { WorkerMessage } from "./worker-protocol";

// AutoMesh Worker

export interface AutoMeshRequest {
  buffer: ArrayBuffer;
  texWidth: number;
  texHeight: number;
  layerWidth: number;
  layerHeight: number;
  preset: MeshDensityPreset;
}

export type AutoMeshResponse = WorkerMessage<MeshData | null>;

function post(message: AutoMeshResponse): void {
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(message);
}

export function handleAutoMeshRequest(request: AutoMeshRequest): AutoMeshResponse {
  const { buffer, texWidth, texHeight, layerWidth, layerHeight, preset } = request;
  try {
    const data = new Uint8ClampedArray(buffer);
    const imageData = new ImageData(data, texWidth, texHeight);
    const result = generateAutoMeshFromImageData(
      imageData,
      texWidth,
      texHeight,
      layerWidth,
      layerHeight,
      preset,
    );
    return { type: "result", result };
  } catch (err) {
    return {
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

self.addEventListener("message", (event: MessageEvent<AutoMeshRequest>) => {
  post(handleAutoMeshRequest(event.data));
});
