import type { ComponentProps, CSSProperties, RefObject } from "react";
import { HudOverlay } from "../components/HudOverlay";
import {
  PresetIndicator,
  RecordingIndicator,
  Toast,
  VowelIndicator,
} from "../components/Indicators";
import type { createT, Locale } from "../i18n";
import { PropOverlay } from "../props/PropOverlay";
import type { ViviProp } from "../props/prop-types";
import type { RecordingState } from "../recorder";
import type { ViewerSettings } from "../settings";
import type {
  ViewerRecommendationKey,
  ViewerSheetSection,
} from "../components/viewer-workflow";

export interface ReadinessWarning {
  id: string;
  label: string;
  targetSection: ViewerSheetSection;
  recommendationKey?: ViewerRecommendationKey;
  dismissed?: boolean;
}

interface ViewerStageProps {
  t: ReturnType<typeof createT>;
  locale: Locale;
  loaded: boolean;
  dragging: boolean;
  bgMode: ViewerSettings["bgMode"];
  canvasRef: RefObject<HTMLCanvasElement | null>;
  onCanvasClick: ComponentProps<"canvas">["onClick"];
  readinessWarnings: ReadinessWarning[];
  onClearReadinessWarnings: () => void;
  onOpenSheetSection: (section: ViewerSheetSection) => void;
  onDismissRecommendation: (key: ViewerRecommendationKey) => void;
  onRestoreRecommendation: (key: ViewerRecommendationKey) => void;
  lastHit: string | null;
  showHud: boolean;
  hudStats: ComponentProps<typeof HudOverlay>["stats"];
  viewerProps: ViviProp[];
  lipSync: boolean;
  lipSyncMode: ViewerSettings["lipSyncMode"];
  currentVowel: ComponentProps<typeof VowelIndicator>["vowel"];
  recordingState: RecordingState;
  activePreset: string | null;
  toast: string | null;
}

export function ViewerStage({
  t,
  locale,
  loaded,
  dragging,
  bgMode,
  canvasRef,
  onCanvasClick,
  readinessWarnings,
  onClearReadinessWarnings,
  onOpenSheetSection,
  onDismissRecommendation,
  onRestoreRecommendation,
  lastHit,
  showHud,
  hudStats,
  viewerProps,
  lipSync,
  lipSyncMode,
  currentVowel,
  recordingState,
  activePreset,
  toast,
}: ViewerStageProps) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        overflow: "hidden",
        position: "relative",
        border: dragging ? "2px dashed var(--accent)" : "2px solid transparent",
        transition: "border-color var(--duration-base) var(--easing-standard)",
      }}
    >
      {!loaded && (
        <p style={{ opacity: 0.5, textAlign: "center" }}>
          {t("dropPrompt")}
          <br />
          {t("orClickOpen")}
        </p>
      )}
      {readinessWarnings.length > 0 && (
        <ReadinessCard
          t={t}
          warnings={readinessWarnings}
          onClose={onClearReadinessWarnings}
          onOpenSection={onOpenSheetSection}
          onDismiss={onDismissRecommendation}
          onRestore={onRestoreRecommendation}
        />
      )}
      <canvas
        ref={canvasRef}
        onClick={onCanvasClick}
        style={{
          maxWidth: "100%",
          maxHeight: "100%",
          display: loaded ? "block" : "none",
          cursor: loaded ? "pointer" : "default",
          backgroundColor:
            bgMode === "green"
              ? "#00ff00"
              : bgMode === "blue"
                ? "#0000ff"
                : "transparent",
        }}
      />
      {lastHit && (
        <div
          data-testid="hit-overlay"
          style={{
            position: "absolute",
            bottom: "16px",
            left: "50%",
            transform: "translateX(-50%)",
            padding: "8px 16px",
            backgroundColor: "var(--viewer-overlay-hit)",
            borderRadius: "var(--radius-md)",
            fontSize: "var(--text-base)",
            color: "white",
            pointerEvents: "none",
          }}
        >
          {lastHit}
        </div>
      )}
      {showHud && loaded && <HudOverlay locale={locale} stats={hudStats} />}
      {loaded && <PropOverlay props={viewerProps} />}
      {lipSync && lipSyncMode === "viseme" && (
        <VowelIndicator t={t} vowel={currentVowel} />
      )}
      {recordingState === "recording" && <RecordingIndicator />}
      {activePreset && <PresetIndicator label={activePreset} />}
      {toast && <Toast message={toast} />}
    </div>
  );
}

function ReadinessCard({
  t,
  warnings,
  onClose,
  onOpenSection,
  onDismiss,
  onRestore,
}: {
  t: ReturnType<typeof createT>;
  warnings: ReadinessWarning[];
  onClose: () => void;
  onOpenSection: (section: ViewerSheetSection) => void;
  onDismiss: (key: ViewerRecommendationKey) => void;
  onRestore: (key: ViewerRecommendationKey) => void;
}) {
  return (
    <section
      data-testid="readiness-card"
      aria-label={t("readinessCardAria")}
      style={{
        position: "absolute",
        top: "16px",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 5,
        width: "min(460px, calc(100% - 32px))",
        maxHeight: "min(32vh, 220px)",
        overflow: "auto",
        padding: "12px",
        borderRadius: "var(--radius-lg)",
        border: "1px solid var(--border-strong)",
        backgroundColor: "var(--bg-surface)",
        boxShadow: "0 18px 48px rgba(0,0,0,0.28)",
        display: "grid",
        gap: "10px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "12px",
        }}
      >
        <strong>{t("readinessCardTitle")}</strong>
        <button type="button" onClick={onClose} style={{ ...smallTextButtonStyle }}>
          {t("readinessClose")}
        </button>
      </div>
      {warnings.map((warning) => (
        <div
          key={warning.id}
          style={{
            display: "grid",
            gap: "6px",
            padding: "8px",
            borderRadius: "var(--radius-md)",
            backgroundColor: "var(--bg-elevated)",
          }}
        >
          <span
            style={{
              color: warning.dismissed ? "var(--text-muted)" : "var(--text-primary)",
            }}
          >
            {warning.label}
            {warning.dismissed ? t("readinessDismissedSuffix") : ""}
          </span>
          <span style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => onOpenSection(warning.targetSection)}
              style={{ ...smallTextButtonStyle }}
            >
              {t("readinessOpen")}
            </button>
            {warning.recommendationKey && !warning.dismissed && (
              <button
                type="button"
                onClick={() => onDismiss(warning.recommendationKey!)}
                style={{ ...smallTextButtonStyle }}
              >
                {t("readinessDismissReminder")}
              </button>
            )}
            {warning.recommendationKey && warning.dismissed && (
              <button
                type="button"
                onClick={() => onRestore(warning.recommendationKey!)}
                style={{ ...smallTextButtonStyle }}
              >
                {t("readinessRestoreReminder")}
              </button>
            )}
          </span>
        </div>
      ))}
    </section>
  );
}

const smallTextButtonStyle: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  backgroundColor: "var(--bg-hover)",
  color: "var(--text-primary)",
  padding: "4px 8px",
  fontSize: "var(--text-xs)",
  cursor: "pointer",
};
