import type { AnimationClip, AudioTrack, LipSyncTrack } from "@vivi2d/core/types";

export interface BakeRmsLipSyncTrackOptions {
  sourceTrack: AudioTrack;
  analysisFps: number;
  targetParameterId: string | null;
  threshold: number;
  smoothing: number;
  gain: number;
}

export interface BakedLipSyncTrackResult {
  track: LipSyncTrack;
  decodedDurationSeconds: number;
}

export interface DecodedAudioLike {
  sampleRate: number;
  numberOfChannels: number;
  duration: number;
  getChannelData(channel: number): Float32Array;
}

export interface AudioContextLike {
  decodeAudioData(buffer: ArrayBuffer): Promise<DecodedAudioLike>;
  close?: () => Promise<void> | void;
}

export interface EvaluatedLipSyncTrackValues {
  parameterValues: Record<string, number>;
}

export function createAudioContextForLipSync(): AudioContextLike {
  return new AudioContext();
}

export function computeRmsLipSyncSamples(
  monoSamples: Float32Array,
  sampleRate: number,
  analysisFps: number,
  gain: number,
  threshold: number,
  smoothing: number,
): number[] {
  if (analysisFps <= 0 || sampleRate <= 0 || monoSamples.length === 0) {
    return [];
  }

  const sampleCount = Math.max(
    1,
    Math.ceil((monoSamples.length / sampleRate) * analysisFps),
  );
  const windowSize = Math.max(1, Math.round(sampleRate / analysisFps));
  const halfWindow = Math.floor(windowSize / 2);
  const values = new Array<number>(sampleCount);
  let previousSmoothed = 0;

  for (let i = 0; i < sampleCount; i++) {
    const centerSample = Math.round((i / analysisFps) * sampleRate);
    const start = Math.max(0, centerSample - halfWindow);
    const end = Math.min(monoSamples.length, start + windowSize);
    let sumSquares = 0;
    const width = Math.max(1, end - start);
    for (let cursor = start; cursor < end; cursor++) {
      const sample = monoSamples[cursor] ?? 0;
      sumSquares += sample * sample;
    }
    const rms = Math.sqrt(sumSquares / width);
    const normalized = Math.min(Math.max(rms * gain, 0), 1);
    const thresholded = normalized < threshold ? 0 : normalized;
    const smoothed =
      previousSmoothed + (thresholded - previousSmoothed) * (1 - smoothing);
    previousSmoothed = smoothed;
    values[i] = clampNormalized(smoothed);
  }

  return values;
}

export async function bakeRmsLipSyncTrackFromAudioBuffer(
  audioBufferData: ArrayBuffer,
  options: BakeRmsLipSyncTrackOptions,
  createContext: () => AudioContextLike = createAudioContextForLipSync,
): Promise<BakedLipSyncTrackResult> {
  if (options.targetParameterId == null) {
    throw new Error("Lip sync bake requires a parameter target.");
  }
  if (options.analysisFps <= 0) {
    throw new Error("Lip sync analysisFps must be greater than zero.");
  }

  const context = createContext();
  try {
    const decoded = await context.decodeAudioData(audioBufferData.slice(0));
    const monoSamples = mixDecodedAudioToMono(decoded);
    const samples = computeRmsLipSyncSamples(
      monoSamples,
      decoded.sampleRate,
      options.analysisFps,
      options.gain,
      options.threshold,
      options.smoothing,
    );

    return {
      track: {
        id: crypto.randomUUID(),
        name: `Lip Sync: ${options.sourceTrack.name}`,
        sourceAudioTrackId: options.sourceTrack.id,
        analysisType: "rms",
        analysisFps: options.analysisFps,
        samples,
        targetParameterId: options.targetParameterId,
        sourcePathAtBake: options.sourceTrack.sourcePath,
        sourceDurationSecondsAtBake:
          options.sourceTrack.sourceDurationSeconds ?? decoded.duration,
        gain: 1,
        muted: false,
      },
      decodedDurationSeconds: decoded.duration,
    };
  } finally {
    await context.close?.();
  }
}

export function mixDecodedAudioToMono(decoded: DecodedAudioLike): Float32Array {
  const channelCount = Math.max(1, decoded.numberOfChannels);
  const reference = decoded.getChannelData(0);
  const mixed = new Float32Array(reference.length);
  for (let channel = 0; channel < channelCount; channel++) {
    const channelData = decoded.getChannelData(channel);
    const limit = Math.min(channelData.length, mixed.length);
    for (let i = 0; i < limit; i++) {
      const current = mixed[i] ?? 0;
      mixed[i] = current + (channelData[i] ?? 0) / channelCount;
    }
  }
  return mixed;
}

export function isLipSyncTrackStale(
  track: LipSyncTrack,
  sourceTrack: AudioTrack | null | undefined,
): boolean {
  if (!sourceTrack) return false;
  return (
    sourceTrack.sourcePath !== track.sourcePathAtBake ||
    sourceTrack.sourceDurationSeconds !== track.sourceDurationSecondsAtBake
  );
}

export function getLipSyncTrackSourceAudioTrack(
  clip: Pick<AnimationClip, "audioTracks">,
  track: LipSyncTrack,
): AudioTrack | null {
  return (
    clip.audioTracks?.find((audioTrack) => audioTrack.id === track.sourceAudioTrackId) ??
    null
  );
}

export function getLipSyncTrackSampleAtFrame(
  clipFps: number,
  sourceTrack: AudioTrack,
  track: LipSyncTrack,
  frame: number,
): number {
  if (clipFps <= 0 || track.analysisFps <= 0 || track.samples.length === 0) {
    return 0;
  }
  const seconds = (frame - sourceTrack.startFrame) / clipFps;
  if (seconds < 0) return 0;
  const sampleIndex = Math.floor(seconds * track.analysisFps);
  if (sampleIndex < 0 || sampleIndex >= track.samples.length) return 0;
  return clampNormalized(track.samples[sampleIndex] ?? 0);
}

export function evaluateLipSyncTracksAtFrame(
  clip: Pick<AnimationClip, "fps" | "audioTracks" | "lipSyncTracks">,
  frame: number,
): EvaluatedLipSyncTrackValues {
  const parameterValues: Record<string, number> = {};
  for (const track of clip.lipSyncTracks ?? []) {
    if (track.muted) continue;
    const sourceTrack = getLipSyncTrackSourceAudioTrack(clip, track);
    if (!sourceTrack) continue;
    const value = clampNormalized(
      getLipSyncTrackSampleAtFrame(clip.fps, sourceTrack, track, frame) * track.gain,
    );
    if (track.targetParameterId) {
      parameterValues[track.targetParameterId] = Math.max(
        parameterValues[track.targetParameterId] ?? 0,
        value,
      );
    }
  }
  return { parameterValues };
}

function clampNormalized(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}
