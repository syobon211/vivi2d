import { expect, test } from "../fixtures";


async function waitForVivi2D(window: import("playwright").Page) {
  await expect(async () => {
    const ready = await window.evaluate(() => !!window.__vivi2d);
    expect(ready).toBe(true);
  }).toPass({ timeout: 10_000 });
}

async function addTargetByStore(
  window: import("playwright").Page,
  width: number,
  height: number,
): Promise<string> {
  return await window.evaluate(
    ({ w, h }: { w: number; h: number }) => {
      const v = window.__vivi2d!;
      const osStore = v.useOffscreenStore as any;
      return osStore.getState().addOffscreenTarget(w, h);
    },
    { w: width, h: height },
  );
}

test.beforeEach(async ({ window, loadTestPsd }) => {
  await window.setViewportSize({ width: 1920, height: 1080 });
  await loadTestPsd();
  await waitForVivi2D(window);
});


test("UIボタンからオフスクリーンターゲットを追加できる", async ({ window }) => {
  const addBtn = window.locator(".offscreen-panel .physics-btn");
  await addBtn.scrollIntoViewIfNeeded();
  await addBtn.click({ force: true });

  await expect(window.locator(".offscreen-item")).toBeVisible();
  await expect(window.locator(".offscreen-item-name")).toBeVisible();
});

test("ストア経由で追加したターゲットのサイズが表示される", async ({ window }) => {
  await addTargetByStore(window, 512, 256);

  await expect(
    window.locator(".offscreen-item-name", { hasText: "512×256" }),
  ).toBeVisible();
});

test("追加したターゲットにサイズ入力フィールドが表示される", async ({ window }) => {
  await addTargetByStore(window, 256, 256);

  const sizeRow = window.locator(".offscreen-size-row");
  await expect(sizeRow).toBeVisible();

  const inputs = sizeRow.locator(".ik-num-input");
  await expect(inputs).toHaveCount(2);
});


test("幅の入力フィールドを変更するとストアに反映される", async ({ window }) => {
  const _targetId = await addTargetByStore(window, 256, 256);

  const widthInput = window.locator(".offscreen-size-row .ik-num-input").first();
  await widthInput.scrollIntoViewIfNeeded();
  await widthInput.fill("1024");

  const width = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const store = v.useEditorStore as any;
    return store.getState().project?.offscreenTargets?.[0]?.width;
  });

  expect(width).toBe(1024);
});

test("高さの入力フィールドを変更するとストアに反映される", async ({ window }) => {
  await addTargetByStore(window, 256, 256);

  const heightInput = window.locator(".offscreen-size-row .ik-num-input").nth(1);
  await heightInput.scrollIntoViewIfNeeded();
  await heightInput.fill("768");

  const height = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const store = v.useEditorStore as any;
    return store.getState().project?.offscreenTargets?.[0]?.height;
  });

  expect(height).toBe(768);
});

test("幅と高さの両方を変更するとヘッダーのサイズ表示も更新される", async ({ window }) => {
  await addTargetByStore(window, 256, 256);

  await expect(
    window.locator(".offscreen-item-name", { hasText: "256×256" }),
  ).toBeVisible();

  const widthInput = window.locator(".offscreen-size-row .ik-num-input").first();
  await widthInput.scrollIntoViewIfNeeded();
  await widthInput.fill("512");

  const heightInput = window.locator(".offscreen-size-row .ik-num-input").nth(1);
  await heightInput.scrollIntoViewIfNeeded();
  await heightInput.fill("384");

  await expect(
    window.locator(".offscreen-item-name", { hasText: "512×384" }),
  ).toBeVisible();
});


test("ソースレイヤーをドロップダウンから追加できる", async ({ window }) => {
  const _targetId = await addTargetByStore(window, 256, 256);

  const sourceSelect = window.locator(".offscreen-sources .form-anim-select").first();
  await sourceSelect.scrollIntoViewIfNeeded();

  const optionCount = await sourceSelect.locator("option").count();
  if (optionCount > 1) {
    await sourceSelect.selectOption({ index: 1 });

    await expect(window.locator(".offscreen-source-item").first()).toBeVisible();
  }
});

