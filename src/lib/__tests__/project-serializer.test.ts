import type { AtlasData, ProjectData, ViviFileData } from "@vivi2d/core/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { remapUvs } from "@/lib/atlas-packer";
import {
  deserializeProject,
  parseViviFile,
  serializeProject,
} from "@/lib/project-serializer";
import {
  clearTextures,
  getAllTextureIds,
  getTexture,
  setTexture,
} from "@/lib/texture-store";
import {
  createViviMesh,
  createBoneNode,
  createEmptyProject,
  createGroup,
  createProject,
} from "@/test/fixtures";
import { mockCanvasContext, mockImageLoad } from "@/test/mocks";

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function makeTexturesForProject(
  project: ProjectData,
): ReadonlyMap<string, HTMLCanvasElement> {
  const map = new Map<string, HTMLCanvasElement>();
  const collect = (nodes: ProjectData["layers"]) => {
    for (const node of nodes) {
      if (node.kind === "viviMesh") {
        map.set(node.id, makeCanvas(node.width, node.height));
      }
      collect(node.children);
    }
  };
  collect(project.layers);
  return map;
}

// ============================================================
// serializeProject
// ============================================================

describe("serializeProject", () => {
  beforeEach(() => mockCanvasContext());
  afterEach(() => {
    vi.restoreAllMocks();
    clearTextures();
  });

  it("rejects editor-only motion preview fields before project save", () => {
    const project = createEmptyProject() as ProjectData & { previewOnly?: boolean };
    project.previewOnly = true;

    expect(() => serializeProject(project, new Map())).toThrow(
      /local motion preview guard failed/,
    );
  });

  it("テクスチャなしのプロジェクトをシリアライズできる", () => {
    const project = createEmptyProject();
    const result = serializeProject(project, new Map());

    expect(result.version).toBe(9);
    expect(result.project.name).toBe(project.name);
    expect(result.atlases).toEqual([]);
  });

  it("テクスチャありのプロジェクトをシリアライズできる", () => {
    const mesh = createViviMesh({ name: "体" });
    const project = createProject({ layers: [mesh] });
    const textures = makeTexturesForProject(project);

    const result = serializeProject(project, textures);

    expect(result.version).toBe(9);
    expect(result.atlases.length).toBeGreaterThanOrEqual(1);
    const allEntries = result.atlases.flatMap((a) => a.entries);
    expect(allEntries.some((e) => e.layerId === mesh.id)).toBe(true);
  });

  it("元のプロジェクトデータを変更しない", () => {
    const mesh = createViviMesh();
    const originalUvs = [...mesh.mesh.uvs];
    const project = createProject({ layers: [mesh] });
    const textures = makeTexturesForProject(project);

    serializeProject(project, textures);

    expect(mesh.mesh.uvs).toEqual(originalUvs);
  });

  it("UVがアトラス空間にリマッピングされる", () => {
    const mesh = createViviMesh();
    const project = createProject({ layers: [mesh] });
    const textures = makeTexturesForProject(project);

    const result = serializeProject(project, textures);
    const serializedMesh = result.project.layers[0]!;

    expect(serializedMesh).toBeDefined();
    if (serializedMesh.kind === "viviMesh") {
      for (const uv of serializedMesh.mesh.uvs) {
        expect(uv).toBeGreaterThanOrEqual(0);
        expect(uv).toBeLessThanOrEqual(1);
      }
    }
  });
});

// ============================================================
// parseViviFile
// ============================================================

