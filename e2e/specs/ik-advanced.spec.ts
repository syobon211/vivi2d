import { expect, test } from "../fixtures";
import { addBone } from "../helpers/operations";

const INITIAL_BEND_PROFILE_LABEL = /Initial Bend Profile|\u521d\u671f\u66f2\u3052\u30d7\u30ed\u30d5\u30a1\u30a4\u30eb/;
const CUSTOM_PROFILE_LABEL = /Custom|\u30ab\u30b9\u30bf\u30e0/;

async function waitForVivi2D(window: import("playwright").Page) {
  await expect(async () => {
    const ready = await window.evaluate(() => !!window.__vivi2d);
    expect(ready).toBe(true);
  }).toPass({ timeout: 10_000 });
}

async function openIkAddForm(window: import("playwright").Page) {
  const openButton = window.locator(".ik-panel .physics-actions > .physics-btn");
  await openButton.scrollIntoViewIfNeeded();
  await openButton.click({ force: true });
  const form = window.locator(".ik-panel .form-anim-add-form");
  await expect(form).toBeVisible();
  return form;
}

function getCreateButton(form: import("playwright").Locator) {
  return form.locator(".form-anim-add-actions .physics-btn").first();
}

function getCancelButton(form: import("playwright").Locator) {
  return form.locator(".form-anim-add-actions .physics-btn").nth(1);
}

function getSolverSelect(form: import("playwright").Locator) {
  return form.locator(".form-anim-select").first();
}

function getInitialProfileSelect(form: import("playwright").Locator) {
  return form.getByLabel(INITIAL_BEND_PROFILE_LABEL);
}

async function seedRootBones(
  window: import("playwright").Page,
  names: string[] = ["Bone A", "Bone B"],
) {
  await window.evaluate((boneNames: string[]) => {
    const v = window.__vivi2d!;
    const boneStore = v.useBoneStore as any;
    boneNames.forEach((name, index) => {
      boneStore.getState().addRootBone(name, index * 80, 0);
    });
  }, names);
}

test.beforeEach(async ({ window, loadTestPsd }) => {
  await window.setViewportSize({ width: 1920, height: 1080 });
  await loadTestPsd();
  await waitForVivi2D(window);
});

test("IK controller add button toggles the add form", async ({ window }) => {
  const form = await openIkAddForm(window);

  await expect(form.locator(".form-anim-input")).toBeVisible();
  await expect(getSolverSelect(form)).toBeVisible();
  await expect(getInitialProfileSelect(form)).toBeVisible();

  const cancelButton = getCancelButton(form);
  await cancelButton.scrollIntoViewIfNeeded();
  await cancelButton.click({ force: true });
  await expect(form).not.toBeVisible();
});

test("UI form can add a two-bone IK controller with exactly two selected bones", async ({
  window,
}) => {
  await seedRootBones(window);

  const form = await openIkAddForm(window);
  await form.locator(".form-anim-input").fill("UI IK");

  const boneChecks = form.locator(".form-anim-param-check input[type='checkbox']");
  await expect(boneChecks).toHaveCount(2);
  await boneChecks.nth(0).check({ force: true });
  await boneChecks.nth(1).check({ force: true });

  const createButton = getCreateButton(form);
  await expect(createButton).toBeEnabled();
  await createButton.click({ force: true });

  const item = window.locator(".ik-item").filter({ hasText: "UI IK" });
  await expect(item).toBeVisible();
  await expect(item.locator(".ik-item-type")).toHaveText("twoBone");
  await expect(item.locator(".ik-profile-current")).toContainText(CUSTOM_PROFILE_LABEL);
});

test("two-bone creation stays disabled until exactly two bones are selected", async ({
  window,
}) => {
  await addBone(window, "Background");

  const form = await openIkAddForm(window);
  await form.locator(".form-anim-input").fill("Incomplete IK");

  const boneChecks = form.locator(".form-anim-param-check input[type='checkbox']");
  await expect(boneChecks).toHaveCount(1);
  await boneChecks.nth(0).check({ force: true });

  await expect(getCreateButton(form)).toBeDisabled();
});

