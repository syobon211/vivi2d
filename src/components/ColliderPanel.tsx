import type { ColliderConfig, LayerNode } from "@vivi2d/core/types";
import { isViviMesh } from "@vivi2d/core/types";
import { useCallback, useRef, useState } from "react";
import { type I18nKey, useT } from "@/lib/i18n";
import { useColliderStore } from "@/stores/colliderStore";
import { useEditorStore } from "@/stores/editorStore";
import { useSelectionStore } from "@/stores/selectionStore";

function shapeLabel(t: (key: I18nKey) => string, type: string): string {
  switch (type) {
    case "rectangle":
      return t("collider.shape.rectangle");
    case "circle":
      return t("collider.shape.circle");
    case "mesh":
      return t("collider.shape.mesh");
    default:
      return type;
  }
}

function collectViviMeshes(layers: LayerNode[]): { id: string; name: string }[] {
  const result: { id: string; name: string }[] = [];
  const walk = (nodes: LayerNode[]) => {
    for (const node of nodes) {
      if (isViviMesh(node)) result.push({ id: node.id, name: node.name });
      if (node.children.length > 0) walk(node.children);
    }
  };
  walk(layers);
  return result;
}

export function ColliderPanel() {
  const t = useT();
  const project = useEditorStore((s) => s.project);
  const selectedLayerIds = useSelectionStore((s) => s.selectedLayerIds);
  const addRectCollider = useColliderStore((s) => s.addRectCollider);
  const addCircleCollider = useColliderStore((s) => s.addCircleCollider);
  const _addMeshCollider = useColliderStore((s) => s.addMeshCollider);
  const addMeshCollidersFromSelection = useColliderStore(
    (s) => s.addMeshCollidersFromSelection,
  );
  const removeCollider = useColliderStore((s) => s.removeCollider);
  const toggleCollider = useColliderStore((s) => s.toggleCollider);
  const renameCollider = useColliderStore((s) => s.renameCollider);
  const setTag = useColliderStore((s) => s.setTag);
  const selectedColliderId = useColliderStore((s) => s.selectedColliderId);
  const selectCollider = useColliderStore((s) => s.selectCollider);

  const [addingType, setAddingType] = useState<"rectangle" | "circle" | null>(null);
  const [newName, setNewName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleStartAdd = useCallback((type: "rectangle" | "circle") => {
    setAddingType(type);
    setNewName("");
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const handleConfirmAdd = useCallback(() => {
    const trimmed = newName.trim();
    if (!trimmed || !addingType || !project) return;
    const cx = project.width / 2;
    const cy = project.height / 2;
    if (addingType === "rectangle") {
      addRectCollider(trimmed, cx - 50, cy - 50, 100, 100);
    } else {
      addCircleCollider(trimmed, cx, cy, 50);
    }
    setAddingType(null);
    setNewName("");
  }, [newName, addingType, project, addRectCollider, addCircleCollider]);

  const handleAddFromSelection = useCallback(() => {
    if (selectedLayerIds.length === 0 || !project) return;
    const meshIds = selectedLayerIds.filter((id) => {
      const walk = (nodes: LayerNode[]): boolean => {
        for (const n of nodes) {
          if (n.id === id && isViviMesh(n)) return true;
          if (n.children.length > 0 && walk(n.children)) return true;
        }
        return false;
      };
      return walk(project.layers);
    });
    if (meshIds.length > 0) {
      addMeshCollidersFromSelection(meshIds);
    }
  }, [selectedLayerIds, project, addMeshCollidersFromSelection]);

  const colliders = project?.colliders ?? [];
  const handleListKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (colliders.length === 0) return;
      const activeId = (document.activeElement as HTMLElement | null)?.dataset
        ?.colliderId;
      if (!activeId) return;
      const idx = colliders.findIndex((c) => c.id === activeId);
      if (idx < 0) return;

      const focusAt = (i: number) => {
        const clamped = Math.max(0, Math.min(colliders.length - 1, i));
        const target = colliders[clamped];
        if (!target) return;
        (
          e.currentTarget.querySelector<HTMLElement>(
            `[data-collider-id="${target.id}"]`,
          ) ?? null
        )?.focus();
      };

      if (e.key === "ArrowDown") {
        e.preventDefault();
        focusAt(idx + 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        focusAt(idx - 1);
      } else if (e.key === "Home") {
        e.preventDefault();
        focusAt(0);
      } else if (e.key === "End") {
        e.preventDefault();
        focusAt(colliders.length - 1);
      }
    },
    [colliders],
  );

  if (!project) return null;

  const meshes = collectViviMeshes(project.layers);
  const meshNameMap = new Map(meshes.map((m) => [m.id, m.name]));
  const hasSelectedMeshes =
    selectedLayerIds.length > 0 &&
    selectedLayerIds.some((id) => meshes.some((m) => m.id === id));

  return (
    <div className="panel collider-panel">
      <div className="panel-header">{t("collider.title")}</div>
      <div className="panel-content scrollbar-thin">
        {colliders.length === 0 && !addingType && (
          <div className="panel-empty">{t("collider.none")}</div>
        )}

        {}
        {colliders.length > 0 && (
          <div
            role="listbox"
            aria-label={t("collider.title")}
            onKeyDown={handleListKeyDown}
          >
            {colliders.map((collider: ColliderConfig) => (
              <ColliderItem
                key={collider.id}
                collider={collider}
                isSelected={collider.id === selectedColliderId}
                meshNameMap={meshNameMap}
                onSelect={() => selectCollider(collider.id)}
                onToggle={() => toggleCollider(collider.id)}
                onRemove={() => removeCollider(collider.id)}
                onRename={(name) => renameCollider(collider.id, name)}
                onSetTag={(tag) => setTag(collider.id, tag)}
              />
            ))}
          </div>
        )}

        {}
        {addingType && (
          <div className="collider-add-form">
            <input
              ref={inputRef}
              type="text"
              className="collider-name-input"
              placeholder={t("collider.namePlaceholder")}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleConfirmAdd();
                if (e.key === "Escape") {
                  setAddingType(null);
                  setNewName("");
                }
              }}
            />
            <div className="collider-add-form-actions">
              <button
                type="button"
                className="param-action-btn"
                onClick={handleConfirmAdd}
                disabled={!newName.trim()}
              >
                {t("common.ok")}
              </button>
              <button
                type="button"
                className="param-action-btn"
                onClick={() => {
                  setAddingType(null);
                  setNewName("");
                }}
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        )}

        {}
        <div className="collider-actions">
          <button
            type="button"
            className="physics-btn"
            onClick={() => handleStartAdd("rectangle")}
            disabled={addingType !== null}
          >
            {t("collider.addRect")}
          </button>
          <button
            type="button"
            className="physics-btn"
            onClick={() => handleStartAdd("circle")}
            disabled={addingType !== null}
          >
            {t("collider.addCircle")}
          </button>
          <button
            type="button"
            className="physics-btn"
            onClick={handleAddFromSelection}
            disabled={!hasSelectedMeshes}
            title={
              hasSelectedMeshes
                ? t("collider.addMeshTitle")
                : t("collider.selectMeshFirst")
            }
          >
            {t("collider.addMesh")}
          </button>
        </div>
      </div>
    </div>
  );
}

