import { createHash, randomUUID } from "node:crypto";
import * as fs from "node:fs";
import path from "node:path";
import type {
  EmbeddedAtlasMaterializationRequestV1,
  ReferencedAtlasResolutionRequestV1,
  VerifiedAtlasAssetV1,
} from "@vivi2d/editor-host";
import { decodeRawBase64 } from "@vivi2d/model/internal/local-exchange";
import {
  type ParsedProjectFormatV11,
  parseProjectFormatV11Utf8,
  serializeProjectFormatV11LocalDuplicate,
  type ViviAssetRefV11,
} from "@vivi2d/model/internal/project-format-v11";
import { MAX_VIVI_TEXT_FILE_BYTES } from "@vivi2d/model/load-limits";
import { writeFileAtomically } from "./atomic-write.cjs";
import type { LocalExchangeHost, SyncCell } from "./local-exchange-host";

type NativeResult =
  | {
      status: "ready";
      verified: VerifiedAtlasAssetV1;
      objects?: Array<{ objectAddress: string; bytes: Buffer }>;
    }
  | { status: "missing" }
  | { status: "cancelled"; outcomeMayHaveCommitted: false }
  | { status: "error"; code: string; outcomeMayHaveCommitted: boolean };

/** Main-only native module shape. Neither endpoints nor this module enter IPC. */
export interface NativeLocalAsset {
  readonly abiVersion: 1;
  start(
    operation: 1 | 2 | 3 | 4,
    endpoint: Buffer,
    receiver: Buffer | null,
    reference: Buffer | null,
    png: Buffer | null,
    width: number,
    height: number,
  ): { token: object; result: Promise<NativeResult> };
  cancel(token: object): void;
  close(): Promise<void>;
}

export class LocalAssetCopyFault extends Error {
  constructor(
    readonly code: string,
    readonly outcomeMayHaveCommitted = false,
  ) {
    super(code);
    this.name = "LocalAssetCopyFault";
  }
}

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const HASH = /^[a-fA-F0-9]{64}$/;
const REFERENCE_KEYS = [
  "objectAddress",
  "contentSha256",
  "storageKind",
  "mediaType",
  "sizeBytes",
];
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
function insist(value: unknown, code = "LOCAL_ASSET_INVALID_ARGUMENT"): asserts value {
  if (!value) throw new LocalAssetCopyFault(code);
}

function record(value: unknown, keys: string[]): Record<string, unknown> {
  insist(value !== null && typeof value === "object" && !Array.isArray(value));
  const descriptors = Object.getOwnPropertyDescriptors(value);
  insist(Reflect.ownKeys(descriptors).length === keys.length);
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = descriptors[key];
    insist(descriptor && Object.hasOwn(descriptor, "value"));
    result[key] = descriptor.value;
  }
  return result;
}

function reference(value: unknown): ViviAssetRefV11 {
  const r = record(value, REFERENCE_KEYS);
  insist(typeof r.objectAddress === "string" && HASH.test(r.objectAddress));
  insist(typeof r.contentSha256 === "string" && HASH.test(r.contentSha256));
  insist(r.storageKind === "blob" || r.storageKind === "chunk_manifest");
  insist(r.mediaType === "image/png");
  insist(
    typeof r.sizeBytes === "number" &&
      Number.isSafeInteger(r.sizeBytes) &&
      r.sizeBytes >= 0,
  );
  // Hex spelling is normalized only in the transport, as in the existing EDH
  // port. The retained original Project wire is never rewritten this way.
  return {
    objectAddress: r.objectAddress.toLowerCase(),
    contentSha256: r.contentSha256.toLowerCase(),
    storageKind: r.storageKind,
    mediaType: r.mediaType,
    sizeBytes: r.sizeBytes,
  };
}

function referenceBuffer(r: ViviAssetRefV11): Buffer {
  const bytes = Buffer.alloc(216);
  bytes.writeUInt32LE(216, 0);
  bytes.writeUInt32LE(r.storageKind === "blob" ? 1 : 2, 4);
  Buffer.from(r.objectAddress, "hex").copy(bytes, 8);
  Buffer.from(r.contentSha256, "hex").copy(bytes, 40);
  bytes.writeBigUInt64LE(BigInt(r.sizeBytes), 72);
  bytes.writeUInt32LE(9, 80);
  bytes.write("image/png", 88, "utf8");
  return bytes;
}

