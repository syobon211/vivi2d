import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useI18nStore } from "@/lib/i18n";
import { MeshProperties } from "@/components/properties/MeshProperties";
import { useEditorStore } from "@/stores/editorStore";
import { useMeshEditStore } from "@/stores/meshEditStore";
import { usePuppetWarpStore } from "@/stores/puppetWarpStore";
import { createViviMesh, createProject } from "@/test/fixtures";
import {
  resetEditorStore,
  resetMeshEditStore,
  resetPuppetWarpStore,
  resetSkinStore,
} from "@/test/store-reset";

describe("MeshProperties soft region helper", () => {
  beforeEach(() => {
    useI18nStore.getState().setLocale("en");
    resetEditorStore();
    resetMeshEditStore();
    resetPuppetWarpStore();
    resetSkinStore();
  });

  it("creates a managed soft region helper from selected vertices", () => {
    const mesh = createViviMesh({ id: "mesh-soft", name: "Soft Mesh" });
    useEditorStore.setState({ project: createProject({ layers: [mesh] }) });
    useMeshEditStore.setState({ selectedVertices: [0, 3, 5, 12, 15] });

    render(<MeshProperties layer={mesh} />);
    fireEvent.click(screen.getByRole("button", { name: "Create soft region helper" }));

    expect(screen.getByText("Created a managed soft region helper.")).toBeInTheDocument();
    expect(usePuppetWarpStore.getState().groupsByMeshId[mesh.id]).toHaveLength(1);
  });

  it("shows a clear message for underspecified selections", () => {
    const mesh = createViviMesh({ id: "mesh-soft", name: "Soft Mesh" });
    useEditorStore.setState({ project: createProject({ layers: [mesh] }) });
    useMeshEditStore.setState({ selectedVertices: [0, 1] });

    render(<MeshProperties layer={mesh} />);
    expect(
      screen.getByRole("button", { name: "Create soft region helper" }),
    ).toBeDisabled();
  });
});
