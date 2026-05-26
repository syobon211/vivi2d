import type { LayerNode } from "@vivi2d/core/types";
import { useDefaultFormLock } from "@/hooks/useDefaultFormLock";
import { useT } from "@/lib/i18n";
import { useBoneStore } from "@/stores/boneStore";
import { ParameterBindingSection } from "./ParameterBindingSection";
import { PropGroup } from "./PropGroup";

export function BoneProperties({ layer }: { layer: LayerNode }) {
  const setBoneAngle = useBoneStore((s) => s.setBoneAngle);
  const setBoneScale = useBoneStore((s) => s.setBoneScale);
  const setBoneLength = useBoneStore((s) => s.setBoneLength);
  const formLocked = useDefaultFormLock();
  const t = useT();

  if (layer.kind !== "bone") return null;
  const { angle, length, scaleX, scaleY } = layer.bone;
  const angleDeg = Math.round((angle * 180) / Math.PI);

  return (
    <div className="properties-section">
      <div className="prop-section-title">{t("prop.bone")}</div>
      <PropGroup label={t("prop.position")}>
        <div className="prop-row">
          <span className="prop-field">X: {Math.round(layer.x)}</span>
          <span className="prop-field">Y: {Math.round(layer.y)}</span>
        </div>
        <ParameterBindingSection
          target={{ type: "bone", boneId: layer.id, property: "x" }}
          currentValue={layer.x}
        />
        <ParameterBindingSection
          target={{ type: "bone", boneId: layer.id, property: "y" }}
          currentValue={layer.y}
        />
      </PropGroup>
      <PropGroup label={t("prop.angle")}>
        <div className="prop-row">
          <input
            type="range"
            min={-180}
            max={180}
            value={angleDeg}
            disabled={formLocked}
            onChange={(e) =>
              setBoneAngle(layer.id, (Number(e.target.value) * Math.PI) / 180)
            }
            className="prop-slider"
          />
          <span className="prop-field-sm">{angleDeg}°</span>
        </div>
        <ParameterBindingSection
          target={{ type: "bone", boneId: layer.id, property: "angle" }}
          currentValue={angle}
        />
      </PropGroup>
      <PropGroup label={t("prop.length")}>
        <div className="prop-row">
          <input
            type="range"
            min={0}
            max={200}
            value={Math.round(length)}
            disabled={formLocked}
            onChange={(e) => setBoneLength(layer.id, Number(e.target.value))}
            className="prop-slider"
          />
          <span className="prop-field-sm">{Math.round(length)}</span>
        </div>
      </PropGroup>
      <PropGroup label={t("prop.scaleX")}>
        <div className="prop-row">
          <input
            type="range"
            min={1}
            max={500}
            value={Math.round(scaleX * 100)}
            disabled={formLocked}
            onChange={(e) => setBoneScale(layer.id, Number(e.target.value) / 100, scaleY)}
            className="prop-slider"
          />
          <span className="prop-field-sm">{Math.round(scaleX * 100)}%</span>
        </div>
        <ParameterBindingSection
          target={{ type: "bone", boneId: layer.id, property: "scaleX" }}
          currentValue={scaleX}
        />
      </PropGroup>
      <PropGroup label={t("prop.scaleY")}>
        <div className="prop-row">
          <input
            type="range"
            min={1}
            max={500}
            value={Math.round(scaleY * 100)}
            disabled={formLocked}
            onChange={(e) => setBoneScale(layer.id, scaleX, Number(e.target.value) / 100)}
            className="prop-slider"
          />
          <span className="prop-field-sm">{Math.round(scaleY * 100)}%</span>
        </div>
        <ParameterBindingSection
          target={{ type: "bone", boneId: layer.id, property: "scaleY" }}
          currentValue={scaleY}
        />
      </PropGroup>
    </div>
  );
}
