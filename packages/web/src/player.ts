import { extractTextures } from "@vivi2d/renderer-pixi/loader";
import { ViviPixiRenderer } from "@vivi2d/renderer-pixi/renderer";
import {
  generateThumbnail,
  type ThumbnailOptions as PixiThumbnailOptions,
} from "@vivi2d/renderer-pixi/thumbnail";
import { toViviWebError, ViviWebError } from "./errors";
import { getViviWebModelInternals } from "./model-internals";
import {
  isViviWebModel,
  loadViviWebModel,
  type ViviWebExpressionPreset,
  type ViviWebLoadOptions,
  type ViviWebLoadSource,
  type ViviWebModel,
  type ViviWebModelMetadata,
  type ViviWebParameter,
} from "./model-loader";

const MAX_DELTA_SECONDS = 0.25;
const MAX_CANVAS_DIMENSION = 8192;
const MAX_THUMBNAIL_PIXELS = 1024 * 1024;
const MAX_THUMBNAIL_BYTES = 2 * 1024 * 1024;

export type ViviWebInputMap = Readonly<Record<string, number>>;

export interface ViviWebFrameScheduler {
  requestFrame(callback: (timeMs: number) => void): number;
  cancelFrame(handle: number): void;
}

export interface ViviWebThumbnailOptions {
  width?: number;
  height?: number;
  format?: "png" | "jpeg" | "webp";
  quality?: number;
}

export interface ViviWebHitTestResult {
  colliderName: string;
  tag?: string;
}

export type ViviWebEvent =
  | { type: "load"; model: ViviWebModel }
  | { type: "start" }
  | { type: "stop" }
  | { type: "dispose" }
  | { type: "error"; error: ViviWebError };

export interface ViviWebEventMap {
  load: Extract<ViviWebEvent, { type: "load" }>;
  start: Extract<ViviWebEvent, { type: "start" }>;
  stop: Extract<ViviWebEvent, { type: "stop" }>;
  dispose: Extract<ViviWebEvent, { type: "dispose" }>;
  error: Extract<ViviWebEvent, { type: "error" }>;
}

export interface ViviWebPlayerOptions {
  autoStart?: boolean;
  backgroundColor?: number;
  canvas: HTMLCanvasElement;
  model?: ViviWebModel;
  onEvent?: (event: ViviWebEvent) => void;
  scheduler?: ViviWebFrameScheduler;
  signal?: AbortSignal;
  source?: ViviWebLoadSource;
  strictInputs?: boolean;
  transparent?: boolean;
  loadOptions?: Omit<ViviWebLoadOptions, "signal">;
}

export interface ViviWebPlayer {
  readonly disposed: boolean;
  readonly metadata: ViviWebModelMetadata;
  readonly model: ViviWebModel;
  readonly running: boolean;

  applyExpressionPreset(id: string): void;
  dispose(): void;
  generateThumbnail(options?: ViviWebThumbnailOptions): string;
  getExpressionPresets(): readonly ViviWebExpressionPreset[];
  getParameters(): readonly ViviWebParameter[];
  hitTest(x: number, y: number): ViviWebHitTestResult | null;
  render(): void;
  resetInputs(): void;
  resize(width: number, height: number): void;
  screenToWorld(x: number, y: number): { x: number; y: number } | null;
  setInput(id: string, value: number): void;
  setInputs(values: ViviWebInputMap): void;
  start(): void;
  stop(): void;
  update(deltaSeconds: number): void;
}

export async function createViviWebPlayer(
  options: ViviWebPlayerOptions,
): Promise<ViviWebPlayer> {
  let renderer: ViviPixiRenderer | null = null;
  let player: ViviWebPlayerImpl | null = null;
  let playerReady = false;
  try {
    throwIfAborted(options.signal);
    const canvas = assertHtmlCanvas(options.canvas);
    const model = await resolvePlayerModel(options);
    throwIfAborted(options.signal);
    renderer = await ViviPixiRenderer.create(canvas, {
      backgroundColor: options.backgroundColor ?? 0x000000,
      transparent: options.transparent ?? true,
    });
    throwIfAborted(options.signal);
    const modelInternals = getViviWebModelInternals(model);
    const textures = await extractTextures(modelInternals.fileData);
    throwIfAborted(options.signal);
    renderer.setModel(modelInternals.runtimeModel, textures);
    player = new ViviWebPlayerImpl(model, renderer, canvas, options);
    modelInternals.runtimeModel.update();
    renderer.render();
    const finishAutoStart = options.autoStart ? player.prepareAutoStart() : null;
    player.emit({ type: "load", model });
    finishAutoStart?.();
    playerReady = true;
    return player;
  } catch (error) {
    if (player && !playerReady) {
      try {
        player.dispose();
      } catch {
        if (renderer) destroyRendererQuietly(renderer);
      }
    } else if (renderer && !playerReady) {
      destroyRendererQuietly(renderer);
    }
    const webError = toViviWebError(
      error,
      "VIVI_WEB_RENDERER_UNAVAILABLE",
      "Could not create a Vivi2D web player.",
    );
    emitViviWebEvent(options.onEvent, { type: "error", error: webError });
    throw webError;
  }
}

