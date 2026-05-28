export type RecordingFormat = "webm" | "mp4" | "gif";

export type RecordingState = "idle" | "recording" | "processing";

export interface RecordingOptions {
  format?: RecordingFormat;

  fps?: number;

  quality?: number;

  maxDuration?: number;
}

const DEFAULT_OPTIONS: Required<RecordingOptions> = {
  format: "webm",
  fps: 15,
  quality: 0.8,
  maxDuration: 60,
};

export type OnRecordingStateChange = (state: RecordingState, elapsed: number) => void;

export class ViewerRecorder {
  private canvas: HTMLCanvasElement;
  private state: RecordingState = "idle";
  private onStateChange: OnRecordingStateChange | null = null;

  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];

  private gifFrames: ImageData[] = [];
  private gifCaptureId = 0;

  private startTime = 0;
  private elapsedTimerId = 0;
  private options: Required<RecordingOptions> = DEFAULT_OPTIONS;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  get recordingState(): RecordingState {
    return this.state;
  }

  start(
    options?: RecordingOptions,
    onStateChange?: OnRecordingStateChange,
  ): RecordingFormat {
    if (this.state !== "idle") throw new Error("Recording is already in progress");

    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.onStateChange = onStateChange ?? null;
    this.startTime = performance.now();

    if (this.options.format === "gif") {
      this.startGifCapture();
    } else {
      this.startMediaRecorder();
    }

    this.state = "recording";
    this.startElapsedTimer();
    this.onStateChange?.(this.state, 0);

    setTimeout(() => {
      if (this.state === "recording") this.stop();
    }, this.options.maxDuration * 1000);

    return this.options.format;
  }

  async stop(): Promise<Blob> {
    if (this.state !== "recording") throw new Error("Recording is not in progress");

    this.clearElapsedTimer();
    this.state = "processing";
    this.onStateChange?.(this.state, this.elapsed());

    let blob: Blob;
    if (this.options.format === "gif") {
      blob = await this.stopGifCapture();
    } else {
      blob = await this.stopMediaRecorder();
    }

    this.state = "idle";
    this.onStateChange?.(this.state, 0);
    return blob;
  }

  cancel(): void {
    this.clearElapsedTimer();
    if (this.recorder && this.recorder.state !== "inactive") {
      this.recorder.stop();
    }
    if (this.gifCaptureId) {
      clearInterval(this.gifCaptureId);
      this.gifCaptureId = 0;
    }
    this.chunks = [];
    this.gifFrames = [];
    this.recorder = null;
    this.state = "idle";
  }

  private elapsed(): number {
    return (performance.now() - this.startTime) / 1000;
  }

  // MediaRecorder (WebM/MP4)

  private startMediaRecorder(): void {
    const stream = this.canvas.captureStream(30);
    const mimeType = this.selectMimeType();
    this.chunks = [];

    this.recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: Math.floor(2_500_000 * this.options.quality),
    });

    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };

    this.recorder.start(100);
  }

  private stopMediaRecorder(): Promise<Blob> {
    return new Promise((resolve) => {
      if (!this.recorder) {
        resolve(new Blob());
        return;
      }
      this.recorder.onstop = () => {
        const mimeType = this.recorder?.mimeType ?? "video/webm";
        const blob = new Blob(this.chunks, { type: mimeType });
        this.chunks = [];
        this.recorder = null;
        resolve(blob);
      };
      this.recorder.stop();
    });
  }

  private selectMimeType(): string {
    if (this.options.format === "mp4") {
      const mp4Types = ["video/mp4;codecs=h264", "video/mp4;codecs=avc1", "video/mp4"];
      for (const t of mp4Types) {
        if (MediaRecorder.isTypeSupported(t)) return t;
      }
    }
    const webmTypes = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
    for (const t of webmTypes) {
      if (MediaRecorder.isTypeSupported(t)) return t;
    }
    return "video/webm";
  }

  private startGifCapture(): void {
    this.gifFrames = [];
    const interval = Math.round(1000 / this.options.fps);
    this.gifCaptureId = window.setInterval(() => {
      this.captureGifFrame();
    }, interval);
  }

  private captureGifFrame(): void {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    const imageData = ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    this.gifFrames.push(imageData);
  }

  private async stopGifCapture(): Promise<Blob> {
    clearInterval(this.gifCaptureId);
    this.gifCaptureId = 0;

    if (this.gifFrames.length === 0) return new Blob();

    const w = this.canvas.width;
    const h = this.canvas.height;
    const delay = Math.round(100 / this.options.fps);
    const data = encodeGif(this.gifFrames, w, h, delay);
    this.gifFrames = [];
    return new Blob([data.buffer as ArrayBuffer], { type: "image/gif" });
  }

  private startElapsedTimer(): void {
    this.elapsedTimerId = window.setInterval(() => {
      if (this.state === "recording") {
        this.onStateChange?.(this.state, this.elapsed());
      }
    }, 200);
  }

  private clearElapsedTimer(): void {
    if (this.elapsedTimerId) {
      clearInterval(this.elapsedTimerId);
      this.elapsedTimerId = 0;
    }
  }
}

