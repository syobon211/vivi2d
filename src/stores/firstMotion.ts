import {
  applyFirstMotionPlan,
  type FirstMotionDialogState,
} from "@vivi2d/editor-core/first-motion-command";
import { useEditorStore } from "@/stores/editorStore";
import { mutateProject } from "@/stores/projectMutator";
import { useTimelineStore } from "@/stores/timelineStore";

export interface ApplyFirstMotionRequest {
  activeClipId: string | null;
  state: FirstMotionDialogState;
}

export function applyFirstMotion(
  request: ApplyFirstMotionRequest,
): string | null {
  const project = useEditorStore.getState().project;
  if (!project) return null;

  const timeline = useTimelineStore.getState();
  let nextClipId: string | null = null;
  mutateProject((nextProject) => {
    const result = applyFirstMotionPlan(nextProject, {
      activeClipId: request.activeClipId,
      state: request.state,
      sceneId: timeline.activeSceneId,
    });
    if (result.applied) nextClipId = result.clipId;
  }, "first-motion");

  if (nextClipId) {
    if (timeline.activeClipId !== nextClipId) {
      timeline.setActiveClip(nextClipId);
    }
  }
  return nextClipId;
}
