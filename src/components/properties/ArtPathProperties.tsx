import type { ArtPathNode } from "@vivi2d/core/types";
import { useCallback } from "react";
import { useT } from "@/lib/i18n";
import { useArtPathStore } from "@/stores/artPathStore";

export function ArtPathProperties({ layer }: { layer: ArtPathNode }) {
  const t = useT();
  const setStyle = useArtPathStore((s) => s.setStyle);
  const setClosed = useArtPathStore((s) => s.setClosed);
  const removeControlPoint = useArtPathStore((s) => s.removeControlPoint);

  const handleColorChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const hex = parseInt(e.target.value.slice(1), 16);
      setStyle(layer.id, { color: hex });
    },
    [layer.id, setStyle],
  );

  const handleWidthChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setStyle(layer.id, { baseWidth: Number(e.target.value) });
    },
    [layer.id, setStyle],
  );

  const colorHex = `#${layer.style.color.toString(16).padStart(6, "0")}`;

  return (
    <div className="properties-section">
      <div className="prop-section-title">{t("prop.artPath.title")}</div>
      <div className="artpath-props">
        <div className="prop-row">
          <label className="prop-label">
            {t("prop.artPath.color")}:
            <input
              type="color"
              value={colorHex}
              onChange={handleColorChange}
              className="artpath-color-input"
            />
          </label>
          <label className="prop-label">
            {t("prop.artPath.width")}:
            <input
              type="number"
              min={0.5}
              max={50}
              step={0.5}
              value={layer.style.baseWidth}
              onChange={handleWidthChange}
              className="ik-num-input"
            />
          </label>
        </div>
        <div className="prop-row">
          <label className="prop-label">
            <input
              type="checkbox"
              checked={layer.closed}
              onChange={(e) => setClosed(layer.id, e.target.checked)}
            />
            {t("prop.artPath.closedPath")}
          </label>
        </div>
        <div className="prop-row">
          <label className="prop-label">
            {t("prop.artPath.lineCap")}:
            <select
              value={layer.style.lineCap}
              onChange={(e) =>
                setStyle(layer.id, { lineCap: e.target.value as CanvasLineCap })
              }
              className="form-anim-select"
              style={{ width: "80px" }}
            >
              <option value="round">{t("prop.artPath.lineCap.round")}</option>
              <option value="butt">{t("prop.artPath.lineCap.butt")}</option>
              <option value="square">{t("prop.artPath.lineCap.square")}</option>
            </select>
          </label>
        </div>
        <div className="artpath-points-header">
          {t("prop.artPath.controlPoints")} ({layer.controlPoints.length})
        </div>
        <div className="artpath-points-list scrollbar-thin">
          {layer.controlPoints.map((cp, i) => (
            <div
              key={[
                cp.x,
                cp.y,
                cp.handleInX,
                cp.handleInY,
                cp.handleOutX,
                cp.handleOutY,
                cp.width,
                cp.opacity,
              ].join(":")}
              className="artpath-point-item"
            >
              <span className="artpath-point-coords">
                ({Math.round(cp.x)}, {Math.round(cp.y)})
              </span>
              <span className="artpath-point-info">w:{cp.width.toFixed(1)}</span>
              <button
                type="button"
                className="mesh-link-remove-btn"
                onClick={() => removeControlPoint(layer.id, i)}
                title={t("prop.artPath.deleteControlPoint")}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
