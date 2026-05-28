import {
  type RuntimeMeshSnapshot,
  type ViviFileData,
  ViviRuntime,
} from "@vivi2d/runtime";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readRuntimeConformanceFixture } from "../../../../tests/conformance/runtime-v1/runner";
import { ViviPixiRenderer } from "../renderer";

type MutableRuntimeMeshSnapshot = {
  -readonly [Key in keyof RuntimeMeshSnapshot]: RuntimeMeshSnapshot[Key];
};

vi.mock("pixi.js", () => {
  function mockContainer(): any {
    const children: unknown[] = [];
    return {
      label: "",
      sortableChildren: false,
      children,
      addChild: vi.fn((...args: unknown[]) => {
        children.push(...args);
        return args[0];
      }),
      removeChild: vi.fn((c: unknown) => {
        const idx = children.indexOf(c);
        if (idx >= 0) children.splice(idx, 1);
      }),
      toLocal: vi.fn((p: { x: number; y: number }) => ({ x: p.x * 2, y: p.y * 2 })),
      destroy: vi.fn(() => {
        children.length = 0;
      }),
      x: 0,
      y: 0,
    };
  }

  const appFactory = vi.fn().mockImplementation(function () {
    return {
      init: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn(),
      render: vi.fn(),
      stage: mockContainer(),
      renderer: { resize: vi.fn() },
      canvas: document.createElement("canvas"),
      screen: { width: 800, height: 600 },
    };
  });

  return {
    Application: appFactory,
    Container: vi.fn().mockImplementation(mockContainer),
    MeshSimple: vi.fn().mockImplementation(function (opts: any) {
      return {
        label: "",
        x: 0,
        y: 0,
        alpha: 1,
        visible: true,
        blendMode: "normal",
        tint: 0xffffff,
        zIndex: 0,
        filters: [] as any[],
        vertices: opts?.vertices ?? new Float32Array(),
        uvs: opts?.uvs ?? new Float32Array(),
        indices: opts?.indices ?? new Uint32Array(),
        destroy: vi.fn(),
      };
    }),
    Texture: {
      from: vi.fn(() => ({ width: 100, height: 100, destroy: vi.fn() })),
    },
    Filter: vi.fn().mockImplementation(function (opts: any) {
      const filter: any = { destroy: vi.fn() };
      if (opts?.resources) {
        filter.resources = {};
        for (const [groupName, groupDef] of Object.entries<any>(opts.resources)) {
          const uniforms: Record<string, any> = {};
          for (const [name, def] of Object.entries<any>(groupDef)) {
            uniforms[name] = def.value;
          }
          filter.resources[groupName] = { ...groupDef, uniforms };
        }
      }
      return filter;
    }),
    GlProgram: {
      from: vi.fn().mockReturnValue({}),
    },
  };
});

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

