import { render, screen, waitFor } from "@testing-library/react";
import { isBone } from "@vivi2d/core/types";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applySeeThroughMouthRig } from "@vivi2d/editor-core/see-through-mouth-rig";
import { useEditorStore } from "@/stores/editorStore";
import { _resetMergeTimer, useHistoryStore } from "@/stores/historyStore";
import { createViviMesh, createEmptyProject } from "@/test/fixtures";
import { resetAllStores, resetHistoryStore } from "@/test/store-reset";
import { AutoSetupDialog } from "../AutoSetupDialog";

function createImportedMouthMesh(id = "mouth", name = "Mouth", label = "mouth") {
  return createViviMesh({
    id,
    name,
    semanticRole: "mouth",
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
  const project = {
    ...createEmptyProject(),
    layers: [createImportedMouthMesh()],
  };

  if (alreadyRigged) {
    applySeeThroughMouthRig(project);
  }

  useEditorStore.setState({
    project,
    projectVersion: 1,
    projectStructureVersion: 0,
  });
}

describe("AutoSetupDialog basic mouth rig", () => {
  afterEach(() => {
    resetAllStores();
    resetHistoryStore();
    vi.restoreAllMocks();
  });

  it("shows and applies the explicit mouth rig action", async () => {
    setupProject();
    render(<AutoSetupDialog onClose={() => {}} />);

    await userEvent.setup().click(
      screen.getAllByRole("button", {
        name: /Create basic mouth rig|基本の口リグを作成/,
      })[0]!,
    );

    await waitFor(() => {
      expect(
        screen.getByText(
          /1 (mouth parameter\(s\) created\.|件の口パラメータを作成しました。)/,
        ),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByText(
        /Lip-sync target assigned to Mouth Open\.|リップシンク対象を Mouth Open に設定しました。/,
      ),
    ).toBeInTheDocument();
    expect(useEditorStore.getState().project?.parameters).toHaveLength(1);
    expect(
      useEditorStore.getState().project?.layers.filter(isBone),
    ).toHaveLength(1);
  });

  it("records mouth rig generation as a single undo step", async () => {
    setupProject();
    resetHistoryStore();
    _resetMergeTimer();
    const snapshotBefore = structuredClone(useEditorStore.getState().project!);

    render(<AutoSetupDialog onClose={() => {}} />);
    await userEvent.setup().click(
      screen.getAllByRole("button", {
        name: /Create basic mouth rig|基本の口リグを作成/,
      })[0]!,
    );

    await waitFor(() => {
      expect(
        screen.getByText(
          /1 (mouth parameter\(s\) created\.|件の口パラメータを作成しました。)/,
        ),
      ).toBeInTheDocument();
    });

    expect(useHistoryStore.getState().undoStack).toHaveLength(1);
    useHistoryStore.getState().undo();
    expect(useEditorStore.getState().project).toEqual(snapshotBefore);
  });

  it("does not add an undo step when the mouth rig is already present", async () => {
    setupProject(true);
    resetHistoryStore();
    _resetMergeTimer();

    render(<AutoSetupDialog onClose={() => {}} />);
    await userEvent.setup().click(
      screen.getAllByRole("button", {
        name: /Create basic mouth rig|基本の口リグを作成/,
      })[0]!,
    );

    await waitFor(() => {
      expect(
        screen.getByText(/No mouth rig changes were needed\.|口リグの変更は不要でした。/),
      ).toBeInTheDocument();
    });

    expect(useHistoryStore.getState().undoStack).toHaveLength(0);
  });

  it("surfaces preserved lip-sync parameter wiring warnings", async () => {
    setupProject();
    useEditorStore.setState((state) => ({
      project: state.project
        ? {
            ...state.project,
            parameters: [
              ...state.project.parameters,
              {
                id: "manual-mouth",
                name: "Manual Mouth",
                minValue: 0,
                maxValue: 1,
                defaultValue: 0,
              },
            ],
            lipsyncConfig: {
              ...state.project.lipsyncConfig,
              targetParameterId: "manual-mouth",
            },
          }
        : state.project,
    }));

    render(<AutoSetupDialog onClose={() => {}} />);
    await userEvent.setup().click(
      screen.getAllByRole("button", {
        name: /Create basic mouth rig|基本の口リグを作成/,
      })[0]!,
    );

    await waitFor(() => {
      expect(
        screen.getByText(
          /Preserved existing lip-sync parameter target and did not rewire Mouth Open automatically\.|既存のリップシンク対象パラメータを保持し、Mouth Open への自動付け替えは行いませんでした。/,
        ),
      ).toBeInTheDocument();
    });
  });
});
