import {
  AlphaFilter,
  Container,
  type Filter,
  MaskFilter,
  Matrix,
  MeshSimple,
  RenderTexture,
  Sprite,
  Texture,
  type WebGLRenderer,
} from "pixi.js";
import { isValidBlendMode, toPixiBlendMode } from "./blend-modes";
import { createScreenColorFilter } from "./screen-color-filter";

/** Internal copy-out input. Geometry/commands were evaluated by C11, not Pixi. */
export interface EvaluationRenderMesh {
  slot: number;
  id: string;
  textureSlot: number;
  vertices: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  x: number;
  y: number;
  opacity: number;
  visible: boolean;
  culled: boolean;
  blendMode: string;
  multiplyColor: readonly [number, number, number] | null;
  screenColor: readonly [number, number, number] | null;
}

export interface EvaluationRenderTexture {
  slot: number;
  id: string;
  width: number;
  height: number;
  rowStride: number;
  rgba: Uint8Array;
}

export interface EvaluationDrawCommand {
  kind: 1 | 2 | 3;
  meshSlot: number;
  depth: number;
  flags: number;
}

export interface EvaluationRenderSnapshot {
  requiredFeatures: number;
  meshes: readonly EvaluationRenderMesh[];
  textures: readonly EvaluationRenderTexture[];
  commands: readonly EvaluationDrawCommand[];
}

const FAILURE = "EVALUATION_RENDERER_UNAVAILABLE";
const MAX_PIXELS = 67_108_864;
const requireValid = (condition: unknown): void => {
  if (!condition) throw new Error(FAILURE);
};
const quiet = (run: () => void): void => {
  try {
    run();
  } catch {
    // Retired GPU cleanup cannot reverse CPU publication.
  }
};

/** A detached same-device owner. The renderer alone selects its active reference. */
export class PreparedEvaluationModel {
  readonly world = new Container();
  readonly meshes = new Set<MeshSimple>();
  readonly filters = new Set<Filter>();
  readonly sprites = new Set<Sprite>();
  readonly rasters = new Map<number, { texture: RenderTexture; x: number; y: number }>();
  readonly textures: readonly Texture[];
  readonly snapshot: EvaluationRenderSnapshot;
  readonly owner: object;
  disposed = false;
  selected = false;
  readonly ownedTextureSource: boolean;

  constructor(
    owner: object,
    snapshot: EvaluationRenderSnapshot,
    textures: readonly Texture[],
    ownedTextureSource: boolean,
  ) {
    this.owner = owner;
    this.snapshot = snapshot;
    this.textures = textures;
    this.ownedTextureSource = ownedTextureSource;
    this.world.sortableChildren = false;
  }

  dispose(destroyTextures = this.ownedTextureSource): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const filter of this.filters) quiet(() => filter.destroy(false));
    for (const sprite of this.sprites)
      quiet(() => sprite.destroy({ texture: false, textureSource: false }));
    for (const mesh of this.meshes) {
      const geometry = mesh.geometry;
      quiet(() => mesh.destroy());
      for (const buffer of geometry.buffers)
        if (buffer !== geometry.indexBuffer) quiet(() => buffer.destroy());
      quiet(() => geometry.destroy());
    }
    quiet(() => this.world.destroy({ children: true }));
    for (const { texture } of this.rasters.values()) quiet(() => texture.destroy(true));
    if (destroyTextures)
      for (const texture of this.textures) quiet(() => texture.destroy(true));
  }
}

