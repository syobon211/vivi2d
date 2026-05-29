import { describe, expect, it } from "vitest";
import {
  hasSeeThroughTechnicalNamePrefix,
  parseSeeThroughLeafToken,
  stripSeeThroughTechnicalName,
} from "../see-through-technical-name";

describe("see-through technical names", () => {
  it("parses and strips generated layer names", () => {
    const name = "v2d[hair-left] Hair Left";
    expect(hasSeeThroughTechnicalNamePrefix(name)).toBe(true);
    expect(parseSeeThroughLeafToken(name)).toBe("hair-left");
    expect(stripSeeThroughTechnicalName(name)).toBe("Hair Left");
  });

  it("rejects empty or unterminated tokens", () => {
    for (const name of ["v2d[] Empty", "v2d[missing", "plain layer"]) {
      expect(hasSeeThroughTechnicalNamePrefix(name)).toBe(false);
      expect(parseSeeThroughLeafToken(name)).toBeNull();
      expect(stripSeeThroughTechnicalName(name)).toBe(name);
    }
  });

  it("handles long whitespace suffixes without regular expressions", () => {
    const name = `v2d[token]${" ".repeat(10000)}Display`;
    expect(stripSeeThroughTechnicalName(name)).toBe("Display");
  });
});