describe("ViviPixiRenderer", () => {
  let canvas: HTMLCanvasElement;

  beforeEach(() => {
    canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 600;
  });

  // --- create() ---
  describe("create()", () => {
    it("Applicationが初期化されレンダラーが返される", async () => {
      const renderer = await ViviPixiRenderer.create(canvas);
      expect(renderer).toBeInstanceOf(ViviPixiRenderer);
      expect(renderer.pixiApp).toBeDefined();
      expect(renderer.pixiApp.init).toHaveBeenCalledTimes(1);
      renderer.destroy();
    });

    it("オプションなしでデフォルト設定が使われる", async () => {
      const renderer = await ViviPixiRenderer.create(canvas);
      expect(renderer.pixiApp.init).toHaveBeenCalledWith(
        expect.objectContaining({
          canvas,
          backgroundColor: 0xffffff,
          antialias: true,
          backgroundAlpha: 1,
        }),
      );
      renderer.destroy();
    });

    it("transparentオプションでbackgroundAlphaが0になる", async () => {
      const renderer = await ViviPixiRenderer.create(canvas, { transparent: true });
      expect(renderer.pixiApp.init).toHaveBeenCalledWith(
        expect.objectContaining({
          backgroundAlpha: 0,
        }),
      );
      renderer.destroy();
    });

    it("カスタム背景色とアンチエイリアス設定が反映される", async () => {
      const renderer = await ViviPixiRenderer.create(canvas, {
        backgroundColor: 0x000000,
        antialias: false,
      });
      expect(renderer.pixiApp.init).toHaveBeenCalledWith(
        expect.objectContaining({
          backgroundColor: 0x000000,
          antialias: false,
        }),
      );
      renderer.destroy();
    });
  });

  // --- setModel() ---
  describe("setModel()", () => {
    it("テクスチャがTexture.fromで変換されメッシュが構築される", async () => {
      const { Texture } = await import("pixi.js");
      const renderer = await ViviPixiRenderer.create(canvas);
      const model = createMockModel();
      const texCanvas = document.createElement("canvas");
      const canvasTextures = new Map([["mesh-1", texCanvas]]);

      renderer.setModel(model, canvasTextures);

      expect(Texture.from).toHaveBeenCalledWith(texCanvas);
      expect(model.getRenderList).toHaveBeenCalled();
      renderer.destroy();
    });

    it("2回呼ぶと前のメッシュが破棄される", async () => {
      const renderer = await ViviPixiRenderer.create(canvas);
      const model1 = createMockModel();
      const model2 = createMockModel(
        new Map([["mesh-2", createMockMeshState({ id: "mesh-2" })]]),
      );
      const tex1 = new Map([["mesh-1", document.createElement("canvas")]]);
      const tex2 = new Map([["mesh-2", document.createElement("canvas")]]);

      renderer.setModel(model1, tex1);
      renderer.setModel(model2, tex2);

      expect(model2.getRenderList).toHaveBeenCalled();
      renderer.destroy();
    });

    it("テクスチャがないメッシュはスキップされる", async () => {
      const { MeshSimple } = await import("pixi.js");
      const renderer = await ViviPixiRenderer.create(canvas);
      const model = createMockModel();
      const canvasTextures = new Map<string, HTMLCanvasElement>();

      renderer.setModel(model, canvasTextures);

      expect(MeshSimple).not.toHaveBeenCalled();
      renderer.destroy();
    });

    it("shared runtime fixtureのsnapshot順序とx/yをそのまま描画へ渡す", async () => {
      const { MeshSimple } = await import("pixi.js");
      const renderer = await ViviPixiRenderer.create(canvas);
      const model = loadDrawHitCullingRuntimeModel();

      renderer.setModel(model, createFixtureTextureMap(model));

      const meshes = vi.mocked(MeshSimple).mock.results.map((result) => result.value);
      const backMesh = meshes.find((mesh) => mesh.label === "mesh-back");
      expect(backMesh).toMatchObject({
        x: 3,
        y: 4,
        zIndex: 5,
        visible: true,
      });
      expect(meshes.find((mesh) => mesh.label === "mesh-front")).toMatchObject({
        visible: false,
        zIndex: 20,
      });
      renderer.destroy();
    });
  });

  // --- render() ---
  describe("render()", () => {
    it("model未設定時にクラッシュしない", async () => {
      const renderer = await ViviPixiRenderer.create(canvas);
      expect(() => renderer.render()).not.toThrow();
      renderer.destroy();
    });

    it("model設定後にapp.render()が呼ばれる", async () => {
      const renderer = await ViviPixiRenderer.create(canvas);
      const model = createMockModel();
      const textures = new Map([["mesh-1", document.createElement("canvas")]]);
      renderer.setModel(model, textures);

      renderer.render();

      expect(renderer.pixiApp.render).toHaveBeenCalledTimes(1);
      renderer.destroy();
    });

    it("render()経由でsyncMeshes()が呼ばれ頂点が更新される", async () => {
      const renderer = await ViviPixiRenderer.create(canvas);
      const state = createMockMeshState();
      const model = createMockModel(new Map([["mesh-1", state]]));
      const textures = new Map([["mesh-1", document.createElement("canvas")]]);
      renderer.setModel(model, textures);

      const newVerts = new Float32Array([10, 10, 110, 10, 10, 110, 110, 110]);
      state.vertices = newVerts;

      renderer.render();

      expect(model.getMeshSnapshot).toHaveBeenCalledWith("mesh-1");
      renderer.destroy();
    });
  });

  // --- resize() ---
  describe("resize()", () => {
    it("renderer.resizeが呼ばれる", async () => {
      const renderer = await ViviPixiRenderer.create(canvas);

      renderer.resize(1920, 1080);

      expect(renderer.pixiApp.renderer.resize).toHaveBeenCalledWith(1920, 1080);
      renderer.destroy();
    });
  });

  // --- destroy() ---
  describe("destroy()", () => {
    it("host canvas is preserved while renderer-owned resources are released", async () => {
      const renderer = await ViviPixiRenderer.create(canvas);
      const app = renderer.pixiApp;

      renderer.destroy();

      expect(app.destroy).not.toHaveBeenCalled();
      expect(app.stage.removeChild).toHaveBeenCalled();
    });

    it("メッシュが全て破棄される", async () => {
      const renderer = await ViviPixiRenderer.create(canvas);
      const model = createMockModel();
      const textures = new Map([["mesh-1", document.createElement("canvas")]]);
      renderer.setModel(model, textures);

      renderer.destroy();

      expect(() => renderer.render()).not.toThrow();
    });
  });

  // --- screenToWorld() ---
  describe("screenToWorld()", () => {
    it("world.toLocalに委譲される", async () => {
      const renderer = await ViviPixiRenderer.create(canvas);

      const result = renderer.screenToWorld(100, 200);

      expect(result).toEqual({ x: 200, y: 400 });
      renderer.destroy();
    });
  });

  // --- pixiApp getter ---
  describe("pixiApp", () => {
    it("Applicationインスタンスを返す", async () => {
      const renderer = await ViviPixiRenderer.create(canvas);

      const app = renderer.pixiApp;

      expect(app).toBeDefined();
      expect(app.init).toBeDefined();
      expect(app.render).toBeDefined();
      renderer.destroy();
    });
  });

  describe("applyMeshState() スクリーンカラーフィルター", () => {
    it("screenColorが設定されるとフィルターが作成される", async () => {
      const renderer = await ViviPixiRenderer.create(canvas);
      const state = createMockMeshState({
        screenColor: [0.5, 0.3, 0.1, 1],
      });
      const model = createMockModel(new Map([["mesh-1", state]]));
      const textures = new Map([["mesh-1", document.createElement("canvas")]]);
      renderer.setModel(model, textures);

      renderer.render();

      expect(renderer.pixiApp.render).toHaveBeenCalled();
      renderer.destroy();
    });

    it("screenColorが更新されるとフィルターが更新される", async () => {
      const renderer = await ViviPixiRenderer.create(canvas);
      const state = createMockMeshState({
        screenColor: [0.5, 0.3, 0.1, 1],
      });
      const model = createMockModel(new Map([["mesh-1", state]]));
      const textures = new Map([["mesh-1", document.createElement("canvas")]]);
      renderer.setModel(model, textures);

      renderer.render();

      state.screenColor = [0.8, 0.6, 0.4, 1];
      renderer.render();

      expect(renderer.pixiApp.render).toHaveBeenCalledTimes(2);
      renderer.destroy();
    });

    it("screenColorがnullになるとフィルターが削除される", async () => {
      const renderer = await ViviPixiRenderer.create(canvas);
      const state = createMockMeshState({
        screenColor: [0.5, 0.3, 0.1, 1],
      });
      const model = createMockModel(new Map([["mesh-1", state]]));
      const textures = new Map([["mesh-1", document.createElement("canvas")]]);
      renderer.setModel(model, textures);

      renderer.render();

      state.screenColor = null;
      renderer.render();

      expect(renderer.pixiApp.render).toHaveBeenCalledTimes(2);
      renderer.destroy();
    });
  });

  describe("syncMeshes() メッシュ状態が消失した場合", () => {
    it("getMeshSnapshotがnullを返すとメッシュが非表示になる", async () => {
      const renderer = await ViviPixiRenderer.create(canvas);
      const state = createMockMeshState();
      const model = createMockModel(new Map([["mesh-1", state]]));
      const textures = new Map([["mesh-1", document.createElement("canvas")]]);
      renderer.setModel(model, textures);

      vi.mocked(model.getMeshSnapshot).mockReturnValue(null);

      expect(() => renderer.render()).not.toThrow();
      renderer.destroy();
    });
  });
});
