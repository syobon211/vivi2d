#!/usr/bin/env node
import { readFileSync } from "node:fs";

const METRICS = ["statements", "branches", "functions", "lines"];

function parseArgs(argv) {
  const args = { before: null, after: null, threshold: 0.5 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--before") args.before = argv[++i];
    else if (a === "--after") args.after = argv[++i];
    else if (a === "--threshold") args.threshold = Number.parseFloat(argv[++i]);
    else if (a === "-h" || a === "--help") {
      console.log(
        "Usage: node scripts/coverage-diff.mjs --before <baseline.json> --after <baseline.json> [--threshold 0.5]",
      );
      process.exit(0);
    }
  }
  if (!args.before || !args.after) {
    console.error("Error: --before and --after are required.");
    console.error(
      "Usage: node scripts/coverage-diff.mjs --before <baseline.json> --after <baseline.json>",
    );
    process.exit(2);
  }
  if (Number.isNaN(args.threshold) || args.threshold < 0) {
    console.error(
      `Error: --threshold must be a non-negative number, got: ${args.threshold}`,
    );
    process.exit(2);
  }
  return args;
}

function loadBaseline(path) {
  try {
    const raw = readFileSync(path, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    console.error(`Error: failed to load ${path}: ${e.message}`);
    process.exit(2);
  }
}

function getPct(value) {
  if (typeof value === "number") return value;
  if (value && typeof value === "object" && typeof value.pct === "number")
    return value.pct;
  return null;
}

function fmtDelta(delta) {
  if (delta === null) return "  n/a";
  const sign = delta > 0 ? "+" : delta < 0 ? "" : " ";
  return `${sign}${delta.toFixed(2)}`.padStart(6);
}

function fmtPct(pct) {
  return pct === null ? " n/a " : pct.toFixed(2).padStart(6);
}

function symbol(delta, threshold) {
  if (delta === null) return " ";
  if (delta >= threshold) return "↑";
  if (delta <= -threshold) return "↓";
  return "=";
}

function main() {
  const args = parseArgs(process.argv);
  const before = loadBaseline(args.before);
  const after = loadBaseline(args.after);

  let regressed = false;
  const threshold = args.threshold;

  console.log(`\n=== Coverage Diff ===`);
  console.log(`before:    ${args.before}`);
  console.log(`after:     ${args.after}`);
  console.log(`threshold: ${threshold} pct point\n`);

  // --- totals ---
  console.log("Totals:");
  console.log(
    `  ${"metric".padEnd(12)} ${"before".padStart(6)} ${"after".padStart(6)} ${"delta".padStart(6)}  symbol`,
  );
  for (const m of METRICS) {
    const b = getPct(before.totals?.[m]);
    const a = getPct(after.totals?.[m]);
    const d = b !== null && a !== null ? a - b : null;
    if (d !== null && d <= -threshold) regressed = true;
    console.log(
      `  ${m.padEnd(12)} ${fmtPct(b)} ${fmtPct(a)} ${fmtDelta(d)}    ${symbol(d, threshold)}`,
    );
  }

  // --- byPackage ---
  const beforePkgs = before.byPackage ?? {};
  const afterPkgs = after.byPackage ?? {};
  const allPkgs = [
    ...new Set([...Object.keys(beforePkgs), ...Object.keys(afterPkgs)]),
  ].sort();

  if (allPkgs.length > 0) {
    console.log("\nByPackage (lines pct):");
    console.log(
      `  ${"package".padEnd(36)} ${"before".padStart(6)} ${"after".padStart(6)} ${"delta".padStart(6)}  symbol`,
    );
    for (const pkg of allPkgs) {
      const b = getPct(beforePkgs[pkg]?.lines);
      const a = getPct(afterPkgs[pkg]?.lines);
      const d = b !== null && a !== null ? a - b : null;
      if (d !== null && d <= -threshold) regressed = true;
      console.log(
        `  ${pkg.padEnd(36)} ${fmtPct(b)} ${fmtPct(a)} ${fmtDelta(d)}    ${symbol(d, threshold)}`,
      );
    }
  }

  console.log("");
  if (regressed) {
    console.log(
      `⚠️  Regression detected (delta ≤ -${threshold} pct point in at least one metric)`,
    );
    process.exit(1);
  }
  console.log("✅ No regression beyond threshold");
  process.exit(0);
}

main();
