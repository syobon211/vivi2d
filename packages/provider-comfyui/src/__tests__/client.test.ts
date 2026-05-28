import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import {
  comfyuiErrorMessage,
  comfyuiExecutedMessage,
  comfyuiProgressMessage,
  comfyuiWsLink,
  server,
  useMswServer,
} from "@/test/mocks/useMswServer";
import { ComfyUIClient } from "../client";


useMswServer();

describe("ComfyUIClient", () => {
  describe("ping()", () => {
    it("接続成功でtrueを返す", async () => {
      let capturedUrl = "";
      server.use(
        http.get("http://127.0.0.1:8188/system_stats", ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json({ ok: true });
        }),
      );
      const client = new ComfyUIClient();

      const result = await client.ping();

      expect(result).toBe(true);
      expect(capturedUrl).toBe("http://127.0.0.1:8188/system_stats");
    });

    it("接続失敗でfalseを返す", async () => {
      server.use(
        http.get("http://127.0.0.1:8188/system_stats", () => HttpResponse.error()),
      );
      const client = new ComfyUIClient();

      const result = await client.ping();

      expect(result).toBe(false);
    });

    it("カスタムURLを使用する", async () => {
      let calledCustom = false;
      server.use(
        http.get("http://192.168.1.100:8188/system_stats", () => {
          calledCustom = true;
          return HttpResponse.json({ ok: true });
        }),
      );
      const client = new ComfyUIClient({ baseUrl: "http://192.168.1.100:8188" });

      await client.ping();

      expect(calledCustom).toBe(true);
    });
  });

  describe("uploadImage()", () => {
    it("画像をmultipart/form-dataでアップロードする", async () => {
      let imageSize = -1;
      let receivedOverwrite: string | null = null;
      server.use(
        http.post("http://127.0.0.1:8188/upload/image", async ({ request }) => {
          const formData = await request.formData();
          const image = formData.get("image");
          imageSize = image instanceof Blob ? image.size : -1;
          receivedOverwrite = formData.get("overwrite") as string | null;
          return HttpResponse.json({ name: "uploaded.png" });
        }),
      );
      const client = new ComfyUIClient();
      const buffer = new ArrayBuffer(8);

      const name = await client.uploadImage(buffer, "test.png");

      expect(name).toBe("uploaded.png");
      expect(imageSize).toBe(8);
      expect(receivedOverwrite).toBe("true");
    });

    it("アップロード失敗でエラーを投げる", async () => {
      server.use(
        http.post("http://127.0.0.1:8188/upload/image", () =>
          HttpResponse.json({}, { status: 500 }),
        ),
      );
      const client = new ComfyUIClient();

      await expect(client.uploadImage(new ArrayBuffer(8), "test.png")).rejects.toThrow(
        "Image upload failed",
      );
    });
  });

  describe("enqueue()", () => {
    it("ワークフローをPOSTしてprompt_idを返す", async () => {
      let receivedBody: { prompt: unknown; client_id?: string } | null = null;
      server.use(
        http.post("http://127.0.0.1:8188/prompt", async ({ request }) => {
          receivedBody = (await request.json()) as typeof receivedBody;
          return HttpResponse.json({ prompt_id: "abc-123", number: 1 });
        }),
      );
      const client = new ComfyUIClient();
      const workflow = {
        "1": { class_type: "LoadImage", inputs: { image: "test.png" } },
      };

      const result = await client.enqueue(workflow);

      expect(result.prompt_id).toBe("abc-123");
      expect(receivedBody).not.toBeNull();
      expect(receivedBody!.prompt).toEqual(workflow);
      expect(receivedBody!.client_id).toBe("vivi2d");
    });

    it("カスタム clientId を渡すと body に反映される", async () => {
      let receivedClientId: string | undefined;
      server.use(
        http.post("http://127.0.0.1:8188/prompt", async ({ request }) => {
          const body = (await request.json()) as { client_id?: string };
          receivedClientId = body.client_id;
          return HttpResponse.json({ prompt_id: "p", number: 0 });
        }),
      );
      const client = new ComfyUIClient({ clientId: "custom-client" });
      await client.enqueue({});
      expect(receivedClientId).toBe("custom-client");
    });

    it("実行失敗でエラーを投げる", async () => {
      server.use(
        http.post("http://127.0.0.1:8188/prompt", () =>
          HttpResponse.text("Invalid workflow", { status: 400 }),
        ),
      );
      const client = new ComfyUIClient();

      await expect(client.enqueue({})).rejects.toThrow("Workflow execution failed");
    });
  });

  describe("getHistory()", () => {
    it("履歴を取得する", async () => {
      const entry = { outputs: {}, status: { completed: true } };
      server.use(
        http.get("http://127.0.0.1:8188/history/abc-123", () =>
          HttpResponse.json({ "abc-123": entry }),
        ),
      );
      const client = new ComfyUIClient();

      const result = await client.getHistory("abc-123");

      expect(result?.status.completed).toBe(true);
    });

    it("レスポンスに該当 promptId が無い場合 null を返す", async () => {
      server.use(
        http.get("http://127.0.0.1:8188/history/unknown", () => HttpResponse.json({})),
      );
      const client = new ComfyUIClient();

      const result = await client.getHistory("unknown");

      expect(result).toBeNull();
    });

    it("HTTP 404 でも null を返す（fail-safe 経路）", async () => {
      server.use(
        http.get(
          "http://127.0.0.1:8188/history/nope",
          () => new HttpResponse(null, { status: 404 }),
        ),
      );
      const client = new ComfyUIClient();

      const result = await client.getHistory("nope");

      expect(result).toBeNull();
    });
  });

  describe("downloadOutput()", () => {
    it("出力画像をダウンロードする", async () => {
      let calledUrl = "";
      server.use(
        http.get("http://127.0.0.1:8188/view", ({ request }) => {
          calledUrl = request.url;
          const data = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
          return new HttpResponse(data, {
            status: 200,
            headers: { "Content-Type": "image/png" },
          });
        }),
      );
      const client = new ComfyUIClient();

      const result = await client.downloadOutput("output.png", "subfolder");

      expect(result.byteLength).toBe(4);
      expect(calledUrl).toContain("filename=output.png");
      expect(calledUrl).toContain("subfolder=subfolder");
      expect(calledUrl).toContain("type=output");
    });

    it("subfolder / type 省略時はデフォルト値で URL を組む", async () => {
      let calledUrl = "";
      server.use(
        http.get("http://127.0.0.1:8188/view", ({ request }) => {
          calledUrl = request.url;
          return new HttpResponse(new Uint8Array([0]), { status: 200 });
        }),
      );
      const client = new ComfyUIClient();

      await client.downloadOutput("a.png");

      expect(calledUrl).toContain("filename=a.png");
      expect(calledUrl).toContain("subfolder=");
      expect(calledUrl).toContain("type=output");
    });

    it("404 で例外を投げる", async () => {
      server.use(
        http.get(
          "http://127.0.0.1:8188/view",
          () => new HttpResponse(null, { status: 404 }),
        ),
      );
      const client = new ComfyUIClient();

      await expect(client.downloadOutput("missing.png")).rejects.toThrow(
        /Image download failed/,
      );
    });
  });

  describe("getSystemStats() (HTTP path)", () => {
    it("transport の HTTP 経路で JSON を返す", async () => {
      const payload = { devices: [{ name: "GPU0" }] };
      server.use(
        http.get("http://127.0.0.1:8188/system_stats", () => HttpResponse.json(payload)),
      );
      const client = new ComfyUIClient();
      await expect(client.getSystemStats()).resolves.toEqual(payload);
    });

    it("非 OK 応答で例外を投げる", async () => {
      server.use(
        http.get("http://127.0.0.1:8188/system_stats", () =>
          HttpResponse.json({}, { status: 500 }),
        ),
      );
      const client = new ComfyUIClient();
      await expect(client.getSystemStats()).rejects.toThrow(/connection error/);
    });
  });

  describe("getNodeInfo() (HTTP path)", () => {
    it("ノード情報の JSON を返す", async () => {
      const info = {
        Foo: {
          input: { required: { x: [["v"]] } },
          output: ["A"],
          name: "Foo",
        },
      };
      server.use(
        http.get("http://127.0.0.1:8188/object_info/Foo", () => HttpResponse.json(info)),
      );
      const client = new ComfyUIClient();
      const result = await client.getNodeInfo("Foo");
      expect(result).toEqual(info.Foo);
    });

    it("404 では null を返す", async () => {
      server.use(
        http.get(
          "http://127.0.0.1:8188/object_info/Missing",
          () => new HttpResponse(null, { status: 404 }),
        ),
      );
      const client = new ComfyUIClient();
      await expect(client.getNodeInfo("Missing")).resolves.toBeNull();
    });
  });

  describe("constructor", () => {
    it("末尾スラッシュを除去する", async () => {
      let capturedUrl = "";
      server.use(
        http.get("http://localhost:8188/system_stats", ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json({ ok: true });
        }),
      );
      const client = new ComfyUIClient({ baseUrl: "http://localhost:8188/" });

      await client.ping();

      expect(capturedUrl).toBe("http://localhost:8188/system_stats");
    });

    it("複数の末尾スラッシュも除去する", async () => {
      let capturedUrl = "";
      server.use(
        http.get("http://localhost:8188/system_stats", ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json({ ok: true });
        }),
      );
      const client = new ComfyUIClient({ baseUrl: "http://localhost:8188///" });

      await client.ping();

      expect(capturedUrl).toBe("http://localhost:8188/system_stats");
    });
  });

  describe("waitForCompletion (WebSocket)", () => {
    it("executed メッセージで履歴を取得して返す", async () => {
      const history = {
        outputs: { "9": { images: [{ filename: "out.png" }] } },
        status: { completed: true, status_str: "success" },
      };
      server.use(
        http.get("http://127.0.0.1:8188/history/p1", () =>
          HttpResponse.json({ p1: history }),
        ),
        comfyuiWsLink.addEventListener("connection", ({ client }) => {
          client.send(comfyuiExecutedMessage("p1"));
        }),
      );
      const client = new ComfyUIClient({ timeout: 5000 });
      const result = await client.waitForCompletion("p1");
      expect(result).toEqual(history);
    });

    it("progress メッセージで onProgress が呼ばれる", async () => {
      server.use(
        http.get("http://127.0.0.1:8188/history/p2", () =>
          HttpResponse.json({
            p2: { outputs: {}, status: { completed: true, status_str: "success" } },
          }),
        ),
        comfyuiWsLink.addEventListener("connection", ({ client }) => {
          client.send(comfyuiProgressMessage("p2", 3, 10));
          client.send(comfyuiProgressMessage("p2", 7, 10));
          client.send(comfyuiExecutedMessage("p2"));
        }),
      );
      const onProgress = vi.fn();
      const client = new ComfyUIClient({ timeout: 5000 });
      await client.waitForCompletion("p2", onProgress);
      expect(onProgress).toHaveBeenCalledWith(3, 10);
      expect(onProgress).toHaveBeenCalledWith(7, 10);
    });

    it("execution_error で polling にフォールバックして履歴を返す", async () => {
      const history = {
        outputs: {},
        status: { completed: true, status_str: "success" },
      };
      server.use(
        http.get("http://127.0.0.1:8188/history/p3", () =>
          HttpResponse.json({ p3: history }),
        ),
        comfyuiWsLink.addEventListener("connection", ({ client }) => {
          client.send(comfyuiErrorMessage("p3"));
        }),
      );
      const client = new ComfyUIClient({ timeout: 5000 });
      const result = await client.waitForCompletion("p3");
      expect(result).toEqual(history);
    });

    it("他 promptId のメッセージは無視される", async () => {
      const history = {
        outputs: {},
        status: { completed: true, status_str: "success" },
      };
      server.use(
        http.get("http://127.0.0.1:8188/history/p4", () =>
          HttpResponse.json({ p4: history }),
        ),
        comfyuiWsLink.addEventListener("connection", ({ client }) => {
          client.send(comfyuiProgressMessage("other", 5, 10));
          client.send(comfyuiExecutedMessage("other"));
          client.send(comfyuiExecutedMessage("p4"));
        }),
      );
      const onProgress = vi.fn();
      const client = new ComfyUIClient({ timeout: 5000 });
      const result = await client.waitForCompletion("p4", onProgress);
      expect(result).toEqual(history);
      expect(onProgress).not.toHaveBeenCalled();
    });

    it("不正な JSON メッセージは無視される（パースエラー耐性）", async () => {
      const history = {
        outputs: {},
        status: { completed: true, status_str: "success" },
      };
      server.use(
        http.get("http://127.0.0.1:8188/history/p5", () =>
          HttpResponse.json({ p5: history }),
        ),
        comfyuiWsLink.addEventListener("connection", ({ client }) => {
          client.send("not-a-json");
          client.send("{ bad json");
          client.send(comfyuiExecutedMessage("p5"));
        }),
      );
      const client = new ComfyUIClient({ timeout: 5000 });
      const result = await client.waitForCompletion("p5");
      expect(result).toEqual(history);
    });

    it("executed 後に history が見つからない場合は例外", async () => {
      server.use(
        http.get("http://127.0.0.1:8188/history/p6", () => HttpResponse.json({})),
        comfyuiWsLink.addEventListener("connection", ({ client }) => {
          client.send(comfyuiExecutedMessage("p6"));
        }),
      );
      const client = new ComfyUIClient({ timeout: 100 });
      await expect(client.waitForCompletion("p6")).rejects.toThrow(/Timeout/);
    }, 10000);
  });

  describe("waitForCompletion (polling fallback)", () => {
    function makePollingTransport(overrides: Record<string, unknown> = {}) {
      return {
        ping: vi.fn(async () => true),
        uploadImage: vi.fn(async () => "x"),
        enqueue: vi.fn(async () => ({ prompt_id: "p", number: 1 })),
        getHistory: vi.fn(async () => null),
        downloadOutput: vi.fn(async () => new ArrayBuffer(0)),
        getWebSocketUrl: vi.fn(() => null),
        ...overrides,
      };
    }

    it("履歴が completed になった時点で返る", async () => {
      const history = {
        outputs: { n: { text: ["a.psd"] } },
        status: { completed: true, status_str: "success" },
      };
      const transport = makePollingTransport({
        getHistory: vi.fn(async () => history),
      });
      const client = new ComfyUIClient({
        transport: transport as never,
        timeout: 5000,
      });

      const result = await client.waitForCompletion("p");
      expect(result).toBe(history);
      expect(transport.getHistory).toHaveBeenCalled();
    });

    it("status_str=error でポーリングが即座にエラーを投げる", async () => {
      const transport = makePollingTransport({
        getHistory: vi.fn(async () => ({
          outputs: {},
          status: { completed: false, status_str: "error" },
        })),
      });
      const client = new ComfyUIClient({
        transport: transport as never,
        timeout: 5000,
      });

      await expect(client.waitForCompletion("p")).rejects.toThrow(
        /ComfyUI execution error/,
      );
    });

    it("status_str=failed でポーリングが即座にエラーを投げる", async () => {
      const transport = makePollingTransport({
        getHistory: vi.fn(async () => ({
          outputs: {},
          status: { completed: false, status_str: "failed" },
        })),
      });
      const client = new ComfyUIClient({
        transport: transport as never,
        timeout: 5000,
      });

      await expect(client.waitForCompletion("p")).rejects.toThrow(
        /ComfyUI execution failed/,
      );
    });

    it("タイムアウト経過後にエラーを投げる", async () => {
      const transport = makePollingTransport({
        getHistory: vi.fn(async () => null),
      });
      const client = new ComfyUIClient({
        transport: transport as never,
        timeout: 1,
      });

      await expect(client.waitForCompletion("p")).rejects.toThrow(/Timeout/);
    }, 10000);
  });

  describe("getSystemStats() / getNodeInfo() (transport delegation)", () => {
    it("getSystemStats が transport 経由で呼ばれる", async () => {
      const transport = {
        ping: vi.fn(),
        uploadImage: vi.fn(),
        enqueue: vi.fn(),
        getHistory: vi.fn(),
        downloadOutput: vi.fn(),
        getSystemStats: vi.fn(async () => ({ foo: "bar" })),
        getNodeInfo: vi.fn(async () => null),
        getWebSocketUrl: vi.fn(() => null),
      };
      const client = new ComfyUIClient({ transport: transport as never });

      await expect(client.getSystemStats()).resolves.toEqual({ foo: "bar" });
      expect(transport.getSystemStats).toHaveBeenCalled();
    });

    it("getSystemStats 未サポートの transport ではエラー", async () => {
      const transport = {
        ping: vi.fn(),
        uploadImage: vi.fn(),
        enqueue: vi.fn(),
        getHistory: vi.fn(),
        downloadOutput: vi.fn(),
        getWebSocketUrl: vi.fn(() => null),
      };
      const client = new ComfyUIClient({ transport: transport as never });
      await expect(client.getSystemStats()).rejects.toThrow(/does not support/);
    });

    it("getNodeInfo 未サポートの transport では null を返す", async () => {
      const transport = {
        ping: vi.fn(),
        uploadImage: vi.fn(),
        enqueue: vi.fn(),
        getHistory: vi.fn(),
        downloadOutput: vi.fn(),
        getWebSocketUrl: vi.fn(() => null),
      };
      const client = new ComfyUIClient({ transport: transport as never });
      await expect(client.getNodeInfo("foo")).resolves.toBeNull();
    });
  });
});
