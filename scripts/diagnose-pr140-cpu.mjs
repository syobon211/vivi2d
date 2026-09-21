// One-run PR140 CPU-only diagnostic; remove before integration. Not a performance gate.
// Detailed tracing is deliberately omitted: no startup-closure audit or trace infrastructure.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { _electron as electron } from "playwright";

try {
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
    ["driver", ["--enable-webgl", "--use-gl=angle", "--use-angle=swiftshader"]],
    [
      "fallback",
      [
        "--enable-webgl",
        "--use-gl=angle",
        "--use-angle=swiftshader-webgl",
        "--enable-unsafe-swiftshader",
      ],
    ],
  ];
  const allowedEnv = new Set([
    "PATH",
    "SYSTEMROOT",
    "WINDIR",
    "COMSPEC",
    "TEMP",
    "TMP",
    "TMPDIR",
    "HOME",
    "USERPROFILE",
    "APPDATA",
    "LOCALAPPDATA",
    "DISPLAY",
    "XAUTHORITY",
    "WAYLAND_DISPLAY",
    "XDG_RUNTIME_DIR",
    "LANG",
    "LC_ALL",
  ]);
  const launchEnv = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => allowedEnv.has(key.toUpperCase())),
  );
  launchEnv.NODE_ENV = "test";
  const results = [];
  console.log(
    JSON.stringify({
      diagnostic: "PR140 CPU only",
      traceCollected: false,
      traceOmission: "CPU_ONLY_FIRST_NO_TRACE_OWNERSHIP_PREMISE",
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

  async function readCpu(app) {
    return app.evaluate(({ app }) =>
      app.getAppMetrics().map((metric) => ({
        pid: metric.pid,
        creationTime: metric.creationTime,
        type: ["Browser", "Tab", "GPU", "Utility"].includes(metric.type)
          ? metric.type
          : "Other",
        cumulative: metric.cpu.cumulativeCPUUsage ?? null,
        percent: metric.cpu.percentCPUUsage,
      })),
    );
  }

  async function cpuSample(app, window, count) {
    const before = await readCpu(app);
    const start = performance.now();
    const samples = await sample(window, count);
    const after = await readCpu(app);
    const wallMs = performance.now() - start;
    const finite = (value) =>
      typeof value === "number" && Number.isFinite(value) && value >= 0;
    assert(finite(wallMs) && wallMs > 0);
    const groups = ["Browser", "Tab", "GPU", "Utility", "Other"].map((type) => {
      const rows = after.filter((row) => row.type === type);
      let matched = 0,
        cumulativePairs = 0,
        cpuSeconds = 0,
        percentSum = 0;
      for (const row of rows) {
        assert(finite(row.pid) && finite(row.creationTime) && finite(row.percent));
        percentSum += row.percent;
        const previous = before.find(
          (p) =>
            p.pid === row.pid &&
            p.creationTime === row.creationTime &&
            p.type === row.type,
        );
        if (!previous) continue;
        matched++;
        if (finite(previous.cumulative) && finite(row.cumulative)) {
          assert(row.cumulative >= previous.cumulative);
          cumulativePairs++;
          cpuSeconds += row.cumulative - previous.cumulative;
        }
      }
      const removed = before.filter(
        (p) =>
          p.type === type &&
          !rows.some((r) => r.pid === p.pid && r.creationTime === p.creationTime),
      ).length;
      assert(finite(cpuSeconds) && finite(percentSum));
      return {
        type,
        count: rows.length,
        matched,
        added: rows.length - matched,
        removed,
        cumulativePairs,
        matchedCpuSeconds: cumulativePairs ? cpuSeconds : null,
        approximateSincePriorCallPercentSum: percentSum,
      };
    });
    return {
      samples,
      cpu: {
        wallMs,
        groups,
        note: "Matched cumulative CPU seconds only where available; percentages are approximate API intervals. GPU process CPU is not hardware GPU utilization or exclusive SwiftShader attribution.",
      },
    };
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
        env: launchEnv,
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
          const before = await cpuSample(app, window, 1);
          row.beforePsd = before.samples;
          row.beforePsdCpu = before.cpu;
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
              backendClass:
                ext &&
                /swiftshader/i.test(String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)))
                  ? "swiftshader"
                  : "other-or-unavailable",
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
          assert.equal(row.canvas.count, 1);
          assert(row.canvas.webgl && !row.canvas.contextLost);
          const after = await cpuSample(app, window, 3);
          row.afterPsd = after.samples;
          row.afterPsdCpu = after.cpu;
          row.contextAfter = await window.evaluate(() => {
            const list = document.querySelectorAll(".canvas-container canvas");
            const canvas = list.length === 1 ? list[0] : null;
            const gl = canvas?.getContext("webgl2") ?? canvas?.getContext("webgl");
            return {
              count: list.length,
              webgl: Boolean(gl),
              contextLost: gl?.isContextLost() ?? true,
              width: canvas?.width ?? null,
              height: canvas?.height ?? null,
              dpr: devicePixelRatio,
            };
          });
          assert.deepEqual(row.contextAfter, {
            count: 1,
            webgl: true,
            contextLost: false,
            width: row.canvas.width,
            height: row.canvas.height,
            dpr: row.canvas.dpr,
          });
          const sorted = [...row.afterPsd].sort((a, b) => a - b);
          row.min = sorted[0];
          row.median = sorted[1];
          row.webglAvailable = row.canvas.webgl && !row.canvas.contextLost;
          row.stage = "collected";
        })(),
        90000,
        "MODE_DEADLINE",
      );
    } catch {
      row.error = "DIAGNOSTIC_FAILED";
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
  assert.equal(results.length, 2);
  assert(
    results.every((row) => row.stage === "collected" && !row.error && row.webglAvailable),
  );
  console.log(
    JSON.stringify({
      diagnosticCollectionComplete: true,
      traceCollected: false,
      performancePassClaimed: false,
    }),
  );
} catch {
  console.error("DIAGNOSTIC_FAILED");
  process.exitCode = 1;
}
