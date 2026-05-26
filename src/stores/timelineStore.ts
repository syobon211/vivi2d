import { create } from "zustand";
import { withStandardMiddleware } from "./_middleware";
import { useEditorStore } from "./editorStore";

export type TimelineViewMode = "dopeSheet" | "graphEditor";

interface TimelineState {
  activeSceneId: string | null;

  activeClipId: string | null;

  currentFrame: number;

  isPlaying: boolean;

  isLooping: boolean;

  viewMode: TimelineViewMode;

  selectedGraphTrackId: string | null;
}

interface TimelineActions {
  play: () => void;
  pause: () => void;
  stop: () => void;
  togglePlay: () => void;
  setLooping: (loop: boolean) => void;
  seekTo: (frame: number) => void;

  advanceFrame: () => boolean;
  setActiveClip: (clipId: string | null) => void;
  setActiveScene: (sceneId: string | null) => void;
  setViewMode: (mode: TimelineViewMode) => void;
  setSelectedGraphTrack: (trackId: string | null) => void;
}

export type TimelineStore = TimelineState & TimelineActions;

function getActiveClip(clipId: string | null) {
  if (!clipId) return undefined;
  const project = useEditorStore.getState().project;
  if (!project) return undefined;
  for (const scene of project.scenes) {
    const clip = scene.clips.find((c) => c.id === clipId);
    if (clip) return clip;
  }
  return project.clips.find((c) => c.id === clipId);
}

export const useTimelineStore = create<TimelineStore>()(
  withStandardMiddleware<TimelineStore>(
    (set, get) => ({
      activeSceneId: null as string | null,
      activeClipId: null,
      currentFrame: 0,
      isPlaying: false,
      isLooping: false,
      viewMode: "dopeSheet" as TimelineViewMode,
      selectedGraphTrackId: null as string | null,

      play: () =>
        set((s) => {
          const clip = getActiveClip(s.activeClipId);
          if (!clip) return;
          if (s.currentFrame >= clip.duration - 1) {
            s.currentFrame = 0;
          }
          s.isPlaying = true;
        }),

      pause: () =>
        set((s) => {
          s.isPlaying = false;
        }),

      stop: () =>
        set((s) => {
          s.isPlaying = false;
          s.currentFrame = 0;
        }),

      togglePlay: () => {
        if (get().isPlaying) {
          get().pause();
        } else {
          get().play();
        }
      },

      setLooping: (loop) =>
        set((s) => {
          s.isLooping = loop;
        }),

      seekTo: (frame) =>
        set((s) => {
          const clip = getActiveClip(s.activeClipId);
          const maxFrame = clip ? clip.duration - 1 : 0;
          s.currentFrame = Math.max(0, Math.min(maxFrame, Math.round(frame)));
        }),

      advanceFrame: () => {
        const state = get();
        const clip = getActiveClip(state.activeClipId);
        if (!clip || !state.isPlaying) return false;

        const nextFrame = state.currentFrame + 1;
        if (nextFrame >= clip.duration) {
          if (state.isLooping) {
            set((s) => {
              s.currentFrame = 0;
            });
            return true;
          }
          set((s) => {
            s.isPlaying = false;
            s.currentFrame = clip.duration - 1;
          });
          return false;
        }

        set((s) => {
          s.currentFrame = nextFrame;
        });
        return true;
      },

      setActiveClip: (clipId) =>
        set((s) => {
          s.activeClipId = clipId;
          s.currentFrame = 0;
          s.isPlaying = false;
        }),

      setActiveScene: (sceneId) =>
        set((s) => {
          s.activeSceneId = sceneId;
          s.activeClipId = null;
          s.currentFrame = 0;
          s.isPlaying = false;
        }),

      setViewMode: (mode) =>
        set((s) => {
          s.viewMode = mode;
        }),

      setSelectedGraphTrack: (trackId) =>
        set((s) => {
          s.selectedGraphTrackId = trackId;
        }),
    }),
    { name: "TimelineStore", persistEnabled: false },
  ),
);
