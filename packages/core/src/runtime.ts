import { hitTestColliders } from "./collider";
import { getDrawOrder } from "./color-utils";
import { flattenLayers } from "./layer-utils";
import { mergeParameterDefaults } from "./parameter-utils";
import { PublicViviModel, type PublicViviModelOptions } from "./public-model";
import {
  assertPublicRawViviFileProfile,
  assertPublicViviFileProfile,
  PUBLIC_PROJECT_PROFILE,
  PublicProfileError,
} from "./public-profile";
import {
  VIVI_RUNTIME_ERROR_CODES,
  VIVI_RUNTIME_LIMITS,
  VIVI_RUNTIME_PROJECT_FILE_VERSION,
  VIVI_RUNTIME_SPEC_V1_VERSION,
  VIVI_RUNTIME_SPEC_VERSION,
  VIVI_RUNTIME_TIMING,
  ViviRuntimeError,
  type ViviRuntimeErrorCode,
} from "./runtime-spec";
import type {
  AtlasData,
  BlendMode,
  MeshRenderState,
  ProjectData,
  ViviFileData,
} from "./types";

export interface RuntimeVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

export interface RuntimeParameterInfo {
  readonly id: string;
  readonly min: number;
  readonly max: number;
  readonly defaultValue: number;
  readonly currentValue: number;
}

export interface RuntimeTextureInfo {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly format: "rgba8-straight";
  readonly colorSpace: "srgb";
  readonly source: "hostImage" | "embeddedRgba8";
}

export interface RuntimeTextureData {
  readonly info: RuntimeTextureInfo;
  readonly pixels: Uint8Array | null;
  readonly hostImageId: string | null;
  readonly pixelByteLength: number;
  readonly rowStride: number;
}

export interface RuntimeExpressionPresetInfo {
  readonly id: string;
  readonly name: string;
  readonly parameterValues: Readonly<Record<string, number>>;
  readonly color: string | null;
  readonly hotkey: string | null;
}

export interface RuntimeHitResult {
  readonly colliderId: string;
  /**
   * Runtime Spec v1 mesh identifiers are layer identifiers, so mesh collider
   * hits mirror `meshId` here. Rectangle and circle colliders return `null`.
   */
  readonly layerId: string | null;
  readonly meshId: string | null;
  readonly x: number;
  readonly y: number;
}

export interface RuntimeMeshSnapshot {
  readonly id: string;
  readonly textureId: string;
  readonly vertices: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint32Array;
  readonly x: number;
  readonly y: number;
  readonly opacity: number;
  readonly visible: boolean;
  readonly culled: boolean;
  readonly blendMode: "normal" | "multiply" | "screen" | "add";
  readonly multiplyColor: readonly [number, number, number, number] | null;
  readonly screenColor: readonly [number, number, number, number] | null;
  readonly drawOrder: number;
}

export interface RuntimePlaybackState {
  readonly playing: boolean;
  readonly clipId: string | null;
  readonly timeSeconds: number;
  readonly loop: boolean;
}

export interface RuntimeStateMachineState {
  readonly machineId: string;
  readonly stateId: string;
  readonly transitioning: boolean;
}

export interface RuntimePlayClipOptions {
  readonly loop?: boolean;
  readonly startTimeSeconds?: number;
}

export type RuntimeLimitOverrides = Partial<
  Record<keyof typeof VIVI_RUNTIME_LIMITS, number>
>;

type RuntimeLimits = Record<keyof typeof VIVI_RUNTIME_LIMITS, number>;

export interface RuntimeModelOptions extends PublicViviModelOptions {
  readonly maxPayloadBytes?: number;
  readonly maxTextureBytes?: number;
  readonly limits?: RuntimeLimitOverrides;
}

function runtimeError(
  code: ViviRuntimeErrorCode,
  message: string,
  cause?: unknown,
): ViviRuntimeError {
  return new ViviRuntimeError(code, message, cause);
}

function assertFiniteNumber(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw runtimeError(
      VIVI_RUNTIME_ERROR_CODES.invalidArgument,
      `${label} must be finite`,
    );
  }
}

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      index += 1;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

