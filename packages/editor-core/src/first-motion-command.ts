import { TIMELINE_DEFAULTS } from "@vivi2d/core/constants";
import { findClipInProject } from "@vivi2d/core/scene-utils";
import type { AnimationClip, ProjectData } from "@vivi2d/core/types";
import {
  applyIdleSynthPlan,
  applyMotionPreset,
  createClip,
  setClipDuration,
  setClipFps,
} from "./clip-command";
import {
  detectIdleSynthTargets,
  type IdleSynthDetection,
  type IdleSynthInput,
  type IdleSynthPlan,
  planIdleSynth,
} from "./timeline-idle-synth";
import {
  listMotionPresetTargetOptions,
  type MotionPresetPlan,
  type MotionPresetTargetOption,
  planMotionPreset,
} from "./timeline-motion-presets";

export type FirstMotionClipMode = "active" | "new";

export interface FirstMotionDialogState {
  clipMode: FirstMotionClipMode;
  clipName: string;
  durationFrames: number;
  fps: number;
  seed: number;
  blinkEnabled: boolean;
  blinkTargetId: string;
  breathingEnabled: boolean;
  breathingTargetId: string;
  swayEnabled: boolean;
  swayTargetId: string;
}

export interface FirstMotionDefaults {
  detection: IdleSynthDetection;
  swayOptions: MotionPresetTargetOption[];
  state: FirstMotionDialogState;
}

export interface FirstMotionPlan {
  destinationClip: AnimationClip;
  idlePlan: IdleSynthPlan | null;
  swayPlan: MotionPresetPlan | null;
  warnings: string[];
  affectedTrackLabels: string[];
  hasApplicableWrites: boolean;
}

export interface ApplyFirstMotionOptions {
  activeClipId: string | null;
  state: FirstMotionDialogState;
  sceneId?: string | null;
  createId?: () => string;
}

export interface ApplyFirstMotionResult {
  clipId: string | null;
  plan: FirstMotionPlan | null;
  applied: boolean;
}

function buildVirtualClip(state: FirstMotionDialogState): AnimationClip {
  return {
    id: "__first-motion-preview__",
    name: state.clipName.trim() || "First Motion",
    duration: Math.max(TIMELINE_DEFAULTS.MIN_DURATION, Math.round(state.durationFrames)),
    fps: Math.max(TIMELINE_DEFAULTS.MIN_FPS, Math.round(state.fps)),
    tracks: [],
  };
}

function trackIdentity(
  track:
    | { type: "parameter"; parameterId: string }
    | { type: "bone"; boneId: string; property: string },
): string {
  if (track.type === "parameter") return `parameter:${track.parameterId}`;
  return `bone:${track.boneId}:${track.property}`;
}

export function createFirstMotionDefaults(
  project: ProjectData,
  activeClip: AnimationClip | null,
): FirstMotionDefaults {
  const detection = detectIdleSynthTargets(project);
  const swayOptions = listMotionPresetTargetOptions(project, "idleSway");
  return {
    detection,
    swayOptions,
    state: {
      clipMode: activeClip ? "active" : "new",
      clipName: "First Motion",
      durationFrames: activeClip?.duration ?? 120,
      fps: activeClip?.fps ?? 30,
      seed: 1,
      blinkEnabled: detection.defaultBlinkTargetId !== null,
      blinkTargetId: detection.defaultBlinkTargetId ?? "",
      breathingEnabled: detection.defaultBreathingTargetId !== null,
      breathingTargetId: detection.defaultBreathingTargetId ?? "",
      swayEnabled: false,
      swayTargetId: "",
    },
  };
}

