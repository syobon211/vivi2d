import type { BindingTarget, ParameterBinding } from "@vivi2d/core/types";
import { useMemo, useState } from "react";
import { useT } from "@/lib/i18n";
import { useEditorStore } from "@/stores/editorStore";
import { useParameterBindingStore } from "@/stores/parameterBindingStore";
import { useParameterStore } from "@/stores/parameterStore";

export function ParameterBindingSection({
  target,
  currentValue,
}: {
  target: BindingTarget;

  currentValue: number;
}) {
  const t = useT();
  const project = useEditorStore((s) => s.project);
  const parameterValues = useParameterStore((s) => s.parameterValues);
  const addBinding = useParameterBindingStore((s) => s.addBinding);
  const removeBinding = useParameterBindingStore((s) => s.removeBinding);
  const setBindingPoint = useParameterBindingStore((s) => s.setBindingPoint);
  const removeBindingPoint = useParameterBindingStore((s) => s.removeBindingPoint);
  const copyBindingPoints = useParameterBindingStore((s) => s.copyBindingPoints);
  const pasteBindingPoints = useParameterBindingStore((s) => s.pasteBindingPoints);
  const pasteBindingPointsMirrored = useParameterBindingStore(
    (s) => s.pasteBindingPointsMirrored,
  );
  const [showParamSelect, setShowParamSelect] = useState(false);
  const canAuthorTarget = isPublicBindingTarget(target);

  const bindings = useMemo(() => {
    if (!project?.parameterBindings) return [];
    return project.parameterBindings.filter((b) => matchTarget(b.target, target));
  }, [project?.parameterBindings, target]);

  const boundParamIds = useMemo(
    () => new Set(bindings.map((b) => b.parameterId)),
    [bindings],
  );

  const availableParams = useMemo(
    () => (project?.parameters ?? []).filter((p) => !boundParamIds.has(p.id)),
    [project?.parameters, boundParamIds],
  );

  const handleAddBinding = (parameterId: string) => {
    if (!canAuthorTarget) return;
    addBinding(parameterId, target);
    setShowParamSelect(false);
  };

  const handleRecordBindingPoint = (binding: ParameterBinding) => {
    const paramValue = parameterValues[binding.parameterId] ?? 0;
    setBindingPoint(binding.id, paramValue, currentValue);
  };

  return (
    <div className="binding-section">
      <div className="binding-header">{t("prop.binding.title")}</div>
      {bindings.length > 0 ? (
        bindings.map((binding) => (
          <BindingItem
            key={binding.id}
            binding={binding}
            paramName={
              project?.parameters.find((p) => p.id === binding.parameterId)?.name ?? "?"
            }
            paramValue={parameterValues[binding.parameterId] ?? 0}
            onRecord={() => handleRecordBindingPoint(binding)}
            onRemoveBindingPoint={(pv) => removeBindingPoint(binding.id, pv)}
            onRemoveBinding={() => removeBinding(binding.id)}
            onCopy={() => copyBindingPoints(binding.id)}
            onPaste={() => pasteBindingPoints(binding.id)}
            onPasteMirrored={() => pasteBindingPointsMirrored(binding.id)}
          />
        ))
      ) : (
        <div className="binding-empty">{t("prop.binding.none")}</div>
      )}
      {!canAuthorTarget ? null : showParamSelect ? (
        <div className="binding-param-select">
          {availableParams.length > 0 ? (
            availableParams.map((p) => (
              <button
                key={p.id}
                type="button"
                className="binding-param-option"
                onClick={() => handleAddBinding(p.id)}
              >
                {p.name}
              </button>
            ))
          ) : (
            <div className="binding-empty">{t("prop.binding.noAvailableParams")}</div>
          )}
          <button
            type="button"
            className="prop-btn"
            onClick={() => setShowParamSelect(false)}
          >
            {t("prop.binding.cancel")}
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="prop-btn"
          onClick={() => setShowParamSelect(true)}
        >
          {t("prop.binding.add")}
        </button>
      )}
    </div>
  );
}

function BindingItem({
  binding,
  paramName,
  paramValue,
  onRecord,
  onRemoveBindingPoint,
  onRemoveBinding,
  onCopy,
  onPaste,
  onPasteMirrored,
}: {
  binding: ParameterBinding;
  paramName: string;
  paramValue: number;
  onRecord: () => void;
  onRemoveBindingPoint: (paramValue: number) => void;
  onRemoveBinding: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onPasteMirrored: () => void;
}) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="binding-item">
      <div className="binding-item-header">
        <button
          type="button"
          className="binding-toggle"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "▼" : "▶"}
        </button>
        <span className="binding-param-name">{paramName}</span>
        <span className="binding-point-count">
          ({binding.bindingPoints.length}
          {t("prop.binding.pointCountSuffix")})
        </span>
        <button
          type="button"
          className="prop-btn-icon"
          onClick={onRemoveBinding}
          title={t("prop.binding.deleteBinding")}
        >
          ×
        </button>
      </div>
      {expanded && (
        <div className="binding-points">
          {binding.bindingPoints.map((point) => (
            <div key={point.paramValue} className="binding-point-row">
              <span className="binding-point-param">
                P: {point.paramValue.toFixed(2)}
              </span>
              <span className="binding-point-value">
                → {point.targetValue.toFixed(3)}
              </span>
              <button
                type="button"
                className="prop-btn-icon"
                onClick={() => onRemoveBindingPoint(point.paramValue)}
                title={t("prop.binding.deleteBindingPoint")}
              >
                ×
              </button>
            </div>
          ))}
          <div className="binding-record-row">
            <span className="binding-point-param">
              {t("prop.binding.current")}: {paramValue.toFixed(2)}
            </span>
            <button
              type="button"
              className="prop-btn binding-record-btn"
              onClick={onRecord}
            >
              {t("prop.binding.record")}
            </button>
          </div>
          <div className="binding-form-actions">
            <button
              type="button"
              className="prop-btn"
              onClick={onCopy}
              title={t("prop.binding.copyTitle")}
            >
              {t("prop.binding.copy")}
            </button>
            <button
              type="button"
              className="prop-btn"
              onClick={onPaste}
              title={t("prop.binding.pasteTitle")}
            >
              {t("prop.binding.paste")}
            </button>
            <button
              type="button"
              className="prop-btn"
              onClick={onPasteMirrored}
              title={t("prop.binding.pasteMirroredTitle")}
            >
              {t("prop.binding.pasteMirrored")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function matchTarget(a: BindingTarget, b: BindingTarget): boolean {
  if (!isPublicBindingTarget(a) || !isPublicBindingTarget(b)) return false;
  if (a.type !== b.type) return false;
  if (a.type === "bone" && b.type === "bone") {
    return a.boneId === b.boneId && a.property === b.property;
  }
  if (a.type === "ikController" && b.type === "ikController") {
    return a.controllerId === b.controllerId && a.property === b.property;
  }
  return false;
}

function isPublicBindingTarget(
  target: BindingTarget,
): target is Extract<BindingTarget, { type: "bone" | "ikController" }> {
  return target.type === "bone" || target.type === "ikController";
}
