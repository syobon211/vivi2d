import path from "node:path";
import { describe, expect, it } from "vitest";

// electron/security.cjs and ipc-contract.cjs are CommonJS.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const security = require("../security.cjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ipcContract = require("../ipc-contract.cjs");

const { assertWithinDirectory, validateSafeRelativePath } = security;
const { validateIpcArgs } = ipcContract;

function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
}

function randomPath(seed: number): string {
  const next = makeRng(seed);
  const atoms = [
    "layers",
    "body.png",
    "..",
    ".",
    "",
    "CON",
    "NUL.txt",
    "folder.",
    "C:",
    "\\\\server",
    "private-token",
    `file-${next().toString(36)}.png`,
  ];
  const parts = Array.from({ length: 1 + (next() % 5) }, () => atoms[next() % atoms.length]);
  return parts.join(next() % 2 === 0 ? "/" : "\\");
}

describe("IPC payload and path canonicalization deterministic fuzz boundaries", () => {
  it("never accepts traversal, absolute, or reserved relative export paths", () => {
    const base = path.resolve("tmp", "ipc-fuzz-export");
    for (const candidate of ["layers/body.png", "layers\\body.png"]) {
      expect(validateSafeRelativePath(candidate)).toBe(candidate);
      expect(assertWithinDirectory(base, candidate)).toBe(path.resolve(base, candidate));
    }
    for (let seed = 1; seed <= 256; seed += 1) {
      const candidate = randomPath(seed);
      let safeRelative: string;
      try {
        safeRelative = validateSafeRelativePath(candidate);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        continue;
      }
      expect(safeRelative).toBe(candidate);
      expect(path.win32.isAbsolute(safeRelative)).toBe(false);
      expect(safeRelative).not.toMatch(/^[a-zA-Z]:/);
      for (const segment of safeRelative.split(/[\\/]+/)) {
        expect(["", ".", ".."]).not.toContain(segment);
        expect(segment).not.toMatch(/[<>:"|?*]|[. ]$/);
        expect(segment).not.toMatch(/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i);
      }
      const resolved = assertWithinDirectory(base, safeRelative);
      expect(resolved.startsWith(`${base}${path.sep}`)).toBe(true);
    }
  });

  it("rejects malformed channel payloads without non-Error throws", () => {
    const payloads = [
      ["save-file", [{ data: "{}", defaultName: "project.vivi", debug: true }]],
      ["write-export-files", [{ dirPath: "C:/exports", files: [{ path: "../x", content: 123 }] }]],
      ["comfyui-enqueue", [{ baseUrl: "file:///tmp/socket", workflow: "not-object" }]],
      ["comfyui-history", [{ baseUrl: "http://127.0.0.1:8188", promptId: "../x", debug: true }]],
      ["comfyui-upload-image-buffer", [{ baseUrl: "http://127.0.0.1:8188", filename: "x.png" }]],
      ["unknown-channel", []],
    ] as const;

    for (const [channel, args] of payloads) {
      expect(() => validateIpcArgs(channel, args)).toThrow(Error);
    }
  });
});
