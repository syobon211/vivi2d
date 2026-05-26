import {
  getDrawOrder,
  getMultiplyColor,
  getScreenColor,
  hexStringToRgb,
  rgbToHexString,
} from "@vivi2d/core/color-utils";
import { DRAW_ORDER, type MeshDensityPreset } from "@vivi2d/core/constants";
import { flattenLayers } from "@vivi2d/core/layer-utils";
import type {
  BlendMode,
  LayerImportMetadata,
  LayerSemanticRole,
} from "@vivi2d/core/types";
import {
  getSeeThroughImportMetadata,
  isArtPath,
  isViviMesh,
} from "@vivi2d/core/types";
import { useEffect, useMemo, useState } from "react";
import { BLEND_MODE_GROUPS } from "@/lib/blend-modes";
import { endE2EPerfProbe } from "@/lib/e2e-perf-probe";
import { nodeKindLabel } from "@/lib/format-utils";
import { type I18nKey, useT } from "@/lib/i18n";
import { formatSeeThroughLayerIssue } from "@/lib/see-through-quality-format";
import { buildSeeThroughQualityReport } from "@/lib/see-through-quality-report";
import { useEditorStore } from "@/stores/editorStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { useViewportStore } from "@/stores/viewportStore";
import { ArtPathProperties } from "./properties/ArtPathProperties";
import { BoneProperties } from "./properties/BoneProperties";
import { MeshProperties } from "./properties/MeshProperties";
import { PropGroup } from "./properties/PropGroup";
import { RigHealthSection } from "./properties/RigHealthSection";
import { SkinProperties } from "./properties/SkinProperties";
import { usePropertiesPanelCommands } from "./properties/usePropertiesPanelCommands";

const UNASSIGNED_ROLE = "__unassigned__";
const MIXED_ROLE = "__mixed__";

const SEMANTIC_ROLE_OPTIONS: LayerSemanticRole[] = [
  "unknown",
  "head",
  "face",
  "eyeLeft",
  "eyeRight",
  "eyebrowLeft",
  "eyebrowRight",
  "mouth",
  "nose",
  "hair",
  "hairFront",
  "hairBack",
  "hairSide",
  "body",
  "armLeft",
  "armRight",
  "handLeft",
  "handRight",
  "legLeft",
  "legRight",
  "tail",
  "ear",
  "accessory",
];

function semanticRoleLabel(
  t: (key: I18nKey) => string,
  role: LayerSemanticRole,
): string {
  return t(`prop.semanticRole.${role}` as I18nKey);
}

const BLEND_GROUP_LABEL_KEYS: Record<string, I18nKey> = {
  Basic: "blend.group.basic",
  "Light and Contrast": "blend.group.lightContrast",
  Tone: "blend.group.tone",
  "Dodge and Burn": "blend.group.dodgeBurn",
  Difference: "blend.group.difference",
};

function blendModeLabel(t: (key: I18nKey) => string, mode: BlendMode): string {
  return t(`blend.mode.${mode}` as I18nKey);
}

function blendGroupLabel(t: (key: I18nKey) => string, label: string): string {
  const key = BLEND_GROUP_LABEL_KEYS[label];
  return key ? t(key) : label;
}

function semanticRoleSelectValue(role?: LayerSemanticRole): string {
  return role ?? UNASSIGNED_ROLE;
}

function parseSemanticRoleSelectValue(
  value: string,
): LayerSemanticRole | undefined {
  if (value === UNASSIGNED_ROLE) return undefined;
  if (value === MIXED_ROLE) return undefined;
  return value as LayerSemanticRole;
}

function formatSemanticRoleConfidence(metadata: LayerImportMetadata): string {
  const seeThrough = getSeeThroughImportMetadata(metadata);
  return `${Math.round((seeThrough?.confidence ?? 0) * 100)}%`;
}

