import {
  type EvaluationV1SchemaIssue,
  validateEvaluationPayloadV1Schema,
  validateEvaluationTexturePlanV1Schema,
} from "./evaluation-payload-v1/schema";
import {
  VIVI_RUNTIME_FORBIDDEN_KIND_OR_TYPE,
  VIVI_RUNTIME_FORBIDDEN_RAW_KEYS,
  VIVI_RUNTIME_LIMITS,
} from "./runtime-spec";
import type {
  AnimationClip,
  AnimationStateMachine,
  AtlasEntry,
  ColliderData,
  ExpressionPreset,
  IKController,
  LayerNode,
  ParameterBinding,
  ParameterDefinition,
  PhysicsGroup,
  ProjectData,
  SkinData,
} from "./types";

/**
 * Approved internal Evaluation Payload v1 hand-off defined by Spec Freeze
 * Amendment 1.
 *
 * This is an internal host seam, not part of the public runtime API. Consumers
 * must use the package's explicit internal export rather than widening the
 * public model entry point.
 */

export const VIVI_EVALUATION_SCHEMA_V1 = "vivi2d.evaluationPayload.v1" as const;
export const VIVI_EVALUATION_TEXTURE_PLAN_SCHEMA_V1 =
  "vivi2d.evaluationTexturePlan.v1" as const;
export const VIVI_EVAL_V1_MAX_TOTAL_TEXTURE_BYTES = 268_435_456;

export const VIVI_EVALUATION_V1_TEXTURE_LIMITS = Object.freeze({
  maxWidth: 8192,
  maxHeight: 8192,
  maxPixels: 67_108_864,
  maxPngInputBytes: 67_108_864,
  maxTextureBytes: 268_435_456,
});

const SOURCE_ATLAS_ID_PATTERN = /^[A-Za-z0-9_-]{1,120}$/;
const GENERAL_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const TEXTURE_BINDING_ID_PATTERN = /^atlas:[A-Za-z0-9_-]{1,120}$/;
const ASSET_REF_OWN_KEYS = Object.freeze([
  "objectAddress",
  "storageKind",
  "contentSha256",
  "mediaType",
  "sizeBytes",
] as const);
const MAX_SAFE_INTEGER = 9_007_199_254_740_991;
const MIN_INT32 = -2_147_483_648;
const MAX_INT32 = 2_147_483_647;
const MAX_IK_ITERATIONS = 1_024;
const MAX_CHUNK_MANIFEST_BYTES = 68_719_476_736;
const MAX_EMBEDDED_BLOB_BYTES = 16_777_216;
const DEFAULT_OUTPUT_GRAPH_LIMITS = Object.freeze({
  maxContainerDepth: 64,
  maxTokens: 8_000_000,
});
const DEFAULT_INPUT_GRAPH_LIMITS = Object.freeze({
  maxContainerDepth: 128,
  maxTokens: 8_000_000,
});

// Amendment 1 preserves the dotted parameter IDs already used by Runtime Spec v1.
const PARAMETER_ID_PATTERN = /^[A-Za-z0-9_.-]{1,128}$/;

export type EvaluationBlendModeV1 =
  | "normal"
  | "add"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"
  | "color-dodge"
  | "color-burn"
  | "hard-light"
  | "soft-light"
  | "difference"
  | "exclusion";

export interface EvaluationRgbColorV1 {
  r: number;
  g: number;
  b: number;
}

export interface ViviClipMaskEdgeV1 {
  layerId: string;
  invert: boolean;
}

export interface EvaluationMeshDataV1 {
  vertices: number[];
  uvs: number[];
  indices: number[];
  divisionsX: number;
  divisionsY: number;
}

export interface EvaluationBoneDataV1 {
  angle: number;
  length: number;
  scaleX: number;
  scaleY: number;
}

export interface EvaluationArtPathControlPointV1 {
  x: number;
  y: number;
  handleInX: number;
  handleInY: number;
  handleOutX: number;
  handleOutY: number;
  width: number;
  opacity: number;
}

export interface EvaluationArtPathStyleV1 {
  color: number;
  baseWidth: number;
  lineCap: "butt" | "round" | "square";
  lineJoin: "miter" | "round" | "bevel";
}

export interface EvaluationLayerBaseV1 {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  x: number;
  y: number;
  width: number;
  height: number;
  blendMode: EvaluationBlendModeV1;
  expanded: boolean;
  children: EvaluationLayerNodeV1[];
  clipMaskIds?: string[];
  clipMasks?: ViviClipMaskEdgeV1[];
  drawOrder?: number;
  multiplyColor?: EvaluationRgbColorV1;
  screenColor?: EvaluationRgbColorV1;
}

export interface EvaluationViviMeshNodeV1 extends EvaluationLayerBaseV1 {
  kind: "viviMesh";
  mesh: EvaluationMeshDataV1;
  culling?: boolean;
}

export interface EvaluationGroupNodeV1 extends EvaluationLayerBaseV1 {
  kind: "group";
}

export interface EvaluationBoneNodeV1 extends EvaluationLayerBaseV1 {
  kind: "bone";
  bone: EvaluationBoneDataV1;
  parentBoneId?: string;
}

export interface EvaluationArtPathNodeV1 extends EvaluationLayerBaseV1 {
  kind: "artPath";
  controlPoints: EvaluationArtPathControlPointV1[];
  closed: boolean;
  style: EvaluationArtPathStyleV1;
}

export type EvaluationLayerNodeV1 =
  | EvaluationViviMeshNodeV1
  | EvaluationGroupNodeV1
  | EvaluationBoneNodeV1
  | EvaluationArtPathNodeV1;

export interface EvaluationParameterDefinitionV1 {
  id: string;
  name: string;
  minValue: number;
  maxValue: number;
  defaultValue: number;
  pairedParameterId?: string;
  group?: string;
}

export interface EvaluationBindingPointV1 {
  paramValue: number;
  targetValue: number;
}

export type EvaluationBindingTargetV1 =
  | {
      type: "bone";
      boneId: string;
      property: "x" | "y" | "angle" | "scaleX" | "scaleY";
    }
  | {
      type: "ikController";
      controllerId: string;
      property: "targetX" | "targetY" | "poleTargetX" | "poleTargetY" | "influence";
    };

export interface EvaluationParameterBindingV1 {
  id: string;
  parameterId: string;
  target: EvaluationBindingTargetV1;
  bindingPoints: EvaluationBindingPointV1[];
}

export interface EvaluationSkinWeightV1 {
  boneId: string;
  weight: number;
}

export type EvaluationAffineMatrixV1 = [number, number, number, number, number, number];

export interface EvaluationSkinDataV1 {
  weights: EvaluationSkinWeightV1[][];
  bindPoseInverse: Record<string, EvaluationAffineMatrixV1>;
}

export interface EvaluationIKBoneConstraintV1 {
  boneId: string;
  minAngle: number;
  maxAngle: number;
}

export interface EvaluationIKParameterMappingV1 {
  boneId: string;
  parameterId: string;
  angleMin: number;
  angleMax: number;
  paramMin: number;
  paramMax: number;
}

export interface EvaluationIKControllerV1 {
  id: string;
  name: string;
  solverType: "twoBone" | "ccd";
  boneChain: EvaluationIKBoneConstraintV1[];
  targetX: number;
  targetY: number;
  influence: number;
  poleTargetX?: number;
  poleTargetY?: number;
  maxIterations?: number;
  parameterMappings: EvaluationIKParameterMappingV1[];
}

export interface EvaluationPendulumConfigV1 {
  length: number;
  mass: number;
  damping: number;
}

export interface EvaluationPhysicsInputV1 {
  parameterId: string;
  weight: number;
  type: "x" | "y" | "angle";
}

export interface EvaluationPhysicsOutputV1 {
  parameterId?: string;
  boneId?: string;
  pendulumIndex: number;
  weight: number;
  type: "angle" | "boneAngle";
}

export interface EvaluationPhysicsGroupV1 {
  id: string;
  name: string;
  enabled: boolean;
  pendulums: EvaluationPendulumConfigV1[];
  inputs: EvaluationPhysicsInputV1[];
  outputs: EvaluationPhysicsOutputV1[];
  gravityDirection: number;
  gravityStrength: number;
  wind: number;
}

export type EvaluationColliderShapeV1 =
  | { type: "rectangle"; x: number; y: number; width: number; height: number }
  | { type: "circle"; x: number; y: number; radius: number }
  | { type: "mesh"; meshId: string };

export interface EvaluationColliderDataV1 {
  id: string;
  name: string;
  shape: EvaluationColliderShapeV1;
  tag?: string;
  enabled: boolean;
}

export interface EvaluationExpressionPresetV1 {
  id: string;
  name: string;
  values: Record<string, number>;
  color?: string;
  hotkey?: number;
}

export type EvaluationInterpolationTypeV1 =
  | "linear"
  | "step"
  | "bezier"
  | "ellipse"
  | "sns";

export interface EvaluationTimelineKeyframeV1 {
  frame: number;
  value: number;
  interpolation: EvaluationInterpolationTypeV1;
  cp1x?: number;
  cp1y?: number;
  cp2x?: number;
  cp2y?: number;
  ellipseRatio?: number;
  ellipseDirection?: "cw" | "ccw";
  snsOscillations?: number;
  snsDamping?: number;
}

export interface EvaluationAnimationTrackV1 {
  parameterId: string;
  keyframes: EvaluationTimelineKeyframeV1[];
}

export interface EvaluationBoneTrackV1 {
  boneId: string;
  property: "angle" | "scaleX" | "scaleY";
  keyframes: EvaluationTimelineKeyframeV1[];
}

export interface EvaluationImageSequenceEntryV1 {
  startFrame: number;
  imageId: string;
}

export interface EvaluationImageSequenceTrackV1 {
  targetMeshId: string;
  entries: EvaluationImageSequenceEntryV1[];
}

export interface EvaluationAudioTrackV1 {
  id: string;
  name: string;
  sourcePath: string;
  startFrame: number;
  sourceDurationSeconds: number | null;
  gain: number;
  muted: boolean;
}

export interface EvaluationLipSyncTrackV1 {
  id: string;
  name: string;
  sourceAudioTrackId: string;
  analysisType: "rms";
  analysisFps: number;
  samples: number[];
  targetParameterId: string | null;
  sourcePathAtBake: string;
  sourceDurationSecondsAtBake: number | null;
  gain: number;
  muted: boolean;
}

export interface EvaluationIKControllerTrackV1 {
  controllerId: string;
  targetXKeyframes: EvaluationTimelineKeyframeV1[];
  targetYKeyframes: EvaluationTimelineKeyframeV1[];
}

export interface EvaluationAnimationClipV1 {
  id: string;
  name: string;
  duration: number;
  fps: number;
  tracks: EvaluationAnimationTrackV1[];
  boneTracks?: EvaluationBoneTrackV1[];
  imageSequenceTracks?: EvaluationImageSequenceTrackV1[];
  audioTracks?: EvaluationAudioTrackV1[];
  lipSyncTracks?: EvaluationLipSyncTrackV1[];
  ikControllerTracks?: EvaluationIKControllerTrackV1[];
}

