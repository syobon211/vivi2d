import { ViviViewerApiClientError } from "./errors.js";

export type ViviViewerEndpointEnvironment = "browser" | "node";

export interface ViviViewerEndpoint {
  href: string;
  protocol: "ws:";
  hostname: string;
  host: string;
  port: number;
  path: string;
  isLocalhost: boolean;
}

export interface ParseViviViewerEndpointOptions {
  environment: ViviViewerEndpointEnvironment;
  allowLocalhost?: boolean;
}

const IPV4_LOOPBACK_PATTERN = /^127(?:\.(?:\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])){3}$/;

export function parseViviViewerEndpoint(
  endpoint: string | URL,
  options: ParseViviViewerEndpointOptions,
): ViviViewerEndpoint {
  const parsed = parseUrl(endpoint);
  if (parsed.protocol !== "ws:") {
    throw new ViviViewerApiClientError({
      code: "invalid_endpoint",
      message: "Viewer API endpoint must use ws:// on the local loopback interface.",
    });
  }
  if (!parsed.port) {
    throw new ViviViewerApiClientError({
      code: "invalid_endpoint",
      message: "Viewer API endpoint must include the port shown by Vivi2D.",
    });
  }
  if (parsed.username || parsed.password || parsed.hash || parsed.search) {
    throw new ViviViewerApiClientError({
      code: "invalid_endpoint",
      message: "Viewer API endpoint must not include credentials, query, or fragment.",
    });
  }
  const hostname = parsed.hostname.toLowerCase();
  const isLiteralLoopback =
    IPV4_LOOPBACK_PATTERN.test(hostname) ||
    hostname === "::1" ||
    hostname === "[::1]";
  const isLocalhost = hostname === "localhost";
  const allowLocalhost = options.allowLocalhost ?? true;
  if (!isLiteralLoopback && !(allowLocalhost && isLocalhost)) {
    throw new ViviViewerApiClientError({
      code: "non_loopback_endpoint",
      message:
        options.environment === "browser"
          ? "Browser clients may only connect to literal 127.0.0.1, [::1], or localhost Viewer API endpoints."
          : "Node clients may only connect to loopback Viewer API endpoints.",
      details: { host: parsed.hostname },
    });
  }
  return {
    href: parsed.href,
    protocol: "ws:",
    hostname,
    host: parsed.host,
    port: Number(parsed.port),
    path: parsed.pathname,
    isLocalhost,
  };
}

function parseUrl(endpoint: string | URL) {
  try {
    return new URL(endpoint);
  } catch (cause) {
    throw new ViviViewerApiClientError({
      code: "invalid_endpoint",
      message: "Viewer API endpoint must be a valid URL.",
      cause,
    });
  }
}
