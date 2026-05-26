import { isDefaultFormActive } from "@vivi2d/core/default-form-lock";
import type { ParameterDefinition } from "@vivi2d/core/types";
import { useEditorStore } from "@/stores/editorStore";
import { useParameterStore } from "@/stores/parameterStore";
import { useViewportStore } from "@/stores/viewportStore";

const EMPTY_PARAMS: ParameterDefinition[] = [];

export function useDefaultFormLock(): boolean {
  const defaultFormLocked = useViewportStore((s) => s.defaultFormLocked);
  const parameters = useEditorStore((s) => s.project?.parameters ?? EMPTY_PARAMS);
  const parameterValues = useParameterStore((s) => s.parameterValues);

  if (!defaultFormLocked) return false;
  return isDefaultFormActive(parameters, parameterValues);
}
