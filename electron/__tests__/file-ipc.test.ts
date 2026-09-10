import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  TEST_TMP_AUDIO_PATH,
  TEST_TMP_HUGE_PNG_PATH,
  TEST_TMP_HUGE_PSD_PATH,
  TEST_TMP_HUGE_VIVI_PATH,
  TEST_TMP_HUGE_WAV_PATH,
  TEST_TMP_PARTS_DIR,
  windowsPath,
} from "../../src/test/path-fixtures";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  openAudioFile,
  openPngFile,
  openPngFolder,
  openPngFiles,
  openPsdFile,
  listFlatPngFiles,
  openViviFile,
  readAudioFile,
  register: registerFileHandlers,
} = require("../ipc/file.cjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { register: registerExportHandlers } = require("../ipc/export.cjs");

describe("privileged file writes", () => {
  let testDir: string;
  let handlers: Map<string, (...args: any[]) => Promise<unknown>>;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "vivi2d-file-writes-"));
    handlers = new Map();
    const context = {
      handle: (channel: string, handler: (...args: any[]) => Promise<unknown>) => handlers.set(channel, handler),
      getMainWindow: () => ({}),
      allowlists: { saved: { has: () => true, add: vi.fn() }, exportDirs: { has: () => true } },
    };
    registerFileHandlers(context);
    registerExportHandlers(context);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (path.dirname(testDir) !== path.resolve(os.tmpdir())) throw new Error("Invalid test directory");
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it.each(["vivi", "vivb"])("keeps the original %s file when a write fails partway through", async (extension) => {
    const target = path.join(testDir, `project.${extension}`);
    fs.writeFileSync(target, "original");
    const realWrite = fs.writeFileSync.bind(fs);
    vi.spyOn(fs, "writeFileSync").mockImplementation((file, _data, options) => {
      realWrite(file, "partial", options);
      throw new Error("synthetic disk full");
    });
    await expect(handlers.get("save-file")!({}, {
      filePath: target, data: "replacement", binary: new Uint8Array([1, 2]).buffer,
    })).rejects.toThrow();
    expect(fs.readFileSync(target, "utf8")).toBe("original");
    expect(fs.readdirSync(testDir)).toEqual([`project.${extension}`]);
  });

  it.each(["junction", "hardlink"])("rejects an export through a pre-existing %s", async (kind) => {
    const exportDir = path.join(testDir, "export");
    const outsideDir = path.join(testDir, "outside");
    fs.mkdirSync(exportDir);
    fs.mkdirSync(outsideDir);
    const target = path.join(outsideDir, "target.txt");
    fs.writeFileSync(target, "original");
    let relativePath: string;
    if (kind === "junction") {
      fs.symlinkSync(outsideDir, path.join(exportDir, "linked"), process.platform === "win32" ? "junction" : "dir");
      relativePath = "linked/target.txt";
    } else {
      fs.linkSync(target, path.join(exportDir, "target.txt"));
      relativePath = "target.txt";
    }
    await expect(handlers.get("write-export-files")!({}, {
      dirPath: exportDir, files: [{ path: relativePath, content: "replacement" }],
    })).rejects.toThrow();
    expect(fs.readFileSync(target, "utf8")).toBe("original");
  });

  it.each(["fsyncSync", "renameSync"] as const)("keeps the original file if %s fails", async (operation) => {
    const target = path.join(testDir, "project.vivi");
    fs.writeFileSync(target, "original");
    vi.spyOn(fs, operation).mockImplementation(() => { throw new Error("synthetic-private-file-detail"); });
    await expect(handlers.get("save-file")!({}, {
      filePath: target, data: "replacement",
    })).rejects.toThrow("Unable to write the selected file.");
    expect(fs.readFileSync(target, "utf8")).toBe("original");
    expect(fs.readdirSync(testDir)).toEqual(["project.vivi"]);
  });

  it("rejects a symlinked save target without replacing or modifying it", async ({ skip }) => {
    const target = path.join(testDir, "original.vivi");
    const link = path.join(testDir, "linked.vivi");
    fs.writeFileSync(target, "original");
    try {
      fs.symlinkSync(target, link, "file");
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (process.platform === "win32" && (code === "EPERM" || code === "EACCES")) {
        skip("Windows file-symlink privilege is unavailable");
        return;
      }
      throw error;
    }
    await expect(handlers.get("save-file")!({}, {
      filePath: link, data: "replacement",
    })).rejects.toThrow("Unable to write the selected file.");
    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
    expect(fs.readFileSync(target, "utf8")).toBe("original");
    expect(fs.readdirSync(testDir).sort()).toEqual(["linked.vivi", "original.vivi"]);
  });

  it("saves the exact bytes of a binary view, including its offset", async () => {
    const target = path.join(testDir, "project.vivb");
    const bytes = new Uint8Array([9, 1, 2, 9]);
    await handlers.get("save-file")!({}, {
      filePath: target, binary: new DataView(bytes.buffer, 1, 2),
    });
    expect([...fs.readFileSync(target)]).toEqual([1, 2]);
    expect(fs.readdirSync(testDir)).toEqual(["project.vivb"]);
  });

  it("writes ordinary nested text and binary exports", async () => {
    await handlers.get("write-export-files")!({}, {
      dirPath: testDir,
      files: [
        { path: "nested/project.json", content: "{}" },
        { path: "nested/texture.png", content: "AQI=", isBlob: true },
      ],
    });
    expect(fs.readFileSync(path.join(testDir, "nested/project.json"), "utf8")).toBe("{}");
    expect([...fs.readFileSync(path.join(testDir, "nested/texture.png"))]).toEqual([1, 2]);
  });
});

