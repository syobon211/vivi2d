import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "../fixtures";

// ============================================================
// Color-contrast inventory spec
//
// Outputs:
//   docs/developer/quality/baselines/color-contrast-{initial,workspace}-2026-04-19.json
//
// Run (bash):
//     RUN_A11Y_INVENTORY=1 npx playwright test --config=e2e/playwright.config.ts _inventory-color-contrast
//
// Run (PowerShell):
//     $env:RUN_A11Y_INVENTORY="1"; npx playwright test ...
//
// Generated baselines:
//   - docs/developer/quality/baselines/color-contrast-initial-2026-04-19.json
//   - docs/developer/quality/baselines/color-contrast-workspace-2026-04-19.json
// ============================================================

const RUN_INVENTORY = process.env.RUN_A11Y_INVENTORY === "1";

const require_ = createRequire(import.meta.url);
const AXE_SOURCE_PATH = path.join(
  path.dirname(require_.resolve("axe-core/package.json")),
  "axe.min.js",
);
const AXE_SOURCE = fs.readFileSync(AXE_SOURCE_PATH, "utf-8");

interface ContrastNode {
  target: string[];
  html: string;
  failureSummary?: string;
  any?: Array<{ data?: { contrastRatio?: number; expectedContrastRatio?: number } }>;
}

interface AxeResult {
  violations: Array<{ id: string; nodes: ContrastNode[] }>;
}

async function getContrastViolations(
  window: import("playwright").Page,
): Promise<ContrastNode[]> {
  await window.evaluate(AXE_SOURCE);
  const results = (await window.evaluate(() => {
    // @ts-expect-error injected global
    return window.axe.run(document, {
      runOnly: { type: "rule", values: ["color-contrast"] },
    });
  })) as AxeResult;
  return results.violations[0]?.nodes ?? [];
}

interface BreakdownEntry {
  count: number;
  examples: string[];
}

function classifyByClass(nodes: ContrastNode[]): Record<string, BreakdownEntry> {
  const byKey: Record<string, BreakdownEntry> = {};
  for (const node of nodes) {
    const sel = node.target[node.target.length - 1] ?? "";
    const classes = (sel.match(/\.[a-zA-Z0-9_-]+/g) ?? []).map((c) => c.slice(1));
    let key: string;
    if (classes.length === 0) {
      key = `(no-class) ${sel.slice(0, 60)}`;
    } else {
      key = `.${[...classes].sort().join(".")}`;
    }
    const entry = byKey[key] ?? { count: 0, examples: [] };
    entry.count += 1;
    if (entry.examples.length < 3) {
      entry.examples.push(sel);
    }
    byKey[key] = entry;
  }
  return byKey;
}

function sortByCount(byKey: Record<string, BreakdownEntry>) {
  return Object.entries(byKey).sort((a, b) => b[1].count - a[1].count);
}

function writeBreakdown(
  filename: string,
  total: number,
  byKey: Record<string, BreakdownEntry>,
) {
  const sorted = sortByCount(byKey);
  const out = {
    capturedAt: new Date().toISOString().slice(0, 10),
    total,
    breakdown: Object.fromEntries(sorted),
  };
  const outPath = path.resolve(
    import.meta.dirname,
    "../../docs/developer/quality/baselines",
    filename,
  );
  fs.writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);
  console.log(
    `[color-contrast inventory] wrote ${outPath}: total=${total}, classes=${sorted.length}`,
  );
  console.log(
    `[color-contrast inventory] top 5: ${sorted
      .slice(0, 5)
      .map(([k, v]) => `${k}=${v.count}`)
      .join(", ")}`,
  );
}

test.describe("color-contrast inventory (calibration)", () => {
  test.skip(
    !RUN_INVENTORY,
    "calibration spec; set RUN_A11Y_INVENTORY=1 to regenerate baselines",
  );

  test("起動直後: violations を JSON 出力", async ({ window }) => {
    const nodes = await getContrastViolations(window);
    const byKey = classifyByClass(nodes);
    writeBreakdown("color-contrast-initial-2026-04-19.json", nodes.length, byKey);
  });

  test("PSD 読込後: violations を JSON 出力", async ({ window, loadTestPsd }) => {
    await loadTestPsd();
    const nodes = await getContrastViolations(window);
    const byKey = classifyByClass(nodes);
    writeBreakdown("color-contrast-workspace-2026-04-19.json", nodes.length, byKey);
  });
});
