import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "../fixtures";
import { writePerfBaseline } from "../helpers/perf-baseline";


const ROOT = path.resolve(import.meta.dirname, "../..");
const BUDGETS = JSON.parse(
  readFileSync(path.resolve(ROOT, "e2e/perf-budgets.json"), "utf8"),
);
const BASELINE_PATH = path.resolve(ROOT, "docs/developer/quality/baselines/perf-fps-2026-04-30.json");
const SAMPLES = 3;
const SAMPLING_MS: number = BUDGETS.fps.samplingMs;

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[mid] as number;
  return ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

test.describe("FPS 計測 (P7-P3)", () => {
  test(`rAF で ${SAMPLING_MS}ms × ${SAMPLES} 回計測し FPS (vsync プロキシ) を記録する`, async ({
    window,
    loadTestPsd,
  }) => {
    test.setTimeout(SAMPLING_MS * SAMPLES * 2 + 30_000);

    await window.setViewportSize({ width: 1920, height: 1080 });
    await loadTestPsd();

    await window.waitForTimeout(500);

    const fpsSamples: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      const fps = await window.evaluate(async (durationMs) => {
        return await new Promise<number>((resolve) => {
          let frames = 0;
          const start = performance.now();
          const tick = () => {
            frames++;
            if (performance.now() - start < durationMs) {
              requestAnimationFrame(tick);
            } else {
              const elapsed = performance.now() - start;
              resolve((frames * 1000) / elapsed);
            }
          };
          requestAnimationFrame(tick);
        });
      }, SAMPLING_MS);
      fpsSamples.push(Number(fps.toFixed(2)));
    }

    const medianFps = Number(median(fpsSamples).toFixed(2));
    const minFps = Number(Math.min(...fpsSamples).toFixed(2));

    const summary = {
      recordedAt: new Date().toISOString(),
      platform: process.platform,
      arch: process.arch,
      node: process.version,
      samples: fpsSamples,
      median: medianFps,
      min: minFps,
      samplingMs: SAMPLING_MS,
      note: BUDGETS.fps.note,
    };
    writePerfBaseline(BASELINE_PATH, summary);

    const softMin: number = BUDGETS.fps.budget_soft.minFPS;
    const hardMin: number = BUDGETS.fps.budget_hard.minFPS;
    const softDiff = medianFps >= softMin ? "OK" : `⚠ below soft (${softMin})`;
    console.log(
      `[perf-fps] median=${medianFps}fps min=${minFps}fps samples=${fpsSamples.join(", ")} [${softDiff}]`,
    );

    expect(
      minFps,
      `min FPS ${minFps} は hard budget ${hardMin} を下回る。描画ループに重大な regression の可能性`,
    ).toBeGreaterThanOrEqual(hardMin);

    expect(fpsSamples.length).toBe(SAMPLES);
    expect(medianFps).toBeGreaterThan(0);
  });
});
