import type { AnimationClip, BonePropertyType, ProjectData } from "@vivi2d/core/types";
import { useEffect, useId, useMemo, useState } from "react";
import { type I18nKey, useT } from "@/lib/i18n";
import {
  type AnimationRetargetInput,
  type AnimationRetargetTrackRef,
  planAnimationRetarget,
} from "@/lib/timeline-animation-retarget";
import { useClipStore } from "@/stores/clipStore";
import { DialogShell } from "../DialogShell";

function toNumber(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function listProjectClips(project: ProjectData): AnimationClip[] {
  return [...project.clips, ...project.scenes.flatMap((scene) => scene.clips)];
}

function formatTemplate(template: string, params: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    String(params[key] ?? ""),
  );
}

function bonePropertyKey(property: BonePropertyType): I18nKey {
  return `timeline.boneProperty.${property}` as I18nKey;
}

function formatBoneTrackLabel(
  t: (key: I18nKey) => string,
  label: string,
  property: BonePropertyType,
) {
  const rawSuffix = `:${property}`;
  const owner = label.endsWith(rawSuffix)
    ? label.slice(0, -rawSuffix.length)
    : label;
  return `${owner}:${t(bonePropertyKey(property))}`;
}

function formatTrackLabel(
  t: (key: I18nKey) => string,
  track: AnimationRetargetTrackRef,
) {
  if (track.type === "bone") {
    return formatBoneTrackLabel(t, track.label, track.property);
  }
  return track.label;
}

function formatSkippedSourceTrackLabel(t: (key: I18nKey) => string, label: string) {
  const parameterMatch = label.match(/^Parameter:(.+)$/);
  if (parameterMatch) {
    return formatTemplate(t("timeline.retargetSkippedParameterTrack"), {
      id: parameterMatch[1] ?? "",
    });
  }
  const boneMatch = label.match(/^Bone:(.+):(angle|scaleX|scaleY)$/);
  if (boneMatch) {
    return formatTemplate(t("timeline.retargetSkippedBoneTrack"), {
      id: boneMatch[1] ?? "",
      property: t(bonePropertyKey(boneMatch[2] as BonePropertyType)),
    });
  }
  return label;
}

function formatRetargetWarning(t: (key: I18nKey) => string, warning: string) {
  switch (warning) {
    case "Source or target clip has no valid frames to retarget.":
      return t("timeline.retargetWarningNoValidFrames");
    case "Retarget range was clamped to fit the source/target clips.":
      return t("timeline.retargetWarningRangeClamped");
    case "Retarget range is empty.":
      return t("timeline.retargetWarningRangeEmpty");
    case "Select at least one track category to retarget.":
      return t("timeline.retargetWarningSelectTrackCategory");
  }
  const staleTracks = warning.match(/^Skipped (\d+) stale source track\(s\)\.$/);
  if (staleTracks) {
    return formatTemplate(t("timeline.retargetWarningSkippedStaleTracks"), {
      count: staleTracks[1] ?? "",
    });
  }
  return warning;
}

