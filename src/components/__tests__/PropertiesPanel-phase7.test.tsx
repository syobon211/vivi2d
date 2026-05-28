import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { findLayerById } from "@vivi2d/core/layer-utils";
import type { ViviMeshNode } from "@vivi2d/core/types";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PropertiesPanel } from "@/components/PropertiesPanel";
import { useEditorStore } from "@/stores/editorStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { createViviMesh, createEmptyProject, createGroup } from "@/test/fixtures";
import { resetEditorStore } from "@/test/store-reset";


function setupViviMeshLayer(overrides?: Partial<ViviMeshNode>) {
  const layer = createViviMesh({
    name: "テストメッシュ",
    drawOrder: 500,
    blendMode: "normal",
    ...overrides,
  });
  useEditorStore.setState({
    project: {
      ...createEmptyProject(),
      layers: [layer],
    },
    projectVersion: 1,
  });
  useSelectionStore.setState({ selectedLayerId: layer.id, selectedLayerIds: [layer.id] });
  return layer;
}

function getLayer(id: string) {
  return findLayerById(useEditorStore.getState().project!.layers, id)!;
}

function getDrawOrderSlider() {
  return screen.getAllByRole("slider").find((el) => el.getAttribute("max") === "1000")!;
}

function getDrawOrderInput() {
  return screen
    .getAllByRole("spinbutton")
    .find((el) => el.getAttribute("max") === "1000")!;
}

function getBlendSelect() {
  return screen.getByLabelText("ブレンド") as HTMLSelectElement;
}

function getColorPickers() {
  return document.querySelectorAll<HTMLInputElement>('input[type="color"]');
}

function getMultiplyColorPicker() {
  return getColorPickers()[0]!;
}

function getScreenColorPicker() {
  return getColorPickers()[1]!;
}


describe("PropertiesPanel — 描画順", () => {
  beforeEach(resetEditorStore);
  afterEach(resetEditorStore);

  it("描画順ラベルが表示される", () => {
    setupViviMeshLayer();
    render(<PropertiesPanel />);
    expect(screen.getByText("描画順")).toBeInTheDocument();
  });

  it("描画順スライダーが 0-1000 の範囲で表示される", () => {
    setupViviMeshLayer({ drawOrder: 750 });
    render(<PropertiesPanel />);

    const slider = getDrawOrderSlider();
    expect(slider).toBeInTheDocument();
    expect(slider).toHaveAttribute("min", "0");
    expect(slider).toHaveAttribute("max", "1000");
    expect(slider).toHaveValue("750");
  });

  it("描画順の数値入力が表示される", () => {
    setupViviMeshLayer({ drawOrder: 750 });
    render(<PropertiesPanel />);

    const numberInput = getDrawOrderInput();
    expect(numberInput).toBeInTheDocument();
    expect(numberInput).toHaveValue(750);
  });

  it("スライダー操作で drawOrder がストアに反映される", () => {
    const layer = setupViviMeshLayer({ drawOrder: 500 });
    render(<PropertiesPanel />);

    fireEvent.change(getDrawOrderSlider(), { target: { value: "750" } });
    expect(getLayer(layer.id).drawOrder).toBe(750);
  });

  it("数値入力で drawOrder がストアに反映される", () => {
    const layer = setupViviMeshLayer({ drawOrder: 500 });
    render(<PropertiesPanel />);

    fireEvent.change(getDrawOrderInput(), { target: { value: "300" } });
    expect(getLayer(layer.id).drawOrder).toBe(300);
  });

  it("drawOrder 未設定の場合デフォルト値 500 が表示される", () => {
    setupViviMeshLayer({ drawOrder: undefined });
    render(<PropertiesPanel />);

    expect(getDrawOrderSlider()).toHaveValue("500");
  });
});


