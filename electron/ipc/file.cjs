const { dialog } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { assertAllowedPath } = require("../security.cjs");
const { MAX_SAVE_BINARY_BYTES, MAX_SAVE_TEXT_BYTES } = require("../ipc-contract.cjs");

const MAX_VIVI_TEXT_FILE_BYTES = 128 * 1024 * 1024;
const MAX_VIVID_FILE_BYTES = 256 * 1024 * 1024;
const MAX_VIVIB_FILE_BYTES = 512 * 1024 * 1024;
const MAX_PSD_FILE_BYTES = 256 * 1024 * 1024;
const MAX_PNG_FILE_BYTES = 128 * 1024 * 1024;
const MAX_AUDIO_FILE_BYTES = 256 * 1024 * 1024;

function formatMegabytes(byteLength) {
  return `${(byteLength / 1024 / 1024).toFixed(1)}MB`;
}

function assertFileSizeWithinLimit(filePath, maxBytes, label, fsModule = fs) {
  const stats = fsModule.statSync(filePath);
  if (stats.size > maxBytes) {
    throw new Error(
      `${label} is too large (${formatMegabytes(stats.size)}, max ${formatMegabytes(maxBytes)}).`,
    );
  }
}

async function openPsdFile({ dialogModule = dialog, fsModule = fs, getMainWindow }) {
  const result = await dialogModule.showOpenDialog(getMainWindow(), {
    title: "Open PSD File",
    filters: [
      { name: "PSD Files", extensions: ["psd"] },
      { name: "All Files", extensions: ["*"] },
    ],
    properties: ["openFile"],
  });

  if (result.canceled || result.filePaths.length === 0) return null;

  const filePath = result.filePaths[0];
  assertFileSizeWithinLimit(filePath, MAX_PSD_FILE_BYTES, "PSD file", fsModule);
  const data = fsModule.readFileSync(filePath);
  return {
    buffer: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    fileName: path.basename(filePath),
  };
}

async function openVividFile({
  dialogModule = dialog,
  fsModule = fs,
  getMainWindow,
  allowlists,
}) {
  const result = await dialogModule.showOpenDialog(getMainWindow(), {
    title: "Open .vivid File",
    filters: [
      { name: "Vivi2D Bundle", extensions: ["vivid"] },
      { name: "All Files", extensions: ["*"] },
    ],
    properties: ["openFile"],
  });
  if (result.canceled || result.filePaths.length === 0) return null;

  const filePath = result.filePaths[0];
  const resolved = path.resolve(filePath);
  allowlists.opened.add(resolved);
  assertFileSizeWithinLimit(resolved, MAX_VIVID_FILE_BYTES, ".vivid file", fsModule);
  const buf = fsModule.readFileSync(resolved);
  return {
    binary: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    filePath: resolved,
  };
}

async function openViviFile({
  dialogModule = dialog,
  fsModule = fs,
  getMainWindow,
  allowlists,
}) {
  const result = await dialogModule.showOpenDialog(getMainWindow(), {
    title: "Open Project File",
    filters: [
      { name: "Vivi2D Project", extensions: ["vivi", "vivb"] },
      { name: "All Files", extensions: ["*"] },
    ],
    properties: ["openFile"],
  });

  if (result.canceled || result.filePaths.length === 0) return null;

  const filePath = result.filePaths[0];
  const resolved = path.resolve(filePath);
  allowlists.opened.add(resolved);
  allowlists.saved.add(resolved);
  const ext = path.extname(resolved).toLowerCase();

  if (ext === ".vivb") {
    assertFileSizeWithinLimit(resolved, MAX_VIVIB_FILE_BYTES, ".vivb file", fsModule);
    const buf = fsModule.readFileSync(resolved);
    return {
      binary: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
      filePath: resolved,
    };
  }

  assertFileSizeWithinLimit(resolved, MAX_VIVI_TEXT_FILE_BYTES, ".vivi file", fsModule);
  const data = fsModule.readFileSync(resolved, "utf-8");
  return { data, filePath: resolved };
}

