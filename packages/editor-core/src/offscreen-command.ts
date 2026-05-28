import type { ProjectData } from "@vivi2d/core/types";

export interface AddOffscreenTargetInput {
  width: number;
  height: number;
}

const defaultCreateId = () => crypto.randomUUID();

function ensureOffscreenTargets(project: ProjectData) {
  if (!project.offscreenTargets) project.offscreenTargets = [];
  return project.offscreenTargets;
}

function normalizeBufferDimension(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.round(value));
}

export function addOffscreenTarget(
  project: ProjectData,
  input: AddOffscreenTargetInput,
  createId: () => string = defaultCreateId,
): string {
  const id = createId();
  ensureOffscreenTargets(project).push({
    id,
    width: normalizeBufferDimension(input.width),
    height: normalizeBufferDimension(input.height),
    sourceLayerIds: [],
  });
  return id;
}

export function removeOffscreenTarget(
  project: ProjectData,
  targetId: string,
): boolean {
  if (!project.offscreenTargets) return false;
  const beforeCount = project.offscreenTargets.length;
  project.offscreenTargets = project.offscreenTargets.filter(
    (target) => target.id !== targetId,
  );
  return project.offscreenTargets.length !== beforeCount;
}

export function addOffscreenSourceLayer(
  project: ProjectData,
  targetId: string,
  layerId: string,
): boolean {
  const target = project.offscreenTargets?.find((entry) => entry.id === targetId);
  if (!target) return false;
  if (target.sourceLayerIds.includes(layerId)) return false;
  target.sourceLayerIds.push(layerId);
  return true;
}

export function removeOffscreenSourceLayer(
  project: ProjectData,
  targetId: string,
  layerId: string,
): boolean {
  const target = project.offscreenTargets?.find((entry) => entry.id === targetId);
  if (!target) return false;
  const beforeCount = target.sourceLayerIds.length;
  target.sourceLayerIds = target.sourceLayerIds.filter((id) => id !== layerId);
  return target.sourceLayerIds.length !== beforeCount;
}

export function setOffscreenBufferSize(
  project: ProjectData,
  targetId: string,
  width: number,
  height: number,
): boolean {
  const target = project.offscreenTargets?.find((entry) => entry.id === targetId);
  if (!target) return false;
  target.width = normalizeBufferDimension(width);
  target.height = normalizeBufferDimension(height);
  return true;
}
