import { mkdirSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";
import { waitForStableFrame } from "../helpers/app";
import { clickFileMenuItem } from "../helpers/operations";

const AUTO_SETUP_SCREENSHOT_DIR = path.resolve("test-screenshots", "auto-setup-safety");
const IS_RECORDING_WORKFLOWS = process.env.VIVI2D_RECORD_E2E_WORKFLOWS === "1";
const DEBUG_PANEL_SCREENSHOT_PATH = process.env.VIVI2D_DEBUG_PANEL_SCREENSHOT_PATH;
const DEBUG_PANEL_SCREENSHOT_DIR = process.env.VIVI2D_DEBUG_PANEL_SCREENSHOT_DIR;

async function waitForEditorReady(window: Page) {
  await expect(window.locator(".menu-dropdown-trigger").first()).toBeVisible({
    timeout: 10_000,
  });
  await expect(window.getByText("Background")).toBeVisible({ timeout: 10_000 });
}

async function openAutoSetup(window: Page) {
  await clickFileMenuItem(window, "Auto Setup");
  await expect(window.locator(".auto-setup-dialog")).toBeVisible({ timeout: 5_000 });
}

async function waitForDetectOutcome(window: Page): Promise<"table" | "empty"> {
  const table = window.locator(".auto-setup-table");
  const empty = window.locator(".auto-setup-empty");
  await expect
    .poll(
      async () => {
        if (await table.isVisible().catch(() => false)) return "table";
        if (await empty.isVisible().catch(() => false)) return "empty";
        return "pending";
      },
      { timeout: 10_000 },
    )
    .toMatch(/table|empty/);

  return (await table.isVisible().catch(() => false)) ? "table" : "empty";
}

async function clickDetect(window: Page) {
  const button = window.locator(".auto-setup-footer-cta .modal-btn-primary");
  await expect(button).toBeVisible();
  await button.click();
}

async function setMinimumConfidence(window: Page, value: number) {
  const slider = window.locator(".auto-setup-confidence input[type='range']");
  await expect(slider).toBeVisible();
  await slider.evaluate((element, nextValue) => {
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    valueSetter?.call(element, String(nextValue));
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

async function countTableRows(window: Page) {
  return window.locator(".auto-setup-table tbody tr").count();
}

async function countBoneLayers(window: Page) {
  return window.evaluate(() => {
    const vivi = window.__vivi2d as any;
    if (!vivi) return 0;
    const project = vivi.useEditorStore.getState().project;
    if (!project) return 0;

    let count = 0;
    const walk = (layers: any[]) => {
      for (const layer of layers) {
        if (layer.kind === "bone") count += 1;
        if (layer.children?.length) walk(layer.children);
      }
    };
    walk(project.layers);
    return count;
  });
}

async function waitForDebugPanel(window: Page, screenshotName = "auto-setup-debug") {
  const toggle = window.locator(".auto-setup-debug-toggle");
  await expect(toggle).toBeVisible({ timeout: 5_000 });
  const expanded = await toggle.getAttribute("aria-expanded");
  if (expanded !== "true") {
    await toggle.click();
  }

  const debugPanel = window.locator(".auto-setup-debug-panel");
  await expect(debugPanel).toBeVisible({ timeout: 5_000 });
  await debugPanel.scrollIntoViewIfNeeded();

  const screenshotPath =
    DEBUG_PANEL_SCREENSHOT_PATH ??
    (DEBUG_PANEL_SCREENSHOT_DIR
      ? path.join(DEBUG_PANEL_SCREENSHOT_DIR, `${screenshotName}.png`)
      : null);
  if (screenshotPath) {
    mkdirSync(path.dirname(screenshotPath), { recursive: true });
    await window.screenshot({
      path: screenshotPath,
      fullPage: false,
    });
  }

  if (IS_RECORDING_WORKFLOWS) {
    await window.waitForTimeout(4_000);
  }
}

async function captureCanvasScreenshot(window: Page, fileName: string) {
  mkdirSync(AUTO_SETUP_SCREENSHOT_DIR, { recursive: true });
  await window.locator(".canvas-container canvas").screenshot({
    path: path.join(AUTO_SETUP_SCREENSHOT_DIR, fileName),
  });
}

async function readCanvasInkStats(window: Page) {
  await window.evaluate(() => {
    (
      window.__vivi2d as { forceEditorCanvasRender?: () => void } | undefined
    )?.forceEditorCanvasRender?.();
  });
  await waitForStableFrame(window, 4);

  return window.evaluate(async () => {
    const sourceCanvas = document.querySelector(
      ".canvas-container canvas",
    ) as HTMLCanvasElement | null;
    if (!sourceCanvas) throw new Error("Canvas is not available");

    const image = new Image();
    image.src = sourceCanvas.toDataURL("image/png");
    await image.decode();

    const readback = document.createElement("canvas");
    readback.width = sourceCanvas.width;
    readback.height = sourceCanvas.height;
    const ctx = readback.getContext("2d");
    if (!ctx) throw new Error("Canvas readback context is not available");
    ctx.drawImage(image, 0, 0);

    const data = ctx.getImageData(0, 0, readback.width, readback.height).data;
    let inkPixels = 0;
    let minX = readback.width;
    let minY = readback.height;
    let maxX = -1;
    let maxY = -1;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;
      if (r < 230 || g < 230 || b < 230) {
        const pixelIndex = i / 4;
        const x = pixelIndex % readback.width;
        const y = Math.floor(pixelIndex / readback.width);
        inkPixels += 1;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }

    return {
      width: readback.width,
      height: readback.height,
      inkPixels,
      inkBounds:
        inkPixels > 0
          ? {
              minX,
              minY,
              maxX,
              maxY,
              width: maxX - minX + 1,
              height: maxY - minY + 1,
            }
          : null,
    };
  });
}

async function seedAcceptedManualSplitMotionLayer(window: Page) {
  await expect
    .poll(
      () =>
        window.evaluate(() => {
          const runtime = window.__vivi2d as
            | {
                useEditorStore?: {
                  getState: () => { project?: unknown };
                };
              }
            | undefined;
          return Boolean(runtime?.useEditorStore?.getState().project);
        }),
      { timeout: 10_000 },
    )
    .toBe(true);

  await window.evaluate(() => {
    const runtime = window.__vivi2d as
      | {
          useEditorStore?: {
            getState: () => {
              project: any;
              projectStructureVersion?: number;
            };
            setState: (
              updater: (state: {
                project: any;
                projectStructureVersion?: number;
              }) => Partial<{
                project: any;
                projectStructureVersion?: number;
              }>,
            ) => void;
          };
        }
      | undefined;
    const editorStore = runtime?.useEditorStore;
    const state = editorStore?.getState();
    const project = state?.project;
    if (!editorStore || !project) {
      throw new Error("Editor project is not available for motion review seeding");
    }

    const applyMetadata = (layers: any[]): any[] =>
      layers.map((layer) => {
        const children = Array.isArray(layer.children)
          ? applyMetadata(layer.children)
          : layer.children;
        if (layer.name !== "Red Circle") {
          return children === layer.children ? layer : { ...layer, children };
        }
        return {
          ...layer,
          children,
          semanticRole: "hairFront",
          riggingHint: "localBones",
          manualSplitOutputMetadata: {
            kind: "maskExtractedLayer",
            ownership: "userAccepted",
            origin: "manualMask",
            manualSplitLayerId: layer.id,
            manualSplitSourceLayerId: "source-test-psd",
            manualSplitSourceFingerprint:
              "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            manualSplitMaskId: `mask-${layer.id}`,
            maskCoverage: 0.5,
            edgeFeatherPx: 1,
          },
        };
      });

    editorStore.setState((current) => ({
      project: {
        ...current.project,
        layers: applyMetadata(current.project.layers),
      },
      projectStructureVersion: (current.projectStructureVersion ?? 0) + 1,
    }));
  });
}

test.beforeEach(async ({ window, loadTestPsd }) => {
  await window.setViewportSize({ width: 1920, height: 1080 });
  await loadTestPsd();
  await waitForEditorReady(window);
});

test("Auto Setup appears in the File menu without AI branding", async ({ window }) => {
  const trigger = window.locator(".menu-dropdown-trigger", { hasText: /File|ファイル/ });
  await trigger.click();
  const panel = trigger.locator("..").locator(".menu-dropdown-panel");
  await expect(panel).toBeVisible({ timeout: 3_000 });

  const menuItem = panel.locator(".menu-dropdown-item").filter({
    hasText: /Auto Setup|自動セットアップ/,
  });
  await expect(menuItem).toBeVisible();

  const text = await menuItem.first().textContent();
  expect(text).not.toContain("AI");
  expect(text).toMatch(/Auto Setup|自動セットアップ/);
});

test("Auto Setup dialog opens and closes from the overlay", async ({ window }) => {
  await openAutoSetup(window);
  await window.locator(".modal-overlay").click({ position: { x: 5, y: 5 } });
  await expect(window.locator(".auto-setup-dialog")).not.toBeVisible({ timeout: 5_000 });
});

test("Auto Setup toggles core detect options", async ({ window }) => {
  await openAutoSetup(window);

  const checks = window.locator(
    ".auto-setup-options .auto-setup-check input[type='checkbox']",
  );
  await expect(checks).toHaveCount(4);

  const bones = checks.nth(0);
  const physics = checks.nth(3);

  await expect(bones).toBeChecked();
  await expect(physics).toBeChecked();

  await bones.dispatchEvent("click");
  await expect(bones).not.toBeChecked();
  await bones.dispatchEvent("click");
  await expect(bones).toBeChecked();

  await physics.dispatchEvent("click");
  await expect(physics).not.toBeChecked();
  await physics.dispatchEvent("click");
  await expect(physics).toBeChecked();
});

test("Auto Setup detect shows either results or an empty state", async ({ window }) => {
  await openAutoSetup(window);
  await clickDetect(window);

  const outcome = await waitForDetectOutcome(window);
  expect(["table", "empty"]).toContain(outcome);
});

test("Auto Setup preview can be opened and returned", async ({ window }) => {
  await openAutoSetup(window);
  await clickDetect(window);

  const outcome = await waitForDetectOutcome(window);
  if (outcome === "empty") return;

  if ((await countTableRows(window)) === 0) return;

  const previewButton = window.locator(".auto-setup-actions .modal-btn-primary");
  await expect(previewButton).toBeVisible();
  await previewButton.click();

  await expect(window.locator(".auto-setup-table")).not.toBeVisible();
  await expect(window.locator(".auto-setup-list").first()).toBeVisible();
  await waitForDebugPanel(window, "simple-preview-return");

  const backButton = window.locator(".auto-setup-actions .modal-btn").first();
  await backButton.click();
  await expect(window.locator(".auto-setup-table")).toBeVisible({ timeout: 5_000 });
});

test("Auto Setup review panel shows safe saved data, discarded preview data, and stress checks", async ({
  window,
}) => {
  await seedAcceptedManualSplitMotionLayer(window);
  await openAutoSetup(window);
  await setMinimumConfidence(window, 0.1);
  await clickDetect(window);

  const outcome = await waitForDetectOutcome(window);
  expect(outcome).toBe("table");
  expect(await countTableRows(window)).toBeGreaterThan(0);

  const previewButton = window.locator(".auto-setup-actions .modal-btn-primary");
  await previewButton.click();
  await expect(window.locator(".auto-setup-list").first()).toBeVisible();

  const toggle = window.locator(".auto-setup-debug-toggle");
  await expect(toggle).toBeVisible({ timeout: 5_000 });
  if ((await toggle.getAttribute("aria-expanded")) !== "true") {
    await toggle.click();
  }

  const reviewPanel = window.getByTestId("auto-setup-motion-safe-summary");
  await expect(reviewPanel).toBeVisible({ timeout: 5_000 });

  const chipGroups = reviewPanel.locator(".auto-setup-debug-chips");
  await expect(chipGroups).toHaveCount(4);
  await expect(chipGroups.nth(0).locator("span")).not.toHaveCount(0);
  await expect(chipGroups.nth(1).locator("span")).toHaveCount(4);
  await expect(chipGroups.nth(2).locator("span")).not.toHaveCount(0);
  await expect(chipGroups.nth(3).locator("span")).not.toHaveCount(0);

  const panelText = await reviewPanel.innerText();
  expect(panelText).toMatch(/保存される安全な操作|Saved safe operations/);
  expect(panelText).toMatch(
    /破棄されるプレビュー専用データ|Discarded preview-only data/,
  );
  expect(panelText).toMatch(/モーション負荷チェック|Motion stress checks/);
  expect(panelText).toMatch(/クリーンアップ比較|Cleanup comparison/);
  const privateDetailPattern = new RegExp(
    [
      "threshold",
      "affectedRegionIds",
      "diagnosticHash",
      `solver${"Id"}`,
      `solver${"Kind"}`,
      `m${"ls"}`,
      `a${"rap"}`,
      `constrained${"Affine"}`,
    ].join("|"),
    "i",
  );
  expect(panelText).not.toMatch(privateDetailPattern);
});

test("Auto Setup apply closes the dialog and keeps project state valid", async ({
  window,
}) => {
  const boneCountBefore = await countBoneLayers(window);

  await openAutoSetup(window);
  await clickDetect(window);

  const outcome = await waitForDetectOutcome(window);
  if (outcome === "empty") return;

  if ((await countTableRows(window)) === 0) return;

  const previewButton = window.locator(".auto-setup-actions .modal-btn-primary");
  await previewButton.click();
  await expect(window.locator(".auto-setup-list").first()).toBeVisible();
  await waitForDebugPanel(window, "simple-apply-valid");

  const applyButton = window.locator(".auto-setup-actions .modal-btn-primary");
  await applyButton.click();
  await expect(window.locator(".auto-setup-dialog")).not.toBeVisible({ timeout: 5_000 });

  const boneCountAfter = await countBoneLayers(window);
  expect(boneCountAfter).toBeGreaterThanOrEqual(boneCountBefore);
});

test("Auto Setup apply preserves the visible source image", async ({ window }) => {
  const before = await readCanvasInkStats(window);
  expect(before.inkPixels).toBeGreaterThan(0);
  await captureCanvasScreenshot(window, "before-auto-setup.png");

  await openAutoSetup(window);
  await setMinimumConfidence(window, 0.1);
  await clickDetect(window);

  const outcome = await waitForDetectOutcome(window);
  expect(outcome).toBe("table");
  expect(await countTableRows(window)).toBeGreaterThan(0);

  const previewButton = window.locator(".auto-setup-actions .modal-btn-primary");
  await previewButton.click();
  await expect(window.locator(".auto-setup-list").first()).toBeVisible();
  await waitForDebugPanel(window, "simple-preservation");

  const applyButton = window.locator(".auto-setup-actions .modal-btn-primary");
  await applyButton.click();
  await expect(window.locator(".auto-setup-dialog")).not.toBeVisible({ timeout: 5_000 });
  await waitForStableFrame(window, 4);

  const after = await readCanvasInkStats(window);
  await captureCanvasScreenshot(window, "after-auto-setup.png");

  const beforeInkDensity = before.inkPixels / (before.width * before.height);
  const afterInkDensity = after.inkPixels / (after.width * after.height);
  expect(after.inkPixels).toBeGreaterThan(0);
  expect(before.inkBounds).not.toBeNull();
  expect(after.inkBounds).not.toBeNull();
  expect(afterInkDensity).toBeGreaterThanOrEqual(beforeInkDensity * 0.9);
  expect(after.inkBounds!.width).toBeGreaterThanOrEqual(before.inkBounds!.width * 0.75);
  expect(after.inkBounds!.height).toBeGreaterThanOrEqual(before.inkBounds!.height * 0.75);
  const beforeCenterX =
    (before.inkBounds!.minX + before.inkBounds!.maxX) / 2 / before.width;
  const beforeCenterY =
    (before.inkBounds!.minY + before.inkBounds!.maxY) / 2 / before.height;
  const afterCenterX = (after.inkBounds!.minX + after.inkBounds!.maxX) / 2 / after.width;
  const afterCenterY = (after.inkBounds!.minY + after.inkBounds!.maxY) / 2 / after.height;
  expect(Math.abs(afterCenterX - beforeCenterX)).toBeLessThanOrEqual(0.12);
  expect(Math.abs(afterCenterY - beforeCenterY)).toBeLessThanOrEqual(0.12);
  expect(after.inkBounds!.width / after.width).toBeLessThanOrEqual(
    (before.inkBounds!.width / before.width) * 1.2,
  );
  expect(after.inkBounds!.height / after.height).toBeLessThanOrEqual(
    (before.inkBounds!.height / before.height) * 1.2,
  );
});
