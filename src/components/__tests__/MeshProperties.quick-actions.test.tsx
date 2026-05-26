import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { MenuBar } from "@/components/MenuBar";
import { QuickActionsDialog } from "@/components/QuickActionsDialog";
import { useI18nStore } from "@/lib/i18n";
import { useEditorStore } from "@/stores/editorStore";
import { useQuickActionsStore } from "@/stores/quickActionsStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { useViewportStore } from "@/stores/viewportStore";
import { createViviMesh, createProject } from "@/test/fixtures";
import { resetAllStores } from "@/test/store-reset";

function openPalette() {
  act(() => {
    useQuickActionsStore.getState().openPalette();
  });
}

describe("Reference overlay quick actions", () => {
  beforeEach(() => {
    resetAllStores();
    useI18nStore.getState().setLocale("en");
  });

  it("switches the reference overlay mode without MeshProperties being mounted", async () => {
    const mesh = createViviMesh({ id: "mesh-quick-actions" });
    useEditorStore.setState({ project: createProject({ layers: [mesh] }) });
    useSelectionStore.setState({ selectedLayerId: mesh.id, selectedLayerIds: [mesh.id] });
    const user = userEvent.setup();

    render(
      <>
        <MenuBar />
        <QuickActionsDialog />
      </>,
    );

    openPalette();
    await screen.findByRole("dialog", { name: /quick actions/i });
    await user.type(screen.getByLabelText("Search actions"), "current bounds");
    await user.click(
      screen.getByRole("button", { name: /reference overlay: current bounds/i }),
    );

    expect(useViewportStore.getState().referenceOverlay.enabled).toBe(true);
    expect(useViewportStore.getState().referenceOverlay.mode).toBe("currentBounds");
  });

  it("switches to bounds-compare mode from global quick actions", async () => {
    const mesh = createViviMesh({
      id: "mesh-quick-actions",
      importMetadata: {
        source: "seeThrough",
        seeThrough: {
          label: "hair_front",
          order: 0,
          confidence: 0.95,
          leftRightSplit: "center",
          frontBackSplit: "front",
          bbox: [10, 20, 30, 40],
          depthStats: { min: 0.1, max: 0.4, mean: 0.2 },
        },
      },
    });
    useEditorStore.setState({ project: createProject({ layers: [mesh] }) });
    useSelectionStore.setState({ selectedLayerId: mesh.id, selectedLayerIds: [mesh.id] });
    const user = userEvent.setup();

    render(
      <>
        <MenuBar />
        <QuickActionsDialog />
      </>,
    );

    openPalette();
    await screen.findByRole("dialog", { name: /quick actions/i });
    await user.type(screen.getByLabelText("Search actions"), "bounds compare");
    await user.click(
      screen.getByRole("button", { name: /reference overlay: bounds compare/i }),
    );

    expect(useViewportStore.getState().referenceOverlay.enabled).toBe(true);
    expect(useViewportStore.getState().referenceOverlay.mode).toBe("compareBounds");
  });

  it("toggles the reference overlay from global quick actions", async () => {
    const mesh = createViviMesh({ id: "mesh-quick-actions" });
    useEditorStore.setState({ project: createProject({ layers: [mesh] }) });
    useSelectionStore.setState({ selectedLayerId: mesh.id, selectedLayerIds: [mesh.id] });
    useViewportStore.setState({
      referenceOverlay: { enabled: false, opacity: 0.35, mode: "source" },
    });
    const user = userEvent.setup();

    render(
      <>
        <MenuBar />
        <QuickActionsDialog />
      </>,
    );

    openPalette();
    await screen.findByRole("dialog", { name: /quick actions/i });
    await user.type(screen.getByLabelText("Search actions"), "enable reference overlay");
    await user.click(screen.getByRole("button", { name: /enable reference overlay/i }));

    expect(useViewportStore.getState().referenceOverlay.enabled).toBe(true);
  });

  it("applies an opacity preset globally and preserves the current mode", async () => {
    const mesh = createViviMesh({ id: "mesh-quick-actions" });
    useEditorStore.setState({ project: createProject({ layers: [mesh] }) });
    useSelectionStore.setState({ selectedLayerId: mesh.id, selectedLayerIds: [mesh.id] });
    useViewportStore.setState({
      referenceOverlay: { enabled: false, opacity: 0.35, mode: "currentBounds" },
    });
    const user = userEvent.setup();

    render(
      <>
        <MenuBar />
        <QuickActionsDialog />
      </>,
    );

    openPalette();
    await screen.findByRole("dialog", { name: /quick actions/i });
    await user.type(screen.getByLabelText("Search actions"), "opacity: 75");
    await user.click(
      screen.getByRole("button", { name: /reference overlay opacity: 75%/i }),
    );

    expect(useViewportStore.getState().referenceOverlay.enabled).toBe(true);
    expect(useViewportStore.getState().referenceOverlay.opacity).toBe(0.75);
    expect(useViewportStore.getState().referenceOverlay.mode).toBe("currentBounds");
  });

  it("swaps compare A/B from global quick actions", async () => {
    const mesh = createViviMesh({
      id: "mesh-quick-actions",
      importMetadata: {
        source: "seeThrough",
        seeThrough: {
          label: "hair_front",
          order: 0,
          confidence: 0.95,
          leftRightSplit: "center",
          frontBackSplit: "front",
          bbox: [10, 20, 30, 40],
          depthStats: { min: 0.1, max: 0.4, mean: 0.2 },
        },
      },
    });
    useEditorStore.setState({ project: createProject({ layers: [mesh] }) });
    useSelectionStore.setState({ selectedLayerId: mesh.id, selectedLayerIds: [mesh.id] });
    useViewportStore.setState({
      referenceOverlay: {
        enabled: true,
        opacity: 0.35,
        mode: "compareBounds",
        comparePrimary: "source",
        compareSecondary: "importedBounds",
      },
    });
    const user = userEvent.setup();

    render(
      <>
        <MenuBar />
        <QuickActionsDialog />
      </>,
    );

    openPalette();
    await screen.findByRole("dialog", { name: /quick actions/i });
    await user.type(screen.getByLabelText("Search actions"), "swap a/b");
    await user.click(
      screen.getByRole("button", { name: /reference overlay compare: swap a\/b/i }),
    );

    expect(useViewportStore.getState().referenceOverlay.comparePrimary).toBe(
      "importedBounds",
    );
    expect(useViewportStore.getState().referenceOverlay.compareSecondary).toBe("source");
  });

  it("toggles compare summary pinning from global quick actions", async () => {
    const mesh = createViviMesh({ id: "mesh-quick-actions" });
    useEditorStore.setState({ project: createProject({ layers: [mesh] }) });
    useSelectionStore.setState({ selectedLayerId: mesh.id, selectedLayerIds: [mesh.id] });
    useViewportStore.setState({
      referenceOverlay: {
        enabled: true,
        opacity: 0.35,
        mode: "source",
        pinCompareSummary: false,
      },
    });
    const user = userEvent.setup();

    render(
      <>
        <MenuBar />
        <QuickActionsDialog />
      </>,
    );

    openPalette();
    await screen.findByRole("dialog", { name: /quick actions/i });
    await user.type(
      screen.getByLabelText("Search actions"),
      "pin reference overlay compare summary",
    );
    await user.click(
      screen.getByRole("button", { name: /pin reference overlay compare summary/i }),
    );

    expect(useViewportStore.getState().referenceOverlay.pinCompareSummary).toBe(true);
  });

  it("disables imported-bounds quick action when See-through metadata is missing", async () => {
    const mesh = createViviMesh({ id: "mesh-quick-actions" });
    useEditorStore.setState({ project: createProject({ layers: [mesh] }) });
    useSelectionStore.setState({ selectedLayerId: mesh.id, selectedLayerIds: [mesh.id] });
    const user = userEvent.setup();

    render(
      <>
        <MenuBar />
        <QuickActionsDialog />
      </>,
    );

    openPalette();
    await screen.findByRole("dialog", { name: /quick actions/i });
    await user.type(screen.getByLabelText("Search actions"), "imported bounds");

    const action = screen.getByRole("button", {
      name: /reference overlay: imported bounds/i,
    });
    expect(action).toBeDisabled();
    expect(action).toHaveTextContent(
      /selected ViviMesh requires see-through import metadata\./i,
    );
  });

  it("disables reference overlay quick actions when no ViviMesh is selected", async () => {
    const mesh = createViviMesh({ id: "mesh-quick-actions" });
    useEditorStore.setState({ project: createProject({ layers: [mesh] }) });
    const user = userEvent.setup();

    render(
      <>
        <MenuBar />
        <QuickActionsDialog />
      </>,
    );

    openPalette();
    await screen.findByRole("dialog", { name: /quick actions/i });
    await user.type(screen.getByLabelText("Search actions"), "reference overlay");

    const action = screen.getByRole("button", {
      name: /enable reference overlay/i,
    });
    expect(action).toBeDisabled();
    expect(action).toHaveTextContent(
      "Select a ViviMesh to compare against its reference.",
    );
  });
});
