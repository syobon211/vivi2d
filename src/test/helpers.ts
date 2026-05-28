import type { ProjectData } from "@vivi2d/core/types";
import { clearTextures } from "@/lib/texture-store";
import { useEditorStore } from "@/stores/editorStore";
import { useParameterStore } from "@/stores/parameterStore";
import { createViviMesh, createProject } from "./fixtures";
import { resetAllStores } from "./store-reset";

export function setupTestProject(overrides?: Parameters<typeof createProject>[0]) {
  resetAllStores();
  clearTextures();
  const project = createProject(overrides);
  useEditorStore.setState({ project, projectVersion: 1 });
  return project;
}

export function setupProjectWithParameters(
  params: {
    id: string;
    name: string;
    min?: number;
    max?: number;
    defaultValue?: number;
  }[],
  layers?: Partial<ProjectData>["layers"],
) {
  const parameters = params.map((p) => ({
    id: p.id,
    name: p.name,
    minValue: p.min ?? 0,
    maxValue: p.max ?? 1,
    defaultValue: p.defaultValue ?? 0,
  }));
  const project = setupTestProject({
    parameters,
    layers: layers ?? [createViviMesh({ name: "テスト" })],
  });
  useParameterStore.setState({
    parameterValues: Object.fromEntries(parameters.map((p) => [p.id, p.defaultValue])),
  });
  return project;
}
