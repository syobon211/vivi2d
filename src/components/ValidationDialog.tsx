import { findLayerById } from "@vivi2d/core/layer-utils";
import { useMemo } from "react";
import { useT } from "@/lib/i18n";
import { resolveRigHealthAutoSetupRepair } from "@/lib/rig-health-auto-setup-repair";
import { formatRigHealthIssueMessage } from "@/lib/rig-health-i18n";
import {
  buildRigHealthSummary,
  canFocusRigHealthIssue,
} from "@/lib/rig-health-report";
import { formatValidationCategory } from "@/lib/validation-category-label";
import { useEditorStore } from "@/stores/editorStore";
import { useQuickActionRegistryStore } from "@/stores/quickActionRegistryStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { useTimelineStore } from "@/stores/timelineStore";
import { useWorkspaceModeStore } from "@/stores/workspaceModeStore";
import { DialogShell } from "./DialogShell";

const SEVERITY_LABELS: Record<string, string> = {
  error: "[!]",
  warning: "[?]",
  info: "[i]",
};

export function ValidationDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const project = useEditorStore((s) => s.project);
  const selectedLayerId = useSelectionStore((s) => s.selectedLayerId);
  const registryActions = useQuickActionRegistryStore((s) => s.actions);

  const summary = useMemo(
    () => (project ? buildRigHealthSummary(project) : null),
    [project],
  );
  const issues = summary?.issues ?? [];

  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  const infos = issues.filter((i) => i.severity === "info");

  const handleClickIssue = (issue: (typeof issues)[number]) => {
    if (issue.clipId) {
      useWorkspaceModeStore.getState().setMode("animation");
      useTimelineStore.getState().setActiveClip(issue.clipId);
    }
    if (
      issue.layerId &&
      project &&
      findLayerById(project.layers, issue.layerId)
    ) {
      useSelectionStore.getState().selectLayer(issue.layerId);
      return;
    }
    if (issue.semanticRole) {
      useSelectionStore
        .getState()
        .selectLayersBySemanticRole(issue.semanticRole, selectedLayerId);
      return;
    }
  };

  const handleRunRepair = (issue: (typeof issues)[number]) => {
    const repair = resolveRigHealthAutoSetupRepair(issue, registryActions);
    if (!repair?.availability.enabled) return;
    if (issue.clipId) {
      useWorkspaceModeStore.getState().setMode("animation");
      useTimelineStore.getState().setActiveClip(issue.clipId);
    }
    if (
      issue.layerId &&
      project &&
      findLayerById(project.layers, issue.layerId)
    ) {
      useSelectionStore.getState().selectLayer(issue.layerId);
    }
    const run = repair.action.run;
    onClose();
    queueMicrotask(() => {
      run();
    });
  };

  return (
    <DialogShell
      onClose={onClose}
      title={t("validation.title")}
      minWidth={480}
      contentStyle={{
        maxHeight: "70vh",
        display: "flex",
        flexDirection: "column",
      }}
      footer={
        <button type="button" className="modal-btn" onClick={onClose}>
          {t("common.close")}
        </button>
      }
    >
      <div className="validation-body scrollbar-thin">
        {issues.length === 0 ? (
          <div className="validation-ok">{t("validation.noIssues")}</div>
        ) : (
          <>
            <div className="validation-summary">
              {errors.length > 0 && (
                <span className="validation-count validation-count-error">
                  {t("common.error")}: {errors.length}
                </span>
              )}
              {warnings.length > 0 && (
                <span className="validation-count validation-count-warning">
                  {t("common.warning")}: {warnings.length}
                </span>
              )}
              {infos.length > 0 && (
                <span className="validation-count validation-count-info">
                  {t("common.info")}: {infos.length}
                </span>
              )}
            </div>
            <div className="validation-list">
              {issues.map((issue) => {
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
                          onClick={() => handleClickIssue(issue)}
                        >
                          <span className="validation-severity">
                            {SEVERITY_LABELS[issue.severity]}
                          </span>
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
                          <span className="validation-severity">
                            {SEVERITY_LABELS[issue.severity]}
                          </span>
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
                            handleRunRepair(issue);
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
          </>
        )}
      </div>
    </DialogShell>
  );
}
