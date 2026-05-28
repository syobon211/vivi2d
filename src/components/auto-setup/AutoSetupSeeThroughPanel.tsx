import { type I18nKey, useT } from "@/lib/i18n";
import type { SeeThroughAutoSetupSummary } from "@/lib/see-through-auto-setup";
import type {
  SeeThroughDepthRigHint,
  SeeThroughDepthRigHintSummary,
} from "@/lib/see-through-depth-rig-hints";
import type { SeeThroughEyeClippingPlan } from "@vivi2d/editor-core/see-through-eye-clipping";
import type { SeeThroughEyeRigPlan } from "@vivi2d/editor-core/see-through-eye-rig";
import type { SeeThroughLeftRightSplitSummary } from "@vivi2d/editor-core/see-through-left-right-split";
import type { SeeThroughMeshDensitySummary } from "@/lib/see-through-mesh-density";
import type { SeeThroughMouthRigPlan } from "@vivi2d/editor-core/see-through-mouth-rig";
import type { SeeThroughQualityReport } from "@/lib/see-through-quality-report";
import type {
  SeeThroughSetupChecklistItem,
  SeeThroughSetupChecklistSummary,
} from "@/lib/see-through-setup-checklist";
import { formatSeeThroughWorkflowWarning } from "@/lib/see-through-warning-i18n";

export interface AutoSetupSeeThroughPanelProps {
  busy: boolean;
  depthInspectorAction?: {
    label: string;
    run: () => void;
    enabled: boolean;
    reason?: string;
  } | null;
  depthRigHintSummary?: SeeThroughDepthRigHintSummary | null;
  depthRigSummaryLabel?: string;
  eyeClippingSummary?: SeeThroughEyeClippingPlan | null;
  eyeRigSummary?: SeeThroughEyeRigPlan | null;
  formatDepthRigHint?: (hint: SeeThroughDepthRigHint) => string;
  formatProjectIssue?: (index: number) => string;
  getChecklistAction?: (item: SeeThroughSetupChecklistItem) => {
    label: string;
    run: () => void;
    enabled?: boolean;
    reason?: string;
  } | null;
  isAdvanced: boolean;
  leftRightSplitSummary?: SeeThroughLeftRightSplitSummary | null;
  meshDensitySummary?: SeeThroughMeshDensitySummary | null;
  mouthRigSummary?: SeeThroughMouthRigPlan | null;
  onApplyAutomaticEyeClipping?: () => void;
  onApplySeeThroughEyeRig?: () => void;
  onApplySeeThroughLeftRightRepair?: () => void;
  onApplySeeThroughMouthRig?: () => void;
  onApplySeeThroughRecommendations?: () => void;
  onReadyToRig?: () => void;
  onToggleOcclusionAwareMeshDensity?: (next: boolean) => void;
  recommendationsApplied?: boolean;
  seeThroughQualityReport?: SeeThroughQualityReport | null;
  seeThroughSetupChecklist?: SeeThroughSetupChecklistSummary | null;
  seeThroughSummary?: SeeThroughAutoSetupSummary | null;
  useOcclusionAwareMeshDensity?: boolean;
}

function checklistStatusKey(item: SeeThroughSetupChecklistItem): I18nKey {
  switch (item.status) {
    case "done":
      return "autoSetup.status.done";
    case "partial":
      return "autoSetup.status.partial";
    case "pending":
      return "autoSetup.status.pending";
    case "blocked":
      return "autoSetup.status.blocked";
    default:
      return "autoSetup.status.na";
  }
}

function checklistStatusClass(item: SeeThroughSetupChecklistItem): string {
  return `auto-setup-status-pill auto-setup-status-${item.status}`;
}

