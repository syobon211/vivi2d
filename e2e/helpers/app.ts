import fs from "node:fs";
import path from "node:path";
import type { ElectronApplication, Locator, Page } from "playwright";
import { _electron as electron } from "playwright";
import { mockOpenPsd } from "./dialog-mock";
import { clickFileMenuItem } from "./operations";

const ROOT = path.resolve(import.meta.dirname, "../..");
const ELECTRON_VIDEO_DIR =
  process.env.VIVI2D_E2E_VIDEO_DIR ??
  path.join(ROOT, "test-results", "electron-videos");
const IS_RECORDING_WORKFLOWS = process.env.VIVI2D_RECORD_E2E_WORKFLOWS === "1";
const CANVAS_OPEN_PROBE_NAMES = [
  "canvasOpen.projectReady",
  "canvasOpen.layerListReady",
  "canvasOpen.editableCanvasReady",
] as const;

function e2eTimeout(ms: number): number {
  return IS_RECORDING_WORKFLOWS ? Math.max(ms * 4, 60_000) : ms;
}

export async function waitForAppReady(window: Page): Promise<void> {
  await window.waitForLoadState("domcontentloaded");
  await window.waitForFunction(
    () => {
      const readyFlag = document.documentElement.dataset.vivi2dReady === "true";
      const runtimeReady = Boolean(window.__vivi2d);
      return readyFlag || runtimeReady;
    },
    undefined,
    { timeout: e2eTimeout(15_000) },
  );
  await window.locator(".menu-bar").waitFor({
    state: "visible",
    timeout: e2eTimeout(5_000),
  });
}

export async function waitForViviRuntime(
  window: Page,
  requiredStores: string[] = ["useEditorStore"],
): Promise<void> {
  await waitForAppReady(window);
  await window.waitForFunction(
    (storeNames) => {
      const runtime = (window as Window & typeof globalThis).__vivi2d as
        | Record<string, unknown>
        | undefined;
      if (!runtime) return false;
      return storeNames.every((storeName) => {
        const store = runtime[storeName] as { getState?: () => unknown } | undefined;
        return typeof store === "function" && typeof store.getState === "function";
      });
    },
    requiredStores,
    { timeout: e2eTimeout(15_000) },
  );
}

