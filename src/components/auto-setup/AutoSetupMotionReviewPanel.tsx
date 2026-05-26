import { useState } from "react";
import type { AutoSetupResult } from "@/lib/auto-setup";
import { useT } from "@/lib/i18n";
import {
  formatMotionQualityGateId,
  formatMotionStressAction,
  formatMotionSuggestionConfidence,
  formatMotionSuggestionSource,
  formatMotionSuggestionStatus,
  formatMotionSuggestionWarning,
  summarizeMotionSuggestions,
  type AutoSetupReviewPanelModel,
} from "../AutoSetupMotionSuggestionHelpers";
import {
  clamp,
  formatGateStatus,
  type PreviewBounds,
} from "./AutoSetupPreviewUtils";

interface Props {
  result: AutoSetupResult;
  reviewPanelModel: AutoSetupReviewPanelModel;
  previewBounds: PreviewBounds | null;
  onResultChange?: (result: AutoSetupResult) => void;
}

type MotionHandleQuality = NonNullable<
  AutoSetupResult["motionHandleDraft"]
>["quality"];

export function resetMotionHandleQuality(quality: MotionHandleQuality) {
  return {
    status: "notRun" as const,
    gates: quality.gates.map((gate) => ({
      id: gate.id,
      status: "notRun" as const,
    })),
  };
}

