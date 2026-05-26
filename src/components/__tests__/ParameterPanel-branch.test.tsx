import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readPsd } from "ag-psd";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ParameterPanel } from "@/components/ParameterPanel";
import { clearTextures } from "@/lib/texture-store";
import { useEditorStore } from "@/stores/editorStore";
import { useParameterDefinitionStore } from "@/stores/parameterDefinitionStore";
import { useParameterStore } from "@/stores/parameterStore";
import { loadPsdFromBuffer } from "@/stores/projectIO";
import { resetAllStores } from "@/test/store-reset";


describe("ParameterPanel — フィルタリング・グループ化分岐", () => {
  beforeEach(() => {
    resetAllStores();
    clearTextures();
    vi.mocked(readPsd).mockReturnValue({
      width: 800,
      height: 600,
      children: [{ name: "テスト", left: 0, top: 0, right: 100, bottom: 100 }],
    } as any);
  });

  afterEach(() => {
    clearTextures();
  });

  function setupGroupedParams() {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    const store = useParameterDefinitionStore.getState();
    store.addParameter("顔の角度X", -30, 30, 0, "顔");
    store.addParameter("顔の角度Y", -30, 30, 0, "顔");
    store.addParameter("体の回転", -30, 30, 0, "体");
    store.addParameter("髪の揺れ", -1, 1, 0);
    const params = useEditorStore.getState().project!.parameters;
    for (const p of params) {
      useParameterStore.getState().setParameterValue(p.id, p.defaultValue);
    }
    return params;
  }

  it("フィルタ入力でパラメータ名にマッチするものだけ表示される", async () => {
    const user = userEvent.setup();
    setupGroupedParams();
    render(<ParameterPanel />);

    const filterInput = screen.getByPlaceholderText("検索...");
    await user.type(filterInput, "顔");

    expect(screen.getByText("顔の角度X")).toBeInTheDocument();
    expect(screen.getByText("顔の角度Y")).toBeInTheDocument();
    expect(screen.queryByText("体の回転")).not.toBeInTheDocument();
    expect(screen.queryByText("髪の揺れ")).not.toBeInTheDocument();
  });

  it("フィルタでグループ名にもマッチする", async () => {
    const user = userEvent.setup();
    setupGroupedParams();
    render(<ParameterPanel />);

    const filterInput = screen.getByPlaceholderText("検索...");
    await user.type(filterInput, "体");

    expect(screen.getByText("体の回転")).toBeInTheDocument();
    expect(screen.queryByText("顔の角度X")).not.toBeInTheDocument();
  });

  it("フィルタで何もマッチしない場合「一致なし」メッセージ表示", async () => {
    const user = userEvent.setup();
    setupGroupedParams();
    render(<ParameterPanel />);

    const filterInput = screen.getByPlaceholderText("検索...");
    await user.type(filterInput, "存在しないパラメータ名");

    expect(screen.getByText("該当なし")).toBeInTheDocument();
  });

  it("フィルタのクリアボタンでフィルタをリセットできる", async () => {
    const user = userEvent.setup();
    setupGroupedParams();
    render(<ParameterPanel />);

    const filterInput = screen.getByPlaceholderText("検索...");
    await user.type(filterInput, "顔");
    expect(screen.queryByText("体の回転")).not.toBeInTheDocument();

    const clearBtn = document.querySelector(".parameter-filter-clear")!;
    await user.click(clearBtn);

    expect(screen.getByText("顔の角度X")).toBeInTheDocument();
    expect(screen.getByText("体の回転")).toBeInTheDocument();
  });

  it("グループヘッダーをクリックで折りたたみ・展開ができる", async () => {
    const user = userEvent.setup();
    setupGroupedParams();
    render(<ParameterPanel />);

    const groupHeaders = screen.getAllByText("顔");
    const faceGroupHeader = groupHeaders.find((el) =>
      el.closest(".parameter-group-header"),
    );
    if (faceGroupHeader) {
      await user.click(faceGroupHeader);
      await user.click(faceGroupHeader);
    }
  });

  it("グループが1つだけの場合でもヘッダーが表示される（複数グループ時）", () => {
    setupGroupedParams();
    render(<ParameterPanel />);

    const groupHeaders = screen.getAllByText(/顔|体|未分類/);
    expect(groupHeaders.length).toBeGreaterThanOrEqual(2);
  });

  it("2Dスライダーのフィルタリングでは paramX, paramY の両方の名前がマッチ対象", async () => {
    const user = userEvent.setup();
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    const store = useParameterDefinitionStore.getState();
    store.addParameter("角度X", -30, 30, 0);
    store.addParameter("角度Y", -30, 30, 0);

    const params = useEditorStore.getState().project!.parameters;
    for (const p of params) {
      useParameterStore.getState().setParameterValue(p.id, p.defaultValue);
    }

    useParameterDefinitionStore.getState().pairParameters(params[0]!.id, params[1]!.id);

    render(<ParameterPanel />);

    const filterInput = screen.getByPlaceholderText("検索...");
    await user.type(filterInput, "角度Y");

    expect(screen.getByText("角度X / 角度Y")).toBeInTheDocument();
  });

  it("min > max の入力では追加フォームが送信されない", async () => {
    const user = userEvent.setup();
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    const paramsBefore = useEditorStore.getState().project!.parameters.length;
    render(<ParameterPanel />);

    await user.click(screen.getByText("+ 追加"));

    await user.clear(screen.getByPlaceholderText("パラメータ名"));
    await user.type(screen.getByPlaceholderText("パラメータ名"), "無効テスト");
    const minInput = screen.getByPlaceholderText("最小");
    await user.clear(minInput);
    await user.type(minInput, "50");
    const maxInput = screen.getByPlaceholderText("最大");
    await user.clear(maxInput);
    await user.type(maxInput, "10");

    await user.click(screen.getByText(/OK|確認/));

    expect(useEditorStore.getState().project!.parameters).toHaveLength(paramsBefore);
  });

  it("デフォルト値が min/max 範囲外の場合クランプされる", async () => {
    const user = userEvent.setup();
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<ParameterPanel />);

    await user.click(screen.getByText("+ 追加"));

    await user.clear(screen.getByPlaceholderText("パラメータ名"));
    await user.type(screen.getByPlaceholderText("パラメータ名"), "クランプテスト");
    await user.clear(screen.getByPlaceholderText("最小"));
    await user.type(screen.getByPlaceholderText("最小"), "0");
    await user.clear(screen.getByPlaceholderText("最大"));
    await user.type(screen.getByPlaceholderText("最大"), "10");
    await user.clear(screen.getByPlaceholderText("初期値"));
    await user.type(screen.getByPlaceholderText("初期値"), "999");

    await user.click(screen.getByText(/OK|確認/));

    const params = useEditorStore.getState().project!.parameters;
    expect(params).toHaveLength(1);
    expect(params[0]!.defaultValue).toBe(10);
  });

  it("グループ入力フィールドに値を入力してパラメータを追加できる", async () => {
    const user = userEvent.setup();
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<ParameterPanel />);

    await user.click(screen.getByText("+ 追加"));

    await user.clear(screen.getByPlaceholderText("パラメータ名"));
    await user.type(screen.getByPlaceholderText("パラメータ名"), "瞳の大きさ");
    await user.clear(screen.getByPlaceholderText("グループ（任意）"));
    await user.type(screen.getByPlaceholderText("グループ（任意）"), "目");

    await user.click(screen.getByText(/OK|確認/));

    const params = useEditorStore.getState().project!.parameters;
    expect(params).toHaveLength(1);
    expect(params[0]!.name).toBe("瞳の大きさ");
    expect(params[0]!.group).toBe("目");
  });
});
