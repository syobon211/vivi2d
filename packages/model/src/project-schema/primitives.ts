import { z } from "zod";

const POLLUTION_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const MAX_POLLUTION_SCAN_DEPTH = 128;

export function containsPollutionKey(val: unknown, depth = 0): boolean {
  if (depth > MAX_POLLUTION_SCAN_DEPTH) return true;
  if (Array.isArray(val)) {
    for (const item of val) {
      if (containsPollutionKey(item, depth + 1)) return true;
    }
    return false;
  }
  if (val && typeof val === "object") {
    const obj = val as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      if (POLLUTION_KEYS.has(key)) return true;
      if (containsPollutionKey(obj[key], depth + 1)) return true;
    }
  }
  return false;
}

export const safeRecordKey = z.string().refine((k) => !POLLUTION_KEYS.has(k), {
  message: "Object contains a key that may cause prototype pollution",
});

export const RGBColorSchema = z.object({
  r: z.number(),
  g: z.number(),
  b: z.number(),
});

export const BlendModeSchema = z.enum([
  "normal",
  "add",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "hard-light",
  "soft-light",
  "difference",
  "exclusion",
]);

export const NodeKindSchema = z.enum([
  "viviMesh",
  "group",
  "bone",
  "artPath",
]);

export const MeshDataSchema = z.object({
  vertices: z.array(z.number()),
  uvs: z.array(z.number()),
  indices: z.array(z.number()),
  divisionsX: z.number(),
  divisionsY: z.number(),
});

export const AffineMatrixSchema = z.tuple([
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
]);

export const InterpolationTypeSchema = z.enum([
  "linear",
  "step",
  "bezier",
  "ellipse",
  "sns",
]);

export const BonePropertyTypeSchema = z.enum(["angle", "scaleX", "scaleY"]);

export const BoneBindingPropertyTypeSchema = z.enum([
  "x",
  "y",
  "angle",
  "scaleX",
  "scaleY",
]);

export const IKControllerBindingPropertyTypeSchema = z.enum([
  "targetX",
  "targetY",
  "poleTargetX",
  "poleTargetY",
  "influence",
]);

export const VisemeTypeSchema = z.enum([
  "sil",
  "aa",
  "ih",
  "ou",
  "eh",
  "oh",
  "ff",
  "ss",
  "pp",
  "nn",
  "kk",
]);