export interface EvaluationTransitionConditionV1 {
  parameterId: string;
  operator: ">" | "<" | ">=" | "<=" | "==" | "!=";
  threshold: number;
}

export interface EvaluationBlendTreeEntryV1 {
  threshold: number;
  clipId: string;
}

export interface EvaluationBlendTree1DV1 {
  parameterId: string;
  entries: EvaluationBlendTreeEntryV1[];
}

export interface EvaluationAnimationStateV1 {
  id: string;
  name: string;
  clipId?: string;
  blendTree?: EvaluationBlendTree1DV1;
  loop: boolean;
}

export interface EvaluationStateTransitionV1 {
  id: string;
  fromStateId: string;
  toStateId: string;
  conditions: EvaluationTransitionConditionV1[];
  transitionDuration: number;
  priority: number;
}

export interface EvaluationAnimationStateMachineV1 {
  id: string;
  name: string;
  states: EvaluationAnimationStateV1[];
  transitions: EvaluationStateTransitionV1[];
  initialStateId: string;
  enabled: boolean;
  blendMode?: "override" | "additive";
  weight?: number;
}

export interface EvaluationAtlasEntryV1 {
  layerId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ViviAssetRefV1 {
  objectAddress: string;
  storageKind: "blob" | "chunk_manifest";
  contentSha256: string;
  mediaType: string;
  sizeBytes: number;
}

export interface ResolvedEvaluationAtlasV1 {
  id: string;
  image: ViviAssetRefV1;
  width: number;
  height: number;
  entries: AtlasEntry[];
}

export interface ResolvedAuthoringProjectV1 {
  project: ProjectData;
  atlases: ResolvedEvaluationAtlasV1[];
  compatibility: "full" | "readOnly";
}

export interface EvaluationAtlasRefV1 {
  id: string;
  width: number;
  height: number;
  entries: EvaluationAtlasEntryV1[];
}

export interface ViviEvaluationPayloadV1 {
  schema: typeof VIVI_EVALUATION_SCHEMA_V1;
  canvas: { width: number; height: number };
  layers: EvaluationLayerNodeV1[];
  parameters: EvaluationParameterDefinitionV1[];
  parameterBindings: EvaluationParameterBindingV1[];
  skins: Record<string, EvaluationSkinDataV1>;
  ikControllers: EvaluationIKControllerV1[];
  physicsGroups: EvaluationPhysicsGroupV1[];
  colliders: EvaluationColliderDataV1[];
  expressionPresets: EvaluationExpressionPresetV1[];
  clips: EvaluationAnimationClipV1[];
  stateMachines: EvaluationAnimationStateMachineV1[];
  atlases: EvaluationAtlasRefV1[];
}

export interface EvaluationTextureBindingV1 {
  id: string;
  asset: ViviAssetRefV1;
  width: number;
  height: number;
  mediaType: "image/png";
  colorSpace: "srgb";
  alphaMode: "straight";
}

export interface EvaluationTexturePlanV1 {
  schema: typeof VIVI_EVALUATION_TEXTURE_PLAN_SCHEMA_V1;
  textures: EvaluationTextureBindingV1[];
}

export interface EvaluationPayloadBuildResultV1 {
  payload: ViviEvaluationPayloadV1;
  texturePlan: EvaluationTexturePlanV1;
}

export interface EvaluationPayloadBuildOptionsV1 {
  /** Tests may lower generated-output ceilings without allocating huge graphs. */
  testOutputGraphLimits?: Partial<{
    maxContainerDepth: number;
    maxTokens: number;
  }>;
}

export type EvaluationPayloadErrorCode =
  | "VIVI_ERR_EVALUATION_PAYLOAD"
  | "VIVI_ERR_EVALUATION_FORBIDDEN"
  | "VIVI_ERR_EVALUATION_FORBIDDEN_STATE"
  | "VIVI_ERR_LIMIT_EXCEEDED";

export class EvaluationPayloadError extends Error {
  readonly code: EvaluationPayloadErrorCode;

