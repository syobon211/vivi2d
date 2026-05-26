import {
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const viewerRoot = path.resolve(import.meta.dirname, "../..");
export const testViviPath = path.resolve(viewerRoot, "e2e/fixtures/test.vivi");

export interface LaunchedViewer {
  app: ElectronApplication;
  page: Page;
  userDataDir: string;
}

async function launchViewer(): Promise<LaunchedViewer> {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "vivi-viewer-e2e-"));
  const app = await electron.launch({
    args: [path.join(viewerRoot, "electron/main.cjs")],
    cwd: viewerRoot,
    env: {
      ...process.env,
      VIVI_VIEWER_E2E: "1",
      VIVI_VIEWER_E2E_USER_DATA_DIR: userDataDir,
    },
  });
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  return { app, page, userDataDir };
}

export async function withViewer<T>(
  run: (viewer: LaunchedViewer) => Promise<T>,
): Promise<T> {
  const viewer = await launchViewer();
  try {
    return await run(viewer);
  } finally {
    await viewer.app.close().catch((error) => {
      console.warn("[viewer-e2e] Electron close failed", error);
    });
    await fs.promises
      .rm(viewer.userDataDir, {
        recursive: true,
        force: true,
        maxRetries: 20,
        retryDelay: 250,
      })
      .catch((error) => {
        console.warn("[viewer-e2e] userData cleanup failed", error);
      });
  }
}

export async function setViewerLocale(
  page: Page,
  locale: "en" | "ja" | "zh-Hans" | "ko-KR",
): Promise<void> {
  await page.evaluate((value) => localStorage.setItem("vivi-viewer-locale", value), locale);
  await page.reload();
  await page.waitForLoadState("domcontentloaded");
}

export type ViewerSideSheetSection =
  | "session"
  | "connect"
  | "overlays"
  | "calibration"
  | "input-effects";

export async function openSideSheet(
  page: Page,
  section: ViewerSideSheetSection = "session",
): Promise<void> {
  const sheet = page.locator('[data-testid="side-sheet"]');
  try {
    await expect(sheet).toBeVisible({ timeout: 250 });
  } catch {
    await page.locator('[data-testid="settings-toggle"]').click();
    await expect(sheet).toBeVisible({ timeout: 2_000 });
  }

  const tab = page.locator(`[data-testid="side-sheet-tab-${section}"]`);
  await tab.click();
  await expect(page.locator(`[data-testid="side-sheet-panel-${section}"]`)).toBeVisible({
    timeout: 2_000,
  });
}

export async function openSettingsPanel(page: Page): Promise<void> {
  const panel = page.locator('[data-testid="settings-panel"]');
  try {
    await expect(panel).toBeVisible({ timeout: 250 });
    return;
  } catch {}
  await openSideSheet(page, "session");
  await expect(panel).toBeVisible({ timeout: 2_000 });
}

export async function loadFixtureModel(
  page: Page,
  fixturePath = testViviPath,
): Promise<void> {
  expect(fs.existsSync(fixturePath)).toBe(true);
  await page.locator('input[accept=".vivi"]').setInputFiles(fixturePath);
  await expect(page.locator("canvas")).toBeVisible({ timeout: 10_000 });
}

export type CollectedPageErrors = string[] & { dispose: () => void };

export function collectPageErrors(page: Page): CollectedPageErrors {
  const errors = [] as CollectedPageErrors;
  const onError = (error: Error) => {
    errors.push(error.message);
  };
  errors.dispose = () => page.off("pageerror", onError);
  page.on("pageerror", onError);
  return errors;
}
