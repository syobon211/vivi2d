import { LIPSYNC_DEFAULTS } from "@vivi2d/core/constants";
import type { VisemeType } from "@vivi2d/core/types";

export class LipSyncAnalyser {
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | AudioBufferSourceNode | null = null;
  private stream: MediaStream | null = null;
  private dataArray: Float32Array | null = null;

  async connectMicrophone(): Promise<void> {
    this.dispose();

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const { context, analyser } = this.initAudioPipeline();

    const source = context.createMediaStreamSource(stream);
    source.connect(analyser);

    this.source = source;
    this.stream = stream;
  }

  async connectAudioFile(buffer: ArrayBuffer): Promise<void> {
    this.dispose();

    const { context, analyser } = this.initAudioPipeline();

    const audioBuffer = await context.decodeAudioData(buffer);
    const source = context.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(analyser);
    analyser.connect(context.destination);
    source.loop = true;
    source.start(0);

    this.source = source;
  }

  private initAudioPipeline(): { context: AudioContext; analyser: AnalyserNode } {
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = LIPSYNC_DEFAULTS.FFT_SIZE;

    this.context = context;
    this.analyser = analyser;
    this.dataArray = new Float32Array(analyser.fftSize);

    return { context, analyser };
  }

  getRmsVolume(
    gain: number = LIPSYNC_DEFAULTS.GAIN,
    threshold: number = LIPSYNC_DEFAULTS.THRESHOLD,
  ): number {
    if (!this.analyser || !this.dataArray) return 0;

    this.analyser.getFloatTimeDomainData(this.dataArray as Float32Array<ArrayBuffer>);

    let sumSquares = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
      const sample = this.dataArray[i] ?? 0;
      sumSquares += sample * sample;
    }
    const rms = Math.sqrt(sumSquares / this.dataArray.length);
    const normalized = Math.min(rms * gain, 1);

    return normalized < threshold ? 0 : normalized;
  }

  get isConnected(): boolean {
    return this.context !== null && this.context.state !== "closed";
  }

  dispose(): void {
    if (this.source) {
      this.source.disconnect();
      if ("stop" in this.source) {
        try {
          (this.source as AudioBufferSourceNode).stop();
        } catch {}
      }
      this.source = null;
    }

    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
      this.stream = null;
    }

    if (this.analyser) {
      this.analyser.disconnect();
      this.analyser = null;
    }

    if (this.context) {
      this.context.close().catch(() => {});
      this.context = null;
    }

    this.dataArray = null;
  }

  getFrequencyBands(): { low: number; mid: number; high: number } {
    if (!this.analyser) return { low: 0, mid: 0, high: 0 };

    const bufferLength = this.analyser.frequencyBinCount;
    const freqData = new Uint8Array(bufferLength);
    this.analyser.getByteFrequencyData(freqData);

    const sampleRate = this.context?.sampleRate ?? 44100;
    const binWidth = sampleRate / (bufferLength * 2);
    const lowEnd = Math.floor(500 / binWidth);
    const midEnd = Math.floor(2000 / binWidth);
    const highEnd = Math.min(Math.floor(8000 / binWidth), bufferLength);

    let low = 0;
    let mid = 0;
    let high = 0;

    for (let i = 0; i < lowEnd && i < bufferLength; i++) {
      low += freqData[i]! / 255;
    }
    for (let i = lowEnd; i < midEnd && i < bufferLength; i++) {
      mid += freqData[i]! / 255;
    }
    for (let i = midEnd; i < highEnd && i < bufferLength; i++) {
      high += freqData[i]! / 255;
    }

    const lowCount = Math.max(lowEnd, 1);
    const midCount = Math.max(midEnd - lowEnd, 1);
    const highCount = Math.max(highEnd - midEnd, 1);

    return {
      low: low / lowCount,
      mid: mid / midCount,
      high: high / highCount,
    };
  }
}

export function smoothVolume(
  rawVolume: number,
  previousSmoothed: number,
  smoothing: number,
): number {
  return previousSmoothed + (rawVolume - previousSmoothed) * (1 - smoothing);
}

export function detectViseme(
  bands: { low: number; mid: number; high: number },
  threshold = 0.05,
): { viseme: VisemeType; confidence: number } {
  const total = bands.low + bands.mid + bands.high;

  if (total < threshold) {
    return { viseme: "sil", confidence: 1 };
  }

  const lowRatio = bands.low / total;
  const midRatio = bands.mid / total;
  const highRatio = bands.high / total;

  if (highRatio > 0.5) {
    return highRatio > 0.65
      ? { viseme: "ss", confidence: highRatio }
      : { viseme: "ff", confidence: highRatio };
  }

  if (lowRatio > 0.5) {
    if (lowRatio > 0.7) return { viseme: "aa", confidence: lowRatio };
    if (midRatio > 0.2) return { viseme: "oh", confidence: lowRatio };
    return { viseme: "ou", confidence: lowRatio };
  }

  if (midRatio > 0.45) {
    if (bands.mid > 0.3) return { viseme: "eh", confidence: midRatio };
    return { viseme: "ih", confidence: midRatio };
  }

  if (lowRatio > 0.3 && midRatio > 0.3) {
    return total > 0.3
      ? { viseme: "pp", confidence: 0.5 }
      : { viseme: "kk", confidence: 0.5 };
  }

  return { viseme: "nn", confidence: 0.4 };
}
