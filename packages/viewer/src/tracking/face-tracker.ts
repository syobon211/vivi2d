import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import {
  BaseTracker,
  MEDIAPIPE_MODEL_ASSET_PATHS,
  MEDIAPIPE_WASM_URL,
  type TrackerOptions,
} from "./base-tracker";
import type { Landmark } from "./face-mapper";

export type FaceTrackerOptions = TrackerOptions;

export type OnLandmarksCallback = (
  landmarks: Landmark[],
  faceChannels?: Record<string, number>,
) => void;

export class FaceTracker extends BaseTracker {
  private landmarker: FaceLandmarker | null = null;
  private onLandmarks: OnLandmarksCallback | null = null;

  async init(options?: FaceTrackerOptions): Promise<void> {
    const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");

    const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);

    this.landmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: MEDIAPIPE_MODEL_ASSET_PATHS.face,
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numFaces: 1,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: false,
    });

    await this.initCamera(options);
  }

  start(callback: OnLandmarksCallback): void {
    this.onLandmarks = callback;
    this.startDetectLoop();
  }

  static async listCameras(): Promise<MediaDeviceInfo[]> {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === "videoinput");
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
    if (
      result.faceLandmarks &&
      result.faceLandmarks.length > 0 &&
      result.faceLandmarks[0]
    ) {
      let faceChannels: Record<string, number> | undefined;
      if (
        result.faceBlendshapes &&
        result.faceBlendshapes.length > 0 &&
        result.faceBlendshapes[0]
      ) {
        faceChannels = {};
        const bs = result.faceBlendshapes[0] as {
          categories: Array<{ categoryName: string; score: number }>;
        };
        for (const cat of bs.categories) {
          if (cat.categoryName !== "_neutral") {
            faceChannels[cat.categoryName] = cat.score;
          }
        }
      }

      this.onLandmarks?.(result.faceLandmarks[0] as Landmark[], faceChannels);
    }
  }
}
