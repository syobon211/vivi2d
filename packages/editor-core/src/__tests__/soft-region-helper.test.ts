import { describe, expect, it } from "vitest";
import { buildSoftRegionHelperPlan } from "../soft-region-helper";

const meshVertices = [0, 0, 10, 0, 20, 0, 0, 10, 10, 10, 20, 10];

describe("soft-region-helper", () => {
  it("creates a deterministic handle + anchor layout from selected vertices", () => {
    const result = buildSoftRegionHelperPlan(
      "mesh-soft",
      meshVertices,
      [0, 1, 2, 3, 4, 5],
      "generic",
    );

    expect(result.status).toBe("planned");
    expect(result.plan?.managedTag).toBe("softRegionDeformer:v1");
    expect(result.plan?.managedSignature).toBe("mesh-soft|generic|0,1,2,3,4,5");
    expect(result.plan?.pins[0]?.kind).toBe("handle");
    expect(
      result.plan?.pins.filter((pin) => pin.kind === "anchor").length,
    ).toBeGreaterThanOrEqual(3);
  });

  it("rejects selections with too few vertices", () => {
    const result = buildSoftRegionHelperPlan("mesh-soft", meshVertices, [0, 1], "cheek");

    expect(result).toEqual({ status: "rejected", reason: "tooFewVertices" });
  });

  it("rejects degenerate selections that cannot produce enough unique anchors", () => {
    const vertices = [0, 0, 10, 0, 20, 0];

    const result = buildSoftRegionHelperPlan("mesh-line", vertices, [0, 1, 2], "generic");

    expect(result).toEqual({ status: "rejected", reason: "selectionTooDegenerate" });
  });
});
