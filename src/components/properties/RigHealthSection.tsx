import { memo, useCallback, useMemo } from "react";
import { useT } from "@/lib/i18n";
import { useEditorStore } from "@/stores/editorStore";
import { useProjectDialogsStore } from "@/stores/projectDialogsStore";
import { useQuickActionRegistryStore } from "@/stores/quickActionRegistryStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { useTimelineStore } from "@/stores/timelineStore";
import { useWorkspaceModeStore } from "@/stores/workspaceModeStore";
import { resolveRigHealthAutoSetupRepair } from "@/lib/rig-health-auto-setup-repair";
import { formatRigHealthIssueMessage } from "@/lib/rig-health-i18n";
import {
  buildRigHealthPreviewIssues,
  buildRigHealthSummary,
  canFocusRigHealthIssue,
  type RigHealthIssue,
} from "@/lib/rig-health-report";
import { buildSeeThroughQualityReport } from "@/lib/see-through-quality-report";
import { formatValidationCategory } from "@/lib/validation-category-label";
import { PropGroup } from "./PropGroup";

export const RigHealthSection = memo(function RigHealthSection() {
  const t = useT();
  const project = useEditorStore((s) => s.project);
  const registryActions = useQuickActionRegistryStore((s) => s.actions);
  const openValidationDialog = useProjectDialogsStore(
    (s) => s.openValidationDialog,
  );
  const seeThroughQualityReport = useMemo(
    () => (project ? buildSeeThroughQualityReport(project) : null),
    [project],
  );
  const rigHealthSummary = useMemo(
    () =>
      project
        ? buildRigHealthSummary(project, { seeThroughQualityReport })
        : null,
    [project, seeThroughQualityReport],
  );
  const rigHealthPreview = useMemo(
    () =>
      rigHealthSummary
        ? buildRigHealthPreviewIssues(rigHealthSummary.issues)
        : [],
    [rigHealthSummary],
  );

  const handleClickRigHealthIssue = useCallback((issue: RigHealthIssue) => {
    if (issue.clipId) {
      useWorkspaceModeStore.getState().setMode("animation");
      useTimelineStore.getState().setActiveClip(issue.clipId);
    }
    if (issue.layerId) {
      useSelectionStore.getState().selectLayer(issue.layerId);
      return;
    }
    if (issue.semanticRole) {
      useSelectionStore
        .getState()
        .selectLayersBySemanticRole(
          issue.semanticRole,
          useSelectionStore.getState().selectedLayerId,
        );
    }
  }, []);

  const handleRunRigHealthRepair = useCallback(
    (issue: RigHealthIssue) => {
      const repair = resolveRigHealthAutoSetupRepair(issue, registryActions);
      if (!repair?.availability.enabled) return;
      if (issue.clipId) {
        useWorkspaceModeStore.getState().setMode("animation");
        useTimelineStore.getState().setActiveClip(issue.clipId);
      }
      if (issue.layerId) {
        useSelectionStore.getState().selectLayer(issue.layerId);
      }
      repair.action.run();
    },
    [registryActions],
  );

  if (!project) return null;

  return (
    <div className="properties-section">
      <div className="prop-section-title">{t("prop.rigHealth.title")}</div>
      {rigHealthSummary && (
        <>
          {rigHealthSummary.issues.length === 0 ? (
            <div>{t("prop.rigHealth.ok")}</div>
          ) : (
            <>
              <div className="validation-summary">
                {rigHealthSummary.errorCount > 0 && (
                  <span className="validation-count validation-count-error">
                    {t("common.error")}: {rigHealthSummary.errorCount}
                  </span>
                )}
                {rigHealthSummary.warningCount > 0 && (
                  <span className="validation-count validation-count-warning">
                    {t("common.warning")}: {rigHealthSummary.warningCount}
                  </span>
                )}
                {rigHealthSummary.infoCount > 0 && (
                  <span className="validation-count validation-count-info">
                    {t("common.info")}: {rigHealthSummary.infoCount}
                  </span>
                )}
              </div>
              <div className="validation-list">
                {rigHealthPreview.map((issue) => {
                  const repair = resolveRigHealthAutoSetupRepair(
                    issue,
                    registryActions,
                  );
                  const canFocus = canFocusRigHealthIssue(issue);
                  return (
                    <div key={issue.id} className="validation-item-with-repair">
                      <div className="validation-item-row">
                        {canFocus ? (
                          <button
                            type="button"
                            className={`validation-item validation-item-main validation-item-${issue.severity}`}
                            onClick={() => handleClickRigHealthIssue(issue)}
                          >
                            <span className="validation-category">
                              {formatValidationCategory(t, issue.category)}
                            </span>
                            <span className="validation-message">
                              {formatRigHealthIssueMessage(t, issue)}
                            </span>
                          </button>
                        ) : (
                          <div
                            className={`validation-item validation-item-main validation-item-${issue.severity}`}
                          >
                            <span className="validation-category">
                              {formatValidationCategory(t, issue.category)}
                            </span>
                            <span className="validation-message">
                              {formatRigHealthIssueMessage(t, issue)}
                            </span>
                          </div>
                        )}
                        {repair && (
                          <button
                            type="button"
                            className="validation-item-repair"
                            disabled={!repair.availability.enabled}
                            title={repair.availability.reason}
                            onClick={(event) => {
                              event.stopPropagation();
                              handleRunRigHealthRepair(issue);
                            }}
                          >
                            {repair.label}
                          </button>
                        )}
                      </div>
                      {repair &&
                        !repair.availability.enabled &&
                        repair.availability.reason && (
                          <div className="validation-item-repair-note">
                            {repair.availability.reason}
                          </div>
                        )}
                    </div>
                  );
                })}
              </div>
              {rigHealthSummary.issues.length > rigHealthPreview.length && (
                <div>
                  {rigHealthSummary.issues.length - rigHealthPreview.length}{" "}
                  {t("prop.rigHealth.more")}
                </div>
              )}
            </>
          )}
          <PropGroup label={t("prop.rigHealth.openValidation")}>
            <button
              type="button"
              className="prop-btn"
              onClick={openValidationDialog}
            >
              {t("menu.validate")}
            </button>
          </PropGroup>
        </>
      )}
    </div>
  );
});
