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

function setupProjectWithParam(name = "角度X", min = -30, max = 30, def = 0) {
  loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
  useParameterDefinitionStore.getState().addParameter(name, min, max, def);
  const params = useEditorStore.getState().project!.parameters;
  const added = params[params.length - 1];
  useParameterStore.getState().setParameterValue(added!.id, added!.defaultValue);
  return added!;
}

describe("ParameterPanel", () => {
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


  describe("基本表示", () => {
    it("プロジェクト未読み込み時は何も描画しない", () => {
      const { container } = render(<ParameterPanel />);
      expect(container.innerHTML).toBe("");
    });

    it("パラメータなしの場合「パラメータなし」を表示する", () => {
      loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
      render(<ParameterPanel />);
      expect(screen.getByText("パラメータなし")).toBeInTheDocument();
    });

    it("「パラメータ」タイトルを表示する", () => {
      loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
      render(<ParameterPanel />);
      expect(screen.getByText("パラメータ")).toBeInTheDocument();
    });

    it("「リセット」ボタンを表示する", () => {
      loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
      render(<ParameterPanel />);
      expect(screen.getByText("リセット")).toBeInTheDocument();
    });

    it("「+ 追加」ボタンを表示する", () => {
      loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
      render(<ParameterPanel />);
      expect(screen.getByText("+ 追加")).toBeInTheDocument();
    });
  });


  describe("パラメータスライダー表示", () => {
    it("パラメータがある場合スライダーを表示する", () => {
      setupProjectWithParam();
      render(<ParameterPanel />);

      const slider = screen.getByRole("slider");
      expect(slider).toBeInTheDocument();
    });

    it("パラメータ名を表示する", () => {
      setupProjectWithParam("角度X");
      render(<ParameterPanel />);
      expect(screen.getByText("角度X")).toBeInTheDocument();
    });

    it("整数の値はそのまま表示する", () => {
      setupProjectWithParam("角度X", -30, 30, 0);
      render(<ParameterPanel />);
      expect(screen.getByText("0")).toBeInTheDocument();
    });

    it("小数の値は小数点以下1桁で表示する", () => {
      const param = setupProjectWithParam("角度X", -1, 1, 0);
      useParameterStore.getState().setParameterValue(param!.id, 0.5);
      render(<ParameterPanel />);
      expect(screen.getByText("0.5")).toBeInTheDocument();
    });

    it("削除ボタン「x」を表示する", () => {
      setupProjectWithParam();
      render(<ParameterPanel />);
      expect(screen.getByTitle("パラメータを削除")).toBeInTheDocument();
      expect(screen.getByText("x")).toBeInTheDocument();
    });
  });


  describe("スライダー操作", () => {
    it("スライダー変更で parameterStore の値が更新される", async () => {
      const param = setupProjectWithParam("角度X", -30, 30, 0);
      render(<ParameterPanel />);

      const slider = screen.getByRole("slider");
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        slider,
        "15",
      );
      slider.dispatchEvent(new Event("change", { bubbles: true }));

      expect(useParameterStore.getState().parameterValues[param.id]).toBe(15);
    });

    it("値が min/max でクランプされる", () => {
      const param = setupProjectWithParam("角度X", -30, 30, 0);
      render(<ParameterPanel />);

      const slider = screen.getByRole("slider");
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        slider,
        "999",
      );
      slider.dispatchEvent(new Event("change", { bubbles: true }));

      expect(useParameterStore.getState().parameterValues[param.id]).toBe(30);
    });
  });


  describe("パラメータ名ダブルクリック", () => {
    it("ダブルクリックでデフォルト値にリセットする", async () => {
      const user = userEvent.setup();
      const param = setupProjectWithParam("角度X", -30, 30, 0);
      useParameterStore.getState().setParameterValue(param.id, 15);
      render(<ParameterPanel />);

      const paramName = screen.getByText("角度X");
      await user.dblClick(paramName);

      expect(useParameterStore.getState().parameterValues[param.id]).toBe(0);
    });
  });


  describe("削除ボタン", () => {
    it("パラメータを削除し parameterStore からも削除する", async () => {
      const user = userEvent.setup();
      const param = setupProjectWithParam("角度X");
      render(<ParameterPanel />);

      expect(useEditorStore.getState().project!.parameters).toHaveLength(1);
      expect(useParameterStore.getState().parameterValues[param.id]).toBeDefined();

      const removeBtn = screen.getByTitle("パラメータを削除");
      await user.click(removeBtn);

      expect(useEditorStore.getState().project!.parameters).toHaveLength(0);
      expect(useParameterStore.getState().parameterValues[param.id]).toBeUndefined();
    });
  });


  describe("リセットボタン", () => {
    it("全パラメータをデフォルト値にリセットする", async () => {
      const user = userEvent.setup();

      loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
      useParameterDefinitionStore.getState().addParameter("角度X", -30, 30, 0);
      useParameterDefinitionStore.getState().addParameter("角度Y", -30, 30, 5);
      const params = useEditorStore.getState().project!.parameters;
      const param1 = params[0]!;
      const param2 = params[1]!;

      useParameterStore.getState().setParameterValue(param1.id, 20);
      useParameterStore.getState().setParameterValue(param2.id, -10);

      render(<ParameterPanel />);

      const resetBtn = screen.getByText("リセット");
      await user.click(resetBtn);

      expect(useParameterStore.getState().parameterValues[param1.id]).toBe(0);
      expect(useParameterStore.getState().parameterValues[param2.id]).toBe(5);
    });
  });


  describe("追加フォーム", () => {
    it("「+ 追加」クリックでフォームが開く", async () => {
      const user = userEvent.setup();
      loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
      render(<ParameterPanel />);

      await user.click(screen.getByText("+ 追加"));

      expect(screen.getByPlaceholderText("パラメータ名")).toBeInTheDocument();
    });

    it("パラメータ名、最小、最大、初期値の入力フィールドを表示する", async () => {
      const user = userEvent.setup();
      loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
      render(<ParameterPanel />);

      await user.click(screen.getByText("+ 追加"));

      expect(screen.getByPlaceholderText("パラメータ名")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("最小")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("最大")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("初期値")).toBeInTheDocument();
    });

    it("OK ボタンで追加（ストアに反映）する", async () => {
      const user = userEvent.setup();
      loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
      render(<ParameterPanel />);

      await user.click(screen.getByText("+ 追加"));

      await user.clear(screen.getByPlaceholderText("パラメータ名"));
      await user.type(screen.getByPlaceholderText("パラメータ名"), "体の回転");
      await user.clear(screen.getByPlaceholderText("最小"));
      await user.type(screen.getByPlaceholderText("最小"), "-10");
      await user.clear(screen.getByPlaceholderText("最大"));
      await user.type(screen.getByPlaceholderText("最大"), "10");
      await user.clear(screen.getByPlaceholderText("初期値"));
      await user.type(screen.getByPlaceholderText("初期値"), "0");

      await user.click(screen.getByText(/OK|確認/));

      const params = useEditorStore.getState().project!.parameters;
      expect(params).toHaveLength(1);
      expect(params[0]!.name).toBe("体の回転");
      expect(params[0]!.minValue).toBe(-10);
      expect(params[0]!.maxValue).toBe(10);
      expect(params[0]!.defaultValue).toBe(0);

      expect(useParameterStore.getState().parameterValues[params[0]!.id]).toBe(0);

      expect(screen.getByText("+ 追加")).toBeInTheDocument();
    });

    it("取消ボタンでフォームを閉じる", async () => {
      const user = userEvent.setup();
      loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
      render(<ParameterPanel />);

      await user.click(screen.getByText("+ 追加"));
      expect(screen.getByPlaceholderText("パラメータ名")).toBeInTheDocument();

      await user.click(screen.getByText("キャンセル"));

      expect(screen.queryByPlaceholderText("パラメータ名")).not.toBeInTheDocument();
      expect(screen.getByText("+ 追加")).toBeInTheDocument();
    });

    it("空の名前では追加しない", async () => {
      const user = userEvent.setup();
      loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
      render(<ParameterPanel />);

      await user.click(screen.getByText("+ 追加"));

      await user.clear(screen.getByPlaceholderText("パラメータ名"));
      await user.click(screen.getByText(/OK|確認/));

      expect(useEditorStore.getState().project!.parameters).toHaveLength(0);
      expect(screen.getByPlaceholderText("パラメータ名")).toBeInTheDocument();
    });

    it("min >= max では追加しない", async () => {
      const user = userEvent.setup();
      loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
      render(<ParameterPanel />);

      await user.click(screen.getByText("+ 追加"));

      await user.clear(screen.getByPlaceholderText("パラメータ名"));
      await user.type(screen.getByPlaceholderText("パラメータ名"), "無効パラメータ");
      await user.clear(screen.getByPlaceholderText("最小"));
      await user.type(screen.getByPlaceholderText("最小"), "10");
      await user.clear(screen.getByPlaceholderText("最大"));
      await user.type(screen.getByPlaceholderText("最大"), "10");

      await user.click(screen.getByText(/OK|確認/));

      expect(useEditorStore.getState().project!.parameters).toHaveLength(0);
    });

    it("Enter キーで送信できる", async () => {
      const user = userEvent.setup();
      loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
      render(<ParameterPanel />);

      await user.click(screen.getByText("+ 追加"));

      const nameInput = screen.getByPlaceholderText("パラメータ名");
      await user.clear(nameInput);
      await user.type(nameInput, "目の開閉");

      await user.keyboard("{Enter}");

      const params = useEditorStore.getState().project!.parameters;
      expect(params).toHaveLength(1);
      expect(params[0]!.name).toBe("目の開閉");
    });
  });


  describe("パラメータ結合", () => {
    function setupTwoParams() {
      loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
      const store = useParameterDefinitionStore.getState();
      store.addParameter("角度X", -30, 30, 0);
      store.addParameter("角度Y", -30, 30, 0);
      const params = useEditorStore.getState().project!.parameters;
      for (const p of params) {
        useParameterStore.getState().setParameterValue(p.id, p.defaultValue);
      }
      return { paramX: params[0]!, paramY: params[1]! };
    }

    it("結合済みパラメータは2Dスライダーとして1つにまとまる", () => {
      const { paramX, paramY } = setupTwoParams();

      useParameterDefinitionStore.getState().pairParameters(paramX.id, paramY.id);

      render(<ParameterPanel />);

      expect(screen.getByText("角度X / 角度Y")).toBeInTheDocument();
      expect(screen.queryByRole("slider")).not.toBeInTheDocument();
    });

    it("結合ボタンをクリックするとペアメニューが表示される", async () => {
      const user = userEvent.setup();
      setupTwoParams();

      render(<ParameterPanel />);

      const pairBtns = screen.getAllByTitle("パラメータを結合");
      await user.click(pairBtns[0]!);

      const options = screen.getAllByText("角度Y");
      const menuOption = options.find((el) => el.classList.contains("param-pair-option"));
      expect(menuOption).toBeDefined();
    });

    it("結合解除ボタンで1Dスライダーに戻る", async () => {
      const user = userEvent.setup();
      const { paramX, paramY } = setupTwoParams();

      useParameterDefinitionStore.getState().pairParameters(paramX.id, paramY.id);

      render(<ParameterPanel />);

      expect(screen.getByText("角度X / 角度Y")).toBeInTheDocument();

      const unpairBtn = screen.getByTitle("結合を解除");
      await user.click(unpairBtn);

      const sliders = screen.getAllByRole("slider");
      expect(sliders).toHaveLength(2);
    });
  });
});