function dimensions(width: unknown, height: unknown): asserts width is number {
  insist(Number.isInteger(width) && Number(width) > 0 && Number(width) <= 8192);
  insist(Number.isInteger(height) && Number(height) > 0 && Number(height) <= 8192);
}

function directory(dir: string, create = false): string {
  try {
    if (create && !fs.existsSync(dir)) fs.mkdirSync(dir, { mode: 0o700 });
    const stat = fs.lstatSync(dir);
    const real = fs.realpathSync(dir);
    const comparable = (p: string) =>
      process.platform === "win32" ? p.toLowerCase() : p;
    insist(
      stat.isDirectory() &&
        !stat.isSymbolicLink() &&
        comparable(real) === comparable(path.resolve(dir)),
      "LOCAL_ASSET_PATH_REJECTED",
    );
    return `${stat.dev}:${stat.ino}`;
  } catch {
    // Filesystem exceptions can contain the user's complete private path.
    throw new LocalAssetCopyFault("LOCAL_ASSET_PATH_REJECTED");
  }
}

type CellSnapshot = Pick<
  SyncCell,
  "cellId" | "scopeId" | "replicaId" | "documentId" | "commitVersion"
>;
interface Endpoint {
  cell: CellSnapshot;
  key: string;
  directoryIdentity: string;
  buffer: Buffer;
}

interface CopyCandidate {
  owner: object;
  id: string;
  source: Endpoint;
  receiver: Endpoint;
  sourceFile: string;
  canonical: Buffer;
  canonicalSha256: string;
  compatibility: "full" | "readOnly";
  requirements: ReadonlyArray<{
    id: string;
    minVersion: number;
    requiredFor: readonly string[];
  }>;
  atlases: Array<{ ref: ViviAssetRefV11; width: number; height: number }>;
  cancelled: boolean;
}

function selectedPath(file: string): string {
  try {
    insist(path.isAbsolute(file) && path.extname(file).toLowerCase() === ".vivi");
    const parent = fs.realpathSync(path.dirname(file));
    directory(path.dirname(file));
    const selected = path.join(parent, path.basename(file));
    if (fs.existsSync(selected)) {
      const stat = fs.lstatSync(selected);
      insist(stat.isFile() && !stat.isSymbolicLink());
    }
    return selected;
  } catch {
    throw new LocalAssetCopyFault("LOCAL_ASSET_FILE_REJECTED");
  }
}

function readSelected(file: string): Buffer {
  let fd: number | undefined;
  try {
    const before = fs.lstatSync(file, { bigint: true });
    insist(
      before.isFile() &&
        !before.isSymbolicLink() &&
        before.size <= BigInt(MAX_VIVI_TEXT_FILE_BYTES),
    );
    fd = fs.openSync(file, "r");
    const opened = fs.fstatSync(fd, { bigint: true });
    insist(
      before.dev === opened.dev &&
        before.ino === opened.ino &&
        before.size === opened.size,
    );
    const bytes = Buffer.alloc(Number(opened.size));
    let read = 0;
    while (read < bytes.length) {
      const count = fs.readSync(fd, bytes, read, bytes.length - read, read);
      insist(count > 0);
      read += count;
    }
    const after = fs.fstatSync(fd, { bigint: true });
    const named = fs.lstatSync(file, { bigint: true });
    insist(
      opened.dev === after.dev &&
        opened.ino === after.ino &&
        opened.size === after.size &&
        opened.mtimeNs === after.mtimeNs &&
        opened.ctimeNs === after.ctimeNs &&
        named.dev === after.dev &&
        named.ino === after.ino &&
        !named.isSymbolicLink(),
    );
    return bytes;
  } catch {
    throw new LocalAssetCopyFault("LOCAL_ASSET_FILE_REJECTED");
  } finally {
    if (fd !== undefined)
      try {
        fs.closeSync(fd);
      } catch {}
  }
}

/** One physical native slot shared by copy and existing read-only authoring ports. */
export class LocalAssetCopyCoordinator {
  private readonly root: string;
  private readonly rootIdentity: string;
  private readonly userDataIdentity: string;
  private active: { owner: object; token: object } | null = null;
  private closed = false;
  private copying = false;
  private candidate: CopyCandidate | null = null;
  private preparingOwner: object | null = null;
  private previewAttempt: { owner: object; cancelled: boolean } | null = null;

