import type { BBWOptions, BoneHandle } from "@vivi2d/core/bbw-weights";
import type { MeshDensityPreset } from "@vivi2d/core/constants";
import { flattenLayers } from "@vivi2d/core/layer-utils";
import type {
  BoneBindingPropertyType,
  MeshData,
  ParameterBindingPoint,
  ProjectData,
  SkinWeight,
} from "@vivi2d/core/types";
import { isViviMesh } from "@vivi2d/core/types";
import {
  type BoneGenerationResult,
  type GeneratedLabelLocale,
  type GeneratedBone,
  type GeneratedParameter,
  generateAllBones,
} from "./ai-bone-generator";
import {
  type DetectedPart,
  detectParts,
  filterDetectedParts,
  refineByPosition,
} from "./ai-part-detector";
import {
  type GeneratedPhysicsGroup,
  generatePhysicsGroups,
} from "./ai-physics-generator";
import type { LayerOcclusionCleanupPreviewReport } from "./layer-occlusion-cleanup";
import {
  assertSafeAutoSetupPlan,
  createFallbackAutoSetupSourceFingerprint,
  createSafeAutoSetupOperationSignature,
  createStableAutoSetupHash,
  SAFE_AUTO_SETUP_MANAGED_TAG_PREFIX,
  SAFE_AUTO_SETUP_PLAN_PROFILE,
  SAFE_AUTO_SETUP_PLAN_VERSION,
  type SafeAutoSetupOperation,
  type SafeAutoSetupPlan,
} from "@vivi2d/editor-core/safe-auto-setup-plan";
import type {
  AutoSetupAuditTrace,
  LayerGraph,
} from "@vivi2d/editor-core/layer-graph";
import { createLayerGraphFromProject } from "@vivi2d/editor-core/layer-graph";
import {
  compileMotionHandleDraftToSafeAutoSetupOperations,
  createMotionHandleDraftFromProject,
  type LocalMotionAcceptedManualMaskMap,
  type MotionHandleDraft,
} from "@vivi2d/editor-core/motion-handles";
import { generateAutoMeshAsync } from "./workers/auto-mesh-client";
import { computeBBWWeightsAsync } from "./workers/bbw-weights-client";

export { createAutoSetupSourceFingerprint } from "@vivi2d/editor-core/safe-auto-setup-plan";

// Coordinates the "auto setup" pipeline: part detection, bone generation,
// mesh generation, and optional BBW weight solving.
export interface AutoSetupOptions {
  /** Whether to synthesize a bone hierarchy from detected parts. */
  generateBones: boolean;
  /** Whether to synthesize physics groups from detected parts. */
  generatePhysics: boolean;
  /** Whether to generate meshes for eligible ViviMesh layers. */
  generateMeshes?: boolean;
  /** Whether to solve weights for the generated meshes. */
  generateWeights?: boolean;
  /** Mesh density preset passed to the worker-side auto-mesh pipeline. */
  meshPreset?: MeshDensityPreset;
  /** Minimum detector confidence accepted during the preview step. */
  minConfidence: number;
  /** Locale used for user-visible generated bone/parameter/physics labels. */
  labelLocale?: GeneratedLabelLocale;
  /** Accepted split-layer alpha masks used by editor-only motion handle suggestions. */
  acceptedManualMasks?: LocalMotionAcceptedManualMaskMap;
}

export interface MeshGenerationResult {
  layerId: string;
  layerName: string;
  mesh: MeshData;
}

export interface WeightGenerationResult {
  layerId: string;
  weights: SkinWeight[][];
  boneIds: string[];
  solver?: "rigidLayer" | "secondaryMotion" | "bbw";
}

