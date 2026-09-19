import fs from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { writePsdBuffer } from "ag-psd";
import type { ElectronApplication } from "playwright";
import { expect, test } from "../fixtures";
import { waitForCanvasOpenReady, waitForViviRuntime } from "../helpers/app";
import {
  mockOpenPng,
  mockOpenPsd,
  mockOpenVivi,
  mockSaveDialog,
} from "../helpers/dialog-mock";
import {
  addBone,
  bindAllBones,
  clickFileMenuItem,
  selectLayer,
} from "../helpers/operations";
import { writeBase64Png } from "../helpers/png-fixtures";

const TEST_PSD = path.resolve(import.meta.dirname, "../fixtures/test.psd");

const FILE_MENU_PATTERN = /ファイル|File/;
const REIMPORT_MENU_ITEM_PATTERN = /PSD再読込|Reimport PSD/;
const REIMPORT_TITLE_PATTERN = /PSD ?再読み込み|PSD Reimport/;
const SELECT_PSD_BUTTON_PATTERN = /PSD ?ファイルを選択|Select PSD File/;
const APPLY_BUTTON_PATTERN = /適用|Apply/;
const CANCEL_BUTTON_PATTERN = /キャンセル|Cancel/;

async function openFileMenu(window: Page) {
  const trigger = window.locator(".menu-dropdown-trigger", {
    hasText: FILE_MENU_PATTERN,
  });
  await trigger.click();
  const panel = trigger.locator("..").locator(".menu-dropdown-panel");
  await expect(panel).toBeVisible();
  return panel;
}

async function openReimportDialog(window: Page) {
  const panel = await openFileMenu(window);
  await panel
    .locator(".menu-dropdown-item", { hasText: REIMPORT_MENU_ITEM_PATTERN })
    .click();
  await expect(window.locator(".modal-overlay")).toBeVisible();
  await expect(window.locator(".modal-title")).toHaveText(REIMPORT_TITLE_PATTERN);
  await expect(window.locator(".reimport-dialog")).toBeVisible();
}

function writeArtworkPsd(filePath: string, size: number, color: number[], moved = false) {
  const pixels = new Uint8ClampedArray(size * size * 4);
  for (let offset = 0; offset < pixels.length; offset += 4) pixels.set(color, offset);
  fs.writeFileSync(
    filePath,
    writePsdBuffer(
      {
        width: moved ? 64 : 32,
        height: moved ? 64 : 32,
        children: [
          {
            name: "Artwork",
            left: moved ? 17 : 3,
            top: moved ? 23 : 5,
            imageData: { width: size, height: size, data: pixels },
          },
        ],
      },
      { generateThumbnail: false, trimImageData: false },
    ),
  );
}

async function writeArtworkPng(
  window: Page,
  filePath: string,
  size: number,
  color: number[],
) {
  const image = await window.evaluate(
    ({ size, color }) => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext("2d")!;
      const pixels = context.createImageData(size, size);
      for (let offset = 0; offset < pixels.data.length; offset += 4) {
        pixels.data.set(color, offset);
      }
      context.putImageData(pixels, 0, 0);
      return canvas.toDataURL("image/png").split(",")[1]!;
    },
    { size, color },
  );
  writeBase64Png(filePath, image);
}

async function authoringSnapshot(window: Page) {
  return window.evaluate(() => {
    const vivi = window.__vivi2d as any;
    const history = vivi.useHistoryStore.getState();
    return {
      project: JSON.parse(JSON.stringify(vivi.useEditorStore.getState().project)),
      undoLength: history.undoStack.length,
      redoLength: history.redoStack.length,
    };
  });
}

async function expectPngPixels(
  window: Page,
  image: string,
  region: { x: number; y: number; width: number; height: number },
  color: number[],
) {
  const uniform = await window.evaluate(
    async ({ image, region, color }) => {
      const decoded = new Image();
      decoded.src = `data:image/png;base64,${image}`;
      await decoded.decode();
      const canvas = document.createElement("canvas");
      canvas.width = region.width;
      canvas.height = region.height;
      const context = canvas.getContext("2d")!;
      context.drawImage(
        decoded,
        region.x,
        region.y,
        region.width,
        region.height,
        0,
        0,
        region.width,
        region.height,
      );
      return context
        .getImageData(0, 0, region.width, region.height)
        .data.every((channel, index) => channel === color[index % 4]);
    },
    { image, region, color },
  );
  expect(uniform).toBe(true);
}

