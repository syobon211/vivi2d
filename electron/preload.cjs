const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  openPsdFile: () => ipcRenderer.invoke("open-psd-file"),
  saveFile: (args) => ipcRenderer.invoke("save-file", args),
  openViviFile: () => ipcRenderer.invoke("open-vivi-file"),
  saveVividFile: (args) => ipcRenderer.invoke("save-vivid-file", args),
  openVividFile: () => ipcRenderer.invoke("open-vivid-file"),
  selectExportDirectory: () => ipcRenderer.invoke("select-export-directory"),
  writeExportFiles: (args) => ipcRenderer.invoke("write-export-files", args),
  openImageFile: () => ipcRenderer.invoke("open-image-file"),
  openPngFile: () => ipcRenderer.invoke("open-png-file"),
  openPngFiles: () => ipcRenderer.invoke("open-png-files"),
  openPngFolder: () => ipcRenderer.invoke("open-png-folder"),
  openAudioFile: () => ipcRenderer.invoke("open-audio-file"),
  readAudioFile: (args) => ipcRenderer.invoke("read-audio-file", args),
  readImageFile: (args) => ipcRenderer.invoke("read-image-file", args),
  comfyuiPing: (args) => ipcRenderer.invoke("comfyui-ping", args),
  comfyuiUploadImage: (args) => ipcRenderer.invoke("comfyui-upload-image", args),
  comfyuiUploadImageBuffer: (args) =>
    ipcRenderer.invoke("comfyui-upload-image-buffer", args),
  comfyuiEnqueue: (args) => ipcRenderer.invoke("comfyui-enqueue", args),
  comfyuiHistory: (args) => ipcRenderer.invoke("comfyui-history", args),
  comfyuiNodeInfo: (args) => ipcRenderer.invoke("comfyui-node-info", args),
  comfyuiDownload: (args) => ipcRenderer.invoke("comfyui-download", args),
});
