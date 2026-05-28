import { z } from "zod";
import type { LayerImportMetadata, LayerNode } from "../types";
import { BlendModeSchema, MeshDataSchema, RGBColorSchema } from "./primitives";

const LayerSemanticRoleSchema = z.enum([
  "head",
  "face",
  "eyeLeft",
  "eyeRight",
  "eyebrowLeft",
  "eyebrowRight",
  "mouth",
  "nose",
  "hair",
  "hairFront",
  "hairBack",
  "hairSide",
  "body",
  "armLeft",
  "armRight",
  "handLeft",
  "handRight",
  "legLeft",
  "legRight",
  "tail",
  "ear",
  "accessory",
  "unknown",
]);

const LayerSemanticRoleSourceSchema = z.enum(["seeThroughImport", "manual", "assistant"]);

const LayerRiggingHintSchema = z.enum(["rigid", "localBones", "skinned", "physics"]);

const ProviderProposalAuditSchema = z.object({
  providerId: z.string(),
  capabilityId: z.string(),
  proposalId: z.string(),
  confidence: z.number().optional(),
  convertedAt: z.string().optional(),
});

const LayerDepthStatsSchema = z.object({
  min: z.number(),
  max: z.number(),
  mean: z.number(),
});

const FourNumberTupleSchema = z.tuple([
  z.number().int(),
  z.number().int(),
  z.number().int(),
  z.number().int(),
]) as unknown as z.ZodType<[number, number, number, number]>;

const TrimmedBoundsTupleSchema = z.tuple([
  z.number().int(),
  z.number().int(),
  z.number().int().positive(),
  z.number().int().positive(),
]) as unknown as z.ZodType<[number, number, number, number]>;

const TwoNumberTupleSchema = z.tuple([
  z.number().int(),
  z.number().int(),
]) as unknown as z.ZodType<[number, number]>;

const SeeThroughImportMetadataSchema = z.object({
  label: z.string(),
  order: z.number().int(),
  psdLeafToken: z.string().optional(),
  confidence: z.number(),
  leftRightSplit: z.enum(["left", "right", "center", "unknown"]),
  frontBackSplit: z.enum(["front", "back", "middle", "unknown"]),
  bbox: FourNumberTupleSchema,
  depthStats: LayerDepthStatsSchema,
});

const ManualPngImportMetadataSchema = z.object({
  sourceFileName: z.string(),
  sourcePath: z.string().optional(),
  originalWidth: z.number().int().positive(),
  originalHeight: z.number().int().positive(),
  trimmedBounds: TrimmedBoundsTupleSchema,
  finalOrigin: TwoNumberTupleSchema,
  placementMode: z.enum(["preserveImageOffset", "centerOnCanvas"]),
  trimTransparentBoundsApplied: z.boolean().optional(),
  autoGenerateMeshApplied: z.boolean(),
});

const SeeThroughLayerImportMetadataSchema = z.object({
  source: z.literal("seeThrough"),
  seeThrough: SeeThroughImportMetadataSchema,
});

const ManualPngLayerImportMetadataSchema = z.object({
  source: z.literal("manualPng"),
  manualPng: ManualPngImportMetadataSchema,
});

const ManualSplitBoundsSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

