import { createViviViewerClientCore, type ViviViewerClientCoreOptions } from "./client.js";
import { parseViviViewerEndpoint } from "./endpoint.js";
import { ViviViewerApiClientError } from "./errors.js";
import type { ViviViewerWebSocketFactory } from "./transport.js";

export type CreateViviBrowserViewerClientOptions = Omit<
  ViviViewerClientCoreOptions,
  "validateEndpoint" | "webSocketFactory"
> & {
  webSocketFactory?: ViviViewerWebSocketFactory;
};

export function createViviViewerClient(options: CreateViviBrowserViewerClientOptions) {
  return createViviViewerClientCore({
    ...options,
    validateEndpoint: (endpoint) =>
      parseViviViewerEndpoint(endpoint, { environment: "browser" }),
    webSocketFactory: options.webSocketFactory ?? createDefaultBrowserWebSocket,
  });
}

export function parseViewerEndpoint(endpoint: string | URL) {
  return parseViviViewerEndpoint(endpoint, { environment: "browser" });
}

function createDefaultBrowserWebSocket(endpoint: string) {
  if (typeof globalThis.WebSocket !== "function") {
    throw new ViviViewerApiClientError({
      code: "transport_unavailable",
      message: "This environment does not provide a WebSocket implementation.",
    });
  }
  return new globalThis.WebSocket(endpoint);
}

export * from "./client.js";
export * from "./capabilities.js";
export * from "./endpoint.js";
export * from "./errors.js";
export * from "./protocol.js";
export * from "./token-store.js";
export type {
  ViviViewerWebSocketFactory,
  ViviViewerWebSocketLike,
} from "./transport.js";