  constructor(
    private readonly options: {
      host: LocalExchangeHost;
      userData: string;
      native: NativeLocalAsset;
      // Main binds this only after the real C2 consumer is accepted for this
      // receiver principal/configuration. An installed resolver alone is not
      // capability authority; no renderer flag or optimistic default is used.
      copyCapabilities?: (
        cell: Readonly<CellSnapshot>,
      ) => ReadonlyMap<string, number> | null;
    },
  ) {
    insist(path.isAbsolute(options.userData), "LOCAL_ASSET_PATH_REJECTED");
    insist(options.native.abiVersion === 1, "LOCAL_ASSET_UNAVAILABLE");
    this.userDataIdentity = directory(options.userData);
    this.root = path.join(options.userData, "asset-stores-v1");
    this.rootIdentity = directory(this.root, true);
  }

  private snapshot(cellId: string): CellSnapshot {
    insist(typeof cellId === "string" && /^[a-f0-9]{64}$/.test(cellId));
    const cell = this.options.host.query(cellId);
    insist(cell.kind === "sync" && cell.cellId === cellId, "LOCAL_ASSET_BINDING");
    insist(
      UUID.test(cell.scopeId) && UUID.test(cell.replicaId) && UUID.test(cell.documentId),
      "LOCAL_ASSET_BINDING",
    );
    return {
      cellId,
      scopeId: cell.scopeId,
      replicaId: cell.replicaId,
      documentId: cell.documentId,
      commitVersion: cell.commitVersion,
    };
  }

  private assertRoot() {
    insist(!this.closed, "LOCAL_ASSET_UNAVAILABLE");
    insist(
      directory(this.options.userData) === this.userDataIdentity &&
        directory(this.root) === this.rootIdentity,
      "LOCAL_ASSET_PATH_REJECTED",
    );
  }

  private endpoint(cell: CellSnapshot): Endpoint {
    this.assertRoot();
    const namespace = `${cell.scopeId}\0${cell.replicaId}`;
    const key = hash(
      Buffer.from(`vivi2d.electron.local-asset-store.path.v1\0${namespace}`),
    );
    const dir = path.join(this.root, key);
    const directoryIdentity = directory(dir, true);
    const file = Buffer.from(path.join(dir, "store.sqlite3"), "utf8");
    const principal = Buffer.from(
      `vivi2d.electron.local-asset-store.principal.v1\0${namespace}`,
      "utf8",
    );
    insist(file.length > 0 && file.length <= 131068 && principal.length <= 4096);
    const buffer = Buffer.alloc(8 + file.length + principal.length);
    buffer.writeUInt32LE(file.length, 0);
    buffer.writeUInt32LE(principal.length, 4);
    file.copy(buffer, 8);
    principal.copy(buffer, 8 + file.length);
    return { cell, key, directoryIdentity, buffer };
  }

  private fresh(endpoint: Endpoint) {
    this.assertRoot();
    const current = this.snapshot(endpoint.cell.cellId);
    insist(
      Object.keys(current).every(
        (key) =>
          current[key as keyof CellSnapshot] === endpoint.cell[key as keyof CellSnapshot],
      ),
      "LOCAL_ASSET_STALE",
    );
    insist(
      directory(path.join(this.root, endpoint.key)) === endpoint.directoryIdentity,
      "LOCAL_ASSET_PATH_REJECTED",
    );
  }

  private async operation(
    owner: object,
    kind: 1 | 2 | 3 | 4,
    endpoint: Endpoint,
    receiver: Endpoint | null,
    ref: ViviAssetRefV11 | null,
    png: Buffer | null,
    width: number,
    height: number,
  ): Promise<NativeResult> {
    insist(!this.active, "LOCAL_ASSET_BUSY");
    this.fresh(endpoint);
    if (receiver) this.fresh(receiver);
    const work = this.options.native.start(
      kind,
      endpoint.buffer,
      receiver?.buffer ?? null,
      ref ? referenceBuffer(ref) : null,
      png,
      width,
      height,
    );
    const active = { owner, token: work.token };
    this.active = active;
    try {
      return await work.result;
    } catch {
      // The native operation may have entered a mutating method. Never infer
      // absence of publication from lost delivery of a result.
      throw new LocalAssetCopyFault("LOCAL_ASSET_INTERNAL", kind === 2 || kind === 3);
    } finally {
      if (this.active === active) this.active = null;
    }
  }

