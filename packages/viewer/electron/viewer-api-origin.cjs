function parseHostHeader(hostHeader) {
  if (typeof hostHeader !== "string" || hostHeader.length === 0) return null;
  const raw = hostHeader.trim();
  if (raw.startsWith("[")) {
    const closing = raw.indexOf("]");
    if (closing === -1) return null;
    const host = raw.slice(1, closing);
    const portText = raw.slice(closing + 1).replace(/^:/, "");
    return { host, port: portText ? Number(portText) : null };
  }
  if (raw.includes("::")) {
    return null;
  }
  const parts = raw.split(":");
  if (parts.length > 2) return null;
  const [host, portText] = parts;
  return { host, port: portText ? Number(portText) : null };
}

function isLoopbackHostHeader(hostHeader, { allowIpv6Loopback = false } = {}) {
  const parsed = parseHostHeader(hostHeader);
  if (!parsed) return false;
  return parsed.host === "127.0.0.1" || (allowIpv6Loopback && parsed.host === "::1");
}

function normalizeOrigin(origin) {
  if (typeof origin !== "string" || origin.length === 0) return null;
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function normalizeAllowedOrigins(origins) {
  if (!Array.isArray(origins)) return [];
  return origins.map(normalizeOrigin).filter(Boolean).slice(0, 16);
}

function isGrantAllowedForOrigin(grant, origin) {
  const binding = grant.originBinding ?? (grant.origins?.[0] ?? "no-origin");
  if (binding === "no-origin") return !origin;
  return origin === binding;
}

module.exports = {
  isGrantAllowedForOrigin,
  isLoopbackHostHeader,
  normalizeAllowedOrigins,
  normalizeOrigin,
  parseHostHeader,
};
