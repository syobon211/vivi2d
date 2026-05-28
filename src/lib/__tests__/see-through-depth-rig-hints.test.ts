import type { LayerSemanticRole } from "@vivi2d/core/types";
import { describe, expect, it } from "vitest";
import { buildSeeThroughDepthRigHintSummary } from "@/lib/see-through-depth-rig-hints";
import type { SeeThroughQualityReport } from "@/lib/see-through-quality-report";
import { createViviMesh, createEmptyProject } from "@/test/fixtures";

function createImportedMesh(
  id: string,
  name: string,
  semanticRole?: LayerSemanticRole,
  frontBackSplit: "front" | "middle" | "back" | "unknown" = "middle",
  confidence = 0.9,
) {
  return createViviMesh({
    id,
    name,
    semanticRole,
    importMetadata: {
      source: "seeThrough",
      seeThrough: {
        label: name,
        order: 0,
        confidence,
        leftRightSplit: "center",
        frontBackSplit,
        bbox: [0, 0, 10, 10],
        depthStats: { min: 0, max: 1, mean: 0.5 },
      },
    },
  });
}

function createQualityReport(errorCount: number): SeeThroughQualityReport {
  return {
    isSeeThroughProject: true,
    importedViviMeshCount: 1,
    errorCount,
    warningCount: 0,
    infoCount: 0,
    projectIssues: [],
    layerIssues: {},
  };
}

describe("buildSeeThroughDepthRigHintSummary", () => {
  it("returns an empty summary for non See-through projects", () => {
    const project = {
      ...createEmptyProject(),
      layers: [createViviMesh({ id: "plain", name: "Plain" })],
    };

    expect(buildSeeThroughDepthRigHintSummary(project)).toEqual({
      isSeeThroughProject: false,
      hints: [],
      counts: { info: 0, warning: 0, blocking: 0 },
    });
  });

  it("emits advisory hints for front/back layers and rig-ready families", () => {
    const project = {
      ...createEmptyProject(),
      layers: [
        createImportedMesh("hair-front", "Hair Front", "hairFront", "front"),
        createImportedMesh("hair-back", "Hair Back", "hairBack", "back"),
        createImportedMesh("eye-left", "Eye Left", "eyeLeft"),
        createImportedMesh("eye-right", "Eye Right", "eyeRight"),
        createImportedMesh("mouth", "Mouth", "mouth"),
      ],
    };

    const summary = buildSeeThroughDepthRigHintSummary(project);
    const messageKeys = summary.hints.map((hint) => hint.messageKey);

    expect(messageKeys).toContain("seethrough.depthRig.frontFineControl");
    expect(messageKeys).toContain("seethrough.depthRig.coarseBackLayer");
    expect(messageKeys).toContain("seethrough.depthRig.physicsBackLayer");
    expect(messageKeys).toContain("seethrough.depthRig.eyeRigReady");
    expect(messageKeys).toContain("seethrough.depthRig.mouthRigReady");
    expect(summary.counts.info).toBeGreaterThanOrEqual(5);
  });

  it("warns when a side family is incomplete", () => {
    const project = {
      ...createEmptyProject(),
      layers: [createImportedMesh("eye-left", "Eye Left", "eyeLeft")],
    };

    const summary = buildSeeThroughDepthRigHintSummary(project);

    expect(summary.hints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          messageKey: "seethrough.depthRig.incompleteEyeFamily",
          severity: "warning",
        }),
      ]),
    );
    expect(summary.hints).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          messageKey: "seethrough.depthRig.eyeRigReady",
        }),
      ]),
    );
    expect(summary.counts.warning).toBeGreaterThanOrEqual(1);
  });

  it("does not advertise eye rig readiness for eyebrow-only families", () => {
    const project = {
      ...createEmptyProject(),
      layers: [createImportedMesh("brow-left", "Brow Left", "eyebrowLeft")],
    };

    const summary = buildSeeThroughDepthRigHintSummary(project);
    const messageKeys = summary.hints.map((hint) => hint.messageKey);

    expect(messageKeys).toContain("seethrough.depthRig.incompleteEyebrowFamily");
    expect(messageKeys).not.toContain("seethrough.depthRig.eyeRigReady");
  });

  it("warns when an imported layer still has a high-confidence unknown role", () => {
    const project = {
      ...createEmptyProject(),
      layers: [createImportedMesh("unknown", "Unknown", "unknown", "front", 0.9)],
    };

    const summary = buildSeeThroughDepthRigHintSummary(project);

    expect(summary.hints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          messageKey: "seethrough.depthRig.cleanupUnknownRole",
          layerId: "unknown",
          severity: "warning",
        }),
      ]),
    );
  });

  it("surfaces quality-report errors as blocking hints", () => {
    const project = {
      ...createEmptyProject(),
      layers: [createImportedMesh("body", "Body", "body")],
    };

    const summary = buildSeeThroughDepthRigHintSummary(project, createQualityReport(2));

    expect(summary.hints[0]).toEqual(
      expect.objectContaining({
        messageKey: "seethrough.depthRig.blockingQualityErrors",
        blocking: true,
        severity: "warning",
      }),
    );
    expect(summary.counts.blocking).toBe(1);
  });

  it("suppresses aggressive advisory hints for low-confidence imported layers", () => {
    const project = {
      ...createEmptyProject(),
      layers: [createImportedMesh("hair-front", "Hair Front", "hairFront", "front", 0.4)],
    };

    const summary = buildSeeThroughDepthRigHintSummary(project);
    const messageKeys = summary.hints.map((hint) => hint.messageKey);

    expect(messageKeys).not.toContain("seethrough.depthRig.frontFineControl");
    expect(messageKeys).not.toContain("seethrough.depthRig.physicsBackLayer");
  });
});