/** Only bounded display shape/feature checks; no Project or C11 evaluator here. */
function preflight(
  snapshot: EvaluationRenderSnapshot,
  renderer: WebGLRenderer,
  retainedPixels: number,
): Map<number, { x: number; y: number; width: number; height: number }> {
  const gl = renderer.gl;
  requireValid(gl && !gl.isContextLost());
  const maximum = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
  const resolution = renderer.resolution;
  requireValid(
    Number.isSafeInteger(maximum) &&
      maximum > 0 &&
      Number.isFinite(resolution) &&
      resolution > 0 &&
      (snapshot.requiredFeatures & ~1) === 0 &&
      Number.isSafeInteger(snapshot.requiredFeatures),
  );
  const physical = (width: number, height: number): number => {
    const w = 2 ** Math.ceil(Math.log2(Math.ceil(width * resolution)));
    const h = 2 ** Math.ceil(Math.log2(Math.ceil(height * resolution)));
    requireValid(
      width > 0 &&
        height > 0 &&
        Number.isSafeInteger(w) &&
        Number.isSafeInteger(h) &&
        w <= maximum &&
        h <= maximum,
    );
    return w * h;
  };
  let total = retainedPixels + physical(renderer.screen.width, renderer.screen.height);
  let rgbaBytes = 0;
  requireValid(snapshot.textures.length <= 32);
  for (const [slot, texture] of snapshot.textures.entries()) {
    requireValid(
      texture.slot === slot &&
        Number.isSafeInteger(texture.width) &&
        Number.isSafeInteger(texture.height) &&
        texture.width > 0 &&
        texture.height > 0 &&
        texture.width <= 8192 &&
        texture.height <= 8192 &&
        texture.width <= maximum &&
        texture.height <= maximum &&
        texture.rowStride === texture.width * 4 &&
        texture.rgba instanceof Uint8Array &&
        texture.rgba.byteLength === texture.rowStride * texture.height,
    );
    rgbaBytes += texture.rgba.byteLength;
  }
  requireValid(rgbaBytes <= MAX_PIXELS * 4);
  const bounds = new Map<
    number,
    { x: number; y: number; width: number; height: number }
  >();
  for (const [slot, mesh] of snapshot.meshes.entries()) {
    requireValid(
      mesh.slot === slot &&
        Number.isInteger(mesh.textureSlot) &&
        mesh.textureSlot >= 0 &&
        mesh.textureSlot < snapshot.textures.length,
    );
    requireValid(
      mesh.vertices instanceof Float32Array &&
        mesh.uvs instanceof Float32Array &&
        mesh.indices instanceof Uint32Array &&
        mesh.vertices.length % 2 === 0 &&
        mesh.vertices.length === mesh.uvs.length &&
        mesh.vertices.length > 0 &&
        mesh.indices.length % 3 === 0 &&
        mesh.vertices.every(Number.isFinite) &&
        mesh.uvs.every(Number.isFinite) &&
        mesh.indices.every((index) => index < mesh.vertices.length / 2) &&
        [mesh.x, mesh.y, mesh.opacity].every(Number.isFinite) &&
        isValidBlendMode(mesh.blendMode),
    );
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (let i = 0; i < mesh.vertices.length; i += 2) {
      minX = Math.min(minX, mesh.vertices[i]! + mesh.x);
      maxX = Math.max(maxX, mesh.vertices[i]! + mesh.x);
      minY = Math.min(minY, mesh.vertices[i + 1]! + mesh.y);
      maxY = Math.max(maxY, mesh.vertices[i + 1]! + mesh.y);
    }
    const x = Math.floor(minX),
      y = Math.floor(minY);
    bounds.set(slot, {
      x,
      y,
      width: Math.max(1, Math.ceil(maxX) - x),
      height: Math.max(1, Math.ceil(maxY) - y),
    });
  }
  const sources = new Set<number>();
  let depth = 0;
  for (const command of snapshot.commands) {
    requireValid(Number.isInteger(command.meshSlot) && Number.isInteger(command.depth));
    if (command.kind === 2) {
      depth++;
      requireValid(
        depth <= 8 &&
          (command.flags === 0 || command.flags === 1) &&
          bounds.has(command.meshSlot),
      );
      sources.add(command.meshSlot);
    } else if (command.kind === 3) {
      requireValid(depth > 0 && command.meshSlot === 0 && command.flags === 0);
      depth--;
    } else {
      requireValid(
        command.kind === 1 && command.flags === 0 && bounds.has(command.meshSlot),
      );
      if (depth) {
        const boundsForMesh = bounds.get(command.meshSlot)!;
        total += physical(boundsForMesh.width, boundsForMesh.height) * (2 + depth * 2);
      }
    }
    requireValid(command.depth === depth);
  }
  requireValid(
    depth === 0 && (sources.size === 0 || (snapshot.requiredFeatures & 1) !== 0),
  );
  for (const slot of sources) {
    const rectangle = bounds.get(slot)!;
    total += physical(rectangle.width, rectangle.height);
  }
  requireValid(Number.isSafeInteger(total) && total <= MAX_PIXELS);
  return new Map([...sources].map((slot) => [slot, bounds.get(slot)!]));
}

export function evaluationRasterPixels(bundle: PreparedEvaluationModel | null): number {
  let total = 0;
  for (const { texture } of bundle?.rasters.values() ?? [])
    total += texture.source.pixelWidth * texture.source.pixelHeight;
  return total;
}

