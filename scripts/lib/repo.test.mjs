import path from "node:path";
import { describe, expect, it } from "vitest";
import { exists, gitLsFiles, readJson, readText, repoRoot, run } from "./repo.mjs";

describe("repo script helpers", () => {
  it("resolves the repository root independent of the caller cwd", () => {
    expect(path.isAbsolute(repoRoot)).toBe(true);
    expect(exists("package.json")).toBe(true);
  });

  it("reads text and JSON from the repository root", () => {
    expect(readText("package.json")).toContain('"name": "vivi2d"');
    expect(readJson("package.json").name).toBe("vivi2d");
  });

  it("runs commands and lists tracked repository files", () => {
    expect(run(process.execPath, ["--version"]).stdout).toContain("v");
    expect(gitLsFiles(["package.json"])).toContain("package.json");
  });
});
