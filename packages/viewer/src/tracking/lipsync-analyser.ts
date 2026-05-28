import { LIPSYNC_DEFAULTS } from "@vivi2d/core/constants";

export type Vowel = "a" | "i" | "u" | "e" | "o" | "silent";

export type OnVolumeCallback = (volume: number, vowel?: Vowel) => void;

export type LipSyncMode = "rms" | "viseme";

export class LipSyncAnalyser {
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private dataArray: Float32Array = new Float32Array(0);
  private freqArray: Float32Array = new Float32Array(0);
  private running = false;
  private animationId = 0;
  private onVolume: OnVolumeCallback | null = null;
  private prevVolume = 0;
  private mode: LipSyncMode = "rms";

  async init(mode: LipSyncMode = "rms"): Promise<void> {
    this.mode = mode;
    this.context = new AudioContext();
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = LIPSYNC_DEFAULTS.FFT_SIZE;
    this.dataArray = new Float32Array(this.analyser.fftSize);
    this.freqArray = new Float32Array(this.analyser.frequencyBinCount);

    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.source = this.context.createMediaStreamSource(this.stream);
    this.source.connect(this.analyser);
  }

  get currentMode(): LipSyncMode {
    return this.mode;
  }

  start(callback: OnVolumeCallback): void {
    this.onVolume = callback;
    this.running = true;
    this.prevVolume = 0;
    this.analyse();
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
    this.source?.disconnect();
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
      this.stream = null;
    }
    this.analyser?.disconnect();
    void this.context?.close();
    this.context = null;
    this.analyser = null;
    this.source = null;
  }

  private analyse(): void {
    if (!this.running || !this.analyser) return;

    this.analyser.getFloatTimeDomainData(this.dataArray as Float32Array<ArrayBuffer>);

    let sum = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
      sum += this.dataArray[i]! * this.dataArray[i]!;
    }
    let rms = Math.sqrt(sum / this.dataArray.length);

    rms *= LIPSYNC_DEFAULTS.GAIN;
    if (rms < LIPSYNC_DEFAULTS.THRESHOLD) rms = 0;
    rms = Math.min(rms, 1);

    const smoothed =
      this.prevVolume * LIPSYNC_DEFAULTS.SMOOTHING +
      rms * (1 - LIPSYNC_DEFAULTS.SMOOTHING);
    this.prevVolume = smoothed;

    let vowel: Vowel | undefined;
    if (this.mode === "viseme" && smoothed > 0) {
      vowel = this.estimateVowel();
    }

    this.onVolume?.(smoothed, vowel);

    this.animationId = requestAnimationFrame(() => this.analyse());
  }

  private estimateVowel(): Vowel {
    if (!this.analyser || !this.context) return "silent";

    this.analyser.getFloatFrequencyData(this.freqArray as Float32Array<ArrayBuffer>);

    const sampleRate = this.context.sampleRate;
    const binCount = this.freqArray.length;
    const binFreq = sampleRate / (binCount * 2);

    const f1Min = Math.floor(200 / binFreq);
    const f1Max = Math.ceil(1000 / binFreq);
    const f2Min = Math.floor(700 / binFreq);
    const f2Max = Math.ceil(2800 / binFreq);

    const f1Bin = findPeakBin(this.freqArray, f1Min, f1Max);
    const f1 = f1Bin * binFreq;

    const f2SearchMin = Math.max(f2Min, f1Bin + Math.floor(200 / binFreq));
    const f2Bin = findPeakBin(this.freqArray, f2SearchMin, f2Max);
    const f2 = f2Bin * binFreq;

    return classifyVowel(f1, f2);
  }
}

function findPeakBin(freqData: Float32Array, minBin: number, maxBin: number): number {
  let peakBin = minBin;
  let peakValue = -Infinity;

  const end = Math.min(maxBin, freqData.length - 1);
  for (let i = minBin; i <= end; i++) {
    if (freqData[i]! > peakValue) {
      peakValue = freqData[i]!;
      peakBin = i;
    }
  }

  return peakBin;
}

function classifyVowel(f1: number, f2: number): Vowel {
  if (f2 > 1600) {
    return f1 < 400 ? "i" : "e";
  }

  if (f2 < 1200) {
    return f1 < 400 ? "u" : "o";
  }

  if (f1 > 500) {
    return "a";
  }

  return "o";
}

export function vowelToMouthParams(
  vowel: Vowel,
  volume: number,
): { mouthOpen: number; mouthForm: number } {
  const v = Math.min(volume * 1.5, 1);

  switch (vowel) {
    case "a":
      return { mouthOpen: v, mouthForm: 0.5 };
    case "i":
      return { mouthOpen: v * 0.3, mouthForm: 0.8 };
    case "u":
      return { mouthOpen: v * 0.4, mouthForm: 0.2 };
    case "e":
      return { mouthOpen: v * 0.5, mouthForm: 0.7 };
    case "o":
      return { mouthOpen: v * 0.6, mouthForm: 0.3 };
    case "silent":
      return { mouthOpen: 0, mouthForm: 0.5 };
  }
}