const ManualSplitOutputMetadataSchema = z.union([
  z.object({
    kind: z.literal("maskExtractedLayer"),
    ownership: z.literal("userAccepted"),
    origin: z.literal("manualMask"),
    manualSplitLayerId: z.string(),
    manualSplitSourceLayerId: z.string(),
    manualSplitSourceFingerprint: z.string(),
    manualSplitMaskId: z.string(),
    maskCoverage: z.number(),
    edgeFeatherPx: z.number(),
    customLabel: z.string().optional(),
    convertedFromProviderProposal: z.never().optional(),
  }),
  z.object({
    kind: z.literal("maskExtractedLayer"),
    ownership: z.literal("userAccepted"),
    origin: z.literal("providerProposal"),
    manualSplitLayerId: z.string(),
    manualSplitSourceLayerId: z.string(),
    manualSplitSourceFingerprint: z.string(),
    manualSplitMaskId: z.string(),
    maskCoverage: z.number(),
    edgeFeatherPx: z.number(),
    customLabel: z.string().optional(),
    convertedFromProviderProposal: ProviderProposalAuditSchema.extend({
      convertedAt: z.string(),
    }),
  }),
  z.object({
    kind: z.literal("generatedUnderpaintLayer"),
    ownership: z.literal("userAccepted"),
    origin: z.literal("localUnderpaint"),
    manualSplitLayerId: z.string(),
    manualSplitSourceLayerId: z.string(),
    manualSplitSourceFingerprint: z.string(),
    underpaintBufferId: z.string(),
    bounds: ManualSplitBoundsSchema,
    sourceMaskId: z.string().optional(),
    occludedByMaskId: z.string().optional(),
    acceptedAt: z.string(),
    providerAudit: z.never().optional(),
  }),
  z.object({
    kind: z.literal("generatedUnderpaintLayer"),
    ownership: z.literal("userAccepted"),
    origin: z.literal("providerUnderpaint"),
    manualSplitLayerId: z.string(),
    manualSplitSourceLayerId: z.string(),
    manualSplitSourceFingerprint: z.string(),
    underpaintBufferId: z.string(),
    bounds: ManualSplitBoundsSchema,
    sourceMaskId: z.string().optional(),
    occludedByMaskId: z.string().optional(),
    acceptedAt: z.string(),
    providerAudit: ProviderProposalAuditSchema,
  }),
]);

const LegacySeeThroughImportMetadataSchema = SeeThroughImportMetadataSchema.transform(
  (seeThrough) => ({
    source: "seeThrough" as const,
    seeThrough,
  }),
);

const LayerImportMetadataSchema: z.ZodType<LayerImportMetadata> = z.union([
  SeeThroughLayerImportMetadataSchema,
  ManualPngLayerImportMetadataSchema,
  LegacySeeThroughImportMetadataSchema,
]);

const nodeBaseShape = {
  id: z.string(),
  name: z.string(),
  visible: z.boolean(),
  opacity: z.number(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  blendMode: BlendModeSchema,
  expanded: z.boolean(),
  clipMaskIds: z.array(z.string()).optional(),
  drawOrder: z.number().optional(),
  multiplyColor: RGBColorSchema.optional(),
  screenColor: RGBColorSchema.optional(),
  semanticRole: LayerSemanticRoleSchema.optional(),
  semanticRoleSource: LayerSemanticRoleSourceSchema.optional(),
  riggingHint: LayerRiggingHintSchema.optional(),
  manualSplitOutputMetadata: ManualSplitOutputMetadataSchema.optional(),
  importMetadata: LayerImportMetadataSchema.optional(),
  managedTag: z.string().optional(),
  managedSignature: z.string().optional(),
  managedSourceFingerprint: z.string().optional(),
  manualSplitSourceLayerId: z.string().optional(),
  manualSplitSourceFingerprint: z.string().optional(),
  manualSplitLayerId: z.string().optional(),
};

export const BoneDataSchema = z.object({
  angle: z.number(),
  length: z.number(),
  scaleX: z.number(),
  scaleY: z.number(),
});

const ArtPathControlPointSchema = z.object({
  x: z.number(),
  y: z.number(),
  handleInX: z.number(),
  handleInY: z.number(),
  handleOutX: z.number(),
  handleOutY: z.number(),
  width: z.number(),
  opacity: z.number(),
});

const ArtPathStyleSchema = z.object({
  color: z.number(),
  baseWidth: z.number(),
  lineCap: z.enum(["butt", "round", "square"]),
  lineJoin: z.enum(["miter", "round", "bevel"]),
});

export const LayerNodeSchema: z.ZodType<LayerNode> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z.object({
      ...nodeBaseShape,
      children: z.array(LayerNodeSchema),
      kind: z.literal("viviMesh"),
      mesh: MeshDataSchema,
      culling: z.boolean().optional(),
    }),
    z.object({
      ...nodeBaseShape,
      children: z.array(LayerNodeSchema),
      kind: z.literal("group"),
    }),
    z.object({
      ...nodeBaseShape,
      children: z.array(LayerNodeSchema),
      kind: z.literal("bone"),
      bone: BoneDataSchema,
      parentBoneId: z.string().optional(),
    }),
    z.object({
      ...nodeBaseShape,
      children: z.array(LayerNodeSchema),
      kind: z.literal("artPath"),
      controlPoints: z.array(ArtPathControlPointSchema),
      closed: z.boolean(),
      style: ArtPathStyleSchema,
    }),
  ]),
);