describe("PropertiesPanel — ブレンドモード", () => {
  beforeEach(resetEditorStore);
  afterEach(resetEditorStore);

  it("ブレンドモード select が表示される", () => {
    setupViviMeshLayer();
    render(<PropertiesPanel />);
    expect(screen.getByText("ブレンド")).toBeInTheDocument();
    expect(getBlendSelect()).toBeInTheDocument();
  });

  it("13種のブレンドモードが選択肢に含まれる", () => {
    setupViviMeshLayer();
    render(<PropertiesPanel />);

    const values = Array.from(getBlendSelect().options).map((o) => o.value);
    expect(values).toContain("normal");
    expect(values).toContain("add");
    expect(values).toContain("multiply");
    expect(values).toContain("screen");
    expect(values).toContain("overlay");
    expect(values).toContain("difference");
    expect(values).toContain("exclusion");
    expect(values).toHaveLength(13);
  });

  it("現在のブレンドモードが選択されている", () => {
    setupViviMeshLayer({ blendMode: "multiply" });
    render(<PropertiesPanel />);
    expect(getBlendSelect().value).toBe("multiply");
  });

  it("ブレンドモード変更がストアに反映される", () => {
    const layer = setupViviMeshLayer({ blendMode: "normal" });
    render(<PropertiesPanel />);

    fireEvent.change(getBlendSelect(), { target: { value: "add" } });
    expect(getLayer(layer.id).blendMode).toBe("add");
  });
});


describe("PropertiesPanel — 乗算色", () => {
  beforeEach(resetEditorStore);
  afterEach(resetEditorStore);

  it("乗算色ラベルとカラーピッカーが表示される", () => {
    setupViviMeshLayer();
    render(<PropertiesPanel />);
    expect(screen.getByText("乗算色")).toBeInTheDocument();
    expect(getColorPickers().length).toBeGreaterThanOrEqual(2);
  });

  it("乗算色未設定時はデフォルト白（#ffffff）が表示される", () => {
    setupViviMeshLayer({ multiplyColor: undefined });
    render(<PropertiesPanel />);
    expect(getMultiplyColorPicker().value).toBe("#ffffff");
  });

  it("乗算色変更がストアに反映される", () => {
    const layer = setupViviMeshLayer();
    render(<PropertiesPanel />);

    fireEvent.change(getMultiplyColorPicker(), {
      target: { value: "#ff0000" },
    });

    const updated = getLayer(layer.id);
    expect(updated.multiplyColor).toBeDefined();
    expect(updated.multiplyColor!.r).toBeCloseTo(1, 1);
    expect(updated.multiplyColor!.g).toBeCloseTo(0, 1);
    expect(updated.multiplyColor!.b).toBeCloseTo(0, 1);
  });
});


describe("PropertiesPanel — スクリーン色", () => {
  beforeEach(resetEditorStore);
  afterEach(resetEditorStore);

  it("スクリーン色ラベルが表示される", () => {
    setupViviMeshLayer();
    render(<PropertiesPanel />);
    expect(screen.getByText("スクリーン色")).toBeInTheDocument();
  });

  it("スクリーン色未設定時はデフォルト黒（#000000）が表示される", () => {
    setupViviMeshLayer({ screenColor: undefined });
    render(<PropertiesPanel />);
    expect(getScreenColorPicker().value).toBe("#000000");
  });

  it("スクリーン色変更がストアに反映される", () => {
    const layer = setupViviMeshLayer();
    render(<PropertiesPanel />);

    fireEvent.change(getScreenColorPicker(), {
      target: { value: "#0000ff" },
    });

    const updated = getLayer(layer.id);
    expect(updated.screenColor).toBeDefined();
    expect(updated.screenColor!.r).toBeCloseTo(0, 1);
    expect(updated.screenColor!.g).toBeCloseTo(0, 1);
    expect(updated.screenColor!.b).toBeCloseTo(1, 1);
  });
});