function ColliderItem({
  collider,
  isSelected,
  meshNameMap,
  onSelect,
  onToggle,
  onRemove,
  onRename,
  onSetTag,
}: {
  collider: ColliderConfig;
  isSelected: boolean;
  meshNameMap: Map<string, string>;
  onSelect: () => void;
  onToggle: () => void;
  onRemove: () => void;
  onRename: (name: string) => void;
  onSetTag: (tag: string | undefined) => void;
}) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(collider.name);
  const [editingTag, setEditingTag] = useState(false);
  const [editTag, setEditTag] = useState(collider.tag ?? "");

  const shapeInfo =
    collider.shape.type === "mesh"
      ? (meshNameMap.get(collider.shape.meshId) ?? "?")
      : `${shapeLabel(t, collider.shape.type)}`;

  const handleItemKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (editing || editingTag) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect();
    } else if (e.key === "F2") {
      e.preventDefault();
      setEditName(collider.name);
      setEditing(true);
    } else if (e.key === "Delete") {
      e.preventDefault();
      onRemove();
    }
  };

  return (
    <div
      className={`collider-item ${collider.enabled ? "" : "collider-disabled"} ${isSelected ? "collider-selected" : ""}`}
      onClick={onSelect}
      onKeyDown={handleItemKeyDown}
      role="option"
      aria-selected={isSelected}
      data-collider-id={collider.id}
      tabIndex={isSelected ? 0 : -1}
    >
      <div className="collider-item-row">
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation keeps item selection stable. */}
        <label className="collider-toggle" onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" checked={collider.enabled} onChange={onToggle} />
        </label>

        {editing ? (
          <input
            type="text"
            className="collider-name-inline"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={() => {
              if (editName.trim()) onRename(editName.trim());
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (editName.trim()) onRename(editName.trim());
                setEditing(false);
              }
              if (e.key === "Escape") setEditing(false);
            }}
          />
        ) : (
          <button
            type="button"
            className="collider-name collider-inline-action"
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => {
              e.stopPropagation();
              setEditName(collider.name);
              setEditing(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "F2") {
                e.stopPropagation();
                setEditName(collider.name);
                setEditing(true);
              }
            }}
          >
            {collider.name}
          </button>
        )}

        <span className="collider-shape-badge">{shapeInfo}</span>

        <button
          type="button"
          className="collider-remove-btn"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          title={t("common.delete")}
        >
          x
        </button>
      </div>

      {/* Tag Row */}
      <div className="collider-tag-row">
        {editingTag ? (
          <input
            type="text"
            className="collider-tag-input"
            placeholder={t("collider.tagPlaceholder")}
            value={editTag}
            onChange={(e) => setEditTag(e.target.value)}
            onBlur={() => {
              onSetTag(editTag.trim() || undefined);
              setEditingTag(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onSetTag(editTag.trim() || undefined);
                setEditingTag(false);
              }
              if (e.key === "Escape") setEditingTag(false);
            }}
          />
        ) : (
          <button
            type="button"
            className="collider-tag collider-inline-action"
            onClick={(e) => {
              e.stopPropagation();
              setEditTag(collider.tag ?? "");
              setEditingTag(true);
            }}
          >
            {collider.tag ? `#${collider.tag}` : t("collider.noTag")}
          </button>
        )}
      </div>
    </div>
  );
}
