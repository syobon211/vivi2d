import { describe, expect, it } from "vitest";
import {
  hitTestColliders,
  hitTestCollidersAll,
  hitTestMesh,
  pointInCircle,
  pointInRect,
  pointInTriangle,
} from "../collider";
import type { MeshRenderState } from "../model";
import type { ColliderData } from "../types";


function createMeshState(overrides: Partial<MeshRenderState> = {}): MeshRenderState {
  return {
    id: overrides.id ?? "mesh-1",
    vertices: overrides.vertices ?? new Float32Array([0, 0, 100, 0, 100, 100, 0, 100]),
    verticesSpace: overrides.verticesSpace,
    uvs: overrides.uvs ?? new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
    indices: overrides.indices ?? new Uint32Array([0, 1, 2, 0, 2, 3]),
    x: overrides.x ?? 0,
    y: overrides.y ?? 0,
    opacity: overrides.opacity ?? 1,
    visible: overrides.visible ?? true,
    blendMode: overrides.blendMode ?? "normal",
    multiplyColor: overrides.multiplyColor ?? { r: 1, g: 1, b: 1 },
    screenColor: overrides.screenColor ?? undefined,
    drawOrder: overrides.drawOrder ?? 0,
    culled: overrides.culled ?? false,
  };
}

// ============================================================
// pointInTriangle
// ============================================================

describe("pointInTriangle", () => {
  const x1 = 0,
    y1 = 0;
  const x2 = 100,
    y2 = 0;
  const x3 = 50,
    y3 = 100;

  it("三角形の内部の点 → true", () => {
    expect(pointInTriangle(50, 33, x1, y1, x2, y2, x3, y3)).toBe(true);
    expect(pointInTriangle(30, 20, x1, y1, x2, y2, x3, y3)).toBe(true);
  });

  it("三角形の外部の点 → false", () => {
    expect(pointInTriangle(110, 10, x1, y1, x2, y2, x3, y3)).toBe(false);
    expect(pointInTriangle(50, -10, x1, y1, x2, y2, x3, y3)).toBe(false);
    expect(pointInTriangle(-10, 50, x1, y1, x2, y2, x3, y3)).toBe(false);
  });

  it("三角形の辺上の点 → true", () => {
    expect(pointInTriangle(50, 0, x1, y1, x2, y2, x3, y3)).toBe(true);
    expect(pointInTriangle(25, 50, x1, y1, x2, y2, x3, y3)).toBe(true);
  });

  it("三角形の頂点上の点 → true", () => {
    expect(pointInTriangle(0, 0, x1, y1, x2, y2, x3, y3)).toBe(true);
    expect(pointInTriangle(100, 0, x1, y1, x2, y2, x3, y3)).toBe(true);
    expect(pointInTriangle(50, 100, x1, y1, x2, y2, x3, y3)).toBe(true);
  });

  it("退化三角形（面積0: 3点が同一直線上）→ false", () => {
    expect(pointInTriangle(50, 0, 0, 0, 50, 0, 100, 0)).toBe(false);
    expect(pointInTriangle(5, 5, 5, 5, 5, 5, 5, 5)).toBe(false);
  });

});

// ============================================================
// pointInRect
// ============================================================

describe("pointInRect", () => {
  const rx = 10,
    ry = 20,
    rw = 80,
    rh = 60;

  it("矩形内部の点 → true", () => {
    expect(pointInRect(50, 50, rx, ry, rw, rh)).toBe(true);
    expect(pointInRect(30, 40, rx, ry, rw, rh)).toBe(true);
  });

  it("矩形外部の点 → false", () => {
    expect(pointInRect(5, 50, rx, ry, rw, rh)).toBe(false);
    expect(pointInRect(50, 10, rx, ry, rw, rh)).toBe(false);
    expect(pointInRect(95, 50, rx, ry, rw, rh)).toBe(false);
    expect(pointInRect(50, 85, rx, ry, rw, rh)).toBe(false);
  });

  it("矩形の辺上の点 → true", () => {
    expect(pointInRect(50, 20, rx, ry, rw, rh)).toBe(true);
    expect(pointInRect(50, 80, rx, ry, rw, rh)).toBe(true);
    expect(pointInRect(10, 50, rx, ry, rw, rh)).toBe(true);
    expect(pointInRect(90, 50, rx, ry, rw, rh)).toBe(true);
  });

  it("矩形の角の点 → true", () => {
    expect(pointInRect(10, 20, rx, ry, rw, rh)).toBe(true);
    expect(pointInRect(90, 20, rx, ry, rw, rh)).toBe(true);
    expect(pointInRect(10, 80, rx, ry, rw, rh)).toBe(true);
    expect(pointInRect(90, 80, rx, ry, rw, rh)).toBe(true);
  });
});