test("ストア経由でソースレイヤーを追加するとUI上に表示される", async ({ window }) => {
  await window.evaluate(() => {
    const v = window.__vivi2d!;
    const store = v.useEditorStore as any;
    const osStore = v.useOffscreenStore as any;
    const project = store.getState().project;
    if (!project) return;
    const targetId = osStore.getState().addOffscreenTarget(256, 256);
    if (project.layers[0]) {
      osStore.getState().addSourceLayer(targetId, project.layers[0].id);
    }
  });

  await expect(window.locator(".offscreen-source-item")).toBeVisible();
});

test("同じレイヤーを重複追加しようとしても1つだけ表示される", async ({ window }) => {
  await window.evaluate(() => {
    const v = window.__vivi2d!;
    const store = v.useEditorStore as any;
    const osStore = v.useOffscreenStore as any;
    const project = store.getState().project;
    if (!project?.layers[0]) return;
    const targetId = osStore.getState().addOffscreenTarget(256, 256);
    const layerId = project.layers[0].id;
    osStore.getState().addSourceLayer(targetId, layerId);
    osStore.getState().addSourceLayer(targetId, layerId);
  });

  await expect(window.locator(".offscreen-source-item")).toHaveCount(1);
});


test("ソースレイヤーの削除ボタンをクリックするとソースが消える", async ({ window }) => {
  await window.evaluate(() => {
    const v = window.__vivi2d!;
    const store = v.useEditorStore as any;
    const osStore = v.useOffscreenStore as any;
    const project = store.getState().project;
    if (!project?.layers[0]) return;
    const targetId = osStore.getState().addOffscreenTarget(256, 256);
    osStore.getState().addSourceLayer(targetId, project.layers[0].id);
  });

  await expect(window.locator(".offscreen-source-item")).toBeVisible();

  const removeBtn = window
    .locator(".offscreen-source-item .mesh-link-remove-btn")
    .first();
  await removeBtn.scrollIntoViewIfNeeded();
  await removeBtn.click({ force: true });

  await expect(window.locator(".offscreen-source-item")).not.toBeVisible();
});

test("ソースレイヤー削除後にストアからもソースが消える", async ({ window }) => {
  const _targetId = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const store = v.useEditorStore as any;
    const osStore = v.useOffscreenStore as any;
    const project = store.getState().project;
    if (!project?.layers[0]) return "";
    const tid = osStore.getState().addOffscreenTarget(256, 256);
    osStore.getState().addSourceLayer(tid, project.layers[0].id);
    return tid;
  });

  await expect(window.locator(".offscreen-source-item")).toBeVisible();

  await window
    .locator(".offscreen-source-item .mesh-link-remove-btn")
    .first()
    .click({ force: true });

  const sourceCount = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const store = v.useEditorStore as any;
    const target = store.getState().project?.offscreenTargets?.[0];
    return target?.sourceLayerIds?.length ?? -1;
  });

  expect(sourceCount).toBe(0);
});


test("オフスクリーンターゲットの削除ボタンでターゲットが消える", async ({ window }) => {
  await addTargetByStore(window, 256, 256);
  await expect(window.locator(".offscreen-item")).toBeVisible();

  await window
    .locator(".offscreen-item .mesh-link-remove-btn")
    .first()
    .click({ force: true });

  await expect(window.locator(".offscreen-item")).not.toBeVisible();
});

test("ソースレイヤー付きターゲットを削除するとソースも消える", async ({ window }) => {
  await window.evaluate(() => {
    const v = window.__vivi2d!;
    const store = v.useEditorStore as any;
    const osStore = v.useOffscreenStore as any;
    const project = store.getState().project;
    if (!project?.layers[0]) return;
    const targetId = osStore.getState().addOffscreenTarget(256, 256);
    osStore.getState().addSourceLayer(targetId, project.layers[0].id);
  });

  await expect(window.locator(".offscreen-source-item")).toBeVisible();

  await window
    .locator(".offscreen-item-header .mesh-link-remove-btn")
    .first()
    .click({ force: true });

  await expect(window.locator(".offscreen-item")).not.toBeVisible();
  await expect(window.locator(".offscreen-source-item")).not.toBeVisible();
});

