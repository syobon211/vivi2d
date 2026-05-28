import { act, fireEvent, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  mergeVertices,
  mirrorMesh,
  retriangulateMesh,
} from "@vivi2d/core/mesh-operations";
import type { MeshData } from "@vivi2d/core/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useI18nStore } from "@/lib/i18n";
import { useDefaultFormLock } from "@/hooks/useDefaultFormLock";
import { useEditorStore } from "@/stores/editorStore";
import { useMeshEditStore } from "@/stores/meshEditStore";
import { usePuppetWarpStore } from "@/stores/puppetWarpStore";
import { createViviMesh } from "@/test/fixtures";
import { setupTestProject } from "@/test/helpers";
import { resetAllStores } from "@/test/store-reset";
import { MeshProperties } from "../properties/MeshProperties";

vi.mock("@vivi2d/core/mesh-operations", () => ({
  mergeVertices: vi.fn(),
  mirrorMesh: vi.fn(),
  retriangulateMesh: vi.fn(),
}));

vi.mock("@/hooks/useDefaultFormLock", () => ({
  useDefaultFormLock: vi.fn(() => false),
}));

function renderMeshProperties() {
  const layer = createViviMesh({ name: "Mesh Layer" });
  setupTestProject({ layers: [layer] });
  const view = render(<MeshProperties layer={layer} />);
  return { layer, ...view };
}

function createMeshResult(partial: Partial<MeshData> = {}): MeshData {
  return {
    vertices: [0, 0, 10, 0, 10, 10],
    uvs: [0, 0, 1, 0, 1, 1],
    indices: [0, 1, 2],
    divisionsX: 2,
    divisionsY: 2,
    ...partial,
  };
}

