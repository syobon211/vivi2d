import {
  createClip as createClipCommand,
  deleteClip as deleteClipCommand,
  renameClip as renameClipCommand,
  setClipDuration as setClipDurationCommand,
  setClipFps as setClipFpsCommand,
} from "@vivi2d/editor-core/clip-command";
import { mutateProject } from "../projectMutator";
import { useTimelineStore } from "../timelineStore";

export interface ClipSliceActions {
  createClip: (name: string) => string;
  deleteClip: (clipId: string) => void;
  renameClip: (clipId: string, name: string) => void;
  setClipDuration: (clipId: string, duration: number) => void;
  setClipFps: (clipId: string, fps: number) => void;
}

export const createClipSlice = (): ClipSliceActions => ({
  createClip: (name) => {
    let id = "";
    const sceneId = useTimelineStore.getState().activeSceneId;
    mutateProject((project) => {
      id = createClipCommand(project, name, sceneId);
    });
    return id;
  },

  deleteClip: (clipId) =>
    mutateProject((project) => {
      deleteClipCommand(project, clipId);
    }),

  renameClip: (clipId, name) =>
    mutateProject((project) => {
      renameClipCommand(project, clipId, name);
    }),

  setClipDuration: (clipId, duration) =>
    mutateProject((project) => {
      setClipDurationCommand(project, clipId, duration);
    }),

  setClipFps: (clipId, fps) =>
    mutateProject((project) => {
      setClipFpsCommand(project, clipId, fps);
    }),
});
