import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "../fixtures";
import { selectLayer } from "../helpers/operations";
import { writePerfBaseline } from "../helpers/perf-baseline";

const ROOT = path.resolve(import.meta.dirname, "../..");
const BUDGETS = JSON.parse(
  readFileSync(path.resolve(ROOT, "e2e/perf-budgets.json"), "utf8"),
);
const BASELINE_PATH = path.resolve(
  ROOT,
  "docs/developer/quality/baselines/perf-editor-interaction-2026-04-30.json",
);
const SAMPLES: number = BUDGETS.editorInteraction.samples;
const WARMUP_SAMPLES: number = BUDGETS.editorInteraction.warmupSamples;

type Sample = {
  selectViviMeshMs: number;
  layerPanelClickToNextFrameMs: number;
  selectionStoreSelectLayerMs: number;
  selectionViviMeshReadyMs: number;
  meshToolActivationMs: number;
  toolButtonClickToNextFrameMs: number;
  viewportSetToolMs: number;
  meshEditAppReadyMs: number;
  meshOverlayVertexDetailsReadyMs: number;
  meshOverlayVisualModelBuildMs: number;
  meshPanelVisibleMs: number;
  editableCanvasVisibleMs: number;
  enterMeshEditMs: number;
  exitMeshEditMs: number;
};

type PerfProbeEvent = {
  name: string;
  durationMs: number;
  meta?: Record<string, unknown>;
};

