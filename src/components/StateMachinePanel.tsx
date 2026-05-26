import { useT } from "@/lib/i18n";
import { useEditorStore } from "@/stores/editorStore";
import { useStateMachineStore } from "@/stores/stateMachineStore";
import { StateMachineEditor } from "./state-machine/StateMachineEditor";

export function StateMachinePanel() {
  const t = useT();
  const project = useEditorStore((s) => s.project);
  const addStateMachine = useStateMachineStore((s) => s.addStateMachine);

  if (!project) return null;

  const machines = project.stateMachines;
  const { parameters, scenes } = project;
  const clips = scenes.flatMap((s) => s.clips);

  return (
    <div className="panel sm-panel">
      <div className="panel-header">{t("sm.title")}</div>
      <div className="panel-content scrollbar-thin">
        {machines.map((machine) => (
          <StateMachineEditor
            key={machine.id}
            machine={machine}
            parameters={parameters}
            clips={clips}
          />
        ))}
        <div className="physics-actions">
          <button
            type="button"
            className="physics-btn"
            onClick={() =>
              addStateMachine(`${t("sm.defaultName")} ${machines.length + 1}`)
            }
          >
            {t("sm.add")}
          </button>
        </div>
      </div>
    </div>
  );
}
