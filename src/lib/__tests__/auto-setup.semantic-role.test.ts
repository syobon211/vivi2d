import { describe, expect, it } from "vitest";
import { previewAutoSetup } from "@/lib/auto-setup";
import { createViviMesh, createProject } from "@/test/fixtures";

describe("previewAutoSetup semantic role integration", () => {
  it("uses edited semanticRole on the same project instance across repeated previews", () => {
    const layer = createViviMesh({
      name: "left eye",
      semanticRole: "unknown",
      x: 100,
      y: 100,
      width: 50,
      height: 50,
    });
    const project = createProject({
      width: 512,
      height: 512,
      layers: [layer],
    });

    const first = previewAutoSetup(project, {
      generateBones: false,
      generatePhysics: false,
      minConfidence: 0,
    });
    expect(first.detectedParts[0]?.category).toBe("eyeLeft");

    layer.semanticRole = "mouth";

    const second = previewAutoSetup(project, {
      generateBones: false,
      generatePhysics: false,
      minConfidence: 0,
    });
    expect(second.detectedParts[0]?.category).toBe("mouth");
  });
});
