import { useRef } from "react";
import { TRACKING_COUNTS } from "../constants";
import type { createT, Locale } from "../i18n";
import type { RecordingState } from "../recorder";
import { badgeBaseStyle, smallBtnStyle } from "../styles";
import type {
  ViewerSheetSection,
  ViewerWorkflowModel,
} from "./viewer-workflow";
import { getIssueBadgeLabel, getStreamSafeDisplayName } from "./viewer-workflow";

interface ContextToolbarProps {
  t: ReturnType<typeof createT>;
  locale: Locale;
  loaded: boolean;
  modelName: string;
  mappedCount: number;
  platformFaceMappedCount: number;
  handMappedCount: number;
  poseMappedCount: number;
  tracking: boolean;
  handTracking: boolean;
  lipSync: boolean;
  poseTracking: boolean;
  error: string | null;
  panelOpen: boolean;
  recordingState: RecordingState;
  recordingElapsed: number;
  workflow: ViewerWorkflowModel;
  onFileLoad: (file: File) => void;
  onTogglePanel: () => void;
  onPrimaryAction: () => void;
  onToggleRecording: () => void;
  onToggleHud: () => void;
}

type ViewerTKey = Parameters<ReturnType<typeof createT>>[0];

const SECTION_KEYS: Record<ViewerSheetSection, ViewerTKey> = {
  session: "session",
  connect: "connect",
  overlays: "overlays",
  calibration: "calibration",
  inputEffects: "inputEffects",
};

const WORKFLOW_COPY_KEYS: Record<
  ViewerWorkflowModel["step"],
  { label: ViewerTKey; hint: ViewerTKey }
> = {
  openModel: { label: "openModel", hint: "workflowOpenModelHint" },
  loading: { label: "workflowLoadingLabel", hint: "workflowLoadingHint" },
  connect: { label: "workflowConnectLabel", hint: "workflowConnectHint" },
  calibrate: { label: "workflowCalibrateLabel", hint: "workflowCalibrateHint" },
  prepare: { label: "workflowPrepareLabel", hint: "workflowPrepareHint" },
  recording: { label: "workflowRecordingLabel", hint: "workflowRecordingHint" },
  error: { label: "workflowErrorLabel", hint: "workflowErrorHint" },
};

