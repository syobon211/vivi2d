import {
  VIVI_RUNTIME_ABI_VERSION,
  VIVI_RUNTIME_ERROR_CODES,
  VIVI_RUNTIME_SPEC_V1_VERSION,
  VIVI_RUNTIME_TOLERANCES,
  ViviRuntime,
  ViviRuntimeError,
  type RuntimeExpressionPresetInfo,
  type RuntimeHitResult,
  type RuntimeLimitOverrides,
  type RuntimeMeshSnapshot,
  type RuntimeModel,
  type RuntimeModelOptions,
  type RuntimeParameterInfo,
  type RuntimePlayClipOptions,
  type RuntimePlaybackState,
  type RuntimeStateMachineState,
  type RuntimeTextureData,
  type RuntimeTextureInfo,
  type RuntimeVersion,
  type ViviFileData,
} from "@vivi2d/runtime";
import { PortableRuntimeModel } from "./portable-evaluator";
import { VIVI_RUNTIME_NATIVE_WASM_BASE64 } from "./native-wasm-bytes";

export {
  VIVI_RUNTIME_ABI_VERSION,
  VIVI_RUNTIME_ERROR_CODES,
  VIVI_RUNTIME_SPEC_V1_VERSION,
  VIVI_RUNTIME_TOLERANCES,
  ViviRuntimeError,
  type RuntimeExpressionPresetInfo,
  type RuntimeHitResult,
  type RuntimeLimitOverrides,
  type RuntimeMeshSnapshot,
  type RuntimeModelOptions,
  type RuntimeParameterInfo,
  type RuntimePlayClipOptions,
  type RuntimePlaybackState,
  type RuntimeStateMachineState,
  type RuntimeTextureData,
  type RuntimeTextureInfo,
  type RuntimeVersion,
  type ViviFileData,
};

export interface ViviWasmRuntimeBackendInfo {
  readonly kind: "wasm-runtime";
  readonly abiVersion: number;
  readonly backendPreference: ViviWasmRuntimeBackendPreference;
  readonly selectedBackend: "native" | "portable";
  readonly nativeAvailable: boolean;
  readonly evaluator:
    | "native-rust"
    | "portable-typescript"
    | "typescript-reference";
  readonly wasmModuleValidated: boolean;
  readonly fallbackReason: "native-wasm-init-failed" | null;
}

export type ViviWasmRuntimeEvaluator = "portable" | "reference";
export type ViviWasmRuntimeBackendPreference = "auto" | "portable" | "native";

export interface ViviWasmRuntimeOptions {
  readonly expectedAbiVersion?: number;
  readonly evaluator?: ViviWasmRuntimeEvaluator;
  readonly backend?: ViviWasmRuntimeBackendPreference;
}

type ViviRuntimeWasmExports = {
  readonly memory: WebAssembly.Memory;
  readonly vivi_runtime_abi_version: () => number;
  readonly vivi_wasm_alloc: (byteLen: number) => number;
  readonly vivi_wasm_free: (pointer: number, byteLen: number) => void;
  readonly vivi_wasm_output_len: () => number;
  readonly vivi_wasm_last_error_code: () => number;
  readonly vivi_wasm_last_error_message_ptr: () => number;
  readonly vivi_wasm_model_load: (
    jsonPtr: number,
    jsonLen: number,
    optionsPtr: number,
    optionsLen: number,
  ) => number;
  readonly vivi_wasm_model_destroy: (handle: number) => void;
  readonly vivi_wasm_model_set_input: (
    handle: number,
    idPtr: number,
    idLen: number,
    value: number,
  ) => number;
  readonly vivi_wasm_model_apply_expression_preset: (
    handle: number,
    idPtr: number,
    idLen: number,
  ) => number;
  readonly vivi_wasm_model_update: (
    handle: number,
    deltaSeconds: number,
  ) => number;
  readonly vivi_wasm_model_snapshot_json: (handle: number) => number;
  readonly vivi_wasm_model_hit_test_json: (
    handle: number,
    x: number,
    y: number,
  ) => number;
};

