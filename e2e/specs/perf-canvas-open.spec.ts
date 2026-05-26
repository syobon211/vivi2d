import { readFileSync } from "node:fs";
import path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";
import { mockOpenPsd } from "../helpers/dialog-mock";
import { clickFileMenuItem } from "../helpers/operations";
import { writePerfBaseline } from "../helpers/perf-baseline";

const ROOT = path.resolve(import.meta.dirname, "../..");
const TEST_PSD = path.resolve(ROOT, "e2e/fixtures/test.psd");
const BUDGETS = JSON.parse(
  readFileSync(path.resolve(ROOT, "e2e/perf-budgets.json"), "utf8"),
);
const BASELINE_PATH = path.resolve(
  ROOT,
  "docs/developer/quality/baselines/perf-canvas-open-2026-04-30.json",
);
const RUNS = 3;
const APP_READY_TIMEOUT_MS: number = BUDGETS.startup.budget_hard.launchToVivi2dMs_max;
const OPEN_READY_TIMEOUT_MS: number =
  BUDGETS.canvasOpen.budget_hard.openToEditableCanvasMs_max;

type Sample = {
  projectReadyMs: number;
  layerListReadyInternalMs: number;
  editableCanvasReadyInternalMs: number;
  openToLayerListMs: number;
  openToEditableCanvasMs: number;
  layerListToCanvasMs: number;
};