// ============================================================
// pointInCircle
// ============================================================

describe("pointInCircle", () => {
  const cx = 50,
    cy = 50,
    radius = 30;

  it("円内部の点 → true", () => {
    expect(pointInCircle(50, 50, cx, cy, radius)).toBe(true);
    expect(pointInCircle(60, 50, cx, cy, radius)).toBe(true);
    expect(pointInCircle(50, 70, cx, cy, radius)).toBe(true);
  });

  it("円外部の点 → false", () => {
    expect(pointInCircle(100, 100, cx, cy, radius)).toBe(false);
    expect(pointInCircle(50, 85, cx, cy, radius)).toBe(false);
    expect(pointInCircle(0, 0, cx, cy, radius)).toBe(false);
  });

  it("円周上の点 → true（距離 = 半径）", () => {
    expect(pointInCircle(80, 50, cx, cy, radius)).toBe(true);
    expect(pointInCircle(50, 20, cx, cy, radius)).toBe(true);
    expect(pointInCircle(20, 50, cx, cy, radius)).toBe(true);
  });

  it("中心の点 → true", () => {
    expect(pointInCircle(50, 50, cx, cy, radius)).toBe(true);
  });
});

// ============================================================
// hitTestMesh
// ============================================================

describe("hitTestMesh", () => {
  it("正方形メッシュ（2三角形）の内部にヒット → true", () => {
    const state = createMeshState();
    expect(hitTestMesh(state, 50, 50)).toBe(true);
    expect(hitTestMesh(state, 10, 10)).toBe(true);
    expect(hitTestMesh(state, 90, 90)).toBe(true);
  });

  it("メッシュ外部 → false", () => {
    const state = createMeshState();
    expect(hitTestMesh(state, -10, 50)).toBe(false);
    expect(hitTestMesh(state, 50, -10)).toBe(false);
    expect(hitTestMesh(state, 110, 50)).toBe(false);
    expect(hitTestMesh(state, 50, 110)).toBe(false);
  });

  it("メッシュのオフセット(x, y)が正しく考慮される", () => {
    const state = createMeshState({ x: 200, y: 300 });
    expect(hitTestMesh(state, 250, 350)).toBe(true);
    expect(hitTestMesh(state, 50, 50)).toBe(false);
    expect(hitTestMesh(state, 200, 300)).toBe(true);
    expect(hitTestMesh(state, 300, 400)).toBe(true);
  });

  it("uses model-space vertices directly for skinned mesh snapshots", () => {
    const state = createMeshState({
      x: 200,
      y: 300,
      verticesSpace: "model",
      vertices: new Float32Array([200, 300, 300, 300, 200, 400]),
      indices: new Uint32Array([0, 1, 2]),
    });

    expect(hitTestMesh(state, 250, 350)).toBe(true);
    expect(hitTestMesh(state, 50, 50)).toBe(false);
  });
});

// ============================================================
// hitTestColliders
// ============================================================

