import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { checkReleaseNodeCachePolicy } from "./lib/release-node-cache-policy.mjs";

function checkReleaseCacheFixture(checker, workflowPath, mutate = (text) => text) {
  const root = process.cwd();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "release-cache-policy-"));
  try {
    const lib = path.join(directory, "lib");
    fs.mkdirSync(lib);
    const workflow = fs
      .readFileSync(workflowPath, "utf8")
      .replace(/^ *package-manager-cache:[^\r\n]*\r?\n/gm, "")
      .replace(
        /^( *)- uses: actions\/setup-node@[^\r\n]+\r?\n\1 {2}with:\r?\n/gm,
        (block, indent) => `${block}${indent}    package-manager-cache: false\n`,
      );
    fs.writeFileSync(path.join(directory, "workflow.yml"), mutate(workflow));
    fs.writeFileSync(path.join(lib, "workflow-path.json"), JSON.stringify(workflowPath));
    const originalRepo = pathToFileURL(path.join(root, "scripts/lib/repo.mjs")).href;
    fs.writeFileSync(
      path.join(lib, "repo.mjs"),
      [
        'import fs from "node:fs";',
        `export * from ${JSON.stringify(originalRepo)};`,
        `import { readText as originalReadText } from ${JSON.stringify(originalRepo)};`,
        'const workflowPath = JSON.parse(fs.readFileSync(new URL("./workflow-path.json", import.meta.url), "utf8"));',
        'export function readText(file) { return file === workflowPath ? fs.readFileSync(new URL("../workflow.yml", import.meta.url), "utf8") : originalReadText(file); }',
      ].join("\n"),
    );
    for (const helper of [
      "windows-installer-alpha.mjs",
      "release-node-cache-policy.mjs",
    ]) {
      const original = path.join(root, "scripts/lib", helper);
      if (fs.existsSync(original))
        fs.writeFileSync(
          path.join(lib, helper),
          `export * from ${JSON.stringify(pathToFileURL(original).href)};\n`,
        );
    }
    const script = path.join(directory, checker);
    fs.copyFileSync(path.join(root, "scripts", checker), script);
    return spawnSync(process.execPath, [script], {
      cwd: root,
      encoding: "utf8",
      timeout: 15000,
      env: { ...process.env, TEMP: directory, TMP: directory },
    });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function replaceCacheInput(text, replacement, selected = 0) {
  let index = 0;
  return text.replace(/^( *)package-manager-cache: false\r?$/gm, (line, indent) =>
    index++ === selected ? replacement(indent) : line,
  );
}

describe("release setup-node automatic cache policy", () => {
  for (const [checker, workflow] of [
    ["check-web-npm-alpha-release.mjs", "publish-web-alpha.yml"],
    ["check-github-release-alpha.mjs", "github-release-alpha.yml"],
    ["check-windows-installer-alpha.mjs", "windows-installer-alpha.yml"],
  ]) {
    const workflowPath = `.github/workflows/${workflow}`;
    it(`${workflow} accepts literal false on every setup-node step`, () => {
      expect(checkReleaseCacheFixture(checker, workflowPath).status).toBe(0);
    });
    for (const [label, replacement] of [
      ["omitted", () => ""],
      ["true", (indent) => `${indent}package-manager-cache: true`],
      ["quoted false", (indent) => `${indent}package-manager-cache: 'false'`],
      ["expression", (indent) => `${indent}package-manager-cache: \${{ false }}`],
      [
        "explicit cache alongside false",
        (indent) => `${indent}package-manager-cache: false\n${indent}cache: npm`,
      ],
    ]) {
      it(`${workflow} rejects ${label}`, () => {
        const result = checkReleaseCacheFixture(checker, workflowPath, (text) =>
          replaceCacheInput(text, replacement),
        );
        expect(result.status).toBe(1);
        expect(result.stderr).toContain("setup-node");
      });
    }
    it(`${workflow} cannot borrow false from an unrelated step`, () => {
      const result = checkReleaseCacheFixture(checker, workflowPath, (text) =>
        replaceCacheInput(text, () => "").replace(
          "      - uses: actions/setup-node@",
          "      - uses: actions/cache@unrelated-fixture\n        with:\n          package-manager-cache: false\n      - uses: actions/setup-node@",
        ),
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("setup-node");
    });
  }
  it("rejects missing false in the second Windows job even when the first has it", () => {
    const result = checkReleaseCacheFixture(
      "check-windows-installer-alpha.mjs",
      ".github/workflows/windows-installer-alpha.yml",
      (text) => replaceCacheInput(text, () => "", 1),
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("setup-node");
  });
});

describe("release cache template syntax boundary", () => {
  const step = [
    "      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0",
    "        with:",
    "          node-version: 22.14.0",
    "          package-manager-cache: false",
  ].join("\n");
  it("accepts the current literal template with comments and CRLF", () => {
    expect(
      checkReleaseNodeCachePolicy(
        `${step} # intentional\n          # comment\n`.replaceAll("\n", "\r\n"),
        "fixture",
      ),
    ).toEqual([]);
  });
  for (const [label, fixture] of [
    ["missing setup-node", "      - run: npm ci"],
    ["quoted action", step.replace("uses: actions/", "uses: 'actions/")],
    [
      "named step with noncanonical uses",
      step.replace("- uses:", "- name: Node\n        uses:"),
    ],
    ["flow with", step.replace("with:", "with: { package-manager-cache: false }")],
    ["aliased with", step.replace("with:", "with: *node-inputs")],
    ["duplicate with", `${step}\n        with:\n          package-manager-cache: true`],
    ["duplicate input", `${step}\n          package-manager-cache: true`],
    ["false under env", step.replace("with:", "env:")],
    ["quoted cache key", `${step}\n          'cache': npm`],
    ["non-npm explicit cache", `${step}\n          cache: yarn`],
    [
      "nested input",
      `${step}\n          extra:\n            package-manager-cache: false`,
    ],
    ["step alias", `${step}\n      - *node`],
    ["step anchor", step.replace("- uses:", "- &node\n        uses:")],
    ["step merge", `${step}\n      - name: Hidden\n        <<: *node`],
    ["flow step", `${step}\n      - { uses: 'actions/setup-node@v7' }`],
    ["quoted uses key", step.replace("uses:", "'uses':")],
    [
      "old global explicit cache prohibition",
      `${step}\n      - uses: other/action@v1\n        with:\n          cache: npm`,
    ],
  ]) {
    it(`rejects ${label}`, () => {
      expect(checkReleaseNodeCachePolicy(fixture, "fixture").length).toBeGreaterThan(0);
    });
  }
});

describe("release input hardening", () => {
  for (const [label, mutate] of [
    [
      "job scope",
      (text) => text.replace("    env:", "    env:\n      GH_TOKEN: fixture"),
    ],
    [
      "build step",
      (text) =>
        text.replace(
          "      - run: npm ci",
          "      - run: npm ci\n        env:\n          GH_TOKEN: fixture",
        ),
    ],
    [
      "wrong live command",
      (text) =>
        text.replace(
          "--live --environment desktop-installer-alpha",
          "--environment desktop-installer-alpha",
        ),
    ],
  ]) {
    it(`rejects source-release validation token exposure in ${label}`, () => {
      const result = checkReleaseCacheFixture(
        "check-github-release-alpha.mjs",
        ".github/workflows/github-release-alpha.yml",
        mutate,
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("only in the exact live environment check step");
    });
  }

  for (const [chromium, embeddedNode, message] of [
    ["123\ninvalid", "22.14.0", "Chromium major version must"],
    ["-1", "22.14.0", "Chromium major version must"],
    ["99999", "22.14.0", "Chromium major version must"],
    ["123", "22.14.0\ninvalid", "Electron embedded Node version must"],
    ["123", "22.x", "Electron embedded Node version must"],
  ]) {
    it(`rejects malformed runtime metadata ${JSON.stringify([chromium, embeddedNode])}`, () => {
      const result = spawnSync(
        process.execPath,
        [
          "scripts/prepare-windows-installer-assets.mjs",
          "--version",
          "0.1.0-alpha.4",
          "--chromium-major-version",
          chromium,
          "--electron-embedded-node-version",
          embeddedNode,
        ],
        { encoding: "utf8" },
      );
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(message);
      expect(result.stderr).not.toContain("Missing Windows installer release input");
    });
  }

  it("keeps full redaction on every hosted gitleaks run", () => {
    for (const file of [
      "publish-web-alpha.yml",
      "github-release-alpha.yml",
      "windows-installer-alpha.yml",
    ]) {
      const workflow = fs.readFileSync(path.join(".github/workflows", file), "utf8");
      const scanLines = workflow
        .split(/\r?\n/)
        .filter((line) => /-- gitleaks (detect|git) /.test(line));
      expect(scanLines).toHaveLength(2);
      for (const line of scanLines) expect(line).toContain("--redact=100");
    }
  });

  it("retains Windows build transcripts separately and prevents premature manual approval", () => {
    const workflow = fs.readFileSync(
      ".github/workflows/windows-installer-alpha.yml",
      "utf8",
    );
    expect(workflow).not.toMatch(
      /manualReviewJson|MANUAL_REVIEW_JSON|--manual-review-json/,
    );
    expect(workflow).toMatch(
      /name: windows-installer-alpha-baseline-windows\s+retention-days: 14\s+if-no-files-found: error\s+path: transcripts\//,
    );
  });

  for (const input of [
    "manualReviewJson",
    "MANUAL_REVIEW_JSON",
    "--manual-review-json",
  ]) {
    it(`rejects reintroducing hosted manual review input ${input}`, () => {
      const result = checkReleaseCacheFixture(
        "check-windows-installer-alpha.mjs",
        ".github/workflows/windows-installer-alpha.yml",
        (text) =>
          text.replace(
            "      CSC_IDENTITY_AUTO_DISCOVERY:",
            `      ${input}: fixture\n      CSC_IDENTITY_AUTO_DISCOVERY:`,
          ),
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("without free-form manual review inputs");
    });
  }

  it("keeps release npm caches disabled and installer-only PRs covered", () => {
    for (const file of [
      "publish-web-alpha.yml",
      "github-release-alpha.yml",
      "windows-installer-alpha.yml",
    ]) {
      const workflow = fs.readFileSync(path.join(".github/workflows", file), "utf8");
      expect(workflow).not.toMatch(/^\s+cache:\s*['"]?npm['"]?(?:\s|$)/m);
    }
    const workflow = fs.readFileSync(".github/workflows/quality-gates.yml", "utf8");
    const prPaths = workflow.slice(
      workflow.indexOf("  pull_request:"),
      workflow.indexOf("  workflow_dispatch:"),
    );
    expect(prPaths).toContain('- "electron-builder.yml"');
    expect(prPaths).toContain('- "electron-builder.viewer.yml"');
  });
});

describe("published documentation under script-free CSP", () => {
  it("generates usable language links without script or form dependencies", () => {
    const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vivi-static-docs-"));
    try {
      const script = "apps/vivi2d-com/scripts/build.mjs";
      fs.mkdirSync(path.join(fixtureRoot, path.dirname(script)), { recursive: true });
      fs.copyFileSync(script, path.join(fixtureRoot, script));
      const locales = ["en", "ja", "zh-Hans", "ko-KR"];
      fs.mkdirSync(path.join(fixtureRoot, "docs/user"), { recursive: true });
      fs.writeFileSync(
        path.join(fixtureRoot, "docs/user/publication-manifest.json"),
        JSON.stringify({
          locales,
          routes: [
            {
              slug: "",
              published: true,
              includeInNavigation: true,
              includeInSearch: false,
            },
          ],
        }),
      );
      for (const locale of locales) {
        const directory = path.join(fixtureRoot, "docs/user", locale);
        fs.mkdirSync(directory, { recursive: true });
        fs.writeFileSync(
          path.join(directory, "index.md"),
          "---\ntitle: Fixture\ndescription: Test only\nstatus: reviewed\n---\n# Fixture\nSynthetic content.",
        );
      }
      const result = spawnSync(process.execPath, [path.join(fixtureRoot, script)], {
        cwd: fixtureRoot,
        encoding: "utf8",
        env: { ...process.env, VIVI_DOCS_BASE_URL: "" },
      });
      expect(result.status).toBe(0);
      const out = path.join(fixtureRoot, "apps/vivi2d-com/dist");
      expect(fs.readFileSync(path.join(out, "_headers"), "utf8")).toContain(
        "script-src 'none'",
      );
      for (const locale of locales) {
        const html = fs.readFileSync(path.join(out, locale, "latest/index.html"), "utf8");
        expect(html).not.toMatch(/<script\b|<form\b|<noscript\b/i);
        expect(html).toContain('aria-label="Language"');
        for (const target of locales) expect(html).toContain(`href="/${target}/latest/"`);
      }
    } finally {
      // Delete only this test's freshly-created fixture directory.
      fs.rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });
});
