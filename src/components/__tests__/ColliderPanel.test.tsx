import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { ColliderPanel } from "@/components/ColliderPanel";
import { clearTextures } from "@/lib/texture-store";
import { useColliderStore } from "@/stores/colliderStore";
import { useEditorStore } from "@/stores/editorStore";
import { loadPsdFromBuffer } from "@/stores/projectIO";
import {
  resetColliderStore,
  resetEditorStore,
  resetSelectionStore,
} from "@/test/store-reset";

describe("ColliderPanel", () => {
  beforeEach(() => {
    resetEditorStore();
    resetColliderStore();
    resetSelectionStore();
    clearTextures();
  });

  it("プロジェクトなしでは何も表示しない", () => {
    const { container } = render(<ColliderPanel />);
    expect(container.innerHTML).toBe("");
  });

  it("プロジェクトありでパネルヘッダーが表示される", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<ColliderPanel />);
    expect(screen.getByText("コライダー")).toBeInTheDocument();
  });

  it("コライダーなしで空メッセージが表示される", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<ColliderPanel />);
    expect(screen.getByText("コライダーなし")).toBeInTheDocument();
  });

  it("矩形追加ボタンでフォームが表示される", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<ColliderPanel />);

    fireEvent.click(screen.getByText("矩形追加"));
    expect(screen.getByPlaceholderText("コライダー名")).toBeInTheDocument();
  });

  it("矩形コライダーを追加できる", async () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<ColliderPanel />);

    fireEvent.click(screen.getByText("矩形追加"));
    const input = screen.getByPlaceholderText("コライダー名");
    fireEvent.change(input, { target: { value: "頭" } });
    fireEvent.click(screen.getByText(/OK|確認/));

    await waitFor(() => {
      expect(useEditorStore.getState().project!.colliders).toHaveLength(1);
      expect(screen.getByText("頭")).toBeInTheDocument();
    });
  });

  it("円コライダーを追加できる", async () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<ColliderPanel />);

    fireEvent.click(screen.getByText("円追加"));
    const input = screen.getByPlaceholderText("コライダー名");
    fireEvent.change(input, { target: { value: "ほっぺ" } });
    fireEvent.click(screen.getByText(/OK|確認/));

    await waitFor(() => {
      expect(useEditorStore.getState().project!.colliders).toHaveLength(1);
    });
  });

  it("Escキーでフォームをキャンセルできる", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<ColliderPanel />);

    fireEvent.click(screen.getByText("矩形追加"));
    const input = screen.getByPlaceholderText("コライダー名");
    fireEvent.keyDown(input, { key: "Escape" });

    expect(screen.queryByPlaceholderText("コライダー名")).not.toBeInTheDocument();
  });

  it("Enterキーでフォームを確定できる", async () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<ColliderPanel />);

    fireEvent.click(screen.getByText("矩形追加"));
    const input = screen.getByPlaceholderText("コライダー名");
    fireEvent.change(input, { target: { value: "テスト" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(useEditorStore.getState().project!.colliders).toHaveLength(1);
    });
  });

  it("空名でOKボタンが無効になる", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<ColliderPanel />);

    fireEvent.click(screen.getByText("矩形追加"));
    const okBtn = screen.getByText(/OK|確認/);
    expect(okBtn).toBeDisabled();
  });

  it("コライダー削除ボタンで削除できる", async () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    useColliderStore.getState().addRectCollider("削除対象", 0, 0, 100, 100);

    render(<ColliderPanel />);
    expect(screen.getByText("削除対象")).toBeInTheDocument();

    fireEvent.click(screen.getByTitle("削除"));

    await waitFor(() => {
      expect(useEditorStore.getState().project!.colliders).toHaveLength(0);
    });
  });

  it("有効/無効チェックボックスで切り替えできる", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    useColliderStore.getState().addRectCollider("トグル", 0, 0, 100, 100);

    render(<ColliderPanel />);
    const checkbox = screen.getAllByRole("checkbox")[0]!;
    expect(checkbox).toBeChecked();

    fireEvent.click(checkbox);
    expect(useEditorStore.getState().project!.colliders[0]!.enabled).toBe(false);
  });

  it("コライダークリックで選択状態になる", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    const id = useColliderStore.getState().addRectCollider("選択", 0, 0, 100, 100);

    render(<ColliderPanel />);
    const item = screen.getByText("選択").closest(".collider-item")!;
    fireEvent.click(item);

    expect(useColliderStore.getState().selectedColliderId).toBe(id);
  });

  it("選択中コライダーにcollider-selectedクラスが付与される", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    const id = useColliderStore.getState().addRectCollider("選択", 0, 0, 100, 100);
    useColliderStore.setState({ selectedColliderId: id });

    render(<ColliderPanel />);
    const item = screen.getByText("選択").closest(".collider-item")!;
    expect(item.className).toContain("collider-selected");
  });

  it("メッシュから追加ボタンはメッシュ未選択で無効", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<ColliderPanel />);
    const meshBtn = screen.getByText("メッシュから追加");
    expect(meshBtn).toBeDisabled();
  });

  it("フォーム表示中は追加ボタンが無効になる", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    render(<ColliderPanel />);

    fireEvent.click(screen.getByText("矩形追加"));

    expect(screen.getByText("矩形追加")).toBeDisabled();
    expect(screen.getByText("円追加")).toBeDisabled();
  });


  it("コライダー一覧に role=listbox が付く", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    useColliderStore.getState().addRectCollider("A", 0, 0, 50, 50);
    render(<ColliderPanel />);
    expect(screen.getByRole("listbox", { name: "コライダー" })).toBeInTheDocument();
  });

  it("各コライダーに role=option と aria-selected が付く", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    const id = useColliderStore.getState().addRectCollider("A", 0, 0, 50, 50);
    useColliderStore.setState({ selectedColliderId: id });
    render(<ColliderPanel />);

    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveAttribute("aria-selected", "true");
  });

  it("ArrowDown で次の option にフォーカス", () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    const id1 = useColliderStore.getState().addRectCollider("一番", 0, 0, 50, 50);
    useColliderStore.getState().addRectCollider("二番", 0, 0, 50, 50);
    useColliderStore.setState({ selectedColliderId: id1 });
    render(<ColliderPanel />);

    const first = screen.getByText("一番").closest('[role="option"]') as HTMLElement;
    first.focus();
    fireEvent.keyDown(first.parentElement!, { key: "ArrowDown" });

    const second = screen.getByText("二番").closest('[role="option"]') as HTMLElement;
    expect(second).toHaveFocus();
  });

  it("Enter で選択、Delete で削除、F2 で rename 開始", async () => {
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
    const id = useColliderStore.getState().addRectCollider("被選択", 0, 0, 50, 50);
    useColliderStore.setState({ selectedColliderId: id });
    render(<ColliderPanel />);

    const opt = screen.getByText("被選択").closest('[role="option"]') as HTMLElement;
    opt.focus();

    fireEvent.keyDown(opt, { key: "F2" });
    const renameInput = screen.getByDisplayValue("被選択");
    expect(renameInput.tagName).toBe("INPUT");
  });
});
