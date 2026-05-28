import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "@/stores/editorStore";
import { _resetMergeTimer, useHistoryStore } from "@/stores/historyStore";
import { createViviMesh, createEmptyProject } from "@/test/fixtures";
import { resetAllStores, resetHistoryStore } from "@/test/store-reset";
import { AutoSetupDialog } from "../AutoSetupDialog";

function createImportedMesh(
  id: string,
  name: string,
  label: string,
  leftRightSplit: "left" | "right" | "center" | "unknown",
) {
  return createViviMesh({
    id,
    name,
    semanticRole: "unknown",
    importMetadata: {
      source: "seeThrough",
      seeThrough: {
        label,
        order: 0,
        confidence: 0.95,
        leftRightSplit,
        frontBackSplit: "middle",
        bbox: [0, 0, 10, 10],
        depthStats: { min: 0, max: 1, mean: 0.5 },
      },
    },
  });
}

function setupProject(alreadyRepaired = false) {
  const project = {
    ...createEmptyProject(),
    layers: [
      createImportedMesh("iris-left", "Iris Left", "iris_left", "left"),
      createImportedMesh("iris-right", "Iris Right", "iris_right", "right"),
    ],
  };

  if (alreadyRepaired) {
    project.layers[0]!.semanticRole = "eyeLeft";
    project.layers[0]!.semanticRoleSource = "assistant";
    project.layers[1]!.semanticRole = "eyeRight";
    project.layers[1]!.semanticRoleSource = "assistant";
  }

  useEditorStore.setState({
    project,
    projectVersion: 1,
    projectStructureVersion: 0,
  });
}

describe("AutoSetupDialog left/right split assistant", () => {
  afterEach(() => {
    resetAllStores();
    resetHistoryStore();
    vi.restoreAllMocks();
  });

  it("shows and applies the explicit left/right repair action", async () => {
    setupProject();
    render(<AutoSetupDialog onClose={() => {}} />);

    await userEvent.setup().click(
      screen.getAllByRole("button", {
        name: /Repair left\/right roles|左右ロールを修復/,
      })[0]!,
    );

    await waitFor(() => {
      expect(
        screen.getByText(
          /2 (left\/right role assignment\(s\) added\.|件の左右ロール割り当てを追加しました。)/,
        ),
      ).toBeInTheDocument();
    });

    const project = useEditorStore.getState().project!;
    expect(project.layers[0]!.semanticRole).toBe("eyeLeft");
    expect(project.layers[0]!.semanticRoleSource).toBe("assistant");
    expect(project.layers[1]!.semanticRole).toBe("eyeRight");
    expect(project.layers[1]!.semanticRoleSource).toBe("assistant");
  });

  it("records left/right repair as a single undo step", async () => {
    setupProject();
    resetHistoryStore();
    _resetMergeTimer();
    const snapshotBefore = structuredClone(useEditorStore.getState().project!);

    render(<AutoSetupDialog onClose={() => {}} />);
    await userEvent.setup().click(
      screen.getAllByRole("button", {
        name: /Repair left\/right roles|左右ロールを修復/,
      })[0]!,
    );

    await waitFor(() => {
      expect(
        screen.getByText(
          /left\/right role assignment\(s\) added|左右ロール割り当てを追加/,
        ),
      ).toBeInTheDocument();
    });

    expect(useHistoryStore.getState().undoStack).toHaveLength(1);
    useHistoryStore.getState().undo();
    expect(useEditorStore.getState().project).toEqual(snapshotBefore);
  });

  it("does not add an undo step when no left/right changes are needed", async () => {
    setupProject(true);
    resetHistoryStore();
    _resetMergeTimer();

    render(<AutoSetupDialog onClose={() => {}} />);
    await userEvent.setup().click(
      screen.getAllByRole("button", {
        name: /Repair left\/right roles|左右ロールを修復/,
      })[0]!,
    );

    await waitFor(() => {
      expect(
        screen.getByText(
          /No left\/right role changes were needed\.|左右ロールの変更は不要でした。/,
        ),
      ).toBeInTheDocument();
    });

    expect(useHistoryStore.getState().undoStack).toHaveLength(0);
  });
});
