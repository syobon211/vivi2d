import "pixi.js/unsafe-eval";
import type { RuntimeMeshSnapshot } from "@vivi2d/runtime";
import {
  Application,
  Container,
  type Filter,
  type Matrix,
  MeshSimple,
  type RenderTexture,
  Texture,
  type WebGLRenderer,
} from "pixi.js";
import {
  disposePixiApplication,
  preparePixiCanvas,
  registerPixiApplication,
  rememberPixiEventOwner,
  waitForPixiCanvas,
} from "./app-lifecycle";
import { toPixiBlendMode } from "./blend-modes";
import {
  type EvaluationRenderSnapshot,
  type PreparedEvaluationModel,
  prepareEvaluationModel,
} from "./evaluation-model";
import { createScreenColorFilter, updateScreenColorFilter } from "./screen-color-filter";

export interface ViviRendererOptions {
  backgroundColor?: number;

  antialias?: boolean;

  transparent?: boolean;
}

export interface RenderableViviModel {
  getRenderList(): readonly RuntimeMeshSnapshot[];
  getMeshSnapshot(meshId: string): RuntimeMeshSnapshot | null;
}

interface LegacyMeshRenderState {
  id: string;
  textureId?: string;
  vertices: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  x: number;
  y: number;
  opacity: number;
  visible: boolean;
  culled: boolean;
  blendMode: RuntimeMeshSnapshot["blendMode"] | string;
  multiplyColor: { r: number; g: number; b: number };
  screenColor?: { r: number; g: number; b: number };
  drawOrder: number;
}

export interface LegacyRenderableViviModel {
  getAllMeshStates(): ReadonlyMap<string, LegacyMeshRenderState>;
  getMeshState(meshId: string): LegacyMeshRenderState | undefined;
}

export type ViviPixiRenderableModel = RenderableViviModel | LegacyRenderableViviModel;

export class ViviPixiRenderer {
  private app: Application;
  private world: Container;
  private meshes: Map<string, MeshSimple> = new Map();
  private textures: Map<string, Texture> = new Map();
  private screenFilters: Map<string, Filter> = new Map();
  private model: ViviPixiRenderableModel | null = null;
  private initialized = false;
  private activeEvaluation: PreparedEvaluationModel | null = null;
  private pendingEvaluations = new Set<PreparedEvaluationModel>();
  private evaluationUnavailable = false;
  private lifecycleVersion = 0;

  private constructor(
    app: Application,
    private readonly canvas: HTMLCanvasElement,
    private readonly options?: ViviRendererOptions,
  ) {
    this.app = app;
    this.world = new Container();
    this.world.sortableChildren = true;
    this.app.stage.addChild(this.world);
  }

  static async create(
    canvas: HTMLCanvasElement,
    options?: ViviRendererOptions,
  ): Promise<ViviPixiRenderer> {
    const app = await ViviPixiRenderer.createApplication(canvas, options);
    const renderer = new ViviPixiRenderer(app, canvas, options);
    renderer.initialized = true;
    return renderer;
  }

  private static async createApplication(
    canvas: HTMLCanvasElement,
    options?: ViviRendererOptions,
  ): Promise<Application> {
    await waitForPixiCanvas(canvas);
    const appOptions = {
      canvas,
      backgroundAlpha: options?.transparent ? 0 : 1,
      backgroundColor: options?.backgroundColor ?? 0xffffff,
      antialias: options?.antialias ?? true,
      autoDensity: true,
      // The runtime host owns frame scheduling and calls render explicitly.
      autoStart: false,
      resolution: window.devicePixelRatio || 1,
      width: canvas.width,
      height: canvas.height,
    };
    preparePixiCanvas(canvas, appOptions);
    rememberPixiEventOwner();
    const app = new Application();
    await app.init(appOptions);
    registerPixiApplication(app);
    return app;
  }

  /** Explicit lifecycle recovery only; never resume drawing on an interrupted device. */
  async recoverEvaluation(): Promise<void> {
    if (!this.evaluationUnavailable) return;
    const retained = this.activeEvaluation?.snapshot;
    try {
      this.destroy();
    } catch {
      /* The retired instance is never used again. */
    }
    const version = this.lifecycleVersion;
    const application = await ViviPixiRenderer.createApplication(
      this.canvas,
      this.options,
    );
    if (version !== this.lifecycleVersion) {
      disposePixiApplication(application, this.canvas);
      throw new Error("EVALUATION_RENDERER_UNAVAILABLE");
    }
    this.app = application;
    this.world = new Container();
    this.world.sortableChildren = true;
    this.app.stage.addChild(this.world);
    this.initialized = true;
    this.evaluationUnavailable = false;
    if (retained) {
      const pending = this.prepareEvaluationModel(retained);
      this.validatePreparedEvaluation(pending);
      const old = this.commitPreparedEvaluation(pending);
      this.finalizeEvaluation(pending, old);
      this.render();
    }
  }