type PerfProbeEvent = {
  name: string;
  durationMs: number;
  meta?: Record<string, unknown>;
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

async function consumePerfProbeEvents(
  window: import("playwright").Page,
): Promise<PerfProbeEvent[]> {
  return window.evaluate(() => {
    const vivi = window.__vivi2d as
      | { consumeE2EPerfProbeEvents?: () => PerfProbeEvent[] }
      | undefined;
    return vivi?.consumeE2EPerfProbeEvents?.() ?? [];
  });
}

function latestProbeDuration(events: PerfProbeEvent[], name: string): number {
  const event = [...events].reverse().find((candidate) => candidate.name === name);
  return Math.round(event?.durationMs ?? 0);
}

async function waitForAppReady(window: import("playwright").Page) {
  await expect
    .poll(async () => window.evaluate(() => !!window.__vivi2d), {
      timeout: APP_READY_TIMEOUT_MS,
    })
    .toBe(true);
  await window.evaluate(() => {
    localStorage.setItem("vivi2d-workspace-mode", "default");
    const runtime = (globalThis as Window & typeof globalThis).__vivi2d as any;
    runtime?.useWorkspaceModeStore?.getState().setMode("default");
  });
}

async function waitForEditableCanvas(window: import("playwright").Page) {
  await expect(
    window.locator(".layer-item", { hasText: "Background" }).first(),
  ).toBeVisible({
    timeout: OPEN_READY_TIMEOUT_MS,
  });
  await expect
    .poll(
      async () =>
        window.evaluate(() => {
          const canvas = document.querySelector(
            ".canvas-container canvas",
          ) as HTMLCanvasElement | null;
          const runtime = (globalThis as Window & typeof globalThis).__vivi2d as any;
          const project = runtime?.useEditorStore?.getState?.().project as
            | { layers?: unknown[] }
            | undefined;
          return Boolean(
            canvas &&
              canvas.width > 0 &&
              canvas.height > 0 &&
              Array.isArray(project?.layers) &&
              project.layers.length > 0,
          );
        }),
      { timeout: OPEN_READY_TIMEOUT_MS },
    )
    .toBe(true);
}

async function measureOnce(): Promise<Sample> {
  const app = await electron.launch({
    args: [path.join(ROOT, "electron/main.cjs")],
    env: { ...process.env, NODE_ENV: "test" },
  });
  try {
    const window = await app.firstWindow();
    await window.waitForLoadState("domcontentloaded");
    await waitForAppReady(window);
    await mockOpenPsd(app, TEST_PSD);
    await consumePerfProbeEvents(window);

    const openStart = performance.now();
    await clickFileMenuItem(window, "Import PSD");
    await expect(
      window.locator(".layer-item", { hasText: "Background" }).first(),
    ).toBeVisible({
      timeout: OPEN_READY_TIMEOUT_MS,
    });
    const layerListReady = performance.now();
    await waitForEditableCanvas(window);
    const canvasReady = performance.now();
    const probeEvents = await consumePerfProbeEvents(window);

    return {
      projectReadyMs: latestProbeDuration(probeEvents, "canvasOpen.projectReady"),
      layerListReadyInternalMs: latestProbeDuration(
        probeEvents,
        "canvasOpen.layerListReady",
      ),
      editableCanvasReadyInternalMs: latestProbeDuration(
        probeEvents,
        "canvasOpen.editableCanvasReady",
      ),
      openToLayerListMs: Math.round(layerListReady - openStart),
      openToEditableCanvasMs: Math.round(canvasReady - openStart),
      layerListToCanvasMs: Math.round(canvasReady - layerListReady),
    };
  } finally {
    await app.close();
  }
}

test.describe("PSD import -> first editable canvas perf", () => {
  test(`${RUNS} runs record PSD import -> editable canvas timing`, async () => {
    test.setTimeout(APP_READY_TIMEOUT_MS * RUNS + OPEN_READY_TIMEOUT_MS * RUNS + 30_000);

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
      note: BUDGETS.canvasOpen.note,
      samples,
      median: {
        projectReadyMs: median(samples.map((s) => s.projectReadyMs)),
        layerListReadyInternalMs: median(samples.map((s) => s.layerListReadyInternalMs)),
        editableCanvasReadyInternalMs: median(
          samples.map((s) => s.editableCanvasReadyInternalMs),
        ),
        openToLayerListMs: median(samples.map((s) => s.openToLayerListMs)),
        openToEditableCanvasMs: median(samples.map((s) => s.openToEditableCanvasMs)),
        layerListToCanvasMs: median(samples.map((s) => s.layerListToCanvasMs)),
      },
    };

    writePerfBaseline(BASELINE_PATH, summary);

    const softProjectReadyP50: number = BUDGETS.canvasOpen.budget_soft.projectReadyMs_p50;
    const softLayerListReadyP50: number =
      BUDGETS.canvasOpen.budget_soft.layerListReadyMs_p50;
    const softEditableCanvasReadyP50: number =
      BUDGETS.canvasOpen.budget_soft.editableCanvasReadyMs_p50;
    const softP50: number = BUDGETS.canvasOpen.budget_soft.openToEditableCanvasMs_p50;
    const softP95: number = BUDGETS.canvasOpen.budget_soft.openToEditableCanvasMs_p95;
    const coarseEnvelopeMode: string =
      BUDGETS.canvasOpen.coarseEnvelopeMode ?? "enforced";
    const hardProjectReadyMax: number = BUDGETS.canvasOpen.budget_hard.projectReadyMs_max;
    const hardLayerListReadyMax: number =
      BUDGETS.canvasOpen.budget_hard.layerListReadyMs_max;
    const hardEditableCanvasReadyMax: number =
      BUDGETS.canvasOpen.budget_hard.editableCanvasReadyMs_max;
    const hardMax: number = BUDGETS.canvasOpen.budget_hard.openToEditableCanvasMs_max;
    const maxProjectReady = Math.max(...samples.map((s) => s.projectReadyMs));
    const maxLayerListReady = Math.max(...samples.map((s) => s.layerListReadyInternalMs));
    const maxEditableCanvasReady = Math.max(
      ...samples.map((s) => s.editableCanvasReadyInternalMs),
    );
    const maxOpenToCanvasMs = Math.max(...samples.map((s) => s.openToEditableCanvasMs));
    const p50Mark =
      summary.median.openToEditableCanvasMs <= softP50
        ? "OK"
        : `over soft p50 ${softP50}ms by ${summary.median.openToEditableCanvasMs - softP50}ms`;
    const p95Mark =
      maxOpenToCanvasMs <= softP95
        ? "OK"
        : `over soft p95 ${softP95}ms by ${maxOpenToCanvasMs - softP95}ms`;
    console.log(
      `[perf-canvas-open] median projectReady=${summary.median.projectReadyMs}ms ` +
        `(soft=${softProjectReadyP50}) layerListReady=${summary.median.layerListReadyInternalMs}ms ` +
        `(soft=${softLayerListReadyP50}) editableCanvasReady=${summary.median.editableCanvasReadyInternalMs}ms ` +
        `(soft=${softEditableCanvasReadyP50}) import->editable-canvas=${summary.median.openToEditableCanvasMs}ms ` +
        `(layers=${summary.median.openToLayerListMs}ms, tail=${summary.median.layerListToCanvasMs}ms) ` +
        `maxProjectReady=${maxProjectReady}ms maxLayerListReady=${maxLayerListReady}ms ` +
        `maxEditableCanvasReady=${maxEditableCanvasReady}ms ` +
        `[${p50Mark}; ${p95Mark}]`,
    );

    if (coarseEnvelopeMode === "reportOnly" && maxOpenToCanvasMs >= hardMax) {
      console.warn(
        `[perf-canvas-open] coarse envelope exceeded report-only hard threshold ` +
          `(editableCanvas=${maxOpenToCanvasMs}ms/${hardMax}ms)`,
      );
    }

    for (const sample of samples) {
      expect(
        sample.projectReadyMs,
        "PSD import -> project ready should stay within the hard budget",
      ).toBeLessThan(hardProjectReadyMax);
      expect(
        sample.layerListReadyInternalMs,
        "PSD import -> layer list ready should stay within the hard budget",
      ).toBeLessThan(hardLayerListReadyMax);
      expect(
        sample.editableCanvasReadyInternalMs,
        "PSD import -> editable canvas ready should stay within the hard budget",
      ).toBeLessThan(hardEditableCanvasReadyMax);
      if (coarseEnvelopeMode !== "reportOnly") {
        expect(
          sample.openToEditableCanvasMs,
          "PSD import -> editable canvas ready should stay within the hard budget",
        ).toBeLessThan(hardMax);
      }
      expect(sample.layerListToCanvasMs).toBeGreaterThanOrEqual(0);
    }
  });
});
