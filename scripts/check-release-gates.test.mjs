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
  it("accepts allowlisted artifact names and paths", () => {
    const root = makeTempRepo();
    writeHostedChecklist(root);
    writeFile(
      root,
      ".github/workflows/quality.yml",
      [
        "jobs:",
        "  test:",
        "    steps:",
        "      - uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
        "        with:",
        "          name: coverage-$" + "{{ github.run_id }}",
        "          path: coverage/",
        "          retention-days: 7",
      ].join("\n"),
    );

    const result = runHostedSurface(root);

    expect(result.status).toBe(0);
  });

  it("accepts Playwright artifacts only after release-surface preflight", () => {
    const root = makeTempRepo();
    writeHostedChecklist(root);
    writeFile(
      root,
      ".github/workflows/e2e.yml",
      [
        "jobs:",
        "  test:",
        "    steps:",
        "      - run: npm run check:release-surface",
        "      - uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
        "        with:",
        "          name: playwright-report-smoke-$" + "{{ github.run_id }}",
        "          path: |",
        "            playwright-report/",
        "            test-results/",
        "          retention-days: 7",
      ].join("\n"),
    );

    const result = runHostedSurface(root);

    expect(result.status).toBe(0);
  });

  it("rejects Playwright artifacts without release-surface preflight", () => {
    const root = makeTempRepo();
    writeHostedChecklist(root);
    writeFile(
      root,
      ".github/workflows/e2e.yml",
      [
        "jobs:",
        "  test:",
        "    steps:",
        "      - uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
        "        with:",
        "          name: playwright-report-smoke-$" + "{{ github.run_id }}",
        "          path: |",
        "            playwright-report/",
        "            test-results/",
        "          retention-days: 7",
      ].join("\n"),
    );

    const result = runHostedSurface(root);

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain(
      "Playwright/test artifacts require npm run check:release-surface before upload",
    );
  });

  it("rejects unallowlisted artifact paths", () => {
    const root = makeTempRepo();
    writeHostedChecklist(root);
    writeFile(
      root,
      ".github/workflows/quality.yml",
      [
        "jobs:",
        "  test:",
        "    steps:",
        "      - uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
        "        with:",
        "          name: coverage-$" + "{{ github.run_id }}",
        "          path: docs/user/assets/",
        "          retention-days: 7",
      ].join("\n"),
    );

    const result = runHostedSurface(root);

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain(
      "upload-artifact path is not public-safe allowlisted",
    );
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
    expect(text).toContain(
      'npm publish "$PACKED_TARBALL" --access public --tag alpha --provenance',
    );
    expect(text).toContain("verify-web-npm-alpha-release-record.mjs");
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
