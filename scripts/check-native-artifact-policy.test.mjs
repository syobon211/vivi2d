import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const checker = path.resolve("scripts/check-native-artifact-policy.mjs");

function run(command, args) {
  return spawnSync(command, args, {
    cwd: path.resolve("."),
    encoding: "utf8",
  });
}

describe("check-native-artifact-policy", () => {
  it("allows locked MediaPipe wasm assets while enforcing native runtime policy", () => {
    const trackedWasm = run("git", ["ls-files", "*.wasm", "packages/**/*.wasm"]);

    expect(trackedWasm.status).toBe(0);
    expect(trackedWasm.stdout).toContain(
      "packages/viewer/public/vendor/mediapipe/tasks-vision-0.10.35/wasm/vision_wasm_internal.wasm",
    );

    const result = run(process.execPath, [checker]);

    expect(result.status).toBe(0);
  });
});
