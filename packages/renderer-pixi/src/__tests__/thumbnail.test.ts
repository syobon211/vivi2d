import { afterEach, describe, expect, it, vi } from "vitest";
import {
  base64ToDataUrl,
  dataUrlToBase64,
  generateThumbnail,
  generateThumbnailBlob,
} from "../thumbnail";


function createMockCanvas(width = 100, height = 100) {
  const mockCtx = {
    clearRect: vi.fn(),
    drawImage: vi.fn(),
  };
  const canvas = {
    width,
    height,
    getContext: vi.fn(() => mockCtx),
    toDataURL: vi.fn(
      (mimeType?: string, _quality?: number) =>
        `data:${mimeType ?? "image/png"};base64,mockdata`,
    ),
    toBlob: vi.fn((cb: (b: Blob | null) => void, _mimeType?: string, _quality?: number) =>
      cb(new Blob(["test"])),
    ),
  };
  return { canvas, mockCtx };
}

function mockCreateElement(mockCanvas: ReturnType<typeof createMockCanvas>["canvas"]) {
  const originalCreateElement = document.createElement.bind(document);
  return vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    if (tag === "canvas") {
      return mockCanvas as unknown as HTMLCanvasElement;
    }
    return originalCreateElement(tag);
  });
}

describe("dataUrlToBase64", () => {
  it("Data URLからBase64部分を抽出する", () => {
    const dataUrl = "data:image/png;base64,abc123XYZ";
    expect(dataUrlToBase64(dataUrl)).toBe("abc123XYZ");
  });

  it("カンマを含まない文字列はそのまま返す", () => {
    const raw = "abc123XYZ";
    expect(dataUrlToBase64(raw)).toBe("abc123XYZ");
  });
});

describe("base64ToDataUrl", () => {
  it("デフォルトでpng形式のData URLを生成する", () => {
    const result = base64ToDataUrl("abc123");
    expect(result).toBe("data:image/png;base64,abc123");
  });

  it("jpeg形式のData URLを生成する", () => {
    const result = base64ToDataUrl("abc123", "jpeg");
    expect(result).toBe("data:image/jpeg;base64,abc123");
  });

  it("webp形式のData URLを生成する", () => {
    const result = base64ToDataUrl("abc123", "webp");
    expect(result).toBe("data:image/webp;base64,abc123");
  });
});

describe("generateThumbnail", () => {
  let createElementSpy: ReturnType<typeof vi.spyOn>;

  afterEach(() => {
    createElementSpy?.mockRestore();
  });

  it("Canvasコンテキストが取得できない場合は空文字列を返す", () => {
    const nullCtxCanvas = {
      width: 256,
      height: 256,
      getContext: vi.fn(() => null),
      toDataURL: vi.fn(),
      toBlob: vi.fn(),
    };
    createElementSpy = mockCreateElement(nullCtxCanvas as any);

    const source = createMockCanvas(100, 100);
    const result = generateThumbnail(source.canvas as unknown as HTMLCanvasElement);
    expect(result).toBe("");
  });

  it("デフォルトオプション(256x256, png, 0.85)でサムネイルを生成する", () => {
    const { canvas: thumbCanvas, mockCtx } = createMockCanvas(256, 256);
    createElementSpy = mockCreateElement(thumbCanvas);

    const source = createMockCanvas(400, 400);
    const result = generateThumbnail(source.canvas as unknown as HTMLCanvasElement);

    expect(thumbCanvas.width).toBe(256);
    expect(thumbCanvas.height).toBe(256);

    expect(mockCtx.clearRect).toHaveBeenCalledWith(0, 0, 256, 256);

    expect(mockCtx.drawImage).toHaveBeenCalledTimes(1);
    const drawArgs = mockCtx.drawImage.mock.calls[0]!;
    expect(drawArgs[0]).toBe(source.canvas);

    expect(thumbCanvas.toDataURL).toHaveBeenCalledWith("image/png", 0.85);

    expect(result).toContain("data:image/png;base64,");
  });

  it("カスタムオプション(128x128, jpeg, 0.5)でサムネイルを生成する", () => {
    const { canvas: thumbCanvas, mockCtx } = createMockCanvas(128, 128);
    createElementSpy = mockCreateElement(thumbCanvas);

    const source = createMockCanvas(200, 200);
    const result = generateThumbnail(source.canvas as unknown as HTMLCanvasElement, {
      width: 128,
      height: 128,
      format: "jpeg",
      quality: 0.5,
    });

    expect(thumbCanvas.width).toBe(128);
    expect(thumbCanvas.height).toBe(128);

    expect(mockCtx.clearRect).toHaveBeenCalledWith(0, 0, 128, 128);

    expect(thumbCanvas.toDataURL).toHaveBeenCalledWith("image/jpeg", 0.5);

    expect(result).toContain("data:image/jpeg;base64,");
  });

  it("非正方形ソース(400x800)をアスペクト比保持でフィットさせる", () => {
    const { canvas: thumbCanvas, mockCtx } = createMockCanvas(256, 256);
    createElementSpy = mockCreateElement(thumbCanvas);

    const source = createMockCanvas(400, 800);
    generateThumbnail(source.canvas as unknown as HTMLCanvasElement);

    // scale = min(256/400, 256/800) = min(0.64, 0.32) = 0.32
    // drawW = 400 * 0.32 = 128
    // drawH = 800 * 0.32 = 256
    // offsetX = (256 - 128) / 2 = 64
    // offsetY = (256 - 256) / 2 = 0
    const drawArgs = mockCtx.drawImage.mock.calls[0]!;
    expect(drawArgs[1]).toBeCloseTo(64); // offsetX
    expect(drawArgs[2]).toBeCloseTo(0); // offsetY
    expect(drawArgs[3]).toBeCloseTo(128); // drawW
    expect(drawArgs[4]).toBeCloseTo(256); // drawH
  });

  it("横長ソース(800x400)をアスペクト比保持でフィットさせる", () => {
    const { canvas: thumbCanvas, mockCtx } = createMockCanvas(256, 256);
    createElementSpy = mockCreateElement(thumbCanvas);

    const source = createMockCanvas(800, 400);
    generateThumbnail(source.canvas as unknown as HTMLCanvasElement);

    // scale = min(256/800, 256/400) = min(0.32, 0.64) = 0.32
    // drawW = 800 * 0.32 = 256
    // drawH = 400 * 0.32 = 128
    // offsetX = (256 - 256) / 2 = 0
    // offsetY = (256 - 128) / 2 = 64
    const drawArgs = mockCtx.drawImage.mock.calls[0]!;
    expect(drawArgs[1]).toBeCloseTo(0); // offsetX
    expect(drawArgs[2]).toBeCloseTo(64); // offsetY
    expect(drawArgs[3]).toBeCloseTo(256); // drawW
    expect(drawArgs[4]).toBeCloseTo(128); // drawH
  });
});

