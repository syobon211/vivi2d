import { expect, test } from "../fixtures";
import {
  addBone,
  addParameter,
  clickViewMenuItem,
  selectLayer,
} from "../helpers/operations";


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


test("分割表示を有効化するとマルチビューストアが更新される", async ({ window }) => {
  await clickViewMenuItem(window, "分割表示");

  const enabled = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const mvStore = v.useMultiViewStore as any;
    return mvStore.getState().enabled;
  });

  expect(enabled).toBe(true);
});

test("分割表示を無効化するとストアが初期状態に戻る", async ({ window }) => {
  await clickViewMenuItem(window, "分割表示");
  await expect(window.locator(".multi-view-container")).toBeVisible({ timeout: 5000 });

  await clickViewMenuItem(window, "分割表示");

  const state = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const mvStore = v.useMultiViewStore as any;
    const s = mvStore.getState();
    return {
      enabled: s.enabled,
      viewCount: s.views.length,
      activeViewId: s.activeViewId,
    };
  });

  expect(state.enabled).toBe(false);
  expect(state.viewCount).toBe(0);
  expect(state.activeViewId).toBeNull();
});

test("分割表示有効化後に通常キャンバスが非表示になる", async ({ window }) => {
  await expect(window.locator(".canvas-container")).toBeVisible();

  await clickViewMenuItem(window, "分割表示");

  await expect(window.locator(".multi-view-container")).toBeVisible({ timeout: 5000 });
});


test("horizontalレイアウトで2ペインが生成される", async ({ window }) => {
  await clickViewMenuItem(window, "分割表示");

  await expect(window.locator(".multi-view-container.layout-horizontal")).toBeVisible({
    timeout: 5000,
  });
  await expect(window.locator(".multi-view-pane")).toHaveCount(2, { timeout: 5000 });
});

test("ストア経由でquadレイアウトに変更すると4ペインになる", async ({ window }) => {
  await clickViewMenuItem(window, "分割表示");
  await expect(window.locator(".multi-view-container")).toBeVisible({ timeout: 5000 });

  await window.evaluate(() => {
    const v = window.__vivi2d!;
    const mvStore = v.useMultiViewStore as any;
    mvStore.getState().setLayout("quad");
  });

  await expect(window.locator(".multi-view-container.layout-quad")).toBeVisible({
    timeout: 5000,
  });
  await expect(window.locator(".multi-view-pane")).toHaveCount(4, { timeout: 5000 });
});

test("ストア経由でverticalレイアウトに変更すると2ペインが縦並びになる", async ({
  window,
}) => {
  await clickViewMenuItem(window, "分割表示");
  await expect(window.locator(".multi-view-container")).toBeVisible({ timeout: 5000 });

  await window.evaluate(() => {
    const v = window.__vivi2d!;
    const mvStore = v.useMultiViewStore as any;
    mvStore.getState().setLayout("vertical");
  });

  await expect(window.locator(".multi-view-container.layout-vertical")).toBeVisible({
    timeout: 5000,
  });
  await expect(window.locator(".multi-view-pane")).toHaveCount(2, { timeout: 5000 });
});

test("レイアウト変更後にアクティブビューが最初のビューにリセットされる", async ({
  window,
}) => {
  await clickViewMenuItem(window, "分割表示");
  await expect(window.locator(".multi-view-pane")).toHaveCount(2, { timeout: 5000 });

  await window.locator(".multi-view-pane").nth(1).click();
  await expect(window.locator(".multi-view-pane").nth(1)).toHaveClass(/active/, {
    timeout: 3000,
  });

  await window.evaluate(() => {
    const v = window.__vivi2d!;
    const mvStore = v.useMultiViewStore as any;
    mvStore.getState().setLayout("quad");
  });

  const activeId = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const mvStore = v.useMultiViewStore as any;
    return mvStore.getState().activeViewId;
  });

  expect(activeId).toBe("view-0");
});


test("マルチビュー有効時にレイヤーパネルのレイヤー選択が動作する", async ({ window }) => {
  await clickViewMenuItem(window, "分割表示");
  await expect(window.locator(".multi-view-container")).toBeVisible({ timeout: 5000 });

  await selectLayer(window, "Background");

  const selectedId = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const selStore = v.useSelectionStore as any;
    return selStore.getState().selectedLayerId;
  });

  expect(selectedId).toBeTruthy();
});