interface RuntimeModelPublicSurface {
  getSpecVersion(): RuntimeVersion;
  getSupportedSpecVersionRange(): {
    readonly min: RuntimeVersion;
    readonly max: RuntimeVersion;
  };
  getRuntimeVersion(): RuntimeVersion;
  readonly width: number;
  readonly height: number;
  setInput(id: string, value: number): void;
  getParameterValue(id: string): number | null;
  getParameters(): readonly RuntimeParameterInfo[];
  getTextures(): readonly RuntimeTextureInfo[];
  getTextureData(id: string): RuntimeTextureData | null;
  getExpressionPresets(): readonly RuntimeExpressionPresetInfo[];
  applyExpressionPreset(id: string): void;
  update(deltaSeconds?: number): void;
  getRenderList(): readonly RuntimeMeshSnapshot[];
  getMeshSnapshot(id: string): RuntimeMeshSnapshot | null;
  hitTest(x: number, y: number): RuntimeHitResult | null;
  playClip(id: string, options?: RuntimePlayClipOptions): void;
  stopClip(): void;
  seekClip(seconds: number): void;
  getPlaybackState(): RuntimePlaybackState;
  setStateMachineState(id: string, stateId: string): void;
  getStateMachineState(id: string): RuntimeStateMachineState | null;
  dispose(): void;
}

type RuntimeModelReferenceSurface = {
  readonly [Key in keyof RuntimeModel]: RuntimeModel[Key];
};

type RuntimeModelSurfaceCoversReference =
  RuntimeModelPublicSurface extends RuntimeModelReferenceSurface ? true : never;

const RUNTIME_MODEL_SURFACE_COVERS_REFERENCE: RuntimeModelSurfaceCoversReference =
  true;
void RUNTIME_MODEL_SURFACE_COVERS_REFERENCE;

type NativeSnapshot = {
  readonly width: number;
  readonly height: number;
  readonly parameters: readonly NativeParameterSnapshot[];
  readonly textures: readonly NativeTextureSnapshot[];
  readonly expressionPresets: readonly NativeExpressionPresetSnapshot[];
  readonly renderList: readonly NativeMeshSnapshot[];
};

type NativeParameterSnapshot = {
  readonly id: string;
  readonly min: number;
  readonly max: number;
  readonly defaultValue: number;
  readonly currentValue: number;
};

type NativeTextureSnapshot = {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly format: "rgba8-straight";
  readonly colorSpace: "srgb";
  readonly source: "hostImage";
  readonly hostImageId: string;
};

type NativeExpressionPresetSnapshot = {
  readonly id: string;
  readonly name: string;
  readonly parameterValues: Record<string, number>;
  readonly color: string | null;
  readonly hotkey: string | null;
};

type NativeMeshSnapshot = {
  readonly id: string;
  readonly textureId: string;
  readonly vertices: readonly number[];
  readonly uvs: readonly number[];
  readonly indices: readonly number[];
  readonly x: number;
  readonly y: number;
  readonly opacity: number;
  readonly visible: boolean;
  readonly culled: boolean;
  readonly blendMode: "normal" | "multiply" | "screen" | "add";
  readonly multiplyColor: readonly [number, number, number, number] | null;
  readonly screenColor: readonly [number, number, number, number] | null;
  readonly drawOrder: number;
};

class WasmAbiMismatchError extends Error {
  constructor(actual: number, expected: number) {
    super(`runtime wasm ABI mismatch: ${actual} !== ${expected}`);
    this.name = "WasmAbiMismatchError";
  }
}

const NATIVE_STATUS = Object.freeze({
  ok: 0,
  invalidArgument: 1,
  unsupportedOperation: 2,
  parse: 3,
  unsupportedSpecVersion: 4,
  privateProfile: 5,
  limitExceeded: 6,
  validation: 7,
  texture: 8,
  evaluation: 9,
  internal: 10,
});

