import type { ProjectData } from "@vivi2d/core/types";
import { enablePatches, type Patch, produceWithPatches } from "immer";

enablePatches();

export type { Patch };

export interface ProjectMutationResult {
  previous: ProjectData;
  next: ProjectData;
  patches: Patch[];
  inversePatches: Patch[];
  changed: boolean;
}

export function createProjectMutation(
  previous: ProjectData,
  mutate: (project: ProjectData) => void,
): ProjectMutationResult {
  const [next, patches, inversePatches] = produceWithPatches(previous, mutate);
  return {
    previous,
    next,
    patches,
    inversePatches,
    changed: patches.length > 0,
  };
}
