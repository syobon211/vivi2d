import { describe, expect, it } from "vitest";
import { useEditorStore } from "@/stores/editorStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { createViviMesh, createGroup, createProject } from "@/test/fixtures";
import { resetAllStores } from "@/test/store-reset";

describe("selectionStore semantic role selection", () => {
  it("selects all ViviMeshes with an exact semantic role match", () => {
    resetAllStores();
    const eyeA = createViviMesh({ id: "eye-a", semanticRole: "eyeLeft" });
    const face = createViviMesh({ id: "face", semanticRole: "face" });
    const eyeB = createViviMesh({ id: "eye-b", semanticRole: "eyeLeft" });
    const group = createGroup({ id: "group-a", children: [eyeB] });
    useEditorStore.setState({ project: createProject({ layers: [eyeA, face, group] }) });

    useSelectionStore.getState().selectLayersBySemanticRole("eyeLeft");

    expect(useSelectionStore.getState().selectedLayerIds).toEqual(["eye-a", "eye-b"]);
    expect(useSelectionStore.getState().selectedLayerId).toBe("eye-a");
  });

  it("preserves the preferred primary selection when it is included", () => {
    resetAllStores();
    const eyeA = createViviMesh({ id: "eye-a", semanticRole: "eyeLeft" });
    const eyeB = createViviMesh({ id: "eye-b", semanticRole: "eyeLeft" });
    useEditorStore.setState({ project: createProject({ layers: [eyeA, eyeB] }) });

    useSelectionStore.getState().selectLayersBySemanticRole("eyeLeft", "eye-b");

    expect(useSelectionStore.getState().selectedLayerIds).toEqual(["eye-a", "eye-b"]);
    expect(useSelectionStore.getState().selectedLayerId).toBe("eye-b");
  });

  it("skips non-viviMesh layers and leaves selection unchanged when no match exists", () => {
    resetAllStores();
    const group = createGroup({ id: "group-a" });
    const face = createViviMesh({ id: "face", semanticRole: "face" });
    useEditorStore.setState({ project: createProject({ layers: [group, face] }) });
    useSelectionStore.getState().selectLayer("face");

    useSelectionStore.getState().selectLayersBySemanticRole("mouth");

    expect(useSelectionStore.getState().selectedLayerIds).toEqual(["face"]);
    expect(useSelectionStore.getState().selectedLayerId).toBe("face");
  });
});