async function expectRenderedArtwork(window: Page, color: number[]) {
  await expect
    .poll(() =>
      window.evaluate(() => {
        const vivi = window.__vivi2d as any;
        const layer = vivi.useEditorStore
          .getState()
          .project.layers.find((entry: any) => entry.name === "Artwork");
        const { zoom, panX, panY } = vivi.useViewportStore.getState();
        const source = document.querySelector(
          ".canvas-container canvas",
        ) as HTMLCanvasElement;
        const bounds = source.getBoundingClientRect();
        // Sample inside the authored mesh, away from its outline and central bone overlay.
        const x = Math.round(
          ((panX + (layer.x + layer.width / 4) * zoom) * source.width) / bounds.width,
        );
        const y = Math.round(
          ((panY + (layer.y + layer.height / 4) * zoom) * source.height) / bounds.height,
        );
        const readback = document.createElement("canvas");
        readback.width = 3;
        readback.height = 3;
        const context = readback.getContext("2d")!;
        // Render and copy synchronously: the WebGL drawing buffer may clear after presentation.
        vivi.forceEditorCanvasRender();
        context.drawImage(source, x - 1, y - 1, 3, 3, 0, 0, 3, 3);
        return Array.from(context.getImageData(0, 0, 3, 3).data);
      }),
    )
    .toEqual(Array.from({ length: 9 }, () => color).flat());
}

async function saveAndExpectTexture(
  app: ElectronApplication,
  window: Page,
  filePath: string,
  layerId: string,
  size: number,
  color: number[],
) {
  await mockSaveDialog(app, filePath);
  await clickFileMenuItem(window, "別名で保存");
  await expect.poll(() => fs.existsSync(filePath)).toBe(true);
  const saved = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const atlas = saved.atlases.find((candidate: any) =>
    candidate.entries.some((entry: any) => entry.layerId === layerId),
  );
  expect(atlas).toBeDefined();
  const entry = atlas.entries.find((candidate: any) => candidate.layerId === layerId);
  expect({ width: entry.width, height: entry.height }).toEqual({
    width: size,
    height: size,
  });
  await expectPngPixels(window, atlas.image, entry, color);
}

test("reimport menu item stays hidden before a project exists", async ({ window }) => {
  const panel = await openFileMenu(window);
  await expect(
    panel.locator(".menu-dropdown-item", { hasText: REIMPORT_MENU_ITEM_PATTERN }),
  ).not.toBeVisible();
  await window.keyboard.press("Escape");
});

