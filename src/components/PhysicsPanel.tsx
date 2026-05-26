import { flattenLayers } from "@vivi2d/core/layer-utils";
import { isBone } from "@vivi2d/core/types";
import { useCallback, useMemo, useState } from "react";
import {
  HAIR_STRAND_PRESET_IDS,
  type HairStrandHelperPresetId,
} from "@/lib/hair-strand-helper";
import { useT } from "@/lib/i18n";
import { useClipStore } from "@/stores/clipStore";
import { useEditorStore } from "@/stores/editorStore";
import { usePhysicsStore } from "@/stores/physicsStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { useTimelineStore } from "@/stores/timelineStore";
import { PhysicsGroupEditor } from "./physics/PhysicsGroupEditor";
import { TemplateDropdown } from "./TemplateDropdown";

export function PhysicsPanel() {
  const t = useT();
  const project = useEditorStore((s) => s.project);
  const addPhysicsGroup = usePhysicsStore((s) => s.addPhysicsGroup);
  const isActive = usePhysicsStore((s) => s.isActive);
  const setActive = usePhysicsStore((s) => s.setActive);
  const reset = usePhysicsStore((s) => s.reset);
  const applyHairStrandHelper = usePhysicsStore((s) => s.applyHairStrandHelper);
  const selectedLayerId = useSelectionStore((s) => s.selectedLayerId);

  const activeClipId = useTimelineStore((s) => s.activeClipId);
  const [hairPreset, setHairPreset] = useState<HairStrandHelperPresetId>("generic");
  const [hairHelperMessage, setHairHelperMessage] = useState<string | null>(null);

  const handleBake = useCallback(() => {
    if (!activeClipId || !project) return;
    const clip = project.scenes
      ?.flatMap((s) => s.clips)
      .find((c) => c.id === activeClipId);
    if (!clip) return;
    useClipStore.getState().bakePhysicsToClip(activeClipId, {
      startFrame: 0,
      endFrame: clip.duration,
      fps: clip.fps,
      sampleInterval: 1,
    });
  }, [activeClipId, project]);

  const selectedBone = useMemo(() => {
    if (!project || !selectedLayerId) return null;
    const layer = flattenLayers(project.layers).find(
      (node) => node.id === selectedLayerId,
    );
    return layer && isBone(layer) ? layer : null;
  }, [project, selectedLayerId]);

  const formatHairHelperMessage = useCallback(
    (
      result:
        | ReturnType<typeof applyHairStrandHelper>
        | { status: "rejected"; reason: "noProject" },
    ) => {
      if (result.status === "created") return t("physics.hairStrand.result.created");
      if (result.status === "updated") return t("physics.hairStrand.result.updated");
      if (result.status === "rebuilt") return t("physics.hairStrand.result.rebuilt");

      switch (result.reason) {
        case "noProject":
          return t("physics.hairStrand.result.noProject");
        case "boneNotFound":
          return t("physics.hairStrand.result.boneNotFound");
        case "nonLeafBone":
          return t("physics.hairStrand.result.nonLeafBone");
        case "brokenParentChain":
          return t("physics.hairStrand.result.brokenParentChain");
        case "cycleDetected":
          return t("physics.hairStrand.result.cycleDetected");
        case "chainTooShort":
          return t("physics.hairStrand.result.chainTooShort");
        case "duplicateManagedGroup":
          return t("physics.hairStrand.result.duplicateManagedGroup");
        case "overlappingManagedGroup":
          return t("physics.hairStrand.result.overlappingManagedGroup");
        default:
          return t("physics.hairStrand.result.boneNotFound");
      }
    },
    [t],
  );

  const handleCreateHairStrandHelper = useCallback(() => {
    if (!selectedBone) return;
    const result = applyHairStrandHelper(selectedBone.id, hairPreset);
    setHairHelperMessage(formatHairHelperMessage(result));
  }, [applyHairStrandHelper, formatHairHelperMessage, hairPreset, selectedBone]);

  if (!project) return null;

  const { physicsGroups, parameters } = project;

  return (
    <div className="panel physics-panel">
      <div className="panel-header">
        {t("physics.title")}
        <label className="physics-toggle" title={t("physics.toggleTitle")}>
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setActive(e.target.checked)}
          />
          {t("common.enabled")}
        </label>
      </div>
      <div className="panel-content scrollbar-thin">
        {physicsGroups.map((group) => (
          <PhysicsGroupEditor key={group.id} group={group} parameters={parameters} />
        ))}

        <div className="physics-actions physics-panel-actions">
          <div className="physics-panel-primary-actions">
            <div className="physics-helper-card">
              <div className="physics-section-title">{t("physics.hairStrand.title")}</div>
              <div className="physics-helper-summary">
                {selectedBone
                  ? `${t("physics.hairStrand.tipBone")}: ${selectedBone.name}`
                  : t("physics.hairStrand.selectTipBone")}
              </div>
              <div className="physics-helper-controls">
                <select
                  aria-label={t("physics.hairStrand.preset")}
                  value={hairPreset}
                  onChange={(e) =>
                    setHairPreset(e.target.value as HairStrandHelperPresetId)
                  }
                  className="form-anim-select"
                >
                  {HAIR_STRAND_PRESET_IDS.map((presetId) => (
                    <option key={presetId} value={presetId}>
                      {t(`physics.hairStrand.preset.${presetId}` as never)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="physics-btn"
                  aria-label={t("physics.hairStrand.create")}
                  onClick={handleCreateHairStrandHelper}
                  disabled={!selectedBone}
                >
                  {t("physics.hairStrand.create")}
                </button>
              </div>
              {hairHelperMessage && <div role="status">{hairHelperMessage}</div>}
            </div>
            <TemplateDropdown category="physics" />
            <button
              type="button"
              className="physics-btn"
              onClick={() =>
                addPhysicsGroup(
                  `${t("physics.defaultGroupName")} ${physicsGroups.length + 1}`,
                )
              }
            >
              {t("physics.addGroup")}
            </button>
          </div>
          {physicsGroups.length > 0 && (
            <div className="physics-panel-secondary-actions">
              <button type="button" className="physics-btn" onClick={reset}>
                {t("common.reset")}
              </button>
              {activeClipId && (
                <button type="button" className="physics-btn" onClick={handleBake}>
                  {t("physics.bake")}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
