const { app, BrowserWindow, ipcMain, session } = require("electron");
const {
  createAllowlist,
  createContentSecurityPolicy,
  isLoopbackNetworkUrl,
  wrapHandler,
} = require("./security.cjs");
const { createMainWindow } = require("./window.cjs");

let mainWindow = null;

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

app.whenReady().then(() => {
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
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
