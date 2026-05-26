
import {
  artPathToMesh,
  buildStrokeMesh,
  tessellateArtPath,
} from "@vivi2d/core/artpath-utils";
import { flattenLayers } from "@vivi2d/core/layer-utils";
import type { ArtPathControlPoint, ArtPathStyle, LayerNode } from "@vivi2d/core/types";
import { hasChildren, isViviMesh, isArtPath, isGroup } from "@vivi2d/core/types";
import { describe, expect, it } from "vitest";
import { nodeKindLabel } from "@/lib/format-utils";
import {
  createViviMesh,
  createArtPathNode,
  createControlPoint,
  createGroup,
} from "@/test/fixtures";

const defaultStyle: ArtPathStyle = {
  color: 0x000000,
  baseWidth: 10,
  lineCap: "round",
  lineJoin: "round",
};

describe("ArtPath統合テスト", () => {
  describe("テッセレーション→メッシュ化の完全パイプライン", () => {
    it("ArtPathNode フィクスチャ作成→テッセレーション→メッシュ化が成功する", () => {
      const artPath = createArtPathNode({
        controlPoints: [
          createControlPoint({ x: 0, y: 0, width: 1, opacity: 1 }),
          createControlPoint({ x: 100, y: 0, width: 1, opacity: 1 }),
          createControlPoint({ x: 100, y: 100, width: 1, opacity: 1 }),
        ],
      });

      const tessPoints = tessellateArtPath(artPath.controlPoints, artPath.closed, 8);
      expect(tessPoints.length).toBeGreaterThan(0);

      for (const pt of tessPoints) {
        expect(Number.isFinite(pt.x)).toBe(true);
        expect(Number.isFinite(pt.y)).toBe(true);
        expect(pt.width).toBeGreaterThan(0);
        expect(pt.opacity).toBeGreaterThanOrEqual(0);
        expect(pt.opacity).toBeLessThanOrEqual(1);
      }

      const mesh = buildStrokeMesh(tessPoints, artPath.style);
      expect(mesh.vertices.length).toBeGreaterThan(0);
      expect(mesh.uvs.length).toBe(mesh.vertices.length);
      expect(mesh.indices.length).toBeGreaterThan(0);

      const vertexCount = mesh.vertices.length / 2;
      for (let i = 0; i < mesh.indices.length; i++) {
        expect(mesh.indices[i]).toBeLessThan(vertexCount);
      }
    });

    it("artPathToMesh 統合関数で一括処理できる", () => {
      const controlPoints: ArtPathControlPoint[] = [
        createControlPoint({ x: 0, y: 0, handleOutX: 30, handleOutY: 0 }),
        createControlPoint({ x: 100, y: 50, handleInX: -30, handleInY: 0 }),
      ];

      const mesh = artPathToMesh(controlPoints, false, defaultStyle, 16);
      expect(mesh.vertices.length).toBeGreaterThan(0);
      expect(mesh.indices.length).toBeGreaterThan(0);

      const expectedTriangles = (17 - 1) * 2;
      expect(mesh.indices.length).toBe(expectedTriangles * 3);
    });
  });

  describe("閉じたパスのテスト", () => {
    it("閉じたパスで三角形ストリップの首尾一貫性", () => {
      const controlPoints: ArtPathControlPoint[] = [
        createControlPoint({ x: 0, y: 0, width: 1, opacity: 1 }),
        createControlPoint({ x: 100, y: 0, width: 1, opacity: 1 }),
        createControlPoint({ x: 50, y: 86, width: 1, opacity: 1 }),
      ];

      const tessPoints = tessellateArtPath(controlPoints, true, 8);

      expect(tessPoints.length).toBeGreaterThan(0);

      const first = tessPoints[0]!;
      const last = tessPoints[tessPoints.length - 1]!;
      const dist = Math.sqrt((first.x - last.x) ** 2 + (first.y - last.y) ** 2);
      expect(dist).toBeLessThan(1);

      const mesh = buildStrokeMesh(tessPoints, defaultStyle);
      expect(mesh.vertices.length).toBeGreaterThan(0);

      const vertexCount = mesh.vertices.length / 2;
      for (let i = 0; i < mesh.indices.length; i++) {
        expect(mesh.indices[i]).toBeLessThan(vertexCount);
        expect(mesh.indices[i]).toBeGreaterThanOrEqual(0);
      }
    });

    it("開いたパスでは先頭と末尾が離れている", () => {
      const controlPoints: ArtPathControlPoint[] = [
        createControlPoint({ x: 0, y: 0 }),
        createControlPoint({ x: 100, y: 0 }),
        createControlPoint({ x: 100, y: 100 }),
      ];

      const tessPoints = tessellateArtPath(controlPoints, false, 8);
      const first = tessPoints[0]!;
      const last = tessPoints[tessPoints.length - 1]!;

      const dist = Math.sqrt((first.x - last.x) ** 2 + (first.y - last.y) ** 2);
      expect(dist).toBeGreaterThan(50);
    });
  });

  describe("LayerNode union との互換性", () => {
    it("ArtPathNode が isArtPath で正しく判定される", () => {
      const artPath = createArtPathNode();
      expect(isArtPath(artPath)).toBe(true);
      expect(isViviMesh(artPath)).toBe(false);
      expect(isGroup(artPath)).toBe(false);
    });

    it("ArtPathNode で hasChildren が false を返す", () => {
      const artPath = createArtPathNode();
      expect(hasChildren(artPath)).toBe(false);
    });

    it("flattenLayers に ArtPathNode を含むツリーを渡して正しくフラット化される", () => {
      const artPath = createArtPathNode({ name: "パスA" });
      const mesh = createViviMesh({ name: "メッシュA" });
      const group = createGroup({
        name: "グループ",
        children: [artPath, mesh],
      });
      const standaloneArtPath = createArtPathNode({ name: "パスB" });

      const layers: LayerNode[] = [group, standaloneArtPath];
      const flat = flattenLayers(layers);

      expect(flat).toHaveLength(4);
      expect(flat[0]!.name).toBe("グループ");
      expect(flat[1]!.name).toBe("パスA");
      expect(flat[1]!.kind).toBe("artPath");
      expect(flat[2]!.name).toBe("メッシュA");
      expect(flat[3]!.name).toBe("パスB");
      expect(flat[3]!.kind).toBe("artPath");
    });

    it('nodeKindLabel("artPath") が "アートパス" を返す', () => {
      expect(nodeKindLabel("artPath")).toBe("アートパス");
    });

    it("全ノード種別のラベルが正しく返る", () => {
      expect(nodeKindLabel("viviMesh")).toBe("ViviMesh");
      expect(nodeKindLabel("group")).toBe("グループ");
      expect(nodeKindLabel("bone")).toBe("ボーン");
      expect(nodeKindLabel("artPath")).toBe("アートパス");
    });
  });

  describe("エッジケース", () => {
    it("制御点が1つだけの場合は空の結果を返す", () => {
      const points = tessellateArtPath([createControlPoint({ x: 50, y: 50 })], false);
      expect(points).toHaveLength(0);

      const mesh = artPathToMesh(
        [createControlPoint({ x: 50, y: 50 })],
        false,
        defaultStyle,
      );
      expect(mesh.vertices.length).toBe(0);
    });

    it("幅が0の制御点でもクラッシュしない", () => {
      const controlPoints = [
        createControlPoint({ x: 0, y: 0, width: 0 }),
        createControlPoint({ x: 100, y: 0, width: 0 }),
      ];

      const mesh = artPathToMesh(controlPoints, false, defaultStyle);
      expect(mesh.vertices.length).toBeGreaterThan(0);
    });

    it("ハンドル付きベジェ曲線が滑らかにテッセレーションされる", () => {
      const controlPoints = [
        createControlPoint({
          x: 0,
          y: 0,
          handleOutX: 50,
          handleOutY: -50,
          width: 1,
          opacity: 1,
        }),
        createControlPoint({
          x: 100,
          y: 0,
          handleInX: -50,
          handleInY: -50,
          width: 1,
          opacity: 1,
        }),
      ];

      const tessPoints = tessellateArtPath(controlPoints, false, 32);

      const midPoint = tessPoints[Math.floor(tessPoints.length / 2)]!;
      expect(midPoint.y).toBeLessThan(0);

      for (let i = 1; i < tessPoints.length; i++) {
        const dx = tessPoints[i]!.x - tessPoints[i - 1]!.x;
        const dy = tessPoints[i]!.y - tessPoints[i - 1]!.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        expect(dist).toBeLessThan(20);
      }
    });
  });
});
