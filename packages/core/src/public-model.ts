import { hitTestColliders, hitTestCollidersAll } from "./collider";
import type { Affine2D } from "./bone-utils";
import { computeBoneWorldTransforms } from "./bone-utils";
import { getDrawOrder, getMultiplyColor, isScreenColorDefault } from "./color-utils";
import { isPolygonFlipped } from "./culling-utils";
import { flattenLayers, isLayerEffectivelyVisible } from "./layer-utils";
import { meshDataToTypedArrays } from "./mesh-utils";
import { runIKStep } from "./model/ik-step";
import { runPhysicsStep } from "./model/physics-step";
import { evaluateBindingsAdditive } from "./parameter-binding-eval";
import { mergeParameterDefaults } from "./parameter-utils";
import { createPhysicsRuntimeState } from "./physics-engine";
import { parseViviFile } from "./project-parser";
import { VIVI_RUNTIME_ALLOWED_BINDING_TARGET_TYPES } from "./runtime-spec";
import { computeSkinnedVertices } from "./skin-utils";
import type {
  BoneBindingPropertyType,
  ColliderHitResult,
  IKControllerBindingPropertyType,
  LayerNode,
  MeshRenderState,
  PendulumState,
  ProjectData,
  ViviFileData,
} from "./types";

export type { MeshRenderState } from "./types";

export interface PublicViviModelOptions {
  initialParameters?: Record<string, number>;
}

interface MeshStaticCache {
  uvs: Float32Array;
  indices: Uint32Array;
}

const PUBLIC_BINDING_TARGET_TYPES = new Set<string>(
  VIVI_RUNTIME_ALLOWED_BINDING_TARGET_TYPES,
);

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

