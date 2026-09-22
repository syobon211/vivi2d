import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exportMp4, exportPngSequence } from "@/lib/export/media-exporter";
import { createAnimationClip, createEmptyProject } from "@/test/fixtures";

function createProjectWithClip(duration = 2) {
  return {
    ...createEmptyProject(),
    parameters: [
      { id: "param-1", name: "Param 1", minValue: 0, maxValue: 1, defaultValue: 0 },
    ],
    clips: [
      createAnimationClip({
        id: "clip-1",
        name: "Clip",
        duration,
        fps: 1_000,
        tracks: [
          {
            parameterId: "param-1",
            keyframes: [
              { frame: 0, value: 0, interpolation: "linear" },
              { frame: duration - 1, value: 1, interpolation: "linear" },
            ],
          },
        ],
      }),
    ],
  };
}

function createBlobCanvas(track = { requestFrame: vi.fn(), stop: vi.fn() }) {
  return {
    width: 64,
    height: 65,
    toBlob: vi.fn((callback: BlobCallback) => {
      callback(new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }));
    }),
    captureStream: vi.fn(() => ({
      getVideoTracks: () => [track],
      getTracks: () => [track],
    })),
  } as unknown as HTMLCanvasElement;
}

function mockCaptureCanvas(track: Parameters<typeof createBlobCanvas>[0]) {
  const canvas = createBlobCanvas(track);
  const context = { drawImage: vi.fn(), globalCompositeOperation: "source-over" };
  Object.assign(canvas, { getContext: () => context });
  vi.spyOn(document, "createElement").mockReturnValue(canvas);
  return { canvas, context };
}

