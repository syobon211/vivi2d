import { findLayerById, flattenLayers } from "@vivi2d/core/layer-utils";
import { isViviMesh } from "@vivi2d/core/types";
import { useCallback, useMemo } from "react";
import { useT } from "@/lib/i18n";
import { useEditorStore } from "@/stores/editorStore";
import { useOffscreenStore } from "@/stores/offscreenStore";

export function OffscreenPanel() {
  const t = useT();
  const project = useEditorStore((s) => s.project);
  const addTarget = useOffscreenStore((s) => s.addOffscreenTarget);
  const removeTarget = useOffscreenStore((s) => s.removeOffscreenTarget);
  const addSource = useOffscreenStore((s) => s.addSourceLayer);
  const removeSource = useOffscreenStore((s) => s.removeSourceLayer);
  const setBufferSize = useOffscreenStore((s) => s.setBufferSize);

  const layerOptions = useMemo(() => {
    if (!project) return [];
    return flattenLayers(project.layers)
      .filter(isViviMesh)
      .map((l) => ({ id: l.id, name: l.name }));
  }, [project]);

  const handleAddTarget = useCallback(() => {
    if (!project) return;
    addTarget(project.width, project.height);
  }, [project, addTarget]);

  if (!project) return null;

  const targets = project.offscreenTargets ?? [];

  return (
    <div className="panel offscreen-panel">
      <div className="panel-header">{t("offscreen.title")}</div>
      <div className="panel-content scrollbar-thin">
        {targets.map((target) => (
          <div key={target.id} className="offscreen-item">
            <div className="offscreen-item-header">
              <span className="offscreen-item-name">
                {target.width}×{target.height}
              </span>
              <button
                type="button"
                className="mesh-link-remove-btn"
                onClick={() => removeTarget(target.id)}
                title={t("offscreen.deleteTitle")}
              >
                ×
              </button>
            </div>
            <div className="offscreen-item-details">
              <div className="offscreen-size-row">
                <label>
                  W:
                  <input
                    type="number"
                    min={1}
                    max={4096}
                    value={target.width}
                    onChange={(e) =>
                      setBufferSize(target.id, Number(e.target.value), target.height)
                    }
                    className="ik-num-input"
                  />
                </label>
                <label>
                  H:
                  <input
                    type="number"
                    min={1}
                    max={4096}
                    value={target.height}
                    onChange={(e) =>
                      setBufferSize(target.id, target.width, Number(e.target.value))
                    }
                    className="ik-num-input"
                  />
                </label>
              </div>
              <div className="offscreen-sources">
                {t("offscreen.sourceLayers")}:
                {target.sourceLayerIds.map((layerId) => {
                  const layer = findLayerById(project.layers, layerId);
                  return (
                    <div key={layerId} className="offscreen-source-item">
                      <span>{layer?.name ?? layerId}</span>
                      <button
                        type="button"
                        className="mesh-link-remove-btn"
                        onClick={() => removeSource(target.id, layerId)}
                        title={t("offscreen.deleteSource")}
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) addSource(target.id, e.target.value);
                    e.target.value = "";
                  }}
                  className="form-anim-select"
                >
                  <option value="">{t("offscreen.addLayer")}</option>
                  {layerOptions
                    .filter((l) => !target.sourceLayerIds.includes(l.id))
                    .map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                </select>
              </div>
            </div>
          </div>
        ))}

        <div className="physics-actions">
          <button type="button" className="physics-btn" onClick={handleAddTarget}>
            {t("offscreen.add")}
          </button>
        </div>
      </div>
    </div>
  );
}
