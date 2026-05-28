import type {
  ComfyUITransport,
  ComfyUIWorkflow,
  HistoryEntry,
  QueueResponse,
} from "@vivi2d/provider-comfyui";

export class ElectronComfyUITransport implements ComfyUITransport {
  constructor(private readonly baseUrl: string) {}

  async ping(): Promise<boolean> {
    try {
      const res = await window.electronAPI.comfyuiPing({ baseUrl: this.baseUrl });
      return res.ok;
    } catch {
      return false;
    }
  }

  async uploadImage(imageBuffer: ArrayBuffer, filename: string): Promise<string> {
    const res = await window.electronAPI.comfyuiUploadImageBuffer({
      baseUrl: this.baseUrl,
      data: imageBuffer,
      filename,
    });
    return res.name;
  }

  async enqueue(workflow: ComfyUIWorkflow, _clientId?: string): Promise<QueueResponse> {
    const res = await window.electronAPI.comfyuiEnqueue({
      baseUrl: this.baseUrl,
      workflow: workflow as Record<string, unknown>,
    });
    return res;
  }

  async getHistory(promptId: string): Promise<HistoryEntry | null> {
    const res = await window.electronAPI.comfyuiHistory({
      baseUrl: this.baseUrl,
      promptId,
    });
    if (!res) return null;
    return res as unknown as HistoryEntry;
  }

  async getNodeInfo(nodeType: string): Promise<Record<string, unknown> | null> {
    const res = await window.electronAPI.comfyuiNodeInfo({
      baseUrl: this.baseUrl,
      nodeType,
    });
    return res ?? null;
  }

  async downloadOutput(
    filename: string,
    subfolder = "",
    type = "output",
  ): Promise<ArrayBuffer> {
    return window.electronAPI.comfyuiDownload({
      baseUrl: this.baseUrl,
      filename,
      subfolder,
      type,
    });
  }

  getWebSocketUrl(clientId = "vivi2d"): string | null {
    const wsBaseUrl = this.baseUrl.replace(/\/+$/, "").replace(/^http/i, "ws");
    return `${wsBaseUrl}/ws?clientId=${encodeURIComponent(clientId)}`;
  }
}
