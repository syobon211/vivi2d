const { app, BrowserWindow, ipcMain, session } = require("electron");
const {
  createAllowlist,
  createContentSecurityPolicy,
  isLoopbackNetworkUrl,
  wrapHandler,
} = require("./security.cjs");
const { createMainWindow } = require("./window.cjs");

let mainWindow = null;
const ownsProcessLock = app.requestSingleInstanceLock();
if (!ownsProcessLock) app.quit();
let localExchange = null;
let localAssetCopy = null;
app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});
app.on("will-quit", () => localExchange?.close());
app.on("will-quit", () => {
  void localAssetCopy?.close().catch(() => {});
});

const handle = wrapHandler(ipcMain, () => mainWindow);

const sessionOpenedFiles = createAllowlist();
const sessionSavedFiles = createAllowlist();
const sessionExportDirs = createAllowlist();

function createWindow() {
  mainWindow = createMainWindow();
}

require("./ipc/file.cjs").register({
  handle,
  getMainWindow: () => mainWindow,
  allowlists: { opened: sessionOpenedFiles, saved: sessionSavedFiles },
});

require("./ipc/export.cjs").register({
  handle,
  getMainWindow: () => mainWindow,
  allowlists: { exportDirs: sessionExportDirs },
});

require("./ipc/comfyui.cjs").register({
  handle,
  allowlists: { opened: sessionOpenedFiles },
});

const ALLOWED_PERMISSIONS = new Set(["media", "midi", "midiSysex", "fullscreen"]);

app.whenReady().then(async () => {
  if (!ownsProcessLock) return;
  try {
    const { LocalExchangeHost } = require("./generated/local-exchange-host.cjs");
    localExchange = await require("./ipc/local-exchange.cjs").register({
      handle,
      appData: app.getPath("userData"),
      ownsProcessLock,
      Host: LocalExchangeHost,
      getMainWindow: () => mainWindow,
    });
  } catch {
    // No payload, user directory, provider error or secret is logged.
    handle("local-exchange", async () => ({ ok: false, code: "UNAVAILABLE" }));
  }
  try {
    if (!localExchange) throw new Error("LOCAL_ASSET_UNAVAILABLE");
    const {
      LocalAssetCopyCoordinator,
      LocalAssetCopyFault,
    } = require("./generated/local-asset-copy.cjs");
    const { loadNativeLocalAsset } = require("./native-local-asset.cjs");
    const coordinator = new LocalAssetCopyCoordinator({
      host: localExchange.host,
      userData: app.getPath("userData"),
      native: loadNativeLocalAsset(),
      // Accepted bundled Runtime preview; never supplied by a renderer request.
      copyCapabilities: () =>
        new Map([
          ["vivi.cap.referencedAssets", 1],
          ["vivi.cap.maskInvert", 1],
        ]),
    });
    localAssetCopy = require("./ipc/local-asset-copy.cjs").register({
      handle,
      coordinator,
      Fault: LocalAssetCopyFault,
      getMainWindow: () => mainWindow,
    });
  } catch {
    handle("local-asset-copy", async () => ({
      ok: false,
      code: "LOCAL_ASSET_UNAVAILABLE",
      outcomeMayHaveCommitted: false,
    }));
  }
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(ALLOWED_PERMISSIONS.has(permission));
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
    return ALLOWED_PERMISSIONS.has(permission);
  });

  // ============================================================
  // Content-Security-Policy
  // ============================================================
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
  app.quit();
});

app.on("activate", () => {
  if (ownsProcessLock && BrowserWindow.getAllWindows().length === 0) createWindow();
});
