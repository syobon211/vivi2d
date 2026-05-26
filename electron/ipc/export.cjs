const { dialog } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { assertAllowedPath, assertWithinDirectory } = require("../security.cjs");
const { MAX_EXPORT_FILES, MAX_EXPORT_TOTAL_BYTES } = require("../ipc-contract.cjs");

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
    const resolvedBase = assertAllowedPath(
      dirPath,
      allowlists.exportDirs,
      "selected by the export directory dialog",
    );
    let totalBytes = 0;
    for (const file of files) {
      const filePath = assertWithinDirectory(resolvedBase, file.path);
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      if (file.isBlob) {
        totalBytes += Buffer.byteLength(file.content, "utf8");
        if (totalBytes > MAX_EXPORT_TOTAL_BYTES) {
          throw new Error("Export payload exceeds the supported total byte limit.");
        }
        const buf = Buffer.from(file.content, "base64");
        fs.writeFileSync(filePath, buf);
      } else {
        totalBytes += Buffer.byteLength(file.content, "utf8");
        if (totalBytes > MAX_EXPORT_TOTAL_BYTES) {
          throw new Error("Export payload exceeds the supported total byte limit.");
        }
        fs.writeFileSync(filePath, file.content, "utf-8");
      }
    }
    return { success: true, count: files.length };
  });
}

module.exports = { register };
