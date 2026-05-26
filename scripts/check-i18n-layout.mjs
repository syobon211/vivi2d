import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

const viewerLocales = {
  en: parseDictionary("packages/viewer/src/i18n/en.ts"),
  ja: parseDictionary("packages/viewer/src/i18n/ja.ts"),
  "zh-Hans": parseDictionary("packages/viewer/src/i18n/zh-Hans.ts"),
  "ko-KR": parseDictionary("packages/viewer/src/i18n/ko-KR.ts"),
};

const compactViewerKeys = new Map([
  ["openModel", 20],
  ["changeModel", 22],
  ["statsToggle", 28],
  ["stats", 16],
  ["controls", 18],
  ["closePanel", 24],
  ["sideSheetAria", 28],
  ["sideSheetTabsAria", 36],
  ["session", 18],
  ["connect", 18],
  ["overlays", 18],
  ["calibration", 18],
  ["inputEffects", 24],
  ["tracking", 18],
  ["background", 18],
  ["language", 18],
  ["recording", 18],
]);

for (const [locale, dict] of Object.entries(viewerLocales)) {
  for (const [key, maxWidth] of compactViewerKeys) {
    const value = dict.get(key);
    if (!value) {
      failures.push(`viewer/${locale} is missing compact layout key ${key}`);
      continue;
    }
    const width = displayWidth(value);
    if (width > maxWidth) {
      failures.push(
        `viewer/${locale}.${key} is too wide for compact surfaces: ${width} > ${maxWidth} (${value})`,
      );
    }
  }
}

const editorMenuLocales = {
  en: parseDictionary("src/lib/i18n/en/menu.ts"),
  ja: parseDictionary("src/lib/i18n/ja/menu.ts"),
  "zh-Hans": parseDictionary("src/lib/i18n/zh-Hans/menu.ts"),
  "ko-KR": parseDictionary("src/lib/i18n/ko-KR/menu.ts"),
};

for (const [locale, dict] of Object.entries(editorMenuLocales)) {
  for (const key of [
    "menu.languageEnglish",
    "menu.languageJapanese",
    "menu.languageChineseSimplified",
    "menu.languageKorean",
  ]) {
    const value = dict.get(key);
    if (!value) {
      failures.push(`editor/${locale} is missing language selector label ${key}`);
      continue;
    }
    const width = displayWidth(value);
    if (width > 18) {
      failures.push(
        `editor/${locale}.${key} is too wide for the language menu: ${width} > 18 (${value})`,
      );
    }
  }
}

const editorDialogLocales = {
  en: parseDictionary("src/lib/i18n/en/dialog.ts"),
  ja: parseDictionary("src/lib/i18n/ja/dialog.ts"),
  "zh-Hans": parseDictionary("src/lib/i18n/zh-Hans/dialog.ts"),
  "ko-KR": parseDictionary("src/lib/i18n/ko-KR/dialog.ts"),
};

const compactEditorDialogKeys = new Map([
  ["ai.tabImage", 20],
  ["ai.tabPrompt", 20],
  ["manualPngSplit.toolLasso", 18],
  ["manualPngSplit.lassoSmoothing", 28],
  ["manualPngSplit.modeReplace", 18],
  ["autoSetup.back", 18],
  ["autoSetup.preview", 18],
  ["autoSetup.gateStatus.warning", 24],
  ["autoSetup.motionStressCheck.duplicateOutline", 28],
  ["autoSetup.motionStressCheck.hiddenReveal", 28],
]);

for (const [locale, dict] of Object.entries(editorDialogLocales)) {
  for (const [key, maxWidth] of compactEditorDialogKeys) {
    const value = dict.get(key);
    if (!value) {
      failures.push(`editor/${locale} is missing compact dialog key ${key}`);
      continue;
    }
    const width = displayWidth(value);
    if (width > maxWidth) {
      failures.push(
        `editor/${locale}.${key} is too wide for compact dialog surfaces: ${width} > ${maxWidth} (${value})`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error("[i18n-layout] failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("[i18n-layout] passed");

function parseDictionary(relativePath) {
  const absolutePath = path.join(root, relativePath);
  const text = fs.readFileSync(absolutePath, "utf8");
  const entries = new Map();
  const pattern = /(?:"([^"]+)"|([A-Za-z][A-Za-z0-9_]*)):\s*"((?:\\.|[^"\\])*)"/g;
  for (const match of text.matchAll(pattern)) {
    entries.set(match[1] ?? match[2], JSON.parse(`"${match[3]}"`));
  }
  return entries;
}

function displayWidth(value) {
  let width = 0;
  for (const char of value) {
    const codePoint = char.codePointAt(0) ?? 0;
    if (
      (codePoint >= 0x1100 && codePoint <= 0x11ff) ||
      (codePoint >= 0x2e80 && codePoint <= 0x9fff) ||
      (codePoint >= 0xac00 && codePoint <= 0xd7af) ||
      (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
      (codePoint >= 0xff00 && codePoint <= 0xffef)
    ) {
      width += 2;
    } else {
      width += 1;
    }
  }
  return width;
}
