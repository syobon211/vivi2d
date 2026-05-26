import type { RuntimeMeshSnapshot } from "@vivi2d/runtime";
import { toPhaserBlendMode } from "./blend-modes";

export interface PhaserMeshLike {
  addVertices(vertices: number[], uvs: number[], indices: number[]): void;
  setAlpha(alpha: number): void;
  setVisible(visible: boolean): void;
  setBlendMode(mode: number | string): void;
  setDepth(depth: number): void;
  setTint(tint: number): void;
  setPosition(x: number, y: number): void;
  destroy(): void;
  vertices?: Array<{ x: number; y: number }>;
}

export interface PhaserTexturesLike {
  addCanvas(key: string, canvas: HTMLCanvasElement): unknown;
  exists(key: string): boolean;
  remove(key: string): unknown;
}

export interface PhaserSceneLike {
  textures: PhaserTexturesLike;
  add: {
    mesh(x: number, y: number, textureKey: string): PhaserMeshLike;
  };
}

export interface ViviPhaserRendererOptions {
  scene: PhaserSceneLike;

  x?: number;

  y?: number;

  depthBase?: number;
}

interface ManagedMesh {
  gameObject: PhaserMeshLike;
  textureKey: string;
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

export type ViviPhaserRenderableModel =
  | RenderableViviModel
  | LegacyRenderableViviModel;

export class ViviPhaserRenderer {
  private phaserScene: PhaserSceneLike;
  private meshes: Map<string, ManagedMesh> = new Map();
  private model: ViviPhaserRenderableModel | null = null;
  private offsetX: number;
  private offsetY: number;
  private depthBase: number;
  private textureCounter = 0;

  constructor(options: ViviPhaserRendererOptions) {
    this.phaserScene = options.scene;
    this.offsetX = options.x ?? 0;
    this.offsetY = options.y ?? 0;
    this.depthBase = options.depthBase ?? 0;
  }

  setModel(
    model: ViviPhaserRenderableModel,
    canvasTextures: Map<string, HTMLCanvasElement>,
  ): void {
    this.destroyMeshes();
    this.model = model;

    for (const state of getRuntimeRenderList(this.model)) {
      const canvas = canvasTextures.get(state.id) ?? canvasTextures.get(state.textureId);
      if (!canvas) continue;
      const key = `vivi_${state.id}_${this.textureCounter++}`;
      this.phaserScene.textures.addCanvas(key, canvas);
      this.buildMesh(state, key);
    }
  }

  sync(): void {
    if (!this.model) return;
    this.syncMeshes();
  }

  setOffset(x: number, y: number): void {
    this.offsetX = x;
    this.offsetY = y;
  }

  screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    return {
      x: screenX - this.offsetX,
      y: screenY - this.offsetY,
    };
  }

  destroy(): void {
    this.destroyMeshes();
    this.model = null;
  }

  private buildMesh(state: RuntimeMeshSnapshot, textureKey: string): void {
    const verts2d = state.vertices;
    const uvs = state.uvs;
    const indices = state.indices;

    const phaserMesh = this.phaserScene.add.mesh(
      this.offsetX + state.x,
      this.offsetY + state.y,
      textureKey,
    );

    const vertices: number[] = [];
    const phaserUvs: number[] = [];
    const phaserIndices: number[] = [];

    for (let i = 0; i < verts2d.length / 2; i++) {
      vertices.push(verts2d[i * 2]!, verts2d[i * 2 + 1]!);
      phaserUvs.push(uvs[i * 2]!, uvs[i * 2 + 1]!);
    }

    for (let i = 0; i < indices.length; i++) {
      phaserIndices.push(indices[i]!);
    }

    phaserMesh.addVertices(vertices, phaserUvs, phaserIndices);

    phaserMesh.setAlpha(state.opacity);
    phaserMesh.setVisible(state.visible);
    phaserMesh.setBlendMode(toPhaserBlendMode(state.blendMode));
    phaserMesh.setDepth(this.depthBase + state.drawOrder);
    phaserMesh.setTint(runtimeColorToHex(state.multiplyColor));

    this.meshes.set(state.id, { gameObject: phaserMesh, textureKey });
  }

  private syncMeshes(): void {
    if (!this.model) return;

    for (const [meshId, managed] of this.meshes) {
      const state = getRuntimeMeshSnapshot(this.model, meshId);
      if (!state) {
        managed.gameObject.setVisible(false);
        continue;
      }

      const go = managed.gameObject;

      go.setPosition(this.offsetX + state.x, this.offsetY + state.y);

      go.setAlpha(state.opacity);
      go.setVisible(state.visible);
      go.setDepth(this.depthBase + state.drawOrder);

      go.setBlendMode(toPhaserBlendMode(state.blendMode));

      go.setTint(runtimeColorToHex(state.multiplyColor));

      if (go.vertices && state.vertices) {
        const verts2d = state.vertices;
        for (let i = 0; i < go.vertices.length && i < verts2d.length / 2; i++) {
          const v = go.vertices[i];
          if (v) {
            v.x = verts2d[i * 2]!;
            v.y = verts2d[i * 2 + 1]!;
          }
        }
      }
    }
  }

  private destroyMeshes(): void {
    for (const managed of this.meshes.values()) {
      managed.gameObject.destroy();
      if (this.phaserScene?.textures?.exists(managed.textureKey)) {
        this.phaserScene.textures.remove(managed.textureKey);
      }
    }
    this.meshes.clear();
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

function getRuntimeRenderList(
  model: ViviPhaserRenderableModel,
): readonly RuntimeMeshSnapshot[] {
  if ("getRenderList" in model) return model.getRenderList();
  return [...model.getAllMeshStates().values()].map(legacyStateToRuntimeSnapshot);
}

function getRuntimeMeshSnapshot(
  model: ViviPhaserRenderableModel,
  meshId: string,
): RuntimeMeshSnapshot | null {
  if ("getMeshSnapshot" in model) return model.getMeshSnapshot(meshId);
  const state = model.getMeshState(meshId);
  return state ? legacyStateToRuntimeSnapshot(state) : null;
}

function legacyStateToRuntimeSnapshot(
  state: LegacyMeshRenderState,
): RuntimeMeshSnapshot {
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
  return mode === "multiply" || mode === "screen" || mode === "add"
    ? mode
    : "normal";
}