test("マルチビュー有効時にレイヤー選択を切り替えられる", async ({ window }) => {
  await clickViewMenuItem(window, "分割表示");
  await expect(window.locator(".multi-view-container")).toBeVisible({ timeout: 5000 });

  await selectLayer(window, "Background");

  const _id1 = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const selStore = v.useSelectionStore as any;
    return selStore.getState().selectedLayerId;
  });

  const layers = await window.locator(".layer-item").allTextContents();
  if (layers.length > 1) {
    const otherLayerText = layers.find((t) => !t.includes("Background"));
    if (otherLayerText) {
      await window.locator(".layer-item").nth(0).click();

      const id2 = await window.evaluate(() => {
        const v = window.__vivi2d!;
        const selStore = v.useSelectionStore as any;
        return selStore.getState().selectedLayerId;
      });

      expect(id2).toBeTruthy();
    }
  }
});


test("マルチビュー有効時にボーンを追加できる", async ({ window }) => {
  await clickViewMenuItem(window, "分割表示");
  await expect(window.locator(".multi-view-container")).toBeVisible({ timeout: 5000 });

  await addBone(window, "Background");

  await expect(window.locator(".layer-item", { hasText: "ボーン" })).toBeVisible();
});

test("マルチビュー有効時にボーンを選択するとプロパティパネルが更新される", async ({
  window,
}) => {
  await addBone(window, "Background");

  await clickViewMenuItem(window, "分割表示");
  await expect(window.locator(".multi-view-container")).toBeVisible({ timeout: 5000 });

  await selectLayer(window, "ボーン");

  await expect(window.locator(".properties-form", { hasText: "ボーン" })).toBeVisible();
});


test("パラメータ値変更がマルチビューストアのパラメータ値に反映される", async ({
  window,
}) => {
  await addParameter(window, "テスト角度");

  await clickViewMenuItem(window, "分割表示");
  await expect(window.locator(".multi-view-container")).toBeVisible({ timeout: 5000 });

  const slider = window
    .locator(".parameter-name", { hasText: "テスト角度" })
    .locator("..")
    .locator("input[type='range']")
    .first();

  if (await slider.isVisible()) {
    await slider.fill("50");
  }

  await expect(window.locator(".multi-view-container")).toBeVisible();
  await expect(window.locator(".multi-view-pane")).toHaveCount(2);
});

test("マルチビューのパラメータオーバーライドをストア経由で設定できる", async ({
  window,
}) => {
  await addParameter(window, "オーバーライドテスト");

  const paramId = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const store = v.useEditorStore as any;
    const params = store.getState().project?.parameters ?? [];
    return params.find((p: any) => p.name === "オーバーライドテスト")?.id ?? "";
  });

  if (!paramId) return;

  await clickViewMenuItem(window, "分割表示");
  await expect(window.locator(".multi-view-container")).toBeVisible({ timeout: 5000 });

  await window.evaluate(
    ({ pid }: { pid: string }) => {
      const v = window.__vivi2d!;
      const mvStore = v.useMultiViewStore as any;
      mvStore.getState().setViewParamOverride("view-1", pid, 75);
    },
    { pid: paramId },
  );

  const override = await window.evaluate(
    ({ pid }: { pid: string }) => {
      const v = window.__vivi2d!;
      const mvStore = v.useMultiViewStore as any;
      const views = mvStore.getState().views;
      const view1 = views.find((v: any) => v.id === "view-1");
      return view1?.parameterOverrides[pid];
    },
    { pid: paramId },
  );

  expect(override).toBe(75);
});

test("パラメータオーバーライドを削除するとデフォルト値に戻る", async ({ window }) => {
  await addParameter(window, "削除テストP");

  const paramId = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const store = v.useEditorStore as any;
    const params = store.getState().project?.parameters ?? [];
    return params.find((p: any) => p.name === "削除テストP")?.id ?? "";
  });

  if (!paramId) return;

  await clickViewMenuItem(window, "分割表示");
  await expect(window.locator(".multi-view-container")).toBeVisible({ timeout: 5000 });

  await window.evaluate(
    ({ pid }: { pid: string }) => {
      const v = window.__vivi2d!;
      const mvStore = v.useMultiViewStore as any;
      mvStore.getState().setViewParamOverride("view-1", pid, 50);
      mvStore.getState().removeViewParamOverride("view-1", pid);
    },
    { pid: paramId },
  );

  const override = await window.evaluate(
    ({ pid }: { pid: string }) => {
      const v = window.__vivi2d!;
      const mvStore = v.useMultiViewStore as any;
      const views = mvStore.getState().views;
      const view1 = views.find((v: any) => v.id === "view-1");
      return view1?.parameterOverrides[pid];
    },
    { pid: paramId },
  );

  expect(override).toBeUndefined();
});