export interface AutoSetupResult {
  /** Filtered detector output used for preview and downstream generation. */
  detectedParts: DetectedPart[];
  /** Generated bone graph, or `null` when bone generation is disabled. */
  boneResult: BoneGenerationResult | null;
  /** Generated physics groups, or an empty list when disabled. */
  physicsGroups: GeneratedPhysicsGroup[];
  /** Meshes produced by the worker-side auto-mesh pipeline. */
  meshResults: MeshGenerationResult[];
  /** BBW weight sets produced for generated meshes. */
  weightResults: WeightGenerationResult[];
  /** See-through secondary-motion risk report used to clamp fragile motion. */
  motionRiskReport?: {
    layerReports: Array<{
      layerId: string;
      layerName: string;
      riskScore: number;
      motionScale: number;
      reasons: string[];
    }>;
    maxRiskScore: number;
    averageMotionScale: number;
  } | null;
  /** Geometry preview of foreground holdout, underpaint, and duplicate-contour cleanup. */
  occlusionCleanupReport?: LayerOcclusionCleanupPreviewReport | null;
  /** Validated public-safe operation plan used by the apply step. */
  plan?: SafeAutoSetupPlan;
  /** Editor-only layer proposal graph used for precision rigging review. */
  layerGraph?: LayerGraph;
  /** Editor-only audit trace for the Safe Auto Setup compilation. */
  auditTrace?: AutoSetupAuditTrace;
  /** Editor-only motion handle proposal generated from accepted split layers. */
  motionHandleDraft?: MotionHandleDraft;
}

export interface BuildSafeAutoSetupPlanOptions {
  excludedIds?: ReadonlySet<string>;
  sourceFingerprint?: string;
  allowBbwSolver?: boolean;
}

export const AUTO_SETUP_BBW_REVIEW_GATE_DIAGNOSTIC = {
  code: "bbwReviewGatePending",
  pathPrefix: "weightResults.",
} as const;

interface GeneratedParameterRef {
  parameter: GeneratedParameter;
  parameterId: string;
  index: number;
}

interface ControllerBindingRecipe {
  parameterIndex: number;
  tempBoneId: string;
  property: BoneBindingPropertyType;
  targets: (bone: GeneratedBone) => [number, number, number];
}

const controllerBindingRecipes: ControllerBindingRecipe[] = [
  {
    parameterIndex: 0,
    tempBoneId: "bone_head",
    property: "x",
    targets: (bone) => [bone.x - 12, bone.x, bone.x + 12],
  },
  {
    parameterIndex: 1,
    tempBoneId: "bone_head",
    property: "y",
    targets: (bone) => [bone.y - 8, bone.y, bone.y + 8],
  },
  {
    parameterIndex: 2,
    tempBoneId: "bone_head",
    property: "angle",
    targets: () => [-0.14, 0, 0.14],
  },
  {
    parameterIndex: 15,
    tempBoneId: "bone_body",
    property: "x",
    targets: (bone) => [bone.x - 8, bone.x, bone.x + 8],
  },
  {
    parameterIndex: 16,
    tempBoneId: "bone_body",
    property: "y",
    targets: (bone) => [bone.y - 6, bone.y, bone.y + 6],
  },
  {
    parameterIndex: 17,
    tempBoneId: "bone_body",
    property: "angle",
    targets: () => [-0.08, 0, 0.08],
  },
  {
    parameterIndex: 18,
    tempBoneId: "bone_arm_left",
    property: "angle",
    targets: () => [-0.35, 0, 0.35],
  },
  {
    parameterIndex: 19,
    tempBoneId: "bone_arm_right",
    property: "angle",
    targets: () => [0.35, 0, -0.35],
  },
];

function createGeneratedParameterId(
  parameter: GeneratedParameter,
  index: number,
): string {
  if (parameter.id) return parameter.id;
  const hash = createStableAutoSetupHash({
    index,
    name: parameter.name,
    group: parameter.group,
    minValue: parameter.minValue,
    maxValue: parameter.maxValue,
    defaultValue: parameter.defaultValue,
  }).replace(/[^a-z0-9]/gi, "");
  return `safe_auto_param_${index}_${hash}`;
}

function makeBindingPoints(
  parameter: GeneratedParameter,
  minTarget: number,
  defaultTarget: number,
  maxTarget: number,
): ParameterBindingPoint[] {
  const points = [
    { paramValue: parameter.minValue, targetValue: minTarget },
    { paramValue: parameter.defaultValue, targetValue: defaultTarget },
    { paramValue: parameter.maxValue, targetValue: maxTarget },
  ].sort((a, b) => a.paramValue - b.paramValue);

  const deduped: ParameterBindingPoint[] = [];
  for (const point of points) {
    const last = deduped.at(-1);
    if (last && last.paramValue === point.paramValue) {
      last.targetValue = point.targetValue;
    } else {
      deduped.push(point);
    }
  }
  return deduped;
}

