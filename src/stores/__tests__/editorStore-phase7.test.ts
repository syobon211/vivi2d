import { DRAW_ORDER } from "@vivi2d/core/constants";
import { findLayerById } from "@vivi2d/core/layer-utils";
import type { ViviMeshNode, GroupNode } from "@vivi2d/core/types";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "@/stores/editorStore";
import { createViviMesh, createEmptyProject, createGroup } from "@/test/fixtures";
import { resetEditorStore } from "@/test/store-reset";


function setupProject() {
  const viviMesh = createViviMesh({ name: "メッシュ" });
  const group = createGroup({ name: "グループ", children: [] });
  useEditorStore.setState({
    project: {
      ...createEmptyProject(),
      layers: [viviMesh, group],
    },
    projectVersion: 1,
  });
  return { viviMeshId: viviMesh.id, groupId: group.id };
}

function getLayer(id: string) {
  return findLayerById(useEditorStore.getState().project!.layers, id)!;
}


describe("setDrawOrder", () => {
  beforeEach(resetEditorStore);
  afterEach(resetEditorStore);

  it("正常値を設定できる", () => {
    const { viviMeshId } = setupProject();
    useEditorStore.getState().setDrawOrder(viviMeshId, 500);
    expect(getLayer(viviMeshId).drawOrder).toBe(500);
  });

  it("最小値 0 を設定できる", () => {
    const { viviMeshId } = setupProject();
    useEditorStore.getState().setDrawOrder(viviMeshId, 0);
    expect(getLayer(viviMeshId).drawOrder).toBe(0);
  });

  it("最大値 1000 を設定できる", () => {
    const { viviMeshId } = setupProject();
    useEditorStore.getState().setDrawOrder(viviMeshId, 1000);
    expect(getLayer(viviMeshId).drawOrder).toBe(1000);
  });

  it("下限クランプ: 負の値は 0 になる", () => {
    const { viviMeshId } = setupProject();
    useEditorStore.getState().setDrawOrder(viviMeshId, -100);
    expect(getLayer(viviMeshId).drawOrder).toBe(DRAW_ORDER.MIN);
  });

  it("上限クランプ: 1000 を超える値は 1000 になる", () => {
    const { viviMeshId } = setupProject();
    useEditorStore.getState().setDrawOrder(viviMeshId, 1500);
    expect(getLayer(viviMeshId).drawOrder).toBe(DRAW_ORDER.MAX);
  });

  it("小数値は四捨五入される", () => {
    const { viviMeshId } = setupProject();
    useEditorStore.getState().setDrawOrder(viviMeshId, 250.7);
    expect(getLayer(viviMeshId).drawOrder).toBe(251);
  });

  it("250.4 は 250 に丸められる", () => {
    const { viviMeshId } = setupProject();
    useEditorStore.getState().setDrawOrder(viviMeshId, 250.4);
    expect(getLayer(viviMeshId).drawOrder).toBe(250);
  });

  it("グループノードにも設定できる", () => {
    const { groupId } = setupProject();
    useEditorStore.getState().setDrawOrder(groupId, 750);
    expect(getLayer(groupId).drawOrder).toBe(750);
  });

  it("存在しないレイヤー ID では何も起きない", () => {
    setupProject();
    expect(() =>
      useEditorStore.getState().setDrawOrder("nonexistent", 500),
    ).not.toThrow();
  });
});


describe("setBlendMode", () => {
  beforeEach(resetEditorStore);
  afterEach(resetEditorStore);

  it.each([
    "normal",
    "add",
    "multiply",
  ] as const)("ブレンドモード '%s' を設定できる", (mode) => {
    const { viviMeshId } = setupProject();
    useEditorStore.getState().setBlendMode(viviMeshId, mode);
    expect(getLayer(viviMeshId).blendMode).toBe(mode);
  });

  it("既存のブレンドモードを上書きする", () => {
    const { viviMeshId } = setupProject();
    useEditorStore.getState().setBlendMode(viviMeshId, "add");
    expect(getLayer(viviMeshId).blendMode).toBe("add");

    useEditorStore.getState().setBlendMode(viviMeshId, "multiply");
    expect(getLayer(viviMeshId).blendMode).toBe("multiply");
  });

  it("グループノードにも設定できる", () => {
    const { groupId } = setupProject();
    useEditorStore.getState().setBlendMode(groupId, "add");
    expect(getLayer(groupId).blendMode).toBe("add");
  });
});


