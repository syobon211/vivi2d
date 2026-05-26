import { computeBoneWorldTransforms } from "@vivi2d/core/bone-utils";
import { computeSkinnedVertices } from "@vivi2d/core/skin-utils";
import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "@/stores/editorStore";
import { _resetMergeTimer } from "@/stores/historyStore";
import { useSkinStore } from "@/stores/skinStore";
import { createViviMesh, createBoneNode, createProject } from "@/test/fixtures";
import { resetEditorStore, resetHistoryStore, resetSkinStore } from "@/test/store-reset";

beforeEach(() => {
  resetEditorStore();
  resetHistoryStore();
  resetSkinStore();
  _resetMergeTimer();
});

function setup() {
  const bone1 = createBoneNode({ name: "ボーン1", x: 10, y: 0 });
  const bone2 = createBoneNode({ name: "ボーン2", x: 50, y: 0 });
  const mesh = createViviMesh({ name: "テストメッシュ" });
  const project = createProject({
    layers: [bone1, bone2, mesh],
    skins: {},
  });
  useEditorStore.setState({ project });
  return { bone1, bone2, mesh, actions: useSkinStore.getState() };
}

describe("skinStore", () => {
  describe("bindSkin", () => {
    it("メッシュにスキンデータを割り当てる", () => {
      const { bone1, bone2, mesh, actions } = setup();

      actions.bindSkin(mesh.id, [bone1.id, bone2.id]);

      const project = useEditorStore.getState().project!;
      const skin = project.skins![mesh.id]!;
      expect(skin).toBeDefined();
      expect(skin.weights.length).toBeGreaterThan(0);
      expect(Object.keys(skin.bindPoseInverse)).toHaveLength(2);
    });

    it("全頂点に均等ウェイトが設定される", () => {
      const { bone1, bone2, mesh, actions } = setup();

      actions.bindSkin(mesh.id, [bone1.id, bone2.id]);

      const project = useEditorStore.getState().project!;
      const skin = project.skins![mesh.id]!;
      const firstVertex = skin.weights[0]!;
      expect(firstVertex).toHaveLength(2);
      expect(firstVertex[0]!.weight).toBeCloseTo(0.5);
      expect(firstVertex[1]!.weight).toBeCloseTo(0.5);
    });

    it("バインドポーズ逆行列が設定される", () => {
      const { bone1, mesh, actions } = setup();

      actions.bindSkin(mesh.id, [bone1.id]);

      const project = useEditorStore.getState().project!;
      const skin = project.skins![mesh.id]!;
      const inv = skin.bindPoseInverse[bone1.id]!;
      expect(inv).toHaveLength(6);
    });

    it("keeps nested bone bind pose visually unchanged", () => {
      const root = createBoneNode({ x: 100, y: 40 });
      const child = createBoneNode({ x: 20, y: 30, parentBoneId: root.id });
      root.children = [child];
      const mesh = createViviMesh({ width: 120, height: 80 });
      const project = createProject({ layers: [root, mesh], skins: {} });
      useEditorStore.setState({ project });

      useSkinStore.getState().bindSkin(mesh.id, [root.id, child.id]);

      const updated = useEditorStore.getState().project!;
      const skin = updated.skins![mesh.id]!;
      const worldTransforms = computeBoneWorldTransforms(updated.layers);
      const skinned = computeSkinnedVertices(mesh.mesh.vertices, skin, worldTransforms);

      expect(skinned).toHaveLength(mesh.mesh.vertices.length);
      for (let i = 0; i < skinned.length; i++) {
        expect(skinned[i]!).toBeCloseTo(mesh.mesh.vertices[i]!, 6);
      }
    });

    it("skins が未初期化でも割り当てできる", () => {
      const bone = createBoneNode();
      const mesh = createViviMesh();
      const project = createProject({ layers: [bone, mesh] });
      delete (project as unknown as Record<string, unknown>).skins;
      useEditorStore.setState({ project });

      useSkinStore.getState().bindSkin(mesh.id, [bone.id]);

      const updated = useEditorStore.getState().project!;
      expect(updated.skins![mesh.id]).toBeDefined();
    });
  });

  describe("unbindSkin", () => {
    it("スキンデータを解除する", () => {
      const { bone1, mesh, actions } = setup();
      actions.bindSkin(mesh.id, [bone1.id]);

      actions.unbindSkin(mesh.id);

      const project = useEditorStore.getState().project!;
      expect(project.skins![mesh.id]).toBeUndefined();
    });
  });

  describe("setVertexWeights", () => {
    it("特定頂点のウェイトを置換する", () => {
      const { bone1, bone2, mesh, actions } = setup();
      actions.bindSkin(mesh.id, [bone1.id, bone2.id]);

      actions.setVertexWeights(mesh.id, 0, [{ boneId: bone1.id, weight: 1 }]);

      const project = useEditorStore.getState().project!;
      const vw = project.skins![mesh.id]!.weights[0]!;
      expect(vw).toHaveLength(1);
      expect(vw[0]!.boneId).toBe(bone1.id);
      expect(vw[0]!.weight).toBe(1);
    });

    it("範囲外のインデックスでは何もしない", () => {
      const { bone1, mesh, actions } = setup();
      actions.bindSkin(mesh.id, [bone1.id]);

      const before = useEditorStore.getState().project!.skins![mesh.id]!.weights.length;
      actions.setVertexWeights(mesh.id, 9999, [{ boneId: bone1.id, weight: 1 }]);
      const after = useEditorStore.getState().project!.skins![mesh.id]!.weights.length;
      expect(after).toBe(before);
    });
  });

  describe("paintWeight", () => {
    it("既存ボーンのウェイトを更新して正規化する", () => {
      const { bone1, bone2, mesh, actions } = setup();
      actions.bindSkin(mesh.id, [bone1.id, bone2.id]);

      actions.paintWeight(mesh.id, 0, bone1.id, 0.8);

      const project = useEditorStore.getState().project!;
      const vw = project.skins![mesh.id]!.weights[0]!;
      const total = vw.reduce((s, w) => s + w.weight, 0);
      expect(total).toBeCloseTo(1);
    });

    it("新しいボーンIDを追加する", () => {
      const { bone1, mesh, actions } = setup();
      actions.bindSkin(mesh.id, [bone1.id]);
      const newBoneId = "new-bone-id";

      actions.paintWeight(mesh.id, 0, newBoneId, 0.5);

      const project = useEditorStore.getState().project!;
      const vw = project.skins![mesh.id]!.weights[0]!;
      expect(vw.some((w) => w.boneId === newBoneId)).toBe(true);
    });
  });

  describe("normalizeAllWeights", () => {
    it("全頂点のウェイト合計を1にする", () => {
      const { bone1, bone2, mesh, actions } = setup();
      actions.bindSkin(mesh.id, [bone1.id, bone2.id]);

      actions.normalizeAllWeights(mesh.id);

      const project = useEditorStore.getState().project!;
      const skin = project.skins![mesh.id]!;
      for (const vw of skin.weights) {
        const total = vw.reduce((s, w) => s + w.weight, 0);
        expect(total).toBeCloseTo(1);
      }
    });

    it("バインドされていないメッシュでは何もしない", () => {
      setup();
      expect(() =>
        useSkinStore.getState().normalizeAllWeights("nonexistent"),
      ).not.toThrow();
    });
  });

  describe("autoWeights", () => {
    it("距離ベースの自動ウェイトを計算する", () => {
      const { bone1, bone2, mesh, actions } = setup();
      actions.bindSkin(mesh.id, [bone1.id, bone2.id]);

      actions.autoWeights(mesh.id);

      const project = useEditorStore.getState().project!;
      const skin = project.skins![mesh.id]!;
      expect(skin.weights.length).toBeGreaterThan(0);
      for (const vw of skin.weights) {
        const total = vw.reduce((s, w) => s + w.weight, 0);
        expect(total).toBeCloseTo(1, 1);
      }
    });

    it("バインドされていないメッシュでは何もしない", () => {
      setup();
      expect(() => useSkinStore.getState().autoWeights("nonexistent")).not.toThrow();
    });

    it("スキンはあるがメッシュが見つからない場合は何もしない", () => {
      const { bone1, actions } = setup();
      const fakeMeshId = "no-such-mesh";
      useEditorStore.setState((s) => {
        if (s.project) {
          s.project.skins[fakeMeshId] = {
            weights: [[{ boneId: bone1.id, weight: 1 }]],
            bindPoseInverse: { [bone1.id]: [1, 0, 0, 1, 0, 0] },
          };
        }
      });

      expect(() => actions.autoWeights(fakeMeshId)).not.toThrow();
    });
  });

  describe("paintWeightBrush", () => {
    it("add モードでブラシ範囲内の頂点にウェイトを追加する", () => {
      const { bone1, bone2, mesh, actions } = setup();
      actions.bindSkin(mesh.id, [bone1.id, bone2.id]);

      actions.paintWeightBrush(mesh.id, 50, 50, 200, bone1.id, 0.5, "add");

      const project = useEditorStore.getState().project!;
      const skin = project.skins![mesh.id]!;
      expect(skin.weights.length).toBeGreaterThan(0);
      for (const vw of skin.weights) {
        const total = vw.reduce((s, w) => s + w.weight, 0);
        if (total > 0) expect(total).toBeCloseTo(1, 1);
      }
    });

    it("subtract モードでウェイトを減算する", () => {
      const { bone1, bone2, mesh, actions } = setup();
      actions.bindSkin(mesh.id, [bone1.id, bone2.id]);

      actions.paintWeightBrush(mesh.id, 50, 50, 200, bone1.id, 0.3, "subtract");

      const project = useEditorStore.getState().project!;
      const skin = project.skins![mesh.id]!;
      expect(skin.weights.length).toBeGreaterThan(0);
    });

    it("smooth モードでウェイトを平滑化する", () => {
      const { bone1, bone2, mesh, actions } = setup();
      actions.bindSkin(mesh.id, [bone1.id, bone2.id]);
      actions.setVertexWeights(mesh.id, 0, [
        { boneId: bone1.id, weight: 1.0 },
        { boneId: bone2.id, weight: 0.0 },
      ]);

      actions.paintWeightBrush(mesh.id, 0, 0, 200, bone1.id, 0.5, "smooth");

      const project = useEditorStore.getState().project!;
      const skin = project.skins![mesh.id]!;
      expect(skin.weights.length).toBeGreaterThan(0);
    });

    it("バインドされていないメッシュでは何もしない", () => {
      setup();
      expect(() =>
        useSkinStore
          .getState()
          .paintWeightBrush("nonexistent", 50, 50, 100, "bone", 0.5, "add"),
      ).not.toThrow();
    });

    it("ブラシ範囲外の頂点は影響を受けない", () => {
      const { bone1, bone2, mesh, actions } = setup();
      actions.bindSkin(mesh.id, [bone1.id, bone2.id]);
      const before = JSON.parse(
        JSON.stringify(useEditorStore.getState().project!.skins![mesh.id]!.weights),
      );

      actions.paintWeightBrush(mesh.id, 99999, 99999, 1, bone1.id, 0.5, "add");

      const after = useEditorStore.getState().project!.skins![mesh.id]!.weights;
      expect(JSON.stringify(after)).toBe(JSON.stringify(before));
    });

    it("subtract モードで既存ウェイトがゼロ以下になると除去される", () => {
      const { bone1, bone2, mesh, actions } = setup();
      actions.bindSkin(mesh.id, [bone1.id, bone2.id]);

      actions.paintWeightBrush(mesh.id, 0, 0, 1000, bone1.id, 10, "add");

      actions.paintWeightBrush(mesh.id, 0, 0, 1000, bone1.id, 10, "subtract");

      const skin = useEditorStore.getState().project!.skins![mesh.id]!;
      const vw = skin.weights[0]!;
      const bone1Weight = vw.find((w) => w.boneId === bone1.id);
      if (bone1Weight) {
        expect(bone1Weight.weight).toBeLessThanOrEqual(0.001);
      }
    });

    it("add モードで新規ボーンIDが追加される（delta > 0 分岐）", () => {
      const { bone1, bone2, mesh, actions } = setup();
      actions.bindSkin(mesh.id, [bone1.id]);

      actions.paintWeightBrush(mesh.id, 0, 0, 1000, bone2.id, 5, "add");

      const skin = useEditorStore.getState().project!.skins![mesh.id]!;
      const vw = skin.weights[0]!;
      const hasBone2 = vw.some((w) => w.boneId === bone2.id);
      expect(hasBone2).toBe(true);
    });

    it("subtract モードで存在しないボーンIDは追加されない（delta <= 0 分岐）", () => {
      const { bone1, bone2, mesh, actions } = setup();
      actions.bindSkin(mesh.id, [bone1.id]);

      actions.paintWeightBrush(mesh.id, 0, 0, 1000, bone2.id, 5, "subtract");

      const skin = useEditorStore.getState().project!.skins![mesh.id]!;
      const vw = skin.weights[0]!;
      const hasBone2 = vw.some((w) => w.boneId === bone2.id);
      expect(hasBone2).toBe(false);
    });
  });

  describe("bindSkin — 追加分岐", () => {
    it("ボーンなしでバインドすると equalWeight が 0 になる", () => {
      const { mesh, actions } = setup();
      actions.bindSkin(mesh.id, []);

      const skin = useEditorStore.getState().project!.skins![mesh.id]!;
      expect(skin.weights[0]).toEqual([]);
    });

    it("特異行列（det≈0）のボーンでは単位行列フォールバック", () => {
      const bone = createBoneNode({
        name: "特異ボーン",
        x: 0,
        y: 0,
        bone: { angle: 0, length: 0, scaleX: 0, scaleY: 0 },
      });
      const mesh = createViviMesh({ name: "テストメッシュ" });
      const project = createProject({
        layers: [bone, mesh],
        skins: {},
      });
      useEditorStore.setState({ project });

      useSkinStore.getState().bindSkin(mesh.id, [bone.id]);

      const skin = useEditorStore.getState().project!.skins![mesh.id]!;
      expect(skin.bindPoseInverse[bone.id]).toEqual([1, 0, 0, 1, 0, 0]);
    });
  });

  describe("bindSkin — メッシュ不在", () => {
    it("存在しないメッシュIDでは何もしない", () => {
      const { bone1, actions } = setup();

      actions.bindSkin("nonexistent-mesh", [bone1.id]);

      const project = useEditorStore.getState().project!;
      expect(project.skins!["nonexistent-mesh"]).toBeUndefined();
    });

    it("viviMesh以外のノードIDでは何もしない", () => {
      const bone = createBoneNode({ name: "ボーン" });
      const mesh = createViviMesh({ name: "テスト" });
      const project = createProject({ layers: [bone, mesh], skins: {} });
      useEditorStore.setState({ project });

      useSkinStore.getState().bindSkin(bone.id, [bone.id]);

      const updated = useEditorStore.getState().project!;
      expect(updated.skins![bone.id]).toBeUndefined();
    });

    it("boneMapに存在しないボーンIDはbindPoseInverseに含まれない", () => {
      const { mesh, actions } = setup();

      actions.bindSkin(mesh.id, ["nonexistent-bone"]);

      const skin = useEditorStore.getState().project!.skins![mesh.id]!;
      expect(skin.bindPoseInverse["nonexistent-bone"]).toBeUndefined();
    });
  });

  describe("unbindSkin — エッジケース", () => {
    it("skins が undefined でもエラーにならない", () => {
      const { mesh } = setup();
      expect(() => useSkinStore.getState().unbindSkin(mesh.id)).not.toThrow();
    });
  });

  describe("setVertexWeights — エッジケース", () => {
    it("負のインデックスでは何もしない", () => {
      const { bone1, mesh, actions } = setup();
      actions.bindSkin(mesh.id, [bone1.id]);

      const before = useEditorStore.getState().project!.skins![mesh.id]!.weights.length;
      actions.setVertexWeights(mesh.id, -1, [{ boneId: bone1.id, weight: 1 }]);
      const after = useEditorStore.getState().project!.skins![mesh.id]!.weights.length;
      expect(after).toBe(before);
    });

    it("スキンが存在しないメッシュIDでは何もしない", () => {
      setup();
      expect(() =>
        useSkinStore.getState().setVertexWeights("nonexistent", 0, []),
      ).not.toThrow();
    });
  });

  describe("paintWeight — エッジケース", () => {
    it("スキンが存在しないメッシュIDでは何もしない", () => {
      setup();
      expect(() =>
        useSkinStore.getState().paintWeight("nonexistent", 0, "bone", 0.5),
      ).not.toThrow();
    });

    it("負のインデックスでは何もしない", () => {
      const { bone1, mesh, actions } = setup();
      actions.bindSkin(mesh.id, [bone1.id]);

      expect(() => actions.paintWeight(mesh.id, -1, bone1.id, 0.5)).not.toThrow();
    });

    it("範囲外のインデックスでは何もしない", () => {
      const { bone1, mesh, actions } = setup();
      actions.bindSkin(mesh.id, [bone1.id]);

      expect(() => actions.paintWeight(mesh.id, 99999, bone1.id, 0.5)).not.toThrow();
    });
  });

  describe("paintWeightBrush — smooth影響なし", () => {
    it("smooth モードでブラシ範囲内に頂点がない場合は何もしない", () => {
      const { bone1, bone2, mesh, actions } = setup();
      actions.bindSkin(mesh.id, [bone1.id, bone2.id]);
      const before = JSON.parse(
        JSON.stringify(useEditorStore.getState().project!.skins![mesh.id]!.weights),
      );

      actions.paintWeightBrush(mesh.id, 99999, 99999, 1, bone1.id, 0.5, "smooth");

      const after = useEditorStore.getState().project!.skins![mesh.id]!.weights;
      expect(JSON.stringify(after)).toBe(JSON.stringify(before));
    });
  });

  describe("paintWeightBrush — メッシュ不在", () => {
    it("スキンはあるがメッシュが見つからない場合は何もしない", () => {
      const { bone1, actions } = setup();
      const fakeMeshId = "no-such-mesh";
      useEditorStore.setState((s) => {
        if (s.project) {
          s.project.skins[fakeMeshId] = {
            weights: [[{ boneId: bone1.id, weight: 1 }]],
            bindPoseInverse: { [bone1.id]: [1, 0, 0, 1, 0, 0] },
          };
        }
      });

      expect(() =>
        actions.paintWeightBrush(fakeMeshId, 0, 0, 100, bone1.id, 0.5, "add"),
      ).not.toThrow();
    });
  });

  describe("normalizeAllWeights — スキン不在", () => {
    it("skins にメッシュIDがない場合は何もしない", () => {
      setup();
      expect(() => useSkinStore.getState().normalizeAllWeights("no-mesh")).not.toThrow();
    });
  });

  describe("ボーン親子階層でのスキンバインド", () => {
    function setupHierarchy() {
      const grandchild = createBoneNode({ name: "孫ボーン", x: 30, y: 10 });
      const child = createBoneNode({
        name: "子ボーン",
        x: 30,
        y: 50,
        children: [grandchild],
      });
      const root = createBoneNode({ name: "ルートボーン", x: 50, y: 80 });
      root.children = [child];
      (child as any).parentBoneId = root.id;
      (grandchild as any).parentBoneId = child.id;
      const mesh = createViviMesh({ name: "テストメッシュ" });
      const project = createProject({
        layers: [root, mesh],
        skins: {},
      });
      useEditorStore.setState({ project });
      return { root, child, grandchild, mesh, actions: useSkinStore.getState() };
    }

    it("3段階層の全ボーンにバインドできる", () => {
      const { root, child, grandchild, mesh, actions } = setupHierarchy();

      actions.bindSkin(mesh.id, [root.id, child.id, grandchild.id]);

      const project = useEditorStore.getState().project!;
      const skin = project.skins![mesh.id]!;
      expect(skin).toBeDefined();
      expect(Object.keys(skin.bindPoseInverse)).toHaveLength(3);
      expect(skin.bindPoseInverse[root.id]).toBeDefined();
      expect(skin.bindPoseInverse[child.id]).toBeDefined();
      expect(skin.bindPoseInverse[grandchild.id]).toBeDefined();
    });

    it("階層の一部のボーンのみにバインドできる", () => {
      const { root, grandchild, mesh, actions } = setupHierarchy();

      actions.bindSkin(mesh.id, [root.id, grandchild.id]);

      const project = useEditorStore.getState().project!;
      const skin = project.skins![mesh.id]!;
      expect(Object.keys(skin.bindPoseInverse)).toHaveLength(2);
    });

    it("階層ボーンのウェイトを設定できる", () => {
      const { root, child, grandchild, mesh, actions } = setupHierarchy();

      actions.bindSkin(mesh.id, [root.id, child.id, grandchild.id]);
      actions.setVertexWeights(mesh.id, 0, [
        { boneId: root.id, weight: 0.5 },
        { boneId: child.id, weight: 0.3 },
        { boneId: grandchild.id, weight: 0.2 },
      ]);

      const project = useEditorStore.getState().project!;
      const skin = project.skins![mesh.id]!;
      const vw = skin.weights[0]!;
      expect(vw).toHaveLength(3);
      const total = vw.reduce((sum, w) => sum + w.weight, 0);
      expect(total).toBeCloseTo(1.0, 5);
    });

    it("階層ボーンでウェイト正規化が正しく動作する", () => {
      const { root, child, mesh, actions } = setupHierarchy();

      actions.bindSkin(mesh.id, [root.id, child.id]);

      actions.setVertexWeights(mesh.id, 0, [
        { boneId: root.id, weight: 0.6 },
        { boneId: child.id, weight: 0.6 },
      ]);

      actions.normalizeAllWeights(mesh.id);

      const project = useEditorStore.getState().project!;
      const skin = project.skins![mesh.id]!;
      const vw = skin.weights[0]!;
      const total = vw.reduce((sum, w) => sum + w.weight, 0);
      expect(total).toBeCloseTo(1.0, 5);
    });

    it("空のボーン配列でバインドしても例外を投げない", () => {
      const { mesh, actions } = setupHierarchy();
      expect(() => actions.bindSkin(mesh.id, [])).not.toThrow();
    });
  });

  describe("applyAccessoryFollowRig", () => {
    it("creates a managed rigid follow skin for the selected mesh and bone", () => {
      const { bone1, mesh } = setup();

      const result = useSkinStore.getState().applyAccessoryFollowRig(mesh.id, bone1.id);

      expect(result.status).toBe("created");
      const skin = useEditorStore.getState().project!.skins[mesh.id]!;
      expect(skin.managedTag).toBe(`accessoryFollowRig:v1:mesh=${mesh.id}`);
      expect(skin.managedSignature).toBe(`${mesh.id}|${bone1.id}|16`);
    });

    it("returns noProject when no project is loaded", () => {
      useEditorStore.setState({ project: null });

      const result = useSkinStore.getState().applyAccessoryFollowRig("mesh", "bone");

      expect(result).toEqual({ status: "rejected", reason: "noProject" });
    });
  });
});
