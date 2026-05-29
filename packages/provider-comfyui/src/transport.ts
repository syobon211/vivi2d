import type { ComfyUIWorkflow, HistoryEntry, QueueResponse } from "./types";

export interface ComfyUITransport {
  ping(): Promise<boolean>;
  uploadImage(imageBuffer: ArrayBuffer, filename: string): Promise<string>;
  enqueue(workflow: ComfyUIWorkflow, clientId?: string): Promise<QueueResponse>;
  getHistory(promptId: string): Promise<HistoryEntry | null>;
  downloadOutput(
    filename: string,
    subfolder?: string,
    type?: string,
  ): Promise<ArrayBuffer>;
  getSystemStats?(): Promise<Record<string, unknown>>;
  getNodeInfo?(nodeType: string): Promise<Record<string, unknown> | null>;

  getWebSocketUrl(clientId?: string): string | null;
}

export interface HttpTransportOptions {
  baseUrl: string;
  timeout: number;
}

function trimTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 47) end -= 1;
  return value.slice(0, end);
}

function toWebSocketBaseUrl(value: string): string {
  const trimmed = trimTrailingSlashes(value);
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("https:")) return `wss:${trimmed.slice(6)}`;
  if (lower.startsWith("http:")) return `ws:${trimmed.slice(5)}`;
  return trimmed;
}

export class HttpTransport implements ComfyUITransport {
  private baseUrl: string;
  private timeout: number;

  constructor(options: HttpTransportOptions) {
    this.baseUrl = trimTrailingSlashes(options.baseUrl);
    this.timeout = options.timeout;
  }

  async ping(): Promise<boolean> {
    try {
      const res = await this.fetch("/system_stats", { timeout: 5000 });
      return res.ok;
    } catch {
      return false;
    }
  }

  async getSystemStats(): Promise<Record<string, unknown>> {
    const res = await this.fetch("/system_stats");
    if (!res.ok) throw new Error(`ComfyUI connection error: ${res.status}`);
    return res.json();
  }

  async uploadImage(imageBuffer: ArrayBuffer, filename: string): Promise<string> {
    const formData = new FormData();
    formData.append("image", new Blob([imageBuffer]), filename);
    formData.append("overwrite", "true");

    const res = await globalThis.fetch(`${this.baseUrl}/upload/image`, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) throw new Error(`Image upload failed: ${res.status}`);
    const data = await res.json();
    return data.name as string;
  }

  async enqueue(workflow: ComfyUIWorkflow, clientId?: string): Promise<QueueResponse> {
    const body: Record<string, unknown> = { prompt: workflow };
    if (clientId) body.client_id = clientId;

    const res = await this.fetch("/prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Workflow execution failed: ${res.status} ${text}`);
    }
    return res.json();
  }

  async getHistory(promptId: string): Promise<HistoryEntry | null> {
    const res = await this.fetch(`/history/${promptId}`);
    if (!res.ok) return null;
    const data = await res.json();
    return (data[promptId] as HistoryEntry) ?? null;
  }

  async downloadOutput(
    filename: string,
    subfolder = "",
    type = "output",
  ): Promise<ArrayBuffer> {
    const params = new URLSearchParams({ filename, subfolder, type });
    const res = await this.fetch(`/view?${params.toString()}`);
    if (!res.ok) throw new Error(`Image download failed: ${res.status} ${filename}`);
    return res.arrayBuffer();
  }

  async getNodeInfo(nodeType: string): Promise<Record<string, unknown> | null> {
    const res = await this.fetch(`/object_info/${nodeType}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data[nodeType] as Record<string, unknown>;
  }

  getWebSocketUrl(clientId = "vivi2d"): string | null {
    return `${toWebSocketBaseUrl(this.baseUrl)}/ws?clientId=${encodeURIComponent(clientId)}`;
  }

  private async fetch(
    path: string,
    init?: RequestInit & { timeout?: number },
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutMs = init?.timeout ?? this.timeout;
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await globalThis.fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }
}
