import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { MeshProperties } from "@/components/properties/MeshProperties";
import { useI18nStore } from "@/lib/i18n";
import { useEditorStore } from "@/stores/editorStore";
import { useViewportStore } from "@/stores/viewportStore";
import { createProject, createViviMesh } from "@/test/fixtures";
import { resetAllStores } from "@/test/store-reset";

describe("MeshProperties heatmap debug", () => {
  beforeEach(() => {
    useI18nStore.getState().setLocale("en");
    resetAllStores();
  });

  it("toggles the mesh heatmap and updates its intensity", () => {
    const mesh = createViviMesh({ id: "mesh-heatmap" });
    useEditorStore.setState({ project: createProject({ layers: [mesh] }) });

    render(<MeshProperties layer={mesh} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Enable mesh heatmap" }));

    expect(useViewportStore.getState().meshHeatmap.enabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Mesh heatmap intensity"), {
      target: { value: "1.75" },
    });
    expect(useViewportStore.getState().meshHeatmap.intensity).toBe(1.75);
  });
});
