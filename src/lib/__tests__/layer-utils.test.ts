import {
  findLayerById,
  findPathToLayer,
  flattenLayers,
  insertLayerAt,
  isLayerEffectivelyVisible,
  isLayerSoloVisible,
  moveLayerInTree,
  removeFromTree,
  updateLayerInTree,
} from "@vivi2d/core/layer-utils";
import { describe, expect, it } from "vitest";
import {
  createViviMesh,
  createBoneNode,
  createGroup,
  createLayerTree,
} from "@/test/fixtures";

describe("findLayerById", () => {
  it("ルートレベルのレイヤーを検索できる", () => {
    const { root, ids } = createLayerTree();
    const found = findLayerById(root, ids.standalone);
    expect(found).not.toBeNull();
    expect(found!.name).toBe("Standalone layer");
  });

  it("ネストされたレイヤーを検索できる", () => {
    const { root, ids } = createLayerTree();
    const found = findLayerById(root, ids.childA);
    expect(found).not.toBeNull();
    expect(found!.name).toBe("Child A");
  });

  it("3階層目のレイヤーを検索できる", () => {
    const { root, ids } = createLayerTree();
    const found = findLayerById(root, ids.nestedChild);
    expect(found).not.toBeNull();
    expect(found!.name).toBe("Nested child");
  });

  it("存在しないIDに対してnullを返す", () => {
    const { root } = createLayerTree();
    expect(findLayerById(root, "nonexistent-id")).toBeNull();
  });

  it("空配列に対してnullを返す", () => {
    expect(findLayerById([], "any-id")).toBeNull();
  });
});

describe("updateLayerInTree", () => {
  it("ルートレベルのレイヤーを更新できる", () => {
    const { root, ids } = createLayerTree();
    const updated = updateLayerInTree(root, ids.standalone, (l) => ({
      ...l,
      name: "更新済み",
    }));

    const found = findLayerById(updated, ids.standalone);
    expect(found!.name).toBe("更新済み");
  });

  it("ネストされたレイヤーを更新できる", () => {
    const { root, ids } = createLayerTree();
    const updated = updateLayerInTree(root, ids.childB, (l) => ({
      ...l,
      visible: true,
    }));

    const found = findLayerById(updated, ids.childB);
    expect(found!.visible).toBe(true);
  });

  it("3階層目のレイヤーを更新できる", () => {
    const { root, ids } = createLayerTree();
    const updated = updateLayerInTree(root, ids.nestedChild, (l) => ({
      ...l,
      opacity: 0.5,
    }));

    const found = findLayerById(updated, ids.nestedChild);
    expect(found!.opacity).toBe(0.5);
  });

  it("元の配列を変更しない（イミュータブル）", () => {
    const { root, ids } = createLayerTree();
    const original = findLayerById(root, ids.standalone)!;

    updateLayerInTree(root, ids.standalone, (l) => ({
      ...l,
      name: "変更",
    }));

    expect(original.name).toBe("Standalone layer");
  });

  it("存在しないIDでは何も変更しない", () => {
    const { root } = createLayerTree();
    const updated = updateLayerInTree(root, "nonexistent", (l) => ({
      ...l,
      name: "never",
    }));

    expect(updated).toEqual(root);
  });

  it("子のないレイヤーの兄弟に影響しない", () => {
    const { root, ids } = createLayerTree();
    const updated = updateLayerInTree(root, ids.childA, (l) => ({
      ...l,
      opacity: 0.1,
    }));

    const childB = findLayerById(updated, ids.childB);
    expect(childB!.visible).toBe(false);
  });
});

describe("flattenLayers", () => {
  it("空配列に対して空配列を返す", () => {
    expect(flattenLayers([])).toEqual([]);
  });

  it("フラットなレイヤー配列をそのまま返す", () => {
    const layers = [createViviMesh({ name: "A" }), createViviMesh({ name: "B" })];
    const flat = flattenLayers(layers);
    expect(flat).toHaveLength(2);
    expect(flat.map((l) => l.name)).toEqual(["A", "B"]);
  });

  it("ネストされたレイヤーを全て展開する", () => {
    const { root } = createLayerTree();
    const flat = flattenLayers(root);

    expect(flat).toHaveLength(6);
  });

  it("親→子の順序で展開する", () => {
    const child = createViviMesh({ name: "子" });
    const parent = createGroup({
      name: "親",
      children: [child],
    });

    const flat = flattenLayers([parent]);
    expect(flat[0]!.name).toBe("親");
    expect(flat[1]!.name).toBe("子");
  });
});

