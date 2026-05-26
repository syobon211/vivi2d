import type { AnimationClip, BonePropertyType, ProjectData } from "@vivi2d/core/types";
import { useEffect, useId, useMemo, useState } from "react";
import { type I18nKey, useT } from "@/lib/i18n";
import {
  listMotionPresetTargetOptions,
  type MotionPresetInput,
  type MotionPresetKind,
  type MotionPresetTargetOption,
  type MotionPresetTrackRef,
  planMotionPreset,
} from "@vivi2d/editor-core/timeline-motion-presets";
import { useClipStore } from "@/stores/clipStore";
import { DialogShell } from "../DialogShell";

function toNumber(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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

function formatTargetOptionLabel(
  t: (key: I18nKey) => string,
  option: MotionPresetTargetOption,
) {
  if (option.target.kind === "managedBlinkPairParameter") {
    return t("timeline.motionPresetTargetManagedBlinkPairParameters");
  }
  if (option.target.kind === "bone") {
    return formatBoneTrackLabel(t, option.label, option.target.property);
  }
  return option.label;
}

function formatTrackLabel(t: (key: I18nKey) => string, track: MotionPresetTrackRef) {
  if (track.type === "bone") {
    return formatBoneTrackLabel(t, track.label, track.property);
  }
  return track.label;
}

function formatPossibleBoneTrackLabel(t: (key: I18nKey) => string, label: string) {
  const boneMatch = label.match(/^(.*):(angle|scaleX|scaleY)$/);
  if (!boneMatch) return label;
  return formatBoneTrackLabel(t, label, boneMatch[2] as BonePropertyType);
}

function formatMotionPresetWarning(t: (key: I18nKey) => string, warning: string) {
  switch (warning) {
    case "Preset range was clamped to the clip end.":
      return t("timeline.motionPresetWarningRangeClamped");
    case "Preset range is too short for this motion preset.":
      return t("timeline.motionPresetWarningRangeTooShort");
    case "Selected motion preset target is unavailable.":
      return t("timeline.motionPresetWarningTargetUnavailable");
    case "Blink preset timing values must be positive.":
      return t("timeline.motionPresetWarningBlinkTimingInvalid");
    case "Cycle length must be positive.":
      return t("timeline.motionPresetWarningCycleLengthInvalid");
  }
  const existingKeyframes = warning.match(
    /^(.*) has existing keyframes in frames (\d+)-(\d+) and will be overwritten\.$/,
  );
  if (existingKeyframes) {
    return formatTemplate(t("timeline.motionPresetWarningExistingKeyframes"), {
      target: formatPossibleBoneTrackLabel(t, existingKeyframes[1] ?? ""),
      startFrame: existingKeyframes[2] ?? "",
      endFrame: existingKeyframes[3] ?? "",
    });
  }
  return warning;
}

export function MotionPresetDialog({
  project,
  clip,
  currentFrame,
  onClose,
}: {
  project: ProjectData;
  clip: AnimationClip;
  currentFrame: number;
  onClose: () => void;
}) {
  const t = useT();
  const fieldIdPrefix = useId();
  const [kind, setKind] = useState<MotionPresetKind>("blinkCycle");
  const [targetId, setTargetId] = useState("");
  const [startFrame, setStartFrame] = useState(currentFrame);
  const [durationFrames, setDurationFrames] = useState(Math.max(clip.fps * 2, 30));
  const [cycleLengthFrames, setCycleLengthFrames] = useState(Math.max(clip.fps, 24));
  const [amplitude, setAmplitude] = useState(0.15);
  const [centerValue, setCenterValue] = useState(0);
  const [closedValue, setClosedValue] = useState(1);
  const [openValue, setOpenValue] = useState(0);
  const [blinkIntervalFrames, setBlinkIntervalFrames] = useState(
    Math.max(clip.fps * 2, 24),
  );
  const [closeDurationFrames, setCloseDurationFrames] = useState(2);
  const [holdDurationFrames, setHoldDurationFrames] = useState(1);
  const [openDurationFrames, setOpenDurationFrames] = useState(2);

  const targetOptions = useMemo(
    () => listMotionPresetTargetOptions(project, kind),
    [project, kind],
  );

  useEffect(() => {
    if (targetOptions.length === 0) {
      setTargetId("");
      return;
    }
    if (!targetOptions.some((option) => option.id === targetId)) {
      setTargetId(targetOptions[0]!.id);
    }
  }, [targetId, targetOptions]);

  useEffect(() => {
    const selectedTarget = targetOptions.find((option) => option.id === targetId)?.target;
    if (kind === "blinkCycle") {
      setDurationFrames(Math.max(clip.fps * 2, 30));
      return;
    }
    if (
      selectedTarget?.kind === "bone" &&
      (selectedTarget.property === "scaleX" || selectedTarget.property === "scaleY")
    ) {
      setCenterValue(1);
      setAmplitude(0.05);
    } else if (kind === "idleSway") {
      setCenterValue(0);
      setAmplitude(15);
    } else {
      setCenterValue(0);
      setAmplitude(0.15);
    }
  }, [clip.fps, kind, targetId, targetOptions]);

  const input = useMemo<MotionPresetInput | null>(() => {
    const selectedTarget = targetOptions.find((option) => option.id === targetId)?.target;
    if (!selectedTarget) return null;
    if (kind === "blinkCycle") {
      return {
        kind,
        target: selectedTarget,
        startFrame,
        durationFrames,
        closedValue,
        openValue,
        blinkIntervalFrames,
        closeDurationFrames,
        holdDurationFrames,
        openDurationFrames,
      };
    }
    if (kind === "breathing") {
      return {
        kind,
        target: selectedTarget,
        startFrame,
        durationFrames,
        centerValue,
        amplitude,
        cycleLengthFrames,
      };
    }
    return {
      kind,
      target: selectedTarget,
      startFrame,
      durationFrames,
      centerValue,
      amplitude,
      cycleLengthFrames,
    };
  }, [
    amplitude,
    blinkIntervalFrames,
    centerValue,
    closeDurationFrames,
    closedValue,
    cycleLengthFrames,
    durationFrames,
    holdDurationFrames,
    kind,
    openDurationFrames,
    openValue,
    startFrame,
    targetId,
    targetOptions,
  ]);

  const plan = useMemo(
    () => (input ? planMotionPreset(project, clip, input) : null),
    [clip, input, project],
  );

  const handleApply = () => {
    if (!plan || plan.writes.length === 0) return;
    useClipStore.getState().applyMotionPreset(clip.id, plan, `motion-preset:${kind}`);
    onClose();
  };

  return (
    <DialogShell
      onClose={onClose}
      title={t("timeline.motionPresetDialogTitle")}
      minWidth={520}
      footer={
        <>
          <button
            type="button"
            className="prop-btn"
            onClick={handleApply}
            disabled={!plan || plan.writes.length === 0}
          >
            {t("timeline.motionPresetApply")}
          </button>
          <button type="button" className="prop-btn" onClick={onClose}>
            {t("common.close")}
          </button>
        </>
      }
    >
      <div className="media-export-body">
        <div className="media-export-field">
          <label className="media-export-label" htmlFor={`${fieldIdPrefix}-kind`}>
            {t("timeline.motionPresetKindLabel")}
          </label>
          <select
            id={`${fieldIdPrefix}-kind`}
            className="media-export-select"
            value={kind}
            onChange={(e) => setKind(e.target.value as MotionPresetKind)}
            aria-label={t("timeline.motionPresetKindLabel")}
          >
            <option value="blinkCycle">{t("timeline.motionPresetBlinkCycle")}</option>
            <option value="breathing">{t("timeline.motionPresetBreathing")}</option>
            <option value="idleSway">{t("timeline.motionPresetIdleSway")}</option>
          </select>
        </div>

        <div className="media-export-field">
          <label className="media-export-label" htmlFor={`${fieldIdPrefix}-target`}>
            {t("timeline.motionPresetTargetLabel")}
          </label>
          {targetOptions.length > 0 ? (
            <select
              id={`${fieldIdPrefix}-target`}
              className="media-export-select"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              aria-label={t("timeline.motionPresetTargetLabel")}
            >
              {targetOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {formatTargetOptionLabel(t, option)}
                </option>
              ))}
            </select>
          ) : (
            <div className="media-export-empty">
              {t("timeline.motionPresetNoTargets")}
            </div>
          )}
        </div>

        <div className="media-export-field">
          <label className="media-export-label" htmlFor={`${fieldIdPrefix}-start-frame`}>
            {t("timeline.motionPresetStartFrameLabel")}
          </label>
          <input
            id={`${fieldIdPrefix}-start-frame`}
            aria-label={t("timeline.motionPresetStartFrameLabel")}
            className="media-export-select"
            type="number"
            min={0}
            step={1}
            value={startFrame}
            onChange={(e) => setStartFrame(toNumber(e.target.value, startFrame))}
          />
        </div>

        <div className="media-export-field">
          <label
            className="media-export-label"
            htmlFor={`${fieldIdPrefix}-duration-frames`}
          >
            {t("timeline.motionPresetDurationFramesLabel")}
          </label>
          <input
            id={`${fieldIdPrefix}-duration-frames`}
            aria-label={t("timeline.motionPresetDurationFramesLabel")}
            className="media-export-select"
            type="number"
            min={1}
            step={1}
            value={durationFrames}
            onChange={(e) => setDurationFrames(toNumber(e.target.value, durationFrames))}
          />
        </div>

        {kind === "blinkCycle" ? (
          <>
            <div className="media-export-field">
              <label
                className="media-export-label"
                htmlFor={`${fieldIdPrefix}-open-value`}
              >
                {t("timeline.motionPresetOpenValueLabel")}
              </label>
              <input
                id={`${fieldIdPrefix}-open-value`}
                aria-label={t("timeline.motionPresetOpenValueLabel")}
                className="media-export-select"
                type="number"
                step="0.01"
                value={openValue}
                onChange={(e) => setOpenValue(toNumber(e.target.value, openValue))}
              />
            </div>
            <div className="media-export-field">
              <label
                className="media-export-label"
                htmlFor={`${fieldIdPrefix}-closed-value`}
              >
                {t("timeline.motionPresetClosedValueLabel")}
              </label>
              <input
                id={`${fieldIdPrefix}-closed-value`}
                aria-label={t("timeline.motionPresetClosedValueLabel")}
                className="media-export-select"
                type="number"
                step="0.01"
                value={closedValue}
                onChange={(e) => setClosedValue(toNumber(e.target.value, closedValue))}
              />
            </div>
            <div className="media-export-field">
              <label
                className="media-export-label"
                htmlFor={`${fieldIdPrefix}-blink-interval`}
              >
                {t("timeline.motionPresetBlinkIntervalLabel")}
              </label>
              <input
                id={`${fieldIdPrefix}-blink-interval`}
                aria-label={t("timeline.motionPresetBlinkIntervalLabel")}
                className="media-export-select"
                type="number"
                min={1}
                step={1}
                value={blinkIntervalFrames}
                onChange={(e) =>
                  setBlinkIntervalFrames(toNumber(e.target.value, blinkIntervalFrames))
                }
              />
            </div>
            <div className="media-export-field">
              <label
                className="media-export-label"
                htmlFor={`${fieldIdPrefix}-close-duration`}
              >
                {t("timeline.motionPresetCloseDurationLabel")}
              </label>
              <input
                id={`${fieldIdPrefix}-close-duration`}
                aria-label={t("timeline.motionPresetCloseDurationLabel")}
                className="media-export-select"
                type="number"
                min={1}
                step={1}
                value={closeDurationFrames}
                onChange={(e) =>
                  setCloseDurationFrames(toNumber(e.target.value, closeDurationFrames))
                }
              />
            </div>
            <div className="media-export-field">
              <label
                className="media-export-label"
                htmlFor={`${fieldIdPrefix}-hold-duration`}
              >
                {t("timeline.motionPresetHoldDurationLabel")}
              </label>
              <input
                id={`${fieldIdPrefix}-hold-duration`}
                aria-label={t("timeline.motionPresetHoldDurationLabel")}
                className="media-export-select"
                type="number"
                min={0}
                step={1}
                value={holdDurationFrames}
                onChange={(e) =>
                  setHoldDurationFrames(toNumber(e.target.value, holdDurationFrames))
                }
              />
            </div>
            <div className="media-export-field">
              <label
                className="media-export-label"
                htmlFor={`${fieldIdPrefix}-open-duration`}
              >
                {t("timeline.motionPresetOpenDurationLabel")}
              </label>
              <input
                id={`${fieldIdPrefix}-open-duration`}
                aria-label={t("timeline.motionPresetOpenDurationLabel")}
                className="media-export-select"
                type="number"
                min={1}
                step={1}
                value={openDurationFrames}
                onChange={(e) =>
                  setOpenDurationFrames(toNumber(e.target.value, openDurationFrames))
                }
              />
            </div>
          </>
        ) : (
          <>
            <div className="media-export-field">
              <label
                className="media-export-label"
                htmlFor={`${fieldIdPrefix}-center-value`}
              >
                {t("timeline.motionPresetCenterValueLabel")}
              </label>
              <input
                id={`${fieldIdPrefix}-center-value`}
                aria-label={t("timeline.motionPresetCenterValueLabel")}
                className="media-export-select"
                type="number"
                step="0.01"
                value={centerValue}
                onChange={(e) => setCenterValue(toNumber(e.target.value, centerValue))}
              />
            </div>
            <div className="media-export-field">
              <label
                className="media-export-label"
                htmlFor={`${fieldIdPrefix}-amplitude`}
              >
                {t("timeline.motionPresetAmplitudeLabel")}
              </label>
              <input
                id={`${fieldIdPrefix}-amplitude`}
                aria-label={t("timeline.motionPresetAmplitudeLabel")}
                className="media-export-select"
                type="number"
                step="0.01"
                value={amplitude}
                onChange={(e) => setAmplitude(toNumber(e.target.value, amplitude))}
              />
            </div>
            <div className="media-export-field">
              <label
                className="media-export-label"
                htmlFor={`${fieldIdPrefix}-cycle-length`}
              >
                {t("timeline.motionPresetCycleLengthLabel")}
              </label>
              <input
                id={`${fieldIdPrefix}-cycle-length`}
                aria-label={t("timeline.motionPresetCycleLengthLabel")}
                className="media-export-select"
                type="number"
                min={1}
                step={1}
                value={cycleLengthFrames}
                onChange={(e) =>
                  setCycleLengthFrames(toNumber(e.target.value, cycleLengthFrames))
                }
              />
            </div>
          </>
        )}

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

        {plan && plan.warnings.length > 0 && (
          <div className="media-export-info">
            <div>{t("timeline.motionPresetWarnings")}:</div>
            <ul>
              {plan.warnings.map((warning) => (
                <li key={warning}>{formatMotionPresetWarning(t, warning)}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </DialogShell>
  );
}