  constructor(code: EvaluationPayloadErrorCode, message: string) {
    super(message);
    this.name = "EvaluationPayloadError";
    this.code = code;
  }
}

/** Build the owned payload/texture-plan snapshot shared by all editor hosts. */
export function buildEvaluationPayload(
  resolved: ResolvedAuthoringProjectV1,
  options: EvaluationPayloadBuildOptionsV1 = {},
): EvaluationPayloadBuildResultV1 {
  preflightEvaluationGraph(resolved, "resolved", DEFAULT_INPUT_GRAPH_LIMITS);
  scanForbiddenMarkers(resolved, "resolved");
  validateResolvedAssetRefOwnKeys(resolved.atlases);

  if (resolved.compatibility !== "full" && resolved.compatibility !== "readOnly") {
    throw new EvaluationPayloadError(
      "VIVI_ERR_EVALUATION_FORBIDDEN_STATE",
      "Evaluation payload generation requires full or render-capable readOnly compatibility.",
    );
  }

  const payload: ViviEvaluationPayloadV1 = {
    schema: VIVI_EVALUATION_SCHEMA_V1,
    canvas: {
      width: resolved.project.width,
      height: resolved.project.height,
    },
    layers: resolved.project.layers.map(copyEvaluationLayer),
    parameters: resolved.project.parameters.map(copyEvaluationParameter),
    parameterBindings: (resolved.project.parameterBindings ?? []).map(
      copyEvaluationParameterBinding,
    ),
    skins: Object.fromEntries(
      Object.entries(resolved.project.skins)
        .sort(([left], [right]) => utf8ByteOrder(left, right))
        .map(([id, skin]) => [id, copyEvaluationSkin(skin)]),
    ),
    ikControllers: (resolved.project.ikControllers ?? []).map(copyEvaluationIk),
    physicsGroups: resolved.project.physicsGroups.map(copyEvaluationPhysicsGroup),
    colliders: resolved.project.colliders.map(copyEvaluationCollider),
    expressionPresets: (resolved.project.expressionPresets ?? []).map(
      copyEvaluationExpressionPreset,
    ),
    clips: resolved.project.clips.map(copyEvaluationClip),
    stateMachines: resolved.project.stateMachines.map(copyEvaluationStateMachine),
    atlases: resolved.atlases.map((atlas) => ({
      id: atlas.id,
      width: atlas.width,
      height: atlas.height,
      entries: atlas.entries.map(copyEvaluationAtlasEntry),
    })),
  };

  const texturePlan: EvaluationTexturePlanV1 = {
    schema: VIVI_EVALUATION_TEXTURE_PLAN_SCHEMA_V1,
    textures: resolved.atlases
      .map(
        (atlas): EvaluationTextureBindingV1 => ({
          id: `atlas:${atlas.id}`,
          asset: copyEvaluationAssetRef(atlas.image),
          width: atlas.width,
          height: atlas.height,
          mediaType: "image/png",
          colorSpace: "srgb",
          alphaMode: "straight",
        }),
      )
      .sort((left, right) => utf8ByteOrder(left.id, right.id)),
  };

  canonicalizeOwnedNegativeZero(payload);
  canonicalizeOwnedNegativeZero(texturePlan);
  const outputGraphLimits = resolveOutputGraphLimits(options.testOutputGraphLimits);
  preflightEvaluationGraph(payload, "payload", outputGraphLimits);
  preflightEvaluationGraph(texturePlan, "texturePlan", outputGraphLimits);
  scanForbiddenMarkers(payload);
  scanFiniteNumbers(payload);
  scanFiniteNumbers(texturePlan, "texturePlan");
  assertEvaluationSchemaValid("payload", validateEvaluationPayloadV1Schema(payload));
  assertEvaluationSchemaValid(
    "texturePlan",
    validateEvaluationTexturePlanV1Schema(texturePlan),
  );
  validateResolvedProject(resolved);
  const payloadBytes = utf8ByteLength(JSON.stringify(payload));
  assertAtMost(
    payloadBytes,
    VIVI_RUNTIME_LIMITS.maxPayloadBytes,
    "serialized evaluation payload bytes",
  );
  return { payload, texturePlan };
}

function assertEvaluationSchemaValid(
  label: "payload" | "texturePlan",
  issues: readonly EvaluationV1SchemaIssue[],
): void {
  const issue = issues[0];
  if (issue === undefined) return;
  throw payloadError(
    `${label} schema validation failed at ${issue.instancePath || "/"} ` +
      `(keyword ${issue.keyword}): ${issue.message}`,
  );
}

function copyEvaluationLayer(layer: LayerNode): EvaluationLayerNodeV1 {
  const base: EvaluationLayerBaseV1 = {
    id: layer.id,
    name: layer.name,
    visible: layer.visible,
    opacity: layer.opacity,
    x: layer.x,
    y: layer.y,
    width: layer.width,
    height: layer.height,
    blendMode: layer.blendMode,
    expanded: layer.expanded,
    children: layer.children.map(copyEvaluationLayer),
    ...canonicalEvaluationMaskFields(layer),
    ...optionalProperty("drawOrder", layer.drawOrder),
    ...optionalProperty("multiplyColor", copyOptionalRgb(layer.multiplyColor)),
    ...optionalProperty("screenColor", copyOptionalRgb(layer.screenColor)),
  };

  switch (layer.kind) {
    case "viviMesh":
      return {
        ...base,
        kind: "viviMesh",
        mesh: {
          vertices: layer.mesh.vertices.map((value) => value),
          uvs: layer.mesh.uvs.map((value) => value),
          indices: layer.mesh.indices.map((value) => value),
          divisionsX: layer.mesh.divisionsX,
          divisionsY: layer.mesh.divisionsY,
        },
        ...optionalProperty("culling", layer.culling),
      };
    case "group":
      return { ...base, kind: "group" };
    case "bone":
      return {
        ...base,
        kind: "bone",
        bone: {
          angle: layer.bone.angle,
          length: layer.bone.length,
          scaleX: layer.bone.scaleX,
          scaleY: layer.bone.scaleY,
        },
        ...optionalProperty("parentBoneId", layer.parentBoneId),
      };
    case "artPath":
      return {
        ...base,
        kind: "artPath",
        controlPoints: layer.controlPoints.map((point) => ({
          x: point.x,
          y: point.y,
          handleInX: point.handleInX,
          handleInY: point.handleInY,
          handleOutX: point.handleOutX,
          handleOutY: point.handleOutY,
          width: point.width,
          opacity: point.opacity,
        })),
        closed: layer.closed,
        style: {
          color: layer.style.color,
          baseWidth: layer.style.baseWidth,
          lineCap: layer.style.lineCap,
          lineJoin: layer.style.lineJoin,
        },
      };
  }
}

function canonicalEvaluationMaskFields(
  layer: LayerNode,
): Pick<EvaluationLayerBaseV1, "clipMaskIds" | "clipMasks"> {
  const clipMasks = sourceClipMasks(layer);
  if (layer.clipMaskIds !== undefined && clipMasks !== undefined) {
    throw payloadError(
      `layer ${layer.id} must not contain both clipMaskIds and clipMasks`,
    );
  }
  if (clipMasks === undefined) {
    return layer.clipMaskIds === undefined
      ? {}
      : { clipMaskIds: layer.clipMaskIds.map((maskId) => maskId) };
  }
  if (clipMasks.every(({ invert }) => !invert)) {
    return { clipMaskIds: clipMasks.map(({ layerId }) => layerId) };
  }
  return {
    clipMasks: clipMasks.map(({ layerId, invert }) => ({ layerId, invert })),
  };
}

function sourceClipMasks(layer: LayerNode): readonly ViviClipMaskEdgeV1[] | undefined {
  return (layer as LayerNode & { clipMasks?: ViviClipMaskEdgeV1[] }).clipMasks;
}

function copyEvaluationParameter(
  parameter: ParameterDefinition,
): EvaluationParameterDefinitionV1 {
  return {
    id: parameter.id,
    name: parameter.name,
    minValue: parameter.minValue,
    maxValue: parameter.maxValue,
    defaultValue: parameter.defaultValue,
    ...optionalProperty("pairedParameterId", parameter.pairedParameterId),
    ...optionalProperty("group", parameter.group),
  };
}

function copyEvaluationParameterBinding(
  binding: ParameterBinding,
): EvaluationParameterBindingV1 {
  const target: EvaluationBindingTargetV1 =
    binding.target.type === "bone"
      ? {
          type: "bone",
          boneId: binding.target.boneId,
          property: binding.target.property,
        }
      : {
          type: "ikController",
          controllerId: binding.target.controllerId,
          property: binding.target.property,
        };
  return {
    id: binding.id,
    parameterId: binding.parameterId,
    target,
    bindingPoints: binding.bindingPoints.map((point) => ({
      paramValue: point.paramValue,
      targetValue: point.targetValue,
    })),
  };
}

function copyEvaluationSkin(skin: SkinData): EvaluationSkinDataV1 {
  return {
    weights: skin.weights.map((row) =>
      row.map((weight) => ({ boneId: weight.boneId, weight: weight.weight })),
    ),
    bindPoseInverse: Object.fromEntries(
      Object.entries(skin.bindPoseInverse)
        .sort(([left], [right]) => utf8ByteOrder(left, right))
        .map(([boneId, matrix]) => [
          boneId,
          [
            matrix[0],
            matrix[1],
            matrix[2],
            matrix[3],
            matrix[4],
            matrix[5],
          ] satisfies EvaluationAffineMatrixV1,
        ]),
    ),
  };
}

function copyEvaluationIk(controller: IKController): EvaluationIKControllerV1 {
  return {
    id: controller.id,
    name: controller.name,
    solverType: controller.solverType,
    boneChain: controller.boneChain.map((constraint) => ({
      boneId: constraint.boneId,
      minAngle: constraint.minAngle,
      maxAngle: constraint.maxAngle,
    })),
    targetX: controller.targetX,
    targetY: controller.targetY,
    influence: controller.influence,
    ...optionalProperty("poleTargetX", controller.poleTargetX),
    ...optionalProperty("poleTargetY", controller.poleTargetY),
    ...optionalProperty("maxIterations", controller.maxIterations),
    parameterMappings: controller.parameterMappings.map((mapping) => ({
      boneId: mapping.boneId,
      parameterId: mapping.parameterId,
      angleMin: mapping.angleMin,
      angleMax: mapping.angleMax,
      paramMin: mapping.paramMin,
      paramMax: mapping.paramMax,
    })),
  };
}

function copyEvaluationPhysicsGroup(group: PhysicsGroup): EvaluationPhysicsGroupV1 {
  return {
    id: group.id,
    name: group.name,
    enabled: group.enabled,
    pendulums: group.pendulums.map((pendulum) => ({
      length: pendulum.length,
      mass: pendulum.mass,
      damping: pendulum.damping,
    })),
    inputs: group.inputs.map((input) => ({
      parameterId: input.parameterId,
      weight: input.weight,
      type: input.type,
    })),
    outputs: group.outputs.map((output) => ({
      ...optionalProperty("parameterId", output.parameterId),
      ...optionalProperty("boneId", output.boneId),
      pendulumIndex: output.pendulumIndex,
      weight: output.weight,
      type: output.type,
    })),
    gravityDirection: group.gravityDirection,
    gravityStrength: group.gravityStrength,
    wind: group.wind,
  };
}

function copyEvaluationCollider(collider: ColliderData): EvaluationColliderDataV1 {
  let shape: EvaluationColliderShapeV1;
  switch (collider.shape.type) {
    case "rectangle":
      shape = {
        type: "rectangle",
        x: collider.shape.x,
        y: collider.shape.y,
        width: collider.shape.width,
        height: collider.shape.height,
      };
      break;
    case "circle":
      shape = {
        type: "circle",
        x: collider.shape.x,
        y: collider.shape.y,
        radius: collider.shape.radius,
      };
      break;
    case "mesh":
      shape = { type: "mesh", meshId: collider.shape.meshId };
      break;
  }
  return {
    id: collider.id,
    name: collider.name,
    shape,
    ...optionalProperty("tag", collider.tag),
    enabled: collider.enabled,
  };
}

function copyEvaluationExpressionPreset(
  preset: ExpressionPreset,
): EvaluationExpressionPresetV1 {
  return {
    id: preset.id,
    name: preset.name,
    values: Object.fromEntries(
      Object.entries(preset.values)
        .sort(([left], [right]) => utf8ByteOrder(left, right))
        .map(([parameterId, value]) => [parameterId, value]),
    ),
    ...optionalProperty("color", preset.color),
    ...optionalProperty("hotkey", preset.hotkey),
  };
}

type SourceTimelineKeyframe = AnimationClip["tracks"][number]["keyframes"][number];
type SourceBoneTrack = NonNullable<AnimationClip["boneTracks"]>[number];
type SourceImageSequenceTrack = NonNullable<AnimationClip["imageSequenceTracks"]>[number];
type SourceAudioTrack = NonNullable<AnimationClip["audioTracks"]>[number];
type SourceLipSyncTrack = NonNullable<AnimationClip["lipSyncTracks"]>[number];
type SourceIkControllerTrack = NonNullable<AnimationClip["ikControllerTracks"]>[number];

function copyEvaluationTimelineKeyframe(
  keyframe: SourceTimelineKeyframe,
): EvaluationTimelineKeyframeV1 {
  return {
    frame: keyframe.frame,
    value: keyframe.value,
    interpolation: keyframe.interpolation,
    ...optionalProperty("cp1x", keyframe.cp1x),
    ...optionalProperty("cp1y", keyframe.cp1y),
    ...optionalProperty("cp2x", keyframe.cp2x),
    ...optionalProperty("cp2y", keyframe.cp2y),
    ...optionalProperty("ellipseRatio", keyframe.ellipseRatio),
    ...optionalProperty("ellipseDirection", keyframe.ellipseDirection),
    ...optionalProperty("snsOscillations", keyframe.snsOscillations),
    ...optionalProperty("snsDamping", keyframe.snsDamping),
  };
}

function copyEvaluationBoneTrack(track: SourceBoneTrack): EvaluationBoneTrackV1 {
  return {
    boneId: track.boneId,
    property: track.property,
    keyframes: track.keyframes.map(copyEvaluationTimelineKeyframe),
  };
}

function copyEvaluationImageSequenceTrack(
  track: SourceImageSequenceTrack,
): EvaluationImageSequenceTrackV1 {
  return {
    targetMeshId: track.targetMeshId,
    entries: track.entries.map((entry) => ({
      startFrame: entry.startFrame,
      imageId: entry.imageId,
    })),
  };
}

function copyEvaluationAudioTrack(track: SourceAudioTrack): EvaluationAudioTrackV1 {
  return {
    id: track.id,
    name: track.name,
    sourcePath: track.sourcePath,
    startFrame: track.startFrame,
    sourceDurationSeconds: track.sourceDurationSeconds,
    gain: track.gain,
    muted: track.muted,
  };
}

function copyEvaluationLipSyncTrack(track: SourceLipSyncTrack): EvaluationLipSyncTrackV1 {
  return {
    id: track.id,
    name: track.name,
    sourceAudioTrackId: track.sourceAudioTrackId,
    analysisType: track.analysisType,
    analysisFps: track.analysisFps,
    samples: track.samples.map((sample) => sample),
    targetParameterId: track.targetParameterId,
    sourcePathAtBake: track.sourcePathAtBake,
    sourceDurationSecondsAtBake: track.sourceDurationSecondsAtBake,
    gain: track.gain,
    muted: track.muted,
  };
}

function copyEvaluationIkControllerTrack(
  track: SourceIkControllerTrack,
): EvaluationIKControllerTrackV1 {
  return {
    controllerId: track.controllerId,
    targetXKeyframes: track.targetXKeyframes.map(copyEvaluationTimelineKeyframe),
    targetYKeyframes: track.targetYKeyframes.map(copyEvaluationTimelineKeyframe),
  };
}

function copyEvaluationClip(clip: AnimationClip): EvaluationAnimationClipV1 {
  return {
    id: clip.id,
    name: clip.name,
    duration: clip.duration,
    fps: clip.fps,
    tracks: clip.tracks.map((track) => ({
      parameterId: track.parameterId,
      keyframes: track.keyframes.map(copyEvaluationTimelineKeyframe),
    })),
    ...optionalProperty("boneTracks", clip.boneTracks?.map(copyEvaluationBoneTrack)),
    ...optionalProperty(
      "imageSequenceTracks",
      clip.imageSequenceTracks?.map(copyEvaluationImageSequenceTrack),
    ),
    ...optionalProperty("audioTracks", clip.audioTracks?.map(copyEvaluationAudioTrack)),
    ...optionalProperty(
      "lipSyncTracks",
      clip.lipSyncTracks?.map(copyEvaluationLipSyncTrack),
    ),
    ...optionalProperty(
      "ikControllerTracks",
      clip.ikControllerTracks?.map(copyEvaluationIkControllerTrack),
    ),
  };
}

function copyEvaluationStateMachine(
  machine: AnimationStateMachine,
): EvaluationAnimationStateMachineV1 {
  return {
    id: machine.id,
    name: machine.name,
    states: machine.states.map((state) => ({
      id: state.id,
      name: state.name,
      ...optionalProperty("clipId", state.clipId),
      ...optionalProperty(
        "blendTree",
        state.blendTree === undefined
          ? undefined
          : {
              parameterId: state.blendTree.parameterId,
              entries: state.blendTree.entries.map((entry) => ({
                threshold: entry.threshold,
                clipId: entry.clipId,
              })),
            },
      ),
      loop: state.loop,
    })),
    transitions: machine.transitions.map((transition) => ({
      id: transition.id,
      fromStateId: transition.fromStateId,
      toStateId: transition.toStateId,
      conditions: transition.conditions.map((condition) => ({
        parameterId: condition.parameterId,
        operator: condition.operator,
        threshold: condition.threshold,
      })),
      transitionDuration: transition.transitionDuration,
      priority: transition.priority,
    })),
    initialStateId: machine.initialStateId,
    enabled: machine.enabled,
    ...optionalProperty("blendMode", machine.blendMode),
    ...optionalProperty("weight", machine.weight),
  };
}

function copyEvaluationAtlasEntry(entry: AtlasEntry): EvaluationAtlasEntryV1 {
  return {
    layerId: entry.layerId,
    x: entry.x,
    y: entry.y,
    width: entry.width,
    height: entry.height,
  };
}

function copyEvaluationAssetRef(ref: ViviAssetRefV1): ViviAssetRefV1 {
  return {
    objectAddress: normalizeSha256Hex(ref.objectAddress),
    storageKind: ref.storageKind,
    contentSha256: normalizeSha256Hex(ref.contentSha256),
    mediaType: ref.mediaType,
    sizeBytes: ref.sizeBytes,
  };
}

function copyOptionalRgb(
  color: { r: number; g: number; b: number } | undefined,
): EvaluationRgbColorV1 | undefined {
  return color === undefined ? undefined : { r: color.r, g: color.g, b: color.b };
}

function optionalProperty<Key extends string, Value>(
  key: Key,
  value: Value | undefined,
): Partial<Record<Key, Value>> {
  return value === undefined ? {} : ({ [key]: value } as Record<Key, Value>);
}

function preflightEvaluationGraph(
  root: unknown,
  rootPath: string,
  limits: Readonly<{ maxContainerDepth: number; maxTokens: number }>,
): void {
  type Frame = {
    value: unknown;
    path: string;
    depth: number;
    exit: boolean;
  };
  const active = new WeakSet<object>();
  const stack: Frame[] = [{ value: root, path: rootPath, depth: 1, exit: false }];
  let tokenCount = 0;

  while (stack.length > 0) {
    const frame = stack.pop()!;
    if (typeof frame.value !== "object" || frame.value === null) {
      tokenCount += 1;
    } else if (frame.exit) {
      active.delete(frame.value);
      continue;
    } else {
      if (frame.depth > limits.maxContainerDepth) {
        throw new EvaluationPayloadError(
          "VIVI_ERR_LIMIT_EXCEEDED",
          `${frame.path} container depth exceeds ${limits.maxContainerDepth}`,
        );
      }
      if (active.has(frame.value)) {
        throw payloadError(`${frame.path} contains an object graph cycle`);
      }
      active.add(frame.value);
      stack.push({ ...frame, exit: true });

      const entries = graphDataEntries(frame.value, frame.path);
      const separators = Math.max(0, entries.length - 1);
      tokenCount += Array.isArray(frame.value)
        ? 2 + separators
        : 2 + entries.length * 2 + separators;
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        const [key, child] = entries[index]!;
        stack.push({
          value: child,
          path: Array.isArray(frame.value)
            ? `${frame.path}[${key}]`
            : `${frame.path}.${key}`,
          depth: frame.depth + 1,
          exit: false,
        });
      }
    }

    if (tokenCount > limits.maxTokens) {
      throw new EvaluationPayloadError(
        "VIVI_ERR_LIMIT_EXCEEDED",
        `${rootPath} tokens exceed ${limits.maxTokens}`,
      );
    }
  }
}

