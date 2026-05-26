import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const separator = process.argv.indexOf("--");
if (separator < 0) {
  console.error(
    "[release-step] usage: node scripts/run-release-step.mjs --name <name> -- <command> [args...]",
  );
  process.exit(1);
}

const metadataArgs = process.argv.slice(2, separator);
const commandArgs = process.argv.slice(separator + 1);
const name = valueAfter(metadataArgs, "--name");
if (!name || !/^[a-z0-9][a-z0-9-]*$/i.test(name)) {
  console.error("[release-step] --name must be a stable slug.");
  process.exit(1);
}
if (commandArgs.length === 0) {
  console.error("[release-step] command is required.");
  process.exit(1);
}

fs.mkdirSync("transcripts", { recursive: true });
const startedAt = new Date().toISOString();
const command = commandForPlatform(commandArgs[0], commandArgs.slice(1));
const result = spawnSync(command.bin, command.args, {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});
const finishedAt = new Date().toISOString();
const transcript = [
  `name: ${name}`,
  `command: ${commandArgs.join(" ")}`,
  `startedAt: ${startedAt}`,
  `finishedAt: ${finishedAt}`,
  `status: ${result.status ?? 1}`,
  "",
  "stdout:",
  redact(result.stdout ?? ""),
  "",
  "stderr:",
  redact(result.stderr ?? result.error?.message ?? ""),
  "",
].join("\n");
fs.writeFileSync(path.join("transcripts", `${name}.log`), transcript);
process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

function valueAfter(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
}

function redact(text) {
  return text
    .replace(
      /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g,
      "<github-token-redacted>",
    )
    .replace(/\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g, "<openai-key-redacted>")
    .replace(/\b(?:NPM_TOKEN|NODE_AUTH_TOKEN)=\S+/g, "$1=<redacted>")
    .replace(/[A-Za-z]:[\\/]+Users[\\/]+[^\\/]+[\\/]/g, "<user-path-redacted>/");
}

function commandForPlatform(command, args) {
  if (process.platform !== "win32" || (command !== "npm" && command !== "npx")) {
    return { args, bin: command };
  }
  const psScript = findOnPath(`${command}.ps1`);
  if (psScript) {
    return {
      args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", psScript, ...args],
      bin: "powershell.exe",
    };
  }
  const cmdScript = findOnPath(`${command}.cmd`);
  return { args, bin: cmdScript ?? command };
}

function findOnPath(filename) {
  for (const directory of (process.env.PATH ?? "").split(path.delimiter)) {
    if (!directory) continue;
    const candidate = path.join(directory, filename);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}
