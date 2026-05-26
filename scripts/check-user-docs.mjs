import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { TextDecoder } from "node:util";
import {
  comfyUiSourceRecordRequiredReasons,
  validateComfyUiSourceRecord,
} from "./lib/comfyui-source-record.mjs";

const root = process.cwd();
const failures = [];
const locales = ["en", "ja", "zh-Hans", "ko-KR"];
const statuses = new Set(["draft", "reviewed", "stub"]);
const audiences = new Set(["artist", "rigger", "streamer", "developer"]);
const releaseCandidate = process.argv.includes("--release-candidate");
const reviewOwnershipFile = "docs/user/review-ownership.json";

function fail(message) {
  failures.push(message);
}

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

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function readText(relativePath) {
  const bytes = fs.readFileSync(path.join(root, relativePath));
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail(`${relativePath}: invalid UTF-8 byte sequence.`);
    return "";
  }
}

function fileSha256(relativePath) {
  const file = path.join(root, relativePath);
  if (!fs.existsSync(file)) return null;
  const digest = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  return `sha256:v1:${digest}`;
}

function canonicalUserAssetPath(value) {
  if (typeof value !== "string") return null;
  if (value.includes("\\") || value.includes("\0")) return null;
  const normalized = path.posix.normalize(value);
  if (normalized !== value) return null;
  if (!normalized.startsWith("docs/user/assets/")) return null;
  if (normalized === "docs/user/assets/" || normalized.endsWith("/")) return null;
  return normalized;
}

function readJson(relativePath) {
  try {
    return JSON.parse(readText(relativePath));
  } catch (error) {
    fail(`${relativePath}: invalid JSON (${error.message})`);
    return null;
  }
}

function listRepoFiles(prefix) {
  return runGit(["ls-files", "--cached", "--others", "--exclude-standard", prefix])
    .split(/\r?\n/)
    .filter(Boolean)
    .map((file) => file.replaceAll("\\", "/"))
    .sort();
}

function listTrackedUserMarkdown(locale) {
  return listRepoFiles(`docs/user/${locale}`)
    .filter((file) => file.endsWith(".md"))
    .map((file) => file.slice(`docs/user/${locale}/`.length))
    .sort();
}

function slugFromLocaleRelative(relativePath) {
  if (relativePath === "index.md") return "";
  return relativePath.replace(/\.md$/, "");
}

function parseScalar(value, file, context) {
  const trimmed = value.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      return JSON.parse(trimmed);
    } catch (error) {
      fail(`${file}: malformed JSON array in frontmatter ${context} (${error.message}).`);
      return null;
    }
  }
  return trimmed;
}

function parseFrontmatter(file) {
  const raw = readText(file);
  if (raw.charCodeAt(0) === 0xfeff) {
    fail(`${file}: UTF-8 BOM is not allowed.`);
  }

  const text = raw.replace(/\r\n?/g, "\n");
  const lines = text.split("\n");
  if (lines[0] !== "---") {
    fail(`${file}: missing opening frontmatter delimiter.`);
    return { data: {}, body: text };
  }

  const closeIndex = lines.findIndex((line, index) => index > 0 && line === "---");
  if (closeIndex === -1) {
    fail(`${file}: missing closing frontmatter delimiter.`);
    return { data: {}, body: "" };
  }

  const data = {};
  const seen = new Set();
  let currentKey = null;
  for (let lineIndex = 1; lineIndex < closeIndex; lineIndex += 1) {
    const line = lines[lineIndex];
    if (line.trim() === "") continue;
    if (line.startsWith("  - ")) {
      if (!currentKey || !Array.isArray(data[currentKey])) {
        fail(`${file}: list item has no array parent in frontmatter: ${line}`);
        continue;
      }
      data[currentKey].push(parseScalar(line.slice(4), file, currentKey));
      continue;
    }
    if (line.startsWith("  ")) {
      if (
        !currentKey ||
        typeof data[currentKey] !== "object" ||
        Array.isArray(data[currentKey])
      ) {
        fail(`${file}: nested field has no object parent in frontmatter: ${line}`);
        continue;
      }
      const match = /^ {2}([A-Za-z][A-Za-z0-9]*):\s*(.*)$/.exec(line);
      if (!match) {
        fail(`${file}: unsupported nested frontmatter syntax: ${line}`);
        continue;
      }
      data[currentKey][match[1]] = parseScalar(
        match[2],
        file,
        `${currentKey}.${match[1]}`,
      );
      continue;
    }

    const match = /^([A-Za-z][A-Za-z0-9]*):\s*(.*)$/.exec(line);
    if (!match) {
      fail(`${file}: unsupported frontmatter syntax: ${line}`);
      continue;
    }
    const [, key, rawValue] = match;
    if (seen.has(key)) {
      fail(`${file}: duplicate frontmatter field: ${key}`);
    }
    seen.add(key);
    if (rawValue === "") {
      const following = lines
        .slice(lineIndex + 1, closeIndex)
        .find((candidate) => candidate.trim() !== "");
      data[key] = following?.startsWith("  - ") ? [] : {};
    } else {
      data[key] = parseScalar(rawValue, file, key);
    }
    currentKey = key;
  }

  return { data, body: lines.slice(closeIndex + 1).join("\n") };
}

