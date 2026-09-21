const textures = new Map<string, HTMLCanvasElement>();
let textureStoreRevision = 0;

export interface TextureSnapshotEntry {
  textureId: string;
  width: number;
  height: number;
  hash: string;
  rgba: Uint8ClampedArray;
}

export type TexturePromotionEntry = {
  textureId: string;
  hash?: string;
} & (
  | { canvas: HTMLCanvasElement; snapshot?: TextureSnapshotEntry }
  | { canvas?: HTMLCanvasElement; snapshot: TextureSnapshotEntry }
);

export interface TextureDimensions {
  width: number;
  height: number;
}

export interface TextureRollbackPlan {
  createdTextureIds: string[];
  restoredTextures: TextureSnapshotEntry[];
  expectedCurrentHash: Record<string, string>;
  expectedCurrentDimensions?: Record<string, TextureDimensions>;
}

export interface TexturePromotionPlan {
  promotedTextures: TexturePromotionEntry[];
  expectedCurrentHash: Record<string, string | null>;
  expectedCurrentDimensions?: Record<string, TextureDimensions>;
}

export interface TextureHistoryEffect {
  kind: "texture";
  undo: TextureRollbackPlan;
  redo: TexturePromotionPlan;
  rendererInvalidation: "projectStructureVersion";
}

function getCanvasImageData(canvas: HTMLCanvasElement): ImageData {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D context is not available");
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

function createCanvasFromRgba(
  width: number,
  height: number,
  rgba: Uint8ClampedArray,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D context is not available");
  context.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
  return canvas;
}

function createCanvasFromSnapshot(snapshot: TextureSnapshotEntry): HTMLCanvasElement {
  const { width, height, rgba } = snapshot;
  if (
    !Number.isSafeInteger(width) ||
    width <= 0 ||
    !Number.isSafeInteger(height) ||
    height <= 0 ||
    !Number.isSafeInteger(width * height * 4) ||
    rgba.length !== width * height * 4
  ) {
    throw new Error("Invalid texture snapshot");
  }
  return createCanvasFromRgba(width, height, rgba);
}

function preparePromotionCanvas(entry: TexturePromotionEntry): HTMLCanvasElement {
  if (entry.snapshot) {
    if (entry.snapshot.textureId !== entry.textureId) {
      throw new Error("Invalid texture snapshot identity");
    }
    return createCanvasFromSnapshot(entry.snapshot);
  }
  if (!entry.canvas) throw new Error("Invalid texture promotion");
  return entry.canvas;
}

export function hashTextureBytes(bytes: Uint8ClampedArray | Uint8Array): string {
  return `sha256:${sha256Hex(bytes)}`;
}

export function hashTextureCanvas(canvas: HTMLCanvasElement): string {
  return hashTextureBytes(getCanvasImageData(canvas).data);
}

export function snapshotTextureCanvas(
  textureId: string,
  canvas: HTMLCanvasElement,
): TextureSnapshotEntry {
  const imageData = getCanvasImageData(canvas);
  const rgba = new Uint8ClampedArray(imageData.data);
  return {
    textureId,
    width: canvas.width,
    height: canvas.height,
    hash: hashTextureBytes(rgba),
    rgba,
  };
}

export function setTexture(layerId: string, canvas: HTMLCanvasElement): void {
  textures.set(layerId, canvas);
  textureStoreRevision += 1;
}

export function setTextureFromImageData(layerId: string, imageData: ImageData): void {
  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D context is not available");
  }
  ctx.putImageData(imageData, 0, 0);
  textures.set(layerId, canvas);
  textureStoreRevision += 1;
}

export function getTexture(layerId: string): HTMLCanvasElement | undefined {
  return textures.get(layerId);
}

export function clearTextures(): void {
  textures.clear();
  textureStoreRevision += 1;
}

export function deleteTexture(layerId: string): void {
  if (textures.delete(layerId)) textureStoreRevision += 1;
}

