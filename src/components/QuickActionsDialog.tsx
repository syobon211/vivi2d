import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import {
  type QuickActionRegistration,
  useQuickActionRegistryStore,
} from "@/stores/quickActionRegistryStore";
import { useQuickActionsStore } from "@/stores/quickActionsStore";
import { useViewportStore } from "@/stores/viewportStore";
import { useWorkspaceModeStore } from "@/stores/workspaceModeStore";
import { DialogShell } from "./DialogShell";

type QuickActionView = QuickActionRegistration & {
  enabled: boolean;
  disabledReason?: string;
  source: "registry" | "direct";
};

const SECTION_ORDER = ["project", "timeline", "view", "workspace"] as const;

function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase();
}

function buildSearchHaystack(action: QuickActionView, sectionLabel: string): string {
  return normalizeSearchText(
    [action.title, action.description ?? "", sectionLabel, ...action.keywords].join(" "),
  );
}

export function QuickActionsDialog() {
  const t = useT();
  const open = useQuickActionsStore((s) => s.open);
  const closePalette = useQuickActionsStore((s) => s.closePalette);
  const registryActions = useQuickActionRegistryStore((s) => s.actions);
  const resetView = useViewportStore((s) => s.resetView);
  const setTool = useViewportStore((s) => s.setTool);
  const setWorkspaceMode = useWorkspaceModeStore((s) => s.setMode);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const directActions = useMemo<QuickActionView[]>(
    () => [
      {
        id: "view.reset",
        section: "view",
        title: t("menu.resetView"),
        description: t("menu.resetViewTitle"),
        keywords: ["reset", "view", "camera", "viewport"],
        order: 10,
        source: "direct",
        enabled: true,
        run: () => resetView(),
        getAvailability: () => ({ enabled: true }),
      },
      {
        id: "tool.select",
        section: "view",
        title: t("menu.select"),
        description: t("menu.selectTitle"),
        keywords: ["select", "tool", "cursor"],
        order: 20,
        source: "direct",
        enabled: true,
        run: () => setTool("select"),
        getAvailability: () => ({ enabled: true }),
      },
      {
        id: "tool.pan",
        section: "view",
        title: t("menu.pan"),
        description: t("menu.panTitle"),
        keywords: ["pan", "tool", "move"],
        order: 30,
        source: "direct",
        enabled: true,
        run: () => setTool("pan"),
        getAvailability: () => ({ enabled: true }),
      },
      {
        id: "tool.meshEdit",
        section: "view",
        title: t("menu.mesh"),
        description: t("menu.meshTitle"),
        keywords: ["mesh", "edit", "tool"],
        order: 40,
        source: "direct",
        enabled: true,
        run: () => setTool("meshEdit"),
        getAvailability: () => ({ enabled: true }),
      },
      {
        id: "workspace.default",
        section: "workspace",
        title: t("menu.defaultWorkspace"),
        description: t("menu.defaultWorkspaceTitle"),
        keywords: ["workspace", "default", "editing"],
        order: 10,
        source: "direct",
        enabled: true,
        run: () => setWorkspaceMode("default"),
        getAvailability: () => ({ enabled: true }),
      },
      {
        id: "workspace.rigging",
        section: "workspace",
        title: t("menu.riggingWorkspace"),
        description: t("menu.riggingWorkspaceTitle"),
        keywords: ["workspace", "rigging"],
        order: 20,
        source: "direct",
        enabled: true,
        run: () => setWorkspaceMode("rigging"),
        getAvailability: () => ({ enabled: true }),
      },
      {
        id: "workspace.animation",
        section: "workspace",
        title: t("menu.animationWorkspace"),
        description: t("menu.animationWorkspaceTitle"),
        keywords: ["workspace", "animation"],
        order: 30,
        source: "direct",
        enabled: true,
        run: () => setWorkspaceMode("animation"),
        getAvailability: () => ({ enabled: true }),
      },
    ],
    [resetView, setTool, setWorkspaceMode, t],
  );

  const actions = useMemo<QuickActionView[]>(() => {
    const delegated = Object.values(registryActions).map((action) => {
      const availability = action.getAvailability();
      return {
        ...action,
        source: "registry" as const,
        enabled: availability.enabled,
        disabledReason: availability.reason,
      };
    });
    return [...delegated, ...directActions].sort((a, b) => {
      const sectionDelta =
        SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section);
      if (sectionDelta !== 0) return sectionDelta;
      if (a.order !== b.order) return a.order - b.order;
      return a.title.localeCompare(b.title);
    });
  }, [directActions, registryActions]);

  const filteredActions = useMemo(() => {
    const normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery) return actions;
    return actions.filter((action) => {
      const sectionLabel = t(`quickActions.section.${action.section}`);
      return buildSearchHaystack(action, sectionLabel).includes(normalizedQuery);
    });
  }, [actions, query, t]);

  const groupedActions = useMemo(() => {
    return SECTION_ORDER.map((section) => ({
      section,
      label: t(`quickActions.section.${section}`),
      actions: filteredActions.filter((action) => action.section === section),
    })).filter((group) => group.actions.length > 0);
  }, [filteredActions, t]);

  const firstEnabledAction = useMemo(
    () => filteredActions.find((action) => action.enabled),
    [filteredActions],
  );

  useEffect(() => {
    if (!open) return;
    setQuery("");
    queueMicrotask(() => inputRef.current?.focus());
  }, [open]);

  const runAction = (action: QuickActionView) => {
    if (!action.enabled) return;
    closePalette();
    window.setTimeout(() => {
      action.run();
    }, 0);
  };

  if (!open) return null;

  return (
    <DialogShell
      onClose={closePalette}
      title={t("quickActions.title")}
      minWidth={560}
      contentStyle={{ maxHeight: "70vh", display: "flex", flexDirection: "column" }}
      footer={
        <button type="button" className="modal-btn" onClick={closePalette}>
          {t("common.close")}
        </button>
      }
    >
      <form
        className="quick-actions-body"
        onSubmit={(event) => {
          event.preventDefault();
          if (firstEnabledAction) runAction(firstEnabledAction);
        }}
      >
        <label className="quick-actions-search-label" htmlFor="quick-actions-search">
          {t("quickActions.searchLabel")}
        </label>
        <input
          id="quick-actions-search"
          ref={inputRef}
          className="quick-actions-search-input"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("quickActions.searchPlaceholder")}
          aria-label={t("quickActions.searchLabel")}
        />
        <div className="quick-actions-results scrollbar-thin">
          {groupedActions.length === 0 ? (
            <div className="quick-actions-empty">{t("quickActions.noResults")}</div>
          ) : (
            groupedActions.map((group) => (
              <div key={group.section} className="quick-actions-group">
                <div className="quick-actions-group-label">{group.label}</div>
                <div className="quick-actions-group-list">
                  {group.actions.map((action) => (
                    <button
                      key={action.id}
                      type="button"
                      className={`quick-actions-item${action.enabled ? "" : " quick-actions-item-disabled"}`}
                      onClick={() => runAction(action)}
                      disabled={!action.enabled}
                    >
                      <span className="quick-actions-item-header">
                        <span className="quick-actions-item-title">{action.title}</span>
                        {action.source === "registry" && (
                          <span className="quick-actions-item-badge">
                            {t("quickActions.dialogActionBadge")}
                          </span>
                        )}
                      </span>
                      {action.description && (
                        <span className="quick-actions-item-description">
                          {action.description}
                        </span>
                      )}
                      {!action.enabled && action.disabledReason && (
                        <span className="quick-actions-item-disabled-reason">
                          {action.disabledReason}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </form>
    </DialogShell>
  );
}
