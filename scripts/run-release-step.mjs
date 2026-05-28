import { spawn } from "node:child_process";
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
const MAX_TRANSCRIPT_BUFFER_BYTES = 128 * 1024 * 1024;
const startedAt = new Date().toISOString();
const command = commandForPlatform(commandArgs[0], commandArgs.slice(1));
const stdout = createTranscriptBuffer();
const stderr = createTranscriptBuffer();
let spawnError = null;
let lastOutputAt = Date.now();
const heartbeatMs = parseHeartbeatMs(process.env.VIVI2D_RELEASE_STEP_HEARTBEAT_MS);

const result = await new Promise((resolve) => {
  const child = spawn(command.bin, command.args, {
    stdio: ["ignore", "pipe", "pipe"],
  });
  const heartbeat = setInterval(() => {
    const secondsSinceOutput = Math.round((Date.now() - lastOutputAt) / 1000);
    const message = `[release-step:${name}] still running; no child output for ${secondsSinceOutput}s.\n`;
    process.stderr.write(message);
    stderr.append(message);
  }, heartbeatMs);
  heartbeat.unref();

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    lastOutputAt = Date.now();
    process.stdout.write(chunk);
    stdout.append(chunk);
  });
  child.stderr.on("data", (chunk) => {
    lastOutputAt = Date.now();
    process.stderr.write(chunk);
    stderr.append(chunk);
  });
  child.on("error", (error) => {
    lastOutputAt = Date.now();
    spawnError = error;
    const message = `${error.message}\n`;
    process.stderr.write(message);
    stderr.append(message);
  });
  child.on("close", (status, signal) => {
    clearInterval(heartbeat);
    resolve({ signal, status });
  });
});
const finishedAt = new Date().toISOString();
const status = result.status ?? (spawnError ? 1 : null);
const signal = result.signal ?? null;
const transcript = [
  `name: ${name}`,
  `command: ${commandArgs.join(" ")}`,
  `startedAt: ${startedAt}`,
  `finishedAt: ${finishedAt}`,
  `status: ${status ?? 1}`,
  `signal: ${signal ?? ""}`,
  "",
  "stdout:",
  redact(stdout.text()),
  "",
  "stderr:",
  redact(stderr.text()),
  "",
].join("\n");
fs.writeFileSync(path.join("transcripts", `${name}.log`), transcript);

if (status !== 0) {
  process.exit(status ?? 1);
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

function parseHeartbeatMs(value) {
  if (value === undefined || value === "") return 60_000;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 5_000 || parsed > 300_000) {
    console.error("[release-step] VIVI2D_RELEASE_STEP_HEARTBEAT_MS must be 5000..300000.");
    process.exit(1);
  }
  return parsed;
}

function createTranscriptBuffer() {
  let content = "";
  let byteLength = 0;
  let truncated = false;
  return {
    append(chunk) {
      if (truncated) return;
      const chunkBytes = Buffer.byteLength(chunk);
      if (byteLength + chunkBytes <= MAX_TRANSCRIPT_BUFFER_BYTES) {
        content += chunk;
        byteLength += chunkBytes;
        return;
      }

      const remaining = Math.max(0, MAX_TRANSCRIPT_BUFFER_BYTES - byteLength);
      if (remaining > 0) {
        content += Buffer.from(chunk).subarray(0, remaining).toString("utf8");
      }
      content += "\n[release-step] transcript truncated after 128 MiB.\n";
      truncated = true;
      byteLength = MAX_TRANSCRIPT_BUFFER_BYTES;
    },
    text() {
      return content;
    },
  };
}