describe("findPathToLayer", () => {
  it("ルートレベルのレイヤーへのパスを返す", () => {
    const { root, ids } = createLayerTree();
    const path = findPathToLayer(root, ids.standalone);

    expect(path).toHaveLength(1);
    expect(path[0]!.name).toBe("Standalone layer");
  });

  it("ネストされたレイヤーへのパスを返す", () => {
    const { root, ids } = createLayerTree();
    const path = findPathToLayer(root, ids.childA);

    expect(path).toHaveLength(2);
    expect(path[0]!.name).toBe("Root group");
    expect(path[1]!.name).toBe("Child A");
  });

  it("3階層目までのパスを返す", () => {
    const { root, ids } = createLayerTree();
    const path = findPathToLayer(root, ids.nestedChild);

    expect(path).toHaveLength(3);
    expect(path.map((l) => l.name)).toEqual([
      "Root group",
      "Nested group",
      "Nested child",
    ]);
  });

  it("存在しないIDに対して空配列を返す", () => {
    const { root } = createLayerTree();
    expect(findPathToLayer(root, "nonexistent")).toEqual([]);
  });
});

describe("isLayerEffectivelyVisible", () => {
  it("表示中のルートレイヤーはtrueを返す", () => {
    const { root, ids } = createLayerTree();
    const layer = findLayerById(root, ids.standalone)!;
    expect(isLayerEffectivelyVisible(layer, root)).toBe(true);
  });

  it("非表示のレイヤーはfalseを返す", () => {
    const { root, ids } = createLayerTree();
    const layer = findLayerById(root, ids.childB)!;
    expect(isLayerEffectivelyVisible(layer, root)).toBe(false);
  });

  it("親グループが非表示なら子もfalseを返す", () => {
    const { root, ids } = createLayerTree();
    const updated = updateLayerInTree(root, ids.group, (l) => ({
      ...l,
      visible: false,
    }));
    const childA = findLayerById(updated, ids.childA)!;

    expect(childA.visible).toBe(true);
    expect(isLayerEffectivelyVisible(childA, updated)).toBe(false);
  });

  it("全ての祖先が表示中なら子はtrueを返す", () => {
    const { root, ids } = createLayerTree();
    const nestedChild = findLayerById(root, ids.nestedChild)!;
    expect(isLayerEffectivelyVisible(nestedChild, root)).toBe(true);
  });

  it("中間の祖先が非表示なら孫はfalseを返す", () => {
    const { root, ids } = createLayerTree();
    const updated = updateLayerInTree(root, ids.nested, (l) => ({
      ...l,
      visible: false,
    }));
    const nestedChild = findLayerById(updated, ids.nestedChild)!;
    expect(isLayerEffectivelyVisible(nestedChild, updated)).toBe(false);
  });
});

describe("findLayerById 追加ケース", () => {
  it("同一 ID が複数存在する場合は最初に見つかったものを返す", () => {
    const sharedId = "shared-id";
    const a = createViviMesh({ name: "A" });
    a.id = sharedId;
    const b = createViviMesh({ name: "B" });
    b.id = sharedId;

    const found = findLayerById([a, b], sharedId);
    expect(found!.name).toBe("A");
  });

  it("グループ自体を ID で見つけられる", () => {
    const { root, ids } = createLayerTree();
    const found = findLayerById(root, ids.group);
    expect(found).not.toBeNull();
    expect(found!.kind).toBe("group");
  });
});

