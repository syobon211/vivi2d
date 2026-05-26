import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { writePerfBaseline } from "../helpers/perf-baseline";


const ROOT = path.resolve(import.meta.dirname, "../..");
const BUDGETS = JSON.parse(
  readFileSync(path.resolve(ROOT, "e2e/perf-budgets.json"), "utf8"),
);
const BASELINE_PATH = path.resolve(ROOT, "docs/developer/quality/baselines/perf-bundle-2026-04-30.json");
const ASSETS_DIR = path.resolve(ROOT, "dist/assets");

function listJsChunks(): Array<{ name: string; bytes: number }> {
  const files = readdirSync(ASSETS_DIR).filter((f) => f.endsWith(".js"));
  return files.map((name) => ({
    name,
    bytes: statSync(path.join(ASSETS_DIR, name)).size,
  }));
}

test.describe("バンドル予算 (P7-P6)", () => {
  test("dist/assets/ の main bundle と chunk 合計を計測する", async () => {
    if (!existsSync(ASSETS_DIR)) {
      test.skip(
        true,
        `${ASSETS_DIR} が存在しないのでスキップ。先に \`npm run build\` を実行してください。`,
      );
      return;
    }

    const chunks = listJsChunks();
    expect(chunks.length, "dist/assets/ に js chunk が 1 つ以上あること").toBeGreaterThan(
      0,
    );

    const mainChunk = chunks.find((c) => /^index-[^/]+\.js$/.test(c.name));
    expect(
      mainChunk,
      `main bundle (index-*.js) が dist/assets/ に見つからない`,
    ).toBeTruthy();
    if (!mainChunk) return;

    const totalBytes = chunks.reduce((sum, c) => sum + c.bytes, 0);

    const summary = {
      recordedAt: new Date().toISOString(),
      platform: process.platform,
      arch: process.arch,
      mainBundle: mainChunk,
      chunkCount: chunks.length,
      totalJsBytes: totalBytes,
      topChunks: [...chunks].sort((a, b) => b.bytes - a.bytes).slice(0, 10),
    };
    writePerfBaseline(BASELINE_PATH, summary);

    const softMain: number = BUDGETS.bundle.budget_soft.mainIndexBytes;
    const hardMain: number = BUDGETS.bundle.budget_hard.mainIndexBytes;
    const softMark =
      mainChunk.bytes <= softMain
        ? "OK"
        : `⚠ soft ${softMain.toLocaleString()} を ${(mainChunk.bytes - softMain).toLocaleString()} 超過`;
    console.log(
      `[perf-bundle] main=${mainChunk.name} ${mainChunk.bytes.toLocaleString()}B ` +
        `totalJs=${totalBytes.toLocaleString()}B chunks=${chunks.length} [${softMark}]`,
    );

    expect(
      mainChunk.bytes,
      `main bundle ${mainChunk.bytes.toLocaleString()}B が hard budget ${hardMain.toLocaleString()}B を超過`,
    ).toBeLessThanOrEqual(hardMain);
  });
});
