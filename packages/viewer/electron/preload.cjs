const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("viviAPI", {
  toggleAlwaysOnTop: () => ipcRenderer.invoke("toggle-always-on-top"),
  toggleFrame: () => ipcRenderer.invoke("toggle-frame"),
  setBackgroundMode: (mode) =>
    ipcRenderer.invoke("set-background-mode", mode),
  setWindowSize: (w, h) => ipcRenderer.invoke("set-window-size", w, h),
  viewerApi: {
    getStatus: () => ipcRenderer.invoke("viewer-api:get-status"),
    setEnabled: (payload) => ipcRenderer.invoke("viewer-api:set-enabled", payload),
    openPairingWindow: (payload) =>
      ipcRenderer.invoke("viewer-api:open-pairing-window", payload),
    closePairingWindow: () => ipcRenderer.invoke("viewer-api:close-pairing-window"),
    listGrants: () => ipcRenderer.invoke("viewer-api:list-grants"),
    approvePairing: (payload) =>
      ipcRenderer.invoke("viewer-api:approve-pairing", payload),
    revokeGrant: (payload) => ipcRenderer.invoke("viewer-api:revoke-grant", payload),
    rotateGrant: (payload) => ipcRenderer.invoke("viewer-api:rotate-grant", payload),
    publishEvent: (payload) => ipcRenderer.invoke("viewer-api:publish-event", payload),
    respondRendererRequest: (payload) =>
      ipcRenderer.invoke("viewer-api:renderer-response", payload),
    createPropAsset: (payload) =>
      ipcRenderer.invoke("viewer-api:create-prop-asset", payload),
    listPropAssets: (payload) =>
      ipcRenderer.invoke("viewer-api:list-prop-assets", payload),
    extendPropAsset: (payload) =>
      ipcRenderer.invoke("viewer-api:extend-prop-asset", payload),
    revokePropAsset: (payload) =>
      ipcRenderer.invoke("viewer-api:revoke-prop-asset", payload),
    onStatusChanged: (callback) => {
      const handler = (_, status) => callback(status);
      ipcRenderer.on("viewer-api:status-changed", handler);
      return () => ipcRenderer.removeListener("viewer-api:status-changed", handler);
    },
    onAssetStatusChanged: (callback) => {
      const handler = (_, payload) => callback(payload);
      ipcRenderer.on("viewer-api:asset-status-changed", handler);
      return () => ipcRenderer.removeListener("viewer-api:asset-status-changed", handler);
    },
    onRendererRequest: (callback) => {
      const handler = (_, payload) => callback(payload);
      ipcRenderer.on("viewer-api:renderer-request", handler);
      return () => ipcRenderer.removeListener("viewer-api:renderer-request", handler);
    },
  },
  onBackgroundModeChanged: (callback) => {
    const handler = (_, mode) => callback(mode);
    ipcRenderer.on("background-mode-changed", handler);
    return () => ipcRenderer.removeListener("background-mode-changed", handler);
  },
});