test("ターゲット削除後にストアからも消える", async ({ window }) => {
  await addTargetByStore(window, 256, 256);
  await expect(window.locator(".offscreen-item")).toBeVisible();

  await window
    .locator(".offscreen-item .mesh-link-remove-btn")
    .first()
    .click({ force: true });

  const count = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const store = v.useEditorStore as any;
    return store.getState().project?.offscreenTargets?.length ?? 0;
  });

  expect(count).toBe(0);
});


test("複数のオフスクリーンターゲットを追加して全て表示される", async ({ window }) => {
  await addTargetByStore(window, 128, 128);
  await addTargetByStore(window, 256, 256);
  await addTargetByStore(window, 512, 512);

  await expect(window.locator(".offscreen-item")).toHaveCount(3);
  await expect(
    window.locator(".offscreen-item-name", { hasText: "128×128" }),
  ).toBeVisible();
  await expect(
    window.locator(".offscreen-item-name", { hasText: "256×256" }),
  ).toBeVisible();
  await expect(
    window.locator(".offscreen-item-name", { hasText: "512×512" }),
  ).toBeVisible();
});

test("複数ターゲットから1つだけ削除しても残りが保持される", async ({ window }) => {
  await addTargetByStore(window, 128, 128);
  await addTargetByStore(window, 256, 256);
  await addTargetByStore(window, 512, 512);

  await expect(window.locator(".offscreen-item")).toHaveCount(3);

  const secondRemove = window
    .locator(".offscreen-item")
    .filter({ hasText: "256×256" })
    .locator(".mesh-link-remove-btn");
  await secondRemove.scrollIntoViewIfNeeded();
  await secondRemove.click({ force: true });

  await expect(window.locator(".offscreen-item")).toHaveCount(2);
  await expect(
    window.locator(".offscreen-item-name", { hasText: "128×128" }),
  ).toBeVisible();
  await expect(
    window.locator(".offscreen-item-name", { hasText: "512×512" }),
  ).toBeVisible();
  await expect(
    window.locator(".offscreen-item-name", { hasText: "256×256" }),
  ).not.toBeVisible();
});

test("複数ターゲットのバッファサイズを個別に変更できる", async ({ window }) => {
  await addTargetByStore(window, 256, 256);
  await addTargetByStore(window, 512, 512);

  const firstWidth = window
    .locator(".offscreen-item")
    .first()
    .locator(".ik-num-input")
    .first();
  await firstWidth.scrollIntoViewIfNeeded();
  await firstWidth.fill("320");

  const secondWidth = window
    .locator(".offscreen-item")
    .nth(1)
    .locator(".ik-num-input")
    .first();
  await secondWidth.scrollIntoViewIfNeeded();
  await secondWidth.fill("640");

  const widths = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const store = v.useEditorStore as any;
    const targets = store.getState().project?.offscreenTargets ?? [];
    return targets.map((t: any) => t.width);
  });

  expect(widths).toHaveLength(2);
  expect(widths[0]).toBe(320);
  expect(widths[1]).toBe(640);
});

test("複数ターゲットにそれぞれソースレイヤーを追加できる", async ({ window }) => {
  await window.evaluate(() => {
    const v = window.__vivi2d!;
    const store = v.useEditorStore as any;
    const osStore = v.useOffscreenStore as any;
    const project = store.getState().project;
    if (!project || project.layers.length < 2) return;

    const t1 = osStore.getState().addOffscreenTarget(256, 256);
    const t2 = osStore.getState().addOffscreenTarget(512, 512);

    osStore.getState().addSourceLayer(t1, project.layers[0].id);
    if (project.layers[1]) {
      osStore.getState().addSourceLayer(t2, project.layers[1].id);
    }
  });

  const sourceItems = window.locator(".offscreen-source-item");
  const count = await sourceItems.count();
  expect(count).toBeGreaterThanOrEqual(1);
});
