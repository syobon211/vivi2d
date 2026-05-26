import { flattenLayers } from "@vivi2d/core/layer-utils";
import type {
  AnimationClip,
  BonePropertyType,
  ProjectData,
  TimelineKeyframe,
} from "@vivi2d/core/types";
import { isBone } from "@vivi2d/core/types";

export type AnimationRetargetTrackRef =
  | { type: "parameter"; parameterId: string; label: string }
  | { type: "bone"; boneId: string; property: BonePropertyType; label: string };

export interface AnimationRetargetTrackWrite {
  track: AnimationRetargetTrackRef;
  keyframes: TimelineKeyframe[];
  hadOverlap: boolean;
}

export interface AnimationRetargetPlan {
  sourceClipId: string;
  targetClipId: string;
  sourceStartFrame: number;
  sourceEndFrame: number;
  targetStartFrame: number;
  targetEndFrame: number;
  writes: AnimationRetargetTrackWrite[];
  warnings: string[];
  skippedSourceTrackLabels: string[];
}

export interface AnimationRetargetInput {
  sourceStartFrame: number;
  durationFrames: number;
  targetStartFrame: number;
  includeParameters: boolean;
  includeBones: boolean;
}

function normalizeFrame(value: number): number {
  return Math.max(0, Math.round(value));
}

function shiftKeyframe(frame: TimelineKeyframe, delta: number): TimelineKeyframe {
  return { ...frame, frame: frame.frame + delta };
}

function findBoneLabel(project: ProjectData, boneId: string, property: BonePropertyType) {
  const bone = flattenLayers(project.layers)
    .filter(isBone)
    .find((entry) => entry.id === boneId);
  return bone ? `${bone.name}:${property}` : `${boneId}:${property}`;
}

function collectDestinationOverlap(
  clip: AnimationClip,
  track: AnimationRetargetTrackRef,
  startFrame: number,
  endFrame: number,
) {
  if (track.type === "parameter") {
    return (
      clip.tracks
        .find((entry) => entry.parameterId === track.parameterId)
        ?.keyframes.some(
          (keyframe) => keyframe.frame >= startFrame && keyframe.frame <= endFrame,
        ) ?? false
    );
  }
  return (
    clip.boneTracks
      ?.find(
        (entry) => entry.boneId === track.boneId && entry.property === track.property,
      )
      ?.keyframes.some(
        (keyframe) => keyframe.frame >= startFrame && keyframe.frame <= endFrame,
      ) ?? false
  );
}

export function planAnimationRetarget(
  project: ProjectData,
  sourceClip: AnimationClip,
  targetClip: AnimationClip,
  input: AnimationRetargetInput,
): AnimationRetargetPlan {
  const warnings: string[] = [];
  const skippedSourceTrackLabels: string[] = [];
  if (sourceClip.duration <= 0 || targetClip.duration <= 0) {
    warnings.push("Source or target clip has no valid frames to retarget.");
    return emptyPlan(sourceClip.id, targetClip.id, warnings, skippedSourceTrackLabels);
  }

  const sourceStartFrame = Math.min(
    Math.max(0, sourceClip.duration - 1),
    normalizeFrame(input.sourceStartFrame),
  );
  const targetStartFrame = Math.min(
    Math.max(0, targetClip.duration - 1),
    normalizeFrame(input.targetStartFrame),
  );
  const requestedDuration = Math.max(1, normalizeFrame(input.durationFrames));
  const effectiveDuration = Math.min(
    requestedDuration,
    Math.max(0, sourceClip.duration - sourceStartFrame),
    Math.max(0, targetClip.duration - targetStartFrame),
  );

  if (effectiveDuration < requestedDuration) {
    warnings.push("Retarget range was clamped to fit the source/target clips.");
  }
  if (effectiveDuration <= 0) {
    warnings.push("Retarget range is empty.");
    return emptyPlan(sourceClip.id, targetClip.id, warnings, skippedSourceTrackLabels);
  }

  const sourceEndFrame = sourceStartFrame + effectiveDuration - 1;
  const targetEndFrame = targetStartFrame + effectiveDuration - 1;
  const writes: AnimationRetargetTrackWrite[] = [];

  if (input.includeParameters) {
    const validParameterIds = new Set(project.parameters.map((parameter) => parameter.id));
    for (const track of sourceClip.tracks) {
      if (!validParameterIds.has(track.parameterId)) {
        skippedSourceTrackLabels.push(`Parameter:${track.parameterId}`);
        continue;
      }
      const parameter = project.parameters.find(
        (entry) => entry.id === track.parameterId,
      )!;
      const keyframes = track.keyframes
        .filter(
          (keyframe) =>
            keyframe.frame >= sourceStartFrame && keyframe.frame <= sourceEndFrame,
        )
        .map((keyframe) => shiftKeyframe(keyframe, targetStartFrame - sourceStartFrame));
      if (keyframes.length === 0) continue;
      const ref: AnimationRetargetTrackRef = {
        type: "parameter",
        parameterId: track.parameterId,
        label: parameter.name,
      };
      writes.push({
        track: ref,
        keyframes,
        hadOverlap: collectDestinationOverlap(
          targetClip,
          ref,
          targetStartFrame,
          targetEndFrame,
        ),
      });
    }
  }

  if (input.includeBones) {
    const validBoneIds = new Set(
      flattenLayers(project.layers)
        .filter(isBone)
        .map((bone) => bone.id),
    );
    for (const track of sourceClip.boneTracks ?? []) {
      if (!validBoneIds.has(track.boneId)) {
        skippedSourceTrackLabels.push(`Bone:${track.boneId}:${track.property}`);
        continue;
      }
      const keyframes = track.keyframes
        .filter(
          (keyframe) =>
            keyframe.frame >= sourceStartFrame && keyframe.frame <= sourceEndFrame,
        )
        .map((keyframe) => shiftKeyframe(keyframe, targetStartFrame - sourceStartFrame));
      if (keyframes.length === 0) continue;
      const ref: AnimationRetargetTrackRef = {
        type: "bone",
        boneId: track.boneId,
        property: track.property,
        label: findBoneLabel(project, track.boneId, track.property),
      };
      writes.push({
        track: ref,
        keyframes,
        hadOverlap: collectDestinationOverlap(
          targetClip,
          ref,
          targetStartFrame,
          targetEndFrame,
        ),
      });
    }
  }

  if (skippedSourceTrackLabels.length > 0) {
    warnings.push(`Skipped ${skippedSourceTrackLabels.length} stale source track(s).`);
  }
  if (!input.includeParameters && !input.includeBones) {
    warnings.push("Select at least one track category to retarget.");
  }

  return {
    sourceClipId: sourceClip.id,
    targetClipId: targetClip.id,
    sourceStartFrame,
    sourceEndFrame,
    targetStartFrame,
    targetEndFrame,
    writes,
    warnings,
    skippedSourceTrackLabels,
  };
}

function emptyPlan(
  sourceClipId: string,
  targetClipId: string,
  warnings: string[],
  skippedSourceTrackLabels: string[],
): AnimationRetargetPlan {
  return {
    sourceClipId,
    targetClipId,
    sourceStartFrame: 0,
    sourceEndFrame: 0,
    targetStartFrame: 0,
    targetEndFrame: 0,
    writes: [],
    warnings,
    skippedSourceTrackLabels,
  };
}
