import { expect, test } from "../fixtures";
import {
  clickContextMenuItem,
  rightClickLayer,
  selectLayer,
} from "../helpers/operations";


async function waitForVivi2D(window: import("playwright").Page) {
  await expect(async () => {
    const ready = await window.evaluate(() => !!window.__vivi2d);
    expect(ready).toBe(true);
  }).toPass({ timeout: 10_000 });
}

async function addArtPathByStore(
  window: import("playwright").Page,
  name: string,
): Promise<string> {
  return await window.evaluate((n: string) => {
    const v = window.__vivi2d!;
    const apStore = v.useArtPathStore as any;
    return apStore.getState().addArtPath(n, 100, 200);
  }, name);
}

async function addControlPointByStore(
  window: import("playwright").Page,
  artPathId: string,
  x: number,
  y: number,
  width: number = 3,
) {
  await window.evaluate(
    ({ id, x, y, w }: { id: string; x: number; y: number; w: number }) => {
      const v = window.__vivi2d!;
      const apStore = v.useArtPathStore as any;
      apStore.getState().addControlPoint(id, { x, y, width: w, color: 0x000000 });
    },
    { id: artPathId, x, y, w: width },
  );
}

test.beforeEach(async ({ window, loadTestPsd }) => {
  await window.setViewportSize({ width: 1920, height: 1080 });
  await loadTestPsd();
  await waitForVivi2D(window);
});


test("コンテキストメニューからArtPathを追加するとレイヤーパネルに表示される", async ({
  window,
}) => {
  await rightClickLayer(window, "Background");
  await clickContextMenuItem(window, "アートパス追加");

  await expect(window.locator(".layer-item", { hasText: "アートパス" })).toBeVisible();
});

test("ストア経由でArtPathを追加するとレイヤーパネルに名前が表示される", async ({
  window,
}) => {
  await addArtPathByStore(window, "テストアートパス");

  await expect(
    window.locator(".layer-item", { hasText: "テストアートパス" }),
  ).toBeVisible();
});

test("複数のArtPathを追加してもそれぞれ表示される", async ({ window }) => {
  await addArtPathByStore(window, "パスA");
  await addArtPathByStore(window, "パスB");
  await addArtPathByStore(window, "パスC");

  await expect(window.locator(".layer-item", { hasText: "パスA" })).toBeVisible();
  await expect(window.locator(".layer-item", { hasText: "パスB" })).toBeVisible();
  await expect(window.locator(".layer-item", { hasText: "パスC" })).toBeVisible();
});


test("ArtPath選択時にプロパティパネルに制御点セクションが表示される", async ({
  window,
}) => {
  const apId = await addArtPathByStore(window, "制御点テスト");
  await addControlPointByStore(window, apId, 10, 20);
  await addControlPointByStore(window, apId, 50, 60);

  await selectLayer(window, "制御点テスト");

  await expect(
    window.locator(".prop-section-title", { hasText: "アートパス" }),
  ).toBeVisible();

  await expect(
    window.locator(".artpath-points-header", { hasText: "制御点 (2)" }),
  ).toBeVisible();
});

test("制御点の座標がプロパティパネルに表示される", async ({ window }) => {
  const apId = await addArtPathByStore(window, "座標表示テスト");
  await addControlPointByStore(window, apId, 100, 200);

  await selectLayer(window, "座標表示テスト");

  await expect(
    window.locator(".artpath-point-coords", { hasText: "(100, 200)" }),
  ).toBeVisible();
});

test("制御点の幅値がプロパティパネルに表示される", async ({ window }) => {
  const apId = await addArtPathByStore(window, "幅表示テスト");
  await addControlPointByStore(window, apId, 10, 20, 5.0);

  await selectLayer(window, "幅表示テスト");

  await expect(window.locator(".artpath-point-info", { hasText: "w:5.0" })).toBeVisible();
});