function runtimeWasmError(
  code: ViviRuntimeError["code"],
  message: string,
  cause?: unknown,
): ViviRuntimeError {
  return new ViviRuntimeError(code, message, cause);
}

function nativeStatusToErrorCode(status: number): ViviRuntimeError["code"] {
  switch (status) {
    case NATIVE_STATUS.invalidArgument:
      return VIVI_RUNTIME_ERROR_CODES.invalidArgument;
    case NATIVE_STATUS.unsupportedOperation:
      return VIVI_RUNTIME_ERROR_CODES.unsupportedOperation;
    case NATIVE_STATUS.parse:
      return VIVI_RUNTIME_ERROR_CODES.parse;
    case NATIVE_STATUS.unsupportedSpecVersion:
      return VIVI_RUNTIME_ERROR_CODES.unsupportedSpecVersion;
    case NATIVE_STATUS.privateProfile:
      return VIVI_RUNTIME_ERROR_CODES.privateProfile;
    case NATIVE_STATUS.limitExceeded:
      return VIVI_RUNTIME_ERROR_CODES.limitExceeded;
    case NATIVE_STATUS.validation:
      return VIVI_RUNTIME_ERROR_CODES.validation;
    case NATIVE_STATUS.texture:
      return VIVI_RUNTIME_ERROR_CODES.texture;
    case NATIVE_STATUS.evaluation:
      return VIVI_RUNTIME_ERROR_CODES.evaluation;
    default:
      return VIVI_RUNTIME_ERROR_CODES.internal;
  }
}

function validateNativeSnapshot(snapshot: NativeSnapshot): void {
  const renderList = (snapshot as { readonly renderList?: unknown }).renderList;
  if (!Array.isArray(renderList)) {
    throw runtimeWasmError(
      VIVI_RUNTIME_ERROR_CODES.internal,
      "native runtime wasm snapshot is missing renderList",
    );
  }
  for (const mesh of renderList as readonly Partial<NativeMeshSnapshot>[]) {
    if (!Number.isFinite(mesh.x) || !Number.isFinite(mesh.y)) {
      throw runtimeWasmError(
        VIVI_RUNTIME_ERROR_CODES.internal,
        "native runtime wasm snapshot is missing finite mesh x/y translation",
      );
    }
  }
}

function decodeBase64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  if (typeof atob === "function") {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }
  const maybeBuffer = (globalThis as typeof globalThis & {
    Buffer?: { from(value: string, encoding: "base64"): Uint8Array };
  }).Buffer;
  if (maybeBuffer) {
    return Uint8Array.from(maybeBuffer.from(base64, "base64"));
  }
  throw new Error("base64 decoding is not available in this host");
}

let cachedNativeWasmBytes: Uint8Array<ArrayBuffer> | null = null;

function getNativeWasmBytes(): Uint8Array<ArrayBuffer> {
  cachedNativeWasmBytes ??= decodeBase64ToBytes(
    VIVI_RUNTIME_NATIVE_WASM_BASE64,
  );
  return cachedNativeWasmBytes;
}

async function createKernelExports(
  expectedAbiVersion: number,
): Promise<ViviRuntimeWasmExports> {
  try {
    if (typeof WebAssembly === "undefined") {
      throw new Error("WebAssembly is not available in this host");
    }
    const nativeWasmBytes = getNativeWasmBytes();
    if (!WebAssembly.validate(nativeWasmBytes)) {
      throw new Error("embedded native runtime wasm module failed validation");
    }
    const { instance } = await WebAssembly.instantiate(nativeWasmBytes);
    const exports = instance.exports as ViviRuntimeWasmExports;
    if (!(exports.memory instanceof WebAssembly.Memory)) {
      throw new Error("embedded native runtime wasm module is missing memory");
    }
    if (typeof exports.vivi_runtime_abi_version !== "function") {
      throw new Error("embedded native runtime wasm module is missing ABI export");
    }
    const abiVersion = exports.vivi_runtime_abi_version();
    if (abiVersion !== expectedAbiVersion) {
      throw new WasmAbiMismatchError(abiVersion, expectedAbiVersion);
    }
    return exports;
  } catch (error) {
    throw runtimeWasmError(
      VIVI_RUNTIME_ERROR_CODES.internal,
      "failed to initialize native runtime wasm backend",
      error,
    );
  }
}

