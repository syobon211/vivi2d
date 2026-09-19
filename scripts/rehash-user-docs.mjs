import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  canonicalUserAssetPath,
  decodeUserDocUtf8,
  parseUserDocFrontmatter,
  sourceContentHashForPage,
  USER_DOC_LOCALES,
} from "./lib/user-docs-source.mjs";

class RehashError extends Error {}
function reject(code) {
  throw new RehashError(code);
}

function parseArguments(args) {
  const slugs = [];
  let mode = null;
  for (const arg of args) {
    if (arg === "--write" || arg === "--dry-run") {
      if (mode !== null) reject("ambiguous-mode");
      mode = arg;
    } else if (arg.startsWith("--slug=")) {
      const slug = arg.slice(7);
      if (!/^(?:[a-z0-9][a-z0-9-]*(?:\/[a-z0-9][a-z0-9-]*)*)?$/.test(slug)) {
        reject("invalid-slug");
      }
      if (slugs.includes(slug)) reject("duplicate-slug");
      slugs.push(slug);
    } else {
      reject("unsupported-argument");
    }
  }
  if (slugs.length === 0) reject("explicit-slug-required");
  return { slugs, write: mode === "--write" };
}

function run(args) {
  const { slugs, write } = parseArguments(args);
  const root = fs.realpathSync(process.cwd());
  const inputs = new Map();

  function resolveUserPath(relative, directory = false) {
    if (
      !relative.startsWith("docs/user/") ||
      relative.includes("\\") ||
      relative.includes("\0") ||
      path.posix.normalize(relative) !== relative
    ) {
      reject("unsafe-docs-path");
    }
    const segments = relative.split("/");
    let resolved = root;
    for (let index = 0; index < segments.length; index += 1) {
      resolved = path.join(resolved, segments[index]);
      const stat = fs.lstatSync(resolved);
      if (stat.isSymbolicLink()) reject("linked-docs-path");
      const needsDirectory = directory || index < segments.length - 1;
      if (needsDirectory ? !stat.isDirectory() : !stat.isFile())
        reject("invalid-docs-path");
    }
    const real = fs.realpathSync(resolved);
    const within = path.relative(root, real);
    if (
      within.startsWith(`..${path.sep}`) ||
      within === ".." ||
      path.isAbsolute(within)
    ) {
      reject("outside-docs-root");
    }
    return resolved;
  }

  function readBytes(relative) {
    if (inputs.has(relative)) return inputs.get(relative);
    const bytes = fs.readFileSync(resolveUserPath(relative));
    inputs.set(relative, bytes);
    return bytes;
  }
  function readText(relative) {
    return decodeUserDocUtf8(readBytes(relative), relative, () =>
      reject("invalid-docs-encoding"),
    );
  }
  function readJson(relative) {
    try {
      return JSON.parse(readText(relative));
    } catch (error) {
      if (error instanceof RehashError) throw error;
      reject("invalid-docs-json");
    }
  }
  function readPage(relative, locale, slug) {
    const raw = readText(relative);
    const parsed = parseUserDocFrontmatter(raw, relative, () =>
      reject("invalid-frontmatter"),
    );
    const data = parsed.data;
    if (
      data.locale !== locale ||
      data.slug !== slug ||
      !["draft", "reviewed"].includes(data.status) ||
      ["title", "description"].some(
        (key) => typeof data[key] !== "string" || data[key].trim() === "",
      ) ||
      (data.media !== undefined &&
        (!Array.isArray(data.media) || data.media.some((id) => typeof id !== "string")))
    ) {
      reject("invalid-page-metadata");
    }
    return { raw, ...parsed };
  }

  const publication = readJson("docs/user/publication-manifest.json");
  if (
    !Array.isArray(publication?.locales) ||
    publication.locales.length !== USER_DOC_LOCALES.length ||
    USER_DOC_LOCALES.some((locale) => !publication.locales.includes(locale)) ||
    !Array.isArray(publication.routes)
  ) {
    reject("invalid-publication-manifest");
  }
  const routes = new Map();
  for (const route of publication.routes) {
    if (
      !route ||
      typeof route.slug !== "string" ||
      routes.has(route.slug) ||
      ["published", "includeInNavigation", "includeInSearch"].some(
        (key) => typeof route[key] !== "boolean",
      ) ||
      (!route.published && (route.includeInNavigation || route.includeInSearch))
    ) {
      reject("invalid-publication-manifest");
    }
    routes.set(route.slug, route);
  }
  const english = new Map();
  const neededMedia = new Set();
  for (const slug of slugs) {
    if (!routes.has(slug)) reject("unknown-route");
    const page = readPage(`docs/user/en/${slug === "" ? "index" : slug}.md`, "en", slug);
    english.set(slug, page);
    for (const id of page.data.media ?? []) neededMedia.add(id);
  }

  const media = new Map();
  function findMedia(directory) {
    const entries = fs.readdirSync(resolveUserPath(directory, true), {
      withFileTypes: true,
    });
    for (const entry of entries) {
      const relative = `${directory}/${entry.name}`;
      if (entry.isSymbolicLink()) reject("linked-docs-path");
      if (entry.isDirectory()) findMedia(relative);
      else if (entry.name === "manifest.json") {
        const manifest = readJson(relative);
        if (!neededMedia.has(manifest?.id)) continue;
        if (media.has(manifest.id)) reject("duplicate-media-id");
        media.set(manifest.id, { manifest });
      }
    }
  }
  if (neededMedia.size > 0) findMedia("docs/user/assets");
  for (const id of neededMedia) {
    const manifest = media.get(id)?.manifest;
    if (
      !manifest ||
      !["image", "video"].includes(manifest.kind) ||
      !["placeholder", "draft", "reviewed"].includes(manifest.status) ||
      !Array.isArray(manifest.topicSlugs) ||
      !manifest.variants ||
      typeof manifest.variants !== "object" ||
      Array.isArray(manifest.variants) ||
      Object.keys(manifest.variants).length === 0
    ) {
      reject("invalid-media-metadata");
    }
    for (const [variantName, variant] of Object.entries(manifest.variants)) {
      if (
        ![...USER_DOC_LOCALES, "neutral"].includes(variantName) ||
        !canonicalUserAssetPath(variant?.path) ||
        ["alt", "caption"].some((field) =>
          USER_DOC_LOCALES.some(
            (locale) =>
              typeof variant?.[field]?.[locale] !== "string" ||
              variant[field][locale].trim() === "",
          ),
        )
      ) {
        reject("invalid-media-metadata");
      }
    }
  }

  const plan = [];
  for (const slug of slugs) {
    const source = english.get(slug);
    for (const id of source.data.media ?? []) {
      const manifest = media.get(id).manifest;
      if (
        !manifest.topicSlugs.includes(slug) ||
        USER_DOC_LOCALES.some(
          (locale) => !manifest.variants[locale] && !manifest.variants.neutral,
        )
      )
        reject("invalid-media-route");
    }
    const hash = sourceContentHashForPage(
      source,
      media,
      (relative) =>
        `sha256:v1:${crypto.createHash("sha256").update(readBytes(relative)).digest("hex")}`,
    );
    for (const locale of USER_DOC_LOCALES.filter((value) => value !== "en")) {
      const relative = `docs/user/${locale}/${slug === "" ? "index" : slug}.md`;
      const page = readPage(relative, locale, slug);
      const translation = page.data.translation;
      if (
        translation !== undefined &&
        (!translation ||
          typeof translation !== "object" ||
          Array.isArray(translation) ||
          Object.keys(translation).some(
            (key) =>
              ![
                "sourceLocale",
                "sourceSlug",
                "sourceContentHash",
                "reviewed",
                "reviewerHandle",
                "reviewDate",
              ].includes(key),
          ))
      ) {
        reject("unsupported-translation-metadata");
      }
      if (
        (translation?.sourceLocale !== undefined && translation.sourceLocale !== "en") ||
        (translation?.sourceSlug !== undefined && translation.sourceSlug !== slug)
      )
        reject("translation-source-mismatch");
      if (translation?.sourceContentHash === hash) continue;
      if (routes.get(slug).published) reject("published-route-needs-separate-decision");
      plan.push({
        relative,
        before: inputs.get(relative),
        after: refreshDraft(page, slug, hash),
      });
    }
  }

  // Finish every parse, hash and plan check before the first write, then ensure
  // inputs still match. Individual replacements are atomic, not a multi-file transaction.
  if (write) {
    for (const [relative, before] of inputs) {
      if (!fs.readFileSync(resolveUserPath(relative)).equals(before))
        reject("source-changed");
    }
    for (const entry of plan) {
      const target = resolveUserPath(entry.relative);
      if (!fs.readFileSync(target).equals(entry.before)) reject("source-changed");
      const temporaryRelative = `${entry.relative}.rehash-${crypto.randomUUID()}.tmp`;
      const temporary = path.join(root, temporaryRelative);
      let created = false;
      try {
        const descriptor = fs.openSync(temporary, "wx");
        created = true;
        try {
          fs.writeFileSync(descriptor, entry.after, "utf8");
        } finally {
          fs.closeSync(descriptor);
        }
        resolveUserPath(entry.relative);
        fs.renameSync(temporary, target);
      } finally {
        if (created && fs.existsSync(temporary))
          fs.unlinkSync(resolveUserPath(temporaryRelative));
      }
    }
  }
  console.log(
    `[user-docs-rehash] ${write ? "updated" : "dry-run"}: ${plan.length} stale localized pages; no review or publication approval`,
  );
  for (const entry of plan)
    console.log(
      `- ${entry.relative}: ${write ? "draft hash refreshed" : "would refresh as draft"}`,
    );
}

