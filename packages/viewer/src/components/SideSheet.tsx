import type { ReactNode } from "react";
import { createT, type Locale, type TranslationKey } from "../i18n";
import { smallBtnStyle } from "../styles";
import type { ViewerIssue, ViewerSheetSection } from "./viewer-workflow";

interface SideSheetProps {
  locale: Locale;
  open: boolean;
  activeSection: ViewerSheetSection;
  issues: readonly ViewerIssue[];
  sections: Record<ViewerSheetSection, ReactNode>;
  onClose: () => void;
  onSectionChange: (section: ViewerSheetSection) => void;
}

const SECTION_ORDER: ViewerSheetSection[] = [
  "session",
  "connect",
  "overlays",
  "calibration",
  "inputEffects",
];
const DEFAULT_SECTION: ViewerSheetSection = "session";

const SECTION_LABEL_KEYS: Record<ViewerSheetSection, TranslationKey> = {
  session: "session",
  connect: "connect",
  overlays: "overlays",
  calibration: "calibration",
  inputEffects: "inputEffects",
};

const SECTION_DESCRIPTION_KEYS: Record<ViewerSheetSection, TranslationKey> = {
  session: "sideSheetSessionDescription",
  connect: "sideSheetConnectDescription",
  overlays: "sideSheetOverlaysDescription",
  calibration: "sideSheetCalibrationDescription",
  inputEffects: "sideSheetInputEffectsDescription",
};

export function SideSheet({
  locale,
  open,
  activeSection,
  issues,
  sections,
  onClose,
  onSectionChange,
}: SideSheetProps) {
  if (!open) return null;

  const t = createT(locale);

  return (
    <aside
      data-testid="side-sheet"
      className="viewer-side-sheet"
      aria-label={t("sideSheetAria")}
      style={{
        width: "min(420px, 42vw)",
        minWidth: "320px",
        maxWidth: "460px",
        borderLeft: "1px solid var(--border)",
        backgroundColor: "var(--bg-surface)",
        boxShadow: "-18px 0 36px rgba(0,0,0,0.18)",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "12px",
          padding: "14px 14px 10px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)" }}>
            Vivi2D Viewer
          </div>
          <h2 style={{ margin: "2px 0 0", fontSize: "16px" }}>
            {t(SECTION_LABEL_KEYS[activeSection])}
          </h2>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: "var(--text-xs)",
              color: "var(--text-secondary)",
              lineHeight: 1.5,
            }}
          >
            {t(SECTION_DESCRIPTION_KEYS[activeSection])}
          </p>
        </div>
        <button type="button" onClick={onClose} style={smallBtnStyle()}>
          {t("closePanel")}
        </button>
      </div>

      {issues.length > 0 && (
        <div
          data-testid="viewer-issue-list"
          style={{
            margin: "10px 12px 0",
            padding: "10px",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--danger-strong)",
            backgroundColor: "rgba(224,64,64,0.12)",
            display: "grid",
            gap: "6px",
          }}
        >
          {issues.slice(0, 3).map((issue) => (
            <div key={`${issue.code}-${issue.createdAtMs}`}>
              <strong style={{ fontSize: "var(--text-xs)" }}>{issue.code}</strong>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--text-primary)" }}>
                {issue.message}
              </div>
            </div>
          ))}
        </div>
      )}

      <div
        role="tablist"
        aria-label={t("sideSheetTabsAria")}
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
          gap: "4px",
          padding: "10px 12px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        {SECTION_ORDER.map((section) => {
          const selected = section === activeSection;
          const sectionId = toTestIdSuffix(section);
          return (
            <button
              key={section}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`viewer-section-${sectionId}`}
              id={`viewer-tab-${sectionId}`}
              tabIndex={selected ? 0 : -1}
              data-testid={`side-sheet-tab-${sectionId}`}
              onClick={() => onSectionChange(section)}
              onKeyDown={(event) => {
                const next = getNextSectionFromKey(section, event.key);
                if (!next) return;
                event.preventDefault();
                onSectionChange(next);
              }}
              style={{
                ...smallBtnStyle(selected),
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                border: selected
                  ? "1px solid var(--accent)"
                  : "1px solid transparent",
              }}
            >
              {t(SECTION_LABEL_KEYS[section])}
            </button>
          );
        })}
      </div>

      <div
        style={{
          minHeight: 0,
          overflow: "auto",
          padding: "12px",
        }}
      >
        {SECTION_ORDER.map((section) => (
          <section
            key={section}
            role="tabpanel"
            id={`viewer-section-${toTestIdSuffix(section)}`}
            aria-labelledby={`viewer-tab-${toTestIdSuffix(section)}`}
            data-testid={`side-sheet-panel-${toTestIdSuffix(section)}`}
            hidden={section !== activeSection}
          >
            <div data-testid={`side-sheet-section-${toTestIdSuffix(section)}`}>
              {sections[section]}
            </div>
          </section>
        ))}
      </div>
    </aside>
  );
}

function toTestIdSuffix(section: ViewerSheetSection): string {
  return section === "inputEffects" ? "input-effects" : section;
}

function getNextSectionFromKey(
  current: ViewerSheetSection,
  key: string,
): ViewerSheetSection | null {
  const index = SECTION_ORDER.indexOf(current);
  if (index < 0) return null;
  if (key === "Home") return SECTION_ORDER[0] ?? DEFAULT_SECTION;
  if (key === "End") return SECTION_ORDER[SECTION_ORDER.length - 1] ?? DEFAULT_SECTION;
  if (key === "ArrowRight") {
    return SECTION_ORDER[(index + 1) % SECTION_ORDER.length] ?? DEFAULT_SECTION;
  }
  if (key === "ArrowLeft") {
    return (
      SECTION_ORDER[(index - 1 + SECTION_ORDER.length) % SECTION_ORDER.length] ??
      DEFAULT_SECTION
    );
  }
  return null;
}
