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

function createBlobCanvas() {
  return {
    toBlob: vi.fn((callback: BlobCallback) => {
      callback(new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }));
    }),
    captureStream: vi.fn(() => ({
      getVideoTracks: () => [{ requestFrame: vi.fn() }],
    })),
  } as unknown as HTMLCanvasElement;
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
    class MockMediaRecorder {
      static isTypeSupported = vi.fn().mockReturnValue(true);
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      start = vi.fn();
      stop = vi.fn(() => {
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
    const canvas = createBlobCanvas();
    const progress = vi.fn();

    await exportMp4({ render: vi.fn(), canvas }, project, "clip-1", "out", progress);

    expect(window.electronAPI.writeExportFiles).toHaveBeenCalledWith(
      expect.objectContaining({
        dirPath: "out",
        files: [expect.objectContaining({ path: "Clip.webm", isBlob: true })],
      }),
    );
    expect(progress).toHaveBeenCalledWith({ current: 2, total: 2, phase: "encoding" });
    expect(progress).toHaveBeenCalledWith({ current: 2, total: 2, phase: "saving" });
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
