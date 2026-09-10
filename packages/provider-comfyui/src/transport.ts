import type { ComfyUIWorkflow, HistoryEntry, QueueResponse } from "./types";

const MAX_COMFYUI_DOWNLOAD_BYTES = 256 * 1024 * 1024;

export interface ComfyUITransport {
  ping(): Promise<boolean>;
  uploadImage(imageBuffer: ArrayBuffer, filename: string): Promise<string>;
  enqueue(workflow: ComfyUIWorkflow, clientId?: string): Promise<QueueResponse>;
  getHistory(promptId: string): Promise<HistoryEntry | null>;
  downloadOutput(
    filename: string,
    subfolder?: string,
    type?: string,
    maxBytes?: number,
  ): Promise<ArrayBuffer>;
  getSystemStats?(): Promise<Record<string, unknown>>;
  getNodeInfo?(nodeType: string): Promise<Record<string, unknown> | null>;

  getWebSocketUrl(clientId?: string): string | null;
}

export interface HttpTransportOptions {
  baseUrl: string;
  /** Deadline for one HTTP request, including response-body consumption. */
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
      return await this.withResponse("/system_stats", (res) => res.ok, { timeout: 5000 });
    } catch {
      return false;
    }
  }

  async getSystemStats(): Promise<Record<string, unknown>> {
    return this.withResponse("/system_stats", async (res) => {
      if (!res.ok) throw new Error(`ComfyUI connection error: ${res.status}`);
      return res.json();
    });
  }

  async uploadImage(imageBuffer: ArrayBuffer, filename: string): Promise<string> {
    const formData = new FormData();
    formData.append("image", new Blob([imageBuffer]), filename);
    formData.append("overwrite", "true");

    return this.withResponse(
      "/upload/image",
      async (res) => {
        if (!res.ok) throw new Error(`Image upload failed: ${res.status}`);
        const data = await res.json();
        return data.name as string;
      },
      { method: "POST", body: formData },
    );
  }

  async enqueue(workflow: ComfyUIWorkflow, clientId?: string): Promise<QueueResponse> {
    const body: Record<string, unknown> = { prompt: workflow };
    if (clientId) body.client_id = clientId;

    return this.withResponse(
      "/prompt",
      async (res) => {
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Workflow execution failed: ${res.status} ${text}`);
        }
        return res.json();
      },
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
  }

  async getHistory(promptId: string): Promise<HistoryEntry | null> {
    return this.withResponse(`/history/${promptId}`, async (res) => {
      if (!res.ok) return null;
      const data = await res.json();
      return (data[promptId] as HistoryEntry) ?? null;
    });
  }

  async downloadOutput(
    filename: string,
    subfolder = "",
    type = "output",
    maxBytes?: number,
  ): Promise<ArrayBuffer> {
    const effectiveMaxBytes = maxBytes ?? MAX_COMFYUI_DOWNLOAD_BYTES;
    if (
      !Number.isSafeInteger(effectiveMaxBytes) ||
      effectiveMaxBytes <= 0 ||
      effectiveMaxBytes > MAX_COMFYUI_DOWNLOAD_BYTES
    ) {
      throw new Error("ComfyUI download byte limit is invalid.");
    }
    const params = new URLSearchParams({ filename, subfolder, type });
    return this.withResponse(`/view?${params.toString()}`, (res) => {
      if (!res.ok) throw new Error(`Image download failed: ${res.status} ${filename}`);
      return readBoundedResponse(res, effectiveMaxBytes);
    });
  }

  async getNodeInfo(nodeType: string): Promise<Record<string, unknown> | null> {
    return this.withResponse(`/object_info/${nodeType}`, async (res) => {
      if (!res.ok) return null;
      const data = await res.json();
      return data[nodeType] as Record<string, unknown>;
    });
  }

  getWebSocketUrl(clientId = "vivi2d"): string | null {
    return `${toWebSocketBaseUrl(this.baseUrl)}/ws?clientId=${encodeURIComponent(clientId)}`;
  }

  private async withResponse<T>(
    path: string,
    consume: (res: Response) => T | Promise<T>,
    init?: RequestInit & { timeout?: number },
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutMs = init?.timeout ?? this.timeout;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response | undefined;

    try {
      response = await globalThis.fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
      });
      return await consume(response);
    } finally {
      clearTimeout(timer);
      // Status-only and early-error paths do not consume their owned body.
      if (response?.body && !response.bodyUsed) {
        void response.body.cancel().catch(() => {});
      }
    }
  }
}

async function readBoundedResponse(
  res: Response,
  maxBytes: number,
): Promise<ArrayBuffer> {
  if (
    !Number.isSafeInteger(maxBytes) ||
    maxBytes <= 0 ||
    maxBytes > MAX_COMFYUI_DOWNLOAD_BYTES
  ) {
    throw new Error("ComfyUI download byte limit is invalid.");
  }

  const contentLengthHeader = res.headers.get("content-length");
  if (contentLengthHeader !== null) {
    const contentLength = Number(contentLengthHeader);
    if (
      !Number.isSafeInteger(contentLength) ||
      contentLength < 0 ||
      contentLength > maxBytes
    ) {
      void res.body?.cancel().catch(() => {});
      throw new Error("ComfyUI download is too large.");
    }
  }

  if (!res.body) {
    throw new Error("ComfyUI download response body is unavailable.");
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        throw new Error("ComfyUI download is too large.");
      }
      chunks.push(value);
    }
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }

  const result = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result.buffer;
}
