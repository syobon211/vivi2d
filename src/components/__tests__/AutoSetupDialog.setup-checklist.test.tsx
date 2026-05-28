import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useI18nStore } from "@/lib/i18n";
import { useEditorStore } from "@/stores/editorStore";
import { useQuickActionRegistryStore } from "@/stores/quickActionRegistryStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { useWorkspaceModeStore } from "@/stores/workspaceModeStore";
import { createViviMesh, createBoneNode, createProject } from "@/test/fixtures";
import { resetAllStores } from "@/test/store-reset";
import { AutoSetupDialog } from "../AutoSetupDialog";

function createImportedMesh(id: string, label: string, semanticRole?: string) {
  return createViviMesh({
    id,
    name: id,
    semanticRole: semanticRole as never,
    importMetadata: {
      source: "seeThrough",
      seeThrough: {
        label,
        order: 0,
        bbox: [0, 0, 64, 64],
        confidence: 0.95,
        leftRightSplit: "center",
        frontBackSplit: "middle",
        depthStats: { min: 0.1, max: 0.2, mean: 0.15 },
      },
    },
  });
}

describe("AutoSetupDialog setup checklist", () => {
  beforeEach(() => {
    useI18nStore.getState().setLocale("en");
    resetAllStores();
  });

  it("shows the setup checklist for see-through projects", () => {
    const project = createProject({
      layers: [
        createImportedMesh("eye-white-left", "eye_white_left", "eyeLeft"),
        createImportedMesh("iris-left", "iris_left", "eyeLeft"),
        createImportedMesh("mouth", "mouth", "mouth"),
      ],
    });
    useEditorStore.setState({ project });

    render(<AutoSetupDialog onClose={() => {}} />);

    expect(
      screen.getByText(/Setup checklist|セットアップチェックリスト/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Ready to Rig cleanup:/)).toBeInTheDocument();
    expect(screen.getByText(/Depth review:/)).toBeInTheDocument();
    expect(screen.getByText(/Eye rig:/)).toBeInTheDocument();
    expect(screen.getByText(/Mouth rig:/)).toBeInTheDocument();
  });

  it("runs the checklist mouth-rig action from the matching item", async () => {
    const user = userEvent.setup();
    const project = createProject({
      layers: [
        createImportedMesh("eye-white-left", "eye_white_left", "eyeLeft"),
        createImportedMesh("iris-left", "iris_left", "eyeLeft"),
        createImportedMesh("mouth", "mouth", "mouth"),
      ],
    });
    useEditorStore.setState({ project });

    render(<AutoSetupDialog onClose={() => {}} />);

    const mouthItem = screen.getByText(/Mouth rig:/).closest("li");
    expect(mouthItem).not.toBeNull();

    await user.click(
      within(mouthItem as HTMLElement).getByRole("button", {
        name: /Create basic mouth rig \((setup checklist|セットアップチェックリスト)\)/,
      }),
    );

    await waitFor(() => {
      expect(
        screen.getByText(
          /1 (mouth parameter\(s\) created\.|件の口パラメータを作成しました。)/,
        ),
      ).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(
        within(mouthItem as HTMLElement).queryByRole("button", {
          name: /Create basic mouth rig \((setup checklist|セットアップチェックリスト)\)/,
        }),
      ).toBeNull();
    });
  });

  it("runs the checklist mesh-refinement action with occlusion-aware preset overrides", async () => {
    const user = userEvent.setup();
    const setAutoMeshBatch = vi.fn();
    const project = createProject({
      layers: [
        createImportedMesh("eye-left", "eye_left", "eyeLeft"),
        createImportedMesh("hair-back", "hair_back", "hairBack"),
        createImportedMesh("body", "body", "body"),
      ],
    });
    for (const layer of project.layers) {
      if ("mesh" in layer) {
        layer.mesh.vertices = [0, 0, 64, 0, 64, 64, 0, 64];
      }
    }
    useEditorStore.setState({ project, setAutoMeshBatch: setAutoMeshBatch as never });

    render(<AutoSetupDialog onClose={() => {}} />);

    await user.click(screen.getByRole("button", { name: /Advanced|詳細/ }));
    const meshItem = screen.getByText(/Mesh refinement:/).closest("li");
    expect(meshItem).not.toBeNull();

    await user.click(
      within(meshItem as HTMLElement).getByRole("button", {
        name: /Refine imported meshes \((setup checklist|セットアップチェックリスト)\)/,
      }),
    );

    expect(setAutoMeshBatch).toHaveBeenCalledWith(
      ["eye-left", "hair-back", "body"],
      "standard",
      {
        "eye-left": "fine",
        "hair-back": "coarse",
        body: "standard",
      },
    );
  });

  it("registers auto-setup actions in the quick action registry while the dialog is open", () => {
    const project = createProject({
      layers: [createImportedMesh("mouth", "mouth", "mouth")],
    });
    useEditorStore.setState({ project });

    const { unmount } = render(<AutoSetupDialog onClose={() => {}} />);

    expect(
      useQuickActionRegistryStore.getState().actions["autoSetup.readyToRig"],
    ).toBeDefined();
    expect(
      useQuickActionRegistryStore.getState().actions["autoSetup.eyeClipping"],
    ).toBeDefined();
    expect(
      useQuickActionRegistryStore.getState().actions["autoSetup.eyeRig"],
    ).toBeDefined();
    expect(
      useQuickActionRegistryStore.getState().actions["autoSetup.leftRightRepair"],
    ).toBeDefined();
    expect(
      useQuickActionRegistryStore.getState().actions["autoSetup.mouthRig"],
    ).toBeDefined();

    unmount();

    expect(
      useQuickActionRegistryStore.getState().actions["autoSetup.readyToRig"],
    ).toBeUndefined();
    expect(
      useQuickActionRegistryStore.getState().actions["autoSetup.eyeClipping"],
    ).toBeUndefined();
    expect(
      useQuickActionRegistryStore.getState().actions["autoSetup.eyeRig"],
    ).toBeUndefined();
    expect(
      useQuickActionRegistryStore.getState().actions["autoSetup.leftRightRepair"],
    ).toBeUndefined();
    expect(
      useQuickActionRegistryStore.getState().actions["autoSetup.mouthRig"],
    ).toBeUndefined();
  });

  it("runs the checklist depth-review action and selects the hinted layer", async () => {
    const user = userEvent.setup();
    const run = vi.fn();
    useQuickActionRegistryStore.getState().registerAction({
      id: "project.depthInspector",
      section: "project",
      title: "Depth Inspector",
      keywords: ["depth", "inspector"],
      order: 1,
      run,
      getAvailability: () => ({ enabled: true }),
    });
    const project = createProject({
      layers: [
        createImportedMesh("unknown", "hair_front", "unknown"),
        createImportedMesh("mouth", "mouth", "mouth"),
      ],
    });
    const unknownLayer = project.layers.find((layer) => layer.id === "unknown");
    if (!unknownLayer?.importMetadata?.seeThrough) {
      throw new Error("Expected see-through metadata for unknown test layer.");
    }
    unknownLayer.importMetadata.seeThrough.bbox = [0, 0, 0, 64];
    useEditorStore.setState({ project });

    render(<AutoSetupDialog onClose={() => {}} />);

    const depthItem = screen.getByText(/Depth review:/).closest("li");
    expect(depthItem).not.toBeNull();

    await user.click(
      within(depthItem as HTMLElement).getByRole("button", {
        name: /Open Depth Inspector \((setup checklist|セットアップチェックリスト)\)/,
      }),
    );

    expect(useSelectionStore.getState().selectedLayerId).toBe("unknown");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("runs the checklist secondary-physics action and preselects a suggested tip bone", async () => {
    const user = userEvent.setup();
    const run = vi.fn(() => {
      useWorkspaceModeStore.getState().setMode("rigging");
    });
    useQuickActionRegistryStore.getState().registerAction({
      id: "project.physicsPanel",
      section: "project",
      title: "Physics Panel",
      keywords: ["physics"],
      order: 1,
      run,
      getAvailability: () => ({ enabled: true }),
    });
    const project = createProject({
      layers: [
        createViviMesh({
          id: "hair-front",
          name: "Hair Front",
          semanticRole: "hairFront",
          importMetadata: {
            source: "seeThrough",
            seeThrough: {
              label: "hair_front",
              order: 0,
              bbox: [0, 0, 64, 64],
              confidence: 0.95,
              leftRightSplit: "center",
              frontBackSplit: "front",
              depthStats: { min: 0.1, max: 0.2, mean: 0.15 },
            },
          },
        }),
        createBoneNode({ id: "bone-root", name: "Hair Root" }),
        createBoneNode({
          id: "bone-tip",
          name: "Hair Tip",
          parentBoneId: "bone-root",
          bone: { angle: 0, length: 30, scaleX: 1, scaleY: 1 },
        }),
      ],
    });
    useEditorStore.setState({ project });

    render(<AutoSetupDialog onClose={() => {}} />);

    const physicsItem = screen.getByText(/Secondary physics:/).closest("li");
    expect(physicsItem).not.toBeNull();

    await user.click(
      within(physicsItem as HTMLElement).getByRole("button", {
        name: /Open Physics Panel \((setup checklist|セットアップチェックリスト)\)/,
      }),
    );

    expect(useSelectionStore.getState().selectedLayerId).toBe("bone-tip");
    expect(run).toHaveBeenCalledTimes(1);
    expect(useWorkspaceModeStore.getState().mode).toBe("rigging");
  });

  it("unregisters auto-setup actions when the project stops being See-through", async () => {
    const project = createProject({
      layers: [createImportedMesh("mouth", "mouth", "mouth")],
    });
    useEditorStore.setState({ project });

    render(<AutoSetupDialog onClose={() => {}} />);
    expect(
      useQuickActionRegistryStore.getState().actions["autoSetup.mouthRig"],
    ).toBeDefined();

    useEditorStore.setState({
      project: createProject({
        layers: [createViviMesh({ id: "plain", name: "Plain" })],
      }),
    });

    await waitFor(() => {
      expect(
        useQuickActionRegistryStore.getState().actions["autoSetup.readyToRig"],
      ).toBeUndefined();
    });
    expect(
      useQuickActionRegistryStore.getState().actions["autoSetup.eyeClipping"],
    ).toBeUndefined();
    expect(
      useQuickActionRegistryStore.getState().actions["autoSetup.eyeRig"],
    ).toBeUndefined();
    expect(
      useQuickActionRegistryStore.getState().actions["autoSetup.leftRightRepair"],
    ).toBeUndefined();
    expect(
      useQuickActionRegistryStore.getState().actions["autoSetup.mouthRig"],
    ).toBeUndefined();
  });
});
