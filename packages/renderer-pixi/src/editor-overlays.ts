import { Container, MeshSimple, Sprite, Texture } from "pixi.js";

export type EditorOverlayContainer = Container;

export interface OverlayBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GhostMeshOptions {
  textureSource: HTMLCanvasElement;
  vertices: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  x: number;
  y: number;
  alpha: number;
  tint: number;
}

export interface TexturedOverlayOptions {
  textureSource: HTMLCanvasElement;
  label: string;
  bounds: OverlayBounds;
  alpha: number;
}

export interface RectOverlayOptions {
  label: string;
  bounds: OverlayBounds;
  alpha: number;
  tint: number;
}

export function createOverlayContainer(
  world: Container,
  label: string,
  zIndex: number,
): Container {
  const container = new Container();
  container.label = label;
  container.zIndex = zIndex;
  world.addChild(container);
  return container;
}

export function destroyOverlayContainer(container: Container | null | undefined): void {
  container?.destroy({ children: true });
}

export function createTexturedOverlaySprite(options: TexturedOverlayOptions): Sprite {
  const sprite = new Sprite(Texture.from(options.textureSource));
  sprite.label = options.label;
  sprite.x = options.bounds.x;
  sprite.y = options.bounds.y;
  sprite.width = options.bounds.width;
  sprite.height = options.bounds.height;
  sprite.alpha = options.alpha;
  return sprite;
}

export function createRectOverlaySprite(options: RectOverlayOptions): Sprite {
  const sprite = new Sprite(Texture.WHITE);
  sprite.label = options.label;
  sprite.x = options.bounds.x;
  sprite.y = options.bounds.y;
  sprite.width = options.bounds.width;
  sprite.height = options.bounds.height;
  sprite.alpha = options.alpha;
  sprite.tint = options.tint;
  return sprite;
}

export function createGhostMesh(options: GhostMeshOptions): MeshSimple {
  const texture = Texture.from(options.textureSource);
  const mesh = new MeshSimple({
    texture,
    vertices: options.vertices,
    uvs: options.uvs,
    indices: options.indices,
  });
  mesh.x = options.x;
  mesh.y = options.y;
  mesh.alpha = options.alpha;
  mesh.tint = options.tint;
  return mesh;
}
