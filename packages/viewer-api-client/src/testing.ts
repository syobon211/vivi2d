import type {
  ViviViewerWebSocketFactory,
  ViviViewerWebSocketLike,
} from "./transport.js";

type Listener = (...args: unknown[]) => void;

export class MockViviViewerWebSocket implements ViviViewerWebSocketLike {
  readonly sent: string[] = [];
  readyState = 0;
  private readonly listeners = new Map<string, Set<Listener>>();

  open() {
    this.readyState = 1;
    this.emit("open");
  }

  receive(data: unknown) {
    this.emit("message", typeof data === "string" ? { data } : data);
  }

  send(data: string) {
    if (this.readyState !== 1) throw new Error("mock websocket is not open");
    this.sent.push(data);
  }

  close() {
    this.readyState = 3;
    this.emit("close");
  }

  addEventListener(type: string, listener: Listener, options?: { once?: boolean }) {
    const wrapped: Listener = options?.once
      ? (...args) => {
          this.removeEventListener(type, wrapped);
          listener(...args);
        }
      : listener;
    const listeners = this.listeners.get(type) ?? new Set<Listener>();
    listeners.add(wrapped);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: Listener) {
    this.listeners.get(type)?.delete(listener);
  }

  on(type: string, listener: Listener) {
    this.addEventListener(type, listener);
  }

  once(type: string, listener: Listener) {
    this.addEventListener(type, listener, { once: true });
  }

  off(type: string, listener: Listener) {
    this.removeEventListener(type, listener);
  }

  private emit(type: string, ...args: unknown[]) {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(...args);
  }
}

export function createMockWebSocketFactory(
  onSocket?: (socket: MockViviViewerWebSocket, endpoint: string) => void,
): {
  factory: ViviViewerWebSocketFactory;
  sockets: MockViviViewerWebSocket[];
} {
  const sockets: MockViviViewerWebSocket[] = [];
  return {
    sockets,
    factory(endpoint) {
      const socket = new MockViviViewerWebSocket();
      sockets.push(socket);
      onSocket?.(socket, endpoint);
      queueMicrotask(() => socket.open());
      return socket;
    },
  };
}

export function readSentMessage(socket: MockViviViewerWebSocket, index = 0) {
  const raw = socket.sent[index];
  if (!raw) throw new Error(`No sent message at index ${index}`);
  return JSON.parse(raw) as Record<string, unknown>;
}

export function makeViewerApiResponse(
  id: string | undefined,
  type: string,
  ok: boolean,
  data: Record<string, unknown> = {},
  error?: Record<string, unknown>,
) {
  return JSON.stringify({
    api: "ViviViewerApi",
    version: "0.preview",
    type,
    ok,
    data,
    ...(id ? { id } : {}),
    ...(error ? { error } : {}),
  });
}
