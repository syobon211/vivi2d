import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockDetectForVideo = vi.fn().mockReturnValue({
  landmarks: [Array(33).fill({ x: 0.5, y: 0.5, z: 0, visibility: 1.0 })],
});
const mockClose = vi.fn();
const mockCreateFromOptions = vi.fn().mockResolvedValue({
  detectForVideo: mockDetectForVideo,
  close: mockClose,
});
const mockForVisionTasks = vi.fn().mockResolvedValue({});

vi.mock("@mediapipe/tasks-vision", () => ({
  FilesetResolver: { forVisionTasks: mockForVisionTasks },
  PoseLandmarker: { createFromOptions: mockCreateFromOptions },
}));

const mockTrackStop = vi.fn();
const mockStream = {
  getTracks: () => [{ stop: mockTrackStop }],
};
const mockGetUserMedia = vi.fn().mockResolvedValue(mockStream);

vi.stubGlobal("navigator", {
  mediaDevices: {
    getUserMedia: mockGetUserMedia,
  },
});

Object.defineProperty(HTMLMediaElement.prototype, "srcObject", {
  set(v) {
    this._srcObject = v;
  },
  get() {
    return this._srcObject ?? null;
  },
  configurable: true,
});

Object.defineProperty(HTMLVideoElement.prototype, "readyState", {
  value: 4,
  writable: true,
  configurable: true,
});
const origPlay = HTMLVideoElement.prototype.play;
HTMLVideoElement.prototype.play = vi.fn().mockResolvedValue(undefined) as typeof origPlay;

let rafCallbacks: Array<(time: number) => void> = [];
let mockCancelAnimationFrame: ReturnType<typeof vi.fn>;

function tickRaf() {
  const cb = rafCallbacks.shift();
  cb?.(performance.now());
}

import { PoseTracker } from "../tracking/pose-tracker";

describe("PoseTracker", () => {
  let tracker: PoseTracker;

  beforeEach(() => {
    tracker = new PoseTracker();
    rafCallbacks = [];

    vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((cb) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });
    mockCancelAnimationFrame = vi.fn();
    vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(
      mockCancelAnimationFrame as unknown as typeof cancelAnimationFrame,
    );

    mockDetectForVideo.mockReturnValue({
      landmarks: [Array(33).fill({ x: 0.5, y: 0.5, z: 0, visibility: 1.0 })],
    });
    mockClose.mockClear();
    mockCreateFromOptions.mockClear();
    mockForVisionTasks.mockClear();
    mockGetUserMedia.mockClear();
    mockTrackStop.mockClear();
    (HTMLVideoElement.prototype.play as ReturnType<typeof vi.fn>).mockClear();
  });

  afterEach(() => {
    tracker.destroy();
    vi.restoreAllMocks();
  });

  it("loads the MediaPipe pose model during init()", async () => {
    await tracker.init();
    expect(mockForVisionTasks).toHaveBeenCalledOnce();
    expect(mockCreateFromOptions).toHaveBeenCalledOnce();
    expect(mockCreateFromOptions.mock.calls[0][1].baseOptions.modelAssetPath).toBe(
      "/vendor/mediapipe/tasks-vision-0.10.35/models/pose_landmarker_lite.task",
    );
  });

  it("requests a video stream during init()", async () => {
    await tracker.init();
    expect(mockGetUserMedia).toHaveBeenCalledOnce();
    const constraints = mockGetUserMedia.mock.calls[0][0];
    expect(constraints.video).toBeDefined();
    expect(constraints.audio).toBeUndefined();
  });

  it("passes deviceId into init constraints", async () => {
    await tracker.init({ deviceId: "cam1" });
    const constraints = mockGetUserMedia.mock.calls[0][0];
    expect(constraints.video.deviceId).toEqual({ exact: "cam1" });
  });

  it("passes pose landmarks to the callback in start()", async () => {
    await tracker.init();
    const cb = vi.fn();
    tracker.start(cb);
    tickRaf();
    expect(cb).toHaveBeenCalled();
    expect(cb.mock.calls[0][0]).toHaveLength(33);
  });

  it("cancels RAF in stop()", async () => {
    await tracker.init();
    tracker.start(vi.fn());
    tickRaf();
    tracker.stop();
    expect(mockCancelAnimationFrame).toHaveBeenCalled();
  });

  it("releases stream tracks and the landmarker in destroy()", async () => {
    await tracker.init();
    tracker.destroy();
    expect(mockTrackStop).toHaveBeenCalledOnce();
    expect(mockClose).toHaveBeenCalledOnce();
  });

  it("does not crash if start runs after destroy()", async () => {
    await tracker.init();
    tracker.destroy();
    expect(() => {
      tracker.start(vi.fn());
    }).not.toThrow();
    tickRaf();
  });

  it("does not call the callback when the video is not ready", async () => {
    await tracker.init();
    const video = (tracker as unknown as { video: HTMLVideoElement }).video;
    Object.defineProperty(video, "readyState", {
      value: 0,
      writable: true,
      configurable: true,
    });

    const cb = vi.fn();
    tracker.start(cb);
    tickRaf();
    expect(cb).not.toHaveBeenCalled();
    expect(mockDetectForVideo).not.toHaveBeenCalled();
  });

  it("does not call the callback when detection returns no landmarks", async () => {
    await tracker.init();
    mockDetectForVideo.mockReturnValue({
      landmarks: [],
    });

    const cb = vi.fn();
    tracker.start(cb);
    tickRaf();
    expect(cb).not.toHaveBeenCalled();
  });
});