test("ArtPathの色入力が表示され変更するとストアに反映される", async ({ window }) => {
  const apId = await addArtPathByStore(window, "色変更テスト");
  await selectLayer(window, "色変更テスト");

  const colorInput = window.locator(".artpath-color-input");
  await expect(colorInput).toBeVisible();

  await colorInput.fill("#ff0000");
  await colorInput.dispatchEvent("change");

  const color = await window.evaluate((id: string) => {
    const v = window.__vivi2d!;
    const store = v.useEditorStore as any;
    const project = store.getState().project;
    if (!project) return -1;
    for (const layer of project.layers) {
      if (layer.id === id && layer.kind === "artPath") return layer.style.color;
    }
    return -1;
  }, apId);

  expect(color).toBe(0xff0000);
});

test("ArtPathの線幅入力が表示され変更するとストアに反映される", async ({ window }) => {
  const apId = await addArtPathByStore(window, "線幅変更テスト");
  await selectLayer(window, "線幅変更テスト");

  const widthInput = window.locator(".artpath-props .ik-num-input").first();
  await expect(widthInput).toBeVisible();
  await widthInput.fill("8");

  const baseWidth = await window.evaluate((id: string) => {
    const v = window.__vivi2d!;
    const store = v.useEditorStore as any;
    const project = store.getState().project;
    if (!project) return -1;
    for (const layer of project.layers) {
      if (layer.id === id && layer.kind === "artPath") return layer.style.baseWidth;
    }
    return -1;
  }, apId);

  expect(baseWidth).toBe(8);
});

test("ArtPathの線端スタイルを変更できる", async ({ window }) => {
  const apId = await addArtPathByStore(window, "線端テスト");
  await selectLayer(window, "線端テスト");

  const lineCapSelect = window.locator(".artpath-props .form-anim-select").first();
  await expect(lineCapSelect).toBeVisible();

  await lineCapSelect.selectOption({ value: "butt" });

  const lineCap = await window.evaluate((id: string) => {
    const v = window.__vivi2d!;
    const store = v.useEditorStore as any;
    const project = store.getState().project;
    if (!project) return "";
    for (const layer of project.layers) {
      if (layer.id === id && layer.kind === "artPath") return layer.style.lineCap;
    }
    return "";
  }, apId);

  expect(lineCap).toBe("butt");
});


test("閉じたパスチェックボックスをオンにするとストアに反映される", async ({ window }) => {
  const apId = await addArtPathByStore(window, "開閉テスト");
  await selectLayer(window, "開閉テスト");

  const closedCheckbox = window.locator(".artpath-props input[type='checkbox']");
  await expect(closedCheckbox).toBeVisible();
  await expect(closedCheckbox).not.toBeChecked();

  await closedCheckbox.check({ force: true });

  const closed = await window.evaluate((id: string) => {
    const v = window.__vivi2d!;
    const store = v.useEditorStore as any;
    const project = store.getState().project;
    if (!project) return null;
    for (const layer of project.layers) {
      if (layer.id === id && layer.kind === "artPath") return layer.closed;
    }
    return null;
  }, apId);

  expect(closed).toBe(true);
});

test("閉じたパスを再度開くとストアに反映される", async ({ window }) => {
  const apId = await addArtPathByStore(window, "再開テスト");

  await window.evaluate((id: string) => {
    const v = window.__vivi2d!;
    const apStore = v.useArtPathStore as any;
    apStore.getState().setClosed(id, true);
  }, apId);

  await selectLayer(window, "再開テスト");

  const closedCheckbox = window.locator(".artpath-props input[type='checkbox']");
  await expect(closedCheckbox).toBeChecked();

  await closedCheckbox.uncheck({ force: true });

  const closed = await window.evaluate((id: string) => {
    const v = window.__vivi2d!;
    const store = v.useEditorStore as any;
    const project = store.getState().project;
    if (!project) return null;
    for (const layer of project.layers) {
      if (layer.id === id && layer.kind === "artPath") return layer.closed;
    }
    return null;
  }, apId);

  expect(closed).toBe(false);
});