describe("flattenLayers 追加ケース", () => {
  it("4階層の深いネストを正しく展開する", () => {
    const leaf = createViviMesh({ name: "葉" });
    const level3 = createGroup({
      name: "3階層目",
      children: [leaf],
    });
    const level2 = createGroup({
      name: "2階層目",
      children: [level3],
    });
    const level1 = createGroup({
      name: "1階層目",
      children: [level2],
    });

    const flat = flattenLayers([level1]);
    expect(flat).toHaveLength(4);
    expect(flat.map((l) => l.name)).toEqual(["1階層目", "2階層目", "3階層目", "葉"]);
  });

  it("複数のルートレイヤーが正しく展開される", () => {
    const child = createViviMesh({ name: "子" });
    const group = createGroup({
      name: "グループ",
      children: [child],
    });
    const standalone1 = createViviMesh({ name: "独立A" });
    const standalone2 = createViviMesh({ name: "独立B" });

    const flat = flattenLayers([standalone1, group, standalone2]);
    expect(flat).toHaveLength(4);
    expect(flat.map((l) => l.name)).toEqual(["独立A", "グループ", "子", "独立B"]);
  });

  it("ボーンノードも展開される", () => {
    const child = createViviMesh({ name: "子レイヤー" });
    const bone = createBoneNode({ name: "ボーン", children: [child] });

    const flat = flattenLayers([bone]);
    expect(flat).toHaveLength(2);
    expect(flat[0]!.kind).toBe("bone");
    expect(flat[1]!.kind).toBe("viviMesh");
  });
});

describe("findPathToLayer 追加ケース", () => {
  it("空のレイヤー配列で空パスを返す", () => {
    expect(findPathToLayer([], "any-id")).toEqual([]);
  });

  it("ボーンを含むパスを正しく返す", () => {
    const child = createViviMesh({ name: "子" });
    const bone = createBoneNode({ name: "ボーン", children: [child] });
    const group = createGroup({
      name: "グループ",
      children: [bone],
    });

    const path = findPathToLayer([group], child.id);
    expect(path).toHaveLength(3);
    expect(path[0]!.name).toBe("グループ");
    expect(path[1]!.name).toBe("ボーン");
    expect(path[2]!.name).toBe("子");
  });
});

describe("updateLayerInTree 追加ケース", () => {
  it("空のレイヤー配列では空を返す", () => {
    const result = updateLayerInTree([], "any-id", (l) => ({
      ...l,
      name: "変更",
    }));
    expect(result).toEqual([]);
  });

  it("更新対象以外のレイヤーは同一参照を維持する", () => {
    const a = createViviMesh({ name: "A" });
    const b = createViviMesh({ name: "B" });
    const updated = updateLayerInTree([a, b], a.id, (l) => ({
      ...l,
      name: "A-updated",
    }));

    expect(updated[1]!).toBe(b);
    expect(updated[0]!.name).toBe("A-updated");
    expect(updated[0]).not.toBe(a);
  });
});

describe("isLayerEffectivelyVisible 追加ケース", () => {
  it("ボーン親が非表示なら子は実効非表示", () => {
    const child = createViviMesh({ name: "子", visible: true });
    const bone = createBoneNode({
      name: "ボーン",
      visible: false,
      children: [child],
    });

    expect(isLayerEffectivelyVisible(child, [bone])).toBe(false);
  });

  it("全祖先が表示中で子自身も表示中なら true", () => {
    const child = createViviMesh({ name: "子", visible: true });
    const group = createGroup({
      name: "グループ",
      visible: true,
      children: [child],
    });

    expect(isLayerEffectivelyVisible(child, [group])).toBe(true);
  });
});

