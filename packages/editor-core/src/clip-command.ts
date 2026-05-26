import { EASING_PRESETS, TIMELINE_DEFAULTS } from "@vivi2d/core/constants";
import { type BakeOptions, bakePhysics } from "@vivi2d/core/physics-bake";
import { removeKeyframeAtFrame, upsertKeyframe } from "@vivi2d/core/track-utils";
import type {
  AnimationClip,
  AnimationTrack,
  AudioTrack,
  BonePropertyType,
  BoneTrack,
  ImageSequenceTrack,
  InterpolationType,
  LipSyncTrack,
  ParameterDefinition,
  PhysicsGroup,
  ProjectData,
  TimelineKeyframe,
} from "@vivi2d/core/types";

const defaultCreateId = () => crypto.randomUUID();

export interface KeyframeUpdates {
  value?: number;
  interpolation?: InterpolationType;
  cp1x?: number;
  cp1y?: number;
  cp2x?: number;
  cp2y?: number;
}

export type ClipTrackRef =
  | { type: "parameter"; parameterId: string }
  | { type: "bone"; boneId: string; property: BonePropertyType };

export interface ClipTrackKeyframeWrite {
  track: ClipTrackRef;
  keyframes: readonly TimelineKeyframe[];
}

export interface MotionPresetLikePlan {
  startFrame: number;
  endFrame: number;
  writes: readonly ClipTrackKeyframeWrite[];
}

export interface AnimationRetargetLikePlan {
  targetStartFrame: number;
  targetEndFrame: number;
  writes: readonly ClipTrackKeyframeWrite[];
}

export interface MotionAssistLikeWrite {
  parameterId: string;
  rangeStart: number;
  rangeEnd: number;
  keyframes: readonly TimelineKeyframe[];
}

export interface MotionAssistLikePlan {
  writes: readonly MotionAssistLikeWrite[];
}

export interface IdleSynthLikeWrite extends ClipTrackKeyframeWrite {
  rangeStart: number;
  rangeEnd: number;
}

