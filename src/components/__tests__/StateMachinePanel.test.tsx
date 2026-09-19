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

  it("追加ボタンでステートマシンを追加できる", async () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<StateMachinePanel />);
    expect(screen.getByText("ステートマシン")).toBeInTheDocument();

    fireEvent.click(screen.getByText(/ステートマシン追加/));

    await waitFor(() => {
      expect(useEditorStore.getState().project!.stateMachines).toHaveLength(1);
      expect(screen.getByDisplayValue("ステートマシン 1")).toBeInTheDocument();
      expect(screen.getByDisplayValue("idle")).toBeInTheDocument();
      expect(screen.getByText("初期")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText(/ステートマシン追加/));
    await waitFor(() => {
      expect(useEditorStore.getState().project!.stateMachines).toHaveLength(2);
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
});