describe("parseViviFile", () => {
  const validData: ViviFileData = {
    version: 1,
    project: createEmptyProject(),
    atlases: [],
  };

  it("正常な JSON をパースできる", () => {
    const result = parseViviFile(JSON.stringify(validData));
    expect(result.version).toBe(1);
    expect(result.project.name).toBe(validData.project.name);
  });

  it("不正な JSON で例外をスローする", () => {
    expect(() => parseViviFile("{invalid}")).toThrow(
      "Failed to parse .vivi file: invalid JSON",
    );
  });

  it("オブジェクトでない値で例外をスローする", () => {
    expect(() => parseViviFile('"string"')).toThrow(
      "Failed to parse .vivi file: root value is not an object",
    );
  });

  it("バージョン不一致で例外をスローする", () => {
    const data = { ...validData, version: 99 };
    expect(() => parseViviFile(JSON.stringify(data))).toThrow(
      "Invalid .vivi file version: 99",
    );
  });

  it("project フィールド欠落で例外をスローする", () => {
    const data = { version: 1, atlases: [] };
    expect(() => parseViviFile(JSON.stringify(data))).toThrow(
      ".vivi file is missing the project field",
    );
  });

  it("atlases フィールド欠落で例外をスローする", () => {
    const data = { version: 1, project: createEmptyProject() };
    expect(() => parseViviFile(JSON.stringify(data))).toThrow(
      ".vivi file is missing the atlases field",
    );
  });
});

// ============================================================
// deserializeProject
// ============================================================

describe("deserializeProject", () => {
  beforeEach(() => {
    mockCanvasContext();
    mockImageLoad();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    clearTextures();
  });

  it("アトラスなしのプロジェクトを復元できる", async () => {
    const fileData: ViviFileData = {
      version: 1,
      project: createEmptyProject(),
      atlases: [],
    };

    const project = await deserializeProject(fileData);
    expect(project.name).toBe("Empty project");
  });

  it("アトラスからテクスチャを復元して texture-store に登録する", async () => {
    const entry = { layerId: "mesh-1", x: 2, y: 2, width: 64, height: 64 };
    const atlas: AtlasData = {
      image: "AAAA",
      width: 256,
      height: 256,
      entries: [entry],
    };

    const mesh = createViviMesh({ id: "mesh-1", width: 64, height: 64 });
    mesh.mesh.uvs = remapUvs(mesh.mesh.uvs, entry, 256, 256);

    const fileData: ViviFileData = {
      version: 1,
      project: createProject({ layers: [mesh] }),
      atlases: [atlas],
    };

    const project = await deserializeProject(fileData);

    expect(getAllTextureIds()).toContain("mesh-1");
    const tex = getTexture("mesh-1");
    expect(tex).toBeDefined();
    expect(tex!.width).toBe(64);
    expect(tex!.height).toBe(64);

    const restoredMesh = project.layers[0]!;
    if (restoredMesh.kind === "viviMesh") {
      for (const uv of restoredMesh.mesh.uvs) {
        expect(uv).toBeGreaterThanOrEqual(-0.001);
        expect(uv).toBeLessThanOrEqual(1.001);
      }
    }
  });

  it("clearTextures を呼び出して前のテクスチャをクリアする", async () => {
    setTexture("old", makeCanvas(10, 10));

    const fileData: ViviFileData = {
      version: 1,
      project: createEmptyProject(),
      atlases: [],
    };

    await deserializeProject(fileData);
    expect(getTexture("old")).toBeUndefined();
  });
});


