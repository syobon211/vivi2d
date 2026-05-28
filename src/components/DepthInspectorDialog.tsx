import type { ProjectData } from "@vivi2d/core/types";
import { useMemo, useState } from "react";
import { type I18nKey, useT } from "@/lib/i18n";
import {
  buildSeeThroughDepthInspectorWarnings,
  buildSeeThroughDepthNormalizationPlan,
  collectSeeThroughDepthInspectorRows,
  type SeeThroughDepthInspectorProjectWarning,
  type SeeThroughDepthInspectorRow,
  type SeeThroughDepthInspectorSortMode,
  sortSeeThroughDepthInspectorRows,
} from "@/lib/see-through-depth-inspector";
import { useEditorStore } from "@/stores/editorStore";
import { DialogShell } from "./DialogShell";

function formatSortLabel(
  t: (key: I18nKey) => string,
  mode: SeeThroughDepthInspectorSortMode,
) {
  return t(`prop.depthInspector.sort.${mode}` as I18nKey);
}

function formatProjectWarning(
  t: (key: I18nKey) => string,
  warning: SeeThroughDepthInspectorProjectWarning,
) {
  switch (warning.code) {
    case "duplicateImportedOrder":
      return `${t("prop.depthInspector.warning.duplicateImportedOrder")} (${warning.order})`;
    case "duplicateExternalDrawOrder":
      return `${t("prop.depthInspector.warning.duplicateExternalDrawOrder")} (${warning.drawOrder})`;
    case "rendererTieDepthOrder":
      return `${t("prop.depthInspector.warning.rendererTieDepthOrder")} (${warning.order})`;
    case "frontBackAdjacency":
      return `${t("prop.depthInspector.warning.frontBackAdjacency")} (${warning.labelBase ?? "group"})`;
    default:
      return warning.code;
  }
}

function getProjectWarningKey(warning: SeeThroughDepthInspectorProjectWarning) {
  return [
    warning.code,
    "order" in warning ? warning.order : undefined,
    "drawOrder" in warning ? warning.drawOrder : undefined,
    "labelBase" in warning ? warning.labelBase : undefined,
  ]
    .filter((part) => part !== undefined)
    .join(":");
}

function formatRowWarnings(
  t: (key: I18nKey) => string,
  row: SeeThroughDepthInspectorRow,
) {
  return row.warnings.map((warning) =>
    warning === "missingImportedOrder"
      ? t("prop.depthInspector.warning.missingImportedOrder")
      : t("prop.depthInspector.warning.frontBackUnknown"),
  );
}

export function DepthInspectorDialog({
  project,
  selectedLayerId,
  onClose,
}: {
  project: ProjectData;
  selectedLayerId?: string | null;
  onClose: () => void;
}) {
  const t = useT();
  const setDrawOrder = useEditorStore((state) => state.setDrawOrder);
  const setDrawOrderBatch = useEditorStore((state) => state.setDrawOrderBatch);
  const [sortMode, setSortMode] =
    useState<SeeThroughDepthInspectorSortMode>("importedDepth");

  const rows = useMemo(() => collectSeeThroughDepthInspectorRows(project), [project]);
  const sortedRows = useMemo(
    () => sortSeeThroughDepthInspectorRows(rows, sortMode),
    [rows, sortMode],
  );
  const normalizationPlan = useMemo(
    () => buildSeeThroughDepthNormalizationPlan(project),
    [project],
  );
  const warnings = useMemo(
    () => buildSeeThroughDepthInspectorWarnings(project, rows),
    [project, rows],
  );
  const hasRows = sortedRows.length > 0;

  const handleNormalize = () => {
    if (normalizationPlan.assignments.length === 0) return;
    setDrawOrderBatch(
      normalizationPlan.assignments.map((assignment) => ({
        id: assignment.layerId,
        drawOrder: assignment.toDrawOrder,
      })),
    );
  };

  return (
    <DialogShell
      onClose={onClose}
      title={t("prop.depthInspector.title")}
      minWidth={900}
      className="depth-inspector-dialog"
      footer={
        <>
          <button
            type="button"
            className="prop-btn"
            disabled={normalizationPlan.assignments.length === 0}
            onClick={handleNormalize}
          >
            {t("prop.depthInspector.normalize")}
          </button>
          <button type="button" className="prop-btn" onClick={onClose}>
            {t("common.close")}
          </button>
        </>
      }
    >
      <div className="media-export-body">
        <div className="media-export-field">
          <label className="media-export-label" htmlFor="depth-inspector-sort">
            {t("prop.depthInspector.sortLabel")}
          </label>
          <select
            id="depth-inspector-sort"
            aria-label={t("prop.depthInspector.sortLabel")}
            className="media-export-select"
            value={sortMode}
            onChange={(event) =>
              setSortMode(event.target.value as SeeThroughDepthInspectorSortMode)
            }
          >
            {(["importedDepth", "currentDrawOrder", "name"] as const).map((mode) => (
              <option key={mode} value={mode}>
                {formatSortLabel(t, mode)}
              </option>
            ))}
          </select>
        </div>

        <div className="media-export-info">
          <div>
            {t("prop.depthInspector.rowCount")}: {rows.length}
          </div>
        </div>

        {warnings.length > 0 && (
          <div className="media-export-info">
            <div>{t("prop.depthInspector.warnings")}:</div>
            <ul>
              {warnings.map((warning) => (
                <li key={getProjectWarningKey(warning)}>
                  {formatProjectWarning(t, warning)}
                </li>
              ))}
            </ul>
          </div>
        )}

        {hasRows ? (
          <div className="depth-inspector-table-wrap">
            <table className="depth-inspector-table">
              <thead>
                <tr>
                  <th>{t("prop.name")}</th>
                  <th>{t("prop.semanticRole")}</th>
                  <th>{t("prop.importLabel")}</th>
                  <th>{t("prop.depthInspector.importedDepthColumn")}</th>
                  <th>{t("prop.importFrontBack")}</th>
                  <th>{t("prop.drawOrder")}</th>
                  <th>{t("prop.depthInspector.rowWarnings")}</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row) => (
                  <tr
                    key={row.layerId}
                    data-selected={selectedLayerId === row.layerId ? "true" : "false"}
                  >
                    <td>{row.name}</td>
                    <td>
                      {row.semanticRole
                        ? t(`prop.semanticRole.${row.semanticRole}` as I18nKey)
                        : t("prop.semanticRole.unassigned")}
                    </td>
                    <td>{row.importedLabel}</td>
                    <td>{row.importedOrder ?? "-"}</td>
                    <td>{row.frontBackSplit}</td>
                    <td>
                      <input
                        aria-label={`${t("prop.depthInspector.drawOrderInput")} ${row.name}`}
                        className="media-export-select depth-inspector-draw-order-input"
                        type="number"
                        value={row.currentDrawOrder}
                        onChange={(event) =>
                          setDrawOrder(row.layerId, Number(event.target.value))
                        }
                      />
                    </td>
                    <td>
                      {row.warnings.length > 0 ? (
                        <ul>
                          {formatRowWarnings(t, row).map((warning) => (
                            <li key={warning}>{warning}</li>
                          ))}
                        </ul>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="depth-inspector-empty-state" role="status">
            <strong>{t("prop.depthInspector.emptyTitle")}</strong>
            <p>{t("prop.depthInspector.emptyDescription")}</p>
          </div>
        )}
      </div>
    </DialogShell>
  );
}
