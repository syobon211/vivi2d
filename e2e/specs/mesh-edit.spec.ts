import { expect, test } from "../fixtures";
import { selectLayer } from "../helpers/operations";

const MESH_SECTION_LABEL = /^(Mesh|\u30e1\u30c3\u30b7\u30e5)/;
const MERGE_VERTICES_LABEL = /Merge vertices|\u9802\u70b9\u3092\u7d50\u5408/;
const RETRIANGULATE_LABEL = /Retriangulate|\u4e09\u89d2\u5f62\u3092\u518d\u69cb\u7bc9/;
const MIRROR_X_LABEL = /Mirror X|X \u53cd\u8ee2/;
const MIRROR_Y_LABEL = /Mirror Y|Y \u53cd\u8ee2/;
const VERTEX_MODE_HINT_LABEL = /Vertex mode:|\u9802\u70b9\u30e2\u30fc\u30c9:/;
const PUPPET_MODE_HINT_LABEL = /Puppet mode:|\u30d1\u30da\u30c3\u30c8\u30e2\u30fc\u30c9:/;

test.beforeEach(async ({ window, loadTestPsd }) => {
  await window.setViewportSize({ width: 1920, height: 1080 });
  await loadTestPsd();
});

function meshToolButton(window: import("playwright").Page) {
  return window.locator(".tool-btn").nth(2);
}

async function enterMeshTool(window: import("playwright").Page) {
  await selectLayer(window, "Red Circle");
  const meshTool = meshToolButton(window);
  await meshTool.click();
  await expect(meshTool).toHaveClass(/active/);
}

function meshPanel(window: import("playwright").Page) {
  return window.locator(".properties-section").filter({ hasText: MESH_SECTION_LABEL }).first();
}

test("switching to mesh edit shows the mesh panel", async ({ window }) => {
  await enterMeshTool(window);
  await expect(meshPanel(window)).toBeVisible();
});

test("mesh operation buttons are visible", async ({ window }) => {
  await enterMeshTool(window);

  await expect(
    window.locator(".mesh-op-btn", { hasText: MERGE_VERTICES_LABEL }),
  ).toBeVisible();
  await expect(
    window.locator(".mesh-op-btn", { hasText: RETRIANGULATE_LABEL }),
  ).toBeVisible();
  await expect(window.locator(".mesh-op-btn", { hasText: MIRROR_X_LABEL })).toBeVisible();
  await expect(window.locator(".mesh-op-btn", { hasText: MIRROR_Y_LABEL })).toBeVisible();
});

test("merge vertices is disabled when no vertices are selected", async ({ window }) => {
  await enterMeshTool(window);
  await expect(
    window.locator(".mesh-op-btn", { hasText: MERGE_VERTICES_LABEL }),
  ).toBeDisabled();
});

test("mirror X keeps the mesh panel stable", async ({ window }) => {
  await enterMeshTool(window);
  const mirrorX = window.locator(".mesh-op-btn", { hasText: MIRROR_X_LABEL });
  await expect(mirrorX).toBeEnabled();
  await mirrorX.click();
  await expect(meshPanel(window)).toBeVisible();
});

test("mirror Y keeps the mesh panel stable", async ({ window }) => {
  await enterMeshTool(window);
  const mirrorY = window.locator(".mesh-op-btn", { hasText: MIRROR_Y_LABEL });
  await expect(mirrorY).toBeEnabled();
  await mirrorY.click();
  await expect(meshPanel(window)).toBeVisible();
});

test("retriangulate runs without collapsing the UI", async ({ window }) => {
  await enterMeshTool(window);
  const retriangulate = window.locator(".mesh-op-btn", { hasText: RETRIANGULATE_LABEL });
  await expect(retriangulate).toBeEnabled();
  await retriangulate.click();
  await expect(meshPanel(window)).toBeVisible();
});

test("undo becomes available after mesh operations", async ({ window }) => {
  await enterMeshTool(window);

  await window.locator(".mesh-op-btn", { hasText: MIRROR_X_LABEL }).click();

  await expect(async () => {
    const history = await window.evaluate(() => {
      const vivi = window.__vivi2d as any;
      return vivi.useHistoryStore.getState();
    });
    expect(history.undoStack.length).toBeGreaterThan(0);
  }).toPass({ timeout: 5_000 });

  await window.keyboard.press("Control+z");

  await expect(async () => {
    const history = await window.evaluate(() => {
      const vivi = window.__vivi2d as any;
      return vivi.useHistoryStore.getState();
    });
    expect(history.redoStack.length).toBeGreaterThan(0);
  }).toPass({ timeout: 5_000 });
});

test("mesh operation hints are visible", async ({ window }) => {
  await enterMeshTool(window);

  const hints = window.locator(".mesh-ops-hint");
  await expect(hints.filter({ hasText: VERTEX_MODE_HINT_LABEL }).first()).toContainText("Alt+");
  await expect(hints.filter({ hasText: VERTEX_MODE_HINT_LABEL }).first()).toContainText("Shift+");
  await expect(hints.filter({ hasText: PUPPET_MODE_HINT_LABEL }).first()).toContainText(
    /Ctrl\/Cmd\+(click|\u30af\u30ea\u30c3\u30af)/,
  );
});

test("keyboard M activates the mesh tool", async ({ window }) => {
  await selectLayer(window, "Red Circle");
  await window.locator(".app").click();
  await window.keyboard.press("m");

  await expect(meshToolButton(window)).toHaveClass(/active/);
});

test("default form lock disables mesh operation buttons", async ({ window }) => {
  await enterMeshTool(window);

  await window.locator(".menu-dropdown-trigger", { hasText: /表示|View/ }).click();
  await window.locator(".menu-dropdown-panel .menu-dropdown-item").first().click();

  await expect(window.locator(".mesh-op-btn", { hasText: MIRROR_X_LABEL })).toBeDisabled();
  await expect(window.locator(".mesh-op-btn", { hasText: MIRROR_Y_LABEL })).toBeDisabled();
  await expect(
    window.locator(".mesh-op-btn", { hasText: RETRIANGULATE_LABEL }),
  ).toBeDisabled();
  await expect(
    window.locator(".mesh-op-btn", { hasText: MERGE_VERTICES_LABEL }),
  ).toBeDisabled();
});
