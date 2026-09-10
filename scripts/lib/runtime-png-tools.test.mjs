import { spawnSync as realSpawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  commandExists,
  npmInvocation,
  readMsvcEnvironment,
} from "./runtime-png-tools.mjs";

let spawnSync;
beforeEach(() => {
  spawnSync = vi.fn(realSpawnSync);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

function withFixture(run) {
  const parent = path.resolve(os.tmpdir());
  const directory = fs.mkdtempSync(
    path.join(parent, "vivi png & (test) %PNG_LITERAL% ! Ω-"),
  );
  if (path.dirname(path.resolve(directory)) !== parent)
    throw new Error("Fixture cleanup escaped its parent.");
  try {
    return run(directory);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

describe("PNG gate command lookup and npm invocation", () => {
  it("finds Node on PATH without a shell", () => {
    expect(commandExists("node", spawnSync)).toBe(true);
    expect(vi.mocked(spawnSync).mock.calls.at(-1)[2].shell).toBe(false);
  });

  it("treats shell syntax in a compiler override as one literal lookup argument", () => {
    const command = "vivi-missing-compiler; echo VIVI_LOOKUP_SENTINEL & rem";
    expect(commandExists(command, spawnSync)).toBe(false);
    const [, args, options] = vi.mocked(spawnSync).mock.calls.at(-1);
    expect(args.at(-1)).toBe(command);
    expect(options.shell).toBe(false);
    if (process.platform !== "win32")
      expect(args.slice(0, 3)).toEqual(["-c", 'command -v "$1"', "sh"]);
  });

  it("keeps the npm CLI path and arguments as data", () => {
    const cli = "C:/tools & (test)/%literal%!Ω/npm-cli.js";
    const args = ["pack", "--workspace", "@vivi2d/runtime-c-abi", "--json", "--dry-run"];
    expect(
      npmInvocation(args, {
        platform: "win32",
        env: { npm_execpath: cli },
        execPath: "node.exe",
      }),
    ).toEqual({
      command: "node.exe",
      args: [cli, ...args],
    });
  });

  it("supports a Node-adjacent Windows npm CLI without npm.cmd", () =>
    withFixture((directory) => {
      const cli = path.join(directory, "node_modules/npm/bin/npm-cli.js");
      fs.mkdirSync(path.dirname(cli), { recursive: true });
      fs.writeFileSync(cli, "// synthetic discovery fixture, not executed\n");
      const execPath = path.join(directory, "node.exe");
      expect(
        npmInvocation(["--version"], { platform: "win32", env: {}, execPath }),
      ).toEqual({ command: execPath, args: [cli, "--version"] });
      expect(spawnSync).not.toHaveBeenCalled();
    }));

  it("fails closed when Windows has no direct npm CLI", () =>
    withFixture((directory) => {
      expect(() =>
        npmInvocation([], {
          platform: "win32",
          env: {},
          execPath: path.join(directory, "node.exe"),
        }),
      ).toThrow("npm_execpath required");
      expect(spawnSync).not.toHaveBeenCalled();
    }));

  it("keeps the Unix npm executable path shell-free", () => {
    expect(npmInvocation(["--version"], { platform: "linux", env: {} })).toEqual({
      command: "npm",
      args: ["--version"],
    });
  });

  it("keeps repository paths out of batch code in the complete PNG checker", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "scripts/check-runtime-png.mjs"),
      "utf8",
    );
    expect(source).not.toMatch(/\.cmd\b|cmd\.exe|shell:\s*true|quoteCmdArg/);
    expect(source).toContain(
      'runCapture("dumpbin", ["/nologo", "/exports", dynamicLibrary], {',
    );
    expect(source).toContain("run(compiler.command, args, { env: compiler.env });");
    expect(source.match(/shell: false/g)).toHaveLength(2);
  });
});

describe("PNG gate MSVC environment bootstrap", () => {
  it("rejects invalid bootstrap paths before executing anything", () => {
    expect(() => readMsvcEnvironment("relative/vcvars64.bat", spawnSync)).toThrow(
      "absolute Windows vcvars64.bat",
    );
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it.skipIf(process.platform !== "win32")(
    "uses only a fixed command and preserves JSON environment values",
    () => {
      vi.mocked(spawnSync).mockReturnValueOnce({
        status: 0,
        stdout: JSON.stringify({
          Path: "old",
          PATH: "ready",
          MULTILINE: "first\nPATH=not-a-variable",
          UNICODE: "日本語",
          VIVI2D_PNG_NODE: "internal",
        }),
      });
      const vcvars = "C:\\tools & (x) %PATH% ! Ω\\vcvars64.bat";
      const env = readMsvcEnvironment(vcvars, spawnSync);
      expect(env).toEqual({
        PATH: "ready",
        MULTILINE: "first\nPATH=not-a-variable",
        UNICODE: "日本語",
      });
      const [command, args, options] = vi.mocked(spawnSync).mock.calls[0];
      expect(command).toBe("cmd.exe");
      expect(args.at(-1)).toBe(
        '"call vcvars64.bat >nul && "%VIVI2D_PNG_NODE%" -p "JSON.stringify(process.env)""',
      );
      expect(args.join(" ")).not.toContain(path.dirname(vcvars));
      expect(options.cwd).toBe(path.dirname(vcvars));
      expect(options.shell).toBe(false);
      expect(options.windowsHide).toBe(true);
      expect(options.timeout).toBe(60_000);
      expect(options.maxBuffer).toBe(1024 * 1024);
    },
  );

  for (const result of [
    { status: 7, stdout: "synthetic-private-marker", stderr: "synthetic-private-marker" },
    { status: null, error: new Error("synthetic-private-marker"), stdout: "" },
    { status: 0, error: new Error("maxBuffer"), stdout: "synthetic-private-marker" },
    { status: 0, stdout: "synthetic-private-marker" },
    { status: 0, stdout: "null" },
    { status: 0, stdout: "[]" },
    { status: 0, stdout: '{"PATH":42}' },
    { status: 0, stdout: '{"UNRELATED":"synthetic-private-marker"}' },
  ]) {
    it.skipIf(process.platform !== "win32")(
      "fails closed without echoing captured environment data",
      () => {
        vi.mocked(spawnSync).mockReturnValueOnce(result);
        let message;
        try {
          readMsvcEnvironment("C:\\tools\\vcvars64.bat", spawnSync);
        } catch (error) {
          message = error.message;
        }
        expect(typeof message).toBe("string");
        expect(message).toContain("MSVC environment initialization");
        expect(message).not.toContain("synthetic-private-marker");
        expect(spawnSync).toHaveBeenCalledOnce();
      },
    );
  }

  it.skipIf(process.platform !== "win32")(
    "initializes from a real batch in a Unicode/metacharacter directory",
    () =>
      withFixture((directory) => {
        const vcvars = path.join(directory, "vcvars64.bat");
        fs.writeFileSync(
          vcvars,
          '@echo off\r\nset "VIVI2D_PNG_FIXTURE_READY=ready"\r\nexit /b 0\r\n',
        );
        vi.stubEnv("VIVI2D_PNG_FIXTURE_MULTILINE", "public fixture\nPATH=literal data Ω");
        const env = readMsvcEnvironment(vcvars);
        // Never compare or print the complete real process environment.
        expect(env.VIVI2D_PNG_FIXTURE_READY).toBe("ready");
        expect(env.VIVI2D_PNG_FIXTURE_MULTILINE).toBe(
          "public fixture\nPATH=literal data Ω",
        );
        expect(typeof env.PATH).toBe("string");
        expect(
          Object.keys(env).filter((key) => key.toUpperCase() === "PATH").length,
        ).toBe(1);
        expect(Object.hasOwn(env, "VIVI2D_PNG_NODE")).toBe(false);
      }),
  );

  it.skipIf(process.platform !== "win32")(
    "propagates failure of a real bootstrap without its output",
    () =>
      withFixture((directory) => {
        const vcvars = path.join(directory, "vcvars64.bat");
        fs.writeFileSync(
          vcvars,
          "@echo off\r\necho synthetic-private-marker 1>&2\r\nexit /b 7\r\n",
        );
        expect(() => readMsvcEnvironment(vcvars)).toThrow(
          "MSVC environment initialization failed.",
        );
      }),
  );
});
