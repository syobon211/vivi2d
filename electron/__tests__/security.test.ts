import { describe, expect, it, vi } from "vitest";
import {
  TEST_FORBIDDEN_FILE_URL,
  TEST_FORBIDDEN_POSIX_PATH,
  TEST_FORBIDDEN_RELATIVE_DEEP_PATH,
  TEST_FORBIDDEN_RELATIVE_PATH,
  TEST_TMP_INDEX_FILE_URL,
  TEST_WINDOWS_SYSTEM_PATH,
  posixPath,
} from "../../src/test/path-fixtures";

// electron/security.cjs is CommonJS, so load it through require.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const security = require("../security.cjs");
const ipcContract = require("../ipc-contract.cjs");

const {
  createAllowlist,
  createContentSecurityPolicy,
  isTrustedNavigationUrl,
  assertAllowedPath,
  isSafeExternalUrl,
  validateBaseUrl,
  validatePromptId,
  validateComfyPathPart,
  validateComfyType,
  validateSafeRelativePath,
  assertWithinDirectory,
  assertTrustedSender,
  isLoopbackNetworkUrl,
  openExternalIfSafe,
  wrapHandler,
} = security;

const { hasIpcContract, listIpcChannels, validateIpcArgs } = ipcContract;

type FakeSender = { id: number };
type FakeEvent = { sender: FakeSender; senderFrame?: { parent: unknown } | null };

function createMainWindow(webContentsId: number, destroyed = false) {
  return {
    isDestroyed: () => destroyed,
    webContents: { id: webContentsId },
  };
}

