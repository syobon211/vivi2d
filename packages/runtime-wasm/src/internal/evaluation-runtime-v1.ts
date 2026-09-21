import { VIVI_RUNTIME_NATIVE_EVALUATION_WASM_BASE64 } from "../native-evaluation-wasm-bytes";
import { createEmbeddedWasmLoader } from "../native-wasm-bootstrap";

export interface EvaluationTextureBinding {
  id: string;
  width: number;
  height: number;
  asset: {
    objectAddress: string;
    contentSha256: string;
    storageKind: "blob" | "chunk_manifest";
    sizeBytes: number;
    mediaType: string;
  };
}
export interface EvaluationPhysicalObject {
  objectAddress: string;
  bytes: Uint8Array;
}
export interface EvaluationGenerations {
  model: bigint;
  topology: bigint;
  dynamic: bigint;
}
export interface EvaluationParameter {
  id: string;
  min: number;
  max: number;
  default: number;
  current: number;
  evaluated: number;
}
export interface EvaluationMesh {
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
export interface EvaluationTexture {
  slot: number;
  id: string;
  width: number;
  height: number;
  rowStride: number;
  rgba: Uint8Array<ArrayBuffer>;
}
export interface EvaluationCommand {
  kind: 1 | 2 | 3;
  meshSlot: number;
  depth: number;
  flags: number;
}
export interface EvaluationSnapshot {
  generations: EvaluationGenerations | null;
  meshes: readonly EvaluationMesh[];
  textures: readonly EvaluationTexture[];
  commands: readonly EvaluationCommand[];
  requiredFeatures: number;
  parameters: readonly EvaluationParameter[];
  presets: readonly string[];
}
export type EvaluationFailure =
  | { ok: false; kind: "native"; status: number }
  | { ok: false; kind: "bridge"; code: "unavailable" | "internal" | "disposed" | "busy" };
export type EvaluationResult<T> = { ok: true; value: T } | EvaluationFailure;
export interface PreparedEvaluation {
  readonly kind: "ready" | "missing";
  readonly requestGeneration: number;
  dispose(): void;
}
/** A private preallocated publication permit. No raw handle or borrowed view escapes. */
export interface EvaluationCommit {
  readonly prepared: PreparedEvaluation;
}
export interface NativeEvaluationRuntime {
  /** Local lifecycle observation only; never calls a WASM export. */
  isRetired(): boolean;
  observeRequestState(
    state: Readonly<{ latestIssuedGeneration: number; exhausted: boolean }>,
  ): EvaluationResult<void>;
  prepare(input: {
    requestGeneration: number;
    payloadUtf8: Uint8Array;
    textures: readonly EvaluationTextureBinding[];
    objects: readonly EvaluationPhysicalObject[];
  }): EvaluationResult<PreparedEvaluation>;
  retryMissing(
    prepared: PreparedEvaluation,
    objects: readonly EvaluationPhysicalObject[],
  ): EvaluationResult<PreparedEvaluation>;
  getPreparedSnapshot(prepared: PreparedEvaluation): EvaluationResult<EvaluationSnapshot>;
  getSnapshot(): EvaluationResult<EvaluationSnapshot>;
  setInput(id: string, value: number): EvaluationResult<void>;
  applyPreset(id: string): EvaluationResult<void>;
  update(delta: number): EvaluationResult<void>;
  prepareCommit(prepared: PreparedEvaluation): EvaluationResult<EvaluationCommit>;
  /** Returns status0 Activated, -1 Superseded, or the existing positive failure. */
  commitPrepared(commit: EvaluationCommit): number;
  finishCommit(commit: EvaluationCommit): void;
  dispose(): void;
}

const INPUT_LIMIT = 67_108_864,
  RGBA_LIMIT = 268_435_456,
  WORD_LIMIT = 0x7fff_ffff;
const load = createEmbeddedWasmLoader(VIVI_RUNTIME_NATIVE_EVALUATION_WASM_BASE64);
const prefix = "vivi_wasm_evaluation_";
const counts = [
  "render_mesh",
  "texture",
  "draw_command",
  "parameter",
  "expression_preset",
] as const;
const suffixes = [
  "abi_version",
  "create",
  "destroy",
  "observe_request_state",
  "prepare",
  "retry_missing",
  "prepared_destroy",
  "commit",
  "set_input",
  "apply_expression_preset",
  "update",
  "get_generations",
];
for (const role of ["", "prepared_"]) {
  for (const kind of counts) {
    suffixes.push(`${role}get_${kind}_count`);
    suffixes.push(`${role}get_${kind}${kind === "expression_preset" ? "" : "_snapshot"}`);
  }
  suffixes.push(`${role}get_required_render_features`);
}
type Exports = {
  memory: WebAssembly.Memory;
  functions: Readonly<Record<string, (...args: number[]) => number | undefined>>;
};
const bridge = (
  code: Extract<EvaluationFailure, { kind: "bridge" }>["code"],
): EvaluationFailure => ({ ok: false, kind: "bridge", code });
class Status extends Error {
  constructor(readonly status: number) {
    super("EVALUATION_OPERATION_FAILED");
  }
}
const requireInput = (valid: unknown, status = 1): void => {
  if (!valid) throw new Status(status);
};
const integer = (value: unknown, max = 0xffff_ffff): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max;
const field = (object: unknown, key: string): unknown => {
  requireInput(typeof object === "object" && object !== null);
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  requireInput(descriptor && "value" in descriptor);
  return descriptor!.value;
};
const bytes = (value: unknown, max: number): Uint8Array<ArrayBuffer> => {
  requireInput(value instanceof Uint8Array && value.buffer instanceof ArrayBuffer);
  const input = value as Uint8Array;
  requireInput(input.byteLength <= max, 6);
  return new Uint8Array(input);
};
const digest = (value: unknown): Uint8Array<ArrayBuffer> => {
  requireInput(typeof value === "string" && /^[0-9a-f]{64}$/i.test(value));
  const result = new Uint8Array(32);
  for (let i = 0; i < 32; i++)
    result[i] = Number.parseInt((value as string).slice(i * 2, i * 2 + 2), 16);
  return result;
};
const textBytes = (value: unknown, max: number): Uint8Array<ArrayBuffer> => {
  requireInput(typeof value === "string" && value.length <= max);
  const result = new TextEncoder().encode(value as string);
  requireInput(result.byteLength <= max);
  return result;
};

/** Actual separate native instance only: no legacy/portable fallback. */
export async function createNativeEvaluationRuntime(): Promise<
  EvaluationResult<NativeEvaluationRuntime>
> {
  let e: Exports;
  try {
    const instance = await load(),
      raw = instance.exports;
    const memory = Object.getOwnPropertyDescriptor(raw, "memory")?.value;
    if (!(memory instanceof WebAssembly.Memory)) return bridge("unavailable");
    const functions: Record<string, (...args: number[]) => number | undefined> = {};
    for (const name of [
      "vivi_wasm_alloc",
      "vivi_wasm_free",
      ...suffixes.map((suffix) => prefix + suffix),
    ]) {
      const value = Object.getOwnPropertyDescriptor(raw, name)?.value;
      if (typeof value !== "function") return bridge("unavailable");
      functions[name] = value;
    }
    e = { memory, functions: Object.freeze(functions) };
  } catch {
    return bridge("unavailable");
  }
  let retired = false,
    disposed = false,
    busy = false,
    runtime = 0;
  const children = new Map<PreparedEvaluation, number>();
  const permits = new Map<
    EvaluationCommit,
    { pointer: number; view: DataView; called: boolean }
  >();
  const invoke = (name: string, ...args: number[]): number | undefined => {
    if (retired) throw new Error("EVALUATION_INSTANCE_RETIRED");
    try {
      return e.functions[name]!(...args);
    } catch {
      retired = true;
      throw new Error("EVALUATION_EXPORT_FAILED");
    }
  };
  const call = (name: string, ...args: number[]): number => {
    const status = invoke(prefix + name, ...args);
    if (!integer(status, 14)) {
      retired = true;
      throw new Error("EVALUATION_STATUS_INVALID");
    }
    return status;
  };
  const checked = (name: string, ...args: number[]): void => {
    const status = call(name, ...args);
    if (status !== 0) throw new Status(status);
  };
  const view = (pointer: number, length: number): DataView => {
    if (
      !integer(pointer) ||
      pointer === 0 ||
      !integer(length) ||
      pointer + length > e.memory.buffer.byteLength
    ) {
      retired = true;
      throw new Error("EVALUATION_MEMORY_INVALID");
    }
    return new DataView(e.memory.buffer, pointer, length);
  };
  const allocations: Array<[number, number]> = [];
  const allocate = (length: number): number => {
    requireInput(integer(length, WORD_LIMIT), 6);
    const pointer = invoke("vivi_wasm_alloc", Math.max(length, 8));
    if (pointer === 0) throw new Status(6);
    if (!integer(pointer)) {
      retired = true;
      throw new Error("EVALUATION_POINTER_INVALID");
    }
    view(pointer, Math.max(length, 8));
    allocations.push([pointer, Math.max(length, 8)]);
    new Uint8Array(e.memory.buffer, pointer, Math.max(length, 8)).fill(0);
    return pointer;
  };
  const upload = (source: Uint8Array): number => {
    const p = allocate(source.byteLength);
    new Uint8Array(e.memory.buffer, p, source.byteLength).set(source);
    return p;
  };
  const span = (address: number, pointer: number, length: number): void => {
    const v = view(address, 16);
    v.setUint32(0, pointer, true);
    v.setBigUint64(8, BigInt(length), true);
  };
  const freeOwned = (): void => {
    while (allocations.length && !retired) {
      const [p, n] = allocations.pop()!;
      invoke("vivi_wasm_free", p, n);
    }
    if (retired) allocations.length = 0;
  };
  const run = <T>(operation: () => T): EvaluationResult<T> => {
    if (disposed) return bridge("disposed");
    if (retired) return bridge("internal");
    if (busy || permits.size > 0) return bridge("busy");
    busy = true;
    let result: EvaluationResult<T>;
    try {
      result = { ok: true, value: operation() };
    } catch (error) {
      result =
        error instanceof Status
          ? { ok: false, kind: "native", status: error.status }
          : bridge("internal");
    } finally {
      try {
        if (!retired) freeOwned();
      } catch {
        retired = true;
      }
      busy = false;
    }
    return retired ? bridge("internal") : result;
  };
  const initialized = run(() => {
    requireInput(invoke(`${prefix}abi_version`) === 2);
    const out = allocate(8);
    checked("create", out);
    runtime = view(out, 4).getUint32(0, true);
    requireInput(runtime !== 0);
  });
  if (!initialized.ok) return bridge("unavailable");
  const childHandle = (prepared: PreparedEvaluation, ready?: boolean): number => {
    const handle = children.get(prepared);
    requireInput(
      handle !== undefined &&
        (ready === undefined || (prepared.kind === "ready") === ready),
    );
    return handle!;
  };
  const makeChild = (
    handle: number,
    kind: number,
    generation: number,
  ): PreparedEvaluation => {
    requireInput(integer(handle) && handle !== 0 && (kind === 1 || kind === 2));
    const child: PreparedEvaluation = Object.freeze({
      kind: kind === 1 ? ("ready" as const) : ("missing" as const),
      requestGeneration: generation,
      dispose() {
        const handle = children.get(child);
        if (handle === undefined || busy) return;
        children.delete(child);
        snapshots.delete(child);
        if (!retired && !disposed) {
          try {
            invoke(`${prefix}prepared_destroy`, handle);
          } catch {
            /* Retired; no later exports. */
          }
        }
      },
    });
    children.set(child, handle);
    return child;
  };
  const objectTable = (
    objects: readonly EvaluationPhysicalObject[],
  ): { pointer: number; count: number } => {
    requireInput(Array.isArray(objects) && objects.length <= 288, 6);
    let total = 0;
    const captured: Array<{ address: Uint8Array; value: Uint8Array }> = [];
    const seen = new Set<string>();
    for (let i = 0; i < objects.length; i++) {
      const object = field(objects, String(i)),
        address = field(object, "objectAddress"),
        value = field(object, "bytes");
      const decoded = digest(address);
      requireInput(!seen.has((address as string).toLowerCase()));
      seen.add((address as string).toLowerCase());
      requireInput(value instanceof Uint8Array && value.buffer instanceof ArrayBuffer);
      total += (value as Uint8Array).byteLength;
      requireInput(total <= INPUT_LIMIT, 6);
      captured.push({ address: decoded, value: bytes(value, INPUT_LIMIT) });
    }
    const pointer = allocate(captured.length * 56);
    for (const [index, object] of captured.entries()) {
      const source = upload(object.value),
        p = pointer + index * 56;
      view(p, 56).setUint32(0, 56, true);
      new Uint8Array(e.memory.buffer, p + 8, 32).set(object.address);
      span(p + 40, source, object.value.byteLength);
    }
    return { pointer, count: captured.length };
  };
  const u64Number = (v: DataView, offset: number, max = WORD_LIMIT): number => {
    const n = v.getBigUint64(offset, true);
    requireInput(n <= BigInt(max), 6);
    return Number(n);
  };
  const readText = (pointer: number, length: number): string =>
    new TextDecoder("utf-8", { fatal: true }).decode(
      new Uint8Array(e.memory.buffer, pointer, length),
    );
  const copy32 = (
    pointer: number,
    components: number,
    floating: boolean,
  ): Float32Array | Uint32Array => {
    const result = floating ? new Float32Array(components) : new Uint32Array(components);
    const input = view(pointer, components * 4);
    for (let index = 0; index < components; index++)
      result[index] = floating
        ? input.getFloat32(index * 4, true)
        : input.getUint32(index * 4, true);
    return result;
  };
  // Every metadata record is detached before another export/growth can invalidate it.
  const metadata = (pointer: number, length: number): DataView =>
    new DataView(new Uint8Array(e.memory.buffer, pointer, length).slice().buffer);
  let activeStatic:
    | Pick<
        EvaluationSnapshot,
        "meshes" | "textures" | "commands" | "requiredFeatures" | "presets"
      >
    | undefined;
  let activeCacheKey: string | undefined;
  let awaitingActiveCacheKey = false;
  const snapshots = new Map<PreparedEvaluation, EvaluationSnapshot>();
  const snapshot = (
    handle: number,
    prepared: boolean,
    generations: EvaluationGenerations | null,
  ): EvaluationSnapshot => {
    const role = prepared ? "prepared_" : "";
    const count = (kind: (typeof counts)[number]): number => {
      const p = allocate(8);
      checked(`${role}get_${kind}_count`, handle, p);
      return u64Number(metadata(p, 8), 0);
    };
    const key = generations ? `${generations.model}/${generations.topology}` : undefined;
    const retained =
      key !== undefined && (key === activeCacheKey || awaitingActiveCacheKey)
        ? activeStatic
        : undefined;
    const meshes: EvaluationMesh[] = [];
    for (let slot = 0, n = count("render_mesh"); slot < n; slot++) {
      const info = allocate(96);
      view(info, 96).setUint32(0, 96, true);
      checked(`${role}get_render_mesh_snapshot`, handle, slot, 0, 0, info);
      const meta = metadata(info, 96),
        idSize = u64Number(meta, 16, 128),
        vertices = u64Number(meta, 24, Math.floor(WORD_LIMIT / 4)),
        uvs = u64Number(meta, 32, Math.floor(WORD_LIMIT / 4)),
        indices = u64Number(meta, 40, Math.floor(WORD_LIMIT / 4));
      const buffers = allocate(72),
        id = allocate(idSize),
        points = allocate(vertices * 4),
        uv = allocate(uvs * 4),
        index = allocate(indices * 4);
      view(buffers, 72).setUint32(0, 72, true);
      span(buffers + 8, id, idSize);
      span(buffers + 24, points, vertices * 4);
      span(buffers + 40, uv, uvs * 4);
      span(buffers + 56, index, indices * 4);
      checked(`${role}get_render_mesh_snapshot`, handle, slot, 0, buffers, info);
      const out = metadata(info, 96),
        flags = out.getUint32(12, true),
        blend = out.getUint32(60, true),
        cached = retained?.meshes[slot];
      const blendModes = ["normal", "multiply", "screen", "add"];
      requireInput(
        out.getUint32(0, true) === 96 &&
          out.getUint32(4, true) === slot &&
          (flags & ~15) === 0 &&
          blend < blendModes.length,
      );
      requireInput(
        !cached ||
          (cached.uvs.length === uvs &&
            cached.indices.length === indices &&
            cached.textureSlot === out.getUint32(8, true)),
      );
      meshes.push({
        slot,
        id: cached?.id ?? readText(id, idSize),
        textureSlot: out.getUint32(8, true),
        vertices: copy32(points, vertices, true) as Float32Array,
        // Native's complete-copy ABI still receives every destination. JS keeps
        // static owned arrays while this exact instance/model/topology is active.
        uvs: cached?.uvs ?? (copy32(uv, uvs, true) as Float32Array),
        indices: cached?.indices ?? (copy32(index, indices, false) as Uint32Array),
        x: out.getFloat32(48, true),
        y: out.getFloat32(52, true),
        opacity: out.getFloat32(56, true),
        visible: (flags & 1) !== 0,
        culled: (flags & 2) !== 0,
        blendMode: blendModes[blend]!,
        multiplyColor:
          flags & 4
            ? [
                out.getFloat32(64, true),
                out.getFloat32(68, true),
                out.getFloat32(72, true),
              ]
            : null,
        screenColor:
          flags & 8
            ? [
                out.getFloat32(76, true),
                out.getFloat32(80, true),
                out.getFloat32(84, true),
              ]
            : null,
      });
      freeOwned();
    }
    const textures: EvaluationTexture[] = [];
    if (!retained) {
      let total = 0;
      for (let slot = 0, n = count("texture"); slot < n; slot++) {
        requireInput(n <= 32, 6);
        const info = allocate(48);
        view(info, 48).setUint32(0, 48, true);
        checked(`${role}get_texture_snapshot`, handle, slot, 0, 0, info);
        const meta = metadata(info, 48),
          idSize = u64Number(meta, 24, 126),
          pixelBytes = u64Number(meta, 32, RGBA_LIMIT),
          rowStride = u64Number(meta, 40, RGBA_LIMIT);
        const width = meta.getUint32(8, true),
          height = meta.getUint32(12, true);
        requireInput(
          meta.getUint32(16, true) === 1 &&
            meta.getUint32(20, true) === 1 &&
            width >= 1 &&
            height >= 1 &&
            width <= 8192 &&
            height <= 8192 &&
            rowStride === width * 4 &&
            pixelBytes === rowStride * height,
        );
        total += pixelBytes;
        requireInput(total <= RGBA_LIMIT, 6);
        const buffers = allocate(40),
          id = allocate(idSize),
          pixels = allocate(pixelBytes);
        view(buffers, 40).setUint32(0, 40, true);
        span(buffers + 8, id, idSize);
        span(buffers + 24, pixels, pixelBytes);
        checked(`${role}get_texture_snapshot`, handle, slot, 0, buffers, info);
        textures.push({
          slot,
          id: readText(id, idSize),
          width,
          height,
          rowStride,
          rgba: new Uint8Array(e.memory.buffer, pixels, pixelBytes).slice(),
        });
        freeOwned();
      }
    }
    const commands: EvaluationCommand[] = [];
    let requiredFeatures = retained?.requiredFeatures ?? 0;
    if (!retained) {
      const p = allocate(24);
      checked(`${role}get_required_render_features`, handle, p);
      requiredFeatures = metadata(p, 4).getUint32(0, true);
      for (let slot = 0, n = count("draw_command"); slot < n; slot++) {
        view(p, 24).setUint32(0, 24, true);
        checked(`${role}get_draw_command_snapshot`, handle, slot, 0, p);
        const out = metadata(p, 24),
          kind = out.getUint32(4, true);
        requireInput(
          out.getUint32(0, true) === 24 &&
            kind >= 1 &&
            kind <= 3 &&
            out.getUint32(20, true) === 0,
        );
        commands.push({
          kind: kind as 1 | 2 | 3,
          meshSlot: out.getUint32(8, true),
          depth: out.getUint32(12, true),
          flags: out.getUint32(16, true),
        });
      }
      freeOwned();
    }
    const parameters: EvaluationParameter[] = [];
    for (let slot = 0, n = count("parameter"); slot < n; slot++) {
      const info = allocate(56);
      view(info, 56).setUint32(0, 56, true);
      checked(`${role}get_parameter_snapshot`, handle, slot, 0, 0, info);
      const length = u64Number(metadata(info, 56), 8, 128),
        id = allocate(length),
        descriptor = allocate(16);
      span(descriptor, id, length);
      checked(`${role}get_parameter_snapshot`, handle, slot, 0, descriptor, info);
      const out = metadata(info, 56);
      parameters.push({
        id: readText(id, length),
        min: out.getFloat64(16, true),
        max: out.getFloat64(24, true),
        default: out.getFloat64(32, true),
        current: out.getFloat64(40, true),
        evaluated: out.getFloat64(48, true),
      });
      freeOwned();
    }
    const presets: string[] = [];
    if (!retained)
      for (let slot = 0, n = count("expression_preset"); slot < n; slot++) {
        const out = allocate(8);
        checked(`${role}get_expression_preset`, handle, slot, 0, 0, out);
        const length = u64Number(metadata(out, 8), 0, 128),
          id = allocate(length),
          descriptor = allocate(16);
        span(descriptor, id, length);
        checked(`${role}get_expression_preset`, handle, slot, 0, descriptor, out);
        presets.push(readText(id, length));
        freeOwned();
      }
    const result: EvaluationSnapshot = {
      generations,
      meshes,
      textures: retained?.textures ?? textures,
      commands: retained?.commands ?? commands,
      requiredFeatures,
      parameters,
      presets: retained?.presets ?? presets,
    };
    if (key !== undefined) {
      activeCacheKey = key;
      activeStatic = result;
      awaitingActiveCacheKey = false;
    }
    return result;
  };
  const facade: NativeEvaluationRuntime = {
    isRetired: () => retired,
    observeRequestState(state) {
      return run(() => {
        const latest = field(state, "latestIssuedGeneration"),
          exhausted = field(state, "exhausted");
        requireInput(
          integer(latest, Number.MAX_SAFE_INTEGER) && typeof exhausted === "boolean",
        );
        const p = allocate(24),
          v = view(p, 24);
        v.setUint32(0, 24, true);
        v.setUint32(4, exhausted ? 1 : 0, true);
        v.setBigUint64(8, BigInt(latest as number), true);
        checked("observe_request_state", runtime, p);
      });
    },
    prepare(input) {
      return run(() => {
        const generation = field(input, "requestGeneration"),
          source = bytes(field(input, "payloadUtf8"), INPUT_LIMIT),
          textures = field(input, "textures");
        requireInput(
          integer(generation, Number.MAX_SAFE_INTEGER) &&
            Array.isArray(textures) &&
            textures.length <= 32,
        );
        const captured = (textures as EvaluationTextureBinding[]).map((item) => {
          const id = textBytes(field(item, "id"), 126),
            width = field(item, "width"),
            height = field(item, "height"),
            asset = field(item, "asset");
          const size = field(asset, "sizeBytes"),
            kind = field(asset, "storageKind");
          requireInput(
            integer(width) &&
              integer(height) &&
              integer(size, Number.MAX_SAFE_INTEGER) &&
              (kind === "blob" || kind === "chunk_manifest") &&
              field(asset, "mediaType") === "image/png",
          );
          return {
            id,
            width: width as number,
            height: height as number,
            size: size as number,
            kind,
            address: digest(field(asset, "objectAddress")),
            content: digest(field(asset, "contentSha256")),
          };
        });
        const objects = objectTable(
          field(input, "objects") as EvaluationPhysicalObject[],
        );
        const texturePointer = allocate(captured.length * 112);
        for (const [index, item] of captured.entries()) {
          const id = upload(item.id),
            p = texturePointer + index * 112,
            v = view(p, 112);
          v.setUint32(0, 112, true);
          v.setUint32(4, item.kind === "blob" ? 1 : 2, true);
          v.setUint32(8, item.width, true);
          v.setUint32(12, item.height, true);
          span(p + 16, id, item.id.byteLength);
          v.setBigUint64(32, BigInt(item.size), true);
          new Uint8Array(e.memory.buffer, p + 40, 32).set(item.address);
          new Uint8Array(e.memory.buffer, p + 72, 32).set(item.content);
        }
        const sourcePointer = upload(source),
          descriptor = allocate(64),
          out = allocate(8),
          info = allocate(16),
          v = view(descriptor, 64);
        v.setUint32(0, 64, true);
        v.setBigUint64(8, BigInt(generation as number), true);
        span(descriptor + 16, sourcePointer, source.byteLength);
        v.setUint32(32, texturePointer, true);
        v.setBigUint64(40, BigInt(captured.length), true);
        v.setUint32(48, objects.pointer, true);
        v.setBigUint64(56, BigInt(objects.count), true);
        view(info, 16).setUint32(0, 16, true);
        checked("prepare", runtime, descriptor, out, info);
        return makeChild(
          metadata(out, 4).getUint32(0, true),
          metadata(info, 16).getUint32(4, true),
          generation as number,
        );
      });
    },
    retryMissing(prepared, objects) {
      return run(() => {
        const handle = childHandle(prepared, false),
          table = objectTable(objects),
          inout = allocate(8),
          info = allocate(16);
        view(inout, 8).setUint32(0, handle, true);
        view(info, 16).setUint32(0, 16, true);
        const status = call(
          "retry_missing",
          runtime,
          inout,
          table.pointer,
          table.count,
          0,
          info,
        );
        const next = metadata(inout, 4).getUint32(0, true);
        if (next !== handle || status === 0) children.delete(prepared);
        if (status !== 0) throw new Status(status);
        return makeChild(
          next,
          metadata(info, 16).getUint32(4, true),
          prepared.requestGeneration,
        );
      });
    },
    getPreparedSnapshot(prepared) {
      return run(() => {
        const result = snapshot(childHandle(prepared, true), true, null);
        snapshots.set(prepared, result);
        return result;
      });
    },
    getSnapshot() {
      return run(() => {
        const p = allocate(24);
        checked("get_generations", runtime, p);
        const v = metadata(p, 24);
        const generations = {
          model: v.getBigUint64(0, true),
          topology: v.getBigUint64(8, true),
          dynamic: v.getBigUint64(16, true),
        };
        freeOwned();
        return snapshot(runtime, false, generations);
      });
    },
    setInput(id, value) {
      return run(() => {
        requireInput(typeof value === "number");
        const source = textBytes(id, 128),
          p = upload(source);
        checked("set_input", runtime, p, source.byteLength, 0, value);
      });
    },
    applyPreset(id) {
      return run(() => {
        const source = textBytes(id, 128),
          p = upload(source);
        checked("apply_expression_preset", runtime, p, source.byteLength, 0);
      });
    },
    update(delta) {
      return run(() => {
        requireInput(typeof delta === "number");
        checked("update", runtime, delta);
      });
    },
    prepareCommit(prepared) {
      return run(() => {
        const handle = childHandle(prepared, true),
          pointer = allocate(16),
          v = view(pointer, 16);
        v.setUint32(0, handle, true);
        const commit = Object.freeze({ prepared });
        permits.set(commit, { pointer, view: v, called: false });
        allocations.pop(); // Exactly this persistent scratch belongs to the permit.
        return commit;
      });
    },
    commitPrepared(commit) {
      const permit = permits.get(commit);
      if (
        disposed ||
        retired ||
        busy ||
        !permit ||
        permit.called ||
        !children.has(commit.prepared)
      )
        return 10;
      permit.called = true;
      // All checks/allocations precede publication. Native commit is allocation-
      // and growth-free. No free/query/error callback occurs before GPU selection.
      try {
        const status = call("commit", runtime, permit.pointer, permit.pointer + 8);
        return status || (permit.view.getUint32(8, true) === 1 ? 0 : -1);
      } catch {
        return 10;
      }
    },
    finishCommit(commit) {
      const permit = permits.get(commit);
      if (!permit) return;
      permits.delete(commit);
      if (!retired && permit.view.getUint32(0, true) === 0) {
        children.delete(commit.prepared);
        // Clear old static cache only after the caller completed GPU publication.
        if (permit.view.getUint32(8, true) === 1) {
          activeStatic = snapshots.get(commit.prepared);
          activeCacheKey = undefined;
          awaitingActiveCacheKey = true;
        }
      }
      snapshots.delete(commit.prepared);
      if (!retired) {
        try {
          invoke("vivi_wasm_free", permit.pointer, 16);
        } catch {
          /* No subsequent exports. */
        }
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (busy) {
        retired = true;
        return;
      }
      try {
        for (const handle of children.values())
          if (!retired) invoke(`${prefix}prepared_destroy`, handle);
        for (const permit of permits.values())
          if (!retired) invoke("vivi_wasm_free", permit.pointer, 16);
        if (!retired) invoke(`${prefix}destroy`, runtime);
      } catch {
        /* Trap retirement prohibits every further export. */
      }
      children.clear();
      permits.clear();
      snapshots.clear();
      activeStatic = undefined;
    },
  };
  return { ok: true, value: Object.freeze(facade) };
}
