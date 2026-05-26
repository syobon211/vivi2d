// Scene, AnimationClip, TimelineKeyframe, AnimationTrack, BoneTrack,

import type { ClipId, LayerId, SceneId } from "./layer";
import type { BonePropertyType, ParameterId } from "./parameter";

export type InterpolationType = "linear" | "step" | "bezier" | "ellipse" | "sns";

export interface TimelineKeyframe {
  frame: number;
  value: number;
  interpolation: InterpolationType;

  cp1x?: number;

  cp1y?: number;

  cp2x?: number;

  cp2y?: number;

  ellipseRatio?: number;

  ellipseDirection?: "cw" | "ccw";

  snsOscillations?: number;

  snsDamping?: number;
}

export interface AnimationTrack {
  parameterId: ParameterId;
  keyframes: TimelineKeyframe[];
}

export interface BoneTrack {
  boneId: LayerId;
  property: BonePropertyType;
  keyframes: TimelineKeyframe[];
}

export interface ImageSequenceEntry {
  startFrame: number;

  imageId: string;
}

export interface ImageSequenceTrack {
  targetMeshId: LayerId;

  entries: ImageSequenceEntry[];
}

export interface AudioTrack {
  id: string;
  name: string;
  sourcePath: string;
  startFrame: number;
  sourceDurationSeconds: number | null;
  gain: number;
  muted: boolean;
}

export interface LipSyncTrack {
  id: string;
  name: string;
  sourceAudioTrackId: string;
  analysisType: "rms";
  analysisFps: number;
  samples: number[];
  targetParameterId: ParameterId | null;
  sourcePathAtBake: string;
  sourceDurationSecondsAtBake: number | null;
  gain: number;
  muted: boolean;
}

export interface AnimationClip {
  id: ClipId;
  name: string;
  duration: number;
  fps: number;
  tracks: AnimationTrack[];
  boneTracks?: BoneTrack[];
  imageSequenceTracks?: ImageSequenceTrack[];
  audioTracks?: AudioTrack[];
  lipSyncTracks?: LipSyncTrack[];
  ikControllerTracks?: IKControllerTrack[];
}

export interface IKControllerTrack {
  controllerId: string;

  targetXKeyframes: TimelineKeyframe[];

  targetYKeyframes: TimelineKeyframe[];
}

export interface Scene {
  id: SceneId;
  name: string;
  clips: AnimationClip[];
}

export type SceneBlendMode = "crossfade" | "additive" | "override";

export interface SceneBlend {
  id: string;

  sourceSceneId: SceneId;

  targetSceneId: SceneId;

  mode: SceneBlendMode;

  transitionFrames: number;

  easing: InterpolationType;
}