function createControllerBindingOperations(
  boneResult: BoneGenerationResult | null,
  parameterRefs: GeneratedParameterRef[],
  excludedIds: ReadonlySet<string>,
): SafeAutoSetupOperation[] {
  if (!boneResult) return [];

  const bonesByTempId = new Map<string, GeneratedBone>();
  for (const bone of boneResult.bones) bonesByTempId.set(bone.tempId, bone);

  const operations: SafeAutoSetupOperation[] = [];
  const usedTargets = new Set<string>();

  for (const ref of parameterRefs) {
    const recipe = controllerBindingRecipes.find((candidate) =>
      candidate.parameterIndex === ref.index,
    );
    if (!recipe) continue;
    if (excludedIds.has(recipe.tempBoneId)) continue;

    const bone = bonesByTempId.get(recipe.tempBoneId);
    if (!bone) continue;

    const key = `${ref.parameterId}:${recipe.tempBoneId}:${recipe.property}`;
    if (usedTargets.has(key)) continue;
    usedTargets.add(key);

    const [minTarget, defaultTarget, maxTarget] = recipe.targets(bone);
    operations.push(withManagedSignature({
      kind: "createBinding",
      parameterId: ref.parameterId,
      target: {
        type: "bone",
        tempBoneId: recipe.tempBoneId,
        property: recipe.property,
      },
      bindingPoints: makeBindingPoints(
        ref.parameter,
        minTarget,
        defaultTarget,
        maxTarget,
      ),
      managedTag: `${SAFE_AUTO_SETUP_MANAGED_TAG_PREFIX}:binding:${ref.parameterId}:${recipe.tempBoneId}:${recipe.property}`,
    }));
  }

  return operations;
}

function withManagedSignature<T extends SafeAutoSetupOperation>(
  operation: T,
): T {
  const managedSignature = createSafeAutoSetupOperationSignature(operation);
  if (!managedSignature) return operation;
  switch (operation.kind) {
    case "addBone":
    case "createMesh":
    case "createSkin":
    case "createBinding":
      return { ...operation, managedSignature };
    case "createParameter":
      return {
        ...operation,
        parameter: { ...operation.parameter, managedSignature },
      };
    case "createPhysicsGroup":
      return {
        ...operation,
        group: { ...operation.group, managedSignature },
      };
    case "parentBone":
      return operation;
  }
}

function inferWeightSolver(
  weightResult: WeightGenerationResult,
): "rigidLayer" | "secondaryMotion" | "bbw" {
  if (weightResult.solver) return weightResult.solver;
  return (
    weightResult.boneIds.length === 1 &&
    weightResult.weights.every(
      (vertexWeights) =>
        vertexWeights.length === 1 &&
        vertexWeights[0]?.boneId === weightResult.boneIds[0] &&
        vertexWeights[0]?.weight === 1,
    )
  )
    ? "rigidLayer"
    : "bbw";
}

