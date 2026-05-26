import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const checker = path.resolve("scripts/check-docs-architecture.mjs");
const tempRoots = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { force: true, recursive: true });
  }
});

function runGit(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout;
}

function makeTempRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vivi-docs-architecture-"));
  tempRoots.push(root);
  runGit(root, ["init"]);
  runGit(root, ["config", "user.email", "docs@example.invalid"]);
  runGit(root, ["config", "user.name", "Docs Test"]);
  return root;
}

function writeFile(root, relativePath, contents) {
  const file = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
}

function minimalCodeowners(extra = "") {
  return `* @xltt
/docs/user/ @xltt
${extra}/docs/user/review-ownership.json @xltt
`;
}

function writeRequiredDocs(root, codeownersExtra = "") {
  for (const file of [
    "docs/developer/contributing/task-guides/index.md",
    "docs/developer/contributing/task-guides/viewer-api.md",
    "docs/developer/contributing/task-guides/auto-setup.md",
    "docs/developer/contributing/task-guides/i18n.md",
    "docs/developer/contributing/task-guides/sdk-samples.md",
    "docs/developer/contributing/pr-recipes.md",
    "docs/developer/contributing/troubleshooting.md",
    "docs/developer/architecture/system-map.md",
    "docs/developer/architecture/user-docs-site.md",
    "docs/developer/architecture/user-docs-content-production.md",
    "docs/developer/architecture/user-docs-media-production.md",
    "docs/developer/adr/0005-documentation-contributor-guides.md",
    "docs/developer/adr/0006-public-surface-review-gates.md",
    "docs/developer/api/web-sdk.md",
    "docs/developer/api/viewer-api.md",
    "docs/developer/api/provider-sdk.md",
  ]) {
    writeFile(root, file, "# Required doc\n");
  }
  writeFile(
    root,
    "docs/developer/index.md",
    [
      "contributing/task-guides/",
      "contributing/pr-recipes.md",
      "contributing/troubleshooting.md",
      "architecture/system-map.md",
      "architecture/user-docs-site.md",
      "architecture/user-docs-content-production.md",
      "architecture/user-docs-media-production.md",
      "adr/0005-documentation-contributor-guides.md",
      "adr/0006-public-surface-review-gates.md",
    ].join("\n"),
  );
  writeFile(
    root,
    "docs/developer/quality/docs-migration-manifest.json",
    JSON.stringify({
      archivedFiles: [
        {
          source: "docs/old-roadmap.md",
          archivedToIgnoredBacklog: "docs/backlog/2026-05/old-roadmap.md",
          promotedTargets: ["docs/developer/architecture/user-docs-site.md"],
          droppedSections: [],
          reviewedBy: "@xltt",
          reviewDate: "2026-05-23",
        },
      ],
    }),
  );
  writeFile(root, ".github/CODEOWNERS", minimalCodeowners(codeownersExtra));
  writeFile(
    root,
    ".github/docs-maintainers.json",
    JSON.stringify({ reviewOwnershipOwners: ["@xltt"] }),
  );
  writeFile(
    root,
    "docs/user/review-ownership.json",
    JSON.stringify({
      locales: { ja: ["@ja"], "zh-Hans": ["@zh"], "ko-KR": ["@ko"] },
      media: { reviewers: ["@media"] },
    }),
  );
}

function runChecker(root, env = {}) {
  return spawnSync(process.execPath, [checker], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

function outputOf(result) {
  return `${result.stdout}\n${result.stderr}`;
}

describe("check-docs-architecture reviewer ownership coverage", () => {
  it("rejects missing explicit locale and media CODEOWNERS coverage", () => {
    const root = makeTempRepo();
    writeRequiredDocs(root);

    const result = runChecker(root);

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain(
      ".github/CODEOWNERS: CODEOWNERS must explicitly cover /docs/user/ja/",
    );
    expect(outputOf(result)).toContain(
      ".github/CODEOWNERS: CODEOWNERS must explicitly cover /docs/user/assets/",
    );
  });

  it("accepts explicit locale and media CODEOWNERS coverage", () => {
    const root = makeTempRepo();
    writeRequiredDocs(
      root,
      "/docs/user/ja/ @xltt\n/docs/user/zh-Hans/ @xltt\n/docs/user/ko-KR/ @xltt\n/docs/user/assets/ @xltt\n",
    );

    const result = runChecker(root);

    expect(result.status).toBe(0);
  });

  it("rejects reviewed locale pages when base ref lacked reviewer ownership controls", () => {
    const root = makeTempRepo();
    writeRequiredDocs(root);
    writeFile(
      root,
      "docs/user/ja/index.md",
      `---
title: "Home"
description: "Home"
locale: "ja"
slug: ""
status: "draft"
---
# Home
`,
    );
    runGit(root, ["add", "."]);
    runGit(root, ["commit", "-m", "base docs"]);
    runGit(root, ["branch", "base"]);
    writeFile(
      root,
      "docs/user/ja/index.md",
      `---
title: "Home"
description: "Home"
locale: "ja"
slug: ""
status: "reviewed"
---
# Home
`,
    );
    writeFile(
      root,
      ".github/CODEOWNERS",
      minimalCodeowners(
        "/docs/user/ja/ @xltt\n/docs/user/zh-Hans/ @xltt\n/docs/user/ko-KR/ @xltt\n/docs/user/assets/ @xltt\n",
      ),
    );

    const result = runChecker(root, { DOCS_REVIEW_OWNERSHIP_BASE_REF: "base" });

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain(
      ".github/CODEOWNERS at base: CODEOWNERS must explicitly cover /docs/user/ja/",
    );
  });
});
