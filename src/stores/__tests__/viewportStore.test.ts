import { beforeEach, describe, expect, it } from "vitest";
import { useViewportStore } from "@/stores/viewportStore";
import { resetViewportStore } from "@/test/store-reset";

describe("viewportStore", () => {
  beforeEach(() => resetViewportStore());

  describe("初期状態", () => {
    it("デフォルト値が正しい", () => {
      const state = useViewportStore.getState();
      expect(state.zoom).toBe(1);
      expect(state.panX).toBe(0);
      expect(state.panY).toBe(0);
      expect(state.activeTool).toBe("select");
    });
  });

  describe("setZoom", () => {
    it("ズーム値を設定する", () => {
      useViewportStore.getState().setZoom(2.5);
      expect(useViewportStore.getState().zoom).toBe(2.5);
    });

    it("ズーム値を 0.05〜32 にクランプする", () => {
      useViewportStore.getState().setZoom(0.001);
      expect(useViewportStore.getState().zoom).toBe(0.05);

      useViewportStore.getState().setZoom(100);
      expect(useViewportStore.getState().zoom).toBe(32);
    });
  });

  describe("setPan", () => {
    it("パン位置を設定する", () => {
      useViewportStore.getState().setPan(150, -50);
      const state = useViewportStore.getState();
      expect(state.panX).toBe(150);
      expect(state.panY).toBe(-50);
    });
  });

  describe("adjustZoom", () => {
    it("中心点を基準にズームインする", () => {
      useViewportStore.getState().setPan(0, 0);
      useViewportStore.getState().setZoom(1);

      useViewportStore.getState().adjustZoom(1, 400, 300);
      const state = useViewportStore.getState();

      expect(state.zoom).toBeGreaterThan(1);
      expect(state.panX).toBeLessThan(0);
      expect(state.panY).toBeLessThan(0);
    });

    it("負の delta でズームアウトする", () => {
      useViewportStore.getState().setZoom(2);
      useViewportStore.getState().adjustZoom(-1, 400, 300);
      expect(useViewportStore.getState().zoom).toBeLessThan(2);
    });

    it("最小ズーム (0.05) を下回らない", () => {
      useViewportStore.getState().setZoom(0.06);
      useViewportStore.getState().adjustZoom(-1, 0, 0);
      expect(useViewportStore.getState().zoom).toBeGreaterThanOrEqual(0.05);
    });

    it("最大ズーム (32) を超えない", () => {
      useViewportStore.getState().setZoom(31);
      useViewportStore.getState().adjustZoom(1, 0, 0);
      expect(useViewportStore.getState().zoom).toBeLessThanOrEqual(32);
    });
  });

  describe("setTool", () => {
    it("アクティブツールを切り替える", () => {
      useViewportStore.getState().setTool("pan");
      expect(useViewportStore.getState().activeTool).toBe("pan");

      useViewportStore.getState().setTool("select");
      expect(useViewportStore.getState().activeTool).toBe("select");
    });

    it("meshEdit ツールに切り替えられる", () => {
      useViewportStore.getState().setTool("meshEdit");
      expect(useViewportStore.getState().activeTool).toBe("meshEdit");
    });
  });

  describe("resetView", () => {
    it("ビューを初期状態に戻す", () => {
      const store = useViewportStore.getState();
      store.setZoom(5);
      store.setPan(300, 200);

      store.resetView();
      const state = useViewportStore.getState();
      expect(state.zoom).toBe(1);
      expect(state.panX).toBe(0);
      expect(state.panY).toBe(0);
    });
  });

  describe("toggleDefaultFormLock", () => {
    it("デフォルトフォームロックを切り替える", () => {
      expect(useViewportStore.getState().defaultFormLocked).toBe(false);

      useViewportStore.getState().toggleDefaultFormLock();
      expect(useViewportStore.getState().defaultFormLocked).toBe(true);

      useViewportStore.getState().toggleDefaultFormLock();
      expect(useViewportStore.getState().defaultFormLocked).toBe(false);
    });
  });

  describe("toggleOnionSkin", () => {
    it("オニオンスキンの有効/無効を切り替える", () => {
      expect(useViewportStore.getState().onionSkin.enabled).toBe(false);

      useViewportStore.getState().toggleOnionSkin();
      expect(useViewportStore.getState().onionSkin.enabled).toBe(true);

      useViewportStore.getState().toggleOnionSkin();
      expect(useViewportStore.getState().onionSkin.enabled).toBe(false);
    });

    it("他のオニオンスキン設定は保持される", () => {
      useViewportStore.getState().setOnionSkinSettings({ framesBefore: 5, opacity: 0.5 });

      useViewportStore.getState().toggleOnionSkin();

      const state = useViewportStore.getState().onionSkin;
      expect(state.enabled).toBe(true);
      expect(state.framesBefore).toBe(5);
      expect(state.opacity).toBe(0.5);
    });
  });

  describe("setOnionSkinSettings", () => {
    it("オニオンスキン設定を部分的に更新する", () => {
      useViewportStore.getState().setOnionSkinSettings({ framesBefore: 10 });

      const state = useViewportStore.getState().onionSkin;
      expect(state.framesBefore).toBe(10);
      expect(state.framesAfter).toBe(3);
    });

    it("複数の設定を同時に更新する", () => {
      useViewportStore.getState().setOnionSkinSettings({
        framesBefore: 5,
        framesAfter: 7,
        opacity: 0.8,
      });

      const state = useViewportStore.getState().onionSkin;
      expect(state.framesBefore).toBe(5);
      expect(state.framesAfter).toBe(7);
      expect(state.opacity).toBe(0.8);
    });
  });
});