export function buildSafeAutoSetupPlan(
  project: ProjectData,
  result: AutoSetupResult,
  options?: BuildSafeAutoSetupPlanOptions,
): SafeAutoSetupPlan {
  const excludedIds = options?.excludedIds ?? new Set<string>();
  let operations: SafeAutoSetupOperation[] = [];
  const parameterRefs: GeneratedParameterRef[] = [];
  let diagnostics: SafeAutoSetupPlan["diagnostics"] = [];

  if (result.boneResult) {
    for (const bone of result.boneResult.bones) {
      if (excludedIds.has(bone.tempId)) continue;
      operations.push(withManagedSignature({
        kind: "addBone",
        tempId: bone.tempId,
        name: bone.name,
        x: bone.x,
        y: bone.y,
        partCategory: bone.partCategory,
        managedTag: `${SAFE_AUTO_SETUP_MANAGED_TAG_PREFIX}:bone:${bone.tempId}`,
      }));
    }

    for (const bone of result.boneResult.bones) {
      if (excludedIds.has(bone.tempId) || !bone.parentTempId) continue;
      if (excludedIds.has(bone.parentTempId)) continue;
      operations.push({
        kind: "parentBone",
        childTempId: bone.tempId,
        parentTempId: bone.parentTempId,
      });
    }

    for (let index = 0; index < result.boneResult.parameters.length; index += 1) {
      const parameter = result.boneResult.parameters[index]!;
      const parameterId = createGeneratedParameterId(parameter, index);
      parameterRefs.push({ parameter, parameterId, index });
      operations.push(withManagedSignature({
        kind: "createParameter",
        parameter: {
          id: parameterId,
          name: parameter.name,
          minValue: parameter.minValue,
          maxValue: parameter.maxValue,
          defaultValue: parameter.defaultValue,
          group: parameter.group,
          managedTag: `${SAFE_AUTO_SETUP_MANAGED_TAG_PREFIX}:parameter:${parameter.name}`,
        },
      }));
    }
  }

  operations.push(
    ...createControllerBindingOperations(result.boneResult, parameterRefs, excludedIds),
  );

  for (const group of result.physicsGroups) {
    operations.push(withManagedSignature({
      kind: "createPhysicsGroup",
      group: {
        name: group.name,
        partCategory: group.partCategory,
        layerIds: group.layerIds.filter((layerId) => !excludedIds.has(layerId)),
        stiffness: group.stiffness,
        gravity: group.gravity,
        damping: group.damping,
        managedTag: `${SAFE_AUTO_SETUP_MANAGED_TAG_PREFIX}:physics:${group.partCategory}`,
      },
    }));
  }

  for (const meshResult of result.meshResults) {
    if (excludedIds.has(meshResult.layerId)) continue;
    operations.push(withManagedSignature({
      kind: "createMesh",
      layerId: meshResult.layerId,
      layerName: meshResult.layerName,
      mesh: meshResult.mesh,
      algorithm: "alphaBoundary",
      managedTag: `${SAFE_AUTO_SETUP_MANAGED_TAG_PREFIX}:mesh:${meshResult.layerId}`,
    }));
  }

  for (const weightResult of result.weightResults) {
    if (excludedIds.has(weightResult.layerId)) continue;
    const solver = inferWeightSolver(weightResult);
    if (solver === "bbw" && !options?.allowBbwSolver) {
      diagnostics.push({
        severity: "warning",
        code: AUTO_SETUP_BBW_REVIEW_GATE_DIAGNOSTIC.code,
        message:
          "Skipped BBW skin generation because the BBW review gate is not complete.",
        path: `${AUTO_SETUP_BBW_REVIEW_GATE_DIAGNOSTIC.pathPrefix}${weightResult.layerId}`,
      });
      continue;
    }
    operations.push(withManagedSignature({
      kind: "createSkin",
      layerId: weightResult.layerId,
      weights: weightResult.weights,
      boneIds: weightResult.boneIds,
      solver,
      managedTag: `${SAFE_AUTO_SETUP_MANAGED_TAG_PREFIX}:skin:${weightResult.layerId}`,
    }));
  }

  if (result.motionHandleDraft) {
    const compiledMotionHandles =
      compileMotionHandleDraftToSafeAutoSetupOperations(project, result.motionHandleDraft, {
        excludedLayerIds: excludedIds,
      });
    operations = [...operations, ...compiledMotionHandles.operations];
    diagnostics = [...diagnostics, ...compiledMotionHandles.diagnostics];
  }

  return assertSafeAutoSetupPlan(
    {
      planVersion: SAFE_AUTO_SETUP_PLAN_VERSION,
      profile: SAFE_AUTO_SETUP_PLAN_PROFILE,
      sourceFingerprint:
        options?.sourceFingerprint ?? createFallbackAutoSetupSourceFingerprint(project),
      operations,
      diagnostics,
    },
    { allowBbwSolver: options?.allowBbwSolver },
  );
}

/** Runs the synchronous preview stage without mutating the project. */
export function previewAutoSetup(
  project: ProjectData,
  options: AutoSetupOptions,
): AutoSetupResult {
  let parts = detectParts(project.layers);
  parts = refineByPosition(parts, project.width, project.height);
  parts = filterDetectedParts(parts, options.minConfidence);

  const boneResult = options.generateBones
    ? generateAllBones(parts, project.width, project.height, {
        locale: options.labelLocale,
      })
    : null;

  const physicsGroups = options.generatePhysics
    ? generatePhysicsGroups(parts, { locale: options.labelLocale })
    : [];

  const result: AutoSetupResult = {
    detectedParts: parts,
    boneResult,
    physicsGroups,
    meshResults: [],
    weightResults: [],
    layerGraph: createLayerGraphFromProject(project),
    motionHandleDraft: createMotionHandleDraftFromProject(project, {
      acceptedManualMasks: options.acceptedManualMasks,
    }),
  };

  return result;
}

