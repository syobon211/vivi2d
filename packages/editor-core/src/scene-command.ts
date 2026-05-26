import type {
  AnimationClip,
  AnimationTrack,
  BoneTrack,
  IKControllerTrack,
  ImageSequenceTrack,
  LipSyncTrack,
  ProjectData,
} from "@vivi2d/core/types";

const defaultCreateId = () => crypto.randomUUID();

function cloneTrack(track: AnimationTrack): AnimationTrack {
  return {
    ...track,
    keyframes: track.keyframes.map((keyframe) => ({ ...keyframe })),
  };
}

function cloneBoneTrack(track: BoneTrack): BoneTrack {
  return {
    ...track,
    keyframes: track.keyframes.map((keyframe) => ({ ...keyframe })),
  };
}

function cloneImageSequenceTrack(track: ImageSequenceTrack): ImageSequenceTrack {
  return {
    ...track,
    entries: track.entries.map((entry) => ({ ...entry })),
  };
}

function cloneLipSyncTrack(track: LipSyncTrack): LipSyncTrack {
  return {
    ...track,
    samples: [...track.samples],
  };
}

function cloneIKControllerTrack(track: IKControllerTrack): IKControllerTrack {
  return {
    ...track,
    targetXKeyframes: track.targetXKeyframes.map((keyframe) => ({ ...keyframe })),
    targetYKeyframes: track.targetYKeyframes.map((keyframe) => ({ ...keyframe })),
  };
}

function cloneClip(clip: AnimationClip, createId: () => string): AnimationClip {
  return {
    ...clip,
    id: createId(),
    tracks: clip.tracks.map(cloneTrack),
    boneTracks: clip.boneTracks?.map(cloneBoneTrack),
    imageSequenceTracks: clip.imageSequenceTracks?.map(cloneImageSequenceTrack),
    audioTracks: clip.audioTracks?.map((track) => ({ ...track })),
    lipSyncTracks: clip.lipSyncTracks?.map(cloneLipSyncTrack),
    ikControllerTracks: clip.ikControllerTracks?.map(cloneIKControllerTrack),
  };
}

export function createScene(
  project: ProjectData,
  name: string,
  createId: () => string = defaultCreateId,
): string {
  const id = createId();
  project.scenes.push({ id, name, clips: [] });
  return id;
}

export function deleteScene(project: ProjectData, sceneId: string): boolean {
  const beforeCount = project.scenes.length;
  project.scenes = project.scenes.filter((scene) => scene.id !== sceneId);
  return project.scenes.length !== beforeCount;
}

export function duplicateScene(
  project: ProjectData,
  sceneId: string,
  copySuffix: string,
  createId: () => string = defaultCreateId,
): string {
  const source = project.scenes.find((scene) => scene.id === sceneId);
  if (!source) return "";
  const id = createId();
  project.scenes.push({
    id,
    name: `${source.name} (${copySuffix})`,
    clips: source.clips.map((clip) => cloneClip(clip, createId)),
  });
  return id;
}

export function renameScene(
  project: ProjectData,
  sceneId: string,
  name: string,
): boolean {
  const scene = project.scenes.find((entry) => entry.id === sceneId);
  if (!scene) return false;
  scene.name = name;
  return true;
}