describe("electron/ipc/file.cjs", () => {
  let dialogModule: { showOpenDialog: ReturnType<typeof vi.fn> };
  let fsModule: {
    statSync: ReturnType<typeof vi.fn>;
    readFileSync: ReturnType<typeof vi.fn>;
    readdirSync: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    dialogModule = { showOpenDialog: vi.fn() };
    fsModule = {
      statSync: vi.fn(),
      readFileSync: vi.fn(),
      readdirSync: vi.fn(),
    };
  });

  it("rejects oversized .vivi files before reading them", async () => {
    dialogModule.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [TEST_TMP_HUGE_VIVI_PATH],
    });
    fsModule.statSync.mockReturnValue({ size: 129 * 1024 * 1024 });

    await expect(
      openViviFile({
        dialogModule,
        fsModule,
        getMainWindow: () => ({}),
        allowlists: {
          opened: { add: vi.fn() },
          saved: { add: vi.fn() },
        },
      }),
    ).rejects.toThrow(".vivi file is too large");

    expect(fsModule.readFileSync).not.toHaveBeenCalled();
  });

  it("rejects oversized PSD files before reading them", async () => {
    dialogModule.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [TEST_TMP_HUGE_PSD_PATH],
    });
    fsModule.statSync.mockReturnValue({ size: 257 * 1024 * 1024 });

    await expect(
      openPsdFile({
        dialogModule,
        fsModule,
        getMainWindow: () => ({}),
      }),
    ).rejects.toThrow("PSD file is too large");

    expect(fsModule.readFileSync).not.toHaveBeenCalled();
  });

  it("uses a PNG-only picker for manual image import", async () => {
    dialogModule.showOpenDialog.mockResolvedValue({
      canceled: true,
      filePaths: [],
    });

    await openPngFile({
      dialogModule,
      fsModule,
      getMainWindow: () => ({}),
      allowlists: {
        opened: { add: vi.fn() },
      },
    });

    expect(dialogModule.showOpenDialog).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        title: "Open PNG File",
        filters: expect.arrayContaining([
          expect.objectContaining({ name: "PNG Files", extensions: ["png"] }),
        ]),
      }),
    );
  });

  it("rejects oversized PNG files before opening them", async () => {
    dialogModule.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [TEST_TMP_HUGE_PNG_PATH],
    });
    fsModule.statSync.mockReturnValue({ size: 129 * 1024 * 1024 });

    await expect(
      openPngFile({
        dialogModule,
        fsModule,
        getMainWindow: () => ({}),
        allowlists: {
          opened: { add: vi.fn() },
        },
      }),
    ).rejects.toThrow("PNG file is too large");
  });

  it("uses a PNG-only multi-picker for batch manual image import", async () => {
    dialogModule.showOpenDialog.mockResolvedValue({
      canceled: true,
      filePaths: [],
    });

    await openPngFiles({
      dialogModule,
      fsModule,
      getMainWindow: () => ({}),
      allowlists: {
        opened: { add: vi.fn() },
      },
    });

    expect(dialogModule.showOpenDialog).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        title: "Open PNG Files",
        properties: expect.arrayContaining(["openFile", "multiSelections"]),
        filters: expect.arrayContaining([
          expect.objectContaining({ name: "PNG Files", extensions: ["png"] }),
        ]),
      }),
    );
  });

  it("uses a directory picker for folder-based PNG import", async () => {
    dialogModule.showOpenDialog.mockResolvedValue({
      canceled: true,
      filePaths: [],
    });

    await openPngFolder({
      dialogModule,
      fsModule,
      getMainWindow: () => ({}),
      allowlists: {
        opened: { add: vi.fn() },
      },
    });

    expect(dialogModule.showOpenDialog).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        title: "Open PNG Folder",
        properties: ["openDirectory"],
      }),
    );
  });

  it("collects top-level PNG files in deterministic order", () => {
    fsModule.readdirSync = vi.fn().mockReturnValue([
      { name: "b.png", isFile: () => true },
      { name: "nested", isFile: () => false },
      { name: "a.png", isFile: () => true },
      { name: "ignore.webp", isFile: () => true },
    ]);

    expect(listFlatPngFiles(TEST_TMP_PARTS_DIR, fsModule)).toEqual([
      path.resolve(TEST_TMP_PARTS_DIR, "a.png"),
      path.resolve(TEST_TMP_PARTS_DIR, "b.png"),
    ]);
  });

  it("rejects oversized audio files before opening them", async () => {
    dialogModule.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [TEST_TMP_HUGE_WAV_PATH],
    });
    fsModule.statSync.mockReturnValue({ size: 257 * 1024 * 1024 });

    await expect(
      openAudioFile({
        dialogModule,
        fsModule,
        getMainWindow: () => ({}),
        allowlists: {
          opened: { add: vi.fn() },
        },
      }),
    ).rejects.toThrow("Audio file is too large");
  });

  it("reads an allowlisted audio file as an ArrayBuffer payload", () => {
    const buffer = Buffer.from([1, 2, 3, 4]);
    fsModule.statSync.mockReturnValue({ size: buffer.byteLength, mtimeMs: 1234 });
    fsModule.readFileSync.mockReturnValue(buffer);

    const result = readAudioFile({
      audioPath: TEST_TMP_AUDIO_PATH,
      allowlists: {
        opened: { has: vi.fn(() => true) },
      },
      fsModule,
    });

    expect(result.filename).toBe("voice.wav");
    expect(result.sizeBytes).toBe(4);
    expect(result.modifiedTimeMs).toBe(1234);
    expect(result.buffer).toBeInstanceOf(ArrayBuffer);
  });
});