export async function waitForStableFrame(window: Page, frameCount = 2): Promise<void> {
  await window.evaluate(
    (targetFrameCount) =>
      new Promise<void>((resolve) => {
        let remaining = Math.max(1, targetFrameCount);
        const step = () => {
          remaining -= 1;
          if (remaining <= 0) {
            resolve();
            return;
          }
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
    frameCount,
  );
}

export async function clearPerfProbeEvents(window: Page): Promise<void> {
  await window.evaluate(() => {
    const runtime = (window as Window & typeof globalThis).__vivi2d as
      | { clearE2EPerfProbeEvents?: () => void }
      | undefined;
    runtime?.clearE2EPerfProbeEvents?.();
  });
}

async function waitForCanvasFingerprintToStabilize(window: Page): Promise<void> {
  let previousFingerprint: string | null = null;
  let stableMatches = 0;
  const deadline = Date.now() + e2eTimeout(15_000);

  while (Date.now() < deadline) {
    const fingerprint = await window.evaluate(() => {
      const canvas = document.querySelector(
        ".canvas-container canvas",
      ) as HTMLCanvasElement | null;
      if (!canvas || canvas.width <= 0 || canvas.height <= 0) return null;
      try {
        return `${canvas.width}x${canvas.height}:${canvas
          .toDataURL("image/png")
          .slice(0, 512)}`;
      } catch {
        return `${canvas.width}x${canvas.height}:unreadable`;
      }
    });

    if (fingerprint && fingerprint === previousFingerprint) {
      stableMatches += 1;
    } else {
      stableMatches = 0;
      previousFingerprint = fingerprint;
    }

    if (fingerprint && stableMatches >= 1) {
      return;
    }

    await waitForStableFrame(window, 2);
  }

  throw new Error("Timed out waiting for canvas render to stabilize");
}

export async function expectDialogCentered(
  window: Page,
  dialog: Locator,
  tolerancePx = 2,
): Promise<void> {
  await dialog.waitFor({ state: "visible", timeout: 10_000 });
  await waitForStableFrame(window, 2);

  const viewport = window.viewportSize();
  if (!viewport) {
    throw new Error("Viewport size is unavailable");
  }

  const box = await dialog.boundingBox();
  if (!box) {
    throw new Error("Dialog bounding box is unavailable");
  }

  const dialogCenterX = box.x + box.width / 2;
  const dialogCenterY = box.y + box.height / 2;
  const viewportCenterX = viewport.width / 2;
  const viewportCenterY = viewport.height / 2;
  const deltaX = Math.abs(dialogCenterX - viewportCenterX);
  const deltaY = Math.abs(dialogCenterY - viewportCenterY);

  if (deltaX > tolerancePx || deltaY > tolerancePx) {
    throw new Error(
      `Dialog is not centered in the app window (deltaX=${deltaX.toFixed(2)}, deltaY=${deltaY.toFixed(2)}, tolerance=${tolerancePx})`,
    );
  }

  if (
    box.x < -tolerancePx ||
    box.y < -tolerancePx ||
    box.x + box.width > viewport.width + tolerancePx ||
    box.y + box.height > viewport.height + tolerancePx
  ) {
    throw new Error(
      `Dialog is clipped by the app window (x=${box.x.toFixed(2)}, y=${box.y.toFixed(2)}, width=${box.width.toFixed(2)}, height=${box.height.toFixed(2)}, viewport=${viewport.width}x${viewport.height})`,
    );
  }
}

export async function resetDialogScroll(dialog: Locator): Promise<void> {
  await dialog.evaluate((element) => {
    const queue: HTMLElement[] = [];
    if (element instanceof HTMLElement) {
      queue.push(element);
    }
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;
      if (current.scrollHeight > current.clientHeight + 1) {
        current.scrollTop = 0;
      }
      for (const child of Array.from(current.children)) {
        if (child instanceof HTMLElement) {
          queue.push(child);
        }
      }
    }
  });
}

export async function expectElementWithinViewport(
  window: Page,
  locator: Locator,
  tolerancePx = 2,
) {
  await locator.waitFor({ state: "visible", timeout: 10_000 });
  const viewport = window.viewportSize();
  if (!viewport) throw new Error("Viewport size is unavailable");
  const box = await locator.boundingBox();
  if (!box) throw new Error("Element bounding box is unavailable");

  if (
    box.x < -tolerancePx ||
    box.y < -tolerancePx ||
    box.x + box.width > viewport.width + tolerancePx ||
    box.y + box.height > viewport.height + tolerancePx
  ) {
    throw new Error(
      `Element is clipped by the app window (x=${box.x.toFixed(2)}, y=${box.y.toFixed(2)}, width=${box.width.toFixed(2)}, height=${box.height.toFixed(2)}, viewport=${viewport.width}x${viewport.height})`,
    );
  }

  return { box, viewport };
}

export async function expectDialogLayout(
  window: Page,
  dialog: Locator,
  options: {
    minWidth?: number;
    maxWidth?: number;
    requireFooter?: boolean;
  } = {},
) {
  const { minWidth = 320, maxWidth, requireFooter = true } = options;
  const { box: dialogBox, viewport } = await expectElementWithinViewport(window, dialog);
  await expectDialogCentered(window, dialog);

  if (dialogBox.width < minWidth) {
    throw new Error(
      `Dialog width ${dialogBox.width.toFixed(2)} is below expected minimum ${minWidth}`,
    );
  }

  const resolvedMaxWidth = maxWidth ?? viewport.width - 48;
  if (dialogBox.width > resolvedMaxWidth + 2) {
    throw new Error(
      `Dialog width ${dialogBox.width.toFixed(2)} exceeds expected maximum ${resolvedMaxWidth}`,
    );
  }

  const overlay = window.locator(".modal-overlay").last();
  const { box: overlayBox } = await expectElementWithinViewport(window, overlay);
  if (
    Math.abs(overlayBox.x) > 2 ||
    Math.abs(overlayBox.y) > 2 ||
    Math.abs(overlayBox.width - viewport.width) > 2 ||
    Math.abs(overlayBox.height - viewport.height) > 2
  ) {
    throw new Error(
      `Modal overlay does not cover the app window (overlay=${overlayBox.width.toFixed(2)}x${overlayBox.height.toFixed(2)} at ${overlayBox.x.toFixed(2)},${overlayBox.y.toFixed(2)} viewport=${viewport.width}x${viewport.height})`,
    );
  }

  const title = dialog.locator(".modal-title").first();
  const { box: titleBox } = await expectElementWithinViewport(window, title);
  if (
    titleBox.y < dialogBox.y - 1 ||
    titleBox.y + titleBox.height > dialogBox.y + dialogBox.height + 1
  ) {
    throw new Error("Dialog title is not fully visible within the dialog bounds");
  }

  const footer = dialog.locator(".modal-actions, .modal-footer").last();
  const footerCount = await footer.count();
  if (requireFooter || footerCount > 0) {
    if (footerCount === 0) {
      throw new Error("Dialog footer is missing");
    }
    const { box: footerBox } = await expectElementWithinViewport(window, footer);
    if (
      footerBox.y < dialogBox.y - 1 ||
      footerBox.y + footerBox.height > dialogBox.y + dialogBox.height + 1
    ) {
      throw new Error("Dialog footer is not fully visible within the dialog bounds");
    }
  }

  const focusInside = await dialog.evaluate((element) => {
    const active = document.activeElement;
    return active instanceof HTMLElement && element.contains(active);
  });
  if (!focusInside) {
    throw new Error("Keyboard focus did not enter the dialog on open");
  }

  return { dialogBox, viewport };
}

export async function expectDialogFocusTrap(
  window: Page,
  dialog: Locator,
): Promise<void> {
  const focusableCount = await dialog.evaluate((element) => {
    const selector = [
      "a[href]",
      "button:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      '[tabindex]:not([tabindex="-1"])',
    ].join(",");
    return Array.from(element.querySelectorAll<HTMLElement>(selector)).filter(
      (candidate) => !candidate.hasAttribute("hidden") && candidate.offsetParent !== null,
    ).length;
  });

  if (focusableCount < 2) {
    throw new Error(
      `Dialog does not have enough focusable elements for a focus-trap check (count=${focusableCount})`,
    );
  }

  const focusAtIndex = async (index: number) => {
    await dialog.evaluate((element, focusIndex) => {
      const selector = [
        "a[href]",
        "button:not([disabled])",
        "input:not([disabled])",
        "select:not([disabled])",
        "textarea:not([disabled])",
        '[tabindex]:not([tabindex="-1"])',
      ].join(",");
      const focusables = Array.from(
        element.querySelectorAll<HTMLElement>(selector),
      ).filter(
        (candidate) =>
          !candidate.hasAttribute("hidden") && candidate.offsetParent !== null,
      );
      focusables[focusIndex]?.focus();
    }, index);
    await waitForStableFrame(window, 1);
  };

  const readActiveIndex = async () =>
    dialog.evaluate((element) => {
      const selector = [
        "a[href]",
        "button:not([disabled])",
        "input:not([disabled])",
        "select:not([disabled])",
        "textarea:not([disabled])",
        '[tabindex]:not([tabindex="-1"])',
      ].join(",");
      const focusables = Array.from(
        element.querySelectorAll<HTMLElement>(selector),
      ).filter(
        (candidate) =>
          !candidate.hasAttribute("hidden") && candidate.offsetParent !== null,
      );
      const active = document.activeElement as HTMLElement | null;
      return focusables.indexOf(active);
    });

  await focusAtIndex(0);
  await window.keyboard.press("Shift+Tab");
  await waitForStableFrame(window, 1);
  const wrappedBackwardIndex = await readActiveIndex();
  if (wrappedBackwardIndex !== focusableCount - 1) {
    throw new Error(
      `Expected Shift+Tab on the first focusable to wrap to the last element, got index=${wrappedBackwardIndex}`,
    );
  }

  await window.keyboard.press("Tab");
  await waitForStableFrame(window, 1);
  const wrappedForwardIndex = await readActiveIndex();
  if (wrappedForwardIndex !== 0) {
    throw new Error(
      `Expected Tab on the last focusable to wrap to the first element, got index=${wrappedForwardIndex}`,
    );
  }

  await window.keyboard.press("Tab");
  await waitForStableFrame(window, 1);
  const nextForwardIndex = await readActiveIndex();
  if (nextForwardIndex <= 0) {
    throw new Error(
      `Expected Tab from the first focusable to move forward inside the dialog, got index=${nextForwardIndex}`,
    );
  }

  await focusAtIndex(focusableCount - 1);
  await window.keyboard.press("Tab");
  await waitForStableFrame(window, 1);
  const finalWrapIndex = await readActiveIndex();
  if (finalWrapIndex !== 0) {
    throw new Error(
      `Expected Tab on the last focusable to wrap to the first element, got index=${finalWrapIndex}`,
    );
  }
}

export async function expectNoHorizontalOverflow(locator: Locator): Promise<void> {
  const overflow = await locator.evaluate((element) => ({
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
  }));
  if (overflow.scrollWidth > overflow.clientWidth + 1) {
    throw new Error(
      `Expected element not to overflow horizontally (scrollWidth=${overflow.scrollWidth}, clientWidth=${overflow.clientWidth})`,
    );
  }
}

export async function expectVerticalStack(
  locators: Locator,
  options: {
    minimumGap?: number;
    leftTolerance?: number;
  } = {},
): Promise<void> {
  const { minimumGap = 0, leftTolerance = 24 } = options;
  const count = await locators.count();
  const boxes: Array<NonNullable<Awaited<ReturnType<Locator["boundingBox"]>>>> = [];

  for (let index = 0; index < count; index += 1) {
    const box = await locators.nth(index).boundingBox();
    if (!box) {
      throw new Error(`Bounding box unavailable for locator index ${index}`);
    }
    boxes.push(box);
  }

  for (let index = 1; index < boxes.length; index += 1) {
    const previous = boxes[index - 1]!;
    const current = boxes[index]!;
    const gap = current.y - (previous.y + previous.height);
    if (gap < minimumGap - 1) {
      throw new Error(
        `Expected vertical stack gap >= ${minimumGap}, got ${gap.toFixed(2)} at index ${index}`,
      );
    }
    if (Math.abs(current.x - previous.x) > leftTolerance) {
      throw new Error(
        `Expected stacked items to align on the left edge within ${leftTolerance}px, got ${Math.abs(current.x - previous.x).toFixed(2)}px`,
      );
    }
  }
}

export async function waitForCanvasOpenReady(window: Page): Promise<void> {
  try {
    await window.waitForFunction(
      (probeNames) => {
        const events =
          (window as Window & typeof globalThis).__vivi2dPerfProbeState__?.events ?? [];
        const seen = new Set(events.map((event) => event.name));
        return probeNames.every((name) => seen.has(name));
      },
      [...CANVAS_OPEN_PROBE_NAMES],
      { timeout: e2eTimeout(15_000) },
    );
  } catch {
    await window.waitForFunction(
      () => {
        const layerItems = document.querySelectorAll(".layer-item");
        const canvas = document.querySelector(
          ".canvas-container canvas",
        ) as HTMLCanvasElement | null;
        return Boolean(
          layerItems.length > 0 && canvas && canvas.width > 0 && canvas.height > 0,
        );
      },
      undefined,
      { timeout: e2eTimeout(15_000) },
    );
  }
  await waitForStableFrame(window, 4);
  await waitForCanvasFingerprintToStabilize(window);
}

export async function importPsdAndWait(
  app: ElectronApplication,
  window: Page,
  psdPath: string,
  firstLayerText = "Background",
): Promise<void> {
  await clearPerfProbeEvents(window);
  await mockOpenPsd(app, psdPath);
  await clickFileMenuItem(window, "Import PSD");
  await waitForCanvasOpenReady(window);
  try {
    await waitForViviRuntime(window);
  } catch {
    await waitForAppReady(window);
  }
  if (firstLayerText) {
    await window.locator(".layer-item", { hasText: firstLayerText }).first().waitFor({
      state: "visible",
      timeout: 15_000,
    });
  }
}

export async function launchApp(): Promise<{
  app: ElectronApplication;
  window: Page;
}> {
  const app = await electron.launch({
    args: [path.join(ROOT, "electron/main.cjs")],
    env: {
      ...process.env,
      NODE_ENV: "test",
    },
    ...(IS_RECORDING_WORKFLOWS
      ? {
          recordVideo: {
            dir:
              fs.mkdirSync(ELECTRON_VIDEO_DIR, { recursive: true }) ??
              ELECTRON_VIDEO_DIR,
            size: { width: 1600, height: 900 },
          },
        }
      : {}),
  });

  const window = await app.firstWindow();
  await waitForAppReady(window);
  return { app, window };
}