/** D's accepted alpha-source raster/filter mechanics, without its Project evaluator. */
export function prepareEvaluationModel(
  owner: object,
  snapshot: EvaluationRenderSnapshot,
  renderer: WebGLRenderer,
  renderSafely: (container: Container, target: RenderTexture, transform?: Matrix) => void,
  incumbent: PreparedEvaluationModel | null,
  reuseTextures = false,
): PreparedEvaluationModel {
  const plans = preflight(snapshot, renderer, evaluationRasterPixels(incumbent));
  const textures: Texture[] = [];
  let pending: PreparedEvaluationModel | undefined;
  try {
    if (reuseTextures) {
      requireValid(incumbent && incumbent.textures.length === snapshot.textures.length);
      textures.push(...incumbent!.textures);
    } else {
      for (const texture of snapshot.textures) {
        // Same Canvas->Texture path as D. These are verified RGBA, not a PNG decoder.
        const canvas = document.createElement("canvas");
        canvas.width = texture.width;
        canvas.height = texture.height;
        const context = canvas.getContext("2d");
        requireValid(context);
        context!.putImageData(
          new ImageData(
            new Uint8ClampedArray(texture.rgba),
            texture.width,
            texture.height,
          ),
          0,
          0,
        );
        const result = Texture.from(canvas);
        textures.push(result);
        // Include unused-but-required textures in the same-device prepare phase.
        renderer.texture.initSource(result.source);
        requireValid(
          !renderer.gl.isContextLost() && renderer.gl.getError() === renderer.gl.NO_ERROR,
        );
      }
    }
    pending = new PreparedEvaluationModel(owner, snapshot, textures, !reuseTextures);
    const meshFor = (slot: number, mask: boolean): MeshSimple => {
      const state = snapshot.meshes[slot]!;
      const mesh = new MeshSimple({
        texture: textures[state.textureSlot]!,
        vertices: state.vertices,
        uvs: state.uvs,
        indices: state.indices,
      });
      pending!.meshes.add(mesh);
      mesh.x = state.x;
      mesh.y = state.y;
      mesh.alpha = state.opacity;
      mesh.visible = mask || (state.visible && !state.culled);
      mesh.blendMode = "normal";
      const color = mask ? null : state.multiplyColor;
      mesh.tint = color
        ? (Math.round(Math.max(0, Math.min(1, color[0])) * 255) << 16) |
          (Math.round(Math.max(0, Math.min(1, color[1])) * 255) << 8) |
          Math.round(Math.max(0, Math.min(1, color[2])) * 255)
        : 0xffffff;
      if (!mask && state.screenColor) {
        const filter = createScreenColorFilter({
          r: state.screenColor[0],
          g: state.screenColor[1],
          b: state.screenColor[2],
        });
        pending!.filters.add(filter);
        mesh.filters = [filter];
      }
      return mesh;
    };
    for (const [slot, rectangle] of plans) {
      const source = new Container();
      source.addChild(meshFor(slot, true));
      const texture = RenderTexture.create({
        width: rectangle.width,
        height: rectangle.height,
        resolution: renderer.resolution,
        antialias: false,
      });
      pending.rasters.set(slot, { texture, x: rectangle.x, y: rectangle.y });
      try {
        renderSafely(source, texture, new Matrix(1, 0, 0, 1, -rectangle.x, -rectangle.y));
      } finally {
        source.removeChildren();
        source.destroy();
      }
    }
    const masks: EvaluationDrawCommand[] = [];
    for (const command of snapshot.commands) {
      if (command.kind === 2) masks.push(command);
      else if (command.kind === 3) masks.pop();
      else {
        const state = snapshot.meshes[command.meshSlot]!;
        const target = meshFor(command.meshSlot, false);
        if (!masks.length) {
          target.blendMode = toPixiBlendMode(state.blendMode);
          pending.world.addChild(target);
          continue;
        }
        const outer = new Container();
        const finalBlend = new AlphaFilter({
          alpha: 1,
          blendMode: toPixiBlendMode(state.blendMode),
          resolution: "inherit",
        });
        pending.filters.add(finalBlend);
        outer.visible = target.visible;
        outer.filters = [finalBlend];
        let child: Container = target;
        for (let index = masks.length - 1; index >= 0; index--) {
          const mask = masks[index]!,
            raster = pending.rasters.get(mask.meshSlot)!;
          const sprite = new Sprite(raster.texture);
          pending.sprites.add(sprite);
          sprite.position.set(raster.x, raster.y);
          sprite.alpha = 1;
          sprite.tint = 0xffffff;
          sprite.blendMode = "normal";
          sprite.renderable = false;
          sprite.includeInBuild = true;
          sprite.measurable = false;
          const wrapper = new Container();
          const filter = new MaskFilter({
            sprite,
            channel: "alpha",
            inverse: mask.flags === 1,
            resolution: "inherit",
            antialias: false,
          });
          pending.filters.add(filter);
          wrapper.addChild(sprite, child);
          wrapper.filters = [filter];
          child = wrapper;
        }
        outer.addChild(child);
        pending.world.addChild(outer);
      }
    }
    const check = RenderTexture.create({
      width: renderer.screen.width,
      height: renderer.screen.height,
      resolution: renderer.resolution,
      antialias: false,
    });
    try {
      renderSafely(pending.world, check);
    } finally {
      check.destroy(true);
    }
    return pending;
  } catch {
    if (pending) pending.dispose();
    else if (!reuseTextures)
      for (const texture of textures) quiet(() => texture.destroy(true));
    throw new Error(FAILURE);
  }
}