class NativeWasmKernel {
  readonly #exports: ViviRuntimeWasmExports;
  readonly #encoder = new TextEncoder();
  readonly #decoder = new TextDecoder();

  constructor(exports: ViviRuntimeWasmExports) {
    this.#exports = exports;
  }

  get abiVersion(): number {
    return this.#exports.vivi_runtime_abi_version();
  }

  loadFileData(
    fileData: ViviFileData,
    options?: RuntimeModelOptions,
  ): NativeWasmRuntimeModel {
    let json: string | undefined;
    try {
      json = JSON.stringify(fileData);
    } catch (error) {
      throw runtimeWasmError(
        VIVI_RUNTIME_ERROR_CODES.validation,
        "invalid runtime model data",
        error,
      );
    }
    if (json === undefined) {
      throw runtimeWasmError(
        VIVI_RUNTIME_ERROR_CODES.validation,
        "runtime payload must be an object",
      );
    }
    return this.loadJSON(json, options);
  }

  loadJSON(json: string, options?: RuntimeModelOptions): NativeWasmRuntimeModel {
    const jsonBytes = this.#encoder.encode(json);
    const optionsBytes = this.#encodeOptions(options);
    const jsonInput = this.#writeInput(jsonBytes);
    try {
      const optionsInput = this.#writeInput(optionsBytes);
      try {
        const handle = this.#exports.vivi_wasm_model_load(
          jsonInput.pointer,
          jsonInput.byteLen,
          optionsInput.pointer,
          optionsInput.byteLen,
        );
        if (handle === 0) {
          throw this.#lastError("native runtime wasm model load failed");
        }
        try {
          return new NativeWasmRuntimeModel(this, handle);
        } catch (error) {
          this.#exports.vivi_wasm_model_destroy(handle);
          throw error;
        }
      } finally {
        this.#freeInput(optionsInput);
      }
    } finally {
      this.#freeInput(jsonInput);
    }
  }

  destroy(handle: number): void {
    this.#exports.vivi_wasm_model_destroy(handle);
  }

  setInput(handle: number, id: string, value: number): void {
    const idInput = this.#writeInput(this.#encoder.encode(id));
    try {
      this.#checkStatus(
        this.#exports.vivi_wasm_model_set_input(
          handle,
          idInput.pointer,
          idInput.byteLen,
          value,
        ),
        "native runtime wasm setInput failed",
      );
    } finally {
      this.#freeInput(idInput);
    }
  }

  applyExpressionPreset(handle: number, id: string): void {
    const idInput = this.#writeInput(this.#encoder.encode(id));
    try {
      this.#checkStatus(
        this.#exports.vivi_wasm_model_apply_expression_preset(
          handle,
          idInput.pointer,
          idInput.byteLen,
        ),
        "native runtime wasm applyExpressionPreset failed",
      );
    } finally {
      this.#freeInput(idInput);
    }
  }

  update(handle: number, deltaSeconds: number): void {
    this.#checkStatus(
      this.#exports.vivi_wasm_model_update(handle, deltaSeconds),
      "native runtime wasm update failed",
    );
  }

  snapshot(handle: number): NativeSnapshot {
    const pointer = this.#exports.vivi_wasm_model_snapshot_json(handle);
    if (pointer === 0) {
      throw this.#lastError("native runtime wasm snapshot failed");
    }
    const snapshot = JSON.parse(this.#readOutput(pointer)) as NativeSnapshot;
    validateNativeSnapshot(snapshot);
    return snapshot;
  }

  hitTest(handle: number, x: number, y: number): RuntimeHitResult | null {
    const pointer = this.#exports.vivi_wasm_model_hit_test_json(handle, x, y);
    if (pointer === 0) {
      throw this.#lastError("native runtime wasm hitTest failed");
    }
    return JSON.parse(this.#readOutput(pointer)) as RuntimeHitResult | null;
  }

  #writeInput(bytes: Uint8Array): { pointer: number; byteLen: number } {
    if (bytes.byteLength === 0) return { pointer: 0, byteLen: 0 };
    const pointer = this.#exports.vivi_wasm_alloc(bytes.byteLength);
    if (pointer === 0) {
      throw this.#lastError("native runtime wasm allocation failed");
    }
    new Uint8Array(this.#exports.memory.buffer, pointer, bytes.byteLength).set(
      bytes,
    );
    return { pointer, byteLen: bytes.byteLength };
  }

  #encodeOptions(options?: RuntimeModelOptions): Uint8Array {
    if (options === undefined) return new Uint8Array(0);
    let json: string | undefined;
    try {
      json = JSON.stringify(options);
    } catch (error) {
      throw runtimeWasmError(
        VIVI_RUNTIME_ERROR_CODES.invalidArgument,
        "native runtime wasm options must be JSON-serializable",
        error,
      );
    }
    if (json === undefined) {
      throw runtimeWasmError(
        VIVI_RUNTIME_ERROR_CODES.invalidArgument,
        "native runtime wasm options must be a JSON object",
      );
    }
    return this.#encoder.encode(json);
  }

  #freeInput(input: { pointer: number; byteLen: number }): void {
    if (input.pointer !== 0 && input.byteLen !== 0) {
      this.#exports.vivi_wasm_free(input.pointer, input.byteLen);
    }
  }

  #checkStatus(status: number, fallbackMessage: string): void {
    if (status === NATIVE_STATUS.ok) return;
    throw this.#lastError(fallbackMessage, status);
  }

  #lastError(fallbackMessage: string, knownStatus?: number): ViviRuntimeError {
    const status = knownStatus ?? this.#exports.vivi_wasm_last_error_code();
    const messagePointer = this.#exports.vivi_wasm_last_error_message_ptr();
    const message = messagePointer === 0
      ? ""
      : this.#readOutput(messagePointer);
    return runtimeWasmError(
      nativeStatusToErrorCode(status),
      message || fallbackMessage,
    );
  }

  #readOutput(pointer: number): string {
    const byteLen = this.#exports.vivi_wasm_output_len();
    return this.#decoder.decode(
      new Uint8Array(this.#exports.memory.buffer, pointer, byteLen),
    );
  }
}

