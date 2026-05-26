import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readPsd } from "ag-psd";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LayerPanel } from "@/components/LayerPanel";
import { clearTextures } from "@/lib/texture-store";
import { useEditorStore } from "@/stores/editorStore";
import { loadPsdFromBuffer } from "@/stores/projectIO";
import { useSelectionStore } from "@/stores/selectionStore";
import {
  createViviMesh,
  createBoneNode,
  createGroup,
  createProject,
} from "@/test/fixtures";
import { resetAllStores } from "@/test/store-reset";


describe("LayerPanel — ドラッグ&ドロップ分岐", () => {
  beforeEach(() => {
    resetAllStores();
    clearTextures();
    vi.mocked(readPsd).mockReturnValue({
      width: 800,
      height: 600,
      children: [
        { name: "レイヤーA", left: 0, top: 0, right: 100, bottom: 100 },
        { name: "レイヤーB", left: 0, top: 0, right: 100, bottom: 100 },
        { name: "レイヤーC", left: 0, top: 0, right: 100, bottom: 100 },
      ],
    } as any);
  });

  afterEach(() => {
    clearTextures();
  });

  it("ドラッグ&ドロップでレイヤーの並び替えが行われる", async () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<LayerPanel />);

    const layerItems = screen
      .getAllByText(/レイヤー[ABC]/)
      .map((el) => el.closest(".layer-item")!);
    const dragHandles = layerItems.map(
      (item) => item.querySelector(".layer-drag-handle") as HTMLElement,
    );

    fireEvent.dragStart(dragHandles[0]!);

    const rectB = layerItems[1]!.getBoundingClientRect();
    fireEvent.dragOver(layerItems[1]!, {
      clientY: rectB.top + 1,
    });

    fireEvent.drop(layerItems[1]!, {});

    fireEvent.dragEnd(dragHandles[0]!);
  });

  it("同じレイヤーへのドラッグオーバーは無視される", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<LayerPanel />);

    const layerA = screen.getByText("レイヤーA").closest(".layer-item")!;
    const dragHandle = layerA.querySelector(".layer-drag-handle") as HTMLElement;

    fireEvent.dragStart(dragHandle);
    fireEvent.dragOver(layerA, { clientY: 0 });
    fireEvent.dragEnd(dragHandle);
  });

  it("ドロップ先が自分自身の場合はリオーダーしない", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<LayerPanel />);

    const layerA = screen.getByText("レイヤーA").closest(".layer-item")!;
    const dragHandle = layerA.querySelector(".layer-drag-handle") as HTMLElement;

    fireEvent.dragStart(dragHandle);
    fireEvent.drop(layerA, {});
    fireEvent.dragEnd(dragHandle);

    const layers = useEditorStore.getState().project!.layers;
    expect(layers[0]!.name).toBe("レイヤーA");
  });
});

describe("LayerPanel — Ctrl/Shift クリック選択分岐", () => {
  beforeEach(() => {
    resetAllStores();
    clearTextures();
    vi.mocked(readPsd).mockReturnValue({
      width: 800,
      height: 600,
      children: [
        { name: "レイヤーA", left: 0, top: 0, right: 100, bottom: 100 },
        { name: "レイヤーB", left: 0, top: 0, right: 100, bottom: 100 },
        { name: "レイヤーC", left: 0, top: 0, right: 100, bottom: 100 },
      ],
    } as any);
  });

  afterEach(() => {
    clearTextures();
  });

  it("Ctrl+クリックで複数選択ができる", async () => {
    const user = userEvent.setup();
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<LayerPanel />);

    await user.click(screen.getByText("レイヤーA"));
    const idA = useEditorStore.getState().project!.layers[0]!.id;
    expect(useSelectionStore.getState().selectedLayerIds).toContain(idA);

    const layerB = screen.getByText("レイヤーB");
    fireEvent.click(layerB, { ctrlKey: true });

    const selectedIds = useSelectionStore.getState().selectedLayerIds;
    expect(selectedIds.length).toBeGreaterThanOrEqual(1);
  });

  it("Shift+クリックで範囲選択ができる", async () => {
    const user = userEvent.setup();
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<LayerPanel />);

    await user.click(screen.getByText("レイヤーA"));

    const layerC = screen.getByText("レイヤーC");
    fireEvent.click(layerC, { shiftKey: true });

    const selectedIds = useSelectionStore.getState().selectedLayerIds;
    expect(selectedIds.length).toBeGreaterThanOrEqual(1);
  });
});

