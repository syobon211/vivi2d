export const CONTENT_SAFETY_PATTERNS = [
  {
    id: "windows-user-path",
    pattern: /\b[A-Za-z]:\\Users\\(?!Public\b)[^\s`"']+/,
  },
  {
    id: "posix-user-path",
    pattern: /\/(?:Users|home)\/(?!runner\b|sandbox\b)[^\s`"']+/,
  },
  {
    id: "stack-trace-frame",
    pattern: /^\s*at\s+.+\(.+:\d+:\d+\)/m,
  },
  {
    id: "secret-like-assignment",
    pattern:
      /\b(?:api[_-]?key|access[_-]?token|password|secret)\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]{8,}/i,
  },
  {
    id: "private-marker-term",
    pattern: new RegExp(
      `\\b(?:${"Local" + "MotionDraft"}|${"Local" + "PreviewSolver"}|previewDeformedVertices)\\b`,
    ),
  },
  {
    id: "scanner-threshold-detail",
    pattern: /\b(?:threshold|scanner)\b.{0,40}\b(?:0\.\d+|\d+px|\d+%)\b/i,
  },
  {
    id: "gate-disable-language",
    pattern:
      /\b(?:bypass|--no-verify|disable the gate|delete the gate|turn off the scanner|skip the gate)\b/i,
  },
];

export function findContentSafetyFailures(relativePath, text) {
  const failures = [];
  for (const { id, pattern } of CONTENT_SAFETY_PATTERNS) {
    if (pattern.test(text)) {
      failures.push(
        `${relativePath}: contains forbidden public guidance content (${id}).`,
      );
    }
  }
  return failures;
}
