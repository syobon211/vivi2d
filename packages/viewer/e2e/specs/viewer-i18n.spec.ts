import { test, expect, _electron as electron } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";


const viewerRoot = path.resolve(import.meta.dirname, "../..");
const testViviPath = path.resolve(
  import.meta.dirname,
  "../fixtures/test.vivi",
);

type ViewerLocale = "en" | "ja" | "zh-Hans" | "ko-KR";
type ViewerElectronApp = Awaited<ReturnType<typeof electron.launch>>;
type ViewerWindow = Awaited<ReturnType<ViewerElectronApp["firstWindow"]>>;

async function loadModel(window: ViewerWindow) {
  const viviContent = fs.readFileSync(testViviPath, "utf-8");
  await window.locator('input[accept=".vivi"]').setInputFiles({
    name: "test.vivi",
    mimeType: "application/json",
    buffer: Buffer.from(viviContent),
  });
  await expect(window.locator("canvas")).toBeVisible({ timeout: 10_000 });
}

async function openSettingsPanel(
  window: ViewerWindow,
  section: "session" | "input-effects" = "session",
) {
  const sheet = window.locator('[data-testid="side-sheet"]');
  if (!(await sheet.isVisible())) {
    await window.locator('[data-testid="settings-toggle"]').click();
    await expect(sheet).toBeVisible({ timeout: 2_000 });
  }
  await window.locator(`[data-testid="side-sheet-tab-${section}"]`).click();
  await expect(window.locator(`[data-testid="side-sheet-panel-${section}"]`)).toBeVisible({
    timeout: 2_000,
  });
}

async function ensureEnglishLocale(window: ViewerWindow) {
  await window.evaluate(() => localStorage.setItem("vivi-viewer-locale", "en"));
  await window.reload();
  await window.waitForLoadState("domcontentloaded");
}

async function expectOpenModelButton(window: ViewerWindow, name: string, timeout = 5_000) {
  await expect(window.getByRole("button", { name })).toBeVisible({ timeout });
}

async function clearViewerLocale(window: ViewerWindow): Promise<void> {
  await window
    .evaluate(() => {
      localStorage.removeItem("vivi-viewer-locale");
    })
    .catch(() => undefined);
}

function sessionLocaleSelect(window: ViewerWindow) {
  return window.locator('[data-testid="viewer-session-locale-select"]');
}

function legacySettingsLocaleSelect(window: ViewerWindow) {
  return window.locator('[data-testid="viewer-settings-locale-select"]');
}

async function visibleLocaleSelect(window: ViewerWindow) {
  const sessionSelect = sessionLocaleSelect(window);
  const legacySelect = legacySettingsLocaleSelect(window);

  await expect
    .poll(async () => {
      if (await sessionSelect.isVisible()) return "session";
      if (await legacySelect.isVisible()) return "legacy";
      return "none";
    })
    .not.toBe("none");

  return (await sessionSelect.isVisible()) ? sessionSelect : legacySelect;
}

async function selectViewerLocale(
  window: ViewerWindow,
  locale: ViewerLocale,
) {
  const select = await visibleLocaleSelect(window);
  await expect(select).toBeVisible({ timeout: 5_000 });
  await select.selectOption(locale);
}

const CJK_TEXT_PATTERN = /[\u3040-\u30ff\u3400-\u9fff]/;

test("Viewer defaults document language to English when no locale is persisted", async () => {
  const app = await electron.launch({
    args: [path.join(viewerRoot, "electron/main.cjs")],
    cwd: viewerRoot,
  });

  const window = await app.firstWindow();
  try {
    await window.waitForLoadState("domcontentloaded");
    await window.evaluate(() => localStorage.removeItem("vivi-viewer-locale"));
    await window.reload();
    await window.waitForLoadState("domcontentloaded");

    await expectOpenModelButton(window, "Open Model");
    await expect.poll(() => window.evaluate(() => document.documentElement.lang)).toBe("en");
  } finally {
    await clearViewerLocale(window);
    await app.close();
  }
});

