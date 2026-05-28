import { beforeEach, describe, expect, it, vi } from "vitest";
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
} = require("../ipc/file.cjs");

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
