import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ElectronComfyUITransport } from "@/lib/comfyui-electron-transport";


interface FakeAPI {
  comfyuiPing: ReturnType<typeof vi.fn>;
  comfyuiUploadImageBuffer: ReturnType<typeof vi.fn>;
  comfyuiEnqueue: ReturnType<typeof vi.fn>;
  comfyuiHistory: ReturnType<typeof vi.fn>;
  comfyuiNodeInfo: ReturnType<typeof vi.fn>;
  comfyuiDownload: ReturnType<typeof vi.fn>;
}

let api: FakeAPI;
const BASE = "http://127.0.0.1:8188";
const originalAPI = window.electronAPI;

beforeEach(() => {
  api = {
    comfyuiPing: vi.fn(),
    comfyuiUploadImageBuffer: vi.fn(),
    comfyuiEnqueue: vi.fn(),
    comfyuiHistory: vi.fn(),
    comfyuiNodeInfo: vi.fn(),
    comfyuiDownload: vi.fn(),
  };
  window.electronAPI = api as any;
});

afterEach(() => {
  window.electronAPI = originalAPI;
});

describe("ElectronComfyUITransport", () => {
  describe("ping", () => {
    it("IPC 応答の ok=true をそのまま返す", async () => {
      api.comfyuiPing.mockResolvedValue({ ok: true });
      const t = new ElectronComfyUITransport(BASE);
      expect(await t.ping()).toBe(true);
      expect(api.comfyuiPing).toHaveBeenCalledWith({ baseUrl: BASE });
    });

    it("IPC 応答の ok=false はそのまま false を返す", async () => {
      api.comfyuiPing.mockResolvedValue({ ok: false });
      const t = new ElectronComfyUITransport(BASE);
      expect(await t.ping()).toBe(false);
    });

    it("IPC が reject したら例外を飲んで false を返す", async () => {
      api.comfyuiPing.mockRejectedValue(new Error("network down"));
      const t = new ElectronComfyUITransport(BASE);
      expect(await t.ping()).toBe(false);
    });
  });

  describe("uploadImage", () => {
    it("res.name を返す", async () => {
      api.comfyuiUploadImageBuffer.mockResolvedValue({ name: "uploaded.png" });
      const t = new ElectronComfyUITransport(BASE);
      const buf = new ArrayBuffer(8);
      const name = await t.uploadImage(buf, "foo.png");
      expect(name).toBe("uploaded.png");
      expect(api.comfyuiUploadImageBuffer).toHaveBeenCalledWith({
        baseUrl: BASE,
        data: buf,
        filename: "foo.png",
      });
    });
  });

  describe("enqueue", () => {
    it("workflow を Record として渡し応答をそのまま返す", async () => {
      const response = { prompt_id: "abc", number: 1, node_errors: {} };
      api.comfyuiEnqueue.mockResolvedValue(response);
      const t = new ElectronComfyUITransport(BASE);
      const workflow = { node: { class_type: "x" } };
      const res = await t.enqueue(workflow as any);
      expect(res).toBe(response);
      expect(api.comfyuiEnqueue).toHaveBeenCalledWith({
        baseUrl: BASE,
        workflow,
      });
    });
  });

  describe("getHistory", () => {
    it("応答が falsy (null/undefined) なら null を返す", async () => {
      api.comfyuiHistory.mockResolvedValue(null);
      const t = new ElectronComfyUITransport(BASE);
      expect(await t.getHistory("pid")).toBeNull();
    });

    it("応答オブジェクトはそのまま返す", async () => {
      const entry = { status: "ok", outputs: {} };
      api.comfyuiHistory.mockResolvedValue(entry);
      const t = new ElectronComfyUITransport(BASE);
      expect(await t.getHistory("pid")).toBe(entry);
      expect(api.comfyuiHistory).toHaveBeenCalledWith({
        baseUrl: BASE,
        promptId: "pid",
      });
    });
  });

  describe("getNodeInfo", () => {
    it("returns the node metadata from IPC", async () => {
      const nodeInfo = { display_name: "ViviSeeThroughDecompose" };
      api.comfyuiNodeInfo.mockResolvedValue(nodeInfo);
      const t = new ElectronComfyUITransport(BASE);
      await expect(t.getNodeInfo("ViviSeeThroughDecompose")).resolves.toBe(nodeInfo);
      expect(api.comfyuiNodeInfo).toHaveBeenCalledWith({
        baseUrl: BASE,
        nodeType: "ViviSeeThroughDecompose",
      });
    });

    it("returns null when the node is missing", async () => {
      api.comfyuiNodeInfo.mockResolvedValue(null);
      const t = new ElectronComfyUITransport(BASE);
      await expect(t.getNodeInfo("MissingNode")).resolves.toBeNull();
    });
  });

  describe("downloadOutput", () => {
    it("IPC の戻り値 (ArrayBuffer) をそのまま返す", async () => {
      const buf = new ArrayBuffer(4);
      api.comfyuiDownload.mockResolvedValue(buf);
      const t = new ElectronComfyUITransport(BASE);
      expect(await t.downloadOutput("out.png")).toBe(buf);
      expect(api.comfyuiDownload).toHaveBeenCalledWith({
        baseUrl: BASE,
        filename: "out.png",
        subfolder: "",
        type: "output",
      });
    });

    it("subfolder/type の指定が IPC 引数に反映される", async () => {
      const buf = new ArrayBuffer(8);
      api.comfyuiDownload.mockResolvedValue(buf);
      const t = new ElectronComfyUITransport(BASE);
      await t.downloadOutput("x.png", "sub", "temp");
      expect(api.comfyuiDownload).toHaveBeenCalledWith({
        baseUrl: BASE,
        filename: "x.png",
        subfolder: "sub",
        type: "temp",
      });
    });
  });

  describe("getWebSocketUrl", () => {
    it("builds a ComfyUI WebSocket URL from the Electron baseUrl", () => {
      const t = new ElectronComfyUITransport(BASE);
      expect(t.getWebSocketUrl()).toBe("ws://127.0.0.1:8188/ws?clientId=vivi2d");
      expect(t.getWebSocketUrl("clientId")).toBe(
        "ws://127.0.0.1:8188/ws?clientId=clientId",
      );
    });

    it("converts https baseUrl to wss", () => {
      const t = new ElectronComfyUITransport("https://example.com:8188///");
      expect(t.getWebSocketUrl("client id")).toBe(
        "wss://example.com:8188/ws?clientId=client%20id",
      );
    });
  });
});
