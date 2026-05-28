import { findContentSafetyFailures } from "./lib/content-safety-patterns.mjs";
import { exists, readJson, readText } from "./lib/repo.mjs";

const TEMPLATE = ".github/ISSUE_TEMPLATE/gate_failure.yml";
const failures = [];
const extraPublicOptions = new Set(["check:quality", "Other documented gate"]);

if (!exists(TEMPLATE)) {
  failures.push(`${TEMPLATE} is missing.`);
} else {
  const text = readText(TEMPLATE);
  for (const needle of [
    'labels: ["gate-false-positive", "needs-triage"]',
    "id: gate-name",
    "type: dropdown",
    "id: reproduction-command",
    'placeholder: "npm run check:quality -- --help"',
    "id: error-code",
  ]) {
    if (!text.includes(needle)) {
      failures.push(`${TEMPLATE}: missing required template content: ${needle}`);
    }
  }
  for (const forbidden of ["id: logs", "id: raw-output", "id: stack-trace"]) {
    if (text.includes(forbidden)) {
      failures.push(`${TEMPLATE}: must not request raw output field ${forbidden}.`);
    }
  }
  failures.push(...findContentSafetyFailures(TEMPLATE, text));
  validateGateOptions(text);
  validateProseGateReferences(text);
}

if (failures.length > 0) {
  console.error("[escalation-template] failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("[escalation-template] passed");

function validateGateOptions(text) {
  const options = extractGateNameOptions(text);
  const expected = expectedPublicGateOptions();

  for (const option of expected) {
    if (!options.includes(option)) {
      failures.push(`${TEMPLATE}: gate-name dropdown is missing ${option}.`);
    }
  }
  for (const option of options) {
    if (!expected.includes(option)) {
      failures.push(`${TEMPLATE}: gate-name dropdown has unknown option ${option}.`);
    }
  }
  if (new Set(options).size !== options.length) {
    failures.push(`${TEMPLATE}: gate-name dropdown contains duplicate options.`);
  }
}

function expectedPublicGateOptions() {
  const manifest = readJson("scripts/quality-gate-manifest.json");
  const options = [];
  for (const gate of manifest.gates ?? []) {
    if (gate.escalatable !== true) continue;
    const option = gate.npmScript ?? gate.command;
    if (typeof option !== "string") continue;
    options.push(option);
  }
  options.push(...extraPublicOptions);
  return [...new Set(options)].sort((a, b) => a.localeCompare(b));
}

function validGateReferences() {
  const manifest = readJson("scripts/quality-gate-manifest.json");
  const options = [];
  for (const gate of manifest.gates ?? []) {
    const option = gate.npmScript ?? gate.command;
    if (typeof option === "string") options.push(option);
  }
  options.push(...extraPublicOptions);
  return new Set(options);
}

function validateProseGateReferences(text) {
  const valid = validGateReferences();
  for (const match of text.matchAll(
    /\b[A-Za-z0-9][A-Za-z0-9_-]*(?::[A-Za-z0-9][A-Za-z0-9_-]*)+\b/g,
  )) {
    const reference = match[0];
    if (!valid.has(reference)) {
      failures.push(`${TEMPLATE}: prose references unknown gate ${reference}.`);
    }
  }
}

function extractGateNameOptions(text) {
  const lines = text.split(/\r?\n/);
  const gateNameLine = lines.findIndex((line) => /^\s*id:\s*gate-name\s*$/.test(line));
  if (gateNameLine < 0) return [];
  const optionsLine = lines.findIndex(
    (line, index) => index > gateNameLine && /^\s*options:\s*$/.test(line),
  );
  if (optionsLine < 0) return [];
  const options = [];
  for (let index = optionsLine + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s{4,}-\s+/.test(line)) {
      options.push(line.replace(/^\s*-\s+/, "").trim());
      continue;
    }
    if (/^\s{4,}[A-Za-z_][A-Za-z0-9_-]*:\s*/.test(line)) break;
    if (/^\s{2}-\s+type:\s+/.test(line)) break;
  }
  return options;
}
