import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { expect, test } from "../fixtures";


const require_ = createRequire(import.meta.url);
const AXE_SOURCE_PATH = path.join(
  path.dirname(require_.resolve("axe-core/package.json")),
  "axe.min.js",
);
const AXE_SOURCE = fs.readFileSync(AXE_SOURCE_PATH, "utf-8");

async function runAxe(
  window: import("playwright").Page,
  opts: { rules?: string[]; tags?: string[] } = {},
): Promise<{ violations: AxeViolation[] }> {
  await window.evaluate(AXE_SOURCE);
  return window.evaluate((runOpts) => {
    const axeOpts: Record<string, unknown> = {};
    if (runOpts.rules) {
      axeOpts.runOnly = { type: "rule", values: runOpts.rules };
    } else if (runOpts.tags) {
      axeOpts.runOnly = { type: "tag", values: runOpts.tags };
    }
    // @ts-expect-error injected global
    return window.axe.run(document, axeOpts);
  }, opts);
}

interface AxeViolation {
  id: string;
  impact: "minor" | "moderate" | "serious" | "critical" | null;
  description: string;
  help: string;
  nodes: Array<{ target: string[]; html: string }>;
}

const SEVERE = new Set(["critical", "serious"]);
function severeViolations(violations: AxeViolation[]) {
  return violations.filter((v) => v.impact && SEVERE.has(v.impact));
}

const KNOWN_BASELINE = {
  initial: { "color-contrast": 0 },
  workspace: { "color-contrast": 0 },
};

function countByRule(violations: AxeViolation[]) {
  const counts: Record<string, number> = {};
  for (const v of violations) {
    counts[v.id] = (counts[v.id] ?? 0) + v.nodes.length;
  }
  return counts;
}

test.describe("アクセシビリティ検証", () => {
  test("起動直後: 既知違反以外に重大なa11y違反がない", async ({ window }) => {
    const results = await runAxe(window, { tags: ["wcag2a", "wcag2aa"] });
    const severe = severeViolations(results.violations);
    const counts = countByRule(severe);

    const unknownRules = Object.keys(counts).filter(
      (id) => !(id in KNOWN_BASELINE.initial),
    );
    if (unknownRules.length > 0) {
      console.log("[a11y] 新規違反ルール:", unknownRules);
      console.log(
        "[a11y] 詳細:",
        severe.filter((v) => unknownRules.includes(v.id)),
      );
    }
    expect(unknownRules).toEqual([]);

    for (const [rule, baseline] of Object.entries(KNOWN_BASELINE.initial)) {
      const actual = counts[rule] ?? 0;
      expect(
        actual,
        `${rule}: baseline=${baseline}, actual=${actual}（増えたらデグレ）`,
      ).toBeLessThanOrEqual(baseline);
    }
  });

  test("PSD読み込み後: 既知違反以外に重大なa11y違反がない", async ({
    window,
    loadTestPsd,
  }) => {
    await loadTestPsd();
    const results = await runAxe(window, { tags: ["wcag2a", "wcag2aa"] });
    const severe = severeViolations(results.violations);
    const counts = countByRule(severe);

    const unknownRules = Object.keys(counts).filter(
      (id) => !(id in KNOWN_BASELINE.workspace),
    );
    if (unknownRules.length > 0) {
      console.log("[a11y] 新規違反ルール:", unknownRules);
      console.log(
        "[a11y] 詳細:",
        severe.filter((v) => unknownRules.includes(v.id)),
      );
    }
    expect(unknownRules).toEqual([]);

    for (const [rule, baseline] of Object.entries(KNOWN_BASELINE.workspace)) {
      const actual = counts[rule] ?? 0;
      expect(
        actual,
        `${rule}: baseline=${baseline}, actual=${actual}（増えたらデグレ）`,
      ).toBeLessThanOrEqual(baseline);
    }
  });

  test("aria 属性とランドマーク: 違反がない（形式バグ検出）", async ({ window }) => {
    const results = await runAxe(window, {
      rules: [
        "aria-valid-attr",
        "aria-valid-attr-value",
        "aria-required-attr",
        "aria-required-children",
        "aria-roles",
        "duplicate-id-aria",
      ],
    });
    const severe = severeViolations(results.violations);
    if (severe.length > 0) {
      console.log(
        "[a11y] aria 違反:",
        severe.map((v) => `${v.id}: ${v.help}`).join("\n"),
      );
    }
    expect(severe).toEqual([]);
  });

  test("ボタンには名前がある（button-name ルール）", async ({ window }) => {
    const results = await runAxe(window, { rules: ["button-name"] });
    const severe = severeViolations(results.violations);
    if (severe.length > 0) {
      console.log(
        "[a11y] button-name 違反:",
        severe.flatMap((v) => v.nodes.map((n) => n.html)),
      );
    }
    expect(severe.length).toBeLessThanOrEqual(0);
  });
});
