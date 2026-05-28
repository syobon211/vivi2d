import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { PhysicsPanel } from "@/components/PhysicsPanel";
import { useEditorStore } from "@/stores/editorStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { createBoneNode, createProject } from "@/test/fixtures";
import {
  resetEditorStore,
  resetPhysicsStore,
  resetSelectionStore,
} from "@/test/store-reset";

function seedHairProject() {
  const root = createBoneNode({ id: "bone-root", name: "Root" });
  const mid = createBoneNode({
    id: "bone-mid",
    name: "Mid",
    parentBoneId: root.id,
    bone: { angle: 0, length: 40, scaleX: 1, scaleY: 1 },
  });
  const tip = createBoneNode({
    id: "bone-tip",
    name: "Tip",
    parentBoneId: mid.id,
    bone: { angle: 0, length: 30, scaleX: 1, scaleY: 1 },
  });
  useEditorStore.setState({
    project: createProject({ layers: [root, mid, tip], physicsGroups: [] }),
  });
  return { root, mid, tip };
}

describe("PhysicsPanel hair strand helper", () => {
  beforeEach(() => {
    resetEditorStore();
    resetPhysicsStore();
    resetSelectionStore();
  });

  it("creates a managed hair strand helper for the selected tip bone", () => {
    const { tip } = seedHairProject();
    useSelectionStore.setState({ selectedLayerId: tip.id, selectedLayerIds: [tip.id] });

    render(<PhysicsPanel />);

    fireEvent.click(
      screen.getByRole("button", { name: /ヘアストランドヘルパーを作成/i }),
    );

    expect(
      screen.getByText("管理対象のヘアストランドヘルパーを作成しました。"),
    ).toBeInTheDocument();
    expect(useEditorStore.getState().project?.physicsGroups).toHaveLength(1);
  });

  it("shows a visible rejection when the selected bone is not a leaf", () => {
    const { mid } = seedHairProject();
    useSelectionStore.setState({ selectedLayerId: mid.id, selectedLayerIds: [mid.id] });

    render(<PhysicsPanel />);

    fireEvent.click(
      screen.getByRole("button", { name: /ヘアストランドヘルパーを作成/i }),
    );

    expect(
      screen.getByText("枝分かれや root ではなく、leaf の先端ボーンを選択してください。"),
    ).toBeInTheDocument();
    expect(useEditorStore.getState().project?.physicsGroups).toHaveLength(0);
  });
});
