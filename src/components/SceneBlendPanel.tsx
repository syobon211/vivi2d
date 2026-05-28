import type { InterpolationType, SceneBlend, SceneBlendMode } from "@vivi2d/core/types";
import { useCallback, useState } from "react";
import { type I18nKey, useT } from "@/lib/i18n";
import { useEditorStore } from "@/stores/editorStore";
import { useSceneBlendStore } from "@/stores/sceneBlendStore";

const BLEND_MODES: { value: SceneBlendMode; labelKey: I18nKey }[] = [
  { value: "crossfade", labelKey: "sceneBlend.crossfade" },
  { value: "additive", labelKey: "sceneBlend.additive" },
  { value: "override", labelKey: "sceneBlend.override" },
];

const EASING_OPTIONS: { value: InterpolationType; labelKey: I18nKey }[] = [
  { value: "linear", labelKey: "sceneBlend.linear" },
  { value: "bezier", labelKey: "sceneBlend.bezier" },
  { value: "ellipse", labelKey: "sceneBlend.elliptic" },
  { value: "sns", labelKey: "sceneBlend.sns" },
  { value: "step", labelKey: "sceneBlend.step" },
];

export function SceneBlendPanel() {
  const t = useT();
  const project = useEditorStore((s) => s.project);
  const createBlend = useSceneBlendStore((s) => s.createSceneBlend);
  const removeBlend = useSceneBlendStore((s) => s.removeSceneBlend);
  const updateBlend = useSceneBlendStore((s) => s.updateSceneBlend);

  const [addMode, setAddMode] = useState(false);
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");

  const handleCreate = useCallback(() => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    createBlend(sourceId, targetId);
    setAddMode(false);
    setSourceId("");
    setTargetId("");
  }, [sourceId, targetId, createBlend]);

  if (!project) return null;

  const scenes = project.scenes;
  const blends = project.sceneBlends ?? [];

  return (
    <div className="panel scene-blend-panel">
      <div className="panel-header">{t("sceneBlend.title")}</div>
      <div className="panel-content scrollbar-thin">
        {blends.length === 0 && !addMode && (
          <div className="panel-empty">{t("sceneBlend.none")}</div>
        )}

        {blends.map((blend: SceneBlend) => {
          const sourceName =
            scenes.find((s) => s.id === blend.sourceSceneId)?.name ?? "?";
          const targetName =
            scenes.find((s) => s.id === blend.targetSceneId)?.name ?? "?";
          return (
            <SceneBlendItem
              key={blend.id}
              blend={blend}
              sourceName={sourceName}
              targetName={targetName}
              onUpdate={(updates) => updateBlend(blend.id, updates)}
              onRemove={() => removeBlend(blend.id)}
            />
          );
        })}

        {addMode ? (
          <div className="scene-blend-add-form">
            <select
              className="scene-blend-select"
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
            >
              <option value="">{t("sceneBlend.sourceScene")}</option>
              {scenes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <span className="scene-blend-arrow">→</span>
            <select
              className="scene-blend-select"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
            >
              <option value="">{t("sceneBlend.targetScene")}</option>
              {scenes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button type="button" className="physics-btn" onClick={handleCreate}>
              {t("common.ok")}
            </button>
            <button
              type="button"
              className="physics-btn"
              onClick={() => setAddMode(false)}
            >
              {t("common.cancel")}
            </button>
          </div>
        ) : (
          <div className="scene-blend-actions">
            <button
              type="button"
              className="physics-btn"
              onClick={() => setAddMode(true)}
              disabled={scenes.length < 2}
              title={
                scenes.length < 2
                  ? t("sceneBlend.needTwoScenes")
                  : t("sceneBlend.addBlendTitle")
              }
            >
              {t("sceneBlend.addBlend")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SceneBlendItem({
  blend,
  sourceName,
  targetName,
  onUpdate,
  onRemove,
}: {
  blend: SceneBlend;
  sourceName: string;
  targetName: string;
  onUpdate: (
    updates: Partial<Pick<SceneBlend, "mode" | "transitionFrames" | "easing">>,
  ) => void;
  onRemove: () => void;
}) {
  const t = useT();
  return (
    <div className="scene-blend-item">
      <div className="scene-blend-header">
        <span className="scene-blend-label">
          {sourceName} → {targetName}
        </span>
        <button
          type="button"
          className="mesh-link-remove-btn"
          onClick={onRemove}
          title={t("common.delete")}
        >
          x
        </button>
      </div>
      <div className="scene-blend-controls">
        <label className="scene-blend-control">
          {t("sceneBlend.mode")}
          <select
            value={blend.mode}
            onChange={(e) => onUpdate({ mode: e.target.value as SceneBlendMode })}
          >
            {BLEND_MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {t(m.labelKey)}
              </option>
            ))}
          </select>
        </label>
        <label className="scene-blend-control">
          {t("sceneBlend.transitionFrames")}
          <input
            type="number"
            min={1}
            max={9999}
            value={blend.transitionFrames}
            onChange={(e) =>
              onUpdate({ transitionFrames: Math.max(1, Number(e.target.value) || 1) })
            }
          />
        </label>
        <label className="scene-blend-control">
          {t("sceneBlend.easing")}
          <select
            value={blend.easing}
            onChange={(e) => onUpdate({ easing: e.target.value as InterpolationType })}
          >
            {EASING_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {t(o.labelKey)}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
