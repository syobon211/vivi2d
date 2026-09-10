import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { exists, readText, repoRoot } from "./lib/repo.mjs";

const root = repoRoot;
const failures = [];
const manifest = readRequiredJson("scripts/quality-gate-manifest.json");
const packageJson = readRequiredJson("package.json");
const localCommands = readLocalCommands();

const packageScripts = packageJson.scripts ?? {};
const workflowCache = new Map();

for (const gate of manifest.gates ?? []) {
  validateGate(gate);
}
validateLocalCoverage();

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
    if (!localCommands.has(gate.command)) {
      failures.push(`${gate.command}: missing from scripts/run-quality-gates.mjs`);
    }
  } else if (typeof gate.npmScript === "string") {
    if (!packageScripts[gate.npmScript]) {
      failures.push(`${gate.npmScript}: missing from package.json scripts`);
    }
    if (!localCommands.has(`npm run ${gate.npmScript}`)) {
      failures.push(`${gate.npmScript}: missing from scripts/run-quality-gates.mjs`);
    }
  } else {
    failures.push(`${gate.command}: npmScript must be a string or null.`);
  }

  const primaryWorkflow = ".github/workflows/quality-gates.yml";
  const requiredWorkflows = gate.requiredWorkflows ?? [];
  const coveredByPrimaryWorkflow = requiredWorkflows.includes(primaryWorkflow);
  if (
    gate.intentionallySplit === true &&
    requiredWorkflows.length === 0 &&
    (typeof gate.splitReason !== "string" || gate.splitReason.trim().length === 0)
  ) {
    failures.push(`${gate.command}: a split without CI coverage requires splitReason.`);
  }
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
    const commandPattern = gate.command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!new RegExp(`(^|\\s)${commandPattern}(\\s|$)`, "m").test(workflow)) {
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

function readLocalCommands() {
  const commands = new Set();
  // Include default, coverage and every opt-in E2E variant. Inventory mode
  // evaluates the runner's actual command list without executing any gates.
  for (const flags of [
    [],
    ["--coverage", "--e2e-smoke", "--e2e-workflows"],
    ["--e2e-workflow-record"],
  ]) {
    const result = spawnSync(
      process.execPath,
      [path.join(root, "scripts/run-quality-gates.mjs"), "--list", ...flags],
      { cwd: root, encoding: "utf8", env: { ...process.env, CI: "false" } },
    );
    if (result.status !== 0) {
      failures.push("Unable to enumerate local quality gates.");
      continue;
    }
    try {
      for (const [command, args] of JSON.parse(result.stdout)) {
        commands.add(
          command === "npm" && args[0] === "run"
            ? `npm run ${args[1]}`
            : [command, ...args].join(" "),
        );
      }
    } catch {
      failures.push("Local quality-gate inventory is invalid.");
    }
  }
  return commands;
}

function validateLocalCoverage() {
  const declared = new Set();
  for (const gate of manifest.gates ?? []) {
    const command =
      typeof gate.npmScript === "string" ? `npm run ${gate.npmScript}` : gate.command;
    if (declared.has(command)) failures.push(`${command}: duplicate manifest gate.`);
    declared.add(command);
  }
  for (const command of localCommands) {
    if (!declared.has(command)) {
      failures.push(`${command}: local gate is missing from quality-gate-manifest.json`);
    }
  }
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
