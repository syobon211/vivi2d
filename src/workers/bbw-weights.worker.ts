/// <reference lib="webworker" />
import {
  type BBWOptions,
  type BoneHandle,
  computeBBWWeights,
} from "@vivi2d/core/bbw-weights";
import type { SkinWeight } from "@vivi2d/core/types";
import type { WorkerMessage } from "./worker-protocol";

// BBW Weights Worker

export interface BBWRequest {
  vertices: number[];
  indices: number[];
  bones: BoneHandle[];
  options?: BBWOptions;
}

export type BBWResponse = WorkerMessage<SkinWeight[][], number>;

function post(message: BBWResponse): void {
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(message);
}

export function handleBBWRequest(request: BBWRequest): BBWResponse {
  const { vertices, indices, bones, options } = request;
  try {
    const result = computeBBWWeights(vertices, indices, bones, options);
    return { type: "result", result };
  } catch (err) {
    return {
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

self.addEventListener("message", (event: MessageEvent<BBWRequest>) => {
  post(handleBBWRequest(event.data));
});