function graphDataEntries(
  value: object,
  path: string,
): Array<readonly [string, unknown]> {
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) {
      throw payloadError(`${path} must have the standard array prototype`);
    }
    const ownKeys = Reflect.ownKeys(value);
    if (
      ownKeys.some((key) => typeof key !== "string") ||
      ownKeys.length !== value.length + 1
    ) {
      throw payloadError(`${path} must be a dense array without extra properties`);
    }
    const entries: Array<readonly [string, unknown]> = [];
    for (let index = 0; index < value.length; index += 1) {
      const key = String(index);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        descriptor === undefined ||
        !("value" in descriptor) ||
        descriptor.enumerable !== true
      ) {
        throw payloadError(`${path}[${index}] must be an enumerable own data property`);
      }
      entries.push([key, descriptor.value]);
    }
    return entries;
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw payloadError(`${path} must have a plain object prototype`);
  }
  const entries: Array<readonly [string, unknown]> = [];
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") {
      throw payloadError(`${path} must not contain symbol properties`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      throw payloadError(`${path}.${key} must be an enumerable own data property`);
    }
    entries.push([key, descriptor.value]);
  }
  return entries;
}

function resolveOutputGraphLimits(
  overrides: EvaluationPayloadBuildOptionsV1["testOutputGraphLimits"],
): { maxContainerDepth: number; maxTokens: number } {
  const limits: { maxContainerDepth: number; maxTokens: number } = {
    ...DEFAULT_OUTPUT_GRAPH_LIMITS,
  };
  if (overrides === undefined) return limits;
  const knownKeys = ["maxContainerDepth", "maxTokens"] as const;
  const knownKeySet = new Set<string>(knownKeys);
  for (const key of Object.keys(overrides)) {
    if (!knownKeySet.has(key)) {
      throw new RangeError(`unknown testOutputGraphLimits key: ${key}`);
    }
  }
  for (const key of knownKeys) {
    const override = overrides[key];
    if (override === undefined) continue;
    if (!Number.isSafeInteger(override) || override < 0 || override > limits[key]) {
      throw new RangeError(
        `testOutputGraphLimits.${key} must be a safe integer from 0 through ${limits[key]}`,
      );
    }
    limits[key] = override;
  }
  return limits;
}

function validateResolvedAssetRefOwnKeys(
  atlases: readonly ResolvedEvaluationAtlasV1[],
): void {
  for (const atlas of atlases) {
    const path = `atlas ${atlas.id}`;
    const ref: unknown = atlas.image;
    if (!isRecord(ref)) {
      throw payloadError(`${path} asset ref must be an object`);
    }
    const prototype = Object.getPrototypeOf(ref);
    if (prototype !== Object.prototype && prototype !== null) {
      throw payloadError(`${path} asset ref must have a plain object prototype`);
    }

    const actualStringKeys = Object.getOwnPropertyNames(ref);
    const actualKeySet = new Set(actualStringKeys);
    const missing = ASSET_REF_OWN_KEYS.filter((key) => !actualKeySet.has(key));
    const expectedKeySet = new Set<string>(ASSET_REF_OWN_KEYS);
    const unexpected = actualStringKeys.filter((key) => !expectedKeySet.has(key)).sort();
    const unexpectedSymbols = Object.getOwnPropertySymbols(ref)
      .map((symbol) => String(symbol))
      .sort();
    const forbiddenUnexpected = unexpected.find((key) =>
      (VIVI_RUNTIME_FORBIDDEN_RAW_KEYS as readonly string[]).includes(key),
    );
    if (forbiddenUnexpected !== undefined) {
      throw new EvaluationPayloadError(
        "VIVI_ERR_EVALUATION_FORBIDDEN",
        `forbidden marker ${forbiddenUnexpected} at ${path} asset ref`,
      );
    }
    for (const discriminant of ["kind", "type"] as const) {
      const descriptor = Object.getOwnPropertyDescriptor(ref, discriminant);
      if (
        descriptor !== undefined &&
        "value" in descriptor &&
        typeof descriptor.value === "string" &&
        (VIVI_RUNTIME_FORBIDDEN_KIND_OR_TYPE as readonly string[]).includes(
          descriptor.value,
        )
      ) {
        throw new EvaluationPayloadError(
          "VIVI_ERR_EVALUATION_FORBIDDEN",
          `forbidden ${discriminant} value ${descriptor.value} at ${path} asset ref`,
        );
      }
    }
    if (missing.length > 0 || unexpected.length > 0 || unexpectedSymbols.length > 0) {
      const details = [
        missing.length === 0 ? undefined : `missing: ${missing.join(", ")}`,
        unexpected.length === 0 ? undefined : `unexpected: ${unexpected.join(", ")}`,
        unexpectedSymbols.length === 0
          ? undefined
          : `unexpected symbols: ${unexpectedSymbols.join(", ")}`,
      ].filter((detail): detail is string => detail !== undefined);
      throw payloadError(`${path} asset ref keys must match v1 (${details.join("; ")})`);
    }
    for (const key of ASSET_REF_OWN_KEYS) {
      const descriptor = Object.getOwnPropertyDescriptor(ref, key);
      if (
        descriptor === undefined ||
        !("value" in descriptor) ||
        descriptor.enumerable !== true
      ) {
        throw payloadError(
          `${path} asset ref ${key} must be an enumerable own data property`,
        );
      }
    }
  }
}

