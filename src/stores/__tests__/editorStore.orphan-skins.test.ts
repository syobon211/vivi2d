import { describe, expect, it } from "vitest";
import { useEditorStore } from "@/stores/editorStore";
import { createViviMesh, createProject } from "@/test/fixtures";
import { resetAllStores } from "@/test/store-reset";

describe("editorStore orphan skin cleanup", () => {
  it("removes only skins that reference missing layers", () => {
    resetAllStores();
    const mesh = createViviMesh({ id: "mesh-a" });
    useEditorStore.setState({
      project: createProject({
        layers: [mesh],
        skins: {
          [mesh.id]: { weights: [], bindPoseInverse: {} },
          ghost: { weights: [], bindPoseInverse: {} },
        },
      }),
    });

    useEditorStore.getState().cleanupOrphanSkins();

    expect(useEditorStore.getState().project?.skins).toEqual({
      [mesh.id]: { weights: [], bindPoseInverse: {} },
    });
  });
});