describe("LayerPanel — コンテキストメニュー分岐", () => {
  beforeEach(() => {
    resetAllStores();
    clearTextures();
    vi.mocked(readPsd).mockReturnValue({
      width: 800,
      height: 600,
      children: [{ name: "背景", left: 0, top: 0, right: 800, bottom: 600 }],
    } as any);
  });

  afterEach(() => {
    clearTextures();
  });

  it("右クリックでコンテキストメニューが表示される", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<LayerPanel />);

    const layer = screen.getByText("背景").closest(".layer-item")!;
    fireEvent.contextMenu(layer, { clientX: 100, clientY: 100 });

    expect(screen.getByText(/ボーン追加/)).toBeInTheDocument();
    expect(screen.getByText(/アートパス追加/)).toBeInTheDocument();
  });

  it("コンテキストメニューの「ボーンを追加」でボーンが作成される", async () => {
    const user = userEvent.setup();
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<LayerPanel />);

    const layer = screen.getByText("背景").closest(".layer-item")!;
    fireEvent.contextMenu(layer, { clientX: 100, clientY: 100 });

    await user.click(screen.getByText(/ボーン追加/));

    expect(screen.queryByText(/ボーン追加/)).not.toBeInTheDocument();
  });

  it("パネルクリックでコンテキストメニューが閉じる", async () => {
    const user = userEvent.setup();
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<LayerPanel />);

    const layer = screen.getByText("背景").closest(".layer-item")!;
    fireEvent.contextMenu(layer, { clientX: 100, clientY: 100 });
    expect(screen.getByText(/ボーン追加/)).toBeInTheDocument();

    const panel = screen.getByText("背景").closest(".panel")!;
    await user.click(panel);

    expect(screen.queryByText(/ボーン追加/)).not.toBeInTheDocument();
  });

  it("ボーンレイヤーのコンテキストメニューに削除ボタンが表示される", () => {
    const bone = createBoneNode({ name: "テストボーン" });
    const mesh = createViviMesh({ name: "テストメッシュ" });
    const project = createProject({ layers: [bone, mesh] });
    useEditorStore.setState({ project, projectVersion: 1 });

    render(<LayerPanel />);

    const boneLayer = screen.getByText("テストボーン").closest(".layer-item")!;
    fireEvent.contextMenu(boneLayer, { clientX: 100, clientY: 100 });

    expect(screen.getByText("削除")).toBeInTheDocument();
  });

  it("ボーンレイヤーの削除ボタンで削除される", async () => {
    const user = userEvent.setup();
    const bone = createBoneNode({ name: "削除対象ボーン" });
    const mesh = createViviMesh({ name: "残るメッシュ" });
    const project = createProject({ layers: [bone, mesh] });
    useEditorStore.setState({ project, projectVersion: 1 });

    render(<LayerPanel />);

    const boneLayer = screen.getByText("削除対象ボーン").closest(".layer-item")!;
    fireEvent.contextMenu(boneLayer, { clientX: 100, clientY: 100 });

    await user.click(screen.getByText("削除"));

    expect(screen.queryByText("削除")).not.toBeInTheDocument();
  });
});

describe("LayerPanel — ソロ表示分岐", () => {
  beforeEach(() => {
    resetAllStores();
    clearTextures();
    vi.mocked(readPsd).mockReturnValue({
      width: 800,
      height: 600,
      children: [
        { name: "レイヤーA", left: 0, top: 0, right: 100, bottom: 100 },
        { name: "レイヤーB", left: 0, top: 0, right: 100, bottom: 100 },
      ],
    } as any);
  });

  afterEach(() => {
    clearTextures();
  });

  it("ソロボタンクリックでソロ表示が切り替わる", async () => {
    const user = userEvent.setup();
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<LayerPanel />);

    const soloBtns = screen.getAllByText("S");
    await user.click(soloBtns[0]!);

    const state = useSelectionStore.getState();
    expect(state.soloLayerIds.length).toBe(1);
  });

  it("Ctrl+ソロボタンクリックで追加ソロ選択される", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<LayerPanel />);

    const soloBtns = screen.getAllByText("S");
    fireEvent.click(soloBtns[0]!, { ctrlKey: true });

    fireEvent.click(soloBtns[1]!, { ctrlKey: true });

    const state = useSelectionStore.getState();
    expect(state.soloLayerIds.length).toBe(2);
  });
});

describe("LayerPanel — レイヤーアイコン分岐", () => {
  beforeEach(() => {
    resetAllStores();
    clearTextures();
  });

  afterEach(() => {
    clearTextures();
  });

  it("ボーンレイヤーにボーンアイコンが表示される", () => {
    const bone = createBoneNode({ name: "ボーン1" });
    useEditorStore.setState({
      project: createProject({ layers: [bone] }),
      projectVersion: 1,
    });

    render(<LayerPanel />);
    expect(screen.getByTestId("layer-icon-bone")).toBeInTheDocument();
  });

  it("グループレイヤーにフォルダアイコンが表示される", () => {
    const group = createGroup({ name: "グループ1" });
    useEditorStore.setState({
      project: createProject({ layers: [group] }),
      projectVersion: 1,
    });

    render(<LayerPanel />);
    expect(screen.getByTestId("layer-icon-group")).toBeInTheDocument();
  });

  it("ViviMeshにViviMeshアイコンが表示される", () => {
    const mesh = createViviMesh({ name: "メッシュ1" });
    useEditorStore.setState({
      project: createProject({ layers: [mesh] }),
      projectVersion: 1,
    });

    render(<LayerPanel />);
    expect(screen.getByTestId("layer-icon-viviMesh")).toBeInTheDocument();
  });

  it("クリップマスク付きレイヤーに CM バッジが表示される", () => {
    const mesh = createViviMesh({ name: "クリップメッシュ", clipMaskIds: ["other-1"] });
    useEditorStore.setState({
      project: createProject({ layers: [mesh] }),
      projectVersion: 1,
    });

    render(<LayerPanel />);
    expect(screen.getByText("CM")).toBeInTheDocument();
  });
});
