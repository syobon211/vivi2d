import { z } from "zod";
import { VisemeTypeSchema } from "./primitives";

const PendulumConfigSchema = z.object({
  length: z.number(),
  mass: z.number(),
  damping: z.number(),
});

const PhysicsInputSchema = z.object({
  parameterId: z.string(),
  weight: z.number(),
  type: z.enum(["x", "y", "angle"]),
});

const PhysicsOutputSchema = z.object({
  parameterId: z.string().optional(),
  boneId: z.string().optional(),
  pendulumIndex: z.number(),
  weight: z.number(),
  type: z.enum(["angle", "boneAngle"]),
});

export const PhysicsGroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  managedTag: z.string().optional(),
  managedSignature: z.string().optional(),
  managedSourceFingerprint: z.string().optional(),
  manualSplitSourceLayerId: z.string().optional(),
  manualSplitSourceFingerprint: z.string().optional(),
  manualSplitLayerId: z.string().optional(),
  pendulums: z.array(PendulumConfigSchema),
  inputs: z.array(PhysicsInputSchema),
  outputs: z.array(PhysicsOutputSchema),
  gravityDirection: z.number(),
  gravityStrength: z.number(),
  wind: z.number(),
});

const VisemeMappingSchema = z.object({
  viseme: VisemeTypeSchema,
  target: z.object({
    type: z.literal("parameter"),
    parameterId: z.string(),
    value: z.number(),
  }),
});

export const LipSyncConfigSchema = z.object({
  enabled: z.boolean(),
  mode: z.enum(["rms", "viseme"]).optional(),
  targetParameterId: z.string().nullable(),
  source: z.enum(["microphone", "file"]),
  threshold: z.number(),
  smoothing: z.number(),
  gain: z.number(),
  visemeMappings: z.array(VisemeMappingSchema).optional(),
  visemeSmoothing: z.number().optional(),
});