export function snapshotTextureEntries(
  textureIds: readonly string[],
): TextureSnapshotEntry[] {
  const snapshots: TextureSnapshotEntry[] = [];
  for (const textureId of textureIds) {
    const canvas = textures.get(textureId);
    if (!canvas) continue;
    snapshots.push(snapshotTextureCanvas(textureId, canvas));
  }
  return snapshots;
}

export function restoreTextureSnapshot(snapshots: readonly TextureSnapshotEntry[]): void {
  const restored = snapshots.map((snapshot) => ({
    textureId: snapshot.textureId,
    canvas: createCanvasFromSnapshot(snapshot),
  }));
  for (const entry of restored) {
    textures.set(entry.textureId, entry.canvas);
  }
  if (snapshots.length > 0) textureStoreRevision += 1;
}

export function promoteDraftTextures(entries: readonly TexturePromotionEntry[]): void {
  const prepared = entries.map((entry) => ({
    textureId: entry.textureId,
    canvas: preparePromotionCanvas(entry),
  }));
  for (const entry of prepared) {
    textures.set(entry.textureId, entry.canvas);
  }
  if (entries.length > 0) textureStoreRevision += 1;
}

export function deleteTextures(textureIds: readonly string[]): void {
  let changed = false;
  for (const textureId of textureIds) {
    changed = textures.delete(textureId) || changed;
  }
  if (changed) textureStoreRevision += 1;
}

function assertExpectedTextureHashes(
  currentTextures: ReadonlyMap<string, HTMLCanvasElement>,
  expected: Record<string, string | null>,
  dimensions: Record<string, TextureDimensions> | undefined,
  hashes: WeakMap<HTMLCanvasElement, string>,
): void {
  for (const [textureId, size] of Object.entries(dimensions ?? {})) {
    const canvas = currentTextures.get(textureId);
    if (!canvas || canvas.width !== size.width || canvas.height !== size.height) {
      throw new Error("Texture dimensions changed unexpectedly");
    }
  }
  for (const [textureId, expectedHash] of Object.entries(expected)) {
    const canvas = currentTextures.get(textureId);
    if (expectedHash === null) {
      if (canvas) throw new Error("Texture already exists");
      continue;
    }
    if (!canvas) throw new Error("Texture is missing");
    const currentHash = hashes.get(canvas) ?? hashTextureCanvas(canvas);
    hashes.set(canvas, currentHash);
    if (currentHash !== expectedHash) {
      throw new Error("Texture changed unexpectedly");
    }
  }
}

export interface PreparedTextureHistoryEffects {
  commit: () => void;
  rollback: () => void;
}

/** A symmetric map replacement for an already prepared v11 alias revision.
 * It owns no canvas and never destroys a shared surface. Commit must not yield.
 */
export function prepareTextureAliases(next: ReadonlyMap<string, HTMLCanvasElement>): PreparedTextureHistoryEffects {
  const before = new Map(textures);
  const after = new Map(next);
  const revision = textureStoreRevision;
  let started = false;
  return {
    commit() {
      if (textureStoreRevision !== revision) throw new Error("PROJECT_TEXTURE_CONFLICT");
      started = true;
      textures.clear();
      for (const [id, canvas] of after) textures.set(id, canvas);
      textureStoreRevision = revision + 1;
    },
    rollback() {
      if (!started) return;
      textures.clear();
      for (const [id, canvas] of before) textures.set(id, canvas);
      textureStoreRevision = revision;
      started = false;
    },
  };
}

