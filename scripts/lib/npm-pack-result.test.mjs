import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readSinglePackEntry } from "./npm-pack-result.mjs";

let tempDir = null;

afterEach(() => {
  if (tempDir) fs.rmSync(tempDir, { force: true, recursive: true });
  tempDir = null;
});

describe("npm pack result helpers", () => {
  it("reads normal UTF-8 npm pack JSON", () => {
    const file = writePackResult(Buffer.from(packJson(), "utf8"));
    expect(readSinglePackEntry(file).filename).toBe("vivi2d-web-0.1.0-alpha.0.tgz");
  });

  it("reads PowerShell redirected UTF-16LE npm pack JSON", () => {
    const file = writePackResult(
      Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(packJson(), "utf16le")]),
    );
    expect(readSinglePackEntry(file).name).toBe("@vivi2d/web");
  });

  it("rejects pack results that do not contain exactly one entry", () => {
    const file = writePackResult(Buffer.from("[]", "utf8"));
    expect(() => readSinglePackEntry(file)).toThrow(
      "must contain exactly one npm pack result",
    );
  });
});

function writePackResult(bytes) {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vivi2d-pack-result-"));
  const file = path.join(tempDir, "web-pack-result.json");
  fs.writeFileSync(file, bytes);
  return file;
}

function packJson() {
  return `${JSON.stringify([
    {
      filename: "vivi2d-web-0.1.0-alpha.0.tgz",
      name: "@vivi2d/web",
      version: "0.1.0-alpha.0",
    },
  ])}\n`;
}
