import type { AnimationClip, ProjectData, TimelineKeyframe } from "@vivi2d/core/types";
import {
  listMotionPresetTargetOptions,
  type MotionPresetTarget,
  type MotionPresetTargetOption,
  type MotionPresetTrackRef,
  resolveMotionPresetTracks,
} from "./timeline-motion-presets";

export interface IdleSynthDetection {
  blinkOptions: MotionPresetTargetOption[];
  breathingOptions: MotionPresetTargetOption[];
  defaultBlinkTargetId: string | null;
  defaultBreathingTargetId: string | null;
  warnings: string[];
}

export interface IdleSynthInput {
  startFrame: number;
  durationFrames: number;
  seed: number;
  blink: {
    enabled: boolean;
    target: MotionPresetTarget | null;
    openValue: number;
    closedValue: number;
    minIntervalFrames: number;
    maxIntervalFrames: number;
    closeDurationFrames: number;
    holdDurationFrames: number;
    openDurationFrames: number;
  };
  breathing: {
    enabled: boolean;
    target: MotionPresetTarget | null;
    centerValue: number;
    minAmplitude: number;
    maxAmplitude: number;
    minCycleLengthFrames: number;
    maxCycleLengthFrames: number;
  };
}

export type IdleSynthSection = "blink" | "breathing";

export interface IdleSynthTrackWrite {
  section: IdleSynthSection;
  track: MotionPresetTrackRef;
  keyframes: TimelineKeyframe[];
  rangeStart: number;
  rangeEnd: number;
  hadOverlap: boolean;
}

export interface IdleSynthPlan {
  startFrame: number;
  endFrame: number;
  writes: IdleSynthTrackWrite[];
  warnings: string[];
  missingTargetSections: IdleSynthSection[];
  conflictingSections: IdleSynthSection[];
}

function normalizeFrame(value: number): number {
  return Math.max(0, Math.round(value));
}

function normalizeName(value: string): string {
  return value.trim();
}

function createKeyframeMap() {
  return new Map<number, TimelineKeyframe>();
}

function setLinearKeyframe(
  map: Map<number, TimelineKeyframe>,
  frame: number,
  value: number,
) {
  map.set(frame, {
    frame,
    value,
    interpolation: "linear",
  });
}

function finalizeKeyframes(map: Map<number, TimelineKeyframe>): TimelineKeyframe[] {
  return [...map.values()].sort((left, right) => left.frame - right.frame);
}

function _clampRange(value: number, minValue: number, maxValue: number): number {
  return Math.max(minValue, Math.min(maxValue, value));
}

