import { describe, expect, it } from "vitest";
import type { DetectedPart } from "@/lib/ai-part-detector";
import { detectSwayingParts, generatePhysicsGroups } from "@/lib/ai-physics-generator";

function makePart(
  category: DetectedPart["category"],
  layerId = `layer-${category}`,
): DetectedPart {
  return {
    layerId,
    layerName: category,
    category,
    confidence: 0.8,
    bounds: { x: 0, y: 0, width: 100, height: 100 },
  };
}

describe("detectSwayingParts", () => {
  it("髪パーツを揺れ対象として検出する", () => {
    const parts = [makePart("hair"), makePart("hairFront"), makePart("body")];
    const swaying = detectSwayingParts(parts);
    expect(swaying).toHaveLength(2);
    expect(swaying.every((p) => p.category.startsWith("hair"))).toBe(true);
  });

  it("尻尾を揺れ対象として検出する", () => {
    const parts = [makePart("tail"), makePart("head")];
    const swaying = detectSwayingParts(parts);
    expect(swaying).toHaveLength(1);
    expect(swaying[0]!.category).toBe("tail");
  });

  it("アクセサリーを揺れ対象として検出する", () => {
    const parts = [makePart("accessory")];
    const swaying = detectSwayingParts(parts);
    expect(swaying).toHaveLength(1);
  });

  it("体・顔・目は揺れ対象にならない", () => {
    const parts = [makePart("body"), makePart("face"), makePart("eyeLeft")];
    const swaying = detectSwayingParts(parts);
    expect(swaying).toHaveLength(0);
  });
});

describe("generatePhysicsGroups", () => {
  it("揺れパーツからカテゴリごとの物理グループを生成する", () => {
    const parts = [
      makePart("hairFront", "front1"),
      makePart("hairFront", "front2"),
      makePart("tail", "tail1"),
    ];
    const groups = generatePhysicsGroups(parts);
    expect(groups).toHaveLength(2);
    const hairGroup = groups.find((g) => g.partCategory === "hairFront");
    expect(hairGroup?.layerIds).toEqual(["front1", "front2"]);
    expect(hairGroup?.name).toBe("Front Hair Sway");
  });

  it("各グループに推奨物理パラメータが設定される", () => {
    const parts = [makePart("tail")];
    const groups = generatePhysicsGroups(parts);
    expect(groups[0]!.stiffness).toBeGreaterThan(0);
    expect(groups[0]!.gravity).toBeGreaterThan(0);
    expect(groups[0]!.damping).toBeGreaterThan(0);
  });

  it("揺れパーツがない場合は空配列を返す", () => {
    const parts = [makePart("body"), makePart("head")];
    const groups = generatePhysicsGroups(parts);
    expect(groups).toHaveLength(0);
  });

  it("尻尾は独立した物理グループになる", () => {
    const parts = [makePart("tail")];
    const groups = generatePhysicsGroups(parts);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.name).toBe("Tail Sway");
  });
});
