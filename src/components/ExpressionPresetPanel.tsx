import { useCallback, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { useEditorStore } from "@/stores/editorStore";
import { useExpressionPresetStore } from "@/stores/expressionPresetStore";

const HOTKEY_MAX = 9;

export function ExpressionPresetPanel() {
  const t = useT();
  const project = useEditorStore((s) => s.project);
  const presets = project?.expressionPresets ?? [];
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleAdd = useCallback(() => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    useExpressionPresetStore.getState().createPreset(trimmed);
    setNewName("");
    setAdding(false);
  }, [newName]);

  const handleStartAdd = useCallback(() => {
    setAdding(true);
    setNewName("");
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  if (!project) return null;

  return (
    <div className="expression-preset-panel">
      <div className="expression-preset-header">
        <span className="expression-preset-panel-title">
          {t("expressionPreset.title")}
        </span>
      </div>
      <div className="expression-preset-list scrollbar-thin">
        {presets.length === 0 && !adding && (
          <div className="expression-preset-empty">{t("expressionPreset.none")}</div>
        )}
        {presets.map((preset) => (
          <PresetItem
            key={preset.id}
            presetId={preset.id}
            name={preset.name}
            hotkey={preset.hotkey}
          />
        ))}
      </div>
      {adding ? (
        <div className="expression-preset-add-form">
          <input
            ref={inputRef}
            type="text"
            className="expression-preset-name-input"
            placeholder={t("expressionPreset.namePrompt")}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
              if (e.key === "Escape") setAdding(false);
            }}
          />
          <button type="button" className="param-action-btn" onClick={handleAdd}>
            {t("common.ok")}
          </button>
          <button
            type="button"
            className="param-action-btn"
            onClick={() => setAdding(false)}
          >
            {t("common.cancel")}
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="expression-preset-add-btn"
          onClick={handleStartAdd}
        >
          {t("expressionPreset.save")}
        </button>
      )}
    </div>
  );
}

function PresetItem({
  presetId,
  name,
  hotkey,
}: {
  presetId: string;
  name: string;
  hotkey: number | undefined;
}) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(name);
  const store = useExpressionPresetStore.getState();

  const commitRename = useCallback(() => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== name) {
      useExpressionPresetStore.getState().renamePreset(presetId, trimmed);
    }
    setEditing(false);
  }, [presetId, name, editName]);

  const cycleHotkey = useCallback(() => {
    const next = hotkey === undefined ? 1 : hotkey >= HOTKEY_MAX ? undefined : hotkey + 1;
    useExpressionPresetStore.getState().setHotkey(presetId, next);
  }, [presetId, hotkey]);

  return (
    <div className="expression-preset-item">
      {}
      <button
        type="button"
        className="expression-preset-hotkey"
        onClick={cycleHotkey}
        title={t("expressionPreset.hotkey")}
      >
        {hotkey !== undefined ? hotkey : "-"}
      </button>

      {}
      {editing ? (
        <input
          type="text"
          className="expression-preset-name-input expression-preset-name-inline"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") setEditing(false);
          }}
        />
      ) : (
        <button
          type="button"
          className="expression-preset-name"
          onDoubleClick={() => {
            setEditName(name);
            setEditing(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "F2") {
              setEditName(name);
              setEditing(true);
            }
          }}
          title={t("expressionPreset.rename")}
        >
          {name}
        </button>
      )}

      {}
      <div className="expression-preset-actions">
        <button
          type="button"
          className="param-action-btn"
          onClick={() => store.applyPreset(presetId)}
          title={t("expressionPreset.apply")}
        >
          {t("expressionPreset.apply")}
        </button>
        <button
          type="button"
          className="param-action-btn expression-preset-delete-btn"
          onClick={() => store.removePreset(presetId)}
          title={t("expressionPreset.delete")}
        >
          x
        </button>
      </div>
    </div>
  );
}
