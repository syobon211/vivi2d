import type { AnimationClip, BonePropertyType, ProjectData } from "@vivi2d/core/types";
import { useEffect, useId, useMemo, useState } from "react";
import { type I18nKey, useT } from "@/lib/i18n";
import {
  detectIdleSynthTargets,
  type IdleSynthInput,
  type IdleSynthSection,
  planIdleSynth,
} from "@vivi2d/editor-core/timeline-idle-synth";
import type {
  MotionPresetTargetOption,
  MotionPresetTrackRef,
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

function formatIdleSynthSection(t: (key: I18nKey) => string, section: IdleSynthSection) {
  return t(`timeline.idleSynthSection.${section}` as I18nKey);
}

function formatIdleSynthWarning(t: (key: I18nKey) => string, warning: string) {
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

  match = warning.match(/^(.*) is targeted more than once by idle synth\.$/);
  if (match) {
    return formatTemplate(t("timeline.idleSynthWarningDuplicateTarget"), {
      target: formatPossibleBoneTrackLabel(t, match[1] ?? ""),
    });
  }

  return warning;
}

export function IdleSynthDialog({
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
  const detection = useMemo(() => detectIdleSynthTargets(project), [project]);
  const [startFrame, setStartFrame] = useState(currentFrame);
  const [durationFrames, setDurationFrames] = useState(Math.max(clip.fps * 4, 60));
  const [seed, setSeed] = useState(1);
  const [blinkEnabled, setBlinkEnabled] = useState(
    detection.defaultBlinkTargetId !== null,
  );
  const [blinkTargetId, setBlinkTargetId] = useState(
    detection.defaultBlinkTargetId ?? "",
  );
  const [openValue, setOpenValue] = useState(0);
  const [closedValue, setClosedValue] = useState(1);
  const [minIntervalFrames, setMinIntervalFrames] = useState(Math.max(clip.fps * 2, 24));
  const [maxIntervalFrames, setMaxIntervalFrames] = useState(Math.max(clip.fps * 4, 60));
  const [closeDurationFrames, setCloseDurationFrames] = useState(2);
  const [holdDurationFrames, setHoldDurationFrames] = useState(1);
  const [openDurationFrames, setOpenDurationFrames] = useState(2);
  const [breathingEnabled, setBreathingEnabled] = useState(
    detection.defaultBreathingTargetId !== null,
  );
  const [breathingTargetId, setBreathingTargetId] = useState(
    detection.defaultBreathingTargetId ?? "",
  );
  const [centerValue, setCenterValue] = useState(0);
  const [minAmplitude, setMinAmplitude] = useState(0.08);
  const [maxAmplitude, setMaxAmplitude] = useState(0.18);
  const [minCycleLengthFrames, setMinCycleLengthFrames] = useState(
    Math.max(clip.fps * 2, 24),
  );
  const [maxCycleLengthFrames, setMaxCycleLengthFrames] = useState(
    Math.max(clip.fps * 4, 60),
  );

  useEffect(() => {
    if (
      detection.defaultBlinkTargetId &&
      !detection.blinkOptions.some((option) => option.id === blinkTargetId)
    ) {
      setBlinkTargetId(detection.defaultBlinkTargetId);
    }
    if (
      detection.defaultBreathingTargetId &&
      !detection.breathingOptions.some((option) => option.id === breathingTargetId)
    ) {
      setBreathingTargetId(detection.defaultBreathingTargetId);
    }
  }, [blinkTargetId, breathingTargetId, detection]);

  const blinkTarget =
    detection.blinkOptions.find((option) => option.id === blinkTargetId)?.target ?? null;
  const breathingTarget =
    detection.breathingOptions.find((option) => option.id === breathingTargetId)
      ?.target ?? null;

  const input = useMemo<IdleSynthInput>(
    () => ({
      startFrame,
      durationFrames,
      seed,
      blink: {
        enabled: blinkEnabled,
        target: blinkTarget,
        openValue,
        closedValue,
        minIntervalFrames,
        maxIntervalFrames,
        closeDurationFrames,
        holdDurationFrames,
        openDurationFrames,
      },
      breathing: {
        enabled: breathingEnabled,
        target: breathingTarget,
        centerValue,
        minAmplitude,
        maxAmplitude,
        minCycleLengthFrames,
        maxCycleLengthFrames,
      },
    }),
    [
      blinkEnabled,
      blinkTarget,
      breathingEnabled,
      breathingTarget,
      centerValue,
      closeDurationFrames,
      closedValue,
      durationFrames,
      holdDurationFrames,
      maxAmplitude,
      maxCycleLengthFrames,
      maxIntervalFrames,
      minAmplitude,
      minCycleLengthFrames,
      minIntervalFrames,
      openDurationFrames,
      openValue,
      seed,
      startFrame,
    ],
  );

  const plan = useMemo(() => planIdleSynth(project, clip, input), [clip, input, project]);

  const handleApply = () => {
    if (plan.writes.length === 0) return;
    useClipStore.getState().applyIdleSynthPlan(clip.id, plan, "idle-synth");
    onClose();
  };

  return (
    <DialogShell
      onClose={onClose}
      title={t("timeline.idleSynthDialogTitle")}
      minWidth={760}
      footer={
        <>
          <button
            type="button"
            className="prop-btn"
            onClick={handleApply}
            disabled={plan.writes.length === 0}
          >
            {t("timeline.idleSynthApply")}
          </button>
          <button type="button" className="prop-btn" onClick={onClose}>
            {t("common.close")}
          </button>
        </>
      }
    >
      <div className="media-export-body">
        <div className="media-export-field">
          <label className="media-export-label" htmlFor={`${fieldIdPrefix}-start-frame`}>
            {t("timeline.idleSynthStartFrameLabel")}
          </label>
          <input
            id={`${fieldIdPrefix}-start-frame`}
            aria-label={t("timeline.idleSynthStartFrameLabel")}
            className="media-export-select"
            type="number"
            min={0}
            step={1}
            value={startFrame}
            onChange={(event) => setStartFrame(toNumber(event.target.value, startFrame))}
          />
        </div>
        <div className="media-export-field">
          <label
            className="media-export-label"
            htmlFor={`${fieldIdPrefix}-duration-frames`}
          >
            {t("timeline.idleSynthDurationFramesLabel")}
          </label>
          <input
            id={`${fieldIdPrefix}-duration-frames`}
            aria-label={t("timeline.idleSynthDurationFramesLabel")}
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
          <label className="media-export-label" htmlFor={`${fieldIdPrefix}-seed`}>
            {t("timeline.idleSynthSeedLabel")}
          </label>
          <input
            id={`${fieldIdPrefix}-seed`}
            aria-label={t("timeline.idleSynthSeedLabel")}
            className="media-export-select"
            type="number"
            step={1}
            value={seed}
            onChange={(event) => setSeed(toNumber(event.target.value, seed))}
          />
        </div>

        <div className="media-export-info">
          <label>
            <input
              type="checkbox"
              checked={blinkEnabled}
              onChange={(event) => setBlinkEnabled(event.target.checked)}
            />{" "}
            {t("timeline.idleSynthBlinkEnabledLabel")}
          </label>
        </div>
        <div className="media-export-field">
          <label className="media-export-label" htmlFor={`${fieldIdPrefix}-blink-target`}>
            {t("timeline.idleSynthBlinkTargetLabel")}
          </label>
          <select
            id={`${fieldIdPrefix}-blink-target`}
            aria-label={t("timeline.idleSynthBlinkTargetLabel")}
            className="media-export-select"
            value={blinkTargetId}
            onChange={(event) => setBlinkTargetId(event.target.value)}
          >
            <option value="">{t("timeline.idleSynthTargetMissingOption")}</option>
            {detection.blinkOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {formatTargetOptionLabel(t, option)}
              </option>
            ))}
          </select>
        </div>
        <div className="media-export-field">
          <label className="media-export-label" htmlFor={`${fieldIdPrefix}-open-value`}>
            {t("timeline.idleSynthOpenValueLabel")}
          </label>
          <input
            id={`${fieldIdPrefix}-open-value`}
            aria-label={t("timeline.idleSynthOpenValueLabel")}
            className="media-export-select"
            type="number"
            step="0.01"
            value={openValue}
            onChange={(event) => setOpenValue(toNumber(event.target.value, openValue))}
          />
        </div>
        <div className="media-export-field">
          <label className="media-export-label" htmlFor={`${fieldIdPrefix}-closed-value`}>
            {t("timeline.idleSynthClosedValueLabel")}
          </label>
          <input
            id={`${fieldIdPrefix}-closed-value`}
            aria-label={t("timeline.idleSynthClosedValueLabel")}
            className="media-export-select"
            type="number"
            step="0.01"
            value={closedValue}
            onChange={(event) =>
              setClosedValue(toNumber(event.target.value, closedValue))
            }
          />
        </div>
        <div className="media-export-field">
          <label
            className="media-export-label"
            htmlFor={`${fieldIdPrefix}-blink-interval-min`}
          >
            {t("timeline.idleSynthBlinkIntervalMinLabel")}
          </label>
          <input
            id={`${fieldIdPrefix}-blink-interval-min`}
            aria-label={t("timeline.idleSynthBlinkIntervalMinLabel")}
            className="media-export-select"
            type="number"
            min={1}
            step={1}
            value={minIntervalFrames}
            onChange={(event) =>
              setMinIntervalFrames(toNumber(event.target.value, minIntervalFrames))
            }
          />
        </div>
        <div className="media-export-field">
          <label
            className="media-export-label"
            htmlFor={`${fieldIdPrefix}-blink-interval-max`}
          >
            {t("timeline.idleSynthBlinkIntervalMaxLabel")}
          </label>
          <input
            id={`${fieldIdPrefix}-blink-interval-max`}
            aria-label={t("timeline.idleSynthBlinkIntervalMaxLabel")}
            className="media-export-select"
            type="number"
            min={1}
            step={1}
            value={maxIntervalFrames}
            onChange={(event) =>
              setMaxIntervalFrames(toNumber(event.target.value, maxIntervalFrames))
            }
          />
        </div>
        <div className="media-export-field">
          <label
            className="media-export-label"
            htmlFor={`${fieldIdPrefix}-close-duration`}
          >
            {t("timeline.idleSynthCloseDurationLabel")}
          </label>
          <input
            id={`${fieldIdPrefix}-close-duration`}
            aria-label={t("timeline.idleSynthCloseDurationLabel")}
            className="media-export-select"
            type="number"
            min={1}
            step={1}
            value={closeDurationFrames}
            onChange={(event) =>
              setCloseDurationFrames(toNumber(event.target.value, closeDurationFrames))
            }
          />
        </div>
        <div className="media-export-field">
          <label
            className="media-export-label"
            htmlFor={`${fieldIdPrefix}-hold-duration`}
          >
            {t("timeline.idleSynthHoldDurationLabel")}
          </label>
          <input
            id={`${fieldIdPrefix}-hold-duration`}
            aria-label={t("timeline.idleSynthHoldDurationLabel")}
            className="media-export-select"
            type="number"
            min={0}
            step={1}
            value={holdDurationFrames}
            onChange={(event) =>
              setHoldDurationFrames(toNumber(event.target.value, holdDurationFrames))
            }
          />
        </div>
        <div className="media-export-field">
          <label
            className="media-export-label"
            htmlFor={`${fieldIdPrefix}-open-duration`}
          >
            {t("timeline.idleSynthOpenDurationLabel")}
          </label>
          <input
            id={`${fieldIdPrefix}-open-duration`}
            aria-label={t("timeline.idleSynthOpenDurationLabel")}
            className="media-export-select"
            type="number"
            min={1}
            step={1}
            value={openDurationFrames}
            onChange={(event) =>
              setOpenDurationFrames(toNumber(event.target.value, openDurationFrames))
            }
          />
        </div>

        <div className="media-export-info">
          <label>
            <input
              type="checkbox"
              checked={breathingEnabled}
              onChange={(event) => setBreathingEnabled(event.target.checked)}
            />{" "}
            {t("timeline.idleSynthBreathingEnabledLabel")}
          </label>
        </div>
        <div className="media-export-field">
          <label
            className="media-export-label"
            htmlFor={`${fieldIdPrefix}-breathing-target`}
          >
            {t("timeline.idleSynthBreathingTargetLabel")}
          </label>
          <select
            id={`${fieldIdPrefix}-breathing-target`}
            aria-label={t("timeline.idleSynthBreathingTargetLabel")}
            className="media-export-select"
            value={breathingTargetId}
            onChange={(event) => setBreathingTargetId(event.target.value)}
          >
            <option value="">{t("timeline.idleSynthTargetMissingOption")}</option>
            {detection.breathingOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {formatTargetOptionLabel(t, option)}
              </option>
            ))}
          </select>
        </div>
        <div className="media-export-field">
          <label className="media-export-label" htmlFor={`${fieldIdPrefix}-center-value`}>
            {t("timeline.idleSynthCenterValueLabel")}
          </label>
          <input
            id={`${fieldIdPrefix}-center-value`}
            aria-label={t("timeline.idleSynthCenterValueLabel")}
            className="media-export-select"
            type="number"
            step="0.01"
            value={centerValue}
            onChange={(event) =>
              setCenterValue(toNumber(event.target.value, centerValue))
            }
          />
        </div>
        <div className="media-export-field">
          <label
            className="media-export-label"
            htmlFor={`${fieldIdPrefix}-amplitude-min`}
          >
            {t("timeline.idleSynthAmplitudeMinLabel")}
          </label>
          <input
            id={`${fieldIdPrefix}-amplitude-min`}
            aria-label={t("timeline.idleSynthAmplitudeMinLabel")}
            className="media-export-select"
            type="number"
            step="0.01"
            value={minAmplitude}
            onChange={(event) =>
              setMinAmplitude(toNumber(event.target.value, minAmplitude))
            }
          />
        </div>
        <div className="media-export-field">
          <label
            className="media-export-label"
            htmlFor={`${fieldIdPrefix}-amplitude-max`}
          >
            {t("timeline.idleSynthAmplitudeMaxLabel")}
          </label>
          <input
            id={`${fieldIdPrefix}-amplitude-max`}
            aria-label={t("timeline.idleSynthAmplitudeMaxLabel")}
            className="media-export-select"
            type="number"
            step="0.01"
            value={maxAmplitude}
            onChange={(event) =>
              setMaxAmplitude(toNumber(event.target.value, maxAmplitude))
            }
          />
        </div>
        <div className="media-export-field">
          <label
            className="media-export-label"
            htmlFor={`${fieldIdPrefix}-cycle-length-min`}
          >
            {t("timeline.idleSynthCycleLengthMinLabel")}
          </label>
          <input
            id={`${fieldIdPrefix}-cycle-length-min`}
            aria-label={t("timeline.idleSynthCycleLengthMinLabel")}
            className="media-export-select"
            type="number"
            min={1}
            step={1}
            value={minCycleLengthFrames}
            onChange={(event) =>
              setMinCycleLengthFrames(toNumber(event.target.value, minCycleLengthFrames))
            }
          />
        </div>
        <div className="media-export-field">
          <label
            className="media-export-label"
            htmlFor={`${fieldIdPrefix}-cycle-length-max`}
          >
            {t("timeline.idleSynthCycleLengthMaxLabel")}
          </label>
          <input
            id={`${fieldIdPrefix}-cycle-length-max`}
            aria-label={t("timeline.idleSynthCycleLengthMaxLabel")}
            className="media-export-select"
            type="number"
            min={1}
            step={1}
            value={maxCycleLengthFrames}
            onChange={(event) =>
              setMaxCycleLengthFrames(toNumber(event.target.value, maxCycleLengthFrames))
            }
          />
        </div>

        {detection.warnings.length > 0 && (
          <div className="media-export-info">
            <div>{t("timeline.idleSynthDetectionWarnings")}:</div>
            <ul>
              {detection.warnings.map((warning) => (
                <li key={warning}>{formatIdleSynthWarning(t, warning)}</li>
              ))}
            </ul>
          </div>
        )}

        {plan.writes.length > 0 && (
          <div className="media-export-info">
            <div>{t("timeline.idleSynthAffectedTracks")}:</div>
            <ul>
              {plan.writes.map((write) => (
                <li key={`${write.section}:${write.track.label}`}>
                  {formatIdleSynthSection(t, write.section)}:{" "}
                  {formatTrackLabel(t, write.track)}
                </li>
              ))}
            </ul>
          </div>
        )}

        {plan.warnings.length > 0 && (
          <div className="media-export-info">
            <div>{t("timeline.idleSynthWarnings")}:</div>
            <ul>
              {plan.warnings.map((warning) => (
                <li key={warning}>{formatIdleSynthWarning(t, warning)}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </DialogShell>
  );
}