  private ready(result: NativeResult): VerifiedAtlasAssetV1 {
    if (result.status === "ready") return result.verified;
    if (result.status === "error")
      throw new LocalAssetCopyFault(result.code, result.outcomeMayHaveCommitted);
    throw new LocalAssetCopyFault(
      result.status === "missing" ? "LOCAL_ASSET_MISSING" : "LOCAL_ASSET_CANCELLED",
    );
  }

  private capabilities(receiver: CellSnapshot) {
    const value = this.options.copyCapabilities?.(Object.freeze({ ...receiver }));
    insist(
      value && (value.get("vivi.cap.referencedAssets") ?? 0) >= 1,
      "LOCAL_ASSET_UNAVAILABLE",
    );
    return new Map(value);
  }

  /** A selected-file snapshot only: no import, descriptor publication or live lease. */
  async preview(owner: object, cellId: string, selectFile: () => Promise<string | null>) {
    this.assertRoot();
    insist(!this.copying && !this.active, "LOCAL_ASSET_BUSY");
    const cell = this.snapshot(cellId);
    const supportedCapabilities = this.capabilities(cell);
    const attempt = { owner, cancelled: false };
    this.previewAttempt = attempt;
    this.copying = true;
    const current = () => {
      insist(
        !this.closed && this.previewAttempt === attempt && !attempt.cancelled,
        "LOCAL_ASSET_CANCELLED",
      );
      const latest = this.snapshot(cellId);
      insist(
        Object.keys(cell).every(
          (key) => latest[key as keyof CellSnapshot] === cell[key as keyof CellSnapshot],
        ),
        "LOCAL_ASSET_STALE",
      );
    };
    try {
      const chosen = await selectFile();
      current();
      if (!chosen) return null;
      const sourceBytes = readSelected(selectedPath(chosen));
      let parsed: ParsedProjectFormatV11;
      try {
        parsed = await parseProjectFormatV11Utf8(sourceBytes, {
          registry: new Map(),
          supportedCapabilities,
          sha256: hash,
        });
      } catch {
        throw new LocalAssetCopyFault("LOCAL_ASSET_PROJECT_REJECTED");
      }
      current();
      const wire = parsed.wire;
      insist(
        wire.version === 11 &&
          (parsed.compatibility === "full" || parsed.compatibility === "readOnly") &&
          wire.atlases.length <= 32,
        "LOCAL_ASSET_PROJECT_REJECTED",
      );
      insist(wire.documentId === cell.documentId, "LOCAL_ASSET_BINDING");
      // No source store opens for a rejected Project. Embedded PNGs are verified
      // by the browser's real PNG-WASM materializer without native publication.
      const endpoint = wire.assetMode === "referenced" ? this.endpoint(cell) : null;
      const objects = new Map<string, Uint8Array>();
      let physicalBytes = 0;
      const atlasResolutions: Array<
        | { atlasId: string; status: "missing" }
        | { atlasId: string; status: "ready"; verified: VerifiedAtlasAssetV1 }
      > = [];
      if (endpoint) {
        for (const atlas of wire.atlases) {
          current();
          dimensions(atlas.width, atlas.height);
          insist(/^[A-Za-z0-9_-]{1,120}$/.test(atlas.id));
          const ref = reference(atlas.image);
          const result = await this.operation(
            attempt,
            4,
            endpoint,
            null,
            ref,
            null,
            atlas.width,
            atlas.height,
          );
          current();
          this.fresh(endpoint);
          if (result.status === "missing") {
            atlasResolutions.push({ atlasId: atlas.id, status: "missing" });
            continue; // A later hard error still aborts this entire capture.
          }
          const verified = this.ready(result);
          insist(
            JSON.stringify(reference(verified.asset)) === JSON.stringify(ref) &&
              verified.png.width === atlas.width &&
              verified.png.height === atlas.height &&
              verified.png.profile === "vivi2d.png.rgba8.v1",
            "LOCAL_ASSET_INTERNAL",
          );
          insist(result.status === "ready" && Array.isArray(result.objects));
          insist(result.objects.length > 0 && result.objects.length <= 9);
          for (const object of result.objects) {
            insist(
              typeof object.objectAddress === "string" &&
                /^[a-f0-9]{64}$/.test(object.objectAddress) &&
                Buffer.isBuffer(object.bytes) &&
                object.bytes.buffer instanceof ArrayBuffer,
              "LOCAL_ASSET_INTERNAL",
            );
            const previous = objects.get(object.objectAddress);
            if (previous) {
              insist(object.bytes.equals(previous), "LOCAL_ASSET_INTERNAL");
            } else {
              insist(
                objects.size < 288 && object.bytes.length <= 67108864 - physicalBytes,
                "LOCAL_ASSET_RESOURCE_LIMIT",
              );
              // Admit before copying; native capture memory is never borrowed by IPC.
              const owned = Uint8Array.from(object.bytes);
              objects.set(object.objectAddress, owned);
              physicalBytes += owned.byteLength;
            }
          }
          atlasResolutions.push({
            atlasId: atlas.id,
            status: "ready",
            verified: {
              asset: reference(verified.asset),
              png: {
                profile: "vivi2d.png.rgba8.v1",
                width: atlas.width,
                height: atlas.height,
              },
            },
          });
        }
      }
      current();
      if (endpoint) this.fresh(endpoint);
      insist(Buffer.byteLength(JSON.stringify(atlasResolutions), "utf8") <= 65536);
      return {
        kind: "runtimePreviewV1" as const,
        cellId,
        documentId: cell.documentId,
        commitVersion: cell.commitVersion,
        sourceBytes: Uint8Array.from(sourceBytes),
        objects: Array.from(objects, ([objectAddress, bytes]) => ({
          objectAddress,
          bytes,
        })),
        atlasResolutions,
      };
    } finally {
      if (this.previewAttempt === attempt) this.previewAttempt = null;
      this.copying = false;
    }
  }

