import { findLayerById } from "@vivi2d/core/layer-utils";
import type {
  AnimationTrack,
  AudioTrack,
  BonePropertyType,
  BoneTrack,
  ImageSequenceTrack,
  LayerNode,
  LipSyncTrack,
  ParameterDefinition,
} from "@vivi2d/core/types";
import { memo, useCallback } from "react";
import { type I18nKey, useT } from "@/lib/i18n";
import {
  getLipSyncTrackSourceAudioTrack,
  isLipSyncTrackStale,
} from "@/lib/timeline-lipsync";
import { useClipStore } from "@/stores/clipStore";
import { useTimelineStore } from "@/stores/timelineStore";

export const TrackLabel = memo(function TrackLabel({
  track,
  clipId,
  parameters,
  isGraphMode,
  isSelected,
}: {
  track: AnimationTrack;
  clipId: string;
  parameters: ParameterDefinition[];
  isGraphMode: boolean;
  isSelected: boolean;
}) {
  const t = useT();
  const param = parameters.find((p) => p.id === track.parameterId);

  const handleRemove = useCallback(() => {
    useClipStore.getState().removeTrack(clipId, track.parameterId);
  }, [clipId, track.parameterId]);

  const handleSelect = useCallback(() => {
    if (!isGraphMode) return;
    const current = useTimelineStore.getState().selectedGraphTrackId;
    useTimelineStore
      .getState()
      .setSelectedGraphTrack(
        current === track.parameterId ? null : track.parameterId,
      );
  }, [isGraphMode, track.parameterId]);

  return (
    // biome-ignore lint/a11y: The timeline label row contains nested controls; click-to-select is mirrored by graph editor keyboard controls.
    <div
      className={`tl-track-label ${isGraphMode && isSelected ? "tl-track-label-selected" : ""}`}
      onClick={handleSelect}
    >
      <span className="tl-track-name">{param?.name ?? t("timeline.unknown")}</span>
      <button
        type="button"
        className="tl-track-remove-btn"
        onClick={handleRemove}
        title={t("timeline.deleteTrackTitle")}
      >
        x
      </button>
    </div>
  );
});

export const BONE_PROPERTY_LABEL_KEYS: Record<BonePropertyType, I18nKey> = {
  angle: "timeline.boneProperty.angle",
  scaleX: "timeline.boneProperty.scaleX",
  scaleY: "timeline.boneProperty.scaleY",
};

export const BONE_PROPERTY_LABELS: Record<BonePropertyType, string> = {
  angle: "Angle",
  scaleX: "Scale X",
  scaleY: "Scale Y",
};

export function getBonePropertyLabel(
  property: BonePropertyType,
  t: (key: I18nKey) => string,
): string {
  return t(BONE_PROPERTY_LABEL_KEYS[property]);
}

export const BoneTrackLabel = memo(function BoneTrackLabel({
  track,
  clipId,
  layers,
}: {
  track: BoneTrack;
  clipId: string;
  layers: LayerNode[];
}) {
  const t = useT();
  const bone = findLayerById(layers, track.boneId);
  const label = `${bone?.name ?? t("timeline.unknown")}:${getBonePropertyLabel(
    track.property,
    t,
  )}`;

  const handleRemove = useCallback(() => {
    useClipStore
      .getState()
      .removeBoneTrack(clipId, track.boneId, track.property);
  }, [clipId, track.boneId, track.property]);

  return (
    <div className="tl-track-label tl-track-label-bone">
      <span className="tl-track-name">{label}</span>
      <button
        type="button"
        className="tl-track-remove-btn"
        onClick={handleRemove}
        title={t("timeline.deleteTrackTitle")}
      >
        x
      </button>
    </div>
  );
});

export const ImageSequenceTrackLabel = memo(function ImageSequenceTrackLabel({
  track,
  clipId,
  layers,
}: {
  track: ImageSequenceTrack;
  clipId: string;
  layers: LayerNode[];
}) {
  const t = useT();
  const mesh = findLayerById(layers, track.targetMeshId);
  const label = `${t("timeline.imageSequenceTrackPrefix")}: ${
    mesh?.name ?? t("timeline.unknown")
  }`;

  const handleRemove = useCallback(() => {
    useClipStore
      .getState()
      .removeImageSequenceTrack(clipId, track.targetMeshId);
  }, [clipId, track.targetMeshId]);

  return (
    <div className="tl-track-label tl-track-label-imgseq">
      <span className="tl-track-name">{label}</span>
      <button
        type="button"
        className="tl-track-remove-btn"
        onClick={handleRemove}
        title={t("timeline.deleteTrackTitle")}
      >
        x
      </button>
    </div>
  );
});