export class WasmRuntimeModel implements RuntimeModelPublicSurface {
  readonly #model: RuntimeModelPublicSurface;

  constructor(model: RuntimeModelPublicSurface) {
    this.#model = model;
  }

  getSpecVersion(): RuntimeVersion {
    return this.#model.getSpecVersion();
  }

  getSupportedSpecVersionRange(): {
    readonly min: RuntimeVersion;
    readonly max: RuntimeVersion;
  } {
    return this.#model.getSupportedSpecVersionRange();
  }

  getRuntimeVersion(): RuntimeVersion {
    return this.#model.getRuntimeVersion();
  }

  get width(): number {
    return this.#model.width;
  }

  get height(): number {
    return this.#model.height;
  }

  setInput(id: string, value: number): void {
    this.#model.setInput(id, value);
  }

  getParameterValue(id: string): number | null {
    return this.#model.getParameterValue(id);
  }

  getParameters(): readonly RuntimeParameterInfo[] {
    return this.#model.getParameters();
  }

  getTextures(): readonly RuntimeTextureInfo[] {
    return this.#model.getTextures();
  }

  getTextureData(id: string): RuntimeTextureData | null {
    return this.#model.getTextureData(id);
  }

  getExpressionPresets(): readonly RuntimeExpressionPresetInfo[] {
    return this.#model.getExpressionPresets();
  }

