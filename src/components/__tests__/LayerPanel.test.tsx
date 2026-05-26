import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readPsd } from "ag-psd";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LayerPanel } from "@/components/LayerPanel";
import { clearTextures } from "@/lib/texture-store";
import { useEditorStore } from "@/stores/editorStore";
import { loadPsdFromBuffer } from "@/stores/projectIO";
import { useSelectionStore } from "@/stores/selectionStore";
import { resetAllStores } from "@/test/store-reset";

describe("LayerPanel", () => {
  beforeEach(() => {
    resetAllStores();
    clearTextures();
    vi.mocked(readPsd).mockReturnValue({
      width: 800,
      height: 600,
      children: [
        { name: "背景", left: 0, top: 0, right: 800, bottom: 600 },
        {
          name: "キャラグループ",
          children: [
            { name: "体", left: 100, top: 100, right: 300, bottom: 500 },
            {
              name: "顔",
              left: 150,
              top: 50,
              right: 250,
              bottom: 150,
              hidden: true,
              opacity: 0.78,
            },
          ],
        },
      ],
    } as any);
  });

  afterEach(() => {
    clearTextures();
  });

  it("プロジェクト未読み込み時にプレースホルダーを表示する", () => {
    render(<LayerPanel />);
    expect(screen.getByText("PSD ファイルを開いてください")).toBeInTheDocument();
  });

  it("レイヤー一覧を表示する", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<LayerPanel />);

    expect(screen.getByText("背景")).toBeInTheDocument();
    expect(screen.getByText("キャラグループ")).toBeInTheDocument();
    expect(screen.getByText("体")).toBeInTheDocument();
    expect(screen.getByText("顔")).toBeInTheDocument();
  });

  it("レイヤーをクリックして選択できる", async () => {
    const user = userEvent.setup();
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<LayerPanel />);

    await user.click(screen.getByText("背景"));
    const layerId = useEditorStore.getState().project!.layers[0]!.id;
    expect(useSelectionStore.getState().selectedLayerId).toBe(layerId);
  });

  it("選択中のレイヤーに selected クラスが付く", async () => {
    const user = userEvent.setup();
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<LayerPanel />);

    await user.click(screen.getByText("背景"));
    const layerItem = screen.getByText("背景").closest(".layer-item");
    expect(layerItem).toHaveClass("selected");
  });

  it("非表示レイヤーに hidden-layer クラスが付く", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<LayerPanel />);

    const hiddenItem = screen.getByText("顔").closest(".layer-item");
    expect(hiddenItem).toHaveClass("hidden-layer");
  });

  it("表示/非表示ボタンで visibility を切り替えられる", async () => {
    const user = userEvent.setup();
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<LayerPanel />);

    const visBtns = screen.getAllByTitle("非表示にする");
    await user.click(visBtns[0]!);

    const bgId = useEditorStore.getState().project!.layers[0]!.id;
    const layer = useEditorStore.getState().project!.layers.find((l) => l.id === bgId);
    expect(layer!.visible).toBe(false);
  });

  it("グループの展開/折りたたみを切り替えられる", async () => {
    const user = userEvent.setup();
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<LayerPanel />);

    expect(screen.getByText("体")).toBeInTheDocument();

    const expandBtn = screen.getByRole("button", { name: "折りたたみ" });
    await user.click(expandBtn);

    expect(screen.queryByText("体")).not.toBeInTheDocument();
    expect(screen.queryByText("顔")).not.toBeInTheDocument();
  });

  it("パネルヘッダーに「レイヤー」と表示する", () => {
    render(<LayerPanel />);
    expect(screen.getByText("レイヤー")).toBeInTheDocument();
  });

  it("不透明度が100%未満のレイヤーにパーセント表記を表示する", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<LayerPanel />);

    expect(screen.getByText("78%")).toBeInTheDocument();
  });


  it("panel-content に role=tree と aria-label が付く", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<LayerPanel />);
    const tree = screen.getByRole("tree");
    expect(tree).toHaveAttribute("aria-label", "レイヤー");
  });

  it("各レイヤーに role=treeitem と aria-level が付く", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<LayerPanel />);
    const items = screen.getAllByRole("treeitem");
    expect(items.length).toBeGreaterThanOrEqual(4);
    const bg = screen.getByText("背景").closest('[role="treeitem"]');
    expect(bg).toHaveAttribute("aria-level", "1");
    const kao = screen.getByText("顔").closest('[role="treeitem"]');
    expect(kao).toHaveAttribute("aria-level", "2");
  });

  it("グループに aria-expanded=true、子なしレイヤーには aria-expanded なし", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<LayerPanel />);
    const group = screen.getByText("キャラグループ").closest('[role="treeitem"]');
    expect(group).toHaveAttribute("aria-expanded", "true");
    const bg = screen.getByText("背景").closest('[role="treeitem"]');
    expect(bg).not.toHaveAttribute("aria-expanded");
  });

  it("選択レイヤーに aria-selected=true が付く", async () => {
    const user = userEvent.setup();
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<LayerPanel />);
    await user.click(screen.getByText("背景"));
    const bg = screen.getByText("背景").closest('[role="treeitem"]');
    expect(bg).toHaveAttribute("aria-selected", "true");
  });

  it("Enter キーで選択できる", async () => {
    const user = userEvent.setup();
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<LayerPanel />);

    const firstItem = screen
      .getByText("背景")
      .closest('[role="treeitem"]') as HTMLElement;
    firstItem.focus();
    expect(firstItem).toHaveFocus();

    await user.keyboard("{Enter}");
    const layerId = useEditorStore.getState().project!.layers[0]!.id;
    expect(useSelectionStore.getState().selectedLayerId).toBe(layerId);
  });

  it("ArrowDown で次の treeitem にフォーカス", async () => {
    const user = userEvent.setup();
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<LayerPanel />);

    const firstItem = screen
      .getByText("背景")
      .closest('[role="treeitem"]') as HTMLElement;
    firstItem.focus();

    await user.keyboard("{ArrowDown}");
    const next = screen
      .getByText("キャラグループ")
      .closest('[role="treeitem"]') as HTMLElement;
    expect(next).toHaveFocus();
  });

  it("ArrowLeft で展開されているグループを畳む", async () => {
    const user = userEvent.setup();
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<LayerPanel />);

    const group = screen
      .getByText("キャラグループ")
      .closest('[role="treeitem"]') as HTMLElement;
    group.focus();
    expect(screen.getByText("体")).toBeInTheDocument();

    await user.keyboard("{ArrowLeft}");
    expect(screen.queryByText("体")).not.toBeInTheDocument();
  });

  it("ArrowRight で畳まれたグループを展開する", async () => {
    const user = userEvent.setup();
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<LayerPanel />);

    const group = screen
      .getByText("キャラグループ")
      .closest('[role="treeitem"]') as HTMLElement;
    group.focus();
    await user.keyboard("{ArrowLeft}");
    expect(screen.queryByText("体")).not.toBeInTheDocument();

    await user.keyboard("{ArrowRight}");
    expect(screen.getByText("体")).toBeInTheDocument();
  });

  it("Home/End で先頭/末尾にジャンプ", async () => {
    const user = userEvent.setup();
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<LayerPanel />);

    const bg = screen.getByText("背景").closest('[role="treeitem"]') as HTMLElement;
    bg.focus();

    await user.keyboard("{End}");
    const kao = screen.getByText("顔").closest('[role="treeitem"]') as HTMLElement;
    expect(kao).toHaveFocus();

    await user.keyboard("{Home}");
    expect(bg).toHaveFocus();
  });
});
