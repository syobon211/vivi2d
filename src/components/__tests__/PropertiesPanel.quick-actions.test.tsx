import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { MenuBar } from "@/components/MenuBar";
import { ProjectDialogsHost } from "@/components/ProjectDialogsHost";
import { PropertiesPanel } from "@/components/PropertiesPanel";
import { QuickActionsDialog } from "@/components/QuickActionsDialog";
import { useI18nStore } from "@/lib/i18n";
import { useEditorStore } from "@/stores/editorStore";
import { useQuickActionsStore } from "@/stores/quickActionsStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { useViewportStore } from "@/stores/viewportStore";
import { createViviMesh, createProject } from "@/test/fixtures";
import { resetAllStores } from "@/test/store-reset";

function createSeeThroughMesh(id: string) {
  return createViviMesh({
    id,
    name: "Imported Hair",
    importMetadata: {
      source: "seeThrough",
      seeThrough: {
        label: "hair_front",
        order: 0,
        confidence: 0.9,
        leftRightSplit: "center",
        frontBackSplit: "front",
        bbox: [0, 0, 10, 10],
        depthStats: { min: 0, max: 1, mean: 0.5 },
      },
    },
  });
}

describe("PropertiesPanel quick actions", () => {
  beforeEach(() => {
    resetAllStores();
    useI18nStore.getState().setLocale("en");
  });

  it("opens model validation from the quick actions palette", async () => {
    useEditorStore.setState({
      project: createProject({ layers: [createViviMesh({ id: "mesh-a" })] }),
    });
    const user = userEvent.setup();

    render(
      <>
        <MenuBar />
        <ProjectDialogsHost />
        <PropertiesPanel />
        <QuickActionsDialog />
      </>,
    );

    act(() => {
      useQuickActionsStore.getState().openPalette();
    });
    const dialog = await screen.findByRole("dialog", { name: /quick actions/i });
    await user.type(screen.getByLabelText("Search actions"), "validation");
    await user.click(within(dialog).getByRole("button", { name: /model validation/i }));

    expect(
      await screen.findByRole("dialog", { name: /model validation/i }),
    ).toBeInTheDocument();
  });

  it("opens depth inspector from the quick actions palette", async () => {
    const mesh = createSeeThroughMesh("mesh-a");
    useEditorStore.setState({
      project: createProject({ layers: [mesh] }),
    });
    useSelectionStore.setState({ selectedLayerId: mesh.id, selectedLayerIds: [mesh.id] });
    useViewportStore.getState().setReferenceOverlaySettings({
      enabled: false,
      opacity: 0.5,
      mode: "source",
    });
    const user = userEvent.setup();

    render(
      <>
        <MenuBar />
        <ProjectDialogsHost />
        <PropertiesPanel />
        <QuickActionsDialog />
      </>,
    );

    act(() => {
      useQuickActionsStore.getState().openPalette();
    });
    const dialog = await screen.findByRole("dialog", { name: /quick actions/i });
    await user.type(screen.getByLabelText("Search actions"), "depth inspector");
    await user.click(within(dialog).getByRole("button", { name: /depth inspector/i }));

    expect(
      await screen.findByRole("dialog", { name: /depth inspector/i }),
    ).toBeInTheDocument();
    expect(useViewportStore.getState().referenceOverlay).toMatchObject({
      enabled: true,
      mode: "importedBounds",
      opacity: 0.5,
    });
  });

  it("disables depth inspector when the project has no see-through imports", async () => {
    useEditorStore.setState({
      project: createProject({ layers: [createViviMesh({ id: "mesh-a" })] }),
    });
    const user = userEvent.setup();

    render(
      <>
        <MenuBar />
        <ProjectDialogsHost />
        <PropertiesPanel />
        <QuickActionsDialog />
      </>,
    );

    act(() => {
      useQuickActionsStore.getState().openPalette();
    });
    const dialog = await screen.findByRole("dialog", { name: /quick actions/i });
    await user.type(screen.getByLabelText("Search actions"), "depth inspector");

    const action = within(dialog).getByRole("button", { name: /depth inspector/i });
    expect(action).toBeDisabled();
    expect(
      within(dialog).getByText("A See-through imported layer is required."),
    ).toBeInTheDocument();
  });
});
