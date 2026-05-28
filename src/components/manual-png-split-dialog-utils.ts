import type { ViviMeshNode } from "@vivi2d/core/types";
import type { PointerEvent } from "react";
import {
  countMaskPixels,
  createCanvasLike,
  MANUAL_PNG_SPLIT_PARTS,
  type ManualPngSplitPartId,
} from "@/lib/manual-png-layer-split";
import { pointerEventToSourcePoint } from "@/lib/manual-layer-split/lasso-smoothing";
import type { MaskBuffer } from "@/lib/manual-layer-split/types";
import { getTexture } from "@/lib/texture-store";

export type PartNameState = Record<ManualPngSplitPartId, string>;
export type MaskCountState = Record<ManualPngSplitPartId, number>;
export type SplitTool = "brush" | "lasso" | "wand";
export type PaintMode = "add" | "subtract" | "replace";

export interface MaskSnapshot {
  partId: ManualPngSplitPartId;
  imageData: ImageData;
}

export interface MaskHistoryEntry {
  before: MaskSnapshot[];
  after: MaskSnapshot[];
}

const MAX_MASK_HISTORY_BYTES = 64 * 1024 * 1024;

export function createDefaultPartNames(): PartNameState {
  return Object.fromEntries(
    MANUAL_PNG_SPLIT_PARTS.map((part) => [part.id, part.role]),
  ) as PartNameState;
}

export function createEmptyMaskCounts(): MaskCountState {
  return Object.fromEntries(
    MANUAL_PNG_SPLIT_PARTS.map((part) => [part.id, 0]),
  ) as MaskCountState;
}

export function getLayerTexture(
  layer: ViviMeshNode | null,
): HTMLCanvasElement | null {
  return layer ? (getTexture(layer.id) ?? null) : null;
}

export function drawCheckerboard(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  const size = 24;
  context.fillStyle = "#f6f7f2";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#dfe4d6";
  for (let y = 0; y < height; y += size) {
    for (let x = 0; x < width; x += size) {
      if (((x + y) / size) % 2 === 0) {
        context.fillRect(x, y, size, size);
      }
    }
  }
}

export function getCanvasPoint(
  event: PointerEvent<HTMLCanvasElement>,
  canvas: HTMLCanvasElement,
): { x: number; y: number } {
  return getCanvasPointFromClient(event, canvas);
}

export function getCanvasPointFromClient(
  event: Pick<PointerEvent<HTMLCanvasElement>, "clientX" | "clientY" | "timeStamp">,
  canvas: HTMLCanvasElement,
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const point = pointerEventToSourcePoint(event, rect, {
    cssToBackingScaleX: canvas.width / rect.width,
    cssToBackingScaleY: canvas.height / rect.height,
    panX: 0,
    panY: 0,
    zoom: 1,
    sourceOffsetX: 0,
    sourceOffsetY: 0,
    sourceWidth: canvas.width,
    sourceHeight: canvas.height,
    version: 1,
  });
  return point ?? { x: 0, y: 0 };
}

export function drawLassoPath(
  context: CanvasRenderingContext2D,
  points: ReadonlyArray<{ x: number; y: number }>,
): void {
  if (points.length < 2) return;
  context.save();
  context.strokeStyle = "rgba(255, 255, 255, 0.95)";
  context.lineWidth = 3;
  context.setLineDash([10, 8]);
  context.beginPath();
  context.moveTo(points[0]!.x, points[0]!.y);
  for (const point of points.slice(1)) context.lineTo(point.x, point.y);
  context.stroke();
  context.restore();
}

export function fillPolygonOnMask(
  maskCanvas: HTMLCanvasElement,
  points: ReadonlyArray<{ x: number; y: number }>,
  paintMode: PaintMode,
): void {
  if (points.length < 3) return;
  const context = maskCanvas.getContext("2d");
  if (!context) return;
  context.save();
  if (paintMode === "replace") {
    context.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
  }
  context.globalCompositeOperation =
    paintMode === "subtract" ? "destination-out" : "source-over";
  context.fillStyle = "rgba(255, 255, 255, 1)";
  context.beginPath();
  context.moveTo(points[0]!.x, points[0]!.y);
  for (const point of points.slice(1)) context.lineTo(point.x, point.y);
  context.closePath();
  context.fill("nonzero");
  context.restore();
}

