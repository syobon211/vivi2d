import http from "node:http";
import { afterEach, describe, expect, it } from "vitest";

// electron/ipc/comfyui.cjs is CommonJS, so load it through require.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const comfyui = require("../ipc/comfyui.cjs");

const {
  MAX_COMFYUI_DOWNLOAD_BYTES,
  assertDownloadWithinLimit,
  validateEnqueueResponse,
  validateHistoryResponse,
  validateNodeInfoResponse,
  validateUploadImageResponse,
} = comfyui;

let server: http.Server | null = null;

afterEach(async () => {
  if (!server) return;
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  server = null;
});

function jsonBuffer(value: unknown): Buffer {
  return Buffer.from(JSON.stringify(value));
}

async function listen(handler: http.RequestListener): Promise<string> {
  server = http.createServer(handler);
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Test server did not bind to a TCP port.");
  }
  return `http://127.0.0.1:${address.port}`;
}

describe("electron/ipc/comfyui.cjs response validation", () => {
  it("validates upload image responses", () => {
    expect(validateUploadImageResponse(jsonBuffer({ name: "input.png" }))).toEqual({
      name: "input.png",
    });
    expect(() => validateUploadImageResponse(jsonBuffer({ name: "../secret.png" }))).toThrow();
    expect(() => validateUploadImageResponse(jsonBuffer({ name: 123 }))).toThrow();
  });

  it("validates enqueue responses", () => {
    const response = { prompt_id: "abc-123", number: 7, node_errors: {} };
    expect(validateEnqueueResponse(jsonBuffer(response))).toEqual(response);

    expect(() => validateEnqueueResponse(jsonBuffer({ prompt_id: "../x", number: 1 }))).toThrow();
    expect(() =>
      validateEnqueueResponse(jsonBuffer({ prompt_id: "abc", number: "7" })),
    ).toThrow("number must be finite");
  });

  it("validates history responses", () => {
    const entry = { outputs: { node: {} }, status: { completed: true } };
    expect(validateHistoryResponse(jsonBuffer({ p1: entry }), "p1")).toEqual(entry);
    expect(validateHistoryResponse(jsonBuffer({}), "p1")).toBeNull();
    expect(() => validateHistoryResponse(jsonBuffer({ p1: "bad" }), "p1")).toThrow(
      "prompt entry must be an object",
    );
  });

  it("validates node info responses", () => {
    const nodeInfo = { input: { required: {} } };
    expect(validateNodeInfoResponse(jsonBuffer({ Vivi2DNode: nodeInfo }), "Vivi2DNode")).toEqual(
      nodeInfo,
    );
    expect(validateNodeInfoResponse(jsonBuffer({}), "Vivi2DNode")).toBeNull();
    expect(() => validateNodeInfoResponse(jsonBuffer({ Vivi2DNode: [] }), "Vivi2DNode")).toThrow(
      "node entry must be an object",
    );
  });

  it("rejects malformed JSON and oversized downloads", () => {
    expect(() => validateUploadImageResponse(Buffer.from("{not json"))).toThrow(
      "malformed JSON",
    );
    expect(() =>
      assertDownloadWithinLimit({ byteLength: MAX_COMFYUI_DOWNLOAD_BYTES + 1 }),
    ).toThrow("too large");
  });

  it("does not echo provider response bodies in enqueue errors", async () => {
    const baseUrl = await listen((_req, res) => {
      res.writeHead(500, { "content-type": "text/plain" });
      res.end("C:/Users/example/private.png prompt text token=secret");
    });
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    comfyui.register({
      allowlists: {},
      handle(channel: string, handler: (...args: unknown[]) => unknown) {
        handlers.set(channel, handler);
      },
    });

    const handler = handlers.get("comfyui-enqueue");
    await expect(handler?.({}, { baseUrl, workflow: { nodes: [] } })).rejects.toThrow(
      "ComfyUI workflow failed with status 500.",
    );
    await expect(handler?.({}, { baseUrl, workflow: { nodes: [] } })).rejects.not.toThrow(
      /private\.png|prompt text|token=secret/,
    );
  });
});
