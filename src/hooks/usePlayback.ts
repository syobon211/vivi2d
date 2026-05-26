import { evaluateImageSequenceTracksAtFrame } from "@vivi2d/core/image-sequence-utils";
import { findLayerById } from "@vivi2d/core/layer-utils";
import { mergeParameterDefaults } from "@vivi2d/core/parameter-utils";
import { findClipInProject } from "@vivi2d/core/scene-utils";
import {
  evaluateBoneTracksAtFrame,
  evaluateClipAtFrame,
} from "@vivi2d/core/timeline-utils";
import { isBone } from "@vivi2d/core/types";
import { useEffect, useRef } from "react";
import { stepAllPhysics } from "@/hooks/usePhysics";
import { getTexture, setTexture } from "@/lib/texture-store";
import { TimelineAudioPreviewController } from "@/lib/timeline-audio";
import { evaluateLipSyncTracksAtFrame } from "@/lib/timeline-lipsync";
import { useBoneStore } from "@/stores/boneStore";
import { useEditorStore } from "@/stores/editorStore";
import { useLipSyncStore } from "@/stores/lipsyncStore";
import { useNotificationStore } from "@/stores/notificationStore";
import { useParameterStore } from "@/stores/parameterStore";
import { useTimelineStore } from "@/stores/timelineStore";

export function usePlayback() {
  const rafId = useRef(0);
  const lastFrameTime = useRef(0);
  const lastPhysicsTime = useRef(0);
  const audioPreviewRef = useRef<TimelineAudioPreviewController | null>(null);

  const isPlaying = useTimelineStore((s) => s.isPlaying);

  useEffect(() => {
    if (!isPlaying) return;

    lastFrameTime.current = performance.now();
    lastPhysicsTime.current = performance.now();

    const tick = (now: number) => {
      const state = useTimelineStore.getState();
      if (!state.isPlaying || !state.activeClipId) return;

      const project = useEditorStore.getState().project;
      if (!project) return;
      const clip = findClipInProject(project, state.activeClipId!);
      if (!clip) return;

      const interval = 1000 / clip.fps;
      const elapsed = now - lastFrameTime.current;

      if (elapsed >= interval) {
        lastFrameTime.current = now - (elapsed % interval);
        const continued = state.advanceFrame();

        const frame = useTimelineStore.getState().currentFrame;
        const trackValues = evaluateClipAtFrame(clip, frame);
        const merged = mergeParameterDefaults(project.parameters, trackValues);

        if (clip.boneTracks && clip.boneTracks.length > 0) {
          const boneValues = evaluateBoneTracksAtFrame(clip.boneTracks, frame);
          const boneStore = useBoneStore.getState();
          for (const [boneId, props] of Object.entries(boneValues)) {
            if (props.angle !== undefined)
              boneStore.setBoneAngle(boneId, props.angle);
            if (props.scaleX !== undefined || props.scaleY !== undefined) {
              const node = findLayerById(project.layers, boneId);
              const curSX = node && isBone(node) ? node.bone.scaleX : 1;
              const curSY = node && isBone(node) ? node.bone.scaleY : 1;
              boneStore.setBoneScale(
                boneId,
                props.scaleX ?? curSX,
                props.scaleY ?? curSY,
              );
            }
          }
        }

        if (clip.imageSequenceTracks && clip.imageSequenceTracks.length > 0) {
          const imgSeqMap = evaluateImageSequenceTracksAtFrame(
            clip.imageSequenceTracks,
            frame,
          );
          for (const [targetMeshId, imageId] of Object.entries(imgSeqMap)) {
            if (imageId !== targetMeshId) {
              const srcCanvas = getTexture(imageId);
              if (srcCanvas) setTexture(targetMeshId, srcCanvas);
            }
          }
        }

        const physicsDt = (now - lastPhysicsTime.current) / 1000;
        lastPhysicsTime.current = now;
        useParameterStore.getState().setAllValues(merged);
        const physicsResult = stepAllPhysics(Math.min(physicsDt, 0.1));
        Object.assign(merged, physicsResult.parameters);

        if (Object.keys(physicsResult.bones).length > 0) {
          const boneStoreP2 = useBoneStore.getState();
          for (const [boneId, angle] of Object.entries(physicsResult.bones)) {
            boneStoreP2.setBoneAngle(boneId, angle);
          }
        }

        applyBakedLipSync(merged, clip, frame, project);
        applyLipSync(merged, project);

        useParameterStore.getState().setAllValues(merged);

        if (!continued) return;
      }

      rafId.current = requestAnimationFrame(tick);
    };

    rafId.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId.current);
    };
  }, [isPlaying]);

  useEffect(() => {
    const controller = new TimelineAudioPreviewController(
      undefined,
      (message) => {
        useNotificationStore.getState().addNotification("warning", message);
      },
    );
    audioPreviewRef.current = controller;

    const syncAudio = () => {
      const timeline = useTimelineStore.getState();
      const project = useEditorStore.getState().project;
      const clip =
        timeline.activeClipId && project
          ? findClipInProject(project, timeline.activeClipId)
          : null;
      controller.sync(clip, timeline.currentFrame, timeline.isPlaying);
    };

    const unsubscribeTimeline = useTimelineStore.subscribe(
      (state) =>
        [state.activeClipId, state.currentFrame, state.isPlaying] as const,
      () => {
        syncAudio();
      },
    );
    const unsubscribeProject = useEditorStore.subscribe(
      (state) => state.projectVersion,
      () => {
        controller.reset();
        syncAudio();
      },
    );

    syncAudio();

    return () => {
      unsubscribeTimeline();
      unsubscribeProject();
      controller.reset();
      audioPreviewRef.current = null;
    };
  }, []);
}

function applyBakedLipSync(
  merged: Record<string, number>,
  clip: import("@vivi2d/core/types").AnimationClip,
  frame: number,
  project: import("@vivi2d/core/types").ProjectData,
): void {
  for (const track of clip.lipSyncTracks ?? []) {
    if (track.targetParameterId) {
      const parameter = project.parameters.find(
        (item) => item.id === track.targetParameterId,
      );
      if (parameter) {
        merged[track.targetParameterId] = parameter.minValue;
      }
    }
  }

  const values = evaluateLipSyncTracksAtFrame(clip, frame);
  for (const [parameterId, normalized] of Object.entries(
    values.parameterValues,
  )) {
    const parameter = project.parameters.find(
      (item) => item.id === parameterId,
    );
    if (!parameter) continue;
    const range = parameter.maxValue - parameter.minValue;
    merged[parameterId] = parameter.minValue + normalized * range;
  }
}

function applyLipSync(
  merged: Record<string, number>,
  project: import("@vivi2d/core/types").ProjectData,
): void {
  const config = project.lipsyncConfig;
  if (!config.enabled) return;

  const lipSyncState = useLipSyncStore.getState();
  if (!lipSyncState.isConnected) return;

  if (config.targetParameterId) {
    const param = project.parameters.find(
      (p) => p.id === config.targetParameterId,
    );
    if (param) {
      const range = param.maxValue - param.minValue;
      merged[config.targetParameterId] =
        param.minValue + lipSyncState.currentVolume * range;
    }
  }
}
