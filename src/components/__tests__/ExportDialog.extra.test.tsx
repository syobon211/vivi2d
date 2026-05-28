import { fireEvent, render, waitFor } from "@testing-library/react";
import type { ProjectData, Scene } from "@vivi2d/core/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExportDialog } from "@/components/ExportDialog";
import { createAnimationClip, createViviMesh, createEmptyProject } from "@/test/fixtures";

const exportForSpineMock = vi.hoisted(() => vi.fn());
const addNotificationMock = vi.hoisted(() => vi.fn());

let mockProject: ProjectData | null = null;

vi.mock("@/stores/editorStore", () => ({
  useEditorStore: (selector: (state: { project: ProjectData | null }) => unknown) =>
    selector({ project: mockProject }),
}));

vi.mock("@/stores/notificationStore", () => ({
  useNotificationStore: {
    getState: () => ({
      addNotification: addNotificationMock,
    }),
  },
}));

vi.mock("@/lib/export", () => ({
  exportForSpine: exportForSpineMock,
}));

function createProjectFixture() {
  const layerA = createViviMesh({ id: "layer-a", name: "Layer A" });
  const layerB = createViviMesh({ id: "layer-b", name: "Layer B" });
  const layerC = createViviMesh({ id: "layer-c", name: "Layer C" });
  const clipA = createAnimationClip({ id: "clip-a", name: "Idle" });
  const clipB = createAnimationClip({ id: "clip-b", name: "Jump" });
  const scene: Scene = {
    id: "scene-1",
    name: "Scene 1",
    clips: [clipA, clipB],
  };
  const project = createEmptyProject();
  project.layers = [layerA, layerB, layerC];
  project.scenes = [scene];
  return { project, layerA, layerB, layerC, clipA, clipB };
}

function getPrimaryButton(): HTMLButtonElement {
  const button = document.querySelector(".modal-btn-primary");
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error("Expected export button");
  }
  return button;
}

describe("ExportDialog extra coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProject = createProjectFixture().project;
    (window as typeof window & { electronAPI: any }).electronAPI = {
      ...(window as typeof window & { electronAPI: any }).electronAPI,
      selectExportDirectory: vi.fn().mockResolvedValue("C:/exports"),
      writeExportFiles: vi.fn().mockResolvedValue({
        success: true,
        count: 1,
      }),
    };
  });

  it("exports all layers and clips without selection filters", async () => {
    exportForSpineMock.mockResolvedValue({
      files: [{ path: "spine.json", content: '{"ok":true}' }],
      warnings: [],
    });

    const onClose = vi.fn();
    render(<ExportDialog onClose={onClose} />);

    fireEvent.click(getPrimaryButton());

    await waitFor(() => {
      expect(exportForSpineMock).toHaveBeenCalledTimes(1);
    });

    expect(exportForSpineMock).toHaveBeenCalledWith(
      mockProject,
      mockProject?.scenes[0]?.clips,
      undefined,
    );
    expect(window.electronAPI.writeExportFiles).toHaveBeenCalledWith({
      dirPath: "C:/exports",
      files: [{ path: "spine.json", content: '{"ok":true}', isBlob: false }],
    });
    expect(addNotificationMock).toHaveBeenCalledWith(
      "info",
      expect.stringContaining("1"),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("exports partial selections with serialized blob files and warning notifications", async () => {
    const fixture = createProjectFixture();
    const { layerB, layerC, clipB } = fixture;
    mockProject = fixture.project;
    exportForSpineMock.mockResolvedValue({
      files: [
        { path: "texture_00.png", content: new Blob([Uint8Array.from([0, 1, 2])]) },
        { path: "spine.json", content: '{"filtered":true}' },
      ],
      warnings: ["Atlas trimmed"],
    });

    const { getByTestId } = render(<ExportDialog onClose={vi.fn()} />);

    const layerBoxes = getByTestId(
      "layer-select-list",
    ).querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    const clipBoxes = getByTestId("clip-select-list").querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"]',
    );

    fireEvent.click(layerBoxes[0]!);
    fireEvent.click(clipBoxes[0]!);
    fireEvent.click(getPrimaryButton());

    await waitFor(() => {
      expect(exportForSpineMock).toHaveBeenCalledTimes(1);
    });

    const options = exportForSpineMock.mock.calls[0]?.[2];
    expect(Array.from(options.layerIds as Set<string>)).toEqual([layerB.id, layerC.id]);
    expect(Array.from(options.clipIds as Set<string>)).toEqual([clipB.id]);
    expect(window.electronAPI.writeExportFiles).toHaveBeenCalledWith({
      dirPath: "C:/exports",
      files: [
        { path: "texture_00.png", content: "AAEC", isBlob: true },
        { path: "spine.json", content: '{"filtered":true}', isBlob: false },
      ],
    });
    expect(addNotificationMock).toHaveBeenCalledWith("warning", "Atlas trimmed");
    expect(addNotificationMock).toHaveBeenCalledWith(
      "info",
      expect.stringContaining("2"),
    );
  });

  it("reports export failures and resets the exporting state", async () => {
    exportForSpineMock.mockRejectedValue(new Error("export failed"));

    render(<ExportDialog onClose={vi.fn()} />);
    const exportButton = getPrimaryButton();

    fireEvent.click(exportButton);

    await waitFor(() => {
      expect(addNotificationMock).toHaveBeenCalledWith(
        "error",
        expect.stringContaining("export failed"),
      );
    });

    expect(window.electronAPI.writeExportFiles).not.toHaveBeenCalled();
    expect(exportButton).not.toBeDisabled();
  });
});