export interface GenerateAutoMeshesOptions {
  signal?: AbortSignal;
  onProgress?: (completed: number, total: number, layerName: string) => void;
  presetOverrides?: Record<string, MeshDensityPreset>;
}

export async function generateAutoMeshes(
  project: ProjectData,
  getTexture: (layerId: string) => HTMLCanvasElement | undefined,
  preset: MeshDensityPreset,
  runtimeOptions?: GenerateAutoMeshesOptions,
): Promise<MeshGenerationResult[]> {
  const results: MeshGenerationResult[] = [];
  const allLayers = flattenLayers(project.layers);

  const targets: Array<{
    id: string;
    name: string;
    canvas: HTMLCanvasElement;
    w: number;
    h: number;
  }> = [];
  for (const layer of allLayers) {
    if (!isViviMesh(layer)) continue;
    if (layer.mesh.divisionsX === 0 && layer.mesh.vertices.length > 8) continue;
    const canvas = getTexture(layer.id);
    if (!canvas) continue;
    targets.push({
      id: layer.id,
      name: layer.name,
      canvas,
      w: layer.width,
      h: layer.height,
    });
  }

  let completed = 0;
  for (const t of targets) {
    if (runtimeOptions?.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    const mesh = await generateAutoMeshAsync(t.canvas, t.w, t.h, preset, {
      presetOverride: runtimeOptions?.presetOverrides?.[t.id],
      signal: runtimeOptions?.signal,
    });
    if (mesh) {
      results.push({ layerId: t.id, layerName: t.name, mesh });
    }
    completed += 1;
    runtimeOptions?.onProgress?.(completed, targets.length, t.name);
  }

  return results;
}

export interface GenerateAutoWeightsOptions {
  /** Cancels queued worker jobs. */
  signal?: AbortSignal;
  /** Reports per-mesh progress back to the caller. */
  onProgress?: (completed: number, total: number, layerName: string) => void;
  /** Per-layer rigid binding overrides used when preserving already-separated artwork. */
  rigidLayerBoneIds?: Record<string, string>;
  /**
   * Per-layer secondary motion chains. These keep separated artwork pinned at
   * the root while allowing the tip side to follow a bone chain naturally.
   */
  secondaryMotionBindings?: Record<string, SecondaryMotionWeightBinding>;
}

function createRigidVertexWeights(
  vertexCoordinates: readonly number[],
  boneId: string,
): SkinWeight[][] {
  const vertexCount = Math.floor(vertexCoordinates.length / 2);
  return Array.from({ length: vertexCount }, () => [{ boneId, weight: 1 }]);
}

export interface SecondaryMotionWeightBinding {
  boneIds: readonly [string, string, string];
  axis: "horizontal" | "vertical";
  reverse?: boolean;
  motionScale?: number;
  riskScore?: number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / Math.max(1e-6, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function normalizeVertexWeights(weights: SkinWeight[]): SkinWeight[] {
  const total = weights.reduce((sum, item) => sum + item.weight, 0);
  if (total <= 1e-8) return [{ boneId: weights[0]?.boneId ?? "", weight: 1 }];
  return weights
    .filter((item) => item.weight > 1e-5)
    .map((item) => ({ boneId: item.boneId, weight: item.weight / total }));
}

function createSecondaryMotionVertexWeights(
  vertexCoordinates: readonly number[],
  binding: SecondaryMotionWeightBinding,
): SkinWeight[][] {
  const vertexCount = Math.floor(vertexCoordinates.length / 2);
  if (vertexCount === 0) return [];

  const xs: number[] = [];
  const ys: number[] = [];
  for (let index = 0; index < vertexCount; index += 1) {
    xs.push(vertexCoordinates[index * 2] ?? 0);
    ys.push(vertexCoordinates[index * 2 + 1] ?? 0);
  }

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const span = binding.axis === "horizontal" ? maxX - minX : maxY - minY;
  if (span <= 1e-6) {
    return createRigidVertexWeights(vertexCoordinates, binding.boneIds[0]);
  }
  const motionScale = clamp01(binding.motionScale ?? 1);
  const stabilization = (1 - motionScale) * 0.86;

  return Array.from({ length: vertexCount }, (_, index) => {
    const x = xs[index] ?? 0;
    const y = ys[index] ?? 0;
    const rawT =
      binding.axis === "horizontal" ? (x - minX) / span : (y - minY) / span;
    const t = clamp01(binding.reverse ? 1 - rawT : rawT);

    // Root/mid/tip bands intentionally stay conservative: the root is pinned
    // hard, and the far tip keeps a little mid influence to avoid double-line
    // artifacts when users push the secondary motion amplitude.
    const root =
      (1 - smoothstep(0.06, 0.42, t)) * (t < 0.16 ? 1.8 : 1) +
      smoothstep(0.18, 1, t) * stabilization;
    const midCore =
      Math.max(0, 1 - Math.abs(t - 0.54) / 0.36) * 0.95 * motionScale;
    const midStabilizer = smoothstep(0.44, 0.96, t) * 0.04 * motionScale;
    const mid = midCore + midStabilizer;
    const tip = smoothstep(0.44, 0.98, t) * 0.98 * motionScale;

    return normalizeVertexWeights([
      { boneId: binding.boneIds[0], weight: root },
      { boneId: binding.boneIds[1], weight: mid },
      { boneId: binding.boneIds[2], weight: tip },
    ]);
  });
}

/** Solves BBW weights for the generated meshes without mutating the project. */
export async function generateAutoWeights(
  meshResults: MeshGenerationResult[],
  bones: GeneratedBone[],
  options?: BBWOptions,
  runtimeOptions?: GenerateAutoWeightsOptions,
): Promise<WeightGenerationResult[]> {
  if (bones.length === 0) return [];

  // The worker expects the compact `BoneHandle` shape defined by the core BBW module.
  const boneHandles: BoneHandle[] = bones.map((b) => ({
    id: b.tempId,
    x: b.x,
    y: b.y,
    parentId: b.parentTempId,
  }));

  const boneIds = bones.map((b) => b.tempId);
  const results: WeightGenerationResult[] = [];

  const validMeshes = meshResults.filter((mr) => mr.mesh.indices.length >= 3);
  let completed = 0;
  for (const mr of validMeshes) {
    if (runtimeOptions?.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    const secondaryMotionBinding =
      runtimeOptions?.secondaryMotionBindings?.[mr.layerId];
    if (
      secondaryMotionBinding &&
      secondaryMotionBinding.boneIds.every((boneId) => boneIds.includes(boneId))
    ) {
      results.push({
        layerId: mr.layerId,
        weights: createSecondaryMotionVertexWeights(
          mr.mesh.vertices,
          secondaryMotionBinding,
        ),
        boneIds: [...secondaryMotionBinding.boneIds],
        solver: "secondaryMotion",
      });
      completed += 1;
      runtimeOptions?.onProgress?.(completed, validMeshes.length, mr.layerName);
      continue;
    }

    const rigidBoneId = runtimeOptions?.rigidLayerBoneIds?.[mr.layerId];
    if (rigidBoneId && boneIds.includes(rigidBoneId)) {
      results.push({
        layerId: mr.layerId,
        weights: createRigidVertexWeights(mr.mesh.vertices, rigidBoneId),
        boneIds: [rigidBoneId],
        solver: "rigidLayer",
      });
      completed += 1;
      runtimeOptions?.onProgress?.(completed, validMeshes.length, mr.layerName);
      continue;
    }

    const weights = await computeBBWWeightsAsync(
      mr.mesh.vertices,
      mr.mesh.indices,
      boneHandles,
      options,
      { signal: runtimeOptions?.signal },
    );
    results.push({ layerId: mr.layerId, weights, boneIds, solver: "bbw" });
    completed += 1;
    runtimeOptions?.onProgress?.(completed, validMeshes.length, mr.layerName);
  }

  return results;
}