  applyExpressionPreset(id: string): void {
    this.#model.applyExpressionPreset(id);
  }

  update(deltaSeconds = 0): void {
    this.#model.update(deltaSeconds);
  }

  getRenderList(): readonly RuntimeMeshSnapshot[] {
    return this.#model.getRenderList();
  }

  getMeshSnapshot(id: string): RuntimeMeshSnapshot | null {
    return this.#model.getMeshSnapshot(id);
  }

  hitTest(x: number, y: number): RuntimeHitResult | null {
    return this.#model.hitTest(x, y);
  }

  playClip(id: string, options?: RuntimePlayClipOptions): void {
    this.#model.playClip(id, options);
  }

  stopClip(): void {
    this.#model.stopClip();
  }

  seekClip(seconds: number): void {
    this.#model.seekClip(seconds);
  }

  getPlaybackState(): RuntimePlaybackState {
    return this.#model.getPlaybackState();
  }

  setStateMachineState(id: string, stateId: string): void {
    this.#model.setStateMachineState(id, stateId);
  }

  getStateMachineState(id: string): RuntimeStateMachineState | null {
    return this.#model.getStateMachineState(id);
  }

  dispose(): void {
    this.#model.dispose();
  }
}

class NativeWasmRuntimeModel implements RuntimeModelPublicSurface {
  readonly #kernel: NativeWasmKernel;
  readonly #handle: number;
  #snapshot: NativeSnapshot;
  #disposed = false;
  #dirty = false;

  constructor(kernel: NativeWasmKernel, handle: number) {
    this.#kernel = kernel;
    this.#handle = handle;
    this.#snapshot = kernel.snapshot(handle);
  }

  getSpecVersion(): RuntimeVersion {
    this.#assertUsable();
    return VIVI_RUNTIME_SPEC_V1_VERSION;
  }

  getSupportedSpecVersionRange(): {
    readonly min: RuntimeVersion;
    readonly max: RuntimeVersion;
  } {
    this.#assertUsable();
    return {
      min: VIVI_RUNTIME_SPEC_V1_VERSION,
      max: this.getRuntimeVersion(),
    };
  }

  getRuntimeVersion(): RuntimeVersion {
    this.#assertUsable();
    return VIVI_RUNTIME_SPEC_V1_VERSION;
  }

  get width(): number {
    this.#assertUsable();
    return this.#snapshot.width;
  }

  get height(): number {
    this.#assertUsable();
    return this.#snapshot.height;
  }

  setInput(id: string, value: number): void {
    this.#assertUsable();
    this.#kernel.setInput(this.#handle, id, value);
    this.#dirty = true;
  }

