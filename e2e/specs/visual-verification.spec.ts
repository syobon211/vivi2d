import path from "node:path";
import { expect, test } from "../fixtures";
import { addParameter } from "../helpers/operations";


const SCREENSHOT_DIR = path.resolve(import.meta.dirname, "../../test-screenshots");
const CONFIRM_BUTTON_LABEL = /OK|\u78ba\u8a8d|\u6c7a\u5b9a/;

async function waitForVivi2D(window: import("playwright").Page) {
  await expect(async () => {
    const ready = await window.evaluate(() => !!window.__vivi2d);
    expect(ready).toBe(true);
  }).toPass({ timeout: 10_000 });
}

test.beforeEach(async ({ window, loadTestPsd }) => {
  await window.setViewportSize({ width: 1920, height: 1080 });
  await loadTestPsd();
  await waitForVivi2D(window);
});

test("コライダーパネルの視覚検証", async ({ window }) => {
  await window.locator(".collider-panel").screenshot({
    path: path.join(SCREENSHOT_DIR, "01-collider-panel-empty.png"),
  });

  await window
    .locator(".collider-actions .physics-btn", { hasText: /矩形追加|Add Rectangle/ })
    .click();
  const nameInput = window.locator(".collider-name-input");
  await nameInput.fill("頭エリア");
  await window.locator(".param-action-btn", { hasText: CONFIRM_BUTTON_LABEL }).click();
  await expect(window.locator(".collider-item")).toBeVisible();

  await window.locator(".collider-panel").screenshot({
    path: path.join(SCREENSHOT_DIR, "02-collider-rect-added.png"),
  });

  await window
    .locator(".collider-actions .physics-btn", { hasText: /円追加|Add Circle/ })
    .click();
  const nameInput2 = window.locator(".collider-name-input");
  await nameInput2.fill("ほっぺた");
  await window.locator(".param-action-btn", { hasText: CONFIRM_BUTTON_LABEL }).click();

  await window.locator(".collider-panel").screenshot({
    path: path.join(SCREENSHOT_DIR, "03-collider-circle-added.png"),
  });

  await window.locator(".collider-item").first().click();
  await expect(window.locator(".collider-item").first()).toHaveClass(/collider-selected/);

  await window.locator(".collider-panel").screenshot({
    path: path.join(SCREENSHOT_DIR, "04-collider-selected.png"),
  });

  await window.locator(".collider-toggle input").first().uncheck();

  await window.locator(".collider-panel").screenshot({
    path: path.join(SCREENSHOT_DIR, "05-collider-disabled.png"),
  });

  await window.screenshot({
    path: path.join(SCREENSHOT_DIR, "06-full-window-with-colliders.png"),
  });
});

test("ステートマシンパネルの視覚検証", async ({ window }) => {
  await window
    .locator(".sm-panel .physics-btn", {
      hasText: /ステートマシン追加|Add State Machine/,
    })
    .click();
  await expect(window.locator(".sm-group")).toBeVisible();

  await window.locator(".sm-panel").screenshot({
    path: path.join(SCREENSHOT_DIR, "07-sm-added.png"),
  });

  await window
    .locator(".sm-section .physics-btn-sm", { hasText: /状態追加|Add State/ })
    .first()
    .click();
  const stateInput = window.locator(".sm-add-form .sm-state-name");
  await stateInput.fill("walk");
  await window.locator(".sm-add-form .physics-btn-sm", { hasText: CONFIRM_BUTTON_LABEL }).click();

  await window.locator(".sm-panel").screenshot({
    path: path.join(SCREENSHOT_DIR, "08-sm-state-added.png"),
  });

  await window.evaluate(() => {
    const v = window.__vivi2d!;
    const smStore = v.useStateMachineStore as any;
    const editorStore = v.useEditorStore as any;
    const machine = editorStore.getState().project.stateMachines[0];
    const stateA = machine.states[0].id;
    const stateB = machine.states[1].id;
    smStore.getState().addTransition(machine.id, stateA, stateB);
  });

  await expect(window.locator(".sm-transition")).toBeVisible();

  await window.locator(".sm-panel").screenshot({
    path: path.join(SCREENSHOT_DIR, "09-sm-transition-added.png"),
  });

  await addParameter(window, "速度");

  await window
    .locator(".sm-conditions .physics-btn-sm", { hasText: /条件追加|Add Condition/ })
    .click();
  await expect(window.locator(".sm-condition")).toBeVisible();

  await window.locator(".sm-panel").screenshot({
    path: path.join(SCREENSHOT_DIR, "10-sm-condition-added.png"),
  });

  await window.screenshot({
    path: path.join(SCREENSHOT_DIR, "11-full-window-with-sm.png"),
  });
});