export const AudioTrackLabel = memo(function AudioTrackLabel({
  track,
  clipId,
}: {
  track: AudioTrack;
  clipId: string;
}) {
  const t = useT();

  const handleRemove = useCallback(() => {
    useClipStore.getState().removeAudioTrack(clipId, track.id);
  }, [clipId, track.id]);

  const handleMutedChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      useClipStore.getState().updateAudioTrack(clipId, track.id, {
        muted: e.target.checked,
      });
    },
    [clipId, track.id],
  );

  const handleGainChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      useClipStore.getState().updateAudioTrack(clipId, track.id, {
        gain: Number(e.target.value),
      });
    },
    [clipId, track.id],
  );

  const handleStartFrameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      useClipStore.getState().updateAudioTrack(clipId, track.id, {
        startFrame: Number(e.target.value),
      });
    },
    [clipId, track.id],
  );

  return (
    <div className="tl-track-label tl-track-label-audio">
      <span className="tl-track-name">{track.name}</span>
      <label>
        {t("timeline.mute")}
        <input
          aria-label={`${t("timeline.mute")} ${track.name}`}
          type="checkbox"
          checked={track.muted}
          onChange={handleMutedChange}
        />
      </label>
      <label>
        {t("timeline.gain")}
        <input
          aria-label={`${t("timeline.gain")} ${track.name}`}
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={track.gain}
          onChange={handleGainChange}
        />
      </label>
      <label>
        {t("timeline.start")}
        <input
          aria-label={`${t("timeline.startFrame")} ${track.name}`}
          type="number"
          min={0}
          step={1}
          value={track.startFrame}
          onChange={handleStartFrameChange}
        />
      </label>
      <button
        type="button"
        className="tl-track-remove-btn"
        onClick={handleRemove}
        title={t("timeline.deleteTrackTitle")}
      >
        x
      </button>
    </div>
  );
});

export const LipSyncTrackLabel = memo(function LipSyncTrackLabel({
  track,
  clipId,
  clipAudioTracks,
  parameters,
}: {
  track: LipSyncTrack;
  clipId: string;
  clipAudioTracks: AudioTrack[];
  parameters: ParameterDefinition[];
}) {
  const t = useT();
  const sourceTrack = getLipSyncTrackSourceAudioTrack(
    { audioTracks: clipAudioTracks },
    track,
  );
  const isStale = isLipSyncTrackStale(track, sourceTrack);

  const handleRemove = useCallback(() => {
    useClipStore.getState().removeLipSyncTrack(clipId, track.id);
  }, [clipId, track.id]);

  const handleMutedChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      useClipStore.getState().updateLipSyncTrack(clipId, track.id, {
        muted: e.target.checked,
      });
    },
    [clipId, track.id],
  );

  const handleGainChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      useClipStore.getState().updateLipSyncTrack(clipId, track.id, {
        gain: Number(e.target.value),
      });
    },
    [clipId, track.id],
  );

  const handleTargetParameterChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      useClipStore.getState().updateLipSyncTrack(clipId, track.id, {
        targetParameterId: e.target.value || null,
      });
    },
    [clipId, track.id],
  );

  const statusLabel =
    sourceTrack == null
      ? t("timeline.lipSyncStatus.missingSource")
      : isStale
        ? t("timeline.lipSyncStatus.stale")
        : t("timeline.lipSyncStatus.ready");

  return (
    <div className="tl-track-label tl-track-label-lipsync">
      <span className="tl-track-name">{track.name}</span>
      <span className="tl-track-status">{statusLabel}</span>
      <label>
        {t("timeline.mute")}
        <input
          aria-label={`${t("timeline.mute")} ${track.name}`}
          type="checkbox"
          checked={track.muted}
          onChange={handleMutedChange}
        />
      </label>
      <label>
        {t("timeline.gain")}
        <input
          aria-label={`${t("timeline.gain")} ${track.name}`}
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={track.gain}
          onChange={handleGainChange}
        />
      </label>
      <label>
        {t("timeline.parameterShort")}
        <select
          aria-label={`${t("timeline.parameterTarget")} ${track.name}`}
          value={track.targetParameterId ?? ""}
          onChange={handleTargetParameterChange}
        >
          <option value="">{t("timeline.none")}</option>
          {parameters.map((parameter) => (
            <option key={parameter.id} value={parameter.id}>
              {parameter.name}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="tl-track-remove-btn"
        onClick={handleRemove}
        title={t("timeline.deleteTrackTitle")}
      >
        x
      </button>
    </div>
  );
});
