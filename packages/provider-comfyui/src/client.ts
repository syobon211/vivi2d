import type { ComfyUITransport } from "./transport";
import { HttpTransport } from "./transport";
import type {
  ComfyUIClientOptions,
  ComfyUIWorkflow,
  HistoryEntry,
  QueueResponse,
} from "./types";

const DEFAULT_BASE_URL = "http://127.0.0.1:8188";
const DEFAULT_TIMEOUT = 600_000;
const POLLING_INTERVAL_MS = 2000;
const POLLING_SYNTHETIC_PROGRESS_LIMIT = 95;
const POLLING_SYNTHETIC_PROGRESS_SMOOTHING = 20;

export class ComfyUIClient {
  private transport: ComfyUITransport;
  private timeout: number;
  private clientId: string;

  constructor(options?: ComfyUIClientOptions) {
    this.timeout = options?.timeout ?? DEFAULT_TIMEOUT;
    this.clientId = options?.clientId ?? "vivi2d";
    this.transport =
      options?.transport ??
      new HttpTransport({
        baseUrl: options?.baseUrl ?? DEFAULT_BASE_URL,
        timeout: this.timeout,
      });
  }

  async ping(): Promise<boolean> {
    return this.transport.ping();
  }

  async getSystemStats(): Promise<Record<string, unknown>> {
    if (!this.transport.getSystemStats) {
      throw new Error("transport does not support getSystemStats");
    }
    return this.transport.getSystemStats();
  }

  async uploadImage(imageBuffer: ArrayBuffer, filename: string): Promise<string> {
    return this.transport.uploadImage(imageBuffer, filename);
  }

  async enqueue(workflow: ComfyUIWorkflow, clientId?: string): Promise<QueueResponse> {
    return this.transport.enqueue(workflow, clientId ?? this.clientId);
  }

  async getHistory(promptId: string): Promise<HistoryEntry | null> {
    return this.transport.getHistory(promptId);
  }

  async downloadOutput(
    filename: string,
    subfolder = "",
    type = "output",
  ): Promise<ArrayBuffer> {
    return this.transport.downloadOutput(filename, subfolder, type);
  }

  async getNodeInfo(nodeType: string): Promise<Record<string, unknown> | null> {
    if (!this.transport.getNodeInfo) return null;
    return this.transport.getNodeInfo(nodeType);
  }

  async waitForCompletion(
    promptId: string,
    onProgress?: (step: number, total: number) => void,
  ): Promise<HistoryEntry> {
    const wsUrl = this.transport.getWebSocketUrl(this.clientId);
    if (wsUrl) {
      try {
        return await this.waitViaWebSocket(wsUrl, promptId, onProgress);
      } catch {}
    }
    return this.waitViaPolling(promptId, onProgress);
  }

  private waitViaWebSocket(
    wsUrl: string,
    promptId: string,
    onProgress?: (step: number, total: number) => void,
  ): Promise<HistoryEntry> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error("Timeout"));
      }, this.timeout);

      ws.onmessage = async (event) => {
        try {
          const msg = JSON.parse(typeof event.data === "string" ? event.data : "{}");
          if (msg.type === "progress" && msg.data?.prompt_id === promptId) {
            onProgress?.(msg.data.value ?? 0, msg.data.max ?? 100);
          }
          if (msg.type === "executed" && msg.data?.prompt_id === promptId) {
            clearTimeout(timeout);
            ws.close();
            const history = await this.getHistory(promptId);
            if (history) {
              resolve(history);
            } else {
              reject(new Error("Failed to retrieve history"));
            }
          }
          if (msg.type === "execution_error" && msg.data?.prompt_id === promptId) {
            clearTimeout(timeout);
            ws.close();
            reject(new Error("ComfyUI execution error"));
          }
        } catch {}
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        ws.close();
        reject(new Error("WebSocket connection error"));
      };
    });
  }

  private async waitViaPolling(
    promptId: string,
    onProgress?: (step: number, total: number) => void,
  ): Promise<HistoryEntry> {
    const start = Date.now();
    let pollCount = 0;
    let lastSyntheticStep = 0;
    while (Date.now() - start < this.timeout) {
      const history = await this.getHistory(promptId);
      if (history) {
        const status = history.status ?? {};
        const statusStr = status.status_str;
        if (statusStr && statusStr !== "success") {
          throw new Error(`ComfyUI execution ${statusStr}`);
        }
        if (status.completed) return history;
      }

      pollCount += 1;
      if (onProgress) {
        const syntheticStep = Math.min(
          POLLING_SYNTHETIC_PROGRESS_LIMIT,
          Math.round(
            100 * (1 - Math.exp(-pollCount / POLLING_SYNTHETIC_PROGRESS_SMOOTHING)),
          ),
        );
        if (syntheticStep > lastSyntheticStep) {
          lastSyntheticStep = syntheticStep;
          onProgress(syntheticStep, 100);
        }
      }

      await new Promise((r) => setTimeout(r, POLLING_INTERVAL_MS));
    }
      throw new Error("Timeout: workflow did not complete");
  }
}
