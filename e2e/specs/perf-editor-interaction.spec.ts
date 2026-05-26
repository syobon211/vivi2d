import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "../fixtures";
import { writePerfBaseline } from "../helpers/perf-baseline";
import { selectLayer } from "../helpers/operations";

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
  return window.locator(".properties-section").filter({ hasText: /^(Mesh|\u30e1\u30c3\u30b7\u30e5)/ }).first();
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

function latestProbeDuration(
  events: PerfProbeEvent[],
  name: string,
  predicate?: (event: PerfProbeEvent) => boolean,
): number {
  const event = [...events].reverse().find((candidate) => {
    if (candidate.name !== name) return false;
    return predicate ? predicate(candidate) : true;
  });
  return Math.round(event?.durationMs ?? 0);
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
  await consumePerfProbeEvents(window);

  const enterStart = performance.now();
  const selectLayerStart = performance.now();
  await selectLayer(window, "Red Circle");
  const selectViviMeshMs = Math.round(performance.now() - selectLayerStart);
  const selectionProbeEvents = await consumePerfProbeEvents(window);
  const layerPanelClickToNextFrameMs = latestProbeDuration(
    selectionProbeEvents,
    "layerPanel.clickToNextFrame",
    (event) => event.meta?.mode === "single",
  );
  const selectionStoreSelectLayerMs = latestProbeDuration(
    selectionProbeEvents,
    "selectionStore.selectLayer",
  );
  const selectionViviMeshReadyMs =
    latestProbeDuration(selectionProbeEvents, "selection.viviMeshReady") ||
    latestProbeDuration(selectionProbeEvents, "selection.viviMeshReady");

  const meshToolActivationStart = performance.now();
  await meshTool.click();
  await expect(meshTool).toHaveClass(/active/);
  const meshToolActivationMs = Math.round(performance.now() - meshToolActivationStart);
  const toolProbeEvents = await consumePerfProbeEvents(window);
  const toolButtonClickToNextFrameMs = latestProbeDuration(
    toolProbeEvents,
    "toolButtons.clickToNextFrame",
    (event) => event.meta?.tool === "meshEdit",
  );
  const viewportSetToolMs = latestProbeDuration(
    toolProbeEvents,
    "viewportStore.setTool",
    (event) => event.meta?.tool === "meshEdit",
  );
  const meshEditAppReadyMs = latestProbeDuration(toolProbeEvents, "meshEdit.appReady");
  const meshOverlayVertexDetailsReadyMs = latestProbeDuration(
    [...selectionProbeEvents, ...toolProbeEvents],
    "meshOverlay.vertexDetailsReady",
  );
  const meshOverlayVisualModelBuildMs = latestProbeDuration(
    [...selectionProbeEvents, ...toolProbeEvents],
    "meshOverlay.visualModelBuild",
    (event) => event.meta?.enabled === true && event.meta?.editTarget === "mesh",
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
    const hardToolButtonMax: number =
      BUDGETS.editorInteraction.budget_hard.toolButtonClickToNextFrameMs_max;
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
        `toolButtonNextFrame=${summary.median.toolButtonClickToNextFrameMs}ms (soft=${softToolButtonP50}) ` +
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
      maxToolButton,
      `tool button next-frame exceeded hard budget ${hardToolButtonMax}ms`,
    ).toBeLessThan(hardToolButtonMax);
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