export function PropertiesPanel() {
  const t = useT();
  const project = useEditorStore((s) => s.project);
  const selectedLayerId = useSelectionStore((s) => s.selectedLayerId);
  const selectedLayerIds = useSelectionStore((s) => s.selectedLayerIds);
  const selectLayersBySemanticRole = useSelectionStore(
    (s) => s.selectLayersBySemanticRole,
  );
  const zoom = useViewportStore((s) => s.zoom);
  const commands = usePropertiesPanelCommands();
  const [batchPreset, setBatchPreset] = useState<MeshDensityPreset>("standard");
  const [batchSemanticRole, setBatchSemanticRole] =
    useState<string>(UNASSIGNED_ROLE);

  const flattenedLayers = useMemo(
    () => (project ? flattenLayers(project.layers) : []),
    [project],
  );
  const layerMap = useMemo(
    () => new Map(flattenedLayers.map((layer) => [layer.id, layer])),
    [flattenedLayers],
  );
  const selectedLayer = selectedLayerId
    ? (layerMap.get(selectedLayerId) ?? null)
    : null;
  useEffect(() => {
    if (!selectedLayer || !isViviMesh(selectedLayer)) return;
    endE2EPerfProbe("selection.viviMeshReady", selectedLayer.id, {
      layerId: selectedLayer.id,
      kind: selectedLayer.kind,
    });
  }, [selectedLayer]);
  const seeThroughQualityReport = useMemo(
    () => (project ? buildSeeThroughQualityReport(project) : null),
    [project],
  );
  const selectedLayerImportIssues =
    selectedLayer && selectedLayer.importMetadata?.source === "seeThrough"
      ? (seeThroughQualityReport?.layerIssues[selectedLayer.id] ?? [])
      : [];
  const hasSeeThroughImportedLayers = useMemo(
    () =>
      flattenedLayers.some(
        (layer) =>
          isViviMesh(layer) && layer.importMetadata?.source === "seeThrough",
      ),
    [flattenedLayers],
  );
  const isMultiSelect = selectedLayerIds.length > 1;

  const selectedLayers = useMemo(
    () =>
      selectedLayerIds
        .map((id) => layerMap.get(id))
        .filter((layer): layer is NonNullable<typeof layer> => layer != null),
    [layerMap, selectedLayerIds],
  );

  const allSelectedViviMeshes =
    selectedLayers.length > 0 &&
    selectedLayers.length === selectedLayerIds.length &&
    selectedLayers.every((layer) => isViviMesh(layer));

  const sharedSelectedSemanticRole = useMemo(() => {
    if (!allSelectedViviMeshes) return undefined;
    const firstRole = selectedLayers[0]?.semanticRole;
    return selectedLayers.every((layer) => layer.semanticRole === firstRole)
      ? firstRole
      : MIXED_ROLE;
  }, [allSelectedViviMeshes, selectedLayers]);

  useEffect(() => {
    if (!isMultiSelect) return;
    if (!allSelectedViviMeshes) {
      setBatchSemanticRole(UNASSIGNED_ROLE);
      return;
    }
    setBatchSemanticRole(
      sharedSelectedSemanticRole === MIXED_ROLE
        ? MIXED_ROLE
        : semanticRoleSelectValue(sharedSelectedSemanticRole),
    );
  }, [allSelectedViviMeshes, isMultiSelect, sharedSelectedSemanticRole]);

  const clipCandidates = useMemo(
    () =>
      selectedLayer
        ? flattenedLayers.filter(
            (layer) => isViviMesh(layer) && layer.id !== selectedLayer.id,
          )
        : [],
    [flattenedLayers, selectedLayer],
  );

  const handleAddClipMask = (maskId: string) => {
    if (!selectedLayer || !maskId) return;
    const current = selectedLayer.clipMaskIds ?? [];
    if (!current.includes(maskId)) {
      commands.setClipMaskIds(selectedLayer.id, [...current, maskId]);
    }
  };

  const handleRemoveClipMask = (maskId: string) => {
    if (!selectedLayer) return;
    const current = selectedLayer.clipMaskIds ?? [];
    commands.setClipMaskIds(
      selectedLayer.id,
      current.filter((id) => id !== maskId),
    );
  };

  return (
    <div className="panel properties-panel">
      <div className="panel-header">{t("prop.title")}</div>
      <div className="panel-content scrollbar-thin">
        {isMultiSelect ? (
          <div className="multi-select-info">
            <div>
              {selectedLayerIds.length} {t("prop.layersSelected")}
            </div>
            <div className="properties-section">
              <div className="prop-section-title">
                {t("prop.batchAutoMesh")}
              </div>
              <div className="prop-row">
                <select
                  aria-label={t("prop.batchAutoMeshSelect")}
                  className="auto-mesh-select"
                  value={batchPreset}
                  onChange={(e) =>
                    setBatchPreset(e.target.value as MeshDensityPreset)
                  }
                >
                  <option value="coarse">{t("prop.coarse")}</option>
                  <option value="standard">{t("prop.standard")}</option>
                  <option value="fine">{t("prop.fine")}</option>
                </select>
                <button
                  type="button"
                  aria-label={t("prop.batchAutoMeshApply")}
                  className="auto-mesh-btn"
                  onClick={() =>
                    commands.setAutoMeshBatch(selectedLayerIds, batchPreset)
                  }
                >
                  {t("prop.batchApply")}
                </button>
              </div>
            </div>
            {allSelectedViviMeshes && (
              <div className="properties-section">
                <div className="prop-section-title">
                  {t("prop.semanticRole")}
                </div>
                <div className="prop-row">
                  <select
                    aria-label={t("prop.semanticRoleBatch")}
                    className="prop-select"
                    value={batchSemanticRole}
                    onChange={(e) => setBatchSemanticRole(e.target.value)}
                  >
                    <option value={UNASSIGNED_ROLE}>
                      {t("prop.semanticRole.unassigned")}
                    </option>
                    {sharedSelectedSemanticRole === MIXED_ROLE && (
                      <option value={MIXED_ROLE} disabled>
                        {t("prop.semanticRole.mixed")}
                      </option>
                    )}
                    {SEMANTIC_ROLE_OPTIONS.map((role) => (
                      <option key={role} value={role}>
                        {semanticRoleLabel(t, role)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="auto-mesh-btn"
                    aria-label={t("prop.semanticRoleBatchApply")}
                    disabled={batchSemanticRole === MIXED_ROLE}
                    onClick={() =>
                      commands.setLayerSemanticRoleBatch(
                        selectedLayerIds,
                        parseSemanticRoleSelectValue(batchSemanticRole),
                      )
                    }
                  >
                    {t("prop.batchApply")}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : selectedLayer ? (
          <div className="properties-form">
            <PropGroup label={t("prop.name")}>{selectedLayer.name}</PropGroup>
            <PropGroup label={t("prop.kind")}>
              {nodeKindLabel(selectedLayer.kind)}
            </PropGroup>
            {isViviMesh(selectedLayer) && (
              <PropGroup label={t("prop.semanticRole")}>
                <select
                  aria-label={t("prop.semanticRole")}
                  className="prop-select"
                  value={semanticRoleSelectValue(selectedLayer.semanticRole)}
                  onChange={(e) =>
                    commands.setLayerSemanticRole(
                      selectedLayer.id,
                      parseSemanticRoleSelectValue(e.target.value),
                    )
                  }
                >
                  <option value={UNASSIGNED_ROLE}>
                    {t("prop.semanticRole.unassigned")}
                  </option>
                  {SEMANTIC_ROLE_OPTIONS.map((role) => (
                    <option key={role} value={role}>
                      {semanticRoleLabel(t, role)}
                    </option>
                  ))}
                </select>
                {selectedLayer.semanticRole &&
                  selectedLayer.semanticRole !== "unknown" && (
                    <div className="prop-row" style={{ marginTop: 8 }}>
                      <button
                        type="button"
                        className="prop-btn"
                        aria-label={t("prop.semanticRoleSelectSame")}
                        onClick={() =>
                          selectLayersBySemanticRole(
                            selectedLayer.semanticRole!,
                            selectedLayer.id,
                          )
                        }
                      >
                        {t("prop.semanticRoleSelectSame")}
                      </button>
                    </div>
                  )}
              </PropGroup>
            )}
            {selectedLayer.importMetadata?.source === "seeThrough" && (
              <>
                <PropGroup label={t("prop.importSource")}>
                  {t("prop.importSource.seeThrough")}
                </PropGroup>
                <PropGroup label={t("prop.importLabel")}>
                  {selectedLayer.importMetadata.seeThrough.label}
                </PropGroup>
                <PropGroup label={t("prop.importConfidence")}>
                  {formatSemanticRoleConfidence(selectedLayer.importMetadata)}
                </PropGroup>
                <PropGroup label={t("prop.importLeftRight")}>
                  {selectedLayer.importMetadata.seeThrough.leftRightSplit}
                </PropGroup>
                <PropGroup label={t("prop.importFrontBack")}>
                  {selectedLayer.importMetadata.seeThrough.frontBackSplit}
                </PropGroup>
                <PropGroup label={t("prop.importQuality")}>
                  {selectedLayerImportIssues.length === 0 ? (
                    <div>{t("prop.importQuality.ok")}</div>
                  ) : (
                    <ul className="prop-list">
                      {selectedLayerImportIssues.map((issue) => (
                        <li
                          key={`${issue.layerId}:${issue.severity}:${issue.code}`}
                        >
                          {formatSeeThroughLayerIssue(issue)}
                        </li>
                      ))}
                    </ul>
                  )}
                </PropGroup>
                <PropGroup label={t("prop.depthInspector.title")}>
                  <button
                    type="button"
                    className="prop-btn"
                    onClick={commands.openDepthInspector}
                  >
                    {t("prop.depthInspector.open")}
                  </button>
                </PropGroup>
              </>
            )}
            <PropGroup label={t("prop.position")}>
              <div className="prop-row">
                <span className="prop-field">X: {selectedLayer.x}</span>
                <span className="prop-field">Y: {selectedLayer.y}</span>
              </div>
            </PropGroup>
            <PropGroup label={t("prop.size")}>
              <div className="prop-row">
                <span className="prop-field">W: {selectedLayer.width}</span>
                <span className="prop-field">H: {selectedLayer.height}</span>
              </div>
            </PropGroup>
            <PropGroup label={t("prop.opacity")}>
              <div className="prop-row">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(selectedLayer.opacity * 100)}
                  onChange={(e) =>
                    commands.setLayerOpacity(
                      selectedLayer.id,
                      Number(e.target.value) / 100,
                    )
                  }
                  className="prop-slider"
                />
                <span className="prop-field-sm">
                  {Math.round(selectedLayer.opacity * 100)}%
                </span>
              </div>
            </PropGroup>
            <PropGroup label={t("prop.drawOrder")}>
              <div className="prop-row">
                <input
                  type="range"
                  min={DRAW_ORDER.MIN}
                  max={DRAW_ORDER.MAX}
                  value={getDrawOrder(selectedLayer.drawOrder)}
                  onChange={(e) =>
                    commands.setDrawOrder(selectedLayer.id, Number(e.target.value))
                  }
                  className="prop-slider"
                />
                <input
                  type="number"
                  min={DRAW_ORDER.MIN}
                  max={DRAW_ORDER.MAX}
                  value={getDrawOrder(selectedLayer.drawOrder)}
                  onChange={(e) =>
                    commands.setDrawOrder(selectedLayer.id, Number(e.target.value))
                  }
                  className="prop-number-input"
                />
              </div>
            </PropGroup>
            <PropGroup label={t("prop.blend")}>
              <select
                aria-label={t("prop.blend")}
                className="prop-select"
                value={selectedLayer.blendMode}
                onChange={(e) =>
                  commands.setBlendMode(selectedLayer.id, e.target.value as BlendMode)
                }
              >
                {BLEND_MODE_GROUPS.map((group) => (
                  <optgroup
                    key={group.label}
                    label={blendGroupLabel(t, group.label)}
                  >
                    {group.modes.map((mode) => (
                      <option key={mode} value={mode}>
                        {blendModeLabel(t, mode)}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </PropGroup>
            <PropGroup label={t("prop.multiplyColor")}>
              <input
                type="color"
                value={rgbToHexString(
                  getMultiplyColor(selectedLayer.multiplyColor),
                )}
                onChange={(e) =>
                  commands.setMultiplyColor(
                    selectedLayer.id,
                    hexStringToRgb(e.target.value),
                  )
                }
                className="prop-color-input"
              />
            </PropGroup>
            <PropGroup label={t("prop.screenColor")}>
              <input
                type="color"
                value={rgbToHexString(
                  getScreenColor(selectedLayer.screenColor),
                )}
                onChange={(e) =>
                  commands.setScreenColor(
                    selectedLayer.id,
                    hexStringToRgb(e.target.value),
                  )
                }
                className="prop-color-input"
              />
            </PropGroup>

            {}
            {isViviMesh(selectedLayer) && (
              <PropGroup label={t("prop.culling")}>
                <label className="prop-checkbox-label">
                  <input
                    type="checkbox"
                    checked={selectedLayer.culling ?? false}
                    onChange={(e) =>
                      commands.setCulling(selectedLayer.id, e.target.checked)
                    }
                  />
                  {t("prop.hideBackface")}
                </label>
              </PropGroup>
            )}

            {}
            {isViviMesh(selectedLayer) && (
              <PropGroup label={t("prop.clipping")}>
                {(selectedLayer.clipMaskIds ?? []).length > 0 && (
                  <div className="clip-mask-list">
                    {(selectedLayer.clipMaskIds ?? []).map((maskId) => {
                      const maskLayer = project
                        ? (layerMap.get(maskId) ?? null)
                        : null;
                      return (
                        <div key={maskId} className="clip-mask-tag">
                          <span>{maskLayer?.name ?? maskId}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveClipMask(maskId)}
                            title={t("prop.removeMaskTitle")}
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
                <select
                  className="clip-mask-select"
                  value=""
                  onChange={(e) => handleAddClipMask(e.target.value)}
                >
                  <option value="">{t("prop.addMask")}</option>
                  {clipCandidates
                    .filter(
                      (c) => !(selectedLayer.clipMaskIds ?? []).includes(c.id),
                    )
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </PropGroup>
            )}

            <MeshProperties layer={selectedLayer} />
            <BoneProperties layer={selectedLayer} />
            <SkinProperties layer={selectedLayer} />
            {isArtPath(selectedLayer) && (
              <ArtPathProperties layer={selectedLayer} />
            )}
          </div>
        ) : (
          <div className="panel-empty">
            {project ? t("prop.selectLayer") : t("prop.noProject")}
          </div>
        )}

        <RigHealthSection />
        {project && (
          <div className="properties-section">
            <div className="prop-section-title">{t("prop.canvasInfo")}</div>
            <PropGroup label={t("prop.size")}>
              {project.width} x {project.height}
            </PropGroup>
            <PropGroup label={t("prop.zoom")}>
              {Math.round(zoom * 100)}%
            </PropGroup>
            {hasSeeThroughImportedLayers &&
              selectedLayer?.importMetadata?.source !== "seeThrough" && (
                <PropGroup label={t("prop.depthInspector.title")}>
                  <button
                    type="button"
                    className="prop-btn"
                    onClick={commands.openDepthInspector}
                  >
                    {t("prop.depthInspector.open")}
                  </button>
                </PropGroup>
              )}
          </div>
        )}
      </div>
    </div>
  );
}
