import {
  createViviWebPlayer,
  isViviWebError,
  loadViviWebModel,
  ViviWebError,
  type ViviWebInputMap,
  type ViviWebLoadSource,
  type ViviWebModel,
  type ViviWebModelMetadata,
  type ViviWebParameter,
  type ViviWebPlayer,
} from "@vivi2d/web";
import { formatViviWebError, type ErrorCopy } from "./error-copy";

const BUNDLED_MODEL_URL = "/generated-avatar.vivi";
const MAX_VISIBLE_SLIDERS = 6;
const PUBLIC_METADATA_FIELDS = {
  expressionPresetCount: "public",
  height: "public",
  name: "public",
  parameterCount: "public",
  width: "public",
} satisfies Record<keyof ViviWebModelMetadata, "public" | "hidden">;

type HostState = "idle" | "loading" | "ready" | "running" | "disposed" | "error";
type AbortOrigin = "replace" | "user" | "dispose";
const BUTTON_IDS = [
  "load-fixture",
  "load-delayed",
  "cancel-load",
  "reload-model",
  "start-player",
  "stop-player",
  "manual-update",
  "resize-small",
  "resize-large",
  "dispose-player",
  "reload-after-dispose",
  "apply-visible-inputs",
  "reset-inputs",
  "unknown-input",
  "error-fetch",
  "error-invalid-source",
  "error-validation",
  "error-parse",
  "error-invalid-input",
  "error-invalid-resize",
  "error-disposed",
  "error-source-shortcut-abort",
] as const;
type ButtonId = (typeof BUTTON_IDS)[number];

interface SampleElements {
  canvas: HTMLCanvasElement;
  status: HTMLElement;
  metadataSummary: HTMLElement;
  parameterControls: HTMLElement;
  errorOutput: HTMLOutputElement;
  fileInput: HTMLInputElement;
  strictInputs: HTMLInputElement;
  buttons: Record<ButtonId, HTMLButtonElement>;
}

export interface ViviWebSdkBasicTestHooks {
  getStatusText(): string;
  getUnhandledState(): { playerRunning: boolean; state: HostState };
  runStaleLoadProbe(): Promise<string>;
}

export class ViviWebSdkBasicDemo {
  private controller: AbortController | null = null;
  private currentRunId = 0;
  private currentSource: ViviWebLoadSource = BUNDLED_MODEL_URL;
  private hostState: HostState = "idle";
  private lastAbortOrigin: AbortOrigin | null = null;
  private model: ViviWebModel | null = null;
  private player: ViviWebPlayer | null = null;
  private sliderValues = new Map<string, number>();

  constructor(private readonly elements: SampleElements) {}

  async mount(): Promise<void> {
    this.bindEvents();
    this.installCleanup();
    this.setStatus("Loading bundled fixture...", "loading");
    await this.load(BUNDLED_MODEL_URL);
  }

  getTestHooks(): ViviWebSdkBasicTestHooks {
    return {
      getStatusText: () => this.elements.status.textContent ?? "",
      getUnhandledState: () => ({
        playerRunning: this.player?.running ?? false,
        state: this.hostState,
      }),
      runStaleLoadProbe: async () => {
        const slowLoad = this.load(BUNDLED_MODEL_URL, { delayMs: 250 });
        await delay(25);
        await this.load(BUNDLED_MODEL_URL);
        await slowLoad;
        return this.elements.status.textContent ?? "";
      },
    };
  }

