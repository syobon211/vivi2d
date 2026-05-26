import { expect, test } from "../fixtures";
import { addParameter } from "../helpers/operations";

const CONFIRM_BUTTON_LABEL = /OK|\u78ba\u8a8d|\u6c7a\u5b9a/;


async function waitForVivi2D(window: import("playwright").Page) {
  await expect(async () => {
    const ready = await window.evaluate(() => !!window.__vivi2d);
    expect(ready).toBe(true);
  }).toPass({ timeout: 10_000 });
}

async function getMachineData(
  window: import("playwright").Page,
  index: number,
): Promise<Record<string, unknown> | null> {
  return window.evaluate((i) => {
    const v = window.__vivi2d!;
    const store = v.useEditorStore as any;
    const machines = store.getState().project?.stateMachines ?? [];
    const m = machines[i];
    if (!m) return null;
    return {
      id: m.id,
      name: m.name,
      enabled: m.enabled,
      stateCount: m.states.length,
      transitionCount: m.transitions.length,
      initialStateId: m.initialStateId,
      states: m.states.map((s: any) => ({
        id: s.id,
        name: s.name,
        loop: s.loop,
        clipId: s.clipId,
      })),
      transitions: m.transitions.map((t: any) => ({
        id: t.id,
        fromStateId: t.fromStateId,
        toStateId: t.toStateId,
        conditionCount: t.conditions.length,
        priority: t.priority,
        transitionDuration: t.transitionDuration,
      })),
    };
  }, index);
}

test.beforeEach(async ({ window, loadTestPsd }) => {
  await window.setViewportSize({ width: 1920, height: 1080 });
  await loadTestPsd();
  await waitForVivi2D(window);
});

test("ステートマシンのフルライフサイクル: 追加→状態×3→遷移→条件→編集→削除", async ({
  window,
}) => {
  await addParameter(window, "速度");

  await window
    .locator(".sm-panel .physics-btn", {
      hasText: /ステートマシン追加|Add State Machine/,
    })
    .click();

  await expect(window.locator(".sm-group")).toBeVisible();
  let data = await getMachineData(window, 0);
  expect(data).toBeTruthy();
  expect(data!.stateCount).toBe(1);

  const nameInput = window.locator(".sm-group-name");
  await nameInput.fill("移動制御");
  data = await getMachineData(window, 0);
  expect(data!.name).toBe("移動制御");

  await window
    .locator(".sm-section .physics-btn-sm", { hasText: /状態追加|Add State/ })
    .first()
    .click();
  let stateInput = window.locator(".sm-add-form .sm-state-name");
  await stateInput.fill("walk");
  await window.locator(".sm-add-form .physics-btn-sm", { hasText: CONFIRM_BUTTON_LABEL }).click();

  await window
    .locator(".sm-section .physics-btn-sm", { hasText: /状態追加|Add State/ })
    .first()
    .click();
  stateInput = window.locator(".sm-add-form .sm-state-name");
  await stateInput.fill("run");
  await window.locator(".sm-add-form .physics-btn-sm", { hasText: CONFIRM_BUTTON_LABEL }).click();

  data = await getMachineData(window, 0);
  expect(data!.stateCount).toBe(3);

  const loopCheckboxes = window.locator(".sm-loop-toggle input");
  await loopCheckboxes.nth(1).check();

  data = await getMachineData(window, 0);
  expect((data!.states as any[])[1].loop).toBe(true);

  const walkState = window.locator(".sm-state").nth(1);
  await walkState.locator(".physics-btn-sm").first().click();

  data = await getMachineData(window, 0);
  expect(data!.initialStateId).toBe((data!.states as any[])[1].id);

  await window
    .locator(".sm-section .physics-btn-sm", { hasText: /遷移追加|Add Transition/ })
    .click();
  const transitionForm = window.locator(".sm-section .sm-add-form").last();
  // from: idle (index 1 in select, since 0 is "*")
  await transitionForm.locator(".physics-select-sm").first().selectOption({ index: 1 });
  // to: walk (index 2)
  await transitionForm.locator(".physics-select-sm").nth(1).selectOption({ index: 2 });
  await transitionForm.locator(".physics-btn-sm", { hasText: CONFIRM_BUTTON_LABEL }).click();

  await expect(window.locator(".sm-transition")).toBeVisible();
  data = await getMachineData(window, 0);
  expect(data!.transitionCount).toBe(1);

  await window
    .locator(".sm-conditions .physics-btn-sm", { hasText: /条件追加|Add Condition/ })
    .click();
  await expect(window.locator(".sm-condition")).toBeVisible();

  data = await getMachineData(window, 0);
  expect((data!.transitions as any[])[0].conditionCount).toBe(1);

  const priorityInput = window
    .locator(".sm-transition-params input[type='number']")
    .first();
  await priorityInput.fill("5");

  const crossfadeInput = window
    .locator(".sm-transition-params input[type='number']")
    .nth(1);
  await crossfadeInput.fill("0.5");

  data = await getMachineData(window, 0);
  expect((data!.transitions as any[])[0].priority).toBe(5);
  expect((data!.transitions as any[])[0].transitionDuration).toBe(0.5);

  const toggle = window.locator(".sm-group-header .physics-toggle input");
  await toggle.uncheck();
  data = await getMachineData(window, 0);
  expect(data!.enabled).toBe(false);
  await toggle.check();
  data = await getMachineData(window, 0);
  expect(data!.enabled).toBe(true);

  const deleteButtons = window.locator(".sm-state .physics-btn-danger");
  await deleteButtons.first().click();

  data = await getMachineData(window, 0);
  expect(data!.stateCount).toBe(2); // walk, run
  expect(data!.transitionCount).toBe(0);

  await window.locator(".sm-group-header .physics-btn-danger").click();
  await expect(window.locator(".sm-group")).not.toBeVisible();

  const machineCount = await window.evaluate(() => {
    const v = window.__vivi2d!;
    return (v.useEditorStore as any).getState().project.stateMachines.length;
  });
  expect(machineCount).toBe(0);
});

