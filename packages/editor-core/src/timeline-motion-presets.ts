import { flattenLayers } from "@vivi2d/core/layer-utils";
import type {
  AnimationClip,
  BonePropertyType,
  ParameterDefinition,
  ProjectData,
  TimelineKeyframe,
} from "@vivi2d/core/types";
import { isBone } from "@vivi2d/core/types";

const MANAGED_LEFT_BLINK_PARAMETER_TAG = "seeThroughEyeRig:left:parameter";
const MANAGED_RIGHT_BLINK_PARAMETER_TAG = "seeThroughEyeRig:right:parameter";

export type MotionPresetKind = "blinkCycle" | "breathing" | "idleSway";

export type MotionPresetTarget =
  | { kind: "parameter"; parameterId: string }
  | { kind: "bone"; boneId: string; property: BonePropertyType }
  | {
      kind: "managedBlinkPairParameter";
      leftParameterId: string;
      rightParameterId: string;
    };

export interface MotionPresetTargetOption {
  id: string;
  label: string;
  target: MotionPresetTarget;
}

export interface BlinkCycleMotionPresetInput {
  kind: "blinkCycle";
  target: MotionPresetTarget;
  startFrame: number;
  durationFrames: number;
  closedValue: number;
  openValue: number;
  blinkIntervalFrames: number;
  closeDurationFrames: number;
  holdDurationFrames: number;
  openDurationFrames: number;
}

export interface BreathingMotionPresetInput {
  kind: "breathing";
  target: MotionPresetTarget;
  startFrame: number;
  durationFrames: number;
  centerValue: number;
  amplitude: number;
  cycleLengthFrames: number;
}

export interface IdleSwayMotionPresetInput {
  kind: "idleSway";
  target: MotionPresetTarget;
  startFrame: number;
  durationFrames: number;
  centerValue: number;
  amplitude: number;
  cycleLengthFrames: number;
}

export type MotionPresetInput =
  | BlinkCycleMotionPresetInput
  | BreathingMotionPresetInput
  | IdleSwayMotionPresetInput;

export type MotionPresetTrackRef =
  | { type: "parameter"; parameterId: string; label: string }
  | { type: "bone"; boneId: string; property: BonePropertyType; label: string };

export interface MotionPresetTrackWrite {
  track: MotionPresetTrackRef;
  keyframes: TimelineKeyframe[];
  hadOverlap: boolean;
}

export interface MotionPresetPlan {
  kind: MotionPresetKind;
  startFrame: number;
  endFrame: number;
  writes: MotionPresetTrackWrite[];
  warnings: string[];
}

export interface ResolvedMotionPresetTrack {
  ref: MotionPresetTrackRef;
  clampValue: (value: number) => number;
}

function createTargetOptionId(target: MotionPresetTarget): string {
  switch (target.kind) {
    case "parameter":
      return `parameter:${target.parameterId}`;
    case "bone":
      return `bone:${target.boneId}:${target.property}`;
    case "managedBlinkPairParameter":
      return `managedBlinkPairParameter:${target.leftParameterId}:${target.rightParameterId}`;
  }
}

function clampRange(value: number, minValue: number, maxValue: number): number {
  return Math.max(minValue, Math.min(maxValue, value));
}

function normalizeFrame(value: number): number {
  return Math.max(0, Math.round(value));
}

function createKeyframeMap() {
  return new Map<number, TimelineKeyframe>();
}

function setLinearKeyframe(
  map: Map<number, TimelineKeyframe>,
  frame: number,
  value: number,
) {
  map.set(frame, { frame, value, interpolation: "linear" });
}

function finalizeKeyframes(map: Map<number, TimelineKeyframe>): TimelineKeyframe[] {
  return [...map.values()].sort((left, right) => left.frame - right.frame);
}

function listManagedBlinkPairParameterTarget(
  project: ProjectData,
): MotionPresetTargetOption[] {
  const left = project.parameters.filter(
    (parameter) => parameter.managedTag === MANAGED_LEFT_BLINK_PARAMETER_TAG,
  );
  const right = project.parameters.filter(
    (parameter) => parameter.managedTag === MANAGED_RIGHT_BLINK_PARAMETER_TAG,
  );
  if (left.length !== 1 || right.length !== 1) return [];
  const target = {
    kind: "managedBlinkPairParameter",
    leftParameterId: left[0]!.id,
    rightParameterId: right[0]!.id,
  } satisfies MotionPresetTarget;
  return [
    {
      id: createTargetOptionId(target),
      label: "Managed Blink Pair (Parameters)",
      target,
    },
  ];
}

