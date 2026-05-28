import type {
  InterpolationType,
  ProjectData,
  SceneBlend,
  SceneBlendMode,
  SceneId,
} from "@vivi2d/core/types";

export interface CreateSceneBlendInput {
  sourceSceneId: SceneId;
  targetSceneId: SceneId;
  mode?: SceneBlendMode;
  transitionFrames?: number;
  easing?: InterpolationType;
}

export type UpdateSceneBlendInput = Partial<
  Pick<SceneBlend, "mode" | "transitionFrames" | "easing">
>;

const defaultCreateId = () => crypto.randomUUID();

function ensureSceneBlends(project: ProjectData): SceneBlend[] {
  if (!project.sceneBlends) project.sceneBlends = [];
  return project.sceneBlends;
}

function normalizeTransitionFrames(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 30;
  return Math.max(0, Math.round(value));
}

export function createSceneBlend(
  project: ProjectData,
  input: CreateSceneBlendInput,
  createId: () => string = defaultCreateId,
): string {
  const id = createId();
  ensureSceneBlends(project).push({
    id,
    sourceSceneId: input.sourceSceneId,
    targetSceneId: input.targetSceneId,
    mode: input.mode ?? "crossfade",
    transitionFrames: normalizeTransitionFrames(input.transitionFrames),
    easing: input.easing ?? "linear",
  });
  return id;
}

export function removeSceneBlend(project: ProjectData, blendId: string): boolean {
  if (!project.sceneBlends) return false;
  const beforeCount = project.sceneBlends.length;
  project.sceneBlends = project.sceneBlends.filter((blend) => blend.id !== blendId);
  return project.sceneBlends.length !== beforeCount;
}

export function updateSceneBlend(
  project: ProjectData,
  blendId: string,
  updates: UpdateSceneBlendInput,
): boolean {
  const blend = project.sceneBlends?.find((entry) => entry.id === blendId);
  if (!blend) return false;
  if (updates.mode !== undefined) blend.mode = updates.mode;
  if (updates.transitionFrames !== undefined) {
    blend.transitionFrames = normalizeTransitionFrames(updates.transitionFrames);
  }
  if (updates.easing !== undefined) blend.easing = updates.easing;
  return true;
}