async function resolvePlayerModel(options: ViviWebPlayerOptions): Promise<ViviWebModel> {
  if (options.model && options.source) {
    throw new ViviWebError(
      "VIVI_WEB_INVALID_SOURCE",
      "Provide either model or source, not both.",
    );
  }
  if (options.model) {
    if (!isViviWebModel(options.model)) {
      throw new ViviWebError(
        "VIVI_WEB_INVALID_SOURCE",
        "Player model must be returned by loadViviWebModel().",
      );
    }
    return options.model;
  }
  if (options.source === undefined) {
    throw new ViviWebError("VIVI_WEB_INVALID_SOURCE", "A model or source is required.");
  }
  return loadViviWebModel(options.source, {
    ...options.loadOptions,
    signal: options.signal,
  });
}

function assertHtmlCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement {
  if (typeof HTMLCanvasElement !== "undefined" && canvas instanceof HTMLCanvasElement) {
    return canvas;
  }
  throw new ViviWebError(
    "VIVI_WEB_RENDERER_UNAVAILABLE",
    "The current Web SDK renderer requires an HTMLCanvasElement.",
  );
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  if (typeof DOMException !== "undefined") {
    throw new DOMException("Player creation was aborted.", "AbortError");
  }
  const error = new Error("Player creation was aborted.");
  error.name = "AbortError";
  throw error;
}

function destroyRendererQuietly(renderer: ViviPixiRenderer): void {
  try {
    renderer.destroy();
  } catch {
    // Best-effort rollback: the original creation error remains the public error.
  }
}

class ViviWebPlayerImpl implements ViviWebPlayer {
  private animationFrameId: number | null = null;
  private disposedValue = false;
  private lastFrameTime: number | null = null;
  private runningValue = false;
  private scheduler: ViviWebFrameScheduler | null = null;
  private readonly strictInputs: boolean;

  constructor(
    readonly model: ViviWebModel,
    private readonly renderer: ViviPixiRenderer,
    private readonly canvas: HTMLCanvasElement,
    private readonly options: ViviWebPlayerOptions,
  ) {
    this.strictInputs = options.strictInputs ?? false;
  }

  get metadata(): ViviWebModelMetadata {
    return this.model.metadata;
  }

  get running(): boolean {
    return this.runningValue;
  }

  get disposed(): boolean {
    return this.disposedValue;
  }

  start(): void {
    this.assertUsable();
    if (this.runningValue) return;
    const scheduler = this.getScheduler();
    this.runningValue = true;
    this.lastFrameTime = null;
    try {
      this.animationFrameId = scheduler.requestFrame(this.frame);
    } catch (error) {
      this.runningValue = false;
      this.lastFrameTime = null;
      this.animationFrameId = null;
      throw error;
    }
    this.emit({ type: "start" });
  }

  prepareAutoStart(): () => void {
    this.assertUsable();
    if (this.runningValue) return () => {};
    const scheduler = this.getScheduler();
    let pendingFrameTime: number | null = null;
    let activated = false;
    const frameId = scheduler.requestFrame((timeMs) => {
      if (!activated) {
        pendingFrameTime = timeMs;
        return;
      }
      this.frame(timeMs);
    });
    this.animationFrameId = frameId;
    return () => {
      if (this.disposedValue || this.animationFrameId !== frameId) return;
      this.lastFrameTime = null;
      this.runningValue = true;
      activated = true;
      this.emit({ type: "start" });
      if (pendingFrameTime !== null) {
        const timeMs = pendingFrameTime;
        pendingFrameTime = null;
        this.frame(timeMs);
      }
    };
  }

