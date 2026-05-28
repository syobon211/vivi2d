import { act, fireEvent, render, screen } from "@testing-library/react";
import { findLayerById } from "@vivi2d/core/layer-utils";
import type { ViviMeshNode, GroupNode } from "@vivi2d/core/types";
import { readPsd } from "ag-psd";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PropertiesPanel } from "@/components/PropertiesPanel";
import { clearTextures } from "@/lib/texture-store";
import { useEditorStore } from "@/stores/editorStore";
import { loadPsdFromBuffer } from "@/stores/projectIO";
import { useSelectionStore } from "@/stores/selectionStore";
import { useViewportStore } from "@/stores/viewportStore";
import { createViviMesh, createBoneNode, createProject } from "@/test/fixtures";
import { resetAllStores } from "@/test/store-reset";

describe("PropertiesPanel", () => {
  beforeEach(() => {
    resetAllStores();
    clearTextures();
    vi.mocked(readPsd).mockReturnValue({
      width: 1920,
      height: 1080,
      children: [
        {
          name: "キャラクター",
          left: 100,
          top: 200,
          right: 500,
          bottom: 800,
          opacity: 204,
          blendMode: "multiply",
        },
        {
          name: "パーツ",
          children: [{ name: "子パーツ", left: 0, top: 0, right: 50, bottom: 50 }],
        },
      ],
    } as any);
  });

  afterEach(() => {
    clearTextures();
  });

  it("プロジェクト未読み込み時にプレースホルダーを表示する", () => {
    render(<PropertiesPanel />);
    expect(screen.getByText("プロジェクト未読み込み")).toBeInTheDocument();
  });

  it("レイヤー未選択時にプレースホルダーを表示する", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<PropertiesPanel />);
    expect(screen.getByText("レイヤーを選択してください")).toBeInTheDocument();
  });

  it("選択レイヤーの名前を表示する", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    const layerId = useEditorStore.getState().project!.layers[0]!.id;
    useSelectionStore.getState().selectLayer(layerId);

    render(<PropertiesPanel />);
    expect(screen.getByText("キャラクター")).toBeInTheDocument();
  });

  it("選択レイヤーの位置を表示する", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    const layerId = useEditorStore.getState().project!.layers[0]!.id;
    useSelectionStore.getState().selectLayer(layerId);

    render(<PropertiesPanel />);
    expect(screen.getByText("X: 100")).toBeInTheDocument();
    expect(screen.getByText("Y: 200")).toBeInTheDocument();
  });

  it("選択レイヤーのブレンドモードを表示する", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    const layerId = useEditorStore.getState().project!.layers[0]!.id;
    useSelectionStore.getState().selectLayer(layerId);

    render(<PropertiesPanel />);
    expect(screen.getByText("乗算")).toBeInTheDocument();
  });

  it("グループレイヤーの種類を「グループ」と表示する", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    const groupId = useEditorStore.getState().project!.layers[1]!.id;
    useSelectionStore.getState().selectLayer(groupId);

    render(<PropertiesPanel />);
    expect(screen.getByText("グループ")).toBeInTheDocument();
  });

  it("通常レイヤーの種類を「ViviMesh」と表示する", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    const layerId = useEditorStore.getState().project!.layers[0]!.id;
    useSelectionStore.getState().selectLayer(layerId);

    render(<PropertiesPanel />);
    expect(screen.getByText("ViviMesh")).toBeInTheDocument();
  });

  it("キャンバス情報を表示する", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<PropertiesPanel />);
    expect(screen.getByText("1920 x 1080")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("ズーム率を反映する", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    useViewportStore.getState().setZoom(2);
    render(<PropertiesPanel />);
    expect(screen.getByText("200%")).toBeInTheDocument();
  });

  it("不透明度スライダーで opacity を変更できる", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    const layerId = useEditorStore.getState().project!.layers[0]!.id;
    useSelectionStore.getState().selectLayer(layerId);

    render(<PropertiesPanel />);
    const slider = screen
      .getAllByRole("slider")
      .find((el) => el.getAttribute("max") === "100")!;
    expect(slider).toBeInTheDocument();

    fireEvent.change(slider, { target: { value: "50" } });

    const layer = findLayerById(useEditorStore.getState().project!.layers, layerId)!;
    expect(layer.opacity).toBe(0.5);
  });
  it("does not crash when switching from a bound bone back to a ViviMesh", () => {
    const mesh = createViviMesh({ id: "mesh-red", name: "Red Circle", children: [] });
    const bone = createBoneNode({ id: "bone-1", name: "Bone" });
    mesh.children = [bone];

    useEditorStore.setState({
      project: createProject({
        layers: [mesh],
        parameters: [
          {
            id: "param-angle-x",
            name: "Angle X",
            minValue: -30,
            maxValue: 30,
            defaultValue: 0,
          },
        ],
        parameterBindings: [
          {
            id: "binding-1",
            parameterId: "param-angle-x",
            target: { type: "bone", boneId: bone.id, property: "angle" },
            bindingPoints: [],
          },
        ],
      }),
    });
    useSelectionStore.setState({
      selectedLayerId: bone.id,
      selectedLayerIds: [bone.id],
    });

    render(<PropertiesPanel />);
    expect(screen.getByText(/Bone/)).toBeInTheDocument();

    act(() => {
      useSelectionStore.getState().selectLayer(mesh.id);
    });

    expect(screen.getByText("ViviMesh")).toBeInTheDocument();
    expect(screen.queryByText("Blend Shapes")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add Blend Shape" }),
    ).not.toBeInTheDocument();
  });
});


