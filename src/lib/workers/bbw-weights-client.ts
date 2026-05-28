import type { BBWOptions, BoneHandle } from "@vivi2d/core/bbw-weights";
import { computeBBWWeights } from "@vivi2d/core/bbw-weights";
import type { SkinWeight } from "@vivi2d/core/types";
import { runWorker } from "@/lib/workers/worker-runner";
import type { BBWRequest } from "@/workers/bbw-weights.worker";
import BBWWorker from "@/workers/bbw-weights.worker?worker";

export interface ComputeBBWWeightsOptions {
  signal?: AbortSignal;
}

function isWorkerSupported(): boolean {
  return typeof Worker !== "undefined";
}

export function computeBBWWeightsAsync(
  vertices: number[],
  indices: number[],
  bones: BoneHandle[],
  options?: BBWOptions,
  clientOptions?: ComputeBBWWeightsOptions,
): Promise<SkinWeight[][]> {
  if (!isWorkerSupported()) {
    return Promise.resolve(computeBBWWeights(vertices, indices, bones, options));
  }

  const request: BBWRequest = { vertices, indices, bones, options };
  return runWorker<BBWRequest, SkinWeight[][]>({
    createWorker: () => new BBWWorker(),
    request,
    signal: clientOptions?.signal,
    errorLabel: "BBW worker error",
  });
}
