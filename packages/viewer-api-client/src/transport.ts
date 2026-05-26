import { ViviViewerApiClientError } from "./errors.js";
import {
  DEFAULT_VIEWER_API_MAX_FRAME_BYTES,
  DEFAULT_VIEWER_API_MAX_REQUEST_BYTES,
  DEFAULT_VIEWER_API_TIMEOUT_MS,
  VIVI_VIEWER_API_NAME,
  VIVI_VIEWER_API_VERSION,
  type ViviViewerApiEnvelope,
  type ViviViewerApiEventListener,
  type ViviViewerApiResponse,
} from "./protocol.js";

export interface ViviViewerWebSocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener?: (
    type: string,
    listener: (...args: unknown[]) => void,
    options?: { once?: boolean },
  ) => void;
  removeEventListener?: (type: string, listener: (...args: unknown[]) => void) => void;
  on?: (type: string, listener: (...args: unknown[]) => void) => void;
  once?: (type: string, listener: (...args: unknown[]) => void) => void;
  off?: (type: string, listener: (...args: unknown[]) => void) => void;
}

export type ViviViewerWebSocketFactory = (endpoint: string) => ViviViewerWebSocketLike;

export interface ViviViewerTransportOptions {
  endpoint: string;
  webSocketFactory: ViviViewerWebSocketFactory;
  timeoutMs?: number;
  maxFrameBytes?: number;
  maxRequestBytes?: number;
}

export class ViviViewerTransport {
  private static readonly maxBufferedMessages = 128;
  private static readonly bufferedTtlMs = 5 * 60_000;
  private readonly endpoint: string;
  private readonly webSocketFactory: ViviViewerWebSocketFactory;
  private readonly timeoutMs: number;
  private readonly maxFrameBytes: number;
  private readonly maxRequestBytes: number;
  private socket: ViviViewerWebSocketLike | null = null;
  private sequence = 0;
  private readonly pending = new Map<
    string,
    Array<{
      resolve: (message: ViviViewerApiResponse) => void;
      reject: (error: unknown) => void;
      timer: ReturnType<typeof setTimeout>;
    }>
  >();
  private readonly buffered = new Map<
    string,
    Array<{ message: ViviViewerApiResponse; receivedAt: number }>
  >();
  private readonly eventListeners = new Set<ViviViewerApiEventListener>();

  constructor(options: ViviViewerTransportOptions) {
    this.endpoint = options.endpoint;
    this.webSocketFactory = options.webSocketFactory;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_VIEWER_API_TIMEOUT_MS;
    this.maxFrameBytes = options.maxFrameBytes ?? DEFAULT_VIEWER_API_MAX_FRAME_BYTES;
    this.maxRequestBytes =
      options.maxRequestBytes ?? DEFAULT_VIEWER_API_MAX_REQUEST_BYTES;
  }

  async connect() {
    if (this.socket?.readyState === 1) return;
    const socket = this.webSocketFactory(this.endpoint);
    this.socket = socket;
    addSocketListener(socket, "message", (event) => this.handleMessage(event));
    addSocketListener(socket, "close", () => this.rejectAll("disconnected"));
    addSocketListener(socket, "error", (event) => {
      this.rejectAll("transport_unavailable", event);
    });
    if (socket.readyState === 1) return;
    await waitForSocketOpen(socket, this.timeoutMs);
  }

  close(code?: number, reason?: string) {
    this.socket?.close(code, reason);
    this.rejectAll("disconnected");
  }

