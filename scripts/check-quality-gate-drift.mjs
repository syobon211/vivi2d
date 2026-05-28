import fs from "node:fs";
import path from "node:path";
import { exists, readText, repoRoot } from "./lib/repo.mjs";

const root = repoRoot;
const failures = [];
const manifest = readRequiredJson("scripts/quality-gate-manifest.json");
const packageJson = readRequiredJson("package.json");
const runQualityGates = readRequiredText("scripts/run-quality-gates.mjs");

const packageScripts = packageJson.scripts ?? {};
const workflowCache = new Map();

for (const gate of manifest.gates ?? []) {
  validateGate(gate);
}

validateLintCoverage(manifest.lintCoverage);
validateExcludedWorkflows(manifest.excludedWorkflows ?? []);

if (failures.length > 0) {
  console.error("[quality-gate-drift] failed");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("[quality-gate-drift] passed");

function validateGate(gate) {
  if (!gate || typeof gate.command !== "string") {
    failures.push("Every manifest gate must define a command string.");
    return;
  }
  if (typeof gate.escalatable !== "boolean") {
    failures.push(`${gate.command}: manifest gate must define escalatable.`);
  }

  if (gate.npmScript === null) {
    if (!commandAppearsInRunQualityGates(gate.command)) {
      failures.push(`${gate.command}: missing from scripts/run-quality-gates.mjs`);
    }
  } else if (typeof gate.npmScript === "string") {
    if (!packageScripts[gate.npmScript]) {
      failures.push(`${gate.npmScript}: missing from package.json scripts`);
    }
    if (!runQualityGates.includes(`"${gate.npmScript}"`)) {
      failures.push(`${gate.npmScript}: missing from scripts/run-quality-gates.mjs`);
    }
  } else {
    failures.push(`${gate.command}: npmScript must be a string or null.`);
  }

  const primaryWorkflow = ".github/workflows/quality-gates.yml";
  const requiredWorkflows = gate.requiredWorkflows ?? [];
  const coveredByPrimaryWorkflow = requiredWorkflows.includes(primaryWorkflow);
  if (gate.intentionallySplit === true && coveredByPrimaryWorkflow) {
    failures.push(
      `${gate.command}: intentionallySplit gates must not require ${primaryWorkflow}`,
    );
  }
  if (gate.intentionallySplit !== true && !coveredByPrimaryWorkflow) {
    failures.push(`${gate.command}: non-split gates must require ${primaryWorkflow}`);
  }

  for (const workflowPath of requiredWorkflows) {
    const workflow = readWorkflow(workflowPath);
    if (!workflow.includes(gate.command)) {
      failures.push(`${gate.command}: missing from ${workflowPath}`);
    }
  }

  const scriptPath = scriptPathForGate(gate);
  for (const workflowPath of gate.pathTriggerWorkflows ?? []) {
    const workflow = readWorkflow(workflowPath);
    if (scriptPath && !workflow.includes(scriptPath)) {
      failures.push(`${scriptPath}: missing path trigger in ${workflowPath}`);
    }
  }
}

function validateLintCoverage(lintCoverage) {
  if (!lintCoverage) {
    failures.push("quality-gate-manifest.json is missing lintCoverage.");
    return;
  }

  for (const workflowPath of lintCoverage.workflows ?? []) {
    const workflow = readWorkflow(workflowPath);
    for (const scriptPath of lintCoverage.requiredScripts ?? []) {
      if (!workflow.includes(scriptPath)) {
        failures.push(`${scriptPath}: missing from Biome lint list in ${workflowPath}`);
      }
    }
  }
}

function validateExcludedWorkflows(excludedWorkflows) {
  const excluded = new Set(excludedWorkflows.map((entry) => entry.path));
  const referenced = new Set(excluded);
  for (const workflowPath of manifest.lintCoverage?.workflows ?? []) {
    referenced.add(workflowPath);
  }
  for (const gate of manifest.gates ?? []) {
    for (const workflowPath of gate.requiredWorkflows ?? []) {
      referenced.add(workflowPath);
    }
    for (const workflowPath of gate.pathTriggerWorkflows ?? []) {
      referenced.add(workflowPath);
    }
  }

  for (const workflow of readdir(".github/workflows")) {
    if (!workflow.endsWith(".yml")) continue;
    const workflowPath = `.github/workflows/${workflow}`;
    if (workflow === "perf-monitor.yml" && !excluded.has(workflowPath)) {
      failures.push(`${workflowPath}: must be excluded from quality-gate drift checks`);
    }
    if (!referenced.has(workflowPath)) {
      failures.push(`${workflowPath}: must be referenced or explicitly excluded`);
    }
  }
}

function commandAppearsInRunQualityGates(command) {
  if (command === "npx tsc --noEmit") {
    return (
      runQualityGates.includes('"npx"') &&
      runQualityGates.includes('"tsc"') &&
      runQualityGates.includes('"--noEmit"')
    );
  }
  return runQualityGates.includes(command);
}

function scriptPathForGate(gate) {
  if (typeof gate.npmScript !== "string") return null;
  const script = packageScripts[gate.npmScript];
  const match = /^node\s+([^\s]+\.mjs)\b/.exec(script ?? "");
  return match?.[1] ?? null;
}

function readWorkflow(workflowPath) {
  if (!workflowCache.has(workflowPath)) {
    workflowCache.set(workflowPath, readRequiredText(workflowPath));
  }
  return workflowCache.get(workflowPath);
}

function readRequiredJson(relativePath) {
  const text = readRequiredText(relativePath);
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (error) {
    failures.push(`${relativePath}: invalid JSON (${error.message})`);
    return {};
  }
}

function readRequiredText(relativePath) {
  if (!exists(relativePath)) {
    failures.push(`${relativePath}: referenced file does not exist`);
    return "";
  }
  return readText(relativePath);
}

function readdir(relativePath) {
  if (!exists(relativePath)) {
    failures.push(`${relativePath}: referenced directory does not exist`);
    return [];
  }
  return fs.readdirSync(path.join(root, relativePath));
}
