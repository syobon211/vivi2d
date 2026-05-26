import {
  BaseTracker,
  MEDIAPIPE_MODEL_ASSET_PATHS,
  MEDIAPIPE_WASM_URL,
  type TrackerOptions,
} from "./base-tracker";

export interface PoseLandmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export type PoseTrackerOptions = TrackerOptions;

export type OnPoseCallback = (landmarks: PoseLandmark[]) => void;

interface PoseLandmarkerResult {
  landmarks: PoseLandmark[][];
}

interface PoseLandmarkerInstance {
  detectForVideo(video: HTMLVideoElement, timestampMs: number): PoseLandmarkerResult;
  close(): void;
}

interface PoseLandmarkerConstructor {
  createFromOptions(
    vision: unknown,
    options: Record<string, unknown>,
  ): Promise<PoseLandmarkerInstance>;
}

export class PoseTracker extends BaseTracker {
  private landmarker: PoseLandmarkerInstance | null = null;
  private onPose: OnPoseCallback | null = null;

  async init(options?: PoseTrackerOptions): Promise<void> {
    const visionTasks = (await import(
      "@mediapipe/tasks-vision"
    )) as typeof import("@mediapipe/tasks-vision") & {
      PoseLandmarker?: PoseLandmarkerConstructor;
    };
    const { FilesetResolver, PoseLandmarker } = visionTasks;
    if (!PoseLandmarker) {
      throw new Error("MediaPipe PoseLandmarker is not available.");
    }

    const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);

    this.landmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: MEDIAPIPE_MODEL_ASSET_PATHS.pose,
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numPoses: 1,
    });

    await this.initCamera(options);
  }

  start(callback: OnPoseCallback): void {
    this.onPose = callback;
    this.startDetectLoop();
  }

  protected destroyLandmarker(): void {
    if (this.landmarker) {
      this.landmarker.close();
      this.landmarker = null;
    }
  }

  protected detect(): void {
    if (!this.landmarker || !this.video) return;

    const now = performance.now();
    const result = this.landmarker.detectForVideo(this.video, now);
    if (result.landmarks.length > 0 && this.onPose) {
      this.onPose(result.landmarks[0]!);
    }
  }
}
