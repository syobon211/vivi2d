import { expect, test } from "../fixtures";
import { addBone, clickFileMenuItem } from "../helpers/operations";

async function waitForVivi2D(window: import("playwright").Page) {
  await expect(async () => {
    const ready = await window.evaluate(() => !!window.__vivi2d);
    expect(ready).toBe(true);
  }).toPass({ timeout: 10_000 });
}

async function openValidationDialog(window: import("playwright").Page) {
  await clickFileMenuItem(window, "Validate");
  const dialog = window.locator(".modal-overlay");
  await expect(dialog).toBeVisible();
  await expect(
    window.locator(".modal-title", { hasText: /モデル検証|Model Validation/ }),
  ).toBeVisible();
  return dialog;
}

async function closeValidationDialog(window: import("playwright").Page) {
  await window.locator(".modal-btn", { hasText: /閉じる|Close/ }).click();
  await expect(window.locator(".modal-overlay")).not.toBeVisible();
}

function issueItemByCategory(
  window: import("playwright").Page,
  severity: "error" | "warning" | "info",
  category: RegExp,
) {
  return window
    .locator(`.validation-item-${severity}`)
    .filter({
      has: window.locator(".validation-category", { hasText: category }),
    })
    .first();
}

test.beforeEach(async ({ window, loadTestPsd }) => {
  await loadTestPsd();
  await waitForVivi2D(window);
});

test("validation dialog opens and closes", async ({ window }) => {
  await openValidationDialog(window);
  await closeValidationDialog(window);
});

test("validation can run against the loaded project", async ({ window }) => {
  await openValidationDialog(window);

  const hasNoIssues = await window
    .locator(".validation-ok")
    .isVisible()
    .catch(() => false);
  const hasIssues = await window
    .locator(".validation-list")
    .isVisible()
    .catch(() => false);
  expect(hasNoIssues || hasIssues).toBe(true);

  await closeValidationDialog(window);
});

test("empty mesh is reported as an error", async ({ window }) => {
  await window.evaluate(() => {
    const v = window.__vivi2d!;
    const editorStore = v.useEditorStore as any;
    editorStore.setState((s: any) => {
      if (!s.project?.layers) return;
      const stack = [...s.project.layers];
      while (stack.length > 0) {
        const layer = stack.shift();
        if (!layer) break;
        if (layer.kind === "viviMesh") {
          layer.mesh.vertices = [];
          layer.mesh.indices = [];
          return;
        }
        if (layer.children?.length) stack.unshift(...layer.children);
      }
    });
  });

  await openValidationDialog(window);
  await expect(window.locator(".validation-item-error").first()).toBeVisible({
    timeout: 5_000,
  });
  await expect(issueItemByCategory(window, "error", /空メッシュ/)).toBeVisible();
  await closeValidationDialog(window);
});

test("unused bone is reported as a warning", async ({ window }) => {
  await addBone(window, "Red Circle");

  await openValidationDialog(window);
  await expect(window.locator(".validation-item-warning").first()).toBeVisible({
    timeout: 5_000,
  });
  await expect(issueItemByCategory(window, "warning", /未使用ボーン/)).toBeVisible();
  await closeValidationDialog(window);
});

test("summary counts are shown when issues exist", async ({ window }) => {
  await addBone(window, "Red Circle");
  await window.evaluate(() => {
    const v = window.__vivi2d!;
    const editorStore = v.useEditorStore as any;
    const project = editorStore.getState().project;
    if (!project?.layers) return;

    const stack = [...project.layers];
    while (stack.length > 0) {
      const layer = stack.shift();
      if (!layer) break;
      if (layer.kind === "viviMesh") {
        layer.mesh.vertices = [];
        layer.mesh.indices = [];
        break;
      }
      if (layer.children?.length) stack.unshift(...layer.children);
    }

    editorStore.setState({ project: { ...project } });
  });

  await openValidationDialog(window);
  await expect(window.locator(".validation-summary").first()).toBeVisible({
    timeout: 5_000,
  });
  expect(await window.locator(".validation-count").count()).toBeGreaterThanOrEqual(1);
  expect(
    await window.locator("[class*='validation-item-']").count(),
  ).toBeGreaterThanOrEqual(1);
  await closeValidationDialog(window);
});

test("opening validation does not mutate the project", async ({ window }) => {
  const beforeState = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const editorStore = v.useEditorStore as any;
    const project = editorStore.getState().project;
    if (!project) return null;
    return JSON.stringify({
      layerCount: project.layers.length,
      parameterCount: project.parameters.length,
      bindingCount: project.parameterBindings?.length ?? 0,
      skinCount: Object.keys(project.skins).length,
    });
  });
  expect(beforeState).toBeTruthy();

  await openValidationDialog(window);
  await closeValidationDialog(window);

  const afterState = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const editorStore = v.useEditorStore as any;
    const project = editorStore.getState().project;
    if (!project) return null;
    return JSON.stringify({
      layerCount: project.layers.length,
      parameterCount: project.parameters.length,
      bindingCount: project.parameterBindings?.length ?? 0,
      skinCount: Object.keys(project.skins).length,
    });
  });

  expect(afterState).toBe(beforeState);
});
