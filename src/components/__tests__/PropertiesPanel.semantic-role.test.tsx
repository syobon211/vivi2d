import { fireEvent, render, screen } from "@testing-library/react";
import { findLayerById } from "@vivi2d/core/layer-utils";
import type { GroupNode, LayerImportMetadata } from "@vivi2d/core/types";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PropertiesPanel } from "@/components/PropertiesPanel";
import { useI18nStore } from "@/lib/i18n";
import { useEditorStore } from "@/stores/editorStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { createViviMesh, createProject } from "@/test/fixtures";
import { resetAllStores } from "@/test/store-reset";

function createSeeThroughImportMetadata(label: string): LayerImportMetadata {
  return {
    source: "seeThrough",
    seeThrough: {
      label,
      order: 0,
      confidence: 0.81,
      leftRightSplit: "left",
      frontBackSplit: "front",
      bbox: [0, 0, 10, 10],
      depthStats: { min: 0.1, max: 0.2, mean: 0.15 },
    },
  };
}

function createGroup(id: string): GroupNode {
  return {
    id,
    name: "Group",
    visible: true,
    opacity: 1,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    children: [],
    blendMode: "normal",
    expanded: true,
    kind: "group",
  };
}

describe("PropertiesPanel semantic role classification", () => {
  beforeEach(() => {
    resetAllStores();
    useI18nStore.getState().setLocale("en");
  });

  afterEach(() => {
    useI18nStore.getState().setLocale("ja");
  });

  it("shows a single-layer semantic role selector and applies changes immediately", () => {
    const mesh = createViviMesh({ id: "mesh-a", semanticRole: "hairFront" });
    useEditorStore.setState({ project: createProject({ layers: [mesh] }) });
    useSelectionStore.setState({ selectedLayerId: mesh.id, selectedLayerIds: [mesh.id] });

    render(<PropertiesPanel />);

    const roleSelect = screen.getByLabelText("Semantic Role");
    expect(roleSelect).toHaveValue("hairFront");

    fireEvent.change(roleSelect, { target: { value: "mouth" } });

    expect(
      findLayerById(useEditorStore.getState().project!.layers, mesh.id)?.semanticRole,
    ).toBe("mouth");
  });

  it("shows See-through provenance and keeps it after clearing the role", () => {
    const mesh = createViviMesh({
      id: "mesh-a",
      semanticRole: "hairFront",
      importMetadata: createSeeThroughImportMetadata("hair_front"),
    });
    useEditorStore.setState({ project: createProject({ layers: [mesh] }) });
    useSelectionStore.setState({ selectedLayerId: mesh.id, selectedLayerIds: [mesh.id] });

    render(<PropertiesPanel />);

    expect(screen.getByText("See-through")).toBeInTheDocument();
    expect(screen.getByText("hair_front")).toBeInTheDocument();
    expect(screen.getByText("81%")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Semantic Role"), {
      target: { value: "__unassigned__" },
    });

    const updated = findLayerById(useEditorStore.getState().project!.layers, mesh.id);
    expect(updated?.semanticRole).toBeUndefined();
    expect(updated?.importMetadata?.source).toBe("seeThrough");
    expect(screen.getByText("See-through")).toBeInTheDocument();
  });

  it("shows a no-issues state for a healthy imported layer", () => {
    const mesh = createViviMesh({
      id: "mesh-a",
      semanticRole: "eyeLeft",
      importMetadata: createSeeThroughImportMetadata("iris_left"),
    });
    useEditorStore.setState({ project: createProject({ layers: [mesh] }) });
    useSelectionStore.setState({ selectedLayerId: mesh.id, selectedLayerIds: [mesh.id] });

    render(<PropertiesPanel />);

    expect(screen.getByText("Import Quality")).toBeInTheDocument();
    expect(screen.getByText("No import issues detected")).toBeInTheDocument();
  });

  it("shows import quality issues for a problematic imported layer", () => {
    const mesh = createViviMesh({
      id: "mesh-a",
      semanticRole: "eyeRight",
      importMetadata: {
        source: "seeThrough",
        seeThrough: {
          label: "iris_left",
          order: 0,
          confidence: 0.2,
          leftRightSplit: "left",
          frontBackSplit: "unknown",
          bbox: [0, 0, 0, 10],
          depthStats: { min: 2, max: 1, mean: 1.5 },
        },
      },
    });
    useEditorStore.setState({ project: createProject({ layers: [mesh] }) });
    useSelectionStore.setState({ selectedLayerId: mesh.id, selectedLayerIds: [mesh.id] });

    render(<PropertiesPanel />);

    expect(screen.getByText("Import Quality")).toBeInTheDocument();
    expect(
      screen.getByText("This layer was imported with low confidence."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("The role conflicts with the imported left/right hint."),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("The imported front/back hint is unknown.").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText("The imported bounds are invalid.").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText("The imported depth stats are invalid.").length,
    ).toBeGreaterThan(0);
  });

  it("shows batch role assignment for multi-selected ViviMeshes and applies to all", () => {
    const meshA = createViviMesh({ id: "mesh-a", semanticRole: "hairFront" });
    const meshB = createViviMesh({ id: "mesh-b", semanticRole: "hairBack" });
    useEditorStore.setState({ project: createProject({ layers: [meshA, meshB] }) });
    useSelectionStore.setState({
      selectedLayerId: meshA.id,
      selectedLayerIds: [meshA.id, meshB.id],
    });

    render(<PropertiesPanel />);

    const batchSelect = screen.getByLabelText("Batch Semantic Role");
    expect(batchSelect).toHaveValue("__mixed__");

    fireEvent.change(batchSelect, { target: { value: "eyeLeft" } });
    fireEvent.click(screen.getByRole("button", { name: "Batch Semantic Role Apply" }));

    const project = useEditorStore.getState().project!;
    expect(findLayerById(project.layers, meshA.id)?.semanticRole).toBe("eyeLeft");
    expect(findLayerById(project.layers, meshB.id)?.semanticRole).toBe("eyeLeft");
  });

  it("offers Select Same Role for an explicit single-layer semantic role and updates selection", () => {
    const meshA = createViviMesh({ id: "mesh-a", semanticRole: "hairFront" });
    const meshB = createViviMesh({ id: "mesh-b", semanticRole: "hairFront" });
    const meshC = createViviMesh({ id: "mesh-c", semanticRole: "mouth" });
    useEditorStore.setState({
      project: createProject({ layers: [meshA, meshB, meshC] }),
    });
    useSelectionStore.setState({
      selectedLayerId: meshB.id,
      selectedLayerIds: [meshB.id],
    });

    render(<PropertiesPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Select Same Role" }));

    expect(useSelectionStore.getState().selectedLayerIds).toEqual([meshA.id, meshB.id]);
    expect(useSelectionStore.getState().selectedLayerId).toBe(meshB.id);
  });

  it("hides Select Same Role for unknown or unassigned roles", () => {
    const unknown = createViviMesh({ id: "mesh-a", semanticRole: "unknown" });
    useEditorStore.setState({ project: createProject({ layers: [unknown] }) });
    useSelectionStore.setState({
      selectedLayerId: unknown.id,
      selectedLayerIds: [unknown.id],
    });

    const { rerender } = render(<PropertiesPanel />);
    expect(
      screen.queryByRole("button", { name: "Select Same Role" }),
    ).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Semantic Role"), {
      target: { value: "__unassigned__" },
    });
    rerender(<PropertiesPanel />);
    expect(
      screen.queryByRole("button", { name: "Select Same Role" }),
    ).not.toBeInTheDocument();
  });

  it("hides the batch semantic role editor for mixed viviMesh and group selection", () => {
    const mesh = createViviMesh({ id: "mesh-a" });
    const group = createGroup("group-a");
    useEditorStore.setState({ project: createProject({ layers: [mesh, group] }) });
    useSelectionStore.setState({
      selectedLayerId: mesh.id,
      selectedLayerIds: [mesh.id, group.id],
    });

    render(<PropertiesPanel />);

    expect(screen.queryByLabelText("Batch Semantic Role")).not.toBeInTheDocument();
  });

  it("does not show the single-layer semantic role editor for non-viviMesh layers", () => {
    const group = createGroup("group-a");
    useEditorStore.setState({ project: createProject({ layers: [group] }) });
    useSelectionStore.setState({
      selectedLayerId: group.id,
      selectedLayerIds: [group.id],
    });

    render(<PropertiesPanel />);

    expect(screen.queryByLabelText("Semantic Role")).not.toBeInTheDocument();
  });
});