// ============================================================
// moveLayerInTree
// ============================================================
describe("moveLayerInTree", () => {
  it("ルートレベルでレイヤーを下に移動できる", () => {
    const { root, ids } = createLayerTree();
    const result = moveLayerInTree(root, ids.group, "down");
    expect(result).toBe(true);
    expect(root[0]!.id).toBe(ids.standalone);
    expect(root[1]!.id).toBe(ids.group);
  });

  it("ルートレベルでレイヤーを上に移動できる", () => {
    const { root, ids } = createLayerTree();
    const result = moveLayerInTree(root, ids.standalone, "up");
    expect(result).toBe(true);
    expect(root[0]!.id).toBe(ids.standalone);
    expect(root[1]!.id).toBe(ids.group);
  });

  it("先頭レイヤーを上に移動するとfalseを返す", () => {
    const { root, ids } = createLayerTree();
    const result = moveLayerInTree(root, ids.group, "up");
    expect(result).toBe(false);
    expect(root[0]!.id).toBe(ids.group);
  });

  it("末尾レイヤーを下に移動するとfalseを返す", () => {
    const { root, ids } = createLayerTree();
    const result = moveLayerInTree(root, ids.standalone, "down");
    expect(result).toBe(false);
    expect(root[1]!.id).toBe(ids.standalone);
  });

  it("ネスト内の子を下に移動できる", () => {
    const { root, ids } = createLayerTree();
    const result = moveLayerInTree(root, ids.childA, "down");
    expect(result).toBe(true);
    const group = findLayerById(root, ids.group)!;
    expect(group.children[0]!.id).toBe(ids.childB);
    expect(group.children[1]!.id).toBe(ids.childA);
  });

  it("ネスト内の先頭の子を上に移動するとfalseを返す", () => {
    const { root, ids } = createLayerTree();
    const result = moveLayerInTree(root, ids.childA, "up");
    expect(result).toBe(false);
  });

  it("存在しないIDに対してfalseを返す", () => {
    const { root } = createLayerTree();
    const result = moveLayerInTree(root, "nonexistent-id", "up");
    expect(result).toBe(false);
  });
});

// ============================================================
// insertLayerAt
// ============================================================
describe("insertLayerAt", () => {
  it("ルートレベルでターゲットの前にノードを挿入できる", () => {
    const { root, ids } = createLayerTree();
    const newNode = createViviMesh({ name: "新規ノード" });
    const result = insertLayerAt(root, ids.standalone, newNode, "before");
    expect(result).toBe(true);
    expect(root).toHaveLength(3);
    expect(root[1]!.id).toBe(newNode.id);
    expect(root[2]!.id).toBe(ids.standalone);
  });

  it("ルートレベルでターゲットの後にノードを挿入できる", () => {
    const { root, ids } = createLayerTree();
    const newNode = createViviMesh({ name: "新規ノード" });
    const result = insertLayerAt(root, ids.group, newNode, "after");
    expect(result).toBe(true);
    expect(root).toHaveLength(3);
    expect(root[0]!.id).toBe(ids.group);
    expect(root[1]!.id).toBe(newNode.id);
    expect(root[2]!.id).toBe(ids.standalone);
  });

  it("ネスト内でターゲットの前にノードを挿入できる", () => {
    const { root, ids } = createLayerTree();
    const newNode = createViviMesh({ name: "新規子ノード" });
    const result = insertLayerAt(root, ids.childB, newNode, "before");
    expect(result).toBe(true);
    const group = findLayerById(root, ids.group)!;
    expect(group.children).toHaveLength(4);
    expect(group.children[0]!.id).toBe(ids.childA);
    expect(group.children[1]!.id).toBe(newNode.id);
    expect(group.children[2]!.id).toBe(ids.childB);
  });

  it("ネスト内でターゲットの後にノードを挿入できる", () => {
    const { root, ids } = createLayerTree();
    const newNode = createViviMesh({ name: "新規子ノード" });
    const result = insertLayerAt(root, ids.childA, newNode, "after");
    expect(result).toBe(true);
    const group = findLayerById(root, ids.group)!;
    expect(group.children).toHaveLength(4);
    expect(group.children[0]!.id).toBe(ids.childA);
    expect(group.children[1]!.id).toBe(newNode.id);
    expect(group.children[2]!.id).toBe(ids.childB);
  });

  it("存在しないIDに対してfalseを返す", () => {
    const { root } = createLayerTree();
    const newNode = createViviMesh({ name: "挿入不可" });
    const result = insertLayerAt(root, "nonexistent-id", newNode, "before");
    expect(result).toBe(false);
  });

  it("挿入後に配列長が1つ増える", () => {
    const { root, ids } = createLayerTree();
    const originalLength = root.length;
    const newNode = createViviMesh({ name: "追加ノード" });
    insertLayerAt(root, ids.group, newNode, "after");
    expect(root).toHaveLength(originalLength + 1);
  });
});

