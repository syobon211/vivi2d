import {
  AUTO_SETUP_BBW_REVIEW_GATE_DIAGNOSTIC,
  type AutoSetupResult,
} from "@/lib/auto-setup";
import { useT } from "@/lib/i18n";
import type { QualityGateStatus } from "@vivi2d/editor-core/layer-graph";
import type { AutoSetupReviewPanelModel } from "../AutoSetupMotionSuggestionHelpers";
import {
  shortHash,
  toMapPercent,
  type PreviewBounds,
} from "./AutoSetupPreviewUtils";

interface Props {
  result: AutoSetupResult;
  reviewPanelModel: AutoSetupReviewPanelModel;
  previewBounds: PreviewBounds | null;
}

export function AutoSetupPreviewDebugPanel({
  result,
  reviewPanelModel,
  previewBounds,
}: Props) {
  const t = useT();
  const operationCounts = reviewPanelModel.operationCounts;
  const skinModeCounts = reviewPanelModel.skinModeCounts;
  const hasBbwReviewGate =
    result.plan?.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === AUTO_SETUP_BBW_REVIEW_GATE_DIAGNOSTIC.code &&
        diagnostic.path?.startsWith(
          AUTO_SETUP_BBW_REVIEW_GATE_DIAGNOSTIC.pathPrefix,
        ) === true,
    ) ?? false;
  const blockedBbwCount =
    result.plan?.diagnostics.filter(
      (diagnostic) =>
        diagnostic.code === AUTO_SETUP_BBW_REVIEW_GATE_DIAGNOSTIC.code &&
        diagnostic.path?.startsWith(
          AUTO_SETUP_BBW_REVIEW_GATE_DIAGNOSTIC.pathPrefix,
        ) === true,
    ).length ?? 0;
  const gateStatusCounts: Partial<Record<QualityGateStatus, number>> =
    result.layerGraph?.quality.gateResults.reduce<Partial<Record<QualityGateStatus, number>>>(
      (counts, gate) => ({
        ...counts,
        [gate.status]: (counts[gate.status] ?? 0) + 1,
      }),
      {},
    ) ?? {};
  const auditAcceptedNodeCount = result.auditTrace?.acceptedNodeIds.length ?? 0;
  const auditRejectedNodeCount = result.auditTrace?.rejectedNodeIds.length ?? 0;
  const auditOperationCount = result.auditTrace?.operationTrace.length ?? 0;
  const motionHandleRegions = result.motionHandleDraft?.regions ?? [];
  const motionHandleCount = result.motionHandleDraft?.handles.length ?? 0;
  const motionHandleProtectedCount = motionHandleRegions.filter(
    (region) => region.protected,
  ).length;
  const motionHandleMovingCount = motionHandleRegions.filter(
    (region) =>
      region.protected === false &&
      (region.riggingHint === "localBones" ||
        region.riggingHint === "skinned" ||
        region.riggingHint === "physics"),
  ).length;
  const meshLayerNameById = new Map(
    result.meshResults.map((mesh) => [mesh.layerId, mesh.layerName]),
  );
  const targetLayerIds = [
    ...new Set([
      ...result.meshResults.map((mesh) => mesh.layerId),
      ...result.weightResults.map((weight) => weight.layerId),
    ]),
  ];
  const targetLayerLabels = targetLayerIds
    .slice(0, 6)
    .map((layerId) => meshLayerNameById.get(layerId) ?? layerId);
  const hiddenTargetLayerCount = Math.max(0, targetLayerIds.length - 6);
  const visibleDetectedParts = result.detectedParts.slice(0, 10);
  const visibleBones = result.boneResult?.bones.slice(0, 12) ?? [];
  const bonesByTempId = new Map(
    (result.boneResult?.bones ?? []).map((bone) => [bone.tempId, bone]),
  );

  return (
    <div className="auto-setup-section auto-setup-debug-panel">
      <div className="auto-setup-debug-header">
        <div>
          <h4>{t("autoSetup.debugTitle")}</h4>
          <p>{t("autoSetup.debugDescription")}</p>
        </div>
        <span className="auto-setup-debug-badge">{t("autoSetup.debugBadge")}</span>
      </div>
      <div className="auto-setup-debug-flow" aria-label={t("autoSetup.debugFlowAria")}>
        <div className="auto-setup-debug-flow-step">
          <span>01</span>
          <strong>{t("autoSetup.debugFlowLayerGraph")}</strong>
          <em>
            {(result.layerGraph?.nodes.length ?? 0).toString()}{" "}
            {t("autoSetup.layerGraphNodes")}
          </em>
        </div>
        <div className="auto-setup-debug-flow-step">
          <span>02</span>
          <strong>{t("autoSetup.debugFlowSafetyGates")}</strong>
          <em>
            {gateStatusCounts.pass ?? 0} {t("autoSetup.gateStatus.pass")} /{" "}
            {gateStatusCounts.warning ?? 0} {t("autoSetup.gateStatus.warning")} /{" "}
            {gateStatusCounts.fail ?? 0} {t("autoSetup.gateStatus.fail")}
          </em>
        </div>
        <div className="auto-setup-debug-flow-step">
          <span>03</span>
          <strong>{t("autoSetup.debugFlowSafePlan")}</strong>
          <em>
            {result.plan?.operations.length ?? 0} {t("autoSetup.debugAuditOperations")}
          </em>
        </div>
        <div className="auto-setup-debug-flow-step">
          <span>04</span>
          <strong>{t("autoSetup.debugFlowAudit")}</strong>
          <em>
            {auditAcceptedNodeCount} / {auditRejectedNodeCount}{" "}
            {t("autoSetup.debugAuditNodes")}
          </em>
        </div>
        <div className="auto-setup-debug-flow-step">
          <span>05</span>
          <strong>{t("autoSetup.debugFlowMotionHandles")}</strong>
          <em>
            {motionHandleMovingCount} / {motionHandleRegions.length}{" "}
            {t("autoSetup.motionRegions")}
          </em>
        </div>
      </div>
      <div className="auto-setup-debug-grid">
        <div className="auto-setup-debug-card">
          <span>{t("autoSetup.debugGeneratedBones")}</span>
          <strong>{operationCounts.addBone ?? 0}</strong>
          <em>{t("autoSetup.debugFromSafePlan")}</em>
        </div>
        <div className="auto-setup-debug-card">
          <span>{t("autoSetup.debugTargetLayers")}</span>
          <strong>{targetLayerIds.length}</strong>
          <em>{targetLayerLabels.join(" / ") || t("autoSetup.debugNoTargets")}</em>
          {hiddenTargetLayerCount > 0 && (
            <em>
              {t("autoSetup.debugMoreTargets").replace(
                "{count}",
                String(hiddenTargetLayerCount),
              )}
            </em>
          )}
        </div>
        <div className="auto-setup-debug-card">
          <span>{t("autoSetup.debugSkinSolvers")}</span>
          <strong>{operationCounts.createSkin ?? 0}</strong>
          <div className="auto-setup-debug-chips">
            <span>
              {t("autoSetup.debugSolverRigid")} {skinModeCounts.rigidLayer ?? 0}
            </span>
            <span>
              {t("autoSetup.debugSolverSecondary")}{" "}
              {skinModeCounts.secondaryMotion ?? 0}
            </span>
            <span>
              {t("autoSetup.debugSolverBbw")} {skinModeCounts.bbw ?? 0}
            </span>
          </div>
        </div>
        <div className="auto-setup-debug-card auto-setup-debug-card-warning">
          <span>{t("autoSetup.debugBlockedBbw")}</span>
          <strong>{blockedBbwCount}</strong>
          <em>
            {hasBbwReviewGate
              ? t("autoSetup.debugBbwHeld")
              : t("autoSetup.debugBbwClear")}
          </em>
        </div>
        <div className="auto-setup-debug-card">
          <span>{t("autoSetup.motionHandles")}</span>
          <strong>{motionHandleCount}</strong>
          <em>
            {motionHandleProtectedCount} {t("autoSetup.motionProtectedRegions")}
          </em>
        </div>
      </div>
      <div className="auto-setup-debug-watermark">
        <span>{t("autoSetup.debugVisibleChange")}</span>
      </div>
      {previewBounds && (
        <DebugMap
          bonesByTempId={bonesByTempId}
          previewBounds={previewBounds}
          visibleBones={visibleBones}
          visibleDetectedParts={visibleDetectedParts}
        />
      )}
      {result.auditTrace && (
        <div className="auto-setup-debug-trace">
          <div>
            <span>{t("autoSetup.debugAuditHash")}</span>
            <code>{shortHash(result.auditTrace.safePlanHash)}</code>
          </div>
          <div>
            <span>{t("autoSetup.debugAuditNodes")}</span>
            <code>
              {result.auditTrace.acceptedNodeIds.length} /{" "}
              {result.auditTrace.rejectedNodeIds.length}
            </code>
          </div>
          <div>
            <span>{t("autoSetup.debugAuditOperations")}</span>
            <code>{auditOperationCount}</code>
          </div>
        </div>
      )}
    </div>
  );
}

