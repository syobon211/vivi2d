import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const checker = path.resolve("scripts/check-security-patterns.mjs");
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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vivi-security-patterns-"));
  tempRoots.push(root);
  runGit(root, ["init"]);
  return root;
}

function writeFile(root, relativePath, contents) {
  const file = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
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

function writeAndRun(relativePath, contents) {
  const root = makeTempRepo();
  writeFile(root, relativePath, contents);
  runGit(root, ["add", "."]);
  return runChecker(root);
}

describe("check-security-patterns", () => {
  it("rejects broad file URL navigation trust", () => {
    const result = writeAndRun(
      "electron/window.cjs",
      'if (url.startsWith("file://")) return true;\n',
    );

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain(
      "file:// navigation trust must compare against an exact app entry URL",
    );
  });

  it("rejects broad localhost production CSP", () => {
    const result = writeAndRun(
      "electron/security.cjs",
      "const csp = \"connect-src 'self' http://localhost:* http://127.0.0.1:*\";\n",
    );

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain(
      "production CSP must not allow broad localhost connections",
    );
  });

  it("allows dev-only localhost CSP guarded by isDev", () => {
    const result = writeAndRun(
      "electron/security.cjs",
      [
        "function createContentSecurityPolicy({ isDev }) {",
        "  if (isDev) {",
        '    return "connect-src http://localhost:* http://127.0.0.1:*";',
        "  }",
        "  return \"connect-src 'self'\";",
        "}",
      ].join("\n"),
    );

    expect(result.status).toBe(0);
  });

  it("does not scan test fixture files as production source", () => {
    const result = writeAndRun(
      "electron/security.test.mjs",
      [
        'if (url.startsWith("file://")) return true;',
        "throw new Error(res.body.toString());",
      ].join("\n"),
    );

    expect(result.status).toBe(0);
  });

  it("does not scan locked MediaPipe vendor assets as first-party source", () => {
    const result = writeAndRun(
      "packages/viewer/public/vendor/mediapipe/tasks-vision-0.10.35/wasm/vision_wasm_internal.js",
      'var isFileURI = filename => filename.startsWith("file://");\n',
    );

    expect(result.status).toBe(0);
  });

  it("rejects provider response body echo", () => {
    const result = writeAndRun(
      "electron/ipc/comfyui.cjs",
      "throw new Error(res.body.toString());\n",
    );

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain(
      "provider response bodies must not be echoed into user-visible errors",
    );
  });

  it("rejects chunk buffering without streaming byte ceilings", () => {
    const result = writeAndRun(
      "electron/http-util.cjs",
      ["function unsafe(chunks) {", "  return Buffer.concat(chunks);", "}"].join("\n"),
    );

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain(
      "chunk buffering must enforce a streaming maxBytes ceiling",
    );
  });

  it("allows chunk buffering when a maxBytes stream guard is present", () => {
    const result = writeAndRun(
      "electron/http-util.cjs",
      [
        "function safe(chunks, chunk, maxBytes) {",
        "  let total = 0;",
        "  total += chunk.byteLength;",
        "  if (total > maxBytes) throw new Error('too large');",
        "  return Buffer.concat(chunks);",
        "}",
      ].join("\n"),
    );

    expect(result.status).toBe(0);
  });

  it("rejects unknown IPC contract fail-open branches", () => {
    const result = writeAndRun(
      "electron/ipc-contract.cjs",
      [
        "function validateIpcArgs(channel, args) {",
        "  const validator = OBJECT_ARG_CONTRACTS.get(channel);",
        "  if (!validator) {",
        "    return;",
        "  }",
        "  validator(channel, args);",
        "}",
      ].join("\n"),
    );

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain("unknown IPC channels must fail closed");
  });
});
