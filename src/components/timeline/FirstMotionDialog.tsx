import type {
  AnimationClip,
  BonePropertyType,
  ProjectData,
} from "@vivi2d/core/types";
import { useEffect, useId, useMemo, useState } from "react";
import { type I18nKey, useT } from "@/lib/i18n";
import {
  createFirstMotionDefaults,
  createFirstMotionPlan,
  type FirstMotionDialogState,
} from "@vivi2d/editor-core/first-motion-command";
import type { MotionPresetTargetOption } from "@vivi2d/editor-core/timeline-motion-presets";
import { applyFirstMotion } from "@/stores/firstMotion";
import { DialogShell } from "../DialogShell";

function toNumber(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatTemplate(
  template: string,
  params: Record<string, string | number>,
) {
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

function formatPossibleBoneTrackLabel(
  t: (key: I18nKey) => string,
  label: string,
) {
  const boneMatch = label.match(/^(.*):(angle|scaleX|scaleY)$/);
  if (!boneMatch) return label;
  return formatBoneTrackLabel(t, label, boneMatch[2] as BonePropertyType);
}

function formatTimelineWarning(t: (key: I18nKey) => string, warning: string) {
  switch (warning) {
    case "Multiple managed blink parameter pairs were found.":
      return t("timeline.idleSynthWarningMultipleManagedBlinkPairs");
    case 'Multiple parameter targets named "Blink" were found.':
      return t("timeline.idleSynthWarningMultipleBlinkNameTargets");
    case 'Multiple breathing targets with id "param-breath" were found.':
      return t("timeline.idleSynthWarningMultipleBreathIdTargets");
    case 'Multiple breathing targets named "Breath" were found.':
      return t("timeline.idleSynthWarningMultipleBreathNameTargets");
    case 'Multiple breathing targets containing "breath" were found.':
      return t("timeline.idleSynthWarningMultipleBreathSubstringTargets");
    case "Idle synth range is too short.":
      return t("timeline.idleSynthWarningRangeTooShort");
    case "Enable blink or breathing before applying idle synth.":
      return t("timeline.firstMotionWarningEnableBlinkOrBreathing");
    case "Idle sway target is missing.":
      return t("timeline.firstMotionWarningIdleSwayTargetMissing");
    case "Blink synth target is missing.":
      return t("timeline.idleSynthWarningBlinkTargetMissing");
    case "Blink synth timing values are invalid.":
      return t("timeline.idleSynthWarningBlinkTimingInvalid");
    case "Blink synth target is unavailable.":
      return t("timeline.idleSynthWarningBlinkTargetUnavailable");
    case "Breathing synth target is missing.":
      return t("timeline.idleSynthWarningBreathingTargetMissing");
    case "Breathing synth timing or amplitude values are invalid.":
      return t("timeline.idleSynthWarningBreathingValuesInvalid");
    case "Breathing synth target is unavailable.":
      return t("timeline.idleSynthWarningBreathingTargetUnavailable");
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

  let match = warning.match(
    /^(.*) has existing keyframes in frames (\d+)-(\d+) and will be overwritten\.$/,
  );
  if (match) {
    return formatTemplate(t("timeline.motionPresetWarningExistingKeyframes"), {
      target: formatPossibleBoneTrackLabel(t, match[1] ?? ""),
      startFrame: match[2] ?? "",
      endFrame: match[3] ?? "",
    });
  }

  match = warning.match(
    /^Idle sway conflicts with existing generated tracks: (.+)\.$/,
  );
  if (match) {
    return formatTemplate(t("timeline.firstMotionWarningSwayConflicts"), {
      targets: (match[1] ?? "")
        .split(", ")
        .map((label) => formatPossibleBoneTrackLabel(t, label))
        .join(", "),
    });
  }

  return warning;
}

export function FirstMotionDialog({
  project,
  activeClip,
  onClose,
}: {
  project: ProjectData;
  activeClip: AnimationClip | null;
  onClose: () => void;
}) {
  const t = useT();
  const fieldIdPrefix = useId();
  const defaults = useMemo(
    () => createFirstMotionDefaults(project, activeClip),
    [project, activeClip],
  );
  const [state, setState] = useState<FirstMotionDialogState>(defaults.state);

  useEffect(() => {
    setState(defaults.state);
  }, [defaults.state]);

  const plan = useMemo(
    () => createFirstMotionPlan(project, activeClip, state),
    [project, activeClip, state],
  );

  const handleApply = () => {
    if (!plan.hasApplicableWrites) return;
    applyFirstMotion({
      activeClipId: activeClip?.id ?? null,
      state,
    });
    onClose();
  };

  return (
    <DialogShell
      onClose={onClose}
      title={t("timeline.firstMotionDialogTitle")}
      minWidth={640}
      footer={
        <>
          <button
            type="button"
            className="prop-btn"
            onClick={handleApply}
            disabled={!plan.hasApplicableWrites}
          >
            {t("timeline.firstMotionApply")}
          </button>
          <button type="button" className="prop-btn" onClick={onClose}>
            {t("common.close")}
          </button>
        </>
      }
    >
      <div className="media-export-body">
        <div className="media-export-field">
          <div className="media-export-label">
            {t("timeline.firstMotionClipModeLabel")}
          </div>
          <div className="media-export-info first-motion-clip-mode-row">
            <label className="first-motion-clip-mode-option">
              <input
                type="radio"
                name="first-motion-clip-mode"
                checked={state.clipMode === "active"}
                onChange={() =>
                  setState((current) => ({ ...current, clipMode: "active" }))
                }
                disabled={!activeClip}
              />
              {t("timeline.firstMotionUseActiveClip")}
            </label>
            <label className="first-motion-clip-mode-option">
              <input
                type="radio"
                name="first-motion-clip-mode"
                checked={state.clipMode === "new"}
                onChange={() =>
                  setState((current) => ({ ...current, clipMode: "new" }))
                }
              />
              {t("timeline.firstMotionCreateNewClip")}
            </label>
          </div>
        </div>

        {state.clipMode === "new" ? (
          <>
            <div className="media-export-field">
              <label
                className="media-export-label"
                htmlFor={`${fieldIdPrefix}-clip-name`}
              >
                {t("timeline.firstMotionClipNameLabel")}
              </label>
              <input
                id={`${fieldIdPrefix}-clip-name`}
                aria-label={t("timeline.firstMotionClipNameLabel")}
                className="media-export-select"
                value={state.clipName}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    clipName: event.target.value,
                  }))
                }
              />
            </div>
            <div className="media-export-field">
              <label
                className="media-export-label"
                htmlFor={`${fieldIdPrefix}-duration`}
              >
                {t("timeline.firstMotionDurationLabel")}
              </label>
              <input
                id={`${fieldIdPrefix}-duration`}
                aria-label={t("timeline.firstMotionDurationLabel")}
                className="media-export-select"
                type="number"
                min={1}
                step={1}
                value={state.durationFrames}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    durationFrames: toNumber(
                      event.target.value,
                      current.durationFrames,
                    ),
                  }))
                }
              />
            </div>
            <div className="media-export-field">
              <label
                className="media-export-label"
                htmlFor={`${fieldIdPrefix}-fps`}
              >
                {t("timeline.firstMotionFpsLabel")}
              </label>
              <input
                id={`${fieldIdPrefix}-fps`}
                aria-label={t("timeline.firstMotionFpsLabel")}
                className="media-export-select"
                type="number"
                min={1}
                step={1}
                value={state.fps}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    fps: toNumber(event.target.value, current.fps),
                  }))
                }
              />
            </div>
          </>
        ) : (
          <div className="media-export-info">
            <div>
              {formatTemplate(t("timeline.firstMotionUsingClipSummary"), {
                name: activeClip?.name ?? t("timeline.clipNone"),
                duration: activeClip?.duration ?? 0,
                fps: activeClip?.fps ?? 0,
              })}
            </div>
          </div>
        )}

        <div className="media-export-field">
          <label
            className="media-export-label"
            htmlFor={`${fieldIdPrefix}-seed`}
          >
            {t("timeline.firstMotionSeedLabel")}
          </label>
          <input
            id={`${fieldIdPrefix}-seed`}
            aria-label={t("timeline.firstMotionSeedLabel")}
            className="media-export-select"
            type="number"
            step={1}
            value={state.seed}
            onChange={(event) =>
              setState((current) => ({
                ...current,
                seed: toNumber(event.target.value, current.seed),
              }))
            }
          />
        </div>

        <div className="media-export-info">
          <label>
            <input
              type="checkbox"
              checked={state.blinkEnabled}
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  blinkEnabled: event.target.checked,
                }))
              }
            />{" "}
            {t("timeline.firstMotionBlinkEnabledLabel")}
          </label>
        </div>
        <div className="media-export-field">
          <label
            className="media-export-label"
            htmlFor={`${fieldIdPrefix}-blink-target`}
          >
            {t("timeline.firstMotionBlinkTargetLabel")}
          </label>
          <select
            id={`${fieldIdPrefix}-blink-target`}
            aria-label={t("timeline.firstMotionBlinkTargetLabel")}
            className="media-export-select"
            value={state.blinkTargetId}
            onChange={(event) =>
              setState((current) => ({
                ...current,
                blinkTargetId: event.target.value,
              }))
            }
          >
            <option value="">
              {t("timeline.idleSynthTargetMissingOption")}
            </option>
            {defaults.detection.blinkOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {formatTargetOptionLabel(t, option)}
              </option>
            ))}
          </select>
        </div>

        <div className="media-export-info">
          <label>
            <input
              type="checkbox"
              checked={state.breathingEnabled}
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  breathingEnabled: event.target.checked,
                }))
              }
            />{" "}
            {t("timeline.firstMotionBreathingEnabledLabel")}
          </label>
        </div>
        <div className="media-export-field">
          <label
            className="media-export-label"
            htmlFor={`${fieldIdPrefix}-breathing-target`}
          >
            {t("timeline.firstMotionBreathingTargetLabel")}
          </label>
          <select
            id={`${fieldIdPrefix}-breathing-target`}
            aria-label={t("timeline.firstMotionBreathingTargetLabel")}
            className="media-export-select"
            value={state.breathingTargetId}
            onChange={(event) =>
              setState((current) => ({
                ...current,
                breathingTargetId: event.target.value,
              }))
            }
          >
            <option value="">
              {t("timeline.idleSynthTargetMissingOption")}
            </option>
            {defaults.detection.breathingOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {formatTargetOptionLabel(t, option)}
              </option>
            ))}
          </select>
        </div>

        <div className="media-export-info">
          <label>
            <input
              type="checkbox"
              checked={state.swayEnabled}
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  swayEnabled: event.target.checked,
                }))
              }
            />{" "}
            {t("timeline.firstMotionSwayEnabledLabel")}
          </label>
        </div>
        <div className="media-export-field">
          <label
            className="media-export-label"
            htmlFor={`${fieldIdPrefix}-sway-target`}
          >
            {t("timeline.firstMotionSwayTargetLabel")}
          </label>
          <select
            id={`${fieldIdPrefix}-sway-target`}
            aria-label={t("timeline.firstMotionSwayTargetLabel")}
            className="media-export-select"
            value={state.swayTargetId}
            onChange={(event) =>
              setState((current) => ({
                ...current,
                swayTargetId: event.target.value,
              }))
            }
          >
            <option value="">
              {t("timeline.idleSynthTargetMissingOption")}
            </option>
            {defaults.swayOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {formatTargetOptionLabel(t, option)}
              </option>
            ))}
          </select>
        </div>

        {plan.affectedTrackLabels.length > 0 && (
          <div className="media-export-info">
            <div>{t("timeline.firstMotionAffectedTracks")}:</div>
            <ul>
              {plan.affectedTrackLabels.map((label) => (
                <li key={label}>{formatPossibleBoneTrackLabel(t, label)}</li>
              ))}
            </ul>
          </div>
        )}

        {plan.warnings.length > 0 && (
          <div className="media-export-info">
            <div>{t("timeline.firstMotionWarnings")}:</div>
            <ul>
              {plan.warnings.map((warning) => (
                <li key={warning}>{formatTimelineWarning(t, warning)}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </DialogShell>
  );
}