interface DebugMapProps {
  bonesByTempId: Map<string, NonNullable<AutoSetupResult["boneResult"]>["bones"][number]>;
  previewBounds: PreviewBounds;
  visibleBones: NonNullable<AutoSetupResult["boneResult"]>["bones"];
  visibleDetectedParts: AutoSetupResult["detectedParts"];
}

function DebugMap({
  bonesByTempId,
  previewBounds,
  visibleBones,
  visibleDetectedParts,
}: DebugMapProps) {
  const t = useT();

  return (
    <div className="auto-setup-debug-map">
      <div className="auto-setup-debug-map-copy">
        <strong>{t("autoSetup.debugMapTitle")}</strong>
        <span>{t("autoSetup.debugMapDescription")}</span>
      </div>
      <div className="auto-setup-debug-map-canvas">
        <svg
          aria-hidden="true"
          className="auto-setup-debug-map-svg"
          preserveAspectRatio="none"
          viewBox={`${previewBounds.minX} ${previewBounds.minY} ${previewBounds.width} ${previewBounds.height}`}
        >
          <rect
            className="auto-setup-debug-map-frame"
            height={previewBounds.height}
            width={previewBounds.width}
            x={previewBounds.minX}
            y={previewBounds.minY}
          />
          {visibleDetectedParts.map((part) => (
            <rect
              className="auto-setup-debug-map-part"
              height={Math.max(1, part.bounds.height)}
              key={part.layerId}
              width={Math.max(1, part.bounds.width)}
              x={part.bounds.x}
              y={part.bounds.y}
            />
          ))}
          {visibleBones.map((bone) => {
            if (bone.parentTempId == null || bone.parentTempId === "") return null;
            const parent = bonesByTempId.get(bone.parentTempId);
            if (!parent) return null;
            return (
              <line
                className="auto-setup-debug-map-bone-link"
                key={`${parent.tempId}:${bone.tempId}`}
                x1={parent.x}
                x2={bone.x}
                y1={parent.y}
                y2={bone.y}
              />
            );
          })}
          {visibleBones.map((bone) => (
            <circle
              className="auto-setup-debug-map-bone"
              cx={bone.x}
              cy={bone.y}
              key={bone.tempId}
              r={Math.max(previewBounds.width, previewBounds.height) * 0.012}
            />
          ))}
        </svg>
        <div className="auto-setup-debug-map-labels">
          {visibleDetectedParts.slice(0, 6).map((part) => (
            <span
              className="auto-setup-debug-map-label auto-setup-debug-map-label-part"
              key={part.layerId}
              style={{
                left: `${toMapPercent(
                  part.bounds.x,
                  previewBounds.minX,
                  previewBounds.width,
                )}%`,
                top: `${toMapPercent(
                  part.bounds.y,
                  previewBounds.minY,
                  previewBounds.height,
                )}%`,
              }}
            >
              {part.layerName}
            </span>
          ))}
          {visibleBones.slice(0, 6).map((bone) => (
            <span
              className="auto-setup-debug-map-label auto-setup-debug-map-label-bone"
              key={bone.tempId}
              style={{
                left: `${toMapPercent(
                  bone.x,
                  previewBounds.minX,
                  previewBounds.width,
                )}%`,
                top: `${toMapPercent(
                  bone.y,
                  previewBounds.minY,
                  previewBounds.height,
                )}%`,
              }}
            >
              {bone.name}
            </span>
          ))}
        </div>
      </div>
      <div className="auto-setup-debug-map-legend">
        <span>{t("autoSetup.debugMapParts")}</span>
        <span>{t("autoSetup.debugMapBones")}</span>
      </div>
    </div>
  );
}
