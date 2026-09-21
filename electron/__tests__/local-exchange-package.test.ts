// @vitest-environment node
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
it("loads the generated CJS alone in a clean process without workspace modules", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vivi-local-package-test-"));
  try {
    // Build from the actual sources; no mocked bundle or runtime TS loader.
    execFileSync(process.execPath, ["scripts/build-local-exchange-host.mjs"], {
      cwd: process.cwd(),
      stdio: "pipe",
      timeout: 30000,
    });
    fs.copyFileSync(
      "electron/generated/local-exchange-host.cjs",
      path.join(root, "host.cjs"),
    );
    const result = execFileSync(
      process.execPath,
      [
        "-e",
        `const {LocalExchangeHost}=require('./host.cjs'); (async()=>{const host=await LocalExchangeHost.open({root:require('node:path').join(process.cwd(),'store'),ownsProcessLock:true});const cell=await host.createWorkspace('123e4567-e89b-42d3-a456-426614174000');host.close();const reopened=await LocalExchangeHost.open({root:require('node:path').join(process.cwd(),'store'),ownsProcessLock:true});if(reopened.query(cell.cellId).commitVersion!==0)throw Error('mismatch');reopened.close();process.stdout.write('standalone-ok');})().catch(()=>process.exitCode=1);`,
      ],
      {
        cwd: root,
        env: { ...process.env, NODE_PATH: "" },
        encoding: "utf8",
        timeout: 30000,
      },
    );
    expect(result).toBe("standalone-ok");
    expect(fs.existsSync(path.join(root, "node_modules"))).toBe(false);
  } finally {
    expect(path.dirname(root)).toBe(path.resolve(os.tmpdir()));
    expect(path.basename(root)).toMatch(/^vivi-local-package-test-/);
    fs.rmSync(root, { recursive: true, force: true });
  }
}, 60000);
