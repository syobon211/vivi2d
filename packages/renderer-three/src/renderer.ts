import type { RuntimeMeshSnapshot } from "@vivi2d/runtime";
import {
  BufferAttribute,
  BufferGeometry,
  type CanvasTexture,
  Color,
  type Material,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  OrthographicCamera,
  Scene,
  type ShaderMaterial,
  WebGLRenderer,
} from "three";
import { type ThreeBlendConfig, toThreeBlendConfig } from "./blend-modes";
import {
  canvasToThreeTexture,
  createScreenColorMaterial,
  updateScreenColorMaterial,
} from "./screen-color-material";

export interface ViviThreeRendererOptions {
  backgroundColor?: number;

  transparent?: boolean;

  antialias?: boolean;
}

export interface ViviThreeEmbedOptions {
  scene: Scene;
}

interface ManagedMesh {
  mesh: Mesh;
  baseMaterial: MeshBasicMaterial;
  screenMaterial: ShaderMaterial | null;
  texture: CanvasTexture;
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

export type ViviThreeRenderableModel = RenderableViviModel | LegacyRenderableViviModel;

export class ViviThreeRenderer {
  private webglRenderer: WebGLRenderer | null;
  private camera: OrthographicCamera | null;
  private container: Object3D;
  private meshes: Map<string, ManagedMesh> = new Map();
  private textures: Map<string, CanvasTexture> = new Map();
  private model: ViviThreeRenderableModel | null = null;
  private scene: Scene;

  private constructor(
    scene: Scene,
    webglRenderer: WebGLRenderer | null,
    camera: OrthographicCamera | null,
  ) {
    this.scene = scene;
    this.webglRenderer = webglRenderer;
    this.camera = camera;
    this.container = new Object3D();
    this.container.name = "vivi2d";
    this.scene.add(this.container);
  }

  static create(
    canvas: HTMLCanvasElement,
    options?: ViviThreeRendererOptions,
  ): ViviThreeRenderer {
    const scene = new Scene();

    const w = canvas.width;
    const h = canvas.height;
    const camera = new OrthographicCamera(0, w, 0, h, -10000, 10000);
    camera.position.z = 1;

    const webglRenderer = new WebGLRenderer({
      canvas,
      antialias: options?.antialias ?? true,
      alpha: options?.transparent ?? false,
    });
    webglRenderer.setSize(w, h);

    if (!options?.transparent) {
      const bgColor = options?.backgroundColor ?? 0xffffff;
      scene.background = new Color(bgColor);
    }

    return new ViviThreeRenderer(scene, webglRenderer, camera);
  }

  static embed(options: ViviThreeEmbedOptions): ViviThreeRenderer {
    return new ViviThreeRenderer(options.scene, null, null);
  }

  setModel(
    model: ViviThreeRenderableModel,
    canvasTextures: Map<string, HTMLCanvasElement>,
  ): void {
    this.destroyMeshes();
    this.model = model;

    this.textures.clear();
    for (const [layerId, canvas] of canvasTextures) {
      this.textures.set(layerId, canvasToThreeTexture(canvas));
    }

    this.buildMeshes();
  }

  sync(): void {
    if (!this.model) return;
    this.syncMeshes();
  }

  render(): void {
    if (!this.model || !this.webglRenderer || !this.camera) return;
    this.syncMeshes();
    this.webglRenderer.render(this.scene, this.camera);
  }

  resize(width: number, height: number): void {
    if (this.webglRenderer) {
      this.webglRenderer.setSize(width, height);
    }
    if (this.camera) {
      this.camera.right = width;
      this.camera.bottom = height;
      this.camera.updateProjectionMatrix();
    }
  }

  screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    return { x: screenX, y: screenY };
  }

  get viviContainer(): Object3D {
    return this.container;
  }

  destroy(): void {
    this.destroyMeshes();
    this.textures.clear();
    this.model = null;
    this.scene.remove(this.container);
    if (this.webglRenderer) {
      this.webglRenderer.dispose();
      this.webglRenderer = null;
    }
  }

  private buildMeshes(): void {
    if (!this.model) return;

    for (const state of getRuntimeRenderList(this.model)) {
      const texture = this.textures.get(state.id) ?? this.textures.get(state.textureId);
      if (!texture) continue;

      const geometry = this.createGeometry(state);

      const baseMaterial = new MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
      });

      const blendConfig = toThreeBlendConfig(state.blendMode);
      applyThreeBlendConfig(baseMaterial, blendConfig);

      baseMaterial.color.setHex(runtimeColorToHex(state.multiplyColor));

      const activeMaterial: Material = baseMaterial;
      let screenMaterial: ShaderMaterial | null = null;

