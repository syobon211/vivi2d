import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

export function commandExists(command, spawn = spawnSync) {
  const result =
    process.platform === "win32"
      ? spawn("where.exe", [command], { stdio: "ignore", shell: false })
      : spawn("sh", ["-c", 'command -v "$1"', "sh", command], {
          stdio: "ignore",
          shell: false,
        });
  return result.status === 0;
}

export function npmInvocation(
  args,
  { platform = process.platform, env = process.env, execPath = process.execPath } = {},
) {
  const npmCli = env.npm_execpath?.trim();
  if (npmCli) return { command: execPath, args: [npmCli, ...args] };
  if (platform === "win32") {
    const adjacentCli = path.join(
      path.dirname(execPath),
      "node_modules/npm/bin/npm-cli.js",
    );
    if (existsSync(adjacentCli)) {
      return { command: execPath, args: [adjacentCli, ...args] };
    }
    throw new Error(
      "Run this check through npm run check:runtime-png (npm_execpath required).",
    );
  }
  return { command: "npm", args };
}

// Only bootstrap the trusted installed MSVC environment through cmd. The command
// is fixed: repository, source, library and output paths never become batch code.
export function readMsvcEnvironment(vcvars, spawn = spawnSync) {
  if (
    process.platform !== "win32" ||
    !path.isAbsolute(vcvars) ||
    path.basename(vcvars).toLowerCase() !== "vcvars64.bat"
  ) {
    throw new Error("Expected an absolute Windows vcvars64.bat path.");
  }
  const result = spawn(
    "cmd.exe",
    [
      "/d",
      "/s",
      "/v:off",
      "/c",
      '"call vcvars64.bat >nul && "%VIVI2D_PNG_NODE%" -p "JSON.stringify(process.env)""',
    ],
    {
      cwd: path.dirname(vcvars),
      encoding: "utf8",
      env: {
        ...Object.fromEntries(
          Object.entries(process.env).filter(
            ([key]) => key.toUpperCase() !== "VIVI2D_PNG_NODE",
          ),
        ),
        VIVI2D_PNG_NODE: process.execPath,
      },
      shell: false,
      windowsVerbatimArguments: true,
      windowsHide: true,
      timeout: 60_000,
      maxBuffer: 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (result.error || result.status !== 0) {
    // Captured environment output may contain credentials; never echo it.
    throw new Error("MSVC environment initialization failed.");
  }
  let captured;
  try {
    captured = JSON.parse(result.stdout);
  } catch {
    throw new Error("MSVC environment initialization returned invalid JSON.");
  }
  if (!captured || Array.isArray(captured) || typeof captured !== "object") {
    throw new Error("MSVC environment initialization returned an invalid environment.");
  }
  const env = Object.create(null);
  for (const [key, value] of Object.entries(captured)) {
    if (typeof value !== "string") {
      throw new Error("MSVC environment initialization returned an invalid environment.");
    }
    if (key.toUpperCase() !== "VIVI2D_PNG_NODE") env[key.toUpperCase()] = value;
  }
  if (!env.PATH) throw new Error("MSVC environment initialization returned no PATH.");
  return env;
}
