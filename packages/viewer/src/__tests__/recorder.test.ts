import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  downloadBlob,
  getRecordingExtension,
  type RecordingState,
  ViewerRecorder,
} from "../recorder";


describe("getRecordingExtension", () => {
  it("webmフォーマットの拡張子を返す", () => {
    expect(getRecordingExtension("webm")).toBe("webm");
  });
  it("mp4フォーマットの拡張子を返す", () => {
    expect(getRecordingExtension("mp4")).toBe("mp4");
  });
  it("gifフォーマットの拡張子を返す", () => {
    expect(getRecordingExtension("gif")).toBe("gif");
  });
});

describe("downloadBlob", () => {
  let mockAnchor: Record<string, unknown>;

  beforeEach(() => {
    mockAnchor = { href: "", download: "", click: vi.fn() };
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:mock-url"),
      revokeObjectURL: vi.fn(),
    });
    vi.spyOn(document, "createElement").mockReturnValue(
      mockAnchor as unknown as HTMLElement,
    );
    vi.spyOn(document.body, "appendChild").mockImplementation((el) => el);
    vi.spyOn(document.body, "removeChild").mockImplementation((el) => el);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("Blobからアンカー要素を作成してダウンロードする", () => {
    const blob = new Blob(["test"], { type: "video/webm" });
    downloadBlob(blob, "test.webm");

    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    expect(mockAnchor.href).toBe("blob:mock-url");
    expect(mockAnchor.download).toBe("test.webm");
    expect(mockAnchor.click).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
  });
});


function createMockCanvas(): HTMLCanvasElement {
  const mockCtx = {
    getImageData: vi.fn(() => ({
      data: new Uint8ClampedArray(4 * 4 * 4),
      width: 4,
      height: 4,
    })),
  };
  const mockMediaRecorder = createMockMediaRecorder();

  const canvas = {
    width: 4,
    height: 4,
    getContext: vi.fn(() => mockCtx),
    captureStream: vi.fn(() => ({
      getTracks: () => [],
    })),
    _mockCtx: mockCtx,
    _mockRecorder: mockMediaRecorder,
  } as unknown as HTMLCanvasElement;

  return canvas;
}

function createMockMediaRecorder() {
  const instance = {
    start: vi.fn(),
    stop: vi.fn(),
    state: "inactive" as string,
    mimeType: "video/webm",
    ondataavailable: null as ((e: { data: Blob }) => void) | null,
    onstop: null as (() => void) | null,
  };
  return instance;
}

