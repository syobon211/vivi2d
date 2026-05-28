import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Page } from "playwright";
import { expect, test } from "../fixtures";
import { waitForViviRuntime } from "../helpers/app";
import {
  mockOpenPng,
  mockOpenPngFolder,
  mockOpenPngs,
  mockOpenVivi,
  mockSaveDialog,
} from "../helpers/dialog-mock";
import { clickFileMenuItem, selectLayer } from "../helpers/operations";
import {
  createPngFixtureSet,
  ONE_BY_ONE_PNG_BASE64,
  TRIMMED_FOUR_BY_FOUR_PNG_BASE64,
  TWO_BY_TWO_PNG_BASE64,
  writeBase64Png,
} from "../helpers/png-fixtures";

let tmpDir: string;
let pngAPath: string;
let pngBPath: string;

const EMPTY_PNG_FOLDER_MESSAGE =
  /Selected folder does not contain any PNG files\.|\u9078\u629e\u3057\u305f\u30d5\u30a9\u30eb\u30c0\u306b PNG \u30d5\u30a1\u30a4\u30eb\u304c\u3042\u308a\u307e\u305b\u3093\u3002/;
const MESH_SECTION_TITLE = /^(Mesh|\u30e1\u30c3\u30b7\u30e5)$/;
const REIMPORT_MISMATCH_MESSAGE =
  /no longer matches the current layer bounds|\u73fe\u5728\u306e\u30ec\u30a4\u30e4\u30fc\u5883\u754c\u3068\u4e00\u81f4\u3057\u307e\u305b\u3093/;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function reimportedMessage(layerName: string): RegExp {
  return new RegExp(
    `(?:Reimported|\\u518d\\u8aad\\u307f\\u8fbc\\u307f\\u3057\\u307e\\u3057\\u305f:) ${escapeRegExp(layerName)}\\.`,
  );
}

test.beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vivi2d-e2e-"));
  const fixtures = createPngFixtureSet(tmpDir);
  pngAPath = fixtures.themeLightPath;
  pngBPath = fixtures.initialLaunchPath;
});

