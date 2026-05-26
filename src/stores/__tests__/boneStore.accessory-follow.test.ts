import { beforeEach, describe, expect, it } from "vitest";
import { useBoneStore } from "@/stores/boneStore";
import { useEditorStore } from "@/stores/editorStore";
import { _resetMergeTimer } from "@/stores/historyStore";
import { createViviMesh, createBoneNode, createProject } from "@/test/fixtures";
import {
  resetEditorStore,
  resetHistoryStore,
  resetSelectionStore,
} from "@/test/store-reset";

beforeEach(() => {
  resetEditorStore();
  resetSelectionStore();
  resetHistoryStore();
  _resetMergeTimer();
});

describe("boneStore accessory follow cleanup", () => {
  it("removes managed accessory follow skins that reference the deleted bone", () => {
    const bone = createBoneNode({ id: "bone-follow", name: "Follow Bone" });
    const mesh = createViviMesh({ id: "mesh-follow", name: "Accessory Mesh" });
    useEditorStore.setState({
      project: createProject({
        layers: [bone, mesh],
        skins: {
          [mesh.id]: {
            managedTag: `accessoryFollowRig:v1:mesh=${mesh.id}`,
            managedSignature: `${mesh.id}|${bone.id}|16`,
            weights: Array.from({ length: 8 }, () => [{ boneId: bone.id, weight: 1 }]),
            bindPoseInverse: { [bone.id]: [1, 0, 0, 1, 0, 0] },
          },
        },
      }),
    });

    useBoneStore.getState().removeBone(bone.id);

    expect(useEditorStore.getState().project?.skins?.[mesh.id]).toBeUndefined();
  });
});