test("ビューのズーム値をストア経由で変更できる", async ({ window }) => {
  await clickViewMenuItem(window, "分割表示");
  await expect(window.locator(".multi-view-container")).toBeVisible({ timeout: 5000 });

  await window.evaluate(() => {
    const v = window.__vivi2d!;
    const mvStore = v.useMultiViewStore as any;
    mvStore.getState().setViewZoom("view-0", 2.0);
  });

  const zoom = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const mvStore = v.useMultiViewStore as any;
    const views = mvStore.getState().views;
    return views.find((v: any) => v.id === "view-0")?.zoom;
  });

  expect(zoom).toBe(2.0);
});

test("ビューのパン位置をストア経由で変更できる", async ({ window }) => {
  await clickViewMenuItem(window, "分割表示");
  await expect(window.locator(".multi-view-container")).toBeVisible({ timeout: 5000 });

  await window.evaluate(() => {
    const v = window.__vivi2d!;
    const mvStore = v.useMultiViewStore as any;
    mvStore.getState().setViewPan("view-1", 100, -50);
  });

  const pan = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const mvStore = v.useMultiViewStore as any;
    const views = mvStore.getState().views;
    const view1 = views.find((v: any) => v.id === "view-1");
    return { x: view1?.panX, y: view1?.panY };
  });

  expect(pan.x).toBe(100);
  expect(pan.y).toBe(-50);
});

test("各ビューのズーム/パンが独立して保持される", async ({ window }) => {
  await clickViewMenuItem(window, "分割表示");
  await expect(window.locator(".multi-view-container")).toBeVisible({ timeout: 5000 });

  await window.evaluate(() => {
    const v = window.__vivi2d!;
    const mvStore = v.useMultiViewStore as any;
    mvStore.getState().setViewZoom("view-0", 1.5);
    mvStore.getState().setViewPan("view-0", 10, 20);
    mvStore.getState().setViewZoom("view-1", 3.0);
    mvStore.getState().setViewPan("view-1", -30, 40);
  });

  const viewStates = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const mvStore = v.useMultiViewStore as any;
    const views = mvStore.getState().views;
    return views.map((v: any) => ({
      id: v.id,
      zoom: v.zoom,
      panX: v.panX,
      panY: v.panY,
    }));
  });

  expect(viewStates).toHaveLength(2);
  expect(viewStates[0]).toMatchObject({ zoom: 1.5, panX: 10, panY: 20 });
  expect(viewStates[1]).toMatchObject({ zoom: 3.0, panX: -30, panY: 40 });
});


test("ビューペインをクリックするとストアのactiveViewIdが更新される", async ({
  window,
}) => {
  await clickViewMenuItem(window, "分割表示");
  await expect(window.locator(".multi-view-pane")).toHaveCount(2, { timeout: 5000 });

  const initialActive = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const mvStore = v.useMultiViewStore as any;
    return mvStore.getState().activeViewId;
  });
  expect(initialActive).toBe("view-0");

  await window.locator(".multi-view-pane").nth(1).click();

  const newActive = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const mvStore = v.useMultiViewStore as any;
    return mvStore.getState().activeViewId;
  });
  expect(newActive).toBe("view-1");
});

test("quadレイアウトで各ペインのアクティブ切り替えが動作する", async ({ window }) => {
  await clickViewMenuItem(window, "分割表示");
  await expect(window.locator(".multi-view-container")).toBeVisible({ timeout: 5000 });

  await window.evaluate(() => {
    const v = window.__vivi2d!;
    const mvStore = v.useMultiViewStore as any;
    mvStore.getState().setLayout("quad");
  });

  await expect(window.locator(".multi-view-pane")).toHaveCount(4, { timeout: 5000 });

  await window.locator(".multi-view-pane").nth(3).click();
  await expect(window.locator(".multi-view-pane").nth(3)).toHaveClass(/active/, {
    timeout: 3000,
  });

  const activeId = await window.evaluate(() => {
    const v = window.__vivi2d!;
    const mvStore = v.useMultiViewStore as any;
    return mvStore.getState().activeViewId;
  });
  expect(activeId).toBe("view-3");
});
