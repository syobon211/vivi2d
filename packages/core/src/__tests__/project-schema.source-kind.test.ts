import { describe, expect, it } from "vitest";
import { ProjectDataSchema } from "../project-schema";

describe("ProjectDataSchema sourceKind", () => {
  it("accepts a PSD source kind", () => {
    const result = ProjectDataSchema.parse({
      name: "test",
      width: 128,
      height: 128,
      sourceKind: "psd",
      layers: [],
      parameters: [],
    });

    expect(result.sourceKind).toBe("psd");
  });

  it("accepts a manual PNG source kind", () => {
    const result = ProjectDataSchema.parse({
      name: "test",
      width: 128,
      height: 128,
      sourceKind: "manualPng",
      layers: [],
      parameters: [],
    });

    expect(result.sourceKind).toBe("manualPng");
  });
});