function createDeterministicRng(seed: number) {
  let state = Math.trunc(seed) >>> 0 || 1;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleIntInRange(minValue: number, maxValue: number, rng: () => number): number {
  if (minValue === maxValue) return minValue;
  const span = maxValue - minValue + 1;
  return minValue + Math.floor(rng() * span);
}

function sampleFloatInRange(
  minValue: number,
  maxValue: number,
  rng: () => number,
): number {
  if (minValue === maxValue) return minValue;
  return minValue + (maxValue - minValue) * rng();
}

function findUniqueOption(
  options: MotionPresetTargetOption[],
  predicate: (option: MotionPresetTargetOption) => boolean,
): MotionPresetTargetOption | null {
  const matches = options.filter(predicate);
  return matches.length === 1 ? matches[0]! : null;
}

function findAmbiguous(
  options: MotionPresetTargetOption[],
  predicate: (option: MotionPresetTargetOption) => boolean,
): boolean {
  return options.filter(predicate).length > 1;
}

export function detectIdleSynthTargets(project: ProjectData): IdleSynthDetection {
  const blinkOptions = listMotionPresetTargetOptions(project, "blinkCycle");
  const breathingOptions = listMotionPresetTargetOptions(project, "breathing");
  const warnings: string[] = [];

  let defaultBlinkTargetId: string | null = null;
  const managedBlinkPairParameter = findUniqueOption(
    blinkOptions,
    (option) => option.target.kind === "managedBlinkPairParameter",
  );
  if (managedBlinkPairParameter) {
    defaultBlinkTargetId = managedBlinkPairParameter.id;
  } else if (
    findAmbiguous(
      blinkOptions,
      (option) => option.target.kind === "managedBlinkPairParameter",
    )
  ) {
    warnings.push("Multiple managed blink parameter pairs were found.");
  } else {
    const exactBlink = findUniqueOption(
      blinkOptions,
      (option) =>
        option.target.kind === "parameter" && normalizeName(option.label) === "Blink",
    );
    if (exactBlink) {
      defaultBlinkTargetId = exactBlink.id;
    } else if (
      findAmbiguous(
        blinkOptions,
        (option) =>
          option.target.kind === "parameter" && normalizeName(option.label) === "Blink",
      )
    ) {
      warnings.push('Multiple parameter targets named "Blink" were found.');
    }
  }

  let defaultBreathingTargetId: string | null = null;
  const breathingParameters = breathingOptions.filter(
    (option) => option.target.kind === "parameter",
  );
  const exactIdBreath = findUniqueOption(
    breathingParameters,
    (option) =>
      option.target.kind === "parameter" && option.target.parameterId === "param-breath",
  );
  if (exactIdBreath) {
    defaultBreathingTargetId = exactIdBreath.id;
  } else if (
    findAmbiguous(
      breathingParameters,
      (option) =>
        option.target.kind === "parameter" &&
        option.target.parameterId === "param-breath",
    )
  ) {
    warnings.push('Multiple breathing targets with id "param-breath" were found.');
  } else {
    const exactNameBreath = findUniqueOption(
      breathingParameters,
      (option) => normalizeName(option.label) === "Breath",
    );
    if (exactNameBreath) {
      defaultBreathingTargetId = exactNameBreath.id;
    } else if (
      findAmbiguous(
        breathingParameters,
        (option) => normalizeName(option.label) === "Breath",
      )
    ) {
      warnings.push('Multiple breathing targets named "Breath" were found.');
    } else {
      const substringBreath = findUniqueOption(breathingParameters, (option) =>
        normalizeName(option.label).toLowerCase().includes("breath"),
      );
      if (substringBreath) {
        defaultBreathingTargetId = substringBreath.id;
      } else if (
        findAmbiguous(breathingParameters, (option) =>
          normalizeName(option.label).toLowerCase().includes("breath"),
        )
      ) {
        warnings.push('Multiple breathing targets containing "breath" were found.');
      }
    }
  }

  return {
    blinkOptions,
    breathingOptions,
    defaultBlinkTargetId,
    defaultBreathingTargetId,
    warnings,
  };
}

function trackIdentity(track: MotionPresetTrackRef): string {
  if (track.type === "parameter") return `parameter:${track.parameterId}`;
  return `bone:${track.boneId}:${track.property}`;
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
  startFrame: number,
  endFrame: number,
  clampValue: (value: number) => number,
  input: IdleSynthInput["blink"],
  rng: () => number,
): TimelineKeyframe[] {
  const frames = createKeyframeMap();
  setLinearKeyframe(frames, startFrame, clampValue(input.openValue));

  let cursor = startFrame;
  while (cursor < endFrame) {
    const interval = sampleIntInRange(
      normalizeFrame(input.minIntervalFrames),
      normalizeFrame(input.maxIntervalFrames),
      rng,
    );
    const closeFrame = cursor + interval;
    if (closeFrame > endFrame) break;

    setLinearKeyframe(frames, closeFrame, clampValue(input.closedValue));
    const holdFrame = closeFrame + normalizeFrame(input.holdDurationFrames);
    if (holdFrame <= endFrame) {
      setLinearKeyframe(frames, holdFrame, clampValue(input.closedValue));
    }
    const openFrame = holdFrame + normalizeFrame(input.openDurationFrames);
    if (openFrame <= endFrame) {
      setLinearKeyframe(frames, openFrame, clampValue(input.openValue));
      cursor = openFrame;
      continue;
    }
    break;
  }

  setLinearKeyframe(frames, endFrame, clampValue(input.openValue));
  return finalizeKeyframes(frames);
}

function buildBreathingKeyframes(
  startFrame: number,
  endFrame: number,
  clampValue: (value: number) => number,
  input: IdleSynthInput["breathing"],
  rng: () => number,
): TimelineKeyframe[] {
  const frames = createKeyframeMap();
  setLinearKeyframe(frames, startFrame, clampValue(input.centerValue));

  let cursor = startFrame;
  while (cursor < endFrame) {
    const cycleLength = sampleIntInRange(
      normalizeFrame(input.minCycleLengthFrames),
      normalizeFrame(input.maxCycleLengthFrames),
      rng,
    );
    const amplitude = sampleFloatInRange(input.minAmplitude, input.maxAmplitude, rng);
    const quarter = cursor + Math.round(cycleLength * 0.25);
    const half = cursor + Math.round(cycleLength * 0.5);
    const threeQuarter = cursor + Math.round(cycleLength * 0.75);
    const cycleEnd = cursor + cycleLength;
    const points = [
      { frame: quarter, value: input.centerValue + amplitude },
      { frame: half, value: input.centerValue },
      { frame: threeQuarter, value: input.centerValue - amplitude },
      { frame: cycleEnd, value: input.centerValue },
    ];
    for (const point of points) {
      if (point.frame <= endFrame) {
        setLinearKeyframe(frames, point.frame, clampValue(point.value));
      }
    }
    cursor = cycleEnd;
  }

  setLinearKeyframe(frames, endFrame, clampValue(input.centerValue));
  return finalizeKeyframes(frames);
}

export function planIdleSynth(
  project: ProjectData,
  clip: AnimationClip,
  input: IdleSynthInput,
): IdleSynthPlan {
  const warnings: string[] = [];
  const missingTargetSections: IdleSynthSection[] = [];
  const conflictingSections: IdleSynthSection[] = [];
  const writes: IdleSynthTrackWrite[] = [];

  const clipEnd = Math.max(0, clip.duration - 1);
  const startFrame = Math.min(clipEnd, normalizeFrame(input.startFrame));
  const endFrame = Math.min(
    clipEnd,
    startFrame + Math.max(1, normalizeFrame(input.durationFrames)) - 1,
  );

  if (endFrame <= startFrame) {
    warnings.push("Idle synth range is too short.");
    return {
      startFrame,
      endFrame,
      writes,
      warnings,
      missingTargetSections,
      conflictingSections,
    };
  }

  if (!input.blink.enabled && !input.breathing.enabled) {
    warnings.push("Enable blink or breathing before applying idle synth.");
    return {
      startFrame,
      endFrame,
      writes,
      warnings,
      missingTargetSections,
      conflictingSections,
    };
  }

  const seenTracks = new Set<string>();

  if (input.blink.enabled) {
    if (!input.blink.target) {
      missingTargetSections.push("blink");
      warnings.push("Blink synth target is missing.");
    } else if (
      input.blink.minIntervalFrames <= 0 ||
      input.blink.maxIntervalFrames < input.blink.minIntervalFrames ||
      input.blink.closeDurationFrames <= 0 ||
      input.blink.holdDurationFrames < 0 ||
      input.blink.openDurationFrames <= 0
    ) {
      warnings.push("Blink synth timing values are invalid.");
    } else {
      const resolvedTracks = resolveMotionPresetTracks(project, input.blink.target);
      if (resolvedTracks.length === 0) {
        missingTargetSections.push("blink");
        warnings.push("Blink synth target is unavailable.");
      } else {
        const blinkRng = createDeterministicRng(input.seed ^ 0x4f4c49);
        for (const resolvedTrack of resolvedTracks) {
          const identity = trackIdentity(resolvedTrack.ref);
          if (seenTracks.has(identity)) {
            conflictingSections.push("blink");
            warnings.push(
              `${resolvedTrack.ref.label} is targeted more than once by idle synth.`,
            );
            continue;
          }
          seenTracks.add(identity);
          const keyframes = buildBlinkKeyframes(
            startFrame,
            endFrame,
            resolvedTrack.clampValue,
            input.blink,
            blinkRng,
          );
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
            section: "blink",
            track: resolvedTrack.ref,
            keyframes,
            rangeStart: startFrame,
            rangeEnd: endFrame,
            hadOverlap: overlapFrames.length > 0,
          });
        }
      }
    }
  }

  if (input.breathing.enabled) {
    if (!input.breathing.target) {
      missingTargetSections.push("breathing");
      warnings.push("Breathing synth target is missing.");
    } else if (
      input.breathing.minCycleLengthFrames <= 0 ||
      input.breathing.maxCycleLengthFrames < input.breathing.minCycleLengthFrames ||
      input.breathing.maxAmplitude < input.breathing.minAmplitude
    ) {
      warnings.push("Breathing synth timing or amplitude values are invalid.");
    } else {
      const resolvedTracks = resolveMotionPresetTracks(project, input.breathing.target);
      if (resolvedTracks.length === 0) {
        missingTargetSections.push("breathing");
        warnings.push("Breathing synth target is unavailable.");
      } else {
        const breathingRng = createDeterministicRng(input.seed ^ 0x42524541);
        for (const resolvedTrack of resolvedTracks) {
          const identity = trackIdentity(resolvedTrack.ref);
          if (seenTracks.has(identity)) {
            conflictingSections.push("breathing");
            warnings.push(
              `${resolvedTrack.ref.label} is targeted more than once by idle synth.`,
            );
            continue;
          }
          seenTracks.add(identity);
          const keyframes = buildBreathingKeyframes(
            startFrame,
            endFrame,
            resolvedTrack.clampValue,
            input.breathing,
            breathingRng,
          );
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
            section: "breathing",
            track: resolvedTrack.ref,
            keyframes,
            rangeStart: startFrame,
            rangeEnd: endFrame,
            hadOverlap: overlapFrames.length > 0,
          });
        }
      }
    }
  }

  return {
    startFrame,
    endFrame,
    writes,
    warnings,
    missingTargetSections,
    conflictingSections,
  };
}