  cancelPreview(owner: object) {
    const attempt = this.previewAttempt;
    if (attempt?.owner !== owner) return;
    attempt.cancelled = true;
    if (this.active?.owner === attempt) this.options.native.cancel(this.active.token);
    // Keep the slot occupied until the actual dialog/worker promise settles.
  }

  async prepare(
    owner: object,
    sourceCellId: string,
    receiverCellId: string,
    selectFile: () => Promise<string | null>,
  ) {
    this.assertRoot();
    insist(!this.copying && !this.active, "LOCAL_ASSET_BUSY");
    const sourceCell = this.snapshot(sourceCellId),
      receiverCell = this.snapshot(receiverCellId);
    const supportedCapabilities = this.capabilities(receiverCell);
    insist(
      sourceCell.scopeId !== receiverCell.scopeId ||
        sourceCell.replicaId !== receiverCell.replicaId,
      "LOCAL_ASSET_BINDING",
    );
    this.copying = true;
    this.preparingOwner = owner;
    if (this.candidate) this.candidate.cancelled = true;
    this.candidate = null;
    try {
      const chosen = await selectFile();
      insist(this.preparingOwner === owner && !this.closed, "LOCAL_ASSET_CANCELLED");
      if (!chosen) return null;
      const sourceFile = selectedPath(chosen);
      const bytes = readSelected(sourceFile);
      let parsed: ParsedProjectFormatV11;
      try {
        parsed = await parseProjectFormatV11Utf8(bytes, {
          registry: new Map(),
          supportedCapabilities,
          sha256: hash,
        });
      } catch {
        throw new LocalAssetCopyFault("LOCAL_ASSET_PROJECT_REJECTED");
      }
      insist(this.preparingOwner === owner && !this.closed, "LOCAL_ASSET_CANCELLED");
      const wire = parsed.wire;
      insist(
        wire.version === 11 &&
          wire.assetMode === "referenced" &&
          wire.documentId &&
          (parsed.compatibility === "full" || parsed.compatibility === "readOnly"),
        "LOCAL_ASSET_PROJECT_REJECTED",
      );
      insist(
        wire.documentId === sourceCell.documentId &&
          wire.documentId === receiverCell.documentId,
        "LOCAL_ASSET_BINDING",
      );
      insist(
        wire.atlases.length <= 32 &&
          Object.values(wire.extensions ?? {}).every(
            (extension) => (extension.blobRefs?.length ?? 0) === 0,
          ),
        "LOCAL_ASSET_UNSUPPORTED_CLOSURE",
      );
      const atlases = wire.atlases.map((atlas) => ({
        ref: reference(atlas.image),
        width: atlas.width,
        height: atlas.height,
      }));
      const dimensionsByReference = new Map<string, string>();
      for (const atlas of atlases) {
        dimensions(atlas.width, atlas.height);
        const key = JSON.stringify(atlas.ref),
          shape = `${atlas.width}:${atlas.height}`;
        insist(
          !dimensionsByReference.has(key) || dimensionsByReference.get(key) === shape,
          "LOCAL_ASSET_DIMENSION_MISMATCH",
        );
        dimensionsByReference.set(key, shape);
      }
      const canonical = Buffer.from(
        serializeProjectFormatV11LocalDuplicate(parsed),
        "utf8",
      );
      // No endpoint/store directory is opened until the whole closure is eligible.
      const source = this.endpoint(sourceCell),
        receiver = this.endpoint(receiverCell);
      this.fresh(source);
      this.fresh(receiver);
      insist(source.key !== receiver.key, "LOCAL_ASSET_BINDING");
      const candidate: CopyCandidate = {
        owner,
        id: randomUUID(),
        source,
        receiver,
        sourceFile,
        canonical,
        canonicalSha256: hash(canonical),
        compatibility: parsed.compatibility,
        requirements: parsed.derivedRequirements,
        atlases,
        cancelled: false,
      };
      this.candidate = candidate;
      return {
        copyId: candidate.id,
        documentId: wire.documentId,
        compatibility: candidate.compatibility,
        canonicalSha256: candidate.canonicalSha256,
        atlasCount: atlases.length,
      };
    } finally {
      this.preparingOwner = null;
      this.copying = false;
    }
  }