function validateEvaluationIdentifierDomains(
  project: ProjectData,
  atlases: readonly ResolvedEvaluationAtlasV1[],
): void {
  const simpleId = (value: unknown, label: string): void => {
    assertPattern(value, GENERAL_ID_PATTERN, label);
  };
  const parameterId = (value: unknown, label: string): void => {
    assertPattern(value, PARAMETER_ID_PATTERN, label);
  };

  const visitLayers = (layers: readonly LayerNode[]): void => {
    for (const layer of layers) {
      simpleId(layer.id, "layer id");
      for (const [maskIndex, maskId] of (layer.clipMaskIds ?? []).entries()) {
        simpleId(maskId, `layer ${layer.id} clipMaskIds[${maskIndex}]`);
      }
      for (const [maskIndex, mask] of (sourceClipMasks(layer) ?? []).entries()) {
        simpleId(mask.layerId, `layer ${layer.id} clipMasks[${maskIndex}].layerId`);
      }
      if (layer.kind === "bone" && layer.parentBoneId !== undefined) {
        simpleId(layer.parentBoneId, `layer ${layer.id} parentBoneId`);
      }
      visitLayers(layer.children);
    }
  };
  visitLayers(project.layers);

  for (const [parameterIndex, parameter] of project.parameters.entries()) {
    parameterId(parameter.id, `parameter[${parameterIndex}].id`);
    if (parameter.pairedParameterId !== undefined) {
      parameterId(
        parameter.pairedParameterId,
        `parameter[${parameterIndex}].pairedParameterId`,
      );
    }
  }

  for (const [bindingIndex, binding] of (project.parameterBindings ?? []).entries()) {
    simpleId(binding.id, `parameterBinding[${bindingIndex}].id`);
    parameterId(binding.parameterId, `parameterBinding[${bindingIndex}].parameterId`);
    if (binding.target.type === "bone") {
      simpleId(binding.target.boneId, `parameterBinding[${bindingIndex}].target.boneId`);
    } else if (binding.target.type === "ikController") {
      simpleId(
        binding.target.controllerId,
        `parameterBinding[${bindingIndex}].target.controllerId`,
      );
    }
  }

  for (const [meshId, skin] of Object.entries(project.skins)) {
    simpleId(meshId, "skin mesh id");
    for (const [rowIndex, row] of skin.weights.entries()) {
      for (const [weightIndex, weight] of row.entries()) {
        simpleId(
          weight.boneId,
          `skin ${meshId} weights[${rowIndex}][${weightIndex}].boneId`,
        );
      }
    }
    for (const boneId of Object.keys(skin.bindPoseInverse)) {
      simpleId(boneId, `skin ${meshId} bindPoseInverse bone id`);
    }
  }

  for (const [controllerIndex, controller] of (project.ikControllers ?? []).entries()) {
    simpleId(controller.id, `ikController[${controllerIndex}].id`);
    for (const [constraintIndex, constraint] of controller.boneChain.entries()) {
      simpleId(
        constraint.boneId,
        `ikController[${controllerIndex}].boneChain[${constraintIndex}].boneId`,
      );
    }
    for (const [mappingIndex, mapping] of controller.parameterMappings.entries()) {
      simpleId(
        mapping.boneId,
        `ikController[${controllerIndex}].parameterMappings[${mappingIndex}].boneId`,
      );
      parameterId(
        mapping.parameterId,
        `ikController[${controllerIndex}].parameterMappings[${mappingIndex}].parameterId`,
      );
    }
  }

  for (const [groupIndex, group] of project.physicsGroups.entries()) {
    simpleId(group.id, `physicsGroup[${groupIndex}].id`);
    for (const [inputIndex, input] of group.inputs.entries()) {
      parameterId(
        input.parameterId,
        `physicsGroup[${groupIndex}].inputs[${inputIndex}].parameterId`,
      );
    }
    for (const [outputIndex, output] of group.outputs.entries()) {
      if (output.parameterId !== undefined) {
        parameterId(
          output.parameterId,
          `physicsGroup[${groupIndex}].outputs[${outputIndex}].parameterId`,
        );
      }
      if (output.boneId !== undefined) {
        simpleId(
          output.boneId,
          `physicsGroup[${groupIndex}].outputs[${outputIndex}].boneId`,
        );
      }
    }
  }

  for (const [colliderIndex, collider] of project.colliders.entries()) {
    simpleId(collider.id, `collider[${colliderIndex}].id`);
    if (collider.shape.type === "mesh") {
      simpleId(collider.shape.meshId, `collider[${colliderIndex}].shape.meshId`);
    }
  }

  for (const [presetIndex, preset] of (project.expressionPresets ?? []).entries()) {
    simpleId(preset.id, `expressionPreset[${presetIndex}].id`);
    for (const expressionParameterId of Object.keys(preset.values)) {
      parameterId(
        expressionParameterId,
        `expressionPreset[${presetIndex}].values parameter id`,
      );
    }
  }

  for (const [clipIndex, clip] of project.clips.entries()) {
    simpleId(clip.id, `clip[${clipIndex}].id`);
    for (const [trackIndex, track] of clip.tracks.entries()) {
      parameterId(
        track.parameterId,
        `clip[${clipIndex}].tracks[${trackIndex}].parameterId`,
      );
    }
    for (const [trackIndex, track] of (clip.boneTracks ?? []).entries()) {
      simpleId(track.boneId, `clip[${clipIndex}].boneTracks[${trackIndex}].boneId`);
    }
    for (const [trackIndex, track] of (clip.imageSequenceTracks ?? []).entries()) {
      simpleId(
        track.targetMeshId,
        `clip[${clipIndex}].imageSequenceTracks[${trackIndex}].targetMeshId`,
      );
      for (const [entryIndex, entry] of track.entries.entries()) {
        simpleId(
          entry.imageId,
          `clip[${clipIndex}].imageSequenceTracks[${trackIndex}].entries[${entryIndex}].imageId`,
        );
      }
    }
    for (const [trackIndex, track] of (clip.audioTracks ?? []).entries()) {
      simpleId(track.id, `clip[${clipIndex}].audioTracks[${trackIndex}].id`);
    }
    for (const [trackIndex, track] of (clip.lipSyncTracks ?? []).entries()) {
      simpleId(track.id, `clip[${clipIndex}].lipSyncTracks[${trackIndex}].id`);
      simpleId(
        track.sourceAudioTrackId,
        `clip[${clipIndex}].lipSyncTracks[${trackIndex}].sourceAudioTrackId`,
      );
      if (track.targetParameterId !== null) {
        parameterId(
          track.targetParameterId,
          `clip[${clipIndex}].lipSyncTracks[${trackIndex}].targetParameterId`,
        );
      }
    }
    for (const [trackIndex, track] of (clip.ikControllerTracks ?? []).entries()) {
      simpleId(
        track.controllerId,
        `clip[${clipIndex}].ikControllerTracks[${trackIndex}].controllerId`,
      );
    }
  }

  for (const [machineIndex, machine] of project.stateMachines.entries()) {
    simpleId(machine.id, `stateMachine[${machineIndex}].id`);
    for (const [stateIndex, state] of machine.states.entries()) {
      simpleId(state.id, `stateMachine[${machineIndex}].states[${stateIndex}].id`);
      if (state.clipId !== undefined) {
        simpleId(
          state.clipId,
          `stateMachine[${machineIndex}].states[${stateIndex}].clipId`,
        );
      }
      if (state.blendTree !== undefined) {
        parameterId(
          state.blendTree.parameterId,
          `stateMachine[${machineIndex}].states[${stateIndex}].blendTree.parameterId`,
        );
        for (const [entryIndex, entry] of state.blendTree.entries.entries()) {
          simpleId(
            entry.clipId,
            `stateMachine[${machineIndex}].states[${stateIndex}].blendTree.entries[${entryIndex}].clipId`,
          );
        }
      }
    }
    for (const [transitionIndex, transition] of machine.transitions.entries()) {
      simpleId(
        transition.id,
        `stateMachine[${machineIndex}].transitions[${transitionIndex}].id`,
      );
      simpleId(
        transition.fromStateId,
        `stateMachine[${machineIndex}].transitions[${transitionIndex}].fromStateId`,
      );
      simpleId(
        transition.toStateId,
        `stateMachine[${machineIndex}].transitions[${transitionIndex}].toStateId`,
      );
      for (const [conditionIndex, condition] of transition.conditions.entries()) {
        parameterId(
          condition.parameterId,
          `stateMachine[${machineIndex}].transitions[${transitionIndex}].conditions[${conditionIndex}].parameterId`,
        );
      }
    }
    simpleId(machine.initialStateId, `stateMachine[${machineIndex}].initialStateId`);
  }

  for (const [atlasIndex, atlas] of atlases.entries()) {
    assertPattern(atlas.id, SOURCE_ATLAS_ID_PATTERN, `atlas[${atlasIndex}].id`);
    assertPattern(
      `atlas:${atlas.id}`,
      TEXTURE_BINDING_ID_PATTERN,
      `textureBinding[${atlasIndex}].id`,
    );
    for (const [entryIndex, entry] of atlas.entries.entries()) {
      simpleId(entry.layerId, `atlas[${atlasIndex}].entries[${entryIndex}].layerId`);
    }
  }
}

function canonicalizeOwnedNegativeZero(value: unknown): void {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const child = value[index];
      if (typeof child === "number" && Object.is(child, -0)) {
        value[index] = 0;
      } else {
        canonicalizeOwnedNegativeZero(child);
      }
    }
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (typeof child === "number" && Object.is(child, -0)) {
      value[key] = 0;
    } else {
      canonicalizeOwnedNegativeZero(child);
    }
  }
}

function validateResolvedProject(resolved: ResolvedAuthoringProjectV1): void {
  const { project, atlases } = resolved;
  validateEvaluationIdentifierDomains(project, atlases);
  assertPositiveInteger(project.width, "project.width");
  assertPositiveInteger(project.height, "project.height");
  assertAtMost(atlases.length, VIVI_RUNTIME_LIMITS.maxTextures, "textures");
  assertAtMost(
    project.parameters.length,
    VIVI_RUNTIME_LIMITS.maxParameters,
    "parameters",
  );
  assertAtMost(
    project.ikControllers?.length ?? 0,
    VIVI_RUNTIME_LIMITS.maxIkControllers,
    "IK controllers",
  );
  assertAtMost(
    project.physicsGroups.length,
    VIVI_RUNTIME_LIMITS.maxPhysicsGroups,
    "physics groups",
  );
  assertAtMost(project.colliders.length, VIVI_RUNTIME_LIMITS.maxColliders, "colliders");
  assertAtMost(
    project.clips.length,
    VIVI_RUNTIME_LIMITS.maxAnimationClips,
    "animation clips",
  );
  assertAtMost(
    project.stateMachines.length,
    VIVI_RUNTIME_LIMITS.maxStateMachines,
    "state machines",
  );

  const parameterIds = new Set<string>();
  for (const parameter of project.parameters) {
    assertPattern(parameter.id, PARAMETER_ID_PATTERN, "parameter id");
    assertUnique(parameterIds, parameter.id, "parameter id");
  }

  let bindingPointCount = 0;
  for (const binding of project.parameterBindings ?? []) {
    assertPattern(binding.id, GENERAL_ID_PATTERN, "parameter binding id");
    assertPattern(binding.parameterId, PARAMETER_ID_PATTERN, "binding parameter id");
    bindingPointCount += binding.bindingPoints.length;
    if (binding.target.type !== "bone" && binding.target.type !== "ikController") {
      throw payloadError("parameter binding target is outside the public IP boundary");
    }
  }
  assertAtMost(
    bindingPointCount,
    VIVI_RUNTIME_LIMITS.maxBindingPoints,
    "parameter binding points",
  );

  for (const group of project.physicsGroups) {
    assertAtMost(
      group.pendulums.length,
      VIVI_RUNTIME_LIMITS.maxPendulumsPerPhysicsGroup,
      `physics group ${group.id} pendulums`,
    );
    for (const [outputIndex, output] of group.outputs.entries()) {
      assertIntegerRange(
        output.pendulumIndex,
        0,
        VIVI_RUNTIME_LIMITS.maxPendulumsPerPhysicsGroup - 1,
        `physics group ${group.id} output ${outputIndex} pendulumIndex`,
      );
      if (output.pendulumIndex >= group.pendulums.length) {
        throw payloadError(
          `physics group ${group.id} output ${outputIndex} pendulumIndex is out of range`,
        );
      }
    }
  }
  for (const [controllerIndex, controller] of (project.ikControllers ?? []).entries()) {
    if (controller.maxIterations !== undefined) {
      assertIntegerRange(
        controller.maxIterations,
        1,
        MAX_IK_ITERATIONS,
        `IK controller ${controllerIndex} maxIterations`,
      );
    }
  }
  for (const [presetIndex, preset] of (project.expressionPresets ?? []).entries()) {
    if (preset.hotkey !== undefined) {
      assertIntegerRange(
        preset.hotkey,
        0,
        MAX_SAFE_INTEGER,
        `expression preset ${presetIndex} hotkey`,
      );
    }
  }
  for (const [clipIndex, clip] of project.clips.entries()) {
    validateClipNumericDomain(clip, clipIndex);
  }
  for (const machine of project.stateMachines) {
    assertAtMost(
      machine.states.length,
      VIVI_RUNTIME_LIMITS.maxStatesPerStateMachine,
      `state machine ${machine.id} states`,
    );
    assertAtMost(
      machine.transitions.length,
      VIVI_RUNTIME_LIMITS.maxTransitionsPerStateMachine,
      `state machine ${machine.id} transitions`,
    );
    for (const [transitionIndex, transition] of machine.transitions.entries()) {
      assertFiniteAtLeast(
        transition.transitionDuration,
        0,
        `state machine ${machine.id} transition ${transitionIndex} duration`,
      );
      assertIntegerRange(
        transition.priority,
        MIN_INT32,
        MAX_INT32,
        `state machine ${machine.id} transition ${transitionIndex} priority`,
      );
    }
  }

  const layerState = collectLayerState(project.layers);
  assertAtMost(layerState.layerCount, VIVI_RUNTIME_LIMITS.maxLayers, "layers");
  assertAtMost(layerState.meshCount, VIVI_RUNTIME_LIMITS.maxMeshes, "meshes");
  assertAtMost(layerState.boneIds.size, VIVI_RUNTIME_LIMITS.maxBones, "bones");
  validateMaskDepth(layerState.layersById);
  validateEvaluationReferences(project, layerState, parameterIds);

  const atlasIds = new Set<string>();
  const atlasLayers = new Set<string>();
  let textureBytes = 0;
  for (const atlas of atlases) {
    assertPattern(atlas.id, SOURCE_ATLAS_ID_PATTERN, "source atlas id");
    assertUnique(atlasIds, atlas.id, "source atlas id");
    assertPositiveInteger(atlas.width, `atlas ${atlas.id} width`);
    assertPositiveInteger(atlas.height, `atlas ${atlas.id} height`);
    assertAtMost(
      atlas.width,
      VIVI_EVALUATION_V1_TEXTURE_LIMITS.maxWidth,
      `atlas ${atlas.id} width`,
    );
    assertAtMost(
      atlas.height,
      VIVI_EVALUATION_V1_TEXTURE_LIMITS.maxHeight,
      `atlas ${atlas.id} height`,
    );
    const pixels = atlas.width * atlas.height;
    assertAtMost(
      pixels,
      VIVI_EVALUATION_V1_TEXTURE_LIMITS.maxPixels,
      `atlas ${atlas.id} pixels`,
    );
    const atlasTextureBytes = pixels * 4;
    assertAtMost(
      atlasTextureBytes,
      VIVI_EVALUATION_V1_TEXTURE_LIMITS.maxTextureBytes,
      `atlas ${atlas.id} texture bytes`,
    );
    textureBytes += atlasTextureBytes;
    validateAssetRef(atlas.image, `atlas ${atlas.id}`);
    if (atlas.image.mediaType !== "image/png") {
      throw payloadError(`atlas ${atlas.id} must resolve to image/png`);
    }
    assertAtMost(
      atlas.image.sizeBytes,
      VIVI_EVALUATION_V1_TEXTURE_LIMITS.maxPngInputBytes,
      `atlas ${atlas.id} PNG input bytes`,
    );
    for (const entry of atlas.entries) {
      if (!layerState.meshIds.has(entry.layerId)) {
        throw payloadError(`atlas ${atlas.id} references unknown mesh ${entry.layerId}`);
      }
      assertIntegerRange(
        entry.x,
        0,
        MAX_SAFE_INTEGER,
        `atlas ${atlas.id} entry ${entry.layerId} x`,
      );
      assertIntegerRange(
        entry.y,
        0,
        MAX_SAFE_INTEGER,
        `atlas ${atlas.id} entry ${entry.layerId} y`,
      );
      assertIntegerRange(
        entry.width,
        0,
        MAX_SAFE_INTEGER,
        `atlas ${atlas.id} entry ${entry.layerId} width`,
      );
      assertIntegerRange(
        entry.height,
        0,
        MAX_SAFE_INTEGER,
        `atlas ${atlas.id} entry ${entry.layerId} height`,
      );
      if (entry.x + entry.width > atlas.width || entry.y + entry.height > atlas.height) {
        throw payloadError(
          `atlas ${atlas.id} entry ${entry.layerId} exceeds atlas bounds`,
        );
      }
      assertUnique(atlasLayers, entry.layerId, "atlas layer entry");
    }
  }
  assertAtMost(
    textureBytes,
    VIVI_EVAL_V1_MAX_TOTAL_TEXTURE_BYTES,
    "evaluation plan total texture bytes",
  );
  for (const meshId of layerState.meshIds) {
    if (!atlasLayers.has(meshId)) {
      throw payloadError(`mesh ${meshId} has no atlas entry`);
    }
  }
}

