import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ============================================================
// runScript / cancelScript / scriptRunning / generateThumbnail
// ============================================================

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
  generateThumbnail: vi.fn(() => "data:image/png;base64,mock"),
}));

vi.mock("@vivi2d/core/script-runner", () => ({
  parseScript: vi.fn().mockReturnValue({ commands: [] }),
  runScript: vi.fn().mockResolvedValue(undefined),
  cancelScript: vi.fn(),
}));

import {
  cancelScript as cancelScriptRunner,
  runScript as runScriptRunner,
} from "@vivi2d/core/script-runner";
import { generateThumbnail } from "@vivi2d/renderer-pixi/thumbnail";
import { ViviModelElement } from "../vivi-model-element";

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

const TAG_NAME = "vivi-model-new-api";
if (!customElements.get(TAG_NAME)) {
  customElements.define(TAG_NAME, class extends ViviModelElement {});
}

describe("ViviModelElement 新規API", () => {
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

  // ----------------------------------------------------------
  // scriptRunning
  // ----------------------------------------------------------
  describe("scriptRunning", () => {
    it("初期状態ではfalse", () => {
      const el = document.createElement(TAG_NAME) as ViviModelElement;
      expect(el.scriptRunning).toBe(false);
    });
  });

  // ----------------------------------------------------------
  // runScript
  // ----------------------------------------------------------
  describe("runScript", () => {
    it("モデル未読み込み時にエラーをthrowする", async () => {
      const el = document.createElement(TAG_NAME) as ViviModelElement;
      await expect(el.runScript("smile → neutral")).rejects.toThrow(
          "Model is not loaded",
      );
    });

    it("モデル読み込み後にスクリプトを実行できる", async () => {
      const el = document.createElement(TAG_NAME) as ViviModelElement;
      document.body.appendChild(el);
      await el.load("test.vivi");
      expect(el.model).not.toBeNull();

      await expect(el.runScript("smile → neutral")).resolves.toBeUndefined();

      document.body.removeChild(el);
    });

    it("runScript内のAPIオブジェクトが正しく構築される", async () => {
      const el = document.createElement(TAG_NAME) as ViviModelElement;
      document.body.appendChild(el);
      await el.load("test.vivi");

      (runScriptRunner as ReturnType<typeof vi.fn>).mockImplementationOnce(
        async (
          _script: unknown,
          api: {
            setParameter: (id: string, v: number) => void;
            setParameters: (v: Record<string, number>) => void;
            resetParameters: () => void;
            applyExpressionPreset: (id: string) => void;
            getPresetByName: (name: string) => string | null;
            getParameterId: (nameOrId: string) => string | null;
            update: () => void;
          },
        ) => {
          api.setParameter("p1", 5);
          api.setParameters({ p1: 10 });
          api.resetParameters();
          api.applyExpressionPreset("preset-1");
          api.update();

          const presetId = api.getPresetByName("笑顔");
          expect(presetId).toBe("preset-1");

          const noPreset = api.getPresetByName("存在しない表情");
          expect(noPreset).toBeNull();

          const paramById = api.getParameterId("p1");
          expect(paramById).toBe("p1");

          const paramByName = api.getParameterId("角度X");
          expect(paramByName).toBe("p1");

          const noParam = api.getParameterId("存在しないパラメータ");
          expect(noParam).toBeNull();
        },
      );

      await el.runScript("test-script");

      document.body.removeChild(el);
    });
  });

  // ----------------------------------------------------------
  // cancelScript
  // ----------------------------------------------------------
  describe("cancelScript", () => {
    it("スクリプト実行中でなければcancelScriptは何もしない", () => {
      const el = document.createElement(TAG_NAME) as ViviModelElement;
      expect(() => el.cancelScript()).not.toThrow();
      expect(el.scriptRunning).toBe(false);
    });

    it("スクリプト実行中にcancelScriptを呼ぶとキャンセルされる", async () => {
      const el = document.createElement(TAG_NAME) as ViviModelElement;
      document.body.appendChild(el);
      await el.load("test.vivi");
      expect(el.model).not.toBeNull();

      (runScriptRunner as ReturnType<typeof vi.fn>).mockImplementationOnce(
        async (
          _script: unknown,
          _api: unknown,
          _state: { running: boolean; cancelled: boolean },
        ) => {
          await new Promise((r) => setTimeout(r, 50));
        },
      );

      const runPromise = el.runScript("smile → wait(1000) → neutral");

      await vi.waitFor(() => expect(el.scriptRunning).toBe(true));

      el.cancelScript();
      expect(cancelScriptRunner).toHaveBeenCalled();

      await runPromise;
      document.body.removeChild(el);
    });
  });

  // ----------------------------------------------------------
  // generateThumbnail
  // ----------------------------------------------------------
  describe("generateThumbnail", () => {
    it("canvasからサムネイルData URLを生成する", async () => {
      const el = document.createElement(TAG_NAME) as ViviModelElement;
      document.body.appendChild(el);
      await el.load("test.vivi");

      const result = el.generateThumbnail();
      expect(result).toBe("data:image/png;base64,mock");
      expect(generateThumbnail).toHaveBeenCalled();

      document.body.removeChild(el);
    });

    it("オプション付きで呼び出せる", async () => {
      const el = document.createElement(TAG_NAME) as ViviModelElement;
      document.body.appendChild(el);
      await el.load("test.vivi");

      const opts = { width: 128, height: 128, format: "jpeg" as const };
      el.generateThumbnail(opts);
      expect(generateThumbnail).toHaveBeenCalledWith(expect.any(HTMLCanvasElement), opts);

      document.body.removeChild(el);
    });

    it("レンダラーが無い状態でもgenerateThumbnailが呼ばれる", () => {
      const el = document.createElement(TAG_NAME) as ViviModelElement;
      const result = el.generateThumbnail();
      expect(result).toBe("data:image/png;base64,mock");
      expect(generateThumbnail).toHaveBeenCalledWith(
        expect.any(HTMLCanvasElement),
        undefined,
      );
    });

    it("コンテキスト取得不可時に空文字列を返す", () => {
      (generateThumbnail as ReturnType<typeof vi.fn>).mockReturnValueOnce("");

      const el = document.createElement(TAG_NAME) as ViviModelElement;
      const result = el.generateThumbnail();
      expect(result).toBe("");
    });
  });
});
