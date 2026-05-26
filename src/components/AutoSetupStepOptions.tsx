import type { AutoSetupResult } from "@/lib/auto-setup";
import { useT } from "@/lib/i18n";
import type { SeeThroughAutoSetupSummary } from "@/lib/see-through-auto-setup";
import type { SeeThroughReadyToRigCleanupSummary } from "@vivi2d/editor-core/see-through-ready-to-rig";
import { formatSeeThroughWorkflowWarning } from "@/lib/see-through-warning-i18n";
import { CATEGORY_LABEL_KEYS } from "./AutoSetupHelpers";

export interface AutoSetupStepOptionsProps {
  result: AutoSetupResult;
  excludedIds: Set<string>;
  onToggleExclude: (id: string) => void;
  seeThroughSummary?: SeeThroughAutoSetupSummary | null;
  cleanupSummary?: SeeThroughReadyToRigCleanupSummary | null;
  recommendationsApplied?: boolean;
  onRestoreRecommendedExclusions?: () => void;
  onBack: () => void;
  onPreview: () => void;
  isPreviewing?: boolean;
}

export function AutoSetupStepOptions({
  result,
  excludedIds,
  onToggleExclude,
  seeThroughSummary = null,
  cleanupSummary = null,
  recommendationsApplied = false,
  onRestoreRecommendedExclusions,
  onBack,
  onPreview,
  isPreviewing = false,
}: AutoSetupStepOptionsProps) {
  const t = useT();
  const showRecommendationNote =
    seeThroughSummary?.isSeeThroughProject &&
    recommendationsApplied &&
    seeThroughSummary.recommendedExcludedLayerIds.length > 0;

  return (
    <div className="auto-setup-step">
      <h3>
        {t("autoSetup.detectedResults")} ({result.detectedParts.length}
        {t("autoSetup.itemCountSuffix")})
      </h3>
      {showRecommendationNote && (
        <div className="auto-setup-recommendation-note">
          <p>{t("autoSetup.recommendedExclusionsApplied")}</p>
          <button
            type="button"
            className="modal-btn"
            onClick={onRestoreRecommendedExclusions}
          >
            {t("autoSetup.restoreRecommendedExclusions")}
          </button>
        </div>
      )}
      {cleanupSummary && (
        <div className="auto-setup-recommendation-note">
          <p>
            {cleanupSummary.renamedLayerIds.length}{" "}
            {t("autoSetup.importedNamesNormalized")}
            {" | "}
            {cleanupSummary.assignedRoleLayerIds.length}{" "}
            {t("autoSetup.roleAssignmentsAdded")}
          </p>
          {!cleanupSummary.applied && cleanupSummary.warnings.length === 0 && (
            <p>{t("autoSetup.noCleanupChanges")}</p>
          )}
          {cleanupSummary.warnings.length > 0 && (
            <ul>
              {cleanupSummary.warnings.map((warning) => (
                <li key={warning}>{formatSeeThroughWorkflowWarning(t, warning)}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <table className="auto-setup-table">
        <thead>
          <tr>
            <th>{t("autoSetup.enabledColumn")}</th>
            <th>{t("autoSetup.layerNameColumn")}</th>
            <th>{t("autoSetup.typeColumn")}</th>
            <th>{t("autoSetup.confidenceColumn")}</th>
          </tr>
        </thead>
        <tbody>
          {result.detectedParts.map((part) => (
            <tr key={part.layerId}>
              <td>
                <input
                  type="checkbox"
                  checked={!excludedIds.has(part.layerId)}
                  onChange={() => onToggleExclude(part.layerId)}
                />
              </td>
              <td>{part.layerName}</td>
              <td>{t(CATEGORY_LABEL_KEYS[part.category])}</td>
              <td>{(part.confidence * 100).toFixed(0)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      {result.detectedParts.length === 0 && (
        <p className="auto-setup-empty">{t("autoSetup.noPartsDetected")}</p>
      )}
      <div className="auto-setup-actions">
        <button type="button" className="modal-btn" onClick={onBack}>
          {t("autoSetup.back")}
        </button>
        <button
          type="button"
          className="modal-btn modal-btn-primary"
          onClick={onPreview}
          disabled={result.detectedParts.length === 0 || isPreviewing}
          aria-busy={isPreviewing}
        >
          {t("autoSetup.preview")}
        </button>
      </div>
    </div>
  );
}
