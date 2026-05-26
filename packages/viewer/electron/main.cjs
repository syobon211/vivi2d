const { app, BrowserWindow, ipcMain, safeStorage, session, shell } = require("electron");
const crypto = require("node:crypto");
const fs = require("fs");
const path = require("path");
const { createViewerApiAssetBroker } = require("./viewer-api-asset-broker.cjs");
const { makeErrorPayload } = require("./viewer-api-schema.cjs");
const { createViewerApiServer } = require("./viewer-api-server.cjs");
const {
  createContentSecurityPolicy,
  isLoopbackNetworkUrl,
  isTrustedNavigationUrl,
  openExternalIfSafe,
  wrapHandler,
} = require("./security.cjs");

/** @type {BrowserWindow | null} */
let mainWindow = null;
let viewerApiServer = null;
let viewerApiAssetBroker = null;
let viewerApiAssetCleanupTimer = null;
let viewerApiStatusUnsubscribe = null;
let viewerApiPublishEventTimestamps = [];
let viewerApiRendererRequestSeq = 0;
const pendingViewerApiRendererRequests = new Map();

if (
  process.env.VIVI_VIEWER_E2E === "1" &&
  process.env.VIVI_VIEWER_E2E_USER_DATA_DIR &&
  !app.isPackaged
) {
  const e2eUserDataDir = path.resolve(process.env.VIVI_VIEWER_E2E_USER_DATA_DIR);
  fs.mkdirSync(e2eUserDataDir, { recursive: true });
  app.setPath("userData", e2eUserDataDir);
}

const handle = wrapHandler(ipcMain, () => mainWindow);

const WINDOW_SIZE_MIN = 100;
const WINDOW_SIZE_MAX = 8192;
const VIEWER_API_PORT_MIN = 1024;
const VIEWER_API_PORT_MAX = 65535;
const VIEWER_API_RENDERER_REQUEST_TIMEOUT_MS = 5000;
const VIEWER_API_ASSET_CLEANUP_MS = 30_000;

const ALLOWED_BACKGROUND_MODES = new Set(["transparent", "green", "blue"]);

function normalizeViewerApiPort(port) {
  if (port === undefined || port === null) return undefined;
  if (
    !Number.isInteger(port) ||
    port < VIEWER_API_PORT_MIN ||
    port > VIEWER_API_PORT_MAX
  ) {
    throw new Error(`Invalid viewer API port: ${String(port)}`);
  }
  return port;
}

function createViewerApiGrantStore() {
  if (!safeStorage.isEncryptionAvailable()) return null;
  const grantPath = path.join(app.getPath("userData"), "viewer-api-grants.bin");
  return {
    load() {
      try {
        if (!fs.existsSync(grantPath)) return [];
        const encrypted = fs.readFileSync(grantPath);
        return JSON.parse(safeStorage.decryptString(encrypted));
      } catch {
        return [];
      }
    },
    save(grants) {
      const payload = JSON.stringify(grants);
      const encrypted = safeStorage.encryptString(payload);
      const tmpPath = `${grantPath}.${process.pid}.${crypto.randomBytes(8).toString("hex")}.tmp`;
      fs.mkdirSync(path.dirname(grantPath), { recursive: true });
      try {
        fs.writeFileSync(tmpPath, encrypted);
        fs.renameSync(tmpPath, grantPath);
      } finally {
        try {
          if (fs.existsSync(tmpPath)) fs.rmSync(tmpPath, { force: true });
        } catch {}
      }
    },
  };
}

function ensureViewerApiServer() {
  if (!viewerApiServer) {
    const grantStore = createViewerApiGrantStore();
    viewerApiServer = createViewerApiServer({
      persistentGrantsAvailable: Boolean(grantStore),
      grantStore,
      allowSessionGrants: !app.isPackaged,
      handlers: createViewerApiRendererHandlers(),
    });
  }
  ensureViewerApiAssetBroker();
  return viewerApiServer;
}

function ensureViewerApiAssetBroker() {
  if (!viewerApiAssetBroker) {
    viewerApiAssetBroker = createViewerApiAssetBroker();
  }
  return viewerApiAssetBroker;
}

