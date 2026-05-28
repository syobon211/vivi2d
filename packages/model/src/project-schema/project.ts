// ProjectData / AtlasData / ViviFileData schema

import { z } from "zod";
import { AnimationClipSchema, SceneBlendSchema, SceneSchema } from "./animation";
import { ColliderDataSchema } from "./collider";
import { LayerNodeSchema } from "./layer";
import {
  ExpressionPresetSchema,
  ParameterBindingSchema,
  ParameterDefinitionSchema,
  SkinDataSchema,
} from "./parameter";
import { LipSyncConfigSchema, PhysicsGroupSchema } from "./physics";
import { containsPollutionKey, safeRecordKey } from "./primitives";
import {
  AnimationStateMachineSchema,
  IKControllerSchema,
  OffscreenTargetSchema,
} from "./statemachine";

export const ProjectDataSchema = z
  .object({
    name: z.string().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    sourceKind: z.enum(["psd", "seeThrough", "manualPng", "vivi", "vivid"]).optional(),
    layers: z.array(LayerNodeSchema),
    parameters: z.array(ParameterDefinitionSchema),
    clips: z.array(AnimationClipSchema).optional(),
    scenes: z.array(SceneSchema).optional(),
    physicsGroups: z.array(PhysicsGroupSchema).optional(),
    lipsyncConfig: LipSyncConfigSchema.optional(),
    skins: z.record(safeRecordKey, SkinDataSchema).optional(),
    parameterBindings: z.array(ParameterBindingSchema).optional(),
    sceneBlends: z.array(SceneBlendSchema).optional(),
    ikControllers: z.array(IKControllerSchema).optional(),
    offscreenTargets: z.array(OffscreenTargetSchema).optional(),
    expressionPresets: z.array(ExpressionPresetSchema).optional(),
    colliders: z.array(ColliderDataSchema).optional(),
    stateMachines: z.array(AnimationStateMachineSchema).optional(),
  })
  .superRefine((val, ctx) => {
    if (containsPollutionKey(val)) {
      ctx.addIssue({
        code: "custom",
  message: "Object contains a key that may cause prototype pollution",
      });
    }
  });

const AtlasEntrySchema = z.object({
  layerId: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

export const AtlasDataSchema = z.object({
  image: z.string(),
  width: z.number(),
  height: z.number(),
  entries: z.array(AtlasEntrySchema),
});

export const ViviFileDataSchema = z.object({
  version: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(6),
    z.literal(7),
    z.literal(8),
    z.literal(9),
    z.literal(10),
  ]),
  profile: z.literal("publicProfileV1").optional(),
  project: ProjectDataSchema,
  atlases: z.array(AtlasDataSchema),
});
