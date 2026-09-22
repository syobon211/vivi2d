import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MeshProperties } from "@/components/properties/MeshProperties";
import { useI18nStore } from "@/lib/i18n";
import { useEditorStore } from "@/stores/editorStore";
import { useHistoryStore } from "@/stores/historyStore";
import { useMeshEditStore } from "@/stores/meshEditStore";
import { createProject, createViviMesh } from "@/test/fixtures";
import { resetAllStores } from "@/test/store-reset";

describe("MeshProperties v11 atlas selection", () => {
  beforeEach(() => {
    resetAllStores();
    useEditorStore.setState({ projectV11: null });
    useI18nStore.getState().setLocale("en");
  });
  afterEach(() => {
    cleanup();
    useEditorStore.setState({ projectV11: null });
    resetAllStores();
  });

  it("initializes raw UV on multi-to-single selection and untouched Apply is a no-op", () => {
    const layer = createViviMesh({
      mesh: {
        vertices: [0, 0, 1, 0, 0, 1],
        uvs: [0.6, 0.4, 1, 0, 0, 1],
        indices: [0, 1, 2],
        divisionsX: 0,
        divisionsY: 0,
      },
    });
    const atlas = { id: "atlas" };
    // Presentation-only session shape; not a PNG/admission fixture. Untouched
    // Apply calls the real UV action/mutator and must return before a transaction.
    const session = {
      revision: {
        atlases: [atlas],
        entry: () => ({
          atlas,
          entry: { layerId: layer.id, x: 0, y: 0, width: 1, height: 1 },
        }),
      },
    } as unknown as NonNullable<ReturnType<typeof useEditorStore.getState>["projectV11"]>;
    useEditorStore.setState({
      project: createProject({ layers: [layer] }),
      projectV11: session,
    });
    useMeshEditStore.setState({ selectedVertices: [0, 1] });
    render(<MeshProperties layer={layer} />);
    expect(screen.queryByLabelText("v11 u")).not.toBeInTheDocument();

    act(() => useMeshEditStore.setState({ selectedVertices: [0] }));
    expect(screen.getByLabelText("v11 u")).toHaveValue(0.6);
    expect(screen.getByLabelText("v11 v")).toHaveValue(0.4);
    const before = useEditorStore.getState();
    const history = useHistoryStore.getState();
    const editorWrite = vi.fn(),
      historyWrite = vi.fn();
    const offEditor = useEditorStore.subscribe(editorWrite);
    const offHistory = useHistoryStore.subscribe(historyWrite);
    try {
      fireEvent.click(screen.getByRole("button", { name: "Apply UV" }));
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(useEditorStore.getState()).toBe(before);
      expect(useHistoryStore.getState()).toBe(history);
      expect(editorWrite).not.toHaveBeenCalled();
      expect(historyWrite).not.toHaveBeenCalled();
      expect(layer.mesh.uvs).toEqual([0.6, 0.4, 1, 0, 0, 1]);
    } finally {
      offEditor();
      offHistory();
    }
  });
});
