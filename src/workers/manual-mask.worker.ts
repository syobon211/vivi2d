/// <reference lib="webworker" />
import {
  featherMask,
  fillSmallHoles,
  growMask,
  regionGrowFromPoint,
  removeSmallIslands,
  shrinkMask,
} from "@/lib/manual-layer-split/mask-ops";
import type { MaskBuffer } from "@/lib/manual-layer-split/types";
import type { WorkerMessage } from "./worker-protocol";

export type ManualMaskWorkerOperation =
  | { kind: "grow"; radius: number }
  | { kind: "shrink"; radius: number }
  | { kind: "feather"; radius: number }
  | { kind: "removeIslands"; minArea: number }
  | { kind: "fillHoles"; maxArea: number }
  | {
      kind: "regionGrow";
      x: number;
      y: number;
      tolerance: number;
      mode: "add" | "subtract" | "replace";
      sourceRgbaBuffer: ArrayBuffer;
    };

export interface ManualMaskWorkerRequest {
  operationId: string;
  baseDraftGeneration: number;
  targetBufferId: string;
  width: number;
  height: number;
  alphaBuffer: ArrayBuffer;
  operation: ManualMaskWorkerOperation;
}

export interface ManualMaskWorkerResult {
  operationId: string;
  baseDraftGeneration: number;
  targetBufferId: string;
  width: number;
  height: number;
  alphaBuffer: ArrayBuffer;
}

export type ManualMaskWorkerResponse = WorkerMessage<ManualMaskWorkerResult>;

function post(message: ManualMaskWorkerResponse, transfer?: Transferable[]): void {
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(message, transfer ?? []);
}

function assertMaskDimensions(width: number, height: number, alphaLength: number): void {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width * height !== alphaLength
  ) {
    throw new Error("Invalid manual mask dimensions");
  }
}

export function handleManualMaskRequest(
  request: ManualMaskWorkerRequest,
): ManualMaskWorkerResponse {
  try {
    const alpha = new Uint8ClampedArray(request.alphaBuffer);
    assertMaskDimensions(request.width, request.height, alpha.length);
    const buffer: MaskBuffer = {
      id: request.targetBufferId,
      width: request.width,
      height: request.height,
      alpha,
    };

    switch (request.operation.kind) {
      case "grow":
        growMask(buffer, request.operation.radius);
        break;
      case "shrink":
        shrinkMask(buffer, request.operation.radius);
        break;
      case "feather":
        featherMask(buffer, request.operation.radius);
        break;
      case "removeIslands":
        removeSmallIslands(buffer, request.operation.minArea);
        break;
      case "fillHoles":
        fillSmallHoles(buffer, request.operation.maxArea);
        break;
      case "regionGrow": {
        const sourceData = new Uint8ClampedArray(request.operation.sourceRgbaBuffer);
        if (sourceData.length !== request.width * request.height * 4) {
          throw new Error("Invalid manual mask source dimensions");
        }
        regionGrowFromPoint(
          new ImageData(sourceData, request.width, request.height),
          buffer,
          request.operation.x,
          request.operation.y,
          request.operation.tolerance,
          request.operation.mode,
        );
        break;
      }
      default: {
        const exhaustive: never = request.operation;
        throw new Error(`Unsupported manual mask operation: ${String(exhaustive)}`);
      }
    }

    return {
      type: "result",
      result: {
        operationId: request.operationId,
        baseDraftGeneration: request.baseDraftGeneration,
        targetBufferId: request.targetBufferId,
        width: request.width,
        height: request.height,
        alphaBuffer: alpha.buffer,
      },
    };
  } catch (err) {
    return {
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

self.addEventListener("message", (event: MessageEvent<ManualMaskWorkerRequest>) => {
  const response = handleManualMaskRequest(event.data);
  if (response.type === "result") {
    post(response, [response.result.alphaBuffer]);
  } else {
    post(response);
  }
});
