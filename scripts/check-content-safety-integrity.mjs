import { readText } from "./lib/repo.mjs";

const failures = [];
const canonicalImport = './lib/content-safety-patterns.mjs"';

// PR recipe scanning is intentionally handled by check-troubleshooting-content.mjs
// so both contributor troubleshooting and recipe guidance use the same
// content-safety entry point.
for (const file of [
  "scripts/check-task-guide-gates.mjs",
  "scripts/check-troubleshooting-content.mjs",
  "scripts/check-escalation-template.mjs",
]) {
  const text = readText(file);
  if (!text.includes(canonicalImport)) {
    failures.push(`${file}: must import the canonical content-safety module.`);
  }
  if (/CONTENT_SAFETY_PATTERNS\s*=/.test(text)) {
    failures.push(`${file}: must not define local content-safety patterns.`);
  }
}

if (failures.length > 0) {
  console.error("[content-safety-integrity] failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("[content-safety-integrity] passed");
