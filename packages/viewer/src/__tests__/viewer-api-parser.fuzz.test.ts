import { describe, expect, it } from "vitest";

// packages/viewer/electron/viewer-api-schema.cjs is CommonJS.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const schema = require("../../electron/viewer-api-schema.cjs");

const {
  parseViewerApiMessage,
  VIVI_VIEWER_API_NAME,
  VIVI_VIEWER_API_VERSION,
} = schema;

function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = Math.imul(1664525, state) + 1013904223;
    return state >>> 0;
  };
}

function randomScalar(next: () => number): unknown {
  switch (next() % 8) {
    case 0:
      return null;
    case 1:
      return next() % 2 === 0;
    case 2:
      return (next() % 10_000) / 17;
    case 3:
      return `s-${next().toString(36)}`;
    case 4:
      return "__proto__";
    case 5:
      return "C:/Users/Alice/private-token";
    case 6:
      return ["viewer.state.get", next() % 32];
    default:
      return { nested: next() % 4, extra: "value" };
  }
}

function randomMessage(seed: number): string {
  const next = makeRng(seed);
  const message: Record<string, unknown> = {};
  const keys = ["api", "version", "id", "type", "data", "__proto__", "extra"];
  for (const key of keys) {
    if (next() % 3 !== 0) {
      message[key] = randomScalar(next);
    }
  }
  if (seed % 7 === 0) {
    message.api = VIVI_VIEWER_API_NAME;
    message.version = VIVI_VIEWER_API_VERSION;
    message.id = `id-${seed}`;
    message.type = seed % 14 === 0 ? "viewer.state.get" : "viewer.signals.set";
    message.data =
      message.type === "viewer.state.get"
        ? {}
        : { values: { [`Param${seed}`]: (seed % 200) / 100 - 1 } };
  }
  return JSON.stringify(message);
}

describe("Viewer API parser deterministic fuzz boundaries", () => {
  it("accepts only normalized envelopes and rejects malformed objects safely", () => {
    for (let seed = 1; seed <= 256; seed += 1) {
      try {
        const parsed = parseViewerApiMessage(randomMessage(seed));
        expect(parsed.api).toBe(VIVI_VIEWER_API_NAME);
        expect(parsed.version).toBe(VIVI_VIEWER_API_VERSION);
        expect(typeof parsed.id).toBe("string");
        expect(typeof parsed.type).toBe("string");
        expect(Object.prototype).not.toHaveProperty("polluted");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect(String((error as Error).message)).not.toContain("private-token");
        expect(String((error as Error).message)).not.toContain("Alice");
      }
    }
  });

  it("rejects non-json text and buffers without leaking raw payloads", () => {
    const cases: unknown[] = [
      "not json C:/Users/Alice/private-token",
      Buffer.from("not json token=secret"),
      { toString: () => "not json private-token" },
      null,
      undefined,
    ];

    for (const input of cases) {
      expect(() => parseViewerApiMessage(input)).toThrow(Error);
    }
  });
});
