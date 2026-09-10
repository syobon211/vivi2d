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

// Bounds retained raw ImageData only, not scratch/encoder/process peak memory.
const MAX_RETAINED_GIF_FRAME_BYTES = 128 * 1024 * 1024;
const RECORDING_FAILED = "Recording failed.";

interface RecordingSession {
  state: "recording" | "processing";
  options: Required<RecordingOptions>;
  width: number;
  height: number;
  frameBytes: number;
  startedAt: number;
  onStateChange?: OnRecordingStateChange;
  onAutoComplete?: (blob: Blob) => void;
  onError?: (error: Error) => void;
  recorder: MediaRecorder | null;
  nativeStopObserved: boolean;
  stream: MediaStream | null;
  chunks: Blob[];
  frames: ImageData[];
  retainedBytes: number;
  context: CanvasRenderingContext2D | null;
  scratch: HTMLCanvasElement | null;
  captureTimer: number | null;
  elapsedTimer: number | null;
  deadlineTimer: number | null;
  stopPromise?: Promise<Blob>;
  resolveStop?: (blob: Blob) => void;
  rejectStop?: (error: Error) => void;
  cancelled: boolean;
}

export class ViewerRecorder {
  private session: RecordingSession | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly beforeCapture?: () => void,
  ) {}

  get recordingState(): RecordingState {
    return this.session?.state ?? "idle";
  }

  start(
    options?: RecordingOptions,
    onStateChange?: OnRecordingStateChange,
    onAutoComplete?: (blob: Blob) => void,
    onError?: (error: Error) => void,
  ): RecordingFormat {
    if (this.session) throw new Error("Recording is already in progress");
    const settings = { ...DEFAULT_OPTIONS, ...options };
    const { width, height } = this.canvas;
    validateRecordingOptions(settings);
    const frameBytes = settings.format === "gif" ? gifFrameBytes(width, height) : 0;
    const session: RecordingSession = {
      state: "recording",
      options: settings,
      width,
      height,
      frameBytes,
      startedAt: performance.now(),
      onStateChange,
      onAutoComplete,
      onError,
      recorder: null,
      nativeStopObserved: false,
      stream: null,
      chunks: [],
      frames: [],
      retainedBytes: 0,
      context: null,
      scratch: null,
      captureTimer: null,
      elapsedTimer: null,
      deadlineTimer: null,
      cancelled: false,
    };
    this.session = session;
    try {
      if (settings.format === "gif") this.startGifCapture(session);
      else this.startMediaRecorder(session);
      session.elapsedTimer = window.setInterval(() => {
        if (this.session === session && session.state === "recording") {
          this.emitState(
            session,
            "recording",
            (performance.now() - session.startedAt) / 1000,
          );
        }
      }, 200);
      session.deadlineTimer = window.setTimeout(
        () => this.autoStop(session),
        settings.maxDuration * 1000,
      );
      // Resource ownership is established before a synchronous host callback.
      this.emitState(session, "recording", 0);
      return settings.format;
    } catch {
      this.fail(session);
      throw new Error(RECORDING_FAILED);
    }
  }

  stop(): Promise<Blob> {
    const session = this.session;
    if (!session) return Promise.reject(new Error("Recording is not in progress"));
    if (session.stopPromise) return session.stopPromise;
    const stopped = new Promise<Blob>((resolve, reject) => {
      session.resolveStop = resolve;
      session.rejectStop = reject;
    });
    session.stopPromise = stopped;
    session.state = "processing";
    this.clearTimers(session);
    this.emitState(session, "processing", (performance.now() - session.startedAt) / 1000);
    if (this.session !== session) return stopped;
    try {
      if (session.options.format === "gif") {
        this.assertGifDimensions(session);
        if (session.frames.length === 0) throw new Error(RECORDING_FAILED);
        const blob = new Blob(
          [
            encodeGif(
              session.frames,
              session.width,
              session.height,
              Math.round(100 / session.options.fps),
            ).buffer as ArrayBuffer,
          ],
          { type: "image/gif" },
        );
        this.finish(session, blob);
      } else if (session.nativeStopObserved) {
        this.finishMedia(session);
      } else if (session.recorder?.state !== "inactive") {
        session.recorder?.stop();
      }
      // inactive alone does not mean the queued final data/error/stop arrived.
    } catch {
      this.fail(session);
    }
    return stopped;
  }

  cancel(): void {
    const session = this.session;
    if (!session) return;
    session.cancelled = true;
    this.finish(session, null, new DOMException("Recording cancelled.", "AbortError"));
  }

  private startMediaRecorder(session: RecordingSession): void {
    const stream = this.canvas.captureStream(30);
    session.stream = stream;
    const mimeType = this.selectMimeType(session.options.format);
    if (session.options.format === "mp4" && mimeType.startsWith("video/webm")) {
      session.options.format = "webm";
    }
    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: Math.floor(2_500_000 * session.options.quality),
    });
    session.recorder = recorder;
    recorder.ondataavailable = (event) => {
      if (this.session === session && event.data.size > 0)
        session.chunks.push(event.data);
    };
    recorder.onerror = () => this.fail(session);
    recorder.onstop = () => {
      if (this.session !== session) return;
      session.nativeStopObserved = true;
      if (session.state === "recording") this.autoStop(session);
      else this.finishMedia(session);
    };
    recorder.start(100);
  }

  private finishMedia(session: RecordingSession): void {
    if (this.session !== session) return;
    try {
      const blob = new Blob(session.chunks, {
        type: session.recorder?.mimeType ?? "video/webm",
      });
      this.finish(session, blob);
    } catch {
      this.fail(session);
    }
  }

  private selectMimeType(format: RecordingFormat): string {
    if (format === "mp4") {
      for (const type of [
        "video/mp4;codecs=h264",
        "video/mp4;codecs=avc1",
        "video/mp4",
      ]) {
        if (MediaRecorder.isTypeSupported(type)) return type;
      }
    }
    for (const type of ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]) {
      if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return "video/webm";
  }

  private startGifCapture(session: RecordingSession): void {
    session.context = this.canvas.getContext("2d");
    if (!session.context) {
      // A WebGL canvas cannot also own a2D context. Keep readback separately owned.
      const scratch = document.createElement("canvas");
      scratch.width = session.width;
      scratch.height = session.height;
      session.scratch = scratch;
      session.context = scratch.getContext("2d", { willReadFrequently: true });
      if (!session.context) throw new Error(RECORDING_FAILED);
    }
    session.captureTimer = window.setInterval(
      () => this.captureGifFrame(session),
      Math.max(1, Math.round(1000 / session.options.fps)),
    );
  }

  private assertGifDimensions(session: RecordingSession): void {
    if (this.canvas.width !== session.width || this.canvas.height !== session.height) {
      throw new Error(RECORDING_FAILED);
    }
  }

  private captureGifFrame(session: RecordingSession): void {
    if (this.session !== session || session.state !== "recording") return;
    try {
      this.assertGifDimensions(session);
      // Check before getImageData allocates the next raw frame.
      if (session.retainedBytes > MAX_RETAINED_GIF_FRAME_BYTES - session.frameBytes) {
        this.autoStop(session);
        return;
      }
      this.beforeCapture?.();
      if (this.session !== session || session.state !== "recording") return;
      this.assertGifDimensions(session);
      const context = session.context!;
      if (session.scratch) context.drawImage(this.canvas, 0, 0);
      const frame = context.getImageData(0, 0, session.width, session.height);
      if (frame.data.byteLength !== session.frameBytes) throw new Error(RECORDING_FAILED);
      session.frames.push(frame);
      session.retainedBytes += session.frameBytes;
      // Complete at the exact budget, or as soon as another whole frame cannot fit.
      if (session.retainedBytes > MAX_RETAINED_GIF_FRAME_BYTES - session.frameBytes) {
        this.autoStop(session);
      }
    } catch {
      this.fail(session);
    }
  }

  private autoStop(session: RecordingSession): void {
    if (this.session !== session || session.state !== "recording") return;
    void this.stop()
      .then((blob) => {
        if (!session.cancelled) {
          try {
            session.onAutoComplete?.(blob);
          } catch {
            /* Host owns delivery failures. */
          }
        }
      })
      .catch(() => {
        // stop/fail already cleaned the session and reported a fixed error.
        // Automatic timers must never leave an unhandled rejected promise.
      });
  }

  private fail(session: RecordingSession): void {
    if (this.session !== session) return;
    const error = new Error(RECORDING_FAILED);
    this.finish(session, null, error);
  }

  private finish(session: RecordingSession, blob: Blob | null, error?: Error): void {
    if (this.session !== session) return;
    // Detach ownership before cleanup/events can synchronously reenter.
    this.session = null;
    this.clearTimers(session);
    const recorder = session.recorder;
    session.recorder = null;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.onerror = null;
      if (recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          /* Continue releasing owned tracks. */
        }
      }
    }
    const stream = session.stream;
    session.stream = null;
    for (const track of stream?.getTracks() ?? []) {
      try {
        track.stop();
      } catch {
        /* Continue releasing other owned tracks. */
      }
    }
    session.chunks.length = 0;
    session.frames.length = 0;
    session.retainedBytes = 0;
    session.context = null;
    if (session.scratch) {
      session.scratch.width = 0;
      session.scratch.height = 0;
      session.scratch = null;
    }
    const resolve = session.resolveStop;
    const reject = session.rejectStop;
    session.resolveStop = undefined;
    session.rejectStop = undefined;
    if (error) reject?.(error);
    else if (blob) resolve?.(blob);
    this.emitState(session, "idle", 0);
    if (error) {
      try {
        session.onError?.(error);
      } catch {
        /* Host callbacks cannot retain resources. */
      }
    }
  }

  private clearTimers(session: RecordingSession): void {
    if (session.captureTimer !== null) clearInterval(session.captureTimer);
    if (session.elapsedTimer !== null) clearInterval(session.elapsedTimer);
    if (session.deadlineTimer !== null) clearTimeout(session.deadlineTimer);
    session.captureTimer = session.elapsedTimer = session.deadlineTimer = null;
  }

  private emitState(
    session: RecordingSession,
    state: RecordingState,
    elapsed: number,
  ): void {
    try {
      session.onStateChange?.(state, elapsed);
    } catch {
      /* Preserve lifecycle ownership. */
    }
  }
}

function gifFrameBytes(width: number, height: number): number {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width > 65535 ||
    height > 65535 ||
    width > Math.floor(MAX_RETAINED_GIF_FRAME_BYTES / 4 / height)
  ) {
    throw new Error(RECORDING_FAILED);
  }
  return width * height * 4;
}

function validateRecordingOptions(options: Required<RecordingOptions>): void {
  const interval = Math.round(1000 / options.fps);
  const gifDelay = Math.round(100 / options.fps);
  if (
    !["gif", "webm", "mp4"].includes(options.format) ||
    !Number.isFinite(options.fps) ||
    options.fps <= 0 ||
    !Number.isFinite(interval) ||
    interval > 2147483647 ||
    !Number.isFinite(options.maxDuration) ||
    options.maxDuration <= 0 ||
    options.maxDuration * 1000 > 2147483647 ||
    !Number.isFinite(options.quality) ||
    options.quality < 0 ||
    options.quality > 1 ||
    (options.format === "gif" && (gifDelay < 1 || gifDelay > 65535))
  ) {
    throw new Error(RECORDING_FAILED);
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
