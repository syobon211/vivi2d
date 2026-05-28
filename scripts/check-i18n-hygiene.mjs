import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { containsMojibakeMarker } from "./lib/source-hygiene.mjs";

const root = process.cwd();
const failures = [];

const LOCALE_SOURCE_PATTERN =
  /^(?:src\/lib\/i18n\/(?:en|ja|zh-Hans|ko-KR)\/.*\.ts|packages\/viewer\/src\/i18n\/.*\.ts)$/;
const LOCALE_TEST_PATTERN =
  /^(?:src\/lib\/i18n\/__tests__\/.*\.ts|packages\/viewer\/src\/__tests__\/(?:i18n|useLocaleToggle)\.test\.tsx)$/;
const METADATA_PATTERN = /^docs\/i18n\/.*\.json$/;

const PLACEHOLDER_PATTERNS = [
  { id: "todo-translate", pattern: /TODO_TRANSLATE|TRANSLATE_ME|NEEDS_TRANSLATION/i },
  { id: "missing-marker", pattern: /\bMISSING:/ },
  { id: "empty-value", pattern: /:\s*""/ },
];

const FORBIDDEN_PUBLIC_COPY_TERMS = [
  {
    id: "third-party-live2d",
    pattern: /\b(?:Live2D|Cubism|VTube Studio)\b/i,
  },
  {
    id: "compat-claim-en",
    pattern: /\b(?:compatible with|x-like|x style|live2d-like|cubism-compatible)\b/i,
  },
  {
    id: "deformation-terms-en",
    pattern: /\b(?:keyform|shape key|morph target|lattice|cage|deformers?)\b/i,
  },
  {
    id: "preview-private-terms-en",
    pattern: /\bpreview\s+(?:geometry|shape)\b/i,
  },
  {
    id: "preview-private-terms-ja",
    pattern: /(?:プレビュー形状|プレビュー用の形状)/,
  },
  {
    id: "preview-private-terms-zh-hans",
    pattern: /(?:预览形状|预览用形状)/,
  },
  {
    id: "preview-private-terms-ko",
    pattern: /(?:미리보기\s*형상|미리보기용\s*형상)/,
  },
  {
    id: "compat-claim-ja",
    pattern:
      /(?:(?:Live2D|Cubism|VTube Studio).{0,8}(?:互換|風|のような)|(?:互換|風).{0,8}(?:Live2D|Cubism|VTube Studio))/,
  },
  {
    id: "deformation-terms-ja",
    pattern: /(?:キーフォーム|シェイプキー|モーフターゲット|ラティス|ケージ|デフォーマ)/,
  },
  {
    id: "compat-claim-zh-hans",
    pattern:
      /(?:(?:Live2D|Cubism|VTube Studio).{0,8}(?:兼容|类似|风格)|(?:兼容|类似|风格).{0,8}(?:Live2D|Cubism|VTube Studio))/,
  },
  {
    id: "deformation-terms-zh-hans",
    pattern: /(?:关键帧|形状键|变形目标|晶格|笼格|变形器)/,
  },
  {
    id: "compat-claim-ko",
    pattern:
      /(?:(?:Live2D|Cubism|VTube Studio).{0,8}(?:호환|같은|스타일)|(?:호환|같은|스타일).{0,8}(?:Live2D|Cubism|VTube Studio))/,
  },
  {
    id: "deformation-terms-ko",
    pattern: /(?:키폼|셰이프 키|모프 타깃|래티스|케이지|디포머)/,
  },
];

for (const relativePath of listCandidateFiles()) {
  const absolutePath = path.join(root, relativePath);
  const text = fs.readFileSync(absolutePath, "utf8");
  scanCommonText(relativePath, text);

  if (LOCALE_SOURCE_PATTERN.test(relativePath)) {
    scanLocaleSource(relativePath, text);
  }
}

if (failures.length > 0) {
  console.error("[i18n-hygiene] failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("[i18n-hygiene] passed");

function listCandidateFiles() {
  const result = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || "git ls-files failed");
  }
  return result.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((filePath) => filePath.replaceAll("\\", "/"))
    .filter(
      (filePath) =>
        LOCALE_SOURCE_PATTERN.test(filePath) ||
        LOCALE_TEST_PATTERN.test(filePath) ||
        METADATA_PATTERN.test(filePath),
    );
}

function scanCommonText(relativePath, text) {
  if (containsMojibakeMarker(text)) {
    failures.push(`${relativePath} contains a raw mojibake marker`);
  }
  if (text.includes("\uFFFD")) {
    failures.push(`${relativePath} contains the Unicode replacement character`);
  }
}

function scanLocaleSource(relativePath, text) {
  for (const rule of PLACEHOLDER_PATTERNS) {
    if (rule.pattern.test(text)) {
      failures.push(`${relativePath} contains placeholder marker ${rule.id}`);
    }
  }
  for (const rule of FORBIDDEN_PUBLIC_COPY_TERMS) {
    const findings = findPatternFindings(text, rule.pattern).filter(
      (finding) => !isAllowedPublicCopyFinding(relativePath, finding),
    );
    if (findings.length > 0) {
      failures.push(
        `${relativePath} contains forbidden public-copy term ${rule.id} at line ${findings[0].lineNumber}`,
      );
    }
  }
}

function findPatternFindings(text, pattern) {
  const findings = [];
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    pattern.lastIndex = 0;
    if (pattern.test(lines[index])) {
      findings.push({
        line: lines[index],
        previousLine: lines[index - 1] ?? "",
        lineNumber: index + 1,
      });
    }
  }
  return findings;
}

function isAllowedPublicCopyFinding(relativePath, finding) {
  if (!relativePath.endsWith("/dialog.ts")) return false;
  return (
    finding.line.includes('"integration.vts') ||
    finding.previousLine.includes('"integration.vts')
  );
}
