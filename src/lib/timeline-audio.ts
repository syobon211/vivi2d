import type { AnimationClip, AudioTrack } from "@vivi2d/core/types";

export interface PreviewAudioLike {
  currentTime: number;
  volume: number;
  muted: boolean;
  paused?: boolean;
  preload?: string;
  play: () => Promise<void> | void;
  pause: () => void;
  addEventListener: (
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ) => void;
  removeEventListener: (
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ) => void;
}

type AudioFactory = (src: string) => PreviewAudioLike;

function defaultAudioFactory(src: string): PreviewAudioLike {
  const audio = new Audio(src);
  audio.preload = "auto";
  return audio;
}

export function getAudioPathBasename(sourcePath: string): string {
  const normalized = sourcePath.replace(/\\/g, "/");
  const name = normalized.split("/").pop();
  return name && name.length > 0 ? name : sourcePath;
}

export function audioPathToFileUrl(sourcePath: string): string {
  const normalized = sourcePath.replace(/\\/g, "/");
  if (/^[A-Za-z]:\//.test(normalized)) {
    return encodeURI(`file:///${normalized}`);
  }
  if (normalized.startsWith("/")) {
    return encodeURI(`file://${normalized}`);
  }
  return encodeURI(normalized);
}

export async function loadAudioTrackMetadata(
  sourcePath: string,
  createAudio: AudioFactory = defaultAudioFactory,
): Promise<{ name: string; durationSeconds: number | null }> {
  const url = audioPathToFileUrl(sourcePath);
  const audio = createAudio(url);

  const durationSeconds = await new Promise<number | null>((resolve) => {
    let settled = false;

    const cleanup = () => {
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("error", handleError);
    };

    const settle = (value: number | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };

    const handleLoadedMetadata = () => {
      const duration =
        (audio as PreviewAudioLike & { duration?: number }).duration ?? Number.NaN;
      settle(Number.isFinite(duration) && duration > 0 ? duration : null);
    };

    const handleError = () => settle(null);

    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("error", handleError);
  });

  return {
    name: getAudioPathBasename(sourcePath),
    durationSeconds,
  };
}

export function getAudioTrackFrameLength(
  track: AudioTrack,
  fps: number,
  fallbackFrames = 30,
): number {
  if (track.sourceDurationSeconds !== null && track.sourceDurationSeconds > 0) {
    return Math.max(1, Math.round(track.sourceDurationSeconds * fps));
  }
  return Math.max(1, fallbackFrames);
}

export function getAudioTrackFrameRange(
  track: AudioTrack,
  fps: number,
  fallbackFrames = 30,
): { startFrame: number; endFrameExclusive: number } {
  const length = getAudioTrackFrameLength(track, fps, fallbackFrames);
  return {
    startFrame: track.startFrame,
    endFrameExclusive: track.startFrame + length,
  };
}

export function isAudioTrackActiveAtFrame(
  track: AudioTrack,
  frame: number,
  fps: number,
): boolean {
  const { startFrame, endFrameExclusive } = getAudioTrackFrameRange(track, fps);
  return frame >= startFrame && frame < endFrameExclusive;
}

export function getAudioTrackCurrentTimeSeconds(
  track: AudioTrack,
  frame: number,
  fps: number,
): number {
  if (frame <= track.startFrame) return 0;
  return (frame - track.startFrame) / fps;
}

export class TimelineAudioPreviewController {
  private readonly elements = new Map<string, PreviewAudioLike>();
  private readonly erroredTrackIds = new Set<string>();

  constructor(
    private readonly createAudio: AudioFactory = defaultAudioFactory,
    private readonly onWarning?: (message: string) => void,
  ) {}

  sync(clip: AnimationClip | null | undefined, frame: number, isPlaying: boolean): void {
    if (!clip) {
      this.stopAll();
      return;
    }

    const activeTrackIds = new Set<string>();
    const tracks = clip.audioTracks ?? [];

    for (const track of tracks) {
      activeTrackIds.add(track.id);
      const element = this.getOrCreateElement(track);
      if (!element) continue;

      element.muted = track.muted;
      element.volume = track.gain;

      if (!isAudioTrackActiveAtFrame(track, frame, clip.fps)) {
        if (element.paused === false) {
          element.pause();
        }
        element.currentTime = 0;
        continue;
      }

      const desiredTime = getAudioTrackCurrentTimeSeconds(track, frame, clip.fps);
      if (
        !Number.isFinite(element.currentTime) ||
        Math.abs(element.currentTime - desiredTime) > 0.15
      ) {
        element.currentTime = desiredTime;
      }

      if (isPlaying) {
        if (element.paused !== false) {
          try {
            const result = element.play();
            if (result && typeof (result as Promise<void>).catch === "function") {
              (result as Promise<void>).catch(() => {
                this.markErrored(track, "Audio preview playback failed.");
              });
            }
          } catch {
            this.markErrored(track, "Audio preview playback failed.");
          }
        }
      } else if (element.paused === false) {
        element.pause();
      }
    }

    for (const [trackId, element] of this.elements.entries()) {
      if (activeTrackIds.has(trackId)) continue;
      if (element.paused === false) {
        element.pause();
      }
      this.elements.delete(trackId);
      this.erroredTrackIds.delete(trackId);
    }
  }

  reset(): void {
    this.stopAll();
    this.elements.clear();
    this.erroredTrackIds.clear();
  }

  private stopAll(): void {
    for (const element of this.elements.values()) {
      if (element.paused === false) {
        element.pause();
      }
      element.currentTime = 0;
    }
  }

  private getOrCreateElement(track: AudioTrack): PreviewAudioLike | null {
    if (this.erroredTrackIds.has(track.id)) return null;
    const existing = this.elements.get(track.id);
    if (existing) return existing;
    try {
      const element = this.createAudio(audioPathToFileUrl(track.sourcePath));
      element.preload = "auto";
      this.elements.set(track.id, element);
      return element;
    } catch {
      this.markErrored(track, `Audio file is unavailable: ${track.name}`);
      return null;
    }
  }

  private markErrored(track: AudioTrack, message: string): void {
    if (this.erroredTrackIds.has(track.id)) return;
    this.erroredTrackIds.add(track.id);
    this.onWarning?.(message);
  }
}