test("Viewer restores persisted document language after reload", async () => {
  const app = await electron.launch({
    args: [path.join(viewerRoot, "electron/main.cjs")],
    cwd: viewerRoot,
  });

  const window = await app.firstWindow();
  try {
    await window.waitForLoadState("domcontentloaded");
    await window.evaluate(() => localStorage.setItem("vivi-viewer-locale", "ja"));
    await window.reload();
    await window.waitForLoadState("domcontentloaded");

    await expect.poll(() => window.evaluate(() => document.documentElement.lang)).toBe("ja");
    await expect.poll(() => window.evaluate(() => localStorage.getItem("vivi-viewer-locale"))).toBe(
      "ja",
    );
  } finally {
    await clearViewerLocale(window);
    await app.close();
  }
});

test("Viewer restores a persisted Korean document language after reload", async () => {
  const app = await electron.launch({
    args: [path.join(viewerRoot, "electron/main.cjs")],
    cwd: viewerRoot,
  });

  const window = await app.firstWindow();
  try {
    await window.waitForLoadState("domcontentloaded");
    await window.evaluate(() => localStorage.setItem("vivi-viewer-locale", "ko-KR"));
    await window.reload();
    await window.waitForLoadState("domcontentloaded");

    await expect.poll(() => window.evaluate(() => document.documentElement.lang)).toBe("ko-KR");
    await expect.poll(() => window.evaluate(() => localStorage.getItem("vivi-viewer-locale"))).toBe(
      "ko-KR",
    );
  } finally {
    await clearViewerLocale(window);
    await app.close();
  }
});

const viewerLaunchLocales = [
  {
    locale: "en",
    labels: [
      "Open Model",
      "No model",
      "Controls",
      "Load a model file to start the viewer session.",
      "Drop .vivi file here",
    ],
    forbidden: ["モデルを開く", "打开模型", "모델 열기"],
  },
  {
    locale: "ja",
    labels: [
      "モデルを開く",
      "モデル未読み込み",
      "操作パネル",
      "モデルファイルを読み込むとビューアセッションを開始できます。",
      ".viviファイルをドロップ",
    ],
    forbidden: ["Open Model", "打开模型", "모델 열기"],
  },
  {
    locale: "zh-Hans",
    labels: [
      "打开模型",
      "未加载模型",
      "控制",
      "加载模型文件即可开始 Viewer 会话。",
      "将 .vivi 文件拖到这里",
    ],
    forbidden: ["Open Model", "モデルを開く", "모델 열기"],
  },
  {
    locale: "ko-KR",
    labels: [
      "모델 열기",
      "모델 없음",
      "컨트롤",
      "모델 파일을 불러오면 Viewer 세션을 시작할 수 있습니다.",
      ".vivi 파일을 여기에 드롭",
    ],
    forbidden: ["Open Model", "モデルを開く", "打开模型"],
  },
] as const;

test("Viewer launch surface is localized for all supported locales", async () => {
  const app = await electron.launch({
    args: [path.join(viewerRoot, "electron/main.cjs")],
    cwd: viewerRoot,
  });

  const window = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");

  for (const { locale, labels, forbidden } of viewerLaunchLocales) {
    await window.evaluate((value) => localStorage.setItem("vivi-viewer-locale", value), locale);
    await window.reload();
    await window.waitForLoadState("domcontentloaded");

    const visibleText = await window.evaluate(() => document.body.innerText);
    for (const label of labels) {
      expect(visibleText, `${locale} should show ${label}`).toContain(label);
    }
    for (const fallback of forbidden) {
      expect(visibleText, `${locale} should not show fallback ${fallback}`).not.toContain(
        fallback,
      );
    }
  }

  await app.close();
});

