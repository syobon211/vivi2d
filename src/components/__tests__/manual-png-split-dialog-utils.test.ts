import { describe, expect, it } from "vitest";
import {
  canvasToMaskBuffer,
  createDefaultPartNames,
  createEmptyMaskCounts,
  drawCheckerboard,
  drawLassoPath,
  fillPolygonOnMask,
  getCanvasImageData,
  getCanvasPointFromClient,
  hasMaskOverlap,
  isEditableEventTarget,
  trimMaskHistory,
  writeMaskBufferToCanvas,
  type MaskHistoryEntry,
} from "../manual-png-split-dialog-utils";
import type { ManualPngSplitPartId } from "@/lib/manual-png-layer-split";

type CanvasCall = { method: string; args: unknown[] };

function makeImageData(width: number, height: number, alpha: readonly number[]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < alpha.length; index += 1) {
    data[index * 4 + 3] = alpha[index]!;
  }
  return new ImageData(data, width, height);
}

function makeContext(imageData = makeImageData(2, 2, [0, 0, 0, 0])) {
  const calls: CanvasCall[] = [];
  const context = {
    calls,
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    globalCompositeOperation: "source-over",
    fillRect: (...args: unknown[]) => calls.push({ method: "fillRect", args }),
    save: (...args: unknown[]) => calls.push({ method: "save", args }),
    restore: (...args: unknown[]) => calls.push({ method: "restore", args }),
    setLineDash: (...args: unknown[]) => calls.push({ method: "setLineDash", args }),
    beginPath: (...args: unknown[]) => calls.push({ method: "beginPath", args }),
    moveTo: (...args: unknown[]) => calls.push({ method: "moveTo", args }),
    lineTo: (...args: unknown[]) => calls.push({ method: "lineTo", args }),
    closePath: (...args: unknown[]) => calls.push({ method: "closePath", args }),
    stroke: (...args: unknown[]) => calls.push({ method: "stroke", args }),
    fill: (...args: unknown[]) => calls.push({ method: "fill", args }),
    clearRect: (...args: unknown[]) => calls.push({ method: "clearRect", args }),
    getImageData: (...args: unknown[]) => {
      calls.push({ method: "getImageData", args });
      return imageData;
    },
    createImageData: (width: number, height: number) => {
      calls.push({ method: "createImageData", args: [width, height] });
      return new ImageData(width, height);
    },
    putImageData: (...args: unknown[]) => calls.push({ method: "putImageData", args }),
  };
  return context as unknown as CanvasRenderingContext2D & { calls: CanvasCall[] };
}

function makeCanvas(
  width: number,
  height: number,
  context: CanvasRenderingContext2D | null,
) {
  return {
    width,
    height,
    getContext: (kind: string) => (kind === "2d" ? context : null),
    getBoundingClientRect: () => ({
      x: 10,
      y: 20,
      left: 10,
      top: 20,
      right: 110,
      bottom: 70,
      width: 100,
      height: 50,
      toJSON: () => ({}),
    }),
  } as unknown as HTMLCanvasElement;
}

function methods(context: { calls: CanvasCall[] }, method: string) {
  return context.calls.filter((call) => call.method === method);
}

