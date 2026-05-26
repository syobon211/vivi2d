import { act } from "@testing-library/react";
import { hitTestColliders, pointInCircle, pointInRect } from "@vivi2d/core/collider";
import type { ColliderData } from "@vivi2d/core/types";
import { beforeEach, describe, expect, it } from "vitest";
import { hitTestBody } from "@/hooks/useColliderOverlay";
import { useColliderStore } from "@/stores/colliderStore";
import { useEditorStore } from "@/stores/editorStore";
import { createProject } from "@/test/fixtures";
import { resetColliderStore, resetEditorStore } from "@/test/store-reset";


describe("colliderStore → core hitTest engine 統合", () => {
  beforeEach(() => {
    resetEditorStore();
    resetColliderStore();
    const project = createProject({ colliders: [] });
    useEditorStore.setState({ project });
  });

  function getColliders(): ColliderData[] {
    return useEditorStore.getState().project!.colliders;
  }

  it("ストアで追加した矩形コライダーが core の hitTestColliders でヒットする", () => {
    act(() => {
      useColliderStore.getState().addRectCollider("頭", 100, 100, 200, 150);
    });

    const colliders = getColliders();
    const emptyMeshStates = new Map();

    const hit = hitTestColliders(colliders, emptyMeshStates, 200, 175);
    expect(hit).not.toBeNull();
    expect(hit!.colliderName).toBe("頭");

    const miss = hitTestColliders(colliders, emptyMeshStates, 50, 50);
    expect(miss).toBeNull();
  });

  it("ストアで追加した円コライダーが core の hitTestColliders でヒットする", () => {
    act(() => {
      useColliderStore.getState().addCircleCollider("ほっぺ", 300, 300, 80);
    });

    const colliders = getColliders();
    const emptyMeshStates = new Map();

    const hit = hitTestColliders(colliders, emptyMeshStates, 300, 300);
    expect(hit).not.toBeNull();
    expect(hit!.colliderName).toBe("ほっぺ");

    const miss = hitTestColliders(colliders, emptyMeshStates, 300, 381);
    expect(miss).toBeNull();
  });

  it("無効化コライダーは core engine でヒットしない", () => {
    let id: string;
    act(() => {
      id = useColliderStore.getState().addRectCollider("無効", 0, 0, 100, 100);
      useColliderStore.getState().toggleCollider(id!);
    });

    const colliders = getColliders();
    expect(colliders[0]!.enabled).toBe(false);

    const hit = hitTestColliders(colliders, new Map(), 50, 50);
    expect(hit).toBeNull();
  });

  it("updateShape で変更した形状が core engine に反映される", () => {
    let id: string;
    act(() => {
      id = useColliderStore.getState().addRectCollider("移動", 0, 0, 50, 50);
    });

    let colliders = getColliders();
    expect(hitTestColliders(colliders, new Map(), 25, 25)).not.toBeNull();

    act(() => {
      useColliderStore.getState().updateShape(id!, { x: 500, y: 500 });
    });

    colliders = getColliders();
    expect(hitTestColliders(colliders, new Map(), 25, 25)).toBeNull();
    expect(hitTestColliders(colliders, new Map(), 525, 525)).not.toBeNull();
  });

  it("重なった複数コライダーでいずれかがヒットする", () => {
    act(() => {
      useColliderStore.getState().addRectCollider("A", 0, 0, 200, 200);
      useColliderStore.getState().addRectCollider("B", 50, 50, 100, 100);
    });

    const colliders = getColliders();
    const hit = hitTestColliders(colliders, new Map(), 75, 75);
    expect(hit).not.toBeNull();
    expect(["A", "B"]).toContain(hit!.colliderName);
  });

  it("タグ付きコライダーのヒット結果にタグが含まれる", () => {
    let id: string;
    act(() => {
      id = useColliderStore.getState().addCircleCollider("頭", 100, 100, 50);
      useColliderStore.getState().setTag(id!, "head");
    });

    const colliders = getColliders();
    const hit = hitTestColliders(colliders, new Map(), 100, 100);
    expect(hit).not.toBeNull();
    expect(hit!.tag).toBe("head");
  });

  it("削除したコライダーは core engine でヒットしない", () => {
    let id: string;
    act(() => {
      id = useColliderStore.getState().addRectCollider("削除対象", 0, 0, 100, 100);
    });
    expect(hitTestColliders(getColliders(), new Map(), 50, 50)).not.toBeNull();

    act(() => {
      useColliderStore.getState().removeCollider(id!);
    });
    expect(hitTestColliders(getColliders(), new Map(), 50, 50)).toBeNull();
  });

  it("core の pointInRect/pointInCircle とオーバーレイの hitTestBody が同じ結果を返す", () => {
    const rect: ColliderData = {
      id: "r",
      name: "r",
      shape: { type: "rectangle", x: 10, y: 20, width: 100, height: 50 },
      enabled: true,
    };

    const testPoints = [
      [10, 20],
      [110, 70],
      [10, 70],
      [110, 20],
      [60, 45],
      [9, 20],
      [111, 70],
    ];
    for (const [x, y] of testPoints) {
      const overlayResult = hitTestBody(rect, x!, y!);
      const coreResult = pointInRect(x!, y!, 10, 20, 100, 50);
      expect(overlayResult).toBe(coreResult);
    }

    const circle: ColliderData = {
      id: "c",
      name: "c",
      shape: { type: "circle", x: 100, y: 100, radius: 50 },
      enabled: true,
    };
    const circlePoints = [
      [100, 100],
      [150, 100],
      [100, 150],
      [151, 100],
      [100, 151],
    ];
    for (const [x, y] of circlePoints) {
      const overlayResult = hitTestBody(circle, x!, y!);
      const coreResult = pointInCircle(x!, y!, 100, 100, 50);
      expect(overlayResult).toBe(coreResult);
    }
  });
});
