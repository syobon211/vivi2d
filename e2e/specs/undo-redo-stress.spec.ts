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

test("stays stable through 100 undo/redo cycles on a single edit", async ({ window }) => {
  await addParameter(window, "stress-single");

  const baseline = await window.evaluate(() => {
    const vivi = window.__vivi2d!;
    return (vivi.useEditorStore as any)
      .getState()
      .project.parameters.map((parameter: { name: string }) => parameter.name);
  });
  expect(baseline).toContain("stress-single");

  await window.locator(".app").focus();
  for (let i = 0; i < 100; i++) {
    await window.keyboard.press("Control+z");
    await window.keyboard.press("Control+Shift+z");
  }

  const finalNames = await window.evaluate(() => {
    const vivi = window.__vivi2d!;
    return (vivi.useEditorStore as any)
      .getState()
      .project.parameters.map((parameter: { name: string }) => parameter.name);
  });
  expect(finalNames).toEqual(baseline);
  await expect(redoButton(window)).toBeDisabled();
  await expect(undoButton(window)).toBeEnabled();
});

test("keeps project state coherent through 30 compound undo/redo cycles", async ({
  window,
}) => {
  await addBone(window, "Red Circle");
  await window.waitForTimeout(600);
  await addParameter(window, "stress-compound");

  const baseline = await window.evaluate(() => {
    const vivi = window.__vivi2d!;
    const state = (vivi.useEditorStore as any).getState();
    return {
      parameterCount: state.project.parameters.length,
      structureVersion: state.projectStructureVersion,
    };
  });

  await window.locator(".app").focus();
  for (let i = 0; i < 30; i++) {
    await window.keyboard.press("Control+z");
    await window.keyboard.press("Control+z");
    await window.keyboard.press("Control+Shift+z");
    await window.keyboard.press("Control+Shift+z");
  }

  const finalState = await window.evaluate(() => {
    const vivi = window.__vivi2d!;
    const state = (vivi.useEditorStore as any).getState();
    return {
      parameterCount: state.project.parameters.length,
      structureVersion: state.projectStructureVersion,
    };
  });

  expect(finalState.parameterCount).toBe(baseline.parameterCount);
  expect(finalState.structureVersion).toBeGreaterThan(baseline.structureVersion);
  await expect(window.locator(".workspace")).toBeVisible();
});

test("100 no-op undo presses keep the app usable", async ({ window }) => {
  await window.locator(".app").focus();
  for (let i = 0; i < 100; i++) {
    await window.keyboard.press("Control+z");
  }

  const count = await window.evaluate(() => {
    const vivi = window.__vivi2d!;
    return (vivi.useEditorStore as any).getState().project.parameters.length;
  });
  expect(count).toBe(0);
  await expect(undoButton(window)).toBeDisabled();
  await expect(window.locator(".workspace")).toBeVisible();
});
