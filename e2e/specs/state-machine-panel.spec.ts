import { expect, test } from "../fixtures";
import { addParameter } from "../helpers/operations";

const CONFIRM_BUTTON_LABEL = /OK|\u78ba\u8a8d|\u6c7a\u5b9a/;


async function waitForVivi2D(window: import("playwright").Page) {
  await expect(async () => {
    const ready = await window.evaluate(() => !!window.__vivi2d);
    expect(ready).toBe(true);
  }).toPass({ timeout: 10_000 });
}

async function getMachineCount(window: import("playwright").Page): Promise<number> {
  return window.evaluate(() => {
    const v = window.__vivi2d!;
    const store = v.useEditorStore as any;
    return store.getState().project?.stateMachines?.length ?? 0;
  });
}

async function addMachine(
  window: import("playwright").Page,
  name: string,
): Promise<string> {
  return window.evaluate((n) => {
    const v = window.__vivi2d!;
    const store = v.useStateMachineStore as any;
    return store.getState().addStateMachine(n) as string;
  }, name);
}

async function getMachineData(
  window: import("playwright").Page,
  machineId: string,
): Promise<Record<string, unknown> | null> {
  return window.evaluate((id) => {
    const v = window.__vivi2d!;
    const store = v.useEditorStore as any;
    const machines = store.getState().project?.stateMachines ?? [];
    const m = machines.find((m: any) => m.id === id);
    if (!m) return null;
    return {
      name: m.name,
      enabled: m.enabled,
      stateCount: m.states.length,
      transitionCount: m.transitions.length,
      initialStateId: m.initialStateId,
      states: m.states.map((s: any) => ({ id: s.id, name: s.name, loop: s.loop })),
      transitions: m.transitions.map((t: any) => ({
        id: t.id,
        fromStateId: t.fromStateId,
        toStateId: t.toStateId,
        conditionCount: t.conditions.length,
        priority: t.priority,
        transitionDuration: t.transitionDuration,
      })),
    };
  }, machineId);
}

test.beforeEach(async ({ window, loadTestPsd }) => {
  await window.setViewportSize({ width: 1920, height: 1080 });
  await loadTestPsd();
  await waitForVivi2D(window);
});


test("ステートマシンパネルが表示される", async ({ window }) => {
  const panel = window.locator(".sm-panel");
  await expect(panel).toBeVisible();
  await expect(panel.locator(".panel-header")).toContainText(
    /ステートマシン|State Machine/,
  );
});


test("ステートマシンを追加できる", async ({ window }) => {
  expect(await getMachineCount(window)).toBe(0);

  await window
    .locator(".sm-panel .physics-btn", {
      hasText: /ステートマシン追加|Add State Machine/,
    })
    .click();

  expect(await getMachineCount(window)).toBe(1);

  await expect(window.locator(".sm-group")).toBeVisible();

  await expect(window.locator(".sm-state-name")).toBeVisible();
});

test("複数ステートマシンを追加できる", async ({ window }) => {
  await window
    .locator(".sm-panel .physics-btn", {
      hasText: /ステートマシン追加|Add State Machine/,
    })
    .click();
  await window
    .locator(".sm-panel .physics-btn", {
      hasText: /ステートマシン追加|Add State Machine/,
    })
    .click();

  expect(await getMachineCount(window)).toBe(2);
  await expect(window.locator(".sm-group")).toHaveCount(2);
});


test("ステートマシンを削除できる", async ({ window }) => {
  await addMachine(window, "削除対象");
  await expect(window.locator(".sm-group")).toBeVisible();

  await window.locator(".sm-group-header .physics-btn-danger").click();

  await expect(window.locator(".sm-group")).not.toBeVisible();
  expect(await getMachineCount(window)).toBe(0);
});


test("ステートマシンの有効/無効を切り替えられる", async ({ window }) => {
  const id = await addMachine(window, "トグル対象");

  const toggle = window.locator(".sm-group-header .physics-toggle input");
  await expect(toggle).toBeChecked();

  await toggle.uncheck();
  let data = await getMachineData(window, id);
  expect(data!.enabled).toBe(false);

  await toggle.check();
  data = await getMachineData(window, id);
  expect(data!.enabled).toBe(true);
});