export function AnimationRetargetDialog({
  project,
  targetClip,
  currentFrame,
  onClose,
}: {
  project: ProjectData;
  targetClip: AnimationClip;
  currentFrame: number;
  onClose: () => void;
}) {
  const t = useT();
  const fieldIdPrefix = useId();
  const sourceClips = useMemo(
    () => listProjectClips(project).filter((clip) => clip.id !== targetClip.id),
    [project, targetClip.id],
  );
  const [sourceClipId, setSourceClipId] = useState(sourceClips[0]?.id ?? "");
  const [sourceStartFrame, setSourceStartFrame] = useState(0);
  const [durationFrames, setDurationFrames] = useState(Math.max(targetClip.fps * 2, 30));
  const [targetStartFrame, setTargetStartFrame] = useState(currentFrame);
  const [includeParameters, setIncludeParameters] = useState(true);
  const [includeBones, setIncludeBones] = useState(true);

  useEffect(() => {
    if (sourceClips.length === 0) {
      setSourceClipId("");
      return;
    }
    if (!sourceClips.some((clip) => clip.id === sourceClipId)) {
      setSourceClipId(sourceClips[0]!.id);
    }
  }, [sourceClipId, sourceClips]);

  const sourceClip = sourceClips.find((clip) => clip.id === sourceClipId) ?? null;

  const input = useMemo<AnimationRetargetInput | null>(() => {
    if (!sourceClip) return null;
    return {
      sourceStartFrame,
      durationFrames,
      targetStartFrame,
      includeParameters,
      includeBones,
    };
  }, [
    durationFrames,
    includeBones,
    includeParameters,
    sourceClip,
    sourceStartFrame,
    targetStartFrame,
  ]);

  const plan = useMemo(
    () =>
      sourceClip && input
        ? planAnimationRetarget(project, sourceClip, targetClip, input)
        : null,
    [input, project, sourceClip, targetClip],
  );

  const handleApply = () => {
    if (!plan || plan.writes.length === 0) return;
    useClipStore
      .getState()
      .applyAnimationRetargetPlan(
        targetClip.id,
        plan,
        `retarget:${sourceClipId}:${targetClip.id}`,
      );
    onClose();
  };

  return (
    <DialogShell
      onClose={onClose}
      title={t("timeline.retargetDialogTitle")}
      minWidth={520}
      footer={
        <>
          <button
            type="button"
            className="prop-btn"
            onClick={handleApply}
            disabled={!plan || plan.writes.length === 0}
          >
            {t("timeline.retargetApply")}
          </button>
          <button type="button" className="prop-btn" onClick={onClose}>
            {t("common.close")}
          </button>
        </>
      }
    >
      <div className="media-export-body">
        <div className="media-export-field">
          <label className="media-export-label" htmlFor={`${fieldIdPrefix}-source-clip`}>
            {t("timeline.retargetSourceClipLabel")}
          </label>
          {sourceClips.length > 0 ? (
            <select
              id={`${fieldIdPrefix}-source-clip`}
              aria-label={t("timeline.retargetSourceClipLabel")}
              className="media-export-select"
              value={sourceClipId}
              onChange={(event) => setSourceClipId(event.target.value)}
            >
              {sourceClips.map((clip) => (
                <option key={clip.id} value={clip.id}>
                  {clip.name}
                </option>
              ))}
            </select>
          ) : (
            <div className="media-export-empty">
              {t("timeline.retargetNoOtherClips")}
            </div>
          )}
        </div>

        <div className="media-export-field">
          <label
            className="media-export-label"
            htmlFor={`${fieldIdPrefix}-source-start-frame`}
          >
            {t("timeline.retargetSourceStartFrameLabel")}
          </label>
          <input
            id={`${fieldIdPrefix}-source-start-frame`}
            aria-label={t("timeline.retargetSourceStartFrameLabel")}
            className="media-export-select"
            type="number"
            min={0}
            step={1}
            value={sourceStartFrame}
            onChange={(event) =>
              setSourceStartFrame(toNumber(event.target.value, sourceStartFrame))
            }
          />
        </div>

        <div className="media-export-field">
          <label
            className="media-export-label"
            htmlFor={`${fieldIdPrefix}-duration-frames`}
          >
            {t("timeline.retargetDurationFramesLabel")}
          </label>
          <input
            id={`${fieldIdPrefix}-duration-frames`}
            aria-label={t("timeline.retargetDurationFramesLabel")}
            className="media-export-select"
            type="number"
            min={1}
            step={1}
            value={durationFrames}
            onChange={(event) =>
              setDurationFrames(toNumber(event.target.value, durationFrames))
            }
          />
        </div>

        <div className="media-export-field">
          <label
            className="media-export-label"
            htmlFor={`${fieldIdPrefix}-target-start-frame`}
          >
            {t("timeline.retargetTargetStartFrameLabel")}
          </label>
          <input
            id={`${fieldIdPrefix}-target-start-frame`}
            aria-label={t("timeline.retargetTargetStartFrameLabel")}
            className="media-export-select"
            type="number"
            min={0}
            step={1}
            value={targetStartFrame}
            onChange={(event) =>
              setTargetStartFrame(toNumber(event.target.value, targetStartFrame))
            }
          />
        </div>

        <div className="media-export-info retarget-toggle-row">
          <label className="prop-checkbox-label retarget-toggle-label">
            <input
              type="checkbox"
              checked={includeParameters}
              onChange={(event) => setIncludeParameters(event.target.checked)}
            />
            {t("timeline.retargetIncludeParametersLabel")}
          </label>
          <label className="prop-checkbox-label retarget-toggle-label">
            <input
              type="checkbox"
              checked={includeBones}
              onChange={(event) => setIncludeBones(event.target.checked)}
            />
            {t("timeline.retargetIncludeBonesLabel")}
          </label>
        </div>

        {plan && plan.writes.length > 0 && (
          <div className="media-export-info">
            <div>
              {t("timeline.motionPresetAffectedTracks")}:{" "}
              {plan.writes
                .map((write) => formatTrackLabel(t, write.track))
                .join(", ")}
            </div>
          </div>
        )}

        {plan && plan.skippedSourceTrackLabels.length > 0 && (
          <div className="media-export-info">
            <div>{t("timeline.retargetSkippedTracks")}:</div>
            <ul>
              {plan.skippedSourceTrackLabels.map((label) => (
                <li key={label}>{formatSkippedSourceTrackLabel(t, label)}</li>
              ))}
            </ul>
          </div>
        )}

        {plan && plan.warnings.length > 0 && (
          <div className="media-export-info">
            <div>{t("timeline.motionPresetWarnings")}:</div>
            <ul>
              {plan.warnings.map((warning) => (
                <li key={warning}>{formatRetargetWarning(t, warning)}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </DialogShell>
  );
}
