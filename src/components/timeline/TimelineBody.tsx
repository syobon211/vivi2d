import type { LayerNode, ParameterDefinition } from "@vivi2d/core/types";
import { useMemo } from "react";
import { useT } from "@/lib/i18n";
import { useEditorStore } from "@/stores/editorStore";
import { useTimelineStore } from "@/stores/timelineStore";
import { AddTrackButton } from "./AddTrackButton";
import { AudioTrackRow } from "./AudioTrackRow";
import { BoneTrackRow } from "./BoneTrackRow";
import { GraphEditor } from "./GraphEditor";
import { ImageSequenceTrackRow } from "./ImageSequenceTrackRow";
import { LipSyncTrackRow } from "./LipSyncTrackRow";
import { Playhead } from "./Playhead";
import { TimelineRuler } from "./TimelineRuler";
import {
  AudioTrackLabel,
  BoneTrackLabel,
  ImageSequenceTrackLabel,
  LipSyncTrackLabel,
  TrackLabel,
} from "./TrackLabels";
import { TrackRow } from "./TrackRow";

const EMPTY_PARAMS: ParameterDefinition[] = [];
const EMPTY_LAYERS: LayerNode[] = [];

export function TimelineBody() {
  const t = useT();
  const project = useEditorStore((s) => s.project);
  const activeClipId = useTimelineStore((s) => s.activeClipId);
  const activeSceneId = useTimelineStore((s) => s.activeSceneId);
  const currentFrame = useTimelineStore((s) => s.currentFrame);
  const viewMode = useTimelineStore((s) => s.viewMode);
  const selectedGraphTrackId = useTimelineStore((s) => s.selectedGraphTrackId);

  const clip = useMemo(() => {
    const sceneClips =
      project?.scenes.find((s) => s.id === activeSceneId)?.clips ??
      project?.clips;
    return sceneClips?.find((c) => c.id === activeClipId);
  }, [project, activeClipId, activeSceneId]);

  if (!clip) {
    return <div className="timeline-empty">{t("timeline.noClip")}</div>;
  }

  const boneTracks = clip.boneTracks ?? [];
  const imageSequenceTracks = clip.imageSequenceTracks ?? [];
  const audioTracks = clip.audioTracks ?? [];
  const lipSyncTracks = clip.lipSyncTracks ?? [];

  return (
    <div className="timeline-body">
      <div className="timeline-sidebar">
        <div className="timeline-sidebar-header">{t("timeline.tracks")}</div>
        {clip.tracks.map((track) => (
          <TrackLabel
            key={track.parameterId}
            track={track}
            clipId={clip.id}
            parameters={project?.parameters ?? EMPTY_PARAMS}
            isGraphMode={viewMode === "graphEditor"}
            isSelected={track.parameterId === selectedGraphTrackId}
          />
        ))}
        {boneTracks.map((track) => (
          <BoneTrackLabel
            key={`${track.boneId}:${track.property}`}
            track={track}
            clipId={clip.id}
            layers={project?.layers ?? EMPTY_LAYERS}
          />
        ))}
        {imageSequenceTracks.map((track) => (
          <ImageSequenceTrackLabel
            key={`imgseq:${track.targetMeshId}`}
            track={track}
            clipId={clip.id}
            layers={project?.layers ?? EMPTY_LAYERS}
          />
        ))}
        {audioTracks.map((track) => (
          <AudioTrackLabel
            key={`audio:${track.id}`}
            track={track}
            clipId={clip.id}
          />
        ))}
        {lipSyncTracks.map((track) => (
          <LipSyncTrackLabel
            key={`lipsync:${track.id}`}
            track={track}
            clipId={clip.id}
            clipAudioTracks={audioTracks}
            parameters={project?.parameters ?? EMPTY_PARAMS}
          />
        ))}
        <AddTrackButton
          clipId={clip.id}
          clip={clip}
          parameters={project?.parameters ?? EMPTY_PARAMS}
        />
      </div>
      <div className="timeline-tracks-area scrollbar-thin">
        {viewMode === "dopeSheet" ? (
          <>
            <TimelineRuler duration={clip.duration} fps={clip.fps} />
            <div className="timeline-tracks-scroll">
              {clip.tracks.map((track) => (
                <TrackRow
                  key={track.parameterId}
                  track={track}
                  clipId={clip.id}
                  duration={clip.duration}
                />
              ))}
              {boneTracks.map((track) => (
                <BoneTrackRow
                  key={`${track.boneId}:${track.property}`}
                  track={track}
                  clipId={clip.id}
                  duration={clip.duration}
                />
              ))}
              {imageSequenceTracks.map((track) => (
                <ImageSequenceTrackRow
                  key={`imgseq:${track.targetMeshId}`}
                  track={track}
                  clipId={clip.id}
                  duration={clip.duration}
                />
              ))}
              {audioTracks.map((track) => (
                <AudioTrackRow
                  key={`audio:${track.id}`}
                  track={track}
                  clipId={clip.id}
                  duration={clip.duration}
                  fps={clip.fps}
                />
              ))}
              {lipSyncTracks.map((track) => (
                <LipSyncTrackRow
                  key={`lipsync:${track.id}`}
                  track={track}
                  sourceTrack={
                    audioTracks.find(
                      (audioTrack) =>
                        audioTrack.id === track.sourceAudioTrackId,
                    ) ?? null
                  }
                  clipId={clip.id}
                  duration={clip.duration}
                  fps={clip.fps}
                />
              ))}
            </div>
            <Playhead
              frame={currentFrame}
              duration={clip.duration}
              clipId={clip.id}
            />
          </>
        ) : (
          <GraphEditor clip={clip} />
        )}
      </div>
    </div>
  );
}
