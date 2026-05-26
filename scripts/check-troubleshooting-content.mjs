import { findContentSafetyFailures } from "./lib/content-safety-patterns.mjs";
import { readText } from "./lib/repo.mjs";

const FILES = [
  "docs/developer/contributing/troubleshooting.md",
  "docs/developer/contributing/pr-recipes.md",
];

const failures = [];

for (const file of FILES) {
  failures.push(...findContentSafetyFailures(file, readText(file)));
}

if (failures.length > 0) {
  console.error("[troubleshooting-content] failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("[troubleshooting-content] passed");