test("制御点を追加すると制御点数カウントが更新される", async ({ window }) => {
  const apId = await addArtPathByStore(window, "追加テスト");
  await selectLayer(window, "追加テスト");

  await expect(
    window.locator(".artpath-points-header", { hasText: "制御点 (0)" }),
  ).toBeVisible();

  await addControlPointByStore(window, apId, 10, 20);
  await addControlPointByStore(window, apId, 30, 40);
  await addControlPointByStore(window, apId, 50, 60);

  await selectLayer(window, "Background");
  await selectLayer(window, "追加テスト");

  const controlPointCount = await window.evaluate((id: string) => {
    const v = window.__vivi2d!;
    const project = (v.useEditorStore as any).getState().project;
    if (!project) return null;
    const findNode = (nodes: any[]): any => {
      for (const node of nodes) {
        if (node.id === id) return node;
        if (node.children?.length) {
          const found = findNode(node.children);
          if (found) return found;
        }
      }
      return null;
    };
    const layer = findNode(project.layers);
    return layer?.kind === "artPath" ? layer.controlPoints.length : null;
  }, apId);
  expect(controlPointCount).toBe(3);
});

test("制御点を途中の位置に挿入できる", async ({ window }) => {
  const apId = await addArtPathByStore(window, "挿入テスト");
  await addControlPointByStore(window, apId, 0, 0);
  await addControlPointByStore(window, apId, 100, 100);

  await window.evaluate(
    ({ id }: { id: string }) => {
      const v = window.__vivi2d!;
      const apStore = v.useArtPathStore as any;
      apStore
        .getState()
        .addControlPoint(id, { x: 50, y: 50, width: 3, color: 0x000000 }, 1);
    },
    { id: apId },
  );

  await selectLayer(window, "挿入テスト");

  await expect(window.locator(".artpath-point-item")).toHaveCount(3);

  const secondCoords = window.locator(".artpath-point-coords").nth(1);
  await expect(secondCoords).toContainText("(50, 50)");
});


test("制御点の削除ボタンをクリックすると制御点が消える", async ({ window }) => {
  const apId = await addArtPathByStore(window, "削除テスト");
  await addControlPointByStore(window, apId, 10, 20);
  await addControlPointByStore(window, apId, 30, 40);
  await addControlPointByStore(window, apId, 50, 60);

  await selectLayer(window, "削除テスト");

  await expect(window.locator(".artpath-point-item")).toHaveCount(3);

  const removeBtn = window.locator(".artpath-point-item .mesh-link-remove-btn").first();
  await removeBtn.scrollIntoViewIfNeeded();
  await removeBtn.click({ force: true });

  await expect(window.locator(".artpath-point-item")).toHaveCount(2);

  await expect(
    window.locator(".artpath-points-header", { hasText: "制御点 (2)" }),
  ).toBeVisible();
});

test("全制御点を削除すると制御点リストが空になる", async ({ window }) => {
  const apId = await addArtPathByStore(window, "全削除テスト");
  await addControlPointByStore(window, apId, 10, 20);
  await addControlPointByStore(window, apId, 30, 40);

  await selectLayer(window, "全削除テスト");

  await window
    .locator(".artpath-point-item .mesh-link-remove-btn")
    .first()
    .click({ force: true });
  await window
    .locator(".artpath-point-item .mesh-link-remove-btn")
    .first()
    .click({ force: true });

  await expect(
    window.locator(".artpath-points-header", { hasText: "制御点 (0)" }),
  ).toBeVisible();
  await expect(window.locator(".artpath-point-item")).toHaveCount(0);
});

test("制御点削除後にストアの制御点配列も更新される", async ({ window }) => {
  const apId = await addArtPathByStore(window, "ストア確認テスト");
  await addControlPointByStore(window, apId, 10, 20);
  await addControlPointByStore(window, apId, 30, 40);
  await addControlPointByStore(window, apId, 50, 60);

  await selectLayer(window, "ストア確認テスト");

  await window
    .locator(".artpath-point-item .mesh-link-remove-btn")
    .first()
    .click({ force: true });

  const count = await window.evaluate((id: string) => {
    const v = window.__vivi2d!;
    const store = v.useEditorStore as any;
    const project = store.getState().project;
    if (!project) return -1;
    for (const layer of project.layers) {
      if (layer.id === id && layer.kind === "artPath") return layer.controlPoints.length;
    }
    return -1;
  }, apId);

  expect(count).toBe(2);
});
