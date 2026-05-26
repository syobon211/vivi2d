import { expect, test, type Page } from "@playwright/test";
import {
  loadFixtureModel,
  openSideSheet,
  setViewerLocale,
  type ViewerSideSheetSection,
  withViewer,
} from "../support/viewer-page";

const SIDE_SHEET_SECTIONS: ViewerSideSheetSection[] = [
  "session",
  "connect",
  "overlays",
  "calibration",
  "input-effects",
];

const MOJIBAKE_PATTERN = /[\u7e67\u7e5d\u7e3a\uff61-\uff9f\ufffd]/u;

const JA_FORBIDDEN_COPY = [
  "No model",
  "Open Model",
  "Load a model",
  "Drop .vivi",
  "Viewer controls",
  "Viewer control sections",
  "Close",
  "Session",
  "Connect",
  "Items",
  "Calibrate",
  "Inputs",
  "Display",
  "Configuration",
  "Open URL",
  "Calibration",
  "Reset",
  "No live tracking signal",
  "Neutral",
  "Suggest",
  "Connect Center",
  "Enable Local API",
  "Electron only",
  "Overlays",
  "Tracking",
  "Input devices",
  "Approved clients",
  "No approved clients",
];

const EN_FORBIDDEN_COPY = [
  "モデル",
  "セッション",
  "接続",
  "アイテム",
  "調整",
  "入力",
  "統計表示",
  "操作パネル",
  "閉じる",
  "表示",
  "設定",
  "録画",
  "顔",
  "手",
  "姿勢",
  "リップ",
  "ライブトラッキング",
  "基準取得",
  "範囲提案",
];

test("side sheet copy follows Japanese and English locale without mojibake", async () => {
  await withViewer(async ({ page }) => {
    await assertNoModelSurface(page, "ja");
    await assertSideSheetLocale(page, "ja");

    await assertNoModelSurface(page, "en");
    await assertSideSheetLocale(page, "en");
  });
});

test("loaded model surface keeps locale-specific labels in all side sheet sections", async () => {
  for (const locale of ["ja", "en"] as const) {
    await withViewer(async ({ page }) => {
      await setViewerLocale(page, locale);
      await loadFixtureModel(page);

      if (locale === "ja") {
        await expect(page.getByText("モデル未読み込み")).toHaveCount(0);
        await expect(page.getByText("表情マッピング")).toBeVisible();
      } else {
        await expect(page.getByText("No model")).toHaveCount(0);
        await expect(page.getByText("Expression map")).toBeVisible();
      }

      await assertSideSheetLocale(page, locale);
    });
  }
});

async function assertNoModelSurface(
  page: Page,
  locale: "ja" | "en",
): Promise<void> {
  await setViewerLocale(page, locale);
  const root = page.locator('[aria-label="Vivi viewer"], [aria-label="Vivi ビューア"]');
  const text = await root.innerText();
  assertReadableText(text);

  if (locale === "ja") {
    expect(text).toContain("モデル未読み込み");
    expect(text).toContain("モデルを開く");
    expect(text).toContain(".viviファイルをドロップ");
    expect(text).not.toContain("No model");
    expect(text).not.toContain("Open Model");
  } else {
    expect(text).toContain("No model");
    expect(text).toContain("Open Model");
    expect(text).toContain("Drop .vivi file here");
    expect(text).not.toContain("モデル未読み込み");
    expect(text).not.toContain("モデルを開く");
  }
}

async function assertSideSheetLocale(
  page: Page,
  locale: "ja" | "en",
): Promise<void> {
  for (const section of SIDE_SHEET_SECTIONS) {
    await openSideSheet(page, section);
    const text = await page.locator('[data-testid="side-sheet"]').innerText();
    assertReadableText(text);
    const forbidden = locale === "ja" ? JA_FORBIDDEN_COPY : EN_FORBIDDEN_COPY;
    for (const copy of forbidden) {
      expect.soft(text, `${locale}/${section} must not include "${copy}"`).not.toContain(copy);
    }
  }
}

function assertReadableText(text: string): void {
  expect(text).not.toMatch(MOJIBAKE_PATTERN);
}