describe("PropertiesPanel — カリング", () => {
  beforeEach(resetEditorStore);
  afterEach(resetEditorStore);

  function getCullingCheckbox() {
    return screen.getByLabelText("裏面を非表示");
  }

  it("viviMesh 選択時にカリングチェックボックスが表示される", () => {
    setupViviMeshLayer();
    render(<PropertiesPanel />);

    expect(screen.getByText("カリング")).toBeInTheDocument();
    expect(screen.getByText("裏面を非表示")).toBeInTheDocument();
    expect(getCullingCheckbox()).toBeInTheDocument();
  });

  it("カリング未設定（undefined）時は unchecked", () => {
    setupViviMeshLayer({ culling: undefined });
    render(<PropertiesPanel />);
    expect(getCullingCheckbox()).not.toBeChecked();
  });

  it("カリング true の場合は checked", () => {
    setupViviMeshLayer({ culling: true });
    render(<PropertiesPanel />);
    expect(getCullingCheckbox()).toBeChecked();
  });

  it("カリング false の場合は unchecked", () => {
    setupViviMeshLayer({ culling: false });
    render(<PropertiesPanel />);
    expect(getCullingCheckbox()).not.toBeChecked();
  });

  it("チェックボックス操作でストアの culling が更新される", async () => {
    const layer = setupViviMeshLayer({ culling: false });
    render(<PropertiesPanel />);

    fireEvent.click(getCullingCheckbox());

    await waitFor(() => {
      const updated = getLayer(layer.id) as ViviMeshNode;
      expect(updated.culling).toBe(true);
    });
  });

  it("グループ選択時にカリングは表示されない", () => {
    const group = createGroup({ name: "テストグループ" });
    useEditorStore.setState({
      project: {
        ...createEmptyProject(),
        layers: [group],
      },
      projectVersion: 1,
    });
    useSelectionStore.setState({
      selectedLayerId: group.id,
      selectedLayerIds: [group.id],
    });

    render(<PropertiesPanel />);

    expect(screen.queryByText("カリング")).not.toBeInTheDocument();
    expect(screen.queryByText("裏面を非表示")).not.toBeInTheDocument();
  });
});


describe("PropertiesPanel — 描画プロパティ全体", () => {
  beforeEach(resetEditorStore);
  afterEach(resetEditorStore);

  it("全ての描画プロパティ UI が同時に表示される", () => {
    setupViviMeshLayer({
      drawOrder: 750,
      blendMode: "multiply",
      multiplyColor: { r: 0.5, g: 0.5, b: 0.5 },
      screenColor: { r: 0.1, g: 0.2, b: 0.3 },
      culling: true,
    });
    render(<PropertiesPanel />);

    expect(screen.getByText("描画順")).toBeInTheDocument();
    expect(screen.getByText("ブレンド")).toBeInTheDocument();
    expect(screen.getByText("乗算色")).toBeInTheDocument();
    expect(screen.getByText("スクリーン色")).toBeInTheDocument();
    expect(screen.getByText("カリング")).toBeInTheDocument();
  });

  it("レイヤー未選択時は描画プロパティが表示されない", () => {
    useEditorStore.setState({
      project: {
        ...createEmptyProject(),
        layers: [createViviMesh()],
      },
      projectVersion: 1,
    });
    useSelectionStore.setState({ selectedLayerId: null, selectedLayerIds: [] });
    render(<PropertiesPanel />);

    expect(screen.queryByText("描画順")).not.toBeInTheDocument();
    expect(screen.queryByText("ブレンド")).not.toBeInTheDocument();
    expect(screen.queryByText("乗算色")).not.toBeInTheDocument();
  });

  it("プロジェクト未読み込み時は案内メッセージのみ", () => {
    useEditorStore.setState({
      project: null,
    });
    useSelectionStore.setState({ selectedLayerId: null, selectedLayerIds: [] });
    render(<PropertiesPanel />);

    expect(screen.getByText("プロジェクト未読み込み")).toBeInTheDocument();
    expect(screen.queryByText("描画順")).not.toBeInTheDocument();
  });

  it("描画プロパティの表示順序が正しい", () => {
    setupViviMeshLayer();
    render(<PropertiesPanel />);

    const labels = screen.getAllByText(
      /^(不透明度|描画順|ブレンド|乗算色|スクリーン色|カリング)$/,
    );
    const order = labels.map((el) => el.textContent);
    const opacityIdx = order.indexOf("不透明度");
    const drawOrderIdx = order.indexOf("描画順");
    const blendIdx = order.indexOf("ブレンド");
    const multiplyIdx = order.indexOf("乗算色");
    const screenIdx = order.indexOf("スクリーン色");
    const cullingIdx = order.indexOf("カリング");

    expect(opacityIdx).toBeLessThan(drawOrderIdx);
    expect(drawOrderIdx).toBeLessThan(blendIdx);
    expect(blendIdx).toBeLessThan(multiplyIdx);
    expect(multiplyIdx).toBeLessThan(screenIdx);
    expect(screenIdx).toBeLessThan(cullingIdx);
  });
});


