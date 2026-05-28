import { findLayerById } from "@vivi2d/core/layer-utils";
import { isViviMesh, type ViviMeshNode } from "@vivi2d/core/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  canSplitManualPngLayer,
  type ManualPngSplitMask,
} from "@/lib/manual-png-layer-split";
import { clearTextures, getTexture, setTexture } from "@/lib/texture-store";
import { useEditorStore } from "@/stores/editorStore";
import { useHistoryStore } from "@/stores/historyStore";
import { splitManualPngLayer } from "@/stores/manualPngSplit";
import { useNotificationStore } from "@/stores/notificationStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { createProject, createViviMesh } from "@/test/fixtures";
import { resetAllStores } from "@/test/store-reset";

let canvasData = new WeakMap<HTMLCanvasElement, Uint8ClampedArray>();
const originalGetContext = HTMLCanvasElement.prototype.getContext;

function getCanvasData(canvas: HTMLCanvasElement): Uint8ClampedArray {
  const expectedLength = canvas.width * canvas.height * 4;
  const existing = canvasData.get(canvas);
  if (existing && existing.length === expectedLength) return existing;
  const next = new Uint8ClampedArray(expectedLength);
  canvasData.set(canvas, next);
  return next;
}

function parseFillAlpha(
  fillStyle: string | CanvasGradient | CanvasPattern,
): number {
  if (typeof fillStyle !== "string") return 255;
  const alphaMatch = fillStyle.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([^)]+)\)/i);
  if (!alphaMatch) return 255;
  return Math.round(Math.max(0, Math.min(1, Number(alphaMatch[1]))) * 255);
}

function installCanvas2DMock(): void {
  HTMLCanvasElement.prototype.getContext = vi.fn(function getContext(
    this: HTMLCanvasElement,
    contextId: string,
  ) {
    if (contextId !== "2d") return null;
    const canvas = this;
    const context = {
      canvas,
      fillStyle: "rgba(0, 0, 0, 1)",
      globalCompositeOperation: "source-over",
      fillRect(x: number, y: number, width: number, height: number) {
        const data = getCanvasData(canvas);
        const alpha = parseFillAlpha(context.fillStyle);
        for (
          let py = Math.max(0, y);
          py < Math.min(canvas.height, y + height);
          py += 1
        ) {
          for (
            let px = Math.max(0, x);
            px < Math.min(canvas.width, x + width);
            px += 1
          ) {
            const index = (py * canvas.width + px) * 4;
            data[index] = 120;
            data[index + 1] = 220;
            data[index + 2] = 80;
            data[index + 3] = alpha;
          }
        }
      },
      clearRect(x: number, y: number, width: number, height: number) {
        const data = getCanvasData(canvas);
        for (
          let py = Math.max(0, y);
          py < Math.min(canvas.height, y + height);
          py += 1
        ) {
          for (
            let px = Math.max(0, x);
            px < Math.min(canvas.width, x + width);
            px += 1
          ) {
            data.fill(
              0,
              (py * canvas.width + px) * 4,
              (py * canvas.width + px + 1) * 4,
            );
          }
        }
      },
      getImageData(x: number, y: number, width: number, height: number) {
        const source = getCanvasData(canvas);
        const output = new Uint8ClampedArray(width * height * 4);
        for (let py = 0; py < height; py += 1) {
          for (let px = 0; px < width; px += 1) {
            const sourceX = x + px;
            const sourceY = y + py;
            if (
              sourceX < 0 ||
              sourceY < 0 ||
              sourceX >= canvas.width ||
              sourceY >= canvas.height
            ) {
              continue;
            }
            const sourceIndex = (sourceY * canvas.width + sourceX) * 4;
            const targetIndex = (py * width + px) * 4;
            output.set(
              source.subarray(sourceIndex, sourceIndex + 4),
              targetIndex,
            );
          }
        }
        return new ImageData(output, width, height);
      },
      putImageData(imageData: ImageData, x: number, y: number) {
        const target = getCanvasData(canvas);
        for (let py = 0; py < imageData.height; py += 1) {
          for (let px = 0; px < imageData.width; px += 1) {
            const targetX = x + px;
            const targetY = y + py;
            if (
              targetX < 0 ||
              targetY < 0 ||
              targetX >= canvas.width ||
              targetY >= canvas.height
            ) {
              continue;
            }
            const sourceIndex = (py * imageData.width + px) * 4;
            const targetIndex = (targetY * canvas.width + targetX) * 4;
            target.set(
              imageData.data.subarray(sourceIndex, sourceIndex + 4),
              targetIndex,
            );
          }
        }
      },
      drawImage(sourceCanvas: HTMLCanvasElement, ...args: number[]) {
        const [sx, sy, sw, sh, dx, dy, dw, dh] =
          args.length >= 8
            ? args
            : [
                0,
                0,
                sourceCanvas.width,
                sourceCanvas.height,
                args[0] ?? 0,
                args[1] ?? 0,
                sourceCanvas.width,
                sourceCanvas.height,
              ];
        const sourceX0 = sx ?? 0;
        const sourceY0 = sy ?? 0;
        const sourceWidth = sw ?? sourceCanvas.width;
        const sourceHeight = sh ?? sourceCanvas.height;
        const targetX0 = dx ?? 0;
        const targetY0 = dy ?? 0;
        const targetWidth = dw ?? sourceWidth;
        const targetHeight = dh ?? sourceHeight;
        const source = getCanvasData(sourceCanvas);
        const target = getCanvasData(canvas);
        for (let py = 0; py < targetHeight; py += 1) {
          for (let px = 0; px < targetWidth; px += 1) {
            const sourceX = Math.floor(
              sourceX0 + (px / Math.max(1, targetWidth)) * sourceWidth,
            );
            const sourceY = Math.floor(
              sourceY0 + (py / Math.max(1, targetHeight)) * sourceHeight,
            );
            const targetX = targetX0 + px;
            const targetY = targetY0 + py;
            if (
              sourceX < 0 ||
              sourceY < 0 ||
              sourceX >= sourceCanvas.width ||
              sourceY >= sourceCanvas.height ||
              targetX < 0 ||
              targetY < 0 ||
              targetX >= canvas.width ||
              targetY >= canvas.height
            ) {
              continue;
            }
            const sourceIndex = (sourceY * sourceCanvas.width + sourceX) * 4;
            const targetIndex = (targetY * canvas.width + targetX) * 4;
            target.set(
              source.subarray(sourceIndex, sourceIndex + 4),
              targetIndex,
            );
          }
        }
      },
      save() {},
      restore() {},
      beginPath() {},
      arc() {},
      fill() {},
    };
    return context as unknown as CanvasRenderingContext2D;
  }) as unknown as typeof HTMLCanvasElement.prototype.getContext;
}

function createSolidCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D canvas context is unavailable");
  context.fillStyle = "rgba(120, 220, 80, 1)";
  context.fillRect(0, 0, width, height);
  return canvas;
}

function createMaskCanvas(
  width: number,
  height: number,
  rect: { x: number; y: number; width: number; height: number },
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D canvas context is unavailable");
  context.fillStyle = "rgba(255, 255, 255, 1)";
  context.fillRect(rect.x, rect.y, rect.width, rect.height);
  return canvas;
}

function createManualPngMesh(
  overrides: Partial<ViviMeshNode> = {},
): ViviMeshNode {
  return createViviMesh({
    id: "source-layer",
    name: "Source PNG",
    width: 8,
    height: 4,
    importMetadata: {
      source: "manualPng",
      manualPng: {
        sourceFileName: "source.png",
        originalWidth: 8,
        originalHeight: 4,
        trimmedBounds: [0, 0, 8, 4],
        finalOrigin: [0, 0],
        placementMode: "preserveImageOffset",
        trimTransparentBoundsApplied: false,
        autoGenerateMeshApplied: true,
      },
    },
    ...overrides,
  });
}

function createSplitMasks(): ManualPngSplitMask[] {
  return [
    {
      partId: "hair",
      name: "Hair",
      role: "hair",
      maskCanvas: createMaskCanvas(8, 4, { x: 0, y: 0, width: 4, height: 4 }),
    },
    {
      partId: "body",
      name: "Body",
      role: "body",
      maskCanvas: createMaskCanvas(8, 4, { x: 4, y: 0, width: 4, height: 4 }),
    },
  ];
}

describe("manual PNG split store action", () => {
  beforeEach(() => {
    resetAllStores();
    clearTextures();
    installCanvas2DMock();
  });

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    canvasData = new WeakMap<HTMLCanvasElement, Uint8ClampedArray>();
  });

  it("recognizes only manual PNG mesh layers as split candidates", () => {
    const manualPngMesh = createManualPngMesh();
    const plainMesh = createViviMesh({
      id: "plain-mesh",
      importMetadata: undefined,
    });

    expect(canSplitManualPngLayer(manualPngMesh)).toBe(true);
    expect(canSplitManualPngLayer(plainMesh)).toBe(false);
    expect(canSplitManualPngLayer(null)).toBe(false);
  });

  it("warns and leaves the project unchanged when fewer than two masks are provided", () => {
    const sourceLayer = createManualPngMesh();
    const project = createProject({ layers: [sourceLayer] });
    useEditorStore.setState({ project });
    setTexture(sourceLayer.id, createSolidCanvas(8, 4));

    const didSplit = splitManualPngLayer({
      sourceLayerId: sourceLayer.id,
      masks: [],
    });

    expect(didSplit).toBe(false);
    expect(useEditorStore.getState().project?.layers).toHaveLength(1);
    expect(useHistoryStore.getState().undoStack).toHaveLength(0);
    expect(useNotificationStore.getState().notifications[0]?.type).toBe(
      "warning",
    );
  });

  it("applies the split plan, textures, selection, history, and notification", () => {
    const sourceLayer = createManualPngMesh();
    const project = createProject({ layers: [sourceLayer] });
    useEditorStore.setState({ project });
    setTexture(sourceLayer.id, createSolidCanvas(8, 4));

    const didSplit = splitManualPngLayer({
      sourceLayerId: sourceLayer.id,
      masks: createSplitMasks(),
    });

    expect(didSplit).toBe(true);

    const nextProject = useEditorStore.getState().project;
    const nextSource = nextProject
      ? findLayerById(nextProject.layers, sourceLayer.id)
      : null;
    expect(nextProject?.sourceKind).toBe("manualPng");
    expect(nextSource?.visible).toBe(false);
    expect(nextProject?.layers).toHaveLength(2);

    const insertedGroup = nextProject?.layers.find(
      (layer) => layer.kind === "group",
    );
    expect(insertedGroup).toBeDefined();
    expect(insertedGroup?.children).toHaveLength(2);

    const splitLayers = insertedGroup?.children.filter(isViviMesh) ?? [];
    expect(splitLayers.map((layer) => layer.semanticRole)).toEqual([
      "hair",
      "body",
    ]);
    expect(splitLayers.every((layer) => Boolean(getTexture(layer.id)))).toBe(
      true,
    );
    expect(useSelectionStore.getState().selectedLayerId).toBe(
      splitLayers[0]?.id,
    );
    expect(useHistoryStore.getState().undoStack).toHaveLength(1);
    expect(useEditorStore.getState().projectStructureVersion).toBe(1);
    expect(useNotificationStore.getState().notifications.at(-1)?.type).toBe(
      "info",
    );
  });
});
