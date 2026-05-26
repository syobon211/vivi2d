import type { LayerSemanticRole } from "@vivi2d/core/types";
import { describe, expect, it } from "vitest";
import { applyHairStrandHelper } from "@/lib/hair-strand-helper";
import { buildSeeThroughDepthRigHintSummary } from "@/lib/see-through-depth-rig-hints";
import { applySeeThroughEyeClipping } from "@vivi2d/editor-core/see-through-eye-clipping";
import { applySeeThroughEyeRig } from "@vivi2d/editor-core/see-through-eye-rig";
import { applySeeThroughMouthRig } from "@vivi2d/editor-core/see-through-mouth-rig";
import { buildSeeThroughQualityReport } from "@/lib/see-through-quality-report";
import { buildSeeThroughTechnicalName } from "@vivi2d/editor-core/see-through-technical-name";
import { createViviMesh, createBoneNode, createProject } from "@/test/fixtures";
import { buildSeeThroughSetupChecklist } from "../see-through-setup-checklist";

function createImportedMesh(
  id: string,
  label: string,
  name: string,
  semanticRole?: LayerSemanticRole,
) {
  const mesh = createViviMesh({
    id,
    name,
    semanticRole,
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
  mesh.mesh.vertices = [0, 0, 64, 0, 64, 64, 0, 64];
  mesh.mesh.uvs = [0, 0, 1, 0, 1, 1, 0, 1];
  mesh.mesh.indices = [0, 1, 2, 0, 2, 3];
  mesh.mesh.divisionsX = 1;
  mesh.mesh.divisionsY = 1;
  return mesh;
}

describe("buildSeeThroughSetupChecklist", () => {
  it("reports pending and blocked states for an early imported project", () => {
    const irisLeft = createImportedMesh("iris-left", "iris_left", "Iris Left", "eyeLeft");
    const eyeWhiteLeft = createImportedMesh(
      "eye-white-left",
      "eye_white_left",
      buildSeeThroughTechnicalName("eye-white-left", "Eye White Left"),
      "eyeLeft",
    );
    const mouth = createImportedMesh("mouth", "mouth", "Mouth", "mouth");
    const hairFront = createImportedMesh(
      "hair-front",
      "hair_front",
      "Hair Front",
      "hairFront",
    );
    const project = createProject({ layers: [irisLeft, eyeWhiteLeft, mouth, hairFront] });
    const qualityReport = buildSeeThroughQualityReport(project);
    const depthRigHintSummary = buildSeeThroughDepthRigHintSummary(
      project,
      qualityReport,
    );

    const checklist = buildSeeThroughSetupChecklist(project, depthRigHintSummary);
    expect(checklist.isSeeThroughProject).toBe(true);
    expect(checklist.items.find((item) => item.id === "cleanup")?.status).toBe("partial");
    expect(checklist.items.find((item) => item.id === "mesh")?.status).toBe("pending");
    expect(checklist.items.find((item) => item.id === "depth")?.status).toBe("pending");
    expect(checklist.items.find((item) => item.id === "eyeClipping")?.status).toBe(
      "pending",
    );
    expect(checklist.items.find((item) => item.id === "eyeRig")?.status).toBe("blocked");
    expect(checklist.items.find((item) => item.id === "mouthRig")?.status).toBe(
      "pending",
    );
    expect(checklist.items.find((item) => item.id === "physics")?.status).toBe("pending");
  });

  it("reports done states after the managed helpers are applied", () => {
    const root = createBoneNode({ id: "hair-root", name: "Hair Root" });
    const tip = createBoneNode({
      id: "hair-tip",
      name: "Hair Tip",
      parentBoneId: root.id,
    });
    const irisLeft = createImportedMesh("iris-left", "iris_left", "Iris Left", "eyeLeft");
    const irisMetadata = irisLeft.importMetadata?.seeThrough;
    if (!irisMetadata) {
      throw new Error("Expected see-through metadata for iris test mesh.");
    }
    irisMetadata.leftRightSplit = "left";
    irisLeft.mesh.vertices = [0, 0, 50, 0, 50, 50, 0, 50, 25, 12, 25, 38];
    const eyeWhiteLeft = createImportedMesh(
      "eye-white-left",
      "eye_white_left",
      "Eye White Left",
      "eyeLeft",
    );
    const eyeWhiteMetadata = eyeWhiteLeft.importMetadata?.seeThrough;
    if (!eyeWhiteMetadata) {
      throw new Error("Expected see-through metadata for eye white test mesh.");
    }
    eyeWhiteMetadata.leftRightSplit = "left";
    eyeWhiteLeft.mesh.vertices = [0, 0, 50, 0, 50, 50, 0, 50, 25, 10, 25, 40];
    const mouth = createImportedMesh("mouth", "mouth", "Mouth", "mouth");
    mouth.mesh.vertices = [0, 0, 50, 0, 50, 50, 0, 50, 25, 10, 25, 40];
    const hairFront = createImportedMesh(
      "hair-front",
      "hair_front",
      "Hair Front",
      "hairFront",
    );
    hairFront.mesh.vertices = [0, 0, 60, 0, 60, 60, 0, 60, 30, 10, 30, 50];
    const project = createProject({
      layers: [root, tip, irisLeft, eyeWhiteLeft, mouth, hairFront],
      physicsGroups: [],
    });

    applySeeThroughEyeClipping(project);
    applySeeThroughEyeRig(project);
    applySeeThroughMouthRig(project);
    applyHairStrandHelper(project, tip.id, "front");
    const qualityReport = buildSeeThroughQualityReport(project);
    const depthRigHintSummary = buildSeeThroughDepthRigHintSummary(
      project,
      qualityReport,
    );

    const checklist = buildSeeThroughSetupChecklist(project, depthRigHintSummary);
    expect(checklist.items.find((item) => item.id === "cleanup")?.status).toBe("done");
    expect(checklist.items.find((item) => item.id === "mesh")?.status).toBe("done");
    expect(checklist.items.find((item) => item.id === "depth")?.status).toBe("pending");
    expect(checklist.items.find((item) => item.id === "eyeClipping")?.status).toBe(
      "done",
    );
    expect(checklist.items.find((item) => item.id === "eyeRig")?.status).toBe("done");
    expect(checklist.items.find((item) => item.id === "mouthRig")?.status).toBe("done");
    expect(checklist.items.find((item) => item.id === "physics")?.status).toBe("done");
  });
});
