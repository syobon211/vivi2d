import { flattenLayers } from "@vivi2d/core/layer-utils";
import type {
  AnimationClip,
  BonePropertyType,
  ParameterDefinition,
} from "@vivi2d/core/types";
import { isViviMesh, isBone } from "@vivi2d/core/types";
import { useCallback, useMemo } from "react";
import { useT } from "@/lib/i18n";
import { loadAudioTrackMetadata } from "@/lib/timeline-audio";
import { bakeRmsLipSyncTrackFromAudioBuffer } from "@/lib/timeline-lipsync";
import { useClipStore } from "@/stores/clipStore";
import { useEditorStore } from "@/stores/editorStore";
import { useNotificationStore } from "@/stores/notificationStore";
import { useTimelineStore } from "@/stores/timelineStore";
import { getBonePropertyLabel } from "./TrackLabels";

export function AddTrackButton({
  clipId,
  clip,
  parameters,
}: {
  clipId: string;
  clip: AnimationClip;
  parameters: ParameterDefinition[];
}) {
  const t = useT();
  const project = useEditorStore((s) => s.project);

  const existingParamIds = useMemo(
    () => new Set(clip.tracks.map((t) => t.parameterId)),
    [clip.tracks],
  );

  const available = useMemo(
    () => parameters.filter((p) => !existingParamIds.has(p.id)),
    [parameters, existingParamIds],
  );

  const boneOptions = useMemo(() => {
    if (!project) return [];
    const existingBoneKeys = new Set(
      (clip.boneTracks ?? []).map((t) => `${t.boneId}:${t.property}`),
    );
    const bones = flattenLayers(project.layers).filter(isBone);
    const options: {
      key: string;
      boneId: string;
      property: BonePropertyType;
      label: string;
    }[] = [];
    const props: BonePropertyType[] = ["angle", "scaleX", "scaleY"];
    for (const bone of bones) {
      for (const prop of props) {
        const key = `${bone.id}:${prop}`;
        if (!existingBoneKeys.has(key)) {
          options.push({
            key,
            boneId: bone.id,
            property: prop,
            label: `${bone.name}:${getBonePropertyLabel(prop, t)}`,
          });
        }
      }
    }
    return options;
  }, [project, clip.boneTracks, t]);

  const imgSeqOptions = useMemo(() => {
    if (!project) return [];
    const existingMeshIds = new Set(
      (clip.imageSequenceTracks ?? []).map((t) => t.targetMeshId),
    );
    const meshes = flattenLayers(project.layers).filter(isViviMesh);
    return meshes
      .filter((m) => !existingMeshIds.has(m.id))
      .map((m) => ({ meshId: m.id, label: m.name }));
  }, [project, clip.imageSequenceTracks]);

  const lipSyncAudioOptions = useMemo(() => {
    if (!project) return [];
    const config = project.lipsyncConfig;
    if (config.targetParameterId == null) {
      return [];
    }
    const existingSourceIds = new Set(
      (clip.lipSyncTracks ?? []).map((track) => track.sourceAudioTrackId),
    );
    return (clip.audioTracks ?? [])
      .filter((track) => !existingSourceIds.has(track.id))
      .map((track) => ({
        trackId: track.id,
        label: `${t("timeline.bakeFromAudioTrackPrefix")} ${track.name}`,
      }));
  }, [project, clip.audioTracks, clip.lipSyncTracks, t]);

  const handleAdd = useCallback(
    async (e: React.ChangeEvent<HTMLSelectElement>) => {
      const val = e.target.value;
      if (!val) return;
      e.target.value = "";

      if (val === "audio:new") {
        const insertFrame = useTimelineStore.getState().currentFrame;
        const sourcePath = await window.electronAPI.openAudioFile();
        if (!sourcePath) return;
        const { name, durationSeconds } =
          await loadAudioTrackMetadata(sourcePath);
        useClipStore.getState().addAudioTrack(clipId, {
          id: crypto.randomUUID(),
          name,
          sourcePath,
          startFrame: insertFrame,
          sourceDurationSeconds: durationSeconds,
          gain: 1,
          muted: false,
        });
        if (durationSeconds === null) {
          useNotificationStore
            .getState()
            .addNotification(
              "warning",
              t("timeline.audioMetadataFailed"),
            );
        }
        return;
      }

      if (val.startsWith("lipsync:")) {
        if (!project) return;
        const sourceAudioTrackId = val.slice(8);
        const sourceTrack = (clip.audioTracks ?? []).find(
          (track) => track.id === sourceAudioTrackId,
        );
        if (!sourceTrack) {
          useNotificationStore
            .getState()
            .addNotification(
              "warning",
              t("timeline.sourceAudioTrackMissing"),
            );
          return;
        }
        const config = project.lipsyncConfig;
        if (config.targetParameterId == null) {
          useNotificationStore
            .getState()
            .addNotification("warning", t("timeline.lipSyncParameterMissing"));
          return;
        }
        try {
          const audioFile = await window.electronAPI.readAudioFile({
            audioPath: sourceTrack.sourcePath,
          });
          const baked = await bakeRmsLipSyncTrackFromAudioBuffer(
            audioFile.buffer,
            {
              sourceTrack,
              analysisFps: clip.fps,
              targetParameterId: config.targetParameterId,
              threshold: config.threshold,
              smoothing: config.smoothing,
              gain: config.gain,
            },
          );
          useClipStore.getState().addLipSyncTrack(clipId, baked.track);
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : t("timeline.lipSyncBakeFailed");
          useNotificationStore.getState().addNotification("warning", message);
        }
        return;
      }

      if (val.startsWith("imgseq:")) {
        const meshId = val.slice(7);
        useClipStore.getState().addImageSequenceTrack(clipId, meshId);
        return;
      }

      if (val.startsWith("bone:")) {
        const parts = val.slice(5);
        const lastColon = parts.lastIndexOf(":");
        const boneId = parts.slice(0, lastColon);
        const property = parts.slice(lastColon + 1) as BonePropertyType;
        useClipStore.getState().addBoneTrack(clipId, boneId, property);
        return;
      }

      useClipStore.getState().addTrack(clipId, val);
    },
    [clip, clipId, project, t],
  );

  return (
    <div className="tl-add-track">
      <select
        onChange={handleAdd}
        className="tl-add-track-select"
        defaultValue=""
      >
        <option value="" disabled>
          {t("timeline.addTrack")}
        </option>
        {available.length > 0 && (
          <optgroup label={t("timeline.trackGroup.parameters")}>
            {available.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </optgroup>
        )}
        {boneOptions.length > 0 && (
          <optgroup label={t("timeline.trackGroup.bones")}>
            {boneOptions.map((o) => (
              <option key={o.key} value={`bone:${o.key}`}>
                {o.label}
              </option>
            ))}
          </optgroup>
        )}
        {imgSeqOptions.length > 0 && (
          <optgroup label={t("timeline.trackGroup.imageSequences")}>
            {imgSeqOptions.map((o) => (
              <option key={o.meshId} value={`imgseq:${o.meshId}`}>
                {o.label}
              </option>
            ))}
          </optgroup>
        )}
        <optgroup label={t("timeline.trackGroup.audio")}>
          <option value="audio:new">{t("timeline.addAudioTrack")}</option>
        </optgroup>
        {lipSyncAudioOptions.length > 0 && (
          <optgroup label={t("timeline.trackGroup.lipSync")}>
            {lipSyncAudioOptions.map((option) => (
              <option key={option.trackId} value={`lipsync:${option.trackId}`}>
                {option.label}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </div>
  );
}
