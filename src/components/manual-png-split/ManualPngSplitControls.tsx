import type { LayerSemanticRole } from "@vivi2d/core/types";
import type { Dispatch, SetStateAction } from "react";
import {
  MANUAL_PNG_SPLIT_PARTS,
  type ManualPngSplitPartId,
} from "@/lib/manual-png-layer-split";
import type { LassoSmoothingStrength } from "@/lib/manual-layer-split/lasso-smoothing";
import { useT } from "@/lib/i18n";
import type { ManualMaskWorkerOperation } from "@/workers/manual-mask.worker";
import type {
  MaskCountState,
  PaintMode,
  PartNameState,
  SplitTool,
} from "../manual-png-split-dialog-utils";

interface Props {
  activePartId: ManualPngSplitPartId;
  applyActiveMaskWorkerOperation: (operation: ManualMaskWorkerOperation) => void;
  brushSize: number;
  clearActiveMask: () => void;
  clearAllMasks: () => void;
  effectiveLassoSmoothing: LassoSmoothingStrength;
  filledMaskCount: number;
  hasOverlap: boolean;
  isDrawingStroke: boolean;
  isMaskBusy: boolean;
  lassoPrecision: boolean;
  lassoSmoothing: LassoSmoothingStrength;
  lassoWarningMessage: string;
  maskCounts: MaskCountState;
  paintMode: PaintMode;
  partNames: PartNameState;
  redoMaskEdit: () => void;
  redoStackLength: number;
  refineRadius: number;
  resolveActiveOverlap: () => void;
  roleLabel: (role: LayerSemanticRole) => string;
  setActivePartId: (partId: ManualPngSplitPartId) => void;
  setBrushSize: (size: number) => void;
  setLassoPrecision: (enabled: boolean) => void;
  setLassoSmoothing: (strength: LassoSmoothingStrength) => void;
  setPaintMode: (mode: PaintMode) => void;
  setPartNames: Dispatch<SetStateAction<PartNameState>>;
  setRefineRadius: (radius: number) => void;
  setShowSource: (enabled: boolean) => void;
  setShowStressPreview: (enabled: boolean) => void;
  setStressOffset: (offset: number) => void;
  setTool: (tool: SplitTool) => void;
  setWandTolerance: (tolerance: number) => void;
  showSource: boolean;
  showStressPreview: boolean;
  sourceLayerName: string;
  stressOffset: number;
  tool: SplitTool;
  undoMaskEdit: () => void;
  undoStackLength: number;
  wandTolerance: number;
}

