import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const sourceArchiveChecker = path.resolve("scripts/create-source-review-archive.mjs");
const hostedSurfaceChecker = path.resolve("scripts/check-hosted-release-surfaces.mjs");
const releaseInputChecker = path.resolve("scripts/check-release-input-version.mjs");
const webNpmAlphaWorkflow = path.resolve(".github/workflows/publish-web-alpha.yml");
const tempRoots = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { force: true, recursive: true });
  }
});

function makeTempRepo(prefix = "vivi-release-gate-") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempRoots.push(root);
  runGit(root, ["init"]);
  runGit(root, ["config", "user.email", "release@example.invalid"]);
  runGit(root, ["config", "user.name", "Release Test"]);
  return root;
}

function runGit(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout;
}

function writeFile(root, relativePath, contents) {
  const file = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
}

function runSourceArchive(root, args = ["--check"]) {
  return spawnSync(process.execPath, [sourceArchiveChecker, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, VIVI2D_SOURCE_ARCHIVE_ROOT: root },
  });
}

function runHostedSurface(root) {
  return spawnSync(process.execPath, [hostedSurfaceChecker], {
    cwd: root,
    encoding: "utf8",
  });
}

function outputOf(result) {
  return `${result.stdout}\n${result.stderr}`;
}

function writeFakeNpm(root, { stdout = "", stderr = "", status = 0 } = {}) {
  const bin = path.join(root, "bin");
  fs.mkdirSync(bin, { recursive: true });
  const jsonStdout = JSON.stringify(stdout);
  const jsonStderr = JSON.stringify(stderr);
  writeFile(
    root,
    "bin/npm",
    [
      "#!/bin/sh",
      stdout ? `printf '%s\\n' ${jsonStdout}` : "",
      stderr ? `printf '%s\\n' ${jsonStderr} >&2` : "",
      `exit ${status}`,
      "",
    ].join("\n"),
  );
  fs.chmodSync(path.join(bin, "npm"), 0o755);
  writeFile(
    root,
    "bin/npm.cmd",
    [
      "@echo off",
      stdout ? `echo ${stdout}` : "",
      stderr ? `echo ${stderr} 1>&2` : "",
      `exit /b ${status}`,
      "",
    ].join("\r\n"),
  );
  return bin;
}

function runReleaseInputVersionWithFakeNpm({ stdout, stderr, status }) {
  const root = makeTempRepo("vivi-release-input-");
  const bin = writeFakeNpm(root, { stdout, stderr, status });
  const version = JSON.parse(
    fs.readFileSync(path.resolve("packages/web/package.json"), "utf8"),
  ).version;
  const env = { ...process.env };
  env.PATH = `${bin}${path.delimiter}${env.PATH ?? env.Path ?? ""}`;
  env.Path = env.PATH;
  return spawnSync(
    process.execPath,
    [
      releaseInputChecker,
      "--workspace",
      "@vivi2d/web",
      "--version",
      version,
      "--dist-tag",
      "alpha",
    ],
    {
      cwd: path.resolve("."),
      encoding: "utf8",
      env,
    },
  );
}

function writeHostedChecklist(root) {
  writeFile(
    root,
    "docs/developer/quality/public-release-checklist.md",
    [
      "- Full git history scanned",
      "- Actions logs, workflow summaries, and retained artifacts reviewed",
      "- Hosted-surface findings remediated",
      "- Workflow artifacts do not include private paths, source image bytes, provider payloads, or unreviewed generated media",
      "- Perf, screenshot, and workflow-recording artifacts use synthetic public fixtures only",
      "- gitleaks",
    ].join("\n"),
  );
}

describe("source review archive gate", () => {
  it("accepts a clean tracked source tree in check mode", () => {
    const root = makeTempRepo();
    writeFile(root, "README.md", "# Test\n");
    runGit(root, ["add", "."]);

    const result = runSourceArchive(root);

    expect(result.status).toBe(0);
    expect(outputOf(result)).toContain("[source-review-archive] passed");
  });

  it("rejects tracked generated output directories", () => {
    const root = makeTempRepo();
    writeFile(root, "dist/bundle.js", "generated\n");
    runGit(root, ["add", "."]);

    const result = runSourceArchive(root);

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain(
      "generated or local-only output must not be tracked",
    );
  });

  it("rejects tracked symlinks when the platform permits creating them", () => {
    const root = makeTempRepo();
    writeFile(root, "outside.txt", "outside\n");
    try {
      fs.symlinkSync(path.join(root, "outside.txt"), path.join(root, "linked.txt"));
    } catch {
      return;
    }
    runGit(root, ["add", "."]);

    const result = runSourceArchive(root);

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain(
      "source-review archives must not include symlinks",
    );
  });

  it("requires a clean tree before writing an archive", () => {
    const root = makeTempRepo();
    writeFile(root, "README.md", "# Test\n");
    runGit(root, ["add", "."]);
    runGit(root, ["commit", "-m", "initial"]);
    writeFile(root, "README.md", "# Dirty\n");

    const result = runSourceArchive(root, []);

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain("requires a clean working tree");
  });
});