export interface IdleSynthLikePlan {
  writes: readonly IdleSynthLikeWrite[];
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function roundFiniteOr(value: number, fallback: number): number {
  return Math.round(finiteOr(value, fallback));
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  return Math.max(min, Math.min(max, finiteOr(value, fallback)));
}

function clampInt(value: number, min: number, max: number, fallback: number): number {
  return Math.max(min, Math.min(max, roundFiniteOr(value, fallback)));
}

function cloneKeyframe(keyframe: TimelineKeyframe): TimelineKeyframe {
  const next: TimelineKeyframe = {
    frame: roundFiniteOr(keyframe.frame, 0),
    value: finiteOr(keyframe.value, 0),
    interpolation: keyframe.interpolation,
  };
  if (keyframe.cp1x !== undefined) next.cp1x = finiteOr(keyframe.cp1x, 0);
  if (keyframe.cp1y !== undefined) next.cp1y = finiteOr(keyframe.cp1y, 0);
  if (keyframe.cp2x !== undefined) next.cp2x = finiteOr(keyframe.cp2x, 0);
  if (keyframe.cp2y !== undefined) next.cp2y = finiteOr(keyframe.cp2y, 0);
  if (keyframe.ellipseRatio !== undefined) {
    next.ellipseRatio = finiteOr(keyframe.ellipseRatio, 1);
  }
  if (keyframe.ellipseDirection !== undefined) {
    next.ellipseDirection = keyframe.ellipseDirection;
  }
  if (keyframe.snsOscillations !== undefined) {
    next.snsOscillations = finiteOr(keyframe.snsOscillations, 1);
  }
  if (keyframe.snsDamping !== undefined) {
    next.snsDamping = finiteOr(keyframe.snsDamping, 0);
  }
  return next;
}

function sortedKeyframes(
  keyframes: readonly TimelineKeyframe[],
): TimelineKeyframe[] {
  return keyframes.map(cloneKeyframe).sort((left, right) => left.frame - right.frame);
}

function getClip(project: ProjectData, clipId: string): AnimationClip | undefined {
  for (const scene of project.scenes) {
    const clip = scene.clips.find((entry) => entry.id === clipId);
    if (clip) return clip;
  }
  return project.clips.find((entry) => entry.id === clipId);
}

function ensureParameterTrack(
  clip: AnimationClip,
  parameterId: string,
): AnimationTrack {
  let track = clip.tracks.find((entry) => entry.parameterId === parameterId);
  if (!track) {
    track = { parameterId, keyframes: [] };
    clip.tracks.push(track);
  }
  return track;
}

function ensureBoneTrack(
  clip: AnimationClip,
  boneId: string,
  property: BonePropertyType,
): BoneTrack {
  if (!clip.boneTracks) clip.boneTracks = [];
  let track = clip.boneTracks.find(
    (entry) => entry.boneId === boneId && entry.property === property,
  );
  if (!track) {
    track = { boneId, property, keyframes: [] };
    clip.boneTracks.push(track);
  }
  return track;
}

function ensureImageSequenceTrack(
  clip: AnimationClip,
  targetMeshId: string,
): ImageSequenceTrack {
  if (!clip.imageSequenceTracks) clip.imageSequenceTracks = [];
  let track = clip.imageSequenceTracks.find(
    (entry) => entry.targetMeshId === targetMeshId,
  );
  if (!track) {
    track = { targetMeshId, entries: [] };
    clip.imageSequenceTracks.push(track);
  }
  return track;
}

export function replaceKeyframesInRange(
  keyframes: readonly TimelineKeyframe[],
  startFrame: number,
  endFrame: number,
  replacement: readonly TimelineKeyframe[],
): TimelineKeyframe[] {
  const start = Math.min(roundFiniteOr(startFrame, 0), roundFiniteOr(endFrame, 0));
  const end = Math.max(roundFiniteOr(startFrame, 0), roundFiniteOr(endFrame, 0));
  return [
    ...keyframes
      .filter((keyframe) => keyframe.frame < start || keyframe.frame > end)
      .map(cloneKeyframe),
    ...replacement.map(cloneKeyframe),
  ].sort((left, right) => left.frame - right.frame);
}

function applyTrackWrite(
  clip: AnimationClip,
  write: ClipTrackKeyframeWrite,
  startFrame: number,
  endFrame: number,
): boolean {
  switch (write.track.type) {
    case "parameter": {
      const track = ensureParameterTrack(clip, write.track.parameterId);
      track.keyframes = replaceKeyframesInRange(
        track.keyframes,
        startFrame,
        endFrame,
        write.keyframes,
      );
      return true;
    }
    case "bone": {
      const track = ensureBoneTrack(
        clip,
        write.track.boneId,
        write.track.property,
      );
      track.keyframes = replaceKeyframesInRange(
        track.keyframes,
        startFrame,
        endFrame,
        write.keyframes,
      );
      return true;
    }
  }
}

export function createClip(
  project: ProjectData,
  name: string,
  sceneId?: string | null,
  createId: () => string = defaultCreateId,
): string {
  const id = createId();
  const clip: AnimationClip = {
    id,
    name,
    duration: TIMELINE_DEFAULTS.DURATION,
    fps: TIMELINE_DEFAULTS.FPS,
    tracks: [],
  };
  if (sceneId) {
    const scene = project.scenes.find((entry) => entry.id === sceneId);
    if (!scene) return "";
    scene.clips.push(clip);
    return id;
  }
  project.clips.push(clip);
  return id;
}

export function deleteClip(project: ProjectData, clipId: string): boolean {
  for (const scene of project.scenes) {
    const index = scene.clips.findIndex((entry) => entry.id === clipId);
    if (index >= 0) {
      scene.clips.splice(index, 1);
      return true;
    }
  }
  const beforeCount = project.clips.length;
  project.clips = project.clips.filter((entry) => entry.id !== clipId);
  return project.clips.length !== beforeCount;
}

export function renameClip(
  project: ProjectData,
  clipId: string,
  name: string,
): boolean {
  const clip = getClip(project, clipId);
  if (!clip) return false;
  clip.name = name;
  return true;
}

export function setClipDuration(
  project: ProjectData,
  clipId: string,
  duration: number,
): boolean {
  const clip = getClip(project, clipId);
  if (!clip) return false;
  clip.duration = clampInt(
    duration,
    TIMELINE_DEFAULTS.MIN_DURATION,
    TIMELINE_DEFAULTS.MAX_DURATION,
    clip.duration,
  );
  return true;
}

export function setClipFps(
  project: ProjectData,
  clipId: string,
  fps: number,
): boolean {
  const clip = getClip(project, clipId);
  if (!clip) return false;
  clip.fps = clampInt(
    fps,
    TIMELINE_DEFAULTS.MIN_FPS,
    TIMELINE_DEFAULTS.MAX_FPS,
    clip.fps,
  );
  return true;
}

export function addTrack(
  project: ProjectData,
  clipId: string,
  parameterId: string,
): boolean {
  const clip = getClip(project, clipId);
  if (!clip || clip.tracks.some((track) => track.parameterId === parameterId)) {
    return false;
  }
  clip.tracks.push({ parameterId, keyframes: [] });
  return true;
}

export function removeTrack(
  project: ProjectData,
  clipId: string,
  parameterId: string,
): boolean {
  const clip = getClip(project, clipId);
  if (!clip) return false;
  const beforeCount = clip.tracks.length;
  clip.tracks = clip.tracks.filter((track) => track.parameterId !== parameterId);
  return clip.tracks.length !== beforeCount;
}

export function addBoneTrack(
  project: ProjectData,
  clipId: string,
  boneId: string,
  property: BonePropertyType,
): boolean {
  const clip = getClip(project, clipId);
  if (!clip) return false;
  if (!clip.boneTracks) clip.boneTracks = [];
  if (
    clip.boneTracks.some(
      (track) => track.boneId === boneId && track.property === property,
    )
  ) {
    return false;
  }
  clip.boneTracks.push({ boneId, property, keyframes: [] });
  return true;
}

export function removeBoneTrack(
  project: ProjectData,
  clipId: string,
  boneId: string,
  property: BonePropertyType,
): boolean {
  const clip = getClip(project, clipId);
  if (!clip?.boneTracks) return false;
  const beforeCount = clip.boneTracks.length;
  clip.boneTracks = clip.boneTracks.filter(
    (track) => !(track.boneId === boneId && track.property === property),
  );
  return clip.boneTracks.length !== beforeCount;
}

export function addImageSequenceTrack(
  project: ProjectData,
  clipId: string,
  targetMeshId: string,
): boolean {
  const clip = getClip(project, clipId);
  if (!clip) return false;
  if (!clip.imageSequenceTracks) clip.imageSequenceTracks = [];
  if (clip.imageSequenceTracks.some((track) => track.targetMeshId === targetMeshId)) {
    return false;
  }
  clip.imageSequenceTracks.push({ targetMeshId, entries: [] });
  return true;
}

export function removeImageSequenceTrack(
  project: ProjectData,
  clipId: string,
  targetMeshId: string,
): boolean {
  const clip = getClip(project, clipId);
  if (!clip?.imageSequenceTracks) return false;
  const beforeCount = clip.imageSequenceTracks.length;
  clip.imageSequenceTracks = clip.imageSequenceTracks.filter(
    (track) => track.targetMeshId !== targetMeshId,
  );
  return clip.imageSequenceTracks.length !== beforeCount;
}

export function addAudioTrack(
  project: ProjectData,
  clipId: string,
  track: AudioTrack,
): boolean {
  const clip = getClip(project, clipId);
  if (!clip) return false;
  if (!clip.audioTracks) clip.audioTracks = [];
  if (clip.audioTracks.some((entry) => entry.id === track.id)) return false;
  const maxFrame = Math.max(0, clip.duration - 1);
  clip.audioTracks.push({
    ...track,
    startFrame: clampInt(track.startFrame, 0, maxFrame, 0),
    sourceDurationSeconds:
      track.sourceDurationSeconds !== null && track.sourceDurationSeconds > 0
        ? track.sourceDurationSeconds
        : null,
    gain: clamp(track.gain, 0, 1, 1),
  });
  return true;
}

export function removeAudioTrack(
  project: ProjectData,
  clipId: string,
  trackId: string,
): boolean {
  const clip = getClip(project, clipId);
  if (!clip?.audioTracks) return false;
  const beforeCount = clip.audioTracks.length;
  clip.audioTracks = clip.audioTracks.filter((track) => track.id !== trackId);
  return clip.audioTracks.length !== beforeCount;
}

export function updateAudioTrack(
  project: ProjectData,
  clipId: string,
  trackId: string,
  patch: Partial<Omit<AudioTrack, "id">>,
): boolean {
  const clip = getClip(project, clipId);
  const track = clip?.audioTracks?.find((entry) => entry.id === trackId);
  if (!clip || !track) return false;
  if (patch.name !== undefined) track.name = patch.name;
  if (patch.sourcePath !== undefined) track.sourcePath = patch.sourcePath;
  if (patch.startFrame !== undefined) {
    const maxFrame = Math.max(0, clip.duration - 1);
    track.startFrame = clampInt(patch.startFrame, 0, maxFrame, track.startFrame);
  }
  if (patch.sourceDurationSeconds !== undefined) {
    track.sourceDurationSeconds =
      patch.sourceDurationSeconds !== null && patch.sourceDurationSeconds > 0
        ? patch.sourceDurationSeconds
        : null;
  }
  if (patch.gain !== undefined) {
    track.gain = clamp(patch.gain, 0, 1, track.gain);
  }
  if (patch.muted !== undefined) {
    track.muted = patch.muted;
  }
  return true;
}

export function addLipSyncTrack(
  project: ProjectData,
  clipId: string,
  track: LipSyncTrack,
): boolean {
  const clip = getClip(project, clipId);
  if (!clip) return false;
  if (!clip.lipSyncTracks) clip.lipSyncTracks = [];
  if (clip.lipSyncTracks.some((entry) => entry.id === track.id)) return false;
  clip.lipSyncTracks.push({
    ...track,
    analysisType: "rms",
    analysisFps: Math.max(1, roundFiniteOr(track.analysisFps, 1)),
    samples: track.samples.map((sample) => clamp(sample, 0, 1, 0)),
    gain: clamp(track.gain, 0, 1, 1),
  });
  return true;
}

export function removeLipSyncTrack(
  project: ProjectData,
  clipId: string,
  trackId: string,
): boolean {
  const clip = getClip(project, clipId);
  if (!clip?.lipSyncTracks) return false;
  const beforeCount = clip.lipSyncTracks.length;
  clip.lipSyncTracks = clip.lipSyncTracks.filter((track) => track.id !== trackId);
  return clip.lipSyncTracks.length !== beforeCount;
}

export function updateLipSyncTrack(
  project: ProjectData,
  clipId: string,
  trackId: string,
  patch: Partial<
    Omit<
      LipSyncTrack,
      "id" | "sourceAudioTrackId" | "analysisType" | "analysisFps" | "samples"
    >
  >,
): boolean {
  const track = getClip(project, clipId)?.lipSyncTracks?.find(
    (entry) => entry.id === trackId,
  );
  if (!track) return false;
  if (patch.name !== undefined) track.name = patch.name;
  if (patch.targetParameterId !== undefined) {
    track.targetParameterId = patch.targetParameterId;
  }
  if (patch.sourcePathAtBake !== undefined) {
    track.sourcePathAtBake = patch.sourcePathAtBake;
  }
  if (patch.sourceDurationSecondsAtBake !== undefined) {
    track.sourceDurationSecondsAtBake = patch.sourceDurationSecondsAtBake;
  }
  if (patch.gain !== undefined) {
    track.gain = clamp(patch.gain, 0, 1, track.gain);
  }
  if (patch.muted !== undefined) {
    track.muted = patch.muted;
  }
  return true;
}

export function addKeyframe(
  project: ProjectData,
  clipId: string,
  parameterId: string,
  frame: number,
  value: number,
  interpolation: InterpolationType = "linear",
): boolean {
  const clip = getClip(project, clipId);
  if (!clip) return false;
  upsertKeyframe(
    ensureParameterTrack(clip, parameterId).keyframes,
    roundFiniteOr(frame, 0),
    finiteOr(value, 0),
    interpolation,
  );
  return true;
}

export function removeKeyframe(
  project: ProjectData,
  clipId: string,
  parameterId: string,
  frame: number,
): boolean {
  const clip = getClip(project, clipId);
  const track = clip?.tracks.find((entry) => entry.parameterId === parameterId);
  if (!track) return false;
  const beforeCount = track.keyframes.length;
  track.keyframes = removeKeyframeAtFrame(track.keyframes, roundFiniteOr(frame, 0));
  return track.keyframes.length !== beforeCount;
}

export function updateKeyframe(
  project: ProjectData,
  clipId: string,
  parameterId: string,
  frame: number,
  updates: KeyframeUpdates,
): boolean {
  const clip = getClip(project, clipId);
  const track = clip?.tracks.find((entry) => entry.parameterId === parameterId);
  const keyframe = track?.keyframes.find(
    (entry) => entry.frame === roundFiniteOr(frame, 0),
  );
  if (!keyframe) return false;
  if (updates.value !== undefined) {
    keyframe.value = finiteOr(updates.value, keyframe.value);
  }
  if (updates.interpolation !== undefined) keyframe.interpolation = updates.interpolation;
  if (updates.cp1x !== undefined) keyframe.cp1x = finiteOr(updates.cp1x, 0);
  if (updates.cp1y !== undefined) keyframe.cp1y = finiteOr(updates.cp1y, 0);
  if (updates.cp2x !== undefined) keyframe.cp2x = finiteOr(updates.cp2x, 0);
  if (updates.cp2y !== undefined) keyframe.cp2y = finiteOr(updates.cp2y, 0);
  return true;
}

export function applyEasingPreset(
  project: ProjectData,
  clipId: string,
  parameterId: string,
  frame: number,
  preset: keyof typeof EASING_PRESETS,
): boolean {
  const clip = getClip(project, clipId);
  const track = clip?.tracks.find((entry) => entry.parameterId === parameterId);
  const keyframe = track?.keyframes.find(
    (entry) => entry.frame === roundFiniteOr(frame, 0),
  );
  const easing = EASING_PRESETS[preset];
  if (!keyframe || !easing) return false;
  keyframe.interpolation = "bezier";
  keyframe.cp1x = easing.cp1x;
  keyframe.cp1y = easing.cp1y;
  keyframe.cp2x = easing.cp2x;
  keyframe.cp2y = easing.cp2y;
  return true;
}

export function addBoneKeyframe(
  project: ProjectData,
  clipId: string,
  boneId: string,
  property: BonePropertyType,
  frame: number,
  value: number,
  interpolation: InterpolationType = "linear",
): boolean {
  const clip = getClip(project, clipId);
  if (!clip) return false;
  upsertKeyframe(
    ensureBoneTrack(clip, boneId, property).keyframes,
    roundFiniteOr(frame, 0),
    finiteOr(value, 0),
    interpolation,
  );
  return true;
}

export function removeBoneKeyframe(
  project: ProjectData,
  clipId: string,
  boneId: string,
  property: BonePropertyType,
  frame: number,
): boolean {
  const clip = getClip(project, clipId);
  const track = clip?.boneTracks?.find(
    (entry) => entry.boneId === boneId && entry.property === property,
  );
  if (!track) return false;
  const beforeCount = track.keyframes.length;
  track.keyframes = removeKeyframeAtFrame(track.keyframes, roundFiniteOr(frame, 0));
  return track.keyframes.length !== beforeCount;
}

export function addImageSequenceEntry(
  project: ProjectData,
  clipId: string,
  targetMeshId: string,
  startFrame: number,
  imageId: string,
): boolean {
  const clip = getClip(project, clipId);
  if (!clip) return false;
  const track = ensureImageSequenceTrack(clip, targetMeshId);
  const frame = roundFiniteOr(startFrame, 0);
  const existingIndex = track.entries.findIndex((entry) => entry.startFrame === frame);
  if (existingIndex >= 0) {
    track.entries[existingIndex] = { startFrame: frame, imageId };
  } else {
    track.entries.push({ startFrame: frame, imageId });
  }
  track.entries.sort((left, right) => left.startFrame - right.startFrame);
  return true;
}

export function removeImageSequenceEntry(
  project: ProjectData,
  clipId: string,
  targetMeshId: string,
  startFrame: number,
): boolean {
  const clip = getClip(project, clipId);
  const track = clip?.imageSequenceTracks?.find(
    (entry) => entry.targetMeshId === targetMeshId,
  );
  if (!track) return false;
  const beforeCount = track.entries.length;
  const frame = roundFiniteOr(startFrame, 0);
  track.entries = track.entries.filter((entry) => entry.startFrame !== frame);
  return track.entries.length !== beforeCount;
}

export function applyMotionPreset(
  project: ProjectData,
  clipId: string,
  plan: MotionPresetLikePlan,
): boolean {
  const clip = getClip(project, clipId);
  if (!clip) return false;
  let changed = false;
  for (const write of plan.writes) {
    changed = applyTrackWrite(clip, write, plan.startFrame, plan.endFrame) || changed;
  }
  return changed;
}

export function applyAnimationRetargetPlan(
  project: ProjectData,
  clipId: string,
  plan: AnimationRetargetLikePlan,
): boolean {
  const clip = getClip(project, clipId);
  if (!clip) return false;
  let changed = false;
  for (const write of plan.writes) {
    changed =
      applyTrackWrite(clip, write, plan.targetStartFrame, plan.targetEndFrame) ||
      changed;
  }
  return changed;
}

export function applyMotionAssistImportPlan(
  project: ProjectData,
  clipId: string,
  plan: MotionAssistLikePlan,
): boolean {
  const clip = getClip(project, clipId);
  if (!clip) return false;
  let changed = false;
  for (const write of plan.writes) {
    const track = ensureParameterTrack(clip, write.parameterId);
    track.keyframes = replaceKeyframesInRange(
      track.keyframes,
      write.rangeStart,
      write.rangeEnd,
      write.keyframes,
    );
    changed = true;
  }
  return changed;
}

export function applyIdleSynthPlan(
  project: ProjectData,
  clipId: string,
  plan: IdleSynthLikePlan,
): boolean {
  const clip = getClip(project, clipId);
  if (!clip) return false;
  let changed = false;
  for (const write of plan.writes) {
    changed = applyTrackWrite(clip, write, write.rangeStart, write.rangeEnd) || changed;
  }
  return changed;
}

export function bakePhysicsToClip(
  clip: AnimationClip,
  physicsGroups: readonly PhysicsGroup[],
  parameters: readonly ParameterDefinition[],
  options: BakeOptions,
): boolean {
  const result = bakePhysics(clip, [...physicsGroups], [...parameters], options);
  let changed = false;
  for (const [parameterId, keyframes] of Object.entries(result.parameterKeyframes)) {
    const track = ensureParameterTrack(clip, parameterId);
    track.keyframes = replaceKeyframesInRange(
      track.keyframes,
      options.startFrame,
      options.endFrame,
      keyframes,
    );
    changed = true;
  }

  for (const [boneId, keyframes] of Object.entries(result.boneKeyframes)) {
    const track = ensureBoneTrack(clip, boneId, "angle");
    track.keyframes = replaceKeyframesInRange(
      track.keyframes,
      options.startFrame,
      options.endFrame,
      keyframes,
    );
    changed = true;
  }
  return changed;
}

export const __clipCommandTestUtils = {
  sortedKeyframes,
};