  private currentCopy(owner: object, copyId: string) {
    const candidate = this.candidate;
    insist(
      candidate &&
        candidate.owner === owner &&
        candidate.id === copyId &&
        !candidate.cancelled,
      "LOCAL_ASSET_STALE",
    );
    return candidate;
  }

  private freshCopy(candidate: CopyCandidate) {
    insist(this.candidate === candidate && !candidate.cancelled, "LOCAL_ASSET_CANCELLED");
    this.fresh(candidate.source);
    this.fresh(candidate.receiver);
    const supported = this.capabilities(candidate.receiver.cell);
    insist(
      candidate.requirements.every(
        (requirement) =>
          !requirement.requiredFor.includes("render") ||
          (supported.get(requirement.id) ?? 0) >= requirement.minVersion,
      ),
      "LOCAL_ASSET_UNAVAILABLE",
    );
  }

  async commit(
    owner: object,
    copyId: string,
    selectTarget: () => Promise<string | null>,
  ) {
    const candidate = this.currentCopy(owner, copyId);
    insist(!this.copying && !this.active, "LOCAL_ASSET_BUSY");
    this.copying = true;
    let completed = 0;
    try {
      this.freshCopy(candidate);
      const choice = await selectTarget();
      this.freshCopy(candidate);
      if (!choice) return null;
      const target = selectedPath(choice);
      const comparable = (value: string) =>
        process.platform === "win32" ? value.toLowerCase() : value;
      insist(
        comparable(target) !== comparable(candidate.sourceFile),
        "LOCAL_ASSET_FILE_REJECTED",
      );
      const transferred = new Map<string, (typeof candidate.atlases)[number]>();
      for (const atlas of candidate.atlases) {
        this.freshCopy(candidate);
        const key = JSON.stringify(atlas.ref);
        if (!transferred.has(key)) {
          const verified = this.ready(
            await this.operation(
              candidate,
              3,
              candidate.source,
              candidate.receiver,
              atlas.ref,
              null,
              atlas.width,
              atlas.height,
            ),
          );
          insist(
            JSON.stringify(reference(verified.asset)) === key &&
              verified.png.width === atlas.width &&
              verified.png.height === atlas.height &&
              verified.png.profile === "vivi2d.png.rgba8.v1",
            "LOCAL_ASSET_INTERNAL",
          );
          transferred.set(key, atlas);
        }
        completed += 1;
      }
      for (const [key, atlas] of transferred) {
        this.freshCopy(candidate);
        const verified = this.ready(
          await this.operation(
            candidate,
            1,
            candidate.receiver,
            null,
            atlas.ref,
            null,
            atlas.width,
            atlas.height,
          ),
        );
        insist(
          JSON.stringify(reference(verified.asset)) === key &&
            verified.png.width === atlas.width &&
            verified.png.height === atlas.height &&
            verified.png.profile === "vivi2d.png.rgba8.v1",
          "LOCAL_ASSET_INTERNAL",
        );
      }
      const finalTarget = selectedPath(target);
      insist(finalTarget === target, "LOCAL_ASSET_FILE_REJECTED");
      this.freshCopy(candidate);
      // No await, user callback, or cancellation relabel after this point.
      try {
        writeFileAtomically(target, candidate.canonical);
      } catch {
        throw new LocalAssetCopyFault("LOCAL_ASSET_FILE_WRITE_FAILED");
      }
      this.candidate = null;
      return {
        status: "committed" as const,
        copyId,
        documentId: candidate.receiver.cell.documentId,
        compatibility: candidate.compatibility,
        canonicalSha256: candidate.canonicalSha256,
        atlasCount: candidate.atlases.length,
        completedCount: completed,
        outcomeMayHaveCommitted: false,
      };
    } finally {
      this.copying = false;
    }
  }

