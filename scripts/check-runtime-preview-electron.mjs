// Windows-only real source Electron composition proof. The original fixture
// cases remain separate from the final actual-main/CopyPanel acceptance phase.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { _electron as electron, expect } from "@playwright/test";
import { build } from "vite";
import {
  buildLocalAssetAddon,
  buildLocalAssetManifestSeeder,
} from "./build-local-asset-addon.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (process.platform !== "win32" || process.arch !== "x64")
  throw Error("Runtime preview proof requires actual Windows x64 Electron");
if (process.argv.length !== 2) throw Error("This fixed proof accepts no options");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
function pin(relative) {
  const full = path.join(root, relative),
    stat = fs.lstatSync(full),
    bytes = fs.readFileSync(full);
  assert(stat.isFile() && !stat.isSymbolicLink());
  assert.equal(fs.realpathSync.native(full).toLowerCase(), full.toLowerCase());
  return { path: relative, byteLength: bytes.length, sha256: hash(bytes) };
}
const sourcePaths = [
  "scripts/check-runtime-preview-electron.mjs",
  "scripts/fixtures/runtime-preview-electron.cjs",
  "scripts/fixtures/runtime-preview-page.tsx",
  "scripts/fixtures/local-asset-manifest-seed.rs",
  "scripts/build-local-asset-addon.mjs",
  "scripts/build-local-exchange-host.mjs",
  "electron/native-local-asset/addon.c",
  "electron/native-local-asset.cjs",
  "electron/local-asset-copy.ts",
  "electron/local-exchange-host.ts",
  "electron/ipc/local-asset-copy.cjs",
  "electron/ipc/local-exchange.cjs",
  "electron/ipc-contract.cjs",
  "electron/local-asset-copy-contract.cjs",
  "electron/security.cjs",
  "electron/preload.cjs",
  "electron/main.cjs",
  "electron/window.cjs",
  "src/components/RuntimePreviewPanel.tsx",
  "src/components/LocalAssetCopyPanel.tsx",
  "src/components/LocalExchangePanel.tsx",
  "src/components/AIGenerateDialog.tsx",
  "src/components/DialogShell.tsx",
  "src/hooks/useDialog.ts",
  "src/lib/runtime-evaluation-preview.ts",
  "src/lib/local-asset-copy.ts",
  "src/lib/local-exchange-provider.ts",
  "src/lib/i18n/en/dialog.ts",
  "src/lib/i18n/ja/dialog.ts",
  "src/lib/i18n/en/menu.ts",
  "src/lib/i18n/ja/menu.ts",
  "packages/runtime-wasm/src/internal/evaluation-runtime-v1.ts",
  "packages/runtime-wasm/src/native-evaluation-wasm-bytes.ts",
  "packages/runtime-wasm/src/native-png-wasm-bytes.ts",
  "packages/runtime-wasm/src/__tests__/fixtures/evaluation-project.ts",
  "packages/renderer-pixi/src/renderer.ts",
  "packages/renderer-pixi/src/evaluation-model.ts",
  "packages/runtime-native/Cargo.lock",
  "vite.config.ts",
  "vite.aliases.ts",
];
const sourcePinsBefore = sourcePaths.map(pin);
function builtEditorPins() {
  const paths = [];
  function visit(relative) {
    const directory = path.join(root, relative);
    assert(fs.lstatSync(directory).isDirectory());
    assert.equal(
      fs.realpathSync.native(directory).toLowerCase(),
      directory.toLowerCase(),
    );
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      assert(!entry.isSymbolicLink());
      const child = `${relative}/${entry.name}`;
      if (entry.isDirectory()) visit(child);
      else {
        assert(entry.isFile());
        paths.push(child);
      }
    }
  }
  visit("dist");
  assert(paths.includes("dist/index.html"), "Fresh normal Editor build required");
  return paths.sort().map(pin);
}
const editorBuildPinsBefore = builtEditorPins();
const directory = fs.mkdtempSync(path.join(root, "tmp/runtime-preview-electron-"));
const evidence = [],
  errors = [];
