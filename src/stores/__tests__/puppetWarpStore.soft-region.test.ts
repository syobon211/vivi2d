import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "@/stores/editorStore";
import { usePuppetWarpStore } from "@/stores/puppetWarpStore";
import { createViviMesh, createProject } from "@/test/fixtures";
import {
  resetEditorStore,
  resetMeshEditStore,
  resetPuppetWarpStore,
} from "@/test/store-reset";

describe("puppetWarpStore soft region helper", () => {
  beforeEach(() => {
    resetEditorStore();
    resetMeshEditStore();
    resetPuppetWarpStore();
  });

  it("creates a managed soft region group", () => {
    const mesh = createViviMesh({ id: "mesh-soft", name: "Soft Mesh" });
    useEditorStore.setState({ project: createProject({ layers: [mesh] }) });

    const result = usePuppetWarpStore
      .getState()
      .applySoftRegionHelper(mesh.id, [0, 3, 5, 12, 15], "generic");

    expect(result.status).toBe("created");
    const groups = usePuppetWarpStore.getState().groupsByMeshId[mesh.id]!;
    expect(groups).toHaveLength(1);
    expect(groups[0]!.managedTag).toBe("softRegionDeformer:v1");
    expect(groups[0]!.managedSignature).toBe("mesh-soft|generic|0,3,5,12,15");
    expect(groups[0]!.pinIds).toHaveLength(4);
  });

  it("updates the existing managed group when the signature matches", () => {
    const mesh = createViviMesh({ id: "mesh-soft", name: "Soft Mesh" });
    useEditorStore.setState({ project: createProject({ layers: [mesh] }) });
    const store = usePuppetWarpStore.getState();

    const first = store.applySoftRegionHelper(mesh.id, [0, 3, 5, 12, 15], "generic");
    const second = store.applySoftRegionHelper(mesh.id, [0, 3, 5, 12, 15], "generic");

    expect(first.status).toBe("created");
    expect(second.status).toBe("updated");
    if (first.status !== "rejected" && second.status !== "rejected") {
      expect(second.groupId).toBe(first.groupId);
    }
  });

  it("rejects when another pin already occupies a planned vertex", () => {
    const mesh = createViviMesh({ id: "mesh-soft", name: "Soft Mesh" });
    useEditorStore.setState({ project: createProject({ layers: [mesh] }) });
    const store = usePuppetWarpStore.getState();
    store.addPin(mesh.id, 0, "handle");

    const result = store.applySoftRegionHelper(mesh.id, [0, 3, 5, 12, 15], "generic");

    expect(result).toEqual({ status: "rejected", reason: "occupiedByOtherPin" });
  });
});
