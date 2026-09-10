import { EventEmitter } from "node:events";
import http from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";

// electron/http-util.cjs is CommonJS, so load it through require.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { httpGet, httpPost } = require("../http-util.cjs");

let server: http.Server | null = null;

afterEach(async () => {
  if (!server) return;
  server.closeAllConnections();
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
  it.each(["GET", "POST"])("bounds the complete %s response despite body activity", async (method) => {
    const baseUrl = await listen((_req, res) => {
      res.writeHead(200);
      res.write(" ");
      const interval = setInterval(() => res.write(" "), 20);
      const finish = setTimeout(() => res.end(), 400);
      res.once("close", () => {
        clearInterval(interval);
        clearTimeout(finish);
      });
    });
    const request = method === "GET"
      ? httpGet(baseUrl, { timeout: 120 })
      : httpPost(baseUrl, "{}", {}, { timeout: 120 });
    const outcome = await request.then(
      () => "resolved",
      (error: Error) => error.message === "Request timed out." ? "timed-out" : "other-rejection",
    );
    expect(outcome).toBe("timed-out");
  }, 2000);

  it.each(["GET", "POST"])("does not reset the %s deadline when headers arrive", async (method) => {
    const baseUrl = await listen((_req, res) => {
      let finish: ReturnType<typeof setTimeout> | undefined;
      const headers = setTimeout(() => {
        res.writeHead(200);
        res.write(" ");
        finish = setTimeout(() => res.end(), 120);
      }, 120);
      res.once("close", () => {
        clearTimeout(headers);
        clearTimeout(finish);
      });
    });
    const request = method === "GET"
      ? httpGet(baseUrl, { timeout: 200 })
      : httpPost(baseUrl, "{}", {}, { timeout: 200 });
    const outcome = await request.then(
      () => "resolved",
      (error: Error) => error.message === "Request timed out." ? "timed-out" : "other-rejection",
    );
    expect(outcome).toBe("timed-out");
  }, 2000);

  it.each(["GET", "POST"])("clears the %s absolute timer on every terminal event", async (method) => {
    vi.useFakeTimers();
    try {
      const terminals = ["success", "request-error", "aborted", "response-error", "declared-size", "stream-size", "timeout"];
      if (method === "POST") terminals.push("write-error");
      for (const terminal of terminals) {
        const request = Object.assign(new EventEmitter(), {
          destroy: vi.fn(),
          write: vi.fn(() => {
            if (terminal === "write-error") throw new Error("synthetic failure");
          }),
          end: vi.fn(),
        });
        const response = Object.assign(new EventEmitter(), {
          headers: {} as Record<string, string>,
          statusCode: 200,
        });
        let respond: ((value: typeof response) => void) | undefined;
        const spy = method === "GET"
          ? vi.spyOn(http, "get").mockImplementation((...args: unknown[]) => {
              respond = args.at(-1) as typeof respond;
              return request as unknown as http.ClientRequest;
            })
          : vi.spyOn(http, "request").mockImplementation((...args: unknown[]) => {
              respond = args.at(-1) as typeof respond;
              return request as unknown as http.ClientRequest;
            });
        try {
          const pending = method === "GET"
            ? httpGet("http://127.0.0.1/fixture", { timeout: 100, maxBytes: 4 })
            : httpPost("http://127.0.0.1/fixture", "{}", {}, { timeout: 100, maxBytes: 4 });
          const outcome = pending.then(() => "resolved", () => "rejected");
          expect(vi.getTimerCount()).toBe(terminal === "write-error" ? 0 : 1);
          if (terminal === "declared-size") response.headers["content-length"] = "5";
          if (terminal !== "write-error") respond?.(response);
          if (terminal === "success") response.emit("end");
          if (terminal === "request-error") request.emit("error", new Error("synthetic failure"));
          if (terminal === "aborted") response.emit("aborted");
          if (terminal === "response-error") response.emit("error", new Error("synthetic failure"));
          if (terminal === "stream-size") response.emit("data", Buffer.alloc(5));
          if (terminal === "timeout") await vi.advanceTimersByTimeAsync(100);
          expect(await outcome).toBe(terminal === "success" ? "resolved" : "rejected");
          expect(vi.getTimerCount()).toBe(0);
          const destroyCount = request.destroy.mock.calls.length;
          await vi.advanceTimersByTimeAsync(200);
          expect(request.destroy).toHaveBeenCalledTimes(destroyCount);
          if (terminal === "timeout") expect(request.destroy).toHaveBeenCalledOnce();
        } finally {
          spy.mockRestore();
          vi.clearAllTimers();
        }
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(["GET", "POST"])("rejects an interrupted %s response body", async (method) => {
    const baseUrl = await listen((_req, res) => {
      res.writeHead(200, { "content-length": "100" });
      res.write("short");
      // Close after headers arrive: ClientRequest no longer emits the failure,
      // and its timeout cannot fire once the response socket is gone.
      setTimeout(() => res.destroy(), 10);
    });

    const request = method === "GET"
      ? httpGet(baseUrl, { timeout: 100 })
      : httpPost(baseUrl, "{}", {}, { timeout: 100 });
    await expect(request).rejects.toThrow("HTTP response body was interrupted.");
  }, 1000);

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

  it.each(["GET", "POST"])("keeps successful %s responses available under the byte limit", async (method) => {
    const baseUrl = await listen((_req, res) => {
      res.writeHead(200);
      res.end("ok");
    });

    const result = await (method === "GET"
      ? httpGet(baseUrl, { maxBytes: 16 })
      : httpPost(baseUrl, "{}", {}, { maxBytes: 16 }));
    expect(result.status).toBe(200);
    expect(result.body.toString()).toBe("ok");
  });
});
