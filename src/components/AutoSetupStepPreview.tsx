import { useState } from "react";
import {
  AUTO_SETUP_BBW_REVIEW_GATE_DIAGNOSTIC,
  type AutoSetupResult,
} from "@/lib/auto-setup";
import { useT } from "@/lib/i18n";
import { AutoSetupMotionReviewPanel } from "./auto-setup/AutoSetupMotionReviewPanel";
import { AutoSetupPreviewDebugPanel } from "./auto-setup/AutoSetupPreviewDebugPanel";
import {
  createPreviewBounds,
  formatCleanupOperation,
  formatGateId,
  formatGateStatus,
  percent,
  shortHash,
} from "./auto-setup/AutoSetupPreviewUtils";
import { CATEGORY_LABEL_KEYS } from "./AutoSetupHelpers";
import {
  createAutoSetupReviewPanelModel,
} from "./AutoSetupMotionSuggestionHelpers";

export interface AutoSetupStepPreviewProps {
  result: AutoSetupResult;
  onResultChange?: (result: AutoSetupResult) => void;
  onBack: () => void;
  onApply: () => void;
  isApplying?: boolean;
}

export function AutoSetupStepPreview({
  result,
  onResultChange,
  onBack,
  onApply,
  isApplying = false,
}: AutoSetupStepPreviewProps) {
  const t = useT();
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const hasDiagnostics = Boolean(
    result.plan ||
      result.layerGraph ||
      result.auditTrace ||
      result.motionHandleDraft,
  );
  const reviewPanelModel = createAutoSetupReviewPanelModel(result);
  const previewBounds = createPreviewBounds(result);
  const hasBbwReviewGate =
    result.plan?.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === AUTO_SETUP_BBW_REVIEW_GATE_DIAGNOSTIC.code &&
        diagnostic.path?.startsWith(
          AUTO_SETUP_BBW_REVIEW_GATE_DIAGNOSTIC.pathPrefix,
        ) === true,
    ) ?? false;
  return (
    <div className="auto-setup-step">
      <h3>{t("autoSetup.generatedPreview")}</h3>
      {hasDiagnostics && (
        <div className="auto-setup-debug-toggle-row">
          <div>
            <strong>{t("autoSetup.debugToggleTitle")}</strong>
            <span>{t("autoSetup.debugToggleDescription")}</span>
          </div>
          <button
            aria-expanded={showDiagnostics}
            className="modal-btn auto-setup-debug-toggle"
            onClick={() => setShowDiagnostics((current) => !current)}
            type="button"
          >
            {showDiagnostics
              ? t("autoSetup.debugHide")
              : t("autoSetup.debugShow")}
          </button>
        </div>
      )}
      {hasDiagnostics && showDiagnostics && (
        <AutoSetupPreviewDebugPanel
          previewBounds={previewBounds}
          result={result}
          reviewPanelModel={reviewPanelModel}
        />
      )}
      {result.boneResult && (
        <div className="auto-setup-section">
          <h4>
            {t("autoSetup.bones")} ({result.boneResult.bones.length}
            {t("autoSetup.boneCountUnit")})
          </h4>
          <ul className="auto-setup-list">
            {result.boneResult.bones.map((bone) => (
              <li key={bone.tempId}>
                {bone.name} - {t(CATEGORY_LABEL_KEYS[bone.partCategory])}
              </li>
            ))}
          </ul>
          <h4>
            {t("autoSetup.parameters")} ({result.boneResult.parameters.length}
            {t("autoSetup.parameterCountUnit")})
          </h4>
          <ul className="auto-setup-list">
            {result.boneResult.parameters.map((p) => (
              <li key={p.name}>
                {p.name} [{p.minValue}..{p.maxValue}]
              </li>
            ))}
          </ul>
        </div>
      )}
      {result.meshResults.length > 0 && (
        <div className="auto-setup-section">
          <h4>
            {t("autoSetup.meshes")} ({result.meshResults.length}
            {t("autoSetup.layersUnit")})
          </h4>
          <ul className="auto-setup-list">
            {result.meshResults.map((mr) => (
              <li key={mr.layerId}>
                {mr.layerName} - {mr.mesh.vertices.length / 2}
                {t("autoSetup.verticesUnit")} {mr.mesh.indices.length / 3}
                {t("autoSetup.trianglesUnit")}
              </li>
            ))}
          </ul>
        </div>
      )}
      {result.weightResults.length > 0 && (
        <div className="auto-setup-section">
          <h4>
            {t("autoSetup.weights")} ({result.weightResults.length}
            {t("autoSetup.layersUnit")})
          </h4>
          <p className="auto-setup-weight-info">
            {hasBbwReviewGate
              ? t("autoSetup.bbwReviewGate")
              : t("autoSetup.weightSolverInfo")}
          </p>
        </div>
      )}
      {result.layerGraph && (
        <div className="auto-setup-section">
          <h4>{t("autoSetup.layerGraphReview")}</h4>
          <div className="auto-setup-cleanup-stats">
            <div>
              <strong>{result.layerGraph.nodes.length}</strong>
              <span>{t("autoSetup.layerGraphNodes")}</span>
            </div>
            <div>
              <strong>{result.layerGraph.occlusionEdges.length}</strong>
              <span>{t("autoSetup.layerGraphOcclusionEdges")}</span>
            </div>
            <div>
              <strong>
                {
                  result.layerGraph.quality.gateResults.filter(
                    (gate) => gate.status === "fail",
                  ).length
                }
              </strong>
              <span>{t("autoSetup.layerGraphBlockingGates")}</span>
            </div>
          </div>
          <ul className="auto-setup-list">
            {result.layerGraph.quality.gateResults.map((gate) => (
              <li key={gate.id}>
                {formatGateId(t, gate.id)}: {formatGateStatus(t, gate.status)}
              </li>
            ))}
          </ul>
          {result.auditTrace && (
            <p className="auto-setup-weight-info">
              {t("autoSetup.auditTraceReady")} {shortHash(result.auditTrace.safePlanHash)}
            </p>
          )}
        </div>
      )}
      <AutoSetupMotionReviewPanel
        onResultChange={onResultChange}
        previewBounds={previewBounds}
        result={result}
        reviewPanelModel={reviewPanelModel}
      />
      {result.motionRiskReport?.layerReports.length ? (
        <div className="auto-setup-section">
          <h4>{t("autoSetup.motionRisk")}</h4>
          <p className="auto-setup-weight-info">
            {t("autoSetup.motionRiskDescription")}
          </p>
          <ul className="auto-setup-list">
            {result.motionRiskReport.layerReports.map((report) => (
              <li key={report.layerId}>
                {report.layerName} - {t("autoSetup.riskScore")}{" "}
                {(report.riskScore * 100).toFixed(0)}% /{" "}
                {t("autoSetup.motionScale")}{" "}
                {(report.motionScale * 100).toFixed(0)}%
                {report.reasons.length > 0 ? ` (${report.reasons.join(", ")})` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {result.occlusionCleanupReport?.pairReports.length ? (
        <div className="auto-setup-section auto-setup-cleanup-report">
          <h4>{t("autoSetup.occlusionCleanupReport")}</h4>
          <p className="auto-setup-weight-info">
            {t("autoSetup.occlusionCleanupDescription")}
          </p>
          <div className="auto-setup-cleanup-stats">
            <div>
              <strong>{result.occlusionCleanupReport.pairCount}</strong>
              <span>{t("autoSetup.cleanupPairs")}</span>
            </div>
            <div>
              <strong>{result.occlusionCleanupReport.foregroundLayerCount}</strong>
              <span>{t("autoSetup.cleanupForegrounds")}</span>
            </div>
            <div>
              <strong>{percent(result.occlusionCleanupReport.maxCleanupScore)}</strong>
              <span>{t("autoSetup.cleanupMaxStrength")}</span>
            </div>
          </div>
          <ul className="auto-setup-cleanup-list">
            {result.occlusionCleanupReport.pairReports.slice(0, 6).map((report) => (
              <li key={`${report.foregroundLayerId}:${report.lowerLayerId}`}>
                <div className="auto-setup-cleanup-row">
                  <div>
                    <strong>
                      {report.foregroundLayerName}
                      {" -> "}
                      {report.lowerLayerName}
                    </strong>
                    <span>
                      {report.operations
                        .map((operation) => formatCleanupOperation(t, operation))
                        .join(" / ")}
                    </span>
                  </div>
                  <em>{percent(report.cleanupScore)}</em>
                </div>
                <div
                  className="auto-setup-cleanup-meter"
                  aria-label={`${t("autoSetup.cleanupStrength")} ${percent(
                    report.cleanupScore,
                  )}`}
                >
                  <span style={{ width: percent(report.cleanupScore) }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {result.physicsGroups.length > 0 && (
        <div className="auto-setup-section">
          <h4>
            {t("autoSetup.physicsGroups")} ({result.physicsGroups.length}
            {t("autoSetup.groupCountUnit")})
          </h4>
          <ul className="auto-setup-list">
            {result.physicsGroups.map((pg) => (
              <li key={pg.name}>
                {pg.name} - {t("autoSetup.stiffness")}
                {pg.stiffness.toFixed(2)} {t("autoSetup.gravity")}
                {pg.gravity.toFixed(2)} {t("autoSetup.damping")}
                {pg.damping.toFixed(2)}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="auto-setup-actions">
        <button type="button" className="modal-btn" onClick={onBack}>
          {t("autoSetup.back")}
        </button>
        <button
          type="button"
          className="modal-btn modal-btn-primary"
          onClick={onApply}
          disabled={isApplying}
          aria-busy={isApplying}
        >
          {t("common.apply")}
        </button>
      </div>
    </div>
  );
}