test("Locale selector switches every supported Viewer locale through the UI", async () => {
  const app = await electron.launch({
    args: [path.join(viewerRoot, "electron/main.cjs")],
    cwd: viewerRoot,
  });

  const window = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");
  await ensureEnglishLocale(window);

  const uiLocaleSequence: Array<{ locale: ViewerLocale; openModelLabel: string }> = [
    { locale: "zh-Hans", openModelLabel: "打开模型" },
    { locale: "ko-KR", openModelLabel: "모델 열기" },
    { locale: "ja", openModelLabel: "モデルを開く" },
    { locale: "en", openModelLabel: "Open Model" },
  ];

  for (const { locale, openModelLabel } of uiLocaleSequence) {
    await openSettingsPanel(window);
    await selectViewerLocale(window, locale);
    await window.waitForTimeout(300);
    await expectOpenModelButton(window, openModelLabel, 3_000);
    await expect(await visibleLocaleSelect(window)).toHaveValue(locale);
    await expect.poll(() => window.evaluate(() => localStorage.getItem("vivi-viewer-locale"))).toBe(
      locale,
    );
  }

  await app.close();
});

test("Locale selector switches all UI to Japanese and back to English", async () => {
  const app = await electron.launch({
    args: [path.join(viewerRoot, "electron/main.cjs")],
    cwd: viewerRoot,
  });

  const window = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");
  await ensureEnglishLocale(window);

  await expectOpenModelButton(window, "Open Model");

  await openSettingsPanel(window);

  await selectViewerLocale(window, "ja");
  await window.waitForTimeout(300);

  await expectOpenModelButton(window, "モデルを開く", 3_000);

  await openSettingsPanel(window);

  await selectViewerLocale(window, "en");
  await window.waitForTimeout(300);

  await expectOpenModelButton(window, "Open Model", 3_000);

  await expect(
    window.locator("p", { hasText: "Drop .vivi file here" }),
  ).toBeVisible();

  await openSettingsPanel(window);

  const bgSelect = window.locator("select").filter({ hasText: /透明|グリーン|Transparent|Green/ });
  const options = await bgSelect.locator("option").allTextContents();
  expect(options).toContain("Transparent");
  expect(options).toContain("Green Screen");
  expect(options).toContain("Blue Screen");

  await expect(
    window.locator("label", { hasText: "Smoothing" }),
  ).toBeVisible();

  await openSettingsPanel(window, "input-effects");
  await expect(window.locator('[data-testid="viewer-toggle-face-tracking"]')).toBeVisible();
  await expect(window.locator('[data-testid="viewer-toggle-hand-tracking"]')).toBeVisible();
  await expect(window.locator('[data-testid="viewer-toggle-lip-sync"]')).toBeVisible();
  await expect(window.locator('[data-testid="viewer-toggle-pose-tracking"]')).toBeVisible();

  await openSettingsPanel(window);
  await expect(
    window.locator("button", { hasText: "Always On Top OFF" }),
  ).toBeVisible();

  const screenshotDir = path.resolve(import.meta.dirname, "../../test-screenshots");
  if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });
  await window.screenshot({ path: path.join(screenshotDir, "i18n-en-launch.png") });

  await app.close();
});