export function hasMaskOverlap(
  masks: ReadonlyMap<ManualPngSplitPartId, HTMLCanvasElement>,
): boolean {
  const canvases = [...masks.values()].map(createOverlapSampleCanvas);
  for (let firstIndex = 0; firstIndex < canvases.length; firstIndex += 1) {
    const first = canvases[firstIndex]!;
    const firstContext = first.getContext("2d");
    if (!firstContext) continue;
    const firstData = firstContext.getImageData(0, 0, first.width, first.height).data;
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < canvases.length;
      secondIndex += 1
    ) {
      const second = canvases[secondIndex]!;
      if (first.width !== second.width || first.height !== second.height) continue;
      const secondContext = second.getContext("2d");
      if (!secondContext) continue;
      const secondData = secondContext.getImageData(0, 0, second.width, second.height).data;
      for (let index = 3; index < firstData.length; index += 4) {
        if (firstData[index]! > 0 && secondData[index]! > 0) return true;
      }
    }
  }
  return false;
}

export function trimMaskHistory(
  entries: MaskHistoryEntry[],
): MaskHistoryEntry[] {
  const kept: MaskHistoryEntry[] = [];
  let total = 0;
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]!;
    const size = estimateMaskHistoryEntryBytes(entry);
    if (kept.length > 0 && total + size > MAX_MASK_HISTORY_BYTES) break;
    kept.unshift(entry);
    total += size;
    if (kept.length >= 50) break;
  }
  return kept;
}

export function createOperationId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

export function canvasToMaskBuffer(
  id: string,
  canvas: HTMLCanvasElement,
): MaskBuffer | null {
  const context = canvas.getContext("2d");
  if (!context) return null;
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const alpha = new Uint8ClampedArray(canvas.width * canvas.height);
  for (
    let sourceIndex = 3, targetIndex = 0;
    sourceIndex < imageData.data.length;
    sourceIndex += 4, targetIndex += 1
  ) {
    alpha[targetIndex] = imageData.data[sourceIndex]!;
  }
  return { id, width: canvas.width, height: canvas.height, alpha };
}

export function writeMaskBufferToCanvas(
  canvas: HTMLCanvasElement,
  buffer: MaskBuffer,
): void {
  if (canvas.width !== buffer.width || canvas.height !== buffer.height) return;
  const context = canvas.getContext("2d");
  if (!context) return;
  const imageData = context.createImageData(buffer.width, buffer.height);
  for (
    let targetIndex = 0, sourceIndex = 0;
    sourceIndex < buffer.alpha.length;
    sourceIndex += 1, targetIndex += 4
  ) {
    imageData.data[targetIndex] = 255;
    imageData.data[targetIndex + 1] = 255;
    imageData.data[targetIndex + 2] = 255;
    imageData.data[targetIndex + 3] = buffer.alpha[sourceIndex]!;
  }
  context.putImageData(imageData, 0, 0);
}

export function getCanvasImageData(canvas: HTMLCanvasElement): ImageData | null {
  const context = canvas.getContext("2d");
  if (!context) return null;
  try {
    return context.getImageData(0, 0, canvas.width, canvas.height);
  } catch {
    return null;
  }
}

export function isEditableEventTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

export function drawShiftedMaskedSource(
  context: CanvasRenderingContext2D,
  sourceCanvas: HTMLCanvasElement,
  maskCanvas: HTMLCanvasElement,
  offsetX: number,
): void {
  const layer = createCanvasLike(sourceCanvas);
  const layerContext = layer.getContext("2d");
  if (!layerContext) return;
  layerContext.drawImage(sourceCanvas, 0, 0);
  layerContext.globalCompositeOperation = "destination-in";
  layerContext.drawImage(maskCanvas, 0, 0);
  context.save();
  context.globalAlpha = 0.9;
  context.shadowColor = "rgba(0, 0, 0, 0.45)";
  context.shadowBlur = 12;
  context.drawImage(layer, offsetX, 0);
  context.restore();
}

function createOverlapSampleCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const maxSide = 512;
  if (canvas.width <= maxSide && canvas.height <= maxSide) return canvas;
  const scale = Math.min(maxSide / canvas.width, maxSide / canvas.height);
  const sample = document.createElement("canvas");
  sample.width = Math.max(1, Math.round(canvas.width * scale));
  sample.height = Math.max(1, Math.round(canvas.height * scale));
  const context = sample.getContext("2d");
  if (!context) return canvas;
  context.drawImage(canvas, 0, 0, sample.width, sample.height);
  return sample;
}

function estimateMaskHistoryEntryBytes(entry: MaskHistoryEntry): number {
  const snapshots = [...entry.before, ...entry.after];
  return snapshots.reduce(
    (total, snapshot) => total + snapshot.imageData.data.byteLength,
    0,
  );
}
