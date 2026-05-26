import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Canvas } from "@/components/Canvas";
import { useEditorStore } from "@/stores/editorStore";
import { useMultiViewStore } from "@/stores/multiViewStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { useViewportStore } from "@/stores/viewportStore";
import {
  createViviMesh,
  createBoneNode,
  createEmptyProject,
  createIKController,
  createProject,
} from "@/test/fixtures";
import { resetAllStores } from "@/test/store-reset";

function createOverlayMock() {
  return {
    onPointerDown: vi.fn(),
    onPointerMove: vi.fn(),
    onPointerUp: vi.fn(),
    isInteracting: vi.fn(() => false),
  };
}

const meshOverlayMock = createOverlayMock();
const boneOverlayMock = createOverlayMock();
const ikOverlayMock = createOverlayMock();
const colliderOverlayMock = createOverlayMock();
const viewportMock = {
  onWheel: vi.fn(),
  onPointerDown: vi.fn(),
  onPointerMove: vi.fn(),
  onPointerUp: vi.fn(),
  isInteracting: vi.fn(() => false),
};
const meshOverlayVisualModelMock = vi.fn(() => null);

vi.mock("@/hooks/usePixiApp", () => ({
  usePixiApp: () => ({
    current: {
      world: {
        scale: { set: vi.fn() },
        x: 0,
        y: 0,
      },
    },
  }),
}));

vi.mock("@/hooks/useLayerSync", () => ({
  useLayerSync: vi.fn(),
}));

vi.mock("@/hooks/useViewport", () => ({
  useViewport: () => viewportMock,
}));

vi.mock("@/hooks/useMeshOverlay", () => ({
  useMeshOverlayInteraction: () => ({
    ...meshOverlayMock,
    getDragVertexIndex: vi.fn(() => -1),
  }),
  useMeshOverlayVisualModel: () => meshOverlayVisualModelMock(),
}));

vi.mock("@/hooks/useBoneOverlay", () => ({
  useBoneOverlay: () => boneOverlayMock,
}));

vi.mock("@/hooks/useIKOverlay", () => ({
  useIKOverlay: () => ikOverlayMock,
}));

vi.mock("@/hooks/useColliderOverlay", () => ({
  useColliderOverlay: () => colliderOverlayMock,
}));

