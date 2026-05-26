import type { ProjectData } from "@vivi2d/core/types";
import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "@/stores/editorStore";
import {
  clearBindingPointClipboard,
  getBindingPointClipboard,
  useParameterBindingStore,
} from "@/stores/parameterBindingStore";
import { resetAllStores } from "@/test/store-reset";

describe("parameterBindingStore — フォームコピー/ブレンド", () => {
  beforeEach(() => {
    resetAllStores();
    clearBindingPointClipboard();
    const project: ProjectData = {
      name: "test",
      width: 100,
      height: 100,
      layers: [],
      parameters: [
        { id: "p1", name: "角度X", minValue: -30, maxValue: 30, defaultValue: 0 },
      ],
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
      parameterBindings: [
        {
          id: "b1",
          parameterId: "p1",
          target: { type: "bone", boneId: "bone1", property: "angle" },
          bindingPoints: [
            { paramValue: -30, targetValue: -0.5 },
            { paramValue: 0, targetValue: 0 },
            { paramValue: 30, targetValue: 0.5 },
          ],
        },
        {
          id: "b2",
          parameterId: "p1",
          target: { type: "bone", boneId: "bone2", property: "angle" },
          bindingPoints: [],
        },
      ],
    };
    useEditorStore.setState({ project });
  });

  it("copyBindingPoints でクリップボードにバインディングポイントがコピーされる", () => {
    useParameterBindingStore.getState().copyBindingPoints("b1");
    const clipboard = getBindingPointClipboard();
    expect(clipboard).toHaveLength(3);
    expect(clipboard![0]).toEqual({ paramValue: -30, targetValue: -0.5 });
  });

  it("pasteBindingPoints でバインディングポイントが貼り付けられる", () => {
    useParameterBindingStore.getState().copyBindingPoints("b1");
    useParameterBindingStore.getState().pasteBindingPoints("b2");

    const project = useEditorStore.getState().project!;
    const b2 = project.parameterBindings!.find((b) => b.id === "b2")!;
    expect(b2.bindingPoints).toHaveLength(3);
    expect(b2.bindingPoints[0]).toEqual({ paramValue: -30, targetValue: -0.5 });
  });

  it("pasteBindingPointsMirrored で反転貼り付けされる", () => {
    useParameterBindingStore.getState().copyBindingPoints("b1");
    useParameterBindingStore.getState().pasteBindingPointsMirrored("b2");

    const project = useEditorStore.getState().project!;
    const b2 = project.parameterBindings!.find((b) => b.id === "b2")!;
    expect(b2.bindingPoints).toHaveLength(3);
    expect(b2.bindingPoints[2]).toEqual({ paramValue: 30, targetValue: 0.5 });
    expect(b2.bindingPoints[0]).toEqual({ paramValue: -30, targetValue: -0.5 });
  });

  it("blendBindingPoints でブレンドされる", () => {
    // Seed an initial bindingPoint on b2
    useParameterBindingStore.getState().setBindingPoint("b2", 0, 1.0);
    useParameterBindingStore.getState().copyBindingPoints("b1");
    useParameterBindingStore.getState().blendBindingPoints("b2", 0.5);

    const project = useEditorStore.getState().project!;
    const b2 = project.parameterBindings!.find((b) => b.id === "b2")!;
    const kf0 = b2.bindingPoints.find((k) => k.paramValue === 0);
    expect(kf0?.targetValue).toBeCloseTo(0.5);
  });

  it("クリップボードが空のとき paste は何もしない", () => {
    useParameterBindingStore.getState().pasteBindingPoints("b2");
    const project = useEditorStore.getState().project!;
    const b2 = project.parameterBindings!.find((b) => b.id === "b2")!;
    expect(b2.bindingPoints).toHaveLength(0);
  });
});
