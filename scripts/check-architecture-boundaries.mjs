import { collectArchitectureFailures } from "./lib/architecture-boundary-runner.mjs";
import { readJson } from "./lib/repo.mjs";

const includeUntracked = !process.argv.includes("--tracked-only");
const manifest = readJson("scripts/architecture-boundaries.manifest.json");
const failures = collectArchitectureFailures(manifest, { includeUntracked });

if (failures.length > 0) {
  console.error("[architecture-boundaries] failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("[architecture-boundaries] passed");