type RequiredProbe = {
  name: string;
  meta: Record<string, unknown>;
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

function selectToolButton(window: import("playwright").Page) {
  return window.locator(".tool-btn").nth(0);
}

function meshToolButton(window: import("playwright").Page) {
  return window.locator(".tool-btn").nth(2);
}

function meshPanel(window: import("playwright").Page) {
  return window
    .locator(".properties-section")
    .filter({ hasText: /^(Mesh|\u30e1\u30c3\u30b7\u30e5)/ })
    .first();
}

async function consumePerfProbeEvents(
  window: import("playwright").Page,
): Promise<unknown> {
  return window.evaluate(() => {
    const vivi = window.__vivi2d as
      | { consumeE2EPerfProbeEvents?: () => PerfProbeEvent[] }
      | undefined;
    if (typeof vivi?.consumeE2EPerfProbeEvents !== "function") {
      throw new Error("PERF_PROBE_API_UNAVAILABLE");
    }
    return vivi.consumeE2EPerfProbeEvents();
  });
}

function latestProbe(
  events: PerfProbeEvent[],
  required: RequiredProbe,
): PerfProbeEvent | undefined {
  return [...events]
    .reverse()
    .find(
      (event) =>
        event.name === required.name &&
        Object.entries(required.meta).every(
          ([key, value]) => event.meta?.[key] === value,
        ),
    );
}

function latestProbeDuration(events: PerfProbeEvent[], required: RequiredProbe): number {
  const event = latestProbe(events, required);
  if (!event) throw new Error("PERF_PROBE_MISSING");
  if (
    typeof event.durationMs !== "number" ||
    !Number.isFinite(event.durationMs) ||
    event.durationMs < 0
  ) {
    throw new Error("PERF_PROBE_INVALID_DURATION");
  }
  return Math.round(event.durationMs);
}

function appendPerfProbeBatch(events: PerfProbeEvent[], batch: unknown): void {
  if (
    !Array.isArray(batch) ||
    batch.some(
      (event) => !event || typeof event !== "object" || typeof event.name !== "string",
    )
  ) {
    throw new Error("PERF_PROBE_INVALID_BATCH");
  }
  // A saturated producer batch may already have lost its oldest events.
  if (batch.length >= 512 || events.length + batch.length > 512) {
    throw new Error("PERF_PROBE_OVERFLOW");
  }
  events.push(...batch);
}

async function collectPerfProbes(
  window: import("playwright").Page,
  required: RequiredProbe[],
  previousPhase: PerfProbeEvent[] = [],
): Promise<PerfProbeEvent[]> {
  const events: PerfProbeEvent[] = [];
  let terminalError: Error | undefined;
  await expect
    .poll(
      async () => {
        try {
          appendPerfProbeBatch(events, await consumePerfProbeEvents(window));
          const current = [...previousPhase, ...events];
          return required.every((probe) => latestProbe(current, probe) !== undefined);
        } catch {
          // Poll retries must never erase a consumed overflow or an API failure.
          terminalError = new Error("PERF_PROBE_COLLECTION_FAILED");
          return true;
        }
      },
      { timeout: 1_000, message: "PERF_PROBE_COLLECTION_INCOMPLETE" },
    )
    .toBe(true);
  if (terminalError) throw terminalError;
  return events;
}

async function ensureSelectMode(window: import("playwright").Page) {
  const selectTool = selectToolButton(window);
  if (!((await selectTool.getAttribute("class")) ?? "").includes("active")) {
    await selectTool.click();
  }
  await expect(selectTool).toHaveClass(/active/);
}

async function measureEditorInteraction(
  window: import("playwright").Page,
): Promise<Sample> {
  const selectTool = selectToolButton(window);
  const meshTool = meshToolButton(window);

  await ensureSelectMode(window);
  await selectLayer(window, "Background");
  await window.evaluate(() => {
    const clear = window.__vivi2d?.clearE2EPerfProbeEvents;
    if (typeof clear !== "function") throw new Error("PERF_PROBE_API_UNAVAILABLE");
    clear();
  });

  const enterStart = performance.now();
  const selectLayerStart = performance.now();
  await selectLayer(window, "Red Circle");
  const selectViviMeshMs = Math.round(performance.now() - selectLayerStart);
  const layerId = await window.evaluate(() => {
    const store = window.__vivi2d?.useSelectionStore as
      | { getState: () => { selectedLayerId?: unknown } }
      | undefined;
    return store?.getState().selectedLayerId;
  });
  if (typeof layerId !== "string" || layerId.length === 0) {
    throw new Error("PERF_PROBE_TARGET_MISSING");
  }
  const layerPanelProbe = {
    name: "layerPanel.clickToNextFrame",
    meta: { mode: "single", layerId },
  };
  const selectionStoreProbe = {
    name: "selectionStore.selectLayer",
    meta: { hasSelection: true },
  };
  const selectionReadyProbe = { name: "selection.viviMeshReady", meta: { layerId } };
  const selectionProbeEvents = await collectPerfProbes(window, [
    layerPanelProbe,
    selectionStoreProbe,
    selectionReadyProbe,
  ]);
  const layerPanelClickToNextFrameMs = latestProbeDuration(
    selectionProbeEvents,
    layerPanelProbe,
  );
  const selectionStoreSelectLayerMs = latestProbeDuration(
    selectionProbeEvents,
    selectionStoreProbe,
  );
  const selectionViviMeshReadyMs = latestProbeDuration(
    selectionProbeEvents,
    selectionReadyProbe,
  );

  const meshToolActivationStart = performance.now();
  await meshTool.click();
  await expect(meshTool).toHaveClass(/active/);
  const meshToolActivationMs = Math.round(performance.now() - meshToolActivationStart);
  const toolButtonProbe = {
    name: "toolButtons.clickToNextFrame",
    meta: { tool: "meshEdit" },
  };
  const viewportProbe = { name: "viewportStore.setTool", meta: { tool: "meshEdit" } };
  const appReadyProbe = { name: "meshEdit.appReady", meta: { layerId } };
  const vertexReadyProbe = {
    name: "meshOverlay.vertexDetailsReady",
    meta: { selectedLayerId: layerId, editTarget: "mesh" },
  };
  const visualBuildProbe = {
    name: "meshOverlay.visualModelBuild",
    meta: { enabled: true, selectedLayerId: layerId, editTarget: "mesh" },
  };
  // Vertex details can be prepared during selection and cached on tool activation.
  // Preserve selection events and pending events; do not clear between phases.
  const toolProbeEvents = await collectPerfProbes(
    window,
    [toolButtonProbe, viewportProbe, appReadyProbe, vertexReadyProbe, visualBuildProbe],
    selectionProbeEvents,
  );
  const toolButtonClickToNextFrameMs = latestProbeDuration(
    toolProbeEvents,
    toolButtonProbe,
  );
  const viewportSetToolMs = latestProbeDuration(toolProbeEvents, viewportProbe);
  const meshEditAppReadyMs = latestProbeDuration(toolProbeEvents, appReadyProbe);
  const meshOverlayVertexDetailsReadyMs = latestProbeDuration(
    [...selectionProbeEvents, ...toolProbeEvents],
    vertexReadyProbe,
  );
  const meshOverlayVisualModelBuildMs = latestProbeDuration(
    toolProbeEvents,
    visualBuildProbe,
  );

  const meshPanelVisibleStart = performance.now();
  await expect(meshPanel(window)).toBeVisible();
  const meshPanelVisibleMs = Math.round(performance.now() - meshPanelVisibleStart);

  const editableCanvasVisibleStart = performance.now();
  await expect(window.locator(".canvas-container canvas")).toBeVisible();
  const editableCanvasVisibleMs = Math.round(
    performance.now() - editableCanvasVisibleStart,
  );

  const enterMeshEditMs = Math.round(performance.now() - enterStart);

  const exitStart = performance.now();
  await selectTool.click();
  await expect(selectTool).toHaveClass(/active/);
  const exitMeshEditMs = Math.round(performance.now() - exitStart);

  return {
    selectViviMeshMs,
    layerPanelClickToNextFrameMs,
    selectionStoreSelectLayerMs,
    selectionViviMeshReadyMs,
    meshToolActivationMs,
    toolButtonClickToNextFrameMs,
    viewportSetToolMs,
    meshEditAppReadyMs,
    meshOverlayVertexDetailsReadyMs,
    meshOverlayVisualModelBuildMs,
    meshPanelVisibleMs,
    editableCanvasVisibleMs,
    enterMeshEditMs,
    exitMeshEditMs,
  };
}

test.describe("Warm editor interaction perf", () => {
  test("probe guards reject missing, invalid and truncated observations", () => {
    const required = { name: "viewportStore.setTool", meta: { tool: "meshEdit" } };
    const zero = { ...required, durationMs: 0 };
    expect(latestProbeDuration([zero], required)).toBe(0);
    expect(() => latestProbeDuration([], required)).toThrow("PERF_PROBE_MISSING");
    expect(() =>
      latestProbeDuration([{ ...zero, meta: { tool: "select" } }], required),
    ).toThrow("PERF_PROBE_MISSING");
    for (const durationMs of [NaN, Infinity, -1, "0", undefined]) {
      expect(() =>
        latestProbeDuration([{ ...zero, durationMs: durationMs as number }], required),
      ).toThrow("PERF_PROBE_INVALID_DURATION");
    }
    const events: PerfProbeEvent[] = [];
    expect(() => appendPerfProbeBatch(events, null)).toThrow("PERF_PROBE_INVALID_BATCH");
    expect(() => appendPerfProbeBatch(events, Array(512).fill(zero))).toThrow(
      "PERF_PROBE_OVERFLOW",
    );
    expect(events).toHaveLength(0);
    appendPerfProbeBatch(events, Array(511).fill(zero));
    expect(() => appendPerfProbeBatch(events, [zero, zero])).toThrow(
      "PERF_PROBE_OVERFLOW",
    );
    expect(events).toHaveLength(511);
    appendPerfProbeBatch(events, [zero]);
    expect(events).toHaveLength(512);
  });

  test(`${SAMPLES} samples record layer selection + mesh edit responsiveness`, async ({
    window,
    loadTestPsd,
  }) => {
    test.setTimeout(60_000);

    await window.setViewportSize({ width: 1920, height: 1080 });
    await loadTestPsd();
    await expect(window.locator(".layer-item").first()).toBeVisible({ timeout: 10_000 });

    const samples: Sample[] = [];
    for (let i = 0; i < SAMPLES + WARMUP_SAMPLES; i++) {
      samples.push(await measureEditorInteraction(window));
    }

    const measured = samples.slice(WARMUP_SAMPLES);
    const summary = {
      recordedAt: new Date().toISOString(),
      platform: process.platform,
      arch: process.arch,
      node: process.version,
      note: BUDGETS.editorInteraction.note,
      samples: measured,
      warmupSamples: WARMUP_SAMPLES,
      median: {
        selectViviMeshMs: median(measured.map((s) => s.selectViviMeshMs)),
        layerPanelClickToNextFrameMs: median(
          measured.map((s) => s.layerPanelClickToNextFrameMs),
        ),
        selectionStoreSelectLayerMs: median(
          measured.map((s) => s.selectionStoreSelectLayerMs),
        ),
        selectionViviMeshReadyMs: median(measured.map((s) => s.selectionViviMeshReadyMs)),
        meshToolActivationMs: median(measured.map((s) => s.meshToolActivationMs)),
        toolButtonClickToNextFrameMs: median(
          measured.map((s) => s.toolButtonClickToNextFrameMs),
        ),
        viewportSetToolMs: median(measured.map((s) => s.viewportSetToolMs)),
        meshEditAppReadyMs: median(measured.map((s) => s.meshEditAppReadyMs)),
        meshOverlayVertexDetailsReadyMs: median(
          measured.map((s) => s.meshOverlayVertexDetailsReadyMs),
        ),
        meshOverlayVisualModelBuildMs: median(
          measured.map((s) => s.meshOverlayVisualModelBuildMs),
        ),
        meshPanelVisibleMs: median(measured.map((s) => s.meshPanelVisibleMs)),
        editableCanvasVisibleMs: median(measured.map((s) => s.editableCanvasVisibleMs)),
        enterMeshEditMs: median(measured.map((s) => s.enterMeshEditMs)),
        exitMeshEditMs: median(measured.map((s) => s.exitMeshEditMs)),
      },
    };

    writePerfBaseline(BASELINE_PATH, summary);

    const softEnterP50: number =
      BUDGETS.editorInteraction.budget_soft.enterMeshEditMs_p50;
    const softExitP50: number = BUDGETS.editorInteraction.budget_soft.exitMeshEditMs_p50;
    const softLayerPanelP50: number =
      BUDGETS.editorInteraction.budget_soft.layerPanelClickToNextFrameMs_p50;
    const softSelectionStoreP50: number =
      BUDGETS.editorInteraction.budget_soft.selectionStoreSelectLayerMs_p50;
    const softSelectionReadyP50: number =
      BUDGETS.editorInteraction.budget_soft.selectionViviMeshReadyMs_p50;
    const softToolButtonP50: number =
      BUDGETS.editorInteraction.budget_soft.toolButtonClickToNextFrameMs_p50;
    const softViewportSetToolP50: number =
      BUDGETS.editorInteraction.budget_soft.viewportSetToolMs_p50;
    const softMeshEditAppReadyP50: number =
      BUDGETS.editorInteraction.budget_soft.meshEditAppReadyMs_p50;
    const softMeshOverlayReadyP50: number =
      BUDGETS.editorInteraction.budget_soft.meshOverlayVertexDetailsReadyMs_p50;
    const softMeshOverlayBuildP50: number =
      BUDGETS.editorInteraction.budget_soft.meshOverlayVisualModelBuildMs_p50;
    const hardEnterMax: number =
      BUDGETS.editorInteraction.budget_hard.enterMeshEditMs_max;
    const hardExitMax: number = BUDGETS.editorInteraction.budget_hard.exitMeshEditMs_max;
    const coarseEnvelopeMode: string =
      BUDGETS.editorInteraction.coarseEnvelopeMode ?? "enforced";
    const hardLayerPanelMax: number =
      BUDGETS.editorInteraction.budget_hard.layerPanelClickToNextFrameMs_max;
    const hardSelectionStoreMax: number =
      BUDGETS.editorInteraction.budget_hard.selectionStoreSelectLayerMs_max;
    const hardSelectionReadyMax: number =
      BUDGETS.editorInteraction.budget_hard.selectionViviMeshReadyMs_max;
    const hardViewportSetToolMax: number =
      BUDGETS.editorInteraction.budget_hard.viewportSetToolMs_max;
    const hardMeshEditAppReadyMax: number =
      BUDGETS.editorInteraction.budget_hard.meshEditAppReadyMs_max;
    const hardMeshOverlayReadyMax: number =
      BUDGETS.editorInteraction.budget_hard.meshOverlayVertexDetailsReadyMs_max;
    const hardMeshOverlayBuildMax: number =
      BUDGETS.editorInteraction.budget_hard.meshOverlayVisualModelBuildMs_max;
    const maxEnter = Math.max(...measured.map((s) => s.enterMeshEditMs));
    const maxExit = Math.max(...measured.map((s) => s.exitMeshEditMs));
    const maxLayerPanel = Math.max(
      ...measured.map((s) => s.layerPanelClickToNextFrameMs),
    );
    const maxSelectionStore = Math.max(
      ...measured.map((s) => s.selectionStoreSelectLayerMs),
    );
    const maxSelectionReady = Math.max(
      ...measured.map((s) => s.selectionViviMeshReadyMs),
    );
    const maxToolButton = Math.max(
      ...measured.map((s) => s.toolButtonClickToNextFrameMs),
    );
    const maxViewportSetTool = Math.max(...measured.map((s) => s.viewportSetToolMs));
    const maxMeshEditAppReady = Math.max(...measured.map((s) => s.meshEditAppReadyMs));
    const maxMeshOverlayReady = Math.max(
      ...measured.map((s) => s.meshOverlayVertexDetailsReadyMs),
    );
    const maxMeshOverlayBuild = Math.max(
      ...measured.map((s) => s.meshOverlayVisualModelBuildMs),
    );

    console.log(
      `[perf-editor-interaction] median selectLayer=${summary.median.selectViviMeshMs}ms ` +
        `layerPanelNextFrame=${summary.median.layerPanelClickToNextFrameMs}ms (soft=${softLayerPanelP50}) ` +
        `selectionStore=${summary.median.selectionStoreSelectLayerMs}ms (soft=${softSelectionStoreP50}) ` +
        `selectionReady=${summary.median.selectionViviMeshReadyMs}ms (soft=${softSelectionReadyP50}) ` +
        `meshTool=${summary.median.meshToolActivationMs}ms ` +
        `toolButtonNextFrame=${summary.median.toolButtonClickToNextFrameMs}ms (report-only, soft=${softToolButtonP50}) ` +
        `viewportSetTool=${summary.median.viewportSetToolMs}ms (soft=${softViewportSetToolP50}) ` +
        `meshEditAppReady=${summary.median.meshEditAppReadyMs}ms (soft=${softMeshEditAppReadyP50}) ` +
        `meshOverlayReady=${summary.median.meshOverlayVertexDetailsReadyMs}ms (soft=${softMeshOverlayReadyP50}) ` +
        `meshOverlayBuild=${summary.median.meshOverlayVisualModelBuildMs}ms (soft=${softMeshOverlayBuildP50}) ` +
        `panel=${summary.median.meshPanelVisibleMs}ms ` +
        `canvas=${summary.median.editableCanvasVisibleMs}ms ` +
        `enterMesh=${summary.median.enterMeshEditMs}ms (soft=${softEnterP50}) ` +
        `exitMesh=${summary.median.exitMeshEditMs}ms (soft=${softExitP50}) ` +
        `maxLayerPanel=${maxLayerPanel}ms maxSelectionStore=${maxSelectionStore}ms maxSelectionReady=${maxSelectionReady}ms ` +
        `maxToolButton=${maxToolButton}ms maxViewportSetTool=${maxViewportSetTool}ms maxMeshEditAppReady=${maxMeshEditAppReady}ms ` +
        `maxMeshOverlayReady=${maxMeshOverlayReady}ms maxMeshOverlayBuild=${maxMeshOverlayBuild}ms ` +
        `maxEnter=${maxEnter}ms maxExit=${maxExit}ms`,
    );

    if (coarseEnvelopeMode === "reportOnly") {
      if (maxEnter >= hardEnterMax || maxExit >= hardExitMax) {
        console.warn(
          `[perf-editor-interaction] coarse envelope exceeded report-only hard thresholds ` +
            `(enter=${maxEnter}ms/${hardEnterMax}ms exit=${maxExit}ms/${hardExitMax}ms)`,
        );
      }
    }

    expect(
      maxLayerPanel,
      `layer panel selection paint exceeded hard budget ${hardLayerPanelMax}ms`,
    ).toBeLessThan(hardLayerPanelMax);
    expect(
      maxSelectionStore,
      `selection store update exceeded hard budget ${hardSelectionStoreMax}ms`,
    ).toBeLessThan(hardSelectionStoreMax);
    expect(
      maxSelectionReady,
      `selection ViviMesh ready exceeded hard budget ${hardSelectionReadyMax}ms`,
    ).toBeLessThan(hardSelectionReadyMax);
    expect(
      maxViewportSetTool,
      `viewportStore.setTool exceeded hard budget ${hardViewportSetToolMax}ms`,
    ).toBeLessThan(hardViewportSetToolMax);
    expect(
      maxMeshEditAppReady,
      `mesh edit app-ready exceeded hard budget ${hardMeshEditAppReadyMax}ms`,
    ).toBeLessThan(hardMeshEditAppReadyMax);
    expect(
      maxMeshOverlayReady,
      `mesh overlay readiness exceeded hard budget ${hardMeshOverlayReadyMax}ms`,
    ).toBeLessThan(hardMeshOverlayReadyMax);
    expect(
      maxMeshOverlayBuild,
      `mesh overlay visual model build exceeded hard budget ${hardMeshOverlayBuildMax}ms`,
    ).toBeLessThan(hardMeshOverlayBuildMax);
    if (coarseEnvelopeMode !== "reportOnly") {
      expect(
        maxEnter,
        `mesh edit entry exceeded hard budget ${hardEnterMax}ms`,
      ).toBeLessThan(hardEnterMax);
      expect(
        maxExit,
        `mesh edit exit exceeded hard budget ${hardExitMax}ms`,
      ).toBeLessThan(hardExitMax);
    }
  });
});
