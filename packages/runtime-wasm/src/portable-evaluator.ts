import {
  PUBLIC_PROJECT_PROFILE,
  PublicProfileError,
  VIVI_RUNTIME_ERROR_CODES,
  VIVI_RUNTIME_LIMITS,
  VIVI_RUNTIME_PROJECT_FILE_VERSION,
  VIVI_RUNTIME_SPEC_V1_VERSION,
  VIVI_RUNTIME_SPEC_VERSION,
  VIVI_RUNTIME_TIMING,
  ViviRuntimeError,
  assertPublicRawViviFileProfile,
  assertPublicViviFileProfile,
  type AtlasData,
  type BlendMode,
  type LayerNode,
  type MeshRenderState,
  type PendulumState,
  type ProjectData,
  type RuntimeExpressionPresetInfo,
  type RuntimeHitResult,
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
  type ViviRuntimeErrorCode,
} from "@vivi2d/core";
import {
  applyRuntimeBoneOverridesToLayers,
  evaluateRuntimeBindings,
} from "./kernel/bindings";
import { computeRuntimeBoneWorldTransforms } from "./kernel/bone";
import { buildRuntimeStaticCaches } from "./kernel/caches";
import { hitTestRuntimeColliders } from "./kernel/collider";
import { getRuntimeDrawOrder } from "./kernel/colors";
import { flattenRuntimeLayers } from "./kernel/layers";
import { runRuntimeIKStep } from "./kernel/ik";
import { computeRuntimeMeshStates } from "./kernel/mesh";
import { mergeRuntimeParameterDefaults } from "./kernel/parameters";
import { runRuntimePhysicsStep } from "./kernel/physics";
import { createRuntimePhysicsState } from "./kernel/physics-engine";

type RuntimeLimits = Record<keyof typeof VIVI_RUNTIME_LIMITS, number>;

interface NormalizedPortablePayload {
  readonly fileData: ViviFileData;
  readonly specVersion: RuntimeVersion;
}

interface PortableRuntimeSnapshot {
  readonly parameterValues: Record<string, number>;
  readonly prevParamValues: Record<string, number>;
  readonly boneX: Record<string, number>;
  readonly boneY: Record<string, number>;
  readonly boneAngles: Record<string, number>;
  readonly boneScaleX: Record<string, number>;
  readonly boneScaleY: Record<string, number>;
  readonly ikTargetX: Record<string, number>;
  readonly ikTargetY: Record<string, number>;
  readonly ikPoleTargetX: Record<string, number>;
  readonly ikPoleTargetY: Record<string, number>;
  readonly ikInfluence: Record<string, number>;
  readonly physicsStates: Map<string, PendulumState[]>;
  readonly physicsAccumulators: Map<string, number>;
  readonly meshScratchVerts: Map<string, Float32Array>;
  readonly meshStates: Map<string, MeshRenderState>;
  readonly drawOrderCache: readonly string[];
  readonly boneLayers: Map<
    string,
    {
      readonly x: number;
      readonly y: number;
      readonly angle: number;
      readonly scaleX: number;
      readonly scaleY: number;
    }
  >;
}