  private bindEvents(): void {
    const { buttons, fileInput, strictInputs } = this.elements;
    buttons["load-fixture"].addEventListener("click", () => {
      void this.load(BUNDLED_MODEL_URL);
    });
    buttons["load-delayed"].addEventListener("click", () => {
      void this.load(BUNDLED_MODEL_URL, { delayMs: 600 });
    });
    buttons["cancel-load"].addEventListener("click", () => this.cancelLoad());
    buttons["reload-model"].addEventListener("click", () => {
      void this.load(this.currentSource);
    });
    buttons["start-player"].addEventListener("click", () => this.withPlayer((player) => {
      player.start();
      this.setStatus("Player running.", "running");
    }));
    buttons["stop-player"].addEventListener("click", () => this.withPlayer((player) => {
      player.stop();
      this.setStatus("Player stopped.", "ready");
    }));
    buttons["manual-update"].addEventListener("click", () => this.withPlayer((player) => {
      player.update(1 / 60);
      player.render();
      this.setStatus("Manual update and render completed.", "ready");
    }));
    buttons["resize-small"].addEventListener("click", () => this.resize(320, 480));
    buttons["resize-large"].addEventListener("click", () => this.resize(640, 960));
    buttons["dispose-player"].addEventListener("click", () => this.dispose("dispose"));
    buttons["reload-after-dispose"].addEventListener("click", () => {
      void this.load(this.currentSource);
    });
    buttons["apply-visible-inputs"].addEventListener("click", () => this.applyVisibleInputs());
    buttons["reset-inputs"].addEventListener("click", () => this.resetInputs());
    buttons["unknown-input"].addEventListener("click", () => this.triggerUnknownInput());
    buttons["error-fetch"].addEventListener("click", () => {
      void this.captureError(
        loadViviWebModel(new Response("not available", { status: 404 })),
      );
    });
    buttons["error-invalid-source"].addEventListener("click", () => {
      void this.captureError(loadViviWebModel(42 as unknown as ViviWebLoadSource));
    });
    buttons["error-validation"].addEventListener("click", () => {
      void this.captureError(
        loadViviWebModel(
          new Blob([
            JSON.stringify({
              atlases: [],
              profile: "publicProfileV1",
              project: {},
              version: 10,
            }),
          ]),
        ),
      );
    });
    buttons["error-parse"].addEventListener("click", () => {
      void this.captureError(loadViviWebModel(new Blob(["{"])));
    });
    buttons["error-invalid-input"].addEventListener("click", () =>
      this.triggerInvalidInput(),
    );
    buttons["error-invalid-resize"].addEventListener("click", () =>
      this.triggerInvalidResizeMatrix(),
    );
    buttons["error-disposed"].addEventListener("click", () => this.triggerDisposedUse());
    buttons["error-source-shortcut-abort"].addEventListener("click", () => {
      void this.triggerSourceShortcutAbort();
    });

    fileInput.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      void this.load(file);
    });
    strictInputs.addEventListener("change", () => {
      this.setStatus(
        "Strict input mode changed. The stopped player will be recreated and input values reset.",
        "loading",
      );
      void this.load(this.currentSource);
    });
  }

  private installCleanup(): void {
    window.addEventListener("beforeunload", () => this.dispose("dispose"));
    import.meta.hot?.dispose(() => this.dispose("dispose"));
  }

  private async load(
    source: ViviWebLoadSource,
    options: { delayMs?: number } = {},
  ): Promise<void> {
    const runId = this.beginReplacement("replace");
    this.currentSource = source;
    this.setStatus("Loading model...", "loading");
    try {
      if (options.delayMs) await delay(options.delayMs);
      if (this.isStale(runId)) return;
      const model = await loadViviWebModel(source, {
        signal: this.controller?.signal,
      });
      if (this.isStale(runId)) return;
      const player = await createViviWebPlayer({
        autoStart: false,
        backgroundColor: 0xfaf9ff,
        canvas: this.elements.canvas,
        model,
        onEvent: (event) => {
          if (event.type === "error") this.showError(formatViviWebError(event.error));
        },
        signal: this.controller?.signal,
        strictInputs: this.elements.strictInputs.checked,
        transparent: false,
      });
      if (this.isStale(runId)) {
        player.dispose();
        return;
      }
      this.player = player;
      this.model = model;
      this.sliderValues.clear();
      this.renderMetadata(model.metadata);
      this.renderParameters(player.getParameters());
      this.setStatus("Ready. Press Start to run the animation loop.", "ready");
    } catch (error) {
      if (this.isStale(runId)) return;
      const copy = formatViviWebError(error);
      if (copy.code === "VIVI_WEB_ABORTED" && this.lastAbortOrigin === "replace") {
        return;
      }
      if (copy.code === "VIVI_WEB_ABORTED" && this.lastAbortOrigin === "user") {
        this.setStatus("Load cancelled by the user.", "ready");
        this.renderError({ ...copy, message: "Load cancelled by the user." });
        return;
      }
      this.setStatus(copy.message, "error");
      this.renderError(copy);
    } finally {
      if (!this.isStale(runId)) this.lastAbortOrigin = null;
      this.updateControls();
    }
  }

  private beginReplacement(origin: AbortOrigin): number {
    this.currentRunId += 1;
    this.lastAbortOrigin = origin;
    this.controller?.abort();
    this.controller = new AbortController();
    this.player?.dispose();
    this.player = null;
    this.model = null;
    return this.currentRunId;
  }

  private cancelLoad(): void {
    this.currentRunId += 1;
    this.lastAbortOrigin = "user";
    this.controller?.abort();
    this.controller = null;
    this.setStatus("Load cancelled by the user.", "ready");
    this.renderError({
      code: "VIVI_WEB_ABORTED",
      message: "Load cancelled by the user.",
      retry: true,
    });
    this.updateControls();
  }

  private dispose(origin: AbortOrigin): void {
    this.currentRunId += 1;
    this.lastAbortOrigin = origin;
    this.controller?.abort();
    this.controller = null;
    this.player?.dispose();
    this.player = null;
    this.model = null;
    this.setStatus("Player disposed. Reload to create a new player.", "disposed");
    this.updateControls();
  }

  private resize(width: number, height: number): void {
    this.withPlayer((player) => {
      player.resize(width, height);
      this.setStatus(`Canvas resized to ${width} x ${height}.`, "ready");
    });
  }

  private withPlayer(action: (player: ViviWebPlayer) => void): void {
    if (!this.player) {
      this.showError(formatViviWebError(new ViviWebError("VIVI_WEB_DISPOSED", "")));
      return;
    }
    try {
      action(this.player);
    } catch (error) {
      this.showError(formatViviWebError(error));
    } finally {
      this.updateControls();
    }
  }

  private applyVisibleInputs(): void {
    this.withPlayer((player) => {
      const values: Record<string, number> = {};
      for (const parameter of selectDisplayParameters(player.getParameters())) {
        values[parameter.id] =
          this.sliderValues.get(parameter.id) ?? parameter.default;
      }
      player.setInputs(values as ViviWebInputMap);
      player.render();
      this.setStatus("Visible input values applied with setInputs().", "ready");
    });
  }

  private resetInputs(): void {
    this.withPlayer((player) => {
      player.resetInputs();
      for (const parameter of selectDisplayParameters(player.getParameters())) {
        this.sliderValues.set(parameter.id, parameter.default);
      }
      this.renderParameters(player.getParameters());
      player.render();
      this.setStatus("Inputs reset to model defaults.", "ready");
    });
  }

  private triggerUnknownInput(): void {
    this.withPlayer((player) => {
      player.setInput("sample.unknown.input", 0.5);
      player.render();
      this.setStatus(
        this.elements.strictInputs.checked
          ? "Strict mode unexpectedly accepted the unknown input."
          : "Default mode ignored the unknown input.",
        "ready",
      );
    });
  }

  private triggerInvalidInput(): void {
    this.withPlayer((player) => {
      const first = selectDisplayParameters(player.getParameters())[0];
      if (!first) {
        throw new ViviWebError("VIVI_WEB_INVALID_INPUT", "No parameters available.");
      }
      player.setInput(first.id, Number.NaN);
    });
  }

  private triggerInvalidResizeMatrix(): void {
    const invalidValues = [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 320.5];
    let captured: unknown = null;
    this.withPlayer((player) => {
      for (const value of invalidValues) {
        try {
          player.resize(value, 480);
        } catch (error) {
          captured ??= error;
        }
        try {
          player.resize(320, value);
        } catch (error) {
          captured ??= error;
        }
      }
      if (captured) throw captured;
    });
  }

  private triggerDisposedUse(): void {
    const player = this.player;
    this.dispose("dispose");
    try {
      player?.update(1 / 60);
    } catch (error) {
      this.showError(formatViviWebError(error));
    }
  }

  private async triggerSourceShortcutAbort(): Promise<void> {
    const controller = new AbortController();
    const probeCanvas = document.createElement("canvas");
    probeCanvas.width = 1;
    probeCanvas.height = 1;
    const created = createViviWebPlayer({
      autoStart: false,
      canvas: probeCanvas,
      signal: controller.signal,
      source: BUNDLED_MODEL_URL,
    });
    controller.abort();
    try {
      const stalePlayer = await created;
      stalePlayer.dispose();
      this.setStatus("Source shortcut resolved after abort and was disposed.", "ready");
    } catch (error) {
      this.showError(formatViviWebError(error));
    }
  }

  private async captureError(promise: Promise<unknown>): Promise<void> {
    try {
      await promise;
      this.setStatus("The error trigger completed without an error.", "ready");
    } catch (error) {
      this.showError(formatViviWebError(error));
    }
  }

  private renderMetadata(metadata: ViviWebModelMetadata): void {
    const fragment = document.createDocumentFragment();
    const entries = summarizePublicMetadata(metadata);
    for (const [label, value] of entries) {
      const wrapper = document.createElement("div");
      const term = document.createElement("dt");
      const description = document.createElement("dd");
      term.textContent = label;
      description.textContent = value;
      wrapper.append(term, description);
      fragment.append(wrapper);
    }
    this.elements.metadataSummary.replaceChildren(fragment);
  }

  private renderParameters(parameters: readonly ViviWebParameter[]): void {
    const visibleParameters = selectDisplayParameters(parameters);
    if (visibleParameters.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "This model does not expose public input parameters.";
      this.elements.parameterControls.replaceChildren(empty);
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const parameter of visibleParameters) {
      const value = this.sliderValues.get(parameter.id) ?? parameter.default;
      this.sliderValues.set(parameter.id, value);

      const row = document.createElement("label");
      row.className = "parameter-row";
      const name = document.createElement("span");
      name.textContent = parameter.name;
      const id = document.createElement("code");
      id.textContent = parameter.id;
      const slider = document.createElement("input");
      slider.type = "range";
      slider.min = String(parameter.min);
      slider.max = String(parameter.max);
      slider.step = String(computeSliderStep(parameter));
      slider.value = String(value);
      slider.dataset.testid = "input-slider";
      const valueText = document.createElement("span");
      valueText.textContent = value.toFixed(2);

      slider.addEventListener("input", () => {
        const nextValue = Number(slider.value);
        this.sliderValues.set(parameter.id, nextValue);
        valueText.textContent = nextValue.toFixed(2);
        this.withPlayer((player) => {
          player.setInput(parameter.id, nextValue);
          player.render();
          this.setStatus("Input value applied with setInput().", "ready");
        });
      });

      const text = document.createElement("span");
      text.append(name, document.createTextNode(" "), id);
      row.append(text, slider, valueText);
      fragment.append(row);
    }
    this.elements.parameterControls.replaceChildren(fragment);
  }

  private showError(copy: ErrorCopy): void {
    this.renderError(copy);
    this.setStatus(copy.message, "error");
  }

  private renderError(copy: ErrorCopy): void {
    this.elements.errorOutput.textContent = `${copy.code}: ${copy.message} Retry: ${
      copy.retry ? "yes" : "no"
    }`;
  }

  private setStatus(message: string, state: HostState): void {
    this.hostState = state;
    this.elements.status.textContent = message;
    this.updateControls();
  }

  private updateControls(): void {
    const loading = this.hostState === "loading";
    const hasPlayer = this.player !== null;
    const running = this.player?.running ?? false;
    const disposed = this.hostState === "disposed";
    this.elements.buttons["start-player"].disabled = loading || !hasPlayer || running;
    this.elements.buttons["stop-player"].disabled = loading || !hasPlayer || !running;
    this.elements.buttons["manual-update"].disabled = loading || !hasPlayer || running;
    this.elements.buttons["dispose-player"].disabled = !hasPlayer && !loading && !disposed;
    this.elements.buttons["apply-visible-inputs"].disabled = loading || !hasPlayer;
    this.elements.buttons["reset-inputs"].disabled = loading || !hasPlayer;
    this.elements.buttons["unknown-input"].disabled = loading || !hasPlayer;
    this.elements.buttons["error-invalid-input"].disabled = loading || !hasPlayer;
    this.elements.buttons["error-invalid-resize"].disabled = loading || !hasPlayer;
    this.elements.buttons["error-disposed"].disabled = loading || !hasPlayer;
  }

  private isStale(runId: number): boolean {
    return runId !== this.currentRunId || this.controller?.signal.aborted === true;
  }
}

