import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BaseTracker,
  MEDIAPIPE_ASSET_POLICY,
  MEDIAPIPE_MODEL_ASSET_PATHS,
  MEDIAPIPE_WASM_URL,
} from "../tracking/base-tracker";

class TestTracker extends BaseTracker {
  public detectCount = 0;
  public destroyed = false;

  protected destroyLandmarker(): void {
    this.destroyed = true;
  }

  protected detect(): void {
    this.detectCount++;
  }

  public async testInitCamera(options?: { deviceId?: string }) {
    await this.initCamera(options);
  }

  public testStartDetectLoop() {
    this.startDetectLoop();
  }

  public get isRunning() {
    return this.running;
  }

  public get currentVideo() {
    return this.video;
  }
}

describe("BaseTracker", () => {
  let rafCallbacks: ((time: number) => void)[];

  beforeEach(() => {
    rafCallbacks = [];

    const mockStream = {
      getTracks: vi.fn(() => [{ stop: vi.fn() }]),
    };
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
      },
    });

    Object.defineProperty(HTMLMediaElement.prototype, "srcObject", {
      set() {},
      get() {
        return null;
      },
      configurable: true,
    });
    Object.defineProperty(HTMLVideoElement.prototype, "readyState", {
      value: 4,
      writable: true,
      configurable: true,
    });
    HTMLVideoElement.prototype.play = vi.fn().mockResolvedValue(undefined) as any;

    vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((cb) => {
      rafCallbacks.push(cb as (t: number) => void);
      return rafCallbacks.length;
    });
    vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function tickRaf() {
    const cb = rafCallbacks.shift();
    cb?.(performance.now());
  }

  it("uses same-origin MediaPipe assets by default", () => {
    expect(MEDIAPIPE_ASSET_POLICY).toBe("same-origin-vendored-assets");
    expect(MEDIAPIPE_WASM_URL).toBe("/vendor/mediapipe/tasks-vision-0.10.35/wasm");
    expect(MEDIAPIPE_MODEL_ASSET_PATHS.face).toBe(
      "/vendor/mediapipe/tasks-vision-0.10.35/models/face_landmarker.task",
    );
  });

  it("creates a video element after getUserMedia resolves in initCamera()", async () => {
    const tracker = new TestTracker();
    await tracker.testInitCamera();

    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled();
    expect(tracker.currentVideo).toBeInstanceOf(HTMLVideoElement);
  });

  it("passes deviceId into initCamera constraints", async () => {
    const tracker = new TestTracker();
    await tracker.testInitCamera({ deviceId: "cam-123" });

    const call = (navigator.mediaDevices.getUserMedia as any).mock.calls[0][0];
    expect(call.video.deviceId).toEqual({ exact: "cam-123" });
  });

  it("sets running and schedules RAF in startDetectLoop()", () => {
    const tracker = new TestTracker();
    tracker.testStartDetectLoop();

    expect(tracker.isRunning).toBe(true);
    expect(rafCallbacks.length).toBe(1);
  });

  it("calls detect when RAF ticks", async () => {
    const tracker = new TestTracker();
    await tracker.testInitCamera();
    tracker.testStartDetectLoop();

    tickRaf();
    expect(tracker.detectCount).toBeGreaterThanOrEqual(1);

    tickRaf();
    expect(tracker.detectCount).toBeGreaterThan(1);
  });

  it("sets running false and cancels RAF in stop()", () => {
    const tracker = new TestTracker();
    tracker.testStartDetectLoop();
    tracker.stop();

    expect(tracker.isRunning).toBe(false);
    expect(cancelAnimationFrame).toHaveBeenCalled();
  });

  it("stops stream tracks and destroys the landmarker in destroy()", async () => {
    const tracker = new TestTracker();
    await tracker.testInitCamera();
    tracker.testStartDetectLoop();

    tracker.destroy();

    expect(tracker.destroyed).toBe(true);
    expect(tracker.isRunning).toBe(false);
    expect(tracker.currentVideo).toBeNull();
  });

  it("does not crash if startDetectLoop runs after destroy()", async () => {
    const tracker = new TestTracker();
    await tracker.testInitCamera();
    tracker.destroy();

    tracker.testStartDetectLoop();
    tickRaf();
    expect(tracker.detectCount).toBe(0);
  });

  it("does not crash when stop is called more than once", () => {
    const tracker = new TestTracker();
    tracker.testStartDetectLoop();
    tracker.stop();
    tracker.stop();
  });

  it("does not crash when destroy runs before initCamera()", () => {
    const tracker = new TestTracker();
    tracker.destroy();
    expect(tracker.destroyed).toBe(true);
  });
});