  getParameterValue(id: string): number | null {
    this.#assertUsable();
    return this.#currentSnapshot().parameters.find(
      (parameter) => parameter.id === id,
    )?.currentValue ?? null;
  }

  getParameters(): readonly RuntimeParameterInfo[] {
    this.#assertUsable();
    return Object.freeze(
      this.#currentSnapshot().parameters.map((parameter) =>
        Object.freeze({ ...parameter }),
      ),
    );
  }

  getTextures(): readonly RuntimeTextureInfo[] {
    this.#assertUsable();
    return Object.freeze(
      this.#currentSnapshot().textures.map((texture) =>
        Object.freeze({
          id: texture.id,
          width: texture.width,
          height: texture.height,
          format: texture.format,
          colorSpace: texture.colorSpace,
          source: texture.source,
        }),
      ),
    );
  }

  getTextureData(id: string): RuntimeTextureData | null {
    this.#assertUsable();
    const texture = this.#currentSnapshot().textures.find(
      (item) => item.id === id,
    );
    if (!texture) return null;
    return Object.freeze({
      info: Object.freeze({
        id: texture.id,
        width: texture.width,
        height: texture.height,
        format: texture.format,
        colorSpace: texture.colorSpace,
        source: texture.source,
      }),
      pixels: null,
      hostImageId: texture.hostImageId,
      pixelByteLength: 0,
      rowStride: 0,
    });
  }

  getExpressionPresets(): readonly RuntimeExpressionPresetInfo[] {
    this.#assertUsable();
    return Object.freeze(
      this.#currentSnapshot().expressionPresets.map((preset) =>
        Object.freeze({
          id: preset.id,
          name: preset.name,
          parameterValues: Object.freeze({ ...preset.parameterValues }),
          color: preset.color,
          hotkey: preset.hotkey,
        }),
      ),
    );
  }

  applyExpressionPreset(id: string): void {
    this.#assertUsable();
    this.#kernel.applyExpressionPreset(this.#handle, id);
    this.#dirty = true;
  }

  update(deltaSeconds = 0): void {
    this.#assertUsable();
    this.#kernel.update(this.#handle, deltaSeconds);
    this.#dirty = true;
  }

  getRenderList(): readonly RuntimeMeshSnapshot[] {
    this.#assertUsable();
    return Object.freeze(
      this.#currentSnapshot().renderList.map((mesh) =>
        this.#toMeshSnapshot(mesh),
      ),
    );
  }

  getMeshSnapshot(id: string): RuntimeMeshSnapshot | null {
    this.#assertUsable();
    const mesh = this.#currentSnapshot().renderList.find((item) => item.id === id);
    return mesh ? this.#toMeshSnapshot(mesh) : null;
  }

  hitTest(x: number, y: number): RuntimeHitResult | null {
    this.#assertUsable();
    return this.#kernel.hitTest(this.#handle, x, y);
  }

  playClip(_id: string, _options?: RuntimePlayClipOptions): void {
    this.#assertUsable();
    throw runtimeWasmError(
      VIVI_RUNTIME_ERROR_CODES.unsupportedOperation,
      "clip playback is not available in the native WASM runtime backend",
    );
  }

  stopClip(): void {
    this.#assertUsable();
    throw runtimeWasmError(
      VIVI_RUNTIME_ERROR_CODES.unsupportedOperation,
      "clip playback is not available in the native WASM runtime backend",
    );
  }

  seekClip(_seconds: number): void {
    this.#assertUsable();
    throw runtimeWasmError(
      VIVI_RUNTIME_ERROR_CODES.unsupportedOperation,
      "clip playback is not available in the native WASM runtime backend",
    );
  }

  getPlaybackState(): RuntimePlaybackState {
    this.#assertUsable();
    return { playing: false, clipId: null, timeSeconds: 0, loop: false };
  }

  setStateMachineState(_id: string, _stateId: string): void {
    this.#assertUsable();
    throw runtimeWasmError(
      VIVI_RUNTIME_ERROR_CODES.unsupportedOperation,
      "state machines are not available in the native WASM runtime backend",
    );
  }

  getStateMachineState(_id: string): RuntimeStateMachineState | null {
    this.#assertUsable();
    return null;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#kernel.destroy(this.#handle);
    this.#disposed = true;
  }

  #refresh(): void {
    this.#snapshot = this.#kernel.snapshot(this.#handle);
    this.#dirty = false;
  }

  #currentSnapshot(): NativeSnapshot {
    if (this.#dirty) {
      this.#refresh();
    }
    return this.#snapshot;
  }

  #assertUsable(): void {
    if (this.#disposed) {
      throw runtimeWasmError(
        VIVI_RUNTIME_ERROR_CODES.invalidArgument,
        "runtime model has been disposed",
      );
    }
  }

  #toMeshSnapshot(mesh: NativeMeshSnapshot): RuntimeMeshSnapshot {
    return Object.freeze({
      id: mesh.id,
      textureId: mesh.textureId,
      vertices: new Float32Array(mesh.vertices),
      uvs: new Float32Array(mesh.uvs),
      indices: new Uint32Array(mesh.indices),
      x: mesh.x,
      y: mesh.y,
      opacity: mesh.opacity,
      visible: mesh.visible,
      culled: mesh.culled,
      blendMode: mesh.blendMode,
      multiplyColor: freezeColor(mesh.multiplyColor),
      screenColor: freezeColor(mesh.screenColor),
      drawOrder: mesh.drawOrder,
    });
  }
}