// ============================================================
// removeFromTree
// ============================================================
describe("removeFromTree", () => {
  it("ルートレベルのノードを削除できる", () => {
    const { root, ids } = createLayerTree();
    const removed = removeFromTree(root, ids.standalone);
    expect(removed).not.toBeNull();
    expect(removed!.id).toBe(ids.standalone);
    expect(root).toHaveLength(1);
    expect(root[0]!.id).toBe(ids.group);
  });

  it("ネストされたノードを削除できる", () => {
    const { root, ids } = createLayerTree();
    const removed = removeFromTree(root, ids.childA);
    expect(removed).not.toBeNull();
    expect(removed!.id).toBe(ids.childA);
    const group = findLayerById(root, ids.group)!;
    expect(group.children).toHaveLength(2);
    expect(group.children[0]!.id).toBe(ids.childB);
  });

  it("削除後に配列長が1つ減る", () => {
    const { root, ids } = createLayerTree();
    const group = findLayerById(root, ids.group)!;
    const originalChildCount = group.children.length;
    removeFromTree(root, ids.childB);
    expect(group.children).toHaveLength(originalChildCount - 1);
  });

  it("削除したノードが正しく返される", () => {
    const { root, ids } = createLayerTree();
    const removed = removeFromTree(root, ids.nestedChild);
    expect(removed).not.toBeNull();
    expect(removed!.name).toBe("Nested child");
    expect(removed!.kind).toBe("viviMesh");
  });

  it("存在しないIDに対してnullを返す", () => {
    const { root } = createLayerTree();
    const result = removeFromTree(root, "nonexistent-id");
    expect(result).toBeNull();
  });

  it("空配列に対してnullを返す", () => {
    const result = removeFromTree([], "any-id");
    expect(result).toBeNull();
  });
});

// ============================================================
// isLayerSoloVisible
// ============================================================
describe("isLayerSoloVisible", () => {
  it("soloLayerIdsが空なら常にtrue", () => {
    const { root, ids } = createLayerTree();
    expect(isLayerSoloVisible(ids.standalone, [], root)).toBe(true);
    expect(isLayerSoloVisible(ids.childA, [], root)).toBe(true);
  });

  it("ソロ対象自身はtrue", () => {
    const { root, ids } = createLayerTree();
    expect(isLayerSoloVisible(ids.standalone, [ids.standalone], root)).toBe(true);
  });

  it("ソロ対象以外のルートレイヤーはfalse", () => {
    const { root, ids } = createLayerTree();
    expect(isLayerSoloVisible(ids.standalone, [ids.group], root)).toBe(false);
  });

  it("ソロ対象の子孫はtrue", () => {
    const { root, ids } = createLayerTree();
    expect(isLayerSoloVisible(ids.childA, [ids.group], root)).toBe(true);
    expect(isLayerSoloVisible(ids.nestedChild, [ids.group], root)).toBe(true);
  });

  it("ソロ対象の祖先はtrue（グループノードを表示する必要がある）", () => {
    const { root, ids } = createLayerTree();
    expect(isLayerSoloVisible(ids.group, [ids.childA], root)).toBe(true);
  });

  it("ソロ対象と無関係なブランチはfalse", () => {
    const { root, ids } = createLayerTree();
    expect(isLayerSoloVisible(ids.standalone, [ids.childA], root)).toBe(false);
  });

  it("複数のソロ対象を指定できる", () => {
    const { root, ids } = createLayerTree();
    const soloIds = [ids.childA, ids.standalone];
    expect(isLayerSoloVisible(ids.childA, soloIds, root)).toBe(true);
    expect(isLayerSoloVisible(ids.standalone, soloIds, root)).toBe(true);
    expect(isLayerSoloVisible(ids.group, soloIds, root)).toBe(true);
  });

  it("深いネストのソロで中間ノードが見える", () => {
    const { root, ids } = createLayerTree();
    expect(isLayerSoloVisible(ids.nested, [ids.nestedChild], root)).toBe(true);
    expect(isLayerSoloVisible(ids.group, [ids.nestedChild], root)).toBe(true);
    expect(isLayerSoloVisible(ids.childA, [ids.nestedChild], root)).toBe(false);
    expect(isLayerSoloVisible(ids.childB, [ids.nestedChild], root)).toBe(false);
  });
});


