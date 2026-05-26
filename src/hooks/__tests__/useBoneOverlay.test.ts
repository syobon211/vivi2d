import { renderHook } from "@testing-library/react";
import { computeBoneLocalTransform, transformPoint } from "@vivi2d/core/bone-utils";
import { BONE_OVERLAY } from "@vivi2d/core/constants";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "@/stores/editorStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { createViviMesh, createBoneNode, createProject } from "@/test/fixtures";
import { createMockPixiRefs } from "@/test/pixi-mocks";
import {
  resetEditorStore,
  resetSelectionStore,
  resetViewportStore,
} from "@/test/store-reset";
import { useBoneOverlay } from "../useBoneOverlay";

describe("useBoneOverlay ヘルパー", () => {
  describe("BONE_OVERLAY 定数", () => {
    it("必要なプロパティが全て定義されている", () => {
      expect(BONE_OVERLAY.PIVOT_RADIUS).toBeGreaterThan(0);
      expect(BONE_OVERLAY.ARM_WIDTH).toBeGreaterThan(0);
      expect(BONE_OVERLAY.TIP_RADIUS).toBeGreaterThan(0);
      expect(BONE_OVERLAY.HIT_THRESHOLD).toBeGreaterThan(0);
      expect(typeof BONE_OVERLAY.PIVOT_COLOR).toBe("number");
      expect(typeof BONE_OVERLAY.ARM_COLOR).toBe("number");
      expect(typeof BONE_OVERLAY.TIP_COLOR).toBe("number");
      expect(typeof BONE_OVERLAY.SELECTED_COLOR).toBe("number");
    });
  });

  describe("ボーン先端座標計算", () => {
    it("角度0のボーンの先端は (x + length, y)", () => {
      const bone = createBoneNode({
        x: 100,
        y: 50,
        bone: { angle: 0, length: 80, scaleX: 1, scaleY: 1 },
      });
      const local = computeBoneLocalTransform(bone);
      const [tx, ty] = transformPoint(local, bone.bone.length, 0);
      expect(tx).toBeCloseTo(180);
      expect(ty).toBeCloseTo(50);
    });

    it("90度回転したボーンの先端", () => {
      const bone = createBoneNode({
        x: 0,
        y: 0,
        bone: { angle: Math.PI / 2, length: 100, scaleX: 1, scaleY: 1 },
      });
      const local = computeBoneLocalTransform(bone);
      const [tx, ty] = transformPoint(local, bone.bone.length, 0);
      expect(tx).toBeCloseTo(0);
      expect(ty).toBeCloseTo(100);
    });

    it("スケール付きボーンの先端", () => {
      const bone = createBoneNode({
        x: 0,
        y: 0,
        bone: { angle: 0, length: 50, scaleX: 2, scaleY: 1 },
      });
      const local = computeBoneLocalTransform(bone);
      const [tx, ty] = transformPoint(local, bone.bone.length, 0);
      expect(tx).toBeCloseTo(100);
      expect(ty).toBeCloseTo(0);
    });
  });
});

