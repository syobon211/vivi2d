import { beforeEach, describe, expect, it } from "vitest";
import { useMultiViewStore } from "@/stores/multiViewStore";

describe("multiViewStore", () => {
  beforeEach(() => {
    useMultiViewStore.setState({
      enabled: false,
      views: [],
      layout: "horizontal",
      activeViewId: null,
    });
  });

  it("初期状態は disabled", () => {
    const s = useMultiViewStore.getState();
    expect(s.enabled).toBe(false);
    expect(s.views).toEqual([]);
  });

  it("enableMultiView で horizontal 2分割を有効化", () => {
    useMultiViewStore.getState().enableMultiView("horizontal");
    const s = useMultiViewStore.getState();
    expect(s.enabled).toBe(true);
    expect(s.views).toHaveLength(2);
    expect(s.layout).toBe("horizontal");
    expect(s.activeViewId).toBe("view-0");
  });

  it("enableMultiView で quad 4分割を有効化", () => {
    useMultiViewStore.getState().enableMultiView("quad");
    const s = useMultiViewStore.getState();
    expect(s.views).toHaveLength(4);
    expect(s.layout).toBe("quad");
  });

  it("disableMultiView で無効化", () => {
    useMultiViewStore.getState().enableMultiView("horizontal");
    useMultiViewStore.getState().disableMultiView();
    const s = useMultiViewStore.getState();
    expect(s.enabled).toBe(false);
    expect(s.views).toEqual([]);
    expect(s.activeViewId).toBeNull();
  });

  it("setViewParamOverride でパラメータオーバーライドを設定", () => {
    useMultiViewStore.getState().enableMultiView("horizontal");
    useMultiViewStore.getState().setViewParamOverride("view-0", "param1", 0.5);
    const view = useMultiViewStore.getState().views.find((v) => v.id === "view-0");
    expect(view?.parameterOverrides).toEqual({ param1: 0.5 });
  });

  it("removeViewParamOverride でオーバーライドを削除", () => {
    useMultiViewStore.getState().enableMultiView("horizontal");
    useMultiViewStore.getState().setViewParamOverride("view-0", "param1", 0.5);
    useMultiViewStore.getState().removeViewParamOverride("view-0", "param1");
    const view = useMultiViewStore.getState().views.find((v) => v.id === "view-0");
    expect(view?.parameterOverrides).toEqual({});
  });

  it("setViewZoom / setViewPan でビューのズーム/パンを変更", () => {
    useMultiViewStore.getState().enableMultiView("horizontal");
    useMultiViewStore.getState().setViewZoom("view-1", 2.0);
    useMultiViewStore.getState().setViewPan("view-1", 100, 200);
    const view = useMultiViewStore.getState().views.find((v) => v.id === "view-1");
    expect(view?.zoom).toBe(2.0);
    expect(view?.panX).toBe(100);
    expect(view?.panY).toBe(200);
  });

  it("setLayout でレイアウト変更時にビューが再生成される", () => {
    useMultiViewStore.getState().enableMultiView("horizontal");
    useMultiViewStore.getState().setLayout("quad");
    const s = useMultiViewStore.getState();
    expect(s.layout).toBe("quad");
    expect(s.views).toHaveLength(4);
  });

  it("setActiveView でアクティブビューを切り替える", () => {
    useMultiViewStore.getState().enableMultiView("horizontal");
    expect(useMultiViewStore.getState().activeViewId).toBe("view-0");

    useMultiViewStore.getState().setActiveView("view-1");
    expect(useMultiViewStore.getState().activeViewId).toBe("view-1");
  });

  it("disabled 状態で setLayout を呼んでも状態は変わらない", () => {
    useMultiViewStore.getState().setLayout("quad");
    const s = useMultiViewStore.getState();
    expect(s.enabled).toBe(false);
    expect(s.views).toEqual([]);
    expect(s.layout).toBe("horizontal");
  });
});
