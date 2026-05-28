import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import https from "node:https";
import os from "node:os";
import path from "node:path";

const args = parseArgs(process.argv.slice(2));
const manifestPath = args.manifest;
if (!manifestPath) {
  console.error("[gitleaks-installer] --manifest is required.");
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const platform = platformKey();
const tool = manifest.tools?.gitleaks;
const record = tool?.platforms?.[platform];
if (!record) {
  console.error(`[gitleaks-installer] no pinned gitleaks binary for ${platform}.`);
  process.exit(1);
}

const toolRoot = path.resolve("tmp", "release-tools", "gitleaks", tool.version);
fs.mkdirSync(toolRoot, { recursive: true });
const archivePath = path.join(toolRoot, path.basename(new URL(record.url).pathname));
await download(record.url, archivePath);
const digest = sha256File(archivePath);
if (digest !== record.sha256) {
  console.error(
    `[gitleaks-installer] sha256 mismatch for ${archivePath}: ${digest} != ${record.sha256}`,
  );
  process.exit(1);
}

if (record.archive !== "tar.gz") {
  console.error(`[gitleaks-installer] unsupported archive type: ${record.archive}`);
  process.exit(1);
}

const extract = spawnSync("tar", ["-xzf", archivePath, "-C", toolRoot, record.binary], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});
if (extract.status !== 0) {
  console.error(extract.stderr || extract.stdout || "tar extraction failed");
  process.exit(1);
}

const binaryPath = path.join(toolRoot, record.binary);
fs.chmodSync(binaryPath, 0o755);
if (process.env.GITHUB_PATH) {
  fs.appendFileSync(process.env.GITHUB_PATH, `${toolRoot}\n`);
}
console.log(`[gitleaks-installer] installed gitleaks ${tool.version} at ${binaryPath}`);

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    parsed[arg.slice(2)] = argv[index + 1];
    index += 1;
  }
  return parsed;
}

function platformKey() {
  const platform = os.platform();
  const arch = os.arch();
  if (platform === "linux" && arch === "x64") return "linux-x64";
  return `${platform}-${arch}`;
}

function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function download(url, destination) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      if (
        response.statusCode >= 300 &&
        response.statusCode < 400 &&
        response.headers.location
      ) {
        response.resume();
        download(response.headers.location, destination).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`Download failed with HTTP ${response.statusCode}.`));
        response.resume();
        return;
      }
      const file = fs.createWriteStream(destination);
      response.pipe(file);
      file.on("finish", () => file.close(resolve));
      file.on("error", reject);
    });
    request.on("error", reject);
  });
}
