import type { AnimationClip, AudioTrack } from "@vivi2d/core/types";
import { describe, expect, it, vi } from "vitest";
import { TEST_AUDIO_FILE_URL, TEST_AUDIO_PATH } from "@/test/path-fixtures";
import {
  audioPathToFileUrl,
  getAudioPathBasename,
  getAudioTrackCurrentTimeSeconds,
  getAudioTrackFrameLength,
  getAudioTrackFrameRange,
  isAudioTrackActiveAtFrame,
  loadAudioTrackMetadata,
  type PreviewAudioLike,
  TimelineAudioPreviewController,
} from "../timeline-audio";

function createTrack(overrides: Partial<AudioTrack> = {}): AudioTrack {
  return {
    id: "audio-1",
    name: "voice.wav",
    sourcePath: TEST_AUDIO_PATH,
    startFrame: 10,
    sourceDurationSeconds: 2,
    gain: 1,
    muted: false,
    ...overrides,
  };
}

function createClip(overrides: Partial<AnimationClip> = {}): AnimationClip {
  return {
    id: "clip-1",
    name: "Clip",
    duration: 120,
    fps: 30,
    tracks: [],
    audioTracks: [createTrack()],
    ...overrides,
  };
}

describe("timeline-audio helpers", () => {
  it("extracts an audio basename from a Windows path", () => {
    expect(getAudioPathBasename(TEST_AUDIO_PATH)).toBe("voice.wav");
  });

  it("converts Windows file paths to file URLs", () => {
    expect(audioPathToFileUrl(TEST_AUDIO_PATH)).toBe(TEST_AUDIO_FILE_URL);
  });

  it("derives audio frame lengths and active ranges", () => {
    const track = createTrack({ startFrame: 8, sourceDurationSeconds: 1.5 });
    expect(getAudioTrackFrameLength(track, 30)).toBe(45);
    expect(getAudioTrackFrameRange(track, 30)).toEqual({
      startFrame: 8,
      endFrameExclusive: 53,
    });
    expect(isAudioTrackActiveAtFrame(track, 8, 30)).toBe(true);
    expect(isAudioTrackActiveAtFrame(track, 53, 30)).toBe(false);
    expect(getAudioTrackCurrentTimeSeconds(track, 23, 30)).toBeCloseTo(0.5);
  });

  it("loads audio metadata from a preview element", async () => {
    const listeners = new Map<string, EventListenerOrEventListenerObject>();
    const audio: PreviewAudioLike & { duration?: number } = {
      currentTime: 0,
      volume: 1,
      muted: false,
      paused: true,
      duration: 2.75,
      play: vi.fn(),
      pause: vi.fn(),
      addEventListener: vi.fn((type, listener) => {
        listeners.set(type, listener);
      }),
      removeEventListener: vi.fn((type) => {
        listeners.delete(type);
      }),
    };

    const promise = loadAudioTrackMetadata(TEST_AUDIO_PATH, () => {
      queueMicrotask(() => {
        const listener = listeners.get("loadedmetadata");
        if (typeof listener === "function") listener(new Event("loadedmetadata"));
      });
      return audio;
    });

    await expect(promise).resolves.toEqual({
      name: "voice.wav",
      durationSeconds: 2.75,
    });
  });
});

describe("TimelineAudioPreviewController", () => {
  it("plays an active track only once while it stays active", () => {
    let playCount = 0;
    let pauseCount = 0;
    const element: PreviewAudioLike = {
      currentTime: 0,
      volume: 1,
      muted: false,
      paused: true,
      play: () => {
        playCount += 1;
        element.paused = false;
      },
      pause: () => {
        pauseCount += 1;
        element.paused = true;
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const controller = new TimelineAudioPreviewController(() => element);
    const clip = createClip({ audioTracks: [createTrack({ startFrame: 0 })] });

    controller.sync(clip, 5, true);
    controller.sync(clip, 6, true);

    expect(playCount).toBe(1);
    expect(pauseCount).toBe(0);
  });

  it("pauses and rewinds tracks when they become inactive", () => {
    let pauseCount = 0;
    const element: PreviewAudioLike = {
      currentTime: 0.8,
      volume: 1,
      muted: false,
      paused: false,
      play: vi.fn(),
      pause: () => {
        pauseCount += 1;
        element.paused = true;
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const controller = new TimelineAudioPreviewController(() => element);
    const clip = createClip({
      audioTracks: [createTrack({ startFrame: 0, sourceDurationSeconds: 0.5 })],
    });

    controller.sync(clip, 0, true);
    controller.sync(clip, 30, false);

    expect(pauseCount).toBe(1);
    expect(element.currentTime).toBe(0);
  });

  it("warns only once when playback fails", () => {
    const warning = vi.fn();
    const element: PreviewAudioLike = {
      currentTime: 0,
      volume: 1,
      muted: false,
      paused: true,
      play: () => Promise.reject(new Error("boom")),
      pause: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const controller = new TimelineAudioPreviewController(() => element, warning);
    const clip = createClip({ audioTracks: [createTrack({ startFrame: 0 })] });

    controller.sync(clip, 1, true);
    controller.sync(clip, 2, true);

    return Promise.resolve().then(() => {
      expect(warning).toHaveBeenCalledTimes(1);
      expect(warning).toHaveBeenCalledWith("Audio preview playback failed.");
    });
  });
});
