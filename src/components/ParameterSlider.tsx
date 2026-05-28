import type { ParameterDefinition } from "@vivi2d/core/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatParamValue, getParameterStep } from "@/lib/format-utils";
import { useT } from "@/lib/i18n";
import { useEditorStore } from "@/stores/editorStore";
import { useParameterDefinitionStore } from "@/stores/parameterDefinitionStore";
import { useParameterStore } from "@/stores/parameterStore";

export function ParameterSlider({
  param,
  value,
  existingGroups,
}: {
  param: ParameterDefinition;
  value: number;
  existingGroups?: string[];
}) {
  const t = useT();
  const [showPairMenu, setShowPairMenu] = useState(false);
  const [showGroupEdit, setShowGroupEdit] = useState(false);
  const [groupInput, setGroupInput] = useState(param.group ?? "");
  const groupInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!showGroupEdit) return;
    groupInputRef.current?.focus();
  }, [showGroupEdit]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = Number(e.target.value);
      const clamped = Math.max(param.minValue, Math.min(param.maxValue, raw));
      useParameterStore.getState().setParameterValue(param.id, clamped);
    },
    [param.id, param.minValue, param.maxValue],
  );

  const handleReset = useCallback(() => {
    useParameterStore.getState().setParameterValue(param.id, param.defaultValue);
  }, [param.id, param.defaultValue]);

  const handleRemove = useCallback(() => {
    useParameterDefinitionStore.getState().removeParameter(param.id);
    const pv = { ...useParameterStore.getState().parameterValues };
    delete pv[param.id];
    useParameterStore.getState().setAllValues(pv);
  }, [param.id]);

  const handlePair = useCallback(
    (targetId: string) => {
      useParameterDefinitionStore.getState().pairParameters(param.id, targetId);
      setShowPairMenu(false);
    },
    [param.id],
  );

  const handleGroupSubmit = useCallback(() => {
    const trimmed = groupInput.trim();
    useParameterDefinitionStore
      .getState()
      .setParameterGroup(param.id, trimmed || undefined);
    setShowGroupEdit(false);
  }, [param.id, groupInput]);

  const handleGroupClick = useCallback(() => {
    setGroupInput(param.group ?? "");
    setShowGroupEdit(true);
  }, [param.group]);

  return (
    <div className="parameter-item">
      <div className="parameter-item-header">
        {}
        <button
          type="button"
          className="parameter-name"
          onDoubleClick={handleReset}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleReset();
            }
          }}
          title={t("param.resetDefaultTitle")}
        >
          {param.name}
        </button>
        <span className="parameter-value">{formatParamValue(value)}</span>
        <button
          type="button"
          className="param-remove-btn"
          onClick={handleGroupClick}
          title={t("param.changeGroupTitle")}
        >
          G
        </button>
        <div className="param-pair-wrapper">
          <button
            type="button"
            className="param-remove-btn"
            onClick={() => setShowPairMenu((v) => !v)}
            title={t("param.pairTitle")}
          >
            +
          </button>
          {showPairMenu && (
            <PairMenu
              currentId={param.id}
              onSelect={handlePair}
              onClose={() => setShowPairMenu(false)}
            />
          )}
        </div>
        <button
          type="button"
          className="param-remove-btn"
          onClick={handleRemove}
          title={t("param.deleteTitle")}
        >
          x
        </button>
      </div>
      {showGroupEdit && (
        <div className="param-group-edit">
          <input
            ref={groupInputRef}
            type="text"
            className="param-add-input param-add-name"
            placeholder={t("param.groupEditPlaceholder")}
            value={groupInput}
            onChange={(e) => setGroupInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleGroupSubmit();
              if (e.key === "Escape") setShowGroupEdit(false);
            }}
            list="param-group-edit-suggestions"
          />
          <datalist id="param-group-edit-suggestions">
            {(existingGroups ?? []).map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
          <button type="button" className="param-action-btn" onClick={handleGroupSubmit}>
            {t("common.ok")}
          </button>
        </div>
      )}
      <div className="parameter-slider-container">
        <input
          type="range"
          min={param.minValue}
          max={param.maxValue}
          step={getParameterStep(param)}
          value={value}
          onChange={handleChange}
          className="parameter-slider"
        />
      </div>
    </div>
  );
}

function PairMenu({
  currentId,
  onSelect,
  onClose,
}: {
  currentId: string;
  onSelect: (targetId: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const params = useEditorStore.getState().project?.parameters ?? [];
  const candidates = params.filter((p) => p.id !== currentId && !p.pairedParameterId);

  if (candidates.length === 0) {
    return (
      <div className="param-pair-menu" role="menu" onMouseLeave={onClose}>
        <div className="param-pair-empty">{t("param.noPairCandidates")}</div>
      </div>
    );
  }

  return (
    <div className="param-pair-menu" role="menu" onMouseLeave={onClose}>
      {candidates.map((p) => (
        <button
          key={p.id}
          type="button"
          className="param-pair-option"
          onClick={() => onSelect(p.id)}
        >
          {p.name}
        </button>
      ))}
    </div>
  );
}
