import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  TEST_FORBIDDEN_FILE_URL,
  TEST_FORBIDDEN_PROMPT_ID,
} from "../../src/test/path-fixtures";
import { expect, test } from "../fixtures";


interface WinAPI {
  electronAPI: {
    saveFile: (args: {
      data: string;
      defaultName: string;
      filePath?: string;
    }) => Promise<unknown>;
    comfyuiEnqueue: (args: { baseUrl: string; workflow: unknown }) => Promise<unknown>;
    comfyuiHistory: (args: { baseUrl: string; promptId: string }) => Promise<unknown>;
  };
}

test("任意のパス（allowlist未登録）は save-file で拒否される", async ({ window }) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vivi2d-e2e-ipc-"));
  const maliciousPath = path.join(tmpDir, "malicious.vivi");

  const result = await window.evaluate(async (filePath) => {
    try {
      await (window as unknown as WinAPI).electronAPI.saveFile({
        data: "{}",
        defaultName: "test.vivi",
        filePath,
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  }, maliciousPath);

  expect(result.ok).toBe(false);
  expect(result.message).toMatch(/Invalid file path/);
  expect(fs.existsSync(maliciousPath)).toBe(false);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("無効な ComfyUI baseUrl は validateBaseUrl で拒否される", async ({ window }) => {
  const urls = [TEST_FORBIDDEN_FILE_URL, "javascript:alert(1)", "ftp://evil"];
  for (const url of urls) {
    const result = await window.evaluate(async (u) => {
      try {
        await (window as unknown as WinAPI).electronAPI.comfyuiEnqueue({
          baseUrl: u,
          workflow: {},
        });
        return { ok: true };
      } catch (e) {
        return { ok: false, msg: e instanceof Error ? e.message : String(e) };
      }
    }, url);
    expect(result.ok).toBe(false);
    expect(result.msg).toMatch(/Invalid protocol|Invalid base URL/);
  }
});

test("不正な promptId （パストラバーサル）は validatePromptId で拒否される", async ({
  window,
}) => {
  const result = await window.evaluate(async (promptId) => {
    try {
      await (window as unknown as WinAPI).electronAPI.comfyuiHistory({
        baseUrl: "http://127.0.0.1:8188",
        promptId,
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, msg: e instanceof Error ? e.message : String(e) };
    }
  }, TEST_FORBIDDEN_PROMPT_ID);

  expect(result.ok).toBe(false);
  expect(result.msg).toMatch(/Invalid promptId/);
});

test("ComfyUI オフライン時 (到達不可URL) は comfyui-ping が { ok:false } を返す", async ({
  window,
}) => {
  const result = await window.evaluate(async () => {
    return await (
      window as unknown as WinAPI & {
        electronAPI: {
          comfyuiPing: (args: { baseUrl: string }) => Promise<{ ok: boolean }>;
        };
      }
    ).electronAPI.comfyuiPing({
      baseUrl: "http://127.0.0.1:1",
    });
  });

  expect(result.ok).toBe(false);
});

test("ComfyUI オフライン時 comfyui-enqueue はエラーを throw する", async ({ window }) => {
  const result = await window.evaluate(async () => {
    try {
      await (window as unknown as WinAPI).electronAPI.comfyuiEnqueue({
        baseUrl: "http://127.0.0.1:1",
        workflow: {},
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, msg: e instanceof Error ? e.message : String(e) };
    }
  });

  expect(result.ok).toBe(false);
  expect(result.msg?.length).toBeGreaterThan(0);
});