test("store-created twoBone and ccd controllers render mode-specific UI", async ({
  window,
}) => {
  await window.evaluate(() => {
    const v = window.__vivi2d!;
    const ikStore = v.useIKControllerStore as any;
    ikStore.getState().addIKController("twoBone IK", "twoBone", [
      { boneId: "b1", minAngle: -Math.PI, maxAngle: Math.PI },
      { boneId: "b2", minAngle: -Math.PI, maxAngle: Math.PI },
    ]);
    ikStore.getState().addIKController("CCD IK", "ccd", [
      { boneId: "b3", minAngle: -Math.PI, maxAngle: Math.PI },
      { boneId: "b4", minAngle: -Math.PI, maxAngle: Math.PI },
    ]);
  });

  const twoBoneItem = window.locator(".ik-item").filter({ hasText: "twoBone IK" });
  await expect(twoBoneItem.locator(".ik-item-type")).toHaveText("twoBone");
  await expect(twoBoneItem.locator(".ik-num-input")).not.toBeVisible();

  const ccdItem = window.locator(".ik-item").filter({ hasText: "CCD IK" });
  await expect(ccdItem.locator(".ik-item-type")).toHaveText("ccd");
  await expect(ccdItem.locator(".ik-num-input")).toBeVisible();
});

test("UI form can switch solver to CCD and create a CCD controller", async ({
  window,
}) => {
  await seedRootBones(window);

  const form = await openIkAddForm(window);
  await form.locator(".form-anim-input").fill("CCD UI IK");

  const solverSelect = getSolverSelect(form);
  await solverSelect.selectOption({ value: "ccd" });
  await expect(solverSelect).toHaveValue("ccd");
  await expect(getInitialProfileSelect(form)).not.toBeVisible();

  const boneChecks = form.locator(".form-anim-param-check input[type='checkbox']");
  await expect(boneChecks).toHaveCount(2);
  await boneChecks.nth(0).check({ force: true });
  await boneChecks.nth(1).check({ force: true });

  const createButton = getCreateButton(form);
  await expect(createButton).toBeEnabled();
  await createButton.click({ force: true });

  const item = window.locator(".ik-item").filter({ hasText: "CCD UI IK" });
  await expect(item).toBeVisible();
  await expect(item.locator(".ik-item-type")).toHaveText("ccd");
  await expect(item.locator(".ik-num-input")).toBeVisible();
});

test("setting influence slider to zero updates the store", async ({ window }) => {
  await window.evaluate(() => {
    const v = window.__vivi2d!;
    const ikStore = v.useIKControllerStore as any;
    ikStore.getState().addIKController("Zero Influence IK", "twoBone", [
      { boneId: "b1", minAngle: -Math.PI, maxAngle: Math.PI },
      { boneId: "b2", minAngle: -Math.PI, maxAngle: Math.PI },
    ]);
  });

  const slider = window.locator(".ik-slider-row .prop-slider").first();
  await slider.scrollIntoViewIfNeeded();
  await slider.fill("0");

  const influence = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const store = v.useEditorStore as any;
    return store.getState().project?.ikControllers?.[0]?.influence;
  });
  expect(influence).toBe(0);
  await expect(window.locator(".prop-field-sm", { hasText: "0%" })).toBeVisible();
});

test("intermediate influence values update the UI", async ({ window }) => {
  await window.evaluate(() => {
    const v = window.__vivi2d!;
    const ikStore = v.useIKControllerStore as any;
    ikStore.getState().addIKController("Mid Influence IK", "twoBone", [
      { boneId: "b1", minAngle: -Math.PI, maxAngle: Math.PI },
      { boneId: "b2", minAngle: -Math.PI, maxAngle: Math.PI },
    ]);
  });

  const slider = window.locator(".ik-slider-row .prop-slider").first();
  await slider.scrollIntoViewIfNeeded();
  await slider.fill("0.75");
  await expect(window.locator(".prop-field-sm", { hasText: "75%" })).toBeVisible();
});

test("target coordinates are rendered from the store", async ({ window }) => {
  await window.evaluate(() => {
    const v = window.__vivi2d!;
    const ikStore = v.useIKControllerStore as any;
    const id = ikStore.getState().addIKController("Target IK", "twoBone", [
      { boneId: "b1", minAngle: -Math.PI, maxAngle: Math.PI },
      { boneId: "b2", minAngle: -Math.PI, maxAngle: Math.PI },
    ]);
    ikStore.getState().setTarget(id, 200, 300);
  });

  await expect(
    window.locator(".ik-target-info", { hasText: "(200, 300)" }),
  ).toBeVisible();
});

test("target coordinates update when the store changes", async ({ window }) => {
  const id = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const ikStore = v.useIKControllerStore as any;
    return ikStore.getState().addIKController("Reactive Target IK", "twoBone", [
      { boneId: "b1", minAngle: -Math.PI, maxAngle: Math.PI },
      { boneId: "b2", minAngle: -Math.PI, maxAngle: Math.PI },
    ]);
  });

  await expect(window.locator(".ik-target-info", { hasText: "(0, 0)" })).toBeVisible();

  await window.evaluate((controllerId: string) => {
    const v = window.__vivi2d!;
    const ikStore = v.useIKControllerStore as any;
    ikStore.getState().setTarget(controllerId, -50, 120);
  }, id);

  await expect(
    window.locator(".ik-target-info", { hasText: "(-50, 120)" }),
  ).toBeVisible();
});

