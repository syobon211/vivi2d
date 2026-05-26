import type { ParameterDefinition, PhysicsGroup } from "@vivi2d/core/types";
import { memo } from "react";
import { useT } from "@/lib/i18n";
import { usePhysicsStore } from "@/stores/physicsStore";
import { PhysicsIOList } from "./PhysicsIOList";

export const PhysicsGroupEditor = memo(function PhysicsGroupEditor({
  group,
  parameters,
}: {
  group: PhysicsGroup;
  parameters: ParameterDefinition[];
}) {
  const updatePhysicsGroup = usePhysicsStore((s) => s.updatePhysicsGroup);
  const removePhysicsGroup = usePhysicsStore((s) => s.removePhysicsGroup);
  const addPendulum = usePhysicsStore((s) => s.addPendulum);
  const removePendulum = usePhysicsStore((s) => s.removePendulum);
  const updatePendulum = usePhysicsStore((s) => s.updatePendulum);
  const t = useT();

  return (
    <div className="physics-group">
      <div className="physics-group-header">
        <input
          type="checkbox"
          checked={group.enabled}
          onChange={(e) => updatePhysicsGroup(group.id, { enabled: e.target.checked })}
          title={t("physics.groupToggleTitle")}
        />
        <span className="physics-group-name">{group.name}</span>
        <button
          type="button"
          className="physics-btn-sm physics-btn-danger"
          onClick={() => removePhysicsGroup(group.id)}
          title={t("physics.deleteGroupTitle")}
        >
          x
        </button>
      </div>

      {}
      <div className="physics-params">
        <label className="physics-param">
          {t("physics.gravity")}
          <input
            type="range"
            min={0}
            max={20}
            step={0.1}
            value={group.gravityStrength}
            onChange={(e) =>
              updatePhysicsGroup(group.id, {
                gravityStrength: Number(e.target.value),
              })
            }
            className="physics-slider"
          />
          <span className="physics-value">{group.gravityStrength.toFixed(1)}</span>
        </label>
        <label className="physics-param">
          {t("physics.wind")}
          <input
            type="range"
            min={-10}
            max={10}
            step={0.1}
            value={group.wind}
            onChange={(e) =>
              updatePhysicsGroup(group.id, { wind: Number(e.target.value) })
            }
            className="physics-slider"
          />
          <span className="physics-value">{group.wind.toFixed(1)}</span>
        </label>
      </div>

      {}
      <div className="physics-section">
        <div className="physics-section-title">
          {t("physics.pendulums")} ({group.pendulums.length})
          <button
            type="button"
            className="physics-btn-sm"
            onClick={() => addPendulum(group.id)}
            title={t("physics.addPendulumTitle")}
          >
            +
          </button>
        </div>
        {group.pendulums.map((p, i) => (
          <div
            key={`${group.id}:pendulum:${p.length}:${p.mass}:${p.damping}`}
            className="physics-pendulum"
          >
            <span className="physics-pendulum-idx">#{i + 1}</span>
            <label>
              {t("physics.length")}
              <input
                type="number"
                min={0.1}
                max={10}
                step={0.1}
                value={p.length}
                onChange={(e) =>
                  updatePendulum(group.id, i, { length: Number(e.target.value) })
                }
                className="physics-input-sm"
              />
            </label>
            <label>
              {t("physics.mass")}
              <input
                type="number"
                min={0.1}
                max={10}
                step={0.1}
                value={p.mass}
                onChange={(e) =>
                  updatePendulum(group.id, i, { mass: Number(e.target.value) })
                }
                className="physics-input-sm"
              />
            </label>
            <label>
              {t("physics.damping")}
              <input
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={p.damping}
                onChange={(e) =>
                  updatePendulum(group.id, i, { damping: Number(e.target.value) })
                }
                className="physics-input-sm"
              />
            </label>
            {group.pendulums.length > 1 && (
              <button
                type="button"
                className="physics-btn-sm physics-btn-danger"
                onClick={() => removePendulum(group.id, i)}
                title={t("physics.deletePendulumTitle")}
              >
                x
              </button>
            )}
          </div>
        ))}
      </div>

      <PhysicsIOList group={group} parameters={parameters} />
    </div>
  );
});
