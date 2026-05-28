#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";

const ROOT = resolve(import.meta.dirname, "..");
const BUDGET_PATH = resolve(ROOT, "docs/developer/quality/baselines/bundle-budget.json");
const ASSETS_DIR = resolve(ROOT, "dist/assets");

function loadBudget() {
  try {
    return JSON.parse(readFileSync(BUDGET_PATH, "utf8"));
  } catch (e) {
    console.error(`Error: failed to load ${BUDGET_PATH}: ${e.message}`);
    process.exit(2);
  }
}

function listAssets() {
  try {
    const stat = statSync(ASSETS_DIR);
    if (!stat.isDirectory()) {
      console.error(`Error: ${ASSETS_DIR} is not a directory`);
      process.exit(2);
    }
  } catch {
    console.error(`Error: ${ASSETS_DIR} not found. Run \`npm run build\` first.`);
    process.exit(2);
  }
  return readdirSync(ASSETS_DIR);
}

function findChunk(files, prefix, ext) {
  return files.find((f) => f.startsWith(`${prefix}-`) && f.endsWith(ext));
}

function fmt(n) {
  return n.toLocaleString("en-US");
}

function checkChunk(file, budget, label) {
  const fullPath = resolve(ASSETS_DIR, file);
  const content = readFileSync(fullPath);
  const raw = content.length;
  const failures = [];

  if (typeof budget.raw === "number" && raw > budget.raw) {
    failures.push(
      `raw ${fmt(raw)} > budget ${fmt(budget.raw)} (+${fmt(raw - budget.raw)})`,
    );
  }
  if (typeof budget.gzip === "number") {
    const gzip = gzipSync(content).length;
    if (gzip > budget.gzip) {
      failures.push(
        `gzip ${fmt(gzip)} > budget ${fmt(budget.gzip)} (+${fmt(gzip - budget.gzip)})`,
      );
    }
  }

  return { label, file, raw, failures };
}

function main() {
  const budget = loadBudget();
  const files = listAssets();
  const results = [];
  const missing = [];

  for (const [prefix, b] of Object.entries(budget.chunks ?? {})) {
    const file = findChunk(files, prefix, ".js");
    if (!file) {
      missing.push(`chunks.${prefix}`);
      continue;
    }
    const r = checkChunk(file, b, `chunks.${prefix}`);
    results.push(r);
  }

  for (const [prefix, b] of Object.entries(budget.css ?? {})) {
    const file = findChunk(files, prefix, ".css");
    if (!file) {
      missing.push(`css.${prefix}`);
      continue;
    }
    results.push(checkChunk(file, b, `css.${prefix}`));
  }

  let allJsRaw = 0;
  for (const f of files) {
    if (!f.endsWith(".js")) continue;
    allJsRaw += statSync(resolve(ASSETS_DIR, f)).size;
  }

  console.log("\n=== Bundle Budget Check ===");
  console.log(`assets dir: ${ASSETS_DIR}`);
  console.log(`budget:     ${BUDGET_PATH}\n`);

  let failed = false;
  for (const r of results) {
    if (r.failures.length > 0) {
      failed = true;
      console.error(`❌ ${r.label.padEnd(28)} ${r.file}`);
      for (const msg of r.failures) console.error(`   ${msg}`);
    } else {
      console.log(`✅ ${r.label.padEnd(28)} ${r.file}  raw=${fmt(r.raw)}`);
    }
  }

  const totalBudget = budget.totals?.allChunks?.raw;
  if (typeof totalBudget === "number") {
    const overflow = allJsRaw - totalBudget;
    if (overflow > 0) {
      failed = true;
      console.error(
        `\n❌ totals.allChunks raw ${fmt(allJsRaw)} > budget ${fmt(totalBudget)} (+${fmt(overflow)})`,
      );
    } else {
      console.log(
        `\n✅ totals.allChunks raw=${fmt(allJsRaw)} (budget ${fmt(totalBudget)}, margin ${fmt(-overflow)})`,
      );
    }
  } else {
    console.log(`\nℹ totals.allChunks raw=${fmt(allJsRaw)} (no budget)`);
  }

  if (missing.length > 0) {
    failed = true;
    console.error("\n❌ Missing expected chunks:");
    for (const m of missing) console.error(`   - ${m}`);
    console.error("   Update docs/developer/quality/baselines/bundle-budget.json or rebuild.");
  }

  if (failed) {
    console.error("\n⚠️  Bundle budget exceeded. Investigate before merging.");
    process.exit(1);
  }
  console.log("\n✅ All chunks within budget.");
  process.exit(0);
}

main();
