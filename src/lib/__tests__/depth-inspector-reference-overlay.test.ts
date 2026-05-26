import { describe, expect, it } from "vitest";
import { buildDepthInspectorReferenceOverlaySettings } from "@/lib/depth-inspector-reference-overlay";
import { createViviMesh, createProject } from "@/test/fixtures";

describe("depth inspector reference overlay", () => {
  it("returns imported-bounds settings for a selected see-through ViviMesh", () => {
    const mesh = createViviMesh({
      id: "mesh-a",
      importMetadata: {
        source: "seeThrough",
        seeThrough: {
          label: "hair_front",
          order: 0,
          confidence: 0.9,
          leftRightSplit: "center",
          frontBackSplit: "front",
          bbox: [0, 0, 10, 12],
          depthStats: { min: 0, max: 1, mean: 0.5 },
        },
      },
    });
    const project = createProject({ layers: [mesh] });

    expect(buildDepthInspectorReferenceOverlaySettings(project, mesh.id)).toEqual({
      enabled: true,
      mode: "importedBounds",
    });
  });

  it("returns null when no selected layer is available or bbox is invalid", () => {
    const mesh = createViviMesh({
      id: "mesh-a",
      importMetadata: {
        source: "seeThrough",
        seeThrough: {
          label: "hair_front",
          order: 0,
          confidence: 0.9,
          leftRightSplit: "center",
          frontBackSplit: "front",
          bbox: [0, 0, 0, 12],
          depthStats: { min: 0, max: 1, mean: 0.5 },
        },
      },
    });
    const project = createProject({ layers: [mesh] });

    expect(buildDepthInspectorReferenceOverlaySettings(project, null)).toBeNull();
    expect(buildDepthInspectorReferenceOverlaySettings(project, mesh.id)).toBeNull();
  });
});
