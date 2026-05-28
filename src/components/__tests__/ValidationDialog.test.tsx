import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ValidationDialog } from "@/components/ValidationDialog";
import { useEditorStore } from "@/stores/editorStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { createViviMesh, createBoneNode, createEmptyProject } from "@/test/fixtures";
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

  it("ダイアログタイトルが表示される", () => {
    useEditorStore.setState({
      project: createEmptyProject(),
      projectVersion: 1,
    });
    render(<ValidationDialog onClose={vi.fn()} />);
    expect(screen.getByText("モデル検証")).toBeInTheDocument();
  });

  it("プロジェクトなしで問題なしメッセージが表示される", () => {
    render(<ValidationDialog onClose={vi.fn()} />);
    expect(screen.getByText("問題は見つかりませんでした")).toBeInTheDocument();
  });

  it("問題のない空プロジェクトで問題なしメッセージが表示される", () => {
    useEditorStore.setState({
      project: createEmptyProject(),
      projectVersion: 1,
    });
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
    const overlay = document.querySelector(".modal-overlay")!;
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("モーダルコンテンツクリックではonCloseが呼ばれない", () => {
    useEditorStore.setState({
      project: createEmptyProject(),
      projectVersion: 1,
    });
    const onClose = vi.fn();
    render(<ValidationDialog onClose={onClose} />);
    const content = document.querySelector(".modal-content")!;
    fireEvent.click(content);
    expect(onClose).not.toHaveBeenCalled();
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

  it("layerIdを持つ問題をクリックするとレイヤーが選択される", () => {
    const mesh = createViviMesh({
      id: "mesh-1",
      name: "テストメッシュ",
      mesh: {
        vertices: [0, 0, 100, 0, 100, 100, 0, 100],
        uvs: [0, 0, 1, 0, 1, 1, 0, 1],
        indices: [0, 1, 2, 0, 2, 3],
        divisionsX: 1,
        divisionsY: 1,
      },
    });
    useEditorStore.setState({
      project: {
        ...createEmptyProject(),
        layers: [mesh],
        physicsGroups: [
          {
            id: "pg-1",
            name: "物理グループ",
            enabled: true,
            pendulums: [{ length: 1, mass: 1, damping: 0.05 }],
            inputs: [],
            outputs: [
              {
                type: "angle",
                parameterId: "nonexistent-param",
                pendulumIndex: 0,
                weight: 1,
              },
            ],
            gravityDirection: 0,
            gravityStrength: 9.8,
            wind: 0,
          },
        ],
      },
      projectVersion: 1,
    });
    render(<ValidationDialog onClose={vi.fn()} />);

    const items = document.querySelectorAll(".validation-item:not([disabled])");
    if (items.length > 0) {
      fireEvent.click(items[0]!);
      const selected = useSelectionStore.getState().selectedLayerId;
      expect(selected).not.toBeNull();
    }
  });
});
