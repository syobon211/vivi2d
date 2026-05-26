import { beforeEach, describe, expect, it } from "vitest";
import { useMeshEditStore } from "@/stores/meshEditStore";

function reset() {
  useMeshEditStore.setState({
    selectedVertices: [],
    lassoActive: false,
    lassoPoints: [],
  });
}

describe("meshEditStore", () => {
  beforeEach(reset);

  describe("頂点選択", () => {
    it("selectVertex で単一選択（既存選択をクリア）", () => {
      useMeshEditStore.getState().selectVertex(3);
      expect(useMeshEditStore.getState().selectedVertices).toEqual([3]);

      useMeshEditStore.getState().selectVertex(5);
      expect(useMeshEditStore.getState().selectedVertices).toEqual([5]);
    });

    it("toggleVertex で選択をトグル", () => {
      useMeshEditStore.getState().toggleVertex(1);
      useMeshEditStore.getState().toggleVertex(3);
      expect(useMeshEditStore.getState().selectedVertices).toEqual([1, 3]);

      useMeshEditStore.getState().toggleVertex(1);
      expect(useMeshEditStore.getState().selectedVertices).toEqual([3]);
    });

    it("selectVertices で複数選択", () => {
      useMeshEditStore.getState().selectVertices([0, 2, 4]);
      expect(useMeshEditStore.getState().selectedVertices).toEqual([0, 2, 4]);
    });

    it("clearSelection で選択をクリア", () => {
      useMeshEditStore.getState().selectVertices([1, 2, 3]);
      useMeshEditStore.getState().clearSelection();
      expect(useMeshEditStore.getState().selectedVertices).toEqual([]);
    });

    it("同一頂点を toggleVertex しても重複しない", () => {
      useMeshEditStore.getState().toggleVertex(2);
      useMeshEditStore.getState().toggleVertex(2);
      expect(useMeshEditStore.getState().selectedVertices).toEqual([]);
    });

    it("selectVertex 後に toggleVertex で追加できる", () => {
      useMeshEditStore.getState().selectVertex(0);
      useMeshEditStore.getState().toggleVertex(3);
      expect(useMeshEditStore.getState().selectedVertices).toEqual([0, 3]);
    });

    it("selectVertices は既存選択を完全に上書きする", () => {
      useMeshEditStore.getState().selectVertices([0, 1, 2]);
      useMeshEditStore.getState().selectVertices([5]);
      expect(useMeshEditStore.getState().selectedVertices).toEqual([5]);
    });

    it("空配列で selectVertices すると選択がクリアされる", () => {
      useMeshEditStore.getState().selectVertices([1, 2]);
      useMeshEditStore.getState().selectVertices([]);
      expect(useMeshEditStore.getState().selectedVertices).toEqual([]);
    });
  });

  describe("投げ縄", () => {
    it("startLasso → addLassoPoint → endLasso のライフサイクル", () => {
      useMeshEditStore.getState().startLasso();
      expect(useMeshEditStore.getState().lassoActive).toBe(true);
      expect(useMeshEditStore.getState().lassoPoints).toEqual([]);

      useMeshEditStore.getState().addLassoPoint(10, 20);
      useMeshEditStore.getState().addLassoPoint(30, 40);
      expect(useMeshEditStore.getState().lassoPoints).toEqual([10, 20, 30, 40]);

      useMeshEditStore.getState().endLasso();
      expect(useMeshEditStore.getState().lassoActive).toBe(false);
      expect(useMeshEditStore.getState().lassoPoints).toEqual([]);
    });

    it("endLasso 後に addLassoPoint しても蓄積されない", () => {
      useMeshEditStore.getState().startLasso();
      useMeshEditStore.getState().endLasso();
      useMeshEditStore.getState().addLassoPoint(5, 5);
      expect(useMeshEditStore.getState().lassoActive).toBe(false);
    });

    it("浮動小数点座標が正確に保存される", () => {
      useMeshEditStore.getState().startLasso();
      useMeshEditStore.getState().addLassoPoint(10.5, 20.333);
      const pts = useMeshEditStore.getState().lassoPoints;
      expect(pts[0]).toBe(10.5);
      expect(pts[1]).toBe(20.333);
    });

    it("大量のポイントを蓄積できる", () => {
      useMeshEditStore.getState().startLasso();
      for (let i = 0; i < 500; i++) {
        useMeshEditStore.getState().addLassoPoint(i, i * 2);
      }
      expect(useMeshEditStore.getState().lassoPoints).toHaveLength(1000);
    });
  });
});
