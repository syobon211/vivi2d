import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ExpressionPreset } from "@vivi2d/core/types";
import { beforeEach, describe, expect, it } from "vitest";
import { ExpressionPresetPanel } from "@/components/ExpressionPresetPanel";
import { clearTextures } from "@/lib/texture-store";
import { useEditorStore } from "@/stores/editorStore";
import { useParameterStore } from "@/stores/parameterStore";
import { loadPsdFromBuffer } from "@/stores/projectIO";
import { resetEditorStore, resetParameterStore } from "@/test/store-reset";


describe("ExpressionPresetPanel", () => {
  beforeEach(() => {
    resetEditorStore();
    resetParameterStore();
    clearTextures();
  });

  function setupWithPresets(presets: ExpressionPreset[]) {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    useEditorStore.setState((s) => {
      if (s.project) {
        s.project.expressionPresets = presets;
      }
    });
  }

  it("プロジェクトなしでは何も表示しない", () => {
    const { container } = render(<ExpressionPresetPanel />);
    expect(container.innerHTML).toBe("");
  });

  it("パネルタイトル「表情プリセット」が表示される", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<ExpressionPresetPanel />);
    expect(screen.getByText("表情プリセット")).toBeInTheDocument();
  });

  it("プリセットなし時に「プリセットなし」メッセージが表示される", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<ExpressionPresetPanel />);
    expect(screen.getByText("プリセットなし")).toBeInTheDocument();
  });

  it("プリセット一覧が正しく表示される", () => {
    setupWithPresets([
      { id: "p1", name: "笑顔", values: { "param-1": 0.5 } },
      { id: "p2", name: "怒り", values: { "param-1": 0.8 } },
    ]);
    render(<ExpressionPresetPanel />);

    expect(screen.getByText("笑顔")).toBeInTheDocument();
    expect(screen.getByText("怒り")).toBeInTheDocument();
    expect(screen.queryByText("プリセットなし")).not.toBeInTheDocument();
  });

  it("適用ボタンクリックでapplyPresetが呼ばれる", async () => {
    const user = userEvent.setup();
    setupWithPresets([
      { id: "preset-1", name: "笑顔", values: { "p-eye": 0.3, "p-mouth": 0.8 } },
    ]);
    useParameterStore.setState({ parameterValues: { "p-eye": 1, "p-mouth": 0 } });
    render(<ExpressionPresetPanel />);

    const applyButtons = screen.getAllByText("適用");
    await user.click(applyButtons[0]!);

    const values = useParameterStore.getState().parameterValues;
    expect(values["p-eye"]).toBe(0.3);
    expect(values["p-mouth"]).toBe(0.8);
  });

  it("削除ボタンクリックでremovePresetが呼ばれる", async () => {
    const user = userEvent.setup();
    setupWithPresets([{ id: "del-1", name: "削除対象", values: {} }]);
    render(<ExpressionPresetPanel />);

    expect(screen.getByText("削除対象")).toBeInTheDocument();

    const deleteBtn = screen.getByText("x");
    await user.click(deleteBtn);

    expect(useEditorStore.getState().project!.expressionPresets!.length).toBe(0);
  });

  it("「現在の値を保存」ボタンが表示される", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<ExpressionPresetPanel />);
    expect(screen.getByText("現在の値を保存")).toBeInTheDocument();
  });

  it("保存ボタンクリックで名前入力が表示される", async () => {
    const user = userEvent.setup();
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<ExpressionPresetPanel />);

    await user.click(screen.getByText("現在の値を保存"));

    expect(screen.getByPlaceholderText("プリセット名")).toBeInTheDocument();
    expect(screen.getByText(/OK|確認/)).toBeInTheDocument();
    expect(screen.getByText("キャンセル")).toBeInTheDocument();
    expect(screen.queryByText("現在の値を保存")).not.toBeInTheDocument();
  });

  it("名前を入力してOKクリックでプリセットが作成される", async () => {
    const user = userEvent.setup();
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    useParameterStore.setState({ parameterValues: { eye: 0.5 } });
    render(<ExpressionPresetPanel />);

    await user.click(screen.getByText("現在の値を保存"));
    await user.type(screen.getByPlaceholderText("プリセット名"), "新表情");
    await user.click(screen.getByText(/OK|確認/));

    const presets = useEditorStore.getState().project!.expressionPresets!;
    expect(presets.length).toBe(1);
    expect(presets[0]!.name).toBe("新表情");
    expect(presets[0]!.values.eye).toBe(0.5);
  });

  it("キャンセルクリックでフォームが閉じる", async () => {
    const user = userEvent.setup();
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<ExpressionPresetPanel />);

    await user.click(screen.getByText("現在の値を保存"));
    expect(screen.getByPlaceholderText("プリセット名")).toBeInTheDocument();

    await user.click(screen.getByText("キャンセル"));

    expect(screen.queryByPlaceholderText("プリセット名")).not.toBeInTheDocument();
    expect(screen.getByText("現在の値を保存")).toBeInTheDocument();
  });

  it("ホットキーバッジが表示される", () => {
    setupWithPresets([
      { id: "hk1", name: "表情A", values: {}, hotkey: 3 },
      { id: "hk2", name: "表情B", values: {} },
    ]);
    render(<ExpressionPresetPanel />);

    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("-")).toBeInTheDocument();
  });


  describe("インライン名前編集", () => {
    it("プリセット名をダブルクリックすると編集モードになる", async () => {
      const user = userEvent.setup();
      setupWithPresets([{ id: "edit-1", name: "元の名前", values: {} }]);
      render(<ExpressionPresetPanel />);

      await user.dblClick(screen.getByText("元の名前"));

      const input = screen.getByDisplayValue("元の名前");
      expect(input).toBeInTheDocument();
    });

    it("編集モードでEnterを押すと名前が変更される", async () => {
      const user = userEvent.setup();
      setupWithPresets([{ id: "edit-2", name: "旧名前", values: {} }]);
      render(<ExpressionPresetPanel />);

      await user.dblClick(screen.getByText("旧名前"));

      const input = screen.getByDisplayValue("旧名前");
      await user.clear(input);
      await user.type(input, "新名前");
      await user.keyboard("{Enter}");

      const presets = useEditorStore.getState().project!.expressionPresets!;
      expect(presets[0]!.name).toBe("新名前");
    });

    it("編集モードでEscapeを押すと変更がキャンセルされる", async () => {
      const user = userEvent.setup();
      setupWithPresets([{ id: "edit-3", name: "変更されない", values: {} }]);
      render(<ExpressionPresetPanel />);

      await user.dblClick(screen.getByText("変更されない"));

      const input = screen.getByDisplayValue("変更されない");
      await user.clear(input);
      await user.type(input, "新しい名前");
      await user.keyboard("{Escape}");

      const presets = useEditorStore.getState().project!.expressionPresets!;
      expect(presets[0]!.name).toBe("変更されない");
    });

    it("編集モードでblurすると名前が確定される", async () => {
      const user = userEvent.setup();
      setupWithPresets([{ id: "edit-4", name: "blur確定", values: {} }]);
      render(<ExpressionPresetPanel />);

      await user.dblClick(screen.getByText("blur確定"));

      const input = screen.getByDisplayValue("blur確定");
      await user.clear(input);
      await user.type(input, "blur後の名前");
      await user.tab();

      const presets = useEditorStore.getState().project!.expressionPresets!;
      expect(presets[0]!.name).toBe("blur後の名前");
    });

    it("空文字にトリムされる場合は名前が変更されない", async () => {
      const user = userEvent.setup();
      setupWithPresets([{ id: "edit-5", name: "空白不可", values: {} }]);
      render(<ExpressionPresetPanel />);

      await user.dblClick(screen.getByText("空白不可"));

      const input = screen.getByDisplayValue("空白不可");
      await user.clear(input);
      await user.type(input, "   ");
      await user.keyboard("{Enter}");

      const presets = useEditorStore.getState().project!.expressionPresets!;
      expect(presets[0]!.name).toBe("空白不可");
    });
  });


  describe("ホットキーバッジのサイクル", () => {
    it("ホットキーなし→1に変更される", async () => {
      const user = userEvent.setup();
      setupWithPresets([{ id: "hk-cycle-1", name: "サイクル", values: {} }]);
      render(<ExpressionPresetPanel />);

      await user.click(screen.getByText("-"));

      const presets = useEditorStore.getState().project!.expressionPresets!;
      expect(presets[0]!.hotkey).toBe(1);
    });

    it("ホットキー9→なし(undefined)に変更される", async () => {
      const user = userEvent.setup();
      setupWithPresets([{ id: "hk-cycle-9", name: "サイクル9", values: {}, hotkey: 9 }]);
      render(<ExpressionPresetPanel />);

      await user.click(screen.getByText("9"));

      const presets = useEditorStore.getState().project!.expressionPresets!;
      expect(presets[0]!.hotkey).toBeUndefined();
    });

    it("ホットキー1→2に変更される", async () => {
      const user = userEvent.setup();
      setupWithPresets([{ id: "hk-cycle-2", name: "サイクル12", values: {}, hotkey: 1 }]);
      render(<ExpressionPresetPanel />);

      await user.click(screen.getByText("1"));

      const presets = useEditorStore.getState().project!.expressionPresets!;
      expect(presets[0]!.hotkey).toBe(2);
    });
  });


  describe("保存フォームの入力バリデーション", () => {
    it("空文字でOKを押してもプリセットは作成されない", async () => {
      const user = userEvent.setup();
      loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
      render(<ExpressionPresetPanel />);

      await user.click(screen.getByText("現在の値を保存"));

      await user.click(screen.getByText(/OK|確認/));

      const project = useEditorStore.getState().project!;
      expect(project.expressionPresets ?? []).toHaveLength(0);
    });

    it("スペースのみの名前でOKを押してもプリセットは作成されない", async () => {
      const user = userEvent.setup();
      loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
      render(<ExpressionPresetPanel />);

      await user.click(screen.getByText("現在の値を保存"));
      await user.type(screen.getByPlaceholderText("プリセット名"), "   ");
      await user.click(screen.getByText(/OK|確認/));

      const project = useEditorStore.getState().project!;
      expect(project.expressionPresets ?? []).toHaveLength(0);
    });

    it("Enterキーで保存が確定される", async () => {
      const user = userEvent.setup();
      loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
      useParameterStore.setState({ parameterValues: { eye: 0.7 } });
      render(<ExpressionPresetPanel />);

      await user.click(screen.getByText("現在の値を保存"));
      await user.type(screen.getByPlaceholderText("プリセット名"), "Enter保存");
      await user.keyboard("{Enter}");

      const presets = useEditorStore.getState().project!.expressionPresets!;
      expect(presets.length).toBe(1);
      expect(presets[0]!.name).toBe("Enter保存");
    });

    it("Escapeキーでフォームが閉じる", async () => {
      const user = userEvent.setup();
      loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
      render(<ExpressionPresetPanel />);

      await user.click(screen.getByText("現在の値を保存"));
      expect(screen.getByPlaceholderText("プリセット名")).toBeInTheDocument();

      await user.keyboard("{Escape}");

      expect(screen.queryByPlaceholderText("プリセット名")).not.toBeInTheDocument();
      expect(screen.getByText("現在の値を保存")).toBeInTheDocument();
    });
  });


  describe("複数ホットキー付きプリセット一覧", () => {
    it("複数のホットキー付きプリセットが正しく表示される", () => {
      setupWithPresets([
        { id: "multi-1", name: "表情1", values: {}, hotkey: 1 },
        { id: "multi-2", name: "表情2", values: {}, hotkey: 5 },
        { id: "multi-3", name: "表情3", values: {} },
      ]);
      render(<ExpressionPresetPanel />);

      expect(screen.getByText("表情1")).toBeInTheDocument();
      expect(screen.getByText("表情2")).toBeInTheDocument();
      expect(screen.getByText("表情3")).toBeInTheDocument();
      expect(screen.getByText("1")).toBeInTheDocument();
      expect(screen.getByText("5")).toBeInTheDocument();
      expect(screen.getByText("-")).toBeInTheDocument();
    });
  });
});
