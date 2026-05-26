import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearTextures,
  getAllTextureIds,
  getAllTextures,
  getTexture,
  setTexture,
  setTextureFromImageData,
} from "@/lib/texture-store";

describe("texture-store", () => {
  afterEach(() => {
    clearTextures();
  });

  it("テクスチャを保存・取得できる", () => {
    const canvas = document.createElement("canvas");
    setTexture("layer-1", canvas);
    expect(getTexture("layer-1")).toBe(canvas);
  });

  it("存在しないIDに対してundefinedを返す", () => {
    expect(getTexture("nonexistent")).toBeUndefined();
  });

  it("同じIDに対して上書きできる", () => {
    const canvas1 = document.createElement("canvas");
    const canvas2 = document.createElement("canvas");

    setTexture("layer-1", canvas1);
    setTexture("layer-1", canvas2);

    expect(getTexture("layer-1")).toBe(canvas2);
  });

  it("複数のテクスチャを独立して管理できる", () => {
    const canvas1 = document.createElement("canvas");
    const canvas2 = document.createElement("canvas");

    setTexture("a", canvas1);
    setTexture("b", canvas2);

    expect(getTexture("a")).toBe(canvas1);
    expect(getTexture("b")).toBe(canvas2);
  });

  it("clearTextures で全テクスチャを削除できる", () => {
    setTexture("a", document.createElement("canvas"));
    setTexture("b", document.createElement("canvas"));

    clearTextures();

    expect(getTexture("a")).toBeUndefined();
    expect(getTexture("b")).toBeUndefined();
    expect(getAllTextureIds()).toEqual([]);
  });

  it("getAllTextureIds で全IDを取得できる", () => {
    setTexture("x", document.createElement("canvas"));
    setTexture("y", document.createElement("canvas"));
    setTexture("z", document.createElement("canvas"));

    const ids = getAllTextureIds();
    expect(ids).toHaveLength(3);
    expect(ids).toContain("x");
    expect(ids).toContain("y");
    expect(ids).toContain("z");
  });

  it("getAllTextures で全テクスチャの ReadonlyMap を取得できる", () => {
    const canvasA = document.createElement("canvas");
    const canvasB = document.createElement("canvas");
    setTexture("a", canvasA);
    setTexture("b", canvasB);

    const map = getAllTextures();
    expect(map.size).toBe(2);
    expect(map.get("a")).toBe(canvasA);
    expect(map.get("b")).toBe(canvasB);
  });

  it("getAllTextures はテクスチャ未登録時に空の Map を返す", () => {
    const map = getAllTextures();
    expect(map.size).toBe(0);
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
});