function runtimeError(
  code: ViviRuntimeErrorCode,
  message: string,
  cause?: unknown,
): ViviRuntimeError {
  return new ViviRuntimeError(code, message, cause);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isObjectLike(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

function assertAcyclicRuntimePayload(value: object): void {
  const visited = new WeakSet<object>();
  const ancestors = new WeakSet<object>();
  const stack: Array<{ readonly value: object; readonly exiting: boolean }> = [
    { value, exiting: false },
  ];

  while (stack.length > 0) {
    const frame = stack.pop()!;
    const current = frame.value;
    if (frame.exiting) {
      ancestors.delete(current);
      visited.add(current);
      continue;
    }
    if (ancestors.has(current)) {
      throw runtimeError(
        VIVI_RUNTIME_ERROR_CODES.validation,
        "runtime payload contains cyclic object references",
      );
    }
    if (visited.has(current)) continue;

    ancestors.add(current);
    stack.push({ value: current, exiting: true });
    for (const descriptor of Object.values(
      Object.getOwnPropertyDescriptors(current),
    )) {
      if (!("value" in descriptor)) continue;
      if (isObjectLike(descriptor.value)) {
        stack.push({ value: descriptor.value, exiting: false });
      }
    }
  }
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

function clampLimitOverride(key: string, value: number): number {
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

function cloneRuntimeVersion(version: RuntimeVersion): RuntimeVersion {
  return Object.freeze({
    major: version.major,
    minor: version.minor,
    patch: version.patch,
  });
}

function resolvePortablePayloadSpecVersion(fileData: ViviFileData): RuntimeVersion {
  const isRuntimeSpecV1Payload =
    fileData.profile === PUBLIC_PROJECT_PROFILE &&
    fileData.version === VIVI_RUNTIME_PROJECT_FILE_VERSION;
  if (!isRuntimeSpecV1Payload) {
    throw runtimeError(
      VIVI_RUNTIME_ERROR_CODES.unsupportedSpecVersion,
      `unsupported runtime payload version: ${String(fileData.version)}`,
    );
  }

  return cloneRuntimeVersion(VIVI_RUNTIME_SPEC_V1_VERSION);
}

function resolveRuntimeLimits(options?: RuntimeModelOptions): RuntimeLimits {
  const resolved: RuntimeLimits = { ...VIVI_RUNTIME_LIMITS };
  for (const [key, value] of Object.entries(options?.limits ?? {})) {
    if (value !== undefined) {
      (resolved as Record<string, number>)[key] = clampLimitOverride(key, value);
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

function assertLimit(label: string, actual: number, limit: number): void {
  if (actual > limit) {
    throw runtimeError(
      VIVI_RUNTIME_ERROR_CODES.limitExceeded,
      `${label} exceeds runtime limit: ${actual} > ${limit}`,
    );
  }
}

function validateRuntimeLimits(fileData: ViviFileData, limits: RuntimeLimits): void {
  const project = fileData.project;
  const allLayers = flattenRuntimeLayers(project.layers);
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
  const allLayers = flattenRuntimeLayers(fileData.project.layers);
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

function normalizePortablePayload(
  fileData: ViviFileData,
  options?: RuntimeModelOptions,
): NormalizedPortablePayload {
  if (!isRecord(fileData)) {
    throw runtimeError(
      VIVI_RUNTIME_ERROR_CODES.validation,
      "runtime payload must be an object",
    );
  }

  try {
    assertAcyclicRuntimePayload(fileData);
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
    const limits = resolveRuntimeLimits(options);
    const payloadJson = JSON.stringify(fileData);
    if (utf8ByteLength(payloadJson) > limits.maxPayloadBytes) {
      throw runtimeError(
        VIVI_RUNTIME_ERROR_CODES.limitExceeded,
        `runtime payload exceeds ${limits.maxPayloadBytes} bytes`,
      );
    }
    const clonedFileData = JSON.parse(payloadJson) as ViviFileData;
    validateRuntimeLimits(clonedFileData, limits);
    assertPublicViviFileProfile(clonedFileData);
    validateRuntimeTextureBindings(clonedFileData);
    return {
      fileData: clonedFileData,
      specVersion: resolvePortablePayloadSpecVersion(clonedFileData),
    };
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
  return Object.freeze({
    id: `atlas:${index}`,
    width: atlas.width,
    height: atlas.height,
    format: "rgba8-straight",
    colorSpace: "srgb",
    source: "hostImage",
  });
}

function clonePhysicsStates(
  states: ReadonlyMap<string, PendulumState[]>,
): Map<string, PendulumState[]> {
  const clone = new Map<string, PendulumState[]>();
  for (const [id, pendulums] of states) {
    clone.set(
      id,
      pendulums.map((state) => ({
        angle: state.angle,
        angularVelocity: state.angularVelocity,
      })),
    );
  }
  return clone;
}

function cloneFloat32Map(
  values: ReadonlyMap<string, Float32Array>,
): Map<string, Float32Array> {
  const clone = new Map<string, Float32Array>();
  for (const [id, value] of values) {
    clone.set(id, new Float32Array(value));
  }
  return clone;
}

function cloneMeshStates(
  states: ReadonlyMap<string, MeshRenderState>,
): Map<string, MeshRenderState> {
  const clone = new Map<string, MeshRenderState>();
  for (const [id, state] of states) {
    clone.set(id, {
      ...state,
      vertices: new Float32Array(state.vertices),
      uvs: new Float32Array(state.uvs),
      indices: new Uint32Array(state.indices),
      multiplyColor: { ...state.multiplyColor },
      screenColor: state.screenColor ? { ...state.screenColor } : undefined,
    });
  }
  return clone;
}

function replaceRecord(
  target: Record<string, number>,
  source: Record<string, number>,
): void {
  for (const key of Object.keys(target)) {
    delete target[key];
  }
  Object.assign(target, source);
}

function replaceMap<K, V>(target: Map<K, V>, source: ReadonlyMap<K, V>): void {
  target.clear();
  for (const [key, value] of source) {
    target.set(key, value);
  }
}

export class PortableRuntimeModel {
  readonly #project: ProjectData;
  readonly #atlases: ViviFileData["atlases"];
  readonly #specVersion: RuntimeVersion;
  readonly #parameterValues: Record<string, number>;
  readonly #allLayers: LayerNode[];
  readonly #textures: readonly RuntimeTextureInfo[];
  readonly #atlasByTextureId: ReadonlyMap<string, AtlasData>;
  readonly #textureIdByMeshId: ReadonlyMap<string, string>;
  readonly #boneBaseX: Record<string, number> = {};
  readonly #boneBaseY: Record<string, number> = {};
  #boneX: Record<string, number> = {};
  #boneY: Record<string, number> = {};
  #boneAngles: Record<string, number> = {};
  #boneScaleX: Record<string, number> = {};
  #boneScaleY: Record<string, number> = {};
  #ikTargetX: Record<string, number> = {};
  #ikTargetY: Record<string, number> = {};
  #ikPoleTargetX: Record<string, number> = {};
  #ikPoleTargetY: Record<string, number> = {};
  #ikInfluence: Record<string, number> = {};
  #meshStaticCache = new Map<string, { uvs: Float32Array; indices: Uint32Array }>();
  #boneLengths = new Map<string, number>();
  #meshStates = new Map<string, MeshRenderState>();
  #drawOrderScratch: { id: string; zIndex: number }[] = [];
  #drawOrderCache: string[] = [];
  #meshScratchVerts = new Map<string, Float32Array>();
  #physicsStates = new Map<string, PendulumState[]>();
  #physicsAccumulators = new Map<string, number>();
  #prevParamValues: Record<string, number> = {};
  #disposed = false;
  #inCall = false;

  private constructor(
    payload: NormalizedPortablePayload,
    options?: RuntimeModelOptions,
  ) {
    const { fileData } = payload;
    this.#project = fileData.project;
    this.#atlases = fileData.atlases;
    this.#specVersion = payload.specVersion;
    this.#allLayers = flattenRuntimeLayers(this.#project.layers);
    this.#parameterValues = mergeRuntimeParameterDefaults(
      this.#project.parameters,
      options?.initialParameters ?? {},
      {
        onInvalid: (id) => {
          throw runtimeError(
            VIVI_RUNTIME_ERROR_CODES.invalidArgument,
            `initial parameter must be finite: ${id}`,
          );
        },
      },
    );
    this.#textures = this.#atlases.map(createTextureInfo);

    const textureIdsByMeshId = new Map<string, string>();
    for (let index = 0; index < this.#atlases.length; index += 1) {
      const textureId = `atlas:${index}`;
      for (const entry of this.#atlases[index]!.entries) {
        textureIdsByMeshId.set(entry.layerId, textureId);
      }
    }
    this.#atlasByTextureId = new Map(
      this.#textures.map((texture, index) => [texture.id, this.#atlases[index]!]),
    );
    this.#textureIdByMeshId = textureIdsByMeshId;

    for (const layer of this.#allLayers) {
      if (layer.kind !== "bone") continue;
      this.#boneBaseX[layer.id] = layer.x;
      this.#boneBaseY[layer.id] = layer.y;
    }

    const caches = buildRuntimeStaticCaches(this.#allLayers);
    this.#meshStaticCache = caches.meshStaticCache;
    this.#boneLengths = caches.boneLengths;
    this.#meshScratchVerts = caches.meshScratchVerts;

    for (const group of this.#project.physicsGroups) {
      if (!group.enabled) continue;
      this.#physicsStates.set(group.id, createRuntimePhysicsState(group));
      this.#physicsAccumulators.set(group.id, 0);
    }
    this.#prevParamValues = { ...this.#parameterValues };
    this.#evaluate(0);
  }

  static fromFileData(
    fileData: ViviFileData,
    options?: RuntimeModelOptions,
  ): PortableRuntimeModel {
    return new PortableRuntimeModel(normalizePortablePayload(fileData, options), options);
  }

  static fromJSON(json: string, options?: RuntimeModelOptions): PortableRuntimeModel {
    const maxPayloadBytes = resolveRuntimeLimits(options).maxPayloadBytes;
    if (utf8ByteLength(json) > maxPayloadBytes) {
      throw runtimeError(
        VIVI_RUNTIME_ERROR_CODES.limitExceeded,
        `runtime payload exceeds ${maxPayloadBytes} bytes`,
      );
    }
    try {
      return PortableRuntimeModel.fromFileData(JSON.parse(json) as ViviFileData, options);
    } catch (error) {
      if (error instanceof ViviRuntimeError) throw error;
      throw runtimeError(
        VIVI_RUNTIME_ERROR_CODES.parse,
        "failed to parse runtime model",
        error,
      );
    }
  }

  getSpecVersion(): RuntimeVersion {
    this.#assertUsable();
    return cloneRuntimeVersion(this.#specVersion);
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
    return this.#project.width;
  }

  get height(): number {
    this.#assertUsable();
    return this.#project.height;
  }

  setInput(id: string, value: number): void {
    this.#withModelCall(() => {
      assertFiniteNumber(value, "input value");
      this.#setParameter(id, value);
    });
  }

  getParameterValue(id: string): number | null {
    this.#assertUsable();
    if (!this.#project.parameters.some((parameter) => parameter.id === id)) {
      return null;
    }
    return this.#parameterValues[id] ?? null;
  }

  getParameters(): readonly RuntimeParameterInfo[] {
    this.#assertUsable();
    return Object.freeze(
      this.#project.parameters.map((parameter) =>
        Object.freeze({
          id: parameter.id,
          min: parameter.minValue,
          max: parameter.maxValue,
          defaultValue: parameter.defaultValue,
          currentValue:
            this.#parameterValues[parameter.id] ?? parameter.defaultValue,
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
      (this.#project.expressionPresets ?? []).map((preset) =>
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
      const preset = this.#project.expressionPresets?.find((item) => item.id === id);
      if (!preset) {
        throw runtimeError(
          VIVI_RUNTIME_ERROR_CODES.invalidArgument,
          `unknown expression preset: ${id}`,
        );
      }
      for (const [parameterId, value] of Object.entries(preset.values)) {
        this.#setParameter(parameterId, value, { requireKnown: false });
      }
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
      const snapshot = this.#createSnapshot();
      try {
        this.#evaluate(clampedDelta);
      } catch (error) {
        this.#restoreSnapshot(snapshot);
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
    return Object.freeze(
      this.#drawOrderCache.map((id) => {
        const snapshot = this.getMeshSnapshot(id);
        if (!snapshot) {
          throw runtimeError(
            VIVI_RUNTIME_ERROR_CODES.internal,
            `draw order references missing mesh state: ${id}`,
          );
        }
        return snapshot;
      }),
    );
  }

  getMeshSnapshot(id: string): RuntimeMeshSnapshot | null {
    this.#assertUsable();
    const state = this.#meshStates.get(id);
    if (!state) return null;
    return this.#toMeshSnapshot(state);
  }

  hitTest(x: number, y: number): RuntimeHitResult | null {
    return this.#withModelCall(() => {
      assertFiniteNumber(x, "x");
      assertFiniteNumber(y, "y");
      const result = hitTestRuntimeColliders(
        this.#project.colliders,
        this.#meshStates,
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

  #setParameter(
    id: string,
    value: number,
    options: { requireKnown?: boolean } = {},
  ): void {
    const definition = this.#project.parameters.find((parameter) => parameter.id === id);
    if (!definition) {
      if (options.requireKnown === false) return;
      throw runtimeError(
        VIVI_RUNTIME_ERROR_CODES.invalidArgument,
        `unknown runtime input: ${id}`,
      );
    }
    this.#parameterValues[id] = Math.max(
      definition.minValue,
      Math.min(definition.maxValue, value),
    );
  }

  #evaluate(deltaSeconds: number): void {
    this.#evaluateParameterBindings();
    if (deltaSeconds > 0) {
      runRuntimePhysicsStep(
        {
          project: this.#project,
          parameterValues: this.#parameterValues,
          prevParamValues: this.#prevParamValues,
          physicsStates: this.#physicsStates,
          physicsAccumulators: this.#physicsAccumulators,
          boneAngles: this.#boneAngles,
        },
        deltaSeconds,
      );
    }
    runRuntimeIKStep({
      project: this.#project,
      boneLengths: this.#boneLengths,
      boneAngles: this.#boneAngles,
      boneX: this.#boneX,
      boneY: this.#boneY,
      boneScaleX: this.#boneScaleX,
      boneScaleY: this.#boneScaleY,
      ikTargetX: this.#ikTargetX,
      ikTargetY: this.#ikTargetY,
      ikPoleTargetX: this.#ikPoleTargetX,
      ikPoleTargetY: this.#ikPoleTargetY,
      ikInfluence: this.#ikInfluence,
    });
    applyRuntimeBoneOverridesToLayers(
      this.#allLayers,
      this.#boneX,
      this.#boneY,
      this.#boneAngles,
      this.#boneScaleX,
      this.#boneScaleY,
    );
    const worldTransforms = computeRuntimeBoneWorldTransforms(this.#project.layers);
    computeRuntimeMeshStates({
      project: this.#project,
      allLayers: this.#allLayers,
      meshStaticCache: this.#meshStaticCache,
      meshScratchVerts: this.#meshScratchVerts,
      meshStates: this.#meshStates,
      drawOrderScratch: this.#drawOrderScratch,
      drawOrderCache: this.#drawOrderCache,
      worldTransforms,
    });
    this.#prevParamValues = { ...this.#parameterValues };
  }

  #evaluateParameterBindings(): void {
    const result = evaluateRuntimeBindings(
      this.#project.parameterBindings,
      this.#parameterValues,
      this.#project,
      {
        boneX: this.#boneX,
        boneY: this.#boneY,
        boneAngles: this.#boneAngles,
        boneScaleX: this.#boneScaleX,
        boneScaleY: this.#boneScaleY,
        ikTargetX: this.#ikTargetX,
        ikTargetY: this.#ikTargetY,
        ikPoleTargetX: this.#ikPoleTargetX,
        ikPoleTargetY: this.#ikPoleTargetY,
        ikInfluence: this.#ikInfluence,
      },
      {
        boneX: this.#boneBaseX,
        boneY: this.#boneBaseY,
      },
    );
    if (result.unchanged) return;
    this.#boneX = result.boneX;
    this.#boneY = result.boneY;
    this.#boneAngles = result.boneAngles;
    this.#boneScaleX = result.boneScaleX;
    this.#boneScaleY = result.boneScaleY;
    this.#ikTargetX = result.ikTargetX;
    this.#ikTargetY = result.ikTargetY;
    this.#ikPoleTargetX = result.ikPoleTargetX;
    this.#ikPoleTargetY = result.ikPoleTargetY;
    this.#ikInfluence = result.ikInfluence;
  }

  #createSnapshot(): PortableRuntimeSnapshot {
    const boneLayers = new Map<
      string,
      {
        x: number;
        y: number;
        angle: number;
        scaleX: number;
        scaleY: number;
      }
    >();
    for (const layer of this.#allLayers) {
      if (layer.kind !== "bone") continue;
      boneLayers.set(layer.id, {
        x: layer.x,
        y: layer.y,
        angle: layer.bone.angle,
        scaleX: layer.bone.scaleX,
        scaleY: layer.bone.scaleY,
      });
    }

    return {
      parameterValues: { ...this.#parameterValues },
      prevParamValues: { ...this.#prevParamValues },
      boneX: { ...this.#boneX },
      boneY: { ...this.#boneY },
      boneAngles: { ...this.#boneAngles },
      boneScaleX: { ...this.#boneScaleX },
      boneScaleY: { ...this.#boneScaleY },
      ikTargetX: { ...this.#ikTargetX },
      ikTargetY: { ...this.#ikTargetY },
      ikPoleTargetX: { ...this.#ikPoleTargetX },
      ikPoleTargetY: { ...this.#ikPoleTargetY },
      ikInfluence: { ...this.#ikInfluence },
      physicsStates: clonePhysicsStates(this.#physicsStates),
      physicsAccumulators: new Map(this.#physicsAccumulators),
      meshScratchVerts: cloneFloat32Map(this.#meshScratchVerts),
      meshStates: cloneMeshStates(this.#meshStates),
      drawOrderCache: [...this.#drawOrderCache],
      boneLayers,
    };
  }

  #restoreSnapshot(snapshot: PortableRuntimeSnapshot): void {
    replaceRecord(this.#parameterValues, snapshot.parameterValues);
    this.#prevParamValues = { ...snapshot.prevParamValues };
    this.#boneX = { ...snapshot.boneX };
    this.#boneY = { ...snapshot.boneY };
    this.#boneAngles = { ...snapshot.boneAngles };
    this.#boneScaleX = { ...snapshot.boneScaleX };
    this.#boneScaleY = { ...snapshot.boneScaleY };
    this.#ikTargetX = { ...snapshot.ikTargetX };
    this.#ikTargetY = { ...snapshot.ikTargetY };
    this.#ikPoleTargetX = { ...snapshot.ikPoleTargetX };
    this.#ikPoleTargetY = { ...snapshot.ikPoleTargetY };
    this.#ikInfluence = { ...snapshot.ikInfluence };
    replaceMap(this.#physicsStates, clonePhysicsStates(snapshot.physicsStates));
    replaceMap(this.#physicsAccumulators, new Map(snapshot.physicsAccumulators));
    replaceMap(this.#meshScratchVerts, cloneFloat32Map(snapshot.meshScratchVerts));
    replaceMap(this.#meshStates, cloneMeshStates(snapshot.meshStates));
    this.#drawOrderCache.length = 0;
    this.#drawOrderCache.push(...snapshot.drawOrderCache);

    for (const layer of this.#allLayers) {
      if (layer.kind !== "bone") continue;
      const bone = snapshot.boneLayers.get(layer.id);
      if (!bone) continue;
      layer.x = bone.x;
      layer.y = bone.y;
      layer.bone.angle = bone.angle;
      layer.bone.scaleX = bone.scaleX;
      layer.bone.scaleY = bone.scaleY;
    }
  }

  #toMeshSnapshot(state: MeshRenderState): RuntimeMeshSnapshot {
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
      blendMode: toRuntimeBlendMode(state.blendMode),
      multiplyColor: toColorTuple(state.multiplyColor, 1),
      screenColor: toColorTuple(state.screenColor, 1),
      drawOrder: getRuntimeDrawOrder(state.drawOrder),
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
