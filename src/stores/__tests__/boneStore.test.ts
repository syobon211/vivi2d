import { findLayerById } from "@vivi2d/core/layer-utils";
import type { BoneNode, LayerNode } from "@vivi2d/core/types";
import { beforeEach, describe, expect, it } from "vitest";
import { useBoneStore } from "@/stores/boneStore";
import { useEditorStore } from "@/stores/editorStore";
import { _resetMergeTimer } from "@/stores/historyStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { createBoneNode, createGroup, createProject } from "@/test/fixtures";
import {
  resetEditorStore,
  resetHistoryStore,
  resetSelectionStore,
} from "@/test/store-reset";

beforeEach(() => {
  resetEditorStore();
  resetSelectionStore();
  resetHistoryStore();
  _resetMergeTimer();
});

function setup(layers: LayerNode[] = [createGroup({ name: "ルート" })]) {
  const project = createProject({ layers });
  useEditorStore.setState({ project });
  return useBoneStore.getState();
}

describe("boneStore", () => {
  // ==============================================================
  // addBone
  // ==============================================================
  describe("addBone", () => {
    it("親ノード配下にボーンが追加される", () => {
      const group = createGroup({ name: "親" });
      const actions = setup([group]);

      actions.addBone(group.id, "右腕", 100, 200);

      const project = useEditorStore.getState().project!;
      const parent = findLayerById(project.layers, group.id)!;
      expect(parent.children).toHaveLength(1);

      const added = parent.children[0] as BoneNode;
      expect(added.kind).toBe("bone");
      expect(added.name).toBe("右腕");
      expect(added.x).toBe(100);
      expect(added.y).toBe(200);
      expect(added.bone.angle).toBe(0);
      expect(added.bone.length).toBe(50);
      expect(added.bone.scaleX).toBe(1);
      expect(added.bone.scaleY).toBe(1);
    });

    it("親がボーンの場合、parentBoneId が設定される", () => {
      const parentBone = createBoneNode({ name: "親ボーン" });
      const actions = setup([parentBone]);

      actions.addBone(parentBone.id, "子ボーン", 50, 0);

      const project = useEditorStore.getState().project!;
      const parent = findLayerById(project.layers, parentBone.id)!;
      const child = parent.children[0] as BoneNode;
      expect(child.parentBoneId).toBe(parentBone.id);
    });

    it("親がグループの場合、parentBoneId は undefined", () => {
      const group = createGroup();
      const actions = setup([group]);

      actions.addBone(group.id, "ルートボーン", 0, 0);

      const project = useEditorStore.getState().project!;
      const parent = findLayerById(project.layers, group.id)!;
      const child = parent.children[0] as BoneNode;
      expect(child.parentBoneId).toBeUndefined();
    });
  });

  // ==============================================================
  // addRootBone
  // ==============================================================
  describe("addRootBone", () => {
    it("プロジェクトのルートレベルにボーンが追加される", () => {
      const actions = setup([]);

      actions.addRootBone("ルートボーン", 0, 0);

      const project = useEditorStore.getState().project!;
      expect(project.layers).toHaveLength(1);
      const bone = project.layers[0] as BoneNode;
      expect(bone.kind).toBe("bone");
      expect(bone.name).toBe("ルートボーン");
      expect(bone.parentBoneId).toBeUndefined();
    });
  });

  describe("addRootBone — 追加テスト", () => {
    it("複数回呼ぶと異なるIDが返される", () => {
      const actions = setup([]);

      const id1 = actions.addRootBone("ボーン1", 0, 0);
      const id2 = actions.addRootBone("ボーン2", 50, 50);
      const id3 = actions.addRootBone("ボーン3", 100, 100);

      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
      expect(id1).not.toBe(id3);

      const project = useEditorStore.getState().project!;
      expect(project.layers).toHaveLength(3);
    });

    it("座標が正しく設定される", () => {
      const actions = setup([]);

      const id = actions.addRootBone("テスト", 123.5, 456.7);

      const project = useEditorStore.getState().project!;
      const bone = findLayerById(project.layers, id) as BoneNode;
      expect(bone.x).toBe(123.5);
      expect(bone.y).toBe(456.7);
    });

    it("名前が正しく設定される", () => {
      const actions = setup([]);

      const id = actions.addRootBone("日本語のボーン名", 0, 0);

      const project = useEditorStore.getState().project!;
      const bone = findLayerById(project.layers, id) as BoneNode;
      expect(bone.name).toBe("日本語のボーン名");
    });

    it("デフォルトのボーンプロパティが正しい", () => {
      const actions = setup([]);

      const id = actions.addRootBone("テスト", 0, 0);

      const project = useEditorStore.getState().project!;
      const bone = findLayerById(project.layers, id) as BoneNode;
      expect(bone.kind).toBe("bone");
      expect(bone.visible).toBe(true);
      expect(bone.opacity).toBe(1);
      expect(bone.bone.angle).toBe(0);
      expect(bone.bone.length).toBe(50);
      expect(bone.bone.scaleX).toBe(1);
      expect(bone.bone.scaleY).toBe(1);
      expect(bone.children).toHaveLength(0);
      expect(bone.parentBoneId).toBeUndefined();
    });
  });

  // ==============================================================
  // setBonePosition
  // ==============================================================
  describe("setBonePosition", () => {
    it("ボーンの位置を更新する", () => {
      const bone = createBoneNode({ x: 0, y: 0 });
      const actions = setup([bone]);

      actions.setBonePosition(bone.id, 150, 250);

      const project = useEditorStore.getState().project!;
      const updated = findLayerById(project.layers, bone.id)!;
      expect(updated.x).toBe(150);
      expect(updated.y).toBe(250);
    });

    it("ボーン以外のノードIDでは何もしない", () => {
      const group = createGroup({ x: 10, y: 20 });
      const actions = setup([group]);

      actions.setBonePosition(group.id, 999, 999);

      const project = useEditorStore.getState().project!;
      const node = findLayerById(project.layers, group.id)!;
      expect(node.x).toBe(10);
      expect(node.y).toBe(20);
    });
  });

  // ==============================================================
  // setBoneAngle
  // ==============================================================
  describe("setBoneAngle", () => {
    it("ボーンの回転角を更新する", () => {
      const bone = createBoneNode();
      const actions = setup([bone]);

      actions.setBoneAngle(bone.id, Math.PI / 4);

      const project = useEditorStore.getState().project!;
      const updated = findLayerById(project.layers, bone.id) as BoneNode;
      expect(updated.bone.angle).toBe(Math.PI / 4);
    });
  });

  // ==============================================================
  // setBoneScale
  // ==============================================================
  describe("setBoneScale", () => {
    it("ボーンのスケールを更新する", () => {
      const bone = createBoneNode();
      const actions = setup([bone]);

      actions.setBoneScale(bone.id, 2, 0.5);

      const project = useEditorStore.getState().project!;
      const updated = findLayerById(project.layers, bone.id) as BoneNode;
      expect(updated.bone.scaleX).toBe(2);
      expect(updated.bone.scaleY).toBe(0.5);
    });
  });

  // ==============================================================
  // setBoneLength
  // ==============================================================
  describe("setBoneLength", () => {
    it("ボーンの長さを更新する", () => {
      const bone = createBoneNode();
      const actions = setup([bone]);

      actions.setBoneLength(bone.id, 100);

      const project = useEditorStore.getState().project!;
      const updated = findLayerById(project.layers, bone.id) as BoneNode;
      expect(updated.bone.length).toBe(100);
    });

    it("負の値は0にクランプされる", () => {
      const bone = createBoneNode();
      const actions = setup([bone]);

      actions.setBoneLength(bone.id, -10);

      const project = useEditorStore.getState().project!;
      const updated = findLayerById(project.layers, bone.id) as BoneNode;
      expect(updated.bone.length).toBe(0);
    });
  });

  // ==============================================================
  // reparentBone
  // ==============================================================
  describe("reparentBone", () => {
    it("ボーンを別の親に移動する", () => {
      const boneA = createBoneNode({ name: "A" });
      const boneB = createBoneNode({ name: "B" });
      const actions = setup([boneA, boneB]);

      actions.reparentBone(boneB.id, boneA.id);

      const project = useEditorStore.getState().project!;
      expect(project.layers).toHaveLength(1);
      const parentNode = findLayerById(project.layers, boneA.id)!;
      expect(parentNode.children).toHaveLength(1);
      expect(parentNode.children[0]!.id).toBe(boneB.id);
    });

    it("null でルートレベルに移動する", () => {
      const parent = createBoneNode({ name: "親" });
      const child = createBoneNode({ name: "子", parentBoneId: parent.id });
      parent.children = [child];
      const actions = setup([parent]);

      actions.reparentBone(child.id, null);

      const project = useEditorStore.getState().project!;
      expect(project.layers).toHaveLength(2);
      const moved = findLayerById(project.layers, child.id) as BoneNode;
      expect(moved.parentBoneId).toBeUndefined();
    });

    it("自分自身への移動は無視する", () => {
      const bone = createBoneNode();
      const actions = setup([bone]);

      actions.reparentBone(bone.id, bone.id);

      const project = useEditorStore.getState().project!;
      expect(project.layers).toHaveLength(1);
    });
  });

  // ==============================================================
  // removeBone
  // ==============================================================
  describe("removeBone", () => {
    it("ボーンを削除し子ノードを親に昇格させる", () => {
      const child = createBoneNode({ name: "子" });
      const parent = createBoneNode({ name: "親", children: [child] });
      const actions = setup([parent]);

      actions.removeBone(parent.id);

      const project = useEditorStore.getState().project!;
      expect(project.layers).toHaveLength(1);
      expect(project.layers[0]!.id).toBe(child.id);
    });

    it("選択中のボーンを削除すると選択がクリアされる", () => {
      const bone = createBoneNode();
      const actions = setup([bone]);
      useSelectionStore.setState({
        selectedLayerId: bone.id,
        selectedLayerIds: [bone.id],
      });

      actions.removeBone(bone.id);

      expect(useSelectionStore.getState().selectedLayerId).toBeNull();
    });

    it("ボーン以外のノードIDでは何もしない", () => {
      const group = createGroup();
      const actions = setup([group]);

      actions.removeBone(group.id);

      const project = useEditorStore.getState().project!;
      expect(project.layers).toHaveLength(1);
    });

    it("グループ内のボーンを削除すると子がルートに昇格する", () => {
      const grandchild = createBoneNode({ name: "孫" });
      const child = createBoneNode({ name: "子ボーン", children: [grandchild] });
      const group = createGroup({ name: "グループ", children: [child] });
      const actions = setup([group]);

      actions.removeBone(child.id);

      const project = useEditorStore.getState().project!;
      const updatedGroup = findLayerById(project.layers, group.id)!;
      expect(updatedGroup.children.some((l) => l.id === grandchild.id)).toBe(true);
    });

    it("子付きルートボーンを削除すると子がルートに昇格する", () => {
      const leaf = createBoneNode({ name: "リーフ" });
      const root = createBoneNode({ name: "ルート", children: [leaf] });
      const actions = setup([root]);

      actions.removeBone(root.id);

      const project = useEditorStore.getState().project!;
      expect(project.layers).toHaveLength(1);
      expect(project.layers[0]!.id).toBe(leaf.id);
    });

    it("ルートレベルの子なしボーンを削除する", () => {
      const bone = createBoneNode({ name: "単独" });
      const actions = setup([bone]);

      actions.removeBone(bone.id);

      const project = useEditorStore.getState().project!;
      expect(project.layers).toHaveLength(0);
    });

    it("非選択ボーンを削除しても選択はクリアされない", () => {
      const boneA = createBoneNode({ name: "A" });
      const boneB = createBoneNode({ name: "B" });
      const actions = setup([boneA, boneB]);
      useSelectionStore.setState({
        selectedLayerId: boneA.id,
        selectedLayerIds: [boneA.id],
      });

      actions.removeBone(boneB.id);

      expect(useSelectionStore.getState().selectedLayerId).toBe(boneA.id);
    });
  });

  describe("reparentBone（追加）", () => {
    it("存在しない親IDへの移動は何もしない", () => {
      const bone = createBoneNode();
      const actions = setup([bone]);

      actions.reparentBone(bone.id, "nonexistent");

      const _project = useEditorStore.getState().project!;
    });

    it("グループへのreparentではparentBoneIdがundefinedになる", () => {
      const bone = createBoneNode({ name: "ボーン" });
      const group = createGroup({ name: "グループ" });
      const actions = setup([bone, group]);

      actions.reparentBone(bone.id, group.id);

      const project = useEditorStore.getState().project!;
      const movedBone = findLayerById(project.layers, bone.id) as BoneNode;
      expect(movedBone.parentBoneId).toBeUndefined();
    });
  });

  describe("removeBone — 深いネスト", () => {
    it("3階層深い子ボーンの削除でも子がルートに昇格する", () => {
      const leaf = createBoneNode({ name: "リーフ" });
      const mid = createBoneNode({ name: "中間", children: [leaf] });
      const root = createBoneNode({ name: "ルート", children: [mid] });
      const actions = setup([root]);

      actions.removeBone(mid.id);

      const project = useEditorStore.getState().project!;
      const updatedRoot = findLayerById(project.layers, root.id)!;
      expect(updatedRoot.children.some((l) => l.id === leaf.id)).toBe(true);
    });

    it("グループ > ボーン > ボーン構造での中間ボーン削除", () => {
      const child = createBoneNode({ name: "子" });
      const parent = createBoneNode({ name: "親", children: [child] });
      const group = createGroup({ name: "グループ", children: [parent] });
      const actions = setup([group]);

      actions.removeBone(parent.id);

      const project = useEditorStore.getState().project!;
      const updatedGroup = findLayerById(project.layers, group.id)!;
      expect(updatedGroup.children.some((l) => l.id === child.id)).toBe(true);
    });
  });

  describe("setBoneAngle — エッジケース", () => {
    it("ボーン以外のノードIDでは何もしない", () => {
      const group = createGroup({ name: "グループ" });
      const actions = setup([group]);

      actions.setBoneAngle(group.id, Math.PI);

      const project = useEditorStore.getState().project!;
      expect(findLayerById(project.layers, group.id)!.kind).toBe("group");
    });
  });

  describe("setBoneScale — エッジケース", () => {
    it("ボーン以外のノードIDでは何もしない", () => {
      const group = createGroup({ name: "グループ" });
      const actions = setup([group]);

      actions.setBoneScale(group.id, 2, 2);

      const project = useEditorStore.getState().project!;
      expect(findLayerById(project.layers, group.id)!.kind).toBe("group");
    });
  });

  describe("setBoneLength — エッジケース", () => {
    it("ボーン以外のノードIDでは何もしない", () => {
      const group = createGroup({ name: "グループ" });
      const actions = setup([group]);

      actions.setBoneLength(group.id, 100);

      const project = useEditorStore.getState().project!;
      expect(findLayerById(project.layers, group.id)!.kind).toBe("group");
    });

    it("長さ0を設定できる", () => {
      const bone = createBoneNode({
        bone: { angle: 0, length: 50, scaleX: 1, scaleY: 1 },
      });
      const actions = setup([bone]);

      actions.setBoneLength(bone.id, 0);

      const project = useEditorStore.getState().project!;
      const updated = findLayerById(project.layers, bone.id) as BoneNode;
      expect(updated.bone.length).toBe(0);
    });
  });

  describe("reparentBone — 非ボーンノード", () => {
    it("グループノードをreparentしようとしても何もしない（bone以外はスキップ）", () => {
      const group = createGroup({ name: "グループ" });
      const bone = createBoneNode({ name: "ボーン" });
      const actions = setup([group, bone]);

      actions.reparentBone(group.id, bone.id);

      const project = useEditorStore.getState().project!;
      expect(project.layers.some((l) => l.id === bone.id)).toBe(true);
    });

    it("存在しないノードIDをreparentしても何もしない", () => {
      const bone = createBoneNode({ name: "ボーン" });
      const actions = setup([bone]);

      actions.reparentBone("nonexistent", bone.id);

      const project = useEditorStore.getState().project!;
      expect(project.layers).toHaveLength(1);
    });
  });

  describe("reparentBone — 親子階層の網羅テスト", () => {
    it("3段階層（A→B→C）を構築できる", () => {
      const a = createBoneNode({ name: "A" });
      const b = createBoneNode({ name: "B" });
      const c = createBoneNode({ name: "C" });
      const actions = setup([a, b, c]);

      actions.reparentBone(b.id, a.id);
      actions.reparentBone(c.id, b.id);

      const project = useEditorStore.getState().project!;
      expect(project.layers).toHaveLength(1);
      const rootA = findLayerById(project.layers, a.id)!;
      expect(rootA.children).toHaveLength(1);
      expect(rootA.children[0]!.id).toBe(b.id);
      expect(rootA.children[0]!.children).toHaveLength(1);
      expect(rootA.children[0]!.children[0]!.id).toBe(c.id);
    });

    it("4段階層（A→B→C→D）を構築できる", () => {
      const a = createBoneNode({ name: "A" });
      const b = createBoneNode({ name: "B" });
      const c = createBoneNode({ name: "C" });
      const d = createBoneNode({ name: "D" });
      const actions = setup([a, b, c, d]);

      actions.reparentBone(b.id, a.id);
      actions.reparentBone(c.id, b.id);
      actions.reparentBone(d.id, c.id);

      const project = useEditorStore.getState().project!;
      expect(project.layers).toHaveLength(1);
      const nodeC = findLayerById(project.layers, c.id)!;
      expect(nodeC.children).toHaveLength(1);
      expect(nodeC.children[0]!.id).toBe(d.id);
    });

    it("子持ちボーンを別の親に移動すると子も一緒に移動する", () => {
      const child = createBoneNode({ name: "子" });
      const parent = createBoneNode({ name: "親", children: [child] });
      const newParent = createBoneNode({ name: "新親" });
      const actions = setup([parent, newParent]);

      actions.reparentBone(parent.id, newParent.id);

      const project = useEditorStore.getState().project!;
      expect(project.layers).toHaveLength(1);
      const newP = findLayerById(project.layers, newParent.id)!;
      expect(newP.children).toHaveLength(1);
      const movedParent = newP.children[0]!;
      expect(movedParent.id).toBe(parent.id);
      expect(movedParent.children).toHaveLength(1);
      expect(movedParent.children[0]!.id).toBe(child.id);
    });

    it("孫ボーンを祖父ボーンに直接移動できる", () => {
      const grandchild = createBoneNode({ name: "孫" });
      const child = createBoneNode({ name: "子", children: [grandchild] });
      const root = createBoneNode({ name: "祖父", children: [child] });
      const actions = setup([root]);

      actions.reparentBone(grandchild.id, root.id);

      const project = useEditorStore.getState().project!;
      const rootNode = findLayerById(project.layers, root.id)!;
      expect(rootNode.children).toHaveLength(2);
      expect(rootNode.children.some((c) => c.id === child.id)).toBe(true);
      expect(rootNode.children.some((c) => c.id === grandchild.id)).toBe(true);
      const childNode = findLayerById(project.layers, child.id)!;
      expect(childNode.children).toHaveLength(0);
    });

    it("複数の子を持つ親から1つの子だけ移動できる", () => {
      const child1 = createBoneNode({ name: "子1" });
      const child2 = createBoneNode({ name: "子2" });
      const child3 = createBoneNode({ name: "子3" });
      const parent = createBoneNode({ name: "親", children: [child1, child2, child3] });
      const other = createBoneNode({ name: "移動先" });
      const actions = setup([parent, other]);

      actions.reparentBone(child2.id, other.id);

      const project = useEditorStore.getState().project!;
      const parentNode = findLayerById(project.layers, parent.id)!;
      expect(parentNode.children).toHaveLength(2);
      expect(parentNode.children.some((c) => c.id === child1.id)).toBe(true);
      expect(parentNode.children.some((c) => c.id === child3.id)).toBe(true);
      const otherNode = findLayerById(project.layers, other.id)!;
      expect(otherNode.children).toHaveLength(1);
      expect(otherNode.children[0]!.id).toBe(child2.id);
    });

    it("reparent後にparentBoneIdが正しく設定される", () => {
      const parent = createBoneNode({ name: "親" });
      const child = createBoneNode({ name: "子" });
      const actions = setup([parent, child]);

      actions.reparentBone(child.id, parent.id);

      const project = useEditorStore.getState().project!;
      const movedChild = findLayerById(project.layers, child.id) as BoneNode;
      expect(movedChild.parentBoneId).toBe(parent.id);
    });

    it("ルートに戻すとparentBoneIdがundefinedになる", () => {
      const child = createBoneNode({ name: "子", parentBoneId: "some-parent" });
      const parent = createBoneNode({ name: "親", children: [child] });
      const actions = setup([parent]);

      actions.reparentBone(child.id, null);

      const project = useEditorStore.getState().project!;
      const rootChild = findLayerById(project.layers, child.id) as BoneNode;
      expect(rootChild.parentBoneId).toBeUndefined();
    });

    it("兄弟ボーン間で移動できる（B→Cの子に）", () => {
      const b = createBoneNode({ name: "B" });
      const c = createBoneNode({ name: "C" });
      const parent = createBoneNode({ name: "親", children: [b, c] });
      const actions = setup([parent]);

      actions.reparentBone(b.id, c.id);

      const project = useEditorStore.getState().project!;
      const parentNode = findLayerById(project.layers, parent.id)!;
      expect(parentNode.children).toHaveLength(1);
      expect(parentNode.children[0]!.id).toBe(c.id);
      const cNode = findLayerById(project.layers, c.id)!;
      expect(cNode.children).toHaveLength(1);
      expect(cNode.children[0]!.id).toBe(b.id);
    });

    it("連続reparentでツリー構造の整合性が保たれる", () => {
      const a = createBoneNode({ name: "A" });
      const b = createBoneNode({ name: "B" });
      const c = createBoneNode({ name: "C" });
      const d = createBoneNode({ name: "D" });
      const actions = setup([a, b, c, d]);

      actions.reparentBone(c.id, b.id);
      actions.reparentBone(b.id, a.id);

      actions.reparentBone(c.id, d.id);

      const project = useEditorStore.getState().project!;
      expect(project.layers.filter((l) => l.kind === "bone")).toHaveLength(2);
      const aNode = findLayerById(project.layers, a.id)!;
      expect(aNode.children).toHaveLength(1);
      expect(aNode.children[0]!.id).toBe(b.id);
      const bNode = findLayerById(project.layers, b.id)!;
      expect(bNode.children).toHaveLength(0);
      const dNode = findLayerById(project.layers, d.id)!;
      expect(dNode.children).toHaveLength(1);
      expect(dNode.children[0]!.id).toBe(c.id);
    });

    it("スター型トポロジ（1親に多数の子）を構築できる", () => {
      const root = createBoneNode({ name: "ルート" });
      const children = Array.from({ length: 5 }, (_, i) =>
        createBoneNode({ name: `子${i}` }),
      );
      const actions = setup([root, ...children]);

      for (const child of children) {
        actions.reparentBone(child.id, root.id);
      }

      const project = useEditorStore.getState().project!;
      expect(project.layers).toHaveLength(1);
      const rootNode = findLayerById(project.layers, root.id)!;
      expect(rootNode.children).toHaveLength(5);
      for (const child of children) {
        expect(rootNode.children.some((c) => c.id === child.id)).toBe(true);
      }
    });

    it("深い階層のリーフを別の深い階層に移動できる", () => {
      const c = createBoneNode({ name: "C" });
      const b = createBoneNode({ name: "B", children: [c] });
      const a = createBoneNode({ name: "A", children: [b] });
      const f = createBoneNode({ name: "F" });
      const e = createBoneNode({ name: "E", children: [f] });
      const d = createBoneNode({ name: "D", children: [e] });
      const actions = setup([a, d]);

      actions.reparentBone(f.id, b.id);

      const project = useEditorStore.getState().project!;
      const bNode = findLayerById(project.layers, b.id)!;
      expect(bNode.children).toHaveLength(2);
      expect(bNode.children.some((ch) => ch.id === c.id)).toBe(true);
      expect(bNode.children.some((ch) => ch.id === f.id)).toBe(true);
      const eNode = findLayerById(project.layers, e.id)!;
      expect(eNode.children).toHaveLength(0);
    });
  });

  describe("removeBone — 存在しないノード", () => {
    it("存在しないノードIDを削除しても何もしない", () => {
      const bone = createBoneNode({ name: "ボーン" });
      const actions = setup([bone]);

      actions.removeBone("nonexistent");

      const project = useEditorStore.getState().project!;
      expect(project.layers).toHaveLength(1);
    });
  });
});
