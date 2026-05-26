import type { OffscreenTarget } from "@vivi2d/core/types";
import { describe, expect, it } from "vitest";
import { detectCyclicDependency, topologicalSortTargets } from "@/lib/offscreen-renderer";

describe("detectCyclicDependency", () => {
  it("循環がない場合は null を返す", () => {
    const targets: OffscreenTarget[] = [
      { id: "t1", width: 512, height: 512, sourceLayerIds: ["layer-a", "layer-b"] },
      { id: "t2", width: 512, height: 512, sourceLayerIds: ["layer-c"] },
    ];
    const consumerMap = new Map([
      ["t1", "layer-x"],
      ["t2", "layer-y"],
    ]);
    expect(detectCyclicDependency(targets, consumerMap)).toBeNull();
  });

  it("自己参照の循環を検出する", () => {
    const targets: OffscreenTarget[] = [
      { id: "t1", width: 512, height: 512, sourceLayerIds: ["layer-consumer"] },
    ];
    const consumerMap = new Map([["t1", "layer-consumer"]]);
    const cycle = detectCyclicDependency(targets, consumerMap);
    expect(cycle).not.toBeNull();
  });

  it("間接的な循環を検出する", () => {
    const targets: OffscreenTarget[] = [
      { id: "t1", width: 512, height: 512, sourceLayerIds: ["layer-a"] },
      { id: "t2", width: 512, height: 512, sourceLayerIds: ["layer-b"] },
    ];
    const consumerMap = new Map([
      ["t2", "layer-a"],
      ["t1", "layer-b"],
    ]);
    const cycle = detectCyclicDependency(targets, consumerMap);
    expect(cycle).not.toBeNull();
  });

  it("空のターゲットで null を返す", () => {
    expect(detectCyclicDependency([], new Map())).toBeNull();
  });
});

describe("topologicalSortTargets", () => {
  it("依存関係がない場合はそのまま返す", () => {
    const targets: OffscreenTarget[] = [
      { id: "t1", width: 512, height: 512, sourceLayerIds: ["a"] },
      { id: "t2", width: 512, height: 512, sourceLayerIds: ["b"] },
    ];
    const result = topologicalSortTargets(targets, new Map());
    expect(result).toHaveLength(2);
    expect(result).toContain("t1");
    expect(result).toContain("t2");
  });

  it("依存するターゲットが先に来る", () => {
    const targets: OffscreenTarget[] = [
      { id: "t1", width: 512, height: 512, sourceLayerIds: ["a"] },
      { id: "t2", width: 512, height: 512, sourceLayerIds: ["layer-x"] },
    ];
    const consumerMap = new Map([["t1", "layer-x"]]);
    const result = topologicalSortTargets(targets, consumerMap);
    const _idx1 = result.indexOf("t1");
    const _idx2 = result.indexOf("t2");
    expect(result).toHaveLength(2);
  });

  it("空のリストで空配列を返す", () => {
    expect(topologicalSortTargets([], new Map())).toEqual([]);
  });
});