describe("PropertiesPanel — 複数選択時", () => {
  beforeEach(resetEditorStore);
  afterEach(resetEditorStore);

  it("複数選択時に選択レイヤー数が表示される", () => {
    const meshA = createViviMesh({ name: "メッシュA" });
    const meshB = createViviMesh({ name: "メッシュB" });
    useEditorStore.setState({
      project: {
        ...createEmptyProject(),
        layers: [meshA, meshB],
      },
      projectVersion: 1,
    });
    useSelectionStore.setState({
      selectedLayerId: meshA.id,
      selectedLayerIds: [meshA.id, meshB.id],
    });

    render(<PropertiesPanel />);
    expect(screen.getByText(/2.*個のレイヤーを選択中/)).toBeInTheDocument();
  });

  it("複数選択時に一括メッシュ自動生成セクションが表示される", () => {
    const meshA = createViviMesh({ name: "メッシュA" });
    const meshB = createViviMesh({ name: "メッシュB" });
    useEditorStore.setState({
      project: {
        ...createEmptyProject(),
        layers: [meshA, meshB],
      },
      projectVersion: 1,
    });
    useSelectionStore.setState({
      selectedLayerId: meshA.id,
      selectedLayerIds: [meshA.id, meshB.id],
    });

    render(<PropertiesPanel />);
    expect(screen.getByText("一括メッシュ自動生成")).toBeInTheDocument();
  });

  it("複数選択時にメッシュ密度プリセットを変更できる", () => {
    const meshA = createViviMesh({ name: "メッシュA" });
    const meshB = createViviMesh({ name: "メッシュB" });
    useEditorStore.setState({
      project: {
        ...createEmptyProject(),
        layers: [meshA, meshB],
      },
      projectVersion: 1,
    });
    useSelectionStore.setState({
      selectedLayerId: meshA.id,
      selectedLayerIds: [meshA.id, meshB.id],
    });

    render(<PropertiesPanel />);
    const select = screen.getByLabelText("一括自動メッシュ対象選択");
    fireEvent.change(select, { target: { value: "fine" } });
    expect((select as HTMLSelectElement).value).toBe("fine");
  });

  it("一括適用ボタンが動作する", () => {
    const meshA = createViviMesh({ name: "メッシュA" });
    const meshB = createViviMesh({ name: "メッシュB" });
    useEditorStore.setState({
      project: {
        ...createEmptyProject(),
        layers: [meshA, meshB],
      },
      projectVersion: 1,
    });
    useSelectionStore.setState({
      selectedLayerId: meshA.id,
      selectedLayerIds: [meshA.id, meshB.id],
    });

    render(<PropertiesPanel />);
    const applyBtn = screen.getByRole("button", { name: "一括自動メッシュ適用" });
    fireEvent.click(applyBtn);
    expect(applyBtn).toBeInTheDocument();
  });
});


