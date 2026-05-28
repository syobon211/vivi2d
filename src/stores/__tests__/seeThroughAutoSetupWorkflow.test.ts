import { isBone, type LayerSemanticRole } from "@vivi2d/core/types";
import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "@/stores/editorStore";
import { useHistoryStore } from "@/stores/historyStore";
import {
  runSeeThroughEyeRig,
  runSeeThroughReadyToRigCleanup,
} from "@/stores/seeThroughAutoSetupWorkflow";
import { createEmptyProject, createViviMesh } from "@/test/fixtures";
import { resetAllStores } from "@/test/store-reset";

function createImportedMesh(
  id: string,
  name: string,
  label: string,
  confidence = 0.9,
  semanticRole?: LayerSemanticRole,
) {
  return createViviMesh({
    id,
    name,
    semanticRole,
    importMetadata: {
      source: "seeThrough",
      seeThrough: {
        label,
        order: 0,
        confidence,
        leftRightSplit: "center",
        frontBackSplit: "middle",
        bbox: [0, 0, 10, 10],
        depthStats: { min: 0, max: 1, mean: 0.5 },
      },
    },
  });
}

function createClippedEyePair(side: "left" | "right") {
  const iris = createImportedMesh(
    `iris-${side}`,
    `Iris ${side}`,
    `iris_${side}`,
  );
  const eyeWhite = createImportedMesh(
    `white-${side}`,
    `Eye White ${side}`,
    `eye_white_${side}`,
  );
  iris.clipMaskIds = [eyeWhite.id];
  return { iris, eyeWhite };
}

describe("seeThroughAutoSetupWorkflow store actions", () => {
  beforeEach(() => {
    resetAllStores();
  });

  it("returns null and leaves history untouched without a project", () => {
    expect(runSeeThroughReadyToRigCleanup()).toBeNull();
    expect(useHistoryStore.getState().undoStack).toHaveLength(0);
  });

  it("applies ready-to-rig cleanup transactionally and bumps structure version", () => {
    const project = createEmptyProject();
    project.layers = [
      createImportedMesh("hair", "v2d[token] Hair Front", "hair_front", 0.9),
    ];
    useEditorStore.setState({ project });

    const summary = runSeeThroughReadyToRigCleanup();

    const nextLayer = useEditorStore.getState().project?.layers[0];
    expect(summary?.applied).toBe(true);
    expect(nextLayer?.name).toBe("Hair Front");
    expect(nextLayer?.semanticRole).toBe("hairFront");
    expect(useHistoryStore.getState().undoStack).toHaveLength(1);
    expect(useEditorStore.getState().projectStructureVersion).toBe(1);
  });

  it("does not create history when the workflow preview has no changes", () => {
    const project = createEmptyProject();
    project.layers = [
      createImportedMesh("hair", "Hair Front", "hair_front", 0.9, "hairFront"),
    ];
    useEditorStore.setState({ project });

    const summary = runSeeThroughReadyToRigCleanup();

    expect(summary?.applied).toBe(false);
    expect(useHistoryStore.getState().undoStack).toHaveLength(0);
    expect(useEditorStore.getState().projectStructureVersion).toBe(0);
  });

  it("returns the committed summary for UUID-generating eye rig workflows", () => {
    const project = createEmptyProject();
    const left = createClippedEyePair("left");
    const right = createClippedEyePair("right");
    project.layers = [left.iris, left.eyeWhite, right.iris, right.eyeWhite];
    useEditorStore.setState({ project });

    const summary = runSeeThroughEyeRig();

    const nextProject = useEditorStore.getState().project;
    const controlBoneIds = nextProject?.layers
      .filter(isBone)
      .map((bone) => bone.id);
    expect(summary?.applied).toBe(true);
    expect(summary?.createdParameterIds).toEqual(
      nextProject?.parameters.map((parameter) => parameter.id),
    );
    expect(summary?.createdControlBoneIds).toEqual(controlBoneIds);
    expect(useHistoryStore.getState().undoStack).toHaveLength(1);
    expect(useEditorStore.getState().projectStructureVersion).toBe(1);
  });
});