export function createFirstMotionPlan(
  project: ProjectData,
  activeClip: AnimationClip | null,
  state: FirstMotionDialogState,
): FirstMotionPlan {
  const detection = detectIdleSynthTargets(project);
  const swayOptions = listMotionPresetTargetOptions(project, "idleSway");
  const destinationClip =
    state.clipMode === "active" && activeClip ? activeClip : buildVirtualClip(state);
  const blinkTarget =
    detection.blinkOptions.find((option) => option.id === state.blinkTargetId)?.target ??
    null;
  const breathingTarget =
    detection.breathingOptions.find((option) => option.id === state.breathingTargetId)
      ?.target ?? null;
  const swayTarget =
    swayOptions.find((option) => option.id === state.swayTargetId)?.target ?? null;

  const idleInput: IdleSynthInput = {
    startFrame: 0,
    durationFrames: destinationClip.duration,
    seed: state.seed,
    blink: {
      enabled: state.blinkEnabled,
      target: blinkTarget,
      openValue: 0,
      closedValue: 1,
      minIntervalFrames: Math.max(destinationClip.fps * 2, 24),
      maxIntervalFrames: Math.max(destinationClip.fps * 4, 60),
      closeDurationFrames: 2,
      holdDurationFrames: 1,
      openDurationFrames: 2,
    },
    breathing: {
      enabled: state.breathingEnabled,
      target: breathingTarget,
      centerValue: 0,
      minAmplitude: 0.08,
      maxAmplitude: 0.18,
      minCycleLengthFrames: Math.max(destinationClip.fps * 2, 24),
      maxCycleLengthFrames: Math.max(destinationClip.fps * 4, 60),
    },
  };

  const idlePlan = planIdleSynth(project, destinationClip, idleInput);
  const warnings = [...detection.warnings, ...idlePlan.warnings];

  let swayPlan: MotionPresetPlan | null = null;
  if (state.swayEnabled) {
    if (!swayTarget) {
      warnings.push("Idle sway target is missing.");
    } else {
      const candidate = planMotionPreset(project, destinationClip, {
        kind: "idleSway",
        target: swayTarget,
        startFrame: 0,
        durationFrames: destinationClip.duration,
        centerValue: 0,
        amplitude: swayTarget.kind === "bone" ? 15 : 0.12,
        cycleLengthFrames: Math.max(destinationClip.fps * 2, 24),
      });
      warnings.push(...candidate.warnings);
      const idleTrackIds = new Set(
        idlePlan.writes.map((write) => trackIdentity(write.track)),
      );
      const conflicts = candidate.writes.filter((write) =>
        idleTrackIds.has(trackIdentity(write.track)),
      );
      if (conflicts.length > 0) {
        warnings.push(
          `Idle sway conflicts with existing generated tracks: ${conflicts
            .map((write) => write.track.label)
            .join(", ")}.`,
        );
      } else {
        swayPlan = candidate;
      }
    }
  }

  const affectedTrackLabels = [
    ...idlePlan.writes.map((write) => write.track.label),
    ...(swayPlan?.writes.map((write) => write.track.label) ?? []),
  ];

  return {
    destinationClip,
    idlePlan,
    swayPlan,
    warnings,
    affectedTrackLabels,
    hasApplicableWrites: idlePlan.writes.length > 0 || (swayPlan?.writes.length ?? 0) > 0,
  };
}

export function applyFirstMotionPlan(
  project: ProjectData,
  options: ApplyFirstMotionOptions,
): ApplyFirstMotionResult {
  const activeClip = options.activeClipId
    ? (findClipInProject(project, options.activeClipId) ?? null)
    : null;
  if (options.state.clipMode === "active" && !activeClip) {
    return { clipId: null, plan: null, applied: false };
  }

  const plan = createFirstMotionPlan(project, activeClip, options.state);
  if (!plan.hasApplicableWrites) {
    return { clipId: activeClip?.id ?? null, plan, applied: false };
  }

  let nextClipId = activeClip?.id ?? null;
  if (options.state.clipMode === "new") {
    nextClipId = createClip(
      project,
      options.state.clipName.trim() || "First Motion",
      options.sceneId,
      options.createId,
    );
    if (!nextClipId) return { clipId: null, plan, applied: false };
    setClipDuration(project, nextClipId, options.state.durationFrames);
    setClipFps(project, nextClipId, options.state.fps);
  }
  if (!nextClipId) return { clipId: null, plan, applied: false };

  let applied = false;
  if (plan.idlePlan && plan.idlePlan.writes.length > 0) {
    applied = applyIdleSynthPlan(project, nextClipId, plan.idlePlan) || applied;
  }
  if (plan.swayPlan && plan.swayPlan.writes.length > 0) {
    applied = applyMotionPreset(project, nextClipId, plan.swayPlan) || applied;
  }
  return { clipId: nextClipId, plan, applied };
}
