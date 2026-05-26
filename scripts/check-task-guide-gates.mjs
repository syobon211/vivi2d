import { spawnSync } from "node:child_process";
import { findContentSafetyFailures } from "./lib/content-safety-patterns.mjs";
import { gitLsFilesIncludingUntracked, readJson, readText } from "./lib/repo.mjs";

const GUIDE_DIR = "docs/developer/contributing/task-guides";
const failures = [];
const packageJson = readJson("package.json");
const packageScripts = packageJson.scripts ?? {};

const SECURITY_OR_PUBLIC_TERMS =
  /\b(?:security|IP|public-surface|release-surface|credential|token|scope|Origin|provider|runtime|package|sample)\b/i;
const REQUIRED_BOUNDARY_GATES = new Set([
  "check:auto-setup-ip-compliance",
  "check:docs-public-surface",
  "check:release-surface",
  "check:security-patterns",
  "check:samples-public-surface",
  "check:pack-contents",
  "check:ip-product-profile",
]);

const AUTO_SETUP_REQUIRED_WRAPPED_GATES = [
  "check:" + "local-" + "motion-marker-catalogs",
  "check:" + "local-" + "motion-private-markers",
  "check:clean-room-coverage",
  "check:ip-product-profile",
  "check:docs-public-surface",
];

for (const guide of gitLsFilesIncludingUntracked().filter(
  (file) =>
    file.startsWith(`${GUIDE_DIR}/`) &&
    file.endsWith(".md") &&
    !file.endsWith("/index.md"),
)) {
  const text = readText(guide);
  failures.push(...findContentSafetyFailures(guide, text));
  const gatesSection = extractSection(text, "Tests And Gates");
  if (!gatesSection) {
    failures.push(`${guide}: missing "Tests And Gates" section.`);
    continue;
  }
  const npmScripts = extractNpmScripts(gatesSection);
  if (npmScripts.length === 0) {
    failures.push(`${guide}: "Tests And Gates" must include npm commands.`);
  }
  for (const script of npmScripts) {
    if (!packageScripts[script]) {
      failures.push(`${guide}: unknown npm script in Tests And Gates: ${script}`);
    }
  }
  const boundaryText = extractSection(text, "Ownership And Boundaries");
  if (!boundaryText) {
    failures.push(`${guide}: missing "Ownership And Boundaries" section.`);
  }
  if (SECURITY_OR_PUBLIC_TERMS.test(boundaryText)) {
    const hasBoundaryGate = npmScripts.some((script) =>
      REQUIRED_BOUNDARY_GATES.has(script),
    );
    if (!hasBoundaryGate) {
      failures.push(
        `${guide}: security/IP/public-surface boundary needs a matching required gate.`,
      );
    }
  }
}

validateAutoSetupGateChain();

if (failures.length > 0) {
  console.error("[task-guide-gates] failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("[task-guide-gates] passed");

function extractSection(text, heading) {
  const match = new RegExp(`^## ${escapeRegExp(heading)}\\s*$`, "m").exec(text);
  if (!match) return "";
  const start = match.index + match[0].length;
  const next = /^##\s+/m.exec(text.slice(start));
  return next ? text.slice(start, start + next.index) : text.slice(start);
}

function extractNpmScripts(section) {
  const scripts = [];
  for (const match of section.matchAll(/\bnpm\s+run\s+([A-Za-z0-9:_-]+)/g)) {
    scripts.push(match[1]);
  }
  return [...new Set(scripts)];
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function validateAutoSetupGateChain() {
  const result = spawnSync(
    "node",
    ["scripts/check-auto-setup-ip-compliance.mjs", "--list"],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (result.status !== 0) {
    failures.push(
      `check:auto-setup-ip-compliance --list failed: ${
        result.stderr || result.stdout || "unknown error"
      }`,
    );
    return;
  }
  const raw = result.stdout.trim();
  if (!/^\{\s*"scripts"\s*:\s*\[[\s\S]*\]\s*\}$/.test(raw)) {
    failures.push("check:auto-setup-ip-compliance --list must output only JSON.");
    return;
  }
  let scripts = [];
  try {
    scripts = JSON.parse(raw).scripts;
  } catch (error) {
    failures.push(
      `check:auto-setup-ip-compliance --list returned invalid JSON: ${error.message}`,
    );
    return;
  }
  if (!Array.isArray(scripts) || scripts.some((script) => typeof script !== "string")) {
    failures.push("check:auto-setup-ip-compliance --list must return a scripts array.");
    return;
  }
  if (scripts.length < AUTO_SETUP_REQUIRED_WRAPPED_GATES.length) {
    failures.push("check:auto-setup-ip-compliance --list returned too few gates.");
    return;
  }
  for (const script of AUTO_SETUP_REQUIRED_WRAPPED_GATES) {
    if (!scripts.includes(script)) {
      failures.push(
        `check:auto-setup-ip-compliance does not wrap required gate: ${script}`,
      );
    }
  }
}