describe("manual PNG split dialog utilities", () => {
  it("creates default part labels and zeroed mask counts", () => {
    expect(createDefaultPartNames()).toMatchObject({
      hair: "hair",
      face: "face",
      body: "body",
      accessory: "accessory",
    });
    expect(createEmptyMaskCounts()).toMatchObject({
      hair: 0,
      face: 0,
      body: 0,
      accessory: 0,
    });
  });

  it("draws checkerboards, lasso previews, and pointer coordinates deterministically", () => {
    const context = makeContext();
    drawCheckerboard(context, 48, 48);
    expect(methods(context, "fillRect").length).toBeGreaterThan(1);

    drawLassoPath(context, [
      { x: 1, y: 2 },
      { x: 3, y: 4 },
      { x: 5, y: 6 },
    ]);
    expect(methods(context, "moveTo").at(-1)?.args).toEqual([1, 2]);
    expect(methods(context, "lineTo").map((call) => call.args)).toEqual(
      expect.arrayContaining([[3, 4], [5, 6]]),
    );

    const point = getCanvasPointFromClient(
      { clientX: 60, clientY: 45, timeStamp: 1 },
      makeCanvas(200, 100, context),
    );
    expect(point).toMatchObject({ x: 100, y: 50 });
  });

  it("fills polygon masks with replace and subtract semantics", () => {
    const replaceContext = makeContext();
    const replaceCanvas = makeCanvas(8, 8, replaceContext);

    fillPolygonOnMask(replaceCanvas, [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 0, y: 4 },
    ], "replace");

    expect(methods(replaceContext, "clearRect")[0]?.args).toEqual([0, 0, 8, 8]);
    expect(replaceContext.globalCompositeOperation).toBe("source-over");
    expect(methods(replaceContext, "fill")).toHaveLength(1);

    const subtractContext = makeContext();
    fillPolygonOnMask(
      makeCanvas(8, 8, subtractContext),
      [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 0, y: 4 },
      ],
      "subtract",
    );

    expect(subtractContext.globalCompositeOperation).toBe("destination-out");
  });

  it("detects overlapping alpha pixels across mask canvases", () => {
    const first = makeCanvas(2, 2, makeContext(makeImageData(2, 2, [0, 255, 0, 0])));
    const second = makeCanvas(2, 2, makeContext(makeImageData(2, 2, [0, 1, 0, 0])));
    const third = makeCanvas(2, 2, makeContext(makeImageData(2, 2, [1, 0, 0, 0])));

    expect(
      hasMaskOverlap(
        new Map<ManualPngSplitPartId, HTMLCanvasElement>([
          ["hair", first],
          ["face", second],
        ]),
      ),
    ).toBe(true);
    expect(
      hasMaskOverlap(
        new Map<ManualPngSplitPartId, HTMLCanvasElement>([
          ["hair", first],
          ["face", third],
        ]),
      ),
    ).toBe(false);
  });

  it("keeps mask history bounded by the most recent entries", () => {
    const entries: MaskHistoryEntry[] = Array.from({ length: 55 }, (_, index) => ({
      before: [{ partId: "hair", imageData: makeImageData(1, 1, [index]) }],
      after: [{ partId: "hair", imageData: makeImageData(1, 1, [index + 1]) }],
    }));

    const trimmed = trimMaskHistory(entries);

    expect(trimmed).toHaveLength(50);
    expect(trimmed[0]).toBe(entries[5]);
    expect(trimmed.at(-1)).toBe(entries.at(-1));
  });

  it("converts mask canvas alpha to and from compact buffers", () => {
    const sourceContext = makeContext(makeImageData(2, 2, [0, 10, 20, 255]));
    const buffer = canvasToMaskBuffer("mask", makeCanvas(2, 2, sourceContext));

    expect(buffer).toEqual({
      id: "mask",
      width: 2,
      height: 2,
      alpha: new Uint8ClampedArray([0, 10, 20, 255]),
    });

    const targetContext = makeContext();
    writeMaskBufferToCanvas(makeCanvas(2, 2, targetContext), buffer!);
    const output = methods(targetContext, "putImageData")[0]?.args[0] as ImageData;
    expect([...output.data]).toEqual([
      255, 255, 255, 0,
      255, 255, 255, 10,
      255, 255, 255, 20,
      255, 255, 255, 255,
    ]);
  });

  it("returns null for unreadable canvas data and detects editable targets", () => {
    const throwingContext = {
      getImageData: () => {
        throw new Error("tainted");
      },
    } as unknown as CanvasRenderingContext2D;

    expect(getCanvasImageData(makeCanvas(1, 1, null))).toBeNull();
    expect(getCanvasImageData(makeCanvas(1, 1, throwingContext))).toBeNull();
    expect(isEditableEventTarget(document.createElement("input"))).toBe(true);
    expect(isEditableEventTarget(document.createElement("textarea"))).toBe(true);
    expect(isEditableEventTarget(document.createElement("button"))).toBe(false);
    expect(isEditableEventTarget(null)).toBe(false);
  });
});
