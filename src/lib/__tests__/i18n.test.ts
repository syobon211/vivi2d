import { afterEach, describe, expect, it, vi } from "vitest";
import { type I18nKey, t, useI18nStore } from "@/lib/i18n";
import { ja as jaNew } from "@/lib/i18n/ja";

function resetLocale() {
  useI18nStore.getState().setLocale("ja");
}

describe("t() — 非リアクティブ翻訳関数", () => {
  afterEach(() => resetLocale());

  it("日本語ロケールで正しい翻訳を返す", () => {
    useI18nStore.getState().setLocale("ja");
    expect(t("common.save")).toBe("保存");
  });

  it("英語ロケールで正しい翻訳を返す", () => {
    useI18nStore.getState().setLocale("en");
    expect(t("common.save")).toBe("Save");
  });

  it("存在しないキーの場合、dev では MISSING: プレフィックス付き文字列を返す (P8-23)", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(t("nonexistent.key.that.does.not.exist" as never)).toBe(
      "MISSING:nonexistent.key.that.does.not.exist",
    );
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("空文字列キーの場合、dev では MISSING: を返す（辞書にないのでフォールバック）", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(t("" as never)).toBe("MISSING:");
    warnSpy.mockRestore();
  });

  it("言語切替後に翻訳結果が変わる", () => {
    useI18nStore.getState().setLocale("ja");
    expect(t("common.cancel")).toBe("キャンセル");

    useI18nStore.getState().setLocale("en");
    expect(t("common.cancel")).toBe("Cancel");
  });

  it("日本語と英語で異なる翻訳を返す全キーカテゴリをカバー", () => {
    useI18nStore.getState().setLocale("ja");
    expect(t("menu.fileMenu")).toBe("ファイル");
    expect(t("layer.title")).toBe("レイヤー");
    expect(t("prop.title")).toBe("プロパティ");
    expect(t("param.title")).toBe("パラメータ");

    useI18nStore.getState().setLocale("en");
    expect(t("menu.fileMenu")).toBe("File");
    expect(t("layer.title")).toBe("Layers");
    expect(t("prop.title")).toBe("Properties");
    expect(t("param.title")).toBe("Parameters");
  });

  it("ドット区切りの深いキーでもフォールバックする (dev MISSING プレフィックス)", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(t("a.b.c.d.e" as never)).toBe("MISSING:a.b.c.d.e");
    warnSpy.mockRestore();
  });
});

describe("useI18nStore — ロケール管理", () => {
  afterEach(() => resetLocale());

  it("setLocale はデフォルトでは localStorage に保存しない", () => {
    useI18nStore.getState().setLocale("en");
    expect(localStorage.getItem("vivi2d-locale")).toBeNull();
  });

  it("setLocale は明示的なユーザー選択を localStorage に保存する", () => {
    useI18nStore.getState().setLocale("en", { persist: true });
    expect(localStorage.getItem("vivi2d-locale")).toBe("en");
  });

  it("localStorage が例外を投げても setLocale はクラッシュしない", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceeded");
    });
    expect(() =>
      useI18nStore.getState().setLocale("en", { persist: true }),
    ).not.toThrow();
    expect(useI18nStore.getState().locale).toBe("en");
    spy.mockRestore();
  });
});

describe("detectLocale — localStorage からの復元", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetLocale();
  });

  it("falls back to English during startup when an invalid locale was stored", async () => {
    vi.resetModules();
    vi.spyOn(Storage.prototype, "getItem").mockReturnValue("fr");
    const { t: freshT, useI18nStore: freshStore } = await import("@/lib/i18n");
    expect(freshStore.getState().locale).toBe("en");
    expect(freshT("common.ok")).toBe("OK");
  });

  it("falls back to English during startup when stored locale reads throw", async () => {
    vi.resetModules();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    const { t: freshT, useI18nStore: freshStore } = await import("@/lib/i18n");
    expect(freshStore.getState().locale).toBe("en");
    expect(freshT("common.ok")).toBe("OK");
  });
});

describe("辞書の完全性チェック", () => {
  it("全キーが ja/en 双方で空でない翻訳を返す (フォールバック 0)", () => {
    const allKeys = Object.keys(jaNew) as I18nKey[];

    useI18nStore.getState().setLocale("ja");
    for (const key of allKeys) {
      const value = t(key);
      expect(value, `ja の "${key}" が空文字またはフォールバック`).not.toBe(key);
      expect(value.length, `ja の "${key}" が空`).toBeGreaterThan(0);
    }

    useI18nStore.getState().setLocale("en");
    for (const key of allKeys) {
      const value = t(key);
      expect(value, `en の "${key}" が空文字またはフォールバック`).not.toBe(key);
      expect(value.length, `en の "${key}" が空`).toBeGreaterThan(0);
    }
  });
});

describe("P8-22 document.documentElement.lang の同期", () => {
  afterEach(() => resetLocale());

  it("updates the Editor document language when the locale changes at runtime", () => {
    useI18nStore.getState().setLocale("en");
    expect(document.documentElement.lang).toBe("en");
    expect(useI18nStore.getState().locale).toBe("en");

    useI18nStore.getState().setLocale("ja");
    expect(document.documentElement.lang).toBe("ja");
    expect(useI18nStore.getState().locale).toBe("ja");
  });
});