describe("hosted release surface gate", () => {
  function releaseWorkflow() {
    return [
      "on:",
      "  workflow_dispatch:",
      "jobs:",
      "  validate-and-package-github-release:",
      "    environment: desktop-installer-alpha",
      "    steps:",
      "      - name: Verify live release environment before build",
      "        env:",
      "          GH_TOKEN: $" + "{{ github.token }}",
      "        run: node scripts/check-environment-protection.mjs --live --environment desktop-installer-alpha",
      "      - run: npm ci",
      "      - uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a",
      "        with:",
      "          name: github-release-alpha-assets",
      "          path: tmp/github-release-assets/",
      "          retention-days: 14",
      "          if-no-files-found: error",
    ].join("\n");
  }

  function checkFixture(text, filename = "github-release-alpha.yml") {
    const root = makeTempRepo();
    writeHostedChecklist(root);
    writeFile(root, `.github/workflows/${filename}`, text);
    return runHostedSurface(root);
  }

  it("accepts an approved release producer with a successful live check before build", () => {
    expect(checkFixture(releaseWorkflow()).status).toBe(0);
  });

  it("accepts non-release CI without artifact uploads", () => {
    expect(
      checkFixture("jobs:\n  test:\n    steps:\n      - run: npm test\n", "quality.yml")
        .status,
    ).toBe(0);
  });

  for (const artifactPath of ["coverage/", "playwright-report/", "test-results/"]) {
    it(`rejects automatic ${artifactPath} upload even after release-surface preflight`, () => {
      const fixture = [
        "jobs:",
        "  test:",
        "    steps:",
        "      - run: npm run check:release-surface",
        "      - uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a",
        "        with:",
        "          name: coverage-fixture",
        `          path: ${artifactPath}`,
        "          retention-days: 7",
      ].join("\n");
      const result = checkFixture(fixture, "quality.yml");
      expect(result.status).toBe(1);
      expect(outputOf(result)).toContain("artifact upload");
    });
  }

  for (const [label, mutate] of [
    [
      "missing approval",
      (text) => text.replace("    environment: desktop-installer-alpha\n", ""),
    ],
    [
      "wrong approval",
      (text) =>
        text.replace(
          "    environment: desktop-installer-alpha",
          "    environment: npm-alpha",
        ),
    ],
    [
      "expression approval",
      (text) =>
        text.replace(
          "    environment: desktop-installer-alpha",
          "    environment: $" + "{{ inputs.environment }}",
        ),
    ],
    [
      "missing live check",
      (text) =>
        text.replace(
          "        run: node scripts/check-environment-protection.mjs --live --environment desktop-installer-alpha",
          "        run: echo checked",
        ),
    ],
    ["offline check", (text) => text.replace(" --live", "")],
    [
      "conditional live check",
      (text) =>
        text.replace(
          "        run: node scripts/check-environment-protection",
          "        if: false\n        run: node scripts/check-environment-protection",
        ),
    ],
    [
      "tolerated live failure",
      (text) =>
        text.replace(
          "        run: node scripts/check-environment-protection",
          "        continue-on-error: true\n        run: node scripts/check-environment-protection",
        ),
    ],
    [
      "live check after build",
      (text) =>
        text
          .replace("      - run: npm ci\n", "")
          .replace("    steps:\n", "    steps:\n      - run: npm ci\n"),
    ],
    [
      "always upload",
      (text) => text.replace("        with:\n", "        if: always()\n        with:\n"),
    ],
    [
      "continued producer failure",
      (text) => text.replace("    steps:\n", "    continue-on-error: true\n    steps:\n"),
    ],
    [
      "continued validation failure",
      (text) =>
        text.replace(
          "      - run: npm ci",
          "      - run: npm ci\n        continue-on-error: true",
        ),
    ],
    [
      "skipped validation",
      (text) =>
        text.replace("      - run: npm ci", "      - run: npm ci\n        if: false"),
    ],
    [
      "continued named scan failure",
      (text) =>
        text.replace(
          "      - run: npm ci",
          "      - name: Scan generated output\n        continue-on-error: true\n        run: npm ci",
        ),
    ],
    [
      "quoted continued validation failure",
      (text) =>
        text.replace(
          "      - run: npm ci",
          "      - run: npm ci\n        'continue-on-error': true",
        ),
    ],
    [
      "unknown producer",
      (text) => text.replace("  validate-and-package-github-release:", "  unrelated:"),
    ],
    [
      "unreviewed action",
      (text) =>
        text.replace(
          "upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a",
          "upload-artifact@v7",
        ),
    ],
    [
      "extra artifact path",
      (text) =>
        text.replace(
          "path: tmp/github-release-assets/",
          "path: |\n            tmp/github-release-assets/\n            test-results/",
        ),
    ],
    [
      "duplicate approval",
      (text) =>
        text.replace(
          "    environment: desktop-installer-alpha",
          "    environment: desktop-installer-alpha\n    environment: npm-alpha",
        ),
    ],
    [
      "aliased upload",
      (text) =>
        text.replace(
          "      - uses: actions/upload-artifact",
          "      - &upload\n        uses: actions/upload-artifact",
        ),
    ],
  ]) {
    it(`rejects ${label}`, () => {
      const result = checkFixture(mutate(releaseWorkflow()));
      expect(result.status).toBe(1);
    });
  }

  it("cannot borrow approval and live check from another job", () => {
    const fixture = releaseWorkflow().replace(
      "      - run: npm ci",
      "  unapproved:\n    steps:\n      - run: npm ci",
    );
    expect(checkFixture(fixture).status).toBe(1);
  });

  it("cannot borrow token binding from another step", () => {
    const fixture = releaseWorkflow().replace(
      "        run: node scripts/check-environment-protection",
      "        run: echo unrelated\n      - run: node scripts/check-environment-protection",
    );
    expect(checkFixture(fixture).status).toBe(1);
  });

  it("accepts every current release producer without permitting CI uploads", () => {
    const root = makeTempRepo();
    writeHostedChecklist(root);
    for (const filename of [
      "github-release-alpha.yml",
      "windows-installer-alpha.yml",
      "publish-web-alpha.yml",
      "test-matrix.yml",
      "perf-monitor.yml",
    ]) {
      const workflowPath = `.github/workflows/${filename}`;
      writeFile(root, workflowPath, fs.readFileSync(workflowPath, "utf8"));
    }
    const result = runHostedSurface(root);
    expect(outputOf(result)).toContain("[hosted-release-surfaces] passed");
    expect(result.status).toBe(0);
  });
});

