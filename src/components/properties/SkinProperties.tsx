import { buildBoneMap } from "@vivi2d/core/bone-utils";
import type { LayerNode } from "@vivi2d/core/types";
import { useCallback, useMemo } from "react";
import { useT } from "@/lib/i18n";
import { useEditorStore } from "@/stores/editorStore";
import { useSkinStore } from "@/stores/skinStore";
import { PropGroup } from "./PropGroup";

export function SkinProperties({ layer }: { layer: LayerNode }) {
  const t = useT();
  const project = useEditorStore((s) => s.project);
  const boneMap = useMemo(
    () => (project ? buildBoneMap(project.layers) : new Map()),
    [project],
  );
  const boneList = useMemo(() => [...boneMap.values()], [boneMap]);

  const handleBind = useCallback(() => {
    if (boneList.length === 0) return;
    const boneIds = boneList.map((b) => b.id);
    useSkinStore.getState().bindSkin(layer.id, boneIds);
  }, [layer.id, boneList]);

  const handleUnbind = useCallback(() => {
    useSkinStore.getState().unbindSkin(layer.id);
  }, [layer.id]);

  const handleNormalize = useCallback(() => {
    useSkinStore.getState().normalizeAllWeights(layer.id);
  }, [layer.id]);

  const handleAutoWeights = useCallback(() => {
    useSkinStore.getState().autoWeights(layer.id);
  }, [layer.id]);

  if (layer.kind !== "viviMesh") return null;

  const skin = project?.skins[layer.id];

  if (!skin) {
    return (
      <div className="properties-section">
        <div className="prop-section-title">{t("prop.skin.title")}</div>
        <PropGroup label={t("prop.skin.status")}>{t("prop.skin.unbound")}</PropGroup>
        {boneList.length > 0 && (
          <button type="button" className="prop-btn" onClick={handleBind}>
            {t("prop.skin.bindAllBones")}
          </button>
        )}
      </div>
    );
  }

  const boneIds = Object.keys(skin.bindPoseInverse);
  const vertexCount = skin.weights.length;

  return (
    <div className="properties-section">
      <div className="prop-section-title">{t("prop.skin.title")}</div>
      <PropGroup label={t("prop.skin.vertexCount")}>{vertexCount}</PropGroup>
      <PropGroup label={t("prop.skin.boneCount")}>{boneIds.length}</PropGroup>
      <PropGroup label={t("prop.skin.bindBones")}>
        <div className="prop-bone-list">
          {boneIds.map((id) => {
            const bone = boneMap.get(id);
            return (
              <span key={id} className="prop-bone-tag">
                {bone?.name ?? id.slice(0, 8)}
              </span>
            );
          })}
        </div>
      </PropGroup>
      <div className="prop-btn-group">
        <button type="button" className="prop-btn" onClick={handleAutoWeights}>
          {t("prop.skin.autoWeights")}
        </button>
        <button type="button" className="prop-btn" onClick={handleNormalize}>
          {t("prop.skin.normalizeWeights")}
        </button>
        <button type="button" className="prop-btn prop-btn-danger" onClick={handleUnbind}>
          {t("prop.skin.unbind")}
        </button>
      </div>
    </div>
  );
}