function freezeColor(
  color: readonly [number, number, number, number] | null,
): readonly [number, number, number, number] | null {
  return color
    ? Object.freeze([color[0], color[1], color[2], color[3]] as [
        number,
        number,
        number,
        number,
      ])
    : null;
}

export class ViviWasmRuntime {
  readonly #kernel: NativeWasmKernel | null;
  readonly #evaluator: ViviWasmRuntimeEvaluator;
  readonly #backendPreference: ViviWasmRuntimeBackendPreference;
  readonly #fallbackReason: "native-wasm-init-failed" | null;

  private constructor(
    kernel: NativeWasmKernel | null,
    evaluator: ViviWasmRuntimeEvaluator,
    backendPreference: ViviWasmRuntimeBackendPreference,
    fallbackReason: "native-wasm-init-failed" | null,
  ) {
    this.#kernel = kernel;
    this.#evaluator = evaluator;
    this.#backendPreference = backendPreference;
    this.#fallbackReason = fallbackReason;
  }

  static async create(
    options: ViviWasmRuntimeOptions = {},
  ): Promise<ViviWasmRuntime> {
    const backendPreference = options.backend ?? "auto";
    let kernel: NativeWasmKernel | null = null;
    let fallbackReason: "native-wasm-init-failed" | null = null;

    if (backendPreference !== "portable") {
      try {
        kernel = new NativeWasmKernel(
          await createKernelExports(
            options.expectedAbiVersion ?? VIVI_RUNTIME_ABI_VERSION,
          ),
        );
      } catch (error) {
        if (backendPreference === "native") {
          throw error;
        }
        fallbackReason = "native-wasm-init-failed";
      }
    }

    return new ViviWasmRuntime(
      kernel,
      options.evaluator ?? "portable",
      backendPreference,
      fallbackReason,
    );
  }

  getBackendInfo(): ViviWasmRuntimeBackendInfo {
    const selectedBackend = this.#kernel ? "native" : "portable";
    return Object.freeze({
      kind: "wasm-runtime",
      abiVersion: this.#kernel?.abiVersion ?? VIVI_RUNTIME_ABI_VERSION,
      backendPreference: this.#backendPreference,
      selectedBackend,
      nativeAvailable: this.#kernel !== null,
      evaluator: this.#kernel
        ? "native-rust"
        : this.#evaluator === "portable"
          ? "portable-typescript"
          : "typescript-reference",
      wasmModuleValidated: this.#kernel !== null,
      fallbackReason: this.#fallbackReason,
    });
  }

  load(fileData: ViviFileData, options?: RuntimeModelOptions): WasmRuntimeModel {
    const model: RuntimeModelPublicSurface = this.#kernel
      ? this.#kernel.loadFileData(fileData, options)
      : this.#evaluator === "portable"
        ? PortableRuntimeModel.fromFileData(fileData, options)
        : ViviRuntime.load(fileData, options);
    return new WasmRuntimeModel(model);
  }

  parse(json: string, options?: RuntimeModelOptions): WasmRuntimeModel {
    const model: RuntimeModelPublicSurface = this.#kernel
      ? this.#kernel.loadJSON(json, options)
      : this.#evaluator === "portable"
        ? PortableRuntimeModel.fromJSON(json, options)
        : ViviRuntime.parse(json, options);
    return new WasmRuntimeModel(model);
  }
}

export async function createViviWasmRuntime(
  options?: ViviWasmRuntimeOptions,
): Promise<ViviWasmRuntime> {
  return ViviWasmRuntime.create(options);
}
