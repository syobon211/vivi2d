
import type { OffscreenTarget } from "@vivi2d/core/types";
import { beforeEach, describe, expect, it } from "vitest";
import { detectCyclicDependency, topologicalSortTargets } from "@/lib/offscreen-renderer";
import { useEditorStore } from "@/stores/editorStore";
import { useOffscreenStore } from "@/stores/offscreenStore";
import { setupTestProject } from "@/test/helpers";

function getOffscreenTargets(): OffscreenTarget[] {
  return useEditorStore.getState().project?.offscreenTargets ?? [];
}

describe("オフスクリーン描画統合テスト", () => {
  beforeEach(() => {
    setupTestProject();
  });

  describe("ストア→DAG検証→トポロジカルソートのパイプライン", () => {
    it("ストアでターゲット追加→ソースレイヤー追加→DAG検証→トポロジカルソート", () => {
      const store = useOffscreenStore.getState();

      const targetAId = store.addOffscreenTarget(512, 512);
      const targetBId = store.addOffscreenTarget(256, 256);

      store.addSourceLayer(targetAId, "layer-1");
      store.addSourceLayer(targetAId, "layer-2");
      store.addSourceLayer(targetBId, "layer-3");

      const targets = getOffscreenTargets();
      expect(targets).toHaveLength(2);
      expect(targets[0]!.sourceLayerIds).toEqual(["layer-1", "layer-2"]);
      expect(targets[1]!.sourceLayerIds).toEqual(["layer-3"]);

      const consumerMap = new Map<string, string>();
      consumerMap.set(targetAId, "layer-A-out");
      consumerMap.set(targetBId, "layer-B-out");

      const cycle = detectCyclicDependency(targets, consumerMap);
      expect(cycle).toBeNull();

      const sorted = topologicalSortTargets(targets, consumerMap);
      expect(sorted).toHaveLength(2);
      expect(sorted).toContain(targetAId);
      expect(sorted).toContain(targetBId);
    });
  });

  describe("循環参照の検出", () => {
    it("循環参照を作ろうとした場合にdetectCyclicDependencyが警告する", () => {
      const store = useOffscreenStore.getState();

      const targetAId = store.addOffscreenTarget(512, 512);
      const targetBId = store.addOffscreenTarget(256, 256);

      store.addSourceLayer(targetAId, "layer-from-B");
      store.addSourceLayer(targetBId, "layer-from-A");

      const targets = getOffscreenTargets();

      const consumerMap = new Map<string, string>();
      consumerMap.set(targetAId, "layer-from-A");
      consumerMap.set(targetBId, "layer-from-B");

      const cycle = detectCyclicDependency(targets, consumerMap);
      expect(cycle).not.toBeNull();
      expect(cycle!.length).toBeGreaterThan(0);
      expect(cycle!).toContain(targetAId);
      expect(cycle!).toContain(targetBId);
    });

    it("自己参照の場合にも循環が検出される", () => {
      const targets: OffscreenTarget[] = [
        { id: "t1", width: 512, height: 512, sourceLayerIds: ["layer-out-t1"] },
      ];

      const consumerMap = new Map<string, string>();
      consumerMap.set("t1", "layer-out-t1");

      const cycle = detectCyclicDependency(targets, consumerMap);
      expect(cycle).not.toBeNull();
    });
  });

  describe("複数ターゲットの依存関係ソート", () => {
    it("複数ターゲットの依存関係を正しくソートできる", () => {
      // tA depends on tB, tB depends on tC
      const targets: OffscreenTarget[] = [
        { id: "tA", width: 512, height: 512, sourceLayerIds: ["layer-from-B"] },
        { id: "tB", width: 256, height: 256, sourceLayerIds: ["layer-from-C"] },
        { id: "tC", width: 128, height: 128, sourceLayerIds: ["layer-independent"] },
      ];

      const consumerMap = new Map<string, string>();
      consumerMap.set("tB", "layer-from-B");
      consumerMap.set("tC", "layer-from-C");

      const cycle = detectCyclicDependency(targets, consumerMap);
      expect(cycle).toBeNull();

      const sorted = topologicalSortTargets(targets, consumerMap);
      expect(sorted).toHaveLength(3);

      const indexC = sorted.indexOf("tC");
      const indexB = sorted.indexOf("tB");
      const indexA = sorted.indexOf("tA");

      expect(indexA).toBeLessThan(indexB);
      expect(indexB).toBeLessThan(indexC);
    });

    it("独立したターゲット群も全てソートされる", () => {
      const targets: OffscreenTarget[] = [
        { id: "t1", width: 512, height: 512, sourceLayerIds: ["a"] },
        { id: "t2", width: 256, height: 256, sourceLayerIds: ["b"] },
        { id: "t3", width: 128, height: 128, sourceLayerIds: ["c"] },
      ];

      const consumerMap = new Map<string, string>();

      const sorted = topologicalSortTargets(targets, consumerMap);
      expect(sorted).toHaveLength(3);
      expect(sorted).toContain("t1");
      expect(sorted).toContain("t2");
      expect(sorted).toContain("t3");
    });
  });

  describe("ターゲット削除後のDAG更新", () => {
    it("ターゲット削除後にDAGが正しく更新される", () => {
      const store = useOffscreenStore.getState();

      const t1 = store.addOffscreenTarget(512, 512);
      const t2 = store.addOffscreenTarget(256, 256);
      const t3 = store.addOffscreenTarget(128, 128);

      store.addSourceLayer(t1, "layer-a");
      store.addSourceLayer(t2, "layer-b");
      store.addSourceLayer(t3, "layer-c");

      let targets = getOffscreenTargets();
      expect(targets).toHaveLength(3);

      store.removeOffscreenTarget(t2);

      targets = getOffscreenTargets();
      expect(targets).toHaveLength(2);
      expect(targets.find((t) => t.id === t2)).toBeUndefined();

      const consumerMap = new Map<string, string>();
      const cycle = detectCyclicDependency(targets, consumerMap);
      expect(cycle).toBeNull();

      const sorted = topologicalSortTargets(targets, consumerMap);
      expect(sorted).toHaveLength(2);
    });

    it("ソースレイヤー削除後に依存関係が正しく更新される", () => {
      const store = useOffscreenStore.getState();

      const targetId = store.addOffscreenTarget(512, 512);
      store.addSourceLayer(targetId, "layer-1");
      store.addSourceLayer(targetId, "layer-2");
      store.addSourceLayer(targetId, "layer-3");

      let targets = getOffscreenTargets();
      expect(targets[0]!.sourceLayerIds).toHaveLength(3);

      store.removeSourceLayer(targetId, "layer-2");

      targets = getOffscreenTargets();
      expect(targets[0]!.sourceLayerIds).toHaveLength(2);
      expect(targets[0]!.sourceLayerIds).toEqual(["layer-1", "layer-3"]);
    });

    it("同じレイヤーを重複追加しない", () => {
      const store = useOffscreenStore.getState();

      const targetId = store.addOffscreenTarget(512, 512);
      store.addSourceLayer(targetId, "layer-1");
      store.addSourceLayer(targetId, "layer-1");

      const targets = getOffscreenTargets();
      expect(targets[0]!.sourceLayerIds).toHaveLength(1);
    });
  });

  describe("バッファサイズ変更", () => {
    it("setBufferSizeでターゲットのサイズが正しく更新される", () => {
      const store = useOffscreenStore.getState();

      const targetId = store.addOffscreenTarget(512, 512);
      store.setBufferSize(targetId, 1024, 768);

      const targets = getOffscreenTargets();
      expect(targets[0]!.width).toBe(1024);
      expect(targets[0]!.height).toBe(768);
    });

    it("バッファサイズが最小値1にクランプされる", () => {
      const store = useOffscreenStore.getState();

      const targetId = store.addOffscreenTarget(512, 512);
      store.setBufferSize(targetId, 0, -10);

      const targets = getOffscreenTargets();
      expect(targets[0]!.width).toBe(1);
      expect(targets[0]!.height).toBe(1);
    });
  });
});