  onEvent(listener: ViviViewerApiEventListener) {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  send(type: string, data: Record<string, unknown> = {}) {
    const socket = this.requireSocket();
    const id = this.nextId();
    const payload: ViviViewerApiEnvelope = {
      api: VIVI_VIEWER_API_NAME,
      version: VIVI_VIEWER_API_VERSION,
      id,
      type,
      data,
    };
    const serialized = JSON.stringify(payload);
    const bytes = byteLength(serialized);
    if (bytes > this.maxFrameBytes) {
      throw new ViviViewerApiClientError({
        code: "frame_too_large",
        message: "Viewer API request exceeds the WebSocket text frame limit.",
        details: { limitBytes: this.maxFrameBytes },
      });
    }
    if (bytes > this.maxRequestBytes) {
      throw new ViviViewerApiClientError({
        code: "payload_too_large",
        message: "Viewer API request exceeds the request payload limit.",
        details: { limitBytes: this.maxRequestBytes },
      });
    }
    socket.send(serialized);
    return id;
  }

  async request<TData = unknown>(
    type: string,
    data: Record<string, unknown> = {},
  ): Promise<ViviViewerApiResponse<TData>> {
    const id = this.send(type, data);
    return this.waitForId<TData>(id);
  }

  waitForId<TData = unknown>(
    id: string,
    options: { timeoutMs?: number } = {},
  ): Promise<ViviViewerApiResponse<TData>> {
    this.pruneBuffered();
    const buffered = this.buffered.get(id);
    if (buffered?.length) {
      const item = buffered.shift();
      if (buffered.length === 0) this.buffered.delete(id);
      if (item) return Promise.resolve(item.message as ViviViewerApiResponse<TData>);
    }
    const timeoutMs = options.timeoutMs ?? this.timeoutMs;
    return new Promise<ViviViewerApiResponse<unknown>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.removePending(id, resolve);
        reject(
          new ViviViewerApiClientError({
            code: "transport_timeout",
            message: "Timed out waiting for Viewer API response.",
            details: { timeoutMs },
          }),
        );
      }, timeoutMs);
      const queue = this.pending.get(id) ?? [];
      queue.push({ resolve, reject, timer });
      this.pending.set(id, queue);
    }) as Promise<ViviViewerApiResponse<TData>>;
  }

  private requireSocket() {
    const socket = this.socket;
    if (!socket || socket.readyState !== 1) {
      throw new ViviViewerApiClientError({
        code: "disconnected",
        message: "Viewer API WebSocket is not connected.",
      });
    }
    return socket;
  }

  private handleMessage(event: unknown) {
    const text = extractMessageText(event);
    if (typeof text !== "string") {
      this.rejectAll("invalid_message");
      return;
    }
    if (byteLength(text) > this.maxFrameBytes) {
      this.rejectAll("frame_too_large");
      this.socket?.close(4411, "frame_too_large");
      return;
    }
    let message: ViviViewerApiResponse;
    try {
      message = JSON.parse(text) as ViviViewerApiResponse;
    } catch (cause) {
      this.rejectAll("invalid_message", cause);
      return;
    }
    if (message.api !== VIVI_VIEWER_API_NAME || typeof message.type !== "string") {
      this.rejectAll("invalid_message");
      return;
    }
    const id = typeof message.id === "string" ? message.id : "";
    if (id) {
      const queue = this.pending.get(id);
      if (queue?.length) {
        const waiter = queue.shift();
        if (waiter) {
          clearTimeout(waiter.timer);
          waiter.resolve(message);
        }
        if (queue.length === 0) this.pending.delete(id);
        return;
      }
      this.pruneBuffered();
      const buffered = this.buffered.get(id) ?? [];
      buffered.push({ message, receivedAt: Date.now() });
      this.buffered.set(id, buffered);
      this.evictBufferedHead();
      return;
    }
    for (const listener of this.eventListeners) listener(message);
  }

  private rejectAll(code: string, cause?: unknown) {
    const error = new ViviViewerApiClientError({
      code,
      message: "Viewer API transport is no longer available.",
      cause,
    });
    for (const queue of this.pending.values()) {
      for (const waiter of queue) {
        clearTimeout(waiter.timer);
        waiter.reject(error);
      }
    }
    this.pending.clear();
    this.buffered.clear();
  }

  private removePending(
    id: string,
    resolve: (message: ViviViewerApiResponse) => void,
  ) {
    const queue = this.pending.get(id);
    if (!queue) return;
    const next = queue.filter((waiter) => waiter.resolve !== resolve);
    if (next.length) this.pending.set(id, next);
    else this.pending.delete(id);
  }

  private nextId() {
    this.sequence += 1;
    return `${Date.now()}-${this.sequence.toString(16)}`;
  }

  private pruneBuffered(now = Date.now()) {
    for (const [id, messages] of this.buffered) {
      const kept = messages.filter(
        (message) => now - message.receivedAt <= ViviViewerTransport.bufferedTtlMs,
      );
      if (kept.length) this.buffered.set(id, kept);
      else this.buffered.delete(id);
    }
  }

  private evictBufferedHead() {
    let count = [...this.buffered.values()].reduce(
      (total, messages) => total + messages.length,
      0,
    );
    while (count > ViviViewerTransport.maxBufferedMessages) {
      const firstKey = this.buffered.keys().next().value as string | undefined;
      if (!firstKey) return;
      const messages = this.buffered.get(firstKey);
      messages?.shift();
      if (!messages?.length) this.buffered.delete(firstKey);
      count -= 1;
    }
  }
}

function waitForSocketOpen(socket: ViviViewerWebSocketLike, timeoutMs: number) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(
        new ViviViewerApiClientError({
          code: "transport_timeout",
          message: "Timed out opening Viewer API WebSocket.",
          details: { timeoutMs },
        }),
      );
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      removeSocketListener(socket, "open", onOpen);
      removeSocketListener(socket, "error", onError);
    };
    const onOpen = () => {
      cleanup();
      resolve();
    };
    const onError = (cause: unknown) => {
      cleanup();
      reject(
        new ViviViewerApiClientError({
          code: "transport_unavailable",
          message: "Viewer API WebSocket failed to open.",
          cause,
        }),
      );
    };
    addSocketListener(socket, "open", onOpen, { once: true });
    addSocketListener(socket, "error", onError, { once: true });
  });
}

function addSocketListener(
  socket: ViviViewerWebSocketLike,
  type: string,
  listener: (...args: unknown[]) => void,
  options?: { once?: boolean },
) {
  if (typeof socket.addEventListener === "function") {
    socket.addEventListener(type, listener, options);
  } else if (options?.once && typeof socket.once === "function") {
    socket.once(type, listener);
  } else {
    socket.on?.(type, listener);
  }
}

function removeSocketListener(
  socket: ViviViewerWebSocketLike,
  type: string,
  listener: (...args: unknown[]) => void,
) {
  if (typeof socket.removeEventListener === "function") {
    socket.removeEventListener(type, listener);
  } else {
    socket.off?.(type, listener);
  }
}

function extractMessageText(event: unknown) {
  if (typeof event === "string") return event;
  if (event instanceof Uint8Array) return new TextDecoder().decode(event);
  if (event && typeof event === "object") {
    const data = (event as { data?: unknown }).data;
    if (typeof data === "string") return data;
    if (data instanceof Uint8Array) return new TextDecoder().decode(data);
    const firstArg = (event as { 0?: unknown })[0];
    if (typeof firstArg === "string") return firstArg;
    if (firstArg instanceof Uint8Array) return new TextDecoder().decode(firstArg);
    if (typeof (event as { toString?: () => string }).toString === "function") {
      const text = (event as { toString: () => string }).toString();
      if (text !== "[object Object]") return text;
    }
  }
  return null;
}

function byteLength(value: string) {
  return new TextEncoder().encode(value).byteLength;
}