describe("electron/security.cjs", () => {
  describe("createContentSecurityPolicy", () => {
    it("keeps production CSP restrictive", () => {
      const csp = createContentSecurityPolicy();
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("connect-src 'self'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("worker-src 'self' blob:");
      expect(csp).not.toContain("'unsafe-eval'");
      expect(csp).not.toContain("https:");
      expect(csp).not.toContain("localhost");
      expect(csp).not.toContain("127.0.0.1");
      expect(csp).not.toContain("ws://");
    });

    it("keeps dev-only eval explicit", () => {
      const csp = createContentSecurityPolicy({ isDev: true });
      expect(csp).toContain("'unsafe-eval'");
      expect(csp).toContain("http://localhost:*");
    });
  });

  describe("createAllowlist", () => {
    it("starts empty", () => {
      const allowlist = createAllowlist();
      expect(allowlist.size()).toBe(0);
    });

    it("stores resolved paths", () => {
      const allowlist = createAllowlist();
      const tmpFoo = posixPath("tmp", "foo");
      allowlist.add(tmpFoo);
      expect(allowlist.size()).toBe(1);
      expect(allowlist.has(tmpFoo)).toBe(true);
    });

    it("ignores empty and non-string values", () => {
      const allowlist = createAllowlist();
      allowlist.add("");
      allowlist.add(null);
      allowlist.add(undefined);
      allowlist.add(42);
      expect(allowlist.size()).toBe(0);
    });

    it("clears entries", () => {
      const allowlist = createAllowlist();
      allowlist.add(posixPath("a"));
      allowlist.add(posixPath("b"));
      allowlist.clear();
      expect(allowlist.size()).toBe(0);
    });

    it("returns false for invalid lookups", () => {
      const allowlist = createAllowlist();
      allowlist.add(posixPath("foo"));
      expect(allowlist.has(null)).toBe(false);
      expect(allowlist.has(123)).toBe(false);
    });
  });

  describe("isTrustedNavigationUrl", () => {
    it("allows only the exact app entry file URL", () => {
      expect(
        isTrustedNavigationUrl(TEST_TMP_INDEX_FILE_URL, {
          appEntryFileUrl: TEST_TMP_INDEX_FILE_URL,
        }),
      ).toBe(true);
      expect(
        isTrustedNavigationUrl(TEST_FORBIDDEN_FILE_URL, {
          appEntryFileUrl: TEST_TMP_INDEX_FILE_URL,
        }),
      ).toBe(false);
    });

    it("rejects file URLs when no app entry file URL is provided", () => {
      expect(isTrustedNavigationUrl(TEST_TMP_INDEX_FILE_URL)).toBe(false);
    });

    it("allows the exact dev server origin", () => {
      expect(
        isTrustedNavigationUrl("http://localhost:5173/editor", {
          devServerUrl: "http://localhost:5173",
        }),
      ).toBe(true);
    });

    it("rejects prefix-confusion hostnames", () => {
      expect(
        isTrustedNavigationUrl("http://localhost:5173.evil.test/editor", {
          devServerUrl: "http://localhost:5173",
        }),
      ).toBe(false);
    });

    it("rejects prefix-confusion usernames", () => {
      expect(
        isTrustedNavigationUrl("http://localhost:5173@evil.test/editor", {
          devServerUrl: "http://localhost:5173",
        }),
      ).toBe(false);
    });
  });

  describe("isSafeExternalUrl", () => {
    it("allows normal HTTPS URLs", () => {
      expect(isSafeExternalUrl("https://example.com/docs")).toBe(true);
    });

    it("rejects HTTP, custom protocols, and credential URLs", () => {
      expect(isSafeExternalUrl("http://example.com/docs")).toBe(false);
      expect(isSafeExternalUrl("javascript:alert(1)")).toBe(false);
      expect(isSafeExternalUrl("https://user@example.com/docs")).toBe(false);
      expect(isSafeExternalUrl("not a url")).toBe(false);
    });
  });

  describe("openExternalIfSafe", () => {
    it("opens only safe HTTPS URLs", () => {
      const shell = { openExternal: vi.fn() };
      expect(openExternalIfSafe(shell, "https://example.com/docs")).toBe(true);
      expect(shell.openExternal).toHaveBeenCalledWith("https://example.com/docs");

      expect(openExternalIfSafe(shell, "http://example.com/docs")).toBe(false);
      expect(openExternalIfSafe(shell, "javascript:alert(1)")).toBe(false);
      expect(shell.openExternal).toHaveBeenCalledTimes(1);
    });
  });

  describe("isLoopbackNetworkUrl", () => {
    it("detects loopback HTTP and WebSocket targets", () => {
      expect(isLoopbackNetworkUrl("http://127.0.0.1:8188/system_stats")).toBe(true);
      expect(isLoopbackNetworkUrl("ws://localhost:8001/socket")).toBe(true);
      expect(isLoopbackNetworkUrl("https://example.com")).toBe(false);
      expect(isLoopbackNetworkUrl(TEST_TMP_INDEX_FILE_URL)).toBe(false);
    });
  });

  describe("assertAllowedPath", () => {
    it("accepts allowed paths", () => {
      const allowlist = createAllowlist();
      const tmpOkPng = posixPath("tmp", "ok.png");
      allowlist.add(tmpOkPng);
      expect(assertAllowedPath(tmpOkPng, allowlist, "image")).toContain("ok.png");
    });

    it("rejects paths outside the allowlist", () => {
      const allowlist = createAllowlist();
      expect(() => assertAllowedPath(TEST_FORBIDDEN_POSIX_PATH, allowlist, "image")).toThrow();
    });
  });

  describe("validateBaseUrl", () => {
    it("allows localhost loopback URLs", () => {
      expect(validateBaseUrl("http://localhost:8188")).toBeDefined();
      expect(validateBaseUrl("http://127.0.0.1:8188")).toBeDefined();
      expect(validateBaseUrl("http://[::1]:8188")).toBeDefined();
    });

    it("rejects remote origins unless explicitly allowed", () => {
      expect(() => validateBaseUrl("https://example.com")).toThrow();
      expect(() => validateBaseUrl("http://192.168.1.10:8188")).toThrow();
      expect(validateBaseUrl("https://example.com", { allowRemote: true })).toBeDefined();
    });
  });

  describe("validatePromptId", () => {
    it("allows simple prompt identifiers", () => {
      expect(validatePromptId("abc123")).toBe("abc123");
      expect(validatePromptId("a-b_c-d")).toBe("a-b_c-d");
    });

    it("rejects invalid prompt identifiers", () => {
      expect(() => validatePromptId(TEST_FORBIDDEN_RELATIVE_PATH)).toThrow();
      expect(() => validatePromptId("a b c")).toThrow();
    });
  });

  describe("validateComfyPathPart", () => {
    it("accepts safe relative paths", () => {
      expect(validateComfyPathPart("output_0001.png", "filename")).toBe("output_0001.png");
      expect(validateComfyPathPart("sub/dir/img.png", "filename")).toBe("sub/dir/img.png");
    });

    it("rejects absolute paths and traversal", () => {
      expect(() => validateComfyPathPart(TEST_FORBIDDEN_POSIX_PATH, "filename")).toThrow();
      expect(() => validateComfyPathPart(TEST_WINDOWS_SYSTEM_PATH, "filename")).toThrow();
      expect(() => validateComfyPathPart("../secret.png", "filename")).toThrow();
    });
  });

  describe("validateComfyType", () => {
    it("accepts supported types", () => {
      expect(validateComfyType("output")).toBe("output");
      expect(validateComfyType("input")).toBe("input");
      expect(validateComfyType("temp")).toBe("temp");
    });

    it("defaults to output", () => {
      expect(validateComfyType(undefined)).toBe("output");
    });
  });

  describe("validateSafeRelativePath", () => {
    it("accepts nested relative export paths", () => {
      expect(validateSafeRelativePath("layers/body.png")).toBe("layers/body.png");
      expect(validateSafeRelativePath("clips/idle/frame-001.png")).toBe(
        "clips/idle/frame-001.png",
      );
    });

    it("rejects absolute, traversal, and reserved Windows paths", () => {
      expect(() => validateSafeRelativePath(TEST_FORBIDDEN_POSIX_PATH)).toThrow();
      expect(() => validateSafeRelativePath(TEST_WINDOWS_SYSTEM_PATH)).toThrow();
      expect(() => validateSafeRelativePath(TEST_FORBIDDEN_RELATIVE_DEEP_PATH)).toThrow();
      expect(() => validateSafeRelativePath("\\\\server\\share\\out.png")).toThrow();
      expect(() => validateSafeRelativePath("CON")).toThrow();
      expect(() => validateSafeRelativePath("layers/NUL.png")).toThrow();
      expect(() => validateSafeRelativePath("layers/name.")).toThrow();
    });
  });

  describe("assertWithinDirectory", () => {
    it("accepts children inside the base directory", () => {
      const path = require("node:path");
      const base = path.resolve(posixPath("tmp", "export"));
      expect(assertWithinDirectory(base, "out.png")).toBe(path.resolve(base, "out.png"));
    });

    it("rejects traversal out of the base directory", () => {
      const path = require("node:path");
      const base = path.resolve(posixPath("tmp", "export"));
      expect(() => assertWithinDirectory(base, TEST_FORBIDDEN_RELATIVE_DEEP_PATH)).toThrow();
    });

    it("rejects absolute paths before resolving", () => {
      const path = require("node:path");
      const base = path.resolve(posixPath("tmp", "export"));
      expect(() => assertWithinDirectory(base, TEST_WINDOWS_SYSTEM_PATH)).toThrow();
      expect(() => assertWithinDirectory(base, "\\\\server\\share\\out.png")).toThrow();
    });
  });

  describe("assertTrustedSender", () => {
    it("accepts the main frame sender", () => {
      const mainWindow = createMainWindow(42);
      const event: FakeEvent = { sender: { id: 42 }, senderFrame: null };
      expect(() => assertTrustedSender(event, mainWindow)).not.toThrow();
    });

    it("rejects sender id mismatches", () => {
      const mainWindow = createMainWindow(42);
      const event: FakeEvent = { sender: { id: 99 }, senderFrame: null };
      expect(() => assertTrustedSender(event, mainWindow)).toThrow();
    });

    it("rejects iframe senders", () => {
      const mainWindow = createMainWindow(42);
      const event: FakeEvent = {
        sender: { id: 42 },
        senderFrame: { parent: { id: "top" } },
      };
      expect(() => assertTrustedSender(event, mainWindow)).toThrow();
    });
  });

  describe("wrapHandler", () => {
    it("passes trusted sender events through to the handler", async () => {
      const mainWindow = createMainWindow(42);
      const handlers = new Map<string, (...args: unknown[]) => unknown>();
      const ipcMain = {
        handle(channel: string, handler: (...args: unknown[]) => unknown) {
          handlers.set(channel, handler);
        },
      };

      const register = wrapHandler(ipcMain, () => mainWindow);
      register("open-psd-file", () => "ok");

      const handler = handlers.get("open-psd-file");
      expect(handler).toBeDefined();
      await expect(handler?.({ sender: { id: 42 } })).resolves.toBe("ok");
    });

    it("rejects untrusted sender events", async () => {
      const mainWindow = createMainWindow(42);
      const handlers = new Map<string, (...args: unknown[]) => unknown>();
      const ipcMain = {
        handle(channel: string, handler: (...args: unknown[]) => unknown) {
          handlers.set(channel, handler);
        },
      };

      const register = wrapHandler(ipcMain, () => mainWindow);
      register("open-psd-file", () => "secret");

      const handler = handlers.get("open-psd-file");
      await expect(handler?.({ sender: { id: 999 } })).rejects.toThrow();
    });

    it("rejects channels without an IPC contract at registration", () => {
      const mainWindow = createMainWindow(42);
      const ipcMain = {
        handle: vi.fn(),
      };

      const register = wrapHandler(ipcMain, () => mainWindow);
      expect(() => register("test-channel", () => "secret")).toThrow(
        "missing a payload contract",
      );
      expect(ipcMain.handle).not.toHaveBeenCalled();
    });

    it("rejects invalid payloads before calling contracted handlers", async () => {
      const mainWindow = createMainWindow(42);
      const wrappedHandler = vi.fn();
      const handlers = new Map<string, (...args: unknown[]) => unknown>();
      const ipcMain = {
        handle(channel: string, handler: (...args: unknown[]) => unknown) {
          handlers.set(channel, handler);
        },
      };

      const register = wrapHandler(ipcMain, () => mainWindow);
      register("comfyui-ping", wrappedHandler);

      const handler = handlers.get("comfyui-ping");
      await expect(handler?.({ sender: { id: 42 } }, { baseUrl: 123 })).rejects.toThrow(
        "baseUrl must be a string",
      );
      expect(wrappedHandler).not.toHaveBeenCalled();
    });
  });

  describe("ipc-contract.cjs", () => {
    it("documents the public renderer-to-main channels", () => {
      expect(hasIpcContract("open-psd-file")).toBe(true);
      expect(hasIpcContract("save-file")).toBe(true);
      expect(hasIpcContract("comfyui-download")).toBe(true);
      expect(hasIpcContract("test-channel")).toBe(false);
      expect(listIpcChannels()).toContain("comfyui-download");
      expect(listIpcChannels()).toContain("open-psd-file");
    });

    it("accepts valid object payloads", () => {
      expect(() =>
        validateIpcArgs("save-file", [
          {
            data: "{}",
            binary: new ArrayBuffer(1),
            defaultName: "project.vivi",
          },
        ]),
      ).not.toThrow();

      expect(() =>
        validateIpcArgs("write-export-files", [
          {
            dirPath: "C:/exports",
            files: [{ path: "layers/body.png", content: "abc", isBlob: true }],
          },
        ]),
      ).not.toThrow();
    });

    it("rejects no-arg channels with unexpected payloads", () => {
      expect(() => validateIpcArgs("open-psd-file", [{ unexpected: true }])).toThrow(
        "expected no arguments",
      );
    });

    it("rejects unknown channels instead of failing open", () => {
      expect(() => validateIpcArgs("test-channel", [])).toThrow("has no payload contract");
    });

    it("rejects malformed object payloads", () => {
      expect(() => validateIpcArgs("save-file", [{ defaultName: "project.vivi" }])).toThrow(
        "data or binary is required",
      );
      expect(() =>
        validateIpcArgs("write-export-files", [
          { dirPath: "C:/exports", files: [{ path: "bad.bin", content: 123 }] },
        ]),
      ).toThrow("files[0].content must be a string");
      expect(() =>
        validateIpcArgs("comfyui-upload-image-buffer", [
          { baseUrl: "http://localhost:8188", data: "not-binary", filename: "input.png" },
        ]),
      ).toThrow("data must be binary data");
    });

    it("rejects unknown object fields and oversized payloads", () => {
      expect(() =>
        validateIpcArgs("save-file", [
          {
            data: "{}",
            defaultName: "project.vivi",
            debug: true,
          },
        ]),
      ).toThrow("unknown field debug");
      expect(() =>
        validateIpcArgs("write-export-files", [
          {
            dirPath: "C:/exports",
            files: new Array(513).fill(null).map((_, index) => ({
              path: `layers/${index}.txt`,
              content: "x",
            })),
          },
        ]),
      ).toThrow("count limit");
      expect(() =>
        validateIpcArgs("comfyui-upload-image-buffer", [
          {
            baseUrl: "http://localhost:8188",
            data: new ArrayBuffer(64 * 1024 * 1024 + 1),
            filename: "input.png",
          },
        ]),
      ).toThrow("byte limit");
    });
  });
});
