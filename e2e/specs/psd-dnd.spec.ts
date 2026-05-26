import fs from "node:fs";
import path from "node:path";
import type { Page } from "playwright";
import { expect, test } from "../fixtures";


const TEST_PSD_PATH = path.resolve(import.meta.dirname, "../fixtures/test.psd");

async function simulatePsdDrop(
  window: Page,
  fileName: string,
  bytes: Uint8Array,
): Promise<void> {
  const base64 = Buffer.from(bytes).toString("base64");
  await window.evaluate(
    ({ fileName, base64 }) => {
      const binary = atob(base64);
      const buf = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
      const file = new File([buf], fileName, {
        type: "image/vnd.adobe.photoshop",
      });

      const dt = new DataTransfer();
      dt.items.add(file);

      const dragOver = new DragEvent("dragover", {
        bubbles: true,
        cancelable: true,
        dataTransfer: dt,
      });
      globalThis.dispatchEvent(dragOver);

      const drop = new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        dataTransfer: dt,
      });
      globalThis.dispatchEvent(drop);
    },
    { fileName, base64 },
  );
}

test.describe("PSD ドラッグ&ドロップ (P7-1)", () => {
  test("window にドロップされた test.psd がレイヤーとして読み込まれる", async ({
    window,
  }) => {
    await window.setViewportSize({ width: 1920, height: 1080 });
    await expect(window.locator(".workspace")).toBeVisible({ timeout: 15_000 });

    const psdBytes = fs.readFileSync(TEST_PSD_PATH);
    await simulatePsdDrop(window, "test.psd", psdBytes);

    await expect(window.getByText("Background")).toBeVisible({ timeout: 10_000 });
    await expect(window.getByText("Red Circle")).toBeVisible();
  });

  test("非 .psd ファイルのドロップは無視される (レイヤーは変化しない)", async ({
    window,
    loadTestPsd,
  }) => {
    await window.setViewportSize({ width: 1920, height: 1080 });

    await loadTestPsd();
    await expect(window.getByText("Background")).toBeVisible();

    const before = await window.locator(".layer-row").count();

    const fakeBytes = new Uint8Array([0x68, 0x65, 0x6c, 0x6c, 0x6f]); // "hello"
    await simulatePsdDrop(window, "not-a-psd.txt", fakeBytes);

    await window.waitForTimeout(500);
    const after = await window.locator(".layer-row").count();
    expect(after).toBe(before);

    await expect(window.getByText("Background")).toBeVisible();
  });

  test("破損 PSD バイナリをドロップしてもアプリがクラッシュしない", async ({
    window,
  }) => {
    await window.setViewportSize({ width: 1920, height: 1080 });
    await expect(window.locator(".workspace")).toBeVisible({ timeout: 15_000 });

    const garbage = new Uint8Array([
      0xff, 0xfe, 0xfd, 0xfc, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05,
    ]);
    await simulatePsdDrop(window, "garbage.psd", garbage);

    await window.waitForTimeout(1000);
    await expect(window.locator(".workspace")).toBeVisible();
    await expect(window.locator(".app")).toBeVisible();
  });

  test("連続ドロップで 2 つ目の PSD が反映される（ロード競合が無い）", async ({
    window,
  }) => {
    await window.setViewportSize({ width: 1920, height: 1080 });
    await expect(window.locator(".workspace")).toBeVisible({ timeout: 15_000 });

    const psdBytes = fs.readFileSync(TEST_PSD_PATH);

    await simulatePsdDrop(window, "test.psd", psdBytes);
    await expect(window.getByText("Background")).toBeVisible({ timeout: 10_000 });

    await simulatePsdDrop(window, "second.psd", psdBytes);

    await expect(window.getByText("Background")).toBeVisible({ timeout: 10_000 });
    await expect(window.getByText("Red Circle")).toBeVisible();
  });
});
