import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { SelectionOverlaySvgHost } from "@/components/SelectionOverlaySvgHost";
import { useColliderStore } from "@/stores/colliderStore";
import { useEditorStore } from "@/stores/editorStore";
import { useIKRuntimeStore } from "@/stores/ikRuntimeStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { useViewportStore } from "@/stores/viewportStore";
import {
  createViviMesh,
  createBoneNode,
  createIKController,
  createProject,
} from "@/test/fixtures";
import { resetAllStores } from "@/test/store-reset";

describe("SelectionOverlaySvgHost", () => {
  beforeEach(() => {
    resetAllStores();
  });

  it("renders collider and IK selection overlays in select mode", () => {
    const collider = {
      id: "collider-1",
      name: "Collider",
      enabled: true,
      shape: { type: "rectangle" as const, x: 10, y: 20, width: 80, height: 40 },
    };
    const ik = createIKController({ id: "ik-1", targetX: 100, targetY: 120 });
    useEditorStore.setState({
      project: createProject({ colliders: [collider], ikControllers: [ik] }),
    });
    useColliderStore.setState({ selectedColliderId: collider.id });
    useIKRuntimeStore.getState().setRuntimeTarget(ik.id, 200, 220);
    useViewportStore.setState({ activeTool: "select", zoom: 1, panX: 0, panY: 0 });

    render(<SelectionOverlaySvgHost />);

    expect(screen.getByTestId("selection-overlay-svg")).toBeInTheDocument();
    expect(
      screen.getByTestId("selection-overlay-collider-collider-1"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("selection-overlay-ik-ik-1")).toBeInTheDocument();
  });

  it("renders bone overlays and highlights the selected bone", () => {
    const bone = createBoneNode({ id: "bone-1" });
    const childBone = createBoneNode({ id: "bone-2", x: 40 });
    bone.children = [childBone];
    useEditorStore.setState({
      project: createProject({ layers: [bone] }),
    });
    useSelectionStore.setState({ selectedLayerId: childBone.id });
    useViewportStore.setState({ activeTool: "select", zoom: 1, panX: 0, panY: 0 });

    render(<SelectionOverlaySvgHost />);

    expect(screen.getByTestId("selection-overlay-bone-bone-1")).toBeInTheDocument();
    expect(screen.getByTestId("selection-overlay-bone-bone-2")).toBeInTheDocument();
  });

  it("skips bone overlays when a regular ViviMesh is selected", () => {
    const viviMesh = createViviMesh({ id: "mesh-1" });
    const bone = createBoneNode({ id: "bone-1" });
    useEditorStore.setState({
      project: createProject({ layers: [viviMesh, bone] }),
    });
    useSelectionStore.setState({ selectedLayerId: viviMesh.id });
    useViewportStore.setState({ activeTool: "select", zoom: 1, panX: 0, panY: 0 });

    const { container } = render(<SelectionOverlaySvgHost />);

    expect(container.firstChild).toBeNull();
  });

  it("renders mounted overlays independently from tool gating", () => {
    const collider = {
      id: "collider-1",
      name: "Collider",
      enabled: true,
      shape: { type: "rectangle" as const, x: 10, y: 20, width: 80, height: 40 },
    };
    useEditorStore.setState({
      project: createProject({ colliders: [collider] }),
    });
    useColliderStore.setState({ selectedColliderId: collider.id });

    render(<SelectionOverlaySvgHost />);

    expect(
      screen.getByTestId("selection-overlay-collider-collider-1"),
    ).toBeInTheDocument();
  });
});