test("複数ステートマシンの独立性: マシンAの操作がマシンBに影響しない", async ({
  window,
}) => {
  const addBtn = window.locator(".sm-panel .physics-btn", {
    hasText: /ステートマシン追加|Add State Machine/,
  });
  await addBtn.click();
  await addBtn.click();

  await expect(window.locator(".sm-group")).toHaveCount(2);

  await window.locator(".sm-group-name").first().fill("マシンA");
  await window.locator(".sm-group-name").nth(1).fill("マシンB");

  await window.evaluate(() => {
    const v = window.__vivi2d!;
    const store = v.useStateMachineStore as any;
    const editor = v.useEditorStore as any;
    const machineA = editor.getState().project.stateMachines[0];
    store.getState().addState(machineA.id, "walk");
    store.getState().addState(machineA.id, "run");
  });

  let dataA = await getMachineData(window, 0);
  let dataB = await getMachineData(window, 1);
  expect(dataA!.stateCount).toBe(3);
  expect(dataB!.stateCount).toBe(1);

  await window.locator(".sm-group-header .physics-toggle input").first().uncheck();
  dataA = await getMachineData(window, 0);
  dataB = await getMachineData(window, 1);
  expect(dataA!.enabled).toBe(false);
  expect(dataB!.enabled).toBe(true);

  await window.locator(".sm-group-header .physics-btn-danger").first().click();
  await expect(window.locator(".sm-group")).toHaveCount(1);

  dataB = await getMachineData(window, 0);
  expect(dataB!.name).toBe("マシンB");
  expect(dataB!.stateCount).toBe(1);
});

test("ワイルドカード遷移のワークフロー", async ({ window }) => {
  await window.evaluate(() => {
    const v = window.__vivi2d!;
    const store = v.useStateMachineStore as any;
    const s = store.getState();
    const machineId = s.addStateMachine("テスト");
    s.addState(machineId, "damage");
  });

  await expect(window.locator(".sm-group")).toBeVisible();

  await window
    .locator(".sm-section .physics-btn-sm", { hasText: /遷移追加|Add Transition/ })
    .click();
  const form = window.locator(".sm-section .sm-add-form").last();
  // from: * (default, index 0)
  // to: damage (index 2, since idle is index 1)
  await form.locator(".physics-select-sm").nth(1).selectOption({ index: 2 });
  await form.locator(".physics-btn-sm", { hasText: CONFIRM_BUTTON_LABEL }).click();

  await expect(window.locator(".sm-transition-label")).toContainText("*");

  const data = await getMachineData(window, 0);
  expect(data!.transitionCount).toBe(1);
  expect((data!.transitions as any[])[0].fromStateId).toBe("*");
});

test("遷移条件の編集ワークフロー: 追加→変更→削除", async ({ window }) => {
  await addParameter(window, "怒り");
  await addParameter(window, "喜び");

  await window.evaluate(() => {
    const v = window.__vivi2d!;
    const smStore = v.useStateMachineStore as any;
    const editorStore = v.useEditorStore as any;
    const s = smStore.getState();
    const machineId = s.addStateMachine("表情");
    const stateB = s.addState(machineId, "angry");
    const stateA = editorStore.getState().project.stateMachines[0].states[0].id;
    s.addTransition(machineId, stateA, stateB);
  });

  await expect(window.locator(".sm-transition")).toBeVisible();

  await window
    .locator(".sm-conditions .physics-btn-sm", { hasText: /条件追加|Add Condition/ })
    .click();
  await expect(window.locator(".sm-condition")).toHaveCount(1);

  await window
    .locator(".sm-conditions .physics-btn-sm", { hasText: /条件追加|Add Condition/ })
    .click();
  await expect(window.locator(".sm-condition")).toHaveCount(2);

  let data = await getMachineData(window, 0);
  expect((data!.transitions as any[])[0].conditionCount).toBe(2);

  await window.locator(".sm-condition .physics-btn-danger").first().click();
  await expect(window.locator(".sm-condition")).toHaveCount(1);

  data = await getMachineData(window, 0);
  expect((data!.transitions as any[])[0].conditionCount).toBe(1);

  await window.locator(".sm-condition .physics-btn-danger").click();
  await expect(window.locator(".sm-condition")).not.toBeVisible();

  data = await getMachineData(window, 0);
  expect((data!.transitions as any[])[0].conditionCount).toBe(0);
});
