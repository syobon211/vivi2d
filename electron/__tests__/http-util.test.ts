import http from "node:http";
import { afterEach, describe, expect, it } from "vitest";

// electron/http-util.cjs is CommonJS, so load it through require.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { httpGet, httpPost } = require("../http-util.cjs");

let server: http.Server | null = null;

afterEach(async () => {
  if (!server) return;
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  server = null;
});

async function listen(handler: http.RequestListener): Promise<string> {
  server = http.createServer(handler);
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Test server did not bind to a TCP port.");
  }
  return `http://127.0.0.1:${address.port}`;
}

describe("electron/http-util.cjs", () => {
  it("rejects oversized GET responses from content-length before buffering", async () => {
    const baseUrl = await listen((_req, res) => {
      res.writeHead(200, { "content-length": "4096" });
      res.end("x");
    });

    await expect(httpGet(baseUrl, { maxBytes: 4 })).rejects.toThrow("too large");
  });

  it("rejects oversized GET responses while streaming", async () => {
    const baseUrl = await listen((_req, res) => {
      res.writeHead(200);
      res.write(Buffer.from("1234"));
      res.end(Buffer.from("5678"));
    });

    await expect(httpGet(baseUrl, { maxBytes: 4 })).rejects.toThrow("too large");
  });

  it("rejects oversized POST responses while streaming", async () => {
    const baseUrl = await listen((_req, res) => {
      res.writeHead(200);
      res.write(Buffer.from("1234"));
      res.end(Buffer.from("5678"));
    });

    await expect(httpPost(baseUrl, "{}", {}, { maxBytes: 4 })).rejects.toThrow(
      "too large",
    );
  });

  it("keeps successful responses available under the byte limit", async () => {
    const baseUrl = await listen((_req, res) => {
      res.writeHead(200);
      res.end("ok");
    });

    const result = await httpGet(baseUrl, { maxBytes: 16 });
    expect(result.status).toBe(200);
    expect(result.body.toString()).toBe("ok");
  });
});
