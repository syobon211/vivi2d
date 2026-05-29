import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

const SOURCE_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".html",
  ".js",
  ".jsx",
  ".mjs",
  ".ts",
  ".tsx",
]);

const SKIP_PATH =
  /(^|[\\/])(?:\.git|dist|node_modules|e2e|__tests__|test|__pycache__|\.tmp-tests)([\\/]|$)/;
const LOCKED_MEDIAPIPE_VENDOR_PATH =
  /(^|[\\/])packages[\\/]viewer[\\/]public[\\/]vendor[\\/]mediapipe[\\/]/;
const TEST_FILE_PATTERN = /\.(?:test|spec)\.(?:[cm]?js|[cm]?ts|jsx|tsx)$/;

const DIRECT_IPC_MAIN_ALLOWLIST = new Set([
  "electron/security.cjs",
  "packages/viewer/electron/security.cjs",
]);

const IPC_RENDERER_ALLOWLIST = new Set([
  "electron/preload.cjs",
  "packages/viewer/electron/preload.cjs",
]);

const CONTEXT_BRIDGE_ALLOWLIST = new Set([
  "electron/preload.cjs",
  "packages/viewer/electron/preload.cjs",
]);

const LOCALHOST_CSP_ALLOWLIST = new Set([
  "examples/viewer-api-browser-client/index.html",
  "scripts/check-viewer-api-samples.mjs",
]);

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

function listSourceFiles() {
  return (
    runGit(["ls-files"])
      .split(/\r?\n/)
      .filter(Boolean)
      .filter((relativePath) => relativePath !== "scripts/check-security-patterns.mjs")
      .filter((relativePath) => SOURCE_EXTENSIONS.has(path.extname(relativePath)))
      .filter((relativePath) => !TEST_FILE_PATTERN.test(relativePath))
      // Locked third-party MediaPipe files are verified by check:viewer-mediapipe-assets.
      .filter((relativePath) => !LOCKED_MEDIAPIPE_VENDOR_PATH.test(relativePath))
      .filter((relativePath) => !SKIP_PATH.test(relativePath))
  );
}

function addFailure(relativePath, lineNumber, message, line) {
  failures.push(`${relativePath}:${lineNumber}: ${message}: ${line.trim()}`);
}

function scanFile(relativePath) {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) return;
  const lines = fs.readFileSync(fullPath, "utf8").split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lineNumber = index + 1;

    if (line.includes("dangerouslySetInnerHTML")) {
      addFailure(relativePath, lineNumber, "dangerouslySetInnerHTML is banned", line);
    }
    if (/startsWith\(["']file:\/\//.test(line)) {
      addFailure(
        relativePath,
        lineNumber,
        "file:// navigation trust must compare against an exact app entry URL",
        line,
      );
    }
    if (/res\.body\.toString\(/.test(line)) {
      addFailure(
        relativePath,
        lineNumber,
        "provider response bodies must not be echoed into user-visible errors",
        line,
      );
    }
    if (/connect-src.*(?:localhost:\*|127\.0\.0\.1:\*)/i.test(line)) {
      const nearby = lines.slice(Math.max(0, index - 8), index + 1).join("\n");
      if (
        !LOCALHOST_CSP_ALLOWLIST.has(relativePath) &&
        !/if\s*\(\s*isDev\s*\)/.test(nearby)
      ) {
        addFailure(
          relativePath,
          lineNumber,
          "production CSP must not allow broad localhost connections",
          line,
        );
      }
    }
    if (/Buffer\.concat\(chunks\)/.test(line)) {
      const nearby = lines.slice(Math.max(0, index - 30), index + 1).join("\n");
      if (!/maxBytes/.test(nearby) || !/total\s*>\s*maxBytes/.test(nearby)) {
        addFailure(
          relativePath,
          lineNumber,
          "chunk buffering must enforce a streaming maxBytes ceiling",
          line,
        );
      }
    }
    if (/if\s*\(\s*!validator\s*\)/.test(line)) {
      const nearby = lines.slice(index, index + 5).join("\n");
      if (!/throw\s+new\s+Error/.test(nearby)) {
        addFailure(
          relativePath,
          lineNumber,
          "unknown IPC channels must fail closed",
          line,
        );
      }
    }
    if (/\binnerHTML\b/.test(line)) {
      addFailure(relativePath, lineNumber, "innerHTML is banned outside tests", line);
    }
    if (/\beval\s*\(/.test(line)) {
      addFailure(relativePath, lineNumber, "eval() is banned", line);
    }
    if (/\bnew\s+Function\b/.test(line)) {
      addFailure(relativePath, lineNumber, "new Function is banned", line);
    }
    if (
      line.includes("ipcMain.handle(") &&
      !DIRECT_IPC_MAIN_ALLOWLIST.has(relativePath)
    ) {
      addFailure(
        relativePath,
        lineNumber,
        "use wrapHandler instead of ipcMain.handle",
        line,
      );
    }
    if (
      line.includes("ipcRenderer.invoke(") &&
      !IPC_RENDERER_ALLOWLIST.has(relativePath)
    ) {
      addFailure(
        relativePath,
        lineNumber,
        "ipcRenderer.invoke is only allowed in preload",
        line,
      );
    }
    if (
      line.includes("contextBridge.exposeInMainWorld(") &&
      !CONTEXT_BRIDGE_ALLOWLIST.has(relativePath)
    ) {
      addFailure(
        relativePath,
        lineNumber,
        "contextBridge exposure is only allowed in preload",
        line,
      );
    }
    if (line.includes("shell.openExternal(")) {
      const nearby = lines.slice(Math.max(0, index - 2), index + 1).join("\n");
      if (!nearby.includes("isSafeExternalUrl(")) {
        addFailure(relativePath, lineNumber, "shell.openExternal must be gated", line);
      }
    }
  }
}

for (const relativePath of listSourceFiles()) {
  scanFile(relativePath);
}

if (failures.length > 0) {
  console.error("[security-patterns] failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("[security-patterns] passed");
