import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "../fixtures";
import { writePerfBaseline } from "../helpers/perf-baseline";


const ROOT = path.resolve(import.meta.dirname, "../..");
const BUDGETS = JSON.parse(
  readFileSync(path.resolve(ROOT, "e2e/perf-budgets.json"), "utf8"),
);
const BASELINE_PATH = path.resolve(
  ROOT,
  "docs/developer/quality/baselines/perf-memory-leak-2026-04-30.json",
);
const LOOPS: number = BUDGETS.memoryLeak.loops;
const WARMUP_LOOPS = 2;
const LAYERS_PER_LOOP = 50;
const PARAMS_PER_LOOP = 100;

type Sample = { loop: number; usedJsHeapBytes: number };

test.describe("メモリリーク検出 (P7-P4)", () => {
  test(`プロジェクト 注入→クリア を ${LOOPS} 回繰り返し heap 増分を測る`, async ({
    window,
    loadTestPsd,
  }) => {
    test.setTimeout(60_000);

    await window.setViewportSize({ width: 1920, height: 1080 });
    await loadTestPsd();

    const baseProject = await window.evaluate(() => {
      const v = window.__vivi2d!;
      const store = v.useEditorStore as { getState: () => { project: unknown } };
      return JSON.parse(JSON.stringify(store.getState().project));
    });

    const cdp = await window.context().newCDPSession(window);
    await cdp.send("Performance.enable");
    await cdp.send("HeapProfiler.enable");

    const samples: Sample[] = [];
    for (let i = 0; i < LOOPS + WARMUP_LOOPS; i++) {
      await window.evaluate(
        ({ layersCount, paramsCount, loopId }) => {
          const v = window.__vivi2d!;
          const store = v.useEditorStore as {
            setState: (fn: (s: { project: Record<string, unknown[]> }) => void) => void;
          };
          store.setState((s) => {
            const layers: unknown[] = [];
            for (let j = 0; j < layersCount; j++) {
              layers.push({
                id: `leak-${loopId}-${j}`,
                kind: "group",
                name: `LeakL${loopId}-${j}`,
                visible: true,
                opacity: 1,
                x: 0,
                y: 0,
                width: 100,
                height: 100,
                blendMode: "normal",
                expanded: false,
                children: [],
              });
            }
            const params: unknown[] = [];
            for (let j = 0; j < paramsCount; j++) {
              params.push({
                id: `leak-p-${loopId}-${j}`,
                name: `LeakP${loopId}-${j}`,
                minValue: -1,
                maxValue: 1,
                defaultValue: 0,
              });
            }
            s.project.layers = [...(s.project.layers ?? []), ...layers];
            s.project.parameters = [...(s.project.parameters ?? []), ...params];
          });
        },
        {
          layersCount: LAYERS_PER_LOOP,
          paramsCount: PARAMS_PER_LOOP,
          loopId: i,
        },
      );

      await window.evaluate((base) => {
        const v = window.__vivi2d!;
        const store = v.useEditorStore as {
          setState: (fn: (s: { project: unknown }) => void) => void;
        };
        store.setState((s) => {
          s.project = JSON.parse(JSON.stringify(base));
        });
      }, baseProject);

      await cdp.send("HeapProfiler.collectGarbage");
      await window.waitForTimeout(50);

      const metrics = await cdp.send("Performance.getMetrics");
      const used = metrics.metrics.find((m) => m.name === "JSHeapUsedSize")?.value ?? 0;

      samples.push({ loop: i, usedJsHeapBytes: used });
    }

    await cdp.detach();

    const measured = samples.slice(WARMUP_LOOPS);
    const first = measured[0];
    const last = measured[measured.length - 1];
    if (!first || !last)
      throw new Error("measurement 配列に値がない (LOOPS/WARMUP_LOOPS を確認)");
    const firstHeap = first.usedJsHeapBytes;
    const lastHeap = last.usedJsHeapBytes;
    const deltaBytes = lastHeap - firstHeap;
    const loopsMeasured = measured.length - 1;
    const mbPerLoop = loopsMeasured > 0 ? deltaBytes / loopsMeasured / (1024 * 1024) : 0;

    const summary = {
      recordedAt: new Date().toISOString(),
      platform: process.platform,
      arch: process.arch,
      node: process.version,
      loops: LOOPS,
      warmupLoops: WARMUP_LOOPS,
      layersPerLoop: LAYERS_PER_LOOP,
      parametersPerLoop: PARAMS_PER_LOOP,
      samples,
      firstMeasuredHeapBytes: firstHeap,
      lastMeasuredHeapBytes: lastHeap,
      deltaBytes,
      heapIncreaseMBPerLoop: Number(mbPerLoop.toFixed(3)),
    };
    writePerfBaseline(BASELINE_PATH, summary);

    const softLimit: number = BUDGETS.memoryLeak.budget_soft.heapIncreaseMBPerLoop;
    const hardLimit: number = BUDGETS.memoryLeak.budget_hard.heapIncreaseMBPerLoop;
    const softMark = mbPerLoop <= softLimit ? "OK" : `⚠ > soft (${softLimit}MB/loop)`;
    console.log(
      `[perf-memory-leak] ${summary.heapIncreaseMBPerLoop} MB/loop ` +
        `(Δ=${Math.round(deltaBytes / 1024)}KB across ${loopsMeasured} loops) [${softMark}]`,
    );

    expect(
      mbPerLoop,
      `heap 増分 ${mbPerLoop.toFixed(3)} MB/loop が hard budget ${hardLimit} MB/loop を超過`,
    ).toBeLessThanOrEqual(hardLimit);
    expect(samples.length).toBe(LOOPS + WARMUP_LOOPS);
  });
});
