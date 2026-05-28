import fs from "node:fs";
import path from "node:path";
import { gitLsFilesIncludingUntracked, readText } from "./lib/repo.mjs";

const failures = [];
const TEXT_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);

const ALLOWED_LOOPBACK_URL =
  /https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/[A-Za-z0-9._~/?#=&:-]*)?/g;
const ALLOWED_SAMPLE_TOKEN = "sample-session-token";
const ALLOWED_PUBLIC_WINDOWS_PATH = "C:/Users/Public";

const FORBIDDEN_PATTERNS = [
  {
    id: "bearer-secret",
    pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/i,
  },
  {
    id: "secret-assignment",
    pattern:
      /\b(?:api[_-]?key|access[_-]?token|password|secret)\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]{12,}/i,
  },
  {
    id: "credential-url",
    pattern: /https?:\/\/[^/\s:@]+:[^/\s:@]+@/i,
  },
  {
    id: "private-windows-path",
    pattern: /\b[A-Za-z]:\/Users\/(?!Public\b)[^\s`"']+/,
  },
  {
    id: "private-posix-path",
    pattern: /\/(?:Users|home)\/(?!runner\b|sandbox\b)[^\s`"']+/,
  },
  {
    id: "private-model-marker",
    pattern: new RegExp(
      `\\b(?:${"Local" + "MotionDraft"}|${"Local" + "PreviewSolver"}|previewDeformedVertices)\\b`,
    ),
  },
];

for (const file of gitLsFilesIncludingUntracked(["examples"])) {
  const normalized = file.replaceAll("\\", "/");
  if (!normalized.startsWith("examples/")) continue;
  if (!TEXT_EXTENSIONS.has(path.extname(normalized))) continue;
  if (!fs.existsSync(normalized)) continue;

  const text = sanitizeAllowedExamples(readText(normalized));
  for (const { id, pattern } of FORBIDDEN_PATTERNS) {
    if (pattern.test(text)) {
      failures.push(
        `${normalized}: contains unsafe sample public-surface content (${id}).`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error("[samples-public-surface] failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("[samples-public-surface] passed");

function sanitizeAllowedExamples(text) {
  return text
    .replaceAll(ALLOWED_SAMPLE_TOKEN, "x")
    .replaceAll(ALLOWED_PUBLIC_WINDOWS_PATH, "PUBLIC_WINDOWS_PATH")
    .replace(ALLOWED_LOOPBACK_URL, "LOOPBACK_URL");
}