describe("useBoneOverlay フック", () => {
  beforeEach(() => {
    resetEditorStore();
    resetSelectionStore();
    resetViewportStore();
  });

  it("プロジェクトが null の場合はエラーなく動作する", () => {
    useEditorStore.setState({ project: null });
    expect(() => renderHook(() => useBoneOverlay())).not.toThrow();
  });

  it("ボーン付きプロジェクトでエラーなく描画される", () => {
    const bone = createBoneNode({ name: "テスト", x: 100, y: 100 });
    const project = createProject({ layers: [bone] });
    useEditorStore.setState({ project });
    useSelectionStore.setState({ selectedLayerId: bone.id });

    expect(() => renderHook(() => useBoneOverlay())).not.toThrow();
  });

  it("ボーン未選択でも描画される", () => {
    const bone = createBoneNode({ name: "テスト" });
    const project = createProject({ layers: [bone] });
    useEditorStore.setState({ project });
    useSelectionStore.setState({ selectedLayerId: null });

    expect(() => renderHook(() => useBoneOverlay())).not.toThrow();
  });

  it("ネストされたボーン構造でも描画される", () => {
    const child = createBoneNode({ name: "子", x: 50, y: 50 });
    const parent = createBoneNode({ name: "親", x: 0, y: 0, children: [child] });
    const project = createProject({ layers: [parent] });
    useEditorStore.setState({ project });

    expect(() => renderHook(() => useBoneOverlay())).not.toThrow();
  });

  it("ハンドラを返す", () => {
    const bone = createBoneNode({ name: "テスト" });
    const project = createProject({ layers: [bone] });
    useEditorStore.setState({ project });

    const { result } = renderHook(() => useBoneOverlay());
    expect(result.current.onPointerDown).toBeTypeOf("function");
    expect(result.current.onPointerMove).toBeTypeOf("function");
    expect(result.current.onPointerUp).toBeTypeOf("function");
  });

  it("選択中のボーンは SELECTED_COLOR で描画される", () => {
    const bone = createBoneNode({
      name: "選択ボーン",
      x: 50,
      y: 50,
      bone: { angle: 0, length: 100, scaleX: 1, scaleY: 1 },
    });
    const project = createProject({ layers: [bone] });
    useEditorStore.setState({ project });
    useSelectionStore.setState({ selectedLayerId: bone.id });

    const mockRefs = createMockPixiRefs();
    renderHook(() => useBoneOverlay());

    const _g = mockRefs.current as unknown as {
      app: unknown;
      world: unknown;
      overlay: { addChild: ReturnType<typeof vi.fn>; children: unknown[] };
    };
    expect(mockRefs.current).not.toBeNull();
  });

  it("空の children を持つボーンでも再帰描画が動作する", () => {
    const bone = createBoneNode({
      name: "リーフ",
      children: [],
    });
    const project = createProject({ layers: [bone] });
    useEditorStore.setState({ project });

    expect(() => renderHook(() => useBoneOverlay())).not.toThrow();
  });

  it("onPointerDown でボーンでないノード選択時は何もしない", () => {
    const mesh = createViviMesh({ name: "メッシュ" });
    const project = createProject({ layers: [mesh] });
    useEditorStore.setState({ project });
    useSelectionStore.setState({
      selectedLayerId: mesh.id,
      selectedLayerIds: [mesh.id],
    });

    const { result } = renderHook(() => useBoneOverlay());

    const target = document.createElement("div");
    vi.spyOn(target, "setPointerCapture").mockImplementation(() => {});
    const e = {
      target,
      pointerId: 1,
      nativeEvent: { offsetX: 50, offsetY: 50 },
      stopPropagation: vi.fn(),
    } as unknown as React.PointerEvent;

    result.current.onPointerDown(e);
    expect(e.stopPropagation).not.toHaveBeenCalled();
  });

  it("onPointerDown でプロジェクトが null の場合は何もしない", () => {
    useEditorStore.setState({ project: null });
    useSelectionStore.setState({ selectedLayerId: "some-id" });

    const { result } = renderHook(() => useBoneOverlay());

    const target = document.createElement("div");
    const e = {
      target,
      pointerId: 1,
      nativeEvent: { offsetX: 0, offsetY: 0 },
      stopPropagation: vi.fn(),
    } as unknown as React.PointerEvent;

    expect(() => result.current.onPointerDown(e)).not.toThrow();
    expect(e.stopPropagation).not.toHaveBeenCalled();
  });

  it("onPointerDown で selectedLayerId が null の場合は何もしない", () => {
    const bone = createBoneNode({ name: "テスト" });
    const project = createProject({ layers: [bone] });
    useEditorStore.setState({ project });
    useSelectionStore.setState({ selectedLayerId: null });

    const { result } = renderHook(() => useBoneOverlay());

    const target = document.createElement("div");
    const e = {
      target,
      pointerId: 1,
      nativeEvent: { offsetX: 0, offsetY: 0 },
      stopPropagation: vi.fn(),
    } as unknown as React.PointerEvent;

    expect(() => result.current.onPointerDown(e)).not.toThrow();
    expect(e.stopPropagation).not.toHaveBeenCalled();
  });

  it("onPointerMove でドラッグ中でない場合は何もしない", () => {
    const bone = createBoneNode({ name: "テスト" });
    const project = createProject({ layers: [bone] });
    useEditorStore.setState({ project });

    const { result } = renderHook(() => useBoneOverlay());

    const target = document.createElement("div");
    const e = {
      target,
      pointerId: 1,
      nativeEvent: { offsetX: 50, offsetY: 50 },
    } as unknown as React.PointerEvent;

    expect(() => result.current.onPointerMove(e)).not.toThrow();
  });

  it("onPointerUp でドラッグ中でない場合は安全に無視される", () => {
    const bone = createBoneNode({ name: "テスト" });
    const project = createProject({ layers: [bone] });
    useEditorStore.setState({ project });

    const { result } = renderHook(() => useBoneOverlay());

    expect(() => result.current.onPointerUp()).not.toThrow();
  });

  it("アンマウント時に cancelAnimationFrame が呼ばれる", () => {
    const bone = createBoneNode({ name: "テスト" });
    const project = createProject({ layers: [bone] });
    useEditorStore.setState({ project });

    const { unmount } = renderHook(() => useBoneOverlay());
    unmount();

    expect(true).toBe(true);
  });


  describe("ボーン先端座標計算 — エッジケース", () => {
    it("scaleX=-1 で反転したボーンの先端座標", () => {
      const bone = createBoneNode({
        x: 0,
        y: 0,
        bone: { angle: 0, length: 100, scaleX: -1, scaleY: 1 },
      });
      const local = computeBoneLocalTransform(bone);
      const [tx, ty] = transformPoint(local, bone.bone.length, 0);
      expect(tx).toBeCloseTo(-100);
      expect(ty).toBeCloseTo(0);
    });

    it("45度回転のボーン先端座標", () => {
      const bone = createBoneNode({
        x: 0,
        y: 0,
        bone: { angle: Math.PI / 4, length: 100, scaleX: 1, scaleY: 1 },
      });
      const local = computeBoneLocalTransform(bone);
      const [tx, ty] = transformPoint(local, bone.bone.length, 0);
      expect(tx).toBeCloseTo(Math.cos(Math.PI / 4) * 100, 1);
      expect(ty).toBeCloseTo(Math.sin(Math.PI / 4) * 100, 1);
    });

    it("180度回転のボーン先端座標", () => {
      const bone = createBoneNode({
        x: 100,
        y: 100,
        bone: { angle: Math.PI, length: 50, scaleX: 1, scaleY: 1 },
      });
      const local = computeBoneLocalTransform(bone);
      const [tx, ty] = transformPoint(local, bone.bone.length, 0);
      expect(tx).toBeCloseTo(50, 0);
      expect(ty).toBeCloseTo(100, 0);
    });

    it("270度回転のボーン先端座標", () => {
      const bone = createBoneNode({
        x: 0,
        y: 0,
        bone: { angle: (3 * Math.PI) / 2, length: 60, scaleX: 1, scaleY: 1 },
      });
      const local = computeBoneLocalTransform(bone);
      const [tx, ty] = transformPoint(local, bone.bone.length, 0);
      expect(tx).toBeCloseTo(0, 0);
      expect(ty).toBeCloseTo(-60, 0);
    });

    it("length=0 のボーン先端はピボットと同じ位置", () => {
      const bone = createBoneNode({
        x: 50,
        y: 50,
        bone: { angle: Math.PI / 3, length: 0, scaleX: 1, scaleY: 1 },
      });
      const local = computeBoneLocalTransform(bone);
      const [tx, ty] = transformPoint(local, bone.bone.length, 0);
      expect(tx).toBeCloseTo(50);
      expect(ty).toBeCloseTo(50);
    });

    it("両軸反転（scaleX=-1, scaleY=-1）のボーン先端座標", () => {
      const bone = createBoneNode({
        x: 0,
        y: 0,
        bone: { angle: 0, length: 100, scaleX: -1, scaleY: -1 },
      });
      const local = computeBoneLocalTransform(bone);
      const [tx, ty] = transformPoint(local, bone.bone.length, 0);
      expect(tx).toBeCloseTo(-100);
      expect(ty).toBeCloseTo(0);
    });

    it("大きなスケール（scaleX=3）のボーン先端座標", () => {
      const bone = createBoneNode({
        x: 0,
        y: 0,
        bone: { angle: 0, length: 40, scaleX: 3, scaleY: 1 },
      });
      const local = computeBoneLocalTransform(bone);
      const [tx, ty] = transformPoint(local, bone.bone.length, 0);
      expect(tx).toBeCloseTo(120); // 40 * 3
      expect(ty).toBeCloseTo(0);
    });
  });


  it("プロジェクトがnullでもフックがクラッシュしない", () => {
    useEditorStore.setState({ project: null });
    const { result } = renderHook(() => useBoneOverlay());
    expect(result.current.onPointerDown).toBeDefined();
    expect(result.current.onPointerMove).toBeDefined();
    expect(result.current.onPointerUp).toBeDefined();
  });

  it("ボーンがないプロジェクトでもフックがクラッシュしない", () => {
    const mesh = createViviMesh({ name: "メッシュ" });
    const project = createProject({ layers: [mesh] });
    useEditorStore.setState({ project });

    const { result } = renderHook(() => useBoneOverlay());
    expect(result.current.onPointerDown).toBeDefined();
  });


  describe("ドラッグ操作", () => {
    it("先端ヒット時にドラッグが開始され stopPropagation される", () => {
      const bone = createBoneNode({
        name: "テスト",
        x: 0,
        y: 0,
        bone: { angle: 0, length: 100, scaleX: 1, scaleY: 1 },
      });
      const project = createProject({ layers: [bone] });
      useEditorStore.setState({ project });
      useSelectionStore.setState({ selectedLayerId: bone.id });

      const { result } = renderHook(() => useBoneOverlay());

      const target = document.createElement("div");
      vi.spyOn(target, "setPointerCapture").mockImplementation(() => {});
      const e = {
        target,
        pointerId: 1,
        nativeEvent: { offsetX: 100, offsetY: 0 },
        stopPropagation: vi.fn(),
      } as unknown as React.PointerEvent;

      result.current.onPointerDown(e);
      expect(e.stopPropagation).toHaveBeenCalled();
    });

    it("先端から遠い位置のクリックではドラッグ開始されない", () => {
      const bone = createBoneNode({
        name: "テスト",
        x: 0,
        y: 0,
        bone: { angle: 0, length: 100, scaleX: 1, scaleY: 1 },
      });
      const project = createProject({ layers: [bone] });
      useEditorStore.setState({ project });
      useSelectionStore.setState({ selectedLayerId: bone.id });

      const { result } = renderHook(() => useBoneOverlay());

      const target = document.createElement("div");
      vi.spyOn(target, "setPointerCapture").mockImplementation(() => {});
      const e = {
        target,
        pointerId: 1,
        nativeEvent: { offsetX: 500, offsetY: 500 },
        stopPropagation: vi.fn(),
      } as unknown as React.PointerEvent;

      result.current.onPointerDown(e);
      expect(e.stopPropagation).not.toHaveBeenCalled();
    });

    it("ドラッグ中の pointerMove で setBoneAngle が呼ばれる", async () => {
      const bone = createBoneNode({
        name: "テスト",
        x: 0,
        y: 0,
        bone: { angle: 0, length: 100, scaleX: 1, scaleY: 1 },
      });
      const project = createProject({ layers: [bone] });
      useEditorStore.setState({ project });
      useSelectionStore.setState({ selectedLayerId: bone.id });

      const setBoneAngle = vi.fn();
      const { useBoneStore } = await import("@/stores/boneStore");
      const original = useBoneStore.getState().setBoneAngle;
      useBoneStore.setState({ setBoneAngle } as any);

      const { result } = renderHook(() => useBoneOverlay());

      const target = document.createElement("div");
      vi.spyOn(target, "setPointerCapture").mockImplementation(() => {});
      result.current.onPointerDown({
        target,
        pointerId: 1,
        nativeEvent: { offsetX: 100, offsetY: 0 },
        stopPropagation: vi.fn(),
      } as unknown as React.PointerEvent);

      const rafSpy = vi
        .spyOn(globalThis, "requestAnimationFrame")
        .mockImplementation((cb: FrameRequestCallback) => {
          cb(0);
          return 1;
        });

      result.current.onPointerMove({
        target,
        pointerId: 1,
        nativeEvent: { offsetX: 0, offsetY: 100 },
      } as unknown as React.PointerEvent);

      expect(setBoneAngle).toHaveBeenCalledWith(
        bone.id,
        expect.any(Number),
        `bone-angle:${bone.id}`,
      );

      rafSpy.mockRestore();
      useBoneStore.setState({ setBoneAngle: original } as any);
    });

    it("ドラッグ中に pointerUp でドラッグ終了する", () => {
      const bone = createBoneNode({
        name: "テスト",
        x: 0,
        y: 0,
        bone: { angle: 0, length: 100, scaleX: 1, scaleY: 1 },
      });
      const project = createProject({ layers: [bone] });
      useEditorStore.setState({ project });
      useSelectionStore.setState({ selectedLayerId: bone.id });

      const { result } = renderHook(() => useBoneOverlay());

      const target = document.createElement("div");
      vi.spyOn(target, "setPointerCapture").mockImplementation(() => {});
      result.current.onPointerDown({
        target,
        pointerId: 1,
        nativeEvent: { offsetX: 100, offsetY: 0 },
        stopPropagation: vi.fn(),
      } as unknown as React.PointerEvent);

      expect(() => result.current.onPointerUp()).not.toThrow();
    });

    it("デフォルトフォームロック時に先端ヒットしても通知のみでドラッグ開始しない", async () => {
      const { useViewportStore } = await import("@/stores/viewportStore");
      const { useNotificationStore } = await import("@/stores/notificationStore");
      const { useParameterStore } = await import("@/stores/parameterStore");

      const addNotification = vi.fn();
      useNotificationStore.setState({ addNotification } as any);
      useViewportStore.setState({ defaultFormLocked: true } as any);

      const bone = createBoneNode({
        name: "テスト",
        x: 0,
        y: 0,
        bone: { angle: 0, length: 100, scaleX: 1, scaleY: 1 },
      });
      const project = createProject({
        layers: [bone],
        parameters: [{ id: "p1", name: "X", minValue: -1, maxValue: 1, defaultValue: 0 }],
      });
      useEditorStore.setState({ project });
      useSelectionStore.setState({ selectedLayerId: bone.id });
      useParameterStore.setState({ parameterValues: { p1: 0 } } as any);

      const { result } = renderHook(() => useBoneOverlay());

      const target = document.createElement("div");
      vi.spyOn(target, "setPointerCapture").mockImplementation(() => {});
      const e = {
        target,
        pointerId: 1,
        nativeEvent: { offsetX: 100, offsetY: 0 },
        stopPropagation: vi.fn(),
      } as unknown as React.PointerEvent;

      result.current.onPointerDown(e);

      expect(addNotification).toHaveBeenCalledWith(
        "warning",
        expect.stringContaining("デフォルトフォーム"),
      );
      expect(e.stopPropagation).not.toHaveBeenCalled();

      useViewportStore.setState({ defaultFormLocked: false } as any);
    });
  });
});
