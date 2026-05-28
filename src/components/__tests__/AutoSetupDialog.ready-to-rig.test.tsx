import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as autoSetup from "@/lib/auto-setup";
import { useEditorStore } from "@/stores/editorStore";
import { _resetMergeTimer, useHistoryStore } from "@/stores/historyStore";
import { createViviMesh, createEmptyProject } from "@/test/fixtures";
import { resetAllStores, resetHistoryStore } from "@/test/store-reset";
import { AutoSetupDialog } from "../AutoSetupDialog";

vi.mock("@/lib/auto-setup", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auto-setup")>();
  return {
    ...actual,
    previewAutoSetup: vi.fn(actual.previewAutoSetup),
    generateAutoMeshes: vi.fn(() => Promise.resolve([])),
    generateAutoWeights: vi.fn(() => Promise.resolve([])),
  };
});

function createImportedMesh(id: string, name: string, label: string, confidence = 0.9) {
  return createViviMesh({
    id,
    name,
    importMetadata: {
      source: "seeThrough",
      seeThrough: {
        label,
        order: 0,
        confidence,
        leftRightSplit: "center",
        frontBackSplit: "middle",
        bbox: [0, 0, 10, 10],
        depthStats: { min: 0, max: 1, mean: 0.5 },
      },
    },
  });
}

function setupProject() {
  useEditorStore.setState({
    project: {
      ...createEmptyProject(),
      layers: [
        createImportedMesh("body", "v2d[body] Body", "torso_wear"),
        createImportedMesh("eye-left", "v2d[eyeLeft] Eye Left", "iris_left"),
        createImportedMesh("eye-right", "v2d[eyeRight] Eye Right", "iris_right"),
        createImportedMesh("hat", "v2d[hat] Hat", "headwear"),
      ],
    },
    projectVersion: 1,
    projectStructureVersion: 0,
  });
}

function mockDetectionResult() {
  vi.mocked(autoSetup.previewAutoSetup).mockReturnValue({
    detectedParts: [
      {
        layerId: "body",
        layerName: "Body",
        category: "body",
        confidence: 1,
        bounds: { x: 0, y: 0, width: 10, height: 10 },
      },
      {
        layerId: "hat",
        layerName: "Hat",
        category: "accessory",
        confidence: 1,
        bounds: { x: 0, y: 0, width: 10, height: 10 },
      },
    ],
    boneResult: null,
    physicsGroups: [],
    meshResults: [],
    weightResults: [],
  });
}

describe("AutoSetupDialog Ready to Rig", () => {
  afterEach(() => {
    resetAllStores();
    resetHistoryStore();
    vi.restoreAllMocks();
  });

  it("applies cleanup, recommendations, and detect in one action", async () => {
    setupProject();
    mockDetectionResult();
    render(<AutoSetupDialog onClose={() => {}} />);

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /^(Ready to Rig|リグ準備を実行)$/ }));

    await waitFor(() => {
      expect(
        screen.getByText(
          /4 (role assignment\(s\) added\.|件のロール割り当てを追加しました。)/,
        ),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByText(
        /4 (imported name\(s\) normalized\.|件の取り込み名を正規化しました。)/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Recommended exclusions are applied for accessory and unknown parts\.|アクセサリと未確定パーツの推奨除外を適用しています。/,
      ),
    ).toBeInTheDocument();

    const hatRow = screen.getByText("Hat").closest("tr");
    expect(hatRow).not.toBeNull();
    expect(within(hatRow as HTMLElement).getByRole("checkbox")).not.toBeChecked();

    const project = useEditorStore.getState().project!;
    expect(project.layers[0]!.name).toBe("Body");
    expect(project.layers[0]!.semanticRole).toBe("body");
    expect(project.layers[0]!.semanticRoleSource).toBe("assistant");
    expect(project.layers[3]!.name).toBe("Hat");
    expect(project.layers[3]!.semanticRole).toBe("accessory");
    expect(project.layers[3]!.semanticRoleSource).toBe("assistant");
  });

  it("keeps the cleanup mutation undoable as a single history step", async () => {
    setupProject();
    mockDetectionResult();
    resetHistoryStore();
    _resetMergeTimer();
    const snapshotBefore = structuredClone(useEditorStore.getState().project!);

    render(<AutoSetupDialog onClose={() => {}} />);
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /^(Ready to Rig|リグ準備を実行)$/ }));

    await waitFor(() => {
      expect(
        screen.getByText(/imported name\(s\) normalized\.|取り込み名を正規化しました。/),
      ).toBeInTheDocument();
    });

    expect(useHistoryStore.getState().undoStack).toHaveLength(1);
    useHistoryStore.getState().undo();
    expect(useEditorStore.getState().project).toEqual(snapshotBefore);
  });
});
