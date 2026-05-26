import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MenuBar } from "@/components/MenuBar";
import { ProjectDialogsHost } from "@/components/ProjectDialogsHost";
import { useI18nStore } from "@/lib/i18n";
import { useEditorStore } from "@/stores/editorStore";
import { _resetMergeTimer, useHistoryStore } from "@/stores/historyStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { useViewportStore } from "@/stores/viewportStore";
import { createViviMesh, createProject } from "@/test/fixtures";
import { resetAllStores } from "@/test/store-reset";
import { PropertiesPanel } from "../PropertiesPanel";

function createMetadata(label: string, order: number) {
  return {
    source: "seeThrough" as const,
    seeThrough: {
      label,
      order,
      confidence: 0.9,
      leftRightSplit: "center" as const,
      frontBackSplit: "front" as const,
      bbox: [0, 0, 10, 10] as [number, number, number, number],
      depthStats: { min: 0, max: 1, mean: 0.5 },
    },
  };
}

describe("PropertiesPanel depth inspector", () => {
  beforeEach(() => {
    resetAllStores();
    _resetMergeTimer();
    useI18nStore.getState().setLocale("en");
  });

  afterEach(() => {
    useI18nStore.getState().setLocale("ja");
  });

  it("opens the depth inspector without a selected layer", async () => {
    const mesh = createViviMesh({
      id: "mesh-a",
      drawOrder: 400,
      importMetadata: createMetadata("hair_front", 2),
    });
    useEditorStore.setState({ project: createProject({ layers: [mesh] }) });
    useSelectionStore.setState({ selectedLayerId: null, selectedLayerIds: [] });

    render(
      <>
        <MenuBar />
        <ProjectDialogsHost />
        <PropertiesPanel />
      </>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Depth Inspector" }));

    expect(
      await screen.findByRole("dialog", { name: "Depth Inspector" }),
    ).toBeInTheDocument();
    expect(screen.getByText("hair_front")).toBeInTheDocument();
    expect(useViewportStore.getState().referenceOverlay.enabled).toBe(false);
  });

  it("enables imported-bounds overlay for the selected imported layer", () => {
    const mesh = createViviMesh({
      id: "mesh-a",
      name: "Front",
      drawOrder: 400,
      importMetadata: createMetadata("hair_front", 2),
    });
    useEditorStore.setState({ project: createProject({ layers: [mesh] }) });
    useSelectionStore.setState({ selectedLayerId: mesh.id, selectedLayerIds: [mesh.id] });
    useViewportStore.getState().setReferenceOverlaySettings({
      enabled: false,
      opacity: 0.75,
      mode: "source",
    });

    render(
      <>
        <MenuBar />
        <ProjectDialogsHost />
        <PropertiesPanel />
      </>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Depth Inspector" }));

    expect(useViewportStore.getState().referenceOverlay).toMatchObject({
      enabled: true,
      mode: "importedBounds",
      opacity: 0.75,
    });
  });

  it("applies imported depth normalization as a single undo step", async () => {
    const front = createViviMesh({
      id: "front",
      name: "Front",
      drawOrder: 100,
      importMetadata: createMetadata("hair_front", 20),
    });
    const back = createViviMesh({
      id: "back",
      name: "Back",
      drawOrder: 900,
      importMetadata: createMetadata("hair_back", 10),
    });
    useEditorStore.setState({ project: createProject({ layers: [front, back] }) });
    useSelectionStore.setState({
      selectedLayerId: front.id,
      selectedLayerIds: [front.id],
    });

    render(
      <>
        <MenuBar />
        <ProjectDialogsHost />
        <PropertiesPanel />
      </>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Depth Inspector" }));
    await screen.findByRole("dialog", { name: "Depth Inspector" });
    fireEvent.click(
      screen.getByRole("button", { name: "Apply imported depth ordering" }),
    );

    const project = useEditorStore.getState().project!;
    expect(project.layers[0]!.drawOrder).toBe(900);
    expect(project.layers[1]!.drawOrder).toBe(100);
    expect(useHistoryStore.getState().undoStack).toHaveLength(1);

    useHistoryStore.getState().undo();
    const undone = useEditorStore.getState().project!;
    expect(undone.layers[0]!.drawOrder).toBe(100);
    expect(undone.layers[1]!.drawOrder).toBe(900);
  });

  it("updates draw order directly from a row input", async () => {
    const mesh = createViviMesh({
      id: "mesh-a",
      name: "Front",
      drawOrder: 400,
      importMetadata: createMetadata("hair_front", 2),
    });
    useEditorStore.setState({ project: createProject({ layers: [mesh] }) });
    useSelectionStore.setState({ selectedLayerId: mesh.id, selectedLayerIds: [mesh.id] });

    render(
      <>
        <MenuBar />
        <ProjectDialogsHost />
        <PropertiesPanel />
      </>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Depth Inspector" }));
    await screen.findByRole("dialog", { name: "Depth Inspector" });
    fireEvent.change(screen.getByLabelText("Draw Order Input Front"), {
      target: { value: "720" },
    });

    expect(useEditorStore.getState().project!.layers[0]!.drawOrder).toBe(720);
  });
});