describe("web npm alpha release workflow", () => {
  function workflowText() {
    return fs.readFileSync(webNpmAlphaWorkflow, "utf8");
  }

  it("keeps OIDC permission isolated to the publish job", () => {
    const text = workflowText();
    const validateJob = text.slice(
      text.indexOf("  validate-and-pack-web-alpha:"),
      text.indexOf("  publish-web-alpha:"),
    );
    const publishJob = text.slice(text.indexOf("  publish-web-alpha:"));

    expect(validateJob).not.toContain("id-token: write");
    expect(publishJob).toContain("id-token: write");
    expect(publishJob).not.toContain("npm ci");
    expect(publishJob).not.toContain("npm pack");
  });

  it("binds provenance to the selected release tag", () => {
    const text = workflowText();

    expect(text).toContain('test "$GITHUB_REF" = "refs/tags/$RELEASE_REF"');
    expect(text).toContain('test "$RELEASE_REF" = "web-v$VERSION"');
    expect(text).toContain("fetch-depth: 0");
    expect(text).toContain("persist-credentials: false");
  });

  it("installs pinned gitleaks before history scans", () => {
    const text = workflowText();
    const installIndex = text.indexOf("node scripts/install-pinned-gitleaks.mjs");
    const historyIndex = text.indexOf("npm run check:history-secrets");
    const worktreeIndex = text.indexOf("gitleaks detect --source . --no-git");
    const gitIndex = text.indexOf('gitleaks git --log-opts="--all" .');

    expect(installIndex).toBeGreaterThanOrEqual(0);
    expect(installIndex).toBeLessThan(historyIndex);
    expect(historyIndex).toBeLessThan(worktreeIndex);
    expect(worktreeIndex).toBeLessThan(gitIndex);
  });

  it("publishes only the previously packed tarball artifact", () => {
    const text = workflowText();

    expect(text).toContain("npm pack --workspace @vivi2d/web --json");
    expect(text).toContain("web-pack-result.json");
    expect(text).toContain("*.tgz");
    expect(text).toContain("node scripts/publish-web-npm-alpha.mjs");
    expect(text).toContain("verify-web-npm-alpha-publish.mjs");
  });

  it("treats npm JSON E404 on stdout as an unpublished version", () => {
    const result = runReleaseInputVersionWithFakeNpm({
      stdout:
        '{"error":{"code":"E404","summary":"Not Found - package is not published"}}',
      stderr: "",
      status: 1,
    });

    expect(result.status).toBe(0);
    expect(outputOf(result)).toContain("[release-input-version] passed");
  });
});
