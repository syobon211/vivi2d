import { expect, test } from "../fixtures";


test.describe("Hi-DPI 描画 (P7-12)", () => {
  test("deviceScaleFactor=2 でもワークスペースとパネルが visible", async ({ window }) => {
    await window.setViewportSize({ width: 1920, height: 1080 });
    await expect(window.locator(".workspace")).toBeVisible({ timeout: 15_000 });

    const cdp = await window.context().newCDPSession(window);
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 1920,
      height: 1080,
      deviceScaleFactor: 2,
      mobile: false,
    });

    await expect(window.locator(".workspace")).toBeVisible();
    await expect(window.locator(".app")).toBeVisible();

    const dpr = await window.evaluate(() => globalThis.devicePixelRatio);
    expect(dpr).toBe(2);

    await cdp.detach();
  });

  test("deviceScaleFactor=2 で PSD をロードしてもレイヤーが表示される", async ({
    window,
    loadTestPsd,
  }) => {
    await window.setViewportSize({ width: 1920, height: 1080 });

    const cdp = await window.context().newCDPSession(window);
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 1920,
      height: 1080,
      deviceScaleFactor: 2,
      mobile: false,
    });

    await loadTestPsd();

    await expect(window.getByText("Background")).toBeVisible({ timeout: 10_000 });
    await expect(window.getByText("Red Circle")).toBeVisible();

    const canvasRatio = await window.evaluate(() => {
      const c = document.querySelector("canvas");
      if (!c) return null;
      const rect = c.getBoundingClientRect();
      if (rect.width === 0) return null;
      return c.width / rect.width;
    });
    expect(canvasRatio).not.toBeNull();
    expect(canvasRatio).toBeGreaterThan(0);

    await cdp.detach();
  });

  test("deviceScaleFactor 切替後に viewport リサイズしてもクラッシュしない", async ({
    window,
    loadTestPsd,
  }) => {
    await window.setViewportSize({ width: 1920, height: 1080 });
    await loadTestPsd();

    const cdp = await window.context().newCDPSession(window);

    const ratios = [1, 2, 1, 1.5];
    for (const ratio of ratios) {
      await cdp.send("Emulation.setDeviceMetricsOverride", {
        width: 1920,
        height: 1080,
        deviceScaleFactor: ratio,
        mobile: false,
      });
      await window.waitForTimeout(200);
    }

    await expect(window.locator(".app")).toBeVisible();
    await expect(window.locator(".workspace")).toBeVisible();

    await cdp.detach();
  });
});