function collectLayerState(layers: readonly LayerNode[]): {
  layerCount: number;
  meshCount: number;
  layersById: Map<string, LayerNode>;
  pathsById: Map<string, string>;
  meshIds: Set<string>;
  boneIds: Set<string>;
} {
  const layersById = new Map<string, LayerNode>();
  const pathsById = new Map<string, string>();
  const meshIds = new Set<string>();
  const boneIds = new Set<string>();
  const visited = new WeakSet<object>();
  let layerCount = 0;
  let meshCount = 0;

  const visit = (nodes: readonly LayerNode[], basePath: string): void => {
    for (const [layerIndex, layer] of nodes.entries()) {
      const path = `${basePath}/${layerIndex}`;
      if (visited.has(layer)) {
        throw payloadError(`${path} layer tree contains a cycle or alias`);
      }
      visited.add(layer);
      layerCount += 1;
      assertPattern(layer.id, GENERAL_ID_PATTERN, "layer id");
      if (layersById.has(layer.id)) {
        throw payloadError(`duplicate layer id: ${layer.id}`);
      }
      layersById.set(layer.id, layer);
      pathsById.set(layer.id, path);
      if (layer.drawOrder !== undefined) {
        assertIntegerRange(
          layer.drawOrder,
          MIN_INT32,
          MAX_INT32,
          `layer ${layer.id} drawOrder`,
        );
      }
      const clipMasks = sourceClipMasks(layer);
      if (layer.clipMaskIds !== undefined && clipMasks !== undefined) {
        throw payloadError(
          `layer ${layer.id} must not contain both clipMaskIds and clipMasks`,
        );
      }
      const maskIds = clipMasks?.map(({ layerId }) => layerId) ?? layer.clipMaskIds ?? [];
      const uniqueMaskIds = new Set<string>();
      for (const maskId of maskIds) {
        assertPattern(maskId, GENERAL_ID_PATTERN, `layer ${layer.id} mask id`);
        assertUnique(uniqueMaskIds, maskId, `layer ${layer.id} mask id`);
      }
      if (layer.kind === "viviMesh") {
        meshCount += 1;
        meshIds.add(layer.id);
        const vertexCount = layer.mesh.vertices.length / 2;
        if (
          layer.mesh.vertices.length === 0 ||
          layer.mesh.vertices.length % 2 !== 0 ||
          layer.mesh.uvs.length !== layer.mesh.vertices.length
        ) {
          throw payloadError(`mesh ${layer.id} has incomplete vertex/UV data`);
        }
        if (layer.mesh.indices.length === 0 || layer.mesh.indices.length % 3 !== 0) {
          throw payloadError(`mesh ${layer.id} has incomplete triangle indices`);
        }
        assertAtMost(
          vertexCount,
          VIVI_RUNTIME_LIMITS.maxVerticesPerMesh,
          `mesh ${layer.id} vertices`,
        );
        assertAtMost(
          layer.mesh.indices.length,
          VIVI_RUNTIME_LIMITS.maxIndicesPerMesh,
          `mesh ${layer.id} indices`,
        );
        for (const index of layer.mesh.indices) {
          if (!Number.isInteger(index) || index < 0 || index >= vertexCount) {
            throw payloadError(`mesh ${layer.id} has an out-of-range index`);
          }
        }
        assertIntegerRange(
          layer.mesh.divisionsX,
          0,
          MAX_SAFE_INTEGER,
          `mesh ${layer.id} divisionsX`,
        );
        assertIntegerRange(
          layer.mesh.divisionsY,
          0,
          MAX_SAFE_INTEGER,
          `mesh ${layer.id} divisionsY`,
        );
      } else if (layer.kind === "bone") {
        boneIds.add(layer.id);
      }
      visit(layer.children, `${path}/children`);
    }
  };
  visit(layers, "/payload/layers");
  validateBoneParentGraph(layersById, pathsById, boneIds);
  return { layerCount, meshCount, layersById, pathsById, meshIds, boneIds };
}

function validateBoneParentGraph(
  layersById: ReadonlyMap<string, LayerNode>,
  pathsById: ReadonlyMap<string, string>,
  boneIds: ReadonlySet<string>,
): void {
  for (const boneId of boneIds) {
    const layer = layersById.get(boneId);
    if (layer?.kind !== "bone" || layer.parentBoneId === undefined) continue;
    if (!boneIds.has(layer.parentBoneId)) {
      throw payloadError(
        `${pathsById.get(boneId)}/parentBoneId references missing bone ${layer.parentBoneId}`,
      );
    }
  }

  const complete = new Set<string>();
  for (const startBoneId of boneIds) {
    if (complete.has(startBoneId)) continue;
    const chain: string[] = [];
    const chainIndex = new Map<string, number>();
    let boneId: string | undefined = startBoneId;
    while (boneId !== undefined && !complete.has(boneId)) {
      const cycleStart = chainIndex.get(boneId);
      if (cycleStart !== undefined) {
        const cycle = [...chain.slice(cycleStart), boneId];
        throw payloadError(
          `${pathsById.get(boneId)}/parentBoneId bone parent cycle: ${cycle.join(
            " -> ",
          )}`,
        );
      }
      chainIndex.set(boneId, chain.length);
      chain.push(boneId);
      const layer = layersById.get(boneId);
      boneId = layer?.kind === "bone" ? layer.parentBoneId : undefined;
    }
    for (const visitedBoneId of chain) complete.add(visitedBoneId);
  }
}

type EvaluationLayerState = ReturnType<typeof collectLayerState>;