export function ContextToolbar(props: ContextToolbarProps) {
  const {
    t,
    loaded,
    modelName,
    mappedCount,
    platformFaceMappedCount,
    handMappedCount,
    poseMappedCount,
    tracking,
    handTracking,
    lipSync,
    poseTracking,
    error,
    panelOpen,
    recordingState,
    recordingElapsed,
    workflow,
    onFileLoad,
    onTogglePanel,
    onPrimaryAction,
    onToggleRecording,
    onToggleHud,
  } = props;
  const issueBadge = getIssueBadgeLabel(workflow.issueCount);
  const displayName = loaded ? getStreamSafeDisplayName(modelName) : t("noModel");
  const workflowDisplay = WORKFLOW_COPY_KEYS[workflow.step];
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <header
      data-testid="main-toolbar"
      className="context-toolbar-root"
      aria-label={t("viewerContextToolbar")}
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(220px, 1fr) auto minmax(220px, 1fr)",
        gap: "12px",
        padding: "10px 12px",
        backgroundColor: "var(--bg-elevated)",
        borderBottom: "1px solid var(--border)",
        alignItems: "center",
        flexShrink: 0,
      }}
    >
      <div
        data-testid="context-toolbar"
        style={{
          minWidth: 0,
          display: "flex",
          alignItems: "center",
          gap: "10px",
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".vivi"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onFileLoad(file);
          }}
          style={{ display: "none" }}
        />
        {loaded && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            style={{
              ...smallBtnStyle(),
              minHeight: "30px",
              whiteSpace: "nowrap",
            }}
          >
            {t("changeModel")}
          </button>
        )}
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontSize: "var(--text-base)",
              fontWeight: 700,
            }}
            title={displayName}
          >
            {displayName}
          </div>
          <div
            style={{
              display: "flex",
              gap: "4px",
              marginTop: "3px",
              flexWrap: "wrap",
            }}
            aria-label={t("mappingSummary")}
          >
            <MappingBadge label={t("badgeFace")} count={mappedCount} />
            <MappingBadge
              label={t("badgePlatformFace")}
              count={platformFaceMappedCount}
              total={TRACKING_COUNTS.PLATFORM_FACE}
            />
            <MappingBadge label={t("badgeHand")} count={handMappedCount} />
            <MappingBadge label={t("badgeBody")} count={poseMappedCount} />
          </div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          justifyContent: "center",
        }}
      >
        <span data-testid="workflow-cta">
          {workflow.step === "openModel" ? (
            <button
              type="button"
              data-testid="workflow-primary-action"
              onClick={() => fileInputRef.current?.click()}
              style={{
                ...smallBtnStyle(true),
                minWidth: "132px",
                minHeight: "34px",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                backgroundColor: "var(--accent)",
                color: "white",
                fontWeight: 700,
              }}
            >
              {t(workflowDisplay.label)}
            </button>
          ) : (
            <button
              type="button"
              data-testid="workflow-primary-action"
              onClick={onPrimaryAction}
              disabled={workflow.step === "loading"}
              style={{
                ...smallBtnStyle(workflow.severity !== "normal"),
                minWidth: "132px",
                minHeight: "34px",
                border:
                  workflow.severity === "danger"
                    ? "1px solid var(--danger-strong)"
                    : "1px solid var(--border-strong)",
                backgroundColor:
                  workflow.severity === "danger"
                    ? "var(--danger)"
                    : workflow.severity === "attention"
                      ? "var(--accent-warm)"
                      : "var(--accent)",
                color:
                  workflow.severity === "attention"
                    ? "var(--button-active-text)"
                    : "white",
                fontWeight: 700,
              }}
              aria-describedby="viewer-workflow-hint"
            >
              {t(workflowDisplay.label)}
              {issueBadge && (
                <span
                  aria-label={`${issueBadge} issues`}
                  style={{
                    marginLeft: "8px",
                    padding: "1px 6px",
                    borderRadius: "999px",
                    backgroundColor: "rgba(0,0,0,0.24)",
                  }}
                >
                  {issueBadge}
                </span>
              )}
            </button>
          )}
        </span>
        {recordingState !== "idle" && (
          <button
            type="button"
            data-testid="viewer-recording-stop"
            onClick={() => {
              if (recordingState !== "processing") onToggleRecording();
            }}
            aria-disabled={recordingState === "processing" ? "true" : undefined}
            aria-label={
              recordingState === "processing"
                ? "Stopping recording"
                : "Stop recording"
            }
            style={{
              ...smallBtnStyle(recordingState === "recording"),
              border: "1px solid var(--danger-strong)",
              color: "var(--text-primary)",
              cursor:
                recordingState === "processing" ? "not-allowed" : "pointer",
              opacity: recordingState === "processing" ? 0.72 : 1,
            }}
          >
            {recordingState === "processing"
              ? t("recProcessing")
              : `${t("recStop")} ${Math.floor(recordingElapsed)}s`}
          </button>
        )}
      </div>

      <div
        style={{
          minWidth: 0,
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: "6px",
          flexWrap: "wrap",
        }}
      >
        <StatusPill label={t("faceTrackingStart")} active={tracking} />
        <StatusPill label={t("handTrackingStart")} active={handTracking} />
        <StatusPill label={t("lipSyncStart")} active={lipSync} />
        <StatusPill label={t("poseStart")} active={poseTracking} />
        <button
          type="button"
          aria-label={t("statsToggle")}
          onClick={onToggleHud}
          style={smallBtnStyle()}
        >
          {t("stats")}
        </button>
        <button
          type="button"
          data-testid="settings-toggle"
          aria-expanded={panelOpen}
          title={`${t("controls")} (Alt+Shift+V)`}
          onClick={onTogglePanel}
          style={{
            ...smallBtnStyle(panelOpen),
            minWidth: "88px",
            border: "1px solid var(--border-strong)",
          }}
        >
          {panelOpen ? t("closePanel") : t("controls")}
        </button>
      </div>

      <p
        id="viewer-workflow-hint"
        data-testid={error ? "viewer-error" : "viewer-workflow-hint"}
        role={error ? "alert" : undefined}
        style={{
          gridColumn: "1 / -1",
          margin: 0,
          color: error ? "var(--danger-strong)" : "var(--text-secondary)",
          fontSize: "var(--text-xs)",
          minHeight: "14px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {error ?? t(workflowDisplay.hint)}{" "}
        {panelOpen
          ? Object.values(SECTION_KEYS)
              .map((key) => t(key))
              .join(" / ")
          : ""}
      </p>
    </header>
  );
}

function MappingBadge({
  label,
  count,
  total,
}: {
  label: string;
  count: number;
  total?: number;
}) {
  return (
    <span
      style={{
        ...badgeBaseStyle,
        marginLeft: 0,
        display: "inline-flex",
        gap: "8px",
        alignItems: "center",
        backgroundColor: count > 0 ? "var(--viewer-badge-face)" : "var(--bg-hover)",
        color: count > 0 ? "white" : "var(--text-secondary)",
      }}
    >
      <span>{label}</span>
      <span>{total ? `${count}/${total}` : count}</span>
    </span>
  );
}

function StatusPill({ label, active }: { label: string; active: boolean }) {
  return (
    <span
      style={{
        padding: "3px 7px",
        borderRadius: "999px",
        border: "1px solid var(--border)",
        backgroundColor: active ? "rgba(64,160,96,0.18)" : "transparent",
        color: active ? "var(--viewer-status-ok)" : "var(--text-muted)",
        fontSize: "var(--text-xs)",
      }}
    >
      {label}
    </span>
  );
}