/** Prepare and validate the entire batch; the caller must commit without yielding. */
export function prepareTextureHistoryEffects(
  effects: readonly TextureHistoryEffect[],
  direction: "undo" | "redo",
): PreparedTextureHistoryEffects {
  const simulated = new Map(textures);
  const before = new Map<string, HTMLCanvasElement | undefined>();
  const hashes = new WeakMap<HTMLCanvasElement, string>();
  const revisionBefore = textureStoreRevision;
  const remember = (textureId: string) => {
    if (!before.has(textureId)) before.set(textureId, textures.get(textureId));
  };
  const prepareSnapshot = (snapshot: TextureSnapshotEntry) => {
    const canvas = createCanvasFromSnapshot(snapshot);
    hashes.set(canvas, snapshot.hash);
    return canvas;
  };

  const ordered = direction === "undo" ? [...effects].reverse() : effects;
  for (const effect of ordered) {
    const plan = effect[direction];
    assertExpectedTextureHashes(
      simulated,
      plan.expectedCurrentHash,
      plan.expectedCurrentDimensions,
      hashes,
    );
    if (direction === "undo") {
      for (const textureId of effect.undo.createdTextureIds) {
        remember(textureId);
        simulated.delete(textureId);
      }
      for (const snapshot of effect.undo.restoredTextures) {
        remember(snapshot.textureId);
        simulated.set(snapshot.textureId, prepareSnapshot(snapshot));
      }
    } else {
      for (const entry of effect.redo.promotedTextures) {
        remember(entry.textureId);
        const canvas = preparePromotionCanvas(entry);
        if (entry.snapshot) hashes.set(canvas, entry.snapshot.hash);
        simulated.set(entry.textureId, canvas);
      }
    }
  }

  const changes = [...before].map(([textureId, canvas]) => ({
    textureId,
    before: canvas,
    after: simulated.get(textureId),
  }));
  let committed = false;
  const rollback = () => {
    if (!committed) return;
    for (const change of changes) {
      if (change.before) textures.set(change.textureId, change.before);
      else textures.delete(change.textureId);
    }
    textureStoreRevision = revisionBefore;
    committed = false;
  };
  return {
    commit: () => {
      if (committed) return;
      if (textureStoreRevision !== revisionBefore) {
        throw new Error("Texture store changed after preparation");
      }
      committed = true;
      try {
        for (const change of changes) {
          if (change.after) textures.set(change.textureId, change.after);
          else textures.delete(change.textureId);
        }
        if (changes.length > 0) textureStoreRevision += 1;
      } catch (error) {
        rollback();
        throw error;
      }
    },
    rollback,
  };
}

export function applyTextureHistoryEffect(
  effect: TextureHistoryEffect,
  direction: "undo" | "redo",
): void {
  prepareTextureHistoryEffects([effect], direction).commit();
}

export function getAllTextureIds(): string[] {
  return [...textures.keys()];
}

export function getAllTextures(): ReadonlyMap<string, HTMLCanvasElement> {
  return textures;
}

export function getTextureStoreRevision(): string {
  return String(textureStoreRevision);
}

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4,
  0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
  0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f,
  0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
  0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116,
  0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
  0xc67178f2,
]);

function rotr(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

function sha256Hex(input: Uint8Array | Uint8ClampedArray): string {
  const bitLength = input.length * 8;
  const paddedLength = Math.ceil((input.length + 9) / 64) * 64;
  const bytes = new Uint8Array(paddedLength);
  bytes.set(input);
  bytes[input.length] = 0x80;
  const view = new DataView(bytes.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000));
  view.setUint32(paddedLength - 4, bitLength >>> 0);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;
  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      w[index] = view.getUint32(offset + index * 4);
    }
    for (let index = 16; index < 64; index += 1) {
      const s0 =
        rotr(w[index - 15]!, 7) ^ rotr(w[index - 15]!, 18) ^ (w[index - 15]! >>> 3);
      const s1 =
        rotr(w[index - 2]!, 17) ^ rotr(w[index - 2]!, 19) ^ (w[index - 2]! >>> 10);
      w[index] = (w[index - 16]! + s0 + w[index - 7]! + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;
    for (let index = 0; index < 64; index += 1) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + SHA256_K[index]! + w[index]!) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((word) => word.toString(16).padStart(8, "0"))
    .join("");
}