export function ManualPngSplitControls({
  activePartId,
  applyActiveMaskWorkerOperation,
  brushSize,
  clearActiveMask,
  clearAllMasks,
  effectiveLassoSmoothing,
  filledMaskCount,
  hasOverlap,
  isDrawingStroke,
  isMaskBusy,
  lassoPrecision,
  lassoSmoothing,
  lassoWarningMessage,
  maskCounts,
  paintMode,
  partNames,
  redoMaskEdit,
  redoStackLength,
  refineRadius,
  resolveActiveOverlap,
  roleLabel,
  setActivePartId,
  setBrushSize,
  setLassoPrecision,
  setLassoSmoothing,
  setPaintMode,
  setPartNames,
  setRefineRadius,
  setShowSource,
  setShowStressPreview,
  setStressOffset,
  setTool,
  setWandTolerance,
  showSource,
  showStressPreview,
  sourceLayerName,
  stressOffset,
  tool,
  undoMaskEdit,
  undoStackLength,
  wandTolerance,
}: Props) {
  const t = useT();

  const runMaskOperation = (operation: ManualMaskWorkerOperation) => {
    applyActiveMaskWorkerOperation(operation);
  };

  return (
    <aside className="manual-png-split-controls">
      <div className="manual-png-split-source">
        <span>{t("manualPngSplit.sourceLayer")}</span>
        <strong>{sourceLayerName}</strong>
      </div>
      <div className="manual-png-split-tool-card">
        <strong>{t("manualPngSplit.reviewTitle")}</strong>
        <p className="manual-png-split-help">
          {filledMaskCount < 2
            ? t("manualPngSplit.reviewNeedMasks")
            : hasOverlap
              ? t("manualPngSplit.reviewOverlap")
              : t("manualPngSplit.reviewReady")}
        </p>
      </div>

      <div className="manual-png-split-tool-card">
        <label className="manual-png-split-check">
          <input
            checked={showSource}
            onChange={(event) => setShowSource(event.target.checked)}
            type="checkbox"
          />
          {t("manualPngSplit.showSource")}
        </label>
        <label className="manual-png-split-check">
          <input
            checked={showStressPreview}
            onChange={(event) => setShowStressPreview(event.target.checked)}
            type="checkbox"
          />
          {t("manualPngSplit.showStressPreview")}
        </label>
        <RangeField
          label={t("manualPngSplit.brushSize")}
          max={120}
          min={8}
          onChange={setBrushSize}
          step={2}
          value={brushSize}
          valueLabel={`${brushSize}px`}
        />
        <RangeField
          label={t("manualPngSplit.stressOffset")}
          max={80}
          min={-80}
          onChange={setStressOffset}
          step={4}
          value={stressOffset}
          valueLabel={`${stressOffset}px`}
        />
        <div className="manual-png-split-button-row">
          <ModeButton
            active={tool === "brush"}
            disabled={isDrawingStroke}
            label={t("manualPngSplit.toolBrush")}
            onClick={() => setTool("brush")}
          />
          <ModeButton
            active={tool === "lasso"}
            disabled={isDrawingStroke}
            label={t("manualPngSplit.toolLasso")}
            onClick={() => setTool("lasso")}
          />
          <ModeButton
            active={tool === "wand"}
            disabled={isDrawingStroke}
            label={t("manualPngSplit.toolWand")}
            onClick={() => setTool("wand")}
          />
        </div>
        <label className="manual-png-split-field">
          {t("manualLayerSplit.lassoSmoothing")}
          <select
            className="prop-input"
            disabled={isDrawingStroke}
            onChange={(event) =>
              setLassoSmoothing(event.target.value as LassoSmoothingStrength)
            }
            value={lassoSmoothing}
          >
            {(["off", "low", "medium", "high"] as const).map((strength) => (
              <option key={strength} value={strength}>
                {t(`manualLayerSplit.lassoSmoothing.${strength}`)}
              </option>
            ))}
          </select>
          <span>
            {t(`manualLayerSplit.lassoSmoothing.${effectiveLassoSmoothing}`)}
          </span>
        </label>
        <label className="manual-png-split-check">
          <input
            checked={lassoPrecision}
            disabled={isDrawingStroke}
            onChange={(event) => setLassoPrecision(event.target.checked)}
            type="checkbox"
          />
          {t("manualLayerSplit.lassoPrecision")}
        </label>
        <p aria-live="polite" className="manual-png-split-help">
          {lassoWarningMessage}
        </p>
        <div className="manual-png-split-button-row">
          <ModeButton
            active={paintMode === "add"}
            disabled={isDrawingStroke}
            label={t("manualPngSplit.modeAdd")}
            onClick={() => setPaintMode("add")}
          />
          <ModeButton
            active={paintMode === "subtract"}
            disabled={isDrawingStroke}
            label={t("manualPngSplit.modeSubtract")}
            onClick={() => setPaintMode("subtract")}
          />
          <ModeButton
            active={paintMode === "replace"}
            disabled={isDrawingStroke}
            label={t("manualPngSplit.modeReplace")}
            onClick={() => setPaintMode("replace")}
          />
        </div>
        <RangeField
          label={t("manualPngSplit.refineRadius")}
          max={20}
          min={1}
          onChange={setRefineRadius}
          step={1}
          value={refineRadius}
          valueLabel={`${refineRadius}px`}
        />
        <RangeField
          label={t("manualPngSplit.wandTolerance")}
          max={160}
          min={4}
          onChange={setWandTolerance}
          step={4}
          value={wandTolerance}
          valueLabel={String(wandTolerance)}
        />
        <div className="manual-png-split-button-row">
          <button
            className="modal-btn"
            disabled={isMaskBusy}
            onClick={() => runMaskOperation({ kind: "grow", radius: refineRadius })}
            type="button"
          >
            {t("manualPngSplit.growMask")}
          </button>
          <button
            className="modal-btn"
            disabled={isMaskBusy}
            onClick={() => runMaskOperation({ kind: "shrink", radius: refineRadius })}
            type="button"
          >
            {t("manualPngSplit.shrinkMask")}
          </button>
        </div>
        <div className="manual-png-split-button-row">
          <button
            className="modal-btn"
            disabled={isMaskBusy}
            onClick={() => runMaskOperation({ kind: "feather", radius: refineRadius })}
            type="button"
          >
            {t("manualPngSplit.featherMask")}
          </button>
          <button
            className="modal-btn"
            disabled={isMaskBusy}
            onClick={() =>
              runMaskOperation({
                kind: "fillHoles",
                maxArea: Math.max(4, refineRadius * refineRadius * 4),
              })
            }
            type="button"
          >
            {t("manualPngSplit.fillHoles")}
          </button>
        </div>
        <div className="manual-png-split-button-row">
          <button
            className="modal-btn"
            disabled={isMaskBusy}
            onClick={() =>
              runMaskOperation({
                kind: "removeIslands",
                minArea: Math.max(4, refineRadius * refineRadius * 4),
              })
            }
            type="button"
          >
            {t("manualPngSplit.removeIslands")}
          </button>
          <button
            className="modal-btn"
            disabled={!hasOverlap}
            onClick={resolveActiveOverlap}
            type="button"
          >
            {t("manualPngSplit.resolveOverlap")}
          </button>
        </div>
        <div className="manual-png-split-button-row">
          <button
            className="modal-btn"
            disabled={undoStackLength === 0}
            onClick={undoMaskEdit}
            type="button"
          >
            {t("manualPngSplit.undo")}
          </button>
          <button
            className="modal-btn"
            disabled={redoStackLength === 0}
            onClick={redoMaskEdit}
            type="button"
          >
            {t("manualPngSplit.redo")}
          </button>
        </div>
        <div className="manual-png-split-button-row">
          <button className="modal-btn" onClick={clearActiveMask} type="button">
            {t("manualPngSplit.clearActive")}
          </button>
          <button className="modal-btn" onClick={clearAllMasks} type="button">
            {t("manualPngSplit.clearAll")}
          </button>
        </div>
      </div>

      <div className="manual-png-split-part-list">
        {MANUAL_PNG_SPLIT_PARTS.map((part) => (
          <button
            className={`manual-png-split-part${
              activePartId === part.id ? " manual-png-split-part-active" : ""
            }`}
            key={part.id}
            onClick={() => setActivePartId(part.id)}
            type="button"
          >
            <span
              className="manual-png-split-swatch"
              style={{ background: part.color }}
            />
            <span>
              <strong>{roleLabel(part.role)}</strong>
              <small>
                {maskCounts[part.id]} {t("manualPngSplit.pixels")}
              </small>
            </span>
          </button>
        ))}
      </div>

      <div className="manual-png-split-name-list">
        {MANUAL_PNG_SPLIT_PARTS.map((part) => (
          <label className="manual-png-split-name-row" key={part.id}>
            <span>{roleLabel(part.role)}</span>
            <input
              className="prop-input"
              onChange={(event) =>
                setPartNames((current) => ({
                  ...current,
                  [part.id]: event.target.value,
                }))
              }
              value={partNames[part.id]}
            />
          </label>
        ))}
      </div>
    </aside>
  );
}

interface ModeButtonProps {
  active: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}

function ModeButton({ active, disabled, label, onClick }: ModeButtonProps) {
  return (
    <button
      className={`modal-btn${active ? " modal-btn-primary" : ""}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

interface RangeFieldProps {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step: number;
  value: number;
  valueLabel: string;
}

function RangeField({
  label,
  max,
  min,
  onChange,
  step,
  value,
  valueLabel,
}: RangeFieldProps) {
  return (
    <label className="manual-png-split-field">
      {label}
      <input
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        step={step}
        type="range"
        value={value}
      />
      <span>{valueLabel}</span>
    </label>
  );
}
