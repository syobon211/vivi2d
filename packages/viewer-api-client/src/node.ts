import { promises as dns } from "node:dns";
import { createViviViewerClientCore, type ViviViewerClientCoreOptions } from "./client.js";
import {
  parseViviViewerEndpoint,
  type ViviViewerEndpoint,
} from "./endpoint.js";
import { ViviViewerApiClientError } from "./errors.js";
import type { ViviViewerWebSocketFactory } from "./transport.js";

export type CreateViviNodeViewerClientOptions = Omit<
  ViviViewerClientCoreOptions,
  "validateEndpoint" | "webSocketFactory"
> & {
  webSocketFactory?: ViviViewerWebSocketFactory;
};

export function createViviViewerClient(options: CreateViviNodeViewerClientOptions) {
  return createViviViewerClientCore({
    ...options,
    validateEndpoint: validateNodeViewerEndpoint,
    webSocketFactory: options.webSocketFactory ?? createDefaultNodeWebSocket,
  });
}

export async function parseViewerEndpoint(endpoint: string | URL) {
  return validateNodeViewerEndpoint(String(endpoint));
}

async function validateNodeViewerEndpoint(endpoint: string | URL): Promise<ViviViewerEndpoint> {
  const parsed = parseViviViewerEndpoint(endpoint, { environment: "node" });
  if (!parsed.isLocalhost) return parsed;
  let addresses: Array<{ address: string }> = [];
  try {
    addresses = await dns.lookup(parsed.hostname, { all: true });
  } catch (cause) {
    throw new ViviViewerApiClientError({
      code: "non_loopback_endpoint",
      message: "Could not resolve localhost before opening Viewer API WebSocket.",
      cause,
    });
  }
  if (addresses.length === 0 || addresses.some(({ address }) => !isLoopbackAddress(address))) {
    throw new ViviViewerApiClientError({
      code: "non_loopback_endpoint",
      message: "localhost resolved to a non-loopback address.",
      details: { addresses: addresses.map(({ address }) => address) },
    });
  }
  const address = addresses[0]?.address;
  if (!address) return parsed;
  const resolved = new URL(parsed.href);
  resolved.hostname = address.includes(":") ? `[${address}]` : address;
  return {
    ...parsed,
    href: resolved.href,
    hostname: address,
    host: resolved.host,
    isLocalhost: false,
  };
}

function createDefaultNodeWebSocket(endpoint: string) {
  if (typeof globalThis.WebSocket !== "function") {
    throw new ViviViewerApiClientError({
      code: "transport_unavailable",
      message:
        "This Node environment does not provide WebSocket. Pass a webSocketFactory such as (url) => new WebSocket(url).",
    });
  }
  return new globalThis.WebSocket(endpoint);
}

function isLoopbackAddress(address: string) {
  return (
    address === "::1" ||
    address === "0:0:0:0:0:0:0:1" ||
    /^127(?:\.(?:\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])){3}$/.test(address)
  );
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
