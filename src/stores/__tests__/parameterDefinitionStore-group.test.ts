import type { ProjectData } from "@vivi2d/core/types";
import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "@/stores/editorStore";
import { useParameterDefinitionStore } from "@/stores/parameterDefinitionStore";
import { resetAllStores } from "@/test/store-reset";

describe("parameterDefinitionStore — グループ機能", () => {
  beforeEach(() => {
    resetAllStores();
    const project: ProjectData = {
      name: "test",
      width: 100,
      height: 100,
      layers: [],
      parameters: [],
      clips: [],
      scenes: [],
      physicsGroups: [],
      lipsyncConfig: {
        enabled: false,
        targetParameterId: null,
        source: "microphone",
        threshold: 0.02,
        smoothing: 0.7,
        gain: 2,
      },
      skins: {},
      colliders: [],
      stateMachines: [],
    };
    useEditorStore.setState({ project });
  });

  it("グループの指定・省略・変更と二種類の解除入力を保持する", () => {
    const { addParameter, setParameterGroup } = useParameterDefinitionStore.getState();
    addParameter("角度X", -30, 30, 0, "頭");
    addParameter("角度Y", -30, 30, 0);
    const parameters = useEditorStore.getState().project!.parameters;
    expect(parameters).toHaveLength(2);
    expect(parameters[0]!.group).toBe("頭");
    expect(parameters[1]!.group).toBeUndefined();
    const id = parameters[1]!.id;
    setParameterGroup(id, "目");
    expect(useEditorStore.getState().project!.parameters[1]!.group).toBe("目");
    setParameterGroup(id, "");
    expect(useEditorStore.getState().project!.parameters[1]!.group).toBeUndefined();
    setParameterGroup(id, "頭");
    expect(useEditorStore.getState().project!.parameters[1]!.group).toBe("頭");
    setParameterGroup(id, undefined);
    expect(useEditorStore.getState().project!.parameters[1]!.group).toBeUndefined();
    expect(useEditorStore.getState().project!.parameters[0]!.group).toBe("頭");
  });








});
