import { hitTestColliders, hitTestCollidersAll } from "./collider";
import { flattenLayers } from "./layer-utils";
import { applyBoneOverridesToLayers, evaluateBindings } from "./model/bindings";
import { buildStaticCaches } from "./model/caches";
import { runIKStep } from "./model/ik-step";
import { computeAllMeshStates } from "./model/mesh-compute";
import { runPhysicsStep } from "./model/physics-step";
import { advanceAnimationStep } from "./model-animation-step";
import {
  computeStateMachineUpdates,
  createParamDefaultResolver,
} from "./model-statemachine-step";
import { mergeParameterDefaults } from "./parameter-utils";
import { createPhysicsRuntimeState } from "./physics-engine";
import {
  migrateV1toV2,
  migrateV2toV3,
  migrateV3toV4,
  migrateV4toV5,
  migrateV5toV6,
  migrateV6toV7,
  migrateV7toV8,
  migrateV8toV9,
  migrateV9toV10,
} from "./project-migration";
import { parseViviFile } from "./project-parser";
import {
  createStateMachineRuntime,
  type StateMachineRuntime,
} from "./state-machine";
import type {
  AnimationClip,
  ColliderHitResult,
  LayerNode,
  MeshRenderState,
  PendulumState,
  ProjectData,
  ViviFileData,
} from "./types";

export type { MeshRenderState } from "./types";

export interface ViviModelOptions {
  initialParameters?: Record<string, number>;
}

export class ViviModel {
  readonly project: ProjectData;

  readonly atlases: ViviFileData["atlases"];

  readonly parameterValues: Record<string, number>;

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
  private readonly boneBaseX: Record<string, number> = {};
  private readonly boneBaseY: Record<string, number> = {};

  private allLayers: LayerNode[];

  private meshStaticCache: Map<
    string,
    { uvs: Float32Array; indices: Uint32Array }
  > = new Map();

  private boneLengths: Map<string, number> = new Map();

  private meshStates: Map<string, MeshRenderState> = new Map();

  private drawOrderCache: string[] = [];

  private drawOrderScratch: { id: string; zIndex: number }[] = [];

  private meshScratchVerts: Map<string, Float32Array> = new Map();

  private physicsStates: Map<string, PendulumState[]> = new Map();
  private physicsAccumulators: Map<string, number> = new Map();
  private prevParamValues: Record<string, number> = {};

  private smRuntimes: Map<string, StateMachineRuntime> = new Map();
  private clipMap: Map<string, AnimationClip> = new Map();

  private currentClip: AnimationClip | null = null;
  private clipFrame = 0;
  private clipPlaying = false;
  private clipLoop = false;

  private constructor(
    project: ProjectData,
    atlases: ViviFileData["atlases"],
    options?: ViviModelOptions,
  ) {
    this.project = project;
    this.atlases = atlases;
    this.allLayers = flattenLayers(project.layers);
    this.parameterValues = mergeParameterDefaults(
      project.parameters,
      options?.initialParameters ?? {},
    );
    for (const layer of this.allLayers) {
      if (layer.kind !== "bone") continue;
      this.boneBaseX[layer.id] = layer.x;
      this.boneBaseY[layer.id] = layer.y;
    }

    this.rebuildStaticCaches();

    for (const group of this.project.physicsGroups) {
      if (!group.enabled) continue;
      this.physicsStates.set(group.id, createPhysicsRuntimeState(group));
      this.physicsAccumulators.set(group.id, 0);
    }
    this.prevParamValues = { ...this.parameterValues };

    this.rebuildClipMap();

    for (const sm of this.project.stateMachines ?? []) {
      if (!sm.enabled) continue;
      this.smRuntimes.set(sm.id, createStateMachineRuntime(sm));
    }

    this.update();
  }

  static fromJSON(json: string, options?: ViviModelOptions): ViviModel {
    const fileData = parseViviFile(json);
    return ViviModel.fromFileData(fileData, options);
  }

  static fromFileData(
    fileData: ViviFileData,
    options?: ViviModelOptions,
  ): ViviModel {
    const project = fileData.project;
    Object.assign(project, migrateV1toV2(project));
    Object.assign(project, migrateV2toV3(project));
    Object.assign(project, migrateV3toV4(project));
    Object.assign(project, migrateV4toV5(project));
    Object.assign(project, migrateV5toV6(project));
    Object.assign(project, migrateV6toV7(project));
    Object.assign(project, migrateV7toV8(project));
    Object.assign(project, migrateV8toV9(project));
    Object.assign(project, migrateV9toV10(project));
    return new ViviModel(project, fileData.atlases, options);
  }

  setParameter(id: string, value: number): void {
    const def = this.project.parameters.find((p) => p.id === id);
    if (!def) return;
    (this.parameterValues as Record<string, number>)[id] = Math.max(
      def.minValue,
      Math.min(def.maxValue, value),
    );
  }

  setParameters(values: Record<string, number>): void {
    for (const [id, value] of Object.entries(values)) {
      this.setParameter(id, value);
    }
  }

  resetParameters(): void {
    for (const def of this.project.parameters) {
      (this.parameterValues as Record<string, number>)[def.id] =
        def.defaultValue;
    }
  }

