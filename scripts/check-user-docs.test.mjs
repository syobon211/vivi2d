import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const checker = path.resolve("scripts/check-user-docs.mjs");
const tempRoots = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { force: true, recursive: true });
  }
});

function makeTempRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vivi-user-docs-"));
  tempRoots.push(root);
  const result = spawnSync("git", ["init"], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return root;
}

function writeFile(root, relativePath, contents) {
  const file = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
}

function frontmatter({
  title,
  description = "Short user documentation page.",
  locale,
  slug,
  status = "draft",
  body = "# Page\n",
  extra = "",
}) {
  return `---
title: "${title}"
description: "${description}"
locale: "${locale}"
slug: "${slug}"
status: "${status}"
${extra}---
${body}`;
}

function writeRootSelector(root, status = "draft") {
  writeFile(
    root,
    "docs/user/index.md",
    `---
title: "Vivi2D User Docs"
description: "Choose a language."
locale: "en"
slug: ""
status: "${status}"
routeKind: "locale-selector"
noIndex: true
---
# Vivi2D User Docs
`,
  );
}

function writeLocalePages(root, options = {}) {
  const pageOptions = {
    en: {},
    ja: {},
    "zh-Hans": {},
    "ko-KR": {},
    ...(options.pages ?? {}),
  };
  for (const locale of ["en", "ja", "zh-Hans", "ko-KR"]) {
    const override = pageOptions[locale] ?? {};
    writeFile(
      root,
      `docs/user/${locale}/index.md`,
      frontmatter({
        title: override.title ?? `Home ${locale}`,
        locale,
        slug: override.slug ?? "",
        status: override.status ?? "draft",
        extra: override.extra ?? "",
        body: override.body ?? "# Home\n",
      }),
    );
  }
}

function writePublicationManifest(root, routes = [{ slug: "", published: false }]) {
  writeFile(
    root,
    "docs/user/publication-manifest.json",
    `${JSON.stringify(
      {
        locales: ["en", "ja", "zh-Hans", "ko-KR"],
        routes: routes.map((route) => ({
          slug: route.slug,
          published: route.published,
          includeInNavigation: route.includeInNavigation ?? false,
          includeInSearch: route.includeInSearch ?? false,
        })),
      },
      null,
      2,
    )}\n`,
  );
}

function writeReviewOwnership(root, overrides = {}) {
  writeFile(
    root,
    "docs/user/review-ownership.json",
    `${JSON.stringify(
      {
        locales: {
          ja: ["docs-ja-reviewer"],
          "zh-Hans": ["docs-zh-hans-reviewer"],
          "ko-KR": ["docs-ko-reviewer"],
          ...(overrides.locales ?? {}),
        },
        media: {
          reviewers: ["docs-media-reviewer"],
          ...(overrides.media ?? {}),
        },
      },
      null,
      2,
    )}\n`,
  );
}

function writeComfyUiSourceRecord(root, overrides = {}) {
  writeFile(
    root,
    "docs/developer/quality/comfyui-plugin-source-record.json",
    `${JSON.stringify(
      {
        schemaVersion: 1,
        status: "reviewed",
        compatPlugin: {
          installDirectory: "vivi2d_compat_plugin",
          sourceLocation: "https://example.invalid/vivi2d_compat_plugin-0.1.0.zip",
          version: "0.1.0",
          sha256:
            "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          signature: null,
          licenseSpdx: "MIT",
          supportedVivi2DBuildRange: ">=0.0.0 <1.0.0",
          reviewed: true,
          ...(overrides.compatPlugin ?? {}),
        },
        seeThrough: {
          upstreamRepo: "jtydhr88/ComfyUI-See-through",
          testedTagOrCommit: "v1.0.0",
          thirdPartyNotice:
            "ComfyUI-See-through is a third-party ComfyUI custom-node plugin.",
          reviewed: true,
          ...(overrides.seeThrough ?? {}),
        },
        ...overrides.root,
      },
      null,
      2,
    )}\n`,
  );
}

function writeMediaManifest(root, id, overrides = {}) {
  const safeName = id.replaceAll(".", "-");
  const assetPath = `docs/user/assets/images/${safeName}.neutral.svg`;
  writeFile(root, assetPath, "<svg />\n");
  writeFile(
    root,
    `docs/user/assets/images/${safeName}/manifest.json`,
    `${JSON.stringify(
      {
        id,
        kind: "image",
        status: "placeholder",
        topicSlugs: [""],
        variants: {
          neutral: {
            path: assetPath,
            alt: {
              en: "English alt",
              ja: "Japanese alt",
              "zh-Hans": "Chinese alt",
              "ko-KR": "Korean alt",
            },
            caption: {
              en: "English caption",
              ja: "Japanese caption",
              "zh-Hans": "Chinese caption",
              "ko-KR": "Korean caption",
            },
          },
        },
        ...overrides,
      },
      null,
      2,
    )}\n`,
  );
}