function setupMeshLayer() {
  const layer: ViviMeshNode = {
    id: "mesh-layer-1",
    name: "メッシュレイヤー",
    visible: true,
    opacity: 1,
    x: 10,
    y: 20,
    width: 200,
    height: 150,
    children: [],
    blendMode: "normal",
    expanded: true,
    kind: "viviMesh",
    mesh: {
      vertices: new Array(32).fill(0),
      uvs: new Array(32).fill(0),
      indices: new Array(54).fill(0),
      divisionsX: 3,
      divisionsY: 3,
    },
  };
  useEditorStore.setState({
    project: createProject({ layers: [layer] }),
  });
  useSelectionStore.setState({ selectedLayerId: layer.id, selectedLayerIds: [layer.id] });
  return layer;
}

describe("PropertiesPanel — MeshProperties", () => {
  beforeEach(() => {
    resetAllStores();
    clearTextures();
  });

  it("メッシュ付きレイヤーの頂点数を表示する", () => {
    setupMeshLayer();
    render(<PropertiesPanel />);
    expect(screen.getByText("16")).toBeInTheDocument();
  });

  it("メッシュの分割数を表示する", () => {
    setupMeshLayer();
    render(<PropertiesPanel />);

    const numberInputs = screen.getAllByRole("spinbutton");
    const divXInput = numberInputs.find((el) => el.getAttribute("value") === "3");
    expect(divXInput).toBeDefined();
  });

  it("分割数セクションのタイトルが表示される", () => {
    setupMeshLayer();
    render(<PropertiesPanel />);
    expect(screen.getByText("メッシュ")).toBeInTheDocument();
  });

  it("分割 X を変更すると setMeshDivisions が呼ばれる", () => {
    setupMeshLayer();
    render(<PropertiesPanel />);

    const divisionInputs = screen
      .getAllByRole("spinbutton")
      .filter((el) => el.getAttribute("max") === "20");
    fireEvent.change(divisionInputs[0]!, { target: { value: "5" } });

    const layer = findLayerById(
      useEditorStore.getState().project!.layers,
      "mesh-layer-1",
    )!;
    if (layer.kind !== "viviMesh") throw new Error("想定外の種別");
    expect(layer.mesh.divisionsX).toBe(5);
  });

  it("分割 Y を変更すると setMeshDivisions が呼ばれる", () => {
    setupMeshLayer();
    render(<PropertiesPanel />);

    const divisionInputs = screen
      .getAllByRole("spinbutton")
      .filter((el) => el.getAttribute("max") === "20");
    fireEvent.change(divisionInputs[1]!, { target: { value: "4" } });

    const layer = findLayerById(
      useEditorStore.getState().project!.layers,
      "mesh-layer-1",
    )!;
    if (layer.kind !== "viviMesh") throw new Error("想定外の種別");
    expect(layer.mesh.divisionsY).toBe(4);
  });

  it("グループレイヤーにはメッシュセクションが表示されない", () => {
    const group: GroupNode = {
      id: "group-1",
      name: "グループ",
      visible: true,
      opacity: 1,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [],
      blendMode: "normal",
      expanded: true,
      kind: "group",
    };
    useEditorStore.setState({
      project: createProject({ layers: [group] }),
    });
    useSelectionStore.setState({
      selectedLayerId: group.id,
      selectedLayerIds: [group.id],
    });

    render(<PropertiesPanel />);
    expect(screen.queryByText("メッシュ")).not.toBeInTheDocument();
  });
});
