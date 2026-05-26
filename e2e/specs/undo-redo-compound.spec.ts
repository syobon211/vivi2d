import { expect, test } from "../fixtures";
import { addBone, addParameter } from "../helpers/operations";

test.beforeEach(async ({ window, loadTestPsd }) => {
  await window.setViewportSize({ width: 1920, height: 1080 });
  await loadTestPsd();
});

function undoButton(window: import("playwright").Page) {
  return window.getByTitle(/Undo|元に戻す/).first();
}

function redoButton(window: import("playwright").Page) {
  return window.getByTitle(/Redo|やり直し/).first();
}

test("restores a mixed sequence of edits after three undos", async ({ window }) => {
  const initial = await window.evaluate(() => {
    const vivi = window.__vivi2d!;
    const project = (vivi.useEditorStore as any).getState().project;
    return {
      layerNames: project.layers.map((layer: { name: string }) => layer.name),
      parameterCount: project.parameters.length,
    };
  });

  await window.locator(".layer-item").first().click();
  await window.locator(".app").focus();
  await window.keyboard.press("Control+ArrowDown");
  await window.waitForTimeout(600);

  await addBone(window, "Red Circle");
  await window.waitForTimeout(600);
  await addParameter(window, "Compound Param");

  await window.keyboard.press("Control+z");
  await window.keyboard.press("Control+z");
  await window.keyboard.press("Control+z");

  const restored = await window.evaluate(() => {
    const vivi = window.__vivi2d!;
    const project = (vivi.useEditorStore as any).getState().project;
    return {
      layerNames: project.layers.map((layer: { name: string }) => layer.name),
      parameterCount: project.parameters.length,
    };
  });

  expect(restored.parameterCount).toBe(initial.parameterCount);
  expect(restored.layerNames).toEqual(initial.layerNames);
});

test("redo restores three independent edits after a deep undo", async ({ window }) => {
  await addParameter(window, "P1");
  await window.waitForTimeout(600);
  await addParameter(window, "P2");
  await window.waitForTimeout(600);
  await addParameter(window, "P3");

  const afterCreate = await window.evaluate(() => {
    const vivi = window.__vivi2d!;
    return (vivi.useEditorStore as any)
      .getState()
      .project.parameters.map((parameter: { name: string }) => parameter.name);
  });
  expect(afterCreate).toEqual(expect.arrayContaining(["P1", "P2", "P3"]));

  await window.keyboard.press("Control+z");
  await window.keyboard.press("Control+z");
  await window.keyboard.press("Control+z");
  await expect(redoButton(window)).toBeEnabled();

  await window.keyboard.press("Control+Shift+z");
  await window.keyboard.press("Control+Shift+z");
  await window.keyboard.press("Control+Shift+z");

  const afterRedo = await window.evaluate(() => {
    const vivi = window.__vivi2d!;
    return (vivi.useEditorStore as any)
      .getState()
      .project.parameters.map((parameter: { name: string }) => parameter.name);
  });
  expect(afterRedo).toEqual(afterCreate);
});

test("undo and redo bump projectStructureVersion", async ({ window }) => {
  await addBone(window, "Red Circle");

  const versionBeforeUndo = await window.evaluate(() => {
    const vivi = window.__vivi2d!;
    return (vivi.useEditorStore as any).getState().projectStructureVersion;
  });

  await window.keyboard.press("Control+z");
  const versionAfterUndo = await window.evaluate(() => {
    const vivi = window.__vivi2d!;
    return (vivi.useEditorStore as any).getState().projectStructureVersion;
  });
  expect(versionAfterUndo).toBeGreaterThan(versionBeforeUndo);

  await window.keyboard.press("Control+Shift+z");
  const versionAfterRedo = await window.evaluate(() => {
    const vivi = window.__vivi2d!;
    return (vivi.useEditorStore as any).getState().projectStructureVersion;
  });
  expect(versionAfterRedo).toBeGreaterThan(versionAfterUndo);
});

test("keyboard and buttons keep undo/redo state coherent", async ({ window }) => {
  await addParameter(window, "mixed");

  await window.keyboard.press("Control+z");
  await expect(undoButton(window)).toBeDisabled();
  await expect(redoButton(window)).toBeEnabled();

  await redoButton(window).click();
  await expect(redoButton(window)).toBeDisabled();
  await expect(undoButton(window)).toBeEnabled();

  await undoButton(window).click();
  await expect(redoButton(window)).toBeEnabled();

  await window.keyboard.press("Control+Shift+z");
  const finalCount = await window.evaluate(() => {
    const vivi = window.__vivi2d!;
    return (vivi.useEditorStore as any).getState().project.parameters.length;
  });
  expect(finalCount).toBe(1);
});

test("a new edit clears the redo stack after undo", async ({ window }) => {
  await addParameter(window, "A");
  await window.waitForTimeout(600);
  await addParameter(window, "B");
  await window.waitForTimeout(600);
  await addParameter(window, "C");

  await window.keyboard.press("Control+z");
  await window.keyboard.press("Control+z");
  await expect(redoButton(window)).toBeEnabled();

  await window.waitForTimeout(600);
  await addParameter(window, "D");
  await expect(redoButton(window)).toBeDisabled();

  const names = await window.evaluate(() => {
    const vivi = window.__vivi2d!;
    return (vivi.useEditorStore as any)
      .getState()
      .project.parameters.map((parameter: { name: string }) => parameter.name);
  });
  expect(names).toContain("A");
  expect(names).toContain("D");
  expect(names).not.toContain("B");
  expect(names).not.toContain("C");
});

test("repeated no-op undo and redo cycles keep the app stable", async ({ window }) => {
  await window.locator(".app").focus();
  for (let i = 0; i < 10; i++) {
    await window.keyboard.press("Control+z");
    await window.keyboard.press("Control+Shift+z");
  }
  await expect(window.locator(".workspace")).toBeVisible();
  const count = await window.evaluate(() => {
    const vivi = window.__vivi2d!;
    return (vivi.useEditorStore as any).getState().project.parameters.length;
  });
  expect(count).toBe(0);
});

test("selection changes do not block undo for the last edit", async ({ window }) => {
  await addParameter(window, "selection-only");

  await window.locator(".layer-item").nth(1).click();
  await window.keyboard.press("Control+z");

  const count = await window.evaluate(() => {
    const vivi = window.__vivi2d!;
    return (vivi.useEditorStore as any).getState().project.parameters.length;
  });
  expect(count).toBe(0);
});