function binaryByteLength(value) {
  if (value instanceof ArrayBuffer) return value.byteLength;
  if (ArrayBuffer.isView(value)) return value.byteLength;
  return 0;
}

function basenameFromAnySeparator(filePath) {
  return path.posix.basename(String(filePath).replaceAll("\\", "/"));
}

async function openImageFile({
  dialogModule = dialog,
  getMainWindow,
  allowlists,
  fsModule = fs,
}) {
  const result = await dialogModule.showOpenDialog(getMainWindow(), {
    title: "Open Image File",
    filters: [
      { name: "Image Files", extensions: ["png", "jpg", "jpeg", "webp"] },
      { name: "All Files", extensions: ["*"] },
    ],
    properties: ["openFile"],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const resolved = path.resolve(result.filePaths[0]);
  assertFileSizeWithinLimit(resolved, MAX_PNG_FILE_BYTES, "Image file", fsModule);
  allowlists.opened.add(resolved);
  return resolved;
}

async function openPngFile({
  dialogModule = dialog,
  getMainWindow,
  allowlists,
  fsModule = fs,
}) {
  const result = await dialogModule.showOpenDialog(getMainWindow(), {
    title: "Open PNG File",
    filters: [
      { name: "PNG Files", extensions: ["png"] },
      { name: "All Files", extensions: ["*"] },
    ],
    properties: ["openFile"],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const resolved = path.resolve(result.filePaths[0]);
  assertFileSizeWithinLimit(resolved, MAX_PNG_FILE_BYTES, "PNG file", fsModule);
  allowlists.opened.add(resolved);
  return resolved;
}

async function openPngFiles({
  dialogModule = dialog,
  getMainWindow,
  allowlists,
  fsModule = fs,
}) {
  const result = await dialogModule.showOpenDialog(getMainWindow(), {
    title: "Open PNG Files",
    filters: [
      { name: "PNG Files", extensions: ["png"] },
      { name: "All Files", extensions: ["*"] },
    ],
    properties: ["openFile", "multiSelections"],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const resolvedPaths = result.filePaths.map((filePath) => path.resolve(filePath));
  for (const resolved of resolvedPaths) {
    assertFileSizeWithinLimit(resolved, MAX_PNG_FILE_BYTES, "PNG file", fsModule);
    allowlists.opened.add(resolved);
  }
  return resolvedPaths;
}

function listFlatPngFiles(folderPath, fsModule = fs) {
  return fsModule
    .readdirSync(folderPath, { withFileTypes: true })
    .filter(
      (entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === ".png",
    )
    .map((entry) => path.resolve(folderPath, entry.name))
    .sort((a, b) => a.localeCompare(b));
}

async function openPngFolder({
  dialogModule = dialog,
  getMainWindow,
  allowlists,
  fsModule = fs,
}) {
  const result = await dialogModule.showOpenDialog(getMainWindow(), {
    title: "Open PNG Folder",
    properties: ["openDirectory"],
  });
  if (result.canceled || result.filePaths.length === 0) return null;

  const folderPath = path.resolve(result.filePaths[0]);
  const resolvedPaths = listFlatPngFiles(folderPath, fsModule);
  for (const resolved of resolvedPaths) {
    assertFileSizeWithinLimit(resolved, MAX_PNG_FILE_BYTES, "PNG file", fsModule);
    allowlists.opened.add(resolved);
  }
  return resolvedPaths;
}

async function openAudioFile({
  dialogModule = dialog,
  getMainWindow,
  allowlists,
  fsModule = fs,
}) {
  const result = await dialogModule.showOpenDialog(getMainWindow(), {
    title: "Open Audio File",
    filters: [
      { name: "Audio Files", extensions: ["wav", "mp3", "ogg", "m4a"] },
      { name: "All Files", extensions: ["*"] },
    ],
    properties: ["openFile"],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const resolved = path.resolve(result.filePaths[0]);
  assertFileSizeWithinLimit(resolved, MAX_AUDIO_FILE_BYTES, "Audio file", fsModule);
  allowlists.opened.add(resolved);
  return resolved;
}

function readAudioFile({ audioPath, allowlists, fsModule = fs }) {
  const resolved = assertAllowedPath(audioPath, allowlists.opened, "audio path");
  assertFileSizeWithinLimit(resolved, MAX_AUDIO_FILE_BYTES, "Audio file", fsModule);
  const data = fsModule.readFileSync(resolved);
  const stats = fsModule.statSync(resolved);
  return {
    buffer: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    filename: basenameFromAnySeparator(resolved),
    sizeBytes: stats.size,
    modifiedTimeMs: stats.mtimeMs,
  };
}

function register({ handle, getMainWindow, allowlists }) {
  handle("open-psd-file", async () => openPsdFile({ getMainWindow }));

  handle("save-file", async (_event, { data, binary, defaultName, filePath }) => {
    let targetPath = filePath;

    if (!targetPath) {
      const result = await dialog.showSaveDialog(getMainWindow(), {
        title: "Save Project File",
        defaultPath: defaultName,
        filters: [
          { name: "Vivi2D Project", extensions: ["vivi", "vivb"] },
          { name: "All Files", extensions: ["*"] },
        ],
      });

      if (result.canceled || !result.filePath) return null;
      targetPath = result.filePath;
    } else {
      targetPath = assertAllowedPath(targetPath, allowlists.saved, "save path");
    }

    const ext = path.extname(targetPath).toLowerCase();
    if (ext === ".vivb" && binary) {
      if (binaryByteLength(binary) > MAX_SAVE_BINARY_BYTES) {
        throw new Error("Project binary payload is too large.");
      }
      fs.writeFileSync(targetPath, Buffer.from(binary));
    } else {
      if (Buffer.byteLength(data ?? "", "utf8") > MAX_SAVE_TEXT_BYTES) {
        throw new Error("Project text payload is too large.");
      }
      fs.writeFileSync(targetPath, data, "utf-8");
    }
    const resolved = path.resolve(targetPath);
    allowlists.saved.add(resolved);
    return { filePath: resolved };
  });

  handle("save-vivid-file", async (_event, { binary, defaultName }) => {
    if (!(binary instanceof ArrayBuffer) && !ArrayBuffer.isView(binary)) {
      throw new Error("Invalid .vivid payload.");
    }
    if (binaryByteLength(binary) > MAX_SAVE_BINARY_BYTES) {
      throw new Error(".vivid payload is too large.");
    }
    const result = await dialog.showSaveDialog(getMainWindow(), {
      title: "Save .vivid File",
      defaultPath: defaultName,
      filters: [
        { name: "Vivi2D Bundle", extensions: ["vivid"] },
        { name: "All Files", extensions: ["*"] },
      ],
    });
    if (result.canceled || !result.filePath) return null;

    fs.writeFileSync(result.filePath, Buffer.from(binary));
    const resolved = path.resolve(result.filePath);
    allowlists.saved.add(resolved);
    return { filePath: resolved };
  });

  handle("open-vivid-file", async () => openVividFile({ getMainWindow, allowlists }));

  handle("open-vivi-file", async () => openViviFile({ getMainWindow, allowlists }));

  handle("open-image-file", async () => openImageFile({ getMainWindow, allowlists }));

  handle("open-png-file", async () => openPngFile({ getMainWindow, allowlists }));

  handle("open-png-files", async () => openPngFiles({ getMainWindow, allowlists }));

  handle("open-png-folder", async () => openPngFolder({ getMainWindow, allowlists }));

  handle("open-audio-file", async () => openAudioFile({ getMainWindow, allowlists }));

  handle("read-audio-file", async (_event, { audioPath }) =>
    readAudioFile({ audioPath, allowlists }),
  );
}

module.exports = {
  assertFileSizeWithinLimit,
  openAudioFile,
  openImageFile,
  openPngFile,
  openPngFiles,
  openPngFolder,
  openPsdFile,
  openVividFile,
  openViviFile,
  readAudioFile,
  register,
  listFlatPngFiles,
};
