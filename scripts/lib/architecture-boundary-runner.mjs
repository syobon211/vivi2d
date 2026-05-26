import fs from "node:fs";
import path from "node:path";
import { gitLsFiles, resolveRepoPath } from "./repo.mjs";

const REQUIRED_RULE_FIELDS = [
  "allowedUpstream",
  "forbidden",
  "label",
  "layer",
  "owner",
  "phase",
  "publicationIntent",
  "testOnlyExceptions",
];

export function validateArchitectureManifest(manifest) {
  const failures = [];
  if (!Array.isArray(manifest.sourceExtensions)) {
    failures.push("manifest.sourceExtensions must be an array.");
  }
  if (!Array.isArray(manifest.rules)) {
    failures.push("manifest.rules must be an array.");
    return failures;
  }
  for (const [index, rule] of manifest.rules.entries()) {
    for (const field of REQUIRED_RULE_FIELDS) {
      if (!(field in rule)) {
        failures.push(
          `rules[${index}] ${rule.label ?? "<unnamed>"} is missing ${field}.`,
        );
      }
    }
    if (!rule.pathPrefix && !rule.pathPrefixPattern) {
      failures.push(
        `rules[${index}] ${rule.label ?? "<unnamed>"} needs a path selector.`,
      );
    }
    if (!Array.isArray(rule.forbidden)) {
      failures.push(
        `rules[${index}] ${rule.label ?? "<unnamed>"} forbidden must be an array.`,
      );
    }
    if (!Array.isArray(rule.allowlist ?? [])) {
      failures.push(
        `rules[${index}] ${rule.label ?? "<unnamed>"} allowlist must be an array.`,
      );
    }
  }
  return failures;
}

export function collectArchitectureFailures(manifest, options = {}) {
  const includeUntracked = options.includeUntracked ?? true;
  const phaseFilter = options.phaseFilter ?? null;
  const manifestFailures = validateArchitectureManifest(manifest);
  if (manifestFailures.length > 0) return manifestFailures;

  const sourceExtensions = new Set(manifest.sourceExtensions);
  const rules = manifest.rules
    .filter((rule) => !phaseFilter || phaseFilter.has(rule.phase))
    .map((rule) => ({
      ...rule,
      pathPrefixPattern: rule.pathPrefixPattern
        ? new RegExp(rule.pathPrefixPattern)
        : undefined,
      forbidden: rule.forbidden.map((pattern) => new RegExp(pattern)),
      allowlist: (rule.allowlist ?? []).map((entry) => ({
        ...entry,
        pathPattern: entry.pathPattern ? new RegExp(entry.pathPattern) : undefined,
        specifierPattern: entry.specifierPattern
          ? new RegExp(entry.specifierPattern)
          : undefined,
      })),
    }));

  const tracked = gitLsFiles();
  const untracked = includeUntracked
    ? gitLsFiles(["--others", "--exclude-standard"])
    : [];
  const files = [...new Set([...tracked, ...untracked])]
    .filter(Boolean)
    .filter((relativePath) => fs.existsSync(resolveRepoPath(relativePath)))
    .filter((relativePath) => sourceExtensions.has(path.extname(relativePath)))
    .filter(
      (relativePath) =>
        !relativePath.includes("__tests__") &&
        !relativePath.endsWith(".test.ts") &&
        !relativePath.endsWith(".test.tsx"),
    )
    .map((relativePath) => relativePath.replaceAll("\\", "/"));

  const failures = [];
  for (const relativePath of files) {
    const text = fs.readFileSync(resolveRepoPath(relativePath), "utf8");
    const imports = collectImports(text);
    for (const rule of rules) {
      if (!applies(rule, relativePath)) continue;
      for (const specifier of imports) {
        const normalizedSpecifier = normalizeImportSpecifier(relativePath, specifier);
        if (
          matchesForbidden(rule, specifier, normalizedSpecifier) &&
          !isAllowlisted(rule, relativePath, specifier, normalizedSpecifier)
        ) {
          failures.push(
            `${relativePath}: ${rule.label}; forbidden import "${specifier}"`,
          );
        }
      }
    }
  }
  return failures;
}

function collectImports(text) {
  const imports = [];
  const patterns = [
    /\bimport\s+(?:type\s+)?(?:[^"']+?\s+from\s+)?["']([^"']+)["']/g,
    /\bexport\s+(?:type\s+)?[^"']+?\s+from\s+["']([^"']+)["']/g,
    /\brequire\(\s*["']([^"']+)["']\s*\)/g,
    /\bimport\(\s*["']([^"']+)["']\s*\)/g,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      imports.push(match[1]);
    }
  }
  return imports;
}

function normalizeImportSpecifier(fromRelativePath, specifier) {
  if (!specifier.startsWith(".")) return specifier;
  const fromDir = path.posix.dirname(fromRelativePath);
  return path.posix.normalize(`${fromDir}/${specifier}`);
}

function applies(rule, relativePath) {
  if (rule.pathPrefix && relativePath.startsWith(rule.pathPrefix)) return true;
  if (rule.pathPrefixPattern?.test(relativePath)) return true;
  return false;
}

function matchesForbidden(rule, specifier, normalizedSpecifier) {
  return rule.forbidden.some(
    (forbidden) => forbidden.test(specifier) || forbidden.test(normalizedSpecifier),
  );
}

function isAllowlisted(rule, relativePath, specifier, normalizedSpecifier) {
  return rule.allowlist.some((entry) => {
    const pathMatches =
      !entry.path || entry.path === relativePath || entry.pathPattern?.test(relativePath);
    const specifierMatches =
      !entry.specifier && !entry.specifierPattern
        ? true
        : entry.specifier === specifier ||
          entry.specifier === normalizedSpecifier ||
          entry.specifierPattern?.test(specifier) ||
          entry.specifierPattern?.test(normalizedSpecifier);
    return pathMatches && specifierMatches;
  });
}