describe("PropertiesPanel — クリッピングマスク", () => {
  beforeEach(resetEditorStore);
  afterEach(resetEditorStore);

  it("viviMesh選択時にクリッピングラベルが表示される", () => {
    setupViviMeshLayer();
    render(<PropertiesPanel />);
    expect(screen.getByText("クリッピング")).toBeInTheDocument();
  });

  it("マスク追加のセレクトボックスが表示される", () => {
    const meshA = createViviMesh({ id: "mesh-a", name: "メッシュA" });
    const meshB = createViviMesh({ id: "mesh-b", name: "メッシュB" });
    useEditorStore.setState({
      project: {
        ...createEmptyProject(),
        layers: [meshA, meshB],
      },
      projectVersion: 1,
    });
    useSelectionStore.setState({
      selectedLayerId: meshA.id,
      selectedLayerIds: [meshA.id],
    });

    render(<PropertiesPanel />);
    const selects = document.querySelectorAll(".clip-mask-select");
    expect(selects.length).toBeGreaterThan(0);
  });

  it("クリッピングマスクを追加できる", () => {
    const meshA = createViviMesh({ id: "mesh-a", name: "メッシュA" });
    const meshB = createViviMesh({ id: "mesh-b", name: "メッシュB" });
    useEditorStore.setState({
      project: {
        ...createEmptyProject(),
        layers: [meshA, meshB],
      },
      projectVersion: 1,
    });
    useSelectionStore.setState({
      selectedLayerId: meshA.id,
      selectedLayerIds: [meshA.id],
    });

    render(<PropertiesPanel />);
    const select = document.querySelector(".clip-mask-select")!;
    fireEvent.change(select, { target: { value: meshB.id } });

    const updated = findLayerById(useEditorStore.getState().project!.layers, meshA.id)!;
    expect(updated.clipMaskIds).toContain(meshB.id);
  });

  it("既存のクリッピングマスクが表示される", () => {
    const meshA = createViviMesh({
      id: "mesh-a",
      name: "メッシュA",
      clipMaskIds: ["mesh-b"],
    });
    const meshB = createViviMesh({ id: "mesh-b", name: "メッシュB" });
    useEditorStore.setState({
      project: {
        ...createEmptyProject(),
        layers: [meshA, meshB],
      },
      projectVersion: 1,
    });
    useSelectionStore.setState({
      selectedLayerId: meshA.id,
      selectedLayerIds: [meshA.id],
    });

    render(<PropertiesPanel />);
    expect(screen.getByText("メッシュB")).toBeInTheDocument();
  });

  it("クリッピングマスクを削除できる", async () => {
    const meshA = createViviMesh({
      id: "mesh-a",
      name: "メッシュA",
      clipMaskIds: ["mesh-b"],
    });
    const meshB = createViviMesh({ id: "mesh-b", name: "メッシュB" });
    useEditorStore.setState({
      project: {
        ...createEmptyProject(),
        layers: [meshA, meshB],
      },
      projectVersion: 1,
    });
    useSelectionStore.setState({
      selectedLayerId: meshA.id,
      selectedLayerIds: [meshA.id],
    });

    render(<PropertiesPanel />);
    const removeBtn = screen.getByTitle("マスクを解除");
    fireEvent.click(removeBtn);

    const updated = findLayerById(useEditorStore.getState().project!.layers, meshA.id)!;
    expect(updated.clipMaskIds).toHaveLength(0);
  });

  it("空文字のマスクIDでは追加されない", () => {
    const meshA = createViviMesh({ id: "mesh-a", name: "メッシュA" });
    const meshB = createViviMesh({ id: "mesh-b", name: "メッシュB" });
    useEditorStore.setState({
      project: {
        ...createEmptyProject(),
        layers: [meshA, meshB],
      },
      projectVersion: 1,
    });
    useSelectionStore.setState({
      selectedLayerId: meshA.id,
      selectedLayerIds: [meshA.id],
    });

    render(<PropertiesPanel />);
    const select = document.querySelector(".clip-mask-select")!;
    fireEvent.change(select, { target: { value: "" } });

    const updated = findLayerById(useEditorStore.getState().project!.layers, meshA.id)!;
    expect(updated.clipMaskIds ?? []).toHaveLength(0);
  });

  it("既に追加済みのマスクは重複追加されない", () => {
    const meshA = createViviMesh({
      id: "mesh-a",
      name: "メッシュA",
      clipMaskIds: ["mesh-b"],
    });
    const meshB = createViviMesh({ id: "mesh-b", name: "メッシュB" });
    useEditorStore.setState({
      project: {
        ...createEmptyProject(),
        layers: [meshA, meshB],
      },
      projectVersion: 1,
    });
    useSelectionStore.setState({
      selectedLayerId: meshA.id,
      selectedLayerIds: [meshA.id],
    });

    render(<PropertiesPanel />);
    const select = document.querySelector(".clip-mask-select")!;
    fireEvent.change(select, { target: { value: "mesh-b" } });

    const updated = findLayerById(useEditorStore.getState().project!.layers, meshA.id)!;
    expect(updated.clipMaskIds).toHaveLength(1);
  });
});