test("bone chain names are displayed with the current arrow separator", async ({
  window,
}) => {
  await seedRootBones(window);

  const boneIds = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const store = v.useEditorStore as any;
    const project = store.getState().project;
    if (!project) return [];
    const result: string[] = [];

    function walk(layers: any[]) {
      for (const layer of layers) {
        if (layer.kind === "bone") result.push(layer.id);
        if (layer.children) walk(layer.children);
      }
    }

    walk(project.layers);
    return result;
  });

  if (boneIds.length >= 2) {
    await window.evaluate((ids: string[]) => {
      const v = window.__vivi2d!;
      const ikStore = v.useIKControllerStore as any;
      ikStore.getState().addIKController("Chain Display IK", "twoBone", [
        { boneId: ids[0], minAngle: -Math.PI, maxAngle: Math.PI },
        { boneId: ids[1], minAngle: -Math.PI, maxAngle: Math.PI },
      ]);
    }, boneIds);

    await expect(window.locator(".ik-chain", { hasText: " -> " })).toBeVisible();
  }
});

test("remove button deletes the controller from the list", async ({ window }) => {
  await window.evaluate(() => {
    const v = window.__vivi2d!;
    const ikStore = v.useIKControllerStore as any;
    ikStore.getState().addIKController("Remove Me IK", "twoBone", [
      { boneId: "b1", minAngle: -Math.PI, maxAngle: Math.PI },
      { boneId: "b2", minAngle: -Math.PI, maxAngle: Math.PI },
    ]);
  });

  await expect(
    window.locator(".ik-item-name", { hasText: "Remove Me IK" }),
  ).toBeVisible();

  const removeButton = window.locator(".ik-item-header .mesh-link-remove-btn").first();
  await removeButton.scrollIntoViewIfNeeded();
  await removeButton.click({ force: true });

  await expect(
    window.locator(".ik-item-name", { hasText: "Remove Me IK" }),
  ).not.toBeVisible();
});

test("remove button also deletes the controller from the store", async ({ window }) => {
  await window.evaluate(() => {
    const v = window.__vivi2d!;
    const ikStore = v.useIKControllerStore as any;
    ikStore.getState().addIKController("Store Remove IK", "ccd", [
      { boneId: "b1", minAngle: -Math.PI, maxAngle: Math.PI },
      { boneId: "b2", minAngle: -Math.PI, maxAngle: Math.PI },
    ]);
  });

  await expect(
    window.locator(".ik-item-name", { hasText: "Store Remove IK" }),
  ).toBeVisible();

  const removeButton = window.locator(".ik-item-header .mesh-link-remove-btn").first();
  await removeButton.scrollIntoViewIfNeeded();
  await removeButton.click({ force: true });

  const count = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const store = v.useEditorStore as any;
    return store.getState().project?.ikControllers?.length ?? 0;
  });
  expect(count).toBe(0);
});

test("multiple IK controllers can coexist in the list", async ({ window }) => {
  await window.evaluate(() => {
    const v = window.__vivi2d!;
    const ikStore = v.useIKControllerStore as any;
    ikStore.getState().addIKController("IK_A", "twoBone", [
      { boneId: "a1", minAngle: -Math.PI, maxAngle: Math.PI },
      { boneId: "a2", minAngle: -Math.PI, maxAngle: Math.PI },
    ]);
    ikStore.getState().addIKController("IK_B", "ccd", [
      { boneId: "b1", minAngle: -Math.PI, maxAngle: Math.PI },
      { boneId: "b2", minAngle: -Math.PI, maxAngle: Math.PI },
    ]);
    ikStore.getState().addIKController("IK_C", "twoBone", [
      { boneId: "c1", minAngle: -Math.PI, maxAngle: Math.PI },
      { boneId: "c2", minAngle: -Math.PI, maxAngle: Math.PI },
    ]);
  });

  await expect(window.locator(".ik-item-name", { hasText: "IK_A" })).toBeVisible();
  await expect(window.locator(".ik-item-name", { hasText: "IK_B" })).toBeVisible();
  await expect(window.locator(".ik-item-name", { hasText: "IK_C" })).toBeVisible();
  await expect(window.locator(".ik-item")).toHaveCount(3);
});