export function AutoSetupMotionReviewPanel({
  result,
  reviewPanelModel,
  previewBounds,
  onResultChange,
}: Props) {
  const t = useT();
  const [selectedHandleId, setSelectedHandleId] = useState<string | null>(null);
  const motionHandleRegions = result.motionHandleDraft?.regions ?? [];
  const motionHandleRegionById = new Map(
    motionHandleRegions.map((region) => [region.id, region]),
  );
  const motionHandleCount = result.motionHandleDraft?.handles.length ?? 0;
  const motionHandleProtectedCount = motionHandleRegions.filter(
    (region) => region.protected,
  ).length;
  const motionSuggestionSummary = summarizeMotionSuggestions(motionHandleRegions);
  const safeOperationSummary = reviewPanelModel.safeOperations;
  const discardedPreviewCategories = reviewPanelModel.discardedPreviewCategories;
  const editableMotionHandles =
    result.motionHandleDraft?.handles.filter((handle) => {
      const region = motionHandleRegionById.get(handle.regionId);
      return (
        handle.kind === "bone" &&
        region &&
        region.protected === false &&
        region.riggingHint !== "rigid"
      );
    }) ?? [];
  const selectedHandle =
    editableMotionHandles.find((handle) => handle.id === selectedHandleId) ??
    editableMotionHandles[0] ??
    null;
  const selectedHandleRegion = selectedHandle
    ? motionHandleRegionById.get(selectedHandle.regionId) ?? null
    : null;

  const updateSelectedHandle = (axis: "x" | "y", value: number) => {
    if (result.motionHandleDraft == null || !selectedHandle || !selectedHandleRegion) {
      return;
    }
    const min = axis === "x" ? selectedHandleRegion.bounds.x : selectedHandleRegion.bounds.y;
    const max =
      axis === "x"
        ? selectedHandleRegion.bounds.x + selectedHandleRegion.bounds.width
        : selectedHandleRegion.bounds.y + selectedHandleRegion.bounds.height;
    const nextValue = clamp(value, min, max);
    const nextHandles = result.motionHandleDraft.handles.map((handle) =>
      handle.id === selectedHandle.id
        ? {
            ...handle,
            anchor: {
              ...handle.anchor,
              [axis]: nextValue,
            },
          }
        : handle,
    );
    onResultChange?.({
      ...result,
      motionHandleDraft: {
        ...result.motionHandleDraft,
        handles: nextHandles,
        generation: result.motionHandleDraft.generation + 1,
        quality: resetMotionHandleQuality(result.motionHandleDraft.quality),
      },
    });
  };

  if (motionHandleRegions.length === 0) return null;

  return (
    <div className="auto-setup-section">
      <h4>{t("autoSetup.motionHandleReview")}</h4>
      <p className="auto-setup-weight-info">
        {t("autoSetup.motionHandleDescription")}
      </p>
      <div className="auto-setup-cleanup-stats">
        <div>
          <strong>{motionHandleRegions.length}</strong>
          <span>{t("autoSetup.motionRegions")}</span>
        </div>
        <div>
          <strong>{motionHandleCount}</strong>
          <span>{t("autoSetup.motionHandles")}</span>
        </div>
        <div>
          <strong>{motionHandleProtectedCount}</strong>
          <span>{t("autoSetup.motionProtectedRegions")}</span>
        </div>
        <div>
          <strong>
            {motionSuggestionSummary.counts.apply} / {motionSuggestionSummary.counts.review}
          </strong>
          <span>{t("autoSetup.motionSuggestionStats")}</span>
        </div>
        <div>
          <strong>{motionSuggestionSummary.warningCount}</strong>
          <span>{t("autoSetup.motionSuggestionWarnings")}</span>
        </div>
      </div>
      <div
        className="as-review auto-setup-motion-safe-summary"
        data-testid="auto-setup-motion-safe-summary"
        aria-live="polite"
      >
        <strong>{t("autoSetup.safeOperationsSummary")}</strong>
        <div className="auto-setup-debug-chips">
          {safeOperationSummary.map((operation) => (
            <span key={operation.id}>
              {t(`autoSetup.safeOperation.${operation.id}`)} {operation.count}
            </span>
          ))}
        </div>
        <strong>{t("autoSetup.discardedPreviewCategories")}</strong>
        <div className="auto-setup-debug-chips">
          {discardedPreviewCategories.map((category) => (
            <span key={category}>
              {t(`autoSetup.discardedPreviewCategory.${category}`)}
            </span>
          ))}
        </div>
        <strong>{t("autoSetup.motionStressChecks")}</strong>
        <div className="auto-setup-debug-chips">
          {reviewPanelModel.stressChecks.map((gate) => (
            <span key={gate.id}>
              {formatMotionQualityGateId(t, gate.id)}:{" "}
              {formatGateStatus(t, gate.status)} -{" "}
              {formatMotionStressAction(t, gate.id, gate.status)}
            </span>
          ))}
        </div>
        <strong>{t("autoSetup.cleanupComparisonTitle")}</strong>
        <div className="auto-setup-debug-chips">
          {reviewPanelModel.cleanupComparisons.map((comparison) => (
            <span key={comparison.id}>
              {t(`autoSetup.cleanupComparison.${comparison.id}`)}:{" "}
              {t(`autoSetup.cleanupComparisonStatus.${comparison.status}`)}
            </span>
          ))}
        </div>
      </div>
      <ul className="auto-setup-list">
        {motionHandleRegions.slice(0, 8).map((region) => {
          const suggestion = region.handleSuggestion;
          return (
            <li key={region.id}>
              <div className="auto-setup-cleanup-row">
                <span>
                  {region.semanticRole} - {region.riggingHint}
                  {region.protected ? ` / ${t("autoSetup.motionProtected")}` : ""}
                </span>
                {suggestion && (
                  <strong>
                    {formatMotionSuggestionStatus(t, suggestion.status)} /{" "}
                    {formatMotionSuggestionConfidence(t, suggestion.confidence)}
                  </strong>
                )}
              </div>
              {suggestion && (
                <div className="auto-setup-debug-chips">
                  <span>{formatMotionSuggestionSource(t, region)}</span>
                  {suggestion.warnings.slice(0, 3).map((warning) => (
                    <span key={warning}>
                      {formatMotionSuggestionWarning(t, warning)}
                    </span>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <MotionHandleEditor
        editableMotionHandles={editableMotionHandles}
        motionHandleRegionById={motionHandleRegionById}
        previewBounds={previewBounds}
        result={result}
        selectedHandle={selectedHandle}
        selectedHandleRegion={selectedHandleRegion}
        setSelectedHandleId={setSelectedHandleId}
        updateSelectedHandle={updateSelectedHandle}
      />
      <p className="auto-setup-weight-info">{t("autoSetup.motionDiscardNote")}</p>
    </div>
  );
}

type MotionHandle = NonNullable<AutoSetupResult["motionHandleDraft"]>["handles"][number];
type MotionRegion = NonNullable<AutoSetupResult["motionHandleDraft"]>["regions"][number];

interface MotionHandleEditorProps {
  editableMotionHandles: readonly MotionHandle[];
  motionHandleRegionById: Map<string, MotionRegion>;
  previewBounds: PreviewBounds | null;
  result: AutoSetupResult;
  selectedHandle: MotionHandle | null;
  selectedHandleRegion: MotionRegion | null;
  setSelectedHandleId: (id: string) => void;
  updateSelectedHandle: (axis: "x" | "y", value: number) => void;
}

function MotionHandleEditor({
  editableMotionHandles,
  motionHandleRegionById,
  previewBounds,
  result,
  selectedHandle,
  selectedHandleRegion,
  setSelectedHandleId,
  updateSelectedHandle,
}: MotionHandleEditorProps) {
  const t = useT();

  return (
    <div className="auto-setup-motion-editor">
      <div className="auto-setup-motion-editor-header">
        <strong>{t("autoSetup.motionHandleEditor")}</strong>
        <span>{t("autoSetup.motionHandleEditorDescription")}</span>
      </div>
      {editableMotionHandles.length > 0 && previewBounds ? (
        <>
          <div className="auto-setup-motion-map">
            <svg
              aria-label={t("autoSetup.motionHandleMap")}
              className="auto-setup-motion-map-svg"
              preserveAspectRatio="none"
              viewBox={`${previewBounds.minX} ${previewBounds.minY} ${previewBounds.width} ${previewBounds.height}`}
            >
              {result.motionHandleDraft?.regions.map((region) => (
                <rect
                  className={`auto-setup-motion-region${
                    region.protected ? " auto-setup-motion-region-protected" : ""
                  }`}
                  height={Math.max(1, region.bounds.height)}
                  key={region.id}
                  width={Math.max(1, region.bounds.width)}
                  x={region.bounds.x}
                  y={region.bounds.y}
                />
              ))}
              {result.motionHandleDraft?.regions.map((region) => {
                const suggestion = region.handleSuggestion;
                if (
                  !suggestion ||
                  suggestion.status === "apply" ||
                  suggestion.status === "rejected" ||
                  suggestion.tip == null
                ) {
                  return null;
                }
                return (
                  <line
                    className="auto-setup-motion-link"
                    key={`${region.id}:suggestion`}
                    x1={suggestion.root.x}
                    x2={suggestion.tip.x}
                    y1={suggestion.root.y}
                    y2={suggestion.tip.y}
                  />
                );
              })}
              {result.motionHandleDraft?.handles.map((handle) => {
                const parent = result.motionHandleDraft?.handles.find(
                  (candidate) => candidate.id === handle.parentHandleId,
                );
                if (!parent) return null;
                return (
                  <line
                    className="auto-setup-motion-link"
                    key={`${parent.id}:${handle.id}`}
                    x1={parent.anchor.x}
                    x2={handle.anchor.x}
                    y1={parent.anchor.y}
                    y2={handle.anchor.y}
                  />
                );
              })}
              {result.motionHandleDraft?.handles.map((handle) => {
                const region = motionHandleRegionById.get(handle.regionId);
                const editable =
                  handle.kind === "bone" &&
                  region &&
                  region.protected === false &&
                  region.riggingHint !== "rigid";
                return (
                  <circle
                    className={`auto-setup-motion-handle${
                      handle.id === selectedHandle?.id
                        ? " auto-setup-motion-handle-selected"
                        : ""
                    }${editable ? "" : " auto-setup-motion-handle-locked"}`}
                    cx={handle.anchor.x}
                    cy={handle.anchor.y}
                    key={handle.id}
                    r={Math.max(previewBounds.width, previewBounds.height) * 0.014}
                  />
                );
              })}
            </svg>
          </div>
          <div className="auto-setup-motion-controls">
            <label>
              <span>{t("autoSetup.motionSelectedHandle")}</span>
              <select
                value={selectedHandle?.id ?? ""}
                onChange={(event) => setSelectedHandleId(event.target.value)}
              >
                {editableMotionHandles.map((handle) => (
                  <option key={handle.id} value={handle.id}>
                    {handle.name} / {handle.semantic}
                  </option>
                ))}
              </select>
            </label>
            {selectedHandle && selectedHandleRegion && (
              <>
                <label>
                  <span>{t("autoSetup.motionHandleX")}</span>
                  <input
                    min={selectedHandleRegion.bounds.x}
                    max={
                      selectedHandleRegion.bounds.x +
                      selectedHandleRegion.bounds.width
                    }
                    step={1}
                    type="range"
                    value={selectedHandle.anchor.x}
                    onChange={(event) =>
                      updateSelectedHandle("x", Number(event.target.value))
                    }
                  />
                </label>
                <label>
                  <span>{t("autoSetup.motionHandleY")}</span>
                  <input
                    min={selectedHandleRegion.bounds.y}
                    max={
                      selectedHandleRegion.bounds.y +
                      selectedHandleRegion.bounds.height
                    }
                    step={1}
                    type="range"
                    value={selectedHandle.anchor.y}
                    onChange={(event) =>
                      updateSelectedHandle("y", Number(event.target.value))
                    }
                  />
                </label>
              </>
            )}
          </div>
        </>
      ) : (
        <p className="auto-setup-weight-info">
          {t("autoSetup.motionNoEditableHandles")}
        </p>
      )}
    </div>
  );
}
