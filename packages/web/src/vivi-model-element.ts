import {
  assertByteLengthWithinLimit,
  assertTextLengthWithinLimit,
  MAX_VIVI_TEXT_FILE_BYTES,
} from "@vivi2d/core/load-limits";
import { parseViviFile } from "@vivi2d/core/project-parser";
import { PublicViviModel } from "@vivi2d/core/public-model";
import {
  cancelScript,
  parseScript,
  runScript,
  type ScriptModelAPI,
  type ScriptRunnerState,
} from "@vivi2d/core/script-runner";
import { extractTextures } from "@vivi2d/renderer-pixi/loader";
import { ViviPixiRenderer } from "@vivi2d/renderer-pixi/renderer";
import {
  generateThumbnail,
  type ThumbnailOptions as PixiThumbnailOptions,
} from "@vivi2d/renderer-pixi/thumbnail";

// <vivi-model> WebComponent

const STYLES = `
:host {
  display: inline-block;
  overflow: hidden;
}
canvas {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
`;

export interface ViviProjectSnapshot {
  name?: string;
  [key: string]: unknown;
}

export interface ViviModelHandle {
  readonly project: ViviProjectSnapshot;
  readonly parameterValues: Record<string, number>;
}

export interface ViviThumbnailOptions {
  width?: number;
  height?: number;
  format?: "png" | "jpeg" | "webp";
  quality?: number;
}

async function readResponseTextWithLimit(
  response: Response,
  label: string,
): Promise<string> {
  const contentLengthHeader = response.headers.get("content-length");
  if (contentLengthHeader) {
    const contentLength = Number(contentLengthHeader);
    if (Number.isFinite(contentLength) && contentLength > 0) {
      assertByteLengthWithinLimit(contentLength, MAX_VIVI_TEXT_FILE_BYTES, label);
    }
  }

  const reader = response.body?.getReader();
  if (!reader) {
    const text = await response.text();
    assertTextLengthWithinLimit(text, MAX_VIVI_TEXT_FILE_BYTES, label);
    return text;
  }

  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    assertByteLengthWithinLimit(totalBytes, MAX_VIVI_TEXT_FILE_BYTES, label);
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  assertTextLengthWithinLimit(text, MAX_VIVI_TEXT_FILE_BYTES, label);
  return text;
}

export class ViviModelElement extends HTMLElement {
  static observedAttributes = ["src", "width", "height", "autoplay"];

  private shadow: ShadowRoot;
  private canvas: HTMLCanvasElement;
  private renderer: ViviPixiRenderer | null = null;
  private _model: PublicViviModel | null = null;
  private animFrameId = 0;
  private lastTime = 0;
  private _loading = false;
  private loadAbort: AbortController | null = null;
  private scriptState: ScriptRunnerState = { running: false, cancelled: false };

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = STYLES;
    this.shadow.appendChild(style);

