// One-run PR140 diagnostic; remove before final integration. Not a performance gate.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { _electron as electron } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
assert.equal(process.argv.length, 2);
// Existing locked build-tool dependency; no package installation or dependency change.
const jiti = createJiti(import.meta.url, { fsCache: false });
const { waitForAppReady, importPsdAndWait } = await jiti.import(
  path.join(root, "e2e/helpers/app.ts"),
);
const psd = path.join(root, "e2e/fixtures/test.psd");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const modes = [
  [
    "current",
    [
      "--enable-webgl",
      "--use-gl=angle",
      "--use-angle=swiftshader-webgl",
      "--enable-unsafe-swiftshader",
    ],
  ],
  ["default", []],
  ["angle-gl", ["--enable-webgl", "--use-gl=angle", "--use-angle=gl"]],
];
const results = [];
console.log(
  JSON.stringify({
    diagnostic: "PR140 only",
    platform: process.platform,
    arch: process.arch,
    psdSha256: sha(fs.readFileSync(psd)),
    indexSha256: sha(fs.readFileSync(path.join(root, "dist/index.html"))),
  }),
);

async function sample(window, count) {
  return window.evaluate(async (sampleCount) => {
    const values = [];
    for (let i = 0; i < sampleCount; i++) {
      values.push(
        await new Promise((resolve, reject) => {
          let frames = 0;
          let frame;
          const start = performance.now();
          const timeout = setTimeout(() => {
            cancelAnimationFrame(frame);
            reject(new Error("RAF_DEADLINE"));
          }, 10000);
          function tick() {
            frames++;
            const elapsed = performance.now() - start;
            if (elapsed < 2000) frame = requestAnimationFrame(tick);
            else {
              clearTimeout(timeout);
              resolve((frames * 1000) / elapsed);
            }
          }
          frame = requestAnimationFrame(tick);
        }),
      );
    }
    return values;
  }, count);
}

async function bounded(promise, milliseconds, code) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error(code);
          error.name = code;
          reject(error);
        }, milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

for (const [mode, args] of modes) {
  const row = { mode, args, stage: "launch", webglAvailable: false };
  let app;
  try {
    app = await electron.launch({
      args: [...args, path.join(root, "electron/main.cjs")],
      env: { ...process.env, NODE_ENV: "test" },
      timeout: 30000,
    });
    await bounded(
      (async () => {
        const window = await app.firstWindow();
        row.stage = "ready";
        await waitForAppReady(window);
        await window.setViewportSize({ width: 1920, height: 1080 });
        await window.evaluate(() => {
          localStorage.setItem("vivi2d-workspace-mode", "default");
          localStorage.setItem("vivi2d-locale", "ja");
          window.__vivi2d?.useWorkspaceModeStore?.getState().setMode("default");
          window.__vivi2d?.useI18nStore?.getState().setLocale("ja");
        });
        row.stage = "before-psd";
        row.beforePsd = await sample(window, 1);
        row.stage = "import";
        await importPsdAndWait(app, window, psd);
        await window.waitForTimeout(500);
        row.stage = "context";
        row.canvas = await window.evaluate(() => {
          const canvases = document.querySelectorAll(".canvas-container canvas");
          const canvas = canvases.length === 1 ? canvases[0] : null;
          // This canvas is appended only after Pixi Application.init has completed.
          const gl = canvas?.getContext("webgl2") ?? canvas?.getContext("webgl");
          const ext = gl?.getExtension("WEBGL_debug_renderer_info");
          return {
            count: canvases.length,
            webgl: Boolean(gl),
            contextLost: gl?.isContextLost() ?? null,
            renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null,
            visibility: document.visibilityState,
            dpr: devicePixelRatio,
            width: canvas?.width ?? null,
            height: canvas?.height ?? null,
            innerWidth,
            innerHeight,
          };
        });
        row.window = await app.evaluate(async ({ app, BrowserWindow }) => {
          const read = () => app.getGPUFeatureStatus();
          if (!Object.keys(read()).length) {
            await new Promise((resolve, reject) => {
              const changed = () => {
                clearTimeout(timer);
                resolve();
              };
              const timer = setTimeout(() => {
                app.removeListener("gpu-info-update", changed);
                reject(new Error("GPU_STATUS_DEADLINE"));
              }, 5000);
              app.once("gpu-info-update", changed);
            });
          }
          const status = read(),
            window = BrowserWindow.getAllWindows()[0];
          const bounds = window.getContentBounds();
          return {
            minimized: window.isMinimized(),
            visible: window.isVisible(),
            bounds: { width: bounds.width, height: bounds.height },
            gpu: {
              webgl: status.webgl ?? null,
              webgl2: status.webgl2 ?? null,
              gpu_compositing: status.gpu_compositing ?? null,
            },
          };
        });
        row.stage = "after-psd";
        row.afterPsd = await sample(window, 3);
        const sorted = [...row.afterPsd].sort((a, b) => a - b);
        row.min = sorted[0];
        row.median = sorted[1];
        row.webglAvailable = row.canvas.webgl && !row.canvas.contextLost;
        row.stage = "collected";
      })(),
      90000,
      "MODE_DEADLINE",
    );
  } catch (error) {
    row.error = error?.name ?? "Error";
  } finally {
    if (app) {
      const owned = app.process();
      const close = app.close();
      try {
        await bounded(close, 5000, "CLOSE_DEADLINE");
      } catch {
        // Never start another mode after abnormal cleanup, even if kill succeeds.
        row.cleanupForced = true;
        try {
          if (owned.exitCode === null && owned.signalCode === null) {
            const exited = new Promise((resolve) => owned.once("exit", resolve));
            assert(owned.kill("SIGKILL"));
            await bounded(exited, 5000, "EXIT_DEADLINE");
          }
          row.ownedProcessExitConfirmed = true;
        } catch {
          row.cleanupFailed = true;
        }
      }
    }
    results.push(row);
    console.log(JSON.stringify(row));
  }
  if (row.cleanupForced || row.cleanupFailed) {
    console.error("DIAGNOSTIC_CLEANUP_FAILED");
    process.exit(1);
  }
}
assert.equal(results.length, 3);
console.log(
  JSON.stringify({ diagnosticCollectionComplete: true, performancePassClaimed: false }),
);
