import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const ignoreText = fs.readFileSync(path.resolve(".gitignore"), "utf8");
const tempRoots = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    const base = fs.realpathSync(os.tmpdir());
    if (
      path.dirname(fs.realpathSync(root)) !== base ||
      !path.basename(root).startsWith("vivi-env-ignore-") ||
      fs.lstatSync(root).isSymbolicLink()
    ) {
      throw new Error("Unexpected env-ignore fixture cleanup target.");
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function checkIgnored(relativePath) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vivi-env-ignore-"));
  tempRoots.push(root);
  const emptyConfig = path.join(root, "empty-git-config");
  fs.writeFileSync(emptyConfig, "");
  fs.writeFileSync(path.join(root, ".gitignore"), ignoreText);
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
  );
  env.GIT_CONFIG_NOSYSTEM = "1";
  env.GIT_CONFIG_GLOBAL = emptyConfig;
  const options = { cwd: root, encoding: "utf8", env, timeout: 10_000 };
  const init = spawnSync("git", ["init", "--quiet", "--template="], options);
  if (init.status !== 0) throw new Error("Unable to initialize env-ignore fixture.");
  return spawnSync(
    "git",
    [
      "-c",
      `core.excludesFile=${emptyConfig}`,
      "check-ignore",
      "--no-index",
      "--quiet",
      "--",
      relativePath,
    ],
    options,
  );
}

describe("shared env ignore without global configuration", () => {
  it.each([
    ".env",
    ".env.local",
    ".env.production",
    ".env.production.local",
    ".env.example.local",
    ".env.example.secret",
    "packages/viewer/.env",
    "packages/viewer/.env.local",
    "packages/viewer/.env.example",
    "packages/viewer/.env.production.example",
  ])("ignores %s", (relativePath) => {
    expect(checkIgnored(relativePath).status).toBe(0);
  });

  it("permits only the exact root public example", () => {
    expect(checkIgnored(".env.example").status).toBe(1);
  });

  it("does not hide ordinary public source files", () => {
    expect(checkIgnored("src/environment.ts").status).toBe(1);
  });
});
