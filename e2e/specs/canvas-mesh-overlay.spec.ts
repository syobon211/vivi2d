import { expect, test } from "../fixtures";
import { selectLayer } from "../helpers/operations";

const MESH_SECTION_LABEL = /^(Mesh|\u30e1\u30c3\u30b7\u30e5)/;

async function waitForEditorReady(window: import("playwright").Page) {
  await expect(window.locator(".app")).toBeVisible();
  await expect(window.locator(".layer-item").first()).toBeVisible({ timeout: 10_000 });
}

function meshToolButton(window: import("playwright").Page) {
  return window.locator(".tool-btn").nth(2);
}

function selectToolButton(window: import("playwright").Page) {
  return window.locator(".tool-btn").nth(0);
}

async function enterMeshEditMode(window: import("playwright").Page, layerName: string) {
  await selectLayer(window, layerName);
  const meshTool = meshToolButton(window);
  await meshTool.click();
  await expect(meshTool).toHaveClass(/active/);
}

async function getVertexCount(
  window: import("playwright").Page,
  layerName: string,
): Promise<number> {
  return window.evaluate((name) => {
    const v = window.__vivi2d;
    if (!v) return -1;
    const store = (v as any).useEditorStore;
    const project = store.getState().project;
    if (!project) return -1;

    const findLayer = (layers: any[], target: string): any => {
      for (const layer of layers) {
        if (layer.name === target) return layer;
        if (layer.children?.length) {
          const found = findLayer(layer.children, target);
          if (found) return found;
        }
      }
      return null;
    };

    const layer = findLayer(project.layers, name);
    if (!layer || layer.kind !== "viviMesh") return -1;
    return layer.mesh.vertices.length / 2;
  }, layerName);
}

test.beforeEach(async ({ window, loadTestPsd }) => {
  await window.setViewportSize({ width: 1920, height: 1080 });
  await loadTestPsd();
  await waitForEditorReady(window);
});

test("mesh edit mode keeps the canvas and mesh panel visible", async ({ window }) => {
  await enterMeshEditMode(window, "Red Circle");

  await expect(
    window.locator(".properties-section").filter({ hasText: MESH_SECTION_LABEL }).first(),
  ).toBeVisible();
  await expect(window.locator(".canvas-container canvas")).toBeVisible();
});

test("auto mesh generation leaves the mesh editable and produces vertices", async ({
  window,
}) => {
  await enterMeshEditMode(window, "Red Circle");

  const autoMeshBtn = window.locator(".auto-mesh-btn").first();
  await expect(autoMeshBtn).toBeVisible();
  await autoMeshBtn.click();

  await expect(async () => {
    const newCount = await getVertexCount(window, "Red Circle");
    expect(newCount).toBeGreaterThan(0);
  }).toPass({ timeout: 5_000 });

  await expect(
    window.locator(".properties-section").filter({ hasText: MESH_SECTION_LABEL }).first(),
  ).toBeVisible();
});

test("mesh density presets can be switched and still generate geometry", async ({
  window,
}) => {
  await enterMeshEditMode(window, "Red Circle");

  const presetSelect = window.locator(".auto-mesh-select").first();
  await expect(presetSelect).toBeVisible();

  for (const preset of ["coarse", "fine", "standard"] as const) {
    await presetSelect.selectOption(preset);
    await expect(presetSelect).toHaveValue(preset);
  }

  await presetSelect.selectOption("coarse");
  await window.locator(".auto-mesh-btn").first().click();
  const coarseCount = await getVertexCount(window, "Red Circle");
  expect(coarseCount).toBeGreaterThan(0);

  await presetSelect.selectOption("fine");
  await window.locator(".auto-mesh-btn").first().click();
  const fineCount = await getVertexCount(window, "Red Circle");
  expect(fineCount).toBeGreaterThanOrEqual(coarseCount);
});

test("tool state stays consistent when switching between select and mesh tools", async ({
  window,
}) => {
  const selectBtn = selectToolButton(window);
  const meshBtn = meshToolButton(window);

  await expect(selectBtn).toHaveClass(/active/);
  await expect(meshBtn).not.toHaveClass(/active/);

  await selectLayer(window, "Red Circle");
  await meshBtn.click();
  await expect(meshBtn).toHaveClass(/active/);
  await expect(selectBtn).not.toHaveClass(/active/);

  await selectBtn.click();
  await expect(selectBtn).toHaveClass(/active/);
  await expect(meshBtn).not.toHaveClass(/active/);
});

test("keyboard V exits mesh mode back to select", async ({ window }) => {
  await enterMeshEditMode(window, "Red Circle");

  const meshBtn = meshToolButton(window);
  await expect(meshBtn).toHaveClass(/active/);

  await window.locator(".app").click();
  await window.keyboard.press("v");

  const selectBtn = selectToolButton(window);
  await expect(selectBtn).toHaveClass(/active/);
  await expect(meshBtn).not.toHaveClass(/active/);
});

test("manual grid divisions can be changed for grid-based meshes", async ({ window }) => {
  await enterMeshEditMode(window, "Background");

  const meshSection = window
    .locator(".properties-section")
    .filter({ hasText: MESH_SECTION_LABEL })
    .first();
  const divisionInputs = meshSection.locator(".prop-input-sm");
  const inputCount = await divisionInputs.count();

  if (inputCount >= 2) {
    const divXInput = divisionInputs.nth(0);
    await divXInput.fill("5");
    await divXInput.press("Enter");

    const divYInput = divisionInputs.nth(1);
    await divYInput.fill("4");
    await divYInput.press("Enter");

    const result = await window.evaluate(() => {
      const v = window.__vivi2d;
      if (!v) return null;
      const store = (v as any).useEditorStore;
      const project = store.getState().project;
      if (!project) return null;

      const bg = project.layers.find((layer: any) => layer.name === "Background");
      if (!bg || bg.kind !== "viviMesh") return null;
      return { divX: bg.mesh.divisionsX, divY: bg.mesh.divisionsY };
    });

    expect(result).toBeTruthy();
    expect(result!.divX).toBe(5);
    expect(result!.divY).toBe(4);
  } else {
    await expect(window.locator(".auto-mesh-select").first()).toBeVisible();
  }
});