function listParameterTargets(project: ProjectData): MotionPresetTargetOption[] {
  return [...project.parameters]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((parameter) => {
      const target = { kind: "parameter", parameterId: parameter.id } satisfies MotionPresetTarget;
      return { id: createTargetOptionId(target), label: parameter.name, target };
    });
}

function listBoneTargets(
  project: ProjectData,
  properties: readonly BonePropertyType[],
): MotionPresetTargetOption[] {
  return flattenLayers(project.layers)
    .filter(isBone)
    .flatMap((bone) =>
      properties.map((property) => {
        const target = {
          kind: "bone",
          boneId: bone.id,
          property,
        } satisfies MotionPresetTarget;
        return {
          id: createTargetOptionId(target),
          label: `${bone.name}:${property}`,
          target,
        };
      }),
    )
    .sort((left, right) => left.label.localeCompare(right.label));
}

export function listMotionPresetTargetOptions(
  project: ProjectData,
  kind: MotionPresetKind,
): MotionPresetTargetOption[] {
  if (kind === "blinkCycle") {
    return [
      ...listManagedBlinkPairParameterTarget(project),
      ...listParameterTargets(project),
    ];
  }
  if (kind === "breathing") {
    return [
      ...listParameterTargets(project),
      ...listBoneTargets(project, ["angle", "scaleX", "scaleY"]),
    ];
  }
  return [...listParameterTargets(project), ...listBoneTargets(project, ["angle"])];
}

function resolveTrackFromParameter(
  parameter: ParameterDefinition,
): ResolvedMotionPresetTrack {
  return {
    ref: {
      type: "parameter",
      parameterId: parameter.id,
      label: parameter.name,
    },
    clampValue: (value) => clampRange(value, parameter.minValue, parameter.maxValue),
  };
}

function resolveTrackFromBone(
  project: ProjectData,
  boneId: string,
  property: BonePropertyType,
): ResolvedMotionPresetTrack[] {
  const bone = flattenLayers(project.layers)
    .filter(isBone)
    .find((entry) => entry.id === boneId);
  if (!bone) return [];
  return [
    {
      ref: {
        type: "bone",
        boneId: bone.id,
        property,
        label: `${bone.name}:${property}`,
      },
      clampValue: (value) => value,
    },
  ];
}

export function resolveMotionPresetTracks(
  project: ProjectData,
  target: MotionPresetTarget,
): ResolvedMotionPresetTrack[] {
  switch (target.kind) {
    case "parameter": {
      const parameter = project.parameters.find(
        (entry) => entry.id === target.parameterId,
      );
      return parameter ? [resolveTrackFromParameter(parameter)] : [];
    }
    case "bone":
      return resolveTrackFromBone(project, target.boneId, target.property);
    case "managedBlinkPairParameter": {
      const left = project.parameters.find(
        (entry) => entry.id === target.leftParameterId,
      );
      const right = project.parameters.find(
        (entry) => entry.id === target.rightParameterId,
      );
      if (!left || !right) return [];
      return [resolveTrackFromParameter(left), resolveTrackFromParameter(right)];
    }
  }
}

function collectTrackOverlapFrames(
  clip: AnimationClip,
  track: MotionPresetTrackRef,
  startFrame: number,
  endFrame: number,
): number[] {
  if (track.type === "parameter") {
    return (
      clip.tracks
        .find((entry) => entry.parameterId === track.parameterId)
        ?.keyframes.filter(
          (keyframe) => keyframe.frame >= startFrame && keyframe.frame <= endFrame,
        )
        .map((keyframe) => keyframe.frame) ?? []
    );
  }
  return (
    clip.boneTracks
      ?.find(
        (entry) => entry.boneId === track.boneId && entry.property === track.property,
      )
      ?.keyframes.filter(
        (keyframe) => keyframe.frame >= startFrame && keyframe.frame <= endFrame,
      )
      .map((keyframe) => keyframe.frame) ?? []
  );
}

function buildBlinkKeyframes(
  input: BlinkCycleMotionPresetInput,
  startFrame: number,
  endFrame: number,
  clampValue: (value: number) => number,
): TimelineKeyframe[] {
  const frames = createKeyframeMap();
  setLinearKeyframe(frames, startFrame, clampValue(input.openValue));
  for (
    let cycleStart = startFrame;
    cycleStart <= endFrame;
    cycleStart += input.blinkIntervalFrames
  ) {
    const closeFrame = cycleStart + input.closeDurationFrames;
    const holdFrame = closeFrame + input.holdDurationFrames;
    const openFrame = holdFrame + input.openDurationFrames;
    if (closeFrame <= endFrame) setLinearKeyframe(frames, closeFrame, clampValue(input.closedValue));
    if (holdFrame <= endFrame) setLinearKeyframe(frames, holdFrame, clampValue(input.closedValue));
    if (openFrame <= endFrame) setLinearKeyframe(frames, openFrame, clampValue(input.openValue));
  }
  setLinearKeyframe(frames, endFrame, clampValue(input.openValue));
  return finalizeKeyframes(frames);
}

