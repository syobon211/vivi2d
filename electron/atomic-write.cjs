const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

// Publish one complete file only after its temporary sibling has been flushed.
// This preserves the old file on write/flush/rename failure, not an entire
// multi-file export transaction or directory durability across power loss.
function writeFileAtomically(filePath, data) {
  const temporaryPath = path.join(
    path.dirname(filePath),
    `.vivi2d-${crypto.randomBytes(16).toString("hex")}.tmp`,
  );
  let fd;
  let created = false;
  try {
    let mode = 0o600;
    try {
      const existing = fs.lstatSync(filePath);
      if (!existing.isFile()) throw new Error("Not a regular file");
      mode = existing.mode & 0o777;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    fd = fs.openSync(temporaryPath, "wx", mode);
    created = true;
    fs.writeFileSync(fd, data);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(temporaryPath, filePath);
  } catch {
    // OS exceptions can include the user's absolute path.
    throw new Error("Unable to write the selected file.");
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {}
    }
    if (created) {
      try {
        fs.unlinkSync(temporaryPath);
      } catch {}
    }
  }
}

module.exports = { writeFileAtomically };
