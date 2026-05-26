import { expect, test } from "../fixtures";
import {
  addBone,
  addParameter,
  bindAllBones,
  selectLayer,
} from "../helpers/operations";

const MESH_SECTION_TITLE = /^(Mesh|\u30e1\u30c3\u30b7\u30e5)$/;
const MIRROR_X_LABEL = /Mirror X|X \u53cd\u8ee2/;

async function readHistory(window: import("playwright").Page) {
  return window.evaluate(() => {
    const vivi = window.__vivi2d as any;
    return vivi.useHistoryStore.getState();
  });
}

async function expectUndoAvailable(window: import("playwright").Page) {
  await expect(async () => {
    const history = await readHistory(window);
    expect(history.undoStack.length).toBeGreaterThan(0);
  }).toPass({ timeout: 5_000 });
}

async function expectRedoAvailable(window: import("playwright").Page) {
  await expect(async () => {
    const history = await readHistory(window);
    expect(history.redoStack.length).toBeGreaterThan(0);
  }).toPass({ timeout: 5_000 });
}

async function expectRedoCleared(window: import("playwright").Page) {
  await expect(async () => {
    const history = await readHistory(window);
    expect(history.redoStack.length).toBe(0);
  }).toPass({ timeout: 5_000 });
}

async function enterMeshTool(window: import("playwright").Page) {
  await selectLayer(window, "Red Circle");
  const meshTool = window.locator(".tool-btn").nth(2);
  await meshTool.click();
  await expect(meshTool).toHaveClass(/active/);
}

async function expectBoneCount(window: import("playwright").Page, expected: number) {
  await expect(async () => {
    const count = await window.evaluate(() => {
      const vivi = window.__vivi2d as any;
      const project = vivi.useEditorStore.getState().project;
      const countBones = (layers: any[]): number =>
        layers.reduce((total, layer) => {
          const self = layer.kind === "bone" ? 1 : 0;
          return total + self + (layer.children?.length ? countBones(layer.children) : 0);
        }, 0);
      return countBones(project?.layers ?? []);
    });
    expect(count).toBe(expected);
  }).toPass({ timeout: 5_000 });
}

test.beforeEach(async ({ window, loadTestPsd }) => {
  await window.setViewportSize({ width: 1920, height: 1080 });
  await loadTestPsd();
});

test("layer property edits create undo history", async ({ window }) => {
  await selectLayer(window, "Red Circle");

  const opacityInput = window.locator(".prop-number-input").first();
  await opacityInput.fill("50");
  await opacityInput.press("Enter");

  await expectUndoAvailable(window);
});

test("Ctrl+Z after a draw order edit enables redo history", async ({ window }) => {
  await selectLayer(window, "Red Circle");

  const drawOrderInput = window.locator('.prop-number-input[max="1000"]');
  await drawOrderInput.fill("750");
  await drawOrderInput.press("Enter");
  await expect(drawOrderInput).toHaveValue("750");

  await window.keyboard.press("Control+z");
  await expectRedoAvailable(window);
});

test("Ctrl+Shift+Z reapplies the last undone change", async ({ window }) => {
  await selectLayer(window, "Red Circle");

  const drawOrderInput = window.locator('.prop-number-input[max="1000"]');
  await drawOrderInput.fill("800");
  await drawOrderInput.press("Enter");

  await window.keyboard.press("Control+z");
  await expectRedoAvailable(window);

  await window.keyboard.press("Control+Shift+z");
  await expect(drawOrderInput).toHaveValue("800");
  await expectRedoCleared(window);
});

test("adding a bone can be undone and redone", async ({ window }) => {
  await addBone(window, "Red Circle");
  await expectBoneCount(window, 1);

  await window.keyboard.press("Control+z");
  await expectBoneCount(window, 0);

  await window.keyboard.press("Control+Shift+z");
  await expectBoneCount(window, 1);
});

test("adding a parameter can be undone and redone", async ({ window }) => {
  await addParameter(window, "UndoRedo Parameter");
  const parameter = window.locator(".parameter-name", { hasText: "UndoRedo Parameter" });
  await expect(parameter).toBeVisible();

  await window.keyboard.press("Control+z");
  await expect(parameter).not.toBeVisible();

  await window.keyboard.press("Control+Shift+z");
  await expect(parameter).toBeVisible();
});

test("layer visibility toggle can be undone", async ({ window }) => {
  const bgItem = window.locator(".layer-item", { hasText: "Background" });
  const visBtn = bgItem.locator(".layer-visibility-btn");

  await visBtn.click();
  await expect(bgItem).toHaveClass(/hidden-layer/);

  await window.keyboard.press("Control+z");
  await expect(bgItem).not.toHaveClass(/hidden-layer/);
});

test("branching after undo clears redo history", async ({ window }) => {
  await addParameter(window, "Branch A");
  const parameterA = window.locator(".parameter-name", { hasText: "Branch A" });
  await expect(parameterA).toBeVisible();

  await window.keyboard.press("Control+z");
  await expect(parameterA).not.toBeVisible();
  await expectRedoAvailable(window);

  await addParameter(window, "Branch B");
  const parameterB = window.locator(".parameter-name", { hasText: "Branch B" });
  await expect(parameterB).toBeVisible();

  await expectRedoCleared(window);
});

test("undoing nested actions removes the most recent changes first", async ({
  window,
}) => {
  await addBone(window, "Red Circle");
  await expectBoneCount(window, 1);

  await addParameter(window, "Nested Parameter");
  const parameter = window.locator(".parameter-name", { hasText: "Nested Parameter" });
  await expect(parameter).toBeVisible();

  await window.keyboard.press("Control+z");
  await expect(parameter).not.toBeVisible();
  await expectBoneCount(window, 1);

  await window.keyboard.press("Control+z");
  await expectBoneCount(window, 0);
});

test("mesh mirror X survives undo and redo", async ({ window }) => {
  await enterMeshTool(window);

  await window.locator(".mesh-op-btn", { hasText: MIRROR_X_LABEL }).click();
  await expectUndoAvailable(window);

  await window.keyboard.press("Control+z");
  await expectRedoAvailable(window);

  await window.keyboard.press("Control+Shift+z");
  await expect(
    window
      .locator(".properties-section")
      .filter({
        has: window.locator(".prop-section-title", { hasText: MESH_SECTION_TITLE }),
      })
      .first(),
  ).toBeVisible();
});

test("binding all bones can be undone", async ({ window }) => {
  await addBone(window, "Red Circle");
  await selectLayer(window, "Red Circle");
  await bindAllBones(window);

  await expect(window.locator(".prop-bone-tag")).toBeVisible();
  await window.keyboard.press("Control+z");
  await expect(window.locator(".prop-bone-tag")).not.toBeVisible();
});

test("public profile keeps blend shape authoring hidden", async ({ window }) => {
  await selectLayer(window, "Red Circle");
  await expect(
    window
      .locator(".properties-section")
      .filter({
        has: window.locator(".prop-section-title", { hasText: /^Blend Shapes$/ }),
      }),
  ).toHaveCount(0);

  await window.keyboard.press("Control+z");
  await expect(window.locator(".workspace")).toBeVisible();
});