  stop(): void {
    const wasRunning = this.runningValue;
    this.runningValue = false;
    if (this.animationFrameId !== null) {
      try {
        this.getScheduler().cancelFrame(this.animationFrameId);
      } catch {
        // User-provided schedulers must not make stop/dispose unreliable.
      }
      this.animationFrameId = null;
    }
    this.lastFrameTime = null;
    if (wasRunning) this.emit({ type: "stop" });
  }

  update(deltaSeconds: number): void {
    this.assertUsable();
    const clampedDelta = validateDeltaSeconds(deltaSeconds);
    getViviWebModelInternals(this.model).runtimeModel.update(clampedDelta);
  }

  render(): void {
    this.assertUsable();
    this.renderer.render();
  }

  resize(width: number, height: number): void {
    this.assertUsable();
    const nextWidth = validateCanvasDimension(width, "width");
    const nextHeight = validateCanvasDimension(height, "height");
    this.canvas.width = nextWidth;
    this.canvas.height = nextHeight;
    this.renderer.resize(nextWidth, nextHeight);
    this.render();
  }

  dispose(): void {
    if (this.disposedValue) return;
    this.stop();
    destroyRendererQuietly(this.renderer);
    this.disposedValue = true;
    this.emit({ type: "dispose" });
  }

  setInput(id: string, value: number): void {
    this.assertUsable();
    const input = this.resolveInputValue(id, value);
    if (!input) return;
    getViviWebModelInternals(this.model).runtimeModel.setParameter(input.id, input.value);
  }

  setInputs(values: ViviWebInputMap): void {
    this.assertUsable();
    const inputs: Array<{ id: string; value: number }> = [];
    for (const [id, value] of Object.entries(values)) {
      const input = this.resolveInputValue(id, value);
      if (input) inputs.push(input);
    }
    const runtimeModel = getViviWebModelInternals(this.model).runtimeModel;
    for (const input of inputs) {
      runtimeModel.setParameter(input.id, input.value);
    }
  }

  private resolveInputValue(
    id: string,
    value: number,
  ): { id: string; value: number } | null {
    if (!Number.isFinite(value)) {
      throw new ViviWebError("VIVI_WEB_INVALID_INPUT", "Input values must be finite.", {
        details: { id },
      });
    }
    const modelInternals = getViviWebModelInternals(this.model);
    const definition = modelInternals.fileData.project.parameters.find(
      (p) => p.id === id,
    );
    if (!definition) {
      if (this.strictInputs) {
        throw new ViviWebError("VIVI_WEB_UNKNOWN_INPUT", "Unknown input id.", {
          details: { id },
        });
      }
      return null;
    }
    const clampedValue = Math.max(
      definition.minValue,
      Math.min(definition.maxValue, value),
    );
    return { id, value: clampedValue };
  }

  resetInputs(): void {
    this.assertUsable();
    getViviWebModelInternals(this.model).runtimeModel.resetParameters();
  }

  getParameters(): readonly ViviWebParameter[] {
    return this.model.parameters;
  }

  getExpressionPresets(): readonly ViviWebExpressionPreset[] {
    return this.model.expressionPresets;
  }

  applyExpressionPreset(id: string): void {
    this.assertUsable();
    getViviWebModelInternals(this.model).runtimeModel.applyExpressionPreset(id);
  }

  screenToWorld(x: number, y: number): { x: number; y: number } | null {
    if (!Number.isFinite(x) || !Number.isFinite(y) || this.disposedValue) {
      return null;
    }
    return this.renderer.screenToWorld(x, y);
  }

  hitTest(x: number, y: number): ViviWebHitTestResult | null {
    if (!Number.isFinite(x) || !Number.isFinite(y) || this.disposedValue) {
      return null;
    }
    return getViviWebModelInternals(this.model).runtimeModel.hitTest(x, y);
  }