function validateEvaluationReferences(
  project: ProjectData,
  layers: EvaluationLayerState,
  parameterIds: ReadonlySet<string>,
): void {
  for (const [parameterIndex, parameter] of project.parameters.entries()) {
    const path = `/payload/parameters/${parameterIndex}`;
    if (
      parameter.minValue > parameter.defaultValue ||
      parameter.defaultValue > parameter.maxValue
    ) {
      throw payloadError(
        `${path} parameter range must satisfy minValue <= defaultValue <= maxValue`,
      );
    }
    if (
      parameter.pairedParameterId !== undefined &&
      !parameterIds.has(parameter.pairedParameterId)
    ) {
      missingEvaluationReference(
        `${path}/pairedParameterId`,
        "parameter",
        parameter.pairedParameterId,
      );
    }
  }

  const controllers = project.ikControllers ?? [];
  const controllerIds = collectUniqueEvaluationIds(
    controllers,
    "/payload/ikControllers",
    "IK controller",
  );
  for (const [controllerIndex, controller] of controllers.entries()) {
    const path = `/payload/ikControllers/${controllerIndex}`;
    for (const [constraintIndex, constraint] of controller.boneChain.entries()) {
      assertEvaluationReference(
        layers.boneIds,
        constraint.boneId,
        `${path}/boneChain/${constraintIndex}/boneId`,
        "bone",
      );
    }
    for (const [mappingIndex, mapping] of controller.parameterMappings.entries()) {
      assertEvaluationReference(
        layers.boneIds,
        mapping.boneId,
        `${path}/parameterMappings/${mappingIndex}/boneId`,
        "bone",
      );
      assertEvaluationReference(
        parameterIds,
        mapping.parameterId,
        `${path}/parameterMappings/${mappingIndex}/parameterId`,
        "parameter",
      );
    }
  }

  const bindingIds = new Set<string>();
  for (const [bindingIndex, binding] of (project.parameterBindings ?? []).entries()) {
    const path = `/payload/parameterBindings/${bindingIndex}`;
    assertUniqueEvaluationId(bindingIds, binding.id, `${path}/id`, "binding");
    assertEvaluationReference(
      parameterIds,
      binding.parameterId,
      `${path}/parameterId`,
      "parameter",
    );
    if (binding.target.type === "bone") {
      assertEvaluationReference(
        layers.boneIds,
        binding.target.boneId,
        `${path}/target/boneId`,
        "bone",
      );
    } else {
      assertEvaluationReference(
        controllerIds,
        binding.target.controllerId,
        `${path}/target/controllerId`,
        "IK controller",
      );
    }
  }

  validateEvaluationSkins(project, layers);

  const physicsGroupIds = new Set<string>();
  for (const [groupIndex, group] of project.physicsGroups.entries()) {
    const path = `/payload/physicsGroups/${groupIndex}`;
    assertUniqueEvaluationId(physicsGroupIds, group.id, `${path}/id`, "physics group");
    for (const [inputIndex, input] of group.inputs.entries()) {
      assertEvaluationReference(
        parameterIds,
        input.parameterId,
        `${path}/inputs/${inputIndex}/parameterId`,
        "parameter",
      );
    }
    for (const [outputIndex, output] of group.outputs.entries()) {
      const outputPath = `${path}/outputs/${outputIndex}`;
      if (output.parameterId !== undefined) {
        assertEvaluationReference(
          parameterIds,
          output.parameterId,
          `${outputPath}/parameterId`,
          "parameter",
        );
      }
      if (output.boneId !== undefined) {
        assertEvaluationReference(
          layers.boneIds,
          output.boneId,
          `${outputPath}/boneId`,
          "bone",
        );
      }
    }
  }

  const colliderIds = new Set<string>();
  for (const [colliderIndex, collider] of project.colliders.entries()) {
    const path = `/payload/colliders/${colliderIndex}`;
    assertUniqueEvaluationId(colliderIds, collider.id, `${path}/id`, "collider");
    if (collider.shape.type === "mesh") {
      assertEvaluationReference(
        layers.meshIds,
        collider.shape.meshId,
        `${path}/shape/meshId`,
        "mesh",
      );
    }
  }

  const expressionIds = new Set<string>();
  for (const [presetIndex, preset] of (project.expressionPresets ?? []).entries()) {
    const path = `/payload/expressionPresets/${presetIndex}`;
    assertUniqueEvaluationId(expressionIds, preset.id, `${path}/id`, "expression preset");
    for (const parameterId of Object.keys(preset.values)) {
      assertEvaluationReference(
        parameterIds,
        parameterId,
        `${path}/values/${escapeJsonPointer(parameterId)}`,
        "parameter",
      );
    }
  }

  const clipIds = collectUniqueEvaluationIds(project.clips, "/payload/clips", "clip");
  for (const [clipIndex, clip] of project.clips.entries()) {
    const path = `/payload/clips/${clipIndex}`;
    for (const [trackIndex, track] of clip.tracks.entries()) {
      assertEvaluationReference(
        parameterIds,
        track.parameterId,
        `${path}/tracks/${trackIndex}/parameterId`,
        "parameter",
      );
    }
    for (const [trackIndex, track] of (clip.boneTracks ?? []).entries()) {
      assertEvaluationReference(
        layers.boneIds,
        track.boneId,
        `${path}/boneTracks/${trackIndex}/boneId`,
        "bone",
      );
    }
    for (const [trackIndex, track] of (clip.imageSequenceTracks ?? []).entries()) {
      assertEvaluationReference(
        layers.meshIds,
        track.targetMeshId,
        `${path}/imageSequenceTracks/${trackIndex}/targetMeshId`,
        "mesh",
      );
    }
    const audioIds = collectUniqueEvaluationIds(
      clip.audioTracks ?? [],
      `${path}/audioTracks`,
      "audio track",
    );
    for (const [trackIndex, track] of (clip.lipSyncTracks ?? []).entries()) {
      assertEvaluationReference(
        audioIds,
        track.sourceAudioTrackId,
        `${path}/lipSyncTracks/${trackIndex}/sourceAudioTrackId`,
        "audio track",
      );
      if (track.targetParameterId !== null) {
        assertEvaluationReference(
          parameterIds,
          track.targetParameterId,
          `${path}/lipSyncTracks/${trackIndex}/targetParameterId`,
          "parameter",
        );
      }
    }
    for (const [trackIndex, track] of (clip.ikControllerTracks ?? []).entries()) {
      assertEvaluationReference(
        controllerIds,
        track.controllerId,
        `${path}/ikControllerTracks/${trackIndex}/controllerId`,
        "IK controller",
      );
    }
  }

  const machineIds = new Set<string>();
  for (const [machineIndex, machine] of project.stateMachines.entries()) {
    const path = `/payload/stateMachines/${machineIndex}`;
    assertUniqueEvaluationId(machineIds, machine.id, `${path}/id`, "state machine");
    const stateIds = collectUniqueEvaluationIds(
      machine.states,
      `${path}/states`,
      "state",
    );
    assertEvaluationReference(
      stateIds,
      machine.initialStateId,
      `${path}/initialStateId`,
      "state",
    );
    for (const [stateIndex, state] of machine.states.entries()) {
      const statePath = `${path}/states/${stateIndex}`;
      if (state.clipId !== undefined) {
        assertEvaluationReference(clipIds, state.clipId, `${statePath}/clipId`, "clip");
      }
      if (state.blendTree !== undefined) {
        assertEvaluationReference(
          parameterIds,
          state.blendTree.parameterId,
          `${statePath}/blendTree/parameterId`,
          "parameter",
        );
        for (const [entryIndex, entry] of state.blendTree.entries.entries()) {
          assertEvaluationReference(
            clipIds,
            entry.clipId,
            `${statePath}/blendTree/entries/${entryIndex}/clipId`,
            "clip",
          );
        }
      }
    }
    const transitionIds = new Set<string>();
    for (const [transitionIndex, transition] of machine.transitions.entries()) {
      const transitionPath = `${path}/transitions/${transitionIndex}`;
      assertUniqueEvaluationId(
        transitionIds,
        transition.id,
        `${transitionPath}/id`,
        "transition",
      );
      assertEvaluationReference(
        stateIds,
        transition.fromStateId,
        `${transitionPath}/fromStateId`,
        "state",
      );
      assertEvaluationReference(
        stateIds,
        transition.toStateId,
        `${transitionPath}/toStateId`,
        "state",
      );
      for (const [conditionIndex, condition] of transition.conditions.entries()) {
        assertEvaluationReference(
          parameterIds,
          condition.parameterId,
          `${transitionPath}/conditions/${conditionIndex}/parameterId`,
          "parameter",
        );
      }
    }
  }
}

function validateEvaluationSkins(
  project: ProjectData,
  layers: EvaluationLayerState,
): void {
  for (const [meshId, skin] of Object.entries(project.skins)) {
    const path = `/payload/skins/${escapeJsonPointer(meshId)}`;
    assertEvaluationReference(layers.meshIds, meshId, path, "mesh");
    const mesh = layers.layersById.get(meshId);
    const vertexCount = mesh?.kind === "viviMesh" ? mesh.mesh.vertices.length / 2 : 0;
    if (skin.weights.length !== vertexCount) {
      throw payloadError(
        `${path}/weights skin weight row count must equal mesh vertex count`,
      );
    }
    for (const [rowIndex, row] of skin.weights.entries()) {
      const rowPath = `${path}/weights/${rowIndex}`;
      if (row.length === 0) {
        throw payloadError(`${rowPath} skin weight row must not be empty`);
      }
      let totalWeight = 0;
      for (const [weightIndex, weight] of row.entries()) {
        const weightPath = `${rowPath}/${weightIndex}`;
        assertEvaluationReference(
          layers.boneIds,
          weight.boneId,
          `${weightPath}/boneId`,
          "bone",
        );
        if (!Number.isFinite(weight.weight) || weight.weight < 0 || weight.weight > 1) {
          throw payloadError(`${weightPath}/weight skin weight must be within 0..1`);
        }
        totalWeight += weight.weight;
      }
      if (Math.abs(totalWeight - 1) > 0.000_001) {
        throw payloadError(`${rowPath} skin weight row must sum to 1 within 0.000001`);
      }
    }
    for (const boneId of Object.keys(skin.bindPoseInverse)) {
      assertEvaluationReference(
        layers.boneIds,
        boneId,
        `${path}/bindPoseInverse/${escapeJsonPointer(boneId)}`,
        "bone",
      );
    }
  }
}

function collectUniqueEvaluationIds<T extends { id: string }>(
  values: readonly T[],
  path: string,
  label: string,
): Set<string> {
  const ids = new Set<string>();
  for (const [index, value] of values.entries()) {
    assertUniqueEvaluationId(ids, value.id, `${path}/${index}/id`, label);
  }
  return ids;
}

function assertUniqueEvaluationId(
  ids: Set<string>,
  id: string,
  path: string,
  label: string,
): void {
  if (ids.has(id)) {
    throw payloadError(`${path} duplicate ${label} id ${id}`);
  }
  ids.add(id);
}

function assertEvaluationReference(
  ids: ReadonlySet<string> | ReadonlyMap<string, unknown>,
  id: string,
  path: string,
  label: string,
): void {
  if (!ids.has(id)) missingEvaluationReference(path, label, id);
}

function missingEvaluationReference(path: string, label: string, id: string): never {
  throw payloadError(`${path} references missing ${label} ${id}`);
}