  cancel(owner: object, copyId: string) {
    const candidate = this.currentCopy(owner, copyId);
    candidate.cancelled = true;
    if (this.active?.owner === candidate) this.options.native.cancel(this.active.token);
    if (!this.copying) this.candidate = null;
  }

  rendererLost(owner: object) {
    this.cancelPreview(owner);
    if (this.preparingOwner === owner) this.preparingOwner = null;
    const candidate = this.candidate;
    if (candidate?.owner === owner) {
      candidate.cancelled = true;
      if (this.active?.owner === candidate) this.options.native.cancel(this.active.token);
      if (!this.copying) this.candidate = null;
    }
  }

  createAuthoringPorts(cellId: string) {
    const endpoint = this.endpoint(this.snapshot(cellId));
    const owner = {};
    let disposed = false;
    const check = () => {
      insist(!disposed && !this.closed, "LOCAL_ASSET_UNAVAILABLE");
      insist(!this.copying, "LOCAL_ASSET_BUSY");
      this.fresh(endpoint);
    };
    const request = (value: unknown, kind: "embedded" | "referenced") => {
      check();
      const owned = record(value, [
        "kind",
        "atlasId",
        kind === "embedded" ? "imageBase64" : "reference",
        "declaredWidth",
        "declaredHeight",
      ]);
      insist(
        owned.kind === kind &&
          typeof owned.atlasId === "string" &&
          /^[A-Za-z0-9_-]{1,120}$/.test(owned.atlasId),
      );
      dimensions(owned.declaredWidth, owned.declaredHeight);
      return owned;
    };
    return Object.freeze({
      materializeEmbeddedAtlas: async (
        input: EmbeddedAtlasMaterializationRequestV1,
      ): Promise<VerifiedAtlasAssetV1> => {
        const owned = request(input, "embedded");
        insist(
          typeof owned.imageBase64 === "string" && owned.imageBase64.length <= 22369624,
        );
        let png: Buffer;
        try {
          png = Buffer.from(decodeRawBase64(owned.imageBase64));
        } catch {
          throw new LocalAssetCopyFault("LOCAL_ASSET_INVALID_ARGUMENT");
        }
        insist(png.length <= 16777216);
        return this.ready(
          await this.operation(
            owner,
            2,
            endpoint,
            null,
            null,
            png,
            owned.declaredWidth as number,
            owned.declaredHeight as number,
          ),
        );
      },
      resolveReferencedAtlas: async (input: ReferencedAtlasResolutionRequestV1) => {
        const owned = request(input, "referenced");
        const result = await this.operation(
          owner,
          1,
          endpoint,
          null,
          reference(owned.reference),
          null,
          owned.declaredWidth as number,
          owned.declaredHeight as number,
        );
        if (result.status === "missing") return { status: "missing" as const };
        return { status: "ready" as const, verified: this.ready(result) };
      },
      dispose: () => {
        disposed = true;
        if (this.active?.owner === owner) this.options.native.cancel(this.active.token);
      },
    });
  }

  close() {
    this.closed = true;
    if (this.previewAttempt) this.previewAttempt.cancelled = true;
    this.preparingOwner = null;
    if (this.candidate) this.candidate.cancelled = true;
    if (this.active) this.options.native.cancel(this.active.token);
    return this.options.native.close();
  }
}
