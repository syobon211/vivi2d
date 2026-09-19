import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyTextureHistoryEffect,
  clearTextures,
  getAllTextureIds,
  getAllTextures,
  getTexture,
  getTextureStoreRevision,
  hashTextureCanvas,
  prepareTextureHistoryEffects,
  promoteDraftTextures,
  setTexture,
  setTextureFromImageData,
  snapshotTextureCanvas,
  type TextureHistoryEffect,
} from "@/lib/texture-store";
import { installRasterCanvas } from "@/test/raster-canvas";

function replacementEffect(
  textureId: string,
  before: HTMLCanvasElement,
  after: HTMLCanvasElement,
): TextureHistoryEffect {
  const oldSnapshot = snapshotTextureCanvas(textureId, before);
  const newSnapshot = snapshotTextureCanvas(textureId, after);
  return {
    kind: "texture",
    undo: {
      createdTextureIds: [],
      restoredTextures: [oldSnapshot],
      expectedCurrentHash: { [textureId]: newSnapshot.hash },
      expectedCurrentDimensions: {
        [textureId]: { width: after.width, height: after.height },
      },
    },
    redo: {
      promotedTextures: [{ textureId, canvas: after, snapshot: newSnapshot }],
      expectedCurrentHash: { [textureId]: oldSnapshot.hash },
      expectedCurrentDimensions: {
        [textureId]: { width: before.width, height: before.height },
      },
    },
    rendererInvalidation: "projectStructureVersion",
  };
}