function validateRequiredString(file, data, key) {
  if (typeof data[key] !== "string" || data[key].trim() === "") {
    fail(`${file}: frontmatter ${key} must be a non-empty string.`);
  }
}

function validateRequiredStringValue(file, data, key) {
  if (typeof data[key] !== "string") {
    fail(`${file}: frontmatter ${key} must be a string.`);
  }
}

function normalizeBodyForHash(body) {
  return body.replace(/\r\n?/g, "\n");
}

function localizedRecordForHash(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = {};
  for (const locale of locales) {
    record[locale] = typeof value[locale] === "string" ? value[locale] : null;
  }
  return record;
}

function localizedOrScalarRecordForHash(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  return localizedRecordForHash(value);
}

function mediaSourceRecordForHash(mediaId, mediaManifests) {
  const record = mediaManifests.get(mediaId);
  if (!record) return { id: mediaId, missing: true };
  const manifest = record.manifest;
  const variants = {};
  for (const variantName of Object.keys(manifest.variants ?? {}).sort()) {
    const variant = manifest.variants[variantName] ?? {};
    const variantPath = canonicalUserAssetPath(variant.path);
    variants[variantName] = {
      fileSha256: variantPath ? fileSha256(variantPath) : null,
      path: variantPath,
      alt: localizedRecordForHash(variant.alt),
      caption: localizedRecordForHash(variant.caption),
      captions: localizedOrScalarRecordForHash(variant.captions),
      transcript: localizedOrScalarRecordForHash(variant.transcript),
    };
  }
  return {
    id: mediaId,
    kind: manifest.kind ?? null,
    status: manifest.status ?? null,
    topicSlugs: Array.isArray(manifest.topicSlugs) ? manifest.topicSlugs : null,
    variants,
  };
}

function sourceContentHashForEnglishSlug(slug, mediaManifests) {
  const relativePath = slug === "" ? "index.md" : `${slug}.md`;
  const file = `docs/user/en/${relativePath}`;
  if (!exists(file)) return null;
  const { data, body } = parseFrontmatter(file);
  const included = {};
  for (const key of ["title", "description", "audience", "media", "workflow"]) {
    if (data[key] !== undefined) included[key] = data[key];
  }
  if (Array.isArray(data.media)) {
    included.mediaMetadata = data.media.map((mediaId) =>
      mediaSourceRecordForHash(mediaId, mediaManifests),
    );
  }
  const prefix = Object.keys(included)
    .sort()
    .map((key) => `${key}=${JSON.stringify(included[key])}`)
    .join("\n");
  const payload = `${prefix}\n\n${normalizeBodyForHash(body)}`;
  const digest = crypto.createHash("sha256").update(payload, "utf8").digest("hex");
  return `sha256:v1:${digest}`;
}