function escapeJsonPointer(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function validateClipNumericDomain(clip: AnimationClip, clipIndex: number): void {
  const clipLabel = `clip ${clipIndex} (${clip.id})`;
  assertFiniteAtLeast(clip.duration, 0, `${clipLabel} duration`);
  assertFiniteGreaterThan(clip.fps, 0, `${clipLabel} fps`);

  const validateKeyframes = (
    keyframes: readonly SourceTimelineKeyframe[],
    path: string,
  ): void => {
    for (const [keyframeIndex, keyframe] of keyframes.entries()) {
      assertFiniteAtLeast(keyframe.frame, 0, `${path} keyframe ${keyframeIndex} frame`);
    }
  };
  for (const [trackIndex, track] of clip.tracks.entries()) {
    validateKeyframes(track.keyframes, `${clipLabel} track ${trackIndex}`);
  }
  for (const [trackIndex, track] of (clip.boneTracks ?? []).entries()) {
    validateKeyframes(track.keyframes, `${clipLabel} bone track ${trackIndex}`);
  }
  for (const [trackIndex, track] of (clip.imageSequenceTracks ?? []).entries()) {
    for (const [entryIndex, entry] of track.entries.entries()) {
      assertFiniteAtLeast(
        entry.startFrame,
        0,
        `${clipLabel} image track ${trackIndex} entry ${entryIndex} startFrame`,
      );
    }
  }
  for (const [trackIndex, track] of (clip.audioTracks ?? []).entries()) {
    assertFiniteAtLeast(
      track.startFrame,
      0,
      `${clipLabel} audio track ${trackIndex} startFrame`,
    );
    if (track.sourceDurationSeconds !== null) {
      assertFiniteAtLeast(
        track.sourceDurationSeconds,
        0,
        `${clipLabel} audio track ${trackIndex} sourceDurationSeconds`,
      );
    }
  }
  for (const [trackIndex, track] of (clip.lipSyncTracks ?? []).entries()) {
    assertFiniteGreaterThan(
      track.analysisFps,
      0,
      `${clipLabel} lip-sync track ${trackIndex} analysisFps`,
    );
    if (track.sourceDurationSecondsAtBake !== null) {
      assertFiniteAtLeast(
        track.sourceDurationSecondsAtBake,
        0,
        `${clipLabel} lip-sync track ${trackIndex} sourceDurationSecondsAtBake`,
      );
    }
  }
  for (const [trackIndex, track] of (clip.ikControllerTracks ?? []).entries()) {
    validateKeyframes(
      track.targetXKeyframes,
      `${clipLabel} IK track ${trackIndex} targetX`,
    );
    validateKeyframes(
      track.targetYKeyframes,
      `${clipLabel} IK track ${trackIndex} targetY`,
    );
  }
}

function validateMaskDepth(layersById: ReadonlyMap<string, LayerNode>): void {
  const failDepthLimit = (layerId: string): never => {
    throw new EvaluationPayloadError(
      "VIVI_ERR_LIMIT_EXCEEDED",
      `mask depth exceeds ${VIVI_RUNTIME_LIMITS.maxMaskDepth} at layer ${layerId}`,
    );
  };
  const visit = (
    layer: LayerNode,
    stack: readonly string[],
    activeDepth: number,
  ): number => {
    if (stack.includes(layer.id)) {
      throw payloadError(`clip mask cycle: ${[...stack, layer.id].join(" -> ")}`);
    }
    let depth = activeDepth;
    const maskIds =
      sourceClipMasks(layer)?.map(({ layerId }) => layerId) ?? layer.clipMaskIds ?? [];
    for (const maskId of maskIds) {
      if (
        depth >= VIVI_RUNTIME_LIMITS.maxMaskDepth ||
        stack.length + 1 > VIVI_RUNTIME_LIMITS.maxMaskDepth
      ) {
        failDepthLimit(layer.id);
      }
      const mask = layersById.get(maskId);
      if (mask?.kind !== "viviMesh") {
        throw payloadError(`layer ${layer.id} references missing mask mesh ${maskId}`);
      }
      depth = 1 + visit(mask, [...stack, layer.id], depth);
      if (depth > VIVI_RUNTIME_LIMITS.maxMaskDepth) {
        failDepthLimit(layer.id);
      }
    }
    return depth;
  };

  for (const layer of layersById.values()) {
    visit(layer, [], 0);
  }
}

function validateAssetRef(ref: ViviAssetRefV1, path: string): void {
  if (!/^[A-Fa-f0-9]{64}$/.test(ref.objectAddress)) {
    throw payloadError(`${path} has an invalid objectAddress`);
  }
  if (!/^[A-Fa-f0-9]{64}$/.test(ref.contentSha256)) {
    throw payloadError(`${path} has an invalid contentSha256`);
  }
  if (ref.storageKind !== "blob" && ref.storageKind !== "chunk_manifest") {
    throw payloadError(`${path} has an unsupported storageKind`);
  }
  if (!Number.isSafeInteger(ref.sizeBytes) || ref.sizeBytes < 0) {
    throw payloadError(`${path} has an invalid sizeBytes`);
  }
  const mediaTypeBytes = utf8ByteLength(ref.mediaType);
  if (mediaTypeBytes < 1 || mediaTypeBytes > 255) {
    throw payloadError(`${path} mediaType must be 1..255 UTF-8 bytes`);
  }
  if (
    ref.storageKind === "blob" &&
    normalizeSha256Hex(ref.objectAddress) !== normalizeSha256Hex(ref.contentSha256)
  ) {
    throw payloadError(`${path} blob address must equal its content hash`);
  }
  if (ref.storageKind === "blob" && ref.sizeBytes > MAX_EMBEDDED_BLOB_BYTES) {
    throw payloadError(`${path} blob exceeds ${MAX_EMBEDDED_BLOB_BYTES} bytes`);
  }
  if (
    ref.storageKind === "chunk_manifest" &&
    (ref.sizeBytes <= MAX_EMBEDDED_BLOB_BYTES || ref.sizeBytes > MAX_CHUNK_MANIFEST_BYTES)
  ) {
    throw payloadError(
      `${path} chunk_manifest sizeBytes must be ${MAX_EMBEDDED_BLOB_BYTES + 1}..${MAX_CHUNK_MANIFEST_BYTES}`,
    );
  }
}

function normalizeSha256Hex(value: string): string {
  // validateAssetRef establishes that this is ASCII hex before semantic use.
  return value.toLowerCase();
}

type ForbiddenScanPosition =
  | "root"
  | "normal"
  | "skinsMap"
  | "skinData"
  | "bindPoseInverseMap"
  | "expressionPresets"
  | "expressionPreset"
  | "expressionValuesMap";

function scanForbiddenMarkers(
  value: unknown,
  path = "payload",
  position: ForbiddenScanPosition = "root",
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      scanForbiddenMarkers(
        item,
        `${path}[${index}]`,
        position === "expressionPresets" ? "expressionPreset" : "normal",
      );
    });
    return;
  }
  if (!isRecord(value)) return;
  const identifierKeysAreOpaque =
    position === "skinsMap" ||
    position === "bindPoseInverseMap" ||
    position === "expressionValuesMap";
  for (const [key, child] of Object.entries(value)) {
    if (
      !identifierKeysAreOpaque &&
      (VIVI_RUNTIME_FORBIDDEN_RAW_KEYS as readonly string[]).includes(key)
    ) {
      throw new EvaluationPayloadError(
        "VIVI_ERR_EVALUATION_FORBIDDEN",
        `forbidden marker ${key} at ${path}`,
      );
    }
    if (
      !identifierKeysAreOpaque &&
      (key === "kind" || key === "type") &&
      typeof child === "string" &&
      (VIVI_RUNTIME_FORBIDDEN_KIND_OR_TYPE as readonly string[]).includes(child)
    ) {
      throw new EvaluationPayloadError(
        "VIVI_ERR_EVALUATION_FORBIDDEN",
        `forbidden ${key} value ${child} at ${path}`,
      );
    }
    let childPosition: ForbiddenScanPosition = "normal";
    if (position === "root" && key === "project") childPosition = "root";
    else if (position === "root" && key === "skins") childPosition = "skinsMap";
    else if (position === "skinsMap") childPosition = "skinData";
    else if (position === "skinData" && key === "bindPoseInverse") {
      childPosition = "bindPoseInverseMap";
    } else if (position === "root" && key === "expressionPresets") {
      childPosition = "expressionPresets";
    } else if (position === "expressionPreset" && key === "values") {
      childPosition = "expressionValuesMap";
    }
    scanForbiddenMarkers(child, `${path}.${key}`, childPosition);
  }
}

function scanFiniteNumbers(value: unknown, path = "payload"): void {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw payloadError(`${path} must be finite`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      scanFiniteNumbers(item, `${path}[${index}]`);
    });
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    scanFiniteNumbers(child, `${path}.${key}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw payloadError(`${label} must be a positive safe integer`);
  }
}

function assertIntegerRange(
  value: number,
  minimum: number,
  maximum: number,
  label: string,
): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw payloadError(`${label} must be an integer in ${minimum}..${maximum}`);
  }
}

function assertFiniteAtLeast(value: number, minimum: number, label: string): void {
  if (!Number.isFinite(value) || value < minimum) {
    throw payloadError(`${label} must be finite and >= ${minimum}`);
  }
}

function assertFiniteGreaterThan(value: number, minimum: number, label: string): void {
  if (!Number.isFinite(value) || value <= minimum) {
    throw payloadError(`${label} must be finite and > ${minimum}`);
  }
}

function assertAtMost(actual: number, maximum: number, label: string): void {
  if (actual > maximum) {
    throw new EvaluationPayloadError(
      "VIVI_ERR_LIMIT_EXCEEDED",
      `${label} exceeds ${maximum}: ${actual}`,
    );
  }
}

function assertPattern(value: unknown, pattern: RegExp, label: string): void {
  if (typeof value !== "string" || !pattern.test(value)) {
    throw payloadError(`${label} has an invalid form: ${String(value)}`);
  }
}

function assertUnique(values: Set<string>, value: string, label: string): void {
  if (values.has(value)) {
    throw payloadError(`duplicate ${label}: ${value}`);
  }
  values.add(value);
}

function payloadError(message: string): EvaluationPayloadError {
  return new EvaluationPayloadError("VIVI_ERR_EVALUATION_PAYLOAD", message);
}

function utf8ByteOrder(left: string, right: string): number {
  const leftBytes = utf8Bytes(left);
  const rightBytes = utf8Bytes(right);
  const length = Math.min(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    const difference = leftBytes[index]! - rightBytes[index]!;
    if (difference !== 0) return difference;
  }
  return leftBytes.length - rightBytes.length;
}

function utf8ByteLength(value: string): number {
  let byteLength = 0;
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit <= 0x7f) {
      byteLength += 1;
    } else if (codeUnit <= 0x7ff) {
      byteLength += 2;
    } else if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const nextCodeUnit = value.charCodeAt(index + 1);
      if (nextCodeUnit >= 0xdc00 && nextCodeUnit <= 0xdfff) {
        byteLength += 4;
        index += 1;
      } else {
        // Web-compatible UTF-8 encoders replace an unpaired surrogate with U+FFFD.
        byteLength += 3;
      }
    } else {
      // BMP values, including unpaired low surrogates, occupy three bytes after
      // the replacement behavior required by the Encoding Standard.
      byteLength += 3;
    }
  }
  return byteLength;
}

function utf8Bytes(value: string): number[] {
  const bytes: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    let codePoint = codeUnit;
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const nextCodeUnit = value.charCodeAt(index + 1);
      if (nextCodeUnit >= 0xdc00 && nextCodeUnit <= 0xdfff) {
        codePoint = 0x10000 + ((codeUnit - 0xd800) << 10) + (nextCodeUnit - 0xdc00);
        index += 1;
      } else {
        codePoint = 0xfffd;
      }
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      codePoint = 0xfffd;
    }

    if (codePoint <= 0x7f) {
      bytes.push(codePoint);
    } else if (codePoint <= 0x7ff) {
      bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
    } else if (codePoint <= 0xffff) {
      bytes.push(
        0xe0 | (codePoint >> 12),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    } else {
      bytes.push(
        0xf0 | (codePoint >> 18),
        0x80 | ((codePoint >> 12) & 0x3f),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    }
  }
  return bytes;
}