let stage = "build",
  app;
const pngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAMAAADD/I+4AAAABlBMVEX/AAAA/wDSh+9xAAAAC0lEQVR4nGNgYAQAAAQAAr96P0oAAAAASUVORK5CYII=";
// Fixed public wire fixture adapted from evaluationProject(true), whose source
// is pinned above. No fixtureHost/resolver mock is imported or used here.
const mesh = (id, left, right, visible) => ({
  id,
  name: id,
  kind: "viviMesh",
  visible,
  opacity: 1,
  x: 0,
  y: 0,
  width: 64,
  height: 64,
  blendMode: "normal",
  expanded: true,
  children: [],
  mesh: {
    vertices: [left, 8, right, 8, left, 56, right, 56],
    uvs: [0.25, 0.5, 0.25, 0.5, 0.25, 0.5, 0.25, 0.5],
    indices: [0, 1, 2, 2, 1, 3],
    divisionsX: 1,
    divisionsY: 1,
  },
});
const layers = [
  mesh("parent", 8, 56, false),
  mesh("child", 24, 40, false),
  {
    ...mesh("target", 0, 64, true),
    clipMasks: [
      { layerId: "parent", invert: false },
      { layerId: "child", invert: true },
    ],
  },
];
const projectTemplate = {
  version: 11,
  assetMode: "referenced",
  project: {
    name: "Actual Electron runtime witness",
    width: 64,
    height: 64,
    layers,
    parameters: [{ id: "p", name: "P", minValue: -1, maxValue: 1, defaultValue: 0 }],
    clips: [],
    scenes: [],
    physicsGroups: [],
    skins: {},
    parameterBindings: [],
    sceneBlends: [],
    ikControllers: [],
    offscreenTargets: [],
    expressionPresets: [{ id: "one", name: "One", values: { p: 1 } }],
    colliders: [],
    stateMachines: [],
    lipsyncConfig: {
      enabled: false,
      targetParameterId: null,
      source: "microphone",
      threshold: 0.02,
      smoothing: 0.7,
      gain: 2,
    },
  },
  atlases: [
    {
      id: "atlas",
      image: {},
      width: 2,
      height: 1,
      entries: layers.map((layer) => ({
        layerId: layer.id,
        x: 0,
        y: 0,
        width: 2,
        height: 1,
      })),
    },
  ],
  requires: [
    { id: "vivi.cap.referencedAssets", minVersion: 1, requiredFor: ["render"] },
    { id: "vivi.cap.maskInvert", minVersion: 1, requiredFor: ["render"] },
  ],
};
function runNode(script) {
  const result = spawnSync(process.execPath, [path.join(root, script)], {
    cwd: root,
    encoding: "utf8",
    timeout: 120000,
  });
  if (result.status !== 0) throw Error(`Prerequisite failed: ${script}`);
}
try {
  const manifest = await buildLocalAssetAddon();
  const seeder = buildLocalAssetManifestSeeder(manifest);
  runNode("scripts/build-local-exchange-host.mjs");
  const entry = path.join(directory, "index.html");
  fs.writeFileSync(
    entry,
    '<!doctype html><html><head><meta charset="utf-8"><title>Runtime preview actual Electron</title><style>canvas{display:block}</style></head><body style="margin:0;background:white"><div id="root"></div><script type="module" src="/scripts/fixtures/runtime-preview-page.tsx"></script></body></html>',
    { flag: "wx" },
  );
  const output = path.join(directory, "page");
  await build({
    configFile: path.join(root, "vite.config.ts"),
    root,
    base: "./",
    logLevel: "warn",
    build: { outDir: output, emptyOutDir: false, rollupOptions: { input: entry } },
  });
  // Vite preserves the input's root-relative HTML path when it is outside the
  // root index. Resolve that one fixed path; do not load an alternate app page.
  const builtHtml = path.join(output, path.relative(root, entry));
  assert(fs.statSync(builtHtml).isFile());
  const userData = path.join(directory, "profile");
  fs.mkdirSync(userData);
  const config = path.join(directory, "config.json");
  fs.writeFileSync(
    config,
    JSON.stringify({
      appRoot: root,
      userData,
      pageUrl: pathToFileURL(builtHtml).href,
      projectTemplate,
      pngBase64,
      seeder: seeder.executable,
    }),
    { flag: "wx" },
  );
  const env = { ...process.env, NODE_ENV: "test" };
  for (const name of Object.keys(env))
    if (/^(ELECTRON_RUN_AS_NODE|NODE_OPTIONS|NODE_PATH|VITE_DEV_SERVER_URL)$/i.test(name))
      delete env[name];
  stage = "electron-start";
  app = await electron.launch({
    args: [path.join(root, "scripts/fixtures/runtime-preview-electron.cjs"), config],
    env,
    timeout: 60000,
  });
  const page = await app.firstWindow();
  page.on("pageerror", () => errors.push("renderer-pageerror"));
  await page.waitForFunction(() => Boolean(window.__runtimePreviewFixture), undefined, {
    timeout: 60000,
  });
  const main = (name, ...args) =>
    app.evaluate(
      (_electron, { name, args }) => globalThis.__runtimePreviewMain[name](...args),
      { name, args },
    );
  const info = await main("info");
  const mount = async (cellId = info.sourceId) => {
    await page.evaluate((cell) => window.__runtimePreviewFixture.mount(cell), cellId);
    await expect(
      page.getByRole("button", { name: "Preview a Project", exact: true }),
    ).toBeEnabled();
  };
  const ready = async () =>
    expect(page.locator("output")).toHaveText("Preview ready", { timeout: 60000 });
  const load = async (kind) => {
    await main("choose", kind);
    await page.getByRole("button", { name: /^(Preview a Project|Reload)$/ }).click();
    await ready();
  };
  async function canvasPixels(canvas) {
    await canvas.scrollIntoViewIfNeeded();
    const geometry = () =>
      canvas.evaluate((element) => {
        const rect = element.getBoundingClientRect(),
          style = getComputedStyle(element);
        const transforms = [];
        for (let node = element; node; node = node.parentElement) {
          const value = getComputedStyle(node);
          transforms.push({ transform: value.transform, zoom: value.zoom });
        }
        return {
          intrinsic: { width: element.width, height: element.height },
          rect: rect.toJSON(),
          css: { width: style.width, height: style.height },
          edges: [
            style.borderTopWidth,
            style.borderRightWidth,
            style.borderBottomWidth,
            style.borderLeftWidth,
            style.paddingTop,
            style.paddingRight,
            style.paddingBottom,
            style.paddingLeft,
          ],
          transforms,
          devicePixelRatio,
        };
      });
    const before = await geometry();
    assert.deepEqual(before.intrinsic, { width: 512, height: 512 });
    assert.deepEqual(before.css, { width: "512px", height: "512px" });
    assert.equal(before.rect.width, 512);
    assert.equal(before.rect.height, 512);
    assert.equal(before.devicePixelRatio, 1);
    assert(before.edges.every((value) => value === "0px"));
    assert(
      before.transforms.every(
        (value) => value.transform === "none" && value.zoom === "1",
      ),
    );
    // Locator screenshots use the integer outer clip, not a scaled 513px canvas.
    const clip = { x: Math.floor(before.rect.left), y: Math.floor(before.rect.top) };
    const offset = { x: before.rect.left - clip.x, y: before.rect.top - clip.y };
    const bytes = await canvas.screenshot();
    assert.deepEqual(await geometry(), before, "Canvas moved during screenshot");
    const observed = await app.evaluate(
      ({ nativeImage }, { bytes, offset }) => {
        const image = nativeImage.createFromBuffer(Buffer.from(bytes)),
          bitmap = image.toBitmap(),
          size = image.getSize();
        return {
          size,
          points: [
            [4, 32],
            [16, 32],
            [32, 32],
            [48, 32],
            [60, 32],
          ].map(([x, y]) => {
            const bitmapX = Math.floor(x + offset.x),
              bitmapY = Math.floor(y + offset.y);
            const i = (bitmapY * size.width + bitmapX) * 4;
            return {
              x,
              y,
              bitmapX,
              bitmapY,
              rgba: [bitmap[i + 2], bitmap[i + 1], bitmap[i], bitmap[i + 3]],
            };
          }),
        };
      },
      { bytes: Array.from(bytes), offset },
    );
    assert.deepEqual(observed.size, {
      width: Math.ceil(before.rect.right) - clip.x,
      height: Math.ceil(before.rect.bottom) - clip.y,
    });
    return {
      pixels: observed.points,
      geometry: { ...before, clip, offset, screenshot: observed.size },
      png: { byteLength: bytes.length, sha256: hash(bytes) },
    };
  }
  async function pixels(label) {
    const observed = await canvasPixels(page.locator("canvas"));
    // The canvas is composited over the real white page by Chromium's screen
    // capture: nested inverse mask leaves red bars and white holes/outside.
    assert.deepEqual(
      observed.pixels.map((p) => p.rgba),
      [
        [255, 255, 255, 255],
        [255, 0, 0, 255],
        [255, 255, 255, 255],
        [255, 0, 0, 255],
        [255, 255, 255, 255],
      ],
    );
    evidence.push({
      check: label,
      ...observed,
    });
    return observed.png.sha256;
  }
  stage = "blob-panel-first-draw";
  await mount();
  await load("blob");
  await expect(page.getByText(/^Runtime generation: .*\/0$/)).toBeVisible();
  await pixels("real-blob-closed-IPC-EDH-WASM-Pixi-nested-inverse-mask");
  await page.getByRole("slider").press("End");
  await expect(page.getByText(/^Runtime generation: .*\/1$/)).toBeVisible();
  await page.getByRole("button", { name: "Expression preset one", exact: true }).click();
  await expect(page.getByRole("slider")).toHaveValue("1");
  await expect(page.getByText(/^Runtime generation: .*\/2$/)).toBeVisible();
  evidence.push({
    check: "actual-UI-parameter-and-preset-updates",
    dynamicGenerations: [0, 1, 2],
  });
  stage = "raw-manifest";
  await load("manifest");
  const incumbent = await pixels("real-raw-manifest-opaque-pixels");
  const capture = (await main("snapshotMetrics")).previews.at(-1);
  assert.equal(capture.objects.length, 3);
  assert.notEqual(capture.objects[0].objectAddress, capture.objects[0].sha256);
  evidence.push({ check: "raw-manifest-physical-capture", objects: capture.objects });
  stage = "tampered-byte";
  await main("tamperNext");
  await main("choose", "manifest");
  await page.getByRole("button", { name: "Reload", exact: true }).click();
  await expect(page.locator("output")).toContainText("Preview failed", {
    timeout: 60000,
  });
  assert.equal(await pixels("tampered-physical-byte-retains-incumbent"), incumbent);
  assert.equal((await main("snapshotMetrics")).tamperedResponses, 1);
  stage = "embedded-no-publication";
  const beforeEmbedded = await main("snapshotMetrics");
  await load("embedded");
  const afterEmbedded = await main("snapshotMetrics");
  assert.deepEqual(afterEmbedded.nativeCounts, beforeEmbedded.nativeCounts);
  await pixels("real-embedded-PNG-WASM-with-zero-native-operations");
  stage = "cancel-pending-dialog";
  await main("holdDialog", "blob");
  await page.getByRole("button", { name: "Reload", exact: true }).click();
  await expect.poll(() => main("dialogPending")).toBe(true);
  await page.getByRole("button", { name: "Close preview", exact: true }).click();
  await main("releaseDialog");
  await expect(
    page.getByRole("button", { name: "Preview a Project", exact: true }),
  ).toBeEnabled({ timeout: 60000 });
  await expect(page.locator("output")).toHaveText("");
  await expect(page.getByRole("slider")).toHaveCount(0);
  evidence.push({ check: "actual-cancel-before-dialog-settlement-does-not-activate" });
  stage = "stale-real-delivery";
  await main("holdDelivery");
  await main("choose", "blob");
  await page.getByRole("button", { name: "Preview a Project", exact: true }).click();
  await expect.poll(() => main("deliveryPending"), { timeout: 60000 }).toBe(true);
  await page.getByRole("button", { name: "Close preview", exact: true }).click();
  await main("releaseDelivery");
  await expect(
    page.getByRole("button", { name: "Preview a Project", exact: true }),
  ).toBeEnabled({ timeout: 60000 });
  await expect(page.locator("output")).toHaveText("");
  await expect(page.getByRole("slider")).toHaveCount(0);
  evidence.push({ check: "real-captured-stale-IPC-delivery-does-not-activate" });
  stage = "receiver-missing";
  await mount(info.receiverId);
  await main("choose", "manifest");
  await page.getByRole("button", { name: "Preview a Project", exact: true }).click();
  await expect(page.locator("output")).toContainText("Required assets are missing", {
    timeout: 60000,
  });
  stage = "real-referenced-copy";
  await main("choose", "manifest");
  const prepared = await page.evaluate(
    async ({ sourceId, receiverId }) =>
      window.electronAPI.localAssetCopy({
        operation: "prepare",
        sourceCellId: sourceId,
        receiverCellId: receiverId,
      }),
    info,
  );
  assert.equal(prepared.ok, true);
  assert.equal(prepared.value.atlasCount, 1);
  const committed = await page.evaluate(
    (copyId) => window.electronAPI.localAssetCopy({ operation: "commit", copyId }),
    prepared.value.copyId,
  );
  assert.equal(committed.ok, true);
  assert.deepEqual(
    JSON.parse(fs.readFileSync(info.files.copied, "utf8")),
    JSON.parse(fs.readFileSync(info.files.manifest, "utf8")),
  );
  await load("copied");
  await pixels("real-E-copy-then-receiver-runtime-preview");
  const finalMetrics = await main("snapshotMetrics");
  assert(finalMetrics.nativeCounts[3] >= 1 && finalMetrics.nativeCounts[4] >= 1);
  assert.deepEqual(errors, []);
  evidence.push({
    check: "actual-main-closed-IPC-copy-and-distinct-receiver",
    metrics: finalMetrics,
  });
  await page.evaluate(() => window.__runtimePreviewFixture.unmount());
  await main("close");
  await app.close();
  app = undefined;

  // A second process reopens this owned, seeded profile through actual main.
  // No fixture coordinator, handler, capability map or renderer port is installed.
  stage = "production-main-start";
  const bootstrap = path.join(directory, "actual-main.cjs");
  fs.writeFileSync(
    bootstrap,
    `const fs = require("node:fs");
const path = require("node:path");
const { app } = require("electron");
const config = JSON.parse(fs.readFileSync(process.argv.at(-1), "utf8"));
app.setPath("userData", config.userData);
app.setAppPath(config.appRoot);
require(path.join(config.appRoot, "electron/main.cjs"));
`,
    { flag: "wx" },
  );
  app = await electron.launch({ args: [bootstrap, config], env, timeout: 60000 });
  const productionPage = await app.firstWindow();
  productionPage.on("pageerror", () => errors.push("production-renderer-pageerror"));
  await productionPage.waitForLoadState("domcontentloaded");
  await productionPage.locator(".menu-bar").waitFor({ state: "visible" });
  const identity = await app.evaluate(({ app }) => ({
    userData: app.getPath("userData"),
    appRoot: app.getAppPath(),
  }));
  assert.equal(path.resolve(identity.userData), path.resolve(userData));
  assert.equal(path.resolve(identity.appRoot), root);
  const editorUrl = pathToFileURL(path.join(root, "dist/index.html")).href;
  assert.equal(productionPage.url(), editorUrl);
  await productionPage.route(/^https?:\/\//, (route) => route.abort());
  await productionPage.evaluate(() => {
    localStorage.setItem("vivi2d-theme", "light");
    localStorage.setItem("vivi2d-locale", "en");
    localStorage.setItem("vivi2d-workspace-mode", "default");
  });
  await productionPage.reload();
  await productionPage.locator(".menu-bar").waitFor({ state: "visible" });
  assert.equal(productionPage.url(), editorUrl);
  const exchange = async (command) => {
    const response = await productionPage.evaluate(
      (request) => window.electronAPI.localExchange(request),
      command,
    );
    assert.equal(response.ok, true, "Actual main rejected a closed exchange command");
    return response.value;
  };
  const sourceCell = await exchange({ action: "query", cellId: info.sourceId });
  const newReceiver = await exchange({ action: "createReplica", cellId: info.sourceId });
  assert.notEqual(newReceiver.cellId, info.sourceId);
  assert.notEqual(newReceiver.cellId, info.receiverId);
  assert.notEqual(newReceiver.replicaId, sourceCell.replicaId);
  assert.equal(newReceiver.scopeId, sourceCell.scopeId);
  assert.equal(newReceiver.documentId, sourceCell.documentId);
  const receiverBefore = await exchange({ action: "query", cellId: newReceiver.cellId });

  // Only one-use native file dialog selections are controlled in actual main.
  await app.evaluate(({ dialog }) => {
    globalThis.__runtimePreviewProductionDialogs = {
      open: dialog.showOpenDialog,
      save: dialog.showSaveDialog,
      opens: 0,
      saves: 0,
      pending: false,
    };
  });
  const selectFile = async (kind, file) => {
    await app.evaluate(
      ({ dialog, BrowserWindow }, { kind, file }) => {
        const proof = globalThis.__runtimePreviewProductionDialogs;
        if (proof.pending) throw Error("Unexpected pending proof file dialog");
        proof.pending = true;
        const valid = (window, options) =>
          window === BrowserWindow.getAllWindows()[0] &&
          JSON.stringify(options.filters) ===
            JSON.stringify([{ name: "Vivi2D Project", extensions: ["vivi"] }]);
        if (kind === "open") {
          dialog.showOpenDialog = async (window, options) => {
            dialog.showOpenDialog = proof.open;
            proof.pending = false;
            proof.opens++;
            if (
              !valid(window, options) ||
              JSON.stringify(options.properties) !== '["openFile"]'
            )
              throw Error("Unexpected actual-main open dialog");
            return { canceled: false, filePaths: [file] };
          };
        } else {
          dialog.showSaveDialog = async (window, options) => {
            dialog.showSaveDialog = proof.save;
            proof.pending = false;
            proof.saves++;
            if (
              !valid(window, options) ||
              options.defaultPath !== "project-copy.vivi" ||
              JSON.stringify(options.properties) !== '["showOverwriteConfirmation"]'
            )
              throw Error("Unexpected actual-main save dialog");
            return { canceled: false, filePath: file };
          };
        }
      },
      { kind, file },
    );
  };
  stage = "production-main-open-copy-controls";
  await productionPage
    .locator(".menu-dropdown-trigger")
    .filter({
      hasText: /^(?:Integrations|外部連携)\s*▾$/,
    })
    .click();
  await productionPage
    .locator(".menu-dropdown-panel")
    .getByRole("menuitem", {
      name: /^(?:Generate Model\.\.\.|モデル生成\.\.\.)$/,
    })
    .click();
  const actualDialog = productionPage.getByRole("dialog");
  await expect(actualDialog).toBeVisible();
  const localPanel = actualDialog
    .locator("summary")
    .filter({
      hasText: /^Durable local jobs and exchange$/,
    })
    .locator("..");
  await localPanel.locator(":scope > summary").click();
  await localPanel.getByRole("button", { name: "Refresh", exact: true }).click();
  await localPanel
    .locator('label:text-is("Workspace") > select')
    .selectOption(newReceiver.cellId);
  const previewPanel = localPanel
    .locator("summary")
    .filter({
      hasText: /^Runtime preview$/,
    })
    .locator("..");
  await previewPanel.locator(":scope > summary").click();
  const actualCanvas = previewPanel.locator("canvas");
  const blank = await canvasPixels(actualCanvas);
  const background = blank.pixels[0].rgba;
  assert(
    blank.pixels.every(
      (point) => JSON.stringify(point.rgba) === JSON.stringify(background),
    ),
  );
  stage = "production-main-new-receiver-missing";
  await selectFile("open", info.files.manifest);
  await previewPanel
    .getByRole("button", { name: "Preview a Project", exact: true })
    .click();
  await expect(previewPanel.locator("output")).toHaveText(
    "Required assets are missing. The current image is unchanged.",
    { timeout: 60000 },
  );
  stage = "production-main-copy-panel-select";
  const copyPanel = localPanel
    .locator("summary")
    .filter({
      hasText: /^Copy a referenced Project locally$/,
    })
    .locator("..");
  await copyPanel.locator(":scope > summary").click();
  await copyPanel
    .locator('label:text-is("Source replica") > select')
    .selectOption(info.sourceId);
  await copyPanel
    .locator('label:text-is("Receiver replica") > select')
    .selectOption(newReceiver.cellId);
  await selectFile("open", info.files.manifest);
  await copyPanel.getByRole("button", { name: "Select Project", exact: true }).click();
  await expect(
    copyPanel.getByText(`${sourceCell.documentId} / full / 1`, { exact: true }),
  ).toBeVisible();
  const destination = path.join(directory, "production-main-copy.vivi");
  assert(!fs.existsSync(destination));
  await selectFile("save", destination);
  const confirmation = productionPage.waitForEvent("dialog").then(async (dialog) => {
    assert.equal(dialog.type(), "confirm");
    assert.equal(
      dialog.message(),
      "Copy this captured Project and its assets to the selected local replica? Save As will ask for a destination. Completed immutable assets remain if later work fails or is cancelled.",
    );
    await dialog.accept();
  });
  stage = "production-main-copy-panel-commit";
  await copyPanel
    .getByRole("button", { name: "Copy assets and Save As", exact: true })
    .click();
  await confirmation;
  await expect(copyPanel.locator("output")).toHaveText(
    `Canonical Project copy saved for document: ${sourceCell.documentId}`,
    { timeout: 60000 },
  );
  assert.deepEqual(
    JSON.parse(fs.readFileSync(destination, "utf8")),
    JSON.parse(fs.readFileSync(info.files.manifest, "utf8")),
  );
  stage = "production-main-copied-receiver-preview";
  await selectFile("open", destination);
  await previewPanel.getByRole("button", { name: "Reload", exact: true }).click();
  await expect(previewPanel.locator("output")).toHaveText("Preview ready", {
    timeout: 60000,
  });
  await expect(previewPanel.getByText(/^Runtime generation: .*\/0$/)).toBeVisible();
  const productionPixels = await canvasPixels(actualCanvas);
  assert.deepEqual(
    productionPixels.pixels.map((point) => point.rgba),
    [background, [255, 0, 0, 255], background, [255, 0, 0, 255], background],
  );
  const receiverAfter = await exchange({ action: "query", cellId: newReceiver.cellId });
  assert.equal(receiverAfter.commitVersion, receiverBefore.commitVersion);
  assert.deepEqual(receiverAfter.state.head, receiverBefore.state.head);
  const dialogCounts = await app.evaluate(({ dialog }) => {
    const proof = globalThis.__runtimePreviewProductionDialogs;
    dialog.showOpenDialog = proof.open;
    dialog.showSaveDialog = proof.save;
    return { opens: proof.opens, saves: proof.saves, pending: proof.pending };
  });
  assert.deepEqual(dialogCounts, { opens: 3, saves: 1, pending: false });
  assert.deepEqual(errors, []);
  evidence.push({
    check: "production-main-CopyPanel-to-receiver-preview",
    actualMain: "electron/main.cjs",
    actualEntry: "dist/index.html",
    sourceCellId: sourceCell.cellId,
    receiverCellId: newReceiver.cellId,
    distinctPrincipal: true,
    missingBeforeCopy: true,
    actualCopyPanelConsentAndSave: true,
    unchangedSync: {
      commitVersion: receiverAfter.commitVersion,
      head: receiverAfter.state.head,
    },
    dialogCounts,
    background: blank,
    ...productionPixels,
    savedProject: {
      byteLength: fs.statSync(destination).size,
      sha256: hash(fs.readFileSync(destination)),
    },
  });
  await previewPanel.getByRole("button", { name: "Close preview", exact: true }).click();
  await actualDialog
    .locator(".modal-actions")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await app.close();
  app = undefined;
  assert.deepEqual(
    builtEditorPins(),
    editorBuildPinsBefore,
    "Editor build changed during proof",
  );
  assert.deepEqual(
    sourcePaths.map(pin),
    sourcePinsBefore,
    "Proof source changed during execution",
  );
  const report = {
    status: "PASS",
    scope:
      "Source-built Windows Electron: ten test-main cases plus actual production-main/CopyPanel/receiver preview. Not packaged/installed application or release approval.",
    capabilities: ["vivi.cap.referencedAssets@1", "vivi.cap.maskInvert@1"],
    sourcePinsBefore,
    sourcePinsAfter: sourcePaths.map(pin),
    editorBuildPinsBefore,
    editorBuildPinsAfter: builtEditorPins(),
    native: {
      addon: manifest.addon,
      manifest: pin("electron/generated/native-local-asset/win32-x64/manifest.json"),
      seeder: {
        source: seeder.source,
        binary: seeder.binary,
        linkedRlibs: seeder.linkedRlibs,
      },
    },
    evidence,
  };
  fs.writeFileSync(
    path.join(directory, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    { flag: "wx" },
  );
  console.log(
    JSON.stringify({
      status: "PASS",
      checks: evidence.length,
      report: path
        .relative(root, path.join(directory, "report.json"))
        .replaceAll("\\", "/"),
    }),
  );
} catch (error) {
  fs.writeFileSync(
    path.join(directory, "failure.json"),
    `${JSON.stringify({
      status: "FAIL",
      stage,
      completedChecks: evidence.map((row) => row.check),
      errorType: error?.name ?? "Error",
    })}\n`,
    { flag: "wx" },
  );
  console.error(
    `Runtime preview Electron proof failed at ${stage}; retained ${path.basename(directory)}`,
  );
  throw error;
} finally {
  if (app) {
    await app
      .evaluate(({ dialog }) => {
        const proof = globalThis.__runtimePreviewProductionDialogs;
        if (proof) {
          dialog.showOpenDialog = proof.open;
          dialog.showSaveDialog = proof.save;
        }
      })
      .catch(() => {});
    await app.evaluate(() => globalThis.__runtimePreviewMain?.close()).catch(() => {});
    await app.close().catch(() => {});
  }
}