function toRuntimeBlendMode(mode: BlendMode): RuntimeMeshSnapshot["blendMode"] {
  if (mode === "multiply" || mode === "screen" || mode === "add") return mode;
  return "normal";
}

function toColorTuple(
  color: { r: number; g: number; b: number } | undefined,
  alpha: number,
): readonly [number, number, number, number] | null {
  if (!color) return null;
  return [color.r, color.g, color.b, alpha] as const;
}

function createTextureInfo(atlas: AtlasData, index: number): RuntimeTextureInfo {
  return {
    id: `atlas:${index}`,
    width: atlas.width,
    height: atlas.height,
    format: "rgba8-straight",
    colorSpace: "srgb",
    source: "hostImage",
  };
}

function freezeTextureInfo(texture: RuntimeTextureInfo): RuntimeTextureInfo {
  return Object.freeze({ ...texture });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolveRuntimeLimits(
  options?: RuntimeModelOptions,
): RuntimeLimits {
  const resolved: RuntimeLimits = { ...VIVI_RUNTIME_LIMITS };
  for (const [key, value] of Object.entries(options?.limits ?? {})) {
    if (value !== undefined) {
      (resolved as Record<string, number>)[key] = clampLimitOverride(
        key,
        value,
      );
    }
  }
  return {
    ...resolved,
    maxPayloadBytes:
      options?.maxPayloadBytes === undefined
        ? resolved.maxPayloadBytes
        : clampLimitOverride("maxPayloadBytes", options.maxPayloadBytes),
    maxTextureBytes:
      options?.maxTextureBytes === undefined
        ? resolved.maxTextureBytes
        : clampLimitOverride("maxTextureBytes", options.maxTextureBytes),
  };
}

function clampLimitOverride(
  key: string,
  value: number,
): number {
  const defaultLimit = (VIVI_RUNTIME_LIMITS as Record<string, number>)[key];
  if (defaultLimit === undefined) {
    throw runtimeError(
      VIVI_RUNTIME_ERROR_CODES.invalidArgument,
      `unknown runtime limit override: ${key}`,
    );
  }
  if (!Number.isFinite(value) || value < 0) {
    throw runtimeError(
      VIVI_RUNTIME_ERROR_CODES.invalidArgument,
      `runtime limit override must be a finite non-negative number: ${key}`,
    );
  }
  return Math.min(defaultLimit, value);
}

function assertLimit(
  label: string,
  actual: number,
  limit: number,
): void {
  if (actual > limit) {
    throw runtimeError(
      VIVI_RUNTIME_ERROR_CODES.limitExceeded,
      `${label} exceeds runtime limit: ${actual} > ${limit}`,
    );
  }
}

function validateRuntimeLimits(
  fileData: ViviFileData,
  limits: RuntimeLimits,
): void {
  const project = fileData.project;
  const allLayers = flattenLayers(project.layers);
  const meshes = allLayers.filter((layer) => layer.kind === "viviMesh");
  const bones = allLayers.filter((layer) => layer.kind === "bone");

  assertLimit("textures", fileData.atlases.length, limits.maxTextures);
  const textureBytes = fileData.atlases.reduce(
    (sum, atlas) => sum + atlas.width * atlas.height * 4,
    0,
  );
  assertLimit("textureBytes", textureBytes, limits.maxTextureBytes);
  assertLimit("layers", allLayers.length, limits.maxLayers);
  assertLimit("meshes", meshes.length, limits.maxMeshes);
  assertLimit("bones", bones.length, limits.maxBones);
  assertLimit("parameters", project.parameters.length, limits.maxParameters);
  assertLimit("colliders", project.colliders.length, limits.maxColliders);
  assertLimit(
    "ikControllers",
    project.ikControllers?.length ?? 0,
    limits.maxIkControllers,
  );
  assertLimit(
    "physicsGroups",
    project.physicsGroups.length,
    limits.maxPhysicsGroups,
  );
  assertLimit("animationClips", project.clips.length, limits.maxAnimationClips);
  assertLimit(
    "stateMachines",
    project.stateMachines.length,
    limits.maxStateMachines,
  );

  const bindingPointCount = (project.parameterBindings ?? []).reduce(
    (sum, binding) => sum + binding.bindingPoints.length,
    0,
  );
  assertLimit("bindingPoints", bindingPointCount, limits.maxBindingPoints);

  for (const mesh of meshes) {
    assertLimit(
      `vertices:${mesh.id}`,
      mesh.mesh.vertices.length / 2,
      limits.maxVerticesPerMesh,
    );
    assertLimit(
      `indices:${mesh.id}`,
      mesh.mesh.indices.length,
      limits.maxIndicesPerMesh,
    );
  }

  for (const group of project.physicsGroups) {
    assertLimit(
      `pendulums:${group.id}`,
      group.pendulums.length,
      limits.maxPendulumsPerPhysicsGroup,
    );
  }

  for (const machine of project.stateMachines) {
    assertLimit(
      `states:${machine.id}`,
      machine.states.length,
      limits.maxStatesPerStateMachine,
    );
    assertLimit(
      `transitions:${machine.id}`,
      machine.transitions.length,
      limits.maxTransitionsPerStateMachine,
    );
  }
}

function validateRuntimeTextureBindings(fileData: ViviFileData): void {
  const allLayers = flattenLayers(fileData.project.layers);
  const meshIds = new Set(
    allLayers
      .filter((layer) => layer.kind === "viviMesh")
      .map((layer) => layer.id),
  );
  const mappedMeshIds = new Set<string>();

  for (let atlasIndex = 0; atlasIndex < fileData.atlases.length; atlasIndex += 1) {
    const atlas = fileData.atlases[atlasIndex]!;
    for (const entry of atlas.entries) {
      if (!meshIds.has(entry.layerId)) {
        throw runtimeError(
          VIVI_RUNTIME_ERROR_CODES.texture,
          `atlas:${atlasIndex} references unknown mesh layer: ${entry.layerId}`,
        );
      }
      if (mappedMeshIds.has(entry.layerId)) {
        throw runtimeError(
          VIVI_RUNTIME_ERROR_CODES.texture,
          `mesh layer has duplicate runtime atlas entries: ${entry.layerId}`,
        );
      }
      mappedMeshIds.add(entry.layerId);
    }
  }

  for (const meshId of meshIds) {
    if (!mappedMeshIds.has(meshId)) {
      throw runtimeError(
        VIVI_RUNTIME_ERROR_CODES.texture,
        `mesh layer has no runtime atlas entry: ${meshId}`,
      );
    }
  }
}

function normalizeRuntimeModelOptions(
  project: ProjectData,
  options?: RuntimeModelOptions,
): RuntimeModelOptions | undefined {
  if (options?.initialParameters === undefined) return options;
  try {
    return {
      ...options,
      initialParameters: mergeParameterDefaults(
        project.parameters ?? [],
        options.initialParameters,
        { allowUnknown: false, clampKnown: true, rejectInvalid: true },
      ),
    };
  } catch (error) {
    if (error instanceof TypeError) {
      throw runtimeError(
        VIVI_RUNTIME_ERROR_CODES.invalidArgument,
        error.message,
        error,
      );
    }
    throw error;
  }
}

export class RuntimeModel {
  readonly #model: PublicViviModel;
  readonly #textures: RuntimeTextureInfo[];
  readonly #atlasByTextureId: ReadonlyMap<string, AtlasData>;
  readonly #textureIdByMeshId: ReadonlyMap<string, string>;
  #disposed = false;
  #inCall = false;

  private constructor(model: PublicViviModel) {
    this.#model = model;
    this.#textures = model.atlases.map(createTextureInfo).map(freezeTextureInfo);
    const textureIdsByMeshId = new Map<string, string>();
    for (let index = 0; index < model.atlases.length; index += 1) {
      const textureId = `atlas:${index}`;
      for (const entry of model.atlases[index]!.entries) {
        textureIdsByMeshId.set(entry.layerId, textureId);
      }
    }
    this.#atlasByTextureId = new Map(
      this.#textures.map((texture, index) => [
        texture.id,
        model.atlases[index]!,
      ]),
    );
    this.#textureIdByMeshId = textureIdsByMeshId;
  }

  static fromFileData(
    fileData: ViviFileData,
    options?: RuntimeModelOptions,
  ): RuntimeModel {
    if (!isRecord(fileData)) {
      throw runtimeError(
        VIVI_RUNTIME_ERROR_CODES.validation,
        "runtime payload must be an object",
      );
    }

    try {
      const runtimeProfile = (fileData as { profile?: unknown }).profile;
      if (runtimeProfile !== PUBLIC_PROJECT_PROFILE) {
        if (
          typeof runtimeProfile === "string" &&
          runtimeProfile.startsWith("publicProfile")
        ) {
          throw runtimeError(
            VIVI_RUNTIME_ERROR_CODES.unsupportedSpecVersion,
            `unsupported runtime public profile: ${runtimeProfile}`,
          );
        }
        throw runtimeError(
          VIVI_RUNTIME_ERROR_CODES.privateProfile,
          `runtime payload must use ${PUBLIC_PROJECT_PROFILE}`,
        );
      }
      if (fileData.version !== VIVI_RUNTIME_PROJECT_FILE_VERSION) {
        throw runtimeError(
          VIVI_RUNTIME_ERROR_CODES.unsupportedSpecVersion,
          `unsupported runtime project version: ${String(fileData.version)}`,
        );
      }

      assertPublicRawViviFileProfile(fileData);
      // Serialization is used for both byte-limit accounting and clone isolation.
      const payloadJson = JSON.stringify(fileData);
      const limits = resolveRuntimeLimits(options);
      const maxPayloadBytes = limits.maxPayloadBytes;
      if (utf8ByteLength(payloadJson) > maxPayloadBytes) {
        throw runtimeError(
          VIVI_RUNTIME_ERROR_CODES.limitExceeded,
          `runtime payload exceeds ${maxPayloadBytes} bytes`,
        );
      }
      const clonedFileData = JSON.parse(payloadJson) as ViviFileData;
      validateRuntimeLimits(clonedFileData, limits);
      assertPublicViviFileProfile(clonedFileData);
      validateRuntimeTextureBindings(clonedFileData);
      const runtimeOptions = normalizeRuntimeModelOptions(
        clonedFileData.project,
        options,
      );
      return new RuntimeModel(
        PublicViviModel.fromFileData(clonedFileData, runtimeOptions),
      );
    } catch (error) {
      if (error instanceof ViviRuntimeError) throw error;
      if (error instanceof PublicProfileError) {
        throw runtimeError(
          VIVI_RUNTIME_ERROR_CODES.privateProfile,
          error.message,
          error,
        );
      }
      throw runtimeError(
        VIVI_RUNTIME_ERROR_CODES.validation,
        "invalid runtime model data",
        error,
      );
    }
  }

  static fromJSON(json: string, options?: RuntimeModelOptions): RuntimeModel {
    const maxPayloadBytes = resolveRuntimeLimits(options).maxPayloadBytes;
    if (utf8ByteLength(json) > maxPayloadBytes) {
      throw runtimeError(
        VIVI_RUNTIME_ERROR_CODES.limitExceeded,
        `runtime payload exceeds ${maxPayloadBytes} bytes`,
      );
    }
    try {
      return RuntimeModel.fromFileData(JSON.parse(json) as ViviFileData, options);
    } catch (error) {
      if (error instanceof ViviRuntimeError) throw error;
      if (error instanceof PublicProfileError) {
        throw runtimeError(
          VIVI_RUNTIME_ERROR_CODES.privateProfile,
          error.message,
          error,
        );
      }
      throw runtimeError(
        VIVI_RUNTIME_ERROR_CODES.parse,
        "failed to parse runtime model",
        error,
      );
    }
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
    return { min: VIVI_RUNTIME_SPEC_V1_VERSION, max: VIVI_RUNTIME_SPEC_VERSION };
  }

  getRuntimeVersion(): RuntimeVersion {
    this.#assertUsable();
    return VIVI_RUNTIME_SPEC_VERSION;
  }

  get width(): number {
    this.#assertUsable();
    return this.#model.width;
  }

  get height(): number {
    this.#assertUsable();
    return this.#model.height;
  }

  setInput(id: string, value: number): void {
    this.#withModelCall(() => {
      assertFiniteNumber(value, "input value");
      const parameter = this.#model.project.parameters.find((p) => p.id === id);
      if (!parameter) {
        throw runtimeError(
          VIVI_RUNTIME_ERROR_CODES.invalidArgument,
          `unknown runtime input: ${id}`,
        );
      }
      this.#model.setParameter(id, value);
    });
  }

  getParameterValue(id: string): number | null {
    this.#assertUsable();
    if (!this.#model.project.parameters.some((p) => p.id === id)) return null;
    return this.#model.parameterValues[id] ?? null;
  }

  getParameters(): readonly RuntimeParameterInfo[] {
    this.#assertUsable();
    return Object.freeze(
      this.#model.project.parameters.map((parameter) =>
        Object.freeze({
          id: parameter.id,
          min: parameter.minValue,
          max: parameter.maxValue,
          defaultValue: parameter.defaultValue,
          currentValue:
            this.#model.parameterValues[parameter.id] ?? parameter.defaultValue,
        }),
      ),
    );
  }

  getTextures(): readonly RuntimeTextureInfo[] {
    this.#assertUsable();
    return Object.freeze([...this.#textures]);
  }

  getTextureData(id: string): RuntimeTextureData | null {
    this.#assertUsable();
    const texture = this.#textures.find((item) => item.id === id);
    if (!texture) return null;
    const atlas = this.#atlasByTextureId.get(id);
    if (!atlas) return null;
    return Object.freeze({
      info: texture,
      pixels: null,
      hostImageId: atlas.image,
      pixelByteLength: 0,
      rowStride: 0,
    });
  }

  getExpressionPresets(): readonly RuntimeExpressionPresetInfo[] {
    this.#assertUsable();
    return Object.freeze(
      (this.#model.project.expressionPresets ?? []).map((preset) =>
        Object.freeze({
          id: preset.id,
          name: preset.name,
          parameterValues: Object.freeze({ ...preset.values }),
          color: preset.color ?? null,
          hotkey: preset.hotkey === undefined ? null : String(preset.hotkey),
        }),
      ),
    );
  }

  applyExpressionPreset(id: string): void {
    this.#withModelCall(() => {
      const preset = this.#model.project.expressionPresets?.find((p) => p.id === id);
      if (!preset) {
        throw runtimeError(
          VIVI_RUNTIME_ERROR_CODES.invalidArgument,
          `unknown expression preset: ${id}`,
        );
      }
      this.#model.applyExpressionPreset(id);
    });
  }

  update(deltaSeconds = 0): void {
    this.#withModelCall(() => {
      assertFiniteNumber(deltaSeconds, "deltaSeconds");
      if (deltaSeconds < 0) {
        throw runtimeError(
          VIVI_RUNTIME_ERROR_CODES.invalidArgument,
          "deltaSeconds must be non-negative",
        );
      }
      const clampedDelta = Math.min(
        deltaSeconds,
        VIVI_RUNTIME_TIMING.maxDeltaSeconds,
      );
      const snapshot = this.#model.createRuntimeSnapshot();
      try {
        this.#model.update(clampedDelta);
      } catch (error) {
        this.#model.restoreRuntimeSnapshot(snapshot);
        throw runtimeError(
          VIVI_RUNTIME_ERROR_CODES.evaluation,
          "runtime update failed",
          error,
        );
      }
    });
  }

  getRenderList(): readonly RuntimeMeshSnapshot[] {
    this.#assertUsable();
    return Object.freeze(this.#model.getDrawOrder().map((id) => {
      const snapshot = this.getMeshSnapshot(id);
      if (!snapshot) {
        throw runtimeError(
          VIVI_RUNTIME_ERROR_CODES.internal,
          `draw order references missing mesh state: ${id}`,
        );
      }
      return snapshot;
    }));
  }

  getMeshSnapshot(id: string): RuntimeMeshSnapshot | null {
    this.#assertUsable();
    const state = this.#model.getMeshState(id);
    if (!state) return null;
    return this.#toMeshSnapshot(state);
  }

  hitTest(x: number, y: number): RuntimeHitResult | null {
    return this.#withModelCall(() => {
      assertFiniteNumber(x, "x");
      assertFiniteNumber(y, "y");
      const result = hitTestColliders(
        this.#model.project.colliders,
        this.#model.getAllMeshStates(),
        x,
        y,
      );
      if (!result) return null;
      const meshId = result.meshId ?? null;
      return Object.freeze({
        colliderId: result.colliderId,
        layerId: meshId,
        meshId,
        x,
        y,
      });
    });
  }

  playClip(_id: string, _options?: RuntimePlayClipOptions): void {
    this.#assertUsable();
    throw runtimeError(
      VIVI_RUNTIME_ERROR_CODES.unsupportedOperation,
      "clip playback is not available in the current public runtime facade",
    );
  }

  stopClip(): void {
    this.#assertUsable();
    throw runtimeError(
      VIVI_RUNTIME_ERROR_CODES.unsupportedOperation,
      "clip playback is not available in the current public runtime facade",
    );
  }

  seekClip(_seconds: number): void {
    this.#assertUsable();
    throw runtimeError(
      VIVI_RUNTIME_ERROR_CODES.unsupportedOperation,
      "clip playback is not available in the current public runtime facade",
    );
  }

  getPlaybackState(): RuntimePlaybackState {
    this.#assertUsable();
    return { playing: false, clipId: null, timeSeconds: 0, loop: false };
  }

  setStateMachineState(_id: string, _stateId: string): void {
    this.#assertUsable();
    throw runtimeError(
      VIVI_RUNTIME_ERROR_CODES.unsupportedOperation,
      "state machines are not available in the current public runtime facade",
    );
  }

  getStateMachineState(_id: string): RuntimeStateMachineState | null {
    this.#assertUsable();
    return null;
  }

  dispose(): void {
    this.#disposed = true;
  }

  #toMeshSnapshot(state: MeshRenderState): RuntimeMeshSnapshot {
    const blendMode = toRuntimeBlendMode(state.blendMode);
    const textureId = this.#textureIdByMeshId.get(state.id);
    if (!textureId) {
      throw runtimeError(
        VIVI_RUNTIME_ERROR_CODES.internal,
        `mesh state has no validated runtime texture binding: ${state.id}`,
      );
    }
    return Object.freeze({
      id: state.id,
      textureId,
      vertices: new Float32Array(state.vertices),
      uvs: new Float32Array(state.uvs),
      indices: new Uint32Array(state.indices),
      x: state.x,
      y: state.y,
      opacity: state.opacity,
      visible: state.visible,
      culled: state.culled,
      blendMode,
      multiplyColor: toColorTuple(state.multiplyColor, 1),
      screenColor: toColorTuple(state.screenColor, 1),
      drawOrder: getDrawOrder(state.drawOrder),
    });
  }

  #assertUsable(): void {
    if (this.#disposed) {
      throw runtimeError(
        VIVI_RUNTIME_ERROR_CODES.invalidArgument,
        "runtime model has been disposed",
      );
    }
    if (this.#inCall) {
      throw runtimeError(
        VIVI_RUNTIME_ERROR_CODES.evaluation,
        "runtime model call is not reentrant",
      );
    }
  }

  #withModelCall<T>(callback: () => T): T {
    this.#assertUsable();
    this.#inCall = true;
    try {
      return callback();
    } finally {
      this.#inCall = false;
    }
  }
}

export const ViviRuntime = Object.freeze({
  load(fileData: ViviFileData, options?: RuntimeModelOptions): RuntimeModel {
    return RuntimeModel.fromFileData(fileData, options);
  },

  parse(json: string, options?: RuntimeModelOptions): RuntimeModel {
    return RuntimeModel.fromJSON(json, options);
  },
});
