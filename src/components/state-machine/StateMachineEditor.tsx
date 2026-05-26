import type {
  AnimationClip,
  AnimationStateMachine,
  ParameterDefinition,
} from "@vivi2d/core/types";
import { useState } from "react";
import { useT } from "@/lib/i18n";
import { useStateMachineStore } from "@/stores/stateMachineStore";
import { TransitionEditor } from "./TransitionEditor";

export function StateMachineEditor({
  machine,
  parameters,
  clips,
}: {
  machine: AnimationStateMachine;
  parameters: ParameterDefinition[];
  clips: AnimationClip[];
}) {
  const t = useT();
  const {
    toggleStateMachine,
    removeStateMachine,
    renameStateMachine,
    setInitialState,
    addState,
    removeState,
    updateState,
    addTransition,
    removeTransition,
    updateTransition,
    addCondition,
    removeCondition,
    updateCondition,
  } = useStateMachineStore.getState();

  const [addingState, setAddingState] = useState(false);
  const [newStateName, setNewStateName] = useState("");
  const [addingTransition, setAddingTransition] = useState(false);
  const [newFrom, setNewFrom] = useState("*");
  const [newTo, setNewTo] = useState("");

  const handleAddState = () => {
    const name = newStateName.trim();
    if (!name) return;
    addState(machine.id, name);
    setNewStateName("");
    setAddingState(false);
  };

  const handleAddTransition = () => {
    if (!newTo) return;
    addTransition(machine.id, newFrom, newTo);
    setAddingTransition(false);
    setNewFrom("*");
    setNewTo("");
  };

  return (
    <div className="sm-group">
      {}
      <div className="sm-group-header">
        <label className="physics-toggle">
          <input
            type="checkbox"
            checked={machine.enabled}
            onChange={() => toggleStateMachine(machine.id)}
          />
        </label>
        <input
          type="text"
          className="sm-group-name"
          value={machine.name}
          onChange={(e) => renameStateMachine(machine.id, e.target.value)}
        />
        <button
          type="button"
          className="physics-btn-sm physics-btn-danger"
          onClick={() => removeStateMachine(machine.id)}
          title={t("common.delete")}
        >
          x
        </button>
      </div>

      {}
      <div className="sm-section">
        <div className="sm-section-title">{t("sm.states")}</div>
        {machine.states.map((state) => (
          <div key={state.id} className="sm-state">
            <input
              type="text"
              className="sm-state-name"
              value={state.name}
              onChange={(e) =>
                updateState(machine.id, state.id, { name: e.target.value })
              }
            />
            <select
              className="physics-select-sm"
              value={state.clipId ?? ""}
              onChange={(e) =>
                updateState(machine.id, state.id, {
                  clipId: e.target.value || undefined,
                })
              }
            >
              <option value="">{t("sm.noClip")}</option>
              {clips.map((clip) => (
                <option key={clip.id} value={clip.id}>
                  {clip.name}
                </option>
              ))}
            </select>
            <label className="sm-loop-toggle">
              <input
                type="checkbox"
                checked={state.loop}
                onChange={(e) =>
                  updateState(machine.id, state.id, { loop: e.target.checked })
                }
              />
              {t("sm.loop")}
            </label>
            {machine.initialStateId === state.id ? (
              <span className="sm-initial-badge">{t("sm.initial")}</span>
            ) : (
              <button
                type="button"
                className="physics-btn-sm"
                onClick={() => setInitialState(machine.id, state.id)}
                title={t("sm.setInitial")}
              >
                ★
              </button>
            )}
            <button
              type="button"
              className="physics-btn-sm physics-btn-danger"
              onClick={() => removeState(machine.id, state.id)}
              disabled={machine.states.length <= 1}
            >
              x
            </button>
          </div>
        ))}

        {addingState ? (
          <div className="sm-add-form">
            <input
              type="text"
              className="sm-state-name"
              placeholder={t("sm.stateName")}
              value={newStateName}
              onChange={(e) => setNewStateName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddState();
                if (e.key === "Escape") setAddingState(false);
              }}
            />
            <button
              type="button"
              className="physics-btn-sm"
              onClick={handleAddState}
              disabled={!newStateName.trim()}
            >
              {t("common.ok")}
            </button>
            <button
              type="button"
              className="physics-btn-sm"
              onClick={() => setAddingState(false)}
            >
              {t("common.cancel")}
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="physics-btn-sm"
            onClick={() => setAddingState(true)}
          >
            {t("sm.addState")}
          </button>
        )}
      </div>

      {}
      <div className="sm-section">
        <div className="sm-section-title">{t("sm.transitions")}</div>
        {machine.transitions.map((transition) => (
          <TransitionEditor
            key={transition.id}
            transition={transition}
            states={machine.states}
            parameters={parameters}
            onRemove={() => removeTransition(machine.id, transition.id)}
            onUpdate={(updates) => updateTransition(machine.id, transition.id, updates)}
            onAddCondition={(cond) => addCondition(machine.id, transition.id, cond)}
            onRemoveCondition={(idx) => removeCondition(machine.id, transition.id, idx)}
            onUpdateCondition={(idx, updates) =>
              updateCondition(machine.id, transition.id, idx, updates)
            }
          />
        ))}

        {addingTransition ? (
          <div className="sm-add-form">
            <select
              className="physics-select-sm"
              value={newFrom}
              onChange={(e) => setNewFrom(e.target.value)}
            >
              <option value="*">* ({t("sm.anyState")})</option>
              {machine.states.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <span className="sm-arrow">→</span>
            <select
              className="physics-select-sm"
              value={newTo}
              onChange={(e) => setNewTo(e.target.value)}
            >
              <option value="">{t("sm.selectState")}</option>
              {machine.states.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="physics-btn-sm"
              onClick={handleAddTransition}
              disabled={!newTo}
            >
              {t("common.ok")}
            </button>
            <button
              type="button"
              className="physics-btn-sm"
              onClick={() => setAddingTransition(false)}
            >
              {t("common.cancel")}
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="physics-btn-sm"
            onClick={() => {
              setAddingTransition(true);
              setNewTo(machine.states[0]?.id ?? "");
            }}
          >
            {t("sm.addTransition")}
          </button>
        )}
      </div>
    </div>
  );
}
