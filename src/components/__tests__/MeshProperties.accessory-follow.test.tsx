import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useI18nStore } from "@/lib/i18n";
import { MeshProperties } from "@/components/properties/MeshProperties";
import { useEditorStore } from "@/stores/editorStore";
import { createViviMesh, createBoneNode, createProject } from "@/test/fixtures";
import { resetEditorStore, resetSkinStore } from "@/test/store-reset";

describe("MeshProperties accessory follow", () => {
  beforeEach(() => {
    useI18nStore.getState().setLocale("en");
    resetEditorStore();
    resetSkinStore();
  });

  it("creates an accessory follow rig for the selected mesh", () => {
    const bone = createBoneNode({ id: "bone-follow", name: "Follow Bone" });
    const mesh = createViviMesh({ id: "mesh-follow", name: "Accessory Mesh" });
    useEditorStore.setState({
      project: createProject({ layers: [bone, mesh], skins: {} }),
    });

    render(<MeshProperties layer={mesh} />);
    fireEvent.click(screen.getByRole("button", { name: "Create accessory follow rig" }));

    expect(
      screen.getByText("Created a managed accessory follow rig."),
    ).toBeInTheDocument();
    expect(useEditorStore.getState().project?.skins[mesh.id]?.managedTag).toBe(
      "accessoryFollowRig:v1:mesh=mesh-follow",
    );
  });

  it("shows a clear message when an unmanaged skin already exists", () => {
    const bone = createBoneNode({ id: "bone-follow", name: "Follow Bone" });
    const mesh = createViviMesh({ id: "mesh-follow", name: "Accessory Mesh" });
    useEditorStore.setState({
      project: createProject({
        layers: [bone, mesh],
        skins: {
          [mesh.id]: {
            weights: [[{ boneId: bone.id, weight: 1 }]],
            bindPoseInverse: { [bone.id]: [1, 0, 0, 1, 0, 0] },
          },
        },
      }),
    });

    render(<MeshProperties layer={mesh} />);
    fireEvent.click(screen.getByRole("button", { name: "Create accessory follow rig" }));

    expect(
      screen.getByText(
        "This mesh already has a skin. Use Skin Properties to unbind it before creating accessory follow.",
      ),
    ).toBeInTheDocument();
  });
});
