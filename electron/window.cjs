
const { BrowserWindow, shell } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { isTrustedNavigationUrl, openExternalIfSafe } = require("./security.cjs");

function createMainWindow() {
  const isTest = process.env.NODE_ENV === "test";
  const mainWindow = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 1024,
    minHeight: 600,
    title: "Vivi2D Editor",
    backgroundColor: "#888898",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      ...(isTest ? { partition: `vivi2d-e2e-${Date.now()}` } : {}),
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  mainWindow.setMenuBarVisibility(false);

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.webContents.openDevTools();
  }

  attachNavigationSecurity(mainWindow);

  return mainWindow;
}

function attachNavigationSecurity(mainWindow) {
  const appEntryFileUrl = pathToFileURL(path.join(__dirname, "../dist/index.html")).href;
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const devServerUrl = process.env.VITE_DEV_SERVER_URL;
    if (!isTrustedNavigationUrl(url, { devServerUrl, appEntryFileUrl })) {
      event.preventDefault();
      openExternalIfSafe(shell, url);
    }
  });

  mainWindow.webContents.on("will-redirect", (event, url) => {
    const devServerUrl = process.env.VITE_DEV_SERVER_URL;
    if (!isTrustedNavigationUrl(url, { devServerUrl, appEntryFileUrl })) {
      event.preventDefault();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalIfSafe(shell, url);
    return { action: "deny" };
  });
}

module.exports = { createMainWindow };
