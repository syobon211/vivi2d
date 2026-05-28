import { z } from "zod";
import {
  AffineMatrixSchema,
  BoneBindingPropertyTypeSchema,
  IKControllerBindingPropertyTypeSchema,
  safeRecordKey,
} from "./primitives";

export const ParameterDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  minValue: z.number(),
  maxValue: z.number(),
  defaultValue: z.number(),
  managedTag: z.string().optional(),
  managedSignature: z.string().optional(),
  managedSourceFingerprint: z.string().optional(),
  pairedParameterId: z.string().optional(),
  group: z.string().optional(),
});

const ParameterBindingPointSchema = z.object({
  paramValue: z.number(),
  targetValue: z.number(),
});

/** BindingTarget: public controller-only discriminated union. */
export const BindingTargetSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("bone"),
    boneId: z.string(),
    property: BoneBindingPropertyTypeSchema,
  }),
  z.object({
    type: z.literal("ikController"),
    controllerId: z.string(),
    property: IKControllerBindingPropertyTypeSchema,
  }),
]);

export const ParameterBindingSchema = z.object({
  id: z.string(),
  parameterId: z.string(),
  target: BindingTargetSchema,
  managedTag: z.string().optional(),
  managedSignature: z.string().optional(),
  managedSourceFingerprint: z.string().optional(),
  bindingPoints: z.array(ParameterBindingPointSchema),
});

const SkinWeightSchema = z.object({
  boneId: z.string(),
  weight: z.number(),
});

export const SkinDataSchema = z.object({
  managedTag: z.string().optional(),
  managedSignature: z.string().optional(),
  managedSourceFingerprint: z.string().optional(),
  manualSplitSourceLayerId: z.string().optional(),
  manualSplitSourceFingerprint: z.string().optional(),
  manualSplitLayerId: z.string().optional(),
  weights: z.array(z.array(SkinWeightSchema)),
  bindPoseInverse: z.record(safeRecordKey, AffineMatrixSchema),
});

export const ExpressionPresetSchema = z.object({
  id: z.string(),
  name: z.string(),
  values: z.record(safeRecordKey, z.number()),
  color: z.string().optional(),
  hotkey: z.number().optional(),
});
