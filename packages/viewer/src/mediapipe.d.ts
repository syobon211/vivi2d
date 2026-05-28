declare module "@mediapipe/tasks-vision" {
  export interface FaceLandmarkerResult {
    faceLandmarks?: Array<Array<{ x: number; y: number; z: number }>>;
    faceBlendshapes?: unknown[];
    facialTransformationMatrixes?: unknown[];
  }

  export interface FaceLandmarkerOptions {
    baseOptions: {
      modelAssetPath: string;
      delegate?: "GPU" | "CPU";
    };
    runningMode: "IMAGE" | "VIDEO";
    numFaces?: number;
    outputFaceBlendshapes?: boolean;
    outputFacialTransformationMatrixes?: boolean;
  }

  export class FaceLandmarker {
    static createFromOptions(
      vision: VisionTasksFileset,
      options: FaceLandmarkerOptions,
    ): Promise<FaceLandmarker>;
    detectForVideo(video: HTMLVideoElement, timestamp: number): FaceLandmarkerResult;
    close(): void;
  }

  export interface VisionTasksFileset {}

  export class FilesetResolver {
    static forVisionTasks(wasmPath: string): Promise<VisionTasksFileset>;
  }
}
