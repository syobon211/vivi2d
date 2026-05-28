import type { ViviModel } from "@vivi2d/core/model";
import {
  cancelScript,
  parseScript,
  runScript,
  type ScriptModelAPI,
  type ScriptRunnerState,
} from "@vivi2d/core/script-runner";
import { type RefObject, useCallback, useRef, useState } from "react";

export interface UseScriptRunnerResult {
  scriptInput: string;
  setScriptInput: (value: string) => void;
  scriptRunning: boolean;
  runScript: () => Promise<void>;
}

export function useScriptRunner(
  modelRef: RefObject<ViviModel | null>,
): UseScriptRunnerResult {
  const [scriptInput, setScriptInput] = useState("");
  const [scriptRunning, setScriptRunning] = useState(false);
  const scriptStateRef = useRef<ScriptRunnerState>({
    running: false,
    cancelled: false,
  });

  const runScriptCb = useCallback(async () => {
    if (scriptRunning) {
      cancelScript(scriptStateRef.current);
      setScriptRunning(false);
      return;
    }

    if (!scriptInput.trim() || !modelRef.current) return;

    const model = modelRef.current;
    const api: ScriptModelAPI = {
      setParameter: (id, v) => model.setParameter(id, v),
      setParameters: (values) => model.setParameters(values),
      resetParameters: () => model.resetParameters(),
      applyExpressionPreset: (id) => model.applyExpressionPreset(id),
      getPresetByName: (name) => {
        const p = model.project.expressionPresets?.find((pr) => pr.name === name);
        return p?.id ?? null;
      },
      getParameterId: (nameOrId) => {
        const p = model.project.parameters.find(
          (pr) => pr.id === nameOrId || pr.name === nameOrId,
        );
        return p?.id ?? null;
      },
      update: () => model.update(),
    };

    try {
      const script = parseScript(scriptInput);
      scriptStateRef.current = { running: true, cancelled: false };
      setScriptRunning(true);
      await runScript(script, api, scriptStateRef.current);
    } finally {
      setScriptRunning(false);
    }
  }, [scriptInput, scriptRunning, modelRef]);

  return {
    scriptInput,
    setScriptInput,
    scriptRunning,
    runScript: runScriptCb,
  };
}
