import { spawn, spawnSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const failures = [];
const warnings = [];

const MAX_BLOB_BYTES = 2 * 1024 * 1024;
const TEXT_EXTENSIONS = new Set([
  ".c",
  ".cjs",
  ".css",
  ".csv",
  ".env",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".py",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
]);

const SKIP_PATH =
  /(^|[\\/])(?:\.git|coverage|dist|node_modules|playwright-report|test-results|docs[\\/]backlog|packages[\\/]web[\\/]dist)([\\/]|$)/;

const HIGH_CONFIDENCE_PATTERNS = [
  {
    name: "AWS access key id",
    pattern: /\b(?:A3T[A-Z0-9]|AKIA|ASIA)[A-Z0-9]{16}\b/g,
  },
  {
    name: "GitHub token",
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9_]{36,255}|github_pat_[A-Za-z0-9_]{20,255})\b/g,
  },
  {
    name: "OpenAI API key",
    pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    name: "Google API key",
    pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g,
  },
  {
    name: "Slack token",
    pattern: /\bxox[baprs]-[0-9A-Za-z-]{20,}\b/g,
  },
  {
    name: "JWT",
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  },
];

const PRIVATE_KEY_PATTERN =
  /-----BEGIN (?:RSA |DSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g;

const GENERIC_ASSIGNMENT_PATTERN =
  /\b(?:api[_-]?key|access[_-]?key|auth[_-]?token|client[_-]?secret|password|passwd|secret|token)\b\s*[:=]\s*["'`]([^"'`]{16,})["'`]/gi;

const PLACEHOLDER_PATTERN =
  /(?:example|dummy|fake|fixture|mock|placeholder|redacted|sample|test|todo|xxx|your[_-]?)/i;

function runGit(args, options = {}) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: options.encoding ?? "utf8",
    maxBuffer: options.maxBuffer ?? 32 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(result.stderr?.toString() || `git ${args.join(" ")} failed`);
  }
  return result.stdout;
}

function parseHistoricalObjects() {
  const byObject = new Map();
  const output = runGit(["rev-list", "--objects", "--all"]);
  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const match = /^([0-9a-f]{40,64})(?: (.*))?$/.exec(line);
    if (!match) continue;
    const objectId = match[1];
    const relativePath = match[2] ?? "";
    if (!relativePath) continue;
    if (!byObject.has(objectId)) byObject.set(objectId, []);
    byObject.get(objectId).push(relativePath);
  }
  return byObject;
}

function getBlobMetadata(objectIds) {
  if (objectIds.length === 0) return new Map();
  const input = `${objectIds.join("\n")}\n`;
  const result = spawnSync(
    "git",
    ["cat-file", "--batch-check=%(objectname) %(objecttype) %(objectsize)"],
    {
      cwd: root,
      encoding: "utf8",
      input,
      maxBuffer: 32 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || "git cat-file --batch-check failed");
  }

  const metadata = new Map();
  for (const line of result.stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [objectId, objectType, objectSize] = line.split(" ");
    metadata.set(objectId, {
      type: objectType,
      size: Number(objectSize),
    });
  }
  return metadata;
}

function isCandidatePath(relativePath) {
  if (SKIP_PATH.test(relativePath)) return false;
  return TEXT_EXTENSIONS.has(path.extname(relativePath).toLowerCase());
}

function isBinary(buffer) {
  return buffer.includes(0);
}

function shannonEntropy(value) {
  const counts = new Map();
  for (const character of value) {
    counts.set(character, (counts.get(character) ?? 0) + 1);
  }
  let entropy = 0;
  for (const count of counts.values()) {
    const probability = count / value.length;
    entropy -= probability * Math.log2(probability);
  }
  return entropy;
}

function lineNumberForOffset(text, offset) {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (text.charCodeAt(index) === 10) line += 1;
  }
  return line;
}

function addFailure(objectId, relativePath, lineNumber, kind, match) {
  const redacted = `${match.slice(0, 6)}...${match.slice(-4)}`;
  failures.push(
    `${relativePath}:${lineNumber}: ${kind}: ${redacted} (${objectId.slice(0, 12)})`,
  );
}

function scanText(objectId, relativePath, text) {
  for (const { name, pattern } of HIGH_CONFIDENCE_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      addFailure(
        objectId,
        relativePath,
        lineNumberForOffset(text, match.index ?? 0),
        name,
        match[0],
      );
    }
  }

  for (const match of text.matchAll(PRIVATE_KEY_PATTERN)) {
    addFailure(
      objectId,
      relativePath,
      lineNumberForOffset(text, match.index ?? 0),
      "private key block",
      match[0],
    );
  }

  for (const match of text.matchAll(GENERIC_ASSIGNMENT_PATTERN)) {
    const value = match[1].trim();
    if (PLACEHOLDER_PATTERN.test(value)) continue;
    if (value.length < 20) continue;
    if (shannonEntropy(value) < 3.5) continue;
    addFailure(
      objectId,
      relativePath,
      lineNumberForOffset(text, match.index ?? 0),
      "secret-like assignment",
      value,
    );
  }
}

function candidateEntries(objects, metadata) {
  const entries = [];
  for (const [objectId, paths] of objects) {
    const candidatePath = paths.find(isCandidatePath);
    if (!candidatePath) continue;

    const info = metadata.get(objectId);
    if (!info || info.type !== "blob") continue;
    if (!Number.isFinite(info.size) || info.size > MAX_BLOB_BYTES) {
      warnings.push(
        `${candidatePath}: skipped ${objectId.slice(0, 12)} (${info.size} bytes)`,
      );
      continue;
    }

    entries.push({
      objectId,
      path: candidatePath,
      size: info.size,
    });
  }
  return entries;
}

function scanHistoricalBlobs(entries) {
  if (entries.length === 0) return Promise.resolve();

  const entryByObjectId = new Map(entries.map((entry) => [entry.objectId, entry]));
  const child = spawn("git", ["cat-file", "--batch"], {
    cwd: root,
    stdio: ["pipe", "pipe", "pipe"],
  });

  let pending = Buffer.alloc(0);
  let current = null;
  let stderr = "";

  const readAvailableObjects = () => {
    while (true) {
      if (current === null) {
        const headerEnd = pending.indexOf(10);
        if (headerEnd === -1) return;

        const header = pending.subarray(0, headerEnd).toString("utf8");
        pending = pending.subarray(headerEnd + 1);

        const [objectId, objectType, objectSize] = header.split(" ");
        if (objectType === "missing") {
          warnings.push(`${objectId}: object disappeared while scanning`);
          continue;
        }

        current = {
          objectId,
          type: objectType,
          size: Number(objectSize),
          path: entryByObjectId.get(objectId)?.path ?? objectId,
        };
      }

      const bytesNeeded = current.size + 1;
      if (pending.length < bytesNeeded) return;

      const body = pending.subarray(0, current.size);
      pending = pending.subarray(bytesNeeded);

      if (current.type === "blob" && !isBinary(body)) {
        scanText(current.objectId, current.path, body.toString("utf8"));
      }
      current = null;
    }
  };

  return new Promise((resolve, reject) => {
    child.stdout.on("data", (chunk) => {
      pending = Buffer.concat([pending, chunk]);
      readAvailableObjects();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      readAvailableObjects();
      if (code !== 0) {
        reject(new Error(stderr || "git cat-file --batch failed"));
        return;
      }
      if (current !== null) {
        reject(new Error("git cat-file --batch ended mid-object"));
        return;
      }
      resolve();
    });

    child.stdin.end(`${entries.map((entry) => entry.objectId).join("\n")}\n`);
  });
}

const objects = parseHistoricalObjects();
const metadata = getBlobMetadata([...objects.keys()]);
await scanHistoricalBlobs(candidateEntries(objects, metadata));

for (const warning of warnings) {
  console.warn(`[history-secrets] warning: ${warning}`);
}

if (failures.length > 0) {
  console.error("[history-secrets] possible historical secrets found:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  console.error(
    "\nIf a finding is real, rotate it before publishing and rewrite history if needed.",
  );
  console.error(
    "This check is a repository-local baseline; still run gitleaks or trufflehog before public release.",
  );
  process.exit(1);
}

console.log("[history-secrets] passed");