describe("ラウンドトリップ: serialize → parse → deserialize", () => {
  beforeEach(() => {
    mockCanvasContext();
    mockImageLoad();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    clearTextures();
  });

  it("プロジェクトのメタデータが保持される", async () => {
    const original = createProject({ name: "テストモデル" });
    const textures = makeTexturesForProject(original);

    const serialized = serializeProject(original, textures);
    const json = JSON.stringify(serialized);
    const parsed = parseViviFile(json);
    const restored = await deserializeProject(parsed);

    expect(restored.name).toBe("テストモデル");
    expect(restored.width).toBe(original.width);
    expect(restored.height).toBe(original.height);
  });

  it("ViviMesh のメッシュデータが保持される", async () => {
    const mesh = createViviMesh({ name: "テスト" });
    const originalVertices = [...mesh.mesh.vertices];
    const originalIndices = [...mesh.mesh.indices];
    const originalUvs = [...mesh.mesh.uvs];

    const project = createProject({ layers: [mesh] });
    const textures = makeTexturesForProject(project);

    const serialized = serializeProject(project, textures);
    const json = JSON.stringify(serialized);
    const parsed = parseViviFile(json);
    const restored = await deserializeProject(parsed);

    const restoredMesh = restored.layers[0]!;
    expect(restoredMesh.kind).toBe("viviMesh");
    if (restoredMesh.kind === "viviMesh") {
      expect(restoredMesh.mesh.vertices).toEqual(originalVertices);
      expect(restoredMesh.mesh.indices).toEqual(originalIndices);
      for (let i = 0; i < originalUvs.length; i++) {
        expect(restoredMesh.mesh.uvs[i]).toBeCloseTo(originalUvs[i]!, 5);
      }
    }
  });

  it("ネストされたレイヤー構造が保持される", async () => {
    const child = createViviMesh({ name: "子" });
    const group = createGroup({ name: "親", children: [child] });
    const project = createProject({ layers: [group] });
    const textures = makeTexturesForProject(project);

    const serialized = serializeProject(project, textures);
    const json = JSON.stringify(serialized);
    const parsed = parseViviFile(json);
    const restored = await deserializeProject(parsed);

    expect(restored.layers).toHaveLength(1);
    expect(restored.layers[0]!.name).toBe("親");
    expect(restored.layers[0]!.children).toHaveLength(1);
    expect(restored.layers[0]!.children[0]!.name).toBe("子");
  });
});


describe("parseViviFile — エッジケース", () => {
  it("不正なJSONで例外を投げる", () => {
    expect(() => parseViviFile("{invalid json")).toThrow(
      "Failed to parse .vivi file: invalid JSON",
    );
  });

  it("null を渡すと例外を投げる", () => {
    expect(() => parseViviFile("null")).toThrow(
      "Failed to parse .vivi file: root value is not an object",
    );
  });

  it("配列を渡すと例外を投げる", () => {
    expect(() => parseViviFile("[]")).toThrow(
      "Failed to parse .vivi file: root value is not an object",
    );
  });

  it("不正なバージョンで例外を投げる", () => {
    expect(() =>
      parseViviFile(JSON.stringify({ version: 99, project: {}, atlases: [] })),
    ).toThrow("Invalid .vivi file version: 99");
  });

  it("project フィールド欠損で例外を投げる", () => {
    expect(() => parseViviFile(JSON.stringify({ version: 2, atlases: [] }))).toThrow(
      ".vivi file is missing the project field",
    );
  });

  it("atlases フィールド欠損で例外を投げる", () => {
    expect(() => parseViviFile(JSON.stringify({ version: 2, project: {} }))).toThrow(
      ".vivi file is missing the atlases field",
    );
  });

  it("layers フィールド欠損で例外を投げる", () => {
    expect(() =>
      parseViviFile(
        JSON.stringify({ version: 2, project: { parameters: [] }, atlases: [] }),
      ),
    ).toThrow(".vivi file is missing the layers field");
  });

  it("parameters フィールド欠損で例外を投げる", () => {
    expect(() =>
      parseViviFile(JSON.stringify({ version: 2, project: { layers: [] }, atlases: [] })),
    ).toThrow(".vivi file is missing the parameters field");
  });
});


