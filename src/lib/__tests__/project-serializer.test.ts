import { ensureProjectDefaults } from "@vivi2d/core/project-migration";
import type { AtlasData, ProjectData, ViviFileData } from "@vivi2d/core/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { remapUvs } from "@/lib/atlas-packer";
import {
  deserializeProject,
  parseViviFile,
  prepareDeserializedProject,
  serializeProject,
} from "@/lib/project-serializer";
import {
  clearTextures,
  getAllTextureIds,
  getTexture,
  setTexture,
} from "@/lib/texture-store";
import {
  createAnimationClip,
  createBoneNode,
  createEmptyProject,
  createGroup,
  createProject,
  createViviMesh,
} from "@/test/fixtures";
import { MOCK_PNG_BASE64, mockCanvasContext, mockImageLoad } from "@/test/mocks";
import embeddedManifest from "../../../tests/conformance/project-embedded-round-trip-v11/manifest.json";

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
    const mesh = createViviMesh({ id: "uv-mesh", width: 64, height: 32 });
    mesh.mesh.uvs = [0, 0, 1, 0, 0.25, 0.75];
    const project = createProject({ layers: [mesh] });
    const result = serializeProject(project, makeTexturesForProject(project));
    expect(result.atlases).toHaveLength(1);
    const atlas = result.atlases[0]!;
    expect([atlas.width, atlas.height]).toEqual([256, 256]);
    expect(atlas.entries).toEqual([
      { layerId: "uv-mesh", x: 2, y: 2, width: 64, height: 32 },
    ]);
    const serializedMesh = result.project.layers[0]!;
    if (serializedMesh.kind !== "viviMesh") throw new Error("Expected mesh");
    // Independent three-point witness: atlas offset plus full/quarter width and three-quarter height.
    expect(serializedMesh.mesh.uvs).toEqual([
      2 / 256,
      2 / 256,
      66 / 256,
      2 / 256,
      18 / 256,
      26 / 256,
    ]);
    expect(mesh.mesh.uvs).toEqual([0, 0, 1, 0, 0.25, 0.75]);
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

  it("opens the unchanged admitted v9 corpus with owned runtime defaults, without a phantom scene", async () => {
    const source = embeddedManifest.documents.find(
      (row) => row.id === "core-v9-migration",
    )!.inputUtf8;
    const incumbent = makeCanvas(2, 2);
    setTexture("incumbent", incumbent);
    const prepared = await prepareDeserializedProject(parseViviFile(source));
    expect(prepared.project.scenes).toEqual([]);
    expect(prepared.project.clips).toEqual([]);
    expect(prepared.project.physicsGroups).toEqual([]);
    expect(prepared.project.lipsyncConfig).toEqual({
      enabled: false,
      targetParameterId: null,
      source: "microphone",
      threshold: 0.02,
      smoothing: 0.7,
      gain: 2,
    });
    expect(prepared.textures.size).toBeGreaterThan(0);
    expect(getAllTextureIds()).toEqual(["incumbent"]);
    expect(getTexture("incumbent")).toBe(incumbent);
    const other = ensureProjectDefaults(parseViviFile(source).project);
    prepared.project.lipsyncConfig.gain = 5;
    prepared.project.physicsGroups.push({} as ProjectData["physicsGroups"][number]);
    expect(other.lipsyncConfig.gain).toBe(2);
    expect(other.physicsGroups).toEqual([]);
    const omitted = parseViviFile(
      JSON.stringify({
        version: 9,
        project: { layers: [], parameters: [] },
        atlases: [],
      }),
    );
    expect((await prepareDeserializedProject(omitted)).project).toMatchObject({
      name: "Untitled",
      width: 1,
      height: 1,
    });
  });

  it("routes historical clips only for pre-v2 while preserving authored v9 settings", async () => {
    const clip = createAnimationClip({ id: "retained-clip" });
    for (const version of [1, 9] as const) {
      const parsed = parseViviFile(
        JSON.stringify({
          version,
          project: createProject({ clips: [clip], scenes: [] }),
          atlases: [],
        }),
      );
      const { project } = await prepareDeserializedProject(parsed);
      if (version === 1) {
        expect(project.clips).toEqual([]);
        expect(project.scenes).toEqual([
          { id: expect.any(String), name: "Scene 1", clips: [clip] },
        ]);
      } else {
        expect(project.scenes).toEqual([]);
        expect(project.clips).toEqual([clip]);
      }
    }
    const authored = createProject({
      scenes: [{ id: "retained-scene", name: "Authored scene", clips: [clip] }],
    });
    authored.lipsyncConfig = { ...authored.lipsyncConfig, enabled: true, gain: 3 };
    const parsed = parseViviFile(
      JSON.stringify({ version: 9, project: authored, atlases: [] }),
    );
    const scenes = parsed.project.scenes,
      lipsync = parsed.project.lipsyncConfig;
    const prepared = await prepareDeserializedProject(parsed);
    expect(prepared.project.scenes).toBe(scenes);
    expect(prepared.project.lipsyncConfig).toBe(lipsync);
    expect(prepared.project.scenes).toEqual(authored.scenes);
    expect(prepared.project.lipsyncConfig).toEqual(authored.lipsyncConfig);
  });

  it("rejects supplied malformed lip config before image decode, preserving incumbent textures", async () => {
    const source = JSON.parse(
      embeddedManifest.documents.find((row) => row.id === "core-v9-migration")!.inputUtf8,
    );
    const incumbent = makeCanvas(2, 2);
    setTexture("incumbent", incumbent);
    vi.mocked(Image).mockClear();
    for (const config of [
      null,
      { ...ensureProjectDefaults(source.project).lipsyncConfig, enabled: "true" },
    ]) {
      source.project.lipsyncConfig = config;
      await expect(
        (async () => prepareDeserializedProject(parseViviFile(JSON.stringify(source))))(),
      ).rejects.toThrow();
    }
    expect(Image).not.toHaveBeenCalled();
    expect(getAllTextureIds()).toEqual(["incumbent"]);
    expect(getTexture("incumbent")).toBe(incumbent);
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

  it("preserves current textures when a later atlas image fails to load", async () => {
    const original = makeCanvas(2, 2);
    setTexture("existing-mesh", original);
    let imageIndex = 0;
    vi.mocked(globalThis.Image).mockImplementation(function () {
      const img = { onload: null, onerror: null } as unknown as HTMLImageElement;
      const fail = imageIndex++ === 1;
      Object.defineProperty(img, "src", {
        set() {
          queueMicrotask(() => {
            if (fail) img.onerror?.(new Event("error"));
            else img.onload?.(new Event("load"));
          });
        },
      });
      return img;
    } as unknown as typeof Image);
    const fileData: ViviFileData = {
      version: 1,
      project: createEmptyProject(),
      atlases: ["incoming-one", "incoming-two"].map((layerId) => ({
        image: MOCK_PNG_BASE64,
        width: 2,
        height: 2,
        entries: [{ layerId, x: 0, y: 0, width: 2, height: 2 }],
      })),
    };

    await expect(deserializeProject(fileData)).rejects.toThrow(
      "Failed to load atlas image",
    );
    expect(getAllTextureIds()).toEqual(["existing-mesh"]);
    expect(getTexture("existing-mesh")).toBe(original);
  });

  it("アトラスからテクスチャを復元して texture-store に登録する", async () => {
    const entry = { layerId: "mesh-1", x: 2, y: 2, width: 64, height: 64 };
    const atlas: AtlasData = {
      image: MOCK_PNG_BASE64,
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

  it.each([
    { width: 0, height: 2, expected: [0, 0, 0, 0, 0, 0.5, 0, 0.5] },
    { width: 2, height: 0, expected: [0, 0, 0.5, 0, 0, 0, 0.5, 0] },
    { width: 0, height: 0, expected: [0, 0, 0, 0, 0, 0, 0, 0] },
  ])("canonicalizes zero axes when restoring a parsed $width x $height entry", async ({
    width,
    height,
    expected,
  }) => {
    const mesh = createViviMesh({ id: "mesh-1" });
    mesh.mesh.uvs = [0.25, 0.25, 0.375, 0.25, 0.25, 0.375, 0.375, 0.375];
    const fileData: ViviFileData = {
      version: 1,
      project: createProject({ layers: [mesh] }),
      atlases: [
        {
          image: MOCK_PNG_BASE64,
          width: 8,
          height: 8,
          entries: [{ layerId: "mesh-1", x: 2, y: 2, width, height }],
        },
      ],
    };

    const project = await deserializeProject(parseViviFile(JSON.stringify(fileData)));

    expect(getAllTextureIds()).toEqual(["mesh-1"]);
    expect(getTexture("mesh-1")!.width).toBe(width);
    expect(getTexture("mesh-1")!.height).toBe(height);
    const restored = project.layers[0]!;
    if (restored.kind !== "viviMesh") throw new Error("Expected restored mesh");
    expect(restored.mesh.uvs).toEqual(expected);
    expect(restored.mesh.uvs.every(Number.isFinite)).toBe(true);
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
    const grandchild = createBoneNode({ id: "gc", name: "孫", parentBoneId: "child" });
    const child = createBoneNode({
      id: "child",
      name: "子",
      parentBoneId: "root",
      children: [grandchild],
    });
    const root = createBoneNode({ id: "root", name: "ルート", children: [child] });
    const mesh = createViviMesh({ id: "mesh", name: "テスト", width: 64, height: 32 });
    const leaf = createBoneNode({ id: "single", name: "単独ボーン" });
    const group = createGroup({ id: "grp", name: "親", children: [root, mesh] });
    const original = createProject({
      name: "テストモデル",
      width: 640,
      height: 480,
      layers: [group, leaf],
    });
    const originalVertices = [...mesh.mesh.vertices];
    const originalIndices = [...mesh.mesh.indices];
    const originalUvs = [...mesh.mesh.uvs];
    const serialized = serializeProject(original, makeTexturesForProject(original));
    const restored = await deserializeProject(parseViviFile(JSON.stringify(serialized)));
    expect([restored.name, restored.width, restored.height]).toEqual([
      "テストモデル",
      640,
      480,
    ]);
    expect(restored.layers.map((layer) => [layer.id, layer.kind, layer.name])).toEqual([
      ["grp", "group", "親"],
      ["single", "bone", "単独ボーン"],
    ]);
    const restoredGroup = restored.layers[0]!;
    expect(restoredGroup.children).toHaveLength(2);
    expect(restoredGroup.children[0]).toEqual(root);
    expect(restored.layers[1]).toEqual(leaf);
    const restoredMesh = restoredGroup.children[1]!;
    expect([restoredMesh.id, restoredMesh.name]).toEqual(["mesh", "テスト"]);
    if (restoredMesh.kind !== "viviMesh") throw new Error("Expected restored mesh");
    expect(restoredMesh.mesh.vertices).toEqual(originalVertices);
    expect(restoredMesh.mesh.indices).toEqual(originalIndices);
    expect(restoredMesh.mesh.uvs).toHaveLength(originalUvs.length);
    for (let i = 0; i < originalUvs.length; i++) {
      expect(restoredMesh.mesh.uvs[i]).toBeCloseTo(originalUvs[i]!, 5);
    }
    expect(getAllTextureIds()).toEqual(["mesh"]);
    expect([getTexture("mesh")!.width, getTexture("mesh")!.height]).toEqual([64, 32]);
  });
});

describe("parseViviFile — エッジケース", () => {
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
    expect(serializedMesh?.kind).toBe("viviMesh");
    if (serializedMesh?.kind !== "viviMesh") throw new Error("Expected mesh");
    expect(serializedMesh.mesh.uvs).toEqual(originalUvs);
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

  it("エントリに対応しないメッシュの UV はそのまま保持される", async () => {
    const mesh = createViviMesh({ id: "orphan-mesh" });
    const originalUvs = [...mesh.mesh.uvs];
    const fileData: ViviFileData = {
      version: 1,
      project: createProject({ layers: [mesh] }),
      atlases: [],
    };
    const project = await deserializeProject(fileData);
    const restoredMesh = project.layers.find((l) => l.id === "orphan-mesh");
    expect(restoredMesh?.kind).toBe("viviMesh");
    if (restoredMesh?.kind !== "viviMesh") throw new Error("Expected restored mesh");
    expect(restoredMesh.mesh.uvs).toEqual(originalUvs);
  });
});