test("ステートマシン名を変更できる", async ({ window }) => {
  const id = await addMachine(window, "旧名");

  const nameInput = window.locator(".sm-group-name");
  await nameInput.fill("新名");

  const data = await getMachineData(window, id);
  expect(data!.name).toBe("新名");
});


test("状態を追加できる", async ({ window }) => {
  const id = await addMachine(window, "テスト");

  let data = await getMachineData(window, id);
  expect(data!.stateCount).toBe(1);

  await window
    .locator(".sm-section .physics-btn-sm", {
      hasText: /状態追加|Add State/,
    })
    .first()
    .click();

  const nameInput = window.locator(".sm-add-form .sm-state-name");
  await expect(nameInput).toBeVisible();

  await nameInput.fill("walk");
  await window.locator(".sm-add-form .physics-btn-sm", { hasText: CONFIRM_BUTTON_LABEL }).click();

  data = await getMachineData(window, id);
  expect(data!.stateCount).toBe(2);
});

test("状態追加をEscでキャンセルできる", async ({ window }) => {
  const id = await addMachine(window, "テスト");

  await window
    .locator(".sm-section .physics-btn-sm", {
      hasText: /状態追加|Add State/,
    })
    .first()
    .click();

  const nameInput = window.locator(".sm-add-form .sm-state-name");
  await nameInput.fill("キャンセル");
  await nameInput.press("Escape");

  await expect(nameInput).not.toBeVisible();
  const data = await getMachineData(window, id);
  expect(data!.stateCount).toBe(1);
});

test("状態を削除できる", async ({ window }) => {
  const id = await addMachine(window, "テスト");

  await window.evaluate((machineId) => {
    const v = window.__vivi2d!;
    const store = v.useStateMachineStore as any;
    store.getState().addState(machineId, "walk");
  }, id);

  let data = await getMachineData(window, id);
  expect(data!.stateCount).toBe(2);

  const deleteButtons = window.locator(".sm-state .physics-btn-danger");
  await deleteButtons.nth(1).click();

  data = await getMachineData(window, id);
  expect(data!.stateCount).toBe(1);
});

test("状態名を変更できる", async ({ window }) => {
  const id = await addMachine(window, "テスト");

  const stateNameInput = window.locator(".sm-state .sm-state-name").first();
  await stateNameInput.fill("待機");

  const data = await getMachineData(window, id);
  expect((data!.states as any[])[0].name).toBe("待機");
});

test("初期状態を変更できる", async ({ window }) => {
  const id = await addMachine(window, "テスト");

  await window.evaluate((machineId) => {
    const v = window.__vivi2d!;
    const store = v.useStateMachineStore as any;
    store.getState().addState(machineId, "walk");
  }, id);

  await expect(window.locator(".sm-initial-badge")).toBeVisible();

  const starBtn = window.locator(".sm-state").nth(1).locator(".physics-btn-sm").first();
  await starBtn.click();

  const data = await getMachineData(window, id);
  const states = data!.states as any[];
  expect(data!.initialStateId).toBe(states[1].id);
});


test("遷移を追加できる", async ({ window }) => {
  const id = await addMachine(window, "テスト");

  await window.evaluate((machineId) => {
    const v = window.__vivi2d!;
    const store = v.useStateMachineStore as any;
    store.getState().addState(machineId, "walk");
  }, id);

  await window
    .locator(".sm-section .physics-btn-sm", {
      hasText: /遷移追加|Add Transition/,
    })
    .click();

  const form = window.locator(".sm-section .sm-add-form").last();
  await expect(form).toBeVisible();

  const toSelect = form.locator(".physics-select-sm").nth(1);
  await toSelect.selectOption({ index: 1 });
  await form.locator(".physics-btn-sm", { hasText: CONFIRM_BUTTON_LABEL }).click();

  await expect(window.locator(".sm-transition")).toBeVisible();
  const data = await getMachineData(window, id);
  expect(data!.transitionCount).toBe(1);
});

