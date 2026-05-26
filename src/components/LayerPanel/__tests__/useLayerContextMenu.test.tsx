import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useArtPathStore } from "@/stores/artPathStore";
import { useBoneStore } from "@/stores/boneStore";
import { useLayerContextMenu } from "../useLayerContextMenu";

describe("useLayerContextMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens and closes the context menu", () => {
    const { result } = renderHook(() => useLayerContextMenu("Bone", "Art Path"));
    const preventDefault = vi.fn();
    const layer = {
      id: "mesh-1",
      kind: "viviMesh",
      x: 10,
      y: 20,
      width: 100,
      height: 60,
      children: [],
    } as any;

    act(() => {
      result.current.openContextMenu(
        { preventDefault, clientX: 80, clientY: 90 } as any,
        layer,
      );
    });

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(result.current.contextMenu).toMatchObject({
      x: 80,
      y: 90,
      layerId: "mesh-1",
    });

    act(() => {
      result.current.closeContextMenu();
    });
    expect(result.current.contextMenu).toBeNull();
  });

  it("adds a bone at the layer center and closes the menu", () => {
    const addBone = vi.fn();
    vi.spyOn(useBoneStore, "getState").mockReturnValue({
      ...useBoneStore.getState(),
      addBone,
    } as ReturnType<typeof useBoneStore.getState>);
    const { result } = renderHook(() => useLayerContextMenu("Bone", "Art Path"));
    const layer = {
      id: "mesh-1",
      kind: "viviMesh",
      x: 10,
      y: 20,
      width: 100,
      height: 60,
      children: [],
    } as any;

    act(() => {
      result.current.openContextMenu(
        { preventDefault() {}, clientX: 0, clientY: 0 } as any,
        layer,
      );
    });

    act(() => {
      result.current.handleAddBone();
    });

    expect(addBone).toHaveBeenCalledWith("mesh-1", "Bone", 60, 50);
    expect(result.current.contextMenu).toBeNull();
  });

  it("adds an art path and closes the menu", () => {
    const addArtPath = vi.fn();
    vi.spyOn(useArtPathStore, "getState").mockReturnValue({
      ...useArtPathStore.getState(),
      addArtPath,
    } as ReturnType<typeof useArtPathStore.getState>);
    const { result } = renderHook(() => useLayerContextMenu("Bone", "Art Path"));
    const layer = {
      id: "mesh-2",
      kind: "viviMesh",
      x: 0,
      y: 0,
      width: 80,
      height: 40,
      children: [],
    } as any;

    act(() => {
      result.current.openContextMenu(
        { preventDefault() {}, clientX: 0, clientY: 0 } as any,
        layer,
      );
    });

    act(() => {
      result.current.handleAddArtPath();
    });
    expect(addArtPath).toHaveBeenCalledWith("Art Path", 40, 20);
    expect(result.current.contextMenu).toBeNull();
  });

  it("deletes only bone layers and always closes the menu", () => {
    const removeBone = vi.fn();
    vi.spyOn(useBoneStore, "getState").mockReturnValue({
      ...useBoneStore.getState(),
      removeBone,
    } as ReturnType<typeof useBoneStore.getState>);
    const { result } = renderHook(() => useLayerContextMenu("Bone", "Art Path"));
    const boneLayer = {
      id: "bone-1",
      kind: "bone",
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      children: [],
    } as any;
    const meshLayer = {
      id: "mesh-1",
      kind: "viviMesh",
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      children: [],
    } as any;

    act(() => {
      result.current.openContextMenu(
        { preventDefault() {}, clientX: 0, clientY: 0 } as any,
        boneLayer,
      );
    });

    act(() => {
      result.current.handleDelete();
    });
    expect(removeBone).toHaveBeenCalledWith("bone-1");
    expect(result.current.contextMenu).toBeNull();

    act(() => {
      result.current.openContextMenu(
        { preventDefault() {}, clientX: 0, clientY: 0 } as any,
        meshLayer,
      );
    });

    act(() => {
      result.current.handleDelete();
    });
    expect(removeBone).toHaveBeenCalledTimes(1);
    expect(result.current.contextMenu).toBeNull();
  });
});
