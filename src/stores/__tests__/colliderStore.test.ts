import { act } from "@testing-library/react";
import type { ColliderData } from "@vivi2d/core/types";
import { beforeEach, describe, expect, it } from "vitest";
import { useColliderStore } from "@/stores/colliderStore";
import { useEditorStore } from "@/stores/editorStore";
import { createViviMesh, createProject } from "@/test/fixtures";
import { resetColliderStore, resetEditorStore } from "@/test/store-reset";


function setupProject(colliders: ColliderData[] = []) {
  const project = createProject({ colliders });
  useEditorStore.setState({ project });
  return project;
}

function getColliders(): ColliderData[] {
  return useEditorStore.getState().project?.colliders ?? [];
}


describe("colliderStore", () => {
  beforeEach(() => {
    resetEditorStore();
    resetColliderStore();
  });

  describe("selectedColliderId", () => {
    it("初期値はnull", () => {
      expect(useColliderStore.getState().selectedColliderId).toBeNull();
    });

    it("selectColliderで設定・解除できる", () => {
      act(() => useColliderStore.getState().selectCollider("test-id"));
      expect(useColliderStore.getState().selectedColliderId).toBe("test-id");

      act(() => useColliderStore.getState().selectCollider(null));
      expect(useColliderStore.getState().selectedColliderId).toBeNull();
    });
  });

  describe("addRectCollider", () => {
    it("矩形コライダーを追加してIDを返す", () => {
      setupProject();
      let id: string;
      act(() => {
        id = useColliderStore.getState().addRectCollider("テスト", 10, 20, 100, 50);
      });
      expect(id!).toMatch(/\S/);
      const c = getColliders();
      expect(c).toHaveLength(1);
      expect(c[0]!.name).toBe("テスト");
      expect(c[0]!.shape).toEqual({
        type: "rectangle",
        x: 10,
        y: 20,
        width: 100,
        height: 50,
      });
      expect(c[0]!.enabled).toBe(true);
    });

    it("returns an empty id when no project is loaded", () => {
      const id = useColliderStore
        .getState()
        .addRectCollider("missing", 0, 0, 1, 1);

      expect(id).toBe("");
    });

    it("ignores no-project mutations without throwing", () => {
      const actions = useColliderStore.getState();

      expect(actions.addCircleCollider("missing", 0, 0, 1)).toBe("");
      expect(actions.addMeshCollider("missing", "mesh-id")).toBe("");
      expect(() => actions.removeCollider("missing")).not.toThrow();
      expect(() => actions.toggleCollider("missing")).not.toThrow();
      expect(() => actions.renameCollider("missing", "name")).not.toThrow();
      expect(() => actions.setTag("missing", "tag")).not.toThrow();
      expect(() => actions.updateShape("missing", { x: 1 })).not.toThrow();
      expect(actions.addMeshCollidersFromSelection(["mesh-id"])).toBe(0);
    });
  });

  describe("addCircleCollider", () => {
    it("円コライダーを追加してIDを返す", () => {
      setupProject();
      act(() => {
        useColliderStore.getState().addCircleCollider("円", 50, 60, 30);
      });
      const c = getColliders();
      expect(c).toHaveLength(1);
      expect(c[0]!.shape).toEqual({ type: "circle", x: 50, y: 60, radius: 30 });
    });
  });

  describe("addMeshCollider", () => {
    it("メッシュコライダーを追加してIDを返す", () => {
      setupProject();
      act(() => {
        useColliderStore.getState().addMeshCollider("メッシュ", "mesh-layer-1");
      });
      const c = getColliders();
      expect(c).toHaveLength(1);
      expect(c[0]!.shape).toEqual({ type: "mesh", meshId: "mesh-layer-1" });
    });
  });

  describe("removeCollider", () => {
    it("コライダーを削除する", () => {
      setupProject();
      let id: string;
      act(() => {
        id = useColliderStore.getState().addRectCollider("削除対象", 0, 0, 1, 1);
      });
      act(() => useColliderStore.getState().removeCollider(id!));
      expect(getColliders()).toHaveLength(0);
    });

    it("選択中のコライダーを削除すると選択がクリアされる", () => {
      setupProject();
      let id: string;
      act(() => {
        id = useColliderStore.getState().addRectCollider("削除対象", 0, 0, 1, 1);
        useColliderStore.getState().selectCollider(id!);
      });
      expect(useColliderStore.getState().selectedColliderId).toBe(id!);

      act(() => useColliderStore.getState().removeCollider(id!));
      expect(useColliderStore.getState().selectedColliderId).toBeNull();
    });

    it("未選択のコライダーを削除しても選択状態は変わらない", () => {
      setupProject();
      let id1: string;
      let id2: string;
      act(() => {
        id1 = useColliderStore.getState().addRectCollider("残る", 0, 0, 1, 1);
        id2 = useColliderStore.getState().addRectCollider("消える", 0, 0, 1, 1);
        useColliderStore.getState().selectCollider(id1!);
      });

      act(() => useColliderStore.getState().removeCollider(id2!));
      expect(useColliderStore.getState().selectedColliderId).toBe(id1!);
    });

    it("存在しないIDを削除してもクラッシュしない", () => {
      setupProject();
      act(() => useColliderStore.getState().removeCollider("nonexistent"));
      expect(getColliders()).toHaveLength(0);
    });
  });

  describe("toggleCollider", () => {
    it("有効/無効を切り替える", () => {
      setupProject();
      let id: string;
      act(() => {
        id = useColliderStore.getState().addRectCollider("トグル", 0, 0, 1, 1);
      });
      expect(getColliders()[0]!.enabled).toBe(true);

      act(() => useColliderStore.getState().toggleCollider(id!));
      expect(getColliders()[0]!.enabled).toBe(false);

      act(() => useColliderStore.getState().toggleCollider(id!));
      expect(getColliders()[0]!.enabled).toBe(true);
    });
  });

  describe("updateShape — 型安全性", () => {
    it("同じ型の形状プロパティを更新できる", () => {
      setupProject();
      let id: string;
      act(() => {
        id = useColliderStore.getState().addRectCollider("矩形", 0, 0, 100, 100);
      });

      act(() => {
        useColliderStore
          .getState()
          .updateShape(id!, { x: 50, y: 50, width: 200, height: 150 });
      });

      const shape = getColliders()[0]!.shape;
      expect(shape.type).toBe("rectangle");
      if (shape.type === "rectangle") {
        expect(shape.x).toBe(50);
        expect(shape.y).toBe(50);
        expect(shape.width).toBe(200);
        expect(shape.height).toBe(150);
      }
    });

    it("異なる型のtypeを指定した場合は更新が拒否される", () => {
      setupProject();
      let id: string;
      act(() => {
        id = useColliderStore.getState().addRectCollider("矩形", 10, 20, 100, 50);
      });

      act(() => {
        useColliderStore.getState().updateShape(id!, { type: "circle" } as any);
      });

      expect(getColliders()[0]!.shape.type).toBe("rectangle");
    });

    it("円コライダーの半径を更新できる", () => {
      setupProject();
      let id: string;
      act(() => {
        id = useColliderStore.getState().addCircleCollider("円", 100, 100, 50);
      });

      act(() => {
        useColliderStore.getState().updateShape(id!, { radius: 80 });
      });

      const shape = getColliders()[0]!.shape;
      if (shape.type === "circle") {
        expect(shape.radius).toBe(80);
      }
    });

    it("存在しないIDでは何もしない", () => {
      setupProject();
      act(() => {
        useColliderStore.getState().addRectCollider("矩形", 0, 0, 100, 100);
      });

      act(() => {
        useColliderStore.getState().updateShape("nonexistent", { x: 999 });
      });

      const shape = getColliders()[0]!.shape;
      if (shape.type === "rectangle") {
        expect(shape.x).toBe(0);
      }
    });
  });

  describe("renameCollider", () => {
    it("名前を変更する", () => {
      setupProject();
      let id: string;
      act(() => {
        id = useColliderStore.getState().addRectCollider("旧名", 0, 0, 1, 1);
      });
      act(() => useColliderStore.getState().renameCollider(id!, "新名"));
      expect(getColliders()[0]!.name).toBe("新名");
    });
  });

  describe("setTag", () => {
    it("タグを設定する", () => {
      setupProject();
      let id: string;
      act(() => {
        id = useColliderStore.getState().addRectCollider("タグ", 0, 0, 1, 1);
      });
      act(() => useColliderStore.getState().setTag(id!, "head"));
      expect(getColliders()[0]!.tag).toBe("head");
    });

    it("タグをundefinedで解除する", () => {
      setupProject();
      let id: string;
      act(() => {
        id = useColliderStore.getState().addRectCollider("タグ", 0, 0, 1, 1);
        useColliderStore.getState().setTag(id!, "head");
      });
      act(() => useColliderStore.getState().setTag(id!, undefined));
      expect(getColliders()[0]!.tag).toBeUndefined();
    });
  });

  describe("addMeshCollidersFromSelection", () => {
    it("ViviMeshIDからメッシュコライダーを一括追加できる", () => {
      const meshA = createViviMesh({ name: "顔" });
      const meshB = createViviMesh({ name: "体" });
      setupProject([]);
      useEditorStore.setState({
        project: createProject({ layers: [meshA, meshB], colliders: [] }),
      });

      let count: number;
      act(() => {
        count = useColliderStore
          .getState()
          .addMeshCollidersFromSelection([meshA.id, meshB.id]);
      });

      expect(count!).toBe(2);
      const colliders = getColliders();
      expect(colliders).toHaveLength(2);
      expect(colliders[0]!.name).toBe("顔");
      expect(colliders[0]!.shape.type).toBe("mesh");
      expect(colliders[1]!.name).toBe("体");
    });

    it("同じメッシュのコライダーが既にある場合はスキップする", () => {
      const mesh = createViviMesh({ name: "顔" });
      setupProject([]);
      useEditorStore.setState({
        project: createProject({ layers: [mesh], colliders: [] }),
      });

      act(() => {
        useColliderStore.getState().addMeshCollidersFromSelection([mesh.id]);
      });
      expect(getColliders()).toHaveLength(1);

      let count: number;
      act(() => {
        count = useColliderStore.getState().addMeshCollidersFromSelection([mesh.id]);
      });
      expect(count!).toBe(0);
      expect(getColliders()).toHaveLength(1);
    });

    it("ViviMeshでないIDは無視される", () => {
      const mesh = createViviMesh({ name: "顔" });
      setupProject([]);
      useEditorStore.setState({
        project: createProject({ layers: [mesh], colliders: [] }),
      });

      let count: number;
      act(() => {
        count = useColliderStore
          .getState()
          .addMeshCollidersFromSelection(["nonexistent-id"]);
      });
      expect(count!).toBe(0);
      expect(getColliders()).toHaveLength(0);
    });

    it("プロジェクトがnullの場合は0を返す", () => {
      useEditorStore.setState({ project: null });
      let count: number;
      act(() => {
        count = useColliderStore.getState().addMeshCollidersFromSelection(["any-id"]);
      });
      expect(count!).toBe(0);
    });
  });
});
