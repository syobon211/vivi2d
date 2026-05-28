import { expect, test } from "../fixtures";
import {
  addBone,
  clickContextMenuItem,
  rightClickLayer,
  selectLayer,
} from "../helpers/operations";


test.beforeEach(async ({ loadTestPsd }) => {
  await loadTestPsd();
});


test("レイヤーの可視性トグル", async ({ window }) => {
  const visBtn = window
    .locator(".layer-item", { hasText: "Red Circle" })
    .locator(".layer-visibility-btn");
  await expect(visBtn).toBeVisible();
  await expect(visBtn).toHaveText("on");

  await visBtn.click();
  await expect(visBtn).toHaveText("off");

  const layerItem = window.locator(".layer-item", { hasText: "Red Circle" });
  await expect(layerItem).toHaveClass(/hidden-layer/);

  await visBtn.click();
  await expect(visBtn).toHaveText("on");
  await expect(layerItem).not.toHaveClass(/hidden-layer/);
});


test("レイヤーのソロ表示", async ({ window }) => {
  const soloBtn = window
    .locator(".layer-item", { hasText: "Red Circle" })
    .locator(".layer-solo-btn");
  await expect(soloBtn).toBeVisible();

  await soloBtn.click();

  await expect(soloBtn).toHaveClass(/solo-active/);

  const otherSolo = window
    .locator(".layer-item", { hasText: "Background" })
    .locator(".layer-solo-btn");
  await expect(otherSolo).toHaveClass(/solo-dimmed/);

  await soloBtn.click();
  await expect(soloBtn).not.toHaveClass(/solo-active/);
  await expect(otherSolo).not.toHaveClass(/solo-dimmed/);
});


test("レイヤー名の変更", async ({ window }) => {
  await expect(window.locator(".layer-item", { hasText: "Red Circle" })).toBeVisible();

  await window.evaluate(() => {
    const v = window.__vivi2d!;
    const store = v.useEditorStore as any;
    store.setState((s: any) => {
      if (!s.project) return;
      const layer = s.project.layers.find((l: any) => l.name === "Red Circle");
      if (layer) layer.name = "新しい名前";
    });
  });

  await expect(window.locator(".layer-item", { hasText: "新しい名前" })).toBeVisible();
  await expect(
    window.locator(".layer-item", { hasText: "Red Circle" }),
  ).not.toBeVisible();
});


test("レイヤーの複数選択", async ({ window }) => {
  await selectLayer(window, "Red Circle");
  await expect(
    window.locator(".layer-item.selected", { hasText: "Red Circle" }),
  ).toBeVisible();

  const bgLayer = window.locator(".layer-item", { hasText: "Background" });
  await bgLayer.click({ modifiers: ["Control"] });

  await expect(
    window.locator(".layer-item.selected", { hasText: "Red Circle" }),
  ).toBeVisible();
  await expect(
    window.locator(".layer-item.selected", { hasText: "Background" }),
  ).toBeVisible();

  const selectedLayers = window.locator(".layer-item.selected");
  const count = await selectedLayers.count();
  expect(count).toBe(2);
});


test("レイヤーの展開/折り畳み", async ({ window }) => {
  const expandBtn = window.locator(".layer-expand-btn").first();
  const hasGroups = await expandBtn.count();

  if (hasGroups > 0) {
    const isExpanded = (await expandBtn.textContent())?.includes("▼");

    if (isExpanded) {
      await expandBtn.click();
      await expect(expandBtn).toHaveText("▶");

      await expandBtn.click();
      await expect(expandBtn).toHaveText("▼");
    } else {
      await expandBtn.click();
      await expect(expandBtn).toHaveText("▼");

      await expandBtn.click();
      await expect(expandBtn).toHaveText("▶");
    }
  } else {
    const { addBone } = await import("../helpers/operations");
    await addBone(window, "Red Circle");
    const newExpandBtn = window.locator(".layer-expand-btn").first();
    const newCount = await newExpandBtn.count();
    if (newCount > 0) {
      await newExpandBtn.click();
      await expect(newExpandBtn).toBeVisible();
    }
  }
});


test("レイヤー削除", async ({ window }) => {
  await addBone(window, "Red Circle");
  await expect(window.locator(".layer-item", { hasText: "ボーン" })).toBeVisible();

  await rightClickLayer(window, "ボーン");

  await clickContextMenuItem(window, "削除");

  await expect(window.locator(".layer-item", { hasText: "ボーン" })).not.toBeVisible();
});
