import { describe, expect, it, vi } from "vitest";
import type { AudioTrack, LipSyncTrack } from "@vivi2d/core/types";
import {
  bakeRmsLipSyncTrackFromAudioBuffer,
  computeRmsLipSyncSamples,
  evaluateLipSyncTracksAtFrame,
  getLipSyncTrackSampleAtFrame,
  getLipSyncTrackSourceAudioTrack,
  isLipSyncTrackStale,
  mixDecodedAudioToMono,
  type AudioContextLike,
  type DecodedAudioLike,
} from "@/lib/timeline-lipsync";

function makeAudioTrack(overrides: Partial<AudioTrack> = {}): AudioTrack {
  return {
    id: "audio-1",
    name: "Voice",
    sourcePath: "voice.wav",
    startFrame: 10,
    sourceDurationSeconds: 2,
    gain: 1,
    muted: false,
    ...overrides,
  };
}

function makeLipSyncTrack(overrides: Partial<LipSyncTrack> = {}): LipSyncTrack {
  return {
    id: "lip-1",
    name: "Lip Sync",
    sourceAudioTrackId: "audio-1",
    analysisType: "rms",
    analysisFps: 10,
    samples: [0.2, 0.7, 2],
    targetParameterId: "param-mouth",
    sourcePathAtBake: "voice.wav",
    sourceDurationSecondsAtBake: 2,
    gain: 1,
    muted: false,
    ...overrides,
  };
}

describe("timeline lip-sync baking and evaluation", () => {
  it("returns no RMS samples for invalid analysis inputs", () => {
    expect(computeRmsLipSyncSamples(new Float32Array([1]), 0, 30, 1, 0, 0)).toEqual(
      [],
    );
    expect(computeRmsLipSyncSamples(new Float32Array(), 48_000, 30, 1, 0, 0)).toEqual(
      [],
    );
    expect(computeRmsLipSyncSamples(new Float32Array([1]), 48_000, 0, 1, 0, 0)).toEqual(
      [],
    );
  });

  it("computes exact RMS windows, thresholding and nonzero smoothing", () => {
    // sqrt(((1/8)^2 + (7/8)^2)/2) = 5/8 in each two-sample window.
    expect(computeRmsLipSyncSamples(
      new Float32Array([0.125, 0.875, 0.125, 0.875]), 4, 2, 1, 0, 0,
    )).toEqual([0.625, 0.625]);
    const mono = new Float32Array([0, 0.25, 0.5, 1]);
    // One-sample RMS = abs(sample); gain 2 is capped at 1 before threshold .75.
    expect(computeRmsLipSyncSamples(mono, 1, 1, 2, 0.75, 0)).toEqual([0, 0, 1, 1]);
    expect(computeRmsLipSyncSamples(mono, 1, 1, 2, 0.75, 0.5)).toEqual([0, 0, 0.5, 0.75]);
  });

  it("mixes decoded audio channels to mono and tolerates uneven channel lengths", () => {
    const decoded: DecodedAudioLike = {
      sampleRate: 4,
      numberOfChannels: 2,
      duration: 1,
      getChannelData: (channel) =>
        channel === 0 ? new Float32Array([1, 0, -1]) : new Float32Array([0, 1]),
    };

    expect(Array.from(mixDecodedAudioToMono(decoded))).toEqual([0.5, 0.5, -0.5]);
  });

  it("bakes an RMS lip-sync track and closes the audio context", async () => {
    const close = vi.fn();
    const context: AudioContextLike = {
      decodeAudioData: vi.fn().mockResolvedValue({
        sampleRate: 4,
        numberOfChannels: 1,
        duration: 1,
        getChannelData: () => new Float32Array([0, 0.5, 1, 0.5]),
      } satisfies DecodedAudioLike),
      close,
    };

    const result = await bakeRmsLipSyncTrackFromAudioBuffer(
      new ArrayBuffer(4),
      {
        sourceTrack: makeAudioTrack(),
        analysisFps: 4,
        targetParameterId: "param-mouth",
        threshold: 0,
        smoothing: 0,
        gain: 1,
      },
      () => context,
    );

    expect(result.decodedDurationSeconds).toBe(1);
    expect(result.track).toMatchObject({
      name: "Lip Sync: Voice",
      sourceAudioTrackId: "audio-1",
      targetParameterId: "param-mouth",
      sourcePathAtBake: "voice.wav",
    });
    expect(result.track.samples.length).toBeGreaterThan(0);
    expect(close).toHaveBeenCalled();
  });

  it("rejects invalid bake targets and analysis rates", async () => {
    const sourceTrack = makeAudioTrack();
    await expect(
      bakeRmsLipSyncTrackFromAudioBuffer(new ArrayBuffer(0), {
        sourceTrack,
        analysisFps: 30,
        targetParameterId: null,
        threshold: 0,
        smoothing: 0,
        gain: 1,
      }),
    ).rejects.toThrow("parameter target");

    await expect(
      bakeRmsLipSyncTrackFromAudioBuffer(new ArrayBuffer(0), {
        sourceTrack,
        analysisFps: 0,
        targetParameterId: "param-mouth",
        threshold: 0,
        smoothing: 0,
        gain: 1,
      }),
    ).rejects.toThrow("analysisFps");
  });

  it("detects stale baked lip-sync tracks from source metadata changes", () => {
    const track = makeLipSyncTrack();
    expect(isLipSyncTrackStale(track, null)).toBe(false);
    expect(isLipSyncTrackStale(track, makeAudioTrack())).toBe(false);
    expect(isLipSyncTrackStale(track, makeAudioTrack({ sourcePath: "other.wav" }))).toBe(
      true,
    );
    expect(isLipSyncTrackStale(track, makeAudioTrack({ sourceDurationSeconds: 3 }))).toBe(
      true,
    );
  });

  it("samples and evaluates lip-sync tracks at animation frames", () => {
    const sourceTrack = makeAudioTrack();
    const lipTrack = makeLipSyncTrack({ gain: 2 });
    const clip = {
      fps: 10,
      audioTracks: [sourceTrack],
      lipSyncTracks: [
        lipTrack,
        makeLipSyncTrack({ id: "muted", muted: true, samples: [1] }),
        makeLipSyncTrack({ id: "orphan", sourceAudioTrackId: "missing", samples: [1] }),
      ],
    };

    expect(getLipSyncTrackSourceAudioTrack(clip, lipTrack)).toBe(sourceTrack);
    expect(getLipSyncTrackSampleAtFrame(0, sourceTrack, lipTrack, 20)).toBe(0);
    expect(getLipSyncTrackSampleAtFrame(10, sourceTrack, lipTrack, 9)).toBe(0);
    expect(getLipSyncTrackSampleAtFrame(10, sourceTrack, lipTrack, 11)).toBe(0.7);
    expect(getLipSyncTrackSampleAtFrame(10, sourceTrack, lipTrack, 40)).toBe(0);
    expect(evaluateLipSyncTracksAtFrame(clip, 11).parameterValues).toEqual({
      "param-mouth": 1,
    });
  });
});