describe("media exporter", () => {
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  const originalMediaRecorder = globalThis.MediaRecorder;

  beforeEach(() => {
    (globalThis as any).requestAnimationFrame = (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    };
    window.electronAPI.writeExportFiles = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    (globalThis as any).requestAnimationFrame = originalRequestAnimationFrame;
    (globalThis as any).MediaRecorder = originalMediaRecorder;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("exports a PNG sequence in batches and reports render/save progress", async () => {
    const project = createProjectWithClip(101);
    const canvas = createBlobCanvas();
    const app = { render: vi.fn(), canvas };
    const progress = vi.fn();

    const frameCount = await exportPngSequence(app, project, "clip-1", "out", progress);

    expect(frameCount).toBe(101);
    expect(app.render).toHaveBeenCalledTimes(101);
    expect(canvas.toBlob).toHaveBeenCalledTimes(101);
    expect(window.electronAPI.writeExportFiles).toHaveBeenCalledTimes(2);
    expect(window.electronAPI.writeExportFiles).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        dirPath: "out",
        files: expect.arrayContaining([
          expect.objectContaining({ path: "Clip_00000.png", isBlob: true }),
        ]),
      }),
    );
    expect(progress).toHaveBeenCalledWith({ current: 0, total: 101, phase: "rendering" });
    expect(progress).toHaveBeenCalledWith({ current: 99, total: 101, phase: "saving" });
    expect(progress).toHaveBeenCalledWith({ current: 101, total: 101, phase: "saving" });
  });

  it("rejects PNG sequence export when the clip is missing", async () => {
    await expect(
      exportPngSequence(
        { render: vi.fn(), canvas: createBlobCanvas() },
        createProjectWithClip(),
        "missing",
        "out",
      ),
    ).rejects.toThrow("Clip not found");
  });

  it("exports an MP4-compatible webm recording and reports encoding progress", async () => {
    vi.useFakeTimers();
    let recorder!: MockMediaRecorder;
    class MockMediaRecorder {
      state = "inactive";
      static isTypeSupported = vi.fn().mockReturnValue(true);
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      onstart: (() => void) | null = null;
      constructor() {
        recorder = this;
      }
      start = vi.fn(() => {
        this.state = "recording";
      });
      stop = vi.fn(() => {
        this.state = "inactive";
        this.ondataavailable?.({
          data: new Blob([new Uint8Array([4, 5, 6])], {
            type: "video/webm;codecs=vp9",
          }),
        });
        this.onstop?.();
      });
    }
    (globalThis as any).MediaRecorder = MockMediaRecorder;
    const project = createProjectWithClip(2);
    const order: string[] = [];
    const track = {
      requestFrame: vi.fn(() => order.push("request")),
      stop: vi.fn(),
    };
    const canvas = createBlobCanvas();
    const capture = mockCaptureCanvas(track);
    capture.context.drawImage.mockImplementation((source, x, y) => {
      expect([source, x, y]).toEqual([canvas, 0, 0]);
      order.push("copy");
    });
    const progress = vi.fn();

    const exported = exportMp4(
      { render: () => order.push("render"), canvas },
      project,
      "clip-1",
      "out",
      progress,
    );

    await vi.advanceTimersByTimeAsync(9_000);
    expect(order).toEqual(["render", "copy", "request"]);
    expect(window.electronAPI.writeExportFiles).not.toHaveBeenCalled();
    recorder.onstart?.();
    await vi.runAllTimersAsync();
    await exported;
    expect(order).toEqual(["render", "copy", "request", "render", "copy", "request"]);
    expect(canvas.captureStream).not.toHaveBeenCalled();
    expect(capture.context.globalCompositeOperation).toBe("copy");
    expect([canvas.width, canvas.height]).toEqual([64, 65]);
    expect([capture.canvas.width, capture.canvas.height]).toEqual([0, 0]);
    expect(vi.getTimerCount()).toBe(0);
    expect(window.electronAPI.writeExportFiles).toHaveBeenCalledWith(
      expect.objectContaining({
        dirPath: "out",
        files: [expect.objectContaining({ path: "Clip.webm", isBlob: true })],
      }),
    );
    expect(progress).toHaveBeenCalledWith({ current: 2, total: 2, phase: "encoding" });
    expect(progress).toHaveBeenCalledWith({ current: 2, total: 2, phase: "saving" });
    expect(track.stop).toHaveBeenCalledOnce();
    vi.mocked(window.electronAPI.writeExportFiles).mockClear();
    await expect(
      exportMp4(
        {
          render: () => {
            throw Error("PROJECT_DISPLAY_UNAVAILABLE");
          },
          canvas,
        },
        project,
        "clip-1",
        "out",
      ),
    ).rejects.toThrow("PROJECT_DISPLAY_UNAVAILABLE");
    expect(track.stop).toHaveBeenCalledTimes(2);
    expect([capture.canvas.width, capture.canvas.height]).toEqual([0, 0]);
    expect(window.electronAPI.writeExportFiles).not.toHaveBeenCalled();
  });

  it.each([
    "error",
    "stop",
    "timeout",
    "started-error",
    "started-stop",
  ])("does not save partial video after recorder startup %s", async (failure) => {
    vi.useFakeTimers();
    let recorder!: FailedMediaRecorder;
    class FailedMediaRecorder {
      static isTypeSupported = () => true;
      state = "inactive";
      onstart: (() => void) | null = null;
      onstop: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor() {
        recorder = this;
      }
      start() {
        this.state = "recording";
      }
      stop() {
        this.state = "inactive";
        this.onstop?.();
      }
    }
    (globalThis as any).MediaRecorder = FailedMediaRecorder;
    const track = { requestFrame: vi.fn(), stop: vi.fn() };
    const capture = mockCaptureCanvas(track);
    const render = vi.fn();
    const exported = exportMp4(
      { render, canvas: createBlobCanvas(track) },
      createProjectWithClip(),
      "clip-1",
      "out",
    );
    const rejected = expect(exported).rejects.toThrow("MEDIA_CAPTURE_FAILED");
    if (failure.startsWith("started-")) recorder.onstart?.();
    if (failure.endsWith("error")) recorder.onerror?.();
    else if (failure.endsWith("stop")) recorder.stop();
    else await vi.advanceTimersByTimeAsync(10_000);
    await rejected;
    expect(render).toHaveBeenCalledOnce();
    expect(track.requestFrame).toHaveBeenCalledOnce();
    expect(track.stop).toHaveBeenCalledOnce();
    expect([capture.canvas.width, capture.canvas.height]).toEqual([0, 0]);
    expect(recorder.state).toBe("inactive");
    expect(vi.getTimerCount()).toBe(0);
    expect(window.electronAPI.writeExportFiles).not.toHaveBeenCalled();
  });

  it("rejects an unavailable capture context without retaining or saving its bitmap", async () => {
    const track = { requestFrame: vi.fn(), stop: vi.fn() };
    const capture = mockCaptureCanvas(track);
    Object.assign(capture.canvas, { getContext: () => null });
    await expect(
      exportMp4(
        { render: vi.fn(), canvas: createBlobCanvas() },
        createProjectWithClip(),
        "clip-1",
        "out",
      ),
    ).rejects.toThrow("MEDIA_CAPTURE_UNAVAILABLE");
    expect(capture.canvas.captureStream).not.toHaveBeenCalled();
    expect([capture.canvas.width, capture.canvas.height]).toEqual([0, 0]);
    expect(window.electronAPI.writeExportFiles).not.toHaveBeenCalled();
  });

  it("rejects MP4 export when the clip is missing", async () => {
    await expect(
      exportMp4(
        { render: vi.fn(), canvas: createBlobCanvas() },
        createProjectWithClip(),
        "missing",
        "out",
      ),
    ).rejects.toThrow("Clip not found");
  });
});