describe("ボーン階層でのツリー操作", () => {
  it("findLayerByIdでボーン階層の深いノードを見つける", () => {
    const grandchild = createBoneNode({ name: "孫" });
    const child = createBoneNode({ name: "子", children: [grandchild] });
    const root = createBoneNode({ name: "ルート", children: [child] });
    const layers = [root];

    expect(findLayerById(layers, grandchild.id)).not.toBeNull();
    expect(findLayerById(layers, grandchild.id)!.name).toBe("孫");
  });

  it("findLayerByIdでボーンとグループの混在ツリーを検索できる", () => {
    const bone = createBoneNode({ name: "ボーン" });
    const mesh = createViviMesh({ name: "メッシュ" });
    const group = createGroup({ name: "グループ", children: [bone, mesh] });
    const layers = [group];

    expect(findLayerById(layers, bone.id)!.name).toBe("ボーン");
    expect(findLayerById(layers, mesh.id)!.name).toBe("メッシュ");
  });

  it("removeFromTreeでボーン階層の中間ノードを削除できる", () => {
    const leaf = createBoneNode({ name: "リーフ" });
    const mid = createBoneNode({ name: "中間", children: [leaf] });
    const root = createBoneNode({ name: "ルート", children: [mid] });
    const layers = [root];

    const removed = removeFromTree(layers, mid.id);
    expect(removed).not.toBeNull();
    expect(removed!.id).toBe(mid.id);
    expect(removed!.children).toHaveLength(1);
    expect(removed!.children[0]!.id).toBe(leaf.id);
    expect(root.children).toHaveLength(0);
  });

  it("removeFromTreeでルートレベルのボーンを削除できる", () => {
    const bone1 = createBoneNode({ name: "ボーン1" });
    const bone2 = createBoneNode({ name: "ボーン2" });
    const layers = [bone1, bone2];

    const removed = removeFromTree(layers, bone1.id);
    expect(removed!.id).toBe(bone1.id);
    expect(layers).toHaveLength(1);
    expect(layers[0]!.id).toBe(bone2.id);
  });

  it("removeFromTreeで存在しないIDは何もしない", () => {
    const bone = createBoneNode({ name: "ボーン" });
    const layers = [bone];

    const removed = removeFromTree(layers, "nonexistent");
    expect(removed).toBeNull();
    expect(layers).toHaveLength(1);
  });

  it("removeFromTreeでボーンの深い階層からリーフを削除できる", () => {
    const leaf1 = createBoneNode({ name: "リーフ1" });
    const leaf2 = createBoneNode({ name: "リーフ2" });
    const mid = createBoneNode({ name: "中間", children: [leaf1, leaf2] });
    const root = createBoneNode({ name: "ルート", children: [mid] });
    const layers = [root];

    removeFromTree(layers, leaf1.id);
    expect(mid.children).toHaveLength(1);
    expect(mid.children[0]!.id).toBe(leaf2.id);
  });

  it("flattenLayersでボーン階層が全てフラットに展開される", () => {
    const leaf = createBoneNode({ name: "リーフ" });
    const child = createBoneNode({ name: "子", children: [leaf] });
    const root = createBoneNode({ name: "ルート", children: [child] });
    const layers = [root];

    const flat = flattenLayers(layers);
    expect(flat).toHaveLength(3);
    expect(flat.some((n) => n.id === root.id)).toBe(true);
    expect(flat.some((n) => n.id === child.id)).toBe(true);
    expect(flat.some((n) => n.id === leaf.id)).toBe(true);
  });

  it("findPathToLayerでボーン階層のパスが正しい", () => {
    const leaf = createBoneNode({ name: "リーフ" });
    const child = createBoneNode({ name: "子", children: [leaf] });
    const root = createBoneNode({ name: "ルート", children: [child] });
    const layers = [root];

    const path = findPathToLayer(layers, leaf.id);
    expect(path).toHaveLength(3);
    expect(path![0]!.id).toBe(root.id);
    expect(path![1]!.id).toBe(child.id);
    expect(path![2]!.id).toBe(leaf.id);
  });
});