describe("texture-store", () => {
  afterEach(() => {
    clearTextures();
  });

  it("テクスチャの登録・上書き・列挙・全削除を独立したIDで検証する", () => {
    expect(getTexture("nonexistent")).toBeUndefined();
    expect(getAllTextures().size).toBe(0);
    expect(getAllTextureIds()).toEqual([]);
    const a = document.createElement("canvas");
    const b = document.createElement("canvas");
    const replacement = document.createElement("canvas");
    setTexture("a", a);
    expect(getTexture("a")).toBe(a);
    setTexture("b", b);
    expect(getTexture("a")).toBe(a);
    expect(getTexture("b")).toBe(b);
    setTexture("a", replacement);
    expect(getTexture("a")).toBe(replacement);
    expect(getTexture("b")).toBe(b);
    expect(getAllTextureIds()).toEqual(["a", "b"]);
    const all = getAllTextures();
    expect(all.size).toBe(2);
    expect(all.get("a")).toBe(replacement);
    expect(all.get("b")).toBe(b);
    clearTextures();
    expect(getTexture("a")).toBeUndefined();
    expect(getTexture("b")).toBeUndefined();
    expect(getAllTextureIds()).toEqual([]);
    expect(getAllTextures().size).toBe(0);
  });

  describe("setTextureFromImageData", () => {
    it("ImageData から canvas を生成して store に登録する", () => {
      const putImageData = vi.fn();
      const fakeCtx = { putImageData } as unknown as CanvasRenderingContext2D;
      const originalGetContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = vi.fn(
        () => fakeCtx,
      ) as unknown as typeof HTMLCanvasElement.prototype.getContext;
      try {
        const imageData = new ImageData(
          new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]),
          2,
          1,
        );
        setTextureFromImageData("img-1", imageData);
        const canvas = getTexture("img-1");
        expect(canvas).toBeInstanceOf(HTMLCanvasElement);
        expect(canvas?.width).toBe(2);
        expect(canvas?.height).toBe(1);
        expect(putImageData).toHaveBeenCalledWith(imageData, 0, 0);
      } finally {
        HTMLCanvasElement.prototype.getContext = originalGetContext;
      }
    });

    it("2D コンテキストが取得できない環境では例外を投げる", () => {
      const originalGetContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = vi.fn(
        () => null,
      ) as unknown as typeof HTMLCanvasElement.prototype.getContext;
      try {
        const imageData = new ImageData(new Uint8ClampedArray(4), 1, 1);
        expect(() => setTextureFromImageData("img-err", imageData)).toThrow(
          /Canvas 2D context/,
        );
        expect(getTexture("img-err")).toBeUndefined();
      } finally {
        HTMLCanvasElement.prototype.getContext = originalGetContext;
      }
    });
  });

  describe("prepared history effects", () => {
    let pixelCanvas: ReturnType<typeof installRasterCanvas>["create"];
    beforeEach(() => {
      pixelCanvas = installRasterCanvas().create;
    });

    afterEach(() => vi.restoreAllMocks());

    it("redo restores owned pixels and dimensions after retained canvases are changed", () => {
      const oldCanvas = pixelCanvas(1, 1, 10);
      const preparedCanvas = pixelCanvas(2, 2, 20);
      const effect = replacementEffect("layer", oldCanvas, preparedCanvas);
      setTexture("layer", oldCanvas);
      applyTextureHistoryEffect(effect, "redo");
      const committedCanvas = getTexture("layer")!;
      expect(committedCanvas).not.toBe(preparedCanvas);
      applyTextureHistoryEffect(effect, "undo");
      expect(getTexture("layer")!.width).toBe(1);
      expect(hashTextureCanvas(getTexture("layer")!)).toBe(
        effect.redo.expectedCurrentHash.layer,
      );
      for (const canvas of [preparedCanvas, committedCanvas]) {
        canvas
          .getContext("2d")!
          .putImageData(new ImageData(new Uint8ClampedArray(16).fill(99), 2, 2), 0, 0);
      }
      applyTextureHistoryEffect(effect, "redo");
      expect(getTexture("layer")!.width).toBe(2);
      expect(getTexture("layer")!.height).toBe(2);
      expect(hashTextureCanvas(getTexture("layer")!)).toBe(
        effect.undo.expectedCurrentHash.layer,
      );
    });

    it("accepts snapshot-only promotions without retaining a decoded canvas", () => {
      const before = pixelCanvas(1, 1, 10);
      const after = pixelCanvas(2, 2, 20);
      const effect = replacementEffect("layer", before, after);
      const snapshot = effect.redo.promotedTextures[0]!.snapshot!;
      effect.redo.promotedTextures = [{ textureId: "layer", snapshot }];
      setTexture("layer", before);
      prepareTextureHistoryEffects([effect], "redo").commit();
      expect(hashTextureCanvas(getTexture("layer")!)).toBe(snapshot.hash);
      expect(getTexture("layer")).not.toBe(after);
      applyTextureHistoryEffect(effect, "undo");
      applyTextureHistoryEffect(effect, "redo");
      expect(getTexture("layer")!.width).toBe(2);
      promoteDraftTextures([{ textureId: "layer", snapshot }]);
      expect(hashTextureCanvas(getTexture("layer")!)).toBe(snapshot.hash);
    });

    it("rejects the same bytes reshaped to different dimensions without live writes", () => {
      const original = pixelCanvas(2, 1, 12);
      const effect = replacementEffect("layer", original, pixelCanvas(4, 2, 24));
      setTexture("layer", original);
      const revision = getTextureStoreRevision();
      original.width = 1;
      original.height = 2;
      original
        .getContext("2d")!
        .putImageData(new ImageData(new Uint8ClampedArray(8).fill(12), 1, 2), 0, 0);
      expect(hashTextureCanvas(original)).toBe(effect.redo.expectedCurrentHash.layer);
      expect(() => prepareTextureHistoryEffects([effect], "redo")).toThrow(/dimensions/);
      expect(getTexture("layer")).toBe(original);
      expect(getTextureStoreRevision()).toBe(revision);
    });

    it("checks later effects before changing any live texture", () => {
      const first = pixelCanvas(1, 1, 10);
      const second = pixelCanvas(1, 1, 20);
      const effects = [
        replacementEffect("first", first, pixelCanvas(2, 2, 30)),
        replacementEffect("second", second, pixelCanvas(2, 2, 40)),
      ];
      setTexture("first", first);
      setTexture("second", second);
      effects[1]!.redo.expectedCurrentHash.second = "conflict";
      const revision = getTextureStoreRevision();
      expect(() => prepareTextureHistoryEffects(effects, "redo")).toThrow(/changed/);
      expect(getTexture("first")).toBe(first);
      expect(getTexture("second")).toBe(second);
      expect(getTextureStoreRevision()).toBe(revision);
    });

    it("allocates all restored canvases before removing or replacing live entries", () => {
      const oldFirst = pixelCanvas(1, 1, 10);
      const oldSecond = pixelCanvas(1, 1, 20);
      const first = pixelCanvas(2, 2, 30);
      const second = pixelCanvas(2, 2, 40);
      const effects = [
        replacementEffect("first", oldFirst, first),
        replacementEffect("second", oldSecond, second),
      ];
      setTexture("first", first);
      setTexture("second", second);
      const revision = getTextureStoreRevision();
      const createElement = document.createElement.bind(document);
      vi.spyOn(document, "createElement")
        .mockImplementationOnce(createElement)
        .mockImplementationOnce(() => {
          throw new Error("late allocation failure");
        });
      expect(() => prepareTextureHistoryEffects(effects, "undo")).toThrow(/allocation/);
      expect(getTexture("first")).toBe(first);
      expect(getTexture("second")).toBe(second);
      expect(getTextureStoreRevision()).toBe(revision);
    });

    it("validates merged effects in undo/redo order against prepared intermediate pixels", () => {
      const before = pixelCanvas(1, 1, 10);
      const middle = pixelCanvas(2, 2, 20);
      const after = pixelCanvas(3, 3, 30);
      const effects = [
        replacementEffect("layer", before, middle),
        replacementEffect("layer", middle, after),
      ];
      setTexture("layer", after);
      prepareTextureHistoryEffects(effects, "undo").commit();
      expect(hashTextureCanvas(getTexture("layer")!)).toBe(hashTextureCanvas(before));
      prepareTextureHistoryEffects(effects, "redo").commit();
      expect(hashTextureCanvas(getTexture("layer")!)).toBe(hashTextureCanvas(after));
      expect(getTexture("layer")!.width).toBe(3);
    });

    it("rolls back a later promotion failure with original references and revision", () => {
      const first = pixelCanvas(1, 1, 10);
      const second = pixelCanvas(1, 1, 20);
      setTexture("first", first);
      setTexture("second", second);
      const revision = getTextureStoreRevision();
      const prepared = prepareTextureHistoryEffects(
        [
          replacementEffect("first", first, pixelCanvas(2, 2, 30)),
          replacementEffect("second", second, pixelCanvas(2, 2, 40)),
        ],
        "redo",
      );
      const map = getAllTextures() as Map<string, HTMLCanvasElement>;
      const originalSet = map.set.bind(map);
      let failed = false;
      vi.spyOn(map, "set").mockImplementation((id, canvas) => {
        if (id === "second" && !failed) {
          failed = true;
          throw new Error("late promotion failure");
        }
        return originalSet(id, canvas);
      });
      expect(() => prepared.commit()).toThrow(/promotion/);
      expect(getTexture("first")).toBe(first);
      expect(getTexture("second")).toBe(second);
      expect(getTextureStoreRevision()).toBe(revision);
    });

    it("keeps legacy canvas-only promotion and supports allocation-free rollback", () => {
      const canvas = pixelCanvas(1, 1, 10);
      const effect: TextureHistoryEffect = {
        kind: "texture",
        undo: {
          createdTextureIds: ["new"],
          restoredTextures: [],
          expectedCurrentHash: { new: hashTextureCanvas(canvas) },
        },
        redo: {
          promotedTextures: [{ textureId: "new", canvas }],
          expectedCurrentHash: { new: null },
        },
        rendererInvalidation: "projectStructureVersion",
      };
      const revision = getTextureStoreRevision();
      const prepared = prepareTextureHistoryEffects([effect], "redo");
      prepared.commit();
      expect(getTexture("new")).toBe(canvas);
      vi.spyOn(document, "createElement").mockImplementation(() => {
        throw new Error("no allocations allowed");
      });
      prepared.rollback();
      expect(getTexture("new")).toBeUndefined();
      expect(getTextureStoreRevision()).toBe(revision);
      applyTextureHistoryEffect(effect, "redo");
      applyTextureHistoryEffect(effect, "undo");
      expect(getTexture("new")).toBeUndefined();
    });
  });
});
