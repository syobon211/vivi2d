import type { AtlasEntry, LayerNode, MeshData, ProjectData } from "@vivi2d/core/types";
import {
  assertEmbeddedRoundTripEditorState,
  type NormalizedProjectLayerV11,
  type ParsedProjectFormatV11,
  parseProjectFormatV11Utf8,
  serializeProjectFormatV11LocalDuplicate,
  serializeProjectFormatV11Ordinary,
  type ViviFileDataWireV11Embedded,
} from "@vivi2d/model/internal/project-format-v11";
import {
  type NativeProjectPng,
  validateProjectV11WithNativePng,
} from "./project-v11-native-png";
import { hashTextureBytes, hashTextureCanvas } from "./texture-store";

export const projectV11Sha256 = (bytes: Uint8Array): string =>
  hashTextureBytes(bytes).slice(7);
const codecOptions = {
  registry: new Map(),
  supportedCapabilities: new Map(),
  sha256: projectV11Sha256,
};

/** Non-draftable, immutable owned image backing. Never derived from display readback. */
export class V11ImageBacking {
  readonly #rgba: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly pngByteLength: number;
  readonly sha256: string;
  constructor(
    readonly image: string,
    verified: NativeProjectPng,
  ) {
    this.width = verified.width;
    this.height = verified.height;
    this.pngByteLength = verified.byteLength;
    this.sha256 = verified.sha256;
    this.#rgba = verified.rgba;
    Object.freeze(this);
  }
  get rgbaByteLength(): number {
    return this.#rgba.byteLength;
  }
  createCanvas(): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = this.width;
    canvas.height = this.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("PROJECT_DISPLAY_UNAVAILABLE");
    context.putImageData(
      new ImageData(new Uint8ClampedArray(this.#rgba), this.width, this.height),
      0,
      0,
    );
    return canvas;
  }
}

export interface V11Atlas {
  readonly id: string;
  readonly backing: V11ImageBacking;
  readonly entries: readonly Readonly<AtlasEntry>[];
}
export class V11AtlasRevision {
  readonly atlases: readonly V11Atlas[];
  constructor(atlases: readonly V11Atlas[]) {
    this.atlases = Object.freeze(
      atlases.map((atlas) =>
        Object.freeze({
          id: atlas.id,
          backing: atlas.backing,
          entries: Object.freeze(
            atlas.entries.map((entry) => Object.freeze({ ...entry })),
          ),
        }),
      ),
    );
    Object.freeze(this);
  }
  entry(layerId: string): { atlas: V11Atlas; entry: Readonly<AtlasEntry> } | undefined {
    for (const atlas of this.atlases) {
      const entry = atlas.entries.find((entry) => entry.layerId === layerId);
      if (entry) return { atlas, entry };
    }
  }
  wireAtlases(): ViviFileDataWireV11Embedded["atlases"] {
    return this.atlases.map(({ id, backing, entries }) => ({
      id,
      image: backing.image,
      width: backing.width,
      height: backing.height,
      entries: entries.map((entry) => ({ ...entry })),
    }));
  }
}

/** Each reconstruction gets its own Canvas-readback fingerprint. Straight-alpha
 * source bytes deliberately are NOT compared to premultiplied Canvas readback. */
export class V11AtlasDisplay {
  readonly #aliases = new Map<string, HTMLCanvasElement>();
  readonly #surfaces: readonly {
    canvas: HTMLCanvasElement;
    width: number;
    height: number;
    hash: string;
  }[];
  constructor(readonly revision: V11AtlasRevision) {
    this.#surfaces = revision.atlases.map(({ backing, entries }) => {
      const canvas = backing.createCanvas();
      for (const entry of entries) {
        if (this.#aliases.has(entry.layerId)) throw new Error("PROJECT_EDIT_INVALID");
        this.#aliases.set(entry.layerId, canvas);
      }
      return {
        canvas,
        width: canvas.width,
        height: canvas.height,
        hash: hashTextureCanvas(canvas),
      };
    });
  }
  aliases(): ReadonlyMap<string, HTMLCanvasElement> {
    return new Map(this.#aliases);
  }
  assertUnchanged(current: ReadonlyMap<string, HTMLCanvasElement>): void {
    if (current.size !== this.#aliases.size) throw new Error("PROJECT_TEXTURE_CONFLICT");
    for (const [id, canvas] of this.#aliases)
      if (current.get(id) !== canvas) throw new Error("PROJECT_TEXTURE_CONFLICT");
    for (const { canvas, width, height, hash } of this.#surfaces)
      if (
        canvas.width !== width ||
        canvas.height !== height ||
        hashTextureCanvas(canvas) !== hash
      )
        throw new Error("PROJECT_TEXTURE_CONFLICT");
  }
}

/** Real codec owner is retained here, never cloned into Immer ProjectData. */
export class V11EditorCarrier {
  readonly #source: ParsedProjectFormatV11;
  private constructor(
    readonly documentId: string,
    source: ParsedProjectFormatV11,
  ) {
    this.#source = source;
  }
  static async open(input: Uint8Array): Promise<{
    carrier: V11EditorCarrier;
    project: ProjectData;
    revision: V11AtlasRevision;
    display: V11AtlasDisplay;
    canonical: string;
  }> {
    const verified = await validateProjectV11WithNativePng(input, projectV11Sha256);
    if (!verified.ok) throw new Error(verified.code);
    const parsed = await parseProjectFormatV11Utf8(verified.canonicalUtf8, codecOptions);
    if (parsed.compatibility !== "full" || parsed.normalized.assetMode !== "embedded")
      throw new Error("PROJECT_PROFILE_UNSUPPORTED");
    const project = structuredClone(parsed.normalized.project) as ProjectData;
    const bridge = (layers: NormalizedProjectLayerV11[]): void => {
      for (const layer of layers) {
        const ids = layer.clipMasks?.map((edge) => {
          if (edge.invert) throw new Error("PROJECT_PROFILE_UNSUPPORTED");
          return edge.layerId;
        });
        delete layer.clipMasks;
        const editable = layer as LayerNode;
        if (ids === undefined) delete editable.clipMaskIds;
        else editable.clipMaskIds = ids;
        bridge(layer.children);
      }
    };
    bridge(project.layers as NormalizedProjectLayerV11[]);
    const revision = new V11AtlasRevision(
      parsed.normalized.atlases.map((atlas, index) => {
        const image = verified.images[index];
        if (typeof atlas.image !== "string" || !image)
          throw new Error("PROJECT_INTERNAL");
        return {
          id: atlas.id,
          entries: atlas.entries,
          backing: new V11ImageBacking(atlas.image, image),
        };
      }),
    );
    const carrier = new V11EditorCarrier(verified.documentId, parsed);
    carrier.assertProject(project, revision);
    return {
      carrier,
      project,
      revision,
      display: new V11AtlasDisplay(revision),
      canonical: new TextDecoder("utf-8", { fatal: true }).decode(verified.canonicalUtf8),
    };
  }
  wire(project: ProjectData, revision: V11AtlasRevision): ViviFileDataWireV11Embedded {
    const wire: ViviFileDataWireV11Embedded = {
      version: 11,
      assetMode: "embedded",
      documentId: this.documentId,
      project: structuredClone(project),
      atlases: revision.wireAtlases(),
    };
    // Editor ids are the SOLE current mask authority. No loaded-edge fallback.
    const bridge = (layers: LayerNode[]): void => {
      for (const layer of layers) {
        const normalized = layer as unknown as NormalizedProjectLayerV11;
        delete normalized.clipMasks;
        const ids = layer.clipMaskIds;
        delete layer.clipMaskIds;
        if (ids !== undefined)
          normalized.clipMasks = ids.map((layerId) => ({ layerId, invert: false }));
        bridge(layer.children);
      }
    };
    bridge(wire.project.layers);
    return wire;
  }
  assertProject(project: ProjectData, revision: V11AtlasRevision): void {
    assertEmbeddedRoundTripEditorState(this.wire(project, revision));
  }
  async serialize(project: ProjectData, revision: V11AtlasRevision): Promise<string> {
    const wire = this.wire(project, revision);
    const canonical = assertEmbeddedRoundTripEditorState(wire);
    // Fresh real codec owner captures this invocation, never mutates the source
    // owner or a newer Editor revision across awaits. Immutable PNG was admitted.
    const parsed = await parseProjectFormatV11Utf8(
      new TextEncoder().encode(canonical),
      codecOptions,
    );
    return serializeProjectFormatV11Ordinary(parsed);
  }
  duplicateOriginal(): string {
    return serializeProjectFormatV11LocalDuplicate(this.#source);
  }
}

export interface V11AtlasHistoryEffect {
  kind: "v11-atlas";
  carrier: V11EditorCarrier;
  before: V11AtlasRevision;
  after: V11AtlasRevision;
}

export interface V11EditorSession {
  /** Set on actual adoption; ordinary Save As never rewrites original ownership. */
  readonly originalFilePath?: string | null;
  carrier: V11EditorCarrier;
  revision: V11AtlasRevision;
  display: V11AtlasDisplay;
  saved: { project: ProjectData; revision: V11AtlasRevision; canonical: string };
}

/** Renderer topology changes exactly once; vertex-only movement stays lightweight. */
export function v11StructureChanged(before: ProjectData, after: ProjectData): boolean {
  const numbersEqual = (a: readonly number[], b: readonly number[]) =>
    a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const layersEqual = (a: readonly LayerNode[], b: readonly LayerNode[]): boolean =>
    a.length === b.length &&
    a.every((node, index) => {
      const next = b[index];
      if (!next || node.id !== next.id || node.kind !== next.kind) return false;
      if (
        node.kind === "bone" &&
        next.kind === "bone" &&
        node.parentBoneId !== next.parentBoneId
      )
        return false;
      if (
        Object.hasOwn(node, "clipMaskIds") !== Object.hasOwn(next, "clipMaskIds") ||
        node.clipMaskIds?.length !== next.clipMaskIds?.length ||
        node.clipMaskIds?.some((id, i) => id !== next.clipMaskIds?.[i])
      )
        return false;
      if (
        node.kind === "viviMesh" &&
        next.kind === "viviMesh" &&
        (node.mesh.vertices.length !== next.mesh.vertices.length ||
          !numbersEqual(node.mesh.uvs, next.mesh.uvs) ||
          !numbersEqual(node.mesh.indices, next.mesh.indices))
      )
        return false;
      return layersEqual(node.children, next.children);
    });
  return !layersEqual(before.layers, after.layers);
}

export function mapAtlasEntryUvs(
  revision: V11AtlasRevision | undefined,
  layerId: string,
  mesh: MeshData,
): MeshData {
  const mapping = revision?.entry(layerId);
  if (!mapping) return mesh;
  const { atlas, entry } = mapping;
  if (
    entry.x === 0 &&
    entry.y === 0 &&
    entry.width === atlas.backing.width &&
    entry.height === atlas.backing.height
  )
    return mesh;
  return {
    ...mesh,
    uvs: mesh.uvs.map((value, index) =>
      index % 2 === 0
        ? (entry.x + value * entry.width) / atlas.backing.width
        : (entry.y + value * entry.height) / atlas.backing.height,
    ),
  };
}

export function createAtlasEntryCanvas(
  revision: V11AtlasRevision | undefined,
  layerId: string,
): HTMLCanvasElement | undefined {
  const mapping = revision?.entry(layerId);
  if (!mapping) return;
  const { atlas, entry } = mapping;
  const full = atlas.backing.createCanvas();
  if (
    entry.x === 0 &&
    entry.y === 0 &&
    entry.width === full.width &&
    entry.height === full.height
  )
    return full;
  const canvas = document.createElement("canvas");
  canvas.width = entry.width;
  canvas.height = entry.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("PROJECT_DISPLAY_UNAVAILABLE");
  context.drawImage(
    full,
    entry.x,
    entry.y,
    entry.width,
    entry.height,
    0,
    0,
    entry.width,
    entry.height,
  );
  return canvas;
}