export function collectSampleElements(): SampleElements {
  const buttons = Object.fromEntries(
    BUTTON_IDS.map((id) => [id, requireElement<HTMLButtonElement>(`[data-testid="${id}"]`)]),
  ) as SampleElements["buttons"];

  return {
    buttons,
    canvas: requireElement("#vivi-canvas"),
    errorOutput: requireElement("#error-output"),
    fileInput: requireElement("#file-input"),
    metadataSummary: requireElement("#metadata-summary"),
    parameterControls: requireElement("#parameter-controls"),
    status: requireElement("#status"),
    strictInputs: requireElement('[data-testid="strict-inputs"]'),
  };
}

export function summarizePublicMetadata(
  metadata: ViviWebModelMetadata,
): ReadonlyArray<[label: string, value: string]> {
  const entries: Array<[string, string]> = [];
  if (PUBLIC_METADATA_FIELDS.name === "public" && metadata.name) {
    entries.push(["Name", metadata.name]);
  }
  entries.push(["Width", String(metadata.width)]);
  entries.push(["Height", String(metadata.height)]);
  entries.push(["Parameters", String(metadata.parameterCount)]);
  entries.push(["Expression presets", String(metadata.expressionPresetCount)]);
  return entries;
}

export function selectDisplayParameters(
  parameters: readonly ViviWebParameter[],
): readonly ViviWebParameter[] {
  return [...parameters]
    .sort(
      (left, right) =>
        left.id.localeCompare(right.id, "en", { sensitivity: "variant" }) ||
        left.name.localeCompare(right.name, "en", { sensitivity: "variant" }),
    )
    .slice(0, MAX_VISIBLE_SLIDERS);
}

function computeSliderStep(parameter: ViviWebParameter): number {
  const span = parameter.max - parameter.min;
  if (!Number.isFinite(span) || span <= 0) return 0.01;
  return Math.max(span / 200, 0.001);
}

function requireElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing required sample element: ${selector}`);
  return element;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
