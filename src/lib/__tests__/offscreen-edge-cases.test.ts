import type { OffscreenTarget } from "@vivi2d/core/types";
import { describe, expect, it } from "vitest";
import { detectCyclicDependency, topologicalSortTargets } from "@/lib/offscreen-renderer";

describe("offscreen-renderer: 線形依存チェーン（3ターゲット以上）", () => {
  it("A→B→C の線形チェーンで循環なし", () => {
    const targets: OffscreenTarget[] = [
      { id: "t1", width: 512, height: 512, sourceLayerIds: ["layer-a"] },
      { id: "t2", width: 512, height: 512, sourceLayerIds: ["consumer-1"] },
      { id: "t3", width: 512, height: 512, sourceLayerIds: ["consumer-2"] },
    ];
    const consumerMap = new Map([
      ["t1", "consumer-1"],
      ["t2", "consumer-2"],
    ]);
    expect(detectCyclicDependency(targets, consumerMap)).toBeNull();
  });

  it("A→B→C の線形チェーンのトポロジカルソート", () => {
    const targets: OffscreenTarget[] = [
      { id: "t1", width: 512, height: 512, sourceLayerIds: ["layer-a"] },
      { id: "t2", width: 512, height: 512, sourceLayerIds: ["consumer-1"] },
      { id: "t3", width: 512, height: 512, sourceLayerIds: ["consumer-2"] },
    ];
    const consumerMap = new Map([
      ["t1", "consumer-1"],
      ["t2", "consumer-2"],
    ]);
    const sorted = topologicalSortTargets(targets, consumerMap);
    expect(sorted).toHaveLength(3);
    const i1 = sorted.indexOf("t1");
    const i2 = sorted.indexOf("t2");
    const i3 = sorted.indexOf("t3");
    expect(i3).toBeLessThan(i2);
    expect(i2).toBeLessThan(i1);
  });

  it("4段の線形チェーンでも正常にソートされる", () => {
    const targets: OffscreenTarget[] = [
      { id: "t1", width: 256, height: 256, sourceLayerIds: ["src-a"] },
      { id: "t2", width: 256, height: 256, sourceLayerIds: ["c1"] },
      { id: "t3", width: 256, height: 256, sourceLayerIds: ["c2"] },
      { id: "t4", width: 256, height: 256, sourceLayerIds: ["c3"] },
    ];
    const consumerMap = new Map([
      ["t1", "c1"],
      ["t2", "c2"],
      ["t3", "c3"],
    ]);
    expect(detectCyclicDependency(targets, consumerMap)).toBeNull();
    const sorted = topologicalSortTargets(targets, consumerMap);
    expect(sorted).toHaveLength(4);
  });
});

describe("offscreen-renderer: ダイヤモンド型依存", () => {
  it("ダイヤモンド依存で循環なし", () => {
    const targets: OffscreenTarget[] = [
      { id: "t1", width: 512, height: 512, sourceLayerIds: ["src-root"] },
      { id: "t2", width: 512, height: 512, sourceLayerIds: ["c-a"] },
      { id: "t3", width: 512, height: 512, sourceLayerIds: ["c-a"] },
      { id: "t4", width: 512, height: 512, sourceLayerIds: ["c-b", "c-c"] },
    ];
    const consumerMap = new Map([
      ["t1", "c-a"],
      ["t2", "c-b"],
      ["t3", "c-c"],
    ]);
    expect(detectCyclicDependency(targets, consumerMap)).toBeNull();
  });

  it("ダイヤモンド型のトポロジカルソートで t4 が最初、t1 が最後", () => {
    // deps: t2={t1}, t3={t1}, t4={t2,t3}
    // inDegree: t1+=1(t2)+1(t3)=2, t2+=1(t4), t3+=1(t4)
    const targets: OffscreenTarget[] = [
      { id: "t1", width: 512, height: 512, sourceLayerIds: ["src-root"] },
      { id: "t2", width: 512, height: 512, sourceLayerIds: ["c-a"] },
      { id: "t3", width: 512, height: 512, sourceLayerIds: ["c-a"] },
      { id: "t4", width: 512, height: 512, sourceLayerIds: ["c-b", "c-c"] },
    ];
    const consumerMap = new Map([
      ["t1", "c-a"],
      ["t2", "c-b"],
      ["t3", "c-c"],
    ]);
    const sorted = topologicalSortTargets(targets, consumerMap);
    expect(sorted).toHaveLength(4);
    expect(sorted.indexOf("t4")).toBeLessThan(sorted.indexOf("t2"));
    expect(sorted.indexOf("t4")).toBeLessThan(sorted.indexOf("t3"));
    expect(sorted.indexOf("t2")).toBeLessThan(sorted.indexOf("t1"));
    expect(sorted.indexOf("t3")).toBeLessThan(sorted.indexOf("t1"));
  });
});

