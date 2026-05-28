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

  it("addParameter でグループ付きのパラメータを追加できる", () => {
    useParameterDefinitionStore.getState().addParameter("角度X", -30, 30, 0, "頭");
    const params = useEditorStore.getState().project!.parameters;
    expect(params).toHaveLength(1);
    expect(params[0]!.group).toBe("頭");
  });

  it("addParameter でグループ未指定は undefined", () => {
    useParameterDefinitionStore.getState().addParameter("角度X", -30, 30, 0);
    const params = useEditorStore.getState().project!.parameters;
    expect(params[0]!.group).toBeUndefined();
  });

  it("setParameterGroup でグループを変更できる", () => {
    useParameterDefinitionStore.getState().addParameter("角度X", -30, 30, 0);
    const paramId = useEditorStore.getState().project!.parameters[0]!.id;

    useParameterDefinitionStore.getState().setParameterGroup(paramId, "目");
    expect(useEditorStore.getState().project!.parameters[0]!.group).toBe("目");
  });

  it("setParameterGroup で空文字はグループ解除", () => {
    useParameterDefinitionStore.getState().addParameter("角度X", -30, 30, 0, "頭");
    const paramId = useEditorStore.getState().project!.parameters[0]!.id;

    useParameterDefinitionStore.getState().setParameterGroup(paramId, "");
    expect(useEditorStore.getState().project!.parameters[0]!.group).toBeUndefined();
  });

  it("setParameterGroup で undefined はグループ解除", () => {
    useParameterDefinitionStore.getState().addParameter("角度X", -30, 30, 0, "頭");
    const paramId = useEditorStore.getState().project!.parameters[0]!.id;

    useParameterDefinitionStore.getState().setParameterGroup(paramId, undefined);
    expect(useEditorStore.getState().project!.parameters[0]!.group).toBeUndefined();
  });
});
