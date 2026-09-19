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

    it("複数選択の完全置換・空入力・clearと最後の頂点のトグル解除", () => {
      const { selectVertices, clearSelection, toggleVertex } = useMeshEditStore.getState();
      selectVertices([0, 2, 4]);
      expect(useMeshEditStore.getState().selectedVertices).toEqual([0, 2, 4]);
      selectVertices([5]);
      expect(useMeshEditStore.getState().selectedVertices).toEqual([5]);
      selectVertices([]);
      expect(useMeshEditStore.getState().selectedVertices).toEqual([]);
      toggleVertex(2);
      expect(useMeshEditStore.getState().selectedVertices).toEqual([2]);
      toggleVertex(2);
      expect(useMeshEditStore.getState().selectedVertices).toEqual([]);
      selectVertices([1, 2, 3]);
      clearSelection();
      expect(useMeshEditStore.getState().selectedVertices).toEqual([]);
    });





    it("selectVertex 後に toggleVertex で追加できる", () => {
      useMeshEditStore.getState().selectVertex(0);
      useMeshEditStore.getState().toggleVertex(3);
      expect(useMeshEditStore.getState().selectedVertices).toEqual([0, 3]);
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


    it("浮動小数点座標が正確に保存される", () => {
      useMeshEditStore.getState().startLasso();
      useMeshEditStore.getState().addLassoPoint(10.5, 20.333);
      const pts = useMeshEditStore.getState().lassoPoints;
      expect(pts[0]).toBe(10.5);
      expect(pts[1]).toBe(20.333);
    });

  });
});
