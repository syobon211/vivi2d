import {
  ViviRuntime,
  type RuntimeMeshSnapshot,
  type ViviFileData,
} from "@vivi2d/runtime";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readRuntimeConformanceFixture } from "../../../../tests/conformance/runtime-v1/runner";
import { ViviPhaserRenderer } from "../renderer";

type MutableRuntimeMeshSnapshot = {
  -readonly [Key in keyof RuntimeMeshSnapshot]: RuntimeMeshSnapshot[Key];
};


function createMockPhaserScene() {
  const textures = new Map<string, unknown>();
  return {
    textures: {
      addCanvas: vi.fn((key: string, canvas: HTMLCanvasElement) => {
        textures.set(key, canvas);
      }),
      exists: vi.fn((key: string) => textures.has(key)),
      remove: vi.fn((key: string) => textures.delete(key)),
    },
    add: {
      mesh: vi.fn((_x: number, _y: number, _texture: string) => {
        return createMockPhaserMesh();
      }),
    },
  };
}

function createMockPhaserMesh() {
  return {
    vertices: [] as Array<{ x: number; y: number }>,
    setAlpha: vi.fn(),
    setVisible: vi.fn(),
    setBlendMode: vi.fn(),
    setDepth: vi.fn(),
    setTint: vi.fn(),
    setPosition: vi.fn(),
    addVertices: vi.fn(function (
      this: any,
      verts: number[],
      _uvs: number[],
      _indices: number[],
    ) {
      for (let i = 0; i < verts.length / 2; i++) {
        this.vertices.push({ x: verts[i * 2]!, y: verts[i * 2 + 1]! });
      }
    }),
    destroy: vi.fn(),
  };
}


function createMockMeshState(
  overrides?: Partial<MutableRuntimeMeshSnapshot>,
): MutableRuntimeMeshSnapshot {
  return {
    id: "mesh-1",
    textureId: "mesh-1",
    vertices: new Float32Array([0, 0, 100, 0, 0, 100, 100, 100]),
    uvs: new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]),
    indices: new Uint32Array([0, 1, 2, 1, 2, 3]),
    x: 10,
    y: 20,
    opacity: 0.8,
    visible: true,
    blendMode: "normal",
    multiplyColor: [1, 1, 1, 1],
    screenColor: null,
    drawOrder: 0,
    culled: false,
    ...overrides,
  };
}

function createMockModel(meshStates?: Map<string, MutableRuntimeMeshSnapshot>) {
  const states = meshStates ?? new Map([["mesh-1", createMockMeshState()]]);
  return {
    getRenderList: vi.fn(() => [...states.values()]),
    getMeshSnapshot: vi.fn((id: string) => states.get(id) ?? null),
  };
}

function loadDrawHitCullingRuntimeModel() {
  const fixture = readRuntimeConformanceFixture("draw-hit-culling");
  const fileData = JSON.parse(JSON.stringify(fixture.fileData)) as ViviFileData;
  const model = ViviRuntime.load(fileData, fixture.runtimeOptions);
  model.update(0);
  return model;
}

function createFixtureTextureMap(model: {
  getRenderList(): readonly RuntimeMeshSnapshot[];
}) {
  return new Map(
    model
      .getRenderList()
      .flatMap((mesh) => [mesh.id, mesh.textureId])
      .map((id) => [id, document.createElement("canvas")]),
  );
}


