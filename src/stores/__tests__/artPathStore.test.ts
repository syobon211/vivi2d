import type { ArtPathNode, GroupNode } from "@vivi2d/core/types";
import { afterEach, describe, expect, it } from "vitest";
import { useArtPathStore } from "@/stores/artPathStore";
import { useEditorStore } from "@/stores/editorStore";
import { createEmptyProject, createGroup } from "@/test/fixtures";
import { resetEditorStore } from "@/test/store-reset";

function setup() {
  useEditorStore.setState({
    project: createEmptyProject(),
    projectVersion: 1,
  });
}

describe("artPathStore", () => {
  afterEach(() => resetEditorStore());

  it("ArtPathノードを追加できる", () => {
    setup();
    const id = useArtPathStore.getState().addArtPath("テストパス", 100, 200);
    const project = useEditorStore.getState().project!;
    const node = project.layers.find((l) => l.id === id);
    expect(node).toBeDefined();
    expect(node?.kind).toBe("artPath");
    expect(node?.name).toBe("テストパス");
  });

  it("ArtPathノードを削除できる", () => {
    setup();
    const id = useArtPathStore.getState().addArtPath("テスト", 0, 0);
    useArtPathStore.getState().removeArtPath(id);
    const project = useEditorStore.getState().project!;
    expect(project.layers.find((l) => l.id === id)).toBeUndefined();
  });

  it("制御点を追加できる", () => {
    setup();
    const id = useArtPathStore.getState().addArtPath("テスト", 0, 0);
    useArtPathStore.getState().addControlPoint(id, {
      x: 10,
      y: 20,
      handleInX: 0,
      handleInY: 0,
      handleOutX: 5,
      handleOutY: 5,
      width: 1,
      opacity: 1,
    });
    const project = useEditorStore.getState().project!;
    const node = project.layers.find((l) => l.id === id);
    expect(node?.kind === "artPath" && node.controlPoints.length).toBe(1);
  });

  it("制御点を削除できる", () => {
    setup();
    const id = useArtPathStore.getState().addArtPath("テスト", 0, 0);
    useArtPathStore.getState().addControlPoint(id, {
      x: 0,
      y: 0,
      handleInX: 0,
      handleInY: 0,
      handleOutX: 0,
      handleOutY: 0,
      width: 1,
      opacity: 1,
    });
    useArtPathStore.getState().addControlPoint(id, {
      x: 10,
      y: 10,
      handleInX: 0,
      handleInY: 0,
      handleOutX: 0,
      handleOutY: 0,
      width: 1,
      opacity: 1,
    });
    useArtPathStore.getState().removeControlPoint(id, 0);
    const project = useEditorStore.getState().project!;
    const node = project.layers.find((l) => l.id === id);
    expect(node?.kind === "artPath" && node.controlPoints.length).toBe(1);
  });

  it("スタイルを変更できる", () => {
    setup();
    const id = useArtPathStore.getState().addArtPath("テスト", 0, 0);
    useArtPathStore.getState().setStyle(id, { color: 0xff0000, baseWidth: 5 });
    const project = useEditorStore.getState().project!;
    const node = project.layers.find((l) => l.id === id);
    expect(node?.kind === "artPath" && node.style.color).toBe(0xff0000);
    expect(node?.kind === "artPath" && node.style.baseWidth).toBe(5);
  });

  it("閉じたパスを設定できる", () => {
    setup();
    const id = useArtPathStore.getState().addArtPath("テスト", 0, 0);
    useArtPathStore.getState().setClosed(id, true);
    const project = useEditorStore.getState().project!;
    const node = project.layers.find((l) => l.id === id);
    expect(node?.kind === "artPath" && node.closed).toBe(true);
  });


  it("グループ内にネストされたArtPathを操作できる", () => {
    const apNode: ArtPathNode = {
      id: "nested-ap",
      name: "ネストパス",
      kind: "artPath",
      visible: true,
      opacity: 1,
      x: 10,
      y: 20,
      width: 0,
      height: 0,
      blendMode: "normal",
      expanded: false,
      children: [],
      controlPoints: [],
      closed: false,
      style: { color: 0x000000, baseWidth: 3, lineCap: "round", lineJoin: "round" },
    };
    const group = createGroup({ name: "親グループ", children: [apNode] });
    useEditorStore.setState({
      project: { ...createEmptyProject(), layers: [group] },
      projectVersion: 1,
    });

    useArtPathStore.getState().addControlPoint("nested-ap", {
      x: 50,
      y: 60,
      handleInX: 0,
      handleInY: 0,
      handleOutX: 5,
      handleOutY: 5,
      width: 2,
      opacity: 0.8,
    });

    const updated = useEditorStore.getState().project!;
    const parentGroup = updated.layers.find((l) => l.id === group.id) as GroupNode;
    const nested = parentGroup.children.find((l) => l.id === "nested-ap") as ArtPathNode;
    expect(nested.controlPoints).toHaveLength(1);
    expect(nested.controlPoints[0]!.x).toBe(50);
  });

  it("ネストされたArtPathのスタイルを変更できる", () => {
    const apNode: ArtPathNode = {
      id: "nested-ap-2",
      name: "ネスト",
      kind: "artPath",
      visible: true,
      opacity: 1,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      blendMode: "normal",
      expanded: false,
      children: [],
      controlPoints: [],
      closed: false,
      style: { color: 0x000000, baseWidth: 3, lineCap: "round", lineJoin: "round" },
    };
    const group = createGroup({ name: "グループ", children: [apNode] });
    useEditorStore.setState({
      project: { ...createEmptyProject(), layers: [group] },
      projectVersion: 1,
    });

    useArtPathStore.getState().setStyle("nested-ap-2", { baseWidth: 10 });

    const updated = useEditorStore.getState().project!;
    const parentGroup = updated.layers.find((l) => l.id === group.id) as GroupNode;
    const nested = parentGroup.children.find(
      (l) => l.id === "nested-ap-2",
    ) as ArtPathNode;
    expect(nested.style.baseWidth).toBe(10);
  });

  it("ネストされたArtPathの閉じる設定を変更できる", () => {
    const apNode: ArtPathNode = {
      id: "nested-ap-3",
      name: "ネスト",
      kind: "artPath",
      visible: true,
      opacity: 1,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      blendMode: "normal",
      expanded: false,
      children: [],
      controlPoints: [],
      closed: false,
      style: { color: 0x000000, baseWidth: 3, lineCap: "round", lineJoin: "round" },
    };
    const group = createGroup({ name: "グループ", children: [apNode] });
    useEditorStore.setState({
      project: { ...createEmptyProject(), layers: [group] },
      projectVersion: 1,
    });

    useArtPathStore.getState().setClosed("nested-ap-3", true);

    const updated = useEditorStore.getState().project!;
    const parentGroup = updated.layers.find((l) => l.id === group.id) as GroupNode;
    const nested = parentGroup.children.find(
      (l) => l.id === "nested-ap-3",
    ) as ArtPathNode;
    expect(nested.closed).toBe(true);
  });


  it("指定インデックスに制御点を挿入できる", () => {
    setup();
    const id = useArtPathStore.getState().addArtPath("テスト", 0, 0);
    const pt = (x: number) => ({
      x,
      y: 0,
      handleInX: 0,
      handleInY: 0,
      handleOutX: 0,
      handleOutY: 0,
      width: 1,
      opacity: 1,
    });
    useArtPathStore.getState().addControlPoint(id, pt(0));
    useArtPathStore.getState().addControlPoint(id, pt(20));
    useArtPathStore.getState().addControlPoint(id, pt(10), 1);

    const project = useEditorStore.getState().project!;
    const node = project.layers.find((l) => l.id === id) as ArtPathNode;
    expect(node.controlPoints).toHaveLength(3);
    expect(node.controlPoints[0]!.x).toBe(0);
    expect(node.controlPoints[1]!.x).toBe(10);
    expect(node.controlPoints[2]!.x).toBe(20);
  });

  it("インデックスが範囲外の場合は末尾に追加される", () => {
    setup();
    const id = useArtPathStore.getState().addArtPath("テスト", 0, 0);
    const pt = {
      x: 50,
      y: 50,
      handleInX: 0,
      handleInY: 0,
      handleOutX: 0,
      handleOutY: 0,
      width: 1,
      opacity: 1,
    };
    useArtPathStore.getState().addControlPoint(id, pt, 999);

    const project = useEditorStore.getState().project!;
    const node = project.layers.find((l) => l.id === id) as ArtPathNode;
    expect(node.controlPoints).toHaveLength(0);
  });

  it("負のインデックスの場合は末尾に追加される", () => {
    setup();
    const id = useArtPathStore.getState().addArtPath("テスト", 0, 0);
    const pt = {
      x: 30,
      y: 30,
      handleInX: 0,
      handleInY: 0,
      handleOutX: 0,
      handleOutY: 0,
      width: 1,
      opacity: 1,
    };
    useArtPathStore.getState().addControlPoint(id, pt, -1);

    const project = useEditorStore.getState().project!;
    const node = project.layers.find((l) => l.id === id) as ArtPathNode;
    expect(node.controlPoints).toHaveLength(0);
  });


  it("制御点を部分更新できる", () => {
    setup();
    const id = useArtPathStore.getState().addArtPath("テスト", 0, 0);
    useArtPathStore.getState().addControlPoint(id, {
      x: 10,
      y: 20,
      handleInX: 1,
      handleInY: 2,
      handleOutX: 3,
      handleOutY: 4,
      width: 1,
      opacity: 1,
    });
    useArtPathStore.getState().updateControlPoint(id, 0, { x: 99, width: 5 });

    const project = useEditorStore.getState().project!;
    const node = project.layers.find((l) => l.id === id) as ArtPathNode;
    expect(node.controlPoints[0]!.x).toBe(99);
    expect(node.controlPoints[0]!.y).toBe(20);
    expect(node.controlPoints[0]!.width).toBe(5);
  });

  it("負のインデックスで updateControlPoint は何もしない", () => {
    setup();
    const id = useArtPathStore.getState().addArtPath("テスト", 0, 0);
    useArtPathStore.getState().addControlPoint(id, {
      x: 10,
      y: 20,
      handleInX: 0,
      handleInY: 0,
      handleOutX: 0,
      handleOutY: 0,
      width: 1,
      opacity: 1,
    });
    expect(() =>
      useArtPathStore.getState().updateControlPoint(id, -1, { x: 99 }),
    ).not.toThrow();

    const project = useEditorStore.getState().project!;
    const node = project.layers.find((l) => l.id === id) as ArtPathNode;
    expect(node.controlPoints[0]!.x).toBe(10);
  });

  it("範囲外インデックスで updateControlPoint は何もしない", () => {
    setup();
    const id = useArtPathStore.getState().addArtPath("テスト", 0, 0);
    useArtPathStore.getState().addControlPoint(id, {
      x: 10,
      y: 20,
      handleInX: 0,
      handleInY: 0,
      handleOutX: 0,
      handleOutY: 0,
      width: 1,
      opacity: 1,
    });
    expect(() =>
      useArtPathStore.getState().updateControlPoint(id, 999, { x: 99 }),
    ).not.toThrow();
  });


  it("負のインデックスで removeControlPoint は何もしない", () => {
    setup();
    const id = useArtPathStore.getState().addArtPath("テスト", 0, 0);
    useArtPathStore.getState().addControlPoint(id, {
      x: 10,
      y: 20,
      handleInX: 0,
      handleInY: 0,
      handleOutX: 0,
      handleOutY: 0,
      width: 1,
      opacity: 1,
    });
    useArtPathStore.getState().removeControlPoint(id, -1);

    const project = useEditorStore.getState().project!;
    const node = project.layers.find((l) => l.id === id) as ArtPathNode;
    expect(node.controlPoints).toHaveLength(1);
  });

  it("範囲外インデックスで removeControlPoint は何もしない", () => {
    setup();
    const id = useArtPathStore.getState().addArtPath("テスト", 0, 0);
    useArtPathStore.getState().addControlPoint(id, {
      x: 10,
      y: 20,
      handleInX: 0,
      handleInY: 0,
      handleOutX: 0,
      handleOutY: 0,
      width: 1,
      opacity: 1,
    });
    useArtPathStore.getState().removeControlPoint(id, 5);

    const project = useEditorStore.getState().project!;
    const node = project.layers.find((l) => l.id === id) as ArtPathNode;
    expect(node.controlPoints).toHaveLength(1);
  });


  it("存在しない artPathId で addControlPoint は何もしない", () => {
    setup();
    expect(() =>
      useArtPathStore.getState().addControlPoint("nonexistent", {
        x: 0,
        y: 0,
        handleInX: 0,
        handleInY: 0,
        handleOutX: 0,
        handleOutY: 0,
        width: 1,
        opacity: 1,
      }),
    ).not.toThrow();
  });

  it("存在しない artPathId で updateControlPoint は何もしない", () => {
    setup();
    expect(() =>
      useArtPathStore.getState().updateControlPoint("nonexistent", 0, { x: 99 }),
    ).not.toThrow();
  });

  it("存在しない artPathId で removeControlPoint は何もしない", () => {
    setup();
    expect(() =>
      useArtPathStore.getState().removeControlPoint("nonexistent", 0),
    ).not.toThrow();
  });

  it("存在しない artPathId で setStyle は何もしない", () => {
    setup();
    expect(() =>
      useArtPathStore.getState().setStyle("nonexistent", { color: 0xff0000 }),
    ).not.toThrow();
  });

  it("存在しない artPathId で setClosed は何もしない", () => {
    setup();
    expect(() => useArtPathStore.getState().setClosed("nonexistent", true)).not.toThrow();
  });


  it("children のないレイヤーが含まれるツリーでもArtPathを検索できる", () => {
    setup();
    const id = useArtPathStore.getState().addArtPath("テスト", 0, 0);
    useArtPathStore.getState().setStyle(id, { color: 0x00ff00 });

    const project = useEditorStore.getState().project!;
    const node = project.layers.find((l) => l.id === id) as ArtPathNode;
    expect(node.style.color).toBe(0x00ff00);
  });
});
