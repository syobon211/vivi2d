import { readFileSync } from "node:fs";
import path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";
import { writePerfBaseline } from "../helpers/perf-baseline";

const ROOT = path.resolve(import.meta.dirname, "../..");
const BUDGETS = JSON.parse(
  readFileSync(path.resolve(ROOT, "e2e/perf-budgets.json"), "utf8"),
);
const BASELINE_PATH = path.resolve(ROOT, "docs/developer/quality/baselines/perf-startup-2026-04-30.json");
const RUNS = 3;
const READY_TIMEOUT_MS: number = BUDGETS.startup.budget_hard.launchToVivi2dMs_max;

type Sample = {
  launchToDomMs: number;
  launchToVivi2dMs: number;
  domToVivi2dMs: number;
};

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const current = sorted[mid];
  if (current === undefined) {
    throw new Error("median() requires at least one sample");
  }
  if (sorted.length % 2) return current;
  const previous = sorted[mid - 1];
  if (previous === undefined) {
    throw new Error("median() requires at least two samples for even-sized input");
  }
  return (previous + current) / 2;
}

async function measureOnce(): Promise<Sample> {
  const launchStart = performance.now();
  const app = await electron.launch({
    args: [path.join(ROOT, "electron/main.cjs")],
    env: { ...process.env, NODE_ENV: "test" },
  });
  try {
    const window = await app.firstWindow();
    await window.waitForLoadState("domcontentloaded");
    const domReady = performance.now();

    await expect
      .poll(async () => window.evaluate(() => !!window.__vivi2d), {
        timeout: READY_TIMEOUT_MS,
      })
      .toBe(true);
    const vivi2dReady = performance.now();

    return {
      launchToDomMs: Math.round(domReady - launchStart),
      launchToVivi2dMs: Math.round(vivi2dReady - launchStart),
      domToVivi2dMs: Math.round(vivi2dReady - domReady),
    };
  } finally {
    await app.close();
  }
}

test.describe("Electron cold-start perf", () => {
  test(`${RUNS} runs record launch -> __vivi2d ready timing`, async () => {
    test.setTimeout(READY_TIMEOUT_MS * RUNS + 30_000);

    const samples: Sample[] = [];
    for (let i = 0; i < RUNS; i++) {
      samples.push(await measureOnce());
    }

    const summary = {
      recordedAt: new Date().toISOString(),
      platform: process.platform,
      arch: process.arch,
      node: process.version,
      runs: samples.length,
      samples,
      median: {
        launchToDomMs: median(samples.map((s) => s.launchToDomMs)),
        launchToVivi2dMs: median(samples.map((s) => s.launchToVivi2dMs)),
        domToVivi2dMs: median(samples.map((s) => s.domToVivi2dMs)),
      },
    };
    const maxLaunchToVivi2dMs = Math.max(...samples.map((s) => s.launchToVivi2dMs));

    writePerfBaseline(BASELINE_PATH, summary);
    const softP50: number = BUDGETS.startup.budget_soft.launchToVivi2dMs_p50;
    const softP95: number = BUDGETS.startup.budget_soft.launchToVivi2dMs_p95;
    const p50Mark =
      summary.median.launchToVivi2dMs <= softP50
        ? "OK"
        : `⚠ soft p50 ${softP50}ms by ${summary.median.launchToVivi2dMs - softP50}ms`;
    const p95Mark =
      maxLaunchToVivi2dMs <= softP95
        ? "OK"
        : `⚠ soft p95 ${softP95}ms by ${maxLaunchToVivi2dMs - softP95}ms`;
    console.log(
      `[perf-startup] median launch->__vivi2d=${summary.median.launchToVivi2dMs}ms ` +
        `(dom=${summary.median.launchToDomMs}ms, tail=${summary.median.domToVivi2dMs}ms) ` +
        `[${p50Mark}; ${p95Mark}]`,
    );

    for (const s of samples) {
      expect(s.launchToVivi2dMs, "launch -> __vivi2d ready").toBeLessThan(
        READY_TIMEOUT_MS,
      );
      expect(s.domToVivi2dMs, "dom -> __vivi2d ready").toBeGreaterThanOrEqual(0);
    }
    expect(summary.median.launchToVivi2dMs).toBeGreaterThan(0);
  });
});
