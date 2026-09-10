const { dialog } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { assertAllowedPath, assertWithinDirectory } = require("../security.cjs");
const { MAX_EXPORT_FILES, MAX_EXPORT_TOTAL_BYTES } = require("../ipc-contract.cjs");
const { writeFileAtomically } = require("../atomic-write.cjs");

function prepareExportFile(resolvedBase, relativePath) {
  const filePath = assertWithinDirectory(resolvedBase, relativePath);
  const segments = path.relative(resolvedBase, filePath).split(path.sep);
  let parent = resolvedBase;
  for (const segment of segments.slice(0, -1)) {
    parent = path.join(parent, segment);
    let stats;
    try {
      stats = fs.lstatSync(parent);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      fs.mkdirSync(parent);
      stats = fs.lstatSync(parent);
    }
    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      throw new Error("Export directories must not contain links.");
    }
  }
  try {
    const stats = fs.lstatSync(filePath);
    if (!stats.isFile() || stats.isSymbolicLink() || stats.nlink > 1) {
      throw new Error("Export files must be regular files without links.");
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return filePath;
}

function register({ handle, getMainWindow, allowlists }) {
  handle("select-export-directory", async () => {
    const result = await dialog.showOpenDialog(getMainWindow(), {
      title: "Select Export Directory",
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const resolved = path.resolve(result.filePaths[0]);
    allowlists.exportDirs.add(resolved);
    return resolved;
  });

  handle("write-export-files", async (_event, { dirPath, files }) => {
    if (!Array.isArray(files) || files.length > MAX_EXPORT_FILES) {
      throw new Error("Export file count exceeds the supported limit.");
    }
    const approvedBase = assertAllowedPath(
      dirPath,
      allowlists.exportDirs,
      "selected by the export directory dialog",
    );
    const resolvedBase = fs.realpathSync(approvedBase);
    let totalBytes = 0;
    for (const file of files) {
      const filePath = prepareExportFile(resolvedBase, file.path);
      if (file.isBlob) {
        totalBytes += Buffer.byteLength(file.content, "utf8");
        if (totalBytes > MAX_EXPORT_TOTAL_BYTES) {
          throw new Error("Export payload exceeds the supported total byte limit.");
        }
        const buf = Buffer.from(file.content, "base64");
        writeFileAtomically(filePath, buf);
      } else {
        totalBytes += Buffer.byteLength(file.content, "utf8");
        if (totalBytes > MAX_EXPORT_TOTAL_BYTES) {
          throw new Error("Export payload exceeds the supported total byte limit.");
        }
        writeFileAtomically(filePath, file.content);
      }
    }
    return { success: true, count: files.length };
  });
}

module.exports = { register };