describe("Canvas overlay dispatch", () => {
  beforeEach(() => {
    resetAllStores();
    vi.clearAllMocks();
    meshOverlayMock.isInteracting.mockReturnValue(false);
    boneOverlayMock.isInteracting.mockReturnValue(false);
    ikOverlayMock.isInteracting.mockReturnValue(false);
    colliderOverlayMock.isInteracting.mockReturnValue(false);
    viewportMock.isInteracting.mockReturnValue(false);
    meshOverlayVisualModelMock.mockReset();
    meshOverlayVisualModelMock.mockReturnValue(null);
    useMultiViewStore.setState({ enabled: false } as any);
    useViewportStore.setState({
      activeTool: "select",
      onionSkin: { enabled: false, framesBefore: 3, framesAfter: 3, opacity: 0.25 },
      referenceOverlay: {
        enabled: false,
        opacity: 0.35,
        mode: "source",
        comparePrimary: "currentBounds",
        compareSecondary: "importedBounds",
        highlightDifferences: true,
        pinCompareSummary: false,
      },
    });
  });

  it("routes mesh-edit pointer down directly to mesh and viewport handlers", () => {
    const mesh = createViviMesh({ id: "mesh-a" });
    useEditorStore.setState({
      project: { ...createEmptyProject(), layers: [mesh] },
    } as any);
    useSelectionStore.setState({ selectedLayerId: mesh.id } as any);
    useViewportStore.setState({ activeTool: "meshEdit" });

    render(<Canvas />);

    fireEvent.pointerDown(screen.getByRole("application"), {
      button: 0,
      nativeEvent: { offsetX: 12, offsetY: 18 },
    } as any);

    expect(meshOverlayMock.onPointerDown).toHaveBeenCalledTimes(1);
    expect(viewportMock.onPointerDown).toHaveBeenCalledTimes(1);
    expect(colliderOverlayMock.onPointerDown).not.toHaveBeenCalled();
    expect(ikOverlayMock.onPointerDown).not.toHaveBeenCalled();
    expect(boneOverlayMock.onPointerDown).not.toHaveBeenCalled();
  });

  it("routes select-mode pointer down to the selected bone overlay only", () => {
    const bone = createBoneNode({ id: "bone-a" });
    useEditorStore.setState({
      project: { ...createEmptyProject(), layers: [bone] },
    } as any);
    useSelectionStore.setState({ selectedLayerId: bone.id } as any);

    render(<Canvas />);

    fireEvent.pointerDown(screen.getByRole("application"), {
      button: 0,
      nativeEvent: { offsetX: 20, offsetY: 24 },
    } as any);

    expect(colliderOverlayMock.onPointerDown).toHaveBeenCalledTimes(1);
    expect(ikOverlayMock.onPointerDown).toHaveBeenCalledTimes(1);
    expect(boneOverlayMock.onPointerDown).toHaveBeenCalledTimes(1);
    expect(meshOverlayMock.onPointerDown).not.toHaveBeenCalled();
    expect(viewportMock.onPointerDown).toHaveBeenCalledTimes(1);
  });

  it("routes pan pointer down to the viewport only", () => {
    const bone = createBoneNode({ id: "bone-a" });
    useEditorStore.setState({
      project: { ...createEmptyProject(), layers: [bone] },
    } as any);
    useSelectionStore.setState({ selectedLayerId: bone.id } as any);
    useViewportStore.setState({ activeTool: "pan" });

    render(<Canvas />);

    fireEvent.pointerDown(screen.getByRole("application"), {
      button: 0,
      nativeEvent: { offsetX: 20, offsetY: 24 },
    } as any);

    expect(viewportMock.onPointerDown).toHaveBeenCalledTimes(1);
    expect(colliderOverlayMock.onPointerDown).not.toHaveBeenCalled();
    expect(ikOverlayMock.onPointerDown).not.toHaveBeenCalled();
    expect(boneOverlayMock.onPointerDown).not.toHaveBeenCalled();
    expect(meshOverlayMock.onPointerDown).not.toHaveBeenCalled();
  });

  it("keeps selection svg overlays unmounted outside select mode", () => {
    const collider = {
      id: "collider-1",
      name: "Collider",
      enabled: true,
      shape: { type: "rectangle" as const, x: 10, y: 20, width: 80, height: 40 },
    };
    const ik = createIKController({ id: "ik-1", targetX: 100, targetY: 120 });
    useEditorStore.setState({
      project: createProject({ colliders: [collider], ikControllers: [ik] }),
    } as any);
    useViewportStore.setState({ activeTool: "pan" });

    render(<Canvas />);

    expect(screen.queryByTestId("selection-overlay-svg")).toBeNull();
  });

  it("mounts mesh overlay svg immediately when mesh edit is active and a visual model exists", () => {
    const mesh = createViviMesh({ id: "mesh-a" });
    useEditorStore.setState({
      project: { ...createEmptyProject(), layers: [mesh] },
    } as any);
    useSelectionStore.setState({ selectedLayerId: mesh.id } as any);
    useViewportStore.setState({ activeTool: "meshEdit" });
    meshOverlayVisualModelMock.mockReturnValue({
      layerId: mesh.id,
      mode: "vertex",
      edges: [],
      vertices: [],
      heatmapEdges: [],
      heatmapVertices: [],
      puppetFalloff: [],
      puppetPins: [],
      lassoPath: null,
    } as any);

    render(<Canvas />);

    expect(screen.getByTestId("mesh-overlay-svg")).toBeInTheDocument();
  });

  it("routes pointer move to the active mesh interaction only", () => {
    meshOverlayMock.isInteracting.mockReturnValue(true);

    render(<Canvas />);

    fireEvent.pointerMove(screen.getByRole("application"), {
      nativeEvent: { offsetX: 10, offsetY: 14 },
    } as any);

    expect(meshOverlayMock.onPointerMove).toHaveBeenCalledTimes(1);
    expect(colliderOverlayMock.onPointerMove).not.toHaveBeenCalled();
    expect(ikOverlayMock.onPointerMove).not.toHaveBeenCalled();
    expect(boneOverlayMock.onPointerMove).not.toHaveBeenCalled();
    expect(viewportMock.onPointerMove).not.toHaveBeenCalled();
  });

  it("routes pointer up to the active collider interaction only", () => {
    colliderOverlayMock.isInteracting.mockReturnValue(true);

    render(<Canvas />);

    fireEvent.pointerUp(screen.getByRole("application"));

    expect(colliderOverlayMock.onPointerUp).toHaveBeenCalledTimes(1);
    expect(meshOverlayMock.onPointerUp).not.toHaveBeenCalled();
    expect(ikOverlayMock.onPointerUp).not.toHaveBeenCalled();
    expect(boneOverlayMock.onPointerUp).not.toHaveBeenCalled();
    expect(viewportMock.onPointerUp).not.toHaveBeenCalled();
  });

  it("falls back to viewport pointer move and up when no overlay interaction is active", () => {
    viewportMock.isInteracting.mockReturnValue(true);

    render(<Canvas />);

    fireEvent.pointerMove(screen.getByRole("application"), {
      nativeEvent: { offsetX: 10, offsetY: 14 },
    } as any);
    fireEvent.pointerUp(screen.getByRole("application"));

    expect(viewportMock.onPointerMove).toHaveBeenCalledTimes(1);
    expect(viewportMock.onPointerUp).toHaveBeenCalledTimes(1);
  });
});
