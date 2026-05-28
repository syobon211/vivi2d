import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { MeshProperties } from "@/components/properties/MeshProperties";
import { useI18nStore } from "@/lib/i18n";
import { useEditorStore } from "@/stores/editorStore";
import { useViewportStore } from "@/stores/viewportStore";
import { createViviMesh, createProject } from "@/test/fixtures";
import { resetAllStores } from "@/test/store-reset";

describe("MeshProperties reference overlay", () => {
  beforeEach(() => {
    resetAllStores();
    useI18nStore.getState().setLocale("en");
  });

  it("toggles the reference overlay viewport setting", () => {
    const mesh = createViviMesh({ id: "mesh-reference-overlay" });
    useEditorStore.setState({ project: createProject({ layers: [mesh] }) });

    render(<MeshProperties layer={mesh} />);
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Enable reference overlay" }),
    );

    expect(useViewportStore.getState().referenceOverlay.enabled).toBe(true);
  });

  it("updates the reference overlay opacity", () => {
    const mesh = createViviMesh({ id: "mesh-reference-overlay" });
    useEditorStore.setState({ project: createProject({ layers: [mesh] }) });

    render(<MeshProperties layer={mesh} />);
    fireEvent.change(screen.getByLabelText("Reference overlay opacity"), {
      target: { value: "0.55" },
    });

    expect(useViewportStore.getState().referenceOverlay.opacity).toBe(0.55);
  });

  it("updates the reference overlay mode", () => {
    const mesh = createViviMesh({ id: "mesh-reference-overlay" });
    useEditorStore.setState({ project: createProject({ layers: [mesh] }) });

    render(<MeshProperties layer={mesh} />);
    fireEvent.change(screen.getByLabelText("Reference overlay mode"), {
      target: { value: "currentBounds" },
    });

    expect(useViewportStore.getState().referenceOverlay.mode).toBe(
      "currentBounds",
    );
  });

  it("supports the imported-bounds overlay mode", () => {
    const mesh = createViviMesh({ id: "mesh-reference-overlay" });
    useEditorStore.setState({ project: createProject({ layers: [mesh] }) });

    render(<MeshProperties layer={mesh} />);
    fireEvent.change(screen.getByLabelText("Reference overlay mode"), {
      target: { value: "importedBounds" },
    });

    expect(useViewportStore.getState().referenceOverlay.mode).toBe(
      "importedBounds",
    );
  });

  it("supports the bounds-compare overlay mode", () => {
    const mesh = createViviMesh({ id: "mesh-reference-overlay" });
    useEditorStore.setState({ project: createProject({ layers: [mesh] }) });

    render(<MeshProperties layer={mesh} />);
    fireEvent.change(screen.getByLabelText("Reference overlay mode"), {
      target: { value: "compareBounds" },
    });

    expect(useViewportStore.getState().referenceOverlay.mode).toBe(
      "compareBounds",
    );
  });

  it("updates compare A/B modes and difference highlighting", () => {
    const mesh = createViviMesh({ id: "mesh-reference-overlay" });
    useEditorStore.setState({ project: createProject({ layers: [mesh] }) });
    useViewportStore.setState({
      referenceOverlay: {
        enabled: true,
        opacity: 0.35,
        mode: "compareBounds",
        comparePrimary: "currentBounds",
        compareSecondary: "importedBounds",
        highlightDifferences: true,
      },
    });

    render(<MeshProperties layer={mesh} />);
    fireEvent.change(screen.getByLabelText("Reference compare primary mode"), {
      target: { value: "source" },
    });
    fireEvent.change(
      screen.getByLabelText("Reference compare secondary mode"),
      {
        target: { value: "currentBounds" },
      },
    );
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Highlight reference overlay differences",
      }),
    );

    expect(useViewportStore.getState().referenceOverlay.comparePrimary).toBe(
      "source",
    );
    expect(useViewportStore.getState().referenceOverlay.compareSecondary).toBe(
      "currentBounds",
    );
    expect(
      useViewportStore.getState().referenceOverlay.highlightDifferences,
    ).toBe(false);
  });

  it("applies compare presets from the panel", () => {
    const mesh = createViviMesh({
      id: "mesh-reference-overlay",
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
    useViewportStore.setState({
      referenceOverlay: {
        enabled: true,
        opacity: 0.35,
        mode: "compareBounds",
        comparePrimary: "currentBounds",
        compareSecondary: "importedBounds",
        highlightDifferences: true,
      },
    });

    render(<MeshProperties layer={mesh} />);
    fireEvent.click(screen.getByRole("button", { name: "Source vs Imported" }));

    expect(useViewportStore.getState().referenceOverlay.comparePrimary).toBe(
      "source",
    );
    expect(useViewportStore.getState().referenceOverlay.compareSecondary).toBe(
      "importedBounds",
    );
  });

  it("explains when imported-bounds mode has no See-through metadata", () => {
    const mesh = createViviMesh({ id: "mesh-reference-overlay" });
    useEditorStore.setState({ project: createProject({ layers: [mesh] }) });
    useViewportStore.setState({
      referenceOverlay: {
        enabled: true,
        opacity: 0.35,
        mode: "importedBounds",
      },
    });

    render(<MeshProperties layer={mesh} />);

    expect(
      screen.getByText(
        "Imported bounds and bounds compare require See-through import metadata on the selected ViviMesh.",
      ),
    ).toBeInTheDocument();
  });

  it("explains that imported bounds stay fixed to the import-time bbox", () => {
    const mesh = createViviMesh({
      id: "mesh-reference-overlay",
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
    useViewportStore.setState({
      referenceOverlay: {
        enabled: true,
        opacity: 0.35,
        mode: "importedBounds",
      },
    });

    render(<MeshProperties layer={mesh} />);

    expect(
      screen.getByText(
        "Imported bounds stay fixed to the original See-through import bbox and may differ after manual transforms.",
      ),
    ).toBeInTheDocument();
  });

  it("shows a compare summary when bounds-compare mode has imported metadata", () => {
    const mesh = createViviMesh({
      id: "mesh-reference-overlay",
      x: 5,
      y: 7,
      mesh: {
        vertices: [2, 3, 20, 4, 4, 18],
        uvs: [0, 0, 1, 0, 0, 1],
        indices: [0, 1, 2],
        divisionsX: 1,
        divisionsY: 1,
      },
      importMetadata: {
        source: "seeThrough",
        seeThrough: {
          label: "hair_front",
          order: 0,
          confidence: 0.95,
          leftRightSplit: "center",
          frontBackSplit: "front",
          bbox: [11, 22, 33, 44],
          depthStats: { min: 0.1, max: 0.4, mean: 0.2 },
        },
      },
    });
    useEditorStore.setState({ project: createProject({ layers: [mesh] }) });
    useViewportStore.setState({
      referenceOverlay: { enabled: true, opacity: 0.35, mode: "compareBounds" },
    });

    render(<MeshProperties layer={mesh} />);

    const summaryCard = screen
      .getByText("Compare Summary")
      .closest(".reference-summary-card");
    expect(summaryCard).not.toBeNull();
    expect(summaryCard).toHaveTextContent(
      "Offset + scale drift: Current bounds vs Imported bounds",
    );
    expect(summaryCard).toHaveTextContent(
      "Center drift 28.9px. Width 0.55x, height 0.34x, area 0.19x.",
    );
    expect(summaryCard).toHaveTextContent(
      "Offset -4.0 x / -12.0 y. Size -15.0 w / -29.0 h.",
    );
  });

  it("swaps compare A/B modes from the panel", () => {
    const mesh = createViviMesh({
      id: "mesh-reference-overlay",
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
    useViewportStore.setState({
      referenceOverlay: {
        enabled: true,
        opacity: 0.35,
        mode: "compareBounds",
        comparePrimary: "source",
        compareSecondary: "importedBounds",
        highlightDifferences: true,
      },
    });

    render(<MeshProperties layer={mesh} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Swap A/B" })[0]!);

    expect(useViewportStore.getState().referenceOverlay.comparePrimary).toBe(
      "importedBounds",
    );
    expect(useViewportStore.getState().referenceOverlay.compareSecondary).toBe(
      "source",
    );
  });

  it("offers inline compare-summary controls for swapping and pinning", () => {
    const mesh = createViviMesh({
      id: "mesh-reference-overlay",
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
    useViewportStore.setState({
      referenceOverlay: {
        enabled: true,
        opacity: 0.35,
        mode: "compareBounds",
        comparePrimary: "source",
        compareSecondary: "importedBounds",
        highlightDifferences: true,
        pinCompareSummary: false,
      },
    });

    render(<MeshProperties layer={mesh} />);

    expect(screen.getByText(/Source vs Imported\./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pin Summary" }));
    expect(useViewportStore.getState().referenceOverlay.pinCompareSummary).toBe(
      true,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Swap A/B" })[1]!);
    expect(useViewportStore.getState().referenceOverlay.comparePrimary).toBe(
      "importedBounds",
    );
    expect(useViewportStore.getState().referenceOverlay.compareSecondary).toBe(
      "source",
    );
  });

  it("pins the compare summary outside compare mode", () => {
    const mesh = createViviMesh({
      id: "mesh-reference-overlay",
      importMetadata: {
        source: "seeThrough",
        seeThrough: {
          label: "hair_front",
          order: 0,
          confidence: 0.95,
          leftRightSplit: "center",
          frontBackSplit: "front",
          bbox: [11, 22, 33, 44],
          depthStats: { min: 0.1, max: 0.4, mean: 0.2 },
        },
      },
    });
    useEditorStore.setState({ project: createProject({ layers: [mesh] }) });
    useViewportStore.setState({
      referenceOverlay: {
        enabled: true,
        opacity: 0.35,
        mode: "source",
        comparePrimary: "currentBounds",
        compareSecondary: "importedBounds",
        highlightDifferences: true,
        pinCompareSummary: true,
      },
    });

    render(<MeshProperties layer={mesh} />);

    const summaryCard = screen
      .getByText("Compare Summary")
      .closest(".reference-summary-card");
    expect(summaryCard).not.toBeNull();
    expect(summaryCard).toHaveTextContent(
      "Offset + scale drift: Current bounds vs Imported bounds (pinned)",
    );
  });

  it("explains compare mode without imported metadata when comparing source and current bounds", () => {
    const mesh = createViviMesh({ id: "mesh-reference-overlay" });
    useEditorStore.setState({ project: createProject({ layers: [mesh] }) });
    useViewportStore.setState({
      referenceOverlay: {
        enabled: true,
        opacity: 0.35,
        mode: "compareBounds",
        comparePrimary: "source",
        compareSecondary: "currentBounds",
        highlightDifferences: true,
      },
    });

    render(<MeshProperties layer={mesh} />);

    expect(
      screen.queryByText(
        "Imported bounds and bounds compare require See-through import metadata on the selected ViviMesh.",
      ),
    ).not.toBeInTheDocument();
  });
});
