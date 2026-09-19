import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ValidationDialog } from "@/components/ValidationDialog";
import { useEditorStore } from "@/stores/editorStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { createBoneNode, createEmptyProject, createViviMesh } from "@/test/fixtures";
import { resetEditorStore, resetSelectionStore } from "@/test/store-reset";

describe("ValidationDialog", () => {
  beforeEach(() => {
    resetEditorStore();
    resetSelectionStore();
  });

  afterEach(() => {
    resetEditorStore();
    resetSelectionStore();
  });

  it("プロジェクトなしで問題なしメッセージが表示される", () => {
    render(<ValidationDialog onClose={vi.fn()} />);
    expect(screen.getByText("問題は見つかりませんでした")).toBeInTheDocument();
  });

  it("閉じるボタンでonCloseが呼ばれる", () => {
    useEditorStore.setState({
      project: createEmptyProject(),
      projectVersion: 1,
    });
    const onClose = vi.fn();
    render(<ValidationDialog onClose={onClose} />);
    expect(screen.getByText("モデル検証")).toBeInTheDocument();
    expect(screen.getByText("問題は見つかりませんでした")).toBeInTheDocument();
    fireEvent.click(screen.getByText("閉じる"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("オーバーレイクリックでonCloseが呼ばれる", () => {
    useEditorStore.setState({
      project: createEmptyProject(),
      projectVersion: 1,
    });
    const onClose = vi.fn();
    render(<ValidationDialog onClose={onClose} />);
    fireEvent.click(document.querySelector(".modal-content")!);
    expect(onClose).not.toHaveBeenCalled();
    const overlay = document.querySelector(".modal-overlay")!;
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("検証問題があるプロジェクトでサマリーが表示される", () => {
    const bone = createBoneNode({ id: "bone-1", name: "テストボーン" });
    const mesh = createViviMesh({ id: "mesh-1", name: "テストメッシュ" });
    useEditorStore.setState({
      project: {
        ...createEmptyProject(),
        layers: [bone, mesh],
        physicsGroups: [
          {
            id: "pg-1",
            name: "物理グループ",
            enabled: true,
            pendulums: [{ length: 1, mass: 1, damping: 0.05 }],
            inputs: [
              {
                type: "angle",
                parameterId: "nonexistent-param",
                weight: 1,
              },
            ],
            outputs: [],
            gravityDirection: 0,
            gravityStrength: 9.8,
            wind: 0,
          },
        ],
      },
      projectVersion: 1,
    });
    render(<ValidationDialog onClose={vi.fn()} />);
    const items = document.querySelectorAll(".validation-item");
    expect(items.length).toBeGreaterThan(0);
  });

  it("エラー・警告・情報の各カウントが表示される", () => {
    const bone = createBoneNode({ id: "bone-1", name: "未使用ボーン" });
    const mesh = createViviMesh({ id: "mesh-err", name: "空メッシュ" });
    mesh.mesh.vertices = [];
    useEditorStore.setState({
      project: {
        ...createEmptyProject(),
        layers: [bone, mesh],
        skins: {
          orphan: { weights: [], bindPoseInverse: {} },
        },
      },
      projectVersion: 1,
    });
    render(<ValidationDialog onClose={vi.fn()} />);

    const errorCount = document.querySelector(".validation-count-error");
    const warningCount = document.querySelector(".validation-count-warning");
    const infoCount = document.querySelector(".validation-count-info");
    expect(errorCount).not.toBeNull();
    expect(warningCount).not.toBeNull();
    expect(infoCount).not.toBeNull();
  });

  it("エラーのみの場合は警告・情報のカウントが表示されない", () => {
    const mesh = createViviMesh({ id: "mesh-err", name: "空メッシュ" });
    mesh.mesh.vertices = [];
    useEditorStore.setState({
      project: {
        ...createEmptyProject(),
        layers: [mesh],
      },
      projectVersion: 1,
    });
    render(<ValidationDialog onClose={vi.fn()} />);

    const errorCount = document.querySelector(".validation-count-error");
    const warningCount = document.querySelector(".validation-count-warning");
    const infoCount = document.querySelector(".validation-count-info");
    expect(errorCount).not.toBeNull();
    expect(warningCount).toBeNull();
    expect(infoCount).toBeNull();
  });

  it("未使用ボーン問題をクリックするとレイヤーが選択される", () => {
    const bone = createBoneNode({ id: "bone-select", name: "選択テスト" });
    useEditorStore.setState({
      project: {
        ...createEmptyProject(),
        layers: [bone],
      },
      projectVersion: 1,
    });
    render(<ValidationDialog onClose={vi.fn()} />);

    const item = screen.getByText(/選択テスト/).closest("button")!;
    fireEvent.click(item);

    expect(useSelectionStore.getState().selectedLayerId).toBe("bone-select");
  });
});
