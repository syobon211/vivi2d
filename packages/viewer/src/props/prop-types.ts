import { z } from "zod";

export const MAX_ACTIVE_PROPS = 128;
export const MAX_PROP_BURST = 16;
export const MAX_PROP_BYTES = 8 * 1024 * 1024;
export const MAX_INLINE_PROP_DECODED_BYTES = 48 * 1024;
export const MAX_PROP_DIMENSION = 8192;
export const MAX_PROP_ANIMATION_FRAMES = 256;

export const SUPPORTED_PROP_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

export type SupportedPropMimeType = (typeof SUPPORTED_PROP_MIME_TYPES)[number];

export const VIVI_PROP_KINDS = ["image", "animatedImage", "imageSequence"] as const;

export type ViviPropKind = (typeof VIVI_PROP_KINDS)[number];

export type ViviPropSource =
  | {
      kind: "objectUrl";
      url: string;
      mimeType: SupportedPropMimeType;
      bytes: number;
      portable: false;
    }
  | {
      kind: "inlineBase64";
      mimeType: SupportedPropMimeType;
      bytes: string;
      portable: true;
    }
  | {
      kind: "filePickerAsset";
      assetId: string;
      mimeType: SupportedPropMimeType;
      bytes: number;
      portable: false;
    };

export interface ViviPropAnchor {
  target:
    | { kind: "modelRoot" }
    | { kind: "bone"; boneId: string }
    | { kind: "layer"; layerId: string }
    | { kind: "screen" };
  offsetX: number;
  offsetY: number;
  rotationWeight: number;
  scaleWeight: number;
}

export interface ViviPropTransform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
}

export interface ViviProp {
  id: string;
  name: string;
  kind: ViviPropKind;
  visible: boolean;
  drawOrder: number;
  opacity: number;
  transform: ViviPropTransform;
  anchor?: ViviPropAnchor;
  source: ViviPropSource;
  groupId?: string;
  temporary?: boolean;
}

const propSourceSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("objectUrl"),
      url: z.string().startsWith("blob:"),
      mimeType: z.enum(SUPPORTED_PROP_MIME_TYPES),
      bytes: z.number().int().min(0).max(MAX_PROP_BYTES),
      portable: z.literal(false),
    })
    .strict(),
  z
    .object({
      kind: z.literal("inlineBase64"),
      mimeType: z.enum(SUPPORTED_PROP_MIME_TYPES),
      bytes: z
        .string()
        .min(1)
        .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/)
        .refine(
          (value) => {
            const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
            const decodedBytes = (value.length / 4) * 3 - padding;
            return decodedBytes <= MAX_INLINE_PROP_DECODED_BYTES;
          },
        ),
      portable: z.literal(true),
    })
    .strict(),
  z
    .object({
      kind: z.literal("filePickerAsset"),
      assetId: z.string().min(1).max(256),
      mimeType: z.enum(SUPPORTED_PROP_MIME_TYPES),
      bytes: z.number().int().min(0).max(MAX_PROP_BYTES),
      portable: z.literal(false),
    })
    .strict(),
]);

const propAnchorSchema = z
  .object({
    target: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("modelRoot") }).strict(),
      z.object({ kind: z.literal("bone"), boneId: z.string().min(1).max(256) }).strict(),
      z.object({ kind: z.literal("layer"), layerId: z.string().min(1).max(256) }).strict(),
      z.object({ kind: z.literal("screen") }).strict(),
    ]),
    offsetX: z.number().finite(),
    offsetY: z.number().finite(),
    rotationWeight: z.number().finite().min(0).max(1),
    scaleWeight: z.number().finite().min(0).max(1),
  })
  .strict();

const propTransformSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
    scaleX: z.number().finite().min(0.01).max(100),
    scaleY: z.number().finite().min(0.01).max(100),
    rotation: z.number().finite(),
  })
  .strict();

export const viviPropSchema = z
  .object({
    id: z.string().min(1).max(256),
    name: z.string().min(1).max(256),
    kind: z.enum(VIVI_PROP_KINDS),
    visible: z.boolean(),
    drawOrder: z.number().int().min(-10_000).max(10_000),
    opacity: z.number().finite().min(0).max(1),
    transform: propTransformSchema,
    anchor: propAnchorSchema.optional(),
    source: propSourceSchema,
    groupId: z.string().min(1).max(256).optional(),
    temporary: z.boolean().optional(),
  })
  .strict();

export function parseViviProp(input: unknown): ViviProp {
  return viviPropSchema.parse(input) as ViviProp;
}
