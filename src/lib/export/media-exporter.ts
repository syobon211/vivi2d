import { findLayerById } from "@vivi2d/core/layer-utils";
import { mergeParameterDefaults } from "@vivi2d/core/parameter-utils";
import { findClipInProject } from "@vivi2d/core/scene-utils";
import {
  evaluateBoneTracksAtFrame,
  evaluateClipAtFrame,
} from "@vivi2d/core/timeline-utils";
import { type AnimationClip, isBone, type ProjectData } from "@vivi2d/core/types";
import { flushSync } from "react-dom";
import { useBoneStore } from "@/stores/boneStore";
import { useParameterStore } from "@/stores/parameterStore";

export type MediaFormat = "png-sequence" | "mp4";

export interface MediaExportOptions {
  format: MediaFormat;
  clipId: string;
  /** Output width override. `null` keeps the current canvas width. */
  width: number | null;
  /** Output height override. `null` keeps the current canvas height. */
  height: number | null;
}

export interface MediaExportProgress {
  current: number;
  total: number;
  phase: "rendering" | "encoding" | "saving";
}

export function applyFrameToStores(
  project: ProjectData,
  clip: AnimationClip,
  frame: number,
): void {
  // Parameter tracks provide the baseline frame state; bone tracks patch rig state.
  const trackValues = evaluateClipAtFrame(clip, frame);
  const merged = mergeParameterDefaults(project.parameters, trackValues);
  useParameterStore.getState().setAllValues(merged);

  if (clip.boneTracks && clip.boneTracks.length > 0) {
    const boneValues = evaluateBoneTracksAtFrame(clip.boneTracks, frame);
    const boneStore = useBoneStore.getState();
    for (const [boneId, props] of Object.entries(boneValues)) {
      if (props.angle !== undefined) boneStore.setBoneAngle(boneId, props.angle);
      if (props.scaleX !== undefined || props.scaleY !== undefined) {
        const node = findLayerById(project.layers, boneId);
        const curSX = node && isBone(node) ? node.bone.scaleX : 1;
        const curSY = node && isBone(node) ? node.bone.scaleY : 1;
        boneStore.setBoneScale(boneId, props.scaleX ?? curSX, props.scaleY ?? curSY);
      }
    }
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type = "image/png"): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Canvas to Blob conversion failed"));
      },
      type,
      type === "image/png" ? undefined : 0.95,
    );
  });
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function waitForPaint(): Promise<void> {
  return new Promise((resolve) => {
    // A paint opportunity, not proof that a scene or encoded frame is ready.
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

export async function exportPngSequence(
  app: { render: () => void; canvas: HTMLCanvasElement },
  project: ProjectData,
  clipId: string,
  dirPath: string,
  onProgress?: (progress: MediaExportProgress) => void,
): Promise<number> {
  const clip = findClipInProject(project, clipId);
  if (!clip) throw new Error("Clip not found");

  const total = clip.duration;
  const files: { path: string; content: string; isBlob: boolean }[] = [];

  for (let frame = 0; frame < total; frame++) {
    onProgress?.({ current: frame, total, phase: "rendering" });

    flushSync(() => applyFrameToStores(project, clip, frame));
    app.render();
    // Start readback in the final draw's turn, even with a non-preserved buffer.
    const blob = await canvasToBlob(app.canvas);
    const base64 = await blobToBase64(blob);
    const padded = String(frame).padStart(5, "0");
    files.push({
      path: `${clip.name}_${padded}.png`,
      content: base64,
      isBlob: true,
    });

    if (files.length >= 100) {
      onProgress?.({ current: frame, total, phase: "saving" });
      await window.electronAPI.writeExportFiles({ dirPath, files: [...files] });
      files.length = 0;
    }
  }

  if (files.length > 0) {
    onProgress?.({ current: total, total, phase: "saving" });
    await window.electronAPI.writeExportFiles({ dirPath, files });
  }

  return total;
}

export async function exportMp4(
  app: { render: () => void; canvas: HTMLCanvasElement },
  project: ProjectData,
  clipId: string,
  dirPath: string,
  onProgress?: (progress: MediaExportProgress) => void,
): Promise<void> {
  const clip = findClipInProject(project, clipId);
  if (!clip) throw new Error("Clip not found");

  const total = clip.duration;
  const canvas = app.canvas;

  // Manually step the captured stream so the recording stays aligned with the
  // export loop instead of the browser refresh rate.
  const stream = canvas.captureStream(0);
  let recorder: MediaRecorder | undefined;
  try {
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : "video/webm";

    recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 8_000_000,
    });

    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    let recordingFailed = false;
    const recordingDone = new Promise<void>((resolve) => {
      recorder!.onstop = () => resolve();
      recorder!.onerror = () => {
        recordingFailed = true;
        resolve();
      };
    });

    recorder.start();

    const videoTrack = stream.getVideoTracks()[0] as MediaStreamTrack & {
      requestFrame?: () => void;
    };
    if (!videoTrack?.requestFrame) throw new Error("MEDIA_CAPTURE_UNAVAILABLE");

    for (let frame = 0; frame < total; frame++) {
      onProgress?.({ current: frame, total, phase: "rendering" });

      if (recordingFailed) throw new Error("MEDIA_CAPTURE_FAILED");
      flushSync(() => applyFrameToStores(project, clip, frame));
      videoTrack.requestFrame();
      app.render();
      await waitForPaint();
      await new Promise((r) => setTimeout(r, 1000 / clip.fps));
    }

    if (recordingFailed) throw new Error("MEDIA_CAPTURE_FAILED");
    recorder.stop();
    onProgress?.({ current: total, total, phase: "encoding" });

    await recordingDone;
    if (recordingFailed) throw new Error("MEDIA_CAPTURE_FAILED");
    const blob = new Blob(chunks, { type: mimeType });
    const base64 = await blobToBase64(blob);

    onProgress?.({ current: total, total, phase: "saving" });
    const ext = mimeType.includes("webm") ? "webm" : "mp4";
    await window.electronAPI.writeExportFiles({
      dirPath,
      files: [{ path: `${clip.name}.${ext}`, content: base64, isBlob: true }],
    });
  } finally {
    try {
      if (recorder && recorder.state !== "inactive") recorder.stop();
    } finally {
      for (const track of stream.getTracks()) track.stop();
    }
  }
}