describe("MeshProperties additional coverage", () => {
  beforeEach(() => {
    useI18nStore.getState().setLocale("en");
    resetAllStores();
    vi.clearAllMocks();
    vi.mocked(useDefaultFormLock).mockReturnValue(false);
  });

  afterEach(() => {
    resetAllStores();
    vi.restoreAllMocks();
  });

  it("merges selected vertices and clears the selection when the operation succeeds", async () => {
    const user = userEvent.setup();
    const setMeshData = vi.fn();
    const clearSelection = vi.fn();
    const mergedMesh = createMeshResult();
    const { getByRole, layer } = renderMeshProperties();

    act(() => {
      useEditorStore.setState({ setMeshData } as never);
      useMeshEditStore.setState({
        selectedVertices: [0, 1],
        clearSelection,
      } as never);
    });
    vi.mocked(mergeVertices).mockReturnValue(mergedMesh);

    await user.click(getByRole("button", { name: "Merge vertices" }));

    expect(mergeVertices).toHaveBeenCalledWith(layer.mesh, [0, 1]);
    expect(setMeshData).toHaveBeenCalledWith(layer.id, mergedMesh);
    expect(clearSelection).toHaveBeenCalledOnce();
  });

  it("does not mutate the mesh when mergeVertices returns null", async () => {
    const user = userEvent.setup();
    const setMeshData = vi.fn();
    const clearSelection = vi.fn();
    const { getByRole } = renderMeshProperties();

    act(() => {
      useEditorStore.setState({ setMeshData } as never);
      useMeshEditStore.setState({
        selectedVertices: [0, 1],
        clearSelection,
      } as never);
    });
    vi.mocked(mergeVertices).mockReturnValue(null);

    await user.click(getByRole("button", { name: "Merge vertices" }));

    expect(setMeshData).not.toHaveBeenCalled();
    expect(clearSelection).not.toHaveBeenCalled();
  });

  it("retriangulates and mirrors the mesh through the editor actions", async () => {
    const user = userEvent.setup();
    const setMeshData = vi.fn();
    const retriangulated = createMeshResult({ divisionsX: 4 });
    const mirroredX = createMeshResult({ divisionsY: 4 });
    const mirroredY = createMeshResult({ indices: [0, 2, 1] });
    const { getByRole, layer } = renderMeshProperties();

    act(() => {
      useEditorStore.setState({ setMeshData } as never);
    });
    vi.mocked(retriangulateMesh).mockReturnValue(retriangulated);
    vi.mocked(mirrorMesh)
      .mockReturnValueOnce(mirroredX)
      .mockReturnValueOnce(mirroredY);

    await user.click(getByRole("button", { name: "Retriangulate" }));
    await user.click(getByRole("button", { name: "Mirror X" }));
    await user.click(getByRole("button", { name: "Mirror Y" }));

    expect(retriangulateMesh).toHaveBeenCalledWith(
      layer.mesh,
      layer.width,
      layer.height,
    );
    expect(mirrorMesh).toHaveBeenNthCalledWith(
      1,
      layer.mesh,
      "x",
      layer.width,
      layer.height,
    );
    expect(mirrorMesh).toHaveBeenNthCalledWith(
      2,
      layer.mesh,
      "y",
      layer.width,
      layer.height,
    );
    expect(setMeshData).toHaveBeenNthCalledWith(1, layer.id, retriangulated);
    expect(setMeshData).toHaveBeenNthCalledWith(2, layer.id, mirroredX);
    expect(setMeshData).toHaveBeenNthCalledWith(3, layer.id, mirroredY);
  });

  it("clamps division inputs before dispatching setMeshDivisions", () => {
    const { container, layer } = renderMeshProperties();
    const setMeshDivisions = vi.fn();
    act(() => {
      useEditorStore.setState({ setMeshDivisions } as never);
    });

    const inputs =
      container.querySelectorAll<HTMLInputElement>(".prop-input-sm");
    fireEvent.change(inputs[0]!, { target: { value: "0" } });
    fireEvent.change(inputs[1]!, { target: { value: "99" } });

    expect(setMeshDivisions).toHaveBeenNthCalledWith(
      1,
      layer.id,
      1,
      layer.mesh.divisionsY,
    );
    expect(setMeshDivisions).toHaveBeenNthCalledWith(
      2,
      layer.id,
      layer.mesh.divisionsX,
      20,
    );
  });

  it("disables mesh actions when the default form is locked", () => {
    vi.mocked(useDefaultFormLock).mockReturnValue(true);
    const { container } = renderMeshProperties();

    expect(
      container.querySelector<HTMLButtonElement>(".auto-mesh-btn"),
    ).toBeDisabled();
    for (const input of container.querySelectorAll<HTMLInputElement>(
      ".prop-input-sm",
    )) {
      expect(input).toBeDisabled();
    }
    for (const button of container.querySelectorAll<HTMLButtonElement>(
      ".mesh-op-btn",
    )) {
      expect(button).toBeDisabled();
    }
  });

  it("toggles puppet mode and creates handle pins from the selected vertices", async () => {
    const user = userEvent.setup();
    const { getByRole, layer } = renderMeshProperties();

    expect(usePuppetWarpStore.getState().mode).toBe("vertex");
    await user.click(getByRole("button", { name: "Puppet" }));
    expect(usePuppetWarpStore.getState().mode).toBe("puppet");

    act(() => {
      useMeshEditStore.setState({ selectedVertices: [0, 1] });
    });

    await user.click(getByRole("button", { name: "Create handles" }));

    const pins = usePuppetWarpStore.getState().pinsByMeshId[layer.id] ?? [];
    expect(pins).toHaveLength(2);
    expect(pins.every((pin) => pin.kind === "handle")).toBe(true);
  });

  it("groups and deletes the selected pins", async () => {
    const user = userEvent.setup();
    const { getByRole, layer } = renderMeshProperties();

    act(() => {
      usePuppetWarpStore.setState({ mode: "puppet" });
      useMeshEditStore.setState({ selectedVertices: [0, 1] });
    });

    await user.click(getByRole("button", { name: "Create anchors" }));
    await user.click(getByRole("button", { name: "Group selected pins" }));

    expect(usePuppetWarpStore.getState().groupsByMeshId[layer.id]).toHaveLength(
      1,
    );

    await user.click(getByRole("button", { name: "Delete selected pins" }));

    expect(
      usePuppetWarpStore.getState().pinsByMeshId[layer.id] ?? [],
    ).toHaveLength(0);
    expect(
      usePuppetWarpStore.getState().groupsByMeshId[layer.id] ?? [],
    ).toHaveLength(0);
  });

  it("updates symmetry and falloff controls for the selected pins", async () => {
    const user = userEvent.setup();
    const { getByLabelText, getByRole, layer } = renderMeshProperties();

    act(() => {
      usePuppetWarpStore.setState({ mode: "puppet" });
    });

    const pinId = usePuppetWarpStore.getState().addPin(layer.id, 0, "handle", {
      radius: 40,
      strength: 1,
      curve: "smoothstep",
    });
    expect(pinId).not.toBeNull();

    act(() => {
      usePuppetWarpStore.getState().setSelectedPins([pinId!]);
    });

    await user.click(getByLabelText("Enable symmetry"));
    expect(usePuppetWarpStore.getState().symmetryEnabled).toBe(true);

    const toleranceInput = getByLabelText("Symmetry tolerance");
    fireEvent.change(toleranceInput, { target: { value: "9" } });
    expect(usePuppetWarpStore.getState().symmetryTolerance).toBe(9);

    const radiusInput = getByLabelText("Selected pin radius");
    fireEvent.change(radiusInput, { target: { value: "72" } });

    const strengthInput = getByLabelText("Selected pin strength");
    fireEvent.change(strengthInput, { target: { value: "1.5" } });

    await user.selectOptions(getByLabelText("Selected pin curve"), "gaussian");

    const pin = (usePuppetWarpStore.getState().pinsByMeshId[layer.id] ?? [])[0];
    expect(pin).toMatchObject({
      radius: 72,
      strength: 1.5,
      curve: "gaussian",
    });

    await user.click(getByRole("button", { name: "Vertex" }));
    expect(usePuppetWarpStore.getState().mode).toBe("vertex");
  });

});