function startViewerApiAssetCleanup() {
  if (viewerApiAssetCleanupTimer) return;
  viewerApiAssetCleanupTimer = setInterval(() => {
    viewerApiAssetBroker?.cleanupExpired();
  }, VIEWER_API_ASSET_CLEANUP_MS);
  viewerApiAssetCleanupTimer.unref?.();
}

function stopViewerApiAssetCleanup() {
  if (!viewerApiAssetCleanupTimer) return;
  clearInterval(viewerApiAssetCleanupTimer);
  viewerApiAssetCleanupTimer = null;
}

function emitViewerApiAssetStatus(grantId) {
  const targetWindow = mainWindow;
  if (!targetWindow || targetWindow.isDestroyed()) return;
  targetWindow.webContents.send("viewer-api:asset-status-changed", {
    grantId,
    assets: viewerApiAssetBroker?.listForGrant(grantId) ?? [],
  });
}

function sanitizeViewerApiAssetBrokerResult(result) {
  if (result?.ok !== false) return result;
  return {
    ok: false,
    error: makeErrorPayload(result.error, result.error?.details),
  };
}

function bindViewerApiStatusBridge() {
  viewerApiStatusUnsubscribe?.();
  viewerApiStatusUnsubscribe = null;
  const targetWindow = mainWindow;
  if (!targetWindow) return;
  const server = ensureViewerApiServer();
  viewerApiStatusUnsubscribe = server.onStatusChanged((status) => {
    // Pairing status is trusted-renderer metadata only; secret codes and
    // tokens are intentionally omitted from this IPC payload.
    if (!targetWindow.isDestroyed()) {
      targetWindow.webContents.send("viewer-api:status-changed", status);
    }
  });
  targetWindow.once("closed", () => {
    viewerApiStatusUnsubscribe?.();
    viewerApiStatusUnsubscribe = null;
    rejectPendingViewerApiRendererRequests("renderer closed");
  });
}

function consumeViewerApiPublishEventBudget() {
  const now = Date.now();
  viewerApiPublishEventTimestamps = viewerApiPublishEventTimestamps.filter(
    (timestamp) => now - timestamp < 1_000,
  );
  if (viewerApiPublishEventTimestamps.length >= 1000) {
    return false;
  }
  viewerApiPublishEventTimestamps.push(now);
  return true;
}

function createViewerApiRendererHandlers() {
  const rendererTypes = [
    "viewer.props.list",
    "viewer.prop.load",
    "viewer.prop.update",
    "viewer.prop.remove",
    "viewer.prop.group.cycle",
    "viewer.calibration.get",
  ];
  return Object.fromEntries(
    rendererTypes.map((type) => [
      type,
      (message, grant, context) =>
        forwardViewerApiRequestToRenderer(message, grant, context),
    ]),
  );
}

async function forwardViewerApiRequestToRenderer(message, grant, context = {}) {
  const targetWindow = mainWindow;
  if (!targetWindow || targetWindow.isDestroyed()) {
    return { accepted: false, reason: "renderer unavailable" };
  }
  if (context.signal?.aborted) {
    return { accepted: false, reason: "grant revoked" };
  }
  let outboundMessage = message;
  let assetReservation = null;
  if (
    message.type === "viewer.prop.load" &&
    message.data?.source?.kind === "filePickerAsset"
  ) {
    const checkout = ensureViewerApiAssetBroker().checkout(
      message.data.source,
      grant,
      context.origin,
    );
    if (!checkout.ok) {
      return { accepted: false, reason: checkout.error };
    }
    assetReservation = checkout.reservation;
    outboundMessage = {
      ...message,
      data: {
        ...message.data,
        source: checkout.source,
      },
    };
  }
  const requestId = `viewer-api-renderer-${++viewerApiRendererRequestSeq}`;
  return new Promise((resolve) => {
    let settled = false;
    const cleanup = () => {
      pendingViewerApiRendererRequests.delete(requestId);
      clearTimeout(timer);
      context.signal?.removeEventListener?.("abort", onAbort);
    };
    const finish = (value) => {
      if (settled) return;
      settled = true;
      if (assetReservation) {
        if (value && value.accepted !== false) {
          viewerApiAssetBroker?.consume(assetReservation);
          emitViewerApiAssetStatus(grant.id);
        } else {
          viewerApiAssetBroker?.release(assetReservation);
        }
      }
      cleanup();
      resolve(value);
    };
    const onAbort = () => finish({ accepted: false, reason: "grant revoked" });
    const timer = setTimeout(() => {
      finish({ accepted: false, reason: "renderer timeout" });
    }, VIEWER_API_RENDERER_REQUEST_TIMEOUT_MS);
    timer.unref?.();
    pendingViewerApiRendererRequests.set(requestId, finish);
    context.signal?.addEventListener?.("abort", onAbort, { once: true });
    try {
      targetWindow.webContents.send("viewer-api:renderer-request", {
        requestId,
        type: outboundMessage.type,
        data: outboundMessage.data ?? {},
        scopes: [...(grant?.scopes ?? [])],
      });
    } catch {
      finish({ accepted: false, reason: "renderer unavailable" });
    }
  });
}

