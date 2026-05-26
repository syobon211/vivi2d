import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, type vi } from "vitest";
import { clearTextures, setTexture } from "@/lib/texture-store";
import { useEditorStore } from "@/stores/editorStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { useViewportStore } from "@/stores/viewportStore";
import { createViviMesh, createBoneNode, createProject } from "@/test/fixtures";
import { createMockPixiRefs } from "@/test/pixi-mocks";
import { resetAllStores } from "@/test/store-reset";
import { useReferenceOverlay } from "../useReferenceOverlay";

describe("useReferenceOverlay", () => {
  beforeEach(() => {
    resetAllStores();
    clearTextures();
  });

  it("renders a reference sprite for the selected ViviMesh", () => {
    const mesh = createViviMesh({
      id: "mesh-reference",
      x: 12,
      y: 34,
      width: 256,
      height: 128,
    });
    useEditorStore.setState({ project: createProject({ layers: [mesh] }) });
    useSelectionStore.setState({ selectedLayerId: mesh.id, selectedLayerIds: [mesh.id] });
    useViewportStore.setState({
      referenceOverlay: { enabled: true, opacity: 0.4, mode: "source" },
    });

    setTexture(mesh.id, document.createElement("canvas"));
    const pixiRefs = createMockPixiRefs();

    renderHook(() => useReferenceOverlay(pixiRefs));

    const world = pixiRefs.current.world;
    const addedContainer = (world as unknown as { addChild: ReturnType<typeof vi.fn> })
      .addChild.mock.calls[0]?.[0];
    expect(addedContainer.label).toBe("reference-overlay");
    const sprite = addedContainer.addChild.mock.calls[0]?.[0];
    expect(sprite.label).toBe(`reference-overlay:source:${mesh.id}`);
    expect(sprite.x).toBe(12);
    expect(sprite.y).toBe(34);
    expect(sprite.width).toBe(256);
    expect(sprite.height).toBe(128);
    expect(sprite.alpha).toBe(0.4);
  });

  it("does not render when the feature is disabled", () => {
    const mesh = createViviMesh({ id: "mesh-reference" });
    useEditorStore.setState({ project: createProject({ layers: [mesh] }) });
    useSelectionStore.setState({ selectedLayerId: mesh.id, selectedLayerIds: [mesh.id] });
    useViewportStore.setState({
      referenceOverlay: { enabled: false, opacity: 0.35, mode: "source" },
    });
    setTexture(mesh.id, document.createElement("canvas"));
    const pixiRefs = createMockPixiRefs();

    renderHook(() => useReferenceOverlay(pixiRefs));

    const world = pixiRefs.current.world;
    expect(
      (world as unknown as { addChild: ReturnType<typeof vi.fn> }).addChild.mock.calls
        .length,
    ).toBe(0);
  });

  it("does not render for non-art selections", () => {
    const bone = createBoneNode({ id: "bone-reference" });
    useEditorStore.setState({ project: createProject({ layers: [bone] }) });
    useSelectionStore.setState({ selectedLayerId: bone.id, selectedLayerIds: [bone.id] });
    useViewportStore.setState({
      referenceOverlay: { enabled: true, opacity: 0.35, mode: "source" },
    });
    const pixiRefs = createMockPixiRefs();

    renderHook(() => useReferenceOverlay(pixiRefs));

    const world = pixiRefs.current.world;
    expect(
      (world as unknown as { addChild: ReturnType<typeof vi.fn> }).addChild.mock.calls
        .length,
    ).toBe(0);
  });

  it("renders current mesh bounds in current-bounds mode", () => {
    const mesh = createViviMesh({
      id: "mesh-reference-bounds",
      x: 5,
      y: 7,
      mesh: {
        vertices: [2, 3, 20, 4, 4, 18],
        uvs: [0, 0, 1, 0, 0, 1],
        indices: [0, 1, 2],
        divisionsX: 1,
        divisionsY: 1,
      },
    });
    useEditorStore.setState({ project: createProject({ layers: [mesh] }) });
    useSelectionStore.setState({ selectedLayerId: mesh.id, selectedLayerIds: [mesh.id] });
    useViewportStore.setState({
      referenceOverlay: { enabled: true, opacity: 0.6, mode: "currentBounds" },
    });

    const pixiRefs = createMockPixiRefs();
    renderHook(() => useReferenceOverlay(pixiRefs));

    const world = pixiRefs.current.world;
    const addedContainer = (world as unknown as { addChild: ReturnType<typeof vi.fn> })
      .addChild.mock.calls[0]?.[0];
    const sprite = addedContainer.addChild.mock.calls[0]?.[0];
    expect(sprite.label).toBe(`reference-overlay:currentBounds:${mesh.id}`);
    expect(sprite.x).toBe(7);
    expect(sprite.y).toBe(10);
    expect(sprite.width).toBe(18);
    expect(sprite.height).toBe(15);
    expect(sprite.alpha).toBe(0.3);
    expect(sprite.tint).toBe(0x4dc0ff);
  });

  it("renders imported see-through bounds in imported-bounds mode", () => {
    const mesh = createViviMesh({
      id: "mesh-reference-imported-bounds",
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
    useSelectionStore.setState({ selectedLayerId: mesh.id, selectedLayerIds: [mesh.id] });
    useViewportStore.setState({
      referenceOverlay: { enabled: true, opacity: 0.5, mode: "importedBounds" },
    });

    const pixiRefs = createMockPixiRefs();
    renderHook(() => useReferenceOverlay(pixiRefs));

    const world = pixiRefs.current.world;
    const addedContainer = (world as unknown as { addChild: ReturnType<typeof vi.fn> })
      .addChild.mock.calls[0]?.[0];
    const sprite = addedContainer.addChild.mock.calls[0]?.[0];
    expect(sprite.label).toBe(`reference-overlay:importedBounds:${mesh.id}`);
    expect(sprite.x).toBe(11);
    expect(sprite.y).toBe(22);
    expect(sprite.width).toBe(33);
    expect(sprite.height).toBe(44);
    expect(sprite.alpha).toBe(0.25);
    expect(sprite.tint).toBe(0xffb54d);
  });

  it("renders current and imported bounds together in compare-bounds mode", () => {
    const mesh = createViviMesh({
      id: "mesh-reference-compare-bounds",
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
    useSelectionStore.setState({ selectedLayerId: mesh.id, selectedLayerIds: [mesh.id] });
    useViewportStore.setState({
      referenceOverlay: { enabled: true, opacity: 0.5, mode: "compareBounds" },
    });

    const pixiRefs = createMockPixiRefs();
    renderHook(() => useReferenceOverlay(pixiRefs));

    const world = pixiRefs.current.world;
    const addedContainer = (world as unknown as { addChild: ReturnType<typeof vi.fn> })
      .addChild.mock.calls[0]?.[0];
    const currentSprite = addedContainer.addChild.mock.calls[0]?.[0];
    const importedSprite = addedContainer.addChild.mock.calls[1]?.[0];
    expect(currentSprite.label).toBe(
      `reference-overlay:comparePrimary:currentBounds:${mesh.id}`,
    );
    expect(currentSprite.x).toBe(7);
    expect(currentSprite.y).toBe(10);
    expect(currentSprite.width).toBe(18);
    expect(currentSprite.height).toBe(15);
    expect(currentSprite.alpha).toBeCloseTo(0.225);
    expect(currentSprite.tint).toBe(0x4dc0ff);
    expect(importedSprite.label).toBe(
      `reference-overlay:compareSecondary:importedBounds:${mesh.id}`,
    );
    expect(importedSprite.x).toBe(11);
    expect(importedSprite.y).toBe(22);
    expect(importedSprite.width).toBe(33);
    expect(importedSprite.height).toBe(44);
    expect(importedSprite.alpha).toBe(0.25);
    expect(importedSprite.tint).toBe(0xffb54d);
    const differenceLabels = addedContainer.addChild.mock.calls
      .slice(2)
      .map((call: [unknown]) => (call[0] as { label?: string }).label);
    expect(
      differenceLabels.some((label: string | undefined) =>
        label?.startsWith(
          `reference-overlay:difference:currentBounds:importedBounds:primary:${mesh.id}:`,
        ),
      ),
    ).toBe(true);
  });

  it("renders source/current compare overlays when those A/B modes are selected", () => {
    const mesh = createViviMesh({
      id: "mesh-reference-compare-source",
      x: 10,
      y: 20,
      width: 40,
      height: 50,
      mesh: {
        vertices: [2, 3, 20, 4, 4, 18],
        uvs: [0, 0, 1, 0, 0, 1],
        indices: [0, 1, 2],
        divisionsX: 1,
        divisionsY: 1,
      },
    });
    useEditorStore.setState({ project: createProject({ layers: [mesh] }) });
    useSelectionStore.setState({ selectedLayerId: mesh.id, selectedLayerIds: [mesh.id] });
    useViewportStore.setState({
      referenceOverlay: {
        enabled: true,
        opacity: 0.5,
        mode: "compareBounds",
        comparePrimary: "source",
        compareSecondary: "currentBounds",
        highlightDifferences: false,
      },
    });

    const pixiRefs = createMockPixiRefs();
    renderHook(() => useReferenceOverlay(pixiRefs));

    const world = pixiRefs.current.world;
    const addedContainer = (world as unknown as { addChild: ReturnType<typeof vi.fn> })
      .addChild.mock.calls[0]?.[0];
    const primarySprite = addedContainer.addChild.mock.calls[0]?.[0];
    const secondarySprite = addedContainer.addChild.mock.calls[1]?.[0];
    expect(primarySprite.label).toBe(
      `reference-overlay:comparePrimary:source:${mesh.id}`,
    );
    expect(primarySprite.tint).toBe(0x8dd96f);
    expect(secondarySprite.label).toBe(
      `reference-overlay:compareSecondary:currentBounds:${mesh.id}`,
    );
    expect(secondarySprite.tint).toBe(0x4dc0ff);
    expect(addedContainer.addChild.mock.calls).toHaveLength(2);
  });

  it("does not render imported-bounds mode when see-through metadata is missing", () => {
    const mesh = createViviMesh({ id: "mesh-reference-imported-missing" });
    useEditorStore.setState({ project: createProject({ layers: [mesh] }) });
    useSelectionStore.setState({ selectedLayerId: mesh.id, selectedLayerIds: [mesh.id] });
    useViewportStore.setState({
      referenceOverlay: { enabled: true, opacity: 0.5, mode: "importedBounds" },
    });

    const pixiRefs = createMockPixiRefs();
    renderHook(() => useReferenceOverlay(pixiRefs));

    const world = pixiRefs.current.world;
    const addedContainer = (world as unknown as { addChild: ReturnType<typeof vi.fn> })
      .addChild.mock.calls[0]?.[0];
    expect(addedContainer.destroy).toHaveBeenCalled();
  });

  it("re-renders when the overlay mode changes", () => {
    const mesh = createViviMesh({
      id: "mesh-reference-rerender",
      x: 10,
      y: 20,
      mesh: {
        vertices: [1, 2, 8, 2, 2, 9],
        uvs: [0, 0, 1, 0, 0, 1],
        indices: [0, 1, 2],
        divisionsX: 1,
        divisionsY: 1,
      },
    });
    useEditorStore.setState({ project: createProject({ layers: [mesh] }) });
    useSelectionStore.setState({ selectedLayerId: mesh.id, selectedLayerIds: [mesh.id] });
    useViewportStore.setState({
      referenceOverlay: { enabled: true, opacity: 0.4, mode: "source" },
    });
    setTexture(mesh.id, document.createElement("canvas"));

    const pixiRefs = createMockPixiRefs();
    renderHook(() => useReferenceOverlay(pixiRefs));

    act(() => {
      useViewportStore.setState({
        referenceOverlay: { enabled: true, opacity: 0.4, mode: "importedBounds" },
      });
    });

    const world = pixiRefs.current.world;
    const addChildCalls = (world as unknown as { addChild: ReturnType<typeof vi.fn> })
      .addChild.mock.calls;
    return waitFor(() => {
      expect(addChildCalls).toHaveLength(2);
      const latestContainer = addChildCalls.at(-1)?.[0];
      expect(latestContainer.destroy).toHaveBeenCalled();
    });
  });
});