function writeBaselineDocs(root) {
  writeRootSelector(root);
  writeLocalePages(root);
  writePublicationManifest(root);
  writeReviewOwnership(root);
}

function sourceContentHash({
  title,
  description = "Short user documentation page.",
  media,
  mediaMetadata,
  body,
}) {
  const fields = { description, title };
  if (media !== undefined) fields.media = media;
  if (mediaMetadata !== undefined) {
    fields.mediaMetadata = mediaMetadata;
  } else if (media !== undefined) {
    fields.mediaMetadata = media.map((id) => defaultMediaSourceRecord(id));
  }
  const payload = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${JSON.stringify(fields[key])}`)
    .join("\n");
  const digest = crypto
    .createHash("sha256")
    .update(`${payload}\n\n${body.replace(/\r\n?/g, "\n")}`, "utf8")
    .digest("hex");
  return `sha256:v1:${digest}`;
}

function sha256Text(contents) {
  const digest = crypto.createHash("sha256").update(contents).digest("hex");
  return `sha256:v1:${digest}`;
}

function defaultMediaSourceRecord(id, overrides = {}) {
  const safeName = id.replaceAll(".", "-");
  return {
    id,
    kind: "image",
    status: "placeholder",
    topicSlugs: [""],
    variants: {
      neutral: {
        fileSha256: sha256Text("<svg />\n"),
        path: `docs/user/assets/images/${safeName}.neutral.svg`,
        alt: {
          en: "English alt",
          ja: "Japanese alt",
          "zh-Hans": "Chinese alt",
          "ko-KR": "Korean alt",
        },
        caption: {
          en: "English caption",
          ja: "Japanese caption",
          "zh-Hans": "Chinese caption",
          "ko-KR": "Korean caption",
        },
        captions: null,
        transcript: null,
      },
    },
    ...overrides,
  };
}

function runChecker(root, args = []) {
  return spawnSync(process.execPath, [checker, ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

function outputOf(result) {
  return `${result.stdout}\n${result.stderr}`;
}

function writeReviewedComfyUiReleaseDocs(root) {
  writeRootSelector(root, "reviewed");
  const homeBody = "# Home\n";
  const comfyBody = "# ComfyUI\n";
  const homeHash = sourceContentHash({ title: "Home en", body: homeBody });
  const comfyHash = sourceContentHash({ title: "ComfyUI en", body: comfyBody });
  const translationExtra = ({ hash, reviewer, sourceSlug }) => `translation:
  sourceLocale: "en"
  sourceSlug: "${sourceSlug}"
  sourceContentHash: "${hash}"
  reviewed: true
  reviewerHandle: "${reviewer}"
  reviewDate: "2026-05-22"
`;

  writeLocalePages(root, {
    pages: {
      en: { title: "Home en", status: "reviewed", body: homeBody },
      ja: {
        title: "Home ja",
        status: "reviewed",
        body: "# Home ja\n",
        extra: translationExtra({
          hash: homeHash,
          reviewer: "docs-ja-reviewer",
          sourceSlug: "",
        }),
      },
      "zh-Hans": {
        title: "Home zh",
        status: "reviewed",
        body: "# Home zh\n",
        extra: translationExtra({
          hash: homeHash,
          reviewer: "docs-zh-hans-reviewer",
          sourceSlug: "",
        }),
      },
      "ko-KR": {
        title: "Home ko",
        status: "reviewed",
        body: "# Home ko\n",
        extra: translationExtra({
          hash: homeHash,
          reviewer: "docs-ko-reviewer",
          sourceSlug: "",
        }),
      },
    },
  });

  for (const [locale, title, reviewer] of [
    ["en", "ComfyUI en", null],
    ["ja", "ComfyUI ja", "docs-ja-reviewer"],
    ["zh-Hans", "ComfyUI zh", "docs-zh-hans-reviewer"],
    ["ko-KR", "ComfyUI ko", "docs-ko-reviewer"],
  ]) {
    writeFile(
      root,
      `docs/user/${locale}/integrations/comfyui.md`,
      frontmatter({
        title,
        locale,
        slug: "integrations/comfyui",
        status: "reviewed",
        body: locale === "en" ? comfyBody : `# ${title}\n`,
        extra:
          locale === "en"
            ? ""
            : translationExtra({
                hash: comfyHash,
                reviewer,
                sourceSlug: "integrations/comfyui",
              }),
      }),
    );
  }

  writePublicationManifest(root, [
    { slug: "", published: true },
    { slug: "integrations/comfyui", published: true },
  ]);
  writeReviewOwnership(root);
}

