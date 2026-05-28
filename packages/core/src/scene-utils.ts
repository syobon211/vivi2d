import type { AnimationClip, ProjectData } from "./types";

export function findClipInProject(
  project: ProjectData,
  clipId: string,
): AnimationClip | undefined {
  for (const scene of project.scenes) {
    const clip = scene.clips.find((c) => c.id === clipId);
    if (clip) return clip;
  }
  return project.clips.find((c) => c.id === clipId);
}