function buildOscillationKeyframes(
  startFrame: number,
  endFrame: number,
  centerValue: number,
  amplitude: number,
  cycleLengthFrames: number,
  clampValue: (value: number) => number,
): TimelineKeyframe[] {
  const frames = createKeyframeMap();
  setLinearKeyframe(frames, startFrame, clampValue(centerValue));
  for (
    let cycleStart = startFrame;
    cycleStart <= endFrame;
    cycleStart += cycleLengthFrames
  ) {
    const quarter = Math.round(cycleLengthFrames * 0.25);
    const half = Math.round(cycleLengthFrames * 0.5);
    const threeQuarter = Math.round(cycleLengthFrames * 0.75);
    const points = [
      { frame: cycleStart + quarter, value: centerValue + amplitude },
      { frame: cycleStart + half, value: centerValue },
      { frame: cycleStart + threeQuarter, value: centerValue - amplitude },
      { frame: cycleStart + cycleLengthFrames, value: centerValue },
    ];
    for (const point of points) {
      if (point.frame <= endFrame) {
        setLinearKeyframe(frames, point.frame, clampValue(point.value));
      }
    }
  }
  setLinearKeyframe(frames, endFrame, clampValue(centerValue));
  return finalizeKeyframes(frames);
}

export function planMotionPreset(
  project: ProjectData,
  clip: AnimationClip,
  input: MotionPresetInput,
): MotionPresetPlan {
  const warnings: string[] = [];
  const clipEnd = Math.max(0, clip.duration - 1);
  const startFrame = Math.min(clipEnd, normalizeFrame(input.startFrame));
  const requestedEnd = startFrame + Math.max(1, normalizeFrame(input.durationFrames));
  const endFrame = Math.min(clipEnd, requestedEnd);

  if (requestedEnd > clipEnd) warnings.push("Preset range was clamped to the clip end.");
  if (endFrame <= startFrame) {
    warnings.push("Preset range is too short for this motion preset.");
    return { kind: input.kind, startFrame, endFrame, writes: [], warnings };
  }

  const resolvedTracks = resolveMotionPresetTracks(project, input.target);
  if (resolvedTracks.length === 0) {
    warnings.push("Selected motion preset target is unavailable.");
    return { kind: input.kind, startFrame, endFrame, writes: [], warnings };
  }

  const writes: MotionPresetTrackWrite[] = [];
  for (const resolvedTrack of resolvedTracks) {
    let keyframes: TimelineKeyframe[];
    if (input.kind === "blinkCycle") {
      if (
        input.blinkIntervalFrames <= 0 ||
        input.closeDurationFrames <= 0 ||
        input.openDurationFrames <= 0 ||
        input.holdDurationFrames < 0
      ) {
        warnings.push("Blink preset timing values must be positive.");
        return { kind: input.kind, startFrame, endFrame, writes: [], warnings };
      }
      keyframes = buildBlinkKeyframes(
        input,
        startFrame,
        endFrame,
        resolvedTrack.clampValue,
      );
    } else {
      if (input.cycleLengthFrames <= 0) {
        warnings.push("Cycle length must be positive.");
        return { kind: input.kind, startFrame, endFrame, writes: [], warnings };
      }
      keyframes = buildOscillationKeyframes(
        startFrame,
        endFrame,
        input.centerValue,
        input.amplitude,
        input.cycleLengthFrames,
        resolvedTrack.clampValue,
      );
    }

    const overlapFrames = collectTrackOverlapFrames(
      clip,
      resolvedTrack.ref,
      startFrame,
      endFrame,
    );
    if (overlapFrames.length > 0) {
      warnings.push(
        `${resolvedTrack.ref.label} has existing keyframes in frames ${startFrame}-${endFrame} and will be overwritten.`,
      );
    }
    writes.push({
      track: resolvedTrack.ref,
      keyframes,
      hadOverlap: overlapFrames.length > 0,
    });
  }

  return { kind: input.kind, startFrame, endFrame, writes, warnings };
}