function readReviewOwnership() {
  if (!exists(reviewOwnershipFile)) {
    fail(
      `${reviewOwnershipFile}: reviewer registry is required for release-candidate mode or reviewed user-doc content.`,
    );
    return null;
  }
  const ownership = readJson(reviewOwnershipFile);
  if (!ownership) return null;
  if (!ownership.locales || typeof ownership.locales !== "object") {
    fail(`${reviewOwnershipFile}: locales reviewer registry is required.`);
    return ownership;
  }
  for (const locale of locales.filter((locale) => locale !== "en")) {
    if (
      !Array.isArray(ownership.locales[locale]) ||
      ownership.locales[locale].length === 0 ||
      ownership.locales[locale].some(
        (reviewer) => typeof reviewer !== "string" || reviewer.trim() === "",
      )
    ) {
      fail(`${reviewOwnershipFile}: locales.${locale} needs reviewer handles.`);
    }
  }
  if (
    !ownership.media ||
    !Array.isArray(ownership.media.reviewers) ||
    ownership.media.reviewers.length === 0 ||
    ownership.media.reviewers.some(
      (reviewer) => typeof reviewer !== "string" || reviewer.trim() === "",
    )
  ) {
    fail(`${reviewOwnershipFile}: media.reviewers needs reviewer handles.`);
  } else {
    const mediaReviewers = new Set(ownership.media.reviewers);
    for (const locale of locales.filter((locale) => locale !== "en")) {
      for (const reviewer of ownership.locales?.[locale] ?? []) {
        if (mediaReviewers.has(reviewer)) {
          fail(
            `${reviewOwnershipFile}: ${reviewer} cannot be both a media reviewer and ${locale} locale reviewer until media-review exception schema exists.`,
          );
        }
      }
    }
  }
  return ownership;
}

function reviewerAllowed(ownership, locale, reviewerHandle) {
  return Boolean(ownership?.locales?.[locale]?.includes(reviewerHandle));
}

