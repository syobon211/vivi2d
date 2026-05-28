import type { AnimationClip } from "@vivi2d/core/types";
import { useCallback, useId, useMemo, useState } from "react";
import { getPixiAppRefs } from "@/hooks/usePixiApp";
import {
  exportMp4,
  exportPngSequence,
  type MediaExportProgress,
  type MediaFormat,
} from "@/lib/export/media-exporter";
import { type I18nKey, useT } from "@/lib/i18n";
import { useEditorStore } from "@/stores/editorStore";
import { useNotificationStore } from "@/stores/notificationStore";
import { DialogShell } from "./DialogShell";

const FORMAT_LABEL_KEYS: Record<MediaFormat, I18nKey> = {
  "png-sequence": "media.pngSequence",
  mp4: "media.video",
};

export function MediaExportDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const clipId = useId();
  const formatId = useId();
  const project = useEditorStore((s) => s.project);

  const allClips = useMemo<AnimationClip[]>(
    () => project?.scenes.flatMap((s) => s.clips) ?? [],
    [project],
  );

  const [selectedClipId, setSelectedClipId] = useState<string>(allClips[0]?.id ?? "");
  const [format, setFormat] = useState<MediaFormat>("png-sequence");
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<MediaExportProgress | null>(null);

  const selectedClip = allClips.find((c) => c.id === selectedClipId);

  const handleExport = useCallback(async () => {
    if (!project || !selectedClipId) return;

    const pixiRefs = getPixiAppRefs();
    if (!pixiRefs?.app) {
      useNotificationStore.getState().addNotification("error", t("media.pixiMissing"));
      return;
    }

    const dirPath = await window.electronAPI.selectExportDirectory();
    if (!dirPath) return;

    setExporting(true);
    setProgress({ current: 0, total: 1, phase: "rendering" });

    try {
      const app = pixiRefs.app;
      const appLike = {
        render: () => app.render(),
        canvas: app.canvas as HTMLCanvasElement,
      };

      if (format === "png-sequence") {
        const count = await exportPngSequence(
          appLike,
          project,
          selectedClipId,
          dirPath,
          setProgress,
        );
        useNotificationStore
          .getState()
          .addNotification("info", `PNG ${count}${t("media.pngExportedSuffix")}`);
      } else {
        await exportMp4(appLike, project, selectedClipId, dirPath, setProgress);
        useNotificationStore.getState().addNotification("info", t("media.videoExported"));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("media.unknownError");
      useNotificationStore
        .getState()
        .addNotification("error", `${t("media.exportFailedPrefix")} ${msg}`);
    } finally {
      setExporting(false);
      setProgress(null);
    }
  }, [project, selectedClipId, format, t]);

  if (!project) return null;

  const progressPercent =
    progress && progress.total > 0
      ? Math.round((progress.current / progress.total) * 100)
      : 0;

  const phaseLabel =
    progress?.phase === "rendering"
      ? t("media.rendering")
      : progress?.phase === "encoding"
        ? t("media.encoding")
        : t("media.saving");

  return (
    <DialogShell
      onClose={onClose}
      title={t("media.title")}
      minWidth={420}
      footer={
        <>
          <button
            type="button"
            className="prop-btn"
            onClick={handleExport}
            disabled={exporting || !selectedClipId || allClips.length === 0}
          >
            {exporting ? t("common.exporting") : t("common.export")}
          </button>
          <button
            type="button"
            className="prop-btn"
            onClick={onClose}
            disabled={exporting}
          >
            {t("common.close")}
          </button>
        </>
      }
    >
      <div className="media-export-body">
        <div className="media-export-field">
          <label className="media-export-label" htmlFor={clipId}>
            {t("media.clip")}
          </label>
          {allClips.length > 0 ? (
            <select
              id={clipId}
              className="media-export-select"
              value={selectedClipId}
              onChange={(e) => setSelectedClipId(e.target.value)}
              disabled={exporting}
            >
              {allClips.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.duration}
                  {t("media.framesShort")} / {c.fps}
                  {t("media.fps")})
                </option>
              ))}
            </select>
          ) : (
            <span className="media-export-empty">{t("media.noClips")}</span>
          )}
        </div>

        <div className="media-export-field">
          <label className="media-export-label" htmlFor={formatId}>
            {t("media.format")}
          </label>
          <select
            id={formatId}
            className="media-export-select"
            value={format}
            onChange={(e) => setFormat(e.target.value as MediaFormat)}
            disabled={exporting}
          >
            {(Object.keys(FORMAT_LABEL_KEYS) as MediaFormat[]).map((f) => (
              <option key={f} value={f}>
                {t(FORMAT_LABEL_KEYS[f])}
              </option>
            ))}
          </select>
        </div>

        {selectedClip && (
          <div className="media-export-info">
            <div>
              {t("media.duration")}:{" "}
              {(selectedClip.duration / selectedClip.fps).toFixed(2)}
              {t("media.seconds")}
            </div>
            <div>
              {t("media.frameCount")}: {selectedClip.duration} / {t("media.fps")}:{" "}
              {selectedClip.fps}
            </div>
            {format === "png-sequence" && (
              <div>
                {t("media.output")}: {selectedClip.duration}
                {t("media.pngFileCountSuffix")}
              </div>
            )}
            {format === "mp4" && (
              <div>
                {t("media.output")}: {t("media.webmVideoFile")}
              </div>
            )}
          </div>
        )}

        {exporting && progress && (
          <div className="media-export-progress">
            <div className="media-export-progress-label">
              {phaseLabel}... {progressPercent}% ({progress.current}/{progress.total})
            </div>
            <div className="media-export-progress-bar">
              <div
                className="media-export-progress-fill"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </DialogShell>
  );
}
