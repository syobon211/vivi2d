import type { AnimationClip, ProjectData } from "@vivi2d/core/types";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { type I18nKey, useT } from "@/lib/i18n";
import {
  createMotionAssistAutoMappings,
  type MotionAssistBundle,
  type MotionAssistChannelMapping,
  type MotionAssistMatchSource,
  parseMotionAssistBundle,
  planMotionAssistImport,
} from "@/lib/timeline-motion-assist";
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

function formatMotionAssistMatchSource(
  t: (key: I18nKey) => string,
  source: MotionAssistMatchSource,
) {
  return t(`timeline.motionAssistMatchSource.${source}` as I18nKey);
}

function formatMotionAssistMessage(t: (key: I18nKey) => string, message: string) {
  switch (message) {
    case "Motion Assist bundle is not valid JSON.":
      return t("timeline.motionAssistErrorInvalidJson");
    case "Motion Assist bundle must be a JSON object.":
      return t("timeline.motionAssistErrorRootObject");
    case "Motion Assist bundle schemaVersion must be 1.0.0.":
      return t("timeline.motionAssistErrorSchemaVersion");
    case "Motion Assist bundle fps must be a positive number.":
      return t("timeline.motionAssistErrorFps");
    case "Motion Assist bundle durationFrames must be a positive number.":
      return t("timeline.motionAssistErrorDurationFrames");
    case "Motion Assist bundle channels must be an array.":
      return t("timeline.motionAssistErrorChannelsArray");
    case "Target clip has no valid frames.":
      return t("timeline.motionAssistWarningTargetClipNoValidFrames");
  }

  let match = message.match(/^Channel "(.+)" samples must be an array\.$/);
  if (match) {
    return formatTemplate(t("timeline.motionAssistErrorChannelSamplesArray"), {
      channel: match[1] ?? "",
    });
  }

  match = message.match(/^Channel "(.+)" contains an invalid sample entry\.$/);
  if (match) {
    return formatTemplate(t("timeline.motionAssistErrorChannelInvalidSample"), {
      channel: match[1] ?? "",
    });
  }

  match = message.match(/^Channel "(.+)" contains a non-finite sample\.$/);
  if (match) {
    return formatTemplate(t("timeline.motionAssistErrorChannelNonFiniteSample"), {
      channel: match[1] ?? "",
    });
  }

  match = message.match(
    /^Channel "(.+)" sample frame (\d+) is outside the bundle duration\.$/,
  );
  if (match) {
    return formatTemplate(t("timeline.motionAssistErrorChannelFrameOutOfRange"), {
      channel: match[1] ?? "",
      frame: match[2] ?? "",
    });
  }

  match = message.match(/^Channel (\d+) is not a valid object\.$/);
  if (match) {
    return formatTemplate(t("timeline.motionAssistErrorChannelObject"), {
      index: match[1] ?? "",
    });
  }

  match = message.match(/^Channel (\d+) is missing a valid id\.$/);
  if (match) {
    return formatTemplate(t("timeline.motionAssistErrorChannelId"), {
      index: match[1] ?? "",
    });
  }

  match = message.match(/^Channel "(.+)" is missing a valid name\.$/);
  if (match) {
    return formatTemplate(t("timeline.motionAssistErrorChannelName"), {
      id: match[1] ?? "",
    });
  }

  match = message.match(
    /^(.+) has destination keys in frames (\d+)-(\d+) and will be overwritten\.$/,
  );
  if (match) {
    return formatTemplate(t("timeline.motionAssistWarningExistingDestinationKeys"), {
      target: match[1] ?? "",
      startFrame: match[2] ?? "",
      endFrame: match[3] ?? "",
    });
  }

  match = message.match(
    /^Skipped (\d+) channel\(s\) with conflicting parameter mappings\.$/,
  );
  if (match) {
    return formatTemplate(t("timeline.motionAssistWarningSkippedConflictingChannels"), {
      count: match[1] ?? "",
    });
  }

  match = message.match(/^Skipped (\d+) unmapped channel\(s\)\.$/);
  if (match) {
    return formatTemplate(t("timeline.motionAssistWarningSkippedUnmappedChannels"), {
      count: match[1] ?? "",
    });
  }

  match = message.match(
    /^Skipped (\d+) channel\(s\) with no projected destination samples\.$/,
  );
  if (match) {
    return formatTemplate(t("timeline.motionAssistWarningSkippedEmptyChannels"), {
      count: match[1] ?? "",
    });
  }

  return message;
}

