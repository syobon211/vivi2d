import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ElectronApplication, Page } from "playwright";
import { expect, test } from "../fixtures";
import { mockOpenVivi, mockSaveDialog } from "../helpers/dialog-mock";
import { addParameter, clickFileMenuItem } from "../helpers/operations";

const MAGIC_VIVB = [0x56, 0x49, 0x56, 0x42];
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const HEADER_LENGTH = 9;
const FORMAT_VERSION = 1;

let tmpDir: string;

test.beforeEach(async ({ window }) => {
  await window.setViewportSize({ width: 1920, height: 1080 });
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vivi2d-e2e-vivb-"));
});

test.afterEach(async () => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function saveTo(app: ElectronApplication, window: Page, savePath: string) {
  await mockSaveDialog(app, savePath);
  await clickFileMenuItem(window, "Save As");
  await expect(async () => {
    expect(fs.existsSync(savePath)).toBe(true);
  }).toPass({ timeout: 10_000 });
}

async function openFrom(app: ElectronApplication, window: Page, openPath: string) {
  await mockOpenVivi(app, openPath);
  await clickFileMenuItem(window, "Open");
  await expect(window.getByText("Background")).toBeVisible({ timeout: 10_000 });
}

function readU32LE(buf: Buffer, offset: number) {
  return buf.readUInt32LE(offset);
}

function startsWith(buf: Buffer, offset: number, pattern: number[]) {
  if (offset + pattern.length > buf.length) return false;
  return pattern.every((byte, index) => buf[offset + index] === byte);
}

test("writes a valid .vivb header", async ({ app, window, loadTestPsd }) => {
  await loadTestPsd();
  const savePath = path.join(tmpDir, "header.vivb");
  await saveTo(app, window, savePath);

  const buf = fs.readFileSync(savePath);
  expect(buf.length).toBeGreaterThan(HEADER_LENGTH);
  expect(startsWith(buf, 0, MAGIC_VIVB)).toBe(true);
  expect(buf[4]).toBe(FORMAT_VERSION);

  const metaLen = readU32LE(buf, 5);
  expect(metaLen).toBeGreaterThan(0);
  expect(HEADER_LENGTH + metaLen).toBeLessThanOrEqual(buf.length);
});

test("stores PNG chunks after the metadata block", async ({
  app,
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();
  const savePath = path.join(tmpDir, "chunks.vivb");
  await saveTo(app, window, savePath);

  const buf = fs.readFileSync(savePath);
  const metaLen = readU32LE(buf, 5);
  let cursor = HEADER_LENGTH + metaLen;
  let chunkCount = 0;

  while (cursor < buf.length) {
    const chunkLen = readU32LE(buf, cursor);
    cursor += 4;

    expect(chunkLen).toBeGreaterThan(0);
    expect(cursor + chunkLen).toBeLessThanOrEqual(buf.length);
    expect(startsWith(buf, cursor, PNG_SIGNATURE)).toBe(true);

    cursor += chunkLen;
    chunkCount++;
    expect(chunkCount).toBeLessThan(1000);
  }

  expect(chunkCount).toBeGreaterThanOrEqual(1);
  expect(cursor).toBe(buf.length);
});

test("round-trips through save -> open -> save without structural drift", async ({
  app,
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();
  await addParameter(window, "Roundtrip");

  const firstPath = path.join(tmpDir, "first.vivb");
  await saveTo(app, window, firstPath);

  await clickFileMenuItem(window, "Close");
  await expect(window.locator(".workspace")).toBeVisible({ timeout: 5_000 });
  await openFrom(app, window, firstPath);

  const secondPath = path.join(tmpDir, "second.vivb");
  await saveTo(app, window, secondPath);

  const buf1 = fs.readFileSync(firstPath);
  const buf2 = fs.readFileSync(secondPath);

  expect(buf1.subarray(0, 5).equals(buf2.subarray(0, 5))).toBe(true);

  const countChunks = (buf: Buffer) => {
    const metaLen = readU32LE(buf, 5);
    let cursor = HEADER_LENGTH + metaLen;
    let count = 0;
    while (cursor < buf.length) {
      const len = readU32LE(buf, cursor);
      cursor += 4 + len;
      count++;
    }
    return count;
  };

  expect(countChunks(buf1)).toBe(countChunks(buf2));

  const meta1 = readU32LE(buf1, 5);
  const meta2 = readU32LE(buf2, 5);
  const diffRatio = Math.abs(meta1 - meta2) / Math.max(meta1, meta2);
  expect(diffRatio).toBeLessThan(0.05);
});

test("preserves UI-visible content after a .vivb round-trip", async ({
  app,
  window,
  loadTestPsd,
}) => {
  await loadTestPsd();
  await addParameter(window, "Roundtrip Param");

  const firstPath = path.join(tmpDir, "rt1.vivb");
  await saveTo(app, window, firstPath);

  await clickFileMenuItem(window, "Close");
  await expect(window.locator(".workspace")).toBeVisible({ timeout: 5_000 });
  await openFrom(app, window, firstPath);

  const secondPath = path.join(tmpDir, "rt2.vivb");
  await saveTo(app, window, secondPath);

  await clickFileMenuItem(window, "Close");
  await expect(window.locator(".workspace")).toBeVisible({ timeout: 5_000 });
  await openFrom(app, window, secondPath);

  await expect(window.getByText("Background")).toBeVisible();
  await expect(window.getByText("Red Circle")).toBeVisible();
  await expect(
    window.locator(".parameter-name", { hasText: "Roundtrip Param" }),
  ).toBeVisible();
});
