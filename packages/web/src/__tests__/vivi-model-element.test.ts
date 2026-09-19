import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ViviModelElement } from "../vivi-model-element";

vi.mock("@vivi2d/renderer-pixi/loader", () => ({
  extractTextures: vi.fn().mockResolvedValue(new Map()),
}));
vi.mock("@vivi2d/renderer-pixi/renderer", () => ({
  ViviPixiRenderer: {
    create: vi.fn().mockResolvedValue({
      setModel: vi.fn(),
      render: vi.fn(),
      destroy: vi.fn(),
      screenToWorld: vi.fn().mockReturnValue({ x: 0, y: 0 }),
    }),
  },
}));
vi.mock("@vivi2d/renderer-pixi/thumbnail", () => ({
  generateThumbnail: vi.fn(() => "data:image/png;base64,thumb"),
}));

const TEST_VIVI_JSON = JSON.stringify({
  version: 5,
  project: {
    name: "テストモデル",
    width: 200,
    height: 200,
    layers: [],
    parameters: [
      { id: "p1", name: "角度X", minValue: -30, maxValue: 30, defaultValue: 0 },
    ],
    clips: [],
    scenes: [],
    stateMachines: [],
    skins: {},
    physicsGroups: [],
    colliders: [],
    lipsyncConfig: {
      enabled: false,
      targetParameterId: null,
      source: "microphone",
      threshold: 0.02,
      smoothing: 0.7,
      gain: 2.0,
    },
    expressionPresets: [{ id: "preset-1", name: "笑顔", values: { p1: 10 }, hotkey: 1 }],
  },
  atlases: [],
});

if (!customElements.get("vivi-model")) {
  customElements.define("vivi-model", ViviModelElement);
}

describe("ViviModelElement", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(TEST_VIVI_JSON, { status: 200 }),
    );
    vi.spyOn(globalThis, "requestAnimationFrame").mockReturnValue(1);
    vi.spyOn(globalThis, "cancelAnimationFrame").mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("observedAttributesが正しい", () => {
    expect(ViviModelElement.observedAttributes).toEqual([
      "src",
      "width",
      "height",
      "autoplay",
    ]);
  });

  it("未load状態の公開getterとmutatorは空/null/no-opを保持する", () => {
    const el = document.createElement("vivi-model") as ViviModelElement;
    expect(el.model).toBeNull();
    expect(el.project).toBeNull();
    expect(el.getParameters()).toEqual([]);
    expect(() => el.setParameter("p1", 15)).not.toThrow();
    expect(() => el.setParameters({ p1: 20 })).not.toThrow();
    expect(() => el.resetParameters()).not.toThrow();
    expect(el.getExpressionPresets()).toEqual([]);
    expect(() => el.applyExpressionPreset("nonexistent")).not.toThrow();
    expect(() => el.applyPresetByHotkey(1)).not.toThrow();
    expect(el.hitTest(0, 0)).toBeNull();
    expect(el.screenToWorld(0, 0)).toBeNull();
    expect(el.loading).toBe(false);
  });

  it("load()でモデルを読み込める", async () => {
    const el = document.createElement("vivi-model") as ViviModelElement;
    expect(el.shadowRoot).not.toBeNull();
    expect(el.shadowRoot!.querySelector("canvas")).not.toBeNull();
    document.body.appendChild(el);

    const loadPromise = new Promise<void>((resolve) => {
      el.addEventListener("load", () => resolve());
    });

    await el.load("test.vivi");
    await loadPromise;

    expect(el.model).not.toBeNull();
    expect(el.project?.name).toBe("テストモデル");
    expect(el.loading).toBe(false);

    document.body.removeChild(el);
    expect(el.model).toBeNull();
  });

  it("プリセットとパラメータの公開metadataを返す", async () => {
    const el = document.createElement("vivi-model") as ViviModelElement;
    document.body.appendChild(el);
    await el.load("test.vivi");

    const presets = el.getExpressionPresets();
    expect(presets).toHaveLength(1);
    expect(presets[0]).toEqual({
      id: "preset-1",
      name: "笑顔",
      hotkey: 1,
    });

    const params = el.getParameters();
    expect(params).toHaveLength(1);
    expect(params[0]).toEqual({
      id: "p1",
      name: "角度X",
      min: -30,
      max: 30,
      default: 0,
    });

    document.body.removeChild(el);
  });

  it("fetch失敗時にerrorイベントを発火する", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 404 }));

    const el = document.createElement("vivi-model") as ViviModelElement;
    document.body.appendChild(el);

    const errorPromise = new Promise<string>((resolve) => {
      el.addEventListener("error", (e) => resolve((e as CustomEvent).detail.message));
    });

    await el.load("missing.vivi");
    const msg = await errorPromise;
    expect(msg).toBe("Could not load a Vivi2D model.");

    document.body.removeChild(el);
  });

  it("applyPresetByHotkey()でホットキー番号からプリセットを適用できる", async () => {
    const el = document.createElement("vivi-model") as ViviModelElement;
    document.body.appendChild(el);
    await el.load("test.vivi");

    el.applyPresetByHotkey(1);
    expect(el.model!.parameterValues.p1).toBe(10);

    document.body.removeChild(el);
  });

  it("setParameters()で複数パラメータを一括設定できる", async () => {
    const el = document.createElement("vivi-model") as ViviModelElement;
    document.body.appendChild(el);
    await el.load("test.vivi");

    el.setParameters({ p1: 20 });
    expect(el.model!.parameterValues.p1).toBe(20);

    document.body.removeChild(el);
  });

  it("resetParameters()でデフォルト値に戻る", async () => {
    const el = document.createElement("vivi-model") as ViviModelElement;
    document.body.appendChild(el);
    await el.load("test.vivi");

    el.setParameter("p1", 25);
    expect(el.model!.parameterValues.p1).toBe(25);

    el.resetParameters();
    expect(el.model!.parameterValues.p1).toBe(0); // defaultValue

    document.body.removeChild(el);
  });

  it("存在しないホットキーでapplyPresetByHotkeyを呼んでもクラッシュしない", async () => {
    const el = document.createElement("vivi-model") as ViviModelElement;
    document.body.appendChild(el);
    await el.load("test.vivi");

    el.applyPresetByHotkey(9);
    expect(el.model!.parameterValues.p1).toBe(0);

    document.body.removeChild(el);
  });
});