test.afterEach(async () => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function confirmImageImportOptions(window: Page) {
  await window.locator(".image-import-options-dialog .modal-btn-primary").click();
}

async function cancelImageImportOptions(window: Page) {
  await window.locator(".image-import-options-dialog .modal-btn").first().click();
}

async function setImageImportOption(
  window: Page,
  label: string | RegExp,
  checked: boolean,
) {
  let checkbox =
    typeof label === "string"
      ? window.getByLabel(label, { exact: true })
      : window.getByLabel(label);
  if ((await checkbox.count()) === 0) {
    const labelText = String(label);
    const allCheckboxes = window.locator(
      ".image-import-options-row input[type='checkbox']",
    );
    const total = await allCheckboxes.count();
    let fallbackIndex = 0;
    if (/trim|トリミング/i.test(labelText)) fallbackIndex = 1;
    if (/group|グループ/i.test(labelText)) fallbackIndex = 2;
    if (/auto|メッシュ/i.test(labelText)) fallbackIndex = Math.max(0, total - 1);
    checkbox = allCheckboxes.nth(fallbackIndex);
  }
  if ((await checkbox.isChecked()) !== checked) {
    await checkbox.click();
  }
}

async function readLayerState(window: Page, layerName: string) {
  await waitForViviRuntime(window);
  return await window.evaluate((targetName) => {
    const vivi = window.__vivi2d as any;
    const project = vivi.useEditorStore.getState().project;
    if (!project) return null;

    const findLayerByName = (layers: any[]): any => {
      for (const layer of layers) {
        if (layer.name === targetName) return layer;
        if (layer.children?.length) {
          const found = findLayerByName(layer.children);
          if (found) return found;
        }
      }
      return null;
    };

    const layer = findLayerByName(project.layers);
    if (!layer) return null;
    return {
      projectWidth: project.width,
      projectHeight: project.height,
      name: layer.name,
      x: layer.x,
      y: layer.y,
      width: layer.width,
      height: layer.height,
      meshVertexCount: layer.mesh?.vertices?.length ?? 0,
      meshDivisionsX: layer.mesh?.divisionsX ?? null,
      meshDivisionsY: layer.mesh?.divisionsY ?? null,
      importMetadata: layer.importMetadata ?? null,
    };
  }, layerName);
}

async function waitForLayer(window: Page, layerName: string) {
  await expect(window.locator(".layer-name", { hasText: layerName })).toBeVisible({
    timeout: 10_000,
  });
}

async function setLocale(window: Page, locale: "ja" | "en") {
  await waitForViviRuntime(window, ["useI18nStore"]);
  await window.evaluate((nextLocale) => {
    const runtime = window.__vivi2d as any;
    localStorage.setItem("vivi2d-locale", nextLocale);
    runtime.useI18nStore.getState().setLocale(nextLocale);
  }, locale);
  await expect
    .poll(
      () =>
        window.evaluate(() => {
          const runtime = window.__vivi2d as any;
          return runtime.useI18nStore.getState().locale;
        }),
      { timeout: 5_000 },
    )
    .toBe(locale);
}

function meshToolButton(window: Page) {
  return window.locator(".tool-btn").nth(2);
}

async function simulateFileDrop(
  window: Page,
  files: Array<{ name: string; mimeType: string; bytes: Uint8Array }>,
) {
  const payload = files.map((file) => ({
    name: file.name,
    mimeType: file.mimeType,
    base64: Buffer.from(file.bytes).toString("base64"),
  }));

  await window.evaluate((entries) => {
    const dt = new DataTransfer();
    for (const entry of entries) {
      const binary = atob(entry.base64);
      const buf = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        buf[i] = binary.charCodeAt(i);
      }
      const file = new File([buf], entry.name, { type: entry.mimeType });
      dt.items.add(file);
    }

    globalThis.dispatchEvent(
      new DragEvent("dragover", {
        bubbles: true,
        cancelable: true,
        dataTransfer: dt,
      }),
    );
    globalThis.dispatchEvent(
      new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        dataTransfer: dt,
      }),
    );
  }, payload);
}

test("saving writes a .vivi file", async ({ app, window, loadTestPsd }) => {
  await loadTestPsd();

  const savePath = path.join(tmpDir, "test-project.vivi");
  await mockSaveDialog(app, savePath);
  await clickFileMenuItem(window, "Save");

  await expect(async () => {
    expect(fs.existsSync(savePath)).toBe(true);
  }).toPass({ timeout: 10_000 });

  const content = fs.readFileSync(savePath, "utf-8");
  const data = JSON.parse(content);
  expect(data.version).toBe(9);
  expect(data.project.name).toBe("test");
  expect(data.project.layers.length).toBeGreaterThan(0);
});

