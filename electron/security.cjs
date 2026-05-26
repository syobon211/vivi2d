// Electron main-process security helpers.
//
// Keep privileged desktop access behind exact navigation checks, contracted IPC
// payloads, and user-mediated path allowlists. Relaxing these helpers changes
// the renderer-to-main trust boundary and should be paired with security tests.
const path = require("node:path");
const { hasIpcContract, validateIpcArgs } = require("./ipc-contract.cjs");

function createAllowlist() {
  const set = new Set();
  return {
    add(p) {
      if (typeof p === "string" && p.length > 0) {
        set.add(path.resolve(p));
      }
    },
    has(p) {
      if (typeof p !== "string") return false;
      return set.has(path.resolve(p));
    },
    clear() {
      set.clear();
    },
    size() {
      return set.size;
    },
  };
}

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
  return (
    parsed.protocol === "https:" &&
    parsed.hostname.length > 0 &&
    !parsed.username &&
    !parsed.password
  );
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

function assertAllowedPath(p, allowlist, label) {
  if (typeof p !== "string" || p.length === 0) {
    throw new Error(`Invalid file path: ${label}`);
  }
  const resolved = path.resolve(p);
  if (!allowlist.has(resolved)) {
    throw new Error(`Invalid file path: ${label} has not been approved in this session.`);
  }
  return resolved;
}

function isLoopbackHostname(hostname) {
  if (typeof hostname !== "string" || hostname.length === 0) return false;
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

function validateBaseUrl(url, { allowRemote = false } = {}) {
  if (typeof url !== "string" || url.length === 0) {
    throw new Error("Invalid base URL: empty value.");
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid base URL.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Invalid protocol: ${parsed.protocol}`);
  }
  if (!allowRemote && !isLoopbackHostname(parsed.hostname)) {
    throw new Error(
      `Invalid base URL: remote hosts are not allowed (${parsed.hostname}).`,
    );
  }
  return parsed;
}

function validatePromptId(promptId) {
  if (typeof promptId !== "string" || !/^[a-zA-Z0-9_-]+$/.test(promptId)) {
    throw new Error(`Invalid promptId: ${promptId}`);
  }
  return promptId;
}

function validateComfyPathPart(value, label, { allowEmpty = false } = {}) {
  if (value === undefined || value === null) {
    if (allowEmpty) return "";
    throw new Error(`Invalid ${label}: missing value.`);
  }
  if (typeof value !== "string") {
    throw new Error(`Invalid ${label}: expected a string.`);
  }
  if (value.length === 0) {
    if (allowEmpty) return "";
    throw new Error(`Invalid ${label}: empty value.`);
  }
  if (value.length > 260) {
    throw new Error(`Invalid ${label}: too long.`);
  }
  if (containsControlCharacter(value)) {
    throw new Error(`Invalid ${label}: contains control characters.`);
  }
  if (path.isAbsolute(value) || /^[a-zA-Z]:/.test(value)) {
    throw new Error(`Invalid ${label}: absolute paths are not allowed.`);
  }
  const segments = value.split(/[\\/]+/);
  for (const seg of segments) {
    if (seg === ".." || seg === ".") {
      throw new Error(`Invalid ${label}: path traversal is not allowed.`);
    }
  }
  return value;
}

function validateComfyType(type) {
  const allowed = new Set(["output", "input", "temp"]);
  if (type === undefined || type === null || type === "") return "output";
  if (typeof type !== "string" || !allowed.has(type)) {
    throw new Error(`Invalid type: ${String(type)}`);
  }
  return type;
}

function containsControlCharacter(value) {
  return [...value].some((char) => char.charCodeAt(0) <= 0x1f);
}

function isWindowsReservedName(segment) {
  const stem = segment.split(".")[0].toUpperCase();
  return (
    stem === "CON" ||
    stem === "PRN" ||
    stem === "AUX" ||
    stem === "NUL" ||
    /^COM[1-9]$/.test(stem) ||
    /^LPT[1-9]$/.test(stem)
  );
}

function validateSafeRelativePath(relativePath, label = "relative path") {
  if (typeof relativePath !== "string" || relativePath.length === 0) {
    throw new Error(`Invalid ${label}: empty`);
  }
  if (relativePath.length > 4096) {
    throw new Error(`Invalid ${label}: too long`);
  }
  if (containsControlCharacter(relativePath)) {
    throw new Error(`Invalid ${label}: contains control characters`);
  }
  if (
    path.isAbsolute(relativePath) ||
    /^[a-zA-Z]:/.test(relativePath) ||
    relativePath.startsWith("\\\\")
  ) {
    throw new Error(`Invalid ${label}: absolute paths are not allowed`);
  }

  const segments = relativePath.split(/[\\/]+/);
  for (const segment of segments) {
    if (segment === "" || segment === "." || segment === "..") {
      throw new Error(`Invalid ${label}: path traversal is not allowed`);
    }
    if (segment.endsWith(".") || segment.endsWith(" ")) {
      throw new Error(`Invalid ${label}: trailing dots or spaces are not allowed`);
    }
    if (isWindowsReservedName(segment)) {
      throw new Error(`Invalid ${label}: Windows reserved names are not allowed`);
    }
  }

  return relativePath;
}

function assertWithinDirectory(resolvedBase, relativePath) {
  const safeRelativePath = validateSafeRelativePath(relativePath, "file path");
  const filePath = path.resolve(resolvedBase, safeRelativePath);
  const relative = path.relative(resolvedBase, filePath);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Invalid file path: ${relativePath}`);
  }
  return filePath;
}

function assertTrustedSender(event, mainWindow) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    throw new Error("Invalid IPC sender: main window is unavailable.");
  }
  if (event?.sender?.id !== mainWindow.webContents.id) {
    throw new Error("Invalid IPC sender: sender is not approved.");
  }
  const senderFrame = event?.senderFrame;
  if (
    senderFrame &&
    typeof senderFrame.parent !== "undefined" &&
    senderFrame.parent !== null
  ) {
    throw new Error("Invalid IPC sender: child frames are not approved.");
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
  createAllowlist,
  createContentSecurityPolicy,
  isLoopbackNetworkUrl,
  isTrustedNavigationUrl,
  assertAllowedPath,
  isSafeExternalUrl,
  openExternalIfSafe,
  validateBaseUrl,
  isLoopbackHostname,
  validatePromptId,
  validateComfyPathPart,
  validateComfyType,
  validateSafeRelativePath,
  assertWithinDirectory,
  assertTrustedSender,
  wrapHandler,
};
