import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MenuBar } from "@/components/MenuBar";
import { useI18nStore } from "@/lib/i18n";
import { useEditorStore } from "@/stores/editorStore";
import { useProjectDialogsStore } from "@/stores/projectDialogsStore";
import * as projectIO from "@/stores/projectIO";
import { useSelectionStore } from "@/stores/selectionStore";
import { createViviMesh, createProject } from "@/test/fixtures";
import { TEST_ASSET_FACE_PNG_PATH } from "@/test/path-fixtures";
import { resetAllStores } from "@/test/store-reset";

function createManualPngMesh(id: string, semanticRole?: "hair" | "face") {
  return createViviMesh({
    id,
    semanticRole,
    semanticRoleSource: semanticRole ? "manual" : undefined,
    importMetadata: {
      source: "manualPng",
      manualPng: {
        sourceFileName: `${id}.png`,
        sourcePath: TEST_ASSET_FACE_PNG_PATH,
        originalWidth: 256,
        originalHeight: 256,
        trimmedBounds: [0, 0, 256, 256],
        finalOrigin: [0, 0],
        placementMode: "preserveImageOffset",
        trimTransparentBoundsApplied: false,
        autoGenerateMeshApplied: false,
      },
    },
  });
}

describe("MenuBar image import", () => {
  beforeEach(() => {
    resetAllStores();
    useI18nStore.getState().setLocale("en");
  });

  it("shows the Open Image menu item", async () => {
    const user = userEvent.setup();
    render(<MenuBar />);

    await user.click(screen.getByText(/File/));

    expect(screen.getByText("Open Image...")).toBeInTheDocument();
    expect(screen.getByText("Import Image As Layer...")).toBeDisabled();
    expect(screen.getByText("Import Images As Layers...")).toBeDisabled();
    expect(screen.getByText("Import Folder As Layers...")).toBeDisabled();
    expect(screen.getByText("Split PNG Into Layers...")).toBeDisabled();
  });

  it("runs the manual PNG project loader from the file menu", async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(projectIO, "loadImage").mockResolvedValue(true);
    render(<MenuBar />);

    await user.click(screen.getByText(/File/));
    await user.click(screen.getByText("Open Image..."));
    await user.click(screen.getByRole("button", { name: "Import" }));

    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });

  it("runs the layer import action when a project is open", async () => {
    const user = userEvent.setup();
    useEditorStore.setState((state) => {
      state.project = createProject();
    });
    const spy = vi.spyOn(projectIO, "importImageAsLayer").mockResolvedValue(true);
    render(<MenuBar />);

    await user.click(screen.getByText(/File/));
    await user.click(screen.getByText("Import Image As Layer..."));
    await user.click(screen.getByRole("button", { name: "Import" }));

    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });

  it("runs the batch layer import action when a project is open", async () => {
    const user = userEvent.setup();
    useEditorStore.setState((state) => {
      state.project = createProject();
    });
    const spy = vi.spyOn(projectIO, "importImagesAsLayers").mockResolvedValue(true);
    render(<MenuBar />);

    await user.click(screen.getByText(/File/));
    await user.click(screen.getByText("Import Images As Layers..."));
    await user.click(screen.getByRole("button", { name: "Import" }));

    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });

  it("runs the folder import action when a project is open", async () => {
    const user = userEvent.setup();
    useEditorStore.setState((state) => {
      state.project = createProject();
    });
    const spy = vi.spyOn(projectIO, "importPngFolderAsLayers").mockResolvedValue(true);
    render(<MenuBar />);

    await user.click(screen.getByText(/File/));
    await user.click(screen.getByText("Import Folder As Layers..."));
    await user.click(screen.getByRole("button", { name: "Import" }));

    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });

  it("opens the manual PNG split wizard from the file menu", async () => {
    const user = userEvent.setup();
    useEditorStore.setState((state) => {
      state.project = createProject({
        layers: [createManualPngMesh("manual-single")],
      });
      state.projectSourceKind = "manualPng";
    });
    render(<MenuBar />);

    await user.click(screen.getByText(/File/));
    await user.click(screen.getByText("Split PNG Into Layers..."));

    expect(useProjectDialogsStore.getState().showManualPngSplit).toBe(true);
  });

  it("disables image reimport when the selected layer is not a manual PNG import", async () => {
    const user = userEvent.setup();
    const project = createProject();
    useEditorStore.setState((state) => {
      state.project = project;
    });
    useSelectionStore.setState({
      selectedLayerId: project.layers[0]?.id ?? null,
      selectedLayerIds: project.layers[0]?.id ? [project.layers[0].id] : [],
    });
    render(<MenuBar />);

    await user.click(screen.getByText(/File/));

    expect(screen.getByText("Reimport Image Layer")).toBeDisabled();
  });

  it("runs image reimport when a manual PNG-imported ViviMesh is selected", async () => {
    const user = userEvent.setup();
    const project = createProject();
    project.layers[0] = createViviMesh({
      id: project.layers[0]?.id ?? "manual-png-layer",
      importMetadata: {
        source: "manualPng",
        manualPng: {
          sourceFileName: "face.png",
          sourcePath: TEST_ASSET_FACE_PNG_PATH,
          originalWidth: 256,
          originalHeight: 256,
          trimmedBounds: [0, 0, 256, 256],
          finalOrigin: [0, 0],
          placementMode: "preserveImageOffset",
          trimTransparentBoundsApplied: false,
          autoGenerateMeshApplied: false,
        },
      },
    });
    useEditorStore.setState((state) => {
      state.project = project;
    });
    useSelectionStore.setState({
      selectedLayerId: project.layers[0]?.id ?? null,
      selectedLayerIds: project.layers[0]?.id ? [project.layers[0].id] : [],
    });
    const spy = vi.spyOn(projectIO, "reimportManualPngLayer").mockResolvedValue(true);
    render(<MenuBar />);

    await user.click(screen.getByText(/File/));
    await user.click(screen.getByText("Reimport Image Layer"));

    expect(spy).toHaveBeenCalledWith(project.layers[0]!.id);
    spy.mockRestore();
  });

  it("does not run any image import action when the options dialog is cancelled", async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(projectIO, "loadImage").mockResolvedValue(true);
    render(<MenuBar />);

    await user.click(screen.getByText(/File/));
    await user.click(screen.getByText("Open Image..."));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(openSpy).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });

  it("shows Auto Setup as disabled for a manual PNG project", async () => {
    const user = userEvent.setup();
    useEditorStore.setState((state) => {
      state.project = createProject({
        layers: [createManualPngMesh("manual-single")],
      });
      state.projectSourceKind = "manualPng";
    });
    render(<MenuBar />);

    await user.click(screen.getByText(/File/));

    const autoSetup = screen.getByText("Auto Setup");
    expect(autoSetup).toBeDisabled();
    expect(autoSetup).toHaveAttribute(
      "title",
      expect.stringContaining("separated PNG layers"),
    );
  });

  it("enables Auto Setup for a manually split PNG project", async () => {
    const user = userEvent.setup();
    useEditorStore.setState((state) => {
      state.project = createProject({
        layers: [
          createManualPngMesh("manual-hair", "hair"),
          createManualPngMesh("manual-face", "face"),
        ],
      });
      state.projectSourceKind = "manualPng";
    });
    render(<MenuBar />);

    await user.click(screen.getByText(/File/));

    expect(screen.getByText("Auto Setup")).toBeEnabled();
  });
});