export function MotionAssistDialog({
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [bundle, setBundle] = useState<MotionAssistBundle | null>(null);
  const [fileName, setFileName] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [targetStartFrame, setTargetStartFrame] = useState(currentFrame);
  const [mappings, setMappings] = useState<MotionAssistChannelMapping[]>([]);

  useEffect(() => {
    if (!bundle) {
      setMappings([]);
      return;
    }
    setMappings(createMotionAssistAutoMappings(project, bundle));
  }, [bundle, project]);

  const parameterOptions = useMemo(
    () =>
      project.parameters.map((parameter) => ({ id: parameter.id, name: parameter.name })),
    [project.parameters],
  );

  const plan = useMemo(
    () =>
      bundle
        ? planMotionAssistImport(project, clip, bundle, {
            targetStartFrame,
            mappings,
          })
        : null,
    [bundle, clip, mappings, project, targetStartFrame],
  );

  const handleOpenPicker = () => {
    fileInputRef.current?.click();
  };

  const handleLoadFile = async (file: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      const nextBundle = parseMotionAssistBundle(text);
      setBundle(nextBundle);
      setFileName(file.name);
      setLoadError(null);
    } catch (error) {
      setBundle(null);
      setFileName(file.name);
      setLoadError(
        error instanceof Error
          ? formatMotionAssistMessage(t, error.message)
          : t("timeline.motionAssistLoadFailed"),
      );
    }
  };

  const updateMapping = (
    channelId: string,
    updater: (mapping: MotionAssistChannelMapping) => MotionAssistChannelMapping,
  ) => {
    setMappings((current) =>
      current.map((mapping) =>
        mapping.channelId === channelId ? updater(mapping) : mapping,
      ),
    );
  };

  const handleApply = () => {
    if (!plan || plan.writes.length === 0) return;
    useClipStore
      .getState()
      .applyMotionAssistImportPlan(clip.id, plan, `motion-assist:${clip.id}`);
    onClose();
  };

  return (
    <DialogShell
      onClose={onClose}
      title={t("timeline.motionAssistDialogTitle")}
      minWidth={760}
      footer={
        <>
          <button
            type="button"
            className="prop-btn"
            onClick={handleApply}
            disabled={!plan || plan.writes.length === 0}
          >
            {t("timeline.motionAssistApply")}
          </button>
          <button type="button" className="prop-btn" onClick={onClose}>
            {t("common.close")}
          </button>
        </>
      }
    >
      <div className="media-export-body">
        <div className="media-export-field">
          <label className="media-export-label" htmlFor={`${fieldIdPrefix}-file-input`}>
            {t("timeline.motionAssistFileLabel")}
          </label>
          <div className="media-export-row">
            <button type="button" className="prop-btn" onClick={handleOpenPicker}>
              {t("timeline.motionAssistChooseFile")}
            </button>
            <span>{fileName || t("timeline.motionAssistNoFile")}</span>
          </div>
          <input
            id={`${fieldIdPrefix}-file-input`}
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            aria-label={t("timeline.motionAssistFileInputLabel")}
            style={{ display: "none" }}
            onChange={(event) => {
              void handleLoadFile(event.target.files?.[0] ?? null);
              event.currentTarget.value = "";
            }}
          />
        </div>

        <div className="media-export-field">
          <label
            className="media-export-label"
            htmlFor={`${fieldIdPrefix}-target-start-frame`}
          >
            {t("timeline.motionAssistStartFrameLabel")}
          </label>
          <input
            id={`${fieldIdPrefix}-target-start-frame`}
            aria-label={t("timeline.motionAssistStartFrameLabel")}
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

        {loadError && <div className="media-export-error">{loadError}</div>}

        {!bundle && !loadError && (
          <div className="media-export-empty">
            {t("timeline.motionAssistAwaitingFile")}
          </div>
        )}

        {bundle && (
          <>
            <div className="media-export-info">
              <div>
                {t("timeline.motionAssistBundleInfo")}: {bundle.fps}{" "}
                {t("timeline.motionAssistFpsUnit")}, {bundle.durationFrames}{" "}
                {t("timeline.motionAssistFramesUnit")}, {bundle.channels.length}{" "}
                {t("timeline.motionAssistChannelsUnit")}
              </div>
            </div>

            <div className="media-export-info">
              <div>{t("timeline.motionAssistMappingsLabel")}:</div>
              <div className="media-export-table">
                {mappings.map((mapping) => (
                  <div
                    key={mapping.channelId}
                    className="media-export-row"
                    style={{ alignItems: "center", gap: 8, marginTop: 6 }}
                  >
                    <label>
                      <input
                        type="checkbox"
                        checked={mapping.enabled}
                        onChange={(event) =>
                          updateMapping(mapping.channelId, (current) => ({
                            ...current,
                            enabled: event.target.checked,
                          }))
                        }
                      />{" "}
                      {mapping.channelLabel}
                    </label>
                    <select
                      aria-label={`${mapping.channelLabel} ${t("timeline.motionAssistParameterLabel")}`}
                      className="media-export-select"
                      value={mapping.parameterId ?? ""}
                      onChange={(event) =>
                        updateMapping(mapping.channelId, (current) => ({
                          ...current,
                          parameterId: event.target.value || null,
                          matchSource:
                            event.target.value &&
                            event.target.value !== current.parameterId
                              ? "manual"
                              : current.matchSource,
                        }))
                      }
                    >
                      <option value="">{t("timeline.motionAssistUnmappedOption")}</option>
                      {parameterOptions.map((parameter) => (
                        <option key={parameter.id} value={parameter.id}>
                          {parameter.name}
                        </option>
                      ))}
                    </select>
                    <input
                      aria-label={`${mapping.channelLabel} ${t("timeline.motionAssistScaleLabel")}`}
                      className="media-export-select"
                      type="number"
                      step="0.01"
                      value={mapping.scale}
                      onChange={(event) =>
                        updateMapping(mapping.channelId, (current) => ({
                          ...current,
                          scale: toNumber(event.target.value, current.scale),
                          matchSource:
                            current.matchSource === "manual"
                              ? current.matchSource
                              : "manual",
                        }))
                      }
                    />
                    <input
                      aria-label={`${mapping.channelLabel} ${t("timeline.motionAssistOffsetLabel")}`}
                      className="media-export-select"
                      type="number"
                      step="0.01"
                      value={mapping.offset}
                      onChange={(event) =>
                        updateMapping(mapping.channelId, (current) => ({
                          ...current,
                          offset: toNumber(event.target.value, current.offset),
                          matchSource:
                            current.matchSource === "manual"
                              ? current.matchSource
                              : "manual",
                        }))
                      }
                    />
                    <span>{formatMotionAssistMatchSource(t, mapping.matchSource)}</span>
                  </div>
                ))}
              </div>
            </div>

            {plan && plan.writes.length > 0 && (
              <div className="media-export-info">
                <div>{t("timeline.motionAssistAffectedTracks")}:</div>
                <ul>
                  {plan.writes.map((write) => (
                    <li
                      key={`${write.parameterId}:${write.rangeStart}:${write.rangeEnd}`}
                    >
                      {write.label} ({write.rangeStart}-{write.rangeEnd}) ←{" "}
                      {write.sourceChannelLabel}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {plan && plan.unmappedChannelLabels.length > 0 && (
              <div className="media-export-info">
                <div>{t("timeline.motionAssistUnmappedChannels")}:</div>
                <ul>
                  {plan.unmappedChannelLabels.map((label) => (
                    <li key={label}>{label}</li>
                  ))}
                </ul>
              </div>
            )}

            {plan && plan.conflictingChannelLabels.length > 0 && (
              <div className="media-export-info">
                <div>{t("timeline.motionAssistConflictingChannels")}:</div>
                <ul>
                  {plan.conflictingChannelLabels.map((label) => (
                    <li key={label}>{label}</li>
                  ))}
                </ul>
              </div>
            )}

            {plan && plan.emptyChannelLabels.length > 0 && (
              <div className="media-export-info">
                <div>{t("timeline.motionAssistEmptyChannels")}:</div>
                <ul>
                  {plan.emptyChannelLabels.map((label) => (
                    <li key={label}>{label}</li>
                  ))}
                </ul>
              </div>
            )}

            {plan && plan.warnings.length > 0 && (
              <div className="media-export-info">
                <div>{t("timeline.motionAssistWarnings")}:</div>
                <ul>
                  {plan.warnings.map((warning) => (
                    <li key={warning}>{formatMotionAssistMessage(t, warning)}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </DialogShell>
  );
}
