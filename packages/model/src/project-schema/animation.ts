import { z } from "zod";
import { BonePropertyTypeSchema, InterpolationTypeSchema } from "./primitives";

export const TimelineKeyframeSchema = z.object({
  frame: z.number(),
  value: z.number(),
  interpolation: InterpolationTypeSchema,
  cp1x: z.number().optional(),
  cp1y: z.number().optional(),
  cp2x: z.number().optional(),
  cp2y: z.number().optional(),
  ellipseRatio: z.number().optional(),
  ellipseDirection: z.enum(["cw", "ccw"]).optional(),
  snsOscillations: z.number().optional(),
  snsDamping: z.number().optional(),
});

export const AnimationTrackSchema = z.object({
  parameterId: z.string(),
  keyframes: z.array(TimelineKeyframeSchema),
});

export const BoneTrackSchema = z.object({
  boneId: z.string(),
  property: BonePropertyTypeSchema,
  keyframes: z.array(TimelineKeyframeSchema),
});

const ImageSequenceEntrySchema = z.object({
  startFrame: z.number(),
  imageId: z.string(),
});

export const ImageSequenceTrackSchema = z.object({
  targetMeshId: z.string(),
  entries: z.array(ImageSequenceEntrySchema),
});

export const AudioTrackSchema = z.object({
  id: z.string(),
  name: z.string(),
  sourcePath: z.string(),
  startFrame: z.number(),
  sourceDurationSeconds: z.number().nullable(),
  gain: z.number(),
  muted: z.boolean(),
});

export const LipSyncTrackSchema = z.object({
  id: z.string(),
  name: z.string(),
  sourceAudioTrackId: z.string(),
  analysisType: z.literal("rms"),
  analysisFps: z.number(),
  samples: z.array(z.number()),
  targetParameterId: z.string().nullable(),
  sourcePathAtBake: z.string(),
  sourceDurationSecondsAtBake: z.number().nullable(),
  gain: z.number(),
  muted: z.boolean(),
});

export const IKControllerTrackSchema = z.object({
  controllerId: z.string(),
  targetXKeyframes: z.array(TimelineKeyframeSchema),
  targetYKeyframes: z.array(TimelineKeyframeSchema),
});

export const AnimationClipSchema = z.object({
  id: z.string(),
  name: z.string(),
  duration: z.number(),
  fps: z.number(),
  tracks: z.array(AnimationTrackSchema),
  boneTracks: z.array(BoneTrackSchema).optional(),
  imageSequenceTracks: z.array(ImageSequenceTrackSchema).optional(),
  audioTracks: z.array(AudioTrackSchema).optional(),
  lipSyncTracks: z.array(LipSyncTrackSchema).optional(),
  ikControllerTracks: z.array(IKControllerTrackSchema).optional(),
});

export const SceneSchema = z.object({
  id: z.string(),
  name: z.string(),
  clips: z.array(AnimationClipSchema),
});

export const SceneBlendSchema = z.object({
  id: z.string(),
  sourceSceneId: z.string(),
  targetSceneId: z.string(),
  mode: z.enum(["crossfade", "additive", "override"]),
  transitionFrames: z.number(),
  easing: InterpolationTypeSchema,
});