describe("ViviModelElement 追加テスト", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(TEST_VIVI_JSON, { status: 200 }),
    );
    vi.spyOn(globalThis, "requestAnimationFrame").mockReturnValue(1);
    vi.spyOn(globalThis, "cancelAnimationFrame").mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("二重load()で前回のロードがキャンセルされる", async () => {
    const el = document.createElement("vivi-model") as ViviModelElement;
    document.body.appendChild(el);

    let resolveFirst!: (value: Response) => void;
    const firstFetch = new Promise<Response>((r) => {
      resolveFirst = r;
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    fetchSpy.mockImplementationOnce((_url, _opts) => {
      return firstFetch;
    });

    fetchSpy.mockImplementationOnce(() =>
      Promise.resolve(new Response(TEST_VIVI_JSON, { status: 200 })),
    );

    const load1 = el.load("first.vivi");
    const load2 = el.load("second.vivi");

    resolveFirst(new Response(TEST_VIVI_JSON, { status: 200 }));

    await Promise.allSettled([load1, load2]);

    expect(el.model).not.toBeNull();

    document.body.removeChild(el);
  });

  it("JSON以外のレスポンス（HTMLなど）でerrorイベントが発火する", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<html><body>Not Found</body></html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      }),
    );

    const el = document.createElement("vivi-model") as ViviModelElement;
    document.body.appendChild(el);

    const errorPromise = new Promise<string>((resolve) => {
      el.addEventListener("error", (e) => resolve((e as CustomEvent).detail.message));
    });

    await el.load("test.html");
    const msg = await errorPromise;
    expect(msg).toMatch(/\S/);

    document.body.removeChild(el);
  });

  it("loading状態がload中にtrueになる", async () => {
    const el = document.createElement("vivi-model") as ViviModelElement;
    document.body.appendChild(el);

    expect(el.loading).toBe(false);

    let resolveFetch!: (value: Response) => void;
    vi.spyOn(globalThis, "fetch").mockImplementation(
      () =>
        new Promise((r) => {
          resolveFetch = r;
        }),
    );

    const loadPromise = el.load("test.vivi");

    expect(el.loading).toBe(true);

    resolveFetch(new Response(TEST_VIVI_JSON, { status: 200 }));
    await loadPromise;

    expect(el.loading).toBe(false);

    document.body.removeChild(el);
  });

  it("width/height属性変更でstyleが更新される", () => {
    const el = document.createElement("vivi-model") as ViviModelElement;
    document.body.appendChild(el);

    el.setAttribute("width", "300");
    expect(el.style.width).toBe("300px");

    el.setAttribute("height", "500");
    expect(el.style.height).toBe("500px");

    el.setAttribute("width", "600");
    expect(el.style.width).toBe("600px");

    document.body.removeChild(el);
  });
});

describe("ViviModelElement startLoop", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("startLoop()でアニメーションフレームが実行される", async () => {
    let loopFn: ((time: number) => void) | null = null;
    vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((cb) => {
      loopFn = cb as (t: number) => void;
      return 1;
    });
    vi.spyOn(globalThis, "cancelAnimationFrame").mockReturnValue(undefined);

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(TEST_VIVI_JSON, { status: 200 }),
    );

    const el = document.createElement("vivi-model") as ViviModelElement;
    document.body.appendChild(el);
    await el.load("test.vivi");

    expect(loopFn).toBeDefined();

    loopFn!(16.67);

    loopFn!(33.33);

    loopFn!(50.0);

    expect(el.model).not.toBeNull();

    document.body.removeChild(el);
  });
});
