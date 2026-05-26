import {
  BaseTracker,
  MEDIAPIPE_MODEL_ASSET_PATHS,
  MEDIAPIPE_WASM_URL,
  type TrackerOptions,
} from "./base-tracker";

export interface HandLandmark {
  x: number;
  y: number;
  z: number;
}

export interface HandDetection {
  landmarks: HandLandmark[];

  handedness: "Left" | "Right";
}

export type HandTrackerOptions = TrackerOptions;

export type OnHandsCallback = (hands: HandDetection[]) => void;

interface HandLandmarkerResult {
  landmarks: HandLandmark[][];
  handednesses: Array<Array<{ categoryName?: string }>>;
}

interface HandLandmarkerInstance {
  detectForVideo(video: HTMLVideoElement, timestampMs: number): HandLandmarkerResult;
  close(): void;
}

interface HandLandmarkerConstructor {
  createFromOptions(
    vision: unknown,
    options: Record<string, unknown>,
  ): Promise<HandLandmarkerInstance>;
}

export class HandTracker extends BaseTracker {
  private landmarker: HandLandmarkerInstance | null = null;
  private onHands: OnHandsCallback | null = null;

  async init(options?: HandTrackerOptions): Promise<void> {
    const visionTasks = (await import(
      "@mediapipe/tasks-vision"
    )) as typeof import("@mediapipe/tasks-vision") & {
      HandLandmarker?: HandLandmarkerConstructor;
    };
    const { FilesetResolver, HandLandmarker } = visionTasks;
    if (!HandLandmarker) {
      throw new Error("MediaPipe HandLandmarker is not available.");
    }

    const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);

    this.landmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: MEDIAPIPE_MODEL_ASSET_PATHS.hand,
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numHands: 2,
    });

    await this.initCamera(options);
  }

  start(callback: OnHandsCallback): void {
    this.onHands = callback;
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
    if (result.landmarks.length > 0 && this.onHands) {
      const hands: HandDetection[] = result.landmarks.map((lm, i) => {
        const name = result.handednesses[i]?.[0]?.categoryName;
        return {
          landmarks: lm,
          handedness: name === "Left" ? ("Left" as const) : ("Right" as const),
        };
      });
      this.onHands(hands);
    }
  }
}
