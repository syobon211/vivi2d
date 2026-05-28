import type {
  AnimationState,
  ParameterDefinition,
  StateTransition,
  TransitionCondition,
} from "@vivi2d/core/types";
import { useT } from "@/lib/i18n";

const OPERATORS: TransitionCondition["operator"][] = [">", "<", ">=", "<=", "==", "!="];

export function TransitionEditor({
  transition,
  states,
  parameters,
  onRemove,
  onUpdate,
  onAddCondition,
  onRemoveCondition,
  onUpdateCondition,
}: {
  transition: StateTransition;
  states: AnimationState[];
  parameters: ParameterDefinition[];
  onRemove: () => void;
  onUpdate: (updates: Partial<Omit<StateTransition, "id" | "conditions">>) => void;
  onAddCondition: (condition: TransitionCondition) => void;
  onRemoveCondition: (index: number) => void;
  onUpdateCondition: (index: number, updates: Partial<TransitionCondition>) => void;
}) {
  const t = useT();

  const fromName =
    transition.fromStateId === "*"
      ? `* (${t("sm.anyState")})`
      : (states.find((s) => s.id === transition.fromStateId)?.name ?? "?");
  const toName = states.find((s) => s.id === transition.toStateId)?.name ?? "?";

  return (
    <div className="sm-transition">
      <div className="sm-transition-header">
        <span className="sm-transition-label">
          {fromName} → {toName}
        </span>
        <button
          type="button"
          className="physics-btn-sm physics-btn-danger"
          onClick={onRemove}
        >
          x
        </button>
      </div>

      <div className="sm-transition-params">
        <label>
          {t("sm.priority")}
          <input
            type="number"
            className="physics-input-sm"
            value={transition.priority}
            onChange={(e) => onUpdate({ priority: Number(e.target.value) })}
          />
        </label>
        <label>
          {t("sm.crossfade")}
          <input
            type="number"
            className="physics-input-sm"
            step="0.05"
            min="0"
            value={transition.transitionDuration}
            onChange={(e) =>
              onUpdate({
                transitionDuration: Math.max(0, Number(e.target.value)),
              })
            }
          />
          s
        </label>
      </div>

      {/* Transition Conditions */}
      <div className="sm-conditions">
        {transition.conditions.map((cond, idx) => (
          <div
            key={`${transition.id}-${cond.parameterId}-${cond.operator}-${cond.threshold}`}
            className="sm-condition"
          >
            <select
              className="physics-select-sm"
              value={cond.parameterId}
              onChange={(e) => onUpdateCondition(idx, { parameterId: e.target.value })}
            >
              <option value="">—</option>
              {parameters.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              className="physics-select-sm sm-op-select"
              value={cond.operator}
              onChange={(e) =>
                onUpdateCondition(idx, {
                  operator: e.target.value as TransitionCondition["operator"],
                })
              }
            >
              {OPERATORS.map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>
            <input
              type="number"
              className="physics-input-sm"
              step="0.1"
              value={cond.threshold}
              onChange={(e) =>
                onUpdateCondition(idx, { threshold: Number(e.target.value) })
              }
            />
            <button
              type="button"
              className="physics-btn-sm physics-btn-danger"
              onClick={() => onRemoveCondition(idx)}
            >
              x
            </button>
          </div>
        ))}
        <button
          type="button"
          className="physics-btn-sm"
          onClick={() =>
            onAddCondition({
              parameterId: parameters[0]?.id ?? "",
              operator: ">",
              threshold: 0,
            })
          }
          disabled={parameters.length === 0}
        >
          {t("sm.addCondition")}
        </button>
      </div>
    </div>
  );
}