function resolveViewerApiRendererResponse(payload) {
  const finish = pendingViewerApiRendererRequests.get(payload.requestId);
  if (!finish) return false;
  finish(
    payload.ok
      ? payload.data
      : { accepted: false, reason: payload.reason ?? "renderer rejected" },
  );
  return true;
}

function rejectPendingViewerApiRendererRequests(reason) {
  for (const finish of [...pendingViewerApiRendererRequests.values()]) {
    finish({ accepted: false, reason });
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    transparent: true,
    frame: true,
    hasShadow: false,
    alwaysOnTop: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  const appEntryFileUrl = require("node:url").pathToFileURL(
    path.join(__dirname, "../dist/index.html"),
  ).href;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
  bindViewerApiStatusBridge();

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isTrustedNavigationUrl(url, { devServerUrl: devUrl, appEntryFileUrl })) {
      event.preventDefault();
      openExternalIfSafe(shell, url);
    }
  });
  mainWindow.webContents.on("will-redirect", (event, url) => {
    if (!isTrustedNavigationUrl(url, { devServerUrl: devUrl, appEntryFileUrl })) {
      event.preventDefault();
    }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalIfSafe(shell, url);
    return { action: "deny" };
  });

  return mainWindow;
}

handle("toggle-always-on-top", () => {
  if (!mainWindow) return false;
  const current = mainWindow.isAlwaysOnTop();
  mainWindow.setAlwaysOnTop(!current);
  return !current;
});

handle("toggle-frame", () => {
  if (!mainWindow) return;
  const current = mainWindow.isMenuBarVisible();
  mainWindow.setMenuBarVisibility(!current);
});

handle("set-background-mode", (_event, mode) => {
  if (!mainWindow) return;
  if (typeof mode !== "string" || !ALLOWED_BACKGROUND_MODES.has(mode)) {
    throw new Error(`Invalid background mode: ${String(mode)}`);
  }
  mainWindow.webContents.send("background-mode-changed", mode);
});

handle("set-window-size", (_event, width, height) => {
  if (!mainWindow) return;
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < WINDOW_SIZE_MIN ||
    height < WINDOW_SIZE_MIN ||
    width > WINDOW_SIZE_MAX ||
    height > WINDOW_SIZE_MAX
  ) {
    throw new Error(`Invalid window size: ${width}x${height}`);
  }
  mainWindow.setSize(Math.floor(width), Math.floor(height));
});

handle("viewer-api:get-status", () => {
  return viewerApiServer?.getStatus() ?? { enabled: false };
});

handle("viewer-api:set-enabled", async (_event, payload) => {
  if (typeof payload.enabled !== "boolean") {
    throw new Error("Invalid viewer API enabled flag");
  }
  const status = await ensureViewerApiServer().setEnabled(payload.enabled, {
    port: normalizeViewerApiPort(payload.port),
  });
  if (payload.enabled) {
    startViewerApiAssetCleanup();
  } else {
    stopViewerApiAssetCleanup();
    viewerApiAssetBroker?.clear();
  }
  return status;
});

