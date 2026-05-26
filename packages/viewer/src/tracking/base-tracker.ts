export interface TrackerOptions {
  deviceId?: string;

  width?: number;

  height?: number;

  fps?: number;
}

export {
  MEDIAPIPE_ASSET_POLICY,
  MEDIAPIPE_MODEL_ASSET_PATHS,
  MEDIAPIPE_TASKS_VERSION,
  MEDIAPIPE_WASM_URL,
} from "./mediapipe-assets";

export abstract class BaseTracker {
  protected video: HTMLVideoElement | null = null;
  protected stream: MediaStream | null = null;
  protected animationId = 0;
  protected running = false;

  protected async initCamera(options?: TrackerOptions): Promise<void> {
    const constraints: MediaStreamConstraints = {
      video: {
        width: { ideal: options?.width ?? 640 },
        height: { ideal: options?.height ?? 480 },
        frameRate: { ideal: options?.fps ?? 30 },
        ...(options?.deviceId ? { deviceId: { exact: options.deviceId } } : {}),
      },
    };

    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    this.video = document.createElement("video");
    this.video.srcObject = this.stream;
    this.video.autoplay = true;
    this.video.playsInline = true;
    await this.video.play();
  }

  protected startDetectLoop(): void {
    this.running = true;
    this.detectFrame();
  }

  stop(): void {
    this.running = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = 0;
    }
  }

  destroy(): void {
    this.stop();
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
      this.stream = null;
    }
    if (this.video) {
      this.video.srcObject = null;
      this.video = null;
    }
    this.destroyLandmarker();
  }

  protected abstract destroyLandmarker(): void;

  protected abstract detect(): void;

  private detectFrame(): void {
    if (!this.running) return;
    if (this.video && this.video.readyState >= 2) {
      this.detect();
    }
    this.animationId = requestAnimationFrame(() => this.detectFrame());
  }
}
