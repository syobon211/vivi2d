import { GEOMETRY, type MeshDensityPreset } from "@vivi2d/core/constants";
import type { LayerNode } from "@vivi2d/core/types";
import { useState } from "react";
import { useDefaultFormLock } from "@/hooks/useDefaultFormLock";
import { type I18nKey, useT } from "@/lib/i18n";
import {
  hasImportedReferenceBounds,
  REFERENCE_OVERLAY_COMPARE_PRESETS,
  type ReferenceOverlayBoundsMode,
} from "@/lib/reference-overlay-utils";
import type { SoftRegionPresetId } from "@vivi2d/editor-core/soft-region-helper";
import { useEditorStore } from "@/stores/editorStore";
import { useMeshEditStore } from "@/stores/meshEditStore";
import {
  type PuppetWarpFalloffCurve,
  type PuppetWarpPin,
  usePuppetWarpStore,
} from "@/stores/puppetWarpStore";
import { useSkinStore } from "@/stores/skinStore";
import { useViewportStore } from "@/stores/viewportStore";
import { PropGroup } from "./PropGroup";
import { useMeshPropertiesActions } from "./useMeshPropertiesActions";
import {
  formatSigned,
  useMeshPropertiesDerivedState,
} from "./useMeshPropertiesDerivedState";

const CURVE_OPTIONS: PuppetWarpFalloffCurve[] = ["linear", "smoothstep", "gaussian"];
const EMPTY_PINS: PuppetWarpPin[] = [];
const EMPTY_GROUPS: { id: string; meshId: string; name: string; pinIds: string[] }[] = [];
const SOFT_REGION_PRESETS: SoftRegionPresetId[] = ["cheek", "sleeve", "generic"];

function useReferenceOverlayText() {
  const t = useT();
  return {
    title: t("prop.referenceOverlay.title"),
    enabledAria: t("prop.referenceOverlay.enabledAria"),
    stateEnabled: t("common.enabled"),
    stateDisabled: t("prop.referenceOverlay.stateDisabled"),
    modeLabel: t("prop.referenceOverlay.modeLabel"),
    modeAria: t("prop.referenceOverlay.modeAria"),
    opacityLabel: t("prop.referenceOverlay.opacityLabel"),
    opacityAria: t("prop.referenceOverlay.opacityAria"),
    help: t("prop.referenceOverlay.help"),
    comparePresetLabel: t("prop.referenceOverlay.comparePresetLabel"),
    comparePrimaryLabel: t("prop.referenceOverlay.comparePrimaryLabel"),
    comparePrimaryAria: t("prop.referenceOverlay.comparePrimaryAria"),
    compareSecondaryLabel: t("prop.referenceOverlay.compareSecondaryLabel"),
    compareSecondaryAria: t("prop.referenceOverlay.compareSecondaryAria"),
    compareActionsLabel: t("prop.referenceOverlay.compareActionsLabel"),
    swap: t("prop.referenceOverlay.swap"),
    highlightDifferencesLabel: t("prop.referenceOverlay.highlightDifferencesLabel"),
    highlightDifferencesAria: t("prop.referenceOverlay.highlightDifferencesAria"),
    pinCompareSummaryLabel: t("prop.referenceOverlay.pinCompareSummaryLabel"),
    pinCompareSummaryAria: t("prop.referenceOverlay.pinCompareSummaryAria"),
    statePinned: t("prop.referenceOverlay.statePinned"),
    stateUnpinned: t("prop.referenceOverlay.stateUnpinned"),
    requiresMetadata: t("prop.referenceOverlay.requiresMetadata"),
    importedBoundsHint: t("prop.referenceOverlay.importedBoundsHint"),
    compareSummaryTitle: t("prop.referenceOverlay.compareSummaryTitle"),
    customPair: t("prop.referenceOverlay.customPair"),
    unknownAssessment: t("prop.referenceOverlay.unknownAssessment"),
    pinnedSuffix: t("prop.referenceOverlay.pinnedSuffix"),
    pinSummary: t("prop.referenceOverlay.pinSummary"),
    unpinSummary: t("prop.referenceOverlay.unpinSummary"),
    summaryCenterDrift: t("prop.referenceOverlay.summaryCenterDrift"),
    summaryWidth: t("prop.referenceOverlay.summaryWidth"),
    summaryHeight: t("prop.referenceOverlay.summaryHeight"),
    summaryArea: t("prop.referenceOverlay.summaryArea"),
    summaryOffset: t("prop.referenceOverlay.summaryOffset"),
    summarySize: t("prop.referenceOverlay.summarySize"),
    disabledImportedPresetReason: t(
      "prop.referenceOverlay.disabledImportedPresetReason",
    ),
    modes: {
      source: t("prop.referenceOverlay.mode.source"),
      currentBounds: t("prop.referenceOverlay.mode.currentBounds"),
      importedBounds: t("prop.referenceOverlay.mode.importedBounds"),
      compareBounds: t("prop.referenceOverlay.mode.compareBounds"),
    },
    assessments: {
      aligned: t("prop.referenceOverlay.assessment.aligned"),
      offsetDrift: t("prop.referenceOverlay.assessment.offsetDrift"),
      scaleDrift: t("prop.referenceOverlay.assessment.scaleDrift"),
      offsetAndScaleDrift: t("prop.referenceOverlay.assessment.offsetAndScaleDrift"),
    },
    presets: {
      sourceCurrent: t("prop.referenceOverlay.preset.sourceCurrent"),
      sourceImported: t("prop.referenceOverlay.preset.sourceImported"),
      currentImported: t("prop.referenceOverlay.preset.currentImported"),
    },
  };
}