handle("viewer-api:open-pairing-window", (_event, payload) => {
  return ensureViewerApiServer().openPairingWindow(payload.durationMs, {
    origins: payload.origins,
  });
});

handle("viewer-api:close-pairing-window", () => {
  viewerApiServer?.closePairingWindow();
  return viewerApiServer?.getStatus() ?? { enabled: false };
});

handle("viewer-api:list-grants", () => {
  return viewerApiServer?.getStatus().grants ?? [];
});

handle("viewer-api:approve-pairing", (_event, payload) => {
  return viewerApiServer?.approveChallenge(payload.challengeId, payload.code) ?? null;
});

handle("viewer-api:revoke-grant", (_event, payload) => {
  const revoked = Boolean(viewerApiServer?.revokeGrant(payload.grantId));
  if (revoked) {
    viewerApiAssetBroker?.revokeGrant(payload.grantId);
    emitViewerApiAssetStatus(payload.grantId);
  }
  return revoked;
});

handle("viewer-api:rotate-grant", (_event, payload) => {
  const rotated = viewerApiServer?.rotateGrant(payload.grantId) ?? null;
  if (rotated) {
    viewerApiAssetBroker?.revokeGrant(payload.grantId);
    emitViewerApiAssetStatus(payload.grantId);
  }
  return rotated;
});

handle("viewer-api:publish-event", (_event, payload) => {
  if (!consumeViewerApiPublishEventBudget()) {
    throw new Error("viewer API event publish rate limited");
  }
  return viewerApiServer?.publishEvent(payload) ?? 0;
});

handle("viewer-api:renderer-response", (_event, payload) => {
  return resolveViewerApiRendererResponse(payload);
});

handle("viewer-api:create-prop-asset", (_event, payload) => {
  const grant = ensureViewerApiServer().getAssetBrokerGrant(payload?.grantId);
  const result = ensureViewerApiAssetBroker().issue(payload, grant);
  if (result.ok) emitViewerApiAssetStatus(result.asset.grantId);
  return sanitizeViewerApiAssetBrokerResult(result);
});

handle("viewer-api:list-prop-assets", (_event, payload) => {
  const grantId = typeof payload?.grantId === "string" ? payload.grantId : "";
  return ensureViewerApiAssetBroker().listForGrant(grantId);
});

handle("viewer-api:extend-prop-asset", (_event, payload) => {
  const grant = ensureViewerApiServer().getAssetBrokerGrant(payload?.grantId);
  const result = ensureViewerApiAssetBroker().extend(payload?.assetId, grant);
  if (result.ok) emitViewerApiAssetStatus(result.asset.grantId);
  return sanitizeViewerApiAssetBrokerResult(result);
});

handle("viewer-api:revoke-prop-asset", (_event, payload) => {
  const grant = ensureViewerApiServer().getAssetBrokerGrant(payload?.grantId);
  const revoked = ensureViewerApiAssetBroker().revoke(payload?.assetId, grant);
  if (revoked) emitViewerApiAssetStatus(payload.grantId);
  return revoked;
});

const ALLOWED_PERMISSIONS = new Set(["media", "midi", "midiSysex", "fullscreen"]);

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(ALLOWED_PERMISSIONS.has(permission));
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
    return ALLOWED_PERMISSIONS.has(permission);
  });

  const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
  const csp = createContentSecurityPolicy({ isDev });
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [csp],
      },
    });
  });

  if (!isDev) {
    session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
      callback({ cancel: isLoopbackNetworkUrl(details.url) });
    });
  }

  createWindow();
});

app.on("web-contents-created", (_event, contents) => {
  contents.on("will-attach-webview", (event) => {
    event.preventDefault();
  });
});

app.on("window-all-closed", () => {
  viewerApiStatusUnsubscribe?.();
  viewerApiStatusUnsubscribe = null;
  stopViewerApiAssetCleanup();
  viewerApiAssetBroker?.clear();
  rejectPendingViewerApiRendererRequests("renderer closed");
  void viewerApiServer?.stop();
  app.quit();
});