function replaceRecord(target: Record<string, number>, source: Record<string, number>) {
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

interface BoneLayerRuntimeSnapshot {
  x: number;
  y: number;
  angle: number;
  scaleX: number;
  scaleY: number;
}

export interface PublicViviModelRuntimeSnapshot {
  parameterValues: Record<string, number>;
  prevParamValues: Record<string, number>;
  boneX: Record<string, number>;
  boneY: Record<string, number>;
  boneAngles: Record<string, number>;
  boneScaleX: Record<string, number>;
  boneScaleY: Record<string, number>;
  ikTargetX: Record<string, number>;
  ikTargetY: Record<string, number>;
  ikPoleTargetX: Record<string, number>;
  ikPoleTargetY: Record<string, number>;
  ikInfluence: Record<string, number>;
  physicsStates: Map<string, PendulumState[]>;
  physicsAccumulators: Map<string, number>;
  meshScratchVerts: Map<string, Float32Array>;
  meshStates: Map<string, MeshRenderState>;
  drawOrderCache: string[];
  boneLayers: Map<string, BoneLayerRuntimeSnapshot>;
}

export class PublicViviModel {
  readonly project: ProjectData;
  readonly atlases: ViviFileData["atlases"];
  readonly parameterValues: Record<string, number>;

  private allLayers: LayerNode[];
  private meshStaticCache: Map<string, MeshStaticCache> = new Map();
  private meshScratchVerts: Map<string, Float32Array> = new Map();
  private meshStates: Map<string, MeshRenderState> = new Map();
  private drawOrderScratch: { id: string; zIndex: number }[] = [];
  private drawOrderCache: string[] = [];
  private boneLengths: Map<string, number> = new Map();
  private boneBaseX: Record<string, number> = {};
  private boneBaseY: Record<string, number> = {};
  private boneX: Record<string, number> = {};
  private boneY: Record<string, number> = {};
  private boneAngles: Record<string, number> = {};
  private boneScaleX: Record<string, number> = {};
  private boneScaleY: Record<string, number> = {};
  private ikTargetX: Record<string, number> = {};
  private ikTargetY: Record<string, number> = {};
  private ikPoleTargetX: Record<string, number> = {};
  private ikPoleTargetY: Record<string, number> = {};
  private ikInfluence: Record<string, number> = {};
  private physicsStates: Map<string, PendulumState[]> = new Map();
  private physicsAccumulators: Map<string, number> = new Map();
  private prevParamValues: Record<string, number> = {};

  private constructor(
    project: ProjectData,
    atlases: ViviFileData["atlases"],
    options?: PublicViviModelOptions,
  ) {
    this.project = project;
    this.atlases = atlases;
    this.allLayers = flattenLayers(project.layers ?? []);
    this.parameterValues = mergeParameterDefaults(
      project.parameters ?? [],
      options?.initialParameters ?? {},
    );
    this.rebuildStaticCaches();
    this.prevParamValues = { ...this.parameterValues };
    for (const group of project.physicsGroups ?? []) {
      if (!group.enabled) continue;
      this.physicsStates.set(group.id, createPhysicsRuntimeState(group));
      this.physicsAccumulators.set(group.id, 0);
    }
    this.update();
  }

  static fromJSON(json: string, options?: PublicViviModelOptions): PublicViviModel {
    const fileData = parseViviFile(json, { profile: "publicProfileV1" });
    return PublicViviModel.fromFileData(fileData, options);
  }

  static fromFileData(
    fileData: ViviFileData,
    options?: PublicViviModelOptions,
  ): PublicViviModel {
    return new PublicViviModel(fileData.project, fileData.atlases, options);
  }

  setParameter(id: string, value: number): void {
    const def = this.project.parameters.find((p) => p.id === id);
    if (!def) return;
    this.parameterValues[id] = Math.max(def.minValue, Math.min(def.maxValue, value));
  }

  setParameters(values: Record<string, number>): void {
    for (const [id, value] of Object.entries(values)) {
      this.setParameter(id, value);
    }
  }

  resetParameters(): void {
    for (const def of this.project.parameters) {
      this.parameterValues[def.id] = def.defaultValue;
    }
  }

  applyExpressionPreset(presetId: string): void {
    const preset = this.project.expressionPresets?.find((p) => p.id === presetId);
    if (!preset) return;
    this.setParameters(preset.values);
  }

  hitTest(worldX: number, worldY: number): ColliderHitResult | null {
    const colliders = this.project.colliders;
    if (!colliders || colliders.length === 0) return null;
    return hitTestColliders(colliders, this.meshStates, worldX, worldY);
  }

  hitTestAll(worldX: number, worldY: number): ColliderHitResult[] {
    const colliders = this.project.colliders;
    if (!colliders || colliders.length === 0) return [];
    return hitTestCollidersAll(colliders, this.meshStates, worldX, worldY);
  }

  update(deltaTime = 0): void {
    this.evaluatePublicParameterBindings();
    if (deltaTime > 0) {
      runPhysicsStep(
        {
          project: this.project,
          parameterValues: this.parameterValues,
          prevParamValues: this.prevParamValues,
          physicsStates: this.physicsStates,
          physicsAccumulators: this.physicsAccumulators,
          boneAngles: this.boneAngles,
        },
        deltaTime,
      );
    }
    runIKStep({
      project: this.project,
      boneLengths: this.boneLengths,
      boneAngles: this.boneAngles,
      boneX: this.boneX,
      boneY: this.boneY,
      boneScaleX: this.boneScaleX,
      boneScaleY: this.boneScaleY,
      ikTargetX: this.ikTargetX,
      ikTargetY: this.ikTargetY,
      ikPoleTargetX: this.ikPoleTargetX,
      ikPoleTargetY: this.ikPoleTargetY,
      ikInfluence: this.ikInfluence,
    });
    this.applyBoneOverrides();
    this.computeMeshStates();
    this.prevParamValues = { ...this.parameterValues };
  }

  createRuntimeSnapshot(): PublicViviModelRuntimeSnapshot {
    const boneLayers = new Map<string, BoneLayerRuntimeSnapshot>();
    for (const layer of this.allLayers) {
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
      parameterValues: { ...this.parameterValues },
      prevParamValues: { ...this.prevParamValues },
      boneX: { ...this.boneX },
      boneY: { ...this.boneY },
      boneAngles: { ...this.boneAngles },
      boneScaleX: { ...this.boneScaleX },
      boneScaleY: { ...this.boneScaleY },
      ikTargetX: { ...this.ikTargetX },
      ikTargetY: { ...this.ikTargetY },
      ikPoleTargetX: { ...this.ikPoleTargetX },
      ikPoleTargetY: { ...this.ikPoleTargetY },
      ikInfluence: { ...this.ikInfluence },
      physicsStates: clonePhysicsStates(this.physicsStates),
      physicsAccumulators: new Map(this.physicsAccumulators),
      meshScratchVerts: cloneFloat32Map(this.meshScratchVerts),
      meshStates: cloneMeshStates(this.meshStates),
      drawOrderCache: [...this.drawOrderCache],
      boneLayers,
    };
  }

  restoreRuntimeSnapshot(snapshot: PublicViviModelRuntimeSnapshot): void {
    const nextPhysicsStates = clonePhysicsStates(snapshot.physicsStates);
    const nextPhysicsAccumulators = new Map(snapshot.physicsAccumulators);
    const nextMeshScratchVerts = cloneFloat32Map(snapshot.meshScratchVerts);
    const nextMeshStates = cloneMeshStates(snapshot.meshStates);
    const nextDrawOrderCache = [...snapshot.drawOrderCache];
    const nextPrevParamValues = { ...snapshot.prevParamValues };
    const nextBoneX = { ...snapshot.boneX };
    const nextBoneY = { ...snapshot.boneY };
    const nextBoneAngles = { ...snapshot.boneAngles };
    const nextBoneScaleX = { ...snapshot.boneScaleX };
    const nextBoneScaleY = { ...snapshot.boneScaleY };
    const nextIkTargetX = { ...snapshot.ikTargetX };
    const nextIkTargetY = { ...snapshot.ikTargetY };
    const nextIkPoleTargetX = { ...snapshot.ikPoleTargetX };
    const nextIkPoleTargetY = { ...snapshot.ikPoleTargetY };
    const nextIkInfluence = { ...snapshot.ikInfluence };

    replaceRecord(this.parameterValues, snapshot.parameterValues);
    this.prevParamValues = nextPrevParamValues;
    this.boneX = nextBoneX;
    this.boneY = nextBoneY;
    this.boneAngles = nextBoneAngles;
    this.boneScaleX = nextBoneScaleX;
    this.boneScaleY = nextBoneScaleY;
    this.ikTargetX = nextIkTargetX;
    this.ikTargetY = nextIkTargetY;
    this.ikPoleTargetX = nextIkPoleTargetX;
    this.ikPoleTargetY = nextIkPoleTargetY;
    this.ikInfluence = nextIkInfluence;
    replaceMap(this.physicsStates, nextPhysicsStates);
    replaceMap(this.physicsAccumulators, nextPhysicsAccumulators);
    replaceMap(this.meshScratchVerts, nextMeshScratchVerts);
    replaceMap(this.meshStates, nextMeshStates);
    this.drawOrderCache.length = 0;
    this.drawOrderCache.push(...nextDrawOrderCache);

    for (const layer of this.allLayers) {
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

  getDrawOrder(): readonly string[] {
    return this.drawOrderCache;
  }

  getMeshState(meshId: string): MeshRenderState | undefined {
    return this.meshStates.get(meshId);
  }

  getAllMeshStates(): ReadonlyMap<string, MeshRenderState> {
    return this.meshStates;
  }

  get width(): number {
    return this.project.width;
  }

  get height(): number {
    return this.project.height;
  }

  private rebuildStaticCaches(): void {
    for (const layer of this.allLayers) {
      if (layer.kind === "viviMesh") {
        this.meshStaticCache.set(layer.id, {
          uvs: new Float32Array(layer.mesh.uvs),
          indices: new Uint32Array(layer.mesh.indices),
        });
        this.meshScratchVerts.set(layer.id, new Float32Array(layer.mesh.vertices.length));
      } else if (layer.kind === "bone") {
        this.boneLengths.set(layer.id, layer.bone.length);
        this.boneBaseX[layer.id] = layer.x;
        this.boneBaseY[layer.id] = layer.y;
      }
    }
  }

  private evaluatePublicParameterBindings(): void {
    const bindings = this.project.parameterBindings ?? [];
    if (bindings.length === 0) return;

    const groups = new Map<string, typeof bindings>();
    for (const binding of bindings) {
      if (!PUBLIC_BINDING_TARGET_TYPES.has(binding.target.type)) {
        continue;
      }
      const key =
        binding.target.type === "bone"
          ? `bone:${binding.target.boneId}:${binding.target.property}`
          : `ik:${binding.target.controllerId}:${binding.target.property}`;
      const group = groups.get(key);
      if (group) {
        group.push(binding);
      } else {
        groups.set(key, [binding]);
      }
    }

    for (const group of groups.values()) {
      const target = group[0]!.target;
      if (target.type === "bone") {
        const value = evaluateBindingsAdditive(
          group,
          this.parameterValues,
          this.getBoneBindingDefaultValue(target.boneId, target.property),
        );
        this.setBoneBindingValue(target.boneId, target.property, value);
      } else if (target.type === "ikController") {
        const value = evaluateBindingsAdditive(
          group,
          this.parameterValues,
          this.getIKBindingDefaultValue(target.controllerId, target.property),
        );
        this.setIKBindingValue(target.controllerId, target.property, value);
      }
    }
  }

  private getBoneBindingDefaultValue(
    boneId: string,
    property: BoneBindingPropertyType,
  ): number {
    if (property === "x") return this.boneBaseX[boneId] ?? 0;
    if (property === "y") return this.boneBaseY[boneId] ?? 0;
    if (property === "angle") return 0;
    return 1;
  }

  private setBoneBindingValue(
    boneId: string,
    property: BoneBindingPropertyType,
    value: number,
  ): void {
    if (property === "x") this.boneX[boneId] = value;
    else if (property === "y") this.boneY[boneId] = value;
    else if (property === "angle") this.boneAngles[boneId] = value;
    else if (property === "scaleX") this.boneScaleX[boneId] = value;
    else this.boneScaleY[boneId] = value;
  }

  private getIKBindingDefaultValue(
    controllerId: string,
    property: IKControllerBindingPropertyType,
  ): number {
    const controller = this.project.ikControllers?.find((c) => c.id === controllerId);
    if (!controller) return property === "influence" ? 1 : 0;
    if (property === "targetX") return controller.targetX;
    if (property === "targetY") return controller.targetY;
    if (property === "poleTargetX") return controller.poleTargetX ?? 0;
    if (property === "poleTargetY") return controller.poleTargetY ?? 0;
    return controller.influence;
  }

  private setIKBindingValue(
    controllerId: string,
    property: IKControllerBindingPropertyType,
    value: number,
  ): void {
    if (property === "targetX") this.ikTargetX[controllerId] = value;
    else if (property === "targetY") this.ikTargetY[controllerId] = value;
    else if (property === "poleTargetX") this.ikPoleTargetX[controllerId] = value;
    else if (property === "poleTargetY") this.ikPoleTargetY[controllerId] = value;
    else this.ikInfluence[controllerId] = Math.max(0, Math.min(1, value));
  }

  private applyBoneOverrides(): void {
    for (const layer of this.allLayers) {
      if (layer.kind !== "bone") continue;
      if (this.boneX[layer.id] !== undefined) layer.x = this.boneX[layer.id]!;
      if (this.boneY[layer.id] !== undefined) layer.y = this.boneY[layer.id]!;
      if (this.boneAngles[layer.id] !== undefined) {
        layer.bone.angle = this.boneAngles[layer.id]!;
      }
      if (this.boneScaleX[layer.id] !== undefined) {
        layer.bone.scaleX = this.boneScaleX[layer.id]!;
      }
      if (this.boneScaleY[layer.id] !== undefined) {
        layer.bone.scaleY = this.boneScaleY[layer.id]!;
      }
    }
  }

  private computeMeshStates(): void {
    const drawOrder = this.drawOrderScratch;
    drawOrder.length = 0;
    const worldTransforms = computeBoneWorldTransforms(this.project.layers);
    const processedIds = new Set<string>();

    for (const layer of this.allLayers) {
      if (layer.kind !== "viviMesh") continue;

      let scratch = this.meshScratchVerts.get(layer.id);
      if (!scratch || scratch.length !== layer.mesh.vertices.length) {
        scratch = new Float32Array(layer.mesh.vertices.length);
        this.meshScratchVerts.set(layer.id, scratch);
      }
      this.computeFinalVerticesInto(layer, worldTransforms, scratch);

      let staticData = this.meshStaticCache.get(layer.id);
      if (!staticData) {
        const typed = meshDataToTypedArrays(layer.mesh);
        staticData = { uvs: typed.uvs, indices: typed.indices };
        this.meshStaticCache.set(layer.id, staticData);
      }

      const zIndex = getDrawOrder(layer.drawOrder);
      const visible = isLayerEffectivelyVisible(layer, this.project.layers);
      const culled = layer.culling === true && visible && isPolygonFlipped(scratch);
      const isSkinned = this.project.skins?.[layer.id] !== undefined;
      const verticesSpace = isSkinned ? "model" : "local";
      this.meshStates.set(layer.id, {
        id: layer.id,
        vertices: new Float32Array(scratch),
        verticesSpace,
        uvs: staticData.uvs,
        indices: staticData.indices,
        x: isSkinned ? 0 : layer.x,
        y: isSkinned ? 0 : layer.y,
        opacity: layer.opacity,
        visible: visible && !culled,
        blendMode: layer.blendMode,
        multiplyColor: getMultiplyColor(layer.multiplyColor),
        screenColor: isScreenColorDefault(layer.screenColor)
          ? undefined
          : layer.screenColor,
        drawOrder: zIndex,
        culled,
      });
      processedIds.add(layer.id);
      drawOrder.push({ id: layer.id, zIndex });
    }

    if (this.meshStates.size !== processedIds.size) {
      for (const id of this.meshStates.keys()) {
        if (!processedIds.has(id)) this.meshStates.delete(id);
      }
    }

    drawOrder.sort((a, b) => a.zIndex - b.zIndex);
    this.drawOrderCache.length = drawOrder.length;
    for (let index = 0; index < drawOrder.length; index += 1) {
      this.drawOrderCache[index] = drawOrder[index]!.id;
    }
  }

  private computeFinalVerticesInto(
    layer: Extract<LayerNode, { kind: "viviMesh" }>,
    worldTransforms: Map<string, Affine2D>,
    out: Float32Array,
  ): void {
    const skin = this.project.skins?.[layer.id];
    const vertices = skin
      ? computeSkinnedVertices(layer.mesh.vertices, skin, worldTransforms)
      : layer.mesh.vertices;
    const length = Math.min(out.length, vertices.length);
    for (let index = 0; index < length; index += 1) {
      out[index] = vertices[index]!;
    }
  }
}