  applyExpressionPreset(presetId: string): void {
    const preset = this.project.expressionPresets?.find(
      (p) => p.id === presetId,
    );
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

  playClip(clip: AnimationClip, loop = false): void {
    this.currentClip = clip;
    this.clipFrame = 0;
    this.clipPlaying = true;
    this.clipLoop = loop;
  }

  stopClip(): void {
    this.clipPlaying = false;
    this.currentClip = null;
    this.clipFrame = 0;
  }

  pauseClip(): void {
    this.clipPlaying = false;
  }

  resumeClip(): void {
    if (this.currentClip) this.clipPlaying = true;
  }

  get currentFrame(): number {
    return this.clipFrame;
  }

  get isPlaying(): boolean {
    return this.clipPlaying;
  }

  update(deltaTime = 0): void {
    if (this.clipPlaying && this.currentClip && deltaTime > 0) {
      this.advanceAnimation(deltaTime);
    }

    if (deltaTime > 0) {
      this.stepStateMachines(deltaTime);
    }

    this.evaluateParameterBindings();

    if (deltaTime > 0) {
      this.stepPhysics(deltaTime);
    }

    this.solveIK();

    this.applyBoneOverrides();
    this.computeAllMeshStates();

    this.prevParamValues = { ...this.parameterValues };
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
    const caches = buildStaticCaches(this.allLayers);
    this.meshStaticCache = caches.meshStaticCache;
    this.boneLengths = caches.boneLengths;
    this.meshScratchVerts = caches.meshScratchVerts;
  }

  private evaluateParameterBindings(): void {
    const result = evaluateBindings(
      this.project.parameterBindings,
      this.parameterValues,
      this.project,
      {
        boneX: this.boneX,
        boneY: this.boneY,
        boneAngles: this.boneAngles,
        boneScaleX: this.boneScaleX,
        boneScaleY: this.boneScaleY,
        ikTargetX: this.ikTargetX,
        ikTargetY: this.ikTargetY,
        ikPoleTargetX: this.ikPoleTargetX,
        ikPoleTargetY: this.ikPoleTargetY,
        ikInfluence: this.ikInfluence,
      },
      {
        boneX: this.boneBaseX,
        boneY: this.boneBaseY,
      },
    );
    if (result.unchanged) return;
    this.boneX = result.boneX;
    this.boneY = result.boneY;
    this.boneAngles = result.boneAngles;
    this.boneScaleX = result.boneScaleX;
    this.boneScaleY = result.boneScaleY;
    this.ikTargetX = result.ikTargetX;
    this.ikTargetY = result.ikTargetY;
    this.ikPoleTargetX = result.ikPoleTargetX;
    this.ikPoleTargetY = result.ikPoleTargetY;
    this.ikInfluence = result.ikInfluence;
  }

  private applyBoneOverrides(): void {
    applyBoneOverridesToLayers(
      this.allLayers,
      this.boneX,
      this.boneY,
      this.boneAngles,
      this.boneScaleX,
      this.boneScaleY,
    );
  }

  private computeAllMeshStates(): void {
    computeAllMeshStates({
      project: this.project,
      allLayers: this.allLayers,
      parameterValues: this.parameterValues,
      meshStaticCache: this.meshStaticCache,
      meshScratchVerts: this.meshScratchVerts,
      meshStates: this.meshStates,
      drawOrderScratch: this.drawOrderScratch,
      drawOrderCache: this.drawOrderCache,
    });
  }

  private advanceAnimation(deltaTime: number): void {
    const clip = this.currentClip;
    if (!clip) return;

    const result = advanceAnimationStep(
      clip,
      this.clipFrame,
      deltaTime,
      this.clipLoop,
    );
    this.clipFrame = result.newFrame;
    this.clipPlaying = result.playing;

    for (const [paramId, value] of Object.entries(result.paramValues)) {
      this.setParameter(paramId, value);
    }
    Object.assign(this.boneAngles, result.boneAngles);
    Object.assign(this.boneScaleX, result.boneScaleX);
    Object.assign(this.boneScaleY, result.boneScaleY);
  }

  private stepPhysics(deltaTime: number): void {
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

  private solveIK(): void {
    runIKStep({
      project: this.project,
      boneLengths: this.boneLengths,
      boneAngles: this.boneAngles,
      ikTargetX: this.ikTargetX,
      ikTargetY: this.ikTargetY,
      ikPoleTargetX: this.ikPoleTargetX,
      ikPoleTargetY: this.ikPoleTargetY,
      ikInfluence: this.ikInfluence,
    });
  }

  private rebuildClipMap(): void {
    this.clipMap.clear();
    for (const scene of this.project.scenes) {
      for (const clip of scene.clips) {
        this.clipMap.set(clip.id, clip);
      }
    }
    for (const clip of this.project.clips) {
      this.clipMap.set(clip.id, clip);
    }
  }

  private stepStateMachines(deltaTime: number): void {
    const machines = this.project.stateMachines;
    if (!machines || machines.length === 0) return;

    const getParamDefault = createParamDefaultResolver(this.project.parameters);
    computeStateMachineUpdates(
      machines,
      this.smRuntimes,
      this.clipMap,
      deltaTime,
      () => this.parameterValues,
      getParamDefault,
      (updates) => {
        for (const [paramId, value] of updates) {
          this.setParameter(paramId, value);
        }
      },
    );
  }

  getStateMachineState(
    machineId: string,
  ): { currentState: string; transitioning: boolean } | null {
    const runtime = this.smRuntimes.get(machineId);
    if (!runtime) return null;
    const machine = this.project.stateMachines?.find((m) => m.id === machineId);
    if (!machine) return null;
    const state = machine.states.find((s) => s.id === runtime.currentStateId);
    return {
      currentState: state?.name ?? runtime.currentStateId,
      transitioning: runtime.activeTransition !== null,
    };
  }
}
