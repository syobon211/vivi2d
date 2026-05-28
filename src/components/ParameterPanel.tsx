import type { ParameterDefinition } from "@vivi2d/core/types";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useT } from "@/lib/i18n";
import { useEditorStore } from "@/stores/editorStore";
import { useParameterDefinitionStore } from "@/stores/parameterDefinitionStore";
import { useParameterStore } from "@/stores/parameterStore";
import { ParameterSlider } from "./ParameterSlider";
import { ParameterSlider2D } from "./ParameterSlider2D";
import { TemplateDropdown } from "./TemplateDropdown";

const UNGROUPED = "__vivi2d_ungrouped__";

type ParamItem =
  | { type: "1d"; param: ParameterDefinition }
  | { type: "2d"; paramX: ParameterDefinition; paramY: ParameterDefinition };

export function ParameterPanel() {
  const t = useT();
  const project = useEditorStore((s) => s.project);
  const parameterValues = useParameterStore((s) => s.parameterValues);
  const [filter, setFilter] = useState("");
  const deferredFilter = useDeferredValue(filter);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const paramItems = useMemo(() => {
    if (!project) return [];
    const rendered = new Set<string>();
    const items: ParamItem[] = [];

    for (const param of project.parameters) {
      if (rendered.has(param.id)) continue;
      const pairedId = param.pairedParameterId;
      const paired = pairedId
        ? project.parameters.find((p) => p.id === pairedId)
        : undefined;
      if (paired && !rendered.has(paired.id)) {
        items.push({ type: "2d", paramX: param, paramY: paired });
        rendered.add(param.id);
        rendered.add(paired.id);
      } else {
        items.push({ type: "1d", param });
        rendered.add(param.id);
      }
    }
    return items;
  }, [project]);

  const filteredItems = useMemo(() => {
    if (!deferredFilter.trim()) return paramItems;
    const q = deferredFilter.toLowerCase();
    return paramItems.filter((item) => {
      if (item.type === "1d") {
        return (
          item.param.name.toLowerCase().includes(q) ||
          (item.param.group ?? "").toLowerCase().includes(q)
        );
      }
      return (
        item.paramX.name.toLowerCase().includes(q) ||
        item.paramY.name.toLowerCase().includes(q) ||
        (item.paramX.group ?? "").toLowerCase().includes(q)
      );
    });
  }, [paramItems, deferredFilter]);

  const groupedItems = useMemo(() => {
    const groups = new Map<string, ParamItem[]>();
    for (const item of filteredItems) {
      const groupName =
        (item.type === "1d" ? item.param.group : item.paramX.group) ?? UNGROUPED;
      const list = groups.get(groupName) ?? [];
      list.push(item);
      groups.set(groupName, list);
    }
    return groups;
  }, [filteredItems]);

  const existingGroups = useMemo(() => {
    if (!project) return [];
    const names = new Set<string>();
    for (const p of project.parameters) {
      if (p.group) names.add(p.group);
    }
    return [...names].sort();
  }, [project]);

  const toggleGroup = useCallback((name: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }, []);

  if (!project) return null;

  return (
    <div className="parameter-panel">
      <div className="parameter-panel-header">
        <span className="parameter-panel-title">{t("param.title")}</span>
        <div className="parameter-panel-actions">
          <TemplateDropdown category="parameter" />
          <ResetButton />
          <AddParameterButton existingGroups={existingGroups} />
        </div>
      </div>
      {}
      {project.parameters.length > 0 && (
        <div className="parameter-filter-row">
          <input
            type="text"
            className="parameter-filter-input"
            placeholder={t("common.search")}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          {filter && (
            <button
              type="button"
              className="parameter-filter-clear"
              onClick={() => setFilter("")}
            >
              x
            </button>
          )}
        </div>
      )}
      <div className="parameter-list scrollbar-thin">
        {filteredItems.length === 0 ? (
          <div className="parameter-empty">
            {paramItems.length === 0 ? t("param.noParams") : t("param.noMatch")}
          </div>
        ) : (
          [...groupedItems.entries()].map(([groupName, items]) => (
            <ParameterGroup
              key={groupName}
              name={groupName}
              items={items}
              collapsed={collapsedGroups.has(groupName)}
              onToggle={() => toggleGroup(groupName)}
              parameterValues={parameterValues}
              showHeader={groupedItems.size > 1 || groupName !== UNGROUPED}
              existingGroups={existingGroups}
            />
          ))
        )}
      </div>
    </div>
  );
}