function refreshDraft(page, slug, hash) {
  const lines = page.raw.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g).filter((line) => line !== "");
  const newline = lines[0].slice(3);
  const translation = [
    "translation:",
    '  sourceLocale: "en"',
    `  sourceSlug: "${slug}"`,
    `  sourceContentHash: "${hash}"`,
    "  reviewed: false",
    '  reviewerHandle: ""',
    '  reviewDate: ""',
  ]
    .map((line) => line + newline)
    .join("");
  const output = [];
  let replaced = false;
  for (let index = 0; index < page.closeIndex; index += 1) {
    const line = lines[index];
    if (/^status:/.test(line)) {
      output.push(`status: "draft"${line.match(/(?:\r\n|\r|\n)$/)?.[0] ?? newline}`);
    } else if (/^translation:/.test(line)) {
      if (!/^translation:[ \t]*(?:\r\n|\r|\n)$/.test(line))
        reject("unsupported-translation-layout");
      output.push(translation);
      replaced = true;
      while (
        index + 1 < page.closeIndex &&
        (/^ {2}/.test(lines[index + 1]) || lines[index + 1].trim() === "")
      ) {
        index += 1;
        if (lines[index].trim() === "") output.push(lines[index]);
      }
    } else {
      output.push(line);
    }
  }
  if (!replaced) output.push(translation);
  return output.join("") + lines.slice(page.closeIndex).join("");
}

try {
  if (process.argv.length === 3 && process.argv[2] === "--help") {
    console.log(
      "Usage: npm run docs:user:rehash -- --slug=<route> [--slug=<route>] [--write|--dry-run]; use --slug= for locale home pages",
    );
  } else {
    run(process.argv.slice(2));
  }
} catch (error) {
  console.error(
    `[user-docs-rehash] failed: ${error instanceof RehashError ? error.message : "operation-failed"}; earlier completed file replacements, if any, are retained`,
  );
  process.exitCode = 1;
}
