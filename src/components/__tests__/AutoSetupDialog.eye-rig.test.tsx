import { render, screen, waitFor } from "@testing-library/react";
import { isBone } from "@vivi2d/core/types";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applySeeThroughEyeRig } from "@vivi2d/editor-core/see-through-eye-rig";
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

function setupProject(alreadyRigged = false) {
  const irisLeft = createImportedMesh("iris-left", "Iris Left", "iris_left");
  const eyeWhiteLeft = createImportedMesh(
    "white-left",
    "Eye White Left",
    "eye_white_left",
  );
  irisLeft.clipMaskIds = ["white-left"];

  const project = {
    ...createEmptyProject(),
    layers: [irisLeft, eyeWhiteLeft],
  };

  if (alreadyRigged) {
    applySeeThroughEyeRig(project);
  }

  useEditorStore.setState({
    project,
    projectVersion: 1,
    projectStructureVersion: 0,
  });
}

describe("AutoSetupDialog basic eye rig", () => {
  afterEach(() => {
    resetAllStores();
    resetHistoryStore();
    vi.restoreAllMocks();
  });

  it("shows and applies the explicit eye rig action", async () => {
    setupProject();
    render(<AutoSetupDialog onClose={() => {}} />);

    await userEvent.setup().click(
      screen.getAllByRole("button", {
        name: /Create basic eye rig|基本の目リグを作成/,
      })[0]!,
    );

    await waitFor(() => {
      expect(
        screen.getByText(
          /1 (blink parameter\(s\) created\.|件のまばたきパラメータを作成しました。)/,
        ),
      ).toBeInTheDocument();
    });
    expect(useEditorStore.getState().project?.parameters).toHaveLength(1);
    expect(
      useEditorStore.getState().project?.layers.filter(isBone),
    ).toHaveLength(1);
  });

  it("records eye rig generation as a single undo step", async () => {
    setupProject();
    resetHistoryStore();
    _resetMergeTimer();
    const snapshotBefore = structuredClone(useEditorStore.getState().project!);

    render(<AutoSetupDialog onClose={() => {}} />);
    await userEvent.setup().click(
      screen.getAllByRole("button", {
        name: /Create basic eye rig|基本の目リグを作成/,
      })[0]!,
    );

    await waitFor(() => {
      expect(
        screen.getByText(
          /1 (blink parameter\(s\) created\.|件のまばたきパラメータを作成しました。)/,
        ),
      ).toBeInTheDocument();
    });

    expect(useHistoryStore.getState().undoStack).toHaveLength(1);
    useHistoryStore.getState().undo();
    expect(useEditorStore.getState().project).toEqual(snapshotBefore);
  });

  it("does not add an undo step when the eye rig is already present", async () => {
    setupProject(true);
    resetHistoryStore();
    _resetMergeTimer();

    render(<AutoSetupDialog onClose={() => {}} />);
    await userEvent.setup().click(
      screen.getAllByRole("button", {
        name: /Create basic eye rig|基本の目リグを作成/,
      })[0]!,
    );

    await waitFor(() => {
      expect(
        screen.getByText(/No eye rig changes were needed\.|目リグの変更は不要でした。/),
      ).toBeInTheDocument();
    });

    expect(useHistoryStore.getState().undoStack).toHaveLength(0);
  });
});