describe("setMultiplyColor", () => {
  beforeEach(resetEditorStore);
  afterEach(resetEditorStore);

  it("乗算色を設定できる", () => {
    const { viviMeshId } = setupProject();
    useEditorStore.getState().setMultiplyColor(viviMeshId, { r: 0.5, g: 0.3, b: 0.8 });
    const layer = getLayer(viviMeshId);
    expect(layer.multiplyColor).toEqual({ r: 0.5, g: 0.3, b: 0.8 });
  });

  it("白（デフォルト相当）を設定できる", () => {
    const { viviMeshId } = setupProject();
    useEditorStore.getState().setMultiplyColor(viviMeshId, { r: 1, g: 1, b: 1 });
    expect(getLayer(viviMeshId).multiplyColor).toEqual({ r: 1, g: 1, b: 1 });
  });

  it("黒を設定できる", () => {
    const { viviMeshId } = setupProject();
    useEditorStore.getState().setMultiplyColor(viviMeshId, { r: 0, g: 0, b: 0 });
    expect(getLayer(viviMeshId).multiplyColor).toEqual({ r: 0, g: 0, b: 0 });
  });

  it("参照が切り離される（コピーが保存される）", () => {
    const { viviMeshId } = setupProject();
    const original = { r: 0.5, g: 0.5, b: 0.5 };
    useEditorStore.getState().setMultiplyColor(viviMeshId, original);

    original.r = 0;
    expect(getLayer(viviMeshId).multiplyColor!.r).toBe(0.5);
  });

  it("連続更新で最後の値が反映される", () => {
    const { viviMeshId } = setupProject();
    useEditorStore.getState().setMultiplyColor(viviMeshId, { r: 1, g: 0, b: 0 });
    useEditorStore.getState().setMultiplyColor(viviMeshId, { r: 0, g: 1, b: 0 });
    useEditorStore.getState().setMultiplyColor(viviMeshId, { r: 0, g: 0, b: 1 });
    expect(getLayer(viviMeshId).multiplyColor).toEqual({ r: 0, g: 0, b: 1 });
  });
});


describe("setScreenColor", () => {
  beforeEach(resetEditorStore);
  afterEach(resetEditorStore);

  it("スクリーン色を設定できる", () => {
    const { viviMeshId } = setupProject();
    useEditorStore.getState().setScreenColor(viviMeshId, { r: 0.2, g: 0.4, b: 0.6 });
    expect(getLayer(viviMeshId).screenColor).toEqual({ r: 0.2, g: 0.4, b: 0.6 });
  });

  it("黒（デフォルト相当）を設定できる", () => {
    const { viviMeshId } = setupProject();
    useEditorStore.getState().setScreenColor(viviMeshId, { r: 0, g: 0, b: 0 });
    expect(getLayer(viviMeshId).screenColor).toEqual({ r: 0, g: 0, b: 0 });
  });

  it("参照が切り離される", () => {
    const { viviMeshId } = setupProject();
    const original = { r: 0.3, g: 0.6, b: 0.9 };
    useEditorStore.getState().setScreenColor(viviMeshId, original);

    original.r = 1;
    expect(getLayer(viviMeshId).screenColor!.r).toBe(0.3);
  });
});


describe("setCulling", () => {
  beforeEach(resetEditorStore);
  afterEach(resetEditorStore);

  it("viviMesh にカリングを有効化できる", () => {
    const { viviMeshId } = setupProject();
    useEditorStore.getState().setCulling(viviMeshId, true);
    const layer = getLayer(viviMeshId) as ViviMeshNode;
    expect(layer.culling).toBe(true);
  });

  it("viviMesh のカリングを無効化できる", () => {
    const { viviMeshId } = setupProject();
    useEditorStore.getState().setCulling(viviMeshId, true);
    useEditorStore.getState().setCulling(viviMeshId, false);
    const layer = getLayer(viviMeshId) as ViviMeshNode;
    expect(layer.culling).toBe(false);
  });

  it("グループノードに setCulling しても何も起きない", () => {
    const { groupId } = setupProject();
    useEditorStore.getState().setCulling(groupId, true);
    const layer = getLayer(groupId) as GroupNode;
    expect((layer as any).culling).toBeUndefined();
  });

  it("存在しないレイヤー ID では例外を投げない", () => {
    setupProject();
    expect(() => useEditorStore.getState().setCulling("nonexistent", true)).not.toThrow();
  });
});


describe("描画プロパティの複合変更", () => {
  beforeEach(resetEditorStore);
  afterEach(resetEditorStore);

  it("全描画プロパティを一度に変更できる", () => {
    const { viviMeshId } = setupProject();
    const store = useEditorStore.getState();

    store.setDrawOrder(viviMeshId, 750);
    store.setBlendMode(viviMeshId, "add");
    store.setMultiplyColor(viviMeshId, { r: 0.8, g: 0.2, b: 0.1 });
    store.setScreenColor(viviMeshId, { r: 0.1, g: 0.3, b: 0.5 });
    store.setCulling(viviMeshId, true);

    const layer = getLayer(viviMeshId) as ViviMeshNode;
    expect(layer.drawOrder).toBe(750);
    expect(layer.blendMode).toBe("add");
    expect(layer.multiplyColor).toEqual({ r: 0.8, g: 0.2, b: 0.1 });
    expect(layer.screenColor).toEqual({ r: 0.1, g: 0.3, b: 0.5 });
    expect(layer.culling).toBe(true);
  });

  it("異なるレイヤーに独立して設定できる", () => {
    const viviMesh1 = createViviMesh({ name: "メッシュ1" });
    const viviMesh2 = createViviMesh({ name: "メッシュ2" });
    useEditorStore.setState({
      project: {
        ...createEmptyProject(),
        layers: [viviMesh1, viviMesh2],
      },
      projectVersion: 1,
    });

    useEditorStore.getState().setDrawOrder(viviMesh1.id, 100);
    useEditorStore.getState().setDrawOrder(viviMesh2.id, 900);

    expect(getLayer(viviMesh1.id).drawOrder).toBe(100);
    expect(getLayer(viviMesh2.id).drawOrder).toBe(900);
  });
});
