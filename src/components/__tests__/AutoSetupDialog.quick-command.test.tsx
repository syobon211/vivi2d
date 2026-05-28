import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutoSetupDialog } from "@/components/AutoSetupDialog";
import { useI18nStore } from "@/lib/i18n";
import { useAutoSetupCommandStore } from "@/stores/autoSetupCommandStore";
import { buildAutoSetupDraftProjectKey } from "@/stores/autoSetupDraftStore";
import { useEditorStore } from "@/stores/editorStore";
import { createViviMesh, createEmptyProject } from "@/test/fixtures";
import { resetAllStores, resetHistoryStore } from "@/test/store-reset";

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

function setupProject() {
  const project = {
    ...createEmptyProject(),
    layers: [
      createImportedMesh("iris-left", "Iris Left", "iris_left", "left"),
      createImportedMesh("iris-right", "Iris Right", "iris_right", "right"),
    ],
  };

  useEditorStore.setState({
    project,
    projectVersion: 1,
    projectStructureVersion: 0,
    currentFilePath: null,
  });
  return project;
}

describe("AutoSetupDialog quick commands", () => {
  beforeEach(() => {
    useI18nStore.getState().setLocale("en");
  });

  afterEach(() => {
    resetAllStores();
    resetHistoryStore();
  });

  it("consumes and runs a compatible quick command on open", async () => {
    const project = setupProject();
    const projectKey = buildAutoSetupDraftProjectKey(project, null, 1);
    useAutoSetupCommandStore.getState().requestCommand({
      kind: "leftRightRepair",
      projectKey,
      projectStructureVersion: 0,
      requestedAt: Date.now(),
    });

    render(<AutoSetupDialog onClose={() => {}} />);

    await waitFor(() => {
      expect(
        screen.getByText(
          "2 left/right role assignment(s) added. | 0 left/right role repair(s) applied.",
        ),
      ).toBeInTheDocument();
    });
    expect(useEditorStore.getState().project?.layers[0]?.semanticRole).toBe("eyeLeft");
    expect(useEditorStore.getState().project?.layers[1]?.semanticRole).toBe("eyeRight");
    expect(useAutoSetupCommandStore.getState().pendingCommand).toBeNull();
    expect(useAutoSetupCommandStore.getState().commandInFlight).toBe(false);
  });

  it("clears a stale quick command without applying it", () => {
    setupProject();
    useAutoSetupCommandStore.getState().requestCommand({
      kind: "leftRightRepair",
      projectKey: "some-other-project",
      projectStructureVersion: 0,
      requestedAt: Date.now(),
    });

    render(<AutoSetupDialog onClose={() => {}} />);

    expect(useEditorStore.getState().project?.layers[0]?.semanticRole).toBe("unknown");
    expect(useEditorStore.getState().project?.layers[1]?.semanticRole).toBe("unknown");
    expect(useAutoSetupCommandStore.getState().pendingCommand).toBeNull();
  });

  it("consumes a mesh refinement quick command and calls the batch mesh action", async () => {
    const project = setupProject();
    const setAutoMeshBatch = vi.fn();
    useEditorStore.setState({
      setAutoMeshBatch: setAutoMeshBatch as never,
    });
    const projectKey = buildAutoSetupDraftProjectKey(project, null, 1);
    useAutoSetupCommandStore.getState().requestCommand({
      kind: "meshRefine",
      projectKey,
      projectStructureVersion: 0,
      requestedAt: Date.now(),
    });

    render(<AutoSetupDialog onClose={() => {}} />);

    await waitFor(() => {
      expect(setAutoMeshBatch).toHaveBeenCalledWith(
        ["iris-left", "iris-right"],
        "standard",
        undefined,
      );
    });
    expect(useAutoSetupCommandStore.getState().pendingCommand).toBeNull();
    expect(useAutoSetupCommandStore.getState().commandInFlight).toBe(false);
  });
});