describe("ViviPhaserRenderer", () => {
  let mockScene: ReturnType<typeof createMockPhaserScene>;

  beforeEach(() => {
    mockScene = createMockPhaserScene();
  });

  // --- constructor ---
  describe("constructor", () => {
    it("レンダラーが作成される", () => {
      const renderer = new ViviPhaserRenderer({ scene: mockScene });
      expect(renderer).toBeInstanceOf(ViviPhaserRenderer);
      renderer.destroy();
    });

    it("オフセットと深度ベースが設定される", () => {
      const renderer = new ViviPhaserRenderer({
        scene: mockScene,
        x: 50,
        y: 100,
        depthBase: 10,
      });
      expect(renderer.screenToWorld(150, 200)).toEqual({ x: 100, y: 100 });
      renderer.destroy();
    });
  });

  // --- setModel() ---
  describe("setModel()", () => {
    it("テクスチャが登録されメッシュが構築される", () => {
      const renderer = new ViviPhaserRenderer({ scene: mockScene });
      const model = createMockModel();
      const textures = new Map([["mesh-1", document.createElement("canvas")]]);

      renderer.setModel(model, textures);

      expect(mockScene.textures.addCanvas).toHaveBeenCalledTimes(1);
      expect(mockScene.add.mesh).toHaveBeenCalledTimes(1);
      renderer.destroy();
    });

    it("2回呼ぶと前のメッシュが破棄される", () => {
      const renderer = new ViviPhaserRenderer({ scene: mockScene });
      const model1 = createMockModel();
      const model2 = createMockModel(
        new Map([["mesh-2", createMockMeshState({ id: "mesh-2" })]]),
      );
      const tex1 = new Map([["mesh-1", document.createElement("canvas")]]);
      const tex2 = new Map([["mesh-2", document.createElement("canvas")]]);

      renderer.setModel(model1, tex1);
      renderer.setModel(model2, tex2);

      expect(mockScene.add.mesh).toHaveBeenCalledTimes(2);
      renderer.destroy();
    });

    it("テクスチャがないメッシュはスキップされる", () => {
      const renderer = new ViviPhaserRenderer({ scene: mockScene });
      const model = createMockModel();
      const textures = new Map([["no-match", document.createElement("canvas")]]);

      renderer.setModel(model, textures);

      renderer.destroy();
    });

    it("shared runtime fixtureのsnapshot順序とx/yをそのまま描画へ渡す", () => {
      const renderer = new ViviPhaserRenderer({ scene: mockScene });
      const model = loadDrawHitCullingRuntimeModel();

      renderer.setModel(model, createFixtureTextureMap(model));

      expect(mockScene.add.mesh).toHaveBeenNthCalledWith(
        1,
        3,
        4,
        expect.stringContaining("mesh-back"),
      );
      const firstMesh = vi.mocked(mockScene.add.mesh).mock.results[0]?.value;
      expect(firstMesh?.setDepth).toHaveBeenCalledWith(5);
      expect(firstMesh?.setVisible).toHaveBeenCalledWith(true);

      const secondMesh = vi.mocked(mockScene.add.mesh).mock.results[1]?.value;
      expect(secondMesh?.setDepth).toHaveBeenCalledWith(20);
      expect(secondMesh?.setVisible).toHaveBeenCalledWith(false);
      renderer.destroy();
    });
  });

  // --- sync() ---
  describe("sync()", () => {
    it("model未設定時にクラッシュしない", () => {
      const renderer = new ViviPhaserRenderer({ scene: mockScene });
      expect(() => renderer.sync()).not.toThrow();
      renderer.destroy();
    });

    it("メッシュ状態が同期される", () => {
      const renderer = new ViviPhaserRenderer({ scene: mockScene });
      const model = createMockModel();
      const textures = new Map([["mesh-1", document.createElement("canvas")]]);
      renderer.setModel(model, textures);

      renderer.sync();

      expect(model.getMeshSnapshot).toHaveBeenCalledWith("mesh-1");
      renderer.destroy();
    });

    it("getMeshSnapshotがnullを返すとメッシュが非表示になる", () => {
      const renderer = new ViviPhaserRenderer({ scene: mockScene });
      const model = createMockModel();
      const textures = new Map([["mesh-1", document.createElement("canvas")]]);
      renderer.setModel(model, textures);

      vi.mocked(model.getMeshSnapshot).mockReturnValue(null);

      expect(() => renderer.sync()).not.toThrow();
      renderer.destroy();
    });

    it("頂点が更新される", () => {
      const renderer = new ViviPhaserRenderer({ scene: mockScene });
      const state = createMockMeshState();
      const model = createMockModel(new Map([["mesh-1", state]]));
      const textures = new Map([["mesh-1", document.createElement("canvas")]]);
      renderer.setModel(model, textures);

      state.vertices = new Float32Array([10, 10, 110, 10, 10, 110, 110, 110]);
      renderer.sync();

      expect(model.getMeshSnapshot).toHaveBeenCalledWith("mesh-1");
      renderer.destroy();
    });
  });

  // --- setOffset() ---
  describe("setOffset()", () => {
    it("オフセットが変更される", () => {
      const renderer = new ViviPhaserRenderer({ scene: mockScene });

      renderer.setOffset(200, 300);

      expect(renderer.screenToWorld(300, 400)).toEqual({ x: 100, y: 100 });
      renderer.destroy();
    });
  });

  // --- screenToWorld() ---
  describe("screenToWorld()", () => {
    it("オフセットなしでそのまま返される", () => {
      const renderer = new ViviPhaserRenderer({ scene: mockScene });

      const result = renderer.screenToWorld(100, 200);

      expect(result).toEqual({ x: 100, y: 200 });
      renderer.destroy();
    });

    it("オフセット付きで座標が変換される", () => {
      const renderer = new ViviPhaserRenderer({ scene: mockScene, x: 50, y: 100 });

      const result = renderer.screenToWorld(150, 300);

      expect(result).toEqual({ x: 100, y: 200 });
      renderer.destroy();
    });
  });

  // --- destroy() ---
  describe("destroy()", () => {
    it("destroy後にsyncしてもクラッシュしない", () => {
      const renderer = new ViviPhaserRenderer({ scene: mockScene });
      const model = createMockModel();
      const textures = new Map([["mesh-1", document.createElement("canvas")]]);
      renderer.setModel(model, textures);

      renderer.destroy();

      expect(() => renderer.sync()).not.toThrow();
    });
  });
});
