import { z } from "zod";

const TransitionConditionSchema = z.object({
  parameterId: z.string(),
  operator: z.enum([">", "<", ">=", "<=", "==", "!="]),
  threshold: z.number(),
});

const BlendTreeEntrySchema = z.object({
  threshold: z.number(),
  clipId: z.string(),
});

const BlendTree1DSchema = z.object({
  parameterId: z.string(),
  entries: z.array(BlendTreeEntrySchema),
});

const AnimationStateSchema = z.object({
  id: z.string(),
  name: z.string(),
  clipId: z.string().optional(),
  blendTree: BlendTree1DSchema.optional(),
  loop: z.boolean(),
});

const StateTransitionSchema = z.object({
  id: z.string(),
  fromStateId: z.string(),
  toStateId: z.string(),
  conditions: z.array(TransitionConditionSchema),
  transitionDuration: z.number(),
  priority: z.number(),
});

export const AnimationStateMachineSchema = z.object({
  id: z.string(),
  name: z.string(),
  states: z.array(AnimationStateSchema),
  transitions: z.array(StateTransitionSchema),
  initialStateId: z.string(),
  enabled: z.boolean(),
  blendMode: z.enum(["override", "additive"]).optional(),
  weight: z.number().optional(),
});

const IKBoneConstraintSchema = z.object({
  boneId: z.string(),
  minAngle: z.number(),
  maxAngle: z.number(),
});

const IKParameterMappingSchema = z.object({
  boneId: z.string(),
  parameterId: z.string(),
  angleMin: z.number(),
  angleMax: z.number(),
  paramMin: z.number(),
  paramMax: z.number(),
});

export const IKControllerSchema = z.object({
  id: z.string(),
  name: z.string(),
  managedTag: z.string().optional(),
  managedSignature: z.string().optional(),
  managedSourceFingerprint: z.string().optional(),
  manualSplitSourceLayerId: z.string().optional(),
  manualSplitSourceFingerprint: z.string().optional(),
  manualSplitLayerId: z.string().optional(),
  solverType: z.enum(["twoBone", "ccd"]),
  boneChain: z.array(IKBoneConstraintSchema),
  targetX: z.number(),
  targetY: z.number(),
  influence: z.number(),
  poleTargetX: z.number().optional(),
  poleTargetY: z.number().optional(),
  maxIterations: z.number().optional(),
  parameterMappings: z.array(IKParameterMappingSchema),
});

export const OffscreenTargetSchema = z.object({
  id: z.string(),
  width: z.number(),
  height: z.number(),
  sourceLayerIds: z.array(z.string()),
});
