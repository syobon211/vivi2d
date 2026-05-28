import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const checker = path.resolve("scripts/check-publication-history.mjs");
const tempRoots = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { force: true, recursive: true });
  }
});

function runGit(root, args) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout);
  }
  return result.stdout;
}

function makeTempRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vivi-publication-history-"));
  tempRoots.push(root);
  runGit(root, ["init"]);
  return root;
}

function writeFile(root, relativePath, contents = "fixture\n") {
  const file = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
}

function commitAll(root) {
  runGit(root, ["add", "."]);
  runGit(root, [
    "-c",
    "user.name=Vivi2D Test",
    "-c",
    "user.email=vivi2d@example.invalid",
    "commit",
    "-m",
    "test fixture",
  ]);
}

function runChecker(root) {
  return spawnSync(process.execPath, [checker], {
    cwd: root,
    encoding: "utf8",
  });
}

function outputOf(result) {
  return `${result.stdout}\n${result.stderr}`;
}

describe("check-publication-history", () => {
  it("allows locked MediaPipe model files", () => {
    const root = makeTempRepo();
    writeFile(
      root,
      "packages/viewer/public/vendor/mediapipe/tasks-vision-0.10.35/models/face_landmarker.task",
    );
    commitAll(root);

    const result = runChecker(root);

    expect(result.status).toBe(0);
  });

  it("rejects private model-like paths outside the locked MediaPipe vendor set", () => {
    const root = makeTempRepo();
    writeFile(root, "packages/viewer/public/vendor/other/models/private_model.task");
    commitAll(root);

    const result = runChecker(root);

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain("model/private-asset-like path");
  });
});