export function MeshProperties({ layer }: { layer: LayerNode }) {
  const t = useT();
  const project = useEditorStore((state) => state.project);
  const setMeshDivisions = useEditorStore((state) => state.setMeshDivisions);
  const setAutoMesh = useEditorStore((state) => state.setAutoMesh);
  const setMeshData = useEditorStore((state) => state.setMeshData);
  const formLocked = useDefaultFormLock();
  const selectedVertices = useMeshEditStore((state) => state.selectedVertices);
  const clearSelection = useMeshEditStore((state) => state.clearSelection);
  const applyAccessoryFollow = useSkinStore((state) => state.applyAccessoryFollowRig);
  const applySoftRegionHelper = usePuppetWarpStore(
    (state) => state.applySoftRegionHelper,
  );
  const mode = usePuppetWarpStore((state) => state.mode);
  const pins = usePuppetWarpStore((state) => state.pinsByMeshId[layer.id] ?? EMPTY_PINS);
  const groups = usePuppetWarpStore(
    (state) => state.groupsByMeshId[layer.id] ?? EMPTY_GROUPS,
  );
  const selectedPinIds = usePuppetWarpStore((state) => state.selectedPinIds);
  const symmetryEnabled = usePuppetWarpStore((state) => state.symmetryEnabled);
  const symmetryTolerance = usePuppetWarpStore((state) => state.symmetryTolerance);
  const meshHeatmap = useViewportStore((state) => state.meshHeatmap);
  const referenceOverlay = useViewportStore((state) => state.referenceOverlay);
  const [preset, setPreset] = useState<MeshDensityPreset>("standard");
  const [accessoryFollowBoneId, setAccessoryFollowBoneId] = useState("");
  const [softRegionPreset, setSoftRegionPreset] = useState<SoftRegionPresetId>("generic");
  const referenceText = useReferenceOverlayText();
  const presetLabels: Record<MeshDensityPreset, string> = {
    coarse: t("prop.coarse"),
    standard: t("prop.standard"),
    fine: t("prop.fine"),
  };
  const {
    activeReferenceOverlayComparePreset,
    boneOptions,
    effectiveAccessoryFollowBoneId,
    getReferenceAssessmentLabel,
    getReferenceModeLabel,
    getReferencePresetLabel,
    referenceOverlayCompareAssessment,
    referenceOverlayCompareSummary,
    selectedAnchorPins,
    selectedHandlePins,
    selectedPinPrototype,
    selectedPins,
  } = useMeshPropertiesDerivedState({
    layer,
    project,
    pins,
    groups,
    selectedPinIds,
    referenceOverlay,
    accessoryFollowBoneId,
    referenceText,
  });
  const {
    accessoryFollowMessage,
    softRegionMessage,
    handleMerge,
    handleMirrorX,
    handleMirrorY,
    handleRetriangulate,
    handleApplyAccessoryFollow,
    handleApplySoftRegion,
    handleCreateHandlePins,
    handleCreateAnchorPins,
    handleCreateGroup,
    handleDeleteSelectedPins,
    handleUpdateSelectedPins,
  } = useMeshPropertiesActions({
    layer,
    selectedVertices,
    clearSelection,
    setMeshData,
    applyAccessoryFollow,
    effectiveAccessoryFollowBoneId,
    applySoftRegionHelper,
    softRegionPreset,
    groupsLength: groups.length,
    selectedPinIds,
  });

  if (layer.kind !== "viviMesh") return null;

  const vertexCount = layer.mesh.vertices.length / GEOMETRY.COORD_STRIDE;
  const importedReferenceBoundsAvailable = hasImportedReferenceBounds(layer);
  const comparePrimaryMode = referenceOverlay.comparePrimary ?? "currentBounds";
  const compareSecondaryMode = referenceOverlay.compareSecondary ?? "importedBounds";
  const compareUsesImportedBounds =
    comparePrimaryMode === "importedBounds" || compareSecondaryMode === "importedBounds";
  const showPinnedCompareSummary =
    referenceOverlay.pinCompareSummary === true ||
    referenceOverlay.mode === "compareBounds";
  const isAutoMesh = layer.mesh.divisionsX === 0 && layer.mesh.divisionsY === 0;
  return (
    <div className="properties-section">
      <div className="prop-section-title">{t("meshProps.title")}</div>
      <PropGroup label={t("meshProps.vertices")}>{vertexCount}</PropGroup>

      {selectedVertices.length > 0 && (
        <PropGroup label={t("meshProps.selectedVertices")}>
          <span className="mesh-selection-info">{selectedVertices.length}</span>
        </PropGroup>
      )}

      <PropGroup label={t("meshProps.autoMesh")}>
        <div className="prop-row">
          <select
            className="auto-mesh-select"
            value={preset}
            onChange={(event) => setPreset(event.target.value as MeshDensityPreset)}
          >
            {(Object.keys(presetLabels) as MeshDensityPreset[]).map((key) => (
              <option key={key} value={key}>
                {presetLabels[key]}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="auto-mesh-btn"
            disabled={formLocked}
            onClick={() => setAutoMesh(layer.id, preset)}
          >
            {t("meshProps.generate")}
          </button>
        </div>
      </PropGroup>

      <div className="prop-section-title mesh-ops-title">
        {t("meshProps.accessoryFollow")}
      </div>
      <PropGroup label={t("meshProps.targetBone")}>
        <div className="prop-row">
          <select
            aria-label={t("meshProps.accessoryFollowTargetBone")}
            className="auto-mesh-select"
            value={effectiveAccessoryFollowBoneId}
            onChange={(event) => setAccessoryFollowBoneId(event.target.value)}
          >
            {boneOptions.length === 0 ? (
              <option value="">{t("meshProps.noBones")}</option>
            ) : (
              boneOptions.map((bone) => (
                <option key={bone.id} value={bone.id}>
                  {bone.name}
                </option>
              ))
            )}
          </select>
          <button
            type="button"
            className="auto-mesh-btn"
            aria-label={t("meshProps.createAccessoryFollowRig")}
            disabled={!effectiveAccessoryFollowBoneId}
            onClick={handleApplyAccessoryFollow}
          >
            {t("meshProps.createUpdate")}
          </button>
        </div>
      </PropGroup>
      {accessoryFollowMessage && <div role="status">{accessoryFollowMessage}</div>}

      {!isAutoMesh && (
        <>
          <PropGroup label={t("meshProps.divisionsX")}>
            <input
              type="number"
              min={1}
              max={20}
              value={layer.mesh.divisionsX}
              disabled={formLocked}
              onChange={(event) => {
                const value = Math.max(1, Math.min(20, Number(event.target.value)));
                setMeshDivisions(layer.id, value, layer.mesh.divisionsY);
              }}
              className="prop-input-sm"
            />
          </PropGroup>
          <PropGroup label={t("meshProps.divisionsY")}>
            <input
              type="number"
              min={1}
              max={20}
              value={layer.mesh.divisionsY}
              disabled={formLocked}
              onChange={(event) => {
                const value = Math.max(1, Math.min(20, Number(event.target.value)));
                setMeshDivisions(layer.id, layer.mesh.divisionsX, value);
              }}
              className="prop-input-sm"
            />
          </PropGroup>
        </>
      )}

      <div className="prop-section-title mesh-ops-title">
        {t("meshProps.puppetWarp")}
      </div>
      <PropGroup label={t("meshProps.softRegion")}>
        <div className="prop-row">
          <select
            aria-label={t("meshProps.softRegionPreset")}
            className="auto-mesh-select"
            value={softRegionPreset}
            onChange={(event) =>
              setSoftRegionPreset(event.target.value as SoftRegionPresetId)
            }
          >
            {SOFT_REGION_PRESETS.map((presetId) => (
              <option key={presetId} value={presetId}>
                {t(`meshProps.softRegionPreset.${presetId}` as I18nKey)}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="auto-mesh-btn"
            aria-label={t("meshProps.createSoftRegionHelper")}
            disabled={selectedVertices.length < 3}
            onClick={handleApplySoftRegion}
          >
            {t("meshProps.create")}
          </button>
        </div>
      </PropGroup>
      {softRegionMessage && <div role="status">{softRegionMessage}</div>}
      <PropGroup label={t("meshProps.mode")}>
        <div className="mesh-ops-row">
          <button
            type="button"
            className="prop-btn mesh-op-btn"
            aria-pressed={mode === "vertex"}
            disabled={formLocked}
            onClick={() => usePuppetWarpStore.getState().setMode("vertex")}
          >
            {t("meshProps.modeVertex")}
          </button>
          <button
            type="button"
            className="prop-btn mesh-op-btn"
            aria-pressed={mode === "puppet"}
            disabled={formLocked}
            onClick={() => usePuppetWarpStore.getState().setMode("puppet")}
          >
            {t("meshProps.modePuppet")}
          </button>
        </div>
      </PropGroup>
      <PropGroup label={t("meshProps.heatmapDebug")}>
        <label className="prop-row">
          <input
            type="checkbox"
            aria-label={t("meshProps.enableMeshHeatmap")}
            checked={meshHeatmap.enabled}
            disabled={formLocked}
            onChange={(event) =>
              useViewportStore
                .getState()
                .setMeshHeatmapSettings({ enabled: event.target.checked })
            }
          />
          <span>{meshHeatmap.enabled ? t("common.enabled") : t("common.disabled")}</span>
        </label>
      </PropGroup>
      <PropGroup label={t("meshProps.heatmapIntensity")}>
        <input
          type="number"
          aria-label={t("meshProps.meshHeatmapIntensity")}
          min={0.25}
          max={4}
          step={0.25}
          value={meshHeatmap.intensity}
          disabled={formLocked}
          onChange={(event) =>
            useViewportStore
              .getState()
              .setMeshHeatmapSettings({ intensity: Number(event.target.value) })
          }
          className="prop-input-sm"
        />
      </PropGroup>
      <PropGroup label={referenceText.title}>
        <label className="prop-row">
          <input
            type="checkbox"
            aria-label={referenceText.enabledAria}
            checked={referenceOverlay.enabled}
            disabled={formLocked}
            onChange={(event) =>
              useViewportStore
                .getState()
                .setReferenceOverlaySettings({ enabled: event.target.checked })
            }
          />
          <span>
            {referenceOverlay.enabled
              ? referenceText.stateEnabled
              : referenceText.stateDisabled}
          </span>
        </label>
      </PropGroup>
      <PropGroup label={referenceText.modeLabel}>
        <select
          aria-label={referenceText.modeAria}
          value={referenceOverlay.mode}
          disabled={formLocked}
          onChange={(event) =>
            useViewportStore.getState().setReferenceOverlaySettings({
              mode: event.target.value as
                | "source"
                | "currentBounds"
                | "importedBounds"
                | "compareBounds",
            })
          }
          className="auto-mesh-select"
        >
          <option value="source">{referenceText.modes.source}</option>
          <option value="currentBounds">{referenceText.modes.currentBounds}</option>
          <option value="importedBounds">{referenceText.modes.importedBounds}</option>
          <option value="compareBounds">{referenceText.modes.compareBounds}</option>
        </select>
      </PropGroup>
      <PropGroup label={referenceText.opacityLabel}>
        <input
          type="number"
          aria-label={referenceText.opacityAria}
          min={0.05}
          max={1}
          step={0.05}
          value={referenceOverlay.opacity}
          disabled={formLocked}
          onChange={(event) =>
            useViewportStore
              .getState()
              .setReferenceOverlaySettings({ opacity: Number(event.target.value) })
          }
          className="prop-input-sm"
        />
      </PropGroup>
      <div className="mesh-ops-hint">{referenceText.help}</div>
      {referenceOverlay.mode === "compareBounds" && (
        <>
          <PropGroup label={referenceText.comparePresetLabel}>
            <div className="mesh-ops-row">
              {REFERENCE_OVERLAY_COMPARE_PRESETS.map((preset) => {
                const disabled =
                  formLocked ||
                  (preset.requiresImportedBounds && !importedReferenceBoundsAvailable);
                return (
                  <button
                    key={preset.id}
                    type="button"
                    className="prop-btn mesh-op-btn"
                    disabled={disabled}
                    onClick={() =>
                      useViewportStore.getState().setReferenceOverlaySettings({
                        enabled: true,
                        mode: "compareBounds",
                        comparePrimary: preset.primary,
                        compareSecondary: preset.secondary,
                      })
                    }
                    title={
                      disabled && preset.requiresImportedBounds
                        ? referenceText.disabledImportedPresetReason
                        : undefined
                    }
                  >
                    {getReferencePresetLabel(preset.id)}
                  </button>
                );
              })}
            </div>
          </PropGroup>
          <PropGroup label={referenceText.comparePrimaryLabel}>
            <select
              aria-label={referenceText.comparePrimaryAria}
              value={comparePrimaryMode}
              disabled={formLocked}
              onChange={(event) =>
                useViewportStore.getState().setReferenceOverlaySettings({
                  comparePrimary: event.target.value as ReferenceOverlayBoundsMode,
                })
              }
              className="auto-mesh-select"
            >
              <option value="source">{referenceText.modes.source}</option>
              <option value="currentBounds">{referenceText.modes.currentBounds}</option>
              <option value="importedBounds">{referenceText.modes.importedBounds}</option>
            </select>
          </PropGroup>
          <PropGroup label={referenceText.compareSecondaryLabel}>
            <select
              aria-label={referenceText.compareSecondaryAria}
              value={compareSecondaryMode}
              disabled={formLocked}
              onChange={(event) =>
                useViewportStore.getState().setReferenceOverlaySettings({
                  compareSecondary: event.target.value as ReferenceOverlayBoundsMode,
                })
              }
              className="auto-mesh-select"
            >
              <option value="source">{referenceText.modes.source}</option>
              <option value="currentBounds">{referenceText.modes.currentBounds}</option>
              <option value="importedBounds">{referenceText.modes.importedBounds}</option>
            </select>
          </PropGroup>
          <PropGroup label={referenceText.compareActionsLabel}>
            <div className="mesh-ops-row">
              <button
                type="button"
                className="prop-btn mesh-op-btn"
                disabled={formLocked}
                onClick={() =>
                  useViewportStore.getState().setReferenceOverlaySettings({
                    comparePrimary: compareSecondaryMode,
                    compareSecondary: comparePrimaryMode,
                  })
                }
              >
                {referenceText.swap}
              </button>
            </div>
          </PropGroup>
          <PropGroup label={referenceText.highlightDifferencesLabel}>
            <label className="prop-row">
              <input
                type="checkbox"
                aria-label={referenceText.highlightDifferencesAria}
                checked={referenceOverlay.highlightDifferences !== false}
                disabled={formLocked}
                onChange={(event) =>
                  useViewportStore.getState().setReferenceOverlaySettings({
                    highlightDifferences: event.target.checked,
                  })
                }
              />
              <span>
                {referenceOverlay.highlightDifferences === false
                  ? referenceText.stateDisabled
                  : referenceText.stateEnabled}
              </span>
            </label>
          </PropGroup>
          <PropGroup label={referenceText.pinCompareSummaryLabel}>
            <label className="prop-row">
              <input
                type="checkbox"
                aria-label={referenceText.pinCompareSummaryAria}
                checked={referenceOverlay.pinCompareSummary === true}
                disabled={formLocked}
                onChange={(event) =>
                  useViewportStore.getState().setReferenceOverlaySettings({
                    pinCompareSummary: event.target.checked,
                  })
                }
              />
              <span>
                {referenceOverlay.pinCompareSummary === true
                  ? referenceText.statePinned
                  : referenceText.stateUnpinned}
              </span>
            </label>
          </PropGroup>
        </>
      )}
      {(referenceOverlay.mode === "importedBounds" ||
        (referenceOverlay.mode === "compareBounds" && compareUsesImportedBounds)) &&
        !importedReferenceBoundsAvailable && (
          <div className="mesh-ops-hint">{referenceText.requiresMetadata}</div>
        )}
      {(referenceOverlay.mode === "importedBounds" ||
        (referenceOverlay.mode === "compareBounds" && compareUsesImportedBounds)) &&
        importedReferenceBoundsAvailable && (
          <div className="mesh-ops-hint">{referenceText.importedBoundsHint}</div>
        )}
      {showPinnedCompareSummary && referenceOverlayCompareSummary && (
        <div className="reference-summary-card">
          <div className="bs-group-name">{referenceText.compareSummaryTitle}</div>
          <div className="reference-summary-list">
            <div className="mesh-ops-hint">
              {activeReferenceOverlayComparePreset
                ? `${getReferencePresetLabel(activeReferenceOverlayComparePreset.id)}. `
                : `${referenceText.customPair}. `}
              {getReferenceAssessmentLabel(referenceOverlayCompareAssessment?.status)}:{" "}
              {getReferenceModeLabel(comparePrimaryMode)} {t("common.versus")}{" "}
              {getReferenceModeLabel(compareSecondaryMode)}
              {referenceOverlay.mode !== "compareBounds" &&
                referenceOverlay.pinCompareSummary === true &&
                ` (${referenceText.pinnedSuffix})`}
            </div>
            <div className="mesh-ops-row">
              <button
                type="button"
                className="prop-btn mesh-op-btn"
                disabled={formLocked}
                onClick={() =>
                  useViewportStore.getState().setReferenceOverlaySettings({
                    comparePrimary: compareSecondaryMode,
                    compareSecondary: comparePrimaryMode,
                  })
                }
              >
                {referenceText.swap}
              </button>
              <button
                type="button"
                className="prop-btn mesh-op-btn"
                disabled={formLocked}
                onClick={() =>
                  useViewportStore.getState().setReferenceOverlaySettings({
                    pinCompareSummary: !(referenceOverlay.pinCompareSummary === true),
                  })
                }
              >
                {referenceOverlay.pinCompareSummary === true
                  ? referenceText.unpinSummary
                  : referenceText.pinSummary}
              </button>
            </div>
            <div className="mesh-ops-hint">
              {referenceText.summaryCenterDrift}{" "}
              {referenceOverlayCompareSummary.centerDistance.toFixed(1)}px.{" "}
              {referenceText.summaryWidth}{" "}
              {referenceOverlayCompareSummary.widthScale.toFixed(2)}x,{" "}
              {referenceText.summaryHeight}{" "}
              {referenceOverlayCompareSummary.heightScale.toFixed(2)}x,{" "}
              {referenceText.summaryArea}{" "}
              {referenceOverlayCompareSummary.areaScale.toFixed(2)}x.
            </div>
            <div className="mesh-ops-hint">
              {referenceText.summaryOffset}{" "}
              {formatSigned(referenceOverlayCompareSummary.offsetX)} x /{" "}
              {formatSigned(referenceOverlayCompareSummary.offsetY)} y.{" "}
              {referenceText.summarySize}{" "}
              {formatSigned(referenceOverlayCompareSummary.widthDelta)} w /{" "}
              {formatSigned(referenceOverlayCompareSummary.heightDelta)} h.
            </div>
          </div>
        </div>
      )}
      <PropGroup label={t("meshProps.pins")}>
        <div className="mesh-selection-info">
          {pins.length} {t("meshProps.totalSuffix")} / {selectedPins.length}{" "}
          {t("meshProps.selectedSuffix")}
        </div>
      </PropGroup>
      <PropGroup label={t("meshProps.pinTypes")}>
        <div className="mesh-selection-info">
          {selectedHandlePins.length} {t("meshProps.handlesSuffix")} /{" "}
          {selectedAnchorPins.length} {t("meshProps.anchorsSelectedSuffix")}
        </div>
      </PropGroup>
      <PropGroup label={t("meshProps.groups")}>
        <div className="mesh-selection-info">{groups.length}</div>
      </PropGroup>

      <div className="mesh-ops-row">
        <button
          type="button"
          className="prop-btn mesh-op-btn"
          disabled={formLocked || selectedVertices.length === 0}
          onClick={handleCreateHandlePins}
        >
          {t("meshProps.createHandles")}
        </button>
        <button
          type="button"
          className="prop-btn mesh-op-btn"
          disabled={formLocked || selectedVertices.length === 0}
          onClick={handleCreateAnchorPins}
        >
          {t("meshProps.createAnchors")}
        </button>
      </div>
      <div className="mesh-ops-row">
        <button
          type="button"
          className="prop-btn mesh-op-btn"
          disabled={formLocked || selectedPinIds.length === 0}
          onClick={handleCreateGroup}
        >
          {t("meshProps.groupSelectedPins")}
        </button>
        <button
          type="button"
          className="prop-btn mesh-op-btn"
          disabled={formLocked || selectedPinIds.length === 0}
          onClick={handleDeleteSelectedPins}
        >
          {t("meshProps.deleteSelectedPins")}
        </button>
      </div>

      <PropGroup label={t("meshProps.symmetry")}>
        <label className="prop-row">
          <input
            type="checkbox"
            aria-label={t("meshProps.enableSymmetry")}
            checked={symmetryEnabled}
            disabled={formLocked}
            onChange={(event) =>
              usePuppetWarpStore.getState().setSymmetryEnabled(event.target.checked)
            }
          />
          <span>{symmetryEnabled ? t("common.enabled") : t("common.disabled")}</span>
        </label>
      </PropGroup>
      <PropGroup label={t("meshProps.symmetryTolerance")}>
        <input
          type="number"
          aria-label={t("meshProps.symmetryTolerance")}
          min={0}
          value={symmetryTolerance}
          disabled={formLocked}
          onChange={(event) =>
            usePuppetWarpStore.getState().setSymmetryTolerance(Number(event.target.value))
          }
          className="prop-input-sm"
        />
      </PropGroup>

      {selectedPinPrototype && (
        <>
          <PropGroup label={t("meshProps.radius")}>
            <input
              type="number"
              aria-label={t("meshProps.selectedPinRadius")}
              min={1}
              value={selectedPinPrototype.radius}
              disabled={formLocked}
              onChange={(event) =>
                handleUpdateSelectedPins({
                  radius: Math.max(1, Number(event.target.value)),
                })
              }
              className="prop-input-sm"
            />
          </PropGroup>
          <PropGroup label={t("meshProps.strength")}>
            <input
              type="number"
              aria-label={t("meshProps.selectedPinStrength")}
              min={0}
              step={0.1}
              value={selectedPinPrototype.strength}
              disabled={formLocked}
              onChange={(event) =>
                handleUpdateSelectedPins({
                  strength: Math.max(0, Number(event.target.value)),
                })
              }
              className="prop-input-sm"
            />
          </PropGroup>
          <PropGroup label={t("meshProps.curve")}>
            <select
              aria-label={t("meshProps.selectedPinCurve")}
              value={selectedPinPrototype.curve}
              disabled={formLocked}
              onChange={(event) =>
                handleUpdateSelectedPins({
                  curve: event.target.value as PuppetWarpFalloffCurve,
                })
              }
              className="auto-mesh-select"
            >
              {CURVE_OPTIONS.map((curve) => (
                <option key={curve} value={curve}>
                  {t(`meshProps.curve.${curve}` as I18nKey)}
                </option>
              ))}
            </select>
          </PropGroup>
        </>
      )}

      <div className="prop-section-title mesh-ops-title">
        {t("meshProps.meshOperations")}
      </div>
      <div className="mesh-ops-row">
        <button
          type="button"
          className="prop-btn mesh-op-btn"
          disabled={formLocked || selectedVertices.length < 2}
          onClick={handleMerge}
          title={t("meshProps.mergeVerticesTitle")}
        >
          {t("meshProps.mergeVertices")}
        </button>
        <button
          type="button"
          className="prop-btn mesh-op-btn"
          disabled={formLocked}
          onClick={handleRetriangulate}
          title={t("meshProps.retriangulateTitle")}
        >
          {t("meshProps.retriangulate")}
        </button>
      </div>
      <div className="mesh-ops-row">
        <button
          type="button"
          className="prop-btn mesh-op-btn"
          disabled={formLocked}
          onClick={handleMirrorX}
          title={t("meshProps.mirrorXTitle")}
        >
          {t("meshProps.mirrorX")}
        </button>
        <button
          type="button"
          className="prop-btn mesh-op-btn"
          disabled={formLocked}
          onClick={handleMirrorY}
          title={t("meshProps.mirrorYTitle")}
        >
          {t("meshProps.mirrorY")}
        </button>
      </div>
      <div className="mesh-ops-hint">
        {t("meshProps.vertexModeHint")}
      </div>
      <div className="mesh-ops-hint">{t("meshProps.puppetModeHint")}</div>
    </div>
  );
}
