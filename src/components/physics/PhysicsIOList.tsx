import { flattenLayers } from "@vivi2d/core/layer-utils";
import type { LayerNode, ParameterDefinition, PhysicsGroup } from "@vivi2d/core/types";
import { isBone } from "@vivi2d/core/types";
import { useCallback, useMemo } from "react";
import { useT } from "@/lib/i18n";
import { useEditorStore } from "@/stores/editorStore";
import { usePhysicsStore } from "@/stores/physicsStore";

const EMPTY_LAYERS: LayerNode[] = [];

function getPhysicsInputKey(groupId: string, input: PhysicsGroup["inputs"][number]) {
  return `${groupId}:input:${input.parameterId}:${input.type}:${input.weight}`;
}

function getPhysicsOutputKey(groupId: string, output: PhysicsGroup["outputs"][number]) {
  return `${groupId}:output:${output.parameterId ?? output.boneId ?? "unknown"}:${output.type}:${output.pendulumIndex}:${output.weight}`;
}

export function PhysicsIOList({
  group,
  parameters,
}: {
  group: PhysicsGroup;
  parameters: ParameterDefinition[];
}) {
  const t = useT();
  const layers = useEditorStore((s) => s.project?.layers ?? EMPTY_LAYERS);
  const addPhysicsInput = usePhysicsStore((s) => s.addPhysicsInput);
  const removePhysicsInput = usePhysicsStore((s) => s.removePhysicsInput);
  const addPhysicsOutput = usePhysicsStore((s) => s.addPhysicsOutput);
  const removePhysicsOutput = usePhysicsStore((s) => s.removePhysicsOutput);

  const handleAddInput = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      if (e.target.value) {
        addPhysicsInput(group.id, {
          parameterId: e.target.value,
          weight: 1,
          type: "x",
        });
        e.target.value = "";
      }
    },
    [addPhysicsInput, group.id],
  );

  const handleInputTypeChange = useCallback(
    (i: number, input: PhysicsGroup["inputs"][number]) =>
      (e: React.ChangeEvent<HTMLSelectElement>) => {
        const updated = [...group.inputs];
        updated[i] = {
          ...input,
          type: e.target.value as "x" | "y" | "angle",
        };
        removePhysicsInput(group.id, i);
        addPhysicsInput(group.id, updated[i]);
      },
    [group.inputs, group.id, removePhysicsInput, addPhysicsInput],
  );

  const handleRemoveInput = useCallback(
    (i: number) => () => removePhysicsInput(group.id, i),
    [removePhysicsInput, group.id],
  );

  const bones = useMemo(() => flattenLayers(layers).filter(isBone), [layers]);

  const handleAddOutput = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const val = e.target.value;
      if (!val) return;
      if (val.startsWith("bone:")) {
        const boneId = val.slice(5);
        addPhysicsOutput(group.id, {
          boneId,
          pendulumIndex: 0,
          weight: 2,
          type: "boneAngle",
        });
      } else {
        addPhysicsOutput(group.id, {
          parameterId: val,
          pendulumIndex: 0,
          weight: 10,
          type: "angle",
        });
      }
      e.target.value = "";
    },
    [addPhysicsOutput, group.id],
  );

  const handleRemoveOutput = useCallback(
    (i: number) => () => removePhysicsOutput(group.id, i),
    [removePhysicsOutput, group.id],
  );

  return (
    <>
      {}
      <div className="physics-section">
        <div className="physics-section-title">
          {t("physics.input")}
          <select className="physics-select-sm" defaultValue="" onChange={handleAddInput}>
            <option value="" disabled>
              {t("physics.addMapping")}
            </option>
            {parameters.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        {group.inputs.map((input, i) => {
          const param = parameters.find((p) => p.id === input.parameterId);
          return (
            <div key={getPhysicsInputKey(group.id, input)} className="physics-mapping">
              <span>{param?.name ?? t("physics.unknown")}</span>
              <select
                value={input.type}
                onChange={handleInputTypeChange(i, input)}
                className="physics-select-sm"
              >
                <option value="x">X</option>
                <option value="y">Y</option>
                <option value="angle">{t("physics.angle")}</option>
              </select>
              <button
                type="button"
                className="physics-btn-sm physics-btn-danger"
                onClick={handleRemoveInput(i)}
                title={t("physics.deleteInputTitle")}
              >
                x
              </button>
            </div>
          );
        })}
      </div>

      <div className="physics-section">
        <div className="physics-section-title">
          {t("physics.output")}
          <select
            className="physics-select-sm"
            defaultValue=""
            onChange={handleAddOutput}
          >
            <option value="" disabled>
              {t("physics.addMapping")}
            </option>
            {parameters.length > 0 && (
              <optgroup label={t("physics.parameters")}>
                {parameters.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            )}
            {bones.length > 0 && (
              <optgroup label={t("physics.bones")}>
                {bones.map((b) => (
                  <option key={b.id} value={`bone:${b.id}`}>
                    {b.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
        {group.outputs.map((output, i) => {
          const label = resolveOutputLabel(output, parameters, bones, t);
          return (
            <div key={getPhysicsOutputKey(group.id, output)} className="physics-mapping">
              <span>{label}</span>
              <span>#{output.pendulumIndex + 1}</span>
              <span>w:{output.weight}</span>
              <button
                type="button"
                className="physics-btn-sm physics-btn-danger"
                onClick={handleRemoveOutput(i)}
                title={t("physics.deleteOutputTitle")}
              >
                x
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}

function resolveOutputLabel(
  output: PhysicsGroup["outputs"][number],
  parameters: ParameterDefinition[],
  bones: LayerNode[],
  t: ReturnType<typeof useT>,
): string {
  if (output.type === "boneAngle" && output.boneId) {
    const bone = bones.find((b) => b.id === output.boneId);
    return bone
      ? `${bone.name} (${t("physics.boneAngleSuffix")})`
      : t("physics.unknownBone");
  }
  if (output.parameterId) {
    const param = parameters.find((p) => p.id === output.parameterId);
    return param?.name ?? t("physics.unknown");
  }
  return t("physics.unknown");
}