      if (state.screenColor) {
        screenMaterial = createScreenColorMaterial(
          texture,
          runtimeColorToRgb(state.screenColor),
        );
        const scBlend = toThreeBlendConfig(state.blendMode);
        applyThreeBlendConfig(screenMaterial, scBlend);
      }

      const mesh = new Mesh(
        geometry,
        state.screenColor ? screenMaterial! : activeMaterial,
      );
      mesh.name = state.id;
      mesh.position.set(state.x, state.y, 0);
      mesh.renderOrder = state.drawOrder;
      mesh.visible = state.visible;
      mesh.material.opacity = state.opacity;

      this.container.add(mesh);
      this.meshes.set(state.id, { mesh, baseMaterial, screenMaterial, texture });
    }
  }

  private createGeometry(state: RuntimeMeshSnapshot): BufferGeometry {
    const geometry = new BufferGeometry();

    const verts2d = state.vertices;
    const position = new Float32Array((verts2d.length / 2) * 3);
    for (let i = 0; i < verts2d.length / 2; i++) {
      position[i * 3] = verts2d[i * 2]!;
      position[i * 3 + 1] = verts2d[i * 2 + 1]!;
      position[i * 3 + 2] = 0;
    }

    geometry.setAttribute("position", new BufferAttribute(position, 3));
    geometry.setAttribute("uv", new BufferAttribute(new Float32Array(state.uvs), 2));
    geometry.setIndex(new BufferAttribute(new Uint32Array(state.indices), 1));

    return geometry;
  }

  private syncMeshes(): void {
    if (!this.model) return;

    for (const [meshId, managed] of this.meshes) {
      const state = getRuntimeMeshSnapshot(this.model, meshId);
      if (!state) {
        managed.mesh.visible = false;
        continue;
      }

      const { mesh, baseMaterial, texture } = managed;

      mesh.position.set(state.x, state.y, 0);
      mesh.renderOrder = state.drawOrder;
      mesh.visible = state.visible;

      (mesh.material as Material).opacity = state.opacity;

      baseMaterial.color.setHex(runtimeColorToHex(state.multiplyColor));

      const blendConfig = toThreeBlendConfig(state.blendMode);
      applyThreeBlendConfig(baseMaterial, blendConfig);

      if (state.screenColor) {
        if (managed.screenMaterial) {
          updateScreenColorMaterial(
            managed.screenMaterial,
            runtimeColorToRgb(state.screenColor),
          );
          managed.screenMaterial.opacity = state.opacity;
        } else {
          managed.screenMaterial = createScreenColorMaterial(
            texture,
            runtimeColorToRgb(state.screenColor),
          );
          managed.screenMaterial.opacity = state.opacity;
        }
        applyThreeBlendConfig(
          managed.screenMaterial,
          toThreeBlendConfig(state.blendMode),
        );
        mesh.material = managed.screenMaterial;
      } else {
        if (managed.screenMaterial) {
          managed.screenMaterial.dispose();
          managed.screenMaterial = null;
        }
        mesh.material = baseMaterial;
      }

      const geo = mesh.geometry;
      const posAttr = geo.getAttribute("position") as BufferAttribute;
      const verts2d = state.vertices;
      const posArray = posAttr.array as Float32Array;
      for (let i = 0; i < verts2d.length / 2; i++) {
        posArray[i * 3] = verts2d[i * 2]!;
        posArray[i * 3 + 1] = verts2d[i * 2 + 1]!;
      }
      posAttr.needsUpdate = true;
    }
  }

  private destroyMeshes(): void {
    for (const managed of this.meshes.values()) {
      managed.mesh.geometry.dispose();
      managed.baseMaterial.dispose();
      managed.screenMaterial?.dispose();
      managed.texture.dispose();
      this.container.remove(managed.mesh);
    }
    this.meshes.clear();
  }
}

function applyThreeBlendConfig(material: Material, blendConfig: ThreeBlendConfig): void {
  material.blending = blendConfig.blending;
  if (blendConfig.blendSrc !== undefined) material.blendSrc = blendConfig.blendSrc;
  if (blendConfig.blendDst !== undefined) material.blendDst = blendConfig.blendDst;
  if (blendConfig.blendEquation !== undefined) {
    material.blendEquation = blendConfig.blendEquation;
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
  model: ViviThreeRenderableModel,
): readonly RuntimeMeshSnapshot[] {
  if ("getRenderList" in model) return model.getRenderList();
  return [...model.getAllMeshStates().values()].map(legacyStateToRuntimeSnapshot);
}

function getRuntimeMeshSnapshot(
  model: ViviThreeRenderableModel,
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