  setModel(
    model: ViviPixiRenderableModel,
    canvasTextures: Map<string, HTMLCanvasElement>,
  ): void {
    if (this.activeEvaluation) throw new Error("EVALUATION_RENDERER_ALREADY_OWNED");
    this.destroyMeshes();
    this.model = model;

    this.destroyTextures();
    for (const [layerId, canvas] of canvasTextures) {
      this.textures.set(layerId, Texture.from(canvas));
    }

    this.buildMeshes();
  }

  render(): void {
    if (this.activeEvaluation) {
      if (!this.initialized || this.evaluationUnavailable) return;
      this.renderEvaluation(this.activeEvaluation.world);
      return;
    }
    if (!this.model || !this.initialized) return;
    this.syncMeshes();
    this.app.render();
  }

  /** Detached same-device allocation/upload. Never publishes the CPU model. */
  prepareEvaluationModel(
    snapshot: EvaluationRenderSnapshot,
    reuseTextures = false,
  ): PreparedEvaluationModel {
    if (!this.initialized || this.evaluationUnavailable || !("gl" in this.app.renderer))
      throw new Error("EVALUATION_RENDERER_UNAVAILABLE");
    const pending = prepareEvaluationModel(
      this,
      snapshot,
      this.app.renderer as WebGLRenderer,
      (container, target, transform) =>
        this.renderEvaluation(container, target, transform),
      this.activeEvaluation,
      reuseTextures,
    );
    this.pendingEvaluations.add(pending);
    return pending;
  }

  validatePreparedEvaluation(pending: PreparedEvaluationModel): void {
    if (
      !this.initialized ||
      this.evaluationUnavailable ||
      !this.pendingEvaluations.has(pending) ||
      pending.disposed ||
      pending.selected
    )
      throw new Error("EVALUATION_RENDERER_UNAVAILABLE");
  }

  /** Call only after validation and successful native consumption. No events,
   * allocation, property setters, resource destruction or queries here. */
  commitPreparedEvaluation(
    pending: PreparedEvaluationModel,
  ): PreparedEvaluationModel | null {
    const retired = this.activeEvaluation;
    this.activeEvaluation = pending;
    return retired;
  }

  finalizeEvaluation(
    pending: PreparedEvaluationModel,
    retired: PreparedEvaluationModel | null,
  ): void {
    this.pendingEvaluations.delete(pending);
    pending.selected = true;
    retired?.dispose(pending.ownedTextureSource);
  }

  discardPreparedEvaluation(pending: PreparedEvaluationModel): void {
    if (!this.pendingEvaluations.delete(pending)) return;
    pending.dispose();
  }

  private renderEvaluation(
    container: Container,
    target?: RenderTexture,
    transform?: Matrix,
  ): void {
    if (this.evaluationUnavailable || !this.initialized)
      throw new Error("EVALUATION_RENDERER_UNAVAILABLE");
    try {
      this.app.renderer.render({ container, target, transform, clear: true });
      const renderer = this.app.renderer as WebGLRenderer;
      if (
        !renderer.gl ||
        renderer.gl.isContextLost() ||
        renderer.gl.getError() !== renderer.gl.NO_ERROR
      )
        throw new Error("EVALUATION_RENDERER_UNAVAILABLE");
    } catch {
      // An entered interrupted render permanently retires this GPU instance.
      this.evaluationUnavailable = true;
      this.app.stop();
      throw new Error("EVALUATION_RENDERER_UNAVAILABLE");
    }
  }

  resize(width: number, height: number): void {
    this.app.renderer.resize(width, height);
  }

  destroy(): void {
    this.lifecycleVersion++;
    if (!this.initialized) return;
    this.initialized = false;
    this.app.stop();
    this.model = null;
    try {
      for (const pending of this.pendingEvaluations) pending.dispose();
      this.pendingEvaluations.clear();
      this.activeEvaluation?.dispose(true);
      this.activeEvaluation = null;
      this.destroyMeshes();
      this.destroyTextures();
    } finally {
      disposePixiApplication(this.app, this.canvas);
    }
  }

  screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    const worldPos = this.world.toLocal({ x: screenX, y: screenY });
    return { x: worldPos.x, y: worldPos.y };
  }

  get pixiApp(): Application {
    return this.app;
  }

  private buildMeshes(): void {
    if (!this.model) return;

    for (const state of getRuntimeRenderList(this.model)) {
      const texture = this.textures.get(state.id) ?? this.textures.get(state.textureId);
      if (!texture) continue;

      const mesh = new MeshSimple({
        texture,
        vertices: state.vertices,
        uvs: state.uvs,
        indices: state.indices,
      });

      mesh.label = state.id;
      this.applyMeshState(mesh, state);
      this.world.addChild(mesh);
      this.meshes.set(state.id, mesh);
    }
  }

  private syncMeshes(): void {
    if (!this.model) return;

    for (const [meshId, mesh] of this.meshes) {
      const state = getRuntimeMeshSnapshot(this.model, meshId);
      if (!state) {
        mesh.visible = false;
        continue;
      }
      this.applyMeshState(mesh, state);

      mesh.vertices = state.vertices;
    }
  }

  private applyMeshState(mesh: MeshSimple, state: RuntimeMeshSnapshot): void {
    mesh.x = state.x;
    mesh.y = state.y;
    mesh.alpha = state.opacity;
    mesh.visible = state.visible;
    mesh.blendMode = toPixiBlendMode(state.blendMode);
    mesh.tint = runtimeColorToHex(state.multiplyColor);
    mesh.zIndex = state.drawOrder;

    if (state.screenColor) {
      const existing = this.screenFilters.get(state.id);
      if (existing) {
        updateScreenColorFilter(existing, runtimeColorToRgb(state.screenColor));
      } else {
        const filter = createScreenColorFilter(runtimeColorToRgb(state.screenColor));
        mesh.filters = [filter];
        this.screenFilters.set(state.id, filter);
      }
    } else {
      const existing = this.screenFilters.get(state.id);
      if (existing) {
        mesh.filters = [];
        existing.destroy();
        this.screenFilters.delete(state.id);
      }
    }
  }

  private destroyMeshes(): void {
    for (const mesh of this.meshes.values()) {
      mesh.destroy({ children: true });
    }
    this.meshes.clear();
    for (const f of this.screenFilters.values()) f.destroy();
    this.screenFilters.clear();
  }

  private destroyTextures(): void {
    for (const tex of this.textures.values()) {
      tex.destroy(false);
    }
    this.textures.clear();
  }
}

function runtimeColorToHex(
  color: readonly [number, number, number, number] | null,
): number {
  const r = Math.round(Math.max(0, Math.min(1, color?.[0] ?? 1)) * 255);
  const g = Math.round(Math.max(0, Math.min(1, color?.[1] ?? 1)) * 255);
  const b = Math.round(Math.max(0, Math.min(1, color?.[2] ?? 1)) * 255);
  return (r << 16) | (g << 8) | b;
}

function runtimeColorToRgb(color: readonly [number, number, number, number]) {
  return { r: color[0], g: color[1], b: color[2] };
}

function getRuntimeRenderList(
  model: ViviPixiRenderableModel,
): readonly RuntimeMeshSnapshot[] {
  if ("getRenderList" in model) return model.getRenderList();
  return [...model.getAllMeshStates().values()].map(legacyStateToRuntimeSnapshot);
}

function getRuntimeMeshSnapshot(
  model: ViviPixiRenderableModel,
  meshId: string,
): RuntimeMeshSnapshot | null {
  if ("getMeshSnapshot" in model) return model.getMeshSnapshot(meshId);
  const state = model.getMeshState(meshId);
  return state ? legacyStateToRuntimeSnapshot(state) : null;
}

function legacyStateToRuntimeSnapshot(state: LegacyMeshRenderState): RuntimeMeshSnapshot {
  return {
    id: state.id,
    textureId: state.textureId ?? state.id,
    vertices: state.vertices,
    uvs: state.uvs,
    indices: state.indices,
    x: state.x,
    y: state.y,
    opacity: state.opacity,
    visible: state.visible,
    culled: state.culled,
    blendMode: toRuntimeBlendMode(state.blendMode),
    multiplyColor: [
      state.multiplyColor.r,
      state.multiplyColor.g,
      state.multiplyColor.b,
      1,
    ],
    screenColor: state.screenColor
      ? [state.screenColor.r, state.screenColor.g, state.screenColor.b, 1]
      : null,
    drawOrder: state.drawOrder,
  };
}

function toRuntimeBlendMode(mode: string): RuntimeMeshSnapshot["blendMode"] {
  return mode === "multiply" || mode === "screen" || mode === "add" ? mode : "normal";
}