describe("generateThumbnailBlob", () => {
  let createElementSpy: ReturnType<typeof vi.spyOn>;

  afterEach(() => {
    createElementSpy?.mockRestore();
  });

  it("Promiseを返す", () => {
    const { canvas: thumbCanvas } = createMockCanvas(256, 256);
    createElementSpy = mockCreateElement(thumbCanvas);

    const source = createMockCanvas(100, 100);
    const result = generateThumbnailBlob(source.canvas as unknown as HTMLCanvasElement);

    expect(result).toBeInstanceOf(Promise);
  });

  it("Blobを正常に生成する", async () => {
    const { canvas: thumbCanvas, mockCtx } = createMockCanvas(256, 256);
    createElementSpy = mockCreateElement(thumbCanvas);

    const source = createMockCanvas(100, 100);
    const blob = await generateThumbnailBlob(
      source.canvas as unknown as HTMLCanvasElement,
    );

    expect(blob).toBeInstanceOf(Blob);
    expect(mockCtx.clearRect).toHaveBeenCalled();
    expect(mockCtx.drawImage).toHaveBeenCalled();
    expect(thumbCanvas.toBlob).toHaveBeenCalled();
  });

  it("Canvasコンテキストが取得できない場合はnullを返す", async () => {
    const nullCtxCanvas = {
      width: 256,
      height: 256,
      getContext: vi.fn(() => null),
      toDataURL: vi.fn(),
      toBlob: vi.fn(),
    };
    createElementSpy = mockCreateElement(nullCtxCanvas as any);

    const source = createMockCanvas(100, 100);
    const result = await generateThumbnailBlob(
      source.canvas as unknown as HTMLCanvasElement,
    );
    expect(result).toBeNull();
  });

  it("カスタムオプションでBlobを生成する", async () => {
    const { canvas: thumbCanvas, mockCtx } = createMockCanvas(128, 128);
    createElementSpy = mockCreateElement(thumbCanvas);

    const source = createMockCanvas(200, 200);
    const blob = await generateThumbnailBlob(
      source.canvas as unknown as HTMLCanvasElement,
      { width: 128, height: 128, format: "webp", quality: 0.7 },
    );

    expect(blob).toBeInstanceOf(Blob);
    expect(thumbCanvas.width).toBe(128);
    expect(thumbCanvas.height).toBe(128);
    expect(mockCtx.clearRect).toHaveBeenCalledWith(0, 0, 128, 128);
  });

  it("非正方形ソースでもアスペクト比を保持してBlobを生成する", async () => {
    const { canvas: thumbCanvas, mockCtx } = createMockCanvas(256, 256);
    createElementSpy = mockCreateElement(thumbCanvas);

    const source = createMockCanvas(300, 600);
    await generateThumbnailBlob(source.canvas as unknown as HTMLCanvasElement);

    // scale = min(256/300, 256/600) = 0.4266...
    const drawArgs = mockCtx.drawImage.mock.calls[0]!;
    expect(drawArgs[3]).toBeCloseTo(128); // drawW
    expect(drawArgs[4]).toBeCloseTo(256); // drawH
  });
});