test("遷移を削除できる", async ({ window }) => {
  const id = await addMachine(window, "テスト");

  await window.evaluate((machineId) => {
    const v = window.__vivi2d!;
    const store = v.useStateMachineStore as any;
    const s = store.getState();
    const stateB = s.addState(machineId, "walk");
    const editorStore = v.useEditorStore as any;
    const stateA = editorStore
      .getState()
      .project.stateMachines.find((m: any) => m.id === machineId).states[0].id;
    s.addTransition(machineId, stateA, stateB);
  }, id);

  await expect(window.locator(".sm-transition")).toBeVisible();

  await window.locator(".sm-transition-header .physics-btn-danger").click();

  await expect(window.locator(".sm-transition")).not.toBeVisible();
  const data = await getMachineData(window, id);
  expect(data!.transitionCount).toBe(0);
});


test("遷移条件を追加できる", async ({ window }) => {
  const id = await addMachine(window, "テスト");

  await addParameter(window, "速度");

  await window.evaluate((machineId) => {
    const v = window.__vivi2d!;
    const store = v.useStateMachineStore as any;
    const s = store.getState();
    const stateB = s.addState(machineId, "walk");
    const editorStore = v.useEditorStore as any;
    const stateA = editorStore
      .getState()
      .project.stateMachines.find((m: any) => m.id === machineId).states[0].id;
    s.addTransition(machineId, stateA, stateB);
  }, id);

  await expect(window.locator(".sm-transition")).toBeVisible();

  await window
    .locator(".sm-conditions .physics-btn-sm", {
      hasText: /条件追加|Add Condition/,
    })
    .click();

  await expect(window.locator(".sm-condition")).toBeVisible();

  const data = await getMachineData(window, id);
  const transitions = data!.transitions as any[];
  expect(transitions[0].conditionCount).toBe(1);
});

test("遷移条件を削除できる", async ({ window }) => {
  const id = await addMachine(window, "テスト");

  await window.evaluate((machineId) => {
    const v = window.__vivi2d!;
    const smStore = v.useStateMachineStore as any;
    const s = smStore.getState();
    const stateB = s.addState(machineId, "walk");
    const editorStore = v.useEditorStore as any;
    const machine = editorStore
      .getState()
      .project.stateMachines.find((m: any) => m.id === machineId);
    const stateA = machine.states[0].id;
    const tid = s.addTransition(machineId, stateA, stateB);
    s.addCondition(machineId, tid, {
      parameterId: "dummy",
      operator: ">",
      threshold: 0.5,
    });
  }, id);

  await expect(window.locator(".sm-condition")).toBeVisible();

  await window.locator(".sm-condition .physics-btn-danger").click();

  await expect(window.locator(".sm-condition")).not.toBeVisible();

  const data = await getMachineData(window, id);
  const transitions = data!.transitions as any[];
  expect(transitions[0].conditionCount).toBe(0);
});


test("遷移の優先度を変更できる", async ({ window }) => {
  const id = await addMachine(window, "テスト");

  await window.evaluate((machineId) => {
    const v = window.__vivi2d!;
    const store = v.useStateMachineStore as any;
    const s = store.getState();
    const stateB = s.addState(machineId, "walk");
    const editorStore = v.useEditorStore as any;
    const stateA = editorStore
      .getState()
      .project.stateMachines.find((m: any) => m.id === machineId).states[0].id;
    s.addTransition(machineId, stateA, stateB);
  }, id);

  const priorityInput = window
    .locator(".sm-transition-params input[type='number']")
    .first();
  await priorityInput.fill("10");

  const data = await getMachineData(window, id);
  const transitions = data!.transitions as any[];
  expect(transitions[0].priority).toBe(10);
});


test("状態のループ設定を変更できる", async ({ window }) => {
  const id = await addMachine(window, "テスト");

  const loopCheckbox = window.locator(".sm-loop-toggle input");
  const initialChecked = await loopCheckbox.isChecked();

  await loopCheckbox.click();

  const data = await getMachineData(window, id);
  const states = data!.states as any[];
  expect(states[0].loop).toBe(!initialChecked);
});