test("reimport menu item appears after loading a PSD-backed project", async ({
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();

  const panel = await openFileMenu(window);
  await expect(
    panel.locator(".menu-dropdown-item", { hasText: REIMPORT_MENU_ITEM_PATTERN }),
  ).toBeVisible();
  await window.keyboard.press("Escape");
});

test("opening PSD reimport shows the dialog shell", async ({ window, loadTestPsd }) => {
  await loadTestPsd();

  await openReimportDialog(window);
});

test("initial reimport state shows the select-PSD button", async ({
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();

  await openReimportDialog(window);
  await expect(
    window.getByRole("button", { name: SELECT_PSD_BUTTON_PATTERN }),
  ).toBeVisible();
});

test("cancel closes the reimport dialog", async ({ window, loadTestPsd }) => {
  await loadTestPsd();

  await openReimportDialog(window);
  await window.getByRole("button", { name: CANCEL_BUTTON_PATTERN }).click();
  await expect(window.locator(".modal-overlay")).not.toBeVisible();
});

test("reimporting identical PSD pixels is a no-op without an empty history entry", async ({
  app,
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();
  await expect(window.getByText("Background")).toBeVisible();
  await expect(window.getByText("Red Circle")).toBeVisible();
  const before = await authoringSnapshot(window);

  await openReimportDialog(window);
  await mockOpenPsd(app, TEST_PSD);
  await window.getByRole("button", { name: SELECT_PSD_BUTTON_PATTERN }).click();

  await expect(window.locator(".reimport-diff")).toBeVisible();
  await expect(
    window.getByRole("checkbox", { name: "Background", exact: true }),
  ).toBeChecked();
  await window.getByRole("button", { name: APPLY_BUTTON_PATTERN }).click();
  await expect(window.locator(".reimport-dialog")).not.toBeVisible();
  expect(await authoringSnapshot(window)).toEqual(before);

  await expect(window.getByText("Background")).toBeVisible();
  await expect(window.getByText("Red Circle")).toBeVisible();
});

test("mixed PNG/PSD resolution history preserves authored state through Undo/Redo and save/export", async ({
  app,
  window,
}, testInfo) => {
  test.setTimeout(90_000);
  await window.setViewportSize({ width: 1600, height: 1000 });
  fs.mkdirSync(testInfo.outputDir, { recursive: true });
  const sourcePng = testInfo.outputPath("Artwork.png");
  const resizedPsd = testInfo.outputPath("resized.psd");
  const paintedPsd = testInfo.outputPath("painted.psd");
  const red = [255, 0, 0, 255];
  const green = [0, 255, 0, 255];
  const blue = [0, 0, 255, 255];
  await writeArtworkPng(window, sourcePng, 16, red);
  writeArtworkPsd(resizedPsd, 32, green, true);
  writeArtworkPsd(paintedPsd, 32, blue, true);
  await mockOpenPng(app, sourcePng);
  await clickFileMenuItem(window, "Open Image...");
  await window.locator(".image-import-options-dialog .modal-btn-primary").click();
  await waitForCanvasOpenReady(window);
  await expect(window.locator(".layer-name", { hasText: "Artwork" })).toBeVisible();
  await waitForViviRuntime(window, ["useEditorStore", "useHistoryStore"]);

  await window.evaluate(() => {
    const editor = (window.__vivi2d as any).useEditorStore.getState();
    const layer = editor.project.layers.find((entry: any) => entry.name === "Artwork");
    editor.setMeshData(layer.id, {
      vertices: [0, 0, 15.5, 0, 0, 16, 16, 16],
      uvs: [0, 0, 1, 0, 0, 1, 1, 1],
      indices: [0, 1, 3, 0, 3, 2],
      divisionsX: 1,
      divisionsY: 1,
    });
  });
  await addBone(window, "Artwork");
  await selectLayer(window, "Artwork");
  await bindAllBones(window);
  const before = await authoringSnapshot(window);
  const layer = before.project.layers.find((entry: any) => entry.name === "Artwork");
  expect(layer.mesh.vertices[2]).toBe(15.5);
  expect(before.project.skins[layer.id].weights.length).toBeGreaterThan(0);
  expect(layer.importMetadata).toMatchObject({
    source: "manualPng",
    manualPng: {
      sourcePath: sourcePng,
      originalWidth: 16,
      originalHeight: 16,
      trimmedBounds: [0, 0, 16, 16],
    },
  });
  expect(before.redoLength).toBe(0);
  await expectRenderedArtwork(window, red);
  await saveAndExpectTexture(
    app,
    window,
    testInfo.outputPath("before.vivi"),
    layer.id,
    16,
    red,
  );

  await openReimportDialog(window);
  await mockOpenPsd(app, resizedPsd);
  await window.getByRole("button", { name: SELECT_PSD_BUTTON_PATTERN }).click();
  const choice = window.getByRole("checkbox", { name: "Artwork", exact: true });
  await expect(choice).not.toBeChecked();
  await expect(window.getByText(/入力 PSD のドキュメントサイズ: 64 × 64/)).toBeVisible();
  await expect(window.getByText("入力 PSD 内の位置: (17, 23) px")).toBeVisible();
  const apply = window.getByRole("button", { name: APPLY_BUTTON_PATTERN });
  await expect(apply).toBeDisabled();
  await choice.check();
  await expect(apply).toBeDisabled();
  await expect(window.getByText("Artwork: 16 × 16 → 32 × 32 px")).toBeVisible();
  await window.getByRole("button", { name: "同じフレームであることを確認" }).click();
  await apply.click();
  await expect(window.locator(".reimport-dialog")).not.toBeVisible();
  const replaced = await authoringSnapshot(window);
  expect(replaced.project).toEqual(before.project);
  expect(replaced.undoLength).toBe(before.undoLength + 1);
  expect(replaced.redoLength).toBe(0);
  await expectRenderedArtwork(window, green);
  await saveAndExpectTexture(
    app,
    window,
    testInfo.outputPath("resized.vivi"),
    layer.id,
    32,
    green,
  );

  // Use the real manual-PNG menu route and the same source path, changing only pixels.
  await writeArtworkPng(window, sourcePng, 16, blue);
  await selectLayer(window, "Artwork");
  await clickFileMenuItem(window, "Reimport Image Layer");
  await expect
    .poll(() => authoringSnapshot(window))
    .toEqual({ ...before, undoLength: before.undoLength + 2, redoLength: 0 });
  await expectRenderedArtwork(window, blue);
  await saveAndExpectTexture(
    app,
    window,
    testInfo.outputPath("png-updated.vivi"),
    layer.id,
    16,
    blue,
  );

  await window.keyboard.press("Control+z");
  await expect
    .poll(() => authoringSnapshot(window))
    .toEqual({ ...before, undoLength: before.undoLength + 1, redoLength: 1 });
  await expectRenderedArtwork(window, green);
  await saveAndExpectTexture(
    app,
    window,
    testInfo.outputPath("png-undone.vivi"),
    layer.id,
    32,
    green,
  );

  await window.keyboard.press("Control+z");
  await expect
    .poll(() => authoringSnapshot(window))
    .toEqual({ ...before, undoLength: before.undoLength, redoLength: 2 });
  await expectRenderedArtwork(window, red);
  await saveAndExpectTexture(
    app,
    window,
    testInfo.outputPath("psd-undone.vivi"),
    layer.id,
    16,
    red,
  );

  await window.keyboard.press("Control+Shift+z");
  await expect
    .poll(() => authoringSnapshot(window))
    .toEqual({ ...before, undoLength: before.undoLength + 1, redoLength: 1 });
  await expectRenderedArtwork(window, green);
  await saveAndExpectTexture(
    app,
    window,
    testInfo.outputPath("psd-redone.vivi"),
    layer.id,
    32,
    green,
  );

  await window.keyboard.press("Control+Shift+z");
  await expect
    .poll(() => authoringSnapshot(window))
    .toEqual({ ...before, undoLength: before.undoLength + 2, redoLength: 0 });
  await expectRenderedArtwork(window, blue);
  await saveAndExpectTexture(
    app,
    window,
    testInfo.outputPath("png-redone.vivi"),
    layer.id,
    16,
    blue,
  );

  // Return to 32px to retain same-size PSD and authored-size/raster-size save coverage.
  await window.keyboard.press("Control+z");
  await expect
    .poll(() => authoringSnapshot(window))
    .toEqual({ ...before, undoLength: before.undoLength + 1, redoLength: 1 });
  await expectRenderedArtwork(window, green);

  await openReimportDialog(window);
  await mockOpenPsd(app, paintedPsd);
  await window.getByRole("button", { name: SELECT_PSD_BUTTON_PATTERN }).click();
  await expect(
    window.getByRole("checkbox", { name: "Artwork", exact: true }),
  ).toBeChecked();
  await expect(
    window.getByText("テクスチャの画素数（現在 → 入力）: 32 × 32 → 32 × 32 px"),
  ).toBeVisible();
  await expect(
    window.getByRole("button", { name: "同じフレームであることを確認" }),
  ).not.toBeVisible();
  await window.getByRole("button", { name: APPLY_BUTTON_PATTERN }).click();
  await expect(window.locator(".reimport-dialog")).not.toBeVisible();
  const painted = await authoringSnapshot(window);
  expect(painted.project).toEqual(before.project);
  expect(painted.undoLength).toBe(before.undoLength + 2);
  expect(painted.redoLength).toBe(0);
  await expectRenderedArtwork(window, blue);
  const paintedFile = testInfo.outputPath("painted.vivi");
  await saveAndExpectTexture(app, window, paintedFile, layer.id, 32, blue);

  await clickFileMenuItem(window, "Close");
  await expect.poll(async () => (await authoringSnapshot(window)).project).toBeNull();
  await mockOpenVivi(app, paintedFile);
  await clickFileMenuItem(window, "Open");
  await expect(window.locator(".layer-item", { hasText: "Artwork" })).toBeVisible();
  const reloaded = await authoringSnapshot(window);
  expect(reloaded.project.layers).toEqual(before.project.layers);
  expect(reloaded.project.skins).toEqual(before.project.skins);
  expect([reloaded.project.width, reloaded.project.height]).toEqual([
    before.project.width,
    before.project.height,
  ]);
  await saveAndExpectTexture(
    app,
    window,
    testInfo.outputPath("reloaded.vivi"),
    layer.id,
    32,
    blue,
  );

  const exportDirectory = testInfo.outputPath("sdk");
  fs.mkdirSync(exportDirectory);
  await clickFileMenuItem(window, "SDK Export");
  await expect(window.locator(".export-dialog")).toBeVisible();
  await mockOpenPsd(app, exportDirectory);
  await window.locator(".export-dialog .modal-btn-primary").click();
  await expect(window.locator(".export-dialog")).not.toBeVisible();
  const png = fs.readFileSync(path.join(exportDirectory, "texture_00.png"));
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([32, 32]);
  await expectPngPixels(
    window,
    png.toString("base64"),
    { x: 0, y: 0, width: 32, height: 32 },
    blue,
  );
});
