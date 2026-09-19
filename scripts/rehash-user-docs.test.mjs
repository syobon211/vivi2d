import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const command = path.resolve("scripts/rehash-user-docs.mjs");
const checker = path.resolve("scripts/check-user-docs.mjs");
const fixtureParent = path.resolve("tmp");
const roots = [];
const locales = ["en", "ja", "zh-Hans", "ko-KR"];

afterEach(() => {
  for (const root of roots.splice(0)) {
    if (
      path.dirname(root) !== fixtureParent ||
      !path.basename(root).startsWith("docs-rehash-")
    ) {
      throw new Error("Unexpected owned fixture root");
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function write(root, relative, contents) {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
}

function page(locale, slug, { hash = `sha256:v1:${"0".repeat(64)}`, media } = {}) {
  const translation =
    locale === "en"
      ? ""
      : `translation:
  sourceLocale: "en"
  sourceSlug: "${slug}"
  sourceContentHash: "${hash}"
  reviewed: true
  reviewerHandle: "synthetic-reviewer"
  reviewDate: "2026-09-11"
`;
  return `---
title: "${locale === "en" ? "English" : "Localized"} guide"
description: "Synthetic description."
locale: "${locale}"
slug: "${slug}"
status: "${locale === "en" ? "draft" : "reviewed"}"
audience: ["artist"]
${media ? `media: ${JSON.stringify(media)}\n` : ""}noIndex: true
${translation}---
# Synthetic guide

Keep body whitespace.  

\`\`\`text
  indented example
\`\`\`

`;
}

function fixture() {
  fs.mkdirSync(fixtureParent, { recursive: true });
  const root = fs.mkdtempSync(path.join(fixtureParent, "docs-rehash-"));
  roots.push(root);
  write(
    root,
    "docs/user/publication-manifest.json",
    JSON.stringify({
      locales,
      routes: ["", "guide"].map((slug) => ({
        slug,
        published: false,
        includeInNavigation: false,
        includeInSearch: false,
      })),
    }),
  );
  write(
    root,
    "docs/user/index.md",
    '---\ntitle: "Docs"\ndescription: "Synthetic docs."\nlocale: "en"\nslug: ""\nstatus: "draft"\nrouteKind: "locale-selector"\n---\n',
  );
  for (const locale of locales) {
    for (const slug of ["", "guide"]) {
      write(root, `docs/user/${locale}/${slug || "index"}.md`, page(locale, slug));
    }
  }
  return root;
}

function run(root, args = []) {
  return spawnSync(process.execPath, [command, ...args], { cwd: root, encoding: "utf8" });
}

function runWithPreload(root, source) {
  const preload = path.join(root, "rehash-fault.cjs");
  write(
    root,
    "rehash-fault.cjs",
    `const fs = require("node:fs");\nconst path = require("node:path");\n${source}\n`,
  );
  return spawnSync(
    process.execPath,
    ["--require", preload, command, "--slug=guide", "--write"],
    { cwd: root, encoding: "utf8", windowsHide: true, timeout: 10_000 },
  );
}

function temporarySiblings(root) {
  return locales.slice(1).flatMap((locale) =>
    fs
      .readdirSync(path.join(root, "docs/user", locale))
      .filter((name) => name.startsWith("guide.md.rehash-") && name.endsWith(".tmp"))
      .map((name) => `docs/user/${locale}/${name}`),
  );
}

function snapshot(root) {
  return Object.fromEntries(
    [
      "docs/user/publication-manifest.json",
      "docs/user/index.md",
      ...locales.flatMap((locale) =>
        ["index", "guide"].map((slug) => `docs/user/${locale}/${slug}.md`),
      ),
    ].map((relative) => [
      relative,
      fs.readFileSync(path.join(root, relative)).toString("hex"),
    ]),
  );
}

function expectedHash() {
  const body = page("en", "guide").split("---\n").slice(2).join("---\n");
  const normalized = `audience=["artist"]\ndescription="Synthetic description."\ntitle="English guide"\n\n${body}`;
  return `sha256:v1:${crypto.createHash("sha256").update(normalized).digest("hex")}`;
}

// A concrete oracle for this one media fixture, not a second generic normalizer.
// No production helper or parsed manifest supplies its field order or values.
function expectedMediaHash(japaneseCaption, svgBytes) {
  const metadata = [
    {
      id: "sample.image",
      kind: "image",
      status: "placeholder",
      topicSlugs: ["guide"],
      variants: {
        neutral: {
          fileSha256: `sha256:v1:${crypto.createHash("sha256").update(svgBytes, "utf8").digest("hex")}`,
          path: "docs/user/assets/images/sample.neutral.svg",
          alt: {
            en: "Synthetic en alt",
            ja: "Synthetic ja alt",
            "zh-Hans": "Synthetic zh-Hans alt",
            "ko-KR": "Synthetic ko-KR alt",
          },
          caption: {
            en: "Synthetic en caption",
            ja: japaneseCaption,
            "zh-Hans": "Synthetic zh-Hans caption",
            "ko-KR": "Synthetic ko-KR caption",
          },
          captions: null,
          transcript: null,
        },
      },
    },
  ];
  const normalized =
    'audience=["artist"]\ndescription="Synthetic description."\nmedia=["sample.image"]\n' +
    `mediaMetadata=${JSON.stringify(metadata)}\ntitle="English guide"\n\n` +
    "# Synthetic guide\n\nKeep body whitespace.  \n\n```text\n  indented example\n```\n\n";
  return `sha256:v1:${crypto.createHash("sha256").update(normalized, "utf8").digest("hex")}`;
}

function read(root, relative) {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

function mediaFixture(root) {
  const manifest = {
    id: "sample.image",
    kind: "image",
    status: "placeholder",
    topicSlugs: ["guide"],
    variants: {
      neutral: {
        path: "docs/user/assets/images/sample.neutral.svg",
        alt: Object.fromEntries(
          locales.map((locale) => [locale, `Synthetic ${locale} alt`]),
        ),
        caption: Object.fromEntries(
          locales.map((locale) => [locale, `Synthetic ${locale} caption`]),
        ),
      },
    },
  };
  write(root, "docs/user/assets/images/manifest.json", JSON.stringify(manifest));
  write(root, manifest.variants.neutral.path, "<svg />\n");
  write(root, "docs/user/en/guide.md", page("en", "guide", { media: [manifest.id] }));
  return manifest;
}

describe("explicit user-docs source hash refresh", () => {
  it("defaults to dry-run with no writes and no content/hash output", () => {
    const root = fixture();
    const before = snapshot(root);
    const result = run(root, ["--slug=guide"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("dry-run: 3 stale localized pages");
    expect(result.stdout).not.toContain("sha256:");
    expect(result.stdout).not.toContain("Synthetic description");
    expect(snapshot(root)).toEqual(before);
  });

  it("updates only stale selected translations, clears approvals, and preserves unrelated bytes", () => {
    const root = fixture();
    const japanese = "docs/user/ja/guide.md";
    write(root, japanese, page("ja", "guide").replaceAll("\n", "\r\n"));
    const korean = "docs/user/ko-KR/guide.md";
    write(
      root,
      korean,
      page("ko-KR", "guide").replace(
        '  reviewDate: "2026-09-11"\n',
        '  reviewDate: "2026-09-11"\n\n\nlegacyEnglishUrl: "legacy/guide"\n',
      ),
    );
    const before = snapshot(root);
    const body = read(root, japanese).split("---\r\n").slice(2).join("---\r\n");
    const result = run(root, ["--slug=guide", "--write"]);
    expect(result.status).toBe(0);
    for (const locale of locales.slice(1)) {
      const after = read(root, `docs/user/${locale}/guide.md`);
      expect(after).toContain('status: "draft"');
      expect(after).toContain(`sourceContentHash: "${expectedHash()}"`);
      expect(after).toContain("  reviewed: false");
      expect(after).toContain('  reviewerHandle: ""');
      expect(after).toContain('  reviewDate: ""');
      expect(after).toContain('audience: ["artist"]');
      expect(after).toContain("noIndex: true");
    }
    expect(read(root, japanese).split("---\r\n").slice(2).join("---\r\n")).toBe(body);
    expect(read(root, korean)).toContain(
      '  reviewDate: ""\n\n\nlegacyEnglishUrl: "legacy/guide"\n---\n',
    );
    const after = snapshot(root);
    for (const relative of Object.keys(before).filter(
      (file) => !/\/(ja|zh-Hans|ko-KR)\/guide\.md$/.test(file),
    )) {
      expect(after[relative]).toBe(before[relative]);
    }
    expect(run(root, ["--slug=guide", "--write"]).stdout).toContain("updated: 0");
  });

  it("leaves a fresh reviewed translation byte-identical", () => {
    const root = fixture();
    for (const locale of locales.slice(1))
      write(
        root,
        `docs/user/${locale}/guide.md`,
        page(locale, "guide", { hash: expectedHash() }),
      );
    const before = snapshot(root);
    expect(run(root, ["--slug=guide", "--write"]).status).toBe(0);
    expect(snapshot(root)).toEqual(before);
  });

  it("cleans a partially written owned temporary and retains earlier completed replacements", () => {
    const root = fixture();
    const before = snapshot(root);
    const result = runWithPreload(
      root,
      `
const directory = path.join(__dirname, "docs/user/zh-Hans");
const nativeOpen = fs.openSync.bind(fs);
const nativeWrite = fs.writeFileSync.bind(fs);
const isTarget = (file) => typeof file === "string" && path.dirname(file) === directory &&
  path.basename(file).startsWith("guide.md.rehash-") && file.endsWith(".tmp");
let descriptor;
fs.openSync = (file, flags, ...rest) => {
  const fd = nativeOpen(file, flags, ...rest);
  if (flags === "wx" && isTarget(file)) descriptor = fd;
  return fd;
};
fs.writeFileSync = (file, contents, options) => {
  if (file === descriptor || isTarget(file)) {
    nativeWrite(file, Buffer.from(contents, "utf8").subarray(0, 16), options);
    throw Object.assign(new Error("synthetic-private-marker"), { code: "ENOSPC" });
  }
  return nativeWrite(file, contents, options);
};`,
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("operation-failed");
    expect(result.stderr).toContain(
      "earlier completed file replacements, if any, are retained",
    );
    expect(`${result.stdout}${result.stderr}`).not.toContain("synthetic-private-marker");
    expect(result.stdout).toBe("");
    const first = read(root, "docs/user/ja/guide.md");
    expect(first).toContain('status: "draft"');
    expect(first).toContain(`sourceContentHash: "${expectedHash()}"`);
    expect(first).toContain("  reviewed: false");
    const after = snapshot(root);
    for (const relative of Object.keys(before).filter(
      (file) => file !== "docs/user/ja/guide.md",
    )) {
      expect(after[relative]).toBe(before[relative]);
    }
    expect(temporarySiblings(root)).toEqual([]);
  });

  it("preserves an unowned temporary collision without changing selected pages", () => {
    const root = fixture();
    const collision =
      "docs/user/ja/guide.md.rehash-00000000-0000-4000-8000-000000000000.tmp";
    const sentinel = "synthetic-unowned-temporary\n";
    write(root, collision, sentinel);
    const before = snapshot(root);
    const result = runWithPreload(
      root,
      'require("node:crypto").randomUUID = () => "00000000-0000-4000-8000-000000000000";',
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("operation-failed");
    expect(snapshot(root)).toEqual(before);
    expect(read(root, collision)).toBe(sentinel);
    expect(temporarySiblings(root)).toEqual([collision]);
  });

  it("rejects English input drift before replacing any selected translation", () => {
    const root = fixture();
    const before = snapshot(root);
    const english = "docs/user/en/guide.md";
    const changedSource = `${read(root, english)}\nsynthetic-input-drift\n`;
    const result = runWithPreload(
      root,
      String.raw`
const target = path.join(__dirname, "docs/user/en/guide.md");
const nativeRead = fs.readFileSync.bind(fs);
const nativeWrite = fs.writeFileSync.bind(fs);
let reads = 0;
fs.readFileSync = (file, ...args) => {
  if (file === target && ++reads === 2) {
    nativeWrite(target, Buffer.concat([nativeRead(target), Buffer.from("\nsynthetic-input-drift\n")]));
  }
  return nativeRead(file, ...args);
};`,
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("source-changed");
    expect(`${result.stdout}${result.stderr}`).not.toContain("synthetic-input-drift");
    expect(read(root, english)).toBe(changedSource);
    const after = snapshot(root);
    for (const relative of Object.keys(before).filter((file) => file !== english)) {
      expect(after[relative]).toBe(before[relative]);
    }
    expect(temporarySiblings(root)).toEqual([]);
  });

  it("adds missing draft metadata without changing the body or other frontmatter", () => {
    const root = fixture();
    const relative = "docs/user/ja/guide.md";
    const contents = page("ja", "guide").replace(/translation:\n(?: {2}[^\n]*\n)+/, "");
    write(root, relative, contents);
    expect(run(root, ["--slug=guide", "--write"]).status).toBe(0);
    const after = read(root, relative);
    expect(after).toContain(`sourceContentHash: "${expectedHash()}"`);
    expect(after).toContain("  reviewed: false");
    expect(after.replace(/translation:\n(?: {2}[^\n]*\n)+/, "")).toBe(
      contents.replace('status: "reviewed"', 'status: "draft"'),
    );
  });

  it("rejects unknown translation metadata without writing an earlier valid plan", () => {
    const root = fixture();
    write(
      root,
      "docs/user/ko-KR/guide.md",
      page("ko-KR", "guide").replace(
        "  reviewed: true",
        '  reviewed: true\n  unrelated: "synthetic"',
      ),
    );
    const before = snapshot(root);
    const result = run(root, ["--slug=guide", "--write"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("unsupported-translation-metadata");
    expect(snapshot(root)).toEqual(before);
  });

  it.each([
    [{ published: true }, "published-route-needs-separate-decision"],
    [{ includeInNavigation: true }, "invalid-publication-manifest"],
  ])("refuses unsafe publication routing before any selected file is written %#", (routeUpdate, expectedCode) => {
    const root = fixture();
    const manifest = JSON.parse(read(root, "docs/user/publication-manifest.json"));
    Object.assign(manifest.routes[1], routeUpdate);
    write(root, "docs/user/publication-manifest.json", JSON.stringify(manifest));
    const before = snapshot(root);
    const result = run(root, ["--slug=", "--slug=guide", "--write"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(expectedCode);
    expect(snapshot(root)).toEqual(before);
  });

  it.each([
    [],
    ["--write"],
    ["--slug=../outside"],
    ["--slug=guide/../index"],
    ["--slug=guide\\outside"],
    ["--slug=guide", "--slug=guide"],
    ["--slug=guide", "--write", "--dry-run"],
    ["--slug=guide", "--reviewed"],
    ["--slug=missing"],
  ])("rejects ambiguous or non-explicit scope %#", (args) => {
    const root = fixture();
    const before = snapshot(root);
    expect(run(root, args).status).toBe(1);
    expect(snapshot(root)).toEqual(before);
  });

  it("does not write earlier pages when a later frontmatter block is ambiguous", () => {
    const root = fixture();
    write(
      root,
      "docs/user/ko-KR/guide.md",
      page("ko-KR", "guide").replace(
        "  reviewed: true",
        "  reviewed: true\n  reviewed: false",
      ),
    );
    const before = snapshot(root);
    const result = run(root, ["--slug=guide", "--write"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("invalid-frontmatter");
    expect(snapshot(root)).toEqual(before);
  });

  it.each([
    Buffer.from([0xef, 0xbb, 0xbf]),
    Buffer.from([0xff]),
  ])("rejects BOM or invalid UTF-8 before writes %#", (prefix) => {
    const root = fixture();
    write(
      root,
      "docs/user/en/guide.md",
      Buffer.concat([prefix, Buffer.from(page("en", "guide"))]),
    );
    const before = snapshot(root);
    const result = run(root, ["--slug=guide", "--write"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("invalid-docs-encoding");
    expect(snapshot(root)).toEqual(before);
  });

  it("matches an independent media hash oracle and passes draft structural checking", () => {
    const root = fixture();
    const manifest = mediaFixture(root);
    expect(run(root, ["--slug=", "--slug=guide", "--write"]).status).toBe(0);
    const oldHash = expectedMediaHash("Synthetic ja caption", "<svg />\n");
    for (const locale of locales.slice(1)) {
      expect(read(root, `docs/user/${locale}/guide.md`)).toContain(
        `sourceContentHash: "${oldHash}"`,
      );
      write(
        root,
        `docs/user/${locale}/guide.md`,
        page(locale, "guide", { hash: oldHash, media: [manifest.id] }),
      );
    }
    manifest.variants.neutral.caption.ja = "Changed synthetic caption";
    write(root, "docs/user/assets/images/manifest.json", JSON.stringify(manifest));
    expect(run(root, ["--slug=guide", "--write"]).status).toBe(0);
    const changedCaptionHash = expectedMediaHash(
      "Changed synthetic caption",
      "<svg />\n",
    );
    expect(changedCaptionHash).not.toBe(oldHash);
    for (const locale of locales.slice(1)) {
      const contents = read(root, `docs/user/${locale}/guide.md`);
      expect(contents).toContain('status: "draft"');
      expect(contents).toContain(`sourceContentHash: "${changedCaptionHash}"`);
      expect(contents).not.toContain(oldHash);
    }
    // Structural acceptance only: draft pages do not exercise the checker's
    // reviewed sourceContentHash comparison. This is never the working tree.
    const initialized = spawnSync("git", ["init"], { cwd: root, encoding: "utf8" });
    expect(initialized.status).toBe(0);
    const checked = spawnSync(process.execPath, [checker], {
      cwd: root,
      encoding: "utf8",
    });
    expect(checked.status, checked.stderr).toBe(0);
    const changedSvg = "<svg><!-- synthetic change --></svg>\n";
    write(root, manifest.variants.neutral.path, changedSvg);
    expect(run(root, ["--slug=guide", "--write"]).status).toBe(0);
    const changedBytesHash = expectedMediaHash("Changed synthetic caption", changedSvg);
    expect(changedBytesHash).not.toBe(changedCaptionHash);
    for (const locale of locales.slice(1)) {
      expect(read(root, `docs/user/${locale}/guide.md`)).toContain(
        `sourceContentHash: "${changedBytesHash}"`,
      );
    }
  });

  it("rejects asset traversal without exposing its contents", () => {
    const root = fixture();
    const manifest = mediaFixture(root);
    manifest.variants.neutral.path = "docs/user/assets/../../outside.txt";
    write(root, "docs/user/assets/images/manifest.json", JSON.stringify(manifest));
    const before = snapshot(root);
    const result = run(root, ["--slug=guide", "--write"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("invalid-media-metadata");
    expect(snapshot(root)).toEqual(before);
  });

  it("rejects a linked locale directory before reading or writing through it", () => {
    const root = fixture();
    const localePath = path.join(root, "docs/user/ja");
    const outside = path.join(root, "held-locale");
    fs.renameSync(localePath, outside);
    fs.symlinkSync(
      outside,
      localePath,
      process.platform === "win32" ? "junction" : "dir",
    );
    const before = read(root, "held-locale/guide.md");
    const result = run(root, ["--slug=guide", "--write"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("linked-docs-path");
    expect(read(root, "held-locale/guide.md")).toBe(before);
  });
});
