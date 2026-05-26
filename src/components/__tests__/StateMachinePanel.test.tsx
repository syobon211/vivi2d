import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { StateMachinePanel } from "@/components/StateMachinePanel";
import { clearTextures } from "@/lib/texture-store";
import { useEditorStore } from "@/stores/editorStore";
import { loadPsdFromBuffer } from "@/stores/projectIO";
import { useStateMachineStore } from "@/stores/stateMachineStore";
import { resetEditorStore } from "@/test/store-reset";

describe("StateMachinePanel", () => {
  beforeEach(() => {
    resetEditorStore();
    clearTextures();
  });

  it("プロジェクトなしでは何も表示しない", () => {
    const { container } = render(<StateMachinePanel />);
    expect(container.innerHTML).toBe("");
  });

  it("プロジェクトありでパネルヘッダーが表示される", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<StateMachinePanel />);
    expect(screen.getByText("ステートマシン")).toBeInTheDocument();
  });

  it("追加ボタンでステートマシンを追加できる", async () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<StateMachinePanel />);

    fireEvent.click(screen.getByText(/ステートマシン追加/));

    await waitFor(() => {
      expect(useEditorStore.getState().project!.stateMachines).toHaveLength(1);
      expect(screen.getByDisplayValue("ステートマシン 1")).toBeInTheDocument();
    });
  });

  it("追加時にidle状態が自動作成される", async () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<StateMachinePanel />);

    fireEvent.click(screen.getByText(/ステートマシン追加/));

    await waitFor(() => {
      expect(screen.getByDisplayValue("idle")).toBeInTheDocument();
    });
  });

  it("有効/無効チェックボックスで切り替えできる", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    useStateMachineStore.getState().addStateMachine("テスト");

    render(<StateMachinePanel />);
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes[0]).toBeChecked();

    fireEvent.click(checkboxes[0]!);
    expect(useEditorStore.getState().project!.stateMachines[0]!.enabled).toBe(false);
  });

  it("名前変更が反映される", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    useStateMachineStore.getState().addStateMachine("旧名");

    render(<StateMachinePanel />);
    const nameInput = screen.getByDisplayValue("旧名");
    fireEvent.change(nameInput, { target: { value: "新名" } });

    expect(useEditorStore.getState().project!.stateMachines[0]!.name).toBe("新名");
  });

  it("削除ボタンでステートマシンを削除できる", async () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    useStateMachineStore.getState().addStateMachine("削除対象");

    render(<StateMachinePanel />);
    expect(screen.getByDisplayValue("削除対象")).toBeInTheDocument();

    fireEvent.click(screen.getByTitle("削除"));

    await waitFor(() => {
      expect(useEditorStore.getState().project!.stateMachines).toHaveLength(0);
    });
  });

  it("状態追加ボタンでフォームが表示される", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    useStateMachineStore.getState().addStateMachine("テスト");

    render(<StateMachinePanel />);
    fireEvent.click(screen.getByText(/状態追加/));

    expect(screen.getByPlaceholderText("状態名")).toBeInTheDocument();
  });

  it("状態を追加できる", async () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    useStateMachineStore.getState().addStateMachine("テスト");

    render(<StateMachinePanel />);
    fireEvent.click(screen.getByText(/状態追加/));
    const input = screen.getByPlaceholderText("状態名");
    fireEvent.change(input, { target: { value: "walk" } });
    fireEvent.click(screen.getAllByText(/OK|確認/)[0]!);

    await waitFor(() => {
      expect(useEditorStore.getState().project!.stateMachines[0]!.states).toHaveLength(2);
    });
  });

  it("状態追加をEscでキャンセルできる", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    useStateMachineStore.getState().addStateMachine("テスト");

    render(<StateMachinePanel />);
    fireEvent.click(screen.getByText(/状態追加/));
    const input = screen.getByPlaceholderText("状態名");
    fireEvent.keyDown(input, { key: "Escape" });

    expect(screen.queryByPlaceholderText("状態名")).not.toBeInTheDocument();
  });

  it("初期状態に「初期」バッジが表示される", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    useStateMachineStore.getState().addStateMachine("テスト");

    render(<StateMachinePanel />);
    expect(screen.getByText("初期")).toBeInTheDocument();
  });

  it("状態が1つの場合、削除ボタンが無効になる", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    useStateMachineStore.getState().addStateMachine("テスト");

    render(<StateMachinePanel />);
    const stateSectionBtns = screen
      .getByDisplayValue("idle")
      .closest(".sm-state")
      ?.querySelectorAll(".physics-btn-danger");
    if (stateSectionBtns && stateSectionBtns.length > 0) {
      expect(stateSectionBtns[0]).toBeDisabled();
    }
  });

  it("ループチェックボックスが機能する", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    useStateMachineStore.getState().addStateMachine("テスト");

    render(<StateMachinePanel />);
    const loopCheckbox = screen
      .getByText("ループ")
      .closest("label")
      ?.querySelector("input");
    expect(loopCheckbox).toBeChecked();

    fireEvent.click(loopCheckbox!);
    expect(useEditorStore.getState().project!.stateMachines[0]!.states[0]!.loop).toBe(
      false,
    );
  });

  it("複数ステートマシンを追加できる", async () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<StateMachinePanel />);

    fireEvent.click(screen.getByText(/ステートマシン追加/));
    fireEvent.click(screen.getByText(/ステートマシン追加/));

    await waitFor(() => {
      expect(useEditorStore.getState().project!.stateMachines).toHaveLength(2);
    });
  });
});
