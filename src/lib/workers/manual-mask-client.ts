import {
  featherMask,
  fillSmallHoles,
  growMask,
  regionGrowFromPoint,
  removeSmallIslands,
  shrinkMask,
} from "@/lib/manual-layer-split/mask-ops";
import type { MaskBuffer } from "@/lib/manual-layer-split/types";
import { runWorker } from "@/lib/workers/worker-runner";
import ManualMaskWorker from "@/workers/manual-mask.worker?worker";
import type {
  ManualMaskWorkerOperation,
  ManualMaskWorkerRequest,
  ManualMaskWorkerResult,
} from "@/workers/manual-mask.worker";

export interface RunManualMaskOperationOptions {
  operationId: string;
  baseDraftGeneration: number;
  signal?: AbortSignal;
}

function isWorkerSupported(): boolean {
  return typeof Worker !== "undefined";
}

function cloneAlphaBuffer(buffer: MaskBuffer): ArrayBuffer {
  const copy = new ArrayBuffer(buffer.alpha.byteLength);
  new Uint8ClampedArray(copy).set(buffer.alpha);
  return copy;
}

function applyOperationSync(
  buffer: MaskBuffer,
  operation: ManualMaskWorkerOperation,
): MaskBuffer {
  const next: MaskBuffer = {
    id: buffer.id,
    width: buffer.width,
    height: buffer.height,
    alpha: new Uint8ClampedArray(buffer.alpha),
  };
  switch (operation.kind) {
    case "grow":
      growMask(next, operation.radius);
      break;
    case "shrink":
      shrinkMask(next, operation.radius);
      break;
    case "feather":
      featherMask(next, operation.radius);
      break;
    case "removeIslands":
      removeSmallIslands(next, operation.minArea);
      break;
    case "fillHoles":
      fillSmallHoles(next, operation.maxArea);
      break;
    case "regionGrow": {
      const source = new ImageData(
        new Uint8ClampedArray(operation.sourceRgbaBuffer.slice(0)),
        next.width,
        next.height,
      );
      regionGrowFromPoint(source, next, operation.x, operation.y, operation.tolerance, operation.mode);
      break;
    }
    default: {
      const exhaustive: never = operation;
      throw new Error(`Unsupported manual mask operation: ${String(exhaustive)}`);
    }
  }
  return next;
}

export async function runManualMaskOperationAsync(
  buffer: MaskBuffer,
  operation: ManualMaskWorkerOperation,
  options: RunManualMaskOperationOptions,
): Promise<ManualMaskWorkerResult> {
  if (!isWorkerSupported()) {
    const result = applyOperationSync(buffer, operation);
    return {
      operationId: options.operationId,
      baseDraftGeneration: options.baseDraftGeneration,
      targetBufferId: buffer.id,
      width: buffer.width,
      height: buffer.height,
      alphaBuffer: cloneAlphaBuffer(result),
    };
  }

  const alphaBuffer = cloneAlphaBuffer(buffer);
  const transfer: Transferable[] = [alphaBuffer];
  if (operation.kind === "regionGrow") {
    transfer.push(operation.sourceRgbaBuffer);
  }

  const request: ManualMaskWorkerRequest = {
    operationId: options.operationId,
    baseDraftGeneration: options.baseDraftGeneration,
    targetBufferId: buffer.id,
    width: buffer.width,
    height: buffer.height,
    alphaBuffer,
    operation,
  };

  return runWorker<ManualMaskWorkerRequest, ManualMaskWorkerResult>({
    createWorker: () => new ManualMaskWorker(),
    request,
    transfer,
    signal: options.signal,
    errorLabel: "Manual mask worker error",
  });
}