function ParameterGroup({
  name,
  items,
  collapsed,
  onToggle,
  parameterValues,
  showHeader,
  existingGroups,
}: {
  name: string;
  items: ParamItem[];
  collapsed: boolean;
  onToggle: () => void;
  parameterValues: Record<string, number>;
  showHeader: boolean;
  existingGroups: string[];
}) {
  const t = useT();
  return (
    <div className="parameter-group">
      {showHeader && (
        <button type="button" className="parameter-group-header" onClick={onToggle}>
          <span className="parameter-group-arrow">{collapsed ? ">" : "v"}</span>
          <span className="parameter-group-name">
            {name === UNGROUPED ? t("param.ungrouped") : name}
          </span>
          <span className="parameter-group-count">{items.length}</span>
        </button>
      )}
      {!collapsed && (
        <div className="parameter-group-body">
          {items.map((item) =>
            item.type === "2d" ? (
              <ParameterSlider2D
                key={`${item.paramX.id}-${item.paramY.id}`}
                paramX={item.paramX}
                paramY={item.paramY}
                valueX={parameterValues[item.paramX.id] ?? item.paramX.defaultValue}
                valueY={parameterValues[item.paramY.id] ?? item.paramY.defaultValue}
              />
            ) : (
              <ParameterSlider
                key={item.param.id}
                param={item.param}
                value={parameterValues[item.param.id] ?? item.param.defaultValue}
                existingGroups={existingGroups}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}

function ResetButton() {
  const t = useT();
  const handleReset = useCallback(() => {
    const project = useEditorStore.getState().project;
    if (!project) return;
    useParameterStore
      .getState()
      .setAllValues(
        Object.fromEntries(project.parameters.map((p) => [p.id, p.defaultValue])),
      );
  }, []);

  return (
    <button
      type="button"
      className="param-action-btn"
      onClick={handleReset}
      title={t("param.resetAllTitle")}
    >
      {t("common.reset")}
    </button>
  );
}

function AddParameterButton({ existingGroups }: { existingGroups: string[] }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [min, setMin] = useState("-30");
  const [max, setMax] = useState("30");
  const [def, setDef] = useState("0");
  const [group, setGroup] = useState("");

  useEffect(() => {
    if (!open) return;
    nameInputRef.current?.focus();
  }, [open]);

  const handleSubmit = useCallback(() => {
    const minVal = Number(min);
    const maxVal = Number(max);
    const defVal = Number(def);
    if (
      !name.trim() ||
      Number.isNaN(minVal) ||
      Number.isNaN(maxVal) ||
      Number.isNaN(defVal)
    )
      return;
    if (minVal >= maxVal) return;
    const clampedDef = Math.max(minVal, Math.min(maxVal, defVal));
    useParameterDefinitionStore
      .getState()
      .addParameter(name.trim(), minVal, maxVal, clampedDef, group.trim() || undefined);
    const params = useEditorStore.getState().project?.parameters ?? [];
    const added = params[params.length - 1];
    if (added) {
      useParameterStore.getState().setParameterValue(added.id, added.defaultValue);
    }
    setName("");
    setMin("-30");
    setMax("30");
    setDef("0");
    setGroup("");
    setOpen(false);
  }, [name, min, max, def, group]);

  if (!open) {
    return (
      <button type="button" className="param-action-btn" onClick={() => setOpen(true)}>
        {t("common.add")}
      </button>
    );
  }

  return (
    <div className="param-add-form">
      <input
        ref={nameInputRef}
        type="text"
        placeholder={t("param.paramName")}
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="param-add-input param-add-name"
        onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
      />
      <div className="param-add-row">
        <input
          type="number"
          placeholder={t("param.min")}
          value={min}
          onChange={(e) => setMin(e.target.value)}
          className="param-add-input param-add-num"
        />
        <input
          type="number"
          placeholder={t("param.max")}
          value={max}
          onChange={(e) => setMax(e.target.value)}
          className="param-add-input param-add-num"
        />
        <input
          type="number"
          placeholder={t("param.default")}
          value={def}
          onChange={(e) => setDef(e.target.value)}
          className="param-add-input param-add-num"
        />
      </div>
      <div className="param-add-row">
        <input
          type="text"
          placeholder={t("param.group")}
          value={group}
          onChange={(e) => setGroup(e.target.value)}
          className="param-add-input param-add-name"
          list="param-group-suggestions"
        />
        <datalist id="param-group-suggestions">
          {existingGroups.map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>
      </div>
      <div className="param-add-actions">
        <button type="button" className="param-action-btn" onClick={handleSubmit}>
          {t("common.ok")}
        </button>
        <button type="button" className="param-action-btn" onClick={() => setOpen(false)}>
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
}
