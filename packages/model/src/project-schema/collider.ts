import { z } from "zod";

export const ColliderShapeSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("rectangle"),
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  }),
  z.object({
    type: z.literal("circle"),
    x: z.number(),
    y: z.number(),
    radius: z.number(),
  }),
  z.object({
    type: z.literal("mesh"),
    meshId: z.string(),
  }),
]);

export const ColliderDataSchema = z.object({
  id: z.string(),
  name: z.string(),
  shape: ColliderShapeSchema,
  tag: z.string().optional(),
  enabled: z.boolean(),
});
