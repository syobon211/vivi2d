import { describe, expect, it } from "vitest";
import type { LayerSemanticRole } from "@vivi2d/core/types";
import {
  getAutoSetupProjectBlockReasonKey,
  getAutoSetupProjectSourceKindBlockReasonKey,
  isAutoSetupDiscoverableProject,
  isAutoSetupDiscoverableProjectSourceKind,
  inferProjectSourceKind,
  isAutoSetupEligibleProject,
  isAutoSetupEligibleProjectSourceKind,
} from "@/lib/project-source-kind";
import { createViviMesh, createProject } from "@/test/fixtures";
import { TEST_ASSET_FACE_PNG_PATH } from "@/test/path-fixtures";

function createManualPngMesh(
  id: string,
  semanticRole?: LayerSemanticRole,
) {
  return createViviMesh({
    id,
    semanticRole,
    semanticRoleSource: semanticRole ? "manual" : undefined,
    importMetadata: {
      source: "manualPng",
      manualPng: {
        sourceFileName: `${id}.png`,
        sourcePath: TEST_ASSET_FACE_PNG_PATH,
        originalWidth: 256,
        originalHeight: 256,
        trimmedBounds: [0, 0, 256, 256],
        finalOrigin: [0, 0],
        placementMode: "preserveImageOffset",
        trimTransparentBoundsApplied: false,
        autoGenerateMeshApplied: false,
      },
    },
  });
}

describe("project-source-kind", () => {
  it("treats See-through imported projects as eligible for Auto Setup", () => {
    const project = createProject({
      layers: [
        createViviMesh({
          id: "mesh-seethrough-a",
          importMetadata: {
            source: "seeThrough",
            seeThrough: {
              label: "face",
              order: 0,
              confidence: 0.95,
              leftRightSplit: "center",
              frontBackSplit: "middle",
              bbox: [0, 0, 64, 64],
              depthStats: { min: 0.1, max: 0.2, mean: 0.15 },
            },
          },
        }),
        createViviMesh({
          id: "mesh-seethrough-b",
          importMetadata: {
            source: "seeThrough",
            seeThrough: {
              label: "face",
              order: 0,
              confidence: 0.95,
              leftRightSplit: "center",
              frontBackSplit: "middle",
              bbox: [0, 0, 64, 64],
              depthStats: { min: 0.1, max: 0.2, mean: 0.15 },
            },
          },
        }),
      ],
    });

    expect(inferProjectSourceKind(project)).toBe("seeThrough");
    expect(isAutoSetupEligibleProjectSourceKind("seeThrough")).toBe(true);
    expect(isAutoSetupEligibleProject(project, "seeThrough")).toBe(true);
  });

  it("keeps manual PNG Auto Setup discoverable but blocked with a reason", () => {
    const project = createProject({
      layers: [createManualPngMesh("mesh-manual")],
    });

    expect(inferProjectSourceKind(project)).toBe("manualPng");
    expect(isAutoSetupDiscoverableProjectSourceKind("manualPng")).toBe(true);
    expect(isAutoSetupDiscoverableProject(project, "manualPng")).toBe(true);
    expect(isAutoSetupEligibleProjectSourceKind("manualPng")).toBe(false);
    expect(isAutoSetupEligibleProject(project, "manualPng")).toBe(false);
    expect(getAutoSetupProjectSourceKindBlockReasonKey("manualPng")).toBe(
      "menu.autoSetupManualPngDisabled",
    );
    expect(getAutoSetupProjectBlockReasonKey(project, "manualPng")).toBe(
      "menu.autoSetupManualPngDisabled",
    );
  });

  it("enables Auto Setup for manually split PNG projects", () => {
    const project = createProject({
      sourceKind: "manualPng",
      layers: [
        createManualPngMesh("mesh-hair", "hair"),
        createManualPngMesh("mesh-face", "face"),
      ],
    });

    expect(inferProjectSourceKind(project)).toBe("manualPng");
    expect(isAutoSetupDiscoverableProject(project, "manualPng")).toBe(true);
    expect(isAutoSetupEligibleProject(project, "manualPng")).toBe(true);
    expect(getAutoSetupProjectBlockReasonKey(project, "manualPng")).toBeNull();
  });

  it("requires separate manual PNG source metadata for split PNG eligibility", () => {
    const project = createProject({
      sourceKind: "manualPng",
      layers: [createManualPngMesh("mesh-manual"), createViviMesh({ id: "mesh-plain" })],
    });

    expect(isAutoSetupDiscoverableProject(project, "manualPng")).toBe(true);
    expect(isAutoSetupEligibleProject(project, "manualPng")).toBe(false);
    expect(getAutoSetupProjectBlockReasonKey(project, "manualPng")).toBe(
      "menu.autoSetupManualPngDisabled",
    );
  });

  it("requires manual PNG split layers to have known roles", () => {
    const project = createProject({
      sourceKind: "manualPng",
      layers: [createManualPngMesh("mesh-a"), createManualPngMesh("mesh-b")],
    });

    expect(isAutoSetupDiscoverableProject(project, "manualPng")).toBe(true);
    expect(isAutoSetupEligibleProject(project, "manualPng")).toBe(false);
    expect(getAutoSetupProjectBlockReasonKey(project, "manualPng")).toBe(
      "menu.autoSetupManualPngNeedsRoles",
    );
  });

  it("blocks single-layer PSD-like sources with a separated-layer reason", () => {
    const project = createProject({
      sourceKind: "psd",
      layers: [createViviMesh({ id: "mesh-plain" })],
    });

    expect(isAutoSetupDiscoverableProject(project, "psd")).toBe(true);
    expect(isAutoSetupEligibleProject(project, "psd")).toBe(false);
    expect(getAutoSetupProjectBlockReasonKey(project, "psd")).toBe(
      "menu.autoSetupNeedsSeparatedLayers",
    );
  });

  it("falls back to vivi for projects without import metadata", () => {
    const project = createProject({
      layers: [createViviMesh({ id: "mesh-plain" })],
    });

    expect(inferProjectSourceKind(project)).toBe("vivi");
    expect(isAutoSetupEligibleProjectSourceKind("psd")).toBe(true);
    expect(isAutoSetupEligibleProjectSourceKind("vivi")).toBe(false);
  });

  it("honors an explicit persisted source kind", () => {
    const project = createProject({
      sourceKind: "psd",
      layers: [createViviMesh({ id: "mesh-plain" })],
    });

    expect(inferProjectSourceKind(project)).toBe("psd");
  });
});
