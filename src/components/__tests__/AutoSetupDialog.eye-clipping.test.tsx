import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "@/stores/editorStore";
import { _resetMergeTimer, useHistoryStore } from "@/stores/historyStore";
import { createViviMesh, createEmptyProject } from "@/test/fixtures";
import { resetAllStores, resetHistoryStore } from "@/test/store-reset";
import { AutoSetupDialog } from "../AutoSetupDialog";

function createImportedMesh(id: string, name: string, label: string) {
  return createViviMesh({
    id,
    name,
    importMetadata: {
      source: "seeThrough",
      seeThrough: {
        label,
        order: 0,
        confidence: 0.9,
        leftRightSplit: "center",
        frontBackSplit: "middle",
        bbox: [0, 0, 10, 10],
        depthStats: { min: 0, max: 1, mean: 0.5 },
      },
    },
  });
}

function setupProject(alreadyClipped = false) {
  const irisLeft = createImportedMesh("iris-left", "Iris Left", "iris_left");
  if (alreadyClipped) {
    irisLeft.clipMaskIds = ["white-left"];
  }
  useEditorStore.setState({
    project: {
      ...createEmptyProject(),
      layers: [
        irisLeft,
        createImportedMesh("white-left", "Eye White Left", "eye_white_left"),
      ],
    },
    projectVersion: 1,
    projectStructureVersion: 0,
  });
}

describe("AutoSetupDialog automatic eye clipping", () => {
  afterEach(() => {
    resetAllStores();
    resetHistoryStore();
    vi.restoreAllMocks();
  });

  it("shows and applies the explicit eye clipping action", async () => {
    setupProject();
    render(<AutoSetupDialog onClose={() => {}} />);

    await userEvent.setup().click(
      screen.getAllByRole("button", {
        name: /Apply automatic eye clipping|自動目クリッピングを適用/,
      })[0]!,
    );

    await waitFor(() => {
      expect(
        screen.getByText(
          /1 (eye clipping relation\(s\) applied\.|件の目クリッピング関係を適用しました。)/,
        ),
      ).toBeInTheDocument();
    });
    expect(useEditorStore.getState().project?.layers[0]?.clipMaskIds).toEqual([
      "white-left",
    ]);
  });

  it("records the clipping change as a single undo step", async () => {
    setupProject();
    resetHistoryStore();
    _resetMergeTimer();
    const snapshotBefore = structuredClone(useEditorStore.getState().project!);

    render(<AutoSetupDialog onClose={() => {}} />);
    await userEvent.setup().click(
      screen.getAllByRole("button", {
        name: /Apply automatic eye clipping|自動目クリッピングを適用/,
      })[0]!,
    );

    await waitFor(() => {
      expect(
        screen.getByText(
          /1 (eye clipping relation\(s\) applied\.|件の目クリッピング関係を適用しました。)/,
        ),
      ).toBeInTheDocument();
    });

    expect(useHistoryStore.getState().undoStack).toHaveLength(1);
    useHistoryStore.getState().undo();
    expect(useEditorStore.getState().project).toEqual(snapshotBefore);
  });

  it("does not add an undo step when eye clipping is already configured", async () => {
    setupProject(true);
    resetHistoryStore();
    _resetMergeTimer();

    render(<AutoSetupDialog onClose={() => {}} />);
    await userEvent.setup().click(
      screen.getAllByRole("button", {
        name: /Apply automatic eye clipping|自動目クリッピングを適用/,
      })[0]!,
    );

    await waitFor(() => {
      expect(
        screen.getByText(
          /No eye clipping changes were needed\.|目クリッピングの変更は不要でした。/,
        ),
      ).toBeInTheDocument();
    });

    expect(useHistoryStore.getState().undoStack).toHaveLength(0);
  });
});