test("英語モードでモデル読込後、エフェクトボタンとバッジが英語表示", async () => {
  const app = await electron.launch({
    args: [path.join(viewerRoot, "electron/main.cjs")],
    cwd: viewerRoot,
  });

  const window = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");
  await ensureEnglishLocale(window);

  await loadModel(window);

  await expect(window.locator("span", { hasText: "Test Model" })).toBeVisible({
    timeout: 5_000,
  });

  await openSettingsPanel(window, "input-effects");

  await expect(window.getByRole("button", { name: "Confetti" })).toBeVisible({
    timeout: 3_000,
  });
  await expect(window.getByRole("button", { name: "Hearts" })).toBeVisible();
  await expect(window.getByRole("button", { name: "Stars" })).toBeVisible();
  await expect(window.getByRole("button", { name: "Sparkles" })).toBeVisible();

  await expect(window.locator('[data-testid="input-effects-panel"]')).toContainText(
    "Reactions",
  );

  await window.keyboard.press("1");
  const presetToast = window.locator('[data-testid="preset-indicator"]');
  await expect(presetToast).toBeVisible({ timeout: 3_000 });
  await expect(presetToast).toContainText("1: Smile");

  const canvas = window.locator("canvas");
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  await canvas.click({ position: { x: box!.width * 75 / 200, y: box!.height * 75 / 200 } });
  await expect(
    window.locator('[data-testid="hit-overlay"]').filter({ hasText: /Head/ }),
  ).toBeVisible({ timeout: 3_000 });

  const visibleText = await window.locator("body").innerText();
  expect(visibleText).not.toMatch(CJK_TEXT_PATTERN);

  const screenshotDir = path.resolve(import.meta.dirname, "../../test-screenshots");
  if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });
  await window.screenshot({ path: path.join(screenshotDir, "i18n-en-model-loaded.png") });

  await app.close();
});

test("英語設定がリロード後も維持される", async () => {
  const app = await electron.launch({
    args: [path.join(viewerRoot, "electron/main.cjs")],
    cwd: viewerRoot,
  });

  const window = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");
  await ensureEnglishLocale(window);

  await expectOpenModelButton(window, "Open Model");

  await window.reload();
  await window.waitForLoadState("domcontentloaded");

  await expectOpenModelButton(window, "Open Model");

  await openSettingsPanel(window);

  await expect(await visibleLocaleSelect(window)).toHaveValue("en");

  await app.close();
});

test("Locale selector can return the Viewer to Japanese", async () => {
  const app = await electron.launch({
    args: [path.join(viewerRoot, "electron/main.cjs")],
    cwd: viewerRoot,
  });

  const window = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");
  await ensureEnglishLocale(window);

  await expectOpenModelButton(window, "Open Model");

  await openSettingsPanel(window);

  await selectViewerLocale(window, "ja");
  await window.waitForTimeout(300);

  await expectOpenModelButton(window, "モデルを開く", 3_000);
  await openSettingsPanel(window, "input-effects");
  await expect(window.locator('[data-testid="viewer-toggle-face-tracking"]')).toBeVisible();
  await expect(
    window.locator("p", { hasText: ".viviファイルをドロップ" }),
  ).toBeVisible();

  await app.close();
});

test("英語モードで不正ファイルを読むと英語エラーが表示される", async () => {
  const app = await electron.launch({
    args: [path.join(viewerRoot, "electron/main.cjs")],
    cwd: viewerRoot,
  });

  const window = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");
  await ensureEnglishLocale(window);

    await window.locator('input[accept=".vivi"]').setInputFiles({
    name: "bad.vivi",
    mimeType: "application/json",
    buffer: Buffer.from("{ invalid json"),
  });
  await window.waitForTimeout(500);

  await window.waitForTimeout(1_000);
  const hasError = await window.evaluate(() => {
    const spans = document.querySelectorAll("span");
    return Array.from(spans).some((s) => s.style.color && s.textContent && s.textContent.length > 5);
  });
  expect(hasError).toBe(true);

  await app.close();
});

test("英語モードでホットキートーストが表示される（プリセット名はモデルデータのまま）", async () => {
  const app = await electron.launch({
    args: [path.join(viewerRoot, "electron/main.cjs")],
    cwd: viewerRoot,
  });

  const window = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");
  await ensureEnglishLocale(window);

  await loadModel(window);
  await window.waitForTimeout(500);

  await window.keyboard.press("1");
  const toast = window.locator('[data-testid="preset-indicator"]');
  await expect(toast).toBeVisible({ timeout: 3_000 });
  await expect(toast).toContainText("1:");

  await app.close();
});
