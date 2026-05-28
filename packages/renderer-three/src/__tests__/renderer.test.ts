import {
  type RuntimeMeshSnapshot,
  type ViviFileData,
  ViviRuntime,
} from "@vivi2d/runtime";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readRuntimeConformanceFixture } from "../../../../tests/conformance/runtime-v1/runner";
import { ViviThreeRenderer } from "../renderer";

type MutableRuntimeMeshSnapshot = {
  -readonly [Key in keyof RuntimeMeshSnapshot]: RuntimeMeshSnapshot[Key];
};


vi.mock("three", () => {
  function mockObject3D(): any {
    const children: unknown[] = [];
    return {
      name: "",
      position: { x: 0, y: 0, z: 0, set: vi.fn() },
      renderOrder: 0,
      visible: true,
      children,
      add: vi.fn((...args: unknown[]) => {
        children.push(...args);
      }),
      remove: vi.fn((c: unknown) => {
        const idx = children.indexOf(c);
        if (idx >= 0) children.splice(idx, 1);
      }),
    };
  }

  const mockGeometry: any = {
    setAttribute: vi.fn(),
    setIndex: vi.fn(),
    getAttribute: vi.fn(() => ({
      array: new Float32Array(12),
      needsUpdate: false,
    })),
    dispose: vi.fn(),
  };

  return {
    NormalBlending: 1,
    CustomBlending: 5,
    AddEquation: 100,
    SrcAlphaFactor: 204,
    OneMinusSrcAlphaFactor: 205,
    OneFactor: 201,
    OneMinusSrcColorFactor: 203,
    DstColorFactor: 208,
    ZeroFactor: 200,

    Object3D: vi.fn().mockImplementation(mockObject3D),
    Scene: vi.fn().mockImplementation(function () {
      return { ...mockObject3D(), background: null };
    }),
    OrthographicCamera: vi.fn().mockImplementation(function () {
      return {
        position: { x: 0, y: 0, z: 0, set: vi.fn() },
        right: 0,
        bottom: 0,
        updateProjectionMatrix: vi.fn(),
      };
    }),
    WebGLRenderer: vi.fn().mockImplementation(function () {
      return {
        setSize: vi.fn(),
        render: vi.fn(),
        dispose: vi.fn(),
      };
    }),
    BufferGeometry: vi.fn().mockImplementation(function () {
      return { ...mockGeometry };
    }),
    BufferAttribute: vi.fn().mockImplementation(function (array: any, itemSize: number) {
      return { array, itemSize };
    }),
    Mesh: vi.fn().mockImplementation(function (_geo: any, mat: any) {
      return {
        ...mockObject3D(),
        geometry: mockGeometry,
        material: mat ?? { opacity: 1 },
      };
    }),
    MeshBasicMaterial: vi.fn().mockImplementation(function (opts: any) {
      return {
        map: opts?.map,
        transparent: opts?.transparent ?? false,
        depthWrite: opts?.depthWrite ?? true,
        blending: 1,
        blendSrc: undefined,
        blendDst: undefined,
        blendEquation: undefined,
        opacity: 1,
        color: { setHex: vi.fn() },
        dispose: vi.fn(),
      };
    }),
    ShaderMaterial: vi.fn().mockImplementation(function (opts: any) {
      return {
        uniforms: opts?.uniforms ?? {},
        transparent: opts?.transparent ?? false,
        depthWrite: opts?.depthWrite ?? true,
        blending: 1,
        blendSrc: undefined,
        blendDst: undefined,
        blendEquation: undefined,
        opacity: 1,
        dispose: vi.fn(),
      };
    }),
    CanvasTexture: vi.fn().mockImplementation(function (canvas: any) {
      return { flipY: true, dispose: vi.fn(), image: canvas };
    }),
    Texture: vi.fn(),
    Color: vi.fn().mockImplementation(function () {
      return {};
    }),
    Uniform: vi.fn().mockImplementation(function (v: unknown) {
      return { value: v };
    }),
    Vector3: vi.fn().mockImplementation(function (x = 0, y = 0, z = 0) {
      return {
        x,
        y,
        z,
        set: vi.fn(),
      };
    }),
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


describe("ViviThreeRenderer", () => {
  let canvas: HTMLCanvasElement;

  beforeEach(() => {
    canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 600;
  });

  // --- create() ---
  describe("create()", () => {
    it("レンダラーが作成される", () => {
      const renderer = ViviThreeRenderer.create(canvas);
      expect(renderer).toBeInstanceOf(ViviThreeRenderer);
      renderer.destroy();
    });

    it("transparentオプションが反映される", () => {
      const renderer = ViviThreeRenderer.create(canvas, { transparent: true });
      expect(renderer).toBeInstanceOf(ViviThreeRenderer);
      renderer.destroy();
    });
  });

  // --- embed() ---
  describe("embed()", () => {
    it("既存シーンに埋め込みレンダラーが作成される", async () => {
      const { Scene } = await import("three");
      const scene = new Scene();
      const renderer = ViviThreeRenderer.embed({ scene });
      expect(renderer).toBeInstanceOf(ViviThreeRenderer);
      expect(renderer.viviContainer).toBeDefined();
      renderer.destroy();
    });
  });

  // --- setModel() ---
  describe("setModel()", () => {
    it("テクスチャが変換されメッシュが構築される", () => {
      const renderer = ViviThreeRenderer.create(canvas);
      const model = createMockModel();
      const textures = new Map([["mesh-1", document.createElement("canvas")]]);

      renderer.setModel(model, textures);

      expect(model.getRenderList).toHaveBeenCalled();
      renderer.destroy();
    });

    it("2回呼ぶと前のメッシュが破棄される", () => {
      const renderer = ViviThreeRenderer.create(canvas);
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
      const { Mesh: ThreeMesh } = await import("three");
      vi.mocked(ThreeMesh).mockClear();

      const renderer = ViviThreeRenderer.create(canvas);
      const model = createMockModel();
      const textures = new Map<string, HTMLCanvasElement>();

      renderer.setModel(model, textures);

      expect(ThreeMesh).not.toHaveBeenCalled();
      renderer.destroy();
    });

    it("shared runtime fixtureのsnapshot順序とx/yをそのまま描画へ渡す", async () => {
      const { Mesh: ThreeMesh } = await import("three");
      vi.mocked(ThreeMesh).mockClear();

      const renderer = ViviThreeRenderer.create(canvas);
      const model = loadDrawHitCullingRuntimeModel();

      renderer.setModel(model, createFixtureTextureMap(model));

      const meshes = vi.mocked(ThreeMesh).mock.results.map((result) => result.value);
      const backMesh = meshes.find((mesh) => mesh.name === "mesh-back");
      expect(backMesh?.position.set).toHaveBeenCalledWith(3, 4, 0);
      expect(backMesh).toMatchObject({
        renderOrder: 5,
        visible: true,
      });
      expect(meshes.find((mesh) => mesh.name === "mesh-front")).toMatchObject({
        renderOrder: 20,
        visible: false,
      });
      renderer.destroy();
    });
  });

  // --- render() ---
  describe("render()", () => {
    it("model未設定時にクラッシュしない", () => {
      const renderer = ViviThreeRenderer.create(canvas);
      expect(() => renderer.render()).not.toThrow();
      renderer.destroy();
    });

    it("model設定後にWebGLRenderer.render()が呼ばれる", () => {
      const renderer = ViviThreeRenderer.create(canvas);
      const model = createMockModel();
      const textures = new Map([["mesh-1", document.createElement("canvas")]]);
      renderer.setModel(model, textures);

      renderer.render();

      expect(model.getMeshSnapshot).toHaveBeenCalledWith("mesh-1");
      renderer.destroy();
    });
  });

  // --- sync() ---
  describe("sync()", () => {
    it("model未設定時にクラッシュしない", () => {
      const renderer = ViviThreeRenderer.create(canvas);
      expect(() => renderer.sync()).not.toThrow();
      renderer.destroy();
    });

    it("メッシュ状態が同期される", () => {
      const renderer = ViviThreeRenderer.create(canvas);
      const model = createMockModel();
      const textures = new Map([["mesh-1", document.createElement("canvas")]]);
      renderer.setModel(model, textures);

      renderer.sync();

      expect(model.getMeshSnapshot).toHaveBeenCalledWith("mesh-1");
      renderer.destroy();
    });

    it("updates Three custom blend factors when blendMode changes", async () => {
      const { MeshBasicMaterial } = await import("three");
      vi.mocked(MeshBasicMaterial).mockClear();

      const renderer = ViviThreeRenderer.create(canvas);
      const state = createMockMeshState({ blendMode: "add" });
      const model = createMockModel(new Map([["mesh-1", state]]));
      const textures = new Map([["mesh-1", document.createElement("canvas")]]);
      renderer.setModel(model, textures);

      const material = vi.mocked(MeshBasicMaterial).mock.results[0]?.value as {
        blending?: number;
        blendSrc?: number;
        blendDst?: number;
        blendEquation?: number;
      };
      expect(material.blending).toBe(5);
      expect(material.blendSrc).toBe(204);
      expect(material.blendDst).toBe(201);
      expect(material.blendEquation).toBe(100);

      state.blendMode = "screen";
      renderer.sync();

      expect(material.blendSrc).toBe(201);
      expect(material.blendDst).toBe(203);
      expect(material.blendEquation).toBe(100);

      state.blendMode = "normal";
      renderer.sync();

      expect(material.blending).toBe(1);
      expect(material.blendSrc).toBe(204);
      expect(material.blendDst).toBe(205);
      expect(material.blendEquation).toBe(100);
      renderer.destroy();
    });
  });

  // --- resize() ---
  describe("resize()", () => {
    it("WebGLRenderer.setSizeが呼ばれる", () => {
      const renderer = ViviThreeRenderer.create(canvas);

      renderer.resize(1920, 1080);

      renderer.destroy();
    });
  });

  // --- screenToWorld() ---
  describe("screenToWorld()", () => {
    it("スクリーン座標がそのまま返される（OrthographicCamera Y-down）", () => {
      const renderer = ViviThreeRenderer.create(canvas);

      const result = renderer.screenToWorld(100, 200);

      expect(result).toEqual({ x: 100, y: 200 });
      renderer.destroy();
    });
  });

  // --- destroy() ---
  describe("destroy()", () => {
    it("destroy後にrender/syncしてもクラッシュしない", () => {
      const renderer = ViviThreeRenderer.create(canvas);
      const model = createMockModel();
      const textures = new Map([["mesh-1", document.createElement("canvas")]]);
      renderer.setModel(model, textures);

      renderer.destroy();

      expect(() => renderer.render()).not.toThrow();
      expect(() => renderer.sync()).not.toThrow();
    });
  });

  describe("スクリーンカラー", () => {
    it("screenColorありでShaderMaterialが使われる", () => {
      const renderer = ViviThreeRenderer.create(canvas);
      const state = createMockMeshState({
        screenColor: [0.5, 0.3, 0.1, 1],
      });
      const model = createMockModel(new Map([["mesh-1", state]]));
      const textures = new Map([["mesh-1", document.createElement("canvas")]]);

      renderer.setModel(model, textures);
      renderer.render();

      renderer.destroy();
    });

    it("getMeshSnapshotがnullを返すとメッシュが非表示になる", () => {
      const renderer = ViviThreeRenderer.create(canvas);
      const model = createMockModel();
      const textures = new Map([["mesh-1", document.createElement("canvas")]]);
      renderer.setModel(model, textures);

      vi.mocked(model.getMeshSnapshot).mockReturnValue(null);

      expect(() => renderer.render()).not.toThrow();
      renderer.destroy();
    });
  });

  describe("screen material blend sync", () => {
    it("applies custom blend factors to screen material during build", async () => {
      const { ShaderMaterial } = await import("three");
      vi.mocked(ShaderMaterial).mockClear();

      const renderer = ViviThreeRenderer.create(canvas);
      const state = createMockMeshState({
        blendMode: "screen",
        screenColor: [0.5, 0.3, 0.1, 1],
      });
      const model = createMockModel(new Map([["mesh-1", state]]));
      const textures = new Map([["mesh-1", document.createElement("canvas")]]);

      renderer.setModel(model, textures);

      const material = vi.mocked(ShaderMaterial).mock.results[0]?.value as {
        blendSrc?: number;
        blendDst?: number;
        blendEquation?: number;
      };
      expect(material.blendSrc).toBe(201);
      expect(material.blendDst).toBe(203);
      expect(material.blendEquation).toBe(100);
      renderer.destroy();
    });

    it("creates a screen material when screenColor appears during sync", async () => {
      const { ShaderMaterial } = await import("three");
      vi.mocked(ShaderMaterial).mockClear();

      const renderer = ViviThreeRenderer.create(canvas);
      const state = createMockMeshState({ blendMode: "normal", screenColor: null });
      const model = createMockModel(new Map([["mesh-1", state]]));
      const textures = new Map([["mesh-1", document.createElement("canvas")]]);
      renderer.setModel(model, textures);

      state.blendMode = "screen";
      state.screenColor = [0.5, 0.3, 0.1, 1];

      expect(() => renderer.sync()).not.toThrow();
      const material = vi.mocked(ShaderMaterial).mock.results[0]?.value as {
        blendSrc?: number;
        blendDst?: number;
        blendEquation?: number;
      };
      expect(material.blendSrc).toBe(201);
      expect(material.blendDst).toBe(203);
      expect(material.blendEquation).toBe(100);
      renderer.destroy();
    });
  });
});