export function AutoSetupSeeThroughPanel({
  busy,
  depthInspectorAction = null,
  depthRigHintSummary = null,
  depthRigSummaryLabel,
  eyeClippingSummary = null,
  eyeRigSummary = null,
  formatDepthRigHint,
  formatProjectIssue,
  getChecklistAction,
  isAdvanced,
  leftRightSplitSummary = null,
  meshDensitySummary = null,
  mouthRigSummary = null,
  onApplyAutomaticEyeClipping,
  onApplySeeThroughEyeRig,
  onApplySeeThroughLeftRightRepair,
  onApplySeeThroughMouthRig,
  onApplySeeThroughRecommendations,
  onReadyToRig,
  onToggleOcclusionAwareMeshDensity,
  recommendationsApplied = false,
  seeThroughQualityReport = null,
  seeThroughSetupChecklist = null,
  seeThroughSummary = null,
  useOcclusionAwareMeshDensity = false,
}: AutoSetupSeeThroughPanelProps) {
  const t = useT();
  if (!seeThroughSummary?.isSeeThroughProject) return null;

  const importedLayerIssueCount = Object.keys(
    seeThroughQualityReport?.layerIssues ?? {},
  ).length;
  const renderWarningDetails = (warnings: string[]) =>
    warnings.length > 0 ? (
      <details className="auto-setup-inline-details">
        <summary>
          {t("autoSetup.warnings")} ({warnings.length})
        </summary>
        <ul className="auto-setup-list">
          {warnings.map((warning) => (
            <li key={warning}>{formatSeeThroughWorkflowWarning(t, warning)}</li>
          ))}
        </ul>
      </details>
    ) : null;

  return (
    <section
      className="auto-setup-seethrough-summary"
      aria-label={t("autoSetup.seeThroughAssistedSetup")}
    >
      <div className="auto-setup-panel auto-setup-panel-highlight">
        <div className="auto-setup-panel-header">
          <div>
            <p className="auto-setup-eyebrow">{t("autoSetup.projectSummary")}</p>
            <h3>{t("autoSetup.seeThroughAssistedSetup")}</h3>
          </div>
          {onReadyToRig && (
            <button
              type="button"
              className="modal-btn modal-btn-primary"
              onClick={onReadyToRig}
              disabled={busy}
            >
              {busy ? t("autoSetup.readyPreparing") : t("autoSetup.readyToRig")}
            </button>
          )}
        </div>
        <div className="auto-setup-stat-grid">
          <div className="auto-setup-stat">
            <strong>{seeThroughSummary.importedViviMeshCount}</strong>
            <span>{t("autoSetup.importedViviMeshes")}</span>
          </div>
          <div className="auto-setup-stat">
            <strong>{seeThroughSummary.classifiedViviMeshCount}</strong>
            <span>{t("autoSetup.classifiedRoles")}</span>
          </div>
          <div className="auto-setup-stat">
            <strong>{seeThroughSummary.unknownRoleCount}</strong>
            <span>{t("autoSetup.unknownRoles")}</span>
          </div>
          <div className="auto-setup-stat">
            <strong>{seeThroughSummary.accessoryCount}</strong>
            <span>{t("autoSetup.accessories")}</span>
          </div>
          {seeThroughQualityReport && (
            <>
              <div className="auto-setup-stat auto-setup-stat-error">
                <strong>{seeThroughQualityReport.errorCount}</strong>
                <span>{t("autoSetup.errors")}</span>
              </div>
              <div className="auto-setup-stat auto-setup-stat-warning">
                <strong>{seeThroughQualityReport.warningCount}</strong>
                <span>{t("autoSetup.warnings")}</span>
              </div>
              <div className="auto-setup-stat">
                <strong>{seeThroughQualityReport.infoCount}</strong>
                <span>{t("autoSetup.info")}</span>
              </div>
            </>
          )}
        </div>
        {importedLayerIssueCount > 0 && (
          <p className="auto-setup-muted">
            {importedLayerIssueCount} {t("autoSetup.importedLayersNeedReview")}
          </p>
        )}
      </div>

      {seeThroughSetupChecklist?.isSeeThroughProject &&
        seeThroughSetupChecklist.items.length > 0 && (
          <div className="auto-setup-panel">
            <div className="auto-setup-panel-header">
              <div>
                <p className="auto-setup-eyebrow">{t("autoSetup.recommendedFlow")}</p>
                <h3>{t("autoSetup.setupChecklist")}</h3>
              </div>
            </div>
            <ul className="auto-setup-checklist">
              {seeThroughSetupChecklist.items.map((item) => {
                const action = getChecklistAction?.(item) ?? null;
                return (
                  <li className="auto-setup-checklist-item" key={item.id}>
                    <div className="auto-setup-checklist-main">
                      <span className={checklistStatusClass(item)}>
                        {t(checklistStatusKey(item))}
                      </span>
                      <div>
                        <strong>{item.label}:</strong>
                        <p>{item.detail}</p>
                      </div>
                    </div>
                    {action && (
                      <div className="auto-setup-checklist-action">
                        <button
                          type="button"
                          className="modal-btn"
                          onClick={action.run}
                          disabled={busy || action.enabled === false}
                          aria-label={`${action.label} (${t("autoSetup.checklistAriaSuffix")})`}
                        >
                          {action.label}
                        </button>
                        {action.enabled === false && action.reason && (
                          <small>{action.reason}</small>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

      <div className="auto-setup-panel">
        <div className="auto-setup-panel-header">
          <div>
            <p className="auto-setup-eyebrow">{t("autoSetup.helperActions")}</p>
            <h3>{t("autoSetup.seeThroughAssistedSetup")}</h3>
          </div>
        </div>
        <div className="auto-setup-action-grid">
          <button
            type="button"
            className="modal-btn"
            onClick={onApplySeeThroughRecommendations}
            disabled={busy || !onApplySeeThroughRecommendations}
          >
            {recommendationsApplied
              ? t("autoSetup.recommendationsApplied")
              : t("autoSetup.useRecommendations")}
          </button>
          {onApplyAutomaticEyeClipping && (
            <button
              type="button"
              className="modal-btn"
              onClick={onApplyAutomaticEyeClipping}
              disabled={busy}
            >
              {t("autoSetup.applyEyeClipping")}
            </button>
          )}
          {onApplySeeThroughEyeRig && (
            <button
              type="button"
              className="modal-btn"
              onClick={onApplySeeThroughEyeRig}
              disabled={busy}
            >
              {t("autoSetup.createEyeRig")}
            </button>
          )}
          {onApplySeeThroughMouthRig && (
            <button
              type="button"
              className="modal-btn"
              onClick={onApplySeeThroughMouthRig}
              disabled={busy}
            >
              {t("autoSetup.createMouthRig")}
            </button>
          )}
          {onApplySeeThroughLeftRightRepair && (
            <button
              type="button"
              className="modal-btn"
              onClick={onApplySeeThroughLeftRightRepair}
              disabled={busy}
            >
              {t("autoSetup.repairLeftRightRoles")}
            </button>
          )}
        </div>
      </div>

      {(eyeClippingSummary ||
        eyeRigSummary ||
        mouthRigSummary ||
        leftRightSplitSummary) && (
        <div className="auto-setup-panel auto-setup-helper-result">
          {eyeClippingSummary && (
            <div>
              <p>
                {eyeClippingSummary.updatedLayerIds.length}{" "}
                {t("autoSetup.eyeClippingRelationsApplied")}
                {!eyeClippingSummary.applied &&
                  eyeClippingSummary.warnings.length === 0 &&
                  ` ${t("autoSetup.noEyeClippingChanges")}`}
              </p>
              {renderWarningDetails(eyeClippingSummary.warnings)}
            </div>
          )}
          {eyeRigSummary && (
            <div>
              <p>
                {eyeRigSummary.createdParameterIds.length}{" "}
                {t("autoSetup.blinkParametersCreated")}
                {" | "}
                {eyeRigSummary.createdControlBoneIds.length}{" "}
                {t("autoSetup.eyeControlBonesCreated")}
                {" | "}
                {eyeRigSummary.adoptedAssetIds.length}{" "}
                {t("autoSetup.legacyEyeRigAssetsRelinked")}
              </p>
              {!eyeRigSummary.applied && eyeRigSummary.warnings.length === 0 && (
                <p>{t("autoSetup.noEyeRigChanges")}</p>
              )}
              {renderWarningDetails(eyeRigSummary.warnings)}
            </div>
          )}
          {mouthRigSummary && (
            <div>
              <p>
                {mouthRigSummary.createdParameterIds.length}{" "}
                {t("autoSetup.mouthParametersCreated")}
                {" | "}
                {mouthRigSummary.createdControlBoneIds.length}{" "}
                {t("autoSetup.mouthControlBonesCreated")}
              </p>
              {mouthRigSummary.lipsyncTargetUpdated && (
                <p>{t("autoSetup.lipSyncTargetAssigned")}</p>
              )}
              {!mouthRigSummary.applied && mouthRigSummary.warnings.length === 0 && (
                <p>{t("autoSetup.noMouthRigChanges")}</p>
              )}
              {renderWarningDetails(mouthRigSummary.warnings)}
            </div>
          )}
          {leftRightSplitSummary && (
            <div>
              <p>
                {leftRightSplitSummary.assignedLayerIds.length}{" "}
                {t("autoSetup.leftRightRoleAssignmentsAdded")}
                {" | "}
                {leftRightSplitSummary.repairedLayerIds.length}{" "}
                {t("autoSetup.leftRightRoleRepairsApplied")}
              </p>
              {!leftRightSplitSummary.applied &&
                leftRightSplitSummary.warnings.length === 0 &&
                leftRightSplitSummary.unresolvedFamilyWarnings.length === 0 && (
                  <p>{t("autoSetup.noLeftRightRoleChanges")}</p>
                )}
              {renderWarningDetails([
                ...leftRightSplitSummary.warnings,
                ...leftRightSplitSummary.unresolvedFamilyWarnings,
              ])}
            </div>
          )}
        </div>
      )}

      {isAdvanced && seeThroughQualityReport?.projectIssues.length ? (
        <details className="auto-setup-panel">
          <summary>
            {t("autoSetup.projectIssues")} (
            {seeThroughQualityReport.projectIssues.length})
          </summary>
          <ul>
            {seeThroughQualityReport.projectIssues.map((issue, index) => (
              <li key={`${issue.severity}:${issue.code}:${issue.role ?? "project"}`}>
                {formatProjectIssue ? formatProjectIssue(index) : issue.code}
              </li>
            ))}
          </ul>
        </details>
      ) : seeThroughSummary.warnings.length > 0 ? (
        <div className="auto-setup-panel">
          <ul className="auto-setup-list">
            {seeThroughSummary.warnings.map((warning) => (
              <li key={warning}>{formatSeeThroughWorkflowWarning(t, warning)}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {isAdvanced &&
        depthRigHintSummary?.isSeeThroughProject &&
        depthRigHintSummary.hints.length > 0 && (
          <details className="auto-setup-panel">
            <summary>{depthRigSummaryLabel ?? ""}</summary>
            {depthInspectorAction && (
              <>
                <button
                  type="button"
                  className="modal-btn"
                  onClick={depthInspectorAction.run}
                  disabled={!depthInspectorAction.enabled}
                  aria-label={`${depthInspectorAction.label} (${t("autoSetup.depthRigAriaSuffix")})`}
                >
                  {depthInspectorAction.label}
                </button>
                {!depthInspectorAction.enabled && depthInspectorAction.reason && (
                  <p>{depthInspectorAction.reason}</p>
                )}
              </>
            )}
            <ul>
              {depthRigHintSummary.hints.map((hint) => {
                const params = JSON.stringify(hint.messageParams ?? {});
                const key = [
                  hint.severity,
                  hint.concern,
                  hint.code,
                  hint.layerId ?? "project",
                  hint.messageKey,
                  params,
                ].join(":");
                return (
                  <li key={key}>
                    {formatDepthRigHint ? formatDepthRigHint(hint) : hint.messageKey}
                  </li>
                );
              })}
            </ul>
          </details>
        )}
      {meshDensitySummary?.isSeeThroughProject && (
        <div className="auto-setup-panel auto-setup-density-panel">
          <p>
            {t("autoSetup.occlusionAwareMeshDensity")}: {t("prop.fine")}{" "}
            {meshDensitySummary.counts.fine}
            {" | "}
            {t("prop.standard")} {meshDensitySummary.counts.standard}
            {" | "}
            {t("prop.coarse")} {meshDensitySummary.counts.coarse}
          </p>
          {isAdvanced && (
            <label className="auto-setup-check">
              <input
                type="checkbox"
                checked={useOcclusionAwareMeshDensity}
                onChange={(event) =>
                  onToggleOcclusionAwareMeshDensity?.(event.target.checked)
                }
              />
              {t("autoSetup.useOcclusionAwareMeshDensity")}
            </label>
          )}
        </div>
      )}
    </section>
  );
}
