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
  "docs/developer/quality/baselines/perf-timeline-render-2026-04-30.json",
);
const KEYFRAMES: number = BUDGETS.timelineRender.keyframeCount;

test.describe("タイムライン描画時間 (P7-P5)", () => {
  test(`${KEYFRAMES} キーフレームを注入して state 反映 / 初期表示時間を記録する`, async ({
    window,
    loadTestPsd,
  }) => {
    test.setTimeout(60_000);

    await window.setViewportSize({ width: 1920, height: 1080 });
    await loadTestPsd();

    const injectionMs = await window.evaluate((count) => {
      const v = window.__vivi2d!;
      const store = v.useEditorStore as {
        setState: (fn: (s: { project: Record<string, unknown[]> }) => void) => void;
      };
      const paramId = "perf-timeline-param";
      const keyframes: Array<{ time: number; value: number; interpolation: string }> = [];
      for (let i = 0; i < count; i++) {
        keyframes.push({
          time: i * 0.01,
          value: (i % 10) / 10,
          interpolation: "linear",
        });
      }

      const t0 = performance.now();
      store.setState((s) => {
        s.project.parameters = [
          ...(s.project.parameters ?? []),
          {
            id: paramId,
            name: "perfTimelineParam",
            minValue: 0,
            maxValue: 1,
            defaultValue: 0,
          },
        ];
        s.project.clips = [
          ...(s.project.clips ?? []),
          {
            id: "clip-perf-timeline",
            name: "PerfTimelineClip",
            duration: count * 0.01,
            tracks: [
              {
                id: "track-perf-timeline",
                type: "parameter",
                parameterId: paramId,
                keyframes,
              },
            ],
          },
        ];
      });
      return performance.now() - t0;
    }, KEYFRAMES);

    const storedCount = await window.evaluate(() => {
      const v = window.__vivi2d!;
      const store = v.useEditorStore as {
        getState: () => {
          project: {
            clips: Array<{ name: string; tracks: Array<{ keyframes: unknown[] }> }>;
          };
        };
      };
      const clip = store
        .getState()
        .project.clips.find((c) => c.name === "PerfTimelineClip");
      return clip?.tracks[0]?.keyframes.length ?? 0;
    });
    expect(storedCount).toBe(KEYFRAMES);

    const firstPaintStart = performance.now();
    await expect(window.locator(".workspace")).toBeVisible({ timeout: 10_000 });
    const firstPaintMs = performance.now() - firstPaintStart;

    const summary = {
      recordedAt: new Date().toISOString(),
      platform: process.platform,
      arch: process.arch,
      node: process.version,
      keyframeCount: KEYFRAMES,
      injectionMs: Number(injectionMs.toFixed(2)),
      firstPaintMs: Number(firstPaintMs.toFixed(2)),
    };
    writePerfBaseline(BASELINE_PATH, summary);

    const softInj: number = BUDGETS.timelineRender.budget_soft.injectionMs;
    const hardInj: number = BUDGETS.timelineRender.budget_hard.injectionMs;
    const softPaint: number = BUDGETS.timelineRender.budget_soft.firstPaintMs;
    const hardPaint: number = BUDGETS.timelineRender.budget_hard.firstPaintMs;
    console.log(
      `[perf-timeline-render] inject=${summary.injectionMs}ms (soft=${softInj}) ` +
        `firstPaint=${summary.firstPaintMs}ms (soft=${softPaint})`,
    );

    expect(
      injectionMs,
      `1000 keyframe 注入 ${injectionMs.toFixed(0)}ms > hard budget ${hardInj}ms`,
    ).toBeLessThan(hardInj);
    expect(
      firstPaintMs,
      `timeline first-paint ${firstPaintMs.toFixed(0)}ms > hard budget ${hardPaint}ms`,
    ).toBeLessThan(hardPaint);
  });
});