describe("hitTestColliders", () => {
  it("矩形コライダーにヒット → 結果を返す", () => {
    const colliders: ColliderData[] = [
      {
        id: "col-rect",
        name: "矩形コライダー",
        shape: { type: "rectangle", x: 0, y: 0, width: 100, height: 100 },
        tag: "body",
        enabled: true,
      },
    ];
    const meshStates = new Map<string, MeshRenderState>();

    const result = hitTestColliders(colliders, meshStates, 50, 50);
    expect(result).not.toBeNull();
    expect(result!.colliderId).toBe("col-rect");
    expect(result!.colliderName).toBe("矩形コライダー");
    expect(result!.tag).toBe("body");
    expect(result!.meshId).toBeUndefined();
  });

  it("円コライダーにヒット → 結果を返す", () => {
    const colliders: ColliderData[] = [
      {
        id: "col-circle",
        name: "円コライダー",
        shape: { type: "circle", x: 50, y: 50, radius: 30 },
        tag: "head",
        enabled: true,
      },
    ];
    const meshStates = new Map<string, MeshRenderState>();

    const result = hitTestColliders(colliders, meshStates, 50, 50);
    expect(result).not.toBeNull();
    expect(result!.colliderId).toBe("col-circle");
    expect(result!.colliderName).toBe("円コライダー");
    expect(result!.tag).toBe("head");
  });

  it("メッシュコライダーにヒット → 結果にmeshIdが含まれる", () => {
    const meshState = createMeshState({ id: "mesh-face", drawOrder: 5 });
    const meshStates = new Map<string, MeshRenderState>([["mesh-face", meshState]]);
    const colliders: ColliderData[] = [
      {
        id: "col-mesh",
        name: "メッシュコライダー",
        shape: { type: "mesh", meshId: "mesh-face" },
        enabled: true,
      },
    ];

    const result = hitTestColliders(colliders, meshStates, 50, 50);
    expect(result).not.toBeNull();
    expect(result!.colliderId).toBe("col-mesh");
    expect(result!.meshId).toBe("mesh-face");
  });

  it("どこにもヒットしない → null", () => {
    const colliders: ColliderData[] = [
      {
        id: "col-rect",
        name: "小さい矩形",
        shape: { type: "rectangle", x: 0, y: 0, width: 10, height: 10 },
        enabled: true,
      },
    ];
    const meshStates = new Map<string, MeshRenderState>();

    const result = hitTestColliders(colliders, meshStates, 50, 50);
    expect(result).toBeNull();
  });

  it("disabled コライダーは無視される", () => {
    const colliders: ColliderData[] = [
      {
        id: "col-disabled",
        name: "無効コライダー",
        shape: { type: "rectangle", x: 0, y: 0, width: 200, height: 200 },
        enabled: false,
      },
    ];
    const meshStates = new Map<string, MeshRenderState>();

    const result = hitTestColliders(colliders, meshStates, 50, 50);
    expect(result).toBeNull();
  });

  it("複数コライダーの前面優先（drawOrder降順）", () => {
    const meshFront = createMeshState({ id: "mesh-front", drawOrder: 10 });
    const meshBack = createMeshState({ id: "mesh-back", drawOrder: 1 });
    const meshStates = new Map<string, MeshRenderState>([
      ["mesh-front", meshFront],
      ["mesh-back", meshBack],
    ]);

    const colliders: ColliderData[] = [
      {
        id: "col-back",
        name: "背面コライダー",
        shape: { type: "mesh", meshId: "mesh-back" },
        enabled: true,
      },
      {
        id: "col-front",
        name: "前面コライダー",
        shape: { type: "mesh", meshId: "mesh-front" },
        enabled: true,
      },
    ];

    const result = hitTestColliders(colliders, meshStates, 50, 50);
    expect(result).not.toBeNull();
    expect(result!.colliderId).toBe("col-front");
    expect(result!.colliderName).toBe("前面コライダー");
  });
});

// ============================================================
// hitTestCollidersAll
// ============================================================

describe("hitTestCollidersAll", () => {
  it("重なったコライダー全てを返す（前面から順に）", () => {
    const meshA = createMeshState({ id: "mesh-a", drawOrder: 10 });
    const meshB = createMeshState({ id: "mesh-b", drawOrder: 5 });
    const meshStates = new Map<string, MeshRenderState>([
      ["mesh-a", meshA],
      ["mesh-b", meshB],
    ]);

    const colliders: ColliderData[] = [
      {
        id: "col-a",
        name: "コライダーA",
        shape: { type: "mesh", meshId: "mesh-a" },
        enabled: true,
      },
      {
        id: "col-b",
        name: "コライダーB",
        shape: { type: "mesh", meshId: "mesh-b" },
        enabled: true,
      },
      {
        id: "col-disabled",
        name: "無効コライダー",
        shape: { type: "mesh", meshId: "mesh-a" },
        enabled: false,
      },
    ];

    const results = hitTestCollidersAll(colliders, meshStates, 50, 50);

    expect(results).toHaveLength(2);
    expect(results[0]!.colliderId).toBe("col-a");
    expect(results[0]!.meshId).toBe("mesh-a");
    expect(results[1]!.colliderId).toBe("col-b");
    expect(results[1]!.meshId).toBe("mesh-b");
  });

  it("どこにもヒットしない場合は空配列を返す", () => {
    const colliders: ColliderData[] = [
      {
        id: "col-rect",
        name: "小さい矩形",
        shape: { type: "rectangle", x: 0, y: 0, width: 10, height: 10 },
        enabled: true,
      },
    ];
    const meshStates = new Map<string, MeshRenderState>();

    const results = hitTestCollidersAll(colliders, meshStates, 999, 999);
    expect(results).toHaveLength(0);
  });
});