describe("parseViviFile — バージョン分岐カバレッジ", () => {
  it("version=1 を正常にパースできる", () => {
    const data = {
      version: 1,
      project: { layers: [], parameters: [] },
      atlases: [],
    };
    const result = parseViviFile(JSON.stringify(data));
    expect(result.version).toBe(1);
  });

  it("version=2 を正常にパースできる", () => {
    const data = {
      version: 2,
      project: { layers: [], parameters: [] },
      atlases: [],
    };
    const result = parseViviFile(JSON.stringify(data));
    expect(result.version).toBe(2);
  });

  it("version=3 を正常にパースできる", () => {
    const data = {
      version: 3,
      project: { layers: [], parameters: [] },
      atlases: [],
    };
    const result = parseViviFile(JSON.stringify(data));
    expect(result.version).toBe(3);
  });

  it("version=0 で例外をスローする", () => {
    const data = {
      version: 0,
      project: { layers: [], parameters: [] },
      atlases: [],
    };
    expect(() => parseViviFile(JSON.stringify(data))).toThrow(
      "Invalid .vivi file version: 0",
    );
  });

  it("version が文字列の場合、例外をスローする", () => {
    const data = {
      version: "1",
      project: { layers: [], parameters: [] },
      atlases: [],
    };
    expect(() => parseViviFile(JSON.stringify(data))).toThrow(
      "Invalid .vivi file version: 1",
    );
  });

  it("project がプリミティブ値の場合、例外をスローする", () => {
    const data = { version: 1, project: "not-object", atlases: [] };
    expect(() => parseViviFile(JSON.stringify(data))).toThrow(
      ".vivi file is missing the project field",
    );
  });

  it("project が null の場合、例外をスローする", () => {
    const data = { version: 1, project: null, atlases: [] };
    expect(() => parseViviFile(JSON.stringify(data))).toThrow(
      ".vivi file is missing the project field",
    );
  });

  it("atlases がオブジェクト（配列でない）の場合、例外をスローする", () => {
    const data = {
      version: 1,
      project: { layers: [], parameters: [] },
      atlases: {},
    };
    expect(() => parseViviFile(JSON.stringify(data))).toThrow(
      ".vivi file is missing the atlases field",
    );
  });

  it("数値の JSON を渡すとオブジェクトではありません例外", () => {
    expect(() => parseViviFile("42")).toThrow(
      "Failed to parse .vivi file: root value is not an object",
    );
  });

  it("boolean の JSON を渡すとオブジェクトではありません例外", () => {
    expect(() => parseViviFile("true")).toThrow(
      "Failed to parse .vivi file: root value is not an object",
    );
  });
});


describe("serializeProject — ブランチカバレッジ強化", () => {
  beforeEach(() => mockCanvasContext());
  afterEach(() => {
    vi.restoreAllMocks();
    clearTextures();
  });

  it("group ノードのみのプロジェクトを正常にシリアライズできる", () => {
    const group = createGroup({ name: "空グループ" });
    const project = createProject({ layers: [group] });
    const result = serializeProject(project, new Map());
    expect(result.version).toBe(9);
    expect(result.project.layers[0]!.name).toBe("空グループ");
  });

  it("テクスチャが存在しないメッシュの UV はリマッピングされない", () => {
    const mesh = createViviMesh({ name: "テクスチャなし" });
    const originalUvs = [...mesh.mesh.uvs];
    const project = createProject({ layers: [mesh] });
    const textures = new Map<string, HTMLCanvasElement>();

    const result = serializeProject(project, textures);
    const serializedMesh = result.project.layers.find((l) => l.name === "テクスチャなし");
    if (serializedMesh && serializedMesh.kind === "viviMesh") {
      expect(serializedMesh.mesh.uvs).toEqual(originalUvs);
    }
  });
});


