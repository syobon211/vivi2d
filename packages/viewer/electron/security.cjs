// Viewer Electron security mirrors the editor boundary: production renderers
// may load only the app entry point, use contracted IPC, and avoid broad
// localhost network access. Local API work belongs behind explicit Viewer API
// pairing and scope checks, not renderer CSP exceptions.
const { hasIpcContract, validateIpcArgs } = require("./ipc-contract.cjs");

function getOrigin(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function isTrustedNavigationUrl(url, { devServerUrl, appEntryFileUrl } = {}) {
  if (typeof url !== "string" || url.length === 0) return false;
  if (typeof appEntryFileUrl === "string" && url === appEntryFileUrl) return true;
  const allowedOrigin = typeof devServerUrl === "string" ? getOrigin(devServerUrl) : null;
  const targetOrigin = getOrigin(url);
  return allowedOrigin !== null && targetOrigin === allowedOrigin;
}

function isLoopbackHostname(hostname) {
  if (typeof hostname !== "string" || hostname.length === 0) return false;
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

function isLoopbackNetworkUrl(url) {
  if (typeof url !== "string" || url.length === 0) return false;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (
    parsed.protocol !== "http:" &&
    parsed.protocol !== "https:" &&
    parsed.protocol !== "ws:" &&
    parsed.protocol !== "wss:"
  ) {
    return false;
  }
  return isLoopbackHostname(parsed.hostname);
}

function isSafeExternalUrl(url) {
  if (typeof url !== "string" || url.length === 0) return false;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return parsed.protocol === "https:" && parsed.hostname.length > 0 && !parsed.username && !parsed.password;
}

function openExternalIfSafe(shellModule, url) {
  if (!isSafeExternalUrl(url)) return false;
  shellModule.openExternal(url);
  return true;
}

function createContentSecurityPolicy({ isDev = false } = {}) {
  if (isDev) {
    return [
      "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: ws: http://localhost:*",
      "img-src 'self' data: blob:",
      "media-src 'self' data: blob:",
      "connect-src 'self' ws: http://localhost:* http://127.0.0.1:*",
      "worker-src 'self' blob:",
    ].join("; ");
  }

  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

function assertTrustedSender(event, mainWindow) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    throw new Error("Invalid IPC: main window is unavailable");
  }
  if (event?.sender?.id !== mainWindow.webContents.id) {
    throw new Error("Invalid IPC: sender is not allowed");
  }
  const senderFrame = event?.senderFrame;
  if (senderFrame && typeof senderFrame.parent !== "undefined" && senderFrame.parent !== null) {
    throw new Error("Invalid IPC: frame is not allowed");
  }
}

function wrapHandler(ipcMain, getMainWindow) {
  return function register(channel, handler) {
    if (!hasIpcContract(channel)) {
      throw new Error(`IPC channel ${channel} is missing a payload contract.`);
    }
    ipcMain.handle(channel, async (event, ...args) => {
      assertTrustedSender(event, getMainWindow());
      validateIpcArgs(channel, args);
      return handler(event, ...args);
    });
  };
}

module.exports = {
  assertTrustedSender,
  createContentSecurityPolicy,
  wrapHandler,
  isLoopbackNetworkUrl,
  isSafeExternalUrl,
  isTrustedNavigationUrl,
  openExternalIfSafe,
};