test("closing the project returns to the empty workspace", async ({
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();

  await clickFileMenuItem(window, "Close");

  await expect(window.locator(".workspace")).toBeVisible({ timeout: 5_000 });
  await expect(window.getByText("Background")).not.toBeVisible();
});

test("opening a saved .vivi restores the imported layers", async ({
  app,
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();

  const savePath = path.join(tmpDir, "roundtrip.vivi");
  await mockSaveDialog(app, savePath);
  await clickFileMenuItem(window, "Save");

  await expect(async () => {
    expect(fs.existsSync(savePath)).toBe(true);
  }).toPass({ timeout: 5_000 });

  await clickFileMenuItem(window, "Close");
  await expect(window.locator(".workspace")).toBeVisible({ timeout: 5_000 });

  await mockOpenVivi(app, savePath);
  await clickFileMenuItem(window, "Open");

  await expect(window.getByText("Background")).toBeVisible({ timeout: 10_000 });
  await expect(window.getByText("Red Circle")).toBeVisible();
});

test("opening a PNG creates a single ViviMesh project", async ({ app, window }) => {
  await mockOpenPng(app, pngAPath);
  await clickFileMenuItem(window, "Open Image...");
  await confirmImageImportOptions(window);

  await expect(window.locator(".project-name", { hasText: "theme-light" })).toBeVisible({
    timeout: 10_000,
  });
  await expect(window.locator(".layer-name", { hasText: "theme-light" })).toBeVisible({
    timeout: 10_000,
  });
  await expect(window.getByText("Background")).not.toBeVisible();
});

test("opening a PNG exposes Auto Setup as disabled in the File menu", async ({
  app,
  window,
}) => {
  await mockOpenPng(app, pngAPath);
  await clickFileMenuItem(window, "Open Image...");
  await confirmImageImportOptions(window);

  await expect(window.locator(".project-name", { hasText: "theme-light" })).toBeVisible({
    timeout: 10_000,
  });

  await window.locator(".menu-dropdown-trigger").first().click();
  await expect(
    window.locator(".menu-dropdown-item", {
      hasText: /Auto Setup|自動セットアップ/,
    }),
  ).toBeVisible();
  const autoSetupItem = window.locator(".menu-dropdown-item", {
    hasText: /Auto Setup|自動セットアップ/,
  });
  await expect(autoSetupItem).toBeDisabled();
  await expect(autoSetupItem).toHaveAttribute(
    "title",
    /single PNG|単一PNG|PSD|See-through/,
  );
});

test("manually split PNG projects can open Auto Setup", async ({ app, window }) => {
  await mockOpenPng(app, pngAPath);
  await clickFileMenuItem(window, "Open Image...");
  await confirmImageImportOptions(window);
  await expect(window.locator(".layer-name", { hasText: "theme-light" })).toBeVisible({
    timeout: 10_000,
  });

  await mockOpenPng(app, pngBPath);
  await clickFileMenuItem(window, "Import Image As Layer...");
  await confirmImageImportOptions(window);
  await expect(window.locator(".layer-name", { hasText: "initial-launch" })).toBeVisible({
    timeout: 10_000,
  });

  const meshLayerCount = await window.evaluate(() => {
    const project = window.__vivi2d?.useEditorStore.getState().project;
    if (!project) return 0;
    const walk = (layers: Array<{ kind?: string; children?: unknown[] }>): number =>
      layers.reduce((count, layer) => {
        const own = layer.kind === "viviMesh" ? 1 : 0;
        const childCount = Array.isArray(layer.children)
          ? walk(layer.children as Array<{ kind?: string; children?: unknown[] }>)
          : 0;
        return count + own + childCount;
      }, 0);
    return walk(project.layers);
  });
  expect(meshLayerCount).toBeGreaterThanOrEqual(2);
  const meshLayerIds = await window.evaluate(() => {
    const project = window.__vivi2d?.useEditorStore.getState().project;
    if (!project) return [];
    const meshes: Array<{
      id?: string;
      kind?: string;
      children?: unknown[];
    }> = [];
    const walk = (
      layers: Array<{
        id?: string;
        kind?: string;
        children?: unknown[];
      }>,
    ) => {
      for (const layer of layers) {
        if (layer.kind === "viviMesh") meshes.push(layer);
        if (Array.isArray(layer.children)) {
          walk(
            layer.children as Array<{
              id?: string;
              kind?: string;
              children?: unknown[];
            }>,
          );
        }
      }
    };
    walk(project.layers);
    return meshes.map((mesh) => mesh.id).filter(Boolean).slice(0, 2);
  });
  await window.evaluate((ids) => {
    const editor = window.__vivi2d?.useEditorStore.getState();
    if (!editor || ids.length < 2) return;
    editor.setLayerSemanticRole(ids[0], "hair");
    editor.setLayerSemanticRole(ids[1], "body");
  }, meshLayerIds);

  await window.locator(".menu-dropdown-trigger").first().click();
  const autoSetupItem = window.locator(".menu-dropdown-item", {
    hasText: /Auto Setup|自動セットアップ/,
  });
  await expect(autoSetupItem).toBeVisible();
  await expect(autoSetupItem).toBeEnabled();
  await autoSetupItem.click();
  await expect(window.locator(".auto-setup-dialog")).toBeVisible({ timeout: 5_000 });
});

test("opening a PNG can trim transparent bounds", async ({ app, window }) => {
  const trimmedPath = path.join(tmpDir, "trimmed-open.png");
  writeBase64Png(trimmedPath, TRIMMED_FOUR_BY_FOUR_PNG_BASE64);

  await mockOpenPng(app, trimmedPath);
  await clickFileMenuItem(window, "Open Image...");
  await setImageImportOption(
    window,
    /Trim transparent bounds|透明な余白をトリミング/,
    true,
  );
  await confirmImageImportOptions(window);

  await waitForLayer(window, "trimmed-open");
  const layer = await readLayerState(window, "trimmed-open");
  expect(layer).toMatchObject({
    x: 1,
    y: 1,
    width: 2,
    height: 2,
    importMetadata: {
      source: "manualPng",
      manualPng: {
        trimmedBounds: [1, 1, 2, 2],
        trimTransparentBoundsApplied: true,
        placementMode: "preserveImageOffset",
      },
    },
  });
});

test("opening a PNG keeps original bounds when trim is disabled", async ({
  app,
  window,
}) => {
  const untrimmedPath = path.join(tmpDir, "untrimmed-open.png");
  writeBase64Png(untrimmedPath, TRIMMED_FOUR_BY_FOUR_PNG_BASE64);

  await mockOpenPng(app, untrimmedPath);
  await clickFileMenuItem(window, "Open Image...");
  await confirmImageImportOptions(window);

  await waitForLayer(window, "untrimmed-open");
  const layer = await readLayerState(window, "untrimmed-open");
  expect(layer).toMatchObject({
    x: 0,
    y: 0,
    width: 4,
    height: 4,
    importMetadata: {
      source: "manualPng",
      manualPng: {
        trimmedBounds: [0, 0, 4, 4],
        trimTransparentBoundsApplied: false,
        placementMode: "preserveImageOffset",
      },
    },
  });
});

test("canceling the image import options dialog leaves the workspace unchanged", async ({
  app,
  window,
}) => {
  await mockOpenPng(app, pngAPath);
  await clickFileMenuItem(window, "Open Image...");
  await expect(window.locator(".image-import-options-dialog")).toBeVisible();

  await cancelImageImportOptions(window);

  await expect(window.locator(".image-import-options-dialog")).not.toBeVisible();
  await expect(
    window.locator(".project-name", { hasText: "theme-light" }),
  ).not.toBeVisible();
  await expect(
    window.locator(".layer-name", { hasText: "theme-light" }),
  ).not.toBeVisible();
});

test("importing PNG images adds top-level layers in order", async ({
  app,
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();

  await mockOpenPngs(app, [pngAPath, pngBPath]);
  await clickFileMenuItem(window, "Import Images As Layers...");
  await confirmImageImportOptions(window);

  await expect(window.locator(".layer-name", { hasText: "theme-light" })).toBeVisible({
    timeout: 10_000,
  });
  await expect(window.locator(".layer-name", { hasText: "initial-launch" })).toBeVisible({
    timeout: 10_000,
  });

  const layerNames = await window.locator(".layer-name").allTextContents();
  const themeIndex = layerNames.findIndex((name) => name.includes("theme-light"));
  const initialIndex = layerNames.findIndex((name) => name.includes("initial-launch"));
  expect(themeIndex).toBeGreaterThan(-1);
  expect(initialIndex).toBeGreaterThan(themeIndex);
});

test("importing PNG images can group imported layers", async ({
  app,
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();

  await mockOpenPngs(app, [pngAPath, pngBPath]);
  await clickFileMenuItem(window, "Import Images As Layers...");
  await setImageImportOption(
    window,
    /Create group for imported layers|読み込みレイヤーをグループ化/,
    true,
  );
  await confirmImageImportOptions(window);

  await expect(window.locator(".layer-name", { hasText: "Imported Images" })).toBeVisible(
    {
      timeout: 10_000,
    },
  );
  await expect(window.locator(".layer-name", { hasText: "theme-light" })).toBeVisible();
  await expect(
    window.locator(".layer-name", { hasText: "initial-launch" }),
  ).toBeVisible();
});

test("importing a PNG layer can center it on the canvas", async ({
  app,
  window,
  loadTestPsd,
}) => {
  const trimmedPath = path.join(tmpDir, "trimmed-centered.png");
  writeBase64Png(trimmedPath, TRIMMED_FOUR_BY_FOUR_PNG_BASE64);

  await loadTestPsd();
  await mockOpenPng(app, trimmedPath);
  await clickFileMenuItem(window, "Import Image As Layer...");
  await setImageImportOption(window, /Center on canvas|キャンバス中央に配置/, true);
  await setImageImportOption(
    window,
    /Trim transparent bounds|透明な余白をトリミング/,
    true,
  );
  await confirmImageImportOptions(window);

  await waitForLayer(window, "trimmed-centered");
  const layer = await readLayerState(window, "trimmed-centered");
  const expectedX = Math.round(((layer?.projectWidth ?? 0) - 2) / 2);
  const expectedY = Math.round(((layer?.projectHeight ?? 0) - 2) / 2);
  expect(layer).toMatchObject({
    x: expectedX,
    y: expectedY,
    width: 2,
    height: 2,
    importMetadata: {
      source: "manualPng",
      manualPng: {
        finalOrigin: [expectedX, expectedY],
        placementMode: "centerOnCanvas",
        trimTransparentBoundsApplied: true,
      },
    },
  });
});

test("importing a PNG layer preserves image offset when center is disabled", async ({
  app,
  window,
  loadTestPsd,
}) => {
  const trimmedPath = path.join(tmpDir, "trimmed-offset.png");
  writeBase64Png(trimmedPath, TRIMMED_FOUR_BY_FOUR_PNG_BASE64);

  await loadTestPsd();
  await mockOpenPng(app, trimmedPath);
  await clickFileMenuItem(window, "Import Image As Layer...");
  await setImageImportOption(window, "Trim transparent bounds", true);
  await confirmImageImportOptions(window);

  await waitForLayer(window, "trimmed-offset");
  const layer = await readLayerState(window, "trimmed-offset");
  expect(layer).toMatchObject({
    x: 1,
    y: 1,
    width: 2,
    height: 2,
    importMetadata: {
      source: "manualPng",
      manualPng: {
        finalOrigin: [1, 1],
        placementMode: "preserveImageOffset",
        trimTransparentBoundsApplied: true,
      },
    },
  });
});

test("importing a PNG layer can request auto-generated mesh", async ({
  app,
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();

  await mockOpenPng(app, pngAPath);
  await clickFileMenuItem(window, "Import Image As Layer...");
  await setImageImportOption(window, /Auto-generate mesh|自動メッシュ生成/, true);
  await confirmImageImportOptions(window);

  await waitForLayer(window, "theme-light");
  const layer = await readLayerState(window, "theme-light");
  expect(layer).not.toBeNull();
  expect(layer?.importMetadata).toMatchObject({
    source: "manualPng",
    manualPng: {
      autoGenerateMeshApplied: true,
    },
  });
  expect(layer?.meshVertexCount ?? 0).toBeGreaterThan(0);
});

test("importing a PNG layer keeps the default mesh when auto-generate mesh is disabled", async ({
  app,
  window,
  loadTestPsd,
}) => {
  const defaultMeshPath = path.join(tmpDir, "default-mesh.png");
  writeBase64Png(defaultMeshPath, ONE_BY_ONE_PNG_BASE64);

  await loadTestPsd();
  await mockOpenPng(app, defaultMeshPath);
  await clickFileMenuItem(window, "Import Image As Layer...");
  await confirmImageImportOptions(window);

  await waitForLayer(window, "default-mesh");
  const layer = await readLayerState(window, "default-mesh");
  expect(layer).not.toBeNull();
  expect(layer?.importMetadata).toMatchObject({
    source: "manualPng",
    manualPng: {
      autoGenerateMeshApplied: false,
    },
  });
  expect(layer?.meshDivisionsX).toBeGreaterThan(0);
  expect(layer?.meshDivisionsY).toBeGreaterThan(0);
});

test("importing a PNG layer supports undo and redo", async ({
  app,
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();

  await mockOpenPng(app, pngAPath);
  await clickFileMenuItem(window, "Import Image As Layer...");
  await confirmImageImportOptions(window);

  await waitForLayer(window, "theme-light");

  await window.keyboard.press("Control+Z");
  await expect(window.locator(".layer-name", { hasText: "theme-light" })).toHaveCount(0);

  await window.keyboard.press("Control+Shift+Z");
  await waitForLayer(window, "theme-light");
});

test("importing a PNG folder adds top-level layers in deterministic order", async ({
  app,
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();

  const folderPath = path.join(tmpDir, "manual-layers");
  fs.mkdirSync(folderPath);
  fs.copyFileSync(pngBPath, path.join(folderPath, "zeta-initial.png"));
  fs.copyFileSync(pngAPath, path.join(folderPath, "alpha-theme.png"));

  await mockOpenPngFolder(app, folderPath);
  await clickFileMenuItem(window, "Import Folder As Layers...");
  await confirmImageImportOptions(window);

  await expect(window.locator(".layer-name", { hasText: "alpha-theme" })).toBeVisible({
    timeout: 10_000,
  });
  await expect(window.locator(".layer-name", { hasText: "zeta-initial" })).toBeVisible({
    timeout: 10_000,
  });

  const layerNames = await window.locator(".layer-name").allTextContents();
  const aIndex = layerNames.findIndex((name) => name.includes("alpha-theme"));
  const bIndex = layerNames.findIndex((name) => name.includes("zeta-initial"));
  expect(aIndex).toBeGreaterThan(-1);
  expect(bIndex).toBeGreaterThan(aIndex);
});

test("importing an empty PNG folder warns and leaves the project unchanged", async ({
  app,
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();

  const layerCountBefore = await window.locator(".layer-item").count();
  const folderPath = path.join(tmpDir, "empty-manual-layers");
  fs.mkdirSync(folderPath);

  await mockOpenPngFolder(app, folderPath);
  await clickFileMenuItem(window, "Import Folder As Layers...");
  await confirmImageImportOptions(window);

  await expect(
    window.locator(".notification-message", {
      hasText: EMPTY_PNG_FOLDER_MESSAGE,
    }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(window.locator(".layer-item")).toHaveCount(layerCountBefore);
});

test("importing a PNG folder rolls back if one file is invalid", async ({
  app,
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();

  const layerCountBefore = await window.locator(".layer-item").count();
  const folderPath = path.join(tmpDir, "broken-manual-layers");
  fs.mkdirSync(folderPath);
  fs.copyFileSync(pngAPath, path.join(folderPath, "valid-layer.png"));
  fs.writeFileSync(
    path.join(folderPath, "broken-layer.png"),
    Buffer.from([0x89, 0x50, 0x4e]),
  );

  await mockOpenPngFolder(app, folderPath);
  await clickFileMenuItem(window, "Import Folder As Layers...");
  await confirmImageImportOptions(window);

  await expect(window.locator(".notification-message")).toContainText(/png|image/i, {
    timeout: 10_000,
  });
  await expect(window.locator(".layer-item")).toHaveCount(layerCountBefore);
  await expect(window.locator(".layer-name", { hasText: "valid-layer" })).toHaveCount(0);
});

test("reimporting a manual PNG layer uses its stored source path", async ({
  app,
  window,
}) => {
  const reimportPath = path.join(tmpDir, "reimport-source.png");
  fs.copyFileSync(pngAPath, reimportPath);

  await mockOpenPng(app, reimportPath);
  await clickFileMenuItem(window, "Open Image...");
  await confirmImageImportOptions(window);

  await expect(window.locator(".layer-name", { hasText: "reimport-source" })).toBeVisible(
    {
      timeout: 10_000,
    },
  );
  await selectLayer(window, "reimport-source");
  await clickFileMenuItem(window, "Reimport Image Layer");

  await expect(
    window.locator(".notification-message", {
      hasText: reimportedMessage("reimport-source"),
    }),
  ).toBeVisible({ timeout: 10_000 });
});

test("manual PNG reimport notifications follow the active locale", async ({
  app,
  window,
}) => {
  await setLocale(window, "en");
  const reimportPath = path.join(tmpDir, "localized-reimport.png");
  fs.copyFileSync(pngAPath, reimportPath);

  await mockOpenPng(app, reimportPath);
  await clickFileMenuItem(window, "Open Image...");
  await confirmImageImportOptions(window);
  await waitForLayer(window, "localized-reimport");
  await selectLayer(window, "localized-reimport");

  await clickFileMenuItem(window, "Reimport Image Layer");
  await expect(
    window.locator(".notification-message", {
      hasText: "Reimported localized-reimport.",
    }),
  ).toBeVisible({ timeout: 10_000 });

  await setLocale(window, "ja");
  await clickFileMenuItem(window, "Reimport Image Layer");
  await expect(
    window.locator(".notification-message", {
      hasText: "\u518d\u8aad\u307f\u8fbc\u307f\u3057\u307e\u3057\u305f: localized-reimport.",
    }),
  ).toBeVisible({ timeout: 10_000 });
});

test("manual PNG import survives save, reopen, and reimport", async ({ app, window }) => {
  const reimportPath = path.join(tmpDir, "roundtrip-source.png");
  writeBase64Png(reimportPath, ONE_BY_ONE_PNG_BASE64);

  await mockOpenPng(app, reimportPath);
  await clickFileMenuItem(window, "Open Image...");
  await confirmImageImportOptions(window);

  const savePath = path.join(tmpDir, "manual-png-roundtrip.vivi");
  await mockSaveDialog(app, savePath);
  await clickFileMenuItem(window, "Save");

  await expect(async () => {
    expect(fs.existsSync(savePath)).toBe(true);
  }).toPass({ timeout: 5_000 });

  await clickFileMenuItem(window, "Close");
  await expect(window.locator(".workspace")).toBeVisible({ timeout: 5_000 });

  await mockOpenVivi(app, savePath);
  await clickFileMenuItem(window, "Open");
  await waitForLayer(window, "roundtrip-source");

  await selectLayer(window, "roundtrip-source");
  await clickFileMenuItem(window, "Reimport Image Layer");

  await expect(
    window.locator(".notification-message", {
      hasText: reimportedMessage("roundtrip-source"),
    }),
  ).toBeVisible({ timeout: 10_000 });
});

test("manual PNG mesh editing supports undo and redo", async ({ app, window }) => {
  await mockOpenPng(app, pngAPath);
  await clickFileMenuItem(window, "Open Image...");
  await confirmImageImportOptions(window);

  await waitForLayer(window, "theme-light");
  await selectLayer(window, "theme-light");

  const meshTool = meshToolButton(window);
  await meshTool.click();
  await expect(meshTool).toHaveClass(/active/);
  await expect(
    window
      .locator(".properties-section")
      .filter({
        has: window.locator(".prop-section-title", { hasText: MESH_SECTION_TITLE }),
      })
      .first(),
  ).toBeVisible();

  const before = await readLayerState(window, "theme-light");
  expect(before).not.toBeNull();

  await window.locator(".auto-mesh-btn").first().click();

  let after = await readLayerState(window, "theme-light");
  await expect(async () => {
    after = await readLayerState(window, "theme-light");
    expect(after).not.toBeNull();
    expect(after!.meshVertexCount).not.toBe(before!.meshVertexCount);
  }).toPass({ timeout: 5_000 });

  await window.keyboard.press("Control+Z");
  await expect(async () => {
    const undone = await readLayerState(window, "theme-light");
    expect(undone).not.toBeNull();
    expect(undone!.meshVertexCount).toBe(before!.meshVertexCount);
  }).toPass({ timeout: 5_000 });

  await window.keyboard.press("Control+Shift+Z");
  await expect(async () => {
    const redone = await readLayerState(window, "theme-light");
    expect(redone).not.toBeNull();
    expect(redone!.meshVertexCount).toBe(after!.meshVertexCount);
  }).toPass({ timeout: 5_000 });
});

test("reimport image layer is disabled when its source path is missing", async ({
  app,
  window,
}) => {
  const reimportPath = path.join(tmpDir, "missing-source.png");
  fs.copyFileSync(pngAPath, reimportPath);

  await mockOpenPng(app, reimportPath);
  await clickFileMenuItem(window, "Open Image...");
  await confirmImageImportOptions(window);

  await selectLayer(window, "missing-source");
  await window.evaluate(() => {
    const vivi = window.__vivi2d as any;
    const selectedLayerId = vivi.useSelectionStore.getState().selectedLayerId;
    vivi.useEditorStore.setState((state: any) => {
      const walk = (layers: any[]): boolean => {
        for (const layer of layers) {
          if (layer.id === selectedLayerId) {
            layer.importMetadata.manualPng.sourcePath = undefined;
            return true;
          }
          if (layer.children?.length && walk(layer.children)) {
            return true;
          }
        }
        return false;
      };
      walk(state.project.layers);
    });
  });

  const fileTrigger = window
    .locator(".menu-dropdown-trigger", { hasText: /File/ })
    .first();
  const fallbackTrigger = window.locator(".menu-dropdown-trigger").first();
  if ((await fileTrigger.count()) > 0) {
    await fileTrigger.click();
  } else {
    await fallbackTrigger.click();
  }
  const disabledItemCandidates = [
    window.getByRole("menuitem", { name: "Reimport Image Layer", exact: true }),
    window.getByRole("menuitem", { name: "画像レイヤーを再読込", exact: true }),
  ];
  const disabledItem =
    (await disabledItemCandidates[0]!.count()) > 0
      ? disabledItemCandidates[0]!
      : disabledItemCandidates[1]!;
  await expect(disabledItem).toBeDisabled();
  await expect(disabledItem).toHaveAttribute("title", /missing a source path/i);
});

test("reimporting a manual PNG layer rejects mismatched bounds", async ({
  app,
  window,
}) => {
  const reimportPath = path.join(tmpDir, "shape.png");
  writeBase64Png(reimportPath, ONE_BY_ONE_PNG_BASE64);

  await mockOpenPng(app, reimportPath);
  await clickFileMenuItem(window, "Open Image...");
  await confirmImageImportOptions(window);

  await selectLayer(window, "shape");
  writeBase64Png(reimportPath, TWO_BY_TWO_PNG_BASE64);
  await clickFileMenuItem(window, "Reimport Image Layer");

  await expect(
    window.locator(".notification-message", {
      hasText: REIMPORT_MISMATCH_MESSAGE,
    }),
  ).toBeVisible({ timeout: 10_000 });
});

test("dropping mixed PSD and PNG files shows a warning", async ({ window }) => {
  const psdBytes = fs.readFileSync(
    path.resolve(import.meta.dirname, "../fixtures/test.psd"),
  );
  const pngBytes = fs.readFileSync(pngAPath);

  await simulateFileDrop(window, [
    { name: "test.psd", mimeType: "image/vnd.adobe.photoshop", bytes: psdBytes },
    { name: "theme-light.png", mimeType: "image/png", bytes: pngBytes },
  ]);

  await expect(
    window.locator(".notification-message", {
      hasText: "Drop either a single PSD file or PNG files, not a mixture.",
    }),
  ).toBeVisible({ timeout: 10_000 });
});

test("dropping unsupported image types shows a warning", async ({ window }) => {
  await simulateFileDrop(window, [
    {
      name: "unsupported.jpg",
      mimeType: "image/jpeg",
      bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
    },
  ]);

  await expect(
    window.locator(".notification-message", {
      hasText: "Manual image import currently supports PNG files only.",
    }),
  ).toBeVisible({ timeout: 10_000 });
});