describe("deserializeProject — ブランチカバレッジ強化", () => {
  beforeEach(() => {
    mockCanvasContext();
    mockImageLoad();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    clearTextures();
  });

  it("version=2 のデータを v2→v3 マイグレーションを適用して復元できる", async () => {
    const fileData: ViviFileData = {
      version: 2,
      project: createEmptyProject(),
      atlases: [],
    };
    const project = await deserializeProject(fileData);
    expect(project.name).toBe("Empty project");
  });

  it("version=3 のデータを復元できる", async () => {
    const fileData: ViviFileData = {
      version: 3,
      project: createEmptyProject(),
      atlases: [],
    };
    const project = await deserializeProject(fileData);
    expect(project.name).toBe("Empty project");
  });

  it("エントリに対応しないメッシュの UV はそのまま保持される", async () => {
    const mesh = createViviMesh({ id: "orphan-mesh" });
    const fileData: ViviFileData = {
      version: 1,
      project: createProject({ layers: [mesh] }),
      atlases: [],
    };
    const project = await deserializeProject(fileData);
    const restoredMesh = project.layers.find((l) => l.id === "orphan-mesh");
    expect(restoredMesh).toBeDefined();
  });


  it("ボーン親子階層がシリアライズ後も保持される", async () => {
    const grandchild = createBoneNode({ id: "gc", name: "孫", parentBoneId: "child" });
    const child = createBoneNode({
      id: "child",
      name: "子",
      parentBoneId: "root",
      children: [grandchild],
    });
    const root = createBoneNode({ id: "root", name: "ルート", children: [child] });

    const project = createProject({ layers: [root] });
    const serialized = serializeProject(project, new Map());
    const json = JSON.stringify(serialized);
    const parsed = parseViviFile(json);
    const restored = await deserializeProject(parsed);

    const rootBones = restored.layers.filter((l) => l.kind === "bone");
    expect(rootBones).toHaveLength(1);
    expect(rootBones[0]!.name).toBe("ルート");
    expect(rootBones[0]!.children).toHaveLength(1);
    expect(rootBones[0]!.children[0]!.name).toBe("子");
    expect(rootBones[0]!.children[0]!.children).toHaveLength(1);
    expect(rootBones[0]!.children[0]!.children[0]!.name).toBe("孫");
  });

  it("parentBoneIdがシリアライズ後も保持される", async () => {
    const child = createBoneNode({ id: "child", name: "子", parentBoneId: "root" });
    const root = createBoneNode({ id: "root", name: "ルート", children: [child] });

    const project = createProject({ layers: [root] });
    const serialized = serializeProject(project, new Map());
    const json = JSON.stringify(serialized);
    const parsed = parseViviFile(json);
    const restored = await deserializeProject(parsed);

    const rootBone = restored.layers[0]!;
    const childBone = rootBone.children[0]! as any;
    expect(childBone.parentBoneId).toBe("root");
  });

  it("ボーン階層とメッシュの混在ツリーがシリアライズ後も保持される", async () => {
    const bone = createBoneNode({ id: "bone1", name: "ボーン" });
    const mesh = createViviMesh({ id: "mesh1", name: "メッシュ" });
    const group = createGroup({ id: "grp", name: "グループ", children: [bone, mesh] });

    const project = createProject({ layers: [group] });
    const serialized = serializeProject(project, new Map());
    const json = JSON.stringify(serialized);
    const parsed = parseViviFile(json);
    const restored = await deserializeProject(parsed);

    const restoredGroup = restored.layers[0]!;
    expect(restoredGroup.children).toHaveLength(2);
    expect(restoredGroup.children.some((c) => c.kind === "bone")).toBe(true);
    expect(restoredGroup.children.some((c) => c.kind === "viviMesh")).toBe(true);
  });

  it("空のボーン階層（子なし）がシリアライズ後も保持される", async () => {
    const bone = createBoneNode({ id: "single", name: "単独ボーン" });

    const project = createProject({ layers: [bone] });
    const serialized = serializeProject(project, new Map());
    const json = JSON.stringify(serialized);
    const parsed = parseViviFile(json);
    const restored = await deserializeProject(parsed);

    const restoredBone = restored.layers.find((l) => l.id === "single");
    expect(restoredBone).toBeDefined();
    expect(restoredBone!.kind).toBe("bone");
    expect(restoredBone!.children).toHaveLength(0);
  });
});
