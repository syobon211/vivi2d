import { useCallback, useEffect, useRef, useState } from "react";
import { type I18nKey, useT } from "@/lib/i18n";
import {
  bindingsEqual,
  bindingToString,
  DEFAULT_KEYMAP,
  eventToBinding,
  findConflicts,
  SHORTCUT_ACTIONS,
  type ShortcutAction,
  useShortcutStore,
} from "@/stores/shortcutStore";
import { DialogShell } from "./DialogShell";

const SHORTCUT_ACTION_LABEL_KEYS: Record<ShortcutAction, I18nKey> = {
  undo: "shortcut.action.undo",
  redo: "shortcut.action.redo",
  save: "shortcut.action.save",
  saveAs: "shortcut.action.saveAs",
  moveLayerUp: "shortcut.action.moveLayerUp",
  moveLayerDown: "shortcut.action.moveLayerDown",
  selectAll: "shortcut.action.selectAll",
  toolSelect: "shortcut.action.toolSelect",
  toolPan: "shortcut.action.toolPan",
  toolMeshEdit: "shortcut.action.toolMeshEdit",
  tempPan: "shortcut.action.tempPan",
};

export function ShortcutSettingsDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const keymap = useShortcutStore((s) => s.keymap);
  const setShortcut = useShortcutStore((s) => s.setShortcut);
  const resetShortcut = useShortcutStore((s) => s.resetShortcut);
  const resetAll = useShortcutStore((s) => s.resetAll);
  const importKeymap = useShortcutStore((s) => s.importKeymap);

  const [capturing, setCapturing] = useState<ShortcutAction | null>(null);

  useEffect(() => {
    if (!capturing) return;

    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        setCapturing(null);
        return;
      }

      if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return;

      const binding = eventToBinding(e);
      setShortcut(capturing, binding);
      setCapturing(null);
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [capturing, setShortcut]);

  const handleExport = useCallback(() => {
    const json = JSON.stringify(keymap, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vivi2d-shortcuts.json";
    a.click();
    URL.revokeObjectURL(url);
  }, [keymap]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleImport = useCallback(() => {
    fileInputRef.current?.click();
  }, []);
  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        importKeymap(parsed);
      } catch {}
      e.target.value = "";
    },
    [importKeymap],
  );

  return (
    <DialogShell
      onClose={onClose}
      title={t("shortcut.title")}
      className="shortcut-dialog"
      disableEscape={capturing !== null}
    >
      <div className="shortcut-table">
        <div className="shortcut-header-row">
          <span className="shortcut-col-action">{t("shortcut.action")}</span>
          <span className="shortcut-col-key">{t("shortcut.shortcutCol")}</span>
          <span className="shortcut-col-reset" />
        </div>
        {SHORTCUT_ACTIONS.map((action) => {
          const binding = keymap[action];
          const isCapturing = capturing === action;
          const isDefault = bindingsEqual(binding, DEFAULT_KEYMAP[action]);
          const conflicts = findConflicts(keymap, action, binding);
          const actionLabel = t(SHORTCUT_ACTION_LABEL_KEYS[action]);

          return (
            <div key={action} className="shortcut-row">
              <span className="shortcut-col-action">{actionLabel}</span>
              <button
                type="button"
                className={`shortcut-key-btn ${isCapturing ? "capturing" : ""} ${conflicts.length > 0 ? "conflict" : ""}`}
                onClick={() => setCapturing(isCapturing ? null : action)}
                title={
                  conflicts.length > 0
                    ? `${t("shortcut.conflictPrefix")} ${conflicts
                        .map((c) => t(SHORTCUT_ACTION_LABEL_KEYS[c]))
                        .join(", ")}`
                    : t("shortcut.clickToChange")
                }
              >
                {isCapturing ? t("shortcut.pressKey") : bindingToString(binding)}
              </button>
              <button
                type="button"
                className="shortcut-reset-btn"
                onClick={() => resetShortcut(action)}
                disabled={isDefault}
                title={t("shortcut.restoreDefault")}
              >
                ↺
              </button>
            </div>
          );
        })}
      </div>

      <div className="shortcut-footer">
        <div className="shortcut-footer-left">
          <button type="button" className="prop-btn" onClick={resetAll}>
            {t("shortcut.resetAll")}
          </button>
          <button type="button" className="prop-btn" onClick={handleExport}>
            {t("common.export")}
          </button>
          <button type="button" className="prop-btn" onClick={handleImport}>
            {t("common.import")}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            style={{ display: "none" }}
            onChange={handleFileChange}
          />
        </div>
        <button type="button" className="prop-btn" onClick={onClose}>
          {t("common.close")}
        </button>
      </div>
    </DialogShell>
  );
}
