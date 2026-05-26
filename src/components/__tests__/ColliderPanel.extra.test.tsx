import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { ColliderPanel } from "@/components/ColliderPanel";
import { clearTextures } from "@/lib/texture-store";
import { useColliderStore } from "@/stores/colliderStore";
import { useEditorStore } from "@/stores/editorStore";
import { loadPsdFromBuffer } from "@/stores/projectIO";
import { useSelectionStore } from "@/stores/selectionStore";
import {
  resetColliderStore,
  resetEditorStore,
  resetSelectionStore,
} from "@/test/store-reset";

describe("ColliderPanel additional coverage", () => {
  beforeEach(() => {
    resetEditorStore();
    resetColliderStore();
    resetSelectionStore();
    clearTextures();
    loadPsdFromBuffer(new ArrayBuffer(0), "test.psd");
  });

  it("adds a mesh collider from the current selection and shows the mesh badge", () => {
    const colliderState = useColliderStore.getState();
    const selectedLayer = useEditorStore.getState().project?.layers[0];
    const selectedLayerId = selectedLayer?.id;
    if (!selectedLayerId) throw new Error("Expected a mesh layer in the loaded PSD");
    useSelectionStore.setState({ selectedLayerIds: [selectedLayerId] });

    render(<ColliderPanel />);
    fireEvent.click(screen.getByRole("button", { name: /メッシュから追加/i }));

    expect(colliderState.selectedColliderId).toBeNull();
    expect(useEditorStore.getState().project?.colliders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: selectedLayer?.name,
          shape: expect.objectContaining({ type: "mesh", meshId: selectedLayerId }),
        }),
      ]),
    );
    expect(
      screen.getByText(selectedLayer?.name ?? "", { selector: ".collider-shape-badge" }),
    ).toBeVisible();
  });

  it("uses Home and End to move focus within the collider list", () => {
    useColliderStore.getState().addRectCollider("First", 0, 0, 10, 10);
    useColliderStore.getState().addRectCollider("Second", 10, 10, 10, 10);
    useColliderStore.getState().addRectCollider("Third", 20, 20, 10, 10);

    render(<ColliderPanel />);

    const options = screen.getAllByRole("option");
    const listbox = screen.getByRole("listbox");

    options[1]!.focus();
    fireEvent.keyDown(listbox, { key: "End" });
    expect(options[2]).toHaveFocus();

    fireEvent.keyDown(listbox, { key: "Home" });
    expect(options[0]).toHaveFocus();
  });

  it("cancels inline tag editing with Escape without mutating the tag", () => {
    useColliderStore.getState().addRectCollider("Tagged", 0, 0, 10, 10);

    render(<ColliderPanel />);
    fireEvent.click(screen.getByText(/タグなし/i));

    const tagInput = screen.getByRole("textbox");
    fireEvent.change(tagInput, { target: { value: "head" } });
    fireEvent.keyDown(tagInput, { key: "Escape" });

    expect(screen.getByText(/タグなし/i)).toBeVisible();
    expect(screen.queryByText("#head")).not.toBeInTheDocument();
  });
});
