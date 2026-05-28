import type { BakeOptions } from "@vivi2d/core/physics-bake";
import { bakePhysicsToClip as bakePhysicsToClipCommand } from "@vivi2d/editor-core/clip-command";
import { useEditorStore } from "../editorStore";
import { mutateClip } from "../projectMutator";

export interface BakeSliceActions {
  bakePhysicsToClip: (clipId: string, options: BakeOptions) => void;
}

export const createBakeSlice = (): BakeSliceActions => ({
  bakePhysicsToClip: (clipId, options) =>
    mutateClip(clipId, (clip) => {
      const project = useEditorStore.getState().project;
      if (!project) return;

      bakePhysicsToClipCommand(
        clip,
        project.physicsGroups,
        project.parameters,
        options,
      );
    }),
});
