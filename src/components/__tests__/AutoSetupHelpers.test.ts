import { describe, expect, it } from "vitest";
import { remapWeightBoneIds } from "../AutoSetupHelpers";

describe("AutoSetupHelpers", () => {
  it("renormalizes weights after excluded temporary bones are removed", () => {
    const result = remapWeightBoneIds(
      {
        layerId: "mesh",
        boneIds: ["temp-a", "temp-b"],
        weights: [
          [
            { boneId: "temp-a", weight: 0.25 },
            { boneId: "temp-b", weight: 0.75 },
          ],
          [{ boneId: "temp-b", weight: 1 }],
          [{ boneId: "temp-a", weight: 0.5 }],
        ],
      },
      new Map([["temp-a", "real-a"]]),
    );

    expect(result).not.toBeNull();
    expect(result!.boneIds).toEqual(["real-a"]);
    expect(result!.weights[0]).toEqual([{ boneId: "real-a", weight: 1 }]);
    expect(result!.weights[1]).toEqual([]);
    expect(result!.weights[2]).toEqual([{ boneId: "real-a", weight: 1 }]);
  });
});