function frontmatterStatusIsReviewed(file) {
  if (!exists(file)) return false;
  const text = readText(file);
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  return Boolean(match?.[1] && /^status:\s*["']?reviewed["']?\s*$/m.test(match[1]));
}

function reviewedUserContentExists() {
  for (const locale of locales.filter((locale) => locale !== "en")) {
    for (const relativePath of listTrackedUserMarkdown(locale)) {
      if (frontmatterStatusIsReviewed(`docs/user/${locale}/${relativePath}`)) {
        return true;
      }
    }
  }
  for (const file of listRepoFiles("docs/user/assets")) {
    if (!file.endsWith("/manifest.json")) continue;
    if (/"status"\s*:\s*"reviewed"/.test(readText(file))) return true;
  }
  return false;
}

function listMediaManifests(reviewOwnership, expectedSlugSet) {
  const manifests = new Map();
  for (const file of listRepoFiles("docs/user/assets")) {
    if (!file.endsWith("/manifest.json")) continue;
    const manifest = readJson(file);
    if (!manifest) continue;
    if (typeof manifest.id !== "string" || manifest.id.trim() === "") {
      fail(`${file}: manifest id must be a non-empty string.`);
      continue;
    }
    if (manifests.has(manifest.id)) {
      fail(`${file}: duplicate media manifest id ${manifest.id}.`);
    }
    manifests.set(manifest.id, { file, manifest });
    validateMediaManifest(file, manifest, reviewOwnership, expectedSlugSet);
  }
  return manifests;
}

function mediaReviewerAllowed(ownership, reviewerHandle) {
  return Boolean(ownership?.media?.reviewers?.includes(reviewerHandle));
}

function validateMediaManifest(file, manifest, reviewOwnership, expectedSlugSet) {
  if (!["image", "video"].includes(manifest.kind)) {
    fail(`${file}: manifest kind must be image or video.`);
  }
  if (!["placeholder", "draft", "reviewed"].includes(manifest.status)) {
    fail(`${file}: manifest status must be placeholder, draft, or reviewed.`);
  }
  if (manifest.kind === "video" && manifest.status === "reviewed") {
    fail(
      `${file}: reviewed video media is blocked until localized captions/transcripts and poster metadata are validator-enforced.`,
    );
  }
  if (!Array.isArray(manifest.topicSlugs)) {
    fail(`${file}: topicSlugs must be an array.`);
  } else {
    for (const topicSlug of manifest.topicSlugs) {
      if (typeof topicSlug !== "string") {
        fail(`${file}: topicSlugs entries must be strings.`);
      } else if (!expectedSlugSet.has(topicSlug)) {
        fail(`${file}: topicSlug ${topicSlug} has no matching user-doc route.`);
      }
    }
  }
  if (!manifest.variants || typeof manifest.variants !== "object") {
    fail(`${file}: variants object is required.`);
    return;
  }
  for (const [variantName, variant] of Object.entries(manifest.variants)) {
    if (![...locales, "neutral"].includes(variantName)) {
      fail(`${file}: unsupported media variant ${variantName}.`);
    }
    if (typeof variant?.path !== "string") {
      fail(`${file}: variant ${variantName} path must be a string.`);
    } else {
      const variantPath = canonicalUserAssetPath(variant.path);
      if (!variantPath) {
        fail(
          `${file}: variant ${variantName} path must stay under docs/user/assets/ without backslashes, traversal, or normalization changes.`,
        );
      } else if (!exists(variantPath)) {
        fail(`${file}: variant ${variantName} path does not exist.`);
      }
    }
    for (const field of ["alt", "caption"]) {
      if (!variant?.[field] || typeof variant[field] !== "object") {
        fail(`${file}: variant ${variantName} is missing ${field} localization.`);
        continue;
      }
      for (const locale of locales) {
        if (
          typeof variant[field][locale] !== "string" ||
          variant[field][locale].trim() === ""
        ) {
          fail(`${file}: variant ${variantName} ${field}.${locale} is required.`);
        }
      }
    }
    if (manifest.kind === "video" && !variant.captions && !variant.transcript) {
      fail(
        `${file}: video variant ${variantName} needs captions or transcript metadata.`,
      );
    }
  }
  if (manifest.status === "reviewed") {
    if (!manifest.review || typeof manifest.review !== "object") {
      fail(`${file}: reviewed media manifest needs review metadata.`);
      return;
    }
    if (
      typeof manifest.review.reviewerHandle !== "string" ||
      manifest.review.reviewerHandle.trim() === ""
    ) {
      fail(`${file}: review.reviewerHandle is required for reviewed media.`);
    } else if (
      reviewOwnership &&
      !mediaReviewerAllowed(reviewOwnership, manifest.review.reviewerHandle)
    ) {
      fail(`${file}: review.reviewerHandle is not authorized for media review.`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(manifest.review.reviewDate ?? ""))) {
      fail(`${file}: review.reviewDate must be YYYY-MM-DD.`);
    }
  }
}

function readPublicationManifest(expectedSlugs) {
  const file = "docs/user/publication-manifest.json";
  const manifest = readJson(file);
  if (!manifest) return new Map();
  if (
    !Array.isArray(manifest.locales) ||
    manifest.locales.length !== locales.length ||
    locales.some((locale) => !manifest.locales.includes(locale))
  ) {
    fail(`${file}: locales must explicitly list ${locales.join(", ")}.`);
  }
  if (!Array.isArray(manifest.routes)) {
    fail(`${file}: routes must be an array.`);
    return new Map();
  }
  const routes = new Map();
  for (const route of manifest.routes) {
    if (!route || typeof route !== "object" || typeof route.slug !== "string") {
      fail(`${file}: each route needs a string slug.`);
      continue;
    }
    if (routes.has(route.slug)) {
      fail(`${file}: duplicate route slug ${route.slug}.`);
    }
    for (const key of ["published", "includeInNavigation", "includeInSearch"]) {
      if (typeof route[key] !== "boolean") {
        fail(`${file}: route ${route.slug} ${key} must be boolean.`);
      }
    }
    if (
      route.published === false &&
      (route.includeInNavigation || route.includeInSearch)
    ) {
      fail(`${file}: unpublished route ${route.slug} cannot be in navigation or search.`);
    }
    routes.set(route.slug, route);
  }
  for (const slug of expectedSlugs) {
    if (!routes.has(slug))
      fail(`${file}: missing explicit route entry for slug ${slug || "<index>"}.`);
  }
  for (const slug of routes.keys()) {
    if (!expectedSlugs.includes(slug))
      fail(`${file}: route slug has no English source page: ${slug}`);
  }
  return routes;
}

function validatePage(
  file,
  locale,
  expectedSlug,
  mediaManifests,
  publicationRoute,
  reviewOwnership,
) {
  const { data } = parseFrontmatter(file);
  for (const key of ["title", "description", "locale", "status"]) {
    validateRequiredString(file, data, key);
  }
  validateRequiredStringValue(file, data, "slug");
  if (data.locale !== locale) fail(`${file}: locale must be ${locale}.`);
  if (data.slug !== expectedSlug) fail(`${file}: slug must be ${expectedSlug}.`);
  if (!statuses.has(data.status)) fail(`${file}: unsupported status ${data.status}.`);
  if (data.status === "stub") fail(`${file}: status stub blocks user docs checks.`);

  if (data.audience !== undefined) {
    if (!Array.isArray(data.audience)) {
      fail(`${file}: audience must be an array.`);
    } else {
      for (const audience of data.audience) {
        if (!audiences.has(audience)) fail(`${file}: unsupported audience ${audience}.`);
      }
    }
  }

  if (data.media !== undefined) {
    if (!Array.isArray(data.media)) {
      fail(`${file}: media must be an array.`);
    } else {
      for (const mediaId of data.media) {
        const record = mediaManifests.get(mediaId);
        if (!record) {
          fail(`${file}: media id ${mediaId} has no manifest.`);
          continue;
        }
        const variants = record.manifest.variants ?? {};
        if (!variants[locale] && !variants.neutral) {
          fail(`${file}: media id ${mediaId} has no ${locale} or neutral variant.`);
        }
        if (
          Array.isArray(record.manifest.topicSlugs) &&
          !record.manifest.topicSlugs.includes(expectedSlug)
        ) {
          fail(
            `${file}: media id ${mediaId} is not allowed for slug ${expectedSlug || "<index>"}.`,
          );
        }
        if (
          releaseCandidate &&
          publicationRoute?.published &&
          record.manifest.status !== "reviewed"
        ) {
          fail(
            `${file}: published release-candidate route references non-reviewed media ${mediaId}.`,
          );
        }
      }
    }
  }

  if (locale !== "en" && data.status === "reviewed") {
    const translation = data.translation;
    if (!translation || typeof translation !== "object") {
      fail(`${file}: reviewed non-English page needs translation metadata.`);
    } else {
      if (translation.reviewed !== true)
        fail(`${file}: translation.reviewed must be true.`);
      if (
        typeof translation.reviewerHandle !== "string" ||
        translation.reviewerHandle.trim() === ""
      ) {
        fail(`${file}: translation.reviewerHandle is required for reviewed pages.`);
      } else if (
        reviewOwnership &&
        !reviewerAllowed(reviewOwnership, locale, translation.reviewerHandle)
      ) {
        fail(
          `${file}: translation.reviewerHandle is not authorized for locale ${locale}.`,
        );
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(translation.reviewDate ?? ""))) {
        fail(`${file}: translation.reviewDate must be YYYY-MM-DD.`);
      }
      const expectedHash = sourceContentHashForEnglishSlug(expectedSlug, mediaManifests);
      if (
        typeof translation.sourceContentHash !== "string" ||
        translation.sourceContentHash.trim() === ""
      ) {
        fail(`${file}: translation.sourceContentHash is required for reviewed pages.`);
      }
      if (translation.sourceContentHash !== expectedHash) {
        fail(
          `${file}: translation.sourceContentHash does not match current English source. Expected ${expectedHash}.`,
        );
      }
    }
  }

  if (publicationRoute?.published && data.status !== "reviewed") {
    fail(`${file}: published route must use status reviewed.`);
  }

  const text = readText(file);
  if (releaseCandidate && publicationRoute?.published) {
    for (const link of text.matchAll(/\[[^\]]+\]\(([^)#][^)]+)\)/g)) {
      const href = link[1];
      if (/^[a-z][a-z0-9+.-]*:/i.test(href)) continue;
      if (href.startsWith("#")) continue;
      const targetPath = href.split("#")[0].split("?")[0];
      if (!targetPath.endsWith(".md")) continue;
      const sourcePath = expectedSlug === "" ? "index.md" : `${expectedSlug}.md`;
      const normalized = path.posix.normalize(
        path.posix.join(path.posix.dirname(sourcePath), targetPath),
      );
      if (normalized.startsWith("../") || normalized.startsWith("/")) {
        fail(`${file}: release-candidate user-doc link escapes locale tree: ${href}`);
        continue;
      }
      const targetSlug = slugFromLocaleRelative(normalized);
      const targetRoute = publicationRoutes.get(targetSlug);
      if (!targetRoute) {
        fail(`${file}: release-candidate user-doc link targets unknown route ${href}.`);
      } else if (!targetRoute.published) {
        fail(
          `${file}: release-candidate user-doc link targets unpublished route ${targetSlug || "<index>"}.`,
        );
      }
    }
  }
  if (locale !== "en" && /docs\/user\/assets\/[^\s)"']+\.en\.[A-Za-z0-9]+/.test(text)) {
    fail(`${file} references .en media from a non-English locale.`);
  }
}

function validateRootIndex() {
  const file = "docs/user/index.md";
  if (!exists(file)) {
    fail("docs/user/index.md is missing.");
    return;
  }
  const { data } = parseFrontmatter(file);
  for (const key of ["title", "description", "locale", "status"]) {
    validateRequiredString(file, data, key);
  }
  validateRequiredStringValue(file, data, "slug");
  if (data.locale !== "en") fail(`${file}: root locale selector must use locale en.`);
  if (data.slug !== "") fail(`${file}: root locale selector must use an empty slug.`);
  if (data.routeKind !== "locale-selector") {
    fail(`${file}: root locale selector must use routeKind locale-selector.`);
  }
  if (!statuses.has(data.status)) fail(`${file}: unsupported status ${data.status}.`);
  if (releaseCandidate && data.status !== "reviewed") {
    fail(`${file}: root locale selector must be reviewed in release-candidate mode.`);
  }
}

validateRootIndex();

const expectedPages = listTrackedUserMarkdown("en");
if (expectedPages.length === 0) {
  fail("docs/user/en must contain user documentation pages.");
}

const expectedSlugs = expectedPages.map(slugFromLocaleRelative).sort();
const expectedSlugSet = new Set(expectedSlugs);
const reviewedContentExists = reviewedUserContentExists();
const reviewOwnership =
  releaseCandidate || reviewedContentExists || exists(reviewOwnershipFile)
    ? readReviewOwnership()
    : null;
const mediaManifests = listMediaManifests(reviewOwnership, expectedSlugSet);
const publicationRoutes = readPublicationManifest(expectedSlugs);
for (const failure of validateComfyUiSourceRecord(
  root,
  comfyUiSourceRecordRequiredReasons(root, { publicationRoutes, releaseCandidate }),
)) {
  fail(failure);
}

for (const locale of locales) {
  const pages = listTrackedUserMarkdown(locale);
  const missing = expectedPages.filter((slug) => !pages.includes(slug));
  const extra = pages.filter((slug) => !expectedPages.includes(slug));
  for (const slug of missing) fail(`${locale} is missing user-doc page: ${slug}`);
  for (const slug of extra)
    fail(`${locale} has extra user-doc page without parity: ${slug}`);

  for (const relativePath of pages) {
    const slug = slugFromLocaleRelative(relativePath);
    const file = `docs/user/${locale}/${relativePath}`;
    validatePage(
      file,
      locale,
      slug,
      mediaManifests,
      publicationRoutes.get(slug),
      reviewOwnership,
    );
  }
}

if (failures.length > 0) {
  console.error("[user-docs] failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("[user-docs] passed");
