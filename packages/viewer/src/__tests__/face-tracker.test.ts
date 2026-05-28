import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockDetectForVideo = vi.fn().mockReturnValue({
  faceLandmarks: [Array(478).fill({ x: 0.5, y: 0.5, z: 0 })],
});
const mockClose = vi.fn();
const mockCreateFromOptions = vi.fn().mockResolvedValue({
  detectForVideo: mockDetectForVideo,
  close: mockClose,
});
const mockForVisionTasks = vi.fn().mockResolvedValue({});

vi.mock("@mediapipe/tasks-vision", () => ({
  FilesetResolver: { forVisionTasks: mockForVisionTasks },
  FaceLandmarker: { createFromOptions: mockCreateFromOptions },
}));

const mockTrackStop = vi.fn();
const mockStream = {
  getTracks: () => [{ stop: mockTrackStop }],
};
const mockGetUserMedia = vi.fn().mockResolvedValue(mockStream);
const mockEnumerateDevices = vi.fn().mockResolvedValue([
  { kind: "videoinput", deviceId: "cam1", label: "Camera 1" },
  { kind: "audioinput", deviceId: "mic1", label: "Mic 1" },
]);

vi.stubGlobal("navigator", {
  mediaDevices: {
    getUserMedia: mockGetUserMedia,
    enumerateDevices: mockEnumerateDevices,
  },
});

const _origSrcObjectDesc = Object.getOwnPropertyDescriptor(
  HTMLMediaElement.prototype,
  "srcObject",
);
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

import { FaceTracker } from "../tracking/face-tracker";

describe("FaceTracker", () => {
  let tracker: FaceTracker;

  beforeEach(() => {
    tracker = new FaceTracker();
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
      faceLandmarks: [Array(478).fill({ x: 0.5, y: 0.5, z: 0 })],
    });
    mockClose.mockClear();
    mockCreateFromOptions.mockClear();
    mockForVisionTasks.mockClear();
    mockGetUserMedia.mockClear();
    mockTrackStop.mockClear();
    mockEnumerateDevices.mockClear();
    (HTMLVideoElement.prototype.play as ReturnType<typeof vi.fn>).mockClear();
  });

  afterEach(() => {
    tracker.destroy();
    vi.restoreAllMocks();
  });

  it("loads the MediaPipe face model during init()", async () => {
    await tracker.init();
    expect(mockForVisionTasks).toHaveBeenCalledOnce();
    expect(mockCreateFromOptions).toHaveBeenCalledOnce();
    expect(mockForVisionTasks).toHaveBeenCalledWith(
      "/vendor/mediapipe/tasks-vision-0.10.35/wasm",
    );
    expect(mockCreateFromOptions.mock.calls[0][1].baseOptions.modelAssetPath).toBe(
      "/vendor/mediapipe/tasks-vision-0.10.35/models/face_landmarker.task",
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

  it("passes landmarks to the callback in start()", async () => {
    await tracker.init();
    const cb = vi.fn();
    tracker.start(cb);
    tickRaf();
    expect(cb).toHaveBeenCalled();
    expect(cb.mock.calls[0][0]).toHaveLength(478);
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
    mockDetectForVideo.mockReturnValue({ faceLandmarks: [] });

    const cb = vi.fn();
    tracker.start(cb);
    tickRaf();
    expect(cb).not.toHaveBeenCalled();
  });

  it("returns only videoinput devices from listCameras()", async () => {
    const cameras = await FaceTracker.listCameras();
    expect(mockEnumerateDevices).toHaveBeenCalledOnce();
    expect(cameras).toHaveLength(1);
    expect(cameras[0].kind).toBe("videoinput");
  });

  it("passes non-neutral face channels when detectForVideo returns blendshapes", async () => {
    await tracker.init();

    mockDetectForVideo.mockReturnValue({
      faceLandmarks: [Array(478).fill({ x: 0.5, y: 0.5, z: 0 })],
      faceBlendshapes: [
        {
          categories: [
            { categoryName: "_neutral", score: 0.95 },
            { categoryName: "browDownLeft", score: 0.3 },
            { categoryName: "jawOpen", score: 0.7 },
          ],
        },
      ],
    });

    const cb = vi.fn();
    tracker.start(cb);
    tickRaf();

    expect(cb).toHaveBeenCalled();
    expect(cb.mock.calls[0][0]).toHaveLength(478);
    const faceChannels = cb.mock.calls[0][1];
    expect(faceChannels).toBeDefined();
    expect(faceChannels).not.toHaveProperty("_neutral");
    expect(faceChannels).toEqual({
      browDownLeft: 0.3,
      jawOpen: 0.7,
    });
  });

  it("omits face channels when faceBlendshapes is empty", async () => {
    await tracker.init();

    mockDetectForVideo.mockReturnValue({
      faceLandmarks: [Array(478).fill({ x: 0.5, y: 0.5, z: 0 })],
      faceBlendshapes: [],
    });

    const cb = vi.fn();
    tracker.start(cb);
    tickRaf();

    expect(cb).toHaveBeenCalled();
    expect(cb.mock.calls[0][1]).toBeUndefined();
  });

  it("omits face channels when faceBlendshapes is undefined", async () => {
    await tracker.init();

    mockDetectForVideo.mockReturnValue({
      faceLandmarks: [Array(478).fill({ x: 0.5, y: 0.5, z: 0 })],
    });

    const cb = vi.fn();
    tracker.start(cb);
    tickRaf();

    expect(cb).toHaveBeenCalled();
    expect(cb.mock.calls[0][1]).toBeUndefined();
  });
});