function encodeGif(
  frames: ImageData[],
  width: number,
  height: number,
  delay: number,
): Uint8Array {
  const buf: number[] = [];

  writeStr(buf, "GIF89a");
  writeU16(buf, width);
  writeU16(buf, height);
  buf.push(0x70, 0x00, 0x00); // GCT flag off, bgcolor 0, aspect 0

  buf.push(0x21, 0xff, 0x0b);
  writeStr(buf, "NETSCAPE2.0");
  buf.push(0x03, 0x01);
  writeU16(buf, 0);
  buf.push(0x00);

  for (const frame of frames) {
    const { palette, indexedPixels } = quantize(frame.data, width * height);

    // Graphic Control Extension
    buf.push(0x21, 0xf9, 0x04);
    buf.push(0x08); // disposal: restore to background, no transparency
    writeU16(buf, delay);
    buf.push(0x00, 0x00); // transparent color index, terminator

    // Image Descriptor
    buf.push(0x2c);
    writeU16(buf, 0); // left
    writeU16(buf, 0); // top
    writeU16(buf, width);
    writeU16(buf, height);
    buf.push(0x87);

    // Local Color Table (256 * 3 bytes)
    for (let i = 0; i < 256; i++) {
      buf.push(palette[i * 3]!, palette[i * 3 + 1]!, palette[i * 3 + 2]!);
    }

    const minCodeSize = 8;
    buf.push(minCodeSize);
    const lzwData = lzwEncode(indexedPixels, minCodeSize);
    let offset = 0;
    while (offset < lzwData.length) {
      const chunkSize = Math.min(255, lzwData.length - offset);
      buf.push(chunkSize);
      for (let i = 0; i < chunkSize; i++) {
        buf.push(lzwData[offset + i]!);
      }
      offset += chunkSize;
    }
    buf.push(0x00);
  }

  buf.push(0x3b);

  return new Uint8Array(buf);
}

function quantize(
  rgba: Uint8ClampedArray,
  pixelCount: number,
): { palette: number[]; indexedPixels: Uint8Array } {
  const colorMap = new Map<number, number>();
  for (let i = 0; i < pixelCount; i++) {
    const r = rgba[i * 4]! >> 3;
    const g = rgba[i * 4 + 1]! >> 3;
    const b = rgba[i * 4 + 2]! >> 3;
    const key = (r << 10) | (g << 5) | b;
    colorMap.set(key, (colorMap.get(key) ?? 0) + 1);
  }

  const sorted = [...colorMap.entries()].sort((a, b) => b[1] - a[1]);
  const palette: number[] = new Array(768).fill(0);
  const paletteKeys = new Map<number, number>();

  const count = Math.min(256, sorted.length);
  for (let i = 0; i < count; i++) {
    const key = sorted[i]![0];
    const r = ((key >> 10) & 0x1f) << 3;
    const g = ((key >> 5) & 0x1f) << 3;
    const b = (key & 0x1f) << 3;
    palette[i * 3] = r;
    palette[i * 3 + 1] = g;
    palette[i * 3 + 2] = b;
    paletteKeys.set(key, i);
  }

  const indexedPixels = new Uint8Array(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    const r = rgba[i * 4]! >> 3;
    const g = rgba[i * 4 + 1]! >> 3;
    const b = rgba[i * 4 + 2]! >> 3;
    const key = (r << 10) | (g << 5) | b;
    const exact = paletteKeys.get(key);
    if (exact !== undefined) {
      indexedPixels[i] = exact;
    } else {
      indexedPixels[i] = findNearestColor(r << 3, g << 3, b << 3, palette, count);
    }
  }

  return { palette, indexedPixels };
}

function findNearestColor(
  r: number,
  g: number,
  b: number,
  palette: number[],
  count: number,
): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < count; i++) {
    const dr = r - palette[i * 3]!;
    const dg = g - palette[i * 3 + 1]!;
    const db = b - palette[i * 3 + 2]!;
    const dist = dr * dr + dg * dg + db * db;
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

function lzwEncode(pixels: Uint8Array, minCodeSize: number): Uint8Array {
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;

  let codeSize = minCodeSize + 1;
  let nextCode = eoiCode + 1;
  const maxTableSize = 4096;

  let table = new Map<string, number>();
  const initTable = () => {
    table = new Map();
    for (let i = 0; i < clearCode; i++) {
      table.set(String(i), i);
    }
    codeSize = minCodeSize + 1;
    nextCode = eoiCode + 1;
  };

  const output: number[] = [];
  let bitBuffer = 0;
  let bitCount = 0;

  const writeBits = (code: number, bits: number) => {
    bitBuffer |= code << bitCount;
    bitCount += bits;
    while (bitCount >= 8) {
      output.push(bitBuffer & 0xff);
      bitBuffer >>= 8;
      bitCount -= 8;
    }
  };

  initTable();
  writeBits(clearCode, codeSize);

  if (pixels.length === 0) {
    writeBits(eoiCode, codeSize);
    if (bitCount > 0) output.push(bitBuffer & 0xff);
    return new Uint8Array(output);
  }

  let current = String(pixels[0]!);

  for (let i = 1; i < pixels.length; i++) {
    const next = `${current},${pixels[i]!}`;
    if (table.has(next)) {
      current = next;
    } else {
      writeBits(table.get(current)!, codeSize);

      if (nextCode < maxTableSize) {
        table.set(next, nextCode++);
        if (nextCode > 1 << codeSize && codeSize < 12) {
          codeSize++;
        }
      } else {
        writeBits(clearCode, codeSize);
        initTable();
      }

      current = String(pixels[i]!);
    }
  }

  writeBits(table.get(current)!, codeSize);
  writeBits(eoiCode, codeSize);
  if (bitCount > 0) output.push(bitBuffer & 0xff);

  return new Uint8Array(output);
}

function writeU16(buf: number[], value: number): void {
  buf.push(value & 0xff, (value >> 8) & 0xff);
}

function writeStr(buf: number[], str: string): void {
  for (let i = 0; i < str.length; i++) {
    buf.push(str.charCodeAt(i));
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function getRecordingExtension(format: RecordingFormat): string {
  switch (format) {
    case "webm":
      return "webm";
    case "mp4":
      return "mp4";
    case "gif":
      return "gif";
  }
}
