import { expect, test } from "../fixtures";
import { importPsdAndWait, waitForViviRuntime } from "../helpers/app";
import { clickFileMenuItem } from "../helpers/operations";
import { resolveCharacterPsdPath } from "../helpers/psd-fixtures";

const CHARACTER_PSD = resolveCharacterPsdPath();

async function waitForVivi2D(window: import("playwright").Page) {
  await expect(window.locator(".workspace")).toBeVisible({ timeout: 10_000 });
  await waitForViviRuntime(window);
}

async function loadCharacterPsd(
  app: import("playwright").ElectronApplication,
  window: import("playwright").Page,
) {
  await importPsdAndWait(app, window, CHARACTER_PSD, "");
}

async function openAutoSetup(window: import("playwright").Page) {
  await clickFileMenuItem(window, "Auto Setup");
  await expect(window.locator(".auto-setup-dialog")).toBeVisible({ timeout: 5_000 });
}

async function runDetect(window: import("playwright").Page): Promise<number> {
  await window.locator(".auto-setup-footer-cta .modal-btn-primary").click();

  await expect(async () => {
    const hasTable = await window
      .locator(".auto-setup-table")
      .isVisible()
      .catch(() => false);
    const hasEmpty = await window
      .locator(".auto-setup-empty")
      .isVisible()
      .catch(() => false);
    expect(hasTable || hasEmpty).toBe(true);
  }).toPass({ timeout: 15_000 });

  return window.locator(".auto-setup-table tbody tr").count();
}

async function moveToPreview(window: import("playwright").Page) {
  await window.locator(".auto-setup-actions .modal-btn-primary").click();
  await expect(window.locator(".auto-setup-step h3")).toContainText(/Preview|プレビュー/);
}

function detectStepChecks(window: import("playwright").Page) {
  return window.locator(".auto-setup-options .auto-setup-check input[type='checkbox']");
}

test.beforeEach(async ({ app, window }) => {
  await window.setViewportSize({ width: 1920, height: 1080 });
  await loadCharacterPsd(app, window);
  await waitForVivi2D(window);
});

test.describe("BBW auto weights workflow", () => {
  test("default detect flow reaches preview and can apply", async ({ window }) => {
    await openAutoSetup(window);

    const checks = detectStepChecks(window);
    await expect(checks.nth(0)).toBeChecked();
    await expect(checks.nth(1)).toBeChecked();
    await expect(checks.nth(2)).toBeChecked();
    await expect(window.locator(".auto-setup-select .prop-select")).toBeVisible();

    const rowCount = await runDetect(window);
    test.skip(rowCount === 0, "No detected parts were produced for this PSD");

    await moveToPreview(window);
    expect(await window.locator(".auto-setup-section").count()).toBeGreaterThan(0);

    await window.locator(".auto-setup-actions .modal-btn-primary").click();
    await expect(window.locator(".auto-setup-dialog")).not.toBeVisible({
      timeout: 5_000,
    });

    const projectState = await window.evaluate(() => {
      const v = window.__vivi2d!;
      const project = (v.useEditorStore as any).getState().project;
      if (!project) return null;

      let boneCount = 0;
      const walk = (layers: any[]) => {
        for (const layer of layers) {
          if (layer.kind === "bone") boneCount++;
          if (layer.children?.length) walk(layer.children);
        }
      };
      walk(project.layers);

      return {
        boneCount,
        skinCount: Object.keys(project.skins ?? {}).length,
        parameterCount: project.parameters?.length ?? 0,
      };
    });

    expect(projectState).not.toBeNull();
    expect(projectState!.boneCount).toBeGreaterThan(0);
    expect(projectState!.parameterCount).toBeGreaterThan(0);
    // Safe Auto Setup keeps generated weight data out of the persisted project
    // until it has passed an explicit review gate.
    expect(projectState!.skinCount).toBe(0);
  });

  test("mesh preset visibility follows generateMeshes toggle", async ({ window }) => {
    await openAutoSetup(window);

    const checks = detectStepChecks(window);
    const meshCheck = checks.nth(1);
    const weightCheck = checks.nth(2);
    const presetSelect = window.locator(".auto-setup-select .prop-select");

    await expect(presetSelect).toBeVisible();
    await expect(weightCheck).toBeEnabled();

    await meshCheck.dispatchEvent("click");
    await expect(meshCheck).not.toBeChecked();
    await expect(presetSelect).not.toBeVisible();
    await expect(weightCheck).toBeDisabled();
  });

  test("disabling weights removes the weight preview section", async ({ window }) => {
    await openAutoSetup(window);

    const weightCheck = detectStepChecks(window).nth(2);
    await weightCheck.dispatchEvent("click");
    await expect(weightCheck).not.toBeChecked();

    const rowCount = await runDetect(window);
    test.skip(rowCount === 0, "No detected parts were produced for this PSD");

    await moveToPreview(window);
    await expect(
      window.locator(".auto-setup-section h4").filter({ hasText: /Weight|ウェイト/ }),
    ).toHaveCount(0);
  });

  test("disabling all generators applies a no-op setup", async ({ window }) => {
    await openAutoSetup(window);

    const checks = detectStepChecks(window);
    for (let i = 0; i < 4; i++) {
      const check = checks.nth(i);
      if (await check.isChecked()) {
        await check.dispatchEvent("click");
      }
    }

    const rowCount = await runDetect(window);
    test.skip(rowCount === 0, "No detected parts were produced for this PSD");

    await moveToPreview(window);
    await window.locator(".auto-setup-actions .modal-btn-primary").click();
    await expect(window.locator(".auto-setup-dialog")).not.toBeVisible({
      timeout: 5_000,
    });

    const state = await window.evaluate(() => {
      const v = window.__vivi2d!;
      const project = (v.useEditorStore as any).getState().project;
      if (!project) return null;

      let boneCount = 0;
      const walk = (layers: any[]) => {
        for (const layer of layers) {
          if (layer.kind === "bone") boneCount++;
          if (layer.children?.length) walk(layer.children);
        }
      };
      walk(project.layers);

      return {
        boneCount,
        skinCount: Object.keys(project.skins ?? {}).length,
      };
    });

    expect(state).not.toBeNull();
    expect(state!.boneCount).toBe(0);
    expect(state!.skinCount).toBe(0);
  });

  test("high confidence threshold still resolves to table or empty state", async ({
    window,
  }) => {
    await openAutoSetup(window);

    const slider = window.locator(".auto-setup-confidence input[type='range']");
    await slider.fill("0.9");
    await runDetect(window);

    const hasTable = await window
      .locator(".auto-setup-table")
      .isVisible()
      .catch(() => false);
    const hasEmpty = await window
      .locator(".auto-setup-empty")
      .isVisible()
      .catch(() => false);
    expect(hasTable || hasEmpty).toBe(true);
  });
});