describe("check-user-docs", () => {
  it("accepts a complete draft locale matrix with explicit unpublished routes", () => {
    const root = makeTempRepo();
    writeBaselineDocs(root);

    const result = runChecker(root);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("[user-docs] passed");
  });

  it("rejects a missing publication-manifest route entry", () => {
    const root = makeTempRepo();
    writeRootSelector(root);
    writeLocalePages(root, {
      pages: {
        en: { slug: "", body: "# Home\n" },
      },
    });
    for (const locale of ["en", "ja", "zh-Hans", "ko-KR"]) {
      writeFile(
        root,
        `docs/user/${locale}/workflows/auto-setup.md`,
        frontmatter({
          title: `Auto Setup ${locale}`,
          locale,
          slug: "workflows/auto-setup",
          body: "# Auto Setup\n",
        }),
      );
    }
    writePublicationManifest(root, [{ slug: "", published: false }]);

    const result = runChecker(root);

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain(
      "missing explicit route entry for slug workflows/auto-setup",
    );
  });

  it("rejects a publication-manifest route without an English source page", () => {
    const root = makeTempRepo();
    writeBaselineDocs(root);
    writePublicationManifest(root, [
      { slug: "", published: false },
      { slug: "workflows/missing-page", published: false },
    ]);

    const result = runChecker(root);

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain(
      "route slug has no English source page: workflows/missing-page",
    );
  });

  it("rejects committed stub pages in the default gate", () => {
    const root = makeTempRepo();
    writeRootSelector(root);
    writeLocalePages(root, {
      pages: {
        en: { status: "stub" },
      },
    });
    writePublicationManifest(root);

    const result = runChecker(root);

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain("status stub blocks user docs checks");
  });

  it("rejects invalid UTF-8 in user doc markdown", () => {
    const root = makeTempRepo();
    writeRootSelector(root);
    writeLocalePages(root);
    fs.writeFileSync(path.join(root, "docs/user/en/index.md"), Buffer.from([0xff]));
    writePublicationManifest(root);

    const result = runChecker(root);

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain("invalid UTF-8 byte sequence");
  });

  it("reports malformed frontmatter arrays without crashing", () => {
    const root = makeTempRepo();
    writeRootSelector(root);
    writeLocalePages(root, {
      pages: {
        en: { extra: "audience: [artist, rigger]\n" },
      },
    });
    writePublicationManifest(root);

    const result = runChecker(root);

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain("malformed JSON array in frontmatter audience");
    expect(outputOf(result)).not.toContain("SyntaxError");
  });

  it("requires reviewed translations to bind to the current English source hash", () => {
    const root = makeTempRepo();
    writeRootSelector(root);
    writeLocalePages(root, {
      pages: {
        ja: {
          status: "reviewed",
          extra: `translation:
  sourceLocale: "en"
  sourceSlug: ""
  reviewed: true
  reviewerHandle: "docs-ja-reviewer"
  reviewDate: "2026-05-22"
`,
        },
      },
    });
    writePublicationManifest(root);

    const result = runChecker(root);

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain(
      "translation.sourceContentHash is required for reviewed pages",
    );
  });

  it("rejects publication-manifest routes that publish draft pages", () => {
    const root = makeTempRepo();
    writeRootSelector(root);
    writeLocalePages(root);
    writePublicationManifest(root, [{ slug: "", published: true }]);

    const result = runChecker(root);

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain("published route must use status reviewed");
  });

  it("rejects reviewed translations when the English body changes", () => {
    const root = makeTempRepo();
    writeRootSelector(root);
    const originalBody = "# Home\n\nOpen your first project.\n";
    writeLocalePages(root, {
      pages: {
        en: { title: "Home en", body: originalBody },
        ja: {
          status: "reviewed",
          body: "# ホーム\n",
          extra: `translation:
  sourceLocale: "en"
  sourceSlug: ""
  sourceContentHash: "${sourceContentHash({
    title: "Home en",
    body: originalBody,
  })}"
  reviewed: true
  reviewerHandle: "docs-ja-reviewer"
  reviewDate: "2026-05-22"
`,
        },
      },
    });
    writePublicationManifest(root);
    writeReviewOwnership(root);

    expect(runChecker(root).status).toBe(0);

    writeLocalePages(root, {
      pages: {
        en: { title: "Home en", body: "# Home\n\nOpen a different project.\n" },
        ja: {
          status: "reviewed",
          body: "# ホーム\n",
          extra: `translation:
  sourceLocale: "en"
  sourceSlug: ""
  sourceContentHash: "${sourceContentHash({
    title: "Home en",
    body: originalBody,
  })}"
  reviewed: true
  reviewerHandle: "docs-ja-reviewer"
  reviewDate: "2026-05-22"
`,
        },
      },
    });

    const result = runChecker(root);

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain(
      "translation.sourceContentHash does not match current English source",
    );
  });

  it("rejects reviewed translations when the English media list changes", () => {
    const root = makeTempRepo();
    writeRootSelector(root);
    writeMediaManifest(root, "getting-started.first-project");
    writeMediaManifest(root, "getting-started.changed-project");
    const originalBody = "# Home\n\nOpen your first project.\n";
    writeLocalePages(root, {
      pages: {
        en: {
          title: "Home en",
          body: originalBody,
          extra: `media:
  - "getting-started.first-project"
`,
        },
        ja: {
          status: "reviewed",
          body: "# ホーム\n",
          extra: `translation:
  sourceLocale: "en"
  sourceSlug: ""
  sourceContentHash: "${sourceContentHash({
    title: "Home en",
    media: ["getting-started.first-project"],
    body: originalBody,
  })}"
  reviewed: true
  reviewerHandle: "docs-ja-reviewer"
  reviewDate: "2026-05-22"
`,
        },
      },
    });
    writePublicationManifest(root);
    writeReviewOwnership(root);

    expect(runChecker(root).status).toBe(0);

    writeLocalePages(root, {
      pages: {
        en: {
          title: "Home en",
          body: originalBody,
          extra: `media:
  - "getting-started.changed-project"
`,
        },
        ja: {
          status: "reviewed",
          body: "# ホーム\n",
          extra: `translation:
  sourceLocale: "en"
  sourceSlug: ""
  sourceContentHash: "${sourceContentHash({
    title: "Home en",
    media: ["getting-started.first-project"],
    body: originalBody,
  })}"
  reviewed: true
  reviewerHandle: "docs-ja-reviewer"
  reviewDate: "2026-05-22"
`,
        },
      },
    });

    const result = runChecker(root);

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain(
      "translation.sourceContentHash does not match current English source",
    );
  });

  it("accepts reviewed translations that include both media and translation frontmatter blocks", () => {
    const root = makeTempRepo();
    writeRootSelector(root);
    writeMediaManifest(root, "getting-started.first-project");
    const body = "# Home\n\nOpen your first project.\n";
    const mediaExtra = `media:
  - "getting-started.first-project"
`;
    const hash = sourceContentHash({
      title: "Home en",
      media: ["getting-started.first-project"],
      body,
    });
    writeLocalePages(root, {
      pages: {
        en: {
          title: "Home en",
          body,
          extra: mediaExtra,
        },
        ja: {
          title: "Home ja",
          status: "reviewed",
          body: "# Home ja\n",
          extra: `${mediaExtra}translation:
  sourceLocale: "en"
  sourceSlug: ""
  sourceContentHash: "${hash}"
  reviewed: true
  reviewerHandle: "docs-ja-reviewer"
  reviewDate: "2026-05-22"
`,
        },
      },
    });
    writePublicationManifest(root);
    writeReviewOwnership(root);

    const result = runChecker(root);

    expect(result.status).toBe(0);
  });

  it("rejects reviewed translations when English media alt text changes", () => {
    const root = makeTempRepo();
    writeRootSelector(root);
    writeMediaManifest(root, "getting-started.first-project");
    const body = "# Home\n\nOpen your first project.\n";
    writeLocalePages(root, {
      pages: {
        en: {
          title: "Home en",
          body,
          extra: `media:
  - "getting-started.first-project"
`,
        },
        ja: {
          status: "reviewed",
          body: "# ホーム\n",
          extra: `translation:
  sourceLocale: "en"
  sourceSlug: ""
  sourceContentHash: "${sourceContentHash({
    title: "Home en",
    media: ["getting-started.first-project"],
    body,
  })}"
  reviewed: true
  reviewerHandle: "docs-ja-reviewer"
  reviewDate: "2026-05-22"
`,
        },
      },
    });
    writePublicationManifest(root);
    writeReviewOwnership(root);

    expect(runChecker(root).status).toBe(0);

    writeMediaManifest(root, "getting-started.first-project", {
      variants: {
        neutral: {
          path: "docs/user/assets/images/getting-started-first-project.neutral.svg",
          alt: {
            en: "Updated English alt",
            ja: "Japanese alt",
            "zh-Hans": "Chinese alt",
            "ko-KR": "Korean alt",
          },
          caption: {
            en: "English caption",
            ja: "Japanese caption",
            "zh-Hans": "Chinese caption",
            "ko-KR": "Korean caption",
          },
        },
      },
    });

    const result = runChecker(root);

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain(
      "translation.sourceContentHash does not match current English source",
    );
  });

  it("rejects reviewed translations when localized media alt text changes", () => {
    const root = makeTempRepo();
    writeRootSelector(root);
    writeMediaManifest(root, "getting-started.first-project");
    const body = "# Home\n\nOpen your first project.\n";
    writeLocalePages(root, {
      pages: {
        en: {
          title: "Home en",
          body,
          extra: `media:
  - "getting-started.first-project"
`,
        },
        ja: {
          status: "reviewed",
          body: "# Home ja\n",
          extra: `translation:
  sourceLocale: "en"
  sourceSlug: ""
  sourceContentHash: "${sourceContentHash({
    title: "Home en",
    media: ["getting-started.first-project"],
    body,
  })}"
  reviewed: true
  reviewerHandle: "docs-ja-reviewer"
  reviewDate: "2026-05-22"
`,
        },
      },
    });
    writePublicationManifest(root);
    writeReviewOwnership(root);

    expect(runChecker(root).status).toBe(0);

    writeMediaManifest(root, "getting-started.first-project", {
      variants: {
        neutral: {
          path: "docs/user/assets/images/getting-started-first-project.neutral.svg",
          alt: {
            en: "English alt",
            ja: "Updated Japanese alt",
            "zh-Hans": "Chinese alt",
            "ko-KR": "Korean alt",
          },
          caption: {
            en: "English caption",
            ja: "Japanese caption",
            "zh-Hans": "Chinese caption",
            "ko-KR": "Korean caption",
          },
        },
      },
    });

    const result = runChecker(root);

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain(
      "translation.sourceContentHash does not match current English source",
    );
  });

  it("rejects reviewed translations when English media file bytes change", () => {
    const root = makeTempRepo();
    writeRootSelector(root);
    writeMediaManifest(root, "getting-started.first-project");
    const body = "# Home\n\nOpen your first project.\n";
    writeLocalePages(root, {
      pages: {
        en: {
          title: "Home en",
          body,
          extra: `media:
  - "getting-started.first-project"
`,
        },
        ja: {
          status: "reviewed",
          body: "# Home ja\n",
          extra: `translation:
  sourceLocale: "en"
  sourceSlug: ""
  sourceContentHash: "${sourceContentHash({
    title: "Home en",
    media: ["getting-started.first-project"],
    body,
  })}"
  reviewed: true
  reviewerHandle: "docs-ja-reviewer"
  reviewDate: "2026-05-22"
`,
        },
      },
    });
    writePublicationManifest(root);
    writeReviewOwnership(root);

    expect(runChecker(root).status).toBe(0);

    writeFile(
      root,
      "docs/user/assets/images/getting-started-first-project.neutral.svg",
      "<svg><text>Updated screenshot placeholder</text></svg>\n",
    );

    const result = runChecker(root);

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain(
      "translation.sourceContentHash does not match current English source",
    );
  });

  it("rejects draft media on published release-candidate routes", () => {
    const root = makeTempRepo();
    writeRootSelector(root, "reviewed");
    writeMediaManifest(root, "getting-started.first-project", {
      status: "draft",
    });
    const body = "# Home\n\nOpen your first project.\n";
    const extra = `media:
  - "getting-started.first-project"
`;
    const hash = sourceContentHash({
      title: "Home en",
      media: ["getting-started.first-project"],
      mediaMetadata: [
        defaultMediaSourceRecord("getting-started.first-project", { status: "draft" }),
      ],
      body,
    });
    writeLocalePages(root, {
      pages: {
        en: { title: "Home en", status: "reviewed", body, extra },
        ja: {
          title: "Home ja",
          status: "reviewed",
          body: "# Home ja\n",
          extra: `${extra}translation:
  sourceLocale: "en"
  sourceSlug: ""
  sourceContentHash: "${hash}"
  reviewed: true
  reviewerHandle: "docs-ja-reviewer"
  reviewDate: "2026-05-22"
`,
        },
        "zh-Hans": {
          title: "Home zh",
          status: "reviewed",
          body: "# Home zh\n",
          extra: `${extra}translation:
  sourceLocale: "en"
  sourceSlug: ""
  sourceContentHash: "${hash}"
  reviewed: true
  reviewerHandle: "docs-zh-hans-reviewer"
  reviewDate: "2026-05-22"
`,
        },
        "ko-KR": {
          title: "Home ko",
          status: "reviewed",
          body: "# Home ko\n",
          extra: `${extra}translation:
  sourceLocale: "en"
  sourceSlug: ""
  sourceContentHash: "${hash}"
  reviewed: true
  reviewerHandle: "docs-ko-reviewer"
  reviewDate: "2026-05-22"
`,
        },
      },
    });
    writePublicationManifest(root, [{ slug: "", published: true }]);
    writeReviewOwnership(root);

    const result = runChecker(root, ["--release-candidate"]);

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain(
      "published release-candidate route references non-reviewed media",
    );
  });

  it("requires release-candidate translation reviewers to be locale owners", () => {
    const root = makeTempRepo();
    writeRootSelector(root, "reviewed");
    const body = "# Home\n";
    writeLocalePages(root, {
      pages: {
        en: { title: "Home en", status: "reviewed", body },
        ja: {
          title: "Home ja",
          status: "reviewed",
          body: "# ホーム\n",
          extra: `translation:
  sourceLocale: "en"
  sourceSlug: ""
  sourceContentHash: "${sourceContentHash({ title: "Home en", body })}"
  reviewed: true
  reviewerHandle: "unknown-reviewer"
  reviewDate: "2026-05-22"
`,
        },
        "zh-Hans": { status: "reviewed" },
        "ko-KR": { status: "reviewed" },
      },
    });
    writePublicationManifest(root);
    writeReviewOwnership(root);

    const result = runChecker(root, ["--release-candidate"]);

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain(
      "translation.reviewerHandle is not authorized for locale ja",
    );
  });

  it("requires default-gate reviewed translations to use locale owners when registry exists", () => {
    const root = makeTempRepo();
    writeRootSelector(root);
    const body = "# Home\n";
    writeLocalePages(root, {
      pages: {
        en: { title: "Home en", body },
        ja: {
          title: "Home ja",
          status: "reviewed",
          body: "# Home ja\n",
          extra: `translation:
  sourceLocale: "en"
  sourceSlug: ""
  sourceContentHash: "${sourceContentHash({ title: "Home en", body })}"
  reviewed: true
  reviewerHandle: "unknown-reviewer"
  reviewDate: "2026-05-22"
`,
        },
      },
    });
    writePublicationManifest(root);
    writeReviewOwnership(root);

    const result = runChecker(root);

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain(
      "translation.reviewerHandle is not authorized for locale ja",
    );
  });

  it("requires a reviewer registry when reviewed translations exist in default mode", () => {
    const root = makeTempRepo();
    writeRootSelector(root);
    const body = "# Home\n";
    writeLocalePages(root, {
      pages: {
        en: { title: "Home en", body },
        ja: {
          title: "Home ja",
          status: "reviewed",
          body: "# Home ja\n",
          extra: `translation:
  sourceLocale: "en"
  sourceSlug: ""
  sourceContentHash: "${sourceContentHash({ title: "Home en", body })}"
  reviewed: true
  reviewerHandle: "docs-ja-reviewer"
  reviewDate: "2026-05-22"
`,
        },
      },
    });
    writePublicationManifest(root);

    const result = runChecker(root);

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain("reviewer registry is required");
  });

  it("requires a reviewer registry in release-candidate mode", () => {
    const root = makeTempRepo();
    writeRootSelector(root, "reviewed");
    writeLocalePages(root, {
      pages: {
        en: { status: "reviewed" },
        ja: { status: "reviewed" },
        "zh-Hans": { status: "reviewed" },
        "ko-KR": { status: "reviewed" },
      },
    });
    writePublicationManifest(root);

    const result = runChecker(root, ["--release-candidate"]);

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain("reviewer registry is required");
  });

  it("requires release-candidate reviewed media to use an authorized reviewer", () => {
    const root = makeTempRepo();
    writeRootSelector(root);
    writeLocalePages(root);
    writePublicationManifest(root);
    writeReviewOwnership(root);
    writeMediaManifest(root, "getting-started.first-project", {
      status: "reviewed",
      review: {
        reviewerHandle: "unknown-reviewer",
        reviewDate: "2026-05-22",
      },
    });

    const result = runChecker(root, ["--release-candidate"]);

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain(
      "review.reviewerHandle is not authorized for media review",
    );
  });

  it("requires a reviewer registry when reviewed media exists in default mode", () => {
    const root = makeTempRepo();
    writeRootSelector(root);
    writeLocalePages(root);
    writePublicationManifest(root);
    writeMediaManifest(root, "getting-started.first-project", {
      status: "reviewed",
      review: {
        reviewerHandle: "docs-media-reviewer",
        reviewDate: "2026-05-22",
      },
    });

    const result = runChecker(root);

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain("reviewer registry is required");
  });

  it("rejects reviewed video media until localized captions and poster schema are enforced", () => {
    const root = makeTempRepo();
    writeRootSelector(root);
    writeLocalePages(root);
    writePublicationManifest(root);
    writeReviewOwnership(root);
    writeMediaManifest(root, "workflows.lasso-video", {
      kind: "video",
      status: "reviewed",
      review: {
        reviewerHandle: "docs-media-reviewer",
        reviewDate: "2026-05-22",
      },
      variants: {
        neutral: {
          path: "docs/user/assets/images/workflows-lasso-video.neutral.svg",
          alt: {
            en: "English alt",
            ja: "Japanese alt",
            "zh-Hans": "Chinese alt",
            "ko-KR": "Korean alt",
          },
          caption: {
            en: "English caption",
            ja: "Japanese caption",
            "zh-Hans": "Chinese caption",
            "ko-KR": "Korean caption",
          },
          transcript: {
            en: "English transcript",
            ja: "Japanese transcript",
            "zh-Hans": "Chinese transcript",
            "ko-KR": "Korean transcript",
          },
        },
      },
    });

    const result = runChecker(root);

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain("reviewed video media is blocked");
  });

  it("rejects reviewer ownership when media and locale reviewers overlap", () => {
    const root = makeTempRepo();
    writeRootSelector(root);
    writeLocalePages(root);
    writePublicationManifest(root);
    writeReviewOwnership(root, {
      locales: {
        ja: ["docs-media-reviewer"],
      },
    });

    const result = runChecker(root);

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain(
      "cannot be both a media reviewer and ja locale reviewer",
    );
  });

  it("rejects media manifests without localized alt and caption text", () => {
    const root = makeTempRepo();
    writeRootSelector(root);
    writeLocalePages(root, {
      pages: {
        en: {
          extra: `media:
  - "getting-started.first-project"
`,
        },
      },
    });
    writePublicationManifest(root);
    writeFile(
      root,
      "docs/user/assets/images/getting-started/first-project.neutral.svg",
      "<svg />\n",
    );
    writeFile(
      root,
      "docs/user/assets/images/getting-started/manifest.json",
      JSON.stringify(
        {
          id: "getting-started.first-project",
          kind: "image",
          status: "placeholder",
          topicSlugs: ["getting-started/open-your-first-project"],
          variants: {
            neutral: {
              path: "docs/user/assets/images/getting-started/first-project.neutral.svg",
              alt: { en: "English alt", ja: "Japanese alt", "zh-Hans": "Chinese alt" },
              caption: {
                en: "English caption",
                ja: "Japanese caption",
                "zh-Hans": "Chinese caption",
              },
            },
          },
        },
        null,
        2,
      ),
    );

    const result = runChecker(root);

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain("variant neutral alt.ko-KR is required");
    expect(outputOf(result)).toContain("variant neutral caption.ko-KR is required");
  });

  it("rejects page media references outside manifest topicSlugs", () => {
    const root = makeTempRepo();
    writeRootSelector(root);
    writeMediaManifest(root, "getting-started.first-project", {
      topicSlugs: ["faq"],
    });
    writeLocalePages(root, {
      pages: {
        en: {
          extra: `media:
  - "getting-started.first-project"
`,
        },
      },
    });
    for (const locale of ["en", "ja", "zh-Hans", "ko-KR"]) {
      writeFile(
        root,
        `docs/user/${locale}/faq.md`,
        frontmatter({
          title: `FAQ ${locale}`,
          locale,
          slug: "faq",
          body: "# FAQ\n",
        }),
      );
    }
    writePublicationManifest(root, [
      { slug: "", published: false },
      { slug: "faq", published: false },
    ]);
    writeReviewOwnership(root);

    const result = runChecker(root);

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain(
      "media id getting-started.first-project is not allowed for slug <index>",
    );
  });

  it("rejects manifest topicSlugs without matching routes", () => {
    const root = makeTempRepo();
    writeRootSelector(root);
    writeLocalePages(root);
    writePublicationManifest(root);
    writeReviewOwnership(root);
    writeMediaManifest(root, "getting-started.first-project", {
      topicSlugs: ["missing-route"],
    });

    const result = runChecker(root);

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain(
      "topicSlug missing-route has no matching user-doc route",
    );
  });

  it("rejects a published ComfyUI route without a complete source record", () => {
    const root = makeTempRepo();
    writeReviewedComfyUiReleaseDocs(root);

    const result = runChecker(root, ["--release-candidate"]);

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain(
      "complete ComfyUI compat plugin source record is required for published integrations/comfyui route",
    );
  });

  it("accepts a published ComfyUI route with a reviewed source record", () => {
    const root = makeTempRepo();
    writeReviewedComfyUiReleaseDocs(root);
    writeComfyUiSourceRecord(root);

    const result = runChecker(root, ["--release-candidate"]);

    expect(result.status).toBe(0);
  });

  it("rejects a published ComfyUI route with an incomplete source record", () => {
    const root = makeTempRepo();
    writeReviewedComfyUiReleaseDocs(root);
    writeComfyUiSourceRecord(root, {
      compatPlugin: {
        sha256: null,
        signature: null,
      },
    });

    const result = runChecker(root, ["--release-candidate"]);

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain(
      "compatPlugin.sha256 or compatPlugin.signature is required",
    );
  });

  it("rejects reviewed translations when media topicSlugs change", () => {
    const root = makeTempRepo();
    writeRootSelector(root);
    writeMediaManifest(root, "getting-started.first-project");
    const body = "# Home\n\nOpen your first project.\n";
    const mediaExtra = `media:
  - "getting-started.first-project"
`;
    writeLocalePages(root, {
      pages: {
        en: {
          title: "Home en",
          body,
          extra: mediaExtra,
        },
        ja: {
          title: "Home ja",
          status: "reviewed",
          body: "# Home ja\n",
          extra: `${mediaExtra}translation:
  sourceLocale: "en"
  sourceSlug: ""
  sourceContentHash: "${sourceContentHash({
    title: "Home en",
    media: ["getting-started.first-project"],
    body,
  })}"
  reviewed: true
  reviewerHandle: "docs-ja-reviewer"
  reviewDate: "2026-05-22"
`,
        },
      },
    });
    writePublicationManifest(root);
    writeReviewOwnership(root);

    expect(runChecker(root).status).toBe(0);

    writeFile(
      root,
      "docs/user/ja/faq.md",
      frontmatter({ title: "FAQ ja", locale: "ja", slug: "faq", body: "# FAQ\n" }),
    );
    writeFile(
      root,
      "docs/user/en/faq.md",
      frontmatter({ title: "FAQ en", locale: "en", slug: "faq", body: "# FAQ\n" }),
    );
    writeFile(
      root,
      "docs/user/zh-Hans/faq.md",
      frontmatter({
        title: "FAQ zh",
        locale: "zh-Hans",
        slug: "faq",
        body: "# FAQ\n",
      }),
    );
    writeFile(
      root,
      "docs/user/ko-KR/faq.md",
      frontmatter({
        title: "FAQ ko",
        locale: "ko-KR",
        slug: "faq",
        body: "# FAQ\n",
      }),
    );
    writePublicationManifest(root, [
      { slug: "", published: false },
      { slug: "faq", published: false },
    ]);
    writeMediaManifest(root, "getting-started.first-project", {
      topicSlugs: ["", "faq"],
    });

    const result = runChecker(root);

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain(
      "translation.sourceContentHash does not match current English source",
    );
  });

  it("rejects media variant paths outside docs/user/assets", () => {
    const root = makeTempRepo();
    writeRootSelector(root);
    writeLocalePages(root);
    writePublicationManifest(root);
    writeFile(root, "docs/user/outside.svg", "<svg />\n");
    writeMediaManifest(root, "getting-started.first-project", {
      variants: {
        neutral: {
          path: "docs/user/assets/../outside.svg",
          alt: {
            en: "English alt",
            ja: "Japanese alt",
            "zh-Hans": "Chinese alt",
            "ko-KR": "Korean alt",
          },
          caption: {
            en: "English caption",
            ja: "Japanese caption",
            "zh-Hans": "Chinese caption",
            "ko-KR": "Korean caption",
          },
        },
      },
    });

    const result = runChecker(root);

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain("path must stay under docs/user/assets/");
  });
});
