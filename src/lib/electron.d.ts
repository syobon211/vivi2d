interface ElectronAPI {
  localAssetCopy: (
    args: import("./local-asset-copy").LocalAssetCopyCommand,
  ) => Promise<import("./local-asset-copy").LocalAssetCopyResponse>;
  localExchange: (
    args: Record<string, unknown>,
  ) => Promise<{ ok: true; value: unknown } | { ok: false; code: string }>;
  onLocalExchangeAbort: (
    callback: (message: { cellId: string; attempt: number }) => void,
  ) => () => void;
  openPsdFile: () => Promise<{ buffer: ArrayBuffer; fileName: string } | null>;
  saveFile: (args: {
    data?: string;
    binary?: ArrayBuffer;
    defaultName: string;
    filePath?: string;
    format?: "project-v11-json";
    preserveSourcePaths?: string[];
  }) => Promise<{ filePath: string } | null>;
  openViviFile: () => Promise<
    | { data: string; filePath: string; utf8Bytes?: ArrayBuffer }
    | { binary: ArrayBuffer; filePath: string }
    | null
  >;

  saveVividFile: (args: {
    binary: ArrayBuffer;
    defaultName: string;
  }) => Promise<{ filePath: string } | null>;

  openVividFile: () => Promise<{ binary: ArrayBuffer; filePath: string } | null>;
  selectExportDirectory: () => Promise<string | null>;
  writeExportFiles: (args: {
    dirPath: string;
    files: { path: string; content: string; isBlob: boolean }[];
  }) => Promise<{ success: boolean; count: number }>;
  openImageFile: () => Promise<string | null>;
  openPngFile: () => Promise<string | null>;
  openPngFiles: () => Promise<string[] | null>;
  openPngFolder: () => Promise<string[] | null>;
  openAudioFile: () => Promise<string | null>;
  readAudioFile: (args: { audioPath: string }) => Promise<{
    buffer: ArrayBuffer;
    filename: string;
    sizeBytes: number;
    modifiedTimeMs: number;
  }>;
  readImageFile: (args: {
    imagePath: string;
  }) => Promise<{ buffer: ArrayBuffer; filename: string }>;
  comfyuiPing: (args: { baseUrl: string }) => Promise<{ ok: boolean }>;
  comfyuiUploadImageBuffer: (args: {
    baseUrl: string;
    data: ArrayBuffer;
    filename: string;
  }) => Promise<{ name: string }>;
  comfyuiEnqueue: (args: {
    baseUrl: string;
    workflow: Record<string, unknown>;
  }) => Promise<{ prompt_id: string; number: number }>;
  comfyuiHistory: (args: {
    baseUrl: string;
    promptId: string;
  }) => Promise<Record<string, unknown> | null>;
  comfyuiNodeInfo: (args: {
    baseUrl: string;
    nodeType: string;
  }) => Promise<Record<string, unknown> | null>;
  comfyuiDownload: (args: {
    baseUrl: string;
    filename: string;
    subfolder?: string;
    type?: string;
    maxBytes?: number;
  }) => Promise<ArrayBuffer>;
}

interface Window {
  electronAPI: ElectronAPI;
}
