import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

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
  /(^|[\\/])(?:\.git|coverage|dist|node_modules|playwright-report|test-results|docs[\\/]backlog)([\\/]|$)/;

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

function runGit(args) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || `git ${args.join(" ")} failed`);
  }
  return result.stdout;
}

function listCandidateFiles() {
  return runGit(["ls-files", "--cached", "--others", "--exclude-standard"])
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((relativePath) => !SKIP_PATH.test(relativePath))
    .filter((relativePath) => {
      const extension = path.extname(relativePath).toLowerCase();
      return TEXT_EXTENSIONS.has(extension);
    });
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

function addFailure(relativePath, lineNumber, kind, match) {
  const redacted = `${match.slice(0, 6)}...${match.slice(-4)}`;
  failures.push(`${relativePath}:${lineNumber}: ${kind}: ${redacted}`);
}

function lineNumberForOffset(text, offset) {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (text.charCodeAt(index) === 10) line += 1;
  }
  return line;
}

function scanFile(relativePath) {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) return;

  const text = fs.readFileSync(fullPath, "utf8");

  for (const { name, pattern } of HIGH_CONFIDENCE_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      addFailure(
        relativePath,
        lineNumberForOffset(text, match.index ?? 0),
        name,
        match[0],
      );
    }
  }

  for (const match of text.matchAll(PRIVATE_KEY_PATTERN)) {
    addFailure(
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
      relativePath,
      lineNumberForOffset(text, match.index ?? 0),
      "secret-like assignment",
      value,
    );
  }
}

for (const relativePath of listCandidateFiles()) {
  scanFile(relativePath);
}

if (failures.length > 0) {
  console.error("[secrets] possible committed secrets found:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  console.error(
    "\nIf a finding is a real secret, rotate it before publishing and rewrite history if needed.",
  );
  console.error(
    "If a finding is an intentional fake fixture, replace it with an obvious placeholder.",
  );
  process.exit(1);
}

console.log("[secrets] passed");