test("removing one controller leaves the others intact", async ({ window }) => {
  await window.evaluate(() => {
    const v = window.__vivi2d!;
    const ikStore = v.useIKControllerStore as any;
    ikStore.getState().addIKController("Keep IK 1", "twoBone", [
      { boneId: "a1", minAngle: -Math.PI, maxAngle: Math.PI },
      { boneId: "a2", minAngle: -Math.PI, maxAngle: Math.PI },
    ]);
    ikStore.getState().addIKController("Remove Only IK", "ccd", [
      { boneId: "b1", minAngle: -Math.PI, maxAngle: Math.PI },
      { boneId: "b2", minAngle: -Math.PI, maxAngle: Math.PI },
    ]);
    ikStore.getState().addIKController("Keep IK 2", "twoBone", [
      { boneId: "c1", minAngle: -Math.PI, maxAngle: Math.PI },
      { boneId: "c2", minAngle: -Math.PI, maxAngle: Math.PI },
    ]);
  });

  await expect(window.locator(".ik-item")).toHaveCount(3);

  const removeButton = window
    .locator(".ik-item")
    .filter({ hasText: "Remove Only IK" })
    .locator(".mesh-link-remove-btn");
  await removeButton.scrollIntoViewIfNeeded();
  await removeButton.click({ force: true });

  await expect(window.locator(".ik-item")).toHaveCount(2);
  await expect(window.locator(".ik-item-name", { hasText: "Keep IK 1" })).toBeVisible();
  await expect(window.locator(".ik-item-name", { hasText: "Keep IK 2" })).toBeVisible();
  await expect(
    window.locator(".ik-item-name", { hasText: "Remove Only IK" }),
  ).not.toBeVisible();
});

test("multiple controllers keep independent influence values", async ({ window }) => {
  await window.evaluate(() => {
    const v = window.__vivi2d!;
    const ikStore = v.useIKControllerStore as any;
    ikStore.getState().addIKController("Influence A", "twoBone", [
      { boneId: "a1", minAngle: -Math.PI, maxAngle: Math.PI },
      { boneId: "a2", minAngle: -Math.PI, maxAngle: Math.PI },
    ]);
    ikStore.getState().addIKController("Influence B", "ccd", [
      { boneId: "b1", minAngle: -Math.PI, maxAngle: Math.PI },
      { boneId: "b2", minAngle: -Math.PI, maxAngle: Math.PI },
    ]);
  });

  const firstSlider = window.locator(".ik-item").first().locator(".prop-slider");
  await firstSlider.scrollIntoViewIfNeeded();
  await firstSlider.fill("0.3");

  const secondSlider = window.locator(".ik-item").nth(1).locator(".prop-slider");
  await secondSlider.scrollIntoViewIfNeeded();
  await secondSlider.fill("0.8");

  const influences = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const store = v.useEditorStore as any;
    const controllers = store.getState().project?.ikControllers ?? [];
    return controllers.map((c: any) => c.influence);
  });

  expect(influences).toHaveLength(2);
  expect(influences[0]).toBeCloseTo(0.3, 1);
  expect(influences[1]).toBeCloseTo(0.8, 1);
});

test("CCD iteration count updates the store", async ({ window }) => {
  await window.evaluate(() => {
    const v = window.__vivi2d!;
    const ikStore = v.useIKControllerStore as any;
    ikStore.getState().addIKController("CCD Iteration IK", "ccd", [
      { boneId: "b1", minAngle: -Math.PI, maxAngle: Math.PI },
      { boneId: "b2", minAngle: -Math.PI, maxAngle: Math.PI },
    ]);
  });

  const iterationInput = window.locator(".ik-item-details .ik-num-input").first();
  await iterationInput.scrollIntoViewIfNeeded();
  await iterationInput.fill("25");

  const iterations = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const store = v.useEditorStore as any;
    return store.getState().project?.ikControllers?.[0]?.maxIterations;
  });

  expect(iterations).toBe(25);
});

test("parameter mapping count is displayed in the UI", async ({ window }) => {
  await window.evaluate(() => {
    const v = window.__vivi2d!;
    const ikStore = v.useIKControllerStore as any;
    const id = ikStore.getState().addIKController("Mapped IK", "twoBone", [
      { boneId: "b1", minAngle: -Math.PI, maxAngle: Math.PI },
      { boneId: "b2", minAngle: -Math.PI, maxAngle: Math.PI },
    ]);
    ikStore.getState().addParameterMapping(id, {
      parameterId: "p1",
      sourceType: "angle",
      boneIndex: 0,
      scale: 1,
      offset: 0,
    });
    ikStore.getState().addParameterMapping(id, {
      parameterId: "p2",
      sourceType: "angle",
      boneIndex: 1,
      scale: 1,
      offset: 0,
    });
  });

  await expect(
    window.locator(".ik-mapping-count").filter({ hasText: /2/ }),
  ).toBeVisible();
});