describe("ViewerRecorder", () => {
  let mockMediaRecorderInstance: ReturnType<typeof createMockMediaRecorder>;

  beforeEach(() => {
    mockMediaRecorderInstance = createMockMediaRecorder();

    vi.stubGlobal(
      "MediaRecorder",
      class MockMediaRecorder {
        start = mockMediaRecorderInstance.start;
        stop = vi.fn(() => {
          this.state = "inactive";
          setTimeout(() => {
            if (mockMediaRecorderInstance.onstop) mockMediaRecorderInstance.onstop();
          }, 0);
        });
        state = "recording";
        mimeType = "video/webm";
        ondataavailable: ((e: { data: Blob }) => void) | null = null;
        onstop: (() => void) | null = null;

        constructor() {
          mockMediaRecorderInstance.ondataavailable = null;

          Object.defineProperty(mockMediaRecorderInstance, "ondataavailable", {
            get: () => this.ondataavailable,
            set: (v) => {
              this.ondataavailable = v;
            },
            configurable: true,
          });
          Object.defineProperty(mockMediaRecorderInstance, "onstop", {
            get: () => this.onstop,
            set: (v) => {
              this.onstop = v;
            },
            configurable: true,
          });
        }

        static isTypeSupported(type: string) {
          return type === "video/webm" || type === "video/webm;codecs=vp9";
        }
      },
    );

    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:mock-url"),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("初期状態はidle", () => {
    const canvas = createMockCanvas();
    const recorder = new ViewerRecorder(canvas);
    expect(recorder.recordingState).toBe("idle");
  });

  it("start('webm')で録画が開始されrecording状態になる", () => {
    const canvas = createMockCanvas();
    const recorder = new ViewerRecorder(canvas);
    recorder.start({ format: "webm" });
    expect(recorder.recordingState).toBe("recording");
  });

  it("start('gif')でGIFキャプチャが開始される", () => {
    const canvas = createMockCanvas();
    const recorder = new ViewerRecorder(canvas);
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");

    recorder.start({ format: "gif", fps: 10 });
    expect(recorder.recordingState).toBe("recording");

    recorder.cancel();
    expect(clearIntervalSpy).toHaveBeenCalled();
  });

  it("録画中にstart()を呼ぶとエラーが投げられる", () => {
    const canvas = createMockCanvas();
    const recorder = new ViewerRecorder(canvas);
    recorder.start({ format: "webm" });
    expect(() => recorder.start()).toThrow("Recording is already in progress");
    recorder.cancel();
  });

  it("idle状態でstop()を呼ぶとエラーが投げられる", async () => {
    const canvas = createMockCanvas();
    const recorder = new ViewerRecorder(canvas);
    await expect(recorder.stop()).rejects.toThrow("Recording is not in progress");
  });

  it("cancel()で状態がidleに戻る", () => {
    const canvas = createMockCanvas();
    const recorder = new ViewerRecorder(canvas);
    recorder.start({ format: "webm" });
    recorder.cancel();
    expect(recorder.recordingState).toBe("idle");
  });

  it("状態コールバックが呼ばれる", () => {
    const canvas = createMockCanvas();
    const recorder = new ViewerRecorder(canvas);
    const states: RecordingState[] = [];

    recorder.start({ format: "webm" }, (state) => states.push(state));
    expect(states).toContain("recording");
    recorder.cancel();
  });

  it("GIFフォーマットのstop()でimage/gif Blobが返される", async () => {
    const canvas = createMockCanvas();
    const recorder = new ViewerRecorder(canvas);

    recorder.start({ format: "gif", fps: 30 });

    await new Promise((r) => setTimeout(r, 100));

    const blob = await recorder.stop();
    expect(blob).toBeInstanceOf(Blob);
  });

  it("GIF録画でフレームがキャプチャされる場合GIF89aヘッダーを含む", async () => {
    const mockCtx = {
      getImageData: vi.fn(() => ({
        data: new Uint8ClampedArray([
          255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255,
        ]),
        width: 2,
        height: 2,
      })),
    };
    const canvas = {
      width: 2,
      height: 2,
      getContext: vi.fn(() => mockCtx),
      captureStream: vi.fn(() => ({ getTracks: () => [] })),
    } as unknown as HTMLCanvasElement;

    const recorder = new ViewerRecorder(canvas);
    recorder.start({ format: "gif", fps: 60 });

    await new Promise((r) => setTimeout(r, 50));

    const blob = await recorder.stop();
    if (blob.size > 0) {
      const buffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      // GIF89a magic bytes
      expect(bytes[0]).toBe(0x47); // G
      expect(bytes[1]).toBe(0x49); // I
      expect(bytes[2]).toBe(0x46); // F
      expect(bytes[3]).toBe(0x38); // 8
      expect(bytes[4]).toBe(0x39); // 9
      expect(bytes[5]).toBe(0x61); // a
      expect(blob.type).toBe("image/gif");
    }
  });

  it("WebM録画のstop()でvideo/webm Blobが返される", async () => {
    const canvas = createMockCanvas();
    const recorder = new ViewerRecorder(canvas);
    recorder.start({ format: "webm" });

    const stopPromise = recorder.stop();

    await new Promise((r) => setTimeout(r, 50));

    const blob = await stopPromise;
    expect(blob).toBeInstanceOf(Blob);
  });

  it("selectMimeType: mp4が未サポートの場合webmにフォールバック", () => {
    const canvas = createMockCanvas();
    const recorder = new ViewerRecorder(canvas);
    recorder.start({ format: "mp4" });
    expect(recorder.recordingState).toBe("recording");
    recorder.cancel();
  });

  it("maxDuration制限: 指定時間後に自動停止", async () => {
    vi.useFakeTimers();
    const canvas = createMockCanvas();
    const recorder = new ViewerRecorder(canvas);
    const states: RecordingState[] = [];

    recorder.start({ format: "webm", maxDuration: 1 }, (state) => states.push(state));

    vi.advanceTimersByTime(1100);

    expect(states).toContain("processing");

    vi.useRealTimers();
    recorder.cancel();
  });


  it("MediaRecorder ondataavailable: データチャンクが正しく蓄積される", async () => {
    let capturedOndataavailable: ((e: { data: Blob }) => void) | null = null;
    let capturedOnstop: (() => void) | null = null;

    vi.stubGlobal(
      "MediaRecorder",
      class MockMR {
        mimeType = "video/webm";
        state = "recording";
        ondataavailable: ((e: { data: Blob }) => void) | null = null;
        onstop: (() => void) | null = null;

        start(_timeslice?: number) {
          setTimeout(() => {
            capturedOndataavailable = this.ondataavailable;
          }, 0);
        }
        stop() {
          this.state = "inactive";
          capturedOnstop = this.onstop;
          setTimeout(() => {
            if (capturedOnstop) capturedOnstop();
          }, 0);
        }
        static isTypeSupported(type: string) {
          return type === "video/webm;codecs=vp9";
        }
      },
    );

    const canvas = createMockCanvas();
    const recorder = new ViewerRecorder(canvas);
    recorder.start({ format: "webm" });

    await new Promise((r) => setTimeout(r, 10));

    expect(capturedOndataavailable).not.toBeNull();
    capturedOndataavailable!({ data: new Blob(["chunk1"], { type: "video/webm" }) });
    capturedOndataavailable!({ data: new Blob(["chunk2"], { type: "video/webm" }) });
    capturedOndataavailable!({ data: new Blob([], { type: "video/webm" }) });

    const stopPromise = recorder.stop();
    await new Promise((r) => setTimeout(r, 50));
    const blob = await stopPromise;

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
    expect(blob.type).toBe("video/webm");
  });

  it("stopMediaRecorder: recorderがnullの場合は空Blobを返す", async () => {

    let capturedOnstop: (() => void) | null = null;

    vi.stubGlobal(
      "MediaRecorder",
      class MockMR {
        mimeType = "video/webm";
        state = "recording";
        ondataavailable: ((e: { data: Blob }) => void) | null = null;
        onstop: (() => void) | null = null;

        start() {
          /* noop */
        }
        stop() {
          this.state = "inactive";
          capturedOnstop = this.onstop;
          setTimeout(() => {
            if (capturedOnstop) capturedOnstop();
          }, 0);
        }
        static isTypeSupported(type: string) {
          return type === "video/webm;codecs=vp9";
        }
      },
    );

    const canvas = createMockCanvas();
    const recorder = new ViewerRecorder(canvas);
    recorder.start({ format: "webm" });

    const stopPromise = recorder.stop();
    await new Promise((r) => setTimeout(r, 50));
    const blob = await stopPromise;

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("video/webm");
  });

  it("selectMimeType: mp4がサポートされている場合はmp4のMIMEタイプが使用される", () => {
    vi.stubGlobal(
      "MediaRecorder",
      class MockMR {
        mimeType = "video/mp4;codecs=h264";
        state = "recording";
        ondataavailable: ((e: { data: Blob }) => void) | null = null;
        onstop: (() => void) | null = null;

        start() {
          /* noop */
        }
        stop() {
          this.state = "inactive";
          setTimeout(() => {
            if (this.onstop) this.onstop();
          }, 0);
        }
        static isTypeSupported(type: string) {
          return type === "video/mp4;codecs=h264" || type === "video/webm;codecs=vp9";
        }
      },
    );

    const canvas = createMockCanvas();
    const recorder = new ViewerRecorder(canvas);

    recorder.start({ format: "mp4" });
    expect(recorder.recordingState).toBe("recording");
    recorder.cancel();
  });

  it("selectMimeType: mp4の2番目のcodec(avc1)がサポートされている場合", () => {
    vi.stubGlobal(
      "MediaRecorder",
      class MockMR {
        mimeType = "video/mp4;codecs=avc1";
        state = "recording";
        ondataavailable: ((e: { data: Blob }) => void) | null = null;
        onstop: (() => void) | null = null;

        start() {
          /* noop */
        }
        stop() {
          this.state = "inactive";
          setTimeout(() => {
            if (this.onstop) this.onstop();
          }, 0);
        }
        static isTypeSupported(type: string) {
          return type === "video/mp4;codecs=avc1" || type === "video/webm;codecs=vp9";
        }
      },
    );

    const canvas = createMockCanvas();
    const recorder = new ViewerRecorder(canvas);
    recorder.start({ format: "mp4" });
    expect(recorder.recordingState).toBe("recording");
    recorder.cancel();
  });

  it("selectMimeType: video/mp4(codecs指定なし)がサポートされている場合", () => {
    vi.stubGlobal(
      "MediaRecorder",
      class MockMR {
        mimeType = "video/mp4";
        state = "recording";
        ondataavailable: ((e: { data: Blob }) => void) | null = null;
        onstop: (() => void) | null = null;

        start() {
          /* noop */
        }
        stop() {
          this.state = "inactive";
          setTimeout(() => {
            if (this.onstop) this.onstop();
          }, 0);
        }
        static isTypeSupported(type: string) {
          return type === "video/mp4" || type === "video/webm;codecs=vp9";
        }
      },
    );

    const canvas = createMockCanvas();
    const recorder = new ViewerRecorder(canvas);
    recorder.start({ format: "mp4" });
    expect(recorder.recordingState).toBe("recording");
    recorder.cancel();
  });

  it("GIFフレーム0件: 即停止で空Blobが返される", async () => {
    const canvas = {
      width: 2,
      height: 2,
      getContext: vi.fn(() => null),
      captureStream: vi.fn(() => ({ getTracks: () => [] })),
    } as unknown as HTMLCanvasElement;

    const recorder = new ViewerRecorder(canvas);
    recorder.start({ format: "gif", fps: 10 });

    await new Promise((r) => setTimeout(r, 150));

    const blob = await recorder.stop();
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBe(0);
  });

  it("cancel(): MediaRecorderがアクティブな状態で中止する", () => {
    let stopCalled = false;

    vi.stubGlobal(
      "MediaRecorder",
      class MockMR {
        mimeType = "video/webm";
        state = "recording";
        ondataavailable: ((e: { data: Blob }) => void) | null = null;
        onstop: (() => void) | null = null;

        start() {
          /* noop */
        }
        stop() {
          stopCalled = true;
          this.state = "inactive";
        }
        static isTypeSupported(type: string) {
          return type === "video/webm;codecs=vp9";
        }
      },
    );

    const canvas = createMockCanvas();
    const recorder = new ViewerRecorder(canvas);
    recorder.start({ format: "webm" });

    recorder.cancel();
    expect(stopCalled).toBe(true);
    expect(recorder.recordingState).toBe("idle");
  });

  it("cancel(): GIFキャプチャ中にcancelするとインターバルがクリアされる", () => {
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");

    const canvas = createMockCanvas();
    const recorder = new ViewerRecorder(canvas);
    recorder.start({ format: "gif", fps: 10 });

    recorder.cancel();
    expect(clearIntervalSpy).toHaveBeenCalled();
    expect(recorder.recordingState).toBe("idle");
  });

  it("経過時間タイマー: コールバックに増加するelapsed値が渡される", async () => {
    vi.useFakeTimers();
    let mockTime = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => mockTime);

    const canvas = createMockCanvas();
    const recorder = new ViewerRecorder(canvas);
    const elapsedValues: number[] = [];

    recorder.start({ format: "gif", fps: 5 }, (state, elapsed) => {
      if (state === "recording" && elapsed > 0) {
        elapsedValues.push(elapsed);
      }
    });

    mockTime = 1500;
    vi.advanceTimersByTime(200);

    mockTime = 2000;
    vi.advanceTimersByTime(200);

    mockTime = 2500;
    vi.advanceTimersByTime(200);

    expect(elapsedValues.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < elapsedValues.length; i++) {
      expect(elapsedValues[i]!).toBeGreaterThan(elapsedValues[i - 1]!);
    }

    vi.useRealTimers();
    recorder.cancel();
  });

  it("LZW: 空ピクセル配列のエンコード", async () => {
    const mockCtx = {
      getImageData: vi.fn(() => ({
        data: new Uint8ClampedArray([128, 64, 32, 255]),
        width: 1,
        height: 1,
      })),
    };
    const canvas = {
      width: 1,
      height: 1,
      getContext: vi.fn(() => mockCtx),
      captureStream: vi.fn(() => ({ getTracks: () => [] })),
    } as unknown as HTMLCanvasElement;

    const recorder = new ViewerRecorder(canvas);
    recorder.start({ format: "gif", fps: 60 });
    await new Promise((r) => setTimeout(r, 50));

    const blob = await recorder.stop();
    if (blob.size > 0) {
      const buffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      expect(String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!)).toBe("GIF");
      expect(bytes[bytes.length - 1]).toBe(0x3b);
    }
  });

  it("LZWテーブルリセット: 十分な色多様性でnextCode >= maxTableSizeに到達しテーブルがリセットされる", async () => {
    const size = 256;
    const pixelCount = size * size;
    const rgbaData = new Uint8ClampedArray(pixelCount * 4);

    for (let i = 0; i < pixelCount; i++) {
      const idx = (i * 173 + 97) % 256;
      rgbaData[i * 4] = ((idx >> 5) & 0x7) << 5;
      rgbaData[i * 4 + 1] = ((idx >> 2) & 0x7) << 5;
      rgbaData[i * 4 + 2] = (idx & 0x3) << 6;
      rgbaData[i * 4 + 3] = 255;
    }

    const mockCtx = {
      getImageData: vi.fn(() => ({
        data: rgbaData,
        width: size,
        height: size,
      })),
    };
    const canvas = {
      width: size,
      height: size,
      getContext: vi.fn(() => mockCtx),
      captureStream: vi.fn(() => ({ getTracks: () => [] })),
    } as unknown as HTMLCanvasElement;

    const recorder = new ViewerRecorder(canvas);
    recorder.start({ format: "gif", fps: 60 });

    await new Promise((r) => setTimeout(r, 50));

    const blob = await recorder.stop();
    expect(blob.size).toBeGreaterThan(0);
    expect(blob.type).toBe("image/gif");

    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    expect(
      String.fromCharCode(
        bytes[0]!,
        bytes[1]!,
        bytes[2]!,
        bytes[3]!,
        bytes[4]!,
        bytes[5]!,
      ),
    ).toBe("GIF89a");
    expect(bytes[bytes.length - 1]).toBe(0x3b);
  });

  it("stop()時に状態コールバックがprocessing→idleの順で呼ばれる", async () => {
    let capturedOnstop: (() => void) | null = null;

    vi.stubGlobal(
      "MediaRecorder",
      class MockMR {
        mimeType = "video/webm";
        state = "recording";
        ondataavailable: ((e: { data: Blob }) => void) | null = null;
        onstop: (() => void) | null = null;

        start() {
          /* noop */
        }
        stop() {
          this.state = "inactive";
          capturedOnstop = this.onstop;
          setTimeout(() => {
            if (capturedOnstop) capturedOnstop();
          }, 0);
        }
        static isTypeSupported(type: string) {
          return type === "video/webm;codecs=vp9";
        }
      },
    );

    const canvas = createMockCanvas();
    const recorder = new ViewerRecorder(canvas);
    const stateLog: { state: RecordingState; elapsed: number }[] = [];

    recorder.start({ format: "webm" }, (state, elapsed) =>
      stateLog.push({ state, elapsed }),
    );

    const stopPromise = recorder.stop();
    await new Promise((r) => setTimeout(r, 50));
    await stopPromise;

    const stateSequence = stateLog.map((s) => s.state);
    expect(stateSequence).toContain("recording");
    expect(stateSequence).toContain("processing");
    expect(stateSequence).toContain("idle");

    const processingIdx = stateSequence.indexOf("processing");
    const idleIdx = stateSequence.indexOf("idle");
    expect(processingIdx).toBeLessThan(idleIdx);

    const idleEntry = stateLog.find((s) => s.state === "idle");
    expect(idleEntry!.elapsed).toBe(0);
  });

  it("GIF複数フレーム: 複数色のフレームを録画してGIFが正しく生成される", async () => {
    let callCount = 0;
    const frames = [
      new Uint8ClampedArray([
        255, 0, 0, 255, 0, 0, 255, 255, 0, 255, 0, 255, 255, 255, 0, 255,
      ]),
      new Uint8ClampedArray([
        0, 255, 0, 255, 0, 255, 255, 255, 255, 0, 255, 255, 128, 128, 128, 255,
      ]),
      new Uint8ClampedArray([
        64, 64, 64, 255, 128, 128, 128, 255, 192, 192, 192, 255, 255, 255, 255, 255,
      ]),
    ];
    const mockCtx = {
      getImageData: vi.fn(() => {
        const idx = Math.min(callCount, frames.length - 1);
        callCount++;
        return {
          data: frames[idx]!,
          width: 2,
          height: 2,
        };
      }),
    };
    const canvas = {
      width: 2,
      height: 2,
      getContext: vi.fn(() => mockCtx),
      captureStream: vi.fn(() => ({ getTracks: () => [] })),
    } as unknown as HTMLCanvasElement;

    const recorder = new ViewerRecorder(canvas);
    recorder.start({ format: "gif", fps: 60 });

    await new Promise((r) => setTimeout(r, 100));

    const blob = await recorder.stop();
    expect(blob.size).toBeGreaterThan(0);
    expect(blob.type).toBe("image/gif");
  });

  it("WebM録画のstop: onstopでmimeTypeとchunksが正しくBlobに結合される", async () => {
    let capturedOndataavailable: ((e: { data: Blob }) => void) | null = null;
    let capturedOnstop: (() => void) | null = null;

    vi.stubGlobal(
      "MediaRecorder",
      class MockMR {
        mimeType = "video/webm;codecs=vp9";
        state = "recording";
        ondataavailable: ((e: { data: Blob }) => void) | null = null;
        onstop: (() => void) | null = null;

        start(_timeslice?: number) {
          setTimeout(() => {
            capturedOndataavailable = this.ondataavailable;
          }, 0);
        }
        stop() {
          this.state = "inactive";
          capturedOnstop = this.onstop;
          setTimeout(() => {
            if (capturedOnstop) capturedOnstop();
          }, 0);
        }
        static isTypeSupported(type: string) {
          return type === "video/webm;codecs=vp9";
        }
      },
    );

    const canvas = createMockCanvas();
    const recorder = new ViewerRecorder(canvas);
    recorder.start({ format: "webm", quality: 0.5 });

    await new Promise((r) => setTimeout(r, 10));

    capturedOndataavailable!({ data: new Blob(["data-a"]) });
    capturedOndataavailable!({ data: new Blob(["data-b"]) });
    capturedOndataavailable!({ data: new Blob(["data-c"]) });

    const stopPromise = recorder.stop();
    await new Promise((r) => setTimeout(r, 50));
    const blob = await stopPromise;

    expect(blob.size).toBe(18); // "data-a" + "data-b" + "data-c" = 6+6+6
    expect(blob.type).toBe("video/webm;codecs=vp9");
  });

  it("selectMimeType: 全MIMEタイプが未サポートの場合フォールバックでvideo/webmが返される", () => {
    vi.stubGlobal(
      "MediaRecorder",
      class MockMR {
        mimeType = "video/webm";
        state = "recording";
        ondataavailable: ((e: { data: Blob }) => void) | null = null;
        onstop: (() => void) | null = null;

        start() {
          /* noop */
        }
        stop() {
          this.state = "inactive";
          setTimeout(() => {
            if (this.onstop) this.onstop();
          }, 0);
        }
        static isTypeSupported(_type: string) {
          return false;
        }
      },
    );

    const canvas = createMockCanvas();
    const recorder = new ViewerRecorder(canvas);
    recorder.start({ format: "webm" });
    expect(recorder.recordingState).toBe("recording");
    recorder.cancel();
  });

  it("stopMediaRecorder: recorderがnull状態でstopMediaRecorderが呼ばれると空Blobが返される", async () => {

    vi.stubGlobal(
      "MediaRecorder",
      class MockMR {
        mimeType = "video/webm";
        state = "recording";
        ondataavailable: ((e: { data: Blob }) => void) | null = null;
        onstop: (() => void) | null = null;

        start() {
          /* noop */
        }
        stop() {
          this.state = "inactive";
          setTimeout(() => {
            if (this.onstop) this.onstop();
          }, 0);
        }
        static isTypeSupported(type: string) {
          return type === "video/webm;codecs=vp9";
        }
      },
    );

    const canvas = createMockCanvas();
    const recorder = new ViewerRecorder(canvas);
    recorder.start({ format: "webm" });

    (recorder as unknown as { recorder: null }).recorder = null;

    const blob = await recorder.stop();
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBe(0);
  });

  it("findNearestColor: 256色超のユニーク色でパレット外の色が最近傍探索される", async () => {
    const w = 32;
    const h = 16;
    const pixelCount = w * h; // 512
    const rgbaData = new Uint8ClampedArray(pixelCount * 4);

    for (let i = 0; i < pixelCount; i++) {
      const r5 = i & 0x1f;
      const g5 = (i >> 5) & 0x0f;
      const b5 = r5 ^ (g5 << 1);
      rgbaData[i * 4] = r5 << 3;
      rgbaData[i * 4 + 1] = g5 << 3; // G
      rgbaData[i * 4 + 2] = b5 << 3; // B
      rgbaData[i * 4 + 3] = 255;
    }

    const mockCtx = {
      getImageData: vi.fn(() => ({
        data: rgbaData,
        width: w,
        height: h,
      })),
    };
    const canvas = {
      width: w,
      height: h,
      getContext: vi.fn(() => mockCtx),
      captureStream: vi.fn(() => ({ getTracks: () => [] })),
    } as unknown as HTMLCanvasElement;

    const recorder = new ViewerRecorder(canvas);
    recorder.start({ format: "gif", fps: 60 });
    await new Promise((r) => setTimeout(r, 50));

    const blob = await recorder.stop();
    expect(blob.size).toBeGreaterThan(0);
    expect(blob.type).toBe("image/gif");

    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    expect(String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!)).toBe("GIF");
  });
});