describe("offscreen-renderer: 完全独立な5ターゲット", () => {
  it("依存関係がない5ターゲットで循環なし", () => {
    const targets: OffscreenTarget[] = Array.from({ length: 5 }, (_, i) => ({
      id: `t${i}`,
      width: 256,
      height: 256,
      sourceLayerIds: [`layer-${i}`],
    }));
    expect(detectCyclicDependency(targets, new Map())).toBeNull();
  });

  it("独立な5ターゲットのソートで全てが含まれる", () => {
    const targets: OffscreenTarget[] = Array.from({ length: 5 }, (_, i) => ({
      id: `t${i}`,
      width: 256,
      height: 256,
      sourceLayerIds: [`layer-${i}`],
    }));
    const sorted = topologicalSortTargets(targets, new Map());
    expect(sorted).toHaveLength(5);
    for (let i = 0; i < 5; i++) {
      expect(sorted).toContain(`t${i}`);
    }
  });
});

describe("offscreen-renderer: consumerMap に未知のターゲットID", () => {
  it("consumerMap に targets にないIDがあっても循環検出がクラッシュしない", () => {
    const targets: OffscreenTarget[] = [
      { id: "t1", width: 512, height: 512, sourceLayerIds: ["layer-a"] },
    ];
    const consumerMap = new Map([["t_nonexistent", "layer-a"]]);
    const result = detectCyclicDependency(targets, consumerMap);
    expect(result).toBeNull();
  });

  it("ソート時に consumerMap の未知IDも結果に含まれうる", () => {
    const targets: OffscreenTarget[] = [
      { id: "t1", width: 512, height: 512, sourceLayerIds: ["layer-a"] },
      { id: "t2", width: 512, height: 512, sourceLayerIds: ["layer-b"] },
    ];
    const consumerMap = new Map([
      ["t_ghost", "layer-a"],
    ]);
    const sorted = topologicalSortTargets(targets, consumerMap);
    expect(sorted).toContain("t1");
    expect(sorted).toContain("t2");
  });
});

describe("offscreen-renderer: ソースレイヤーが空", () => {
  it("sourceLayerIds が空配列でも正常に動作する", () => {
    const targets: OffscreenTarget[] = [
      { id: "t1", width: 512, height: 512, sourceLayerIds: [] },
      { id: "t2", width: 512, height: 512, sourceLayerIds: ["layer-a"] },
    ];
    expect(detectCyclicDependency(targets, new Map())).toBeNull();
    const sorted = topologicalSortTargets(targets, new Map());
    expect(sorted).toHaveLength(2);
  });

  it("全ターゲットの sourceLayerIds が空でも正常動作", () => {
    const targets: OffscreenTarget[] = [
      { id: "t1", width: 256, height: 256, sourceLayerIds: [] },
      { id: "t2", width: 256, height: 256, sourceLayerIds: [] },
      { id: "t3", width: 256, height: 256, sourceLayerIds: [] },
    ];
    expect(detectCyclicDependency(targets, new Map())).toBeNull();
    const sorted = topologicalSortTargets(targets, new Map());
    expect(sorted).toHaveLength(3);
  });
});

describe("offscreen-renderer: 循環DAGのトポロジカルソート", () => {
  it("循環がある場合、ソート結果が不完全になる", () => {
    const targets: OffscreenTarget[] = [
      { id: "t1", width: 512, height: 512, sourceLayerIds: ["c-b"] },
      { id: "t2", width: 512, height: 512, sourceLayerIds: ["c-a"] },
    ];
    const consumerMap = new Map([
      ["t1", "c-a"],
      ["t2", "c-b"],
    ]);
    const cycle = detectCyclicDependency(targets, consumerMap);
    expect(cycle).not.toBeNull();

    const sorted = topologicalSortTargets(targets, consumerMap);
    expect(sorted.length).toBeLessThan(2);
  });

  it("3ターゲットの循環で結果が不完全", () => {
    const targets: OffscreenTarget[] = [
      { id: "t1", width: 256, height: 256, sourceLayerIds: ["c-3"] },
      { id: "t2", width: 256, height: 256, sourceLayerIds: ["c-1"] },
      { id: "t3", width: 256, height: 256, sourceLayerIds: ["c-2"] },
    ];
    const consumerMap = new Map([
      ["t1", "c-1"],
      ["t2", "c-2"],
      ["t3", "c-3"],
    ]);
    const cycle = detectCyclicDependency(targets, consumerMap);
    expect(cycle).not.toBeNull();

    const sorted = topologicalSortTargets(targets, consumerMap);
    expect(sorted.length).toBeLessThan(3);
  });

  it("循環の一部だけが影響を受ける場合", () => {
    const targets: OffscreenTarget[] = [
      { id: "t1", width: 256, height: 256, sourceLayerIds: ["independent"] },
      { id: "t2", width: 256, height: 256, sourceLayerIds: ["c-3"] },
      { id: "t3", width: 256, height: 256, sourceLayerIds: ["c-2"] },
    ];
    const consumerMap = new Map([
      ["t2", "c-2-out"],
      ["t3", "c-3"],
    ]);
    expect(detectCyclicDependency(targets, consumerMap)).toBeNull();

    const sorted = topologicalSortTargets(targets, consumerMap);
    expect(sorted).toHaveLength(3);
    expect(sorted).toContain("t1");
  });
});