  generateThumbnail(options: ViviWebThumbnailOptions = {}): string {
    this.assertUsable();
    const thumbnailOptions = validateThumbnailOptions(options);
    try {
      const dataUrl = generateThumbnail(
        this.canvas,
        thumbnailOptions as PixiThumbnailOptions,
      );
      if (!dataUrl) {
        throw new ViviWebError("VIVI_WEB_TEXTURE_FAILED", "Thumbnail generation failed.");
      }
      const byteLength = new TextEncoder().encode(dataUrl).byteLength;
      if (byteLength > MAX_THUMBNAIL_BYTES) {
        throw new ViviWebError(
          "VIVI_WEB_LIMIT_EXCEEDED",
          "Thumbnail output is too large.",
          { details: { byteLength, maxBytes: MAX_THUMBNAIL_BYTES } },
        );
      }
      return dataUrl;
    } catch (error) {
      throw toViviWebError(
        error,
        "VIVI_WEB_TEXTURE_FAILED",
        "Thumbnail generation failed.",
      );
    }
  }

  emit(event: ViviWebEvent): void {
    emitViviWebEvent(this.options.onEvent, event);
  }

  private readonly frame = (timeMs: number): void => {
    if (!this.runningValue || this.disposedValue) return;
    const deltaSeconds =
      this.lastFrameTime === null ? 0 : (timeMs - this.lastFrameTime) / 1000;
    this.lastFrameTime = timeMs;
    this.update(Math.max(0, deltaSeconds));
    this.render();
    this.animationFrameId = this.getScheduler().requestFrame(this.frame);
  };

  private getScheduler(): ViviWebFrameScheduler {
    this.scheduler ??= this.options.scheduler ?? createWindowScheduler();
    return this.scheduler;
  }

  private assertUsable(): void {
    if (this.disposedValue) {
      throw new ViviWebError("VIVI_WEB_DISPOSED", "Player has been disposed.");
    }
  }
}

function createWindowScheduler(): ViviWebFrameScheduler {
  if (
    typeof window === "undefined" ||
    typeof window.requestAnimationFrame !== "function" ||
    typeof window.cancelAnimationFrame !== "function"
  ) {
    throw new ViviWebError(
      "VIVI_WEB_RENDERER_UNAVAILABLE",
      "A frame scheduler is required outside window contexts.",
    );
  }
  return {
    requestFrame: (callback) => window.requestAnimationFrame(callback),
    cancelFrame: (handle) => window.cancelAnimationFrame(handle),
  };
}

function validateDeltaSeconds(deltaSeconds: number): number {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
    throw new ViviWebError(
      "VIVI_WEB_INVALID_INPUT",
      "deltaSeconds must be a finite non-negative number.",
    );
  }
  return Math.min(deltaSeconds, MAX_DELTA_SECONDS);
}

function validateCanvasDimension(value: number, label: "width" | "height"): number {
  if (!Number.isFinite(value) || value <= 0 || !Number.isInteger(value)) {
    throw new ViviWebError(
      "VIVI_WEB_INVALID_INPUT",
      `${label} must be a positive integer.`,
    );
  }
  if (value > MAX_CANVAS_DIMENSION) {
    throw new ViviWebError(
      "VIVI_WEB_LIMIT_EXCEEDED",
      `${label} exceeds the canvas dimension limit.`,
      { details: { [label]: value, max: MAX_CANVAS_DIMENSION } },
    );
  }
  return value;
}

function validateThumbnailOptions(
  options: ViviWebThumbnailOptions,
): Required<ViviWebThumbnailOptions> {
  const width = options.width ?? 256;
  const height = options.height ?? 256;
  const format = options.format ?? "png";
  const quality = options.quality ?? 0.85;
  const validFormats = new Set(["png", "jpeg", "webp"]);
  validateCanvasDimension(width, "width");
  validateCanvasDimension(height, "height");
  if (width * height > MAX_THUMBNAIL_PIXELS) {
    throw new ViviWebError(
      "VIVI_WEB_LIMIT_EXCEEDED",
      "Thumbnail pixel count exceeds the limit.",
      { details: { pixels: width * height, maxPixels: MAX_THUMBNAIL_PIXELS } },
    );
  }
  if (!validFormats.has(format)) {
    throw new ViviWebError("VIVI_WEB_INVALID_INPUT", "Unsupported thumbnail format.");
  }
  if (!Number.isFinite(quality) || quality < 0 || quality > 1) {
    throw new ViviWebError(
      "VIVI_WEB_INVALID_INPUT",
      "Thumbnail quality must be between 0 and 1.",
    );
  }
  return { width, height, format, quality };
}

function emitViviWebEvent(
  handler: ((event: ViviWebEvent) => void) | undefined,
  event: ViviWebEvent,
): void {
  try {
    handler?.(event);
  } catch {
    // User event handlers must not break the player lifecycle or error surface.
  }
}