    this.canvas = document.createElement("canvas");
    this.shadow.appendChild(this.canvas);
  }

  connectedCallback(): void {
    const src = this.getAttribute("src");
    if (src) void this.load(src);
  }

  disconnectedCallback(): void {
    this.dispose();
  }

  attributeChangedCallback(
    name: string,
    oldValue: string | null,
    newValue: string | null,
  ): void {
    if (name === "src" && newValue && newValue !== oldValue) {
      void this.load(newValue);
    }
    if (name === "width" && newValue && this.canvas) {
      this.style.width = `${newValue}px`;
    }
    if (name === "height" && newValue && this.canvas) {
      this.style.height = `${newValue}px`;
    }
  }

  get model(): ViviModelHandle | null {
    return this._model as ViviModelHandle | null;
  }

  get project(): ViviProjectSnapshot | null {
    return (this._model?.project as ViviProjectSnapshot | undefined) ?? null;
  }

  get loading(): boolean {
    return this._loading;
  }

  async load(src: string): Promise<void> {
    this.loadAbort?.abort();
    const abort = new AbortController();
    this.loadAbort = abort;

    this.dispose();
    this._loading = true;
    this.dispatchEvent(new CustomEvent("vivi-load-start"));

    try {
      const response = await fetch(src, {
        credentials: "omit",
        mode: "cors",
        signal: abort.signal,
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${src}`);
      }
      const json = await readResponseTextWithLimit(response, "Remote .vivi model");
      const fileData = parseViviFile(json, { profile: "publicProfileV1" });
      const model = PublicViviModel.fromFileData(fileData);
      const textures = await extractTextures(fileData);

      this.canvas.width = model.width;
      this.canvas.height = model.height;

      const renderer = await ViviPixiRenderer.create(this.canvas, {
        backgroundColor: 0x000000,
        transparent: true,
      });
      renderer.setModel(model, textures);

      this.renderer = renderer;
      this._model = model;
      this._loading = false;

      model.update();
      renderer.render();

      this.startLoop();

      this.dispatchEvent(new CustomEvent("load", { detail: { model } }));
      this.dispatchEvent(new CustomEvent("vivi-load", { detail: { model } }));
    } catch (e) {
      this._loading = false;
      const message = e instanceof Error ? e.message : String(e);
      this.dispatchEvent(new CustomEvent("error", { detail: { message } }));
      this.dispatchEvent(new CustomEvent("vivi-error", { detail: { message } }));
    }
  }

  setParameter(id: string, value: number): void {
    this._model?.setParameter(id, value);
  }

  setParameters(values: Record<string, number>): void {
    this._model?.setParameters(values);
  }

  resetParameters(): void {
    this._model?.resetParameters();
  }

  applyExpressionPreset(presetId: string): void {
    this._model?.applyExpressionPreset(presetId);
  }

  applyPresetByHotkey(hotkey: number): void {
    const preset = this._model?.project.expressionPresets?.find(
      (p) => p.hotkey === hotkey,
    );
    if (preset) {
      this._model?.applyExpressionPreset(preset.id);
    }
  }

  getExpressionPresets(): Array<{
    id: string;
    name: string;
    hotkey?: number;
  }> {
    return (
      this._model?.project.expressionPresets?.map((p) => ({
        id: p.id,
        name: p.name,
        hotkey: p.hotkey,
      })) ?? []
    );
  }

  getParameters(): Array<{
    id: string;
    name: string;
    min: number;
    max: number;
    default: number;
  }> {
    return (
      this._model?.project.parameters.map((p) => ({
        id: p.id,
        name: p.name,
        min: p.minValue,
        max: p.maxValue,
        default: p.defaultValue,
      })) ?? []
    );
  }

  screenToWorld(screenX: number, screenY: number): { x: number; y: number } | null {
    return this.renderer?.screenToWorld(screenX, screenY) ?? null;
  }

  hitTest(worldX: number, worldY: number): { colliderName: string; tag?: string } | null {
    return this._model?.hitTest(worldX, worldY) ?? null;
  }

  async runScript(source: string): Promise<void> {
    if (!this._model) throw new Error("Model is not loaded");
    this.cancelScript();

    const model = this._model;
    const api: ScriptModelAPI = {
      setParameter: (id, value) => model.setParameter(id, value),
      setParameters: (values) => model.setParameters(values),
      resetParameters: () => model.resetParameters(),
      applyExpressionPreset: (id) => model.applyExpressionPreset(id),
      getPresetByName: (name) => {
        const p = model.project.expressionPresets?.find((pr) => pr.name === name);
        return p?.id ?? null;
      },
      getParameterId: (nameOrId) => {
        const p = model.project.parameters.find(
          (pr) => pr.id === nameOrId || pr.name === nameOrId,
        );
        return p?.id ?? null;
      },
      update: () => model.update(),
    };

    const script = parseScript(source);
    this.scriptState = { running: true, cancelled: false };
    await runScript(script, api, this.scriptState);
  }

  cancelScript(): void {
    if (this.scriptState.running) {
      cancelScript(this.scriptState);
    }
  }

  get scriptRunning(): boolean {
    return this.scriptState.running;
  }

  generateThumbnail(options?: ViviThumbnailOptions): string {
    return generateThumbnail(this.canvas, options as PixiThumbnailOptions | undefined);
  }

  private startLoop(): void {
    this.lastTime = 0;
    const loop = (time: number) => {
      const dt = this.lastTime > 0 ? (time - this.lastTime) / 1000 : 0;
      this.lastTime = time;
      this._model?.update(dt);
      this.renderer?.render();
      this.animFrameId = requestAnimationFrame(loop);
    };
    this.animFrameId = requestAnimationFrame(loop);
  }

  private dispose(): void {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = 0;
    }
    this.renderer?.destroy();
    this.renderer = null;
    this._model = null;
    this.lastTime = 0;
    this.dispatchEvent(new CustomEvent("vivi-dispose"));
  }
}
